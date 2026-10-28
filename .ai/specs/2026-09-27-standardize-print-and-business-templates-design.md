# Thiết Kế Chi Tiết: Chuẩn Hóa Mẫu In Ấn Đa Trình Duyệt & Bổ Sung Các Mẫu In Thực Tế (bill-5)

## 1. Mục Tiêu & Bối Cảnh
- **Mục tiêu:** Khắc phục triệt để lỗi tràn lề/vỡ khung khi preview hóa đơn A4 ngang/dọc trên các kích thước màn hình; chuẩn hóa CSS `@page` khi xuất lệnh in ngầm qua iframe trên Chrome, Edge, Firefox, Cốc Cốc cho dòng máy in nhiệt K80/K58 và máy in văn phòng A4/A5; bổ sung đầy đủ các mẫu in thực tế theo nghiệp vụ bán lẻ và vận hành Pet Care:
  1. Hóa đơn bán lẻ & Bán sỉ B2B (K80, A4 ngang/dọc 9 cột + 3 chữ ký).
  2. Mẫu in Phiếu Thu & Phiếu Chi (Sổ Quỹ - K80 và A5/A4 kế toán với số tiền bằng chữ và 4 chữ ký).
  3. Mẫu in Phiếu Kiểm Kê Hàng Hóa (Kho vận - A4 với bảng 7 cột và 3 chữ ký trách nhiệm).
  4. Chuẩn hóa Mẫu in Tiếp nhận & Thanh toán Dịch vụ Spa (K80 và A4).

## 2. Chi Tiết Kỹ Thuật

### 2.1 Chuẩn Hóa Engine Preview Scale (pos.js & productions.js)
- Tại modal preview `#modal-print` (pos.js):
  - Tự động lấy chiều rộng thực của container `#print-area`: `containerW = printArea.clientWidth - 32`.
  - So sánh với chiều rộng tờ in `sheetW` (A4 landscape: 1123px, A4 portrait: 794px, K80: ~302px).
  - Nếu `sheetW > containerW`:
    - Tính `scale = containerW / sheetW`.
    - Thiết lập `transform: scale(scale); transform-origin: top center; margin-bottom: -...px;` để khung giấy không bị phình chiều cao ảo và không xuất hiện thanh cuộn ngang khó nhìn.

### 2.2 Chuẩn Hóa CSS `@page` Driver Máy In Đa Trình Duyệt
- **Máy in nhiệt K80 / K58:**
  - Thay thế chuỗi lỗi `size: 80mm auto;` thành:
    ```css
    @page { size: auto; margin: 0mm; }
    html, body { margin: 0; padding: 0; width: 100%; background: #fff; color: #000; }
    ```
  - Đảm bảo cơ chế nhận diện cuộn giấy liên tục (continuous roll), tự động cắt sau khi in xong nội dung, không đẩy thêm trang trắng thừa.
- **Máy in văn phòng A4 / A5:**
  - Thiết lập chuẩn:
    ```css
    @page { size: A4 portrait; margin: 8mm 10mm; }
    /* Hoặc A4 landscape */
    @page { size: A4 landscape; margin: 8mm 10mm; }
    ```
  - Bổ sung quy tắc chống ngắt trang xấu:
    ```css
    table { page-break-inside: auto; }
    tr { page-break-inside: avoid; page-break-after: auto; }
    .print-signatures, .print-summary { page-break-inside: avoid; }
    ```

### 2.3 Mẫu In Phiếu Thu / Phiếu Chi (Sổ Quỹ)
- Hàm tiện ích chuyển số thành chữ tiếng Việt (`numberToVietnameseWords(amount)`).
- **In K80:** Dành cho thủ quỹ in nhanh tại quầy khi khách nộp tiền hoặc chi tiền nóng.
- **In A4 / A5:** Định dạng chuẩn chứng từ kế toán:
  - Header: Tên đơn vị, Địa chỉ, Mã số thuế, Quyển số, Số phiếu, Nợ/Có.
  - Thân phiếu: Người nộp/nhận, Địa chỉ/SĐT, Lý do nộp/chi, Số tiền, Viết bằng chữ, Chứng từ gốc kèm theo.
  - 4 Cột chữ ký: Giám đốc, Kế toán trưởng, Người nộp/nhận, Thủ quỹ (Ký và ghi rõ họ tên).
- Tích hợp nút in tại:
  - Từng dòng trên bảng Sổ Quỹ (`table-cashbook`).
  - Drawer chi tiết giao dịch (`drawer-cashbook-origin`): Cho phép chọn `In Phiếu K80` hoặc `In Phiếu A5/A4`.

### 2.4 Mẫu In Phiếu Kiểm Kê Kho Hàng (Kho Vận)
- Khổ A4 dọc:
  - Tiêu đề: PHIẾU KIỂM KÊ KHO HÀNG.
  - Thông tin: Mã phiếu (`KK...`), Ngày giờ, Tên kho, Ghi chú.
  - Bảng 7 cột: `STT | Mã SKU | Tên Hàng Hóa / Nguyên Liệu | ĐVT | Tồn Hệ Thống | Tồn Thực Tế | Chênh Lệch (+/-)`.
  - Hàng tổng kết: Tổng mặt hàng kiểm kê, Tổng lệch thừa (+), Tổng lệch thiếu (-).
  - 3 Chữ ký: Trưởng ban kiểm kê, Thủ kho, Kế toán kho.
- Tích hợp nút in tại:
  - Modal xem chi tiết phiếu kiểm kê (`modal-audit-detail`).
  - Cột thao tác của bảng lịch sử kiểm kê kho.

### 2.5 Kiểm Thử & Nghiệm Thu
- Pytest kiểm tra cấu trúc HTML, CSS `@page` auto, và các hàm in mới xuất hiện trên window.
- Đảm bảo 100% test checkpoint & test hệ thống pass.
