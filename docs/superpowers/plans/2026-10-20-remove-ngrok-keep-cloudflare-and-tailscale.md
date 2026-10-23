# Kế Hoạch Dọn Dẹp Toàn Bộ Ngrok, Chuẩn Hóa Tailscale (Giữ Cloudflare Để Test)

> **For agentic workers:** REQUIRED SUB-SKILL: Use executing-plans.

**Goal:** Dọn dẹp triệt để mọi logic, tiến trình chạy ngầm, script và tài liệu liên quan đến Ngrok trong hệ thống; quy chuẩn kết nối từ xa về Tailscale; giữ lại `CHAY_ONLINE_CLOUDFLARE.bat` và `scripts/share_online.py` để test theo yêu cầu của anh.

**Architecture:** 
- Khởi động POS (`main.py`, `launcher.py`): Gỡ bỏ toàn bộ code spawn `ngrok.exe`, token injection, và auto-open URL `ngrok-free.dev`. Menu khay hệ thống (System Tray) chuyển sang mở Local và hiển thị/mở qua Tailscale.
- Đóng gói (`deploy/build_exe.bat`): Xóa bỏ bước copy `ngrok.exe` vào gói xuất xưởng.
- Script bảo trì & cập nhật (`CAP_NHAT.bat`, `deploy/legacy_scripts/`): Dọn dẹp các lệnh liên quan `ngrok.exe`, xóa script `CHAY_ONLINE_CO_DINH.bat` thừa.
- Tài liệu (`HUONG_DAN_SU_DUNG.txt`): Cập nhật hướng dẫn sang Tailscale (IP `100.x.y.z` hoặc hostname `pos-server:8998`).

**Tech Stack:** Python 3.11/3.14, Batch Scripts, PyInstaller, Pytest.

---

## Global Constraints & Anti-Drift Guards (Strict)
1. **Chạm đúng biên:** 
   - Sửa: `main.py`, `launcher.py`, `deploy/build_exe.bat`, `HUONG_DAN_SU_DUNG.txt`, `CAP_NHAT.bat`.
   - Xóa: `deploy/legacy_scripts/CHAY_ONLINE_CO_DINH.bat`.
   - Giữ nguyên: Toàn bộ file Cloudflare (`CHAY_ONLINE_CLOUDFLARE.bat`, `scripts/share_online.py`).
2. **Bằng chứng test thực tế:** Chạy test suite `pytest tests/test_deploy_scripts.py` và test mới kiểm tra không còn reference `ngrok` trong mã nguồn chạy chính.

---

## File Structure Map

| File | Trách nhiệm |
|---|---|
| `main.py` | Gỡ bỏ `start_ngrok()`, `kill_ngrok()`, menu tray item `Link Online (Ngrok)`. |
| `launcher.py` | Gỡ bỏ hằng số `NGROK_URL`, logic spawn `ngrok.exe`. |
| `deploy/build_exe.bat` | Xóa dòng copy `ngrok.exe` vào `dist/POS_Mastercare`. |
| `CAP_NHAT.bat` | Dọn dẹp lệnh kill ngrok thừa. |
| `deploy/legacy_scripts/CHAY_ONLINE_CO_DINH.bat` | Xóa file script ngrok cũ. |
| `HUONG_DAN_SU_DUNG.txt` | Cập nhật mục truy cập online qua Tailscale thay cho ngrok. |
| `tests/test_no_ngrok_in_codebase.py` | Tạo test case đảm bảo codebase chính không còn dính ngrok. |

---

### Task 1: Gỡ Bỏ Ngrok Trong `main.py` và `launcher.py`

**Files:**
- Modify: `main.py`
- Modify: `launcher.py`

- [ ] **Step 1: Sửa `main.py`**
  - Xóa hàm `start_ngrok(target_dir)` và `kill_ngrok()`.
  - Xóa lời gọi `start_ngrok` ở `__main__` và `kill_ngrok` ở `on_exit()`.
  - Thay đổi menu Tray icon: xóa `pystray.MenuItem("Link Online (Ngrok)", on_open_online)`. Bổ sung hàm mở Tailscale hoặc chỉ giữ các menu chuẩn:
    - Bán Hàng POS (Local 8998)
    - Mở POS Qua Mạng (Tailscale: `http://pos-server:8998`)
    - Tự khởi động cùng Windows
    - Thoát POS Mastercare
- [ ] **Step 2: Sửa `launcher.py`**
  - Xóa `NGROK_URL`, xóa toàn bộ block kiểm tra và chạy `ngrok.exe`.
  - Tinh gọn launcher chỉ khởi chạy POS nội bộ an toàn.

---

### Task 2: Cập Nhật Script Đóng Gói, Script Chạy & Tài Liệu

**Files:**
- Modify: `deploy/build_exe.bat`
- Modify: `CAP_NHAT.bat`
- Delete: `deploy/legacy_scripts/CHAY_ONLINE_CO_DINH.bat`
- Modify: `HUONG_DAN_SU_DUNG.txt`

- [ ] **Step 1: Sửa `deploy/build_exe.bat`**
  - Xóa dòng copy `ngrok.exe`.
- [ ] **Step 2: Xóa file script `deploy/legacy_scripts/CHAY_ONLINE_CO_DINH.bat`**
- [ ] **Step 3: Cập nhật `HUONG_DAN_SU_DUNG.txt`**
  - Thay thế mục URL ngrok cũ bằng hướng dẫn truy cập qua Tailscale (`http://pos-server:8998` hoặc IP Tailscale).

---

### Task 3: Viết Test & Kiểm Thử Toàn Bộ Hệ Thống

**Files:**
- Create: `tests/test_no_ngrok_in_codebase.py`

- [ ] **Step 1: Viết test case `tests/test_no_ngrok_in_codebase.py`**
  - Kiểm tra `main.py`, `launcher.py`, `deploy/build_exe.bat` không còn chứa chuỗi `ngrok`.
  - Kiểm tra `CHAY_ONLINE_CLOUDFLARE.bat` vẫn tồn tại nguyên vẹn.
- [ ] **Step 2: Chạy pytest xác nhận toàn bộ test pass 100%**
  - Lệnh: `pytest tests/test_no_ngrok_in_codebase.py tests/test_deploy_scripts.py`
