import urllib.request
import sqlite3
import csv
import io
import re
import datetime
import os

sheet_id = "16eY4kMsMsg5LQve0Bj_Qk_6OJvH20ABrWXHBPA9GCuI"
sheets = ["Danh_Muc_NCC", "Danh_Muc_SanPham", "Danh_Sach_Don_Hang", "Chi_Tiet_Don_Hang"]

downloaded_data = {}
for s in sheets:
    url = f"https://docs.google.com/spreadsheets/d/{sheet_id}/gviz/tq?tqx=out:csv&sheet={s}"
    req = urllib.request.Request(url, headers={'User-Agent': 'Mozilla/5.0'})
    with urllib.request.urlopen(req) as resp:
        downloaded_data[s] = resp.read().decode('utf-8')
    print(f"Downloaded sheet: {s} ({len(downloaded_data[s])} chars)")

def parse_money(val):
    if not val:
        return 0.0
    s = str(val).replace("đ", "").replace("₫", "").replace(".", "").replace(",", ".").replace(" ", "").strip()
    try:
        return float(s)
    except:
        return 0.0

def parse_date(val):
    if not val:
        return None
    val = str(val).strip()
    m = re.match(r"^(\d{1,2})/(\d{1,2})/(\d{4})$", val)
    if m:
        d, mth, y = m.groups()
        return f"{y}-{int(mth):02d}-{int(d):02d}"
    return val

db_path = r"D:\Projects_Hermes\pos-offline\data\pos.db"
conn = sqlite3.connect(db_path, timeout=30.0)
cur = conn.cursor()

# -------------------------------------------------------------
# 1. IMPORT NHÀ CUNG CẤP (contacts WHERE type = 'supplier')
# -------------------------------------------------------------
supplier_map = {}

reader_ncc = csv.reader(io.StringIO(downloaded_data["Danh_Muc_NCC"]))
rows_ncc = list(reader_ncc)
inserted_ncc = 0
updated_ncc = 0

for r in rows_ncc[1:]:
    if len(r) < 2 or not r[1].strip():
        continue
    code = r[0].strip()
    name = r[1].strip()
    zalo = r[2].strip() if len(r) > 2 else ""
    note = r[3].strip() if len(r) > 3 else ""

    cur.execute("SELECT id, debt FROM contacts WHERE name = ? AND type = 'supplier'", (name,))
    existing = cur.fetchone()
    if existing:
        cid = existing[0]
        cur.execute("UPDATE contacts SET phone = COALESCE(NULLIF(phone, ''), ?), address = COALESCE(NULLIF(address, ''), ?) WHERE id = ?", (zalo, note, cid))
        updated_ncc += 1
    else:
        cur.execute("INSERT INTO contacts (type, name, phone, address, debt) VALUES ('supplier', ?, ?, ?, 0)", (name, zalo, note))
        cid = cur.lastrowid
        inserted_ncc += 1

    if code:
        supplier_map[code] = cid
    supplier_map[name.lower()] = cid

print(f"1. Nhà cung cấp: Inserted {inserted_ncc}, Updated {updated_ncc}")

# -------------------------------------------------------------
# 2. IMPORT DANH MỤC SẢN PHẨM & NGUYÊN LIỆU (products & ingredients)
# -------------------------------------------------------------
reader_sp = csv.reader(io.StringIO(downloaded_data["Danh_Muc_SanPham"]))
rows_sp = list(reader_sp)

product_code_map = {}
ingredient_code_map = {}

inserted_prod = 0
inserted_ing = 0

