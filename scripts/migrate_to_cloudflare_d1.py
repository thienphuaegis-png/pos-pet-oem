"""Công cụ xuất và đồng bộ toàn bộ dữ liệu SQLite (data/pos.db) lên Cloudflare D1.

Hỗ trợ 2 chế độ:
1. Xuất ra bộ file SQL chuẩn D1 (chia nhỏ từng phần an toàn dưới ngưỡng giới hạn của wrangler d1 execute):
   .venv/Scripts/python.exe scripts/migrate_to_cloudflare_d1.py --export-dir deploy/d1_export
2. Đẩy trực tiếp lên Cloudflare D1 qua Worker Bridge hoặc REST API:
   .venv/Scripts/python.exe scripts/migrate_to_cloudflare_d1.py --push
"""
import argparse
import os
import sqlite3
import sys

ROOT_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if ROOT_DIR not in sys.path:
    sys.path.insert(0, ROOT_DIR)

from database import get_db_path, D1ConnectionWrapper


def sql_literal(val):
    if val is None:
        return "NULL"
    if isinstance(val, bool):
        return "1" if val else "0"
    if isinstance(val, (int, float)):
        return repr(val)
    if isinstance(val, (bytes, bytearray, memoryview)):
        return "X'" + bytes(val).hex() + "'"
    s = str(val).replace("'", "''")
    return f"'{s}'"


def _toposort_tables(cur, tables_rows):
    """Sắp xếp thứ tự bảng sao cho bảng cha (được tham chiếu khóa ngoại) luôn được tạo và nạp trước bảng con."""
    sql_by_name = {name: sql for name, sql in tables_rows}
    all_names = set(sql_by_name.keys())
    deps = {}
    for name in all_names:
        cur.execute(f'PRAGMA foreign_key_list("{name}")')
        deps[name] = {r[2] for r in cur.fetchall() if r[2] != name and r[2] in all_names}

    ordered = []
    remaining = set(all_names)
    while remaining:
        ready = sorted([t for t in remaining if not (deps[t] & remaining)])
        if not ready:
            ready = sorted(remaining)
        ordered.extend(ready)
        remaining -= set(ready)
    return [(t, sql_by_name[t]) for t in ordered]


def export_sqlite_to_d1_sql(sqlite_path: str, out_dir: str, max_stmts_per_file: int = 400):
    os.makedirs(out_dir, exist_ok=True)
    # Xóa các file .sql cũ trong thư mục xuất
    for fname in os.listdir(out_dir):
        if fname.endswith(".sql"):
            os.remove(os.path.join(out_dir, fname))

    conn = sqlite3.connect(f"file:{sqlite_path}?mode=ro", uri=True)
    cur = conn.cursor()

    cur.execute(
        "SELECT name, sql FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name"
    )
    tables = _toposort_tables(cur, cur.fetchall())

    cur.execute(
        "SELECT name, sql FROM sqlite_master WHERE type='index' AND sql IS NOT NULL AND name NOT LIKE 'sqlite_%' ORDER BY name"
    )
    indexes = cur.fetchall()

    schema_file = os.path.join(out_dir, "00_schema.sql")
    with open(schema_file, "w", encoding="utf-8") as f:
        f.write("-- Cloudflare D1 Schema Export\n")
        for tbl_name, create_sql in tables:
            if not create_sql:
                continue
            clean_sql = create_sql.strip().rstrip(";")
            if clean_sql.upper().startswith("CREATE TABLE ") and "IF NOT EXISTS" not in clean_sql.upper()[:35]:
                clean_sql = "CREATE TABLE IF NOT EXISTS " + clean_sql[len("CREATE TABLE "):]
            f.write(f"{clean_sql};\n\n")

        for idx_name, idx_sql in indexes:
            clean_idx = idx_sql.strip().rstrip(";")
            if clean_idx.upper().startswith("CREATE INDEX ") and "IF NOT EXISTS" not in clean_idx.upper()[:35]:
                clean_idx = "CREATE INDEX IF NOT EXISTS " + clean_idx[len("CREATE INDEX "):]
            elif clean_idx.upper().startswith("CREATE UNIQUE INDEX ") and "IF NOT EXISTS" not in clean_idx.upper()[:40]:
                clean_idx = "CREATE UNIQUE INDEX IF NOT EXISTS " + clean_idx[len("CREATE UNIQUE INDEX "):]
            f.write(f"{clean_idx};\n")

    part_idx = 1
    stmt_count = 0
    total_rows = 0
    data_files = []
    cur_file = None

    def open_next_part():
        nonlocal part_idx, stmt_count, cur_file
        if cur_file:
            cur_file.close()
        path = os.path.join(out_dir, f"01_data_part_{part_idx:03d}.sql")
        data_files.append(path)
        cur_file = open(path, "w", encoding="utf-8")
        cur_file.write(f"-- Cloudflare D1 Data Part {part_idx}\n")
        part_idx += 1
        stmt_count = 0

    for tbl_name, _ in tables:
        cur.execute(f'PRAGMA table_info("{tbl_name}")')
        cols = [r[1] for r in cur.fetchall()]
        if not cols:
            continue
        col_list = ", ".join(f'"{c}"' for c in cols)
        cur.execute(f'SELECT * FROM "{tbl_name}"')
        rows = cur.fetchall()
        if not rows:
            continue
        for r in rows:
            if cur_file is None or stmt_count >= max_stmts_per_file:
                open_next_part()
            vals = ", ".join(sql_literal(v) for v in r)
            cur_file.write(f'INSERT OR REPLACE INTO "{tbl_name}" ({col_list}) VALUES ({vals});\n')
            stmt_count += 1
            total_rows += 1

    if cur_file:
        cur_file.close()

    conn.close()
    return {
        "tables_count": len(tables),
        "indexes_count": len(indexes),
        "total_rows": total_rows,
        "schema_file": schema_file,
        "data_files": data_files,
    }


