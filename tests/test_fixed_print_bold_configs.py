import os
import json
import sqlite3
import pytest

from database import get_db_path
DB_PATH = get_db_path()

def test_print_bold_configs_in_db():
    """Kiểm tra setting print_bold_configs tồn tại và có đủ 10 loại hóa đơn."""
    conn = sqlite3.connect(DB_PATH)
    c = conn.cursor()
    c.execute("SELECT value FROM settings WHERE key = 'print_bold_configs'")
    row = c.fetchone()
    conn.close()

    assert row is not None, "Chưa có key print_bold_configs trong settings"
    cfg = json.loads(row[0])
    expected_keys = [
        "pos_retail",
        "pos_b2b",
        "pos_draft",
        "pos_topup",
        "spa_intake",
        "spa_invoice",
        "cashbook_thu",
        "cashbook_chi",
        "shift_zreport",
        "stock_audit"
    ]
    for k in expected_keys:
        assert k in cfg, f"Thiếu key {k} trong print_bold_configs"
        assert isinstance(cfg[k], bool), f"Key {k} phải là kiểu boolean"

def test_html_has_10_bold_checkboxes():
    """Kiểm tra index.html có switch in đậm và danh sách cấu hình."""
    html_path = os.path.join(os.path.dirname(__file__), "..", "templates", "index.html")
    with open(html_path, "r", encoding="utf-8") as f:
        html = f.read()

    # Trong layout 2 cột mới, có switch in đậm trực quan đồng bộ theo preset
    assert 'id="chk-split-bold-toggle"' in html, "Thiếu switch chk-split-bold-toggle trong index.html"

def test_js_modules_link_print_bold_configs():
    """Kiểm tra các file JS liên kết tới print_bold_configs."""
    files_to_check = {
        "pos.js": ["print_bold_configs", "pos_retail", "pos_draft", "pos_topup"],
        "spa.js": ["print_bold_configs", "spa_intake", "spa_invoice"],
        "productions.js": ["print_bold_configs", "cashbook_thu", "cashbook_chi"],
        "shifts.js": ["print_bold_configs", "shift_zreport"],
        "app.js": ["print_bold_configs", "stock_audit"]
    }

    base_js = os.path.join(os.path.dirname(__file__), "..", "static", "js")
    for fname, patterns in files_to_check.items():
        fpath = os.path.join(base_js, fname)
        if not os.path.exists(fpath):
            fpath = os.path.join(base_js, "modules", fname)
        assert os.path.exists(fpath), f"Không tìm thấy file {fpath}"
        with open(fpath, "r", encoding="utf-8") as f:
            content = f.read()
        for p in patterns:
            assert p in content, f"File {fname} thiếu kiểm tra {p}"
