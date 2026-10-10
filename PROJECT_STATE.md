# PROJECT STATE — POS Offline (Petcare & Retail)

**Checkpoint:** 2026-10-10 — Sửa Lỗi In Ấn Toàn Diện: Bộ Chọn Mẫu Đa Dạng, Ưu Tiên Mẫu Tùy Chỉnh, In Đậm Chuẩn, Khổ A5 Không Nhảy Trang, Chống Ghi Đè Đa Máy & Tailwind Offline 100%
**Server:** `http://127.0.0.1:8998` / `http://127.0.0.1:8999` — FastAPI + SQLite (`data/pos.db` & `C:/POS`)
**Working dir:** `D:/Projects_Hermes/pos-offline-petcare2` & Sync to `C:/POS`
**Archive Log:** `docs/archive/STATE_2026_09.md`

---

## 1. Phiên Hiện Tại ✅ (2026-10-10)
- **Bộ Chọn Mẫu In Đa Dạng & Ưu Tiên Mẫu Tùy Chỉnh (`static/js/pos.js`, `templates/index.html`, `templates/pos.html`):**
  - Thêm dropdown `#modal-print-preset-select` ngay cạnh 2 nút K80/A4 trên popup in, nạp động mọi preset.
  - Xóa bỏ việc ép cứng mẫu mặc định: hàm `findBestPresetForSize` ưu tiên giữ nguyên mẫu anh đang chọn trong Cài Đặt (ví dụ: "K80 mới", 2 mẫu "A4 Đại Lý (Mẫu Mới)").
- **Chuẩn Hóa In Đậm & Khổ Giấy A5 (`static/js/pos.js`, `static/js/modules/productions.js`):**
  - Sửa `mapPresetKeyToBoldKey`: kiểm tra trực tiếp `paper_size` và `doc_type` thay vì match string, tránh mẫu A4 tự tạo bị gán nhầm sang K80 lẻ.
  - Hàm `printInvoiceDirectly` ưu tiên cờ `is_bold_all` của từng template; sửa kích thước canvas & CSS `@page` khổ A5 triệt tiêu trang trắng thừa.
- **Chống Ghi Đè Cài Đặt Đa Máy & Chuẩn Hóa Popup `/pos` (`routers/settings.py`, `templates/pos.html`):**
  - API `/api/settings/template` tự động merge dictionary presets giữa các máy, tránh ghi đè làm mất mẫu máy khác.
  - Trang `/pos` chuyển nút in sang `printInvoiceDirectly` qua iframe cô lập chuẩn POS.
- **Offline Tailwind CSS 100% (`static/js/tailwind.js`, `templates/*.html`):**
  - Tải lưu trữ `tailwind.js` cục bộ (407 KB), loại bỏ hoàn toàn phụ thuộc `cdn.tailwindcss.com`, bảo đảm giao diện không vỡ khi mất mạng.
- **Bộ Kiểm Thử:** `tests/test_dynamic_print_modal_preset_selector.py` pass 5/5, toàn bộ 22/22 print test pass.

---

## 2. Bằng Chứng Kiểm Thử (Verification) 🧪
- `tests/test_dynamic_print_modal_preset_selector.py`: **PASS 5/5**
- Toàn bộ 22/22 print test cases pass 100%.

---

## 3. Files Thay Đổi Chính
| Module / File | Trách nhiệm |
|---|---|
| `static/js/pos.js` | Dropdown chọn mẫu, `findBestPresetForSize`, kiểm tra `is_bold_all`, sửa canvas/iframe khổ A5 |
| `static/js/modules/productions.js` | Sửa `mapPresetKeyToBoldKey` nhận diện `paper_size`/`doc_type`, đồng bộ toggle in đậm |
| `routers/settings.py` | Merge presets tránh xung đột ghi đè giữa nhiều máy trạm |
| `templates/index.html` & `pos.html` | Thêm `#modal-print-preset-select`, dùng `printInvoiceDirectly`, nạp Tailwind offline |
| `static/js/tailwind.js` | Thư viện Tailwind CSS chạy nội bộ không cần internet |
| `tests/test_dynamic_print_modal_preset_selector.py` | 5 unit test tự động xác thực toàn bộ logic |

---

## 4. Việc Kế Tiếp (Next Priority Tasks) 📌
- [ ] `ecomm-sync`: Nghiên cứu kịch bản kéo đơn sàn TMĐT (Shopee/TikTok Shop) tự động trừ tồn kho.
- [ ] `bill-5`: Kiểm tra và chuẩn hóa in ấn K80/A4 trên máy in vật lý tại quầy thực tế.
- [ ] `cloud-2`: Tích hợp đồng bộ dữ liệu thời gian thực giữa quầy offline và Supabase Cloud.

