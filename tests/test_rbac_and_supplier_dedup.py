import os
import io
import sqlite3
import pytest
import openpyxl
from bs4 import BeautifulSoup

from database import merge_duplicate_contacts, get_db
from dependencies import check_permission, require_any_permission


def test_sidebar_roles_in_html():
    """Kiểm tra 3 tab contacts, cashbook, cashflow-debts mở đủ quyền cho cả 4 vai trò."""
    html_path = os.path.join(os.path.dirname(__file__), "..", "templates", "index.html")
    with open(html_path, "r", encoding="utf-8") as f:
        soup = BeautifulSoup(f.read(), "html.parser")

    target_tabs = ["contacts", "cashbook", "cashflow-debts"]
    required_roles = {"owner", "accountant", "cashier", "warehouse"}

    for tab in target_tabs:
        btn = soup.find("button", attrs={"data-tab": tab})
        assert btn is not None, f"Không tìm thấy button data-tab='{tab}'"
        roles = {r.strip() for r in btn.get("data-role", "").split(",") if r.strip()}
        assert required_roles.issubset(roles), f"Tab {tab} thiếu role: {required_roles - roles}"


def test_rbac_permissions_in_db():
    """Kiểm tra quyền cashbook.manage và partners.manage được cấp cho cashier và warehouse."""
    conn = get_db()
    cur = conn.cursor()
    cur.execute("""
        SELECT role, perm_key, allowed 
        FROM role_permissions 
        WHERE perm_key IN ('cashbook.manage', 'partners.manage')
    """)
    rows = cur.fetchall()
    conn.close()

    perm_map = {(r["role"], r["perm_key"]): bool(r["allowed"]) for r in rows}
    
    assert perm_map.get(("cashier", "cashbook.manage")) is True
    assert perm_map.get(("cashier", "partners.manage")) is True
    assert perm_map.get(("warehouse", "cashbook.manage")) is True
    assert perm_map.get(("warehouse", "partners.manage")) is True
    assert perm_map.get(("accountant", "cashbook.manage")) is True
    assert perm_map.get(("accountant", "partners.manage")) is True


def test_merge_duplicate_contacts_engine():
    """Kiểm tra engine gộp đối tác trùng tên: dồn công nợ, chuyển khóa ngoại và xóa bản ghi phụ."""
    conn = sqlite3.connect(":memory:")
    conn.row_factory = sqlite3.Row
    cur = conn.cursor()

    # Tạo schema tối giản để kiểm tra
    cur.execute("""
        CREATE TABLE contacts (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            type TEXT NOT NULL,
            name TEXT NOT NULL,
            phone TEXT,
            address TEXT,
            debt REAL DEFAULT 0,
            points INTEGER DEFAULT 0,
            spa_wallet_balance REAL DEFAULT 0
        )
    """)
    cur.execute("""
        CREATE TABLE purchases (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            supplier_id INTEGER,
            code TEXT
        )
    """)
    cur.execute("""
        CREATE TABLE oem_orders (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            partner_id INTEGER,
            code TEXT
        )
    """)
    cur.execute("""
        CREATE TABLE inventory_logs (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            supplier_id INTEGER
        )
    """)
    cur.execute("""
        CREATE TABLE warehouses (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            supplier_id INTEGER
        )
    """)
    cur.execute("""
        CREATE TABLE cashbook (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            contact_id INTEGER
        )
    """)
    cur.execute("""
        CREATE TABLE orders (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            customer_id INTEGER
        )
    """)
    cur.execute("""
        CREATE TABLE pets (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            customer_id INTEGER
        )
    """)
    cur.execute("""
        CREATE TABLE pet_service_tickets (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            customer_id INTEGER
        )
    """)
    cur.execute("""
        CREATE TABLE hotel_bookings (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            contact_id INTEGER
        )
    """)
    cur.execute("""
        CREATE TABLE spa_wallet_logs (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            contact_id INTEGER
        )
    """)
    cur.execute("""
        CREATE TABLE supplier_items (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            supplier_id INTEGER,
            item_type TEXT,
            product_id INTEGER,
            ingredient_id INTEGER
        )
    """)

    # Tạo 2 NCC trùng tên (1 hoa 1 thường kèm khoảng trắng)
    cur.execute("INSERT INTO contacts (type, name, phone, address, debt) VALUES ('supplier', 'NCC VinaPet', '0901112222', 'Q1, HCM', 100000.0)")
    id_master = cur.lastrowid

    cur.execute("INSERT INTO contacts (type, name, phone, address, debt) VALUES ('supplier', '  ncc vinapet  ', '', 'Q7, HCM', 250000.0)")
    id_dup = cur.lastrowid

    # Đơn hàng liên kết với id_dup
    cur.execute("INSERT INTO purchases (supplier_id, code) VALUES (?, 'PO-TEST-01')", (id_dup,))
    cur.execute("INSERT INTO oem_orders (partner_id, code) VALUES (?, 'OEM-TEST-01')", (id_dup,))

    conn.commit()

    # Thực thi merge
    result = merge_duplicate_contacts(conn)
    assert result["merged_groups"] == 1
    assert result["deleted_duplicates"] == 1

    # Kiểm tra chỉ còn 1 contact
    cur.execute("SELECT * FROM contacts WHERE LOWER(TRIM(name)) = 'ncc vinapet'")
    remaining = cur.fetchall()
    assert len(remaining) == 1
    master_row = dict(remaining[0])

    assert master_row["id"] == id_master
    assert master_row["phone"] == "0901112222"
    assert master_row["debt"] == 350000.0  # 100k + 250k

    # Kiểm tra khóa ngoại được chuyển giao
    cur.execute("SELECT supplier_id FROM purchases WHERE code = 'PO-TEST-01'")
    assert cur.fetchone()[0] == id_master

    cur.execute("SELECT partner_id FROM oem_orders WHERE code = 'OEM-TEST-01'")
    assert cur.fetchone()[0] == id_master

    conn.close()


