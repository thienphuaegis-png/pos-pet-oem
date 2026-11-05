# Plan: Đồng Bộ Ngày Tháng VN, Lưới Chấm Công, Ghim Cột Bảng Lương, Chọn Cột Nhân Sự, Gom Nhóm Tổng Theo NV & Hiển Thị Đủ/Thiếu Hoa Hồng Pancake

- **Ngày**: 2026-11-04
- **Trạng thái**: CHỜ ANH DUYỆT (`/brainstorming`)

---

## 1. Bảng Lỗi Ngầm & Nguyên Nhân Gốc Từ 4 Ảnh Thực Tế

| # | Hiện tượng trên 4 ảnh của anh | Nguyên nhân gốc trong code hiện tại | Vị trí `file:line` |
|---|---|---|---|
| 1 | **Gạch chân đỏ dưới các ô `X`, `X/2`, `-` ở Ảnh 1** | Code gắn `border-b-2 border-rose-500` cho mọi ngày có **`penalty > 0`** (đi trễ chưa miễn, quên quẹt 1 chiều `-50k`, hoặc không có dữ liệu quẹt bị tính Vắng `-500k/ngày`). Các bạn chưa có log vân tay tháng 10 (`Hạ Huyên`, `Phi Phụng`, `Phương Thanh`, `Thùy Dương`...) bị gạch đỏ suốt 27–31 ngày (`-13,5tr` → `-15,5tr`). | `static/js/modules/hrm.js:1020`, `services/payroll_engine.py:165` |
| 2 | **Lưới Tháng cho click sửa trực tiếp, thiếu hàng Thứ, chưa tô màu cột CN, ngày chỉ ghi `1..31`** | `renderAttendanceMatrix` mới vẽ 1 hàng `<th>` số `1..31`, chưa tô nền cột Chủ Nhật, và gắn `onclick="openHrmEditDayModal(...)"` vào từng ô. | `static/js/modules/hrm.js:988-1022` |
| 3 | **Cuộn ngang Bảng Lương (Ảnh 2) bị trôi mất tên nhân viên** | Chỉ `thead` có `sticky top-0`, các cột đầu (`⚠`, `Mã NV`, `Họ và Tên`) chưa gắn `sticky left` ở `thead`, `tbody`, `tfoot`. | `static/js/modules/hrm.js:343, 372-378` |
| 4 | **Tab `Tăng Ca` & `Tạm Ứng` mất sạch tên nhân viên, thiếu thông tin** | Backend `GET /api/hrm/overtime` & `GET /api/hrm/advances` trả cột `s.name` (`r.name`), nhưng JS lại đọc `${r.staff_name || ''}` (`undefined` -> ô trống!), đồng thời thiếu `employee_code`, `department`, `block_name`, tài khoản quỹ & tiền OT quy đổi. | `routers/hrm.py:1196, 1243` vs `static/js/modules/hrm.js:1469, 1571` |
| 5 | **Đã gán `Thùy Dương -> NV17` ở Pancake (Ảnh 4) nhưng sang `Hoa Hồng & Tip` (Ảnh 3) chỉ hiện `—` và `0`** | **3 nguyên nhân nối tiếp**: (a) Tab Pancake mặc định lọc `01/11 → 04/11/2026` (`0 đơn`) trong khi HRM đang xem `Tháng 10/2026` và thiếu nút chọn nhanh `Tháng trước`; (b) Tab `Hoa Hồng & Tip` mặc định tích sẵn ô *"Ẩn NV không có hoa hồng"*; (c) Khi doanh thu Pancake `< mốc 120.000.000 đ` (`commission = 0`), API không trả số đơn/mốc/phần thiếu và UI `hrm.js:3876` đổi `0` thành dấu `—` nên mất sạch thông tin! | `static/js/modules/marketplace.js:1810`, `templates/index.html:7431`, `routers/hrm.py:1507`, `static/js/modules/hrm.js:3876` |
| 6 | **`Doanh số POS thuần: 85.013.350 ₫` ở Ảnh 3 nhưng `Hoa hồng bán lẻ POS = 0 ₫`** | Toàn bộ `NV01..NV18` import từ Sheet đang có `staff.commission_rate = 0%` (dù `policy_mode = 'dept'`, hàm `sales_commission_by_staff` chỉ đọc cột cứng `staff.commission_rate` mà không fallback về `% của Bộ phận`), cộng thêm các đơn POS do tài khoản `admin` (`is_payroll_staff = 0`) tạo không hiện trên bảng lương NV. | `services/commission.py:166`, `routers/hrm.py:1445` |
| 7 | **Ngày tháng ở `Xin Off`, `Tăng Ca`, `Tạm Ứng`, `Điều Chỉnh Lương`, `Nhân Sự` chưa định dạng VN** | Vẫn in thẳng chuỗi ISO `YYYY-MM-DD` thay vì `DD/MM/YYYY (Thứ)` / `DD/MM/YYYY`. | `static/js/modules/hrm.js:1116, 1468, 1570, 2807, 3288, 3297` |
| 8 | **Tab `Nhân Sự` ẩn thiếu nhiều cột hồ sơ & chưa có bộ chọn ẩn/hiện cột** | API `/api/hrm/employees` đã trả đủ 30+ trường (`device_code`, `phone`, `birthday`, `hire_date`, `official_date`, `bank_account`, `bank_name`, `id_card_number`, `address`...) nhưng bảng HTML chỉ vẽ cứng 12 cột. | `routers/hrm.py:245` vs `templates/index.html:7823` |

