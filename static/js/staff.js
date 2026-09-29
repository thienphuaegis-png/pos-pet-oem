// ── Quản lý Nhân Viên (Settings > Nhân Viên) ──

const ROLE_LABEL = { owner: '👑 Chủ Shop', cashier: '🏷 Thu Ngân', accountant: '📒 Kế Toán', warehouse: '📦 Thủ Kho' };

async function loadStaffList() {
  const tbody = document.getElementById('staff-table-body');
  if (!tbody) return;
  tbody.innerHTML = `<tr><td colspan="7" class="p-4 text-center text-gray-400">Đang tải...</td></tr>`;
  try {
    const res = await fetch('/api/auth/staff');
    if (!res.ok) { tbody.innerHTML = `<tr><td colspan="7" class="p-4 text-center text-rose-500">Không có quyền xem</td></tr>`; return; }
    const rows = await res.json();
    if (!rows.length) { tbody.innerHTML = `<tr><td colspan="7" class="p-4 text-center text-gray-400">Chưa có nhân viên</td></tr>`; return; }
    tbody.innerHTML = rows.map(r => `
      <tr class="border-t hover:bg-slate-50">
        <td class="p-2.5 font-semibold">${r.name}</td>
        <td class="p-2.5 font-mono">${r.username || '-'}</td>
        <td class="p-2.5">${ROLE_LABEL[r.role] || r.role}</td>
        <td class="p-2.5">${r.phone || '-'}</td>
        <td class="p-2.5 text-right">${r.commission_rate || 0}%</td>
        <td class="p-2.5 text-center">${r.is_active ? '<span class="px-2 py-0.5 rounded bg-emerald-100 text-emerald-700 font-bold">Hoạt động</span>' : '<span class="px-2 py-0.5 rounded bg-slate-200 text-slate-600 font-bold">Đã khóa</span>'}</td>
        <td class="p-2.5 text-center">
          <button onclick="openEditStaffModal(${r.id}, '${(r.name||'').replace(/'/g, "\\'")}', '${r.role}', '${(r.phone||'').replace(/'/g, "\\'")}', ${r.commission_rate || 0}, ${r.is_active})" class="text-sky-600 hover:underline text-[11px] font-bold mr-2">Sửa</button>
          <button onclick="resetStaffPassword(${r.id})" class="text-amber-600 hover:underline text-[11px] font-bold mr-2">Reset MK</button>
          <button onclick="toggleStaffActive(${r.id}, ${r.is_active})" class="text-rose-600 hover:underline text-[11px] font-bold">${r.is_active ? 'Khóa' : 'Mở khóa'}</button>
        </td>
      </tr>
    `).join('');
  } catch (e) {
    tbody.innerHTML = `<tr><td colspan="7" class="p-4 text-center text-rose-500">Lỗi tải dữ liệu</td></tr>`;
  }
}

function openCreateStaffModal() {
  const titleEl = document.getElementById('modal-staff-title');
  if (titleEl) titleEl.innerHTML = '<span>👤</span> <span>Thêm Nhân Viên</span>';
  document.getElementById('staff-edit-id').value = '';
  document.getElementById('staff-name').value = '';
  document.getElementById('staff-username').value = '';
  document.getElementById('staff-password').value = '';
  document.getElementById('staff-role').value = 'cashier';
  document.getElementById('staff-phone').value = '';
  document.getElementById('staff-commission').value = 0;
  document.getElementById('staff-username').disabled = false;
  document.getElementById('staff-password-row').style.display = '';
  const modal = document.getElementById('modal-staff');
  if (modal) {
    modal.classList.remove('hidden');
    modal.style.display = 'flex';
  }
}

