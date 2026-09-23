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

  if (btnOpen) btnOpen.style.display = hasShift ? 'none' : '';
  if (btnClose) btnClose.style.display = hasShift ? '' : 'none';

  if (statusEl) {
    if (hasShift) {
      const t = new Date(currentShift.open_at).toLocaleTimeString('vi-VN', {hour:'2-digit', minute:'2-digit'});
      const cash = (currentShift.opening_cash || 0).toLocaleString('vi-VN');
      statusEl.textContent = `⏱ Ca từ ${t} | Đầu ca: ${cash}đ`;
      statusEl.style.color = '#fde047';
    } else {
      statusEl.textContent = '⚠ Chưa mở ca';
      statusEl.style.color = '#f97316';
    }
  }
}

let currentShiftSummary = null;

function formatMoney(num) {
  return (Math.round(num) || 0).toLocaleString('vi-VN') + ' đ';
}

function parseMoney(str) {
  if (!str) return 0;
  return parseFloat(str.toString().replace(/[^0-9.]/g, '')) || 0;
}

// ── Mở ca làm việc ──
function openShiftModal() {
  const modal = document.getElementById('modal-open-shift');
  if (!modal) {
    const cash = prompt('💵 Tiền mặt đầu ca (đếm thực tế):');
    if (cash === null) return;
    submitOpenShiftValue(parseMoney(cash));
    return;
  }
  const input = document.getElementById('shift-open-cash-input');
  if (input) {
    input.value = '';
    setTimeout(() => { input.focus(); }, 50);
  }
  modal.classList.remove('hidden');
  modal.classList.add('flex');
  modal.style.display = 'flex';
}

function closeShiftOpenModal() {
  const modal = document.getElementById('modal-open-shift');
  if (modal) {
    modal.classList.add('hidden');
    modal.classList.remove('flex');
    modal.style.display = 'none';
  }
}

function handleOpeningCashInput(el) {
  const raw = el.value.replace(/[^0-9]/g, '');
  if (!raw) { el.value = ''; return; }
  el.value = parseInt(raw, 10).toLocaleString('vi-VN');
}

async function submitOpenShift() {
  const input = document.getElementById('shift-open-cash-input');
  const amount = parseMoney(input ? input.value : 0);
  await submitOpenShiftValue(amount);
}

