import pytest
from pathlib import Path

def test_password_visibility_dom():
    html_path = Path("templates/index.html")
    assert html_path.exists(), "templates/index.html must exist"
    content = html_path.read_text(encoding="utf-8")

    # 1. Login password toggle & caps warning & change password button
    assert "togglePasswordVisibility('login-password', this)" in content
    assert 'id="login-caps-warn"' in content
    assert "checkPasswordCapsLock(event, 'login-caps-warn')" in content
    assert 'id="login-change-pwd-btn"' in content
    assert "openChangePasswordOverlay('login')" in content
    assert 'class="login-split-card"' in content

    # 2. Force password change overlay
    assert "togglePasswordVisibility('force-pwd-old', this)" in content
    assert 'id="force-old-caps-warn"' in content
    assert "togglePasswordVisibility('force-pwd-new', this)" in content
    assert 'id="force-new-caps-warn"' in content

    # 3. Staff password in modal-staff
    assert "togglePasswordVisibility('staff-password', this)" in content
    assert 'id="staff-caps-warn"' in content

def test_auth_js_helpers():
    js_path = Path("static/js/auth.js")
    assert js_path.exists(), "static/js/auth.js must exist"
    content = js_path.read_text(encoding="utf-8")

    assert "window.togglePasswordVisibility" in content
    assert "window.checkPasswordCapsLock" in content
    assert "input.type = isPwd ? 'text' : 'password'" in content
    assert "labelEl.textContent = isPwd ? 'Ẩn' : 'Xem'" in content
    assert "e.getModifierState('CapsLock')" in content


def test_staff_delete_endpoints():
    from fastapi.testclient import TestClient
    from server import app
    from database import get_db
    from dependencies import get_current_user

    saved = dict(app.dependency_overrides)
    app.dependency_overrides[get_current_user] = lambda: {"id": 1, "name": "admin", "role": "owner"}
    client = TestClient(app)
    try:
        conn = get_db()
        cur = conn.cursor()
        cur.execute("INSERT INTO staff (name, role, is_active, is_payroll_staff) VALUES ('NV Test Xoa 1', 'staff', 1, 1)")
        sid1 = cur.lastrowid
        cur.execute("INSERT INTO staff (name, role, is_active, is_payroll_staff) VALUES ('NV Test Xoa 2', 'staff', 1, 1)")
        sid2 = cur.lastrowid
        conn.commit()
        conn.close()

        # 1. Xóa qua /api/auth/staff/{id}
        r1 = client.delete(f"/api/auth/staff/{sid1}")
        assert r1.status_code == 200

        # 2. Xóa qua /api/hrm/employees/{id}
        r2 = client.delete(f"/api/hrm/employees/{sid2}")
        assert r2.status_code == 200

        # 3. Chặn xóa admin id=1
        r3 = client.delete("/api/auth/staff/1")
        assert r3.status_code == 400
    finally:
        app.dependency_overrides = saved

