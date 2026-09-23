# -*- coding: utf-8 -*-
"""Seed lai bang gia dich vu spa dung ten hien dropdown UI (svc-primary-package,
svc-dye-package trong templates/index.html), de auto-tinh gia theo can nang hoat dong.
Xoa sach pet_service_pricing cu (ten khong dau, khong khop UI) va them lai dung ten.
Chay: ./.venv/Scripts/python.exe scripts/seed_pricing_ui_match.py
"""
import sqlite3
import sys
import os

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from database import get_db_path


# Ten phai khop CHINH XAC voi <option value="..."> trong templates/index.html
PRIMARY_PACKAGES = [
    # (service_name, min_weight, max_weight, price)
    ("Tắm", 0, 5, 80000),
    ("Tắm", 5, 10, 100000),
    ("Tắm", 10, 20, 150000),
    ("Tắm", 20, 35, 200000),
    ("Cạo", 0, 10, 100000),
    ("Cạo", 10, 25, 150000),
    ("Cạo", 25, 35, 200000),
    ("VIP 2: Combo tắm vệ sinh", 0, 10, 250000),
    ("VIP 2: Combo tắm vệ sinh", 10, 25, 350000),
    ("VIP 3: Combo Cạo", 0, 10, 300000),
    ("VIP 3: Combo Cạo", 10, 25, 400000),
    ("Super VIP: Combo Cắt tỉa", 0, 10, 350000),
    ("Super VIP: Combo Cắt tỉa", 10, 25, 450000),
    ("Spa Mèo", 0, 35, 120000),
    ("Cắt", 0, 10, 120000),
    ("Cắt", 10, 25, 180000),
    ("Gỡ rối", 0, 35, 60000),
]

DYE_PACKAGES = [
    ("Nhuộm: 2 Tai", 0, 35, 60000),
    ("Nhuộm: 2 Tai + Đuôi", 0, 35, 90000),
    ("Nhuộm: 2 Tai + 4 Chân", 0, 35, 100000),
    ("Nhuộm: 2 Tai + Đuôi + 4 Chân", 0, 35, 130000),
    ("Nhuộm: 4 Chân", 0, 35, 70000),
]


def seed():
    conn = sqlite3.connect(get_db_path())
    cur = conn.cursor()

    cur.execute("DELETE FROM pet_service_pricing")
    rows = PRIMARY_PACKAGES + DYE_PACKAGES
    for name, min_w, max_w, price in rows:
        cur.execute(
            "INSERT INTO pet_service_pricing (service_name, min_weight, max_weight, price) "
            "VALUES (?, ?, ?, ?)",
            (name, min_w, max_w, price),
        )
    conn.commit()

    cur.execute("SELECT COUNT(*) FROM pet_service_pricing")
    n = cur.fetchone()[0]
    conn.close()
    print(f"Da seed lai {n} dong gia, ten khop dropdown UI.")


if __name__ == "__main__":
    seed()
