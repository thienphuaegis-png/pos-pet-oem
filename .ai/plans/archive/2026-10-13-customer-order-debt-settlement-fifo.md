# Customer Order Debt Settlement (Direct & FIFO) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use executing-plans.

**Goal:** Khi thu công nợ khách hàng, cấn trừ trực tiếp vào đơn hàng được chỉ định (hoặc theo FIFO cho các đơn cũ nhất) để hóa đơn giảm nợ / xóa nợ và tự động biến mất khỏi bộ lọc đơn nợ.

**Architecture:**
- Backend: Cập nhật `ContactPayDebt` schema thêm `order_id`. Cập nhật `pay_contact_debt` trong `routers/partners.py`: cấn trừ `orders.debt_amount`, tăng `orders.paid_amount`, ghi nhận `order_payments` cho từng đơn được phân bổ nợ.
- Frontend: Bổ sung input ẩn `pay-debt-order-id` trong `#modal-pay-debt`, truyền `order_id` từ `payDebtFromCurrentOrderView` vào `openPayDebtModal`, gửi `order_id` lên backend, và tự động gọi `loadOrders()` để cập nhật danh sách đơn hàng.

**Tech Stack:** Python 3 (FastAPI, SQLite/PostgreSQL), JavaScript (Vanilla ES6+), pytest.

## File Structure

| File | Responsibility |
|---|---|
| `routers/partners.py:51-57,730-804` | Modify — Bổ sung `order_id` vào `ContactPayDebt`, triển khai logic cấn trừ nợ đơn hàng & FIFO cho khách |
| `templates/index.html:9030-9070` | Modify — Thêm input hidden `pay-debt-order-id` |
| `static/js/modules/contacts.js:410-485` | Modify — Nhận `orderId`, gửi `order_id` lên API và trigger reload đơn hàng |
| `static/js/modules/productions.js:4795-4811` | Modify — Truyền `ord.id` sang `openPayDebtModal` |
| `tests/test_customer_order_debt_settlement.py` | Create — Bộ unit tests kiểm tra cấn trừ đơn đích danh và phân bổ FIFO |

---

### Task 1: Viết Unit Test Fail Trước (TDD Red Phase)

**Files:**
- Create: `tests/test_customer_order_debt_settlement.py`

- [ ] **Step 1: Viết test case thu nợ đơn đích danh (kiểm tra `orders.debt_amount`, `orders.paid_amount`, `order_payments`)**
- [ ] **Step 2: Viết test case thu nợ theo cơ chế FIFO cho nhiều đơn hàng**
- [ ] **Step 3: Chạy test để xác nhận test FAIL (RED): `pytest tests/test_customer_order_debt_settlement.py`**

---

### Task 2: Triển Khai Logic Cấn Trừ Nợ Đơn Hàng Tại Backend

**Files:**
- Modify: `routers/partners.py`

- [ ] **Step 1: Bổ sung `order_id: Optional[int] = None` vào `ContactPayDebt`**
- [ ] **Step 2: Trong nhánh `c["type"] == "customer"` của `pay_contact_debt`, cấn trừ đơn `order_id` (nếu có) và phân bổ số dư theo FIFO cho các đơn `debt_amount > 0`**
- [ ] **Step 3: Ghi nhận bản ghi thanh toán vào `order_payments` cho từng đơn được cấn trừ**
- [ ] **Step 4: Chạy test để xác nhận test PASS (GREEN): `pytest tests/test_customer_order_debt_settlement.py`**

---

### Task 3: Cập Nhật Giao Diện & Đồng Bộ Luồng Frontend

**Files:**
- Modify: `templates/index.html`
- Modify: `static/js/modules/contacts.js`
- Modify: `static/js/modules/productions.js`

- [ ] **Step 1: Thêm `<input type="hidden" id="pay-debt-order-id" value="">` vào `#modal-pay-debt` trong `templates/index.html`**
- [ ] **Step 2: Cập nhật `payDebtFromCurrentOrderView` trong `productions.js` truyền `ord.id`**
- [ ] **Step 3: Cập nhật `openPayDebtModal` và `submitPayDebt` trong `contacts.js` gửi `order_id` và gọi `loadOrders()` làm mới danh sách**
- [ ] **Step 4: Kiểm tra cú pháp bằng Node.js: `node -c static/js/modules/contacts.js && node -c static/js/modules/productions.js`**

---

### Task 4: Kiểm Tra Hồi Quy Toàn Diện & Rebuild Exe

**Files:**
- Test: Chạy toàn bộ test suite liên quan đến nợ và sổ quỹ: `pytest tests/test_customer_order_debt_settlement.py tests/test_cashbook*.py tests/test_pos_order_debt.py`
- Rebuild: Chạy PyInstaller rebuild `dist/POS_Mastercare.exe`
