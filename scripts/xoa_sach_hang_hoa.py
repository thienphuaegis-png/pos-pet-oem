import sys
import os
import sqlite3

# Thêm đường dẫn gốc để gọi database module nếu có
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from database import get_db

def clear_all_products():
    print("=========================================================")
    print("         CONG CU XOA SACH HANG HOA DE IMPORT LAI         ")
    print("=========================================================")
    
    conn = get_db()
    cur = conn.cursor()
    
    # 1. Kiểm tra số lượng sản phẩm hiện tại
    cur.execute("SELECT COUNT(*) FROM products")
    total_products = cur.fetchone()[0]
    print(f"[*] Tong so hang hoa hien tai trong database: {total_products}")
    
    if total_products == 0:
        print("[!] Danh muc hang hoa da trong san. Khong can xoa!")
        conn.close()
        return

    # 2. Xóa sạch các bảng liên quan đến sản phẩm
    print("[*] Dang xoa du lieu lien quan (ton kho, bom, don vi quy doi, ncc)...")
    cur.execute("DELETE FROM item_units WHERE item_type = 'product'")
    cur.execute("DELETE FROM supplier_items WHERE item_type = 'product'")
    cur.execute("DELETE FROM product_inventory")
    cur.execute("DELETE FROM product_bom")
    cur.execute("DELETE FROM inventory_logs WHERE product_id IS NOT NULL")
    
    # Dọn các bảng liên quan nếu có
    try:
        cur.execute("DELETE FROM combo_items")
    except Exception:
        pass
    try:
        cur.execute("DELETE FROM combos")
    except Exception:
        pass

    # 3. Xóa toàn bộ sản phẩm
    print("[*] Dang xoa toan bo danh muc products...")
    cur.execute("DELETE FROM products")
    
    # Reset sequence autoincrement nếu có
    try:
        cur.execute("DELETE FROM sqlite_sequence WHERE name IN ('products', 'product_inventory', 'item_units')")
    except Exception:
        pass

    conn.commit()
    conn.close()
    
    print("=========================================================")
    print(" -> DA XOA SACH TOAN BO HANG HOA THANH CONG!")
    print(" -> Ban da co the vao giao dien POS de Import file Excel moi.")
    print("=========================================================")

if __name__ == "__main__":
    clear_all_products()
