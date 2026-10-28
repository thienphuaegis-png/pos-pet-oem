import os
import sqlite3
import sys
import tempfile
import pytest

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from database import D1ConnectionWrapper, get_db
from scripts.migrate_to_cloudflare_d1 import export_sqlite_to_d1_sql, push_sqlite_to_d1


class FakeHTTPResponse:
    def __init__(self, json_data, status_code=200):
        self._json = json_data
        self.status_code = status_code
        self.text = str(json_data)

    def json(self):
        return self._json


class FakeD1HTTPClient:
    """Giả lập Cloudflare D1 Worker / REST API bằng một SQLite in-memory thật để kiểm chứng độ tương thích 100%."""
    def __init__(self):
        self.mem = sqlite3.connect(":memory:")
        self.mem.row_factory = sqlite3.Row
        self.calls = []

    def _exec_one(self, sql, params):
        cur = self.mem.cursor()
        if not params and ";\n" in sql:
            cur.executescript(sql)
            self.mem.commit()
            return {"results": [], "meta": {"changes": 1}}
        cur.execute(sql, params or [])
        rows = [dict(r) for r in cur.fetchall()] if cur.description else []
        meta = {
            "last_row_id": cur.lastrowid,
            "changes": cur.rowcount if cur.rowcount != -1 else 0,
        }
        self.mem.commit()
        return {"results": rows, "meta": meta}

    def post(self, url, json=None, headers=None):
        self.calls.append((url, json, headers))
        try:
            if url.endswith("/d1/batch"):
                res_list = []
                for item in json.get("statements", []):
                    res_list.append(self._exec_one(item["sql"], item.get("params", [])))
                return FakeHTTPResponse({"success": True, "result": res_list})
            else:
                one = self._exec_one(json["sql"], json.get("params", []))
                return FakeHTTPResponse({"success": True, "result": [one]})
        except Exception as e:
            return FakeHTTPResponse({"success": False, "error": str(e)}, status_code=400)


def test_d1_adapter_crud_and_row_compatibility():
    fake_http = FakeD1HTTPClient()
    conn = D1ConnectionWrapper(
        worker_url="https://pos-d1.example.workers.dev",
        worker_secret="secret123",
        http_client=fake_http,
    )
    cur = conn.cursor()

    # 1. PRAGMA journal_mode phải được bỏ qua không gửi mạng
    cur.execute("PRAGMA journal_mode = WAL")
    assert len(fake_http.calls) == 0

    # 2. Tạo bảng và INSERT lấy lastrowid
    cur.execute("CREATE TABLE products (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT, active INTEGER)")
    cur.execute("INSERT INTO products (name, active) VALUES (?, ?)", ("Hạt Royal Canin", True))
    assert cur.lastrowid == 1

    # 3. Truy vấn lấy dòng và kiểm tra tương thích sqlite3.Row (index, key, dict, get)
    cur.execute("SELECT id, name, active FROM products WHERE id = ?", (1,))
    row = cur.fetchone()
    assert row is not None
    assert row[0] == 1
    assert row["name"] == "Hạt Royal Canin"
    assert row["NAME"] == "Hạt Royal Canin"
    assert row.get("active") == 1
    assert dict(row) == {"id": 1, "name": "Hạt Royal Canin", "active": 1}

    # 4. executemany đẩy qua /d1/batch
    cur.executemany(
        "INSERT INTO products (name, active) VALUES (?, ?)",
        [("Sữa tắm SOS", True), ("Cát Nhật", False)],
    )
    cur.execute("SELECT COUNT(*) as cnt FROM products")
    assert cur.fetchone()["cnt"] == 3

    # 5. PRAGMA table_info vẫn được cho qua để đọc cột
    cur.execute("PRAGMA table_info(products)")
    cols = [r["name"] for r in cur.fetchall()]
    assert cols == ["id", "name", "active"]


def test_get_db_selects_d1_when_env_configured(monkeypatch):
    monkeypatch.setenv("CF_D1_WORKER_URL", "https://pos-d1.example.workers.dev")
    monkeypatch.setenv("CF_D1_WORKER_SECRET", "topsecret")
    conn = get_db()
    try:
        assert isinstance(conn, D1ConnectionWrapper)
        assert conn.worker_url == "https://pos-d1.example.workers.dev"
    finally:
        conn.close()


def test_activity_logger_ignores_high_frequency_paths():
    from activity_logger import log_activity_from_request, _LOG_QUEUE

    class DummyURL:
        def __init__(self, path):
            self.path = path

    class DummyReq:
        def __init__(self, path):
            self.url = DummyURL(path)
            self.method = "POST"
            self.headers = {"authorization": "Bearer fake"}
            self.client = None

    before = _LOG_QUEUE.qsize()
    log_activity_from_request(DummyReq("/api/client-log"), None)
    log_activity_from_request(DummyReq("/api/pos/draft"), None)
    assert _LOG_QUEUE.qsize() == before


def test_export_and_push_sqlite_to_d1():
    with tempfile.TemporaryDirectory() as tmpdir:
        src_db = os.path.join(tmpdir, "sample.db")
        sconn = sqlite3.connect(src_db)
        sconn.execute("CREATE TABLE categories (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL)")
        sconn.execute("INSERT INTO categories (name) VALUES ('Thức ăn'), ('Phụ kiện')")
        sconn.commit()
        sconn.close()

        out_dir = os.path.join(tmpdir, "d1_out")
        stats = export_sqlite_to_d1_sql(src_db, out_dir)
        assert stats["tables_count"] == 1
        assert stats["total_rows"] == 2
        assert os.path.exists(stats["schema_file"])
        assert len(stats["data_files"]) == 1

        # Kiểm tra push trực tiếp vào D1 giả lập
        fake_http = FakeD1HTTPClient()
        d1_conn = D1ConnectionWrapper(worker_url="https://pos-d1.example.workers.dev", http_client=fake_http)
        push_res = push_sqlite_to_d1(src_db, d1_conn)
        assert push_res["tables_count"] == 1
        assert push_res["pushed_rows"] == 2

        cur = d1_conn.cursor()
        cur.execute("SELECT name FROM categories ORDER BY id")
        names = [r["name"] for r in cur.fetchall()]
        assert names == ["Thức ăn", "Phụ kiện"]


