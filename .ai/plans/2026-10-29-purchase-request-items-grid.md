# Bảng hàng hóa đang đặt (dạng Excel) dưới trang Yêu Cầu Đặt Hàng — ĐÃ LÀM (2026-10-29, chưa commit)

Kết quả: thêm API `GET /api/purchase-requests/pending-items` (gộp theo mặt hàng trên phiếu pending, ẩn NCC/giá vốn) + card "Hàng Đang Chờ Đặt" kẻ ô kiểu Excel nằm ngay dưới 2 card lập phiếu/lịch sử (tận dụng ~40% trang đang trống). Bảng có 8 cột: #, Mã Hàng, Tên Hàng, ĐVT, Tồn, Tổng SL Đặt, Số Phiếu, Thuộc Phiếu + dòng Tổng số mặt hàng & tổng SL đặt; có ô lọc nhanh theo mã/tên/mã phiếu. Tự cập nhật khi gửi yêu cầu, lên PO, hoặc bấm Làm Mới. Test: `tests/test_purchase_requests_pending_items.py`. Chụp giao diện thật qua Playwright: kẻ ô rõ ràng, không lệch lề, không chồng chữ.

## Hiện trạng
| Mục | Bằng chứng |
|---|---|
| Trang chỉ có danh sách phiếu (mã, người gửi, số món); xem món phải bấm từng "Chi tiết" | `static/js/modules/purchase_requests.js:230` `loadPurchaseRequestsList`, `:296` `viewPurchaseRequestDetail` |
| API món chỉ lấy theo từng phiếu | `routers/purchases.py:1412` `GET /api/purchase-requests/{id}/items` |
| Chỗ đặt bảng: ngay sau card Lịch Sử, đang trống | `templates/index.html:5021` (đóng grid 2 cột) |
| Xuất Excel: dự án dùng openpyxl phía server | `requirements.txt` `openpyxl==3.1.5`, vd `routers/cashbook.py` |
| DB local `data/pos.db` có 0 phiếu yêu cầu; ảnh anh gửi có 4 phiếu | Anh đang chạy trên DB khác (Cloud D1 / máy khác) → test sẽ dùng dữ liệu tạo trong DB tạm |

## Data Mapping
| Cột | Nguồn | Ghi chú |
|---|---|---|
| Mã phiếu, ngày, người gửi, ưu tiên, trạng thái, mã PO | `purchase_requests.code/created_at/created_by/priority/status/converted_purchase_code` | |
| Mã hàng, tên, ĐVT | `products.code/name/unit` | |
| SL đặt | `purchase_request_items.quantity` | |
| Ghi chú dòng | `purchase_request_items.note` | |
| Tồn | `products.stock` (giống catalog-masked, `purchases.py:1190`) | Chỉ ở cách B |
| NCC, giá vốn | **Không hiện** | Giữ quy tắc ẩn danh của trang |

## Event Impact
Chỉ đọc, không đổi tiền/kho/nợ. Phân quyền giống API danh sách: `purchases.request` hoặc `purchases.manage`.

## Hướng làm
1 endpoint mới `GET /api/purchase-requests/items-flat?status=` (1 câu SQL JOIN) → card mới dưới trang, bảng kẻ ô kiểu Excel, ô lọc nhanh, dòng tổng; dùng lại bộ lọc trạng thái có sẵn.

## Câu hỏi đã chốt
Mockup: `.ai/sketches/purchase_requests_items_grid.html`

| # | Câu hỏi | Đáp án đã chốt |
|---|---|---|
| Q1 | Kiểu bảng | **Gộp theo mặt hàng, chỉ phiếu Chờ duyệt** (mỗi món 1 dòng: mã, tên, ĐVT, tồn, tổng SL, số phiếu, thuộc phiếu) |
| Q2 | Nút Xuất Excel | **Không**, chỉ hiện trên trang (bảng kẻ ô kiểu Excel) |
