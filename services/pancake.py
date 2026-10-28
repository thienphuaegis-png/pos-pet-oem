"""POSCAKE (pos.pages.fm) — kéo đơn về marketplace_orders + tính hoa hồng Sales Pancake.

Đã verify trên API thật 2 shop (10/2026): auth = ?api_key=, phân trang page/page_size,
lọc ngày startDateTime/endDateTime (unix), inserted_at là giờ UTC, NV bán = assigning_seller.name,
combo = is_composite + components[], hàng hoàn = items[].return_quantity.
"""
import asyncio
import datetime
import json

import httpx

from services.marketplace_stock import PANCAKE_STATUS, PANCAKE_NO_REVENUE, PANCAKE_RETURN_CODES, sync_orders_stock

BASE_URL = "https://pos.pages.fm/api/v1"

# Công thức tool poscake-staff-commission cũ: DT <= 120tr -> 0; vượt 120tr -> (DT-120tr) x tỷ lệ theo bậc
# tổng DT; lương 5,2tr -> 6,5tr khi đạt mốc => thưởng đạt mốc 1,3tr (lương cứng giữ ở hồ sơ HRM).
DEFAULT_RULES = {
    "threshold": 120_000_000,
    "bonus_at_threshold": 1_300_000,
    "tiers": [[300_000_000, 2.5], [500_000_000, 3.0], [None, 3.5]],
}


def calc_commission(revenue: float, rules: dict) -> dict:
    threshold = float(rules.get("threshold") or 0)
    if revenue < threshold or revenue <= 0:
        return {"rate": 0.0, "commission": 0, "bonus": 0}
    rate = 0.0
    for up_to, r in rules.get("tiers") or []:
        if up_to is None or revenue <= float(up_to):
            rate = float(r)
            break
    return {"rate": rate, "commission": round(max(0.0, revenue - threshold) * rate / 100.0),
            "bonus": round(float(rules.get("bonus_at_threshold") or 0))}


def load_default_rules(cur) -> dict:
    cur.execute("SELECT value FROM settings WHERE key = 'pancake_commission_rules'")
    r = cur.fetchone()
    try:
        return json.loads(r[0]) if r and r[0] else dict(DEFAULT_RULES)
    except ValueError:
        return dict(DEFAULT_RULES)


def _vn_time(iso: str) -> str:
    try:
        return (datetime.datetime.fromisoformat(iso.split(".")[0]) + datetime.timedelta(hours=7)).strftime("%Y-%m-%d %H:%M:%S")
    except (ValueError, AttributeError):
        return datetime.datetime.now().strftime("%Y-%m-%d %H:%M:%S")


def _sku(vi: dict, pid_key: str, did_key: str):
    pdid = str(vi.get(pid_key) or "").strip()
    did = str(vi.get(did_key) or "").strip()
    variation = "" if did in ("", "1") or did == pdid else did
    return (f"{pdid}/{variation}" if variation else pdid), variation


def order_lines(o: dict) -> list:
    """Dòng hàng lẻ để trừ kho: combo tách thành phần; SL hoàn chỉ tính khi đơn đã hoàn về."""
    returned = o.get("status") in PANCAKE_RETURN_CODES
    out = []
    for it in o.get("items") or []:
        qty = float(it.get("quantity") or 1)
        ret = float(it.get("return_quantity") or 0) if returned else 0.0
        comps = it.get("components") if it.get("is_composite") else None
        if comps:
            for cp in comps:
                vi = cp.get("variation_info") or {}
                sku, var = _sku(vi, "product_id", "id")
                k = float(cp.get("quantity") or 1)
                out.append({"name": vi.get("name") or "Thành phần combo", "variation": var, "sku": sku,
                            "item_id": cp.get("variation_id") or "", "qty": qty * k, "returned": ret * k,
                            "price": float(vi.get("retail_price") or 0)})
        else:
            vi = it.get("variation_info") or {}
            sku, var = _sku(vi, "product_display_id", "display_id")
            out.append({"name": vi.get("name") or it.get("note_product") or "Sản phẩm Pancake", "variation": var,
                        "sku": sku, "item_id": it.get("variation_id") or "", "qty": qty, "returned": ret,
                        "price": float(vi.get("retail_price") or 0)})
    return out


def _collected(o: dict) -> float:
    due = float(o.get("money_to_collect") or 0)
    paid = sum(float(o.get(k) or 0) for k in ("cash", "charged_by_card", "charged_by_momo", "charged_by_qrpay", "prepaid"))
    if due <= 0 or paid >= due - 1 or (float(o.get("cod") or 0) > 1 and o.get("status") == 3):
        return due
    return 0.0


