# -*- coding: utf-8 -*-
"""Seed du lieu mau: nhan vien spa + phieu dich vu spa (pet_service_tickets).
Chay: ./.venv/Scripts/python.exe scripts/seed_spa_tickets.py
"""
import sqlite3
import datetime
import sys
import os

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from database import get_db_path


def seed():
    conn = sqlite3.connect(get_db_path())
    cur = conn.cursor()

    print("--- 1. NHAN VIEN SPA (spa_staff) ---")
    staff_list = [
        ("NV01", "Nguyen Thi Huong", "0912111222", "groomer"),
        ("NV02", "Tran Van Phuc", "0912222333", "groomer"),
        ("NV03", "Le Thi Kim Anh", "0912333444", "receptionist"),
        ("NV04", "Pham Van Tuan", "0912444555", "groomer"),
    ]
    staff_ids = {}
    for code, name, phone, role in staff_list:
        cur.execute(
            "INSERT INTO spa_staff (staff_code, name, phone, role) VALUES (?, ?, ?, ?)",
            (code, name, phone, role),
        )
        staff_ids[code] = cur.lastrowid
    print(f"  {len(staff_list)} nhan vien")

    print("--- 2. PHIEU DICH VU SPA (pet_service_tickets) ---")
    cur.execute("SELECT id, customer_id, name, weight FROM pets")
    pets = cur.fetchall()  # [(pet_id, customer_id, name, weight), ...]

    today = datetime.date.today()
    tickets = [
        # (pet_idx, service_type, price, status, days_ago, has_transport, payment_status)
        (0, "Tam + Cat Tia Long", 150000, "completed", 6, 0, "paid"),
        (1, "Goi Spa Full (Tam+Cat+VS)", 350000, "completed", 5, 1, "paid"),
        (2, "Tam Cho Meo Nho", 80000, "completed", 4, 0, "paid"),
        (3, "Cat Mong + Ve Sinh Tai", 60000, "completed", 3, 0, "paid"),
        (4, "Goi Spa Full (Tam+Cat+VS)", 350000, "completed", 2, 0, "paid"),
        (5, "Tam Cho Meo Nho", 100000, "in_progress", 0, 0, "unpaid"),
        (0, "Tri Ve Rung", 60000, "pending", 0, 1, "unpaid"),
    ]
    workers = ["NV01", "NV02", "NV04"]
    for i, (pet_idx, service, price, status, days_ago, transport, pay_status) in enumerate(tickets):
        pet_id, cust_id, pet_name, weight = pets[pet_idx]
        ticket_date = (today - datetime.timedelta(days=days_ago)).strftime("%Y-%m-%d")
        appt_time = f"{ticket_date} {9 + i % 8}:00:00"
        code = f"SV{ticket_date.replace('-', '')}{i+1:02d}"
        worker_id = staff_ids[workers[i % len(workers)]]
        cur.execute(
            """
            INSERT INTO pet_service_tickets (
                code, customer_id, pet_id, service_type, appointment_time,
                has_transport, price, status, ticket_date, weight_at_service,
                payment_status, staff_worker_1, created_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                code, cust_id, pet_id, service, appt_time,
                transport, price, status, ticket_date, weight,
                pay_status, worker_id, appt_time,
            ),
        )
    print(f"  {len(tickets)} phieu dich vu spa")

    conn.commit()
    conn.close()
    print("DA HOAN TAT SEED DU LIEU SPA TICKETS!")


if __name__ == "__main__":
    seed()
