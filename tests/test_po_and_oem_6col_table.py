from pathlib import Path

def test_purchases_6col_table_and_no_pay_debt_btn():
    html = Path("templates/index.html").read_text(encoding="utf-8")
    assert 'id="filter-po-supplier"' in html, "Thiếu dropdown lọc NCC cho bảng Đơn Nhập Hàng"
    assert 'id="purchase-order-count"' in html, "Thiếu nhãn đếm đơn hàng nhập kho"
    assert 'id="table-purchases-history"' in html

    # Kiểm tra bảng Đơn Nhập Hàng đúng 6 cột trong HTML
    th_section = html[html.find('id="purchase-list-view"'):html.find('id="table-purchases-history"')]
    assert th_section.count('<th ') == 6, f"Bảng Đơn Nhập Hàng phải có đúng 6 cột, hiện có {th_section.count('<th ')}"

    purchases_js = Path("static/js/modules/purchases.js").read_text(encoding="utf-8")
    
    # Tuyệt đối cấm có nút Chi Trả trên từng dòng của bảng danh sách nhập hàng
    assert 'Chi Trả' not in purchases_js[purchases_js.find('async function loadPurchasesList'):purchases_js.find('async function openReceiveModal')], \
        "Bảng Đơn Nhập Hàng không được có nút Chi Trả trên từng dòng"
    
    # Kiểm tra click vào dòng tự mở modal chi tiết
    assert "onclick=\"openReceiveModal('${escapeHtml(p.code)}', true)\"" in purchases_js
    
    # Kiểm tra có menu 3 chấm
    assert 'togglePurchaseActionMenu' in purchases_js
    assert 'populatePurchaseSupplierFilter' in purchases_js


def test_oem_table_click_row_opens_detail_modal():
    html = Path("templates/index.html").read_text(encoding="utf-8")
    assert 'id="table-oem-orders"' in html

    # Kiểm tra bảng OEM đúng 6 cột
    oem_th_section = html[html.find('id="table-oem-orders"') - 1000:html.find('id="table-oem-orders"')]
    assert oem_th_section.count('<th ') == 6, f"Bảng OEM phải có đúng 6 cột, hiện có {oem_th_section.count('<th ')}"

    prod_js = Path("static/js/modules/productions.js").read_text(encoding="utf-8")
    
    # Kiểm tra click vào dòng đơn OEM tự động gọi viewOEMOrderDetail
    assert "onclick=\"viewOEMOrderDetail(${o.id})\"" in prod_js
    
    # Kiểm tra đã loại bỏ hoàn toàn dòng mở rộng trỏ xuống oem-exp-row
    assert 'id="oem-exp-row' not in prod_js
