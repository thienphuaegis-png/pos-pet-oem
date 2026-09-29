import sys, os; sys.path.insert(0, os.path.dirname(os.path.dirname(__file__)))
from database import init_db, get_db
from passlib.context import CryptContext

init_db()
_pwd = CryptContext(schemes=["bcrypt"], deprecated="auto")

def test_admin_exists():
    db = get_db(); cur = db.cursor()
    cur.execute("SELECT username, role FROM staff WHERE username='admin'")
    row = cur.fetchone()
    db.close()
    assert row, "Admin chưa được seed"
    assert row["role"] in ("owner", "admin"), f"Role sai: {row['role']}"

def test_password_hash():
    db = get_db(); cur = db.cursor()
    cur.execute("SELECT password_hash FROM staff WHERE username='admin'")
    row = cur.fetchone(); db.close()
    assert row and row["password_hash"], "Không có password_hash"
    assert _pwd.verify("admin123", row["password_hash"]), "Hash mật khẩu admin sai"

def test_shifts_table():
    db = get_db(); cur = db.cursor()
    cur.execute("SELECT name FROM sqlite_master WHERE type='table' AND name='shifts'")
    assert cur.fetchone(), "Bảng shifts chưa tồn tại"
    db.close()

def test_orders_has_shift_id():
    db = get_db(); cur = db.cursor()
    cur.execute("PRAGMA table_info(orders)")
    cols = [r["name"] for r in cur.fetchall()]; db.close()
    assert "shift_id" in cols, "orders thiếu cột shift_id"

def test_cashbook_has_shift_id():
    db = get_db(); cur = db.cursor()
    cur.execute("PRAGMA table_info(cashbook)")
    cols = [r["name"] for r in cur.fetchall()]; db.close()
    assert "shift_id" in cols, "cashbook thiếu cột shift_id"

def test_staff_has_auth_cols():
    db = get_db(); cur = db.cursor()
    cur.execute("PRAGMA table_info(staff)")
    cols = [r["name"] for r in cur.fetchall()]; db.close()
    for c in ("username", "password_hash", "is_active"):
        assert c in cols, f"staff thiếu cột {c}"

def test_staff_modal_dom_structure():
    with open("templates/index.html", "r", encoding="utf-8") as f:
        html = f.read()

    assert 'id="modal-staff"' in html
    assert 'id="staff-name"' in html
    assert 'id="staff-username"' in html
    assert 'id="staff-password"' in html
    assert 'id="staff-role"' in html
    assert 'id="staff-phone"' in html
    assert 'id="staff-commission"' in html
    assert 'closeStaffModal()' in html

    # Verify modal is positioned globally outside tab-settings
    settings_idx = html.find('id="tab-settings"')
    modal_idx = html.find('id="modal-staff"')
    tab_settings_closing_div = html.find('<!-- MODAL: XÁC NHẬN XÓA / LÀM SẠCH DỮ LIỆU -->')
    assert modal_idx > settings_idx, "modal-staff phải nằm sau tab-settings"
    assert modal_idx < tab_settings_closing_div, "modal-staff nằm trong khu vực modal độc lập toàn cục"

def test_shifts_bypass_permission():
    from dependencies import check_permission, get_user_effective_permissions
    from routers.settings import PERM_KEYS

    assert "shifts.bypass" in PERM_KEYS

    # Admin/Owner luôn có quyền shifts.bypass
    assert check_permission(1, "owner", "shifts.bypass") is True
    assert check_permission(1, "admin", "shifts.bypass") is True
    assert "shifts.bypass" in get_user_effective_permissions(1, "owner")

    # Tạo cashier test
    db = get_db(); cur = db.cursor()
    cur.execute("SELECT id FROM staff WHERE role='cashier' LIMIT 1")
    cashier = cur.fetchone()
    if not cashier:
        cur.execute("INSERT INTO staff (name, username, password_hash, role, is_active) VALUES ('Test Cashier', 'test_cashier', 'hash', 'cashier', 1)")
        db.commit()
        cashier_id = cur.lastrowid
    else:
        cashier_id = cashier["id"]

    # Mặc định cashier chưa có quyền bypass
    cur.execute("DELETE FROM staff_permissions WHERE staff_id=? AND perm_key='shifts.bypass'", (cashier_id,))
    cur.execute("UPDATE role_permissions SET allowed=0 WHERE role='cashier' AND perm_key='shifts.bypass'")
    db.commit()
    db.close()

    assert check_permission(cashier_id, "cashier", "shifts.bypass") is False

    # Cấp quyền riêng cho cashier này
    db = get_db(); cur = db.cursor()
    cur.execute("INSERT INTO staff_permissions (staff_id, perm_key, allowed) VALUES (?, 'shifts.bypass', 1) ON CONFLICT(staff_id, perm_key) DO UPDATE SET allowed=1", (cashier_id,))
    db.commit()
    db.close()

    assert check_permission(cashier_id, "cashier", "shifts.bypass") is True
    assert "shifts.bypass" in get_user_effective_permissions(cashier_id, "cashier")

    # Cleanup
    db = get_db(); cur = db.cursor()
    cur.execute("DELETE FROM staff_permissions WHERE staff_id=? AND perm_key='shifts.bypass'", (cashier_id,))
    db.commit(); db.close()

if __name__ == "__main__":
    test_admin_exists();        print("✓ admin exists")
    test_password_hash();       print("✓ password hash OK")
    test_shifts_table();        print("✓ shifts table OK")
    test_orders_has_shift_id(); print("✓ orders.shift_id OK")
    test_cashbook_has_shift_id();print("✓ cashbook.shift_id OK")
    test_staff_has_auth_cols(); print("✓ staff auth cols OK")
    print("\nALL PASS ✅")
