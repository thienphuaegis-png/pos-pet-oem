// ── Chuẩn hóa định dạng ngày & giờ Việt Nam (DD/MM/YYYY HH:mm:ss) ──
function formatDateTime(val, includeTime = true) {
  if (!val) return '';
  try {
    let str = String(val).trim();
    if (!str || str === '---' || str === '-') return str;

    let datePart = '';
    let timePart = '';
    if (str.includes('T')) {
      if (str.includes('Z') || str.includes('+')) {
        const d = new Date(val);
        if (!isNaN(d.getTime())) {
          const day = String(d.getDate()).padStart(2, '0');
          const month = String(d.getMonth() + 1).padStart(2, '0');
          const year = d.getFullYear();
          if (includeTime) {
            const hours = String(d.getHours()).padStart(2, '0');
            const minutes = String(d.getMinutes()).padStart(2, '0');
            const seconds = String(d.getSeconds()).padStart(2, '0');
            return `${day}/${month}/${year} ${hours}:${minutes}:${seconds}`;
          }
          return `${day}/${month}/${year}`;
        }
      }
      const parts = str.split('T');
      datePart = parts[0];
      timePart = parts[1].split('+')[0].split('Z')[0].split('.')[0];
    } else if (str.includes(' ')) {
      const parts = str.split(' ');
      datePart = parts[0];
      timePart = parts[1];
    } else {
      datePart = str;
    }

    const dp = datePart.split('-');
    if (dp.length === 3 && dp[0].length === 4) {
      const formattedDate = `${dp[2].padStart(2, '0')}/${dp[1].padStart(2, '0')}/${dp[0]}`;
      if (includeTime && timePart) {
        const tp = timePart.split(':');
        const formattedTime = tp.length >= 2 ? `${tp[0].padStart(2, '0')}:${tp[1].padStart(2, '0')}${tp[2] ? ':' + tp[2].slice(0, 2).padStart(2, '0') : ''}` : timePart;
        return `${formattedDate} ${formattedTime}`;
      }
      return formattedDate;
    }

    const slashParts = datePart.split('/');
    if (slashParts.length === 3 && slashParts[2].length === 4) {
      if (includeTime && timePart) return `${datePart} ${timePart}`;
      return datePart;
    }

    const d = new Date(val);
    if (!isNaN(d.getTime())) {
      const day = String(d.getDate()).padStart(2, '0');
      const month = String(d.getMonth() + 1).padStart(2, '0');
      const year = d.getFullYear();
      if (includeTime) {
        const hours = String(d.getHours()).padStart(2, '0');
        const minutes = String(d.getMinutes()).padStart(2, '0');
        const seconds = String(d.getSeconds()).padStart(2, '0');
        return `${day}/${month}/${year} ${hours}:${minutes}:${seconds}`;
      }
      return `${day}/${month}/${year}`;
    }
  } catch (_) {}
  return String(val);
}

function formatDate(val) {
  return formatDateTime(val, false);
}

window.formatDateTime = formatDateTime;
window.formatDate = formatDate;

// ── Auth state ──
const Auth = {
  getToken:  () => localStorage.getItem('pos_token'),
  getUser:   () => JSON.parse(localStorage.getItem('pos_user') || 'null'),
  setUser:   (user) => localStorage.setItem('pos_user', JSON.stringify(user)),
  getRefresh:() => localStorage.getItem('pos_refresh'),
  setSession(data) {
    localStorage.setItem('pos_token',   data.access_token);
    localStorage.setItem('pos_refresh', data.refresh_token || '');
    localStorage.setItem('pos_user',    JSON.stringify(data.user));
  },
  clear() {
    ['pos_token','pos_refresh','pos_user'].forEach(k => localStorage.removeItem(k));
  },
  hasRole(...roles) {
    const u = Auth.getUser();
    return u && (u.role === 'owner' || u.role === 'admin' || roles.includes(u.role));
  },
  can(permKey) {
    const u = Auth.getUser();
    if (!u) return false;
    if (u.role === 'owner' || u.role === 'admin') return true;
    return Array.isArray(u.permissions) && u.permissions.includes(permKey);
  }
};

