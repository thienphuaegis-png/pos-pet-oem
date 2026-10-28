# K80 Invoice Discount Display Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use subagent-driven-development or executing-plans.

**Goal:** Hiển thị chiết khấu / giảm giá trên hóa đơn cuộn nhiệt K80 ở cả 2 cấp độ: chiết khấu từng món (giá gốc gạch ngang bên dưới giá mới ở cột Đơn giá) và tổng giảm giá hóa đơn ở chân trang (tự ẩn nếu 0đ).

**Architecture:** 
1. Backend (`routers/pos.py`): Endpoint `GET /api/orders/{code}` bổ sung `p.sell_price AS original_price` vào dữ liệu item.
2. Frontend POS Print (`static/js/pos.js`): Cập nhật `renderAndPrint` và `printDraftOrder` để hiển thị giá mới + giá gốc gạch ngang ở cột Đơn giá và hiển thị/ẩn dòng Giảm giá ở chân trang.
3. Frontend Canvas Builder (`static/js/app.js`): Bổ sung phần tử giảm giá vào preset mẫu K80 mặc định và hiển thị mẫu giảm giá trực quan trong canvas preview.

**Tech Stack:** Python (FastAPI, SQLite), JavaScript (ES6, Native DOM), Pytest.

---

## File Structure

| File | Responsibility |
|---|---|
| `routers/pos.py:86-93` | Modify: Bổ sung `p.sell_price AS original_price` trong SQL query chi tiết hóa đơn |
| `static/js/pos.js:1630-1920` | Modify: Xử lý cột Đơn giá 2 dòng khi có giảm giá và xử lý dòng giảm giá chân trang trong `renderAndPrint` + `printDraftOrder` |
| `static/js/app.js:7404-7625` | Modify: Thêm dòng giảm giá vào preset K80 và render preview có gạch giá gốc trong Canvas |
| `tests/test_k80_discount.py` | Create: Test tự động kiểm tra API order item original_price và logic hiển thị hóa đơn |

---

### Task 1: Backend API - Bổ sung `original_price` cho Order Items

**Files:**
- Modify: `routers/pos.py`
- Test: `tests/test_k80_discount.py`

**Interfaces:**
- `GET /api/orders/{code}` trả về `items: [{ ..., "price": 100000, "original_price": 120000 }]`

- [ ] **Step 1: Viết test failing `tests/test_k80_discount.py`**
- [ ] **Step 2: Chạy test để xác nhận fail**
- [ ] **Step 3: Cập nhật SQL query trong `routers/pos.py`**
- [ ] **Step 4: Chạy test để xác nhận pass**

---

### Task 2: Frontend POS Print - Cột Đơn Giá 2 Dòng & Chân Trang K80

**Files:**
- Modify: `static/js/pos.js`
- Test: `tests/test_k80_discount.py` (kiểm tra cú pháp JS + logic HTML render)

- [ ] **Step 1: Cập nhật `printDraftOrder` trong `static/js/pos.js` để truyền `original_price` từ `tab.cart`**
- [ ] **Step 2: Cập nhật `renderAndPrint` trong `static/js/pos.js`**:
  - Cột Đơn giá: nếu `it.original_price && it.original_price > it.price`, render:
    ```html
    <div style="font-weight: bold;">${formatMoney(it.price)}</div>
    <div style="text-decoration: line-through; color: #777; font-size: 9px;">${formatMoney(it.original_price)}</div>
    ```
  - Chân trang: nếu element text là `{{giam_gia}}` hoặc chứa `giam_gia`: nếu `ord.discount <= 0`, ẩn hoặc để rỗng text.
- [ ] **Step 3: Kiểm tra cú pháp JS: `node -c static/js/pos.js`**

---

### Task 3: Visual Template Canvas - Preset K80 & Preview

**Files:**
- Modify: `static/js/app.js`

- [ ] **Step 1: Cập nhật `getInitialElementsForSize('K80')` trong `static/js/app.js`**:
  - Thêm phần tử `Giảm giá: {{giam_gia}}` giữa `Tổng tiền` và `KHÁCH TRẢ`.
- [ ] **Step 2: Cập nhật `renderCanvas` trong `static/js/app.js`**:
  - Demo bảng hàng hóa K80 hiển thị giá mới `100.000 đ` và giá gốc gạch ngang `120.000 đ`.
  - Hiển thị demo giảm giá `20.000 đ` ở chân trang.
- [ ] **Step 3: Kiểm tra cú pháp JS: `node -c static/js/app.js`**

---

### Task 4: Chạy Toàn Bộ Verification Suite

- [ ] **Step 1: Chạy `pytest tests/test_k80_discount.py -v`**
- [ ] **Step 2: Chạy kiểm tra toàn vẹn DOM và cú pháp JS**
- [ ] **Step 3: Cập nhật `PROJECT_STATE.md`**
