import pytest
from starlette.testclient import TestClient
from server import app
from database import get_db, init_db
from dependencies import get_current_user

client = TestClient(app)

def test_purchase_draft_confirm_to_order():
    saved_overrides = dict(app.dependency_overrides)
    app.dependency_overrides.clear()
    app.dependency_overrides[get_current_user] = lambda: {"id": 1, "name": "Thủ Kho Phụng", "role": "warehouse"}
    try:
        init_db()
        conn = get_db()
        cur = conn.cursor()

        # Tạo NCC & Sản phẩm
        cur.execute("INSERT OR IGNORE INTO contacts (id, name, type) VALUES (9930, 'NCC Thử Nghiệm Chốt Đơn', 'supplier')")
        cur.execute("""
            INSERT OR REPLACE INTO products (id, code, name, type, is_active, sell_price, cost_price, stock, min_stock, unit)
            VALUES (9931, 'SP_PO_TEST_1', 'Sản Phẩm PO Test Chốt Đơn', 'product', 1, 80000, 40000, 0, 10, 'Chai')
        """)
        conn.commit()
        conn.close()

        # 1. Tạo 1 đơn nháp PO (draft)
        res_create = client.post("/api/purchases", json={
            "supplier_id": 9930,
            "warehouse_id": 1,
            "expected_date": "2026-11-05",
            "fund_source": "COMPANY",
            "status": "draft",
            "paid_amount": 0,
            "items": [
                {
                    "item_type": "product",
                    "product_id": 9931,
                    "item_name": "Sản Phẩm PO Test Chốt Đơn",
                    "unit": "Chai",
                    "quantity": 200,
                    "cost_price": 40000
                }
            ]
        })
        assert res_create.status_code == 200, res_create.text
        po_code = res_create.json()["purchase_code"]

        conn = get_db()
        cur = conn.cursor()
        cur.execute("SELECT status FROM purchases WHERE code = ?", (po_code,))
        assert cur.fetchone()["status"] == "draft"
        conn.close()

        # 2. TEST ENDPOINT CHỐT ĐƠN NHÁP: POST /api/purchases/{code}/confirm
        res_confirm = client.post(f"/api/purchases/{po_code}/confirm")
        assert res_confirm.status_code == 200, res_confirm.text
        assert res_confirm.json()["new_status"] == "pending"

        conn = get_db()
        cur = conn.cursor()
        cur.execute("SELECT status FROM purchases WHERE code = ?", (po_code,))
        assert cur.fetchone()["status"] == "pending"

        # Đưa về lại draft để test luồng cập nhật khi sửa
        cur.execute("UPDATE purchases SET status = 'draft' WHERE code = ?", (po_code,))
        conn.commit()
        conn.close()

        # 3. TEST SỬA ĐƠN VÀ CHUYỂN SANG PENDING
        res_update = client.put(f"/api/purchases/{po_code}", json={
            "supplier_id": 9930,
            "warehouse_id": 1,
            "status": "pending",
            "fund_source": "COMPANY",
            "paid_amount": 0,
            "items": [
                {
                    "item_type": "product",
                    "product_id": 9931,
                    "item_name": "Sản Phẩm PO Test Chốt Đơn",
                    "unit": "Chai",
                    "quantity": 250,
                    "cost_price": 40000
                }
            ]
        })
        assert res_update.status_code == 200, res_update.text

        conn = get_db()
        cur = conn.cursor()
        cur.execute("SELECT status, total_amount FROM purchases WHERE code = ?", (po_code,))
        row_up = cur.fetchone()
        assert row_up["status"] == "pending"
        assert row_up["total_amount"] == 10000000.0
        conn.close()
    finally:
        app.dependency_overrides = saved_overrides
