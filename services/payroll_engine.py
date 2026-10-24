"""Payroll engine thuần (không DB) — port quy tắc từ Google Sheet "Bảng Lương" đã sửa lỗi.
Đơn vị thời gian: phút tính từ 00:00 (int). Tiền: int đồng.
"""
from __future__ import annotations

import calendar
import re
from dataclasses import dataclass, field
from datetime import date, datetime, time
from decimal import Decimal, ROUND_HALF_UP
from typing import Optional

LEAVE_TYPES = ("off", "off_morning", "off_afternoon")


def to_min(v) -> Optional[int]:
    """'08:01' | '8:01:59' | time | datetime | float (phân số ngày Excel) -> phút. Rỗng/không hợp lệ -> None."""
    if v is None or v == "":
        return None
    if isinstance(v, datetime):
        return v.hour * 60 + v.minute
    if isinstance(v, time):
        return v.hour * 60 + v.minute
    if isinstance(v, (int, float)):
        if 0 <= v < 1:
            return int(round(v * 24 * 60 * 60)) // 60
        if 0 <= v < 1440:
            return int(v)
        return None
    m = re.match(r"^\s*(\d{1,2}):(\d{2})(?::\d{2})?\s*$", str(v))
    if not m:
        return None
    h, mi = int(m.group(1)), int(m.group(2))
    return h * 60 + mi if h < 24 and mi < 60 else None


def fmt_min(m: Optional[int]) -> str:
    return "" if m is None else f"{m // 60:02d}:{m % 60:02d}"


def parse_punches(values) -> list:
    """Danh sách giá trị ô Vào1..Ra3 -> list phút đã sort, bỏ rỗng/trùng."""
    return sorted({m for m in (to_min(v) for v in values) if m is not None})


@dataclass
class Block:
    """Khối làm việc / hình thức chấm công (bảng hrm_work_blocks)."""
    name: str
    start: int            # giờ vào chuẩn (phút)
    end: int              # giờ ra chuẩn
    lunch: int            # phút nghỉ trưa (0 = không nghỉ)
    std_hours: float      # giờ công chuẩn 1 ngày (mẫu số đơn giá giờ OT)
    off_sunday: bool      # nghỉ chủ nhật
    monthly_off_days: int # số ngày nghỉ/tháng khi không nghỉ CN
    split: int            # mốc chia ca sáng/chiều (Off Chiều về lúc split, Off Sáng vào lúc split+lunch)


@dataclass
class Rules:
    late_per_min: int = 5000
    late_flat: int = 200000
    late_flat_threshold_min: int = 30
    missing_punch: int = 50000
    absent: int = 500000
    full_day_min: int = 420     # >= 7h -> 1 công
    half_day_min: int = 210     # >= 3.5h -> 0.5 công
    probation_rate: Decimal = Decimal("0.85")
    ot_multiplier: Decimal = Decimal("1.5")
    ot_min_minutes: int = 25
    holiday_extra_days: int = 1
    attendance_bonus: int = 500000
    birthday_bonus: int = 200000
    payroll_mode: str = "sme"   # 'sme' (mặc định) | 'enterprise'
    insurance_rate: Decimal = Decimal("0.105")  # 10.5% NLĐ đóng (8% BHXH + 1.5% BHYT + 1% BHTN)
    insurance_cap: int = 46800000               # Trần lương đóng BHXH (20 lần mức cơ sở 2.34M)
    tax_self_deduction: int = 11000000          # Giảm trừ gia cảnh bản thân (11M/tháng)
    tax_dependent_deduction: int = 4400000      # Giảm trừ người phụ thuộc (4.4M/người/tháng)


def calc_pit(assessable_income: Decimal) -> Decimal:
    """Thuế thu nhập cá nhân theo biểu thuế lũy tiến từng phần 7 bậc (Thông tư 111/2013/TT-BTC)."""
    if assessable_income <= 0:
        return Decimal(0)
    ai = float(assessable_income)
    if ai <= 5_000_000:
        tax = ai * 0.05
    elif ai <= 10_000_000:
        tax = ai * 0.10 - 250_000
    elif ai <= 18_000_000:
        tax = ai * 0.15 - 750_000
    elif ai <= 32_000_000:
        tax = ai * 0.20 - 1_650_000
    elif ai <= 52_000_000:
        tax = ai * 0.25 - 3_250_000
    elif ai <= 80_000_000:
        tax = ai * 0.30 - 5_850_000
    else:
        tax = ai * 0.35 - 9_850_000
    return Decimal(str(max(0, int(round(tax)))))


def std_days(block: Block, year: int, month: int) -> int:
    n = calendar.monthrange(year, month)[1]
    if block.off_sunday:
        sundays = sum(1 for d in range(1, n + 1) if date(year, month, d).weekday() == 6)
        return n - sundays
    return n - block.monthly_off_days


