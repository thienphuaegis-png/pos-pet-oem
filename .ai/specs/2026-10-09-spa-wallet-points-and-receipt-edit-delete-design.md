# Thiết kế: Tích Điểm Ví Spa & Sửa/Xóa Phiếu Thu Nạp Ví

## 1. Mục tiêu & Bối cảnh
- Khi khách hàng nạp tiền vào ví Spa, hệ thống cần tính điểm tích lũy dựa trên số tiền thực nộp (`pay_amount`) và tỷ lệ quy đổi (`points_exchange_rate`).
- Cho phép tài khoản Admin/Owner được phép Sửa và Xóa Phiếu Thu Nạp Ví (`ref_type = 'topup'`) và Phiếu Thu Thủ Công (`ref_type = 'manual'`), đồng thời bảo vệ toàn vẹn dữ liệu cho Phiếu Thu Đơn Hàng (`ref_type = 'order'`).
- Khi Xóa Phiếu Thu Nạp Ví, hệ thống tự động hoàn tác: trừ lại số dư ví Spa (`spa_wallet_balance`), trừ lại điểm tích lũy (`points`), và xóa bản ghi giao dịch nạp ví liên kết trong `spa_wallet_transactions`.

## 2. Thiết kế chi tiết

### 2.1. Tích điểm khi Nạp Ví Spa (`routers/topup.py` & `database.py`)
- Bổ sung migration cột `points_earned INTEGER DEFAULT 0` vào bảng `spa_wallet_transactions`.
- Trong hàm `recharge_spa_wallet`:
  1. Kiểm tra khách hàng có thuộc nhóm cho phép tích điểm không (`customer_segments.allow_points != 0`).
  2. Lấy tỷ lệ quy đổi từ bảng `settings` (`points_exchange_rate`, mặc định 1000).
  3. Tính điểm tích lũy: `points_earned = int(pay_amt // points_exchange_rate)`.
  4. Cập nhật `contacts.points = contacts.points + points_earned`.
  5. Xét thăng hạng tự động cho khách hàng nếu đủ điểm (`min_points`).
  6. Lưu `points_earned` vào bảng `spa_wallet_transactions`.
  7. Trả về `points_earned` và `current_points` trong response.

### 2.2. Sửa / Xóa Phiếu Thu Sổ Quỹ (`routers/cashbook.py`)
- Phân quyền: Yêu cầu role `owner` hoặc `admin`.
- Endpoint `DELETE /api/cashbook/{voucher_id}`:
  - Cho phép: Phiếu Chi (`type in ('out', 'CHI')`), Phiếu Thu Nạp Ví (`ref_type == 'topup'`), Phiếu Thu Thủ Công (`ref_type in ('manual', None, '')`).
  - Chặn: Phiếu Thu Đơn Hàng (`ref_type == 'order'`) với lỗi HTTP 400 giải thích rõ cần hủy tại Quản lý Đơn hàng.
  - Khi xóa `ref_type == 'topup'`:
    - Tìm bản ghi `spa_wallet_transactions` theo `id == cb.ref_id`.
    - Trừ lại số dư ví: `spa_wallet_balance = MAX(0, spa_wallet_balance - tx.amount)`.
    - Trừ lại điểm: `points = MAX(0, points - tx.points_earned)`.
    - Xóa bản ghi trong `spa_wallet_transactions`.
    - Xóa bản ghi trong `cashbook`.
- Endpoint `PUT /api/cashbook/{voucher_id}`:
  - Cho phép sửa Phiếu Chi và Phiếu Thu (`topup`, `manual`). Chặn sửa trực tiếp Phiếu Thu `order`.
  - Cập nhật các trường: `account_id`, `category`, `note`, `contact_id`.
  - Nếu sửa `amount` cho phiếu thu `topup`: điều chỉnh số dư ví và điểm theo mức chênh lệch.

### 2.3. Giao diện Drawer Sổ Quỹ (`static/js/modules/productions.js`)
- Kiểm tra loại phiếu và `ref_type`:
  - Phiếu chi HOẶC (phiếu thu có `ref_type in ('topup', 'manual', '')`): Hiển thị nút Sửa và Xóa cho quyền admin/owner.
  - Phiếu thu `ref_type == 'order'`: Ẩn nút Sửa/Xóa, hiển thị tooltip/chú thích nghiệp vụ.
- Hộp thoại xác nhận xóa hiển thị thông báo rõ ràng về việc tự động hoàn tác số dư ví và điểm tích lũy khi xóa phiếu nạp ví.
