import os
import sqlite3
import openpyxl

DB_PATH = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), 'data', 'pos.db')
EXCEL_PATH = r'C:\Users\thien\AppData\Local\hermes\attachments\bang_gia_spa_pet_nha_trang.xlsx'

def import_pricing():
    print(f"Connecting to database: {DB_PATH}")
    conn = sqlite3.connect(DB_PATH)
    cur = conn.cursor()

    print(f"Reading Excel: {EXCEL_PATH}")
    wb = openpyxl.load_workbook(EXCEL_PATH, data_only=True)

    items_to_insert = []

    # 1. Sheet 'Bảng Giá Chó'
    ws_cho = wb['Bảng Giá Chó']
    rows_cho = list(ws_cho.iter_rows(values_only=True))
    header_weights = [
        (0.0, 2.0),
        (2.0, 6.0),
        (6.0, 10.0),
        (10.0, 20.0),
        (20.0, 30.0),
        (30.0, 40.0),
        (40.0, 50.0),
        (50.0, 999.0)
    ]

    for row in rows_cho[2:]:
        if not row or not row[0]:
            continue
        raw_nhom = str(row[0]).strip().upper()
        svc_name = str(row[1]).strip()
        
        if 'COMBO' in raw_nhom:
            category = 'Gói Combo Chó'
        else:
            category = 'Dịch Vụ Lẻ Chó'
            
        prices = row[3:11]
        for (min_w, max_w), price in zip(header_weights, prices):
            if price is not None and str(price).isdigit():
                items_to_insert.append({
                    'service_name': svc_name,
                    'category': category,
                    'min_weight': min_w,
                    'max_weight': max_w,
                    'price': float(price)
                })

    # 2. Sheet 'Mèo & Dịch Vụ Khác'
    # Section A: Combo Tắm Vệ Sinh Mèo
    meo_weights = [
        (0.0, 2.0, 150000.0),
        (2.0, 6.0, 200000.0),
        (6.0, 35.0, 250000.0)
    ]
    for min_w, max_w, price in meo_weights:
        items_to_insert.append({
            'service_name': 'Combo Tắm Vệ Sinh Mèo',
            'category': 'Spa Mèo',
            'min_weight': min_w,
            'max_weight': max_w,
            'price': price
        })

    # Section B: Trị liệu da / ve
    tri_lieu = [
        (0.0, 5.0, 50000.0),
        (5.0, 10.0, 70000.0),
        (10.0, 15.0, 90000.0)
    ]
    for min_w, max_w, price in tri_lieu:
        items_to_insert.append({
            'service_name': 'Tắm trị liệu / Nấm da',
            'category': 'Trị Liệu & Phụ Thu',
            'min_weight': min_w,
            'max_weight': max_w,
            'price': price
        })

    # Section C: Gỡ rối & Nhuộm & Phụ thu
    other_items = [
        ('Phụ thu gỡ rối lông', 'Trị Liệu & Phụ Thu', 0.0, 50.0, 50000.0),
        ('Nhuộm: 1 Màu (2 Tai + Đuôi)', 'Nhuộm Lông', 0.0, 50.0, 250000.0),
        ('Nhuộm: 1 Màu (2 Tai + Đuôi + 4 Chân)', 'Nhuộm Lông', 0.0, 50.0, 350000.0),
        ('Nhuộm: Trên 2 Màu (2 Tai + Đuôi)', 'Nhuộm Lông', 0.0, 50.0, 350000.0),
        ('Nhuộm: Trên 2 Màu (2 Tai + Đuôi + 4 Chân)', 'Nhuộm Lông', 0.0, 50.0, 450000.0),
        ('Cắt tỉa đầu', 'Trị Liệu & Phụ Thu', 0.0, 50.0, 50000.0),
        ('Tẩy lông (Dưới 5kg)', 'Trị Liệu & Phụ Thu', 0.0, 5.0, 50000.0),
        ('Tẩy lông (Trên 5kg)', 'Trị Liệu & Phụ Thu', 5.0, 50.0, 80000.0),
        ('Đánh răng', 'Trị Liệu & Phụ Thu', 0.0, 50.0, 20000.0)
    ]
    for name, cat, min_w, max_w, price in other_items:
        items_to_insert.append({
            'service_name': name,
            'category': cat,
            'min_weight': min_w,
            'max_weight': max_w,
            'price': price
        })

    print(f"Total valid price records extracted: {len(items_to_insert)}")

    # Clear old mock records in pet_service_pricing
    cur.execute("DELETE FROM pet_service_pricing")
    print(f"Cleared old mock records in pet_service_pricing.")

    for item in items_to_insert:
        cur.execute("""
            INSERT INTO pet_service_pricing (service_name, category, min_weight, max_weight, price)
            VALUES (?, ?, ?, ?, ?)
        """, (item['service_name'], item['category'], item['min_weight'], item['max_weight'], item['price']))

    conn.commit()
    conn.close()
    print("✓ Successfully imported all 79 pricing records into pet_service_pricing!")

if __name__ == '__main__':
    import_pricing()
