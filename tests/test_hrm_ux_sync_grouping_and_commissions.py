"""Kiểm thử toàn diện Plan 2026-11-04:
1. Không phạt Vắng -500k/ngày cho NV cả kỳ chưa có lượt quẹt vân tay; vẫn phạt Vắng khi NV đã hoạt động quẹt thẻ mà tự nghỉ.
2. Ghim cột Bảng Lương + Mở đủ cột Hồ Sơ Nhân Sự kèm API GET/PUT /api/hrm/staff-columns.
3. Lọc theo khoảng ngày (date_from..date_to) + trả đủ staff_name, employee_code, block_name, est_ot_pay, account_name cho Xin Off, Tăng Ca, Tạm Ứng, Đ/C Lương.
4. Hoa hồng POS tự kế thừa % Bộ phận khi mode='dept' & commission_rate=0; tách riêng đơn Admin; Pancake thưởng mốc 120tr = +975.000đ (nền 85% = 5.525.000đ -> 6.500.000đ) và luôn trả tiến độ Đủ/Thiếu.
"""
import json
from pathlib import Path
from bs4 import BeautifulSoup
from fastapi.testclient import TestClient

import database
from server import app
from tests.auth_helpers import owner_auth_headers

ROOT = Path(__file__).resolve().parent.parent
client = TestClient(app, headers=owner_auth_headers())


def test_zero_punch_month_no_absent_penalty_vs_active_staff_absent_penalty():
    conn = database.get_db()
    cur = conn.cursor()
    month = "2025-07"
    try:
        cur.execute("DELETE FROM payroll_periods WHERE month = ?", (month,))
        cur.execute("DELETE FROM staff_attendance WHERE staff_id IN (SELECT id FROM staff WHERE employee_code IN ('TNP01', 'TNP02'))")
        cur.execute("DELETE FROM staff WHERE employee_code IN ('TNP01', 'TNP02')")
        kho_block = cur.execute("SELECT id FROM hrm_work_blocks WHERE name = 'Kho'").fetchone()[0]
        conn.commit()
        conn.close()
        conn = None

        # NV 1: Cả tháng chưa có bất kỳ dữ liệu vân tay nào -> 0 công, 0 phạt, không gạch đỏ absent
        r1 = client.post("/api/hrm/employees", json={
            "name": "NV Chưa Quẹt Vân Tay",
            "employee_code": "TNP01",
            "device_code": "8801",
            "work_block_id": kho_block,
            "base_salary": 6_000_000,
            "hire_date": "2025-01-01",
            "official_date": "2025-03-01",
        })
        assert r1.status_code == 200, r1.text
        sid_no_punch = r1.json()["id"]

        # NV 2: Đã đi làm quẹt thẻ ngày 01/07 nhưng tự ý nghỉ các ngày còn lại -> bị phạt Vắng -500k/ngày
        r2 = client.post("/api/hrm/employees", json={
            "name": "NV Có Quẹt Rồi Tự Nghỉ",
            "employee_code": "TNP02",
            "device_code": "8802",
            "work_block_id": kho_block,
            "base_salary": 6_000_000,
            "hire_date": "2025-01-01",
            "official_date": "2025-03-01",
        })
        assert r2.status_code == 200, r2.text
        sid_active = r2.json()["id"]

        conn2 = database.get_db()
        conn2.execute(
            "INSERT INTO staff_attendance (staff_id, work_date, punches, source) VALUES (?, '2025-07-01', '[\"07:55\", \"18:05\"]', 'device')",
            (sid_active,),
        )
        conn2.commit()
        conn2.close()

        att_res = client.get(f"/api/hrm/attendance?month={month}")
        assert att_res.status_code == 200
        emps = {e["staff_id"]: e for e in att_res.json()["employees"]}

        assert emps[sid_no_punch]["credit"] == 0
        assert emps[sid_no_punch]["penalty"] == 0
        assert all("absent" not in (d.get("violations") or []) for d in emps[sid_no_punch]["days"])

        assert emps[sid_active]["credit"] == 1.0
        assert emps[sid_active]["penalty"] > 0
        assert any("absent" in (d.get("violations") or []) for d in emps[sid_active]["days"])

        calc_res = client.post(f"/api/hrm/payroll/{month}/calculate")
        assert calc_res.status_code == 200
        lines = {l["staff_id"]: l for l in calc_res.json()["lines"]}
        assert lines[sid_no_punch]["penalties"] == 0
        assert lines[sid_no_punch]["net_rounded"] == 0
    finally:
        c_clean = database.get_db()
        c_clean.execute("DELETE FROM payroll_lines WHERE period_id IN (SELECT id FROM payroll_periods WHERE month = ?)", (month,))
        c_clean.execute("DELETE FROM payroll_periods WHERE month = ?", (month,))
        c_clean.execute("DELETE FROM staff_attendance WHERE staff_id IN (SELECT id FROM staff WHERE employee_code IN ('TNP01', 'TNP02'))")
        c_clean.execute("DELETE FROM staff WHERE employee_code IN ('TNP01', 'TNP02')")
        c_clean.commit()
        c_clean.close()
        if conn is not None:
            conn.close()


