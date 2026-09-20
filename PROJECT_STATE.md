# PROJECT STATE — POS Offline (Spa Thú Cưng & Bán Lẻ Đa Kênh)

**Checkpoint:** 2026-09-20 — Auth + RBAC + Ca Làm Việc  
**Server:** `http://127.0.0.1:8999` — FastAPI + SQLite (`data/pos.db`)  
**Working dir:** `D:/Projects_Hermes/pos-offline`  

---

## Phiên Trước ✅ (2026-09-19)

Bảng giá đại lý, đa tài khoản sổ quỹ, mã chứng từ PT-BH/PT-CN/PC-NH/PC-OEM/PC-CP.

---

## Phiên Này ✅ — Bảo Mật & Phân Quyền (2026-09-20)

### A. DB Migration
- `staff`: thêm `username` (UNIQUE INDEX), `password_hash`, `is_active`
- `shifts`: bảng mới ca làm việc (`cashier_id`, `open/close_at`, `status`, `opening/closing/expected_cash`, `difference`, `approved_by/at`)
- `orders.shift_id`, `cashbook.shift_id` — FK sang shifts
- Seed: `admin` / `admin123` / role=`owner`
- **Package:** `bcrypt==4.0.1` (không dùng 5.x — không tương thích passlib 1.7.4)

### B. Backend
- `dependencies.py` (mới): `get_current_user()`, `require_role(*roles)`
- `routers/auth.py` (mới): login, refresh, me, change-password, staff CRUD (list/create/update/reset-pass)
- `routers/shifts.py` (mới): open, current, close (tính expected+difference), approve, list
- Gắn `require_role` vào: pos (POST/DELETE/PUT orders), cashbook (POST accounts/cashbook), purchases (POST/PUT/receive/DELETE), partners (POST/PUT/DELETE contacts, pay-debt)

### C. Frontend
- `auth.js` (mới): JWT localStorage, fetch interceptor Bearer, login/logout, `applyRoleUI` qua `data-role`
- `shifts.js` (mới): mở ca, kết ca (alert tổng kết + chênh lệch)
- `index.html`: login overlay, sidebar user+shift controls, `data-role` trên 12 tab nav

### D. Ma Trận Role
| Role | POS/Dịch Vụ | Đơn Hàng | Kho/Nhập/OEM | Sổ Quỹ/NCC | Báo Cáo | Cài Đặt |
|---|:---:|:---:|:---:|:---:|:---:|:---:|
| owner | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| cashier | ✅ | xem | xem kho | ❌ | ❌ | ❌ |
| accountant | ❌ | xem | ❌ | ✅ | ✅ | ❌ |
| warehouse | ❌ | ❌ | ✅ | ❌ | ❌ | ❌ |

### E. Test Pass
- `tests/test_auth.py` — ALL PASS (6 cases)
- Login curl → role=owner ✅ | GET /me ✅ | POST /orders no-token → 401 ✅
- `node -c auth.js && node -c shifts.js` — JS syntax OK ✅

## Phiên Này ✅ — OEM & Công Nợ Dòng Tiền (2026-09-20)

### A. Sửa / Hủy Đơn Gia Công OEM
- Backend `PUT /api/oem/orders/{id}`: Cho phép sửa items, chiết khấu, hạn giao, ghi chú khi đơn ở trạng thái DRAFT / DEPOSITED. Giữ nguyên tiền cọc.
- Backend `DELETE /api/oem/orders/{id}`: Hủy đơn tự động hoàn tiền cọc vào sổ quỹ cashbook (`type='in'`, category `OEM_DEPOSIT_REFUND`), xóa đơn khỏi DB.
- Frontend: Tái sử dụng modal tạo đơn `modal-create-oem` thành modal sửa (`openModalEditOEM`), bổ sung nút Sửa & Hủy trên bảng đơn OEM.

