"""Script import hồ sơ nhân sự & lịch sử điều chỉnh lương từ Google Sheets vào POS SQLite."""
import csv
import io
import os
import re
import sqlite3
import sys
import urllib.request

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if ROOT not in sys.path:
    sys.path.insert(0, ROOT)
DB_PATH = os.path.join(ROOT, "data", "pos.db")
SHEET_ID = "1F0h7NMbqkPBnacZHKM-9LupB83cPAx0myUcEIUbjsak"
GID_STAFF = "1388571444"
GID_ADJUSTMENT = "552844281"


def clean_currency(val):
    if not val:
        return 0.0
    val = val.replace("đ", "").replace("Đ", "").replace(".", "").replace(",", "").strip()
    try:
        return float(val)
    except Exception:
        return 0.0


def parse_vn_date(val):
    if not val:
        return None
    val = val.strip()
    m = re.match(r"^(\d{1,2})/(\d{1,2})/(\d{4})$", val)
    if m:
        d, mon, y = m.groups()
        return f"{int(y):04d}-{int(mon):02d}-{int(d):02d}"
    # Trường hợp đã là YYYY-MM-DD
    if re.match(r"^\d{4}-\d{2}-\d{2}$", val):
        return val
    return None


def fetch_csv(gid):
    url = f"https://docs.google.com/spreadsheets/d/{SHEET_ID}/export?format=csv&gid={gid}"
    req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0"})
    raw = urllib.request.urlopen(req).read().decode("utf-8", errors="ignore")
    return list(csv.reader(io.StringIO(raw)))