async function submitOpenShiftValue(amount) {
  try {
    const res = await fetch('/api/shifts/open', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ opening_cash: amount })
    });
    const data = await res.json();
    if (res.ok) {
      closeShiftOpenModal();
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

// ── Kết ca làm việc (Shift Close / Z-Report) ──
async function closeShiftModal() {
  if (!currentShift) {
    alert('Không có ca đang mở');
    return;
  }

  try {
    const res = await fetch('/api/shifts/current/summary');
    if (!res.ok) {
      const err = await res.json();
      alert('❌ ' + (err.detail || 'Không tải được thông tin ca'));
      return;
    }
    currentShiftSummary = await res.json();
  } catch (e) {
    alert('❌ Không kết nối được server');
    return;
  }

  renderShiftCloseModal(currentShiftSummary);
  const modal = document.getElementById('modal-close-shift');
  if (modal) {
    modal.classList.remove('hidden');
    modal.classList.add('flex');
    modal.style.display = 'flex';
    const cashInput = document.getElementById('shift-close-cash-input');
    if (cashInput) setTimeout(() => { cashInput.focus(); cashInput.select(); }, 50);
  }
}

function closeShiftCloseModal() {
  const modal = document.getElementById('modal-close-shift');
  if (modal) {
    modal.classList.add('hidden');
    modal.classList.remove('flex');
    modal.style.display = 'none';
  }
}

function renderShiftCloseModal(summary) {
  if (!summary) return;
  const s = summary.shift || {};
  const orders = summary.order_stats || {};
  const cash = summary.cash_stats || {};

  const cashierEl = document.getElementById('shift-close-cashier');
  const openAtEl = document.getElementById('shift-close-open-at');
  const durationEl = document.getElementById('shift-close-duration');
  if (cashierEl) cashierEl.textContent = s.cashier_name || 'Thu ngân';
  if (openAtEl && s.open_at) {
    openAtEl.textContent = new Date(s.open_at).toLocaleString('vi-VN', {
      hour: '2-digit', minute: '2-digit', day: '2-digit', month: '2-digit', year: 'numeric'
    });
  }
  if (durationEl && s.open_at) {
    const ms = Date.now() - new Date(s.open_at).getTime();
    const hours = Math.floor(ms / 3600000);
    const mins = Math.floor((ms % 3600000) / 60000);
    durationEl.textContent = `${hours}h ${mins}m`;
  }

  const orderCountEl = document.getElementById('shift-close-order-count');
  const totalSalesEl = document.getElementById('shift-close-total-sales');
  const cashSalesEl = document.getElementById('shift-close-cash-sales');
  const bankSalesEl = document.getElementById('shift-close-bank-sales');

  if (orderCountEl) orderCountEl.textContent = `${orders.order_count || 0} đơn`;
  if (totalSalesEl) totalSalesEl.textContent = formatMoney(orders.total_sales || 0);
  if (cashSalesEl) cashSalesEl.textContent = formatMoney(cash.cash_sales || 0);
  if (bankSalesEl) bankSalesEl.textContent = formatMoney((cash.bank_sales || 0) + (cash.ewallet_sales || 0));

  const openCashEl = document.getElementById('shift-close-opening-cash');
  const cashInSalesEl = document.getElementById('shift-close-cash-in-sales');
  const otherInRow = document.getElementById('row-shift-other-in');
  const otherInEl = document.getElementById('shift-close-other-cash-in');
  const cashOutRow = document.getElementById('row-shift-cash-out');
  const cashOutEl = document.getElementById('shift-close-cash-out');
  const expectedEl = document.getElementById('shift-close-expected-cash');

  if (openCashEl) openCashEl.textContent = formatMoney(s.opening_cash || 0);
  if (cashInSalesEl) cashInSalesEl.textContent = formatMoney(cash.cash_sales || 0);

  if (otherInRow && otherInEl) {
    const oIn = cash.other_cash_in || 0;
    otherInRow.style.display = oIn > 0 ? '' : 'none';
    otherInEl.textContent = formatMoney(oIn);
  }
  if (cashOutRow && cashOutEl) {
    const cOut = cash.cash_out || 0;
    cashOutRow.style.display = cOut > 0 ? '' : 'none';
    cashOutEl.textContent = formatMoney(cOut);
  }
  if (expectedEl) expectedEl.textContent = formatMoney(summary.expected_cash || 0);

  const cashInput = document.getElementById('shift-close-cash-input');
  if (cashInput && !cashInput.value) cashInput.value = '';

  const noteInput = document.getElementById('shift-close-note');
  if (noteInput) noteInput.value = '';

  updateShiftCloseDiff();
}

function handleClosingCashInput(el) {
  const raw = el.value.replace(/[^0-9]/g, '');
  if (!raw) { el.value = ''; }
  else { el.value = parseInt(raw, 10).toLocaleString('vi-VN'); }
  updateShiftCloseDiff();
}

function updateShiftCloseDiff() {
  if (!currentShiftSummary) return;
  const cashInput = document.getElementById('shift-close-cash-input');
  const diffBadge = document.getElementById('shift-close-diff-badge');
  if (!diffBadge) return;

  const rawVal = cashInput ? cashInput.value.trim() : '';
  if (!rawVal) {
    diffBadge.className = 'font-bold text-xs px-2.5 py-0.5 rounded bg-slate-100 text-slate-600';
    diffBadge.textContent = 'Chưa nhập tiền kiểm đếm';
    return;
  }

  const closingVal = parseMoney(rawVal);
  const expectedVal = currentShiftSummary.expected_cash || 0;
  const diff = closingVal - expectedVal;

  if (diff === 0) {
    diffBadge.className = 'font-bold text-xs px-2.5 py-0.5 rounded bg-emerald-100 text-emerald-800 border border-emerald-300';
    diffBadge.textContent = '✅ Khớp két (0 đ)';
  } else if (diff > 0) {
    diffBadge.className = 'font-bold text-xs px-2.5 py-0.5 rounded bg-sky-100 text-sky-800 border border-sky-300';
    diffBadge.textContent = `⬆ Thừa két: +${diff.toLocaleString('vi-VN')} đ`;
  } else {
    diffBadge.className = 'font-bold text-xs px-2.5 py-0.5 rounded bg-rose-100 text-rose-800 border border-rose-300';
    diffBadge.textContent = `⬇ Thiếu két: ${diff.toLocaleString('vi-VN')} đ`;
  }
}

async function submitCloseShift() {
  if (!currentShift || !currentShiftSummary) {
    alert('Không tìm thấy thông tin ca');
    return;
  }
  const cashInput = document.getElementById('shift-close-cash-input');
  const noteInput = document.getElementById('shift-close-note');

  if (!cashInput || !cashInput.value.trim()) {
    if (!confirm('Bạn chưa nhập tiền mặt thực tế kiểm đếm (mặc định = 0 đ). Tiếp tục?')) {
      cashInput?.focus();
      return;
    }
  }

  const closingAmount = parseMoney(cashInput ? cashInput.value : 0);
  const note = noteInput ? noteInput.value.trim() : '';

  try {
    const res = await fetch(`/api/shifts/${currentShift.id}/close`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ closing_cash: closingAmount, note })
    });
    const data = await res.json();
    if (res.ok) {
      closeShiftCloseModal();

      const summaryResult = data.summary || currentShiftSummary;
      if (summaryResult && summaryResult.shift) {
        summaryResult.shift.closing_cash = closingAmount;
        summaryResult.shift.expected_cash = data.expected_cash;
        summaryResult.shift.difference = data.difference;
        summaryResult.shift.note = note;
      }

      currentShift = null;
      updateShiftUI();

      const diff = data.difference || 0;
      const sign = diff >= 0 ? '+' : '';
      const diffIcon = diff === 0 ? '✅' : diff > 0 ? '⬆' : '⬇';
      const msg = `Kết ca hoàn tất!\n` +
        `• Két lý thuyết: ${(data.expected_cash||0).toLocaleString('vi-VN')} đ\n` +
        `• Thực tế đếm:   ${closingAmount.toLocaleString('vi-VN')} đ\n` +
        `• Chênh lệch:    ${diffIcon} ${sign}${diff.toLocaleString('vi-VN')} đ\n\n` +
        `Bạn có muốn in phiếu kết ca (Z-Report) không?`;

      if (confirm(msg)) {
        printShiftZReport(summaryResult);
      } else if (typeof showToast === 'function') {
        showToast('✅ Kết ca hoàn tất', 'success');
      }
    } else {
      alert('❌ ' + (data.detail || 'Lỗi kết ca'));
    }
  } catch (e) {
    alert('❌ Không kết nối được server');
  }
}

