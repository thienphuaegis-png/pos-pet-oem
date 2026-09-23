# -*- coding: utf-8 -*-
"""Bo sung thu cung cho du 10 khach hang (moi khach >=1 thu cung).
Chay: ./.venv/Scripts/python.exe scripts/seed_more_pets.py
"""
import sqlite3
import sys
import os

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from database import get_db_path


def seed():
    conn = sqlite3.connect(get_db_path())
    cur = conn.cursor()

    # customer_id: 6..15 (10 khach da seed truoc). id 12,13,14,15 chua co thu cung.
    new_pets = [
        (12, "Lucky", "Cho", "Golden Retriever", "Vang", 22.0, ""),
        (13, "Kem", "Meo", "Anh Long", "Trang Kem", 3.0, ""),
        (14, "Mun", "Cho", "Pug", "Den", 8.5, "Bi di ung da nhe"),
        (15, "Bong", "Meo", "Ba Tu", "Trang", 4.2, ""),
        # them thu cung thu 2 cho vai khach da co san de test nhieu-thu-cung/1-khach
        (6, "Nau", "Cho", "Poodle Toy", "Nau", 2.5, ""),
        (9, "Kem", "Cho", "Phoc Soc", "Trang Vang", 3.8, ""),
    ]
    for cust_id, name, species, breed, color, weight, note in new_pets:
        cur.execute(
            "INSERT INTO pets (customer_id, name, species, breed, color, weight, note) "
            "VALUES (?, ?, ?, ?, ?, ?, ?)",
            (cust_id, name, species, breed, color, weight, note),
        )
    conn.commit()

    cur.execute("SELECT COUNT(DISTINCT customer_id) FROM pets")
    n_cust_with_pets = cur.fetchone()[0]
    cur.execute("SELECT COUNT(*) FROM pets")
    n_pets = cur.fetchone()[0]
    conn.close()
    print(f"Da them {len(new_pets)} thu cung. Tong: {n_pets} thu cung / {n_cust_with_pets} khach co thu cung.")


if __name__ == "__main__":
    seed()
