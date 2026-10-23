# PROJECT STATE — POS Offline (Petcare & Retail)

**Checkpoint:** 2026-10-23 — AI Hub Thích Ứng Vai Trò, Tồn Tối Thiểu min_stock & Lời Nhắc Việc Ca
**Lịch sử checkpoint:** `docs/checkpoints/CHECKPOINT_2026_10_23.md`
**Active Plan:** `docs/plans/plan_oem_draft_and_ai_auto_restock.md`
**Server:** `http://127.0.0.1:8998` — FastAPI + SQLite (`data/pos.db`), bind `0.0.0.0`
**Working dir:** `D:/Projects_Hermes/pos-offline-petcare2`
**Remote:** `https://github.com/thienphuaegis-png/pos-pet-oem.git` (Branch: `main`)
**Version:** `v3.6.8` — Exe: `POS_Mastercare.exe` khớp database & code mới nhất

---

## 1. Phiên Hiện Tại ✅ (2026-10-23)
- **Tác Nhân AI Thích Ứng Vai Trò (Role-Adaptive AI Hub):**
  - Nhận diện vai trò đăng nhập (`warehouse`, `accountant`, `cashier`, `owner`).
  - Phân hệ Thủ Kho / OEM (Phụng): Ẩn tiền két/doanh số, hiện hàng sắp hết tồn kho, danh sách lô hàng đang về kèm tên NCC và nút 1-chạm nhập kho.
- **Tồn tối thiểu (`min_stock`) & Cảnh báo đặt hàng:**
  - Cột `min_stock` trong `products`, ô nhập trên modal thêm/sửa, popup xem hàng sắp hết `#modal-ai-low-stock`.
- **Quản lý lời nhắc việc ca (`staff_reminders`):**
  - CRUD lời nhắc việc trong ca (`POST`, `PATCH /toggle`, `DELETE`), giờ hẹn và ưu tiên.
- **Chuẩn hóa cây thư mục dự án (Root Guard):**
  - Chuyển toàn bộ checkpoints vào `docs/checkpoints/`.
  - Gom toàn bộ 26 plan cũ vào `docs/plans/archive/`.
  - Chuyển file mẫu Excel vào `data/import_samples/`.
  - Xóa triệt để các file DB 0-byte rác ở gốc repo.

---

## 2. Bằng Chứng Kiểm Thử (Verification) 🧪
- `tests/test_ai_byok_staff.py`: 1/1 passed.
- `tests/test_pay_single_order_debt.py`: 3/3 passed.
- `tests/test_checkpoint_integrity.py`: 4/4 passed.
- `arch-map`: Sinh sơ đồ Dataflow chuẩn Showcase tại `PROJECT_DATAFLOW.html`.

---

## 3. Files Thay Đổi Chính
| Module / File | Trách nhiệm |
|---|---|
| `docs/checkpoints/` | Lưu trữ toàn bộ các mốc checkpoint lịch sử |
| `docs/plans/archive/` | Lưu trữ 26 kế hoạch đã hoàn thành |
| `static/js/clientlog.js` | Hộp đen bắt chi tiết mã lỗi HTTP kèm `detail="..."` |
| `PROJECT_STATE.md` | Hot-state đồng bộ cho phiên làm việc tiếp theo |

---

## 4. Việc Kế Tiếp (Next Priority Tasks) 📌
- [x] Bổ sung Nút "Lưu Đơn Nháp (DRAFT)" cho Phân Hệ OEM (`tests/test_oem_draft_mode.py` pass).
- [x] Chức Năng AI Tự Động Tạo Đơn Nháp 1-Chạm (`tests/test_ai_quick_create_draft.py` pass).
- [x] Phân Hệ "Phiếu Yêu Cầu Nhập Hàng" Bảo Mật Ẩn Danh NCC (`tests/test_purchase_request_masking.py` pass).
- [x] Phân Biệt Đối Tác Xưởng OEM & NCC Nhập Hàng Tự Động (`tests/test_ai_oem_factory_recognition.py` pass).
- [x] Tạo Nháp Hàng Loạt Theo NCC & Cập Nhật Tồn Dự Kiến Ngay Sau Khi Lập Đơn (`tests/test_ai_batch_drafts_and_projected_stock.py` pass).
- [x] Tab "Yêu Cầu Đặt Hàng" (Purchase Requisition) Dành Riêng Cho Nhân Viên Cửa Hàng & Spa (`purchase_requests.js`, UI 2 cột).
- [x] Định Dạng Tiền Tệ Real-time Có Dấu Chấm Phân Cách Cho Modal Thanh Toán Nợ NCC & Hẹn Trả Nợ (`#cfd-pay-amount`, `#plan-amount`, `#cfd-pay-order-amount`).
- [x] Sửa Lỗi Nhân Bản Dòng Đơn PO Khi Chuyển Từ Phiếu Yêu Cầu (`tests/test_fix_duplicate_po_lines_and_ai_hub.py` pass).
- [x] Đẩy Trực Tiếp Phiếu Yêu Cầu Nhập Hàng Chờ Duyệt Ra Màn Hình Tác Nhân AI Hub Kèm Nút 1-Chạm Lên PO.
- [x] Đồng Bộ Popup Xác Nhận Bằng Modal POS Chuẩn Thay Vì confirm() Trình Duyệt.
- [x] Thu Gọn Widget Bóc Tách Chứng Từ AI (Compact Slim Card) Nhường Không Gian Cho Trung Tâm Nghiệp Vụ.
- [x] Bổ Sung Nút 1-Chạm Chốt Đơn Đặt Hàng OEM Từ Bản Nháp (Đổi Nút "Nhận Hàng" Thành "Chốt Đơn" Cho Đơn DRAFT, `tests/test_oem_draft_confirm_to_order.py` pass).
- [ ] Nghiệm thu thực tế trên máy chủ tiệm (`verify-server-tailscale-and-toggle`).
