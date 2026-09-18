# ⚡ DỰ ÁN POS OFFLINE PORTABLE (WINDOWS)

> **Mục tiêu**: Ứng dụng POS Bán hàng, Gia công OEM & In ấn Offline 100% chạy cục bộ trên Windows, cơ sở dữ liệu SQLite, đóng gói PyInstaller `.exe` một click chạy ngay (`chay_ngay.bat`). Thiết kế mẫu in theo phân vùng, hỗ trợ đầy đủ khổ giấy (K80, K58, A4 Dọc/Ngang, A5), kéo thả tự do, chia cột (2-3 cột) và snap-to-grid.

---

## 1. THÔNG TIN DỰ ÁN & MÔI TRƯỜNG
- **Thư mục dự án**: `D:/Projects_Hermes/pos-offline`
- **Địa chỉ trang Quản trị**: `http://127.0.0.1:8999`
- **Địa chỉ Màn hình Bán Hàng (POS)**: `http://127.0.0.1:8999/pos`
- **Khởi động**: `chay_ngay.bat` (tự động giải phóng cổng 8999 và chạy uvicorn reload)
- **Chia sẻ online test từ xa**: `chia_se_online.bat` (Cloudflare Tunnel)
- **Đóng gói file chạy**: `build_exe.bat`
- **Cơ sở dữ liệu**: SQLite cục bộ tại `data/pos.db` (35 bảng)
- **Công nghệ**: Python FastAPI, Uvicorn, SQLite3, HTML5 Canvas SPA, TailwindCSS, QRCode.js

---

## 2. KIẾN TRÚC & TỔ CHỨC MÃ NGUỒN
```
pos-offline/
├── chay_ngay.bat                  # Script dọn dẹp port 8999 & khởi động
├── chia_se_online.bat             # Tunnel Cloudflare chia sẻ link test từ xa
├── build_exe.bat                  # Script build file EXE độc lập
├── server.py                      # FastAPI Backend & 144 REST API routes
├── database.py                    # Khởi tạo schema 35 bảng SQLite
├── main.py                        # Entrypoint chạy app uvicorn
├── data/
│   ├── pos.db                     # Database SQLite cục bộ (35 bảng)
│   └── backups/                   # Bản sao lưu DB định kỳ
├── templates/
│   ├── index.html                 # Giao diện SPA Quản trị & Canvas Designer
│   └── pos.html                   # Màn hình Bán hàng (Thu ngân) chuyên dụng
├── static/js/
│   ├── app.js                     # Logic SPA quản trị & Canvas
│   └── pos.js                     # Logic bán hàng, hotkeys F1-F9, đa tab hóa đơn
├── routers/                       # 12 router nghiệp vụ
│   ├── pos.py                     # API bán hàng, đơn hàng, hóa đơn
│   ├── products.py                # CRUD sản phẩm, import/export Excel
│   ├── inventory.py               # Kho hợp nhất, chuyển kho, kiểm kê, thẻ kho
│   ├── bom.py                     # Định mức NVL & sửa BOM inline
│   ├── combos.py                  # Quản lý Combo & rã tồn kho khi bán
│   ├── purchases.py               # PO 2 bước, in kiểm tay, nhận kho thực tế
│   ├── oem.py                     # Đặt gia công xưởng, cọc 50%, dự báo dòng tiền 2 quỹ
│   ├── price_lists.py             # Bảng giá đa cấp & phân nhóm khách hàng
│   ├── partners.py                # Khách hàng, NCC, Thú cưng, Dịch vụ spa
│   ├── production.py              # Lệnh sản xuất đa thành phẩm theo BOM
│   ├── cashbook.py                # Sổ quỹ thu chi đa quỹ & báo cáo doanh thu
│   └── settings.py                # Cài đặt shop, thông tin VietQR, mẫu in
├── plans/                         # 14 tài liệu thiết kế & kế hoạch chi tiết
├── PROJECT_MAP.html               # Bản đồ dự án tương tác trực quan & xuất .md
└── PROJECT_TRACKING.md            # File theo dõi tiến độ và lịch sử (file này)
```

---

## 3. TIẾN ĐỘ TÍNH NĂNG (FEATURE PROGRESS)

### A. Phân Hệ Bán Hàng & Thu Ngân (Nhúng Native SPA & Tab Độc Lập)
- [x] **Nhúng Native vào SPA**: Tích hợp trực tiếp toàn bộ màn hình POS hiện đại vào `#tab-pos`, tối ưu tràn viền không cuộn kép, giữ nguyên giỏ hàng khi chuyển qua lại giữa các tab.
- [x] **Tái cấu trúc Sidebar chuẩn thu ngân**: Sắp xếp thứ tự: 🛒 Bán Hàng &rarr; 🐾 Dịch Vụ &rarr; 🧾 Hóa Đơn.
- [x] **Đa tab hóa đơn**: Tạo và chuyển đổi giữa nhiều hóa đơn cùng lúc (Hóa đơn 1, 2...), phím tắt `F1`.
- [x] **Bảng giỏ hàng chuẩn bán lẻ**: 12 cột (STT, Mã hàng, Tên, ĐVT, SL [-][+], Đơn giá, Thành tiền).
- [x] **Tìm kiếm thông minh**: Gõ từ khóa không dấu (F3), hỗ trợ súng quét barcode tự động nhảy món.
- [x] **Bán Combo**: Tự rã tồn kho thành phần và tự trừ tồn NVL con theo BOM.
- [x] **In hóa đơn chốt đơn & In tạm tính (Draft)**: Chọn trước mẫu in trên thanh công cụ (A4 B2B, K80, K58, A5), in tạm tính có watermark cảnh báo.

