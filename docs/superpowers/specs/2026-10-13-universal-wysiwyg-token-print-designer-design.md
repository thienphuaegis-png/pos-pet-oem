# Thiết Kế Trình Soạn Thảo Mẫu In Toàn Năng (WYSIWYG + Token Chips Chuẩn KiotViet)

## Mục Tiêu
Nâng cấp toàn diện sub-tab **Cài Đặt > Thiết Kế Mẫu In** (`settings-sub-templates`) thành Trình Soạn Thảo Mẫu In Đa Nghiệp Vụ WYSIWYG chuyên nghiệp:
1. **Đa nghiệp vụ (Multi-Document)**: Hỗ trợ 6 nhóm chứng từ:
   - `pos_retail`: Hóa đơn bán lẻ (K80 / K58)
   - `pos_b2b`: Hóa đơn bán sỉ / Đại lý (A4 / A5)
   - `purchase_order`: Phiếu nhập hàng nhà cung cấp (A4 / A5 / K80)
   - `oem_order`: Hợp đồng gia công & Lệnh sản xuất OEM (A4 Dọc / A4 Ngang)
   - `cashbook_voucher`: Phiếu thu / Phiếu chi sổ quỹ (K80 / A5)
   - `spa_intake`: Phiếu tiếp nhận thú cưng & Dịch vụ Spa (K80 / A5)
2. **Trình soạn thảo WYSIWYG tự do**:
   - Thanh công cụ định dạng (Font, Cỡ chữ, In đậm, Nghiêng, Gạch chân, Màu sắc, Canh lề, Bảng biểu, Chèn ảnh logo, Nút `</> Source` sửa HTML).
   - Thao tác tự do như Microsoft Word, hỗ trợ gõ `/` hoặc bấm nút `[🧩 Chèn Token]` để mở bảng chọn token.
   - Các token hiển thị dưới dạng chip `[Tên token]` trực quan và có thể xóa bằng phím Backspace hoặc click chuột.
3. **Modal Token Picker đa tầng**:
   - Phân loại rõ ràng: *Thông tin cửa hàng, Khách hàng / Đối tác, Hàng hóa, Thanh toán, Gia công OEM, Dịch vụ Spa*.
   - Có ô tìm kiếm token theo từ khóa, nút Chèn và nút Sao chép.
4. **Live Preview thời gian thực**:
   - Khung xem trước song song (Split Screen), tự động nạp đơn hàng mẫu thật của nghiệp vụ tương ứng.
   - Đổi khổ giấy: **K58, K80, A5, A4**.
   - Đổi hướng giấy: **Khổ dọc (Portrait)** / **Khổ ngang (Landscape)**.
   - Thước thu phóng Zoom slider (80% - 120%).
5. **Thư viện mẫu chuẩn (Presets 1-Click)**:
   - Menu `[Chọn mẫu gợi ý]` có sẵn các mẫu chuẩn đẹp mắt cho từng nghiệp vụ.
   - Nút `Đặt lại` khôi phục mẫu gốc, `In thử` mở hộp thoại in trình duyệt, `Lưu mẫu` lưu vào CSDL.

## Kiến Trúc Dữ Liệu & Backend
- Endpoint API trong `routers/settings.py`:
  - `GET /api/settings/print-templates/{doc_type}`: Lấy mẫu HTML, khổ giấy, hướng in của loại chứng từ.
  - `POST /api/settings/print-templates/{doc_type}`: Lưu mẫu HTML và cấu hình in.
  - `GET /api/settings/print-templates/{doc_type}/sample-data`: Trả về dữ liệu mẫu thực tế để live preview.
- Lưu trữ trong bảng `settings`: Key `print_template_{doc_type}` và `print_config_{doc_type}`.
