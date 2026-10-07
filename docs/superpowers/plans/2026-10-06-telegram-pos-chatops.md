# Telegram POS ChatOps Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use subagent-driven-development or executing-plans.

**Goal:** Xây dựng bot Telegram ChatOps điều khiển POS: đăng ký Admin duyệt qua Web POS, hủy đơn hàng kèm xác nhận 2 bước, sửa hình thức thanh toán, xem hàng hết để đặt, xem báo cáo doanh thu và tra cứu giá/danh mục báo khách.

**Architecture:** Sử dụng Long-Polling worker (`services/telegram_bot.py`) chạy background thread cùng FastAPI. Các thao tác quản trị gọi trực tiếp hàm nghiệp vụ DB POS (hoàn tồn kho, cập nhật cashbook, contacts). Giao diện Web POS cấu hình token và duyệt Admin trong trang Settings.

**Tech Stack:** Python 3.11+, FastAPI, SQLite3, `httpx` (hoặc `urllib.request` native), pytest.

---

## File Structure

| File | Responsibility |
|---|---|
| `database.py` | Tạo bảng `telegram_admins`, `telegram_admin_requests` và migration cấu hình bot |
| `services/telegram_bot.py` | Long-polling service, routing lệnh, xác thực Admin, gọi hàm nghiệp vụ POS |
| `routers/settings.py` | API endpoints: lưu token, bật/tắt bot, danh sách admin/yêu cầu, duyệt/xóa admin |
| `main.py` | Khởi động background thread `telegram_bot` khi start POS |
| `templates/settings.html` | Thêm thẻ UI "Kết nối Bot Telegram & Duyệt Admin" |
| `static/js/modules/settings.js` | JS gọi API Telegram settings, duyệt admin 1 chạm |
| `tests/test_telegram_chatops.py` | Unit tests kiểm thử toàn bộ nghiệp vụ ChatOps |

---

## Tasks

### Task 1: Database Schema & Migration for Telegram Bot

**Files:**
- Modify: `database.py`
- Test: `tests/test_telegram_chatops.py`

- [ ] **Step 1: Write failing test in `tests/test_telegram_chatops.py`**
  - Kiểm tra bảng `telegram_admins` và `telegram_admin_requests` tồn tại trong DB sau `init_db()`.
- [ ] **Step 2: Run test to verify it fails**
- [ ] **Step 3: Implement tables in `database.py`**
  - Thêm DDL cho `telegram_admins` (`chat_id`, `username`, `first_name`, `role`, `approved_by`, `approved_at`, `is_active`).
  - Thêm DDL cho `telegram_admin_requests` (`chat_id`, `username`, `first_name`, `status`, `created_at`).
- [ ] **Step 4: Run test to verify it passes**

---

### Task 2: Core Telegram Bot Logic & ChatOps Service

**Files:**
- Create: `services/telegram_bot.py`
- Test: `tests/test_telegram_chatops.py`

**Interfaces:**
- `process_telegram_message(message_dict) -> str/dict`
- `process_telegram_callback(callback_dict) -> str/dict`
- `execute_cancel_order(order_code, chat_id) -> bool`
- `execute_change_payment(order_code, account_id, chat_id) -> bool`
- `query_out_of_stock() -> list`
- `query_quick_report(period: str) -> dict`
- `query_product_price(query: str) -> list`

- [ ] **Step 1: Write test for command parsers and admin permission gate**
  - Test `/dangky`: Tạo bản ghi pending trong `telegram_admin_requests`.
  - Test lệnh quản trị bị chặn nếu `chat_id` chưa được duyệt.
  - Test `/hanghet`: Trả về danh sách sản phẩm `stock <= 0`.
  - Test `/baocao homnay`: Trả về tổng tiền, số đơn, phương thức thanh toán.
  - Test `/gia <từ_khóa>`: Trả về danh sách sản phẩm và giá bán lẻ.
  - Test `/huyhoadon <code_don>`: Xác nhận 2 bước và hủy hoàn kho.
  - Test `/suathanhtoan <code_don>`: Đổi tài khoản thanh toán và cashbook.
- [ ] **Step 2: Implement `services/telegram_bot.py`**
- [ ] **Step 3: Run tests to verify all pass**

---

### Task 3: Settings API & Web POS Approval Endpoints

**Files:**
- Modify: `routers/settings.py`
- Test: `tests/test_telegram_chatops.py`

**Interfaces:**
- `GET /api/settings/telegram`: Lấy cấu hình bot + danh sách admin + danh sách chờ duyệt.
- `POST /api/settings/telegram/config`: Cập nhật `bot_token`, `is_enabled`.
- `POST /api/settings/telegram/approve`: Duyệt yêu cầu admin (chuyển sang `telegram_admins`).
- `POST /api/settings/telegram/reject`: Từ chối/xóa admin.

- [ ] **Step 1: Write test for API endpoints**
- [ ] **Step 2: Implement endpoints in `routers/settings.py`**
- [ ] **Step 3: Run test to verify it passes**

---

### Task 4: Web UI Integration (Settings Page)

**Files:**
- Modify: `templates/settings.html`
- Modify: `static/js/modules/settings.js`

- [ ] **Step 1: Add Telegram Tab/Card in `templates/settings.html`**
  - Ô nhập Telegram Bot Token.
  - Nút lưu cấu hình & kiểm tra kết nối bot.
  - Bảng danh sách yêu cầu chờ duyệt với nút `[Duyệt]` / `[Từ chối]`.
  - Bảng danh sách Admin đang hoạt động.
- [ ] **Step 2: Wire JS logic in `static/js/modules/settings.js`**

---

### Task 5: Background Polling Lifecycle & Final Integration

**Files:**
- Modify: `main.py`
- Test: `tests/test_telegram_chatops.py`

- [ ] **Step 1: Wire bot background worker in `main.py` lifespan / startup**
- [ ] **Step 2: End-to-end integration test**
- [ ] **Step 3: Run entire pytest suite**
