# POS UX Enhancement: Wheel Guard, Number Formatting, Blank Placeholders & Global ESC Hotkeys

## 1. Problem Statement
1. Người dùng khi cuộn chuột qua các ô `input[type="number"]` (số lượng, giá tiền) dễ vô tình làm thay đổi số lượng mà không nhận biết.
2. Các ô nhập giá tiền và số lượng chưa có dấu phân cách hàng nghìn (ví dụ `1500000` thay vì `1.500.000`), gây khó nhìn khi nhập số tiền lớn.
3. Các ô không kế thừa dữ liệu tự động (như giá vốn sản phẩm mới, phụ thu, tip thợ, chiết khấu...) bị điền sẵn `0` hoặc `1` buộc người dùng phải xóa trước khi gõ. Cần để trống `value=""` kèm `placeholder="0"`.
4. Các cửa sổ modal mở lên chưa hỗ trợ phím `ESC` để đóng nhanh. Thiếu hệ thống phím tắt chuẩn quầy thu ngân (F1, F2, F3, F4, F8, F9, F10, ESC).

## 2. Technical Architecture

### 2.1 Wheel Guard (Chặn Cuộn Chuột Làm Nhảy Số)
- Thêm event listener toàn cục cho sự kiện `wheel`:
  ```javascript
  document.addEventListener('wheel', function(e) {
      if (document.activeElement && (document.activeElement.type === 'number' || document.activeElement.hasAttribute('step') || document.activeElement.classList.contains('no-wheel-adjust'))) {
          e.preventDefault();
          document.activeElement.blur();
      }
  }, { passive: false });
  ```
  Vô hiệu hóa 100% tình trạng cuộn chuột thay đổi giá trị của ô số lượng / giá tiền.

### 2.2 Global Currency / Number Input Auto-Formatting (`1.500.000`)
- Hàm `setupAutoCurrencyInputs()`:
  - Tự động gán cho các ô nhập tiền tệ và số lượng:
    - Hiển thị dấu phân cách hàng nghìn (Việt Nam: dấu `.`).
    - Khi submit hoặc đọc giá trị: `parseMoneyInput(str)` chuyển chuỗi có dấu chấm về dạng số thực chuẩn.
  - Các ô giá cost sản phẩm mới, phụ thu khác, tip thợ, chiết khấu mặc định để trống `value=""` với `placeholder="0"`.

### 2.3 Global Modal Stack Manager (Đóng Modal Bằng Phím `ESC`)
- Bắt sự kiện `keydown` trên toàn trang:
  - Khi `e.key === 'Escape'`:
    1. Ưu tiên đóng Modal Xác Nhận / Custom Confirm / Custom Alert (nếu đang hiển thị).
    2. Đóng dropdown tìm kiếm đang mở (`#purchase-search-results`, `#supplier-search-results`, `#svc-customer-dropdown`, ...).
    3. Đóng Modal trên cùng đang hiển thị (`#modal-create-service-ticket`, `#modal-purchase-order`, `#modal-create-oem`, `#modal-detail-oem`, `#modal-app-version`, `#modal-edit-topup-tx`, ...).

### 2.4 Bảng Phím Tắt Tiện Ích Chuẩn POS (Hotkeys)
- `F1`: Thêm tab hóa đơn mới.
- `F2`: Đổi nhanh sang hóa đơn kế tiếp.
- `F3`: Focus vào ô Tìm kiếm hàng hóa / Quét Barcode POS.
- `F4`: Focus vào ô Tìm kiếm khách hàng.
- `F8`: Mở / chuyển đổi phương thức thanh toán POS.
- `F9`: Thanh toán hóa đơn POS (hoặc `Ctrl + Enter`).
- `F10`: Mở modal kiểm đếm tiền mặt két.
- `ESC`: Đóng ngay popup / modal đang mở.
- Bổ sung modal Trợ Giúp Phím Tắt `#modal-pos-shortcuts-help` (mở bằng phím `?` hoặc nút `[ ⌨️ Phím tắt ]` trên thanh công cụ POS).
