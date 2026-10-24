# PROJECT STATE — POS Offline (Petcare & Retail)

**Checkpoint:** 2026-10-24 — Hồ sơ Nhân sự Toàn diện & Quản lý Điều chỉnh Lương theo tháng (Google Sheets Sync, Subtab Điều chỉnh lương, Modal 3 Tab)
**Lịch sử checkpoint:** `docs/checkpoints/CHECKPOINT_2026_10_23.md`
**Active Plan:** `docs/plans/2026-10-24-hrm-staff-full-profile-and-salary-adjustments.md`
**Server:** `http://127.0.0.1:8998` — FastAPI + SQLite (`data/pos.db`), bind `0.0.0.0`
**Working dir:** `D:/Projects_Hermes/pos-offline-petcare2`
**Remote:** `https://github.com/thienphuaegis-png/pos-pet-oem.git` (Branch: `main`)
**Version:** `v3.6.31` — Comprehensive HRM Staff Profile & Monthly Salary Adjustments Engine

---

## 1. Phiên Hiện Tại ✅ (2026-10-24)
- **Hồ Sơ Nhân Sự Toàn Diện & Quản Lý Điều Chỉnh Lương Theo Tháng (Google Sheets Sync):**
  - Mở rộng bảng `staff` thêm 10 trường cá nhân & pháp lý: `gender`, `department`, `id_card_number` (CCCD 12 số), `id_card_date`, `id_card_place`, `permanent_address`, `temporary_address`, `email`, `emergency_phone`, `emergency_relation`.
  - Mở rộng bảng `hrm_salary_adjustments`: thêm `decision_date`, `adjustment_type` ('salary' | 'allowance' | 'mixed').
  - Module tính toán động (`services/payroll_service.py`): tính thâm niên tự động (`calculate_tenure`), lũy kế điều chỉnh lương theo ngày hiệu lực (`compute_staff_virtual_fields`), phân loại tình trạng hợp đồng (`Chính thức`/`Thử việc`/`Nghỉ việc`).
  - API endpoints mới: `GET /api/hrm/adjustments` (lọc theo tháng & nhân viên), `DELETE /api/hrm/adjustments/{id}` (guard khóa kỳ lương), cập nhật `GET /api/hrm/employees` enrich đầy đủ các chỉ số tài chính.
  - Script import 1-chạm `scripts/import_hrm_from_sheets.py`: nạp chuẩn xác 17 nhân sự và 16 quyết định điều chỉnh lương lịch sử từ 2 tab Google Sheet thật của cửa hàng vào database.
  - Subtab mới `[⚖️ Điều Chỉnh Lương]` trong phân hệ HRM: bảng theo dõi lịch sử quyết định, bộ lọc theo nhân viên, modal tạo quyết định có format realtime tiền tệ.
  - Nâng cấp Modal Hồ sơ Nhân sự `#modal-hrm-staff-profile` thành 3 Tab trực quan (`💼 Công Việc & Lương`, `🪪 Cá Nhân & CCCD`, `🏦 Ngân Hàng & Khẩn Cấp`).
  - Mở rộng bảng danh sách nhân sự trên subtab `Nhân Sự` hiển thị 12 cột đối soát chi tiết: Mã NV, Tên, Bộ phận, Khối ca, Lương gốc, Đ/C Lương (badge click xem lịch sử), Lương CB hiện tại, Phụ cấp, Tổng lương, Thâm niên, Tình trạng, TK Đăng nhập, Thao tác.
  - Sửa dứt điểm 4 lỗi test suite cơ sở (`authed_downloads`, `tailscale deploy`, `sidebar count`, `purchase ref_type`), đạt **835/835 tests PASS** 100%. Rebuild EXE `POS_Mastercare.exe` (31.69 MB) thành công.
