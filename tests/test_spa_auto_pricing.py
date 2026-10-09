import pytest
from fastapi.testclient import TestClient
from server import app
from database import get_db

client = TestClient(app)

def test_spa_auto_pricing_case_insensitivity_and_smart_weight():
    """Kiểm tra API /api/pricing/calculate-spa:
    1. So khớp không phân biệt chữ hoa/thường (Combo Vip 1 vs combo vip 1).
    2. Dải cân nặng chuẩn và tự động lấy mức cao nhất khi cân nặng vượt trần.
    """
    db = get_db()
    cur = db.cursor()

    # Dọn dẹp & tạo dữ liệu bảng giá test
    cur.execute("DELETE FROM pet_service_pricing WHERE service_name LIKE 'Test Svc Case%'")
    cur.execute("""
        INSERT INTO pet_service_pricing (service_name, category, min_weight, max_weight, price)
        VALUES ('Test Svc Case', 'Tắm Bé', 0.0, 2.0, 100000.0)
    """)
    cur.execute("""
        INSERT INTO pet_service_pricing (service_name, category, min_weight, max_weight, price)
        VALUES ('test svc case', 'Tắm Bé', 2.0, 5.0, 150000.0)
    """)
    cur.execute("""
        INSERT INTO pet_service_pricing (service_name, category, min_weight, max_weight, price)
        VALUES ('TEST SVC CASE', 'Tắm Bé', 5.0, 10.0, 200000.0)
    """)
    db.commit()
    db.close()

    # Case 1: Tên viết hoa 'TEST SVC CASE', cân nặng 1.5kg -> khớp khung 0-2kg: 100.000 đ
    res1 = client.post("/api/pricing/calculate-spa", json={
        "service_name": "TEST SVC CASE",
        "weight": 1.5,
        "customer_id": None
    })
    assert res1.status_code == 200
    assert res1.json()["final_price"] == 100000.0

    # Case 2: Tên viết thường 'test svc case', cân nặng 3.5kg -> khớp khung 2-5kg: 150.000 đ
    res2 = client.post("/api/pricing/calculate-spa", json={
        "service_name": "test svc case",
        "weight": 3.5,
        "customer_id": None
    })
    assert res2.status_code == 200
    assert res2.json()["final_price"] == 150000.0

    # Case 3: Cân nặng giáp ranh đúng 2.0kg -> lọt vào khung 2-5kg: 150.000 đ
    res3 = client.post("/api/pricing/calculate-spa", json={
        "service_name": "Test Svc Case",
        "weight": 2.0,
        "customer_id": None
    })
    assert res3.status_code == 200
    assert res3.json()["final_price"] == 150000.0

    # Case 4: Cân nặng vượt trần khung tối đa (15.0kg, khung cao nhất là 10.0kg) -> tự động lấy mức cao nhất 200.000 đ
    res4 = client.post("/api/pricing/calculate-spa", json={
        "service_name": "Test Svc Case",
        "weight": 15.0,
        "customer_id": None
    })
    assert res4.status_code == 200
    assert res4.json()["final_price"] == 200000.0

    # Cleanup
    db = get_db()
    cur = db.cursor()
    cur.execute("DELETE FROM pet_service_pricing WHERE service_name LIKE 'Test Svc Case%'")
    db.commit()
    db.close()
