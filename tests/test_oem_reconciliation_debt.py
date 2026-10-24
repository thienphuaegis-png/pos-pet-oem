import pytest
from fastapi.testclient import TestClient
import database
from server import app
from tests.auth_helpers import owner_auth_headers

client = TestClient(app, headers=owner_auth_headers())


def test_oem_reconciliation_and_rounding_tolerance():
    conn = database.get_db()
    cur = conn.cursor()

    # Tạo partner test
    cur.execute("DELETE FROM contacts WHERE name = 'Xưởng Test Lucky'")
    cur.execute("INSERT INTO contacts (name, phone, debt, type) VALUES ('Xưởng Test Lucky', '0999888777', 0, 'supplier')")
    partner_id = cur.lastrowid

    # Lấy 2 sản phẩm test
    cur.execute("SELECT id, cost_price FROM products WHERE is_active = 1 LIMIT 2")
    prods = cur.fetchall()
    p1_id = prods[0]["id"]
    p2_id = prods[1]["id"]
    conn.commit()
    conn.close()

    # 1. TẠO ĐƠN OEM ĐẶT CỌC 50% (Chặng 1)
    # Đặt p1: 1000 cái giá 20.000, p2: 1000 cái giá 20.000 -> Thô: 40.000.000
    # CK: 5% -> 38.000.000. VAT: 8% (3.200.000) -> Tổng: 41.200.000
    # Cọc 50%: 20.600.000
    res_create = client.post("/api/oem/orders", json={
        "partner_id": partner_id,
        "oem_warehouse_id": 1,
        "dest_warehouse_id": 1,
        "vat_percent": 8.0,
        "discount_percent": 5.0,
        "deposit_amount": 20600000.0,
        "fund_source": "COMPANY",
        "items": [
            {"product_id": p1_id, "ordered_qty": 1000.0, "unit_price": 20000.0, "vat_rate": 8.0},
            {"product_id": p2_id, "ordered_qty": 1000.0, "unit_price": 20000.0, "vat_rate": 8.0}
        ]
    })
    assert res_create.status_code == 200, res_create.text
    order_id = res_create.json()["id"]

    # 2. KIỂM TRA ĐƠN VỪA TẠO
    res_detail = client.get(f"/api/oem/orders/{order_id}")
    assert res_detail.status_code == 200
    ord_data = res_detail.json()
    assert ord_data["status"] == "DEPOSITED"
    assert ord_data["deposit_amount"] == 20600000.0
    assert ord_data["total_final_amount"] == 41200000.0

    # 3. NHẬN HÀNG THỰC TẾ GIAO THIẾU (Chặng 2)
    # Thực nhận: p1: 600 cái, p2: 500 cái (tổng 1100 cái thay vì 2000 cái)
    # Thô: (600*20k + 500*20k) = 22.000.000
    # CK 5%: 1.100.000 -> 20.900.000. VAT 8%: 1.760.000 -> Tổng thực nhận: 22.660.000
    # Cọc đã trả: 20.600.000 -> Còn nợ đợt 2: 22.660.000 - 20.600.000 = 2.060.000 đ
    items_to_rec = []
    for it in ord_data["items"]:
        qty = 600.0 if it["product_id"] == p1_id else 500.0
        items_to_rec.append({"item_id": it["id"], "received_qty": qty})

    res_rec = client.post(f"/api/oem/orders/{order_id}/receive", json={
        "items": items_to_rec,
        "dest_warehouse_id": 1,
        "auto_adjust_inventory": False
    })
    assert res_rec.status_code == 200, res_rec.text

    # Kiểm tra đơn sau nhận hàng
    res_detail2 = client.get(f"/api/oem/orders/{order_id}")
    ord_data2 = res_detail2.json()
    assert ord_data2["status"] == "RECEIVED"
    assert ord_data2["total_final_amount"] == 22660000.0
    assert ord_data2["remaining_payment"] == 2060000.0

    # Kiểm tra nợ đối tác đã tăng đúng số nợ đợt 2
    conn = database.get_db()
    c_debt = conn.execute("SELECT debt FROM contacts WHERE id = ?", (partner_id,)).fetchone()["debt"]
    assert c_debt == 2060000.0
    conn.close()

    # 4. KIỂM TRA BẢO TOÀN ordered_qty KHI GỌI SỬA ĐƠN ĐÃ NHẬN HÀNG
    # Sửa đơn gọi PUT nhưng không làm mất ordered_qty = 1000.0
    res_edit = client.put(f"/api/oem/orders/{order_id}", json={
        "partner_id": partner_id,
        "oem_warehouse_id": 1,
        "dest_warehouse_id": 1,
        "vat_percent": 8.0,
        "discount_percent": 5.0,
        "fund_source": "COMPANY",
        "note": "Ghi chú sửa sau khi nhận",
        "items": [
            {"product_id": p1_id, "ordered_qty": 600.0, "unit_price": 20000.0, "vat_rate": 8.0},
            {"product_id": p2_id, "ordered_qty": 500.0, "unit_price": 20000.0, "vat_rate": 8.0}
        ]
    })
    assert res_edit.status_code == 200, res_edit.text

    res_detail3 = client.get(f"/api/oem/orders/{order_id}")
    ord_data3 = res_detail3.json()
    # ordered_qty ban đầu (1000.0) phải được bảo toàn!
    for it in ord_data3["items"]:
        assert it["ordered_qty"] == 1000.0
        assert it["received_qty"] in (600.0, 500.0)

    # 5. THANH TOÁN CÔNG NỢ ĐƠN LẺ VỚI SỐ LẺ / DUNG SAI 1 ĐỒNG
    # Giả sử nợ có số lẻ 2060000.72 đ và người dùng nhập 2060001 đ
    conn = database.get_db()
    conn.execute("UPDATE oem_orders SET remaining_payment = 2060000.72 WHERE id = ?", (order_id,))
    conn.execute("UPDATE contacts SET debt = 2060000.72 WHERE id = ?", (partner_id,))
    conn.commit()
    conn.close()

    # Người dùng gõ 2.060.001 đ (lệch 0.28 đ so với nợ thực) -> Phải thành công và cấn trừ hết về 0 đ
    res_pay = client.post("/api/cashflow-debts/pay-order", json={
        "order_type": "OEM",
        "order_id": order_id,
        "amount": 2060001.0,
        "fund_source": "COMPANY",
        "note": "Thanh toán đợt 2"
    })
    assert res_pay.status_code == 200, res_pay.text

    # Kiểm tra nợ đơn và nợ đối tác đã về 0 đ sạch sẽ
    conn = database.get_db()
    ord_final = conn.execute("SELECT remaining_payment, payment_status FROM oem_orders WHERE id = ?", (order_id,)).fetchone()
    assert ord_final["remaining_payment"] == 0.0
    assert ord_final["payment_status"] == "PAID"

    contact_final = conn.execute("SELECT debt FROM contacts WHERE id = ?", (partner_id,)).fetchone()
    assert contact_final["debt"] == 0.0

    # Cleanup
    conn.execute("DELETE FROM oem_order_items WHERE order_id = ?", (order_id,))
    conn.execute("DELETE FROM oem_orders WHERE id = ?", (order_id,))
    conn.execute("DELETE FROM cashbook WHERE contact_id = ?", (partner_id,))
    conn.execute("DELETE FROM contacts WHERE id = ?", (partner_id,))
    conn.commit()
    conn.close()