### B. Bộ Dữ Liệu Xưởng Gia Công Lucky Star
- NCC `Lucky Star` (ID `10110`), Kho xưởng `Kho Lucky Star` (ID `3`, `is_oem=1`).
- 3 nguyên liệu: `NL-CHAI` (5.200 đ), `NL-TEM` (1.000 đ), `NL-DV-CHIETROT` (Dịch vụ gia công chiết rót loại SERVICE, 18.000 đ). Tồn kho xưởng 5.000 cái mỗi loại.
- 4 sản phẩm nước lau sàn: Cà phê (`9127`), Chanh sả (`9128`), Quế cam (`9129`), Bạc hà (`9130`), giá cost & xưởng 18.000 đ, cấu hình định mức BOM 1 chai + 1 tem + 1 chiết rót.

### C. Tích Hợp Công Nợ OEM Vào Dòng Tiền & Công Nợ NCC
- `GET /api/cashflow-debts/summary`: Tính tổng nợ gộp cả PO (`purchases.debt_amount`) và OEM (`oem_orders.remaining_payment`).
- `GET /api/cashflow-debts/suppliers`: Trả về `debt = total_debt = debt_company + debt_personal`, sắp xếp nợ giảm dần.
- `receive_oem_order`: Tự động ghi nhận nợ NCC vào `contacts.debt` khi nhận hàng không thanh toán ngay; set `remaining_payment = 0` khi thanh toán ngay.
- Frontend: Bộ lọc và cột Tổng nợ còn lại hiển thị đủ xưởng OEM, nút Trả nợ và Xem đơn nợ OEM hoạt động đồng bộ.

---

## Việc Tiếp Theo

- [ ] Tab UI quản lý nhân viên (Cài Đặt > Nhân Viên)
- [ ] Tab UI lịch sử ca + duyệt ca (accountant)
- [ ] `pos.js` gắn `shift_id` tự động khi tạo đơn (lấy từ `/api/shifts/current`)
- [ ] Báo cáo theo ca (doanh thu, tiền mặt, chênh lệch)
- [ ] Force đổi mật khẩu lần đầu login

**Checkpoint:** 2026-09-19 ~23h30  
**Server:** `http://127.0.0.1:8999` — FastAPI + SQLite (`data/pos.db`)  
**Working dir:** `D:/Projects_Hermes/pos-offline`  

---

## 1. Đã Hoàn Thành Trong Phiên Này ✅

### A. Khắc phục dứt điểm Bảng Giá Đại Lý trên POS
- **Lỗi cũ:** Chọn khách hàng Đại lý (Huỳnh Văn Khoa, nhóm Đại Lý Sỉ, Bảng giá `BG-DAI-LY`), SP0011 đã cài 35.000 đ nhưng POS vẫn hiện giá lẻ 65.000 đ.
- **Nguyên nhân:** Cache JavaScript `posPriceListsCache` bị nghẽn trong RAM và query `GET /api/contacts` thiếu trường bảng giá từ bảng nhóm khách.
- **Đã xử lý:**
  - Đồng bộ query `contacts` sang `LEFT JOIN customer_segments` để trả về `price_list_id` và `segment_name`.
  - Cơ chế `clearPriceListsCache()`: tự động dọn sạch cache khi lưu giá mới, khôi phục giá lẻ, chiết khấu nhanh %, hoặc khi chuyển sang tab Bán Hàng.
  - POS tự động cập nhật lại toàn bộ giỏ hàng (`repriceCartForActiveTab`) khi chọn hoặc đổi khách hàng, hiển thị badge nhóm và nhãn `🏷️ Giá riêng`.

