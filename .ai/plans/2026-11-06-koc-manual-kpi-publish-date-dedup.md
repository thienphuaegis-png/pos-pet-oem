# Thiết Kế Nâng Cấp KOC / KOL: Duyệt Tay Video Dưới KPI, Ngày Đăng Thật & Chống Trùng Video Cũ

**Ngày:** 2026-11-06  
**Trạng thái:** ĐÃ HOÀN TẤT & VERIFIED (`pytest` 18/18 passed)  
**Phạm vi:** `services/koc_service.py`, `routers/marketplace.py`, `schemas.py`, `templates/index.html`, `static/js/modules/marketplace.js`, `routers/hrm.py`, `static/js/modules/hrm.js`

---

## 1. Phát Hiện Thực Tế & Lỗi Ẩn Trên Dữ Liệu Thật Của Shop

Đã kiểm tra trực tiếp code hiện tại và đối chiếu trên file Google Sheet thật của shop (`1TRCLEZtxbGBvsLrFU9pIUTqrlWeAMUrkTr2B4aBJeVA` — các tab `THANH 7..10/2026`, `ĐÔN`, `Hân`, `Tiktok_ChiTiet`):

| Lỗi ẩn hiện tại | Hậu quả thực tế (số liệu thật trên Sheet & màn hình KOC) | Vị trí `file:line` |
|---|---|---|
| **1. `UNIQUE(source_id, video_key)` chỉ chặn trùng trong 1 nguồn Sheet** | Giữa `THANH 92026` & `THANH 102026` đang trùng **3 video**, giữa `THANH 72026` & `82026` trùng **4 video**, giữa `ĐÔN 32026` & `Hân 32026` trùng **3 video**. Hệ thống hiện tại vẫn đếm và tính tiền hoa hồng lần 2 (`+10.000 đ/video`). | `services/koc_service.py:87`, `services/koc_service.py:157-180` |
| **2. Chưa kiểm tra tháng đăng thật của video (`published_at`)** | Trong `THANH 102026` (544 link) có **1 video đăng từ `08/2026`** và **10 video đăng từ `09/2026`**. Hệ thống hiện cộng hết vào KPI Tháng 10 mà không cảnh báo hay loại trừ. | `services/koc_service.py:173-179` |
| **3. Cột `Ngày air` gõ tay trên Sheet ghi đè mất `published_at` thật của TikTok + UI ẩn cột Ngày đăng** | DB đã có cột `koc_videos.published_at` và hàm quét TikWM đã lấy `create_time`, nhưng mỗi lần bấm `Đồng Bộ Từ Sheet` lại bị cột `Ngày air` gõ tay (`2026-10-15`) đè mất ngày đăng thật (`2026-10-07 16:24`); đồng thời bảng UI chỉ hiện `Cập nhật lúc` (giờ quét view) chứ chưa hiện `Ngày đăng`. | `services/koc_service.py:395, 676`, `templates/index.html:2621-2631` |
| **4. Không có cờ duyệt KPI thủ công tách khỏi `views`** | Ở tab `Tiktok_ChiTiet`, anh phải gõ số `1` vào cột `L` để duyệt tay 79 video `< 200 view` (`=C3+F3-200-F5`). Trên POS hiện tại nếu sửa tạm ô `Lượt xem` lên `200`, khi bấm `Quét Lại Tất Cả` sẽ bị TikTok ghi đè lại `193 view` làm mất kết quả duyệt tay. | `services/koc_service.py:173`, `static/js/modules/marketplace.js:2525, 2571` |

---

## 2. Giải Đáp Kỹ Thuật: Lấy Ngày Đăng & Giải Mã Tức Thì Không Tốn API

1. **Giải mã tức thì 0 giây từ chính mã `video_id` TikTok (`Snowflake ID`):**
   - Mọi link TikTok chuẩn `/video/7693854393304665365` (19 chữ số) đều nhúng sẵn mốc thời gian đăng của máy chủ TikTok ở 32 bit cao (`int(video_id) >> 32` = Unix timestamp).
   - Đã chạy kiểm chứng trên toàn bộ **544/544 video** của `THANH 102026`: **100% giải mã ra ngay `Ngày đăng` chính xác tới từng phút** (khớp khít 100% với `create_time` từ TikWM API: `2026-10-07 16:24`).
   - Nhờ đó: **461 video hiện có trên máy anh sẽ lên ngay `Ngày đăng` tức thì mà không cần bấm quét lại view**, kể cả video đã bị xóa hoặc chuyển riêng tư.
2. **Link rút gọn (`vt.tiktok.com/...`):** Khi bấm Quét View, `fetch_tiktok_video_metrics` (TikWM `create_time` + HTML Fallback `createTime`) tự động điền `published_at`.

