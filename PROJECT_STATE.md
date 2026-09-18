# PROJECT STATE — POS Offline (Spa Thú Cưng)

**Checkpoint:** 2026-09-18 ~23h  
**Commit trước đó:** `00b35d5` (checkpoint hoàn chỉnh trước khi bắt đầu gom cột)  
**Server:** `http://127.0.0.1:8999` — FastAPI + SQLite (`data/pos.db`)  
**Working dir:** `D:/Projects_Hermes/pos-offline`

---

## Đã Hoàn Thành ✅

### Hạ tầng Spa
- Bảng `spa_staff` (4 NV mẫu: Bé Ngọc, Thanh Vân, Huyền Trân, Cún) + CRUD API + sub-tab `👥 Nhân Viên Spa`
- Bảng `pet_service_pricing` (39 records, 13 gói × 3 hạng cân) + sub-tab `💰 Bảng Giá` + filter theo gói/hạng
- `pet_service_tickets` mở rộng 13 cột mới: `staff_receiver`, `staff_worker_1/2`, `staff_cutter`, `staff_dyer`, `surcharge`, `art_cutting_fee`, `teeth_cleaning`, `shipping_fee`, `tip_amount`, `received_time`, `arrival_method`, `checkout_time`, `return_method`, `call_status`
- STT phiếu: random 5–10 đầu ngày, sau đó tăng dần
- `received_time` = auto giờ bấm bill; `checkout_time` = auto khi đổi trạng thái `🏠 Đã Về`

### Tách Phiếu 2 Giai Đoạn
- **Modal Tiếp Nhận** (`#modal-create-service-ticket`): Chỉ nhập khách, bé, dịch vụ, cân nặng, hình thức đến, thanh toán trước/sau
- **Modal Vận Hành** (`#modal-service-progress`): Phân công 5 thợ, 5 loại phụ phí, hình thức về, ghi chú — cập nhật trong quá trình làm

### UI Trực Quan
- Dropdown giống loài: 21 giống có emoji (🐩 Poodle, 🦊 Phốc Sóc, 🍑 Corgi...)
- Dropdown màu lông: 20 màu có color swatch (🟤 Nâu, ⚪ Trắng, ⬛ Đen...)
- Dropdown hình thức đến/về: tùy chỉnh (🚗 Khách chở, 🛵 Shop đón, 🚶 Tự đến...)
- Trạng thái 4 mức 2 chiều: ⏳ Chờ → 🔄 Đang làm → ✅ Xong → 🏠 Đã Về
- Cột gọi điện: dropdown 4 trạng thái (📞 Chưa gọi, ✅ Đã gọi đón, ❌ Không nghe, ⏰ Hẹn giờ)
- In phiếu K80 trực tiếp

---

## Đang Làm Dở 🔧 (Mai Tiếp)

### Thiết kế đã approve, đang triển khai Giai Đoạn 1:
**File thiết kế:** `plans/2026-09-18-pet-spa-kanban-calendar-print-design.md`  
**File kế hoạch:** `plans/2026-09-18-pet-spa-kanban-calendar-print-plan.md`

### 1. Gom Cụm Cột Bảng + Chữ To (ĐÃ PATCH HTML, CHƯA PATCH JS)
- ✅ HTML `<thead>` đã đổi sang 13 cột gom cụm (Cụm trái: Thợ Spa | Cụm phải: Thu Ngân)
- ✅ Font nâng từ `text-xs` lên `text-[13px]`, header `text-[11px]` uppercase bold
- ✅ Viền phân cách `border-r-2 border-purple-300` giữa 2 cụm
- ❌ **`renderPetServicesTable()` trong app.js CHƯA CẬP NHẬT** — vẫn render 19 cột `<td>` cũ, sẽ bị lệch với 13 cột `<th>` mới
- **Cần làm:** Viết lại phần `tbody.innerHTML = filtered.map(t => {...})` cho khớp 13 cột mới

### 2. Thanh Chuyển 3 View (ĐÃ CÓ HTML, CHƯA CÓ JS)
- ✅ HTML: 3 nút (📋 Bảng / 📌 Kanban / 📅 Lịch) + 3 container (`#spa-view-table`, `#spa-view-kanban`, `#spa-view-calendar`)
- ✅ HTML Kanban: 4 cột thẻ (Chờ / Đang Làm / Xong / Đã Về) với count badge
- ❌ **JS chưa có:** `switchSpaView(view)`, `renderKanbanBoard()`, `renderCalendarTimeline()`

### 3. Mẫu In Riêng (CHƯA BẮT ĐẦU)
- **Phiếu Tiếp Nhận K80**: In khi nhận bé — 2 ô chữ ký (NV tiếp nhận + Khách gửi bé)
- **Phiếu Thanh Toán K80**: In khi trả bé — đầy đủ phụ thu, tổng tiền, giờ nhận/về

---

## Thứ Tự Triển Khai Mai

1. **Patch `renderPetServicesTable()`** → render đúng 13 cột gom cụm mới
2. **Viết `switchSpaView(view)`** → toggle hiển thị 3 view
3. **Viết `renderKanbanBoard()`** → thẻ kéo thả 4 cột trạng thái
4. **Viết `renderCalendarTimeline()`** → timeline theo khung giờ trong ngày
5. **Tách mẫu in**: Phiếu tiếp nhận (2 chữ ký) vs Phiếu thanh toán
6. Nâng version `?v=` + test toàn bộ

---

## Files Chính

| File | Vai trò |
|------|---------|
| `routers/partners.py` | API: contacts, pets, pet-services (tickets, pricing, staff, call-status, progress) |
| `templates/index.html` | SPA UI: 3 sub-tab spa, modal tạo phiếu, modal tiến độ, modal NV, modal bảng giá |
| `static/js/app.js` | Logic SPA toàn bộ (~9000 dòng) |
| `data/pos.db` | SQLite: pets, pet_service_tickets, pet_service_pricing, spa_staff |

## DB Schema Quan Trọng

```
spa_staff: id, name, role, phone, active
pet_service_tickets: id, code, ticket_number, ticket_date, customer_id, customer_name, customer_phone,
  pet_name, pet_breed, pet_species, pet_color, pet_gender, weight_at_service,
  service_type, dye_package, shaving_feet, customer_request, accessories, note,
  staff_receiver, staff_worker_1, staff_worker_2, staff_cutter, staff_dyer,
  surcharge, art_cutting_fee, teeth_cleaning, shipping_fee, tip_amount,
  received_time, arrival_method, checkout_time, return_method, call_status,
  price, payment_status, payment_method, status, created_at
```
