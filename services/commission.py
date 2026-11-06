"""Hoa hồng nhân viên — nguồn duy nhất cho báo cáo + bảng lương.
Bán hàng: % (staff.commission_rate) x doanh thu thuần = (tổng tiền hàng - giảm giá) đơn hợp lệ - giá trị hàng trả.
Spa: Hỗ trợ đa cơ sở (Multi-Branch Reusable Profiles) với Ma trận bậc cân nặng (Chính thức / Thử việc) + 7 cột Phụ thu
hoặc quy tắc % theo vai trò trên phiếu dịch vụ (spa_commission_rules) + chia tip.
"""
import copy
import json
import re

EXCLUDED_ORDER_STATUSES = ("Lưu nháp", "draft", "cancelled", "Đã hủy")
SPA_ROLE_COLUMNS = ("staff_receiver", "staff_worker_1", "staff_worker_2", "staff_cutter", "staff_dyer")
TIP_ROLE_COLUMNS = ("staff_worker_1", "staff_worker_2", "staff_cutter", "staff_dyer")

SPA_COMMISSION_SETTINGS_KEY = "spa_commission_profiles_v2"

DEFAULT_SPA_COMMISSION_CONFIG = {
    "active_profile_id": "branch_default",
    "profiles": [
        {
            "id": "branch_default",
            "name": "Cơ Sở Chính — Bảng Bậc Cân Nặng & Phụ Thu Chuẩn (VNĐ)",
            "calc_mode": "weight_matrix",
            "worker1_share_pct": 50.0,
            "worker2_share_pct": 50.0,
            "detangle_fallback_pct": 50.0,
            "receiver_rate_type": "fixed",
            "receiver_official": 0.0,
            "receiver_probation": 0.0,
            "bath_tiers": [
                {"id": "bath_s", "label": "Nhỏ", "range_label": "<=10kg", "max_kg": 10.0, "official": 30000.0, "probation": 25000.0},
                {"id": "bath_m", "label": "Trung", "range_label": "<=20kg", "max_kg": 20.0, "official": 60000.0, "probation": 50000.0},
                {"id": "bath_l", "label": "Lớn", "range_label": "<=30kg", "max_kg": 30.0, "official": 90000.0, "probation": 75000.0},
                {"id": "bath_xl", "label": "Đại", "range_label": "<=40kg", "max_kg": 40.0, "official": 120000.0, "probation": 100000.0},
                {"id": "bath_xxl", "label": "Cực đại", "range_label": ">40kg", "max_kg": 999.0, "official": 150000.0, "probation": 125000.0},
            ],
            "cat_rate": {"label": "Mèo", "range_label": "Mọi kg", "official": 60000.0, "probation": 50000.0},
            "dye_rate": {"label": "Nhuộm", "range_label": "Mọi kg", "official": 50000.0, "probation": 40000.0},
            "cut_tiers": [
                {"id": "cut_s", "label": "Cắt nhỏ", "range_label": "<=10kg", "max_kg": 10.0, "official": 50000.0, "probation": 40000.0},
                {"id": "cut_m", "label": "Cắt trung", "range_label": "10,1kg -> 30kg", "max_kg": 30.0, "official": 100000.0, "probation": 90000.0},
                {"id": "cut_l", "label": "Cắt lớn", "range_label": ">30kg", "max_kg": 999.0, "official": 120000.0, "probation": 110000.0},
            ],
            "surcharge_rules": [
                {"id": "pt_cat_dau", "label": "PT Cắt đầu", "target_role": "cutter", "kind": "head_cut", "fee_threshold": 0.0, "official": 25000.0, "probation": 25000.0},
                {"id": "pt_nghe_thuat", "label": "PT Cắt Nghệ thuật", "target_role": "cutter", "kind": "art_cut", "fee_threshold": 0.0, "official": 25000.0, "probation": 25000.0},
                {"id": "pt_go_roi_50", "label": "PT Gỡ rối 50K", "target_role": "bath", "kind": "detangle", "fee_threshold": 50000.0, "official": 25000.0, "probation": 25000.0},
                {"id": "pt_go_roi_100", "label": "PT Gỡ rối 100K", "target_role": "bath", "kind": "detangle", "fee_threshold": 100000.0, "official": 50000.0, "probation": 50000.0},
                {"id": "pt_go_roi_150", "label": "PT Gỡ rối 150K", "target_role": "bath", "kind": "detangle", "fee_threshold": 150000.0, "official": 75000.0, "probation": 75000.0},
                {"id": "pt_go_roi_200", "label": "PT Gỡ rối 200K", "target_role": "bath", "kind": "detangle", "fee_threshold": 200000.0, "official": 100000.0, "probation": 100000.0},
                {"id": "pt_go_roi_250", "label": "PT Gỡ rối 250K", "target_role": "bath", "kind": "detangle", "fee_threshold": 250000.0, "official": 125000.0, "probation": 125000.0},
            ],
        },
        {
            "id": "branch_percent",
            "name": "Mẫu Cơ Sở 2 — Tính Theo % Doanh Thu Dịch Vụ",
            "calc_mode": "role_rules",
            "worker1_share_pct": 50.0,
            "worker2_share_pct": 50.0,
            "detangle_fallback_pct": 50.0,
            "receiver_rate_type": "percent",
            "receiver_official": 2.0,
            "receiver_probation": 2.0,
            "bath_tiers": [
                {"id": "bath_s", "label": "Nhỏ", "range_label": "<=10kg", "max_kg": 10.0, "official": 30000.0, "probation": 25000.0},
                {"id": "bath_m", "label": "Trung", "range_label": "<=20kg", "max_kg": 20.0, "official": 60000.0, "probation": 50000.0},
                {"id": "bath_l", "label": "Lớn", "range_label": "<=30kg", "max_kg": 30.0, "official": 90000.0, "probation": 75000.0},
                {"id": "bath_xl", "label": "Đại", "range_label": "<=40kg", "max_kg": 40.0, "official": 120000.0, "probation": 100000.0},
                {"id": "bath_xxl", "label": "Cực đại", "range_label": ">40kg", "max_kg": 999.0, "official": 150000.0, "probation": 125000.0},
            ],
            "cat_rate": {"label": "Mèo", "range_label": "Mọi kg", "official": 60000.0, "probation": 50000.0},
            "dye_rate": {"label": "Nhuộm", "range_label": "Mọi kg", "official": 50000.0, "probation": 40000.0},
            "cut_tiers": [
                {"id": "cut_s", "label": "Cắt nhỏ", "range_label": "<=10kg", "max_kg": 10.0, "official": 50000.0, "probation": 40000.0},
                {"id": "cut_m", "label": "Cắt trung", "range_label": "10,1kg -> 30kg", "max_kg": 30.0, "official": 100000.0, "probation": 90000.0},
                {"id": "cut_l", "label": "Cắt lớn", "range_label": ">30kg", "max_kg": 999.0, "official": 120000.0, "probation": 110000.0},
            ],
            "surcharge_rules": [],
        },
    ],
}


