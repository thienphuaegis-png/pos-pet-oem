# Kế Hoạch Triển Khai: Sửa Logic Trừ Ví Spa — Tách Bạch Tiền Phòng Khách Sạn

> **For agentic workers:** REQUIRED SUB-SKILL: Use subagent-driven-development or executing-plans.

**Goal:** Chặn cấn trừ số dư Ví Spa cho tiền phòng lưu trú khách sạn thú cưng (Pet Hotel) trên cả POS và Hotel Check-out, chỉ cho phép trừ ví cho các dịch vụ Spa/Grooming.

**Architecture:** 
- Phía backend POS (`routers/pos.py`): Lọc loại trừ danh mục khách sạn/lưu trú khi tính hạn mức `t_spa`.
- Phía backend Hotel (`routers/hotel.py`): Cập nhật `get_checkout_summary` và `checkout_hotel_guest` để bóc tách `room_payable` (cấm ví) và `spa_total` (cho phép trừ ví tối đa `min(wallet, spa_total)`), ghi transaction vào `spa_wallet_transactions`.
- Phía frontend: Cập nhật giao diện modal `#modal-hotel-checkout` với cảnh báo rõ ràng và sửa tài liệu hướng dẫn nghiệp vụ tại `templates/index.html`.

**Tech Stack:** FastAPI, SQLite, Pydantic, Tailwind CSS, Pytest.

---

## Danh Sách File Tác Động

| File | Trách nhiệm |
|---|---|
| `schemas.py` | Modify — bổ sung fields `use_spa_wallet`, `spa_wallet_amount` vào `HotelBookingCheckout` |
| `routers/hotel.py` | Modify — bóc tách hạn mức ví trong `get_checkout_summary` & trừ ví dịch vụ trong `checkout_hotel_guest` |
| `routers/pos.py` | Modify — loại trừ dịch vụ phòng/hotel khi tính trần `t_spa` trong `create_order` |
| `templates/index.html` | Modify — cập nhật modal check-out khách sạn và tài liệu phân hệ 4 trong `tab-guide` |
| `static/js/modules/hotel.js` | Modify — tích hợp logic hiển thị và gửi tham số trừ ví cho dịch vụ trong modal checkout |
| `tests/test_spa_wallet_hotel_rules.py` | Create — bộ unit test kiểm thử toàn diện quy tắc ví spa không trừ tiền phòng |

---

## Chi Tiết Các Bước Triển Khai

### Task 1: Cập Nhật Schema & Logic Backend Hotel và POS

**Files:**
- Modify: `schemas.py`
- Modify: `routers/hotel.py`
- Modify: `routers/pos.py`
- Test: `tests/test_spa_wallet_hotel_rules.py`

**Interfaces:**
- Consumes: `HotelBookingCheckout` với `use_spa_wallet: Optional[bool] = False`, `spa_wallet_amount: Optional[float] = 0.0`.
- Produces: `GET /api/hotel/checkout-summary/{id}` trả về `room_payable`, `spa_total`, `max_spa_wallet_deduction`, `allow_wallet_on_room: False`.
- Produces: `POST /api/hotel/checkout/{id}` cấn trừ ví tối đa bằng `spa_total`, cấm trừ tiền phòng.

- [ ] **Step 1: Viết test failing cho quy tắc trừ ví**
  Tạo file `tests/test_spa_wallet_hotel_rules.py` với các test case:
  - Test `test_hotel_checkout_summary_breaks_down_wallet_limits`: Kiểm tra `room_payable`, `spa_total`, `max_spa_wallet_deduction`.
  - Test `test_hotel_checkout_blocks_wallet_deduction_when_no_spa_tickets`: Gửi `use_spa_wallet=True` khi không có dịch vụ spa -> trả 400.
  - Test `test_hotel_checkout_allows_wallet_only_up_to_spa_total`: Gửi `spa_wallet_amount` lớn hơn `spa_total` -> clamp về đúng `spa_total` và trừ đúng số dư.
  - Test `test_pos_order_excludes_hotel_category_from_spa_wallet`: Tạo đơn POS có dịch vụ hotel + dịch vụ spa -> trần trừ ví chỉ tính cho dịch vụ spa.

- [ ] **Step 2: Chạy test để xác nhận FAIL**
  `PYTHONPATH=. pytest tests/test_spa_wallet_hotel_rules.py`

- [ ] **Step 3: Cập nhật `schemas.py`, `routers/hotel.py`, `routers/pos.py`**
  - Trong `schemas.py`: Thêm fields vào `HotelBookingCheckout`.
  - Trong `routers/hotel.py`:
    - `get_checkout_summary`: Bóc tách `room_payable = max(0, room_total - deposit)`, lấy `spa_wallet_balance` của khách, tính `max_spa_wallet_deduction = min(contact_spa_wallet, spa_total)`.
    - `checkout_hotel_guest`: Kiểm tra nếu `spa_wallet_amount > 0`: chặn nếu `spa_total == 0`, clamp về `min(spa_wallet_amount, min(contact_spa_wallet, spa_total))`, trừ ví khách hàng và ghi `spa_wallet_transactions`.
  - Trong `routers/pos.py`:
    - Bỏ qua sản phẩm dịch vụ thuộc nhóm khách sạn (`hotel`, `khách sạn`, `lưu trú`, `phòng`) khi tính `t_spa`.

- [ ] **Step 4: Chạy lại test để xác nhận PASS**
  `PYTHONPATH=. pytest tests/test_spa_wallet_hotel_rules.py`

---

### Task 2: Cập Nhật Giao Diện Modal Check-out Khách Sạn & Tab Hướng Dẫn

**Files:**
- Modify: `templates/index.html`
- Modify: `static/js/modules/hotel.js`

- [ ] **Step 1: Cập nhật văn bản trong Tab Hướng Dẫn Nghiệp Vụ (`tab-guide`)**
  - Sửa dòng trong `guide-sub-wallet`: Quy tắc an toàn dòng tiền: "Ví Spa chỉ được dùng để thanh toán Dịch vụ Spa / Grooming. TUYỆT ĐỐI KHÔNG áp dụng cho tiền phòng Khách Sạn (Pet Hotel) và hàng hóa bán lẻ."

- [ ] **Step 2: Cập nhật markup modal `#modal-hotel-checkout` trong `templates/index.html`**
  - Thêm cảnh báo rõ ràng `🚫 Không áp dụng Ví Spa cho tiền phòng`.
  - Thêm khu vực trừ Ví Spa cho dịch vụ kèm theo nếu khách có ví và có dịch vụ Spa.

- [ ] **Step 3: Cập nhật `static/js/modules/hotel.js`**
  - Đọc `max_spa_wallet_deduction` từ `checkout-summary`.
  - Hiển thị hoặc ẩn ô chọn trừ ví Spa tùy thuộc vào `summary.spa_total > 0` và số dư ví.
  - Gửi `use_spa_wallet` và `spa_wallet_amount` khi gọi `POST /api/hotel/checkout/{id}`.

- [ ] **Step 4: Kiểm thử toàn vẹn giao diện & suite test**
  `PYTHONPATH=. pytest tests/test_html_integrity.py tests/test_checkpoint_integrity.py tests/test_hotel_system.py tests/test_spa_wallet_hotel_rules.py`
