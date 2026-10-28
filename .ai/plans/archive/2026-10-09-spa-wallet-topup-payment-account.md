# Kế Hoạch Triển Khai: Chọn Tài Khoản Thanh Toán & Chuẩn Hóa Nạp Ví Spa

> **For agentic workers:** REQUIRED SUB-SKILL: Use subagent-driven-development or executing-plans.

**Goal:** Khắc phục lỗi nạp ví Spa luôn rơi vào tiền mặt bằng cách hỗ trợ chọn tài khoản ngân hàng trên modal và chuẩn hóa xử lý phương thức thanh toán nạp ví trong backend/sổ quỹ.

**Architecture:** Bổ sung giao diện chọn tài khoản nhận tiền trong `#modal-topup-spa` (ẩn khi chọn tiền mặt, hiện khi chọn chuyển khoản/thẻ). Frontend gửi `account_id` lên `/api/topup/recharge`. Backend `routers/topup.py` chuẩn hóa nhận diện `transfer`/`bank`/`card`, ghi đúng `account_id` và mô tả tiếng Việt vào Sổ Quỹ `cashbook`.

**Tech Stack:** FastAPI, SQLite, Vanilla JavaScript, Tailwind CSS, Pytest.

## File Structure

| File | Responsibility |
|---|---|
| `templates/index.html:11042-11050` | Bổ sung container `#pos-topup-bank-account-box` và select `#pos-topup-account-id` |
| `static/js/pos.js:2759-2810, 3061-3100` | Bổ sung render/toggle tài khoản thanh toán và gửi `account_id` trong payload |
| `routers/topup.py:157-172` | Chuẩn hóa phương thức thanh toán và lưu đúng `account_id` vào `cashbook` |
| `tests/test_spa_wallet_topup.py` | Viết test kiểm tra nạp ví bằng chuyển khoản và ghi nhận sổ quỹ chính xác |

---

### Task 1: Backend - Hỗ trợ `account_id` và chuẩn hóa hình thức thanh toán trong `/api/topup/recharge`

**Files:**
- Modify: `routers/topup.py:157-172`
- Test: `tests/test_spa_wallet_topup.py`

- [ ] **Step 1: Write the failing test**
Thêm test `test_recharge_spa_wallet_with_bank_transfer_account` vào `tests/test_spa_wallet_topup.py` kiểm tra: nạp ví bằng `payment_method="transfer"` và `account_id` của tài khoản ngân hàng -> kiểm tra bản ghi cashbook có đúng `account_id` ngân hàng và không bị gán về tài khoản tiền mặt mặc định.

- [ ] **Step 2: Run test to verify it fails**
Chạy `pytest tests/test_spa_wallet_topup.py -k test_recharge_spa_wallet_with_bank_transfer_account`

- [ ] **Step 3: Write minimal implementation**
Cập nhật `routers/topup.py`:
Kiểm tra `req.account_id`, nếu có và hợp lệ thì dùng; nếu không có thì kiểm tra nếu `req.payment_method in ["transfer", "bank", "card"]` thì lấy tài khoản ngân hàng, ngược lại lấy tài khoản mặc định.

- [ ] **Step 4: Run test to verify it passes**
Chạy `pytest tests/test_spa_wallet_topup.py` đảm bảo pass tất cả test cases.

---

### Task 2: Frontend UI - Bổ sung container chọn tài khoản ngân hàng trong Modal Nạp Ví Spa

**Files:**
- Modify: `templates/index.html:11042-11050`
- Modify: `static/js/pos.js:2759-2820, 3061-3100`

- [ ] **Step 1: Cập nhật HTML Modal Nạp Ví (`templates/index.html`)**
Thêm block `#pos-topup-bank-account-box` có dropdown `#pos-topup-account-id` bên dưới `#pos-topup-pay-method`, mặc định ẩn (`class="hidden"`).

- [ ] **Step 2: Cập nhật JS xử lý hiển thị và đổ dữ liệu (`static/js/pos.js`)**
- Thêm hàm `onPosTopupPayMethodChange()`: khi chọn `transfer` hoặc `card`, hiển thị dropdown tài khoản, đổ danh sách các tài khoản ngân hàng/ví từ `window.posPaymentAccounts`, tự động chọn tài khoản đầu tiên hoặc tài khoản mặc định. Khi chọn `cash`, ẩn container và reset giá trị.
- Gắn sự kiện `onchange="onPosTopupPayMethodChange()"` vào select `#pos-topup-pay-method`.
- Trong `openTopupSpaModal()`: reset select `#pos-topup-pay-method` về `cash` và ẩn box tài khoản ngân hàng.
- Trong `submitTopupSpaRecharge()`: lấy `account_id` từ `#pos-topup-account-id` (nếu đang hiển thị) và gửi trong body request.

- [ ] **Step 3: Viết/chạy test kiểm tra DOM integrity**
Kiểm tra các ID và hàm mới trong `templates/index.html` và `static/js/pos.js`.
