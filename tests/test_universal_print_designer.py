import pytest
from starlette.testclient import TestClient
from server import app

client = TestClient(app)

def test_get_print_template_pos_retail():
    """Kiểm tra lấy mẫu in bán lẻ POS kèm danh sách tokens"""
    res = client.get("/api/settings/print-templates/pos_retail")
    assert res.status_code == 200
    data = res.json()
    assert "content_html" in data
    assert "paper_size" in data
    assert "tokens" in data
    token_keys = [t["key"] for t in data["tokens"]]
    assert "ten_cua_hang" in token_keys
    assert "ma_hoa_don" in token_keys

def test_get_print_template_oem_order():
    """Kiểm tra lấy mẫu in gia công OEM kèm tokens đặc thù OEM"""
    res = client.get("/api/settings/print-templates/oem_order")
    assert res.status_code == 200
    data = res.json()
    assert data["paper_size"] in ["A4", "A5"]
    token_keys = [t["key"] for t in data["tokens"]]
    assert "xuong_gia_cong" in token_keys
    assert "tien_coc" in token_keys
    assert "vat_percent" in token_keys

def test_save_and_retrieve_custom_print_template():
    """Kiểm tra lưu và đọc lại mẫu in tùy biến"""
    custom_html = "<div class='custom-bill'><h1>HOA DON TEST</h1><p>{{ma_hoa_don}}</p></div>"
    res = client.post("/api/settings/print-templates/pos_retail", json={
        "content_html": custom_html,
        "paper_size": "K80",
        "orientation": "portrait"
    })
    assert res.status_code == 200
    
    # Đọc lại
    get_res = client.get("/api/settings/print-templates/pos_retail")
    assert get_res.status_code == 200
    assert get_res.json()["content_html"] == custom_html

def test_get_sample_data_for_preview():
    """Kiểm tra lấy dữ liệu mẫu để render xem trước Live Preview"""
    res = client.get("/api/settings/print-templates/oem_order/sample-data")
    assert res.status_code == 200
    data = res.json()
    assert "xuong_gia_cong" in data
    assert "Lucky Star" in data["xuong_gia_cong"]
    assert "danh_sach_hang" in data
    assert len(data["danh_sach_hang"]) > 0

def test_print_designer_frontend_elements_exist():
    """Kiểm tra giao diện index.html chứa các phần tử của Trình Chỉnh Mẫu In WYSIWYG + Token"""
    res = client.get("/")
    assert res.status_code == 200
    html = res.text
    assert 'id="print-designer-doc-type"' in html
    assert 'id="wysiwyg-content-area"' in html
    assert 'id="wysiwyg-live-paper"' in html
    assert 'id="modal-print-token-picker"' in html
    assert 'print_designer.js' in html
