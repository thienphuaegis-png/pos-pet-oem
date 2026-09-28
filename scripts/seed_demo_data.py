import sqlite3
import random
import datetime
from database import get_db

def seed_data():
    conn = get_db()
    cur = conn.cursor()
    
    print("--- 1. TẠO NHÀ CUNG CẤP & KHÁCH HÀNG ---")
    suppliers = [
        ("Cty TNHH Thức Ăn Thú Cưng Royal Canin VN", "SUPPLIER", "0901111222", "Khu CN Tân Bình, TP.HCM"),
        ("Công Ty CP Dược & Vắc-Xin Thú Y Marphavet", "SUPPLIER", "0902222333", "Hà Nội"),
        ("Nhà Máy Gia Công Khay Cát & Phụ Kiện PetTech", "SUPPLIER", "0903333444", "Bình Dương"),
        ("Nhà Máy May & Đệm Nệm Thú Cưng FurryHome", "SUPPLIER", "0904444555", "Long An"),
        ("Xưởng Mỹ Phẩm Sữa Tắm Spa Bioline", "SUPPLIER", "0905555666", "Đồng Nai"),
        ("Cty TNHH Thiết Bị & Chuồng Trại PetPro", "SUPPLIER", "0906666777", "TP.HCM"),
    ]
    supplier_ids = []
    for name, c_type, phone, addr in suppliers:
        cur.execute("INSERT INTO contacts (name, type, phone, address) VALUES (?, ?, ?, ?)", (name, c_type, phone, addr))
        supplier_ids.append(cur.lastrowid)

    ho_list = ["Nguyễn", "Trần", "Lê", "Phạm", "Hoàng", "Huỳnh", "Phan", "Vũ", "Võ", "Đặng", "Bùi", "Đỗ", "Hồ", "Ngô", "Dương"]
    dem_list = ["Văn", "Thị", "Hữu", "Đức", "Thành", "Minh", "Thu", "Ngọc", "Thanh", "Bảo", "Khánh", "Phương"]
    ten_list = ["An", "Bình", "Cường", "Dũng", "Em", "Giang", "Hải", "Hương", "Khoa", "Linh", "Long", "Mai", "Nam", "Nga", "Phúc", "Quân", "Sơn", "Tâm", "Thắng", "Trang", "Tùng", "Vinh", "Yến"]
    
    customer_ids = []
    for i in range(1, 101):
        fullname = f"{random.choice(ho_list)} {random.choice(dem_list)} {random.choice(ten_list)}"
        phone = f"09{random.randint(10000000, 99999999)}"
        addr = f"Số {random.randint(1, 400)} Đường {random.choice(['Lê Lợi', 'Nguyễn Trãi', 'Trần Hưng Đạo', 'Cách Mạng Tháng 8', 'Điện Biên Phủ', 'Quang Trung'])}, Q.{random.randint(1, 12)}"
        cur.execute("INSERT INTO contacts (name, type, phone, address) VALUES (?, 'CUSTOMER', ?, ?)", (fullname, phone, addr))
        customer_ids.append(cur.lastrowid)
    print(f"Đã tạo {len(supplier_ids)} Nhà cung cấp và {len(customer_ids)} Khách hàng.")

    print("--- 2. TẠO DANH MỤC HÀNG HÓA & NGUYÊN LIỆU ---")
    units = ["Gói", "Hộp", "Chai", "Túi", "Cái", "Bộ"]
    categories = [
        ("Hạt dinh dưỡng Royal Canin Mini Adult", 120000, 160000, "Gói"),
        ("Hạt dinh dưỡng SmartHeart vị thịt bò", 65000, 90000, "Gói"),
        ("Pate cho mèo Whiskas vị cá ngừ", 15000, 22000, "Túi"),
        ("Pate cho mèo Ciao vị cá hồi", 18000, 25000, "Túi"),
        ("Sữa tắm mượt lông SOS chuyên dụng", 85000, 130000, "Chai"),
        ("Sữa tắm trị ve rận Bio-Care", 60000, 95000, "Chai"),
        ("Cát vệ sinh đậu nành Cature 6L", 75000, 115000, "Túi"),
        ("Cát vệ sinh đất sét bentonite Sanicat", 55000, 85000, "Túi"),
        ("Vòng cổ chuông chuông màu sắc", 12000, 30000, "Cái"),
        ("Dây dắt trợ lực phản quang tự thu", 70000, 120000, "Cái"),
        ("Bát ăn đôi inox chống lật", 35000, 65000, "Cái"),
        ("Nhà cây cào móng Cat Tree 2 tầng", 210000, 350000, "Bộ"),
        ("Lược chải lông lấy ve tự động bấm nút", 30000, 60000, "Cái"),
        ("Kìm cắt móng thú cưng chống phạm tủy", 25000, 50000, "Cái"),
        ("Đồ chơi gà bóp kêu cao su", 15000, 35000, "Cái"),
        ("Xương gặm sạch răng Orgo vị sữa", 20000, 35000, "Gói"),
        ("Áo nỉ thú cưng hình gấu dễ thương", 45000, 85000, "Cái"),
        ("Đệm tròn nhung siêu êm cho cún", 110000, 190000, "Cái"),
        ("Thuốc xịt trị nấm Fungikur 50ml", 95000, 145000, "Chai"),
        ("Thuốc nhỏ gáy trị ve rận Frontline Plus", 140000, 210000, "Hộp")
    ]
    
    product_ids = []
    p_code_idx = 1
    for name, cost, sell, unit in categories:
        code = f"SP{p_code_idx:04d}"
        cur.execute("""
            INSERT INTO products (code, name, cost_price, sell_price, stock, unit, type)
            VALUES (?, ?, ?, ?, 100, ?, 'product')
        """, (code, name, cost, sell, unit))
        pid = cur.lastrowid
        product_ids.append((pid, code, name, cost, sell))
        
        # Thêm vào tồn kho kho 1
        cur.execute("INSERT OR REPLACE INTO product_inventory (product_id, warehouse_id, quantity) VALUES (?, 1, 100)", (pid,))
        p_code_idx += 1
    print(f"Đã tạo {len(product_ids)} Sản phẩm mẫu kèm số tồn kho.")

    print("--- 3. TẠO HỒ SƠ THÚ CƯNG ---")
    pet_names = ["Lu", "Miu", "Bông", "Kiki", "Cún", "Mực", "Vàng", "Simba", "Milo", "Nana", "Lucky", "Tom", "Jerry", "Bé Bự", "Susu"]
    breeds = ["Poodle", "Mèo Anh Lông Ngắn", "Phốc Sóc", "Corgi", "Mèo Ba Tư", "Golden Retriever", "Mèo Ta", "Husky"]
    pet_ids = []
    for i in range(1, 60):
        c_id = random.choice(customer_ids)
        p_name = random.choice(pet_names) + f" {random.randint(1, 99)}"
        breed = random.choice(breeds)
        weight = round(random.uniform(2.0, 15.0), 1)
        cur.execute("""
            INSERT INTO pets (customer_id, name, species, breed, color, weight, note)
            VALUES (?, ?, 'Chó/Mèo', ?, 'Nhiều màu', ?, 'Thú cưng mẫu kiểm thử')
        """, (c_id, p_name, breed, weight))
        pet_ids.append(cur.lastrowid)
    print(f"Đã tạo {len(pet_ids)} Hồ sơ Thú cưng.")

    print("--- 4. TẠO 1.000 HÓA ĐƠN BÁN LẺ & SỔ QUỸ (DỮ LIỆU GIAO DỊCH LỚN) ---")
    start_date = datetime.datetime.now() - datetime.timedelta(days=90)
    total_revenue = 0
    total_order_items = 0

    for i in range(1, 1001):
        order_date = start_date + datetime.timedelta(minutes=i * 125 + random.randint(-20, 20))
        date_str = order_date.strftime("%Y-%m-%d %H:%M:%S")
        date_code = order_date.strftime("%y%m%d%H%M%S")
        order_code = f"HD{date_code}{i%1000:03d}"

        cust_id = random.choice(customer_ids)
        # Chọn ngẫu nhiên 1 - 4 món hàng
        num_items = random.randint(1, 4)
        chosen_prods = random.sample(product_ids, num_items)
        
        subtotal = 0
        items_payload = []
        for pid, pcode, pname, pcost, psell in chosen_prods:
            qty = random.randint(1, 3)
            item_total = qty * psell
            subtotal += item_total
            items_payload.append((pid, qty, psell, item_total))

        discount = 0
        if random.random() < 0.2:
            discount = random.choice([10000, 20000, 50000])
        final_total = max(0, subtotal - discount)
        total_revenue += final_total

        payment_method = random.choice(["CASH", "TRANSFER", "CASH", "TRANSFER", "QR"])

        # Insert Order
        cur.execute("""
            INSERT INTO orders (code, customer_id, staff_id, total_amount, discount, final_amount, 
                               paid_amount, debt_amount, commission_amount, status, created_at, note)
            VALUES (?, ?, 1, ?, ?, ?, ?, 0, 0, 'completed', ?, 'Đơn hàng bán lẻ')
        """, (order_code, cust_id, subtotal, discount, final_total, final_total, date_str))
        order_id = cur.lastrowid

        # Insert Order Items
        for pid, qty, price, it_tot in items_payload:
            cur.execute("""
                INSERT INTO order_items (order_id, product_id, quantity, price, subtotal)
                VALUES (?, ?, ?, ?, ?)
            """, (order_id, pid, qty, price, it_tot))
            total_order_items += 1

        # Insert Cashbook (Sổ quỹ tiền thu từ bán hàng)
        cb_code = f"PT{date_code}{i%1000:03d}"
        cur.execute("""
            INSERT INTO cashbook (code, type, category, amount, contact_id, ref_type, ref_id, note, created_at, fund_source)
            VALUES (?, 'RECEIPT', 'Bán hàng (POS)', ?, ?, 'ORDER', ?, ?, ?, 'PERSONAL')
        """, (cb_code, final_total, cust_id, order_id, f"Thu tiền đơn {order_code}", date_str))

    print(f"Đã tạo thành công 1.000 Hóa Đơn ({total_order_items} dòng chi tiết hàng bán).")
    print(f"Tổng doanh thu tích lũy mẫu: {total_revenue:,.0f} đ.")

    print("--- 5. TẠO ĐƠN ĐẶT HÀNG & PHIẾU DỊCH VỤ SPA MẪU ---")
    for j in range(1, 16):
        po_code = f"PN2609{(10+j):02d}100000"
        supp = random.choice(supplier_ids)
        cur.execute("""
            INSERT INTO purchases (code, supplier_id, warehouse_id, subtotal_amount, discount, 
                                   shipping_fee, other_fee, vat_rate, vat_amount, total_amount, 
                                   paid_amount, status, fund_source, created_at, expected_date)
            VALUES (?, ?, 1, 5000000, 0, 50000, 0, 8, 400000, 5450000, 5450000, 'received', 'COMPANY', ?, ?)
        """, (po_code, supp, (datetime.datetime.now() - datetime.timedelta(days=j*3)).strftime("%Y-%m-%d %H:%M:%S"), (datetime.datetime.now() - datetime.timedelta(days=j*3)).strftime("%Y-%m-%d")))

    conn.commit()
    conn.close()
    print("✅ ĐÃ HOÀN TẤT TẠO TOÀN BỘ 1.000+ DÒNG DỮ LIỆU MẪU!")

if __name__ == "__main__":
    seed_data()
