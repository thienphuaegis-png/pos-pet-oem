# Thiết kế: Chọn tài khoản thanh toán và sửa hình thức nạp ví Spa

## 1. Vấn đề hiện tại
- Trong modal Nạp ví Spa (`#modal-topup-spa`), người dùng chọn "Chuyển khoản ngân hàng" (`value="transfer"`).
- Backend `routers/topup.py` kiểm tra `if req.payment_method == "bank":`, do đó `transfer != bank` dẫn đến việc chọn tài khoản mặc định (tiền mặt).
- Modal nạp ví chưa có trường chọn tài khoản nhận tiền (`account_id`), khiến thu tiền nạp ví luôn rơi vào két tiền mặt thay vì tài khoản ngân hàng mong muốn.

## 2. Giải pháp

### 2.1. Frontend (`templates/index.html` và `static/js/pos.js`)
- `templates/index.html`: Thêm container chọn tài khoản ngân hàng `#pos-topup-bank-account-box` vào modal `#modal-topup-spa`, ẩn mặc định khi thanh toán tiền mặt và hiện khi chọn chuyển khoản / quẹt thẻ.
- `static/js/pos.js`:
  - Lắng nghe sự kiện đổi hình thức thanh toán `#pos-topup-pay-method`:
    - `transfer` / `card`: hiển thị danh sách tài khoản ngân hàng từ `window.posPaymentAccounts`, tự chọn tài khoản mặc định hoặc ngân hàng đầu tiên.
    - `cash`: ẩn container chọn tài khoản.
  - Cập nhật `submitTopupSpaRecharge`: lấy `account_id` từ `#pos-topup-account-id` nếu hiển thị và gửi lên API `/api/topup/recharge`.
  - Cập nhật `openTopupSpaModal`: reset về tiền mặt và ẩn hộp chọn tài khoản.

### 2.2. Backend (`routers/topup.py`)
- Chuẩn hóa kiểm tra `payment_method` (`transfer`, `bank`, `card`).
- Khi `req.account_id` có giá trị: kiểm tra tài khoản tồn tại và kích hoạt trong `payment_accounts`, sử dụng `account_id` đó.
- Khi không có `req.account_id`:
  - Nếu `payment_method` thuộc nhóm ngân hàng (`transfer`, `bank`, `card`): tìm tài khoản `account_type = 'bank' AND is_active = 1` đầu tiên.
  - Ngược lại: lấy tài khoản mặc định `is_default = 1 AND is_active = 1`.
- Ghi chú Sổ Quỹ diễn giải rõ tên hình thức thanh toán tiếng Việt.
