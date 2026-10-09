# OEM Order Edit, Delete and Rollback Design (Sửa Xóa Đơn Hàng Gia Công OEM)

## 1. Problem Statement
Hiện tại trong module OEM (`routers/oem.py`), các đơn đặt gia công OEM ở trạng thái `RECEIVED` (đã nhận hàng) bị chặn không cho Sửa hoặc Hủy/Xóa:
- `update_oem_order` chặn: `o["status"] not in ("DRAFT", "DEPOSITED")`.
- `delete_oem_order` chặn: `o["status"] not in ("DRAFT", "DEPOSITED")`.
- Giao diện web ẩn toàn bộ nút Sửa và Xóa khi đơn đã chuyển sang `RECEIVED`.
Người dùng cần khả năng:
- Sửa thông tin, số lượng, đơn giá, chiết khấu, VAT, nguồn quỹ của đơn OEM ở mọi trạng thái.
- Xóa đơn OEM kèm cơ chế hoàn tác đồng bộ 100%:
  + Trừ lại số lượng thành phẩm đã cộng vào kho đích (`dest_warehouse_id`).
  + Cộng trả lại nguyên liệu/vật tư BOM đã trừ khỏi kho xưởng (`oem_warehouse_id`).
  + Xóa sạch các phiếu chi thanh toán liên quan (`PC-OEM...`) trong `cashbook`.
  + Xóa đơn hàng và danh sách chi tiết món.

## 2. Technical Architecture

### 2.1 Backend (`routers/oem.py` & `routers/cashbook.py`)
- `routers/oem.py`:
  - `DELETE /api/oem/orders/{order_id}`:
    - Bỏ chặn `o["status"] not in ("DRAFT", "DEPOSITED")`.
    - Nếu đơn có trạng thái `RECEIVED`:
      - Duyệt các mặt hàng trong `oem_order_items`:
        - Trừ tồn kho thành phẩm trong `product_inventory` (và cập nhật `products.stock`).
        - Sinh log kho `inventory_logs` với `change_type = 'ADJUST'`, ghi chú `"Hủy đơn OEM {code}: Thu hồi nhập kho"`.
        - Tìm công thức BOM của từng sản phẩm trong `product_bom`:
          - Cộng trả lại số lượng nguyên liệu tương ứng vào `inventory` tại `oem_warehouse_id`.
          - Sinh log kho `inventory_logs` với `change_type = 'ADJUST'`, ghi chú `"Hủy đơn OEM {code}: Hoàn trả nguyên liệu BOM xưởng"`.
      - Xóa tất cả các phiếu chi `cashbook` có `ref_type = 'oem_order'` và `ref_id = order_id` (hoặc `category LIKE '%OEM%'`).
    - Nếu đơn `DEPOSITED` hoặc `DRAFT`:
      - Xóa các phiếu chi cọc `PC-OEM` trong `cashbook`.
    - Xóa `oem_order_items` và `oem_orders`.
  - `PUT /api/oem/orders/{order_id}`:
    - Bỏ chặn `RECEIVED`, cho phép cập nhật thông tin đơn hàng, xưởng, ngày giao, ghi chú, chiết khấu, VAT.
- `routers/cashbook.py`:
  - Trong `delete_cashbook_voucher`:
    - Nếu xóa phiếu chi có `ref_type == 'oem_order'`, cập nhật giảm `deposit_amount` hoặc tăng `remaining_payment` tương ứng của đơn OEM.

### 2.2 Frontend (`static/js/modules/productions.js` & `templates/index.html`)
- `templates/index.html`:
  - Đảm bảo modal `#modal-edit-oem-order` (hoặc tái sử dụng `#modal-create-oem-order`) hỗ trợ chỉnh sửa đơn hàng OEM.
- `static/js/modules/productions.js`:
  - Trong `renderOEMOrdersTable()`:
    - Luôn hiển thị nút `[✏️ Sửa]` và `[🗑️ Xóa]` trên mỗi dòng đơn OEM (kể cả khi đã `RECEIVED`).
  - Hàm `deleteOEMOrder(orderId, orderCode)`:
    - Hiển thị hộp thoại cảnh báo hoàn tác chi tiết (thu hồi kho thành phẩm, hoàn nguyên liệu BOM, xóa phiếu chi cashbook).
    - Gọi API `DELETE /api/oem/orders/{order_id}`.
    - Tải lại danh sách đơn OEM và thông báo toast thành công.
