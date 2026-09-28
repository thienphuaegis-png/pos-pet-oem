import sys, os
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

import pytest
from fastapi.testclient import TestClient
from database import init_db, get_db
from server import app
from dependencies import get_current_user
from routers.promotions import calculate_effective_price

init_db()

# Override get_current_user to bypass auth as owner
app.dependency_overrides[get_current_user] = lambda: {"id": 1, "name": "Admin", "role": "owner", "is_active": 1}

client = TestClient(app)

@pytest.fixture(scope="module", autouse=True)
def cleanup_test_data():
    yield
    # Cleanup after test suite
    db = get_db()
    try:
        cur = db.cursor()
        cur.execute("DELETE FROM promotion_items WHERE promotion_id IN (SELECT id FROM promotions WHERE code LIKE 'TEST_KM_%')")
        cur.execute("DELETE FROM promotions WHERE code LIKE 'TEST_KM_%'")
        cur.execute("DELETE FROM product_price_list WHERE price_list_id IN (SELECT id FROM price_lists WHERE code LIKE 'TEST_PL_%')")
        cur.execute("DELETE FROM price_lists WHERE code LIKE 'TEST_PL_%'")
        cur.execute("DELETE FROM contacts WHERE phone LIKE 'TEST_PHONE_%'")
        cur.execute("DELETE FROM customer_segments WHERE code LIKE 'TEST_SEG_%'")
        cur.execute("DELETE FROM products WHERE code LIKE 'TEST_PROD_%'")
        db.commit()
    finally:
        db.close()


def test_promotions_crud_and_items():
    # 1. Create product for testing
    db = get_db()
    try:
        cur = db.cursor()
        cur.execute("INSERT OR REPLACE INTO products (code, name, type, sell_price, cost_price, stock, unit) VALUES ('TEST_PROD_1', 'Hạt Cho Chó Test', 'product', 100000, 60000, 50, 'gói')")
        p_id = cur.lastrowid
        db.commit()
    finally:
        db.close()

    # 2. POST /api/promotions
    resp = client.post("/api/promotions", json={
        "code": "TEST_KM_1",
        "name": "Khuyến Mãi Khai Trương",
        "start_date": "2020-01-01",
        "end_date": "2030-12-31",
        "is_active": 1
    })
    assert resp.status_code == 200, resp.text
    promo_id = resp.json()["id"]

    # 3. GET /api/promotions
    resp = client.get("/api/promotions")
    assert resp.status_code == 200
    promos = resp.json()
    assert any(p["id"] == promo_id for p in promos)

    # 4. PUT /api/promotions/{id}
    resp = client.put(f"/api/promotions/{promo_id}", json={
        "name": "Khuyến Mãi Cập Nhật"
    })
    assert resp.status_code == 200

    # 5. POST /api/promotions/{id}/items
    resp = client.post(f"/api/promotions/{promo_id}/items", json={
        "product_id": p_id,
        "discount_type": "pct",
        "discount_val": 15
    })
    assert resp.status_code == 200
    item_id = resp.json()["id"]

    # 6. GET /api/promotions/{id}/items
    resp = client.get(f"/api/promotions/{promo_id}/items")
    assert resp.status_code == 200
    items = resp.json()
    assert len(items) == 1
    assert items[0]["discount_val"] == 15

    # 7. GET /api/promotions/{id} (includes items)
    resp = client.get(f"/api/promotions/{promo_id}")
    assert resp.status_code == 200
    detail = resp.json()
    assert detail["name"] == "Khuyến Mãi Cập Nhật"
    assert len(detail["items"]) == 1

    # 8. DELETE /api/promotions/{id}/items/{item_id}
    resp = client.delete(f"/api/promotions/{promo_id}/items/{item_id}")
    assert resp.status_code == 200

    # Verify item deleted
    resp = client.get(f"/api/promotions/{promo_id}/items")
    assert len(resp.json()) == 0

    # 9. DELETE /api/promotions/{id}
    resp = client.delete(f"/api/promotions/{promo_id}")
    assert resp.status_code == 200

    # Verify promo deleted
    resp = client.get(f"/api/promotions/{promo_id}")
    assert resp.status_code == 404


