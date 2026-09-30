# Thiết Kế: Mở Rộng Phân Quyền & Chống Trùng Nhà Cung Cấp Khi Import Excel

**Mã thiết kế:** `2026-09-30-rbac-expansion-and-supplier-dedup-design`  
**Ngày:** 30/09/2026  
**Trạng thái:** Đã duyệt (Approved - Phương án B)

---

## 1. Bối Cảnh & Vấn Đề

1. **Giới hạn hiển thị Sidebar & Quyền hạn (RBAC):**
   - 3 module cốt lõi: **Khách Hàng & Đối Tác** (`tab-contacts`), **Sổ Quỹ Thu Chi** (`tab-cashbook`), và **Dòng Tiền & Nợ NCC** (`tab-cashflow-debts`) đang bị giới hạn cứng `data-role="accountant,owner"` trong `templates/index.html`.
   - Các vai trò **Thủ kho** (`warehouse`) và **Thu ngân** (`cashier`) không nhìn thấy các tab này trên thanh điều hướng bên trái.
   - Bảng cơ sở dữ liệu `role_permissions` mặc định chưa gán quyền `partners.manage` và `cashbook.manage` cho `cashier` và `warehouse`, dẫn đến nếu truy cập API sẽ bị từ chối 403.

2. **Trùng lặp Nhà cung cấp khi Import từ Excel:**
   - Trong `routers/partners.py`, endpoint `/import-excel` chỉ kiểm tra trùng duy nhất trường `phone`.
   - Đối với nhà cung cấp (NCC), số điện thoại thường bị thiếu, hoặc đọc từ Excel bị biến dạng thành số thực (ví dụ `901234567.0`), hoặc định dạng có khoảng trắng/dấu chấm.
   - Khi không tìm thấy theo `phone`, hệ thống lập tức chèn dòng mới (`INSERT`), dẫn đến các NCC cùng tên bị nhân bản nhiều lần trong hệ thống, chia cắt lịch sử nhập hàng và theo dõi công nợ.

---

## 2. Giải Pháp Chi Tiết

### 2.1. Mở Rộng Phân Quyền (RBAC Expansion)
1. **Frontend (`templates/index.html`):**
   - Cập nhật `data-role` cho 3 nút chuyển tab:
     - `tab-btn[data-tab="contacts"]`: `data-role="owner,accountant,cashier,warehouse"`
     - `tab-btn[data-tab="cashbook"]`: `data-role="accountant,owner,cashier,warehouse"`
     - `tab-btn[data-tab="cashflow-debts"]`: `data-role="accountant,owner,cashier,warehouse"`
2. **Backend & Cơ Sở Dữ Liệu (`database.py`):**
   - Cập nhật `DEFAULT_ROLE_PERMS`:
     - `cashier`: bổ sung `"cashbook.manage"`, `"partners.manage"`
     - `warehouse`: bổ sung `"cashbook.manage"`, `"partners.manage"`
   - Viết migration đảm bảo các quyền này được ghi nhận ngay vào bảng `role_permissions` đối với cả cơ sở dữ liệu hiện hữu.
3. **Endpoint quyền thanh toán công nợ (`routers/oem.py`):**
   - Nới lỏng kiểm tra quyền tại `/api/cashflow-debts/pay-supplier` và `/api/cashflow-debts/pay-order`: chấp nhận người dùng có quyền `oem.manage`, `partners.manage` hoặc `cashbook.manage`.

---

### 2.2. Thuật Toán Chống Trùng & Nhận Diện Đối Tác Khi Import Excel
1. **Chuẩn hóa dữ liệu:**
   - Hàm `clean_phone(phone_raw)`: Chuyển chuỗi, loại bỏ đuôi `.0`, bỏ khoảng trắng, dấu ngoặc, gạch ngang.
   - Hàm `clean_name(name_raw)`: Cắt khoảng trắng đầu cuối, chuyển về dạng so sánh không phân biệt hoa thường (`LOWER(TRIM(name))`).