for r in rows_sp[1:]:
    if len(r) < 4:
        continue
    code = r[0].strip()
    name = r[1].strip()
    cat = r[2].strip()
    unit = r[3].strip() or "cái"

    if not name:
        continue
    if not code:
        code = f"ITEM_{hash(name) % 100000:05d}"

    if cat.upper() in ["CCDC", "VẬT TƯ", "BAO BÌ", "TEM NHÃN"]:
        cur.execute("SELECT id FROM ingredients WHERE code = ? OR name = ?", (code, name))
        existing = cur.fetchone()
        if existing:
            ing_id = existing[0]
        else:
            cur.execute("INSERT INTO ingredients (code, name, unit, type) VALUES (?, ?, ?, 'IS_PHYSICAL')",
                        (code, name, unit))
            ing_id = cur.lastrowid
            inserted_ing += 1
        ingredient_code_map[code.lower()] = ing_id
        ingredient_code_map[name.lower()] = ing_id
    else:
        cur.execute("SELECT id FROM products WHERE code = ? OR name = ?", (code, name))
        existing = cur.fetchone()
        if existing:
            prod_id = existing[0]
        else:
            cur.execute("INSERT INTO products (code, name, type, unit, cost_price, sell_price, stock) VALUES (?, ?, 'product', ?, 0, 0, 0)",
                        (code, name, unit))
            prod_id = cur.lastrowid
            inserted_prod += 1
        product_code_map[code.lower()] = prod_id
        product_code_map[name.lower()] = prod_id

print(f"2. Danh mục hàng: {inserted_prod} Hàng hóa mới, {inserted_ing} Vật tư/CCDC mới")

# -------------------------------------------------------------
# 3. IMPORT CHI TIẾT ĐƠN HÀNG (purchase_items map)
# -------------------------------------------------------------
reader_ct = csv.reader(io.StringIO(downloaded_data["Chi_Tiet_Don_Hang"]))
rows_ct = list(reader_ct)

po_items_dict = {}

for r in rows_ct[1:]:
    if len(r) < 9 or not r[1].strip():
        continue
    date_str = parse_date(r[0].strip())
    po_id = r[1].strip()
    ncc_id = r[2].strip()
    item_code = r[3].strip()
    item_name = r[4].strip()
    qty = parse_money(r[5].strip())
    unit = r[6].strip() or "cái"
    unit_cost = parse_money(r[7].strip())
    subtotal = parse_money(r[8].strip())

    if not po_id or not item_name:
        continue

    item_type = "product"
    prod_id = product_code_map.get(item_code.lower()) or product_code_map.get(item_name.lower())
    ing_id = ingredient_code_map.get(item_code.lower()) or ingredient_code_map.get(item_name.lower())

    if ing_id and not prod_id:
        item_type = "ingredient"
    elif not prod_id and not ing_id:
        item_type = "product"
        cur.execute("SELECT id FROM products WHERE name = ?", (item_name,))
        row = cur.fetchone()
        if row:
            prod_id = row[0]
        else:
            code_gen = item_code or f"SP_{hash(item_name) % 100000:05d}"
            cur.execute("INSERT INTO products (code, name, type, unit, cost_price, sell_price, stock) VALUES (?, ?, 'product', ?, ?, 0, 0)",
                        (code_gen, item_name, unit, unit_cost))
            prod_id = cur.lastrowid
            product_code_map[code_gen.lower()] = prod_id
            product_code_map[item_name.lower()] = prod_id

    if po_id not in po_items_dict:
        po_items_dict[po_id] = []
    po_items_dict[po_id].append({
        "item_type": item_type,
        "product_id": prod_id,
        "ingredient_id": ing_id,
        "item_name": item_name,
        "unit": unit,
        "quantity": qty,
        "cost_price": unit_cost,
        "subtotal": subtotal
    })

print(f"3. Đã đọc chi tiết cho {len(po_items_dict)} mã đơn PO")

# -------------------------------------------------------------
# 4. IMPORT DANH SÁCH ĐƠN HÀNG (purchases) & CẬP NHẬT CÔNG NỢ
# -------------------------------------------------------------
reader_ds = csv.reader(io.StringIO(downloaded_data["Danh_Sach_Don_Hang"]))
rows_ds = list(reader_ds)

inserted_po = 0
updated_po = 0

