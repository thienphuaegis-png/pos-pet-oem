# HRM & Dynamic Payroll Engine Implementation Plan (Chấm Công, Bảng Lương, Hoa Hồng)

> **Dành cho Agent / AI thực thi độc lập:** Kế hoạch này được thiết kế tự đứng (self-contained), có đầy đủ mã nguồn đã kiểm thử thực tế, vị trí neo code cũ → mới, và bộ test unit/integration hoàn chỉnh. Thực thi tuần tự từng Task, KHÔNG nhảy cóc, KHÔNG đoán mã nguồn.

**Mục tiêu:** Bổ sung trọn vẹn phân hệ Nhân Sự - Chấm Công - Hoa Hồng - Bảng Lương (HRM) cho hệ thống POS Petcare Offline, chuẩn hóa quy trình tính lương từ Google Sheet thực tế của chủ shop sang hệ thống tự động, sửa triệt để các lỗi hoa hồng và công thức tính.

**Kiến trúc:** 4 tầng xử lý dữ liệu (Tier 1: Master Blocks & Rules; Tier 2: Log quẹt thẻ & Phát sinh tăng ca/tạm ứng; Tier 3: Pure Math Engine Zero-drift Decimal; Tier 4: Locked Period Snapshots đóng băng lịch sử + Tích hợp 2 chiều Sổ Quỹ Thu Chi).

**Tech Stack:** Python 3.11+, FastAPI, SQLite 3, openpyxl, TailwindCSS (Vanilla JS, modal POS chuẩn).

---

## Global Constraints & Môi Trường Bắt Buộc

1. **Python Toolchain & Virtualenv:**
   - Mọi lệnh python/pytest BẮT BUỘC dùng binary trong virtualenv của dự án:
     ```bash
     .venv/Scripts/python.exe -m pytest <test_path> -v
     ```
   - Tuyệt đối KHÔNG dùng python toàn cục hay `python3`.
2. **Biến môi trường kiểm thử:**
   - `tests/conftest.py` đã tự động cô lập DB vào thư mục tạm và set `POS_DISABLE_BACKGROUND=1`. Không chạy test trực tiếp trên file DB gốc `data/pos.db`.
3. **Quy tắc Git & Workspace:**
   - KHÔNG commit, push, stash hay reset git nếu chưa có yêu cầu từ người dùng.
   - Không chạy song song 2 lệnh pytest cùng lúc (tránh conflict khóa file SQLite).
4. **Lệnh Build File Thực Thi (.exe):**
   - Sau khi hoàn thành toàn bộ các Task backend/frontend, lệnh rebuild duy nhất:
     ```bash
     .venv/Scripts/python.exe -m PyInstaller POS_Mastercare.spec
     ```

---

## Scope Boundary & Anti-Drift Guards (Strict)

1. **Chạm đúng biên:** Chỉ tạo các file mới và sửa đúng các hàm/dòng được chỉ định trong từng Task. Không tự ý format lại toàn bộ file hay refactor hàm lân cận.
2. **Bằng chứng test thực tế:** Sau mỗi Task, bắt buộc chạy lệnh pytest tương ứng và paste nguyên văn kết quả test (PASSED). Cấm tự nhận PASS mà không có log.
3. **Tuần tự theo nấc:** Hoàn thành xong Task N -> Test pass -> Mới chuyển sang Task N+1.

---

## Bản Đồ Files & Trách Nhiệm

| File | Hành động | Trách nhiệm |
|---|---|---|
| `services/commission.py` | Tạo mới | Single source of truth tính hoa hồng bán lẻ theo doanh thu thuần và hoa hồng spa theo vai trò + chia tip |
| `routers/pos.py` | Sửa đổi | Cập nhật hoa hồng khi sửa đơn, đổi NV bán hàng loạt và tạo đơn POS |
| `routers/combos.py` | Sửa đổi | Cập nhật hoa hồng khi bán Combo |
| `routers/cashbook.py` | Sửa đổi | Lọc bỏ đơn nháp và trừ hàng trả trong báo cáo; hook hoàn tác khi xóa phiếu chi lương/tạm ứng |
| `services/hrm_schema.py` | Tạo mới | DDL migration bảng chấm công, tăng ca, tạm ứng, bảng lương, khối làm việc, ngày lễ, gộp thợ spa |
| `database.py` | Sửa đổi | Gọi `ensure_hrm_schema(cur)` trong `init_db()` |
| `routers/settings.py` | Sửa đổi | Khai báo quyền `payroll.manage` trong `PERM_KEYS` |
| `static/js/staff.js` | Sửa đổi | Khai báo nhãn hiển thị cho quyền `payroll.manage` |
| `services/payroll_engine.py` | Tạo mới | Pure math engine: quy đổi giờ phút, phân loại ngày công, tính tiền lương, phạt, OT, thưởng chuyên cần |
| `services/attendance_import.py` | Tạo mới | Parser file Excel máy chấm công vân tay, map cột mờ, min/max quẹt thẻ |
| `services/payroll_service.py` | Tạo mới | Service nghiệp vụ: dựng dữ liệu tháng, tính tạm, chốt (lock), mở khóa, chi lương sang Sổ Quỹ |
| `routers/hrm.py` | Tạo mới | Router FastAPI `/api/hrm/*`: cấu hình, hồ sơ nhân sự, chấm công, tăng ca, tạm ứng, bảng lương, xuất Excel |
| `server.py` | Sửa đổi | Đăng ký `hrm_router` vào FastAPI app dưới dependency `_LOGIN_REQUIRED` |
| `templates/index.html` | Sửa đổi | Nút sidebar `tab-hrm`, container `#tab-hrm`, trường hồ sơ lương trong modal nhân viên, thẻ script `hrm.js` |
| `static/js/modules/hrm.js` | Tạo mới | Module giao diện HRM: 4 sub-tab (Chấm công, Tăng ca, Tạm ứng, Bảng lương), modal import, modal xem phiếu lương |
| `static/js/app.js` | Sửa đổi | Điều hướng tab `hrm` trong `switchTab` |
| `tests/test_html_integrity.py` | Sửa đổi | Cập nhật số nút sidebar (19) và danh sách tab hợp lệ |
| `tests/test_payroll_engine.py` | Tạo mới | 14 unit test kiểm thử toàn diện engine tính công & lương |
| `tests/test_hrm_payroll_api.py` | Tạo mới | 12 integration test kiểm thử vòng đời bảng lương, Sổ Quỹ, import Excel và phân quyền |

---

## TASK 1: Sửa Nền Hoa Hồng (Single Source of Truth)

**Bối cảnh:** Hiện tại `routers/pos.py` lưu chết `commission_amount` lúc tạo đơn nhưng khi sửa đơn (`update_order`) hoặc đổi nhân viên bán hàng loạt (`bulk_update_order_staff`) lại không tính lại hoa hồng. Khi khách trả hàng (`order_returns`), hoa hồng không bị trừ lại. Báo cáo Sổ Quỹ (`routers/cashbook.py`) cộng cả đơn trạng thái "Lưu nháp" làm sai lệch tiền.

### 1.1. Tạo file `services/commission.py`

Tạo mới file `services/commission.py` với nội dung nguyên văn sau:

```python
"""Hoa hồng nhân viên — nguồn duy nhất cho bán hàng, báo cáo và bảng lương."""
import json

EXCLUDED_ORDER_STATUSES = ("Lưu nháp", "draft", "cancelled", "Đã hủy")
SPA_ROLE_COLUMNS = ("staff_receiver", "staff_worker_1", "staff_worker_2", "staff_cutter", "staff_dyer")
TIP_ROLE_COLUMNS = ("staff_worker_1", "staff_worker_2", "staff_cutter", "staff_dyer")


def order_commission_base(total_amount, discount) -> float:
    """Doanh thu thuần làm căn cứ tính hoa hồng đơn hàng = Tổng tiền hàng - Giảm giá."""
    return max(0.0, float(total_amount or 0) - float(discount or 0))


def calc_order_commission(cur, staff_id, total_amount, discount) -> float:
    """Tính hoa hồng làm tròn đến đồng cho 1 đơn hàng theo % hoa hồng của nhân viên."""
    if not staff_id:
        return 0.0
    cur.execute("SELECT commission_rate FROM staff WHERE id = ?", (staff_id,))
    row = cur.fetchone()
    rate = float(row["commission_rate"] or 0) if row else 0.0
    return round(order_commission_base(total_amount, discount) * rate / 100.0)


def sales_commission_by_staff(cur, from_dt: str, to_dt: str) -> dict:
    """
    Tính tổng doanh số thuần và hoa hồng bán hàng theo từng nhân viên trong khoảng thời gian.
    - Loại bỏ đơn Lưu nháp / Đã hủy
    - Trừ giá trị hàng trả lại từ order_returns
    Trả về dict: {staff_id: {"revenue": float, "returns": float, "net": float, "rate": float, "commission": int}}
    """
    ph = ",".join("?" for _ in EXCLUDED_ORDER_STATUSES)
    cur.execute(f"""
        SELECT o.staff_id, COALESCE(SUM(MAX(0, COALESCE(o.total_amount,0) - COALESCE(o.discount,0))), 0) AS revenue
        FROM orders o
        WHERE o.staff_id IS NOT NULL
          AND COALESCE(o.status, '') NOT IN ({ph})
          AND datetime(o.created_at, '+7 hours') BETWEEN ? AND ?
        GROUP BY o.staff_id
    """, (*EXCLUDED_ORDER_STATUSES, from_dt, to_dt))
    out = {}
    for r in cur.fetchall():
        out[r["staff_id"]] = {"revenue": float(r["revenue"] or 0), "returns": 0.0}

    cur.execute("""
        SELECT o.staff_id, COALESCE(SUM(ret.return_total), 0) AS returns
        FROM order_returns ret JOIN orders o ON o.id = ret.original_order_id
        WHERE o.staff_id IS NOT NULL
          AND datetime(ret.created_at, '+7 hours') BETWEEN ? AND ?
        GROUP BY o.staff_id
    """, (from_dt, to_dt))
    for r in cur.fetchall():
        out.setdefault(r["staff_id"], {"revenue": 0.0, "returns": 0.0})["returns"] = float(r["returns"] or 0)

    if out:
        ids = list(out)
        cur.execute(f"SELECT id, commission_rate FROM staff WHERE id IN ({','.join('?' for _ in ids)})", ids)
        rates = {r["id"]: float(r["commission_rate"] or 0) for r in cur.fetchall()}
        for sid, v in out.items():
            v["net"] = max(0.0, v["revenue"] - v["returns"])
            v["rate"] = rates.get(sid, 0.0)
            v["commission"] = round(v["net"] * v["rate"] / 100.0)
    return out


def _service_lines(ticket) -> list:
    try:
        items = json.loads(ticket["services_json"] or "[]")
    except Exception:
        items = []
    lines = [it for it in items
             if not it.get("is_retail") and not it.get("is_tip") and it.get("name") != "Tiền tip thợ"]
    if not lines:
        total = max(0.0, float(ticket["price"] or 0) - float(ticket["tip_amount"] or 0))
        lines = [{"name": ticket["service_type"] or "", "quantity": 1, "price": total}]
    return lines


def spa_commission_by_name(cur, from_date: str, to_date: str) -> dict:
    """
    Tính hoa hồng dịch vụ spa theo vai trò thực hiện (cắt, dọn, tắm...) và tiền tip được chia.
    Trả về dict: {ten_tho_lower: {"commission": int, "tips": int, "tickets": int}}
    """
    cur.execute("SELECT name FROM sqlite_master WHERE type='table' AND name='spa_commission_rules'")
    if not cur.fetchone():
        return {}
    cur.execute("SELECT role_key, service_name, rate_type, value FROM spa_commission_rules WHERE is_active = 1")
    rules = [dict(r) for r in cur.fetchall()]
    cur.execute("""
        SELECT * FROM pet_service_tickets
        WHERE status = 'completed' AND COALESCE(ticket_date, date(created_at)) BETWEEN ? AND ?
    """, (from_date, to_date))
    out = {}

    def acc(name, key, amount):
        k = (name or "").strip().lower()
        if not k:
            return
        rec = out.setdefault(k, {"commission": 0.0, "tips": 0.0, "tickets": 0})
        rec[key] += amount

    for t in cur.fetchall():
        lines = _service_lines(t)
        service_total = sum(float(l.get("price") or 0) * float(l.get("quantity") or 1) for l in lines)
        seen = set()
        for col in SPA_ROLE_COLUMNS:
            name = (t[col] or "").strip()
            if not name:
                continue
            role_key = col.replace("staff_", "")
            for rule in (r for r in rules if r["role_key"] == role_key):
                svc = (rule["service_name"] or "").strip().lower()
                if svc:
                    match = [l for l in lines if (l.get("name") or "").strip().lower() == svc]
                    qty = sum(float(l.get("quantity") or 1) for l in match)
                    sub = sum(float(l.get("price") or 0) * float(l.get("quantity") or 1) for l in match)
                else:
                    qty, sub = (1.0, service_total)
                if not qty:
                    continue
                amount = sub * float(rule["value"]) / 100.0 if rule["rate_type"] == "percent" else float(rule["value"]) * qty
                acc(name, "commission", amount)
            if name.lower() not in seen:
                seen.add(name.lower())
                acc(name, "tickets", 1)
        tip = float(t["tip_amount"] or 0)
        if tip > 0:
            takers = []
            for col in TIP_ROLE_COLUMNS:
                n = (t[col] or "").strip()
                if n and n.lower() not in [x.lower() for x in takers]:
                    takers.append(n)
            if not takers and (t["staff_receiver"] or "").strip():
                takers = [t["staff_receiver"].strip()]
            for n in takers:
                acc(n, "tips", tip / len(takers))

    for v in out.values():
        v["commission"] = round(v["commission"])
        v["tips"] = round(v["tips"])
    return out
```

### 1.2. Sửa `routers/pos.py`

**Điểm 1 (trong `bulk_update_order_staff`, dòng ~307):**
```python
<<<< VĂN BẢN CŨ
        placeholders = ",".join("?" for _ in req.order_codes)
        cur.execute(f"UPDATE orders SET staff_id = ? WHERE code IN ({placeholders})", [req.new_staff_id] + req.order_codes)
        updated_count = cur.rowcount
        conn.commit()
====
        placeholders = ",".join("?" for _ in req.order_codes)
        cur.execute(f"UPDATE orders SET staff_id = ? WHERE code IN ({placeholders})", [req.new_staff_id] + req.order_codes)
        updated_count = cur.rowcount
        from services.commission import calc_order_commission
        cur.execute(f"SELECT id, total_amount, discount FROM orders WHERE code IN ({placeholders})", req.order_codes)
        for o in cur.fetchall():
            cur.execute("UPDATE orders SET commission_amount = ? WHERE id = ?",
                        (calc_order_commission(cur, req.new_staff_id, o["total_amount"], o["discount"]), o["id"]))
        conn.commit()
>>>>
```