function openEditStaffModal(id, name, role, phone, commission, isActive) {
  const titleEl = document.getElementById('modal-staff-title');
  if (titleEl) titleEl.innerHTML = '<span>👤</span> <span>Sửa Nhân Viên</span>';
  document.getElementById('staff-edit-id').value = id;
  document.getElementById('staff-name').value = name;
  document.getElementById('staff-username').value = '';
  document.getElementById('staff-username').disabled = true;
  document.getElementById('staff-password-row').style.display = 'none';
  document.getElementById('staff-role').value = role;
  document.getElementById('staff-phone').value = phone;
  document.getElementById('staff-commission').value = commission;
  const modal = document.getElementById('modal-staff');
  if (modal) {
    modal.classList.remove('hidden');
    modal.style.display = 'flex';
  }
}

function closeStaffModal() {
  const modal = document.getElementById('modal-staff');
  if (modal) {
    modal.classList.add('hidden');
    modal.style.display = 'none';
  }
}
window.closeStaffModal = closeStaffModal;

async function submitStaffForm() {
  const id = document.getElementById('staff-edit-id').value;
  const name = document.getElementById('staff-name').value.trim();
  const role = document.getElementById('staff-role').value;
  const phone = document.getElementById('staff-phone').value.trim();
  const commission_rate = parseFloat(document.getElementById('staff-commission').value) || 0;
  if (!name) { alert('Vui lòng nhập họ tên'); return; }

  try {
    let res;
    if (id) {
      res = await fetch(`/api/auth/staff/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, role, phone, commission_rate })
      });
    } else {
      const username = document.getElementById('staff-username').value.trim();
      const password = document.getElementById('staff-password').value;
      if (!username || !password) { alert('Vui lòng nhập username và mật khẩu'); return; }
      res = await fetch('/api/auth/staff', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, username, password, role, phone, commission_rate })
      });
    }
    const data = await res.json();
    if (!res.ok) { alert('❌ ' + (data.detail || 'Lỗi lưu nhân viên')); return; }
    closeStaffModal();
    loadStaffList();
  } catch (e) {
    alert('❌ Không kết nối được server');
  }
}

async function toggleStaffActive(id, isActive) {
  const newState = isActive ? 0 : 1;
  if (!confirm(newState ? 'Mở khóa tài khoản này?' : 'Khóa tài khoản này?')) return;
  try {
    const res = await fetch(`/api/auth/staff/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ is_active: newState })
    });
    if (res.ok) loadStaffList(); else alert('❌ Lỗi cập nhật trạng thái');
  } catch (e) {
    alert('❌ Không kết nối được server');
  }
}

async function resetStaffPassword(id) {
  const pwd = prompt('Nhập mật khẩu mới cho nhân viên này (NV sẽ bị bắt đổi lại khi login):');
  if (!pwd || pwd.length < 6) { if (pwd !== null) alert('Mật khẩu tối thiểu 6 ký tự'); return; }
  try {
    const res = await fetch(`/api/auth/staff/${id}/reset-password`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ old_password: '', new_password: pwd })
    });
    const data = await res.json();
    if (res.ok) { alert('✅ ' + data.message); } else { alert('❌ ' + (data.detail || 'Lỗi reset mật khẩu')); }
  } catch (e) {
    alert('❌ Không kết nối được server');
  }
}

// ── Bật/Tắt Module + Phân Quyền Chi Tiết ──

const PERM_LABEL = {
  "pos.sell": "🛒 Bán hàng POS",
  "pos.edit_delete_order": "🧾 Sửa hóa đơn",
  "cashbook.manage": "💰 Lập phiếu Sổ Quỹ",
  "purchases.manage": "📥 Quản lý Nhập hàng",
  "partners.manage": "🤝 Quản lý KH/NCC",
  "price_lists.manage": "🏷️ Quản lý Bảng Giá",
  "inventory.manage": "📦 Quản lý Kho",
  "oem.manage": "🏭 Quản lý OEM",
  "reports.view": "📊 Xem Báo Cáo",
  "shifts.approve": "🕒 Duyệt Ca Làm Việc",
  "shifts.bypass": "🔓 Bán hàng không cần mở ca",
  "settings.access": "⚙️ Truy cập Cài Đặt"
};
const MODULE_LABEL = {
  module_oem: "🏭 Gia Công OEM",
  module_pet_services: "🐾 Dịch Vụ & Thú Cưng",
  module_price_lists: "🏷️ Bảng Giá Đại Lý"
};

