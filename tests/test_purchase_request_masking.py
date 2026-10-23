import pytest
from starlette.testclient import TestClient
from server import app
from database import get_db, init_db
from dependencies import require_permission, get_current_user

client = TestClient(app)

def test_purchase_request_masking_and_convert_po():
    saved_overrides = dict(app.dependency_overrides)
    app.dependency_overrides.clear()
    app.dependency_overrides[get_current_user] = lambda: {"id": 10, "name": "Thu Ngân Spa", "role": "cashier"}
    app.dependency_overrides[require_permission("purchases.manage")] = lambda: {"id": 2, "name": "Thủ Kho Phụng", "role": "warehouse"}

    try:
        init_db()
        conn = get_db()
        cur = conn.cursor()

        # Seed staff warehouse (Phụng)
        cur.execute("INSERT OR REPLACE INTO staff (id, name, role, is_active, token_version) VALUES (2, 'Phụng Thủ Kho', 'warehouse', 1, 0)")

        # Seed suppliers
        cur.execute("INSERT OR IGNORE INTO contacts (id, name, type) VALUES (7100, 'Cty TNHH Nhập Khẩu Bí Mật', 'supplier')")
        cur.execute("INSERT OR IGNORE INTO contacts (id, name, type) VALUES (7200, 'Xưởng Phụ Kiện Giá Gốc', 'supplier')")

        # Seed products with cost prices
        cur.execute("""
            INSERT OR REPLACE INTO products (id, code, name, type, is_active, sell_price, cost_price, stock, unit)
            VALUES (7101, 'SP-REQ-01', 'Dầu Tắm Trị Ve Masked', 'product', 1, 200000, 110000, 3, 'chai')
        """)
        cur.execute("""
            INSERT OR REPLACE INTO products (id, code, name, type, is_active, sell_price, cost_price, stock, unit)
            VALUES (7201, 'SP-REQ-02', 'Lược Chải Lông Masked', 'product', 1, 80000, 35000, 2, 'cái')
        """)

        # Link supplier items
        cur.execute("INSERT OR IGNORE INTO supplier_items (supplier_id, item_type, product_id, default_cost) VALUES (7100, 'product', 7101, 110000)")
        cur.execute("INSERT OR IGNORE INTO supplier_items (supplier_id, item_type, product_id, default_cost) VALUES (7200, 'product', 7201, 35000)")
        conn.commit()

        # 1. Check Masked Catalog
        res_cat = client.get("/api/purchase-requests/catalog-masked")
        assert res_cat.status_code == 200, res_cat.text
        catalog = res_cat.json()

        # Verify: items in catalog do NOT contain cost_price, supplier name, or supplier_id
        item1 = next((x for x in catalog if x["id"] == 7101), None)
        assert item1 is not None
        assert "cost_price" not in item1
        assert "supplier_id" not in item1
        assert "supplier_name" not in item1
        assert "source_group" in item1
        assert item1["source_group"].startswith("NGUON-")

        # 2. Store staff creates a Purchase Request
        payload = {
            "department": "spa",
            "priority": "urgent",
            "note": "Cần gấp cho ca chiều mai",
            "items": [
                {"product_id": 7101, "quantity": 10, "note": "Hết dầu tắm"},
                {"product_id": 7201, "quantity": 5, "note": "Gãy lược"}
            ]
        }
        res_create = client.post("/api/purchase-requests", json=payload)
        assert res_create.status_code == 200, res_create.text
        create_data = res_create.json()
        assert create_data["success"] is True
        req_id = create_data["id"]
        req_code = create_data["code"]

        # Verify staff_reminders was created for warehouse
        cur.execute("SELECT title, priority, is_done FROM staff_reminders WHERE title LIKE ?", (f"%{req_code}%",))
        reminder = cur.fetchone()
        assert reminder is not None
        assert reminder["priority"] == "urgent"
        assert reminder["is_done"] == 0

        # 2b. Verify get items of the request (masking test: no cost_price or supplier_id)
        res_items = client.get(f"/api/purchase-requests/{req_id}/items")
        assert res_items.status_code == 200, res_items.text
        items_data = res_items.json()
        assert len(items_data) == 2
        for it in items_data:
            assert "cost_price" not in it
            assert "supplier_id" not in it
            assert "product_name" in it
            assert it["quantity"] in (10.0, 5.0)

        # 3. Warehouse manager converts request to PO
        app.dependency_overrides[get_current_user] = lambda: {"id": 2, "name": "Thủ Kho Phụng", "role": "owner"}
        res_conv = client.post(f"/api/purchase-requests/{req_id}/convert-to-po")
        assert res_conv.status_code == 200, res_conv.text
        conv_data = res_conv.json()
        assert conv_data["success"] is True
        po_code = conv_data["purchase_code"]

        # Verify PO exists in purchases table with status 'draft' and real cost prices
        cur.execute("SELECT status, total_amount, supplier_id FROM purchases WHERE code = ?", (po_code,))
        po_row = cur.fetchone()
        assert po_row is not None
        assert po_row["status"] == "draft"
        expected_total = (10 * 110000) + (5 * 35000)
        assert po_row["total_amount"] == expected_total

        # Verify purchase request status updated to 'converted'
        cur.execute("SELECT status, converted_purchase_code FROM purchase_requests WHERE id = ?", (req_id,))
        pr_row = cur.fetchone()
        assert pr_row["status"] == "converted"
        assert pr_row["converted_purchase_code"] == po_code

        conn.close()
    finally:
        app.dependency_overrides = saved_overrides
