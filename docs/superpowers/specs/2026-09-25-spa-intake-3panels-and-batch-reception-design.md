# Thiết Kế: Cải Tiến Tiếp Nhận Spa 3 Cột & Nhập Hàng Loạt Nhiều Bé (Google Sheets Style)

## 1. Mục Đích & Bối Cảnh
- **Mục tiêu:** Nâng cấp toàn diện quy trình tiếp nhận dịch vụ Spa của cửa hàng thú cưng nhằm:
  1. Tối ưu không gian làm việc với giao diện 3 cột luôn mở (Thông tin bé/gói dịch vụ, Phụ thu & tài chính, Lịch sử làm đẹp của khách).
  2. Hỗ trợ nhập nhanh hàng loạt nhiều thú cưng cho khách mang 2-10 bé cùng lúc theo phong cách bảng tính Google Sheets, tránh lặp lại thao tác nhiều lần.
  3. Cảnh báo nổi bật "Danh Sách Đỏ / Khách Hàng Cần Lưu Ý" ngay khi chọn khách để bảo đảm an toàn cho thợ và sự hài lòng của khách.
  4. Hiển thị số tiền chuyên nghiệp có dấu phân cách hàng nghìn (`150.000 đ`).
  5. Đưa các mục phụ thu (đánh răng, gỡ rối, cắt nghệ thuật, ship, tip) trực tiếp vào form lập phiếu thay vì phải mở popup tiến độ.

---

## 2. Kiến Trúc Cơ Sở Dữ Liệu & Backend

### A. Cập Nhật Bảng `contacts` (Khách Hàng)
- Bổ sung 2 cột:
  - `is_flagged INTEGER DEFAULT 0`: Đánh dấu khách có trong danh sách cần lưu ý đặc biệt / danh sách đỏ.
  - `warning_note TEXT DEFAULT ''`: Nội dung lưu ý chi tiết (VD: "Bé cắn thợ, khách rất kỹ tính, bé có tiền sử co giật").
- Endpoint:
  - `PUT /api/contacts/{id}/warning`: Cập nhật trạng thái `is_flagged` và `warning_note`.

### B. Cập Nhật Bảng `pet_service_tickets` (Phiếu Dịch Vụ)
- Bổ sung cột:
  - `batch_code TEXT DEFAULT ''`: Mã đợt tiếp nhận chung khi lập nhiều phiếu cùng lúc (VD: `BATCH2609251500123`).
- Endpoint:
  - `POST /api/pet-services/batch`: Tiếp nhận mảng danh sách vé `List[PetServiceTicketCreate]`, tạo hàng loạt trong 1 transaction và trả về danh sách mã vé đã tạo.

### C. Lịch Sử Spa Theo Khách Hàng
- Endpoint:
  - `GET /api/pet-services/history/customer/{customer_id}?pet_id=...`:
    - Lấy toàn bộ lịch sử các lần làm Spa của khách hàng đó.
    - Cho phép truyền query param `pet_id` tùy chọn để lọc riêng từng bé hoặc xem toàn bộ.

---

## 3. Kiến Trúc Giao Diện (Frontend UI / UX)

### A. Bố Cục 3 Cột (Chế Độ 1 Bé Đơn Lẻ)
Modal `#modal-create-service-ticket` mở rộng kích thước (`max-w-7xl`):
1. **Thanh Tiêu Đề & Công Cụ:**
   - Chọn khách hàng (Tìm kiếm nhanh qua SĐT/Tên).
   - Nút chuyển chế độ: `[🐾 Tiếp Nhận 1 Bé (3 Cột)]` vs `[⚡ Nhập Hàng Loạt (Sheets)]`.
   - **Banner Danh Sách Đỏ:** Màu đỏ viền nổi bật hiển thị cảnh báo ngay khi chọn khách có `is_flagged=1` hoặc `warning_note` không rỗng.
2. **Cột 1: Thông Tin Bé & Dịch Vụ Chính (Width: 42%):**
   - Dropdown chọn thú cưng của khách (hoặc thêm bé mới).
   - Ô nhập Cân nặng (kg) (bắt buộc).
   - Lựa chọn Cạo bàn.
   - Gói dịch vụ chính (nạp động theo `<optgroup>` phân loại).
   - Gói nhuộm (tùy chọn).
   - Yêu cầu của khách (cắt tỉa, sấy).
3. **Cột 2: Phụ Thu & Tài Chính Thanh Toán (Width: 30%):**
   - Đơn giá gói chính & gói nhuộm (tự động nhảy theo kg).
   - Các ô phụ thu: Đánh răng, Cắt nghệ thuật, Phụ thu gỡ rối/khác, Cước ship, Tip thợ.
   - Tất cả các ô nhập tiền tự động định dạng dấu chấm phân cách hàng nghìn (`formatMoneyInput`).
   - Tổng cộng tạm tính: Bold lớn.
   - Trạng thái thanh toán (Khi đón / Trả trước) + Phương thức thanh toán.
4. **Cột 3: Lịch Sử Spa Khách Hàng (Width: 28% - Luôn hiển thị):**
   - Dropdown lọc theo thú cưng của khách (`Tất cả bé` hoặc chọn bé cụ thể).
   - Danh sách thẻ lịch sử cuộn mượt: Ngày làm, tên bé, cân nặng, gói dịch vụ, thợ phụ trách, ghi chú thợ trước đó.

---

### B. Chế Độ Nhập Hàng Loạt (Google Sheets / Quick Batch Grid)
- Bảng Grid nhập nhanh nhiều dòng:
  - Cột 1: STT
  - Cột 2: Chọn bé (Dropdown danh sách thú cưng của khách + nút Thêm bé mới)
  - Cột 3: Cân nặng (kg)
  - Cột 4: Cạo bàn
  - Cột 5: Gói dịch vụ chính (Dropdown nạp động)
  - Cột 6: Gói nhuộm
  - Cột 7: Phụ thu (Ô nhập số tiền định dạng `XX.XXX`)
  - Cột 8: Thành tiền từng bé (tự động tính)
  - Cột 9: Ghi chú / Yêu cầu
  - Cột 10: Xóa dòng
- Nút `➕ Thêm Dòng Bé` để thêm bao nhiêu bé tùy ý.
- Thanh tổng kết đợt: Hiển thị tổng số bé và tổng tiền toàn bộ các vé.
- Nút hành động:
  - `💾 Lập N Phiếu Cùng Lúc`: Lưu toàn bộ phiếu vào DB.
  - `🖨️ Lưu & In Hàng Loạt Phiếu K80`: Lưu toàn bộ phiếu và in liên tiếp các phiếu K80 tiếp nhận.

---

## 4. Kế Hoạch Kiểm Thử (Verification Plan)
1. **Kiểm thử Schema & Database:**
   - Cột `is_flagged`, `warning_note` trong `contacts`.
   - Cột `batch_code` trong `pet_service_tickets`.
2. **Kiểm thử API:**
   - Cập nhật cờ lưu ý khách hàng (`PUT /api/contacts/{id}/warning`).
   - Tạo đợt phiếu hàng loạt (`POST /api/pet-services/batch`).
   - Tra cứu lịch sử spa theo khách hàng (`GET /api/pet-services/history/customer/{id}`).
3. **Kiểm thử UI Runtime (Node JS VM):**
   - Định dạng tiền tệ `formatMoneyInput`.
   - Tính toán phụ thu cộng dồn chính xác.
   - Chuyển đổi mượt mà giữa chế độ 1 bé và nhập hàng loạt.
