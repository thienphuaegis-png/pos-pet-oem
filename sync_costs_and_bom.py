import urllib.request
import urllib.parse
import sqlite3
import csv
import io
import re

sheet_id = "1NvEDwK2P8qeJXVp6kud8a54MBdFVmp0jlkVkwx1Z9DI"
sheet_names = [
    "Bảng cost sản phẩm",
    "Bảng giá thịt tươi",
    "Giá bán đề xuất",
    "Bảng giá thành phần nguyên liệu",
    "Bảng giá chai lọ, túi",
    "Bảng giá tem",
    "Định lượng trộn hạt"
]

downloaded = {}
for name in sheet_names:
    encoded_name = urllib.parse.quote(name)
    url = f"https://docs.google.com/spreadsheets/d/{sheet_id}/gviz/tq?tqx=out:csv&sheet={encoded_name}"
    req = urllib.request.Request(url, headers={'User-Agent': 'Mozilla/5.0'})
    with urllib.request.urlopen(req) as resp:
        downloaded[name] = resp.read().decode('utf-8')
    print(f"Downloaded: {name}")

def parse_money(val):
    if not val:
        return 0.0
    s = str(val).replace("đ", "").replace("₫", "").replace(".", "").replace(",", ".").replace(" ", "").strip()
    try:
        return float(s)
    except:
        return 0.0

db_path = r"D:\Projects_Hermes\pos-offline\data\pos.db"
conn = sqlite3.connect(db_path, timeout=30.0)
cur = conn.cursor()

# -------------------------------------------------------------------------
# 1. NẠP NGUYÊN LIỆU & VẬT TƯ (ingredients) từ các bảng thành phần, chai, tem
# -------------------------------------------------------------------------
inserted_ing = 0
updated_ing = 0

# A. Chai lọ túi
reader = csv.reader(io.StringIO(downloaded["Bảng giá chai lọ, túi"]))
for r in list(reader)[1:]:
    if len(r) < 5:
        continue
    name = r[1].strip()
    unit = r[3].strip() or "Cái"
    cost = parse_money(r[4])
    if not name:
        continue
    cur.execute("SELECT id FROM ingredients WHERE name = ?", (name,))
    row = cur.fetchone()
    if row:
        updated_ing += 1
    else:
        code_gen = f"CLT_{hash(name) % 100000:05d}"
        cur.execute("INSERT INTO ingredients (code, name, unit, type) VALUES (?, ?, ?, 'IS_PHYSICAL')",
                    (code_gen, name, unit))
        inserted_ing += 1

# B. Tem nhãn
reader = csv.reader(io.StringIO(downloaded["Bảng giá tem"]))
for r in list(reader)[1:]:
    if len(r) < 4:
        continue
    # Tìm cột tên tem và đơn giá
    name = r[2].strip() if len(r) > 2 and r[2].strip() else r[1].strip()
    cost = parse_money(r[3]) if len(r) > 3 and r[3].strip() else parse_money(r[2])
    if not name:
        continue
    cur.execute("SELECT id FROM ingredients WHERE name = ?", (name,))
    row = cur.fetchone()
    if row:
        updated_ing += 1
    else:
        code_gen = f"TEM_{hash(name) % 100000:05d}"
        cur.execute("INSERT INTO ingredients (code, name, unit, type) VALUES (?, ?, 'Cái', 'IS_PHYSICAL')",
                    (code_gen, name))
        inserted_ing += 1

# C. Thành phần nguyên liệu thô (Dung dịch, hạt thô, thịt)
reader = csv.reader(io.StringIO(downloaded["Bảng giá thành phần nguyên liệu"]))
for r in list(reader)[1:]:
    # Cột 3 là tên nguyên liệu, cột 4 là định lượng, cột 5 là giá
    if len(r) > 4:
        name = r[2].strip()
        cost = parse_money(r[4])
        if name and cost > 0:
            cur.execute("SELECT id FROM ingredients WHERE name = ?", (name,))
            row = cur.fetchone()
            if not row:
                code_gen = f"NL_{hash(name) % 100000:05d}"
                cur.execute("INSERT INTO ingredients (code, name, unit, type) VALUES (?, ?, 'Gram/ml', 'IS_PHYSICAL')",
                            (code_gen, name))
                inserted_ing += 1

print(f"1. Ingredients: Đã cập nhật/thêm mới {inserted_ing} nguyên vật liệu & bao bì.")

# -------------------------------------------------------------------------
# 2. CẬP NHẬT GIÁ VỐN (COST_PRICE) VÀ GIÁ BÁN (SELL_PRICE) CHO PRODUCTS
# -------------------------------------------------------------------------
cost_map = {}
reader = csv.reader(io.StringIO(downloaded["Bảng cost sản phẩm"]))
for r in list(reader)[1:]:
    if len(r) < 10:
        continue
    sku = r[0].strip()
    code = r[1].strip()
    name = r[3].strip()
    cost = parse_money(r[9])
    if name and cost > 0:
        if sku:
            cost_map[sku.lower()] = cost
        if code:
            cost_map[code.lower()] = cost
        cost_map[name.lower()] = cost

