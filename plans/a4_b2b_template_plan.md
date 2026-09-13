# Implementation Plan: Mẫu In A4 Đại Lý B2B, Bật/Tắt Theo Khu Vực & Quản Lý Mẫu Mới

**Goal:** Triển khai mẫu in A4 chuyên nghiệp chuẩn Đại lý B2B (như ảnh), thiết kế hệ thống bật/tắt thành phần theo đúng 3 phân vùng và quản lý lưu nhiều mẫu in độc lập.

**Architecture:**
- Frontend: Cột trái gom nhóm Bật/Tắt theo 3 Phân Vùng (Đầu trang, Bảng hàng, Cuối trang). Khi bật checkbox thì tự động định vị đúng vị trí trong vùng đó.
- Khung mẫu A4: Tái hiện đầy đủ bố cục hóa đơn Master Care For Pet (Header 2 cột, bảng 9 cột, chân trang 3 cột: TK ngân hàng - QR - Thanh toán, và 3 ô chữ ký Kế toán / Thủ kho / Người nhận).
- Quản lý Preset Mẫu: Hỗ trợ "Lưu đè mẫu hiện tại" hoặc "Lưu thành mẫu mới" (nhập tên mẫu) và dropdown chọn mẫu để chuyển đổi.

## Tasks
- [ ] Task 1: Cập nhật CSS & Dữ liệu mẫu A4 B2B trong `templates/index.html`.
- [ ] Task 2: Xây dựng giao diện Bật/Tắt theo 3 Khu Vực ở Sidebar trái và Dropdown chọn/lưu mẫu mới.
- [ ] Task 3: Cập nhật Engine render Canvas & Modal in hỗ trợ đầy đủ bảng 9 cột và footer 3 cột + chữ ký.
- [ ] Task 4: Kiểm thử hiển thị và in thử mẫu A4 Đại lý.
