import json
import sqlite3
from datetime import date
from pathlib import Path
from fastapi.testclient import TestClient

import database
from server import app
from services.hrm_schema import ensure_hrm_schema
from services.payroll_engine import Block, DayInput, Rules, classify_day
from routers.auth import _make_token


def test_late_penalty_never_exceeds_late_flat_cap():
    kho = Block("Kho", 480, 1080, 90, 8.5, False, 2, 720)
    # Kể cả khi cấu hình nhầm late_per_min = 50.000, trễ 16p không bao giờ vượt trần late_flat = 200.000
    bad_rules = Rules(late_per_min=50000, late_flat=200000, late_flat_threshold_min=30)
    res_bad = classify_day(DayInput(work_date=date(2026, 10, 5), punches=[496, 1353]), kho, bad_rules)
    assert res_bad.late_min == 16
    assert res_bad.penalty == 200000

    # Với cấu hình chuẩn 5.000đ/phút: ngày 05/10 trễ 16p phạt đúng 80.000đ
    std_rules = Rules(late_per_min=5000, late_flat=200000, late_flat_threshold_min=30)
    res_std = classify_day(DayInput(work_date=date(2026, 10, 5), punches=[496, 1353]), kho, std_rules)
    assert res_std.late_min == 16
    assert res_std.penalty == 80000


def test_migration_auto_fixes_50000_late_per_min_typo():
    conn = sqlite3.connect(":memory:")
    conn.row_factory = sqlite3.Row
    cur = conn.cursor()
    cur.execute("CREATE TABLE settings (key TEXT PRIMARY KEY, value TEXT)")
    cur.execute("CREATE TABLE staff (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT, phone TEXT, role TEXT, commission_rate REAL DEFAULT 0, is_active INTEGER DEFAULT 1)")
    cur.execute("CREATE TABLE cashbook (id INTEGER PRIMARY KEY AUTOINCREMENT)")
    cur.execute("CREATE TABLE cashbook_categories (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT UNIQUE, type TEXT)")
    cur.execute(
        "INSERT INTO settings (key, value) VALUES ('hrm_rules', ?)",
        (json.dumps({"late_per_min": 50000, "late_flat": 200000, "late_flat_threshold_min": 30}),),
    )
    ensure_hrm_schema(cur)
    fixed = json.loads(cur.execute("SELECT value FROM settings WHERE key='hrm_rules'").fetchone()[0])
    assert fixed["late_per_min"] == 5000
    conn.close()


def test_attendance_api_returns_rules_and_ui_has_vn_date_sort_and_dynamic_footer():
    database.init_db()
    conn = database.get_db()
    row = conn.execute("SELECT id, COALESCE(token_version, 0) tv FROM staff WHERE role IN ('owner', 'admin') ORDER BY id LIMIT 1").fetchone()
    conn.close()
    headers = {"Authorization": f"Bearer {_make_token(row['id'], row['tv'], hours=2, typ='access')}"}

    client = TestClient(app)
    r = client.get("/api/hrm/attendance?month=2026-10", headers=headers)
    assert r.status_code == 200
    data = r.json()
    assert "rules" in data
    assert data["rules"]["late_per_min"] == 5000

    root = Path(__file__).resolve().parents[1]
    html = (root / "templates/index.html").read_text(encoding="utf-8")
    hrm_js = (root / "static/js/modules/hrm.js").read_text(encoding="utf-8")

    assert 'id="hrm-att-sort-by"' in html
    assert 'id="table-hrm-att-detail-foot"' in html
    assert 'sticky top-0 z-20' in html
    assert 'function parseVnIsoDate(' in hrm_js
    assert 'window.toggleHrmAttSort' in hrm_js
    assert 'Tổng cộng (${rows.length} dòng đang lọc):' in hrm_js
    assert 'function syncHrmAttStaffFilterOptions(' in hrm_js
    assert 'data-hrm-staff-picker="hrm-att-filter-staff"' in html
    assert 'id="hrm-att-filter-staff-search"' in html

