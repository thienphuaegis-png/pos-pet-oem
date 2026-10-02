# PROJECT STATE — POS Offline (Petcare & Retail)

**Checkpoint:** 2026-10-02 — Chuẩn Hóa Điều Chuyển Kho (OEM Style + In-App Modal) & Sửa Lỗi Sửa Đơn Đặt Gia Công OEM  
**Server:** `http://127.0.0.1:8998` / `http://127.0.0.1:8999` — FastAPI + SQLite (`data/pos.db`)  
**Working dir:** `D:/Projects_Hermes/pos-offline-petcare2`  
**Archive Log:** `docs/archive/STATE_2026_09.md` (lịch sử chi tiết các phiên trước)

---

## 1. Phiên Hiện Tại ✅ (2026-10-02)
- **Sửa Lỗi Backend & Frontend Phân Hệ Điều Chuyển Kho (`INV`):**
  - Nhận diện linh hoạt trường `item_id`, `product_id`, `ingredient_id` trong payload POST `/api/inventory/transfer`, khắc phục lỗi `NOT NULL constraint failed: product_inventory.product_id`.
  - Trả về đồng thời `code`, `transfer_code`, `id`; chuẩn hóa bảng lịch sử và chi tiết phiếu.
  - Bổ sung endpoint `GET /api/inventory/transfers/{transfer_id}` xem chi tiết đợt chuyển.
  - Viết suite test tự động `tests/test_warehouse_transfers.py` (Pass 100%).
- **Chuẩn Hóa Giao Diện Thêm Hàng Điều Chuyển Kho Sang Chuẩn OEM (`UI / INV`):**
  - Thanh tìm kiếm full-width, hiển thị dropdown phân tách 2 nhóm rõ ràng: `📦 Chưa chọn vào phiếu` và `✓ Đã có trong phiếu (làm mờ, badge đã chuyển, nút + Tăng SL)`.
  - Thao tác 1-chạm: Click chọn tự động đổ vào bảng và focus/bôi đen ngay ô số lượng để nhập nhanh.
  - Thay thế popup `confirm()` mặc định của trình duyệt bằng **Modal Xác Nhận In-App chuyên nghiệp** (thẻ Kho Xuất đỏ, Kho Nhập xanh, tóm tắt danh sách món, nút Xác Nhận Chuyển và Hủy Bỏ).
  - Toàn bộ cảnh báo chuyển kho chuyển sang Toast notification không chặn màn hình.
- **Sửa Lỗi Nút "✏️ Sửa" Đơn Đặt Gia Công OEM (`PROD`):**
  - Bổ sung hàm `renderOEMItemRow` và `addOEMProductRow` thay thế hàm cũ đã bị mất do đợt nâng cấp trước.
  - Viết lại toàn bộ hàm `openModalEditOEM`: gán lại nhà máy, kho NVL xưởng, kho đích, hạn giao, nguồn tiền, chiết khấu (% / VNĐ), VAT; khóa ô tiền cọc đợt 1; nạp danh sách món vào bảng và tự động đối chiếu tồn kho BOM.
  - Cập nhật backend `routers/oem.py`: bổ sung `bom_count` và cập nhật trường `fund_source` vào DB khi sửa đơn OEM.
- **Biên Dịch & Đóng Gói Portable:**
  - Build lại hoàn chỉnh file thực thi `POS_Mastercare.exe` (onefile) cập nhật các routes và mã JavaScript mới nhất.
  - Tăng cache buster: `app.js?v=20261002_03`, `productions.js?v=20261002_03`.
  - Đã đẩy toàn bộ lên remote GitHub `main` (`d4c005a`).

---

## 2. Bằng Chứng Kiểm Thử (Verification) 🧪
- `tests/test_warehouse_transfers.py`: **PASS 1/1** (Tạo phiếu chuyển kho hàng hóa & nguyên liệu, kiểm tra chi tiết và danh sách).
- `tests/test_git_hygiene.py`: **PASS 6/6** (Đảm bảo an toàn repo, không track file rác/bí mật, POS_Mastercare.exe được track chuẩn).

---

## 3. Files Thay Đổi Chính
| Module / File | Trách nhiệm |
|---|---|
| `routers/inventory.py` | Linh hoạt `prod_id`/`ing_id`/`item_id`, bổ sung GET chi tiết phiếu chuyển kho |
| `schemas.py` | Bổ sung `item_id` vào `TransferItemIn` |
| `routers/oem.py` | Bổ sung `bom_count` và cập nhật `fund_source` trong `update_oem_order` |
| `static/js/app.js` | Dropdown chuyển kho 2 nhóm chuẩn OEM, in-app confirm modal, toast alerts |
| `static/js/modules/productions.js` | Sửa hoàn chỉnh logic nút sửa đơn OEM, `renderOEMItemRow`, `openModalEditOEM` |
| `templates/index.html` | Cập nhật cấu trúc quick-search chuyển kho và tăng version cache busters |
| `POS_Mastercare.exe` | Binary portable onefile biên dịch mới nhất |
| `tests/test_warehouse_transfers.py` | Test suite tự động cho tính năng chuyển kho |

---

## 4. Việc Kế Tiếp (Next Priority Tasks) 📌
- [ ] `ecomm-sync`: Nghiên cứu kịch bản kéo đơn sàn TMĐT (Shopee/TikTok Shop) tự động trừ tồn kho.
- [ ] `bill-5`: Kiểm tra và chuẩn hóa in ấn K80/A4 trên máy in vật lý tại quầy thực tế.
- [ ] `cloud-2`: Tích hợp đồng bộ dữ liệu thời gian thực giữa quầy offline và Supabase Cloud.
- [ ] `sys-4`: Chuẩn bị kiến trúc schema & hook cho chức năng AI trợ lý quầy.
