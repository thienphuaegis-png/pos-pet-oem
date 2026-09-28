# Phase C+D: Phiếu dịch vụ spa + POS/UX — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use subagent-driven-development hoặc executing-plans.

**Goal:** Bỏ lịch hẹn + đưa đón khỏi form tạo phiếu spa, thêm gửi hotel, popup lịch sử spa theo thú cưng, nút lịch sử mua hàng ở POS, zoom UI toàn hệ thống.

**Architecture:** Vanilla JS (app.js) + FastAPI routers (partners.py) + SQLite (database.py). Không thêm dependency, không thêm framework FE.

**Tech Stack:** FastAPI, sqlite3, Jinja templates (index.html), vanilla JS.

## Global Constraints

- Không đổi tên cột/route hiện có, chỉ thêm.
- Mọi `ALTER TABLE` phải idempotent (check cột tồn tại trước khi add).
- Giữ nguyên style Tailwind class pattern đang dùng trong file.
- Test bằng cách gọi trực tiếp qua sqlite3 script + `node --check` cho JS + import server.py.

## File Structure

| File | Responsibility |
|---|---|
| `database.py` | Modify — thêm migration `send_to_hotel` cột trong `pet_service_tickets`, idempotent |
| `schemas.py` | Modify — `PetServiceCreate` thêm field `send_to_hotel: Optional[int] = 0` |
| `routers/partners.py:713-782` (`create_pet_service`) | Modify — insert `send_to_hotel`; xóa gửi `appointment_time`/`has_transport` mặc định giữ nguyên (không đổi) |
| `routers/partners.py` | Create — route `GET /api/pets/{pet_id}/service-history?limit=10` |
| `routers/partners.py` hoặc router chung | Create — route `GET /api/contacts/{id}/purchase-history?from=&to=&type=` |
| `templates/index.html` | Modify — xóa ô lịch hẹn + hình thức đến khỏi form tạo; thêm checkbox gửi hotel; thêm nút lịch sử spa (panel phải); thêm nút lịch sử mua hàng ở POS; thêm control zoom trong Cài Đặt |
| `static/js/app.js` | Modify — bỏ đọc field đã xóa lúc submit; thêm `openPetSpaHistoryPanel()`, `openPurchaseHistoryModal()`, `applyAppZoom()`/zoom init |

## Task 1: Migration cột `send_to_hotel`

**Files:**
- Modify: `database.py` (hàm `init_db`, chỗ có các `ALTER TABLE ... ADD COLUMN` bảo vệ bằng try/except hiện có — theo pattern y hệt)

**Interfaces:**
- Produces: cột `pet_service_tickets.send_to_hotel INTEGER DEFAULT 0` sẵn sàng cho Task 2, 3

- [ ] **Step 1:** Tìm đoạn `init_db()` có pattern `try: cur.execute("ALTER TABLE pet_service_tickets ADD COLUMN ...")` hiện có, copy pattern
- [ ] **Step 2:** Thêm:
  ```python
  try:
      cur.execute("ALTER TABLE pet_service_tickets ADD COLUMN send_to_hotel INTEGER DEFAULT 0")
  except sqlite3.OperationalError:
      pass  # cột đã tồn tại
  ```
- [ ] **Step 3:** Verify: `./.venv/Scripts/python.exe -c "from database import init_db; init_db()"` rồi `PRAGMA table_info(pet_service_tickets)` phải thấy `send_to_hotel`
- [ ] **Step 4:** Verify chạy lại lần 2 không lỗi (idempotent)
- [ ] **Step 5:** Commit

## Task 2: Backend nhận `send_to_hotel` khi tạo phiếu

**Files:**
- Modify: `schemas.py` — thêm field vào `PetServiceCreate`
- Modify: `routers/partners.py:713-782` — thêm cột vào INSERT

**Interfaces:**
- Consumes: cột `send_to_hotel` từ Task 1
- Produces: `POST /api/pet-services` chấp nhận `send_to_hotel: 0|1`, phiếu list trả về field này

