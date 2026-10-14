import logging
import datetime

logger = logging.getLogger("cashbook_sync")

def generate_sync_code(cur, prefix: str, date_str: str) -> str:
    """Sinh mã chứng từ dựa theo ngày của giao dịch gốc để đồng bộ chuẩn kế toán"""
    try:
        # date_str có thể là ISO hoặc 'YYYY-MM-DD HH:MM:SS'
        d = date_str[:10].replace("-", "")[2:] # YYMMDD
    except Exception:
        d = datetime.datetime.now().strftime("%y%m%d")

    code_prefix = f"{prefix}-{d}-"
    cur.execute("SELECT code FROM cashbook WHERE code LIKE ? ORDER BY code DESC LIMIT 1", (f"{code_prefix}%",))
    row = cur.fetchone()
    if row and row[0]:
        try:
            last_seq = int(row[0].split("-")[-1])
            new_seq = last_seq + 1
        except Exception:
            new_seq = 1
    else:
        new_seq = 1
    return f"{code_prefix}{new_seq:03d}"

def sync_missing_cashbook_entries(conn):
    """
    Quét và tự động sinh bù các phiếu Thu/Chi trong cashbook cho:
    1. Phiếu nhập purchases có paid_amount > 0 chưa có cashbook (ref_type = 'purchase')
    2. Đơn bán hàng orders có paid_amount > 0 chưa có cashbook (ref_type = 'order')
    """
    cur = conn.cursor()
    purchases_synced = 0
    orders_synced = 0

    # 1. Tìm tài khoản mặc định cho PERSONAL và COMPANY
    acc_map = {}
    try:
        cur.execute("SELECT owner_type, id FROM payment_accounts WHERE is_active = 1 ORDER BY is_default DESC, id ASC")
        for row in cur.fetchall():
            owner = row[0]
            if owner not in acc_map:
                acc_map[owner] = row[1]
    except Exception:
        pass

    # 2. Xử lý PURCHASES
    cur.execute("""
    SELECT p.id, p.code, p.supplier_id, p.paid_amount, p.fund_source, p.created_at, p.status
    FROM purchases p
    WHERE p.paid_amount > 0 AND p.status != 'cancelled'
      AND NOT EXISTS (
          SELECT 1 FROM cashbook cb 
          WHERE cb.ref_type = 'purchase' AND cb.ref_id = p.id
      )
    ORDER BY p.id ASC
    """)
    unlinked_purchases = [dict(r) for r in cur.fetchall()]

    for p in unlinked_purchases:
        fund_src = (p.get("fund_source") or "PERSONAL").upper()
        acc_id = acc_map.get(fund_src) or acc_map.get("PERSONAL") or acc_map.get("COMPANY")
        cb_date = p.get("created_at") or datetime.datetime.now().strftime("%Y-%m-%d %H:%M:%S")
        cb_code = generate_sync_code(cur, "PC-NH", cb_date)
        note = f"Chi thanh toán phiếu nhập {p['code']} (Đồng bộ tự động)"

        cur.execute("""
        INSERT INTO cashbook (code, type, category, amount, contact_id, ref_type, ref_id, fund_source, note, account_id, created_at)
        VALUES (?, 'out', 'Chi tiền nhập hàng', ?, ?, 'purchase', ?, ?, ?, ?, ?)
        """, (cb_code, p["paid_amount"], p["supplier_id"], p["id"], fund_src, note, acc_id, cb_date))
        purchases_synced += 1

    # 3. Xử lý ORDERS
    cur.execute("""
    SELECT o.id, o.code, o.customer_id, o.paid_amount, o.created_at, o.status
    FROM orders o
    WHERE o.paid_amount > 0 AND o.status != 'cancelled'
      AND NOT EXISTS (
          SELECT 1 FROM cashbook cb 
          WHERE cb.ref_type = 'order' AND cb.ref_id = o.id
      )
    ORDER BY o.id ASC
    """)
    unlinked_orders = [dict(r) for r in cur.fetchall()]

    for o in unlinked_orders:
        fund_src = "COMPANY"
        acc_id = acc_map.get("COMPANY") or acc_map.get("PERSONAL")
        cb_date = o.get("created_at") or datetime.datetime.now().strftime("%Y-%m-%d %H:%M:%S")
        cb_code = generate_sync_code(cur, "PT-BH", cb_date)
        note = f"Thu tiền đơn bán hàng {o['code']} (Đồng bộ tự động)"

        cur.execute("""
        INSERT INTO cashbook (code, type, category, amount, contact_id, ref_type, ref_id, fund_source, note, account_id, created_at)
        VALUES (?, 'in', 'Thu tien ban hang', ?, ?, 'order', ?, ?, ?, ?, ?)
        """, (cb_code, o["paid_amount"], o["customer_id"], o["id"], fund_src, note, acc_id, cb_date))
        orders_synced += 1

    conn.commit()
    return {
        "purchases_synced": purchases_synced,
        "orders_synced": orders_synced
    }

if __name__ == "__main__":
    from database import get_db
    conn = get_db()
    res = sync_missing_cashbook_entries(conn)
    print(f"Hoàn thành đồng bộ: {res['purchases_synced']} phiếu nhập, {res['orders_synced']} đơn hàng.")
    conn.close()
