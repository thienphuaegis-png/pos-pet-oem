# Kế Hoạch Triển Khai: Phân Hệ Quản Lý Khoản Cần Chi & Hoàn Ứng Nhân Viên

> **For agentic workers:** REQUIRED SUB-SKILL: Use subagent-driven-development or executing-plans.

**Goal:** Thêm sub-tab "Dự Chi & Hoàn Ứng Nhân Viên" vào màn hình "Sổ Quỹ Thu Chi", cho phép tạo yêu cầu chi hộ/dự chi, dán/tải ảnh bill chuyển khoản qua AI OCR bóc tách dữ liệu, và duyệt 1 chạm tự động tạo Phiếu Chi sang Sổ Quỹ thực tế.

**Architecture:** Tạo bảng `expense_requests` trong SQLite lưu trữ độc lập với `cashbook`. Xây dựng các API CRUD, duyệt chi (sinh bản ghi `cashbook` type='out') và từ chối yêu cầu trong `routers/cashbook.py`. Xây dựng giao diện Sub-tab trong `templates/index.html` và module frontend `static/js/modules/expense_requests.js` tích hợp sẵn paste/upload ảnh và kết nối AI OCR qua `routers/ai_assistant.py`.

**Tech Stack:** Python 3.11/FastAPI, SQLite, Jinja2/Tailwind CSS, Vanilla JavaScript (ES6+), Pytest.

## Global Constraints
- Không sửa đổi công thức tính số dư quỹ của `cashbook` hiện tại (bảo toàn 100% tính toàn vẹn của quỹ tiền thực tế).
- Tiền chỉ được trừ khỏi quỹ khi chủ shop bấm "Duyệt & Hoàn tiền / Chi trả" (chuyển trạng thái sang `completed` và sinh dòng trong bảng `cashbook`).
- Giữ phong cách UI chuẩn mực của hệ thống Mastercare: Tailwind CSS, modal dialogs, toast notification, icon SVG nhất quán.

---

## File Structure

| File | Trách nhiệm |
|---|---|
| `database.py:770+` | Modify — Tạo bảng `expense_requests` và hàm migration |
| `schemas.py` | Modify — Thêm schemas Pydantic `ExpenseRequestCreate`, `ExpenseRequestApprove` |
| `routers/cashbook.py` | Modify — Thêm API endpoints cho `expense_requests` (list, create, approve, cancel, stats) |
| `static/js/modules/expense_requests.js` | Create — Xử lý logic frontend, switch sub-tab, render bảng, dán ảnh Ctrl+V, modal duyệt chi |
| `templates/index.html` | Modify — Thêm thanh sub-tab và container UI của tab Dự Chi & Hoàn Ứng |
| `tests/test_expense_requests.py` | Create — Unit & Integration tests cho toàn bộ luồng nghiệp vụ |

---

### Task 1: Thiết kế Cơ sở Dữ liệu & Schemas Pydantic

**Files:**
- Modify: `database.py`
- Modify: `schemas.py`
- Test: `tests/test_expense_requests.py`

**Interfaces:**
- DB Table: `expense_requests`
- Pydantic: `ExpenseRequestCreate(type, employee_name, amount, category, note, bill_image, bank_account_info, due_date)`
- Pydantic: `ExpenseRequestApprove(account_id: int, note: Optional[str])`

- [ ] **Step 1: Write the failing test**
  Tạo `tests/test_expense_requests.py` kiểm tra schema table `expense_requests` tồn tại, các cột bắt buộc và insert dữ liệu hợp lệ.
- [ ] **Step 2: Run test to verify it fails**
  Chạy `pytest tests/test_expense_requests.py` xác nhận lỗi table not found.
- [ ] **Step 3: Write minimal implementation**
  - Thêm `CREATE TABLE IF NOT EXISTS expense_requests` vào `database.py:init_db()`.
  - Thêm `ExpenseRequestCreate`, `ExpenseRequestApprove` vào `schemas.py`.
- [ ] **Step 4: Run test to verify it passes**
  Chạy lại `pytest tests/test_expense_requests.py` xác nhận test pass.

---

### Task 2: Backend API Endpoints (CRUD, Duyệt Chi & Hủy Yêu Cầu)

