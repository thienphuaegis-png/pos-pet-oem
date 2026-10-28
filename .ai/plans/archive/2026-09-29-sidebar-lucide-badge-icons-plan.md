# Sidebar Lucide Badge Icons Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use subagent-driven-development or executing-plans.

**Goal:** Thay thế toàn bộ 14 emoji ở thanh Sidebar trong `templates/index.html` bằng icon vector Lucide kèm khung badge nền màu chuẩn hiện đại, hoạt động 100% offline.

**Architecture:** Sử dụng trực tiếp inline SVG tối ưu bên trong các thẻ `<span class="sidebar-icon">` kết hợp class Tailwind cho badge nền màu (`w-6.5 h-6.5 rounded-lg flex items-center justify-center`). Không phụ thuộc external CDN hay file font lớn.

**Tech Stack:** HTML5, Tailwind CSS, Inline SVG (Lucide icon set).

## File Structure
| File | Responsibility |
|---|---|
| `templates/index.html:644-703` | Modify: Cập nhật 14 nút điều hướng sidebar sang Lucide badge icons |
| `tests/test_html_integrity.py` | Modify: Bổ sung kiểm tra DOM sidebar có đủ 14 SVG icon và không còn emoji cũ |

## Tasks

### Task 1: Cập nhật kiểm tra cấu trúc DOM trong Unit Test
**Files:**
- Modify: `tests/test_html_integrity.py`

- [ ] **Step 1:** Thêm test case `test_sidebar_lucide_badge_icons` kiểm tra tất cả 14 nút sidebar đều có SVG và badge nền màu tương ứng.
- [ ] **Step 2:** Chạy test để xác nhận test FAIL (vì hiện tại index.html vẫn đang dùng emoji).

### Task 2: Cập nhật 14 nút Sidebar trong `templates/index.html`
**Files:**
- Modify: `templates/index.html:644-703`

- [ ] **Step 1:** Cập nhật 14 nút sidebar với inline SVG và badge Tailwind:
  1. `pos`: Shopping Cart (`bg-sky-100 text-sky-600`)
  2. `pet-services`: Paw Print (`bg-pink-100 text-pink-600`)
  3. `hotel`: Bed (`bg-purple-100 text-purple-600`)
  4. `orders`: Receipt (`bg-amber-100 text-amber-600`)
  5. `price-lists`: Tag (`bg-emerald-100 text-emerald-600`)
  6. `inventory`: Package (`bg-orange-100 text-orange-600`)
  7. `purchases`: Truck/Inbox (`bg-indigo-100 text-indigo-600`)
  8. `oem`: Factory (`bg-cyan-100 text-cyan-600`)
  9. `contacts`: Users (`bg-rose-100 text-rose-600`)
  10. `cashbook`: Wallet (`bg-green-100 text-green-600`)
  11. `cashflow-debts`: Landmark (`bg-teal-100 text-teal-600`)
  12. `reports`: BarChart3 (`bg-violet-100 text-violet-600`)
  13. `shifts`: Clock (`bg-yellow-100 text-yellow-700`)
  14. `settings`: Settings (`bg-slate-200 text-slate-700`)
- [ ] **Step 2:** Chạy test `pytest tests/test_html_integrity.py` xác nhận PASS 100%.
- [ ] **Step 3:** Kiểm tra visual trên trình duyệt hoặc preview để đảm bảo căn lề và khi collapse sidebar không bị lệch.
- [ ] **Step 4:** Commit và push code lên GitHub.