**Điểm 2 (trong `create_order`, dòng ~1132):**
Xóa đoạn tính hoa hồng cũ:
```python
<<<< VĂN BẢN CŨ
        cur.execute("SELECT commission_rate FROM staff WHERE id = ?", (req.staff_id,))
        staff_row = cur.fetchone()
        comm_rate = staff_row["commission_rate"] if staff_row else 0
        commission_amount = (final_amount * comm_rate) / 100.0

        base_code = f"HD{datetime.datetime.now().strftime('%y%m%d%H%M%S')}"
====
        base_code = f"HD{datetime.datetime.now().strftime('%y%m%d%H%M%S')}"
>>>>
```
Và sau khi xác định `effective_staff_id` (dòng ~1164):
```python
<<<< VĂN BẢN CŨ
        if not effective_staff_id:
            effective_staff_id = 1

        warehouse_id = req.warehouse_id or 1
====
        if not effective_staff_id:
            effective_staff_id = 1

        from services.commission import calc_order_commission
        commission_amount = calc_order_commission(cur, effective_staff_id, total_amount, req.discount)

        warehouse_id = req.warehouse_id or 1
>>>>
```

**Điểm 3 (trong `update_order`, dòng ~1740):**
```python
<<<< VĂN BẢN CŨ
        new_vat_amount = vat_amount if req.items is not None else (order["vat_amount"] or 0.0)
        updater_name = (user.get("name") if isinstance(user, dict) else None) or "Quản trị viên"
        now_vn = datetime.datetime.now().strftime("%Y-%m-%d %H:%M:%S")
        cur.execute("""
        UPDATE orders 
        SET customer_id = ?, staff_id = ?, total_amount = ?, discount = ?, shipping_fee = ?, final_amount = ?, paid_amount = ?, debt_amount = ?, note = ?, vat_amount = ?, updated_by = ?, updated_at = ?
        WHERE id = ?
        """, (new_customer_id, new_staff_id, total_amount, new_discount, shipping_fee, final_amount, actual_new_paid, new_debt, new_note, new_vat_amount, updater_name, now_vn, order_id))
====
        new_vat_amount = vat_amount if req.items is not None else (order["vat_amount"] or 0.0)
        from services.commission import calc_order_commission
        new_commission = calc_order_commission(cur, new_staff_id, total_amount, new_discount)
        updater_name = (user.get("name") if isinstance(user, dict) else None) or "Quản trị viên"
        now_vn = datetime.datetime.now().strftime("%Y-%m-%d %H:%M:%S")
        cur.execute("""
        UPDATE orders 
        SET customer_id = ?, staff_id = ?, total_amount = ?, discount = ?, shipping_fee = ?, final_amount = ?, paid_amount = ?, debt_amount = ?, note = ?, vat_amount = ?, commission_amount = ?, updated_by = ?, updated_at = ?
        WHERE id = ?
        """, (new_customer_id, new_staff_id, total_amount, new_discount, shipping_fee, final_amount, actual_new_paid, new_debt, new_note, new_vat_amount, new_commission, updater_name, now_vn, order_id))
>>>>
```

### 1.3. Sửa `routers/combos.py` (dòng ~399)

```python
<<<< VĂN BẢN CŨ
        # Staff commission
        cur.execute("SELECT commission_rate FROM staff WHERE id = ?", (staff_id,))
        staff_row = cur.fetchone()
        comm_rate = staff_row["commission_rate"] if staff_row else 0
        commission_amount = (final_amount * comm_rate) / 100.0

        warehouse_id = 1
====
        # Staff commission (doanh thu thuần = tiền hàng - giảm giá)
        from services.commission import calc_order_commission
        commission_amount = calc_order_commission(cur, staff_id, total_amount, discount)

        warehouse_id = 1
>>>>
```

### 1.4. Sửa `routers/cashbook.py`

**Điểm 1 (trong `report_summary`, dòng ~670):**
```python
<<<< VĂN BẢN CŨ
    # Tong hoa hong nhan vien
    cur.execute("SELECT COALESCE(SUM(commission_amount), 0) FROM orders")
    total_comm = cur.fetchone()[0]
====
    # Tong hoa hong nhan vien (doanh thu thuần, bỏ đơn nháp, trừ hàng trả)
    from services.commission import sales_commission_by_staff
    total_comm = sum(v["commission"] for v in sales_commission_by_staff(cur, "2000-01-01 00:00:00", "2100-12-31 23:59:59").values())
>>>>
```

**Điểm 2 (trong `get_reports_analytics`, dòng ~728 & ~988):**
```python
<<<< VĂN BẢN CŨ
    total_paid = stat_row["total_paid"] or 0
    total_debt = stat_row["total_debt"] or 0
    total_comm = stat_row["total_commission"] or 0

    # 2. Timeline xu hướng doanh thu & số đơn (gom theo ngày)
====
    total_paid = stat_row["total_paid"] or 0
    total_debt = stat_row["total_debt"] or 0
    from services.commission import sales_commission_by_staff
    comm_by_staff = sales_commission_by_staff(cur, from_dt_str, to_dt_str)
    total_comm = sum(v["commission"] for v in comm_by_staff.values())

    # 2. Timeline xu hướng doanh thu & số đơn (gom theo ngày)
>>>>
```
Và ở phần gán hoa hồng theo nhân viên:
```python
<<<< VĂN BẢN CŨ
    staff_rows = [dict(r) for r in cur.fetchall()]

    # 6. Top Mặt Hàng & Dịch Vụ Bán Chạy Nhất (Top 20)
====
    staff_rows = [dict(r) for r in cur.fetchall()]
    for s in staff_rows:
        s["commission"] = comm_by_staff.get(s["staff_id"], {}).get("commission", 0)

    # 6. Top Mặt Hàng & Dịch Vụ Bán Chạy Nhất (Top 20)
>>>>
```

---

## TASK 2: Schema HRM & Migration Database

**Bối cảnh:** Cần bổ sung các bảng lưu cấu hình khối ca làm việc (`hrm_work_blocks`), lịch ngày lễ (`hrm_holidays`), bảng chấm công (`staff_attendance`), tăng ca (`staff_overtime`), tạm ứng (`staff_advances`), hoa hồng spa (`spa_commission_rules`), kỳ tính lương (`payroll_periods`) và chi tiết bảng lương (`payroll_lines`). Đồng thời thêm cột hồ sơ vào bảng `staff` và gộp nhân sự từ bảng `spa_staff` sang `staff` với cờ `is_spa_worker=1`.

### 2.1. Tạo file `services/hrm_schema.py`

Tạo mới file `services/hrm_schema.py` với nội dung nguyên văn sau:

```python
"""HRM schema migration — gọi từ database.init_db() (idempotent)."""
import json

HRM_DEFAULT_RULES = {
    "late_per_min": 5000, "late_flat": 200000, "late_flat_threshold_min": 30,
    "missing_punch": 50000, "absent": 500000,
    "full_day_min": 420, "half_day_min": 210,
    "probation_rate": "0.85", "ot_multiplier": "1.5", "ot_min_minutes": 25,
    "holiday_extra_days": 1, "attendance_bonus": 500000, "birthday_bonus": 200000,
}

STAFF_HR_COLUMNS = [
    ("employee_code", "TEXT"), ("device_code", "TEXT"), ("work_block_id", "INTEGER"),
    ("position", "TEXT"), ("base_salary", "REAL DEFAULT 0"), ("allowance", "REAL DEFAULT 0"),
    ("bank_account", "TEXT"), ("bank_name", "TEXT"), ("bank_branch", "TEXT"),
    ("birthday", "TEXT"), ("hire_date", "TEXT"), ("probation_start", "TEXT"),
    ("official_date", "TEXT"), ("leave_date", "TEXT"),
    ("is_spa_worker", "INTEGER DEFAULT 0"), ("legacy_spa_staff_id", "INTEGER"),
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
        effective_date TEXT NOT NULL,
        base_delta REAL NOT NULL DEFAULT 0,
        allowance_delta REAL NOT NULL DEFAULT 0,
        reason TEXT,
        created_by TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )""")

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
```

### 2.2. Sửa `database.py` (dòng ~2058)

Gắn hook vào cuối hàm `init_db()`:
```python
<<<< VĂN BẢN CŨ
    cur.execute("CREATE INDEX IF NOT EXISTS idx_staff_reminders_staff ON staff_reminders(staff_id, is_done)")

    # Nạp các mã chứng từ hiện hữu vào archived_codes nếu chưa có
====
    cur.execute("CREATE INDEX IF NOT EXISTS idx_staff_reminders_staff ON staff_reminders(staff_id, is_done)")

    # HRM: chấm công, tăng ca, tạm ứng, bảng lương, hoa hồng spa (services/hrm_schema.py)
    from services.hrm_schema import ensure_hrm_schema
    ensure_hrm_schema(cur)

    # Nạp các mã chứng từ hiện hữu vào archived_codes nếu chưa có
>>>>
```

### 2.3. Sửa `routers/settings.py` (dòng ~12)

Thêm quyền `payroll.manage` vào danh sách `PERM_KEYS`:
```python
<<<< VĂN BẢN CŨ
PERM_KEYS = ["pos.sell", "pos.edit_delete_order", "cashbook.manage", "purchases.manage",
             "partners.manage", "price_lists.manage", "inventory.manage", "inventory.view_cost", "oem.manage",
             "reports.view", "shifts.approve", "shifts.bypass", "settings.access", "spa.pick_date"]
====
PERM_KEYS = ["pos.sell", "pos.edit_delete_order", "cashbook.manage", "purchases.manage",
             "partners.manage", "price_lists.manage", "inventory.manage", "inventory.view_cost", "oem.manage",
             "reports.view", "shifts.approve", "shifts.bypass", "settings.access", "spa.pick_date",
             "payroll.manage"]
>>>>
```

### 2.4. Sửa `static/js/staff.js` (dòng ~170)

Thêm nhãn hiển thị cho quyền `payroll.manage`:
```javascript
<<<< VĂN BẢN CŨ
  "settings.access": "Truy cập Cài Đặt",
  "spa.pick_date": "Chọn ngày xem lịch Spa"
};
====
  "settings.access": "Truy cập Cài Đặt",
  "spa.pick_date": "Chọn ngày xem lịch Spa",
  "payroll.manage": "Quản lý Chấm công & Lương"
};
>>>>
```

---

## TASK 3: Engine Tính Lương & Chấm Công Thuần (Zero-Drift Decimal)

**Bối cảnh:** Port toàn bộ công thức tính toán từ Google Sheet thực tế của shop, đồng thời sửa triệt để 8 lỗi logic đã phát hiện:
1. Trễ 1 phút phạt đúng 5.000đ (dùng làm tròn phút số học thay vì `INT(N(Q)*1440)` bị floor về 0).
2. Tạm ứng lương chỉ trừ đúng tháng ứng.
3. Thử việc / chính thức xét theo ngày làm việc thực tế, không xét theo ngày hôm nay.
4. Không phạt "Off không phép" cho những ngày trước ngày nhận việc (`hire_date`).
5. Thưởng chuyên cần 500.000đ tự động cộng khi nhân viên đi làm đủ công chuẩn của khối và không có bất kỳ vi phạm thời gian làm việc nào trong tháng.
6. Thưởng sinh nhật 200.000đ tự động cộng trong tháng sinh nhật.

### 3.1. Tạo file `services/payroll_engine.py`

Tạo mới file `services/payroll_engine.py` với nội dung nguyên văn sau:

```python
"""Payroll engine thuần (không DB) — port quy tắc từ Google Sheet 'Bảng Lương' đã sửa lỗi.
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


def std_days(block: Block, year: int, month: int) -> int:
    """Tính số ngày công chuẩn theo tháng và khối."""
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
        return res
    if not d.punches:
        if d.is_holiday:
            res.code = "L"
        elif d.work_date.weekday() == 6 and b.off_sunday:
            res.code = "CN"
        else:
            res.violations.append("absent")
            res.penalty = 0 if d.waive else r.absent
        return res

    start, end = b.start, b.end
    if d.leave == "off_morning":
        start = b.split + b.lunch
    elif d.leave == "off_afternoon":
        end = b.split

    mn, mx = d.punches[0], d.punches[-1]
    if mn == mx:
        if mn < (start + end) // 2:
            cin, cout = mn, None
        else:
            cin, cout = None, mx
    else:
        cin, cout = mn, mx
    res.check_in, res.check_out = cin, cout

    pen = 0
    if cin is None:
        res.violations.append("missing_in")
        pen += r.missing_punch
    if cout is None:
        res.violations.append("missing_out")
        pen += r.missing_punch
    i_eff = cin if cin is not None else start
    o_eff = cout if cout is not None else end
    worked = max(0, o_eff - i_eff)
    if d.leave is None and b.lunch and i_eff < b.split and o_eff > b.split + b.lunch:
        worked -= b.lunch
    res.worked_min = worked

    credit = 1.0 if worked >= r.full_day_min else (0.5 if worked >= r.half_day_min else 0.0)
    if d.leave in ("off_morning", "off_afternoon"):
        credit = min(credit, 0.5)
    res.credit = credit
    base = "TV" if d.probation else "X"
    res.code = base if credit == 1.0 else (base + "/2" if credit == 0.5 else "")

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
    net = gross - Decimal(penalties) - Decimal(advances) - Decimal(deduction_other)
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
        "gross": _money(gross),
        "net": _money(net),
        "net_rounded": net_rounded,
    }
```

### 3.2. Tạo file `services/attendance_import.py`

Tạo mới file `services/attendance_import.py` để parse file Excel máy chấm công:

```python
"""Đọc file Excel máy chấm công (định dạng sheet 'CHI TIẾT CHẤM CÔNG') -> list dòng chuẩn hoá."""
import io
import re
import unicodedata
from datetime import date, datetime

import openpyxl

from services.payroll_engine import to_min, fmt_min


def _norm(s) -> str:
    s = unicodedata.normalize("NFD", str(s or "")).encode("ascii", "ignore").decode().lower()
    return re.sub(r"[^a-z0-9]", "", s)


HEADER_ALIASES = {
    "device_code": ["machamcong", "mamay", "userid", "enrollnumber", "acno"],
    "name": ["tennvien", "tennhanvien", "hoten", "name"],
    "work_date": ["ngay", "date", "ngaycham"],
    "punch": ["vao1", "ra1", "vao2", "ra2", "vao3", "ra3"],
}


def _parse_date(v):
    if isinstance(v, datetime):
        return v.date()
    if isinstance(v, date):
        return v
    s = str(v or "").strip()
    for fmt in ("%d/%m/%Y", "%Y-%m-%d", "%d-%m-%Y", "%d/%m/%y"):
        try:
            return datetime.strptime(s, fmt).date()
        except ValueError:
            pass
    return None


def _code(v) -> str:
    if v is None:
        return ""
    if isinstance(v, float) and v.is_integer():
        v = int(v)
    return str(v).strip()


def parse_attendance_xlsx(content: bytes) -> dict:
    """Trả {"rows": [{device_code, name, work_date(date), punches[list phút]}], "errors": [str]}."""
    wb = openpyxl.load_workbook(io.BytesIO(content), data_only=True, read_only=True)
    ws = wb.active
    header_row, cols = None, {}
    rows_iter = list(ws.iter_rows(values_only=True))
    for idx, row in enumerate(rows_iter[:15]):
        normed = [_norm(c) for c in row]
        if any(n in HEADER_ALIASES["device_code"] for n in normed) and any(n in HEADER_ALIASES["work_date"] for n in normed):
            header_row = idx
            for ci, n in enumerate(normed):
                for key, aliases in HEADER_ALIASES.items():
                    if n in aliases:
                        if key == "punch":
                            cols.setdefault("punch", []).append(ci)
                        else:
                            cols.setdefault(key, ci)
            break
    if header_row is None or "punch" not in cols:
        return {"rows": [], "errors": ["Không tìm thấy dòng tiêu đề (cần cột 'Mã chấm công', 'Ngày', 'Vào1'...'Ra3')."]}

    out, errors = [], []
    for i, row in enumerate(rows_iter[header_row + 1:], start=header_row + 2):
        code = _code(row[cols["device_code"]] if cols["device_code"] < len(row) else None)
        if not code:
            continue
        d = _parse_date(row[cols["work_date"]] if cols["work_date"] < len(row) else None)
        if not d:
            errors.append(f"Dòng {i}: ngày không hợp lệ")
            continue
        raw = [row[c] for c in cols["punch"] if c < len(row)]
        punches = sorted({m for m in (to_min(v) for v in raw) if m is not None})
        name = str(row[cols["name"]]).strip() if "name" in cols and cols["name"] < len(row) and row[cols["name"]] else ""
        out.append({"device_code": code, "name": name, "work_date": d, "punches": punches})
    return {"rows": out, "errors": errors}


def punches_to_json(punches) -> list:
    return [fmt_min(m) for m in punches]
```

### 3.3. Test Unit Cho Task 3

Tạo file `tests/test_payroll_engine.py`:
```python
from datetime import date
from decimal import Decimal

from services.payroll_engine import (
    Block, Rules, DayInput, classify_day, calc_payslip, std_days, parse_punches, to_min,
)

KHO = Block("Kho", start=480, end=1080, lunch=90, std_hours=8.5, off_sunday=False, monthly_off_days=2, split=720)
VP = Block("Văn Phòng", start=480, end=1050, lunch=90, std_hours=8.0, off_sunday=True, monthly_off_days=0, split=720)
R = Rules()


def day(d, punches=(), **kw):
    return classify_day(DayInput(work_date=d, punches=parse_punches(punches), **kw), KHO, R)


def test_to_min_formats():
    assert to_min("08:01") == 481
    assert to_min("8:01:59") == 481
    assert to_min(0.75) == 1080
    assert to_min("") is None and to_min("abc") is None


def test_std_days_oct_2026():
    assert std_days(VP, 2026, 10) == 27   # 31 - 4 CN (khớp sheet B11)
    assert std_days(KHO, 2026, 10) == 29  # 31 - 2 (khớp sheet B12)


def test_late_minutes_exact_not_floored():
    # Sheet cũ: trễ 1 phút = 0đ (lỗi INT số thực). Đúng: 1 phút = 5.000đ, 2 phút = 10.000đ
    assert day(date(2026, 10, 2), ["08:01", "18:04"]).penalty == 5000
    assert day(date(2026, 10, 8), ["08:02", "18:03"]).penalty == 10000


def test_late_30_min_flat():
    r = day(date(2026, 10, 2), ["08:30", "18:00"])
    assert r.late_min == 30 and r.penalty == 200000


def test_full_day_and_ot_suggestion():
    r = day(date(2026, 10, 3), ["08:01", "19:04"])
    assert r.code == "X" and r.credit == 1.0
    assert r.ot_suggest_hours == 1.0  # 64 phút -> MROUND 0.5 = 1.0


def test_missing_out_penalty_still_credited():
    r = day(date(2026, 10, 2), ["07:55"])
    assert r.violations == ["missing_out"] and r.penalty == 50000 and r.code == "X"


def test_absent_and_waive():
    assert day(date(2026, 10, 5)).penalty == 500000
    assert day(date(2026, 10, 5), waive=True).penalty == 0


def test_not_employed_no_penalty():
    # Sheet cũ phạt 500k cả những ngày trước ngày nhận việc
    r = day(date(2026, 10, 1), employed=False)
    assert r.penalty == 0 and r.code == ""


def test_half_day_leave_afternoon():
    r = day(date(2026, 10, 6), ["07:58", "12:00"], leave="off_afternoon")
    assert r.credit == 0.5 and r.code == "X/2" and r.penalty == 0


def test_probation_code_by_work_date():
    assert day(date(2026, 10, 2), ["08:00", "18:00"], probation=True).code == "TV"


def test_sunday_off_block():
    r = classify_day(DayInput(work_date=date(2026, 10, 4)), VP, R)
    assert r.code == "CN" and r.penalty == 0


def test_payslip_probation_full_month_and_attendance_bonus():
    # NV kho thử việc, lương 7.000.000, đi làm đúng đủ 29 ngày, nghỉ 2 ngày có phép
    days = []
    for d in range(1, 32):
        wd = date(2026, 10, d)
        if d in (11, 25):
            days.append(day(wd, leave="off", probation=True))
        else:
            days.append(day(wd, ["07:55", "18:00"], probation=True))
    p = calc_payslip(base_salary=7_000_000, allowance=0, std_days_month=29, std_hours=8.5, days=days)
    assert p["days_probation"] == 29.0
    assert p["pay_days"] == 5_950_000           # 85% x 7tr
    assert p["attendance_bonus"] == 500_000
    assert p["net_rounded"] == 6_450_000


def test_payslip_violation_kills_bonus_and_rounding():
    days = [day(date(2026, 10, d), ["08:00", "18:00"]) for d in range(1, 30)]
    days[0] = day(date(2026, 10, 1), ["08:01", "18:00"])  # trễ 1 phút
    p = calc_payslip(base_salary=8_000_000, allowance=1_000_000, std_days_month=29, std_hours=8.5,
                     days=days, ot_hours_official=2, advances=2_000_000)
    assert p["attendance_bonus"] == 0
    assert p["penalties"] == 5000
    # OT: 8tr/29/8.5*1.5*2 = 97.363,08 -> 97.363
    assert p["ot_pay"] == 97363
    # 8tr + 1tr + 97.363 - 5.000 - 2tr = 7.092.363 -> 7.092.000
    assert p["net_rounded"] == 7_092_000


def test_holiday_not_worked_paid():
    hol = classify_day(DayInput(work_date=date(2026, 9, 2), is_holiday=True), VP, R)
    assert hol.code == "L"
    p = calc_payslip(base_salary=2_700_000, allowance=0, std_days_month=27, std_hours=8, days=[hol])
    assert p["holiday_pay"] == 100_000
```

Lệnh chạy kiểm tra:
```bash
.venv/Scripts/python.exe -m pytest tests/test_payroll_engine.py -v
```

---

## TASK 4: Payroll Lifecycle Service & Tích Hợp Sổ Quỹ

**Bối cảnh:** Vòng đời bảng lương gồm 3 trạng thái: `draft` (tính tạm, cho phép sửa số tay, sửa công) $\rightarrow$ `locked` (chốt lương, đóng băng snapshot, khóa không cho sửa công tháng đó) $\rightarrow$ `paid` (chi tiền qua Sổ Quỹ mã `PC-LG-{yymmdd}-{stt}`). Khi xóa phiếu chi lương ở Sổ Quỹ, bảng lương tự động mở trạng thái về chưa trả.

### 4.1. Tạo file `services/payroll_service.py`

Tạo mới file `services/payroll_service.py` với nội dung nguyên văn sau:

```python
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
```

### 4.2. Sửa `routers/cashbook.py` (dòng ~462)

Hook `on_cashbook_deleted` khi người dùng xóa phiếu chi ở Sổ Quỹ:
```python
<<<< VĂN BẢN CŨ
    cur.execute("UPDATE expense_requests SET status = 'pending', cashbook_id = NULL WHERE cashbook_id = ?", (voucher_id,))
    cur.execute("DELETE FROM cashbook WHERE id = ?", (voucher_id,))
    conn.commit()
    conn.close()
====
    cur.execute("UPDATE expense_requests SET status = 'pending', cashbook_id = NULL WHERE cashbook_id = ?", (voucher_id,))
    from services.payroll_service import on_cashbook_deleted
    on_cashbook_deleted(cur, voucher_id)
    cur.execute("DELETE FROM cashbook WHERE id = ?", (voucher_id,))
    conn.commit()
    conn.close()
>>>>
```

---

## TASK 5: Router API `/api/hrm` & Phân Quyền RBAC

### 5.1. Tạo file `routers/hrm.py`

Tạo mới file `routers/hrm.py` với nội dung nguyên văn sau:

```python
"""HRM: hồ sơ lương, chấm công (import máy vân tay), tăng ca, tạm ứng, hoa hồng spa, bảng lương."""
import json
from datetime import date, datetime
from typing import List, Optional

from fastapi import APIRouter, Depends, File, HTTPException, Query, UploadFile
from fastapi.responses import StreamingResponse
from pydantic import BaseModel

from database import get_db
from dependencies import require_permission
from services import payroll_service as ps
from services.attendance_import import parse_attendance_xlsx, punches_to_json
from services.payroll_engine import to_min

router = APIRouter(prefix="/api/hrm", tags=["HRM & Payroll"])
PERM = "payroll.manage"
PROFILE_FIELDS = ("employee_code", "device_code", "work_block_id", "position", "base_salary", "allowance",
                  "bank_account", "bank_name", "bank_branch", "birthday", "hire_date", "probation_start",
                  "official_date", "leave_date", "is_spa_worker", "commission_rate")


def _uname(user) -> str:
    return (user.get("name") if isinstance(user, dict) else None) or "Quản trị viên"


def _date_or_none(v, field):
    if v in (None, ""):
        return None
    try:
        return date.fromisoformat(str(v)[:10]).isoformat()
    except ValueError:
        raise HTTPException(400, f"{field} không hợp lệ (YYYY-MM-DD)")


# ── Cấu hình ──
class BlockIn(BaseModel):
    name: str
    start_time: str
    end_time: str
    lunch_minutes: int = 0
    std_hours: float = 8
    off_sunday: int = 0
    monthly_off_days: int = 0
    split_time: str = "12:00"


@router.get("/config")
def get_config(user=Depends(require_permission(PERM))):
    conn = get_db(); cur = conn.cursor()
    cur.execute("SELECT * FROM hrm_work_blocks ORDER BY id")
    blocks = [dict(r) for r in cur.fetchall()]
    cur.execute("SELECT * FROM hrm_holidays ORDER BY holiday_date")
    holidays = [dict(r) for r in cur.fetchall()]
    cur.execute("SELECT value FROM settings WHERE key='hrm_rules'")
    row = cur.fetchone()
    cur.execute("SELECT * FROM spa_commission_rules ORDER BY role_key, id")
    spa_rules = [dict(r) for r in cur.fetchall()]
    conn.close()
    return {"blocks": blocks, "holidays": holidays, "rules": json.loads(row["value"]) if row else {}, "spa_rules": spa_rules}


@router.put("/config/rules")
def update_rules(body: dict, user=Depends(require_permission(PERM))):
    conn = get_db(); cur = conn.cursor()
    cur.execute("SELECT value FROM settings WHERE key='hrm_rules'")
    cur_rules = json.loads(cur.fetchone()["value"])
    for k, v in body.items():
        if k not in cur_rules:
            raise HTTPException(400, f"Tham số không hợp lệ: {k}")
        try:
            if float(v) < 0:
                raise ValueError
        except (TypeError, ValueError):
            raise HTTPException(400, f"Giá trị không hợp lệ: {k}")
        cur_rules[k] = v
    cur.execute("UPDATE settings SET value=? WHERE key='hrm_rules'", (json.dumps(cur_rules),))
    conn.commit(); conn.close()
    return {"status": "ok", "rules": cur_rules}


@router.put("/config/blocks/{block_id}")
def update_block(block_id: int, b: BlockIn, user=Depends(require_permission(PERM))):
    for t in (b.start_time, b.end_time, b.split_time):
        if to_min(t) is None:
            raise HTTPException(400, f"Giờ không hợp lệ: {t}")
    conn = get_db(); cur = conn.cursor()
    cur.execute("""UPDATE hrm_work_blocks SET name=?, start_time=?, end_time=?, lunch_minutes=?, std_hours=?,
                   off_sunday=?, monthly_off_days=?, split_time=? WHERE id=?""",
                (b.name.strip(), b.start_time, b.end_time, b.lunch_minutes, b.std_hours, int(bool(b.off_sunday)),
                 b.monthly_off_days, b.split_time, block_id))
    if cur.rowcount == 0:
        conn.close(); raise HTTPException(404, "Không tìm thấy khối làm việc")
    conn.commit(); conn.close()
    return {"status": "ok"}


class HolidayIn(BaseModel):
    holiday_date: str
    name: str


@router.post("/config/holidays")
def add_holiday(h: HolidayIn, user=Depends(require_permission(PERM))):
    d = _date_or_none(h.holiday_date, "Ngày lễ")
    conn = get_db(); cur = conn.cursor()
    cur.execute("INSERT OR REPLACE INTO hrm_holidays (holiday_date, name) VALUES (?, ?)", (d, h.name.strip()))
    conn.commit(); conn.close()
    return {"status": "ok"}


@router.delete("/config/holidays/{holiday_date}")
def delete_holiday(holiday_date: str, user=Depends(require_permission(PERM))):
    conn = get_db(); cur = conn.cursor()
    cur.execute("DELETE FROM hrm_holidays WHERE holiday_date=?", (holiday_date,))
    conn.commit(); conn.close()
    return {"status": "ok"}


class SpaRuleIn(BaseModel):
    role_key: str
    service_name: Optional[str] = None
    rate_type: str
    value: float
    is_active: int = 1


@router.post("/config/spa-rules")
def add_spa_rule(r: SpaRuleIn, user=Depends(require_permission(PERM))):
    if r.role_key not in ("receiver", "worker_1", "worker_2", "cutter", "dyer") or r.rate_type not in ("percent", "fixed") or r.value < 0:
        raise HTTPException(400, "Quy tắc hoa hồng không hợp lệ")
    if r.rate_type == "percent" and r.value > 100:
        raise HTTPException(400, "Phần trăm phải từ 0 đến 100")
    conn = get_db(); cur = conn.cursor()
    cur.execute("INSERT INTO spa_commission_rules (role_key, service_name, rate_type, value, is_active) VALUES (?,?,?,?,?)",
                (r.role_key, (r.service_name or "").strip() or None, r.rate_type, r.value, r.is_active))
    conn.commit(); new_id = cur.lastrowid; conn.close()
    return {"status": "ok", "id": new_id}


@router.delete("/config/spa-rules/{rule_id}")
def delete_spa_rule(rule_id: int, user=Depends(require_permission(PERM))):
    conn = get_db(); cur = conn.cursor()
    cur.execute("DELETE FROM spa_commission_rules WHERE id=?", (rule_id,))
    conn.commit(); conn.close()
    return {"status": "ok"}


# ── Hồ sơ nhân sự ──
class ProfileIn(BaseModel):
    employee_code: Optional[str] = None
    device_code: Optional[str] = None
    work_block_id: Optional[int] = None
    position: Optional[str] = None
    base_salary: Optional[float] = None
    allowance: Optional[float] = None
    bank_account: Optional[str] = None
    bank_name: Optional[str] = None
    bank_branch: Optional[str] = None
    birthday: Optional[str] = None
    hire_date: Optional[str] = None
    probation_start: Optional[str] = None
    official_date: Optional[str] = None
    leave_date: Optional[str] = None
    is_spa_worker: Optional[int] = None
    commission_rate: Optional[float] = None


@router.get("/employees")
def list_employees(user=Depends(require_permission(PERM))):
    conn = get_db(); cur = conn.cursor()
    cur.execute(f"""SELECT s.id, s.name, s.phone, s.role, s.is_active, s.username, {', '.join('s.' + f for f in PROFILE_FIELDS)},
                   b.name AS block_name FROM staff s LEFT JOIN hrm_work_blocks b ON b.id = s.work_block_id
                   ORDER BY s.is_active DESC, COALESCE(s.employee_code,'zz'), s.id""")
    rows = [dict(r) for r in cur.fetchall()]
    conn.close()
    return rows


class EmployeeCreate(ProfileIn):
    name: str
    phone: Optional[str] = ""


@router.post("/employees")
def create_employee(body: EmployeeCreate, user=Depends(require_permission(PERM))):
    """Tạo nhân viên KHÔNG có tài khoản đăng nhập (thợ spa, NV kho...). Tài khoản đăng nhập tạo ở Cài đặt > Nhân viên."""
    if not body.name.strip():
        raise HTTPException(400, "Tên nhân viên bắt buộc")
    conn = get_db(); cur = conn.cursor()
    cur.execute("INSERT INTO staff (name, phone, role, is_active, commission_rate) VALUES (?, ?, 'staff', 1, 0)", (body.name.strip(), body.phone or ""))
    sid = cur.lastrowid
    conn.commit(); conn.close()
    update_profile(sid, ProfileIn(**body.model_dump(exclude={"name", "phone"})), user)
    return {"status": "ok", "id": sid}


@router.put("/employees/{staff_id}")
def update_profile(staff_id: int, body: ProfileIn, user=Depends(require_permission(PERM))):
    data = body.model_dump(exclude_unset=True)
    for f in ("birthday", "hire_date", "probation_start", "official_date", "leave_date"):
        if f in data:
            data[f] = _date_or_none(data[f], f)
    for f in ("base_salary", "allowance", "commission_rate"):
        if f in data and data[f] is not None and data[f] < 0:
            raise HTTPException(400, f"{f} không được âm")
    if data.get("commission_rate") is not None and data["commission_rate"] > 100:
        raise HTTPException(400, "Hoa hồng % phải từ 0 đến 100")
    for f in ("employee_code", "device_code"):
        if f in data:
            data[f] = (data[f] or "").strip() or None
    if not data:
        raise HTTPException(400, "Không có trường nào để cập nhật")
    conn = get_db(); cur = conn.cursor()
    cur.execute("SELECT id FROM staff WHERE id=?", (staff_id,))
    if not cur.fetchone():
        conn.close(); raise HTTPException(404, "Không tìm thấy nhân viên")
    try:
        cur.execute(f"UPDATE staff SET {', '.join(k + '=?' for k in data)} WHERE id=?", (*data.values(), staff_id))
    except Exception as e:
        conn.close()
        if "UNIQUE" in str(e):
            raise HTTPException(400, "Mã nhân viên hoặc mã chấm công đã được dùng cho người khác")
        raise
    conn.commit(); conn.close()
    return {"status": "ok"}


class AdjustmentIn(BaseModel):
    effective_date: str
    base_delta: float = 0
    allowance_delta: float = 0
    reason: Optional[str] = ""


@router.get("/employees/{staff_id}/adjustments")
def list_adjustments(staff_id: int, user=Depends(require_permission(PERM))):
    conn = get_db(); cur = conn.cursor()
    cur.execute("SELECT * FROM hrm_salary_adjustments WHERE staff_id=? ORDER BY effective_date DESC, id DESC", (staff_id,))
    rows = [dict(r) for r in cur.fetchall()]
    conn.close()
    return rows


@router.post("/employees/{staff_id}/adjustments")
def add_adjustment(staff_id: int, a: AdjustmentIn, user=Depends(require_permission(PERM))):
    d = _date_or_none(a.effective_date, "Ngày áp dụng")
    if not d or (a.base_delta == 0 and a.allowance_delta == 0):
        raise HTTPException(400, "Cần ngày áp dụng và số tiền điều chỉnh")
    conn = get_db(); cur = conn.cursor()
    ps.assert_month_open(cur, d)
    cur.execute("INSERT INTO hrm_salary_adjustments (staff_id, effective_date, base_delta, allowance_delta, reason, created_by) VALUES (?,?,?,?,?,?)",
                (staff_id, d, a.base_delta, a.allowance_delta, a.reason or "", _uname(user)))
    conn.commit(); conn.close()
    return {"status": "ok"}


# ── Chấm công ──
@router.post("/attendance/import")
async def import_attendance(file: UploadFile = File(...), user=Depends(require_permission(PERM))):
    if not (file.filename or "").lower().endswith((".xlsx", ".xlsm")):
        raise HTTPException(400, "Chỉ nhận file Excel .xlsx")
    content = await file.read()
    if len(content) > 10 * 1024 * 1024:
        raise HTTPException(400, "File quá lớn (tối đa 10MB)")
    try:
        parsed = parse_attendance_xlsx(content)
    except Exception:
        raise HTTPException(400, "Không đọc được file Excel")
    conn = get_db(); cur = conn.cursor()
    cur.execute("SELECT id, device_code FROM staff WHERE device_code IS NOT NULL AND device_code != ''")
    by_code = {r["device_code"]: r["id"] for r in cur.fetchall()}
    imported, skipped_manual, locked = 0, 0, 0
    unknown = {}
    for row in parsed["rows"]:
        sid = by_code.get(row["device_code"])
        if not sid:
            unknown[row["device_code"]] = row["name"]
            continue
        if ps.month_status(cur, row["work_date"].year, row["work_date"].month) != "draft":
            locked += 1
            continue
        cur.execute("SELECT source FROM staff_attendance WHERE staff_id=? AND work_date=?", (sid, row["work_date"].isoformat()))
        ex = cur.fetchone()
        if ex and ex["source"] == "manual":
            skipped_manual += 1
            continue
        cur.execute("""INSERT INTO staff_attendance (staff_id, work_date, punches, source, updated_by, updated_at)
                       VALUES (?, ?, ?, 'device', ?, CURRENT_TIMESTAMP)
                       ON CONFLICT(staff_id, work_date) DO UPDATE SET punches=excluded.punches, updated_by=excluded.updated_by, updated_at=CURRENT_TIMESTAMP""",
                    (sid, row["work_date"].isoformat(), json.dumps(punches_to_json(row["punches"])), _uname(user)))
        imported += 1
    conn.commit(); conn.close()
    return {"status": "ok", "imported": imported, "skipped_manual": skipped_manual, "skipped_locked": locked,
            "unknown_codes": [{"device_code": k, "name": v} for k, v in unknown.items()], "errors": parsed["errors"]}


@router.get("/attendance")
def attendance_grid(month: str = Query(...), user=Depends(require_permission(PERM))):
    y, m, first, last = ps.parse_month(month)
    conn = get_db(); cur = conn.cursor()
    rules, blocks = ps.load_rules(cur), ps.load_blocks(cur)
    out = []
    for s in ps.payroll_staff(cur, first):
        block = blocks.get(s["work_block_id"])
        days = [ps.day_to_dict(d) for d in ps.build_days(cur, s, block, rules, first, last, date.today())] if block else []
        cur.execute("SELECT work_date, punches, leave_type, waive, note, source FROM staff_attendance WHERE staff_id=? AND work_date BETWEEN ? AND ?",
                    (s["id"], first.isoformat(), last.isoformat()))
        raw = {r["work_date"]: dict(r) for r in cur.fetchall()}
        for d in days:
            r = raw.get(d["date"]) or {}
            d.update({"punches": json.loads(r.get("punches") or "[]"), "leave_type": r.get("leave_type"),
                      "waive": bool(r.get("waive")), "note": r.get("note") or "", "source": r.get("source")})
        out.append({"staff_id": s["id"], "name": s["name"], "employee_code": s["employee_code"] or "",
                    "block": block.name if block else "", "days": days,
                    "credit": sum(d["credit"] for d in days), "penalty": sum(d["penalty"] for d in days),
                    "ot_suggest_hours": sum(d["ot_suggest_hours"] for d in days)})
    status = ps.month_status(cur, y, m)
    conn.close()
    return {"month": month, "status": status, "days_in_month": last.day, "employees": out}


class AttendanceIn(BaseModel):
    staff_id: int
    work_date: str
    punches: List[str] = []
    leave_type: Optional[str] = None
    waive: bool = False
    note: Optional[str] = ""


@router.put("/attendance")
def upsert_attendance(a: AttendanceIn, user=Depends(require_permission(PERM))):
    d = _date_or_none(a.work_date, "Ngày")
    if a.leave_type not in (None, "", "off", "off_morning", "off_afternoon"):
        raise HTTPException(400, "Loại nghỉ không hợp lệ")
    punches = sorted({to_min(p) for p in a.punches if to_min(p) is not None})
    conn = get_db(); cur = conn.cursor()
    ps.assert_month_open(cur, d)
    cur.execute("""INSERT INTO staff_attendance (staff_id, work_date, punches, leave_type, waive, note, source, updated_by, updated_at)
                   VALUES (?, ?, ?, ?, ?, ?, 'manual', ?, CURRENT_TIMESTAMP)
                   ON CONFLICT(staff_id, work_date) DO UPDATE SET punches=excluded.punches, leave_type=excluded.leave_type,
                   waive=excluded.waive, note=excluded.note, source='manual', updated_by=excluded.updated_by, updated_at=CURRENT_TIMESTAMP""",
                (a.staff_id, d, json.dumps([f"{p // 60:02d}:{p % 60:02d}" for p in punches]), a.leave_type or None,
                 int(a.waive), a.note or "", _uname(user)))
    conn.commit(); conn.close()
    return {"status": "ok"}


# ── Tăng ca ──
class OvertimeIn(BaseModel):
    staff_id: int
    work_date: str
    hours: float
    note: Optional[str] = ""


@router.get("/overtime")
def list_overtime(month: str = Query(...), user=Depends(require_permission(PERM))):
    y, m, first, last = ps.parse_month(month)
    conn = get_db(); cur = conn.cursor()
    cur.execute("""SELECT o.*, s.name FROM staff_overtime o JOIN staff s ON s.id=o.staff_id
                   WHERE o.work_date BETWEEN ? AND ? ORDER BY o.work_date, s.name""", (first.isoformat(), last.isoformat()))
    rows = [dict(r) for r in cur.fetchall()]
    conn.close()
    return rows


@router.post("/overtime")
def approve_overtime(o: OvertimeIn, user=Depends(require_permission(PERM))):
    d = _date_or_none(o.work_date, "Ngày")
    if o.hours <= 0 or o.hours > 12:
        raise HTTPException(400, "Số giờ tăng ca phải từ 0 đến 12")
    conn = get_db(); cur = conn.cursor()
    ps.assert_month_open(cur, d)
    cur.execute("""INSERT INTO staff_overtime (staff_id, work_date, hours, note, approved_by) VALUES (?,?,?,?,?)
                   ON CONFLICT(staff_id, work_date) DO UPDATE SET hours=excluded.hours, note=excluded.note, approved_by=excluded.approved_by""",
                (o.staff_id, d, o.hours, o.note or "", _uname(user)))
    conn.commit(); conn.close()
    return {"status": "ok"}


@router.delete("/overtime/{ot_id}")
def delete_overtime(ot_id: int, user=Depends(require_permission(PERM))):
    conn = get_db(); cur = conn.cursor()
    cur.execute("SELECT work_date FROM staff_overtime WHERE id=?", (ot_id,))
    row = cur.fetchone()
    if not row:
        conn.close(); raise HTTPException(404, "Không tìm thấy")
    ps.assert_month_open(cur, row["work_date"])
    cur.execute("DELETE FROM staff_overtime WHERE id=?", (ot_id,))
    conn.commit(); conn.close()
    return {"status": "ok"}


# ── Tạm ứng ──
class AdvanceIn(BaseModel):
    staff_id: int
    advance_date: str
    amount: float
    note: Optional[str] = ""
    account_id: Optional[int] = None  # có -> sinh phiếu chi "Tạm ứng lương"


@router.get("/advances")
def list_advances(month: str = Query(...), user=Depends(require_permission(PERM))):
    y, m, first, last = ps.parse_month(month)
    conn = get_db(); cur = conn.cursor()
    cur.execute("""SELECT a.*, s.name, c.code AS cashbook_code FROM staff_advances a JOIN staff s ON s.id=a.staff_id
                   LEFT JOIN cashbook c ON c.id=a.cashbook_id WHERE a.advance_date BETWEEN ? AND ? ORDER BY a.advance_date""",
                (first.isoformat(), last.isoformat()))
    rows = [dict(r) for r in cur.fetchall()]
    conn.close()
    return rows


@router.post("/advances")
def create_advance(a: AdvanceIn, user=Depends(require_permission(PERM))):
    from routers.cashbook import generate_cashbook_code
    d = _date_or_none(a.advance_date, "Ngày ứng")
    if a.amount <= 0:
        raise HTTPException(400, "Số tiền ứng phải lớn hơn 0")
    conn = get_db(); cur = conn.cursor()
    ps.assert_month_open(cur, d)
    cur.execute("SELECT name FROM staff WHERE id=?", (a.staff_id,))
    st = cur.fetchone()
    if not st:
        conn.close(); raise HTTPException(404, "Không tìm thấy nhân viên")
    cb_id = None
    if a.account_id:
        code = generate_cashbook_code(cur, "PC-UL")
        cur.execute("""INSERT INTO cashbook (code, type, category, amount, ref_type, note, account_id, fund_source, created_by, created_at)
                       VALUES (?, 'out', ?, ?, 'salary_advance', ?, ?, 'COMPANY', ?, ?)""",
                    (code, ps.ADVANCE_CATEGORY, a.amount, f"Tạm ứng lương - {st['name']}", a.account_id, _uname(user),
                     f"{d} {datetime.now().strftime('%H:%M:%S')}"))
        cb_id = cur.lastrowid
    cur.execute("INSERT INTO staff_advances (staff_id, advance_date, amount, note, cashbook_id, created_by) VALUES (?,?,?,?,?,?)",
                (a.staff_id, d, a.amount, a.note or "", cb_id, _uname(user)))
    if cb_id:
        cur.execute("UPDATE cashbook SET ref_id=? WHERE id=?", (cur.lastrowid, cb_id))
    conn.commit(); conn.close()
    return {"status": "ok", "cashbook_id": cb_id}


@router.delete("/advances/{adv_id}")
def delete_advance(adv_id: int, user=Depends(require_permission(PERM))):
    conn = get_db(); cur = conn.cursor()
    cur.execute("SELECT * FROM staff_advances WHERE id=?", (adv_id,))
    row = cur.fetchone()
    if not row:
        conn.close(); raise HTTPException(404, "Không tìm thấy")
    ps.assert_month_open(cur, row["advance_date"])
    if row["cashbook_id"]:
        conn.close(); raise HTTPException(400, "Khoản ứng có phiếu chi, xóa phiếu chi ở Sổ Quỹ (khoản ứng tự xóa theo)")
    cur.execute("DELETE FROM staff_advances WHERE id=?", (adv_id,))
    conn.commit(); conn.close()
    return {"status": "ok"}


# ── Bảng lương ──
@router.get("/payroll/{month}")
def get_payroll(month: str, user=Depends(require_permission(PERM))):
    conn = get_db(); cur = conn.cursor()
    res = ps.get_period(cur, month)
    conn.close()
    return res


@router.post("/payroll/{month}/calculate")
def calculate_payroll(month: str, user=Depends(require_permission(PERM))):
    conn = get_db(); cur = conn.cursor()
    try:
        res = ps.calculate_period(cur, month)
        conn.commit()
        return res
    finally:
        conn.close()


class ManualIn(BaseModel):
    bonus_other: Optional[float] = None
    fuel_other: Optional[float] = None
    deduction_other: Optional[float] = None
    manual_note: Optional[str] = None


@router.put("/payroll/{month}/lines/{staff_id}")
def update_payroll_line(month: str, staff_id: int, body: ManualIn, user=Depends(require_permission(PERM))):
    for k in ("bonus_other", "fuel_other", "deduction_other"):
        v = getattr(body, k)
        if v is not None and v < 0:
            raise HTTPException(400, f"{k} không được âm")
    conn = get_db(); cur = conn.cursor()
    try:
        res = ps.update_manual(cur, month, staff_id, body.model_dump())
        conn.commit()
        return res
    finally:
        conn.close()


@router.post("/payroll/{month}/lock")
def lock_payroll(month: str, user=Depends(require_permission(PERM))):
    conn = get_db(); cur = conn.cursor()
    try:
        res = ps.lock_period(cur, month, _uname(user))
        conn.commit()
        return res
    finally:
        conn.close()


@router.post("/payroll/{month}/unlock")
def unlock_payroll(month: str, user=Depends(require_permission(PERM))):
    if user.get("role") not in ("owner", "admin"):
        raise HTTPException(403, "Chỉ chủ cửa hàng được mở khóa bảng lương")
    conn = get_db(); cur = conn.cursor()
    try:
        res = ps.unlock_period(cur, month)
        conn.commit()
        return res
    finally:
        conn.close()


class PayIn(BaseModel):
    account_id: int
    staff_ids: Optional[List[int]] = None


@router.post("/payroll/{month}/pay")
def pay_payroll(month: str, body: PayIn, user=Depends(require_permission("cashbook.manage"))):
    from dependencies import check_permission
    if user.get("role") not in ("owner", "admin") and not check_permission(user["id"], user.get("role", ""), PERM):
        raise HTTPException(403, "Không có quyền truy cập")
    conn = get_db(); cur = conn.cursor()
    try:
        res = ps.pay_period(cur, month, body.account_id, body.staff_ids, _uname(user))
        conn.commit()
        return res
    finally:
        conn.close()


@router.get("/payroll/{month}/export")
def export_payroll(month: str, user=Depends(require_permission(PERM))):
    import io
    import openpyxl
    from openpyxl.styles import Font
    from openpyxl.utils import get_column_letter
    conn = get_db(); cur = conn.cursor()
    data = ps.get_period(cur, month)
    conn.close()
    wb = openpyxl.Workbook()
    ws = wb.active
    ws.title = "Bang_Luong"
    cols = [("Mã NV", "employee_code"), ("Họ tên", "name"), ("Khối", "block"), ("Công chuẩn", "std_days"),
            ("Công CT", "days_official"), ("Công TV", "days_probation"), ("Lương CB", "base_salary"),
            ("Lương theo công", "pay_days"), ("Phụ cấp", "allowance"), ("Xăng xe/Khác", "fuel_other"),
            ("Lương lễ", "holiday_pay"), ("Hoa hồng bán", "commission"), ("Hoa hồng spa", "spa_commission"),
            ("Tip", "tips"), ("Thưởng SN", "birthday_bonus"), ("Chuyên cần", "attendance_bonus"),
            ("Thưởng khác", "bonus_other"), ("Giờ OT CT", "ot_hours_official"), ("Giờ OT TV", "ot_hours_probation"),
            ("Tiền OT", "ot_pay"), ("Phạt", "penalties"), ("Tạm ứng", "advances"), ("Trừ khác", "deduction_other"),
            ("Thực lãnh", "net_pay"), ("Phiếu chi", "cashbook_code")]
    ws.append([f"BẢNG LƯƠNG THÁNG {month[5:]}/{month[:4]} — {data['status'].upper()}"])
    ws.append([c[0] for c in cols])
    for c in ws[2]:
        c.font = Font(bold=True)
    for line in data["lines"]:
        ws.append([line.get(k, "") for _, k in cols])
    ws.append(["", "TỔNG"] + [""] * (len(cols) - 3) + [data["totals"].get("net_pay", 0)])
    for i in range(1, len(cols) + 1):
        ws.column_dimensions[get_column_letter(i)].width = 14
    ws2 = wb.create_sheet("Chuyen_khoan")
    ws2.append(["STT", "Mã NV", "Tên thụ hưởng", "Số tài khoản", "Ngân hàng", "Chi nhánh", "Số tiền", "Nội dung"])
    conn = get_db(); cur = conn.cursor()
    n = 0
    for line in data["lines"]:
        if line.get("net_pay", 0) <= 0:
            continue
        cur.execute("SELECT bank_account, bank_name, bank_branch FROM staff WHERE id=?", (line["staff_id"],))
        b = cur.fetchone()
        n += 1
        ws2.append([n, line.get("employee_code"), line.get("name"), b["bank_account"] or "", b["bank_name"] or "",
                    b["bank_branch"] or "", line["net_pay"], f"Luong T{month[5:]}/{month[:4]} {line.get('employee_code') or ''}"])
    conn.close()
    buf = io.BytesIO()
    wb.save(buf); buf.seek(0)
    return StreamingResponse(buf, media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
                             headers={"Content-Disposition": f'attachment; filename="Bang_Luong_{month}.xlsx"'})
```

