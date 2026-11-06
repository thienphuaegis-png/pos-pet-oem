import os
import uuid
from fastapi.testclient import TestClient

from server import app
from database import get_db
from auth_helpers import owner_auth_headers
import services.koc_service as koc_svc
from services.commission import sales_commission_by_staff


client = TestClient(app)


def test_contacts_server_pagination_and_kpi_accuracy():
    headers = owner_auth_headers()
    conn = get_db()
    cur = conn.cursor()
    tag = uuid.uuid4().hex[:6]
    rand_mid = str(uuid.uuid4().int)[:3]
    inserted_ids = []
    pet_id = None
    try:
        for i in range(25):
            cur.execute(
                "INSERT INTO contacts (name, phone, type, debt) VALUES (?, ?, 'customer', ?)",
                (f"KH Phân Trang {tag} #{i}", f"0919.{rand_mid}.{i:03d}" if i == 24 else f"0988000{i:03d}", 100000 if i < 3 else 0),
            )
            inserted_ids.append(cur.lastrowid)
        cur.execute("INSERT INTO pets (customer_id, name, species) VALUES (?, ?, 'Chó')", (inserted_ids[-1], f"Milo {tag}"))
        pet_id = cur.lastrowid
        conn.commit()

        cur.execute("SELECT COUNT(*), COALESCE(SUM(debt), 0) FROM contacts WHERE type = 'customer'")
        exp_cnt, exp_debt = cur.fetchone()

        r1 = client.get("/api/contacts?type=customer&paginated=1&limit=10&offset=0", headers=headers)
        assert r1.status_code == 200
        d1 = r1.json()
        assert len(d1["items"]) == 10
        assert d1["customer_count"] == int(exp_cnt)
        assert round(d1["customer_debt"], 2) == round(float(exp_debt or 0), 2)
        newest = next(x for x in d1["items"] if x["id"] == inserted_ids[-1])
        assert newest["pets_count"] == 1

        # Tìm SĐT gõ liền không dấu chấm vẫn khớp chính xác trên Server
        digits_only = f"0919{rand_mid}024"
        r_search = client.get(f"/api/contacts?type=customer&paginated=1&limit=10&offset=0&search={digits_only}", headers=headers)
        assert r_search.status_code == 200
        ds = r_search.json()
        assert any(x["id"] == inserted_ids[-1] for x in ds["items"])
    finally:
        if pet_id:
            cur.execute("DELETE FROM pets WHERE id = ?", (pet_id,))
        if inserted_ids:
            ph = ",".join("?" for _ in inserted_ids)
            cur.execute(f"DELETE FROM contacts WHERE id IN ({ph})", tuple(inserted_ids))
        conn.commit()
        conn.close()


def test_orders_vn_timezone_index_plan_and_exact_boundary():
    conn = get_db()
    cur = conn.cursor()
    tag = uuid.uuid4().hex[:6]
    ord_ids = []
    staff_id = None
    try:
        # 1. Verify SQLite EXPLAIN QUERY PLAN uses index SEARCH (not full table SCAN)
        cur.execute(
            """EXPLAIN QUERY PLAN
               SELECT oi.product_id, SUM(oi.subtotal)
               FROM order_items oi JOIN orders o ON oi.order_id = o.id
               WHERE o.created_at >= datetime(?, '-7 hours') AND o.created_at < datetime(?, '-7 hours', '+1 second')
               GROUP BY oi.product_id""",
            ("2026-10-01 00:00:00", "2026-10-31 23:59:59"),
        )
        plan_txt = " | ".join(str(r[3]) for r in cur.fetchall())
        assert "idx_orders_created_at" in plan_txt
        assert "SCAN orders" not in plan_txt

        # 2. Verify exact VN +7h boundary:
        # - '2026-09-30 16:59:59' UTC == '2026-09-30 23:59:59' VN -> NGOÀI tháng 10
        # - '2026-09-30 17:00:00' UTC == '2026-10-01 00:00:00' VN -> TRONG tháng 10
        # - '2026-10-31 16:59:59' UTC == '2026-10-31 23:59:59' VN -> TRONG tháng 10
        # - '2026-10-31 17:00:00' UTC == '2026-11-01 00:00:00' VN -> NGOÀI tháng 10
        cur.execute(
            "INSERT INTO staff (name, username, role, commission_rate, commission_policy_mode, is_active) VALUES (?, ?, 'staff', 10, 'custom', 1)",
            (f"NV Boundary {tag}", f"nv_bound_{tag}"),
        )
        staff_id = cur.lastrowid
        samples = [
            (f"B1-{tag}", "2026-09-30 16:59:59", 100000),  # out
            (f"B2-{tag}", "2026-09-30 17:00:00", 200000),  # in
            (f"B3-{tag}", "2026-10-31 16:59:59", 300000),  # in
            (f"B4-{tag}", "2026-10-31 17:00:00", 400000),  # out
        ]
        for code, utc_ts, amt in samples:
            cur.execute(
                "INSERT INTO orders (code, staff_id, total_amount, discount, final_amount, paid_amount, status, created_at) VALUES (?, ?, ?, 0, ?, ?, 'completed', ?)",
                (code, staff_id, amt, amt, amt, utc_ts),
            )
            ord_ids.append(cur.lastrowid)
        conn.commit()

        comm = sales_commission_by_staff(cur, "2026-10-01 00:00:00", "2026-10-31 23:59:59")
        assert staff_id in comm
        assert comm[staff_id]["orders"] == 2
        assert comm[staff_id]["revenue"] == 500000.0
    finally:
        if ord_ids:
            ph = ",".join("?" for _ in ord_ids)
            cur.execute(f"DELETE FROM orders WHERE id IN ({ph})", tuple(ord_ids))
        if staff_id:
            cur.execute("DELETE FROM staff WHERE id = ?", (staff_id,))
        conn.commit()
        conn.close()