_STAFF_COLS_CACHE: dict = {}


def _get_staff_cols_cached(cur) -> set:
    try:
        conn = getattr(cur, "connection", None)
        if conn is not None and hasattr(conn, "execute"):
            r = conn.execute("PRAGMA database_list").fetchone()
            if r and len(r) >= 3 and r[2]:
                import os as _os
                p = str(r[2])
                if _os.path.exists(p):
                    k = (p, _os.stat(p).st_ctime_ns)
                    cached = _STAFF_COLS_CACHE.get(k)
                    if cached and {"commission_policy_mode", "spa_commission_tier"}.issubset(cached):
                        return cached
                    cur.execute("PRAGMA table_info(staff)")
                    cols = {row[1] for row in cur.fetchall()}
                    _STAFF_COLS_CACHE[k] = cols
                    return cols
    except Exception:
        pass
    cur.execute("PRAGMA table_info(staff)")
    return {row[1] for row in cur.fetchall()}


def ensure_staff_spa_tier_cols(cur):
    try:
        cols = _get_staff_cols_cached(cur)
        changed = False
        if "spa_commission_tier" not in cols:
            cur.execute("ALTER TABLE staff ADD COLUMN spa_commission_tier TEXT DEFAULT 'official'")
            changed = True
        if "spa_commission_profile_id" not in cols:
            cur.execute("ALTER TABLE staff ADD COLUMN spa_commission_profile_id TEXT DEFAULT ''")
            changed = True
        if changed:
            _STAFF_COLS_CACHE.clear()
    except Exception:
        pass


