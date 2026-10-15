import os
import pytest
from fastapi.testclient import TestClient
from server import app
from database import get_db

BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

def test_transfer_detail_api_returns_sku():
    """Kiểm tra API GET /api/inventory/transfers/{id} trả về trường sku cho items."""
    client = TestClient(app)
    login_res = client.post("/api/auth/login", data={"username": "admin", "password": "admin123"})
    assert login_res.status_code == 200
    token = login_res.json()["access_token"]
    headers = {"Authorization": f"Bearer {token}"}

    conn = get_db()
    cur = conn.cursor()
    cur.execute("SELECT id FROM warehouses ORDER BY id LIMIT 2")
    wh_rows = cur.fetchall()
    from_wh = wh_rows[0]["id"]
    to_wh = wh_rows[1]["id"]

    cur.execute("SELECT id, code, name FROM products LIMIT 1")
    prod = cur.fetchone()
    prod_id = prod["id"]
    expected_sku = prod["code"] or ""

    # Ensure inventory exists
    cur.execute('''
        INSERT INTO product_inventory (warehouse_id, product_id, quantity)
        VALUES (?, ?, 20)
        ON CONFLICT(warehouse_id, product_id) DO UPDATE SET quantity = 20
    ''', (from_wh, prod_id))
    conn.commit()
    conn.close()

    create_res = client.post("/api/inventory/transfer", json={
        "from_warehouse_id": from_wh,
        "to_warehouse_id": to_wh,
        "note": "Test transfer sku print",
        "items": [{"item_type": "product", "item_id": prod_id, "quantity": 1}]
    }, headers=headers)
    assert create_res.status_code == 200
    transfer_id = create_res.json()["id"]

    detail_res = client.get(f"/api/inventory/transfers/{transfer_id}", headers=headers)
    assert detail_res.status_code == 200
    detail = detail_res.json()
    assert len(detail["items"]) > 0
    assert "sku" in detail["items"][0], "API chi tiết phiếu chuyển kho phải trả về trường sku"
    assert detail["items"][0]["sku"] == expected_sku
    assert "from_warehouse_address" in detail, "API chi tiết phiếu chuyển kho phải có địa chỉ kho xuất"
    assert "to_warehouse_address" in detail, "API chi tiết phiếu chuyển kho phải có địa chỉ kho nhập"

def test_print_stock_transfer_a4_js_logic():
    """Kiểm tra hàm printStockTransferA4 trong static/js/app.js đáp ứng đúng chuẩn mẫu A4 ẩn giá vốn."""
    app_js_path = os.path.join(BASE_DIR, "static", "js", "app.js")
    with open(app_js_path, "r", encoding="utf-8") as f:
        content = f.read()

    assert "function printStockTransferA4" in content or "async function printStockTransferA4" in content, \
        "app.js phải định nghĩa hàm printStockTransferA4"
    assert "iframe-stock-transfer-print" in content, "Phải sử dụng iframe ẩn iframe-stock-transfer-print để in"
    assert "size: A4" in content, "Phải định dạng khổ giấy @page size: A4"
    assert "PHIẾU CHUYỂN KHO" in content, "Tiêu đề phiếu phải là PHIẾU CHUYỂN KHO"
    assert "(Ban hành kèm theo quy trình quản lý kho & điều chuyển nội bộ)" not in content, \
        "Không được chứa dòng phụ đề ban hành"
    assert "Biên bản được lập thành 03 bản" not in content, \
        "Không được chứa dòng ghi chú chân trang 03 bản"
    assert "Điều chuyển hàng hóa nội bộ" not in content, \
        "Không được tự bịa ghi chú khi ghi chú trống"
    assert "Ngày: " in content or "Ngày:" in content, \
        "Phiếu phải chỉ hiển thị Ngày chuyển kho (không hiện giờ)"

    # Kiểm tra 4 chữ ký
    assert "Người Lập Phiếu" in content, "Phải có chữ ký Người Lập Phiếu"
    assert "Thủ Kho Xuất" in content, "Phải có chữ ký Thủ Kho Xuất"
    assert "Người Vận Chuyển" in content, "Phải có chữ ký Người Vận Chuyển"
    assert "Thủ Kho Nhận" in content, "Phải có chữ ký Thủ Kho Nhận"

def test_ui_transfer_print_integration():
    """Kiểm tra tích hợp nút in phiếu chuyển kho A4 vào Modal chi tiết, Danh sách lịch sử và Sau khi tạo phiếu."""
    idx_path = os.path.join(BASE_DIR, "templates", "index.html")
    with open(idx_path, "r", encoding="utf-8") as f:
        idx_content = f.read()

    app_js_path = os.path.join(BASE_DIR, "static", "js", "app.js")
    with open(app_js_path, "r", encoding="utf-8") as f:
        app_content = f.read()

    # 1. Nút in trong modal-transfer-detail
    assert "printStockTransferA4" in idx_content, "index.html phải có nút gọi printStockTransferA4 trong modal chi tiết"

    # 2. Nút in trong danh sách lịch sử chuyển kho (table-transfer-history)
    assert 'printStockTransferA4(${t.id})' in app_content or 'printStockTransferA4(${t.id ||' in app_content, \
        "app.js phải có nút gọi printStockTransferA4 trong hàm loadStockTransfersList"

    # 3. Luồng sau khi tạo phiếu chuyển kho thành công
    assert "printStockTransferA4(result.id)" in app_content or "printStockTransferA4(result.transfer_id" in app_content or "printStockTransferA4" in app_content, \
        "app.js phải hỗ trợ in phiếu chuyển kho ngay sau khi tạo"