def test_best_offer_pricing_segment_10_vs_promo_20():
    """
    Customer segment discount 10% vs Promo discount 20% -> Final price discount 20% (not 30%).
    Base price: 200.000đ
    Segment: 10% -> 180.000đ
    Promo: 20% -> 160.000đ
    Best Offer: 160.000đ (applied_source='promotion', discount=40.000)
    """
    db = get_db()
    try:
        cur = db.cursor()
        cur.execute("INSERT OR REPLACE INTO products (code, name, type, sell_price, cost_price, stock, unit) VALUES ('TEST_PROD_2', 'Pate Mèo Test 1', 'product', 200000, 100000, 20, 'lon')")
        p_id = cur.lastrowid

        cur.execute("INSERT INTO customer_segments (code, name, discount_percent, priority) VALUES ('TEST_SEG_10', 'Segment 10%', 10, 1)")
        seg_id = cur.lastrowid

        cur.execute("INSERT INTO contacts (name, phone, type, segment_id) VALUES ('Khách Test 1', 'TEST_PHONE_1', 'customer', ?)", (seg_id,))
        cust_id = cur.lastrowid

        cur.execute("""
            INSERT INTO promotions (code, name, start_date, end_date, is_active)
            VALUES ('TEST_KM_20', 'KM 20%', '2020-01-01', '2030-12-31', 1)
        """)
        promo_id = cur.lastrowid

        cur.execute("""
            INSERT INTO promotion_items (promotion_id, product_id, discount_type, discount_val)
            VALUES (?, ?, 'pct', 20)
        """, (promo_id, p_id))

        db.commit()
    finally:
        db.close()

    # 1. Test helper calculate_effective_price
    result = calculate_effective_price(product_id=p_id, customer_id=cust_id)
    assert result["base_price"] == 200000
    assert result["final_price"] == 160000
    assert result["discount_applied"] == 40000
    assert result["applied_source"] == "promotion"
    assert result["promo_id"] == promo_id

    # 2. Test endpoint POST /api/pricing/calculate
    resp = client.post("/api/pricing/calculate", json={
        "customer_id": cust_id,
        "items": [{"product_id": p_id, "quantity": 2}]
    })
    assert resp.status_code == 200
    data = resp.json()
    item_res = data["items"][0]
    assert item_res["final_price"] == 160000
    assert item_res["subtotal"] == 320000
    assert item_res["applied_source"] == "promotion"
    assert data["total_amount"] == 320000


def test_best_offer_pricing_segment_25_vs_promo_10():
    """
    Customer segment discount 25% vs Promo discount 10% -> Final price discount 25%.
    Base price: 200.000đ
    Segment: 25% -> 150.000đ
    Promo: 10% -> 180.000đ
    Best Offer: 150.000đ (applied_source='segment_price_list', discount=50.000)
    """
    db = get_db()
    try:
        cur = db.cursor()
        cur.execute("INSERT OR REPLACE INTO products (code, name, type, sell_price, cost_price, stock, unit) VALUES ('TEST_PROD_3', 'Pate Mèo Test 2', 'product', 200000, 100000, 20, 'lon')")
        p_id = cur.lastrowid

        cur.execute("INSERT INTO customer_segments (code, name, discount_percent, priority) VALUES ('TEST_SEG_25', 'Segment 25%', 25, 2)")
        seg_id = cur.lastrowid

        cur.execute("INSERT INTO contacts (name, phone, type, segment_id) VALUES ('Khách Test 2', 'TEST_PHONE_2', 'customer', ?)", (seg_id,))
        cust_id = cur.lastrowid

        cur.execute("""
            INSERT INTO promotions (code, name, start_date, end_date, is_active)
            VALUES ('TEST_KM_10', 'KM 10%', '2020-01-01', '2030-12-31', 1)
        """)
        promo_id = cur.lastrowid

        cur.execute("""
            INSERT INTO promotion_items (promotion_id, product_id, discount_type, discount_val)
            VALUES (?, ?, 'pct', 10)
        """, (promo_id, p_id))

        db.commit()
    finally:
        db.close()

    result = calculate_effective_price(product_id=p_id, customer_id=cust_id)
    assert result["base_price"] == 200000
    assert result["final_price"] == 150000
    assert result["discount_applied"] == 50000
    assert result["applied_source"] == "segment_price_list"


