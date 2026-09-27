# PROJECT STATE — POS Offline (Spa Thú Cưng & Bán Lẻ Đa Kênh)

**Checkpoint:** 2026-09-26 — Rà soát & Thiết kế chi tiết Phân hệ Hóa Đơn & Dòng Tiền (BILL: Tách dòng tiền Ví Topup, Sub-tab Hóa đơn Spa, Gom Gói Topup về Bảng Giá)  
**Server:** `http://127.0.0.1:8999` — FastAPI + SQLite (`data/pos.db`)  
**Working dir:** `D:/Projects_Hermes/pos-offline-petcare2`  

---

## Phiên Hôm Nay ✅ (2026-09-26)

### 1. Vận Hành Tab Spa, Lọc Hôm Nay & KPI Header Mới
- **Lưu Vết Điều Chỉnh Gói Dịch Vụ Minh Bạch (Hiển Thị Bảng & Xuất Bill K80):**
  - **Schema DB & API:** Mở rộng 4 trường trong `pet_service_tickets`: `original_service_type`, `original_price`, `service_change_reason`, `service_changed_at`. Cập nhật migration tự động và endpoint `/api/pet-services/tickets/bulk-update`.
  - **Popup Sửa Dịch Vụ Thông Minh:** Khi chọn đổi sang gói khác với gói ban đầu, tự động bung box `⚠️ XÁC NHẬN ĐIỀU CHỈNH GÓI DỊCH VỤ`, tính toán chênh lệch giá (Tăng/Giảm bao nhiêu tiền) và cung cấp chips chọn nhanh lý do (Lông rối bết, Viêm da/ve rận, Bé khó làm, Khách đổi ý).
  - **Hiển Thị 2 Tầng Tại Cột 5 (DỊCH VỤ):** Gói ban đầu bị gạch ngang `line-through` kèm giá cũ $
ightarrow$ Mũi tên `👉` chỉ sang gói mới kèm badge nổi bật `🔄 Đổi DV: [Lý do]` để chủ tiệm lướt bảng nhận biết ngay.
  - **Xuất Lịch Sử Lên Hóa Đơn Nhiệt K80:** Cả phiếu thanh toán trả bé (`invoice`) và phiếu tiếp nhận (`intake`) đều in rõ ràng khối `⚠️ LỊCH SỬ ĐIỀU CHỈNH DỊCH VỤ` (Gói gốc $
ightarrow$ Gói mới $
ightarrow$ Lý do đổi $
ightarrow$ Thời gian) giúp khách và kế toán đối soát minh bạch 100%.
- **Popup Bảng Phân Công & Sửa Phiếu Hàng Loạt Trực Tiếp (`#modal-spa-bulk-edit-compact`):**
  - **Bảo mật SĐT (Hover to Reveal):** Số điện thoại mặc định được che giấu các số ở giữa dạng `🔒 0988 ••• 456` chống bị chụp trộm danh bạ. Khi rê chuột (`hover`) vào thẻ số thì bung số thật `0988 123 456` tức thì mà không cần click chuột. Bấm vào thẻ thì tự động sao chép SĐT vào clipboard.
  - **Hỗ trợ kíp 1 Thợ Cắt + 2 Thợ Tắm:** Bổ sung đầy đủ cột `🛁 Thợ Tắm 2 (Phụ)` bên cạnh `✂️ Thợ Cắt` và `🛁 Thợ Tắm 1`. Thanh header áp dụng hàng loạt cũng hỗ trợ gán nhanh cả 3 vị trí thợ này.
  - **Cơ chế chọn trực tiếp trong bảng:** Mỗi dòng phiếu hiển thị trực tiếp 4 dropdown `Thợ Cắt`, `Thợ Tắm 1`, `Thợ Tắm 2`, `Trạng Thái`. Người dùng có thể click đổi trực tiếp từng phiếu ngay trong bảng.
  - **Lưu 1 lần an toàn:** Các dòng thay đổi đổi màu nền vàng nhạt `bg-amber-50`, bấm `💾 Lưu Thay Đổi` để gửi batch request lên server (`/api/pet-services/tickets/bulk-update`).
  - **Unit tests:** Bổ sung kiểm thử Test 14 & 15. Node.js VM: PASS 16/16 (100%), Pytest: PASS 2/2 (100%).
- **Gán Thợ Cắt Hàng Loạt 1 Click Trên Floating Toolbar:**
  - Tích hợp trực tiếp dropdown `✂️ Thợ cắt` vào thanh công cụ nổi (Floating Bulk Toolbar).
  - Thao tác 1 click: Chọn các vé cần gán $
ightarrow$ Chọn tên thợ cắt $
ightarrow$ Tự động cập nhật tức thì (Optimistic 0ms) và đồng bộ ngầm qua API `/api/pet-services/tickets/bulk-update`.
- **Badge Số Điện Thoại To Rõ Dễ Nhìn Tại Quầy (`formatPhoneBadge`):**
  - Chuyển toàn bộ hiển thị SĐT khách hàng sang dạng badge nổi bật: `font-mono text-sm font-black text-purple-950 bg-purple-100/90 border border-purple-200 px-2 py-0.5 rounded-md`.
  - Tự động tách khoảng trắng dễ đọc (`0988 101 010`), kèm icon `📞` và tính năng click sao chép / gọi điện tức thì.
- **Lọc Mặc Định Phiếu Hôm Nay (`petServiceFilterDate = 'today'`):**
  - Mặc định chỉ hiển thị danh sách phiếu trong ngày, giúp thu ngân và thợ tập trung vào ca làm việc hiện tại, giảm tải render DOM.
  - Bộ nút điều khiển trực quan: `[📅 Hôm Nay]` (mặc định), `[Tất Cả]`, kèm ô chọn ngày tùy biến `input type="date"`.
- **Bổ Sung 2 Chỉ Số KPI Quan Trọng Trên Header Spa:**
  - `Chưa Gọi Đón` (`uncalled`): Vé đã làm xong (`status = 'completed'`) nhưng chưa gọi đón (`call_status = 'Chưa gọi'`).
  - `Chưa Về` (`not_checked_out`): Vé còn tại cơ sở trong ngày (`status != 'checked_out'`).
  - Hỗ trợ click trực tiếp vào thẻ KPI để lọc nhanh danh sách tương ứng.
- **Gom 5 Nút Lọc Trạng Thái Về 1 Dropdown:**
  - Thu gọn các nút bấm ngang thành dropdown `Trạng thái: [⚡ Tất Cả / ⏳ Chờ / 🔄 Đang Làm / ✅ Xong / 🏠 Đã Về]`.
- **Cập Nhật Tức Thì Không Giật Trang (Optimistic Local Update):**
  - Đổi trạng thái (`status`) và gọi điện (`call_status`) cập nhật DOM ngay lập tức (0ms).
  - Loại bỏ hoàn toàn skeleton loading giật màn hình khi thay đổi từng ô. Gửi API ngầm trong nền, tự động rollback nếu gặp lỗi mạng.
