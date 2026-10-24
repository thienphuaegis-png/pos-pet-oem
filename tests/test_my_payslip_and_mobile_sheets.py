import io
import openpyxl
from starlette.testclient import TestClient

from server import app
from dependencies import get_current_user, require_permission


def test_my_payslip_and_mobile_sheets_export():
    app.dependency_overrides[get_current_user] = lambda: {"id": 1, "name": "Admin", "role": "owner"}
    app.dependency_overrides[require_permission("payroll.manage")] = lambda: {"id": 1, "name": "Admin", "role": "owner"}

    client = TestClient(app)

    # 1. Test Config rules update
    res_rules = client.put("/api/hrm/config/rules", json={
        "late_per_min": 6000,
        "attendance_bonus": 600000
    })
    assert res_rules.status_code == 200, res_rules.text
    assert res_rules.json()["rules"]["late_per_min"] == 6000
    assert res_rules.json()["rules"]["attendance_bonus"] == 600000

    # 2. Test Export mobile sheets
    res_export = client.get("/api/hrm/payroll/2026-10/export-mobile-sheets")
    assert res_export.status_code == 200, res_export.text
    wb = openpyxl.load_workbook(io.BytesIO(res_export.content))
    assert "DU_LIEU_LUONG" in wb.sheetnames
    assert "PHIEU_LUONG_MOBILE" in wb.sheetnames
    ws_mob = wb["PHIEU_LUONG_MOBILE"]
    assert "PHIẾU LƯƠNG" in str(ws_mob["B2"].value)
    assert "VLOOKUP" in str(ws_mob["C5"].value)
    assert "VLOOKUP" in str(ws_mob["C29"].value)

    # 3. Test My Payslip endpoint
    res_payslip = client.get("/api/hrm/my-payslip?month=2026-10")
    assert res_payslip.status_code == 200, res_payslip.text
    data = res_payslip.json()
    assert "staff" in data
    assert data["staff"]["id"] == 1
