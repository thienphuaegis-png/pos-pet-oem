# Implementation Plan: Đồng Bộ Giao Diện Hộp Thoại Xác Nhận Hủy Hóa Đơn

> **For agentic workers:** REQUIRED SUB-SKILL: Use subagent-driven-development or executing-plans.

**Goal:** Thay thế hoàn toàn popup `confirm()` và `alert()` mặc định của trình duyệt khi xóa/hủy hóa đơn bằng `window.showConfirmModal` và `window.showToast` chuẩn Design System của POS Mastercare.

**Architecture:** Cập nhật hàm `deleteOrder` trong `static/js/modules/productions.js` và `closeInvoiceTab` trong `static/js/pos.js`, bump cache, đồng bộ sang `C:\POS`, re-build `POS_Mastercare.exe`.

**Tech Stack:** JavaScript ES6, Tailwind CSS, Playwright.

---

### Task 1: Thay thế `confirm()` trong `productions.js` & `pos.js`
**Files:**
- Modify: `static/js/modules/productions.js:3940-3965`
- Modify: `static/js/pos.js:472`
- Modify: `templates/index.html` (bump cache `productions.js?v=20261007_04`)

- [ ] **Step 1: Cập nhật hàm `deleteOrder(code)` trong `productions.js` gọi `window.showConfirmModal`**
  - Icon: 🗑️, type: 'danger'
  - Title: `Xác nhận HỦY HÓA ĐƠN: ${code}`
  - Message: `Bạn có chắc chắn muốn hủy hóa đơn này không? Toàn bộ hàng hóa, kho BOM, tiền ví Spa và điểm tích lũy sẽ được hoàn tác.`
  - SubMessage: chi tiết các mục hoàn kho, hoàn tiền, thu hồi điểm, xóa sổ quỹ.
  - Sau khi xóa thành công: gọi `showToast` thay cho `alert`.
- [ ] **Step 2: Cập nhật đóng tab hóa đơn trong `pos.js` dùng `window.showConfirmModal`**
- [ ] **Step 3: Bump cache version trong `templates/index.html`**

---

### Task 2: Verify giao diện Modal bằng Playwright screenshot
**Files:**
- Test HTML script với `showConfirmModal`

- [ ] **Step 1: Tạo kịch bản Playwright kích hoạt modal và chụp ảnh màn hình**
- [ ] **Step 2: Dùng `vision_analyze` kiểm tra độ đẹp, chuyên nghiệp, không còn popup browser xám**

---

### Task 3: Đồng bộ sang `C:\POS`, Rebuild `.exe` & Git Push
**Files:**
- Target: `C:\POS`
- Binary: `POS_Mastercare.exe`

- [ ] **Step 1: Re-compile `uv run pyinstaller POS_Mastercare.spec --distpath . -y`**
- [ ] **Step 2: Copy file cập nhật sang `C:\POS`**
- [ ] **Step 3: Commit và push lên `github/main`**
