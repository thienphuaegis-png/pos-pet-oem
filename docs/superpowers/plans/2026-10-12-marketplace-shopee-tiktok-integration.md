# Kế Hoạch Triển Khai: Phân Hệ Quản Lý Bán Hàng Sàn TMĐT (Shopee & TikTok Shop)

> **Mục tiêu:** Xây dựng tab mới **`🛒 Bán Hàng Sàn TMĐT`** gồm 2 kênh Shopee & TikTok Shop. Cho phép cấu hình phiên đăng nhập (Cookie/Token), tự động đồng bộ hóa đơn đơn hàng về máy, ánh xạ sản phẩm sàn vào sản phẩm POS, thống kê chính xác số lượng sản phẩm bán ra theo ngày và tích hợp Trợ lý AI phân tích doanh số.

---

## 1. Kiến Trúc & Cấu Trúc Tệp

| Tệp tin | Trách nhiệm |
|---|---|
| `database.py` | Bổ sung các bảng: `marketplace_accounts`, `marketplace_orders`, `marketplace_order_items`, `marketplace_sku_mappings`. |
| `schemas.py` | Định nghĩa Pydantic schemas cho Account, Order Sync, Mapping, AI Query. |
| `routers/marketplace.py` | Tạo router mới cho API Shopee, TikTok Shop, SKU Mapping, Thống kê sản lượng và AI Chat. |
| `server.py` | Đăng ký `app.include_router(marketplace.router)`. |
| `templates/index.html` | Bổ sung mục Menu sidebar và giao diện Tab `tab-marketplace` (4 subtabs: Shopee, TikTok, Ánh xạ, Thống kê AI). |
| `static/js/modules/marketplace.js` | Module Frontend xử lý gọi API đồng bộ, render bảng đơn hàng, kéo thả ánh xạ SKU và giao diện Chat AI. |
| `tests/test_marketplace_api.py` | Bộ kiểm thử tự động toàn diện cho CSDL, sync, mapping và thống kê. |

---

## 2. Thiết Kế Cơ Sở Dữ Liệu (Database Schema)

```sql
-- 1. Quản lý tài khoản & Phiên đăng nhập Cookie
CREATE TABLE IF NOT EXISTS marketplace_accounts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    platform TEXT NOT NULL CHECK(platform IN ('shopee', 'tiktok')),
    shop_name TEXT NOT NULL,
    cookies TEXT, -- Chuỗi Cookie hoặc token SPC_CDS
    extra_config TEXT, -- JSON config (shop_id, region, app_key...)
    is_active INTEGER DEFAULT 1,
    last_sync_at DATETIME,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- 2. Đơn hàng từ các sàn TMĐT
CREATE TABLE IF NOT EXISTS marketplace_orders (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    platform TEXT NOT NULL CHECK(platform IN ('shopee', 'tiktok')),
    account_id INTEGER,
    order_sn TEXT NOT NULL, -- Mã đơn hàng trên sàn (duy nhất theo sàn)
    order_status TEXT NOT NULL, -- to_ship, shipping, completed, cancelled...
    order_date DATETIME NOT NULL,
    total_amount REAL DEFAULT 0,
    shipping_fee REAL DEFAULT 0,
    buyer_username TEXT,
    tracking_number TEXT,
    raw_payload TEXT, -- JSON gốc từ sàn
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(account_id) REFERENCES marketplace_accounts(id),
    UNIQUE(platform, order_sn)
);

-- 3. Chi tiết từng mặt hàng trên đơn hàng sàn
CREATE TABLE IF NOT EXISTS marketplace_order_items (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    order_id INTEGER NOT NULL,
    platform_item_id TEXT,
    platform_product_name TEXT NOT NULL,
    platform_variation TEXT,
    platform_sku TEXT,
    quantity REAL NOT NULL DEFAULT 1,
    unit_price REAL DEFAULT 0,
    subtotal REAL DEFAULT 0,
    mapped_product_id INTEGER, -- Link tới products(id) trong POS
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(order_id) REFERENCES marketplace_orders(id) ON DELETE CASCADE,
    FOREIGN KEY(mapped_product_id) REFERENCES products(id) ON DELETE SET NULL
);

-- 4. Bảng luật ánh xạ sản phẩm (SKU Mapping Rules)
CREATE TABLE IF NOT EXISTS marketplace_sku_mappings (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    platform TEXT NOT NULL,
    platform_sku TEXT,
    platform_item_name TEXT NOT NULL,
    platform_variation TEXT,
    product_id INTEGER NOT NULL,
    is_auto INTEGER DEFAULT 0, -- 1: Do AI gợi ý, 0: Người dùng tự map
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(product_id) REFERENCES products(id) ON DELETE CASCADE,
    UNIQUE(platform, platform_sku, platform_item_name, platform_variation)
);
```