- **Khắc Phục In Trùng Dòng Cắt Nghệ Thuật & Dọn Khoảng Cách Cắt Giấy Nhiệt K80:**
  - Sửa lỗi regex so khớp `Cắt tạo kiểu nghệ thuật` bị lặp thêm 1 dòng `PT Cắt nghệ thuật` trên hóa đơn K80.
  - Bổ sung khoảng đệm chân trang `height: 18mm` ở cuối mẫu in K80 (cả phiếu đơn và in gộp hàng loạt), triệt tiêu lỗi dao cắt máy in nhiệt xén phạm vào lời cảm ơn và chữ ký.
- **Droplist Popup 3 Cột (Dịch Vụ, Lưu Ý & Yêu Cầu, Thợ Phụ Trách):**
  - Click trực tiếp vào từng ô trên bảng Spa hiển thị popup / popover sửa nhanh:
    - **Dịch vụ:** Chọn nhanh gói dịch vụ chính (nhóm theo danh mục từ bảng giá) + gói nhuộm lông.
    - **Lưu ý & Yêu cầu:** Cạo bàn (dropdown), Yêu cầu cắt tỉa (chips gợi ý nhanh: teddy, ngắn mát, chân bông, tỉa gọn + input), Phụ kiện kèm (chips: dây dắt, vòng cổ, chuồng, balo + input), Ghi chú thợ.
    - **Thợ phụ trách:** Dropdown chọn nhanh Thợ cắt tỉa (`✂️`), Thợ tắm sấy (`🛁`), Thợ tiếp nhận (`📥`) từ danh sách nhân viên spa.
  - Cập nhật Optimistic Local Update 0ms trên giao diện và đồng bộ ngầm lên backend qua `/api/pet-services/tickets/bulk-update`.
- **Phiếu Dịch Vụ Tách Tiền Minh Bạch (Dịch Vụ, Cọc, Tip):**
  - **Schema DB & API:** Bổ sung trường `deposit_amount REAL DEFAULT 0.0` trong bảng `pet_service_tickets`, cập nhật migration `database.py` và các Pydantic schema / endpoint trong `routers/partners.py`.
  - **Giao diện Modal Tiến Độ:** Thêm checkbox & ô nhập tiền cọc (`prog-deposit-amount`), tự động hạch toán tiền cọc khi mở phiếu.
  - **Hóa đơn K80 tách 3 phần:**
    - 1. Tiền Dịch Vụ Spa: tính từ đơn giá dịch vụ gốc và các phụ thu.
    - 2. Tiền Tip Thợ (thu hộ): hiển thị riêng nếu có, không tính vào doanh thu dịch vụ.
    - 3. Tiền Đã Đặt Cọc: trừ trực tiếp vào số tiền cần thu tại quầy.
    - TỔNG CỘNG THỰC THU: `Max(0, Dịch Vụ + Tip - Cọc)`.
  - **Phiếu In Riêng Biệt (Dedicated Slips):**
    - Phiếu Tip Thợ (`tip_slip`): In phiếu riêng đối soát cuối ca kèm chữ ký Thu Ngân & Thợ nhận tip (`staff_cutter` / `staff_worker_1`).
    - Biên Nhận Đặt Cọc (`deposit_slip`): In phiếu khi tiếp nhận bé kèm chữ ký Thu Ngân & Khách gửi cọc.
    - Phiếu Tiếp Nhận (`intake`): Hiển thị dòng ĐÃ ĐẶT CỌC TRƯỚC và CÒN LẠI KHI NHẬN BÉ.
  - **Bảng Spa Cột 1 & Cột 10:** Thêm nút in nhanh `[🎁]` (khi có tip) và `[💳]` (khi có cọc) tại Cột 1; Cột 10 hiển thị dòng chi tiết phụ thu `+tip` / `-cọc` và tổng thực thu `👉 ... đ`.
- **Thao Tác Hàng Loạt (Bulk Actions Toolbar & Checkboxes) Thay Thế Sửa Bảng Tính Inline:**
  - Cột 1 trang bị checkbox `spa-select-all-tickets` và checkbox trên từng dòng (`spa-row-select`).
  - Thanh floating toolbar nổi bật tự động xuất hiện ở mép dưới khi có phiếu được tick:
    - Huy hiệu đếm số lượng vé đã chọn.
    - Đổi trạng thái hàng loạt (`status`): Chờ làm / Đang làm / Đã xong / Đã về.
    - Đổi trạng thái gọi điện hàng loạt (`call_status`): Chưa gọi / Đã gọi đón / Không nghe máy.
    - Gán thợ hàng loạt qua `#modal-spa-bulk-assign-staff` (Thợ cắt, Thợ tắm, Thợ tiếp nhận).
    - In gộp K80 tất cả phiếu đã chọn chung 1 hóa đơn tổng.
- **Tái Cấu Trúc Toàn Bộ `PROJECT_MAP.html` Sang Tailwind UI (Chỉ Giữ Bảng Tiến Độ):**
  - Xóa bỏ toàn bộ các tab đồ thị và thống kê phức tạp cũ (Lane A, Bundling B, Sankey C, Matrix D, Arc E, Tree F).
  - Áp dụng 100% phong cách thiết kế **Tailwind UI** hiện đại:
    - Header ứng dụng chuyên nghiệp kèm trạng thái hệ thống và logo gradient.
    - Lưới 4 Thẻ Thống Kê (Stats Grid): Tổng nhiệm vụ, Đã xong (% kèm progress bar động), Chờ triển khai, Tình trạng kiểm thử hệ thống.
    - Thanh điều khiển lọc: Lọc theo phân hệ (🐾 Spa, 🧾 Hóa Đơn, 🏨 Hệ Thống, 🎨 Giao Diện), Lọc theo trạng thái, Ô tìm kiếm realtime.
- **Phương Án C: Drawer Trượt Phải Đối Soát Nguồn Gốc Thu/Chi Sổ Quỹ (Chỉ Đọc):**
  - Khi click vào bất kỳ dòng nào hoặc badge `🧾 HD...` / `🐾 DV...` trên bảng Sổ Quỹ:
    - Mở Drawer trượt mềm mại từ mép phải (`#drawer-cashbook-origin`) thay vì modal che khuất màn hình hoặc popup sửa.
    - Giữ nguyên bảng Sổ Quỹ để người dùng có thể duyệt liên tục từng phiếu.
    - Hiển thị đầy đủ nguồn gốc giao dịch dạng **Read-Only**:
      - Bán lẻ POS: Bảng kê sản phẩm, đơn giá, chiết khấu, khách thực trả.
      - Dịch vụ Spa: Bảng kê dịch vụ `[SPA]` và sản phẩm bán kèm `[SP]`, thợ cắt/tắm/tiếp nhận, trừ ví Spa, cọc, tip và thực thu TM/CK.
      - Nạp ví: Số tiền nộp vào quỹ và số dư tích lũy cộng ví.
      - Thu/chi nội bộ: Diễn giải chi phí vận hành.
    - Nút `🖨️ In Phiếu Thu/Chi (K80)` và đóng bằng nút bấm hoặc phím `Esc`. Khóa hoàn toàn mọi hành vi sửa/thanh toán lại.
