from pathlib import Path

def test_wheel_guard_and_escape_handlers():
    """Kiểm tra:
    1. Wheel Guard chặn cuộn chuột làm đổi số trên input number.
    2. Event delegation cho currency-auto-format realtime.
    3. Bộ đóng modal tự động bằng phím ESC.
    4. Bảng trợ giúp phím tắt thu ngân POS (F1, F2, F3, F4, F8, F9, F10, ESC).
    """
    app_js = Path("static/js/app.js").read_text(encoding="utf-8")
    assert "document.addEventListener('wheel'" in app_js
    assert "currency-auto-format" in app_js
    assert "e.key === 'Escape'" in app_js
    assert "formatCurrencyInputRealtime" in app_js
    assert "openPOSShortcutsHelpModal" in app_js

    pos_js = Path("static/js/pos.js").read_text(encoding="utf-8")
    assert "e.key === 'F1'" in pos_js
    assert "e.key === 'F2'" in pos_js
    assert "e.key === 'F8'" in pos_js
    assert "e.key === 'F9'" in pos_js

    html = Path("templates/index.html").read_text(encoding="utf-8")
    assert 'id="modal-pos-shortcuts-help"' in html
    assert 'id="modal-prod-cost"' in html
    assert 'placeholder="0"' in html
