import pytest
from fastapi.testclient import TestClient
from server import app
from database import get_db

import sys, os
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
sys.path.insert(0, os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "tests"))
from auth_helpers import owner_auth_headers

client = TestClient(app, headers=owner_auth_headers())

def test_batch_approve_expense_requests_success():
    conn = get_db()
    cur = conn.cursor()
    # 1. Đảm bảo có tài khoản thanh toán
    cur.execute("INSERT OR REPLACE INTO payment_accounts (id, code, name, account_type, is_active, is_default) VALUES (99901, 'ACC-TEST-BATCH', 'Tài Khoản Test Chi Gộp', 'bank', 1, 1)")
    
    # 2. Tạo 2 yêu cầu chi hộ pending cho cùng nhân viên
    cur.execute("DELETE FROM expense_requests WHERE code IN ('YC-TEST-BATCH-01', 'YC-TEST-BATCH-02')")
    cur.execute("""
        INSERT INTO expense_requests (code, type, employee_name, amount, category, note, status)
        VALUES ('YC-TEST-BATCH-01', 'reimbursement', 'Quế Đôn Test', 60000, 'Chi tiền ship', 'Ship 2 đơn khách lẻ', 'pending')
    """)
    id1 = cur.lastrowid

    cur.execute("""
        INSERT INTO expense_requests (code, type, employee_name, amount, category, note, status)
        VALUES ('YC-TEST-BATCH-02', 'reimbursement', 'Quế Đôn Test', 40000, 'Chi văn phòng phẩm', 'Mua giấy in', 'pending')
    """)
    id2 = cur.lastrowid
    conn.commit()
    conn.close()

    # 3. Gọi API batch-approve
    res = client.post("/api/expense-requests/batch-approve", json={
        "request_ids": [id1, id2],
        "account_id": 99901,
        "note": "Hoàn ứng đợt 1 cho Quế Đôn"
    })
    assert res.status_code == 200, res.text
    data = res.json()
    assert data["success"] is True
    assert data["approved_count"] == 2
    assert data["total_amount"] == 100000.0
    assert "cashbook_code" in data
    assert data["cashbook_code"].startswith("PC-")

    # 4. Kiểm tra trong DB: Chỉ sinh đúng 1 phiếu chi cashbook tổng 100k
    conn = get_db()
    cur = conn.cursor()
    cur.execute("SELECT * FROM cashbook WHERE id = ?", (data["cashbook_id"],))
    cb = dict(cur.fetchone())
    assert cb["amount"] == 100000.0
    assert cb["account_id"] == 99901
    assert "YC-TEST-BATCH-01" in cb["note"] or "Quế Đôn" in cb["note"]

    # 5. Kiểm tra 2 yêu cầu chi đều completed và link tới cùng cashbook_id
    cur.execute("SELECT status, cashbook_id FROM expense_requests WHERE id IN (?, ?)", (id1, id2))
    rows = cur.fetchall()
    assert len(rows) == 2
    for r in rows:
        assert r[0] == "completed"
        assert r[1] == data["cashbook_id"]

    conn.close()

def test_batch_approve_validation_empty_or_non_pending():
    # Rỗng
    res = client.post("/api/expense-requests/batch-approve", json={
        "request_ids": [],
        "account_id": 99901
    })
    assert res.status_code == 400
    assert "chọn ít nhất 1" in res.text.lower()
