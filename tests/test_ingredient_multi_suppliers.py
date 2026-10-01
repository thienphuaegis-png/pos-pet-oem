import pytest
import sqlite3
from database import get_db
from schemas import IngredientCreate, IngredientUpdate
from routers.inventory import create_ingredient, update_ingredient, list_ingredients, get_ingredient_detail
from routers.purchases import get_supplier_items

def test_ingredient_multiple_suppliers_lifecycle():
    conn = get_db()
    cur = conn.cursor()
    
    # 1. Setup 2 nhà cung cấp test
    cur.execute("DELETE FROM contacts WHERE phone IN ('0919111222', '0919333444')")
    cur.execute("DELETE FROM ingredients WHERE code = 'TEST-NL-MULTI'")
    conn.commit()

    cur.execute("INSERT INTO contacts (type, name, phone, debt) VALUES ('supplier', 'NCC Alpha Test', '0919111222', 0)")
    s1_id = cur.lastrowid
    cur.execute("INSERT INTO contacts (type, name, phone, debt) VALUES ('supplier', 'NCC Beta Test', '0919333444', 0)")
    s2_id = cur.lastrowid
    conn.commit()
    conn.close()

    user = {"role": "owner", "id": 1}

    try:
        # 2. Tạo nguyên liệu gắn 2 NCC
        req_create = IngredientCreate(
            code="TEST-NL-MULTI",
            name="Cát Vệ Sinh Đậu Nành Test",
            unit="bao",
            type="IS_PHYSICAL",
            initial_stock=10,
            initial_cost=65000,
            supplier_ids=[s1_id, s2_id]
        )
        res_create = create_ingredient(req_create, user=user)
        assert res_create["status"] == "ok"
        ing_id = res_create["id"]

        # 3. Kiểm tra list_ingredients
        ings = list_ingredients()
        target = next((x for x in ings if x["id"] == ing_id), None)
        assert target is not None
        assert "NCC Alpha Test" in target["supplier_names"]
        assert "NCC Beta Test" in target["supplier_names"]
        supp_ids = [int(x) for x in target["supplier_ids"].split(",")]
        assert s1_id in supp_ids
        assert s2_id in supp_ids

        # 4. Kiểm tra get_ingredient_detail
        detail = get_ingredient_detail(ing_id)
        assert "suppliers" in detail
        assert len(detail["suppliers"]) == 2
        detail_supp_ids = [s["id"] for s in detail["suppliers"]]
        assert s1_id in detail_supp_ids
        assert s2_id in detail_supp_ids

        # 5. Kiểm tra API get_supplier_items của purchases: cả 2 NCC đều thấy nguyên liệu này
        items_s1 = get_supplier_items(s1_id)
        assert any(it["id"] == ing_id and it["item_type"] == "ingredient" and it["cost_price"] == 65000 for it in items_s1)

        items_s2 = get_supplier_items(s2_id)
        assert any(it["id"] == ing_id and it["item_type"] == "ingredient" and it["cost_price"] == 65000 for it in items_s2)

        # 6. Cập nhật: chỉ giữ lại NCC Beta (s2_id) và đổi giá 70000
        req_update = IngredientUpdate(
            code="TEST-NL-MULTI",
            name="Cát Vệ Sinh Đậu Nành Test VIP",
            unit="bao",
            type="IS_PHYSICAL",
            latest_cost=70000,
            supplier_ids=[s2_id]
        )
        res_update = update_ingredient(ing_id, req_update, user=user)
        assert res_update["status"] == "ok"

        # 7. Kiểm tra lại: NCC Alpha không còn, NCC Beta còn
        ings_after = list_ingredients()
        target_after = next((x for x in ings_after if x["id"] == ing_id), None)
        assert "NCC Beta Test" in target_after["supplier_names"]
        assert "NCC Alpha Test" not in (target_after["supplier_names"] or "")

        items_s1_after = get_supplier_items(s1_id)
        assert not any(it["id"] == ing_id and it["item_type"] == "ingredient" for it in items_s1_after)

        items_s2_after = get_supplier_items(s2_id)
        item_s2 = next(it for it in items_s2_after if it["id"] == ing_id and it["item_type"] == "ingredient")
        assert item_s2["cost_price"] == 70000

    finally:
        # Dọn dẹp
        conn = get_db()
        cur = conn.cursor()
        cur.execute("DELETE FROM contacts WHERE phone IN ('0919111222', '0919333444')")
        cur.execute("DELETE FROM ingredients WHERE code = 'TEST-NL-MULTI'")
        cur.execute("DELETE FROM supplier_items WHERE ingredient_id = (SELECT id FROM ingredients WHERE code = 'TEST-NL-MULTI')")
        conn.commit()
        conn.close()