- **Hệ Thống Thông Báo & Modal Alert/Toast Đồng Bộ Giao Diện:**
  - Thay thế 100% hộp thoại `alert()` xám mặc định của trình duyệt (`127.0.0.1:8999`) bằng Modal Tailwind CSS hiện đại:
    - Backdrop làm mờ (`backdrop-blur-xs`), bo góc lớn (`rounded-2xl`), đổ bóng chiều sâu (`shadow-2xl`).
    - Biểu tượng nhận diện trực quan phân loại tự động: Lỗi/Chú ý (⚠️ đỏ/cam), Thành công (✅ xanh lá), Thông tin (ℹ️ xanh tím).
    - Hỗ trợ phím tắt `Enter` / `Escape` hoặc bấm ra ngoài để đóng nhanh.
  - Tích hợp `showToast(msg, type)` nổi ở góc trên bên phải màn hình với hiệu ứng trượt mượt mà.
- **Chế Độ Xem Lại (Read-Only) Khi Bấm Phiếu Sổ Quỹ Thu - Chi:**
  - **Khắc phục lỗi mở form chỉnh sửa:** Khi nhân viên/kế toán bấm vào phiếu thu/chi trong Sổ Quỹ, hệ thống chuyển sang 100% chế độ **Chỉ Đọc (Read-Only)** để đối soát, tuyệt đối không mở form chỉnh sửa dữ liệu làm lệch quỹ.
  - **Modal Chi Tiết Phiếu Thu/Chi (`#modal-cashbook-view`):** Hiển thị số tiền giao dịch (+/-), hạng mục, tài khoản/két tiền, người nộp/nhận, thời gian và ghi chú rõ ràng. Cho phép in phiếu K80 ngay tại chỗ.
  - **Modal Chi Tiết Phiếu Dịch Vụ Spa (`#modal-pet-service-view`):** Xem lại toàn bộ thông tin phiếu Spa (thông tin bé cưng, bảng kê dịch vụ & hàng hóa bán kèm, thợ phụ trách, chi tiết trừ ví/cọc/tip và tiền thực thu) mà không có bất kỳ ô input hay nút sửa nào.
  - **Xem Hóa Đơn Bán Lẻ POS (`modal-order-view`):** Tự động ẩn các nút `[✏️ Sửa Hóa Đơn]` và `[🗑️ Xóa Hóa Đơn]` khi mở từ Sổ Quỹ đối soát.
    - Bảng dữ liệu Tailwind UI Data Table: Checkbox tick trực tiếp (tự động gạch ngang khi hoàn thành, lưu LocalStorage), Badge màu riêng từng phân hệ, Ghi chú kỹ thuật.
    - Modal Thêm Task Mới và nút Xuất Markdown (.md) tải về máy người dùng.

---

### 7. Tối Ưu Cuộn Bảng Nhập Hàng Loạt & Chuẩn Hóa In Ấn Nhiệt Toàn Diện
- **Khắc Phục Cuộn Trang Modal Nhập Hàng Loạt (Batch Sheets Mode):**
  - **Nguyên nhân:** Khung chứa bảng thiếu `min-h-0` trong CSS flexbox và div con chỉ có `overflow-x-auto` mà không có `overflow-y-auto` kèm giới hạn chiều cao, dẫn đến việc khi có từ 4 đến 10 bé thì bảng bị tràn ra ngoài và bị cắt mất các dòng bên dưới, không thể cuộn xuống xem được.
  - **Giải pháp:**
    - Cấu hình `min-h-0 flex-1 overflow-hidden` cho khung flex cha.
    - Đặt `overflow-x-auto overflow-y-auto flex-1 min-h-0 max-h-[52vh] sm:max-h-[56vh]` cho khung bao quanh bảng.
    - Cố định tiêu đề bảng `thead` với `sticky top-0 z-20 bg-slate-100 shadow-sm` giúp nhân viên cuộn mượt mà từ bé 1 đến bé 10 (hoặc nhiều hơn) mà vẫn nhìn thấy rõ tiêu đề cột.
- **Tối Ưu In Ấn Nhiệt Toàn Hệ Thống (K80 / K57):**
  - Chuyển toàn bộ màu xám, xanh nhạt thành màu đen tuyền `#000000 !important` chống mờ nét khi in nhiệt.
  - In đậm `font-weight: 800 / 900` cho tất cả thông tin quan trọng: Số phiếu `#...`, Tên shop, Tên khách, Tên bé, Cân nặng, Cạo bàn, Dịch vụ, Tổng cộng thanh toán và 2 ô chữ ký xác nhận.
- **In Hàng Loạt Phiếu Spa (1 Phiếu = 1 Trang, Bấm In 1 Lần):**
  - Khắc phục lỗi in đè iframe làm mất phiếu bé thứ 2 trở đi.
  - Gom toàn bộ các phiếu trong đợt tiếp nhận vào một tài liệu in duy nhất.
  - Mỗi phiếu là 1 trang in riêng biệt nhờ CSS `@media print { .thermal-ticket-page { page-break-after: always; break-after: page; } }`, phiếu cuối cùng `break-after: auto`.
  - Chỉ gọi lệnh in đúng 1 lần duy nhất, máy in nhiệt in lần lượt từng phiếu của từng bé và cắt giấy sạch sẽ.
- **Seed Dữ Liệu Test Mẫu: Khách Hàng 10 Bé x 5 Lần Làm Spa:**
  - Tạo khách hàng VIP: **Bùi Thiên Phú (VIP 10 Bé)** - `0988101010` (Địa chỉ: Bến Tre).
  - Có 10 thú cưng trong hồ sơ và đã thực hiện 5 đợt Spa (50 phiếu tiếp nhận) với 10 gói dịch vụ, phụ thu và phân công thợ khác nhau.
  - Nâng giới hạn API `/api/pet-services/history/customer/{id}` lên `LIMIT 100` để hiển thị trọn vẹn toàn bộ lịch sử.
- **Bấm Xem Chi Tiết Lịch Sử Spa (Accordion) & Nút Tiện Ích:**
  - Click vào từng thẻ lịch sử trong Cột 3 để mở rộng chi tiết: Mã phiếu, đợt, cân nặng, cạo bàn, chi tiết 5 khoản phụ thu, thợ làm, giờ nhận/về, yêu cầu khách.
  - Bổ sung 3 nút thao tác: `[🖨️ In Phiếu Nhận]`, `[🧾 In Hóa Đơn Trả]`, `[📋 Dùng Lại Form]` (tự điền lại gói dịch vụ của bé).
- **Thêm Ô Bán Hàng Sản Phẩm Kèm Theo (Retail Upsell):**
  - Bổ sung ô tìm kiếm sản phẩm từ kho hàng (`allProducts`) ngay tại Cột 1 modal tiếp nhận Spa.
  - Hỗ trợ thêm sản phẩm, tăng giảm số lượng (+/-), tự động tính thành tiền và cộng vào Tổng tiền thanh toán.
  - Đồng bộ sản phẩm mua kèm vào phiếu in hóa đơn K80.

---

