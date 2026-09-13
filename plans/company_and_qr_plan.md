# Implementation Plan: Tách Thông Tin Công Ty, Bộ Căn Chỉnh Mẫu In & QR Code Động/Tĩnh

## 1. Tách cấu hình riêng biệt trong Database
- Bảng `settings`:
  - Nhóm Thông tin công ty: `shop_name`, `shop_address`, `shop_phone`, `shop_bank_code`, `shop_bank_account`, `shop_bank_owner`, `shop_qr_image`.
  - Nhóm Mẫu in: `print_template`, `print_margin_left`, `print_margin_top`, `print_width` (K80: 72-80mm, K58: 48-58mm).
- APIs:
  - `GET /api/settings/company` & `POST /api/settings/company`
  - `GET /api/settings/template` & `POST /api/settings/template`

## 2. QR Code Thanh Toán Động & Tĩnh
- Thẻ biến động `{{qr_thanh_toan}}`:
  - Nếu cấu hình dùng **VietQR động**: Sinh link chuẩn VietQR: `https://img.vietqr.io/image/{bank_code}-{bank_account}-compact2.png?amount={phai_tra}&addInfo={ma_hoa_don}&accountName={bank_owner}`. Khách quét là app ngân hàng tự điền đủ số tiền + mã đơn.
  - Nếu cấu hình dùng **QR tĩnh**: Hiển thị ảnh upload (Base64 trong SQLite).
  - Thêm thẻ biến động `{{logo_cua_hang}}` để chèn logo/hình ảnh.

## 3. Bộ căn chỉnh lề & bố cục trực quan trên giao diện
- Bộ điều khiển thanh trượt/nhập:
  - Độ rộng trang (Width: 58mm / 72mm / 80mm).
  - Căn lề trái / lề phải / lề trên (Padding/Margin).
  - Căn chỉnh text: Trái / Giữa / Phải cho tiêu đề hoặc chân trang.
  - Bảng món: Tùy chọn kẻ viền đứt nét, viền liền hoặc không viền.
- Tách thành 2 Tab riêng biệt trên menu:
  1. `🏢 Thông Tin Doanh Nghiệp` (Thông tin shop + Cấu hình ngân hàng VietQR + Upload QR tĩnh).
  2. `⚙️ Thiết Kế Mẫu In` (Trình soạn thảo, căn lề, bảng, chèn ảnh, live preview).
