import pytest
from fastapi.testclient import TestClient
from server import app
from database import get_db
from routers.auth import _make_token
from scripts.import_hrm_from_sheets import (
    clean_currency,
    clean_phone,
    clean_cccd,
    parse_vn_date,
    extract_sheet_id,
    import_hrm_rows_to_db,
)


def _owner_headers():
    return {"Authorization": f"Bearer {_make_token(1, 0)}"}


def test_clean_currency():
    assert clean_currency("7.000.000 đ") == 7000000.0
    assert clean_currency("-500.000 đ") == -500000.0
    assert clean_currency("1,200,000") == 1200000.0
    assert clean_currency("800000") == 800000.0
    assert clean_currency(9000000) == 9000000.0
    assert clean_currency("") == 0.0
    assert clean_currency(None) == 0.0


def test_clean_phone_and_cccd():
    assert clean_phone("387008790.0") == "0387008790"
    assert clean_phone(387008790.0) == "0387008790"
    assert clean_phone("0388 408 876") == "0388408876"
    assert clean_cccd("79203033970.0") == "079203033970"
    assert clean_cccd("083 097 004 964") == "083097004964"


def test_parse_vn_date():
    assert parse_vn_date("15/04/1997") == "1997-04-15"
    assert parse_vn_date("02/05/2025") == "2025-05-02"
    assert parse_vn_date("2026-10-24") == "2026-10-24"
    assert parse_vn_date("") is None
    assert parse_vn_date(None) is None
    assert extract_sheet_id("https://docs.google.com/spreadsheets/d/1F0h7NMbqkPBnacZHKM-9LupB83cPAx0myUcEIUbjsak/edit") == "1F0h7NMbqkPBnacZHKM-9LupB83cPAx0myUcEIUbjsak"


def test_import_hrm_rows_and_batch_accounts():
    conn = get_db()
    cur = conn.cursor()

    row_nv06 = [""] * 38
    row_nv06[1] = "NV96"
    row_nv06[2] = "Võ Nguyễn Hạ Huyên Test"
    row_nv06[5] = "Văn Phòng"
    row_nv06[6] = "Văn Phòng"
    row_nv06[7] = "Nhân Viên"
    row_nv06[8] = "0935 737 430"
    row_nv06[26] = "8.000.000 đ"
    row_nv06[33] = "Đang làm"
    row_nv06[34] = "Thoả Thuận"

    row_nv18 = [""] * 38
    row_nv18[1] = "NV98"
    row_nv18[2] = "Tăng Văn Tấn Test"
    row_nv18[5] = "Kho"
    row_nv18[6] = "Kho"
    row_nv18[7] = "Nhân viên kho"
    row_nv18[8] = "387008790.0"
    row_nv18[9] = "79203033970.0"
    row_nv18[26] = "7.000.000 đ"
    row_nv18[33] = "Đang làm"
    row_nv18[34] = "Kho"

    staff_rows = [[], ["Header"], row_nv06, row_nv18]
    adj_rows = [
        [], [], [], ["Header"],
        ["1", "01/08/2026", "NV96", "Võ Nguyễn Hạ Huyên Test", "Phụ cấp", "0", "1000000", "01/08/2026", "Phụ cấp TTS"]
    ]
    punch_rows = [
        [], [], [], ["Header"],
        ["916.0"] + [""] * 24 + ["NV98"]
    ]

    res = import_hrm_rows_to_db(cur, staff_rows, adj_rows, punch_rows)
    conn.commit()
    assert res["imported_staff"] >= 2
    assert res["imported_adjustments"] >= 1

    cur.execute("SELECT id, work_block_id, phone FROM staff WHERE employee_code = 'NV96'")
    st96 = cur.fetchone()
    assert st96 is not None
    assert st96["work_block_id"] == 3
    assert st96["phone"] == "0935737430"

    cur.execute("SELECT id, phone, id_card_number, device_code FROM staff WHERE employee_code = 'NV98'")
    st98 = cur.fetchone()
    assert st98 is not None
    assert st98["phone"] == "0387008790"
    assert st98["id_card_number"] == "079203033970"
    assert st98["device_code"] == "916"
    conn.close()

    client = TestClient(app)
    resp = client.post(
        "/api/hrm/employees/batch-accounts",
        headers=_owner_headers(),
        json={
            "accounts": [
                {"staff_id": st96["id"], "username": st96["phone"], "password": "123456", "role": "staff"},
                {"staff_id": st98["id"], "username": st98["phone"], "password": "123456", "role": "staff"},
            ]
        },
    )
    assert resp.status_code == 200
    data = resp.json()
    assert data["created_count"] == 2

    staff_resp = client.get("/api/auth/staff", headers=_owner_headers())
    assert staff_resp.status_code == 200
    by_code = {r["employee_code"]: r for r in staff_resp.json() if r.get("employee_code")}
    assert by_code["NV96"]["has_account"] == 1
    assert by_code["NV96"]["username"] == "0935737430"
    assert by_code["NV96"]["role"] == "staff"
    assert by_code["NV96"]["block_name"] == "Thoả Thuận"
    assert by_code["NV98"]["has_account"] == 1
    assert by_code["NV98"]["username"] == "0387008790"
    assert by_code["NV98"]["device_code"] == "916"
