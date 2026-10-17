import pytest
import sqlite3
from database import get_db, init_db

def test_database_schema_has_oem_ingredient_columns():
    init_db()
    conn = get_db()
    cur = conn.cursor()
    
    # 1. Kiểm tra cột target_type trong oem_orders
    cur.execute("PRAGMA table_info(oem_orders)")
    order_cols = [c[1] for c in cur.fetchall()]
    assert "target_type" in order_cols, "Cột target_type chưa tồn tại trong oem_orders"
    
    # 2. Kiểm tra cột item_type và ingredient_id trong oem_order_items
    cur.execute("PRAGMA table_info(oem_order_items)")
    item_cols = [c[1] for c in cur.fetchall()]
    assert "item_type" in item_cols, "Cột item_type chưa tồn tại trong oem_order_items"
    assert "ingredient_id" in item_cols, "Cột ingredient_id chưa tồn tại trong oem_order_items"
    
    # 3. Kiểm tra bảng ingredient_bom
    cur.execute("SELECT name FROM sqlite_master WHERE type='table' AND name='ingredient_bom'")
    assert cur.fetchone() is not None, "Bảng ingredient_bom chưa được tạo"
    
    cur.execute("PRAGMA table_info(ingredient_bom)")
    bom_cols = [c[1] for c in cur.fetchall()]
    assert "parent_ingredient_id" in bom_cols
    assert "child_ingredient_id" in bom_cols
    assert "quantity" in bom_cols
    conn.close()

from fastapi.testclient import TestClient
from server import app
from tests.auth_helpers import owner_auth_headers

client = TestClient(app, headers=owner_auth_headers())

def test_ingredient_bom_crud_api():
    conn = get_db()
    cur = conn.cursor()
    # Tạo 2 nguyên liệu: 991 (Phôi tem trắng), 992 (Tem in hoàn thiện)
    cur.execute("INSERT OR REPLACE INTO ingredients (id, code, name, unit, type) VALUES (991, 'PHOI-TEM-01', 'Phôi tem trắng cuộn', 'cái', 'IS_PHYSICAL')")
    cur.execute("INSERT OR REPLACE INTO ingredients (id, code, name, unit, type) VALUES (992, 'TEM-IN-01', 'Tem Nước Lau Sàn Đã In', 'cái', 'IS_PHYSICAL')")
    cur.execute("INSERT OR REPLACE INTO price_history (ingredient_id, purchase_price, effective_date) VALUES (991, 1200, '2026-10-01')")
    conn.commit()
    conn.close()

    # 1. Cấu hình BOM phôi cho Tem 992: cần 1 Phôi 991
    payload = {
        "items": [
            {"child_ingredient_id": 991, "quantity": 1.0}
        ]
    }
    res_set = client.post("/api/ingredients/992/bom", json=payload)
    assert res_set.status_code == 200
    data_set = res_set.json()
    assert data_set["success"] is True

    # 2. Lấy danh sách BOM phôi
    res_get = client.get("/api/ingredients/992/bom")
    assert res_get.status_code == 200
    data_get = res_get.json()
    assert len(data_get["items"]) == 1
    assert data_get["items"][0]["child_ingredient_id"] == 991
    assert data_get["items"][0]["child_code"] == "PHOI-TEM-01"
    assert data_get["items"][0]["quantity"] == 1.0
    assert data_get["items"][0]["latest_cost"] == 1200.0

