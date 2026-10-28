# Design Spec: POS Print Template Selection & Payment Account Sync

- **Date:** 2026-10-11
- **Status:** Approved
- **Scope:** POS Offline (Bán hàng, In Tạm Tính & In Hóa Đơn Thanh Toán)

---

## 1. Mục Tiêu & Vấn Đề Cần Giải Quyết
1. **Khắc phục lỗi nhảy mẫu in**: Khi mở popup xem trước / in (cả in tạm tính và in sau thanh toán), hệ thống phải tôn trọng 100% mẫu in người dùng đã chọn trên dropdown góc trên bên phải màn hình (`#pos-template-select`), không được tự động tính toán lại rồi ghi đè sang mẫu khác.
2. **Đồng bộ thông tin tài khoản chuyển khoản & mã VietQR theo phương thức thanh toán**:
   - Khách trả **Tiền mặt** (`cash`): Khối VietQR & số tài khoản ngân hàng không hiển thị thông tin ảo, ghi rõ "Thanh toán Tiền mặt" hoặc ẩn QR chuyển khoản.
   - Khách chọn **Chuyển khoản / Thẻ / Ví**: Hệ thống bắt buộc phải lấy đúng tài khoản thu ngân đang chọn tại `#pos-bank-account-select` (hoặc tài khoản trong dòng thanh toán chuyển khoản đã lưu `order_payments`).
   - Khắc phục triệt để lỗi fallback vào giá trị cũ `Số TK: 0` trong bảng `settings`.

---

## 2. Quy Tắc Chọn Mẫu In (Priority Order)
Khi gọi `showPrintModal(orderCode)` hoặc `printDraftOrder()`:
1. **Ưu tiên 1**: Giá trị hiện tại trên dropdown `#pos-template-select` trên giao diện bán hàng POS.
2. **Ưu tiên 2**: Giá trị đã lưu trong `localStorage.getItem('pos_print_template')`.
3. **Ưu tiên 3**: Chỉ khi cả 2 nguồn trên không tồn tại hoặc không khớp preset nào, mới dùng `findBestPresetForSize` để chọn mẫu mặc định.
4. Đồng bộ 2 chiều: Khi popup in mở ra, dropdown trong popup (`#modal-print-preset-select`) và các tab chọn khổ giấy phải active đúng mẫu đang hiển thị.

---

## 3. Quy Tắc Gán Tài Khoản Ngân Hàng Cho Bản In

### 3.1. Đối với Hóa Đơn Đã Thanh Toán (`showPrintModal(orderCode)`)
- Phân tích `ord.payments` (hoặc `order_payments`):
  - Nếu toàn bộ thanh toán bằng **Tiền mặt** (`method === 'cash'` và không có dòng chuyển khoản):
    - Đánh dấu `is_cash_payment = true`.
    - Ẩn khối VietQR hoặc hiển thị badge "Đã thanh toán Tiền mặt".
  - Nếu có thanh toán bằng **Chuyển khoản / Thẻ / Ví**:
    - Lấy `account_id` của dòng chuyển khoản đó.
    - Tìm chi tiết tài khoản từ `payment_accounts` (ngân hàng, số tài khoản, chủ tài khoản).
    - Sinh mã VietQR động theo số tiền chuyển khoản thực tế và mã đơn hàng.

### 3.2. Đối với Hóa Đơn Tạm Tính (`printDraftOrder()`)
- Lấy hình thức thanh toán hiện tại của tab (`tab.payment_method`):
  - Nếu `tab.payment_method === 'transfer'` (hoặc có chọn tài khoản ở `#pos-bank-account-select`):
    - Lấy thông tin tài khoản đang chọn gán vào `draftOrder.bank_account`.
    - Sinh mã VietQR theo số tiền cần trả `draftOrder.final_amount`.
  - Nếu `tab.payment_method === 'cash'`:
    - Nếu khách muốn quét chuyển khoản dự phòng: Lấy tài khoản ngân hàng mặc định trong `window.posPaymentAccounts` (thay vì giá trị số 0 trong settings).

---

## 4. Hiển Thị Trên Template In (`table_b2b` & `b2b_footer_boxes`)
- Tại khối `b2b_footer_boxes`:
  - Kiểm tra nếu đơn hàng là thanh toán tiền mặt thuần túy: Khối quét mã VietQR chuyển thành ghi nhận "THANH TOÁN TIỀN MẶT - ĐÃ THU ĐỦ".
  - Nếu là chuyển khoản: Hiển thị đầy đủ Tên Ngân Hàng, Số Tài Khoản, Tên Chủ Tài Khoản thật và mã QR VietQR chuẩn.
