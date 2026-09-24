import pytest
import os
import sys

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from fastapi.testclient import TestClient
from server import app
from database import get_db

client = TestClient(app)

def test_api_contact_detail_wallet_tracking():
    # 1. Tạo customer test
    conn = get_db()
    cur = conn.cursor()
    cur.execute("INSERT INTO contacts (type, name, phone, points, spa_wallet_balance, debt) VALUES ('customer', 'Test Spa Cust', '0999888777', 150, 500000, 0)")
    cust_id = cur.lastrowid

    # 2. Tạo giao dịch ví mẫu trong spa_wallet_transactions
    cur.execute("""
        INSERT INTO spa_wallet_transactions (contact_id, type, amount, balance_before, balance_after, note)
        VALUES (?, 'topup', 500000, 0, 500000, 'Nạp ví trải nghiệm')
    """, (cust_id,))
    cur.execute("""
        INSERT INTO spa_wallet_transactions (contact_id, type, amount, balance_before, balance_after, note)
        VALUES (?, 'spend', 100000, 500000, 400000, 'Chi tiêu tắm spa bill test')
    """, (cust_id,))
    conn.commit()
    conn.close()

    # 3. Test GET /api/contacts/{id}
    res = client.get(f"/api/contacts/{cust_id}")
    assert res.status_code == 200, res.text
    data = res.json()
    assert data["name"] == "Test Spa Cust"
    assert "spa_wallet_balance" in data
    assert "points" in data
    assert "spa_wallet_history" in data
    assert len(data["spa_wallet_history"]) >= 2
    # Verify transaction details
    types = [t["type"] for t in data["spa_wallet_history"]]
    assert "topup" in types
    assert "spend" in types

    # 4. Test GET /api/topup/history/{contact_id}
    res_topup = client.get(f"/api/topup/history/{cust_id}")
    assert res_topup.status_code == 200, res_topup.text
    topup_data = res_topup.json()
    assert len(topup_data) >= 2


def test_html_and_js_elements_presence():
    with open("templates/index.html", "r", encoding="utf-8") as f:
        html = f.read()

    # POS elements
    assert 'id="modal-pos-wallet-history"' in html
    assert 'id="pos-wallet-hist-cust-name"' in html
    assert 'id="pos-wallet-hist-current-balance"' in html
    assert 'id="pos-wallet-hist-table-body"' in html
    assert 'showPosWalletHistory()' in html

    # Contact detail modal elements
    assert 'id="detail-contact-spa-wallet"' in html
    assert 'id="detail-contact-points"' in html
    assert 'id="detail-contact-spa-wallet-history"' in html

    # Contacts list table header
    assert 'Ví Spa' in html

    with open("static/js/pos.js", "r", encoding="utf-8") as f:
        pos_js = f.read()
    assert "function showPosWalletHistory" in pos_js
    assert "function closePosWalletHistory" in pos_js
    assert "window.showPosWalletHistory" in pos_js

    with open("static/js/app.js", "r", encoding="utf-8") as f:
        app_js = f.read()
    assert "detail-contact-spa-wallet" in app_js
    assert "detail-contact-spa-wallet-history" in app_js
