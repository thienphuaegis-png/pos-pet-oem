import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

import pytest
from fastapi.testclient import TestClient
from database import init_db, get_db
from server import app
from dependencies import get_current_user

init_db()

# Bypass auth in fixture instead of module level
client = TestClient(app)

@pytest.fixture(scope="module", autouse=True)
def cleanup():
    app.dependency_overrides[get_current_user] = lambda: {"id": 1, "name": "Admin", "role": "owner", "is_active": 1}
    def do_clean():
        db = get_db()
        try:
            cur = db.cursor()
            # Clean orders created by test contacts
            cur.execute("SELECT id FROM orders WHERE customer_id IN (SELECT id FROM contacts WHERE phone LIKE 'TEST_TOPUP_%')")
            order_ids = [r[0] for r in cur.fetchall()]
            for oid in order_ids:
                cur.execute("DELETE FROM order_payments WHERE order_id = ?", (oid,))
                cur.execute("DELETE FROM order_items WHERE order_id = ?", (oid,))
                cur.execute("DELETE FROM inventory_logs WHERE order_id = ?", (oid,))
                cur.execute("DELETE FROM cashbook WHERE ref_type = 'order' AND ref_id = ?", (oid,))
                cur.execute("DELETE FROM spa_wallet_transactions WHERE order_id = ?", (oid,))
                cur.execute("DELETE FROM orders WHERE id = ?", (oid,))
            
            # Clean wallet transactions
            cur.execute("DELETE FROM spa_wallet_transactions WHERE contact_id IN (SELECT id FROM contacts WHERE phone LIKE 'TEST_TOPUP_%')")
            # Clean cashbook for topup
            cur.execute("DELETE FROM cashbook WHERE ref_type = 'topup' AND contact_id IN (SELECT id FROM contacts WHERE phone LIKE 'TEST_TOPUP_%')")
            # Clean contacts
            cur.execute("DELETE FROM contacts WHERE phone LIKE 'TEST_TOPUP_%'")
            # Clean test packages
            cur.execute("DELETE FROM topup_packages WHERE name LIKE 'TEST_PKG_%'")
            # Clean products
            cur.execute("DELETE FROM product_inventory WHERE product_id IN (SELECT id FROM products WHERE code LIKE 'TEST_TOPUP_PROD_%')")
            cur.execute("DELETE FROM products WHERE code LIKE 'TEST_TOPUP_PROD_%'")
            db.commit()
        finally:
            db.close()

    do_clean()
    yield
    app.dependency_overrides.pop(get_current_user, None)
    do_clean()

def test_topup_packages_crud():
    # 1. Create package
    create_payload = {
        "name": "TEST_PKG_500K",
        "pay_amount": 500000,
        "receive_amount": 700000,
        "is_active": 1
    }
    res_c = client.post("/api/topup/packages", json=create_payload)
    assert res_c.status_code == 200, res_c.text
    pkg = res_c.json()
    pkg_id = pkg["id"]
    assert pkg["name"] == "TEST_PKG_500K"
    assert pkg["pay_amount"] == 500000
    assert pkg["receive_amount"] == 700000

    # 2. List packages
    res_l = client.get("/api/topup/packages")
    assert res_l.status_code == 200
    pkgs = res_l.json()
    assert any(p["id"] == pkg_id for p in pkgs)

    # 3. Update package
    update_payload = {
        "name": "TEST_PKG_500K_UPDATED",
        "receive_amount": 750000
    }
    res_u = client.put(f"/api/topup/packages/{pkg_id}", json=update_payload)
    assert res_u.status_code == 200
    pkg_updated = res_u.json()
    assert pkg_updated["name"] == "TEST_PKG_500K_UPDATED"
    assert pkg_updated["receive_amount"] == 750000
    assert pkg_updated["pay_amount"] == 500000

    # 4. Delete package
    res_d = client.delete(f"/api/topup/packages/{pkg_id}")
    assert res_d.status_code == 200
    assert res_d.json()["status"] == "ok"

    # Verify not in active list
    res_l2 = client.get("/api/topup/packages")
    assert not any(p["id"] == pkg_id for p in res_l2.json())


