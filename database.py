import sqlite3
import os
import sys
import re
from collections.abc import Mapping

# Adapter for PostgreSQL (Supabase / Cloud)
class RowWrapper:
    def __init__(self, cols, values):
        self._cols = list(cols)
        self._values = list(values)
        self._col_map = {c.lower(): i for i, c in enumerate(cols)}

    def __getitem__(self, item):
        if isinstance(item, int):
            return self._values[item]
        if isinstance(item, str):
            idx = self._col_map.get(item.lower())
            if idx is not None:
                return self._values[idx]
            raise KeyError(item)
        raise TypeError(f"Invalid key type: {type(item)}")

    def get(self, key, default=None):
        if isinstance(key, str):
            idx = self._col_map.get(key.lower())
            if idx is not None:
                return self._values[idx]
        return default

    def keys(self):
        return self._cols

    def values(self):
        return self._values

    def items(self):
        return list(zip(self._cols, self._values))

    def __iter__(self):
        return iter(self._values)

    def __len__(self):
        return len(self._values)

    def __contains__(self, key):
        if isinstance(key, str):
            return key.lower() in self._col_map
        return key in self._values

    def __repr__(self):
        return f"<Row {dict(self.items())}>"

def translate_query(sql):
    s = sql.strip()
    if s.upper().startswith("PRAGMA"):
        return ""
    
    # 1. Replace ? with %s
    # Quick token replace (parameters in code don't mix literal ? in strings)
    s = re.sub(r'\?', '%s', s)

    # 2. INSERT OR IGNORE
    if re.search(r'INSERT\s+OR\s+IGNORE\s+INTO', s, re.IGNORECASE):
        s = re.sub(r'INSERT\s+OR\s+IGNORE\s+INTO', 'INSERT INTO', s, flags=re.IGNORECASE)
        if 'ON CONFLICT' not in s.upper():
            s = s + ' ON CONFLICT DO NOTHING'

    # 3. INSERT OR REPLACE INTO settings
    if re.search(r'INSERT\s+OR\s+REPLACE\s+INTO\s+settings', s, re.IGNORECASE):
        s = re.sub(r'INSERT\s+OR\s+REPLACE\s+INTO\s+settings', 'INSERT INTO settings', s, flags=re.IGNORECASE)
        if 'ON CONFLICT' not in s.upper():
            s = s + ' ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value'
    elif re.search(r'INSERT\s+OR\s+REPLACE\s+INTO', s, re.IGNORECASE):
        s = re.sub(r'INSERT\s+OR\s+REPLACE\s+INTO', 'INSERT INTO', s, flags=re.IGNORECASE)
        if 'ON CONFLICT' not in s.upper():
            s = s + ' ON CONFLICT DO NOTHING'

    # 4. datetime('now', ...)
    s = re.sub(r"datetime\('now',\s*'-?(\d+)\s*days?'\)", r"NOW() - INTERVAL '\1 days'", s, flags=re.IGNORECASE)
    s = re.sub(r"datetime\('now',\s*'-?(\d+)\s*minutes?'\)", r"NOW() - INTERVAL '\1 minutes'", s, flags=re.IGNORECASE)

    # 5. GROUP_CONCAT -> STRING_AGG
    s = re.sub(r'GROUP_CONCAT\s*\(\s*(DISTINCT\s+)?([^,\)]+),\s*([^\)]+)\)', r"STRING_AGG(\1\2::text, \3)", s, flags=re.IGNORECASE)
    s = re.sub(r'GROUP_CONCAT\s*\(\s*(DISTINCT\s+)?([^,\)]+)\)', r"STRING_AGG(\1\2::text, ', ')", s, flags=re.IGNORECASE)

    return s

class PGCursorWrapper:
    def __init__(self, cursor):
        self.cursor = cursor
        self.lastrowid = None
        self._cols = None

    @property
    def description(self):
        return self.cursor.description

    @property
    def rowcount(self):
        return self.cursor.rowcount

    def execute(self, sql, params=None):
        pg_sql = translate_query(sql)
        if not pg_sql:
            # PRAGMA no-op
            return self
        
        # Check if INSERT without RETURNING, append RETURNING id to capture lastrowid
        is_insert = pg_sql.strip().upper().startswith("INSERT INTO")
        appended_returning = False
        if is_insert and "RETURNING" not in pg_sql.upper():
            # Check table name
            m = re.search(r'INSERT\s+INTO\s+([a-zA-Z0-9_"]+)', pg_sql, re.IGNORECASE)
            tbl = m.group(1).replace('"', '').lower() if m else ""
            # Tables that have 'id' as PK
            non_id_tables = {"settings", "role_permissions", "staff_permissions", "draft_orders"}
            if tbl and tbl not in non_id_tables:
                pg_sql += " RETURNING id"
                appended_returning = True

        if params is None:
            self.cursor.execute(pg_sql)
        else:
            self.cursor.execute(pg_sql, params)

        if appended_returning:
            try:
                row = self.cursor.fetchone()
                if row:
                    self.lastrowid = row[0]
            except Exception:
                pass
            self._cols = None
        else:
            if self.cursor.description:
                self._cols = [d[0] for d in self.cursor.description]
            else:
                self._cols = None

        return self

    def executemany(self, sql, seq_of_params):
        pg_sql = translate_query(sql)
        if not pg_sql:
            return self
        self.cursor.executemany(pg_sql, seq_of_params)
        return self

    def fetchone(self):
        r = self.cursor.fetchone()
        if r is None:
            return None
        cols = self._cols or [d[0] for d in self.cursor.description]
        return RowWrapper(cols, r)

    def fetchall(self):
        rows = self.cursor.fetchall()
        if not rows:
            return []
        cols = self._cols or [d[0] for d in self.cursor.description]
        return [RowWrapper(cols, r) for r in rows]

    def fetchmany(self, size=None):
        rows = self.cursor.fetchmany(size) if size is not None else self.cursor.fetchmany()
        if not rows:
            return []
        cols = self._cols or [d[0] for d in self.cursor.description]
        return [RowWrapper(cols, r) for r in rows]

    def __iter__(self):
        for r in self.cursor:
            cols = self._cols or [d[0] for d in self.cursor.description]
            yield RowWrapper(cols, r)

    def close(self):
        try:
            self.cursor.close()
        except Exception:
            pass

