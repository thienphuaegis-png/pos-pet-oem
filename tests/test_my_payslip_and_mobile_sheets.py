import io
import openpyxl
from starlette.testclient import TestClient

from server import app
from dependencies import get_current_user, require_permission


def test_my_payslip_and_mobile_sheets_export():
    app.dependency_overrides[get_current_user] = lambda: {"id": 1, "name": "Admin", "role": "owner"}
    app.dependency_overrides[require_permission("payroll.manage")] = lambda: {"id": 1, "name": "Admin", "role": "owner"}

    client = TestClient(app)

    try:
        # 1. Test Config rules update
        res_rules = client.put("/api/hrm/config/rules", json={
            "late_per_min": 6000,
            "attendance_bonus": 600000
        })
        assert res_rules.status_code == 200, res_rules.text
        assert res_rules.json()["rules"]["late_per_min"] == 6000
        assert res_rules.json()["rules"]["attendance_bonus"] == 600000

        # Reset back to default
        client.put("/api/hrm/config/rules", json={
            "late_per_min": 5000,
            "attendance_bonus": 500000
        })

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
    finally:
        app.dependency_overrides.clear()


def test_hrm_blocks_and_quick_account():
    app.dependency_overrides[get_current_user] = lambda: {"id": 1, "name": "Admin", "role": "owner"}
    app.dependency_overrides[require_permission("payroll.manage")] = lambda: {"id": 1, "name": "Admin", "role": "owner"}

    client = TestClient(app)
    try:
        # 1. Test Create new block
        res_block = client.post("/api/hrm/config/blocks", json={
            "name": "Ca Gãy Thử Nghiệm",
            "start_time": "09:00",
            "end_time": "18:00",
            "lunch_minutes": 60,
            "std_hours": 8,
            "off_sunday": 1,
            "monthly_off_days": 0
        })
        assert res_block.status_code == 200, res_block.text
        block_id = res_block.json()["id"]

        # 2. Test Create staff assigned to this block
        res_staff = client.post("/api/hrm/employees", json={
            "name": "Nguyễn Văn Thợ Spa Test",
            "phone": "0987654321",
            "employee_code": "SPATEST01",
            "work_block_id": block_id,
            "base_salary": 7000000,
            "allowance": 500000,
            "is_spa_worker": 1
        })
        assert res_staff.status_code == 200, res_staff.text
        staff_id = res_staff.json()["id"]

        # 3. Try to delete block -> Should fail because staff is assigned
        res_del_fail = client.delete(f"/api/hrm/config/blocks/{block_id}")
        assert res_del_fail.status_code == 400
        assert "Không thể xóa khối" in res_del_fail.json()["detail"]

        # 4. Check list employees has_account == 0
        res_list = client.get("/api/hrm/employees")
        assert res_list.status_code == 200
        created_staff = next((s for s in res_list.json() if s["id"] == staff_id), None)
        assert created_staff is not None
        assert created_staff["has_account"] == 0

        # 5. Quick grant account
        res_grant = client.post(f"/api/hrm/employees/{staff_id}/quick-account", json={
            "username": "spatest01",
            "password": "password123",
            "role": "staff"
        })
        assert res_grant.status_code == 200, res_grant.text

        # 6. Check list employees has_account == 1
        res_list2 = client.get("/api/hrm/employees")
        created_staff2 = next((s for s in res_list2.json() if s["id"] == staff_id), None)
        assert created_staff2 is not None
        assert created_staff2["has_account"] == 1
        assert created_staff2["username"] == "spatest01"

        # Cleanup: unassign staff and delete block
        client.put(f"/api/hrm/employees/{staff_id}", json={"work_block_id": 1})
        res_del_ok = client.delete(f"/api/hrm/config/blocks/{block_id}")
        assert res_del_ok.status_code == 200, res_del_ok.text
    finally:
        app.dependency_overrides.clear()