SYSTEM_SEED_TABLES = {
    "staff",
    "warehouses",
    "payment_accounts",
    "settings",
    "role_permissions",
    "cashbook_categories",
    "customer_segments",
    "price_lists",
    "hrm_work_blocks",
    "hrm_holidays",
    "spa_commission_rules",
}


def push_sqlite_to_d1(sqlite_path: str, d1_conn: D1ConnectionWrapper, batch_size: int = 200, schema_only: bool = False):
    conn = sqlite3.connect(f"file:{sqlite_path}?mode=ro", uri=True)
    cur = conn.cursor()

    cur.execute(
        "SELECT name, sql FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name"
    )
    tables = _toposort_tables(cur, cur.fetchall())

    # 1. Tạo bảng
    schema_stmts = []
    for tbl_name, create_sql in tables:
        if not create_sql:
            continue
        clean_sql = create_sql.strip().rstrip(";")
        if clean_sql.upper().startswith("CREATE TABLE ") and "IF NOT EXISTS" not in clean_sql.upper()[:35]:
            clean_sql = "CREATE TABLE IF NOT EXISTS " + clean_sql[len("CREATE TABLE "):]
        schema_stmts.append((clean_sql, []))

    for i in range(0, len(schema_stmts), 15):
        d1_conn._send_batch(schema_stmts[i:i + 15])

    # 2. Đẩy dữ liệu từng bảng bằng multi-row VALUES (tối đa 45KB / câu lệnh để đạt tốc độ cao nhất trên D1)
    pushed_rows = 0
    for tbl_name, _ in tables:
        if schema_only and tbl_name not in SYSTEM_SEED_TABLES:
            continue
        cur.execute(f'PRAGMA table_info("{tbl_name}")')
        cols = [r[1] for r in cur.fetchall()]
        if not cols:
            continue
        col_list = ", ".join(f'"{c}"' for c in cols)
        prefix_sql = f'INSERT OR REPLACE INTO "{tbl_name}" ({col_list}) VALUES '

        cur.execute(f'SELECT * FROM "{tbl_name}"')
        rows = cur.fetchall()
        if not rows:
            continue

        value_tuples = []
        current_bytes = len(prefix_sql)
        for r in rows:
            tup_str = "(" + ", ".join(sql_literal(v) for v in r) + ")"
            tup_bytes = len(tup_str.encode("utf-8"))
            if value_tuples and (len(value_tuples) >= batch_size or current_bytes + tup_bytes > 45_000):
                full_sql = "PRAGMA defer_foreign_keys = ON;\n" + prefix_sql + ",\n".join(value_tuples) + ";"
                d1_conn._send_query(full_sql, [])
                pushed_rows += len(value_tuples)
                value_tuples = []
                current_bytes = len(prefix_sql)
            value_tuples.append(tup_str)
            current_bytes += tup_bytes + 2

        if value_tuples:
            full_sql = "PRAGMA defer_foreign_keys = ON;\n" + prefix_sql + ",\n".join(value_tuples) + ";"
            d1_conn._send_query(full_sql, [])
            pushed_rows += len(value_tuples)
        print(f"  + {tbl_name}: đã đồng bộ {len(rows)} dòng (tổng {pushed_rows})", flush=True)

    conn.close()
    return {"tables_count": len(tables), "pushed_rows": pushed_rows}