async function loadPermissionsUI() {
  await Promise.all([renderModuleToggles(), renderPermissionMatrix(), renderLoginLog(), populateStaffPermSelect(), renderActivityLog()]);
}

async function populateStaffPermSelect() {
  const sel = document.getElementById('staff-perm-select');
  if (!sel) return;
  const res = await fetch('/api/staff');
  const staffs = (await res.json()).filter(s => s.role !== 'owner');
  sel.innerHTML = '<option value="">-- Chọn nhân viên --</option>' +
    staffs.map(s => `<option value="${s.id}">${s.name} (${s.role})</option>`).join('');
  const filterSel = document.getElementById('activity-log-filter');
  if (filterSel) {
    filterSel.innerHTML = '<option value="">Tất cả nhân viên</option>' +
      staffs.map(s => `<option value="${s.id}">${s.name}</option>`).join('');
  }
}

async function loadStaffPermissions(staffId) {
  const wrap = document.getElementById('staff-perm-table-wrap');
  if (!wrap) return;
  if (!staffId) { wrap.innerHTML = ''; return; }
  const res = await fetch(`/api/settings/staff-permissions/${staffId}`);
  if (!res.ok) { wrap.innerHTML = '<div class="text-red-500 text-sm">Lỗi tải quyền nhân viên</div>'; return; }
  const data = await res.json();
  wrap.innerHTML = `
    <table class="w-full text-sm text-left">
      <thead class="text-slate-500 border-b"><tr>
        <th class="py-2 pr-2">Quyền</th>
        <th class="py-2 px-2 text-center">Mặc định (theo vai trò)</th>
        <th class="py-2 px-2 text-center">Riêng nhân viên này</th>
      </tr></thead>
      <tbody>
        ${data.permissions.map(p => `
          <tr class="border-b">
            <td class="py-2 pr-2">${PERM_LABEL[p.perm_key] || p.perm_key}</td>
            <td class="py-2 px-2 text-center text-slate-400">${p.role_default ? '✔️' : '—'}</td>
            <td class="py-2 px-2 text-center">
              <select onchange="updateStaffPermission(${staffId}, '${p.perm_key}', this.value)" class="border rounded px-1 py-0.5 text-xs">
                <option value="" ${p.override === null ? 'selected' : ''}>Theo mặc định</option>
                <option value="1" ${p.override === true ? 'selected' : ''}>Cho phép</option>
                <option value="0" ${p.override === false ? 'selected' : ''}>Không cho phép</option>
              </select>
            </td>
          </tr>
        `).join('')}
      </tbody>
    </table>`;
}

async function updateStaffPermission(staffId, permKey, value) {
  const allowed = value === '' ? null : value === '1';
  await fetch('/api/settings/staff-permissions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ staff_id: staffId, perm_key: permKey, allowed })
  });
  if (typeof refreshUserProfile === 'function') {
    refreshUserProfile();
  }
}

async function renderActivityLog() {
  const box = document.getElementById('activity-log-body');
  if (!box) return;
  const staffId = document.getElementById('activity-log-filter')?.value || '';
  const url = '/api/settings/activity-log' + (staffId ? `?staff_id=${staffId}` : '');
  const res = await fetch(url);
  if (!res.ok) { box.innerHTML = '<tr><td colspan="5" class="text-red-500 py-2">Lỗi tải nhật ký</td></tr>'; return; }
  const data = await res.json();
  box.innerHTML = data.logs.map(l => `
    <tr class="border-b">
      <td class="py-2 pr-2">${l.staff_name || '(không rõ)'}</td>
      <td class="py-2 px-2">${l.role || ''}</td>
      <td class="py-2 px-2">${l.action}</td>
      <td class="py-2 px-2">${l.ip || ''}</td>
      <td class="py-2 px-2">${l.created_at}</td>
    </tr>
  `).join('') || '<tr><td colspan="5" class="text-slate-400 py-2">Chưa có hoạt động nào</td></tr>';
}

