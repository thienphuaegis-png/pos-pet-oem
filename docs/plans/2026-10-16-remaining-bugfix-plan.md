# Plan — Việc còn tồn (2026-10-16)

Nguồn: `docs/BUGFIX_REQUEST_2026-10-12.md`, `PROJECT_STATE.md §4`, `PROJECT_MAP.html` (roadmap `done: false`).
Quy tắc giữ nguyên như BUGFIX_REQUEST §0: DB tạm, mỗi lỗi 1 test hồi quy, commit theo Phase, rebuild exe cuối, không push.

## Trạng thái re-check (đọc code thật ngày 16/10)

| Mục | Trạng thái | Bằng chứng |
|---|---|---|
| 2.3 Đổi/trả sai tiền | **Còn lỗi** | `pos.py:886-917` nhánh `diff>0` + `debt/wallet` không ghi gì; hoàn ví không ghi `spa_wallet_transactions`; đơn gốc còn nợ vẫn chi tiền mặt |
| 2.5 Xóa phiếu chi | **Một phần** | `cashbook.py:374-404` đã hoàn tác purchase/oem/supplier_debt; `order_po`, `order_oem`, NULL chưa chặn |
| 2.6 Sửa amount phiếu liên kết | **Còn lỗi** | `cashbook.py:~286` không kiểm `ref_type` |
| 2.11 Đếm nợ PO chưa nhận | **Còn lỗi** | `partners.py:88,102,150,164,539,552,768,775` dùng `status != 'cancelled'` |
| 2.12 Update contact đè nợ | **Còn lỗi** | `partners.py:643` nhận `req.debt` từ form |
| 2.13 Xóa contact NULL debt | **Còn lỗi** | `partners.py:723` `row["debt"] > 0` |
| 3.3 Service trừ `product_inventory` | **Còn lỗi** | `pos.py:1252-1258` lọc service ở `products` nhưng không ở `product_inventory` |
| 3.4 Trả/đổi hàng combo | **Một phần** | unit_ratio/kho/BOM đã có; combo trả về cộng vào mã combo, không về thành phần |
| 3.5 Đổi mã combo | **Đã sửa** | `combos.py:_sync_product_entry` dùng `old_code` → đánh dấu FIXED |
| 3.6 Combo kiểm tồn | **Còn lỗi** | `combos.py:~383` kiểm `products.stock` tổng |
| 3.7 Xuất hủy | **Còn lỗi** | `inventory.py:write_off_items` không trừ `products.stock` |
| 4.6 Giá vốn ghi đè | **Còn lỗi** | `production.py:191`, `oem.py:731` |
| 2.4, 2.7–2.10, 2.15, 3.9–3.15, 4.1–4.3, 4.7–4.8 | Chưa xác nhận | Làm lúc vào Phase tương ứng |

## Phase A — Commit phần đang dở (5 phút)
- [ ] Commit 8 file đang sửa (return cap, adjust validation, safe backup) — `fix(core): ...`
- [ ] Cập nhật BUGFIX_REQUEST: 3.5 → FIXED.

## Phase B — Helper tồn kho dùng chung (gốc của 3.3/3.4/3.6/3.7)
- [ ] `apply_stock(cur, product_id, base_qty, warehouse_id, sign, order_id, code, note)` trong `routers/pos.py`: product / combo→thành phần / service bỏ qua / BOM / `product_inventory` / `inventory_logs`.
- [ ] Thay ở create, update, delete, return, exchange order. Test đối xứng: bán rồi trả = tồn ban đầu (product, combo, BOM, service).
- [ ] 3.6 combo kiểm tồn theo kho; 3.7 write_off trừ cả `products.stock`.

## Phase C — Tiền / công nợ (cần anh chốt nghiệp vụ, xem câu hỏi)
- [ ] 2.3 đổi/trả — **nghiệp vụ anh chốt 16/10:** trả hàng thì nhận hàng rồi hoàn tiền cho khách; đổi hàng thì thiếu thu thêm, dư trả lại. Chỉ dùng tiền mặt/CK.
  - UI `templates/index.html:7019`: bỏ option `debt`, `wallet`.
  - Backend `pos.py:886-922`: `refund_method` ∉ {cash, transfer} → 400; xóa nhánh `debt`/`wallet` chết. `diff>0` ghi phiếu thu, `diff<0` ghi phiếu chi, `diff=0` không ghi.
  - Test: trả thuần (chi), đổi thiếu (thu), đổi dư (chi), đổi bằng (không phiếu), `refund_method=debt` → 400.
  - **CHỜ ANH CHỐT:** đơn gốc còn nợ / trả bằng ví mà khách trả hàng. Đề xuất: giá trị trả trừ nợ đơn gốc trước, dư mới chi tiền (tránh chi tiền chưa thu). Phương án khác: chặn trả khi đơn còn nợ.
- [ ] 2.5 chặn xóa phiếu `ref_type` không hỗ trợ hoàn tác (400).
- [ ] 2.6 chỉ sửa `amount` khi `ref_type` NULL/`manual`.
- [ ] 2.11 `status = 'received'`.
- [ ] 2.12 bỏ `debt` khỏi update thông tin; adjust giữ tỉ lệ split.
- [ ] 2.13 `(debt or 0)` + chặn khi còn ví/nợ tách quỹ.
- [ ] Xác nhận + sửa 2.4, 2.7, 2.8, 2.9, 2.10.

## Phase D — Hotel (2.15, 4.7, 4.8)
- [ ] Xác nhận rồi sửa: checkin bỏ cọc, checkout không tạo order/cashbook, double-booking, batch_code trùng.

## Phase E — P2 còn lại
- [ ] 3.9–3.15 (xóa phiếu nhập, product_id=1, kiểm kê, import Excel), 4.1–4.3 promotions, 4.6 giá vốn bình quân gia quyền `(stock*cost + qty*unit)/(stock+qty)`, tồn ≤ 0 lấy giá mới — **anh đã duyệt 16/10**.

## Phase F — Ngoài code (anh tự làm)
- [ ] Revoke token Telegram cũ (@BotFather), cấp mới.
- [ ] Cấp lại Gemini API key.
- [ ] Verify máy chủ: CAP_NHAT.bat + Tailscale Funnel từ 4G.

## Roadmap tính năng (sau khi hết bug tiền/kho)
- [ ] Marketplace: phân trang server-side + API KPI riêng.
- [ ] Thay `confirm()` còn sót bằng `showConfirmModal`.
- [ ] Đồng bộ đơn Shopee/TikTok (import Excel → trừ kho + sổ quỹ).

Mỗi Phase: test pass → cập nhật `[x] FIXED` vào BUGFIX_REQUEST + PROJECT_STATE → commit. Rebuild exe một lần cuối mỗi đợt deploy.
