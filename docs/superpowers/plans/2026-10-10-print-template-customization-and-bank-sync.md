# Implementation Plan: Nâng Cấp Toàn Diện Hệ Thống Mẫu In & Popup In Lại Hóa Đơn

**Goal:** Thêm cờ ẩn/hiện mẫu in khỏi POS, bộ lọc 2 tầng tab khổ giấy động trên Popup in, khóa kích thước Logo, lấy tài khoản ngân hàng động theo đơn hàng và mở rộng tùy biến Canvas.

**Architecture:**
- Frontend: Cập nhật `static/js/pos.js`, `static/js/modules/productions.js`, `templates/index.html`, `templates/pos.html`.
- Backend: Endpoint `/api/orders/{code}` trả thêm thông tin `payment_account` chi tiết (ngân hàng, số tài khoản, chủ tài khoản).

---

### Task 1: Thêm Unit Test cho các tính năng mới
**Files:**
- Create: `tests/test_print_customization_and_bank_sync.py`

### Task 2: Backend - Trả thông tin Payment Account chi tiết trong API Order
**Files:**
- Modify: `routers/pos.py` (trong hàm lấy chi tiết đơn hàng hoặc query đơn hàng)

### Task 3: Frontend - Thêm cờ `is_active` cho preset & Ẩn mẫu khỏi POS Bar
**Files:**
- Modify: `static/js/modules/productions.js` (Thêm switch ẩn/hiện mẫu ở cài đặt)
- Modify: `static/js/pos.js` (Lọc bỏ các mẫu `is_active === false` khi render select ở POS bar)

### Task 4: Frontend - Popup In Lọc 2 Tầng (Tab Khổ Giấy Động + Dropdown)
**Files:**
- Modify: `templates/index.html` & `templates/pos.html` (Khung nút chuyển khổ động)
- Modify: `static/js/pos.js` (Render động tab khổ giấy và lọc dropdown theo khổ đã chọn)

### Task 5: Frontend - Khóa Kích Thước Logo & Lấy Thông Tin Ngân Hàng Động
**Files:**
- Modify: `static/js/pos.js` (Khóa max-height logo, lấy thông tin bank từ order.payment_account)
- Modify: `static/js/modules/productions.js` (Khóa max-height logo trên canvas editor)

### Task 6: Chạy Test & Kiểm Tra Hồi Quy
**Files:**
- Test: `tests/test_print_customization_and_bank_sync.py`
- Test: Toàn bộ print test suite
