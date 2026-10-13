import pytest
from pathlib import Path
from fastapi.testclient import TestClient
from server import app
from database import get_db

@pytest.fixture
def client():
    return TestClient(app)

def test_api_orders_returns_customer_address(client):
    """Kiểm tra API /api/orders/{code} trả về trường customer_address."""
    conn = get_db()
    cur = conn.cursor()
    # Tạo contact có địa chỉ
    cur.execute("INSERT INTO contacts (name, phone, address, type) VALUES ('Đại lý DogHouse', '0901412812', '123 Đường ABC, Quận 1', 'customer')")
    customer_id = cur.lastrowid
    
    cur.execute("INSERT INTO orders (code, customer_id, total_amount, final_amount, paid_amount, status) VALUES ('HD_TEST_ADDR_01', ?, 500000, 500000, 500000, 'completed')", (customer_id,))
    order_id = cur.lastrowid
    
    cur.execute("INSERT INTO products (code, name, type, sell_price, cost_price, stock) VALUES ('SP_TEST_ADDR', 'Sản phẩm test', 'goods', 100000, 50000, 10)")
    p_id = cur.lastrowid
    
    cur.execute("INSERT INTO order_items (order_id, product_id, quantity, price, subtotal) VALUES (?, ?, 5, 100000, 500000)", (order_id, p_id))
    conn.commit()
    conn.close()

    res = client.get("/api/orders/HD_TEST_ADDR_01")
    assert res.status_code == 200
    data = res.json()
    assert "customer_address" in data
    assert data["customer_address"] == "123 Đường ABC, Quận 1"

def test_print_templates_ui_has_customer_address():
    """Kiểm tra checkbox customer_address trong index.html và defaultElementCatalog trong productions.js."""
    html = Path("templates/index.html").read_text(encoding="utf-8")
    assert 'id="chk-customer_address"' in html

    js = Path("static/js/modules/productions.js").read_text(encoding="utf-8")
    assert "customer_address:" in js
    assert "'customer_address'" in js

def test_pos_js_supports_customer_address_and_large_order_print():
    """Kiểm tra pos.js có placeholder dia_chi_khach và CSS in không triệt tiêu ngắt trang multi-page."""
    pos_js = Path("static/js/pos.js").read_text(encoding="utf-8")
    assert "dia_chi_khach" in pos_js
    assert "{{dia_chi_khach}}" in pos_js
    assert "maxAvailableH * 1.15" in pos_js
    assert "page-break-inside: avoid; break-inside: avoid;" in pos_js
