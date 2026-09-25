# Đặc Tả Kỹ Thuật: Bổ Sung Toàn Diện Thông Tin Cho Nhập Hàng Loạt, Sửa Bảng Tính & Tối Ưu Bố Cục Thao Tác Cột 1

**Ngày:** 2026-09-25  
**Trạng thái:** Đã phê duyệt (Approved)  
**Mục tiêu:**
1. Chuyển cụm nút Thao tác (`[✏️ Chi tiết]`, `[🖨️ Nhận]`, `[🧾 Trả]`, `[🗑️ Xóa]`) vào ngay dưới Số phiếu `#` và Mã hóa đơn ở Cột 1; loại bỏ hoàn toàn cột Thao Tác ở mép phải bảng để không phải cuộn ngang.
2. Mở rộng toàn diện các trường thông tin cho **Nhập hàng loạt (Batch Intake)**: Giống loài, Giới tính, Màu lông, Phụ kiện mang theo, Gửi Hotel, Phụ thu chi tiết (Đánh răng, Cắt NT, Phụ thu thêm, Cước xe, Tip), Thợ làm.
3. Mở rộng toàn diện cho **Chỉnh sửa hàng loạt (Spreadsheet Inline Edit Mode)**: Cho phép sửa trực tiếp Cân nặng, Gói dịch vụ, Nhuộm lông, Từng khoản phụ thu chi tiết, Đội ngũ thợ, Giờ hẹn trả, Phụ kiện, Gửi Hotel.

---

## 1. Thiết Kế Giao Diện (UI/UX)

### 1.1. Tối Ưu Cột 1 Bảng Danh Sách Spa (`#spa-view-table`)
- Thay vì để cột thao tác ở tận mép phải bảng (cột 13), chuyển toàn bộ hành động vào ngay bên dưới số phiếu ở Cột 1:
  - Số thứ tự phiếu to rõ: `#1`, `#2`...
  - Mã phiếu: `DV2609250012`
  - Hàng nút thao tác nhanh:
    - `[✏️]` (Màu chàm): Mở popup chi tiết/tiến độ
    - `[🖨️ Nhận]` (Màu tím): In phiếu tiếp nhận K80
    - `[🧾 Trả]` (Màu xanh lá): In hóa đơn thanh toán K80
    - `[🗑️]` (Màu đỏ viền): Xóa phiếu
- Xóa bỏ thẻ `<th>Thao Tác</th>` và `<td>` thao tác ở cuối dòng, giúp bảng gọn hơn 140px, toàn bộ thông tin hiển thị vừa vặn không bị tràn ngang.

### 1.2. Mở Rộng Bảng Nhập Hàng Loạt (Batch Intake Modal)
- Bổ sung các cột / trường nhập liệu:
  - Thú cưng: Tên bé, Giống loài, Giới tính (Đực/Cái), Màu lông, Cân nặng (kg).
  - Phụ kiện & Lưu ý: Ô nhập phụ kiện mang theo (`accessories` - dây dắt, chuồng, rọ mõm...) + Checkbox `🏨 Hotel`.
  - Phụ thu chi tiết:
    - Đánh răng (`teeth_cleaning`)
    - Cắt nghệ thuật (`art_cutting_fee`)
    - Phụ thu gỡ rối (`surcharge`)
    - Cước xe (`shipping_fee`)
    - Tip thợ (`tip_amount`)
  - Thợ phụ trách: Thợ cắt, Thợ tắm.

### 1.3. Mở Rộng Chế Độ Sửa Bảng Tính (Spreadsheet Inline Mode)
- Khi bật `[📝 Sửa Bảng Tính]`:
  - Cho phép sửa trực tiếp Cân nặng: tự động tra lại giá gói theo bảng giá nếu thay đổi.
  - Cho phép sửa trực tiếp các ô phụ thu chi tiết (Đánh răng, Cắt NT, Gỡ rối, Ship, Tip), tự động cộng lại thành tiền theo thời gian thực.
  - Cho phép sửa Thợ cắt, Thợ tắm, Thợ nhận, Thợ nhuộm.
  - Cho phép sửa Phụ kiện gửi lại và Giờ hẹn trả.

---

## 2. Thiết Kế Backend API

### 2.1. Cập Nhật `PetServiceTicketBulkItem` trong `routers/partners.py`
Bổ sung đầy đủ các trường:
- `weight_at_service`, `service_type`, `dye_package`
- `shaving_feet`, `accessories`, `send_to_hotel`
- `teeth_cleaning`, `art_cutting_fee`, `surcharge`, `shipping_fee`, `tip_amount`
- `staff_receiver`, `staff_cutter`, `staff_worker_1`, `staff_worker_2`, `staff_dyer`
- `received_time`, `checkout_time`, `arrival_method`, `return_method`
- `pet_breed`, `pet_gender`, `pet_color`

### 2.2. Transaction An Toàn
Tất cả các câu lệnh UPDATE/INSERT tiếp tục được bọc trong 1 SQLite transaction duy nhất (`conn.commit()`).
