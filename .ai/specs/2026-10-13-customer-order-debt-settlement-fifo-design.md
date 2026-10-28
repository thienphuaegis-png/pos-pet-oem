# Thiết Kế: Cấn Trừ Công Nợ Hóa Đơn Khách Hàng (Đơn Đích Danh & FIFO)

## 1. Vấn Đề Nghiệp Vụ
- Hiện tại khi người dùng thu công nợ khách hàng (qua API `POST /api/contacts/{id}/pay-debt` hoặc bấm nút "Lập phiếu thu nợ cho hóa đơn này" tại `#modal-order-view`), hệ thống chỉ:
  1. Trừ số dư nợ của đối tác trong bảng `contacts` (`contacts.debt`).
  2. Tạo một phiếu thu `PT-CN-...` trong bảng Sổ Quỹ `cashbook`.
- **Hạn chế**: Không hề cập nhật `debt_amount`, `paid_amount` trên bảng `orders` và không thêm dòng thanh toán trong `order_payments`.
- **Hệ quả**: Hóa đơn gốc vẫn giữ nguyên số tiền nợ (`debt_amount > 0`), trạng thái nợ không thay đổi, và khi lọc các đơn còn nợ thì hóa đơn đó không biến mất.

## 2. Giải Pháp Chi Tiết

### 2.1. Backend (`routers/partners.py`)
- Mở rộng model `ContactPayDebt`:
  ```python
  class ContactPayDebt(BaseModel):
      amount: float
      note: Optional[str] = ""
      account_id: Optional[int] = None
      fund_source: Optional[str] = "COMPANY"
      payment_date: Optional[str] = None
      order_id: Optional[int] = None
  ```
- Khi `c["type"] == "customer"` trong endpoint `pay_contact_debt`:
  - Lấy tài khoản thanh toán `acc_id`, xác định phương thức thanh toán `pay_method` ('cash' nếu tài khoản là tiền mặt, ngược lại 'transfer').
  - **Trường hợp A1: Có truyền `order_id`**:
    - Truy vấn đơn hàng đó:
      ```sql
      SELECT id, code, total_amount, final_amount, paid_amount, debt_amount 
      FROM orders 
      WHERE id = ? AND customer_id = ? AND debt_amount > 0 AND status != 'cancelled'
      ```
    - Nếu đơn tồn tại:
      - Tính tiền phân bổ cho đơn: $\text{alloc} = \min(\text{remaining\_pay}, \text{order.debt\_amount})$.
      - Cập nhật đơn: `debt_amount = debt_amount - alloc`, `paid_amount = paid_amount + alloc`.
      - Ghi nhận `order_payments (order_id, method, amount, account_id)`.
      - Giảm trừ `remaining_pay -= alloc`.
  - **Trường hợp A2: Phân bổ FIFO cho các đơn còn nợ (nếu không có `order_id` hoặc còn dư tiền sau khi trừ đơn chỉ định)**:
    - Nếu `remaining_pay > 0`:
      - Quét danh sách đơn nợ của khách theo thứ tự tăng dần của `id` (đơn cũ trước):
        ```sql
        SELECT id, code, debt_amount, paid_amount 
        FROM orders 
        WHERE customer_id = ? AND debt_amount > 0 AND status != 'cancelled' 
        ORDER BY id ASC
        ```
      - Lặp qua từng đơn, trừ dần `debt_amount`, tăng `paid_amount`, ghi nhận vào `order_payments`.
  - Cập nhật số dư nợ đối tác:
    ```sql
    UPDATE contacts SET debt = MAX(0, debt - req.amount) WHERE id = ?
    ```
  - Ghi nhận phiếu thu Sổ Quỹ `cashbook`:
    - `ref_type = 'order_debt'` nếu có `order_id`, hoặc `'contact_debt'` nếu thu tổng.
    - `ref_id = req.order_id` (nếu có).

### 2.2. Frontend (`static/js/modules/contacts.js`, `static/js/modules/productions.js`, `templates/index.html`)
- `templates/index.html`:
  - Thêm `<input type="hidden" id="pay-debt-order-id" value="">` vào `#modal-pay-debt`.
- `static/js/modules/contacts.js`:
  - Sửa hàm `openPayDebtModal(id, orderId = null)`:
    - Nếu có `orderId`: gán `document.getElementById('pay-debt-order-id').value = orderId`.
    - Nếu không: gán rỗng `""`.
  - Sửa hàm `submitPayDebt`:
    - Đọc `order_id = document.getElementById('pay-debt-order-id')?.value ? parseInt(...) : null`.
    - Gửi kèm trong payload POST lên `/api/contacts/{id}/pay-debt`.
    - Sau khi thành công:
      - Nếu `window.loadOrders` tồn tại, gọi `window.loadOrders()`.
      - Nếu đang mở modal chi tiết đơn hàng (`#modal-order-view` không ẩn) và có `currentViewedOrderCode`: gọi lại `openModalOrderView(currentViewedOrderCode)` để làm mới số tiền nợ/đã trả.
- `static/js/modules/productions.js`:
  - Trong `payDebtFromCurrentOrderView`: truyền `ord.id` sang `openPayDebtModal(custId, ord.id)`.

## 3. Tiêu Chuẩn Nghiệm Thu (Acceptance Criteria)
1. **AC 1 (Thu nợ đơn đích danh)**: Mở hóa đơn còn nợ, bấm "Thu nợ đơn này", điền số tiền trả $\to$ hóa đơn đó được giảm `debt_amount` tương ứng, tăng `paid_amount`, ghi nhận bản ghi vào `order_payments`.
2. **AC 2 (Ẩn khỏi bộ lọc nợ khi trả đủ)**: Khi số tiền trả bằng toàn bộ số nợ của hóa đơn, `debt_amount` của hóa đơn trở về 0, hóa đơn không còn hiển thị khi lọc "Đơn còn nợ".
3. **AC 3 (FIFO khi thu nợ từ khách hàng)**: Khách hàng có 2 đơn nợ (Đơn 1 nợ 100k, Đơn 2 nợ 200k). Thu nợ 150k từ danh sách khách $\to$ Đơn 1 về 0đ nợ, Đơn 2 còn nợ 150k. Phiếu thu Sổ Quỹ ghi nhận đủ 150k.
