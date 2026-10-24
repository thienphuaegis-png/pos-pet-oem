# Implementation Plan: Hồ Sơ Nhân Sự Toàn Diện & Quản Lý Điều Chỉnh Lương Theo Tháng (Google Sheets Sync)

> **For agentic workers:** REQUIRED SUB-SKILL: Use subagent-driven-development or executing-plans.

**Goal:** Hoàn thiện 100% hồ sơ nhân sự theo chuẩn Google Sheet thực tế của cửa hàng (bổ sung 10 trường pháp lý/cá nhân/khẩn cấp), xây dựng subtab & cơ chế quản lý quyết định "Điều chỉnh lương theo tháng", và nạp dữ liệu lịch sử từ Google Sheet vào SQLite không mất mát dữ liệu.

**Architecture:** Mở rộng bảng `staff` (thêm 10 cột mới) và bảng `hrm_salary_adjustments` (thêm `decision_date`, `adjustment_type`). Chuẩn hóa tính toán động các trường biến thiên (Thâm niên, Lương cơ bản hiệu lực theo ngày, Phụ cấp hiệu lực theo ngày, Tình trạng hợp đồng) theo `hrm-dynamic-payroll-engine-v3`. Cung cấp subtab "Điều chỉnh lương" độc lập trong phân hệ HRM và nâng cấp modal hồ sơ nhân viên 3 nhóm thông tin.

**Tech Stack:** Python 3.11, FastAPI, SQLite, Pydantic v2, Vanilla JS (ES6 modules), Tailwind CSS, OpenPyXL / Requests.

---

## Global Constraints

- **Python & Pytest:** Dùng đúng binary: `"D:/Projects_Hermes/pos-offline-petcare2/.venv/Scripts/python.exe" -m pytest -q -p no:cacheprovider`.
- **Database:** SQLite tại `data/pos.db`. Mọi thay đổi schema phải idempotent trong `services/hrm_schema.py:ensure_hrm_schema()`.
- **Formatting tiền tệ:** Bắt buộc dùng `formatCurrencyInputRealtime(this)` trên mọi input tiền tệ mới trong UI.
- **Không phá vỡ dữ liệu cũ:** Bảng lương các tháng đã khóa (`locked`/`paid`) tuyệt đối không bị thay đổi số tiền khi thêm quyết định điều chỉnh mới.
- **Build EXE:** Sau khi hoàn thành và tất cả test pass, rebuild: `"D:/Projects_Hermes/pos-offline-petcare2/.venv/Scripts/python.exe" -m PyInstaller POS_Mastercare.spec`.

---

## Scope Boundary & Anti-Drift Guards (Strict)

1. **Chạm đúng biên:** Chỉ sửa đúng các file được chỉ định: `services/hrm_schema.py`, `schemas.py`, `routers/hrm.py`, `services/payroll_service.py`, `templates/index.html`, `static/js/modules/hrm.js`, và tạo test mới. Không sửa logic bán hàng POS hay kho ngoài luồng.
2. **Bằng chứng test thực tế:** Chạy test thật qua terminal và đối soát output trước khi chuyển task.
3. **Tuần tự theo nấc:** Hoàn thành từng task, test pass 100% mới chuyển task tiếp theo.

---

## File Structure Map

| File | Hành động | Trách nhiệm |
|---|---|---|
| `services/hrm_schema.py` | Modify | Thêm 10 cột nhân sự vào `STAFF_HR_COLUMNS`, cập nhật `hrm_salary_adjustments` (`decision_date`, `adjustment_type`) |
| `schemas.py` | Modify | Thêm các trường vào `StaffIn`, `StaffOut`, `AdjustmentIn`, `AdjustmentOut` |
| `services/payroll_service.py` | Modify | Thêm helper tính toán động `compute_staff_virtual_fields()` (thâm niên, lương sau ĐC, tình trạng) |
| `routers/hrm.py` | Modify | Nâng cấp CRUD nhân viên trả về các trường mở rộng, bổ sung API `/api/hrm/adjustments` (GET all, DELETE) |
| `scripts/import_hrm_from_sheets.py` | Create | Script import 17 nhân viên & 16 quyết định điều chỉnh lương từ Google Sheet thật |
| `templates/index.html` | Modify | Thêm subtab "Điều chỉnh lương" (`#hrm-subtab-adjustments`), mở rộng bảng `#table-hrm-staff`, nâng cấp modal `#modal-hrm-staff-profile` |
| `static/js/modules/hrm.js` | Modify | Thêm controller cho subtab Điều chỉnh lương, render bảng nhân sự mở rộng, modal 3 tab |
| `tests/test_hrm_staff_full_profile.py` | Create | Unit test cho schema, CRUD nhân viên đầy đủ và các trường tính toán động |
| `tests/test_hrm_salary_adjustments_workflow.py` | Create | Unit test cho workflow điều chỉnh lương theo tháng, immutability guard |

