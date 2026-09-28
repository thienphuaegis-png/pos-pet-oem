# Thiết Kế: Tách Bảng Đối Tác, Thêm Tab Dịch Vụ & Thú Cưng, Sửa Hiển Thị OEM

1. Tách Bảng Đối Tác (Khách Hàng vs Nhà Cung Cấp):
   - Khách Hàng: Mã KH, Họ Tên, SĐT, Địa Chỉ, Nhóm KH, Thú Cưng, Công Nợ Phải Thu, Thao Tác.
   - Nhà Cung Cấp: Mã NCC, Tên Đơn Vị, SĐT, Địa Chỉ, Nợ Cty (Có VAT), Nợ Cá Nhân (Ko VAT), Tổng Nợ, Thao Tác.

2. Thêm Tab Sidebar "Dịch Vụ & Thú Cưng" (`tab-pet-services`):
   - Danh bạ thú cưng toàn hệ thống.
   - Đặt chỗ & Hóa đơn dịch vụ (khung layout chuẩn bị cho nhiều loại dịch vụ).

3. Sửa Hiển Thị Thanh Toán Đợt 1 / Đợt 2 của Đơn OEM:
   - Nợ = 0: Badge xanh lá 'Đã thanh toán đủ (0 đ)', không còn chữ đỏ.
   - Trả 1 phần: Đã trả X% (xanh), Còn thiếu Y% (cam).
   - Chưa trả: Nợ 100% (đỏ).