def test_oem_calculate_bom_stock_and_create_order_for_ingredients():
    conn = get_db()
    cur = conn.cursor()
    # 2. Tạo nhà máy và kho xưởng
    cur.execute("INSERT OR REPLACE INTO contacts (id, type, name, phone) VALUES (88801, 'supplier', 'Nhà Máy In Tem Test', '0988111222')")
    cur.execute("INSERT OR REPLACE INTO warehouses (id, code, name, is_active, is_oem, supplier_id) VALUES (88802, 'WH-IN-TEM', 'Kho Xưởng In', 1, 1, 88801)")
    # 3. Tồn kho phôi 991 tại kho xưởng 88802 là 500 cái
    cur.execute("INSERT OR REPLACE INTO inventory (warehouse_id, ingredient_id, quantity) VALUES (88802, 991, 500)")
    # 4. Định lượng BOM phôi cho Tem 992
    cur.execute("INSERT OR REPLACE INTO ingredient_bom (parent_ingredient_id, child_ingredient_id, quantity) VALUES (992, 991, 1.0)")
    conn.commit()
    conn.close()

    # 1. Test đối chiếu vật tư phôi tại xưởng qua calculate-bom-stock
    check_payload = {
        "warehouse_id": 88802,
        "items": [
            {"ingredient_id": 992, "item_type": "ingredient", "quantity": 200.0}
        ]
    }
    res_stock = client.post("/api/oem/calculate-bom-stock", json=check_payload)
    assert res_stock.status_code == 200
    stock_data = res_stock.json()
    assert len(stock_data) == 1
    assert stock_data[0]["ingredient_id"] == 991
    assert stock_data[0]["needed_qty"] == 200.0
    assert stock_data[0]["current_stock"] == 500.0
    assert stock_data[0]["is_sufficient"] is True

    # 2. Test tạo đơn OEM gia công nguyên liệu
    order_payload = {
        "partner_id": 88801,
        "oem_warehouse_id": 88802,
        "dest_warehouse_id": 1,
        "target_type": "ingredient",
        "fund_source": "COMPANY",
        "vat_percent": 8.0,
        "discount_percent": 10.0,
        "deposit_amount": 50000,
        "items": [
            {
                "item_type": "ingredient",
                "ingredient_id": 992,
                "ordered_qty": 200.0,
                "unit_price": 500.0
            }
        ]
    }
    res_order = client.post("/api/oem/orders", json=order_payload)
    assert res_order.status_code == 200
    order_res = res_order.json()
    assert order_res["success"] is True
    order_id = order_res["id"]

    # 3. Test lấy chi tiết đơn OEM
    res_detail = client.get(f"/api/oem/orders/{order_id}")
    assert res_detail.status_code == 200
    detail = res_detail.json()
    assert detail["target_type"] == "ingredient"
    assert len(detail["items"]) == 1
    assert detail["items"][0]["ingredient_id"] == 992

def test_oem_receive_ingredient_order_and_cost_accounting():
    # Gọi test tạo đơn trước nếu chạy riêng lẻ
    test_oem_calculate_bom_stock_and_create_order_for_ingredients()

    conn = get_db()
    cur = conn.cursor()
    cur.execute("SELECT id FROM oem_orders WHERE partner_id = 88801 ORDER BY id DESC LIMIT 1")
    order_id = cur.fetchone()[0]
    cur.execute("SELECT id FROM oem_order_items WHERE order_id = ?", (order_id,))
    item_id = cur.fetchone()[0]
    conn.close()

    receive_payload = {
        "items": [
            {"item_id": item_id, "received_qty": 200.0}
        ],
        "pay_remaining_now": True,
        "payment_fund_source": "COMPANY"
    }

    res_receive = client.post(f"/api/oem/orders/{order_id}/receive", json=receive_payload)
    assert res_receive.status_code == 200
    rec_data = res_receive.json()
    assert rec_data["success"] is True

    # Xác minh trong CSDL:
    conn = get_db()
    cur = conn.cursor()
    
    # 1. Tồn kho phôi 991 tại kho xưởng 88802 giảm từ 500 -> 300
    cur.execute("SELECT quantity FROM inventory WHERE warehouse_id = 88802 AND ingredient_id = 991")
    assert cur.fetchone()[0] == 300.0

    # 2. Tồn kho tem in 992 tại Kho Tổng (warehouse_id = 1) tăng lên 200
    cur.execute("SELECT quantity FROM inventory WHERE warehouse_id = 1 AND ingredient_id = 992")
    assert cur.fetchone()[0] == 200.0

    # 3. Tồn kho bảng product_inventory KHÔNG được chứa tem in 992
    cur.execute("SELECT COUNT(*) FROM product_inventory WHERE product_id = 992")
    assert cur.fetchone()[0] == 0

    # 4. Giá vốn hoàn thiện trong price_history:
    # Phôi 991: 1.200 đ
    # Công in ròng: 500 đ * (1 - 10%) * (1 + 8%) = 500 * 0.9 * 1.08 = 486 đ
    # Tổng giá vốn = 1.200 + 486 = 1.686 đ
    cur.execute("SELECT purchase_price, note FROM price_history WHERE ingredient_id = 992 ORDER BY effective_date DESC, id DESC LIMIT 1")
    cost_row = cur.fetchone()
    assert cost_row is not None
    assert abs(cost_row[0] - 1686.0) < 0.01

    # 5. Inventory logs phải có log xuất phôi và log nhập tem hoàn thiện
    cur.execute("SELECT change_type, quantity FROM inventory_logs WHERE ingredient_id = 991 ORDER BY id DESC LIMIT 1")
    export_log = cur.fetchone()
    assert export_log[0] == 'EXPORT'
    assert export_log[1] == 200.0

    cur.execute("SELECT change_type, quantity FROM inventory_logs WHERE ingredient_id = 992 ORDER BY id DESC LIMIT 1")
    import_log = cur.fetchone()
    assert import_log[0] == 'IMPORT'
    assert import_log[1] == 200.0
    conn.close()



