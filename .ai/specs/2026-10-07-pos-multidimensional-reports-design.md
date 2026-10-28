# Thiết Kế: Hệ Thống Báo Cáo Kinh Doanh Đa Chiều & Dashboard Biểu Đồ Trực Quan (Multi-Dimensional Reporting & Visual Analytics)

**Ngày:** 2026-10-07  
**Trạng thái:** Chờ duyệt thiết kế  
**Mục tiêu:** Xây dựng module Báo Cáo Kinh Doanh toàn diện tại tab `tab-reports` trên Web POS, cho phép phân tích dữ liệu đa chiều kèm biểu đồ trực quan (Dashboard), mốc thời gian linh hoạt, dòng tiền thanh toán, nhân viên, phân loại Hàng hóa vs Dịch vụ, và Top mặt hàng bán chạy.

---

## 1. Cấu Trúc Toàn Bộ Hệ Thống Tab Báo Cáo (5 Tabs)

```text
[ 📊 Tổng Quan & Biểu Đồ ]  [ 💳 Doanh Thu & Thanh Toán ]  [ 📦 Hàng Hóa vs 💆 Dịch Vụ ]  [ 👤 Báo Cáo Nhân Viên ]  [ 🏆 Top Bán Chạy ]
```

---

## 2. Kiến Trúc Giao Diện (UI/UX)

### 2.1. Khối Header & Bộ Lọc Thời Gian Cố Định Trên Cùng (Sticky Filter Bar)
Áp dụng xuyên suốt cho tất cả 5 tab báo cáo con:
- **Nút chọn nhanh kỳ báo cáo (Pills):**
  - `Hôm nay` (Mặc định)
  - `Hôm qua`
  - `7 ngày qua`
  - `Tháng này`
  - `Tháng trước`
- **Bộ chọn ngày tùy chỉnh (Date Range):**
  - Ô `Từ ngày` (input `date`)
  - Ô `Đến ngày` (input `date`)
  - Nút `🔍 Xem Báo Cáo`
- **Nút tác vụ:**
  - `🔄 Tải Lại`
  - `📥 Xuất Excel Báo Cáo` (tải file `.xlsx` định dạng đẹp cho tab hiện tại)

---

### 2.2. Thẻ KPI Tổng Quan Nhanh (Top Summary Cards)
4 thẻ hiển thị kết quả theo đúng khoảng thời gian đã lọc:
1. **Tổng Doanh Thu (Doanh số gộp):** Tổng tiền bán hàng trước/sau chiết khấu.
2. **Thực Thu Tại Quầy:** Tiền mặt + Chuyển khoản + Thẻ + Ví đã thu thực tế.
3. **Công Nợ Phát Sinh:** Số tiền khách còn nợ từ các đơn trong kỳ.
4. **Số Đơn & Giá Trị Đơn Trung Bình (AOV):** Số đơn hàng và mức chi trung bình/đơn.

---

### 2.3. Chi Tiết Tab 1: 📊 Tổng Quan & Biểu Đồ Trực Quan (Visual Dashboard)
Khối này giúp chủ shop nhìn vào là nắm bắt ngay "sức khỏe" kinh doanh mà không cần đọc bảng số liệu khô khan:
- **Biểu Đồ 1 (Cột & Đường kết hợp):** Xu hướng doanh thu và số lượng đơn hàng theo ngày (hoặc theo khung giờ nếu chọn "Hôm nay").
- **Biểu Đồ 2 (Tròn / Doughnut):** Tỷ trọng cơ cấu nguồn thu giữa **📦 Hàng hóa bán lẻ** vs **💆 Dịch vụ Spa** vs **🏨 Khách sạn thú cưng**.
- **Biểu Đồ 3 (Thanh ngang):** Cơ cấu các kênh thanh toán (Tiền mặt, VietQR, Thẻ, Ví điện tử, Trừ ví Spa).
- **Biểu Đồ 4 (Xếp hạng cột):** Top 5 nhân viên có doanh số cao nhất kỳ thi đua.

> **Giải pháp Offline:** Sử dụng thư viện **Chart.js v4.4** được lưu bundle cục bộ tại `static/js/chart.umd.min.js`. Hoạt động offline 100% không phụ thuộc internet/CDN, render trên thẻ `<canvas>` cực nhẹ và mượt mà.

---

