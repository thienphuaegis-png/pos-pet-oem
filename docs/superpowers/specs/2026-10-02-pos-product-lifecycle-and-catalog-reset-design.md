# Thiết Kế Chi Tiết: Quản Lý Vòng Đời Hàng Hóa Chuẩn POS & Reset Catalog An Toàn

- **Ngày ban hành:** 2026-10-02
- **Tác giả:** Trợ lý Hermes & Bùi Thiên Phú
- **Phân hệ:** Quản Lý Hàng Hóa, Kho & Bảo Trì Hệ Thống (Inventory, Lifecycle & Safety Reset)

## 1. Mục Tiêu & Vấn Đề Giải Quyết
- **Vấn đề cũ:** Nút "Xóa Hết Hàng Hóa" đặt trực tiếp ngoài bảng hàng hóa thường ngày quá nguy hiểm, dễ bấm nhầm; xóa sản phẩm không phân biệt hàng còn tồn kho hay hàng đã có lịch sử hóa đơn kế toán; thiếu công cụ thao tác hàng loạt (bulk actions).
- **Mục tiêu mới:**
  1. Chuẩn hóa nghiệp vụ vòng đời sản phẩm: Đang kinh doanh (`ACTIVE`) vs Ngừng kinh doanh (`INACTIVE`).
  2. Không bao giờ xóa cứng sản phẩm còn tồn kho hoặc đã có hóa đơn lịch sử (tự động chuyển sang Ngừng kinh doanh). Chỉ xóa vĩnh viễn sản phẩm rác chưa từng phát sinh giao dịch và tồn = 0.
  3. Bổ sung Checkbox chọn nhiều mặt hàng + Thanh thao tác nhanh (Bulk Action Bar): Ngừng kinh doanh hàng loạt, Xóa hàng loạt an toàn.
  4. Đưa tính năng Reset/Dọn sạch danh mục để nạp lại vào trang **Cài Đặt Hệ Thống / Bảo Trì**, khóa cứng quyền Owner/Admin, yêu cầu gõ chữ xác nhận `XOA HANG HOA` và tự động backup database trước khi thực hiện.

## 2. Thiết Kế Backend API
- `POST /api/products/bulk-status`:
  - Body: `{"product_ids": [int], "is_active": int}`
  - Cập nhật trạng thái kinh doanh / ngừng kinh doanh cho danh sách sản phẩm.
- `POST /api/products/bulk-delete`:
  - Body: `{"product_ids": [int], "force_if_no_trans": bool}`
  - Logic kiểm duyệt từng sản phẩm:
    - Nếu còn tồn kho > 0: Không xóa, đưa vào danh sách `has_stock`.
    - Nếu đã có lịch sử hóa đơn bán (`order_items`) hoặc nhập (`purchase_items`): Chuyển `is_active = 0` (Ngừng kinh doanh).
    - Nếu tồn = 0 và chưa từng có giao dịch: Xóa vĩnh viễn khỏi `products` và dọn các bảng phụ thuộc (`item_units`, `product_inventory`, `supplier_items`, `product_bom`).
  - Trả về: `{"deleted_count": int, "inactivated_count": int, "skipped_has_stock": int, "skipped_details": [...]}`.
- `POST /api/settings/reset-catalog`:
  - Yêu cầu: Header xác thực quyền Owner/Admin (`require_role("owner")`).
  - Body: `{"confirm_code": str}` (phải đúng chuỗi `"XOA HANG HOA"`).
  - Tự động sao lưu database sang `data/backups/pos_auto_backup_before_reset_<timestamp>.db`.
  - Dọn sạch toàn bộ danh mục sản phẩm và bảng phụ thuộc.

## 3. Thiết Kế Giao Diện Frontend
- Bảng Hàng Hóa & Kho:
  - Thêm cột Checkbox từng dòng + Header "Chọn tất cả".
  - Bộ lọc trạng thái: `Tất cả` / `Đang kinh doanh` / `Ngừng kinh doanh (Đã ẩn)`.
  - Floating Action Bar phía dưới khi có $\ge 1$ mặt hàng được chọn:
    - Hiển thị: "Đã chọn X mặt hàng"
    - Nút: `🚫 Ngừng kinh doanh` / `✅ Cho phép kinh doanh lại`
    - Nút: `🗑️ Xóa đã chọn` (hiển thị modal xác nhận thông minh)
    - Nút: `✕ Bỏ chọn`
- Tab Cài Đặt Hệ Thống:
  - Khối "Quản Trị & Dọn Dẹp Danh Mục Hàng Hóa" (chỉ hiện khi là Owner).
  - Modal xác nhận 2 lớp yêu cầu nhập `XOA HANG HOA`.
