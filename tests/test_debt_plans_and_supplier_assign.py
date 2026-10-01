import pytest
from fastapi.testclient import TestClient
import database
from server import app

client = TestClient(app)

@pytest.fixture(autouse=True)
def setup_db():
    database.init_db()
    conn = database.get_db()
    cur = conn.cursor()
    # Tạo nhà cung cấp mẫu
    cur.execute("DELETE FROM contacts WHERE phone = '0988776655'")
    cur.execute("""
        INSERT INTO contacts (name, phone, type, debt, initial_debt_personal, initial_debt_company)
        VALUES ('NCC Test Hẹn Nợ', '0988776655', 'supplier', 100000000, 60000000, 40000000)
    """)
    supp_id = cur.lastrowid
    
    # Tạo sản phẩm và nguyên liệu mẫu
    cur.execute("DELETE FROM products WHERE code = 'TEST_PROD_ASSIGN'")
    cur.execute("""
        INSERT INTO products (code, name, type, unit, cost_price, sell_price, is_active)
        VALUES ('TEST_PROD_ASSIGN', 'Sản phẩm gán mẫu', 'product', 'cái', 50000, 80000, 1)
    """)
    prod_id = cur.lastrowid

    cur.execute("DELETE FROM ingredients WHERE code = 'TEST_ING_ASSIGN'")
    cur.execute("""
        INSERT INTO ingredients (code, name, type, unit)
        VALUES ('TEST_ING_ASSIGN', 'Nguyên liệu gán mẫu', 'IS_PHYSICAL', 'kg')
    """)
    ing_id = cur.lastrowid

    conn.commit()
    conn.close()

    yield {
        "supp_id": supp_id,
        "prod_id": prod_id,
        "ing_id": ing_id
    }

def test_supplier_assignable_items_and_batch_assign(setup_db):
    supp_id = setup_db["supp_id"]
    prod_id = setup_db["prod_id"]
    ing_id = setup_db["ing_id"]

    # 1. Lấy danh sách gán
    res = client.get(f"/api/suppliers/{supp_id}/assignable-items")
    assert res.status_code == 200
    data = res.json()
    assert "items" in data
    items = data["items"]
    assert any(x["id"] == prod_id and x["item_type"] == "product" for x in items)
    assert any(x["id"] == ing_id and x["item_type"] == "ingredient" for x in items)

    # 2. Gán 2 món này cho NCC
    payload = {
        "items": [
            {"item_type": "product", "item_id": prod_id, "cost_price": 50000},
            {"item_type": "ingredient", "item_id": ing_id, "cost_price": 30000}
        ]
    }
    assign_res = client.post(f"/api/suppliers/{supp_id}/assign-items", json=payload)
    assert assign_res.status_code == 200
    assert assign_res.json()["status"] == "ok"

    # 3. Kiểm tra lại danh sách đã được đánh dấu is_assigned = True
    check_res = client.get(f"/api/suppliers/{supp_id}/assignable-items")
    check_data = check_res.json()["items"]
    prod_item = next(x for x in check_data if x["id"] == prod_id and x["item_type"] == "product")
    ing_item = next(x for x in check_data if x["id"] == ing_id and x["item_type"] == "ingredient")
    assert prod_item["is_assigned"] is True
    assert ing_item["is_assigned"] is True

def get_auth_headers():
    login_res = client.post("/api/auth/login", data={"username": "admin", "password": "admin123"})
    if login_res.status_code == 200:
        token = login_res.json().get("access_token")
        return {"Authorization": f"Bearer {token}"}
    return {}

def test_debt_payment_plan_flow(setup_db):
    supp_id = setup_db["supp_id"]
    headers = get_auth_headers()

    # 1. Tạo kế hoạch hẹn trả 60tr không theo đơn (trả 1 phần công nợ)
    plan_payload = {
        "supplier_id": supp_id,
        "plan_date": "2026-10-08",
        "amount": 60000000,
        "fund_source": "PERSONAL",
        "note": "Hẹn trả nợ trước cuối tuần"
    }
    res = client.post("/api/cashflow-debts/payment-plans", json=plan_payload, headers=headers)
    assert res.status_code == 200
    plan_data = res.json()
    assert plan_data["status"] == "ok"
    plan_id = plan_data["id"]

    # 2. Kiểm tra dự báo dòng tiền xuất hiện khoản 60tr này
    forecast_res = client.get("/api/oem/cashflow-forecast")
    assert forecast_res.status_code == 200
    fc = forecast_res.json()
    items = fc["items"]
    debt_plan_item = next((x for x in items if x.get("order_type") == "DEBT_PLAN" and x.get("id") == plan_id), None)
    assert debt_plan_item is not None
    assert debt_plan_item["amount"] == 60000000
    assert debt_plan_item["fund_source"] == "PERSONAL"
    assert debt_plan_item["expected_delivery_date"] == "2026-10-08"

    # Kiểm tra tổng dự báo
    assert fc["total_forecast"] >= 60000000
    assert fc["total_personal"] >= 60000000

    # 3. Hủy kế hoạch hẹn trả
    del_res = client.delete(f"/api/cashflow-debts/payment-plans/{plan_id}", headers=headers)
    assert del_res.status_code == 200

    # Sau khi hủy, khoản này biến mất khỏi dự báo
    forecast_res2 = client.get("/api/oem/cashflow-forecast")
    fc2 = forecast_res2.json()
    assert not any(x.get("order_type") == "DEBT_PLAN" and x.get("id") == plan_id for x in fc2["items"])
