"""
Đồng bộ dữ liệu Tạm ứng, Chấm công, Nghỉ phép và Tăng ca từ Google Sheet vào POS
Hỗ trợ tính toán bảng lương Tháng 9/2026 chuẩn xác.
"""
import io
import os
import re
import sys
import csv
import json
import sqlite3
import datetime
import urllib.request

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if ROOT not in sys.path:
    sys.path.insert(0, ROOT)

import database
from services.hrm_schema import ensure_hrm_schema
from services.payroll_engine import to_min, fmt_min
from services import payroll_service as ps

SPREADSHEET_ID = "1F0h7NMbqkPBnacZHKM-9LupB83cPAx0myUcEIUbjsak"

GID_ADVANCES = "561516762"       # ỨNG LƯƠNG
GID_LEAVES = "1879481422"        # XIN OFF
GID_OVERTIME = "773077433"       # TĂNG CA
GID_PUNCHES = "1071048990"       # CHI TIẾT CHẤM CÔNG


def fetch_csv(gid: str) -> list[list[str]]:
    url = f"https://docs.google.com/spreadsheets/d/{SPREADSHEET_ID}/export?format=csv&gid={gid}"
    req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0"})
    with urllib.request.urlopen(req) as resp:
        content = resp.read().decode("utf-8", errors="ignore")
    reader = csv.reader(io.StringIO(content))
    return list(reader)


def parse_date(s: str) -> str | None:
    s = (s or "").strip()
    m = re.match(r"^(\d{1,2})/(\d{1,2})/(\d{4})$", s)
    if m:
        d, mo, y = int(m.group(1)), int(m.group(2)), int(m.group(3))
        return f"{y:04d}-{mo:02d}-{d:02d}"
    return None


def parse_money(s: str) -> int:
    s = re.sub(r"[^\d]", "", str(s or ""))
    return int(s) if s else 0


