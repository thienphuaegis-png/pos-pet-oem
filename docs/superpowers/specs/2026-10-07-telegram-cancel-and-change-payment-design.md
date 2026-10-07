# Thiết Kế: Hoàn Thiện Hủy Đơn Hàng & Đổi Hình Thức Thanh Toán Trên Telegram

**Mục tiêu:** Khắc phục lỗi nuốt nút bấm inline trên Telegram Bot khi chọn đơn hàng từ danh sách 5 đơn gần nhất, đồng thời hoàn thiện nghiệp vụ hoàn trả kho, BOM, ví Spa, công nợ, điểm thưởng và đồng bộ bảng `order_payments` khi hủy đơn hoặc đổi hình thức thanh toán.

---

## 1. Bối cảnh & Vấn đề hiện tại

1. **Lỗi Telegram polling callback edit message:**
   - Trong `services/telegram_bot.py::_polling_worker()`, khi nhận `res.get("edit") == True` từ `handle_callback_query()`, hàm `editMessageText` chỉ gửi:
     ```python
     edit_payload = {
         "chat_id": chat_id,
         "message_id": msg_id,
         "text": res.get("reply", ""),
         "parse_mode": "Markdown"
     }
     ```
   - **Hậu quả:** Bị thiếu `reply_markup`. Khi người dùng bấm vào 1 đơn hàng trong danh sách 5 đơn gần nhất (`sel_cancel` hoặc `sel_pay`), text được cập nhật nhưng toàn bộ cụm nút bấm inline (Xác nhận hủy đơn / Bỏ qua, hoặc các nút chọn tài khoản thanh toán) biến mất, khiến người dùng không thể bấm tiếp.

2. **Nghiệp vụ Hủy đơn (`execute_cancel_order`):**
   - Đã có: hoàn tồn kho sản phẩm, hoàn BOM, trừ nợ khách hàng, xóa `inventory_logs`, xóa `cashbook`, xóa `order_items`, xóa `orders`.
   - Chưa có:
     - Hoàn tiền ví Spa (`spa_wallet_balance`) và ghi nhận giao dịch ví (`spa_wallet_transactions`) nếu đơn có sử dụng ví Spa.
     - Xóa các dòng phương thức thanh toán trong bảng `order_payments`.
     - Điều chỉnh hoàn lại điểm tích lũy của khách hàng (`contacts.points`) nếu đơn có tích điểm hoặc tiêu điểm.

3. **Nghiệp vụ Đổi hình thức thanh toán (`execute_change_payment`):**
   - Đã cập nhật `cashbook.account_id`.
   - Chưa cập nhật bảng `order_payments` (`account_id` và `method`), dẫn đến khi xem chi tiết đơn trên POS hoặc đối soát báo cáo vẫn hiển thị phương thức cũ.

---

## 2. Thiết kế chi tiết

### A. Giao diện Telegram (`_polling_worker`)
- Bổ sung `reply_markup` cho `editMessageText` khi `res` có `inline_keyboard`:
```python
if res.get("edit") and chat_id and msg_id:
    edit_payload = {
        "chat_id": chat_id,
        "message_id": msg_id,
        "text": res.get("reply", ""),
        "parse_mode": "Markdown"
    }
    if "inline_keyboard" in res:
        edit_payload["reply_markup"] = {"inline_keyboard": res["inline_keyboard"]}
    send_telegram_api(token, "editMessageText", edit_payload)
```

### B. Hàm `execute_cancel_order(order_code)`
Thực thi tuần tự trong 1 transaction `conn`:
1. Tìm đơn: `SELECT * FROM orders WHERE code = ?`.
2. Hoàn tồn kho sản phẩm: `products.stock` & `product_inventory.quantity`.
3. Hoàn nguyên liệu BOM: `inventory.quantity`.
4. Xóa log xuất kho: `inventory_logs`.
5. Công nợ khách: giảm trừ `contacts.debt = MAX(0, debt - debt_amount)`.
6. Ví Spa: nếu `spa_wallet_deduction > 0`, cộng lại `contacts.spa_wallet_balance`, insert vào `spa_wallet_transactions` (type='refund').
7. Sổ quỹ: xóa phiếu thu `cashbook WHERE ref_type = 'order' AND ref_id = order_id`.
8. Thanh toán: xóa `order_payments WHERE order_id = order_id`.
9. Chi tiết & đơn: xóa `order_items` và xóa `orders`.

### C. Hàm `execute_change_payment(order_code, new_account_id)`
1. Lấy thông tin tài khoản thanh toán: `SELECT id, name, account_type FROM payment_accounts WHERE id = ?`.
2. Ánh xạ `method`: nếu `account_type == 'cash'` thì `'cash'`, ngược lại `'transfer'`.
3. Cập nhật `cashbook`:
   ```sql
   UPDATE cashbook SET account_id = ? WHERE ref_type = 'order' AND ref_id = ?
   ```
4. Cập nhật `order_payments`:
   ```sql
   UPDATE order_payments SET account_id = ?, method = ? WHERE order_id = ?
   ```
5. Trả về thông báo thành công kèm tên tài khoản mới.
