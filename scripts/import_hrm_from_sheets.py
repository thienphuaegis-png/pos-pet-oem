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
DEFAULT_SHEET_URL = f"https://docs.google.com/spreadsheets/d/{SHEET_ID}/edit"
GID_STAFF = "1388571444"
GID_ADJUSTMENT = "552844281"
GID_PUNCHES = "1071048990"


def extract_sheet_id(url_or_id: str) -> str:
    s = (url_or_id or "").strip()
    if not s:
        return SHEET_ID
    m = re.search(r"/spreadsheets/d/([a-zA-Z0-9_-]+)", s)
    if m:
        return m.group(1)
    if re.match(r"^[a-zA-Z0-9_-]{20,}$", s):
        return s
    return SHEET_ID


def clean_currency(val):
    if val is None or val == "":
        return 0.0
    if isinstance(val, (int, float)):
        return float(val)
    s = str(val).replace("đ", "").replace("Đ", "").replace(".", "").replace(",", "").strip()
    try:
        return float(s)
    except Exception:
        return 0.0


def clean_phone(val) -> str:
    if val is None or val == "":
        return ""
    if isinstance(val, float) and val.is_integer():
        val = int(val)
    s = re.sub(r"\.0$", "", str(val).strip())
    digits = re.sub(r"\D", "", s)
    if len(digits) == 9 and digits[0] in "35789":
        digits = "0" + digits
    return digits


def clean_cccd(val) -> str:
    if val is None or val == "":
        return ""
    if isinstance(val, float) and val.is_integer():
        val = int(val)
    s = re.sub(r"\.0$", "", str(val).strip())
    digits = re.sub(r"\D", "", s)
    if len(digits) == 11:
        digits = "0" + digits
    return digits


def parse_vn_date(val):
    if not val:
        return None
    if hasattr(val, "strftime"):
        return val.strftime("%Y-%m-%d")
    val = str(val).strip()
    m = re.match(r"^(\d{1,2})/(\d{1,2})/(\d{4})$", val)
    if m:
        d, mon, y = m.groups()
        return f"{int(y):04d}-{int(mon):02d}-{int(d):02d}"
    if re.match(r"^\d{4}-\d{2}-\d{2}", val):
        return val[:10]
    return None


def fetch_csv(gid, sheet_id=SHEET_ID):
    url = f"https://docs.google.com/spreadsheets/d/{sheet_id}/export?format=csv&gid={gid}"
    req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0"})
    raw = urllib.request.urlopen(req, timeout=20).read().decode("utf-8", errors="ignore")
    return list(csv.reader(io.StringIO(raw)))


def _cell_str(row, idx) -> str:
    if idx >= len(row) or row[idx] is None:
        return ""
    v = row[idx]
    if isinstance(v, float) and v.is_integer():
        v = int(v)
    return str(v).strip()


