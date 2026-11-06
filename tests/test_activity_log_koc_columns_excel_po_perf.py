import io
import openpyxl
from fastapi.testclient import TestClient

import activity_logger
from server import app
from services import koc_service as K
from tests.auth_helpers import owner_auth_headers


def _build_mock_thanh10_workbook_bytes() -> bytes:
    wb = openpyxl.Workbook()
    ws = wb.active
    ws.title = "  THANH 102026"

    # Header 2 dòng giống hệt sheet thật THANH 102026 (dòng 13 & 14)
    ws.cell(13, 1, "STT")
    ws.cell(13, 3, "KOC")
    ws.cell(13, 4, "LINK KOC")
    ws.cell(13, 6, "Mẫu đề xuất")
    ws.cell(13, 8, "Duyệt KOC")
    ws.cell(13, 18, "Số video đã trả")
    ws.cell(13, 19, "Link Air")
    ws.cell(13, 24, "Link Phụ Cột X")

    ws.cell(14, 1, "STT")
    ws.cell(14, 3, "KOC")
    ws.cell(14, 4, "LINK KOC")
    ws.cell(14, 6, "Mẫu đề xuất")
    ws.cell(14, 18, "Số video đã trả")
    ws.cell(14, 19, "Link Air")
    ws.cell(14, 24, "Link Phụ Cột X")

    v1 = "https://www.tiktok.com/@bupetshop123/video/7693854393304665365"
    v2 = "https://www.tiktok.com/@bupetshop123/video/7693854393304665366"
    v_col_d_demo = "https://www.tiktok.com/@miupetshop2/video/7678296930660650260"
    v3 = "https://www.tiktok.com/@miupetshop2/video/7693854393304665367"
    v_col_x = "https://www.tiktok.com/@miupetshop2/video/7693854393304665399"

    # Dòng 15: dán trùng v1 hai lần + v2 (3 link thô -> 2 video duy nhất)
    ws.cell(15, 3, "ID: bupetshop123\nFollow: 817\nDoanh thu: 1M+")
    ws.cell(15, 4, "https://www.tiktok.com/@bupetshop123")
    ws.cell(15, 6, "xịt ve")
    ws.cell(15, 8, "DUYỆT")
    ws.cell(15, 18, 3)
    ws.cell(15, 19, f"{v1} {v1}\n{v2}")

    # Dòng 16: cột D (LINK KOC) dán nhầm link video demo cũ -> KHÔNG ĐƯỢC HÚT NHẦM khi đọc cột S!
    ws.cell(16, 3, "ID: miupetshop2\nFollow: 2K")
    ws.cell(16, 4, v_col_d_demo)
    ws.cell(16, 6, "men khử mùi")
    ws.cell(16, 8, "DUYỆT")
    ws.cell(16, 18, 1)
    ws.cell(16, 19, v3)
    ws.cell(16, 24, v_col_x)

    buf = io.BytesIO()
    wb.save(buf)
    return buf.getvalue()


def test_activity_log_staff_options_and_friendly_labels():
    assert activity_logger._describe("POST", "/api/suppliers/42/assign-items") == "Gán mặt hàng cho nhà cung cấp"
    assert activity_logger._describe("POST", "/api/marketplace/koc/sources/2/sync") == "Đồng bộ chiến dịch KOC từ Sheet"
    assert activity_logger._describe("PUT", "/api/marketplace/koc/videos/68") == "Cập nhật lượt xem / KPI video KOC"
    assert "/api/marketplace/koc/inspect-sheet" in activity_logger._IGNORED_ACTIVITY_PATHS
    assert "/api/marketplace/koc/inspect-columns" in activity_logger._IGNORED_ACTIVITY_PATHS

    client = TestClient(app, headers=owner_auth_headers())
    r = client.get("/api/settings/activity-log?days=90&limit=50")
    assert r.status_code == 200
    data = r.json()
    assert "logs" in data
    assert "staff_options" in data
    assert len(data["staff_options"]) >= 1
    assert any(s["role"] in ("owner", "admin") for s in data["staff_options"])


