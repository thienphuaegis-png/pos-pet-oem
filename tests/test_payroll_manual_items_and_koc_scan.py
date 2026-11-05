import asyncio
import json
import re
from pathlib import Path
from fastapi.testclient import TestClient

import database
from dependencies import get_current_user, get_optional_user
from server import app
from services import koc_service as koc_svc
from services.hrm_schema import ensure_hrm_schema

ROOT = Path(__file__).resolve().parents[1]


def _admin_override():
    return {"id": 1, "username": "admin", "name": "Admin", "role": "owner", "permissions": ["*"]}


def test_payroll_multi_manual_items_and_payslip_persistence():
    month = "2028-05"
    conn = database.get_db()
    cur = conn.cursor()
    staff_id = None
    try:
        ensure_hrm_schema(cur)
        cur.execute("SELECT id FROM hrm_work_blocks ORDER BY id LIMIT 1")
        block_id = cur.fetchone()[0]
        cur.execute(
            """INSERT INTO staff (name, username, role, employee_code, work_block_id, base_salary, allowance,
                                  hire_date, official_date, is_active, is_payroll_staff, is_attendance_exempt)
               VALUES (?, ?, 'staff', ?, ?, 6000000, 500000, '2026-01-01', '2026-02-01', 1, 1, 1)""",
            ("Test Manual Items NV", "nv_manual_items_2028", "NV981", block_id),
        )
        staff_id = cur.lastrowid
        conn.commit()
        conn.close()
        conn = None

        app.dependency_overrides[get_current_user] = _admin_override
        app.dependency_overrides[get_optional_user] = _admin_override
        client = TestClient(app)

        r_calc = client.post(f"/api/hrm/payroll/{month}/calculate")
        assert r_calc.status_code == 200
        base_line = next(x for x in r_calc.json()["lines"] if x["staff_id"] == staff_id)
        base_net = base_line["net_rounded"]

        # 1. Lưu nhiều dòng phụ cấp khác + thưởng khác + giảm trừ khác
        payload = {
            "manual_items": [
                {"type": "fuel", "label": "Phụ cấp xăng xe đi thị trường", "amount": 300000},
                {"type": "fuel", "label": "Hỗ trợ gửi xe & điện thoại", "amount": 150000},
                {"type": "bonus", "label": "Thưởng nóng đạt 165 KOC", "amount": 700000},
                {"type": "deduction", "label": "Làm mất thẻ kho", "amount": 100000},
            ],
            "manual_note": "",
        }
        r_put = client.put(f"/api/hrm/payroll/{month}/lines/{staff_id}", json=payload)
        assert r_put.status_code == 200
        updated_line = next(x for x in r_put.json()["lines"] if x["staff_id"] == staff_id)
        assert updated_line["fuel_other"] == 450000
        assert updated_line["bonus_other"] == 700000
        assert updated_line["deduction_other"] == 100000
        assert len(updated_line["manual_items"]) == 4
        assert updated_line["net_rounded"] == base_net + 450000 + 700000 - 100000
        assert "Phụ cấp xăng xe đi thị trường" in updated_line["manual_note"]

        # 2. Bấm "Tính Lương" lại không làm mất manual_items và các khoản cộng/trừ
        r_recalc = client.post(f"/api/hrm/payroll/{month}/calculate")
        assert r_recalc.status_code == 200
        recalc_line = next(x for x in r_recalc.json()["lines"] if x["staff_id"] == staff_id)
        assert recalc_line["fuel_other"] == 450000
        assert recalc_line["bonus_other"] == 700000
        assert recalc_line["deduction_other"] == 100000
        assert len(recalc_line["manual_items"]) == 4

        # 3. API Phiếu Lương nhân viên trả về đủ danh sách chi tiết từng khoản mục
        r_ps = client.get(f"/api/hrm/my-payslip?month={month}&staff_id={staff_id}")
        assert r_ps.status_code == 200
        ps_data = r_ps.json()["payslip"]
        assert ps_data["fuel_other"] == 450000
        assert ps_data["bonus_other"] == 700000
        assert ps_data["deduction_other"] == 100000
        labels = [it["label"] for it in ps_data["manual_items"]]
        assert "Phụ cấp xăng xe đi thị trường" in labels
        assert "Thưởng nóng đạt 165 KOC" in labels
        assert "Làm mất thẻ kho" in labels
    finally:
        app.dependency_overrides.clear()
        if conn is not None:
            conn.close()
        c2 = database.get_db()
        cur2 = c2.cursor()
        try:
            cur2.execute("SELECT id FROM payroll_periods WHERE month = ?", (month,))
            p_row = cur2.fetchone()
            if p_row:
                cur2.execute("DELETE FROM payroll_lines WHERE period_id = ?", (p_row[0],))
                cur2.execute("DELETE FROM payroll_periods WHERE id = ?", (p_row[0],))
            if staff_id:
                cur2.execute("DELETE FROM staff WHERE id = ?", (staff_id,))
            c2.commit()
        finally:
            c2.close()


