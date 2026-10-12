import pytest
from starlette.testclient import TestClient
from server import app
from database import get_db, init_db
from routers.auth import _make_token

client = TestClient(app)

def test_cashbook_categories_api_crud():
    saved_overrides = dict(app.dependency_overrides)
    app.dependency_overrides.clear()
    try:
        init_db()
        conn = get_db()
        cur = conn.cursor()
        # Tạo staff admin
        cur.execute("INSERT OR REPLACE INTO staff (id, name, role, is_active, token_version) VALUES (9999, 'Admin Test', 'owner', 1, 0)")
        conn.commit()
        conn.close()

        token = _make_token(9999, token_version=0)
        headers = {"Authorization": f"Bearer {token}"}

        # 1. Lấy danh sách hạng mục
        res_list = client.get("/api/cashbook/categories?type=all")
        assert res_list.status_code == 200
        cats = res_list.json()
        assert len(cats) >= 5

        # 2. Tạo hạng mục mới
        import time
        ts = int(time.time())
        new_name = f"Chi test văn phòng phẩm {ts}"
        res_create = client.post("/api/cashbook/categories", headers=headers, json={
            "name": new_name,
            "type": "out",
            "sort_order": 99
        })
        assert res_create.status_code == 200, res_create.text
        created_data = res_create.json()
        cat_id = created_data["id"]
        assert created_data["name"] == new_name
        assert created_data["type"] == "out"

        # 3. Thử tạo trùng tên -> lỗi 400
        res_dup = client.post("/api/cashbook/categories", headers=headers, json={
            "name": new_name,
            "type": "out"
        })
        assert res_dup.status_code == 400
        assert "đã tồn tại" in res_dup.text

        # 4. Sửa tên hạng mục
        updated_name = f"Chi VPP đã sửa {ts}"
        res_edit = client.put(f"/api/cashbook/categories/{cat_id}", headers=headers, json={
            "name": updated_name,
            "type": "both"
        })
        assert res_edit.status_code == 200, res_edit.text

        # Kiểm tra danh sách thấy tên mới
        res_get = client.get("/api/cashbook/categories?type=both")
        assert res_get.status_code == 200
        names = [c["name"] for c in res_get.json()]
        assert updated_name in names

        # 5. Xóa hạng mục
        res_del = client.delete(f"/api/cashbook/categories/{cat_id}", headers=headers)
        assert res_del.status_code == 200
        assert res_del.json()["status"] == "ok"

        # Kiểm tra đã bị xóa
        res_check = client.get("/api/cashbook/categories?type=all")
        names_after = [c["name"] for c in res_check.json()]
        assert updated_name not in names_after

    finally:
        app.dependency_overrides.update(saved_overrides)
