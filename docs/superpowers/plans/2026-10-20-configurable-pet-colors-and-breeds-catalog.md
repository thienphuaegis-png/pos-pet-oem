# Cấu Hình Danh Mục Màu Lông & Giống Loài Thú Cưng Trong Settings

> **For agentic workers:** REQUIRED SUB-SKILL: Use executing-plans.

**Goal:** Chuyển đổi toàn bộ danh mục Màu Lông và Giống Loài từ hardcode tĩnh sang quản lý tập trung trong Settings, cho phép người dùng tự do thêm/xóa/sửa danh mục và đồng bộ tự động 100% sang dropdown ở Modal Tiếp Nhận Spa & Modal Quản Lý Hồ Sơ Thú Cưng.

**Architecture:** 
- Backend: Cung cấp API `GET /api/settings/pet-catalog` và `POST /api/settings/pet-catalog` lưu vào bảng `settings` (JSON key-value). Tự động gom thêm các màu/giống đã từng lưu trong bảng `pets` (self-healing / no data loss).
- Frontend Settings: Bổ sung sub-tab `🐾 Danh Mục Thú Cưng` trong màn hình Cài Đặt Hệ Thống (`tab-settings`) với giao diện quản lý dạng thẻ Tags/Chips trực quan, ô thêm nhanh tại chỗ và nút khôi phục mặc định.
- Frontend Modals: Nạp động danh mục cho cả `#svc-pet-color`, `#svc-pet-breed` (Tiếp nhận Spa) và `#new-pet-color`, `#new-pet-breed` (Quản lý Hồ sơ), kèm cơ chế Fallback Inject Option an toàn chống rớt giá trị.

**Tech Stack:** FastAPI, SQLite, Vanilla JS (ES6), Tailwind CSS, pytest.

---

## Global Constraints & Anti-Drift Guards (Strict)
1. **Chạm đúng biên:** Chỉ sửa `routers/settings.py`, `templates/index.html`, `static/js/modules/spa.js`, không làm ảnh hưởng đến các màn hình khác.
2. **Không làm rớt dữ liệu cũ:** Nếu thú cưng trong DB có màu/giống không nằm trong danh mục người dùng đã cấu hình, logic bind bắt buộc tự động chèn `<option>` tạm thời, tuyệt đối không tự ý reset về 'Trắng' hay 'Poodle'.
3. **Bằng chứng test thực tế:** Mọi thay đổi backend phải có test case pytest pass 100%.

---

## File Structure Map

| File | Trách nhiệm |
|---|---|
| `routers/settings.py` | Thêm Pydantic schemas và các endpoint `/api/settings/pet-catalog` (GET, POST, POST /restore-defaults). |
| `tests/test_pet_catalog_settings.py` | Tạo mới test suite kiểm tra đầy đủ các kịch bản lưu, đọc, merge dữ liệu cũ và khôi phục mặc định. |
| `templates/index.html` | Bổ sung nút sub-tab `🐾 Danh Mục Thú Cưng` và panel quản lý chips/tags trong `#tab-settings`. |
| `static/js/modules/spa.js` | Hàm `loadAndSyncPetCatalog()`, render dropdowns động cho 2 modal và logic thêm/xóa tag trong Settings. |

---

### Task 1: Backend API Quản Lý Danh Mục Thú Cưng (`/api/settings/pet-catalog`)

**Files:**
- Modify: `routers/settings.py`
- Test: `tests/test_pet_catalog_settings.py`

- [ ] **Step 1: Viết test failing kiểm tra API `pet-catalog`**
  - Viết test `GET /api/settings/pet-catalog` kiểm tra trả về danh mục mặc định (20 màu, 21 giống).
  - Viết test `POST /api/settings/pet-catalog` lưu danh mục tùy chỉnh của người dùng.
  - Viết test tự động gom các màu/giống lạ từ bảng `pets` nếu có.
- [ ] **Step 2: Chạy pytest xác nhận test fail**
  - Lệnh: `pytest tests/test_pet_catalog_settings.py`
