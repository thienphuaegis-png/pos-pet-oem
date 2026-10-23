from datetime import date
from decimal import Decimal

from services.payroll_engine import (
    Block, Rules, DayInput, classify_day, calc_payslip, std_days, parse_punches, to_min,
)

KHO = Block("Kho", start=480, end=1080, lunch=90, std_hours=8.5, off_sunday=False, monthly_off_days=2, split=720)
VP = Block("Văn Phòng", start=480, end=1050, lunch=90, std_hours=8.0, off_sunday=True, monthly_off_days=0, split=720)
R = Rules()


def day(d, punches=(), **kw):
    return classify_day(DayInput(work_date=d, punches=parse_punches(punches), **kw), KHO, R)


def test_to_min_formats():
    assert to_min("08:01") == 481
    assert to_min("8:01:59") == 481
    assert to_min(0.75) == 1080
    assert to_min("") is None and to_min("abc") is None


def test_std_days_oct_2026():
    assert std_days(VP, 2026, 10) == 27   # 31 - 4 CN (khớp sheet B11)
    assert std_days(KHO, 2026, 10) == 29  # 31 - 2 (khớp sheet B12)


def test_late_minutes_exact_not_floored():
    # Sheet cũ: trễ 1 phút = 0đ (lỗi INT số thực). Đúng: 1 phút = 5.000đ, 2 phút = 10.000đ
    assert day(date(2026, 10, 2), ["08:01", "18:04"]).penalty == 5000
    assert day(date(2026, 10, 8), ["08:02", "18:03"]).penalty == 10000


def test_late_30_min_flat():
    r = day(date(2026, 10, 2), ["08:30", "18:00"])
    assert r.late_min == 30 and r.penalty == 200000


def test_full_day_and_ot_suggestion():
    r = day(date(2026, 10, 3), ["08:01", "19:04"])
    assert r.code == "X" and r.credit == 1.0
    assert r.ot_suggest_hours == 1.0  # 64 phút -> MROUND 0.5 = 1.0


def test_missing_out_penalty_still_credited():
    r = day(date(2026, 10, 2), ["07:55"])
    assert r.violations == ["missing_out"] and r.penalty == 50000 and r.code == "X"


def test_absent_and_waive():
    assert day(date(2026, 10, 5)).penalty == 500000
    assert day(date(2026, 10, 5), waive=True).penalty == 0


def test_not_employed_no_penalty():
    # Sheet cũ phạt 500k cả những ngày trước ngày nhận việc
    r = day(date(2026, 10, 1), employed=False)
    assert r.penalty == 0 and r.code == ""


def test_half_day_leave_afternoon():
    r = day(date(2026, 10, 6), ["07:58", "12:00"], leave="off_afternoon")
    assert r.credit == 0.5 and r.code == "X/2" and r.penalty == 0


def test_probation_code_by_work_date():
    assert day(date(2026, 10, 2), ["08:00", "18:00"], probation=True).code == "TV"


def test_sunday_off_block():
    r = classify_day(DayInput(work_date=date(2026, 10, 4)), VP, R)
    assert r.code == "CN" and r.penalty == 0


def test_payslip_probation_full_month_and_attendance_bonus():
    # NV kho thử việc, lương 7.000.000, đi làm đúng đủ 29 ngày, nghỉ 2 ngày có phép
    days = []
    for d in range(1, 32):
        wd = date(2026, 10, d)
        if d in (11, 25):
            days.append(day(wd, leave="off", probation=True))
        else:
            days.append(day(wd, ["07:55", "18:00"], probation=True))
    p = calc_payslip(base_salary=7_000_000, allowance=0, std_days_month=29, std_hours=8.5, days=days)
    assert p["days_probation"] == 29.0
    assert p["pay_days"] == 5_950_000           # 85% x 7tr
    assert p["attendance_bonus"] == 500_000
    assert p["net_rounded"] == 6_450_000


def test_payslip_violation_kills_bonus_and_rounding():
    days = [day(date(2026, 10, d), ["08:00", "18:00"]) for d in range(1, 30)]
    days[0] = day(date(2026, 10, 1), ["08:01", "18:00"])  # trễ 1 phút
    p = calc_payslip(base_salary=8_000_000, allowance=1_000_000, std_days_month=29, std_hours=8.5,
                     days=days, ot_hours_official=2, advances=2_000_000)
    assert p["attendance_bonus"] == 0
    assert p["penalties"] == 5000
    # OT: 8tr/29/8.5*1.5*2 = 97.363,08 -> 97.363
    assert p["ot_pay"] == 97363
    # 8tr + 1tr + 97.363 - 5.000 - 2tr = 7.092.363 -> 7.092.000
    assert p["net_rounded"] == 7_092_000


def test_holiday_not_worked_paid():
    hol = classify_day(DayInput(work_date=date(2026, 9, 2), is_holiday=True), VP, R)
    assert hol.code == "L"
    p = calc_payslip(base_salary=2_700_000, allowance=0, std_days_month=27, std_hours=8, days=[hol])
    assert p["holiday_pay"] == 100_000
