import pytest
import sqlite3
from datetime import date
import database
from services.hrm_schema import ensure_hrm_schema
from services.payroll_service import calculate_tenure, compute_staff_virtual_fields


def test_schema_has_full_staff_and_adjustment_columns():
    conn = database.get_db()
    cur = conn.cursor()
    ensure_hrm_schema(cur)

    # Check staff columns
    cur.execute("PRAGMA table_info(staff)")
    staff_cols = {r[1] for r in cur.fetchall()}
    expected_staff_cols = {
        "gender", "department", "id_card_number", "id_card_date", "id_card_place",
        "permanent_address", "temporary_address", "email", "emergency_phone", "emergency_relation"
    }
    missing_staff = expected_staff_cols - staff_cols
    assert not missing_staff, f"Staff thiếu các cột: {missing_staff}"

    # Check hrm_salary_adjustments columns
    cur.execute("PRAGMA table_info(hrm_salary_adjustments)")
    adj_cols = {r[1] for r in cur.fetchall()}
    assert "decision_date" in adj_cols, "hrm_salary_adjustments thiếu decision_date"
    assert "adjustment_type" in adj_cols, "hrm_salary_adjustments thiếu adjustment_type"
    conn.close()


def test_calculate_tenure():
    # Cùng ngày
    assert calculate_tenure("2026-01-01", "2026-01-01") == "0 năm 0 tháng 0 ngày"
    # 1 năm 5 tháng 22 ngày
    assert calculate_tenure("2025-05-02", "2026-10-24") == "1 năm 5 tháng 22 ngày"
    # Chưa nhận việc
    assert calculate_tenure(None) == "—"


def test_compute_staff_virtual_fields():
    conn = database.get_db()
    cur = conn.cursor()

    # Tạo staff test
    cur.execute("DELETE FROM staff WHERE employee_code = 'NV-TEST-PROFILE'")
    cur.execute("""
        INSERT INTO staff (
            name, employee_code, phone, role, base_salary, allowance,
            hire_date, probation_start, official_date, is_active
        ) VALUES (
            'Nguyễn Văn Test', 'NV-TEST-PROFILE', '0912345678', 'staff',
            7000000, 500000, '2025-05-02', '2025-05-02', '2025-05-02', 1
        )
    """)
    staff_id = cur.lastrowid

    # Tạo 2 điều chỉnh lương: 1 cái tháng 7/2025 (+1M), 1 cái tháng 9/2026 (-500k lương, +500k phụ cấp)
    cur.execute("DELETE FROM hrm_salary_adjustments WHERE staff_id = ?", (staff_id,))
    cur.execute("""
        INSERT INTO hrm_salary_adjustments (staff_id, decision_date, effective_date, adjustment_type, base_delta, allowance_delta, reason)
        VALUES (?, '2025-07-01', '2025-07-01', 'salary', 1000000, 0, 'Tăng lương đợt 1')
    """, (staff_id,))
    cur.execute("""
        INSERT INTO hrm_salary_adjustments (staff_id, decision_date, effective_date, adjustment_type, base_delta, allowance_delta, reason)
        VALUES (?, '2026-09-01', '2026-09-01', 'mixed', -500000, 500000, 'Chuyển một phần qua phụ cấp')
    """, (staff_id,))
    conn.commit()

    cur.execute("SELECT * FROM staff WHERE id = ?", (staff_id,))
    staff_row = dict(cur.fetchone())

    # Tính toán tại mốc hôm nay (2026-10-24)
    v_fields = compute_staff_virtual_fields(cur, staff_row, as_of_date=date(2026, 10, 24))

    assert v_fields["tenure"] == "1 năm 5 tháng 22 ngày"
    assert v_fields["contractual_status"] == "Chính thức"
    assert v_fields["total_base_delta"] == 500000.0  # +1M - 500k = +500k
    assert v_fields["total_allowance_delta"] == 500000.0  # +500k
    assert v_fields["base_salary_effective"] == 7500000.0  # 7M + 500k
    assert v_fields["allowance_effective"] == 1000000.0  # 500k + 500k
    assert v_fields["total_salary"] == 8500000.0  # 7.5M + 1M
    assert v_fields["probation_salary_85"] == 6375000.0  # 7.5M * 0.85

    # Dọn dẹp
    cur.execute("DELETE FROM hrm_salary_adjustments WHERE staff_id = ?", (staff_id,))
    cur.execute("DELETE FROM staff WHERE id = ?", (staff_id,))
    conn.commit()
    conn.close()