function printCurrentShiftZReport() {
  if (!currentShiftSummary) return;
  const cashInput = document.getElementById('shift-close-cash-input');
  const noteInput = document.getElementById('shift-close-note');

  const previewSummary = JSON.parse(JSON.stringify(currentShiftSummary));
  previewSummary.shift.closing_cash = parseMoney(cashInput ? cashInput.value : 0);
  previewSummary.shift.note = noteInput ? noteInput.value.trim() : '';
  previewSummary.shift.close_at = new Date().toISOString();

  printShiftZReport(previewSummary);
}

function printShiftZReport(summaryData) {
  if (!summaryData) return;
  const s = summaryData.shift || {};
  const orders = summaryData.order_stats || {};
  const cash = summaryData.cash_stats || {};
  const openTime = s.open_at ? new Date(s.open_at).toLocaleString('vi-VN') : '-';
  const closeTime = s.close_at ? new Date(s.close_at).toLocaleString('vi-VN') : new Date().toLocaleString('vi-VN');
  const fmt = n => (Math.round(n) || 0).toLocaleString('vi-VN') + ' đ';

  const diff = (s.closing_cash || 0) - (s.expected_cash || 0);
  const diffSign = diff >= 0 ? '+' : '';
  const diffText = diff === 0 ? '0 đ (Khớp)' : `${diffSign}${fmt(diff)}`;

  const html = `
    <div style="font-family: 'Courier New', monospace, sans-serif; font-size: 13px; max-width: 320px; margin: 0 auto; color: #111; line-height: 1.45; padding: 10px;">
      <div style="text-align: center; border-bottom: 1px dashed #000; padding-bottom: 8px; margin-bottom: 8px;">
        <h2 style="margin: 0; font-size: 16px; font-weight: bold; text-transform: uppercase;">PHIẾU TỔNG KẾT CA (Z-REPORT)</h2>
        <div style="font-size: 11px; margin-top: 3px; font-weight: bold;">HỆ THỐNG POS BÁN LẺ & PET CARE</div>
        <div style="font-size: 11px; margin-top: 3px;">Mã ca: <strong>#${s.id}</strong> | Thu ngân: <strong>${s.cashier_name || 'Thu ngân'}</strong></div>
        <div style="font-size: 10px; margin-top: 3px;">Giờ mở: ${openTime}</div>
        <div style="font-size: 10px;">Giờ chốt: ${closeTime}</div>
      </div>

      <div style="border-bottom: 1px dashed #000; padding-bottom: 6px; margin-bottom: 6px;">
        <div style="font-weight: bold; margin-bottom: 4px; text-transform: uppercase; font-size: 12px;">I. DOANH SỐ BÁN HÀNG</div>
        <div style="display: flex; justify-content: space-between;"><span>Số hóa đơn:</span><strong>${orders.order_count || 0} đơn</strong></div>
        <div style="display: flex; justify-content: space-between;"><span>Tổng doanh số:</span><strong>${fmt(orders.total_sales)}</strong></div>
        <div style="display: flex; justify-content: space-between; padding-left: 8px; font-size: 12px; color: #333;">
          <span>• Tiền mặt:</span><span>${fmt(cash.cash_sales)}</span>
        </div>
        <div style="display: flex; justify-content: space-between; padding-left: 8px; font-size: 12px; color: #333;">
          <span>• Chuyển khoản:</span><span>${fmt((cash.bank_sales || 0) + (cash.ewallet_sales || 0))}</span>
        </div>
        ${orders.total_debt ? `<div style="display: flex; justify-content: space-between; padding-left: 8px; font-size: 12px; color: #c00;"><span>• Ghi nợ KH:</span><span>${fmt(orders.total_debt)}</span></div>` : ''}
      </div>

      <div style="border-bottom: 1px dashed #000; padding-bottom: 6px; margin-bottom: 6px;">
        <div style="font-weight: bold; margin-bottom: 4px; text-transform: uppercase; font-size: 12px;">II. CÂN ĐỐI TIỀN KÉT (TM-POS)</div>
        <div style="display: flex; justify-content: space-between;"><span>(+) Tiền mặt đầu ca:</span><span>${fmt(s.opening_cash)}</span></div>
        <div style="display: flex; justify-content: space-between;"><span>(+) Tiền mặt bán hàng:</span><span>${fmt(cash.cash_sales)}</span></div>
        ${cash.other_cash_in ? `<div style="display: flex; justify-content: space-between;"><span>(+) Thu quỹ khác:</span><span>${fmt(cash.other_cash_in)}</span></div>` : ''}
        ${cash.cash_out ? `<div style="display: flex; justify-content: space-between;"><span>(-) Chi quỹ tiền mặt:</span><span>${fmt(cash.cash_out)}</span></div>` : ''}
        <div style="display: flex; justify-content: space-between; font-weight: bold; border-top: 1px dotted #888; margin-top: 4px; padding-top: 3px;">
          <span>KÉT LÝ THUYẾT:</span><span>${fmt(s.expected_cash)}</span>
        </div>
        <div style="display: flex; justify-content: space-between; font-weight: bold; font-size: 14px; margin-top: 2px;">
          <span>THỰC TẾ ĐẾM:</span><span>${fmt(s.closing_cash)}</span>
        </div>
        <div style="display: flex; justify-content: space-between; font-weight: bold; border-top: 1px dotted #888; margin-top: 2px; padding-top: 2px;">
          <span>CHÊNH LỆCH:</span><span>${diffText}</span>
        </div>
      </div>

      ${s.note ? `
      <div style="font-size: 11px; margin-bottom: 8px; border-bottom: 1px dashed #000; padding-bottom: 4px;">
        <em>Ghi chú: ${s.note}</em>
      </div>` : ''}

      <div style="display: flex; justify-content: space-between; text-align: center; margin-top: 16px; padding-bottom: 30px;">
        <div style="flex: 1;">
          <strong>Thu ngân</strong><br><br><br>
          <span style="font-size: 11px;">${s.cashier_name || ''}</span>
        </div>
        <div style="flex: 1;">
          <strong>Quản lý / Kế toán</strong><br><br><br>
          <span style="font-size: 11px;">(Ký & ghi rõ họ tên)</span>
        </div>
      </div>
      <div style="text-align: center; font-size: 10px; color: #777; border-top: 1px dashed #000; padding-top: 4px;">
        In lúc: ${new Date().toLocaleString('vi-VN')}
      </div>
    </div>
  `;

  const printArea = document.getElementById('print-area');
  const printModal = document.getElementById('print-modal');
  const printTitle = document.getElementById('print-modal-title');
  const printSubmitText = document.getElementById('print-modal-submit-text');

  if (printTitle) {
    printTitle.innerHTML = '<span>🧾</span><span>Xem Trước & In Phiếu Kết Ca (Z-Report)</span>';
  }
  if (printSubmitText) {
    printSubmitText.textContent = 'Xác Nhận In Phiếu Ca';
  }

  if (printArea && printModal) {
    printArea.innerHTML = html;
    printModal.classList.remove('hidden');
    printModal.classList.add('flex');
    printModal.style.display = 'flex';
  } else {
    const w = window.open('', '_blank');
    w.document.write(`<html><head><title>Z-Report</title></head><body onload="window.print();">${html}</body></html>`);
    w.document.close();
  }
}

