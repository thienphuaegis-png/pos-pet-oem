# Thiết Kế: Hiện Đại Hóa Modal Chi Tiết Hóa Đơn & Đóng Bằng ESC / Backdrop Click

## 1. Mục Tiêu & Vấn Đề Giải Quyết
- **Thẩm mỹ**: Modal Chi Tiết Hóa Đơn (`#modal-order-view`) hiện tại bị chật chội (650px), khối tổng kết tiền chứa các hộp màu thô kệch (SP vs Spa, khung vàng/đỏ gắt), các nút chân trang chen chúc.
- **Thao tác**: Người dùng muốn bỏ nút "Đóng" màu xám ở footer, hỗ trợ click chuột ra ngoài vùng nền đen (backdrop) để tự đóng, và bấm phím `ESC` để đóng modal (trước đây ESC không đóng được modal này do thiếu id trong danh sách `activeModals` của `app.js`).

## 2. Thiết Kế Chi Tiết

### 2.1. Cấu Trúc HTML (`templates/index.html`)
- **Khung modal `#modal-order-view`**:
  - Backdrop: `onclick="if(event.target === this) closeModalOrderView()"`
  - Container: `w-[740px] max-w-full rounded-2xl shadow-2xl`
  - Header: Icon hóa đơn 🧾, tiêu đề, mã đơn, badge trạng thái thanh toán (🟢 Đã thanh toán / 🔴 Còn nợ), nút `✕` bo tròn góc phải.
  - Thanh thông tin: Khách hàng + SĐT, Thu ngân, Ngày lập.
  - Bảng món: Giữ đầy đủ các cột STT, Tên, SL, Đơn giá, Thành tiền với badge `SP` / `DV` gọn nhẹ.
  - Khối tài chính: Thiết kế grid 2 cột tinh gọn:
    - Cột trái: Cơ cấu tiền hàng hóa & dịch vụ, hình thức thanh toán.
    - Cột phải: Dòng tiền (Tổng tiền, Giảm giá, Trừ ví nếu có, Phải thanh toán, Đã trả, Còn nợ).
  - Footer: Bỏ nút "Đóng". Giữ 5 nút nghiệp vụ (`Thu Nợ Đơn Này`, `In Lại`, `Đổi / Trả Hàng`, `Sửa`, `Xóa`).

### 2.2. Xử Lý Phím ESC (`static/js/app.js`)
- Bổ sung `'modal-order-view'` vào mảng `activeModals` trong sự kiện `keydown` `Escape`.
- Khi bấm ESC, hệ thống tự động gọi hàm đóng modal tương ứng.

### 2.3. Logic Render (`static/js/modules/productions.js`)
- Cập nhật hàm `viewOrderDetailModal`:
  - Render badge trạng thái thanh toán (đã thanh toán đủ vs còn nợ).
  - Cập nhật các trường số tiền tương ứng trên giao diện mới.
  - Giữ nguyên các id phần tử để tương thích ngược (`view-order-code`, `view-order-date`, `view-order-cust`, `view-order-staff`, `view-order-items`, `view-order-total`, `view-order-discount`, `view-order-final`, `view-order-paid`, `view-order-debt`, v.v.).

## 3. Tiêu Chuẩn Nghiệm Thu (Acceptance Criteria)
1. **AC 1 (Backdrop click)**: Nhấp chuột ra nền đen bên ngoài `#modal-order-view` $\to$ modal tự động đóng.
2. **AC 2 (Phím ESC)**: Bấm phím ESC khi modal chi tiết đơn đang mở $\to$ modal tự động đóng.
3. **AC 3 (Giao diện mới & Bỏ nút Đóng)**: Không còn nút "Đóng" to màu xám ở footer; giao diện hiển thị đúng layout 740px bo góc mềm mại, hiển thị badge trạng thái thanh toán và bảng tài chính gọn gàng.
