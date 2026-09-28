# Kế Hoạch Triển Khai: Tiếp Nhận Hotel Hàng Loạt & Mẫu In K80 (Pet Hotel Batch Intake & K80 Print)

> **For agentic workers:** REQUIRED SUB-SKILL: Use subagent-driven-development or executing-plans.

**Goal:** Triển khai quy trình Check-in phân hệ Khách Sạn Thú Cưng hỗ trợ tiếp nhận hàng loạt nhiều bé vào các buồng phòng khác nhau, combobox tìm kiếm khách hàng đa từ, droplist bé thông minh, và mẫu in nhiệt K80 có 2 chữ ký cam kết.

**Architecture:** Mở rộng bảng `hotel_bookings` trong SQLite với các trường nghiệp vụ; bổ sung REST API `POST /api/hotel/checkin-batch`; nâng cấp UI modal check-in với combobox tìm khách + bảng phân bổ bé; bổ sung generator HTML in nhiệt K80 cho phiếu nhận Hotel.

**Tech Stack:** Python 3.11 / FastAPI / SQLite / TailwindCSS / Vanilla JavaScript (ES6 Modules).

## Global Constraints
- Tuân thủ kiểu dáng và quy tắc in K80 của hệ thống (chiều rộng tối đa 72-80mm, font monospace, 2 chữ ký song song).
- Không phá vỡ dữ liệu `hotel_rooms` và `hotel_bookings` hiện có trong `data/pos.db`.
- Tự động lọc combobox khách hàng fuzzy không phân biệt thứ tự từ.

---

### Task 1: Mở rộng Database Schema & Pydantic Validation

**Files:**
- Modify: `database.py`
- Modify: `schemas.py`
- Test: `tests/test_hotel_system.py`

**Interfaces:**
- `schemas.HotelBatchCheckinItem`: `room_id`, `pet_id`, `pet_name`, `pet_weight`, `daily_rate`, `health_condition`, `feeding_notes`, `items_brought`
- `schemas.HotelBatchCheckinRequest`: `contact_id`, `check_in_time`, `expected_checkout_time`, `deposit_amount`, `items: list[HotelBatchCheckinItem]`

- [ ] **Step 1: Write the failing test**
- [ ] **Step 2: Run test to verify it fails**
- [ ] **Step 3: Write minimal implementation**
- [ ] **Step 4: Run test to verify it passes**
- [ ] **Step 5: Commit/Checkpoint**

---

### Task 2: Triển khai API Tiếp Nhận Hàng Loạt `POST /api/hotel/checkin-batch`

**Files:**
- Modify: `routers/hotel.py`
- Test: `tests/test_hotel_system.py`

**Interfaces:**
- Endpoint: `POST /api/hotel/checkin-batch`
- Input: `HotelBatchCheckinRequest`
- Output: `{"success": true, "batch_code": "HTB-YYMMDD-XXX", "count": 2, "bookings": [...]}`

- [ ] **Step 1: Write the failing test**
- [ ] **Step 2: Run test to verify it fails**
- [ ] **Step 3: Write minimal implementation**
- [ ] **Step 4: Run test to verify it passes**
- [ ] **Step 5: Commit/Checkpoint**

---

### Task 3: Triển khai Mẫu In Phiếu Tiếp Nhận Hotel K80

**Files:**
- Modify: `static/js/modules/hotel.js`
- Test: `tests/test_hotel_system.py`

**Interfaces:**
- Function: `generateHotelIntakeTicketHtml(batchOrBooking, shopInfo)`
- Function: `printHotelIntakeTicketDirectly(batchCodeOrBookingId)`
- Output: HTML in nhiệt 80mm có tiêu đề, chi tiết từng bé, tiền cọc, điều khoản cam kết, 2 chữ ký.

- [ ] **Step 1: Write the failing test**
- [ ] **Step 2: Run test to verify it fails**
- [ ] **Step 3: Write minimal implementation**
- [ ] **Step 4: Run test to verify it passes**
- [ ] **Step 5: Commit/Checkpoint**

---

### Task 4: Nâng cấp Modal Check-in Hàng Loạt & Droplist Khách/Bé

**Files:**
- Modify: `templates/index.html`
- Modify: `static/js/modules/hotel.js`
- Test: `tests/test_hotel_system.py`

**Interfaces:**
- `#hotel-cust-search`, `#hotel-cust-dropdown`
- `#tbody-hotel-batch-pets` (bảng dòng thêm/xóa bé và chọn phòng trống)
- Function: `onHotelCustSearchInput(query)`
- Function: `selectHotelCust(contactId)`
- Function: `addHotelBatchPetRow()`
- Function: `submitHotelBatchCheckin(andPrint)`

- [ ] **Step 1: Write the failing test**
- [ ] **Step 2: Run test to verify it fails**
- [ ] **Step 3: Write minimal implementation**
- [ ] **Step 4: Run test to verify it passes**
- [ ] **Step 5: Commit/Checkpoint**
