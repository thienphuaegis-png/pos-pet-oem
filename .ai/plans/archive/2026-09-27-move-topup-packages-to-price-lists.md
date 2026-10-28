# Di chuyển Bảng Gói Nạp Ví Spa vào Tab Bảng Giá Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use subagent-driven-development or executing-plans.

**Goal:** Chuyển phân hệ quản lý Gói Nạp Ví Spa (Prepaid) từ Tab Cài Đặt sang Tab Bảng Giá dạng sub-tab thứ 4, đảm bảo hiển thị đúng và không ảnh hưởng logic hiện có.

**Architecture:** Điều chỉnh DOM trong `templates/index.html` chuyển container bảng gói topup sang `#tab-price-lists`, thêm nút sub-tab `#btn-subtab-pl-topup`, cập nhật hàm điều hướng `switchPriceListSubTab('topup')`, và gỡ bỏ menu thừa ở `#tab-settings`.

**Tech Stack:** HTML5, Tailwind CSS, Vanilla JS, Pytest.

---

## File Structure

| File | Trách nhiệm |
|---|---|
| `templates/index.html` | Modify: Di chuyển container sang `tab-price-lists`, thêm sub-tab button, gỡ button ở `tab-settings`, cập nhật JS `switchPriceListSubTab` |
| `tests/test_topup_packages_subtab.py` | Create: Test kiểm tra DOM container và nút sub-tab topup nằm trong `tab-price-lists` |

---

### Task 1: Write Test & Update DOM & JS Navigation

**Files:**
- Create: `tests/test_topup_packages_subtab.py`
- Modify: `templates/index.html`

- [ ] **Step 1: Write failing test in `tests/test_topup_packages_subtab.py`**
```python
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
    # Tìm vùng kết thúc tab-price-lists
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
    assert "loadTopupPackagesList()" in content
```

- [ ] **Step 2: Run test to verify it fails**
Chạy `pytest tests/test_topup_packages_subtab.py` và xác nhận FAIL.

- [ ] **Step 3: Update `templates/index.html`**
1. Thêm nút `#btn-subtab-pl-topup` vào thanh sub-tab của `#tab-price-lists`.
2. Di chuyển container `#settings-sub-topup-packages` vào sau `#pl-subtab-promotions` trong `#tab-price-lists`, đổi ID thành `#pl-subtab-topup`.
3. Xóa button `switchSettingsSubTab('topup-packages')` trong `#tab-settings`.
4. Cập nhật `switchPriceListSubTab(sub)` để hỗ trợ `sub === 'topup'`.

- [ ] **Step 4: Run test to verify it passes**
Chạy `pytest tests/test_topup_packages_subtab.py` và xác nhận PASS.

---

### Task 2: Full Verification & Checkpoint Update

**Files:**
- Modify: `PROJECT_STATE.md`
- Modify: `PROJECT_MAP.html`

- [ ] **Step 1: Run all test suites**
Chạy `pytest tests/test_topup_packages_subtab.py`, `pytest tests/test_checkpoint_integrity.py`, `node tests/test_spa_render.js`.

- [ ] **Step 2: Update `PROJECT_STATE.md` & `PROJECT_MAP.html`**
Đánh dấu `bill-4` hoàn thành trong cả 2 files.
