import pytest
from starlette.testclient import TestClient
from server import app
from database import get_db, init_db
from dependencies import require_permission, get_current_user

client = TestClient(app)

def test_oem_draft_creation_and_no_cashbook():
    saved_overrides = dict(app.dependency_overrides)
    app.dependency_overrides.clear()
    app.dependency_overrides[require_permission("oem.manage")] = lambda: {"id": 1, "name": "Admin", "role": "owner"}
    app.dependency_overrides[get_current_user] = lambda: {"id": 1, "name": "Admin", "role": "owner"}
    try:
        init_db()
        conn = get_db()
        cur = conn.cursor()

        # Seed partner, warehouse, product
        cur.execute("INSERT OR IGNORE INTO contacts (id, name, type) VALUES (9001, 'Xưởng May OEM Test', 'supplier')")
        cur.execute("INSERT OR IGNORE INTO warehouses (id, name, is_active) VALUES (1, 'Kho Tổng', 1)")
        cur.execute("INSERT OR IGNORE INTO products (id, code, name, type, is_active, sell_price, cost_price, stock) VALUES (9001, 'SP-OEM-01', 'Áo Pet OEM Test', 'product', 1, 100000, 40000, 10)")
        conn.commit()

        # Count cashbook before
        cur.execute("SELECT COUNT(*) FROM cashbook WHERE ref_type = 'oem_order'")
        cb_before = cur.fetchone()[0]

        # 1. Create OEM order as DRAFT with is_draft = True
        payload_draft = {
            "partner_id": 9001,
            "target_type": "product",
            "oem_warehouse_id": 1,
            "dest_warehouse_id": 1,
            "deposit_amount": 500000, # even if deposit is passed
            "is_draft": True,
            "items": [
                {
                    "item_type": "product",
                    "product_id": 9001,
                    "ordered_qty": 20,
                    "unit_price": 40000,
                    "vat_rate": 8.0
                }
            ],
            "note": "Đơn OEM Nháp Test"
        }

        res = client.post("/api/oem/orders", json=payload_draft)
        assert res.status_code == 200, res.text
        data = res.json()
        assert data["success"] is True
        order_id = data["id"]
        code = data["code"]

        # Check DB status is DRAFT and deposit_amount is 0
        cur.execute("SELECT status, deposit_amount, total_final_amount, remaining_payment FROM oem_orders WHERE id = ?", (order_id,))
        order_row = cur.fetchone()
        assert order_row["status"] == "DRAFT"
        assert order_row["deposit_amount"] == 0.0
        assert order_row["remaining_payment"] == order_row["total_final_amount"]

        # Cashbook count should NOT change
        cur.execute("SELECT COUNT(*) FROM cashbook WHERE ref_type = 'oem_order'")
        cb_after = cur.fetchone()[0]
        assert cb_after == cb_before

        # 2. Update DRAFT order
        update_payload = {
            "partner_id": 9001,
            "target_type": "product",
            "oem_warehouse_id": 1,
            "dest_warehouse_id": 1,
            "items": [
                {
                    "item_type": "product",
                    "product_id": 9001,
                    "ordered_qty": 30,
                    "unit_price": 38000,
                    "vat_rate": 8.0
                }
            ],
            "note": "Cập nhật nháp 30 cái"
        }
        res_up = client.put(f"/api/oem/orders/{order_id}", json=update_payload)
        assert res_up.status_code == 200, res_up.text

        # 3. Delete DRAFT order
        res_del = client.delete(f"/api/oem/orders/{order_id}")
        assert res_del.status_code == 200, res_del.text

        cur.execute("SELECT id FROM oem_orders WHERE id = ?", (order_id,))
        assert cur.fetchone() is None
        conn.close()
    finally:
        app.dependency_overrides = saved_overrides