### 6. Khắc Phục & Tối Ưu Tự Động Hóa Chia Sẻ Online (`chia_se_online.bat`)
- **Nguyên nhân gốc rễ lỗi không mở được:**
  1. Tiến trình `cloudflared.exe` cũ bị treo chạy ngầm (zombie process PID 16248) chặn kết nối mới.
  2. Máy chủ POS (cổng 8999) chưa được bật từ trước, dẫn đến việc Cloudflare Tunnel trỏ vào cổng rỗng -> người ngoài truy cập bị lỗi `502 Bad Gateway`.
  3. File `.bat` cũ in ra hàng chục dòng log debug khiến link bị trôi mất, người dùng khó tìm link để copy.
- **Giải pháp xử lý:**
  - Viết script `scripts/share_online.py` và tối ưu `chia_se_online.bat`:
    - Tự động diệt sạch các tiến trình `cloudflared.exe` cũ đang chạy ngầm.
    - Tự động kiểm tra cổng 8999: Nếu POS chưa bật, tự động khởi động máy chủ POS trong cửa sổ riêng và đợi máy chủ sẵn sàng.
    - Khởi tạo Cloudflare Tunnel, tự động trích xuất link `https://*.trycloudflare.com`.
    - **Tự động copy link vào Clipboard (bộ nhớ tạm):** Chỉ cần sang Zalo/Facebook nhấn `Ctrl + V` là dán được ngay.
    - **Tự động mở trình duyệt:** Mở thẳng đường link online để kiểm tra ngay lập tức.
    - Giao diện console sạch sẽ, hiển thị rõ ràng duy nhất link truy cập và hướng dẫn.

### 5. Tối Ưu Cột Thao Tác Cột 1 & Đầy Đủ Thông Tin Nhập/Sửa Hàng Loạt
- **Di chuyển Cụm Nút Thao Tác Về Cột 1:**
  - Chuyển toàn bộ các nút `[✏️ Sửa]`, `[🖨️]`, `[🧾]`, `[🗑️]` vào ngay bên dưới Số thứ tự `#` và Mã hóa đơn ở Cột 1.
  - Bỏ hoàn toàn Cột 13 ở mép phải ngoài cùng bảng danh sách Spa, loại bỏ triệt để việc nhân viên phải cuộn ngang màn hình để tìm nút in/sửa.
- **Mở rộng Đầy Đủ Thông Tin Cho Nhập Hàng Loạt (Batch Intake Modal):**
  - Giống loài, Giới tính, Màu lông cho từng bé.
  - Tách bạch chi tiết từng khoản phụ thu: Đánh răng, Cắt tạo kiểu nghệ thuật, Phụ thu gỡ rối/thêm, Cước xe đưa đón, Tip thợ.
  - Lưu ý yêu cầu, Phụ kiện gửi lại (dây dắt, chuồng...), Thợ cắt và Checkbox gửi Khách sạn thú cưng (`send_to_hotel`).
  - Tự động cộng tổng tiền từng bé và toàn đợt tiếp nhận.
- **Mở rộng Đầy Đủ Thông Tin Cho Sửa Bảng Tính (Spreadsheet Inline Edit Mode):**
  - Sửa trực tiếp Cân nặng (kg) và Checkbox Hotel ngay tại Cột Thú cưng.
  - Sửa trực tiếp Yêu cầu, Phụ kiện gửi lại, Ghi chú thợ ngay tại Cột Yêu cầu.
  - Sửa trực tiếp Đội ngũ thợ: Thợ cắt, Thợ tắm, Thợ nhận.
  - Sửa trực tiếp Từng khoản phụ thu chi tiết (Răng, Cắt NT, Gỡ rối, Ship, Tip) với định dạng phân cách hàng nghìn, tự động nhảy lại cột Tổng Tiền.
  - Sửa trực tiếp Giờ nhận & Giờ hẹn trả ngay tại Cột Đưa đón.
- **Kiểm thử tự động:**
  - `tests/test_spa_render.js`: **PASS 9/9 tests**.
  - `PYTHONPATH=. uv run pytest`: **PASS 17/17 tests**.

### 4. Chế Độ Sửa Trực Tiếp Dạng Bảng Tính Cho Phiếu Spa (Spreadsheet Inline Edit Mode)
- **Giao diện & Nút điều khiển Toolbar:**
  - Nút `[📝 Sửa Bảng Tính]` trên thanh công cụ Spa Table View.
  - Khi bật: Các ô trên toàn bộ bảng chuyển thành ô nhập liệu inline (Input/Select):
    - **Trạng thái:** Dropdown chuyển nhanh `Chờ làm` / `Đang làm` / `Đã xong` / `Đã về` (tự động đổi màu badge).
    - **Thợ làm:** Ô nhập thợ cắt và thợ tắm/làm.
    - **Yêu cầu & Ghi chú:** Ô nhập text trực tiếp yêu cầu khách & ghi chú thợ.
    - **Phụ thu:** Ô nhập tiền tệ có dấu phân cách hàng nghìn (`50.000 đ`), tự động tính lại cột **Tổng Tiền** ngay lập tức.
    - **Thanh toán:** Dropdown đổi nhanh `Chưa TT` / `Đã TT`.
  - Dòng nào có chỉnh sửa tự động gắn viền vàng hổ phách (`.bg-amber-50/70 border-amber-400`).
  - Thanh Action bar nổi: `[💾 Lưu Thay Đổi (N)]` (màu xanh lá, có bộ đếm số phiếu đã sửa) và `[❌ Thoát]`.
- **Backend & Transaction an toàn:**
  - Endpoint `PUT /api/pet-services/tickets/bulk-update` nhận danh sách phiếu sửa và cập nhật tất cả trong 1 SQLite transaction an toàn.
  - Tự động ghi nhận `checkout_time` khi chuyển sang `completed`.
- **Kiểm thử tự động:**
  - `tests/test_spa_bulk_update.py`: Test backend API bulk update **PASS**.
  - `tests/test_spa_render.js`: Bổ sung Test 9 kiểm tra toggle spreadsheet mode và dirty state tracking **PASS 9/9**.
  - Toàn bộ suite pytest: **PASS 17/17**.

### 3. Modal Tiếp Nhận Spa 3 Cột Luôn Mở & Tiếp Nhận Hàng Loạt (Multi-pet Batch Intake)
- **Modal Tiếp Nhận Spa `#modal-create-service-ticket`:**
  - Thiết kế rộng toàn màn hình (`w-[96vw] max-w-7xl h-[92vh]`), bố cục 3 cột trực quan luôn mở song song:
    - **Cột 1 (Dịch Vụ & Thú Cưng):** Chọn bé, cân nặng (badge màu), cạo bàn, gói combo chính & dịch vụ nhuộm lông nạp động 100% theo DB, đồng bộ tên tức thì.
    - **Cột 2 (Phụ Thu Gom Tầng & Tài Chính):** Chuyển toàn bộ phụ thu (Đánh răng, Cắt tạo kiểu nghệ thuật, Phụ thu gỡ rối, Vận chuyển đưa đón, Tip) từ popup sửa sang tiếp nhận ban đầu. Tất cả các ô tiền tệ tự động có dấu phân tách hàng nghìn (`150.000 đ`).
    - **Cột 3 (Lịch Sử Spa Theo Khách Hàng):** Tự động tải lịch sử làm đẹp của khách hàng khi chọn khách; dropdown lọc theo từng bé hoặc xem toàn bộ thú cưng của khách; hiển thị ngày làm, thợ cắt, gói dịch vụ, giá tiền và yêu cầu cũ.
