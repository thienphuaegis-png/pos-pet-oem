# Đặc Tả Thiết Kế: Tiếp Nhận Khách Sạn Thú Cưng Đợt Hàng Loạt & Mẫu In K80 (Pet Hotel Batch Intake & K80 Ticket)

- **Ngày ban hành:** 2026-09-28
- **Tác giả:** Bùi Thiên Phú & Hermes Agent
- **Trạng thái:** Đã phê duyệt (Approved)
- **Hệ thống áp dụng:** POS Offline Petcare (`pos-offline-petcare2`)

---

## 1. Mục Tiêu & Bối Cảnh
Nâng cấp quy trình Check-in phân hệ Khách Sạn Thú Cưng (`Hotel`), kế thừa các ưu điểm từ nghiệp vụ tiếp nhận Spa:
1. **Tìm kiếm khách hàng dạng Combobox (Droplist đa từ):** Lọc nhanh theo Tên và SĐT, hiển thị badge cảnh báo khách đặc biệt (`is_flagged`) và số lượng bé.
2. **Droplist Thú cưng tự động theo Khách:** Tự động lọc các bé của khách đã chọn, có tùy chọn thêm bé mới tại chỗ.
3. **Tiếp nhận hàng loạt (Batch Intake):** Một chủ có thể gửi nhiều bé vào nhiều buồng phòng khác nhau trên cùng một đợt tiếp nhận.
4. **Ghi nhận đầy đủ thông tin phòng ngừa rủi ro:** Cân nặng lúc nhận, tình trạng sức khỏe (ve rận, nấm, vết thương cũ, vắc-xin), đồ gửi kèm, chế độ ăn uống, tiền đặt cọc trước.
5. **In Phiếu Tiếp Nhận Hotel K80:** Mẫu in nhiệt 80mm có thông tin chi tiết từng bé, chi phí dự kiến, điều khoản cam kết và 2 chữ ký xác nhận của Chủ nuôi & Nhân viên.

---

## 2. Thiết Kế Cơ Sở Dữ Liệu & API

### 2.1. Cập nhật Bảng `hotel_bookings`
Thêm các cột nghiệp vụ mới:
- `batch_code TEXT`: Mã đợt tiếp nhận chung (VD: `HTB-260928-001`).
- `pet_weight_at_checkin REAL`: Cân nặng thực tế lúc nhận buồng (kg).
- `health_condition TEXT`: Tình trạng sức khỏe, da lông, vết thương cũ khi tiếp nhận.
- `deposit_amount REAL DEFAULT 0`: Tiền khách đặt cọc trước.

### 2.2. REST API Endpoints
- **`POST /api/hotel/checkin-batch`**: Tiếp nhận một hoặc nhiều bé cùng lúc.
  - **Payload:**
    ```json
    {
      "contact_id": 12,
      "check_in_time": "2026-09-28 15:30:00",
      "expected_checkout_time": "2026-10-01 10:00:00",
      "deposit_amount": 200000,
      "items": [
        {
          "room_id": 1,
          "pet_id": 5,
          "pet_name": "Miu",
          "pet_weight": 3.8,
          "daily_rate": 150000,
          "health_condition": "Bình thường, đã tiêm 3 mũi",
          "feeding_notes": "Hạt Royal Canin 2 lần/ngày",
          "items_brought": "1 balo phi hành gia"
        }
      ]
    }
    ```
  - **Response:**
    ```json
    {
      "success": true,
      "batch_code": "HTB-260928-001",
      "bookings": [...]
    }
    ```

---

## 3. Thiết Kế Giao Diện Người Dùng (UI/UX)

### 3.1. Modal Check-in Hàng Loạt (`#modal-hotel-checkin`)
- **Phần 1: Khách Hàng:**
  - Ô input combobox `#hotel-cust-search` có sự kiện `oninput` lọc fuzzy theo Tên + SĐT từ `allContacts`.
  - Dropdown danh sách kết quả `#hotel-cust-dropdown` (tên, SĐT, số bé, badge lưu ý).
  - Nút `[➕ Thêm khách mới]` mở popup thêm khách.
- **Phần 2: Thông Tin Đợt:**
  - Ngày giờ nhận (mặc định hiện tại).
  - Dự kiến ngày giờ trả (tính số ngày/đêm dự kiến).
  - Tiền đặt cọc trước (VNĐ).
- **Phần 3: Bảng Phân Bổ Các Bé Vào Buồng Phòng (`#tbody-hotel-batch-pets`):**
  - Cột 1: Droplist chọn bé của khách (hoặc thêm bé mới).
  - Cột 2: Cân nặng (kg) & Ghi chú sức khỏe (ve rận, nấm, sẹo...).
  - Cột 3: Droplist buồng phòng trống (chỉ lọc các phòng `available`, hiển thị mã buồng, khu và đơn giá/ngày).
  - Cột 4: Chế độ ăn uống & Đồ gửi kèm.
  - Cột 5: Nút xóa dòng `[🗑️]`.
- Nút `[➕ Thêm Bé]` để thêm dòng phân bổ.
- Nút `[💾 Nhận Phòng]` và `[🖨️ Nhận & In Phiếu K80]`.

---

## 4. Mẫu In Phiếu Tiếp Nhận Hotel K80 (`hotel_intake_k80`)
- **Định dạng:** In nhiệt K80 (chiều rộng tối đa 72-80mm).
- **Cấu trúc:**
  1. Header thông tin cửa hàng (Tên tiệm, SĐT, Địa chỉ).
  2. Tiêu đề: `PHIẾU TIẾP NHẬN LƯU TRÚ HOTEL`.
  3. Mã phiếu / Mã đợt, ngày giờ nhận, tên chủ nuôi, số điện thoại.
  4. Chi tiết từng bé lưu trú: Tên bé, giống loài, cân nặng, buồng phòng, tình trạng sức khỏe, đồ đạc gửi kèm, chế độ ăn.
  5. Tạm tính chi phí buồng phòng, tiền cọc trước, số tiền còn lại dự kiến khi đón bé.
  6. Điều khoản cam kết bảo đảm sức khỏe thú cưng.
  7. 2 khu vực chữ ký: **Chủ Nuôi Ký Nhận** & **Nhân Viên Tiếp Nhận**.

---

## 5. Tiêu Chuẩn Kiểm Thử (Verification Criteria)
1. Thêm cột mới trong database không làm mất dữ liệu hiện có (`test_hotel_batch_schema`).
2. API `POST /api/hotel/checkin-batch` tiếp nhận thành công nhiều bé vào các buồng phòng khác nhau, kiểm tra phòng chuyển sang `occupied` (`test_hotel_checkin_batch_api`).
3. Giao diện combobox tìm kiếm khách hàng và phân bổ danh sách bé hoạt động mượt mà.
4. Mẫu in K80 sinh HTML đúng chuẩn và kích hoạt in không lỗi.
