# Thiết Kế: Quản Lý, Sửa & Xóa Phiếu Thu Nạp Ví Spa (Sub-tab Hóa Đơn Nạp Ví & Modal Lịch Sử)

## 1. Mục tiêu
- Cung cấp khả năng tra cứu, in ấn, sửa và xóa các giao dịch nạp ví Spa tại 2 nơi:
  1. Thêm Sub-tab **Phiếu Thu Nạp Ví Spa** trong màn hình Quản lý Hóa Đơn (`#tab-orders`).
  2. Bổ sung nút **[Sửa]** và **[Xóa]** bên cạnh nút **[In]** trong modal Lịch Sử Biến Động Ví Spa (`#modal-pos-wallet-history`).
- Cơ chế xóa phiếu nạp ví hoàn tác đồng bộ 100%: trừ lại số dư ví khách hàng, trừ lại điểm thưởng tích lũy, xóa bản ghi giao dịch ví `spa_wallet_transactions` và xóa phiếu thu trong Sổ Quỹ `cashbook`.

## 2. Thiết kế chi tiết

### 2.1. Backend API (`routers/topup.py`)
- `GET /api/topup/transactions`:
  - Query params: `search` (mã phiếu, tên khách, sđt), `from_date`, `to_date`, `payment_method`, `limit`, `offset`.
  - Trả về danh sách chi tiết: id, mã phiếu thu cashbook (`cb.code`), ngày tạo, tên khách, sđt, gói nạp, tiền nộp (`pay_amount`), tiền vào ví (`amount`), số dư sau, điểm thưởng (`points_earned`), hình thức thanh toán, tài khoản nhận (`account_name`), ghi chú, thu ngân (`cashier_name`).
- `DELETE /api/topup/transactions/{id}`:
  - Phân quyền: `owner` hoặc `admin`.
  - Lấy thông tin giao dịch nạp ví theo `id`.
  - Tìm phiếu thu liên kết trong `cashbook` (`ref_type = 'topup' AND ref_id = id`).
  - Hoàn tác số dư ví khách hàng: `spa_wallet_balance = MAX(0, spa_wallet_balance - tx.amount)`.
  - Hoàn tác điểm: `points = MAX(0, points - tx.points_earned)`.
  - Xóa giao dịch trong `spa_wallet_transactions`.
  - Xóa phiếu thu trong `cashbook`.
- `PUT /api/topup/transactions/{id}`:
  - Phân quyền: `owner` hoặc `admin`.
  - Cho phép cập nhật `payment_method`, `account_id`, `note`.
  - Đồng bộ cập nhật sang bản ghi liên kết trong `cashbook`.

### 2.2. Frontend UI (`templates/index.html` & `static/js/pos.js`)
- Thêm sub-tab `#btn-subtab-order-topup` và view `#orders-subview-topup` trong `#tab-orders`.
- Thêm modal chỉnh sửa `#modal-edit-topup-tx`.
- Cập nhật hàm `showPosWalletHistory()` trong `static/js/pos.js`:
  - Render thêm 2 nút `[✏️ Sửa]` và `[🗑️ Xóa]` trên mỗi hàng nạp gói `type === 'topup'` cho quyền admin/owner.
  - Xử lý hàm `confirmDeleteTopupTx(txId, custId)` và `openEditTopupTxModal(txId)`.
- Thêm hàm `loadTopupOrdersList()` và `renderTopupOrdersTable()` trong `static/js/pos.js`.
