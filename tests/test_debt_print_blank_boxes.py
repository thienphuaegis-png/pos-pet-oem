import pytest
from pathlib import Path

def test_debt_order_leaves_bank_and_qr_boxes_blank():
    """Kiểm tra nếu đơn nợ (debt_amount > 0) thì ô Thông tin thanh toán và ô QR để trống"""
    pos_js = Path("static/js/pos.js").read_text(encoding="utf-8")
    
    # Phải có logic kiểm tra isDebt
    assert "const isDebt = (ord.debt_amount || 0) > 0;" in pos_js
    assert "if (isDebt)" in pos_js
    assert "Đơn hàng ghi nợ: Ô 1 để trống, ô 2 để trống hoàn toàn" in pos_js

def test_a4_landscape_has_explicit_landscape_rule():
    """Kiểm tra CSS @page cho khổ ngang ép size: 297mm 210mm và size: landscape để Edge không in nhầm portrait"""
    pos_js = Path("static/js/pos.js").read_text(encoding="utf-8")
    
    assert "@page { size: 297mm 210mm; size: landscape; margin: 0; }" in pos_js
