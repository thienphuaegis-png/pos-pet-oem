# CHECKPOINT 2026-09-30 (Handoff cho ngày mai)

## Trạng thái phiên làm việc
- **Repository:** `thienphuaegis-png/pos-pet-oem`
- **Branch:** `main` (Working tree clean, đã push lên GitHub)
- **Latest Commit:** `063c0f2 fix(purchases): dynamic lookup item_name and unit from products/ingredients table for existing purchase details`
- **Bản Portable:** `POS_Mastercare.exe` (7.8 MB) đã build mới nhất khớp commit `063c0f2`

## Các tính năng & bản vá đã hoàn tất hôm nay:
1. **Phân tách công nợ NCC 2 quỹ riêng biệt:**
   - Quỹ Công Ty (`initial_debt_company`) & Quỹ Cá Nhân (`initial_debt_personal`).
   - Cấn trừ nợ đầu kỳ tự động khi thanh toán nợ NCC (`routers/oem.py`).
   - Đồng bộ hiển thị nợ 2 quỹ trên toàn bộ các tab: Đối tác, Dòng tiền & Nợ NCC, và file xuất Excel (`routers/partners.py`, `contacts.js`, `cashflow.js`).
   - Modal thêm/sửa đối tác mới chia 2 khối quỹ màu xanh dương (cty) và tím (cá nhân).
2. **Kịch bản cập nhật 1-chạm (`CAP_NHAT_1_CHAM.bat`):**
   - Tự động quét và kill tận gốc mọi tiến trình chạy ngầm (`POS_Mastercare.exe`, `python.exe`, `pythonw.exe`, `ngrok.exe`, `cloudflared.exe`) và giải phóng cổng 8998/8999 trước khi pull.
   - Tự nhận diện Git mini (`git_tool\cmd\git.exe`) và nạp Deploy Key SSH (`deploy/id_pos_shop`).
3. **Đồng bộ UI Modal xác nhận nhập hàng (`purchases.js`):**
   - Thay thế toàn bộ popup `confirm()` thô của trình duyệt bằng `customConfirm` bo góc hiện đại, icon 📦 chuẩn thương hiệu.
4. **Sửa triệt để lỗi import Excel bị lấy mã đè lên tên:**
   - Thuật toán nhận diện cột 2 lớp (`exact match` ưu tiên trước `partial match`) cho cả 3 bộ import: Nguyên liệu, Hàng hóa, Định lượng BOM.
   - Không còn tình trạng cột "Mã nguyên liệu" dính chữ "nguyên liệu" bị nhận nhầm thành cột Tên.
5. **Đồng bộ động tên và thành tiền trong phiếu nhập kho đã tạo:**
   - API chi tiết phiếu (`/api/purchases/{code}`) và bản in (`/print-checklist`) tự động `LEFT JOIN` lấy tên nguyên liệu/hàng hóa mới nhất từ bảng master.
   - Sửa hiển thị thành tiền từng dòng trong popup chi tiết nhập kho.

## Kiểm thử:
- `pytest tests/test_supplier_debt_split.py tests/test_rbac_and_supplier_dedup.py` PASS 7/7.

## Lưu ý ngày mai:
- Máy phụ tại `F:\New folder`: chỉ cần chạy `CAP_NHAT_1_CHAM.bat` rồi bấm `Ctrl + F5` là nhận trọn vẹn toàn bộ cập nhật.
