import os
import pytest

def test_html_has_doc_type_select_and_clean_layout():
    base_dir = os.path.dirname(os.path.dirname(__file__))
    index_html = os.path.join(base_dir, "templates", "index.html")
    with open(index_html, "r", encoding="utf-8") as f:
        content = f.read()

    assert 'id="print-doc-type-select"' in content, "index.html phải có dropdown chọn loại chứng từ print-doc-type-select"
    assert '<optgroup label="── ĐƠN HÀNG ──">' in content or 'label="Đơn Hàng"' in content or 'optgroup' in content, "Dropdown phải có optgroup nhóm chứng từ"

def test_js_has_clean_canvas_and_doc_type_sync():
    base_dir = os.path.dirname(os.path.dirname(__file__))
    prod_js = os.path.join(base_dir, "static", "js", "modules", "productions.js")
    with open(prod_js, "r", encoding="utf-8") as f:
        content = f.read()

    assert "onPrintDocTypeSelectChange" in content or "selectPrintDocType" in content
    assert "isSel" in content