### 5.2. Sửa `server.py` (dòng ~102 & ~470)

Import router mới:
```python
<<<< VĂN BẢN CŨ
from routers.hotel import router as hotel_router
from routers.ai_assistant import router as ai_assistant_router
from routers.marketplace import router as marketplace_router
====
from routers.hotel import router as hotel_router
from routers.ai_assistant import router as ai_assistant_router
from routers.marketplace import router as marketplace_router
from routers.hrm import router as hrm_router
>>>>
```

Và đăng ký router vào danh sách:
```python
<<<< VĂN BẢN CŨ
    hotel_router, ai_assistant_router, marketplace_router,
):
    app.include_router(_r, dependencies=_LOGIN_REQUIRED)
====
    hotel_router, ai_assistant_router, marketplace_router, hrm_router,
):
    app.include_router(_r, dependencies=_LOGIN_REQUIRED)
>>>>
```

### 5.3. Test Integration Cho Task 5

Tạo file `tests/test_hrm_payroll_api.py`:
```python
import io
import json
import openpyxl
import pytest
from fastapi.testclient import TestClient

import database
from server import app
from tests.auth_helpers import owner_auth_headers, staff_auth_headers

client = TestClient(app, headers=owner_auth_headers())
MONTH = "2025-03"  # tháng 31 ngày, Kho công chuẩn 29


def _db():
    return database.get_db()


@pytest.fixture
def kho_emp():
    conn = _db(); cur = conn.cursor()
    cur.execute("DELETE FROM payroll_periods WHERE month = ?", (MONTH,))
    cur.execute("DELETE FROM staff WHERE employee_code IN ('TST01','TST02')")
    conn.commit()
    kho = cur.execute("SELECT id FROM hrm_work_blocks WHERE name='Kho'").fetchone()[0]
    conn.close()
    r = client.post("/api/hrm/employees", json={
        "name": "NV Test Kho", "employee_code": "TST01", "device_code": "9901", "work_block_id": kho,
        "base_salary": 7_000_000, "allowance": 0, "hire_date": "2025-03-01", "probation_start": "2025-03-01",
        "official_date": "2025-03-16", "bank_account": "0001", "bank_name": "TPBank"})
    assert r.status_code == 200, r.text
    yield r.json()["id"]
    conn = _db(); cur = conn.cursor()
    cur.execute("DELETE FROM payroll_periods WHERE month = ?", (MONTH,))
    cur.execute("DELETE FROM cashbook WHERE ref_type IN ('payroll','salary_advance') AND note LIKE '%NV Test Kho%'")
    cur.execute("DELETE FROM staff WHERE employee_code IN ('TST01','TST02')")
    conn.commit(); conn.close()


def _xlsx(rows):
    wb = openpyxl.Workbook(); ws = wb.active
    ws.append(["Mã chấm công", "Tên N.Viên", "Phòng ban", "Chức vụ", "Ngày", "Thứ", "Vào1", "Ra1", "Vào2", "Ra2", "Vào3", "Ra3"])
    for r in rows:
        ws.append(r)
    buf = io.BytesIO(); wb.save(buf)
    return ("cc.xlsx", buf.getvalue(), "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")


def _full_month_rows(code="9901", skip=(), late_day=None):
    rows = []
    for d in range(1, 32):
        if d in skip:
            continue
        vin = "08:01" if d == late_day else "07:55"
        rows.append([int(code), "NV Test Kho", "Kho", "NV", f"{d:02d}/03/2025", "", vin, "18:00", None, None, None, None])
    return rows


def _line(res, sid):
    return [l for l in res["lines"] if l["staff_id"] == sid][0]


def test_import_unknown_code_reported_and_manual_kept(kho_emp):
    client.put("/api/hrm/attendance", json={"staff_id": kho_emp, "work_date": "2025-03-03", "punches": ["08:00", "18:00"], "note": "sửa tay"})
    r = client.post("/api/hrm/attendance/import", files={"file": _xlsx([
        [9901, "NV Test Kho", "", "", "03/03/2025", "", "09:00", "18:00"],
        [9901, "NV Test Kho", "", "", "04/03/2025", "", "07:59", "18:00"],
        [7777, "Người lạ", "", "", "04/03/2025", "", "08:00", "18:00"],
    ])})
    body = r.json()
    assert r.status_code == 200, r.text
    assert body["imported"] == 1 and body["skipped_manual"] == 1
    assert body["unknown_codes"] == [{"device_code": "7777", "name": "Người lạ"}]
    conn = _db()
    p = conn.execute("SELECT punches FROM staff_attendance WHERE staff_id=? AND work_date='2025-03-03'", (kho_emp,)).fetchone()[0]
    conn.close()
    assert json.loads(p) == ["08:00", "18:00"]


def test_full_month_split_probation_attendance_bonus(kho_emp):
    client.post("/api/hrm/attendance/import", files={"file": _xlsx(_full_month_rows(skip=(10, 20)))})
    for d in ("2025-03-10", "2025-03-20"):
        assert client.put("/api/hrm/attendance", json={"staff_id": kho_emp, "work_date": d, "leave_type": "off"}).status_code == 200
    res = client.post(f"/api/hrm/payroll/{MONTH}/calculate").json()
    line = _line(res, kho_emp)
    assert line["std_days"] == 29
    assert line["days_probation"] == 14.0 and line["days_official"] == 15.0
    assert line["pay_days"] == 6_493_103
    assert line["penalties"] == 0
    assert line["attendance_bonus"] == 500_000
    assert line["net_rounded"] == 6_993_000


def test_late_one_minute_penalty_and_no_attendance_bonus(kho_emp):
    client.post("/api/hrm/attendance/import", files={"file": _xlsx(_full_month_rows(skip=(10, 20), late_day=5))})
    for d in ("2025-03-10", "2025-03-20"):
        client.put("/api/hrm/attendance", json={"staff_id": kho_emp, "work_date": d, "leave_type": "off"})
    line = _line(client.post(f"/api/hrm/payroll/{MONTH}/calculate").json(), kho_emp)
    assert line["penalties"] == 5000
    assert line["attendance_bonus"] == 0


def test_no_penalty_before_hire_date(kho_emp):
    client.put(f"/api/hrm/employees/{kho_emp}", json={"hire_date": "2025-03-25", "probation_start": "2025-03-25", "official_date": None})
    line = _line(client.post(f"/api/hrm/payroll/{MONTH}/calculate").json(), kho_emp)
    before = [d for d in line["days"] if d["date"] < "2025-03-25"]
    assert before and all(d["penalty"] == 0 for d in before)


def test_advances_filtered_by_month_and_overtime(kho_emp):
    client.post("/api/hrm/attendance/import", files={"file": _xlsx(_full_month_rows(skip=(10, 20)))})
    assert client.post("/api/hrm/advances", json={"staff_id": kho_emp, "advance_date": "2025-02-20", "amount": 3_000_000}).status_code == 200
    assert client.post("/api/hrm/advances", json={"staff_id": kho_emp, "advance_date": "2025-03-05", "amount": 500_000}).status_code == 200
    assert client.post("/api/hrm/overtime", json={"staff_id": kho_emp, "work_date": "2025-03-20", "hours": 2}).status_code == 200
    line = _line(client.post(f"/api/hrm/payroll/{MONTH}/calculate").json(), kho_emp)
    assert line["advances"] == 500_000
    assert line["ot_hours_official"] == 2 and line["ot_pay"] == round(7_000_000 / 29 / 8.5 * 1.5 * 2)


def test_salary_adjustment_effective_date(kho_emp):
    client.post(f"/api/hrm/employees/{kho_emp}/adjustments", json={"effective_date": "2025-04-01", "base_delta": 1_000_000, "reason": "tăng lương"})
    line = _line(client.post(f"/api/hrm/payroll/{MONTH}/calculate").json(), kho_emp)
    assert line["base_salary"] == 7_000_000


def test_lock_blocks_edits_and_pay_creates_cashbook_and_delete_reverts(kho_emp):
    client.post("/api/hrm/attendance/import", files={"file": _xlsx(_full_month_rows(skip=(10, 20)))})
    client.post(f"/api/hrm/payroll/{MONTH}/calculate")
    assert client.post(f"/api/hrm/payroll/{MONTH}/lock").status_code == 200
    assert client.put("/api/hrm/attendance", json={"staff_id": kho_emp, "work_date": "2025-03-11", "punches": []}).status_code == 400
    assert client.post(f"/api/hrm/payroll/{MONTH}/calculate").status_code == 400
    conn = _db()
    acc = conn.execute("SELECT id FROM payment_accounts WHERE is_active=1 ORDER BY id LIMIT 1").fetchone()[0]
    conn.close()
    r = client.post(f"/api/hrm/payroll/{MONTH}/pay", json={"account_id": acc, "staff_ids": [kho_emp]})
    assert r.status_code == 200, r.text
    line = _line(r.json(), kho_emp)
    assert line["cashbook_id"]
    conn = _db()
    cb = conn.execute("SELECT * FROM cashbook WHERE id=?", (line["cashbook_id"],)).fetchone()
    conn.close()
    assert cb["type"] == "out" and cb["category"] == "Chi lương & hoa hồng nhân viên" and cb["amount"] == line["net_pay"]
    assert client.post(f"/api/hrm/payroll/{MONTH}/unlock").status_code == 400
    assert client.delete(f"/api/cashbook/{line['cashbook_id']}").status_code == 200
    after = _line(client.get(f"/api/hrm/payroll/{MONTH}").json(), kho_emp)
    assert after["cashbook_id"] is None
    assert client.post(f"/api/hrm/payroll/{MONTH}/unlock").status_code == 200


def test_permission_required():
    c = TestClient(app, headers=staff_auth_headers("cashier"))
    assert c.get(f"/api/hrm/payroll/{MONTH}").status_code == 403
    assert c.post("/api/hrm/attendance/import", files={"file": _xlsx([])}).status_code == 403


def test_spa_staff_merged_into_staff():
    conn = _db()
    legacy = conn.execute("SELECT COUNT(*) FROM spa_staff").fetchone()[0]
    merged = conn.execute("SELECT COUNT(*) FROM staff WHERE legacy_spa_staff_id IS NOT NULL").fetchone()[0]
    conn.close()
    assert merged == legacy


def test_spa_commission_by_role_and_tip_split():
    from services.commission import spa_commission_by_name
    conn = _db(); cur = conn.cursor()
    cur.execute("DELETE FROM spa_commission_rules")
    cur.execute("INSERT INTO spa_commission_rules (role_key, service_name, rate_type, value) VALUES ('cutter', NULL, 'percent', 10)")
    cur.execute("INSERT INTO spa_commission_rules (role_key, service_name, rate_type, value) VALUES ('worker_1', NULL, 'fixed', 5000)")
    cust = cur.execute("SELECT id FROM contacts ORDER BY id LIMIT 1").fetchone()[0]
    pet = cur.execute("SELECT id FROM pets ORDER BY id LIMIT 1").fetchone()
    cur.execute("""INSERT INTO pet_service_tickets (code, customer_id, pet_id, service_type, price, status, ticket_date, services_json, staff_cutter, staff_worker_1, tip_amount)
                   VALUES ('SPA-TST-1', ?, ?, 'Combo', 220000, 'completed', '2025-03-07', ?, 'Thợ A', 'Thợ B', 20000)""",
                (cust, pet[0] if pet else None, json.dumps([{"name": "Combo Vip 2", "quantity": 1, "price": 200000}, {"name": "Tiền tip thợ", "quantity": 1, "price": 20000, "is_tip": True}])))
    res = spa_commission_by_name(cur, "2025-03-01", "2025-03-31")
    assert res["thợ a"]["commission"] == 20000 and res["thợ a"]["tips"] == 10000
    assert res["thợ b"]["commission"] == 5000 and res["thợ b"]["tips"] == 10000
    cur.execute("DELETE FROM pet_service_tickets WHERE code='SPA-TST-1'")
    cur.execute("DELETE FROM spa_commission_rules")
    conn.commit(); conn.close()
```

