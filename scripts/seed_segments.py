import sqlite3
import random
from database import get_db

def setup_customer_segments_and_prices():
    conn = get_db()
    cur = conn.cursor()

    print("--- 1. CẬP NHẬT PHÂN LOẠI KHÁCH HÀNG & LIÊN KẾT BẢNG GIÁ ---")
    cur.execute("SELECT id, code, name FROM price_lists")
    pl_dict = {r['code']: r['id'] for r in cur.fetchall()}

    # Xóa và tạo mới các nhóm khách hàng chuẩn nghiệp vụ
    cur.execute("DELETE FROM customer_segments")

    segments = [
        ("KHACH-LE", "Khách Hàng Bán Lẻ Thường", 0.0, 1, None),
        ("KHACH-VIP", "Khách Hàng Thân Thiết (VIP Gold)", 12.0, 2, pl_dict.get('BG-VIP')),
        ("CONG-TAC-VIEN", "Cộng Tác Viên (Dropship / CTV)", 15.0, 3, pl_dict.get('BG-CTV')),
        ("DAI-LY-SI", "Đại Lý Phân Phối / Khách Sỉ", 22.0, 4, pl_dict.get('BG-SI')),
    ]

    segment_ids = {}
    for code, name, disc, prio, pl_id in segments:
        cur.execute("""
            INSERT INTO customer_segments (code, name, discount_percent, priority, is_active, price_list_id)
            VALUES (?, ?, ?, ?, 1, ?)
        """, (code, name, disc, prio, pl_id))
        seg_id = cur.lastrowid
        segment_ids[code] = seg_id
        print(f"✅ Tạo nhóm: [{code}] {name} -> Gắn bảng giá ID: {pl_id}")

    print("\n--- 2. PHÂN BỔ 100 KHÁCH HÀNG VÀO CÁC NHÓM ---")
    cur.execute("SELECT id, name FROM contacts WHERE type = 'customer'")
    customers = cur.fetchall()

    # Tỷ lệ phân bổ:
    # 55% Khách lẻ, 20% Khách VIP, 15% CTV, 10% Đại lý sỉ
    counts = {"KHACH-LE": 0, "KHACH-VIP": 0, "CONG-TAC-VIEN": 0, "DAI-LY-SI": 0}

    for idx, c in enumerate(customers):
        cid = c['id']
        rand = random.random()
        if rand < 0.55:
            seg_code = "KHACH-LE"
        elif rand < 0.75:
            seg_code = "KHACH-VIP"
        elif rand < 0.90:
            seg_code = "CONG-TAC-VIEN"
        else:
            seg_code = "DAI-LY-SI"

        cur.execute("UPDATE contacts SET segment_id = ? WHERE id = ?", (segment_ids[seg_code], cid))
        counts[seg_code] += 1

    for code, cnt in counts.items():
        print(f"  * Nhóm {code}: {cnt} khách hàng")

    print("\n--- 3. KIỂM TRA TOÀN DIỆN SẢN PHẨM TRONG CÁC BẢNG GIÁ ---")
    cur.execute("SELECT count(*) FROM product_price_list")
    print(f"Tổng số mức giá sản phẩm đã gán trong các bảng giá: {cur.fetchone()[0]} dòng.")

    conn.commit()
    conn.close()
    print("\n🎉 ĐÃ HOÀN TẤT THIẾT LẬP PHÂN LOẠI KHÁCH HÀNG & GẮN BẢNG GIÁ TỰ ĐỘNG!")

if __name__ == "__main__":
    setup_customer_segments_and_prices()
