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

function getLocalTodayDateStr(dateObj = new Date()) {
  const d = dateObj instanceof Date ? dateObj : new Date(dateObj);
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function getLocalNowDateTimeLocalStr(dateObj = new Date()) {
  const d = dateObj instanceof Date ? dateObj : new Date(dateObj);
  const hours = String(d.getHours()).padStart(2, '0');
  const minutes = String(d.getMinutes()).padStart(2, '0');
  return `${getLocalTodayDateStr(d)}T${hours}:${minutes}`;
}

window.formatDateTime = formatDateTime;
window.formatDate = formatDate;
window.getLocalTodayDateStr = getLocalTodayDateStr;
window.getLocalNowDateTimeLocalStr = getLocalNowDateTimeLocalStr;

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

// ── Tải file / mở trang in KÈM TOKEN ──
// Link trực tiếp (<a href>, window.open, location.href) không gửi header Authorization,
// nên mọi file/trang lấy từ /api phải đi qua fetch (interceptor ở trên tự gắn Bearer).
async function downloadWithAuth(url, fallbackName = 'download.xlsx') {
  const res = await fetch(url);
  if (!res.ok) {
    if (window.showToast) window.showToast(`Không tải được file (lỗi ${res.status})`, 'error');
    return;
  }
  const blob = await res.blob();
  const cd = res.headers.get('Content-Disposition') || '';
  const m = cd.match(/filename\*=UTF-8''([^;]+)|filename="?([^";]+)"?/i);
  const name = m ? decodeURIComponent(m[1] || m[2]) : fallbackName;
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 10000);
}

async function openWithAuth(url) {
  const win = window.open('', '_blank'); // mở ngay trong cú click để không bị chặn popup
  const res = await fetch(url);
  const html = await res.text();
  if (!win) return;
  win.document.open();
  win.document.write(html);
  win.document.close();
}
window.downloadWithAuth = downloadWithAuth;
window.openWithAuth = openWithAuth;

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
    if (!res.ok) {
      let errMsg = 'Đăng nhập thất bại';
      if (typeof data.detail === 'string') {
        errMsg = data.detail;
      } else if (Array.isArray(data.detail)) {
        errMsg = data.detail.map(d => d.msg || JSON.stringify(d)).join(', ');
      } else if (data.detail && typeof data.detail === 'object') {
        errMsg = data.detail.msg || JSON.stringify(data.detail);
      }
      errEl.textContent = errMsg;
      return;
    }
    Auth.setSession(data);
    hideLoginOverlay();
    if (data.must_change_password) {
      openChangePasswordOverlay('force');
      return;
    }
    applyRoleUI();
    if (typeof loadCurrentShift === 'function') loadCurrentShift();
    triggerLandingTabSafe();
  } catch (e) {
    errEl.textContent = 'Không kết nối được server';
  }
}

let _pwdOverlayMode = 'force'; // 'force' | 'login' | 'sidebar'