---

## 2. Bản Đồ Ánh Xạ Dữ Liệu (Data Mapping)

| Thành phần giao diện | Nguồn dữ liệu (Cột DB / API) | Vị trí xử lý | Quy tắc hiển thị chuẩn |
|---|---|---|---|
| **Bộ chọn thời gian xem (`Tháng này` / `Tháng trước` / `Khoảng ngày`)** | Tham số `month` hoặc `date_from` & `date_to` trên `/api/hrm/{leaves,overtime,advances,adjustments,commissions,attendance}` & `/api/marketplace/pancake/*` | `routers/hrm.py`, `static/js/modules/hrm.js`, `static/js/modules/marketplace.js` | Nút 1-chạm `Tháng này`, `Tháng trước`, `Chọn tháng`, `Khoảng ngày (Từ -> Đến)` đồng bộ ở cả HRM & Sàn Pancake. |
| **Lưới Chấm Công 2 hàng tiêu đề + Cột CN** | `attendanceData.employees[].days[]` + `parseVnIsoDate(date)` | `static/js/modules/hrm.js:983` | Hàng 1: `01..31`; Hàng 2: `T2..T7, CN`. Cột `CN` tô nền hồng nhạt xuyên suốt cả cột; bỏ `onclick` sửa tay trên lưới; ghim cột `Mã NV` + `Họ Tên`. |
| **Ghim cố định cột Tên trên Bảng Lương & Nhân Sự** | CSS `position: sticky; left: ...` trên `⚠`, `Mã NV`, `Họ và Tên` | `static/js/modules/hrm.js:343, 372` | Cuộn ngang 27 cột lương vẫn thấy rõ `Mã NV` & `Họ và Tên` ở cả header, dòng NV và dòng Tổng cộng. |
| **Đủ cột Hồ Sơ Nhân Sự + Popover Chọn cột** | `GET /api/hrm/employees` + `GET/PUT /api/hrm/staff-columns` (`settings.hrm_staff_columns`) | `routers/hrm.py`, `static/js/modules/hrm.js` | 24 cột (Mã NV, Họ tên, Mã máy CC, SĐT, Email, Giới tính, Ngày sinh, Bộ phận, Vị trí, Khối ca, Ngày vào, Ngày CT, Thâm niên, Tình trạng HĐ, Số HĐ, CCCD, Ngân hàng, Số TK, Chi nhánh NH, Lương gốc, Đ/C lương, Lương CB hiệu lực, Phụ cấp, Tổng lương, Chế độ CC/WFH, TK đăng nhập, Địa chỉ, Liên hệ khẩn cấp) + Popover bật/tắt cột. |
| **Sửa mất tên + Nhóm & Tổng theo NV (`Xin Off`, `Tăng Ca`, `Tạm Ứng`, `Đ/C Lương`)** | Bổ sung `s.name AS staff_name, s.employee_code, s.department, s.position, b.name AS block_name, pa.name AS account_name` + tính `est_ot_pay` | `routers/hrm.py:1003, 1193, 1240, 567` + `static/js/modules/hrm.js` | Định dạng mọi ngày `DD/MM/YYYY (T2..CN)`; mặc định gom nhóm theo Nhân viên kèm tổng số ca/giờ/tiền của từng NV + dòng `TỔNG CỘNG` cuối bảng. |
| **Chi tiết Đủ / Thiếu Hoa Hồng Pancake, POS, Spa, KOC** | Mở rộng `pancake_svc.commission_by_staff` & `GET /api/hrm/commissions` trả đủ `seller_names`, `orders`, `revenue`, `collected`, `threshold`, `shortfall`, `over_amount`, `rate`, `bonus`, `achieved` | `services/pancake.py:254`, `routers/hrm.py:1368`, `static/js/modules/hrm.js:3838` | Bỏ mặc định ẩn NV `0đ`; dù đạt hay thiếu đều hiện rõ tên nick Pancake đã gán, số đơn, `Thực đạt / Mốc KPI`, thanh % và badge `Đạt mốc (+...)` hoặc `Chưa đủ mốc (Thiếu ... đ)`. |

