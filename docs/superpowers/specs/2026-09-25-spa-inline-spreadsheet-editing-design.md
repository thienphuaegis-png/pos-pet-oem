# Đặc Tả Thiết Kế: Chế Độ Sửa Trực Tiếp Dạng Bảng Tính Cho Phiếu Dịch Vụ Spa (Spreadsheet Inline Edit Mode)

**Ngày:** 2026-09-25  
**Trạng thái:** Đã duyệt (Approved)  
**Mục tiêu:** Cho phép nhân viên tiệm sửa đồng thời nhiều phiếu Spa trực tiếp trên bảng như Excel/Google Sheets (Trạng thái, Thợ làm, Phụ thu, Tip, Thanh toán, Ghi chú) và lưu toàn bộ thay đổi trong 1 lần bấm.

---

## 1. Giao Diện Người Dùng (UI/UX)

### 1.1. Nút Kích Hoạt Chế Độ Sửa Bảng Tính
- Đặt tại thanh công cụ view Table Spa (`#spa-view-table`):
  - Trạng thái mặc định: Nút `[📝 Chế Độ Sửa Excel]` (viền tím/xám, nền trắng).
  - Trạng thái đang bật:
    - Nút `[💾 Lưu Thay Đổi (N)]` (nền xanh lá gradient, nổi bật, hiển thị số phiếu đã sửa).
    - Nút `[❌ Thoát Sửa]` (màu xám/đỏ nhẹ).
- Phím tắt hỗ trợ:
  - `Ctrl + S`: Lưu toàn bộ các dòng đã chỉnh sửa.
  - `Esc`: Thoát chế độ sửa (có xác nhận nếu có dòng chưa lưu).

### 1.2. Các Cột Cho Phép Sửa Trực Tiếp Trên Bảng
1. **Trạng thái (`status`):**
   - Dropdown inline: `pending` (Chờ làm), `in_progress` (Đang làm), `completed` (Xong), `checked_out` (Đã trả bé).
   - Đổi màu badge ngay lập tức khi người dùng chọn.
2. **Thợ Cắt / Thợ Phụ (`staff_cutter`, `staff_worker_1`):**
   - Dropdown inline chọn nhân viên từ danh sách nhân sự hiện có.
3. **Phụ Thu & Tài Chính (`surcharge`, `teeth_cleaning`, `art_cutting`, `tip_amount`):**
   - Ô input số có định dạng phân cách hàng nghìn (`150.000 đ`).
   - Tự động cộng lại cột **Thành Tiền** của dòng đó:
     $$\text{Thành tiền} = \text{Giá dịch vụ} + \text{Phụ thu} + \text{Tip}$$
4. **Thanh Toán (`payment_status` & `payment_method`):**
   - Dropdown inline `Chưa thanh toán` / `Đã thanh toán` (`cash` / `transfer`).
5. **Yêu Cầu & Ghi Chú (`customer_request`, `note`):**
   - Ô input text gõ nhanh ghi chú của khách và lưu ý làm đẹp.

### 1.3. Đánh Dấu Trực Quan & Thao Tác Phím
- Dòng nào có thay đổi dữ liệu sẽ được thêm class `.dirty-row` (viền vàng hổ phách + nền vàng nhạt `bg-amber-50/40`).
- Phím điều hướng chuẩn bảng tính:
  - `Tab`: Chuyển sang ô nhập liền kề bên phải.
  - `Shift + Tab`: Quay lại ô bên trái.
  - `Enter`: Nhảy xuống ô tương ứng ở dòng dưới.

---

## 2. Thiết Kế API & Backend

### 2.1. Endpoint Bulk Update
- **URL:** `PUT /api/partners/pet-services/tickets/bulk-update`
- **Request Body:**
```json
{
  "tickets": [
    {
      "id": 101,
      "status": "in_progress",
      "staff_cutter": "Nguyễn Văn A",
      "staff_worker_1": "Trần Thị B",
      "surcharge": 50000,
      "teeth_cleaning": 30000,
      "art_cutting_fee": 0,
      "tip_amount": 20000,
      "price": 280000,
      "payment_status": "paid",
      "payment_method": "transfer",
      "note": "Cắt tròn mặt",
      "customer_request": "Sấy kỹ tai"
    }
  ]
}
```
- **Response:**
```json
{
  "success": true,
  "updated_count": 1,
  "message": "Đã cập nhật thành công 1 phiếu dịch vụ Spa"
}
```

### 2.2. Xử Lý Transaction & Toàn Vẹn Dữ Liệu
- Toàn bộ mảng phiếu được cập nhật trong **1 SQLite Transaction** (`db.commit()`).
- Nếu có bất kỳ lỗi nào xảy ra ở 1 phiếu, rollback toàn bộ và trả về mã lỗi rõ ràng.
- Ghi log hoạt động vào `logs/partners.log`.

---

## 3. Kế Hoạch Kiểm Thử
1. **Backend Integration Test (`tests/test_spa_bulk_update.py`):**
   - Tạo nhiều vé Spa mẫu.
   - Gọi API bulk-update thay đổi trạng thái, thợ làm, phụ thu, thanh toán.
   - Kiểm tra DB xác nhận mọi thay đổi đã được lưu chính xác.
2. **Frontend Test (`tests/test_spa_render.js`):**
   - Kiểm tra toggle chế độ sửa bảng tính.
   - Kiểm tra hàm thu thập các dòng dirty rows.
   - Kiểm tra định dạng tiền tệ và tính toán thành tiền dòng khi đổi phụ thu.
