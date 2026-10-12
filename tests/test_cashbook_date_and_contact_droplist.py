import pytest
from starlette.testclient import TestClient
from server import app
from database import get_db, init_db
from routers.auth import _make_token

client = TestClient(app)

def test_cashbook_custom_date_and_transfer_date():
    init_db()
    conn = get_db()
    cur = conn.cursor()
    # Tạo accounts
    cur.execute("INSERT OR REPLACE INTO payment_accounts (id, code, name, account_type, is_active) VALUES (20, 'TK-TEST-1', 'TK Test 1', 'cash', 1)")
    cur.execute("INSERT OR REPLACE INTO payment_accounts (id, code, name, account_type, is_active) VALUES (21, 'TK-TEST-2', 'TK Test 2', 'bank', 1)")
    # Tạo contact
    cur.execute("INSERT OR REPLACE INTO contacts (id, type, name, phone, debt) VALUES (9001, 'supplier', 'NCC Test Droplist', '0988776655', 0)")
    # Tạo staff
    cur.execute("INSERT OR REPLACE INTO staff (id, name, role, is_active, token_version) VALUES (9999, 'Admin Test', 'owner', 1, 0)")
    conn.commit()
    conn.close()

    token = _make_token(9999, token_version=0)
    headers = {"Authorization": f"Bearer {token}"}

    # 1. Tạo phiếu chi với ngày lùi (Chủ nhật 2026-10-11)
    res_out = client.post("/api/cashbook", headers=headers, json={
        "type": "out",
        "category": "Chi tiền nhập hàng",
        "amount": 2500000,
        "account_id": 20,
        "contact_id": 9001,
        "created_at": "2026-10-11",
        "note": "Chi tiền chủ nhật"
    })
    assert res_out.status_code == 200, res_out.text
    out_code = res_out.json()["code"]

    conn = get_db()
    cur = conn.cursor()
    cur.execute("SELECT created_at, contact_id FROM cashbook WHERE code = ?", (out_code,))
    row_out = cur.fetchone()
    assert "2026-10-11" in row_out["created_at"]
    assert row_out["contact_id"] == 9001

    # 2. Tạo phiếu thu với ngày lùi (2026-10-10)
    res_in = client.post("/api/cashbook", headers=headers, json={
        "type": "in",
        "category": "Thu khác",
        "amount": 1500000,
        "account_id": 21,
        "contact_id": 9001,
        "created_at": "2026-10-10",
        "note": "Thu tiền thứ bảy"
    })
    assert res_in.status_code == 200, res_in.text
    in_code = res_in.json()["code"]

    cur.execute("SELECT created_at FROM cashbook WHERE code = ?", (in_code,))
    row_in = cur.fetchone()
    assert "2026-10-10" in row_in["created_at"]

    # 3. Chuyển quỹ với ngày lùi (2026-10-09)
    res_trans = client.post("/api/cashbook/transfer", headers=headers, json={
        "from_account_id": 20,
        "to_account_id": 21,
        "amount": 500000,
        "created_at": "2026-10-09",
        "note": "Chuyển tiền thứ sáu"
    })
    assert res_trans.status_code == 200, res_trans.text
    trans_data = res_trans.json()
    assert "261009" in trans_data["transfer_code"]

    cur.execute("SELECT created_at FROM cashbook WHERE id = ?", (trans_data["out_voucher"]["id"],))
    row_t_out = cur.fetchone()
    assert "2026-10-09" in row_t_out["created_at"]

    cur.execute("SELECT created_at FROM cashbook WHERE id = ?", (trans_data["in_voucher"]["id"],))
    row_t_in = cur.fetchone()
    assert "2026-10-09" in row_t_in["created_at"]
    conn.close()

def test_cashbook_contact_droplist_dom():
    from pathlib import Path
    html_content = Path("templates/index.html").read_text(encoding="utf-8")
    assert 'id="cash-contact-search-input"' in html_content
    assert 'id="cash-contact-dropdown-menu"' in html_content
    assert 'id="cash-contact-clear-btn"' in html_content
    assert 'id="cash-contact-selected-badge"' in html_content
    assert 'id="cash-date-input"' in html_content
    assert 'id="cash-date-label"' in html_content
    assert 'id="cash-contact-select"' in html_content

    js_content = Path("static/js/modules/productions.js").read_text(encoding="utf-8")
    assert 'showCashContactDropdown' in js_content
    assert 'filterCashContactDropdown' in js_content
    assert 'selectCashContact' in js_content
    assert 'clearCashContactSelection' in js_content
