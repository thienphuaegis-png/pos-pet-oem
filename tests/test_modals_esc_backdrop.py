import re
from pathlib import Path

TARGET_MODALS = [
    # Nhập hàng
    ("modal-purchase-order", "closePurchaseModal()"),
    ("modal-receive-purchase", "closeReceiveModal()"),
    ("modal-pay-purchase", "closePayPurchaseModal()"),
    ("modal-quick-assign-supplier", "closeQuickAssignSupplierModal()"),
    ("modal-production-detail", "closeProdDetailModal()"),
    # OEM
    ("modal-create-oem", "closeModalCreateOEM()"),
    ("modal-receive-oem", "closeModalReceiveOEM()"),
    ("modal-detail-oem", "closeModalDetailOEM()"),
    ("modal-manage-oem-factories", "closeModalManageOEMFactories()"),
    # Khách hàng
    ("modal-contact", "closeContactModal()"),
    ("modal-contact-detail", "closeContactDetailModal()"),
    ("modal-contacts-import", "closeImportContactsModal()"),
    ("modal-pay-debt", "closePayDebtModal()"),
    # Dòng tiền & Nợ NCC
    ("modal-create-cashbook", "closeCreateCashModal()"),
    ("modal-cashbook-acc-picker", "closeCashbookAccPickerModal()"),
    ("modal-cfd-supplier-orders", "closeModalCFDSupplierOrders()"),
    ("modal-cfd-pay-order", "closeModalCFDPayOrder()"),
    ("modal-cfd-pay-supplier", "closeModalPaySupplierDebt()"),
    ("modal-cfd-supp-picker", "closeCFDPaySuppPickerModal()"),
    ("modal-cfd-debt-plan", "closeModalCreateDebtPlan()"),
    ("modal-plan-order-picker", "closePlanOrderPickerModal()"),
    ("modal-quick-edit-debt", "closeQuickEditDebtModal()"),
]

def test_modals_have_backdrop_click():
    """Kiểm tra tất cả các modal mục tiêu đều có onclick='if(event.target === this) ...'"""
    html = Path("templates/index.html").read_text(encoding="utf-8")
    for mid, close_fn in TARGET_MODALS:
        pattern = rf'<div\s+id="{mid}"[^>]*>'
        m = re.search(pattern, html)
        assert m is not None, f"Không tìm thấy thẻ div với id='{mid}' trong index.html"
        tag = m.group(0)
        expected_onclick = f'onclick="if(event.target === this) {close_fn}"'
        assert expected_onclick in tag, f"Modal #{mid} thiếu backdrop click '{expected_onclick}'. Tag hiện tại: {tag}"

def test_app_js_active_modals_contains_all_targets():
    """Kiểm tra app.js ESC handler có đầy đủ tất cả các modal ID mục tiêu"""
    app_js = Path("static/js/app.js").read_text(encoding="utf-8")
    for mid, _ in TARGET_MODALS:
        assert f"'{mid}'" in app_js or f'"{mid}"' in app_js, f"app.js thiếu modal '{mid}' trong activeModals"
