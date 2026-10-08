import pytest
from starlette.testclient import TestClient
from server import app
from database import get_db, init_db
from routers.auth import _make_token

client = TestClient(app)

def test_cashbook_transfer_flow():
    init_db()
    conn = get_db()
    cur = conn.cursor()
    # Tạo 2 tài khoản thanh toán
    cur.execute("INSERT OR IGNORE INTO payment_accounts (id, code, name, account_type, is_active) VALUES (10, 'TM-QUAY', 'Két tiền mặt tại quầy', 'cash', 1)")
    cur.execute("INSERT OR IGNORE INTO payment_accounts (id, code, name, account_type, is_active) VALUES (11, 'MB-BANK', 'Ngân hàng MB Bank', 'bank', 1)")

    # Tạo staff
    cur.execute("INSERT OR REPLACE INTO staff (id, name, role, is_active, token_version) VALUES (9999, 'Admin Test', 'owner', 1, 0)")
    conn.commit()
    conn.close()

    token = _make_token(9999, token_version=0)
    headers = {"Authorization": f"Bearer {token}"}

    # 1. Chuyển tiền cùng 1 tài khoản -> phải lỗi 400
    res_same = client.post("/api/cashbook/transfer", headers=headers, json={
        "from_account_id": 10,
        "to_account_id": 10,
        "amount": 1000000
    })
    assert res_same.status_code == 400
    assert "không được trùng" in res_same.json()["detail"]

    # 2. Số tiền <= 0 -> lỗi 400
    res_zero = client.post("/api/cashbook/transfer", headers=headers, json={
        "from_account_id": 11,
        "to_account_id": 10,
        "amount": 0
    })
    assert res_zero.status_code == 400

    # 3. Chuyển hợp lệ: rút 5.000.000đ từ MB Bank (11) về Két tiền mặt (10)
    res_valid = client.post("/api/cashbook/transfer", headers=headers, json={
        "from_account_id": 11,
        "to_account_id": 10,
        "amount": 5000000,
        "note": "Rút tiền về quầy thối"
    })
    assert res_valid.status_code == 200, res_valid.text
    data = res_valid.json()
    assert data["success"] is True
    assert "transfer_code" in data
    assert data["out_voucher"]["code"].startswith("PC-CK-")
    assert data["in_voucher"]["code"].startswith("PT-CK-")

    # Kiểm tra database đã có đúng 2 phiếu đối ứng
    conn = get_db()
    cur = conn.cursor()
    cur.execute("SELECT code, type, amount, account_id, note, ref_type FROM cashbook WHERE id IN (?, ?)",
                (data["out_voucher"]["id"], data["in_voucher"]["id"]))
    rows = [dict(r) for r in cur.fetchall()]
    conn.close()

    assert len(rows) == 2
    out_row = next(r for r in rows if r["type"] == "out")
    in_row = next(r for r in rows if r["type"] == "in")

    assert out_row["account_id"] == 11
    assert out_row["amount"] == 5000000
    assert out_row["ref_type"] == "fund_transfer"
    assert "Két tiền mặt" in out_row["note"]

    assert in_row["account_id"] == 10
    assert in_row["amount"] == 5000000
    assert in_row["ref_type"] == "fund_transfer"
    assert "MB Bank" in in_row["note"]

def test_cashbook_transfer_dom_and_js():
    from pathlib import Path
    html_path = Path("templates/index.html")
    assert html_path.exists()
    content = html_path.read_text(encoding="utf-8")

    # Kiểm tra các phần tử DOM của modal lập phiếu thu/chi/chuyển quỹ
    assert 'id="btn-cash-type-transfer"' in content
    assert 'id="cash-transfer-accounts-box"' in content
    assert 'id="cash-transfer-from-select"' in content
    assert 'id="cash-transfer-to-select"' in content
    assert 'id="cash-amount-words"' in content
    assert 'handleCashAmountInput(this)' in content
    assert 'quickAddCashAmount' in content
    assert 'swapTransferAccounts()' in content

    # Kiểm tra module JS
    js_path = Path("static/js/modules/productions.js")
    assert js_path.exists()
    js_content = js_path.read_text(encoding="utf-8")
    assert 'function numberToVietnameseWords' in js_content
    assert 'window.handleCashAmountInput' in js_content
    assert 'window.quickAddCashAmount' in js_content
    assert 'window.swapTransferAccounts' in js_content
    assert '/api/cashbook/transfer' in js_content

