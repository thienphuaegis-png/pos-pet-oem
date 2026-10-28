# Thiết kế: Phiếu dịch vụ spa + POS/UX (Phase C+D)

Ngày: 2026-09-23
Phạm vi: pos-offline-petcare2

## Bối cảnh

15 yêu cầu tổng được chia 2 phase. Phase này (C: phiếu dịch vụ spa, D: POS/UX)
làm trước vì ít rủi ro schema. Phase sau (A: khách hàng/CSKH, B: thanh toán/in ấn)
note lại, chưa thiết kế.

## Phạm vi phase này

1. Zoom giao diện toàn hệ thống (nút +/- trong Cài Đặt)
2. Bỏ ô "Lịch Hẹn / Đón Bé" khỏi form tạo phiếu dịch vụ
3. "Hình Thức Đến" chuyển từ bắt buộc lúc tạo → cập nhật sau trong danh sách phiếu
4. Checkbox "Spa xong gửi hotel" (chỉ lưu flag, workflow làm sau)
5. Popup lịch sử spa 5-10 lần gần nhất của đúng thú cưng, mở bên phải form tạo phiếu
6. Nút "Lịch sử mua hàng" trên màn hình POS, lọc theo thời gian + loại (hàng hóa/dịch vụ)

## Ngoài phạm vi (note cho phase sau)

- Sửa thông tin khách hàng ngay trên màn hình bán hàng
- Khách hàng nhiều SĐT
- Tích điểm → phân nhóm khách hàng
- Tag "Khách Đỏ - cần lưu ý" hiện trên phiếu dịch vụ
- Thanh toán nhiều hình thức (tiền mặt + chuyển khoản)
- In hóa đơn K80 - điều chỉnh khổ giấy
- Bill dịch vụ bán kèm hàng hóa (gộp đơn)
- Khuyến mãi giảm giá theo số lượng + gợi ý mua thêm

## Thiết kế chi tiết

### 1. Zoom giao diện

- Cơ chế: CSS `zoom` trên `<html>` hoặc `<body>` (app chạy Chromium embed, `zoom`
  được hỗ trợ tốt, không làm vỡ layout như `transform: scale`).
- UI: nút `− 100% +` trong tab Cài Đặt, bước nhảy 10%, khoảng 80%–150%.
- Lưu: `localStorage.appZoom` (mỗi máy tự lưu riêng, không đổi DB/API).
- Áp dụng: đọc `localStorage.appZoom` lúc load trang, set style ngay (tránh FOUC).

### 2+3. Sửa form tạo phiếu dịch vụ

- Xóa hẳn field "Lịch Hẹn / Đón Bé" (`svc-appointment-time`) khỏi UI tạo phiếu.
  Cột `appointment_time` trong DB giữ nguyên (không cần migration), khi tạo mới
  gửi rỗng.
- "Hình Thức Đến" (`has_transport`): bỏ khỏi form tạo, mặc định lưu giá trị hiện có
  (0 = chưa xác định / khách tự chở). Thêm nút "Cập nhật đưa đón" trên mỗi dòng
  trong bảng danh sách phiếu dịch vụ (`tab-pet-services`) — bấm mở dropdown/modal nhỏ
  chọn lại hình thức, PATCH ngay. Không ràng buộc theo status (sửa được mọi lúc,
  kể cả completed).

### 4. Checkbox "Spa xong gửi hotel"

- Migration nhẹ: `ALTER TABLE pet_service_tickets ADD COLUMN send_to_hotel INTEGER DEFAULT 0`.
- Form tạo phiếu: thêm checkbox, lưu vào `send_to_hotel`.
- Danh sách phiếu: hiện badge nhỏ (🏨) nếu `send_to_hotel = 1`.
- Chưa làm workflow thông báo/trạng thái riêng — để phase sau khi có yêu cầu cụ thể.

### 5. Popup lịch sử spa

- Nút nhỏ cạnh dropdown "Chọn Bé Cũ" → mở popup/panel bên phải form tạo phiếu.
- Điều kiện: nếu đang nhập bé mới (chưa có `pet_id`) → nút vẫn hiện nhưng disable,
  tooltip "Bé mới chưa có lịch sử".
- Data: `GET /api/pets/{pet_id}/service-history?limit=10` — trả `pet_service_tickets`
  của đúng `pet_id` đó, sort `ticket_date DESC`, giới hạn 10 dòng gần nhất.
- Hiện: ngày, dịch vụ, giá, trạng thái.

### 6. Lịch sử mua hàng trên POS

- Nút "🧾 Lịch sử mua hàng" cạnh tên khách khi đã chọn khách ở màn hình bán hàng (POS).
- Bấm mở modal: filter khoảng thời gian (date from/to) + loại (checkbox: Hàng hóa / Dịch vụ).
- Danh sách trả về, bấm vào 1 dòng → xem lại chi tiết đơn đó (đơn hàng hoặc phiếu dịch vụ,
  dùng lại view/modal readonly hiện có nếu có sẵn).
- Backend: `GET /api/contacts/{id}/purchase-history?from=&to=&type=orders|services|all`
  — gộp kết quả từ `orders` (join `order_items`) và `pet_service_tickets`, trả unified list
  (date, type, code, total, status).

## Rủi ro / lưu ý kỹ thuật

- Cột mới `send_to_hotel`: cần check trước `ALTER TABLE` có tồn tại chưa (idempotent),
  tránh lỗi khi chạy lại trên DB đã có cột.
- Bỏ field lịch hẹn khỏi form nhưng route backend `PetServiceCreate.appointment_time`
  vẫn còn (Optional, default "") — không cần sửa schema Pydantic, chỉ sửa UI + JS gửi rỗng.
- Nút "Cập nhật đưa đón" cần route PATCH riêng hoặc dùng chung route update ticket hiện có
  (kiểm tra `partners.py` xem đã có PATCH `/api/pet-services/tickets/{id}` chưa trước khi
  thêm route mới — tránh trùng lặp).

## Tiêu chí hoàn thành

- [ ] Zoom +/- hoạt động, lưu qua reload
- [ ] Form tạo phiếu không còn ô lịch hẹn, không bắt chọn hình thức đến
- [ ] Danh sách phiếu có nút sửa đưa đón, hoạt động không ràng buộc trạng thái
- [ ] Checkbox gửi hotel lưu đúng, hiện badge ở danh sách
- [ ] Popup lịch sử spa đúng pet_id, tối đa 10 dòng, disable khi bé mới
- [ ] Nút lịch sử mua hàng ở POS lọc đúng theo thời gian + loại, xem lại được chi tiết đơn