---

### Task 1: Mở rộng Schema Database & Model Pydantic

**Files:**
- Modify: `services/hrm_schema.py:12-30`, `services/hrm_schema.py:69-80`
- Modify: `schemas.py`
- Modify: `services/payroll_service.py`
- Test: `tests/test_hrm_staff_full_profile.py`

- [ ] **Step 1: Viết failing test kiểm tra schema mới và trường tính toán động**
  Tạo `tests/test_hrm_staff_full_profile.py`:
  - Kiểm tra bảng `staff` có đủ 10 cột mới (`gender`, `department`, `id_card_number`, `id_card_date`, `id_card_place`, `permanent_address`, `temporary_address`, `email`, `emergency_phone`, `emergency_relation`).
  - Kiểm tra bảng `hrm_salary_adjustments` có đủ cột `decision_date`, `adjustment_type`.
  - Kiểm tra helper `compute_staff_virtual_fields()` tính đúng thâm niên ("1 năm 5 tháng 22 ngày"), lương cơ bản sau ĐC, phụ cấp sau ĐC, tình trạng ("Chính thức" / "Thử việc" / "Nghỉ việc").

- [ ] **Step 2: Chạy test để xác nhận test ĐỎ (Fails)**
  Chạy: `"D:/Projects_Hermes/pos-offline-petcare2/.venv/Scripts/python.exe" -m pytest -q -p no:cacheprovider tests/test_hrm_staff_full_profile.py`

- [ ] **Step 3: Triển khai mở rộng Schema trong `services/hrm_schema.py` và `schemas.py`**
  - Cập nhật `STAFF_HR_COLUMNS` trong `services/hrm_schema.py` bổ sung 10 trường.
  - Cập nhật `ensure_hrm_schema(cur)` để ALTER bảng `hrm_salary_adjustments` nếu thiếu `decision_date` và `adjustment_type`.
  - Bổ sung hàm tính thâm niên `calculate_tenure(hire_date, end_date=None)` và `compute_staff_virtual_fields(staff, as_of_date=None)` vào `services/payroll_service.py`.
  - Cập nhật Pydantic models trong `schemas.py`: `StaffIn`, `StaffOut`, `AdjustmentIn`, `AdjustmentOut`.

- [ ] **Step 4: Chạy test để xác nhận test XANH (Passes)**

---

### Task 2: Nâng cấp API Endpoints Nhân sự & Điều chỉnh Lương Toàn diện

**Files:**
- Modify: `routers/hrm.py`
- Test: `tests/test_hrm_salary_adjustments_workflow.py`

- [ ] **Step 1: Viết failing test kiểm tra các API endpoints mới**
  Tạo `tests/test_hrm_salary_adjustments_workflow.py`:
  - `GET /api/hrm/employees`: Trả về mảng nhân viên kèm các trường tính toán động (`tenure`, `base_salary_effective`, `allowance_effective`, `total_salary`, `status_label`).
  - `POST /api/hrm/employees`: Tạo nhân sự với đầy đủ CCCD, địa chỉ, ngân hàng, liên hệ khẩn cấp.
  - `GET /api/hrm/adjustments`: Lấy toàn bộ danh sách điều chỉnh (hỗ trợ filter `month` và `staff_id`).
  - `POST /api/hrm/employees/{id}/adjustments`: Tạo quyết định điều chỉnh với `decision_date`, `adjustment_type`, `effective_date`, `base_delta`, `allowance_delta`, `reason`.
  - `DELETE /api/hrm/adjustments/{adj_id}`: Xóa quyết định khi tháng áp dụng đang mở (`draft`), chặn xóa khi tháng đã khóa (`locked` / `paid`).

