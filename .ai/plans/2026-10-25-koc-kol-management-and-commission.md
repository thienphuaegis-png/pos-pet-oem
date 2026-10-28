# Quản Lý KOC/KOL, Link Video & Tính Hoa Hồng — ĐÃ DUYỆT (1a 2c 3a)

## 1. Khảo sát Google Sheet mẫu (`1TRCLEZtxbGBvsLrFU9pIUTqrlWeAMUrkTr2B4aBJeVA`)
Đã tải và đọc toàn bộ 39 tab của file Sheet anh gửi:
- **Các tab quản lý KOC theo nhân sự & tháng** (`THANH 7/2026`, `THANH 8/2026`, `THANH 9/2026`, `THANH 10/2026`, `Đôn 6/2026`, `Kho KOC/KOL_chưa hợp tác`...):
  - Dòng 1–11: Tổng kết chiến dịch (`KPI VIDEO/tháng = 100–200`, Tổng KOC đề xuất, Đã duyệt, Số video đã trả, Số video thiếu theo KPI, Chi phí booking).
  - Dòng 13–14 (Header): `STT | Ngày | KOC (ID, Follow, Doanh thu) | LINK KOC | Note | Mẫu đề xuất | Số video | Duyệt KOC | Freecast | Có cast | Sđt/zalo/mail | Thông tin gửi mẫu | Đã gửi | Ngày gửi | Ngày nhận | Trả video | Số video đã trả | Link Air (nhiều link TikTok cách nhau khoảng trắng/xuống dòng) | Ngày air video | Facebook/Tiktok/Shopee | Code QC | Doanh số đạt | Đánh giá | Tái hợp tác`.
- **Các tab gom link & đếm view tính hoa hồng** (`gid=1807044221` = tab `2`, `Tiktok`, `Bản sao của Tiktok`, `Tiktok_ChiTiet`):
  - Dùng công thức `SPLIT(REDUCE(...))` tách toàn bộ link TikTok từ cột `Link Air` (cột R hoặc S) của tab nhân sự tháng sang danh sách từng video.
  - Quét lượt xem (`Lượt xem`), `Cập nhật lúc`, `Trạng thái` (`OK` / `Thành công`), tách `Tác giả (KOC)` (`/@username`).
  - **Cấu hình điều kiện & đơn giá** (tại `Tiktok!A2:H7`):
    - `Mức view sàn đạt KPI`: **200 view** (`>= 200` = đạt KPI; `< 200` = chưa đạt).
    - `Đơn giá hoa hồng cố định`: **10.000 đ / video đạt KPI** (hoặc thưởng thêm video viral `>= 1.000 view`).

---

## 2. Bản Đồ Ánh Xạ Dữ Liệu (Data Mapping) với POS hiện tại

| Trường dữ liệu | Nguồn lấy / Lưu tại | File / Vị trí hiện có | Ghi chú |
|---|---|---|---|
| Cấu hình Link Google Sheet (không khóa cứng) | `settings` (`koc_sheet_urls` hoặc bảng `koc_campaigns`) | `database.py` / `routers/marketplace.py` | Lưu danh sách nhiều link Sheet / tab (chọn link hoặc dán link bất kỳ lúc nào) |
| Danh sách nhân viên phụ trách (Thanh, Đôn, Hân...) | `staff` (`id`, `name`, `employee_code`) | `services/payroll_service.py:200` | Hiện có `#23 Hà Đặng Phương Thanh`, `#13 Trần Nguyễn Quế Đôn`, `#16 Trần Nguyễn Nhất Hân`... |
| Danh sách KOC / KOL & Link kênh | Bảng mới `koc_profiles` hoặc `koc_campaign_items` | `database.py` | KOC ID (`@username`), link kênh, follow, SĐT/Zalo, mẫu gửi, cast/freecast, nhân viên phụ trách |
| Danh sách Link Video & View | Bảng mới `koc_videos` | `database.py` | `video_url`, `video_id`, `koc_username`, `views`, `likes`, `status`, `updated_at`, `campaign_id` |
| Quét view TikTok tự động | TikWM API / `yt-dlp` hoặc đọc từ cột Lượt xem của Sheet | Skill `tiktok-video-metrics-scraper` | Có thể vừa đọc số view có sẵn từ Sheet vừa bấm "🔄 Quét View TikTok mới nhất" ngay trong POS |
| Cộng hoa hồng vào Bảng Lương HRM | `sales_commission_by_staff` / `compute_line` | `services/payroll_service.py:275-282` | Giống cơ chế `pancake_sellers` vừa làm |

