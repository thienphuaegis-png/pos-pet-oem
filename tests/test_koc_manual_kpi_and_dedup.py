from fastapi.testclient import TestClient

from database import get_db
from server import app
from services import koc_service as K
from services import payroll_service as ps
from tests.auth_helpers import owner_auth_headers


def test_snowflake_publish_time_and_backfill():
    # Video thật từ THANH 102026: 7693854393304665365 -> 2026-10-07 16:24 (UTC+7)
    url = "https://www.tiktok.com/@bupetshop123/video/7693854393304665365?shop_id=7494704359300565419"
    assert K.extract_tiktok_publish_time(url) == "2026-10-07 16:24"
    assert K.extract_tiktok_publish_time("7693854393304665365") == "2026-10-07 16:24"
    # Link rút gọn hoặc ID giả ngắn không bị giải mã sai
    assert K.extract_tiktok_publish_time("https://vt.tiktok.com/ZSjAbc123/") == ""
    assert K.extract_tiktok_publish_time("7001") == ""

    conn = get_db()
    cur = conn.cursor()
    src_id = None
    try:
        K.ensure_koc_schema(cur)
        cur.execute(
            "INSERT INTO koc_sources (name, sheet_url, sheet_id, month, is_active) VALUES (?, ?, ?, ?, 1)",
            ("Backfill Test", "https://docs.google.com/spreadsheets/d/fake_id_123456789012345", "fake_id_123456789012345", "2026-10"),
        )
        src_id = cur.lastrowid
        # Giả lập dữ liệu cũ bị ghi đè bởi cột Ngày air 00:00:00
        cur.execute(
            """INSERT INTO koc_videos (source_id, video_key, video_url, koc_username, views, status, published_at)
               VALUES (?, ?, ?, 'bupetshop123', 199, 'Thành công', '2026-10-15 00:00:00')""",
            (src_id, "7693854393304665365", url),
        )
        vid_id = cur.lastrowid
        conn.commit()

        K.ensure_koc_schema(cur)
        conn.commit()
        cur.execute("SELECT published_at, manual_kpi FROM koc_videos WHERE id = ?", (vid_id,))
        row = dict(cur.fetchone())
        assert row["published_at"] == "2026-10-07 16:24"
        assert row["manual_kpi"] == 0
    finally:
        if src_id:
            cur.execute("DELETE FROM koc_videos WHERE source_id = ?", (src_id,))
            cur.execute("DELETE FROM koc_sources WHERE id = ?", (src_id,))
            conn.commit()
        conn.close()


