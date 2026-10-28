# Subtab Pancake (POSCAKE) trong tab TMĐT — CHỜ ANH DUYỆT

## Hiện trạng code (đã đọc)
| Mục | Hiện trạng | file:line |
|---|---|---|
| Subtab TMĐT | Shopee / TikTok / Ánh xạ SKU / Thống kê, dùng `switchMktSubTab()` | `templates/index.html:1665-1681` |
| Bảng đơn sàn | `marketplace_orders.platform CHECK IN ('shopee','tiktok')` → insert `pancake` sẽ lỗi | `database.py:1978` |
| Bảng tài khoản sàn | `marketplace_accounts.platform CHECK IN ('shopee','tiktok')` | `database.py:1964` |
| Ánh xạ SKU | `marketplace_sku_mappings.platform` TEXT tự do → tái dùng được cho pancake | `database.py:2019` |
| Trừ kho đơn sàn | **Chưa có.** marketplace chỉ gán `mapped_product_id`, không `UPDATE products SET stock`, không ghi `inventory_logs` | `routers/marketplace.py` (grep rỗng) |
| Hàm trừ kho mẫu | `deduct_retail_products_stock()` (products + product_inventory + inventory_logs) | `routers/partners.py:1388` |
| Hoa hồng bán | `sales_commission_by_staff()` chỉ quét bảng `orders` POS; bảng lương lấy từ đây | `services/commission.py:24`, `services/payroll_service.py:274` |
| Backlog liên quan | "tính lương Sales Pancake (KPI 85%/100%)" chưa làm | `PROJECT_STATE.md:67` |

## POSCAKE API (skill poscake-pos-api, đã verify ở dự án trước)
- `GET https://pos.pages.fm/api/v1/shops/{shop_id}/orders?api_key=KEY&page=n&limit=50&startDateTime=UNIX&endDateTime=UNIX`
- Doanh thu tính hoa hồng = `money_to_collect` (không dùng `total_price`). Hoàn thành = `status == 3`.
- Mã đơn nằm trong `order_link` (`order_id=`), `code` thường null.
- Trường nhân viên bán / dòng sản phẩm trong đơn: **chưa verify** — cần gọi thử 1 đơn thật bằng key của anh.

## Ma trận tác động (dự kiến)
| Chiều | Đề xuất |
|---|---|
| Trigger | Nút "Đồng bộ Pancake" (chọn khoảng ngày) → `POST /api/marketplace/pancake/sync` |
| Entity | Upsert `marketplace_orders` platform=`pancake`, khóa `(platform, order_sn)` |
| Tiền | Không ghi sổ quỹ (COD/chuyển khoản về TK Pancake) — chỉ hiển thị |
| Kho | Trừ kho theo SKU map khi đơn đạt trạng thái chốt; ghi `inventory_logs` order_code=`PC-<mã>` |
| Hoàn tác | Đơn chuyển hủy/hoàn → cộng lại kho (xóa log theo order_code); sync lại không trừ 2 lần |

## Đáp án đã chốt (2026-10-25)
| # | Câu hỏi | Đáp án |
|---|---|---|
| 1 | "2 API" | 2 shop POSCAKE (2 fanpage), mỗi shop shop_id + api_key riêng |
| 2 | Hoa hồng Sales Pancake | KPI bậc thang: đạt 85% mục tiêu → X, đạt 100% → Y (số: chờ anh) |
| 3 | Trừ kho lúc nào | Ngay khi đơn xác nhận/đóng gói; hủy/hoàn → cộng lại |
| 4 | Shopee/TikTok | Làm chung cơ chế trừ kho cho cả 3 sàn |

## Verify API thật (2026-10-25, 30 ngày, nguồn `D:\Projects_Hermes\poscake-staff-commission\config.json`)
| Shop | shop_id | Đơn 30 ngày | Status thấy |
|---|---|---|---|
| MasterCare For Pet | 1329033499 | 359 | 2 shipped 42, 3 delivered 295, 5 returned 20, 6 canceled 2 |
| Thức ăn thú cưng MasterCare | 3310364 | 127 | 1 submitted 1, 2 shipped 9, 3 delivered 113, 5 returned 1, 6 canceled 3 |

- Luồng status thật (`status_history`): `0→9→2→3` (293 đơn), `0→1→2→3` (103), `0→9→2→5` hoàn (20), `0→6`/`0→1→6` hủy.
- Nhân viên bán: `assigning_seller.name` (= `creator.name` 100% đơn). 30 ngày: Thùy Dương 79.655.000đ, Tran Nguyen Phu Don 24.800.000đ (đã bỏ hủy/hoàn).
- Dòng hàng: `items[].variation_id` (UUID ổn định) + `variation_info.{name, display_id, product_display_id}`. `display_id` hay = "1" → không dùng làm mã.
- Combo: `is_composite=true` + `components[]` (vd Combo 3 Hạt Cơ Bắp = 3× SP001) → trừ kho theo thành phần.
- Hoàn: `items[].return_quantity` / `returned_count`.
- Khớp SKU tự động với `products`: 18/30 mặt hàng (Thịt tươi, Serum, Xương Orgo, Dầu cá…). Không khớp: Hạt Cơ Bắp SP001 (1.278 gói, **không có trong POS**), Nước lau sàn 4 mùi (POSCAKE `CHANHSA` vs POS `NLSCS`), Xịt khử mùi 100ml (không ghi mùi), Hạt chó MasterCare 500g.
- Công thức tool cũ (`poscake-staff-commission/app_core.py:461-463`): DT < 120tr → lương 5,2tr, ≥120tr → 6,5tr; HH = (DT − 120tr) × 2,5% (≤300tr) / 3% (≤500tr) / 3,5%.

## Còn mở
- KPI: dùng công thức tool cũ hay KPI 85%/100%? Nếu KPI: mục tiêu/người, X, Y.
- Map nhân viên POSCAKE ↔ `staff` (Thùy Dương ↔ #27 Lê Thụy Thùy Dương? Tran Nguyen Phu Don ↔ #13 Trần Nguyễn Quế Đôn?).
- Hạt Cơ Bắp SP001 chưa có trong kho POS: tạo mới hay bỏ qua trừ kho?
- Mốc trừ kho đề xuất: status ∈ {1,8,9,2,3} (đã xác nhận trở đi); 6 hủy → cộng lại; 5 hoàn → cộng `return_quantity`; 4 đang hoàn → giữ.
- Kho trừ: mặc định kho id=1 trừ khi anh muốn mỗi shop 1 kho.

## Phase (sau khi chốt)
1. Migration bỏ CHECK platform (rebuild 2 bảng) + test.
2. Backend sync POSCAKE (stdlib `urllib`, sleep giữa trang), upsert đơn + items, auto-map SKU.
3. Trừ kho/hoàn kho idempotent theo order_code + test.
4. Hoa hồng: map nhân viên POSCAKE ↔ `staff`, cộng vào `sales_commission_by_staff` → bảng lương.
5. UI subtab Pancake (copy khung Shopee) + Cài đặt nhập shop_id/api_key (lưu `marketplace_accounts.extra_config`).
6. Rebuild `POS_Mastercare.exe`.
