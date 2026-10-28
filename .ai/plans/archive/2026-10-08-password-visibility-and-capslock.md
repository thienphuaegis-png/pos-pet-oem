# Kế Hoạch Triển Khai: Nút Xem Mật Khẩu & Cảnh Báo Caps Lock (Mẫu 3)

> **For agentic workers:** REQUIRED SUB-SKILL: Use subagent-driven-development or executing-plans.

**Goal:** Thêm nút toggle xem/ẩn mật khẩu kèm nhãn "Xem" / "Ẩn" và tính năng tự động cảnh báo khi bật Caps Lock cho màn hình đăng nhập, đổi mật khẩu và quản lý nhân viên.

**Architecture:** 
- Thêm wrapper relative, nút toggle mắt + nhãn và div cảnh báo Caps Lock cho `#login-password`, `#force-pwd-old`, `#force-pwd-new`, `#staff-password` trong `templates/index.html`.
- Viết 2 hàm tiện ích tái sử dụng `togglePasswordVisibility(inputId, btnEl)` và `checkPasswordCapsLock(event, warnId)` trong `static/js/auth.js`.
- Viết test tự động kiểm tra DOM, logic toggle type và logic nhận diện Caps Lock.

---

## File Structure

| File | Trách nhiệm |
|---|---|
| `templates/index.html:724-760, 8275` | Modify — Wrapper input, nút xem mật khẩu, container cảnh báo Caps Lock |
| `static/js/auth.js` | Modify — Thêm hàm `togglePasswordVisibility` & `checkPasswordCapsLock` |
| `tests/test_password_visibility.py` | Create — Test tự động xác nhận DOM và logic toggle |

---

### Task 1: Thêm Hàm Tiện Ích JS (`static/js/auth.js`)

**Files:**
- Modify: `static/js/auth.js`
- Test: `tests/test_password_visibility.py`

- [ ] **Step 1: Write test case**
  Kiểm tra file `static/js/auth.js` xuất bản `togglePasswordVisibility` và `checkPasswordCapsLock`.
- [ ] **Step 2: Triển khai hàm trong `static/js/auth.js`**
  - `window.togglePasswordVisibility(inputId, btnEl)`
  - `window.checkPasswordCapsLock(e, warnId)`
- [ ] **Step 3: Run test verify pass**

---

### Task 2: Giao Diện Màn Đăng Nhập & Đổi Mật Khẩu (`templates/index.html`)

**Files:**
- Modify: `templates/index.html`
- Test: `tests/test_password_visibility.py`

- [ ] **Step 1: Write test case kiểm tra DOM**
  - Kiểm tra các nút toggle xem mật khẩu cho `#login-password`.
  - Kiểm tra container `#login-caps-warn`.
  - Kiểm tra ô `#force-pwd-old`, `#force-pwd-new` và `#staff-password`.
- [ ] **Step 2: Cập nhật DOM trong `templates/index.html`**
- [ ] **Step 3: Run test verify pass**

---

### Task 3: Build Lại POS_Mastercare.exe & Đóng Gói

**Files:**
- Modify: `POS_Mastercare.exe`
- Test: Toàn bộ test suite liên quan (`test_password_visibility.py`, `test_auth.py`)

- [ ] **Step 1: Recompile `uv run pyinstaller POS_Mastercare.spec --distpath . -y`**
- [ ] **Step 2: Commit và push lên GitHub**
