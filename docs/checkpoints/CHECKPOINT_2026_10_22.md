# CHECKPOINT 2026-10-22 (Handoff)

## Trạng thái phiên làm việc
- **Repository:** `thienphuaegis-png/pos-pet-oem`
- **Branch:** `main` (commit hiện tại + cập nhật mới)
- **Version:** `v3.6.5`
- **Bản Portable:** `POS_Mastercare.exe` (31.2 MB) đã rebuild mới nhất

## Các tính năng & bản vá đã hoàn tất hôm nay:
1. **Chọn Tài Khoản & Ngày Chi Khi Trả Nợ Đơn Hàng Cụ Thể (`pay-single-order-debt-account`):**
   - Bổ sung ô chọn tài khoản thanh toán `#cfd-pay-order-account` và ngày chi `#cfd-pay-order-date` vào popup `modal-cfd-pay-order`.
   - Logic `cashflow.js` tự động nạp tài khoản phù hợp theo nguồn quỹ (Quỹ Cty / Quỹ Cá Nhân).
   - Backend `routers/oem.py:1284` ghi nhận chính xác tài khoản xuất chi, ngày chi thực tế và `created_by` vào bản ghi Sổ Quỹ `cashbook`.
   - Test suite: `tests/test_pay_single_order_debt.py` (3/3 passed).

2. **Cấu Hình AI Cá Nhân Cho Nhân Viên (BYOK - Bring Your Own Key):**
   - Bổ sung 2 cột `ai_api_key` và `ai_model` vào bảng `staff`, migration tự động trong `database.py`.
   - Thêm 2 endpoints: `GET /api/auth/my-ai-config` và `POST /api/auth/my-ai-config` để nhân viên tự xem và lưu key riêng.
   - Hàm điều phối AI `get_gemini_config(user)` trong `routers/ai_assistant.py` ưu tiên key cá nhân của nhân viên, tự động fallback về key của tiệm nếu để trống (0đ chi phí cho shop, bảo mật dữ liệu).
   - Thêm nút và modal `modal-my-ai-config` tại tab Tác Nhân AI, hỗ trợ kiểm tra key trực tiếp.
   - Test suite: `tests/test_ai_byok_staff.py` (1/1 passed).

3. **Khắc Phục Sự Cố Xung Đột Cổng & Database Cũ:**
   - Phát hiện và tắt tiến trình cũ PID 14852 chạy từ `C:\POS` (thiếu migration `ticket_date` khiến tab Spa văng lỗi 500 JSON.parse).
   - Đưa hệ thống trở lại máy chủ chuẩn `D:\Projects_Hermes\pos-offline-petcare2` chạy trên database thật 9.5MB.

## Kiểm thử:
- Test suite tổng hợp liên quan: Passed 100%.
- Kiểm tra tính toàn vẹn Checkpoint (`tests/test_checkpoint_integrity.py`): 4/4 passed.

## Việc kế tiếp:
- Xóa sạch thư mục `C:\POS` và hủy Scheduled Task cũ.
- Triển khai trang đáp (Landing Page) AI Copilot Hub chào ca và nhắc việc theo vai trò.
- Triển khai trừ kho và ghi nhận Sổ Quỹ cho đơn sàn Shopee / TikTok Shop.
