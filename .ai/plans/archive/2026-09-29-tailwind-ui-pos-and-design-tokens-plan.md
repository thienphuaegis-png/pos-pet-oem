# Plan: Tailwind UI Design Tokens & POS Screen Modernization

> **For agentic workers:** REQUIRED SUB-SKILL: Use executing-plans.

**Goal:** Thêm bộ Design Tokens Tailwind UI vào CSS toàn cục, nâng cấp thanh Sidebar Footer và toàn bộ màn hình POS Bán hàng sang chuẩn Tailwind UI với Lucide Vector Icons, đảm bảo 100% offline.

**Tech Stack:** HTML5, Tailwind CSS, Inline SVG (Lucide icon set), Vanilla JS.

## Tasks

### Task 1: Bổ sung CSS Design Tokens vào `templates/index.html`
- File: `templates/index.html` (trong thẻ `<style>`)
- Thêm các class tiện ích: `.tui-card`, `.tui-input`, `.tui-btn-primary`, `.tui-btn-secondary`, `.tui-badge`.

### Task 2: Thay thế Emoji bằng Lucide Icons ở Sidebar Footer trong `templates/index.html`
- File: `templates/index.html:750-770`
- Thay icon Mở ca (Play SVG), Kết ca (Square SVG), Đếm tiền (Calculator SVG), Đăng xuất (Log-out SVG).

### Task 3: Nâng cấp POS Top Bar & Main Layout trong `templates/index.html`
- File: `templates/index.html:785-1060`
- Thay toàn bộ emoji ở Header POS, Khối tìm kiếm hàng hóa, Mẫu in, Nhân viên, Nút hóa đơn.
- Thay emoji ở Khối khách hàng, Khối thanh toán, Nút in tạm tính, Nút thanh toán F9.
- Áp dụng các class viền mỏng ring-inset, shadow mờ chuẩn Tailwind UI.

### Task 4: Nâng cấp Row giỏ hàng & Giỏ hàng trống trong `static/js/pos.js`
- File: `static/js/pos.js:580-606`
- Thay emoji giỏ hàng rỗng `🛒` bằng Lucide SVG.
- Thay nút xóa dòng `🗑️` bằng Lucide trash SVG.

### Task 5: Kiểm tra và Verification
- Chạy unit tests: `DATABASE_URL="" pytest tests/test_html_integrity.py`
- Kiểm tra tính toàn vẹn của DOM và không có lỗi Javascript syntax.
- Commit và push git.
