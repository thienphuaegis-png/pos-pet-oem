# Implementation Plan: Resize Kéo Dãn, Phân Vùng 3 Khu Vực Trực Quan & Nút Căn Chỉnh Nhanh

## 1. Tay cầm kéo dãn thu phóng độ rộng (Resize Handle)
- Gắn thêm 1 tay cầm nhỏ (`resize-handle`) ở mép phải/dưới của mỗi khối khi được chọn (`selected`).
- Khi người dùng bấm chuột giữ vào tay cầm này và kéo ngang -> Tự động co dãn độ rộng `w` mượt mà trực tiếp bằng chuột, không cần gõ số `px`.

## 2. Đường kẻ phân định 3 Phân Vùng rõ ràng trên Canvas (Visual Zones)
- Trang giấy có các vạch phân vùng mờ và nhãn rõ ràng:
  - **Khu vực 1 (Đầu trang - Header)**: Thông tin cửa hàng, Logo, Tiêu đề, Mã đơn, Ngày giờ, Khách hàng, Thu ngân.
  - **Khu vực 2 (Giữa trang - Bảng Hàng Hóa)**: Nơi đặt Bảng danh sách hàng hóa và dịch vụ.
  - **Khu vực 3 (Chân trang - Footer & Thanh toán)**: Tổng tiền, Giảm giá, Phải trả, Khách đưa, Nợ, QR Code và Lời cảm ơn.
- Các vạch phân vùng này chỉ hiển thị khi thiết kế trên màn hình, khi in ra thật sẽ tự động ẩn (`@media print` không in).

## 3. Bộ nút Căn Chỉnh Nhanh 1-Click (Quick Alignment)
- Thêm thanh công cụ căn chỉnh trên thanh thuộc tính:
  - **[↔ Căn Giữa Trang]**: Tự động tính toán và đưa khối ra chính giữa chiều ngang của tờ giấy (`(pageWidth - elementWidth) / 2`).
  - **[⬅ Căn Lề Trái Trang]**: Đặt khối sát lề trái chuẩn (30px).
  - **[➡ Căn Lề Phải Trang]**: Đặt khối sát lề phải chuẩn (`pageWidth - elementWidth - 30px`).
  - **[↔ Kéo Dãn Đầy Chiều Rộng]**: Kéo khối rộng full chiều ngang trang giấy.
