# Plan: Chuẩn hóa Droplist Nhân Viên (HRM), Nhà Cung Cấp (Nhập Hàng) & Bỏ Chấm Tròn (Thu Chi)

- **Ngày**: 2026-11-04
- **Trạng thái**: [x] FIXED (Đã kiểm chứng bằng pytest + Playwright headless UI probe)

## 1. Bảng Lỗi Ngầm Phát Hiện Khi Trace Code

| Lỗi phát hiện | Hậu quả thực tế (trên ảnh anh chụp) | Bằng chứng `file:line` |
|---|---|---|
| Modal Tạm Ứng / Xin Off / Tăng Ca gọi `GET /api/staff` thay vì `GET /api/hrm/employees` | Lọt tài khoản quản trị & kho (`admin (NV1)`, `Kho (NV7)` có `is_payroll_staff = 0`) và bản ghi cũ chưa gán mã (`Trần Nguyễn Quế Đôn (NV4)` trùng tên với `NV02`/`NV04`). Nếu chọn nhầm bản ghi rác, khoản ứng gắn sai `staff_id` trên bảng lương tháng. | `static/js/modules/hrm.js:738`, `890`, `1003` vs `routers/hrm.py:243` |
| Ghép mã giả `'NV' + s.id` + không `ORDER BY employee_code` | Sinh mã `NV1`, `NV4`, `NV7` cạnh `NV01`, `NV04`, `NV07`; thứ tự nhảy `NV1 → NV10 → NV4 → NV7 → NV01`. | `static/js/modules/hrm.js:742`, `894`, `1009` |
| Nút đóng modal gắn nhầm `<i class="ph ph-dot-outline"></i>` | Góc trên phải modal Tạm Ứng Lương hiện chấm nhỏ li ti thay vì dấu `✕` (`ph-x`). | `templates/index.html:11388`, `11431`, `11465`, `11505`, `11928` |
| Cột `LOẠI` bảng Sổ Quỹ chứa chấm tròn `🟢`/`🔴` thiếu `whitespace-nowrap` | Chấm tròn nằm dòng trên, chữ `Thu` / `Chi` rớt xuống dòng dưới thành ô vuông 2 tầng. | `static/js/modules/productions.js:2010-2012` |
| Bộ lọc NCC Tab Nhập Hàng dùng `.sort()` ASCII | Tên bắt đầu bằng chữ `Đ` (`Đăng Khải`) bị đẩy xuống cuối danh sách sau chữ `Z` (`ZippoPet`). | `static/js/modules/purchases.js:1013` |

---

## 2. Bản Đồ Ánh Xạ Dữ Liệu (Data Mapping)

| Thành phần UI | Nguồn dữ liệu / Hàm dùng chung | File / Vị trí | Ghi chú |
|---|---|---|---|
| Danh sách Nhân viên HRM | `GET /api/hrm/employees` (`is_payroll_staff = 1`, lọc `is_active !== 0 && contractual_status !== 'Nghỉ việc'`) | `routers/hrm.py:243`, `static/js/modules/hrm.js` | Có sẵn `employee_code`, `name`, `block_name`, `department` |
| Tìm kiếm không dấu | `fuzzyMatch(query, text)` + `escapeHtml()` | `static/js/app.js:5295` | Tái sử dụng hàm chuẩn sẵn có |
| Giá trị submit Tạm ứng / Off / OT / Điều chỉnh | Giữ thẻ ẩn `<select id="hrm-adv-staff-id" class="hidden">` (tương tự `#hrm-leave-staff-id`, `#hrm-ot-staff-id`, `#hrm-adj-staff-id`) | `templates/index.html:11394, 11436, 11470, 11933` | Tương thích ngược 100% với `submitHrmAdvance()` |
| Bộ lọc Nhà Cung Cấp (Tab Nhập Hàng) | Mảng `rawList` từ `GET /api/purchases` (đếm số đơn mỗi `supplier_name`, sắp `localeCompare('vi')`) + giữ `<select id="filter-po-supplier" class="hidden">` | `templates/index.html:4933`, `static/js/modules/purchases.js:1004` | Lọc realtime không dấu + hiện badge `(N đơn)` |
| Pill lọc & Nhãn Loại (Tab Thu Chi) | `#cb-pill-type-in`, `#cb-pill-type-out`, `renderCashbookTable()` | `templates/index.html:6018-6023`, `static/js/modules/productions.js:2010-2012` | Bỏ `<i class="ph ph-circle"></i>` và `🟢`/`🔴`, thêm `whitespace-nowrap` |

---

## 3. Ma Trận Tác Động Sự Kiện (Event Impact Matrix)

1. **Trigger (UI/Payload)**:
   - Chọn nhân viên trên Searchable Droplist gán thẳng `staff.id` vào `<select class="hidden">` cũ → payload `POST /api/hrm/advances` (`{staff_id, advance_date, amount, account_id, note}`) không đổi.
   - Chọn NCC trên Popover gán tên NCC vào `#filter-po-supplier` và gọi `loadPurchasesList()` như cũ.
   - Bấm `Thu (Vào)` / `Chi (Ra)` gọi `setCashbookFilterType('in'|'out')` như cũ.
2. **Entity State**: Không thay đổi schema DB hay trạng thái chứng từ; ngăn chặn rủi ro gán nhầm `staff_id` vào tài khoản hệ thống `is_payroll_staff = 0`.
3. **Ledger / Financial (Dòng tiền)**: Phiếu chi tạm ứng `PC-UL` (`cashbook`) vẫn tạo bình thường khi có chọn `account_id`; Sổ Quỹ giữ nguyên số liệu KPI & lọc dòng tiền.
4. **Stock / Debt (Dòng hàng / Dòng nợ)**: Lọc đơn nhập theo NCC giữ nguyên tính toán KPI công nợ/đã trả.
5. **Reversal & Siblings (Đối xứng & Endpoint anh em)**:
   - Khi mở modal Sửa Đơn Xin Off (`openHrmLeaveModal(id)`), nếu nhân viên cũ đã nghỉ việc vẫn tự động hiển thị đúng tên từ `id` đang sửa.
   - Đồng bộ bỏ chấm tròn trên Drawer xem chi tiết phiếu thu/chi (`#drawer-cash-badge-type`, `#cashview-badge-type`) và Modal lập phiếu (`#btn-cash-type-in/out`) nếu anh chốt phạm vi đầy đủ.

---

## 4. Đáp Án Đã Chốt

| # | Câu hỏi | Đáp án đã chốt |
|---|---|---|
| 1 | Phạm vi sửa droplist chọn Nhân viên (HRM) | Đồng bộ cả 4 modal HRM (Tạm ứng, Xin Off, Tăng ca, Điều chỉnh lương) sang ô tìm kiếm + lấy chuẩn `/api/hrm/employees` |
| 2 | Kiểu hiển thị bộ lọc Nhà Cung Cấp ở Tab Nhập Hàng | Popover tìm kiếm xổ ngay dưới nút `Tất cả NCC` (1 chạm mở, gõ không dấu lọc nhanh, hiện số đơn, sắp chuẩn chữ Đ) |
| 3 | Phạm vi bỏ biểu tượng chấm tròn ở Tab Thu Chi | Bỏ sạch chấm tròn ở thanh lọc Thu/Chi, cột `LOẠI` bảng Sổ Quỹ (giữ gọn 1 dòng) và cả trong Popup/Drawer Sổ Quỹ |
| 4 | Nút đóng góc trên phải modal HRM (`ph-dot-outline`) | Giữ nguyên chưa đụng tới nút đóng modal |