Lệnh chạy kiểm tra:
```bash
.venv/Scripts/python.exe -m pytest tests/test_hrm_payroll_api.py -v
```

---

## TASK 6: Giao Diện Web Chấm Công, Bảng Lương & Hồ Sơ Nhân Sự

### 6.1. Sửa `templates/index.html`

**Điểm 1 (thêm nút vào `#sidebar-nav`, dưới nút Ca Làm Việc dòng ~928):**
```html
<<<< VĂN BẢN CŨ
                    <button onclick="switchTab('shifts')" class="tab-btn w-full text-left px-3 py-2 rounded-xl flex items-center gap-2.5 text-xs font-semibold transition cursor-pointer" data-tab="shifts" data-role="accountant,owner" data-tooltip="Ca Làm Việc">
                        <span class="sidebar-icon bg-yellow-100 text-yellow-800">
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
                        </span>
                        <span class="sidebar-text truncate">Ca Làm Việc</span>
                    </button>
====
                    <button onclick="switchTab('shifts')" class="tab-btn w-full text-left px-3 py-2 rounded-xl flex items-center gap-2.5 text-xs font-semibold transition cursor-pointer" data-tab="shifts" data-role="accountant,owner" data-tooltip="Ca Làm Việc">
                        <span class="sidebar-icon bg-yellow-100 text-yellow-800">
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
                        </span>
                        <span class="sidebar-text truncate">Ca Làm Việc</span>
                    </button>
                    <button onclick="switchTab('hrm')" class="tab-btn w-full text-left px-3 py-2 rounded-xl flex items-center gap-2.5 text-xs font-semibold transition cursor-pointer" data-tab="hrm" data-role="owner,accountant" data-tooltip="Chấm Công & Lương">
                        <span class="sidebar-icon bg-emerald-100 text-emerald-800">
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>
                        </span>
                        <span class="sidebar-text truncate">Chấm Công & Lương</span>
                    </button>
>>>>
```

