import sqlite3
import datetime
from database import get_db, init_db
from routers.oem import create_oem_order, receive_oem_order, get_cashflow_forecast
from schemas import OEMOrderCreate, OEMOrderItemIn, OEMOrderReceive, OEMReceiveItemIn

def run_test():
    init_db()
    conn = get_db()
    cur = conn.cursor()
    
    # 1. Tạo nhà máy đối tác
    cur.execute("INSERT OR IGNORE INTO contacts (id, type, name, phone) VALUES (9999, 'supplier', 'Nhà Máy Mastercare OEM', '0911222333')")
    
    # 2. Tạo kho xưởng gia công OEM
    cur.execute("INSERT OR IGNORE INTO warehouses (id, code, name, is_oem) VALUES (8888, 'KHO-OEM-MC', 'Kho Xưởng Mastercare', 1)")
    
    # 3. Tạo nguyên liệu chai, nắp, tem
    # id 9001: Chai 1000ml (cost 3500)
    # id 9002: Nắp 1000ml (cost 800)
    # id 9003: Tem Bạc Hà (cost 1200)
    # id 9004: Tem Chanh Sả (cost 1200)
    # id 9005: Tem Quế Cam (cost 1200)
    materials = [
        (9001, 'NL-CHAI-1000', 'Vỏ chai 1000ml', 'chai', 'IS_PHYSICAL', 3500.0),
        (9002, 'NL-NAP-1000', 'Nắp chai 1000ml', 'cái', 'IS_PHYSICAL', 800.0),
        (9003, 'NL-TEM-BH', 'Tem nhãn Bạc Hà', 'cái', 'IS_PHYSICAL', 1200.0),
        (9004, 'NL-TEM-CS', 'Tem nhãn Chanh Sả', 'cái', 'IS_PHYSICAL', 1200.0),
        (9005, 'NL-TEM-QC', 'Tem nhãn Quế Cam', 'cái', 'IS_PHYSICAL', 1200.0),
    ]
    for mid, code, name, unit, mtype, cost in materials:
        cur.execute("""
            INSERT OR REPLACE INTO ingredients (id, code, name, unit, type)
            VALUES (?, ?, ?, ?, ?)
        """, (mid, code, name, unit, mtype))
        cur.execute("""
            INSERT INTO price_history (ingredient_id, purchase_price, effective_date)
            VALUES (?, ?, CURRENT_TIMESTAMP)
        """, (mid, cost))
        # Cho tồn kho ban đầu tại kho xưởng là 10.000 cái mỗi loại
        cur.execute("""
            INSERT OR REPLACE INTO inventory (ingredient_id, warehouse_id, quantity)
            VALUES (?, 8888, 10000)
        """, (mid,))
        
    # 4. Tạo sản phẩm thành phẩm
    products = [
        (9101, 'SP-BH-1000', 'Nước Lau Sàn Bạc Hà 1000ml', 'chai'),
        (9102, 'SP-CS-1000', 'Nước Lau Sàn Chanh Sả 1000ml', 'chai'),
        (9103, 'SP-QC-1000', 'Nước Lau Sàn Quế Cam 1000ml', 'chai'),
    ]
    for pid, code, name, unit in products:
        cur.execute("""
            INSERT OR REPLACE INTO products (id, code, name, type, unit, cost_price, sell_price, stock)
            VALUES (?, ?, ?, 'product', ?, 0, 75000, 0)
        """, (pid, code, name, unit))
        
    # 5. Cấu hình BOM
    # Mỗi chai Bạc Hà cần 1 chai (9001), 1 nắp (9002), 1 tem BH (9003)
    cur.execute("DELETE FROM product_bom WHERE product_id IN (9101, 9102, 9103)")
    cur.execute("INSERT INTO product_bom (product_id, ingredient_id, quantity) VALUES (9101, 9001, 1), (9101, 9002, 1), (9101, 9003, 1)")
    cur.execute("INSERT INTO product_bom (product_id, ingredient_id, quantity) VALUES (9102, 9001, 1), (9102, 9002, 1), (9102, 9004, 1)")
    cur.execute("INSERT INTO product_bom (product_id, ingredient_id, quantity) VALUES (9103, 9001, 1), (9103, 9002, 1), (9103, 9005, 1)")
    conn.commit()
    conn.close()

    print("--- TEST 1: Tạo Đơn OEM với Đơn Giá 18.288, CK 5%, VAT 8%, Cọc 50% ---")
    order_req = OEMOrderCreate(
        partner_id=9999,
        oem_warehouse_id=8888,
        dest_warehouse_id=1,
        expected_delivery_date="2026-09-20",
        fund_source="COMPANY",
        vat_percent=8.0,
        discount_percent=5.0,
        deposit_amount=34564320.0, # Tiền cọc đợt 1
        note="Đơn test hóa đơn Mastercare",
        items=[
            OEMOrderItemIn(product_id=9101, ordered_qty=1500, unit_price=18288.0),
            OEMOrderItemIn(product_id=9102, ordered_qty=1000, unit_price=18288.0),
            OEMOrderItemIn(product_id=9103, ordered_qty=1000, unit_price=18288.0),
        ]
    )
    res_create = create_oem_order(order_req)
    print("Create Order Result:", res_create)
    order_id = res_create["id"]
    assert order_id > 0
    
    # Kiểm tra Sổ Quỹ đã ghi nhận cọc Quỹ Công Ty chưa
    conn = get_db()
    cur = conn.cursor()
    cur.execute("SELECT amount, fund_source, category FROM cashbook WHERE ref_id = ? AND ref_type = 'oem_order'", (order_id,))
    cb_row = cur.fetchone()
    print("Cashbook deposit log:", dict(cb_row))
    assert cb_row["amount"] == 34564320.0
    assert cb_row["fund_source"] == "COMPANY"
    
    # Kiểm tra đơn OEM items
    cur.execute("SELECT id, product_id, ordered_qty, unit_price FROM oem_order_items WHERE order_id = ?", (order_id,))
    o_items = [dict(r) for r in cur.fetchall()]
    print("OEM order items in DB:", o_items)
    conn.close()

    print("\n--- TEST 2: Nhận Hàng Thực Tế: Bạc Hà 1.491, Chanh Sả 986, Quế Cam 988 ---")
    # Khớp đúng bảng hoá đơn thực tế của người dùng:
    # Bạc Hà: 1.491 chai
    # Chanh Sả: 986 chai
    # Quế Cam: 988 chai
    item_bh = next(i for i in o_items if i["product_id"] == 9101)
    item_cs = next(i for i in o_items if i["product_id"] == 9102)
    item_qc = next(i for i in o_items if i["product_id"] == 9103)
    
    rec_req = OEMOrderReceive(
        items=[
            OEMReceiveItemIn(item_id=item_bh["id"], received_qty=1491),
            OEMReceiveItemIn(item_id=item_cs["id"], received_qty=986),
            OEMReceiveItemIn(item_id=item_qc["id"], received_qty=988)
        ],
        pay_remaining_now=True,
        payment_fund_source="COMPANY"
    )
    res_rec = receive_oem_order(order_id, rec_req)
    print("Receive Order Result:", res_rec)
    
    # Kiểm tra tính toán thanh toán:
    # Raw = (1491 + 986 + 988) * 18288 = 3465 * 18288 = 63.367.920
    assert res_rec["total_raw"] == 63367920.0
    # Final = 63.367.920 * 0.95 * 1.08 = 64.990.138,7...
    # Còn lại khi nhận hàng = total_final - deposit
    print("Remaining payment calculated:", res_rec["remaining_payment"])
    
    print("\n--- TEST 3: Kiểm Tra Tồn Kho Nguyên Liệu (Tem, Chai, Nắp) Tại Kho Xưởng ---")
    conn = get_db()
    cur = conn.cursor()
    cur.execute("SELECT ingredient_id, quantity FROM inventory WHERE warehouse_id = 8888")
    inv_after = {r[0]: r[1] for r in cur.fetchall()}
    print("Kho xưởng tồn còn lại:", inv_after)
    
    # Ban đầu là 10.000 mỗi loại
    # Đã xuất 3.465 chai và nắp (1491 + 986 + 988) -> còn lại 6.535
    assert inv_after[9001] == 6535.0, f"Vỏ chai phải còn 6535, thực tế: {inv_after[9001]}"
    assert inv_after[9002] == 6535.0, f"Nắp phải còn 6535, thực tế: {inv_after[9002]}"
    # Tem Bạc Hà: xuất 1491 -> còn 8509
    assert inv_after[9003] == 8509.0, f"Tem BH phải còn 8509, thực tế: {inv_after[9003]}"
    # Tem Chanh Sả: xuất 986 -> còn 9014
    assert inv_after[9004] == 9014.0, f"Tem CS phải còn 9014, thực tế: {inv_after[9004]}"
    # Tem Quế Cam: xuất 988 -> còn 9012
    assert inv_after[9005] == 9012.0, f"Tem QC phải còn 9012, thực tế: {inv_after[9005]}"
    print("✅ Tồn kho nguyên liệu tem/chai trừ chính xác 100%!")
    
    print("\n--- TEST 4: Kiểm Tra Tồn Kho & Giá Vốn Thành Phẩm Chuẩn ---")
    cur.execute("SELECT id, name, stock, cost_price FROM products WHERE id IN (9101, 9102, 9103)")
    prods_after = [dict(r) for r in cur.fetchall()]
    for p in prods_after:
        print(f"Product {p['name']}: Stock={p['stock']}, Cost Price={p['cost_price']:.2f} đ")
        assert p["stock"] > 0
        # Giá vốn = đơn giá gia công sau CK/VAT (~18763.5 đ) + Tem (1200) + Chai (3500) + Nắp (800) = ~24263.5 đ
        assert p["cost_price"] > 24000
    print("✅ Giá vốn thành phẩm đã tự động gộp cả tiền công gia công + tem + chai + nắp!")

    print("\n--- TEST 5: Kiểm Tra Dự Báo Dòng Tiền Tách 2 Quỹ (COMPANY vs PERSONAL) ---")
    forecast = get_cashflow_forecast()
    print("Cashflow Forecast:", forecast)
    assert "total_company" in forecast
    assert "total_personal" in forecast
    print("✅ Kiểm thử toàn bộ quy trình OEM và Dòng tiền thành công rực rỡ!")
    conn.close()

if __name__ == '__main__':
    run_test()
