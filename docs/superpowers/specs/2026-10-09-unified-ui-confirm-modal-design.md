# Unified UI Confirmation Modal Design (Đồng Bộ Giao Diện Modal Xác Nhận)

## 1. Problem Statement
Hiện tại một số chức năng (như Xóa phiếu thu nạp ví Spa, Xóa đối tác, Xóa đơn OEM, Xác nhận cập nhật máy chủ, Xóa buồng phòng Hotel...) vẫn sử dụng hàm `confirm(...)` mặc định của trình duyệt web. Trình duyệt sẽ hiển thị popup hộp thoại xám/đen của hệ điều hành kèm địa chỉ domain (`womb-jitters-outfit.ngrok-free.dev`), gây mất thẩm mỹ và không đồng bộ với thiết kế giao diện hiện đại của POS.

## 2. Technical Architecture

### 2.1 Chuẩn Hóa Helper `showConfirmModal` & `customConfirm` (`static/js/app.js`)
- Đảm bảo `window.showConfirmModal` và `window.customConfirm` hỗ trợ đầy đủ các kiểu hộp thoại:
  - `type: 'danger'`: Icon 🗑️/⚠️ màu đỏ, nút xác nhận `Xác Nhận Xóa` màu đỏ gradient/shadow.
  - `type: 'warning'`: Icon ⚠️ màu vàng/cam, nút xác nhận màu cam.
  - `type: 'primary'`: Icon 🚀/✨ màu tím/xanh, nút xác nhận màu indigo.
  - Hỗ trợ `title`, `message`, `subMessage` (danh sách hoàn tác), `confirmText`, `cancelText`.
  - Phím tắt: `Escape` để Hủy, `Enter` để Xác nhận.

### 2.2 Chuyển Đổi Các Vị Trí Nghiệp Vụ Sử Dụng Confirm
1. **Xóa phiếu thu nạp ví Spa (`static/js/pos.js`)**:
   - Chuyển `confirmDeleteTopupTx(txId, custId, cashbookId)` sang dùng `await showConfirmModal({ title: 'Cảnh Báo Hoàn Tác Đồng Bộ', message: 'Xóa phiếu thu nạp ví này sẽ tự động...', type: 'danger' })`.
2. **Xóa khách hàng / đối tác / nhà cung cấp (`static/js/modules/contacts.js`)**:
   - Chuyển `deleteContact(id)` sang dùng `await showConfirmModal({ title: 'Xóa Đối Tác', message: 'Bạn có chắc chắn muốn xóa đối tác này khỏi danh bạ?', type: 'danger' })`.
3. **Xóa đơn gia công OEM (`static/js/modules/productions.js`)**:
   - Chuyển `deleteOEMOrder(orderId, orderCode, status)` sang dùng `await showConfirmModal({ ... })`.
4. **Cập nhật máy chủ (`static/js/app.js`)**:
   - Chuyển `triggerServerUpdate()` sang dùng `await showConfirmModal({ title: 'Xác Nhận Cập Nhật Máy Chủ', type: 'primary', confirmText: 'Bắt Đầu Cập Nhật' })`.
5. **Xóa kho hàng, xóa nhóm hàng, xóa buồng phòng Hotel**:
   - Đồng bộ sang `showConfirmModal`.