async def fetch_orders(shop_id: str, api_key: str, start_unix: int, end_unix: int) -> list:
    rows, page = [], 1
    async with httpx.AsyncClient(timeout=40.0) as client:
        while True:
            res = await client.get(f"{BASE_URL}/shops/{shop_id}/orders", params={
                "api_key": api_key, "page": page, "page_size": 100,
                "startDateTime": start_unix, "endDateTime": end_unix})
            if res.status_code == 429:
                await asyncio.sleep(5)
                continue
            data = res.json() if res.headers.get("content-type", "").startswith("application/json") else {}
            if res.status_code != 200 or not data.get("success"):
                raise ValueError(data.get("message") or f"POSCAKE trả HTTP {res.status_code}")
            rows += data.get("data") or []
            if page >= int(data.get("total_pages") or 0):
                return rows
            page += 1
            await asyncio.sleep(1.2)  # POSCAKE chặn khi gọi dồn dập


def _find_product(cur, mappings: list, line: dict, products_by_code: dict = None, products_by_name: dict = None):
    for m in mappings:
        if m["platform_sku"] and m["platform_sku"].lower() == line["sku"].lower():
            return m["product_id"]
        if m["platform_item_name"].lower() == line["name"].lower() and \
                (m["platform_variation"] or "").lower() == line["variation"].lower():
            return m["product_id"]
    base = line["sku"].split("/")[0].strip().upper()
    var_code = (line["variation"] or base).strip().upper()
    if products_by_code is not None and products_by_name is not None:
        if base in products_by_code:
            return products_by_code[base]
        if var_code in products_by_code:
            return products_by_code[var_code]
        if not line["variation"]:
            nm = line["name"].strip().lower()
            if nm in products_by_name:
                return products_by_name[nm]
        return None
    # Tự khớp chắc chắn: mã POS trùng mã POSCAKE (mã SP hoặc mã biến thể) hoặc tên trùng hệt; còn lại người dùng tự ánh xạ
    cur.execute("""SELECT id FROM products WHERE is_active = 1 AND type != 'service'
                   AND (UPPER(TRIM(code)) IN (UPPER(?), UPPER(?)) OR (? = '' AND LOWER(TRIM(name)) = LOWER(?))) LIMIT 1""",
                (base, line["variation"] or base, line["variation"], line["name"].strip()))
    r = cur.fetchone()
    return r[0] if r else None