- [ ] **Step 2: Chạy test để xác nhận test ĐỎ (Fails)**

- [ ] **Step 3: Cập nhật `routers/hrm.py`**
  - Cập nhật `list_employees` gọi `compute_staff_virtual_fields` để enrich dữ liệu trả về frontend.
  - Cập nhật `create_employee` và `update_employee` nhận và lưu 10 trường mới.
  - Thêm endpoint `GET /api/hrm/adjustments` nạp lịch sử toàn hệ thống join với `staff` (mã NV, tên NV, chức vụ).
  - Thêm endpoint `DELETE /api/hrm/adjustments/{adj_id}` có guard kiểm tra trạng thái bảng lương tháng áp dụng.

- [ ] **Step 4: Chạy test để xác nhận test XANH (Passes)**

---

### Task 3: Script Import Dữ Liệu Thật từ Google Sheet Cửa Hàng

**Files:**
- Create: `scripts/import_hrm_from_sheets.py`
- Test: `tests/test_hrm_sheets_import.py`

- [ ] **Step 1: Viết script import dữ liệu từ Google Sheet thật**
  - URL Sheet ID: `1F0h7NMbqkPBnacZHKM-9LupB83cPAx0myUcEIUbjsak`
  - Fetch tab `DANH SÁCH NHÂN SỰ` (gid=1388571444): Đọc và mapping chính xác 17 nhân viên (NV01 -> NV18).
  - Fetch tab `ĐIỀU CHỈNH LƯƠNG` (gid=552844281): Đọc và mapping chính xác 16 quyết định điều chỉnh lịch sử.
  - Script chạy idempotent: nếu mã nhân viên hoặc quyết định đã tồn tại thì cập nhật, chưa có thì thêm mới.

- [ ] **Step 2: Viết test xác nhận script nạp đúng dữ liệu**
  Tạo `tests/test_hrm_sheets_import.py`, chạy mock / offline parse dữ liệu CSV của 2 sheet, kiểm tra:
  - NV01 (Bùi Thiên Phú): Lương cơ bản 7.000.000 đ, tổng điều chỉnh +1.000.000 đ -> Lương sau điều chỉnh 8.000.000 đ.
  - NV02 (Trần Nguyễn Quế Đôn): Lương cơ bản 9.000.000 đ, ĐC lương -500.000 đ, Phụ cấp sau ĐC 1.000.000 đ -> Tổng lương 9.500.000 đ.
  - Khối làm việc và giờ làm khớp đúng các `hrm_work_blocks`.

- [ ] **Step 3: Chạy script nạp dữ liệu thật vào `data/pos.db`**
  Chạy lệnh: `"D:/Projects_Hermes/pos-offline-petcare2/.venv/Scripts/python.exe" scripts/import_hrm_from_sheets.py`

---

### Task 4: Nâng Cấp UI Subtab Nhân Sự & Modal Hồ Sơ 3 Phân Nhóm

**Files:**
- Modify: `templates/index.html:6438-6455`, `templates/index.html:10219-10310`
- Modify: `static/js/modules/hrm.js`

- [ ] **Step 1: Mở rộng bảng danh sách nhân sự trên giao diện**
  - Cập nhật `#hrm-subtab-staff`: Bổ sung các cột hiển thị tài chính rõ ràng:
    `Mã & Tên` | `Bộ Phận & Vị Trí` | `Khối Chấm Công` | `Lương Gốc` | `Đ/C Lương` (badge) | `Lương CB Hiện Tại` | `Phụ Cấp` | `Tổng Lương` | `Thâm Niên` | `Tình Trạng` | `Thao Tác`.
  - Badge `Đ/C Lương` có màu xanh khi tăng, màu đỏ khi giảm; click vào mở nhanh lịch sử điều chỉnh của nhân viên đó.

