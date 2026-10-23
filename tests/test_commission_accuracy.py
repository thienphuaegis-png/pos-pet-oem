import pytest
from fastapi.testclient import TestClient
import database
from server import app
from tests.auth_helpers import owner_auth_headers
from services.commission import sales_commission_by_staff

client = TestClient(app, headers=owner_auth_headers())

def test_order_edit_and_bulk_reassign_updates_commission():
    conn = database.get_db(); cur = conn.cursor()
    cur.execute("DELETE FROM staff WHERE name IN ('HH 5%','HH 10%')")
    cur.execute("INSERT INTO staff (name, role, is_active, commission_rate) VALUES ('HH 5%', 'staff', 1, 5)")
    sid1 = cur.lastrowid
    cur.execute("INSERT INTO staff (name, role, is_active, commission_rate) VALUES ('HH 10%', 'staff', 1, 10)")
    sid2 = cur.lastrowid
    cur.execute("DELETE FROM orders WHERE code = 'HD-TEST-COMM-01'")
    cur.execute("""INSERT INTO orders (code, customer_id, staff_id, total_amount, discount, final_amount, paid_amount, debt_amount, commission_amount, status)
                   VALUES ('HD-TEST-COMM-01', NULL, ?, 1000000, 0, 1000000, 1000000, 0, 50000, 'Đã thanh toán')""", (sid1,))
    conn.commit(); conn.close()

    # 1. Sửa đơn giảm giá còn 600k -> hoa hồng phải tự đổi từ 50k về 30k
    r = client.put("/api/orders/HD-TEST-COMM-01", json={"discount": 400000})
    assert r.status_code == 200
    conn = database.get_db()
    assert conn.execute("SELECT commission_amount FROM orders WHERE code='HD-TEST-COMM-01'").fetchone()[0] == 30000
    conn.close()

    # 2. Đổi người bán sang NV 10% -> hoa hồng phải thành 60k
    r2 = client.post("/api/orders/bulk-update-staff", json={"order_codes": ["HD-TEST-COMM-01"], "new_staff_id": sid2})
    assert r2.status_code == 200
    conn = database.get_db()
    assert conn.execute("SELECT commission_amount FROM orders WHERE code='HD-TEST-COMM-01'").fetchone()[0] == 60000
    conn.close()

    # Cleanup
    conn = database.get_db(); cur = conn.cursor()
    cur.execute("DELETE FROM orders WHERE code = 'HD-TEST-COMM-01'")
    cur.execute("DELETE FROM staff WHERE id IN (?, ?)", (sid1, sid2))
    conn.commit(); conn.close()
