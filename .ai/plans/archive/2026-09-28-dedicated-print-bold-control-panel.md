# Bảng Điều Khiển In Đậm Cố Định Cho Từng Loại Hóa Đơn — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use subagent-driven-development or executing-plans.

**Goal:** Thêm bảng điều khiển tập trung trong Cài Đặt Mẫu In để người dùng bật/tắt in đậm cố định cho từng loại hóa đơn (10 loại), và liên kết tự động áp dụng 100% khi in ngoài thực tế.

**Architecture:** Bổ sung setting `print_bold_configs` vào SQLite (`data/pos.db`). Thêm UI panel 10 checkbox trực quan tại đầu `#settings-sub-templates` (`templates/index.html`). Cập nhật `productions.js` để load/save config. Cập nhật các hàm in trong `pos.js`, `spa.js`, `productions.js`, `shifts.js`, `app.js` đọc trực tiếp config của từng loại hóa đơn và inject CSS `-webkit-text-stroke: 0.35px #000; font-weight: 900 !important;`.

**Tech Stack:** JavaScript (ES6+, Vanilla DOM), Python (FastAPI/Pytest/SQLite), HTML5/CSS3 (@media print).

---

## File Structure

| File | Responsibility |
|---|---|
| `tools/seed_print_bold_configs.py` | Khởi tạo cấu hình mặc định `print_bold_configs` trong `pos.db` |
| `templates/index.html:4800-4840` | Thêm bảng điều khiển 10 checkbox in đậm theo loại phiếu |
| `static/js/modules/productions.js` | Hàm `loadPrintBoldConfigs()`, `savePrintBoldConfigItem()`, `saveAllPrintBoldConfigs()` |
| `static/js/pos.js` | Áp dụng in đậm cho hóa đơn bán lẻ, B2B, tạm tính, nạp ví |
| `static/js/modules/spa.js` | Áp dụng in đậm cho phiếu tiếp nhận và phiếu thanh toán Spa |
| `static/js/shifts.js` | Áp dụng in đậm cho báo cáo kết ca Z-Report |
| `static/js/app.js` | Áp dụng in đậm cho phiếu kiểm kê kho A4 |
| `tests/test_fixed_print_bold_configs.py` | Test suite kiểm tra tính toàn vẹn của cấu hình và các hàm in |

---

## Tasks

### Task 1: Khởi Tạo Schema & Cấu Hình Mặc Định (`tools/seed_print_bold_configs.py`)

**Files:**
- Create: `tools/seed_print_bold_configs.py`
- Test: `tests/test_fixed_print_bold_configs.py`

- [ ] **Step 1: Viết failing test kiểm tra setting `print_bold_configs` trong DB**
- [ ] **Step 2: Chạy test xác nhận FAIL**
- [ ] **Step 3: Viết script `tools/seed_print_bold_configs.py` khởi tạo 10 keys mặc định và chạy vào `pos.db`**
- [ ] **Step 4: Chạy test xác nhận PASS**
- [ ] **Step 5: Git commit task 1**

---

### Task 2: Giao Diện Bảng Điều Khiển & Hàm Quản Lý (`index.html`, `productions.js`)

**Files:**
- Modify: `templates/index.html:4800-4840`
- Modify: `static/js/modules/productions.js`
- Test: `tests/test_fixed_print_bold_configs.py`

- [ ] **Step 1: Viết failing test kiểm tra 10 checkbox DOM trong `index.html` và các hàm JS**
- [ ] **Step 2: Thêm giao diện card 10 loại hóa đơn vào đầu `#settings-sub-templates` trong `index.html`**
- [ ] **Step 3: Viết logic nạp/lưu cấu hình `print_bold_configs` trong `productions.js`**
- [ ] **Step 4: Chạy test xác nhận PASS**
- [ ] **Step 5: Git commit task 2**

---

### Task 3: Liên Kết Runtime Cho Toàn Bộ 10 Loại Hóa Đơn (`pos.js`, `spa.js`, `productions.js`, `shifts.js`, `app.js`)

**Files:**
- Modify: `static/js/pos.js` (Hóa đơn bán lẻ, B2B, tạm tính, nạp ví)
- Modify: `static/js/modules/spa.js` (Phiếu tiếp nhận, thanh toán Spa)
- Modify: `static/js/modules/productions.js` (Phiếu thu, phiếu chi tiền)
- Modify: `static/js/shifts.js` (Báo cáo kết ca Z-Report)
- Modify: `static/js/app.js` (Phiếu kiểm kê kho A4)
- Test: `tests/test_fixed_print_bold_configs.py`

- [ ] **Step 1: Viết failing test kiểm tra tất cả các hàm in đều kiểm tra `print_bold_configs`**
- [ ] **Step 2: Cập nhật `pos.js` cho 4 loại phiếu bán hàng**
- [ ] **Step 3: Cập nhật `spa.js` cho 2 loại phiếu Spa**
- [ ] **Step 4: Cập nhật `productions.js` cho phiếu Thu / Chi**
- [ ] **Step 5: Cập nhật `shifts.js` cho Z-Report và `app.js` cho Kiểm kê**
- [ ] **Step 6: Chạy test suite xác nhận 100% PASS**
- [ ] **Step 7: Git commit task 3**
