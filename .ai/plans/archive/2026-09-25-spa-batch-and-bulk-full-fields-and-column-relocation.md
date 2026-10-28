# Kế Hoạch Triển Khai: Bổ Sung Toàn Diện Thông Tin Cho Nhập Hàng Loạt, Sửa Bảng Tính & Tối Ưu Bố Cục Thao Tác Cột 1

> **For agentic workers:** REQUIRED SUB-SKILL: Use subagent-driven-development or executing-plans.

**Goal:** Chuyển cụm nút Thao tác vào dưới Số phiếu ở Cột 1, loại bỏ cột Thao tác mép phải; mở rộng toàn diện thông tin cho cả Nhập hàng loạt (Batch Intake) và Chỉnh sửa hàng loạt (Spreadsheet Inline Edit Mode).

**Architecture:** Bổ sung schema backend cho tất cả các trường mở rộng trong `routers/partners.py`. Cập nhật `templates/index.html` loại bỏ `<th>Thao Tác</th>` và bổ sung các cột nhập liệu trong batch table. Cập nhật `static/js/app.js` render nút thao tác ở Cột 1 và xử lý nhập/sửa đầy đủ phụ thu, thợ, phụ kiện, cân nặng.

**Tech Stack:** FastAPI, SQLite (Python 3.11), Tailwind CSS, Vanilla JavaScript.

---

## File Structure

| File | Responsibility |
|---|---|
| `routers/partners.py` | Bổ sung đầy đủ các trường mở rộng trong `PetServiceTicketBulkItem` và cập nhật câu lệnh UPDATE bulk |
| `tests/test_spa_bulk_update.py` | Kiểm thử cập nhật đầy đủ các trường mới: cân nặng, phụ thu chi tiết, phụ kiện, hotel |
| `templates/index.html` | Cập nhật thead `#spa-view-table` (bỏ `<th>Thao Tác</th>`), cập nhật header batch modal |
| `static/js/app.js` | Render Cột 1 kèm nút thao tác dưới số phiếu; cập nhật batch table & spreadsheet mode đầy đủ thông tin |
| `tests/test_spa_render.js` | Kiểm thử DOM hiển thị nút thao tác ở Cột 1 và không có cột thao tác cuối cùng |

---

## Task 1: Backend Bulk Update Model & Handler Extension

**Files:**
- Modify: `routers/partners.py`
- Test: `tests/test_spa_bulk_update.py`

- [ ] **Step 1: Extend test in `tests/test_spa_bulk_update.py`**
  - Bổ sung test kiểm tra sửa: `weight_at_service = 9.2`, `accessories = "Dây dắt đỏ, áo ấm"`, `send_to_hotel = 1`, `shipping_fee = 40000`, `teeth_cleaning = 35000`.
- [ ] **Step 2: Run test to verify it fails**
  - `PYTHONPATH=. uv run pytest tests/test_spa_bulk_update.py`
- [ ] **Step 3: Update `PetServiceTicketBulkItem` & SQL in `routers/partners.py`**
  - Thêm các trường vào schema và mảng updates/params.
- [ ] **Step 4: Run test to verify it passes**
  - `PYTHONPATH=. uv run pytest tests/test_spa_bulk_update.py`

---

## Task 2: Update Table Header in `templates/index.html`

**Files:**
- Modify: `templates/index.html`

- [ ] **Step 1: Remove `<th ...>Thao Tác</th>` from `#spa-view-table` header**
- [ ] **Step 2: Update Cột 1 header title to `Phiếu & Thao Tác`**
- [ ] **Step 3: Verify HTML integrity**
  - `PYTHONPATH=. uv run pytest tests/test_html_integrity.py`

---

## Task 3: Relocate Action Buttons & Extend Batch/Spreadsheet in `static/js/app.js`

**Files:**
- Modify: `static/js/app.js`
- Test: `tests/test_spa_render.js`

- [ ] **Step 1: Move Action buttons to Column 1 under ticket number & code**
  - Render buttons `[✏️]`, `[🖨️ Nhận]`, `[🧾 Trả]`, `[🗑️]` directly below ticket number in Column 1.
  - Remove Column 13 `<td>` entirely from both normal mode and spreadsheet mode.
- [ ] **Step 2: Extend Batch Intake Table (`addBatchPetRow` & `submitBatchServiceTickets`)**
  - Thêm trường: Giống loài, Giới tính, Màu lông, Phụ kiện, Hotel checkbox.
  - Tách các ô nhập phụ thu chi tiết (Đánh răng, Cắt NT, Phụ thu gỡ rối, Cước xe, Tip).
- [ ] **Step 3: Extend Spreadsheet Mode Table**
  - Cho phép sửa trực tiếp Cân nặng, Phụ thu chi tiết, Phụ kiện gửi lại.
- [ ] **Step 4: Run tests**
  - `node tests/test_spa_render.js`
  - `PYTHONPATH=. uv run pytest`

---

## Task 4: End-to-End Verification & Documentation

**Files:**
- Modify: `PROJECT_STATE.md`

- [ ] **Step 1: Run all test suites**
- [ ] **Step 2: Update `PROJECT_STATE.md`**