def test_products_query_no_correlated_ingredient_scan_and_koc_schema_once():
    headers = owner_auth_headers()
    conn = get_db()
    cur = conn.cursor()
    src_id = None
    try:
        # 1. Products SQL plan has zero CORRELATED SCALAR SUBQUERY on ingredients
        cur.execute(
            """EXPLAIN QUERY PLAN
               SELECT p.id FROM products p
               WHERE COALESCE(p.is_active, 1) = 1
                 AND (p.code IS NULL OR p.code = '' OR p.code NOT IN (SELECT code FROM ingredients WHERE code IS NOT NULL AND code != ''))
                 AND (p.name IS NULL OR p.name = '' OR p.name NOT IN (SELECT name FROM ingredients WHERE name IS NOT NULL AND name != ''))"""
        )
        p_plan = " | ".join(str(r[3]) for r in cur.fetchall())
        assert "CORRELATED" not in p_plan

        # 2. ensure_koc_schema_once skips DDL/PRAGMA on repeat calls for the same DB
        koc_svc.ensure_koc_schema(cur)
        conn.commit()

        executed_sql = []
        conn.set_trace_callback(executed_sql.append)
        try:
            koc_svc.ensure_koc_schema_once(cur)
        finally:
            conn.set_trace_callback(None)

        joined = "\n".join(executed_sql).upper()
        assert "CREATE TABLE" not in joined
        assert "PRAGMA TABLE_INFO" not in joined

        # 3. /api/marketplace/koc/profiles returns accurate video counts & views via single CTE
        cur.execute(
            "INSERT INTO koc_sources (name, sheet_url, sheet_id, month, is_active) VALUES (?, ?, ?, '2026-10', 1)",
            ("CTE KOC Test", "https://docs.google.com/spreadsheets/d/1234567890123456789012", "1234567890123456789012"),
        )
        src_id = cur.lastrowid
        cur.execute("INSERT INTO koc_profiles (source_id, koc_username, videos_returned) VALUES (?, 'PetKocOne', 2)", (src_id,))
        cur.execute("INSERT INTO koc_videos (source_id, video_key, video_url, koc_username, views) VALUES (?, 'v1', 'https://tiktok.com/@petkocone/video/1', 'petkocone', 300)", (src_id,))
        cur.execute("INSERT INTO koc_videos (source_id, video_key, video_url, koc_username, views) VALUES (?, 'v2', 'https://tiktok.com/@petkocone/video/2', 'PETKOCONE', 450)", (src_id,))
        conn.commit()

        rp = client.get(f"/api/marketplace/koc/profiles?source_id={src_id}", headers=headers)
        assert rp.status_code == 200
        profs = rp.json()["profiles"]
        assert len(profs) == 1
        assert profs[0]["actual_videos"] == 2
        assert profs[0]["total_views"] == 750
    finally:
        if src_id:
            cur.execute("DELETE FROM koc_videos WHERE source_id = ?", (src_id,))
            cur.execute("DELETE FROM koc_profiles WHERE source_id = ?", (src_id,))
            cur.execute("DELETE FROM koc_sources WHERE id = ?", (src_id,))
            conn.commit()
        conn.close()


def test_frontend_anti_rescan_contracts():
    root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    with open(os.path.join(root, "static", "js", "clientlog.js"), encoding="utf-8") as f:
        clog = f.read()
    assert "setInterval(flush, 15000)" in clog
    assert "setInterval(flush, 2000)" not in clog

    with open(os.path.join(root, "static", "js", "app.js"), encoding="utf-8") as f:
        app_js = f.read()
    assert "window.getSharedProducts" in app_js

    for rel in ("contacts.js", "spa.js", "productions.js"):
        with open(os.path.join(root, "static", "js", "modules", rel), encoding="utf-8") as f:
            txt = f.read()
        assert "fetch('/api/contacts')" not in txt, f"{rel} vẫn gọi trần /api/contacts kéo 13.000 KH!"
