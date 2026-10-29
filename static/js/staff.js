// ── Quản lý Nhân Viên (Settings > Nhân Viên) ──

const ROLE_LABEL = { owner: 'Chủ Shop', cashier: 'Thu Ngân', accountant: 'Kế Toán', warehouse: 'Thủ Kho', staff: 'Nhân Viên' };
let currentStaffList = [];

function toggleStaffAccountFields(checked) {
  const fields = document.getElementById('staff-account-fields');
  if (fields) {
    fields.classList.toggle('hidden', !checked);
  }
}
window.toggleStaffAccountFields = toggleStaffAccountFields;

let staffSettingsFilter = 'active'; // 'active' | 'resigned' | 'all'

function setStaffSettingsStatusFilter(status) {
  staffSettingsFilter = status;
  const btnAct = document.getElementById('btn-staff-settings-active');
  const btnRes = document.getElementById('btn-staff-settings-resigned');
  const btnAll = document.getElementById('btn-staff-settings-all');
  const actCls = 'px-2.5 py-1 rounded-md text-sky-700 bg-white shadow-xs font-bold transition';
  const inactCls = 'px-2.5 py-1 rounded-md text-slate-600 hover:text-slate-900 transition';

  if (btnAct) btnAct.className = (status === 'active' ? actCls : inactCls);
  if (btnRes) btnRes.className = (status === 'resigned' ? actCls : inactCls);
  if (btnAll) btnAll.className = (status === 'all' ? actCls : inactCls);

  renderStaffTable();
}
window.setStaffSettingsStatusFilter = setStaffSettingsStatusFilter;

function updateStaffSettingsFilterPills() {
  const activeCount = (currentStaffList || []).filter(r => r.is_active !== 0).length;
  const resignedCount = (currentStaffList || []).filter(r => r.is_active === 0).length;
  const allCount = (currentStaffList || []).length;

  const btnAct = document.getElementById('btn-staff-settings-active');
  const btnRes = document.getElementById('btn-staff-settings-resigned');
  const btnAll = document.getElementById('btn-staff-settings-all');

  if (btnAct) btnAct.innerHTML = `🟢 Hoạt động (${activeCount})`;
  if (btnRes) btnRes.innerHTML = `🔒 Đã nghỉ / Khóa (${resignedCount})`;
  if (btnAll) btnAll.innerHTML = `Tất cả (${allCount})`;
}

async function loadStaffList() {
  const tbody = document.getElementById('staff-table-body');
  if (!tbody) return;
  tbody.innerHTML = `<tr><td colspan="7" class="p-4 text-center text-gray-400">Đang tải...</td></tr>`;
  try {
    const res = await fetch('/api/auth/staff');
    if (!res.ok) { tbody.innerHTML = `<tr><td colspan="7" class="p-4 text-center text-rose-500">Không có quyền xem</td></tr>`; return; }
    const rows = await res.json();
    currentStaffList = rows || [];
    updateStaffSettingsFilterPills();
    renderStaffTable();
  } catch (e) {
    tbody.innerHTML = `<tr><td colspan="7" class="p-4 text-center text-rose-500">Lỗi tải dữ liệu</td></tr>`;
  }
}

