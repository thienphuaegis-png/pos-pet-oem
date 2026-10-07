# Implementation Plan: Hệ Thống Báo Cáo Kinh Doanh Đa Chiều & Dashboard Biểu Đồ Trực Quan

> **For agentic workers:** REQUIRED SUB-SKILL: Use subagent-driven-development or executing-plans.

**Goal:** Xây dựng hệ thống Báo Cáo Kinh Doanh đa chiều toàn diện tại tab `tab-reports` trên Web POS: mốc thời gian linh hoạt (hôm nay, hôm qua, 7 ngày, tháng này, tùy chọn ngày), 5 tab chuyên sâu (Tổng quan biểu đồ, Dòng tiền thanh toán, Hàng hóa vs Dịch vụ, Nhân viên, Top bán chạy), xuất Excel và hoạt động offline 100%.

**Architecture:** 
- Backend: Endpoint `GET /api/reports/analytics` và `GET /api/reports/export-excel` tại `routers/cashbook.py`.
- Frontend: Tải và bundle thư viện `Chart.js` cục bộ tại `static/js/chart.umd.min.js`, tạo file module `static/js/modules/reports_analytics.js`, cập nhật giao diện `templates/index.html`.
- Đồng bộ tự động sang `C:\POS` và re-build `POS_Mastercare.exe`.

**Tech Stack:** Python 3.11, SQLite, FastAPI, openpyxl, Chart.js 4.4, Tailwind CSS, Pytest.

---

### Task 1: Backend API `GET /api/reports/analytics` & `GET /api/reports/export-excel`
**Files:**
- Modify: `routers/cashbook.py`
- Create: `tests/test_reports_analytics.py`

- [ ] **Step 1: Viết test suite `tests/test_reports_analytics.py` kiểm tra API analytics & export Excel**
- [ ] **Step 2: Triển khai endpoint `GET /api/reports/analytics` với đầy đủ các khối: `summary`, `timeline`, `payments`, `goods_vs_services`, `staff_performance`, `top_products`**
- [ ] **Step 3: Triển khai endpoint `GET /api/reports/export-excel` xuất file .xlsx nhiều bảng**
- [ ] **Step 4: Chạy test và xác nhận pass 100%**

---

### Task 2: Chuẩn bị thư viện Chart.js Offline cục bộ
**Files:**
- Create: `static/js/chart.umd.min.js`

- [ ] **Step 1: Tải bundle Chart.js v4.4 lưu trực tiếp vào `static/js/chart.umd.min.js`**
- [ ] **Step 2: Kiểm tra file tồn tại và sẵn sàng nạp offline**

---

### Task 3: Xây dựng Module Frontend `reports_analytics.js`
**Files:**
- Create: `static/js/modules/reports_analytics.js`

- [ ] **Step 1: Xây dựng hàm `initReportsAnalytics()`, xử lý chuyển tab con (sub-tabs) và bộ lọc ngày nhanh**
- [ ] **Step 2: Xây dựng hàm `renderReportsVisualDashboard(data)` vẽ 4 biểu đồ Chart.js (Timeline, Nguồn thu Doughnut, Kênh thanh toán Bar, Top nhân viên)**
- [ ] **Step 3: Xây dựng hàm render cho 4 tab bảng dữ liệu: Thanh toán, Hàng hóa vs Dịch vụ, Nhân viên, Top bán chạy**
- [ ] **Step 4: Xây dựng hàm `exportReportsExcel()` tải file Excel theo khoảng ngày đang chọn**

---

### Task 4: Cập nhật giao diện `templates/index.html`
**Files:**
- Modify: `templates/index.html`

- [ ] **Step 1: Thiết kế lại toàn bộ khối `#tab-reports` gồm Sticky Filter Bar, 4 Top Metric Cards và container cho 5 Sub-Tabs**
- [ ] **Step 2: Nạp script `chart.umd.min.js` và `reports_analytics.js?v=20261007_01`**
- [ ] **Step 3: Đấu nối gọi `loadReportsAnalytics()` khi người dùng bấm vào tab `Báo Cáo Tổng Hợp` trên sidebar**

---

### Task 5: Kiểm thử tự động & Verify trực quan Playwright
**Files:**
- Run test: `pytest tests/test_reports_analytics.py`
- Verify Playwright screenshot render tab Báo Cáo

- [ ] **Step 1: Chạy pytest toàn bộ module báo cáo**
- [ ] **Step 2: Tạo test script Playwright render trang và dùng `vision_analyze` kiểm tra độ trực quan của các biểu đồ và bảng**

---

### Task 6: Đồng bộ sang `C:\POS`, Rebuild `.exe` & Git Push
**Files:**
- Target: `C:\POS`
- Binary: `POS_Mastercare.exe`

- [ ] **Step 1: Re-compile `uv run pyinstaller POS_Mastercare.spec --distpath . -y`**
- [ ] **Step 2: Copy toàn bộ code mới sang `C:\POS`**
- [ ] **Step 3: Commit và push lên `github/main`**
