from pathlib import Path

def test_print_canvas_autoflow_and_reorder_support():
    """Kiểm tra cơ chế Auto-Flow dồn dòng tự động và đổi thứ tự khối trong static/js/modules/productions.js"""
    js_path = Path("static/js/modules/productions.js")
    assert js_path.exists()
    content = js_path.read_text(encoding="utf-8")

    # 1. Có hàm di chuyển thứ tự khối moveElementOrder
    assert "function moveElementOrder" in content
    assert "window.moveElementOrder = moveElementOrder" in content

    # 2. Không còn ép absolute top tĩnh gây đè chữ trong canvas-element
    assert "auto-flow-item" in content or "canvas-autoflow-element" in content