- [ ] **Step 1:** `schemas.py`, trong class `PetServiceCreate`, thêm dòng `send_to_hotel: Optional[int] = 0`
- [ ] **Step 2:** `routers/partners.py`, sửa câu INSERT (dòng ~739-758): thêm `send_to_hotel` vào danh sách cột + `?` placeholder + `ticket.send_to_hotel or 0` vào tuple giá trị
- [ ] **Step 3:** Verify: gọi thử qua sqlite3 trực tiếp insert 1 row test với `send_to_hotel=1`, SELECT lại xác nhận giá trị đúng
- [ ] **Step 4:** Verify `./.venv/Scripts/python.exe -c "from server import app"` import không lỗi
- [ ] **Step 5:** Commit

## Task 3: Sửa form tạo phiếu — bỏ lịch hẹn, bỏ hình thức đến, thêm checkbox hotel

**Files:**
- Modify: `templates/index.html` (~dòng 339982 khu vực `svc-appointment-time`, ~dòng 4693-4700 khu vực `svc-arrival-method`)
- Modify: `static/js/app.js` (`submitCreateServiceTicket`, dòng ~3128+, và `openCreateServiceTicketModal` reset logic)

**Interfaces:**
- Consumes: field `send_to_hotel` từ Task 2 model
- Produces: form tạo phiếu spa không còn 2 field cũ, có checkbox mới

- [ ] **Step 1:** Trong `templates/index.html`, xóa toàn bộ `<div>` chứa `svc-appointment-time` (label "Lịch Hẹn / Đón Bé")
- [ ] **Step 2:** Trong `templates/index.html`, xóa `<div>` chứa `svc-arrival-method` (KHỐI 5, giữ lại phần thanh toán TT bên cạnh nó — chỉ xóa phần "Hình thức đến")
- [ ] **Step 3:** Thêm checkbox gần khu vực "Lưu Ý Cạo Bàn":
  ```html
  <label class="flex items-center gap-1.5 text-xs font-semibold text-slate-700 bg-sky-50 border border-sky-200 rounded px-2 py-1.5 cursor-pointer">
      <input type="checkbox" id="svc-send-to-hotel" class="w-3.5 h-3.5">
      🏨 Spa xong gửi hotel
  </label>
  ```
- [ ] **Step 4:** `static/js/app.js`, hàm `submitCreateServiceTicket`, thêm vào body request: `send_to_hotel: document.getElementById('svc-send-to-hotel')?.checked ? 1 : 0`
- [ ] **Step 5:** `static/js/app.js`, hàm `openCreateServiceTicketModal`, reset: `document.getElementById('svc-send-to-hotel').checked = false;`
- [ ] **Step 6:** Verify: `node --check static/js/app.js` pass
- [ ] **Step 7:** Verify thủ công: mở app, tạo phiếu mới không còn thấy 2 field cũ, có checkbox mới, submit thành công, DB có `send_to_hotel=1` khi tick
- [ ] **Step 8:** Commit

## Task 4: Badge gửi hotel trong danh sách phiếu

**Files:**
- Modify: `static/js/app.js` (`renderActiveSpaView`, dòng ~2246-2338, chỗ render cột "5. Dịch vụ" hoặc "6. Lưu Yêu cầu")

**Interfaces:**
- Consumes: `t.send_to_hotel` từ API list (đã tự động có do SELECT * hoặc cần check SELECT trong GET "")
- Produces: badge 🏨 hiện trên dòng phiếu khi `send_to_hotel=1`

- [ ] **Step 1:** Kiểm tra route `@service_router.get("")` (dòng 687) SELECT có cột `*` hay liệt kê cột cụ thể — nếu liệt kê cụ thể, thêm `send_to_hotel` vào SELECT
- [ ] **Step 2:** Trong `renderActiveSpaView`, thêm vào cột "6. Lưu Yêu cầu" hoặc cột dịch vụ: `${t.send_to_hotel ? '<span class="bg-sky-100 text-sky-800 font-bold px-1.5 py-0.5 rounded text-[10px] mr-1">🏨 Gửi hotel</span>' : ''}`
- [ ] **Step 3:** Verify: `node --check static/js/app.js`
- [ ] **Step 4:** Verify thủ công: phiếu có tick hotel hiện badge trong bảng danh sách
- [ ] **Step 5:** Commit

