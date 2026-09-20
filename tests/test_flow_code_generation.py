import sys
import os
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))
import sqlite3
import datetime
import urllib.request
import json
from database import get_db

def test_pos_order_creates_pt_bh():
    conn = get_db()
    cur = conn.cursor()
    cur.execute("SELECT id FROM staff LIMIT 1")
    staff_id = cur.fetchone()["id"]
    cur.execute("SELECT id FROM contacts WHERE type = 'customer' LIMIT 1")
    customer_id = cur.fetchone()["id"]
    cur.execute("SELECT id FROM products LIMIT 1")
    product_id = cur.fetchone()["id"]
    conn.close()

    # 1. Tạo đơn hàng POS và kiểm tra mã thu sinh ra
    payload = {
        "customer_id": customer_id,
        "staff_id": staff_id,
        "paid_amount": 50000,
        "discount": 0,
        "note": "Test đơn hàng sinh mã PT-BH",
        "items": [
            {
                "product_id": product_id,
                "quantity": 1,
                "price": 50000,
                "unit": "cái",
                "item_type": "product"
            }
        ]
    }
    req = urllib.request.Request(
        "http://127.0.0.1:8999/api/orders",
        data=json.dumps(payload).encode("utf-8"),
        headers={"Content-Type": "application/json"}
    )
    res = urllib.request.urlopen(req)
    data = json.loads(res.read().decode())
    assert data["status"] == "ok"
    order_code = data["order_code"]
    
    # Kiểm tra cashbook xem có bản ghi PT-BH- không
    conn = get_db()
    cur = conn.cursor()
    cur.execute("SELECT code, type, category FROM cashbook WHERE note LIKE ? ORDER BY id DESC LIMIT 1", (f"%{order_code}%",))
    cb = cur.fetchone()
    assert cb is not None, f"Không tìm thấy phiếu thu cho đơn {order_code}"
    assert cb["code"].startswith("PT-BH-"), f"Mã phiếu thu {cb['code']} không bắt đầu bằng PT-BH-!"
    conn.close()

def test_contact_pay_debt_creates_pt_cn_or_pc_nh():
    conn = get_db()
    cur = conn.cursor()
    # Tìm 1 khách hàng
    cur.execute("SELECT id FROM contacts WHERE type = 'customer' LIMIT 1")
    c_id = cur.fetchone()[0]
    conn.close()
    
    payload = {
        "amount": 10000,
        "note": "Thu nợ test sinh mã PT-CN"
    }
    req = urllib.request.Request(
        f"http://127.0.0.1:8999/api/contacts/{c_id}/pay-debt",
        data=json.dumps(payload).encode("utf-8"),
        headers={"Content-Type": "application/json"}
    )
    res = urllib.request.urlopen(req)
    assert res.status == 200
    
    conn = get_db()
    cur = conn.cursor()
    cur.execute("SELECT code FROM cashbook WHERE note LIKE '%Thu nợ test sinh mã PT-CN%' ORDER BY id DESC LIMIT 1")
    cb = cur.fetchone()
    assert cb is not None
    assert cb["code"].startswith("PT-CN-"), f"Mã phiếu {cb['code']} không bắt đầu bằng PT-CN-!"
    conn.close()

if __name__ == "__main__":
    test_pos_order_creates_pt_bh()
    test_contact_pay_debt_creates_pt_cn_or_pc_nh()
    print("ALL CODE GENERATION FLOW TESTS PASSED!")