---

## 3. Ma Trận Tác Động Sự Kiện (Event Impact Matrix)

| Chiều tác động | Xử lý |
|---|---|
| **1. Trigger (UI/API)** | Subtab mới `🎬 KOC / KOL & Affiliate` trong tab **Bán Hàng Sàn TMĐT** (`#tab-marketplace`). Cho phép: (1) Thêm/đổi nhiều link Google Sheet bất kỳ (không khóa cứng) + chọn tab cần đồng bộ, hoặc nhập/dán trực tiếp KOC & link video; (2) Nút `🔄 Đồng Bộ Từ Sheet` & `👁️ Quét View TikTok`. |
| **2. Entity State** | Lưu KOC, chiến dịch/tháng, danh sách link video, số view, trạng thái đạt KPI (`views >= min_views`). |
| **3. Ledger / Financial** | Tính hoa hồng theo cấu hình linh hoạt (mức view sàn mặc định `200`, đơn giá/video đạt KPI mặc định `10.000đ`, thưởng viral...). Tự cộng vào cột Hoa hồng của nhân viên phụ trách trong Bảng Lương HRM (nếu gán NV) hoặc xuất bảng thanh toán riêng. |
| **4. Stock / Debt** | Không tự động trừ kho khi đồng bộ sheet (tránh trừ trùng với đơn gửi mẫu trên sàn). |
| **5. Reversal & Siblings** | Đồng bộ lại theo `video_id` / `video_url` idempotent (chỉ cập nhật view & trạng thái, không nhân đôi dòng). Khi xóa chiến dịch/link nguồn, hoàn tác số liệu hoa hồng tạm tính. |

---

## 4. Đáp Án Đã Chốt (2026-10-25)

| # | Câu hỏi | Đáp án đã chốt |
|---|---|---|
| 1 | Đối tượng nhận hoa hồng | **1a:** Tính hoa hồng/thưởng KPI video cho Nhân viên nội bộ phụ trách KOC (Thanh, Đôn, Hân...) và tự cộng vào **Bảng Lương HRM** (cột `Hoa hồng bán`), đồng thời hiển thị đầy đủ danh sách KOC/KOL kèm link kênh & link video. |
| 2 | Công thức tính hoa hồng video | **2c:** Cấu hình linh hoạt ngay trên giao diện: chỉnh được `Mức view sàn đạt KPI` (mặc định `200`), `Định mức KPI trừ đi` (mặc định `0` hoặc `200` tùy chỉnh), `Đơn giá/video đạt` (mặc định `10.000đ`), và `Thưởng thêm video viral` (`>= Mức view viral`). Có thể dùng công thức chung hoặc cấu hình riêng cho từng nguồn/nhân viên. |
| 3 | Cơ chế lấy dữ liệu từ Link Google Sheet (không khóa cứng) | **3a:** Dán bất kỳ link Google Sheet nào → tự đọc file `.xlsx` qua `/export?format=xlsx` để liệt kê toàn bộ các Tab bên trong → chọn đồng bộ cả tab **Danh sách KOC/Booking** (tự tách nhiều link trong cột `Link Air`) lẫn tab **Tổng hợp Link & View** (`gid=...` / `Tiktok`), kèm nút **Quét View TikTok trực tiếp trong POS**. |
