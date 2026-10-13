import re
import pytest
from pathlib import Path

def test_order_detail_modal_backdrop_and_structure():
    """Kiểm tra modal-order-view có hỗ trợ click backdrop và không còn nút Đóng ở footer"""
    html = Path("templates/index.html").read_text(encoding="utf-8")
    
    # Tìm đoạn modal-order-view
    match = re.search(r'<div\s+id="modal-order-view"[^>]*>', html)
    assert match is not None, "Không tìm thấy thẻ #modal-order-view"
    tag = match.group(0)
    
    # 1. Bắt buộc có onclick đóng khi click ra backdrop
    assert 'onclick="if(event.target === this) closeModalOrderView()"' in tag, "Thiếu onclick đóng backdrop trên #modal-order-view"
    
    # 2. Lấy nội dung bên trong modal-order-view
    modal_snippet = html[match.start():match.start() + 4500]
    
    # 3. Không được còn nút Đóng ở footer (<button onclick="closeModalOrderView()" ...>Đóng</button>)
    assert 'Đóng</button>' not in modal_snippet, "Vẫn còn nút 'Đóng' ở footer modal chi tiết đơn hàng!"
    
    # 4. Có badge trạng thái thanh toán view-order-status-badge
    assert 'view-order-status-badge' in modal_snippet, "Thiếu #view-order-status-badge trong header modal chi tiết đơn hàng!"

def test_app_js_esc_handles_modal_order_view():
    """Kiểm tra phím Escape trong app.js có đóng modal-order-view"""
    app_js = Path("static/js/app.js").read_text(encoding="utf-8")
    
    # Bắt buộc modal-order-view phải nằm trong danh sách activeModals của keydown Escape
    assert "'modal-order-view'" in app_js or '"modal-order-view"' in app_js, "Thiếu 'modal-order-view' trong activeModals của app.js!"
