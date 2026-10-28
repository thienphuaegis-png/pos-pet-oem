# Thiết Kế Theo Dõi & Quản Lý Ví Spa (POS & Hồ Sơ Khách Hàng)

- **Mục tiêu:** Cho phép thu ngân đối soát nhanh lịch sử nạp/trừ ví Spa ngay tại POS và quản lý theo dõi số dư/lịch sử ví trong Hồ Sơ Khách Hàng.
- **Ngày:** 2026-09-24
- **Trạng thái:** Approved by User

---

## 1. Màn Hình POS (Thu Ngân)
- Nút `[👁️ Lịch sử ví]` cạnh số dư `💆 Ví Spa`.
- Modal `#modal-pos-wallet-history`: Gọi `GET /api/topup/history/{contact_id}`, hiển thị bảng biến động số dư (+nạp, -chi tiêu bill).

## 2. Phân Hệ Khách Hàng (Quản Lý)
- Bảng danh sách khách hàng (`tab-contacts`): Hiển thị cột Ví Spa.
- Modal `#modal-contact-detail`:
  - Thẻ thông tin: Hiển thị Số dư Ví Spa và Điểm tích lũy.
  - Bảng: Lịch Sử Biến Động Ví Spa (thời gian, loại GD, số tiền, số dư sau, ghi chú).

## 3. Backend API
- Cập nhật `GET /api/contacts/{id}` trả về `spa_wallet_balance`, `points`, và `spa_wallet_history`.
