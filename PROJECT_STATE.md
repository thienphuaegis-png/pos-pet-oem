# PROJECT STATE — POS Offline (Petcare & Retail)

**Checkpoint:** 2026-10-16 — Vá Lỗi Logic & Siết Bảo Mật (Settings, Trả Hàng, BOM, Điều Chỉnh Kho, Xóa Ví, Xóa Kho, Reset Data, JWT Typ)
**Server:** `http://127.0.0.1:8998` — FastAPI + SQLite (`data/pos.db`), bind `0.0.0.0`
**Working dir:** `D:/Projects_Hermes/pos-offline-petcare2`
**Remote:** `https://github.com/thienphuaegis-png/pos-pet-oem.git` (Branch: `main`)
**Archive Log:** `docs/archive/STATE_2026_10.md` (phiên 2026-10-11), `docs/archive/STATE_2026_09.md`

---

## 1. Phiên Hiện Tại ✅ (2026-10-16)
- **Vá 8 Lỗi Trọng Yếu Logic & Bảo Mật (`routers/`, `schemas.py`, `dependencies.py`):**
  - `routers/settings.py`: Khóa `user=Depends(require_role("owner"))` cho `POST /company`, `/template`, `/print-bold-configs`, `/backup-drive-now`.
  - `routers/pos.py`: Khóa `Depends(require_permission("pos.sell"))` cho `POST /api/pos/returns`, kiểm tra trần đơn giá trả `return_price <= max_return_price` (tự tính từ giá thực mua sau chiết khấu đơn gốc).
  - `routers/bom.py`: `calculate_product_cost_internal` chỉ cập nhật `products.cost_price` khi có định lượng BOM hoặc phí OEM; tránh ghi đè giá vốn về 0 khi xem BOM sản phẩm thường.
  - `schemas.py` & `routers/inventory.py`: Mở rộng `InventoryAdjust` hỗ trợ `quantity, mode, purchase_price, supplier_id, note`; gán `cur_inv` chuẩn trước tính toán diff tồn kho.
  - `routers/topup.py`: `DELETE /transactions/{id}` chỉ cho xóa loại `topup`, kiểm tra số dư ví khách hàng trước khi hoàn tác để ngăn âm ví.
  - `routers/inventory.py`: `DELETE /api/warehouses/{id}` chặn xóa kho 1 và kho còn hàng tồn (sản phẩm hoặc nguyên liệu).
  - `routers/settings.py`: Sửa reset data sang `LOWER(type) IN ('customer', 'khach_hang')` để xóa sạch khách hàng thật; xóa các bảng phụ thuộc trước (`order_payments`, `order_returns`, `order_return_items`, `spa_wallet_transactions`, `hotel_bookings`).
  - `dependencies.py` & `routers/auth.py`: Thêm claim `typ: "access"` và `typ: "refresh"`; `get_current_user` từ chối refresh token; `/api/auth/refresh` yêu cầu refresh token hợp lệ; ràng buộc mật khẩu mới tối thiểu 6 ký tự.
- **Hạ Tầng Test Suite Tự Động (`tests/test_bugfixes_2026_10.py`):**
  - Viết 8 test case kiểm tra hồi quy độc lập cho toàn bộ các lỗi trên, cách ly DB test an toàn.

---

## 2. Bằng Chứng Kiểm Thử (Verification) 🧪
- **Lưới an toàn Auth (`tests/test_api_requires_auth.py`):** 314/314 endpoint tự động kiểm tra từ OpenAPI schema trả đúng 401 khi ẩn danh.
- **Test Hồi Quy Mới (`tests/test_bugfixes_2026_10.py`):** 8/8 passed.
- **Toàn bộ Test Suite:** 631 passed, 10 skipped, 0 failed.
- **Kiểm tra điều hướng trực tiếp (`tests/test_authed_downloads.py`):** 0 vi phạm trên toàn bộ mã nguồn JS và HTML.

---

## 3. Files Thay Đổi Chính
| Module / File | Trách nhiệm |
|---|---|
| `routers/settings.py` | Khóa owner cho POST company/template/backup; sửa reset data customer lowercase & xóa bảng phụ thuộc |
| `routers/pos.py` | Kiểm tra trần return_price và phân quyền pos.sell cho trả hàng |
| `routers/bom.py` | Không ghi đè giá vốn sản phẩm về 0 khi không có BOM |
| `schemas.py` | Mở rộng InventoryAdjust schema |
| `routers/inventory.py` | Sửa logic adjust_inventory và chặn xóa kho có tồn kho / kho 1 |
| `routers/topup.py` | Chặn xóa giao dịch spend và kiểm tra số dư ví trước khi hoàn tác topup |
| `dependencies.py` | Thêm kiểm tra JWT `typ == "access"` trong get_current_user |
| `routers/auth.py` | Phát sinh token có `typ`, viết lại endpoint `/refresh` nhận refresh token, chặn password < 6 ký tự |
| `tests/test_bugfixes_2026_10.py` | 8 test case hồi quy cho toàn bộ các lỗi trên |
| `docs/BUGFIX_REQUEST_2026-10-12.md` | Cập nhật trạng thái FIXED cho toàn bộ các mục đã hoàn tất |

---

## 4. Việc Kế Tiếp (Next Priority Tasks) 📌
> **Plan chi tiết việc còn tồn:** `docs/plans/2026-10-16-remaining-bugfix-plan.md` (Phase A–F, re-check code 16/10; nghiệp vụ đổi/trả đã chốt; 1 câu chờ chốt: trả hàng khi đơn gốc còn nợ).
- [x] Vá trần giá trả hàng loại trừ ship/ví (cả `create_order_return` lẫn `returnable-items`), validate `InventoryAdjust` (null/mode/âm, giữ 404), backup an toàn `safe_sqlite_copy` cho reset/clear. Test: 633 passed.
- [x] Merge nhánh `fix/api-auth-lockdown` vào `main`.
- [x] Rebuild exe `POS_Mastercare.exe` trước khi triển khai máy khách.
- [ ] Thu hồi (`/revoke`) token bot Telegram cũ trên `@BotFather` và cấp lại token mới.
- [ ] Cấp lại Gemini API key mới trên Google AI Studio.
- [ ] Giai đoạn 2: Phân quyền chi tiết `require_permission` / `require_role("owner")` cho các hành động xóa hàng loạt và thay đổi thiết lập hệ thống.