def import_hrm_rows_to_db(cur, staff_rows, adj_rows=None, punch_rows=None):
    """Đồng bộ danh sách nhân sự, điều chỉnh lương và mã máy vân tay vào DB cursor."""
    from services.hrm_schema import ensure_hrm_schema
    ensure_hrm_schema(cur)

    cur.execute("SELECT id, name FROM hrm_work_blocks")
    block_map = {r["name"].strip().lower(): r["id"] for r in cur.fetchall()}

    # Quét mã máy chấm công từ tab CHI TIẾT CHẤM CÔNG (nếu có)
    device_code_by_emp = {}
    device_code_by_name = {}
    if punch_rows:
        for r in punch_rows[4:]:
            if not r or len(r) < 2:
                continue
            dev_raw = re.sub(r"\.0$", "", _cell_str(r, 0))
            if not dev_raw or not dev_raw.isdigit():
                continue
            p_name = _cell_str(r, 1).lower()
            p_emp = _cell_str(r, 25).upper()
            if p_emp.startswith("NV"):
                device_code_by_emp[p_emp] = dev_raw
            if p_name:
                device_code_by_name[p_name] = dev_raw

    imported_staff = 0
    updated_staff = 0
    touched_ids = []

    for r in staff_rows[2:]:
        if not r or len(r) < 10:
            continue
        emp_code = _cell_str(r, 1).upper()
        if not emp_code.startswith("NV"):
            continue

        name = _cell_str(r, 2)
        if not name:
            continue
        birthday = parse_vn_date(r[3] if len(r) > 3 else None)
        gender = _cell_str(r, 4) or None
        block_col_f = _cell_str(r, 5)
        att_type_col_ai = _cell_str(r, 34)
        work_block_id = (
            block_map.get(att_type_col_ai.lower())
            or block_map.get(block_col_f.lower())
            or 1
        )
        department = _cell_str(r, 6)
        position = _cell_str(r, 7)
        phone = clean_phone(r[8] if len(r) > 8 else None)
        id_card_num = clean_cccd(r[9] if len(r) > 9 else None)
        id_card_date = parse_vn_date(r[10] if len(r) > 10 else None)
        id_card_place = _cell_str(r, 11)
        permanent_addr = _cell_str(r, 12)
        temp_addr = _cell_str(r, 13)
        email = _cell_str(r, 14)
        bank_acc = re.sub(r"\s+", "", _cell_str(r, 15))
        bank_name = _cell_str(r, 16)
        bank_branch = _cell_str(r, 17)
        emergency_phone = clean_phone(r[18] if len(r) > 18 else None)
        emergency_rel = _cell_str(r, 19)
        hire_date = parse_vn_date(r[20] if len(r) > 20 else None)
        prob_start = parse_vn_date(r[21] if len(r) > 21 else None)
        official_date = parse_vn_date(r[22] if len(r) > 22 else None)
        leave_date = parse_vn_date(r[23] if len(r) > 23 else None)
        base_salary = clean_currency(r[26] if len(r) > 26 else 0)
        allowance = clean_currency(r[29] if len(r) > 29 else 0)
        status_text = _cell_str(r, 33).lower() or "đang làm"
        is_active = 0 if "nghỉ" in status_text else 1

        dev_code = device_code_by_emp.get(emp_code) or device_code_by_name.get(name.lower())

        cur.execute("SELECT id, device_code FROM staff WHERE UPPER(employee_code) = ?", (emp_code,))
        existing = cur.fetchone()
        if not existing and phone:
            cur.execute("SELECT id, device_code FROM staff WHERE phone = ? AND (employee_code IS NULL OR employee_code = '')", (phone,))
            existing = cur.fetchone()
        if not existing and name:
            cur.execute("SELECT id, device_code FROM staff WHERE LOWER(TRIM(name)) = LOWER(?) AND (employee_code IS NULL OR employee_code = '')", (name.strip(),))
            existing = cur.fetchone()

        final_dev_code = dev_code
        if final_dev_code:
            cur.execute("SELECT id FROM staff WHERE device_code = ?", (final_dev_code,))
            conflict = cur.fetchone()
            if conflict and (not existing or conflict["id"] != existing["id"]):
                final_dev_code = existing["device_code"] if existing else None
        elif existing:
            final_dev_code = existing["device_code"]

        if existing:
            sid = existing["id"]
            cur.execute("""
                UPDATE staff SET
                    employee_code = ?,
                    device_code = COALESCE(?, device_code),
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
                emp_code, final_dev_code,
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
            touched_ids.append(sid)
        else:
            cur.execute("""
                INSERT INTO staff (
                    employee_code, device_code, name, phone, role, is_active,
                    birthday, gender, work_block_id, department, position,
                    id_card_number, id_card_date, id_card_place,
                    permanent_address, temporary_address, email,
                    bank_account, bank_name, bank_branch,
                    emergency_phone, emergency_relation,
                    hire_date, probation_start, official_date, leave_date,
                    base_salary, allowance, commission_rate, is_payroll_staff
                ) VALUES (
                    ?, ?, ?, ?, 'staff', ?,
                    ?, ?, ?, ?, ?,
                    ?, ?, ?,
                    ?, ?, ?,
                    ?, ?, ?,
                    ?, ?,
                    ?, ?, ?, ?,
                    ?, ?, 0, 1
                )
            """, (
                emp_code, final_dev_code, name, phone, is_active,
                birthday, gender, work_block_id, department, position,
                id_card_num, id_card_date, id_card_place,
                permanent_addr, temp_addr, email,
                bank_acc, bank_name, bank_branch,
                emergency_phone, emergency_rel,
                hire_date, prob_start, official_date, leave_date,
                base_salary, allowance
            ))
            imported_staff += 1
            touched_ids.append(cur.lastrowid)

    imported_adj = 0
    if adj_rows:
        cur.execute("SELECT id, employee_code FROM staff WHERE employee_code IS NOT NULL")
        staff_code_map = {r["employee_code"].strip().upper(): r["id"] for r in cur.fetchall()}

        for r in adj_rows[3:]:
            if not r or len(r) < 8:
                continue
            emp_code = _cell_str(r, 2).upper()
            if not emp_code.startswith("NV"):
                continue

            dec_date = parse_vn_date(r[1] if len(r) > 1 else None)
            adj_type_raw = _cell_str(r, 4).lower()
            adj_type = "salary" if "lương" in adj_type_raw else "allowance" if "phụ cấp" in adj_type_raw else "mixed"
            base_delta = clean_currency(r[5] if len(r) > 5 else 0)
            allowance_delta = clean_currency(r[6] if len(r) > 6 else 0)
            eff_date = parse_vn_date(r[7] if len(r) > 7 else None)
            reason = _cell_str(r, 8)

            staff_id = staff_code_map.get(emp_code)
            if not staff_id or not eff_date:
                continue

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

    return {
        "imported_staff": imported_staff,
        "updated_staff": updated_staff,
        "imported_adjustments": imported_adj,
        "touched_ids": touched_ids,
    }


def fetch_and_import_from_google_sheet(cur, sheet_url_or_id: str = None):
    """Tải workbook .xlsx (hoặc fallback CSV) từ Google Sheet và đồng bộ vào DB."""
    import openpyxl
    sid = extract_sheet_id(sheet_url_or_id)
    xlsx_url = f"https://docs.google.com/spreadsheets/d/{sid}/export?format=xlsx"
    staff_rows, adj_rows, punch_rows = None, None, None

    try:
        req = urllib.request.Request(xlsx_url, headers={"User-Agent": "Mozilla/5.0"})
        content = urllib.request.urlopen(req, timeout=25).read()
        wb = openpyxl.load_workbook(io.BytesIO(content), data_only=True, read_only=True)
        sheet_lookup = {name.strip().upper(): name for name in wb.sheetnames}

        for k, real_name in sheet_lookup.items():
            if "DANH SÁCH NHÂN SỰ" in k or "NHÂN SỰ" in k:
                staff_rows = list(wb[real_name].iter_rows(values_only=True))
            elif "ĐIỀU CHỈNH LƯƠNG" in k:
                adj_rows = list(wb[real_name].iter_rows(values_only=True))
            elif "CHI TIẾT CHẤM CÔNG" in k:
                punch_rows = list(wb[real_name].iter_rows(values_only=True))
    except Exception:
        staff_rows = fetch_csv(GID_STAFF, sid)
        try:
            adj_rows = fetch_csv(GID_ADJUSTMENT, sid)
        except Exception:
            adj_rows = []
        try:
            punch_rows = fetch_csv(GID_PUNCHES, sid)
        except Exception:
            punch_rows = []

    if not staff_rows:
        raise ValueError("Không tìm thấy tab 'DANH SÁCH NHÂN SỰ' trong Google Sheet")

    res = import_hrm_rows_to_db(cur, staff_rows, adj_rows, punch_rows)
    res["sheet_id"] = sid
    return res


def run_import(db_path=DB_PATH):
    print(f"Connecting to database: {db_path}")
    conn = sqlite3.connect(db_path)
    conn.row_factory = sqlite3.Row
    cur = conn.cursor()
    res = fetch_and_import_from_google_sheet(cur, SHEET_ID)
    conn.commit()
    conn.close()
    print(f"-> Staff: {res['imported_staff']} created, {res['updated_staff']} updated.")
    print(f"-> Adjustments: {res['imported_adjustments']} new records imported.")
    print("Import completed successfully.")
    return res


if __name__ == "__main__":
    run_import()