def test_staff_columns_api_and_subtab_date_range_with_staff_name():
    # 1. GET/PUT /api/hrm/staff-columns
    put_r = client.put("/api/hrm/staff-columns", json={"columns": {"device_code": True, "birthday": True, "address": False}})
    assert put_r.status_code == 200
    get_r = client.get("/api/hrm/staff-columns")
    assert get_r.status_code == 200
    assert get_r.json()["columns"] == {"device_code": True, "birthday": True, "address": False}

    # 2. Tăng Ca, Tạm Ứng, Xin Off, Đ/C Lương trả đủ staff_name + lọc theo date_from..date_to
    conn = database.get_db()
    cur = conn.cursor()
    try:
        cur.execute("DELETE FROM payroll_periods WHERE month IN ('2025-08', '2025-09')")
        cur.execute("DELETE FROM staff WHERE employee_code = 'TGRP01'")
        kho_block = cur.execute("SELECT id FROM hrm_work_blocks WHERE name = 'Kho'").fetchone()[0]
        acc_row = cur.execute("SELECT id, name FROM payment_accounts WHERE is_active = 1 ORDER BY id LIMIT 1").fetchone()
        conn.commit()
        conn.close()
        conn = None

        emp_r = client.post("/api/hrm/employees", json={
            "name": "Trần Văn Kiểm Thử",
            "employee_code": "TGRP01",
            "work_block_id": kho_block,
            "department": "Kho",
            "position": "Nhân viên kho",
            "base_salary": 8_200_000,
            "hire_date": "2025-01-01",
            "official_date": "2025-02-01",
        })
        assert emp_r.status_code == 200
        sid = emp_r.json()["id"]

        assert client.post("/api/hrm/overtime", json={"staff_id": sid, "work_date": "2025-08-15", "hours": 2.0, "note": "OT kiểm kho"}).status_code == 200
        assert client.post("/api/hrm/advances", json={
            "staff_id": sid,
            "advance_date": "2025-09-05",
            "amount": 1_000_000,
            "account_id": acc_row["id"] if acc_row else None,
            "note": "Ứng đợt 1",
        }).status_code == 200
        assert client.post("/api/hrm/leaves", json={"staff_id": sid, "work_date": "2025-08-20", "leave_type": "off_morning", "reason": "Việc riêng"}).status_code == 200

        # Truy vấn xuyên 2 tháng bằng date_from..date_to
        ot_rows = client.get("/api/hrm/overtime?date_from=2025-08-01&date_to=2025-09-30").json()
        my_ot = [x for x in ot_rows if x["staff_id"] == sid]
        assert len(my_ot) == 1
        assert my_ot[0]["staff_name"] == "Trần Văn Kiểm Thử"
        assert my_ot[0]["employee_code"] == "TGRP01"
        assert my_ot[0]["est_ot_pay"] > 0

        adv_rows = client.get("/api/hrm/advances?date_from=2025-08-01&date_to=2025-09-30").json()
        my_adv = [x for x in adv_rows if x["staff_id"] == sid]
        assert len(my_adv) == 1
        assert my_adv[0]["staff_name"] == "Trần Văn Kiểm Thử"
        assert my_adv[0]["employee_code"] == "TGRP01"
        assert my_adv[0]["base_salary_effective"] == 8_200_000
        if acc_row:
            assert my_adv[0]["account_name"] == acc_row["name"]

        lv_rows = client.get("/api/hrm/leaves?date_from=2025-08-01&date_to=2025-09-30").json()
        my_lv = [x for x in lv_rows if x["staff_id"] == sid]
        assert len(my_lv) == 1
        assert my_lv[0]["staff_name"] == "Trần Văn Kiểm Thử"
        assert my_lv[0]["employee_code"] == "TGRP01"
    finally:
        c2 = database.get_db()
        c2.execute("DELETE FROM cashbook WHERE ref_type = 'salary_advance' AND note LIKE '%Trần Văn Kiểm Thử%'")
        c2.execute("DELETE FROM staff_advances WHERE staff_id IN (SELECT id FROM staff WHERE employee_code = 'TGRP01')")
        c2.execute("DELETE FROM staff_overtime WHERE staff_id IN (SELECT id FROM staff WHERE employee_code = 'TGRP01')")
        c2.execute("DELETE FROM staff_leaves WHERE staff_id IN (SELECT id FROM staff WHERE employee_code = 'TGRP01')")
        c2.execute("DELETE FROM staff_attendance WHERE staff_id IN (SELECT id FROM staff WHERE employee_code = 'TGRP01')")
        c2.execute("DELETE FROM staff WHERE employee_code = 'TGRP01'")
        c2.commit()
        c2.close()
        if conn is not None:
            conn.close()