// Hàm đóng popup in ấn chung
function closePrintModal() {
  const pm = document.getElementById('print-modal');
  if (pm) {
    pm.classList.add('hidden');
    pm.classList.remove('flex');
    pm.style.display = 'none';
  }
}
window.closePrintModal = closePrintModal;

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

// ── Bảng đếm tiền mặt theo mệnh giá (Cash Counter) ──
const CASH_DENOMS = [500000, 200000, 100000, 50000, 20000, 10000, 5000, 2000, 1000, 500];

function openCashCounterModal() {
  const modal = document.getElementById('modal-cash-counter');
  if (!modal) {
    console.error('Không tìm thấy element modal-cash-counter');
    return;
  }
  modal.classList.remove('hidden');
  modal.classList.add('flex');
  modal.style.display = 'flex';

  const applyBtn = document.getElementById('btn-apply-cash-shift');
  if (applyBtn) {
    if (typeof currentShift !== 'undefined' && currentShift) {
      applyBtn.innerHTML = '⏹ Điền vào Kết Ca';
      applyBtn.className = 'px-3 py-1.5 rounded bg-amber-600 hover:bg-amber-500 text-white font-bold transition flex items-center gap-1 text-xs';
      applyBtn.title = 'Áp dụng số tiền này để kết ca hiện tại';
    } else {
      applyBtn.innerHTML = '▶ Điền vào Mở Ca';
      applyBtn.className = 'px-3 py-1.5 rounded bg-emerald-600 hover:bg-emerald-500 text-white font-bold transition flex items-center gap-1 text-xs';
      applyBtn.title = 'Áp dụng số tiền này làm tiền đầu ca';
    }
  }

  calcCashCounter();
  const firstInput = document.getElementById('cash-qty-500000');
  if (firstInput) {
    setTimeout(() => {
      firstInput.focus();
      firstInput.select();
    }, 50);
  }
}

