# Thiết Kế: Phân Hệ Quản Lý Khoản Cần Chi & Hoàn Ứng Nhân Viên (Dự Chi & Chi Hộ)

- **Ngày phê duyệt:** 2026-10-08
- **Tác giả:** Hermes Agent
- **Người phê duyệt:** Bùi Thiên Phú (Chủ quán)
- **Vị trí tích hợp:** Tab con trong màn "Sổ Quỹ Thu Chi" (Tab 1: Sổ Quỹ Thực Tế, Tab 2: Dự Chi & Hoàn Ứng Nhân Viên)

---

## 1. Mục Tiêu & Phạm Vi (Scope)

1. Quản lý các khoản tiền cần phải chi (dự chi hoạt động, tiền hàng sắp tới) hoặc các khoản thực tế nhân viên A, B, C đã tự bỏ tiền túi chi hộ cho quán nhưng chưa được hoàn lại tiền.
2. Hỗ trợ import/dán ảnh chuyển khoản (Ctrl + V hoặc chọn file), tích hợp AI OCR tự động trích xuất số tiền, nội dung giao dịch, thời gian và lưu ảnh chứng từ xem lại.
3. Tách biệt hoàn toàn với số dư Sổ Quỹ thực tế (không làm lệch dòng tiền thực tế khi chưa duyệt chi).
4. Quy trình 1 chạm: Khi chủ shop bấm "Duyệt & Hoàn tiền / Chi trả", chọn tài khoản quỹ xuất tiền -> Hệ thống tự động sinh Phiếu Chi (PC) bên Sổ Quỹ thực tế và cập nhật trạng thái đã hoàn tiền.

---

## 2. Kiến Trúc Cơ Sở Dữ Liệu (Database Schema)

Tạo bảng mới `expense_requests` trong SQLite (`database.py`):

```sql
CREATE TABLE IF NOT EXISTS expense_requests (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    code TEXT UNIQUE NOT NULL,                  -- Ví dụ: YC-261008-001
    type TEXT NOT NULL DEFAULT 'reimbursement', -- 'reimbursement' (NV chi hộ chờ hoàn) | 'planned' (Dự chi sắp tới)
    employee_name TEXT NOT NULL,                -- Tên nhân viên hoặc người đề xuất chi
    amount REAL NOT NULL,                       -- Số tiền
    category TEXT NOT NULL,                     -- Hạng mục chi (vd: Chi tiền nhập hàng, Chi phí vận hành, v.v.)
    note TEXT,                                  -- Ghi chú / Nội dung chi tiết
    bill_image TEXT,                            -- Đường dẫn lưu ảnh hoặc URL/Base64 chứng từ
    bank_account_info TEXT,                     -- Thông tin STK/Ngân hàng nhận hoàn tiền của NV (tùy chọn)
    status TEXT NOT NULL DEFAULT 'pending',     -- 'pending' (Chờ duyệt) | 'completed' (Đã hoàn/chi) | 'cancelled' (Đã hủy)
    cashbook_id INTEGER REFERENCES cashbook(id),-- Liên kết Phiếu Chi thực tế khi đã giải ngân
    due_date DATE,                              -- Hạn cần chi (đối với khoản dự chi)
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    resolved_at DATETIME,
    created_by TEXT                             -- Tài khoản lập yêu cầu
);
```

---

## 3. Thiết Kế API Backend (`routers/cashbook.py`)

1. `GET /api/expense-requests`:
   - Lọc theo: `status` (`pending`, `completed`, `cancelled`), `type` (`reimbursement`, `planned`), `employee_name`, tìm kiếm từ khóa.
   - Thống kê tóm tắt: Tổng chờ hoàn ứng nhân viên, Tổng dự chi cần thanh toán, Đã giải ngân tháng này.
2. `POST /api/expense-requests`:
   - Tạo yêu cầu chi hộ / dự chi mới.
   - Hỗ trợ lưu ảnh bill (`bill_image`).
3. `POST /api/expense-requests/{id}/approve`:
   - Duyệt hoàn tiền / chi tiền.
   - Tham số: `account_id` (két tiền mặt hoặc tài khoản ngân hàng xuất tiền), `note` tùy chỉnh.
   - Hành vi:
     - Tạo 1 bản ghi trong bảng `cashbook` với type='out', category tương ứng, note="Hoàn ứng chi hộ cho [employee_name]: [ghi chú]".
     - Cập nhật `expense_requests.status = 'completed'`, `expense_requests.cashbook_id = cashbook.id`, `expense_requests.resolved_at = now()`.
4. `POST /api/expense-requests/{id}/cancel`:
   - Hủy bỏ / từ chối yêu cầu.
5. `POST /api/expense-requests/ai-ocr`:
   - Dùng endpoint Gemini Vision hiện có (`routers/ai_assistant.py`) trích xuất thông tin ảnh bill: Số tiền, Nội dung/Hạng mục, Người nhận/chuyển, Thời gian.

---

## 4. Thiết Kế Giao Diện Frontend (`templates/index.html`)

1. **Thanh Sub-tab đầu trang Sổ Quỹ Thu Chi**:
   - `[Sổ Quỹ Thực Tế]`: Toàn bộ nội dung hiện tại (Tổng thu, Tổng chi, Tồn quỹ cty/cá nhân, Bảng giao dịch).
   - `[Dự Chi & Hoàn Ứng Nhân Viên]`:
     - Badge số lượng yêu cầu đang chờ duyệt (vd: `3`).
2. **Khu vực Header & Stats Tab 2**:
   - 3 Card thống kê:
     - `Chờ Hoàn Ứng Nhân Viên`: Tổng tiền nhân viên đang chi hộ cần trả lại.
     - `Dự Chi Cần Thanh Toán`: Tổng các khoản chi sắp tới của quán.
     - `Đã Hoàn Tiền (Tháng Này)`: Tổng tiền đã giải ngân xong.
   - Nút hành động: `+ Tạo Yêu Cầu Chi Hộ / Dự Chi`.
3. **Khu vực Nhập Nhanh / AI OCR Box**:
   - Hỗ trợ kéo thả / click chọn file / dán ảnh qua **Ctrl + V**.
   - Input preview ảnh thumbnail kèm nút xóa.
   - Nút "Phân Tích AI": Tự động điền Số tiền, Hạng mục, Ghi chú.
4. **Bảng Danh Sách Yêu Cầu**:
   - Cột: Mã YC, Loại (NV Chi Hộ / Dự Chi), Nhân Viên, Hạng Mục, Số Tiền, Chứng Từ (Ảnh click xem popup to), Ngày Đề Xuất, Trạng Thái, Thao Tác.
   - Thao tác:
     - Nút "Duyệt & Chi Tiền" (Mở modal chọn tài khoản xuất tiền).
     - Nút "Hủy / Từ Chối".
     - Nút "Xem Phiếu Chi" (khi đã hoàn tiền, bấm nhảy sang xem chi tiết bên Tab 1).