def test_dept_pos_rate_inheritance_admin_split_and_pancake_975k_progress():
    conn = database.get_db()
    cur = conn.cursor()
    acc_id = None
    try:
        cur.execute("DELETE FROM orders WHERE code IN ('HD-TKP-STAFF', 'HD-TKP-ADMIN')")
        cur.execute("DELETE FROM marketplace_orders WHERE order_sn IN ('PCTKP-LOW', 'PCTKP-HIGH')")
        cur.execute("DELETE FROM marketplace_accounts WHERE shop_name = 'Shop Pancake Test KPI'")
        cur.execute("DELETE FROM pancake_sellers WHERE seller_name = 'Thùy Dương Test'")
        cur.execute("DELETE FROM staff WHERE employee_code = 'TKP17'")

        cur.execute(
            "INSERT INTO marketplace_accounts (platform, shop_name, cookies, extra_config) VALUES ('pancake', 'Shop Pancake Test KPI', 'k', ?)",
            (json.dumps({"shop_id": "99917"}),),
        )
        acc_id = cur.lastrowid

        # Tạo NV17 giả lập giống hệt dữ liệu Google Sheet: department='Kinh doanh', base_salary=5.525.000 (85%), commission_rate=0, mode='dept'
        cur.execute("""
            INSERT INTO staff (name, employee_code, role, department, position, base_salary, commission_rate, commission_policy_mode, enable_tmdt_commission, is_active, is_payroll_staff)
            VALUES ('Thùy Dương Test KPI', 'TKP17', 'staff', 'Kinh doanh', 'Digital Marketing', 5525000, 0, 'dept', 1, 1, 1)
        """)
        sid = cur.lastrowid

        admin_row = cur.execute("SELECT id FROM staff WHERE COALESCE(is_payroll_staff, 1) = 0 ORDER BY id LIMIT 1").fetchone()
        admin_id = admin_row[0] if admin_row else None

        # Đơn POS của nhân viên (10.000.000đ -> kế thừa 2% của Sales Online & TMĐT = 200.000đ)
        cur.execute("""
            INSERT INTO orders (code, staff_id, total_amount, discount, final_amount, paid_amount, debt_amount, status, created_at)
            VALUES ('HD-TKP-STAFF', ?, 10000000, 0, 10000000, 10000000, 0, 'Đã thanh toán', '2025-06-10 03:00:00')
        """, (sid,))
        if admin_id:
            cur.execute("""
                INSERT INTO orders (code, staff_id, total_amount, discount, final_amount, paid_amount, debt_amount, status, created_at)
                VALUES ('HD-TKP-ADMIN', ?, 25000000, 0, 25000000, 25000000, 0, 'Đã thanh toán', '2025-06-11 03:00:00')
            """, (admin_id,))

        # Gán nick Pancake 'Thùy Dương Test' -> sid, tháng 06/2025 mới đạt 78.500.000đ (< 120.000.000đ)
        cur.execute("INSERT INTO pancake_sellers (seller_name, staff_id, rules_json) VALUES ('Thùy Dương Test', ?, NULL)", (sid,))
        cur.execute("""
            INSERT INTO marketplace_orders (platform, account_id, order_sn, order_status, order_date, total_amount, shipping_fee, net_payout, seller_name)
            VALUES ('pancake', ?, 'PCTKP-LOW', 'Đã giao', '2025-06-15 10:00:00', 78500000, 0, 78500000, 'Thùy Dương Test')
        """, (acc_id,))
        conn.commit()
        conn.close()
        conn = None

        r_low = client.get("/api/hrm/commissions/2025-06")
        assert r_low.status_code == 200, r_low.text
        body_low = r_low.json()
        if admin_id:
            assert body_low["summary"]["admin_pos_net"] >= 25_000_000
            assert body_low["summary"]["admin_pos_orders"] >= 1

        it_low = [x for x in body_low["items"] if x["staff_id"] == sid][0]
        assert it_low["commission_rate"] == 2.0
        assert it_low["pos_commission"] == 200_000
        assert it_low["pancake_assigned"] is True
        assert it_low["pancake_revenue"] == 78_500_000
        assert it_low["pancake_threshold"] == 120_000_000
        assert it_low["pancake_achieved"] is False
        assert it_low["pancake_shortfall"] == 41_500_000
        assert it_low["pancake_commission"] == 0

        # Thêm đơn Pancake để tháng 06/2025 đạt 150.000.000đ (vượt 30tr x 2.5% = 750k + thưởng đạt mốc 975k = 1.725.000đ)
        c_up = database.get_db()
        c_up.execute("""
            INSERT INTO marketplace_orders (platform, account_id, order_sn, order_status, order_date, total_amount, shipping_fee, net_payout, seller_name)
            VALUES ('pancake', ?, 'PCTKP-HIGH', 'Đã giao', '2025-06-20 10:00:00', 71500000, 0, 71500000, 'Thùy Dương Test')
        """, (acc_id,))
        c_up.commit()
        c_up.close()

        r_high = client.get("/api/hrm/commissions/2025-06")
        assert r_high.status_code == 200
        it_high = [x for x in r_high.json()["items"] if x["staff_id"] == sid][0]
        assert it_high["pancake_revenue"] == 150_000_000
        assert it_high["pancake_achieved"] is True
        assert it_high["pancake_shortfall"] == 0
        assert it_high["pancake_over_amount"] == 30_000_000
        assert it_high["pancake_bonus"] == 975_000
        assert it_high["pancake_tier_commission"] == 750_000
        assert it_high["pancake_commission"] == 1_725_000
        assert 5_525_000 + it_high["pancake_bonus"] == 6_500_000
    finally:
        if conn is not None:
            conn.close()
        c_clean = database.get_db()
        c_clean.execute("DELETE FROM orders WHERE code IN ('HD-TKP-STAFF', 'HD-TKP-ADMIN')")
        c_clean.execute("DELETE FROM marketplace_orders WHERE order_sn IN ('PCTKP-LOW', 'PCTKP-HIGH')")
        c_clean.execute("DELETE FROM marketplace_accounts WHERE shop_name = 'Shop Pancake Test KPI'")
        c_clean.execute("DELETE FROM pancake_sellers WHERE seller_name = 'Thùy Dương Test'")
        c_clean.execute("DELETE FROM staff WHERE employee_code = 'TKP17'")
        c_clean.commit()
        c_clean.close()


