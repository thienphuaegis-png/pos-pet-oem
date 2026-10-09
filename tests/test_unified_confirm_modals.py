from pathlib import Path

def test_unified_ui_confirm_modals_replaced():
    """Kiểm tra các hàm nghiệp vụ quan trọng đã chuyển từ confirm() sang showConfirmModal()"""
    # 1. Topup deletion
    pos_js = Path("static/js/pos.js").read_text(encoding="utf-8")
    assert "showConfirmModal" in pos_js
    assert "confirmDeleteTopupTx" in pos_js
    assert "Xác Nhận Xóa & Hoàn Tác" in pos_js

    # 2. Contacts / Partners deletion
    contacts_js = Path("static/js/modules/contacts.js").read_text(encoding="utf-8")
    assert "showConfirmModal" in contacts_js
    assert "deleteContact" in contacts_js
    assert "Xác Nhận Xóa Khách Hàng" in contacts_js or "Xác Nhận Xóa" in contacts_js

    # 3. OEM Order deletion
    prod_js = Path("static/js/modules/productions.js").read_text(encoding="utf-8")
    assert "showConfirmModal" in prod_js
    assert "deleteOEMOrder" in prod_js
    assert "Cảnh Báo Xóa Đơn OEM" in prod_js

    # 4. System Update & Warehouse
    app_js = Path("static/js/app.js").read_text(encoding="utf-8")
    assert "Xác Nhận Cập Nhật Máy Chủ POS" in app_js
    assert "Xác Nhận Xóa Kho Hàng" in app_js
