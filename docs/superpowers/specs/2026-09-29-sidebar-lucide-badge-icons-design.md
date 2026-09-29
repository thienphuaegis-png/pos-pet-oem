# Design Spec: Sidebar Lucide Badge Icons (Nền màu)

## 1. Mục tiêu & Bối cảnh
- **Vấn đề:** Sidebar hiện dùng icon emoji unicode (🛒, 🐾, 🏨, v.v.). Trên Windows các emoji này hiển thị không đồng nhất, dễ vỡ nét và thiếu tính chuyên nghiệp của một POS bán lẻ.
- **Giải pháp:** Thay thế toàn bộ 14 icon sidebar bằng chuẩn **Lucide Line Icons** lồng trong khung nền màu pastel (Badge Flat Style - phong cách iOS/macOS modern).
- **Ràng buộc:** Hoạt động 100% offline trên máy bán hàng (không phụ thuộc CDN).

## 2. Bảng Phối Màu & Icon 14 Mục Sidebar
| Tab | Tên Mục | Icon Lucide | Khung Màu Nền & Màu Icon |
|---|---|---|---|
| `pos` | Bán Hàng (POS) | `shopping-cart` | `bg-sky-100 text-sky-600` |
| `pet-services` | Dịch Vụ & Thú Cưng | `paw-print` / `dog` | `bg-pink-100 text-pink-600` |
| `hotel` | Khách Sạn Hotel | `bed` / `hotel` | `bg-purple-100 text-purple-600` |
| `orders` | Hóa Đơn | `receipt` | `bg-amber-100 text-amber-600` |
| `price-lists` | Bảng Giá | `tag` | `bg-emerald-100 text-emerald-600` |
| `inventory` | Hàng Hóa & Kho | `package` | `bg-orange-100 text-orange-600` |
| `purchases` | Nhập Hàng | `truck` / `inbox` | `bg-indigo-100 text-indigo-600` |
| `oem` | Gia Công OEM | `factory` | `bg-cyan-100 text-cyan-600` |
| `contacts` | Khách Hàng & Đối Tác | `users` | `bg-rose-100 text-rose-600` |
| `cashbook` | Sổ Quỹ Thu Chi | `wallet` | `bg-green-100 text-green-600` |
| `cashflow-debts` | Dòng Tiền & Nợ NCC | `landmark` / `table` | `bg-teal-100 text-teal-600` |
| `reports` | Báo Cáo Tổng Hợp | `bar-chart-3` | `bg-violet-100 text-violet-600` |
| `shifts` | Ca Làm Việc | `clock` | `bg-yellow-100 text-yellow-700` |
| `settings` | Cài Đặt Hệ Thống | `settings` | `bg-slate-200 text-slate-700` |

## 3. Kiến Trúc Kỹ Thuật (Zero-CDN, Pure Inline SVG)
- Thay thế thẻ `<span class="sidebar-icon">...</span>` bằng block khung badge `w-6 h-6 rounded-md flex items-center justify-center` chứa vector SVG (14x14px, stroke 2px).
- Khi Sidebar thu nhỏ (collapsed mode): icon badge vẫn giữ kích thước chuẩn, tooltip hiển thị tên mục bình thường.
- Không phát sinh tải thư viện ngoài, tải trang tức thì không chớp nháy (0ms FOIT).
