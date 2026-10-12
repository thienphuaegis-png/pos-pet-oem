import sys
import os
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))
import sqlite3
import datetime
import pytest
from database import get_db
from tests.conftest import is_port_open

def test_generate_cashbook_code():
    from routers.cashbook import generate_cashbook_code
    conn = get_db()
    cur = conn.cursor()
    
    code1 = generate_cashbook_code(cur, "PT-TT")
    today = datetime.datetime.now().strftime("%y%m%d")
    assert code1.startswith(f"PT-TT-{today}-"), f"Code {code1} không đúng định dạng!"
    
    code2 = generate_cashbook_code(cur, "PC-CP")
    assert code2.startswith(f"PC-CP-{today}-"), f"Code {code2} không đúng định dạng!"
    conn.close()

@pytest.mark.skipif(not is_port_open(), reason="Cần server 127.0.0.1:8999 đang chạy")
def test_payment_accounts_list_and_create():
    import urllib.request
    import json
    
    # 1. Get payment accounts
    res = urllib.request.urlopen("http://127.0.0.1:8999/api/payment-accounts")
    data = json.loads(res.read().decode())
    assert len(data) >= 3, f"Số tài khoản thanh toán phải >= 3, nhận được {len(data)}"
    
    account = data[0]
    assert "current_balance" in account, "Tài khoản thiếu trường current_balance!"
    assert "code" in account
    
    # 2. Test next-code API
    res_code = urllib.request.urlopen("http://127.0.0.1:8999/api/cashbook/next-code?prefix=PT-TT")
    data_code = json.loads(res_code.read().decode())
    assert "code" in data_code
    assert data_code["code"].startswith("PT-TT-")

    # 3. Test create manual cashbook entry
    payload = {
        "type": "in",
        "category": "Thu tiền góp vốn",
        "amount": 5000000,
        "account_id": account["id"],
        "note": "Kiểm thử tạo phiếu thu tay"
    }
    req = urllib.request.Request(
        "http://127.0.0.1:8999/api/cashbook",
        data=json.dumps(payload).encode("utf-8"),
        headers={"Content-Type": "application/json"}
    )
    res_cb = urllib.request.urlopen(req)
    cb_data = json.loads(res_cb.read().decode())
    assert cb_data["status"] == "ok"
    assert cb_data["code"].startswith("PT-TT-")

if __name__ == "__main__":
    test_generate_cashbook_code()
    test_payment_accounts_list_and_create()
    print("ALL CASHBOOK API TESTS PASSED!")
