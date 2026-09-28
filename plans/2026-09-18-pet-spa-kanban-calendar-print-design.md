# Thiết Kế Chi Tiết: Tối Ưu Bảng Dịch Vụ Spa, Gom Cụm Cột Nghiệp Vụ, Đa Chế Độ Xem (Bảng / Lịch / Kanban) & Mẫu In Ký Nhận / Thanh Toán

**Ngày:** 2026-09-18  
**Dự án:** POS KiotViet Offline (`pos-offline`)  
**Tác giả:** Hermes  
**Trạng thái:** Đã Duyệt Thiết Kế (Approved)

---

## 1. Mục Tiêu Nghiệp Vụ & Bố Cục Bảng (Chữ To, Gom Cụm)

### 1.1. Bảng Dữ Liệu Gom Cụm Trực Quan (12 Cột, Font 13-14px)
- **Tách rõ 2 phân vùng nghiệp vụ**:
  - **Cụm Trái (Thợ Spa)**: 
    1. STT / Mã phiếu (`#10` tím to)
    2. Khách hàng & SĐT + Dropdown gọi điện ngay dưới
    3. Thú Cưng (Tên bé, giống kèm icon, màu kèm icon, cân nặng `kg` nổi bật, giới tính)
    4. Gói Dịch Vụ & Nhuộm
    5. Lưu Ý, Yêu Cầu Cắt & Phụ Kiện
    6. Thợ Phụ Trách (Nhận, Tắm, Cắt chính, Nhuộm)
    7. Trạng Thái Tiến Độ (`⏳ Chờ`, `🔄 Đang làm`, `✅ Xong`, `🏠 Đã Về`)
  - **Cụm Phải (Thu Ngân / Bán Hàng Trả Bé & Thu Tiền)**:
    8. Phụ Thu & Phát Sinh (Đánh răng, cắt nghệ thuật, phụ thu, ship, tip)
    9. Tổng Tiền Phải Thu (chữ to, số đậm màu sky/blue)
    10. Trạng Thái Thanh Toán (`Đã TT` / `Chưa TT`)
    11. Đưa Đón & Thời Gian (Giờ nhận / Cách đến ➡️ Giờ về / Cách trả)
    12. Thao Tác (`✏️ Cập nhật`, `🖨️ In Tiếp Nhận`, `🧾 In Thanh Toán`, `🗑️ Xóa`)

---

## 2. Đa Dạng Chế Độ Xem (Bảng / Lịch Hẹn / Kanban)

- **View 1: Dạng Bảng (Table View - Mặc định)**: Bảng 12 cột gom cụm chữ to, dễ bao quát toàn bộ ca làm trong ngày.
- **View 2: Dạng Kanban (Kanban Board View)**:
  - 4 cột: `⏳ Chờ Làm` | `🔄 Đang Làm` | `✅ Xong (Chờ đón)` | `🏠 Đã Về`
  - Thẻ card gồm: STT phiếu, tên bé, giống, cân nặng, thợ cắt/tắm, giờ nhận, yêu cầu đặc biệt.
  - Cho phép click nhanh hoặc kéo thả để đổi trạng thái tức thì.
- **View 3: Dạng Lịch Hẹn (Calendar / Timeline View)**:
  - Gom các phiếu theo khung giờ trong ngày (sáng / trưa / chiều). Giúp cửa hàng chủ động điều phối thợ và chuồng lưu trú.

---

## 3. Chuẩn Hóa 2 Mẫu In Riêng Biệt (K80 Chuẩn Nhiệt)

### 3.1. Phiếu Tiếp Nhận Dịch Vụ (Khi nhận bé)
- Thông tin tiệm, số phiếu tiếp nhận to rõ (#10).
- Thông tin bé: Tên, giống, màu, cân nặng, giới tính, phụ kiện gửi kèm.
- Gói dịch vụ đã đăng ký & yêu cầu đặc biệt của chủ.
- Giờ nhận, hình thức đến, giờ dự kiến xong.
- **2 Ô Chữ Ký Chân Phiếu**:
  - `Nhân viên tiếp nhận` (Ký & họ tên)
  - `Khách hàng gửi bé` (Ký xác nhận tình trạng bé & phụ kiện)

### 3.2. Phiếu Thanh Toán / Hóa Đơn Trả Bé (Khi trả bé)
- Số phiếu, thông tin khách & bé.
- Bảng kê chi phí minh bạch:
  - Giá gói dịch vụ gốc
  - Đánh răng (nếu có)
  - Cắt nghệ thuật (nếu có)
  - Phụ thu gỡ rối / ghẻ / cắn (nếu có)
  - Cước ship đưa về (nếu có)
  - Tiền tip thợ (nếu có)
  - **TỔNG CỘNG THANH TOÁN**
- Trạng thái thanh toán (Tiền mặt / Chuyển khoản VietQR kèm mã QR nếu cần).
- Giờ trả bé thực tế & hình thức đưa về.
- Lời cảm ơn & dặn dò chăm sóc sau dịch vụ.
