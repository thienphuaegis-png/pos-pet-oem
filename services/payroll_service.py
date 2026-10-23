"""Glue DB <-> payroll_engine: dựng dữ liệu tháng, tính / chốt / trả lương."""
import calendar
import json
import re
from datetime import date, datetime
from decimal import Decimal

from fastapi import HTTPException

from services.payroll_engine import Block, Rules, DayInput, classify_day, calc_payslip, std_days, to_min, fmt_min
from services.commission import sales_commission_by_staff, spa_commission_by_name

PAYROLL_CATEGORY = "Chi lương & hoa hồng nhân viên"
ADVANCE_CATEGORY = "Tạm ứng lương"
MANUAL_FIELDS = ("bonus_other", "fuel_other", "deduction_other")


def parse_month(month: str):
    if not re.match(r"^\d{4}-(0[1-9]|1[0-2])$", month or ""):
        raise HTTPException(400, "Tháng không hợp lệ, định dạng YYYY-MM")
    y, m = int(month[:4]), int(month[5:])
    return y, m, date(y, m, 1), date(y, m, calendar.monthrange(y, m)[1])


def _d(s):
    return date.fromisoformat(str(s)[:10]) if s else None


def load_rules(cur) -> Rules:
    cur.execute("SELECT value FROM settings WHERE key = 'hrm_rules'")
    row = cur.fetchone()
    data = json.loads(row["value"]) if row and row["value"] else {}
    r = Rules()
    for k, v in data.items():
        if hasattr(r, k):
            cur_val = getattr(r, k)
            setattr(r, k, Decimal(str(v)) if isinstance(cur_val, Decimal) else type(cur_val)(v))
    return r


def row_to_block(row) -> Block:
    return Block(name=row["name"], start=to_min(row["start_time"]), end=to_min(row["end_time"]),
                 lunch=int(row["lunch_minutes"] or 0), std_hours=float(row["std_hours"] or 8),
                 off_sunday=bool(row["off_sunday"]), monthly_off_days=int(row["monthly_off_days"] or 0),
                 split=to_min(row["split_time"]) or 720)


def load_blocks(cur) -> dict:
    cur.execute("SELECT * FROM hrm_work_blocks")
    return {r["id"]: row_to_block(r) for r in cur.fetchall()}


def month_status(cur, y: int, m: int) -> str:
    cur.execute("SELECT status FROM payroll_periods WHERE month = ?", (f"{y:04d}-{m:02d}",))
    row = cur.fetchone()
    return row["status"] if row else "draft"


def assert_month_open(cur, d) -> None:
    d = _d(d)
    if month_status(cur, d.year, d.month) != "draft":
        raise HTTPException(400, f"Bảng lương tháng {d.month:02d}/{d.year} đã chốt, không sửa được dữ liệu của tháng này")


def is_probation(staff, d: date) -> bool:
    start = _d(staff["probation_start"]) or _d(staff["hire_date"])
    official = _d(staff["official_date"])
    return bool(start) and d >= start and (official is None or d < official)


def is_employed(staff, d: date) -> bool:
    hire, leave = _d(staff["hire_date"]), _d(staff["leave_date"])
    return (hire is None or d >= hire) and (leave is None or d <= leave)


def salary_at(cur, staff, last_day: date):
    cur.execute("""SELECT COALESCE(SUM(base_delta),0) b, COALESCE(SUM(allowance_delta),0) a
                   FROM hrm_salary_adjustments WHERE staff_id = ? AND effective_date <= ?""",
                (staff["id"], last_day.isoformat()))
    adj = cur.fetchone()
    return int(round(float(staff["base_salary"] or 0) + float(adj["b"]))), int(round(float(staff["allowance"] or 0) + float(adj["a"])))


def build_days(cur, staff, block: Block, rules: Rules, first: date, last: date, today: date) -> list:
    cur.execute("SELECT * FROM staff_attendance WHERE staff_id = ? AND work_date BETWEEN ? AND ?",
                (staff["id"], first.isoformat(), last.isoformat()))
    att = {r["work_date"]: r for r in cur.fetchall()}
    cur.execute("SELECT holiday_date FROM hrm_holidays WHERE holiday_date BETWEEN ? AND ?", (first.isoformat(), last.isoformat()))
    holidays = {r["holiday_date"] for r in cur.fetchall()}
    out = []
    for n in range(1, last.day + 1):
        d = date(first.year, first.month, n)
        if d > today:
            break
        a = att.get(d.isoformat())
        punches = sorted(to_min(p) for p in json.loads(a["punches"] or "[]") if to_min(p) is not None) if a else []
        out.append(classify_day(DayInput(
            work_date=d, punches=punches, leave=a["leave_type"] if a else None,
            is_holiday=d.isoformat() in holidays, waive=bool(a["waive"]) if a else False,
            employed=is_employed(staff, d), probation=is_probation(staff, d)), block, rules))
    return out


