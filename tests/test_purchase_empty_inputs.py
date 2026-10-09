from pathlib import Path

def test_purchase_order_empty_inputs():
    """Kiểm tra ô số lượng và thực trả ncc để trống, không điền sẵn 1 hoặc 0"""
    html = Path("templates/index.html").read_text(encoding="utf-8")
    assert 'id="purchase-paid"' in html
    assert 'value=""' in html or 'placeholder="0"' in html

    purchases_js = Path("static/js/modules/purchases.js").read_text(encoding="utf-8")
    # Kiểm tra quantity mặc định để trống khi thêm món
    assert "quantity: ''" in purchases_js
    # Kiểm tra thực trả NCC mặc định để trống khi reset form
    assert "document.getElementById('purchase-paid').value = '';" in purchases_js
    # Kiểm tra không tự động điền paidInput.value = total
    assert "paidInput.value = total" not in purchases_js
    # Kiểm tra placeholder="0" trong ô số lượng
    assert 'placeholder="0"' in purchases_js
