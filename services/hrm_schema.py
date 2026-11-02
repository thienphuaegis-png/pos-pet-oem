"""HRM schema migration — gọi từ database.init_db() (idempotent)."""
import json

HRM_DEFAULT_RULES = {
    "late_per_min": 5000, "late_flat": 200000, "late_flat_threshold_min": 30,
    "missing_punch": 50000, "absent": 500000,
    "full_day_min": 420, "half_day_min": 210,
    "probation_rate": "0.85", "ot_multiplier": "1.5", "ot_min_minutes": 25,
    "holiday_extra_days": 1, "attendance_bonus": 500000, "birthday_bonus": 200000,
    "payroll_mode": "sme",
    "insurance_rate": "0.105",
    "insurance_cap": 46800000,
    "tax_self_deduction": 11000000,
    "tax_dependent_deduction": 4400000,
    "min_wage": 5310000,
    "alert_change_pct": 30,
}

STAFF_HR_COLUMNS = [
    ("employee_code", "TEXT"), ("device_code", "TEXT"), ("work_block_id", "INTEGER"),
    ("department", "TEXT"), ("position", "TEXT"), ("gender", "TEXT"),
    ("base_salary", "REAL DEFAULT 0"), ("allowance", "REAL DEFAULT 0"),
    ("bank_account", "TEXT"), ("bank_name", "TEXT"), ("bank_branch", "TEXT"),
    ("birthday", "TEXT"), ("hire_date", "TEXT"), ("probation_start", "TEXT"),
    ("official_date", "TEXT"), ("leave_date", "TEXT"),
    ("id_card_number", "TEXT"), ("id_card_date", "TEXT"), ("id_card_place", "TEXT"),
    ("permanent_address", "TEXT"), ("temporary_address", "TEXT"), ("email", "TEXT"),
    ("emergency_phone", "TEXT"), ("emergency_relation", "TEXT"),
    ("has_contract", "INTEGER DEFAULT 0"), ("contract_number", "TEXT"),
    ("contract_type", "TEXT DEFAULT 'Có thời hạn'"), ("dependents_count", "INTEGER DEFAULT 0"),
    ("insurance_salary", "REAL DEFAULT 0"), ("is_insurance_exempt", "INTEGER DEFAULT 0"),
    ("is_spa_worker", "INTEGER DEFAULT 0"), ("legacy_spa_staff_id", "INTEGER"),
    ("is_payroll_staff", "INTEGER DEFAULT 1"),
    ("commission_policy_mode", "TEXT DEFAULT 'dept'"),
    ("enable_spa_commission", "INTEGER DEFAULT 1"),
    ("enable_tmdt_commission", "INTEGER DEFAULT 1"),
    ("is_attendance_exempt", "INTEGER DEFAULT 0"),
]