- [ ] **Step 3: Triển khai API trong `routers/settings.py`**
  - Khai báo hằng số danh mục mặc định `DEFAULT_PET_COLORS` và `DEFAULT_PET_BREEDS`.
  - Endpoint `GET /api/settings/pet-catalog`: Đọc từ bảng `settings`, fallback về defaults nếu rỗng, đồng thời quét `SELECT DISTINCT color FROM pets WHERE color != ''` và `SELECT DISTINCT breed FROM pets WHERE breed != ''` để merge bổ sung.
  - Endpoint `POST /api/settings/pet-catalog`: Nhận `PetCatalogUpdate(colors=list, breeds=list)`, validate không rỗng, lưu JSON vào `settings`.
  - Endpoint `POST /api/settings/pet-catalog/restore-defaults`: Reset về bộ danh mục gốc.
- [ ] **Step 4: Chạy pytest xác nhận test pass 100%**
  - Lệnh: `pytest tests/test_pet_catalog_settings.py`

---

### Task 2: Giao Diện Quản Lý Danh Mục Trong Settings (`templates/index.html`)

**Files:**
- Modify: `templates/index.html` (vùng `#tab-settings` và thanh sub-tab bar)

- [ ] **Step 1: Bổ sung nút Sub-tab `🐾 Danh Mục Thú Cưng`**
  - Thêm nút button `switchSettingsSubTab('pet-catalog')` vào thanh điều hướng sub-tab trong `#tab-settings`.
- [ ] **Step 2: Bổ sung khung Panel `#settings-sub-pet-catalog`**
  - Bố cục 2 cột (hoặc 2 thẻ card chuyên nghiệp):
    - **Thẻ 1: Danh Mục Màu Lông Thú Cưng**: Danh sách tags/chips màu hiện tại có nút [✕] xóa, ô input nhập tên màu mới + nút `+ Thêm Màu`, nút `Khôi phục màu mặc định`.
    - **Thẻ 2: Danh Mục Giống Loài Thú Cưng**: Danh sách tags/chips giống loài có nút [✕] xóa, ô input nhập tên giống mới + nút `+ Thêm Giống`, nút `Khôi phục giống mặc định`.
  - Nút lưu cấu hình nổi bật `Lưu Danh Mục Thú Cưng` (hoặc tự lưu mỗi lần thao tác).

---

### Task 3: Đồng Bộ JS Dropdowns Tại Cả 2 Modal & Thao Tác Settings (`spa.js`)

**Files:**
- Modify: `static/js/modules/spa.js` (hoặc file JS quản lý settings tương ứng)
- Modify: `templates/index.html` (dọn dẹp các options hardcode cũ thành placeholder chờ nạp)

- [ ] **Step 1: Viết hàm `loadAndSyncPetCatalog()`**
  - Fetch `/api/settings/pet-catalog`, lưu cache vào `window.petCatalogData`.
  - Render vào `#svc-pet-color`, `#svc-pet-breed` (Tiếp nhận Spa).
  - Render vào `#new-pet-color`, `#new-pet-breed` (Hồ sơ Thú cưng).
- [ ] **Step 2: Xử lý Fallback Chống Rớt Giá Trị Khi Bind Pet**
  - Trong hàm `onSelectSpaPet` (`spa.js:4405-4408`) và modal pet: nếu giá trị `p.color` hoặc `p.breed` từ DB chưa tồn tại trong danh sách options, tự động tạo thêm một `<option value="${p.color}">${p.color}</option>` và chọn nó, không bao giờ reset về mặc định.
- [ ] **Step 3: Xử lý tương tác thêm / xóa Tag trên UI Settings**
  - Viết các hàm: `renderPetCatalogSettings()`, `addPetColorTag()`, `removePetColorTag()`, `addPetBreedTag()`, `removePetBreedTag()`, `savePetCatalogSettings()`, `restorePetCatalogDefaults()`.
  - Khi lưu thành công, tự động gọi `loadAndSyncPetCatalog()` để cập nhật 0ms cho cả 2 modal mà không cần reload trang.

---

### Task 4: Kiểm Thử Toàn Diện (End-to-End Verification)

- [ ] **Step 1: Kiểm thử API qua pytest**
- [ ] **Step 2: Kiểm thử cú pháp template HTML & JS** (`node -c` hoặc regex kiểm tra cú pháp)
- [ ] **Step 3: Khởi chạy và kiểm tra phản hồi endpoint thực tế**