- **Danh Sách Đỏ / Cờ Đỏ Khách Hàng Cần Lưu Ý:**
  - Bổ sung `is_flagged` và `warning_note` trong DB `contacts` và API `PUT /api/contacts/{id}/warning`.
  - Banner đỏ rực rỡ hiển thị ngay đầu phiếu tiếp nhận khi chọn khách có lưu ý/danh sách đen, kèm nút `[✏️ Sửa Lưu Ý]` cập nhật nhanh.
  - Dropdown tìm kiếm khách hàng hiển thị huy hiệu `[Lưu ý]` đỏ nổi bật.
- **Tiếp Nhận Nhiều Bé Dạng Bảng Tính Google Sheets (Batch Mode):**
  - Chuyển đổi mượt mà giữa tab `[🐾 1 Bé Đơn Lẻ]` và `[⚡ Nhập Hàng Loạt (Sheets)]`.
  - Bảng lưới cho phép nhập liên tục nhiều dòng bằng phím Tab: Chọn bé / Bé mới, Cân nặng, Cạo bàn, Gói chính, Nhuộm, Phụ thu, Thành tiền tự tính, Yêu cầu.
  - API `POST /api/pet-services/batch` lưu toàn bộ vé trong 1 transaction, sinh mã `batch_code` gộp đợt, hỗ trợ in K80 liên tục.
- **Bộ Kiểm Thử Hoàn Hảo:**
  - `tests/test_spa_batch_intake.py`: Kiểm thử API batch và warning note **PASS**.
  - `tests/test_spa_render.js`: Bổ sung Test 8 kiểm thử giao diện 3 cột, format tiền tệ và chế độ batch **PASS 8/8**.
  - Toàn bộ suite pytest: **PASS 16/16**.

### 2. Nạp Động 100% Gói Dịch Vụ Spa Theo Phân Loại (`<optgroup>`)
- Dọn dẹp toàn bộ option gắn cứng tĩnh trong `#svc-primary-package` và `#svc-dye-package`.
- Hàm `populateServicePackageDropdowns()` tự động quét DB bảng giá, nhóm `<optgroup>` theo danh mục (`category`), tự động cập nhật khi đổi tên dịch vụ.

### 1. Hoàn Thiện Giao Diện Quản Lý Khuyến Mãi (Promotions UI)
- **Giao diện danh sách chương trình (`#pl-subtab-promotions`):**
  - Thêm nút `+ Thêm Chương Trình` mở modal tạo nhanh.
  - Bảng 8 cột chuẩn hóa: `ID | Mã KM | Tên Chương Trình | Bắt Đầu | Kết Thúc | Số SP Áp Dụng | Trạng Thái | Thao Tác`.
  - Bộ nút thao tác trực quan trên từng dòng: `[⚙️ Quản Lý SP]`, `[✏️ Sửa]`, `[Bật/Tắt]`, `[🗑️ Xóa]`.
- **Modal Tạo / Sửa Chương Trình Khuyến Mãi (`#modal-promotion`):**
  - Form nhập liệu: Mã khuyến mãi (tự sinh mã chuẩn `KM-...` nếu để trống), Tên chương trình (*), Ngày bắt đầu, Ngày kết thúc, Trạng thái kích hoạt.
  - Xử lý đồng bộ qua API `POST /api/promotions` và `PUT /api/promotions/{id}`.
- **Modal Quản Lý Sản Phẩm Trong Khuyến Mãi (`#modal-promotion-items`):**
  - **Thêm lẻ từng sản phẩm:** Chọn sản phẩm từ danh mục, chọn loại giảm (`%` hoặc `tiền mặt đ`), nhập mức giảm.
  - **Thêm hàng loạt theo nhóm hàng:** Chọn nhóm hàng (Thức ăn, Vệ sinh...), chọn loại giảm và mức giảm $
ightarrow$ Tự động gán cho toàn bộ sản phẩm trong nhóm qua API `POST /api/promotions/{id}/items/bulk-by-category`.
  - **Bảng đối soát trực quan:** Hiển thị STT, Mã SP, Tên SP, Giá niêm yết, Mức giảm, Giá sau KM tự động tính, Nút xóa từng món.
- **Bộ test kiểm thử tự động:**
  - File mới `tests/test_promotion_ui.py`: Kiểm tra toàn vẹn DOM, các trường input, modal và 13 hàm JavaScript.
  - Toàn bộ test suites liên quan: **PASS 9/9**. Cú pháp JS: **PASS**.

---

## Việc Còn Dang Dở Đã Thống Nhất Thiết Kế 📌

### Khuyến Mãi & Bảng Giá Cho Cả Dịch Vụ Spa (Pet Services)
- **Quyết định kiến trúc:**
  - **Tách biệt dữ liệu:** Giữ Dịch Vụ Spa ở bảng riêng `pet_service_pricing` (79 mức giá theo cân nặng), KHÔNG ép vào bảng `products` để tránh làm bẩn danh mục bán lẻ.
  - **Quản lý tập trung:** Toàn bộ chính sách giá & khuyến mãi nằm tại một nơi duy nhất: **Tab Khuyến Mãi & Bảng Giá (`tab-price-lists`)**.
  - **Hình thức áp dụng cho Spa:** Cấu hình theo **Tên Dịch Vụ** (VD: *CB Tắm (1+2+3)*, *Nhuộm...*) hoặc theo **Nhóm Dịch Vụ** (VD: *Dịch Vụ Lẻ Chó*, *Spa Mèo...*).
  - **Cơ chế tính giá Best Offer tự động:** Khi lập phiếu tiếp nhận Spa (`pet_service_tickets`) hoặc tính tiền vé dịch vụ, hệ thống dựa theo cân nặng thú cưng lấy giá gốc từ `pet_service_pricing`, sau đó tự áp dụng mức giảm tốt nhất: $\min(P_{niêmyết}, P_{hạng}, P_{km})$.

---

## Phiên Này ✅ (2026-09-24)

### 1. Phân Loại Nhóm Hàng Hóa (Product Categories)
- **Cơ sở dữ liệu & Model:**
  - Bảng `products`: Bổ sung cột `category TEXT DEFAULT 'Khác'`. Auto-migration trong `database.py`.
  - Schema Pydantic: `ProductCreate` & `ProductUpdate` hỗ trợ trường `category`.
  - Endpoint `GET /api/products/categories`: Danh sách nhóm hàng duy nhất dùng cho dropdowns / datalist.
  - Endpoint `GET /api/products?category=...`: Lọc sản phẩm theo nhóm.
  - Hỗ trợ nhập/xuất Excel: Cột "Nhóm hàng" tự động mapping khi import hoặc export.
  - Bảng Tồn kho tổng hợp (`GET /api/inventory/unified`): Trả về trường `category` cho cả sản phẩm và nguyên liệu.

