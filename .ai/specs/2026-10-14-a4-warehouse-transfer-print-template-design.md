# Thiết Kế: Mẫu In Phiếu Điều Chuyển Kho A4 & Tích Hợp Luồng Chuyển Kho

## 1. Mục tiêu
Chuẩn hóa mẫu in Phiếu Điều Chuyển Kho Nội Bộ (Biên bản bàn giao vận chuyển & điều chuyển) khổ A4 chuyên nghiệp, chuẩn mực nghiệp vụ bán sỉ/chuỗi petshop:
- Ẩn hoàn toàn giá vốn để bảo mật thông tin nội bộ khi giao hàng đi đường.
- Đầy đủ thông tin điều chuyển: Kho xuất, Kho nhập, Lý do/Ghi chú, Thời gian, Mã phiếu `CK...`.
- Bảng hàng hóa chuẩn xác với Mã SKU, Tên mặt hàng/vật tư, Phân loại, ĐVT, Số lượng chuyển, Ghi chú.
- 4 chữ ký rõ ràng: Người Lập Phiếu, Thủ Kho Xuất (Giao), Người Vận Chuyển, Thủ Kho Nhận.
- Tích hợp trực tiếp vào luồng thao tác: Modal xác nhận sau khi tạo phiếu, nút in nhanh trong danh sách lịch sử chuyển kho, và nút in trong modal chi tiết phiếu.

## 2. Chi tiết kỹ thuật

### 2.1. Backend API (`routers/inventory.py`)
- Endpoint `GET /api/inventory/transfers/{transfer_id}`:
  - Hiện tại chỉ trả về `item_name`, `unit`, `quantity`, `item_type`, `product_id`, `ingredient_id`.
  - Bổ sung truy vấn mã SKU:
    - Nếu `item_type == 'product'`: Lấy `sku` từ bảng `products`.
    - Nếu `item_type == 'ingredient'`: Lấy `code` từ bảng `ingredients`.
  - Trả về trường `sku` hoặc `code` trong từng item để hiển thị lên mẫu in.

### 2.2. Frontend Print Engine (`static/js/app.js`)
- Xây dựng hàm `printStockTransferA4(transferId)`:
  - Tải dữ liệu chi tiết phiếu chuyển từ `/api/inventory/transfers/{transfer_id}`.
  - Lấy thông tin thương hiệu cửa hàng từ `window.companySettings` (tên shop, địa chỉ, hotline).
  - Khởi tạo HTML khổ A4 chuẩn với `@page { size: A4; margin: 10mm; }` và font `Times New Roman`, line-height `1.35`.
  - Tạo bảng danh sách 6 cột: STT | Mã SKU | Tên Mặt Hàng / Vật Tư | ĐVT | Số Lượng Chuyển | Ghi Chú.
  - Hàng tổng cộng số lượng các mặt hàng.
  - Khu vực 4 chữ ký: Người lập phiếu, Thủ kho xuất, Người vận chuyển, Thủ kho nhận.
  - Sử dụng iframe ẩn (`iframe-stock-transfer-print`) để kích hoạt `window.print()` mà không ảnh hưởng giao diện POS chính.

### 2.3. Tích hợp giao diện người dùng
1. **Modal chi tiết phiếu chuyển kho (`modal-transfer-detail`)**:
   - Thêm nút `🖨️ In Phiếu A4` cạnh nút `Đóng`.
2. **Bảng lịch sử chuyển kho (`table-transfer-history`)**:
   - Cột Thao tác bổ sung nút `🖨️ In` (gọi `printStockTransferA4(t.id)`).
3. **Luồng tạo phiếu chuyển kho (`submitStockTransfer`)**:
   - Sau khi tạo phiếu thành công, hiển thị modal hoặc nút hành động cho phép in ngay phiếu A4 vừa tạo (`printStockTransferA4(result.id)`).

## 3. Ràng buộc & Kiểm thử
- Test tự động (`tests/test_warehouse_transfer_print.py`):
  - Kiểm tra API GET chi tiết phiếu trả về đúng `sku`.
  - Kiểm tra HTML và hàm JS `printStockTransferA4` có mặt trong `static/js/app.js` và `templates/index.html`.
  - Kiểm tra chuẩn CSS A4 và cấu trúc bảng không lộ đơn giá/thành tiền.
