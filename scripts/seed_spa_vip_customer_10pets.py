"""
Seed dữ liệu mẫu: Khách hàng có 10 thú cưng, đã làm Spa 5 lần, mỗi lần 10 bé với 10 dịch vụ khác nhau.
"""
import sqlite3
import json
from datetime import datetime, timedelta

def seed_vip_customer_10pets():
    con = sqlite3.connect('data/pos.db')
    con.row_factory = sqlite3.Row
    cur = con.cursor()

    phone = '0988101010'
    name = 'Bùi Thiên Phú (VIP 10 Bé)'

    # 1. Tạo hoặc lấy contact
    cur.execute("SELECT id FROM contacts WHERE phone = ?", (phone,))
    row = cur.fetchone()
    if row:
        cust_id = row['id']
        cur.execute("UPDATE contacts SET name = ?, address = '128 Đồng Khởi, Bến Tre', type = 'customer', spa_wallet_balance = 3500000, points = 8500 WHERE id = ?", (name, cust_id))
    else:
        cur.execute("""
            INSERT INTO contacts (name, phone, address, type, spa_wallet_balance, points)
            VALUES (?, ?, '128 Đồng Khởi, Bến Tre', 'customer', 3500000, 8500)
        """, (name, phone))
        cust_id = cur.lastrowid

    print(f"-> Khách hàng VIP: {name} (ID: {cust_id}, SĐT: {phone})")

    # 2. Tạo 10 bé thú cưng
    pets_data = [
        ("Bé Bông", "dog", "Poodle", "Đực", "Trắng", 3.2),
        ("Bé Lu", "dog", "Phốc Sóc", "Cái", "Kem", 2.8),
        ("Bé Miu", "cat", "Mèo ALN", "Cái", "Bò sữa", 4.5),
        ("Bé Gấu", "dog", "Corgi", "Đực", "Vàng trắng", 9.5),
        ("Bé Kem", "dog", "Bichon Frise", "Cái", "Trắng", 4.8),
        ("Bé Xám", "cat", "Mèo ALD", "Đực", "Xám khói", 5.0),
        ("Bé Cacao", "dog", "Poodle", "Đực", "Nâu đỏ", 3.8),
        ("Bé Mochi", "dog", "Shiba Inu", "Cái", "Vàng", 8.2),
        ("Bé Sumo", "dog", "Bull Pháp", "Đực", "Vàng đen", 11.0),
        ("Bé Vàng", "dog", "Golden Retriever", "Đực", "Vàng", 22.0),
    ]

    pet_ids = []
    for p_name, species, breed, gender, color, weight in pets_data:
        cur.execute("SELECT id FROM pets WHERE customer_id = ? AND name = ?", (cust_id, p_name))
        p_row = cur.fetchone()
        if p_row:
            p_id = p_row['id']
            cur.execute("UPDATE pets SET species = ?, breed = ?, color = ?, weight = ?, note = ? WHERE id = ?", (species, breed, color, weight, gender, p_id))
        else:
            cur.execute("""
                INSERT INTO pets (customer_id, name, species, breed, color, weight, note)
                VALUES (?, ?, ?, ?, ?, ?, ?)
            """, (cust_id, p_name, species, breed, color, weight, gender))
            p_id = cur.lastrowid
        pet_ids.append((p_id, p_name, species, breed, gender, color, weight))

    print(f"-> Đã chuẩn bị 10 thú cưng cho khách: {[p[1] for p in pet_ids]}")

    # Xóa các phiếu dịch vụ cũ của khách này để tạo lại bộ 5 đợt sạch sẽ
    cur.execute("DELETE FROM pet_service_tickets WHERE customer_id = ?", (cust_id,))

    # 3. Tạo 5 đợt làm Spa (Mỗi đợt 10 bé với 10 dịch vụ khác nhau)
    batches = [
        {
            "date": "2026-08-10",
            "batch_code": "BATCH-260810-001",
            "title": "Đợt 1: Khởi động hè mát mẻ",
            "services": [
                ("Tắm Vệ Sinh Cơ Bản Cún Nhỏ", "", 180000, 30000, 0, "Cắt móng tròn kỹ", "Khách tự chở"),
                ("Cắt Tỉa Tạo Kiểu Poodle Chuyên Nghiệp", "", 350000, 0, 50000, "Cắt mặt tròn tai dài", "Xe tiệm đón"),
                ("Tắm Vệ Sinh Khử Mùi Mèo Lông Ngắn", "", 200000, 30000, 0, "Bé hơi nhát nước", "Khách tự chở"),
                ("Combo Tắm Dưỡng Ẩm + Cạo Vệ Sinh Bàn Corgi", "", 280000, 0, 0, "Cạo bàn cao sạch sẽ", "Khách tự chở"),
                ("Cắt Tỉa Tạo Hình Tròn Bichon Frise", "", 380000, 30000, 100000, "Tạo đầu tròn bồng bềnh", "Khách tự chở"),
                ("Tắm Dưỡng Mượt Lông Mèo Dài", "", 250000, 0, 0, "Gỡ lông rối nhẹ ở cổ", "Khách tự chở"),
                ("Cắt Tỉa Phong Cách Gấu Teddy Cún Nhỏ", "", 320000, 0, 50000, "Gọt chân trụ gọn", "Khách tự chở"),
                ("Tắm Khử Khuẩn Tẩy Ố Shiba Inu", "", 300000, 0, 0, "Vệ sinh tai kỹ", "Xe tiệm đón"),
                ("Tắm Trị Liệu Phục Hồi Da Nhăn Bull Pháp", "", 280000, 0, 0, "Lau sạch các nếp gấp mũi", "Khách tự chở"),
                ("Gói Tắm Sấy Đại Cún Golden Retriever", "", 450000, 50000, 100000, "Chải rụng lông kỹ", "Khách tự chở")
            ]
        },
        {
            "date": "2026-08-25",
            "batch_code": "BATCH-260825-001",
            "title": "Đợt 2: Nhuộm & Spa Cao Cấp",
            "services": [
                ("Combo Tắm + Nhuộm 2 Tai Hồng Poodle", "Nhuộm 2 Tai", 320000, 30000, 0, "Nhuộm màu hồng pastel", "Khách tự chở"),
                ("Cắt Tỉa Gọn Gàng + Nhuộm Đuôi Cầu Vồng", "Nhuộm Đuôi", 420000, 0, 50000, "Nhuộm đuôi 3 màu", "Khách tự chở"),
                ("Cạo Lông Mùa Hè + Tắm Mát Mèo", "", 250000, 0, 0, "Chừa đầu và đuôi", "Khách tự chở"),
                ("Tắm Thảo Mộc Phục Hồi Corgi", "", 300000, 30000, 0, "Thoa tinh dầu dưỡng", "Khách tự chở"),
                ("Tắm Trắng Bông Gòn Bichon Frise", "", 300000, 30000, 50000, "Dùng sữa tắm trắng chuyên dụng", "Khách tự chở"),
                ("Cạo Lông Kiểu Sư Tử Mèo ALD", "", 320000, 0, 0, "Cắt bờm sư tử tròn", "Khách tự chở"),
                ("Tắm Trị Ve Rận Poodle Nâu", "", 260000, 0, 0, "Ủ dầu trị ve 10 phút", "Xe tiệm đón"),
                ("Cắt Tỉa Tỉ Mỉ Chuẩn Form Shiba", "", 350000, 30000, 0, "Tỉa viền chân móng", "Khách tự chở"),
                ("Spa Bùn Khoáng Núi Lửa Bull Pháp", "", 380000, 0, 0, "Massage thư giãn 15p", "Khách tự chở"),
                ("Combo Tắm Sấy + Vắt Tuyến Hôi Golden", "", 480000, 50000, 0, "Vắt tuyến hôi sạch", "Khách tự chở")
            ]
        },
        {
            "date": "2026-09-05",
            "batch_code": "BATCH-260905-001",
            "title": "Đợt 3: Đại Phục Hồi & Đánh Răng",
            "services": [
                ("Tắm Spa Tinh Dầu Oải Hương Poodle", "", 240000, 30000, 0, "Khử mùi hôi miệng", "Khách tự chở"),
                ("Tắm Khô & Cắt Tỉa Vệ Sinh Phốc Sóc", "", 220000, 30000, 0, "Không dùng nước nhiều", "Khách tự chở"),
                ("Cắt Móng & Vệ Sinh Tai Chuyên Sâu Mèo", "", 150000, 30000, 0, "Nhổ lông tai sạch", "Khách tự chở"),
                ("Cắt Tỉa Mông Trái Tim Đào Corgi", "", 380000, 0, 100000, "Cắt mông hình trái tim đào", "Khách tự chở"),
                ("Cắt Tỉa Phong Cách Hàn Quốc Bichon", "", 400000, 30000, 50000, "Kiểu tai cụp tròn Hàn", "Khách tự chở"),
                ("Tắm Dưỡng Mượt & Tẩy Lông Rụng Mèo ALD", "", 280000, 0, 0, "Chải kỹ lông tơ", "Khách tự chở"),
                ("Cắt Tỉa Body Ngắn 3mm Poodle", "", 300000, 30000, 0, "Cạo sát mát mẻ", "Khách tự chở"),
                ("Tắm Dầu Dừa Dưỡng Ẩm Shiba", "", 320000, 0, 0, "Xịt dưỡng lông bóng mượt", "Khách tự chở"),
                ("Vệ Sinh Kẽ Chân & Tắm Trị Ngứa Bull Pháp", "", 300000, 30000, 0, "Ngâm chân nước ấm sát khuẩn", "Khách tự chở"),
                ("Tắm Sấy Dưỡng Lông Óng Ả Golden", "", 500000, 50000, 100000, "Sấy phồng chải suôn mượt", "Khách tự chở")
            ]
        },
        {
            "date": "2026-09-15",
            "batch_code": "BATCH-260915-001",
            "title": "Đợt 4: Cắt Tạo Kiểu Nghệ Thuật & Nhuộm 4 Chân",
            "services": [
                ("Nhuộm 4 Chân Giày Bốt + Tắm Poodle", "Nhuộm 4 Chân", 450000, 30000, 50000, "Nhuộm màu cam rực rỡ", "Khách tự chở"),
                ("Cắt Tỉa Mặt Cáo Cực Xinh Phốc Sóc", "", 350000, 0, 0, "Tỉa khuôn mặt hồ ly", "Khách tự chở"),
                ("Tắm Bọt Tuyết Thư Giãn Mèo ALN", "", 220000, 30000, 0, "Tắm bọt tuyết nhẹ dịu", "Khách tự chở"),
                ("Cắt Tỉa Vệ Sinh Toàn Diện Corgi", "", 320000, 0, 0, "Gọt chân mèo gọn", "Khách tự chở"),
                ("Tắm Dầu Gấc Phục Hồi Màu Lông Bichon", "", 320000, 30000, 0, "Đỡ ố vàng khóe mắt", "Khách tự chở"),
                ("Cắt Tỉa Vệ Sinh Hậu Môn & Bàn Chân Mèo", "", 180000, 0, 0, "Gọt bàn chân sạch", "Khách tự chở"),
                ("Cắt Tỉa Tạo Kiểu Búp Bê Poodle Đỏ", "", 380000, 30000, 50000, "Để chỏm đầu cao", "Khách tự chở"),
                ("Tắm Bùn Biển Chết Thải Độc Shiba", "", 360000, 0, 50000, "Ủ bùn khoáng 15p", "Khách tự chở"),
                ("Tắm Trị Nấm Kẽ & Viêm Da Bull Pháp", "", 320000, 30000, 0, "Thoa kem dưỡng kẽ", "Khách tự chở"),
                ("Gói VIP Toàn Diện Golden Retriever", "", 600000, 50000, 100000, "Tắm sấy tỉa lông thừa", "Khách tự chở")
            ]
        },
        {
            "date": "2026-09-24",
            "batch_code": "BATCH-260924-001",
            "title": "Đợt 5: Spa Mùa Thu Trọn Gói",
            "services": [
                ("Combo Cắt Tỉa Full + Đánh Răng Poodle", "", 380000, 30000, 0, "Cắt tròn xoe cưng xỉu", "Khách tự chở"),
                ("Combo Tắm Thơm Lâu Phốc Sóc", "", 250000, 0, 0, "Xịt nước hoa lưu hương 7 ngày", "Khách tự chở"),
                ("Tắm Khử Khuẩn Đóng Kén Mèo ALN", "", 260000, 30000, 0, "Vắt lông tơ rụng", "Khách tự chở"),
                ("Cắt Tỉa Mông Đào Tròn Xoe Corgi", "", 360000, 0, 50000, "Form chuẩn mông tròn", "Khách tự chở"),
                ("Gói Làm Đẹp Hoàng Gia Bichon Frise", "", 450000, 30000, 50000, "Dưỡng chất collagen", "Khách tự chở"),
                ("Tắm Dưỡng Mượt & Nhổ Lông Tai Mèo ALD", "", 290000, 30000, 0, "Lau mắt nhổ lông tai", "Khách tự chở"),
                ("Cắt Tỉa Tai Tròn Gấu Nâu Poodle", "", 350000, 0, 0, "Cắt tai ngắn hình bán nguyệt", "Khách tự chở"),
                ("Tắm Tẩy Tế Bào Chết Shiba Inu", "", 340000, 0, 0, "Chải bông gòn mượt", "Khách tự chở"),
                ("Tắm Ngâm Tinh Dầu Thảo Dược Bull Pháp", "", 320000, 30000, 0, "Ngâm bồn nước ấm thảo mộc", "Khách tự chở"),
                ("Combo Spa Đại Cún + Tỉa Bàn Chân Golden", "", 550000, 50000, 50000, "Cạo bàn cao và tỉa viền", "Khách tự chở")
            ]
        }
    ]

    ticket_counter = 100
    for b_idx, b in enumerate(batches):
        b_date = b["date"]
        b_code = b["batch_code"]
        print(f"\n--- ĐANG TẠO {b['title']} (Ngày: {b_date}, Mã: {b_code}) ---")

        for idx, p_info in enumerate(pet_ids):
            ticket_counter += 1
            p_id, p_name, species, breed, gender, color, weight = p_info
            svc_name, dye_name, price, teeth_fee, art_fee, notes, arrival = b["services"][idx]

            total_price = price + teeth_fee + art_fee
            ticket_num = ticket_counter
            code = f"DV{b_date.replace('-', '')[2:]}{ticket_num:04d}"

            line_items = [
                {"name": svc_name, "quantity": 1, "price": price, "original_price": price}
            ]
            if dye_name:
                line_items.append({"name": f"Nhuộm lông: {dye_name}", "quantity": 1, "price": 0, "original_price": 0})
            if teeth_fee > 0:
                line_items.append({"name": "Đánh răng & cạo vôi", "quantity": 1, "price": teeth_fee, "original_price": teeth_fee})
            if art_fee > 0:
                line_items.append({"name": "Cắt tạo kiểu nghệ thuật", "quantity": 1, "price": art_fee, "original_price": art_fee})

            services_json = json.dumps(line_items, ensure_ascii=False)

            cutter = "Thợ Sang" if idx % 2 == 0 else "Thợ Phượng"
            worker = "Thợ Lan" if idx % 2 == 0 else "Thợ Tú"
            receiver = "Lễ Tân Mai"

            received_time = f"0{8 + idx % 3}:{15 + (idx*5) % 45:02d}"
            checkout_time = f"{11 + idx % 3}:{30 + (idx*5) % 30:02d}"

            cur.execute("""
                INSERT INTO pet_service_tickets (
                    code, ticket_number, customer_id, pet_id,
                    weight_at_service, shaving_feet, service_type, dye_package, teeth_cleaning, art_cutting_fee, surcharge,
                    shipping_fee, tip_amount, price, status, payment_status, payment_method, note, customer_request,
                    accessories, staff_receiver, staff_cutter, staff_worker_1, staff_dyer, received_time, checkout_time,
                    arrival_method, return_method, batch_code, services_json, created_at, ticket_date
                ) VALUES (
                    ?, ?, ?, ?,
                    ?, ?, ?, ?, ?, ?, 0,
                    0, 0, ?, 'completed', 'paid', 'transfer', ?, ?,
                    'Dây dắt + Vòng cổ', ?, ?, ?, ?, ?, ?,
                    ?, 'Khách tự đón', ?, ?, ?, ?
                )
            """, (
                code, ticket_num, cust_id, p_id,
                weight, "Cạo bàn" if idx % 3 == 0 else "Không cạo bàn", svc_name, dye_name, teeth_fee, art_fee,
                total_price, notes, notes,
                receiver, cutter, worker, cutter if dye_name else "", received_time, checkout_time,
                arrival, b_code, services_json, f"{b_date} 10:00:00", b_date
            ))

        print(f"-> Đã tạo 10 phiếu cho 10 bé trong {b['batch_code']}")

    con.commit()
    con.close()
    print("\n🎉 HOÀN THÀNH SEED 50 PHIẾU SPA (5 ĐỢT X 10 BÉ) CHO KHÁCH BÙI THIÊN PHÚ!")

if __name__ == '__main__':
    seed_vip_customer_10pets()