### 2. Giảm Nhanh Theo Nhóm Vào Bảng Giá & Ma Trận Giá
- **Áp dụng chiết khấu theo nhóm vào Bảng giá:**
  - `POST /api/price-lists/{id}/bulk-discount`: Cho phép nhận `category` để chỉ giảm % cho nhóm sản phẩm được chọn (thay vì toàn bộ shop).
  - Ma trận giá `GET /api/price-lists/{id}/matrix?category=...`: Hỗ trợ lọc theo nhóm hàng và hiển thị tag nhóm trực tiếp trên từng dòng sản phẩm.
- **Áp dụng khuyến mãi hàng loạt theo nhóm:**
  - `POST /api/promotions/{id}/items/bulk-by-category`: Tự động thêm toàn bộ sản phẩm thuộc 1 nhóm vào chương trình khuyến mãi với mức giảm định sẵn (% hoặc số tiền).

### 3. Giao Diện (UI / UX Hiện Đại & Quản Lý Nhóm Tái Sử Dụng Chuẩn KiotViet)
- **Bảng DB `product_categories` & Router `routers/categories.py`:**
  - Bảng riêng quản lý nhóm hàng hóa 1 cấp (`id, name UNIQUE, description, sort_order`).
  - Hỗ trợ đổi tên nhóm: tự động đồng bộ tên mới sang toàn bộ sản phẩm thuộc nhóm.
  - Hỗ trợ xóa nhóm: bảo vệ nhóm mặc định `Khác`, tự động chuyển sản phẩm của nhóm bị xóa về `Khác`.
- **Modal Thêm / Sửa Hàng Hóa:**
  - Dropdown `<select id="modal-prod-category">` nạp động danh mục.
  - Nút `[+]` cạnh dropdown mở popup mini `#modal-quick-add-category` thêm nhanh nhóm mới và tự động gán ngay vào hàng hóa.
- **Thanh lọc & Tối ưu Giao diện:**
  - Tối giản hàng lọc: Bỏ thanh pill ngang tránh trùng lặp; dùng dropdown `Nhóm hàng: [Tất cả nhóm v]` kết hợp nút icon `[⚙️]` kế bên để mở modal Quản lý nhóm khi cần.
- **Modal Quản Lý Nhóm Hàng Hóa (`#modal-category-manager`):**
  - Mở từ nút icon `[⚙️]` cạnh dropdown nhóm hàng.
  - Thêm mới nhóm, sửa trực tiếp tên nhóm (inline edit), xóa nhóm có xác nhận an toàn.
- **Tab Bảng Giá (Ma Trận Giá):**
  - Thanh công cụ "⚡ Giảm nhanh": Thêm dropdown chọn phạm vi (Tất cả nhóm hoặc Nhóm cụ thể) kèm ô nhập % giảm.
  - Bộ lọc Ma trận giá: Thêm dropdown lọc nhanh theo Nhóm hàng cạnh thanh tìm kiếm.
  - Bảng ma trận bổ sung cột "Nhóm Hàng".
- **Cơ sở dữ liệu & Phân cấp nhóm khách hàng:**
  - Bảng `contacts`: Thêm `points` (tích lũy trọn đời xét thăng hạng) và `spa_wallet_balance` (số dư ví nạp trả trước cho Spa).
  - Bảng `customer_segments`: Thêm `min_points`, `allow_points`, `price_list_id`. Phân định rõ nhóm Khách Lẻ (`allow_points=1` - được tích điểm) và Sỉ/Đại Lý (`allow_points=0` - dùng bảng giá sỉ, không tích điểm).
  - Bảng mới: `topup_packages`, `spa_wallet_transactions`, `promotions`, `promotion_items`. Cài đặt `points_exchange_rate = 1000` (1.000 đ = 1 điểm).
- **Backend APIs & Nguyên tắc Best Offer:**
  - `routers/promotions.py`: CRUD chương trình khuyến mãi và sản phẩm khuyến mãi.
  - Hàm `calculate_effective_price()` / `POST /api/pricing/calculate`: Áp dụng nguyên tắc Best Offer $P_{final} = \min(P_{niêmyết}, P_{hạng}, P_{km})$, không cộng dồn ưu đãi gây thất thoát.
  - `routers/topup.py`: CRUD gói nạp, endpoint nạp ví `POST /api/topup/recharge` (cộng tiền ví, ghi sổ quỹ ca làm việc, ghi lịch sử ví).
  - `routers/pos.py`: Khấu trừ ví Spa chỉ cho mặt hàng dịch vụ (`type == 'service'`), số dư còn lại và hàng hóa bán lẻ thanh toán bằng tiền mặt/CK. Tự động cộng điểm và thăng hạng thành viên khi chạm ngưỡng `min_points`.
- **Giao diện POS & Cài Đặt:**
  - POS: Hiển thị điểm `🏆 {points}` và ví `💆 {balance} đ` khi chọn khách, nút `[⚡ Nạp Ví Spa]` mở modal nạp gói trực tiếp tại quầy.
  - Tự động gợi ý checkbox trừ ví Spa khi giỏ hàng có dịch vụ Spa, tự tính $U = \min(B, T_{spa})$ hiển thị rõ ràng cho thu ngân.
  - Cài Đặt: Tab quản lý Gói Topup Ví Spa, cấu hình mốc điểm thăng hạng và bật/tắt tích điểm theo phân nhóm khách hàng, subtab Khuyến Mãi trong Bảng Giá.

### 2. In Hóa Đơn K80 Chuẩn Bán Lẻ & Chống Đè Chữ
- **Bố cục 2 dòng:** Dòng 1 tràn 100% bề ngang cho tên món dài (`colspan="3"`), Dòng 2 chia 3 cột `SL | Đơn giá | Thành tiền`.
- **Ghi rõ số tiền giảm:** Đơn giá hiển thị `Giá bán` và `~~Giá gốc~~ (Giảm XX.XXX đ)`. Chân trang hóa đơn hiển thị tổng tiền tiết kiệm `{{tiet_kiem}}` / `{{giam_gia}}`, tự ẩn khi đơn không giảm giá.
- **Chống đè chữ 2 lớp (Dynamic DeltaY + DOM Auto-Shift):** Tự đo đạc DOM đáy bảng, đẩy chân trang xuống khoảng an toàn nếu bảng dài nhiều món.
- **Reset thứ tự tab:** Re-index tab hóa đơn liên tục `Hóa đơn 1`, `Hóa đơn 2`... dựa theo số lượng tab thực tế đang mở.

### 3. Theo Dõi & Quản Lý Ví Spa (POS & Hồ Sơ Khách Hàng)
- **Màn hình POS (Đối soát nhanh tại quầy):**
  - Thêm nút `[👁️ Lịch sử ví]` ngay cạnh số dư ví Spa của khách hàng trên thanh POS.
  - Modal `#modal-pos-wallet-history`: Bảng biến động số dư trực quan (+ Nạp gói màu xanh lá / - Chi tiêu hóa đơn màu đỏ), hiển thị số dư trước/sau và chi tiết mã hóa đơn liên kết.