- **Quyết toán Đơn Gia Công OEM 2 Chặng & Cơ chế Khử Sai Số Làm Tròn 1 Đồng:**
  - Khắc phục lỗi chặn thanh toán công nợ do sai số làm tròn 1 đồng (`req.amount > order_debt + 1.0` thay vì `+ 0.01` trong `routers/oem.py:pay_single_order_debt` và `pay_supplier_debt`).
  - Tự động cấn trừ dứt điểm nợ về `0.0` đ khi chênh lệch $\le 1$ đ, chuyển trạng thái đơn sang `PAID` và làm sạch `contacts.debt`.
  - Khắc phục bẫy lệnh sửa đơn `update_oem_order` xóa đè số lượng đặt ban đầu: bảo toàn `ordered_qty` gốc khi đơn đã nhận hàng (`RECEIVED`/`COMPLETED`).
  - Giao diện Modal Chi tiết OEM (`static/js/modules/productions.js`): bổ sung bảng đối soát 2 chặng tài chính trực quan (Hợp đồng cọc ban đầu vs Quyết toán thực nhận tại kho, tính chi tiết thừa/thiếu từng sản phẩm, tiền cọc cấn trừ và công nợ đợt 2).
  - Bảng Công nợ NCC (`static/js/modules/cashflow.js`): hiển thị badge đối soát kèm làm tròn số tiền thanh toán 1-chạm không bị lỗi.
  - Khôi phục dữ liệu chuẩn cho đơn `OEM-20261015-001` (Lucky Star): Đặt 1.800/món, Nhận 954, 993, 1501, cọc 50% là 49.377.600 đ, nợ đợt 2 là 15.571.135 đ.
- **Quản lý Nhân sự Kép (Dual-Purpose Staff: Hồ sơ nội bộ HRM vs Tài khoản đăng nhập POS):**
  - Tách bạch hồ sơ nhân sự nội bộ (chấm công vân tay `device_code`, bảng lương, tạm ứng, hoa hồng) và tài khoản POS (`username`, `password_hash`, `role`).
  - Hỗ trợ tạo nhân sự không cần tài khoản đăng nhập (`username=NULL`, `password_hash=NULL`, `role='staff'`).
  - Bổ sung công tắc toggle "Cấp tài khoản đăng nhập POS" trên modal thêm/sửa nhân viên `#modal-staff`.
  - Hỗ trợ cấp tài khoản sau này (Promote) và thu hồi tài khoản an toàn (Demote về hồ sơ nội bộ, thu hồi token JWT ngay mà không xóa dữ liệu nhân sự).
  - Kiểm tra an toàn tại cổng đăng nhập `/api/auth/login` và API reset mật khẩu `/api/auth/staff/{id}/reset-password`.
- **Phân quyền chi tiết Tab-level (Granular RBAC) & Chọn nhân viên yêu cầu đặt hàng:**
  - Thêm quyền `purchases.request` vào `PERM_KEYS` và `database.py`, seed tự động cho các role.
  - Gắn `data-perm` vào toàn bộ tab trên thanh Sidebar (`templates/index.html`).
  - Nâng cấp `applyRoleUI()` trong `static/js/auth.js` duyệt đồng thời `data-role` và `Auth.can(data-perm)`.
  - Guard `switchTab()` trong `static/js/app.js` chặn mở tab khi không có quyền.
  - Đổi trường "Bộ phận yêu cầu" thành "Nhân viên yêu cầu": Nạp động danh sách nhân viên active, tự động chọn tài khoản đang đăng nhập, lưu `staff_id` và `created_by` vào DB `purchase_requests`.
  - Hiển thị danh tính người yêu cầu kèm badge vai trò trong bảng lịch sử và thông báo nhắc việc Thủ Kho.
  - Che dữ liệu nhạy cảm trên AI Hub: Ẩn số nợ NCC/xưởng và lô hàng về ở cả Backend (`ai_assistant.py`) và Frontend (`ai_agent.js`) khi thiếu quyền `purchases.manage`.
  - Bảo vệ API `/api/purchase-requests` bằng `require_any_permission("purchases.request", "purchases.manage")`.

---

