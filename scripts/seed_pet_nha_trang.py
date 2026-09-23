# -*- coding: utf-8 -*-
"""Seed du lieu mau cho Pet Nha Trang: NCC/KH, hang hoa, hoa don mua hang, dich vu spa.
Chay: ./.venv/Scripts/python.exe scripts/seed_pet_nha_trang.py
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

    print("--- 1. NHA CUNG CAP & KHACH HANG ---")
    suppliers = [
        ("Cty TNHH Thuc An Thu Cung Royal Canin VN", "0901111222", "Khu CN Tan Binh, TP.HCM"),
        ("Cong Ty CP Duoc & Vac-Xin Thu Y Marphavet", "0902222333", "Ha Noi"),
        ("Nha May Phu Kien Pet PetTech Nha Trang", "0903333444", "Nha Trang, Khanh Hoa"),
        ("Xuong My Pham Sua Tam Spa Bioline", "0905555666", "Dong Nai"),
        ("Cty TNHH Thiet Bi & Chuong Trai PetPro", "0906666777", "TP.HCM"),
    ]
    supplier_ids = []
    for name, phone, addr in suppliers:
        cur.execute(
            "INSERT INTO contacts (type, name, phone, address) VALUES ('supplier', ?, ?, ?)",
            (name, phone, addr),
        )
        supplier_ids.append(cur.lastrowid)

    customers = [
        ("Nguyen Van An", "0911000001", "12 Tran Phu, Nha Trang"),
        ("Tran Thi Bich", "0911000002", "45 Le Loi, Nha Trang"),
        ("Le Van Cuong", "0911000003", "8 Hung Vuong, Nha Trang"),
        ("Pham Thi Dung", "0911000004", "23 Nguyen Thien Thuat, Nha Trang"),
        ("Hoang Van Em", "0911000005", "67 To Hien Thanh, Nha Trang"),
        ("Vu Thi Giang", "0911000006", "15 Yersin, Nha Trang"),
        ("Dang Van Hai", "0911000007", "90 Le Thanh Ton, Nha Trang"),
        ("Bui Thi Kim", "0911000008", "31 Pasteur, Nha Trang"),
        ("Do Van Long", "0911000009", "5 Bach Dang, Nha Trang"),
        ("Ngo Thi Mai", "0911000010", "77 Nguyen Chanh, Nha Trang"),
    ]
    customer_ids = []
    for name, phone, addr in customers:
        cur.execute(
            "INSERT INTO contacts (type, name, phone, address) VALUES ('customer', ?, ?, ?)",
            (name, phone, addr),
        )
        customer_ids.append(cur.lastrowid)
    print(f"  {len(supplier_ids)} NCC, {len(customer_ids)} khach hang")

    print("--- 2. HANG HOA (products, type=product) ---")
    products = [
        ("SP01", "Hat Royal Canin 3kg", 250000, 350000, 40, "bao"),
        ("SP02", "Hat Royal Canin 7.5kg", 550000, 750000, 25, "bao"),
        ("SP03", "Pate Whiskas 400g", 20000, 32000, 100, "hop"),
        ("SP04", "Sua Tam Bioline 500ml", 60000, 95000, 50, "chai"),
        ("SP05", "Sua Tam Bioline khu mui 500ml", 65000, 100000, 40, "chai"),
        ("SP06", "Khay Cat Ve Sinh PetTech", 80000, 130000, 30, "cai"),
        ("SP07", "Cat Ve Sinh Loai 4L", 35000, 55000, 60, "tui"),
        ("SP08", "Vong Co Thu Cung", 25000, 45000, 35, "cai"),
        ("SP09", "Day Dat Thu Cung", 30000, 55000, 30, "cai"),
        ("SP10", "Long Chai Thuy Tinh 200ml", 15000, 25000, 45, "chai"),
        ("SP11", "Vitamin Tong Hop Cho Thu Cung", 90000, 140000, 20, "hop"),
        ("SP12", "Thuoc Xit Diet Bo Chet Ve", 70000, 110000, 25, "chai"),
        ("SP13", "Dem Nam Cho Meo/Cho", 120000, 190000, 15, "cai"),
        ("SP14", "Bat An Inox Doi", 40000, 65000, 25, "bo"),
        ("SP15", "Do Choi Bong Meo", 18000, 30000, 40, "cai"),
    ]
    product_ids = {}
    for code, name, cost, sell, stock, unit in products:
        cur.execute(
            "INSERT INTO products (code, name, type, cost_price, sell_price, stock, unit) "
            "VALUES (?, ?, 'product', ?, ?, ?, ?)",
            (code, name, cost, sell, stock, unit),
        )
        product_ids[code] = cur.lastrowid
    print(f"  {len(products)} hang hoa")

    print("--- 3. DICH VU SPA (pet_service_pricing) ---")
    services = [
        ("Tam Cho Meo Nho", "tam_ve_sinh", 0, 5, 80000),
        ("Tam Cho Meo Nho", "tam_ve_sinh", 5, 10, 100000),
        ("Tam Cho Meo Lon", "tam_ve_sinh", 10, 20, 150000),
        ("Tam Cho Meo Lon", "tam_ve_sinh", 20, 35, 200000),
        ("Cat Tia Long", "cat_tia", 0, 10, 120000),
        ("Cat Tia Long", "cat_tia", 10, 25, 180000),
        ("Cat Mong", "ve_sinh", 0, 35, 30000),
        ("Ve Sinh Tai", "ve_sinh", 0, 35, 30000),
        ("Nho Long Tai", "ve_sinh", 0, 35, 40000),
        ("Tri Ve Rung", "dieu_tri", 0, 35, 60000),
        ("Goi Spa Full (Tam+Cat+VS)", "combo", 0, 10, 250000),
        ("Goi Spa Full (Tam+Cat+VS)", "combo", 10, 25, 350000),
    ]
    for name, cat, mn, mx, price in services:
        cur.execute(
            "INSERT INTO pet_service_pricing (service_name, category, min_weight, max_weight, price) "
            "VALUES (?, ?, ?, ?, ?)",
            (name, cat, mn, mx, price),
        )
    print(f"  {len(services)} dong gia dich vu spa")

    print("--- 4. THU CUNG CUA KHACH (pets) ---")
    pets_data = [
        (customer_ids[0], "Miu", "Meo", "Anh Long", "Trang", 3.2),
        (customer_ids[1], "Lu", "Cho", "Poodle", "Nau", 4.5),
        (customer_ids[2], "Kitty", "Meo", "Munchkin", "Vang", 2.8),
        (customer_ids[3], "Ben", "Cho", "Corgi", "Vang Trang", 11.0),
        (customer_ids[4], "Milo", "Cho", "Phu Quoc", "Vang", 15.5),
        (customer_ids[5], "Mimi", "Meo", "Anh Long", "Xam", 3.5),
    ]
    for cust_id, name, species, breed, color, weight in pets_data:
        cur.execute(
            "INSERT INTO pets (customer_id, name, species, breed, color, weight) "
            "VALUES (?, ?, ?, ?, ?, ?)",
            (cust_id, name, species, breed, color, weight),
        )
    print(f"  {len(pets_data)} thu cung")

    print("--- 5. HOA DON MUA HANG (purchases + purchase_items) ---")
    warehouse_id = 1
    purchase_plan = [
        (supplier_ids[0], [("SP01", 20, 250000), ("SP02", 10, 550000)]),
        (supplier_ids[1], [("SP11", 15, 90000), ("SP12", 20, 70000)]),
        (supplier_ids[2], [("SP06", 20, 80000), ("SP14", 15, 40000)]),
        (supplier_ids[3], [("SP04", 30, 60000), ("SP05", 25, 65000)]),
        (supplier_ids[4], [("SP08", 20, 25000), ("SP09", 20, 30000), ("SP13", 10, 120000)]),
    ]
    now = datetime.datetime.now()
    for i, (sup_id, items) in enumerate(purchase_plan):
        subtotal = sum(qty * cost for _, qty, cost in items)
        created_at = (now - datetime.timedelta(days=(len(purchase_plan) - i) * 5)).strftime(
            "%Y-%m-%d %H:%M:%S"
        )
        code = f"PN{i+1:04d}"
        cur.execute(
            "INSERT INTO purchases (code, supplier_id, warehouse_id, subtotal_amount, discount, "
            "shipping_fee, other_fee, vat_rate, vat_amount, total_amount, paid_amount, debt_amount, "
            "status, fund_source, created_at) "
            "VALUES (?, ?, ?, ?, 0, 0, 0, 0, 0, ?, ?, 0, 'RECEIVED', 'COMPANY', ?)",
            (code, sup_id, warehouse_id, subtotal, subtotal, subtotal, created_at),
        )
        purchase_id = cur.lastrowid
        for prod_code, qty, cost in items:
            cur.execute(
                "INSERT INTO purchase_items (purchase_id, product_id, quantity, cost_price, subtotal, "
                "item_type, actual_quantity) VALUES (?, ?, ?, ?, ?, 'product', ?)",
                (purchase_id, product_ids[prod_code], qty, cost, qty * cost, qty),
            )
    print(f"  {len(purchase_plan)} hoa don mua hang")

    conn.commit()
    conn.close()
    print("DA HOAN TAT SEED DU LIEU MAU PET NHA TRANG!")


if __name__ == "__main__":
    seed()
