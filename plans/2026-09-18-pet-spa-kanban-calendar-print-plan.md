# Kế Hoạch Triển Khai: Tối Ưu Bảng Dịch Vụ Spa, Đa Chế Độ Xem (Bảng / Lịch / Kanban) & Mẫu In Ký Nhận / Thanh Toán

**Ngày:** 2026-09-18  
**Dự án:** POS KiotViet Offline (`pos-offline`)  

---

### Giai Đoạn 1: Bảng Gom Cụm Cột (Font 13-14px) & Nút Chuyển View
- Cập nhật header và body bảng `#table-pet-services` thành 12 cột gom nhóm (Cụm Thợ Spa vs Cụm Thu Ngân Bán Hàng).
- Thêm thanh điều hướng 3 View: `📋 Dạng Bảng` | `📌 Kanban` | `📅 Lịch Hẹn`.

### Giai Đoạn 2: Xây Dựng View Kanban & View Lịch Hẹn
- View Kanban: 4 cột (`⏳ Chờ`, `🔄 Đang làm`, `✅ Xong`, `🏠 Đã Về`) với card thông tin bé, thợ làm, giờ nhận. Click nhanh nút chuyển trạng thái.
- View Lịch Hẹn: Group theo khung giờ / ngày để theo dõi mật độ tiếp nhận.

### Giai Đoạn 3: Tách Biệt 2 Mẫu In K80
- `printPetServiceTicketDirectly(ticketId, 'intake')`: Phiếu tiếp nhận có 2 ô chữ ký nhân viên & khách.
- `printPetServiceTicketDirectly(ticketId, 'invoice')`: Phiếu thanh toán trả bé có bảng kê chi tiết phụ thu, tổng cộng, tiền tip.