**Điểm 2 (thêm container `#tab-hrm` vào bên trong `#main-content-area`, kề sau `#tab-shifts` dòng ~6250):**
```html
            <!-- TAB: CHẤM CÔNG & LƯƠNG (HRM) -->
            <div id="tab-hrm" class="hidden space-y-4">
                <!-- Thanh Header & Sub-tabs -->
                <div class="bg-white p-3 rounded-xl shadow-xs border border-slate-200/80 flex flex-wrap items-center justify-between gap-3">
                    <div class="flex items-center gap-2">
                        <span class="w-8 h-8 rounded-lg bg-emerald-100 text-emerald-700 flex items-center justify-center font-bold">💼</span>
                        <div>
                            <h2 class="text-sm font-bold text-slate-800">Quản Lý Chấm Công & Bảng Lương</h2>
                            <p class="text-[11px] text-slate-500">Khối làm việc, log vân tay, tính lương 4 tầng và xuất phiếu lương</p>
                        </div>
                    </div>
                    <div class="flex items-center gap-2">
                        <input type="month" id="hrm-month-picker" onchange="loadHrmCurrentSubTab()" class="border border-slate-300 rounded-lg px-2.5 py-1 text-xs font-bold text-slate-700 focus:ring-1 focus:ring-emerald-500">
                        <div class="flex bg-slate-100 p-1 rounded-lg gap-1 text-xs font-semibold">
                            <button id="btn-hrm-tab-payroll" onclick="switchHrmSubTab('payroll')" class="px-3 py-1 rounded-md bg-white text-emerald-700 shadow-xs cursor-pointer">Bảng Lương</button>
                            <button id="btn-hrm-tab-attendance" onclick="switchHrmSubTab('attendance')" class="px-3 py-1 rounded-md text-slate-600 hover:text-slate-900 cursor-pointer">Chấm Công</button>
                            <button id="btn-hrm-tab-overtime" onclick="switchHrmSubTab('overtime')" class="px-3 py-1 rounded-md text-slate-600 hover:text-slate-900 cursor-pointer">Tăng Ca</button>
                            <button id="btn-hrm-tab-advances" onclick="switchHrmSubTab('advances')" class="px-3 py-1 rounded-md text-slate-600 hover:text-slate-900 cursor-pointer">Tạm Ứng</button>
                            <button id="btn-hrm-tab-config" onclick="switchHrmSubTab('config')" class="px-3 py-1 rounded-md text-slate-600 hover:text-slate-900 cursor-pointer">Cài Đặt</button>
                        </div>
                    </div>
                </div>

                <!-- SUBTAB 1: BẢNG LƯƠNG -->
                <div id="hrm-subtab-payroll" class="space-y-3">
                    <div class="bg-white p-3 rounded-xl shadow-xs border border-slate-200/80 flex flex-wrap items-center justify-between gap-2">
                        <div class="flex items-center gap-2">
                            <span id="hrm-payroll-status-badge" class="px-2.5 py-0.5 rounded-full text-xs font-bold bg-amber-100 text-amber-800">TẠM TÍNH</span>
                            <span id="hrm-payroll-lock-info" class="text-xs text-slate-500"></span>
                        </div>
                        <div class="flex flex-wrap items-center gap-2">
                            <button id="btn-hrm-calc" onclick="calculateHrmPayroll()" class="bg-sky-600 hover:bg-sky-700 text-white text-xs font-bold px-3 py-1.5 rounded-lg shadow-xs flex items-center gap-1 cursor-pointer">⚡ Tính Lương</button>
                            <button id="btn-hrm-lock" onclick="lockHrmPayroll()" class="bg-amber-600 hover:bg-amber-700 text-white text-xs font-bold px-3 py-1.5 rounded-lg shadow-xs flex items-center gap-1 cursor-pointer">🔒 Chốt Lương</button>
                            <button id="btn-hrm-unlock" onclick="unlockHrmPayroll()" class="hidden bg-slate-600 hover:bg-slate-700 text-white text-xs font-bold px-3 py-1.5 rounded-lg shadow-xs flex items-center gap-1 cursor-pointer">🔓 Mở Khóa</button>
                            <button id="btn-hrm-pay" onclick="openHrmPayModal()" class="bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold px-3 py-1.5 rounded-lg shadow-xs flex items-center gap-1 cursor-pointer">💰 Trả Lương</button>
                            <button onclick="exportHrmPayroll()" class="border border-slate-300 hover:bg-slate-50 text-slate-700 text-xs font-bold px-3 py-1.5 rounded-lg flex items-center gap-1 cursor-pointer">📥 Xuất Excel</button>
                        </div>
                    </div>
                    <div class="bg-white rounded-xl shadow-xs border border-slate-200/80 overflow-x-auto max-h-[550px]">
                        <table class="w-full text-left border-collapse text-xs">
                            <thead class="bg-slate-50 text-slate-700 font-bold sticky top-0 border-b border-slate-200">
                                <tr>
                                    <th class="p-2.5">Mã NV</th>
                                    <th class="p-2.5">Họ và Tên</th>
                                    <th class="p-2.5">Khối</th>
                                    <th class="p-2.5 text-center">Công chuẩn</th>
                                    <th class="p-2.5 text-center">Công CT</th>
                                    <th class="p-2.5 text-center">Công TV</th>
                                    <th class="p-2.5 text-right">Lương CB</th>
                                    <th class="p-2.5 text-right">Lương công</th>
                                    <th class="p-2.5 text-right">Phụ cấp</th>
                                    <th class="p-2.5 text-right">Lễ</th>
                                    <th class="p-2.5 text-right">Hoa hồng bán</th>
                                    <th class="p-2.5 text-right">Hoa hồng Spa</th>
                                    <th class="p-2.5 text-right">Tip</th>
                                    <th class="p-2.5 text-right">Chuyên cần</th>
                                    <th class="p-2.5 text-right">Thưởng SN</th>
                                    <th class="p-2.5 text-right">Tăng ca</th>
                                    <th class="p-2.5 text-right text-rose-600">Phạt</th>
                                    <th class="p-2.5 text-right text-rose-600">Tạm ứng</th>
                                    <th class="p-2.5 text-right font-black text-emerald-700">Thực Lãnh</th>
                                    <th class="p-2.5 text-center">Trạng Thái Chi</th>
                                    <th class="p-2.5 text-center">Thao Tác</th>
                                </tr>
                            </thead>
                            <tbody id="table-hrm-payroll" class="divide-y divide-slate-100"></tbody>
                            <tfoot id="table-hrm-payroll-foot" class="bg-slate-100 font-bold sticky bottom-0 border-t"></tfoot>
                        </table>
                    </div>
                </div>

                <!-- SUBTAB 2: CHẤM CÔNG (LƯỚI THÁNG) -->
                <div id="hrm-subtab-attendance" class="hidden space-y-3">
                    <div class="bg-white p-3 rounded-xl shadow-xs border border-slate-200/80 flex flex-wrap items-center justify-between gap-2">
                        <div class="flex items-center gap-3 text-xs text-slate-600">
                            <span><b class="text-emerald-600">X:</b> 1 công</span>
                            <span><b class="text-sky-600">X/2:</b> 0.5 công</span>
                            <span><b class="text-amber-600">TV:</b> Thử việc (85%)</span>
                            <span><b class="text-slate-400">OFF:</b> Nghỉ phép</span>
                            <span><b class="text-purple-600">L:</b> Ngày lễ</span>
                            <span><b class="text-rose-600 font-mono">Đỏ:</b> Có vi phạm/phạt</span>
                        </div>
                        <div class="flex items-center gap-2">
                            <input type="file" id="hrm-file-import" accept=".xlsx,.xlsm" class="hidden" onchange="uploadAttendanceExcel(this)">
                            <button onclick="document.getElementById('hrm-file-import').click()" class="bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold px-3 py-1.5 rounded-lg shadow-xs flex items-center gap-1 cursor-pointer">📤 Import File Vân Tay (.xlsx)</button>
                        </div>
                    </div>
                    <div id="hrm-attendance-matrix-container" class="bg-white rounded-xl shadow-xs border border-slate-200/80 overflow-x-auto max-h-[550px]">
                        <table class="w-full text-left border-collapse text-xs">
                            <thead id="table-hrm-att-head" class="bg-slate-50 text-slate-700 font-bold sticky top-0 border-b border-slate-200"></thead>
                            <tbody id="table-hrm-att-body" class="divide-y divide-slate-100"></tbody>
                        </table>
                    </div>
                </div>

                <!-- SUBTAB 3: TĂNG CA -->
                <div id="hrm-subtab-overtime" class="hidden space-y-3">
                    <div class="bg-white p-3 rounded-xl shadow-xs border border-slate-200/80 flex justify-between items-center">
                        <span class="text-xs text-slate-600">Duyệt giờ tăng ca ngoài giờ (hệ số 150%)</span>
                        <button onclick="openHrmOvertimeModal()" class="bg-sky-600 hover:bg-sky-700 text-white text-xs font-bold px-3 py-1.5 rounded-lg cursor-pointer">➕ Thêm Giờ Tăng Ca</button>
                    </div>
                    <div class="bg-white rounded-xl shadow-xs border border-slate-200/80 overflow-x-auto">
                        <table class="w-full text-left text-xs">
                            <thead class="bg-slate-50 font-bold border-b">
                                <tr>
                                    <th class="p-2.5">Ngày</th>
                                    <th class="p-2.5">Nhân Viên</th>
                                    <th class="p-2.5 text-center">Số Giờ OT</th>
                                    <th class="p-2.5">Ghi Chú</th>
                                    <th class="p-2.5">Người Duyệt</th>
                                    <th class="p-2.5 text-center">Xóa</th>
                                </tr>
                            </thead>
                            <tbody id="table-hrm-overtime" class="divide-y divide-slate-100"></tbody>
                        </table>
                    </div>
                </div>

                <!-- SUBTAB 4: TẠM ỨNG -->
                <div id="hrm-subtab-advances" class="hidden space-y-3">
                    <div class="bg-white p-3 rounded-xl shadow-xs border border-slate-200/80 flex justify-between items-center">
                        <span class="text-xs text-slate-600">Quản lý tạm ứng lương (tự trừ vào bảng lương của tháng ứng)</span>
                        <button onclick="openHrmAdvanceModal()" class="bg-sky-600 hover:bg-sky-700 text-white text-xs font-bold px-3 py-1.5 rounded-lg cursor-pointer">➕ Thêm Khoản Tạm Ứng</button>
                    </div>
                    <div class="bg-white rounded-xl shadow-xs border border-slate-200/80 overflow-x-auto">
                        <table class="w-full text-left text-xs">
                            <thead class="bg-slate-50 font-bold border-b">
                                <tr>
                                    <th class="p-2.5">Ngày Ứng</th>
                                    <th class="p-2.5">Nhân Viên</th>
                                    <th class="p-2.5 text-right">Số Tiền</th>
                                    <th class="p-2.5">Phiếu Chi Sổ Quỹ</th>
                                    <th class="p-2.5">Ghi Chú</th>
                                    <th class="p-2.5">Người Tạo</th>
                                    <th class="p-2.5 text-center">Xóa</th>
                                </tr>
                            </thead>
                            <tbody id="table-hrm-advances" class="divide-y divide-slate-100"></tbody>
                        </table>
                    </div>
                </div>

                <!-- SUBTAB 5: CÀI ĐẶT & KHỐI -->
                <div id="hrm-subtab-config" class="hidden space-y-4">
                    <div class="bg-white p-4 rounded-xl shadow-xs border border-slate-200/80 space-y-3">
                        <h3 class="text-xs font-bold uppercase text-slate-700">Khối Làm Việc & Ca Chuẩn</h3>
                        <div id="hrm-blocks-list" class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3"></div>
                    </div>
                    <div class="bg-white p-4 rounded-xl shadow-xs border border-slate-200/80 space-y-3">
                        <h3 class="text-xs font-bold uppercase text-slate-700">Quy Tắc Hoa Hồng Dịch Vụ Spa</h3>
                        <div id="hrm-spa-rules-list"></div>
                    </div>
                </div>
            </div>
```

**Điểm 3 (nhúng script thẻ script `hrm.js` vào cuối `templates/index.html` dòng ~11570):**
```html
<<<< VĂN BẢN CŨ
    <script src="/static/js/clientlog.js?v=20261021_01"></script>
====
    <script src="/static/js/clientlog.js?v=20261021_01"></script>
    <script src="/static/js/modules/hrm.js?v=20261023_01"></script>
>>>>
```

### 6.2. Tạo file `static/js/modules/hrm.js`

Tạo mới file `static/js/modules/hrm.js` với nội dung nguyên văn sau:

