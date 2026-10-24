"""Tests for Month Selector Variant B, Tab Xin Off (CRUD + Google Sheets sync),
and 6-column punch recognition with leave rules.
"""
from datetime import date
from decimal import Decimal
import io
import unittest.mock as mock
import pytest
from bs4 import BeautifulSoup
from fastapi.testclient import TestClient

import database
from server import app
from services.hrm_schema import ensure_hrm_schema
from services.payroll_engine import (
    Block, Rules, DayInput, classify_day, parse_punches
)
from tests.auth_helpers import owner_auth_headers

client = TestClient(app, headers=owner_auth_headers())
KHO = Block("Kho", start=480, end=1080, lunch=90, std_hours=8.5, off_sunday=False, monthly_off_days=2, split=720)
VP = Block("Văn Phòng", start=480, end=1050, lunch=90, std_hours=8.0, off_sunday=True, monthly_off_days=0, split=720)
R = Rules()


def _db():
    conn = database.get_db()
    ensure_hrm_schema(conn.cursor())
    conn.commit()
    return conn


@pytest.fixture
def sample_staff():
    conn = _db()
    cur = conn.cursor()
    cur.execute("DELETE FROM staff_leaves WHERE work_date LIKE '2025-05-%'")
    cur.execute("DELETE FROM staff_attendance WHERE work_date LIKE '2025-05-%'")
    cur.execute("DELETE FROM payroll_periods WHERE month = '2025-05'")
    cur.execute("DELETE FROM staff WHERE employee_code = 'TEST_OFF_01'")
    kho_id = cur.execute("SELECT id FROM hrm_work_blocks WHERE name='Kho'").fetchone()[0]
    cur.execute("""
        INSERT INTO staff (name, employee_code, work_block_id, base_salary, hire_date, official_date, is_active, role)
        VALUES ('Nguyễn Văn Nghỉ Phép', 'TEST_OFF_01', ?, 8000000, '2025-01-01', '2025-02-01', 1, 'staff')
    """, (kho_id,))
    staff_id = cur.lastrowid
    conn.commit()
    conn.close()

    yield staff_id

    conn = _db()
    cur = conn.cursor()
    cur.execute("DELETE FROM staff_leaves WHERE staff_id = ?", (staff_id,))
    cur.execute("DELETE FROM staff_attendance WHERE staff_id = ?", (staff_id,))
    cur.execute("DELETE FROM payroll_periods WHERE month = '2025-05'")
    cur.execute("DELETE FROM staff WHERE id = ?", (staff_id,))
    conn.commit()
    conn.close()


# ── 1. Engine Tests: classify_day() ──

def test_classify_day_off_full():
    inp = DayInput(work_date=date(2025, 5, 2), leave="off")
    res = classify_day(inp, KHO, R)
    assert res.code == "OFF"
    assert res.penalty == 0
    assert "absent" not in res.violations


def test_classify_day_off_morning_single_punch_early():
    # 13:30 = 810 <= 930 -> cin = 810, cout = None
    inp = DayInput(work_date=date(2025, 5, 5), punches=[810], leave="off_morning")
    res = classify_day(inp, KHO, R)
    assert res.check_in == 810
    assert res.check_out is None
    assert res.credit == 0.5
    assert res.code == "X/2"
    assert res.penalty == 0  # missing_out suppressed
    assert "missing_out" not in res.violations


def test_classify_day_off_morning_single_punch_late():
    # 18:00 = 1080 > 930 -> cin = None, cout = 1080
    inp = DayInput(work_date=date(2025, 5, 6), punches=[1080], leave="off_morning")
    res = classify_day(inp, KHO, R)
    assert res.check_in is None
    assert res.check_out == 1080
    assert res.credit == 0.5
    assert res.code == "X/2"
    assert res.penalty == 0  # missing_in suppressed
    assert "missing_in" not in res.violations


def test_classify_day_off_morning_probation():
    inp = DayInput(work_date=date(2025, 5, 7), punches=[810], leave="off_morning", probation=True)
    res = classify_day(inp, KHO, R)
    assert res.credit == 0.5
    assert res.code == "TV/2"
    assert res.penalty == 0


def test_classify_day_off_morning_no_punches_suppresses_absent():
    inp = DayInput(work_date=date(2025, 5, 8), punches=[], leave="off_morning")
    res = classify_day(inp, KHO, R)
    assert res.penalty == 0  # absent penalty waived/suppressed


def test_classify_day_off_afternoon_single_punch_early():
    # 08:00 = 480 < 630 -> cin = 480, cout = None
    inp = DayInput(work_date=date(2025, 5, 9), punches=[480], leave="off_afternoon")
    res = classify_day(inp, KHO, R)
    assert res.check_in == 480
    assert res.check_out is None
    assert res.credit == 0.5
    assert res.code == "X/2"
    assert res.penalty == 0  # missing_out suppressed
    assert "missing_out" not in res.violations


def test_classify_day_off_afternoon_single_punch_late():
    # 12:00 = 720 >= 630 -> cin = None, cout = 720
    inp = DayInput(work_date=date(2025, 5, 10), punches=[720], leave="off_afternoon")
    res = classify_day(inp, KHO, R)
    assert res.check_in is None
    assert res.check_out == 720
    assert res.credit == 0.5
    assert res.code == "X/2"
    # End is 720, so cout >= end -> no early penalty
    assert res.early_min == 0
    assert "early" not in res.violations


