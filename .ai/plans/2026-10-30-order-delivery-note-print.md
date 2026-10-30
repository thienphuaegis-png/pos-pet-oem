# Thiết Kế: In Phiếu Giao Hàng A4 (Không Giá) Trong Chi Tiết Hóa Đơn

## 1. Đáp án đã chốt (`clarify`)

| # | Câu hỏi | Đáp án đã chốt |
|---|---|---|
| Q1 | Cách in và khổ giấy cho Phiếu Giao Hàng (không hiện giá)? | **In thẳng khổ A4 Dọc chuẩn biên bản giao nhận** (6 cột: STT, Mã SKU, Tên SP, ĐVT, SL, Ghi chú + Tổng SL, ẩn hoàn toàn giá/tiền/QR) — giống Phiếu chuyển kho A4 (`printStockTransferA4`) |
| Q2 | Khu vực chữ ký cuối Phiếu Giao Hàng A4 gồm mấy cột? | **3 cột**: `Người Lập Phiếu` — `Người Giao Hàng` — `Người Nhận Hàng` |
| Q3 | Vị trí đặt nút "In Phiếu Giao Hàng"? | **Ở Modal Chi tiết hóa đơn** (`#modal-order-view`, `templates/index.html:8738`, cạnh nút `In Lại`) |

---

## 2. Bản đồ ánh xạ dữ liệu (Data Mapping)

| Trường trên Phiếu Giao Hàng | Nguồn lấy (Biến / Cột DB) | File / Vị trí | Ghi chú |
|---|---|---|---|
| Tên shop, Địa chỉ, Hotline | `companySettings.shop_name`, `shop_address`, `shop_phone` | `/api/settings` (`static/js/app.js:2552`) | Lấy động từ Settings, rỗng thì ẩn dòng, cấm chuỗi giả |
| Tiêu đề phiếu | Cố định: `PHIẾU GIAO HÀNG` | Hàm `printDeliveryNoteA4(orderCode)` | In hoa, đậm, canh giữa, không phụ đề hành chính thừa |
| Số phiếu / Mã đơn | `ord.code` (`orders.code`) | `GET /api/orders/{code}` (`routers/pos.py:673`) | Sẵn có |
| Ngày lập | `formatDate(ord.created_at)` (`orders.created_at`) | `static/js/app.js` / `productions.js` | Chỉ hiện `Ngày: DD/MM/YYYY`, ẩn giờ |
| Khách hàng (Người nhận) | `ord.customer_name \|\| 'Khách lẻ'` (`contacts.name`) | `GET /api/orders/{code}` (`routers/pos.py:680`) | Sẵn có |
| Số điện thoại nhận | `ord.customer_phone \|\| ''` (`contacts.phone`) | `GET /api/orders/{code}` (`routers/pos.py:680`) | Sẵn có |
| Địa chỉ giao hàng | `ord.customer_address \|\| ''` (`contacts.address`) | `GET /api/orders/{code}` (`routers/pos.py:680`) | Sẵn có |
| Ghi chú giao hàng | `ord.note \|\| ''` (`orders.note`) | `GET /api/orders/{code}` (`routers/pos.py:679`) | Trống thì để `""`, không tự điền mặc định |
| Bảng 6 cột: STT, Mã SKU, Tên SP, ĐVT, SL, Ghi chú | `ord.items[]`: `product_code`, `product_name`, `unit`, `quantity`, `is_gift` | `GET /api/orders/{code}` (`routers/pos.py:700-743`) | **Ẩn hoàn toàn**: Đơn giá, CK, Thành tiền, Tổng tiền, Phí ship, Công nợ, VietQR. Món `is_gift` ghi `'Hàng tặng'` ở cột Ghi chú |
| Dòng tổng cộng | `items.length` mặt hàng & `SUM(it.quantity)` | Tính trực tiếp trên `ord.items` | `TỔNG CỘNG (N mặt hàng): <Tổng SL>` |
| 3 cột chữ ký | `Người Lập Phiếu` (`ord.created_by \|\| ord.staff_name`), `Người Giao Hàng`, `Người Nhận Hàng` (`ord.customer_name`) | `GET /api/orders/{code}` | Kèm vết sửa cuối nếu có `ord.updated_by` |

---

## 3. Ma trận tác động sự kiện (Event Impact Matrix)

| Chiều tác động | Chi tiết |
|---|---|
| **1. Trigger (UI/Payload)** | Bấm nút `🚚 In Phiếu Giao Hàng` trong `#modal-order-view` (`templates/index.html:8738`) → gọi `printCurrentOrderDeliveryNote()` / `printOrderDeliveryNoteA4(orderCode)` (`static/js/modules/productions.js`). Tận dụng `window.currentViewedOrderObj` (nếu đã tải sẵn trong modal) hoặc gọi `GET /api/orders/{code}`. |
| **2. Entity State** | Chỉ đọc (`READ-ONLY`). Không thay đổi trạng thái đơn hàng (`orders.status`). |
| **3. Ledger / Financial (Dòng tiền)** | Không phát sinh giao dịch sổ quỹ (`cashbook`), không hiện bất kỳ thông tin tiền tệ/công nợ/tài khoản NH nào trên phiếu. |
| **4. Stock / Debt (Dòng hàng / Dòng nợ)** | Không trừ kho lại, không thay đổi công nợ khách hàng. |
| **5. Reversal & Siblings** | Dùng iframe ẩn cô lập `#iframe-delivery-note-print` (`@page { size: A4 portrait; margin: 8mm 10mm; }`, giống `printStockTransferA4`), không làm ảnh hưởng state của `#print-modal` (in hóa đơn tính tiền K80/A4). |

---

## 4. Các bước thực thi (Sau khi duyệt)

1. **`templates/index.html` (`#modal-order-view`, dòng ~8738)**:
   - Thêm nút `In Phiếu Giao Hàng` cạnh nút `In Lại` trong footer của Modal Chi tiết hóa đơn.
2. **`static/js/modules/productions.js` (cạnh `printCurrentViewedOrder`, dòng ~5226)**:
   - Thêm hàm `printOrderDeliveryNoteA4(orderCode)` và `printCurrentOrderDeliveryNote()`:
     - Lấy dữ liệu từ `window.currentViewedOrderObj` (nếu khớp mã) hoặc fetch `/api/orders/{code}`.
     - Render HTML khổ A4 Dọc (bảng 6 cột không giá + dòng Tổng SL + 3 cột chữ ký `Người Lập Phiếu` / `Người Giao Hàng` / `Người Nhận Hàng`) vào `#iframe-delivery-note-print` và gọi `print()`.
3. **Kiểm thử (`tests/test_order_delivery_note_print.py`)**:
   - Kiểm tra nút bấm trong `#modal-order-view`, hàm `printOrderDeliveryNoteA4`, cấu trúc 6 cột & 3 chữ ký, và đảm bảo không chứa giá/thành tiền/QR.
