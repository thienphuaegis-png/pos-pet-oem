# Thiết Kế: Cải Tiến Giao Diện Quản Lý Mẫu In Chuẩn KiotViet (Bố Cục 3 Cột, Live Preview Cực Đại)

## 1. Mục tiêu
- Nâng cấp màn hình Cài Đặt Mẫu In (`#settings-sub-templates`) theo phong cách chuyên nghiệp của KiotViet.
- Sử dụng mô hình 3 cột:
  - Cột 1: Cây phân loại chứng từ (Đơn hàng, Dịch vụ Spa/Hotel, Sổ quỹ, Kho hàng).
  - Cột 2: Panel bật/tắt khối dữ liệu trực quan (Chế độ 1) gọn gàng (350px).
  - Cột 3: Khung xem trước bản in kích thước cực đại (60-70% màn hình), hỗ trợ Zoom `+`/`-`, khổ K80 (400px), K58 và A4 Bán sỉ (720px).
- Hỗ trợ quản lý đa mẫu in theo từng loại chứng từ (`+ Tạo mẫu mới`, `Đổi tên`, `Xóa`, `In thử`, `Lưu mẫu`).

## 2. Bố cục chi tiết giao diện (`templates/index.html`)

### 2.1. Cột 1: Cây danh mục chứng từ (Left Tree - 220px)
- Nhóm Đơn Hàng: Hóa Đơn Bán Hàng (`order_invoice`), Trả Hàng (`order_return`), Giao Hàng (`delivery`).
- Nhóm Dịch Vụ: Phiếu Tiếp Nhận Spa (`spa_ticket`), Phiếu Thu Nạp Ví (`topup_receipt`).
- Nhóm Sổ Quỹ: Phiếu Thu (`cashbook_receipt`), Phiếu Chi (`cashbook_expense`).
- Nhóm Hàng Hóa: Phiếu Nhập Hàng (`purchase_order`), Chuyển Kho (`warehouse_transfer`).

### 2.2. Cột 2: Cấu hình khối trực quan (Config Panel - 350px)
- Công tắc nổi bật: In Đậm Chống Mờ Nhiệt (`chk-thermal-bold`).
- Khối 1: Thông tin cửa hàng (Tên shop, Địa chỉ, Hotline, Logo).
- Khối 2: Thông tin khách hàng & thu ngân (Tên khách, SĐT, Thu ngân, Điểm tích lũy).
- Khối 3: Bảng mặt hàng/dịch vụ (ĐVT, Chiết khấu, Nợ cũ/Tiền thừa, Tên thú cưng).
- Khối 4: VietQR & Chân trang (Mã QR động, Số tài khoản/Chủ TK, Lời cảm ơn).

### 2.3. Cột 3: Khung xem trước cực đại (Preview Viewport)
- Thanh tab đa mẫu in phía trên (`template-tabs-container`).
- Bộ điều khiển: Chọn khổ giấy (`K80`, `K58`, `A4`), Bộ nút Zoom (`-`, `100%`, `+`), Nút In Thử, Nút Lưu Mẫu.
- Viewport xem trước: Khung giấy lớn, hiển thị đầy đủ, sắc nét, tương tác bật/tắt phản hồi tức thì.

## 3. Quản lý trạng thái & Lưu trữ (`static/js/modules/productions.js` & `/api/settings/template`)
- Mở rộng cấu trúc `multiTemplates`:
  - Lưu trạng thái cấu hình và presets theo từng loại chứng từ (`doc_type`).
  - Hàm `renderPrintSettingsTree()`: Render danh mục và bắt sự kiện chuyển loại chứng từ.
  - Hàm `switchDocType(docType)`: Chuyển chứng từ đang cấu hình và nạp dữ liệu mẫu tương ứng.
  - Hàm `renderPreviewSheet()`: Render bản in to rõ với tỉ lệ chuẩn.
  - Hàm `zoomSheet(delta)`: Phóng to/thu nhỏ khung xem trước.