class PGConnectionWrapper:
    def __init__(self, conn):
        self._conn = conn
        self.row_factory = None

    def cursor(self):
        return PGCursorWrapper(self._conn.cursor())

    def execute(self, sql, params=None):
        cur = self.cursor()
        cur.execute(sql, params)
        return cur

    def commit(self):
        self._conn.commit()

    def rollback(self):
        self._conn.rollback()

    def close(self):
        try:
            self._conn.close()
        except Exception:
            pass

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
    pg_url = os.environ.get("DATABASE_URL")
    if pg_url:
        import psycopg2
        # Clean url if needed and connect
        conn = psycopg2.connect(pg_url, connect_timeout=15)
        return PGConnectionWrapper(conn)

    conn = sqlite3.connect(get_db_path(), timeout=30.0, check_same_thread=False)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA journal_mode = WAL")
    conn.execute("PRAGMA busy_timeout = 30000")
    conn.execute("PRAGMA foreign_keys = ON")
    return conn

def init_db():
    if os.environ.get("DATABASE_URL"):
        # Running against Supabase PostgreSQL: schema is already managed and migrated
        return

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
        email TEXT,
        address TEXT,
        debt REAL DEFAULT 0, -- Cong no hien tai
        segment_id INTEGER,
        points INTEGER DEFAULT 0,
        spa_wallet_balance REAL DEFAULT 0,
        is_flagged INTEGER DEFAULT 0,
        warning_note TEXT DEFAULT '',
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )''')

    cur.execute("PRAGMA table_info(contacts)")
    contact_cols = [c[1] for c in cur.fetchall()]
    if 'is_flagged' not in contact_cols:
        cur.execute("ALTER TABLE contacts ADD COLUMN is_flagged INTEGER DEFAULT 0")
    if 'warning_note' not in contact_cols:
        cur.execute("ALTER TABLE contacts ADD COLUMN warning_note TEXT DEFAULT ''")

    # 3. Danh muc san pham / dich vu / nguyen lieu
    cur.execute('''
    CREATE TABLE IF NOT EXISTS product_categories (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL UNIQUE,
        description TEXT,
        sort_order INTEGER DEFAULT 0,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )''')

    cur.execute('''
    CREATE TABLE IF NOT EXISTS pet_service_categories (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL UNIQUE,
        description TEXT,
        sort_order INTEGER DEFAULT 0,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )''')

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
        category TEXT DEFAULT 'Khác',
        is_active INTEGER DEFAULT 1,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )''')

    cur.execute("PRAGMA table_info(products)")
    prod_cols = [c[1] for c in cur.fetchall()]
    if 'category' not in prod_cols:
        cur.execute("ALTER TABLE products ADD COLUMN category TEXT DEFAULT 'Khác'")

    # Seed product_categories if empty & migrate existing categories
    cur.execute("SELECT COUNT(*) FROM product_categories")
    if cur.fetchone()[0] == 0:
        default_categories = ['Thức ăn', 'Phụ kiện', 'Vệ sinh', 'Thuốc & Thú y', 'Khác']
        for idx, cat_name in enumerate(default_categories, start=1):
            cur.execute("INSERT OR IGNORE INTO product_categories (name, sort_order) VALUES (?, ?)", (cat_name, idx))
    
    cur.execute("SELECT DISTINCT category FROM products WHERE category IS NOT NULL AND category != ''")
    existing_cats = [r[0] for r in cur.fetchall()]
    for cat_name in existing_cats:
        cur.execute("INSERT OR IGNORE INTO product_categories (name) VALUES (?)", (cat_name,))

    # Seed pet_service_categories if empty & migrate existing categories
    cur.execute("SELECT COUNT(*) FROM pet_service_categories")
    if cur.fetchone()[0] == 0:
        default_spa_cats = ['Gói Combo Chó', 'Dịch Vụ Lẻ Chó', 'Spa Mèo', 'Nhuộm Lông', 'Trị Liệu & Phụ Thu']
        for idx, cat_name in enumerate(default_spa_cats, start=1):
            cur.execute("INSERT OR IGNORE INTO pet_service_categories (name, sort_order) VALUES (?, ?)", (cat_name, idx))

    # Đảm bảo nếu bảng pet_service_pricing đã có dữ liệu thì nạp vào pet_service_categories
    cur.execute("SELECT name FROM sqlite_master WHERE type='table' AND name='pet_service_pricing'")
    if cur.fetchone():
        cur.execute("SELECT DISTINCT category FROM pet_service_pricing WHERE category IS NOT NULL AND category != ''")
        for r in cur.fetchall():
            cur.execute("INSERT OR IGNORE INTO pet_service_categories (name) VALUES (?)", (r[0],))

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

    # 3.4.1. Module Cost: Nhat ky bien dong kho (Xuat ban bill nao, nhap kho NCC nao, vi tri kho, chuyen kho, kiem ke)
    cur.execute('''
    CREATE TABLE IF NOT EXISTS inventory_logs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        item_type TEXT DEFAULT 'ingredient', -- 'ingredient' hoac 'product'
        ingredient_id INTEGER,
        product_id INTEGER,
        warehouse_id INTEGER NOT NULL,
        change_type TEXT NOT NULL, -- 'SALE' (ban hang), 'PURCHASE' (nhap hang), 'ADJUST' (kiem kho/dieu chinh), 'TRANSFER_IN', 'TRANSFER_OUT'
        quantity REAL NOT NULL, -- delta (< 0 neu tru, > 0 neu cong)
        balance_after REAL DEFAULT 0, -- ton sau bien dong
        order_id INTEGER, -- bill nao neu co
        order_code TEXT, -- ma hoa don
        supplier_id INTEGER, -- NCC nao neu co
        note TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (ingredient_id) REFERENCES ingredients(id) ON DELETE CASCADE,
        FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE,
        FOREIGN KEY (warehouse_id) REFERENCES warehouses(id) ON DELETE CASCADE,
        FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE SET NULL,
        FOREIGN KEY (supplier_id) REFERENCES contacts(id) ON DELETE SET NULL
    )''')

    # Kiem tra neu bang inventory_logs cu thieu cot product_id thi tu dong migrate
    cur.execute("PRAGMA table_info(inventory_logs)")
    inv_cols = [c[1] for c in cur.fetchall()]
    if "product_id" not in inv_cols:
        cur.execute("PRAGMA foreign_keys = OFF")
        cur.execute('''
        CREATE TABLE inventory_logs_new (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            item_type TEXT DEFAULT 'ingredient',
            ingredient_id INTEGER,
            product_id INTEGER,
            warehouse_id INTEGER NOT NULL,
            change_type TEXT NOT NULL,
            quantity REAL NOT NULL,
            balance_after REAL DEFAULT 0,
            order_id INTEGER,
            order_code TEXT,
            supplier_id INTEGER,
            note TEXT,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (ingredient_id) REFERENCES ingredients(id) ON DELETE CASCADE,
            FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE,
            FOREIGN KEY (warehouse_id) REFERENCES warehouses(id) ON DELETE CASCADE,
            FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE SET NULL,
            FOREIGN KEY (supplier_id) REFERENCES contacts(id) ON DELETE SET NULL
        )''')
        cur.execute('''
        INSERT INTO inventory_logs_new (id, item_type, ingredient_id, warehouse_id, change_type, quantity, balance_after, order_id, order_code, supplier_id, note, created_at)
        SELECT id, 'ingredient', ingredient_id, warehouse_id, change_type, quantity, balance_after, order_id, order_code, supplier_id, note, created_at FROM inventory_logs
        ''')
        cur.execute("DROP TABLE inventory_logs")
        cur.execute("ALTER TABLE inventory_logs_new RENAME TO inventory_logs")
        cur.execute("PRAGMA foreign_keys = ON")

    cur.execute('CREATE INDEX IF NOT EXISTS idx_inv_logs_ing ON inventory_logs(ingredient_id, created_at DESC)')
    cur.execute('CREATE INDEX IF NOT EXISTS idx_inv_logs_prod ON inventory_logs(product_id, created_at DESC)')
    cur.execute('CREATE INDEX IF NOT EXISTS idx_inv_logs_order ON inventory_logs(order_code)')

    # 3.4.2. Ton kho hang hoa theo tung kho (product_inventory)
    cur.execute('''
    CREATE TABLE IF NOT EXISTS product_inventory (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        warehouse_id INTEGER NOT NULL,
        product_id INTEGER NOT NULL,
        quantity REAL DEFAULT 0,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (warehouse_id) REFERENCES warehouses(id) ON DELETE CASCADE,
        FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE,
        UNIQUE(warehouse_id, product_id)
    )''')
    cur.execute('CREATE INDEX IF NOT EXISTS idx_prod_inv ON product_inventory(warehouse_id, product_id)')

    # Dong bo ton kho san pham vao kho 1 neu chua co
    cur.execute("SELECT COUNT(*) FROM product_inventory")
    if cur.fetchone()[0] == 0:
        cur.execute('''
        INSERT OR IGNORE INTO product_inventory (warehouse_id, product_id, quantity)
        SELECT 1, id, stock FROM products WHERE type != 'service'
        ''')

    # 3.4.3. Chuyen kho noi bo (warehouse_transfers & warehouse_transfer_items)
    cur.execute('''
    CREATE TABLE IF NOT EXISTS warehouse_transfers (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        code TEXT UNIQUE,
        from_warehouse_id INTEGER NOT NULL,
        to_warehouse_id INTEGER NOT NULL,
        note TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (from_warehouse_id) REFERENCES warehouses(id),
        FOREIGN KEY (to_warehouse_id) REFERENCES warehouses(id)
    )''')

    cur.execute('''
    CREATE TABLE IF NOT EXISTS warehouse_transfer_items (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        transfer_id INTEGER NOT NULL,
        item_type TEXT NOT NULL, -- 'product' hoac 'ingredient'
        product_id INTEGER,
        ingredient_id INTEGER,
        item_name TEXT,
        unit TEXT,
        quantity REAL NOT NULL,
        FOREIGN KEY (transfer_id) REFERENCES warehouse_transfers(id) ON DELETE CASCADE
    )''')

    # 3.4.4. Kiem ke kho (stock_audits & stock_audit_items)
    cur.execute('''
    CREATE TABLE IF NOT EXISTS stock_audits (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        code TEXT UNIQUE,
        warehouse_id INTEGER NOT NULL,
        note TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (warehouse_id) REFERENCES warehouses(id)
    )''')

    cur.execute('''
    CREATE TABLE IF NOT EXISTS stock_audit_items (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        audit_id INTEGER NOT NULL,
        item_type TEXT NOT NULL, -- 'product' hoac 'ingredient'
        product_id INTEGER,
        ingredient_id INTEGER,
        item_name TEXT,
        unit TEXT,
        system_qty REAL NOT NULL,
        actual_qty REAL NOT NULL,
        diff_qty REAL NOT NULL,
        FOREIGN KEY (audit_id) REFERENCES stock_audits(id) ON DELETE CASCADE
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

    # Thanh toan tach nhieu hinh thuc cho 1 don hang (vd: mot phan tien mat + mot phan chuyen khoan)
    cur.execute('''
    CREATE TABLE IF NOT EXISTS order_payments (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        order_id INTEGER NOT NULL,
        method TEXT NOT NULL,
        amount REAL NOT NULL,
        account_id INTEGER,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY(order_id) REFERENCES orders(id)
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
        warehouse_id INTEGER DEFAULT 1,
        subtotal_amount REAL NOT NULL DEFAULT 0, -- Tien hang
        discount REAL DEFAULT 0, -- Chiet khau
        shipping_fee REAL DEFAULT 0, -- Phi van chuyen
        other_fee REAL DEFAULT 0, -- Chi phi khac
        vat_rate REAL DEFAULT 0, -- % VAT
        vat_amount REAL DEFAULT 0, -- Tien VAT
        total_amount REAL NOT NULL, -- Tong thanh toan
        paid_amount REAL NOT NULL, -- Da tra NCC
        debt_amount REAL DEFAULT 0, -- Con no NCC
        status TEXT DEFAULT 'pending', -- 'pending' (Cho nhan hang), 'received' (Da nhan & nhap kho), 'cancelled' (Da huy)
        expected_date DATE, -- Du kien ngay nhan hang
        received_date DATETIME, -- Ngay thuc te nhan hang
        note TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY(supplier_id) REFERENCES contacts(id),
        FOREIGN KEY(warehouse_id) REFERENCES warehouses(id)
    )''')

    # Migration them status, expected_date, received_date neu chua co
    cur.execute("PRAGMA table_info(purchases)")
    purchases_cols = [c[1] for c in cur.fetchall()]
    if 'status' not in purchases_cols:
        cur.execute("ALTER TABLE purchases ADD COLUMN status TEXT DEFAULT 'pending'")
    if 'expected_date' not in purchases_cols:
        cur.execute("ALTER TABLE purchases ADD COLUMN expected_date DATE")
    if 'received_date' not in purchases_cols:
        cur.execute("ALTER TABLE purchases ADD COLUMN received_date DATETIME")

    cur.execute('''
    CREATE TABLE IF NOT EXISTS purchase_items (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        purchase_id INTEGER NOT NULL,
        item_type TEXT DEFAULT 'product', -- 'product' hoac 'ingredient'
        product_id INTEGER, -- id trong bang products neu la product
        ingredient_id INTEGER, -- id trong bang ingredients neu la ingredient
        item_name TEXT,
        unit TEXT,
        quantity REAL NOT NULL,
        cost_price REAL NOT NULL,
        subtotal REAL NOT NULL,
        FOREIGN KEY(purchase_id) REFERENCES purchases(id) ON DELETE CASCADE
    )''')

    # 7. Lenh san xuat
    cur.execute('''
    CREATE TABLE IF NOT EXISTS productions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        code TEXT UNIQUE,
        warehouse_id INTEGER DEFAULT 1,
        total_cost REAL DEFAULT 0,
        status TEXT DEFAULT 'completed', -- 'completed'
        note TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY(warehouse_id) REFERENCES warehouses(id)
    )''')

    # Migration productions cols neu thieu
    cur.execute("PRAGMA table_info(products)")
    prod_table_cols = [c[1] for c in cur.fetchall()]
    if 'is_active' not in prod_table_cols:
        cur.execute("ALTER TABLE products ADD COLUMN is_active INTEGER DEFAULT 1")

    # Bang lien ket NCC <-> hang hoa/nguyen lieu (bi thieu CREATE TABLE, chi ton tai qua ALTER tren may da co san du lieu cu)
    cur.execute('''
    CREATE TABLE IF NOT EXISTS supplier_items (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        supplier_id INTEGER NOT NULL,
        item_type TEXT NOT NULL,
        product_id INTEGER,
        ingredient_id INTEGER,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        default_cost REAL DEFAULT 0,
        FOREIGN KEY(supplier_id) REFERENCES contacts(id) ON DELETE CASCADE,
        UNIQUE(supplier_id, item_type, product_id, ingredient_id)
    )''')

    cur.execute("PRAGMA table_info(supplier_items)")
    si_cols = [c[1] for c in cur.fetchall()]
    if 'default_cost' not in si_cols:
        cur.execute("ALTER TABLE supplier_items ADD COLUMN default_cost REAL DEFAULT 0")

    cur.execute("PRAGMA table_info(productions)")
    prod_cols = [c[1] for c in cur.fetchall()]
    if 'warehouse_id' not in prod_cols:
        cur.execute("ALTER TABLE productions ADD COLUMN warehouse_id INTEGER DEFAULT 1")
    if 'total_cost' not in prod_cols:
        cur.execute("ALTER TABLE productions ADD COLUMN total_cost REAL DEFAULT 0")
    if 'status' not in prod_cols:
        cur.execute("ALTER TABLE productions ADD COLUMN status TEXT DEFAULT 'completed'")

    cur.execute('''
    CREATE TABLE IF NOT EXISTS production_items (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        production_id INTEGER NOT NULL,
        product_id INTEGER NOT NULL,
        product_name TEXT,
        unit TEXT,
        quantity REAL NOT NULL,
        unit_cost REAL DEFAULT 0,
        total_cost REAL DEFAULT 0,
        FOREIGN KEY(production_id) REFERENCES productions(id) ON DELETE CASCADE,
        FOREIGN KEY(product_id) REFERENCES products(id)
    )''')

    cur.execute('''
    CREATE TABLE IF NOT EXISTS production_materials_consumed (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        production_id INTEGER NOT NULL,
        item_type TEXT DEFAULT 'ingredient', -- 'ingredient' | 'material'
        item_id INTEGER NOT NULL,
        item_name TEXT,
        unit TEXT,
        quantity_needed REAL NOT NULL,
        cost_price REAL DEFAULT 0,
        total_cost REAL DEFAULT 0,
        FOREIGN KEY(production_id) REFERENCES productions(id) ON DELETE CASCADE
    )''')

    # 7.5. Tai khoan thanh toan / Nguon quy
    cur.execute('''
    CREATE TABLE IF NOT EXISTS payment_accounts (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        code TEXT UNIQUE NOT NULL,
        name TEXT NOT NULL,
        account_type TEXT NOT NULL, -- cash, bank, ewallet
        owner_type TEXT DEFAULT 'COMPANY', -- COMPANY, PERSONAL
        bank_name TEXT,
        account_number TEXT,
        account_holder TEXT,
        initial_balance REAL DEFAULT 0,
        is_default INTEGER DEFAULT 0,
        is_active INTEGER DEFAULT 1,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
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
        account_id INTEGER REFERENCES payment_accounts(id),
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )''')

    # Migration for cashbook.account_id if table already existed
    cur.execute("PRAGMA table_info(cashbook)")
    cb_columns = [col[1] for col in cur.fetchall()]
    if 'account_id' not in cb_columns:
        cur.execute("ALTER TABLE cashbook ADD COLUMN account_id INTEGER REFERENCES payment_accounts(id)")

    # 9. Cau hinh & Mau in tuy chinh
    cur.execute('''
    CREATE TABLE IF NOT EXISTS settings (
        key TEXT PRIMARY KEY,
        value TEXT
    )''')

    # 9b. Phan quyen theo role (tick-box) - owner luon full quyen, khong luu trong bang nay
    cur.execute('''
    CREATE TABLE IF NOT EXISTS role_permissions (
        role TEXT NOT NULL,
        perm_key TEXT NOT NULL,
        allowed INTEGER NOT NULL DEFAULT 1,
        PRIMARY KEY (role, perm_key)
    )''')
    # Seed mac dinh = giu nguyen hanh vi cu (require_role cung truoc day)
    PERM_KEYS = ["pos.sell", "pos.edit_delete_order", "cashbook.manage", "purchases.manage",
                 "partners.manage", "price_lists.manage", "inventory.manage", "oem.manage",
                 "reports.view", "shifts.approve", "settings.access"]
    DEFAULT_ROLE_PERMS = {
        "cashier": {"pos.sell"},
        "accountant": {"cashbook.manage", "partners.manage", "reports.view", "shifts.approve", "pos.edit_delete_order"},
        "warehouse": {"purchases.manage", "inventory.manage"},
    }
    for role, perms in DEFAULT_ROLE_PERMS.items():
        for key in PERM_KEYS:
            cur.execute("INSERT OR IGNORE INTO role_permissions (role, perm_key, allowed) VALUES (?, ?, ?)",
                        (role, key, 1 if key in perms else 0))

    # 9c. Bat/tat module theo he thong (an tab cho MOI role khi tat)
    DEFAULT_MODULES = {"module_oem": "1", "module_pet_services": "1", "module_price_lists": "1"}
    for key, val in DEFAULT_MODULES.items():
        cur.execute("INSERT OR IGNORE INTO settings (key, value) VALUES (?, ?)", (key, val))

    # 9d. Chong brute-force dang nhap
    cur.execute('''
    CREATE TABLE IF NOT EXISTS login_attempts (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        username TEXT NOT NULL,
        ip TEXT,
        success INTEGER NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )''')
    cur.execute("CREATE INDEX IF NOT EXISTS idx_login_attempts_user_time ON login_attempts(username, created_at)")

    # 9d2. Quyen rieng theo TUNG nhan vien - override quyen mac dinh cua role (NULL = dung theo role)
    cur.execute('''
    CREATE TABLE IF NOT EXISTS staff_permissions (
        staff_id INTEGER NOT NULL,
        perm_key TEXT NOT NULL,
        allowed INTEGER NOT NULL,
        PRIMARY KEY (staff_id, perm_key),
        FOREIGN KEY(staff_id) REFERENCES staff(id) ON DELETE CASCADE
    )''')

    # 9d3. Log hoat dong: ghi lai thao tac cua tung account, giu 30 ngay
    cur.execute('''
    CREATE TABLE IF NOT EXISTS activity_log (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        staff_id INTEGER,
        staff_name TEXT,
        role TEXT,
        action TEXT NOT NULL,
        method TEXT,
        path TEXT,
        ip TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )''')
    cur.execute("CREATE INDEX IF NOT EXISTS idx_activity_log_staff_time ON activity_log(staff_id, created_at)")
    cur.execute("CREATE INDEX IF NOT EXISTS idx_activity_log_time ON activity_log(created_at)")

    # 9e. Luu giao dien hoa don dang go do (chong mat khi tat may / mat dien)
    cur.execute('''
    CREATE TABLE IF NOT EXISTS draft_orders (
        staff_id INTEGER PRIMARY KEY,
        data TEXT NOT NULL,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
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

    # 12. Combo sản phẩm (A + B = combo)
    cur.execute('''
    CREATE TABLE IF NOT EXISTS combos (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        code TEXT UNIQUE,
        name TEXT NOT NULL,
        sell_price REAL DEFAULT 0,
        discount_percent REAL DEFAULT 0,
        is_active INTEGER DEFAULT 1,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )''')

    cur.execute('''
    CREATE TABLE IF NOT EXISTS combo_items (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        combo_id INTEGER NOT NULL,
        product_id INTEGER NOT NULL,
        quantity REAL NOT NULL,
        price_at_time REAL DEFAULT 0,
        FOREIGN KEY(combo_id) REFERENCES combos(id) ON DELETE CASCADE,
        FOREIGN KEY(product_id) REFERENCES products(id) ON DELETE RESTRICT,
        UNIQUE(combo_id, product_id)
    )''')

    # 10. Bảng giá sản phẩm
    cur.execute('''
    CREATE TABLE IF NOT EXISTS price_lists (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        code TEXT UNIQUE,
        name TEXT NOT NULL,
        description TEXT DEFAULT '',
        is_active INTEGER DEFAULT 1,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )''')

    cur.execute('''
    CREATE TABLE IF NOT EXISTS product_price_list (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        product_id INTEGER NOT NULL,
        price_list_id INTEGER NOT NULL,
        price REAL NOT NULL DEFAULT 0,
        min_qty REAL DEFAULT 1,
        discount_percent REAL DEFAULT 0,
        FOREIGN KEY(product_id) REFERENCES products(id) ON DELETE CASCADE,
        FOREIGN KEY(price_list_id) REFERENCES price_lists(id) ON DELETE CASCADE,
        UNIQUE(product_id, price_list_id)
    )''')

    # 11. Phân loại khách hàng
    cur.execute('''
    CREATE TABLE IF NOT EXISTS customer_segments (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        code TEXT UNIQUE,
        name TEXT NOT NULL,
        discount_percent REAL DEFAULT 0,
        priority INTEGER DEFAULT 0,
        min_points INTEGER DEFAULT 0,
        allow_points INTEGER DEFAULT 1,
        price_list_id INTEGER DEFAULT NULL,
        is_active INTEGER DEFAULT 1,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )''')

    # Migration: thêm column segment_id, points, spa_wallet_balance vào contacts nếu chưa có
    cur.execute("PRAGMA table_info(contacts)")
    contact_cols = [c[1] for c in cur.fetchall()]
    if "segment_id" not in contact_cols:
        cur.execute("ALTER TABLE contacts ADD COLUMN segment_id INTEGER DEFAULT NULL")
    if "points" not in contact_cols:
        cur.execute("ALTER TABLE contacts ADD COLUMN points INTEGER DEFAULT 0")
    if "spa_wallet_balance" not in contact_cols:
        cur.execute("ALTER TABLE contacts ADD COLUMN spa_wallet_balance REAL DEFAULT 0")

    # Migration: thêm column spa_wallet_deduction vào orders nếu chưa có
    cur.execute("PRAGMA table_info(orders)")
    order_cols = [c[1] for c in cur.fetchall()]
    if "spa_wallet_deduction" not in order_cols:
        cur.execute("ALTER TABLE orders ADD COLUMN spa_wallet_deduction REAL DEFAULT 0")

    # Migration: thêm column is_oem và supplier_id vào warehouses nếu chưa có
    cur.execute("PRAGMA table_info(warehouses)")
    wh_cols = [c[1] for c in cur.fetchall()]
    if "is_oem" not in wh_cols:
        cur.execute("ALTER TABLE warehouses ADD COLUMN is_oem INTEGER DEFAULT 0")
    if "supplier_id" not in wh_cols:
        cur.execute("ALTER TABLE warehouses ADD COLUMN supplier_id INTEGER DEFAULT NULL")

    # Migration: thêm column fund_source vào cashbook nếu chưa có ('COMPANY' hoặc 'PERSONAL')
    cur.execute("PRAGMA table_info(cashbook)")
    cb_cols = [c[1] for c in cur.fetchall()]
    if "fund_source" not in cb_cols:
        cur.execute("ALTER TABLE cashbook ADD COLUMN fund_source TEXT DEFAULT 'COMPANY'")

    # Migration: thêm column min_points, allow_points, price_list_id vào customer_segments nếu chưa có
    cur.execute("PRAGMA table_info(customer_segments)")
    seg_cols = [c[1] for c in cur.fetchall()]
    if "min_points" not in seg_cols:
        cur.execute("ALTER TABLE customer_segments ADD COLUMN min_points INTEGER DEFAULT 0")
    if "allow_points" not in seg_cols:
        cur.execute("ALTER TABLE customer_segments ADD COLUMN allow_points INTEGER DEFAULT 1")
    if "price_list_id" not in seg_cols:
        cur.execute("ALTER TABLE customer_segments ADD COLUMN price_list_id INTEGER DEFAULT NULL")

    # Migration: thêm column fund_source vào purchases nếu chưa có
    cur.execute("PRAGMA table_info(purchases)")
    po_cols = [c[1] for c in cur.fetchall()]
    if "fund_source" not in po_cols:
        cur.execute("ALTER TABLE purchases ADD COLUMN fund_source TEXT DEFAULT 'PERSONAL'")

    # Migration: thêm column actual_quantity vào purchase_items nếu chưa có
    cur.execute("PRAGMA table_info(purchase_items)")
    poi_cols = [c[1] for c in cur.fetchall()]
    if "actual_quantity" not in poi_cols:
        cur.execute("ALTER TABLE purchase_items ADD COLUMN actual_quantity REAL DEFAULT NULL")

    # 12. Hồ sơ Thú Cưng (1 Khách Hàng - Nhiều Thú Cưng)
    cur.execute('''
    CREATE TABLE IF NOT EXISTS pets (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        customer_id INTEGER NOT NULL,
        name TEXT NOT NULL,
        species TEXT DEFAULT 'Chó',
        breed TEXT DEFAULT '',
        color TEXT DEFAULT '',
        weight REAL DEFAULT 0,
        note TEXT DEFAULT '',
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY(customer_id) REFERENCES contacts(id) ON DELETE CASCADE
    )''')

    # 12.1 Phiếu Dịch Vụ & Lịch Hẹn Thú Cưng
    cur.execute('''
    CREATE TABLE IF NOT EXISTS pet_service_tickets (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        code TEXT UNIQUE,
        customer_id INTEGER NOT NULL,
        pet_id INTEGER,
        service_type TEXT NOT NULL,
        appointment_time TEXT,
        has_transport INTEGER DEFAULT 0,
        transport_address TEXT DEFAULT '',
        price REAL DEFAULT 0,
        status TEXT DEFAULT 'pending',
        note TEXT DEFAULT '',
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY(customer_id) REFERENCES contacts(id) ON DELETE CASCADE,
        FOREIGN KEY(pet_id) REFERENCES pets(id) ON DELETE SET NULL
    )''')

    cur.execute("PRAGMA table_info(pet_service_tickets)")
    ticket_cols = [c[1] for c in cur.fetchall()]
    if 'batch_code' not in ticket_cols:
        cur.execute("ALTER TABLE pet_service_tickets ADD COLUMN batch_code TEXT DEFAULT ''")
    if 'deposit_amount' not in ticket_cols:
        cur.execute("ALTER TABLE pet_service_tickets ADD COLUMN deposit_amount REAL DEFAULT 0.0")
    if 'spa_wallet_deduction' not in ticket_cols:
        cur.execute("ALTER TABLE pet_service_tickets ADD COLUMN spa_wallet_deduction REAL DEFAULT 0.0")
    if 'original_service_type' not in ticket_cols:
        cur.execute("ALTER TABLE pet_service_tickets ADD COLUMN original_service_type TEXT DEFAULT ''")
    if 'original_price' not in ticket_cols:
        cur.execute("ALTER TABLE pet_service_tickets ADD COLUMN original_price REAL DEFAULT 0.0")
    if 'service_change_reason' not in ticket_cols:
        cur.execute("ALTER TABLE pet_service_tickets ADD COLUMN service_change_reason TEXT DEFAULT ''")
    if 'service_changed_at' not in ticket_cols:
        cur.execute("ALTER TABLE pet_service_tickets ADD COLUMN service_changed_at TEXT DEFAULT ''")

    # 13. Phân hệ Gia Công OEM
    cur.execute('''
    CREATE TABLE IF NOT EXISTS oem_orders (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        code TEXT UNIQUE,
        partner_id INTEGER NOT NULL,
        oem_warehouse_id INTEGER DEFAULT 1,
        dest_warehouse_id INTEGER DEFAULT 1,
        status TEXT DEFAULT 'DRAFT',
        expected_delivery_date TEXT,
        fund_source TEXT DEFAULT 'COMPANY',
        vat_percent REAL DEFAULT 8.0,
        discount_percent REAL DEFAULT 0.0,
        deposit_amount REAL DEFAULT 0.0,
        deposit_date TEXT,
        total_raw_amount REAL DEFAULT 0.0,
        total_final_amount REAL DEFAULT 0.0,
        remaining_payment REAL DEFAULT 0.0,
        payment_status TEXT DEFAULT 'UNPAID',
        note TEXT DEFAULT '',
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY(partner_id) REFERENCES contacts(id)
    )''')

    cur.execute('''
    CREATE TABLE IF NOT EXISTS oem_order_items (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        order_id INTEGER NOT NULL,
        product_id INTEGER NOT NULL,
        ordered_qty REAL NOT NULL DEFAULT 0,
        received_qty REAL NOT NULL DEFAULT 0,
        unit_price REAL NOT NULL DEFAULT 0,
        final_unit_cost REAL NOT NULL DEFAULT 0,
        full_cost_per_unit REAL NOT NULL DEFAULT 0,
        FOREIGN KEY(order_id) REFERENCES oem_orders(id) ON DELETE CASCADE,
        FOREIGN KEY(product_id) REFERENCES products(id) ON DELETE RESTRICT
    )''')

    # 14. Gói Topup Ví Spa định sẵn
    cur.execute('''
    CREATE TABLE IF NOT EXISTS topup_packages (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        pay_amount REAL NOT NULL,
        receive_amount REAL NOT NULL,
        is_active INTEGER DEFAULT 1,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )''')

    # 15. Lịch sử giao dịch ví Topup Spa
    cur.execute('''
    CREATE TABLE IF NOT EXISTS spa_wallet_transactions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        contact_id INTEGER NOT NULL,
        order_id INTEGER,
        package_id INTEGER,
        type TEXT NOT NULL CHECK(type IN ('topup', 'spend', 'refund')),
        amount REAL NOT NULL,
        balance_before REAL NOT NULL,
        balance_after REAL NOT NULL,
        note TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY(contact_id) REFERENCES contacts(id) ON DELETE CASCADE,
        FOREIGN KEY(order_id) REFERENCES orders(id) ON DELETE SET NULL,
        FOREIGN KEY(package_id) REFERENCES topup_packages(id) ON DELETE SET NULL
    )''')

    # 16. Khuyến mãi & Chi tiết giảm giá theo sản phẩm
    cur.execute('''
    CREATE TABLE IF NOT EXISTS promotions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        code TEXT UNIQUE,
        name TEXT NOT NULL,
        start_date DATE,
        end_date DATE,
        is_active INTEGER DEFAULT 1,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )''')

    cur.execute('''
    CREATE TABLE IF NOT EXISTS promotion_items (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        promotion_id INTEGER NOT NULL,
        product_id INTEGER,
        target_type TEXT NOT NULL DEFAULT 'product',
        service_name TEXT,
        spa_category TEXT,
        discount_type TEXT NOT NULL CHECK(discount_type IN ('pct', 'fixed')),
        discount_val REAL NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY(promotion_id) REFERENCES promotions(id) ON DELETE CASCADE,
        FOREIGN KEY(product_id) REFERENCES products(id) ON DELETE CASCADE
    )''')

    # Migration for promotion_items new columns & allow product_id NULL
    for _col in [
        "ALTER TABLE promotion_items ADD COLUMN target_type TEXT NOT NULL DEFAULT 'product'",
        "ALTER TABLE promotion_items ADD COLUMN service_name TEXT",
        "ALTER TABLE promotion_items ADD COLUMN spa_category TEXT",
    ]:
        try:
            cur.execute(_col)
        except Exception:
            pass

    # Nếu promotion_items đã tạo trước đó có constraint NOT NULL cho product_id, recreate table an toàn
    cur.execute("PRAGMA table_info(promotion_items)")
    pi_cols = {dict(r)["name"]: dict(r) for r in cur.fetchall()}
    if pi_cols.get("product_id", {}).get("notnull") == 1:
        cur.execute('''
        CREATE TABLE promotion_items_dg_tmp (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            promotion_id INTEGER NOT NULL,
            product_id INTEGER,
            target_type TEXT NOT NULL DEFAULT 'product',
            service_name TEXT,
            spa_category TEXT,
            discount_type TEXT NOT NULL CHECK(discount_type IN ('pct', 'fixed')),
            discount_val REAL NOT NULL,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY(promotion_id) REFERENCES promotions(id) ON DELETE CASCADE,
            FOREIGN KEY(product_id) REFERENCES products(id) ON DELETE CASCADE
        )''')
        cur.execute('''
        INSERT INTO promotion_items_dg_tmp (id, promotion_id, product_id, target_type, service_name, spa_category, discount_type, discount_val, created_at)
        SELECT id, promotion_id, product_id, COALESCE(target_type, 'product'), service_name, spa_category, discount_type, discount_val, created_at
        FROM promotion_items
        ''')
        cur.execute("DROP TABLE promotion_items")
        cur.execute("ALTER TABLE promotion_items_dg_tmp RENAME TO promotion_items")

    # Bảng chiết khấu Dịch Vụ Spa theo Bảng Giá
    cur.execute('''
    CREATE TABLE IF NOT EXISTS price_list_spa_items (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        price_list_id INTEGER NOT NULL,
        target_type TEXT NOT NULL, -- 'service' hoặc 'category'
        service_name TEXT,
        spa_category TEXT,
        discount_percent REAL DEFAULT 0,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY(price_list_id) REFERENCES price_lists(id) ON DELETE CASCADE
    )''')

    # Default data
    cur.execute("INSERT OR IGNORE INTO price_lists (code, name, description) VALUES ('PL-BANLE', 'Giá Bán Lẻ', 'Giá bán lẻ mặc định')")
    cur.execute("INSERT OR IGNORE INTO price_lists (code, name, description) VALUES ('PL-SI', 'Giá Sỉ', 'Giá sỉ cho đơn số lượng lớn')")
    cur.execute("INSERT OR IGNORE INTO price_lists (code, name, description) VALUES ('PL-DL', 'Giá Đại Lý', 'Giá đại lý')")
    cur.execute("INSERT OR IGNORE INTO customer_segments (code, name, discount_percent, priority, min_points, allow_points) VALUES ('LE', 'Bán lẻ', 0, 1, 0, 1)")
    cur.execute("INSERT OR IGNORE INTO customer_segments (code, name, discount_percent, priority, min_points, allow_points) VALUES ('SI', 'Sỉ', 5, 2, 0, 0)")
    cur.execute("INSERT OR IGNORE INTO customer_segments (code, name, discount_percent, priority, min_points, allow_points) VALUES ('DL', 'Đại Lý', 10, 3, 0, 0)")
    # Đảm bảo Sỉ và Đại Lý có allow_points = 0 nếu đã tồn tại trước đó
    cur.execute("UPDATE customer_segments SET allow_points = 0 WHERE code IN ('SI', 'DL') AND (allow_points IS NULL OR allow_points = 1)")

    # Gói Topup Ví Spa mặc định
    cur.execute("SELECT COUNT(*) FROM topup_packages")
    if cur.fetchone()[0] == 0:
        cur.execute("INSERT INTO topup_packages (name, pay_amount, receive_amount, is_active) VALUES ('Gói Spa 500k -> 700k', 500000, 700000, 1)")
        cur.execute("INSERT INTO topup_packages (name, pay_amount, receive_amount, is_active) VALUES ('Gói Spa 1tr -> 1.5tr', 1000000, 1500000, 1)")

    # Cấu hình tỷ lệ đổi điểm thưởng
    cur.execute("INSERT OR REPLACE INTO settings (key, value) VALUES ('points_exchange_rate', '1000')")

    # Seed payment_accounts if empty
    cur.execute("SELECT COUNT(*) FROM payment_accounts")
    if cur.fetchone()[0] == 0:
        cur.execute("""
        INSERT INTO payment_accounts (code, name, account_type, owner_type, initial_balance, is_default)
        VALUES ('TM-POS', 'Két tiền mặt tại quầy POS', 'cash', 'COMPANY', 0, 1)
        """)
        cur.execute("""
        INSERT INTO payment_accounts (code, name, account_type, owner_type, bank_name, account_number, account_holder, initial_balance, is_default)
        VALUES ('VCB-CTY', 'Vietcombank Công Ty', 'bank', 'COMPANY', 'Vietcombank', '9988776655', 'CTY TNHH BÁN LẺ POS', 0, 0)
        """)
        cur.execute("""
        INSERT INTO payment_accounts (code, name, account_type, owner_type, bank_name, account_number, account_holder, initial_balance, is_default)
        VALUES ('MB-CANHAN', 'MB Bank Cá Nhân (Chủ Shop)', 'bank', 'PERSONAL', 'MB Bank', '0929861468', 'Bùi Thiên Phú', 0, 0)
        """)

    # ── Auth migration: thêm cột username/password_hash/is_active vào staff ──
    for _col in [
        "ALTER TABLE staff ADD COLUMN username TEXT",
        "ALTER TABLE staff ADD COLUMN password_hash TEXT",
        "ALTER TABLE staff ADD COLUMN is_active INTEGER DEFAULT 1",
        "ALTER TABLE staff ADD COLUMN must_change_password INTEGER DEFAULT 0",
        "ALTER TABLE staff ADD COLUMN token_version INTEGER DEFAULT 0",
    ]:
        try:
            cur.execute(_col)
        except Exception:
            pass  # column already exists

    cur.execute("CREATE UNIQUE INDEX IF NOT EXISTS idx_staff_username ON staff(username)")

    # ── Bảng ca làm việc ──
    cur.execute('''
    CREATE TABLE IF NOT EXISTS shifts (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        cashier_id INTEGER NOT NULL REFERENCES staff(id),
        open_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        close_at DATETIME,
        status TEXT DEFAULT 'open' CHECK(status IN ('open','closed','approved')),
        opening_cash REAL DEFAULT 0,
        closing_cash REAL,
        expected_cash REAL,
        difference REAL,
        note TEXT,
        approved_by INTEGER REFERENCES staff(id),
        approved_at DATETIME
    )''')

    # ── HOTEL: Khách Sạn Thú Cưng ──
    cur.execute('''
    CREATE TABLE IF NOT EXISTS hotel_rooms (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        code TEXT NOT NULL UNIQUE,
        name TEXT NOT NULL,
        zone TEXT NOT NULL DEFAULT 'cat',
        room_group TEXT NOT NULL DEFAULT 'Khu Tiêu Chuẩn',
        price_per_day REAL NOT NULL DEFAULT 150000,
        price_per_hour REAL NOT NULL DEFAULT 0,
        capacity INTEGER NOT NULL DEFAULT 1,
        status TEXT NOT NULL DEFAULT 'available',
        description TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )''')

    cur.execute('''
    CREATE TABLE IF NOT EXISTS hotel_bookings (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        code TEXT NOT NULL UNIQUE,
        batch_code TEXT,
        room_id INTEGER NOT NULL REFERENCES hotel_rooms(id),
        contact_id INTEGER NOT NULL REFERENCES contacts(id),
        pet_id INTEGER NOT NULL REFERENCES pets(id),
        check_in_time TIMESTAMP NOT NULL,
        expected_checkout_time TIMESTAMP NOT NULL,
        actual_checkout_time TIMESTAMP,
        daily_rate REAL NOT NULL,
        total_days REAL DEFAULT 1,
        total_amount REAL NOT NULL DEFAULT 0,
        pet_weight_at_checkin REAL DEFAULT 0,
        health_condition TEXT,
        deposit_amount REAL DEFAULT 0,
        feeding_notes TEXT,
        items_brought TEXT,
        daily_care_log TEXT,
        status TEXT NOT NULL DEFAULT 'active',
        order_id INTEGER REFERENCES orders(id),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )''')

    # Migration thêm cột mới cho hotel_rooms, hotel_bookings và pet_service_tickets nếu bảng đã tồn tại
    for _col in [
        "ALTER TABLE hotel_rooms ADD COLUMN room_group TEXT DEFAULT 'Khu Tiêu Chuẩn'",
        "ALTER TABLE hotel_rooms ADD COLUMN price_per_hour REAL DEFAULT 0",
        "ALTER TABLE hotel_rooms ADD COLUMN capacity INTEGER DEFAULT 1",
        "ALTER TABLE hotel_bookings ADD COLUMN batch_code TEXT",
        "ALTER TABLE hotel_bookings ADD COLUMN pet_weight_at_checkin REAL DEFAULT 0",
        "ALTER TABLE hotel_bookings ADD COLUMN health_condition TEXT",
        "ALTER TABLE hotel_bookings ADD COLUMN deposit_amount REAL DEFAULT 0",
        "ALTER TABLE pet_service_tickets ADD COLUMN hotel_booking_id INTEGER REFERENCES hotel_bookings(id)",
        "ALTER TABLE pet_service_tickets ADD COLUMN target_hotel_room_id INTEGER REFERENCES hotel_rooms(id)",
    ]:
        try:
            cur.execute(_col)
        except Exception:
            pass

    # ── Gắn shift_id vào orders và cashbook ──
    for _col in [
        "ALTER TABLE orders ADD COLUMN shift_id INTEGER REFERENCES shifts(id)",
        "ALTER TABLE cashbook ADD COLUMN shift_id INTEGER REFERENCES shifts(id)",
    ]:
        try:
            cur.execute(_col)
        except Exception:
            pass

    # ── Seed admin ──
    from passlib.context import CryptContext
    _pwd_ctx = CryptContext(schemes=["bcrypt"], deprecated="auto")

    cur.execute("SELECT COUNT(*) FROM staff WHERE username='admin'")
    if cur.fetchone()[0] == 0:
        cur.execute("SELECT id FROM staff WHERE role='admin' OR role='owner' LIMIT 1")
        _existing = cur.fetchone()
        if _existing:
            cur.execute(
                "UPDATE staff SET username=?, password_hash=?, is_active=1 WHERE id=?",
                ("admin", _pwd_ctx.hash("admin123"), _existing[0])
            )
        else:
            cur.execute(
                "INSERT INTO staff (name, username, password_hash, role, is_active, commission_rate) VALUES (?,?,?,?,1,0.0)",
                ("Quản Lý", "admin", _pwd_ctx.hash("admin123"), "owner")
            )

    # Tao tai khoan mac dinh neu chua co
    cur.execute("SELECT COUNT(*) FROM staff WHERE username IS NOT NULL")
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