---

## 3. Các Giai Đoạn Thực Hiện Chi Tiết

### Giai Đoạn 1: CSDL & Schema & Router Backend
- **Task 1.1:** Cập nhật `database.py:init_db()` khởi tạo 4 bảng trên.
- **Task 1.2:** Viết Pydantic schemas trong `schemas.py`.
- **Task 1.3:** Tạo `routers/marketplace.py` với các endpoints:
  - CRUD Quản lý tài khoản sàn & lưu cookie/token: `/api/marketplace/accounts`
  - Đồng bộ đơn hàng Shopee từ Cookie/SPC_CDS: `/api/marketplace/shopee/sync`
  - Đồng bộ đơn hàng TikTok Shop: `/api/marketplace/tiktok/sync`
  - Danh sách đơn hàng & bộ lọc theo ngày: `/api/marketplace/orders`
  - Quản lý luật ánh xạ sản phẩm: `/api/marketplace/mappings`
  - Thống kê sản phẩm bán theo ngày (Daily Product Sales Count): `/api/marketplace/analytics/daily-products`
  - Trợ lý AI hỏi đáp dữ liệu bán hàng: `/api/marketplace/ai-analytics`

### Giai Đoạn 2: Giao Diện Frontend (Tab Bán Hàng Sàn TMĐT)
- **Task 2.1:** Thêm icon và mục `🛒 Bán Hàng Sàn TMĐT` vào thanh điều hướng bên trái `templates/index.html`.
- **Task 2.2:** Thiết kế khung giao diện chính với 4 tab con:
  - Tab 1: **Shopee Seller** (Thẻ trạng thái kết nối, nút đồng bộ, bảng đơn hàng lọc theo ngày).
  - Tab 2: **TikTok Shop** (Thẻ kết nối, nút đồng bộ, bảng đơn hàng).
  - Tab 3: **Ánh Xạ Sản Phẩm** (Bảng hiển thị các món trên sàn chưa map $\leftrightarrow$ Dropdown chọn sản phẩm kho POS).
  - Tab 4: **Thống Kê & Trợ Lý AI** (Bảng tổng kết hôm nay bán được bao nhiêu sản phẩm của từng loại, biểu đồ kênh bán, khung chat AI tương tác).
- **Task 2.3:** Viết module `static/js/modules/marketplace.js` điều phối logic tải dữ liệu, popup cập nhật Cookie, và gửi câu hỏi tới AI.

### Giai Đoạn 3: Logic Ánh Xạ Tự Động & AI Thống Kê
- **Task 3.1:** Khi đơn sàn kéo về, tự động so khớp `marketplace_sku_mappings` để gán `mapped_product_id`. Nếu chưa có luật ánh xạ, dùng hàm heuristic fuzzy match để tự đề xuất.
- **Task 3.2:** Tích hợp Gemini 2.5 Flash để tổng hợp câu trả lời ngôn ngữ tự nhiên từ dữ liệu đơn hàng sàn đã ánh xạ.

### Giai Đoạn 4: Kiểm Thử Tự Động & Đóng Gói
- **Task 4.1:** Viết test suite `tests/test_marketplace_api.py`.
- **Task 4.2:** Rebuild executable và commit push lên GitHub.