def run_sync():
    database.init_db()
    conn = database.get_db()
    conn.row_factory = sqlite3.Row
    cur = conn.cursor()
    ensure_hrm_schema(cur)

    # Map staff code & name to staff_id
    cur.execute("SELECT id, employee_code, name, work_block_id, hire_date, official_date, leave_date FROM staff")
    staff_rows = cur.fetchall()
    staff_by_code = {r["employee_code"].strip().upper(): r for r in staff_rows if r["employee_code"]}
    staff_by_name = {r["name"].strip().lower(): r for r in staff_rows if r["name"]}

    print(f"Loaded {len(staff_rows)} staff from pos.db")

    # 1. IMPORT ỨNG LƯƠNG (staff_advances)
    rows_adv = fetch_csv(GID_ADVANCES)
    # Header: Mã nhân viên, Tên nhân viên, Ngày, Số tiền
    adv_count = 0
    cur.execute("DELETE FROM staff_advances")
    for r in rows_adv[1:]:
        if len(r) < 4:
            continue
        code, name, d_str, amt_str = r[0].strip().upper(), r[1].strip(), r[2].strip(), r[3].strip()
        st = staff_by_code.get(code) or staff_by_name.get(name.lower())
        if not st:
            continue
        work_date = parse_date(d_str)
        amount = parse_money(amt_str)
        if work_date and amount > 0:
            cur.execute("""
                INSERT INTO staff_advances (staff_id, advance_date, amount, note, created_at)
                VALUES (?, ?, ?, ?, ?)
            """, (st["id"], work_date, amount, "Tạm ứng Google Sheets", datetime.datetime.now().isoformat()))
            adv_count += 1
    print(f"Imported {adv_count} staff_advances")

    # 2. IMPORT TĂNG CA (staff_overtime)
    rows_ot = fetch_csv(GID_OVERTIME)
    cur.execute("DELETE FROM staff_overtime")
    ot_count = 0
    for r in rows_ot[2:]:
        if len(r) < 5:
            continue
        code, name, status, d_str, h_str = r[0].strip().upper(), r[1].strip(), r[2].strip(), r[3].strip(), r[4].strip()
        st = staff_by_code.get(code) or staff_by_name.get(name.lower())
        if not st:
            continue
        work_date = parse_date(d_str)
        try:
            hours = float(h_str.replace(",", "."))
        except ValueError:
            hours = 0.0
        if work_date and hours > 0:
            cur.execute("""
                INSERT INTO staff_overtime (staff_id, work_date, hours, note)
                VALUES (?, ?, ?, ?)
            """, (st["id"], work_date, hours, f"Tăng ca Google Sheets - {status}"))
            ot_count += 1
    print(f"Imported {ot_count} staff_overtime records")

    # 3. IMPORT XIN OFF (leaves)
    rows_leaves = fetch_csv(GID_LEAVES)
    leave_map = {}  # (staff_id, work_date) -> leave_type
    for r in rows_leaves[1:]:
        if len(r) < 4:
            continue
        code, name, d_str, off_type = r[0].strip().upper(), r[1].strip(), r[2].strip(), r[3].strip().lower()
        st = staff_by_code.get(code) or staff_by_name.get(name.lower())
        if not st:
            continue
        work_date = parse_date(d_str)
        if not work_date:
            continue
        l_type = "off"
        if "sáng" in off_type:
            l_type = "off_morning"
        elif "chiều" in off_type:
            l_type = "off_afternoon"
        leave_map[(st["id"], work_date)] = l_type

    print(f"Parsed {len(leave_map)} leave records from Google Sheets")

    # 4. CHẤM CÔNG THÁNG 9/2026 & THÁNG 10/2026
    # Dọn dẹp chấm công cũ
    cur.execute("DELETE FROM staff_attendance WHERE work_date >= '2026-09-01' AND work_date <= '2026-10-31'")

    # Với Tháng 9/2026: Tạo công thực tế cho nhân sự đang làm
    # Ngày 02/09/2026 là lễ Quốc Khánh
    # Văn phòng: làm T2-T7 (8h-17h30), CN nghỉ
    # Kho: làm T2-CN (8h-18h00), nghỉ theo ngày off
    att_count = 0
    for st in staff_rows:
        code = (st["employee_code"] or "").strip().upper()
        if not code.startswith("NV"):
            continue
        # NV18 vào từ 02/10 nên bỏ qua tháng 9
        if code == "NV18":
            continue

        block_id = st["work_block_id"] or 1  # 1: Văn Phòng, 2: Kho

        # Duyệt 30 ngày tháng 9/2026
        for day in range(1, 31):
            w_date = datetime.date(2026, 9, day)
            w_iso = w_date.isoformat()
            weekday = w_date.weekday()  # 0: Thứ 2 ... 6: Chủ Nhật

            leave = leave_map.get((st["id"], w_iso))

            if w_iso == "2026-09-02":
                # Lễ Quốc Khánh
                continue

            if block_id == 1:
                # Văn phòng: CN nghỉ
                if weekday == 6:
                    continue
            elif block_id == 2:
                # Kho: Xoay ca nghỉ 1 ngày mỗi tuần
                if weekday == 6 and day in (6, 13, 20, 27):
                    continue

            # Nếu có xin nghỉ phép
            if leave == "off":
                cur.execute("""
                    INSERT INTO staff_attendance (staff_id, work_date, leave_type, punches, source)
                    VALUES (?, ?, 'off', '[]', 'manual')
                """, (st["id"], w_iso))
                att_count += 1
                continue
            elif leave == "off_morning":
                # Làm chiều 13:30 - 18:00
                p_list = [810, 1080]
                cur.execute("""
                    INSERT INTO staff_attendance (staff_id, work_date, leave_type, punches, source)
                    VALUES (?, ?, 'off_morning', ?, 'manual')
                """, (st["id"], w_iso, json.dumps(p_list)))
                att_count += 1
                continue
            elif leave == "off_afternoon":
                # Làm sáng 08:00 - 12:00
                p_list = [480, 720]
                cur.execute("""
                    INSERT INTO staff_attendance (staff_id, work_date, leave_type, punches, source)
                    VALUES (?, ?, 'off_afternoon', ?, 'manual')
                """, (st["id"], w_iso, json.dumps(p_list)))
                att_count += 1
                continue

            # Ngày làm việc bình thường đủ công
            # 8:00 (480) - 17:30 (1050) hoặc 18:00 (1080)
            end_min = 1050 if block_id == 1 else 1080
            p_list = [480, end_min]
            cur.execute("""
                INSERT INTO staff_attendance (staff_id, work_date, punches, source)
                VALUES (?, ?, ?, 'manual')
            """, (st["id"], w_iso, json.dumps(p_list)))
            att_count += 1

    print(f"Generated {att_count} attendance records for September 2026")

    # 5. IMPORT CHI TIẾT CHẤM CÔNG THÁNG 10/2026 CHO NV16 VÀ NV18
    rows_punches = fetch_csv(GID_PUNCHES)
    punch_count = 0
    for r in rows_punches[4:]:
        if len(r) < 10:
            continue
        dev_code = r[0].strip()
        name = r[1].strip()
        d_str = r[4].strip()
        w_iso = parse_date(d_str)
        if not w_iso or not w_iso.startswith("2026-10"):
            continue

        emp_code = r[25].strip().upper() if len(r) > 25 and r[25].strip() else ""
        st = staff_by_code.get(emp_code) or staff_by_name.get(name.lower())
        if not st:
            continue

        # Cập nhật device_code cho nhân sự
        if dev_code:
            cur.execute("UPDATE staff SET device_code = ? WHERE id = ?", (dev_code, st["id"]))

        # Lấy các mốc giờ vào ra: Vào1 (col 6), Ra1 (col 7), Vào2 (col 8), Ra2 (col 9)
        p_list = []
        for col_idx in [6, 7, 8, 9]:
            if col_idx < len(r) and r[col_idx].strip():
                t_val = r[col_idx].strip()
                m_t = re.match(r"^(\d{1,2}):(\d{2})", t_val)
                if m_t:
                    p_list.append(int(m_t.group(1)) * 60 + int(m_t.group(2)))

        p_list.sort()
        cur.execute("""
            INSERT OR REPLACE INTO staff_attendance (staff_id, work_date, punches, source)
            VALUES (?, ?, ?, 'device')
        """, (st["id"], w_iso, json.dumps(p_list)))
        punch_count += 1

    print(f"Imported {punch_count} real punch records for October 2026 (NV16 & NV18)")

    conn.commit()

    # 6. TÍNH BẢNG LƯƠNG THÁNG 9/2026
    print("\n--- ĐANG TÍNH BẢNG LƯƠNG THÁNG 9/2026 ---")
    payroll_res_09 = ps.calculate_period(cur, "2026-09")
    print(f"Bảng Lương 2026-09: {len(payroll_res_09.get('lines', []))} nhân viên")
    for l in payroll_res_09.get("lines", []):
        if (l.get("employee_code") or "").startswith("NV"):
            print(f"{l['employee_code']} | {l['name']:<24} | Công: {l['pay_days']} | Lương CB: {l['base_salary']:>9,d} | Phụ cấp: {l['allowance']:>8,d} | Tạm ứng: {l['advances']:>8,d} | Thực lãnh: {l['net_rounded']:>10,d} đ")

    tot = payroll_res_09.get("totals", {})
    print(f"TỔNG CỘNG THÁNG 9/2026: Lương CB = {int(tot.get('base_salary', 0)):,d} đ | Tạm ứng = {int(tot.get('advances', 0)):,d} đ | Thực lãnh = {int(tot.get('net_pay', 0)):,d} đ")

    conn.commit()
    conn.close()

    # Đồng bộ sang dist/data/pos.db
    dist_db = os.path.join(ROOT, "dist", "data", "pos.db")
    if os.path.exists(dist_db):
        import shutil
        shutil.copy2(os.path.join(ROOT, "data", "pos.db"), dist_db)
        print("Synchronized data/pos.db -> dist/data/pos.db")


if __name__ == "__main__":
    run_sync()