@pytest.mark.anyio
async def test_import_excel_deduplication():
    """Kiểm tra import Excel không tạo trùng lặp NCC khi cùng tên hoặc cùng SĐT."""
    from fastapi import UploadFile
    from routers.partners import import_contacts_excel

    # Đảm bảo môi trường sạch trước khi test
    conn = get_db()
    cur = conn.cursor()
    cur.execute("DELETE FROM contacts WHERE LOWER(TRIM(name)) = 'ncc thức ăn test'")
    conn.commit()
    conn.close()

    wb = openpyxl.Workbook()
    ws = wb.active
    ws.append(["Tên Nhà Cung Cấp", "Điện Thoại", "Địa Chỉ", "Công Nợ"])
    ws.append(["NCC Thức Ăn Test", "0933999888.0", "Hà Nội", 500000])
    ws.append(["  ncc thức ăn test  ", "", "Hà Nội Mới", 200000])

    bio = io.BytesIO()
    wb.save(bio)
    bio.seek(0)

    try:
        upload_file = UploadFile(filename="test_suppliers.xlsx", file=bio)
        resp = await import_contacts_excel(file=upload_file, type="supplier")

        assert resp["status"] == "ok"
        assert "Đã thêm mới 1 nhà cung cấp, cập nhật 1 nhà cung cấp" in resp["message"]

        # Kiểm tra DB chỉ có đúng 1 bản ghi cho NCC Thức Ăn Test
        conn = get_db()
        cur = conn.cursor()
        cur.execute("SELECT id, name, phone, address, debt FROM contacts WHERE LOWER(TRIM(name)) = 'ncc thức ăn test' AND type = 'supplier'")
        rows = cur.fetchall()
        assert len(rows) == 1
        row = dict(rows[0])
        assert row["phone"] == "0933999888"  # Bỏ đuôi .0
        assert row["debt"] == 700000.0       # 500k + 200k
    finally:
        conn = get_db()
        cur = conn.cursor()
        cur.execute("DELETE FROM contacts WHERE LOWER(TRIM(name)) = 'ncc thức ăn test'")
        conn.commit()
        conn.close()
