import json
import time
import pytest
from fastapi.testclient import TestClient
from database import get_db, init_db
from server import app
from dependencies import get_current_user

init_db()


def test_batch_spa_payment_individual_cashbook_and_wallet_rules():
    client = TestClient(app)
    app.dependency_overrides[get_current_user] = lambda: {
        "id": 1,
        "name": "Admin Test",
        "role": "owner",
        "is_active": 1,
    }

    conn = get_db()
    cur = conn.cursor()
    ts = int(time.time() * 1000)

    # 1. Tạo khách hàng có số dư ví Spa 500.000 đ
    cur.execute(
        "INSERT INTO contacts (id, name, phone, type, spa_wallet_balance) VALUES (?, ?, ?, 'customer', 500000)",
        (99901, f"Khách Hàng Loạt {ts}", f"0919{ts % 1000000:06d}"),
    )
    conn.commit()
    conn.close()
    cid = 99901

    # Bé 1: Combo Vip 2 (200k, thuộc nhóm được trừ ví) + Phụ thu 50k (không trừ ví) = Tổng 250k
    t1_services = [
        {"name": "Combo Vip 2", "quantity": 1, "price": 200000, "original_price": 200000},
        {"name": "Gỡ rối", "quantity": 1, "price": 50000, "original_price": 50000, "is_surcharge": True},
    ]

    # Bé 2: Combo Vip 1 (150k, được trừ ví) + Nhuộm (100k, không trừ ví) = Tổng 250k
    t2_services = [
        {"name": "Combo Vip 1", "quantity": 1, "price": 150000, "original_price": 150000},
        {"name": "Nhuộm 1 màu", "quantity": 1, "price": 100000, "original_price": 100000, "is_dye": True},
    ]

    batch_payload = {
        "customer_id": cid,
        "remainder_method": "cash",
        "tickets": [
            {
                "customer_id": cid,
                "pet_name": "Bé 1 Combo",
                "service_type": "Combo Vip 2",
                "price": 250000,
                "surcharge": 50000,
                "payment_status": "paid",
                "payment_method": "wallet",
                "services_json": json.dumps(t1_services, ensure_ascii=False),
            },
            {
                "customer_id": cid,
                "pet_name": "Bé 2 Nhuộm",
                "service_type": "Combo Vip 1 + Nhuộm 1 màu",
                "price": 250000,
                "surcharge": 0,
                "dye_package": "Nhuộm 1 màu",
                "payment_status": "paid",
                "payment_method": "wallet",
                "services_json": json.dumps(t2_services, ensure_ascii=False),
            },
        ],
    }

    try:
        res = client.post("/api/pet-services/batch", json=batch_payload)
        assert res.status_code == 200, res.text
        data = res.json()
        assert data["count"] == 2
        t1_resp = data["tickets"][0]
        t2_resp = data["tickets"][1]
        t1_id = t1_resp["id"]
        t2_id = t2_resp["id"]

        # Bé 1: Chỉ trừ ví 200k (phần Combo Vip 2), còn 50k thu ngoài tiền mặt
        assert t1_resp["spa_wallet_deduction"] == 200000.0

        # Bé 2: Chỉ trừ ví 150k (phần Combo Vip 1), còn 100k tiền nhuộm thu ngoài tiền mặt
        assert t2_resp["spa_wallet_deduction"] == 150000.0

        # Số dư ví còn lại sau đợt: 500k - (200k + 150k) = 150k
        chk_conn = get_db()
        chk_cur = chk_conn.cursor()
        chk_cur.execute("SELECT spa_wallet_balance FROM contacts WHERE id = ?", (cid,))
        bal_now = chk_cur.fetchone()[0]
        assert bal_now == 150000.0

        # Kiểm tra Phương án 1a: Mỗi bé có 1 dòng phiếu thu riêng trong Sổ Quỹ
        chk_cur.execute("SELECT id, amount, ref_id, note FROM cashbook WHERE ref_type = 'pet_service' AND ref_id IN (?, ?)", (t1_id, t2_id))
        cb_rows = chk_cur.fetchall()
        assert len(cb_rows) == 2, f"Phải có đúng 2 dòng sổ quỹ riêng cho 2 bé, hiện có {len(cb_rows)}"
        cb_map = {r[2]: r[1] for r in cb_rows}
        assert cb_map[t1_id] == 50000.0, "Phiếu thu bé 1 phải là 50.000 đ thu ngoài"
        assert cb_map[t2_id] == 100000.0, "Phiếu thu bé 2 phải là 100.000 đ thu ngoài"
        chk_conn.close()

        # Kiểm tra tính độc lập: Xóa bé 2 -> chỉ xóa phiếu thu của bé 2 và hoàn 150k ví cho bé 2
        del_res = client.delete(f"/api/pet-services/{t2_id}")
        assert del_res.status_code == 200

        chk_conn = get_db()
        chk_cur = chk_conn.cursor()
        # Phiếu thu bé 1 vẫn còn nguyên vẹn trong sổ quỹ
        chk_cur.execute("SELECT id, amount FROM cashbook WHERE ref_type = 'pet_service' AND ref_id = ?", (t1_id,))
        cb1 = chk_cur.fetchone()
        assert cb1 is not None and cb1[1] == 50000.0

        # Phiếu thu bé 2 đã được dọn sạch
        chk_cur.execute("SELECT id FROM cashbook WHERE ref_type = 'pet_service' AND ref_id = ?", (t2_id,))
        assert chk_cur.fetchone() is None

        # Ví được hoàn lại 150k từ bé 2: 150k + 150k = 300k
        chk_cur.execute("SELECT spa_wallet_balance FROM contacts WHERE id = ?", (cid,))
        bal_after_del = chk_cur.fetchone()[0]
        assert bal_after_del == 300000.0
        chk_conn.close()

    finally:
        app.dependency_overrides.clear()
        conn = get_db()
        cur = conn.cursor()
        cur.execute("DELETE FROM cashbook WHERE contact_id = ?", (cid,))
        cur.execute("DELETE FROM spa_wallet_transactions WHERE contact_id = ?", (cid,))
        cur.execute("DELETE FROM pet_service_tickets WHERE customer_id = ?", (cid,))
        cur.execute("DELETE FROM contacts WHERE id = ?", (cid,))
        conn.commit()
        conn.close()