window.openCashCounterModal = openCashCounterModal;
window.closeCashCounterModal = closeCashCounterModal;

function closeCashCounterModal() {
  const modal = document.getElementById('modal-cash-counter');
  if (modal) {
    modal.classList.add('hidden');
    modal.classList.remove('flex');
    modal.style.display = 'none';
  }
}

function handleCashKeydown(e, currentDenom) {
  if (e.key === 'Enter' || e.key === 'ArrowDown') {
    e.preventDefault();
    const idx = CASH_DENOMS.indexOf(currentDenom);
    if (idx !== -1 && idx < CASH_DENOMS.length - 1) {
      const nextInput = document.getElementById(`cash-qty-${CASH_DENOMS[idx + 1]}`);
      if (nextInput) { nextInput.focus(); nextInput.select(); }
    }
  } else if (e.key === 'ArrowUp') {
    e.preventDefault();
    const idx = CASH_DENOMS.indexOf(currentDenom);
    if (idx > 0) {
      const prevInput = document.getElementById(`cash-qty-${CASH_DENOMS[idx - 1]}`);
      if (prevInput) { prevInput.focus(); prevInput.select(); }
    }
  } else if (e.key === 'Escape') {
    closeCashCounterModal();
  }
}

function calcCashCounter() {
  let totalBills = 0;
  let totalAmount = 0;
  for (const d of CASH_DENOMS) {
    const input = document.getElementById(`cash-qty-${d}`);
    const subtotalEl = document.getElementById(`cash-subtotal-${d}`);
    const qty = Math.max(0, parseInt(input?.value, 10) || 0);
    const subtotal = qty * d;
    totalBills += qty;
    totalAmount += subtotal;
    if (subtotalEl) {
      subtotalEl.textContent = subtotal ? subtotal.toLocaleString('vi-VN') + ' đ' : '0 đ';
      subtotalEl.className = subtotal ? 'font-bold text-slate-800 text-xs text-right' : 'text-slate-400 font-medium text-xs text-right';
    }
  }
  const totalBillsEl = document.getElementById('cash-counter-total-bills');
  const totalAmountEl = document.getElementById('cash-counter-total-amount');
  if (totalBillsEl) totalBillsEl.textContent = totalBills.toLocaleString('vi-VN');
  if (totalAmountEl) totalAmountEl.textContent = totalAmount.toLocaleString('vi-VN') + ' đ';
  return { totalBills, totalAmount };
}

