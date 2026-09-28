import pytest
from fastapi.testclient import TestClient
from server import app
from database import get_db

client = TestClient(app)

def get_auth_token():
    # Login as admin to get token
    res = client.post("/api/auth/login", data={"username": "admin", "password": "admin123"})
    if res.status_code == 200:
        return res.json().get("access_token")
    return None

import time

def test_product_category_crud_and_bulk_discount():
    token = get_auth_token()
    headers = {"Authorization": f"Bearer {token}"} if token else {}

    ts = int(time.time() * 1000)
    c1 = f"CAT-01-{ts}"
    c2 = f"CAT-02-{ts}"

    # 1. Tạo 2 sản phẩm thuộc 2 nhóm khác nhau: "Thức ăn" và "Phụ kiện"
    res1 = client.post("/api/products", json={
        "code": c1,
        "name": f"Hạt Cát Vệ Sinh {ts}",
        "type": "product",
        "category": "Vệ sinh",
        "sell_price": 100000,
        "cost_price": 50000,
        "stock": 10,
        "unit": "bao"
    }, headers=headers)
    assert res1.status_code == 200
    p1_id = res1.json()["id"]

    res2 = client.post("/api/products", json={
        "code": c2,
        "name": f"Pate Mèo Cao Cấp {ts}",
        "type": "product",
        "category": "Thức ăn",
        "sell_price": 50000,
        "cost_price": 25000,
        "stock": 20,
        "unit": "lon"
    }, headers=headers)
    assert res2.status_code == 200
    p2_id = res2.json()["id"]

    # 2. Kiểm tra API GET /api/products/categories
    res_cats = client.get("/api/products/categories", headers=headers)
    assert res_cats.status_code == 200
    cats = res_cats.json()
    assert "Vệ sinh" in cats
    assert "Thức ăn" in cats

    # 3. Lọc GET /api/products?category=Thức ăn
    res_filter = client.get("/api/products?category=Thức ăn", headers=headers)
    assert res_filter.status_code == 200
    filtered = res_filter.json()
    assert any(x["id"] == p2_id for x in filtered)
    assert not any(x["id"] == p1_id for x in filtered)

    # 4. Tạo bảng giá mới và áp dụng bulk-discount riêng cho nhóm "Thức ăn" (giảm 20%)
    res_pl = client.post("/api/price-lists", json={
        "code": f"PL-CAT-{ts}",
        "name": "Bảng Giá Thử Nghiệm Nhóm Hàng",
        "description": "Test"
    }, headers=headers)
    assert res_pl.status_code == 200
    pl_id = res_pl.json()["id"]

    # Áp dụng giảm 20% CHỈ cho nhóm "Thức ăn"
    res_bulk = client.post(f"/api/price-lists/{pl_id}/bulk-discount", json={
        "discount_percent": 20,
        "category": "Thức ăn"
    }, headers=headers)
    assert res_bulk.status_code == 200

    # Lấy ma trận giá
    res_matrix = client.get(f"/api/price-lists/{pl_id}/matrix?category=Thức ăn", headers=headers)
    assert res_matrix.status_code == 200
    matrix_thucan = res_matrix.json()
    p2_entry = next((x for x in matrix_thucan if x["product_id"] == p2_id), None)
    assert p2_entry is not None
    assert p2_entry["is_custom"] == 1
    # 50,000 * (1 - 0.2) = 40,000
    assert p2_entry["effective_price"] == 40000

    # Kiểm tra sản phẩm nhóm "Vệ sinh" KHÔNG bị áp dụng giảm giá trong bảng này
    res_matrix_all = client.get(f"/api/price-lists/{pl_id}/matrix", headers=headers)
    assert res_matrix_all.status_code == 200
    p1_entry = next((x for x in res_matrix_all.json() if x["product_id"] == p1_id), None)
    assert p1_entry is not None
    assert p1_entry["is_custom"] == 0

    # 5. Kiểm tra tính năng thêm khuyến mãi hàng loạt theo nhóm (Bulk promotion by category)
    res_promo = client.post("/api/promotions", json={
        "code": f"KM-CAT-{ts}",
        "name": "Sale Nhóm Vệ Sinh 15%",
        "is_active": 1
    }, headers=headers)
    assert res_promo.status_code == 200
    promo_id = res_promo.json()["id"]

    res_bulk_promo = client.post(f"/api/promotions/{promo_id}/items/bulk-by-category", json={
        "category": "Vệ sinh",
        "discount_type": "pct",
        "discount_val": 15
    }, headers=headers)
    assert res_bulk_promo.status_code == 200
    assert res_bulk_promo.json()["added_count"] >= 1

    # Kiểm tra chi tiết promotion đã có sản phẩm của nhóm Vệ sinh
    res_promo_detail = client.get(f"/api/promotions/{promo_id}", headers=headers)
    assert res_promo_detail.status_code == 200
    promo_items = res_promo_detail.json()["items"]
    assert any(x["product_id"] == p1_id and x["discount_val"] == 15 for x in promo_items)

    # Dọn dẹp dữ liệu test
    client.delete(f"/api/promotions/{promo_id}", headers=headers)
    client.delete(f"/api/price-lists/{pl_id}", headers=headers)
    client.delete(f"/api/products/{p1_id}", headers=headers)
    client.delete(f"/api/products/{p2_id}", headers=headers)
