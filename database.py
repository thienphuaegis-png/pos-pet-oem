import sqlite3
import os
import sys

def get_db_path():
    # Neu chay bang pyinstaller exe: luu pos.db ben canh file .exe
    if getattr(sys, 'frozen', False):
        base_dir = os.path.dirname(sys.executable)
    else:
        base_dir = os.path.dirname(os.path.abspath(__file__))
    data_dir = os.path.join(base_dir, "data")
    os.makedirs(data_dir, exist_ok=True)
    return os.path.join(data_dir, "pos.db")

def get_db():
    conn = sqlite3.connect(get_db_path(), check_same_thread=False)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON")
    return conn

def init_db():
    conn = get_db()
    cur = conn.cursor()
    
    # 1. Nhan vien & Phan quyen
    cur.execute('''
    CREATE TABLE IF NOT EXISTS staff (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        phone TEXT,
        role TEXT DEFAULT 'staff', -- admin, cashier, staff
        commission_rate REAL DEFAULT 0, -- % hoa hong mac dinh
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )''')

    # 2. Khach hang & Nha cung cap
    cur.execute('''
    CREATE TABLE IF NOT EXISTS contacts (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        type TEXT NOT NULL, -- customer, supplier
        name TEXT NOT NULL,
        phone TEXT,
        address TEXT,
        debt REAL DEFAULT 0, -- Cong no hien tai
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )''')

    # 3. Danh muc san pham / dich vu / nguyen lieu
    cur.execute('''
    CREATE TABLE IF NOT EXISTS products (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        code TEXT UNIQUE,
        name TEXT NOT NULL,
        type TEXT NOT NULL, -- product (hang hoa), service (dich vu), material (nguyen lieu)
        cost_price REAL DEFAULT 0, -- Gia von
        sell_price REAL DEFAULT 0, -- Gia ban
        stock REAL DEFAULT 0, -- Ton kho
        unit TEXT DEFAULT 'cái',
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )''')

    # 3.1. Module Cost: Nguyen lieu & Dich vu thanh phan (ingredients)
    cur.execute('''
    CREATE TABLE IF NOT EXISTS ingredients (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        code TEXT UNIQUE,
        name TEXT NOT NULL,
        unit TEXT DEFAULT 'cái',
        type TEXT NOT NULL CHECK(type IN ('IS_PHYSICAL', 'SERVICE')),
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )''')

    # 3.2. Module Cost: Kho hang (warehouses)
    cur.execute('''
    CREATE TABLE IF NOT EXISTS warehouses (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        code TEXT UNIQUE,
        name TEXT NOT NULL,
        address TEXT,
        is_active INTEGER DEFAULT 1,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )''')

    # 3.3. Module Cost: Ton kho nguyen lieu theo kho (chi luu IS_PHYSICAL)
    cur.execute('''
    CREATE TABLE IF NOT EXISTS inventory (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        warehouse_id INTEGER NOT NULL,
        ingredient_id INTEGER NOT NULL,
        quantity REAL DEFAULT 0,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (warehouse_id) REFERENCES warehouses(id) ON DELETE CASCADE,
        FOREIGN KEY (ingredient_id) REFERENCES ingredients(id) ON DELETE CASCADE,
        UNIQUE(warehouse_id, ingredient_id)
    )''')

    # 3.4. Module Cost: Lich su gia nhap theo NCC
    cur.execute('''
    CREATE TABLE IF NOT EXISTS price_history (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        ingredient_id INTEGER NOT NULL,
        supplier_id INTEGER,
        purchase_price REAL NOT NULL,
        effective_date DATETIME DEFAULT CURRENT_TIMESTAMP,
        note TEXT,
        FOREIGN KEY (ingredient_id) REFERENCES ingredients(id) ON DELETE CASCADE,
        FOREIGN KEY (supplier_id) REFERENCES contacts(id) ON DELETE SET NULL
    )''')

    # 3.5. Module Cost: Dinh luong BOM san pham theo ingredients
    cur.execute('''
    CREATE TABLE IF NOT EXISTS product_bom (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        product_id INTEGER NOT NULL,
        ingredient_id INTEGER NOT NULL,
        quantity REAL NOT NULL,
        FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE,
        FOREIGN KEY (ingredient_id) REFERENCES ingredients(id) ON DELETE RESTRICT,
        UNIQUE(product_id, ingredient_id)
    )''')

    cur.execute('CREATE INDEX IF NOT EXISTS idx_inventory_lookup ON inventory(warehouse_id, ingredient_id)')
    cur.execute('CREATE INDEX IF NOT EXISTS idx_price_history_latest ON price_history(ingredient_id, effective_date DESC)')
    cur.execute('CREATE INDEX IF NOT EXISTS idx_bom_product ON product_bom(product_id)')

    # Kho mac dinh ban dau neu chua co
    cur.execute("INSERT OR IGNORE INTO warehouses (id, code, name, address) VALUES (1, 'KHO-TONG', 'Kho Tổng Mặc Định', 'Tại cửa hàng')")

    # 4. Dinh luong san xuat (BOM - Bill of Materials)
    cur.execute('''
    CREATE TABLE IF NOT EXISTS bom (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        product_id INTEGER NOT NULL, -- Thanh pham
        material_id INTEGER NOT NULL, -- Nguyen lieu
        quantity REAL NOT NULL, -- So luong can de lam 1 thanh pham
        FOREIGN KEY(product_id) REFERENCES products(id),
        FOREIGN KEY(material_id) REFERENCES products(id)
    )''')

    # 5. Hoa don ban hang
    cur.execute('''
    CREATE TABLE IF NOT EXISTS orders (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        code TEXT UNIQUE,
        customer_id INTEGER,
        staff_id INTEGER, -- Nguoi ban
        total_amount REAL NOT NULL,
        discount REAL DEFAULT 0,
        final_amount REAL NOT NULL,
        paid_amount REAL NOT NULL, -- Khach tra
        debt_amount REAL DEFAULT 0, -- Con no
        commission_amount REAL DEFAULT 0, -- Hoa hong tinh cho staff
        note TEXT,
        status TEXT DEFAULT 'completed',
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY(customer_id) REFERENCES contacts(id),
        FOREIGN KEY(staff_id) REFERENCES staff(id)
    )''')

    # Chi tiet don hang
    cur.execute('''
    CREATE TABLE IF NOT EXISTS order_items (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        order_id INTEGER NOT NULL,
        product_id INTEGER NOT NULL,
        quantity REAL NOT NULL,
        price REAL NOT NULL,
        subtotal REAL NOT NULL,
        FOREIGN KEY(order_id) REFERENCES orders(id),
        FOREIGN KEY(product_id) REFERENCES products(id)
    )''')

    # 6. Nhap hang
    cur.execute('''
    CREATE TABLE IF NOT EXISTS purchases (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        code TEXT UNIQUE,
        supplier_id INTEGER,
        total_amount REAL NOT NULL,
        paid_amount REAL NOT NULL,
        debt_amount REAL DEFAULT 0,
        note TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY(supplier_id) REFERENCES contacts(id)
    )''')

    cur.execute('''
    CREATE TABLE IF NOT EXISTS purchase_items (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        purchase_id INTEGER NOT NULL,
        product_id INTEGER NOT NULL,
        quantity REAL NOT NULL,
        cost_price REAL NOT NULL,
        subtotal REAL NOT NULL,
        FOREIGN KEY(purchase_id) REFERENCES purchases(id),
        FOREIGN KEY(product_id) REFERENCES products(id)
    )''')

    # 7. Lenh san xuat
    cur.execute('''
    CREATE TABLE IF NOT EXISTS productions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        code TEXT UNIQUE,
        product_id INTEGER NOT NULL, -- Thanh pham muon san xuat
        quantity REAL NOT NULL,
        note TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY(product_id) REFERENCES products(id)
    )''')

    # 8. So quy (Thu / Chi)
    cur.execute('''
    CREATE TABLE IF NOT EXISTS cashbook (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        code TEXT UNIQUE,
        type TEXT NOT NULL, -- in (Thu), out (Chi)
        category TEXT NOT NULL, -- Thu tien ban hang, Chi nhap hang, Chi phi van hanh...
        amount REAL NOT NULL,
        contact_id INTEGER,
        ref_type TEXT, -- order, purchase, manual
        ref_id INTEGER,
        note TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )''')

    # 9. Cau hinh & Mau in tuy chinh
    cur.execute('''
    CREATE TABLE IF NOT EXISTS settings (
        key TEXT PRIMARY KEY,
        value TEXT
    )''')

    # Template K80 mac dinh
    default_template = '''
<div style="font-family: monospace; width: 72mm; margin: 0 auto; padding: 5px; font-size: 12px; line-height: 1.4; color: #000;">
    <div style="text-align: center; margin-bottom: 10px;">
        <h2 style="margin: 0; font-size: 16px; font-weight: bold;">{{ten_cua_hang}}</h2>
        <p style="margin: 2px 0;">Đ/C: {{dia_chi}}</p>
        <p style="margin: 2px 0;">SĐT: {{so_dien_thoai}}</p>
        <h3 style="margin: 8px 0 3px 0; font-size: 14px; text-transform: uppercase;">HÓA ĐƠN BÁN HÀNG</h3>
        <p style="margin: 0; font-size: 11px;">Mã ĐH: {{ma_hoa_don}}</p>
        <p style="margin: 0; font-size: 11px;">Ngày: {{ngay_gio}}</p>
    </div>
    
    <div style="border-top: 1px dashed #000; border-bottom: 1px dashed #000; padding: 4px 0; margin-bottom: 6px; font-size: 11px;">
        <div>Thu ngân: {{thu_ngan}}</div>
        <div>Khách hàng: {{ten_khach}} ({{sdt_khach}})</div>
    </div>

    <table style="width: 100%; border-collapse: collapse; font-size: 11px; margin-bottom: 8px;">
        <thead>
            <tr style="border-bottom: 1px dashed #000;">
                <th style="text-align: left; padding: 2px 0;">Tên món</th>
                <th style="text-align: center; width: 25px;">SL</th>
                <th style="text-align: right; width: 55px;">Đ.Giá</th>
                <th style="text-align: right; width: 60px;">T.Tiền</th>
            </tr>
        </thead>
        <tbody>
            {{#danh_sach_hang}}
            <tr>
                <td style="padding: 3px 0;" colspan="4">
                    <strong>{{ten_hang}}</strong>
                </td>
            </tr>
            <tr style="border-bottom: 0.5px dotted #ccc;">
                <td></td>
                <td style="text-align: center;">{{so_luong}}</td>
                <td style="text-align: right;">{{don_gia}}</td>
                <td style="text-align: right;">{{thanh_tien}}</td>
            </tr>
            {{/danh_sach_hang}}
        </tbody>
    </table>

    <div style="border-top: 1px dashed #000; padding-top: 5px; font-size: 11px;">
        <div style="display: flex; justify-content: space-between;">
            <span>Tổng tiền hàng:</span>
            <span>{{tong_tien}}</span>
        </div>
        <div style="display: flex; justify-content: space-between;">
            <span>Chiết khấu:</span>
            <span>{{giam_gia}}</span>
        </div>
        <div style="display: flex; justify-content: space-between; font-weight: bold; font-size: 13px; margin: 3px 0;">
            <span>KHÁCH PHẢI TRẢ:</span>
            <span>{{phai_tra}}</span>
        </div>
        <div style="display: flex; justify-content: space-between;">
            <span>Tiền khách đưa:</span>
            <span>{{khach_tra}}</span>
        </div>
        <div style="display: flex; justify-content: space-between;">
            <span>Tiền thừa / Nợ:</span>
            <span>{{con_no}}</span>
        </div>
    </div>

    <div style="text-align: center; margin-top: 15px; border-top: 1px dashed #000; padding-top: 8px; font-size: 11px;">
        <p style="margin: 0; font-style: italic;">{{loi_cam_on}}</p>
        <p style="margin: 2px 0; font-size: 10px;">(Hóa đơn xuất từ POS Offline)</p>
    </div>
</div>
'''.strip()

    default_blocks_config = '''
{
  "width": "72mm",
  "border_style": "dashed",
  "header_blocks": [
    {"id": "logo", "name": "Logo cửa hàng", "enabled": true, "align": "center", "size": "max-h-12"},
    {"id": "shop_name", "name": "Tên cửa hàng", "enabled": true, "align": "center", "size": "16px", "bold": true},
    {"id": "shop_address", "name": "Địa chỉ", "enabled": true, "align": "center", "size": "11px", "bold": false},
    {"id": "shop_phone", "name": "Số điện thoại", "enabled": true, "align": "center", "size": "11px", "bold": false},
    {"id": "title", "name": "Tiêu đề (HÓA ĐƠN BÁN HÀNG)", "enabled": true, "align": "center", "size": "14px", "bold": true},
    {"id": "order_code", "name": "Mã hóa đơn", "enabled": true, "align": "center", "size": "11px", "bold": false},
    {"id": "datetime", "name": "Ngày lập đơn", "enabled": true, "align": "center", "size": "11px", "bold": false},
    {"id": "staff", "name": "Thu ngân bán hàng", "enabled": true, "align": "left", "size": "11px", "bold": false},
    {"id": "customer", "name": "Tên khách hàng", "enabled": true, "align": "left", "size": "11px", "bold": false},
    {"id": "customer_phone", "name": "SĐT khách hàng", "enabled": false, "align": "left", "size": "11px", "bold": false}
  ],
  "table_columns": {
    "product_name": true,
    "quantity": true,
    "price": true,
    "subtotal": true
  },
  "summary_blocks": [
    {"id": "total", "name": "Tổng tiền hàng", "enabled": true, "bold": false},
    {"id": "discount", "name": "Giảm giá", "enabled": true, "bold": false},
    {"id": "final", "name": "Khách phải trả", "enabled": true, "bold": true, "size": "13px"},
    {"id": "paid", "name": "Tiền khách đưa", "enabled": true, "bold": false},
    {"id": "debt", "name": "Tiền thừa / Nợ lại", "enabled": true, "bold": false}
  ],
  "footer_blocks": [
    {"id": "qr", "name": "Mã QR thanh toán", "enabled": true, "align": "center", "size": "140px"},
    {"id": "footer_msg", "name": "Lời cảm ơn chân trang", "enabled": true, "align": "center", "size": "11px", "italic": true}
  ]
}
'''.strip()

    cur.execute("INSERT OR IGNORE INTO settings (key, value) VALUES ('print_blocks_config', ?)", (default_blocks_config,))
    cur.execute("INSERT OR IGNORE INTO settings (key, value) VALUES ('print_template', ?)", (default_template,))

    cur.execute("INSERT OR IGNORE INTO settings (key, value) VALUES ('shop_name', 'CỬA HÀNG THỜI TRANG & DỊCH VỤ')")
    cur.execute("INSERT OR IGNORE INTO settings (key, value) VALUES ('shop_address', '123 Đường ABC, Quận 1, TP.HCM')")
    cur.execute("INSERT OR IGNORE INTO settings (key, value) VALUES ('shop_phone', '0909.123.456')")
    cur.execute("INSERT OR IGNORE INTO settings (key, value) VALUES ('shop_footer', 'Cảm ơn quý khách và hẹn gặp lại!')")
    cur.execute("INSERT OR IGNORE INTO settings (key, value) VALUES ('shop_bank_code', 'MB')")
    cur.execute("INSERT OR IGNORE INTO settings (key, value) VALUES ('shop_bank_account', '')")
    cur.execute("INSERT OR IGNORE INTO settings (key, value) VALUES ('shop_bank_owner', '')")
    cur.execute("INSERT OR IGNORE INTO settings (key, value) VALUES ('shop_qr_mode', 'vietqr')") # vietqr hoac static
    cur.execute("INSERT OR IGNORE INTO settings (key, value) VALUES ('shop_qr_image', '')") # base64
    cur.execute("INSERT OR IGNORE INTO settings (key, value) VALUES ('shop_logo', '')") # base64
    cur.execute("INSERT OR IGNORE INTO settings (key, value) VALUES ('print_width', '72mm')")
    cur.execute("INSERT OR IGNORE INTO settings (key, value) VALUES ('print_padding', '5px')")




    # Tao tai khoan mac dinh neu chua co
    cur.execute("SELECT COUNT(*) FROM staff")
    if cur.fetchone()[0] == 0:
        cur.execute("INSERT INTO staff (name, phone, role, commission_rate) VALUES ('Quản Lý', '0900000000', 'admin', 5.0)")
        cur.execute("INSERT INTO contacts (type, name, phone) VALUES ('customer', 'Khách lẻ', '')")
        # San pham mau
        cur.execute("INSERT INTO products (code, name, type, cost_price, sell_price, stock, unit) VALUES ('SP01', 'Áo Thun Basic', 'product', 50000, 120000, 50, 'cái')")
        cur.execute("INSERT INTO products (code, name, type, cost_price, sell_price, stock, unit) VALUES ('DV01', 'In logo theo yêu cầu', 'service', 0, 30000, 999, 'lần')")
        cur.execute("INSERT INTO products (code, name, type, cost_price, sell_price, stock, unit) VALUES ('NL01', 'Vải cotton trắng', 'material', 25000, 0, 100, 'mét')")
        cur.execute("INSERT INTO products (code, name, type, cost_price, sell_price, stock, unit) VALUES ('TP01', 'Áo thun tự sản xuất', 'product', 0, 150000, 0, 'cái')")
        # BOM: 1 Áo thun tự sản xuất cần 1.5 mét vải
        cur.execute("INSERT INTO bom (product_id, material_id, quantity) VALUES (4, 3, 1.5)")

    conn.commit()
    conn.close()

if __name__ == '__main__':
    init_db()
    print("DB initialized successfully at:", get_db_path())
