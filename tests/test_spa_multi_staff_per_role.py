"""Nhiều thợ cùng 1 vai (Tắm/Cắt/Nhuộm) trên phiếu Spa: chia đều công vai; ghi/đọc qua bulk-update."""
from fastapi.testclient import TestClient
import database
from server import app
from tests.auth_helpers import owner_auth_headers
from services.commission import spa_commission_by_name, split_staff_names

client = TestClient(app, headers=owner_auth_headers())
DAY = "2031-01-15"  # ngày riêng để không lẫn phiếu thật
NAMES = ["TT Tắm A", "TT Tắm B", "TT Tắm C", "TT Cắt A", "TT Cắt B", "TT Nhuộm A"]


def test_split_staff_names():
    assert split_staff_names(" A , b,, a ,B ") == ["A", "b"]
    assert split_staff_names(None) == []


def test_multi_staff_per_role_commission_split():
    conn = database.get_db(); cur = conn.cursor()
    cur.execute("DELETE FROM pet_service_tickets WHERE code LIKE 'SPA-MULTI-%'")
    cid = cur.execute("SELECT id FROM contacts WHERE type = 'customer' ORDER BY id LIMIT 1").fetchone()[0]
    # Phiếu 1: 3 thợ tắm (w1 + "B, C" ở w2), 2 thợ cắt, 1 thợ nhuộm, bé 5kg chó
    cur.execute("""INSERT INTO pet_service_tickets (customer_id, code, ticket_date, status, service_type, price, weight_at_service,
                   staff_worker_1, staff_worker_2, staff_cutter, staff_dyer, tip_amount)
                   VALUES (?, 'SPA-MULTI-1', ?, 'completed', 'Super VIP: Combo Cắt tỉa', 500000, 5, 'TT Tắm A', 'TT Tắm B, TT Tắm C', 'TT Cắt A, TT Cắt B', 'TT Nhuộm A', 60000)""", (cid, DAY))
    t1 = cur.lastrowid
    # Phiếu 2: dữ liệu cũ 1 tắm + 1 tắm phụ -> giữ chia 50/50 như trước
    cur.execute("""INSERT INTO pet_service_tickets (customer_id, code, ticket_date, status, service_type, price, weight_at_service,
                   staff_worker_1, staff_worker_2) VALUES (?, 'SPA-MULTI-2', ?, 'completed', 'Vip 1', 200000, 5, 'TT Tắm A', 'TT Tắm B')""", (cid, DAY))
    conn.commit()
    try:
        res = spa_commission_by_name(cur, DAY, DAY)
        prof_bath, prof_cut, prof_dye = 30000.0, 50000.0, 50000.0  # bảng mặc định bậc <=10kg
        r = {n.lower(): res.get(n.lower(), {}) for n in NAMES}
        # Tắm: phiếu1 30k/3 = 10k mỗi người; phiếu2 30k*50% = 15k cho A và B
        assert r["tt tắm a"]["breakdown"]["bath"] == round(prof_bath / 3 + prof_bath / 2)
        assert r["tt tắm b"]["breakdown"]["bath"] == round(prof_bath / 3 + prof_bath / 2)
        assert r["tt tắm c"]["breakdown"]["bath"] == round(prof_bath / 3)
        assert r["tt cắt a"]["breakdown"]["cut"] == round(prof_cut / 2)
        assert r["tt cắt b"]["breakdown"]["cut"] == round(prof_cut / 2)
        assert r["tt nhuộm a"]["breakdown"]["dye"] == prof_dye
        # Tip 60k chia đều 6 thợ khác nhau = 10k
        assert r["tt tắm c"]["tips"] == 10000 and r["tt nhuộm a"]["tips"] == 10000
        assert r["tt tắm c"]["tickets"] == 1 and r["tt tắm a"]["tickets"] == 2

        # bulk-update ghi chuỗi nhiều tên đúng nguyên văn
        u = client.put("/api/pet-services/tickets/bulk-update", json={"tickets": [
            {"id": t1, "staff_worker_1": "TT Tắm A", "staff_worker_2": "TT Tắm C", "staff_cutter": "TT Cắt B"}]})
        assert u.status_code == 200, u.text
        row = cur.execute("SELECT staff_worker_2, staff_cutter FROM pet_service_tickets WHERE id = ?", (t1,)).fetchone()
        assert (row[0], row[1]) == ("TT Tắm C", "TT Cắt B")
    finally:
        cur.execute("DELETE FROM pet_service_tickets WHERE code LIKE 'SPA-MULTI-%'")
        conn.commit(); conn.close()
