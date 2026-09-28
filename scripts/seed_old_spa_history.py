# -*- coding: utf-8 -*-
"""Seed lich su spa cu (10 lan, cac thang truoc) cho 1 thu cung de test popup lich su.
Chay: ./.venv/Scripts/python.exe scripts/seed_old_spa_history.py
"""
import sqlite3
import datetime
import sys
import os

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from database import get_db_path

PET_ID = 1          # Miu - khach Nguyen Van An (id=6)
CUSTOMER_ID = 6


def seed():
    conn = sqlite3.connect(get_db_path())
    cur = conn.cursor()

    today = datetime.date.today()
    # 10 lan spa cu, rai deu ~3 tuan/lan, lui ve qua cac thang truoc
    history = [
        ("Tắm", "", 80000, 21),
        ("Cắt", "", 120000, 42),
        ("Tắm", "Nhuộm: 2 Tai", 140000, 63),
        ("VIP 2: Combo tắm vệ sinh", "", 250000, 84),
        ("Tắm", "", 80000, 105),
        ("Gỡ rối", "", 60000, 126),
        ("Tắm", "", 80000, 147),
        ("Cạo", "", 100000, 168),
        ("Spa Mèo", "", 120000, 189),
        ("Tắm", "Nhuộm: 4 Chân", 150000, 210),
    ]

    for i, (service, dye, price, days_ago) in enumerate(history):
        ticket_date = (today - datetime.timedelta(days=days_ago)).strftime("%Y-%m-%d")
        code = f"SVOLD{ticket_date.replace('-', '')}{i+1:02d}"
        cur.execute(
            """
            INSERT INTO pet_service_tickets (
                code, customer_id, pet_id, service_type, dye_package, price, status,
                ticket_date, weight_at_service, payment_status, created_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                code, CUSTOMER_ID, PET_ID, service, dye, price, "completed",
                ticket_date, 3.2, "paid", ticket_date + " 09:00:00",
            ),
        )

    conn.commit()
    cur.execute("SELECT COUNT(*) FROM pet_service_tickets WHERE pet_id = ?", (PET_ID,))
    total = cur.fetchone()[0]
    conn.close()
    print(f"Da them {len(history)} phieu spa cu cho pet_id={PET_ID}. Tong so phieu cua be nay: {total}")


if __name__ == "__main__":
    seed()
