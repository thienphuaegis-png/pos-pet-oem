import re
from pathlib import Path

def test_ai_agent_no_copilot_in_sidebar_and_header():
    """Kiểm tra tab Tác Nhân AI trên sidebar và header không còn chứa từ 'Copilot'"""
    html = Path("templates/index.html").read_text(encoding="utf-8")

    # 1. Kiểm tra nút tab trên Sidebar: button data-tab="ai-agent"
    sidebar_match = re.search(r'<button[^>]*data-tab="ai-agent"[^>]*>(.*?)</button>', html, re.DOTALL)
    assert sidebar_match is not None, "Không tìm thấy nút tab ai-agent trên sidebar"
    sidebar_btn_html = sidebar_match.group(1)
    assert "COPILOT" not in sidebar_btn_html, "Nút sidebar Tác Nhân AI vẫn còn badge hoặc chữ COPILOT"
    assert "Copilot" not in sidebar_btn_html, "Nút sidebar Tác Nhân AI vẫn còn chữ Copilot"

    # 2. Kiểm tra header của tab Tác Nhân AI: thẻ h2 và badge lân cận
    header_match = re.search(r'<div id="tab-ai-agent"[^>]*>(.*?)<div class="grid grid-cols-1 lg:grid-cols-12', html, re.DOTALL)
    assert header_match is not None, "Không tìm thấy phần header của #tab-ai-agent"
    header_html = header_match.group(1)
    assert "VISION COPILOT" not in header_html, "Header Tác Nhân AI vẫn còn badge VISION COPILOT"
    assert "COPILOT" not in header_html, "Header Tác Nhân AI vẫn còn chữ COPILOT"
