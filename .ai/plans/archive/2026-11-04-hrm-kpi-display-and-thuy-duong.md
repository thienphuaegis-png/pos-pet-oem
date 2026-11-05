# Plan: Chuẩn hóa Lương KPI Bạn Thùy Dương (NV17) & Hiển Thị KPI Nhân Viên (Đạt / Chưa Đạt)

- **Ngày**: 2026-11-04
- **Trạng thái**: CHỜ ANH DUYỆT

## 1. Bảng Lỗi & Lệch Ngầm Phát Hiện Khi Trace Code + Sheet Thật

| Phát hiện | Hậu quả thực tế (kèm con số thật) | Bằng chứng `file:line` |
|---|---|---|
| Cột `base_salary` của `NV17 Lê Thụy Thùy Dương` đang lưu cứng `5.525.000 đ` (`= 85% × 6.500.000 đ`) nhưng bảng `staff` không có trường đánh dấu KPI | Nhìn trên tab `Nhân Sự` không biết `5.525.000 đ` là lương khi **chưa đạt KPI**, không thấy mức chuẩn 100% (`6.500.000 đ`) và không biết chỉ tiêu KPI bao nhiêu. | Google Sheet `DANH SÁCH NHÂN SỰ` dòng NV17; `services/hrm_schema.py:19` |
| Công thức thưởng đạt mốc KPI Pancake cũ (`bonus_at_threshold = 1.300.000 đ`) lệch với lương nền `5.525.000 đ` | Code Pancake viết lúc lương nền cũ là `5.200.000 đ` (`5,2tr + 1,3tr = 6,5tr`). Nay lương nền của Dương là `5.525.000 đ`, nếu đạt mốc `120.000.000 đ` mà cộng `+1.300.000 đ` sẽ vọt lên **`6.825.000 đ`** (**dư `325.000 đ`**, đúng ra chỉ bù **`+975.000 đ`** để đủ `6.500.000 đ`). | `services/pancake.py:19-23` |
| Tab `Hoa Hồng & Tip` gọi `SELECT ... FROM staff WHERE is_active = 1` thiếu `is_payroll_staff = 1` và tự ghép `NV{id:02d}` | Lọt tài khoản hệ thống `admin` thành `NV01` (trùng Bùi Thiên Phú), `Kho` thành `NV07` (trùng Phạm Thị Quỳnh Châu), bản ghi cũ `#4` thành `NV04` (trùng Xuân Trường). | `routers/hrm.py:1268, 1313` |
| Chưa có cột tiến độ KPI trên `Hoa Hồng & Tip` / `Bảng Lương` / `Nhân Sự` | Không thấy bạn nào có tính KPI, mục tiêu bao nhiêu, hiện thực đạt bao nhiêu % và **Đạt** hay **Chưa đạt**. | `templates/index.html:7413-7421`, `static/js/modules/hrm.js:3340-3359` |

---

## 2. Bản Đồ Ánh Xạ Dữ Liệu (Data Mapping)