## Task 5: API lịch sử spa theo thú cưng

**Files:**
- Create route trong: `routers/partners.py` (đặt cạnh các route `@service_router` khác, sau dòng 662 `/kpi`)
- Test: verify bằng terminal curl/sqlite trực tiếp (không cần file test riêng — dự án hiện không có pytest suite cho router này)

**Interfaces:**
- Produces: `GET /api/pets/{pet_id}/service-history?limit=10` → `[{id, code, ticket_date, service_type, price, status}, ...]` sort DESC theo `ticket_date`

- [ ] **Step 1:** Viết route:
  ```python
  @service_router.get("/pets/{pet_id}/history")
  def get_pet_service_history(pet_id: int, limit: int = 10):
      conn = get_db()
      cur = conn.cursor()
      cur.execute("""
          SELECT id, code, ticket_date, service_type, price, status, dye_package
          FROM pet_service_tickets
          WHERE pet_id = ?
          ORDER BY ticket_date DESC, id DESC
          LIMIT ?
      """, (pet_id, limit))
      rows = [dict(r) for r in cur.fetchall()]
      conn.close()
      return rows
  ```
  (Route path thực tế phụ thuộc prefix `service_router` = `/api/pet-services`, path cuối = `/api/pet-services/pets/{pet_id}/history` — kiểm tra không đụng route `/pricing`, `/staff`, `/{ticket_id}/...` đã có)
- [ ] **Step 2:** Verify import: `./.venv/Scripts/python.exe -c "from server import app; print('OK')"`
- [ ] **Step 3:** Verify data: start server tạm, `curl http://127.0.0.1:8999/api/pet-services/pets/1/history`, so khớp dữ liệu seed đã có (pet_id=1 "Miu")
- [ ] **Step 4:** Commit

## Task 6: [DONE] Popup lịch sử spa trong form tạo phiếu

**Files:**
- Modify: `templates/index.html` — thêm nút cạnh dropdown "Chọn Bé Cũ", thêm panel/modal lịch sử bên phải
- Modify: `static/js/app.js` — hàm `openPetSpaHistoryPanel(petId)`, gọi trong `onSvcPetChanged`

**Interfaces:**
- Consumes: API Task 5
- Produces: panel/modal hiển thị tối đa 10 dòng lịch sử của đúng pet đang chọn

- [ ] **Step 1:** Thêm nút trong `templates/index.html` cạnh select `svc-pet-id`:
  ```html
  <button type="button" id="svc-pet-history-btn" onclick="openPetSpaHistoryPanel()"
      class="text-[11px] text-purple-600 font-semibold underline disabled:text-slate-300 disabled:no-underline"
      title="Bé mới chưa có lịch sử">📜 Lịch sử spa</button>
  ```
- [ ] **Step 2:** Thêm panel cố định bên phải modal (absolute/fixed, ẩn mặc định):
  ```html
  <div id="svc-pet-history-panel" class="hidden fixed top-1/2 right-4 -translate-y-1/2 w-72 max-h-[70vh] overflow-y-auto bg-white border border-purple-200 rounded-lg shadow-xl z-40 p-3">
      <div class="flex justify-between items-center mb-2">
          <strong class="text-xs text-purple-700">📜 Lịch sử spa gần đây</strong>
          <button onclick="document.getElementById('svc-pet-history-panel').classList.add('hidden')" class="text-slate-400 hover:text-slate-600">✕</button>
      </div>
      <div id="svc-pet-history-list" class="space-y-1.5 text-[11px]"></div>
  </div>
  ```
