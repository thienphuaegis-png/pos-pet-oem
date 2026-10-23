import sys
import os
sys.path.insert(0, os.path.dirname(os.path.dirname(__file__)))
import pytest
from fastapi.testclient import TestClient
from server import app
from database import init_db, get_db
from tests.auth_helpers import owner_auth_headers

init_db()
client = TestClient(app, headers=owner_auth_headers())

def test_get_pet_catalog_defaults():
    """Kiểm tra GET /api/settings/pet-catalog trả về danh mục màu và giống mặc định."""
    # Xóa config tùy chỉnh nếu có trong settings để test fallback
    conn = get_db()
    cur = conn.cursor()
    cur.execute("DELETE FROM settings WHERE key IN ('pet_colors_catalog', 'pet_breeds_catalog')")
    conn.commit()
    conn.close()

    res = client.get("/api/settings/pet-catalog")
    assert res.status_code == 200, res.text
    data = res.json()
    assert "colors" in data
    assert "breeds" in data
    assert isinstance(data["colors"], list)
    assert isinstance(data["breeds"], list)
    assert len(data["colors"]) >= 10
    assert "Trắng" in data["colors"]
    assert "Poodle" in data["breeds"]

def test_update_pet_catalog_and_read_back():
    """Kiểm tra POST /api/settings/pet-catalog lưu cấu hình mới và GET trả về đúng."""
    new_colors = ["Trắng", "Đen Tuyển", "Vàng Kem Cỏ Cháy", "Xám Khói"]
    new_breeds = ["Poodle Tiny", "Corgi Chân Ngắn", "Mèo Anh Lông Ngắn"]

    res = client.post("/api/settings/pet-catalog", json={
        "colors": new_colors,
        "breeds": new_breeds
    })
    assert res.status_code == 200, res.text
    assert res.json().get("status") == "ok"

    # Đọc lại bằng GET
    res_get = client.get("/api/settings/pet-catalog")
    assert res_get.status_code == 200
    data = res_get.json()
    # Kiểm tra các màu/giống mới đã có
    for c in new_colors:
        assert c in data["colors"]
    for b in new_breeds:
        assert b in data["breeds"]

def test_restore_defaults_pet_catalog():
    """Kiểm tra POST /api/settings/pet-catalog/restore-defaults khôi phục danh mục chuẩn."""
    res = client.post("/api/settings/pet-catalog/restore-defaults")
    assert res.status_code == 200
    data = res.json()
    assert data.get("status") == "ok"

    res_get = client.get("/api/settings/pet-catalog")
    data_get = res_get.json()
    assert "Trắng" in data_get["colors"]
    assert "Socola" in data_get["colors"]
    assert "Poodle" in data_get["breeds"]
