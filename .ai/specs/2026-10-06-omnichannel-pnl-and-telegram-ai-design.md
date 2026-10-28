# Omnichannel P&L Hub, Ads Guard & Telegram AI Agent Design

**Date:** 2026-10-06  
**Status:** Approved  
**Author:** Thiên Phú & Hermes  
**Target System:** POS Pet Care Offline (`D:\Projects_Hermes\pos-offline-petcare2`)

---

## 1. Mục tiêu & Bài toán

Cửa hàng vận hành đa kênh (Offline tại quầy, Pancake CRM/Facebook, Shopee, TikTok Shop, Zalo Web).  
Yêu cầu:
1. **Quản lý & Xem tập trung trên POS:** Xem báo cáo tài chính P&L 1 tháng của cả hệ thống trực tiếp trên giao diện POS web.
2. **Khớp SKU & Trừ kho:** Đơn hàng từ các sàn được kéo về chi tiết, ánh xạ (map) SKU sàn vào SKU kho POS để trừ tồn kho và tính giá vốn hàng bán (COGS).
3. **Quản lý chi phí & Ads:** Tự động thu thập chi phí quảng cáo (Shopee Ads, TikTok Ads, FB Ads) và phí sàn.
4. **Cảnh báo & Điều khiển qua Telegram + AI:** Bot Telegram kết hợp AI phân tích số liệu P&L, tự động bắn cảnh báo khi chi phí quảng cáo vượt ngưỡng (CIR quá cao hoặc ROAS quá thấp).

---

## 2. Kiến trúc giải pháp (Phân tầng Module hóa)

```
+------------------------------------------------------------------------+
|                            MÁY POS (THU NGÂN)                         |
|                                                                        |
|  +------------------------+        +--------------------------------+  |
|  | Web Browser POS UI     |        | FastAPI Core Server (Port 8000)|  |
|  | Tab "Đa kênh & P&L"    |<------>| - /api/omnichannel/pnl         |  |
|  | - KPI Doanh thu/Vốn/Lãi|        | - /api/omnichannel/orders/sync |  |
|  | - Bảng P&L tháng       |        | - /api/omnichannel/ads/sync    |  |
|  | - Nút "Đồng bộ ngay"   |        | - /api/omnichannel/trigger     |  |
|  +------------------------+        +--------------------------------+  |
|                                                    |                   |
|                                              +-----v-----+             |
|                                              | SQLite DB |             |
|                                              | (pos.db)  |             |
+----------------------------------------------+-----------+-------------+
                                                     ^
                                                     | Local API / IPC
+----------------------------------------------------+-------------------+
|                        BACKGROUND WORKERS / EXTENSIONS                 |
|                                                                        |
|  1. Pancake Sync Worker (REST API pos.pages.fm ?api_key=***)           |
|  2. Shopee & TikTok CDP Scraper (Orders & Ads via CDP port 9223)        |
|  3. Zalo Web CDP Scraper (Tin nhắn & Đơn qua trình duyệt)              |
|  4. Telegram AI Bot & Cảnh báo (Poller + Gemini/LLM + Alert thresholds)|
+------------------------------------------------------------------------+
```

---

## 3. Thiết kế CSDL (pos.db)

### 3.1. Bảng `channel_orders` (Đơn hàng từ các kênh)
- `id` INTEGER PRIMARY KEY AUTOINCREMENT
- `channel` TEXT NOT NULL (`pos`, `pancake`, `shopee`, `tiktok`, `zalo`)
- `channel_order_id` TEXT NOT NULL (Mã đơn từ sàn/kênh)
- `order_date` TEXT NOT NULL (ISO-8601 YYYY-MM-DD HH:MM:SS)
- `customer_name` TEXT
- `customer_phone` TEXT
- `total_amount` REAL NOT NULL (Tổng giá trị niêm yết)
- `discount_amount` REAL DEFAULT 0 (Chiết khấu/khuyến mãi)
- `platform_fee` REAL DEFAULT 0 (Phí sàn/hoa hồng sàn thu)
- `shipping_fee` REAL DEFAULT 0 (Phí vận chuyển khách trả hoặc shop chịu)
- `net_revenue` REAL NOT NULL (Tiền thực thu sau giảm giá và phí sàn)
- `payment_status` TEXT DEFAULT 'pending' (`paid`, `unpaid`, `cod_pending`)
- `inventory_status` TEXT DEFAULT 'pending' (`deducted`, `pending`, `sku_unmapped`, `failed`)
- `raw_payload` TEXT (JSON gốc từ sàn phòng khi cần đối soát)
- `created_at` TEXT DEFAULT CURRENT_TIMESTAMP

