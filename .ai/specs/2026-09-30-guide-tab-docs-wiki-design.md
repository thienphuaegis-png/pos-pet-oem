# Thiết Kế Chi Tiết: Tab Hướng Dẫn Nghiệp Vụ Trực Quan (Docs & Wiki Layout)

- **Ngày tạo:** 2026-09-30
- **Tác giả:** Trợ lý Hermes (theo yêu cầu của anh Phú)
- **Vị trí hiển thị:** Nằm ngay trên tab `Cài Đặt Hệ Thống` (`tab-settings`) trên sidebar chính.
- **Phong cách:** Mẫu 1 (Docs & Wiki Nghiệp Vụ) — Sub-sidebar phân hệ bên trái + Khung nội dung chi tiết với Sơ đồ Logic SVG Flowchart, Quy trình thao tác SOP từng bước, Phím tắt và Xử lý tình huống quầy.

---

## 1. Mục Tiêu & Yêu Cầu Nghiệp Vụ

1. **Chuẩn hóa đào tạo & tra cứu 0ms:** Cung cấp tài liệu nghiệp vụ sống động, rõ ràng ngay bên trong ứng dụng, giúp thu ngân, kỹ thuật viên spa, thủ kho và chủ tiệm tra cứu quy trình trong 3 giây mà không cần mở tài liệu giấy bên ngoài.
2. **Trực quan hóa luồng dữ liệu (Visual Logic):** Mỗi phân hệ đều có **Sơ đồ khối luồng công việc (SVG Flowchart)** minh họa đường đi của dữ liệu (Khách hàng → Vé/Hóa đơn → Két ca → Sổ Quỹ → Báo cáo).
3. **100% Hoạt động Offline:** Toàn bộ sơ đồ, biểu tượng và khung minh họa giao diện đều dùng SVG vector inline và class Tailwind CSS, tuyệt đối không dùng link ảnh CDN bên ngoài để đảm bảo tính sẵn sàng khi ngắt mạng internet.
4. **Bảo toàn kiến trúc:** Giữ nguyên 100% ID DOM của 14 tabs cũ, tăng số nút sidebar lên 15 nút và cập nhật test suite `tests/test_html_integrity.py`.

---

## 2. Cấu Trúc Bố Cục Giao Diện (Layout Hierarchy)

```
#tab-guide (flex flex-col md:flex-row min-h-[calc(100vh-5rem)] bg-white rounded-2xl border border-slate-200 overflow-hidden)
├── ASIDE: Sub-Sidebar Danh Mục Nghiệp Vụ (w-full md:w-64 bg-slate-50/90 border-r border-slate-200 p-3 shrink-0)
│   ├── Header: "DANH MỤC HƯỚNG DẪN" + ô tìm kiếm nhanh nghiệp vụ
│   └── Nav list (7 Phân hệ lớn):
│       ├── 1. Bán Hàng Quầy POS & Quản Lý Ca (F1-F9, mở/đóng ca, Z-Report)
│       ├── 2. Tiếp Nhận & Dịch Vụ Spa Grooming (Cân ký, đổi gói, kíp thợ, cấn trừ ví)
│       ├── 3. Khách Sạn Thú Cưng Pet Hotel (16 phòng, tiếp nhận theo lô, cọc, 3 view)
│       ├── 4. Nạp Gói Ví & Cấn Trừ Tiền Trả Trước (Quy tắc Best Offer, hoàn ví)
│       ├── 5. Sổ Quỹ Thu Chi & Dòng Tiền Công Nợ (Két ca, VietQR, Drawer đối soát)
│       ├── 6. Kho Hàng, Đơn PO & Gia Công OEM (Thẻ kho, định mức BOM, lệnh sản xuất)
│       └── 7. Kết Nối Mạng LAN & Cấu Hình Mẫu In (Dò IP, quét QR, 12 preset in nhiệt/A4)
│
└── SECTION: Khung Nội Dung Tài Liệu (flex-1 p-6 overflow-y-auto space-y-6)
    ├── Breadcrumb & Tiêu đề phân hệ + Badge vai trò phù hợp (Thu ngân / Kế toán / Thợ Spa)
    ├── SƠ ĐỒ LOGIC NGHIỆP VỤ (Vector Flowchart SVG thể hiện các bước & luân chuyển dữ liệu)
    ├── QUY TRÌNH THAO TÁC CHUẨN (SOP 3-4 bước, thẻ số 1-2-3-4, phím tắt quầy)
    ├── KHUNG MINH HỌA GIAO DIỆN (Mockup UI trực quan các nút bấm & modal quầy)
    └── XỬ LÝ TÌNH HUỐNG & CẢNH BÁO SAI SÓT (Tips & Troubleshooting quầy)
```

