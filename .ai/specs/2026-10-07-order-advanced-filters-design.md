# Thiết Kế: Hệ Thống Bộ Lọc Hóa Đơn Nâng Cao Phía Server (Backend Server-Side Order Filtering)

**Ngày:** 2026-10-07  
**Mục tiêu:** Nâng cấp trang Danh Sách Hóa Đơn Bán Hàng (`orders-subview-retail`) với bộ lọc đa tiêu chí chạy trực tiếp từ CSDL/Backend: Hình thức thanh toán, Nhân viên tạo đơn, Khách hàng, Có chứa sản phẩm, Khoảng thời gian, và Trạng thái nợ.

---

## 1. Giao Diện Người Dùng (UI Layout)

Ngay phía dưới thanh công cụ hiện tại (`Danh Sách Hóa Đơn Bán Hàng` & `📥 Nhập Excel`), bổ sung **Khối Bộ Lọc Nâng Cao (Collapsible / Clean Filter Panel)**:

```text
+---------------------------------------------------------------------------------------------------------+
| [Khoảng Ngày: Hôm nay v] [Từ: 01/10] [Đến: 07/10] [Thanh Toán: Tất cả v] [Thu Ngân: Tất cả v]        |
| [Khách Hàng: Chọn khách v] [Chứa Món: Gõ tên/mã món...] [Công Nợ: Tất cả v]  [🔍 Lọc] [✕ Xóa Lọc]       |
+---------------------------------------------------------------------------------------------------------+
```

### Các ô tiêu chí lọc:
1. **Mốc thời gian (Date Filter):**
   - Quick range select: `Tất cả thời gian`, `Hôm nay`, `Hôm qua`, `7 ngày qua`, `Tháng này`, `Tháng trước`.
   - Date picker: `Từ ngày` & `Đến ngày`.
2. **Hình thức thanh toán (Payment Method):**
   - Dropdown: `Tất cả`, `Tiền mặt (cash)`, `Chuyển khoản (transfer)`, `Thẻ (card)`, `Ví điện tử (wallet)`, `Trừ ví Spa`.
3. **Nhân viên / Thu ngân (Staff):**
   - Dropdown chọn từ danh sách `staff` (Quản Lý, Thu Ngân A, ...).
4. **Khách hàng (Customer):**
   - Combobox / Tìm kiếm chọn nhanh khách hàng (hoặc `Khách lẻ`).
5. **Có chứa sản phẩm (Contains Product):**
   - Input tìm kiếm sản phẩm: Lọc những hóa đơn có chứa món mang tên hoặc mã này trong `order_items`.
6. **Trạng thái công nợ (Debt Status):**
   - `Tất cả`, `Đã thanh toán đủ (debt = 0)`, `Còn nợ (debt > 0)`.
7. **Nút tác vụ:**
   - `🔍 Tìm Kiếm & Lọc`: Thực thi request API.
   - `✕ Xóa Lọc`: Reset toàn bộ form lọc về mặc định và tải lại danh sách.

---

## 2. Thiết Kế Backend API (`routers/pos.py`)

Nâng cấp endpoint `GET /api/orders`:
- **Query Parameters:**
  - `query: Optional[str] = None` (Mã đơn, SĐT, tên khách)
  - `from_date: Optional[str] = None` (YYYY-MM-DD)
  - `to_date: Optional[str] = None` (YYYY-MM-DD)
  - `payment_method: Optional[str] = None` ('cash', 'transfer', 'card', 'wallet')
  - `staff_id: Optional[int] = None`
  - `customer_id: Optional[int] = None`
  - `product_keyword: Optional[str] = None` (Tìm trong `order_items` join `products`)
  - `debt_status: Optional[str] = None` ('paid', 'has_debt')
  - `limit: int = 100`
  - `offset: int = 0`

- **Câu truy vấn SQL động (Dynamic SQL Builder):**
  - Sử dụng danh sách `where_clauses` và mảng `params` an toàn, chống SQL injection.
  - Khi có `product_keyword`:
    ```sql
    AND o.id IN (
        SELECT oi.order_id 
        FROM order_items oi 
        JOIN products p ON oi.product_id = p.id 
        WHERE p.name LIKE ? OR p.code LIKE ?
    )
    ```
  - Khi có `payment_method`:
    - Nếu `'wallet'`: `AND o.spa_wallet_deduction > 0`
    - Nếu khác: `AND (o.id IN (SELECT order_id FROM order_payments WHERE method = ?) OR o.id IN (SELECT ref_id FROM cashbook WHERE ref_type = 'order' AND account_id IN (SELECT id FROM payment_accounts WHERE account_type = ?)))`
  - Kết quả trả về danh sách đơn đã phân trang, kèm tổng số lượng bản ghi thỏa mãn điều kiện lọc.

---

## 3. Thiết Kế Frontend Logic (`productions.js`)

- Hàm `applyOrdersFilters(page = 1)`:
  - Thu thập giá trị từ tất cả các ô lọc.
  - Gửi request `GET /api/orders?...`.
  - Hiển thị badge: `Đã lọc: 18 hóa đơn (Khớp bộ lọc)`.
  - Hỗ trợ phân trang mượt mà.
- Hàm `resetOrdersFilters()`:
  - Reset toàn bộ ô input về rỗng.
  - Nạp lại 50 đơn mới nhất.