---

## 3. Bản Đồ Ánh Xạ Dữ Liệu (Data Mapping)

| Trường dữ liệu | Nguồn lấy / Biến / Cột DB | File / Vị trí | Ghi chú |
|---|---|---|---|
| Ngày đăng video (`published_at`) | `int(video_key) >> 32` (ưu tiên 1) → TikWM `create_time` / HTML `createTime` (ưu tiên 2) → Cột `Ngày đăng` Sheet (ưu tiên 3) | `services/koc_service.py:85, 726, 757` | Cột `koc_videos.published_at` **đã có sẵn trong DB**, chỉ cần ngừng lấy `Ngày air` đè lên và mở cột lên UI |
| Cờ duyệt/loại KPI thủ công từng video | Cột mới `koc_videos.manual_kpi` (`INTEGER DEFAULT 0`: `0`=Tự động, `1`=Duyệt tay tính KPI, `-1`=Loại trừ tay) | `services/koc_service.py:33` (`ensure_koc_schema` migrate `ALTER TABLE`) | Bảo toàn 100% khi bấm `Đồng Bộ Từ Sheet` hoặc `Quét Lại Tất Cả` |
| Số video cộng/trừ thủ công cấp Chiến dịch (nếu dùng) | `rules_json.manual_adjust_videos` (hoặc cột `koc_sources`) | `services/koc_service.py:20`, `schemas.py:707` | Tùy đáp án anh chọn ở câu 1 |
| Phát hiện trùng kỳ trước (`dup_source_name`, `dup_month`) | Query đối chiếu `kv_prev.video_key = kv.video_key` trên các nguồn `koc_sources` có `month < cur.month` (hoặc `month = cur.month AND id < cur.id`) | `services/koc_service.py:795`, `routers/marketplace.py:1781` | Tính động chuẩn xác, xóa chiến dịch cũ tự động gỡ cờ trùng |
| Đối chiếu khác tháng đăng (`is_old_month`) | So sánh `published_at[:7]` với `koc_sources.month` (+ ngưỡng ngày cho phép trễ đầu tháng nếu có) | `services/koc_service.py:140` | Cảnh báo rõ `Đăng 09/2026` trên chiến dịch `2026-10` |
| Đồng bộ sang HRM (`Hoa Hồng & Tip` & `Bảng Lương`) | `koc_service.commission_by_staff(cur, month)` | `services/payroll_service.py:375`, `routers/hrm.py:1554`, `static/js/modules/hrm.js:4713` | Cập nhật dòng thuyết minh HRM: hiển thị rõ số video đạt view + số video duyệt thêm |

---

## 4. Ma Trận Tác Động Sự Kiện (Event Impact Matrix — 5 Chiều)

| Chiều tác động | Xử lý cụ thể |
|---|---|
| **1. Trigger (UI / API)** | Bấm nút `Duyệt KPI` / `Bỏ duyệt` / `Loại trừ` trên dòng video (`PUT /api/marketplace/koc/videos/{id}` hoặc duyệt hàng loạt `POST /api/marketplace/koc/videos/bulk-kpi`), lọc theo `Chưa đạt`, `Đã duyệt tay`, `Trùng / Khác tháng`. |
| **2. Entity State** | Cập nhật `koc_videos.manual_kpi` (`1` / `0` / `-1`). Khi `Sync Sheet` hoặc `Quét Lại Tất Cả`: giữ nguyên `manual_kpi`, cập nhật `views` và `published_at` chuẩn. |
| **3. Ledger / Financial (Lương & Hoa hồng)** | Cập nhật ngay `payable_videos` và `commission` của chiến dịch; phản ánh tức thì sang `HRM -> Hoa Hồng & Tip`. Với `Bảng Lương` tháng ở trạng thái `DRAFT`, khi bấm `Tính Lương` sẽ lấy tổng mới; các kỳ `LOCKED` giữ nguyên snapshot bất biến, không bị nhảy số lùi. |
| **4. Stock / Debt (Kho / Công nợ)** | Không tác động tồn kho hay công nợ khách hàng/NCC. |
| **5. Reversal & Siblings** | Bỏ tick duyệt tay → trừ ngược hoa hồng ngay lập tức. Xóa chiến dịch tháng cũ → các video trùng ở tháng sau tự động hết cờ `Trùng kỳ trước`. |

---

## 5. Đáp Án Đã Chốt (2026-11-06)

