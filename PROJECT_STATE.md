# PROJECT STATE — POS Offline (Petcare & Retail)

**Checkpoint:** 2026-10-25 — Quản lý nhân viên nghỉ việc (HRM/Cài đặt), Triệt tiêu kẹt cửa sổ cập nhật từ xa, Tối ưu bảng Spa & Pancake TMDT (v3.6.35)
**Lịch sử checkpoint:** `docs/checkpoints/CHECKPOINT_2026_10_23.md`
**Active Plan:** `docs/plans/2026-10-24-hrm-staff-full-profile-and-salary-adjustments.md`
**Server:** `http://127.0.0.1:8998` — FastAPI + SQLite (`data/pos.db`), bind `0.0.0.0`
**Working dir:** `D:/Projects_Hermes/pos-offline-petcare2`
**Remote:** `https://github.com/thienphuaegis-png/pos-pet-oem.git` (Branch: `main`)
**Version:** `v3.6.35` — Resigned Staff Lifecycle, Silent Remote Update & Spa Table Optimization

---

## 1. Phiên Hiện Tại ✅ (2026-10-25)
- **Xử lý Nhân Viên Nghỉ Việc & Phân Định HRM vs Hệ Thống:**
  - Bộ lọc 3 trạng thái (Đang làm việc / Đã nghỉ việc / Tất cả) dạng segmented pills đếm số tại tab HRM và Cài Đặt. Mặc định chỉ hiện nhân sự đang làm việc.
  - Nút thao tác "🛑 Nghỉ việc" (gán `is_active=0`, ghi nhận `leave_date`, tăng `token_version` thu hồi phiên đăng nhập) & "↩️ Đi làm lại".
  - Cột `is_payroll_staff` phân biệt tài khoản admin/chủ shop không tính lương; API `POST /api/hrm/employees/{id}/resign` & `rehire`.
- **Khắc phục Triệt Để Kẹt Cửa Sổ Cập Nhật Từ Xa:**
  - Gốc lỗi: `type ... | findstr /v /c:"!TOKEN!"` trong process ngầm tạo console mới và kẹt stdin chờ phím; lộ token ở tiêu đề cửa sổ.
  - Sửa: Loại bỏ `findstr`, thay bằng Python one-liner đọc token từ `khoa_tiem.txt` và lọc log trong RAM; `server.py` thêm cờ `CREATE_NO_WINDOW` & `SW_HIDE`.
- **Tối Ưu Bảng Dịch Vụ Spa & Pancake (POSCAKE):**
  - Bảng Spa: dời dropdown gọi điện xuống dưới SĐT ở cột Khách Hàng (rút từ 12 còn 11 cột), tô nền xanh ngọc (`bg-emerald-50/70`) cho đơn đã thanh toán.
  - Pancake (POSCAKE): đồng bộ 2 shop, tự động trừ tồn kho mọi sàn TMĐT, hoa hồng doanh số theo nhân viên.
- **Mascot Loopy & Month Selector Variant B (2026-10-24):**
  - Sprite Loopy 16f idle + 2f wave hết chớp mắt, câu nói idle 15-30s cho Phi Phụng.
  - Stepper 12 tháng Variant B với badge kỳ lương; Tab Xin Off (`staff_leaves`); quy tắc quẹt thẻ 6 cột.

---

## 2. Bằng Chứng Kiểm Thử (Verification) 🧪
- Deploy & Remote update: 23/23 passed (`tests/test_deploy_scripts.py`, `tests/test_remote_update.py`). Commit `99620ad`, `be54325`.
- HRM Payroll & Staff: 16/16 passed (`tests/test_hrm_payroll_api.py`, `tests/test_hrm_staff_full_profile.py`). Commit `a56149d`.
- Spa table & Auth: 9/9 passed (`tests/test_spa_table_call_and_paid_row.py`, `tests/test_auth.py`). Commit `37f7dda`.
- `tests/test_checkpoint_integrity.py` & `tests/test_html_integrity.py`: 9/9 passed.
- PyInstaller Build: `POS_Mastercare.exe` (32.1 MB) rebuild sạch và khởi động nền thành công.
- Background Server: `http://127.0.0.1:8998/api/ping` -> ONLINE.

---

## 3. Files Thay Đổi Chính
- `deploy/CAP_NHAT.bat` & `server.py`: Triệt tiêu kẹt console, xóa pipe findstr, giấu token.
- `routers/hrm.py` & `services/payroll_service.py`: Endpoint resign/rehire, phân loại `is_payroll_staff`.
- `routers/auth.py` & `static/js/staff.js`: Lọc nhân viên cài đặt, xử lý `is_active` và `leave_date`.
- `static/js/modules/hrm.js` & `templates/index.html`: Pills lọc HRM (active/resigned/all), nút "🛑 Nghỉ việc".
- `static/js/modules/spa.js`: Dời selector gọi điện dưới SĐT, highlight dòng đã thanh toán màu xanh ngọc.

---

## 4. Việc Kế Tiếp (Next Priority Tasks) 📌
- [ ] Khóa chỉnh sửa trực tiếp trên lưới lương (bỏ nút Sửa số để bảo toàn tính bất biến kế toán).
- [ ] Bỏ droplist dư "Loại điều chỉnh" trong modal điều chỉnh lương (chỉ giữ 2 ô Lương CB & Phụ cấp).
- [ ] Bảng riêng quản lý Nhân Viên Miễn Chấm Công (mặc định đủ công trừ off chế độ & xin off).
- [ ] Nút tự báo công Check-in/Check-out trên trang Phiếu Lương cho nhân sự Remote.
- [ ] Chuẩn hóa parser máy chấm công vân tay (format DD/MM/YYYY) & tính lương Sales Pancake (KPI 85%/100%), Part-time theo giờ.

---

## 5. Phiên Bản & Bản Build Hiện Tại
- Bản build EXE: `POS_Mastercare.exe` v3.6.35 (PyInstaller standalone)
- Nhánh Git: `main` | Test suite: 100% PASS
