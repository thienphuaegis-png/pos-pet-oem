from pathlib import Path

def test_topup_payment_account_dom_elements():
    """Kiểm tra các ID và sự kiện chọn tài khoản thanh toán nạp ví Spa trong templates/index.html"""
    html_path = Path("templates/index.html")
    assert html_path.exists()
    content = html_path.read_text(encoding="utf-8")

    assert 'id="modal-topup-spa"' in content
    assert 'id="pos-topup-pay-method"' in content
    assert 'onPosTopupPayMethodChange(this.value)' in content
    assert 'id="pos-topup-bank-account-box"' in content
    assert 'id="pos-topup-account-id"' in content
    assert 'id="btn-confirm-recharge"' in content
    assert 'submitTopupSpaRecharge()' in content

def test_topup_payment_account_js_logic():
    """Kiểm tra hàm onPosTopupPayMethodChange và gửi account_id trong static/js/pos.js"""
    js_path = Path("static/js/pos.js")
    assert js_path.exists()
    content = js_path.read_text(encoding="utf-8")

    assert "function onPosTopupPayMethodChange" in content
    assert "pos-topup-bank-account-box" in content
    assert "pos-topup-account-id" in content
    assert "window.onPosTopupPayMethodChange = onPosTopupPayMethodChange" in content
    assert "account_id: accountId" in content
