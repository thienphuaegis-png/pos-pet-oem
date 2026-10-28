# Tài Liệu Thiết Kế: Cải Tiến Giao Diện Kiểm Kê Kho & Kiểm Kê Theo Nhóm Hàng

## 1. Mục tiêu
Chuẩn hóa giao diện tab **Kiểm Kê Kho & Cân Bằng Tồn Kho** trong hệ thống Mastercare POS:
- Chuyển màn hình tab Kiểm Kê Kho thành tờ phiếu kiểm kê luôn sẵn sàng (Single Active Audit Sheet).
- Bỏ nút "Tạo phiếu mới" gây dư thừa logic.
- Bổ sung Droplist Popup chọn nhiều nhóm hàng (Multi-select Category Dropdown) có tìm kiếm và chip tag gọn gàng.
- Cho phép kiểm toàn bộ kho hoặc kiểm riêng theo các nhóm hàng đã chọn mà không ảnh hưởng nhóm khác.
- Thêm thanh tìm kiếm mặt hàng realtime trong bảng kiểm.
- Hỗ trợ phím `Enter` tự động nhảy focus xuống ô nhập tiếp theo (Keyboard-friendly) và cơ chế cập nhật trực tiếp DOM chống giật lag.
- Đưa lịch sử kiểm kê vào Modal Popup xem/in lại phiếu cũ.

## 2. Thay đổi Giao diện (templates/index.html)
- Khu vực `#inv-sub-audit`:
  - Header: Tiêu đề + Mã phiếu tự sinh + Nút mở modal `📋 Lịch Sử Phiếu Kiểm`.
  - Form hàng 1:
    - `audit-wh-select`: Chọn kho kiểm kê.
    - `container-audit-categories`: Droplist Popup đa chọn nhóm hàng (Trigger box hiển thị các chip tag nhóm được chọn, popup chứa ô tìm kiếm, nút chọn/bỏ tất cả, và danh sách checkbox nhóm hàng).
    - `audit-note`: Ghi chú đợt kiểm kê.
  - Toolbar bảng:
    - Ô tìm kiếm mã/tên mặt hàng `audit-item-search`.
    - Nút thao tác nhanh: `⚡ Gán thực tế = Sổ sách` và `🔄 Xóa về 0`.
  - Bảng kiểm kê `#table-audit-items`:
    - Cột: STT, Mã, Tên mặt hàng, Nhóm hàng/Phân loại, ĐVT, Tồn sổ sách, Tồn thực tế (*), Chênh lệch, Lý do lệch.
  - Footer:
    - Thống kê: Tổng mặt hàng trong phạm vi kiểm, Số món khớp, Số món lệch, Tổng SL lệch.
    - Nút hành động: `⚡ Cân Bằng Kho & Hoàn Tất Phiếu`.
  - Modal `#modal-audit-history`: Hiển thị danh sách lịch sử các đợt kiểm kê trước đó.

## 3. Thay đổi Xử lý Dữ liệu & JavaScript (static/js/app.js)
- Lưu trữ danh sách nhóm hàng duy nhất (`auditCategories`) trích xuất từ dữ liệu hàng trong kho.
- State `selectedAuditCategories: []` (trống = Tất cả nhóm trong kho).
- Hàm `toggleAuditCategoryPopup()`, `renderAuditCategoryOptions()`, `onToggleAuditCategory()`.
- Hàm `filterAuditTableByCategoriesAndSearch()`: Lọc mặt hàng theo nhóm đã chọn và từ khóa tìm kiếm.
- Hàm `handleAuditKeyDown(e, idx)`: Nhảy focus xuống dòng tiếp theo khi bấm Enter.
- Hàm `updateAuditItemActual(id, val)`: Cập nhật tồn thực tế trực tiếp vào dòng và recalculate thống kê mà không re-render toàn bảng.
- Hàm `submitStockAudit()`: Gửi danh sách các mặt hàng trong phạm vi kiểm lên API `/api/inventory/audit`. Sau khi hoàn tất thành công, sinh mã phiếu mới và làm mới form.
- Modal lịch sử: `openModalAuditHistory()`, `closeModalAuditHistory()`.

## 4. Kế hoạch kiểm thử & nghiệm thu
- Chạy test tự động pytest kiểm tra API `/api/inventory/audit`.
- Build lại binary `POS_Mastercare.exe` từ môi trường `.venv`.
- Commit và push lên GitHub.