### B. Phân Hệ Gia Công OEM & Dự Báo Dòng Tiền Đa Quỹ (`routers/oem.py`)
- [x] **Đơn đặt gia công xưởng**: Chọn nhà máy, sản phẩm, số lượng, % VAT, % Chiết khấu, tự tính tiền cọc 50% và nhu cầu tem/vỏ chai.
- [x] **Nhận hàng thực tế & Quyết toán**: Nhập số lượng thực nhận, tự tính tiền đợt 2 còn lại, tự động trừ tem nhãn và vỏ chai từ kho xưởng theo định mức BOM.
- [x] **Cập nhật giá vốn thành phẩm**: Tự động tính giá vốn nhập kho = Chi phí gia công ròng (sau CK + VAT) + Giá vốn tem + chai + nắp.
- [x] **Dự báo dòng tiền 2 quỹ**: Tách rạch ròi 🏢 Quỹ Công Ty (có VAT) vs 👤 Quỹ Cá Nhân (không VAT), dự báo số tiền cần chi theo ngày hẹn giao hàng (trừ hao ±1 ngày).
- [x] **Tách công nợ NCC theo quỹ**: Ngăn chặn cấn trừ nhầm giữa tiền túi cá nhân và hóa đơn công ty.

### C. Phân Hệ Nhập Hàng, Bảng Giá & Đối Tác
- [x] **Quy trình PO 2 bước**: Lập phiếu hẹn giao → In phiếu kiểm tay → Xác nhận kiểm đếm thực nhận và ghi nợ.
- [x] **Bảng Giá Đa Cấp (`routers/price_lists.py`)**: Cài giá riêng cho từng sản phẩm theo Nhóm KH, tự fallback giá lẻ mặc định nếu chưa cài.
- [x] **Tách danh bạ Đối Tác**: Khách Hàng (gắn Thú Cưng) vs Nhà Cung Cấp (theo dõi nợ Cty & Cá Nhân).
- [x] **Import / Export Excel**: Hỗ trợ đầy đủ file mẫu cho Hàng hóa, Nguyên liệu, BOM, Khách hàng & NCC.

### D. Phân Hệ Kho Hàng & Thiết Kế Mẫu In
- [x] **Tồn kho hợp nhất**: Quản lý 435 sản phẩm & nguyên liệu, điều chuyển nội bộ, kiểm kê cân bằng tồn, thẻ kho.
- [x] **Mẫu in A4 B2B đại lý**: Bảng 9 cột, 3 ô chân trang (Tài khoản ngân hàng, VietQR động, Tổng kết công nợ), 3 chữ ký (Kế toán, Thủ kho, Người nhận).
- [x] **Canvas Invoice Designer**: Kéo thả tự do, snap-to-grid 10px, snap gióng đỏ, deltaY tự động đẩy chân trang khi bảng dài.

---

## 4. NHẬT KÝ COMMITS & LỊCH SỬ SỬA LỖI (GIT LOG)

| Commit / Tag | Loại | Nội dung thực hiện |
| :--- | :---: | :--- |
| `FIX-POS` | Fix | Sửa nút Sidebar `index.html` trỏ trực tiếp link `/pos`, loại bỏ nhầm lẫn kích hoạt tab-pos phôi cũ |
| `OEM-CF` | Feature | Phân hệ Gia công OEM, nhận hàng trừ tem chai kho xưởng theo BOM, dự báo dòng tiền 2 quỹ Cty/Cá nhân |
| `PRICE-PETS`| Feature | Bảng giá đa cấp, Phân nhóm khách hàng, Danh bạ thú cưng & Import/Export Excel |
| `e325689` | Fix | Sửa lỗi tham số query kho hợp nhất & cập nhật kho |
| `5ae1a4a` | Feature | CRUD sản phẩm & nguyên liệu, modal xuất hủy kho, combo BOM |
| `146af24` | Fix | Kho hợp nhất hiển thị đầy đủ 435 mặt hàng và nhà cung cấp |
| `9408b8d` | Feature | Thêm cột nhà cung cấp cho sản phẩm, nguyên liệu và kho hợp nhất |
| `9d849a3` | Fix | Bổ sung hàm `escapeHtml` trong purchases giải quyết lỗi ReferenceError |
| `467e7f7` | Feature | Fuzzy search tiếng Việt không dấu, PO chờ nhận hàng & Lệnh Sản Xuất đa thành phẩm |
| `a4c92e1` | Feature | Quản lý kho đa kho trọn gói + Tinh gọn menu sidebar thành các sub-tabs con |
| `fe2b8a1` | Feature | Mẫu in A4 B2B đại lý (9 cột, 3 ô chân trang, 3 chữ ký) + Quản lý Presets mẫu in độc lập |

---

## 5. HẠNG MỤC BACKLOG TIẾP THEO
- [ ] **Hoàn thiện luồng Hóa đơn Dịch vụ Pet Spa & Đặt lịch hẹn**: Hoàn thiện API và giao diện cho bảng `pet_service_tickets`.
- [ ] **Đóng gói file EXE hoàn chỉnh**: Chạy `build_exe.bat` và test trên máy Windows độc lập không cài Python.
