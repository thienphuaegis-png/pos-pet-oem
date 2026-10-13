# Cấu hình in địa chỉ khách hàng & Xử lý in đơn hàng lớn A4 nhiều dòng

> **For agentic workers:** REQUIRED SUB-SKILL: Use subagent-driven-development or executing-plans.

**Goal:** Thêm tuỳ chọn in địa chỉ khách hàng trong mẫu in POS và khắc phục triệt để lỗi mất chân trang / trắng trang đối với đơn hàng lớn (>30 mặt hàng) trên khổ A4.

**Architecture:** 
- Backend `routers/pos.py`: Bổ sung `customer_address` vào API chi tiết đơn hàng `/api/orders/{code}`.
- Cài đặt mẫu in `templates/index.html` & `static/js/modules/productions.js`: Thêm checkbox và phần tử cấu hình `customer_address` (`Địa chỉ: {{dia_chi_khach}}`).
- Quản lý in POS `static/js/pos.js`: Bổ sung placeholder `dia_chi_khach`, khắc phục tính toán `deltaY` theo chiều cao DOM thực tế, scale vừa 1 trang nếu gần ngưỡng, và hỗ trợ ngắt trang chuẩn CSS Print không bị cắt cụt bởi `overflow: hidden`.

**Tech Stack:** JavaScript (ES6), HTML/CSS (CSS Paged Media, flex/grid), Python/FastAPI, Pytest.

---

### Task 1: Bổ sung trường `customer_address` vào API `routers/pos.py` & Test TDD

**Files:**
- Modify: `routers/pos.py:331-337`
- Test: `tests/test_pos_customer_address_and_large_order_print.py`

- [ ] **Step 1: Viết test kiểm tra API `/api/orders/{code}` trả về `customer_address`**
- [ ] **Step 2: Chạy test để xác nhận test fail**
- [ ] **Step 3: Cập nhật câu lệnh SQL trong `get_order_detail` lấy thêm `c.address as customer_address`**
- [ ] **Step 4: Chạy test để xác nhận test pass**

---

### Task 2: Thêm cấu hình 'Địa chỉ khách hàng' vào Cài đặt mẫu in (`templates/index.html` & `productions.js`)

**Files:**
- Modify: `templates/index.html:8175-8180`
- Modify: `static/js/modules/productions.js:5570-5580, 6408-6420`
- Test: `tests/test_pos_customer_address_and_large_order_print.py`

- [ ] **Step 1: Viết test kiểm tra UI có checkbox `chk-customer_address` và JS catalog có `customer_address`**
- [ ] **Step 2: Thêm checkbox `chk-customer_address` vào `templates/index.html`**
- [ ] **Step 3: Khai báo `customer_address` trong `defaultElementCatalog` và danh sách keys trong `productions.js`**
- [ ] **Step 4: Chạy test kiểm tra tính hợp lệ**

---

### Task 3: Cập nhật logic render hóa đơn, map địa chỉ và sửa lỗi mất chân trang đơn hàng lớn (`pos.js`)

**Files:**
- Modify: `static/js/pos.js:2505-2530` (đơn tạm tính lưu `customer_address`), `pos.js:2620-2640` (map `dia_chi_khach`), `pos.js:2710-2795` (tính deltaY chính xác và an toàn), `pos.js:3110-3135` (dịch chuyển chân trang an toàn), `pos.js:3210-3340` (chuẩn CSS print không cắt mất footer với tài liệu dài).
- Test: `tests/test_pos_customer_address_and_large_order_print.py`

- [ ] **Step 1: Viết test kiểm tra các hàm xử lý placeholder `dia_chi_khach` và logic auto-scale/multi-page print**
- [ ] **Step 2: Map `dia_chi_khach` từ dữ liệu đơn hàng vào `printData` trong `pos.js`**
- [ ] **Step 3: Khắc phục `deltaY` và cơ chế co giãn footer theo DOM thực tế trong `renderAndPrint`**
- [ ] **Step 4: Điều chỉnh CSS iframe print để cho phép ngắt trang tự nhiên khi vượt quá 1 trang, không bị xén bởi `overflow: hidden`**
- [ ] **Step 5: Chạy toàn bộ test suites liên quan đến in ấn để nghiệm thu**