function renderStaffTable() {
  const tbody = document.getElementById('staff-table-body');
  if (!tbody) return;
  const rows = (currentStaffList || []).filter(r => {
    if (staffSettingsFilter === 'active') return r.is_active !== 0;
    if (staffSettingsFilter === 'resigned') return r.is_active === 0;
    return true;
  });

  if (!rows.length) {
    tbody.innerHTML = `<tr><td colspan="7" class="p-6 text-center text-gray-400">Không có nhân viên nào trong danh sách này</td></tr>`;
    return;
  }

  tbody.innerHTML = rows.map(r => {
    const isResigned = (r.is_active === 0);
    const rowClass = isResigned ? 'border-t hover:bg-slate-100 bg-slate-50/70 opacity-65 hover:opacity-100 transition' : 'border-t hover:bg-slate-50 transition';

    const accountBadge = r.has_account
      ? `<span class="inline-flex items-center gap-1 text-xs font-mono font-bold text-sky-700 bg-sky-50 border border-sky-200 px-2 py-0.5 rounded">${r.username || ''}</span>`
      : `<span class="inline-flex items-center gap-1 text-xs font-semibold text-slate-500 bg-slate-100 border border-slate-200 px-1.5 py-0.5 rounded ">Chỉ hồ sơ lương</span>`;

    const payrollBadge = r.is_payroll_staff
      ? `<span class="inline-flex items-center gap-0.5 text-xs font-bold text-sky-700 bg-sky-50 border border-sky-200 px-1.5 py-0.5 rounded" title="Nhân sự thuộc diện theo dõi chấm công & tính lương HRM">💼 HRM</span>`
      : `<span class="inline-flex items-center gap-0.5 text-xs font-bold text-slate-500 bg-slate-100 border border-slate-200 px-1.5 py-0.5 rounded" title="Tài khoản quản trị/hệ thống thuần túy (không tính lương)">👑 Hệ thống</span>`;

    const roleText = r.has_account ? (ROLE_LABEL[r.role] || r.role) : '<span class="text-slate-400">Không đăng nhập</span>';

    const codesInfo = [
      r.employee_code ? `<span class="text-xs text-slate-500 font-mono">NV: ${r.employee_code}</span>` : '',
      r.device_code ? `<span class="text-xs text-sky-600 font-mono font-bold">Mã máy: ${r.device_code}</span>` : '',
      isResigned && r.leave_date ? `<span class="text-xs text-rose-600 font-bold">Nghỉ: ${r.leave_date}</span>` : ''
    ].filter(Boolean).join(' | ');

    return `
      <tr class="${rowClass}">
        <td class="p-2.5 font-semibold">
          <div class="${isResigned ? 'line-through text-slate-500' : ''}">${r.name}</div>
          ${codesInfo ? `<div class="mt-0.5">${codesInfo}</div>` : ''}
          ${r.has_ai_key ? `<span class="inline-flex items-center gap-0.5 text-xs text-sky-700 bg-sky-50 border border-sky-200 px-1.5 py-0.2 rounded font-mono font-bold mt-0.5" title="Đã có Gemini API Key riêng: ${r.ai_model || 'gemini-2.5-flash'}"><span>🔑</span><span>Key riêng</span></span>` : ''}
        </td>
        <td class="p-2.5">
          <div class="flex flex-col gap-1 items-start">
            ${accountBadge}
            ${payrollBadge}
          </div>
        </td>
        <td class="p-2.5 font-semibold text-slate-700">${roleText}</td>
        <td class="p-2.5">${r.phone || '-'}</td>
        <td class="p-2.5 text-right font-mono">${r.commission_rate || 0}%</td>
        <td class="p-2.5 text-center">${r.is_active ? '<span class="px-2 py-0.5 rounded bg-emerald-100 text-emerald-700 font-bold">Hoạt động</span>' : '<span class="px-2 py-0.5 rounded bg-rose-100 text-rose-700 font-bold">Đã nghỉ / Khóa</span>'}</td>
        <td class="p-2.5 text-center whitespace-nowrap">
          ${r.has_account && !isResigned ? `<button onclick="openAssignStaffAIModal(${r.id}, '${(r.name||'').replace(/'/g, "\\'")}')" class="text-sky-600 hover:text-sky-800 hover:underline text-xs font-bold mr-2 cursor-pointer" title="Gán hoặc đổi Gemini API Key riêng">🔑 Key AI</button>` : ''}
          ${r.has_account && !isResigned ? `<button onclick="goToStaffPermission(${r.id})" class="text-emerald-700 hover:text-emerald-900 hover:underline text-xs font-bold mr-2 cursor-pointer" title="Chỉnh quyền riêng">🛡️ Quyền riêng</button>` : ''}
          <button onclick="openEditStaffModal(${r.id})" class="text-sky-600 hover:underline text-xs font-bold mr-2 cursor-pointer">Sửa</button>
          ${r.has_account && !isResigned ? `<button onclick="resetStaffPassword(${r.id})" class="text-amber-600 hover:underline text-xs font-bold mr-2 cursor-pointer">Reset MK</button>` : (!r.has_account && !isResigned ? `<button onclick="openGrantAccountModal(${r.id})" class="text-emerald-600 hover:underline text-xs font-bold mr-2 cursor-pointer">➕ Cấp TK</button>` : '')}
          <button onclick="toggleStaffActive(${r.id}, ${r.is_active})" class="${r.is_active ? 'text-rose-600' : 'text-sky-600'} hover:underline text-xs font-bold mr-2 cursor-pointer">${r.is_active ? '🛑 Nghỉ việc' : '↩️ Mở lại'}</button>
          ${r.id !== 1 && (r.username || '').toLowerCase() !== 'admin' ? `<button onclick="deleteStaff(${r.id}, '${(r.name||'').replace(/'/g, "\\'")}')" class="text-rose-700 hover:text-rose-900 hover:underline text-xs font-bold cursor-pointer" title="Xóa vĩnh viễn nhân viên">🗑️ Xóa</button>` : ''}
        </td>
      </tr>
    `;
  }).join('');
}

async function loadStaffWorkBlocks(selectedId) {
  const sel = document.getElementById('staff-work-block-id');
  if (!sel) return;
  try {
    const res = await fetch('/api/hrm/config');
    if (res.ok) {
      const data = await res.json();
      sel.innerHTML = '<option value="">-- Chọn khối --</option>' +
        (data.blocks || []).map(b => `<option value="${b.id}" ${selectedId === b.id ? 'selected' : ''}>${b.name} (${b.start_time}-${b.end_time})</option>`).join('');
    }
  } catch (e) {
    console.error(e);
  }
}

function openCreateStaffModal() {
  const titleEl = document.getElementById('modal-staff-title');
  if (titleEl) titleEl.innerHTML = '<svg class="w-5 h-5 text-sky-600 inline mr-1" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/></svg> <span>Thêm Nhân Viên</span>';
  document.getElementById('staff-edit-id').value = '';
  document.getElementById('staff-name').value = '';
  document.getElementById('staff-employee-code').value = '';
  document.getElementById('staff-device-code').value = '';
  document.getElementById('staff-phone').value = '';
  document.getElementById('staff-commission').value = 0;
  document.getElementById('staff-base-salary').value = '';
  const allowEl = document.getElementById('staff-allowance');
  if (allowEl) allowEl.value = '';
  const hireEl = document.getElementById('staff-hire-date');
  if (hireEl) hireEl.value = '';
  loadStaffWorkBlocks();

  const toggle = document.getElementById('staff-has-account-toggle');
  if (toggle) toggle.checked = false;
  toggleStaffAccountFields(false);

  const payToggle = document.getElementById('staff-is-payroll-toggle');
  if (payToggle) payToggle.checked = true;

  document.getElementById('staff-username').value = '';
  document.getElementById('staff-username').disabled = false;
  document.getElementById('staff-password').value = '';
  const pwdLbl = document.getElementById('staff-password-label');
  if (pwdLbl) pwdLbl.textContent = 'Mật Khẩu (*)';
  document.getElementById('staff-role').value = 'cashier';

  const revokeWrap = document.getElementById('staff-revoke-account-wrap');
  if (revokeWrap) revokeWrap.classList.add('hidden');

  const modal = document.getElementById('modal-staff');
  if (modal) {
    modal.classList.remove('hidden');
    modal.style.display = 'flex';
  }
}

function openEditStaffModal(id) {
  const r = (currentStaffList || []).find(s => s.id === id);
  if (!r) return;
  const titleEl = document.getElementById('modal-staff-title');
  if (titleEl) titleEl.innerHTML = '<svg class="w-5 h-5 text-sky-600 inline mr-1" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/></svg> <span>Sửa Nhân Viên</span>';
  document.getElementById('staff-edit-id').value = r.id;
  document.getElementById('staff-name').value = r.name || '';
  document.getElementById('staff-employee-code').value = r.employee_code || '';
  document.getElementById('staff-device-code').value = r.device_code || '';
  document.getElementById('staff-phone').value = r.phone || '';
  document.getElementById('staff-commission').value = r.commission_rate || 0;
  document.getElementById('staff-base-salary').value = r.base_salary ? Number(r.base_salary).toLocaleString('vi-VN') : '';
  const allowEl = document.getElementById('staff-allowance');
  if (allowEl) allowEl.value = r.allowance ? Number(r.allowance).toLocaleString('vi-VN') : '';
  const hireEl = document.getElementById('staff-hire-date');
  if (hireEl) hireEl.value = r.hire_date || '';
  loadStaffWorkBlocks(r.work_block_id);

  const hasAccount = Boolean(r.has_account);
  const toggle = document.getElementById('staff-has-account-toggle');
  if (toggle) toggle.checked = hasAccount;
  toggleStaffAccountFields(hasAccount);

  const payToggle = document.getElementById('staff-is-payroll-toggle');
  if (payToggle) payToggle.checked = Boolean(r.is_payroll_staff !== 0);

  document.getElementById('staff-username').value = r.username || '';
  document.getElementById('staff-username').disabled = false;
  document.getElementById('staff-password').value = '';
  const pwdLbl = document.getElementById('staff-password-label');
  if (pwdLbl) pwdLbl.textContent = hasAccount ? 'Đổi Mật Khẩu (Bỏ trống nếu giữ nguyên)' : 'Mật Khẩu Ban Đầu (*)';
  document.getElementById('staff-role').value = (r.role && r.role !== 'staff') ? r.role : 'cashier';

  const revokeWrap = document.getElementById('staff-revoke-account-wrap');
  if (revokeWrap) {
    revokeWrap.classList.toggle('hidden', !hasAccount);
  }

  const modal = document.getElementById('modal-staff');
  if (modal) {
    modal.classList.remove('hidden');
    modal.style.display = 'flex';
  }
}
window.openEditStaffModal = openEditStaffModal;

function openGrantAccountModal(id) {
  openEditStaffModal(id);
  const toggle = document.getElementById('staff-has-account-toggle');
  if (toggle) {
    toggle.checked = true;
    toggleStaffAccountFields(true);
    setTimeout(() => document.getElementById('staff-username')?.focus(), 100);
  }
}
window.openGrantAccountModal = openGrantAccountModal;

async function revokeStaffAccount() {
  const id = document.getElementById('staff-edit-id').value;
  if (!id) return;
  const staff = (currentStaffList || []).find(s => s.id == id);
  const name = staff ? staff.name : 'nhân viên này';

  const confirmed = typeof window.showConfirmModal === 'function'
    ? await window.showConfirmModal({
        title: "Thu Hồi Tài Khoản Đăng Nhập",
        message: `Bạn có chắc muốn THU HỒI tài khoản đăng nhập của "${name}"? Nhân viên sẽ không thể đăng nhập POS nữa, nhưng toàn bộ hồ sơ tính lương, chấm công và doanh số cũ vẫn được giữ nguyên vẹn.`,
        type: 'danger',
        confirmText: 'Thu Hồi Tài Khoản',
        cancelText: 'Hủy bỏ',
        icon: '🚫'
      })
    : confirm(`Bạn có chắc muốn thu hồi tài khoản đăng nhập của ${name}?`);

  if (!confirmed) return;

  try {
    const res = await fetch(`/api/auth/staff/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ revoke_account: true })
    });
    const data = await res.json();
    if (!res.ok) {
      alert('❌ ' + (data.detail || 'Lỗi thu hồi tài khoản'));
      return;
    }
    if (typeof showToast === 'function') showToast('✅ Đã thu hồi tài khoản đăng nhập thành công', 'success');
    closeStaffModal();
    loadStaffList();
  } catch (e) {
    alert('❌ Không kết nối được server');
  }
}
window.revokeStaffAccount = revokeStaffAccount;

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
  const employee_code = document.getElementById('staff-employee-code').value.trim() || null;
  const device_code = document.getElementById('staff-device-code').value.trim() || null;
  const phone = document.getElementById('staff-phone').value.trim();
  const commission_rate = parseFloat(document.getElementById('staff-commission').value) || 0;
  const base_salary = typeof parseMoneyInput === 'function'
    ? parseMoneyInput(document.getElementById('staff-base-salary').value)
    : (parseFloat((document.getElementById('staff-base-salary').value || '').replace(/\D/g, '')) || 0);
  const allowance = typeof parseMoneyInput === 'function'
    ? parseMoneyInput(document.getElementById('staff-allowance')?.value)
    : (parseFloat((document.getElementById('staff-allowance')?.value || '').replace(/\D/g, '')) || 0);
  const work_block_id = parseInt(document.getElementById('staff-work-block-id')?.value) || null;
  const hire_date = document.getElementById('staff-hire-date')?.value || null;

  const hasAccount = document.getElementById('staff-has-account-toggle').checked;
  const role = hasAccount ? document.getElementById('staff-role').value : 'staff';

  if (!name) { alert('Vui lòng nhập họ tên'); return; }

  let username = null;
  let password = null;

  if (hasAccount) {
    username = document.getElementById('staff-username').value.trim();
    password = document.getElementById('staff-password').value;
    if (!username) {
      alert('Vui lòng nhập Tên đăng nhập (Username)');
      return;
    }
    if (!id && (!password || password.length < 6)) {
      alert('Vui lòng nhập Mật khẩu ban đầu (tối thiểu 6 ký tự)');
      return;
    }
    if (password && password.length < 6) {
      alert('Mật khẩu phải có ít nhất 6 ký tự');
      return;
    }
  }

  try {
    let res;
    if (id) {
      const payload = {
        name, role, phone, commission_rate,
        employee_code, device_code, base_salary,
        allowance, work_block_id, hire_date
      };
      if (hasAccount) {
        payload.username = username;
        if (password && password.length >= 6) {
          payload.password = password;
        }
      }
      res = await fetch(`/api/auth/staff/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
    } else {
      const payload = {
        name, role, phone, commission_rate,
        employee_code, device_code, base_salary,
        allowance, work_block_id, hire_date,
        username: hasAccount ? username : null,
        password: hasAccount ? password : null
      };
      res = await fetch('/api/auth/staff', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
    }
    const data = await res.json();
    if (!res.ok) { alert('❌ ' + (data.detail || 'Lỗi lưu nhân viên')); return; }
    if (typeof showToast === 'function') {
      showToast(id ? '✅ Đã cập nhật nhân viên thành công' : '✅ Đã tạo nhân viên thành công', 'success');
    }
    closeStaffModal();
    loadStaffList();
  } catch (e) {
    alert('❌ Không kết nối được server');
  }
}

async function toggleStaffActive(id, isActive) {
  const newState = isActive ? 0 : 1;
  const isResigning = (isActive !== 0);
  const actionText = isResigning ? 'Nghỉ việc' : 'Mở lại';
  const todayStr = new Date().toISOString().split('T')[0];

  const confirmed = typeof window.showConfirmModal === 'function'
    ? await window.showConfirmModal({
        title: isResigning ? 'Xác Nhận Nghỉ Việc' : 'Khôi Phục Nhân Viên',
        message: isResigning
          ? 'Bạn có chắc muốn chuyển nhân viên này sang trạng thái Nghỉ việc? Tài khoản sẽ bị khóa và ẩn khỏi danh sách làm việc.'
          : 'Khôi phục và mở lại tài khoản cho nhân viên này trở lại làm việc?',
        type: isResigning ? 'warning' : 'primary',
        confirmText: isResigning ? '🛑 Nghỉ việc' : '↩️ Mở lại',
        cancelText: 'Hủy bỏ',
        icon: isResigning ? '🛑' : '↩️'
      })
    : confirm(isResigning ? 'Xác nhận chuyển nhân viên sang trạng thái Nghỉ việc?' : 'Khôi phục nhân viên đi làm lại?');

  if (!confirmed) return;
  try {
    const payload = {
      is_active: newState,
      leave_date: isResigning ? todayStr : null
    };
    const res = await fetch(`/api/auth/staff/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    if (res.ok) {
      if (typeof showToast === 'function') {
        showToast(isResigning ? 'Đã chuyển nhân viên sang trạng thái Nghỉ việc' : 'Đã khôi phục nhân viên thành công', 'success');
      }
      loadStaffList();
      if (typeof loadHrmStaff === 'function') loadHrmStaff();
    } else {
      const err = await res.json();
      alert('❌ ' + (err.detail || 'Lỗi cập nhật trạng thái'));
    }
  } catch (e) {
    alert('❌ Không kết nối được server');
  }
}

async function deleteStaff(id, staffName) {
  const confirmed = typeof window.showConfirmModal === 'function'
    ? await window.showConfirmModal({
        title: 'Xóa Vĩnh Viễn Nhân Viên',
        message: `Bạn có chắc chắn muốn xóa nhân viên "${staffName}" khỏi hệ thống? Thao tác này không thể hoàn tác.`,
        type: 'danger',
        confirmText: '🗑️ Xóa vĩnh viễn',
        cancelText: 'Hủy bỏ',
        icon: '🗑️'
      })
    : confirm(`Bạn có chắc chắn muốn xóa vĩnh viễn nhân viên "${staffName}"?`);

  if (!confirmed) return;
  try {
    const res = await fetch(`/api/auth/staff/${id}`, { method: 'DELETE' });
    const data = await res.json();
    if (res.ok) {
      if (typeof showToast === 'function') {
        showToast(data.message || `Đã xóa nhân viên ${staffName}`, 'success');
      }
      loadStaffList();
      if (typeof loadHrmStaff === 'function') loadHrmStaff();
    } else {
      alert('❌ ' + (data.detail || 'Lỗi xóa nhân viên'));
    }
  } catch (e) {
    alert('❌ Không kết nối được server');
  }
}
window.deleteStaff = deleteStaff;

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
  "pos.sell": "Bán hàng POS",
  "pos.edit_delete_order": "Sửa hóa đơn",
  "cashbook.manage": "Lập phiếu Sổ Quỹ",
  "purchases.manage": "Quản lý Nhập hàng",
  "purchases.request": "Tạo & Xem Yêu Cầu Đặt Hàng",
  "partners.manage": "Quản lý KH/NCC",
  "price_lists.manage": "Quản lý Bảng Giá",
  "inventory.manage": "Quản lý Kho",
  "inventory.view_cost": "Xem giá vốn & lợi nhuận",
  "oem.manage": "Quản lý OEM",
  "reports.view": "Xem Báo Cáo",
  "shifts.approve": "Duyệt Ca Làm Việc",
  "shifts.bypass": "Bán hàng không cần mở ca",
  "settings.access": "Truy cập Cài Đặt",
  "spa.pick_date": "Chọn ngày xem lịch Spa",
  "payroll.manage": "Quản lý Chấm công & Lương"
};
const MODULE_LABEL = {
  module_hotel: "Khách Sạn Thú Cưng",
  module_pet_services: "Dịch Vụ & Thú Cưng",
  module_price_lists: "Bảng Giá Đại Lý",
  module_oem: "Gia Công OEM",
  module_marketplace: "Bán Hàng Sàn TMĐT"
};