def test_koc_refresh_views_batch_cursor_and_fallback(monkeypatch):
    conn = database.get_db()
    cur = conn.cursor()
    source_id = None
    try:
        koc_svc.ensure_koc_schema(cur)
        cur.execute(
            """INSERT INTO koc_sources (name, sheet_id, sheet_url, month, is_active)
               VALUES ('TEST KOC BATCH 2028', 'sheet_test_12345678901234567890', 'https://docs.google.com/spreadsheets/d/sheet_test_12345678901234567890/edit', '2028-05', 1)"""
        )
        source_id = cur.lastrowid
        sample_videos = [
            ("v1", "https://www.tiktok.com/@u1/video/101", 500, "Thành công"),      # đã có view -> pending bỏ qua
            ("v2", "https://www.tiktok.com/@u2/video/102", 0, "Chưa quét view"),    # pending #1 -> lỗi private
            ("v3", "https://www.tiktok.com/@u3/video/103", 0, "Chưa quét view"),    # pending #2 -> 350 view (đạt KPI)
            ("v4", "https://www.tiktok.com/@u4/video/104", 0, "Lỗi: Free Api Limit"),  # pending #3 -> 120 view
        ]
        for vk, vurl, views, st in sample_videos:
            cur.execute(
                """INSERT INTO koc_videos (source_id, video_key, video_url, koc_username, views, status, updated_at)
                   VALUES (?, ?, ?, 'u_test', ?, ?, '2028-05-01 10:00')""",
                (source_id, vk, vurl, views, st),
            )
        conn.commit()
        conn.close()
        conn = None

        async def fake_fetch(video_url: str, _client):
            if video_url.endswith("/102"):
                return {"ok": False, "status": "Lỗi: Video riêng tư", "updated_at": "2028-05-02 12:00:00"}
            if video_url.endswith("/103"):
                return {
                    "ok": True, "views": 350, "likes": 20, "comments": 3, "shares": 1,
                    "title": "xịt ve chó mèo", "koc_username": "u3", "published_at": "2028-05-01 09:00",
                    "status": "Thành công", "updated_at": "2028-05-02 12:00:00",
                }
            return {
                "ok": True, "views": 120, "likes": 5, "comments": 0, "shares": 0,
                "title": "lược chải lông", "koc_username": "u4", "published_at": "2028-05-01 09:30",
                "status": "Thành công", "updated_at": "2028-05-02 12:00:00",
            }

        monkeypatch.setattr(koc_svc, "fetch_tiktok_video_metrics", fake_fetch)

        app.dependency_overrides[get_current_user] = _admin_override
        app.dependency_overrides[get_optional_user] = _admin_override
        client = TestClient(app)

        # Kiểm tra pending_videos ban đầu = 3 (v2, v3, v4)
        r_src = client.get("/api/marketplace/koc/sources?month=2028-05")
        assert r_src.status_code == 200
        src_obj = next(s for s in r_src.json()["sources"] if s["id"] == source_id)
        assert src_obj["stats"]["pending_videos"] == 3

        # Lô 1 (mode=pending, limit=2): quét v2 (lỗi) & v3 (350 view), không lặp vô hạn ở v2
        b1 = client.post(f"/api/marketplace/koc/sources/{source_id}/refresh-views?mode=pending&after_id=0&limit=2")
        assert b1.status_code == 200
        d1 = b1.json()
        assert d1["scanned"] == 2
        assert d1["updated"] == 1
        assert d1["errors"] == 1
        assert d1["qualified_in_batch"] == 1
        assert d1["remaining"] == 1
        assert d1["has_more"] is True

        # Lô 2 tiếp từ last_id: quét nốt v4 (120 view), kết thúc vòng lặp
        b2 = client.post(
            f"/api/marketplace/koc/sources/{source_id}/refresh-views?mode=pending&after_id={d1['last_id']}&limit=2"
        )
        assert b2.status_code == 200
        d2 = b2.json()
        assert d2["scanned"] == 1
        assert d2["updated"] == 1
        assert d2["remaining"] == 0
        assert d2["has_more"] is False

        # Kiểm tra tổng video đạt KPI = 2 (v1=500, v3=350)
        r_src_after = client.get("/api/marketplace/koc/sources?month=2028-05")
        stats_after = next(s for s in r_src_after.json()["sources"] if s["id"] == source_id)["stats"]
        assert stats_after["qualified_videos"] == 2
        assert stats_after["commission"] == 20000
    finally:
        app.dependency_overrides.clear()
        if conn is not None:
            conn.close()
        c2 = database.get_db()
        cur2 = c2.cursor()
        try:
            if source_id:
                cur2.execute("DELETE FROM koc_videos WHERE source_id = ?", (source_id,))
                cur2.execute("DELETE FROM koc_profiles WHERE source_id = ?", (source_id,))
                cur2.execute("DELETE FROM koc_sources WHERE id = ?", (source_id,))
            c2.commit()
        finally:
            c2.close()


