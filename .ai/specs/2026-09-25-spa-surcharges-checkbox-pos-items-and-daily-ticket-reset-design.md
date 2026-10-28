# Thiết Kế: Cải Tiến Phụ Thu Checkbox, Bán Hàng POS Tại Cột Tiền, Read-Only Lịch Sử & Reset Số Phiếu Theo Ngày

**Ngày tạo:** 2026-09-25  
**Trạng thái:** Approved by user  
**Phạm vi:** Modal Tiếp Nhận Dịch Vụ Spa Thú Cưng (`#modal-create-service-ticket`) & Backend Tạo Phiếu (`routers/partners.py`)

---

## 1. Mục Tiêu & Yêu Cầu

1. **Số phiếu reset theo ngày (`ticket_number`):**
   - Mỗi ngày mới, số phiếu Spa bắt đầu lại từ `1` (thay vì random 5 - 10).
   - Phiếu tiếp theo trong cùng ngày: `MAX(ticket_number WHERE ticket_date = today) + 1`.
   - Áp dụng đồng bộ cho cả Tiếp nhận đơn lẻ (`POST /api/pet-services`) và Tiếp nhận hàng loạt (`POST /api/pet-services/batch`).

2. **Lịch sử Spa (Cột 3 - Read-Only):**
   - Chỉ dùng để xem lại thông tin lịch sử làm đẹp của bé (cân nặng, thợ, dịch vụ, phụ thu, ghi chú).
   - Xóa bỏ hoàn toàn 3 nút bấm thao tác `[🖨️ In Phiếu Nhận]`, `[🧾 In Hóa Đơn Trả]`, `[📋 Dùng Lại Form]` để giao diện gọn gàng, thuần tra cứu thông tin.

3. **Phụ thu chuyển thành Tên + Checkbox (Cột 2):**
   - Thay thế 5 ô nhập tiền tự do bằng danh sách Checkbox kèm tên và đơn giá:
     - `[ ] 🦷 Đánh răng (+30.000 đ)`
     - `[ ] ✂️ Cắt tạo kiểu nghệ thuật (+50.000 đ)`
     - `[ ] 🌀 Phụ thu gỡ rối lông (+40.000 đ)`
     - `[ ] 🚚 Đưa đón tận nơi (+50.000 đ)`
     - `[ ] 🎁 Tip thợ (+ ô nhập tiền)`
     - `[ ] 🏷️ Phụ thu khác (+ ô nhập tiền tùy biến)`
   - Đơn giá phụ thu được nạp từ bảng giá cấu hình dịch vụ (`allPetPricingData` nhóm Trị Liệu & Phụ Thu hoặc giá mặc định thiết lập).
   - Khi click checkbox, tự động cộng/trừ đơn giá vào bảng kê chi phí và tổng tiền.

4. **Thêm hàng hóa lấy theo bên POS và hiển thị ngay tại Cột Tiền (Cột 2):**
   - Di chuyển toàn bộ tính năng bán kèm từ Cột 1 sang Cột 2.
   - Ô tìm kiếm sản phẩm kho POS tại Cột 2: Tìm theo tên SP / mã vạch / SKU từ danh mục hàng hóa POS (`allProducts`).
   - Danh sách sản phẩm mua kèm xuất hiện trực tiếp ngay trên khối Tổng Tiền ở Cột 2:
     - Tên SP, Đơn giá, SL (+/-), Thành tiền, Nút xóa.
   - Khối tổng hợp thanh toán tại Cột 2 thể hiện rõ 3 thành phần:
     - 1. Tiền dịch vụ Spa chính & nhuộm: `xxx đ`
     - 2. Tiền các khoản phụ thu (từ checkbox): `+ xxx đ`
     - 3. Tiền sản phẩm mua kèm: `+ xxx đ`
     - **TỔNG CỘNG THANH TOÁN:** `xxx đ`
   - Sản phẩm bán kèm được đồng bộ vào `services_json` và in ra đầy đủ trên hóa đơn K80.

---

## 2. Thiết Kế Chi Tiết

### 2.1. Backend Reset Số Phiếu Theo Ngày (`routers/partners.py`)
- Khi tạo phiếu đơn hoặc hàng loạt:
  ```python
  cur.execute("SELECT MAX(ticket_number) as max_num FROM pet_service_tickets WHERE ticket_date = ?", (today_str,))
  row = cur.fetchone()
  base_number = (row["max_num"] + 1) if (row and row["max_num"] is not None) else 1
  ```
- Nếu ngày hôm nay chưa có phiếu nào -> `ticket_number = 1`.
- Nếu đã có phiếu -> tăng dần 2, 3, 4...

### 2.2. Giao Diện Cột 2 Mới (Tài Chính & Bán Kèm POS)
- **Khu vực 1: Checkbox Phụ Thu Cố Định:**
  ```html
  <div class="space-y-1 bg-white p-2.5 rounded-lg border border-purple-200">
      <div class="font-bold text-slate-800 text-xs">Các Khoản Phụ Thu (Tích chọn):</div>
      <label class="flex items-center justify-between text-xs cursor-pointer hover:bg-purple-50 p-1 rounded">
          <span class="flex items-center gap-1.5">
              <input type="checkbox" id="svc-cb-teeth" onchange="onSvcSurchargeCheckboxChanged()">
              <span>🦷 Đánh răng</span>
          </span>
          <span class="font-mono font-bold text-purple-700" id="svc-teeth-price-tag">30.000 đ</span>
      </label>
      <!-- Tương tự cho Cắt NT, Gỡ rối, Ship, Tip, Khác -->
  </div>
  ```
- **Khu vực 2: Bán Hàng POS Kèm Theo:**
  ```html
  <div class="space-y-1.5 bg-sky-50/70 p-2.5 rounded-lg border border-sky-200">
      <div class="flex justify-between items-center">
          <label class="font-bold text-sky-950 text-xs">🛒 Mua Sản Phẩm POS Kèm Theo:</label>
          <span id="svc-retail-total-badge" class="font-mono font-bold text-sky-800 text-xs">0 đ</span>
      </div>
      <div class="relative">
          <input type="text" id="svc-retail-search" ... placeholder="🔍 Gõ tên hoặc mã vạch sản phẩm POS...">
          <div id="svc-retail-dropdown" ...></div>
      </div>
      <div id="svc-retail-items-list" class="space-y-1 max-h-36 overflow-y-auto">...</div>
  </div>
  ```
- **Khu vực 3: Bảng Kê Tổng Tiền:**
  - Tiền dịch vụ chính: `... đ`
  - Tiền phụ thu: `... đ`
  - Tiền hàng hóa POS: `... đ`
  - Tổng thanh toán: `... đ`

### 2.3. Cột 3 (Lịch Sử Spa):
- Loại bỏ các nút `printPetServiceTicketDirectly` và `reuseCustomerSpaHistory`.
- Giữ lại phần hiển thị chi tiết (cân nặng, giống loài, gói dịch vụ, phụ thu, thợ làm, yêu cầu khách, ghi chú).

---

## 3. Kế Hoạch Kiểm Thử
1. `tests/test_spa_batch_intake.py`: Kiểm tra `ticket_number` bắt đầu từ 1 cho ngày mới.
2. `tests/test_html_integrity.py`: Kiểm tra tính toàn vẹn cấu trúc HTML sau khi chuyển cụm bán hàng sang Cột 2.
3. `tests/test_spa_render.js`: Kiểm tra JS render không có lỗi cú pháp hoặc crash.
