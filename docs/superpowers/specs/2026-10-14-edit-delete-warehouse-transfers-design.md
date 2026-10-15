# Thiết Kế: Tính Năng Sửa, Xóa Phiếu Chuyển Kho & Lưu Vết Người Tạo, Người Sửa Cuối

## 1. Mục Tiêu
Cung cấp khả năng Chỉnh sửa và Xóa (Hủy) các phiếu điều chuyển kho nội bộ, đồng thời lưu vết chính xác người tạo phiếu (`created_by`), người sửa đổi lần cuối (`updated_by`), và thời gian cập nhật (`updated_at`):
- Khi Xóa phiếu: Tự động hoàn kho (Rollback) - cộng bù lại tồn kho xuất, trừ thu hồi tồn kho nhập; ghi log biến động kho; xóa dữ liệu phiếu.
- Khi Sửa phiếu: Hoàn tác lượng hàng cũ, kiểm tra lượng tồn khả dụng tại kho xuất mới, trừ kho xuất mới và cộng kho nhập mới theo danh sách hàng mới; cập nhật `updated_by` và `updated_at`.
- Truy xuất thông tin: Trả về đầy đủ `created_by`, `updated_by`, `updated_at` trong API danh sách và chi tiết phiếu chuyển kho.
- Giao diện & In ấn:
  - Cột thao tác trong bảng Lịch sử chuyển kho có nút ✏️ Sửa và 🗑️ Xóa.
  - Form tạo phiếu hỗ trợ chế độ Edit (nạp lại thông tin phiếu cũ, hiển thị tiêu đề "Cập Nhật Phiếu Chuyển Kho [Mã]").
  - Mẫu in A4 hiển thị người lập phiếu lấy từ `created_by`, và ghi chú người sửa cuối nếu có.

## 2. Thiết Kế Cơ Sở Dữ Liệu (`database.py`)
Mở rộng bảng `warehouse_transfers`:
- `created_by TEXT`: Tên hoặc tài khoản người lập phiếu ban đầu.
- `updated_by TEXT`: Tên hoặc tài khoản người sửa đổi lần cuối.
- `updated_at DATETIME`: Thời điểm cập nhật lần cuối (giờ Việt Nam).
- Migration tự động bằng `ALTER TABLE` nếu bảng đã tồn tại trong DB hiện hữu.

## 3. Thiết Kế Backend API (`routers/inventory.py`)
1. **POST `/api/inventory/transfer` (Tạo mới)**:
   - Lưu `created_by = user_name`.
   - `created_at = now_vn`.
2. **DELETE `/api/inventory/transfers/{transfer_id}` (Xóa phiếu & hoàn kho)**:
   - Kiểm tra phiếu tồn tại.
   - Duyệt toàn bộ `warehouse_transfer_items`:
     - Nếu `item_type == 'product'`:
       - Cộng trả lại kho xuất: `quantity = quantity + it.quantity`
       - Trừ thu hồi kho nhập: `quantity = quantity - it.quantity`
       - Ghi `inventory_logs` với `change_type = 'ADJUST'` / `'TRANSFER_ROLLBACK'`
     - Nếu `item_type == 'ingredient'`:
       - Tương tự với bảng `inventory` và `inventory_logs`.
   - Xóa `warehouse_transfer_items` và `warehouse_transfers`.
   - Trả về `{"status": "ok", "message": "Đã xóa và hoàn tác tồn kho thành công"}`.
3. **PUT `/api/inventory/transfers/{transfer_id}` (Cập nhật phiếu chuyển kho)**:
   - Hoàn tác tồn kho theo danh sách `items` cũ.
   - Kiểm tra tồn kho kho xuất mới đối với danh sách `items` mới: Nếu thiếu hàng, báo lỗi 400.
   - Cấn trừ kho xuất mới, cộng kho nhập mới.
   - Cập nhật bảng `warehouse_transfers` (`from_warehouse_id`, `to_warehouse_id`, `note`, `updated_by = user_name`, `updated_at = now_vn`).
   - Xóa `warehouse_transfer_items` cũ và chèn `warehouse_transfer_items` mới.
4. **GET `/api/inventory/transfers` và GET `/api/inventory/transfers/{id}`**:
   - Trả về thêm `created_by`, `updated_by`, `updated_at`.

## 4. Thiết Kế Frontend UI & Mẫu In (`static/js/app.js`, `templates/index.html`)
1. **Bảng Lịch sử chuyển kho (`#table-transfer-history`)**:
   - Hiển thị thêm người tạo / người sửa (`created_by`, `updated_by`).
   - Thêm nút hành động:
     - ✏️ **Sửa**: Nạp dữ liệu vào form `transfer-create-view`, chuyển sang tab Tạo/Sửa.
     - 🗑️ **Xóa**: Gọi popup xác nhận -> gọi `DELETE /api/inventory/transfers/{id}` -> tải lại danh sách kho và lịch sử.
2. **Form chuyển kho (`#transfer-create-view`)**:
   - Thêm biến `currentEditingTransferId` để phân biệt tạo mới hay sửa.
   - Nếu đang sửa: đổi nút thành *"💾 Lưu Cập Nhật Phiếu [Mã]"* và có nút *"✕ Hủy Bỏ Sửa"*.
3. **Mẫu in A4 (`printStockTransferA4`)**:
   - Dưới chữ ký "Người Lập Phiếu": hiển thị `data.created_by || 'Người lập'`.
   - Nếu có `data.updated_by`: hiển thị dòng ghi chú nhỏ ở chân phiếu: `(Sửa lần cuối bởi: ${data.updated_by} - ${formatDate(data.updated_at)})`.