def test_tiktok_html_rehydration_fallback(monkeypatch):
    sample_rehydration = {
        "__DEFAULT_SCOPE__": {
            "webapp.video-detail": {
                "itemInfo": {
                    "itemStruct": {
                        "desc": "Xịt ve thú cưng",
                        "createTime": "1762000000",
                        "author": {"uniqueId": "bupetshop123"},
                        "stats": {"playCount": 1450, "diggCount": 88, "commentCount": 12, "shareCount": 4},
                    }
                }
            }
        }
    }
    html_doc = f'<html><body><script id="__UNIVERSAL_DATA_FOR_REHYDRATION__" type="application/json">{json.dumps(sample_rehydration)}</script></body></html>'

    class DummyResp:
        def __init__(self, status_code, payload=None, text=""):
            self.status_code = status_code
            self._payload = payload or {}
            self.text = text

        def json(self):
            return self._payload

    class DummyClient:
        async def post(self, *args, **kwargs):
            return DummyResp(200, {"code": -1, "msg": "Free Api Limit: 1 request/second."})

        async def get(self, *args, **kwargs):
            return DummyResp(200, text=html_doc)

    async def no_sleep(*args, **kwargs):
        return None

    monkeypatch.setattr(koc_svc, "_wait_tikwm_rate_slot", no_sleep)
    res = asyncio.run(koc_svc.fetch_tiktok_video_metrics("https://www.tiktok.com/@bupetshop123/video/76930001", DummyClient()))
    assert res["ok"] is True
    assert res["views"] == 1450
    assert res["koc_username"] == "bupetshop123"


def test_no_firefox_blank_month_inputs_and_ui_wiring():
    html = (ROOT / "templates/index.html").read_text(encoding="utf-8")
    hrm_js = (ROOT / "static/js/modules/hrm.js").read_text(encoding="utf-8")
    mkt_js = (ROOT / "static/js/modules/marketplace.js").read_text(encoding="utf-8")
    app_js = (ROOT / "static/js/app.js").read_text(encoding="utf-8")

    # 1. Đã thay thế sạch cả 4 thẻ <input type="month"> bị trắng trơn trên Firefox
    assert re.search(r'type=["\']month["\']', html) is None
    for mid in ("koc-month-filter", "koc-src-month", "my-payslip-month", "spa-staff-filter-month"):
        assert f'data-month-input="{mid}"' in html
        assert f'id="pos-mlabel-{mid}"' in html
        assert f'id="pos-mpop-{mid}"' in html
    assert "window.togglePosMonthPopover" in app_js

    # 2. Bảng Lương gắn click mở openHrmManualItemsModal trên cả 3 cột PC Xăng/Khác, Thưởng khác, Trừ khác
    assert "openHrmManualItemsModal(${l.staff_id}, 'fuel')" in hrm_js
    assert "openHrmManualItemsModal(${l.staff_id}, 'bonus')" in hrm_js
    assert "openHrmManualItemsModal(${l.staff_id}, 'deduction')" in hrm_js
    assert 'id="hrm-line-items-list"' in html
    assert 'id="btn-hrm-payslip-edit-manual"' in html

    # 3. KOC TikTok có safeKocJson chống nổ JSON.parse và thanh tiến trình quét theo lô
    assert "async function safeKocJson" in mkt_js
    assert 'id="koc-scan-progress-wrap"' in html
    assert 'id="btn-koc-rescan-all"' in html
