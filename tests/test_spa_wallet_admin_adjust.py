"""Owner/Admin chỉnh số dư ví Spa: đặt số dư mới, bắt buộc lý do, ghi lịch sử 'adjust', không ghi sổ quỹ."""
from fastapi.testclient import TestClient
from server import app
from database import get_db
from dependencies import get_current_user

client = TestClient(app)
PHONE = "0977000111"


def _setup():
    db = get_db()
    cur = db.cursor()
    cur.execute("DELETE FROM contacts WHERE phone = ?", (PHONE,))
    cur.execute("INSERT INTO contacts (type, name, phone, spa_wallet_balance) VALUES ('customer', 'TEST Ví Adjust', ?, 500000)", (PHONE,))
    cid = cur.lastrowid
    db.commit()
    db.close()
    return cid


def _cleanup(cid):
    db = get_db()
    db.execute("DELETE FROM spa_wallet_transactions WHERE contact_id = ?", (cid,))
    db.execute("DELETE FROM contacts WHERE id = ?", (cid,))
    db.commit()
    db.close()


def test_admin_adjust_spa_wallet():
    cid = _setup()
    try:
        app.dependency_overrides[get_current_user] = lambda: {"id": 1, "name": "Quản Lý", "role": "admin", "is_active": 1}
        assert client.put(f"/api/topup/adjust/{cid}", json={"new_balance": 300000, "reason": " "}).status_code == 400
        assert client.put(f"/api/topup/adjust/{cid}", json={"new_balance": -1, "reason": "x"}).status_code == 400

        r = client.put(f"/api/topup/adjust/{cid}", json={"new_balance": 300000, "reason": "Nhập sai gói"})
        assert r.status_code == 200, r.text
        assert r.json()["balance_after"] == 300000

        db = get_db()
        bal = db.execute("SELECT spa_wallet_balance FROM contacts WHERE id = ?", (cid,)).fetchone()[0]
        tx = dict(db.execute("SELECT * FROM spa_wallet_transactions WHERE contact_id = ? ORDER BY id DESC LIMIT 1", (cid,)).fetchone())
        cb = db.execute("SELECT COUNT(*) FROM cashbook WHERE contact_id = ? AND ref_type = 'topup'", (cid,)).fetchone()[0]
        db.close()
        assert bal == 300000
        assert tx["type"] == "adjust" and tx["amount"] == -200000
        assert tx["balance_before"] == 500000 and tx["balance_after"] == 300000
        assert "Nhập sai gói" in tx["note"] and "Quản Lý" in tx["note"]
        assert cb == 0

        # Nhân viên thường bị chặn
        app.dependency_overrides[get_current_user] = lambda: {"id": 2, "name": "NV", "role": "cashier", "is_active": 1}
        assert client.put(f"/api/topup/adjust/{cid}", json={"new_balance": 0, "reason": "x"}).status_code == 403
    finally:
        app.dependency_overrides.pop(get_current_user, None)
        _cleanup(cid)
