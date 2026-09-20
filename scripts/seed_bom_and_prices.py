import sqlite3
import datetime
from database import get_db

def seed_bom_and_price_lists():
    conn = get_db()
    cur = conn.cursor()

    print("--- 1. TẠO DANH MỤC NGUYÊN LIỆU & VẬT TƯ (INGREDIENTS) ---")
    materials = [
        ("NL0001", "Vỏ chai nhựa PET 500ml nắp bật", "Chai", "IS_PHYSICAL", 3500, 500),
        ("NL0002", "Nhãn decal ép kim chống nước SOS 500ml", "Cái", "IS_PHYSICAL", 1200, 1000),
        ("NL0003", "Dung dịch cốt sữa tắm dưỡng lông đậm đặc", "Lít", "IS_PHYSICAL", 45000, 50),
        ("NL0004", "Hương liệu tinh dầu tự nhiên Lavender", "Lít", "IS_PHYSICAL", 120000, 10),
        ("NL0005", "Vải nhung lông cừu nhân tạo siêu mịn", "Mét", "IS_PHYSICAL", 35000, 200),
        ("NL0006", "Bông gòn bi nhân tạo đàn hồi PP", "Kg", "IS_PHYSICAL", 28000, 300),
        ("NL0007", "Dây kéo khóa giọt nước 45cm", "Cái", "IS_PHYSICAL", 4000, 400),
        ("NL0008", "Dây đai dù nylon bản 2.5cm phản quang", "Mét", "IS_PHYSICAL", 6000, 500),
        ("NL0009", "Móc khóa kim loại xoay 360 độ trợ lực", "Cái", "IS_PHYSICAL", 15000, 250),
        ("NL0010", "Hộp carton in màu đóng gói phụ kiện", "Hộp", "IS_PHYSICAL", 5000, 400),
        ("NL0011", "Túi zip đáy đứng tráng bạc 1kg đóng hạt", "Túi", "IS_PHYSICAL", 2500, 800),
        ("NL0012", "Hạt thịt sấy khô mix đông khô (Freeze-dried)", "Kg", "IS_PHYSICAL", 180000, 30),
    ]

    ingredient_map = {}
    for code, name, unit, m_type, cost, stock_qty in materials:
        cur.execute("""
            INSERT INTO ingredients (code, name, unit, type)
            VALUES (?, ?, ?, ?)
        """, (code, name, unit, m_type))
        ing_id = cur.lastrowid
        ingredient_map[code] = (ing_id, name, unit, cost)

        # Cấp tồn kho cho nguyên liệu ở Kho chính (warehouse_id = 1)
        cur.execute("""
            INSERT OR REPLACE INTO inventory (warehouse_id, ingredient_id, quantity)
            VALUES (1, ?, ?)
        """, (ing_id, stock_qty))

    print(f"Đã tạo {len(materials)} nguyên liệu, bao bì & phụ kiện kèm số tồn kho.")

    print("--- 2. THIẾT LẬP ĐỊNH MỨC NGUYÊN LIỆU BOM CHO SẢN PHẨM ---")
    cur.execute("DELETE FROM product_bom")
    cur.execute("DELETE FROM bom")

    cur.execute("SELECT id, code, name FROM products")
    prods = {r['code']: r['id'] for r in cur.fetchall()}

    # Cấu hình BOM định mức
    # 1. SP0005: Sữa tắm mượt lông SOS chuyên dụng (500ml)
    # Gồm: 1 Vỏ chai (NL0001) + 1 Tem nhãn (NL0002) + 0.45 lít Cốt sữa tắm (NL0003) + 0.05 lít Tinh dầu (NL0004)
    bom_recipes = [
        ("SP0005", [
            ("NL0001", 1.0),
            ("NL0002", 1.0),
            ("NL0003", 0.45),
            ("NL0004", 0.05),
        ]),
        # 2. SP0006: Sữa tắm trị ve rận Bio-Care
        ("SP0006", [
            ("NL0001", 1.0),
            ("NL0002", 1.0),
            ("NL0003", 0.5),
        ]),
        # 3. SP0018: Đệm tròn nhung siêu êm cho cún
        # Gồm: 1.5 mét Vải nhung (NL0005) + 1.2 kg Bông gòn bi (NL0006) + 1 Dây kéo (NL0007)
        ("SP0018", [
            ("NL0005", 1.5),
            ("NL0006", 1.2),
            ("NL0007", 1.0),
        ]),
        # 4. SP0017: Áo nỉ thú cưng hình gấu dễ thương
        ("SP0017", [
            ("NL0005", 0.6),
            ("NL0007", 1.0),
        ]),
        # 5. SP0010: Dây dắt trợ lực phản quang tự thu
        # Gồm: 3 mét Dây đai dù (NL0008) + 1 Móc khóa kim loại (NL0009) + 1 Hộp carton (NL0010)
        ("SP0010", [
            ("NL0008", 3.0),
            ("NL0009", 1.0),
            ("NL0010", 1.0),
        ]),
        # 6. SP0001: Hạt dinh dưỡng Royal Canin Mini Adult (Mix sấy cao cấp)
        ("SP0001", [
            ("NL0011", 1.0),
            ("NL0012", 0.2), # 200g thịt sấy đông khô mix cùng
        ])
    ]

    total_bom_count = 0
    for p_code, recipe in bom_recipes:
        if p_code in prods:
            pid = prods[p_code]
            for ing_code, qty in recipe:
                ing_id = ingredient_map[ing_code][0]
                # Insert vào bảng product_bom (chuẩn liên kết với ingredients)
                cur.execute("INSERT OR REPLACE INTO product_bom (product_id, ingredient_id, quantity) VALUES (?, ?, ?)", (pid, ing_id, qty))
                total_bom_count += 1
            print(f"✅ Gắn BOM thành công cho sản phẩm {p_code}: {len(recipe)} thành phần.")

    print(f"Tổng cộng đã gắn {total_bom_count} dòng định mức BOM.")

    print("--- 3. TẠO CÁC BẢNG GIÁ ĐA CẤP (BÁN SỈ, ĐẠI LÝ, VIP, CTV) ---")
    cur.execute("DELETE FROM product_price_list")
    cur.execute("DELETE FROM price_lists")

    price_lists_data = [
        ("BG-SI", "Bảng Giá Bán Sỉ / Đại Lý Cấp 1", "Áp dụng cho đại lý nhập số lượng lớn, chiết khấu sâu ~20-25%"),
        ("BG-VIP", "Bảng Giá Khách Hàng Thân Thiết (VIP)", "Áp dụng cho khách hàng VIP đạt tích lũy, giảm 10-15%"),
        ("BG-CTV", "Bảng Giá Cộng Tác Viên / Dropship", "Bảng giá chiết khấu 15% cho CTV bán hàng online"),
        ("BG-COMBO", "Bảng Giá Mùa Khuyến Mãi / Xả Kho", "Bảng giá giờ vàng khuyến mãi theo sự kiện")
    ]

    price_list_ids = []
    for code, name, desc in price_lists_data:
        cur.execute("""
            INSERT INTO price_lists (code, name, description, is_active)
            VALUES (?, ?, ?, 1)
        """, (code, name, desc))
        price_list_ids.append((cur.lastrowid, code, name))
        print(f"✅ Đã tạo bảng giá: [{code}] {name}")

    # Gắn toàn bộ 20 sản phẩm vào các bảng giá với mức chiết khấu thông minh
    cur.execute("SELECT id, code, name, sell_price, cost_price FROM products")
    all_products = cur.fetchall()

    total_price_entries = 0
    for p in all_products:
        pid = p['id']
        sell = p['sell_price']
        cost = p['cost_price']

        # 1. Giá Sỉ: giảm 22% (áp dụng từ số lượng >= 5)
        wholesale_price = round(sell * 0.78, -3)
        cur.execute("""
            INSERT INTO product_price_list (product_id, price_list_id, price, min_qty, discount_percent)
            VALUES (?, ?, ?, 5, 22.0)
        """, (pid, price_list_ids[0][0], wholesale_price))
        total_price_entries += 1

        # 2. Giá VIP: giảm 12% (từ số lượng >= 1)
        vip_price = round(sell * 0.88, -3)
        cur.execute("""
            INSERT INTO product_price_list (product_id, price_list_id, price, min_qty, discount_percent)
            VALUES (?, ?, ?, 1, 12.0)
        """, (pid, price_list_ids[1][0], vip_price))
        total_price_entries += 1

        # 3. Giá CTV: giảm 15% (từ số lượng >= 1)
        ctv_price = round(sell * 0.85, -3)
        cur.execute("""
            INSERT INTO product_price_list (product_id, price_list_id, price, min_qty, discount_percent)
            VALUES (?, ?, ?, 1, 15.0)
        """, (pid, price_list_ids[2][0], ctv_price))
        total_price_entries += 1

        # 4. Giá Khuyến Mãi: giảm 10%
        promo_price = round(sell * 0.90, -3)
        cur.execute("""
            INSERT INTO product_price_list (product_id, price_list_id, price, min_qty, discount_percent)
            VALUES (?, ?, ?, 1, 10.0)
        """, (pid, price_list_ids[3][0], promo_price))
        total_price_entries += 1

    print(f"Đã thiết lập thành công {total_price_entries} mức giá cho 20 sản phẩm trên 4 bảng giá!")

    conn.commit()
    conn.close()
    print("\n🎉 HOÀN TẤT THIẾT LẬP BOM VÀ BẢNG GIÁ!")

if __name__ == "__main__":
    seed_bom_and_price_lists()
