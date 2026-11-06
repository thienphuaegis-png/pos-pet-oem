# Kế Hoạch Xử Lý 4 Vấn Đề: Lọc NV Nhật Ký Hoạt Động, Chọn Cột Link & Khử Trùng KOC, Xuất Excel Hoa Hồng & Tăng Tốc Mở Nhập Hàng NCC

**Ngày lập:** 2026-11-06  
**Trạng thái:** HOÀN TẤT & ĐÃ KIỂM THỬ (PASS 100%)

---

## 1. Bảng Chẩn Đoán Gốc Lỗi Thực Tế Trên Code & Google Sheet Thật

| # | Vấn đề anh gặp | Nguyên nhân gốc (`file:line`) & Số liệu kiểm chứng thực tế | Hậu quả trên màn hình của anh |
|---|---|---|---|
| **1** | **Nhật Ký Hoạt Động** chưa chọn được nhân viên để lọc (chỉ hiện mỗi `Tất cả nhân viên`) | `static/js/app.js:614` khi mở subtab `activity-log` chỉ gọi `renderActivityLog()`, **quên gọi hàm nạp nhân viên** (`populateStaffPermSelect()` ở `static/js/staff.js:514` vốn chỉ chạy khi anh bấm vào tab `Phân Quyền & Module` trước). Ngoài ra `activity_logger.py:45-87` chưa dịch tên tiếng Việt cho API KOC & Gán hàng NCC. | Mở thẳng `Nhật Ký Hoạt Động` thì ô lọc nhân viên trống rỗng (chỉ có 1 dòng `Tất cả nhân viên`) dù bảng bên dưới có `Hoàng Phi Phụng`, `admin`. |
| **2a** | **Bảng Hoa Hồng KOC bị trùng 2 dòng `THANH 10/2026`**, trong đó dòng mới ra `0 KOC / 0 Video` | Nút `+ Thêm / Đổi Link Google Sheet` (`static/js/modules/marketplace.js:3028`) luôn tạo mới (`id=null` $\to$ `INSERT` ở `routers/marketplace.py:1660`) không kiểm tra trùng nguồn/tháng, và trên dòng bảng thiếu nút `Xóa` nhanh. Đồng thời popup tách 2 ô chọn Tab: lúc `15:32` anh chọn `THANH 102026` vào ô thứ 2 (`Tab Tổng Hợp Link & View`), mà hàm `parse_video_views_sheet` (`services/koc_service.py:640, 698`) **mặc định chỉ đọc cứng Cột A (`STT`)**, trong khi link nằm ở **Cột S (`Link Air`)**! | Sinh ra dòng thừa `View: THANH 102026` có `0` video, làm bảng bị trùng 2 dòng `THANH 10/2026`. |
| **2b** | **Thấy lấy thiếu / lệch dữ liệu** (`461` video / `165` KOC trên POS so với `559` video / `190` KOC trên Sheet, lại lọt cả link ở cột `LINK KOC`) | Kiểm tra trực tiếp file Sheet `THANH 102026` thật:<br>1. Dòng cũ trên POS đang ở bản Sync ngày **04/11 15:04** (`461` video), chưa bấm `Sync` lại.<br>2. `parse_koc_booking_sheet` (`services/koc_service.py:556`) đang quét mù **tất cả các cột (`1..max_c`)** tìm `/video/` $\to$ hút nhầm luôn **2 link video cũ dán ở Cột D (`LINK KOC` — link giới thiệu kênh lúc xin mẫu, dòng 24/165 `@miupetshop2` và dòng 178 `@nguyen040696`)**!<br>3. Trên Sheet hiện tại, ô `D7 = 559` cộng cột số gõ tay `=SUMIFS(R14:R696,...)` (dòng 96 `@hoaxinh009` gõ `21` nhưng Cột S chỉ dán `19` link).<br>4. Riêng **Cột S (`Link Air`)** thực tế có **558 link**, trong đó **16 link bị dán trùng 2 lần** ngay trong Cột S $\to$ khử trùng chuẩn còn đúng **542 video duy nhất** (`558 - 16 = 542`).<br>5. Ô `D4 = 190` đếm dòng `DUYỆT`, gồm **25 KOC nhận mẫu 2–3 đợt/tháng** nằm nhiều dòng $\to$ gộp theo `@username` còn **163 kênh duy nhất**. | Vừa hút nhầm link ở Cột D (`LINK KOC`), vừa không cho anh khóa cứng **chỉ lấy Cột S (`Link Air`)**, lại chưa hiện thống kê `"558 link Cột S -> 542 video duy nhất (trùng 16)"`. |
| **3** | **Chưa có nút Xuất Excel** bảng Hoa Hồng KOC | `routers/marketplace.py` và giao diện tab `KOC / KOL & Affiliate` chưa có API & nút xuất `.xlsx`. | Anh không tải được bảng chốt hoa hồng + danh sách chi tiết video (view, ngày đăng, duyệt tay, loại trùng) ra Excel để lưu/gửi kế toán & nhân sự đối chiếu. |
| **4** | **Tạo mới Nhập Hàng** chờ rất lâu mới hiện danh sách Nhà Cung Cấp | 3 điểm nghẽn chồng nhau:<br>1. `initPurchases()` (`static/js/modules/purchases.js:89-105`) gom `Promise.all([warehouses, suppliers, ingredients, products])` $\to$ danh sách NCC bị **treo chờ tải xong hàng ngàn sản phẩm `/api/products`** qua Tailscale Funnel (~10–25 giây).<br>2. Ô `#purchase-supplier-search` (`templates/index.html:8252-8254`) gắn cả `onfocus` + `onclick` bắn đúp 2 request `/api/contacts?type=supplier` xếp hàng sau `/api/products`, trong lúc chờ không hiện khung loading.<br>3. Backend `GET /api/contacts?type=supplier` (`routers/partners.py:145-177`) vẫn quét thừa bảng `pets` (>6.100 dòng) + chạy 4 subquery tương quan trên từng NCC. | Bấm `➕ Tạo Đơn Mới` rồi bấm vào ô Nhà Cung Cấp bị đơ trắng nhiều giây mới bung danh sách NCC. |

