import pytest
from fastapi.testclient import TestClient
import database
from server import app
from tests.auth_helpers import owner_auth_headers

client = TestClient(app, headers=owner_auth_headers())

def test_oem_order_list_and_detail_data():
    database.init_db()
    conn = database.get_db()
    cur = conn.cursor()

    # Tạo kho xưởng test & NCC test
    cur.execute("INSERT OR IGNORE INTO warehouses (id, name, is_active) VALUES (991, 'Kho Xưởng Test', 1)")
    cur.execute("INSERT OR IGNORE INTO contacts (id, name, phone, type) VALUES (992, 'Xưởng OEM Test', '0912345678', 'supplier')")
    
    # Tạo sản phẩm & nguyên liệu
    cur.execute("INSERT OR REPLACE INTO products (id, code, name, type, unit, cost_price, sell_price, is_active) VALUES (993, 'SP-OEM-TEST', 'Sữa Tắm OEM Test', 'product', 'chai', 20000, 50000, 1)")
    cur.execute("INSERT OR REPLACE INTO ingredients (id, code, name, unit, type) VALUES (994, 'ING-CHAI-TEST', 'Vỏ Chai Test', 'chai', 'IS_PHYSICAL')")
    cur.execute("INSERT OR REPLACE INTO product_bom (product_id, ingredient_id, quantity) VALUES (993, 994, 1.0)")
    cur.execute("INSERT OR REPLACE INTO inventory (warehouse_id, ingredient_id, quantity) VALUES (991, 994, 500)")

    # Tạo đơn OEM test
    cur.execute("""
        INSERT INTO oem_orders (
            id, code, partner_id, oem_warehouse_id, dest_warehouse_id,
            total_raw_amount, discount_percent, vat_percent, total_final_amount,
            deposit_amount, remaining_payment, fund_source, status, created_by
        ) VALUES (
            88888, 'OEM-TEST-EXP-001', 992, 991, 1,
            20000000, 0, 0, 20000000,
            10000000, 10000000, 'COMPANY', 'DEPOSITED', 'Quản lý'
        )
    """)
    cur.execute("""
        INSERT INTO oem_order_items (order_id, product_id, ordered_qty, unit_price)
        VALUES (88888, 993, 1000, 20000)
    """)
    conn.commit()
    conn.close()

    # 1. Kiểm tra API danh sách đơn OEM
    res_list = client.get("/api/oem/orders")
    assert res_list.status_code == 200
    orders = res_list.json()
    test_ord = next((o for o in orders if o["code"] == "OEM-TEST-EXP-001"), None)
    assert test_ord is not None
    assert test_ord["partner_name"] == "Xưởng OEM Test"
    assert test_ord["oem_warehouse_name"] == "Kho Xưởng Test"
    assert test_ord["total_final_amount"] == 20000000
    assert test_ord["deposit_amount"] == 10000000
    assert test_ord["remaining_payment"] == 10000000

    # 2. Kiểm tra API chi tiết đơn OEM phục vụ bung dòng mở rộng (Drawer)
    res_detail = client.get(f"/api/oem/orders/{test_ord['id']}")
    assert res_detail.status_code == 200
    detail = res_detail.json()
    assert len(detail["items"]) == 1
    assert detail["items"][0]["product_name"] == "Sữa Tắm OEM Test"
    assert detail["items"][0]["ordered_qty"] == 1000
    
    # Kiểm tra vật tư BOM tính toán sẵn
    assert len(detail["materials_needed"]) == 1
    mat = detail["materials_needed"][0]
    assert mat["ingredient_name"] == "Vỏ Chai Test"
    assert mat["needed_qty"] == 1000.0
    assert mat["current_stock_at_oem"] == 500.0
