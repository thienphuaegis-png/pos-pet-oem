"""
Seed script for Pet Hotel rooms and sample bookings.
"""
import sqlite3
from database import get_db, init_db

def seed_hotel_rooms():
    init_db()
    with get_db() as conn:
        cursor = conn.cursor()
        
        # 16 buồng phòng chuẩn
        rooms = [
            # Khu Mèo (Phòng gỗ)
            ("C01", "Phòng Gỗ Mèo C01", "cat", 150000, "available", "Phòng gỗ thông thoáng, có trụ cào móng"),
            ("C02", "Phòng Gỗ Mèo C02", "cat", 150000, "available", "Phòng gỗ thông thoáng, có trụ cào móng"),
            ("C03", "Phòng Gỗ Mèo C03", "cat", 150000, "available", "Phòng gỗ thông thoáng, có võng nằm"),
            ("C04", "Phòng Gỗ Mèo C04", "cat", 150000, "available", "Phòng gỗ thông thoáng, có võng nằm"),
            ("C05", "Phòng Gỗ Mèo C05", "cat", 150000, "available", "Phòng đôi cho 2 bé mèo"),
            ("C06", "Phòng Gỗ Mèo C06", "cat", 150000, "available", "Phòng đôi cho 2 bé mèo"),
            ("C07", "Phòng Gỗ Mèo C07", "cat", 150000, "available", "Tầng 2 yên tĩnh cho bé nhát người"),
            ("C08", "Phòng Gỗ Mèo C08", "cat", 150000, "available", "Tầng 2 yên tĩnh cho bé nhát người"),
            
            # Khu Chó Nhỏ (Chuồng Inox K80)
            ("D01", "Chuồng Inox Chó D01", "dog_small", 180000, "available", "Dành cho cún < 7kg (Poodle, Phốc, Corgi)"),
            ("D02", "Chuồng Inox Chó D02", "dog_small", 180000, "available", "Dành cho cún < 7kg (Poodle, Phốc, Corgi)"),
            ("D03", "Chuồng Inox Chó D03", "dog_small", 180000, "available", "Dành cho cún < 7kg"),
            ("D04", "Chuồng Inox Chó D04", "dog_small", 180000, "available", "Dành cho cún < 7kg"),
            ("D05", "Chuồng Inox Chó D05", "dog_small", 220000, "available", "Dành cho cún trung bình 7 - 15kg"),
            ("D06", "Chuồng Inox Chó D06", "dog_small", 220000, "available", "Dành cho cún trung bình 7 - 15kg"),
            
            # Khu VIP (Phòng Máy Lạnh 24/24)
            ("V01", "Phòng VIP Tổng Thống 01", "vip", 300000, "available", "Điều hòa 24/24, camera riêng, đồ chơi"),
            ("V02", "Phòng VIP Tổng Thống 02", "vip", 300000, "available", "Điều hòa 24/24, camera riêng, đồ chơi")
        ]
        
        for code, name, zone, price, status, desc in rooms:
            cursor.execute("""
                INSERT OR IGNORE INTO hotel_rooms (code, name, zone, price_per_day, status, description)
                VALUES (?, ?, ?, ?, ?, ?)
            """, (code, name, zone, price, status, desc))
            
        conn.commit()
        print(f"Đã seed thành công các buồng phòng Hotel!")

if __name__ == "__main__":
    seed_hotel_rooms()
