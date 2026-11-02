# HRM: NV không chấm công · TTS ca/bù · Phụ cấp · Modal quy tắc — CHỜ ANH DUYỆT

Nguồn: đọc code + DB `data/pos.db` (read-only) + Google Sheet nhân sự, 02/11/2026. Chưa sửa code.

## Lỗi ẩn phát hiện (tính thử tháng 10/2026 bằng `compute_line`)

| Lỗi | Hậu quả thực tế | file:line |
|---|---|---|
| Không có khái niệm "miễn chấm công". Ngày không quẹt = vắng 500k | NV01, NV14, SPA30… mỗi người 0 công, phạt 13.500.000đ, thực lãnh **-13.500.000đ** | `services/payroll_engine.py:154-163` |
| 12 thợ Spa (SPA30–41) bị gán khối Văn Phòng, lương 6tr, không mã máy | Lọt vào bảng lương, bị phạt vắng như trên | `services/payroll_service.py:200-206` |
| Ngưỡng đủ công cố định toàn cục 7h (`full_day_min=420`) | TTS làm 1 ca 4h luôn bị tính 0.5 công | `payroll_engine.py:213` |
| Ca chiều tính trễ so với giờ vào 08:00 của khối | TTS ca chiều 13:30–17:30 bị phạt trễ 200k/ngày (~5tr/tháng) | `payroll_engine.py:218-221` |
| Không có cơ chế "làm bù" | Ca bù chỉ thành gợi ý OT hoặc bị bỏ | — |
| Modal "Quy Tắc Tính Công" là HTML cứng | Ghi "X ≥ 6.5h" (thật 7h), chỉ 2 khối (DB có 5), OT "sau 18:00" (thật: giờ ra khối + 25 phút), mức phạt không đổi theo Cấu hình | `templates/index.html:11587-11698` |
| Form sửa NV hiện ô Phụ cấp = cột gốc (0) chứ không phải phụ cấp hiệu lực | NV02/NV04/NV06 có phụ cấp 1tr/800k/1tr nhưng mở form thấy trống | `static/js/modules/hrm.js:2195` |

Phụ cấp import: cột "Phụ cấp" (AD) trên Sheet trống hết; phụ cấp thật nằm ở tab ĐIỀU CHỈNH LƯƠNG → đã vào `hrm_salary_adjustments`, bảng lương có cộng (khớp cột AE: NV02 1tr, NV04 800k, NV06 1tr). Dòng #12 NV08 ghi loại "Phụ cấp" nhưng số nằm ở cột Lương CB → đang vào lương.

## Hướng làm (không cần hỏi)

- **Modal quy tắc động**: `openHrmRulesGuideModal` gọi `GET /api/hrm/config`, render mức phạt / ngưỡng công / OT từ `hrm_rules` + danh sách khối từ `hrm_work_blocks`. Xóa HTML cứng.
- **Ngưỡng công theo khối**: đủ công = min(7h, giờ ca của khối − nghỉ trưa); nửa công = min(3.5h, nửa giờ ca). Không đổi schema. Khối 8h giữ nguyên kết quả cũ.
- Form NV: hiện "Phụ cấp hiệu lực" cạnh ô phụ cấp gốc.

## Câu hỏi đã chốt (02/11/2026)

| # | Câu hỏi | Đáp án đã chốt | Trạng thái |
|---|---|---|---|
| 1 | NV không chấm công | Cờ "Miễn chấm công" trong hồ sơ: đủ công, chỉ trừ ngày nghỉ nhập tay, không phạt | [x] Làm xong |
| 2 | TTS 1 ca vs 2 ca | Khối TTS 1 ca 4h (đủ ca = 1 công); TTS 2 ca giữ Văn Phòng | [x] Seed khối "TTS Ca Sáng"/"TTS Ca Chiều"; ngưỡng công theo độ dài ca |
| 3 | Làm bù | Ngày nghỉ = OFF (không phạt), ngày bù quẹt thẻ tự cộng công | [x] Engine đã làm được sẵn; đổi nhãn "Off cả ngày (… / Nghỉ có bù)" |
| 4 | Thợ Spa | Anh đã xóa trên máy chủ; DB máy code là bản cũ | Bỏ, không làm |
| 5 | Phụ cấp thiếu | Form sửa NV hiện 0 | [x] Hiện "Đang hưởng: X đ (gồm điều chỉnh)" dưới ô phụ cấp gốc |

Lưu ý: DB `data/pos.db` máy code là bản cũ (không có chấm công, còn thợ Spa) — số -13.5tr ở bảng trên chỉ minh họa cơ chế, không phải số máy chủ.

## Còn mở
- `tests/test_hrm_payroll_api.py::test_permission_required` fail khi chạy chung suite, pass khi chạy riêng — có từ trước (đã kiểm trên code gốc bằng git stash).
- Server chạy exe: phải rebuild `POS_Mastercare.exe` để áp dụng.