def ensure_hrm_schema(cur):
    cur.execute("PRAGMA table_info(staff)")
    cols = {r[1] for r in cur.fetchall()}
    for name, typ in STAFF_HR_COLUMNS:
        if name not in cols:
            cur.execute(f"ALTER TABLE staff ADD COLUMN {name} {typ}")
    cur.execute("CREATE UNIQUE INDEX IF NOT EXISTS idx_staff_employee_code ON staff(employee_code) WHERE employee_code IS NOT NULL AND employee_code != ''")
    cur.execute("CREATE UNIQUE INDEX IF NOT EXISTS idx_staff_device_code ON staff(device_code) WHERE device_code IS NOT NULL AND device_code != ''")

    cur.execute("""
    CREATE TABLE IF NOT EXISTS hrm_work_blocks (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT UNIQUE NOT NULL,
        start_time TEXT NOT NULL,
        end_time TEXT NOT NULL,
        lunch_minutes INTEGER NOT NULL DEFAULT 0,
        std_hours REAL NOT NULL DEFAULT 8,
        off_sunday INTEGER NOT NULL DEFAULT 0,
        monthly_off_days INTEGER NOT NULL DEFAULT 0,
        split_time TEXT NOT NULL DEFAULT '12:00'
    )""")
    cur.execute("SELECT COUNT(*) FROM hrm_work_blocks")
    if cur.fetchone()[0] == 0:
        cur.executemany(
            "INSERT INTO hrm_work_blocks (name, start_time, end_time, lunch_minutes, std_hours, off_sunday, monthly_off_days, split_time) VALUES (?,?,?,?,?,?,?,?)",
            [
                ("Văn Phòng", "08:00", "17:30", 90, 8.0, 1, 0, "12:00"),
                ("Kho", "08:00", "18:00", 90, 8.5, 0, 2, "12:00"),
                ("Thoả Thuận", "08:00", "16:30", 90, 7.0, 1, 0, "12:00"),
                ("Sales Sáng", "07:30", "15:30", 0, 8.0, 0, 4, "11:30"),
                ("Sales Chiều", "15:30", "23:30", 0, 8.0, 0, 4, "19:30"),
            ],
        )
    # Khối TTS 1 ca (4h): làm đủ 1 ca = 1 công. Seed 1 lần (cờ settings) để anh xóa khối thì không tự mọc lại.
    cur.execute("SELECT 1 FROM settings WHERE key = 'hrm_seed_tts_blocks'")
    if not cur.fetchone():
        cur.executemany(
            "INSERT OR IGNORE INTO hrm_work_blocks (name, start_time, end_time, lunch_minutes, std_hours, off_sunday, monthly_off_days, split_time) VALUES (?,?,?,?,?,?,?,?)",
            [("TTS Ca Sáng", "08:00", "12:00", 0, 4.0, 1, 0, "10:00"),
             ("TTS Ca Chiều", "13:30", "17:30", 0, 4.0, 1, 0, "15:30")],
        )
        cur.execute("INSERT OR IGNORE INTO settings (key, value) VALUES ('hrm_seed_tts_blocks', '1')")

    cur.execute("""
    CREATE TABLE IF NOT EXISTS hrm_holidays (
        holiday_date TEXT PRIMARY KEY,
        name TEXT NOT NULL
    )""")
    cur.execute("SELECT COUNT(*) FROM hrm_holidays")
    if cur.fetchone()[0] == 0:
        cur.executemany("INSERT INTO hrm_holidays (holiday_date, name) VALUES (?, ?)", [
            ("2026-01-01", "Tết Dương lịch"), ("2026-04-30", "Giải phóng miền Nam"),
            ("2026-05-01", "Quốc tế Lao động"), ("2026-09-02", "Quốc khánh"),
        ])

    cur.execute("""
    CREATE TABLE IF NOT EXISTS hrm_salary_adjustments (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        staff_id INTEGER NOT NULL REFERENCES staff(id) ON DELETE CASCADE,
        decision_date TEXT,
        effective_date TEXT NOT NULL,
        adjustment_type TEXT DEFAULT 'salary',
        base_delta REAL NOT NULL DEFAULT 0,
        allowance_delta REAL NOT NULL DEFAULT 0,
        reason TEXT,
        created_by TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )""")
    cur.execute("PRAGMA table_info(hrm_salary_adjustments)")
    adj_cols = {r[1] for r in cur.fetchall()}
    if "decision_date" not in adj_cols:
        cur.execute("ALTER TABLE hrm_salary_adjustments ADD COLUMN decision_date TEXT")
    if "adjustment_type" not in adj_cols:
        cur.execute("ALTER TABLE hrm_salary_adjustments ADD COLUMN adjustment_type TEXT DEFAULT 'salary'")

    cur.execute("""
    CREATE TABLE IF NOT EXISTS staff_attendance (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        staff_id INTEGER NOT NULL REFERENCES staff(id) ON DELETE CASCADE,
        work_date TEXT NOT NULL,
        punches TEXT NOT NULL DEFAULT '[]',
        leave_type TEXT CHECK(leave_type IS NULL OR leave_type IN ('off','off_morning','off_afternoon')),
        waive INTEGER NOT NULL DEFAULT 0,
        note TEXT,
        source TEXT NOT NULL DEFAULT 'device' CHECK(source IN ('device','manual')),
        updated_by TEXT,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(staff_id, work_date)
    )""")
    cur.execute("CREATE INDEX IF NOT EXISTS idx_staff_attendance_date ON staff_attendance(work_date)")

    cur.execute("""
    CREATE TABLE IF NOT EXISTS staff_leaves (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        staff_id INTEGER NOT NULL REFERENCES staff(id),
        work_date TEXT NOT NULL,
        leave_type TEXT NOT NULL, -- 'off', 'off_morning', 'off_afternoon'
        reason TEXT,
        approved_by TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(staff_id, work_date)
    )""")
    cur.execute("CREATE INDEX IF NOT EXISTS idx_staff_leaves_date ON staff_leaves(work_date)")

    cur.execute("""
    CREATE TABLE IF NOT EXISTS staff_overtime (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        staff_id INTEGER NOT NULL REFERENCES staff(id) ON DELETE CASCADE,
        work_date TEXT NOT NULL,
        hours REAL NOT NULL CHECK(hours > 0),
        note TEXT,
        approved_by TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(staff_id, work_date)
    )""")

    cur.execute("""
    CREATE TABLE IF NOT EXISTS staff_advances (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        staff_id INTEGER NOT NULL REFERENCES staff(id) ON DELETE CASCADE,
        advance_date TEXT NOT NULL,
        amount REAL NOT NULL CHECK(amount > 0),
        note TEXT,
        cashbook_id INTEGER REFERENCES cashbook(id) ON DELETE SET NULL,
        created_by TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )""")

    cur.execute("""
    CREATE TABLE IF NOT EXISTS spa_commission_rules (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        role_key TEXT NOT NULL CHECK(role_key IN ('receiver','worker_1','worker_2','cutter','dyer')),
        service_name TEXT,
        rate_type TEXT NOT NULL CHECK(rate_type IN ('percent','fixed')),
        value REAL NOT NULL DEFAULT 0 CHECK(value >= 0),
        is_active INTEGER NOT NULL DEFAULT 1
    )""")

    cur.execute("""
    CREATE TABLE IF NOT EXISTS payroll_periods (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        month TEXT UNIQUE NOT NULL,
        status TEXT NOT NULL DEFAULT 'draft' CHECK(status IN ('draft','locked','paid')),
        rules_json TEXT,
        locked_at DATETIME,
        locked_by TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )""")
    cur.execute("""
    CREATE TABLE IF NOT EXISTS payroll_lines (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        period_id INTEGER NOT NULL REFERENCES payroll_periods(id) ON DELETE CASCADE,
        staff_id INTEGER NOT NULL REFERENCES staff(id),
        data_json TEXT NOT NULL DEFAULT '{}',
        bonus_other REAL NOT NULL DEFAULT 0,
        fuel_other REAL NOT NULL DEFAULT 0,
        deduction_other REAL NOT NULL DEFAULT 0,
        manual_note TEXT,
        net_pay REAL NOT NULL DEFAULT 0,
        cashbook_id INTEGER REFERENCES cashbook(id) ON DELETE SET NULL,
        paid_at DATETIME,
        UNIQUE(period_id, staff_id)
    )""")

    cur.execute("INSERT OR IGNORE INTO settings (key, value) VALUES ('hrm_rules', ?)", (json.dumps(HRM_DEFAULT_RULES),))
    cur.execute("INSERT OR IGNORE INTO cashbook_categories (name, type) VALUES ('Chi lương & hoa hồng nhân viên', 'out')")
    cur.execute("INSERT OR IGNORE INTO cashbook_categories (name, type) VALUES ('Tạm ứng lương', 'out')")

    # Gộp thợ spa (spa_staff) vào staff: 1 danh sách nhân viên duy nhất, không đăng nhập
    cur.execute("SELECT name FROM sqlite_master WHERE type='table' AND name='spa_staff'")
    if cur.fetchone():
        cur.execute("SELECT * FROM spa_staff")
        for s in cur.fetchall():
            cur.execute("SELECT id FROM staff WHERE legacy_spa_staff_id = ?", (s["id"],))
            if cur.fetchone():
                continue
            cur.execute(
                "INSERT INTO staff (name, phone, role, commission_rate, is_active, position, is_spa_worker, legacy_spa_staff_id) VALUES (?, ?, 'staff', 0, ?, ?, 1, ?)",
                (s["name"], s["phone"] or "", s["is_active"] if s["is_active"] is not None else 1, s["role"] or "Thợ Spa", s["id"]),
            )
