import os
import pytest

def test_split_view_html_structure():
    """Kiểm tra cấu trúc 2 cột Split View trong templates/index.html"""
    html_path = os.path.join(os.path.dirname(__file__), "..", "templates", "index.html")
    with open(html_path, "r", encoding="utf-8") as f:
        html = f.read()

    # Kiểm tra tồn tại 2 cột Split View
    assert 'id="print-settings-split-layout"' in html, "Thiếu container print-settings-split-layout"
    assert 'id="print-settings-col-left"' in html, "Thiếu cột trái print-settings-col-left"
    assert 'id="print-settings-col-right"' in html, "Thiếu cột phải print-settings-col-right"

    # Kiểm tra công tắc in đậm chống mờ dạng switch ở cột trái
    assert 'id="chk-split-bold-toggle"' in html, "Thiếu switch chk-split-bold-toggle ở cột trái"
    assert 'id="canvas-preset-select"' in html, "Thiếu dropdown canvas-preset-select"
    assert 'id="canvas-paper-size"' in html, "Thiếu dropdown canvas-paper-size"

def test_productions_js_split_view_sync():
    """Kiểm tra productions.js có hàm đồng bộ công tắc in đậm khi switch preset và render canvas."""
    js_path = os.path.join(os.path.dirname(__file__), "..", "static", "js", "modules", "productions.js")
    with open(js_path, "r", encoding="utf-8") as f:
        js = f.read()

    assert "chk-split-bold-toggle" in js, "Thiếu xử lý đồng bộ chk-split-bold-toggle trong productions.js"
    assert "syncSplitBoldToggle" in js, "Thiếu hàm syncSplitBoldToggle trong productions.js"