### 3.2. Bảng `channel_order_items` (Chi tiết món theo đơn)
- `id` INTEGER PRIMARY KEY AUTOINCREMENT
- `channel_order_id` INTEGER NOT NULL REFERENCES `channel_orders(id)`
- `channel_sku` TEXT NOT NULL (Mã sản phẩm trên sàn)
- `product_name` TEXT NOT NULL
- `pos_product_id` INTEGER REFERENCES `products(id)` (Ánh xạ vào kho POS)
- `quantity` REAL NOT NULL
- `selling_price` REAL NOT NULL (Giá bán thực)
- `cost_price` REAL NOT NULL (Giá vốn ghi nhận tại thời điểm bán từ POS)
- `subtotal` REAL NOT NULL

### 3.3. Bảng `channel_ads_expenses` (Chi phí quảng cáo)
- `id` INTEGER PRIMARY KEY AUTOINCREMENT
- `date` TEXT NOT NULL (YYYY-MM-DD)
- `channel` TEXT NOT NULL (`shopee_ads`, `tiktok_ads`, `fb_ads`)
- `campaign_id` TEXT
- `campaign_name` TEXT
- `spend` REAL NOT NULL (Tiền tiêu thực tế)
- `impressions` INTEGER DEFAULT 0
- `clicks` INTEGER DEFAULT 0
- `conversions` INTEGER DEFAULT 0
- `ads_revenue` REAL DEFAULT 0 (Doanh thu ghi nhận từ ads)
- `roas` REAL GENERATED ALWAYS AS (CASE WHEN spend > 0 THEN ads_revenue / spend ELSE 0 END) STORED
- `created_at` TEXT DEFAULT CURRENT_TIMESTAMP

### 3.4. Bảng `channel_settings` (Cấu hình kết nối & cảnh báo)
- `key` TEXT PRIMARY KEY
- `value` TEXT NOT NULL
- Ví dụ:
  - `pancake_api_key`: Key kết nối POSCAKE
  - `pancake_shop_id`: Shop ID POSCAKE
  - `telegram_bot_token`: Token bot
  - `telegram_chat_id`: Group/Chat ID nhận cảnh báo
  - `ads_cir_threshold`: Tỉ lệ Ads / Doanh thu tối đa cho phép (mặc định 20%)
  - `ads_roas_min_threshold`: ROAS tối thiểu trước khi cảnh báo (mặc định 3.0)

---

## 4. Công thức Báo cáo Tài chính P&L Tháng (POS)

Tại tab **Báo cáo Đa Kênh & P&L** trên POS:
1. **Tổng Doanh Thu Thuần (Net Revenue):**  
   $\sum \text{Net Revenue}_{\text{POS}} + \sum \text{Net Revenue}_{\text{Pancake}} + \sum \text{Net Revenue}_{\text{Shopee}} + \sum \text{Net Revenue}_{\text{TikTok}} + \sum \text{Net Revenue}_{\text{Zalo}}$
2. **Tổng Giá Vốn Hàng Bán (COGS):**  
   $\sum (\text{Quantity} \times \text{Cost Price POS})$ cho toàn bộ món bán ra trên mọi kênh.
3. **Lợi Nhuận Gộp (Gross Profit):**  
   $\text{Doanh Thu Thuần} - \text{COGS}$
