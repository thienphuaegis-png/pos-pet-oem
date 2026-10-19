# Chi Gộp Nhiều Phiếu Yêu Cầu Hoàn Ứng / Dự Chi (Batch Approve Expense Requests)

> **For agentic workers:** REQUIRED SUB-SKILL: Use subagent-driven-development or executing-plans.

**Goal:** Cho phép quản trị viên tick chọn nhiều phiếu yêu cầu chi hộ (hoàn ứng) / dự chi đang ở trạng thái `pending` và duyệt xuất quỹ 1 lần sinh ra đúng 1 phiếu chi tổng (hoặc gom theo người) vào Sổ Quỹ để khớp sao kê ngân hàng.

**Architecture:** 
- Backend: Schema `ExpenseRequestBatchApprove`, endpoint `POST /api/expense-requests/batch-approve` trong `routers/cashbook.py`. gom các phiếu hợp lệ, tính tổng tiền, tạo 1 phiếu chi trong bảng `cashbook`, cập nhật trạng thái `completed` và gán `cashbook_id` cho toàn bộ các yêu cầu được chọn trong 1 database transaction.
- Frontend: Cột checkbox `[ ]` trên bảng yêu cầu (`static/js/modules/expense_requests.js`, `templates/index.html`), thanh công cụ nổi hiển thị số lượng phiếu & tổng tiền khi tick chọn, modal xác nhận duyệt gộp nhiều phiếu.

**Tech Stack:** FastAPI, SQLite, Pydantic, TailwindCSS, Vanilla JavaScript.

## Global Constraints
- Không làm ảnh hưởng luồng duyệt đơn lẻ hiện tại (`POST /api/expense-requests/{id}/approve`).
- Tất cả các phiếu trong đợt chi gộp phải đang ở trạng thái `pending`.
- Tự động sinh mã phiếu chi tiền mặt/ngân hàng theo hàm chuẩn `generate_cashbook_code`.
- Toàn bộ thao tác cập nhật DB phải nằm trong 1 transaction an toàn, có rollback nếu lỗi.

---

### Task 1: Backend API Duyệt Gộp Nhiều Phiếu Yêu Cầu Chi

**Files:**
- Modify: `schemas.py`
- Modify: `routers/cashbook.py`
- Test: `tests/test_expense_requests_batch_approve.py`

- [ ] **Step 1: Write failing test for batch approve API**
  - Viết test trong `tests/test_expense_requests_batch_approve.py`:
    - Tạo 2 yêu cầu chi `pending` cho nhân viên "Quế Đôn" (60.000 đ và 40.000 đ).
    - Gọi `POST /api/expense-requests/batch-approve` với payload `{ "request_ids": [id1, id2], "account_id": acc_id, "note": "Hoàn ứng đợt 1" }`.
    - Kiểm tra: API trả về 200, tạo ra đúng 1 bản ghi `cashbook` với số tiền `100.000 đ`, cả 2 yêu cầu chuyển sang `status='completed'` và có cùng `cashbook_id`.
    - Kiểm tra case lỗi: phiếu không tồn tại hoặc đã completed thì báo lỗi 400.

- [ ] **Step 2: Run test to verify it fails**
  - Lệnh: `.venv/Scripts/python.exe -m pytest tests/test_expense_requests_batch_approve.py -v`

- [ ] **Step 3: Implement Schema & API in `schemas.py` & `routers/cashbook.py`**
  - Thêm `ExpenseRequestBatchApprove` trong `schemas.py`:
    ```python
    class ExpenseRequestBatchApprove(BaseModel):
        request_ids: List[int]
        account_id: int
        note: Optional[str] = None
    ```
  - Thêm endpoint `POST /api/expense-requests/batch-approve` trong `routers/cashbook.py`:
    - Kiểm tra danh sách `request_ids` không rỗng.
    - Truy vấn các phiếu có `id IN (...)` và kiểm tra tất cả đều `status == 'pending'`.
    - Tính tổng số tiền `total_amount = sum(r['amount'] for r in rows)`.
    - Lấy danh sách tên người nhận / loại yêu cầu để tự động tạo ghi chú chi tiết.
    - Sinh mã phiếu chi `PC-HO` hoặc `PC-DC`.
    - `INSERT INTO cashbook` 1 dòng duy nhất.
    - `UPDATE expense_requests SET status = 'completed', cashbook_id = ?, resolved_at = ? WHERE id IN (...)`.

- [ ] **Step 4: Run test to verify it passes**
  - Chạy lại `.venv/Scripts/python.exe -m pytest tests/test_expense_requests_batch_approve.py -v`.

---

### Task 2: Giao Diện Frontend - Checkbox & Thanh Thao Tác Chi Gộp

**Files:**
- Modify: `templates/index.html` (tiêu đề cột và modal duyệt gộp)
- Modify: `static/js/modules/expense_requests.js`
- Test: `tests/test_expense_requests_ui.py` (kiểm tra tồn tại thành phần DOM)

- [ ] **Step 1: Cập nhật DOM Table & Modal trong `templates/index.html`**
  - Thêm cột Checkbox `<th class="w-10 text-center"><input type="checkbox" id="check-all-exp-requests" onchange="toggleSelectAllExpenseRequests(this)"></th>` vào đầu bảng.
  - Thêm thanh công cụ nổi (Batch Action Bar):
    - Ẩn mặc định, hiển thị khi có $\ge 1$ checkbox được tick.
    - Hiển thị: `"Đã chọn: X phiếu | Tổng tiền: Y đ"`.
    - Nút: `"⚡ Duyệt & Chi X Phiếu"`, nút `"Bỏ chọn"`.
  - Bổ sung modal hoặc tái sử dụng `#modal-approve-expense-request` để hỗ trợ hiển thị danh sách các phiếu được gộp.

- [ ] **Step 2: Cập nhật Logic Quản Lý Lựa Chọn trong `static/js/modules/expense_requests.js`**
  - Quản lý mảng `selectedExpenseRequestIds = new Set()`.
  - Checkbox trên từng dòng chỉ hiện với phiếu có trạng thái `pending`.
  - Cập nhật số tiền tổng và hiển thị thanh action bar khi tick/untick.
  - Bổ sung hàm `openBatchApproveExpenseModal()` và `submitBatchApproveExpenseRequests()`.
  - Gọi `/api/expense-requests/batch-approve`, hiển thị toast thông báo thành công và reload lại danh sách + Sổ Quỹ.

- [ ] **Step 3: Verification & Test**
  - Chạy cú pháp JS: `node -c static/js/modules/expense_requests.js`.
  - Viết test kiểm tra DOM table & endpoint integration.

---

### Task 3: Build & Đồng Bộ Triển Khai
- Rebuild `POS_Mastercare.exe`.
- Chạy toàn bộ test suite hồi quy `pytest`.
- Push GitHub và cập nhật sang `C:\POS`.