def test_hrm_and_pancake_ui_markup_and_readonly_matrix():
    html = (ROOT / "templates" / "index.html").read_text(encoding="utf-8")
    hrm_js = (ROOT / "static" / "js" / "modules" / "hrm.js").read_text(encoding="utf-8")
    mkt_js = (ROOT / "static" / "js" / "modules" / "marketplace.js").read_text(encoding="utf-8")
    soup = BeautifulSoup(html, "html.parser")

    # 1. Ô 'Ẩn NV không có hoa hồng' KHÔNG được tích mặc định
    hide_zero = soup.find(id="hrm-comm-hide-zero")
    assert hide_zero is not None
    assert not hide_zero.has_attr("checked")

    # 2. Thanh kỳ thời gian dùng chung ở cả HRM & Pancake + Popover cột Nhân Sự + tfoot 4 bảng phụ
    for dom_id in (
        "btn-hrm-period-this", "btn-hrm-period-prev", "btn-hrm-period-range",
        "hrm-date-from", "hrm-date-to",
        "pc-period-this-month", "pc-period-prev-month", "pc-period-custom",
        "hrm-staff-cols-popover", "hrm-staff-cols-list", "table-hrm-staff-head",
        "table-hrm-leaves-foot", "table-hrm-overtime-foot", "table-hrm-advances-foot", "table-hrm-adjustments-foot",
    ):
        assert soup.find(id=dom_id) is not None, f"Missing #{dom_id}"

    # 3. Lưới tháng Chấm Công khóa click sửa tay (không gọi openHrmEditDayModal trong renderAttendanceMatrix)
    matrix_fn_segment = hrm_js.split("function renderAttendanceMatrix(data)")[1].split("window.uploadAttendanceExcel")[0]
    assert "openHrmEditDayModal" not in matrix_fn_segment
    assert "bg-rose-100" in matrix_fn_segment
    assert "sticky left-[66px]" in matrix_fn_segment

    # 4. Sticky left trên Bảng Lương & Nhân Sự + tiến độ Đủ/Thiếu trên Hoa Hồng & đồng bộ Pancake
    assert "sticky left-[110px]" in hrm_js
    assert "sticky left-[72px]" in hrm_js
    assert "Chưa đủ mốc · Thiếu" in hrm_js
    assert "window.syncPancakeFromHrmPeriod" in mkt_js
    assert "window.syncHrmPeriodFromPancake" in hrm_js