function openChangePasswordOverlay(mode = 'force') {
  _pwdOverlayMode = mode;
  const overlay = document.getElementById('force-pwd-overlay');
  const titleEl = document.getElementById('force-pwd-title');
  const subEl = document.getElementById('force-pwd-subtitle');
  const userGroup = document.getElementById('force-pwd-user-group');
  const userInp = document.getElementById('force-pwd-username');
  const oldInp = document.getElementById('force-pwd-old');
  const newInp = document.getElementById('force-pwd-new');
  const cancelBtn = document.getElementById('force-pwd-cancel-btn');
  const errEl = document.getElementById('force-pwd-error');

  if (errEl) errEl.textContent = '';
  if (oldInp) {
    oldInp.value = '';
    oldInp.type = 'password';
    const oldBtn = oldInp.parentElement?.querySelector('button[onclick*="togglePasswordVisibility"]');
    if (oldBtn) {
      const lbl = oldBtn.querySelector('.pwd-label');
      const ico = oldBtn.querySelector('.pwd-icon');
      if (lbl) lbl.textContent = 'Xem';
      if (ico) ico.innerHTML = '<path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/>';
    }
  }
  if (newInp) {
    newInp.value = '';
    newInp.type = 'password';
    const newBtn = newInp.parentElement?.querySelector('button[onclick*="togglePasswordVisibility"]');
    if (newBtn) {
      const lbl = newBtn.querySelector('.pwd-label');
      const ico = newBtn.querySelector('.pwd-icon');
      if (lbl) lbl.textContent = 'Xem';
      if (ico) ico.innerHTML = '<path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/>';
    }
  }

  if (mode === 'login') {
    if (titleEl) titleEl.textContent = 'Đổi Mật Khẩu Tài Khoản';
    if (subEl) subEl.textContent = 'Nhập tên đăng nhập, mật khẩu hiện tại và mật khẩu mới';
    if (userGroup) userGroup.style.display = 'block';
    if (cancelBtn) cancelBtn.style.display = 'block';
    const loginUser = document.getElementById('login-username')?.value?.trim() || '';
    const loginPwd = document.getElementById('login-password')?.value || '';
    if (userInp) userInp.value = loginUser;
    if (oldInp && loginPwd) oldInp.value = loginPwd;
  } else if (mode === 'sidebar') {
    if (titleEl) titleEl.textContent = 'Đổi Mật Khẩu Cá Nhân';
    if (subEl) subEl.textContent = 'Cập nhật mật khẩu mới cho tài khoản đang đăng nhập';
    if (userGroup) userGroup.style.display = 'none';
    if (cancelBtn) cancelBtn.style.display = 'block';
  } else {
    if (titleEl) titleEl.textContent = 'Đổi Mật Khẩu Lần Đầu';
    if (subEl) subEl.textContent = 'Vui lòng đặt mật khẩu mới trước khi tiếp tục';
    if (userGroup) userGroup.style.display = 'none';
    if (cancelBtn) cancelBtn.style.display = 'none';
  }

  if (overlay) overlay.style.display = 'flex';
  setTimeout(() => {
    if (mode === 'login' && userInp && !userInp.value) userInp.focus();
    else if (oldInp && !oldInp.value) oldInp.focus();
    else if (newInp) newInp.focus();
  }, 60);
}
window.openChangePasswordOverlay = openChangePasswordOverlay;

function closeChangePasswordOverlay() {
  const overlay = document.getElementById('force-pwd-overlay');
  if (overlay) overlay.style.display = 'none';
}
window.closeChangePasswordOverlay = closeChangePasswordOverlay;