4. **Chi Phí Bán Hàng & Quảng Cáo (Variable Expenses):**  
   $\sum \text{Phí Sàn} + \sum \text{Shopee Ads} + \sum \text{TikTok Ads} + \sum \text{FB Ads}$
5. **Chi Phí Vận Hành Cố Định (Fixed Opex):**  
   Lấy từ bảng `cashbook` của POS (Tiền thuê mặt bằng, điện nước, lương nhân viên...).
6. **Lợi Nhuận Ròng Thực Tế (Net Profit):**  
   $\text{Lợi Nhuận Gộp} - \text{Chi Phí Bán Hàng} - \text{Chi Phí Vận Hành}$
7. **Chỉ số hiệu quả:**  
   - $\text{Tỉ lệ Lãi Gộp} = \text{Gross Profit} / \text{Net Revenue}$
   - $\text{Tỉ lệ Lãi Ròng} = \text{Net Profit} / \text{Net Revenue}$
   - $\text{CIR Ads} = \text{Tổng Ads} / \text{Net Revenue}$

---

## 5. Thiết kế Giao diện POS (Web UI)

- **Vị trí:** Thêm mục **"Báo cáo Đa Kênh (P&L)"** trên thanh điều hướng chính của POS (`templates/base.html`).
- **Template mới:** `templates/omnichannel_pnl.html`
- **Các khối nội dung:**
  1. **Thanh Header & Bộ lọc:**
     - Bộ chọn tháng (Tháng hiện tại, tháng trước, hoặc tùy chọn ngày).
     - Bộ chọn kênh (Tất cả / Quầy POS / Pancake / Shopee / TikTok / Zalo).
     - Nút hành động: `[Đồng bộ ngay]` (Trigger worker chạy nền), `[Cài đặt API]`, `[Xuất Excel]`.
  2. **Thẻ KPI Cards (Summary Banner):**
     - Doanh thu toàn sàn (kèm % so với tháng trước).
     - Giá vốn & Lãi gộp.
     - Chi phí Ads & Phí sàn (kèm chỉ số cảnh báo màu đỏ nếu CIR > 20%).
     - Lợi nhuận ròng thực nhận.
  3. **Bảng Báo cáo P&L dạng tầng (Cascading P&L Table):**
     - I. DOANH THU BÁN HÀNG
     - II. GIÁ VỐN HÀNG BÁN (COGS)
     - III. LỢI NHUẬN GỘP
     - IV. CHI PHÍ BÁN HÀNG & QUẢNG CÁO
     - V. CHI PHÍ VẬN HÀNH QUẢN LÝ
     - VI. LỢI NHUẬN RÒNG TRƯỚC THUẾ
  4. **Bảng Đơn Hàng Đa Kênh Gần Đây & Cảnh báo SKU:**
     - Danh sách đơn vừa kéo về.
     - Badge trạng thái: `Đã trừ kho` (Xanh lá), `Chưa khớp SKU POS` (Cam - click để map ngay), `Chờ thanh toán` (Vàng).

---

## 6. Cơ chế Worker & Tích hợp Kênh

### 6.1. Pancake Sync Worker (`scripts/sync_pancake.py`)
- Dùng REST API chính thức: `https://pos.pages.fm/api/v1/shops/{shop_id}/orders?api_key={key}`
- Lọc theo `startDateTime` và `endDateTime` dạng Unix Timestamp.
- Lấy `money_to_collect` làm doanh thu thực.
- Map sản phẩm qua SKU hoặc tên, tự động gọi API POS để trừ kho.

### 6.2. Shopee & TikTok CDP Scraper (`scripts/scrape_shopee_ads.py`, `scripts/scrape_tiktok_ads.py`)
- Kết nối Chrome Debugging Port 9223 hoặc Camoufox đã đăng nhập sẵn tài khoản người bán.
- Cào báo cáo quảng cáo hàng ngày (Tiền tiêu, Click, Doanh thu sinh ra).
- Đẩy dữ liệu vào API POS `/api/omnichannel/ads/sync`.