def test_classify_day_off_afternoon_full_morning_shift():
    # Worked 08:00 to 12:00
    inp = DayInput(work_date=date(2025, 5, 12), punches=[480, 720], leave="off_afternoon")
    res = classify_day(inp, KHO, R)
    assert res.credit == 0.5
    assert res.code == "X/2"
    assert res.penalty == 0
    assert res.early_min == 0
    assert "early" not in res.violations


# ── 2. Schema & CRUD API Tests ──

def test_staff_leaves_schema_exists():
    conn = _db()
    cur = conn.cursor()
    cur.execute("SELECT name FROM sqlite_master WHERE type='table' AND name='staff_leaves'")
    assert cur.fetchone() is not None
    conn.close()


def test_api_leaves_crud(sample_staff):
    sid = sample_staff
    work_date = "2025-05-15"

    # Create leave
    res = client.post("/api/hrm/leaves", json={
        "staff_id": sid,
        "work_date": work_date,
        "leave_type": "off_morning",
        "reason": "Việc gia đình",
        "approved_by": "Quản lý"
    })
    assert res.status_code == 200, res.text
    data = res.json()
    assert data["staff_id"] == sid
    assert data["leave_type"] == "off_morning"
    leave_id = data["id"]

    # Verify sync to staff_attendance
    conn = _db()
    cur = conn.cursor()
    cur.execute("SELECT leave_type, waive, note FROM staff_attendance WHERE staff_id = ? AND work_date = ?", (sid, work_date))
    att = cur.fetchone()
    assert att is not None
    assert att["leave_type"] == "off_morning"
    assert att["waive"] == 1
    assert "Việc gia đình" in (att["note"] or "")
    conn.close()

    # List leaves by month
    res_list = client.get("/api/hrm/leaves?month=2025-05")
    assert res_list.status_code == 200
    leaves = res_list.json()
    assert any(l["id"] == leave_id for l in leaves)

    # Delete leave
    res_del = client.delete(f"/api/hrm/leaves/{leave_id}")
    assert res_del.status_code == 200

    # Verify reverted in staff_attendance
    conn = _db()
    cur = conn.cursor()
    cur.execute("SELECT leave_type FROM staff_attendance WHERE staff_id = ? AND work_date = ?", (sid, work_date))
    att_after = cur.fetchone()
    assert att_after["leave_type"] is None
    conn.close()


def test_api_leaves_sync_sheets(sample_staff):
    sid = sample_staff
    csv_mock = (
        "Mã nhân viên,Tên nhân viên,Ngày,Off\n"
        "TEST_OFF_01,Nguyễn Văn Nghỉ Phép,20/05/2025,Off Sáng\n"
        "TEST_OFF_01,Nguyễn Văn Nghỉ Phép,21/05/2025,Off Chiều\n"
        "TEST_OFF_01,Nguyễn Văn Nghỉ Phép,22/05/2025,Off\n"
    )

    class MockResp:
        def read(self):
            return csv_mock.encode("utf-8")
        def __enter__(self):
            return self
        def __exit__(self, *args):
            pass

    with mock.patch("urllib.request.urlopen", return_value=MockResp()):
        res = client.post("/api/hrm/leaves/sync-sheets")
        assert res.status_code == 200
        data = res.json()
        assert data["ok"] is True
        assert data["synced_count"] == 3

    conn = _db()
    cur = conn.cursor()
    cur.execute("SELECT work_date, leave_type FROM staff_leaves WHERE staff_id = ? ORDER BY work_date", (sid,))
    rows = cur.fetchall()
    assert len(rows) == 3
    assert rows[0]["leave_type"] == "off_morning"
    assert rows[1]["leave_type"] == "off_afternoon"
    assert rows[2]["leave_type"] == "off"

    # Also verify synced to attendance
    cur.execute("SELECT work_date, leave_type, waive FROM staff_attendance WHERE staff_id = ? ORDER BY work_date", (sid,))
    att_rows = cur.fetchall()
    assert len(att_rows) == 3
    assert att_rows[0]["leave_type"] == "off_morning" and att_rows[0]["waive"] == 1
    assert att_rows[1]["leave_type"] == "off_afternoon" and att_rows[1]["waive"] == 1
    assert att_rows[2]["leave_type"] == "off" and att_rows[2]["waive"] == 1
    conn.close()


# ── 3. Periods & Month Selector Variant B Tests ──

def test_api_periods_variant_b():
    res = client.get("/api/hrm/periods?year=2026")
    assert res.status_code == 200
    data = res.json()
    assert len(data) == 12
    for item in data:
        assert "month" in item
        assert "status" in item
        assert item["status"] in ("draft", "locked", "paid")


# ── 4. UI Elements Integrity ──

def test_ui_elements_variant_b_and_leaves_tab():
    with open("templates/index.html", "r", encoding="utf-8") as f:
        soup = BeautifulSoup(f.read(), "html.parser")

    # Variant B stepper & dropdown
    assert soup.find(id="hrm-month-dropdown-btn") is not None
    assert soup.find(id="hrm-month-dropdown-menu") is not None
    assert soup.find(id="hrm-month-display") is not None
    assert soup.find(id="hrm-month-picker") is not None

    # Subtab Xin Off
    assert soup.find(id="btn-hrm-tab-leaves") is not None
    assert soup.find(id="hrm-subtab-leaves") is not None
    assert soup.find(id="table-hrm-leaves") is not None

    # Modal Xin Off
    assert soup.find(id="modal-hrm-leave") is not None
    assert soup.find(id="hrm-leave-type") is not None
