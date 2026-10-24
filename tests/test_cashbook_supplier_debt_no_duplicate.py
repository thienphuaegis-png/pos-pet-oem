import pytest
from starlette.testclient import TestClient
from server import app
from database import get_db, init_db
from dependencies import require_permission, get_current_user
from scripts.migrate_cashbook_sync import sync_missing_cashbook_entries, cleanup_duplicate_sync_vouchers

client = TestClient(app)

def test_pay_supplier_debt_single_voucher_and_no_auto_duplicate():
    saved_overrides = dict(app.dependency_overrides)
    app.dependency_overrides.clear()
    app.dependency_overrides[get_current_user] = lambda: {"id": 1, "name": "Admin", "role": "owner"}

    try:
        init_db()
        conn = get_db()
        cur = conn.cursor()

        # 1. Seed a supplier with an unpaid purchase (mua nợ)
        cur.execute("INSERT OR IGNORE INTO contacts (id, name, type, debt, initial_debt_personal) VALUES (9500, 'NCC Thùng Carton Minh Long', 'supplier', 500000, 0)")
        cur.execute("""
            INSERT OR REPLACE INTO purchases (id, code, supplier_id, warehouse_id, subtotal_amount, total_amount, paid_amount, debt_amount, status, fund_source, created_by)
            VALUES (9501, 'PN-TEST-NODUP-01', 9500, 1, 500000, 500000, 0, 500000, 'received', 'PERSONAL', 'Admin')
        """)
        conn.commit()

        # Verify no cashbook voucher initially
        cur.execute("SELECT COUNT(*) FROM cashbook WHERE contact_id = 9500")
        assert cur.fetchone()[0] == 0

        # 2. Pay supplier debt via /api/cashflow-debts/pay-supplier
        pay_payload = {
            "supplier_id": 9500,
            "amount": 500000,
            "fund_source": "PERSONAL",
            "payment_date": "2026-10-24"
        }
        res_pay = client.post("/api/cashflow-debts/pay-supplier", json=pay_payload)
        assert res_pay.status_code == 200, res_pay.text

        # Verify exactly ONE cashbook entry created with category 'Chi trả nợ NCC'
        cur.execute("SELECT id, code, category, amount, ref_type, note FROM cashbook WHERE contact_id = 9500")
        cb_rows = [dict(r) for r in cur.fetchall()]
        assert len(cb_rows) == 1
        assert cb_rows[0]["category"] == "Chi trả nợ NCC"
        assert cb_rows[0]["amount"] == 500000

        # 3. Simulate calling sync_missing_cashbook_entries (like on server restart)
        # It must NOT create any duplicate voucher!
        sync_res = sync_missing_cashbook_entries(conn)
        cur.execute("SELECT id, code, category, amount, note FROM cashbook WHERE contact_id = 9500")
        cb_rows_after = [dict(r) for r in cur.fetchall()]
        assert len(cb_rows_after) == 1, f"Expected 1 voucher, got: {cb_rows_after}"

        # 4. Test pay_single_order_debt via /api/cashflow-debts/pay-order
        cur.execute("INSERT OR IGNORE INTO contacts (id, name, type, debt, initial_debt_personal) VALUES (9510, 'NCC Bao Bì Tiến Đạt', 'supplier', 300000, 0)")
        cur.execute("""
            INSERT OR REPLACE INTO purchases (id, code, supplier_id, warehouse_id, subtotal_amount, total_amount, paid_amount, debt_amount, status, fund_source, created_by)
            VALUES (9511, 'PN-TEST-NODUP-02', 9510, 1, 300000, 300000, 0, 300000, 'received', 'PERSONAL', 'Admin')
        """)
        conn.commit()

        order_pay_payload = {
            "order_type": "PO",
            "order_id": 9511,
            "amount": 300000,
            "fund_source": "PERSONAL",
            "payment_date": "2026-10-24"
        }
        res_order_pay = client.post("/api/cashflow-debts/pay-order", json=order_pay_payload)
        assert res_order_pay.status_code == 200, res_order_pay.text

        cur.execute("SELECT id, code, category, amount, ref_type, ref_id FROM cashbook WHERE contact_id = 9510")
        cb_order_rows = [dict(r) for r in cur.fetchall()]
        assert len(cb_order_rows) == 1
        assert cb_order_rows[0]["category"] == "Chi trả nợ NCC"
        assert cb_order_rows[0]["ref_type"] == "purchase"
        assert cb_order_rows[0]["ref_id"] == 9511

        # Run sync again, still must be 1
        sync_res2 = sync_missing_cashbook_entries(conn)
        cur.execute("SELECT COUNT(*) FROM cashbook WHERE contact_id = 9510")
        assert cur.fetchone()[0] == 1

        # 5. Verify cleanup_duplicate_sync_vouchers cleans up synthetic duplicate if one exists
        cur.execute("""
            INSERT INTO cashbook (code, type, category, amount, contact_id, ref_type, ref_id, note)
            VALUES ('PC-DUMMY-SYNC', 'out', 'Chi tiền nhập hàng', 300000, 9510, 'purchase', 9511, 'Chi thanh toán phiếu nhập PN-TEST-NODUP-02 (Đồng bộ tự động)')
        """)
        conn.commit()
        cur.execute("SELECT COUNT(*) FROM cashbook WHERE contact_id = 9510")
        assert cur.fetchone()[0] == 2

        cleaned_count = cleanup_duplicate_sync_vouchers(conn)
        assert cleaned_count >= 1

        cur.execute("SELECT COUNT(*) FROM cashbook WHERE contact_id = 9510")
        assert cur.fetchone()[0] == 1

        conn.close()
    finally:
        app.dependency_overrides = saved_overrides
