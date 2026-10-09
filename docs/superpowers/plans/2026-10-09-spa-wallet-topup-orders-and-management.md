# Kế Hoạch Triển Khai: Quản Lý, Sửa & Xóa Phiếu Thu Nạp Ví Spa

> **For agentic workers:** REQUIRED SUB-SKILL: Use subagent-driven-development or executing-plans.

**Goal:** Bổ sung chức năng quản lý, sửa và xóa phiếu thu nạp ví Spa cả trên sub-tab Hóa Đơn Nạp Ví và trong modal Lịch Sử Biến Động Ví Spa kèm hoàn tác đồng bộ số dư ví, điểm thưởng và sổ quỹ.

**Architecture:** Bổ sung các endpoints `GET/PUT/DELETE /api/topup/transactions` trong `routers/topup.py`. Thêm sub-tab `#btn-subtab-order-topup` vào màn hình Hóa Đơn trong `templates/index.html`. Cập nhật các hàm render và xử lý xóa/sửa trong `static/js/pos.js`. Viết kiểm thử toàn diện.

**Tech Stack:** FastAPI, SQLite, Vanilla JavaScript, Tailwind CSS, Pytest.

## File Structure

| File | Responsibility |
|---|---|
| `routers/topup.py` | API `GET`, `PUT`, `DELETE` cho `/api/topup/transactions` |
| `templates/index.html` | Sub-tab Hóa Đơn Nạp Ví và Modal Sửa Phiếu Nạp Ví |
| `static/js/pos.js` | Hàm load danh sách hóa đơn nạp ví, nút sửa/xóa trên modal lịch sử ví |
| `tests/test_topup_transactions_management.py` | Kiểm thử API quản lý phiếu nạp ví |

---

### Task 1: Xây Dựng Backend API Quản Lý Giao Dịch Nạp Ví (`routers/topup.py`)

**Files:**
- Modify: `routers/topup.py`
- Test: `tests/test_topup_transactions_management.py`

- [ ] **Step 1: Write failing test**
Viết test `tests/test_topup_transactions_management.py` kiểm tra:
1. `GET /api/topup/transactions` trả về danh sách phiếu thu nạp ví có mã phiếu, khách hàng, số tiền.
2. `PUT /api/topup/transactions/{id}` sửa ghi chú, hình thức thanh toán và đồng bộ sang cashbook.
3. `DELETE /api/topup/transactions/{id}` xóa giao dịch ví, xóa cashbook và hoàn tác đúng số dư ví + điểm.

- [ ] **Step 2: Run test to verify it fails**
`pytest tests/test_topup_transactions_management.py`

- [ ] **Step 3: Implement endpoints in `routers/topup.py`**
- Thêm `GET /api/topup/transactions` JOIN `contacts`, `topup_packages`, `cashbook`, `payment_accounts`.
- Thêm `PUT /api/topup/transactions/{id}` cập nhật giao dịch ví và cashbook.
- Thêm `DELETE /api/topup/transactions/{id}` hoàn tác `spa_wallet_balance` và `points`, xóa giao dịch và cashbook.

- [ ] **Step 4: Run test to verify it passes**
`pytest tests/test_topup_transactions_management.py`

---

### Task 2: Giao Diện Sub-Tab Hóa Đơn Nạp Ví & Thao Tác Modal Lịch Sử

**Files:**
- Modify: `templates/index.html`
- Modify: `static/js/pos.js`
- Test: `tests/test_topup_transactions_management.py`

- [ ] **Step 1: Cập nhật `templates/index.html`**
- Thêm sub-tab button `#btn-subtab-order-topup` tại `#tab-orders`.
- Thêm subview `#orders-subview-topup` có bảng danh sách phiếu thu nạp ví.
- Thêm modal sửa `#modal-edit-topup-tx`.

- [ ] **Step 2: Cập nhật `static/js/pos.js`**
- Trong `showPosWalletHistory()`: Thêm 2 nút `[✏️ Sửa]` và `[🗑️ Xóa]` trên mỗi hàng nạp ví.
- Thêm hàm `confirmDeleteTopupTx(txId, custId)` và `openEditTopupTxModal(txId)`.
- Thêm hàm `loadTopupOrdersList()` và `renderTopupOrdersTable()`.
- Cập nhật hàm `switchOrderSubTab()` hỗ trợ `'topup'`.

- [ ] **Step 3: Run full regression tests**
`pytest tests/test_topup_transactions_management.py tests/test_topup_points_and_cashbook_sync.py tests/test_spa_wallet_topup.py`