def test_koc_column_picker_dedup_anti_duplicate_source_and_excel_exports(monkeypatch):
    xlsx_bytes = _build_mock_thanh10_workbook_bytes()
    fake_sheet_url = "https://docs.google.com/spreadsheets/d/FAKE_SHEET_102026_COLPICKER_TEST/edit"
    monkeypatch.setattr(K, "download_sheet_xlsx_bytes", lambda url, use_cache=False: ("FAKE_SHEET_102026_COLPICKER_TEST", xlsx_bytes))

    client = TestClient(app, headers=owner_auth_headers())
    created_ids = []
    try:
        # 1. Inspect columns của tab THANH 102026
        r_cols = client.post("/api/marketplace/koc/inspect-columns", json={
            "sheet_url": fake_sheet_url,
            "tab_name": "THANH 102026",
        })
        assert r_cols.status_code == 200
        col_data = r_cols.json()
        assert col_data["suggested"]["video_col"] == "S"
        assert col_data["suggested"]["koc_col"] == "C"
        assert col_data["suggested"]["product_col"] == "F"
        col_s = next(c for c in col_data["columns"] if c["col"] == "S")
        assert col_s["video_links"] == 4
        assert col_s["unique_videos"] == 3

        # 2. Tạo nguồn chính #1 và đồng bộ từ Cột S -> đúng 3 video duy nhất (4 link thô, gộp 1 link trùng, KHÔNG dính link ở Cột D!)
        r_s1 = client.post("/api/marketplace/koc/sources", json={
            "name": "THANH 10/2026",
            "sheet_url": fake_sheet_url,
            "month": "2026-10",
            "koc_tab_name": "  THANH 102026",
            "column_mapping": {"video_col": "S", "koc_col": "C", "product_col": "F"},
        })
        assert r_s1.status_code == 200
        sid1 = r_s1.json()["id"]
        created_ids.append(sid1)

        r_sync1 = client.post(f"/api/marketplace/koc/sources/{sid1}/sync")
        assert r_sync1.status_code == 200
        s1_res = r_sync1.json()
        assert s1_res["videos_synced"] == 3
        assert s1_res["raw_links_found"] == 4
        assert s1_res["dup_links_in_sheet"] == 1
        assert s1_res["video_col"] == "S"

        vids1 = client.get(f"/api/marketplace/koc/videos?source_id={sid1}").json()["videos"]
        vkeys1 = {v["video_key"] for v in vids1}
        assert "7678296930660650260" not in vkeys1, "Không được hút nhầm link ở cột D (LINK KOC)"
        assert len(vkeys1) == 3

        # Chấm duyệt tay 1 video trong sid1
        approved_vid_id = vids1[0]["id"]
        client.put(f"/api/marketplace/koc/videos/{approved_vid_id}", json={"views": 150, "manual_kpi": 1})

        # 3. Cố tình bấm '+ Thêm / Đổi Link Google Sheet' lần nữa (id=None) cùng tên & cùng tháng & cùng tab -> PHẢI gộp vào sid1 thay vì đẻ dòng trùng!
        r_dup = client.post("/api/marketplace/koc/sources", json={
            "name": "THANH 10/2026",
            "sheet_url": fake_sheet_url,
            "month": "2026-10",
            "video_tab_name": "  THANH 102026",
        })
        assert r_dup.status_code == 200
        assert r_dup.json()["id"] == sid1
        assert r_dup.json()["merged_existing"] is True

        # 4. Đổi cột lấy link sang Cột X ("Link Phụ Cột X") -> lấy bài ở Cột X VÀ vẫn bảo toàn 100% bài đã duyệt tay (manual_kpi=1)!
        client.post("/api/marketplace/koc/sources", json={
            "id": sid1,
            "name": "THANH 10/2026",
            "sheet_url": fake_sheet_url,
            "month": "2026-10",
            "koc_tab_name": "  THANH 102026",
            "column_mapping": {"video_col": "X", "koc_col": "C", "product_col": "F"},
        })
        r_sync_x = client.post(f"/api/marketplace/koc/sources/{sid1}/sync")
        assert r_sync_x.status_code == 200
        assert r_sync_x.json()["video_col"] == "X"
        vids_after_x = client.get(f"/api/marketplace/koc/videos?source_id={sid1}").json()["videos"]
        vkeys_after_x = {v["video_key"] for v in vids_after_x}
        assert "7693854393304665399" in vkeys_after_x
        assert any(v["id"] == approved_vid_id and v["manual_kpi"] == 1 for v in vids_after_x), "Phải bảo toàn video đã duyệt tay!"

        # 5. Kiểm tra Xuất Excel 3 Sheet ở màn KOC (/api/marketplace/koc/export-excel)
        r_xl_koc = client.get(f"/api/marketplace/koc/export-excel?month=2026-10&source_id={sid1}")
        assert r_xl_koc.status_code == 200
        assert "spreadsheetml" in r_xl_koc.headers["content-type"]
        wb_koc = openpyxl.load_workbook(io.BytesIO(r_xl_koc.content))
        assert wb_koc.sheetnames == ["Tổng Hợp Chiến Dịch", "Chi Tiết Link Video", "Tổng Hợp Theo KOC"]
        ws_sum = wb_koc["Tổng Hợp Chiến Dịch"]
        assert any(ws_sum.cell(r, 2).value == "THANH 10/2026" for r in range(1, ws_sum.max_row + 1))
        assert ws_sum.cell(ws_sum.max_row, 2).value == "TỔNG CỘNG"

        # 6. Kiểm tra Xuất Excel ở màn HRM Hoa Hồng & Tip (/api/hrm/commissions/2026-10/export-excel)
        r_xl_hrm = client.get("/api/hrm/commissions/2026-10/export-excel")
        assert r_xl_hrm.status_code == 200
        assert "spreadsheetml" in r_xl_hrm.headers["content-type"]
        wb_hrm = openpyxl.load_workbook(io.BytesIO(r_xl_hrm.content))
        assert "Hoa Hồng & Tip" in wb_hrm.sheetnames
        ws_hrm = wb_hrm["Hoa Hồng & Tip"]
        assert ws_hrm.cell(ws_hrm.max_row, 3).value == "TỔNG CỘNG TOÀN SHOP"
    finally:
        for sid in created_ids:
            client.delete(f"/api/marketplace/koc/sources/{sid}")


def test_supplier_contacts_fast_cte_debt_accuracy():
    client = TestClient(app, headers=owner_auth_headers())
    supp_id = None
    try:
        r_create = client.post("/api/contacts", json={
            "name": "NCC Test Tốc Độ Cao 999",
            "phone": "0909998877",
            "type": "supplier",
            "initial_debt_company": 1_500_000,
            "initial_debt_personal": 500_000,
        })
        assert r_create.status_code == 200
        supp_id = r_create.json()["id"]

        r_list = client.get("/api/contacts?type=supplier&search=NCC%20Test%20T%E1%BB%91c%20%C4%90%E1%BB%99")
        assert r_list.status_code == 200
        rows = r_list.json()
        target = next(x for x in rows if x["id"] == supp_id)
        assert target["debt_company"] == 1_500_000
        assert target["debt_personal"] == 500_000
        assert target["total_debt"] == 2_000_000
        assert target["debt"] == 2_000_000
    finally:
        if supp_id:
            client.delete(f"/api/contacts/{supp_id}")
