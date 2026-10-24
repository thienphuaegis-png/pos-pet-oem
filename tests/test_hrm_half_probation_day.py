"""
Test kiểm tra Thử việc nửa công (TV/2), Chi tiết chấm công từng ngày và Phạt trễ
"""
import datetime
from decimal import Decimal
from fastapi.testclient import TestClient
from server import app
from dependencies import get_current_user
from services.payroll_engine import Block, Rules, DayInput, classify_day, calc_payslip
import database
from tests.auth_helpers import owner_auth_headers

MONTH = "2026-09"


def test_classify_day_and_half_probation_credit():
    block = Block(name="Văn Phòng", start=480, end=1050, lunch=90, std_hours=8.0, off_sunday=True, monthly_off_days=0, split=750)
    rules = Rules()

    # 1. Thử việc đủ công (TV)
    d_full_tv = DayInput(work_date=datetime.date(2026, 9, 10), punches=[480, 1050], probation=True)
    res_full_tv = classify_day(d_full_tv, block, rules)
    assert res_full_tv.code == "TV"
    assert res_full_tv.credit == 1.0

    # 2. Thử việc nửa công (TV/2) do xin nghỉ buổi chiều
    d_half_tv = DayInput(work_date=datetime.date(2026, 9, 11), punches=[480, 720], leave="off_afternoon", probation=True)
    res_half_tv = classify_day(d_half_tv, block, rules)
    assert res_half_tv.code == "TV/2"
    assert res_half_tv.credit == 0.5

    # 3. Tính lương với 1 ngày TV/2
    p = calc_payslip(
        base_salary=10000000, allowance=0, std_days_month=26, std_hours=8,
        days=[res_half_tv], ot_hours_official=0, ot_hours_probation=0, rules=rules
    )
    # Lương ngày thử việc = 8.500.000 / 26 = 326.923 đ. Nửa ngày = 163.462 đ
    expected_half_pay = int(round(10000000 * 0.85 / 26 * 0.5))
    assert p["days_probation"] == 0.5
    assert abs(p["pay_probation"] - expected_half_pay) <= 1


def test_api_put_attendance_supports_half_probation_code():
    database.init_db()
    client = TestClient(app, headers=owner_auth_headers())

    # Tạo nhân viên test
    res = client.post("/api/hrm/employees", json={
        "name": "Nhân Viên Test TV2",
        "employee_code": "NV-TV2-TEST",
        "phone": "0911223344",
        "work_block_id": 1,
        "base_salary": 8000000,
        "hire_date": "2026-09-01",
        "probation_start": "2026-09-01",
        "official_date": "2026-10-01"  # Tháng 9 đang thử việc
    })
    assert res.status_code == 200
    sid = res.json()["id"]

    # 1. Cập nhật ngày làm việc thành TV/2 (Thử việc nửa công)
    res_put = client.put("/api/hrm/attendance", json={
        "staff_id": sid,
        "work_date": "2026-09-15",
        "code": "TV/2",
        "note": "Nghỉ nửa buổi chiều"
    })
    assert res_put.status_code == 200, res_put.text

    # 2. Tính lại bảng lương tháng 9 kiểm tra ngày 2026-09-15 có code TV/2
    calc_res = client.post(f"/api/hrm/payroll/{MONTH}/calculate").json()
    line = next((l for l in calc_res["lines"] if l["staff_id"] == sid), None)
    assert line is not None
    day_15 = next((d for d in line["days"] if d["date"] == "2026-09-15"), None)
    assert day_15 is not None
    assert day_15["code"] == "TV/2"
    assert day_15["credit"] == 0.5

    # Dọn dẹp
    conn = database.get_db()
    cur = conn.cursor()
    cur.execute("DELETE FROM staff_attendance WHERE staff_id = ?", (sid,))
    cur.execute("DELETE FROM payroll_lines WHERE staff_id = ?", (sid,))
    cur.execute("DELETE FROM staff WHERE id = ?", (sid,))
    conn.commit()
    conn.close()


def test_api_toggle_waive_and_penalty_reset():
    database.init_db()
    client = TestClient(app, headers=owner_auth_headers())

    res = client.post("/api/hrm/employees", json={
        "name": "Nhân Viên Test Waive",
        "employee_code": "NV-WAIVE-TEST",
        "phone": "0988776655",
        "work_block_id": 1,
        "base_salary": 9000000,
        "hire_date": "2026-09-01",
        "official_date": "2026-09-01"
    })
    assert res.status_code == 200
    sid = res.json()["id"]

    # 1. Chấm công vào trễ 30 phút (08:30 - 17:30) -> Có phạt trễ 200.000 đ
    res_att = client.put("/api/hrm/attendance", json={
        "staff_id": sid,
        "work_date": "2026-09-18",
        "punches": ["08:30", "17:30"]
    })
    assert res_att.status_code == 200

    # Tính lương -> kiểm tra có phạt trễ
    calc1 = client.post(f"/api/hrm/payroll/{MONTH}/calculate").json()
    line1 = next(l for l in calc1["lines"] if l["staff_id"] == sid)
    day_unwaived = next(d for d in line1["days"] if d["date"] == "2026-09-18")
    assert day_unwaived["penalty"] == 200000
    assert "late" in day_unwaived["violations"]

    # 2. Quản lý duyệt miễn phạt 1-chạm (Toggle Waive = True)
    res_toggle = client.post("/api/hrm/attendance/toggle-waive", json={
        "staff_id": sid,
        "work_date": "2026-09-18",
        "waive": True,
        "note": "Sếp duyệt miễn phạt vì kẹt xe"
    })
    assert res_toggle.status_code == 200
    assert res_toggle.json()["waive"] is True

    # 3. Tính lại bảng lương -> Tiền phạt về 0 đ, cờ waived = True
    calc2 = client.post(f"/api/hrm/payroll/{MONTH}/calculate").json()
    line2 = next(l for l in calc2["lines"] if l["staff_id"] == sid)
    day_waived = next(d for d in line2["days"] if d["date"] == "2026-09-18")
    assert day_waived["penalty"] == 0
    assert day_waived["waived"] is True
    # Vẫn lưu vết vi phạm để minh bạch lý do
    assert "late" in day_waived["violations"]

    # Dọn dẹp
    conn = database.get_db()
    cur = conn.cursor()
    cur.execute("DELETE FROM staff_attendance WHERE staff_id = ?", (sid,))
    cur.execute("DELETE FROM payroll_lines WHERE staff_id = ?", (sid,))
    cur.execute("DELETE FROM staff WHERE id = ?", (sid,))
    conn.commit()
    conn.close()
