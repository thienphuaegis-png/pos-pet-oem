import pytest
from pathlib import Path

def test_topup_packages_subtab_in_price_lists():
    html_path = Path("templates/index.html")
    assert html_path.exists()
    content = html_path.read_text(encoding="utf-8")

    # Kiểm tra nút sub-tab topup trong tab-price-lists
    assert 'id="btn-subtab-pl-topup"' in content
    assert "switchPriceListSubTab('topup')" in content

    # Kiểm tra container pl-subtab-topup nằm bên trong tab-price-lists
    pl_start = content.find('id="tab-price-lists"')
    assert pl_start != -1
    settings_start = content.find('id="tab-settings"')
    assert settings_start != -1

    topup_subtab = content.find('id="pl-subtab-topup"')
    assert topup_subtab != -1
    assert pl_start < topup_subtab < settings_start, "pl-subtab-topup must be inside tab-price-lists"

    # Kiểm tra tbody và các chức năng vẫn nguyên vẹn
    assert 'id="topup-packages-tbody"' in content
    assert 'openTopupPackageModal()' in content

    # Kiểm tra không còn menu topup trong tab-settings
    assert "switchSettingsSubTab('topup-packages')" not in content
    assert 'id="settings-sub-topup-packages"' not in content

    # Kiểm tra switchPriceListSubTab có xử lý sub === 'topup'
    assert "sub === 'topup'" in content
