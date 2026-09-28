# Kế Hoạch Thực Hiện: Phụ Thu Checkbox, Bán Hàng POS Tại Cột Tiền, Read-Only Lịch Sử & Reset Số Phiếu Theo Ngày

**Đặc tả:** `docs/superpowers/specs/2026-09-25-spa-surcharges-checkbox-pos-items-and-daily-ticket-reset-design.md`

---

## Task 1: Backend Reset Số Phiếu Theo Ngày (`ticket_number`)
- [ ] Chỉnh sửa `routers/partners.py`:
  - Trong `create_pet_service_ticket`: Thay `random.randint(5, 10)` thành `1`.
  - Trong `create_pet_services_batch`: Thay `random.randint(5, 10)` thành `1`.
- [ ] Chạy test `tests/test_spa_batch_intake.py` xác nhận reset theo ngày.

## Task 2: Dọn Dẹp Cột 3 (Lịch Sử Spa Thành Read-Only)
- [ ] Chỉnh sửa `renderCustomerSpaHistory` trong `static/js/app.js`:
  - Xóa bỏ cụm 3 nút `[🖨️ In Phiếu Nhận]`, `[🧾 In Hóa Đơn Trả]`, `[📋 Dùng Lại Form]`.
  - Giữ lại đầy đủ các thông tin chi tiết của lần làm trước để nhân viên dễ dàng tra cứu.

## Task 3: Chuyển Ô Bán Hàng Kèm Theo Sang Cột 2 & Checkbox Phụ Thu
- [ ] Cập nhật `templates/index.html`:
  - Xóa cụm bán hàng ở Cột 1.
  - Tại Cột 2:
    - Thay 5 ô input số tiền phụ thu bằng cụm Checkbox:
      - `[ ] 🦷 Đánh răng (+30.000 đ)`
      - `[ ] ✂️ Cắt tạo kiểu NT (+50.000 đ)`
      - `[ ] 🌀 Gỡ rối lông (+40.000 đ)`
      - `[ ] 🚚 Đưa đón (+50.000 đ)`
      - `[ ] 🎁 Tip thợ (+ ô nhập tiền)`
      - `[ ] 🏷️ Phụ thu khác (+ ô nhập tiền)`
    - Đặt khối `🛒 Mua Sản Phẩm POS Kèm Theo` tại Cột 2 ngay phía trên bảng tổng hợp tiền.
    - Hiển thị bảng kê chi tiết tại Cột 2: Dịch vụ chính, Phụ thu, Sản phẩm POS, Tổng cộng thanh toán.

## Task 4: Cập Nhật Logic JS Tính Toán & Checkbox
- [ ] Cập nhật `static/js/app.js`:
  - Hàm `onSvcSurchargeCheckboxChanged()`: Đọc các checkbox đã tick, lấy giá cấu hình, tính tổng phụ thu.
  - Cập nhật `autoCalculateServicePrice()`: Đồng bộ Tiền Dịch Vụ + Tiền Phụ Thu Checkbox + Tiền Hàng Hóa POS.
  - Cập nhật `submitCreateServiceTicket`: Lưu các phụ thu và sản phẩm bán kèm vào phiếu.

## Task 5: Kiểm Thử Toàn Diện
- [ ] Chạy `tests/test_html_integrity.py`.
- [ ] Chạy `tests/test_spa_render.js`.
- [ ] Chạy `PYTHONPATH=. uv run pytest`.
- [ ] Cập nhật `PROJECT_STATE.md`.