- **Phân hệ Khách Hàng (Quản lý & Kế toán):**
  - Bổ sung cột **Ví Spa** trong bảng danh sách khách hàng (`#table-customers`).
  - Trong modal Chi Tiết Đối Tác (`#modal-contact-detail`): Thêm 2 thẻ hiển thị Điểm tích lũy & Số dư Ví Spa, đồng thời bổ sung bảng **"💆 Lịch Sử Biến Động Ví Spa"** đối soát toàn diện.
- **Backend API:** Cập nhật endpoint `GET /api/contacts/{id}` trả về đầy đủ `spa_wallet_balance`, `points`, và mảng `spa_wallet_history`.

---

## Kết Quả Kiểm Thử (Verification Suite) 🧪

1. `tests/test_product_category_and_bulk_pricing.py`: **PASS 1/1** (CRUD category, lọc danh mục, bulk discount bảng giá theo nhóm, thêm khuyến mãi theo nhóm).
2. `tests/test_spa_wallet_tracking.py`: **PASS 2/2** (API detail contact trả về lịch sử ví, tích hợp DOM/JS POS & Hồ sơ khách).
2. `tests/test_loyalty_schema.py`: **PASS 6/6** (Schema, tables, columns, constraints, default seeds).
3. `tests/test_best_offer_pricing.py`: **PASS 4/4** (CRUD promotion, so sánh chiết khấu Best Offer, ưu tiên giá tùy biến).
4. `tests/test_points_and_tier_upgrade.py`: **PASS 1/1** (Tích điểm 1k=1đ, tự thăng hạng Bạc/Vàng, chặn tích điểm cho Sỉ/Đại lý).
5. `tests/test_spa_wallet_topup.py`: **PASS 2/2** (Nạp ví, trừ ví dịch vụ Spa, giữ nguyên tiền hàng hóa).
6. `tests/test_loyalty_frontend.py`: **PASS 2/2** (DOM modal topup, use-spa-wallet checkbox, logic Best Offer).
7. `tests/test_k80_discount.py`: **PASS 2/2** (Bố cục 2 dòng K80, ghi rõ số tiền giảm, reindex tabs).
8. `tests/test_html_integrity.py`: **PASS 3/3** (Toàn vẹn HTML/DOM).
9. Cú pháp JS: `node -c static/js/pos.js && node -c static/js/app.js` **PASS**.

---

## Kết Quả Kiểm Thử (Verification Suite) 🧪

1. `tests/test_k80_discount.py`: **PASS 2/2** (Kiểm tra API `original_price` và toàn bộ logic render frontend).
2. `tests/test_html_integrity.py`: **PASS 3/3** (Toàn vẹn DOM).
3. `tests/test_pet_pricing_import.py`: **PASS 6/6**.
4. `tests/test_shift_close.py`: **PASS**.
5. `node -c static/js/app.js && node -c static/js/pos.js && node -c static/js/shifts.js`: **PASS** (Cú pháp JS sạch).

---

## Files Đã Chỉnh Sửa / Tạo Mới

| File | Thay đổi |
|---|---|
| `routers/pos.py` | Query `GET /api/orders/{code}` bổ sung `p.sell_price AS original_price` |
| `static/js/pos.js` | Cột đơn giá 2 dòng (giá bán trên, giá gốc gạch ngang dưới), tự ẩn dòng giảm giá chân trang khi 0đ, truyền `original_price` cho hóa đơn tạm |
| `static/js/app.js` | Preset K80 bổ sung dòng `Giảm giá: -{{giam_gia}}`, demo trực quan trên Canvas Visual Builder |
| `docs/superpowers/specs/2026-09-24-k80-invoice-discount-display-design.md` | Tài liệu đặc tả thiết kế hiển thị giảm giá K80 |
| `docs/superpowers/plans/2026-09-24-k80-invoice-discount-display.md` | Kế hoạch triển khai kỹ thuật chi tiết |
| `tests/test_k80_discount.py` | Test suite kiểm thử tự động tính năng giảm giá K80 |
| `PROJECT_STATE.md` | Cập nhật checkpoint bàn giao |

---

## Phiên Trước ✅ (2026-09-23)

### 1. Ca Làm Việc, Đóng Mở Ca & Z-Report
- **Mở ca & Kết ca:**
  - Sidebar gom gọn thành 1 nút container `#shift-action-container`, tự động đảo trạng thái giữa `▶ Mở Ca` (xanh emerald) và `⏹ Kết Ca` (hổ phách) theo `currentShift`.
  - Tải trạng thái ca tức thì khi mở app hoặc F5 (`loadCurrentShift()` trong `auth.js`).
- **Thống kê két & Z-Report:**
  - Backend API `GET /api/shifts/current/summary` & `POST /api/shifts/{id}/close`: tính toán tiền mặt ban đầu, doanh số bán lẻ, chuyển khoản/thẻ, tiền chi sổ quỹ, tính két lý thuyết `expected_cash = start_cash + cash_sales - cash_expenses`.
  - In phiếu kết ca Z-Report chuẩn 80mm tái sử dụng `#print-modal`.
- **Popup đếm tiền mặt theo mệnh giá VNĐ:**
  - Modal `#modal-cash-counter` hỗ trợ 10 mệnh giá (500k -> 1k), nhập số tờ tự nhân thành tiền thời gian thực, phím Enter chuyển nhanh dòng tiếp theo.
  - Nút chuyển tiếp thông minh: `Điền vào Mở Ca` hoặc `Điền vào Kết Ca` tự động điền số tiền đếm vào ô input tương ứng.

### 2. Sửa Lỗi UI, Xếp Lớp Modal & In Lại Hóa Đơn
- **Phân cấp hiển thị (Z-Index Hierarchy):**
  - Modal cơ sở / ca làm việc: `z-50`
  - Bảng đếm tiền mặt: `z-[70]`
  - Modal in hóa đơn / Z-Report: `z-[80]`
  - Sửa dứt điểm lỗi đè khuất giữa bảng đếm tiền và modal ca, lỗi phiếu in bị chìm dưới modal kết ca.
- **Sửa triệt để lỗi không đóng được modal in:**
  - Bổ sung `style.display = 'none'` vào `closePrintModal()`, xóa sạch xung đột inline style.
  - Hỗ trợ click vùng tối bên ngoài (backdrop click) và phím `Escape` đóng modal tức thì.
- **Khắc phục lỗi in lại hóa đơn từ Lịch sử mua hàng:**
  - Sửa bug `printCurrentViewedOrder()`: lưu tạm biến `code` trước khi gọi `closeModalOrderView()` tránh bị null khi gọi `showPrintModal()`.
  - Thêm validation chặn rỗng và kiểm tra `res.ok` trong `pos.js`.

### 3. Tối Ưu Màn Hình POS & Cột Giá Đại Lý
- Phân bổ lại cấu trúc bảng giỏ hàng POS với độ rộng linh hoạt: `Xóa (36px)`, `STT (36px)`, `Mã hàng (80px)`, `Tên hàng hóa (1fr)`, `ĐVT (48px)`, `SL (96px)`, `Đơn giá (230px)`, `Thành tiền (110px)`.
- Đưa tag `🏷️ Giá Đại Lý` / bảng giá riêng lên cùng dòng ngang với đơn giá: `[Giá gốc] Giá bán [🏷️ Giá Đại Lý] ✏️` (không bị rớt dòng xuống dưới).

