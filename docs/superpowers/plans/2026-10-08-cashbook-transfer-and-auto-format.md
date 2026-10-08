# Kế Hoạch Triển Khai: Tự Động Định Dạng Tiền & Chuyển Quỹ Nội Bộ Sổ Quỹ

> **For agentic workers:** REQUIRED SUB-SKILL: Use subagent-driven-development or executing-plans.

**Goal:** Thêm bộ định dạng tiền tự động (phân tách dấu chấm hàng nghìn + đọc chữ tiếng Việt + nút cộng nhanh tiền) và tích hợp tab Chuyển Quỹ Nội Bộ (sinh cặp phiếu đối ứng chi/thu) trong Modal Lập Phiếu Thu Chi.

**Architecture:**
- Backend: Thêm Pydantic schema `CashbookTransferCreate` trong `schemas.py` và endpoint `POST /api/cashbook/transfer` trong `routers/cashbook.py` xử lý transaction sinh cặp phiếu đối ứng chi và thu.
- Frontend: Cập nhật DOM `#modal-create-cashbook` trong `templates/index.html` (tab Chuyển Quỹ, 2 dropdown tài khoản nguồn/đích, ô nhập tiền format, dòng đọc chữ, nút chọn nhanh).
- Logic JS: Viết hàm format tiền tệ realtime, hàm đọc số thành chữ tiếng Việt, xử lý chuyển quỹ trong `static/js/modules/productions.js`.
- Test: Viết test backend integration + unit test đọc tiền trong `tests/test_cashbook_transfer.py`.

---

## File Structure

| File | Trách nhiệm |
|---|---|
| `schemas.py` | Modify — Thêm schema `CashbookTransferCreate` |
| `routers/cashbook.py` | Modify — Endpoint `POST /api/cashbook/transfer` |
| `templates/index.html` | Modify — Cập nhật DOM `#modal-create-cashbook` (3 tab, format tiền, chọn 2 tài khoản) |
| `static/js/modules/productions.js` | Modify — Logic format tiền, đọc chữ tiếng Việt, nạp nhanh, luồng submit chuyển quỹ |
| `tests/test_cashbook_transfer.py` | Create — Test endpoint chuyển quỹ, số dư 2 tài khoản, cặp phiếu đối ứng |

---

### Task 1: Backend API Chuyển Quỹ Nội Bộ (`schemas.py` & `routers/cashbook.py`)

**Files:**
- Modify: `schemas.py`
- Modify: `routers/cashbook.py`
- Test: `tests/test_cashbook_transfer.py`

- [ ] **Step 1: Write test case**
  Tạo `tests/test_cashbook_transfer.py` kiểm tra:
  - Tạo 2 tài khoản test A (Két tiền mặt) và B (Ngân hàng MB).
  - Gọi `POST /api/cashbook/transfer` chuyển 5.000.000đ từ B sang A.
  - Xác nhận API trả về thành công kèm transfer_code.
  - Xác nhận trong bảng `cashbook` có 2 phiếu đối ứng: 1 phiếu chi (tại B) và 1 phiếu thu (tại A), cùng số tiền 5.000.000đ.
  - Kiểm tra validation: cùng 1 tài khoản báo lỗi 400, số tiền <= 0 báo lỗi 400.
- [ ] **Step 2: Triển khai schema trong `schemas.py`**
- [ ] **Step 3: Triển khai endpoint trong `routers/cashbook.py`**
- [ ] **Step 4: Chạy test xác nhận pass**

---

### Task 2: Giao Diện Ô Tiền Tự Động Định Dạng & Đọc Tiếng Việt

**Files:**
- Modify: `templates/index.html`
- Modify: `static/js/modules/productions.js`
- Test: `tests/test_cashbook_transfer.py`

- [ ] **Step 1: Viết test logic đọc số thành chữ tiếng Việt**
  Kiểm tra các trường hợp: 0đ, 150.000đ, 2.500.000đ, 88.000.000đ, 1.000.000.000đ.
- [ ] **Step 2: Cập nhật DOM `#modal-create-cashbook` trong `templates/index.html`**
  - Chuyển `cash-amount-input` sang dạng text.
  - Thêm thẻ hiển thị chữ `#cash-amount-words`.
  - Thêm hàng nút nạp tiền nhanh: `+100k`, `+500k`, `+1tr`, `+5tr`, `+10tr`.
- [ ] **Step 3: Viết hàm trong `static/js/modules/productions.js`**
  - `handleCashAmountInput(el)`
  - `numberToVietnameseWords(num)`
  - `quickAddCashAmount(addVal)`
- [ ] **Step 4: Test DOM và verify**

---

### Task 3: Tích Hợp Tab Chuyển Quỹ Vào Modal Thu Chi

**Files:**
- Modify: `templates/index.html`
- Modify: `static/js/modules/productions.js`
- Test: `tests/test_cashbook_transfer.py`

- [ ] **Step 1: Cập nhật DOM tab thứ 3 và khối chọn 2 tài khoản**
  - Thêm nút `[🔄 Chuyển Tiền / Quỹ]` (`#btn-cash-type-transfer`).
  - Thêm khối `#cash-transfer-accounts-box` gồm dropdown nguồn, nút đảo chiều `swapTransferAccounts()`, dropdown đích.
- [ ] **Step 2: Cập nhật hàm `setCashModalType(type)` và `submitCreateCashbook()`**
  - Hỗ trợ type `transfer`: ẩn danh mục & đối tác, hiện 2 tài khoản.
  - Khi submit gọi `POST /api/cashbook/transfer`.
- [ ] **Step 3: Test và kiểm thử**

---

### Task 4: Rebuild POS_Mastercare.exe & Đóng Gói

- [ ] **Step 1: Recompile `uv run pyinstaller POS_Mastercare.spec --distpath . -y`**
- [ ] **Step 2: Git commit và push lên GitHub**
