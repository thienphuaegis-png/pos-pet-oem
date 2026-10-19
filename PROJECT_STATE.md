# PROJECT STATE — POS Offline (Petcare & Retail)

**Checkpoint:** 2026-10-17 — Đồng Bộ Modal Xác Nhận Chuẩn POS, Phân Trang Server-Side & Chuẩn Hóa KPI Sàn TMĐT
**Server:** `http://127.0.0.1:8998` — FastAPI + SQLite (`data/pos.db`), bind `0.0.0.0`
**Working dir:** `D:/Projects_Hermes/pos-offline-petcare2`
**Remote:** `https://github.com/thienphuaegis-png/pos-pet-oem.git` (Branch: `main`)
**Version:** `v3.6.4` — Exe: `POS_Mastercare.exe` (31.2 MB) khớp commit `6b9476c`

---

## 1. Phiên Hiện Tại ✅ (2026-10-17)
- **Chuẩn Hóa Bảng Đơn Nhập Hàng & Đơn OEM 6 Cột — 1-Click Mở Thẳng Modal Chi Tiết (`purchases-and-oem-6col-click-to-detail`):**
  - Đơn Nhập Hàng NCC (Purchases): Rút gọn từ 12 cột còn 6 cột chuẩn không cuộn ngang; tích hợp thanh tiến trình thanh toán (Progress bar) % đã trả / còn nợ / mã phiếu chi Sổ Quỹ.
  - Xóa bỏ triệt để nút `💳 Chi Trả` trên từng dòng bảng nhập hàng để tránh vỡ giao diện và rối loạn nghiệp vụ chi nợ (thanh toán qua Sổ Quỹ hoặc phân hệ công nợ).
  - Tối ưu tương tác cả OEM và Nhập Hàng: Click trực tiếp vào dòng mở ngay Modal xem chi tiết phiếu đầy đủ thay vì trượt dòng mở rộng (Drawer) cồng kềnh; cột thao tác gồm 1 nút chính nổi bật (`Nhận Hàng` / `In Phiếu` / `Xem Phiếu`) + nút menu `⋮` 3 chấm đổ xuống.
  - Dropdown lọc thông minh: Thêm `filter-po-supplier` tự động gom danh sách NCC và đếm số đơn từng đối tác.
- **Tối Ưu Bảng Đơn Hàng OEM Chuẩn Đẹp (`oem-expandable-table-and-factory-filter`):**
  - Chuyển đổi bảng từ 12 cột cũ sang chuẩn 6 cột (Mã đơn, Đối tác & Kho, Tổng tiền, Đã thanh toán, Trạng thái, Thao tác).
  - Tích hợp thanh tiến trình % cọc (Progress Bar) màu cam/xanh trực quan; nút chính `Nhận hàng` / `Xem phiếu` kèm menu 3 chấm `⋮` mở 4 chức năng: Chi tiết, In phiếu kiểm, Sửa, Xóa.
  - Cơ chế dòng mở rộng (Expandable Row): Click dòng trượt mở Drawer hiển thị Người lập, Hạn giao, Sửa cuối, Bảng sản phẩm và Bảng đối chiếu vỏ chai/tem nhãn tại xưởng.
  - Dropdown lọc nhà máy động `oem-filter-factory` có đếm số đơn từng xưởng, giải quyết dứt điểm tình trạng 10+ xưởng làm rối màn hình.
- **Đồng Bộ Modal Xác Nhận & UI Toast Toàn Diện (`pos-unify-confirm-modal-and-ui-cleanup`):**
  - Nâng cấp `window.showConfirmModal`: Hỗ trợ phím ESC, chống click đúp (`disabled`), hiển thị ngắt dòng `whitespace-pre-line`.
  - Thay thế 100% `confirm()` / `alert()` thô trên toàn bộ mã nguồn (`app.js`, `marketplace.js`, `shifts.js`, `staff.js`, `pos.js`, `expense_requests.js`, `cashflow.js`, `spa.js`, `hotel.js`, `productions.js`).
- **Phân Trang Server-Side & Chuẩn Hóa KPI Sàn TMĐT (`marketplace-pagination-and-accurate-kpi`):**
  - `routers/marketplace.py`: Khử N+1 query bằng batch lookup chi tiết món; hỗ trợ `page`, `limit` (20/50/100) và tìm kiếm `q` (mã đơn, người mua, mã vận đơn).
  - Tách API độc lập `GET /api/marketplace/orders-kpi` tính toán chính xác tổng đơn, doanh thu, phí, sản phẩm bán, tỷ lệ ánh xạ trên toàn bộ CSDL.
  - `marketplace.js` & `templates/index.html`: Bổ sung thanh phân trang tiêu chuẩn và ô tìm kiếm 0ms cho cả Shopee và TikTok Shop.
- **Đóng gói & Phân phối:**
  - Bump phiên bản SemVer lên `v3.6.4` (`version.json`).
  - Build lại sạch `POS_Mastercare.exe` (31.2 MB).

---

## 2. Bằng Chứng Kiểm Thử (Verification) 🧪
- **Test Hồi Quy Phân Trang & KPI (`tests/test_marketplace_pagination_and_kpi.py`):** 1/1 passed.
- **Toàn bộ Test Suite:** 635 passed, 10 skipped, 0 failed.
- **Kiểm tra tính toàn vẹn Checkpoint (`tests/test_checkpoint_integrity.py`):** 4/4 passed.

---

## 3. Files Thay Đổi Chính
| Module / File | Trách nhiệm |
|---|---|
| `routers/marketplace.py` | Phân trang server-side, khử N+1 query, API KPI độc lập |
| `static/js/modules/marketplace.js` | Điều khiển phân trang, tìm kiếm 0ms và cập nhật KPI Shopee/TikTok |
| `static/js/app.js` & các modules | Nâng cấp showConfirmModal, dọn dẹp confirm()/alert() |
| `templates/index.html` | Thêm thanh phân trang và ô tìm kiếm đơn sàn Shopee/TikTok |
| `tests/test_marketplace_pagination_and_kpi.py` | Test case phân trang, batch item loading và KPI sàn |
| `version.json` & `POS_Mastercare.exe` | Bump v3.6.4 và rebuild bản chạy portable |

---

## 4. Việc Kế Tiếp (Next Priority Tasks) 📌
- [ ] **`spa-12-tasks` (ƯU TIÊN)**: Sửa bảng dịch vụ Spa — plan + bằng chứng + 6 câu hỏi chờ chốt tại `docs/plans/2026-10-18-spa-12-tasks.md`. Phase 1 (tiền/kho/báo cáo) làm được ngay, không cần chờ câu hỏi.
- [ ] `ecomm-sync-shopee-tiktok`: Tự động trừ tồn kho POS & Ghi nhận Sổ Quỹ cho đơn sàn TMĐT (đã hoàn thành thiết kế Data Mapping & Brainstorming).
- [ ] `verify-server-tailscale-and-toggle`: Nghiệm thu thực tế trên máy chủ tiệm (chạy `CAP_NHAT_1_CHAM.bat`, toggle module, kiểm tra Funnel 4G).
- [ ] Thu hồi (`/revoke`) token bot Telegram cũ trên `@BotFather` và cấp lại token mới.
- [ ] Cấp lại Gemini API key mới trên Google AI Studio.