### 4. Bảng Giá Dịch Vụ Spa Theo Cân Nặng (Pet Nha Trang)
- **Import 79 mức giá thực tế** từ file `bang_gia_spa_pet_nha_trang.xlsx` vào `pet_service_pricing`, xóa sạch 22 dòng dữ liệu mẫu cũ.
- **5 Nhóm phân loại nghiệp vụ chuẩn:**
  1. `Gói Combo Chó` (24 mức giá, 8 mốc cân: 0-2kg, >2-6kg, >6-10kg, >10-20kg, >20-30kg, >30-40kg, >40-50kg, >=50kg).
  2. `Dịch Vụ Lẻ Chó` (40 mức giá, 8 mốc cân: Tắm massage, Vệ sinh tai, Cắt móng cạo bàn, Cạo lông, Cắt tạo kiểu).
  3. `Spa Mèo` (3 mức giá: Combo tắm vệ sinh mèo <2kg, 2-6kg, >6kg).
  4. `Nhuộm Lông` (4 mức giá: 1 Màu / Nhiều Màu theo vị trí).
  5. `Trị Liệu & Phụ Thu` (8 mức giá: Tắm trị liệu/nấm da 3 mốc cân, gỡ rối, tẩy lông, cắt tỉa đầu, đánh răng).
- **Đồng bộ hóa giao diện:**
  - Dropdown lọc danh mục bảng giá hỗ trợ đủ 5 nhóm mới.
  - Form tiếp nhận phiếu dịch vụ (`modal-create-service-ticket`) gom nhóm `optgroup` chuẩn và hàm `autoCalculateServicePrice()` tự động nhảy giá đúng dải cân nặng của thú cưng.

---

## Kết Quả Kiểm Thử (Verification Suite) 🧪

1. `tests/test_pet_pricing_import.py`: **PASS 6/6** (Đủ 79 bản ghi, 5 danh mục, giá Chó/Mèo/Nhuộm chuẩn, API `/api/pet-services/pricing` 200 OK).
2. `tests/test_shift_close.py`: **PASS** (Tóm tắt ca, tính két lý thuyết và chốt ca thành công).
3. `tests/test_html_integrity.py`: **PASS 3/3** (Toàn vẹn cấu trúc DOM và 12 tab con trực tiếp của main content area).
4. `node -c static/js/app.js && node -c static/js/pos.js && node -c static/js/shifts.js`: **PASS** (Cú pháp JS sạch).

---

## Files Đã Chỉnh Sửa / Tạo Mới (Cập nhật 2026-09-27)

| File | Thay đổi |
|---|---|
| `routers/pos.py` | Hoàn tiền ví `spa_wallet_balance` và ghi log `refund` khi xóa đơn; gỡ bỏ trừ ví spa khỏi POS bán lẻ |
| `routers/topup.py` | Trả về `package_name`, `pay_amount`, `receive_amount`, `payment_method` trong API nạp ví |
| `routers/cashbook.py` | SQL query dùng `COALESCE` liên kết Tên và SĐT khách hàng từ `contacts`, `orders`, `pet_service_tickets` |
| `routers/partners.py` | Hỗ trợ cấn trừ ví một phần (Lựa chọn A) cho đơn lẻ và hàng loạt; bổ sung `checked_out_today` vào KPI |
| `templates/index.html` | Cấu trúc Dải Lịch Ngang, bảng nhập hàng loạt phẳng cột phụ thu riêng, sub-tab hóa đơn Spa tại Tab Hóa Đơn, gỡ thẻ KPI thừa, logo & tên shop ở form đăng nhập |
| `static/js/app.js` | Nâng cấp `customConfirm` kiểu danger (icon đỏ, phím Enter/Esc); tự nạp hóa đơn Spa khi chuyển tab; đồng bộ logo/tên shop đăng nhập |
| `static/js/auth.js` | Tự động cập nhật logo và tên shop trên màn hình đăng nhập từ API cài đặt |
| `static/js/pos.js` | In phiếu thu K80 nạp ví ngầm không xem trước; gỡ bỏ trừ ví spa khỏi POS bán hàng |
| `static/js/modules/spa.js` | Dải lịch ngang 7 ngày; lọc trong ngày (chưa về + đã về); đồng bộ cuộc gọi thông minh; tự nhận diện ví Spa; chuyển hóa đơn spa sang tab Hóa Đơn |
| `static/js/modules/productions.js` | Hiển thị Tên + badge SĐT ở Sổ Quỹ và Drawer đối soát; tìm kiếm realtime theo SĐT |
| `tests/test_k80_discount.py` | Nạp kèm `productions.js` để test in hóa đơn chạy chuẩn |
| `tests/test_spa_wallet_split_payment.py` | Test suite kiểm thử cấn trừ ví một phần và ghi nhận Sổ Quỹ |
| `tests/test_spa_render.js` | Test suite kiểm thử render bảng Spa và hóa đơn Spa |
| `docs/superpowers/specs/2026-09-27-spa-date-strip-calendar-and-daily-view-design.md` | Tài liệu thiết kế Dải Lịch Ngang và bộ lọc ca trong ngày |
| `docs/superpowers/plans/2026-09-27-spa-date-strip-calendar.md` | Kế hoạch triển khai Dải Lịch Ngang Spa |
| `sketches/demo_spa_calendar_variants.html` | Bản demo 3 biến thể lịch Spa |
| `sketches/demo_batch_surcharges.html` | Bản demo 3 biến thể phụ thu nhập hàng loạt |

---

## Việc Tiếp Theo (Ưu Tiên: BẢNG GIÁ & GÓI NẠP - BILL-4)

- [x] **bill-1: Phân tách dòng tiền Topup vs Hàng hóa & An toàn số dư:** Hoàn tiền khi xóa đơn, in phiếu K80 nạp ví, bỏ trừ ví ở POS bán lẻ, thêm Tên/SĐT vào sổ quỹ.
- [x] **bill-2: Kích hoạt Sub-tab Lịch Sử Spa tại Tab Hóa Đơn (`tab-orders`):** Đã hoàn thành 12 cột, lọc ngày/trạng thái/thanh toán, mở lại vé.
- [ ] **bill-4: Di chuyển bảng quản lý Gói Topup vào Tab Bảng Giá (`tab-price-lists`):**
  - Bổ sung sub-tab `💳 Gói Nạp Ví Spa (Topup)` vào `#tab-price-lists`, hỗ trợ xem, thêm, sửa, bật/tắt gói nạp.
- [ ] **bill-5: Kiểm tra và chuẩn hóa mẫu in K80/A4 B2B trên các trình duyệt.**
- [ ] Tab UI quản lý nhân viên (Cài Đặt > Nhân Viên)
- [ ] Tab UI lịch sử ca + duyệt ca (cho role `accountant`)
- [ ] Báo cáo doanh thu và chênh lệch két theo ca trong tab Báo Cáo
- [ ] Bắt buộc đổi mật khẩu ở lần đầu đăng nhập