- [ ] **Step 3:** `static/js/app.js`, thêm:
  ```javascript
  async function openPetSpaHistoryPanel() {
      const petIdVal = document.getElementById('svc-pet-id')?.value;
      const panel = document.getElementById('svc-pet-history-panel');
      const list = document.getElementById('svc-pet-history-list');
      if (!petIdVal || petIdVal === '__new__' || !panel || !list) return;
      list.innerHTML = '<div class="text-slate-400">Đang tải...</div>';
      panel.classList.remove('hidden');
      try {
          const res = await fetch(`/api/pet-services/pets/${petIdVal}/history?limit=10`);
          const rows = await res.json();
          if (!Array.isArray(rows) || rows.length === 0) {
              list.innerHTML = '<div class="text-slate-400">Chưa có lịch sử</div>';
              return;
          }
          list.innerHTML = rows.map(r => `
              <div class="border-b border-slate-100 pb-1">
                  <div class="font-semibold text-slate-700">${r.ticket_date} — ${r.service_type}</div>
                  <div class="text-slate-500">${(r.price||0).toLocaleString('vi-VN')}đ · ${r.status}</div>
              </div>
          `).join('');
      } catch(e) {
          list.innerHTML = '<div class="text-rose-500">Lỗi tải lịch sử</div>';
      }
  }
  ```
- [ ] **Step 4:** Trong `onSvcPetChanged(petId)`, cuối hàm thêm logic enable/disable nút:
  ```javascript
  const historyBtn = document.getElementById('svc-pet-history-btn');
  if (historyBtn) {
      const hasRealPet = petId && petId !== '__new__';
      historyBtn.disabled = !hasRealPet;
  }
  document.getElementById('svc-pet-history-panel')?.classList.add('hidden');
  ```
- [ ] **Step 5:** Trong `openCreateServiceTicketModal`, reset: ẩn panel, disable nút mặc định (chưa chọn bé)
- [ ] **Step 6:** Verify `node --check static/js/app.js`
- [ ] **Step 7:** Verify thủ công: chọn bé cũ có lịch sử (vd "Miu") → bấm nút → panel hiện đúng dữ liệu ≤10 dòng; chọn "+ Thêm bé mới" → nút disable
- [ ] **Step 8:** Commit

## Task 7: [DONE] API lịch sử mua hàng gộp (orders + services) theo khách

**Files:**
- Create route trong: `routers/partners.py` hoặc router phù hợp có sẵn `get_db`/`allContacts` context (kiểm tra router nào đang handle `/api/contacts/*`)

**Interfaces:**
- Produces: `GET /api/contacts/{id}/purchase-history?date_from=&date_to=&type=orders|services|all`
  → `[{date, type, code, total, status}, ...]` sort DESC theo date

- [ ] **Step 1:** Tìm router hiện quản lý `/api/contacts` (search `@router.get("/contacts` hoặc tương tự) để đặt route cạnh, tái dùng `get_db`
- [ ] **Step 2:** Kiểm tra schema bảng `orders` (`PRAGMA table_info(orders)`) lấy đúng tên cột (customer_id, created_at, total, status, code/order_number)
- [ ] **Step 3:** Viết route:
  ```python
  @router.get("/contacts/{contact_id}/purchase-history")
  def get_contact_purchase_history(contact_id: int, date_from: str = None, date_to: str = None, type: str = "all"):
      conn = get_db()
      cur = conn.cursor()
      results = []
      if type in ("all", "orders"):
          q = "SELECT id, order_number as code, created_at as date, total_amount as total, status FROM orders WHERE customer_id = ?"
          params = [contact_id]
          if date_from:
              q += " AND date(created_at) >= ?"; params.append(date_from)
          if date_to:
              q += " AND date(created_at) <= ?"; params.append(date_to)
          cur.execute(q, params)
          results += [dict(r, type="order") for r in cur.fetchall()]
      if type in ("all", "services"):
          q = "SELECT id, code, ticket_date as date, price as total, status FROM pet_service_tickets WHERE customer_id = ?"
          params = [contact_id]
          if date_from:
              q += " AND ticket_date >= ?"; params.append(date_from)
          if date_to:
              q += " AND ticket_date <= ?"; params.append(date_to)
          cur.execute(q, params)
          results += [dict(r, type="service") for r in cur.fetchall()]
      conn.close()
      results.sort(key=lambda r: r["date"] or "", reverse=True)
      return results
  ```
  (Cột thực tế `orders` cần verify Step 2 trước khi hardcode tên)