def test_batch_spa_payment_card_method():
    client = TestClient(app)
    app.dependency_overrides[get_current_user] = lambda: {
        "id": 1,
        "name": "Admin Test",
        "role": "owner",
        "is_active": 1,
    }

    conn = get_db()
    cur = conn.cursor()
    ts = int(time.time() * 1000)

    # Lấy hoặc tạo 1 tài khoản nhận tiền quẹt thẻ
    cur.execute("SELECT id FROM payment_accounts WHERE account_type = 'pos_card' AND is_active = 1 LIMIT 1")
    acc_row = cur.fetchone()
    if acc_row:
        acc_id = acc_row[0]
    else:
        cur.execute("INSERT INTO payment_accounts (code, name, account_type, is_active) VALUES ('POS-TEST', 'Máy POS Test', 'pos_card', 1)")
        acc_id = cur.lastrowid

    cur.execute(
        "INSERT INTO contacts (id, name, phone, type) VALUES (?, ?, ?, 'customer')",
        (99902, f"Khách Thẻ {ts}", f"0918{ts % 1000000:06d}"),
    )
    cid = 99902
    conn.commit()
    conn.close()

    batch_payload = {
        "customer_id": cid,
        "account_id": acc_id,
        "tickets": [
            {
                "customer_id": cid,
                "pet_name": "Bé Quẹt Thẻ 1",
                "service_type": "Combo Vip 1",
                "price": 150000,
                "payment_status": "paid",
                "payment_method": "card",
                "account_id": acc_id,
            },
            {
                "customer_id": cid,
                "pet_name": "Bé Quẹt Thẻ 2",
                "service_type": "Combo Vip 2",
                "price": 200000,
                "payment_status": "paid",
                "payment_method": "card",
                "account_id": acc_id,
            }
        ]
    }

    try:
        res = client.post("/api/pet-services/batch", json=batch_payload)
        assert res.status_code == 200, res.text
        data = res.json()
        assert data["count"] == 2
        t1_id = data["tickets"][0]["id"]
        t2_id = data["tickets"][1]["id"]

        chk_conn = get_db()
        chk_cur = chk_conn.cursor()
        chk_cur.execute("SELECT id, amount, account_id FROM cashbook WHERE ref_type = 'pet_service' AND ref_id IN (?, ?)", (t1_id, t2_id))
        cb_rows = chk_cur.fetchall()
        assert len(cb_rows) == 2
        for r in cb_rows:
            assert r[2] == acc_id, "Tài khoản nhận tiền sổ quỹ phải là tài khoản máy quẹt thẻ đã chọn"
        chk_conn.close()

    finally:
        app.dependency_overrides.clear()
        conn = get_db()
        cur = conn.cursor()
        cur.execute("DELETE FROM cashbook WHERE contact_id = ?", (cid,))
        cur.execute("DELETE FROM pet_service_tickets WHERE customer_id = ?", (cid,))
        cur.execute("DELETE FROM contacts WHERE id = ?", (cid,))
        conn.commit()
        conn.close()