### B. Hạ Tầng CSDL Đa Tài Khoản Sổ Quỹ (Payment Accounts)
- **Tạo mới bảng `payment_accounts` (`database.py`, `data/pos.db`)**:
  - Quản lý tài khoản thanh toán: `code`, `name`, `account_type` (`cash`, `bank`, `ewallet`), `owner_type` (`COMPANY`, `PERSONAL`), `bank_name`, `account_number`, `account_holder`, `initial_balance`, `is_default`, `is_active`.
  - Seed sẵn 3 tài khoản thực tế:
    1. `TM-POS`: Két tiền mặt tại quầy POS (Quỹ Cty, Mặc định).
    2. `VCB-CTY`: Vietcombank Công Ty (Quỹ Cty).
    3. `MB-CANHAN`: MB Bank Cá Nhân (Quỹ Cá Nhân - Chủ Shop).
- **Migration `cashbook.account_id`**:
  - Bổ sung cột `account_id REFERENCES payment_accounts(id)` vào bảng `cashbook`, liên thông nguồn tiền vào/ra theo từng thẻ/két.

### C. Chuẩn Hóa Tiền Tố & Sinh Mã Động Theo Nghiệp Vụ Phát Sinh
- **Hàm tiện ích `generate_cashbook_code(cur, prefix)` (`routers/cashbook.py`)**:
  - Cấu trúc mã: `{PREFIX}-{YYMMDD}-{STT:03d}` (đếm số thứ tự theo ngày, reset mỗi ngày, cam kết `UNIQUE`).
- **Phân loại tiền tố chuẩn kế toán ERP**:
  - `PT-BH`: Thu tiền bán hàng POS (tự động khi tạo hóa đơn đơn hàng).
  - `PT-CN`: Thu hồi công nợ khách sỉ / đại lý.
  - `PT-TT`: Phiếu thu lập tay thủ công tại Sổ Quỹ (cho phép nhập mã tùy ý).
  - `PC-NH`: Chi nhập hàng / thanh toán trả nợ nhà cung cấp.
  - `PC-OEM`: Chi cọc / tất toán đơn gia công xưởng OEM.
  - `PC-CP`: Chi phí vận hành / chi tiêu lập tay thủ công.
- **Đồng bộ hóa các router liên quan**:
  - `routers/pos.py`: Bán hàng POS sinh `PT-BH`, ghi nhận theo `account_id`.
  - `routers/partners.py`: Thu nợ khách sinh `PT-CN`, trả nợ NCC sinh `PC-NH`.
  - `routers/purchases.py`: Phiếu nhập kho trả trước sinh `PC-NH`, map đúng tài khoản theo nguồn quỹ.
  - `routers/oem.py`: Cọc OEM, thanh toán đợt 2, trả nợ xưởng sinh `PC-OEM` / `PC-NH` và gắn `account_id`.

### D. Giao Diện Tab Sổ Quỹ (`#tab-cashbook`) & Quản Lý Đa Tài Khoản
- **Bộ thẻ KPI số dư đa tài khoản**:
  - Hiển thị số dư tức thời từng tài khoản (`current_balance = initial_balance + Thu - Chi`).
  - 1-click vào thẻ tài khoản để lọc nhanh lịch sử dòng tiền của tài khoản đó.
- **Thanh lọc đa chiều & Tìm kiếm tức thì**: Lọc theo tài khoản, loại thu/chi, tìm kiếm theo từ khóa (mã, ghi chú, đối tác, hạng mục).
- **Bảng dữ liệu Sổ Quỹ**: Hiển thị rõ cột Tài khoản (kèm badge `🏢 Quỹ Cty` / `👤 Quỹ Cá Nhân`), đối tác, số tiền (+/-), thời gian.
- **Modal Lập Phiếu Thu / Chi Thủ Công (`#modal-create-cashbook`)**:
  - Chọn Thu / Chi ➔ Gợi ý mã tự động (`PT-TT-...` / `PC-CP-...`) và **cho phép sửa tay mã phiếu**.
  - Dropdown chọn Tài khoản nhận/chi (hiển thị số dư hiện tại), đối tác, và datalist gợi ý nhanh hạng mục thu chi.