def load_spa_commission_config(cur) -> dict:
    try:
        cur.execute("SELECT value FROM settings WHERE key = ?", (SPA_COMMISSION_SETTINGS_KEY,))
        row = cur.fetchone()
        if row and row[0]:
            data = json.loads(row[0])
            if isinstance(data, dict) and isinstance(data.get("profiles"), list) and len(data["profiles"]) > 0:
                return data
    except Exception:
        pass
    cfg = copy.deepcopy(DEFAULT_SPA_COMMISSION_CONFIG)
    try:
        cur.execute(
            "INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)",
            (SPA_COMMISSION_SETTINGS_KEY, json.dumps(cfg, ensure_ascii=False)),
        )
    except Exception:
        pass
    return cfg


def save_spa_commission_config(cur, config_data: dict) -> dict:
    if not isinstance(config_data, dict) or not isinstance(config_data.get("profiles"), list) or not config_data["profiles"]:
        config_data = copy.deepcopy(DEFAULT_SPA_COMMISSION_CONFIG)
    active_id = config_data.get("active_profile_id")
    profile_ids = [p.get("id") for p in config_data["profiles"] if isinstance(p, dict)]
    if active_id not in profile_ids:
        config_data["active_profile_id"] = profile_ids[0] if profile_ids else "branch_default"
    cur.execute(
        "INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)",
        (SPA_COMMISSION_SETTINGS_KEY, json.dumps(config_data, ensure_ascii=False)),
    )
    return config_data


def order_commission_base(total_amount, discount) -> float:
    return max(0.0, float(total_amount or 0) - float(discount or 0))


DEFAULT_DEPT_COMM_POLICIES = [
    {"dept": "Bán Lẻ POS", "pos_rate": 3.0, "spa_on": 0, "tmdt_on": 0},
    {"dept": "Spa & Grooming", "pos_rate": 1.5, "spa_on": 1, "tmdt_on": 0},
    {"dept": "Sales Online & TMĐT", "pos_rate": 2.0, "spa_on": 0, "tmdt_on": 1},
    {"dept": "Kho & Khách Sạn", "pos_rate": 1.0, "spa_on": 0, "tmdt_on": 0},
]


def load_dept_comm_policies(cur) -> list:
    try:
        cur.execute("SELECT value FROM settings WHERE key = 'hrm_dept_commission_policies'")
        row = cur.fetchone()
        if row and row[0]:
            data = json.loads(row[0])
            if isinstance(data, list) and data:
                return data
    except Exception:
        pass
    return copy.deepcopy(DEFAULT_DEPT_COMM_POLICIES)


def resolve_dept_comm_policy(dept: str, is_spa_worker: bool = False, dept_policies: list = None) -> dict:
    """Ánh xạ tên Bộ phận thực tế từ hồ sơ/Sheet (Kinh doanh, Marketing, Kho, Văn Phòng...) về chính sách chuẩn."""
    pols = dept_policies or DEFAULT_DEPT_COMM_POLICIES
    d_clean = (dept or "").strip()
    d_low = d_clean.lower()
    for p in pols:
        if (p.get("dept") or "").strip().lower() == d_low and d_low:
            return p
    by_name = {(p.get("dept") or "").strip(): p for p in pols}
    if is_spa_worker or "spa" in d_low or "groom" in d_low:
        return by_name.get("Spa & Grooming") or pols[0]
    if any(k in d_low for k in ("kinh doanh", "marketing", "sales", "online", "tmđt", "tmdt", "sàn", "pancake", "digital")):
        return by_name.get("Sales Online & TMĐT") or pols[0]
    if any(k in d_low for k in ("kho", "khách sạn", "hotel")):
        return by_name.get("Kho & Khách Sạn") or pols[0]
    return by_name.get("Bán Lẻ POS") or pols[0]


def effective_pos_commission_rate(staff_row: dict, dept_policies: list = None) -> float:
    """Tính % hoa hồng POS hiệu lực: chế độ 'dept' mà commission_rate = 0 sẽ tự kế thừa % của Bộ phận."""
    if not staff_row:
        return 0.0
    raw_rate = float(staff_row.get("commission_rate") or 0.0)
    mode = (staff_row.get("commission_policy_mode") or "dept").strip()
    if mode == "custom":
        return raw_rate
    if raw_rate > 0:
        return raw_rate
    pol = resolve_dept_comm_policy(
        staff_row.get("department") or "",
        bool(staff_row.get("is_spa_worker")),
        dept_policies,
    )
    return float(pol.get("pos_rate") or 0.0)


