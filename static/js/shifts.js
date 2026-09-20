// ── Ca làm việc (Shifts) ──
let currentShift = null;

async function loadCurrentShift() {
  try {
    const res = await fetch('/api/shifts/current');
    if (res.ok) {
      currentShift = await res.json();
    } else {
      currentShift = null;
    }
  } catch {
    currentShift = null;
  }
  updateShiftUI();
}

function updateShiftUI() {
 const btnOpen = document.getElementById('btn-open-shift');
 const btnClose = document.getElementById('btn-close-shift');
 const statusEl = document.getElementById('header-shift-status');
 const lockOverlay = document.getElementById('pos-shift-lock-overlay');

 const hasShift = !!currentShift;

 if (lockOverlay) lockOverlay.classList.toggle('hidden', hasShift);

 if (!btnOpen || !btnClose) return;

 btnOpen.style.display = hasShift ? 'none' : '';
 btnClose.style.display = hasShift ? '' : 'none';

 if (statusEl) {
 if (hasShift) {
 const t = new Date(currentShift.open_at).toLocaleTimeString('vi-VN', {hour:'2-digit', minute:'2-digit'});
 const cash = (currentShift.opening_cash || 0).toLocaleString('vi-VN');
 statusEl.textContent = `⏱ Ca từ ${t} | Đầu ca: ${cash}đ`;
 } else {
 statusEl.textContent = '⚠ Chưa mở ca';
 statusEl.style.color = '#e67e22';
 }
 }
}

async function openShiftModal() {
  const cash = prompt('💵 Tiền mặt đầu ca (đếm thực tế):');
  if (cash === null) return;
  const amount = parseFloat(cash.replace(/[^0-9.]/g, '')) || 0;
  try {
    const res = await fetch('/api/shifts/open', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ opening_cash: amount })
    });
    const data = await res.json();
    if (res.ok) {
      await loadCurrentShift();
      if (typeof showToast === 'function') showToast('✅ Mở ca thành công', 'success');
      else alert('Mở ca thành công!');
    } else {
      alert('❌ ' + (data.detail || 'Lỗi mở ca'));
    }
  } catch (e) {
    alert('❌ Không kết nối được server');
  }
}

async function closeShiftModal() {
  if (!currentShift) { alert('Không có ca đang mở'); return; }
  const cash = prompt('💵 Tiền mặt cuối ca (đếm thực tế):');
  if (cash === null) return;
  const note = prompt('📝 Ghi chú (tuỳ chọn):') || '';
  const amount = parseFloat(cash.replace(/[^0-9.]/g, '')) || 0;
  try {
    const res = await fetch(`/api/shifts/${currentShift.id}/close`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ closing_cash: amount, note })
    });
    const data = await res.json();
    if (res.ok) {
      const diff = data.difference || 0;
      const sign = diff >= 0 ? '+' : '';
      const diffColor = diff === 0 ? '✅' : diff > 0 ? '⬆' : '⬇';
      alert(
        `Kết ca hoàn tất!\n` +
        `Lý thuyết: ${(data.expected_cash||0).toLocaleString('vi-VN')}đ\n` +
        `Thực tế:   ${(data.closing_cash||0).toLocaleString('vi-VN')}đ\n` +
        `Chênh lệch: ${diffColor} ${sign}${diff.toLocaleString('vi-VN')}đ`
      );
      currentShift = null;
      updateShiftUI();
    } else {
      alert('❌ ' + (data.detail || 'Lỗi kết ca'));
    }
  } catch (e) {
    alert('❌ Không kết nối được server');
  }
}

// ── Lịch sử ca + duyệt ca (tab accountant/owner) ──
async function loadShiftsHistory() {
  const tbody = document.getElementById('shifts-table-body');
  if (!tbody) return;
  tbody.innerHTML = `<tr><td colspan="11" class="p-4 text-center text-gray-400">Đang tải...</td></tr>`;
  try {
    const res = await fetch('/api/shifts/');
    if (!res.ok) { tbody.innerHTML = `<tr><td colspan="11" class="p-4 text-center text-rose-500">Không có quyền xem</td></tr>`; return; }
    const rows = await res.json();
    if (!rows.length) { tbody.innerHTML = `<tr><td colspan="11" class="p-4 text-center text-gray-400">Chưa có ca nào</td></tr>`; return; }
    const fmt = n => (n || 0).toLocaleString('vi-VN') + 'đ';
    const statusBadge = s => ({
      open: '<span class="px-2 py-0.5 rounded bg-sky-100 text-sky-700 font-bold">Đang mở</span>',
      closed: '<span class="px-2 py-0.5 rounded bg-amber-100 text-amber-700 font-bold">Chờ duyệt</span>',
      approved: '<span class="px-2 py-0.5 rounded bg-emerald-100 text-emerald-700 font-bold">Đã duyệt</span>'
    }[s] || s);
    tbody.innerHTML = rows.map(r => `
      <tr class="border-t hover:bg-slate-50">
        <td class="p-2.5">${r.cashier_name}</td>
        <td class="p-2.5">${r.open_at ? new Date(r.open_at).toLocaleString('vi-VN') : '-'}</td>
        <td class="p-2.5">${r.close_at ? new Date(r.close_at).toLocaleString('vi-VN') : '-'}</td>
        <td class="p-2.5 text-right">${r.order_count}</td>
        <td class="p-2.5 text-right font-bold text-blue-600">${fmt(r.total_sales)}</td>
        <td class="p-2.5 text-right">${fmt(r.opening_cash)}</td>
        <td class="p-2.5 text-right">${r.expected_cash != null ? fmt(r.expected_cash) : '-'}</td>
        <td class="p-2.5 text-right">${r.closing_cash != null ? fmt(r.closing_cash) : '-'}</td>
        <td class="p-2.5 text-right font-bold ${r.difference > 0 ? 'text-emerald-600' : (r.difference < 0 ? 'text-rose-600' : 'text-gray-500')}">${r.difference != null ? fmt(r.difference) : '-'}</td>
        <td class="p-2.5 text-center">${statusBadge(r.status)}</td>
        <td class="p-2.5 text-center">${r.status === 'closed' ? `<button onclick="approveShift(${r.id})" class="bg-emerald-600 hover:bg-emerald-700 text-white px-2 py-1 rounded text-[11px] font-bold">Duyệt</button>` : (r.approver_name || '-')}</td>
      </tr>
    `).join('');
  } catch (e) {
    tbody.innerHTML = `<tr><td colspan="11" class="p-4 text-center text-rose-500">Lỗi tải dữ liệu</td></tr>`;
  }
}

async function approveShift(shiftId) {
  if (!confirm('Xác nhận duyệt ca này?')) return;
  try {
    const res = await fetch(`/api/shifts/${shiftId}/approve`, { method: 'POST' });
    const data = await res.json();
    if (res.ok) { loadShiftsHistory(); } else { alert('❌ ' + (data.detail || 'Lỗi duyệt ca')); }
  } catch (e) {
    alert('❌ Không kết nối được server');
  }
}