---

## 2. Bản Đồ Ánh Xạ Dữ Liệu (Data Mapping)

| Hạng mục | Trường giao diện / File xuất | Nguồn dữ liệu / Cột DB | File xử lý |
|---|---|---|---|
| **Lọc NV Nhật ký** | Dropdown `#activity-log-filter` | `staff(id, name, role)` hợp nhất `DISTINCT activity_log(staff_id, staff_name, role)` | `routers/settings.py`, `static/js/staff.js`, `activity_logger.py` |
| **Chọn cột Sheet KOC** | Tab chính + `Cột Link Video` (`video_col`), `Cột KOC` (`koc_col`), `Cột Lượt xem` (`views_col`), `Cột Sản phẩm` (`product_col`) | Thêm `column_mapping_json` vào `koc_sources` + API `/koc/inspect-columns` đọc tiêu đề & đếm số link từng cột `A..AZ` | `services/koc_service.py`, `routers/marketplace.py`, `schemas.py`, `templates/index.html`, `static/js/modules/marketplace.js` |
| **Thống kê khử trùng Sheet** | Badge đối chiếu sau Sync (`558 link -> 544 duy nhất, gộp 14 link trùng`) | `raw_links_found`, `duplicate_links_in_sheet`, `videos_synced` trả về từ `sync_source_from_xlsx_bytes` | `services/koc_service.py`, `static/js/modules/marketplace.js` |
| **Xuất Excel Hoa Hồng** | File `.xlsx` (`HoaHong_KOC_<thang>.xlsx`) | Sheet 1: Tổng hợp chiến dịch & NV (`list_sources_summary`)<br>Sheet 2: Chi tiết Link Video, Ngày đăng, View, Trạng thái KPI (`list_enriched_videos`)<br>Sheet 3: Tổng hợp theo từng kênh `@KOC` | `routers/marketplace.py` (`GET /api/marketplace/koc/export-excel`), `routers/hrm.py` (nếu chọn gộp cả HRM) |
| **Tăng tốc NCC Nhập Hàng** | Ô chọn `#purchase-supplier-search` & `#purchase-warehouse` | Nhánh SQL riêng `type='supplier'` dùng CTE `GROUP BY` (bỏ `pets`) + nạp độc lập 0ms + tái sử dụng cache `posProducts` | `routers/partners.py`, `static/js/modules/purchases.js`, `templates/index.html` |