def calc_order_commission(cur, staff_id, total_amount, discount) -> float:
    cols = _get_staff_cols_cached(cur)
    sel_cols = ["id", "commission_rate"]
    for opt in ("department", "is_spa_worker", "commission_policy_mode"):
        if opt in cols:
            sel_cols.append(opt)
    cur.execute(f"SELECT {', '.join(sel_cols)} FROM staff WHERE id = ?", (staff_id,))
    row = cur.fetchone()
    if not row:
        return 0.0
    st = dict(row)
    rate = effective_pos_commission_rate(st, load_dept_comm_policies(cur))
    return round(order_commission_base(total_amount, discount) * rate / 100.0)


def sales_commission_by_staff(cur, from_dt: str, to_dt: str) -> dict:
    """from_dt/to_dt: 'YYYY-MM-DD HH:MM:SS' giờ VN. Trả {staff_id: {revenue, returns, net, rate, commission, orders}}."""
    ph = ",".join("?" for _ in EXCLUDED_ORDER_STATUSES)
    cur.execute(f"""
        SELECT o.staff_id,
               COUNT(*) AS orders,
               COALESCE(SUM(MAX(0, COALESCE(o.total_amount,0) - COALESCE(o.discount,0))), 0) AS revenue
        FROM orders o
        WHERE o.staff_id IS NOT NULL
          AND COALESCE(o.status, '') NOT IN ({ph})
          AND o.created_at >= datetime(?, '-7 hours') AND o.created_at < datetime(?, '-7 hours', '+1 second')
        GROUP BY o.staff_id
    """, (*EXCLUDED_ORDER_STATUSES, from_dt, to_dt))
    out = {}
    for r in cur.fetchall():
        out[r["staff_id"]] = {"revenue": float(r["revenue"] or 0), "returns": 0.0, "orders": int(r["orders"] or 0)}
    cur.execute("""
        SELECT o.staff_id, COALESCE(SUM(ret.return_total), 0) AS returns
        FROM order_returns ret JOIN orders o ON o.id = ret.original_order_id
        WHERE o.staff_id IS NOT NULL
          AND ret.created_at >= datetime(?, '-7 hours') AND ret.created_at < datetime(?, '-7 hours', '+1 second')
        GROUP BY o.staff_id
    """, (from_dt, to_dt))
    for r in cur.fetchall():
        out.setdefault(r["staff_id"], {"revenue": 0.0, "returns": 0.0, "orders": 0})["returns"] = float(r["returns"] or 0)
    if out:
        cols = _get_staff_cols_cached(cur)
        sel_cols = ["id", "commission_rate"]
        for opt in ("department", "is_spa_worker", "commission_policy_mode"):
            if opt in cols:
                sel_cols.append(opt)
        ids = list(out)
        dept_pols = load_dept_comm_policies(cur)
        cur.execute(f"SELECT {', '.join(sel_cols)} FROM staff WHERE id IN ({','.join('?' for _ in ids)})", ids)
        rates = {r["id"]: effective_pos_commission_rate(dict(r), dept_pols) for r in cur.fetchall()}
        for sid, v in out.items():
            v["net"] = max(0.0, v["revenue"] - v["returns"])
            v["rate"] = rates.get(sid, 0.0)
            v["commission"] = round(v["net"] * v["rate"] / 100.0)
    return out


