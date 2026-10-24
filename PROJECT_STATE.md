# PROJECT STATE — POS Offline (Petcare & Retail)

**Checkpoint:** 2026-10-24 — HRM Month Selector Variant B, Tab Xin Off & Nhận diện quẹt thẻ 6 cột (v3.6.34)
**Lịch sử checkpoint:** `docs/checkpoints/CHECKPOINT_2026_10_23.md`
**Active Plan:** `docs/plans/2026-10-24-hrm-staff-full-profile-and-salary-adjustments.md`
**Server:** `http://127.0.0.1:8998` — FastAPI + SQLite (`data/pos.db`), bind `0.0.0.0`
**Working dir:** `D:/Projects_Hermes/pos-offline-petcare2`
**Remote:** `https://github.com/thienphuaegis-png/pos-pet-oem.git` (Branch: `main`)
**Version:** `v3.6.34` — HRM Month Selector Variant B, Leaves Management & 6-Col Punches

---

## 1. Phiên Hiện Tại ✅ (2026-10-24)
- **Month Selector Variant B:**
  - Stepper `[◀] [Tháng MM/YYYY ▾] [▶] [Hôm Nay]` với menu dropdown 12 tháng theo năm.
  - Hiển thị badge trạng thái kỳ lương trực quan: Tạm tính (amber), Đã chốt (blue), Đã chi (emerald).
  - API `GET /api/hrm/periods?year=YYYY` trả về trạng thái kỳ lương 12 tháng.
- **Tab Xin Off (#hrm-subtab-leaves):**
  - Đặt vị trí chuẩn giữa Chấm Công và Tăng Ca.
  - Bảng DB `staff_leaves` (`id, staff_id, work_date, leave_type, reason, approved_by, created_at`).
  - API RESTful: `GET /api/hrm/leaves?month=YYYY-MM`, `POST /api/hrm/leaves`, `DELETE /api/hrm/leaves/{id}`.
  - Tự động đồng bộ sang `staff_attendance` (`leave_type`, `waive=1`, `note=reason`).
  - API `POST /api/hrm/leaves/sync-sheets` đồng bộ đơn xin nghỉ từ Google Sheet GID `1879481422`.
  - Giao diện: Subtab Xin Off với bộ lọc nhân viên/tháng, bảng danh sách, modal `#modal-hrm-leave`, nút tạo đơn và đồng bộ Google Sheets.
- **Nhận diện quẹt thẻ 6 cột & Quy tắc Nghỉ phép (services/payroll_engine.py):**
  - `off`: `res.code = 'OFF'`, `res.penalty = 0`, không tính vi phạm vắng.
  - `off_morning` (ca chiều 13:30 - 17:30/18:00): 1 punch <= 930 (15:30) -> check-in, > 930 -> check-out. Miễn phạt thiếu giờ vào/ra và vắng do có phép sáng, tính 0.5 công (`X/2` hoặc `TV/2`).
  - `off_afternoon` (ca sáng 08:00 - 12:00): 1 punch < 630 (10:30) -> check-in, >= 630 -> check-out. Miễn phạt thiếu giờ ra và về sớm sau 12:00, tính 0.5 công (`X/2` hoặc `TV/2`).
- **Build & Kiểm thử:**
  - Test suite đạt **860/860 tests PASS (100%)**, 10 skipped.
  - Build EXE PyInstaller: `POS_Mastercare.exe` (31.7 MB) thành công và khởi động máy chủ nền.

---

## 2. Bằng Chứng Kiểm Thử (Verification) 🧪
- `tests/test_hrm_leaves_and_six_col_punches.py`: 13/13 passed (Full coverage Variant B, leaves CRUD, sync sheets, 6-col punch thresholds).
- `tests/test_checkpoint_integrity.py`: 4/4 passed (PROJECT_STATE.md compact < 100 lines).
- `tests/test_payroll_engine.py`: 14/14 passed.
- `tests/test_hrm_payroll_api.py`: 12/12 passed.
- `tests/test_html_integrity.py`: 5/5 passed.
- Build PyInstaller: `dist/POS_Mastercare.exe` (31.7 MB) thành công.
- Background Server: `http://127.0.0.1:8998/api/ping` -> `v3.6.50` ONLINE.

---

## 3. Files Thay Đổi Chính
- `services/payroll_engine.py`: Nhận diện quẹt thẻ 6 cột, miễn phạt phép sáng/chiều, phân loại công nửa ngày
- `services/hrm_schema.py`: Schema `staff_leaves` có khóa ngoại và index theo ngày
- `services/payroll_service.py`: Tích hợp dự phòng đọc phép từ `staff_leaves` khi tính ngày công
- `routers/hrm.py`: Endpoints `/api/hrm/periods`, `/api/hrm/leaves` (CRUD), `/api/hrm/leaves/sync-sheets`
- `templates/index.html`: Month selector Variant B, subtab `#hrm-subtab-leaves`, modal `#modal-hrm-leave`
- `static/js/modules/hrm.js`: Logic dropdown tháng với status badges, render và xử lý sự kiện Xin Off
- `tests/test_hrm_leaves_and_six_col_punches.py`: Bộ 13 bài test kiểm thử toàn diện

---

## 4. Việc Kế Tiếp (Next Priority Tasks) 📌
- [x] Triển khai Month Selector Variant B và Tab Xin Off.
- [x] Tích hợp quy tắc 6 cột chấm công và đồng bộ Google Sheets tab XIN OFF.
- [ ] Tích hợp thông báo Telegram bot khi nhân sự nộp đơn xin off mới.

---

## 5. Phiên Bản & Bản Build Hiện Tại
- Bản build EXE: `POS_Mastercare.exe` v3.6.34 (PyInstaller standalone)
- Nhánh Git: `main` | Test suite: 100% PASS (860 passed, 10 skipped)
