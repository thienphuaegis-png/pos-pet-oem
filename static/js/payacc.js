/* Tiện ích chọn TÀI KHOẢN NHẬN TIỀN dùng chung (Spa, Khách sạn, Đổi/trả, Nạp ví, POS mobile, Phiếu nhập).
   - Chuyển khoản -> tài khoản bank / ví điện tử; Thẻ -> "Máy POS thẻ" (pos_card); Tiền mặt -> két.
   - Nhớ tài khoản chọn lần cuối theo từng hình thức, lưu trên máy này (localStorage).
   - Server vẫn kiểm tra lại (dependencies.resolve_payment_account), file này chỉ lo giao diện. */
(function () {
  if (window.PayAcc) return;
  const TYPES = { cash: ['cash'], transfer: ['bank', 'ewallet'], bank: ['bank', 'ewallet'], wallet: ['bank', 'ewallet'], card: ['pos_card'] };
  const LABEL = { cash: 'Tiền mặt', transfer: 'Chuyển khoản', bank: 'Chuyển khoản', wallet: 'Ví điện tử', card: 'Quẹt thẻ' };
  const KEY = m => 'pos_last_pay_acc_' + (m === 'bank' || m === 'wallet' ? 'transfer' : m);
  let cache = null, loading = null;

  async function load(force) {
    if (cache && !force) return cache;
    if (loading && !force) return loading;
    loading = (async () => {
      try {
        const r = await fetch('/api/payment-accounts?_t=' + Date.now());
        const d = r.ok ? await r.json() : [];
        cache = Array.isArray(d) ? d.filter(a => a.is_active !== 0) : [];
      } catch (e) { cache = []; }
      return cache;
    })();
    return loading;
  }
  const needsAccount = m => m === 'transfer' || m === 'bank' || m === 'card' || m === 'wallet';
  const forMethod = m => (cache || []).filter(a => (TYPES[m] || ['cash']).includes(a.account_type));
  const esc = s => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

  function optionText(a) {
    const owner = a.owner_type === 'COMPANY' ? 'Cty' : 'Cá nhân';
    if (a.account_type === 'pos_card') return `${a.name} (${owner})`;
    if (a.account_type === 'cash') return `${a.name}`;
    const detail = a.account_number ? `${a.bank_name || ''} ${a.account_number}`.trim() : '⚠ chưa có số TK';
    return `${a.name} (${owner}) - ${detail}`;
  }

  // Đổ danh sách vào <select>. Chọn lại tài khoản dùng lần trước nếu còn hợp lệ.
  function fill(sel, method, preferId) {
    if (!sel) return;
    const list = forMethod(method);
    if (!list.length) {
      sel.innerHTML = `<option value="">-- Chưa có tài khoản cho "${LABEL[method] || method}" (vào Sổ quỹ > Tài khoản thanh toán để tạo) --</option>`;
      return;
    }
    sel.innerHTML = list.map(a => `<option value="${a.id}">${esc(optionText(a))}</option>`).join('');
    const last = Number(localStorage.getItem(KEY(method)) || 0);
    const want = [preferId, last].map(Number).find(id => id && list.some(a => a.id === id));
    sel.value = String(want || list[0].id);
    if (!sel.dataset.payaccBound) {
      sel.dataset.payaccBound = '1';
      sel.addEventListener('change', () => { if (sel.value) localStorage.setItem(KEY(sel.dataset.payaccMethod || method), sel.value); });
    }
    sel.dataset.payaccMethod = method;
  }

  // Giá trị cần gửi lên server. Tiền mặt -> null (server tự dùng két).
  function value(method, sel) {
    if (!needsAccount(method)) return null;
    const v = sel ? parseInt(sel.value) : 0;
    return v || null;
  }

  // Báo lỗi (chuỗi) nếu thiếu / tài khoản bank thiếu số TK; null nếu ổn.
  function validate(method, accId) {
    if (!needsAccount(method)) return null;
    if (!accId) return `Vui lòng chọn tài khoản nhận tiền cho hình thức ${LABEL[method] || method}!`;
    const acc = (cache || []).find(a => a.id === Number(accId));
    if (!acc) return 'Tài khoản nhận tiền không hợp lệ, vui lòng chọn lại!';
    if (acc.account_type === 'bank' && (!acc.bank_name || !acc.account_number)) {
      return `Tài khoản "${acc.name}" chưa có Ngân hàng hoặc Số tài khoản.\nVào Sổ quỹ > Tài khoản thanh toán để cập nhật trước khi thu.`;
    }
    return null;
  }

  // Gắn một cụm [wrapId, selectId] theo <select> hình thức: ẩn/hiện + đổ danh sách khi đổi hình thức
  async function bind(methodSel, wrapEl, accSel) {
    if (!methodSel || !wrapEl || !accSel) return;
    await load();
    const sync = () => {
      const m = methodSel.value || 'cash';
      const need = needsAccount(m);
      wrapEl.classList.toggle('hidden', !need);
      if (need) fill(accSel, m);
    };
    if (!methodSel.dataset.payaccBound) {
      methodSel.dataset.payaccBound = '1';
      methodSel.addEventListener('change', sync);
    }
    sync();
  }

  window.PayAcc = { load, fill, value, validate, bind, needsAccount, forMethod, label: m => LABEL[m] || m };
})();
