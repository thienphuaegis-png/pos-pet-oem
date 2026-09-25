import sqlite3
import pytest
from fastapi.testclient import TestClient
from server import app
from database import get_db

client = TestClient(app)

def test_pet_pricing_custom_category_api():
    # 1. Tạo mức giá với phân loại người dùng tự đặt
    custom_cat = "Dịch Vụ VIP Tự Đặt"
    payload = {
        "service_name": "Tắm Dưỡng Lông Hoàng Gia",
        "category": custom_cat,
        "min_weight": 2.0,
        "max_weight": 8.0,
        "price": 350000.0
    }
    res = client.post("/api/pet-services/pricing", json=payload)
    assert res.status_code == 200, res.text
    created = res.json()
    assert created["id"] > 0
    created_id = created["id"]

    try:
        # 2. Đọc lại danh sách giá
        res_list = client.get("/api/pet-services/pricing")
        assert res_list.status_code == 200
        items = res_list.json()
        item = next((x for x in items if x["id"] == created_id), None)
        assert item is not None
        assert item["category"] == custom_cat
        assert item["service_name"] == "Tắm Dưỡng Lông Hoàng Gia"
        assert item["price"] == 350000.0
    finally:
        # Cleanup
        client.delete(f"/api/pet-services/pricing/{created_id}")

def test_pet_pricing_html_and_js_integrity():
    with open("templates/index.html", "r", encoding="utf-8") as f:
        html = f.read()

    # Kiểm tra thead có đủ 6 cột
    assert '<th class="p-2.5 text-center w-12">STT</th>' in html
    assert '<th class="p-2.5">Phân Loại</th>' in html
    assert '<th class="p-2.5">Tên Dịch Vụ</th>' in html
    assert '<th class="p-2.5 text-center">Khoảng Cân Nặng</th>' in html
    assert '<th class="p-2.5 text-right">Đơn Giá (VNĐ)</th>' in html
    assert '<th class="p-2.5 text-center w-28">Thao Tác</th>' in html

    # Kiểm tra phân loại có select chọn lại và nút thêm nhanh
    assert 'id="pet-pricing-input-cat"' in html
    assert 'openQuickAddSpaCategoryModal()' in html
    assert 'id="modal-quick-add-spa-category"' in html
    assert 'id="quick-spa-category-name"' in html
    assert 'saveQuickSpaCategory()' in html

    # Kiểm tra modal quản lý phân loại có mặt trong HTML
    assert 'id="modal-spa-category-manager"' in html
    assert 'id="new-spa-category-mgr-name"' in html
    assert 'id="spa-category-mgr-list"' in html
    assert 'openSpaCategoryManagerModal()' in html

    # Kiểm tra 2 dropdown gói dịch vụ đã được dọn sạch các option tĩnh cứng
    assert '<select id="svc-primary-package" onchange="autoCalculateServicePrice()"' in html
    assert '<option value="">-- Chọn gói chính --</option>' in html
    assert 'CB Tắm (1+2+3)' not in html  # Không còn bị gán cứng trong HTML
    assert '<select id="svc-dye-package" onchange="autoCalculateServicePrice()"' in html
    assert '<option value="">-- Không nhuộm --</option>' in html

    # Kiểm tra static/js/app.js có các hàm xử lý phân loại & quản lý sửa xóa
    with open("static/js/app.js", "r", encoding="utf-8") as f:
        js = f.read()
    assert 'formatWeightRange' in js
    assert 'updatePetPricingCategoryUI' in js
    assert 'populateServicePackageDropdowns' in js
    assert 'openQuickAddSpaCategoryModal' in js
    assert 'saveQuickSpaCategory' in js
    assert 'openSpaCategoryManagerModal' in js
    assert 'saveSpaCategoryFromManager' in js
    assert 'editSpaCategoryInline' in js
    assert 'saveEditSpaCategory' in js
    assert 'deleteSpaCategoryFromManager' in js
    assert 'allSpaCategories' in js

def test_spa_categories_crud_and_sync():
    # 1. Test tạo phân loại Spa qua API
    cat_name = f"Phân Loại Test {sqlite3.connect('data/pos.db').total_changes}"
    res = client.post("/api/pet-services/categories", json={"name": cat_name})
    assert res.status_code == 200, res.text
    data = res.json()
    assert data["name"] == cat_name
    cat_id = data["id"]

    # Tạo 1 mức giá liên kết với phân loại này
    res_svc = client.post("/api/pet-services/pricing", json={
        "service_name": "Dịch vụ test sync",
        "category": cat_name,
        "min_weight": 1.0,
        "max_weight": 5.0,
        "price": 120000.0
    })
    assert res_svc.status_code == 200
    svc_id = res_svc.json()["id"]

    try:
        # 2. Test SỬA (Đổi tên phân loại)
        new_name = f"{cat_name} Renamed"
        res_update = client.put(f"/api/pet-services/categories/{cat_id}", json={"name": new_name})
        assert res_update.status_code == 200, res_update.text
        assert res_update.json()["name"] == new_name

        # Kiểm tra bảng pet_service_pricing đã tự động đồng bộ tên mới chưa
        res_svc_check = client.get("/api/pet-services/pricing")
        svc_item = next((s for s in res_svc_check.json() if s["id"] == svc_id), None)
        assert svc_item is not None
        assert svc_item["category"] == new_name, "Dịch vụ chưa được tự động đồng bộ tên phân loại mới!"

        # 3. Test XÓA phân loại
        res_del = client.delete(f"/api/pet-services/categories/{cat_id}")
        assert res_del.status_code == 200, res_del.text

        # Kiểm tra phân loại đã xóa khỏi danh mục
        res_cats_after = client.get("/api/pet-services/categories")
        assert not any(c["id"] == cat_id for c in res_cats_after.json())

        # Kiểm tra mức giá dịch vụ đã được an toàn chuyển về phân loại mặc định 'Dịch Vụ Lẻ Chó'
        res_svc_check2 = client.get("/api/pet-services/pricing")
        svc_item2 = next((s for s in res_svc_check2.json() if s["id"] == svc_id), None)
        assert svc_item2 is not None
        assert svc_item2["category"] == "Dịch Vụ Lẻ Chó", "Dịch vụ phải được chuyển an toàn về 'Dịch Vụ Lẻ Chó'!"

    finally:
        # Cleanup
        client.delete(f"/api/pet-services/pricing/{svc_id}")

def test_prevent_delete_default_spa_category():
    # Tìm id của 'Dịch Vụ Lẻ Chó'
    res = client.get("/api/pet-services/categories")
    assert res.status_code == 200
    default_cat = next((c for c in res.json() if c["name"].strip().lower() == "dịch vụ lẻ chó"), None)
    if default_cat:
        res_del = client.delete(f"/api/pet-services/categories/{default_cat['id']}")
        assert res_del.status_code == 400
        assert "mặc định" in res_del.text
