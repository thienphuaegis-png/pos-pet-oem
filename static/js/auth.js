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