@dataclass
class DayInput:
    work_date: date
    punches: list = field(default_factory=list)
    leave: Optional[str] = None   # None | off | off_morning | off_afternoon
    is_holiday: bool = False
    waive: bool = False           # cờ "Không phạt"
    employed: bool = True         # trong khoảng ngày nhận việc .. ngày nghỉ việc
    probation: bool = False


@dataclass
class DayResult:
    work_date: date
    code: str = ""                # X, X/2, TV, TV/2, OFF, CN, L, ""
    credit: float = 0.0
    probation: bool = False
    check_in: Optional[int] = None
    check_out: Optional[int] = None
    worked_min: int = 0
    late_min: int = 0
    early_min: int = 0
    violations: list = field(default_factory=list)  # late, early, missing_in, missing_out, absent
    penalty: int = 0
    ot_suggest_hours: float = 0.0
    holiday: bool = False
    employed: bool = True
    waived: bool = False


def _mround_half(hours: float) -> float:
    return float((Decimal(str(hours)) * 2).quantize(Decimal("1"), rounding=ROUND_HALF_UP) / 2)


def classify_day(d: DayInput, b: Block, r: Rules) -> DayResult:
    res = DayResult(work_date=d.work_date, probation=d.probation, employed=d.employed,
                    holiday=d.is_holiday, waived=d.waive)
    if not d.employed:
        return res
    if d.leave == "off":
        res.code = "OFF"
        res.penalty = 0
        return res
    if not d.punches:
        if d.is_holiday:
            res.code = "L"
        elif d.work_date.weekday() == 6 and b.off_sunday:
            res.code = "CN"
        else:
            if d.leave != "off_morning":
                res.violations.append("absent")
            res.penalty = 0 if (d.waive or d.leave == "off_morning") else r.absent
        return res

    start, end = b.start, b.end
    if d.leave == "off_morning":
        start = b.split + b.lunch
    elif d.leave == "off_afternoon":
        end = b.split

    mn, mx = d.punches[0], d.punches[-1]
    if mn == mx:
        if d.leave == "off_morning":
            if mn <= 930:
                cin, cout = mn, None
            else:
                cin, cout = None, mn
        elif d.leave == "off_afternoon":
            if mn < 630:
                cin, cout = mn, None
            else:
                cin, cout = None, mn
        else:
            if mn < (start + end) // 2:
                cin, cout = mn, None
            else:
                cin, cout = None, mx
    else:
        cin, cout = mn, mx
    res.check_in, res.check_out = cin, cout

    pen = 0
    if cin is None:
        if d.leave != "off_morning":
            res.violations.append("missing_in")
            pen += r.missing_punch
    if cout is None:
        if d.leave not in ("off_morning", "off_afternoon"):
            res.violations.append("missing_out")
            pen += r.missing_punch
    i_eff = cin if cin is not None else start
    o_eff = cout if cout is not None else end
    worked = max(0, o_eff - i_eff)
    if d.leave is None and b.lunch and i_eff < b.split and o_eff > b.split + b.lunch:
        worked -= b.lunch
    res.worked_min = worked

    if d.leave in ("off_morning", "off_afternoon"):
        credit = 0.5
        base = "TV" if d.probation else "X"
        res.code = f"{base}/2"
    else:
        credit = 1.0 if worked >= r.full_day_min else (0.5 if worked >= r.half_day_min else 0.0)
        base = "TV" if d.probation else "X"
        res.code = base if credit == 1.0 else (base + "/2" if credit == 0.5 else "")
    res.credit = credit

    if cin is not None and cin > start:
        res.late_min = cin - start
        res.violations.append("late")
        pen += r.late_flat if res.late_min >= r.late_flat_threshold_min else res.late_min * r.late_per_min
    if cout is not None and cout < end:
        res.early_min = end - cout
        res.violations.append("early")
    if cout is not None and d.leave != "off_afternoon" and cout - b.end >= r.ot_min_minutes:
        res.ot_suggest_hours = _mround_half((cout - b.end) / 60)
    res.penalty = 0 if d.waive else pen
    return res


def _money(x) -> int:
    return int(Decimal(x).quantize(Decimal("1"), rounding=ROUND_HALF_UP))


