# Plan: Chi Tiết Khoản Thưởng/Phụ Cấp Bảng Lương, Sửa Quét View TikTok 461 Video & Đồng Bộ Bộ Chọn Tháng (Firefox/Chrome)

**Ngày chốt thiết kế:** 2026-11-05  
**Mockup đối chiếu:** `.ai/sketches/2026-11-05-payroll-adjust-and-koc-tiktok-ux.html`  
**Trạng thái:** Đã chốt 3 quyết định nghiệp vụ với anh Phú — Chờ duyệt triển khai code

---

## 1. Chẩn Đoán Gốc Rễ (Root Causes Verified)

1. **Không cập nhật được `Thưởng khác`, `PC Xăng/Khác`, `Trừ khác` trên Bảng Lương:**
   - API `PUT /api/hrm/payroll/{month}/lines/{staff_id}` (`routers/hrm.py:2033`) và `#modal-hrm-edit-line` đã tồn tại, nhưng 3 ô `fuel_other`, `bonus_other`, `deduction_other` trong `static/js/modules/hrm.js:601,615,625` và Modal `Phiếu Lương` (`openHrmPayslipModal`) chỉ render số tĩnh, **không có sự kiện click mở sửa**.
   - Ngoài ra, cấu trúc hiện tại chỉ lưu 3 con số gộp, chưa cho nhập nhiều dòng khoản mục lẻ (tên khoản + số tiền) để in rõ lên Phiếu Lương.

2. **Quét View TikTok nổ lỗi `Lỗi: JSON.parse: unexpected character at line 1 column 1 of the JSON data`:**
   - **Lỗi 1 (Crash 500 ngay lập tức):** `routers/marketplace.py:1897,1904,1907` gọi `asyncio.Semaphore(5)` / `asyncio.gather` nhưng đầu file **thiếu `import asyncio`** → nổ `NameError`, server trả `Internal Server Error` dạng text thô, `res.json()` ở Firefox nổ `JSON.parse`.
   - **Lỗi 2 (Rate-limit TikWM):** Gọi 5 request song song vào `https://www.tikwm.com/api/` bị chặn `Free Api Limit: 1 request/second` (4/5 video thất bại — đã test thực tế).
   - **Lỗi 3 (Timeout Proxy khi quét 461 video):** Quét 80–461 video trong 1 HTTP request vượt quá `AbortSignal.timeout(25000)` của `deploy/vercel_bridge/api/index.js:333`.

3. **Ô chọn `Tháng:` bị trắng trơn trên Firefox:**
   - Trình duyệt Firefox trên Windows không hỗ trợ lịch tháng cho thẻ `<input type="month">`. Hiện có **4 vị trí** đang dùng `type="month"` (`templates/index.html:2454, 4174, 8097, 17454`).

---

## 2. Thiết Kế Giải Pháp Chi Tiết (3 Hạng Mục)

### Hạng mục 1: Nhập Nhiều Khoản Thưởng / Phụ Cấp / Giảm Trừ & Hiển Thị Lên Phiếu Lương
- **Database & Backend (`database.py`, `services/payroll_service.py`, `routers/hrm.py`):**
  - Bổ sung cột `manual_items_json TEXT DEFAULT '[]'` cho bảng `payroll_lines` (tự động migrate an toàn trên cả SQLite & Cloudflare D1).
  - `ManualIn` nhận `manual_items: Optional[List[ManualItemIn]]` (`type`: `'fuel' | 'bonus' | 'deduction'`, `label`: tên khoản, `amount`: số tiền >= 0) đồng thời tương thích ngược với `bonus_other`, `fuel_other`, `deduction_other`, `manual_note`.
  - Khi lưu `manual_items`: tự cộng tổng chính xác ra `fuel_other`, `bonus_other`, `deduction_other`, ghép chuỗi tóm tắt vào `manual_note`, giữ nguyên qua các lần bấm **"Tính Lương"** (`calculate_period`), và trả `manual_items` vào cả `/api/hrm/payroll/{month}` lẫn `/api/hrm/my-payslip`.
- **Frontend (`templates/index.html`, `static/js/modules/hrm.js`):**
  - Click trực tiếp vào bất kỳ ô `PC Xăng/Khác`, `Thưởng khác`, `Trừ khác` trên `Bảng Lương` (khi kỳ lương `draft`) → mở Modal **Điều Chỉnh Khoản Cộng / Trừ Lương** và tự động chọn sẵn đúng loại khoản vừa bấm.
  - Trong Modal `Phiếu Lương` (`openHrmPayslipModal`), thêm nút `✏️ Điều chỉnh Thưởng / Phụ cấp / Trừ khác` (dành cho Admin/Kế toán khi bảng lương chưa khóa).
  - Trên **Phiếu Lương** (xem web & bản in): liệt kê rõ từng dòng khoản mục (`+ Phụ cấp xăng xe: 300.000đ`, `+ Thưởng nóng: 500.000đ`, `- Làm mất thẻ xe: -100.000đ`).
  - Cập nhật `tests/test_hrm_wfh_perms_and_payroll_cols.py` khớp quy ước click trực tiếp vào ô số.

