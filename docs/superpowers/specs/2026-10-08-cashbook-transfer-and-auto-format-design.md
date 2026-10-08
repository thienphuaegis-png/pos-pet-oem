# Thiết Kế: Tự Động Định Dạng Tiền (Phân Tách Dấu Chấm + Đọc Thành Chữ) & Chuyển Quỹ Nội Bộ

- **Ngày phê duyệt:** 2026-10-08
- **Tác giả:** Hermes Agent
- **Người phê duyệt:** Bùi Thiên Phú (Chủ quán)
- **Phương án lựa chọn:** Hướng A — Tích hợp tab Chuyển Quỹ thứ 3 vào Modal Lập Phiếu Thu Chi + Định dạng tiền tự động phân tách hàng nghìn và đọc thành chữ.

---

## 1. Mục Tiêu & Phạm Vi (Scope)

1. **Tự động định dạng tiền theo thời gian thực:**
   - Thay ô nhập số tiền thô (`88000000`) bằng ô nhập có dấu chấm phân tách hàng nghìn tự động (`88.000.000 đ`).
   - Hiển thị dòng đọc số thành chữ tiếng Việt ngay dưới ô tiền: *(Bằng chữ: Tám mươi tám triệu đồng)* để loại bỏ 100% rủi ro gõ nhầm hàng triệu/chục triệu.
   - Thêm các chip chọn nhanh số tiền: `+100k`, `+500k`, `+1tr`, `+5tr`, `+10tr`.
2. **Chức năng Chuyển Tiền / Quỹ Nội Bộ (Rút - Nộp ngân hàng & tiền mặt):**
   - Bổ sung tab thứ 3 `[🔄 Chuyển Quỹ]` ngay trong Modal Lập Phiếu Thu Chi.
   - Chọn **Tài khoản nguồn (Từ đâu)** và **Tài khoản đích (Đến đâu)** kèm nút đảo chiều `⇄`.
   - Khi bấm "Xác Nhận Chuyển Tiền": Hệ thống tự động sinh 1 cặp phiếu đối ứng (Phiếu Chi ở tài khoản nguồn & Phiếu Thu ở tài khoản đích) liên kết với nhau trong cùng 1 transaction an toàn, số dư 2 tài khoản cập nhật ngay lập tức.

---

## 2. Thiết Kế Cơ Sở Dữ Liệu & Backend API (`routers/cashbook.py`)

### A. Endpoint `POST /api/cashbook/transfer`
- **Payload Schema (`CashbookTransferCreate`)**:
  - `from_account_id`: int (Tài khoản trích tiền ra)
  - `to_account_id`: int (Tài khoản nhận tiền vào)
  - `amount`: float (> 0)
  - `note`: Optional[str] (Ghi chú lý do chuyển)
- **Quy tắc kiểm tra nghiệp vụ**:
  - `from_account_id != to_account_id`.
  - Cả 2 tài khoản phải đang hoạt động (`is_active = 1`).
  - Số tiền chuyển phải lớn hơn 0.
- **Hạch toán đối ứng trong cùng 1 transaction**:
  - Sinh mã giao dịch chung: `CK-{YYMMDD}-{STT:03d}` (ví dụ: `CK-261008-001`).
  - Phiếu Chi (tại `from_account_id`):
    - Mã: `PC-CK-{YYMMDD}-{STT:03d}`
    - Type: `out`
    - Category: `Chuyển tiền nội bộ`
    - Amount: `amount`
    - Account: `from_account_id`
    - Note: `Chuyển sang [Tên TK Đích]: {note}`
    - Ref_type: `fund_transfer`
  - Phiếu Thu (tại `to_account_id`):
    - Mã: `PT-CK-{YYMMDD}-{STT:03d}`
    - Type: `in`
    - Category: `Chuyển tiền nội bộ`
    - Amount: `amount`
    - Account: `to_account_id`
    - Note: `Nhận từ [Tên TK Nguồn]: {note}`
    - Ref_type: `fund_transfer`
- **Response**: `{"success": True, "transfer_code": code, "from_account": ..., "to_account": ..., "amount": amount}`.

---

## 3. Thiết Kế Giao Diện Frontend (`templates/index.html` & `static/js/modules/productions.js`)

### A. Cải tiến ô nhập số tiền & đọc thành chữ
- Thay input `type="number"` bằng text input tự động format:
  ```html
  <input id="cash-amount-input" type="text" inputmode="numeric" 
      class="w-full border border-slate-300 rounded-lg p-2.5 text-sm font-mono font-black text-right text-emerald-700 ..."
      placeholder="0 đ" oninput="handleCurrencyInput(this)">
  <div id="cash-amount-words" class="text-[11px] font-semibold text-slate-500 italic mt-1 text-right">
      (Bằng chữ: Không đồng)
  </div>
  ```
- Các nút nạp nhanh số tiền:
  ```html
  <div class="flex flex-wrap gap-1 mt-1 justify-end">
      <button type="button" onclick="quickAddAmount(100000)" class="...">+100k</button>
      <button type="button" onclick="quickAddAmount(500000)" class="...">+500k</button>
      <button type="button" onclick="quickAddAmount(1000000)" class="...">+1tr</button>
      <button type="button" onclick="quickAddAmount(5000000)" class="...">+5tr</button>
      <button type="button" onclick="quickAddAmount(10000000)" class="...">+10tr</button>
  </div>
  ```

### B. Segmented Tabs Trong Modal
Thanh chuyển 3 loại:
- `[🟢 Thu Tiền (Vào)]`
- `[🔴 Chi Tiền (Ra)]`
- `[🔄 Chuyển Tiền / Quỹ]`

### C. Khối chọn tài khoản khi Chuyển Quỹ
Khi chọn tab Chuyển Quỹ:
- Ẩn dropdown đơn lẻ và ẩn chọn đối tác.
- Hiển thị 2 dropdown:
  - **Tài khoản nguồn (Từ)**: Kèm số dư hiện tại.
  - Nút đảo chiều `⇄` nằm ở giữa.
  - **Tài khoản đích (Đến)**: Kèm số dư hiện tại.
- Nút xác nhận chuyển thành màu chàm/xanh dương: `[🔄 Xác Nhận Chuyển Tiền]`.