### 2.4. Chi Tiết 4 Tab Bảng Dữ Liệu Chuyên Sâu (Data Tables)

#### Tab 2: 💳 Doanh Thu & Hình Thức Thanh Toán
- **Bảng phân tích dòng tiền theo phương thức:**
  - Tiền mặt (Cash)
  - Chuyển khoản ngân hàng (Transfer / VietQR)
  - Thẻ quẹt (Card POS)
  - Ví điện tử (E-wallet)
  - Cấn trừ Ví Spa (`spa_wallet_deduction`)
- Mỗi dòng hiển thị: `Phương thức`, `Số giao dịch`, `Tổng tiền`, `Tỷ trọng (%)` kèm thanh progress bar.

#### Tab 3: 📦 Hàng Hóa vs 💆 Dịch Vụ Spa / Hotel
- **Phân tách rạch ròi 2 mảng kinh doanh:**
  - Khối A: **Hàng Hóa Bán Lẻ (Physical Goods)**: Doanh số, số lượng món xuất bán, giá trị TB/món.
  - Khối B: **Dịch Vụ Spa & Lưu Trú (Services)**: Doanh số làm đẹp, tắm sấy, lưu chuồng khách sạn.
- Danh sách nhóm hàng / nhóm dịch vụ đóng góp doanh thu cao nhất.

#### Tab 4: 👤 Báo Cáo Theo Nhân Viên (Thu Ngân & Kỹ Thuật Viên)
- Bảng tổng hợp theo từng nhân viên:
  - `Tên nhân viên` & `Mã`
  - `Số đơn hàng đã bán`
  - `Tổng doanh số mang về`
  - `Thực thu mang về`
  - `Hoa hồng được hưởng (Commission)`
  - `Tỷ trọng đóng góp (%)`

#### Tab 5: 🏆 Top Mặt Hàng & Dịch Vụ Bán Chạy (Ranking)
- Bảng xếp hạng top 20 mặt hàng bán chạy nhất:
  - `Hạng (Top 1..20)`
  - `Mã hàng` & `Tên món`
  - `Loại (📦 Hàng hóa / 💆 Dịch vụ)`
  - `Đơn vị tính`
  - `Số lượng bán`
  - `Tổng doanh thu`

---

## 3. Thiết Kế Backend API

### 3.1. Endpoint phân tích tổng hợp: `GET /api/reports/analytics`
- **Query Params:**
  - `from_date` (YYYY-MM-DD)
  - `to_date` (YYYY-MM-DD)
- **Response Payload:**
  ```json
  {
    "summary": {
      "total_revenue": 15000000,
      "total_paid": 14000000,
      "total_debt": 1000000,
      "order_count": 45,
      "total_commission": 750000,
      "aov": 333333
    },
    "timeline": [
      {"label": "01/10", "revenue": 2100000, "orders": 6},
      {"label": "02/10", "revenue": 3400000, "orders": 10}
    ],
    "payments": [
      {"method": "cash", "name": "Tiền mặt", "count": 25, "amount": 8000000, "pct": 57.1},
      {"method": "transfer", "name": "Chuyển khoản", "count": 18, "amount": 5500000, "pct": 39.3},
      {"method": "wallet", "name": "Trừ ví Spa", "count": 2, "amount": 500000, "pct": 3.6}
    ],
    "goods_vs_services": {
      "goods_revenue": 9500000,
      "goods_items_sold": 82,
      "services_revenue": 4500000,
      "services_items_sold": 10,
      "hotel_revenue": 1000000,
      "hotel_bookings": 2
    },
    "staff_performance": [
      {"staff_id": 1, "name": "Quản Lý", "order_count": 30, "revenue": 10500000, "commission": 500000},
      {"staff_id": 2, "name": "Thu Ngân 1", "order_count": 15, "revenue": 4500000, "commission": 250000}
    ],
    "top_products": [
      {"product_id": 139, "code": "6STCL250", "name": "Sữa tắm Corgi 250ml", "type": "product", "unit": "Chai", "qty_sold": 15, "revenue": 2850000}
    ]
  }
  ```

### 3.2. Endpoint xuất Excel: `GET /api/reports/export-excel`
- Xuất file `.xlsx` báo cáo kinh doanh tổng hợp nhiều sheet hoặc 1 sheet chuẩn kế toán kèm logo cửa hàng.