- [ ] **Step 4:** Verify import server OK
- [ ] **Step 5:** Verify data thực qua curl với 1 contact_id có cả order và service (nếu chưa có order mẫu, note rõ trong kết quả verify — không seed order giả để test, dùng service ticket đã seed)
- [ ] **Step 6:** Commit

## Task 8: [DONE] Nút + Modal lịch sử mua hàng trên POS

**Files:**
- Modify: `templates/index.html` — tìm khu vực hiện tên khách đã chọn trong tab bán hàng (POS), thêm nút; thêm modal lịch sử
- Modify: `static/js/app.js` — hàm `openPurchaseHistoryModal()`, filter theo date range + type, click 1 dòng mở chi tiết

**Interfaces:**
- Consumes: API Task 7
- Produces: modal filter + list + xem chi tiết 1 đơn

- [ ] **Step 1:** Tìm trong `templates/index.html` khu vực POS hiện `pos-customer` (dòng ~1613 theo grep trước) để biết chỗ đặt nút cạnh tên khách đã chọn
- [ ] **Step 2:** Thêm nút "🧾 Lịch sử mua hàng" cạnh khu vực đó (chỉ hiện khi đã chọn khách — theo cùng điều kiện hiện có đang show/hide info khách)
- [ ] **Step 3:** Thêm modal HTML: 2 input date (from/to), 2 checkbox (Hàng hóa / Dịch vụ, mặc định cả 2 check), nút "Lọc", khu vực list kết quả, nút đóng
- [ ] **Step 4:** `static/js/app.js`:
  ```javascript
  async function openPurchaseHistoryModal() {
      const custId = /* lấy từ state POS hiện tại, biến đã có sẵn cho khách đang chọn */;
      if (!custId) return;
      document.getElementById('modal-purchase-history').classList.remove('hidden');
      await loadPurchaseHistory(custId);
  }
  async function loadPurchaseHistory(custId) {
      const from = document.getElementById('ph-date-from')?.value || '';
      const to = document.getElementById('ph-date-to')?.value || '';
      const wantOrders = document.getElementById('ph-type-orders')?.checked;
      const wantServices = document.getElementById('ph-type-services')?.checked;
      const type = (wantOrders && wantServices) ? 'all' : (wantOrders ? 'orders' : (wantServices ? 'services' : 'all'));
      const params = new URLSearchParams({type});
      if (from) params.set('date_from', from);
      if (to) params.set('date_to', to);
      const res = await fetch(`/api/contacts/${custId}/purchase-history?${params}`);
      const rows = await res.json();
      const list = document.getElementById('ph-result-list');
      if (!Array.isArray(rows) || rows.length === 0) {
          list.innerHTML = '<div class="text-slate-400 text-xs p-3">Không có dữ liệu</div>';
          return;
      }
      list.innerHTML = rows.map(r => `
          <div class="border-b p-2 text-xs cursor-pointer hover:bg-purple-50" onclick="viewPurchaseHistoryDetail('${r.type}', ${r.id})">
              <div class="flex justify-between">
                  <span class="font-semibold">${r.code || '-'}</span>
                  <span>${(r.total||0).toLocaleString('vi-VN')}đ</span>
              </div>
              <div class="text-slate-400">${r.date} · ${r.type === 'order' ? '🛒 Hàng hóa' : '🐾 Dịch vụ'} · ${r.status}</div>
          </div>
      `).join('');
  }
  function viewPurchaseHistoryDetail(type, id) {
      // reuse view đã có: nếu type==='order' mở modal xem đơn hàng hiện có; nếu 'service' mở openServiceProgressModal(id)
      if (type === 'service') { openServiceProgressModal(id); return; }
      /* gọi hàm xem chi tiết order hiện có trong pos.js/app.js nếu tồn tại, nếu chưa có route/hàm sẵn thì mở tab đơn hàng lọc theo id */
  }
  ```