async function refreshUserProfile() {
  const token = Auth.getToken();
  if (!token) return;
  try {
    const res = await _origFetch('/api/auth/me', {
      headers: { 'Authorization': `Bearer ${token}` }
    });
    if (res.ok) {
      const me = await res.json();
      const current = Auth.getUser() || {};
      Auth.setUser({ ...current, ...me });
      if (typeof updateShiftUI === 'function') updateShiftUI();
    }
  } catch (e) {}
}

// ── Intercept fetch: gắn Bearer, handle 401 ──
const _origFetch = window.fetch.bind(window);
window.fetch = async (url, opts = {}) => {
  const token = Auth.getToken();
  if (token && typeof url === 'string' && url.startsWith('/api')) {
    opts.headers = { ...(opts.headers || {}), 'Authorization': `Bearer ${token}` };
  }
  const res = await _origFetch(url, opts);
  if (res.status === 401) {
    Auth.clear();
    showLoginOverlay();
    return res; // caller sẽ nhận 401 nhưng không crash
  }
  return res;
};

// ── Login / Logout ──
async function handleLogin() {
  const username = document.getElementById('login-username').value.trim();
  const password = document.getElementById('login-password').value;
  const errEl    = document.getElementById('login-error');
  errEl.textContent = '';
  try {
    const res = await _origFetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: `username=${encodeURIComponent(username)}&password=${encodeURIComponent(password)}`
    });
    const data = await res.json();
    if (!res.ok) { errEl.textContent = data.detail || 'Đăng nhập thất bại'; return; }
    Auth.setSession(data);
    hideLoginOverlay();
    if (data.must_change_password) {
      document.getElementById('force-pwd-overlay').style.display = 'flex';
      return;
    }
    applyRoleUI();
    if (typeof loadCurrentShift === 'function') loadCurrentShift();
    if (typeof initApp === 'function') initApp();
  } catch (e) {
    errEl.textContent = 'Không kết nối được server';
  }
}

async function handleForceChangePassword() {
  const old_password = document.getElementById('force-pwd-old').value;
  const new_password = document.getElementById('force-pwd-new').value;
  const errEl = document.getElementById('force-pwd-error');
  errEl.textContent = '';
  if (!new_password || new_password.length < 6) { errEl.textContent = 'Mật khẩu mới tối thiểu 6 ký tự'; return; }
  try {
    const res = await fetch('/api/auth/change-password', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ old_password, new_password })
    });
    const data = await res.json();
    if (!res.ok) { errEl.textContent = data.detail || 'Đổi mật khẩu thất bại'; return; }
    document.getElementById('force-pwd-overlay').style.display = 'none';
    applyRoleUI();
    if (typeof loadCurrentShift === 'function') loadCurrentShift();
    if (typeof initApp === 'function') initApp();
  } catch (e) {
    errEl.textContent = 'Không kết nối được server';
  }
}

function handleLogout() {
  Auth.clear();
  showLoginOverlay();
}

// ── Show / Hide login overlay ──
async function loadLoginStoreBranding() {
  try {
    const res = await _origFetch('/api/settings');
    if (!res.ok) return;
    const settings = await res.json();
    const nameEl = document.getElementById('login-store-name');
    const logoEl = document.getElementById('login-store-logo');
    const iconEl = document.getElementById('login-store-icon');
    const appName = settings.app_name || settings.shop_name || '⚡ POS Offline';
    if (nameEl) {
      nameEl.textContent = appName;
    }
    if (settings.shop_logo && logoEl && iconEl) {
      logoEl.src = settings.shop_logo;
      logoEl.style.display = 'block';
      iconEl.style.display = 'none';
    } else if (iconEl && logoEl) {
      logoEl.style.display = 'none';
      iconEl.style.display = '';
    }

    // Đồng bộ lên thanh Sidebar nếu có
    const sidebarLogo = document.getElementById('sidebar-app-logo');
    const sidebarIcon = document.getElementById('sidebar-app-icon');
    const sidebarName = document.getElementById('sidebar-app-name');
    if (sidebarName) sidebarName.textContent = appName;
    if (sidebarLogo && sidebarIcon) {
      if (settings.shop_logo) {
        sidebarLogo.src = settings.shop_logo;
        sidebarLogo.classList.remove('hidden');
        sidebarIcon.classList.add('hidden');
      } else {
        sidebarLogo.classList.add('hidden');
        sidebarIcon.classList.remove('hidden');
      }
    }
  } catch (e) {
    // Giữ mặc định nếu chưa tải được
  }
}

