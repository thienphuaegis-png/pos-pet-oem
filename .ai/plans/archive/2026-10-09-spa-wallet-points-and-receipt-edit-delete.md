# Kế Hoạch Triển Khai: Tích Điểm Ví Spa & Sửa/Xóa Phiếu Thu Nạp Ví

> **For agentic workers:** REQUIRED SUB-SKILL: Use subagent-driven-development or executing-plans.

**Goal:** Bổ sung tính năng tích điểm tự động khi khách nạp ví Spa và hỗ trợ sửa/xóa phiếu thu nạp ví/thủ công kèm hoàn tác đồng bộ số dư ví và điểm.

**Architecture:** Bổ sung migration `points_earned` cho `spa_wallet_transactions`. Router `routers/topup.py` tính điểm và thăng hạng khi nạp ví. Router `routers/cashbook.py` mở rộng PUT/DELETE cho phép xử lý phiếu thu `topup` và `manual`, đồng thời hoàn tác ví/điểm khi xóa phiếu nạp. Module `static/js/modules/productions.js` cập nhật logic hiển thị nút Sửa/Xóa và cảnh báo hoàn tác.

**Tech Stack:** FastAPI, SQLite, Vanilla JavaScript, Tailwind CSS, Pytest.

## File Structure

| File | Responsibility |
|---|---|
| `database.py:1140-1165` | Migration thêm `points_earned` vào bảng `spa_wallet_transactions` |
| `routers/topup.py:118-195` | Tính điểm thưởng, thăng hạng và lưu `points_earned` khi nạp ví |
| `routers/cashbook.py:260-340` | Mở quyền PUT/DELETE cho phiếu thu `topup`/`manual` và hoàn tác ví/điểm khi xóa |
| `static/js/modules/productions.js:640-660, 1140-1170` | Hiển thị nút Sửa/Xóa cho phiếu thu hợp lệ và modal xác nhận hoàn tác |
| `tests/test_topup_points_and_cashbook_sync.py` | Kiểm thử tích điểm nạp ví và hoàn tác ví khi xóa phiếu thu |

---

### Task 1: Migration CSDL & Tích Điểm Khi Nạp Ví Spa

**Files:**
- Modify: `database.py`
- Modify: `routers/topup.py`
- Test: `tests/test_topup_points_and_cashbook_sync.py`

- [ ] **Step 1: Write failing test**
Viết test nạp ví kiểm tra khách hàng được cộng điểm dựa trên số tiền nộp `pay_amount` và tỷ lệ `points_exchange_rate`.

- [ ] **Step 2: Run test to verify it fails**
`pytest tests/test_topup_points_and_cashbook_sync.py -k test_topup_accumulates_points`

- [ ] **Step 3: Implement database migration & topup points logic**
- Thêm cột `points_earned INTEGER DEFAULT 0` vào `spa_wallet_transactions` trong `database.py`.
- Trong `routers/topup.py`, tính `points_earned = int(pay_amt // points_exchange_rate)`, cộng vào `contacts.points`, kiểm tra thăng hạng, và lưu vào `spa_wallet_transactions`.

- [ ] **Step 4: Run test to verify it passes**
`pytest tests/test_topup_points_and_cashbook_sync.py -k test_topup_accumulates_points`

---

### Task 2: Backend Sửa / Xóa Phiếu Thu Nạp Ví & Hoàn Tác Ví Đồng Bộ

**Files:**
- Modify: `routers/cashbook.py`
- Test: `tests/test_topup_points_and_cashbook_sync.py`

- [ ] **Step 1: Write failing test**
Viết test:
1. Xóa phiếu thu nạp ví: kiểm tra `cashbook` bị xóa, `spa_wallet_transactions` bị xóa, số dư ví và điểm của khách hàng được hoàn tác về ban đầu.
2. Thử xóa phiếu thu đơn hàng: kiểm tra trả về HTTP 400 và không cho xóa trực tiếp.

- [ ] **Step 2: Run test to verify it fails**
`pytest tests/test_topup_points_and_cashbook_sync.py -k test_delete_topup_receipt_and_rollback_wallet`

- [ ] **Step 3: Implement cashbook edit/delete logic**
Cập nhật `routers/cashbook.py`:
- `DELETE /api/cashbook/{id}`: hỗ trợ phiếu thu `topup` (hoàn tác ví, điểm, xóa giao dịch) và `manual`. Chặn `order`.
- `PUT /api/cashbook/{id}`: cho phép sửa phiếu thu `topup` và `manual`. Chặn `order`.

- [ ] **Step 4: Run test to verify it passes**
`pytest tests/test_topup_points_and_cashbook_sync.py`

---

### Task 3: Cập nhật Drawer Giao Diện Sổ Quỹ

**Files:**
- Modify: `static/js/modules/productions.js`

- [ ] **Step 1: Update UI visibility and confirmation text**
- Trong `openCashbookDrawer`: hiển thị `btnEdit` và `btnDel` khi là phiếu chi hoặc khi là phiếu thu có `ref_type in ('topup', 'manual', '')`.
- Trong `confirmDeleteCashbookVoucher`: nếu là phiếu thu nạp ví, hiển thị thông báo rõ ràng về việc hoàn tác số dư ví và điểm tích lũy của khách hàng.

- [ ] **Step 2: Run all test suites to verify system integrity**
`pytest tests/test_topup_points_and_cashbook_sync.py tests/test_cashbook_edit_delete.py tests/test_spa_wallet_topup.py`