PROFILE_PRESETS = {
    "oem": {
        "db_name": "pos-oem-db",
        "app_name": "⚡ MCare POS",
        "modules": {
            "module_oem": "1",
            "module_marketplace": "1",
            "module_price_lists": "1",
            "module_pet_services": "0",
            "module_hotel": "0",
        },
    },
    "spa": {
        "db_name": "pos-spa-db",
        "app_name": "🐾 PetNT POS",
        "modules": {
            "module_oem": "0",
            "module_marketplace": "0",
            "module_price_lists": "1",
            "module_pet_services": "1",
            "module_hotel": "1",
        },
    },
}


def ensure_d1_database(account_id: str, api_token: str, db_name: str, http_client=None) -> str:
    """Tìm hoặc tạo mới Database trên Cloudflare D1 qua REST API, trả về UUID database_id."""
    import httpx
    own = False
    if http_client is None:
        http_client = httpx.Client(timeout=20.0)
        own = True
    try:
        base_url = f"https://api.cloudflare.com/client/v4/accounts/{account_id}/d1/database"
        headers = {"Authorization": f"Bearer {api_token}", "Content-Type": "application/json"}
        r = http_client.get(base_url, headers=headers)
        data = r.json()
        if r.status_code >= 400 or not data.get("success", False):
            raise RuntimeError(f"Không thể liệt kê D1 Database: {data}")
        for item in data.get("result") or []:
            if item.get("name") == db_name:
                return item["uuid"]

        r_create = http_client.post(base_url, headers=headers, json={"name": db_name})
        c_data = r_create.json()
        if r_create.status_code >= 400 or not c_data.get("success", False):
            raise RuntimeError(f"Không thể tạo D1 Database '{db_name}': {c_data}")
        return c_data["result"]["uuid"]
    finally:
        if own:
            http_client.close()


def apply_instance_profile(d1_conn: D1ConnectionWrapper, profile_key: str):
    preset = PROFILE_PRESETS[profile_key]
    stmts = [
        ("INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)", ["app_name", preset["app_name"]])
    ]
    for k, v in preset["modules"].items():
        stmts.append(("INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)", [k, v]))
    d1_conn._send_batch(stmts)


def oauth_login_cloudflare(auth_file: str = ".cf_auth.json") -> dict:
    """Đăng nhập Cloudflare qua OAuth2 PKCE (giống Wrangler) ngay trên trình duyệt đang mở."""
    import base64
    import hashlib
    import http.server
    import json
    import secrets
    import urllib.parse
    import webbrowser
    import httpx

    if os.path.exists(auth_file):
        try:
            with open(auth_file, "r", encoding="utf-8") as f:
                saved = json.load(f)
            if saved.get("account_id") and saved.get("api_token"):
                return saved
        except Exception:
            pass

    verifier = secrets.token_urlsafe(64)
    digest = hashlib.sha256(verifier.encode("ascii")).digest()
    challenge = base64.urlsafe_b64encode(digest).rstrip(b"=").decode("ascii")
    state = secrets.token_urlsafe(16)

    client_id = "54d11594-84e4-41aa-b438-e81b8fa78ee7"
    redirect_uri = "http://localhost:8976/oauth/callback"
    scopes = (
        "account:read user:read workers:write workers_kv:write workers_routes:write "
        "workers_scripts:write workers_tail:read d1:write pages:write zone:read "
        "ssl_certs:write ai:write queues:write pipelines:write secrets_store:write offline_access"
    )
    params = {
        "response_type": "code",
        "client_id": client_id,
        "redirect_uri": redirect_uri,
        "scope": scopes,
        "state": state,
        "code_challenge": challenge,
        "code_challenge_method": "S256",
    }
    auth_url = "https://dash.cloudflare.com/oauth2/auth?" + urllib.parse.urlencode(params)
    captured = {}

    class CallbackHandler(http.server.BaseHTTPRequestHandler):
        def log_message(self, format, *args):
            pass

        def do_GET(self):
            parsed = urllib.parse.urlparse(self.path)
            qs = urllib.parse.parse_qs(parsed.query)
            if "code" in qs:
                captured["code"] = qs["code"][0]
                self.send_response(200)
                self.send_header("Content-Type", "text/html; charset=utf-8")
                self.end_headers()
                self.wfile.write("<h2>Đã kết nối Cloudflare D1 thành công! Anh có thể đóng tab này.</h2>".encode("utf-8"))
            else:
                self.send_response(400)
                self.end_headers()

    server = http.server.HTTPServer(("localhost", 8976), CallbackHandler)
    server.timeout = 180
    print(f"Đang mở trình duyệt xác thực Cloudflare: {auth_url}", flush=True)
    webbrowser.open(auth_url)

    while "code" not in captured:
        server.handle_request()
    server.server_close()

    with httpx.Client(timeout=20.0) as client:
        r_tok = client.post(
            "https://dash.cloudflare.com/oauth2/token",
            data={
                "grant_type": "authorization_code",
                "client_id": client_id,
                "code": captured["code"],
                "redirect_uri": redirect_uri,
                "code_verifier": verifier,
            },
            headers={"Content-Type": "application/x-www-form-urlencoded"},
        )
        tok_data = r_tok.json()
        access_token = tok_data["access_token"]

        r_acc = client.get(
            "https://api.cloudflare.com/client/v4/accounts",
            headers={"Authorization": f"Bearer {access_token}"},
        )
        acc_list = r_acc.json().get("result") or []
        if not acc_list:
            raise RuntimeError(f"Không tìm thấy Account Cloudflare: {r_acc.text}")
        account_id = acc_list[0]["id"]

    result = {
        "account_id": account_id,
        "api_token": access_token,
        "refresh_token": tok_data.get("refresh_token", ""),
    }
    with open(auth_file, "w", encoding="utf-8") as f:
        json.dump(result, f, indent=2)
    return result


