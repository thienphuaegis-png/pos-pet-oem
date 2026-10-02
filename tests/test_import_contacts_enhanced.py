import pytest
from database import get_db, init_db
from fastapi.testclient import TestClient
from server import app
import openpyxl, io

client = TestClient(app)

def test_import_contacts_with_code_and_note():
    init_db()
    login_res = client.post("/api/auth/login", data={"username": "admin", "password": "admin123"})
    assert login_res.status_code == 200
    headers = {"Authorization": f"Bearer {login_res.json()['access_token']}"}

    # Tạo 1 file Excel test in-memory
    wb = openpyxl.Workbook()
    ws = wb.active
    ws.append(['ID', 'Name', 'Phone', 'Address', 'CustomerGroup', 'Debt', 'Notes'])
    ws.append(['KH_TEST_99', 'Khách Test Import Mới', '0912999888', '123 Đường Test Bến Tre', 'Đại Lý', 500000, 'Gửi chành xe test'])
    buf = io.BytesIO()
    wb.save(buf)
    buf.seek(0)

    # Gửi request import
    files = {"file": ("test_contacts.xlsx", buf, "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")}
    res = client.post("/api/contacts/import-excel?type=customer", files=files, headers=headers)
    assert res.status_code == 200

    # Verify trong DB
    conn = get_db()
    cur = conn.cursor()
    cur.execute("SELECT id, code, name, phone, address, debt, note, segment_id FROM contacts WHERE code = 'KH_TEST_99'")
    row = cur.fetchone()
    assert row is not None
    assert row["name"] == "Khách Test Import Mới"
    assert row["phone"] == "0912999888"
    assert row["address"] == "123 Đường Test Bến Tre"
    assert row["debt"] == 500000.0
    assert row["note"] == "Gửi chành xe test"
    assert row["segment_id"] is not None

    # Dọn dẹp
    cur.execute("DELETE FROM contacts WHERE code = 'KH_TEST_99'")
    conn.commit()
    conn.close()
