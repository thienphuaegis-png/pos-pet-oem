# Hướng dẫn sử dụng POS PET OEM

Tài liệu này dành cho người trực tiếp dùng máy ở tiệm. Không cần biết kỹ thuật.

---

## 1. Cài đặt lần đầu (chỉ làm 1 lần, trên MÁY CHỦ)

**Máy chủ** là máy tính chính ở tiệm — máy luôn bật trong giờ làm việc. Các máy khác và điện thoại sẽ kết nối vào máy này.

1. Mở thư mục `deploy`
2. Bấm **chuột phải** vào file `CAI_DAT_MAY_CHU.bat`
3. Chọn **Run as administrator** (Chạy với quyền quản trị)
4. Nếu Windows hỏi "Bạn có cho phép ứng dụng này thay đổi thiết bị?" → chọn **Yes**
5. Đợi. Lần đầu có thể mất 5–15 phút vì máy phải tải Python và các thư viện.
6. Khi thấy dòng **CAI DAT XONG - SERVER DANG CHAY** là được.

Màn hình cuối sẽ hiện địa chỉ POS, ví dụ `http://192.168.1.50:8999`. **Ghi lại địa chỉ này.**

> **Nếu báo lỗi:** chụp màn hình gửi cho người quản trị hệ thống. Đừng tự sửa.

---

## 2. Dùng hằng ngày

Bật máy chủ lên là POS **tự chạy**, không cần làm gì.

Trên máy chủ: bấm icon **POS PET OEM** trên màn hình Desktop.

Đăng nhập lần đầu:

| | |
|---|---|
| Tên đăng nhập | `admin` |
| Mật khẩu | `admin123` |

> ⚠️ **Đổi mật khẩu ngay sau lần đăng nhập đầu tiên.** Mật khẩu mặc định ai cũng biết. Vào mục Nhân viên → sửa tài khoản admin → đổi mật khẩu.

---

## 3. Thêm máy tính khác trong tiệm

Trên máy tính muốn thêm:

1. Chép thư mục `deploy` sang máy đó (bằng USB hoặc mạng nội bộ)
2. Bấm đúp file `CAI_MAY_CON.bat`
3. Đợi khoảng 5–20 giây, máy sẽ tự tìm ra máy chủ
4. Xong — có icon **POS PET OEM** trên Desktop

Máy con **không cần cài gì thêm**, không cần cập nhật. Toàn bộ chương trình nằm ở máy chủ.

> **Nếu báo "KHONG TIM THAY MAY CHU":** kiểm tra máy chủ đã bật chưa, và hai máy có cùng mạng WiFi/dây mạng không. Nếu vẫn không được, nhập tay địa chỉ đã ghi ở bước 1.

---

## 4. Thêm điện thoại / máy tính bảng

1. Mở file `deploy\QR_POS.png` trên máy chủ
2. **In ra và dán ở quầy**
3. Điện thoại dùng camera quét mã QR → mở ra là dùng được

Dùng được cả Android lẫn iPhone. Điện thoại phải nối cùng WiFi của tiệm.

> Khi đổi nhà mạng hoặc đổi router, địa chỉ có thể đổi → chạy lại `CAI_DAT_MAY_CHU.bat` để sinh mã QR mới.

---

## 5. Khi được báo có bản cập nhật

Người quản trị sẽ nhắn: "có bản cập nhật mới".

1. **Báo nhân viên tạm ngừng bán trong 2 phút**
2. Trên **máy chủ**, bấm icon **CẬP NHẬT POS** trên Desktop
3. Đợi tới khi thấy **CAP NHAT XONG - SERVER DANG CHAY**
4. Báo nhân viên dùng lại

Dữ liệu (khách hàng, hóa đơn, tồn kho) **không bị mất** khi cập nhật. Chương trình tự sao lưu trước khi cập nhật.

> **Nếu báo lỗi:** dữ liệu vẫn an toàn, chương trình tự quay về bản cũ. Gọi người quản trị, đừng bấm lại nhiều lần.

---

## 6. Các tình huống thường gặp

### Mất điện, máy tắt đột ngột
Bật máy lên là xong. POS tự chạy lại, dữ liệu không mất.

### Máy con không vào được POS
Theo thứ tự:
1. Máy chủ đã bật chưa?
2. Máy con có cùng WiFi/mạng với máy chủ không?
3. Chạy lại `CAI_MAY_CON.bat` trên máy con.

### POS chạy chậm
Khởi động lại máy chủ. Nếu vẫn chậm, gọi người quản trị.

### Muốn quay lại dữ liệu của hôm trước
Gọi người quản trị. **Đừng tự chép file.** Các bản sao lưu nằm ở `data\backups\`.

---

## 7. Sao lưu dữ liệu

Chương trình tự sao lưu mỗi lần cập nhật, lưu ở `data\backups\`.

**Nên làm thêm:** mỗi tuần chép thư mục `data` sang USB hoặc ổ cứng ngoài. Máy tính hỏng là mất hết nếu không có bản sao ngoài máy.

---

## 8. Gọi ai khi có sự cố

Khi gọi, chuẩn bị sẵn:
- Chụp màn hình lỗi
- Mô tả vừa làm gì trước khi lỗi xảy ra
- Máy chủ hay máy con

---

## Phụ lục: hỗ trợ từ xa (không bắt buộc)

Nếu muốn người quản trị xem/sửa từ xa mà không cần tới tiệm, chạy `deploy\CAI_TAILSCALE.bat` và đăng nhập bằng tài khoản họ cung cấp.

Không cài cũng không sao — POS vẫn chạy bình thường. Tiệm mất internet vẫn bán hàng được, vì POS chạy hoàn toàn trong mạng nội bộ.

<!-- kiem tra duong cap nhat 15:02:54 -->