**Files:**
- Modify: `routers/cashbook.py`
- Test: `tests/test_expense_requests.py`

**Interfaces:**
- `GET /api/expense-requests`: Lấy danh sách + thống kê tổng (pending, completed, total_reimbursement, total_planned).
- `POST /api/expense-requests`: Tạo yêu cầu mới với mã tự sinh `YC-YYMMDD-XXX`.
- `POST /api/expense-requests/{id}/approve`: Duyệt hoàn tiền -> Tự động tạo bản ghi `cashbook` type='out' và gán `cashbook_id`.
- `POST /api/expense-requests/{id}/cancel`: Hủy yêu cầu.

- [ ] **Step 1: Write the failing test**
  Viết test cases trong `tests/test_expense_requests.py`:
  - Test tạo yêu cầu chi hộ của nhân viên A.
  - Test lấy danh sách và thống kê.
  - Test duyệt yêu cầu: kiểm tra `expense_requests.status == 'completed'`, kiểm tra trong `cashbook` đã sinh phiếu chi `PC-...`, số tiền khớp và có liên kết `cashbook_id`.
  - Test hủy yêu cầu.
- [ ] **Step 2: Run test to verify it fails**
  Chạy `pytest tests/test_expense_requests.py -k test_api` xác nhận 404/Not implemented.
- [ ] **Step 3: Write minimal implementation**
  Hiện thực các API trong `routers/cashbook.py` đảm bảo transaction atomic với SQLite khi duyệt chi.
- [ ] **Step 4: Run test to verify it passes**
  Chạy lại `pytest tests/test_expense_requests.py` xác nhận toàn bộ test backend pass 100%.

---

### Task 3: Giao Diện Frontend (Sub-tabs & Bảng Quản Lý Dự Chi / Hoàn Ứng)

**Files:**
- Modify: `templates/index.html`
- Create: `static/js/modules/expense_requests.js`
- Test: `tests/test_expense_requests.py`

**Interfaces:**
- Sub-tab header: `[Sổ Quỹ Thực Tế]` & `[Dự Chi & Hoàn Ứng Nhân Viên (Badge N)]`.
- Container `id="cashbook-subtab-actual"` và `id="cashbook-subtab-requests"`.
- Bảng danh sách yêu cầu có thumbnail ảnh bill (click modal zoom).
- Modal tạo yêu cầu chi hộ / dự chi (có kéo thả file + paste Ctrl+V).
- Modal duyệt chi chọn tài khoản xuất tiền.

- [ ] **Step 1: Write the failing test**
  Viết test kiểm tra DOM trong `templates/index.html` có chứa sub-tab buttons, container sub-tab và script `expense_requests.js` được include.
- [ ] **Step 2: Run test to verify it fails**
  Chạy `pytest tests/test_expense_requests.py -k test_ui` xác nhận thiếu element.
- [ ] **Step 3: Write minimal implementation**
  - Chèn cấu trúc sub-tab và container vào `templates/index.html`.
  - Viết `static/js/modules/expense_requests.js` gồm: chuyển tab mượt, gọi API load danh sách, preview ảnh, modal duyệt chi.
- [ ] **Step 4: Run test to verify it passes**
  Chạy `pytest tests/test_expense_requests.py` kiểm tra DOM và syntax JS.

---

### Task 4: Tích Hợp AI OCR Nhận Diện Bill Chuyển Khoản Vào Form Yêu Cầu

**Files:**
- Modify: `static/js/modules/expense_requests.js`
- Test: `tests/test_expense_requests.py`

**Interfaces:**
- Hàm `handlePasteBillImage(event)` và `handleUploadBillImage(event)` gửi ảnh base64 đến `/api/ai/parse-cashflow`.
- Tự động gán `amount`, `category`, `note` từ kết quả AI vào form tạo yêu cầu.

- [ ] **Step 1: Write test case**
  Test end-to-end giả lập tạo yêu cầu từ dữ liệu bóc tách của AI và duyệt hoàn tiền.
- [ ] **Step 2: Run test verify passes**
  Chạy toàn bộ test suite `pytest tests/test_expense_requests.py`.
