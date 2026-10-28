/* Ghi log thao tác + lỗi phía trình duyệt -> POST /api/client-log -> logs/client.log
   Cần đăng nhập (token). Không log nội dung ô nhập, chỉ id/tên phím/trạng thái droplist. */
(function () {
  if (window.__clientLogInit) return;
  window.__clientLogInit = true;
  // Trên môi trường Cloud (Vercel / Cloudflare Pages / Workers), tắt gửi log định kỳ 2s để bảo toàn hạn mức request miễn phí
  const h = location.hostname || '';
  const isLocalOrLan = h === 'localhost' || h === '127.0.0.1' || h === 'pos-server' || h.startsWith('192.168.') || h.startsWith('10.') || h.startsWith('100.');
  if (!isLocalOrLan) return;
  const q = [];
  const ts = () => new Date().toISOString().slice(11, 23);
  function push(kind, msg) { q.push(`${ts()} ${kind} ${String(msg).slice(0, 400)}`); if (q.length > 200) q.shift(); }
  function flush() {
    if (!q.length || !localStorage.getItem('pos_token')) return;
    const lines = q.splice(0, q.length);
    fetch('/api/client-log', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ lines, page: location.pathname, ua: navigator.userAgent.slice(0, 80) })
    }).catch(() => {});
  }
  setInterval(flush, 2000);
  window.addEventListener('pagehide', flush);

  const vis = id => { const e = document.getElementById(id); return e && !e.classList.contains('hidden') ? 1 : 0; };
  const dd = () => `dd[hang=${vis('pos-search-dropdown')} khach=${vis('pos-customer-dropdown')}]`;
  const who = el => el ? (el.id || el.getAttribute('data-tab') || (el.textContent || '').trim().slice(0, 30) || el.tagName) : '?';

  window.addEventListener('error', e => push('JS_ERROR', `${e.message} @${(e.filename || '').split('/').pop()}:${e.lineno}`));
  window.addEventListener('unhandledrejection', e => push('JS_PROMISE', e.reason && (e.reason.stack || e.reason.message || e.reason)));
  const ce = console.error;
  console.error = function () { push('CONSOLE_ERR', [].map.call(arguments, String).join(' ')); return ce.apply(console, arguments); };

  document.addEventListener('keydown', e => {
    if (/^F\d+$/.test(e.key) || ['Escape', 'Enter'].includes(e.key)) {
      push('KEY', `${e.key} focus=${who(document.activeElement)} ${dd()}`);
      setTimeout(() => push('KEY_AFTER', `${e.key} focus=${who(document.activeElement)} ${dd()}`), 250);
    }
  }, true);
  document.addEventListener('click', e => push('CLICK', `${who(e.target.closest('button,a,[onclick],input,select') || e.target)} ${dd()}`), true);

  const of = window.fetch;
  window.fetch = async function (url, opts) {
    const u = typeof url === 'string' ? url : (url && url.url) || '';
    if (u.includes('/api/client-log')) return of.apply(this, arguments);
    try {
      const r = await of.apply(this, arguments);
      if (r.status >= 400) {
        try {
          const clone = r.clone();
          clone.text().then(body => {
            let detail = '';
            try {
              const j = JSON.parse(body);
              detail = j.detail || j.message || body;
            } catch (_) {
              detail = body;
            }
            const cleanD = String(detail).replace(/\r?\n/g, ' ').slice(0, 150);
            push('HTTP_' + r.status, `${(opts && opts.method) || 'GET'} ${u.split('?')[0]} detail="${cleanD}"`);
          }).catch(() => {
            push('HTTP_' + r.status, `${(opts && opts.method) || 'GET'} ${u.split('?')[0]}`);
          });
        } catch (_) {
          push('HTTP_' + r.status, `${(opts && opts.method) || 'GET'} ${u.split('?')[0]}`);
        }
      }
      return r;
    } catch (err) { push('FETCH_FAIL', `${u.split('?')[0]} ${err.message}`); throw err; }
  };
  push('PAGE_LOAD', location.href.split('?')[0]);
})();
