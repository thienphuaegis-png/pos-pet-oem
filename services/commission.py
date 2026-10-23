"""Hoa hồng nhân viên — nguồn duy nhất cho báo cáo + bảng lương.
Bán hàng: % (staff.commission_rate) x doanh thu thuần = (tổng tiền hàng - giảm giá) đơn hợp lệ - giá trị hàng trả.
Spa: quy tắc theo vai trò trên phiếu dịch vụ (spa_commission_rules) + chia tip.
"""
import json

EXCLUDED_ORDER_STATUSES = ("Lưu nháp", "draft", "cancelled", "Đã hủy")
SPA_ROLE_COLUMNS = ("staff_receiver", "staff_worker_1", "staff_worker_2", "staff_cutter", "staff_dyer")
TIP_ROLE_COLUMNS = ("staff_worker_1", "staff_worker_2", "staff_cutter", "staff_dyer")


def order_commission_base(total_amount, discount) -> float:
    return max(0.0, float(total_amount or 0) - float(discount or 0))


def calc_order_commission(cur, staff_id, total_amount, discount) -> float:
    cur.execute("SELECT commission_rate FROM staff WHERE id = ?", (staff_id,))
    row = cur.fetchone()
    rate = float(row["commission_rate"] or 0) if row else 0.0
    return round(order_commission_base(total_amount, discount) * rate / 100.0)


def sales_commission_by_staff(cur, from_dt: str, to_dt: str) -> dict:
    """from_dt/to_dt: 'YYYY-MM-DD HH:MM:SS' giờ VN. Trả {staff_id: {revenue, returns, net, rate, commission}}."""
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
    """from_date/to_date: 'YYYY-MM-DD' theo ticket_date. Trả {ten_tho_lower: {commission, tips, tickets}}."""
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
