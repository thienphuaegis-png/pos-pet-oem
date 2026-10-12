# Thiết Kế Chi Tiết: Audit Trail Toàn Diện, Trả Nợ NCC Chọn Tài Khoản & Sổ Quỹ Độc Lập

- **Ngày:** 2026-10-12
- **Người duyệt:** Anh Phú
- **Mục tiêu:**
  1. Thêm vết người lập (`created_by`) & người sửa cuối (`updated_by`, `updated_at`) trên tất cả các loại phiếu (Sổ Quỹ, Đơn bán hàng, Nhập hàng, Đổi trả, Hoàn ứng, Dịch vụ Spa, Hotel, Kiểm kê).
  2. Bố cục bảng cuộn ngang (`overflow-x-auto`) chuẩn responsive, không co ép chữ.
  3. Trả nợ Nhà Cung Cấp cho phép chọn tài khoản ngân hàng / tiền mặt (`payment_accounts`) và nguồn quỹ (Công ty / Cá nhân).
  4. Sổ Quỹ độc lập (Phương án A): Cho phép sửa số tiền, ghi chú, tài khoản hoặc xóa phiếu thu tự do mà không ảnh hưởng ràng buộc các phiếu khác.
  5. Đổi tên "Nhờ nhân viên chi hộ" -> **"Lập phiếu chi hoàn ứng"**, hỗ trợ chọn ngày lập phiếu.

---

## 1. CSDL & Migration (Audit Trail Schema)

Thêm các cột sau (dùng `ALTER TABLE ... ADD COLUMN ...` trong khối `try/except` tại `database.py`):

| Bảng | Cột mới bổ sung | Ý nghĩa |
|---|---|---|
| `cashbook` | `created_by TEXT`, `updated_by TEXT`, `updated_at DATETIME` | Người lập, người sửa cuối, ngày giờ sửa |
| `orders` | `created_by TEXT`, `updated_by TEXT`, `updated_at DATETIME` | Người lập đơn (map từ staff_id nếu có), người sửa cuối |
| `purchases` | `created_by TEXT`, `updated_by TEXT`, `updated_at DATETIME` | Người lập phiếu nhập, người duyệt/sửa cuối |
| `order_returns` | `created_by TEXT`, `updated_by TEXT`, `updated_at DATETIME` | Người lập phiếu đổi trả, người sửa |
| `expense_requests` | `expense_date DATE`, `created_by TEXT`, `updated_by TEXT`, `updated_at DATETIME` | Ngày chi tiền thực tế, người lập, người sửa |
| `pet_service_tickets` | `created_by TEXT`, `updated_by TEXT`, `updated_at DATETIME` | Lễ tân nhận bé, kỹ thuật sửa |
| `hotel_bookings` | `created_by TEXT`, `updated_by TEXT`, `updated_at DATETIME` | Người nhận phòng, người sửa |
| `inventory_checks` / `inventory_audits` | `created_by TEXT`, `updated_by TEXT`, `updated_at DATETIME` | Thủ kho kiểm kê, người chốt |

---

## 2. Nghiệp Vụ Backend

### 2.1. Trả Nợ Nhà Cung Cấp (`routers/partners.py` & `routers/oem.py`)
- Schema `ContactPayDebt`: Bổ sung `account_id: Optional[int] = None`, `fund_source: Optional[str] = "COMPANY"`.
- Khi trả nợ NCC:
  - Nếu chọn quỹ công ty (`fund_source == 'COMPANY'`): Trừ `initial_debt_company`.
  - Nếu chọn quỹ cá nhân (`fund_source == 'PERSONAL'`): Trừ `initial_debt_personal`.
  - Trừ tổng `contacts.debt`.
  - Tạo phiếu chi `cashbook`: Lưu đúng `account_id`, `created_by = user.get("name")`, `type='out'`, `category='Chi trả nợ NCC'`.

### 2.2. Sổ Quỹ Độc Lập (Phương án A) (`routers/cashbook.py`)
- **PUT `/api/cashbook/{id}`**: Cho phép sửa bất kỳ phiếu nào (`in` hoặc `out`).
  - Cập nhật: `amount`, `category`, `note`, `account_id`, `created_at` (nếu muốn chỉnh ngày), `updated_by = user["name"]`, `updated_at = CURRENT_TIMESTAMP`.
  - Không động vào bảng `orders`, `spa_wallet_transactions`.
- **DELETE `/api/cashbook/{id}`**: Cho phép xóa bất kỳ phiếu thu hoặc phiếu chi thủ công / liên kết khi người dùng có quyền owner/admin mà không rollback đơn hàng gốc.
- **POST `/api/cashbook`**: Lưu `created_by = user["name"]`, cho phép nhận `created_at` từ giao diện (backdate).

### 2.3. Lập Phiếu Chi Hoàn Ứng (`routers/expense_requests.py`)
- Endpoint POST `/api/expense-requests`: Nhận `expense_date` (mặc định hôm nay nếu để trống), lưu `created_by = user["name"]`.
- Khi duyệt chi: Phiếu chi sổ quỹ sinh ra sẽ kế thừa ngày `expense_date`, `account_id`, và `created_by`.

---

## 3. Giao Diện Người Dùng (UI / UX)

### 3.1. Cuộn Ngang Chuẩn Responsive (`overflow-x-auto`)
- Tất cả các bảng danh sách:
  - `tab-cashbook` (Sổ Quỹ)
  - `tab-orders` (Danh sách đơn hàng)
  - `tab-purchases` (Nhập hàng NCC)
  - `tab-returns` (Đổi trả hàng)
  - `tab-expense-requests` (Phiếu chi hoàn ứng & dự chi)
  - `tab-pet-services` (Tiếp nhận Spa)
  - `tab-hotel` (Khách sạn thú cưng)
- Wrapper bảng bọc trong `<div class="overflow-x-auto w-full">` với `<table class="w-full min-w-[1050px] ...">`. Các cột có `min-w-[...]` cố định, chữ hiển thị rõ ràng, cuộn ngang bằng chuột/trackpad.
- Bổ sung 2 cột hiển thị:
  - **Người lập:** Tên nhân viên hoặc username + ngày tạo.
  - **Người sửa cuối:** Tên nhân viên sửa gần nhất + ngày giờ sửa (hoặc để trống nếu chưa từng sửa).

### 3.2. Modal Trả Nợ NCC (`modal-pay-debt`)
- Thêm Dropdown chọn **Tài khoản thanh toán:** Tự load từ `api/payment-accounts` (Két tiền mặt, MB Bank, v.v.).
- Thêm Segmented Pill / Radio chọn **Nguồn tiền trả:** `[ Quỹ Công Ty ]` / `[ Quỹ Cá Nhân ]`.

### 3.3. Phân Hệ Chi Hoàn Ứng
- Đổi các nút và tiêu đề "Nhờ nhân viên chi hộ" -> **"Lập phiếu chi hoàn ứng"**.
- Form tạo yêu cầu: Thêm trường **Ngày chi tiền:** `<input type="date" id="exp-form-date">`.