def test_koc_manual_kpi_dedup_grace_days_and_rescan_preservation(monkeypatch):
    client = TestClient(app, headers=owner_auth_headers())

    conn = get_db()
    cur = conn.cursor()
    cur.execute(
        "SELECT id FROM staff WHERE COALESCE(is_active, 1) = 1 AND COALESCE(is_payroll_staff, 1) = 1 "
        "AND COALESCE(enable_tmdt_commission, 1) = 1 ORDER BY id LIMIT 1"
    )
    staff_id = cur.fetchone()["id"]
    conn.close()

    # Tạo 4 Snowflake ID chuẩn ở các mốc ngày thực tế (múi giờ VN UTC+7):
    # ts << 32 tạo đúng Snowflake 19 chữ số
    def make_vid(ymd_hm: str, seq: int) -> str:
        import datetime
        tz = datetime.timezone(datetime.timedelta(hours=7))
        dt = datetime.datetime.strptime(ymd_hm, "%Y-%m-%d %H:%M").replace(tzinfo=tz)
        return str((int(dt.timestamp()) << 32) | seq)

    vk_sep_early = make_vid("2026-09-10 10:00", 11)   # Tháng 9 (cũ)
    vk_sep_dup = make_vid("2026-09-29 14:30", 22)     # Cuối T9 đã tính ở chiến dịch T9 -> Trùng kỳ trước
    vk_sep_grace = make_vid("2026-09-28 09:15", 33)   # Cuối T9 (trong 5 ngày du di), chưa có ở T9 -> Hợp lệ
    vk_oct_qual = make_vid("2026-10-12 11:00", 44)    # Đúng T10, >= 200 view
    vk_oct_199 = make_vid("2026-10-18 15:20", 55)     # Đúng T10, 199 view (< 200), KOC chưa có bài đạt
    vk_oct_195 = make_vid("2026-10-20 18:00", 66)     # Đúng T10, 195 view (< 200), cùng KOC đã có bài đạt

    s_sep_id = None
    s_oct_id = None
    try:
        # 1. Tạo chiến dịch Tháng 09/2029 (dùng năm 2026-09/2026-10 riêng biệt qua video_key duy nhất)
        r1 = client.post("/api/marketplace/koc/sources", json={
            "name": "Test KOC T09",
            "sheet_url": "https://docs.google.com/spreadsheets/d/1TRCLEZtxbGBvsLrFU9pIUTqrlWeAMUrkTr2B4aBJeVA/edit",
            "month": "2026-09",
            "staff_id": staff_id,
        })
        assert r1.status_code == 200
        s_sep_id = r1.json()["id"]

        r2 = client.post("/api/marketplace/koc/sources", json={
            "name": "Test KOC T10",
            "sheet_url": "https://docs.google.com/spreadsheets/d/1TRCLEZtxbGBvsLrFU9pIUTqrlWeAMUrkTr2B4aBJeVA/edit",
            "month": "2026-10",
            "staff_id": staff_id,
            "rules": {
                "min_views": 200,
                "kpi_deduct_videos": 0,
                "rate_per_video": 10000,
                "viral_min_views": 1000,
                "viral_bonus": 0,
                "manual_adjust_videos": 0,
                "grace_days_prev_month": 5,
            },
        })
        assert r2.status_code == 200
        s_oct_id = r2.json()["id"]

        # Dán video vk_sep_dup vào T09 (500 view)
        client.post("/api/marketplace/koc/videos", json={
            "source_id": s_sep_id,
            "urls_text": f"https://www.tiktok.com/@conlaquit/video/{vk_sep_dup}",
            "product_note": "thịt sấy",
        })
        v_sep = client.get(f"/api/marketplace/koc/videos?source_id={s_sep_id}").json()["videos"][0]
        client.put(f"/api/marketplace/koc/videos/{v_sep['id']}", json={"views": 500, "status": "Thành công"})

        # Dán 6 video vào T10 (bao gồm 1 bài trùng T09, 1 bài cũ 10/09, 1 bài du di 28/09, 1 bài đạt T10, 2 bài <200 view)
        urls_oct = "\n".join([
            f"https://www.tiktok.com/@lily_old/video/{vk_sep_early}",
            f"https://www.tiktok.com/@conlaquit/video/{vk_sep_dup}",
            f"https://www.tiktok.com/@grace_koc/video/{vk_sep_grace}",
            f"https://www.tiktok.com/@kimchidangiuuu/video/{vk_oct_qual}",
            f"https://www.tiktok.com/@kimchidangiuuu/video/{vk_oct_195}",
            f"https://www.tiktok.com/@nguyen.kimanh74/video/{vk_oct_199}",
        ])
        add_oct = client.post("/api/marketplace/koc/videos", json={
            "source_id": s_oct_id,
            "urls_text": urls_oct,
            "product_note": "lau sàn",
        })
        assert add_oct.status_code == 200
        assert add_oct.json()["added"] == 6

        oct_vids = {v["video_key"]: v for v in client.get(f"/api/marketplace/koc/videos?source_id={s_oct_id}").json()["videos"]}
        # Kiểm tra giải mã ngày đăng tức thì ngay khi dán link
        assert oct_vids[vk_oct_199]["published_at"] == "2026-10-18 15:20"
        assert oct_vids[vk_sep_early]["published_at"] == "2026-09-10 10:00"

        # Gán lượt xem cho từng video trong T10
        views_setup = {
            vk_sep_early: 840,   # >= 200 nhưng đăng 10/09 (quá 5 ngày du di) -> Loại (Tháng cũ)
            vk_sep_dup: 3203,    # >= 200 nhưng đã tính ở T09 -> Loại (Trùng cũ)
            vk_sep_grace: 260,   # >= 200, đăng 28/09 (trong 5 ngày du di & chưa có ở T09) -> Đạt tự động
            vk_oct_qual: 410,    # >= 200, đúng T10 -> Đạt tự động
            vk_oct_195: 195,     # < 200, cùng kênh @kimchidangiuuu (đã có 1 bài đạt)
            vk_oct_199: 199,     # < 200, kênh @nguyen.kimanh74 (đang 0 bài đạt)
        }
        for vk, vw in views_setup.items():
            r_up = client.put(f"/api/marketplace/koc/videos/{oct_vids[vk]['id']}", json={"views": vw, "status": "Thành công"})
            assert r_up.status_code == 200

        # 2. Kiểm tra kết quả tự động loại trùng & tháng cũ:
        # Chỉ có 2 video hợp lệ đạt tự động (vk_sep_grace + vk_oct_qual); 2 video bị loại (vk_sep_early + vk_sep_dup); 2 video dưới KPI
        src_summary = next(s for s in client.get("/api/marketplace/koc/sources?month=2026-10").json()["sources"] if s["id"] == s_oct_id)
        st = src_summary["stats"]
        assert st["auto_qualified_videos"] == 2
        assert st["manual_approved_videos"] == 0
        assert st["qualified_videos"] == 2
        assert st["dup_excluded_videos"] == 1
        assert st["old_excluded_videos"] == 1
        assert st["excluded_videos"] == 2
        assert st["under_kpi_videos"] == 2
        assert st["commission"] == 20_000

        # 3. Kiểm tra lọc `under_zero_koc`: chỉ trả về @nguyen.kimanh74 (199 view), không trả @kimchidangiuuu (vì kênh đã có 1 bài đạt)
        zero_koc_vids = client.get(f"/api/marketplace/koc/videos?source_id={s_oct_id}&kpi_filter=under_zero_koc").json()["videos"]
        assert len(zero_koc_vids) == 1
        assert zero_koc_vids[0]["video_key"] == vk_oct_199
        assert zero_koc_vids[0]["koc_auto_qual"] == 0

        # 4. Anh bấm [Tính KPI] duyệt tay cho bài 199 view của @nguyen.kimanh74
        vid_199_id = oct_vids[vk_oct_199]["id"]
        r_man = client.put(f"/api/marketplace/koc/videos/{vid_199_id}", json={"manual_kpi": 1})
        assert r_man.status_code == 200

        src_after_man = next(s for s in client.get("/api/marketplace/koc/sources?month=2026-10").json()["sources"] if s["id"] == s_oct_id)
        st2 = src_after_man["stats"]
        assert st2["auto_qualified_videos"] == 2
        assert st2["manual_approved_videos"] == 1
        assert st2["qualified_videos"] == 3
        assert st2["under_kpi_videos"] == 1
        assert st2["commission"] == 30_000

        # 5. Bấm "Quét Lại Tất Cả" (refresh-views?mode=all): view bài 199 tụt xuống 198, NHƯNG manual_kpi=1 vẫn giữ bền 100%!
        async def fake_fetch_metrics(video_url, http_client):
            vk = K.extract_video_key(video_url)
            new_v = 198 if vk == vk_oct_199 else views_setup.get(vk, 100)
            return {
                "ok": True,
                "views": new_v,
                "likes": 5,
                "comments": 1,
                "shares": 0,
                "title": "Clip test",
                "koc_username": K.extract_username(video_url),
                "published_at": K.extract_tiktok_publish_time(video_url),
                "status": "Thành công",
                "updated_at": "2026-11-06 11:00:00",
            }

        monkeypatch.setattr(K, "fetch_tiktok_video_metrics", fake_fetch_metrics)
        rescan = client.post(f"/api/marketplace/koc/sources/{s_oct_id}/refresh-views?mode=all&after_id=0&limit=10")
        assert rescan.status_code == 200
        assert rescan.json()["scanned"] == 6

        src_after_rescan = next(s for s in client.get("/api/marketplace/koc/sources?month=2026-10").json()["sources"] if s["id"] == s_oct_id)
        assert src_after_rescan["stats"]["manual_approved_videos"] == 1
        assert src_after_rescan["stats"]["qualified_videos"] == 3
        assert src_after_rescan["stats"]["commission"] == 30_000

        # Kể cả khi bài đã duyệt tay sau đó tăng lên 250 view (>= 200), hệ thống vẫn chỉ tính 1 lần, không bị nhân đôi!
        client.put(f"/api/marketplace/koc/videos/{vid_199_id}", json={"views": 250})
        src_no_double = next(s for s in client.get("/api/marketplace/koc/sources?month=2026-10").json()["sources"] if s["id"] == s_oct_id)
        assert src_no_double["stats"]["qualified_videos"] == 3

        # 6. Chỉnh công thức chiến dịch: Số ngày du di = 0 (loại luôn bài 28/09) + Cộng thủ công +2 video
        r_rules = client.post("/api/marketplace/koc/sources", json={
            "id": s_oct_id,
            "name": "Test KOC T10",
            "sheet_url": "https://docs.google.com/spreadsheets/d/1TRCLEZtxbGBvsLrFU9pIUTqrlWeAMUrkTr2B4aBJeVA/edit",
            "month": "2026-10",
            "staff_id": staff_id,
            "rules": {
                "min_views": 200,
                "kpi_deduct_videos": 0,
                "rate_per_video": 10000,
                "viral_min_views": 1000,
                "viral_bonus": 0,
                "manual_adjust_videos": 2,
                "grace_days_prev_month": 0,
            },
        })
        assert r_rules.status_code == 200
        src_strict = next(s for s in client.get("/api/marketplace/koc/sources?month=2026-10").json()["sources"] if s["id"] == s_oct_id)
        st_strict = src_strict["stats"]
        # auto_qualified còn 1 (vk_oct_qual), manual_approved = 1 (vk_oct_199), old_excluded tăng lên 2 (vk_sep_early + vk_sep_grace), manual_adjust = +2 -> payable = 4
        assert st_strict["auto_qualified_videos"] == 1
        assert st_strict["manual_approved_videos"] == 1
        assert st_strict["old_excluded_videos"] == 2
        assert st_strict["payable_videos"] == 4
        assert st_strict["commission"] == 40_000

        # 7. Kiểm tra đồng bộ sang API Hoa Hồng HRM (/api/hrm/commissions/2026-10)
        hrm_comm = client.get("/api/hrm/commissions/2026-10")
        assert hrm_comm.status_code == 200
        staff_comm_row = next(x for x in hrm_comm.json()["items"] if x["staff_id"] == staff_id)
        assert staff_comm_row["koc_manual_approved_videos"] >= 1
        assert staff_comm_row["koc_commission"] >= 40_000
    finally:
        if s_oct_id:
            client.delete(f"/api/marketplace/koc/sources/{s_oct_id}")
        if s_sep_id:
            client.delete(f"/api/marketplace/koc/sources/{s_sep_id}")


