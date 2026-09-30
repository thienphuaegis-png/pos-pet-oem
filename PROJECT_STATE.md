# PROJECT STATE — POS Offline (Petcare & Retail)

**Checkpoint:** 2026-09-30 — Mở Rộng Phân Quyền Sổ Quỹ, Dòng Tiền, Khách Hàng Cho Thu Ngân/Thủ Kho & Khử Trùng NCC Khi Import  
**Server:** `http://127.0.0.1:8998` — FastAPI + SQLite (`data/pos.db`)  
**Working dir:** `D:/Projects_Hermes/pos-offline-petcare2`  
**Archive Log:** `docs/archive/STATE_2026_09.md` (lịch sử chi tiết các phiên trước)

---

## 1. Phiên Hiện Tại ✅ (2026-09-30)
- **Mở Rộng Phân Quyền Sidebar & Backend (`rbac-1`):**
  - Mở quyền truy cập trên thanh điều hướng cho 3 tab: `contacts` (Khách Hàng & Đối Tác), `cashbook` (Sổ Quỹ Thu Chi), `cashflow-debts` (Dòng Tiền & Nợ NCC) cho cả 4 vai trò: `owner, accountant, cashier, warehouse`.
  - Cập nhật `DEFAULT_ROLE_PERMS` và tự động migration trong `database.py`: Cấp đầy đủ `cashbook.manage` và `partners.manage` cho `cashier` và `warehouse`.
  - Nới lỏng quyền thanh toán công nợ NCC (`/api/cashflow-debts/pay-supplier`, `/api/cashflow-debts/pay-order`): Cho phép người dùng sở hữu bất kỳ quyền nào trong `oem.manage`, `partners.manage` hoặc `cashbook.manage`.
- **Sửa Lỗi Nhân Đôi Nhà Cung Cấp Khi Import Excel (`contacts-2`):**
  - Hàm làm sạch SĐT `clean_phone_number()` loại bỏ đuôi số thực `.0`, ký tự đặc biệt, khoảng trắng thừa.
  - Cơ chế so khớp 2 tầng bằng Python UTF-8 sạch 100%: Tầng 1 khớp theo SĐT chuẩn hóa; Tầng 2 khớp theo Tên chuẩn hóa `name.strip().lower()`. Khi tìm thấy, thực hiện `UPDATE` và cộng dồn công nợ ban đầu thay vì chèn dòng trùng.
- **Engine & Script Tự Động Khử Trùng Đối Tác Database (`contacts-3`):**
  - Hàm `merge_duplicate_contacts()` trong `database.py` tự động quét các đối tác trùng tên, chọn bản ghi chính `master_id`, dồn công nợ, điểm, số dư ví, chuyển giao khóa ngoại từ 11 bảng (`purchases`, `oem_orders`, `supplier_items`, `inventory_logs`, `warehouses`, `cashbook`, `orders`, `pets`, `pet_service_tickets`, `hotel_bookings`, `spa_wallet_logs`) và dọn dẹp các bản ghi phụ.
  - Cung cấp script dòng lệnh độc lập `scripts/deduplicate_contacts.py`.
- **Đóng Gói Portable Windows Chạy Ngầm Khay Hệ Thống & Auto-Backup Google Drive (`sys-5, sys-6`):**
  - PyInstaller `--noconsole` tích hợp icon khay hệ thống `pystray`, redirect stdio vào `pos_debug.log`.
  - Tích hợp `backup_service.py` chạy ngầm định kỳ 1 giờ/lần sao lưu DB lên Google Drive qua Apps Script Webhook.

---

## 2. Bằng Chứng Kiểm Thử (Verification) 🧪
- `tests/test_rbac_and_supplier_dedup.py`: **PASS 5/5** (Xác minh hiển thị sidebar 4 vai trò, phân quyền DB, engine gộp đối tác trùng, import Excel chống nhân đôi).
- `tests/test_html_integrity.py`: **PASS 5/5** (Toàn vẹn 14 tabs con trực tiếp, 15 nút điều hướng sidebar).
- `tests/test_checkpoint_integrity.py`: **PASS 4/4** (Toàn vẹn Checkpoint Protocol & Roadmap).
- `tests/test_auth.py`: **PASS 8/8** (Xác thực, phân quyền RBAC & ca làm việc).
- `tests/test_spa_wallet_hotel_rules.py`: **PASS 4/4** (Ví Spa không cấn trừ tiền phòng khách sạn).

---

## 3. Files Thay Đổi Chính
| Module / File | Trách nhiệm |
|---|---|
| `templates/index.html` | Mở `data-role` cho `contacts`, `cashbook`, `cashflow-debts` cho `owner,accountant,cashier,warehouse` |
| `database.py` | Cập nhật `DEFAULT_ROLE_PERMS`, migration quyền, bổ sung engine `merge_duplicate_contacts()` |
| `dependencies.py` | Bổ sung helper dependency `require_any_permission()` |
| `routers/oem.py` | Cho phép `oem.manage`, `partners.manage`, `cashbook.manage` thanh toán nợ NCC |
| `routers/partners.py` | Chuẩn hóa SĐT, so khớp kép 2 tầng chống trùng đối tác khi import Excel |
| `scripts/deduplicate_contacts.py` | Script dòng lệnh độc lập quét và gộp đối tác trùng lặp |
| `tests/test_rbac_and_supplier_dedup.py` | Suite kiểm thử tự động toàn diện cho phân quyền và khử trùng đối tác |

---

## 4. Việc Kế Tiếp (Next Priority Tasks) 📌
- [ ] `bill-5`: Kiểm tra và chuẩn hóa in ấn K80/A4 trên máy in vật lý tại quầy thực tế.
- [ ] `cloud-2`: Tích hợp đồng bộ dữ liệu thời gian thực giữa quầy offline và Supabase Cloud.
- [ ] `sys-4`: Chuẩn bị kiến trúc schema & hook cho chức năng AI trợ lý quầy.
