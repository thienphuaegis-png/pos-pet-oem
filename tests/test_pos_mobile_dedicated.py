import pytest
from fastapi.testclient import TestClient
from pathlib import Path
from server import app

client = TestClient(app)

def test_pos_mobile_route_exists():
    """Kiểm tra route GET /pos/m trả về status 200 và load template pos_mobile.html"""
    res = client.get("/pos/m")
    assert res.status_code == 200
    assert "pos_mobile.js" in res.text
    assert 'id="mobile-cart-dock"' in res.text

def test_pos_mobile_files_exist():
    """Kiểm tra sự tồn tại của template và js chuyên dụng"""
    template_path = Path("templates/pos_mobile.html")
    js_path = Path("static/js/pos_mobile.js")
    assert template_path.exists(), "templates/pos_mobile.html phải tồn tại"
    assert js_path.exists(), "static/js/pos_mobile.js phải tồn tại"

def test_pos_desktop_has_mobile_redirect():
    """Kiểm tra trang pos.html desktop có script tự nhận diện và điều hướng sang /pos/m"""
    pos_html = Path("templates/pos.html").read_text(encoding="utf-8")
    assert "/pos/m" in pos_html, "templates/pos.html phải có đường dẫn điều hướng tới /pos/m"
