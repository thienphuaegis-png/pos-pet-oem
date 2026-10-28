# Kế Hoạch Triển Khai: Chức Năng Đơn Nháp OEM & AI Tự Động Tạo Đơn Nháp 1-Chạm

**Ngày lập**: 2026-10-23  
**Mục tiêu**:
1. Đồng bộ chức năng Lưu Đơn Nháp (DRAFT) cho phân hệ Gia Công OEM giống như Nhập Hàng (PO).
2. Tích hợp AI Tự Động Đề Xuất & Tạo Đơn Nháp 1-Chạm (One-Click Auto Draft) cho mặt hàng chạm đáy tồn kho (tự nhận diện Hàng Nhập NCC vs Hàng Gia Công OEM).
3. Triển khai phân hệ "Phiếu Yêu Cầu Nhập Hàng" (Purchase Requisition) cho bộ phận cửa hàng/spa với cơ chế ẩn danh thông tin NCC và tự động nhắc nhở Thủ kho.

---

## I. Chi Tiết Các Hạng Mục Kỹ Thuật

### 1. Phân hệ OEM: Bổ sung Nút "Lưu Đơn Nháp (DRAFT)"
- **Backend (`routers/oem.py`)**:
  - Endpoint `POST /api/oem/orders`:
    - Khi lưu nháp (`is_draft = True` hoặc `deposit_amount == 0`), gán `status = 'DRAFT'`.
    - **Không xuất phiếu chi cọc** vào bảng `cashbook`, không trừ tiền quỹ.
    - Cho phép chỉnh sửa (`PUT /api/oem/orders/{id}`) và xóa (`DELETE /api/oem/orders/{id}`) khi đơn ở trạng thái DRAFT.
- **Frontend (`templates/index.html` & `static/js/modules/productions.js`)**:
  - Trên modal `#modal-create-oem`, bổ sung nút **`💾 Lưu Bản Nháp (DRAFT)`** cạnh nút `🚀 Lưu Đơn & Xuất Cọc Sổ Quỹ`.
  - Bảng danh sách đơn OEM hiển thị badge `Bản Nháp`, nhấp vào mở lại để sửa hoặc xóa.

---

### 2. Tác Nhân AI: Tạo Đơn Nháp 1-Chạm (Hàng Nhập & OEM)
- **Thuật toán phân loại mặt hàng**:
  - Hàng gia công OEM: Sản phẩm có trong `oem_order_items` hoặc có định lượng trong `bom_recipes`.
  - Hàng nhập NCC: Sản phẩm liên kết với `supplier_items` hoặc có lịch sử nhập trong `purchase_items`.
- **API `POST /api/ai/quick-create-draft`**:
  - Nhận `product_id` (hoặc `partner_id` nếu tạo cho cả nhóm).
  - Tự tính số lượng đề xuất: `suggested_qty = max(1.0, (min_stock * 2) - current_stock)`.
  - Nếu là Hàng Nhập: Sinh bản ghi `purchases` (`status = 'draft'`), trả về `{ type: 'purchase', code: code }`.
  - Nếu là Hàng OEM: Sinh bản ghi `oem_orders` (`status = 'DRAFT'`, `deposit_amount = 0`), trả về `{ type: 'oem', id: id, code: code }`.
- **Giao diện 1-chạm**:
  - Trên tab Tác Nhân AI & modal Hàng sắp hết: Bấm nút `⚡ Tạo Đơn Nháp` &rarr; Gọi API &rarr; Tự động bung ngay modal sửa đơn (`modal-purchase-order` hoặc `modal-create-oem`).
  - Người dùng kiểm tra số lượng, chỉnh sửa thêm bớt hoặc bấm `🗑️ Xóa Đơn Nháp` nếu chưa cần đặt.

---

### 3. Phân Hệ "Yêu Cầu Nhập Hàng" (Ẩn Danh Nhà Cung Cấp)
- **CSDL (`database.py`)**:
  - Tạo bảng `purchase_requests` và `purchase_request_items`.
- **Bảo mật danh tính NCC (Supplier Masking)**:
  - Khi bộ phận cửa hàng/spa xem danh mục để yêu cầu: Hàng hóa được gom theo nhóm nguồn cung `[NGUON-01]`, `[NGUON-02]`, **tuyệt đối không hiển thị tên thật, SĐT, hay giá vốn của NCC**.
- **Luồng nhắc nhở tự động**:
  - Khi gửi yêu cầu, hệ thống sinh 1 `staff_reminders` gán cho Thủ Kho (Phụng):
    - *"🔔 Yêu cầu nhập hàng mới từ [Tên nhân viên]: [Số lượng món] cần đặt"*
    - Có nút "1-Chạm Chuyển Thành Đơn Nhập NCC" để tự điền sang phiếu PO.

---

## II. Danh Sách File Cần Cập Nhật
1. `database.py`: Bảng `purchase_requests`, `purchase_request_items`.
2. `schemas.py`: Schema `PurchaseRequestCreate`, `PurchaseRequestOut`, `QuickDraftIn`.
3. `routers/oem.py`: Hỗ trợ cờ lưu nháp DRAFT không xuất cọc.
4. `routers/ai_assistant.py`: Endpoint `POST /api/ai/quick-create-draft`.
5. `routers/purchases.py`: Endpoint tiếp nhận chuyển đổi từ Purchase Request sang PO.
6. `static/js/modules/productions.js`: Hàm `submitCreateOEMDraft()`.
7. `static/js/modules/ai_agent.js`: Hàm `quickCreateDraftItem(productId)` và `quickCreateDraftGroup(partnerId)`.
8. `templates/index.html`: Giao diện nút Lưu Nháp OEM, bảng yêu cầu nhập hàng.

---

## III. Kế Hoạch Kiểm Thử
- `tests/test_oem_draft_mode.py`: Kiểm tra đơn OEM lưu nháp không trừ quỹ tiền mặt.
- `tests/test_ai_quick_create_draft.py`: Kiểm tra 1-chạm tạo đơn nháp PO và OEM.
- `tests/test_purchase_request_masking.py`: Kiểm tra bộ phận cửa hàng không thấy tên NCC.