def test_bulk_500_orders_d1_round_trips_minimized():
    """Chứng minh 500 đơn hàng sàn đồng bộ qua D1 tốn dưới 30 chuyến HTTP (thay vì ~4.000 chuyến như code cũ)."""
    from services import pancake as P

    fake_http = FakeD1HTTPClient()
    d1_conn = D1ConnectionWrapper(worker_url="https://pos-d1.example.workers.dev", http_client=fake_http)
    cur = d1_conn.cursor()

    cur.execute("CREATE TABLE settings (key TEXT PRIMARY KEY, value TEXT)")
    cur.execute("INSERT INTO settings VALUES ('mkt_stock_start_date', '2026-10-01')")
    cur.execute("CREATE TABLE products (id INTEGER PRIMARY KEY, code TEXT, name TEXT, type TEXT, stock REAL, is_active INTEGER)")
    cur.execute("INSERT INTO products VALUES (101, 'SP01', 'Hạt Mèo', 'product', 1000, 1)")
    cur.execute("CREATE TABLE product_inventory (warehouse_id INTEGER, product_id INTEGER, quantity REAL, updated_at DATETIME, PRIMARY KEY(warehouse_id, product_id))")
    cur.execute("CREATE TABLE inventory_logs (id INTEGER PRIMARY KEY AUTOINCREMENT, item_type TEXT, product_id INTEGER, warehouse_id INTEGER, change_type TEXT, quantity REAL, balance_after REAL, order_code TEXT, note TEXT)")
    cur.execute("CREATE TABLE marketplace_sku_mappings (platform TEXT, platform_sku TEXT, platform_item_name TEXT, platform_variation TEXT, product_id INTEGER)")
    cur.execute("""CREATE TABLE marketplace_orders (
        id INTEGER PRIMARY KEY AUTOINCREMENT, platform TEXT, account_id INTEGER, order_sn TEXT,
        order_status TEXT, order_date TEXT, total_amount REAL, shipping_fee REAL, net_payout REAL,
        buyer_username TEXT, tracking_number TEXT, seller_name TEXT, updated_at DATETIME,
        UNIQUE(platform, order_sn)
    )""")
    cur.execute("""CREATE TABLE marketplace_order_items (
        id INTEGER PRIMARY KEY AUTOINCREMENT, order_id INTEGER, platform_item_id TEXT,
        platform_product_name TEXT, platform_variation TEXT, platform_sku TEXT,
        quantity REAL, unit_price REAL, subtotal REAL, mapped_product_id INTEGER, returned_qty REAL DEFAULT 0
    )""")
    cur.execute("CREATE TABLE pancake_sellers (seller_name TEXT PRIMARY KEY, staff_id INTEGER, rules_json TEXT)")

    fake_http.calls.clear()
    raw_500 = [
        {
            "id": i,
            "shop_id": 1,
            "status": 0,  # Mới -> chưa trừ kho
            "money_to_collect": 100000,
            "inserted_at": "2026-10-20T03:00:00",
            "bill_full_name": f"Khách {i}",
            "order_link": f"https://pos.pages.fm/shop/1/order?order_id=BULK{i}",
            "assigning_seller": {"name": "NV Bulk"},
            "items": [{
                "quantity": 1,
                "return_quantity": 0,
                "is_composite": None,
                "variation_id": "v1",
                "variation_info": {"name": "Hạt Mèo", "display_id": "1", "product_display_id": "SP01", "retail_price": 100000},
            }],
        }
        for i in range(1, 501)
    ]
    res = P.save_orders(cur, 1, raw_500)
    assert res == {"orders": 500, "items": 500}
    # 500 đơn chỉ tốn đúng ~22 chuyến HTTP batch (giảm từ ~4.000 chuyến)
    assert len(fake_http.calls) < 30, f"Too many HTTP round-trips: {len(fake_http.calls)}"


def test_dual_instance_profile_configuration():
    """Kiểm tra cấu hình tách 2 bản POS (OEM vs Spa/Hotel) trên D1."""
    from scripts.migrate_to_cloudflare_d1 import apply_instance_profile

    fake_http = FakeD1HTTPClient()
    d1_conn = D1ConnectionWrapper(account_id="acc1", database_id="db1", api_token="tok1", http_client=fake_http)
    cur = d1_conn.cursor()
    cur.execute("CREATE TABLE settings (key TEXT PRIMARY KEY, value TEXT)")

    apply_instance_profile(d1_conn, "oem")
    cur.execute("SELECT key, value FROM settings")
    cfg_oem = {r["key"]: r["value"] for r in cur.fetchall()}
    assert cfg_oem["module_oem"] == "1"
    assert cfg_oem["module_marketplace"] == "1"
    assert cfg_oem["module_pet_services"] == "0"
    assert cfg_oem["module_hotel"] == "0"

    apply_instance_profile(d1_conn, "spa")
    cur.execute("SELECT key, value FROM settings")
    cfg_spa = {r["key"]: r["value"] for r in cur.fetchall()}
    assert cfg_spa["module_pet_services"] == "1"
    assert cfg_spa["module_hotel"] == "1"
    assert cfg_spa["module_oem"] == "0"
    assert cfg_spa["module_marketplace"] == "0"


