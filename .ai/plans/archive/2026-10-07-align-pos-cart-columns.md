# Implementation Plan: Căn Chỉnh Lại Cột SL, Đơn Giá & Thành Tiền Trên Bảng Giỏ Hàng POS

> **For agentic workers:** REQUIRED SUB-SKILL: Use subagent-driven-development or executing-plans.

**Goal:** Khắc phục triệt để tình trạng chồng chéo thông tin giữa cột Số Lượng và Đơn Giá trên giỏ hàng POS, tái cấu trúc ô Đơn Giá thành 2 dòng gọn gàng, tăng chiều rộng các cột tiền và đồng bộ mã nguồn sang cả `C:\POS`.

**Architecture:** Cập nhật CSS Grid & render HTML trong `static/js/pos.js`, `templates/pos.html`, `templates/index.html`, bump cache, copy đồng bộ sang `C:\POS`, re-build `POS_Mastercare.exe`, verify bằng Playwright screenshot.

**Tech Stack:** HTML5, CSS Grid, Tailwind CSS, JavaScript ES6, Playwright.

---

### Task 1: Cập nhật CSS Grid và cấu trúc hiển thị cột Đơn Giá trong `static/js/pos.js`
**Files:**
- Modify: `static/js/pos.js`
- Modify: `templates/pos.html`
- Modify: `templates/index.html`

- [ ] **Step 1: Cập nhật grid-template-columns thành:**
  `34px 34px 85px minmax(130px, 1fr) 48px 100px 175px 120px`
- [ ] **Step 2: Tái cấu trúc ô Đơn giá trong `renderActiveTabCart()`:**
  - Dòng 1: Giá bán thực tế (bold đen) + Badge giá riêng / chiết khấu + Icon bút sửa giá.
  - Dòng 2: Giá gốc gạch ngang + số tiền giảm đỏ (canh phải thẳng hàng bên dưới, không tràn sang trái).
- [ ] **Step 3: Cập nhật version cache trong `templates/index.html` và `templates/pos.html`**

---

### Task 2: Verify giao diện bằng Playwright headless screenshot
**Files:**
- Test file HTML tạm hoặc test Playwright trực tiếp

- [ ] **Step 1: Tạo file HTML mẫu render dòng sản phẩm chứa đầy đủ (giá gốc gạch ngang, giá riêng, mức giảm đỏ, bộ nút SL, thành tiền)**
- [ ] **Step 2: Chụp ảnh Playwright và dùng `vision_analyze` kiểm tra độ thoáng, thẳng hàng, không chồng chéo**

---

### Task 3: Đồng bộ sang `C:\POS` & Rebuild `POS_Mastercare.exe` & Commit Push
**Files:**
- Rebuild: `POS_Mastercare.exe`
- Copy to: `C:\POS`

- [ ] **Step 1: Recompile `uv run pyinstaller POS_Mastercare.spec --distpath . -y`**
- [ ] **Step 2: Copy file cập nhật sang `C:\POS`**
- [ ] **Step 3: Commit và push lên `github/main`**
