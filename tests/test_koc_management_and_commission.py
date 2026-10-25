import os
from fastapi.testclient import TestClient

from database import get_db
from server import app
from services import koc_service as K
from services import payroll_service as ps
from tests.auth_helpers import owner_auth_headers


def test_koc_sheet_parsing_and_commission_integration(monkeypatch):
    client = TestClient(app, headers=owner_auth_headers())

    # Dùng bản chụp thật từ Google Sheet của anh đã tải về scratch (hoặc tải trực tiếp nếu chưa có)
    scratch_xlsx = "C:/Users/thien/AppData/Local/hermes/cache/scratch/koc_sheet.xlsx"
    if os.path.exists(scratch_xlsx):
        with open(scratch_xlsx, "rb") as f:
            sample_bytes = f.read()
    else:
        _, sample_bytes = K.download_sheet_xlsx_bytes(
            "https://docs.google.com/spreadsheets/d/1TRCLEZtxbGBvsLrFU9pIUTqrlWeAMUrkTr2B4aBJeVA/edit?gid=1807044221#gid=1807044221"
        )

    monkeypatch.setattr(K, "download_sheet_xlsx_bytes", lambda url: ("1TRCLEZtxbGBvsLrFU9pIUTqrlWeAMUrkTr2B4aBJeVA", sample_bytes))

    # 1. Inspect danh sách tab từ link Google Sheet bất kỳ
    res_inspect = client.post("/api/marketplace/koc/inspect-sheet", json={
        "sheet_url": "https://docs.google.com/spreadsheets/d/1TRCLEZtxbGBvsLrFU9pIUTqrlWeAMUrkTr2B4aBJeVA/edit?gid=1807044221"
    })
    assert res_inspect.status_code == 200
    tabs = res_inspect.json()["tabs"]
    tab_names = [t["name"] for t in tabs]
    assert "2" in tab_names
    assert "Tiktok" in tab_names
    assert "THANH 72026" in tab_names

    # Tìm nhân viên Hà Đặng Phương Thanh (ID 23) để gán phụ trách
    conn = get_db()
    cur = conn.cursor()
    cur.execute("SELECT id FROM staff WHERE name LIKE '%Phương Thanh%' OR is_active = 1 ORDER BY id LIMIT 1")
    staff_row = cur.fetchone()
    staff_id = staff_row["id"]
    conn.close()

    # 2. Tạo nguồn KOC tháng 2026-07 (tab THANH 72026 + tab '2' tương ứng gid=1807044221)
    res_save = client.post("/api/marketplace/koc/sources", json={
        "name": "Test KOC Thanh Tháng 7/2026",
        "sheet_url": "https://docs.google.com/spreadsheets/d/1TRCLEZtxbGBvsLrFU9pIUTqrlWeAMUrkTr2B4aBJeVA/edit?gid=1807044221",
        "month": "2026-07",
        "staff_id": staff_id,
        "koc_tab_name": "THANH 72026",
        "video_tab_name": "2",
        "rules": {
            "min_views": 200,
            "kpi_deduct_videos": 0,
            "rate_per_video": 10000,
            "viral_min_views": 1000,
            "viral_bonus": 0,
        }
    })
    assert res_save.status_code == 200
    source_id = res_save.json()["id"]

    try:
        # 3. Đồng bộ dữ liệu từ Sheet
        res_sync = client.post(f"/api/marketplace/koc/sources/{source_id}/sync")
        assert res_sync.status_code == 200
        sync_data = res_sync.json()
        assert sync_data["profiles_synced"] >= 50
        assert sync_data["videos_synced"] >= 200

        # 4. Kiểm tra danh sách nguồn & tính toán hoa hồng
        res_list = client.get("/api/marketplace/koc/sources?month=2026-07")
        assert res_list.status_code == 200
        sources = res_list.json()["sources"]
        target_src = next(s for s in sources if s["id"] == source_id)
        stats = target_src["stats"]
        # Trong tab '2' sau khi khử trùng video_id có 97 video duy nhất >= 200 view -> 97 * 10,000 = 970,000đ
        assert stats["qualified_videos"] == 97
        assert stats["commission"] == stats["qualified_videos"] * 10000

        # 5. Đổi công thức sang trừ định mức KPI 50 video -> payable = qualified - 50
        qual_count = stats["qualified_videos"]
        res_update_rules = client.post("/api/marketplace/koc/sources", json={
            "id": source_id,
            "name": "Test KOC Thanh Tháng 7/2026",
            "sheet_url": "https://docs.google.com/spreadsheets/d/1TRCLEZtxbGBvsLrFU9pIUTqrlWeAMUrkTr2B4aBJeVA/edit?gid=1807044221",
            "month": "2026-07",
            "staff_id": staff_id,
            "koc_tab_name": "THANH 72026",
            "video_tab_name": "2",
            "rules": {
                "min_views": 200,
                "kpi_deduct_videos": 50,
                "rate_per_video": 15000,
                "viral_min_views": 1000,
                "viral_bonus": 0,
            }
        })
        assert res_update_rules.status_code == 200

        res_list2 = client.get("/api/marketplace/koc/sources?month=2026-07")
        target_src2 = next(s for s in res_list2.json()["sources"] if s["id"] == source_id)
        assert target_src2["stats"]["payable_videos"] == qual_count - 50
        assert target_src2["stats"]["commission"] == (qual_count - 50) * 15000

        # 6. Kiểm tra tích hợp cộng hoa hồng vào Bảng Lương HRM (commission_by_staff)
        conn = get_db()
        cur = conn.cursor()
        comm_map = K.commission_by_staff(cur, "2026-07")
        conn.close()
        assert staff_id in comm_map
        assert comm_map[staff_id]["commission"] >= (qual_count - 50) * 15000

        # 7. Kiểm tra API lấy danh sách videos & profiles
        res_vids = client.get(f"/api/marketplace/koc/videos?source_id={source_id}&kpi_filter=qualified")
        assert res_vids.status_code == 200
        assert len(res_vids.json()["videos"]) == qual_count

        res_profs = client.get(f"/api/marketplace/koc/profiles?source_id={source_id}&q=nguyn.mai3848")
        assert res_profs.status_code == 200
        assert len(res_profs.json()["profiles"]) >= 1
    finally:
        client.delete(f"/api/marketplace/koc/sources/{source_id}")
