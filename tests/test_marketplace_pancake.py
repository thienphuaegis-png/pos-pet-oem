"""Pancake (POSCAKE) + trừ kho đơn sàn: dữ liệu mẫu theo đúng cấu trúc đơn POSCAKE thật (10/2026)."""
import json

from database import get_db, init_db
from services import pancake as P
from services.marketplace_stock import sync_order_stock


def _order(oid, status, items, seller="NV Test Pancake", money=200000, inserted="2026-10-20T03:00:00.123"):
    return {"id": oid, "shop_id": 999, "status": status, "status_name": "x", "money_to_collect": money,
            "cod": money, "cash": 0, "inserted_at": inserted, "bill_full_name": "Khách A",
            "order_link": f"https://pos.pages.fm/shop/999/order?order_id=TESTPC{oid}",
            "assigning_seller": {"name": seller}, "partner": {"extend_code": "SPX1"}, "items": items}


def _single(code, qty, ret=0):
    return {"quantity": qty, "return_quantity": ret, "is_composite": None, "variation_id": f"v-{code}",
            "variation_info": {"name": f"SP {code}", "display_id": "1", "product_display_id": code, "retail_price": 50000}}


def _combo(code, per, qty):
    return {"quantity": qty, "return_quantity": 0, "is_composite": True, "variation_id": "v-combo",
            "variation_info": {"name": "Combo test", "display_id": "CB", "product_display_id": "CB"},
            "components": [{"quantity": per, "variation_id": f"v-{code}",
                            "variation_info": {"id": "ABC", "product_id": code, "name": f"SP {code}", "retail_price": 50000}}]}


def _setup():
    init_db()
    conn = get_db()
    cur = conn.cursor()
    cur.execute("DELETE FROM inventory_logs WHERE order_code LIKE 'MKT-PANCAKE-TESTPC%'")
    cur.execute("DELETE FROM marketplace_orders WHERE order_sn LIKE 'TESTPC%'")
    cur.execute("DELETE FROM pancake_sellers WHERE seller_name LIKE 'NV Test%'")
    cur.execute("UPDATE settings SET value = '2026-10-01' WHERE key = 'mkt_stock_start_date'")
    cur.execute("""INSERT OR REPLACE INTO products (id, code, name, type, unit, stock, is_active)
                   VALUES (97001, 'PCTEST1', 'Hàng test Pancake', 'product', 'gói', 100, 1)""")
    cur.execute("INSERT INTO marketplace_accounts (platform, shop_name, cookies, extra_config) VALUES ('pancake', 'Shop test', 'k', ?)",
                (json.dumps({"shop_id": "999"}),))
    return conn, cur, cur.lastrowid


def _stock(cur):
    cur.execute("SELECT stock FROM products WHERE id = 97001")
    return cur.fetchone()[0]


def test_pancake_stock_lifecycle_idempotent():
    conn, cur, acc = _setup()
    try:
        # Mới (0): chưa trừ. Xác nhận (1): trừ 2 lẻ + combo 3x2 = 8. Đồng bộ lại: không trừ thêm.
        P.save_orders(cur, acc, [_order(1, 0, [_single("PCTEST1", 2), _combo("PCTEST1", 3, 2)])])
        assert _stock(cur) == 100
        P.save_orders(cur, acc, [_order(1, 1, [_single("PCTEST1", 2), _combo("PCTEST1", 3, 2)])])
        assert _stock(cur) == 92
        P.save_orders(cur, acc, [_order(1, 2, [_single("PCTEST1", 2), _combo("PCTEST1", 3, 2)])])
        assert _stock(cur) == 92
        # Hoàn (5) trả 1 gói lẻ -> cộng lại 1
        P.save_orders(cur, acc, [_order(1, 5, [_single("PCTEST1", 2, ret=1), _combo("PCTEST1", 3, 2)])])
        assert _stock(cur) == 93
        # Hủy (6) -> cộng lại hết
        P.save_orders(cur, acc, [_order(1, 6, [_single("PCTEST1", 2), _combo("PCTEST1", 3, 2)])])
        assert _stock(cur) == 100
        # Xóa đơn đã trừ -> cộng lại
        P.save_orders(cur, acc, [_order(2, 3, [_single("PCTEST1", 4)])])
        assert _stock(cur) == 96
        cur.execute("SELECT id FROM marketplace_orders WHERE order_sn = 'TESTPC2'")
        sync_order_stock(cur, cur.fetchone()[0], force_zero=True)
        assert _stock(cur) == 100
        # Đơn trước mốc bắt đầu trừ kho: không đụng kho
        P.save_orders(cur, acc, [_order(3, 3, [_single("PCTEST1", 5)], inserted="2026-09-20T03:00:00")])
        assert _stock(cur) == 100
    finally:
        conn.rollback()
        conn.close()


def test_mapping_later_deducts_and_remap_moves_stock():
    conn, cur, acc = _setup()
    try:
        P.save_orders(cur, acc, [_order(4, 3, [_single("KHONGCO", 3)])])
        assert _stock(cur) == 100  # chưa ánh xạ -> chưa trừ
        cur.execute("""UPDATE marketplace_order_items SET mapped_product_id = 97001
                       WHERE order_id = (SELECT id FROM marketplace_orders WHERE order_sn = 'TESTPC4')""")
        cur.execute("SELECT id FROM marketplace_orders WHERE order_sn = 'TESTPC4'")
        sync_order_stock(cur, cur.fetchone()[0])
        assert _stock(cur) == 97
    finally:
        conn.rollback()
        conn.close()


def test_commission_formula_matches_old_tool():
    r = P.DEFAULT_RULES
    assert P.calc_commission(119_999_999, r) == {"rate": 0.0, "commission": 0, "bonus": 0}
    assert P.calc_commission(200_000_000, r) == {"rate": 2.5, "commission": 2_000_000, "bonus": 1_300_000}
    assert P.calc_commission(400_000_000, r)["commission"] == round(280_000_000 * 0.03)
    assert P.calc_commission(600_000_000, r)["rate"] == 3.5


def test_seller_assign_custom_rules_flow_to_payroll():
    conn, cur, acc = _setup()
    try:
        P.save_orders(cur, acc, [_order(5, 3, [], seller="NV Test A", money=150_000_000),
                                 _order(6, 6, [], seller="NV Test A", money=90_000_000),   # hủy: không tính
                                 _order(7, 5, [], seller="NV Test A", money=10_000_000)])  # hoàn: không tính
        cur.execute("SELECT id FROM staff WHERE is_active = 1 ORDER BY id LIMIT 1")
        sid = cur.fetchone()[0]
        cur.execute("UPDATE pancake_sellers SET staff_id = ?, rules_json = ? WHERE seller_name = 'NV Test A'",
                    (sid, json.dumps({"threshold": 100_000_000, "bonus_at_threshold": 0, "tiers": [[None, 10]]})))
        row = [s for s in P.seller_summary(cur, "2026-10-01", "2026-10-31") if s["seller_name"] == "NV Test A"][0]
        assert row["revenue"] == 150_000_000 and row["orders"] == 1 and row["commission"] == 5_000_000
        assert P.commission_by_staff(cur, "2026-10-01", "2026-10-31")[sid]["commission"] >= 5_000_000
    finally:
        conn.rollback()
        conn.close()


def test_pancake_platform_allowed_by_schema():
    init_db()
    conn = get_db()
    cur = conn.cursor()
    cur.execute("SELECT sql FROM sqlite_master WHERE name IN ('marketplace_orders', 'marketplace_accounts')")
    assert all("CHECK(platform" not in r[0] for r in cur.fetchall())
    conn.close()