def run_import(db_path=DB_PATH):
    print(f"Connecting to database: {db_path}")
    conn = sqlite3.connect(db_path)
    conn.row_factory = sqlite3.Row
    cur = conn.cursor()

    # Đảm bảo schema HRM mới nhất đã được áp dụng
    from services.hrm_schema import ensure_hrm_schema
    ensure_hrm_schema(cur)
    conn.commit()

    # Nạp danh sách khối làm việc
    cur.execute("SELECT id, name FROM hrm_work_blocks")
    block_map = {r["name"].strip().lower(): r["id"] for r in cur.fetchall()}

    # 1. Import Danh Sách Nhân Sự
    print("Fetching 'DANH SÁCH NHÂN SỰ'...")
    staff_rows = fetch_csv(GID_STAFF)
    imported_staff = 0
    updated_staff = 0

    for r in staff_rows[2:]:
        if len(r) < 10 or not r[1].strip().startswith("NV"):
            continue

        emp_code = r[1].strip()
        name = r[2].strip()
        birthday = parse_vn_date(r[3])
        gender = r[4].strip() if len(r) > 4 else None
        work_block_name = r[5].strip() if len(r) > 5 else ""
        work_block_id = block_map.get(work_block_name.lower())
        department = r[6].strip() if len(r) > 6 else ""
        position = r[7].strip() if len(r) > 7 else ""
        phone = re.sub(r"\s+", "", r[8].strip()) if len(r) > 8 else ""
        id_card_num = re.sub(r"\s+", "", r[9].strip()) if len(r) > 9 else ""
        id_card_date = parse_vn_date(r[10]) if len(r) > 10 else None
        id_card_place = r[11].strip() if len(r) > 11 else ""
        permanent_addr = r[12].strip() if len(r) > 12 else ""
        temp_addr = r[13].strip() if len(r) > 13 else ""
        email = r[14].strip() if len(r) > 14 else ""
        bank_acc = r[15].strip() if len(r) > 15 else ""
        bank_name = r[16].strip() if len(r) > 16 else ""
        bank_branch = r[17].strip() if len(r) > 17 else ""
        emergency_phone = re.sub(r"\s+", "", r[18].strip()) if len(r) > 18 else ""
        emergency_rel = r[19].strip() if len(r) > 19 else ""
        hire_date = parse_vn_date(r[20]) if len(r) > 20 else None
        prob_start = parse_vn_date(r[21]) if len(r) > 21 else None
        official_date = parse_vn_date(r[22]) if len(r) > 22 else None
        leave_date = parse_vn_date(r[23]) if len(r) > 23 else None
        base_salary = clean_currency(r[26]) if len(r) > 26 else 0.0
        allowance = clean_currency(r[29]) if len(r) > 29 else 0.0
        status_text = r[33].strip().lower() if len(r) > 33 else "đang làm"
        is_active = 0 if "nghỉ" in status_text else 1

        # Kiểm tra tồn tại qua employee_code hoặc phone/name chưa có code
        cur.execute("SELECT id FROM staff WHERE employee_code = ?", (emp_code,))
        existing = cur.fetchone()
        if not existing and phone:
            cur.execute("SELECT id FROM staff WHERE phone = ? AND (employee_code IS NULL OR employee_code = '')", (phone,))
            existing = cur.fetchone()
        if not existing and name:
            cur.execute("SELECT id FROM staff WHERE LOWER(TRIM(name)) = LOWER(?) AND (employee_code IS NULL OR employee_code = '')", (name.strip(),))
            existing = cur.fetchone()

        if existing:
            sid = existing["id"]
            cur.execute("""
                UPDATE staff SET
                    employee_code = ?,
                    name = ?, phone = ?, birthday = ?, gender = ?,
                    work_block_id = ?, department = ?, position = ?,
                    id_card_number = ?, id_card_date = ?, id_card_place = ?,
                    permanent_address = ?, temporary_address = ?, email = ?,
                    bank_account = ?, bank_name = ?, bank_branch = ?,
                    emergency_phone = ?, emergency_relation = ?,
                    hire_date = ?, probation_start = ?, official_date = ?, leave_date = ?,
                    base_salary = ?, allowance = ?, is_active = ?, is_payroll_staff = 1
                WHERE id = ?
            """, (
                emp_code,
                name, phone, birthday, gender,
                work_block_id, department, position,
                id_card_num, id_card_date, id_card_place,
                permanent_addr, temp_addr, email,
                bank_acc, bank_name, bank_branch,
                emergency_phone, emergency_rel,
                hire_date, prob_start, official_date, leave_date,
                base_salary, allowance, is_active,
                sid
            ))
            updated_staff += 1
        else:
            cur.execute("""
                INSERT INTO staff (
                    employee_code, name, phone, role, is_active,
                    birthday, gender, work_block_id, department, position,
                    id_card_number, id_card_date, id_card_place,
                    permanent_address, temporary_address, email,
                    bank_account, bank_name, bank_branch,
                    emergency_phone, emergency_relation,
                    hire_date, probation_start, official_date, leave_date,
                    base_salary, allowance, commission_rate, is_payroll_staff
                ) VALUES (
                    ?, ?, ?, 'staff', ?,
                    ?, ?, ?, ?, ?,
                    ?, ?, ?,
                    ?, ?, ?,
                    ?, ?, ?,
                    ?, ?,
                    ?, ?, ?, ?,
                    ?, ?, 0, 1
                )
            """, (
                emp_code, name, phone, is_active,
                birthday, gender, work_block_id, department, position,
                id_card_num, id_card_date, id_card_place,
                permanent_addr, temp_addr, email,
                bank_acc, bank_name, bank_branch,
                emergency_phone, emergency_rel,
                hire_date, prob_start, official_date, leave_date,
                base_salary, allowance
            ))
            imported_staff += 1

    conn.commit()
    print(f"-> Staff: {imported_staff} created, {updated_staff} updated.")

    # 2. Import Bảng Điều Chỉnh Lương
    print("Fetching 'ĐIỀU CHỈNH LƯƠNG'...")
    adj_rows = fetch_csv(GID_ADJUSTMENT)
    cur.execute("SELECT id, employee_code FROM staff WHERE employee_code IS NOT NULL")
    staff_code_map = {r["employee_code"].strip().upper(): r["id"] for r in cur.fetchall()}

    imported_adj = 0
    for r in adj_rows[3:]:
        if len(r) < 8 or not r[2].strip().startswith("NV"):
            continue

        dec_date = parse_vn_date(r[1])
        emp_code = r[2].strip().upper()
        adj_type_raw = r[4].strip().lower()
        adj_type = "salary" if "lương" in adj_type_raw else "allowance" if "phụ cấp" in adj_type_raw else "mixed"
        base_delta = clean_currency(r[5])
        allowance_delta = clean_currency(r[6])
        eff_date = parse_vn_date(r[7])
        reason = r[8].strip() if len(r) > 8 else ""

        staff_id = staff_code_map.get(emp_code)
        if not staff_id or not eff_date:
            continue

        # Kiểm tra trùng lặp
        cur.execute("""
            SELECT id FROM hrm_salary_adjustments
            WHERE staff_id = ? AND effective_date = ? AND base_delta = ? AND allowance_delta = ? AND reason = ?
        """, (staff_id, eff_date, base_delta, allowance_delta, reason))
        if not cur.fetchone():
            cur.execute("""
                INSERT INTO hrm_salary_adjustments (
                    staff_id, decision_date, effective_date, adjustment_type,
                    base_delta, allowance_delta, reason, created_by
                ) VALUES (?, ?, ?, ?, ?, ?, ?, 'Import Google Sheet')
            """, (staff_id, dec_date or eff_date, eff_date, adj_type, base_delta, allowance_delta, reason))
            imported_adj += 1

    conn.commit()
    conn.close()
    print(f"-> Adjustments: {imported_adj} new records imported.")
    print("Import completed successfully.")


if __name__ == "__main__":
    run_import()
