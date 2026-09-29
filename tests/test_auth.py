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

if __name__ == "__main__":
    test_admin_exists();        print("✓ admin exists")
    test_password_hash();       print("✓ password hash OK")
    test_shifts_table();        print("✓ shifts table OK")
    test_orders_has_shift_id(); print("✓ orders.shift_id OK")
    test_cashbook_has_shift_id();print("✓ cashbook.shift_id OK")
    test_staff_has_auth_cols(); print("✓ staff auth cols OK")
    print("\nALL PASS ✅")
