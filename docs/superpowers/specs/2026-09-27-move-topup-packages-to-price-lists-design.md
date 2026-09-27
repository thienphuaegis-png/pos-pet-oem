# Thiết kế: Di chuyển Bảng Gói Nạp Ví Spa vào Tab Bảng Giá (bill-4)

**Ngày:** 2026-09-27  
**Mục tiêu:** Di chuyển phân hệ quản lý Gói Nạp Ví Spa (Prepaid) từ Tab Cài Đặt sang Tab Bảng Giá dạng sub-tab thứ 4, không thay đổi bất kỳ logic nghiệp vụ hoặc modal thêm/sửa/xóa nào khác.

---

## 1. Thay đổi Cấu trúc DOM (`templates/index.html`)

### 1.1. Tab Bảng Giá (`#tab-price-lists`)
- Bổ sung nút sub-tab thứ 4 trên thanh header điều hướng sub-tabs:
  ```html
  <button id="btn-subtab-pl-topup" onclick="switchPriceListSubTab('topup')" class="px-4 py-2.5 text-sm font-semibold text-slate-500 hover:text-slate-700 flex items-center gap-2 transition">
      <i class="fa-solid fa-credit-card"></i> 💳 Gói Nạp Ví Spa
  </button>
  ```
- Di chuyển container bảng danh sách gói nạp từ Cài Đặt về `#tab-price-lists`, đổi ID thành `#pl-subtab-topup` (kế thừa đầy đủ `id="topup-packages-tbody"`, nút `openTopupPackageModal()`).

### 1.2. Tab Cài Đặt (`#tab-settings`)
- Gỡ bỏ nút menu sidebar `Gói Nạp Ví Spa`:
  `<button onclick="switchSettingsSubTab('topup-packages')" ...>`

---

## 2. Thay đổi Logic Điều Hướng (`templates/index.html`)
- Cập nhật hàm `switchPriceListSubTab(sub)`:
  - Thêm phần tử `tabTopup = document.getElementById('pl-subtab-topup')` và `btnTopup = document.getElementById('btn-subtab-pl-topup')` vào danh sách reset trạng thái active.
  - Bổ sung điều kiện `else if (sub === 'topup')`:
    - Hiển thị `#pl-subtab-topup`.
    - Active viền & màu chữ cho `#btn-subtab-pl-topup`.
    - Kích hoạt gọi hàm `loadTopupPackagesList()` để tải danh sách gói từ server.

---

## 3. Tiêu chí nghiệm thu (Acceptance Criteria)
1. Khi click Tab Bảng Giá (`tab-price-lists`): Có 4 sub-tab: `🏷️ Bảng Giá & Ma Trận Giá SP`, `👥 Phân Nhóm & Thăng Hạng`, `🎁 Chương Trình Khuyến Mãi`, và `💳 Gói Nạp Ví Spa`.
2. Khi chuyển sang sub-tab `💳 Gói Nạp Ví Spa`: Danh sách gói topup được hiển thị chuẩn xác (gọi `GET /api/topup/packages`), các nút Thêm gói, Sửa, Xóa hoạt động bình thường.
3. Tab Cài Đặt không còn nút menu `Gói Nạp Ví Spa`.
4. Không làm ảnh hưởng đến modal nạp ví của khách tại quầy bán lẻ / Spa.
5. Kiểm thử tự động: Viết test kiểm tra DOM và chạy toàn bộ test suite pytest.
