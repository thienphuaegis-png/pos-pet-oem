import os
import re
from fastapi.testclient import TestClient
from server import app
from database import get_db

BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


def test_order_view_modal_has_delivery_note_button():
    """Kiểm tra Modal Chi tiết hóa đơn (#modal-order-view) có nút In Phiếu Giao Hàng."""
    idx_path = os.path.join(BASE_DIR, "templates", "index.html")
    with open(idx_path, "r", encoding="utf-8") as f:
        html = f.read()

    assert 'id="btn-print-delivery-from-view"' in html
    assert 'onclick="printCurrentOrderDeliveryNote()"' in html
    assert "In Phiếu Giao Hàng" in html


def test_print_order_delivery_note_a4_js_logic():
    """Kiểm tra hàm printOrderDeliveryNoteA4 trong productions.js in khổ A4 Dọc, 6 cột, 3 chữ ký và ẩn hoàn toàn giá."""
    js_path = os.path.join(BASE_DIR, "static", "js", "modules", "productions.js")
    with open(js_path, "r", encoding="utf-8") as f:
        content = f.read()

    match = re.search(
        r"async function printOrderDeliveryNoteA4\(orderCode\)\s*\{(.*?)window\.printOrderDeliveryNoteA4\s*=\s*printOrderDeliveryNoteA4;",
        content,
        re.DOTALL,
    )
    assert match, "productions.js phải định nghĩa hàm printOrderDeliveryNoteA4"
    fn_body = match.group(1)

    assert "iframe-delivery-note-print" in fn_body
    assert "size: A4 portrait" in fn_body
    assert "PHIẾU GIAO HÀNG" in fn_body
    assert "Mã SKU" in fn_body
    assert "Tên Mặt Hàng" in fn_body
    assert "Số Lượng" in fn_body
    assert "TỔNG CỘNG" in fn_body

    # 3 chữ ký chuẩn giao hàng
    assert "Người Lập Phiếu" in fn_body
    assert "Người Giao Hàng" in fn_body
    assert "Người Nhận Hàng" in fn_body
    assert "Thủ Kho Xuất" not in fn_body

    # Tuyệt đối không lộ giá bán / thành tiền / công nợ / QR trong hàm in phiếu giao hàng
    for forbidden in ("formatMoney", "Đơn giá", "Thành tiền", "Còn nợ", "VietQR", "final_amount", "total_amount", "debt_amount"):
        assert forbidden not in fn_body, f"Phiếu giao hàng không được chứa thông tin giá/tiền: {forbidden}"


def test_order_detail_api_provides_delivery_note_fields():
    """Kiểm tra GET /api/orders/{code} trả đủ dữ liệu cho Phiếu Giao Hàng (kể cả món tặng is_gift)."""
    client = TestClient(app)
    login_res = client.post("/api/auth/login", data={"username": "admin", "password": "admin123"})
    assert login_res.status_code == 200
    headers = {"Authorization": f"Bearer {login_res.json()['access_token']}"}

    conn = get_db()
    cur = conn.cursor()
    cur.execute(
        "INSERT INTO contacts (name, phone, address, type) VALUES (?, ?, ?, 'customer')",
        ("Đại Lý Thú Cưng Bến Tre", "0909123456", "123 Đồng Khởi, Bến Tre"),
    )
    cust_id = cur.lastrowid

    cur.execute(
        "INSERT INTO products (code, name, type, unit, sell_price, cost_price, stock) VALUES (?, ?, 'retail', ?, ?, ?, ?)",
        ("SKU-GH-01", "Hạt Royal Canin 2kg", "Túi", 350000, 250000, 50),
    )
    prod_id = cur.lastrowid

    order_code = "HD-TEST-GH-001"
    cur.execute(
        """INSERT INTO orders (code, customer_id, total_amount, discount, final_amount, paid_amount, debt_amount, note, created_by)
           VALUES (?, ?, 700000, 0, 700000, 700000, 0, 'Giao giờ hành chính', 'Admin')""",
        (order_code, cust_id),
    )
    ord_id = cur.lastrowid

    cur.execute(
        "INSERT INTO order_items (order_id, product_id, quantity, price, subtotal, unit) VALUES (?, ?, 2, 350000, 700000, 'Túi')",
        (ord_id, prod_id),
    )
    cur.execute(
        "INSERT INTO order_items (order_id, product_id, quantity, price, subtotal, unit) VALUES (?, ?, 1, 0, 0, 'Túi')",
        (ord_id, prod_id),
    )
    conn.commit()
    conn.close()

    detail_res = client.get(f"/api/orders/{order_code}", headers=headers)
    assert detail_res.status_code == 200
    data = detail_res.json()

    assert data["code"] == order_code
    assert data["customer_name"] == "Đại Lý Thú Cưng Bến Tre"
    assert data["customer_phone"] == "0909123456"
    assert data["customer_address"] == "123 Đồng Khởi, Bến Tre"
    assert data["note"] == "Giao giờ hành chính"
    assert len(data["items"]) == 2
    assert data["items"][0]["product_code"] == "SKU-GH-01"
    assert data["items"][0]["is_gift"] is False
    assert data["items"][1]["is_gift"] is True
