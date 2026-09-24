import re
from pathlib import Path

def test_loyalty_frontend_dom_elements():
    """Kiểm tra các ID và modal của Loyalty, Pricing & Topup Spa trong templates/index.html"""
    html_path = Path("templates/index.html")
    assert html_path.exists(), "Không tìm thấy templates/index.html"
    content = html_path.read_text(encoding="utf-8")

    # 1. POS Customer Loyalty & Spa Wallet
    assert 'id="cust-points-badge"' in content
    assert 'id="cust-spa-wallet-bar"' in content
    assert 'id="cust-wallet-badge"' in content
    assert 'openTopupSpaModal()' in content

    # 2. Modal Topup Spa tại quầy
    assert 'id="modal-topup-spa"' in content
    assert 'id="pos-topup-cust-name"' in content
    assert 'id="pos-topup-current-balance"' in content
    assert 'id="pos-topup-packages-list"' in content
    assert 'id="btn-confirm-recharge"' in content
    assert 'submitTopupSpaRecharge()' in content

    # 3. Spa Wallet Deduction in Checkout
    assert 'id="pos-spa-wallet-row"' in content
    assert 'id="pos-use-spa-wallet"' in content
    assert 'id="pos-spa-wallet-deduct-display"' in content
    assert 'toggleUseSpaWallet()' in content

    # 4. Settings: Topup Packages Management
    assert 'data-sub="topup-packages"' in content
    assert 'id="settings-sub-topup-packages"' in content
    assert 'id="topup-packages-tbody"' in content
    assert 'id="modal-topup-package"' in content
    assert 'openTopupPackageModal()' in content

    # 5. Customer Segments Points & Loyalty Configuration
    assert 'id="seg-min-points"' in content
    assert 'id="seg-allow-points"' in content

    # 6. Price Lists & Promotions Sub-tab
    assert 'id="btn-subtab-pl-promotions"' in content
    assert 'id="pl-subtab-promotions"' in content
    assert 'id="promotions-tbody"' in content


def test_pos_js_loyalty_logic():
    """Kiểm tra các hàm và xử lý logic trong static/js/pos.js"""
    js_path = Path("static/js/pos.js")
    assert js_path.exists(), "Không tìm thấy static/js/pos.js"
    content = js_path.read_text(encoding="utf-8")

    # Topup Spa modal logic
    assert "openTopupSpaModal" in content
    assert "submitTopupSpaRecharge" in content
    assert "/api/topup/recharge" in content

    # Spa wallet checkout deduction
    assert "use_spa_wallet" in content
    assert "spa_wallet_amount" in content
    assert "toggleUseSpaWallet" in content

    # Best offer pricing calculation
    assert "recalculateBestOfferForCart" in content
    assert "/api/pricing/calculate" in content

    # Loyalty upgrade & points earned notice
    assert "points_earned" in content
    assert "tier_upgraded" in content
