# Triển Khai Dải Lịch Ngang (Date Strip) & Hiển Thị Trọn Vẹn Ca Spa Trong Ngày

> **Yêu cầu Sub-skill:** Sử dụng executing-plans hoặc thực thi trực tiếp có checkpoint kiểm thử tự động.

**Mục tiêu:** Tích hợp thanh dải lịch ngang 7 ngày và cho phép Bảng Spa trong ngày hiển thị trọn vẹn ca làm việc (gồm cả ca chưa về lẫn ca đã về hôm nay), kèm 3 nút lọc nhanh trạng thái trong ngày.

**Kiến trúc:** 
- `templates/index.html`: Bổ sung container `#spa-date-strip-container`, ô chọn ngày nhanh `#input-spa-custom-date` và cụm 3 nút lọc trạng thái trong ngày (`btn-spa-filter-daily-all`, `btn-spa-filter-daily-unreturned`, `btn-spa-filter-daily-returned`).
- `static/js/modules/spa.js`: Quản lý state `petServiceDailyQuickFilter` và `petServiceSelectedStripDate`; hàm sinh dải ngày `renderSpaDateStrip()`; logic lọc và style dòng đã về `renderPetServicesTable()`.
- `tests/test_spa_render.js`: Unit test kiểm thử tự động toàn diện.

---

## Danh Mục Files

| File | Trách nhiệm |
|---|---|
| `docs/superpowers/specs/2026-09-27-spa-date-strip-calendar-and-daily-view-design.md` | Tài liệu đặc tả đã duyệt |
| `templates/index.html` | Thêm HTML Date Strip & Quick Filter Buttons |
| `static/js/modules/spa.js` | Viết logic dải ngày, lọc ca hôm nay và style dòng đã về |
| `tests/test_spa_render.js` | Test case 18 kiểm tra Date Strip & lọc ca trong ngày |

---

## Chi Tiết Các Bước Triển Khai

### Task 1: Cập Nhật Cấu Trúc Giao Diện HTML (`templates/index.html`)
- [ ] Thêm container `#spa-date-strip-container` và ô chọn ngày `#input-spa-custom-date` vào đầu `#pet-sub-view-services`.
- [ ] Bổ sung cụm 3 nút lọc nhanh trong ngày:
  - `btn-spa-filter-daily-all` (`⚡ Tất Cả (<span id="count-daily-all">0</span>)`)
  - `btn-spa-filter-daily-unreturned` (`⏳ Chưa Về (<span id="count-daily-unreturned">0</span>)`)
  - `btn-spa-filter-daily-returned` (`🏠 Đã Về (<span id="count-daily-returned">0</span>)`)
- [ ] Kiểm tra tính toàn vẹn HTML bằng `pytest tests/test_html_integrity.py`.

### Task 2: Triển Khai Logic Dải Ngày & Hiển Thị Ca Trong Ngày (`static/js/modules/spa.js`)
- [ ] Khai báo state:
  - `petServiceDailyQuickFilter = 'all'`
  - `petServiceSelectedStripDate = 'today'`
- [ ] Viết hàm `renderSpaDateStrip()`:
  - Lấy ngày hôm nay làm trung tâm, tạo dải 7 ngày (-2 ngày đến +4 ngày).
  - Đếm số ca của từng ngày từ `allPetServiceTickets`.
  - Sinh HTML các button ngày với Thứ, Ngày/Tháng, và số lượng ca.
- [ ] Viết hàm `selectSpaStripDate(dateStr)` & `setSpaDailyQuickFilter(type)`.
- [ ] Cập nhật `renderPetServicesTable()`:
  - Lọc theo ngày được chọn trên dải lịch (`petServiceSelectedStripDate`).
  - Lọc theo `petServiceDailyQuickFilter` (`all` hiện cả ca chưa về và đã về; `not_checked_out` ẩn ca đã về; `checked_out` chỉ hiện ca đã về).
  - Cập nhật số đếm trên 3 nút lọc nhanh `#count-daily-all`, `#count-daily-unreturned`, `#count-daily-returned`.
  - Render dòng ca đã về với nền `bg-emerald-50/40 border-l-4 border-l-emerald-500`, badge `🏠 Đã Về` và nút in `🧾 Bill`.
- [ ] Tích hợp gọi `renderSpaDateStrip()` khi tải danh sách ca và khi chuyển view.

### Task 3: Viết Unit Test Kiểm Thử Tự Động (`tests/test_spa_render.js`)
- [ ] Bổ sung Test 18 trong `tests/test_spa_render.js`:
  - Kiểm tra `renderSpaDateStrip()` sinh đủ 7 nút ngày có số lượng ca.
  - Kiểm tra click chọn ngày khác lọc đúng ca của ngày đó.
  - Kiểm tra `petServiceDailyQuickFilter`:
    - `all`: Chứa đủ cả ca chưa về (`#15`, `#16`, `#17`) và ca đã về (`#18`).
    - `not_checked_out`: Chỉ chứa `#15`, `#16`, `#17`, loại bỏ `#18`.
    - `checked_out`: Chỉ chứa `#18`, loại bỏ `#15`, `#16`, `#17`.
- [ ] Chạy `node tests/test_spa_render.js` và toàn bộ pytest suite đảm bảo 100% pass.
