# POS Print Template Selection & Payment Account Sync Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use subagent-driven-development or executing-plans.

**Goal:** Khắc phục lỗi nhảy sai mẫu in khi mở popup in POS (ưu tiên 100% mẫu đã chọn ở góc trên bên phải) và chuẩn hóa thông tin chuyển khoản/VietQR theo đúng phương thức thanh toán thực tế.

**Architecture:**
- Frontend JS (`static/js/pos.js`):
  1. Loại bỏ logic tự động ghi đè preset trong `showPrintModal()` và `printDraftOrder()`; ưu tiên giá trị từ `#pos-template-select` hoặc `localStorage`.
  2. Tạo hàm `resolveOrderBankAccount(ord, isDraft)` để lấy đúng tài khoản ngân hàng từ `posPaymentAccounts` theo phương thức thanh toán (tiền mặt vs chuyển khoản).
  3. Cập nhật khối render `b2b_footer_boxes` và `qr` trong `renderAndPrint()`: nếu đơn thanh toán bằng tiền mặt thì ẩn/thay thế mã VietQR bằng trạng thái tiền mặt; nếu chuyển khoản thì nạp đúng thông tin số tài khoản và ngân hàng đã chọn.
- Backend API (`routers/pos.py`):
  1. Bổ sung trả về chi tiết `bank_account` trong `GET /api/orders/{order_code}` dựa trên `account_id` lưu trong `order_payments` hoặc `orders`.
- Tests (`tests/test_pos_print_template_and_bank_sync.py`):
  1. Kiểm tra ưu tiên mẫu in từ dropdown.
  2. Kiểm tra gán đúng thông tin tài khoản chuyển khoản cho đơn thanh toán và đơn tạm tính.

## Global Constraints
- Không làm ảnh hưởng đến các mẫu in khác (K80, A5, Spa, Cashbook).
- Đảm bảo in tạm tính (`printDraftOrder`) không bị crash khi không có tài khoản ngân hàng.

---

### Task 1: Ưu Tiên Mẫu In Đã Chọn Trên Header POS

**Files:**
- Modify: `static/js/pos.js:2320-2335`, `static/js/pos.js:2400-2415`
- Test: `tests/test_pos_print_template_and_bank_sync.py`

- [x] **Step 1: Viết test kiểm tra thứ tự ưu tiên mẫu in**
- [x] **Step 2: Sửa `showPrintModal` và `printDraftOrder` trong `pos.js`**
  - Không gọi lại `posPrintConfig.active_preset = defaultPreset` nếu `#pos-template-select` đã có giá trị hợp lệ.
  - Cập nhật đúng các nút chọn khổ giấy và dropdown trong modal theo preset đang active.
- [x] **Step 3: Chạy test xác nhận PASS**

---

### Task 2: Chuẩn Hóa Thông Tin Chuyển Khoản & VietQR Theo Phương Thức Thanh Toán

**Files:**
- Modify: `routers/pos.py:350-375` (endpoint `GET /api/orders/{code}`)
- Modify: `static/js/pos.js:2370-2400` (In tạm tính `printDraftOrder`)
- Modify: `static/js/pos.js:2760-2800` (Render khối `b2b_footer_boxes`)
- Test: `tests/test_pos_print_template_and_bank_sync.py`

- [x] **Step 1: Viết test cho phương thức tiền mặt vs chuyển khoản**
  - Đơn tiền mặt: không xuất hiện VietQR hoặc ghi rõ tiền mặt.
  - Đơn chuyển khoản: xuất hiện đúng ngân hàng và số tài khoản đã chọn.
- [x] **Step 2: Sửa Backend `routers/pos.py`**: lấy thông tin tài khoản thụ hưởng từ `payment_accounts` khớp với thanh toán thực tế của đơn.
- [x] **Step 3: Sửa Frontend `pos.js`**: nạp đúng tài khoản đang chọn vào đơn tạm tính và cập nhật khối hiển thị footer `b2b_footer_boxes`.
- [x] **Step 4: Chạy test xác nhận PASS 100%**