def test_recharge_and_ordering():
    db = get_db()
    cur = db.cursor()

    # 1. Create a topup package: Pay 500k -> gets 700k
    cur.execute("""
        INSERT INTO topup_packages (name, pay_amount, receive_amount, is_active)
        VALUES ('TEST_PKG_RECHARGE', 500000, 700000, 1)
    """)
    pkg_id = cur.lastrowid

    # 2. Create customer: spa_wallet_balance = 0
    cur.execute("""
        INSERT INTO contacts (name, phone, type, spa_wallet_balance)
        VALUES ('Khách Nạp Ví Test', 'TEST_TOPUP_001', 'customer', 0)
    """)
    cust_id = cur.lastrowid

    # 3. Create products: 1 service, 1 product
    cur.execute("""
        INSERT INTO products (code, name, type, sell_price, cost_price, stock, unit)
        VALUES ('TEST_TOPUP_PROD_SVC', 'Tắm Vệ Sinh Spa Chó', 'service', 400000, 0, 999, 'lần')
    """)
    svc_id = cur.lastrowid

    cur.execute("""
        INSERT INTO products (code, name, type, sell_price, cost_price, stock, unit)
        VALUES ('TEST_TOPUP_PROD_RETAIL', 'Pate Chó Mèo', 'product', 300000, 150000, 100, 'hộp')
    """)
    prod_id = cur.lastrowid

    cur.execute("SELECT id FROM staff LIMIT 1")
    staff_id = cur.fetchone()[0]

    db.commit()
    db.close()

    # --- RECHARGE SPA WALLET ---
    recharge_payload = {
        "contact_id": cust_id,
        "package_id": pkg_id,
        "payment_method": "cash",
        "note": "Khách nạp gói spa test 500k"
    }
    res_rec = client.post("/api/topup/recharge", json=recharge_payload)
    assert res_rec.status_code == 200, res_rec.text
    rec_data = res_rec.json()
    assert rec_data["balance_before"] == 0
    assert rec_data["balance_after"] == 700000
    assert rec_data["spa_wallet_balance"] == 700000

    # Verify history endpoint
    res_h = client.get(f"/api/topup/history/{cust_id}")
    assert res_h.status_code == 200
    history = res_h.json()
    assert len(history) == 1
    assert history[0]["type"] == "topup"
    assert history[0]["amount"] == 700000

    # Verify cashbook entry was recorded for 500,000 pay_amount
    db = get_db()
    cur = db.cursor()
    cur.execute("SELECT * FROM cashbook WHERE ref_type = 'topup' AND contact_id = ?", (cust_id,))
    cb_row = cur.fetchone()
    assert cb_row is not None
    assert cb_row["amount"] == 500000
    db.close()

    # --- CASE 1: Order has 400k Service + 300k Product. Customer has 700k wallet. ---
    # Rule: Wallet ONLY deducts 400k (service item). Customer must still pay 300k Product.
    # Wallet balance remains 300k.
    order1_payload = {
        "customer_id": cust_id,
        "staff_id": staff_id,
        "discount": 0,
        "paid_amount": 300000, # Customer pays the remaining 300k for product
        "use_spa_wallet": True,
        "items": [
            {"product_id": svc_id, "quantity": 1, "price": 400000},
            {"product_id": prod_id, "quantity": 1, "price": 300000}
        ]
    }
    res_o1 = client.post("/api/orders", json=order1_payload)
    assert res_o1.status_code == 200, res_o1.text
    data_o1 = res_o1.json()
    assert data_o1["spa_wallet_deduction"] == 400000
    assert data_o1["final_amount"] == 300000

    # Verify contact balance in DB is now 700k - 400k = 300k
    db = get_db()
    cur = db.cursor()
    cur.execute("SELECT spa_wallet_balance FROM contacts WHERE id = ?", (cust_id,))
    c_bal1 = cur.fetchone()["spa_wallet_balance"]
    assert c_bal1 == 300000

    # Verify order spa_wallet_deduction column in DB
    cur.execute("SELECT spa_wallet_deduction, final_amount, paid_amount, debt_amount FROM orders WHERE code = ?", (data_o1["order_code"],))
    order_db = cur.fetchone()
    assert order_db["spa_wallet_deduction"] == 400000
    assert order_db["final_amount"] == 300000
    assert order_db["paid_amount"] == 300000
    assert order_db["debt_amount"] == 0

    # Verify spend transaction recorded
    cur.execute("SELECT * FROM spa_wallet_transactions WHERE contact_id = ? AND type = 'spend' ORDER BY id DESC LIMIT 1", (cust_id,))
    spend_tx = cur.fetchone()
    assert spend_tx is not None
    assert spend_tx["amount"] == 400000
    assert spend_tx["balance_before"] == 700000
    assert spend_tx["balance_after"] == 300000
    db.close()

    # --- CASE 2: Order has 800k Service + 0 Product. Customer has 300k wallet. ---
    # Rule: Wallet deducts 300k. Customer pays remaining 500k by cash/transfer.
    # Wallet balance becomes 0.
    order2_payload = {
        "customer_id": cust_id,
        "staff_id": staff_id,
        "discount": 0,
        "paid_amount": 500000, # Customer pays remaining 500k
        "use_spa_wallet": True,
        "items": [
            {"product_id": svc_id, "quantity": 2, "price": 400000} # 2 x 400k = 800k
        ]
    }
    res_o2 = client.post("/api/orders", json=order2_payload)
    assert res_o2.status_code == 200, res_o2.text
    data_o2 = res_o2.json()
    assert data_o2["spa_wallet_deduction"] == 300000
    assert data_o2["final_amount"] == 500000

    # Verify contact balance in DB is now 0
    db = get_db()
    cur = db.cursor()
    cur.execute("SELECT spa_wallet_balance FROM contacts WHERE id = ?", (cust_id,))
    c_bal2 = cur.fetchone()["spa_wallet_balance"]
    assert c_bal2 == 0

    cur.execute("SELECT spa_wallet_deduction, final_amount, paid_amount, debt_amount FROM orders WHERE code = ?", (data_o2["order_code"],))
    order2_db = cur.fetchone()
    assert order2_db["spa_wallet_deduction"] == 300000
    assert order2_db["final_amount"] == 500000
    assert order2_db["paid_amount"] == 500000
    assert order2_db["debt_amount"] == 0

    # Check history endpoint again
    res_h2 = client.get(f"/api/topup/history/{cust_id}")
    assert res_h2.status_code == 200
    all_history = res_h2.json()
    assert len(all_history) == 3 # 1 topup, 2 spends
    types = [h["type"] for h in all_history]
    assert types.count("spend") == 2
    assert types.count("topup") == 1
    db.close()


