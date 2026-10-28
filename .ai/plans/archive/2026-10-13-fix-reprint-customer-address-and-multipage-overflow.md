# Fix Reprint Customer Address and Multi-Page Printing Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use executing-plans.

**Goal:** Khắc phục lỗi in lại hóa đơn không hiển thị địa chỉ khách hàng và lỗi in hóa đơn lớn (>30 dòng) bị cắt trang / khóa 1 trang trên A4 ngang.

**Architecture:** 
1. Hợp nhất toàn bộ các lệnh in trong `static/js/modules/productions.js` về duy nhất một engine in chuẩn `window.showPrintModal` và `window.renderAndPrint` trong `static/js/pos.js`, bảo toàn trường `dia_chi_khach`.
2. Khắc phục xung đột toạ độ giữa `customer_phone` và `customer_address` trong `database.py` và `pos.js`.
3. Tái cấu trúc hàm `printInvoiceDirectly` và `renderAndPrint` để chuyển các hóa đơn vượt ngưỡng 1 trang (> 18 món trên A4 ngang hoặc > 32 món trên A4 dọc) sang chế độ ngắt trang luồng tự nhiên (Flowable Multi-Page Print), loại bỏ `display: flex` trên body iframe và cho phép Chromium tự động ngắt thành 2-3 trang đẹp mắt với đầy đủ chân trang & chữ ký.

**Tech Stack:** JavaScript (ES6+), CSS Paged Media (`@page`, `break-inside`, `display: table-header-group`), Python 3 / SQLite / FastAPI / pytest.

## File Structure

| File | Responsibility |
|---|---|
| `static/js/modules/productions.js` | Modify — Bỏ duplicate `showPrintModal`/`renderAndPrint`, đồng bộ gọi `window.showPrintModal` và bổ sung `dia_chi_khach` vào `printData` |
| `static/js/pos.js:2620-3400` | Modify — Xử lý tọa độ chống đè chữ địa chỉ/SĐT, tái cấu trúc `printInvoiceDirectly` sang Multi-Page Print không bị khóa flex |
| `database.py:1870-1920` | Modify — Di chuyển tọa độ `elem_addr_...` trong các preset A4 để không đè lên `customer_phone` và dời bảng hàng nếu cần |
| `tests/test_pos_reprint_address_and_multipage.py` | Create — Kiểm thử đơn vị cho mapping địa chỉ, chống đè tọa độ và cấu trúc đa trang khi in |

---

### Task 1: Hợp Nhất Engine In và Trường `dia_chi_khach` trong `productions.js`

**Files:**
- Modify: `static/js/modules/productions.js`

- [ ] **Step 1: Cập nhật các hàm gọi in trong `productions.js` trỏ về `window.showPrintModal`**
- [ ] **Step 2: Đảm bảo `printData` trong `productions.js` (dòng 7786) có `dia_chi_khach` để bảo toàn tính tương thích nếu hàm cũ còn được gọi**
- [ ] **Step 3: Kiểm tra cú pháp bằng Node.js: `node -c static/js/modules/productions.js`**

---

### Task 2: Chống Đè Tọa Độ Địa Chỉ Khách Hàng và SĐT (`pos.js` & `database.py`)

**Files:**
- Modify: `database.py`
- Modify: `static/js/pos.js`

- [ ] **Step 1: Trong `database.py`, sửa hàm init/migration tự động cập nhật tọa độ `customer_address` và `customer_phone` trong preset `preset_1789369697524` và các preset A4**
- [ ] **Step 2: Trong `pos.js` (`renderAndPrint`), tính toán lại vị trí `y` của `customer_address` nếu phát hiện trùng hoặc cách `customer_phone` dưới 14px; tự động đẩy bảng `table_b2b` xuống nếu bị va chạm**
- [ ] **Step 3: Kiểm tra cú pháp bằng Node.js: `node -c static/js/pos.js`**

---

### Task 3: Kích Hoạt Multi-Page Print Trong `printInvoiceDirectly` & `renderAndPrint`

**Files:**
- Modify: `static/js/pos.js`

- [ ] **Step 1: Xóa bỏ `display: flex` trên thẻ `body` của iframe trong `printInvoiceDirectly` (thay bằng `display: block; margin: 0 auto; text-align: center;`)**
- [ ] **Step 2: Gỡ bỏ `page-break-inside: avoid; break-inside: avoid;` trên `.print-inner` và `.print-container` đối với A4/A5 khi đơn hàng vượt quá ngưỡng 1 trang**
- [ ] **Step 3: Đối với đơn dài (> 18 dòng A4 landscape hoặc > 32 dòng A4 portrait), bọc cụm 3 ô chân trang (`b2b_footer_boxes`), 3 chữ ký (`signatures_3col`), và lời cảm ơn vào container chân trang có `page-break-inside: avoid; break-inside: avoid;` để đảm bảo luôn xuất hiện trọn vẹn ở trang cuối cùng mà không bị xén cụt**
- [ ] **Step 4: Kiểm tra cú pháp: `node -c static/js/pos.js`**

---

### Task 4: Viết Unit Test và Kiểm Tra Tự Động

**Files:**
- Create: `tests/test_pos_reprint_address_and_multipage.py`

- [ ] **Step 1: Viết test case kiểm tra mapping `dia_chi_khach` từ contact sang printData**
- [ ] **Step 2: Viết test case kiểm tra CSS multi-page của iframe không chứa `display: flex` trên body**
- [ ] **Step 3: Viết test case kiểm tra không còn hiện tượng trùng đè Y giữa SĐT và địa chỉ**
- [ ] **Step 4: Chạy pytest: `pytest tests/test_pos_reprint_address_and_multipage.py`**