price_map = {}
reader = csv.reader(io.StringIO(downloaded["Giá bán đề xuất"]))
for r in list(reader)[1:]:
    if len(r) < 9:
        continue
    sku = r[0].strip()
    name = r[2].strip()
    sell = parse_money(r[8])
    if sell == 0 and len(r) > 12:
        sell = parse_money(r[12])
    if sell == 0 and len(r) > 10:
        sell = parse_money(r[10])
    if name and sell > 0:
        if sku:
            price_map[sku.lower()] = sell
        price_map[name.lower()] = sell

updated_prod = 0
cur.execute("SELECT id, code, name, cost_price, sell_price FROM products")
prod_rows = cur.fetchall()

for p in prod_rows:
    pid, pcode, pname, pcost, psell = p
    code_k = (pcode or "").lower()
    name_k = (pname or "").lower()

    new_cost = cost_map.get(code_k) or cost_map.get(name_k) or pcost
    new_sell = price_map.get(code_k) or price_map.get(name_k) or psell

    if new_cost != pcost or new_sell != psell:
        cur.execute("UPDATE products SET cost_price = ?, sell_price = ? WHERE id = ?", (new_cost, new_sell, pid))
        updated_prod += 1

print(f"2. Products: Đã cập nhật giá vốn & giá bán cho {updated_prod}/{len(prod_rows)} sản phẩm.")

# -------------------------------------------------------------------------
# 3. TẠO CÔNG THỨC BOM (product_bom) CHO SẢN PHẨM TỪ BẢNG COST
# -------------------------------------------------------------------------
# Tạo mapping bao bì -> ingredient_id và tem -> ingredient_id
cur.execute("SELECT id, name FROM ingredients")
all_ings = cur.fetchall()

bom_created = 0
reader = csv.reader(io.StringIO(downloaded["Bảng cost sản phẩm"]))
for r in list(reader)[1:]:
    if len(r) < 10:
        continue
    sku = r[0].strip()
    code = r[1].strip()
    name = r[3].strip()
    mat_cost = parse_money(r[4])
    bottle_cost = parse_money(r[5])
    label_cost = parse_money(r[6])

    if not name or (mat_cost == 0 and bottle_cost == 0 and label_cost == 0):
        continue

    # Tìm product id
    cur.execute("SELECT id FROM products WHERE code = ? OR name = ?", (code, name))
    prow = cur.fetchone()
    if not prow and sku:
        cur.execute("SELECT id FROM products WHERE code = ?", (sku,))
        prow = cur.fetchone()

    if not prow:
        # Nếu chưa có trong products thì tạo mới thành phẩm
        cur.execute("INSERT INTO products (code, name, type, unit, cost_price, sell_price, stock) VALUES (?, ?, 'product', 'Cái', ?, ?, 0)",
                    (code or sku, name, parse_money(r[9]), price_map.get(sku.lower(), 0.0) or price_map.get(name.lower(), 0.0)))
        pid = cur.lastrowid
    else:
        pid = prow[0]

    # Kiểm tra đã có BOM chưa
    cur.execute("SELECT COUNT(*) FROM product_bom WHERE product_id = ?", (pid,))
    if cur.fetchone()[0] > 0:
        continue

    # 1. Tìm nguyên liệu dung dịch/hạt phù hợp
    cur.execute("SELECT id FROM ingredients WHERE name LIKE ? LIMIT 1", (f"%{name[:8]}%",))
    ing_row = cur.fetchone()
    if ing_row:
        cur.execute("INSERT OR IGNORE INTO product_bom (product_id, ingredient_id, quantity) VALUES (?, ?, 1)", (pid, ing_row[0]))
        bom_created += 1

    # 2. Bao bì chai lọ nếu có bottle_cost
    if bottle_cost > 0:
        cur.execute("SELECT id FROM ingredients WHERE name LIKE '%chai%' OR name LIKE '%túi%' OR name LIKE '%hộp%' LIMIT 1")
        b_row = cur.fetchone()
        if b_row:
            cur.execute("INSERT OR IGNORE INTO product_bom (product_id, ingredient_id, quantity) VALUES (?, ?, 1)", (pid, b_row[0]))

    # 3. Tem nhãn nếu có label_cost
    if label_cost > 0:
        cur.execute("SELECT id FROM ingredients WHERE name LIKE '%tem%' LIMIT 1")
        l_row = cur.fetchone()
        if l_row:
            cur.execute("INSERT OR IGNORE INTO product_bom (product_id, ingredient_id, quantity) VALUES (?, ?, 1)", (pid, l_row[0]))

conn.commit()

# Thống kê sau khi đồng bộ
cur.execute("SELECT COUNT(*) FROM products WHERE cost_price > 0")
cost_count = cur.fetchone()[0]
cur.execute("SELECT COUNT(*) FROM products WHERE sell_price > 0")
sell_count = cur.fetchone()[0]
cur.execute("SELECT COUNT(DISTINCT product_id) FROM product_bom")
bom_prods = cur.fetchone()[0]

conn.close()

print("="*60)
print("  HOÀN TẤT ĐỒNG BỘ GIÁ & BẢNG COST VÀO POS-OFFLINE!")
print(f"  - Sản phẩm có Giá Vốn (Cost): {cost_count}")
print(f"  - Sản phẩm có Giá Bán (Sell): {sell_count}")
print(f"  - Sản phẩm có Công Thức BOM: {bom_prods}")
print("="*60)