### Hạng mục 2: Quét View TikTok Bền Vững Theo Lô (461+ Video) + Chống Timeout / Rate-Limit
- **Backend (`routers/marketplace.py`, `services/koc_service.py`):**
  - Thêm `import asyncio` vào `routers/marketplace.py`.
  - Nâng cấp `fetch_tiktok_video_metrics`:
    - Điều tiết nhịp gọi `tikwm.com/api/` tuần tự cách nhau `~1.1s` + tự retry 1 lần nếu gặp `Free Api Limit`, kèm **fallback đọc thẳng HTML TikTok** (`__UNIVERSAL_DATA_FOR_REHYDRATION__` → `itemStruct.stats.playCount`) khi TikWM nghẽn.
  - Endpoint `POST /api/marketplace/koc/sources/{source_id}/refresh-views`:
    - Hỗ trợ `mode=pending` (chỉ lấy video `views = 0` hoặc `status` lỗi/chưa quét) và `mode=all` (`offset` + `limit` mặc định `10` video/lô, hoàn thành trong `~11 giây` < `25s` timeout của Vercel Proxy), trả về `{scanned, updated, qualified_in_batch, remaining}` để trình duyệt chạy vòng lặp mượt mà.
- **Frontend (`templates/index.html`, `static/js/modules/marketplace.js`):**
  - Bọc helper `safeFetchJson(res)` cho toàn bộ API KOC: nếu server/proxy trả HTML/text lỗi (502/504/500), hiển thị thông báo tiếng Việt rõ ràng và tự thử lại 1 lần thay vì nổ `JSON.parse`.
  - Tách 2 nút rõ ràng:
    1. Nút chính **`👁️ Quét View Chưa Có (N)`**: chỉ quét các video `0 view / Chưa quét / Lỗi` (lỡ đóng tab mở lại quét tiếp ngay từ chỗ dở).
    2. Nút phụ **`🔁 Quét Lại Tất Cả`**: cập nhật lại lượt xem mới nhất cho toàn bộ video của chiến dịch.
  - Thêm **Thanh tiến trình trực tiếp** (`Đang quét X / Y video (Z%) · Đạt KPI: K · Nút [⏸ Tạm dừng / ▶ Tiếp tục]`), tự làm mới số KPI & bảng sau mỗi lô 10 video.

### Hạng mục 3: Đồng Bộ Bộ Chọn Tháng Chuẩn Firefox/Chrome Ở Cả 4 Vị Trí
- Xây dựng component dùng chung nhẹ (`initPosMonthPicker` / Popover lưới 12 tháng `Thg 01..Thg 12` + chuyển năm `◀ Năm 2026 ▶` + nút chọn nhanh `Tháng này | Tháng trước`) thay thế hoàn toàn 4 thẻ `<input type="month">` bị trắng trên Firefox:
  1. **Tab KOC / KOL & Affiliate** (`#koc-month-filter`): cụm `[Tất cả | Tháng này | Tháng trước] + [◀ Tháng 10/2026 ▾ ▶]`.
  2. **Modal Thêm/Sửa Nguồn KOC** (`#koc-src-month`): nút chọn tháng mở Popover 12 tháng + nút nhanh `Tháng này / Tháng trước`.
  3. **Tab Phiếu Lương Của Tôi** (`#my-payslip-month`): `[◀ Tháng MM/YYYY ▾ ▶]` + Popover 12 tháng.
  4. **Tab Quản Lý Thợ Spa** (`#spa-staff-filter-month`): `[◀ Tháng MM/YYYY ▾ ▶]` + Popover 12 tháng.

---

## 3. Kế Hoạch Kiểm Thử
- Unit & API test mới `tests/test_payroll_manual_items_and_koc_scan.py`:
  - Lưu nhiều khoản `fuel` / `bonus` / `deduction` → kiểm tra tổng cột, giữ nguyên sau `calculate_period`, trả đúng trên `my-payslip`.
  - Test `refresh-views` với `mode=pending` và `mode=all` theo lô, đảm bảo không còn `NameError: asyncio` và fallback khi TikWM trả rate-limit.
  - Kiểm tra HTML không còn `<input type="month">` gây lỗi hiển thị trên Firefox.
- Chạy `pyflakes`, `node --check`, và toàn bộ suite `pytest` liên quan.
