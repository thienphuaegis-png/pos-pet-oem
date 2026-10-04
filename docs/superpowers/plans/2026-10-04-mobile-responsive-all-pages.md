# Mobile Responsive All Pages Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use subagent-driven-development or executing-plans.

**Goal:** Tối ưu hóa toàn bộ trang quản trị `templates/index.html` cho thiết bị di động với Bottom Bar 5 nút, Off-canvas Sidebar drawer, và CSS responsive chống tràn bảng/modal.

**Architecture:** Sử dụng Tailwind responsive + scoped CSS rules. Sidebar tự ẩn trên mobile và biến thành drawer trượt trái khi mở Menu. Thêm `#mobile-main-bottom-nav` cố định đáy với 5 nút điều hướng chính. Modals và Tables tự động thích ứng với viewport hẹp.

**Tech Stack:** HTML5, Tailwind CSS, Vanilla JS.

---

## File Structure

| File | Responsibility |
|---|---|
| `templates/index.html` | Thêm `#mobile-main-bottom-nav`, backdrop `#mobile-sidebar-backdrop`, bọc responsive cho `#main-sidebar`, thêm CSS toàn cục cho modal và bảng di động. |
| `static/js/app.js` | Thêm hàm `toggleMobileSidebar(show)` và hook `syncMobileBottomNav(tab)` khi chuyển tab. |
| `tests/test_mobile_all_pages_responsive.py` | Kiểm thử unit/DOM cho các thành phần mobile của toàn hệ thống. |

---

## Tasks

### Task 1: Mobile Bottom Navigation Bar & Off-canvas Sidebar
- [ ] Thêm thanh `#mobile-main-bottom-nav` 5 nút vào `templates/index.html`.
- [ ] Thêm `#mobile-sidebar-backdrop` và các class responsive cho `#main-sidebar` (`hidden md:flex fixed md:relative`).
- [ ] Thêm hàm `toggleMobileSidebar(show)` và nút đóng drawer.

### Task 2: Global CSS Responsive cho Bảng và Modal
- [ ] Thiết lập CSS cho `@media (max-width: 768px)`:
  - Tất cả modal: `max-width: calc(100vw - 16px) !important; max-height: 90vh !important;`.
  - Nội dung cuộn chính: thêm khoảng trống đáy `padding-bottom: 4.5rem`.
  - Cuộn ngang cho các thẻ chứa bảng: `-webkit-overflow-scrolling: touch;`.

### Task 3: Đồng bộ trạng thái Tab và Kiểm thử tự động
- [ ] Khi chuyển tab bằng `switchTab(tab)`, tự động đổi màu active cho icon tương ứng trên Bottom Bar và tự đóng Sidebar drawer trên mobile.
- [ ] Viết test `tests/test_mobile_all_pages_responsive.py` và chạy xác nhận toàn bộ test PASS.
