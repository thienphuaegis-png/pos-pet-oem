import pytest
from starlette.testclient import TestClient
from server import app
from database import get_db, init_db
from dependencies import require_permission, get_current_user
import datetime

client = TestClient(app)

def test_shipping_fee_cashbook_note_and_purchase_split():
    saved_overrides = dict(app.dependency_overrides)
    app.dependency_overrides.clear()
    app.dependency_overrides[get_current_user] = lambda: {"id": 1, "name": "Admin", "role": "owner"}

    try:
        init_db()
        conn = get_db()
        cur = conn.cursor()

        # 1. Test POS Order with shipping fee records detail in cashbook note
        cur.execute("INSERT OR IGNORE INTO contacts (id, name, type) VALUES (8888, 'Khách Có Ship', 'customer')")
        cur.execute("""
            INSERT OR REPLACE INTO products (id, code, name, type, is_active, sell_price, cost_price, stock, unit)
            VALUES (8881, 'SP-SHIP-01', 'Hạt Cho Chó Ship', 'product', 1, 150000, 100000, 10, 'gói')
        """)
        conn.commit()

        order_payload = {
            "customer_id": 8888,
            "staff_id": 1,
            "discount": 0,
            "shipping_fee": 30000,
            "paid_amount": 180000,
            "payment_method": "cash",
            "items": [
                {"product_id": 8881, "quantity": 1, "price": 150000, "unit": "gói"}
            ]
        }
        res_ord = client.post("/api/orders", json=order_payload)
        assert res_ord.status_code == 200, res_ord.text
        ord_data = res_ord.json()
        ord_code = ord_data["order_code"]

        cur.execute("SELECT note, amount FROM cashbook WHERE ref_type = 'order' AND note LIKE ? ORDER BY id DESC LIMIT 1", (f"%{ord_code}%",))
        cb_row = cur.fetchone()
        assert cb_row is not None
        assert cb_row["amount"] == 180000
        assert "Gồm phí ship: 30,000 đ" in cb_row["note"]

        # 2. Test Purchase Request with split_by_supplier = True
        cur.execute("INSERT OR IGNORE INTO contacts (id, name, type) VALUES (9100, 'NCC Thức Ăn A', 'supplier')")
        cur.execute("INSERT OR IGNORE INTO contacts (id, name, type) VALUES (9200, 'NCC Phụ Kiện B', 'supplier')")

        cur.execute("""
            INSERT OR REPLACE INTO products (id, code, name, type, is_active, sell_price, cost_price, stock, unit)
            VALUES (9101, 'SP-SPLIT-A', 'Hạt Thức Ăn NCC A', 'product', 1, 100000, 70000, 5, 'gói')
        """)
        cur.execute("""
            INSERT OR REPLACE INTO products (id, code, name, type, is_active, sell_price, cost_price, stock, unit)
            VALUES (9201, 'SP-SPLIT-B', 'Vòng Cổ NCC B', 'product', 1, 50000, 25000, 4, 'cái')
        """)

        cur.execute("INSERT OR IGNORE INTO supplier_items (supplier_id, item_type, product_id, default_cost) VALUES (9100, 'product', 9101, 70000)")
        cur.execute("INSERT OR IGNORE INTO supplier_items (supplier_id, item_type, product_id, default_cost) VALUES (9200, 'product', 9201, 25000)")
        conn.commit()

        pr_payload = {
            "staff_id": 1,
            "staff_name": "Admin",
            "department": "store",
            "priority": "normal",
            "note": "Hàng sắp hết tuần này",
            "split_by_supplier": True,
            "items": [
                {"product_id": 9101, "quantity": 10},
                {"product_id": 9201, "quantity": 20}
            ]
        }
        res_pr = client.post("/api/purchase-requests", json=pr_payload)
        assert res_pr.status_code == 200, res_pr.text
        pr_data = res_pr.json()
        assert pr_data["success"] is True
        assert pr_data["created_count"] == 2
        assert len(pr_data["codes"]) == 2

        # 3. Test AI staff briefing KPI: incoming_today_count and is_today
        today_str = datetime.datetime.now().strftime("%Y-%m-%d")
        cur.execute("""
            INSERT OR REPLACE INTO purchases (id, code, supplier_id, warehouse_id, subtotal_amount, total_amount, paid_amount, debt_amount, status, fund_source, expected_date, created_by)
            VALUES (99901, 'PN-TODAY-01', 9100, 1, 500000, 500000, 0, 500000, 'pending', 'COMPANY', ?, 'Admin')
        """, (today_str,))
        conn.commit()

        res_ai = client.get("/api/ai/staff-briefing")
        assert res_ai.status_code == 200, res_ai.text
        ai_data = res_ai.json()
        assert "warehouse_kpi" in ai_data
        assert "incoming_today_count" in ai_data["warehouse_kpi"]
        assert ai_data["warehouse_kpi"]["incoming_today_count"] >= 1

        today_shipment = next((s for s in ai_data["warehouse_kpi"]["incoming_shipments"] if s["code"] == "PN-TODAY-01"), None)
        assert today_shipment is not None
        assert today_shipment["is_today"] is True

        conn.close()
    finally:
        app.dependency_overrides = saved_overrides