---

## 3. Nội Dung Chi Tiết 7 Phân Hệ Nghiệp Vụ

### Phân Hệ 1: Bán Hàng POS & Quản Lý Ca Làm Việc (`guide-pos`)
- **Sơ đồ SVG:** `Mở ca sáng (Đếm két)` ➔ `Quét mã / Chọn món (F1-F9)` ➔ `Áp giảm giá / Tích điểm` ➔ `Thanh toán VietQR / Tiền mặt` ➔ `In Bill K80` ➔ `Đóng ca tối (Z-Report)`.
- **Nghiệp vụ cốt lõi:**
  - Cách thao tác 100% bằng bàn phím (F1 tìm hàng, F2 khách hàng, F4 thanh toán nhanh, Esc hủy).
  - Phân định dòng tiền két tiền mặt vs tài khoản chuyển khoản.
  - Quy tắc đóng ca và đối soát két thực tế vs lý thuyết (chênh lệch thừa/thiếu).

### Phân Hệ 2: Tiếp Nhận & Dịch Vụ Spa Grooming (`guide-spa`)
- **Sơ đồ SVG:** `Nhận bé & Cân ký` ➔ `Chọn gói theo cân nặng (Pet Nha Trang)` ➔ `In Phiếu Nhận K80` ➔ `Gán kíp thợ (1 cắt + 2 tắm)` ➔ `Đổi gói minh bạch (gạch ngang giá cũ)` ➔ `Gọi đón 1 chạm` ➔ `Thanh toán cấn trừ ví Spa`.
- **Nghiệp vụ cốt lõi:**
  - Quy tắc xử lý khi bé bị ve/viêm da/rối lông: click đổi gói, chọn lý do, hệ thống tự lưu vết và in lên bill K80.
  - Thao tác gán thợ hàng loạt qua thanh công cụ nổi `Floating Bulk Toolbar` (0ms).
  - Cơ chế cấn trừ sạch ví Spa (Lựa chọn A: ưu tiên trừ hết số dư ví, thiếu thu ngoài tiền mặt).

### Phân Hệ 3: Khách Sạn Thú Cưng Pet Hotel (`guide-hotel`)
- **Sơ đồ SVG:** `Khách gửi thú cưng` ➔ `Check-in theo lô (nhiều bé vào nhiều phòng)` ➔ `Thu cọc & In Phiếu K80 tiếp nhận` ➔ `Theo dõi lưu trú (Lưới / Bảng / Gantt)` ➔ `Check-out trả phòng & Đối soát cọc`.
- **Nghiệp vụ cốt lõi:**
  - Phân loại buồng phòng: Khu Mèo gỗ (C01-C08), Khu Chó inox (D01-D06), Khu VIP máy lạnh (V01-V02).
  - Tiếp nhận nhanh một chủ gửi nhiều bé bằng modal tìm kiếm khách hàng thông minh.
  - Tự động chuyển phiếu đã checkout sang Sub-tab Lịch sử lưu trú trong Hóa đơn.

