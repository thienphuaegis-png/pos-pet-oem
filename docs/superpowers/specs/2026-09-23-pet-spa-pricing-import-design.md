# SPEC: IMPORT & CHUẨN HÓA BẢNG GIÁ DỊCH VỤ SPA THEO CÂN NẶNG (PET NHA TRANG)

**Ngày:** 2026-09-23  
**Nguồn dữ liệu:** `C:\Users\thien\AppData\Local\hermes\attachments\bang_gia_spa_pet_nha_trang.xlsx`  
**Mục tiêu:** Xóa dữ liệu mẫu cũ (22 dòng), import 63 mức giá chuẩn theo 5 nhóm phân loại, đồng bộ dropdown lọc và luồng tính giá tự động trên giao diện Spa.

---

## 1. Phân Loại Danh Mục (5 Nhóm)

1. **`Gói Combo Chó`** (8 mốc cân: 0-2kg, >2-6kg, >6-10kg, >10-20kg, >20-30kg, >30-40kg, >40-50kg, >=50kg):
   - `CB Tắm (1+2+3)`: 100k - 550k
   - `CB Cạo (1+2+3+4)`: 150k - 600k
   - `CB Cắt Tỉa (1+2+3+5)`: 250k - 650k

2. **`Dịch Vụ Lẻ Chó`** (8 mốc cân):
   - `Tắm + Massage`: 80k - 450k
   - `Vệ sinh tai`: 30k - 50k
   - `Cắt móng + cạo cợ bàn`: 30k - 80k
   - `Cạo lông toàn thân`: 80k - 350k
   - `Cắt lông tạo kiểu`: 100k - 400k

3. **`Spa Mèo`** (3 mốc cân):
   - `Combo Tắm Vệ Sinh Mèo`:
     - Dưới 2kg (0 - 2kg): 150.000 đ
     - 2 - 6kg (>2 - 6kg): 200.000 đ
     - Trên 6kg (>6 - 35kg): 250.000 đ

4. **`Nhuộm Lông`** (0 - 50kg):
   - `Nhuộm: 1 Màu (2 Tai + Đuôi)`: 250.000 đ
   - `Nhuộm: 1 Màu (2 Tai + Đuôi + 4 Chân)`: 350.000 đ
   - `Nhuộm: Trên 2 Màu (2 Tai + Đuôi)`: 350.000 đ
   - `Nhuộm: Trên 2 Màu (2 Tai + Đuôi + 4 Chân)`: 450.000 đ

5. **`Trị Liệu & Phụ Thu`**:
   - `Tắm trị liệu / Nấm da`:
     - 0 - 5kg: 50.000 đ
     - >5 - 10kg: 70.000 đ
     - >10 - 15kg: 90.000 đ
   - `Phụ thu gỡ rối lông` (0 - 50kg): 50.000 đ
   - `Cắt tỉa đầu` (0 - 50kg): 50.000 đ
   - `Tẩy lông (Dưới 5kg)` (0 - 5kg): 50.000 đ
   - `Tẩy lông (Trên 5kg)` (>5 - 50kg): 80.000 đ
   - `Đánh răng` (0 - 50kg): 20.000 đ

---

## 2. Kế Hoạch Triển Khai (Execution Steps)

1. **Import Script (`scripts/import_pet_pricing_excel.py`)**:
   - Đọc file Excel từ đường dẫn attachment.
   - Parse các dải cân nặng thành `min_weight`, `max_weight`.
   - Xóa dữ liệu mẫu cũ trong `pet_service_pricing` và INSERT 63 dòng mới.
2. **UI Cập nhật (`templates/index.html`)**:
   - Cập nhật dropdown `#pet-pricing-filter-cat` (Lọc theo 5 phân loại).
   - Cập nhật modal thêm/sửa `#pet-pricing-input-cat`.
   - Cập nhật dropdown chọn dịch vụ chính `#svc-primary-package` và nhuộm `#svc-dye-package` trong form tiếp nhận dịch vụ.
3. **Logic tính giá tự động (`static/js/app.js`)**:
   - Đồng bộ danh mục và điều chỉnh hàm `autoCalculateServicePrice()` khớp chính xác tên gói dịch vụ mới.
4. **Kiểm thử (`tests/test_pet_pricing_import.py`)**:
   - Kiểm tra số lượng bản ghi, kiểm tra tính đúng đắn của logic tính giá theo cân nặng.
