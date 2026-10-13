# Kế Hoạch Triển Khai: Tự Động Địa Chỉ Khách & Đa Trang Hóa Đơn A4 Ngang

> **Goal:** Tự động hiển thị địa chỉ khách hàng trên mọi mẫu A4 khi khách có địa chỉ mà không cần vào cài đặt sửa mẫu, đồng thời hỗ trợ xem trước và in đa trang trọn vẹn cho A4 ngang.

**Tech Stack:** JavaScript (ES6), HTML/CSS (Paged Media), SQLite, Pytest.

---

### Task 1: Bổ sung thuộc tính `address` vào `selectCustomerForActiveTab` & Test
**Files:**
- Modify: `static/js/pos.js:1105-1118`
- Test: `tests/test_pos_auto_customer_address.py`

- [ ] **Step 1: Viết test kiểm tra `selectCustomerForActiveTab` gán `address` vào `tab.customer`**
- [ ] **Step 2: Thêm `address: cust.address || ''` vào `tab.customer` trong `static/js/pos.js`**
- [ ] **Step 3: Chạy test xác nhận pass**

---

### Task 2: Tự động chèn khối `customer_address` nếu preset thiếu và khách có địa chỉ
**Files:**
- Modify: `static/js/pos.js:2645-2710`
- Modify: `database.py` (hoặc script migrate tự chèn vào các preset A4 hiện có)
- Test: `tests/test_pos_auto_customer_address.py`

- [ ] **Step 1: Viết test kiểm tra preset thiếu `customer_address` tự động được bổ sung khi render nếu khách có địa chỉ**
- [ ] **Step 2: Trong `renderAndPrint`, nếu `effectiveElements` thiếu `customer_address` mà `printData.dia_chi_khach` có giá trị -> tự động inject element ngay dưới `customer`**
- [ ] **Step 3: Chạy script migrate cập nhật `print_blocks_config` trong `data/pos.db`**
- [ ] **Step 4: Chạy test xác nhận pass**

---

### Task 3: Cho phép cuộn xem trước đầy đủ và in đa trang cho A4 ngang nhiều dòng
**Files:**
- Modify: `static/js/pos.js:2850-2865`
- Modify: `static/js/pos.js:3325-3345`
- Test: `tests/test_pos_auto_customer_address.py`

- [ ] **Step 1: Viết test kiểm tra preview modal không đặt `overflow: hidden` làm mất dòng 22+ và chân trang**
- [ ] **Step 2: Cập nhật CSS của `.print-inner` và `.print-container` trong `renderAndPrint`**
- [ ] **Step 3: Cập nhật điều kiện scale Iframe trong `printInvoiceDirectly` cho A4-landscape**
- [ ] **Step 4: Chạy toàn bộ test suites và kiểm tra thực tế**
