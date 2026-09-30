import pytest
from database import get_db, init_db
from routers.partners import create_contact, update_contact, adjust_contact_debt, ContactCreate, ContactUpdate, ContactDebtAdjust
from routers.oem import list_debt_suppliers, pay_supplier_debt, SupplierDebtPaymentRequest

def test_supplier_debt_company_personal_split():
    init_db()
    
    # 1. Tạo NCC có nợ cty và nợ cá nhân đầu kỳ
    req = ContactCreate(
        name="NCC Bao Bì Tiến Phát Test",
        phone="0911223344",
        type="supplier",
        initial_debt_company=3000000.0,
        initial_debt_personal=1500000.0
    )
    user = {"role": "owner", "id": 1}
    created = create_contact(req, user=user)
    supp_id = created["id"]
    
    try:
        # Kiểm tra DB lưu đúng nợ phân tách và tổng nợ
        conn = get_db()
        cur = conn.cursor()
        cur.execute("SELECT debt, initial_debt_company, initial_debt_personal FROM contacts WHERE id = ?", (supp_id,))
        row = dict(cur.fetchone())
        conn.close()
        
        assert row["initial_debt_company"] == 3000000.0
        assert row["initial_debt_personal"] == 1500000.0
        assert row["debt"] == 4500000.0
        
        # 2. Kiểm tra list_debt_suppliers trả đúng
        suppliers = list_debt_suppliers()
        s = next((item for item in suppliers if item["id"] == supp_id), None)
        assert s is not None
        assert s["debt_company"] >= 3000000.0
        assert s["debt_personal"] >= 1500000.0
        assert s["total_debt"] >= 4500000.0
        
        # 3. Điều chỉnh nợ qua adjust_contact_debt (API nhanh)
        adj_req = ContactDebtAdjust(
            initial_debt_company=2000000.0,
            initial_debt_personal=1000000.0,
            note="Chỉnh sửa đầu kỳ"
        )
        res_adj = adjust_contact_debt(supp_id, adj_req, user=user)
        assert res_adj["status"] == "ok"
        assert res_adj["initial_debt_company"] == 2000000.0
        assert res_adj["initial_debt_personal"] == 1000000.0
        assert res_adj["new_debt"] == 3000000.0
        
        # 4. Thanh toán nợ Quỹ Công Ty dù không có đơn PO/OEM nào
        pay_c_req = SupplierDebtPaymentRequest(
            supplier_id=supp_id,
            amount=500000.0,
            fund_source="COMPANY",
            note="Trả nợ cty đợt 1"
        )
        pay_res = pay_supplier_debt(pay_c_req, user=user)
        assert pay_res["status"] == "ok"
        assert pay_res["paid_amount"] == 500000.0
        
        # Kiểm tra sau khi trả nợ cty: nợ cty còn 1.5tr, nợ cá nhân giữ nguyên 1tr, tổng nợ còn 2.5tr
        conn = get_db()
        cur = conn.cursor()
        cur.execute("SELECT debt, initial_debt_company, initial_debt_personal FROM contacts WHERE id = ?", (supp_id,))
        row_after = dict(cur.fetchone())
        conn.close()
        
        assert row_after["initial_debt_company"] == 1500000.0
        assert row_after["initial_debt_personal"] == 1000000.0
        assert row_after["debt"] == 2500000.0
        
    finally:
        conn = get_db()
        cur = conn.cursor()
        cur.execute("DELETE FROM contacts WHERE id = ?", (supp_id,))
        cur.execute("DELETE FROM cashbook WHERE contact_id = ?", (supp_id,))
        conn.commit()
        conn.close()
