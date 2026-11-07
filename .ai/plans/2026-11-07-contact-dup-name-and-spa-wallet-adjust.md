# Plan: Cho phép trùng tên KH (chặn trùng SĐT) + Admin chỉnh số dư Ví Spa

Trạng thái: CHỜ ANH DUYỆT

## Lỗi ngầm phát hiện khi trace

| Lỗi | Hậu quả thực tế | file:line |
|---|---|---|
| `merge_duplicate_contacts()` chạy MỖI LẦN khởi động server, gộp mọi KH cùng tên (không xét SĐT) | Tạo "Anh Tâm 0906504060" xong, restart server -> bị gộp vào "Anh Tâm 0899354300" (KH027979): SĐT mới mất, bé/phiếu spa/đơn/ví/công nợ dồn sang người khác, bản ghi mới bị xóa. DB máy code: 13.095 KH, 0 nhóm trùng tên (tên phổ biến "Chị Hà", "Anh Tuấn" chỉ còn 1) = đã bị gộp hết | `database.py:2630-2634`, `database.py:2944` |
| Comment import nói tránh gộp nhầm 2.243 KH trùng tên, nhưng startup vẫn gộp | Fix ở import vô hiệu | `routers/partners.py:723` |

## Việc 1 — Trùng tên được, trùng SĐT không

| Hạng mục | Hiện tại | Sửa |
|---|---|---|
| Chặn trùng SĐT khi tạo/sửa | Đã có, HTTP 400 | Giữ nguyên `routers/partners.py:910-928`, `988-1006` |
| Cảnh báo trùng tên (popup confirm trong ảnh) | HTTP 409 + `confirm()` | Bỏ khối `partners.py:930-949`; bỏ nhánh 409 ở `static/js/pos.js:2360`, `static/js/modules/contacts.js:451` |
| Gộp trùng tên lúc khởi động | Gộp cả KH | Chỉ gộp NCC (`type='supplier'`), KH không gộp (câu 1) |
| Test | `tests/test_contact_attribution_and_dedup.py:50-66` kỳ vọng 409 | Đổi: cùng tên khác SĐT -> 200 |

## Việc 2 — Admin chỉnh số dư Ví Spa

| Trường | Nguồn | Vị trí | Ghi chú |
|---|---|---|---|
| Số dư | `contacts.spa_wallet_balance` | `database.py:950` | Sẵn có |
| Lịch sử | `spa_wallet_transactions` (before/after/note) | `database.py:2229` | CHECK type chỉ cho `topup/spend/refund` -> thêm `adjust` (rebuild bảng) |
| Quyền | `require_role("owner","admin")` | `dependencies.py:119` | Giống sửa/xóa giao dịch nạp ví `routers/topup.py:313` |
| UI | Modal Chi tiết KH, dòng "Số dư Ví Spa" | `templates/index.html:12769`, `static/js/modules/contacts.js:672` | Thêm nút "Chỉnh" chỉ hiện với owner/admin |

Ma trận tác động:
1. Trigger: `PUT /api/topup/adjust/{contact_id}` body `{new_balance, reason}` (lý do bắt buộc).
2. Entity: `contacts.spa_wallet_balance = new_balance`.
3. Sổ quỹ: KHÔNG ghi phiếu thu/chi (không có tiền thật).
4. Điểm/hạng: không đổi.
5. Hoàn tác: chỉnh lại lần nữa; dòng lịch sử `adjust` hiển thị "Điều chỉnh (+/-)" kèm tên người chỉnh.

## Câu hỏi đã chốt

| # | Câu hỏi | Đáp án đã chốt |
|---|---|---|
| 1 | Gộp đối tác trùng tên khi khởi động | Tắt hẳn (cả KH lẫn NCC); gộp tay qua `scripts/deduplicate_contacts.py` |
| 2 | Cách nhập chỉnh ví | Nhập số dư mới, bắt buộc lý do |
| 3 | Ai được chỉnh | Owner + Admin |

Trạng thái: ĐÃ LÀM (2026-11-07), test pass.
