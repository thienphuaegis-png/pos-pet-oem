"""Trừ / hoàn kho đơn sàn TMĐT (Shopee, TikTok, Pancake) — idempotent theo nhật ký kho.

Mỗi lần gọi: tính SL cần trừ theo trạng thái + ánh xạ SKU hiện tại, so với số đã ghi trong
inventory_logs (order_code = MKT-<SÀN>-<mã đơn>), chỉ ghi phần chênh lệch. Đồng bộ lại, đổi ánh xạ,
hủy, hoàn, xóa đơn đều đi qua đây nên không bao giờ trừ 2 lần.
"""
WAREHOUSE_ID = 1  # kho mặc định

# Mã trạng thái đơn POSCAKE -> nhãn hiển thị (đã thấy thật: 0,1,2,3,5,6,9)
PANCAKE_STATUS = {
    0: "Mới", 1: "Đã xác nhận", 2: "Đã gửi hàng", 3: "Đã nhận", 4: "Đang hoàn", 5: "Đã hoàn",
    6: "Đã hủy", 7: "Đã xóa", 8: "Đang đóng hàng", 9: "Chờ chuyển hàng", 11: "Chờ hàng",
    12: "Chờ in", 13: "Đã in", 15: "Hoàn 1 phần", 16: "Đã thu tiền", 17: "Chờ xác nhận", 20: "Đã đặt hàng",
}
PANCAKE_NO_STOCK = {"Mới", "Chờ xác nhận", "Đã hủy", "Đã xóa"}  # chưa xác nhận / hủy -> không trừ kho
PANCAKE_NO_REVENUE = ("Đã hủy", "Đã xóa", "Đang hoàn", "Đã hoàn", "Hoàn 1 phần")  # giống tool hoa hồng cũ
PANCAKE_RETURN_CODES = (5, 15)  # hàng đã về kho -> cộng lại return_quantity


def stock_code(platform: str, order_sn: str) -> str:
    return f"MKT-{(platform or '').upper()}-{order_sn}"


def status_deducts(platform: str, status: str) -> bool:
    if platform == "pancake":
        return status not in PANCAKE_NO_STOCK
    s = (status or "").lower()
    # ponytail: Shopee/TikTok trả hàng chưa tự cộng kho (chưa thấy nhãn trạng thái hoàn thật); thêm khi có mẫu
    return not any(k in s for k in ("hủy", "huỷ", "cancel", "chờ xác nhận", "chưa thanh toán", "unpaid"))


def _start_date(cur) -> str:
    cur.execute("SELECT value FROM settings WHERE key = 'mkt_stock_start_date'")
    r = cur.fetchone()
    return (r[0] if r else "") or "9999-12-31"


def sync_order_stock(cur, order_id: int, force_zero: bool = False, start_date: str = None):
    cur.execute("SELECT platform, order_sn, order_status, order_date FROM marketplace_orders WHERE id = ?", (order_id,))
    o = cur.fetchone()
    if not o:
        return
    code = stock_code(o["platform"], o["order_sn"])
    want = {}
    start = start_date or _start_date(cur)
    if not force_zero and str(o["order_date"])[:10] >= start and status_deducts(o["platform"], o["order_status"]):
        cur.execute("""SELECT mapped_product_id AS pid, SUM(quantity - COALESCE(returned_qty, 0)) AS q
                       FROM marketplace_order_items WHERE order_id = ? AND mapped_product_id IS NOT NULL
                       GROUP BY mapped_product_id""", (order_id,))
        want = {r["pid"]: float(r["q"] or 0) for r in cur.fetchall()}
    cur.execute("""SELECT product_id AS pid, -SUM(quantity) AS q FROM inventory_logs
                   WHERE order_code = ? AND product_id IS NOT NULL GROUP BY product_id""", (code,))
    have = {r["pid"]: float(r["q"] or 0) for r in cur.fetchall()}
    for pid in set(want) | set(have):
        delta = round(want.get(pid, 0.0) - have.get(pid, 0.0), 4)  # > 0: trừ thêm, < 0: cộng lại
        if not delta:
            continue
        cur.execute("SELECT type FROM products WHERE id = ?", (pid,))
        p = cur.fetchone()
        if not p or p["type"] == "service":
            continue
        cur.execute("UPDATE products SET stock = stock - ? WHERE id = ?", (delta, pid))
        cur.execute("""INSERT INTO product_inventory (warehouse_id, product_id, quantity, updated_at)
                       VALUES (?, ?, ?, CURRENT_TIMESTAMP)
                       ON CONFLICT(warehouse_id, product_id) DO UPDATE SET
                           quantity = quantity - ?, updated_at = CURRENT_TIMESTAMP""",
                    (WAREHOUSE_ID, pid, -delta, delta))
        cur.execute("SELECT stock FROM products WHERE id = ?", (pid,))
        bal = cur.fetchone()["stock"]
        cur.execute("""INSERT INTO inventory_logs (item_type, product_id, warehouse_id, change_type, quantity,
                           balance_after, order_code, note)
                       VALUES ('product', ?, ?, ?, ?, ?, ?, ?)""",
                    (pid, WAREHOUSE_ID, "SALE" if delta > 0 else "SALE_RETURN", -delta, bal, code,
                     f"Đơn {o['platform']} {o['order_sn']} ({o['order_status']})"))


def sync_orders_stock(cur, order_ids, force_zero: bool = False):
    start = _start_date(cur)
    for oid in order_ids:
        sync_order_stock(cur, oid, force_zero=force_zero, start_date=start)