def main():
    parser = argparse.ArgumentParser(description="Di trú dữ liệu SQLite sang Cloudflare D1")
    parser.add_argument("--db", default=get_db_path(), help="Đường dẫn file SQLite nguồn")
    parser.add_argument("--export-dir", default="deploy/d1_export", help="Thư mục xuất file SQL cho D1")
    parser.add_argument("--push", action="store_true", help="Đẩy trực tiếp lên 1 Cloudflare D1 qua biến môi trường")
    parser.add_argument("--setup-dual", action="store_true", help="Tự động tạo & bơm dữ liệu cho cả 2 bản POS (pos-oem-db & pos-spa-db)")
    parser.add_argument("--schema-only", action="store_true", help="Chỉ tạo 85 bảng + cấu hình hệ thống (để tự import dữ liệu sau)")
    args = parser.parse_args()

    stats = export_sqlite_to_d1_sql(args.db, args.export_dir)
    print(
        f"[OK] Đã xuất {stats['tables_count']} bảng, {stats['indexes_count']} index, "
        f"{stats['total_rows']} dòng dữ liệu ra {len(stats['data_files']) + 1} file tại: {args.export_dir}"
    )

    if args.setup_dual:
        acc_id = os.environ.get("CF_ACCOUNT_ID", "").strip()
        token = os.environ.get("CF_API_TOKEN", "").strip()
        if not acc_id or not token:
            auth_info = oauth_login_cloudflare()
            acc_id = auth_info["account_id"]
            token = auth_info["api_token"]
        for pkey, preset in PROFILE_PRESETS.items():
            db_id = ensure_d1_database(acc_id, token, preset["db_name"])
            print(f"\n---> Đang đồng bộ [{preset['app_name']}] vào D1 '{preset['db_name']}' (ID: {db_id})...")
            d1_conn = D1ConnectionWrapper(account_id=acc_id, database_id=db_id, api_token=token)
            res = push_sqlite_to_d1(args.db, d1_conn, schema_only=args.schema_only)
            apply_instance_profile(d1_conn, pkey)
            d1_conn.close()
            print(f"[HOÀN TẤT {pkey.upper()}] Đã nạp {res['pushed_rows']} dòng & cấu hình module cho {preset['db_name']} (CF_D1_DATABASE_ID={db_id})")
        return

    if args.push:
        d1_conn = D1ConnectionWrapper(
            worker_url=os.environ.get("CF_D1_WORKER_URL"),
            worker_secret=os.environ.get("CF_D1_WORKER_SECRET"),
            account_id=os.environ.get("CF_ACCOUNT_ID"),
            database_id=os.environ.get("CF_D1_DATABASE_ID"),
            api_token=os.environ.get("CF_API_TOKEN"),
        )
        res = push_sqlite_to_d1(args.db, d1_conn, schema_only=args.schema_only)
        d1_conn.close()
        print(f"[OK] Đã đẩy trực tiếp {res['pushed_rows']} dòng ({res['tables_count']} bảng) lên Cloudflare D1!")


if __name__ == "__main__":
    main()
