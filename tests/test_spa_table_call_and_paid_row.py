import re
from bs4 import BeautifulSoup


def test_spa_table_columns_and_paid_row_styling():
    """Kiểm tra:
    1. Thead bảng Spa giảm xuống 11 cột, không còn cột 'Gọi Điện' riêng lẻ.
    2. Colspan khi bảng rỗng là 11.
    3. File static/js/modules/spa.js đặt callStatusSelector vào cột Khách hàng (dưới SĐT).
    4. File static/js/modules/spa.js tô màu xanh toàn dòng khi payment_status == 'paid'.
    """
    with open("templates/index.html", "r", encoding="utf-8") as f:
        html = f.read()

    soup = BeautifulSoup(html, "html.parser")
    tbody = soup.find("tbody", id="table-pet-services")
    assert tbody is not None, "Không tìm thấy tbody#table-pet-services"
    table = tbody.find_parent("table")
    assert table is not None, "Không tìm thấy table của table-pet-services"

    headers = [th.get_text(strip=True) for th in table.find("thead").find_all("th")]
    assert len(headers) == 11, f"Bảng phải có đúng 11 cột, hiện tại có {len(headers)} cột: {headers}"
    assert not any("GỌI ĐIỆN" in h.upper() for h in headers), "Cột Gọi Điện không được đứng riêng trong thead"
    assert any("KHÁCH HÀNG" in h.upper() for h in headers), "Phải có cột Khách Hàng"

    empty_td = table.find("tbody", id="table-pet-services").find("td")
    assert empty_td.get("colspan") == "11", f"Colspan bảng rỗng phải là 11, hiện tại: {empty_td.get('colspan')}"

    with open("static/js/modules/spa.js", "r", encoding="utf-8") as f:
        js = f.read()

    # Kiểm tra gọi điện được lồng dưới khách hàng
    assert re.search(r'formatMaskedPhone\(t\.customer_phone\)[^<]*</div>\s*<div class="mt-1">\$\{callStatusSelector\(t\)\}', js), \
        "Dropdown gọi điện phải nằm ngay dưới số điện thoại khách hàng"

    # Kiểm tra tô màu xanh toàn dòng khi đã thanh toán
    assert "t.payment_status === 'paid'" in js, "Phải kiểm tra payment_status === 'paid'"
    assert "bg-emerald-50/70 hover:bg-emerald-100/70 border-l-4 border-l-emerald-500" in js, \
        "Dòng đã thanh toán phải có style nền xanh ngọc và viền xanh lục"