async function loadPermissionsUI() {
  await Promise.all([renderModuleToggles(), renderPermissionMatrix(), renderLoginLog(), populateStaffPermSelect()]);
}

async function populateStaffPermSelect() {
  const sel = document.getElementById('staff-perm-select');
  const res = await fetch('/api/staff');
  if (!res.ok) return;
  const allStaffs = await res.json();
  if (sel) {
    const manageableStaffs = allStaffs.filter(s => s.role !== 'owner' && s.role !== 'admin');
    sel.innerHTML = '<option value="">-- Chọn nhân viên --</option>' +
      manageableStaffs.map(s => `<option value="${s.id}">${s.name} (${s.role})</option>`).join('');
  }
  const filterSel = document.getElementById('activity-log-filter');
  if (filterSel) {
    const curVal = filterSel.value;
    filterSel.innerHTML = '<option value="">Tất cả nhân viên</option>' +
      allStaffs.map(s => `<option value="${s.id}">${s.name} (${s.role || 'staff'})</option>`).join('');
    if (curVal) filterSel.value = curVal;
  }
}

async function loadStaffPermissions(staffId) {
  const wrap = document.getElementById('staff-perm-table-wrap');
  if (!wrap) return;
  if (!staffId) { wrap.innerHTML = ''; return; }
  const res = await fetch(`/api/settings/staff-permissions/${staffId}`);
  if (!res.ok) { wrap.innerHTML = '<div class="text-red-500 text-sm">Lỗi tải quyền nhân viên</div>'; return; }
  const data = await res.json();
  const warningBanner = !data.has_account
    ? `<div class="mb-3 p-2.5 rounded-lg bg-amber-50 border border-amber-200 text-amber-800 text-xs flex items-center gap-2">
         <span>⚠️</span>
         <span><b>Lưu ý:</b> Nhân viên này chưa được cấp tài khoản đăng nhập POS. Các cấu hình quyền dưới đây sẽ có hiệu lực sau khi cấp tài khoản.</span>
       </div>`
    : '';
  wrap.innerHTML = `
    ${warningBanner}
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

function goToStaffPermission(staffId) {
  if (typeof switchSettingsSubTab === 'function') {
    switchSettingsSubTab('permissions');
    setTimeout(() => {
      const sel = document.getElementById('staff-perm-select');
      if (sel) {
        sel.value = staffId;
        loadStaffPermissions(staffId);
        sel.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
    }, 150);
  }
}
window.goToStaffPermission = goToStaffPermission;

let activityLogDebounceTimer = null;
function debounceActivityLogSearch() {
  clearTimeout(activityLogDebounceTimer);
  activityLogDebounceTimer = setTimeout(renderActivityLog, 250);
}

// DB lưu CURRENT_TIMESTAMP = giờ UTC "YYYY-MM-DD HH:MM:SS" -> gắn 'Z' để formatDateTime đổi sang giờ máy
const utcToLocal = s => (s && !String(s).includes('T')) ? String(s).replace(' ', 'T') + 'Z' : s;

async function renderActivityLog() {
  const box = document.getElementById('activity-log-body');
  if (!box) return;
  const staffId = document.getElementById('activity-log-filter')?.value || '';
  const days = document.getElementById('activity-log-days')?.value || '90';
  const search = document.getElementById('activity-log-search')?.value || '';
  const actionType = document.getElementById('activity-log-action-type')?.value || '';
  const limit = document.getElementById('activity-log-limit')?.value || '500';

  const params = new URLSearchParams();
  if (staffId) params.append('staff_id', staffId);
  if (days) params.append('days', days);
  if (search.trim()) params.append('search', search.trim());
  if (actionType) params.append('action_type', actionType);
  if (limit) params.append('limit', limit);

  const url = '/api/settings/activity-log?' + params.toString();
  try {
    const res = await fetch(url);
    if (!res.ok) { box.innerHTML = '<tr><td colspan="5" class="text-rose-500 py-3 text-center">Lỗi tải nhật ký</td></tr>'; return; }
    const data = await res.json();
    const countEl = document.getElementById('activity-log-count');
    if (countEl) countEl.textContent = `${data.logs?.length || 0} bản ghi`;

    if (!data.logs || data.logs.length === 0) {
      box.innerHTML = '<tr><td colspan="5" class="text-slate-400 py-6 text-center">Không có hoạt động nào phù hợp bộ lọc</td></tr>';
      return;
    }

    const roleBadges = {
      owner: '<span class="px-2 py-0.5 text-xs font-bold rounded-full bg-sky-100 text-sky-700">Chủ shop</span>',
      admin: '<span class="px-2 py-0.5 text-xs font-bold rounded-full bg-sky-100 text-sky-700">Admin</span>',
      cashier: '<span class="px-2 py-0.5 text-xs font-bold rounded-full bg-blue-100 text-blue-700">Thu ngân</span>',
      accountant: '<span class="px-2 py-0.5 text-xs font-bold rounded-full bg-emerald-100 text-emerald-700">Kế toán</span>',
      warehouse: '<span class="px-2 py-0.5 text-xs font-bold rounded-full bg-amber-100 text-amber-800">Thủ kho</span>',
    };

    box.innerHTML = data.logs.map(l => `
      <tr class="border-b border-slate-100 hover:bg-slate-50/80 transition">
        <td class="py-2.5 px-3 font-semibold text-slate-800">${l.staff_name || '(hệ thống)'}</td>
        <td class="py-2.5 px-2">${roleBadges[l.role] || `<span class="px-2 py-0.5 text-xs rounded-full bg-slate-100 text-slate-600">${l.role || '—'}</span>`}</td>
        <td class="py-2.5 px-3 text-slate-700 font-medium">${l.action}</td>
        <td class="py-2.5 px-2 text-slate-400 font-mono text-xs">${l.ip || '—'}</td>
        <td class="py-2.5 px-3 text-right text-slate-400 text-xs whitespace-nowrap">${formatDateTime(utcToLocal(l.created_at)) || '—'}</td>
      </tr>
    `).join('');
  } catch (e) {
    box.innerHTML = '<tr><td colspan="5" class="text-rose-500 py-3 text-center">Lỗi kết nối máy chủ</td></tr>';
  }
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
        <td class="py-1.5 px-2">${r.success ? '<span class="text-emerald-600 font-semibold">Thành công</span>' : '<span class="text-rose-600 font-semibold">Sai mật khẩu</span>'}</td>
        <td class="py-1.5 px-2 text-slate-500">${formatDateTime(utcToLocal(r.created_at)) || ''}</td>
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
      <tr class="border-b hover:bg-slate-50/60 transition">
        <td class="py-2.5 pr-2 font-medium text-slate-700">
          <div class="flex items-center gap-2">
            <span>${PERM_LABEL[pk] || pk}</span>
            ${pk === 'shifts.bypass' ? '<span class="px-2 py-0.5 text-xs font-bold rounded-full bg-amber-100 text-amber-800 border border-amber-200">Tùy chọn không cần mở ca</span>' : ''}
          </div>
        </td>
        <td class="py-2.5 px-3 text-center bg-sky-50/40">
          <div class="inline-flex items-center justify-center gap-1 text-sky-700 font-semibold" title="Admin luôn có toàn quyền cố định">
            <input type="checkbox" class="w-4 h-4 accent-purple-600 rounded cursor-not-allowed opacity-90" checked disabled>
            <span class="text-xs text-sky-700 font-bold hidden sm:inline">Cố định</span>
          </div>
        </td>
        ${roles.map(role => `
          <td class="py-2.5 px-3 text-center">
            <input type="checkbox" class="w-4 h-4 rounded cursor-pointer accent-sky-600 transition" ${map[role]?.[pk] ? 'checked' : ''}
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

// ── Gán Gemini API Key cho nhân viên (BYOK Admin Override) ──

async function openAssignStaffAIModal(staffId, staffName) {
  const modal = document.getElementById('modal-assign-staff-ai');
  if (!modal) return;
  modal.classList.remove('hidden');
  modal.style.display = 'flex';

  document.getElementById('assign-staff-ai-id').value = staffId;
  const nameEl = document.getElementById('assign-staff-ai-name');
  if (nameEl) nameEl.textContent = `Nhân viên: ${staffName}`;

  const keyInput = document.getElementById('assign-staff-ai-key');
  const modelSelect = document.getElementById('assign-staff-ai-model');
  const badge = document.getElementById('assign-staff-ai-status-badge');
  const desc = document.getElementById('assign-staff-ai-status-desc');
  const testRes = document.getElementById('assign-staff-ai-test-result');

  if (testRes) testRes.classList.add('hidden');
  if (keyInput) keyInput.value = '';

  try {
    const res = await fetch(`/api/auth/staff/${staffId}/ai-config`);
    if (!res.ok) {
      if (badge && desc) {
        badge.className = "font-bold px-2 py-0.5 rounded text-xs bg-slate-100 text-slate-700";
        badge.innerText = "Chưa có thông tin";
        desc.innerText = "Dán Gemini API Key riêng vào ô bên dưới để gán cho nhân viên này.";
      }
      return;
    }
    const data = await res.json();
    if (modelSelect && data.ai_model) modelSelect.value = data.ai_model;
    if (badge && desc) {
      if (data.has_ai_key) {
        badge.className = "font-bold px-2 py-0.5 rounded text-xs bg-sky-100 text-sky-800 border border-sky-200";
        badge.innerText = "🟢 Đã gán Key riêng";
        desc.innerText = `Key hiện tại: ${data.masked_key} (${data.ai_model})`;
      } else {
        badge.className = "font-bold px-2 py-0.5 rounded text-xs bg-blue-100 text-blue-800 border border-blue-200";
        badge.innerText = "🏢 Đang dùng Key chung của tiệm";
        desc.innerText = "Nhân viên chưa có key riêng, đang dùng quota tài khoản chung của shop.";
      }
    }
  } catch (e) {
    console.error("Lỗi tải AI config nhân viên:", e);
  }
}

function closeAssignStaffAIModal() {
  const modal = document.getElementById('modal-assign-staff-ai');
  if (modal) {
    modal.classList.add('hidden');
    modal.style.display = 'none';
  }
}

async function testAssignStaffAIKey() {
  const key = (document.getElementById('assign-staff-ai-key')?.value || '').trim();
  const model = document.getElementById('assign-staff-ai-model')?.value || 'gemini-2.5-flash';
  const resultDiv = document.getElementById('assign-staff-ai-test-result');
  const btn = document.getElementById('btn-test-assign-staff-ai');

  if (!key) {
    alert("Vui lòng nhập Google Gemini API Key vào ô để kiểm tra!");
    return;
  }

  if (btn) { btn.disabled = true; btn.innerText = "⏳ Đang thử..."; }
  if (resultDiv) {
    resultDiv.className = "p-2 bg-slate-50 border rounded text-slate-700 text-xs";
    resultDiv.innerText = "Đang kết nối tới Google AI Studio...";
    resultDiv.classList.remove('hidden');
  }

  try {
    const res = await fetch('/api/ai/test-key', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ gemini_api_key: key, gemini_model: model })
    });
    const data = await res.json();
    if (res.ok) {
      if (resultDiv) {
        resultDiv.className = "p-2.5 bg-emerald-50 border border-emerald-200 rounded text-emerald-800 text-xs font-semibold";
        resultDiv.innerText = `✅ ${data.message || 'API Key hoạt động xuất sắc!'}`;
      }
    } else {
      if (resultDiv) {
        resultDiv.className = "p-2.5 bg-rose-50 border border-rose-200 rounded text-rose-800 text-xs";
        resultDiv.innerText = `❌ Lỗi: ${data.detail || 'API Key không hợp lệ hoặc hết hạn'}`;
      }
    }
  } catch (e) {
    if (resultDiv) {
      resultDiv.className = "p-2.5 bg-rose-50 border border-rose-200 rounded text-rose-800 text-xs";
      resultDiv.innerText = `❌ Lỗi mạng: ${e.message}`;
    }
  } finally {
    if (btn) { btn.disabled = false; btn.innerHTML = "<span>🔍</span> <span>Kiểm Tra Key</span>"; }
  }
}

async function saveAssignStaffAIKey() {
  const staffId = document.getElementById('assign-staff-ai-id')?.value;
  const key = (document.getElementById('assign-staff-ai-key')?.value || '').trim();
  const model = document.getElementById('assign-staff-ai-model')?.value || 'gemini-2.5-flash';

  if (!staffId) return;

  try {
    const res = await fetch(`/api/auth/staff/${staffId}/ai-config`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ai_api_key: key, ai_model: model })
    });
    const data = await res.json();
    if (res.ok) {
      alert(`✅ ${data.message || 'Đã lưu cấu hình AI thành công!'}`);
      closeAssignStaffAIModal();
      loadStaffList();
    } else {
      alert("❌ Lỗi: " + (data.detail || "Không thể gán Key"));
    }
  } catch (e) {
    alert("❌ Lỗi kết nối: " + e.message);
  }
}

window.openAssignStaffAIModal = openAssignStaffAIModal;
window.closeAssignStaffAIModal = closeAssignStaffAIModal;
window.testAssignStaffAIKey = testAssignStaffAIKey;
window.saveAssignStaffAIKey = saveAssignStaffAIKey;
