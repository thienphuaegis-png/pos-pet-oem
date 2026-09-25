import pytest
import sqlite3
import os
import time
from fastapi.testclient import TestClient
from server import app
from database import get_db, init_db

client = TestClient(app)

def get_auth_token():
    res = client.post("/api/auth/login", data={"username": "admin", "password": "admin123"})
    if res.status_code == 200:
        return res.json().get("access_token")
    return None

def test_database_schema_spa_promotions_and_price_lists():
    init_db()
    conn = get_db()
    cur = conn.cursor()

    # 1. Kiểm tra các cột mới trong bảng promotion_items
    cur.execute("PRAGMA table_info(promotion_items)")
    cols = {r["name"]: r for r in cur.fetchall()}
    assert "target_type" in cols, "Thiếu cột target_type trong promotion_items"
    assert "service_name" in cols, "Thiếu cột service_name trong promotion_items"
    assert "spa_category" in cols, "Thiếu cột spa_category trong promotion_items"

    # 2. Kiểm tra bảng mới price_list_spa_items
    cur.execute("PRAGMA table_info(price_list_spa_items)")
    pl_cols = {r["name"]: r for r in cur.fetchall()}
    assert "id" in pl_cols, "Thiếu bảng price_list_spa_items hoặc cột id"
    assert "price_list_id" in pl_cols, "Thiếu cột price_list_id"
    assert "target_type" in pl_cols, "Thiếu cột target_type"
    assert "service_name" in pl_cols, "Thiếu cột service_name"
    assert "spa_category" in pl_cols, "Thiếu cột spa_category"
    assert "discount_percent" in pl_cols, "Thiếu cột discount_percent"

    conn.close()

def test_spa_best_offer_pricing_and_apis():
    token = get_auth_token()
    headers = {"Authorization": f"Bearer {token}"} if token else {}
    ts = int(time.time() * 1000)
    svc_test_name = f"Test-Svc-{ts}"
    cat_test_name = f"Test-Cat-{ts}"

    # Đảm bảo có mức giá test trong pet_service_pricing
    conn = get_db()
    cur = conn.cursor()
    cur.execute("""
        INSERT INTO pet_service_pricing (service_name, category, min_weight, max_weight, price)
        VALUES (?, ?, 2.0, 6.0, 100000)
    """, (svc_test_name, cat_test_name))
    conn.commit()
    conn.close()

    # Base price cho 3.5kg gói svc_test_name là 100,000 đ
    # 1. Gọi API tính giá gốc khi chưa có KM / phân hạng
    res_base = client.post("/api/pricing/calculate-spa", json={
        "service_name": svc_test_name,
        "weight": 3.5
    }, headers=headers)
    assert res_base.status_code == 200, f"API calculate-spa failed: {res_base.text}"
    data_base = res_base.json()
    assert data_base["base_price"] == 100000
    assert data_base["final_price"] == 100000
    assert data_base["applied_source"] == "original"

    # 2. Tạo Bảng giá riêng cho Spa: Giảm 10% gói svc_test_name
    res_pl = client.post("/api/price-lists", json={
        "code": f"PL-SPA-{ts}",
        "name": f"Bảng Giá VIP Spa {ts}",
        "description": "Test Spa"
    }, headers=headers)
    assert res_pl.status_code == 200
    pl_id = res_pl.json()["id"]

    res_pl_item = client.post(f"/api/price-lists/{pl_id}/spa-items", json={
        "target_type": "service",
        "service_name": svc_test_name,
        "discount_percent": 10
    }, headers=headers)
    assert res_pl_item.status_code == 200

    # Tạo phân khúc gán bảng giá này
    res_seg = client.post("/api/customer-segments", json={
        "code": f"SEG-SPA-{ts}",
        "name": "Khách VIP Spa",
        "price_list_id": pl_id
    }, headers=headers)
    assert res_seg.status_code == 200
    seg_id = res_seg.json()["id"]

    # Tạo khách hàng thuộc phân khúc này
    res_cust = client.post("/api/contacts", json={
        "type": "customer",
        "name": f"Khách Hàng VIP {ts}",
        "phone": f"09{ts % 100000000:08d}",
        "segment_id": seg_id
    }, headers=headers)
    assert res_cust.status_code == 200
    cust_id = res_cust.json()["id"]

    # 3. Tính giá cho Khách VIP: Phải nhận giá phân khúc = 90,000 đ
    res_vip = client.post("/api/pricing/calculate-spa", json={
        "customer_id": cust_id,
        "service_name": svc_test_name,
        "weight": 3.5
    }, headers=headers)
    assert res_vip.status_code == 200
    data_vip = res_vip.json()
    assert data_vip["final_price"] == 90000
    assert data_vip["applied_source"] == "segment_price_list"

    # 4. Tạo Chương trình Khuyến Mãi Spa 20% (Best Offer > 10% của VIP)
    res_km = client.post("/api/promotions", json={
        "code": f"KM-SPA-{ts}",
        "name": f"Khuyến Mãi Mùa Hè Spa {ts}",
        "is_active": 1
    }, headers=headers)
    assert res_km.status_code == 200
    km_id = res_km.json()["id"]

    res_km_item = client.post(f"/api/promotions/{km_id}/items/spa", json={
        "target_type": "spa_service",
        "service_name": svc_test_name,
        "discount_type": "pct",
        "discount_val": 20
    }, headers=headers)
    assert res_km_item.status_code == 200

    # 5. Tính giá lại cho Khách VIP: Best Offer phải chọn KM 20% (80,000 đ < 90,000 đ)
    res_best = client.post("/api/pricing/calculate-spa", json={
        "customer_id": cust_id,
        "service_name": svc_test_name,
        "weight": 3.5
    }, headers=headers)
    assert res_best.status_code == 200
    data_best = res_best.json()
    assert data_best["final_price"] == 80000
    assert data_best["applied_source"] == "promotion"
    assert data_best["discount_applied"] == 20000

    # Cleanup
    client.delete(f"/api/promotions/{km_id}", headers=headers)
    client.delete(f"/api/customer-segments/{seg_id}", headers=headers)
    client.delete(f"/api/price-lists/{pl_id}", headers=headers)
    client.delete(f"/api/contacts/{cust_id}", headers=headers)

