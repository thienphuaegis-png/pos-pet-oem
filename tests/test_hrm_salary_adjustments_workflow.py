import pytest
from fastapi.testclient import TestClient
import database
from server import app
from tests.auth_helpers import owner_auth_headers

client = TestClient(app, headers=owner_auth_headers())


@pytest.fixture(autouse=True)
def clean_db():
    database.init_db()
    yield


def test_crud_employee_full_profile():
    # 1. Tạo nhân viên với đầy đủ thông tin cá nhân, CCCD, địa chỉ, ngân hàng
    payload = {
        "name": "Bùi Thiên Phú Test",
        "employee_code": "NV-FULL-TEST",
        "phone": "0388408876",
        "gender": "Nam",
        "department": "HCNS",
        "position": "Nhân Viên",
        "base_salary": 7000000,
        "allowance": 0,
        "birthday": "1997-04-15",
        "id_card_number": "083097004964",
        "id_card_date": "2022-04-02",
        "id_card_place": "Cục CS QLHC về TTXH",
        "permanent_address": "504 Ấp Thới Hoà, xã Châu Hoà, Giồng Trôm, Bến Tre",
        "temporary_address": "504 Ấp Thới Hoà, xã Châu Hoà, Giồng Trôm, Bến Tre",
        "email": "buithienphu.mcare@gmail.com",
        "bank_account": "0388408876",
        "bank_name": "BIDV",
        "bank_branch": "Bến Tre",
        "emergency_phone": "0357957038",
        "emergency_relation": "Chị",
        "hire_date": "2025-05-02",
        "probation_start": "2025-05-02",
        "official_date": "2025-05-02"
    }

    res = client.post("/api/hrm/employees", json=payload)
    assert res.status_code == 200, res.text
    staff_id = res.json()["id"]

    # 2. Get list nhân viên -> kiểm tra trường mới và trường tính toán động
    res_list = client.get("/api/hrm/employees")
    assert res_list.status_code == 200
    employees = res_list.json()
    emp = next((e for e in employees if e["id"] == staff_id), None)
    assert emp is not None
    assert emp["employee_code"] == "NV-FULL-TEST"
    assert emp["gender"] == "Nam"
    assert emp["department"] == "HCNS"
    assert emp["id_card_number"] == "083097004964"
    assert emp["email"] == "buithienphu.mcare@gmail.com"
    assert emp["emergency_relation"] == "Chị"
    assert emp["contractual_status"] == "Chính thức"
    assert "năm" in emp["tenure"]

    # 3. Tạo quyết định điều chỉnh lương
    adj_payload = {
        "decision_date": "2025-07-01",
        "effective_date": "2025-07-01",
        "adjustment_type": "salary",
        "base_delta": 1000000,
        "allowance_delta": 0,
        "reason": "Tăng lương đợt 1"
    }
    res_adj = client.post(f"/api/hrm/employees/{staff_id}/adjustments", json=adj_payload)
    assert res_adj.status_code == 200

    # 4. Kiểm tra API GET /api/hrm/adjustments toàn hệ thống
    res_all_adj = client.get("/api/hrm/adjustments")
    assert res_all_adj.status_code == 200
    all_adj = res_all_adj.json()
    my_adj = next((a for a in all_adj if a["staff_id"] == staff_id), None)
    assert my_adj is not None
    assert my_adj["base_delta"] == 1000000
    assert my_adj["decision_date"] == "2025-07-01"
    adj_id = my_adj["id"]

    # 5. Verify lương sau điều chỉnh được enrich vào list employees
    res_list2 = client.get("/api/hrm/employees")
    emp2 = next((e for e in res_list2.json() if e["id"] == staff_id), None)
    assert emp2["total_base_delta"] == 1000000.0
    assert emp2["base_salary_effective"] == 8000000.0
    assert emp2["total_salary"] == 8000000.0

    # 6. Xóa quyết định điều chỉnh khi tháng chưa chốt
    res_del = client.delete(f"/api/hrm/adjustments/{adj_id}")
    assert res_del.status_code == 200

    # 7. Xóa dọn dẹp staff
    conn = database.get_db()
    cur = conn.cursor()
    cur.execute("DELETE FROM staff WHERE id = ?", (staff_id,))
    conn.commit()
    conn.close()
