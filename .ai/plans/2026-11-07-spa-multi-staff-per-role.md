# Plan: Phân công nhiều thợ cho mỗi vai trên phiếu Spa (Tắm / Cắt / Nhuộm)

Trạng thái: CHỜ ANH DUYỆT DEMO — `.ai/sketches/spa_multi_staff_per_role_demo.html`

## Hiện trạng (đọc code + DB máy code)

| Mục | Hiện tại | file:line |
|---|---|---|
| Cột DB | `staff_receiver`, `staff_worker_1`, `staff_worker_2`, `staff_cutter`, `staff_dyer` (TEXT, 1 tên/ô) | `routers/partners.py:1378-1381` |
| Popup ô "Thợ" trên bảng | 4 select 1 người, KHÔNG có Tắm 2 | `static/js/modules/spa.js:7863-7912`, lưu `8029-8045` |
| Ô "Thợ" trên bảng | Không hiện Tắm 2 | `spa.js:1987-1990` |
| Màn Tiến độ | 5 select (có Tắm 2) | `templates/index.html:13584-13615`, `spa.js:3069-3072` |
| Hoa hồng tắm 2 người | Mỗi người công bậc kg x 50% (`worker1_share_pct`/`worker2_share_pct`) | `services/commission.py:522-547` |
| Cắt / Nhuộm | 1 người nhận đủ công | `commission.py:549-562` |
| Đếm ca theo thợ | Đã tách tên theo dấu phẩy | `routers/partners.py:1559` |
| Tip | Chia đều cho mọi thợ khác nhau trên phiếu | `commission.py:632-644` |
| Dữ liệu | 24.447 phiếu; 752 có Tắm 2; 0 ô có dấu phẩy | DB máy code |

## Hướng kỹ thuật (em tự quyết)

- Không thêm cột/bảng mới: mỗi cột lưu nhiều tên cách nhau `, ` (đếm ca đã hỗ trợ sẵn).
- Tắm: người 1 vào `staff_worker_1`, người 2+ vào `staff_worker_2` (giữ tương thích 752 phiếu cũ và bảng lương cũ).
- Hoa hồng: helper `_split_names()` dùng chung; công mỗi vai chia theo số người.
- Sửa mọi chỗ hiển thị/in (bảng, K80, lịch sử, Tab Hóa đơn) để hiện đủ tên.

## Câu hỏi đã chốt

| # | Câu hỏi | Đáp án đã chốt |
|---|---|---|
| 1 | Tiền công khi 2+ người cùng vai | Chia đều công vai (Tắm 2 người giữ tỷ lệ cấu hình 50/50; 3+ chia 1/n) |
| 2 | Phạm vi màn hình | Popup ô "Thợ" trên bảng + màn Tiến độ |
| 3 | Tiếp nhận / Trả bé | Giữ 1 người |
| 4 | Giao diện | Làm theo demo (chip + "+ Thêm Tắm 2") |

Trạng thái: ĐÃ LÀM (2026-11-07). Hồi quy hoa hồng engine cũ vs mới trên DB thật 2 tiệm (2025, 2026): lệch 0đ. Probe Edge headless: thêm Tắm 2 + Cắt 2, lưu DB đúng, màn Tiến độ đọc lại đủ, JS_ERRORS = [].
Chưa làm: form tiếp nhận (lẻ/hàng loạt), ô sửa inline Spreadsheet, modal sửa hàng loạt vẫn 1 người/vai.