---

## 3. Ma Trận Tác Động Sự Kiện (Event Impact Matrix — 5 Chiều)

1. **Trigger (UI / Filter / Action)**:
   - Chọn `Tháng này` / `Tháng trước` / `Khoảng ngày (date_from, date_to)`; bật/tắt cột `Nhân Sự`; chuyển chế độ `Nhóm theo NV` / `Danh sách phẳng`.
2. **Entity State**:
   - Chỉ đọc & tổng hợp dữ liệu theo khoảng ngày; lưu cấu hình ẩn/hiện cột `hrm_staff_columns` vào bảng `settings`. Lưới chấm công chuyển sang chế độ **chỉ xem** (chặn sửa nhầm log vân tay).
3. **Ledger / Financial (Dòng tiền)**:
   - Không làm thay đổi các phiếu chi Sổ Quỹ đã lập; tab `Tạm Ứng` hiển thị thêm tên tài khoản quỹ (`Tiền mặt` / `Ngân hàng`) từ `cashbook -> payment_accounts` để đối soát.
4. **Stock / Debt (Dòng hàng / Công nợ)**:
   - Không tác động tồn kho hay công nợ khách hàng/NCC.
5. **Reversal & Siblings (Tính nhất quán giữa các màn hình)**:
   - Con số Hoa hồng Pancake trên `Bán Hàng Sàn TMĐT → Pancake` và `Chấm Công & Lương → Hoa Hồng & Tip` dùng chung 1 hàm `pancake.commission_by_staff(cur, date_from, date_to)` nên khớp nhau 100% khi chọn cùng khoảng ngày; khi tính `Bảng Lương` kỳ tháng `MM/YYYY` vẫn chốt chuẩn theo đầu tháng → cuối tháng `MM/YYYY`.

---

## 4. Quyết Định Nghiệp Vụ Đã Chốt