### 6.3. Zalo Web Automation (`scripts/sync_zalo_web.py`)
- Đọc tin nhắn chốt đơn / khách hàng qua Chrome profile Zalo Web để hỗ trợ lên đơn.

---

## 7. Telegram Bot & AI Quản Lý Điều Khiển (Telegram ChatOps & AI Controller)

Bot Telegram không chỉ là kênh xem báo cáo tĩnh mà là **trung tâm điều khiển POS từ xa (ChatOps)** cho chủ shop:

### 7.1. Cơ chế Bảo mật & Xác thực
- **Admin Whitelist:** Chỉ tin nhắn gửi từ đúng `owner_telegram_chat_id` mới được thực thi các lệnh quản trị / nhạy cảm.
- **Xác nhận 2 bước (2-Step Safety Confirmation):** Với các lệnh thay đổi dữ liệu như Xóa/Hủy hóa đơn, bot hiển thị tóm tắt đơn (Mã, Khách, Tổng tiền, Món) kèm 2 nút Inline Keyboard `[🔴 Xác nhận Xóa]` và `[❌ Giữ lại]`. Chỉ khi bấm xác nhận thì lệnh mới được gọi.

### 7.2. Bộ lệnh Điều khiển qua Telegram
1. **Quản trị Bán hàng & Hóa đơn (Admin Actions):**
   - `/xoahoadon <Mã_Đơn>`: Gọi API `DELETE /api/orders/{code}` của POS. Tự động hoàn tồn kho sản phẩm, hoàn kho nguyên liệu BOM, điều chỉnh lại công nợ khách hàng và sổ quỹ tiền mặt, ghi log hệ thống.
   - `/sync [pancake|shopee|tiktok|all]`: Kích hoạt worker kéo đơn và chi phí về ngay lập tức.
2. **Tra cứu & Báo cáo Nhanh (Read Actions):**
   - `/baocao [homnay|thangnay]`: Doanh thu tổng hợp, giá vốn (COGS), lãi gộp, chi phí ads, lãi ròng thực tế.
   - `/hoadon <Mã_Đơn>`: Xem chi tiết hóa đơn (khách hàng, nhân viên bán, danh sách món, trạng thái thanh toán).
   - `/tonkho <Từ_khóa>`: Tra cứu số lượng tồn và giá vốn của sản phẩm trong kho POS.
3. **Trợ lý AI Tự nhiên (Natural Language AI Agent):**
   - Anh có thể chat tự nhiên: *"Hôm nay lãi bao nhiêu em?", "Đơn HD123 ai bán vậy?", "Kiểm tra xem kho còn hạt Royal Canin không"*.
   - Bot dùng AI (Gemini / LLM) phân tích câu hỏi -> gọi API POS tương ứng -> trả lời ngắn gọn, chuẩn số liệu.
4. **Cảnh báo Thông minh (Proactive Alerts):**
   - Cảnh báo Ads CIR/ROAS: Bắn tin khẩn cấp khi tiền quảng cáo sàn ngốn quá 20% doanh thu hoặc ROAS tụt dưới 3.0.
   - Báo cáo chốt ca / chốt ngày tự động gửi lúc 22:30 mỗi tối.

---

## 8. Kế hoạch triển khai (Roadmap)

- **Phase 1: POS Core P&L & Pancake REST API (Triển khai trước mắt)**
  - Schema DB & Router `/api/omnichannel/*`.
  - Tab giao diện `omnichannel_pnl.html` trên POS.
  - Kết nối Pancake kéo đơn, map SKU trừ kho POS, tính P&L hoàn chỉnh.
- **Phase 2: Shopee & TikTok Ads Scraper (CDP)**
  - Script cào chi phí Shopee Ads + TikTok Ads.
  - Bổ sung cột chi phí Ads vào bảng P&L POS.
- **Phase 3: Telegram AI Bot & Zalo Web**
  - Bot Telegram báo cáo số liệu và cảnh báo Ads.
  - Quét đơn Zalo Web.