### Phân Hệ 4: Nạp Gói Ví Trả Trước & Cấn Trừ Tiền (`guide-wallet`)
- **Sơ đồ SVG:** `Tư vấn gói nạp (VD: Mua 10 tặng 2)` ➔ `Lập phiếu nạp ví (Ghi nhận tiền vào ca)` ➔ `In phiếu K80 ngầm` ➔ `Sử dụng dịch vụ Spa` ➔ `Khấu trừ tự động` ➔ `Hoàn tiền ví nếu hủy đơn`.
- **Nghiệp vụ cốt lõi:**
  - Phân tách dòng tiền tuyệt đối: Tiền nạp ví chỉ được trừ dịch vụ Spa, không cấn trừ hàng hóa bán lẻ để tránh lạm phát doanh thu quầy.
  - Bảo mật danh bạ: Hover chuột để xem đầy đủ SĐT, click để sao chép.

### Phân Hệ 5: Sổ Quỹ Thu Chi & Dòng Tiền Công Nợ (`guide-cashbook`)
- **Sơ đồ SVG:** `Giao dịch POS / Nhập hàng` ➔ `Tự động sinh phiếu Thu/Chi liên thông` ➔ `Sổ Quỹ Két & Ngân Hàng` ➔ `Drawer trượt kiểm tra nguồn gốc hóa đơn gốc`.
- **Nghiệp vụ cốt lõi:**
  - Quy tắc lập phiếu thu/chi ngoài quầy bán hàng (tiền điện, nước, lương, sửa chữa).
  - Đối soát công nợ nhà cung cấp và nợ khách hàng mua sỉ.

### Phân Hệ 6: Quản Lý Kho, Đơn PO & Gia Công OEM (`guide-inventory`)
- **Sơ đồ SVG:** `Định mức BOM sản phẩm` ➔ `Lập lệnh sản xuất OEM` ➔ `Tự động trừ tem/chai/nguyên liệu` ➔ `Nhập kho thành phẩm` ➔ `Lập PO mua nguyên liệu 2 bước`.
- **Nghiệp vụ cốt lõi:**
  - Tra cứu thẻ kho, xem biến động tồn và cảnh báo dưới mức tồn an toàn.
  - Nhập hàng từ nhà cung cấp theo quy trình: Đặt hàng ➔ Nhập kho thực tế ➔ Hạch toán công nợ.

### Phân Hệ 7: Kết Nối Mạng LAN & Cấu Hình Mẫu In (`guide-setup`)
- **Sơ đồ SVG:** `Máy chủ khởi động server.py` ➔ `Tự động cấp IP mạng LAN` ➔ `Quét QR trên điện thoại/máy con` ➔ `Mở quầy phụ không cần cài đặt`.
- **Nghiệp vụ cốt lõi:**
  - Hướng dẫn dùng script `find_server.ps1` để tự động bắt IP máy chủ.
  - Hướng dẫn căn chỉnh 12 mẫu in nhiệt K80 và in laser A4/A5, bật tắt chữ in đậm chống nhòe nét.

---

## 4. Kế Hoạch Kiểm Thử (Verification Plan)

1. **Kiểm tra tích hợp HTML (`tests/test_html_integrity.py`):**
   - Đảm bảo `tab-guide` là con trực tiếp của `#main-content-area`.
   - Cập nhật số lượng `tab-btn` trên `#sidebar-nav` từ 14 lên 15 nút.
   - Kiểm tra icon Lucide SVG và thuộc tính `data-tab="guide"`.
2. **Kiểm tra tương tác chuyển tab (`static/js/app.js`):**
   - Click tab "Hướng Dẫn" trên sidebar chuyển đổi mượt mà sang `#tab-guide`.
   - Chuyển đổi giữa 7 danh mục con trong tab Hướng Dẫn không giật trang, lưu trạng thái tab con đang xem.
3. **Kiểm tra tính toàn vẹn Checkpoint (`tests/test_checkpoint_integrity.py`):**
   - Đảm bảo toàn bộ test cases đều PASS 100%.