def admin_pos_sales_summary(cur, from_dt: str, to_dt: str) -> dict:
    """Tách riêng doanh số đơn POS đứng tên tài khoản hệ thống/Admin (is_payroll_staff = 0 hoặc chưa gán NV)."""
    ph = ",".join("?" for _ in EXCLUDED_ORDER_STATUSES)
    cur.execute(f"""
        SELECT COUNT(*) AS cnt,
               COALESCE(SUM(MAX(0, COALESCE(o.total_amount,0) - COALESCE(o.discount,0))), 0) AS revenue
        FROM orders o
        LEFT JOIN staff s ON s.id = o.staff_id
        WHERE COALESCE(o.status, '') NOT IN ({ph})
          AND o.created_at >= datetime(?, '-7 hours') AND o.created_at < datetime(?, '-7 hours', '+1 second')
          AND (o.staff_id IS NULL OR COALESCE(s.is_payroll_staff, 1) = 0)
    """, (*EXCLUDED_ORDER_STATUSES, from_dt, to_dt))
    row = cur.fetchone()
    orders_cnt = int(row["cnt"] or 0) if row else 0
    rev = float(row["revenue"] or 0) if row else 0.0
    cur.execute("""
        SELECT COALESCE(SUM(ret.return_total), 0) AS returns
        FROM order_returns ret
        JOIN orders o ON o.id = ret.original_order_id
        LEFT JOIN staff s ON s.id = o.staff_id
        WHERE ret.created_at >= datetime(?, '-7 hours') AND ret.created_at < datetime(?, '-7 hours', '+1 second')
          AND (o.staff_id IS NULL OR COALESCE(s.is_payroll_staff, 1) = 0)
    """, (from_dt, to_dt))
    r2 = cur.fetchone()
    ret = float(r2["returns"] or 0) if r2 else 0.0
    return {
        "orders": orders_cnt,
        "revenue": round(rev),
        "returns": round(ret),
        "net": round(max(0.0, rev - ret)),
    }


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


def _lookup_weight_tier_rate(tiers: list, weight_kg: float, tier_key: str) -> float:
    if not tiers:
        return 0.0
    w = max(0.0, float(weight_kg or 0.0))
    sorted_tiers = sorted(tiers, key=lambda x: float(x.get("max_kg") or 999.0))
    for item in sorted_tiers:
        max_kg = float(item.get("max_kg") or 999.0)
        if w <= max_kg or max_kg >= 999.0:
            return float(item.get(tier_key, item.get("official", 0.0)) or 0.0)
    last = sorted_tiers[-1]
    return float(last.get(tier_key, last.get("official", 0.0)) or 0.0)


def _extract_ticket_surcharges(ticket: dict, lines: list) -> dict:
    """Bóc tách các khoản phụ thu trên phiếu Spa:
    - head_cut_count: số lượt PT Cắt đầu
    - art_cut_count: số lượt PT Cắt Nghệ thuật
    - detangle_fees: danh sách số tiền các khoản PT Gỡ rối phát sinh trên phiếu
    """
    res = {"head_cut_count": 0, "art_cut_count": 0, "detangle_fees": [], "raw_text": ""}
    req_txt = f"{ticket.get('customer_request') or ''} {ticket.get('note') or ''}".lower()
    res["raw_text"] = req_txt

    found_art_in_json = False
    found_head_in_json = False
    found_detangle_in_json = False
    for it in lines:
        nm = (it.get("name") or "").strip().lower()
        pr = float(it.get("price") or 0.0)
        qty = float(it.get("quantity") or 1.0)
        if not nm:
            continue
        if "cắt tỉa đầu" in nm or "cắt đầu" in nm or "pt cắt đầu" in nm:
            res["head_cut_count"] += max(1, int(qty))
            found_head_in_json = True
        elif "nghệ thuật" in nm or "pt cắt nghệ thuật" in nm:
            res["art_cut_count"] += max(1, int(qty))
            found_art_in_json = True
        elif "gỡ rối" in nm:
            if pr > 0:
                res["detangle_fees"].append(pr * qty)
                found_detangle_in_json = True

    art_fee = float(ticket.get("art_cutting_fee") or 0.0)
    if art_fee > 0 and not found_art_in_json:
        res["art_cut_count"] += 1

    surch_col = float(ticket.get("surcharge") or 0.0)
    if surch_col > 0 and not found_detangle_in_json:
        res["detangle_fees"].append(surch_col)

    if not found_head_in_json and ("pt cắt đầu" in req_txt or "phụ thu cắt đầu" in req_txt or "cắt tỉa đầu" in req_txt):
        res["head_cut_count"] += 1
    if not found_art_in_json and ("pt cắt nghệ thuật" in req_txt or "phụ thu trái tim" in req_txt or "cắt nghệ thuật" in req_txt):
        res["art_cut_count"] += 1
    if not found_detangle_in_json and "gỡ rối" in req_txt:
        m = re.search(r"gỡ\s*rối\s*(\d+)\s*k", req_txt)
        if m:
            res["detangle_fees"].append(float(m.group(1)) * 1000.0)

    return res