- [ ] **Step 5:** Trước khi code Step 4 dòng cuối `viewPurchaseHistoryDetail` cho `type==='order'`, tìm hàm xem chi tiết đơn hàng hiện có trong `app.js`/`pos.js` (search `function.*[Oo]rderDetail` hoặc `viewOrder`) để tái dùng đúng — không tạo view mới trùng lặp
- [ ] **Step 6:** Verify `node --check static/js/app.js`
- [ ] **Step 7:** Verify thủ công: chọn khách ở POS có sẵn service ticket (vd customer_id=6) → bấm nút → modal hiện danh sách, filter theo type/date hoạt động đúng, click vào dòng dịch vụ mở lại đúng phiếu
- [ ] **Step 8:** Commit

## Task 9: [DONE] Zoom giao diện toàn hệ thống

**Files:**
- Modify: `templates/index.html` — tab Cài Đặt, thêm control zoom
- Modify: `static/js/app.js` — hàm `applyAppZoom(delta)`, init lúc load

**Interfaces:**
- Produces: `localStorage.appZoom` (string number, vd "110"), áp `document.documentElement.style.zoom` hoặc `document.body.style.zoom`

- [ ] **Step 1:** Trong tab Cài Đặt (`templates/index.html`, tìm khu vực settings hiện có bằng `id="tab-settings"` hoặc tương đương), thêm block:
  ```html
  <div class="bg-white p-3 rounded-lg border">
      <label class="font-bold text-xs text-slate-700 block mb-2">🔍 Kích thước giao diện</label>
      <div class="flex items-center gap-2">
          <button onclick="applyAppZoom(-10)" class="px-3 py-1 border rounded font-bold">−</button>
          <span id="app-zoom-display" class="w-14 text-center font-bold">100%</span>
          <button onclick="applyAppZoom(10)" class="px-3 py-1 border rounded font-bold">+</button>
      </div>
  </div>
  ```
- [ ] **Step 2:** `static/js/app.js`, thêm ở đầu file (chạy sớm nhất có thể, trước DOMContentLoaded nếu file cho phép, hoặc trong khối init hiện có):
  ```javascript
  function applyAppZoom(delta) {
      let current = parseInt(localStorage.getItem('appZoom') || '100', 10);
      current = Math.min(150, Math.max(80, current + delta));
      localStorage.setItem('appZoom', String(current));
      document.body.style.zoom = (current / 100);
      const disp = document.getElementById('app-zoom-display');
      if (disp) disp.textContent = current + '%';
  }
  function initAppZoom() {
      const saved = parseInt(localStorage.getItem('appZoom') || '100', 10);
      document.body.style.zoom = (saved / 100);
      const disp = document.getElementById('app-zoom-display');
      if (disp) disp.textContent = saved + '%';
  }
  ```
- [ ] **Step 3:** Gọi `initAppZoom()` trong khối init hiện có (tìm `document.addEventListener('DOMContentLoaded'` hoặc hàm init chính đang tồn tại trong app.js — gắn vào đó, không tạo listener trùng)
- [ ] **Step 4:** Verify `node --check static/js/app.js`
- [ ] **Step 5:** Verify thủ công: bấm +/- vài lần, giao diện to/nhỏ theo, reload trang vẫn giữ mức đã chọn
- [ ] **Step 6:** Commit

## Self-Review Checklist (thực hiện sau khi xong tất cả task)

- [ ] Spec coverage: 6 mục trong design doc đều có task tương ứng (Task 3=zoom X sai thứ tự — thực ra Task 9=zoom, Task 3=bỏ field+hotel, Task 4=badge, Task 5+6=lịch sử spa, Task 7+8=lịch sử mua hàng) — khớp đủ
- [ ] Không còn placeholder "TBD"/"tương tự"
- [ ] `node --check static/js/app.js` pass sau mỗi task
- [ ] `./.venv/Scripts/python.exe -c "from server import app"` pass sau mỗi task backend
- [ ] DB thực tế verify bằng sqlite3 trực tiếp, không mock

## Execution Handoff

Plan complete và lưu tại `docs/superpowers/plans/2026-09-23-spa-ticket-pos-ux-plan.md`.

**Chọn hướng thực thi:**
1. **Inline Execution** — làm luôn trong session này theo thứ tự Task 1→9, checkpoint sau mỗi task
2. **Subagent-Driven** — mỗi task 1 subagent riêng, review giữa các task