def day_to_dict(r) -> dict:
    return {"date": r.work_date.isoformat(), "code": r.code, "credit": r.credit, "probation": r.probation,
            "check_in": fmt_min(r.check_in), "check_out": fmt_min(r.check_out), "worked_min": r.worked_min,
            "late_min": r.late_min, "early_min": r.early_min, "violations": r.violations, "penalty": r.penalty,
            "ot_suggest_hours": r.ot_suggest_hours, "holiday": r.holiday, "employed": r.employed}


def payroll_staff(cur, first: date) -> list:
    cur.execute("""SELECT * FROM staff
                   WHERE (is_active = 1 OR (leave_date IS NOT NULL AND leave_date >= ?))
                     AND (COALESCE(base_salary,0) > 0 OR is_spa_worker = 1 OR COALESCE(employee_code,'') != '')
                   ORDER BY COALESCE(employee_code, 'zz'), id""", (first.isoformat(),))
    return cur.fetchall()


def compute_line(cur, staff, y, m, first, last, today, rules, blocks, sales, spa, manual) -> dict:
    anomalies = []
    block = blocks.get(staff["work_block_id"])
    if not block:
        return {"staff_id": staff["id"], "name": staff["name"], "employee_code": staff["employee_code"] or "",
                "block": "", "anomalies": ["Chưa gán khối làm việc"], "net_rounded": 0, "days": []}
    days = build_days(cur, staff, block, rules, first, last, today)
    base, allowance = salary_at(cur, staff, last)
    cur.execute("SELECT work_date, hours FROM staff_overtime WHERE staff_id = ? AND work_date BETWEEN ? AND ?",
                (staff["id"], first.isoformat(), last.isoformat()))
    ot_off = ot_prob = 0.0
    for o in cur.fetchall():
        if is_probation(staff, _d(o["work_date"])):
            ot_prob += float(o["hours"])
        else:
            ot_off += float(o["hours"])
    cur.execute("SELECT COALESCE(SUM(amount),0) FROM staff_advances WHERE staff_id = ? AND advance_date BETWEEN ? AND ?",
                (staff["id"], first.isoformat(), last.isoformat()))
    advances = int(round(float(cur.fetchone()[0])))
    bday = _d(staff["birthday"])
    spa_rec = spa.get((staff["name"] or "").strip().lower(), {})
    p = calc_payslip(
        base_salary=base, allowance=allowance, std_days_month=std_days(block, y, m), std_hours=block.std_hours,
        days=days, ot_hours_official=ot_off, ot_hours_probation=ot_prob,
        commission=int(sales.get(staff["id"], {}).get("commission", 0)),
        spa_commission=int(spa_rec.get("commission", 0)), tips=int(spa_rec.get("tips", 0)),
        advances=advances, fuel_other=int(manual.get("fuel_other", 0)), bonus_other=int(manual.get("bonus_other", 0)),
        deduction_other=int(manual.get("deduction_other", 0)), birthday_in_month=bool(bday and bday.month == m),
        rules=rules)
    if p["net_rounded"] > 0 and not (staff["bank_account"] or "").strip():
        anomalies.append("Thiếu số tài khoản ngân hàng")
    if p["net_rounded"] < 0:
        anomalies.append("Thực lãnh âm (phạt + tạm ứng lớn hơn lương)")
    if (staff["probation_start"] or staff["hire_date"]) and not staff["official_date"] and any(d.probation for d in days):
        anomalies.append("Đang thử việc nhưng chưa có ngày chính thức")
    if not (staff["device_code"] or "").strip() and not staff["is_spa_worker"]:
        anomalies.append("Chưa có mã máy chấm công")
    p.update({"staff_id": staff["id"], "name": staff["name"], "employee_code": staff["employee_code"] or "",
              "position": staff["position"] or "", "block": block.name, "anomalies": anomalies,
              "sales_net": int(sales.get(staff["id"], {}).get("net", 0)),
              "days": [day_to_dict(x) for x in days]})
    return p


