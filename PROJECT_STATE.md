# PROJECT STATE — POS Offline (Petcare & Retail)

**Checkpoint:** 2026-10-11 — Đổi/Trả Hàng Toàn Diện, Tách Quà Tặng 0 đ Trực Tiếp Trên Giỏ, Giữ Mẫu In Header & Đồng Bộ Tài Khoản VietQR Theo Phương Thức Thanh Toán
**Server:** `http://127.0.0.1:8000` / `http://127.0.0.1:8998` — FastAPI + SQLite (`data/pos.db` & `C:/POS`)
**Working dir:** `D:/Projects_Hermes/pos-offline-petcare2` & Sync to `C:/POS`
**Remote:** `https://github.com/thienphuaegis-png/pos-pet-oem.git` (Branch: `main`)
**Archive Log:** `docs/archive/STATE_2026_09.md`

---

## 1. Phiên Hiện Tại ✅ (2026-10-11)
- **Đổi Hàng & Trả Hàng (Return & Exchange) Chuẩn Bán Lẻ (`database.py`, `routers/pos.py`, `templates/index.html`, `static/js/modules/productions.js`):**
  - Tạo bảng `order_returns` và `order_return_items`, bảo toàn hóa đơn gốc (`orders`), sinh mã chứng từ `RET-YYYYMMDD-xxxx`.
  - API tính SL khả dụng (`quantity_available`) và đơn giá net đã phân bổ giảm giá.
  - Xử lý đổi/trả trong 1 transaction an toàn: hoàn kho (tùy chọn), trừ kho món đổi mới, hạch toán thu/chi Sổ Quỹ hoặc cấn trừ công nợ/ví.
  - Giao diện modal 2 cột `#modal-order-return-exchange` trực quan, tự động tính bù trừ thu thêm hoặc hoàn trả.
- **Tách Dòng Sản Phẩm Làm Quà Tặng (0 đ) Tại Quầy (`static/js/pos.js`):**
  - Thêm nút `🎁 Tách tặng` khi SL $\ge 2$, sinh dòng quà tặng giá 0 đ với cờ `is_manual_gift: true` và badge `🎁 QUÀ TẶNG`.
  - Thêm nút `🔄 Gộp lại` để thu ngân hoàn tác đưa số lượng về dòng bán thường.
  - Chống quét trùng barcode gộp nhầm và bảo vệ không bị xóa bởi chương trình khuyến mãi tự động Mua X Tặng Y.
- **Sửa Lỗi In POS: Ưu Tiên Mẫu In Header & Đồng Bộ Tài Khoản Chuyển Khoản (`static/js/pos.js`, `routers/pos.py`):**
  - Giữ nguyên 100% mẫu in đã chọn trên dropdown `#pos-template-select` góc trên bên phải khi mở popup in (cả in tạm tính và thanh toán).
  - Khách trả Tiền Mặt: Ẩn mã VietQR ảo và số TK '0', hiển thị badge `💵 ĐÃ THANH TOÁN TIỀN MẶT`.
  - Khách Chuyển Khoản: Nạp đúng tài khoản thu ngân đang chọn tại `#pos-bank-account-select`, hiển thị đầy đủ ngân hàng, số TK thật và mã VietQR chuẩn.

- **Tự Động Đếm & Bump Phiên Bản Động (`version_helper.py`, `version.json`, `scripts/bump_version.py`, `server.py`):**
  - Khắc phục triệt để lỗi quên/sót bump phiên bản: `version_helper.py` tự động đếm commit ahead từ Git để cộng dồn vào patch version khi code tính năng mới mà chưa chạy bump thủ công.
  - Bổ sung `scripts/bump_version.py` hỗ trợ SemVer chuẩn (`--auto`, `--patch`, `--minor`, `--major`, `--tag`) tự động quét conventional commits và cập nhật changelog.
  - Bump phiên bản mốc lên `v3.6.0` đồng bộ toàn bộ tính năng lớn đã hoàn thiện.

---

## 2. Bằng Chứng Kiểm Thử (Verification) 🧪
- `tests/test_version_bump_and_ahead_counting.py`: **PASS 3/3**
- `tests/test_dynamic_version.py`: **PASS 5/5**
- `tests/test_order_return_exchange.py`: **PASS 9/9**
- `tests/test_pos_split_gift_item.py`: **PASS 2/2**
- `tests/test_pos_print_template_and_bank_sync.py`: **PASS 3/3**
- Playwright Browser Tests: Giỏ hàng hiển thị mượt mà 0 lỗi console, modal in khớp mẫu và tài khoản ngân hàng.

---

## 3. Files Thay Đổi Chính
| Module / File | Trách nhiệm |
|---|---|
| `database.py` | Schema `order_returns` và `order_return_items` |
| `routers/pos.py` | API endpoints đổi/trả hàng, kiểm tra `bank_account` theo phương thức thanh toán |
| `schemas.py` | Pydantic schemas cho đổi/trả hàng |
| `static/js/pos.js` | Tách dòng quà tặng, gộp lại, ưu tiên mẫu in header, chuẩn hóa VietQR theo cash/transfer |
| `static/js/modules/productions.js` | Modal đổi/trả 2 cột, chặn lỗi null innerHTML `renderPropsPanel` |
| `templates/index.html` | Modal `#modal-order-return-exchange` và nút gọi đổi/trả |
| `PROJECT_MAP.html` | Cập nhật Roadmap v5.1 lưu vết đầy đủ tính năng |

---

## 4. Việc Kế Tiếp (Next Priority Tasks) 📌
- [ ] Test thực tế in hóa đơn K80 & A4 trên máy in tại quầy.
- [ ] Kiểm tra báo cáo tổng hợp dòng tiền sau các giao dịch đổi/trả hàng.
- [ ] Tích hợp đồng bộ dữ liệu thời gian thực giữa quầy offline và Supabase Cloud.

