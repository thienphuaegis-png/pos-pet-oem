# PROJECT STATE — POS Offline (Petcare & Retail)

**Checkpoint:** 2026-09-27 — Hoàn thiện Dải Lịch Ngang Spa, Sub-tab Hóa Đơn Spa, Cấn Trừ Ví Một Phần & Phân Tách Dòng Tiền Topup  
**Server:** `http://127.0.0.1:8999` — FastAPI + SQLite (`data/pos.db`)  
**Working dir:** `D:/Projects_Hermes/pos-offline-petcare2`  
**Archive Log:** `docs/archive/STATE_2026_09.md` (lịch sử chi tiết các phiên trước)

---

## 1. Phiên Hiện Tại ✅ (2026-09-27)
- **Dải Lịch Ngang 7 Ngày & Bộ Lọc Ca Trong Ngày (`spa.js`):** Chuyển ngày linh hoạt, lọc nhanh Chưa Về / Đã Về, đồng bộ cuộc gọi thông minh cho khách nhiều thú cưng.
- **Sub-tab Hóa Đơn Spa Chuyên Biệt (`tab-orders`):** Bảng 12 cột đầy đủ nguồn thu dịch vụ, bộ lọc thời gian/trạng thái/thanh toán, hỗ trợ in lại K80 và mở lại vé đã đóng.
- **Cơ Chế Cấn Trừ Sạch Ví (Lựa chọn A) & An Toàn Số Dư:** Đủ tiền tự động trừ ví; thiếu tiền cấn trừ hết ví + thu ngoài phần thiếu; ghi đúng phần thu ngoài vào Sổ Quỹ. Hoàn tiền ví khi xóa đơn.
- **Phân Tách Dòng Tiền Topup & POS Bán Lẻ:** Gỡ bỏ trừ ví Spa khỏi quầy bán lẻ hàng hóa. Nạp ví in phiếu thu K80 ngầm không xem trước.
- **Nhận Diện Khách Hàng Ở Sổ Quỹ:** Liên kết `COALESCE` Tên + badge SĐT ở Sổ Quỹ và Drawer đối soát nguồn gốc thu/chi (read-only).

---

## 2. Bằng Chứng Kiểm Thử (Verification) 🧪
- `tests/test_k80_discount.py`: **PASS 2/2** (In hóa đơn & discount tags).
- `tests/test_spa_wallet_split_payment.py`: **PASS** (Cấn trừ ví một phần & liên thông quỹ).
- `tests/test_spa_render.js`: **PASS 9/9** (Render bảng Spa, dải lịch & tối ưu DOM).
- `tests/test_html_integrity.py`: **PASS 3/3** (Toàn vẹn DOM 12 tabs chính).
- Cú pháp JS: `node -c static/js/app.js && node -c static/js/pos.js && node -c static/js/modules/spa.js`: **PASS**.

---

## 3. Files Thay Đổi Chính
| Module / File | Trách nhiệm |
|---|---|
| `routers/pos.py` | Hoàn tiền ví khi hủy đơn; gỡ trừ ví khỏi POS bán lẻ |
| `routers/partners.py` | Cấn trừ ví một phần đơn lẻ & hàng loạt; KPI `checked_out_today` |
| `routers/cashbook.py` | Query `COALESCE` hiển thị Tên + SĐT đối tác vào sổ quỹ |
| `templates/index.html` | Dải lịch ngang, sub-tab hóa đơn Spa, customConfirm danger |
| `static/js/modules/spa.js` | Dải lịch 7 ngày, lọc ca trong ngày, cấn trừ sạch ví, đồng bộ cuộc gọi |

---

## 4. Việc Kế Tiếp (Next Priority Tasks) 📌
- [ ] `bill-4`: Di chuyển bảng quản lý Gói Topup vào Tab Bảng Giá (`tab-price-lists`) dạng sub-tab.
- [ ] `bill-5`: Kiểm tra và chuẩn hóa mẫu in K80/A4 B2B trên các trình duyệt.
- [ ] `sys-1`: Bảng Quản Lý Hotel (Khách Sạn Chó Mèo) thiết kế schema & layout.
- [ ] `sys-5`: Đóng gói file chạy EXE độc lập (`build_exe.bat`) và test trên Windows sạch.
- [ ] `auth-1`: Quản lý nhân viên (Cài Đặt > Nhân Viên) và phân quyền ca làm việc.
