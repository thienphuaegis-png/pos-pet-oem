import pytest
import sqlite3
from database import get_db, init_db
from schemas import ExpenseRequestCreate, ExpenseRequestApprove

def test_database_table_expense_requests_exists():
    init_db()
    conn = get_db()
    cur = conn.cursor()
    cur.execute("PRAGMA table_info(expense_requests)")
    cols = {row[1]: row[2] for row in cur.fetchall()}
    conn.close()

    assert "id" in cols
    assert "code" in cols
    assert "type" in cols
    assert "employee_name" in cols
    assert "amount" in cols
    assert "category" in cols
    assert "note" in cols
    assert "bill_image" in cols
    assert "bank_account_info" in cols
    assert "status" in cols
    assert "cashbook_id" in cols
    assert "due_date" in cols
    assert "created_at" in cols
    assert "resolved_at" in cols
    assert "created_by" in cols

def test_schemas_validation():
    req = ExpenseRequestCreate(
        type="reimbursement",
        employee_name="Nguyễn Văn A",
        amount=150000.0,
        category="Chi phí vận hành",
        note="Tiền ship đá lạnh",
        bill_image="data:image/jpeg;base64,abc",
        bank_account_info="MBBank - 123456789",
        due_date=None
    )
    assert req.employee_name == "Nguyễn Văn A"
    assert req.amount == 150000.0

    approve_data = ExpenseRequestApprove(
        account_id=1,
        note="Đã chuyển khoản hoàn ứng"
    )
    assert approve_data.account_id == 1

def test_api_expense_requests_flow():
    from starlette.testclient import TestClient
    from server import app
    client = TestClient(app)

    # Đảm bảo có payment account id=1
    conn = get_db()
    cur = conn.cursor()
    cur.execute("INSERT OR IGNORE INTO payment_accounts (id, code, name, account_type, is_active) VALUES (1, 'TM-TEST', 'Két tiền mặt test', 'cash', 1)")
    conn.commit()
    conn.close()

    # 1. Tạo yêu cầu chi hộ của NV Nguyễn Văn A
    create_payload = {
        "type": "reimbursement",
        "employee_name": "Nguyễn Văn A",
        "amount": 250000,
        "category": "Chi phí vận hành",
        "note": "Mua văn phòng phẩm và giấy in",
        "bill_image": "data:image/png;base64,fakeimage",
        "bank_account_info": "Vietcombank - 0987654321",
        "due_date": None
    }
    res = client.post("/api/expense-requests", json=create_payload)
    assert res.status_code == 200, res.text
    created = res.json()
    assert "id" in created
    assert created["code"].startswith("YC-")
    assert created["status"] == "pending"
    req_id = created["id"]

    # 2. Tạo thêm 1 khoản dự chi quán
    res_plan = client.post("/api/expense-requests", json={
        "type": "planned",
        "employee_name": "Quán",
        "amount": 1000000,
        "category": "Chi tiền nhập hàng",
        "note": "Dự kiến nhập cát vệ sinh tuần tới",
        "due_date": "2026-10-15"
    })
    assert res_plan.status_code == 200
    plan_id = res_plan.json()["id"]

    # 3. Lấy danh sách & Thống kê
    res_list = client.get("/api/expense-requests")
    assert res_list.status_code == 200
    data = res_list.json()
    assert "items" in data
    assert "stats" in data
    assert data["stats"]["total_reimbursement_pending"] >= 250000
    assert data["stats"]["total_planned_pending"] >= 1000000
    assert data["stats"]["pending_count"] >= 2

    # 4. Duyệt hoàn tiền cho NV Nguyễn Văn A
    res_approve = client.post(f"/api/expense-requests/{req_id}/approve", json={
        "account_id": 1,
        "note": "Đã hoàn tiền mặt tại quầy"
    })
    assert res_approve.status_code == 200, res_approve.text
    approved = res_approve.json()
    assert approved["status"] == "completed"
    assert approved["cashbook_id"] is not None

    # Kiểm tra trong cashbook đã tự động sinh Phiếu Chi thực tế
    conn = get_db()
    cur = conn.cursor()
    cur.execute("SELECT code, type, amount, category, note, account_id FROM cashbook WHERE id = ?", (approved["cashbook_id"],))
    cb_row = cur.fetchone()
    conn.close()
    assert cb_row is not None
    cb_dict = dict(cb_row)
    assert cb_dict["type"] == "out"
    assert cb_dict["amount"] == 250000
    assert "Nguyễn Văn A" in cb_dict["note"]
    assert cb_dict["account_id"] == 1

    # 5. Hủy khoản dự chi
    res_cancel = client.post(f"/api/expense-requests/{plan_id}/cancel")
    assert res_cancel.status_code == 200
    cancelled = res_cancel.json()
    assert cancelled["status"] == "cancelled"

def test_frontend_subtab_and_module_exist():
    from pathlib import Path
    html_path = Path("templates/index.html")
    assert html_path.exists()
    content = html_path.read_text(encoding="utf-8")

    assert 'id="btn-subtab-cashbook-actual"' in content
    assert 'id="btn-subtab-cashbook-requests"' in content
    assert 'id="cashbook-subtab-actual"' in content
    assert 'id="cashbook-subtab-requests"' in content
    assert 'switchCashbookSubTab' in content
    assert 'static/js/modules/expense_requests.js' in content

    js_file = Path("static/js/modules/expense_requests.js")
    assert js_file.exists()

def test_expense_request_with_image_and_stats():
    from starlette.testclient import TestClient
    from server import app
    client = TestClient(app)

    # Đảm bảo payment account id=1 tồn tại
    conn = get_db()
    cur = conn.cursor()
    cur.execute("INSERT OR IGNORE INTO payment_accounts (id, code, name, account_type, is_active) VALUES (1, 'TM-TEST', 'Két tiền mặt test', 'cash', 1)")
    conn.commit()
    conn.close()

    fake_b64 = "data:image/jpeg;base64,/9j/4AAQSkZJRgABAQEASABIAAD/2wBD..."
    create_res = client.post("/api/expense-requests", json={
        "type": "reimbursement",
        "employee_name": "Trần Thị B",
        "amount": 350000,
        "category": "Chi tiền ship / Vận chuyển",
        "note": "Ship hoả tốc thức ăn thú cưng",
        "bill_image": fake_b64,
        "bank_account_info": "Techcombank - 190367890",
        "due_date": None
    })
    assert create_res.status_code == 200
    created = create_res.json()
    assert created["bill_image"] == fake_b64
    assert created["employee_name"] == "Trần Thị B"
    req_id = created["id"]

    # Kiểm tra stats
    stats_res = client.get("/api/expense-requests")
    assert stats_res.status_code == 200
    data = stats_res.json()
    assert any(x["id"] == req_id for x in data["items"])

    # Duyệt chi
    appr_res = client.post(f"/api/expense-requests/{req_id}/approve", json={
        "account_id": 1,
        "note": "Đã chuyển khoản trả Trần Thị B"
    })
    assert appr_res.status_code == 200
    appr_data = appr_res.json()
    assert appr_data["status"] == "completed"
    assert appr_data["cashbook_id"] is not None


