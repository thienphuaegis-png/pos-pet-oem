# ⚡ DỰ ÁN POS OFFLINE PORTABLE (WINDOWS)

> **Mục tiêu**: Ứng dụng POS Bán hàng & In ấn Offline 100% chạy cục bộ trên Windows, cơ sở dữ liệu SQLite, đóng gói PyInstaller `.exe` một click chạy ngay (`chay_ngay.bat`). Thiết kế mẫu in theo phân vùng, hỗ trợ đầy đủ khổ giấy (K80, K58, A4 Dọc/Ngang, A5), kéo thả tự do, chia cột (2-3 cột) và snap-to-grid.

---

## 1. THÔNG TIN DỰ ÁN & MÔI TRƯỜNG
- **Thư mục dự án**: `D:/Projects_Hermes/pos-offline`
- **Địa chỉ truy cập local**: `http://127.0.0.1:8989`
- **Khởi động**: `chay_ngay.bat`
- **Đóng gói file chạy**: `build_exe.bat`
- **Cơ sở dữ liệu**: SQLite cục bộ tại `data/pos.db`
- **Công nghệ**: Python FastAPI, Uvicorn, SQLite3, HTML5 Canvas SPA, TailwindCSS, QRCode.js

---

## 2. KIẾN TRÚC & TỔ CHỨC MÃ NGUỒN
```
pos-offline/
├── chay_ngay.bat                  # Script khởi động server & mở trình duyệt
├── build_exe.bat                  # Script build file EXE chạy độc lập
├── server.py                      # FastAPI Backend & REST API routes
├── database.py                    # Khởi tạo schema & kết nối SQLite
├── main.py                        # Entrypoint chạy app
├── data/
│   └── pos.db                     # Database SQLite cục bộ
├── templates/
│   └── index.html                 # Toàn bộ giao diện SPA + Canvas Builder
├── plans/                         # Kế hoạch chi tiết từng tính năng
│   ├── a4_b2b_template_plan.md
│   ├── canvas_drag_drop_plan.md
│   ├── company_and_qr_plan.md
│   ├── dynamic_table_expansion_plan.md
│   ├── multi_paper_templates_plan.md
│   ├── pos_print_plan.md
│   ├── resize_and_zones_plan.md
│   ├── visual_builder_plan.md
│   └── zone_flow_layout_plan.md
├── PROJECT_MAP.html               # Bản đồ dự án tương tác trực quan
└── PROJECT_TRACKING.md            # File theo dõi tiến độ và lịch sử (file này)
```

---

## 3. TIẾN ĐỘ TÍNH NĂNG (FEATURE PROGRESS)

### A. Phân hệ Bán hàng & Nghiệp vụ (POS Core)
- [x] Bán hàng (POS Cart, tính tiền, giảm giá, thanh toán)
- [x] Quản lý hàng hóa & Định mức nguyên vật liệu (BOM)
- [x] Nhập hàng & Quản lý nhà cung cấp
- [x] Quản lý đối tác khách hàng & Công nợ
- [x] Sổ quỹ thu chi
- [x] Báo cáo tổng hợp doanh thu
- [x] Thông tin doanh nghiệp & Tài khoản VietQR động

### B. Phân hệ Thiết kế Mẫu In (Canvas Invoice Designer)
- [x] **Hỗ trợ đa khổ giấy**: K80, K58, A4 Dọc, A4 Ngang, A5 Dọc, A5 Ngang (lưu riêng từng khổ).
- [x] **Cấu trúc 3 phân vùng (Zones)**:
  - 📌 Đầu trang (Header): Logo, Tên shop, Địa chỉ, SĐT, Tiêu đề, Mã đơn, Ngày giờ, Khách hàng.
  - 📋 Thân trang (Body): Bảng danh sách hàng hóa (tự động co giãn theo số lượng món).
  - 💰 Chân trang (Footer): Tổng tiền, Giảm giá, Phải trả, Tiền đưa, Thừa/Nợ, QR Code, Lời cảm ơn.
- [x] **Snap-to-Grid (Lưới hít canh chỉnh 10px)**: Kéo thả và resize tự động bám dính lưới.
- [x] **Snap-to-Elements (Hít cạnh & tim giữa)**: Hiện đường gióng đỏ khi thẳng hàng với khối khác.
- [x] **Di chuyển tự do trong vùng (Free Drag)**: Hỗ trợ layout 2 cột, 3 cột tùy biến (ví dụ: QR bên trái, Tổng tiền bên phải).
- [x] **Điều chỉnh vị trí tọa độ X, Y**: Nhập số pixel chính xác hoặc bấm nút căn Trái/Giữa/Phải/Rộng.
- [x] **Tay cầm co dãn (Resize Handle)**: Kéo chiều rộng trực tiếp trên Canvas.
- [x] **In thực tế chuẩn xác (WYSIWYG Print)**:
  - Đồng bộ tọa độ Canvas (px) sang bản in thực tế qua container 2 lớp và auto-scale.
  - Tự động đẩy vùng chân trang (`deltaY`) khi bảng hàng hóa có nhiều món vượt thiết kế mẫu.

---

## 4. NHẬT KÝ COMMITS & LỊCH SỬ SỬA LỖI (GIT LOG)

| Commit | Loại | Nội dung thực hiện |
| :--- | :---: | :--- |
| `70311c3` | Checkpoint | Canvas Drag Drop với Resize Handle và phân chia Zones cơ bản |
| `3d44234` | Feature | Cơ chế `deltaY` tự động đẩy khối chân trang khi bảng món nở dài |
| `590e483` | Feature | Zone-based Flow Layout và nút điều hướng thứ tự ▲/▼ |
| `a5c157f` | Fix | Đường ranh giới phân vùng tự động co giãn theo vị trí phần tử thực tế |
| `7e3bac7` | Fix | Ngăn chặn hiện tượng chữ đè chồng chéo bằng Flow Layout |
| `f4ba7b0` | Fix | Dọn hàm trùng `addCanvasItem`, Logo mặc định lên đầu Header, gán Zone metadata chuẩn |
| `46408ef` | Feature | Snap-to-grid 10px + snap đường gióng đỏ + kéo thả tự do layout 2-3 cột |
| `cbca735` | Fix | Đồng bộ tỷ lệ in thực tế theo pixel canvas, khắc phục lệch vị trí khi in |

---

## 5. HẠNG MỤC CẦN LÀM TIẾP THEO (BACKLOG)
- [ ] **Mẫu in A4 bán sỉ/đại lý chuẩn nghiệp vụ**:
  - Bảng 9 cột: TT, SKU, Tên hàng, ĐVT, Đơn giá, Chiết khấu, Số lượng, Thành tiền, Ghi chú.
  - 3 ô chân trang: Thông tin chuyển khoản VietQR, Ghi chú & Điều khoản, Tổng kết công nợ.
  - 3 cột chữ ký: Kế toán, Thủ kho, Người nhận hàng.
- [ ] **Quản lý danh sách mẫu in (Templates Presets)**: Cho phép lưu thành nhiều mẫu riêng biệt thay vì ghi đè.
- [ ] **Đóng gói file EXE hoàn chỉnh**: Chạy `build_exe.bat` và test trên máy Windows độc lập không cài Python.
