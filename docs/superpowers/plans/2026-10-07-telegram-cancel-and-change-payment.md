# Implementation Plan: Hoàn Thiện Hủy Đơn Hàng & Đổi Hình Thức Thanh Toán Trên Telegram

> **For agentic workers:** REQUIRED SUB-SKILL: Use subagent-driven-development or executing-plans.

**Goal:** Khắc phục lỗi nuốt nút bấm inline trên Telegram Bot và hoàn thiện nghiệp vụ hủy đơn (hoàn kho, hoàn ví Spa, công nợ) và đổi phương thức thanh toán (đồng bộ `order_payments` & `cashbook`).

**Architecture:** Cập nhật trực tiếp `services/telegram_bot.py` (bao gồm `_polling_worker`, `execute_cancel_order`, `execute_change_payment`), bổ sung unit tests trong `tests/test_telegram_chatops.py`.

**Tech Stack:** Python 3.11, SQLite, FastAPI, Pytest, HTTPX.

---

### Task 1: Cập nhật `_polling_worker` để gửi `reply_markup` khi `editMessageText`
**Files:**
- Modify: `services/telegram_bot.py`
- Test: `tests/test_telegram_chatops.py`

- [ ] **Step 1: Viết test cho callback query response chứa inline_keyboard và edit=True**
- [ ] **Step 2: Chạy test để kiểm tra**
- [ ] **Step 3: Sửa `_polling_worker` thêm `edit_payload["reply_markup"]`**
- [ ] **Step 4: Chạy test đảm bảo pass**

---

### Task 2: Hoàn thiện nghiệp vụ Hủy đơn hàng `execute_cancel_order`
**Files:**
- Modify: `services/telegram_bot.py`
- Test: `tests/test_telegram_chatops.py`

- [ ] **Step 1: Viết unit test kiểm tra hoàn ví Spa và dọn sạch `order_payments` khi hủy đơn**
- [ ] **Step 2: Chạy test để thấy fail (chưa có code hoàn ví Spa / order_payments)**
- [ ] **Step 3: Cập nhật `execute_cancel_order` hoàn tiền ví Spa, xóa `order_payments`**
- [ ] **Step 4: Chạy test kiểm tra pass**

---

### Task 3: Hoàn thiện nghiệp vụ Đổi hình thức thanh toán `execute_change_payment`
**Files:**
- Modify: `services/telegram_bot.py`
- Test: `tests/test_telegram_chatops.py`

- [ ] **Step 1: Viết unit test kiểm tra đồng bộ `order_payments` khi đổi tài khoản thanh toán**
- [ ] **Step 2: Chạy test để thấy fail**
- [ ] **Step 3: Cập nhật `execute_change_payment` update `order_payments`**
- [ ] **Step 4: Chạy test kiểm tra pass**

---

### Task 4: Chạy toàn bộ test suite Telegram ChatOps và Rebuild/Push
- [ ] **Step 1: Chạy `pytest tests/test_telegram_chatops.py`**
- [ ] **Step 2: Commit và push lên GitHub**