def _period(cur, month, create=False):
    cur.execute("SELECT * FROM payroll_periods WHERE month = ?", (month,))
    row = cur.fetchone()
    if not row and create:
        cur.execute("INSERT INTO payroll_periods (month, status) VALUES (?, 'draft')", (month,))
        cur.execute("SELECT * FROM payroll_periods WHERE month = ?", (month,))
        row = cur.fetchone()
    return row


def calculate_period(cur, month: str, today: date = None) -> dict:
    y, m, first, last = parse_month(month)
    today = today or date.today()
    period = _period(cur, month, create=True)
    if period["status"] != "draft":
        raise HTTPException(400, "Bảng lương đã chốt, mở khóa trước khi tính lại")
    rules, blocks = load_rules(cur), load_blocks(cur)
    sales = sales_commission_by_staff(cur, f"{first} 00:00:00", f"{last} 23:59:59")
    spa = spa_commission_by_name(cur, first.isoformat(), last.isoformat())
    cur.execute("SELECT * FROM payroll_lines WHERE period_id = ?", (period["id"],))
    existing = {r["staff_id"]: r for r in cur.fetchall()}
    seen = set()
    for s in payroll_staff(cur, first):
        ex = existing.get(s["id"])
        manual = {k: float(ex[k] or 0) for k in MANUAL_FIELDS} if ex else {}
        line = compute_line(cur, s, y, m, first, last, today, rules, blocks, sales, spa, manual)
        seen.add(s["id"])
        cur.execute("""INSERT INTO payroll_lines (period_id, staff_id, data_json, net_pay) VALUES (?, ?, ?, ?)
                       ON CONFLICT(period_id, staff_id) DO UPDATE SET data_json = excluded.data_json, net_pay = excluded.net_pay""",
                    (period["id"], s["id"], json.dumps(line, ensure_ascii=False), line["net_rounded"]))
    for sid, ex in existing.items():
        if sid not in seen and not ex["cashbook_id"]:
            cur.execute("DELETE FROM payroll_lines WHERE id = ?", (ex["id"],))
    return get_period(cur, month)


def get_period(cur, month: str) -> dict:
    parse_month(month)
    period = _period(cur, month)
    if not period:
        return {"month": month, "status": "draft", "lines": [], "totals": {}}
    cur.execute("""SELECT pl.*, c.code AS cashbook_code FROM payroll_lines pl
                   LEFT JOIN cashbook c ON c.id = pl.cashbook_id WHERE pl.period_id = ? ORDER BY pl.id""", (period["id"],))
    lines = []
    for r in cur.fetchall():
        data = json.loads(r["data_json"] or "{}")
        data.update({k: float(r[k] or 0) for k in MANUAL_FIELDS})
        data.update({"line_id": r["id"], "net_pay": float(r["net_pay"] or 0), "manual_note": r["manual_note"] or "",
                     "cashbook_id": r["cashbook_id"], "cashbook_code": r["cashbook_code"], "paid_at": r["paid_at"]})
        lines.append(data)
    keys = ("pay_days", "allowance", "holiday_pay", "commission", "spa_commission", "tips", "ot_pay",
            "attendance_bonus", "birthday_bonus", "penalties", "advances", "net_pay")
    totals = {k: sum(float(l.get(k) or 0) for l in lines) for k in keys}
    return {"month": month, "status": period["status"], "locked_at": period["locked_at"],
            "locked_by": period["locked_by"], "lines": lines, "totals": totals}


def update_manual(cur, month: str, staff_id: int, fields: dict, today: date = None) -> dict:
    y, m, first, last = parse_month(month)
    period = _period(cur, month)
    if not period or period["status"] != "draft":
        raise HTTPException(400, "Chỉ sửa được khi bảng lương đang ở trạng thái tạm tính")
    cur.execute("SELECT * FROM payroll_lines WHERE period_id = ? AND staff_id = ?", (period["id"], staff_id))
    if not cur.fetchone():
        raise HTTPException(404, "Nhân viên không có trong bảng lương tháng này")
    sets, vals = [], []
    for k in MANUAL_FIELDS:
        if fields.get(k) is not None:
            sets.append(f"{k} = ?")
            vals.append(float(fields[k]))
    if fields.get("manual_note") is not None:
        sets.append("manual_note = ?")
        vals.append(fields["manual_note"])
    if sets:
        cur.execute(f"UPDATE payroll_lines SET {', '.join(sets)} WHERE period_id = ? AND staff_id = ?", (*vals, period["id"], staff_id))
    return calculate_period(cur, month, today)