## 2. Phiên Trước ✅ (2026-10-23)
- **Sửa triệt để 5 lỗi hoa hồng cũ:**
  - Hoa hồng bán lẻ tính theo doanh thu thuần `(total_amount - discount)`, trừ hàng trả lại, bỏ đơn nháp/hủy.
  - Tự động tính lại khi sửa đơn hoặc gán lại nhân viên hàng loạt. Hoa hồng combo tính theo doanh thu thuần.
- **Phân hệ HRM & Schema DB (`services/hrm_schema.py`):**
  - Mở rộng `staff` (`employee_code`, `device_code`, `official_date`, `base_salary_probation`, `work_block_id`).
  - Gộp thợ Spa vào `staff` (`is_spa_worker=1`), 8 bảng mới: khối làm việc, ngày lễ, tăng lương, chấm công, tăng ca, tạm ứng, quy tắc spa, bảng lương.
- **Engine Chấm Công & Bảng Lương 4 Tầng (`services/payroll_engine.py`, `services/payroll_service.py`):**
  - Phạt trễ chuẩn 5.000đ/phút; trễ > 30 phút phạt 200.000đ; quên quẹt phạt 50.000đ nhưng vẫn tính nửa công.
  - Nghỉ không phép phạt 500.000đ chỉ tính từ ngày nhận việc. Phân tách thử việc 85% / chính thức 100%.
  - Thưởng chuyên cần 500.000đ khi đi làm đủ ngày công chuẩn không vi phạm. Tăng ca hệ số 1.5.
  - Tích hợp Sổ Quỹ: Sinh phiếu chi `PC-LG` khi trả lương, tự động revert trạng thái khi xóa phiếu chi.
- **Giao diện & API:**
  - `routers/hrm.py` (16 endpoints RESTful, RBAC `payroll.manage`).
  - Frontend: Nút "Chấm Công & Lương" trên sidebar, container `#tab-hrm` với 5 subtab và module `hrm.js`.

---

## 2. Bằng Chứng Kiểm Thử (Verification) 🧪
- `tests/test_oem_reconciliation_debt.py`: 1/1 passed (Toàn bộ chu trình quyết toán đơn OEM, bảo toàn SL đặt ban đầu khi sửa đơn, tự động khử sai số 1 đồng khi thanh toán nợ đơn lẻ).
- `tests/test_staff_dual_purpose_auth.py`: 1/1 passed (Toàn bộ chu trình tạo nhân sự không tài khoản, bảo vệ đăng nhập, cấp tài khoản sau, và thu hồi tài khoản).
- `tests/test_commission_accuracy.py`: 1/1 passed.
- `tests/test_payroll_engine.py`: 14/14 passed.
- `tests/test_hrm_payroll_api.py`: 12/12 passed.
- `tests/test_html_integrity.py`: 5/5 passed.
- `tests/test_ai_byok_staff.py`: 1/1 passed.
- `tests/test_pay_single_order_debt.py`: 3/3 passed.
- Build PyInstaller: `dist/POS_Mastercare.exe` (31.6 MB) thành công.

---

## 3. Files Thay Đổi Chính
- `services/payroll_engine.py`: Biểu thuế TNCN 7 bậc, trừ BHXH 10.5%, engine tính lương
- `services/hrm_schema.py`: Schema HRM, staff 10 trường cá nhân & chế độ HĐ/bảo hiểm
- `services/payroll_service.py`: Pipeline tính lương, thâm niên, điều chỉnh lương lũy kế
- `routers/hrm.py`: API HRM nhân sự, quy định doanh nghiệp, điều chỉnh lương
- `templates/index.html` & `static/js/modules/hrm.js`: UI HRM, 3-tab modal, bảng lương, subtab điều chỉnh

---

## 4. Việc Kế Tiếp (Next Priority Tasks) 📌
- [x] Tích hợp phân hệ HRM & Payroll Engine vào POS offline.
- [x] Nạp dữ liệu tạm ứng và chấm công Tháng 9/2026 từ Google Sheet.

---

## 5. Phiên Bản & Bản Build Hiện Tại
- Bản build EXE: `POS_Mastercare.exe` v3.6.32
- Nhánh Git: `main` | Test suite: 100% PASS
