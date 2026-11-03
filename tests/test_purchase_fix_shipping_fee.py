from starlette.testclient import TestClient
from server import app
from database import get_db
from dependencies import get_current_user

client = TestClient(app)


def _seed(cur, status="received"):
    cur.execute("INSERT OR REPLACE INTO contacts (id, name, type, debt) VALUES (9012000, 'NCC Ship Test', 'supplier', 1000000)")
    cur.execute("""INSERT OR REPLACE INTO purchases (id, code, supplier_id, warehouse_id, subtotal_amount, shipping_fee, total_amount, paid_amount, debt_amount, status, fund_source)
                   VALUES (9012001, 'PN-TEST-SHIP', 9012000, 1, 1000000, 0, 1000000, 0, 1000000, ?, 'PERSONAL')""", (status,))


def test_admin_fix_shipping_fee_updates_total_and_supplier_debt():
    saved = dict(app.dependency_overrides)
    try:
        conn = get_db(); cur = conn.cursor(); _seed(cur); conn.commit()

        # Nhân viên thường bị chặn
        app.dependency_overrides[get_current_user] = lambda: {"id": 2, "name": "NV", "role": "warehouse"}
        assert client.put("/api/purchases/PN-TEST-SHIP/shipping-fee", json={"shipping_fee": 50000}).status_code == 403

        app.dependency_overrides[get_current_user] = lambda: {"id": 1, "name": "Admin", "role": "admin"}
        r = client.put("/api/purchases/PN-TEST-SHIP/shipping-fee", json={"shipping_fee": 50000})
        assert r.status_code == 200, r.text
        assert r.json()["total_amount"] == 1050000 and r.json()["debt_amount"] == 1050000

        # Sửa lại lần 2 (giảm): chỉ trừ chênh lệch, không cộng dồn
        r = client.put("/api/purchases/PN-TEST-SHIP/shipping-fee", json={"shipping_fee": 30000})
        assert r.json()["total_amount"] == 1030000

        cur.execute("SELECT debt FROM contacts WHERE id = 9012000")
        assert cur.fetchone()[0] == 1030000
        cur.execute("SELECT note FROM purchases WHERE id = 9012001")
        assert "50,000 → 30,000" in cur.fetchone()[0]

        assert client.put("/api/purchases/PN-TEST-SHIP/shipping-fee", json={"shipping_fee": -1}).status_code == 400

        # Phiếu chưa nhập kho: từ chối (dùng Sửa đơn)
        _seed(cur, "pending"); conn.commit()
        assert client.put("/api/purchases/PN-TEST-SHIP/shipping-fee", json={"shipping_fee": 1}).status_code == 400
    finally:
        cur.execute("DELETE FROM purchases WHERE id = 9012001"); cur.execute("DELETE FROM contacts WHERE id = 9012000")
        conn.commit(); conn.close()
        app.dependency_overrides.clear(); app.dependency_overrides.update(saved)