def lock_period(cur, month: str, user_name: str) -> dict:
    period = _period(cur, month)
    if not period or period["status"] != "draft":
        raise HTTPException(400, "Chỉ chốt được bảng lương đang tạm tính")
    cur.execute("SELECT COUNT(*) FROM payroll_lines WHERE period_id = ?", (period["id"],))
    if cur.fetchone()[0] == 0:
        raise HTTPException(400, "Bảng lương trống, bấm Tính lương trước")
    cur.execute("SELECT value FROM settings WHERE key = 'hrm_rules'")
    rules = cur.fetchone()
    cur.execute("UPDATE payroll_periods SET status = 'locked', rules_json = ?, locked_at = ?, locked_by = ? WHERE id = ?",
                (rules["value"] if rules else "{}", datetime.now().strftime("%Y-%m-%d %H:%M:%S"), user_name, period["id"]))
    return get_period(cur, month)


def unlock_period(cur, month: str) -> dict:
    period = _period(cur, month)
    if not period or period["status"] != "locked":
        raise HTTPException(400, "Chỉ mở khóa được bảng lương đã chốt và chưa trả")
    cur.execute("SELECT COUNT(*) FROM payroll_lines WHERE period_id = ? AND cashbook_id IS NOT NULL", (period["id"],))
    if cur.fetchone()[0]:
        raise HTTPException(400, "Đã có phiếu chi lương, xóa phiếu chi trước khi mở khóa")
    cur.execute("UPDATE payroll_periods SET status = 'draft', locked_at = NULL, locked_by = NULL WHERE id = ?", (period["id"],))
    return get_period(cur, month)


def pay_period(cur, month: str, account_id: int, staff_ids, user_name: str) -> dict:
    from routers.cashbook import generate_cashbook_code
    period = _period(cur, month)
    if not period or period["status"] not in ("locked", "paid"):
        raise HTTPException(400, "Phải chốt bảng lương trước khi trả")
    cur.execute("SELECT id FROM payment_accounts WHERE id = ? AND is_active = 1", (account_id,))
    if not cur.fetchone():
        raise HTTPException(400, "Tài khoản chi không hợp lệ")
    y, m = int(month[:4]), int(month[5:])
    cur.execute("""SELECT pl.*, s.name FROM payroll_lines pl JOIN staff s ON s.id = pl.staff_id
                   WHERE pl.period_id = ? AND pl.cashbook_id IS NULL AND pl.net_pay > 0""", (period["id"],))
    now = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    paid = 0
    for line in cur.fetchall():
        if staff_ids and line["staff_id"] not in staff_ids:
            continue
        code = generate_cashbook_code(cur, "PC-LG")
        cur.execute("""INSERT INTO cashbook (code, type, category, amount, ref_type, ref_id, note, account_id, fund_source, created_by, created_at)
                       VALUES (?, 'out', ?, ?, 'payroll', ?, ?, ?, 'COMPANY', ?, ?)""",
                    (code, PAYROLL_CATEGORY, line["net_pay"], line["id"], f"Lương {m:02d}/{y} - {line['name']}", account_id, user_name, now))
        cur.execute("UPDATE payroll_lines SET cashbook_id = ?, paid_at = ? WHERE id = ?", (cur.lastrowid, now, line["id"]))
        paid += 1
    cur.execute("SELECT COUNT(*) FROM payroll_lines WHERE period_id = ? AND cashbook_id IS NULL AND net_pay > 0", (period["id"],))
    if cur.fetchone()[0] == 0:
        cur.execute("UPDATE payroll_periods SET status = 'paid' WHERE id = ?", (period["id"],))
    res = get_period(cur, month)
    res["paid_count"] = paid
    return res


def on_cashbook_deleted(cur, voucher_id: int) -> None:
    """Gọi từ delete_cashbook_voucher: hoàn tác phiếu chi lương / tạm ứng."""
    cur.execute("SELECT period_id FROM payroll_lines WHERE cashbook_id = ?", (voucher_id,))
    row = cur.fetchone()
    if row:
        cur.execute("UPDATE payroll_lines SET cashbook_id = NULL, paid_at = NULL WHERE cashbook_id = ?", (voucher_id,))
        cur.execute("UPDATE payroll_periods SET status = 'locked' WHERE id = ? AND status = 'paid'", (row["period_id"],))
    cur.execute("DELETE FROM staff_advances WHERE cashbook_id = ?", (voucher_id,))
