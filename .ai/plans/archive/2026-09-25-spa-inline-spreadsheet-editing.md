# Kế Hoạch Triển Khai: Chế Độ Sửa Trực Tiếp Dạng Bảng Tính Cho Phiếu Spa (Spreadsheet Inline Edit Mode)

> **For agentic workers:** REQUIRED SUB-SKILL: Use subagent-driven-development or executing-plans.

**Goal:** Cung cấp chế độ sửa trực tiếp dạng bảng tính Excel/Google Sheets ngay trên giao diện danh sách Spa, cho phép nhân viên chỉnh sửa đồng thời nhiều phiếu (Trạng thái, Thợ, Phụ thu, Tip, Thanh toán, Ghi chú) và lưu hàng loạt an toàn.

**Architecture:** Bổ sung endpoint backend `PUT /api/partners/pet-services/tickets/bulk-update` thực thi transaction an toàn. Frontend bổ sung state `isSpaSpreadsheetModeActive`, toggle nút thao tác, render các cell thành form inputs có hỗ trợ phím Tab/Enter, tự động đánh dấu dirty row và gửi payload batch khi lưu.

**Tech Stack:** FastAPI, SQLite (Python 3.11), Tailwind CSS, Vanilla JavaScript.

---

## File Structure

| File | Responsibility |
|---|---|
| `routers/partners.py` | Thêm model `PetServiceTicketBulkItem`, `PetServiceTicketBulkUpdate` và endpoint `PUT /api/partners/pet-services/tickets/bulk-update` |
| `tests/test_spa_bulk_update.py` | Bộ test backend kiểm tra cập nhật đồng thời nhiều phiếu Spa |
| `templates/index.html` | Thêm nút chuyển chế độ `[📝 Sửa Bảng Tính]` và thanh trạng thái nút lưu trên toolbar Spa |
| `static/js/app.js` | Quản lý state spreadsheet, render table ở chế độ input inline, track dirty rows, xử lý phím tắt và gọi API bulk update |
| `tests/test_spa_render.js` | Kiểm thử logic render inline spreadsheet, dirty state tracking và format tiền tệ |

---

## Task 1: Backend Bulk Update API

**Files:**
- Create: `tests/test_spa_bulk_update.py`
- Modify: `routers/partners.py`

- [ ] **Step 1: Write the failing test**
  - Tạo `tests/test_spa_bulk_update.py` kiểm tra `PUT /api/partners/pet-services/tickets/bulk-update` với 2 vé cùng lúc:
    - Vé 1: đổi trạng thái sang `in_progress`, gán `staff_cutter = "Thợ Cắt A"`, đổi phụ thu `surcharge = 30000`.
    - Vé 2: đổi trạng thái sang `completed`, đổi `payment_status = "paid"`, gán `staff_worker_1 = "Thợ Phụ B"`.
- [ ] **Step 2: Run test to verify it fails**
  - Chạy `PYTHONPATH=. uv run pytest tests/test_spa_bulk_update.py` (Kỳ vọng 404/405 do chưa có endpoint).
- [ ] **Step 3: Write minimal implementation in `routers/partners.py`**
  - Định nghĩa `PetServiceTicketBulkItem` (gồm id, status, staff_cutter, staff_worker_1, surcharge, teeth_cleaning, art_cutting_fee, tip_amount, price, payment_status, payment_method, note, customer_request).
  - Định nghĩa `PetServiceTicketBulkUpdate` (gồm `tickets: List[PetServiceTicketBulkItem]`).
  - Viết hàm `bulk_update_pet_service_tickets` thực hiện update hàng loạt trong 1 transaction `conn.commit()`.
- [ ] **Step 4: Run test to verify it passes**
  - Chạy `PYTHONPATH=. uv run pytest tests/test_spa_bulk_update.py` (Kỳ vọng PASS 100%).

---

## Task 2: Frontend Toolbar & Spreadsheet View Controls in `templates/index.html`

**Files:**
- Modify: `templates/index.html`

- [ ] **Step 1: Check toolbar structure in `templates/index.html`**
  - Xác định vị trí nút chuyển view (`#btn-spa-view-table`, `#btn-spa-view-kanban`) và thanh tìm kiếm.
- [ ] **Step 2: Add Spreadsheet Mode toggle button and Save action bar**
  - Thêm nút `#btn-toggle-spa-spreadsheet` với nhãn `[📝 Chế Độ Sửa Excel]`.
  - Thêm container `#spa-spreadsheet-actions` (mặc định hidden) chứa:
    - Nút `#btn-save-spa-spreadsheet`: `💾 Lưu Thay Đổi (<span id="dirty-ticket-count">0</span>)` (nền xanh lá).
    - Nút `#btn-cancel-spa-spreadsheet`: `❌ Hủy Bỏ`.
- [ ] **Step 3: Verify DOM integrity**
  - Chạy `PYTHONPATH=. uv run pytest tests/test_html_integrity.py`.

---

## Task 3: JavaScript Spreadsheet Mode Engine in `static/js/app.js`

**Files:**
- Modify: `static/js/app.js`
- Test: `tests/test_spa_render.js`

- [ ] **Step 1: Add state variables and mode toggle function**
  - Biến `isSpaSpreadsheetMode = false`, `dirtyTicketsMap = new Map()`.
  - Hàm `toggleSpaSpreadsheetMode(forceState)`:
    - Nếu bật: hiển thị các nút lưu/hủy, re-render bảng sang giao diện edit cell.
    - Nếu tắt: xóa dirty map, trả bảng về giao diện xem thông thường.
- [ ] **Step 2: Enhance `renderPetServicesTable()` to render inline inputs when mode is active**
  - Mỗi dòng chuyển thành các ô input/select:
    - Cột Trạng thái: `<select class="inline-edit-status" onchange="markTicketRowDirty(this, ${t.id})">`
    - Cột Thợ: `<input type="text" class="inline-edit-cutter" ...>`
    - Cột Phụ thu: `<input type="text" class="inline-edit-surcharge" oninput="onMoneyInputChange(this); updateInlineRowPrice(this, ${t.id})" ...>`
    - Cột Ghi chú: `<input type="text" class="inline-edit-note" ...>`
  - Khi người dùng gõ vào ô, gắn class `.dirty-row` (viền vàng hổ phách) và tăng biến đếm `dirty-ticket-count`.
- [ ] **Step 3: Add `saveSpaSpreadsheetChanges()`**
  - Thu thập tất cả các phiếu trong `dirtyTicketsMap`.
  - Gửi request `PUT /api/partners/pet-services/tickets/bulk-update`.
  - Hiển thị thông báo, thoát chế độ sửa và nạp lại bảng dữ liệu.
- [ ] **Step 4: Add keyboard navigation (Tab / Shift+Tab / Enter)**
  - Cho phép người dùng chuyển nhanh giữa các ô và các dòng.
- [ ] **Step 5: Run tests**
  - Chạy `node tests/test_spa_render.js` và `pytest` để kiểm tra toàn vẹn.

---

## Task 4: End-to-End Verification & Documentation

**Files:**
- Modify: `PROJECT_STATE.md`

- [ ] **Step 1: Run full test suite**
  - `PYTHONPATH=. uv run pytest`
  - `node tests/test_spa_render.js`
- [ ] **Step 2: Update `PROJECT_STATE.md`**
  - Ghi nhận tính năng Chế độ Sửa trực tiếp dạng Bảng tính (Spreadsheet Inline Edit Mode).