async function handleForceChangePassword() {
  const old_password = document.getElementById('force-pwd-old').value;
  const new_password = document.getElementById('force-pwd-new').value;
  const errEl = document.getElementById('force-pwd-error');
  errEl.textContent = '';
  if (!old_password) { errEl.textContent = 'Vui lòng nhập mật khẩu hiện tại'; return; }
  if (!new_password || new_password.length < 6) { errEl.textContent = 'Mật khẩu mới tối thiểu 6 ký tự'; return; }
  try {
    // Nếu bấm Đổi mật khẩu từ màn hình Login (chưa có token), tự xác thực lấy token trước
    if (_pwdOverlayMode === 'login' && !Auth.getToken()) {
      const username = (document.getElementById('force-pwd-username')?.value || '').trim();
      if (!username) { errEl.textContent = 'Vui lòng nhập tên đăng nhập'; return; }
      const loginRes = await _origFetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: `username=${encodeURIComponent(username)}&password=${encodeURIComponent(old_password)}`
      });
      const loginData = await loginRes.json();
      if (!loginRes.ok) { errEl.textContent = loginData.detail || 'Tên đăng nhập hoặc mật khẩu hiện tại không đúng'; return; }
      Auth.setSession(loginData);
    }

    const res = await fetch('/api/auth/change-password', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ old_password, new_password })
    });
    const data = await res.json();
    if (!res.ok) { errEl.textContent = data.detail || 'Đổi mật khẩu thất bại'; return; }

    // Khi đổi mật khẩu xong backend tăng token_version+1, cần lấy lại token mới để phiên không bị 401
    const currentUsername = (_pwdOverlayMode === 'login'
      ? document.getElementById('force-pwd-username')?.value
      : document.getElementById('login-username')?.value)?.trim();
    if (currentUsername) {
      const relogin = await _origFetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: `username=${encodeURIComponent(currentUsername)}&password=${encodeURIComponent(new_password)}`
      });
      if (relogin.ok) {
        const reloginData = await relogin.json();
        Auth.setSession(reloginData);
      }
    }

    document.getElementById('force-pwd-overlay').style.display = 'none';
    hideLoginOverlay();
    if (window.showToast) window.showToast('Đổi mật khẩu thành công!', 'success');
    applyRoleUI();
    if (typeof loadCurrentShift === 'function') loadCurrentShift();
    triggerLandingTabSafe();
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
    try {
      const raw = localStorage.getItem('pos_custom_branding_v1');
      if (raw) {
        const ov = JSON.parse(raw);
        if (ov && typeof ov === 'object') {
          if (ov.shop_logo !== undefined) settings.shop_logo = ov.shop_logo;
          if (ov.app_name) settings.app_name = ov.app_name;
          if (ov.shop_name) settings.shop_name = ov.shop_name;
        }
      }
    } catch (_) {}
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
  setTimeout(() => {
    const userInp = document.getElementById('login-username');
    const pwdInp = document.getElementById('login-password');
    if (userInp && !userInp.value) {
      userInp.focus();
    } else if (pwdInp) {
      pwdInp.focus();
    }
  }, 100);
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

  // Ẩn/hiện elements theo data-role + data-module + data-perm
  document.querySelectorAll('[data-role], [data-perm]').forEach(el => {
    let roleOk = true;
    if (el.dataset.role) {
      const allowed = el.dataset.role.split(',').map(r => r.trim());
      roleOk = (user.role === 'owner' || user.role === 'admin' || allowed.includes(user.role));
    }
    const moduleKey = el.dataset.module;
    const moduleOk = !moduleKey || posModulesCache[moduleKey] !== false;

    let permOk = true;
    if (el.dataset.perm && user.role !== 'owner' && user.role !== 'admin') {
      const requiredPerms = el.dataset.perm.split(',').map(p => p.trim());
      permOk = requiredPerms.some(p => Auth.can(p));
    }

    el.style.display = (roleOk && moduleOk && permOk) ? '' : 'none';
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
  const userInput = document.getElementById('login-username');
  if (userInput) {
    userInput.addEventListener('keydown', e => {
      if (e.key === 'Enter') {
        const pwdInput = document.getElementById('login-password');
        if (pwdInput && !pwdInput.value) {
          pwdInput.focus();
        } else {
          handleLogin();
        }
      }
    });
  }

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
    triggerLandingTabSafe();
  } else {
    showLoginOverlay();
  }
});

function triggerLandingTabSafe() {
  if (typeof window.switchTab === 'function') {
    const user = Auth.getUser();
    if (user && user.role !== 'owner' && user.role !== 'admin') {
      // Nếu user chỉ có quyền purchases.request và không có quyền kho/nhập/pos
      if (Auth.can('purchases.request') && !Auth.can('purchases.manage') && !Auth.can('inventory.manage') && !Auth.can('pos.sell')) {
        window.switchTab('purchase-requests');
        return;
      }
    }
    window.switchTab('ai-agent');
  } else {
    setTimeout(triggerLandingTabSafe, 50);
  }
}
window.triggerLandingTabSafe = triggerLandingTabSafe;
window.triggerPOSTabSafe = triggerLandingTabSafe; // backward compatibility
// initPOSModule is called via switchTab('pos') when user switches to POS tab

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