```javascript
/**
 * Module HRM: Chấm Công, Bảng Lương, Tăng Ca, Tạm Ứng
 */
(function() {
    let currentSubTab = 'payroll';
    let payrollData = null;
    let attendanceData = null;

    function getSelectedMonth() {
        const picker = document.getElementById('hrm-month-picker');
        if (!picker.value) {
            const now = new Date();
            picker.value = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
        }
        return picker.value;
    }

    window.switchHrmSubTab = function(sub) {
        currentSubTab = sub;
        ['payroll', 'attendance', 'overtime', 'advances', 'config'].forEach(s => {
            const pane = document.getElementById(`hrm-subtab-${s}`);
            const btn = document.getElementById(`btn-hrm-tab-${s}`);
            if (pane) pane.classList.toggle('hidden', s !== sub);
            if (btn) {
                if (s === sub) {
                    btn.className = "px-3 py-1 rounded-md bg-white text-emerald-700 shadow-xs cursor-pointer font-bold";
                } else {
                    btn.className = "px-3 py-1 rounded-md text-slate-600 hover:text-slate-900 cursor-pointer";
                }
            }
        });
        loadHrmCurrentSubTab();
    };

    window.loadHrmCurrentSubTab = function() {
        const month = getSelectedMonth();
        if (currentSubTab === 'payroll') loadHrmPayroll(month);
        else if (currentSubTab === 'attendance') loadHrmAttendance(month);
        else if (currentSubTab === 'overtime') loadHrmOvertime(month);
        else if (currentSubTab === 'advances') loadHrmAdvances(month);
        else if (currentSubTab === 'config') loadHrmConfig();
    };

    window.initHrmTab = function() {
        getSelectedMonth();
        switchHrmSubTab(currentSubTab);
    };

    // ── Bảng Lương ──
    async function loadHrmPayroll(month) {
        try {
            const res = await fetch(`/api/hrm/payroll/${month}`);
            if (!res.ok) return;
            payrollData = await res.json();
            renderPayrollUI(payrollData);
        } catch (e) {
            console.error("Lỗi tải bảng lương:", e);
        }
    }

    function renderPayrollUI(data) {
        const badge = document.getElementById('hrm-payroll-status-badge');
        const lockInfo = document.getElementById('hrm-payroll-lock-info');
        const btnLock = document.getElementById('btn-hrm-lock');
        const btnUnlock = document.getElementById('btn-hrm-unlock');
        const btnCalc = document.getElementById('btn-hrm-calc');
        const btnPay = document.getElementById('btn-hrm-pay');

        if (data.status === 'locked') {
            badge.className = "px-2.5 py-0.5 rounded-full text-xs font-bold bg-purple-100 text-purple-800";
            badge.textContent = "ĐÃ CHỐT";
            lockInfo.textContent = `Chốt bởi ${data.locked_by || ''} lúc ${data.locked_at || ''}`;
            btnLock.classList.add('hidden');
            btnUnlock.classList.remove('hidden');
            btnCalc.disabled = true;
            btnCalc.classList.add('opacity-50', 'cursor-not-allowed');
            btnPay.classList.remove('hidden');
        } else if (data.status === 'paid') {
            badge.className = "px-2.5 py-0.5 rounded-full text-xs font-bold bg-emerald-100 text-emerald-800";
            badge.textContent = "ĐÃ CHI TRẢ";
            lockInfo.textContent = "";
            btnLock.classList.add('hidden');
            btnUnlock.classList.add('hidden');
            btnCalc.disabled = true;
            btnCalc.classList.add('opacity-50', 'cursor-not-allowed');
            btnPay.classList.add('hidden');
        } else {
            badge.className = "px-2.5 py-0.5 rounded-full text-xs font-bold bg-amber-100 text-amber-800";
            badge.textContent = "TẠM TÍNH";
            lockInfo.textContent = "";
            btnLock.classList.remove('hidden');
            btnUnlock.classList.add('hidden');
            btnCalc.disabled = false;
            btnCalc.classList.remove('opacity-50', 'cursor-not-allowed');
            btnPay.classList.add('hidden');
        }

        const tbody = document.getElementById('table-hrm-payroll');
        if (!data.lines || data.lines.length === 0) {
            tbody.innerHTML = `<tr><td colspan="21" class="p-6 text-center text-slate-400">Chưa có dữ liệu bảng lương tháng này. Hãy bấm "Tính Lương" để khởi tạo.</td></tr>`;
            return;
        }

        tbody.innerHTML = data.lines.map(l => `
            <tr class="hover:bg-slate-50">
                <td class="p-2.5 font-mono font-bold text-slate-700">${l.employee_code || ''}</td>
                <td class="p-2.5 font-bold text-slate-900">${l.name || ''}</td>
                <td class="p-2.5 text-slate-600">${l.block || ''}</td>
                <td class="p-2.5 text-center">${l.std_days || 0}</td>
                <td class="p-2.5 text-center font-bold text-emerald-700">${l.days_official || 0}</td>
                <td class="p-2.5 text-center font-bold text-amber-600">${l.days_probation || 0}</td>
                <td class="p-2.5 text-right font-mono">${(l.base_salary || 0).toLocaleString('vi-VN')}</td>
                <td class="p-2.5 text-right font-mono font-bold">${(l.pay_days || 0).toLocaleString('vi-VN')}</td>
                <td class="p-2.5 text-right font-mono">${(l.allowance || 0).toLocaleString('vi-VN')}</td>
                <td class="p-2.5 text-right font-mono">${(l.holiday_pay || 0).toLocaleString('vi-VN')}</td>
                <td class="p-2.5 text-right font-mono text-sky-700">${(l.commission || 0).toLocaleString('vi-VN')}</td>
                <td class="p-2.5 text-right font-mono text-purple-700">${(l.spa_commission || 0).toLocaleString('vi-VN')}</td>
                <td class="p-2.5 text-right font-mono text-indigo-700">${(l.tips || 0).toLocaleString('vi-VN')}</td>
                <td class="p-2.5 text-right font-mono text-emerald-700">${(l.attendance_bonus || 0).toLocaleString('vi-VN')}</td>
                <td class="p-2.5 text-right font-mono">${(l.birthday_bonus || 0).toLocaleString('vi-VN')}</td>
                <td class="p-2.5 text-right font-mono font-bold text-amber-700">${(l.ot_pay || 0).toLocaleString('vi-VN')}</td>
                <td class="p-2.5 text-right font-mono font-bold text-rose-600">-${(l.penalties || 0).toLocaleString('vi-VN')}</td>
                <td class="p-2.5 text-right font-mono font-bold text-rose-600">-${(l.advances || 0).toLocaleString('vi-VN')}</td>
                <td class="p-2.5 text-right font-mono font-black text-sm text-emerald-700">${(l.net_rounded || 0).toLocaleString('vi-VN')}đ</td>
                <td class="p-2.5 text-center">${l.cashbook_code ? `<span class="px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-100 text-emerald-800">${l.cashbook_code}</span>` : `<span class="text-slate-400">Chưa chi</span>`}</td>
                <td class="p-2.5 text-center whitespace-nowrap">
                    <button onclick="editHrmLine(${l.staff_id}, ${l.bonus_other || 0}, ${l.fuel_other || 0}, ${l.deduction_other || 0}, '${(l.manual_note || '').replace(/'/g, "\\'")}')" class="text-sky-600 hover:underline font-bold mr-2 cursor-pointer">Sửa số</button>
                </td>
            </tr>
        `).join('');

        const foot = document.getElementById('table-hrm-payroll-foot');
        const tot = data.totals || {};
        foot.innerHTML = `
            <tr>
                <td colspan="6" class="p-2.5 text-right uppercase">Tổng cộng:</td>
                <td class="p-2.5 text-right font-mono">${(tot.base_salary || 0).toLocaleString('vi-VN')}</td>
                <td class="p-2.5 text-right font-mono font-bold">${(tot.pay_days || 0).toLocaleString('vi-VN')}</td>
                <td class="p-2.5 text-right font-mono">${(tot.allowance || 0).toLocaleString('vi-VN')}</td>
                <td class="p-2.5 text-right font-mono">${(tot.holiday_pay || 0).toLocaleString('vi-VN')}</td>
                <td class="p-2.5 text-right font-mono">${(tot.commission || 0).toLocaleString('vi-VN')}</td>
                <td class="p-2.5 text-right font-mono">${(tot.spa_commission || 0).toLocaleString('vi-VN')}</td>
                <td class="p-2.5 text-right font-mono">${(tot.tips || 0).toLocaleString('vi-VN')}</td>
                <td class="p-2.5 text-right font-mono">${(tot.attendance_bonus || 0).toLocaleString('vi-VN')}</td>
                <td class="p-2.5 text-right font-mono">${(tot.birthday_bonus || 0).toLocaleString('vi-VN')}</td>
                <td class="p-2.5 text-right font-mono">${(tot.ot_pay || 0).toLocaleString('vi-VN')}</td>
                <td class="p-2.5 text-right font-mono text-rose-600">-${(tot.penalties || 0).toLocaleString('vi-VN')}</td>
                <td class="p-2.5 text-right font-mono text-rose-600">-${(tot.advances || 0).toLocaleString('vi-VN')}</td>
                <td class="p-2.5 text-right font-mono font-black text-emerald-800 text-sm">${(tot.net_pay || 0).toLocaleString('vi-VN')}đ</td>
                <td colspan="2"></td>
            </tr>
        `;
    }

    window.calculateHrmPayroll = async function() {
        const month = getSelectedMonth();
        try {
            const res = await fetch(`/api/hrm/payroll/${month}/calculate`, { method: 'POST' });
            if (!res.ok) {
                const err = await res.json();
                window.showToast ? window.showToast(err.detail || 'Lỗi tính lương', 'error') : alert(err.detail);
                return;
            }
            payrollData = await res.json();
            renderPayrollUI(payrollData);
            if (window.showToast) window.showToast("Đã tính toán bảng lương thành công", "success");
        } catch (e) {
            console.error(e);
        }
    };

    window.lockHrmPayroll = async function() {
        const month = getSelectedMonth();
        const conf = await window.showConfirmModal({
            title: "Chốt Bảng Lương",
            message: `Bạn có chắc chắn muốn CHỐT bảng lương tháng ${month}? Sau khi chốt, dữ liệu chấm công và tăng ca của tháng này sẽ bị khóa hoàn toàn.`,
            confirmText: "Chốt Lương",
            type: "warning"
        });
        if (!conf) return;
        const res = await fetch(`/api/hrm/payroll/${month}/lock`, { method: 'POST' });
        if (res.ok) {
            payrollData = await res.json();
            renderPayrollUI(payrollData);
            if (window.showToast) window.showToast("Đã chốt bảng lương thành công", "success");
        }
    };

    window.unlockHrmPayroll = async function() {
        const month = getSelectedMonth();
        const conf = await window.showConfirmModal({
            title: "Mở Khóa Bảng Lương",
            message: `Mở khóa bảng lương tháng ${month} để tính toán lại?`,
            confirmText: "Mở Khóa",
            type: "danger"
        });
        if (!conf) return;
        const res = await fetch(`/api/hrm/payroll/${month}/unlock`, { method: 'POST' });
        if (res.ok) {
            payrollData = await res.json();
            renderPayrollUI(payrollData);
            if (window.showToast) window.showToast("Đã mở khóa bảng lương", "info");
        }
    };

    window.openHrmPayModal = async function() {
        const month = getSelectedMonth();
        const accRes = await fetch('/api/payment-accounts');
        const accounts = await accRes.json();
        const activeAccs = accounts.filter(a => a.is_active);

        const selHtml = activeAccs.map(a => `<option value="${a.id}">${a.name} (${a.code})</option>`).join('');
        const conf = await window.showConfirmModal({
            title: "Chi Trả Lương Hàng Loạt",
            message: `Hệ thống sẽ tạo phiếu chi Sổ Quỹ cho toàn bộ nhân viên có thực lãnh > 0 chưa được chi trả. Vui lòng chọn tài khoản nguồn:`,
            subMessage: `<select id="hrm-pay-account-id" class="w-full border p-2 rounded mt-2 text-xs font-bold text-slate-800">${selHtml}</select>`,
            confirmText: "Thực Hiện Chi Lương",
            type: "primary"
        });
        if (!conf) return;
        const accId = parseInt(document.getElementById('hrm-pay-account-id').value);
        const res = await fetch(`/api/hrm/payroll/${month}/pay`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ account_id: accId })
        });
        if (res.ok) {
            const result = await res.json();
            renderPayrollUI(result);
            if (window.showToast) window.showToast(`Đã chi trả thành công ${result.paid_count || 0} nhân viên sang Sổ Quỹ`, "success");
        }
    };

    window.exportHrmPayroll = function() {
        const month = getSelectedMonth();
        downloadWithAuth(`/api/hrm/payroll/${month}/export`, `Bang_Luong_${month}.xlsx`);
    };

    // ── Chấm Công Matrix ──
    async function loadHrmAttendance(month) {
        try {
            const res = await fetch(`/api/hrm/attendance?month=${month}`);
            if (!res.ok) return;
            attendanceData = await res.json();
            renderAttendanceMatrix(attendanceData);
        } catch (e) {
            console.error(e);
        }
    }

    function renderAttendanceMatrix(data) {
        const thead = document.getElementById('table-hrm-att-head');
        const tbody = document.getElementById('table-hrm-att-body');
        const numDays = data.days_in_month;

        let th = `<tr><th class="p-2 sticky left-0 bg-slate-50 z-10 border-r">Nhân Viên</th>`;
        for (let d = 1; d <= numDays; d++) {
            th += `<th class="p-1 text-center w-8 text-[11px]">${d}</th>`;
        }
        th += `<th class="p-2 text-center border-l">Tổng công</th><th class="p-2 text-right">Phạt</th></tr>`;
        thead.innerHTML = th;

        if (!data.employees || data.employees.length === 0) {
            tbody.innerHTML = `<tr><td colspan="${numDays + 3}" class="p-6 text-center text-slate-400">Không có nhân sự nào được cấu hình chấm công.</td></tr>`;
            return;
        }

        tbody.innerHTML = data.employees.map(e => {
            let row = `<tr><td class="p-2 font-bold text-slate-800 sticky left-0 bg-white z-10 border-r whitespace-nowrap">${e.name} <span class="text-[10px] text-slate-400 font-normal">(${e.block})</span></td>`;
            const dayMap = {};
            (e.days || []).forEach(d => {
                const dayNum = parseInt(d.date.split('-')[2]);
                dayMap[dayNum] = d;
            });
            for (let d = 1; d <= numDays; d++) {
                const dayRes = dayMap[d];
                if (!dayRes) {
                    row += `<td class="p-1 text-center text-slate-300">-</td>`;
                } else {
                    let cls = "text-slate-600";
                    if (dayRes.code === 'X') cls = "font-bold text-emerald-600 bg-emerald-50/50";
                    else if (dayRes.code === 'X/2') cls = "font-bold text-sky-600 bg-sky-50/50";
                    else if (dayRes.code === 'TV') cls = "font-bold text-amber-600 bg-amber-50/50";
                    else if (dayRes.code === 'OFF') cls = "text-slate-400 bg-slate-100";
                    else if (dayRes.code === 'L') cls = "font-bold text-purple-700 bg-purple-50";

                    if (dayRes.penalty > 0) cls += " border-b-2 border-rose-500";
                    row += `<td onclick="openHrmEditDayModal(${e.staff_id}, '${dayRes.date}', '${dayRes.code}')" class="p-1 text-center text-[11px] cursor-pointer hover:ring-1 hover:ring-sky-500 ${cls}" title="${dayRes.punches?.join(', ') || ''}">${dayRes.code || '-'}</td>`;
                }
            }
            row += `<td class="p-2 text-center font-bold text-emerald-700 border-l">${e.credit || 0}</td><td class="p-2 text-right font-mono text-rose-600">${(e.penalty || 0).toLocaleString('vi-VN')}</td></tr>`;
            return row;
        }).join('');
    }

    window.uploadAttendanceExcel = async function(input) {
        if (!input.files || input.files.length === 0) return;
        const formData = new FormData();
        formData.append('file', input.files[0]);
        input.value = '';
        try {
            const res = await fetch('/api/hrm/attendance/import', { method: 'POST', body: formData });
            const data = await res.json();
            if (!res.ok) {
                window.showToast ? window.showToast(data.detail || 'Lỗi import file', 'error') : alert(data.detail);
                return;
            }
            let msg = `Đã import thành công ${data.imported} bản ghi.`;
            if (data.unknown_codes && data.unknown_codes.length > 0) {
                msg += ` Bỏ qua ${data.unknown_codes.length} mã máy chưa gán cho nhân viên.`;
            }
            if (window.showToast) window.showToast(msg, 'success');
            loadHrmAttendance(getSelectedMonth());
        } catch (e) {
            console.error(e);
        }
    };
})();
```

### 6.3. Sửa `static/js/app.js` (dòng ~4345)

Hook điều hướng tab `hrm` trong hàm `switchTab`:
```javascript
<<<< VĂN BẢN CŨ
            } else if (tabId === 'shifts') {
                if (typeof loadShiftsHistory === 'function') loadShiftsHistory();
====
            } else if (tabId === 'shifts') {
                if (typeof loadShiftsHistory === 'function') loadShiftsHistory();
            } else if (tabId === 'hrm') {
                if (typeof initHrmTab === 'function') initHrmTab();
>>>>
```

### 6.4. Cập nhật `tests/test_html_integrity.py` (dòng ~20 & ~53)

Cập nhật test kiểm tra 19 nút điều hướng sidebar và kiểm tra tab `tab-hrm`:
```python
<<<< VĂN BẢN CŨ
        expected_tabs = [
            'tab-pos',
            'tab-orders',
            'tab-price-lists',
            'tab-inventory',
            'tab-pet-services',
            'tab-purchases',
            'tab-oem',
            'tab-contacts',
            'tab-cashbook',
            'tab-cashflow-debts',
            'tab-reports',
            'tab-shifts',
            'tab-guide',
            'tab-settings',
        ]
====
        expected_tabs = [
            'tab-pos',
            'tab-orders',
            'tab-price-lists',
            'tab-inventory',
            'tab-pet-services',
            'tab-purchases',
            'tab-oem',
            'tab-contacts',
            'tab-cashbook',
            'tab-cashflow-debts',
            'tab-reports',
            'tab-shifts',
            'tab-guide',
            'tab-settings',
            'tab-hrm',
        ]
>>>>
```
Và cập nhật số nút sidebar:
```python
<<<< VĂN BẢN CŨ
        buttons = sidebar_nav.find_all('button', class_='tab-btn')
        self.assertEqual(len(buttons), 17, 'Sidebar phải có 17 nút điều hướng')
====
        buttons = sidebar_nav.find_all('button', class_='tab-btn')
        self.assertEqual(len(buttons), 19, 'Sidebar phải có 19 nút điều hướng')
>>>>
```

---

## TASK 7: Kiểm Thử Toàn Diện, Rebuild EXE & Cập Nhật Roadmap

### 7.1. Chạy Full Test Suite

Chạy lệnh kiểm thử toàn bộ test suite để đảm bảo 0 hồi quy:
```bash
.venv/Scripts/python.exe -m pytest -q -p no:cacheprovider
```
Kỳ vọng: Toàn bộ các test HRM mới và các test nghiệp vụ cũ đều PASS (chỉ ngoại trừ các test git-ahead nếu đang có commit chưa đẩy).

### 7.2. Rebuild Bản Build Thực Thi EXE

Chạy PyInstaller bằng lệnh chuẩn của dự án:
```bash
.venv/Scripts/python.exe -m PyInstaller POS_Mastercare.spec
```
Xác nhận file `POS_Mastercare.exe` được tạo mới thành công tại thư mục gốc của dự án.

### 7.3. Cập Nhật Báo Cáo Tiến Độ Dự Án

Cập nhật file `PROJECT_STATE.md`:
- Đánh dấu hoàn thành tính năng "Phân hệ Nhân sự, Chấm công, Bảng lương & Hoa hồng tự động".
- Ghi nhận số lượng test pass và phiên bản EXE mới.

---

## Ngoài Phạm Vi (Out of Scope)

1. **Thuế TNCN & BHXH:** Theo xác nhận của chủ shop (mô hình kinh doanh pet shop / spa tư nhân), lương chi trả thực lãnh net, chưa kích hoạt tính thuế TNCN lũy tiến 7 bậc và trích đóng BHXH bắt buộc. Khi có nhu cầu mở rộng doanh nghiệp, cấu hình sẽ được bật qua `hrm-dynamic-payroll-engine`.
2. **Tích hợp máy chấm công qua mạng LAN (ZKTeco ADMS):** Hiện tại shop xuất file Excel định kỳ hàng tuần/tháng từ phần mềm máy vân tay. Phương thức import Excel đã được tối ưu hóa tự động nhận diện cột.

---

## Checklist Nghiệm Thu (Acceptance Criteria)

- [ ] Sửa đơn hoặc đổi nhân viên bán hàng loạt: `orders.commission_amount` tự động tính lại theo doanh thu thuần (tiền hàng - giảm giá).
- [ ] Báo cáo Sổ Quỹ: Hoa hồng tự loại bỏ đơn nháp và trừ hàng trả lại.
- [ ] Đi trễ 1 phút phạt đúng 5.000đ; đi trễ >= 30 phút phạt cố định 200.000đ.
- [ ] Thử việc tính 85% lương; ngày thử việc và chính thức tách bạch theo ngày quẹt thẻ.
- [ ] Thưởng chuyên cần 500.000đ tự động cộng cho nhân viên đủ công và không vi phạm.
- [ ] Import Excel máy chấm công: map đúng nhân viên qua mã chấm công, bỏ qua dòng đã sửa tay.
- [ ] Chốt bảng lương: khóa toàn bộ thao tác sửa công của tháng.
- [ ] Chi trả lương: sinh đúng phiếu chi `PC-LG` sang Sổ Quỹ; khi xóa phiếu chi thì trạng thái bảng lương hoàn tác về chưa chi.
- [ ] File thực thi `POS_Mastercare.exe` build thành công, khởi động bình thường.
