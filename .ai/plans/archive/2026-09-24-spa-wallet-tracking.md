# Implementation Plan: Theo Dõi & Quản Lý Ví Spa

> **Goal:** Tích hợp giao diện theo dõi số dư và lịch sử giao dịch ví Spa tại màn hình POS và Hồ Sơ Khách Hàng.

---

### Task 1: Backend API Contacts Update
- Cập nhật `routers/contacts.py` trong hàm `get_contact_detail(id)`:
  - Query lấy thêm `spa_wallet_balance`, `points`.
  - Query bảng `spa_wallet_transactions` để trả về `spa_wallet_history`.
- Test: `tests/test_spa_wallet_tracking.py`.

### Task 2: Giao Diện POS - Modal Lịch Sử Ví Spa
- `templates/index.html`: Thêm modal `#modal-pos-wallet-history`.
- `static/js/pos.js`:
  - Thêm nút `[👁️ Lịch sử ví]` cạnh số dư ví.
  - Hàm `showPosWalletHistory()`: gọi `/api/topup/history/{contact_id}` và render bảng lịch sử.

### Task 3: Giao Diện Khách Hàng - Cột Ví & Bảng Lịch Sử
- `templates/index.html`:
  - Thêm cột "Ví Spa" vào bảng `#contacts-table` (khi loại là Khách Hàng).
  - Thêm mục "💆 Lịch Sử Biến Động Ví Spa" vào modal `#modal-contact-detail`.
- `static/js/app.js`:
  - Render cột Ví Spa trong bảng danh sách khách.
  - Render bảng `spa_wallet_history` trong modal chi tiết khách hàng.

### Task 4: Kiểm Thử Toàn Diện
- Test tự động `pytest tests/test_spa_wallet_tracking.py tests/test_html_integrity.py`.
- Syntax check: `node -c static/js/pos.js && node -c static/js/app.js`.
