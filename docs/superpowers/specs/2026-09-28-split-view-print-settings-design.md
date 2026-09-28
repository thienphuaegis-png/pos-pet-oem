# Thiết Kế Chi Tiết: Giao Diện Cài Đặt Mẫu In 2 Cột Trực Quan (Split View)

**Ngày:** 2026-09-28  
**Tác giả:** Bùi Thiên Phú & Hermes  
**Trạng thái:** Approved by User  
**Mục tiêu:** Tái cấu trúc giao diện Cài Đặt Mẫu In (`templates/index.html` và `static/js/modules/productions.js`) từ dạng xếp chồng dọc sang bố cục 2 cột (Split View) trực quan: Cột trái điều khiển & cấu hình nhanh, Cột phải Live Canvas xem trước và kéo thả tờ in.

---

## 1. Kiến Trúc Bố Cục (Layout Architecture)
Khu vực `#settings-sub-templates` được chia làm 2 cột độc lập theo tỷ lệ chuẩn màn hình POS (38% Cột Trái - 62% Cột Phải):

### 1.1 Cột Trái (Sidebar Điều Khiển & Cấu Hình)
1. **Bộ chọn loại hóa đơn / mẫu in (`#canvas-preset-select`):** Gom nhóm `<optgroup>` trực quan theo nghiệp vụ (Bán lẻ POS, Spa, Sổ Quỹ, Báo Cáo, Bán sỉ A4, Kiểm kê).
2. **Thẻ In Đậm Chống Mờ (Toggle Switch):** Gạt bật/tắt in đậm cố định cho loại phiếu đang chọn, kèm hiển thị badge trạng thái.
3. **Bộ chọn Khổ Giấy (`#canvas-paper-size`) & Thao tác mẫu:** Nút Lưu mẫu, Lưu mẫu mới, Đổi tên, Xóa, Reset mặc định.
4. **Danh sách Bật/Tắt thành phần mẫu in:** Các checkbox dạng thẻ ghim phân vùng (Logo, Khách hàng, Thú cưng, Bảng chi tiết, VietQR, Chữ ký...).
5. **Cụm nút Hành Động:** Nút `🖨️ In Thử Mẫu Này` to bản nổi bật và nút `💾 Lưu Mẫu`.

### 1.2 Cột Phải (Live Preview Canvas & Kéo Thả Trực Quan)
1. Vùng nền xám chống mỏi mắt (`bg-slate-100`), thanh zoom tỷ lệ (75%, 100%, 125%).
2. Khung vẽ Canvas mô phỏng chuẩn kích thước thực tế của cuộn nhiệt K80/K58 hoặc khổ A4/A5.
3. Chữ trên Canvas phản hồi tức thì với công tắc in đậm bên cột trái (`-webkit-text-stroke: 0.35px #000; font-weight: 900 !important;`).

---

## 2. Đồng Bộ Runtime & API Backend
- Sử dụng setting `print_bold_configs` hiện có trong SQLite `pos.db`.
- Khi gạt công tắc in đậm ở cột trái, hệ thống tự động:
  1. Cập nhật `window.printBoldConfigs[currentType]`.
  2. Bật/tắt class in đậm trên khung Canvas.
  3. Gọi API `POST /api/settings/print-bold-configs` để auto-save cố định vào database.

---

## 3. Danh Sách File Tác Động
- `templates/index.html`: Cập nhật cấu trúc HTML của `#settings-sub-templates` thành 2 cột grid.
- `static/js/modules/productions.js`: Cập nhật hàm `switchPreset()`, đồng bộ toggle in đậm, cập nhật render Canvas và gắn class in đậm.
- `tests/test_split_view_print_settings.py`: Test suite kiểm tra cấu trúc 2 cột, selector, toggle switch, và liên kết sự kiện.
