import pytest
from starlette.testclient import TestClient
from server import app
from database import get_db, init_db
from dependencies import get_current_user

client = TestClient(app)

def test_oem_draft_confirm_to_order():
    saved_overrides = dict(app.dependency_overrides)
    app.dependency_overrides.clear()
    app.dependency_overrides[get_current_user] = lambda: {"id": 1, "name": "Thủ Kho Phụng", "role": "warehouse"}
    try:
        init_db()
        conn = get_db()
        cur = conn.cursor()

        # Tạo đối tác xưởng OEM
        cur.execute("INSERT OR IGNORE INTO contacts (id, name, type) VALUES (9920, 'Xưởng Gia Công Test', 'supplier')")
        cur.execute("INSERT OR IGNORE INTO warehouses (id, name, supplier_id, is_oem, is_active) VALUES (9920, 'Kho Xưởng Test', 9920, 1, 1)")

        # Tạo sản phẩm
        cur.execute("""
            INSERT OR REPLACE INTO products (id, code, name, type, is_active, sell_price, cost_price, stock, min_stock, unit)
            VALUES (9921, 'SP_OEM_TEST_1', 'Sản Phẩm OEM Test Chốt Đơn', 'product', 1, 100000, 45000, 0, 10, 'Chai')
        """)
        conn.commit()
        conn.close()

        # Tạo 1 đơn nháp OEM
        res_create = client.post("/api/oem/orders", json={
            "partner_id": 9920,
            "oem_warehouse_id": 9920,
            "dest_warehouse_id": 1,
            "expected_delivery_date": "2026-11-01",
            "vat_percent": 8.0,
            "fund_source": "COMPANY",
            "is_draft": True,
            "deposit_amount": 0,
            "items": [
                {"product_id": 9921, "ordered_qty": 500, "unit_price": 45000}
            ]
        })
        assert res_create.status_code == 200, res_create.text
        order_id = res_create.json()["id"]

        # Kiểm tra trạng thái ban đầu là DRAFT
        conn = get_db()
        cur = conn.cursor()
        cur.execute("SELECT status, deposit_amount FROM oem_orders WHERE id = ?", (order_id,))
        row = cur.fetchone()
        assert row["status"] == "DRAFT"
        assert row["deposit_amount"] == 0.0

        conn.commit()
        conn.close()

        # 1. TEST ENDPOINT CHỐT ĐƠN 1-CHẠM: POST /api/oem/orders/{id}/confirm
        res_confirm = client.post(f"/api/oem/orders/{order_id}/confirm")
        assert res_confirm.status_code == 200, res_confirm.text
        assert res_confirm.json()["status"] == "DEPOSITED"

        conn = get_db()
        cur = conn.cursor()
        cur.execute("SELECT status FROM oem_orders WHERE id = ?", (order_id,))
        assert cur.fetchone()["status"] == "DEPOSITED"

        # Đưa về lại DRAFT để test luồng sửa đơn chuyển sang chính thức
        cur.execute("UPDATE oem_orders SET status = 'DRAFT' WHERE id = ?", (order_id,))
        conn.commit()
        conn.close()

        # 2. TEST LUỒNG SỬA ĐƠN NHÁP: PUT /api/oem/orders/{id} với is_confirm=True
        res_update = client.put(f"/api/oem/orders/{order_id}", json={
            "partner_id": 9920,
            "oem_warehouse_id": 9920,
            "dest_warehouse_id": 1,
            "expected_delivery_date": "2026-11-05",
            "vat_percent": 8.0,
            "fund_source": "COMPANY",
            "is_draft": False,
            "is_confirm": True,
            "items": [
                {"product_id": 9921, "ordered_qty": 600, "unit_price": 45000}
            ]
        })
        assert res_update.status_code == 200, res_update.text

        conn = get_db()
        cur = conn.cursor()
        cur.execute("SELECT status, total_final_amount FROM oem_orders WHERE id = ?", (order_id,))
        row_up = cur.fetchone()
        assert row_up["status"] == "DEPOSITED"
        conn.close()
    finally:
        app.dependency_overrides = saved_overrides
