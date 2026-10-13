import pytest
import json
from starlette.testclient import TestClient
from server import app
from database import get_db, init_db

client = TestClient(app)

def test_print_blocks_config_has_active_b2b_and_k80():
    """Kiểm tra mẫu in a4_b2b và k80_standard luôn ở trạng thái is_active=True"""
    init_db()
    conn = get_db()
    cur = conn.cursor()
    cur.execute("SELECT value FROM settings WHERE key = 'print_blocks_config'")
    row = cur.fetchone()
    conn.close()
    assert row and row[0]
    data = json.loads(row[0])
    presets = data.get("presets", {})
    assert "a4_b2b" in presets
    assert presets["a4_b2b"].get("is_active") is True
    assert presets["k80_standard"].get("is_active") is True

def test_index_html_has_simplified_inline_print_designer():
    """Kiểm tra giao diện index.html tinh giản: bỏ thanh nút token, có bộ chọn mẫu in canvas và hỗ trợ inline edit"""
    res = client.get("/")
    assert res.status_code == 200
    html = res.text
    assert 'id="print-doc-type-select"' in html
    assert 'id="canvas-preset-select"' in html
    assert 'id="paper-canvas"' in html
    assert 'Click vào chữ trên bản in để sửa trực tiếp' in html
    assert 'insertTagToPropText' not in html
