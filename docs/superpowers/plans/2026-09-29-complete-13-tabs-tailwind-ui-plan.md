# Plan: Hoàn Thiện Nâng Cấp 13 Tab Còn Lại Sang Tailwind UI & Lucide Icons

> **For agentic workers:** REQUIRED SUB-SKILL: Use executing-plans.

**Goal:** Hiện đại hóa toàn bộ 13 tab còn lại trong `templates/index.html` và các file module giao diện: thay toàn bộ Unicode emoji bằng Lucide vector SVG (100% offline), chuẩn hóa khối Card, Input, Button, Badges và Tables theo phong cách Tailwind UI sắc nét.

## Phân Chia 4 Giai Đoạn (4 Batches)

- [x] **Batch 1: Dịch vụ & Giao dịch trực tiếp (Tabs: Hóa đơn, Dịch vụ Spa, Khách sạn Hotel)**
  - `tab-orders` (Hóa đơn): Sub-tabs bán lẻ / spa / hotel, bộ lọc ngày & trạng thái, bảng danh sách.
  - `tab-pet-services` (Spa & Grooming): KPI cards, sub-tabs dịch vụ / bảng giá cân nặng / thợ spa, dải lịch ngang date strip.
  - `tab-hotel` (Khách sạn): 5 KPI buồng phòng, 4 chế độ xem (lưới, bảng, gantt, cấu hình), nút nhận phòng.

- [x] **Batch 2: Hàng hóa & Sản xuất (Tabs: Bảng giá, Kho hàng, Nhập hàng, Gia công OEM)**
  - `tab-price-lists`: Sub-tabs bảng giá sỉ/lẻ, khuyến mãi coupon, gói nạp ví điểm.
  - `tab-inventory`: Quản lý danh mục hàng hóa, bảng tồn kho, cảnh báo hết hàng, điều chỉnh kho.
  - `tab-purchases`: Lập đơn nhập hàng, danh sách phiếu nhập, nhà cung cấp.
  - `tab-oem`: Lệnh sản xuất, công thức định mức BOM, lịch sử xuất nhập nguyên phụ liệu.

- [x] **Batch 3: Tài chính & Khách hàng (Tabs: Đối tác & Khách hàng, Sổ quỹ, Dòng tiền & Công nợ)**
  - `tab-contacts`: Phân loại khách lẻ / sỉ / đại lý, danh sách thú cưng, lịch sử tích điểm.
  - `tab-cashbook`: Sổ quỹ thu chi tiền mặt, tài khoản ngân hàng, phiếu thu / chi.
  - `tab-cashflow-debts`: Dòng tiền tổng hợp, theo dõi nợ nhà cung cấp và nợ khách hàng.

- [x] **Batch 4: Vận hành & Cấu hình quản trị (Tabs: Báo cáo, Ca làm việc, Cài đặt hệ thống)**
  - `tab-reports`: Báo cáo biểu đồ doanh thu, cơ cấu mặt hàng, lợi nhuận gộp.
  - `tab-shifts`: Quản lý ca làm việc, lịch sử đóng/mở ca, đối soát tiền mặt cuối ca.
  - `tab-settings`: Cài đặt thông tin tiệm, cấu hình in ấn A4/K80, phân quyền nhân viên & bảo mật.

## Verification
- Chạy toàn bộ test suite: `DATABASE_URL="" pytest tests/`
- Đảm bảo tất cả DOM container và event handler không bị ảnh hưởng.
- Commit và push git sau mỗi Batch.