def test_recharge_spa_wallet_with_bank_transfer_account():
    db = get_db()
    cur = db.cursor()
    # 1. Create test contact & package
    cur.execute("INSERT INTO contacts (name, phone, type, spa_wallet_balance) VALUES ('Khách Test CK', 'TEST_TOPUP_BANK_001', 'customer', 0)")
    cust_id = cur.lastrowid

    cur.execute("INSERT INTO topup_packages (name, pay_amount, receive_amount, is_active) VALUES ('TEST_PKG_BANK_1M', 1000000, 1500000, 1)")
    pkg_id = cur.lastrowid

    # Get a bank account
    cur.execute("SELECT id FROM payment_accounts WHERE account_type = 'bank' AND is_active = 1 LIMIT 1")
    bank_row = cur.fetchone()
    assert bank_row is not None, "Cần có ít nhất 1 tài khoản ngân hàng active"
    bank_acc_id = bank_row["id"]

    # Get default cash account
    cur.execute("SELECT id FROM payment_accounts WHERE is_default = 1 AND is_active = 1 LIMIT 1")
    default_cash_row = cur.fetchone()
    default_cash_acc_id = default_cash_row["id"] if default_cash_row else None

    db.commit()
    db.close()

    # Case A: Recharge with explicit bank account_id and payment_method='transfer'
    payload_a = {
        "contact_id": cust_id,
        "package_id": pkg_id,
        "payment_method": "transfer",
        "account_id": bank_acc_id,
        "note": "Khách chuyển khoản nạp ví"
    }
    res_a = client.post("/api/topup/recharge", json=payload_a)
    assert res_a.status_code == 200, res_a.text
    data_a = res_a.json()
    assert data_a["balance_after"] == 1500000

    db = get_db()
    cur = db.cursor()
    cur.execute("SELECT * FROM cashbook WHERE ref_type = 'topup' AND ref_id = ?", (data_a["transaction_id"],))
    cb_a = cur.fetchone()
    assert cb_a is not None
    assert cb_a["account_id"] == bank_acc_id
    assert cb_a["account_id"] != default_cash_acc_id
    assert "chuyển khoản" in cb_a["note"].lower() or "transfer" in cb_a["note"].lower()

    # Case B: chuyển khoản mà KHÔNG chọn tài khoản -> bị từ chối (không tự rơi vào tài khoản mặc định)
    payload_b = {
        "contact_id": cust_id,
        "package_id": pkg_id,
        "payment_method": "transfer",
        "note": "Khách CK không chỉ định tài khoản"
    }
    res_b = client.post("/api/topup/recharge", json=payload_b)
    assert res_b.status_code == 400, res_b.text
    assert "tài khoản nhận tiền" in res_b.json()["detail"].lower()

    # Case C: chuyển khoản mà chọn nhầm KÉT TIỀN MẶT -> bị từ chối
    res_c = client.post("/api/topup/recharge", json={**payload_b, "account_id": default_cash_acc_id})
    assert res_c.status_code == 400, res_c.text

    db.close()