| # | Hạng mục nghiệp vụ | Đáp án anh đã chốt |
|---|---|---|
| 1 | **Xử lý nhân viên chưa có dữ liệu vân tay cả tháng (tránh gạch đỏ phạt Vắng `-13,5tr` → `-15,5tr` & Thực lãnh âm)** | **Không tự trừ phạt Vắng (`-500.000 đ/ngày`)** nếu nhân viên đó trong kỳ chưa có bất kỳ lượt quẹt vân tay nào (để ô trống `0 công, 0 phạt`, không gạch đỏ); chỉ phạt Vắng khi nhân viên đã có dữ liệu quẹt thẻ hoạt động trong tháng mà tự ý nghỉ không có đơn Xin Off. |
| 2 | **Quy tắc Hoa hồng Bán lẻ POS (`Doanh số POS thuần` vs `% Bộ phận` & đơn `Admin`)** | Nhân viên ở chế độ **`Theo bộ phận`** tự động hưởng `% Bán POS` của Bộ phận đó (không bị kẹt `0%`); luôn hiện rõ `Số đơn & Doanh số POS` ngay cả khi `0 đ`, và ghi chú riêng phần doanh số của các đơn đứng tên tài khoản `Admin` (Chủ shop) trên thẻ KPI. |
| 3 | **Thưởng đạt mốc KPI Pancake `120.000.000 đ` của Lê Thụy Thùy Dương (`NV17`)** | Sửa mức thưởng khi đạt mốc `120.000.000 đ` về đúng **`+975.000 đ`** (bù từ lương nền `5.525.000 đ` lên đúng chuẩn `6.500.000 đ` + `% vượt mốc`), và luôn hiển thị đầy đủ thông tin tiến độ **Đủ / Thiếu bao nhiêu tiền** trên tab `Hoa Hồng & Tip`. |

---

## 5. Lộ Trình Thực Thi (Chờ Anh Duyệt "OK")

1. **Engine Chấm Công & Lưới Tháng (`services/payroll_service.py`, `static/js/modules/hrm.js`)**:
   - Không phạt Vắng `-500k` cho nhân viên chưa có dữ liệu chấm công trong tháng; thêm hàng Thứ `T2..CN` dưới ngày `01..31`, tô màu suốt cột `CN`, khóa click sửa trên Lưới Tháng (chỉ xem tooltip), ghim cố định cột `Mã NV + Họ Tên`.
2. **Ghim Cột Bảng Lương & Mở Đủ 24 Cột Tab `Nhân Sự` Có Bộ Chọn Ẩn/Hiện (`routers/hrm.py`, `static/js/modules/hrm.js`, `templates/index.html`)**:
   - Ghim cố định (`sticky left`) cụm `⚠ + Mã NV + Họ và Tên` trên Bảng Lương & Bảng Nhân Sự; thêm Popover `Cột hiển thị` (`GET/PUT /api/hrm/staff-columns`) cho tab `Nhân Sự`.
3. **Bộ Lọc Thời Gian (`Tháng này` | `Tháng trước` | `Khoảng ngày`) + Sửa Mất Tên + Gom Nhóm Tổng Theo NV (`Xin Off`, `Tăng Ca`, `Tạm Ứng`, `Đ/C Lương`, `Pancake`)**:
   - Chuẩn hóa toàn bộ ngày sang `DD/MM/YYYY (Thứ)`; sửa lỗi mất tên NV ở `Tăng Ca` & `Tạm Ứng`; bổ sung gom nhóm theo Nhân viên kèm tổng từng người + tổng cuối bảng; thêm thanh chọn nhanh `Tháng này / Tháng trước / Khoảng ngày` cho cả HRM và Sàn Pancake.
4. **Đồng Bộ Hoa Hồng POS & Tiến Độ Đủ/Thiếu Pancake (`services/commission.py`, `services/pancake.py`, `routers/hrm.py`, `static/js/modules/hrm.js`)**:
   - Áp tự động `% Bộ phận` cho chế độ `dept`, tách bạch doanh số đơn `Admin`, sửa `bonus_at_threshold = 975.000 đ` cho lương nền 85% của `NV17`, bỏ tích ẩn mặc định và luôn hiển thị tiến độ `Thực đạt / Mốc (Đạt / Thiếu ... đ)` trên tab `Hoa Hồng & Tip`.
