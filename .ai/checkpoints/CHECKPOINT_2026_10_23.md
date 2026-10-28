# CHECKPOINT TIẾN ĐỘ DỰ ÁN POS MASTERCARE (2026-10-23)

## I. TỔNG KẾT CÁC TÍNH NĂNG ĐÃ HOÀN TẤT HÔM NAY

1. **Tác Nhân AI Thích Ứng Vai Trò (Role-Adaptive AI Hub)**:
   - Tự động nhận diện vai trò tài khoản đăng nhập (`warehouse`, `accountant`, `cashier`, `owner`).
   - Đối với **Thủ Kho / OEM (Phụng)**:
     - Ẩn hoàn toàn doanh số bán lẻ, hoa hồng và tiền két 0đ của thu ngân.
     - Hiển thị số lượng hàng sắp hết chạm đáy tồn kho, tổng đơn hàng đang về.
     - Bảng **Lô hàng đang về & ngày dự kiến**: Chỉ hiển thị **Tên Nhà Cung Cấp** rõ ràng, tích hợp nút 1-chạm mở thẳng modal kiểm đếm nhận hàng / nhập kho ngay lập tức.
     - Box chân trang theo dõi công nợ NCC & xưởng OEM.
   - Đối với **Kế Toán**: Xem công nợ 2 chiều (phải thu khách nợ, phải trả NCC/xưởng), phiếu yêu cầu chi tiêu chờ duyệt.
   - Đối với **Thu Ngân (Đôn)**: Xem doanh số ca, hoa hồng định mức, tiền két và vé thú cưng spa.

2. **Cơ Sở Dữ Liệu & Định Mức Tồn Tối Thiểu (`min_stock`)**:
   - Migration bổ sung cột `min_stock REAL DEFAULT 5.0` vào bảng `products`.
   - Bổ sung ô nhập "Tồn tối thiểu (Cảnh báo đặt)" trên modal Thêm/Sửa hàng hóa (`#modal-prod-min-stock`).
   - Cập nhật thuật toán tính hàng cần đặt so khớp chính xác với `min_stock` riêng của từng sản phẩm.
   - Thêm modal `#modal-ai-low-stock` xem danh sách hàng sắp hết 1-chạm.

3. **Quản Lý Lời Nhắc Việc Trong Ca (`staff_reminders`)**:
   - Tạo bảng `staff_reminders` trong SQLite.
   - Tích hợp CRUD lời nhắc việc cá nhân hoặc giao việc trong ca (`POST`, `PATCH /toggle`, `DELETE`).
   - Hỗ trợ giờ hẹn (`remind_time`), mức độ ưu tiên (`urgent`, `normal`, `low`) và checkbox hoàn thành trực tiếp.

4. **Sơ Đồ Luồng Dữ Liệu DFD Hệ Thống (Archify)**:
   - Cập nhật sơ đồ luồng dữ liệu toàn bộ hệ thống POS Pet Care tại `.archify/dataflow-pos-system-20261022-120000/pos-dataflow.html`.
   - Bổ sung `Tác Nhân AI Hub` vào tầng Giao diện & UI, `AI Copilot Engine` vào tầng FastAPI Core, và `Bảng Reminders & Nháp` vào tầng CSDL SQLite.
   - Chạy lệnh `archify finalize` đạt chuẩn Showcase với toàn bộ các cổng kiểm tra tự động đều pass (`validate: pass`, `deliver: pass`, `check: pass`, `browser-check: pass`).

5. **Bản Đồ Dự Án Tương Tác (`PROJECT_MAP.html`)**:
   - Cập nhật version lên `v6.8-2026-10-23-role-adaptive-ai-and-oem-draft-plan`.
   - Bổ sung các mốc đã hoàn thành và danh sách các hạng mục cho phiên làm việc tiếp theo.

---

## II. KẾ HOẠCH BẮT ĐẦU VÀO NGÀY MAI (ROADMAP FOR TOMORROW)

Plan chi tiết đã được lưu tại: `.hermes/plans/plan_oem_draft_and_ai_auto_restock.md`.

1. **Bổ sung Nút "Lưu Đơn Nháp (DRAFT)" cho Phân Hệ OEM**:
   - Thêm nút `💾 Lưu Bản Nháp (DRAFT)` cạnh nút `🚀 Lưu Đơn & Xuất Cọc Sổ Quỹ` trên modal `#modal-create-oem`.
   - Đơn OEM lưu nháp không trừ tiền cọc, không tạo phiếu chi sổ quỹ, hiển thị badge `Bản Nháp` để mở ra chỉnh sửa hoặc xóa bất cứ lúc nào.

2. **Chức Năng AI Tự Động Tạo Đơn Nháp 1-Chạm (One-Click Auto Draft)**:
   - Nhận diện phân loại sản phẩm tự động:
     - Hàng Nhập NCC &rarr; Bấm 1 nút tạo ngay `purchases` (`status = 'draft'`).
     - Hàng Gia Công OEM &rarr; Bấm 1 nút tạo ngay `oem_orders` (`status = 'DRAFT'`).
   - Tự động mở ngay màn hình sửa/xóa đơn nháp trước mắt người dùng để điều chỉnh số lượng hoặc bấm xóa bỏ nếu chưa cần đặt.

3. **Phân Hệ "Phiếu Yêu Cầu Nhập Hàng" (Bảo Mật Ẩn Danh NCC)**:
   - Tạo bảng `purchase_requests` và `purchase_request_items`.
   - Giao diện tạo yêu cầu cho bộ phận cửa hàng/spa: xem toàn bộ sản phẩm được phân nhóm theo nguồn cung `[NGUON-01]`, `[NGUON-02]` nhưng **ẩn hoàn toàn tên thật, SĐT, giá vốn NCC**.
   - Tự động sinh `staff_reminders` nhắc Thủ Kho (Phụng) có yêu cầu nhập hàng mới kèm nút 1-chạm chuyển thành đơn PO chính thức.

---

## III. TRẠNG THÁI HỆ THỐNG
- **File thực thi**: `POS_Mastercare.exe` đã được rebuild mới nhất bằng PyInstaller.
- **Dịch vụ máy chủ**: Đang lắng nghe ổn định trên cổng `8998`.
- **Kiểm thử tự động**: 13/13 tests pass 100%.
- **Sơ đồ Dataflow**: `.archify/dataflow-pos-system-20261022-120000/pos-dataflow.html`.
- **Demo tương tác 1-chạm**: `static/mockups/ai_one_click_draft_demo.html`.
