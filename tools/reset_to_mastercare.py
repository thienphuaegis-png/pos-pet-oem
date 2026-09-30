"""
Script reset dữ liệu sạch về 0 và cấu hình thương hiệu Mastercare
"""
import sqlite3
import base64
import os
from PIL import Image

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DB_PATH = os.path.join(ROOT, "data", "pos.db")
LOGO_PATH = os.path.join(ROOT, "logo Mastercare.png")
ICON_PATH = os.path.join(ROOT, "app_icon.ico")

def run_reset():
    import sys
    sys.path.insert(0, ROOT)
    print(f"Connecting to {DB_PATH}...")
    conn = sqlite3.connect(DB_PATH)
    cur = conn.cursor()

    # Danh sách các bảng cấu hình giữ lại
    keep_tables = {'settings', 'staff'}

    # Lấy toàn bộ bảng dữ liệu
    cur.execute("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'")
    tables = [r[0] for r in cur.fetchall()]

    # Xóa sạch các bảng giao dịch, khách hàng, hàng hóa, dịch vụ
    for t in tables:
        if t not in keep_tables:
            try:
                cur.execute(f'DELETE FROM "{t}"')
                cur.execute(f'DELETE FROM sqlite_sequence WHERE name="{t}"')
                print(f"  - Cleared: {t}")
            except Exception as e:
                pass

    # Reset tài khoản staff về mặc định: admin / admin123
    from routers.auth import pwd_ctx
    cur.execute("DELETE FROM staff")
    cur.execute(
        "INSERT INTO staff (id, name, username, password_hash, role, is_active, commission_rate) VALUES (1, ?, ?, ?, ?, 1, 0.0)",
        ("Quản Lý", "admin", pwd_ctx.hash("admin123"), "owner")
    )
    print("  - Reset staff: admin / admin123 (quản lý cao nhất)")

    # Tạo khách hàng mặc định 'Khách lẻ'
    cur.execute("INSERT INTO contacts (id, type, name, phone) VALUES (1, 'customer', 'Khách lẻ', '')")
    print("  - Seed default contact: Khách lẻ")

    # Cập nhật logo và tên thương hiệu Mastercare
    if os.path.exists(LOGO_PATH):
        with open(LOGO_PATH, "rb") as f:
            b64 = "data:image/png;base64," + base64.b64encode(f.read()).decode("utf-8")
        cur.execute('UPDATE settings SET value = ? WHERE key = "shop_logo"', (b64,))
        cur.execute('UPDATE settings SET value = ? WHERE key = "shop_name"', ('MASTERCARE',))
        cur.execute('UPDATE settings SET value = ? WHERE key = "app_name"', ('Mastercare',))
        print("  - Updated branding: MASTERCARE & Logo Mastercare")

    # Tạo tài khoản thanh toán mặc định
    cur.execute("DELETE FROM payment_accounts")
    cur.execute("""
    INSERT INTO payment_accounts (code, name, account_type, owner_type, initial_balance, is_default)
    VALUES ('TM-POS', 'Két tiền mặt tại quầy POS', 'cash', 'COMPANY', 0, 1)
    """)
    cur.execute("""
    INSERT INTO payment_accounts (code, name, account_type, owner_type, bank_name, account_number, account_holder, initial_balance, is_default)
    VALUES ('BANK-CHINH', 'Tài khoản Ngân hàng', 'bank', 'COMPANY', 'Ngân hàng', '', 'MASTERCARE', 0, 0)
    """)

    conn.commit()
    conn.close()

    # Xuất app_icon.ico
    if os.path.exists(LOGO_PATH):
        img = Image.open(LOGO_PATH)
        img.save(ICON_PATH, format="ICO", sizes=[(16,16), (32,32), (48,48), (64,64), (128,128), (256,256)])
        print(f"  - Generated new {ICON_PATH} from Mastercare logo")

    print("\nDONE: Toàn bộ dữ liệu đã được làm sạch về 0 và thương hiệu Mastercare đã sẵn sàng!")

if __name__ == "__main__":
    run_reset()