- [ ] **Step 2: Nâng cấp Modal `#modal-hrm-staff-profile` thành 3 nhóm Tab trực quan**
  - Tab 1 (Công việc & Lương): Mã NV, Máy vân tay, Khối, Bộ phận, Chức vụ, Lương gốc, Phụ cấp, Ngày nhận việc, Ngày thử việc, Ngày chính thức, Ngày nghỉ việc.
  - Tab 2 (Thông tin cá nhân & CCCD): Giới tính, Ngày sinh, CCCD, Ngày cấp, Nơi cấp, Email, Địa chỉ thường trú, Địa chỉ tạm trú.
  - Tab 3 (Ngân hàng & Liên hệ khẩn cấp): Ngân hàng, Số tài khoản, Chi nhánh, SĐT người thân, Mối quan hệ.

- [ ] **Step 3: Cập nhật logic Javascript trong `static/js/modules/hrm.js`**
  - `loadHrmStaff()`: Render bảng nhân viên mở rộng, binding đầy đủ dữ liệu và màu sắc badge.
  - `openHrmStaffModal(id)`: Nạp toàn bộ dữ liệu 3 tab lên modal, hỗ trợ format realtime cho tiền tệ.
  - `saveHrmStaffProfile()`: Thu thập toàn bộ dữ liệu 3 tab gửi lên Backend API.

---

### Task 5: Xây Dựng Subtab Mới "Điều Chỉnh Lương" trong Phân Hệ HRM

**Files:**
- Modify: `templates/index.html:6350-6460`
- Modify: `static/js/modules/hrm.js`

- [ ] **Step 1: Bổ sung Subtab nút bấm & Container trên giao diện**
  - Thêm nút subtab: `[⚖️ Điều Chỉnh Lương]` vào thanh điều hướng phân hệ HRM.
  - Thêm container `#hrm-subtab-adjustments` gồm:
    + Thanh công cụ: Ô tìm kiếm nhân viên, Droplist lọc theo nhân viên, Ô chọn tháng áp dụng (`YYYY-MM`), Nút `➕ Tạo Quyết Định Điều Chỉnh`.
    + Bảng danh sách quyết định: `Ngày Quyết Định` | `Mã & Tên NV` | `Loại Điều Chỉnh` | `Lương CB (+/-)` | `Phụ Cấp (+/-)` | `Ngày Áp Dụng` | `Lý Do / Căn Cứ` | `Người Tạo` | `Thao Tác`.
    + Modal `#modal-hrm-salary-adjustment`: Cho phép tạo quyết định điều chỉnh với chọn nhân viên, ngày quyết định, ngày áp dụng, loại điều chỉnh, số tiền format realtime, lý do.

- [ ] **Step 2: Viết logic Javascript trong `static/js/modules/hrm.js`**
  - Hàm `switchHrmSubtab('adjustments')`.
  - Hàm `loadHrmSalaryAdjustments()`: Gọi API `GET /api/hrm/adjustments`, render bảng dữ liệu, lọc theo tháng và theo nhân viên.
  - Hàm `openHrmAdjustmentModal()` và `saveHrmAdjustment()`.
  - Hàm `deleteHrmAdjustment(id)`: Gọi API DELETE kèm xác nhận.

---

### Task 6: Kiểm Thử Toàn Diện, Rebuild EXE & Nghiệm Thu

**Files:**
- Run: Full test suite qua pytest
- Run: PyInstaller build `POS_Mastercare.exe`
- Modify: `PROJECT_STATE.md`

- [ ] **Step 1: Chạy kiểm thử toàn bộ test suite**
  ```bash
  "D:/Projects_Hermes/pos-offline-petcare2/.venv/Scripts/python.exe" -m pytest -q -p no:cacheprovider
  ```
  Kỳ vọng: 100% tests PASS (không còn bất kỳ lỗi nào).

- [ ] **Step 2: Rebuild bản EXE**
  ```bash
  "D:/Projects_Hermes/pos-offline-petcare2/.venv/Scripts/python.exe" -m PyInstaller POS_Mastercare.spec
  ```
  Xác nhận `POS_Mastercare.exe` được cập nhật mới tại thư mục gốc.

- [ ] **Step 3: Cập nhật `PROJECT_STATE.md`**
  Ghi nhận hoàn thành phân hệ Hồ sơ nhân sự mở rộng và Bảng theo dõi điều chỉnh lương theo tháng.