def calc_payslip(*, base_salary: int, allowance: int, std_days_month: int, std_hours: float,
                 days: list, ot_hours_official: float = 0, ot_hours_probation: float = 0,
                 commission: int = 0, spa_commission: int = 0, tips: int = 0,
                 advances: int = 0, fuel_other: int = 0, bonus_other: int = 0,
                 deduction_other: int = 0, birthday_in_month: bool = False,
                 has_contract: bool = False, dependents_count: int = 0,
                 insurance_salary: float = 0, is_insurance_exempt: bool = False,
                 rules: Rules = Rules()) -> dict:
    """Tính 1 dòng bảng lương từ kết quả chấm công từng ngày (list DayResult)."""
    base = Decimal(base_salary)
    prob_base = base * rules.probation_rate
    sd = Decimal(std_days_month) if std_days_month else Decimal(1)
    rate_off, rate_prob = base / sd, prob_base / sd

    days_off = sum(Decimal(str(x.credit)) for x in days if not x.probation)
    days_prob = sum(Decimal(str(x.credit)) for x in days if x.probation)
    hol_off = sum(1 for x in days if x.holiday and x.employed and not x.probation and (x.code == "L" or x.credit > 0))
    hol_prob = sum(1 for x in days if x.holiday and x.employed and x.probation and (x.code == "L" or x.credit > 0))

    pay_days = rate_off * days_off + rate_prob * days_prob
    holiday_pay = (rate_off * hol_off + rate_prob * hol_prob) * rules.holiday_extra_days
    sh = Decimal(str(std_hours)) if std_hours else Decimal(8)
    ot_pay = (rate_off / sh * rules.ot_multiplier * Decimal(str(ot_hours_official))
              + rate_prob / sh * rules.ot_multiplier * Decimal(str(ot_hours_probation)))
    penalties = sum(x.penalty for x in days)

    violation_days = [x for x in days if x.violations and not x.waived]
    full_month = bool(days) and all(x.employed for x in days)
    worked_credit = days_off + days_prob + sum(1 for x in days if x.code == "L")
    attendance_ok = full_month and not violation_days and worked_credit >= std_days_month
    attendance_bonus = rules.attendance_bonus if attendance_ok else 0
    birthday = rules.birthday_bonus if birthday_in_month else 0

    gross = (pay_days + Decimal(allowance) + Decimal(fuel_other) + holiday_pay + Decimal(commission)
             + Decimal(spa_commission) + Decimal(tips) + Decimal(birthday) + Decimal(attendance_bonus)
             + Decimal(bonus_other) + ot_pay)

    # ── Chế độ Doanh nghiệp (Enterprise Mode): Bảo hiểm & Thuế TNCN ──
    insurance = Decimal(0)
    pit = Decimal(0)
    assessable_income = Decimal(0)

    if rules.payroll_mode == "enterprise":
        if has_contract and not is_insurance_exempt:
            ins_base = Decimal(str(insurance_salary)) if insurance_salary > 0 else base
            ins_base = min(ins_base, Decimal(str(rules.insurance_cap)))
            insurance = (ins_base * rules.insurance_rate).quantize(Decimal("1"), rounding=ROUND_HALF_UP)

        ot_exempt = (ot_pay * (rules.ot_multiplier - Decimal(1)) / rules.ot_multiplier) if rules.ot_multiplier > 1 else Decimal(0)
        taxable_income = max(Decimal(0), gross - ot_exempt)
        total_deduction = insurance + Decimal(rules.tax_self_deduction) + (Decimal(rules.tax_dependent_deduction) * Decimal(dependents_count))
        assessable_income = max(Decimal(0), taxable_income - total_deduction)
        pit = calc_pit(assessable_income)

    net = gross - Decimal(penalties) - Decimal(advances) - Decimal(deduction_other) - insurance - pit
    net_rounded = int((net / 1000).quantize(Decimal("1"), rounding=ROUND_HALF_UP) * 1000)
    return {
        "base_salary": base_salary,
        "probation_salary": _money(prob_base),
        "std_days": std_days_month,
        "std_hours": float(sh),
        "days_official": float(days_off),
        "days_probation": float(days_prob),
        "pay_official": _money(rate_off * days_off),
        "pay_probation": _money(rate_prob * days_prob),
        "pay_days": _money(pay_days),
        "allowance": allowance,
        "fuel_other": fuel_other,
        "holiday_days_official": hol_off,
        "holiday_days_probation": hol_prob,
        "holiday_pay": _money(holiday_pay),
        "commission": commission,
        "spa_commission": spa_commission,
        "tips": tips,
        "birthday_bonus": birthday,
        "attendance_bonus": attendance_bonus,
        "bonus_other": bonus_other,
        "ot_hours_official": ot_hours_official,
        "ot_hours_probation": ot_hours_probation,
        "ot_pay": _money(ot_pay),
        "penalties": penalties,
        "advances": advances,
        "deduction_other": deduction_other,
        "insurance": _money(insurance),
        "pit": _money(pit),
        "assessable_income": _money(assessable_income),
        "gross": _money(gross),
        "net": _money(net),
        "net_rounded": net_rounded,
    }