def test_multiple_promo_items_and_custom_price_list():
    """
    Multiple promo items: Promo A (fixed 30.000 discount) vs Promo B (pct 40% discount).
    Plus Price List explicitly configured for customer segment.
    """
    db = get_db()
    try:
        cur = db.cursor()
        # Product base 100.000
        cur.execute("INSERT OR REPLACE INTO products (code, name, type, sell_price, cost_price, stock, unit) VALUES ('TEST_PROD_MULTI', 'Sữa Tắm Chó Test', 'product', 100000, 50000, 15, 'chai')")
        p_id = cur.lastrowid

        # Price list with price = 75.000
        cur.execute("INSERT INTO price_lists (code, name) VALUES ('TEST_PL_VIP', 'Bảng Giá VIP')")
        pl_id = cur.lastrowid

        cur.execute("INSERT INTO product_price_list (price_list_id, product_id, price) VALUES (?, ?, 75000)", (pl_id, p_id))

        cur.execute("INSERT INTO customer_segments (code, name, discount_percent, priority, price_list_id) VALUES ('TEST_SEG_VIP', 'VIP Segment', 0, 1, ?)", (pl_id,))
        seg_id = cur.lastrowid

        cur.execute("INSERT INTO contacts (name, phone, type, segment_id) VALUES ('Khách VIP', 'TEST_PHONE_VIP', 'customer', ?)", (seg_id,))
        cust_id = cur.lastrowid

        # Promo 1: fixed 30.000 -> 70.000
        cur.execute("INSERT INTO promotions (code, name, is_active) VALUES ('TEST_KM_FIXED', 'KM Fixed 30k', 1)")
        promo_fixed_id = cur.lastrowid
        cur.execute("INSERT INTO promotion_items (promotion_id, product_id, discount_type, discount_val) VALUES (?, ?, 'fixed', 30000)", (promo_fixed_id, p_id))

        # Promo 2: pct 40% -> 60.000 (better than 70.000 and better than PL 75.000)
        cur.execute("INSERT INTO promotions (code, name, is_active) VALUES ('TEST_KM_PCT40', 'KM Pct 40%', 1)")
        promo_pct_id = cur.lastrowid
        cur.execute("INSERT INTO promotion_items (promotion_id, product_id, discount_type, discount_val) VALUES (?, ?, 'pct', 40)", (promo_pct_id, p_id))

        db.commit()
    finally:
        db.close()

    result = calculate_effective_price(product_id=p_id, customer_id=cust_id)
    assert result["base_price"] == 100000
    assert result["final_price"] == 60000
    assert result["discount_applied"] == 40000
    assert result["applied_source"] == "promotion"
    assert result["promo_id"] == promo_pct_id

    # If promo 2 expired, should pick promo 1 (70.000)
    db = get_db()
    try:
        cur = db.cursor()
        cur.execute("UPDATE promotions SET is_active = 0 WHERE id = ?", (promo_pct_id,))
        db.commit()
    finally:
        db.close()

    result2 = calculate_effective_price(product_id=p_id, customer_id=cust_id)
    assert result2["final_price"] == 70000
    assert result2["applied_source"] == "promotion"
    assert result2["promo_id"] == promo_fixed_id

    # If both promos deactivated, should fall back to price_list (75.000)
    db = get_db()
    try:
        cur = db.cursor()
        cur.execute("UPDATE promotions SET is_active = 0 WHERE id = ?", (promo_fixed_id,))
        db.commit()
    finally:
        db.close()

    result3 = calculate_effective_price(product_id=p_id, customer_id=cust_id)
    assert result3["final_price"] == 75000
    assert result3["applied_source"] == "segment_price_list"
    assert result3["price_list_id"] == pl_id
