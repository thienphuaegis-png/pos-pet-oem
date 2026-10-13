from pathlib import Path

def test_pos_js_select_customer_includes_address():
    """Kiểm tra selectCustomerForActiveTab gán address vào tab.customer."""
    js = Path("static/js/pos.js").read_text(encoding="utf-8")
    assert "address: cust.address" in js

def test_pos_js_auto_injects_customer_address():
    """Kiểm tra renderAndPrint tự động inject khối customer_address nếu preset chưa có mà khách có địa chỉ."""
    js = Path("static/js/pos.js").read_text(encoding="utf-8")
    assert "auto_customer_address" in js or "catalog_key === 'customer_address'" in js

def test_pos_js_landscape_multipage_preview_not_clipped():
    """Kiểm tra preview modal không bị overflow: hidden làm cắt cụt phần tử khi đơn nhiều dòng."""
    js = Path("static/js/pos.js").read_text(encoding="utf-8")
    assert "overflow: visible" in js
