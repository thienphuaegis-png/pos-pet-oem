# PROJECT STATE — POS Offline (Petcare & Retail)

**Checkpoint:** 2026-10-24 — Phân quyền chi tiết (Granular RBAC) cho nhân viên kho (Tách tab Yêu cầu đặt hàng `purchases.request`, khóa Sidebar theo `data-perm`, che công nợ AI Dashboard)
**Lịch sử checkpoint:** `docs/checkpoints/CHECKPOINT_2026_10_23.md`
**Active Plan:** `docs/plans/plan_hrm_payroll_attendance_engine.md`
**Server:** `http://127.0.0.1:8998` — FastAPI + SQLite (`data/pos.db`), bind `0.0.0.0`
**Working dir:** `D:/Projects_Hermes/pos-offline-petcare2`
**Remote:** `https://github.com/thienphuaegis-png/pos-pet-oem.git` (Branch: `main`)
**Version:** `v3.6.30` — Granular RBAC, `purchases.request` permission

---

## 1. Phiên Hiện Tại ✅ (2026-10-24)
- **Phân quyền chi tiết Tab-level (Granular RBAC):**
  - Thêm quyền `purchases.request` vào `PERM_KEYS` và `database.py`, seed tự động cho các role.
  - Gắn `data-perm` vào toàn bộ tab trên thanh Sidebar (`templates/index.html`).
  - Nâng cấp `applyRoleUI()` trong `static/js/auth.js` duyệt đồng thời `data-role` và `Auth.can(data-perm)`.
  - Guard `switchTab()` trong `static/js/app.js` chặn mở tab khi không có quyền.
  - Landing tab thông minh: Nhân viên chỉ có quyền `purchases.request` tự động mở tab `purchase-requests`.
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
- `tests/test_commission_accuracy.py`: 1/1 passed.
- `tests/test_payroll_engine.py`: 14/14 passed.
- `tests/test_hrm_payroll_api.py`: 12/12 passed.
- `tests/test_html_integrity.py`: 5/5 passed.
- `tests/test_ai_byok_staff.py`: 1/1 passed.
- `tests/test_pay_single_order_debt.py`: 3/3 passed.
- Build PyInstaller: `dist/POS_Mastercare.exe` (31.6 MB) thành công.

---

## 3. Files Thay Đổi Chính
| Module / File | Trách nhiệm |
|---|---|
| `services/commission.py` | Tính hoa hồng bán lẻ và dịch vụ spa |
| `services/hrm_schema.py` | DDL và migration bảng HRM, gộp spa staff |
| `services/payroll_engine.py` | Engine tính công, phạt, lương thử việc/chính thức, OT |
| `services/payroll_service.py` | Nghiệp vụ tính lương, chốt kỳ, sinh/hủy phiếu chi sổ quỹ |
| `services/attendance_import.py` | Parser import file Excel vân tay |
| `routers/hrm.py` | RESTful API phân hệ HRM |
| `static/js/modules/hrm.js` | UI logic chấm công & bảng lương |
| `templates/index.html` | Tab `#tab-hrm` và nút sidebar |

---

## 4. Việc Kế Tiếp (Next Priority Tasks) 📌
- [x] Tích hợp phân hệ HRM & Payroll Engine vào POS offline.
- [ ] Khi đóng POS đang chạy (PID 25020, 20692), copy `dist/POS_Mastercare.exe` đè ra gốc và khởi động lại.
- [ ] Nghiệm thu thực tế trên máy chủ tiệm (`verify-server-tailscale-and-toggle`).

## 5. Phiên Bản & Bản Build Hiện Tại
- Bản build EXE: `POS_Mastercare.exe` (31 MB)
- Phiên bản: `v3.6.28` (Build date: `2026.10.23`)
- Nhánh Git: `main` (Đồng bộ sạch sẽ với `origin/main`)
- Bản đồ dự án tương tác: `PROJECT_MAP.html` (Đã cập nhật trọn bộ 6 tính năng đợt 23/10/2026 kèm tính năng Export Markdown).
