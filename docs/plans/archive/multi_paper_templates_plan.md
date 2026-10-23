# Implementation Plan: Quản Lý Mẫu In Theo Từng Khổ Giấy Độc Lập & Xem/In Thử

## Mục tiêu:
1. Mỗi khổ giấy (`A4-portrait`, `A4-landscape`, `A5-portrait`, `A5-landscape`, `K80`, `K58`) sở hữu cấu hình các khối Canvas riêng biệt.
2. Chuyển đổi dropdown khổ giấy -> Khung vẽ tự động tải mẫu của đúng khổ đó và co giãn kích thước trực quan.
3. Thêm nút "🖨️ In Thử Mẫu Này" -> Tự động nạp dữ liệu mẫu vào trang in, set CSS `@page { size: ... }` đúng theo khổ giấy đang chọn và bật hộp thoại in của Windows.

## Cấu trúc lưu trữ JSON `multi_templates`:
```json
{
  "active_size": "A4-portrait",
  "templates": {
    "A4-portrait": [...],
    "A4-landscape": [...],
    "A5-portrait": [...],
    "A5-landscape": [...],
    "K80": [...],
    "K58": [...]
  }
}
```

## Các bước thực hiện:
- Task 1: Nâng cấp biến `multiTemplates` trong JS để cache và lưu riêng layout cho từng khổ.
- Task 2: Nâng cấp hàm `changePaperSize(size)`: Tự động lưu tạm khổ cũ -> load khối của khổ mới -> resize khung giấy Canvas chuẩn CSS mm.
- Task 3: Thêm nút "🖨️ In Thử Mẫu Này" gọi `printTestTemplate()` sinh popup và kích hoạt `window.print()` với CSS `@page` động tương ứng.
