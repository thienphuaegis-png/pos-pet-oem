import pytest
import jwt
from starlette.testclient import TestClient
from server import app
from database import get_db, init_db
from dependencies import SECRET, ALGO
from routers.auth import _make_token
from schemas import CashbookUpdate

client = TestClient(app)

def test_edit_and_delete_cashbook_expense():
    saved_overrides = dict(app.dependency_overrides)
    app.dependency_overrides.clear()
    try:
        init_db()
        conn = get_db()
        cur = conn.cursor()
        # Tạo payment account
        cur.execute("INSERT OR IGNORE INTO payment_accounts (id, code, name, account_type, is_active) VALUES (1, 'TM-TEST', 'Két tiền mặt test', 'cash', 1)")
        cur.execute("INSERT OR IGNORE INTO payment_accounts (id, code, name, account_type, is_active) VALUES (2, 'MB-TEST', 'MB Bank test', 'bank', 1)")

        # Tạo staff owner test
        cur.execute("INSERT OR REPLACE INTO staff (id, name, role, is_active, token_version) VALUES (9999, 'Admin Test', 'owner', 1, 0)")

        import time
        ts = int(time.time())
        pc_code = f"PC-TEST-{ts}"
        pt_code = f"PT-TEST-{ts}"

        # Tạo 1 phiếu chi test
        cur.execute("""
            INSERT INTO cashbook (code, type, category, amount, account_id, note)
            VALUES (?, 'out', 'Chi tiền mua vật tư', 500000, 1, 'Mua máy in tem')
        """, (pc_code,))
        voucher_id = cur.lastrowid

        # Tạo 1 phiếu thu test
        cur.execute("""
            INSERT INTO cashbook (code, type, category, amount, account_id, note)
            VALUES (?, 'in', 'Thu tiền bán hàng', 800000, 1, 'Bán cát mèo')
        """, (pt_code,))
        thu_id = cur.lastrowid
        conn.commit()
        conn.close()

        # 1. Thử gọi không có token (unauthorized / 401)
        res_unauth = client.delete(f"/api/cashbook/{voucher_id}")
        assert res_unauth.status_code in (401, 403)

        # 2. Tạo token owner
        token = _make_token(9999, token_version=0)
        headers = {"Authorization": f"Bearer {token}"}

        # 3. Sửa phiếu chi: đổi số tiền sang 650.000đ, đổi sang tài khoản 2
        res_edit = client.put(f"/api/cashbook/{voucher_id}", headers=headers, json={
            "amount": 650000,
            "category": "Chi phí vận hành",
            "account_id": 2,
            "note": "Mua máy in tem và giấy in nhiệt"
        })
        assert res_edit.status_code == 200, res_edit.text
        edited = res_edit.json()
        assert edited["amount"] == 650000
        assert edited["category"] == "Chi phí vận hành"
        assert edited["account_id"] == 2

        # 4. Kiểm tra cho phép sửa phiếu thu (theo Phương án A)
        res_edit_thu = client.put(f"/api/cashbook/{thu_id}", headers=headers, json={"amount": 900000})
        assert res_edit_thu.status_code == 200
        assert res_edit_thu.json()["amount"] == 900000

        # 5. Kiểm tra cho phép xóa phiếu thu
        res_del_thu = client.delete(f"/api/cashbook/{thu_id}", headers=headers)
        assert res_del_thu.status_code == 200
        assert res_del_thu.json()["success"] is True

        # 6. Xóa phiếu chi thành công
        res_del = client.delete(f"/api/cashbook/{voucher_id}", headers=headers)
        assert res_del.status_code == 200, res_del.text
        assert res_del.json()["success"] is True

        # 7. Kiểm tra vai trò nhân viên không có quyền cashbook.manage bị chặn 403 Forbidden
        conn = get_db()
        cur = conn.cursor()
        cur.execute("INSERT OR REPLACE INTO staff (id, name, role, is_active, token_version) VALUES (8888, 'Staff Regular', 'staff', 1, 0)")
        pc_cashier_code = f"PC-TEST-STAFF-{ts}"
        cur.execute("""
            INSERT INTO cashbook (code, type, category, amount, account_id, note)
            VALUES (?, 'out', 'Chi tiền', 100000, 1, 'Test')
        """, (pc_cashier_code,))
        cashier_voucher_id = cur.lastrowid
        conn.commit()
        conn.close()

        cashier_token = _make_token(8888, token_version=0)
        cashier_headers = {"Authorization": f"Bearer {cashier_token}"}
        res_forbidden_del = client.delete(f"/api/cashbook/{cashier_voucher_id}", headers=cashier_headers)
        assert res_forbidden_del.status_code == 403
        res_forbidden_edit = client.put(f"/api/cashbook/{cashier_voucher_id}", headers=cashier_headers, json={"amount": 200000})
        assert res_forbidden_edit.status_code == 403

        # Xác nhận trong DB đã xóa
        conn = get_db()
        cur = conn.cursor()
        cur.execute("SELECT 1 FROM cashbook WHERE id = ?", (voucher_id,))
        assert cur.fetchone() is None
        conn.close()
    finally:
        app.dependency_overrides.update(saved_overrides)
    conn.close()