for r in rows_ds[1:]:
    if len(r) < 11 or not r[1].strip():
        continue
    date_str = parse_date(r[0].strip()) or datetime.datetime.now().strftime("%Y-%m-%d")
    po_id = r[1].strip()
    ncc_code = r[2].strip()
    ncc_name = r[3].strip()
    total_qty = parse_money(r[4].strip())
    total_amount = parse_money(r[5].strip())
    vat = parse_money(r[6].strip())
    other_fee = parse_money(r[7].strip())
    discount = parse_money(r[8].strip())
    paid_amount = parse_money(r[9].strip())
    debt_amount = parse_money(r[10].strip())
    note = r[11].strip() if len(r) > 11 else ""

    supp_id = supplier_map.get(ncc_code) or supplier_map.get(ncc_name.lower())
    if not supp_id:
        cur.execute("INSERT INTO contacts (type, name, phone, address, debt) VALUES ('supplier', ?, '', '', 0)", (ncc_name,))
        supp_id = cur.lastrowid
        supplier_map[ncc_name.lower()] = supp_id

    cur.execute("SELECT id FROM purchases WHERE code = ?", (po_id,))
    po_row = cur.fetchone()

    status = "received"
    expected_date = date_str
    created_at = f"{date_str} 08:00:00"

    final_total = total_amount + vat + other_fee - discount
    if final_total <= 0:
        final_total = total_amount

    if po_row:
        p_id = po_row[0]
        cur.execute("""
            UPDATE purchases 
            SET supplier_id = ?, total_amount = ?, discount = ?, shipping_fee = ?, 
                paid_amount = ?, debt_amount = ?, note = ?, status = ?, expected_date = ?
            WHERE id = ?
        """, (supp_id, final_total, discount, other_fee, paid_amount, debt_amount, note, status, expected_date, p_id))
        updated_po += 1
    else:
        cur.execute("""
            INSERT INTO purchases 
            (code, supplier_id, warehouse_id, total_amount, discount, shipping_fee, vat_rate, paid_amount, debt_amount, note, created_at, status, expected_date)
            VALUES (?, ?, 1, ?, ?, ?, 0, ?, ?, ?, ?, ?, ?)
        """, (po_id, supp_id, final_total, discount, other_fee, paid_amount, debt_amount, note, created_at, status, expected_date))
        p_id = cur.lastrowid
        inserted_po += 1

    cur.execute("DELETE FROM purchase_items WHERE purchase_id = ?", (p_id,))
    items = po_items_dict.get(po_id, [])
    for it in items:
        cur.execute("""
            INSERT INTO purchase_items 
            (purchase_id, item_type, product_id, ingredient_id, item_name, unit, quantity, cost_price, subtotal)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        """, (p_id, it["item_type"], it["product_id"], it["ingredient_id"], it["item_name"], it["unit"], it["quantity"], it["cost_price"], it["subtotal"]))

print(f"4. Đơn nhập hàng: {inserted_po} đơn tạo mới, {updated_po} đơn cập nhật")

# -------------------------------------------------------------
# 5. ĐỒNG BỘ CÔNG NỢ NHÀ CUNG CẤP CHUẨN XÁC TỪ TỔNG NỢ CÁC ĐƠN
# -------------------------------------------------------------
cur.execute("""
    UPDATE contacts 
    SET debt = COALESCE((
        SELECT SUM(p.debt_amount) 
        FROM purchases p 
        WHERE p.supplier_id = contacts.id AND p.status != 'cancelled'
    ), 0)
    WHERE type = 'supplier'
""")

conn.commit()

# Kiểm tra tổng công nợ sau import
cur.execute("SELECT SUM(debt) FROM contacts WHERE type = 'supplier'")
total_supp_debt = cur.fetchone()[0] or 0.0

cur.execute("SELECT COUNT(*) FROM purchases")
total_purchases = cur.fetchone()[0]

cur.execute("SELECT COUNT(*) FROM contacts WHERE type = 'supplier'")
total_supps = cur.fetchone()[0]

cur.execute("SELECT COUNT(*) FROM purchase_items")
total_items = cur.fetchone()[0]

conn.close()

print("="*60)
print(f"  HOÀN TẤT IMPORT DỮ LIỆU TỪ GOOGLE SHEET VÀO POS-OFFLINE!")
print(f"  - Tổng Nhà Cung Cấp: {total_supps}")
print(f"  - Tổng Đơn Nhập Hàng (PO): {total_purchases}")
print(f"  - Tổng Dòng Sản Phẩm / Vật Tư đã nhập: {total_items}")
print(f"  - Tổng Công Nợ Nhà Cung Cấp: {total_supp_debt:,.0f} đ")
print("="*60)