async function renderLoginLog() {
  const box = document.getElementById('login-log-body');
  if (!box) return;
  try {
    const res = await fetch('/api/auth/login-log');
    if (!res.ok) { box.innerHTML = '<tr><td colspan="4" class="text-slate-400 py-2">Không có quyền xem</td></tr>'; return; }
    const rows = await res.json();
    box.innerHTML = rows.map(r => `
      <tr class="border-b">
        <td class="py-1.5 pr-2">${r.username}</td>
        <td class="py-1.5 px-2 text-slate-500">${r.ip || ''}</td>
        <td class="py-1.5 px-2">${r.success ? '<span class="text-emerald-600">✅ Thành công</span>' : '<span class="text-rose-600">❌ Sai mật khẩu</span>'}</td>
        <td class="py-1.5 px-2 text-slate-500">${r.created_at}</td>
      </tr>`).join('');
  } catch (e) { box.innerHTML = '<tr><td colspan="4" class="text-rose-500 py-2">Lỗi tải nhật ký</td></tr>'; }
}

async function renderModuleToggles() {
  try {
    const res = await fetch('/api/settings/modules');
    if (!res.ok) return;
    const modules = await res.json();
    const box = document.getElementById('modules-toggle-list');
    if (!box || typeof modules !== 'object') return;
    box.innerHTML = Object.keys(MODULE_LABEL).map(key => `
      <label class="flex items-center justify-between p-3 border rounded-lg cursor-pointer hover:bg-slate-50">
        <span class="text-sm font-medium">${MODULE_LABEL[key]}</span>
        <input type="checkbox" class="w-5 h-5" ${modules[key] !== false ? 'checked' : ''}
               onchange="toggleModule('${key}', this.checked)">
      </label>
    `).join('');
  } catch (e) {
    console.warn('renderModuleToggles skipped:', e);
  }
}

async function toggleModule(key, enabled) {
  const res = await fetch('/api/settings/modules', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ key, enabled })
  });
  if (res.ok) { posModulesCache = null; if (typeof applyRoleUI === 'function') applyRoleUI(); }
  else { const d = await res.json(); alert('❌ ' + (d.detail || 'Lỗi cập nhật module')); await renderModuleToggles(); }
}

async function renderPermissionMatrix() {
  try {
    const res = await fetch('/api/settings/permissions');
    if (!res.ok) return;
    const data = await res.json();
    if (!data || !data.matrix || !Array.isArray(data.matrix)) return;
    const map = {}; // role -> perm_key -> allowed
    data.matrix.forEach(r => { (map[r.role] ||= {})[r.perm_key] = !!r.allowed; });
    const roles = data.roles || [];
    const tbody = document.getElementById('permissions-matrix-body');
    if (!tbody) return;
    tbody.innerHTML = (data.perm_keys || []).map(pk => `
      <tr class="border-b">
        <td class="py-2 pr-2">${PERM_LABEL[pk] || pk}</td>
        ${roles.map(role => `
          <td class="py-2 px-2 text-center">
            <input type="checkbox" class="w-5 h-5" ${map[role]?.[pk] ? 'checked' : ''}
                   onchange="togglePermission('${role}', '${pk}', this.checked)">
          </td>`).join('')}
      </tr>
    `).join('');
  } catch (e) {
    console.warn('renderPermissionMatrix skipped:', e);
  }
}

async function togglePermission(role, perm_key, allowed) {
  const res = await fetch('/api/settings/permissions', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ role, perm_key, allowed })
  });
  if (!res.ok) {
    const d = await res.json();
    alert('❌ ' + (d.detail || 'Lỗi cập nhật quyền'));
    await renderPermissionMatrix();
  } else if (typeof refreshUserProfile === 'function') {
    refreshUserProfile();
  }
}
