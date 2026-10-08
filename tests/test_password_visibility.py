import pytest
from pathlib import Path

def test_password_visibility_dom():
    html_path = Path("templates/index.html")
    assert html_path.exists(), "templates/index.html must exist"
    content = html_path.read_text(encoding="utf-8")

    # 1. Login password toggle & caps warning
    assert "togglePasswordVisibility('login-password', this)" in content
    assert 'id="login-caps-warn"' in content
    assert "checkPasswordCapsLock(event, 'login-caps-warn')" in content

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