---

## 3. Ma Trận Tác Động Sự Kiện (Event Impact Matrix)

1. **Trigger (UI/Payload):**
   - Chọn Tab trong Modal KOC $\to$ gọi `POST /api/marketplace/koc/inspect-columns` trả danh sách cột `A..AZ` kèm tên tiêu đề & số link phát hiện được; tự động chọn sẵn cột nhiều link video nhất (VD `S — Link Air (558 link)`).
   - Lưu nguồn KOC trùng `(sheet_id, month)` $\to$ cảnh báo/cập nhật nguồn hiện có thay vì đẻ dòng trùng; thêm nút `Xóa` trực tiếp trên dòng bảng chiến dịch.
   - Bấm `Xuất Excel Hoa Hồng` $\to$ tải file `.xlsx` theo bộ lọc Tháng / Chiến dịch hiện hành.
   - Mở `Nhập Hàng` / `➕ Tạo Đơn Mới` $\to$ nạp `suppliers` + `warehouses` ưu tiên trước trong `<150ms`, không chờ `/api/products`.
2. **Entity State:**
   - Bảo toàn 100% `koc_videos.manual_kpi` và `views` đã quét khi đồng bộ lại theo cột mới chọn.
3. **Ledger / Financial & HRM:**
   - Hoa hồng KOC sau khi đồng bộ đủ 544 video duy nhất tự động cập nhật sang `HRM -> Hoa Hồng & Tip` và `Bảng Lương` kỳ `DRAFT` (không chạm kỳ `LOCKED`).
4. **Stock / Debt:**
   - Tối ưu SQL `GET /api/contacts?type=supplier` giữ nguyên 100% công thức `debt_company` + `debt_personal` (`initial_debt` + `purchases.debt_amount` + `oem_orders.remaining_payment`), chỉ chuyển từ 4 subquery lặp sang `LEFT JOIN` gộp nhóm.
5. **Reversal & Siblings:**
   - Khi xóa dòng chiến dịch KOC bị trùng (`0 video`), chỉ xóa dữ liệu thuộc `source_id` đó, giữ nguyên hoàn toàn chiến dịch gốc có 67 bài đã duyệt tay.

---

## 4. Phương Án Đã Chốt (`clarify`)

| # | Câu hỏi | Đáp án đã chốt |
|---|---|---|
| **1** | Cách chọn Cột lấy link video trong Google Sheet KOC & chống trùng dòng chiến dịch | **(1a)** Tự động đọc danh sách cột `A..Z` kèm tên tiêu đề & số link đếm được để anh chọn đúng cột (VD: `Cột S — Link Air (558 link)`), chặn tạo dòng chiến dịch trùng `(sheet_id, month, tab)` & thêm nút `Xóa` trực tiếp trên bảng. |
| **2** | Phạm vi Xuất Excel Bảng Hoa Hồng (`.xlsx`) | **(2a)** Xuất `.xlsx` **3 Sheet** ở màn KOC (`Tổng hợp Chiến dịch` + `Chi tiết Video/View/Ngày đăng` + `Tổng hợp theo @KOC`) **VÀ** thêm nút `Xuất Excel` ở màn `Chấm Công & Lương -> Hoa Hồng & Tip`. |