def save_orders(cur, account_id: int, raw_orders: list) -> dict:
    if not raw_orders:
        return {"orders": 0, "items": 0}
    cur.execute("SELECT platform_sku, platform_item_name, platform_variation, product_id FROM marketplace_sku_mappings WHERE platform = 'pancake'")
    mappings = [dict(r) for r in cur.fetchall()]
    cur.execute("SELECT id, code, name FROM products WHERE is_active = 1 AND type != 'service'")
    products_by_code, products_by_name = {}, {}
    for pr in cur.fetchall():
        if pr["code"] and pr["code"].strip():
            products_by_code.setdefault(pr["code"].strip().upper(), pr["id"])
        if pr["name"] and pr["name"].strip():
            products_by_name.setdefault(pr["name"].strip().lower(), pr["id"])

    parsed_orders = []
    sellers = set()
    for o in raw_orders:
        link = o.get("order_link") or ""
        sn = link.split("order_id=")[1].split("&")[0] if "order_id=" in link else f"{o.get('shop_id')}-{o.get('id')}"
        status = PANCAKE_STATUS.get(o.get("status"), o.get("status_name") or str(o.get("status")))
        seller = ((o.get("assigning_seller") or {}).get("name") or (o.get("creator") or {}).get("name") or "Chưa gán NV").strip()
        cust = o.get("bill_full_name") or (o.get("customer") or {}).get("name") or ""
        tracking = (o.get("partner") or {}).get("extend_code") or ""
        due = float(o.get("money_to_collect") or 0)
        sellers.add((seller,))
        parsed_orders.append((
            sn,
            (account_id, sn, status, _vn_time(o.get("inserted_at") or ""), due, float(o.get("shipping_fee") or 0),
             _collected(o), cust, tracking, seller),
            order_lines(o),
        ))

    upsert_sql = """
        INSERT INTO marketplace_orders (platform, account_id, order_sn, order_status, order_date, total_amount,
            shipping_fee, net_payout, buyer_username, tracking_number, seller_name)
        VALUES ('pancake', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(platform, order_sn) DO UPDATE SET
            order_status = excluded.order_status, total_amount = excluded.total_amount,
            shipping_fee = excluded.shipping_fee, net_payout = excluded.net_payout,
            buyer_username = excluded.buyer_username, tracking_number = excluded.tracking_number,
            seller_name = excluded.seller_name, updated_at = CURRENT_TIMESTAMP
    """
    chunk_size = 200
    order_tuples = [p[1] for p in parsed_orders]
    for i in range(0, len(order_tuples), chunk_size):
        cur.executemany(upsert_sql, order_tuples[i:i + chunk_size])

    all_sns = [p[0] for p in parsed_orders]
    sn_to_id = {}
    for i in range(0, len(all_sns), chunk_size):
        sn_chunk = all_sns[i:i + chunk_size]
        ph = ",".join("?" for _ in sn_chunk)
        cur.execute(f"SELECT order_sn, id FROM marketplace_orders WHERE platform = 'pancake' AND order_sn IN ({ph})", tuple(sn_chunk))
        for r in cur.fetchall():
            sn_to_id[r["order_sn"]] = r["id"]

    ids = [sn_to_id[sn] for sn in all_sns if sn in sn_to_id]
    for i in range(0, len(ids), chunk_size):
        id_chunk = ids[i:i + chunk_size]
        ph = ",".join("?" for _ in id_chunk)
        cur.execute(f"DELETE FROM marketplace_order_items WHERE order_id IN ({ph})", tuple(id_chunk))

    item_tuples = []
    for sn, _, lines in parsed_orders:
        oid = sn_to_id.get(sn)
        if not oid:
            continue
        for ln in lines:
            mpid = _find_product(cur, mappings, ln, products_by_code, products_by_name)
            item_tuples.append((oid, ln["item_id"], ln["name"], ln["variation"], ln["sku"], ln["qty"], ln["price"],
                                ln["qty"] * ln["price"], mpid, ln["returned"]))

    item_sql = """INSERT INTO marketplace_order_items (order_id, platform_item_id, platform_product_name,
                      platform_variation, platform_sku, quantity, unit_price, subtotal, mapped_product_id, returned_qty)
                  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)"""
    for i in range(0, len(item_tuples), chunk_size):
        cur.executemany(item_sql, item_tuples[i:i + chunk_size])

    if sellers:
        cur.executemany("INSERT OR IGNORE INTO pancake_sellers (seller_name) VALUES (?)", list(sellers))

    sync_orders_stock(cur, ids)
    return {"orders": len(ids), "items": len(item_tuples)}


def seller_summary(cur, date_from: str, date_to: str) -> list:
    """Doanh thu (Phải thu, bỏ hủy/hoàn) + hoa hồng theo từng tên NV bán Pancake trong khoảng ngày."""
    default = load_default_rules(cur)
    ph = ",".join("?" for _ in PANCAKE_NO_REVENUE)
    cur.execute(f"""
        SELECT s.seller_name, s.staff_id, s.rules_json, st.name AS staff_name,
               COUNT(o.id) AS orders, COALESCE(SUM(o.total_amount), 0) AS revenue,
               COALESCE(SUM(o.net_payout), 0) AS collected
        FROM pancake_sellers s
        LEFT JOIN staff st ON st.id = s.staff_id
        LEFT JOIN marketplace_orders o ON o.platform = 'pancake' AND o.seller_name = s.seller_name
             AND o.order_status NOT IN ({ph}) AND date(o.order_date) BETWEEN date(?) AND date(?)
        GROUP BY s.seller_name ORDER BY revenue DESC, s.seller_name
    """, (*PANCAKE_NO_REVENUE, date_from, date_to))
    out = []
    for r in cur.fetchall():
        d = dict(r)
        try:
            custom = json.loads(d["rules_json"]) if d["rules_json"] else None
        except ValueError:
            custom = None
        d["rules"] = custom or default
        d["custom_rules"] = bool(custom)
        d.update(calc_commission(float(d["revenue"]), d["rules"]))
        out.append(d)
    return out


def commission_by_staff(cur, date_from: str, date_to: str) -> dict:
    """{staff_id: {revenue, commission}} — gộp các tên NV Pancake gán cùng 1 nhân viên rồi mới xét bậc."""
    by_staff = {}
    for s in seller_summary(cur, date_from, date_to):
        if not s["staff_id"]:
            continue
        g = by_staff.setdefault(s["staff_id"], {"revenue": 0.0, "rules": s["rules"]})
        g["revenue"] += float(s["revenue"])
        if s["custom_rules"]:
            g["rules"] = s["rules"]
    out = {}
    for sid, g in by_staff.items():
        c = calc_commission(g["revenue"], g["rules"])
        out[sid] = {"revenue": g["revenue"], "commission": c["commission"] + c["bonus"]}
    return out