def test_koc_bulk_kpi_and_auto_top1_zero_koc_and_sort_ui():
    import os
    root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    html = open(os.path.join(root, "templates", "index.html"), encoding="utf-8").read()
    js = open(os.path.join(root, "static", "js", "modules", "marketplace.js"), encoding="utf-8").read()
    assert 'id="koc-video-sort"' in html
    assert 'id="koc-manual-tools-bar"' in html
    assert "autoApproveTop1ZeroKoc" in js
    assert "bulkUpdateSelectedKocKpi" in js
    assert "getSortedKocVideos" in js
    assert "applyOptimisticManualKpi" in js

    client = TestClient(app, headers=owner_auth_headers())

    def make_vid(ymd_hm: str, seq: int) -> str:
        import datetime
        tz = datetime.timezone(datetime.timedelta(hours=7))
        dt = datetime.datetime.strptime(ymd_hm, "%Y-%m-%d %H:%M").replace(tzinfo=tz)
        return str((int(dt.timestamp()) << 32) | seq)

    v_koc1_180 = make_vid("2026-10-11 10:00", 101)
    v_koc1_197 = make_vid("2026-10-12 10:00", 102)
    v_koc2_220 = make_vid("2026-10-13 10:00", 103)
    v_koc2_190 = make_vid("2026-10-14 10:00", 104)
    v_koc3_old = make_vid("2026-08-15 10:00", 105)

    src_id = None
    try:
        r = client.post("/api/marketplace/koc/sources", json={
            "name": "Test Bulk KOC T10",
            "sheet_url": "https://docs.google.com/spreadsheets/d/1TRCLEZtxbGBvsLrFU9pIUTqrlWeAMUrkTr2B4aBJeVA/edit",
            "month": "2026-10",
        })
        assert r.status_code == 200
        src_id = r.json()["id"]

        client.post("/api/marketplace/koc/videos", json={
            "source_id": src_id,
            "urls_text": "\n".join([
                f"https://www.tiktok.com/@koc_zero_a/video/{v_koc1_180}",
                f"https://www.tiktok.com/@koc_zero_a/video/{v_koc1_197}",
                f"https://www.tiktok.com/@koc_has_one/video/{v_koc2_220}",
                f"https://www.tiktok.com/@koc_has_one/video/{v_koc2_190}",
                f"https://www.tiktok.com/@koc_old_only/video/{v_koc3_old}",
            ]),
        })
        vmap = {v["video_key"]: v for v in client.get(f"/api/marketplace/koc/videos?source_id={src_id}").json()["videos"]}
        for vk, vw in [
            (v_koc1_180, 180),
            (v_koc1_197, 197),
            (v_koc2_220, 220),
            (v_koc2_190, 190),
            (v_koc3_old, 199),
        ]:
            client.put(f"/api/marketplace/koc/videos/{vmap[vk]['id']}", json={"views": vw, "status": "Thành công"})

        # 1. Chạy chế độ gợi ý tự động: chỉ chọn đúng 1 bài cao nhất (197 view) của @koc_zero_a
        # Không chọn @koc_has_one (đã có bài 220 view) và không chọn @koc_old_only (bài tháng 08 bị loại)
        r_top1 = client.post("/api/marketplace/koc/videos/bulk-kpi", json={
            "mode": "top1_zero_koc",
            "source_id": src_id,
        })
        assert r_top1.status_code == 200
        assert r_top1.json()["updated"] == 1
        assert r_top1.json()["video_ids"] == [vmap[v_koc1_197]["id"]]

        # Gọi lần 2 liên tiếp sẽ trả updated=0 vì @koc_zero_a đã có 1 bài được tính KPI
        r_top1_again = client.post("/api/marketplace/koc/videos/bulk-kpi", json={
            "mode": "top1_zero_koc",
            "source_id": src_id,
        })
        assert r_top1_again.status_code == 200
        assert r_top1_again.json()["updated"] == 0

        # 2. Duyệt hàng loạt theo danh sách video_ids đã tick chọn
        ids_bulk = [vmap[v_koc1_180]["id"], vmap[v_koc2_190]["id"]]
        r_bulk = client.post("/api/marketplace/koc/videos/bulk-kpi", json={
            "video_ids": ids_bulk,
            "manual_kpi": 1,
        })
        assert r_bulk.status_code == 200
        assert r_bulk.json()["updated"] == 2

        src_sum = next(s for s in client.get("/api/marketplace/koc/sources?month=2026-10").json()["sources"] if s["id"] == src_id)
        assert src_sum["stats"]["auto_qualified_videos"] == 1
        assert src_sum["stats"]["manual_approved_videos"] == 3
        assert src_sum["stats"]["payable_videos"] == 4
    finally:
        if src_id:
            client.delete(f"/api/marketplace/koc/sources/{src_id}")
