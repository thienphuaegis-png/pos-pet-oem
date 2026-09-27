import os
import re
import pytest

BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

def test_pos_thermal_css_page_auto():
    """Kiểm tra máy in nhiệt K80 trong pos.js sử dụng size: auto; margin: 0mm thay vì 80mm auto."""
    pos_path = os.path.join(BASE_DIR, "static", "js", "pos.js")
    with open(pos_path, "r", encoding="utf-8") as f:
        content = f.read()

    # Phải có size: auto; margin: 0mm cho thermal in iframe
    assert "@page { size: auto; margin: 0mm; }" in content, "pos.js phải dùng chuẩn @page { size: auto; margin: 0mm; } cho in nhiệt"
    assert "size: 80mm auto" not in content, "pos.js không được dùng size: 80mm auto vì lỗi trên nhiều trình duyệt"

def test_cashbook_print_templates():
    """Kiểm tra chức năng in Phiếu Thu/Chi có mẫu A4/A5 và chuẩn CSS máy in nhiệt."""
    prod_path = os.path.join(BASE_DIR, "static", "js", "modules", "productions.js")
    with open(prod_path, "r", encoding="utf-8") as f:
        content = f.read()

    assert "printCashbookVoucherA4" in content, "productions.js phải có hàm in phiếu thu chi A4"
    assert "@page { size: auto; margin: 0mm; }" in content, "productions.js phải dùng chuẩn @page { size: auto; margin: 0mm; } cho in phiếu thu chi K80"
    assert "numberToVietnameseWords" in content or "docSoTienTiengViet" in content, "productions.js phải có hàm đọc số tiền thành chữ cho phiếu thu chi A4"

def test_stock_audit_print_template():
    """Kiểm tra chức năng in Phiếu Kiểm Kê Hàng Hóa khổ A4."""
    app_path = os.path.join(BASE_DIR, "static", "js", "app.js")
    with open(app_path, "r", encoding="utf-8") as f:
        content = f.read()

    assert "printStockAuditA4" in content, "app.js phải có hàm printStockAuditA4 để in phiếu kiểm kê"

def test_ui_print_buttons_present():
    """Kiểm tra UI có nút in phiếu kiểm kê và các nút in phiếu thu chi."""
    idx_path = os.path.join(BASE_DIR, "templates", "index.html")
    with open(idx_path, "r", encoding="utf-8") as f:
        content = f.read()

    assert "printStockAuditA4" in content, "index.html phải có nút gọi printStockAuditA4"
    assert "printCashbookVoucherA4" in content or "printCurrentCashbookVoucherA4" in content, "index.html phải có nút in phiếu thu chi A4"

def test_template_presets_include_all_business_types():
    """Kiểm tra danh mục mẫu in trong productions.js có đủ các mẫu thực tế: spa, thu, chi, kiểm kê."""
    prod_path = os.path.join(BASE_DIR, "static", "js", "modules", "productions.js")
    with open(prod_path, "r", encoding="utf-8") as f:
        content = f.read()

    expected_keys = [
        "spa_intake_k80",
        "spa_invoice_k80",
        "cashbook_thu_k80",
        "cashbook_thu_a4",
        "cashbook_chi_k80",
        "cashbook_chi_a4",
        "stock_audit_a4"
    ]
    for key in expected_keys:
        assert key in content, f"Thiếu preset {key} trong productions.js"

