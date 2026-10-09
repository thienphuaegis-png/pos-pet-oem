from pathlib import Path

def test_kiotviet_print_templates_html_structure():
    """Kiểm tra bố cục 3 cột và các ID phần tử giao diện quản lý mẫu in KiotViet trong templates/index.html"""
    html_path = Path("templates/index.html")
    assert html_path.exists()
    content = html_path.read_text(encoding="utf-8")

    # 1. Cột 1: Cây danh mục chứng từ
    assert 'id="print-tpl-tree"' in content
    assert 'selectPrintDocType(' in content

    # 2. Cột 2: Panel cấu hình bật tắt khối trực quan
    assert 'id="print-tpl-config-panel"' in content
    assert 'id="chk-thermal-bold"' in content

    # 3. Cột 3: Viewport xem trước cực đại và điều khiển zoom
    assert 'id="print-tpl-preview-viewport"' in content
    assert 'id="btn-print-zoom-in"' in content
    assert 'id="btn-print-zoom-out"' in content
    assert 'id="lbl-print-zoom"' in content
    assert 'id="print-paper-select"' in content
    assert 'id="receipt-live-preview"' in content


def test_kiotviet_print_templates_js_logic():
    """Kiểm tra các hàm điều khiển zoom, đổi chứng từ và toggle preview trong static/js/modules/productions.js"""
    js_path = Path("static/js/modules/productions.js")
    assert js_path.exists()
    content = js_path.read_text(encoding="utf-8")

    assert "selectPrintDocType" in content
    assert "zoomPrintSheet" in content
    assert "changePrintPaperView" in content
    assert "togglePrintPreviewBlock" in content
    assert "togglePrintPreviewField" in content
