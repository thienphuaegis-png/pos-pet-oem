# Kế Hoạch Triển Khai: Hiển Thị Số Lượng Thú Cưng Trên Danh Sách Khách Hàng (Spa & Hotel)

## 1. Bối Cảnh & Mục Tiêu
- **Màn hình:** Modal Tiếp Nhận Dịch Vụ Spa (F2) & Khách Sạn Hotel (`svc-customer-dropdown` & `hotel-cust-dropdown`).
- **Nhu cầu:** Khi nhân viên lễ tân gõ tìm khách hàng, dropdown hiển thị số lượng thú cưng của khách và tên các bé (`🐾 3 bé / Misa, Phóc...` hoặc `Chưa có bé`) để dễ nhận diện khách quen và thú cưng của khách.
- **Lựa chọn đã duyệt qua /brainstorming:**
  1. *Kiểu hiển thị:* Badge số lượng + Tên thú cưng (`🐾 3 bé` + `pet_names`).
  2. *Phạm vi áp dụng:* Áp dụng cho **Tiếp Nhận Dịch Vụ Spa & Khách Sạn Hotel**.

---

## 2. Bản Đồ Ánh Xạ Dữ Liệu (Data Mapping)

| Trường hiển thị | Nguồn dữ liệu (Cột / Bảng DB) | File xử lý | Ghi chú |
|---|---|---|---|
| Tên khách hàng | `contacts.name` | `routers/partners.py:175` | Sẵn có |
| SĐT khách | `contacts.phone` | `routers/partners.py:175` | Sẵn có |
| Số lượng bé (`pets_count`) | `COUNT(p.id)` từ bảng `pets` gom theo `customer_id` | `routers/partners.py:206` | Bổ sung truy vấn gom nhóm theo lô `WHERE customer_id IN (...)` cho 30 khách trả về (`<0.5ms`) |
| Tên các bé (`pet_names`) | `GROUP_CONCAT(p.name, ', ')` từ bảng `pets` | `routers/partners.py:206` | Trả về chuỗi tên các bé ngăn cách bằng dấu phẩy (vd: `Misa, Phóc`) |
| Badge trên Droplist Spa | `${c.pets_count ? '🐾 ' + c.pets_count + ' bé' : 'Chưa có bé'}` | `static/js/modules/spa.js:4977` | Nâng cấp thẻ giao diện rõ nét, có tooltip tên đầy đủ |
| Badge trên Droplist Hotel | `${c.pets_count ? '🐾 ' + c.pets_count + ' bé' : 'Chưa có bé'}` | `static/js/modules/hotel.js:564` | Đồng bộ hiển thị giống Spa |

---

## 3. Ma Trận Tác Động Sự Kiện (Event Impact Matrix)

1. **Trigger (UI/Payload):** Gõ tìm kiếm trên ô `svc-customer-search` hoặc `hotel-cust-search` -> gọi `GET /api/contacts?type=customer&compact=1&limit=30&search=...`.
2. **Entity State:** Thao tác đọc (Read-only query), không thay đổi trạng thái entity.
3. **Ledger / Financial (Dòng tiền):** Không tác động sổ quỹ hay thu chi.
4. **Stock / Debt (Dòng hàng / Công nợ):** Không tác động tồn kho hay công nợ.
5. **Hiệu Năng & Endpoint Anh Em:**
   - *Hiệu năng:* Áp dụng Batch Query `WHERE customer_id IN (...) GROUP BY customer_id` cho đúng 30 khách được phân trang, không quét full scan bảng `pets`. Tốc độ API `< 1ms`.
   - *Anh em:* Áp dụng đồng bộ cho cả `spa.js` và `hotel.js`. Giữ nguyên quầy POS theo đúng lựa chọn của anh.

---

## 4. Các Bước Thực Hiện
1. `routers/partners.py`: Nạp `pets_count` và `pet_names` trong nhánh `compact=1 and type == "customer"`.
2. `static/js/modules/spa.js`: Cập nhật template dropdown render badge số lượng + tên bé.
3. `static/js/modules/hotel.js`: Cập nhật template dropdown render badge số lượng + tên bé tương tự.
4. `tests/test_spa_customer_pets_count.py`: Viết bài test tự động xác nhận API `compact=1` trả chuẩn `pets_count` và `pet_names`.
5. Chạy test toàn bộ, cập nhật checkpoint và push git.