function showLoginOverlay() {
  const el = document.getElementById('login-overlay');
  if (el) el.style.display = 'flex';
  loadLoginStoreBranding();
}
function hideLoginOverlay() {
  const el = document.getElementById('login-overlay');
  if (el) el.style.display = 'none';
}

// ── Apply role-based UI ──
let posModulesCache = null;

async function loadModulesForUI() {
  try {
    const res = await fetch('/api/settings/modules');
    posModulesCache = await res.json();
  } catch (e) { posModulesCache = {}; }
}

async function applyRoleUI() {
  const user = Auth.getUser();
  if (!user) { showLoginOverlay(); return; }

  if (!posModulesCache) await loadModulesForUI();

  // Ẩn/hiện elements theo data-role + data-module
  document.querySelectorAll('[data-role]').forEach(el => {
    const allowed = el.dataset.role.split(',').map(r => r.trim());
    const roleOk = (user.role === 'owner' || allowed.includes(user.role));
    const moduleKey = el.dataset.module;
    const moduleOk = !moduleKey || posModulesCache[moduleKey] !== false;
    el.style.display = (roleOk && moduleOk) ? '' : 'none';
  });

  // Header info
  const nameEl  = document.getElementById('header-username');
  const roleEl  = document.getElementById('header-role-badge');
  if (nameEl) nameEl.textContent = user.name;
  if (roleEl) roleEl.textContent = {
    owner:      '👑 Chủ Shop',
    cashier:    '🏷 Thu Ngân',
    accountant: '📒 Kế Toán',
    warehouse:  '📦 Thủ Kho'
  }[user.role] || user.role;
}

// ── Enter key trên form login ──
document.addEventListener('DOMContentLoaded', () => {
  const pwdInput = document.getElementById('login-password');
  if (pwdInput) {
    pwdInput.addEventListener('keydown', e => { if (e.key === 'Enter') handleLogin(); });
  }

  // Khởi động: kiểm tra token
  if (Auth.getToken()) {
    hideLoginOverlay();
    applyRoleUI();
    refreshUserProfile();
    if (typeof loadCurrentShift === 'function') {
      loadCurrentShift();
    }
  } else {
    showLoginOverlay();
  }
});

// ── Password Visibility & Caps Lock Helpers (Mẫu 3) ──
window.togglePasswordVisibility = function(inputId, btnEl) {
  const input = document.getElementById(inputId);
  if (!input) return;
  const isPwd = input.type === 'password';
  input.type = isPwd ? 'text' : 'password';

  if (btnEl) {
    const labelEl = btnEl.querySelector('.pwd-label');
    const iconEl = btnEl.querySelector('.pwd-icon');
    if (labelEl) labelEl.textContent = isPwd ? 'Ẩn' : 'Xem';
    if (iconEl) {
      iconEl.innerHTML = isPwd ? `
        <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path>
        <circle cx="12" cy="12" r="3"></circle>
      ` : `
        <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"></path>
        <line x1="1" y1="1" x2="23" y2="23"></line>
      `;
    }
    if (isPwd) {
      btnEl.style.color = '#0284c7';
      btnEl.style.background = '#e0f2fe';
    } else {
      btnEl.style.color = '#64748b';
      btnEl.style.background = '#f1f5f9';
    }
  }
};

window.checkPasswordCapsLock = function(e, warnId) {
  const warnEl = document.getElementById(warnId);
  if (!warnEl) return;
  if (e && e.getModifierState && e.getModifierState('CapsLock')) {
    warnEl.style.display = 'flex';
  } else {
    warnEl.style.display = 'none';
  }
};

