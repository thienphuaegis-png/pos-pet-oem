from pathlib import Path
import re

ROOT = Path(__file__).resolve().parent.parent


def test_hrm_modals_use_searchable_payroll_picker_and_keep_close_icon():
    html = (ROOT / "templates" / "index.html").read_text(encoding="utf-8")
    hrm_js = (ROOT / "static" / "js" / "modules" / "hrm.js").read_text(encoding="utf-8")

    for sid in ("hrm-leave-staff-id", "hrm-ot-staff-id", "hrm-adv-staff-id", "hrm-adj-staff-id"):
        assert f'data-hrm-staff-picker="{sid}"' in html, f"Thiếu wrapper searchable picker cho {sid}"
        assert f'id="{sid}"' in html and f'id="{sid}-search"' in html and f'id="{sid}-menu"' in html
        assert f"initHrmStaffPicker('{sid}'" in hrm_js

    # Đảm bảo 3 modal Leave / OT / Advance không còn ghép mã giả 'NV' + s.id từ /api/staff
    assert "'NV' + s.id" not in hrm_js[:14000]
    # Giữ nguyên nút đóng góc phải modal HRM theo lựa chọn người dùng
    assert 'onclick="closeHrmAdvanceModal()"' in html


def test_purchase_supplier_filter_uses_searchable_vi_sorted_popover():
    html = (ROOT / "templates" / "index.html").read_text(encoding="utf-8")
    po_js = (ROOT / "static" / "js" / "modules" / "purchases.js").read_text(encoding="utf-8")

    assert 'id="filter-po-supplier"' in html
    assert 'id="btn-po-supplier-filter"' in html
    assert 'id="po-supplier-popover"' in html
    assert 'id="po-supplier-popover-search"' in html
    assert "Intl.Collator('vi'" in po_js
    assert "function togglePoSupplierPopover" in po_js


def test_cashbook_tab_and_modals_have_no_circle_dots_and_nowrap_badges():
    html = (ROOT / "templates" / "index.html").read_text(encoding="utf-8")
    prod_js = (ROOT / "static" / "js" / "modules" / "productions.js").read_text(encoding="utf-8")

    for btn_id in ("cb-pill-type-in", "cb-pill-type-out", "btn-cash-type-in", "btn-cash-type-out"):
        m = re.search(rf'id="{btn_id}"[^>]*>([\s\S]*?)</button>', html)
        assert m, f"Không tìm thấy {btn_id}"
        assert "ph-circle" not in m.group(1), f"{btn_id} vẫn còn ph-circle"

    for badge_id in ("cashview-badge-type", "drawer-cash-badge-type"):
        m = re.search(rf'id="{badge_id}"[^>]*>([\s\S]*?)</span>', html)
        assert m, f"Không tìm thấy {badge_id}"
        assert "ph-circle" not in m.group(1), f"{badge_id} vẫn còn ph-circle"

    assert "🟢 Thu" not in prod_js
    assert "🔴 Chi" not in prod_js
    assert "whitespace-nowrap px-2 py-0.5 rounded text-xs font-bold ${isThu ? 'bg-emerald-100 text-emerald-800' : 'bg-rose-100 text-rose-800'}" in prod_js