| # | Câu hỏi | Đáp án đã chốt |
|---|---|---|
| 1 | Cách duyệt thủ công các video `< 200 view` | **1a:** Cho **tick `[Tính KPI]` trực tiếp trên từng dòng video** (kèm hiện tiến độ KOC ngay cạnh tên kênh: `Kênh: X đạt + Y duyệt / Z video`, lưu vào cột riêng `koc_videos.manual_kpi` không bị mất khi bấm `Quét Lại Tất Cả` hay `Đồng Bộ Từ Sheet`) **VÀ có thêm ô `Cộng/trừ video thủ công` (`manual_adjust_videos`)** ở công thức Chiến dịch để nhập nhanh số tổng khi cần. |
| 2 | Đơn giá hoa hồng cho video `< 200 view` được duyệt thêm | **2a:** **Gộp chung vào tổng Video đạt KPI và nhân cùng đơn giá chuẩn** (`10.000 đ/video`). Công thức: `Video tính thưởng = MAX(0, Video tự động đạt + Video duyệt tay + Cộng/trừ tổng − Định mức KPI trừ đi)`. |
| 3 | Chống trùng video cũ (trùng link kỳ trước & khác tháng đăng) | **3a:** **Tự động loại khỏi KPI** mọi video **trùng mã `video_key` với chiến dịch kỳ trước** (`Trùng T09/2026`) **VÀ tự động loại video có `Ngày đăng` quá hạn tháng cũ** (có ô chỉnh **số ngày du di cuối tháng trước** `grace_days_prev_month`, mặc định `5` ngày cho KOC đăng cuối tháng trước gửi link trễ đầu tháng sau; anh bấm nút `Ngoại lệ / Tính KPI` ghi đè được từng dòng nếu muốn duyệt riêng). |

---

## 6. Thứ Tự Triển Khai Khi Anh Gật Đầu Code

1. **Phase 1 — Schema & Engine (`services/koc_service.py`, `schemas.py`):**
   - Thêm cột `manual_kpi INTEGER DEFAULT 0` vào `koc_videos` qua `ensure_koc_schema` + tự động giải mã `published_at` từ `Snowflake ID` (`int(video_key) >> 32`) cho toàn bộ video cũ trong DB ngay lập tức.
   - Bổ sung tham số `grace_days_prev_month` (mặc định `5`) và `manual_adjust_videos` (mặc định `0`, cho phép số âm/dương) vào `DEFAULT_KOC_RULES` / `KocCommissionRulesIn`.
   - Sửa `sync_source_from_xlsx_bytes`: ưu tiên `published_at` giải mã từ TikTok ID / TikWM, không để cột `Ngày air` gõ tay trên Sheet đè mất; bảo toàn nguyên vẹn `manual_kpi`.
   - Nâng cấp `calc_koc_commission`, `list_sources_summary`, `commission_by_staff`: loại tự động video `dup_prev` & `out_of_month` (trừ khi `manual_kpi == 1`), loại video `manual_kpi == -1`, cộng video `manual_kpi == 1` và `manual_adjust_videos`.
2. **Phase 2 — API & Giao Diện KOC + HRM (`routers/marketplace.py`, `templates/index.html`, `static/js/modules/marketplace.js`, `routers/hrm.py`, `static/js/modules/hrm.js`):**
   - Endpoint `PUT /api/marketplace/koc/videos/{video_id}` nhận thêm `manual_kpi` (`-1`, `0`, `1`).
   - Bảng `Danh Sách Link Video`: thêm cột `Ngày Đăng` (kèm nhãn `Đúng T10` / `Du di cuối T09` / `Trùng T09` / `Cũ T08`), hiển thị tiến độ kênh dưới `@koc` (`Kênh: X đạt + Y duyệt / Z video`), nút bấm 1 chạm `[Tính KPI]` / `[Ngoại lệ]` / `[Loại]`, và mở rộng bộ lọc (`Chưa đạt - Chờ xét`, `Đã duyệt tay`, `Trùng / Tháng cũ`).
   - Modal `Công Thức Hoa Hồng`: thêm ô `Số ngày du di cuối tháng trước (ngày)` (mặc định `5`) và ô `Cộng/trừ video thủ công (+/- video)` (cho phép nhập âm/dương).
   - Đồng bộ nhãn chi tiết sang `HRM -> Hoa Hồng & Tip` (`X đạt view + Y duyệt tay`).
3. **Phase 3 — Kiểm Thử & Checkpoint:**
   - Viết pytest kiểm tra giải mã ngày đăng Snowflake, bảo toàn `manual_kpi` sau khi `sync` & `refresh-views`, chặn trùng liên tháng, du di 5 ngày cuối tháng trước, và đồng bộ tổng tiền sang `calculate_period` HRM.