- **Modal Quản Lý Danh Mục Tài Khoản (`#modal-payment-accounts` & `#modal-edit-payment-account`)**:
  - Danh sách tài khoản thanh toán, số tài khoản, chủ thẻ, số dư.
  - Thêm mới / Cập nhật tài khoản, chọn loại hình thức (tiền mặt / ngân hàng / ví), đặt tài khoản mặc định.

### E. Màn Hình Bán Hàng POS (`pos.js` & `templates/index.html`)
- Chọn **Tiền mặt**: Tự động liên kết két tiền mặt mặc định (`TM-POS`).
- Chọn **Chuyển khoản / Thẻ / Ví**: Tự động hiển thị dropdown chọn tài khoản ngân hàng thụ hưởng (VCB Cty, MB Cá Nhân...).
- Khi bấm Thanh toán: Gửi `account_id` để ghi sổ quỹ `PT-BH` chuẩn xác theo tài khoản đã chọn.

---

## 2. Kết Quả Kiểm Thử (Verification Suite) 🧪

1. `tests/test_payment_accounts_db.py`: **PASS** (Cấu trúc bảng, migration cột, seed data).
2. `tests/test_cashbook_api.py`: **PASS** (API danh sách tài khoản, tính số dư, API gợi ý mã, lập phiếu tay).
3. `tests/test_flow_code_generation.py`: **PASS** (Luồng POS sinh `PT-BH`, luồng thu nợ sinh `PT-CN`).
4. `tests/test_html_integrity.py`: **PASS 3/3** (Đảm bảo 12 tab chính luôn là con trực tiếp của `#main-content-area`, cấu trúc DOM an toàn tuyệt đối).
5. `node -c static/js/app.js` & `node -c static/js/pos.js`: **PASS** (Cú pháp JS sạch, không lỗi).

---

## 3. Files Đã Chỉnh Sửa

| File | Nội dung thay đổi |
|---|---|
| `database.py` | Tạo bảng `payment_accounts`, thêm cột `cashbook.account_id`, seed 3 tài khoản mặc định |
| `schemas.py` | Schema `PaymentAccountCreate`, `PaymentAccountUpdate`, mở rộng `CashbookCreate`, `OrderCreate` thêm `account_id` |
| `routers/cashbook.py` | Hàm sinh mã `generate_cashbook_code`, API `/api/payment-accounts`, `/api/cashbook/next-code`, tạo phiếu tay |
| `routers/pos.py` | Sinh mã `PT-BH` và map `account_id` khi hoàn tất đơn hàng POS |
| `routers/partners.py` | Sinh mã `PT-CN` (thu nợ khách) và `PC-NH` (trả nợ NCC), map `account_id` |
| `routers/purchases.py` | Sinh mã `PC-NH` khi nhập hàng có trả tiền trước |
| `routers/oem.py` | Sinh mã `PC-OEM` (cọc/tất toán) và `PC-NH` (trả nợ xưởng), map `account_id` |
| `templates/index.html` | Thêm thẻ KPI tài khoản, thanh lọc, modal lập phiếu thu/chi tay, modal quản lý tài khoản, dropdown chọn tài khoản ngân hàng tại POS |
| `static/js/app.js` | Hàm `loadCashbook`, `filterCashbookByAccount`, `openCreateCashModal`, `submitCreateCashbook`, `openPaymentAccountsModal`, `savePaymentAccount` |
| `static/js/pos.js` | Tải danh sách `posPaymentAccounts`, hiển thị dropdown ngân hàng khi chuyển khoản, gửi `account_id` khi submit |
| `tests/test_payment_accounts_db.py` | Test cấu trúc bảng tài khoản và cột migration |
| `tests/test_cashbook_api.py` | Test API tài khoản và sinh mã |
| `tests/test_flow_code_generation.py` | Test luồng sinh mã POS và thu nợ |
| `PROJECT_STATE.md` | Cập nhật checkpoint bàn giao |