function resetCashCounter() {
  for (const d of CASH_DENOMS) {
    const input = document.getElementById(`cash-qty-${d}`);
    if (input) input.value = '';
    const subtotalEl = document.getElementById(`cash-subtotal-${d}`);
    if (subtotalEl) {
      subtotalEl.textContent = '0 đ';
      subtotalEl.className = 'text-slate-400 font-medium text-xs text-right';
    }
  }
  const totalBillsEl = document.getElementById('cash-counter-total-bills');
  const totalAmountEl = document.getElementById('cash-counter-total-amount');
  if (totalBillsEl) totalBillsEl.textContent = '0';
  if (totalAmountEl) totalAmountEl.textContent = '0 đ';
  const firstInput = document.getElementById('cash-qty-500000');
  if (firstInput) { firstInput.focus(); firstInput.select(); }
}

function copyCashCounterTotal() {
  const { totalAmount } = calcCashCounter();
  const text = totalAmount.toString();
  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(text).then(() => {
      if (typeof showToast === 'function') {
        showToast(`Đã sao chép: ${totalAmount.toLocaleString('vi-VN')} đ`, 'success');
      } else {
        alert(`Đã sao chép: ${totalAmount.toLocaleString('vi-VN')} đ`);
      }
    }).catch(() => {
      alert(`Số tiền: ${totalAmount.toLocaleString('vi-VN')} đ`);
    });
  } else {
    alert(`Số tiền: ${totalAmount.toLocaleString('vi-VN')} đ`);
  }
}