2. **Chiến lược so khớp kép (2-Tier Matching):**
   - **Tầng 1 (SĐT):** Nếu có SĐT hợp lệ, tìm kiếm `SELECT id FROM contacts WHERE phone = ? AND type = ?`.
   - **Tầng 2 (Tên đối tác):** Nếu không khớp SĐT hoặc SĐT rỗng, tìm kiếm `SELECT id FROM contacts WHERE LOWER(TRIM(name)) = LOWER(TRIM(?)) AND type = ?`.
3. **Hành vi khi tìm thấy bản ghi (Update/Merge):**
   - Cập nhật địa chỉ (nếu dòng mới có dữ liệu).
   - Bổ sung SĐT nếu bản ghi cũ đang rỗng.
   - Tích lũy công nợ ban đầu (nếu có trong file Excel).
   - Ghi nhận `updated += 1` thay vì tạo bản ghi trùng lặp.

---

### 2.3. Cơ Chế Khử Trùng & Hợp Nhất NCC Hiện Hữu (Phương án B)
1. **Nguyên lý hợp nhất (Deduplication Engine):**
   - Quét tìm các nhóm đối tác có `LOWER(TRIM(name))` và `type` giống nhau có từ 2 bản ghi trở lên.
   - Chọn bản ghi chính (`master_id`): Bản ghi có ID nhỏ nhất hoặc có số điện thoại/lịch sử giao dịch nhiều nhất.
   - Dồn toàn bộ công nợ `debt` từ các bản ghi trùng sang `master_id`.
   - Cập nhật lại toàn bộ khóa ngoại (Foreign Keys) liên kết:
     - `purchases.supplier_id`
     - `oem_orders.partner_id`
     - `supplier_items.supplier_id` (xử lý xung đột unique constraint)
     - `inventory_logs.supplier_id`
     - `warehouses.supplier_id`
     - `cashbook.contact_id`
     - Các bảng khách hàng: `orders.customer_id`, `pets.customer_id`, `pet_service_tickets.customer_id`, `hotel_bookings.customer_id`.
   - Xóa các bản ghi trùng lặp phụ khỏi bảng `contacts`.
2. **Khởi chạy:**
   - Tự động thực thi migration khử trùng khi khởi động database trong `database.py`.
   - Cung cấp script độc lập `scripts/deduplicate_contacts.py` cho quản trị viên chủ động chạy kiểm tra và đối soát.

---

## 3. Kế Hoạch Kiểm Thử (Verification Plan)

1. **Kiểm thử phân quyền:**
   - Đăng nhập tài khoản `warehouse` (`phiphung`) và `cashier` (`quedon`):
     - Xác nhận xuất hiện đủ 3 tab: Khách Hàng, Sổ Quỹ, Dòng Tiền & Nợ NCC.
     - Kiểm tra gọi API `/api/contacts`, `/api/cashbook`, `/api/cashflow-debts/summary` trả về HTTP 200 thay vì 403.
2. **Kiểm thử Import Excel chống trùng:**
   - Viết test tạo file Excel giả lập: 2 dòng cùng tên nhà cung cấp (1 dòng có SĐT, 1 dòng không có hoặc SĐT định dạng khác).
   - Kiểm tra kết quả import: Chỉ tạo 1 nhà cung cấp duy nhất, dòng sau cập nhật thông tin dòng trước.
3. **Kiểm thử Deduplication Script:**
   - Tạo dữ liệu mẫu 2 nhà cung cấp trùng tên trong SQLite test.
   - Chạy hàm gộp, đối soát công nợ tổng và khóa ngoại đơn hàng chuyển giao toàn vẹn về `master_id`.
4. **Kiểm thử không gây hồi quy (Regression Test):**
   - Chạy toàn bộ test suites hiện hữu (`test_html_integrity.py`, `test_checkpoint_integrity.py`, `test_auth.py`).
