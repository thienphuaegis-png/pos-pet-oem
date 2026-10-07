# Implementation Plan: Sửa Lỗi Phân Loại Tiền SP/Dịch Vụ & Hoàn Điểm Khi Hủy Hóa Đơn

> **For agentic workers:** REQUIRED SUB-SKILL: Use subagent-driven-development or executing-plans.

**Goal:** Khắc phục lỗi tính tiền sản phẩm vs dịch vụ trên modal chi tiết hóa đơn, bổ sung lưu trữ `points_earned` vào đơn hàng, và thực hiện hoàn điểm + hạ hạng khi hủy đơn trên cả Web POS và Telegram.

**Architecture:** Cập nhật CSDL (`database.py`), POS backend (`routers/pos.py`), Telegram Bot (`services/telegram_bot.py`), Frontend chi tiết đơn (`static/js/modules/productions.js`), bump cache trong `templates/index.html`, và viết unit test xác minh trọn vẹn.

**Tech Stack:** Python 3.11, SQLite, FastAPI, Pytest, JavaScript ES6.

---

### Task 1: Sửa logic phân loại Hàng Hóa vs Dịch Vụ trên Frontend
**Files:**
- Modify: `static/js/modules/productions.js:3761, 3934, 4003`
- Modify: `templates/index.html` (bump cache `productions.js`)

- [ ] **Step 1: Sửa hàm `isSvc` tại 3 vị trí trong `productions.js`**  
  Chỉ tính là `service` khi `item.product_type === 'service'` hoặc tên chứa `(dịch vụ|vé spa|gói tắm|tiền công)`. Hàng hóa có chữ "sữa tắm" mang `product_type === 'product'` sẽ luôn tính vào **Tiền Sản Phẩm (Hàng Hóa)**.
- [ ] **Step 2: Tăng version cache script `productions.js` trong `templates/index.html`**

---

### Task 2: Cập nhật Migration CSDL & Lưu `points_earned` khi bán hàng
**Files:**
- Modify: `database.py` (thêm migration cột `points_earned` cho `orders`)
- Modify: `routers/pos.py` (lưu `points_earned` vào `orders`)
- Test: `tests/test_points_and_tier_upgrade.py`

- [ ] **Step 1: Viết test kiểm tra `orders` lưu `points_earned` khi thanh toán**
- [ ] **Step 2: Thêm migration cột `points_earned` vào `database.py`**
- [ ] **Step 3: Cập nhật câu lệnh `INSERT INTO orders` và `UPDATE orders` tại `routers/pos.py`**
- [ ] **Step 4: Chạy test kiểm tra pass**

---

### Task 3: Triển khai hoàn điểm & hạ hạng khi hủy hóa đơn (Web POS & Telegram)
**Files:**
- Modify: `routers/pos.py` (`delete_order`)
- Modify: `services/telegram_bot.py` (`execute_cancel_order`)
- Test: `tests/test_points_and_tier_upgrade.py`
- Test: `tests/test_telegram_chatops.py`

- [ ] **Step 1: Viết test cho Web POS: hủy đơn -> điểm bị trừ, hạng bị hạ**
- [ ] **Step 2: Cập nhật `delete_order` trong `routers/pos.py` trừ điểm và hạ hạng**
- [ ] **Step 3: Cập nhật `execute_cancel_order` trong `services/telegram_bot.py` trừ điểm và hạ hạng**
- [ ] **Step 4: Chạy `pytest tests/test_points_and_tier_upgrade.py tests/test_telegram_chatops.py`**

---

### Task 4: Rebuild executable `POS_Mastercare.exe` & Push GitHub
- [ ] **Step 1: Chạy `uv run pyinstaller POS_Mastercare.spec --distpath . -y`**
- [ ] **Step 2: Commit và push lên `github/main`**
