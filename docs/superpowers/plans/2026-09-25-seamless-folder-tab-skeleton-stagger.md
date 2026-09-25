# Seamless Folder Tab, Skeleton Shimmer & Staggered Render Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use subagent-driven-development or executing-plans.

**Goal:** Làm mượt triệt để thao tác chuyển tab, biến tab sidebar thành dạng bìa hồ sơ liền mạch với khu vực nội dung chính, và bổ sung Skeleton Shimmer cùng hiệu ứng thác nước hiện từng dòng dữ liệu.

**Architecture:** Bổ sung CSS animations (.stagger-row, .tab-pane-content, .active-tab folder seamless), tiện ích `renderTableSkeleton()` vào `static/js/app.js`, áp dụng `--row-idx` vào render dòng bảng trong `static/js/modules/spa.js` và `static/js/modules/purchases.js`.

**Tech Stack:** Vanilla JS, CSS3 Keyframes & Variables, Tailwind CSS.

---

### Task 1: CSS & Styling for Seamless Folder Tab and Transitions
**Files:**
- Modify: `templates/index.html` (CSS style block around lines 20-180)
- Test: Verify styles exist and HTML integrity passes with `pytest tests/test_html_integrity.py`

- [ ] **Step 1: Thêm CSS Folder Tab liền mạch (`.active-tab` trùng nền `#f1f5f9`, border-left accent 4px, bỏ viền phải).**
- [ ] **Step 2: Thêm Keyframes `.tab-pane-content` (Fade in + trượt nhẹ 4px).**
- [ ] **Step 3: Thêm Keyframes `.stagger-row` (Waterfall render với `--row-idx`).**
- [ ] **Step 4: Chạy `pytest tests/test_html_integrity.py` kiểm tra toàn vẹn DOM.**

---

### Task 2: Utility Skeleton Shimmer & Smooth Tab Transition in App Shell
**Files:**
- Modify: `static/js/app.js` (`switchTab` & new helper `renderTableSkeleton`)
- Test: Syntax check `node -c static/js/app.js`

- [ ] **Step 1: Viết hàm `renderTableSkeleton(tbody, rows, cols)` sinh markup placeholder xám lướt sóng `animate-pulse`.**
- [ ] **Step 2: Cập nhật `switchTab(tabId)` kích hoạt animation mượt và nạp skeleton placeholder tức thì trước khi gọi API.**
- [ ] **Step 3: Chạy `node -c static/js/app.js` kiểm tra cú pháp.**

---

### Task 3: Staggered Waterfall Rows in Key Modules (Spa & Purchases)
**Files:**
- Modify: `static/js/modules/spa.js` (hàm `renderPetServicesTable`)
- Modify: `static/js/modules/purchases.js` (hàm `renderPurchasesTable`)
- Test: `node tests/test_spa_render.js`

- [ ] **Step 1: Cập nhật `renderPetServicesTable()` gán class `stagger-row` và `style="--row-idx: ${idx};"` vào mỗi `<tr>`.**
- [ ] **Step 2: Cập nhật `renderPurchasesTable()` gán class `stagger-row` và `style="--row-idx: ${idx};"` vào mỗi `<tr>`.**
- [ ] **Step 3: Chạy `node tests/test_spa_render.js` và `pytest` xác nhận toàn bộ 100% test pass.**
