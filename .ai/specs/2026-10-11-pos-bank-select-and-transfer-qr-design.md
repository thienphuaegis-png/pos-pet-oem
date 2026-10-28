# POS: chọn ngân hàng + sửa chuyển khoản hiển thị tiền mặt / mất QR

## Vấn đề (đã verify trên data/pos.db + code)
1. `setPaymentMethod('cash')` gán `tab.account_id` = két tiền mặt; khi đổi sang Chuyển khoản, dropdown "TK nhận" liệt kê cả két và giữ chọn két (`pos.js:1469`, `:1563`).
2. Tài khoản bank thiếu dữ liệu (id 2: bank_name="Ngân hàng", số TK rỗng; id 11: NULL). `resolveOrderBankAccount` fallback `account_number || acc.code` → URL VietQR sai → không có QR.
3. Ô "Tên Ngân Hàng" (`templates/index.html:11904`) là input gõ tay → sai mã VietQR.
4. Backend lưu `method='cash'` cứng — đã fix ở `3dcab97` nhưng `POS_Mastercare.exe` (build 2026-10-09) chưa chứa → máy chủ vẫn chạy code cũ.

## Thiết kế
- **`static/js/banks.js`** (mới): `VIETQR_BANKS = [{code, name}]` ~25 NH phổ biến, mã lấy từ `api.vietqr.io/v2/banks` (transferSupported=1). Hàm `fillBankSelect(selectEl, selectedCode)` và `isVietQRBankCode(code)`. Nạp ở `index.html` + `pos.html` trước `pos.js`/`productions.js`.
- **Form tài khoản**: `acc-bank-name` đổi `<input>` → `<select>`; mở form gọi `fillBankSelect`. Giá trị cũ không khớp mã → option rỗng "-- Chọn ngân hàng --".
- **Cài đặt VietQR**: `comp-bank-code` dùng `fillBankSelect` thay list cứng 13 option.
- **POS dropdown TK nhận**: chỉ liệt kê `bank`/`ewallet`; nếu `tab.account_id` không thuộc list → chọn TK bank đầu tiên.
- **resolveOrderBankAccount**: bỏ fallback `acc.code`/`acc.name` vào số TK/tên NH.
- **Chặn submit**: method transfer/card/wallet mà TK nhận thiếu `account_number` hoặc `bank_name` không hợp lệ → alert "Vào Sổ quỹ > Tài khoản để chọn ngân hàng và nhập số TK".
- **Exe**: rebuild `POS_Mastercare.exe` sau khi sửa, commit cùng.

## Ngoài scope
- Search trong dropdown NH (thêm khi > 40 NH).
- Fetch list NH online.
- Tự sửa dữ liệu TK id 2/11 (anh tự nhập số TK thật).
