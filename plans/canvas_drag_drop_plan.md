# Implementation Plan: Trình Thiết Kế Mẫu In Kéo-Thả Canvas (Canvas Drag & Drop Builder)
Hỗ trợ đa khổ giấy: K80, K58, A4 Dọc (Portrait), A4 Ngang (Landscape), A5.

## 1. Cấu trúc Canvas & Khổ giấy (Page Orientations)
Hỗ trợ chọn khổ giấy:
- `A4-portrait`: 210mm x 297mm (Tỉ lệ chuẩn in A4 đứng)
- `A4-landscape`: 297mm x 210mm (In A4 ngang)
- `A5-portrait`: 148mm x 210mm
- `K80`: 80mm x Auto
- `K58`: 58mm x Auto

Khi đổi khổ giấy, khung Canvas trên màn hình tự động co giãn đúng tỉ lệ kích thước thật.

## 2. Mô hình Kéo-Thả Khối Độc Lập (Free Canvas Elements)
Mỗi phần tử trên tờ giấy là 1 đối tượng độc lập có tọa độ (x, y), kích thước (width, height), font-size, text-align:
- **Khối Text / Nhãn**: Chữ tĩnh hoặc gán biến (VD: Tên shop, Mã đơn, Tên khách...).
- **Khối Bảng hàng hóa (Table)**: Bảng tự co giãn hiển thị sản phẩm, số lượng, giá, thành tiền.
- **Khối Ảnh / Logo / QR Code**: Có thể kéo di chuyển bất kỳ góc nào trên tờ A4.

## 3. Thao tác trên giao diện người dùng
1. **Thanh công cụ bên trái (Toolbox)**: Danh sách các thành phần có thể bốc kéo:
   - Logo, Tên shop, Địa chỉ, SĐT, Tiêu đề, Mã đơn, Ngày giờ, Khách hàng, Thu ngân.
   - Bảng danh sách hàng hóa.
   - Tổng tiền, Giảm giá, Khách phải trả, Tiền khách đưa, Tiền thừa/nợ.
   - QR Code thanh toán VietQR / Tĩnh, Lời cảm ơn.
   - Ô Text tùy ý (để người dùng gõ chữ bất kỳ).
2. **Khung vẽ chính (Paper Canvas)**:
   - Dùng chuột kéo rê (Drag) thả vào vị trí bất kỳ trên trang A4/K80.
   - Click chọn phần tử: Hiện bảng thuộc tính (Cỡ chữ: 10px - 36px, In đậm, Căn trái/giữa/phải, Xóa phần tử).
3. **In ấn (@media print)**:
   - CSS print chính xác theo kích thước và tọa độ tuyệt đối (absolute positioning theo mm/%).
