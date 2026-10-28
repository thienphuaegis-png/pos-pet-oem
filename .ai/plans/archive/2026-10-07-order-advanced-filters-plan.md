# Implementation Plan: Nâng Cấp Bộ Lọc Hóa Đơn Nâng Cao Server-Side

> **For agentic workers:** REQUIRED SUB-SKILL: Use subagent-driven-development or executing-plans.

**Goal:** Nâng cấp tính năng lọc hóa đơn bán hàng (`orders-subview-retail`) thành bộ lọc đa tiêu chí phía Server/CSDL: Mốc thời gian, Hình thức thanh toán, Nhân viên tạo đơn, Khách hàng, Có chứa sản phẩm, Trạng thái nợ, và phân trang.

**Architecture:** 
- Backend: Cập nhật endpoint `GET /api/orders` tại `routers/pos.py` hỗ trợ các bộ lọc động an toàn qua SQLite query.
- Frontend: Bổ sung thanh công cụ lọc nâng cao tại `templates/index.html` và module xử lý lọc tại `static/js/modules/productions.js`.
- Đồng bộ tự động sang `C:\POS` và re-build `POS_Mastercare.exe`.

**Tech Stack:** Python 3.11, FastAPI, SQLite, Pytest, JavaScript ES6.

---

### Task 1: Nâng cấp Backend API `GET /api/orders` hỗ trợ Filter Query Params
**Files:**
- Modify: `routers/pos.py`
- Create: `tests/test_order_advanced_filters.py`

- [ ] **Step 1: Viết test suite `tests/test_order_advanced_filters.py` kiểm tra các trường hợp lọc**
- [ ] **Step 2: Cập nhật hàm `list_orders` trong `routers/pos.py` nhận các query parameters và xây dựng SQL `WHERE` động**
- [ ] **Step 3: Chạy test và xác nhận pass 100%**

---

### Task 2: Cập nhật giao diện HTML thanh bộ lọc trong `templates/index.html`
**Files:**
- Modify: `templates/index.html`

- [ ] **Step 1: Thêm khung bộ lọc nâng cao gồm 2 hàng (Thời gian, Phương thức thanh toán, Nhân viên, Khách hàng, Chứa món, Công nợ, Nút Lọc và Xóa Lọc)**
- [ ] **Step 2: Đảm bảo layout responsive, hiển thị đẹp trên cả màn hình nhỏ và lớn**

---

### Task 3: Cập nhật JavaScript xử lý lọc trong `static/js/modules/productions.js`
**Files:**
- Modify: `static/js/modules/productions.js`

- [ ] **Step 1: Xây dựng hàm `applyOrdersFilters(page)` thu thập dữ liệu bộ lọc và gọi API `GET /api/orders`**
- [ ] **Step 2: Xây dựng hàm `resetOrdersFilters()` reset các input về mặc định và nạp lại danh sách**
- [ ] **Step 3: Khởi tạo danh sách options cho dropdown Thu Ngân và Khách Hàng khi mở tab Hóa Đơn**
- [ ] **Step 4: Tăng version cache script `productions.js?v=20261007_02` trong `templates/index.html`**

---

### Task 4: Kiểm thử tự động & Verify giao diện
**Files:**
- Run test: `pytest tests/test_order_advanced_filters.py tests/test_reports_analytics.py`
- Verify Playwright screenshot

- [ ] **Step 1: Chạy toàn bộ pytest liên quan**
- [ ] **Step 2: Chụp ảnh Playwright và dùng `vision_analyze` kiểm tra độ trực quan và chuẩn mực của thanh bộ lọc**

---

### Task 5: Đồng bộ sang `C:\POS`, Rebuild `.exe` & Git Push
**Files:**
- Target: `C:\POS`
- Binary: `POS_Mastercare.exe`

- [ ] **Step 1: Re-compile `uv run pyinstaller POS_Mastercare.spec --distpath . -y`**
- [ ] **Step 2: Copy toàn bộ code mới sang `C:\POS`**
- [ ] **Step 3: Commit và push lên `github/main`**
