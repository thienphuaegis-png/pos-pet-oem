import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

import pytest
from fastapi.testclient import TestClient
from database import init_db, get_db
from server import app
from dependencies import get_current_user

init_db()

client = TestClient(app)

@pytest.fixture(autouse=True)
def isolated_db(tmp_path, monkeypatch):
    # DB trắng: catalog thật có nhiều nhóm min_points=0 (GOLD/LAZADA/SHOPEE...) làm sai kịch bản hạ hạng
    monkeypatch.setenv("POS_DB_PATH", str(tmp_path / "pos.db"))
    init_db()


@pytest.fixture(autouse=True)
def override_auth():
    app.dependency_overrides[get_current_user] = lambda: {"id": 1, "name": "Admin", "role": "owner", "is_active": 1}
    yield
    app.dependency_overrides.pop(get_current_user, None)

@pytest.fixture(scope="module", autouse=True)
def cleanup():
    # Setup / cleanup before and after
    def do_clean():
        db = get_db()
        try:
            cur = db.cursor()
            cur.execute("SELECT id FROM orders WHERE customer_id IN (SELECT id FROM contacts WHERE phone LIKE 'TEST_PTS_%')")
            order_ids = [r[0] for r in cur.fetchall()]
            for oid in order_ids:
                cur.execute("DELETE FROM order_payments WHERE order_id = ?", (oid,))
                cur.execute("DELETE FROM order_items WHERE order_id = ?", (oid,))
                cur.execute("DELETE FROM inventory_logs WHERE order_id = ?", (oid,))
                cur.execute("DELETE FROM cashbook WHERE ref_type = 'order' AND ref_id = ?", (oid,))
                cur.execute("DELETE FROM orders WHERE id = ?", (oid,))
            cur.execute("DELETE FROM contacts WHERE phone LIKE 'TEST_PTS_%'")
            cur.execute("DELETE FROM customer_segments WHERE code LIKE 'TEST_SEG_PTS_%'")
            cur.execute("DELETE FROM product_inventory WHERE product_id IN (SELECT id FROM products WHERE code LIKE 'TEST_PROD_PTS_%')")
            cur.execute("DELETE FROM products WHERE code LIKE 'TEST_PROD_PTS_%'")
            db.commit()
        finally:
            db.close()

    do_clean()
    yield
    do_clean()


