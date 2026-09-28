"""
Seed test data cho chức năng Ví Spa (Spa Prepaid Wallet)
- Gói nạp Topup chuẩn hóa
- Dữ liệu khách hàng thực tế với các số dư đa dạng
- Lịch sử biến động số dư (nạp gói + chi tiêu trừ ví)
"""
import sqlite3
from datetime import datetime, timedelta

def seed_spa_wallet():
    con = sqlite3.connect('data/pos.db')
    con.row_factory = sqlite3.Row
    cur = con.cursor()

    print("--- 1. CẬP NHẬT GÓI NẠP TOPUP CHUẨN HÓA ---")
    # Tắt các gói trùng lặp cũ
    cur.execute("UPDATE topup_packages SET is_active = 0")

    standard_packages = [
        ("Gói Spa Khởi Động (500k -> 650k)", 500000.0, 650000.0),
        ("Gói Spa Tiết Kiệm (1.000k -> 1.400k)", 1000000.0, 1400000.0),
        ("Gói Spa VIP Thành Viên (2.000k -> 3.000k)", 2000000.0, 3000000.0),
        ("Gói Spa Kim Cương Diamond (5.000k -> 8.000k)", 5000000.0, 8000000.0),
    ]

    pkg_ids = []
    for name, pay, recv in standard_packages:
        # Kiểm tra nếu đã có gói cùng tên
        cur.execute("SELECT id FROM topup_packages WHERE name = ?", (name,))
        row = cur.fetchone()
        if row:
            cur.execute("UPDATE topup_packages SET pay_amount = ?, receive_amount = ?, is_active = 1 WHERE id = ?", (pay, recv, row['id']))
            pkg_ids.append(row['id'])
        else:
            cur.execute("INSERT INTO topup_packages (name, pay_amount, receive_amount, is_active) VALUES (?, ?, ?, 1)", (name, pay, recv))
            pkg_ids.append(cur.lastrowid)

    print(f"-> Đã chuẩn hóa {len(pkg_ids)} gói nạp ví Spa hoạt động: {pkg_ids}")

    print("\n--- 2. SEED KHÁCH HÀNG & LỊCH SỬ BIẾN ĐỘNG VÍ SPA ---")
    now = datetime.now()

    # Khách 1: Nguyễn Văn An (id=6) - Số dư: 800.000 đ
    # Nạp 1.400k (gói 1tr), chi tiêu 250k và 350k
    c1_id = 6
    cur.execute("DELETE FROM spa_wallet_transactions WHERE contact_id = ?", (c1_id,))
    t1_time = (now - timedelta(days=5)).strftime("%Y-%m-%d %H:%M:%S")
    t2_time = (now - timedelta(days=3)).strftime("%Y-%m-%d %H:%M:%S")
    t3_time = (now - timedelta(days=1)).strftime("%Y-%m-%d %H:%M:%S")

    cur.execute("""
        INSERT INTO spa_wallet_transactions (contact_id, package_id, type, amount, balance_before, balance_after, note, created_at)
        VALUES (?, ?, 'topup', 1400000, 0, 1400000, 'Nạp ví Spa Gói Tiết Kiệm (1.000k -> 1.400k)', ?)
    """, (c1_id, pkg_ids[1], t1_time))
    cur.execute("""
        INSERT INTO spa_wallet_transactions (contact_id, package_id, type, amount, balance_before, balance_after, note, created_at)
        VALUES (?, NULL, 'spend', 250000, 1400000, 1150000, 'Thanh toán dịch vụ Spa: Tắm Vệ Sinh Cún Poodle 3.5kg', ?)
    """, (c1_id, t2_time))
    cur.execute("""
        INSERT INTO spa_wallet_transactions (contact_id, package_id, type, amount, balance_before, balance_after, note, created_at)
        VALUES (?, NULL, 'spend', 350000, 1150000, 800000, 'Thanh toán dịch vụ Spa: Cắt Tỉa Tạo Kiểu Poodle', ?)
    """, (c1_id, t3_time))
    cur.execute("UPDATE contacts SET spa_wallet_balance = 800000, points = 1000 WHERE id = ?", (c1_id,))
    print(f"-> Khách 1: Nguyễn Văn An (0911000001) - Số dư ví: 800.000 đ (Có 3 giao dịch)")

    # Khách 2: Trần Thị Bích (id=7) - Số dư: 2.450.000 đ (VIP)
    c2_id = 7
    cur.execute("DELETE FROM spa_wallet_transactions WHERE contact_id = ?", (c2_id,))
    t2_1 = (now - timedelta(days=4)).strftime("%Y-%m-%d %H:%M:%S")
    t2_2 = (now - timedelta(days=2)).strftime("%Y-%m-%d %H:%M:%S")
    cur.execute("""
        INSERT INTO spa_wallet_transactions (contact_id, package_id, type, amount, balance_before, balance_after, note, created_at)
        VALUES (?, ?, 'topup', 3000000, 0, 3000000, 'Nạp ví Spa VIP Thành Viên (2.000k -> 3.000k)', ?)
    """, (c2_id, pkg_ids[2], t2_1))
    cur.execute("""
        INSERT INTO spa_wallet_transactions (contact_id, package_id, type, amount, balance_before, balance_after, note, created_at)
        VALUES (?, NULL, 'spend', 550000, 3000000, 2450000, 'Thanh toán dịch vụ Spa: Combo Cắt Tỉa + Nhuộm 2 tai Corgi', ?)
    """, (c2_id, t2_2))
    cur.execute("UPDATE contacts SET spa_wallet_balance = 2450000, points = 2000 WHERE id = ?", (c2_id,))
    print(f"-> Khách 2: Trần Thị Bích (0911000002) - Số dư ví: 2.450.000 đ (VIP, có 2 giao dịch)")

    # Khách 3: Lê Văn Cường (id=8) - Số dư: 650.000 đ (Vừa nạp, chưa chi)
    c3_id = 8
    cur.execute("DELETE FROM spa_wallet_transactions WHERE contact_id = ?", (c3_id,))
    t3_1 = (now - timedelta(hours=3)).strftime("%Y-%m-%d %H:%M:%S")
    cur.execute("""
        INSERT INTO spa_wallet_transactions (contact_id, package_id, type, amount, balance_before, balance_after, note, created_at)
        VALUES (?, ?, 'topup', 650000, 0, 650000, 'Nạp ví Spa Khởi Động (500k -> 650k)', ?)
    """, (c3_id, pkg_ids[0], t3_1))
    cur.execute("UPDATE contacts SET spa_wallet_balance = 650000, points = 500 WHERE id = ?", (c3_id,))
    print(f"-> Khách 3: Lê Văn Cường (0911000003) - Số dư ví: 650.000 đ (Mới nạp, nguyên vẹn)")

    # Khách 4: Phạm Thị Dung (id=9) - Số dư: 100.000 đ (Ví sắp hết, để test split payment)
    c4_id = 9
    cur.execute("DELETE FROM spa_wallet_transactions WHERE contact_id = ?", (c4_id,))
    t4_1 = (now - timedelta(days=7)).strftime("%Y-%m-%d %H:%M:%S")
    t4_2 = (now - timedelta(days=5)).strftime("%Y-%m-%d %H:%M:%S")
    t4_3 = (now - timedelta(days=1)).strftime("%Y-%m-%d %H:%M:%S")
    cur.execute("""
        INSERT INTO spa_wallet_transactions (contact_id, package_id, type, amount, balance_before, balance_after, note, created_at)
        VALUES (?, ?, 'topup', 650000, 0, 650000, 'Nạp ví Spa Khởi Động (500k -> 650k)', ?)
    """, (c4_id, pkg_ids[0], t4_1))
    cur.execute("""
        INSERT INTO spa_wallet_transactions (contact_id, package_id, type, amount, balance_before, balance_after, note, created_at)
        VALUES (?, NULL, 'spend', 300000, 650000, 350000, 'Thanh toán dịch vụ: Tắm sấy vệ sinh Mèo Anh lông ngắn', ?)
    """, (c4_id, t4_2))
    cur.execute("""
        INSERT INTO spa_wallet_transactions (contact_id, package_id, type, amount, balance_before, balance_after, note, created_at)
        VALUES (?, NULL, 'spend', 250000, 350000, 100000, 'Thanh toán dịch vụ: Cắt tỉa vệ sinh bàn chân + móng', ?)
    """, (c4_id, t4_3))
    cur.execute("UPDATE contacts SET spa_wallet_balance = 100000, points = 500 WHERE id = ?", (c4_id,))
    print(f"-> Khách 4: Phạm Thị Dung (0911000004) - Số dư ví: 100.000 đ (Test thanh toán bù tiền)")

    # Khách 5: Hoàng Văn Em (id=10) - Số dư: 0 đ (Khách mới tinh, test nạp tại quầy)
    c5_id = 10
    cur.execute("DELETE FROM spa_wallet_transactions WHERE contact_id = ?", (c5_id,))
    cur.execute("UPDATE contacts SET spa_wallet_balance = 0, points = 0 WHERE id = ?", (c5_id,))
    print(f"-> Khách 5: Hoàng Văn Em (0911000005) - Số dư ví: 0 đ (Test nạp mới tại quầy POS)")

    con.commit()
    con.close()
    print("\n✅ HOÀN THÀNH SEED DỮ LIỆU TEST VÍ SPA!")

if __name__ == '__main__':
    seed_spa_wallet()
