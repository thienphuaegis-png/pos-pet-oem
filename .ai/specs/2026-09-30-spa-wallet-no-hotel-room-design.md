# Thiết Kế Nghiệp Vụ: Quy Tắc Trừ Ví Spa — Tuyệt Đối Không Áp Dụng Cho Tiền Phòng Khách Sạn

**Mục tiêu:** Đảm bảo số dư Ví Spa (Prepaid Spa Wallet) chỉ được dùng cấn trừ cho các dịch vụ Spa/Grooming. Tuyệt đối không được áp dụng cấn trừ cho tiền phòng lưu trú khách sạn thú cưng (Pet Hotel) và hàng hóa bán lẻ tồn kho.

---

## 1. Nguyên Tắc Nghiệp Vụ Cốt Lõi (Business Invariant)

1. **Ví Spa là Ví Dịch Vụ Chăm Sóc:**
   - Khách nạp tiền vào Ví Spa thường được hưởng ưu đãi/tặng thêm giá trị (ví dụ: Nạp 2.000.000đ tặng 300.000đ vào ví).
   - Mục đích tạo ví là để giữ chân khách hàng sử dụng dịch vụ định kỳ (Tắm, Cắt tỉa, Vệ sinh).
2. **Quy Tắc Tách Bạch Dòng Tiền:**
   - **Được phép trừ ví:** Các dịch vụ Spa / Grooming / Tắm sấy / Nhuộm lông (`type == 'service'` và không thuộc nhóm phòng lưu trú).
   - **CẤM trừ ví:**
     - **Tiền phòng Khách sạn (Pet Hotel):** Chi phí lưu trú tính theo ngày/đêm phòng.
     - **Hàng hóa bán lẻ:** Thức ăn, phụ kiện, cát vệ sinh, thuốc men tồn kho (`type == 'product'`).
3. **Khi Check-out Khách Sạn Có Dịch Vụ Spa Kèm Theo:**
   - Tổng thanh toán được tách thành 2 khoản:
     - `Khoản 1 (Tiền phòng còn lại)` = `Tiền phòng - Tiền cọc`. Khoản này **bắt buộc thanh toán bằng Tiền mặt / Chuyển khoản**, cấm cấn trừ ví Spa.
     - `Khoản 2 (Dịch vụ Spa kèm theo)` = `spa_total`. Khoản này **được phép cấn trừ ví Spa**, tối đa bằng `min(spa_wallet_balance, spa_total)`.
   - Nếu khách không sử dụng dịch vụ Spa nào trong kỳ lưu trú (`spa_total == 0`), hạn mức trừ ví = 0đ.

---

## 2. Thiết Kế Kỹ Thuật Chi Tiết

### 2.1 Backend: `routers/hotel.py`
1. **API `GET /api/hotel/checkout-summary/{booking_id}`:**
   - Truy vấn thông tin khách hàng sở hữu phiếu lưu trú: lấy `spa_wallet_balance`.
   - Tính toán:
     - `room_payable = max(0, room_total - deposit)`
     - `spa_total = sum(ticket.price)` của các vé Spa có `hotel_booking_id = booking_id`.
     - `contact_spa_wallet = float(contact.spa_wallet_balance or 0)`
     - `max_spa_wallet_deduction = min(contact_spa_wallet, spa_total)`
   - Trả về JSON bổ sung các trường:
     - `room_payable`: Tiền phòng thực thu sau cọc.
     - `contact_spa_wallet`: Số dư ví Spa hiện tại của khách.
     - `max_spa_wallet_deduction`: Hạn mức tối đa được phép trừ ví cho đợt check-out này.
     - `allow_wallet_on_room: False`: Khẳng định quy tắc không áp dụng ví cho phòng.

2. **API `POST /api/hotel/checkout/{booking_id}`:**
   - Body nhận: `use_spa_wallet: bool = False`, `spa_wallet_amount: float = 0.0`.
   - Kiểm tra và ràng buộc nghiệp vụ:
     - Lấy `spa_total` từ các vé Spa liên kết.
     - Nếu `spa_wallet_amount > 0`:
       - Nếu `spa_total == 0`: Raise HTTP 400: `"Ví Spa chỉ áp dụng cho dịch vụ Spa, không áp dụng cấn trừ tiền phòng khách sạn"`.
       - Ràng buộc: `wallet_deduction = min(spa_wallet_amount, min(contact_spa_wallet, spa_total))`.
       - Trừ ví trong bảng `contacts` (`spa_wallet_balance = spa_wallet_balance - wallet_deduction`).
       - Ghi lịch sử vào bảng `spa_wallet_transactions`:
         - `type = 'spend'`
         - `amount = wallet_deduction`
         - `note = 'Trừ ví dịch vụ Spa kèm lưu trú phòng {room_code} (Phiếu {booking_code})'`
       - Cập nhật trạng thái các vé Spa liên kết sang `done`/`completed` và ghi nhận `spa_wallet_deduction`.
     - Tính tiền thực thu tại quầy:
       - `amount_to_pay = room_payable + (spa_total - wallet_deduction)`.

### 2.2 Backend: `routers/pos.py`
- Khi tạo đơn bán hàng POS (`create_order`):
  - Lọc loại trừ sản phẩm dịch vụ thuộc nhóm khách sạn khỏi trần `t_spa`:
    ```python
    cur.execute("SELECT type, category FROM products WHERE id = ?", (item.product_id,))
    p_row = cur.fetchone()
    if p_row and p_row["type"] == "service":
        cat = (p_row["category"] or "").lower()
        if not any(k in cat for k in ["hotel", "khách sạn", "khach san", "lưu trú", "luu tru", "phòng", "phong"]):
            t_spa += (item.quantity * item.price)
    ```

### 2.3 Frontend & UI
1. **Modal Check-out Hotel (`templates/index.html` & `static/js/modules/hotel.js`):**
   - Phân định rõ 2 khu vực:
     - **Tiền phòng:** Hiển thị rõ số ngày x đơn giá - tiền cọc. Kèm badge màu đỏ: `🚫 Không áp dụng Ví Spa cho tiền phòng`.
     - **Dịch vụ Spa kèm theo:** Hiển thị danh sách vé Spa, tổng tiền Spa.
     - Nếu khách có số dư ví Spa > 0 và có dịch vụ Spa (`spa_total > 0`):
       - Hiển thị checkbox: `[x] Trừ Ví Spa (Số dư: {bal} đ, trừ tối đa {max_deduct} đ)`.
       - Ô nhập số tiền muốn trừ (mặc định = max_deduct, giới hạn không cho nhập quá max_deduct).
     - Tổng thực thu tại quầy = `Tiền phòng còn lại + (Tiền Spa - Trừ ví Spa)`.
2. **Tab Hướng Dẫn Nghiệp Vụ (`templates/index.html`):**
   - Cập nhật mục 2 tại Phân hệ 4:
     - Ghi rõ: *"Ví Spa chỉ được dùng để thanh toán Dịch vụ Spa / Grooming. TUYỆT ĐỐI KHÔNG áp dụng cho tiền phòng Khách Sạn (Pet Hotel) và hàng hóa bán lẻ."*