def test_points_and_tier_upgrade():
    db = get_db()
    cur = db.cursor()

    # 1. Setup segments:
    # Retail Base (min_points=0, allow_points=1, priority=10)
    # Retail Silver (min_points=50, allow_points=1, priority=20)
    # Retail Gold (min_points=100, allow_points=1, priority=30)
    # Wholesale / Dealer (min_points=0, allow_points=0, priority=10)
    cur.execute("INSERT OR REPLACE INTO customer_segments (code, name, min_points, allow_points, priority, is_active) VALUES ('TEST_SEG_PTS_BASE', 'Khách Chuẩn', 0, 1, 10, 1)")
    seg_base_id = cur.lastrowid
    cur.execute("INSERT OR REPLACE INTO customer_segments (code, name, min_points, allow_points, priority, is_active) VALUES ('TEST_SEG_PTS_SILVER', 'Hạng Bạc', 50, 1, 20, 1)")
    seg_silver_id = cur.lastrowid
    cur.execute("INSERT OR REPLACE INTO customer_segments (code, name, min_points, allow_points, priority, is_active) VALUES ('TEST_SEG_PTS_GOLD', 'Hạng Vàng', 100, 1, 30, 1)")
    seg_gold_id = cur.lastrowid
    cur.execute("INSERT OR REPLACE INTO customer_segments (code, name, min_points, allow_points, priority, is_active) VALUES ('TEST_SEG_PTS_SI', 'Khách Sỉ', 0, 0, 10, 1)")
    seg_si_id = cur.lastrowid

    # 2. Setup contacts:
    # Customer A: Retail Base (points=0)
    # Customer B: Sỉ (points=0)
    cur.execute("INSERT INTO contacts (name, phone, type, segment_id, points) VALUES ('Khách Lẻ A', 'TEST_PTS_001', 'customer', ?, 0)", (seg_base_id,))
    cust_retail_id = cur.lastrowid
    cur.execute("INSERT INTO contacts (name, phone, type, segment_id, points) VALUES ('Khách Sỉ B', 'TEST_PTS_002', 'customer', ?, 0)", (seg_si_id,))
    cust_si_id = cur.lastrowid

    # 3. Setup product & staff
    cur.execute("INSERT OR REPLACE INTO products (code, name, type, sell_price, cost_price, stock, unit) VALUES ('TEST_PROD_PTS_1', 'Hạt Dinh Dưỡng Test', 'product', 100000, 50000, 1000, 'gói')")
    prod_id = cur.lastrowid
    cur.execute("SELECT id FROM staff LIMIT 1")
    staff_row = cur.fetchone()
    staff_id = staff_row[0] if staff_row else 1

    # Ensure points_exchange_rate is 1000
    cur.execute("INSERT OR REPLACE INTO settings (key, value) VALUES ('points_exchange_rate', '1000')")
    db.commit()
    db.close()

    # --- TEST CASE 1: Retail customer earns points correctly (20,000 VND / 1,000 = 20 points, no tier upgrade yet) ---
    order_payload = {
        "customer_id": cust_retail_id,
        "staff_id": staff_id,
        "discount": 0,
        "paid_amount": 20000,
        "items": [{"product_id": prod_id, "quantity": 1, "price": 20000}]
    }
    resp1 = client.post("/api/orders", json=order_payload)
    assert resp1.status_code == 200, resp1.text
    data1 = resp1.json()
    assert data1["points_earned"] == 20
    assert data1["current_points"] == 20
    assert data1["tier_upgraded"] is None

    # Check DB
    db = get_db()
    cur = db.cursor()
    cur.execute("SELECT points, segment_id FROM contacts WHERE id = ?", (cust_retail_id,))
    row1 = cur.fetchone()
    assert row1["points"] == 20
    assert row1["segment_id"] == seg_base_id
    db.close()

    # --- TEST CASE 2: Retail customer crosses 50 points threshold -> Upgrades to 'Hạng Bạc' ---
    # Need 35 more points = 35,000 VND -> 35 points -> 55 points total
    order_payload_2 = {
        "customer_id": cust_retail_id,
        "staff_id": staff_id,
        "discount": 0,
        "paid_amount": 35000,
        "items": [{"product_id": prod_id, "quantity": 1, "price": 35000}]
    }
    resp2 = client.post("/api/orders", json=order_payload_2)
    assert resp2.status_code == 200, resp2.text
    data2 = resp2.json()
    assert data2["points_earned"] == 35
    assert data2["current_points"] == 55
    assert data2["tier_upgraded"] == "Hạng Bạc"

    # Check DB
    db = get_db()
    cur = db.cursor()
    cur.execute("SELECT points, segment_id FROM contacts WHERE id = ?", (cust_retail_id,))
    row2 = cur.fetchone()
    assert row2["points"] == 55
    assert row2["segment_id"] == seg_silver_id
    db.close()

    # --- TEST CASE 3: Retail customer crosses 100 points threshold -> Upgrades to 'Hạng Vàng' ---
    # Current 55. Need 50,000 VND = 50 points -> total 105 points
    order_payload_3 = {
        "customer_id": cust_retail_id,
        "staff_id": staff_id,
        "discount": 0,
        "paid_amount": 50000,
        "items": [{"product_id": prod_id, "quantity": 1, "price": 50000}]
    }
    resp3 = client.post("/api/orders", json=order_payload_3)
    assert resp3.status_code == 200, resp3.text
    data3 = resp3.json()
    assert data3["points_earned"] == 50
    assert data3["current_points"] == 105
    assert data3["tier_upgraded"] == "Hạng Vàng"

    db = get_db()
    cur = db.cursor()
    cur.execute("SELECT points, segment_id FROM contacts WHERE id = ?", (cust_retail_id,))
    row3 = cur.fetchone()
    assert row3["points"] == 105
    assert row3["segment_id"] == seg_gold_id
    db.close()

    # --- TEST CASE 4: Sỉ / Đại lý (allow_points = 0) DOES NOT earn points even with huge paid_amount ---
    order_payload_si = {
        "customer_id": cust_si_id,
        "staff_id": staff_id,
        "discount": 0,
        "paid_amount": 50000000, # 50 million
        "items": [{"product_id": prod_id, "quantity": 500, "price": 100000}]
    }
    resp_si = client.post("/api/orders", json=order_payload_si)
    assert resp_si.status_code == 200, resp_si.text
    data_si = resp_si.json()
    assert data_si["points_earned"] == 0
    assert data_si["current_points"] == 0
    assert data_si["tier_upgraded"] is None

    db = get_db()
    cur = db.cursor()
    cur.execute("SELECT points, segment_id FROM contacts WHERE id = ?", (cust_si_id,))
    row_si = cur.fetchone()
    assert row_si["points"] == 0
    assert row_si["segment_id"] == seg_si_id
    db.close()

    # --- TEST CASE 5: Hủy đơn hàng -> Tự động thu hồi điểm và hạ hạng (Gold -> Silver -> Base) ---
    # Đơn 3 mang lại 50 điểm (đưa lên 105 điểm Hạng Vàng). Khi hủy đơn 3, điểm tụt xuống 55 -> Tự động hạ xuống Hạng Bạc
    order_code_3 = data3["order_code"]
    del_resp3 = client.delete(f"/api/orders/{order_code_3}")
    assert del_resp3.status_code == 200, del_resp3.text

    db = get_db()
    cur = db.cursor()
    cur.execute("SELECT points, segment_id FROM contacts WHERE id = ?", (cust_retail_id,))
    row_del3 = cur.fetchone()
    assert row_del3["points"] == 55
    assert row_del3["segment_id"] == seg_silver_id

    # Tiếp tục hủy đơn 2 (35 điểm) -> điểm tụt xuống 20 -> Tự động hạ xuống Khách Chuẩn
    order_code_2 = data2["order_code"]
    del_resp2 = client.delete(f"/api/orders/{order_code_2}")
    assert del_resp2.status_code == 200, del_resp2.text

    cur.execute("SELECT points, segment_id FROM contacts WHERE id = ?", (cust_retail_id,))
    row_del2 = cur.fetchone()
    assert row_del2["points"] == 20
    assert row_del2["segment_id"] == seg_base_id
    db.close()
