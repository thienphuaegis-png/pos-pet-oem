# Design: Sửa Lỗi Hiển Thị Telegram Và Đồng Bộ Ràng Buộc Chứng Từ Sổ Quỹ

- **Ngày tạo:** 2026-10-14
- **Trạng thái:** Approved by User

## 1. Mục tiêu
1. Sửa lỗi giao diện: Cấu hình Telegram xuất hiện ở tab Nhập Hàng do thẻ `</div>` thừa đóng sớm `#tab-settings` tại dòng 8727 `templates/index.html`.
2. Chuẩn hóa logic tài chính: Mọi giao dịch phát sinh thanh toán (Nhập hàng Purchases, Bán hàng Orders, Gia công OEM, Thu/Trả nợ Contacts) bắt buộc phải gắn liền với bản ghi phiếu Thu/Chi tương ứng trong `cashbook`. Chưa có phiếu chi/thu = Chưa thanh toán (`paid_amount = 0`, `debt_amount = total`).
3. Sinh bù phiếu chi / thu lịch sử cho các đơn nhập hàng và đơn bán hàng cũ có `paid_amount > 0` nhưng chưa có bản ghi trong `cashbook`, giữ nguyên `created_at` gốc và tài khoản quỹ tương ứng.
4. Giao diện Web POS: Hiển thị mã phiếu thu/chi liên kết trực tiếp trên bảng danh sách và pop-up chi tiết/thanh toán nhanh.

## 2. Kiến trúc & Logic Thay Đổi

### 2.1. Frontend Layout (`templates/index.html`)
- Xóa thẻ thừa `</div>` tại dòng 8727 (sau bảng `activity-log`).
- Đưa `#settings-sub-telegram` và `#settings-sub-reset-data` vào lại bên trong `#tab-settings`.
- Cân bằng các thẻ `</div>` ở cuối `#tab-settings`.

### 2.2. Migration & Seeder Sinh Bù (`scripts/migrate_cashbook_sync.py` + auto-run khi start DB)
- **Purchases:** Với mỗi `purchases` có `paid_amount > 0` và không có bản ghi `cashbook` với `ref_type = 'purchase' AND ref_id = purchases.id`:
  - Sinh mã `PC-NH-YYMMDD-XXX`
  - Tạo dòng `cashbook`: `type='out'`, `category='Chi tiền nhập hàng'`, `amount=paid_amount`, `contact_id=supplier_id`, `ref_type='purchase'`, `ref_id=p.id`, `fund_source=p.fund_source`, `created_at=p.created_at`.
- **Orders:** Với mỗi `orders` có `paid_amount > 0` và không có bản ghi `cashbook` với `ref_type = 'order' AND ref_id = orders.id`:
  - Sinh mã `PT-BH-YYMMDD-XXX`
  - Tạo dòng `cashbook`: `type='in'`, `category='Thu tien ban hang'`, `amount=paid_amount`, `contact_id=customer_id`, `ref_type='order'`, `ref_id=ord.id`, `fund_source='COMPANY'`, `created_at=ord.created_at`.

### 2.3. Backend Router Logic
- **`routers/purchases.py`:**
  - `GET /api/purchases`: Trả thêm `cashbook_code`, `cashbook_id`, `cashbook_count`.
  - `POST /api/purchases`: Nếu tạo đơn mới có `paid_amount > 0`: Tự động sinh phiếu chi `PC-NH` ngay (không để tồn tại `paid_amount > 0` mà không có phiếu chi).
  - Thêm endpoint `POST /api/purchases/{code}/pay`: Lập phiếu chi thanh toán cho phiếu nhập (tất toán hoặc trả một phần), tự động cập nhật `paid_amount` và giảm `debt_amount` phiếu nhập + công nợ NCC.
  - `POST /api/purchases/{code}/receive`: Khi nhận hàng thực tế, nếu đã có phiếu chi trả trước thì chỉ cần đối soát chênh lệch, nếu phát sinh thanh toán mới thì sinh phiếu chi `PC-NH`.
- **`routers/cashbook.py`:**
  - Khi xoá/hủy phiếu chi `ref_type = 'purchase'`: Cập nhật lại `paid_amount = max(0, paid_amount - amount)`, `debt_amount = debt_amount + amount` trên `purchases`.

### 2.4. Frontend Purchases Module (`static/js/modules/purchases.js`)
- Trên bảng danh sách Đơn Nhập Hàng: Cột trạng thái hoặc một cột "Chứng từ Sổ Quỹ" hiển thị:
  - Nếu có phiếu chi: Badge xanh `PC-NH-...` (click mở modal xem chi tiết phiếu chi hoặc xem sổ quỹ).
  - Nếu chưa thanh toán hoặc nợ: Nút bấm nhanh `[+ Chi tiền]` mở modal lập phiếu chi thanh toán trực tiếp.