def spa_commission_by_name(cur, from_date: str, to_date: str) -> dict:
    """from_date/to_date: 'YYYY-MM-DD' theo ticket_date.
    Trả {ten_tho_lower: {commission, tips, tickets, service_revenue, role_counts, breakdown, tier, profile_id}}.
    """
    ensure_staff_spa_tier_cols(cur)
    cfg = load_spa_commission_config(cur)
    profiles_list = cfg.get("profiles") or DEFAULT_SPA_COMMISSION_CONFIG["profiles"]
    profile_map = {p["id"]: p for p in profiles_list if isinstance(p, dict) and p.get("id")}
    active_profile_id = cfg.get("active_profile_id") or "branch_default"
    default_profile = profile_map.get(active_profile_id) or profiles_list[0]

    staff_tier_map = {}
    staff_profile_map = {}
    try:
        cur.execute("""
            SELECT name, COALESCE(spa_commission_tier, 'official') AS spa_tier,
                   COALESCE(spa_commission_profile_id, '') AS spa_prof_id,
                   official_date, probation_start
            FROM staff
        """)
        for sr in cur.fetchall():
            nm_low = (sr[0] or "").strip().lower()
            if not nm_low:
                continue
            tier_val = (sr[1] or "official").strip().lower()
            if tier_val not in ("official", "probation"):
                tier_val = "official"
            staff_tier_map[nm_low] = tier_val
            if sr[2]:
                staff_profile_map[nm_low] = sr[2]
    except Exception:
        pass

    cur.execute("SELECT role_key, service_name, rate_type, value FROM spa_commission_rules WHERE is_active = 1")
    rules = [dict(r) for r in cur.fetchall()]

    cur.execute("""
        SELECT t.*, p.species AS pet_species, p.weight AS pet_default_weight
        FROM pet_service_tickets t
        LEFT JOIN pets p ON p.id = t.pet_id
        WHERE t.status IN ('completed', 'checked_out', 'done')
          AND t.ticket_date BETWEEN ? AND ?
    """, (from_date, to_date))
    out = {}

    def ensure_rec(name):
        k = (name or "").strip().lower()
        if not k:
            return None
        if k not in out:
            out[k] = {
                "display_name": (name or "").strip(),
                "commission": 0.0,
                "tips": 0.0,
                "tickets": 0,
                "service_revenue": 0.0,
                "tier": staff_tier_map.get(k, "official"),
                "profile_id": staff_profile_map.get(k, active_profile_id),
                "role_counts": {"receiver": 0, "worker_1": 0, "worker_2": 0, "cutter": 0, "dyer": 0},
                "breakdown": {"bath": 0.0, "cut": 0.0, "dye": 0.0, "surcharge": 0.0, "receiver": 0.0},
            }
        return out[k]

    def add_comm(name, amount, part_key="bath"):
        rec = ensure_rec(name)
        if not rec or not amount:
            return
        rec["commission"] += float(amount)
        if part_key in rec["breakdown"]:
            rec["breakdown"][part_key] += float(amount)

    def get_worker_profile_and_tier(name):
        k = (name or "").strip().lower()
        tier_key = staff_tier_map.get(k, "official")
        prof_id = staff_profile_map.get(k) or active_profile_id
        prof = profile_map.get(prof_id) or default_profile
        return prof, tier_key

    for row in cur.fetchall():
        t = dict(row)
        lines = _service_lines(t)
        service_total = sum(float(l.get("price") or 0) * float(l.get("quantity") or 1) for l in lines)
        seen = set()

        for col in SPA_ROLE_COLUMNS:
            name = (t.get(col) or "").strip()
            if not name:
                continue
            k = name.lower()
            role_key = col.replace("staff_", "")
            rec = ensure_rec(name)
            rec["role_counts"][role_key] = rec["role_counts"].get(role_key, 0) + 1
            if k not in seen:
                seen.add(k)
                rec["tickets"] += 1
                rec["service_revenue"] += service_total

        code_str = (t.get("code") or "").strip()
        use_legacy_rules = code_str.startswith("SPA-TST-") or (default_profile.get("calc_mode") == "role_rules")

        if use_legacy_rules:
            for col in SPA_ROLE_COLUMNS:
                name = (t.get(col) or "").strip()
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
                    part = "cut" if role_key == "cutter" else ("dye" if role_key == "dyer" else ("receiver" if role_key == "receiver" else "bath"))
                    add_comm(name, amount, part)
        else:
            w_kg = float(t.get("weight_at_service") or t.get("pet_default_weight") or 0.0)
            species_str = (t.get("pet_species") or "").strip().lower()
            svc_str = (t.get("service_type") or "").strip().lower()
            is_cat = ("mèo" in species_str) or ("meo" in species_str) or ("mèo" in svc_str)

            # 1. NV Tiếp nhận (staff_receiver)
            receiver_name = (t.get("staff_receiver") or "").strip()
            if receiver_name:
                r_prof, r_tier = get_worker_profile_and_tier(receiver_name)
                r_val = float(r_prof.get(f"receiver_{r_tier}", r_prof.get("receiver_official", 0.0)) or 0.0)
                if r_val > 0:
                    r_type = r_prof.get("receiver_rate_type", "fixed")
                    r_amt = (service_total * r_val / 100.0) if r_type == "percent" else r_val
                    add_comm(receiver_name, r_amt, "receiver")

            # 2. Thợ Tắm 1 & Thợ Tắm 2 (Quy tắc 1a: Chia theo tỷ lệ cấu hình 50/50 khi có 2 thợ cùng tắm)
            w1 = (t.get("staff_worker_1") or "").strip()
            w2 = (t.get("staff_worker_2") or "").strip()
            if w1 and w2 and w1.lower() == w2.lower():
                w2 = ""

            def calc_single_bath_rate(worker_name):
                prof, tier_k = get_worker_profile_and_tier(worker_name)
                if is_cat:
                    cat_cfg = prof.get("cat_rate") or {}
                    return float(cat_cfg.get(tier_k, cat_cfg.get("official", 60000.0)) or 0.0), prof, tier_k
                return _lookup_weight_tier_rate(prof.get("bath_tiers") or [], w_kg, tier_k), prof, tier_k

            if w1 and not w2:
                rate1, _, _ = calc_single_bath_rate(w1)
                add_comm(w1, rate1, "bath")
            elif w2 and not w1:
                rate2, _, _ = calc_single_bath_rate(w2)
                add_comm(w2, rate2, "bath")
            elif w1 and w2:
                rate1, prof1, _ = calc_single_bath_rate(w1)
                rate2, prof2, _ = calc_single_bath_rate(w2)
                sh1 = float(prof1.get("worker1_share_pct", 50.0)) / 100.0
                sh2 = float(prof2.get("worker2_share_pct", 50.0)) / 100.0
                add_comm(w1, rate1 * sh1, "bath")
                add_comm(w2, rate2 * sh2, "bath")

            # 3. Thợ Cắt Tỉa (staff_cutter) — Theo 3 bậc Kg Cắt nhỏ / Cắt trung / Cắt lớn
            cutter = (t.get("staff_cutter") or "").strip()
            if cutter:
                c_prof, c_tier = get_worker_profile_and_tier(cutter)
                cut_amt = _lookup_weight_tier_rate(c_prof.get("cut_tiers") or [], w_kg, c_tier)
                add_comm(cutter, cut_amt, "cut")

            # 4. Thợ Nhuộm (staff_dyer)
            dyer = (t.get("staff_dyer") or "").strip()
            if dyer:
                d_prof, d_tier = get_worker_profile_and_tier(dyer)
                dye_cfg = d_prof.get("dye_rate") or {}
                dye_amt = float(dye_cfg.get(d_tier, dye_cfg.get("official", 50000.0)) or 0.0)
                add_comm(dyer, dye_amt, "dye")

            # 5. Phụ Thu Chuyên Môn (Quy tắc 2a: PT Cắt đầu / Nghệ thuật -> Thợ Cắt; PT Gỡ rối -> Thợ Tắm)
            surch_info = _extract_ticket_surcharges(t, lines)
            surch_rules = default_profile.get("surcharge_rules") or []
            head_rule = next((r for r in surch_rules if r.get("kind") == "head_cut" or r.get("id") == "pt_cat_dau"), None)
            art_rule = next((r for r in surch_rules if r.get("kind") == "art_cut" or r.get("id") == "pt_nghe_thuat"), None)
            detangle_rules = [r for r in surch_rules if r.get("kind") == "detangle" or "go_roi" in (r.get("id") or "")]

            target_cutter = cutter or w1 or w2
            if surch_info["head_cut_count"] > 0 and target_cutter and head_rule:
                _, tc_tier = get_worker_profile_and_tier(target_cutter)
                unit_val = float(head_rule.get(tc_tier, head_rule.get("official", 25000.0)) or 0.0)
                add_comm(target_cutter, unit_val * surch_info["head_cut_count"], "surcharge")

            if surch_info["art_cut_count"] > 0 and target_cutter and art_rule:
                _, tc_tier = get_worker_profile_and_tier(target_cutter)
                unit_val = float(art_rule.get(tc_tier, art_rule.get("official", 25000.0)) or 0.0)
                add_comm(target_cutter, unit_val * surch_info["art_cut_count"], "surcharge")

            if surch_info["detangle_fees"]:
                bath_targets = [x for x in (w1, w2) if x]
                if not bath_targets and cutter:
                    bath_targets = [cutter]
                for dfee in surch_info["detangle_fees"]:
                    matched_d_rule = None
                    for dr in detangle_rules:
                        if abs(float(dr.get("fee_threshold") or 0.0) - dfee) < 1000:
                            matched_d_rule = dr
                            break
                    if len(bath_targets) == 1:
                        bw = bath_targets[0]
                        b_prof, b_tier = get_worker_profile_and_tier(bw)
                        if matched_d_rule:
                            d_comm = float(matched_d_rule.get(b_tier, matched_d_rule.get("official", 0.0)) or 0.0)
                        else:
                            pct = float(b_prof.get("detangle_fallback_pct", 50.0))
                            d_comm = dfee * pct / 100.0
                        add_comm(bw, d_comm, "surcharge")
                    elif len(bath_targets) == 2:
                        bw1, bw2 = bath_targets[0], bath_targets[1]
                        b_prof1, b_tier1 = get_worker_profile_and_tier(bw1)
                        b_prof2, b_tier2 = get_worker_profile_and_tier(bw2)
                        sh1 = float(b_prof1.get("worker1_share_pct", 50.0)) / 100.0
                        sh2 = float(b_prof2.get("worker2_share_pct", 50.0)) / 100.0
                        if matched_d_rule:
                            c1 = float(matched_d_rule.get(b_tier1, matched_d_rule.get("official", 0.0)) or 0.0) * sh1
                            c2 = float(matched_d_rule.get(b_tier2, matched_d_rule.get("official", 0.0)) or 0.0) * sh2
                        else:
                            c1 = (dfee * float(b_prof1.get("detangle_fallback_pct", 50.0)) / 100.0) * sh1
                            c2 = (dfee * float(b_prof2.get("detangle_fallback_pct", 50.0)) / 100.0) * sh2
                        add_comm(bw1, c1, "surcharge")
                        add_comm(bw2, c2, "surcharge")

            custom_surch = [r for r in surch_rules if r.get("kind") not in ("head_cut", "art_cut", "detangle")
                            and r.get("id") not in ("pt_cat_dau", "pt_nghe_thuat")
                            and not (r.get("id") or "").startswith("pt_go_roi_")]
            for cr in custom_surch:
                lbl_low = (cr.get("label") or "").strip().lower()
                if not lbl_low:
                    continue
                kw = lbl_low.replace("pt ", "").strip()
                if kw and (kw in surch_info["raw_text"] or any(kw in (l.get("name") or "").lower() for l in lines)):
                    t_role = cr.get("target_role", "cutter")
                    t_worker = (cutter or w1) if t_role == "cutter" else (w1 or cutter)
                    if t_worker:
                        _, tw_tier = get_worker_profile_and_tier(t_worker)
                        c_val = float(cr.get(tw_tier, cr.get("official", 0.0)) or 0.0)
                        add_comm(t_worker, c_val, "surcharge")

        tip = float(t.get("tip_amount") or 0)
        if tip > 0:
            takers = []
            for col in TIP_ROLE_COLUMNS:
                n = (t.get(col) or "").strip()
                if n and n.lower() not in [x.lower() for x in takers]:
                    takers.append(n)
            if not takers and (t.get("staff_receiver") or "").strip():
                takers = [t["staff_receiver"].strip()]
            for n in takers:
                rec = ensure_rec(n)
                if rec:
                    rec["tips"] += tip / len(takers)

    for v in out.values():
        v["commission"] = round(v["commission"])
        v["tips"] = round(v["tips"])
        v["service_revenue"] = round(v["service_revenue"])
        for bk in v["breakdown"]:
            v["breakdown"][bk] = round(v["breakdown"][bk])
    return out
