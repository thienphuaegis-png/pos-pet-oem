# Kế Hoạch Triển Khai Nâng Cấp Tác Nhân AI Thông Minh

> **For agentic workers:** REQUIRED SUB-SKILL: Use executing-plans.

**Goal:** Trang bị tri thức CSDL xưởng OEM/sản phẩm cho Tác nhân AI, nhận diện chuẩn xác đơn OEM (Lucky Star, 4 món nước lau sàn GC244..GC247, VAT, CK, Cọc), cho phép chỉnh tay loại đơn trên UI và 1-chạm điền thẳng vào form OEM.

**Architecture:** 
1. `routers/ai_assistant.py`: Nạp graph dữ liệu `supplier_items` + `products` theo từng xưởng gia công vào context prompt Gemini Vision và thuật toán heuristic fallback. Nhận diện các từ khóa `GC...`, "Phụ lục", "Cọc đợt 1", "Còn lại khi nhận hàng" để tự động gán `oem_order`, `partner_id=10 (Lucky Star)`, bóc tách `vat_percent`, `discount_percent`, `deposit_amount`, `remaining_payment`.
2. `static/js/modules/ai_agent.js`: Thêm dropdown đổi loại đơn thủ công, hiển thị các trường tài chính OEM (VAT, CK, Cọc), và cài đặt hàm `createAIOEMOrder()` liên kết với `openModalCreateOEM()` trong `productions.js`.
3. `tests/test_ai_agent_smart_oem.py`: Unit test kiểm thử nhận diện và trích xuất dữ liệu OEM.

## Task 1: Backend Context Injection & OEM Extraction
- [ ] **Step 1: Viết test backend kiểm tra nhận diện OEM và context xưởng**
- [ ] **Step 2: Cập nhật routers/ai_assistant.py nạp context xưởng & sản phẩm và bóc tách OEM**
- [ ] **Step 3: Chạy pytest xác nhận pass**

## Task 2: Frontend UI Override Dropdown & 1-Chạm Tạo Đơn OEM
- [ ] **Step 1: Cập nhật static/js/modules/ai_agent.js hỗ trợ dropdown chọn loại đơn, hiển thị VAT/CK/Cọc và hàm `createAIOEMOrder()`**
- [ ] **Step 2: Cập nhật templates/index.html hiển thị ô chọn dropdown loại đơn và badge tài chính OEM**
- [ ] **Step 3: Chạy test giao diện xác nhận các thẻ và luồng hoạt động chính xác**

## Task 3: Build & Đóng Gói
- [ ] **Step 1: Chạy build lại POS_Mastercare.exe và cập nhật version.json**
- [ ] **Step 2: Commit và push git**
