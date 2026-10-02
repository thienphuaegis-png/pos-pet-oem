import sys
import os
import io
import re
import csv
import urllib.request
import sqlite3
import datetime

# Kết nối database
DB_PATH = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "data", "pos.db")
SHEET_ID = "13ubSIDRK444r6xcikbZgL9hSr9PU13QSAULEROAI6M0"

GID_CUSTOMERS = "2085746971"
GID_INVOICES = "645349746"
GID_ITEMS = "1671534082"

def fetch_csv(gid):
    url = f"https://docs.google.com/spreadsheets/d/{SHEET_ID}/export?format=csv&gid={gid}"
    req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0"})
    with urllib.request.urlopen(req) as resp:
        return list(csv.reader(io.StringIO(resp.read().decode("utf-8"))))

def clean_phone(val):
    if not val:
        return ""
    s = str(val).strip()
    if s.endswith(".0"):
        s = s[:-2]
    s = re.sub(r"[\s\.\-\(\)]+", "", s)
    if s.startswith("+84"):
        s = "0" + s[3:]
    elif s.startswith("84") and len(s) >= 11:
        s = "0" + s[2:]
    elif len(s) == 9 and s[0] in "35789":
        s = "0" + s
    return s

def run_import():
    print("==================================================================")
    print("   IMPORT LỊCH SỬ: 772 KHÁCH HÀNG, 77 SẢN PHẨM & 129 HÓA ĐƠN POS   ")
    print("==================================================================")
    
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    cur = conn.cursor()

    # 1. Đảm bảo nhân viên tạo đơn tồn tại
    cur.execute("SELECT id FROM staff WHERE name = 'Trần Nguyễn Quế Đôn' OR username = 'quedon'")
    staff_row = cur.fetchone()
    if staff_row:
        staff_id = staff_row["id"]
    else:
        cur.execute("INSERT INTO staff (name, username, role, is_active) VALUES ('Trần Nguyễn Quế Đôn', 'quedon', 'cashier', 1)")
        staff_id = cur.lastrowid
    print(f"[*] Nhân viên tạo đơn: ID={staff_id} (Trần Nguyễn Quế Đôn)")

    # 2. Khách lẻ mặc định
    cur.execute("SELECT id FROM contacts WHERE id = 1")
    if not cur.fetchone():
        cur.execute("INSERT OR REPLACE INTO contacts (id, type, name, phone) VALUES (1, 'customer', 'Khách lẻ', '')")
    conn.commit()

    # 3. Lấy map nhóm khách hàng
    cur.execute("SELECT id, name FROM customer_segments")
    segments = {r["name"].strip().lower(): r["id"] for r in cur.fetchall()}
    agency_seg_id = segments.get("đại lý") or segments.get("đại ly") or 3

    # =========================================================================
    # BƯỚC 1: IMPORT 772 KHÁCH HÀNG
    # =========================================================================
    print("\n[1/3] Đang tải và nạp danh bạ 772 khách hàng từ Google Sheets...")
    c_rows = fetch_csv(GID_CUSTOMERS)
    c_data = c_rows[1:]
    
    cur.execute("SELECT id, code, phone, name FROM contacts WHERE type = 'customer'")
    existing_contacts = [dict(r) for r in cur.fetchall()]
    map_code_to_id = {str(c["code"] or "").strip().upper(): c["id"] for c in existing_contacts if c.get("code")}
    map_phone_to_id = {clean_phone(c["phone"]): c["id"] for c in existing_contacts if c.get("phone")}

    c_created = 0
    c_updated = 0

    for r in c_data:
        # ID, Name, Phone, Address, CustomerGroup, Debt, Notes, CreatedAt
        code = str(r[0] or "").strip()
        name = str(r[1] or "").strip()
        raw_phone = str(r[2] or "").strip()
        phone = clean_phone(raw_phone)
        addr = str(r[3] or "").strip()
        group = str(r[4] or "").strip().lower()
        debt_str = str(r[5] or "").replace(",", "").strip()
        debt_val = float(debt_str) if debt_str else 0.0
        note = str(r[6] or "").strip()

        if not name and not phone:
            continue

        seg_id = agency_seg_id if ("đại lý" in group or "đại ly" in group) else None

        # Kiểm tra tồn tại
        cid = None
        if code and code.upper() in map_code_to_id:
            cid = map_code_to_id[code.upper()]
        elif phone and phone in map_phone_to_id:
            cid = map_phone_to_id[phone]

        if cid:
            cur.execute("""
                UPDATE contacts 
                SET name = ?, phone = COALESCE(NULLIF(?, ''), phone), address = COALESCE(NULLIF(?, ''), address),
                    segment_id = COALESCE(?, segment_id), debt = CASE WHEN ? > 0 THEN ? ELSE debt END,
                    code = COALESCE(NULLIF(?, ''), code), note = COALESCE(NULLIF(?, ''), note)
                WHERE id = ?
            """, (name, phone, addr, seg_id, debt_val, debt_val, code, note, cid))
            c_updated += 1
        else:
            cur.execute("""
                INSERT INTO contacts (type, name, phone, address, segment_id, debt, code, note)
                VALUES ('customer', ?, ?, ?, ?, ?, ?, ?)
            """, (name, phone, addr, seg_id, debt_val, code, note))
            cid = cur.lastrowid
            c_created += 1

        if code:
            map_code_to_id[code.upper()] = cid
        if phone:
            map_phone_to_id[phone] = cid

    conn.commit()
    print(f" -> Khách hàng: Thêm mới {c_created}, Cập nhật {c_updated}. Tổng map khách: {len(map_code_to_id)}")

    # =========================================================================
    # BƯỚC 2: CHUẨN HÓA 77 MÃ SẢN PHẨM
    # =========================================================================
    print("\n[2/3] Đang rà soát và bổ sung 77 mã sản phẩm cấu thành đơn hàng cũ...")
    
    # Từ điển 77 mã sản phẩm hoàn chỉnh
    items_rows = fetch_csv(GID_ITEMS)
    items_data = items_rows[1:]
    
    # Giá niêm yết trong đơn hàng
    p_prices_in_orders = {}
    for r in items_data:
        pcode = r[2].strip()
        price = float(r[4].strip() or 0)
        p_prices_in_orders.setdefault(pcode, []).append(price)

    manual_mapping = {
        '4TTG500': {'name': 'Thịt gà tươi 500g', 'cat': 'Thực phẩm tươi', 'unit': 'Cây', 'price': 35000},
        '4TTH500': {'name': 'Thịt heo tươi 500g', 'cat': 'Thực phẩm tươi', 'unit': 'Cây', 'price': 69000},
        '4TTB500': {'name': 'Thịt bò tươi 500g', 'cat': 'Thực phẩm tươi', 'unit': 'Cây', 'price': 89000},
        '4TTCA500': {'name': 'Thịt cá tươi 500g', 'cat': 'Thực phẩm tươi', 'unit': 'Cây', 'price': 69000},
        '4TTV500': {'name': 'Thịt vịt tươi 500g', 'cat': 'Thực phẩm tươi', 'unit': 'Cây', 'price': 69000},
        '4TTĐB500': {'name': 'Thịt tươi vị đặc biệt 500g', 'cat': 'Thực phẩm tươi', 'unit': 'Cây', 'price': 99000},
        '4TTCU500': {'name': 'Thịt chim cút tươi 500g', 'cat': 'Thực phẩm tươi', 'unit': 'Cây', 'price': 79000},
        '6XKMHCS250': {'name': 'Xịt khử mùi chó mèo hương chanh sả 250ml', 'cat': 'Xịt chăm sóc', 'unit': 'Chai', 'price': 95000},
        '6XKMHCS100': {'name': 'Xịt khử mùi chó mèo hương chanh sả 100ml', 'cat': 'Xịt chăm sóc', 'unit': 'Chai', 'price': 59000},
        '6XKMHCQ250': {'name': 'Xịt khử mùi chó mèo hương cam quế 250ml', 'cat': 'Xịt chăm sóc', 'unit': 'Chai', 'price': 95000},
        '6XKMHCQ100': {'name': 'Xịt khử mùi chó mèo hương cam quế 100ml', 'cat': 'Xịt chăm sóc', 'unit': 'Chai', 'price': 59000},
        '6XKMHCP250': {'name': 'Xịt khử mùi chó mèo hương cà phê 250ml', 'cat': 'Xịt chăm sóc', 'unit': 'Chai', 'price': 95000},
        '6XKMHCP100': {'name': 'Xịt khử mùi chó mèo hương cà phê 100ml', 'cat': 'Xịt chăm sóc', 'unit': 'Chai', 'price': 59000},
        '6XKMHBH250': {'name': 'Xịt khử mùi chó mèo hương bạc hà 250ml', 'cat': 'Xịt chăm sóc', 'unit': 'Chai', 'price': 95000},
        '6XKMHBH100': {'name': 'Xịt khử mùi chó mèo hương bạc hà 100ml', 'cat': 'Xịt chăm sóc', 'unit': 'Chai', 'price': 59000},
        '6NLSQC': {'name': 'Nước lau sàn hương quế cam 1L', 'cat': 'Vệ sinh & Chăm sóc', 'unit': 'Can', 'price': 89000},
        '6NLSCS': {'name': 'Nước lau sàn hương chanh sả 1L', 'cat': 'Vệ sinh & Chăm sóc', 'unit': 'Can', 'price': 89000},
        '6NLSCP': {'name': 'Nước lau sàn hương cà phê 1L', 'cat': 'Vệ sinh & Chăm sóc', 'unit': 'Can', 'price': 89000},
        '6NLSBH': {'name': 'Nước lau sàn hương bạc hà 1L', 'cat': 'Vệ sinh & Chăm sóc', 'unit': 'Can', 'price': 89000},
        '6NRTHT': {'name': 'Nước rửa tai chó mèo hương táo 100ml', 'cat': 'Chăm sóc tai', 'unit': 'Chai', 'price': 95000},
        '6NRTLD': {'name': 'Nước rửa tai chó mèo hương lavender 100ml', 'cat': 'Chăm sóc tai', 'unit': 'Chai', 'price': 95000},
        '6NRTAD': {'name': 'Nước rửa tai chó mèo hương anh đào 100ml', 'cat': 'Chăm sóc tai', 'unit': 'Chai', 'price': 95000},
        '6VSTHT': {'name': 'Vệ sinh tai hương táo 100ml', 'cat': 'Chăm sóc tai', 'unit': 'Chai', 'price': 95000},
        '6VST100': {'name': 'Vệ sinh tai 100ml', 'cat': 'Chăm sóc tai', 'unit': 'Chai', 'price': 95000},
        '6STM50': {'name': 'Sữa tắm cho chó Gemini (chai nâu) 50ml', 'cat': 'Sữa tắm', 'unit': 'Chai', 'price': 59000},
        '6STM250': {'name': 'Sữa tắm cho chó Gemini (chai nâu) 250ml', 'cat': 'Sữa tắm', 'unit': 'Chai', 'price': 199000},
        '6STHUS250': {'name': 'Sữa tắm chuyên sâu 250ml', 'cat': 'Sữa tắm', 'unit': 'Chai', 'price': 199000},
        '6STCS250': {'name': 'Sữa tắm chăm sóc lông 250ml', 'cat': 'Sữa tắm', 'unit': 'Chai', 'price': 179000},
        '6STPOO250': {'name': 'Sữa tắm Poodle 250ml', 'cat': 'Sữa tắm', 'unit': 'Chai', 'price': 179000},
        '6STCL250': {'name': 'Sữa tắm Corgi 250ml', 'cat': 'Sữa tắm', 'unit': 'Chai', 'price': 179000},
        'STLEO500': {'name': 'Sữa tắm Spa Leo 500ml', 'cat': 'Sữa tắm', 'unit': 'Chai', 'price': 178000},
        '9XOPM': {'name': 'Xương Orgo vị phô mai', 'cat': 'Thức ăn', 'unit': 'Cây', 'price': 29500},
        'SHIP': {'name': 'Phí vận chuyển giao hàng', 'cat': 'Dịch vụ', 'unit': 'Lần', 'price': 70000},
        'SP000001': {'name': 'Phí phụ thu dịch vụ', 'cat': 'Dịch vụ', 'unit': 'Lần', 'price': 70000}
    }

    # Đọc thêm từ file excel nếu có
    catalog_excel_path = os.path.join(os.path.dirname(DB_PATH), "..", "Danh_Sach_Hang_Hoa_CHUAN_SACH.xlsx")
    excel_prods = {}
    if os.path.exists(catalog_excel_path):
        import openpyxl
        wb = openpyxl.load_workbook(catalog_excel_path)
        ws = wb.active
        for r in list(ws.iter_rows(values_only=True))[1:]:
            if r[1]:
                excel_prods[str(r[1]).strip().upper()] = {
                    'code': str(r[1]).strip(),
                    'name': str(r[2]).strip(),
                    'cat': str(r[3] or 'Khác').strip(),
                    'unit': str(r[5] or 'cái').strip(),
                    'price': float(r[6] or 0)
                }

    cur.execute("SELECT id, code, name FROM products")
    db_products = {str(r["code"] or "").strip().upper(): r["id"] for r in cur.fetchall() if r["code"]}

    all_order_pcodes = sorted(list(set(r[2].strip() for r in items_data if r[2].strip())))
    p_synced = 0

    for code in all_order_pcodes:
        code_up = code.upper()
        if code_up in db_products:
            continue
        
        info = excel_prods.get(code_up) or manual_mapping.get(code)
        if not info:
            # Fallback nếu mã lạ
            avg_price = max(p_prices_in_orders.get(code, [0]))
            info = {'name': f'Sản phẩm mã {code}', 'cat': 'Khác', 'unit': 'cái', 'price': avg_price}

        cur.execute("""
            INSERT INTO products (code, name, category, unit, sell_price, cost_price, type, is_active)
            VALUES (?, ?, ?, ?, ?, 0, ?, 1)
        """, (code, info['name'], info.get('cat', 'Khác'), info.get('unit', 'cái'), info.get('price', 0),
              'service' if code in ('SHIP', 'SP000001') else 'product'))
        db_products[code_up] = cur.lastrowid
        p_synced += 1

    conn.commit()
    print(f" -> Sản phẩm: Đã kích hoạt/bổ sung {p_synced} mã sản phẩm. Tổng mã SP sẵn sàng: {len(db_products)}")

    # =========================================================================
    # BƯỚC 3: IMPORT 129 HÓA ĐƠN & 683 DÒNG CHI TIẾT
    # =========================================================================
    print("\n[3/3] Đang import 129 hóa đơn bán hàng & 683 dòng chi tiết...")
    inv_rows = fetch_csv(GID_INVOICES)
    inv_data = inv_rows[1:]

    # Map items theo InvoiceID
    items_by_invoice = {}
    for it in items_data:
        # ID, InvoiceID, ProductID, Quantity, Price, Discount, Total, CreatedAt
        inv_id = str(it[1] or "").strip()
        items_by_invoice.setdefault(inv_id, []).append(it)

    inv_created = 0
    items_created = 0

    for inv in inv_data:
        # ID, CustomerID, TotalAmount, OrderDiscount, VATAmount, FinalAmount, PaidAmount, DebtAmount, PaymentMethod, Status, CreatedBy, CreatedAt
        inv_code = str(inv[0] or "").strip()
        raw_cust_id = str(inv[1] or "").strip()
        total_amount = float(str(inv[2] or 0).replace(",", "").strip())
        order_discount = float(str(inv[3] or 0).replace("%", "").replace(",", "").strip())
        vat_amount = float(str(inv[4] or 0).replace(",", "").strip())
        final_amount = float(str(inv[5] or 0).replace(",", "").strip())
        paid_amount = float(str(inv[6] or 0).replace(",", "").strip())
        debt_amount = float(str(inv[7] or 0).replace(",", "").strip())
        pay_method = str(inv[8] or "").strip()
        status = str(inv[9] or "").strip()
        created_at_raw = str(inv[11] or "").strip()

        # Parse thời gian thật
        try:
            # Format: 2026-05-15T09:15:19+07:00
            created_at = created_at_raw.split("+")[0].replace("T", " ")
        except Exception:
            created_at = datetime.datetime.now().strftime("%Y-%m-%d %H:%M:%S")

        # Xác định customer_id
        customer_id = 1 # Khách lẻ mặc định
        if raw_cust_id and raw_cust_id != "Khách lẻ":
            if raw_cust_id.upper() in map_code_to_id:
                customer_id = map_code_to_id[raw_cust_id.upper()]

        # Kiểm tra xem hóa đơn này đã import chưa
        cur.execute("SELECT id FROM orders WHERE code = ?", (inv_code,))
        existing_order = cur.fetchone()
        if existing_order:
            order_id = existing_order["id"]
            # Xóa items cũ để nạp lại chuẩn
            cur.execute("DELETE FROM order_items WHERE order_id = ?", (order_id,))
        else:
            cur.execute("""
                INSERT INTO orders (
                    code, customer_id, staff_id, total_amount, discount,
                    final_amount, paid_amount, debt_amount, note, status, created_at
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """, (
                inv_code, customer_id, staff_id, total_amount, order_discount,
                final_amount, paid_amount, debt_amount, f"Thanh toán: {pay_method}. VAT: {vat_amount}. Ghi chú: Import Google Sheets", status, created_at
            ))
            order_id = cur.lastrowid
            inv_created += 1

        # Nạp chi tiết các món của hóa đơn này
        inv_item_rows = items_by_invoice.get(inv_code, [])
        for item in inv_item_rows:
            p_code = str(item[2] or "").strip()
            qty = float(str(item[3] or 1).replace(",", "").strip())
            price = float(str(item[4] or 0).replace(",", "").strip())
            item_discount = float(str(item[5] or 0).replace(",", "").strip())
            subtotal = float(str(item[6] or 0).replace(",", "").strip())
            
            pid = db_products.get(p_code.upper())
            if not pid:
                continue

            cur.execute("""
                INSERT INTO order_items (
                    order_id, product_id, quantity, price, subtotal, unit_ratio, unit
                ) VALUES (?, ?, ?, ?, ?, 1.0, 'cái')
            """, (order_id, pid, qty, price, subtotal))
            items_created += 1

    conn.commit()
    conn.close()

    print(f" -> Hóa đơn: Đã nạp thành công {inv_created} hóa đơn và {items_created} dòng chi tiết.")
    print("==================================================================")
    print("      ĐÃ HOÀN TẤT IMPORT TOÀN BỘ LỊCH SỬ VÀO DATABASE POS!       ")
    print("==================================================================")

if __name__ == "__main__":
    run_import()
