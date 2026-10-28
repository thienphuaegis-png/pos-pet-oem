# Thiết Kế Chi Tiết: Phân Hệ Dịch Vụ Spa Thú Cưng & Bảng Giá Theo Cân Nặng

**Ngày thiết kế:** 2026-09-18  
**Dự án:** POS KiotViet Offline (`pos-offline`)  
**Tác giả:** Hermes & Bùi Thiên Phú  

---

## 1. Mục Tiêu & Phạm Vi (Scope & Goals)
- Nâng cấp toàn diện phân hệ **Dịch Vụ & Thú Cưng** (`#tab-pet-services`):
  1. Quản lý bảng giá dịch vụ spa linh hoạt theo từng khoảng cân nặng (kg).
  2. Quy trình lập phiếu dịch vụ thông minh: tìm khách $\to$ chọn/thêm thú cưng $\to$ tự động điền thông tin cũ & cân nặng cũ $\to$ tự động áp giá dịch vụ theo kg.
  3. Quản lý các trường nghiệp vụ chuyên sâu: giống loài, màu lông, lưu ý cạo bàn, yêu cầu của khách, phụ kiện mang theo.
  4. Cơ chế số thứ tự phiếu tâm lý: phiếu đầu ngày random từ 5 đến 10, các phiếu sau tăng dần.
  5. Hỗ trợ thanh toán linh hoạt (thanh toán trước hoặc thanh toán sau khi nhận bé) và in phiếu tiếp nhận dịch vụ (K80 / A5 / A4).

---

## 2. Cấu Trúc Cơ Sở Dữ Liệu (Database Schema)

### 2.1. Bảng Mới: `pet_service_pricing`
Lưu danh mục dịch vụ và mức giá phân tầng theo số kg:
- `id` INTEGER PRIMARY KEY AUTOINCREMENT
- `service_name` TEXT NOT NULL (Tắm, Cạo, VIP 2: Combo tắm vệ sinh, VIP 3: Combo Cạo, Super VIP: Combo Cắt tỉa, Spa Mèo, Cắt, Gỡ rối, Nhuộm 2 Tai, Nhuộm 2 Tai + Đuôi...)
- `category` TEXT DEFAULT 'Gói Spa' (Gói Spa / Nhuộm / Dịch Vụ Lẻ)
- `min_weight` REAL DEFAULT 0 (Số kg bắt đầu)
- `max_weight` REAL DEFAULT 999 (Số kg kết thúc)
- `price` REAL NOT NULL DEFAULT 0 (Đơn giá VNĐ)
- `created_at` DATETIME DEFAULT CURRENT_TIMESTAMP

### 2.2. Bổ Sung Các Cột Cho Bảng `pet_service_tickets`
- `ticket_number` INTEGER (Số thứ tự phiếu trong ngày: đầu ngày random 5-10, sau đó +1)
- `ticket_date` TEXT (Ngày lập định dạng YYYY-MM-DD để tính số thứ tự trong ngày)
- `weight_at_service` REAL (Cân nặng thực tế của bé hôm làm dịch vụ)
- `shaving_feet` TEXT (Không cạo bàn / Cạo bàn / Cạo bàn cao)
- `customer_request` TEXT (Yêu cầu riêng của khách)
- `accessories` TEXT (Phụ kiện khách gửi lại cùng bé)
- `payment_status` TEXT DEFAULT 'unpaid' (unpaid: Chưa thanh toán / paid: Đã thanh toán trước)
- `payment_method` TEXT (cash / transfer / none)
- `services_json` TEXT (Mảng JSON các dịch vụ đã chọn: `[{service_name, weight, price, note}]`)

---

## 3. Danh Mục Droplist Cố Định Chuẩn Nghiệp Vụ

### 3.1. Danh Sách Giống Thú Cưng (21 giống)
Poodle, Phốc Sóc, Sammoyed, Corgi, Alaska, Husky, Golden, Bichon, Shiba, Akita, Bull Pháp, Pug, Bull Anh, Chó Cảnh Khác, Mèo ALN, Mèo ALD, Mèo Cảnh Khác, Labrador / Chó săn mồi, Bắc Kinh, Chó Nhật, Lạp xưởng.

### 3.2. Danh Sách Màu Lông (20 màu)
Bò sữa, Bò nâu, Bò xám, Đen, Phantom, Kem, Nâu, Silver, Socola, Trắng, Trắng - Xám, Vàng, Vàng - Đen, Vàng - Xám, Vàng mơ, Xám, Bicolor (Nhị thể), Sọc dưa, Tabbi (Mướp), Tricolor (Tam thể).

### 3.3. Danh Sách Dịch Vụ & Nhuộm Mặc Định
- **Dịch vụ chính**: Tắm, Cạo, VIP 2: Combo tắm vệ sinh, VIP 3: Combo Cạo, Super VIP: Combo Cắt tỉa, Spa Mèo, Nhuộm, Cắt, Gỡ rối.
- **Dịch vụ nhuộm**: Nhuộm 2 Tai, Nhuộm 2 Tai + Đuôi, Nhuộm 2 Tai + 4 Chân, Nhuộm 2 Tai + Đuôi + 4 Chân, Nhuộm 4 Chân.

---

## 4. Logic Xử Lý Dữ Liệu & Giao Diện

1. **Chuẩn hóa cân nặng**:
   - Cho phép nhân viên nhập `2.1` hoặc `2,1`.
   - Client tự động parse sang `float(2.1)` để truy vấn khoảng giá `min_weight <= weight <= max_weight`.
   - Hiển thị trên form và bản in theo định dạng chuẩn Việt Nam `2,1 kg`.
2. **Ghi đè số kg vào hồ sơ bé**:
   - Khi lưu phiếu, nếu số kg thực tế khác số kg cũ của bé trong bảng `pets`, tự động thực thi `UPDATE pets SET weight = ? WHERE id = ?`.
3. **Sinh số thứ tự phiếu**:
   - Kiểm tra xem trong ngày hôm nay đã có phiếu nào chưa (`SELECT MAX(ticket_number) FROM pet_service_tickets WHERE ticket_date = today`).
   - Nếu chưa có phiếu nào (đầu ngày): random một số nguyên từ 5 đến 10 làm số thứ tự phiếu đầu tiên.
   - Nếu đã có phiếu: lấy `ticket_number` lớn nhất trong ngày + 1.
4. **Mẫu in tiếp nhận (K80 / A5)**:
   - Thể hiện: Tên shop, Số phiếu (STT), Ngày giờ, Tên khách, SĐT, Tên bé, Giống, Cân nặng, Màu lông, Lưu ý cạo bàn, Yêu cầu của khách, Phụ kiện mang theo, Bảng dịch vụ & giá tiền, Trạng thái thanh toán (ĐÃ THANH TOÁN / THANH TOÁN SAU).