| Thành phần | Cột DB / Nguồn dữ liệu | Vị trí | Quy tắc hiển thị |
|---|---|---|---|
| Bật/Tắt tính KPI nhân viên | `staff.has_kpi` (`INTEGER DEFAULT 0`: `0` = không tính KPI, `1` = có tính KPI) | `services/hrm_schema.py`, Modal sửa nhân sự & Popup cài hoa hồng | `has_kpi = 0` → **ẩn hoàn toàn** thông tin KPI (ô trống sạch, không hiện `0 đ` hay `—`). |
| Nguồn đo KPI & Chỉ tiêu | `staff.kpi_type` (`'pancake_revenue'`, `'pos_revenue'`, `'total_revenue'`, `'koc_videos'`), `staff.kpi_target` (`REAL DEFAULT 0`, VD: `120000000`) | `services/hrm_schema.py`, `routers/hrm.py` | Tự động lấy doanh số thực tế trong tháng từ đơn Pancake / POS / Video KOC để so với `kpi_target`. |
| Mức lương chuẩn 100% khi Đạt KPI vs Lương chưa đạt KPI | `staff.base_salary` + `staff.kpi_base_salary` (hoặc tỷ lệ `85% / 100%` theo lựa chọn của anh) | `services/payroll_service.py`, `routers/hrm.py` | Khi `Thực đạt < kpi_target`: nhận mức chưa đạt (`5.525.000 đ`). Khi `Thực đạt >= kpi_target`: nhận đủ mức đạt KPI (`6.500.000 đ`) + hoa hồng vượt mốc. |
| Hiển thị tiến độ KPI (Đạt / Chưa đạt) | `GET /api/hrm/commissions/{month}` trả thêm `has_kpi, kpi_target, kpi_actual, kpi_pct, kpi_achieved` | `routers/hrm.py:1311`, `static/js/modules/hrm.js:3341` | Hiện trên tab `Hoa Hồng & Tip` (và `Nhân Sự` / `Phiếu Lương` cho riêng người có `has_kpi = 1`). |

---

## 3. Câu Hỏi Cần Anh Chốt

1. **Cách lưu & tính lương KPI của bạn Thùy Dương (`NV17`) khi Chưa đạt vs Đạt KPI**:
   - (a) **[Đề xuất]** Lưu **Lương chuẩn khi ĐẠT KPI = `6.500.000 đ`**, tỷ lệ khi **Chưa đạt KPI = `85%` (`5.525.000 đ`)** trên hồ sơ NV: tháng nào doanh số `< mốc KPI` bảng lương tự tính theo mức `5.525.000 đ`; tháng nào `>= mốc KPI` tự tính đủ `6.500.000 đ` (không cộng trùng `+1.300.000 đ` cũ bên Pancake nữa) + hoa hồng vượt mốc.
   - (b) Giữ nguyên Lương cứng cố định `5.525.000 đ` như hiện tại; khi `>= mốc KPI` thì cộng khoản **Thưởng đạt KPI `+975.000 đ`** vào cột Hoa hồng/Thưởng để tổng thành `6.500.000 đ` (+ hoa hồng vượt mốc).
   - Đáp án: (chờ anh)

2. **Chỉ tiêu KPI của bạn Thùy Dương (và còn bạn nào khác áp KPI không?)**:
   - (a) **[Đề xuất]** Chỉ tiêu của Thùy Dương (`NV17`) là **Doanh thu Pancake 2 shop đạt `120.000.000 đ/tháng`** (vượt 120tr hưởng thêm bậc thang 2.5% / 3% / 3.5%); các bạn Kho & Văn phòng mặc định **Không tính KPI** (ẩn trống), và anh có thể bật/chỉnh KPI riêng cho bất kỳ bạn nào trong popup sửa NV.
   - (b) Chỉ tiêu KPI của Thùy Dương là con số khác hoặc có thêm nhân viên khác đang áp KPI (anh ghi giúp em con số / tên NV ở mục Other).
   - Đáp án: (chờ anh)

3. **Vị trí hiển thị KPI (chỉ hiện với bạn có KPI, bạn không có thì để trống)**:
   - (a) **[Đề xuất]** Hiện đồng bộ ở **cả 3 nơi**: (1) Bảng **Nhân Sự** (hiện chỉ tiêu & 2 mức lương Chưa đạt / Đạt KPI), (2) Tab **Hoa Hồng & Tip** (hiện tiến độ `Thực đạt / Chỉ tiêu`, `%`, badge `Đạt KPI` / `Chưa đạt`), và (3) **Bảng Lương & Phiếu Lương** tháng của bạn đó; đồng thời lọc sạch `admin` / `Kho` khỏi tab Hoa Hồng.
   - (b) Chỉ cần hiện ở Tab **Hoa Hồng & Tip** và Bảng **Nhân Sự**.
   - Đáp án: (chờ anh)
