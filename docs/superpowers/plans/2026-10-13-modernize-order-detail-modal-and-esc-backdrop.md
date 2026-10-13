# Modernize Order Detail Modal & ESC/Backdrop Close Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use executing-plans.

**Goal:** Hiện đại hóa giao diện modal Chi Tiết Hóa Đơn (`#modal-order-view`), loại bỏ nút "Đóng" ở chân trang, kích hoạt đóng khi bấm ESC và khi click ra backdrop bên ngoài.

**Architecture:**
- HTML (`templates/index.html`): Cập nhật `#modal-order-view` sang layout 740px bo góc `rounded-2xl`, thêm `onclick` backdrop close, xóa nút "Đóng", bổ sung badge trạng thái thanh toán trên header.
- JavaScript (`static/js/app.js`): Thêm `modal-order-view` vào danh sách `activeModals` của sự kiện phím `Escape`.
- JavaScript (`static/js/modules/productions.js`): Cập nhật logic `viewOrderDetailModal` để nạp dữ liệu vào badge trạng thái và giao diện mới.
- Test (`tests/test_order_detail_modal_ui.py`): Unit test kiểm tra sự hiện diện của backdrop click, phím ESC, và loại bỏ nút "Đóng" thừa.

## File Structure

| File | Responsibility |
|---|---|
| `templates/index.html:6680-6790` | Modify — Tái cấu trúc giao diện `#modal-order-view` theo demo |
| `static/js/app.js:4428-4450` | Modify — Bổ sung `modal-order-view` vào `activeModals` ESC handler |
| `static/js/modules/productions.js:4680-4780` | Modify — Cập nhật `viewOrderDetailModal` đồng bộ badge thanh toán |
| `tests/test_order_detail_modal_ui.py` | Create — Unit test xác thực cấu trúc UI, backdrop click, và ESC handler |

---

### Task 1: Viết Unit Test Xác Thực Giao Diện & Thao Tác Đóng

**Files:**
- Create: `tests/test_order_detail_modal_ui.py`

- [ ] **Step 1: Viết test case kiểm tra backdrop click `onclick="if(event.target === this) closeModalOrderView()"` trên `#modal-order-view`**
- [ ] **Step 2: Viết test case kiểm tra `modal-order-view` có mặt trong `activeModals` của `static/js/app.js`**
- [ ] **Step 3: Viết test case kiểm tra không còn nút "Đóng" ở footer của `#modal-order-view`**
- [ ] **Step 4: Chạy test để xác nhận test FAIL (RED): `pytest tests/test_order_detail_modal_ui.py`**

---

### Task 2: Cập Nhật Layout Modal Trong `templates/index.html`

**Files:**
- Modify: `templates/index.html`

- [ ] **Step 1: Thêm `onclick="if(event.target === this) closeModalOrderView()"` vào thẻ cha `#modal-order-view`**
- [ ] **Step 2: Cập nhật container `w-[740px] max-w-full rounded-2xl`**
- [ ] **Step 3: Cập nhật Header với icon hóa đơn, badge mã đơn, badge trạng thái `#view-order-status-badge`, nút `✕` tròn góc phải**
- [ ] **Step 4: Cập nhật khối tài chính 2 cột tinh gọn và xóa nút "Đóng" ở footer**

---

### Task 3: Kích Hoạt Phím ESC Trong `static/js/app.js` & Cập Nhật Render `productions.js`

**Files:**
- Modify: `static/js/app.js`
- Modify: `static/js/modules/productions.js`

- [ ] **Step 1: Thêm `'modal-order-view'` vào `activeModals` trong `static/js/app.js`**
- [ ] **Step 2: Cập nhật `viewOrderDetailModal` trong `productions.js` để hiển thị badge trạng thái nợ/đủ**
- [ ] **Step 3: Kiểm tra cú pháp bằng Node.js: `node -c static/js/app.js && node -c static/js/modules/productions.js`**
- [ ] **Step 4: Chạy pytest: `pytest tests/test_order_detail_modal_ui.py` để xác nhận PASS (GREEN)**
