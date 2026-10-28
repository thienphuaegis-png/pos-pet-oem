# Implementation Plan: Trình dựng mẫu in trực quan theo khối (Visual Block Builder)

## Mục tiêu
Thay thế toàn bộ khung nhập code HTML thô bằng trình dựng khối trực quan (Visual Block Builder) cho người dùng phổ thông.
Cho phép bật/tắt, đổi kích cỡ chữ, in đậm, căn lề (trái/giữa/phải) và sắp xếp thứ tự các khối thông tin.

## Cấu trúc dữ liệu cấu hình mẫu in (JSON config)
Lưu cấu hình trực tiếp vào bảng `settings` dưới dạng JSON `print_blocks_config`:
```json
{
  "width": "72mm",
  "font_size_base": "12px",
  "border_style": "dashed",
  "header_blocks": [
    {"id": "logo", "name": "Logo cửa hàng", "enabled": true, "align": "center", "size": "max-h-12"},
    {"id": "shop_name", "name": "Tên cửa hàng", "enabled": true, "align": "center", "size": "16px", "bold": true},
    {"id": "shop_address", "name": "Địa chỉ", "enabled": true, "align": "center", "size": "11px", "bold": false},
    {"id": "shop_phone", "name": "Số điện thoại", "enabled": true, "align": "center", "size": "11px", "bold": false},
    {"id": "title", "name": "Tiêu đề phiếu (HÓA ĐƠN BÁN HÀNG)", "enabled": true, "align": "center", "size": "14px", "bold": true},
    {"id": "order_code", "name": "Mã hóa đơn", "enabled": true, "align": "center", "size": "11px", "bold": false},
    {"id": "datetime", "name": "Ngày giờ", "enabled": true, "align": "center", "size": "11px", "bold": false},
    {"id": "staff", "name": "Tên thu ngân", "enabled": true, "align": "left", "size": "11px", "bold": false},
    {"id": "customer", "name": "Tên khách hàng", "enabled": true, "align": "left", "size": "11px", "bold": false},
    {"id": "customer_phone", "name": "SĐT khách hàng", "enabled": false, "align": "left", "size": "11px", "bold": false}
  ],
  "table_columns": {
    "product_name": true,
    "quantity": true,
    "price": true,
    "subtotal": true
  },
  "summary_blocks": [
    {"id": "total", "name": "Tổng tiền hàng", "enabled": true, "bold": false},
    {"id": "discount", "name": "Giảm giá / Chiết khấu", "enabled": true, "bold": false},
    {"id": "final", "name": "Khách phải trả", "enabled": true, "bold": true, "size": "14px"},
    {"id": "paid", "name": "Tiền khách đưa", "enabled": true, "bold": false},
    {"id": "debt", "name": "Tiền thừa / Nợ lại", "enabled": true, "bold": false}
  ],
  "footer_blocks": [
    {"id": "qr", "name": "Mã QR Code thanh toán", "enabled": true, "align": "center", "size": "130px"},
    {"id": "footer_msg", "name": "Lời cảm ơn / Chân trang", "enabled": true, "align": "center", "size": "11px", "italic": true}
  ]
}
```

## Các bước triển khai
1. Cập nhật `database.py`: Tạo key `print_blocks_config` với giá trị mặc định.
2. Cập nhật `server.py`: API lấy và lưu `print_blocks_config`.
3. Cập nhật `templates/index.html`:
   - Dựng giao diện phân nhóm khối có Checkbox, nút căn lề, dropdown kích thước chữ, nút di chuyển lên/xuống (hoặc drag-and-drop HTML5).
   - Hàm JavaScript tự render hóa đơn xem trước (Live Preview) và in ra đúng 100% theo JSON config.