async function applyCashToShift() {
  const { totalAmount } = calcCashCounter();

  // 1. Nếu modal kết ca đang mở -> điền vào ô tiền thực tế của modal kết ca
  const modalClose = document.getElementById('modal-close-shift');
  if (modalClose && !modalClose.classList.contains('hidden')) {
    const input = document.getElementById('shift-close-cash-input');
    if (input) {
      input.value = totalAmount ? totalAmount.toLocaleString('vi-VN') : '0';
      updateShiftCloseDiff();
      closeCashCounterModal();
      if (typeof showToast === 'function') showToast(`Đã điền ${totalAmount.toLocaleString('vi-VN')} đ`, 'success');
      return;
    }
  }

  // 2. Nếu modal mở ca đang mở -> điền vào ô tiền đầu ca của modal mở ca
  const modalOpen = document.getElementById('modal-open-shift');
  if (modalOpen && !modalOpen.classList.contains('hidden')) {
    const input = document.getElementById('shift-open-cash-input');
    if (input) {
      input.value = totalAmount ? totalAmount.toLocaleString('vi-VN') : '0';
      closeCashCounterModal();
      if (typeof showToast === 'function') showToast(`Đã điền ${totalAmount.toLocaleString('vi-VN')} đ`, 'success');
      return;
    }
  }

  // 3. Nếu không có modal nào mở -> mở modal tương ứng và điền số tiền
  closeCashCounterModal();
  if (currentShift) {
    await closeShiftModal();
    const input = document.getElementById('shift-close-cash-input');
    if (input) {
      input.value = totalAmount ? totalAmount.toLocaleString('vi-VN') : '0';
      updateShiftCloseDiff();
    }
  } else {
    openShiftModal();
    const input = document.getElementById('shift-open-cash-input');
    if (input) {
      input.value = totalAmount ? totalAmount.toLocaleString('vi-VN') : '0';
    }
  }
}

// ── Hỗ trợ phím Escape đóng modal theo thứ tự ưu tiên ──
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') {
    const pm = document.getElementById('print-modal');
    if (pm && !pm.classList.contains('hidden') && pm.style.display !== 'none') {
      closePrintModal();
      return;
    }
    const cc = document.getElementById('modal-cash-counter');
    if (cc && !cc.classList.contains('hidden') && cc.style.display !== 'none') {
      closeCashCounterModal();
      return;
    }
    const cs = document.getElementById('modal-close-shift');
    if (cs && !cs.classList.contains('hidden') && cs.style.display !== 'none') {
      closeShiftCloseModal();
      return;
    }
    const os = document.getElementById('modal-open-shift');
    if (os && !os.classList.contains('hidden') && os.style.display !== 'none') {
      closeShiftOpenModal();
      return;
    }
  }
});

// ── Xuất các hàm ra phạm vi toàn cục window ──
window.openShiftModal = openShiftModal;
window.closeShiftOpenModal = closeShiftOpenModal;
window.submitOpenShift = submitOpenShift;
window.closeShiftModal = closeShiftModal;
window.closeShiftCloseModal = closeShiftCloseModal;
window.submitCloseShift = submitCloseShift;
window.printCurrentShiftZReport = printCurrentShiftZReport;
window.printShiftZReport = printShiftZReport;
window.closePrintModal = closePrintModal;
window.openCashCounterModal = openCashCounterModal;
window.closeCashCounterModal = closeCashCounterModal;
window.calcCashCounter = calcCashCounter;
window.resetCashCounter = resetCashCounter;
window.copyCashCounterTotal = copyCashCounterTotal;
window.applyCashToShift = applyCashToShift;
window.handleCashKeydown = handleCashKeydown;
window.handleOpeningCashInput = handleOpeningCashInput;
window.handleClosingCashInput = handleClosingCashInput;

// ── Tự động tải ca khi tải xong trang ──
if (document.readyState === 'complete' || document.readyState === 'interactive') {
  setTimeout(() => { if (typeof Auth !== 'undefined' && Auth.getToken()) loadCurrentShift(); }, 100);
} else {
  document.addEventListener('DOMContentLoaded', () => {
    setTimeout(() => { if (typeof Auth !== 'undefined' && Auth.getToken()) loadCurrentShift(); }, 100);
  });
}
