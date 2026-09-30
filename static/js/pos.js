// pos.js - Logic dành riêng cho màn hình Bán Hàng chuyên dụng (POS)
var posProducts = [];
var posContacts = [];
var posStaff = [];
var posSettings = {};
var posPriceListsCache = {}; // Cache giá riêng theo price_list_id: { [priceListId]: { [productId]: price } }
window.posPriceListsCache = posPriceListsCache;
window.clearPriceListsCache = function() {
    posPriceListsCache = {};
    window.posPriceListsCache = posPriceListsCache;
};

async function getPriceListMap(priceListId, force = false) {
    if (!priceListId) return {};
    if (!force && posPriceListsCache[priceListId]) return posPriceListsCache[priceListId];
    try {
        const res = await fetch(`/api/price-lists/${priceListId}/products?_t=${Date.now()}`);
        if (!res.ok) return {};
        const items = await res.json();
        const map = {};
        for (const it of items) {
            if (it.product_id && it.price !== null && it.price !== undefined) {
                map[it.product_id] = it.price;
            }
        }
        posPriceListsCache[priceListId] = map;
        window.posPriceListsCache = posPriceListsCache;
        return map;
    } catch (e) {
        console.error("Lỗi tải bảng giá POS:", e);
        return {};
    }
}

function getProductPriceForTab(tab, product) {
    const plId = tab?.customer?.price_list_id;
    if (plId && posPriceListsCache[plId] && posPriceListsCache[plId][product.id] !== undefined && posPriceListsCache[plId][product.id] > 0) {
        return posPriceListsCache[plId][product.id];
    }
    return product.sell_price;
}

async function recalculateBestOfferForCart(tab) {
    if (!tab || !tab.cart || tab.cart.length === 0) return;
    try {
        const payload = {
            customer_id: tab.customer ? tab.customer.id : null,
            items: tab.cart.map(item => ({
                product_id: item.product_id,
                quantity: item.quantity
            }))
        };
        const res = await fetch('/api/pricing/calculate', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });
        if (res.ok) {
            const data = await res.json();
            const calcMap = {};
            for (const it of (data.items || [])) {
                calcMap[it.product_id] = it;
            }
            for (const item of tab.cart) {
                const info = calcMap[item.product_id];
                if (info) {
                    item.price = info.final_price;
                    item.applied_rule = info.applied_rule; // 'promo' | 'tier' | 'base'
                    if (info.applied_rule === 'promo') {
                        item.price_list_name = `KM: ${info.promo_name || 'Khuyến mãi'}`;
                    } else if (info.applied_rule === 'tier') {
                        item.price_list_name = tab.customer?.price_list_name || 'Giá hạng KH';
                    } else {
                        item.price_list_name = null;
                    }
                }
            }
            return;
        }
    } catch (e) {
        console.warn("Fallback to local price list logic:", e);
    }
    // Fallback nếu API pricing/calculate bị lỗi
    applyPriceListToCart(tab);
}

function applyPriceListToCart(tab) {
    if (!tab || !tab.cart) return;
    const plId = tab.customer?.price_list_id;
    const plName = tab.customer?.price_list_name || '';
    const priceMap = (plId && posPriceListsCache[plId]) ? posPriceListsCache[plId] : null;

    for (const item of tab.cart) {
        if (priceMap && priceMap[item.product_id] !== undefined && priceMap[item.product_id] > 0) {
            item.price = priceMap[item.product_id];
            item.price_list_name = plName;
        } else {
            item.price = item.original_price;
            item.price_list_name = null;
        }
    }
}

// Quản lý đa tab hóa đơn
var invoiceTabs = [
    {
        id: 1,
        name: "Hóa đơn 1",
        cart: [], // { product_id, code, name, unit, price, original_price, discount_val, discount_type, quantity }
        customer: null, // { id, name, phone, points, spa_wallet_balance } hoặc null (khách lẻ)
        note: "",
        bill_discount: 0,
        bill_discount_type: 'vnd', // 'vnd' | 'pct'
        use_points: false,
        coupon_code: "",
        coupon_discount: 0,
        paid_amount: null, // null nếu chưa gõ tay
        payment_method: 'cash'
    }
];
var activeTabId = 1;
var tabCounter = 1;

// ── Chống mất hóa đơn khi tắt máy / mất điện ──
const DRAFT_LOCAL_KEY = 'pos_draft_v1';
let _draftSaveTimer = null;

function scheduleDraftSave() {
    if (_draftSaveTimer) clearTimeout(_draftSaveTimer);
    _draftSaveTimer = setTimeout(saveDraftNow, 600);
}

function saveDraftNow() {
    reindexInvoiceTabs();
    const payload = JSON.stringify({ invoiceTabs, activeTabId });
    try { localStorage.setItem(DRAFT_LOCAL_KEY, payload); } catch (e) { /* quota/private mode: bỏ qua */ }
    fetch('/api/pos/draft', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ data: payload })
    }).catch(() => { /* offline: localStorage đã đủ để khôi phục tại chỗ */ });
}

function clearDraft() {
    try { localStorage.removeItem(DRAFT_LOCAL_KEY); } catch (e) {}
    fetch('/api/pos/draft', { method: 'DELETE' }).catch(() => {});
}

async function restoreDraftIfAny() {
    let raw = null;
    try {
        const res = await fetch('/api/pos/draft');
        if (res.ok) {
            const body = await res.json();
            if (body && body.data) raw = body.data;
        }
    } catch (e) { /* server không tới được, thử localStorage */ }
    if (!raw) {
        try { raw = localStorage.getItem(DRAFT_LOCAL_KEY); } catch (e) {}
    }
    if (!raw) return false;
    try {
        const parsed = JSON.parse(raw);
        if (parsed.invoiceTabs && parsed.invoiceTabs.length) {
            invoiceTabs = parsed.invoiceTabs;
            activeTabId = parsed.activeTabId || invoiceTabs[0].id;
            reindexInvoiceTabs();
            return true;
        }
    } catch (e) { console.error('restoreDraft parse error', e); }
    return false;
}

// Trạng thái modal chỉnh giá sản phẩm
var editingItemIndex = -1;
var editingItemDiscountType = 'vnd';

// Helper format tiền tệ
function formatMoney(amount) {
    if (amount === undefined || amount === null || isNaN(amount)) return "0 đ";
    return Math.round(amount).toLocaleString('vi-VN') + " đ";
}

function removeVietnameseTones(str) {
    if (!str) return '';
    return str.normalize('NFD')
              .replace(/[\u0300-\u036f]/g, '')
              .replace(/đ/g, 'd').replace(/Đ/g, 'D')
              .toLowerCase()
              .trim();
}

function fuzzyMatch(query, text) {
    if (!query || !query.trim()) return true;
    if (!text) return false;
    const qNorm = removeVietnameseTones(query);
    const tNorm = removeVietnameseTones(text);
    const words = qNorm.split(/\s+/).filter(Boolean);
    return words.every(w => tNorm.includes(w));
}

// ----------------------------------------------------
// KHỞI TẠO DỮ LIỆU
// ----------------------------------------------------
async function initPOS() {
    startClock();
    setupShortcuts();
    setupClickOutside();

    try {
        const [prodRes, custRes, staffRes, setRes] = await Promise.all([
            fetch('/api/products?_t=' + Date.now()),
            fetch('/api/contacts?type=customer&_t=' + Date.now()),
            fetch('/api/staff?_t=' + Date.now()),
            fetch('/api/settings?_t=' + Date.now())
        ]);

        posProducts = await prodRes.json();
        posContacts = await custRes.json();
        posStaff = await staffRes.json();
        posSettings = await setRes.json();

        // Tải danh sách tài khoản thanh toán cho POS
        fetch('/api/payment-accounts?_t=' + Date.now()).then(r => r.json()).then(accs => {
            window.posPaymentAccounts = accs || [];
            updatePosPaymentAccountsUI();
        }).catch(err => console.error(err));

        // Lưu danh sách bảng giá để POS sử dụng khi chọn khách/bảng giá
        fetch('/api/price-lists?_t=' + Date.now()).then(r => r.json()).then(pls => {
            if (Array.isArray(pls)) {
                window.posPriceLists = pls;
            }
        }).catch(err => console.error(err));

        const curTab = getActiveTab();
        if (curTab && curTab.customer && curTab.customer.price_list_id) {
            await getPriceListMap(curTab.customer.price_list_id, true);
            applyPriceListToCart(curTab);
        }

        initPrintTemplatesFromSettings();
        renderStaffOptions();
        await restoreDraftIfAny();
        renderInvoiceTabs();
        renderActiveTabCart();
    } catch (e) {
        console.error("Lỗi khi tải dữ liệu POS:", e);
    }
}

function startClock() {
    const clockEl = document.getElementById('pos-live-clock');
    if (!clockEl) return;
    setInterval(() => {
        const d = new Date();
        const pad = (n) => String(n).padStart(2, '0');
        clockEl.innerText = `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())} ${pad(d.getDate())}/${pad(d.getMonth()+1)}/${d.getFullYear()}`;
    }, 1000);
}

function renderStaffOptions() {
    const select = document.getElementById('pos-staff-select');
    if (!select) return;
    select.innerHTML = posStaff.map(s => `<option value="${s.id}">${s.name}</option>`).join('');
}

async function reloadPOSData() {
    const btn = event?.currentTarget;
    if (btn) btn.classList.add('animate-spin');
    try {
        const [p, ct] = await Promise.all([
            fetch('/api/products').then(r => r.json()),
            fetch('/api/contacts?type=customer').then(r => r.json())
        ]);
        posProducts = p;
        posContacts = ct;
        alert("Đã cập nhật danh sách hàng hóa!");
    } catch (e) {
        alert("Lỗi khi tải lại dữ liệu");
    } finally {
        if (btn) btn.classList.remove('animate-spin');
    }
}

// ----------------------------------------------------
// PHÍM TẮT TIỆN ÍCH (F3, F4, F9, F1)
// ----------------------------------------------------
function setupShortcuts() {
    document.addEventListener('keydown', (e) => {
        const tabPos = document.getElementById('tab-pos');
        if (!tabPos || tabPos.classList.contains('hidden')) return; // Khóa phím tắt khi không ở tab POS
        if (e.key === 'F3') {
            e.preventDefault();
            document.getElementById('pos-search-input')?.focus();
            document.getElementById('pos-search-input')?.select();
        } else if (e.key === 'F4') {
            e.preventDefault();
            document.getElementById('pos-customer-search')?.focus();
            document.getElementById('pos-customer-search')?.select();
        } else if (e.key === 'F9') {
            e.preventDefault();
            submitPOSOrder();
        } else if (e.key === 'F1') {
            e.preventDefault();
            addNewInvoiceTab();
        }
    });

    // Xử lý quét barcode khi nhấn Enter ở ô tìm kiếm
    const searchInput = document.getElementById('pos-search-input');
    if (searchInput) {
        searchInput.addEventListener('input', (e) => filterProductSearch(e.target.value));
        searchInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                handleBarcodeOrSelectFirst(e.target.value);
            }
        });
    }

    const custSearch = document.getElementById('pos-customer-search');
    if (custSearch) {
        custSearch.addEventListener('input', (e) => filterCustomerSearch(e.target.value));
    }

    const orderNoteInput = document.getElementById('pos-order-note');
    if (orderNoteInput) {
        orderNoteInput.addEventListener('input', (e) => {
            const tab = getActiveTab();
            if (tab) tab.note = e.target.value;
        });
    }
}

function setupClickOutside() {
    document.addEventListener('pointerdown', (e) => {
        if (!e.target.closest('#pos-search-input') && !e.target.closest('#pos-search-dropdown')) {
            document.getElementById('pos-search-dropdown')?.classList.add('hidden');
        }
        if (!e.target.closest('#pos-customer-search') && !e.target.closest('#pos-customer-dropdown')) {
            document.getElementById('pos-customer-dropdown')?.classList.add('hidden');
        }
    });
}

// ----------------------------------------------------
// QUẢN LÝ TABS HÓA ĐƠN
// ----------------------------------------------------
function getActiveTab() {
    return invoiceTabs.find(t => t.id === activeTabId) || invoiceTabs[0];
}

function reindexInvoiceTabs() {
    invoiceTabs.forEach((tab, idx) => {
        tab.name = `Hóa đơn ${idx + 1}`;
    });
}

function renderInvoiceTabs() {
    const container = document.getElementById('invoice-tabs-bar');
    if (!container) return;

    reindexInvoiceTabs();

    let html = invoiceTabs.map(tab => {
        const isActive = tab.id === activeTabId;
        const count = tab.cart.reduce((s, i) => s + i.quantity, 0);
        return `
            <div onclick="switchInvoiceTab(${tab.id})" class="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold cursor-pointer transition border ${isActive ? 'bg-sky-600 text-white border-sky-600 shadow-sm' : 'bg-slate-100 text-slate-600 border-slate-200 hover:bg-slate-200'}">
                <span>${tab.name}</span>
                ${count > 0 ? `<span class="px-1.5 py-0.2 rounded-full text-[10px] ${isActive ? 'bg-sky-700 text-white' : 'bg-sky-100 text-sky-700'}">${count}</span>` : ''}
                ${invoiceTabs.length > 1 ? `
                    <button onclick="closeInvoiceTab(event, ${tab.id})" class="ml-1 hover:text-red-300 text-xs font-bold p-0.5" title="Đóng đơn">&times;</button>
                ` : ''}
            </div>
        `;
    }).join('');

    html += `
        <button onclick="addNewInvoiceTab()" class="px-2 py-1 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg text-xs font-bold border border-slate-200 transition" title="Thêm đơn hàng mới (F1)">
            +
        </button>
    `;

    container.innerHTML = html;
}

function switchInvoiceTab(tabId) {
    activeTabId = tabId;
    renderInvoiceTabs();
    renderActiveTabCart();
}

function addNewInvoiceTab() {
    if (invoiceTabs.length >= 8) {
        alert("Đang có quá nhiều hóa đơn mở đồng thời!");
        return;
    }
    const newId = (invoiceTabs.reduce((max, t) => Math.max(max, t.id || 0), 0)) + 1;
    const newTab = {
        id: newId,
        name: `Hóa đơn ${invoiceTabs.length + 1}`,
        cart: [],
        customer: null,
        note: "",
        bill_discount: 0,
        bill_discount_type: 'vnd',
        use_points: false,
        coupon_code: "",
        coupon_discount: 0,
        paid_amount: null,
        payment_method: 'cash'
    };
    invoiceTabs.push(newTab);
    reindexInvoiceTabs();
    activeTabId = newTab.id;
    scheduleDraftSave();
    renderInvoiceTabs();
    renderActiveTabCart();
}

function closeInvoiceTab(e, tabId) {
    e.stopPropagation();
    const tab = invoiceTabs.find(t => t.id === tabId);
    if (tab && tab.cart.length > 0) {
        if (!confirm(`Hóa đơn "${tab.name}" đang có sản phẩm. Bạn có chắc muốn đóng?`)) return;
    }
    invoiceTabs = invoiceTabs.filter(t => t.id !== tabId);
    if (invoiceTabs.length === 0) {
        invoiceTabs = [{
            id: 1,
            name: "Hóa đơn 1",
            cart: [],
            customer: null,
            note: "",
            bill_discount: 0,
            bill_discount_type: 'vnd',
            use_points: false,
            coupon_code: "",
            coupon_discount: 0,
            paid_amount: null,
            payment_method: 'cash'
        }];
        activeTabId = 1;
    } else if (activeTabId === tabId) {
        activeTabId = invoiceTabs[0]?.id || 1;
    }
    reindexInvoiceTabs();
    scheduleDraftSave();
    renderInvoiceTabs();
    renderActiveTabCart();
}

// ----------------------------------------------------
// TÌM KIẾM HÀNG HÓA & THÊM VÀO ĐƠN
// ----------------------------------------------------
function filterProductSearch(val) {
    const dropdown = document.getElementById('pos-search-dropdown');
    if (!dropdown) return;
    const q = (val || '').trim();
    if (!q) {
        dropdown.classList.add('hidden');
        return;
    }

    const matches = posProducts.filter(p => {
        if (p.type === 'material') return false;
        const text = `${p.name} ${p.code || ''}`;
        return fuzzyMatch(q, text);
    }).slice(0, 10);

    const total = matches.length;
    if (total === 0) {
        dropdown.innerHTML = '<div class="p-3 text-center text-xs text-slate-400 italic">Không tìm thấy hàng hóa phù hợp</div>';
        dropdown.classList.remove('hidden');
        return;
    }

    dropdown.innerHTML = matches.map(p => {
        const clickHandler = `addProductToActiveCart(${p.id})`;
        const typeLabel = p.type === 'combo' ? '<span class="text-[10px] font-bold text-amber-600 mr-1">COMBO</span>' : '';
        return `
        <div onclick="${clickHandler}" class="p-2.5 hover:bg-sky-50 cursor-pointer border-b last:border-0 flex justify-between items-center transition text-xs">
            <div>
                <span class="font-mono text-[11px] text-slate-400 font-bold mr-1.5">[${p.code || '-'}]</span>
                ${typeLabel}
                <span class="font-bold text-slate-800">${p.name}</span>
                <span class="text-slate-400 text-[11px] ml-1">(${p.unit || 'cái'})</span>
            </div>
            <div class="text-right shrink-0 ml-2">
                <div class="font-bold text-sky-600">${formatMoney(p.sell_price)}</div>
                <div class="text-[10px] text-slate-400">Tồn: ${p.type === 'service' ? '∞' : (p.stock || 0)}</div>
            </div>
        </div>
        `;
    }).join('');

    dropdown.classList.remove('hidden');
}

function handleBarcodeOrSelectFirst(val) {
    const q = (val || '').trim();
    if (!q) return;

    // Tìm chính xác mã barcode trước (sản phẩm, bao gồm cả combo type='combo')
    let found = posProducts.find(p => p.code && p.code.toLowerCase() === q.toLowerCase());
    if (!found) {
        // Nếu không trùng tuyệt đối, lấy kết quả tìm kiếm đầu tiên (sản phẩm + combo products)
        const matches = posProducts.filter(p => p.type !== 'material' && fuzzyMatch(q, `${p.name} ${p.code}`));
        if (matches.length > 0) {
            addProductToActiveCart(matches[0].id);
            return;
        }
        // Không tìm thấy gì → clear search input
        const searchInput = document.getElementById('pos-search-input');
        if (searchInput) searchInput.value = '';
        document.getElementById('pos-search-dropdown')?.classList.add('hidden');
        return;
    }

    addProductToActiveCart(found.id);
}

async function addProductToActiveCart(productId) {
    const p = posProducts.find(x => x.id === productId);
    if (!p) return;

    const tab = getActiveTab();
    const exist = tab.cart.find(item => item.product_id === productId);

    if (exist) {
        exist.quantity += 1;
    } else {
        const itemPrice = getProductPriceForTab(tab, p);
        const hasCustomPrice = itemPrice !== p.sell_price;
        tab.cart.push({
            product_id: p.id,
            code: p.code,
            name: p.name,
            type: p.type || 'product',
            unit: p.unit || 'cái',
            original_price: p.sell_price,
            price: itemPrice,
            price_list_name: hasCustomPrice ? (tab.customer?.price_list_name || null) : null,
            discount_val: 0,
            discount_type: 'vnd',
            quantity: 1
        });
    }

    // Đóng dropdown & clear search input
    const searchInput = document.getElementById('pos-search-input');
    if (searchInput) searchInput.value = '';
    document.getElementById('pos-search-dropdown')?.classList.add('hidden');

    await recalculateBestOfferForCart(tab);

    renderInvoiceTabs();
    renderActiveTabCart();
}

// ----------------------------------------------------
// HIỂN THỊ DANH SÁCH SẢN PHẨM TRONG GIỎ (MỖI MÓN 1 DÒNG)
// ----------------------------------------------------
function renderActiveTabCart() {
    const tab = getActiveTab();
    const container = document.getElementById('cart-items-container');
    if (!container) return;
    scheduleDraftSave();

    // Cập nhật ô ghi chú
    const noteInput = document.getElementById('pos-order-note');
    if (noteInput) noteInput.value = tab.note || '';

    // Cập nhật thông tin khách hàng
    updateCustomerUI(tab.customer);

    if (!tab.cart || tab.cart.length === 0) {
        container.innerHTML = `
            <div class="h-full flex flex-col items-center justify-center p-8 text-slate-300">
                <div class="w-16 h-16 mb-3 rounded-2xl bg-slate-100 flex items-center justify-center text-slate-400">
                    <svg class="w-8 h-8" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><circle cx="8" cy="21" r="1"/><circle cx="19" cy="21" r="1"/><path d="M2.05 2.05h2l2.66 12.42a2 2 0 0 0 2 1.58h9.78a2 2 0 0 0 1.95-1.57l1.65-7.43H5.12"/></svg>
                </div>
                <div class="font-bold text-sm text-slate-600">Đơn hàng chưa có sản phẩm nào</div>
                <div class="text-xs text-slate-400 mt-1">Gõ tìm kiếm (F3) hoặc quét mã vạch để thêm sản phẩm vào đơn</div>
            </div>
        `;
        updateFinancialSummary();
        return;
    }

    container.innerHTML = tab.cart.map((item, idx) => {
        const itemSubtotal = item.quantity * item.price;
        const hasDiscount = item.discount_val > 0;
        const discountText = item.discount_type === 'pct' 
            ? `-${item.discount_val}%` 
            : `-${formatMoney(item.discount_val)}`;

        const comboBadge = item.is_combo ? '<span class="text-[10px] font-bold text-amber-600 bg-amber-50 px-1 rounded mr-1">COMBO</span>' : '';
        return `
            <div class="px-4 py-2.5 grid gap-2 items-center text-xs bg-white rounded-xl border border-slate-200/80 shadow-xs hover:border-slate-300 transition group card-row-anim select-none" style="grid-template-columns: 36px 36px 80px 1fr 48px 96px 230px 110px; --row-idx: ${idx};">
                <!-- Nút xóa -->
                <div class="text-center">
                    <button onclick="removeCartItem(${idx})" class="text-slate-400 hover:text-rose-600 p-1.5 rounded-lg hover:bg-rose-50 transition inline-flex items-center justify-center cursor-pointer" title="Xóa khỏi đơn">
                        <svg class="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18"/><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/><line x1="10" x2="10" y1="11" y2="17"/><line x1="14" x2="14" y1="11" y2="17"/></svg>
                    </button>
                </div>

                <!-- STT -->
                <div class="text-center font-bold text-slate-400">${idx + 1}</div>

                <!-- Mã hàng -->
                <div class="font-mono font-bold text-slate-600 text-[11px] truncate" title="${item.code || '-'}">
                    ${item.code || '-'}
                </div>

                <!-- Tên hàng hóa -->
                <div class="font-semibold text-slate-800 line-clamp-1" title="${item.name}">
                    ${comboBadge}${item.name}
                </div>

                <!-- ĐVT -->
                <div class="text-center text-slate-500 text-[11px]">
                    ${item.unit || 'cái'}
                </div>

                <!-- Số lượng (Bộ nút + -) -->
                <div class="flex items-center justify-center gap-1">
                    <button onclick="changeItemQty(${idx}, -1)" class="w-5 h-5 flex items-center justify-center rounded bg-slate-100 hover:bg-slate-200 text-slate-600 font-bold text-xs">-</button>
                    <input type="number" min="1" value="${item.quantity}" 
                           onchange="updateItemQtyDirect(${idx}, this.value)"
                           class="w-10 text-center font-bold text-slate-800 border border-slate-200 rounded py-0.5 text-xs focus:outline-none focus:ring-1 focus:ring-sky-500">
                    <button onclick="changeItemQty(${idx}, 1)" class="w-5 h-5 flex items-center justify-center rounded bg-slate-100 hover:bg-slate-200 text-slate-600 font-bold text-xs">+</button>
                </div>

                <!-- Đơn giá & Giảm giá (Click vào để mở popup sửa) -->
                <div class="text-right cursor-pointer" onclick="openItemPriceModal(${idx})" title="Bấm để sửa đơn giá & chiết khấu">
                    <div class="font-bold text-slate-700 hover:text-sky-600 flex items-center justify-end gap-1.5 flex-nowrap whitespace-nowrap">
                        ${(item.price !== item.original_price) ? `<span class="text-slate-400 line-through font-normal text-[11px]">${formatMoney(item.original_price)}</span>` : ''}
                        <span class="font-bold text-slate-800">${formatMoney(item.price)}</span>
                        ${item.price !== item.original_price ? `<span class="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-bold bg-amber-50 text-amber-700 border border-amber-200 shrink-0">🏷️ ${item.price_list_name || 'Giá riêng'}</span>` : ''}
                        <span class="opacity-0 group-hover:opacity-100 text-sky-500 text-[10px]">✏️</span>
                    </div>
                    ${hasDiscount ? `<div class="text-[10px] text-rose-500 font-bold">${discountText}</div>` : ''}
                </div>

                <!-- Thành tiền -->
                <div class="text-right font-black text-sky-700 text-sm whitespace-nowrap">
                    ${formatMoney(itemSubtotal)}
                </div>
            </div>
        `;
    }).join('');

    updateFinancialSummary();
}

function changeItemQty(idx, delta) {
    const tab = getActiveTab();
    if (!tab.cart[idx]) return;
    const newQty = tab.cart[idx].quantity + delta;
    if (newQty <= 0) {
        removeCartItem(idx);
    } else {
        tab.cart[idx].quantity = newQty;
        renderInvoiceTabs();
        renderActiveTabCart();
    }
}

function updateItemQtyDirect(idx, val) {
    const tab = getActiveTab();
    if (!tab.cart[idx]) return;
    const qty = parseFloat(val) || 1;
    if (qty <= 0) {
        removeCartItem(idx);
    } else {
        tab.cart[idx].quantity = qty;
        renderInvoiceTabs();
        renderActiveTabCart();
    }
}

function removeCartItem(idx) {
    const tab = getActiveTab();
    tab.cart.splice(idx, 1);
    renderInvoiceTabs();
    renderActiveTabCart();
}

// ----------------------------------------------------
// POPUP CHỈNH ĐƠN GIÁ & CHIẾT KHẤU TỪNG MẶT HÀNG
// ----------------------------------------------------
function openItemPriceModal(idx) {
    const tab = getActiveTab();
    const item = tab.cart[idx];
    if (!item) return;

    editingItemIndex = idx;
    editingItemDiscountType = item.discount_type || 'vnd';

    document.getElementById('modal-item-name').innerText = `Chỉnh Sửa Giá: ${item.name}`;
    document.getElementById('modal-item-original-price').value = formatMoney(item.original_price);
    document.getElementById('modal-item-discount-val').value = item.discount_val || 0;

    updateItemDiscountTypeButtons();
    calculateItemModalPreview();

    document.getElementById('modal-item-price').classList.remove('hidden');
    document.getElementById('modal-item-discount-val').focus();
    document.getElementById('modal-item-discount-val').select();
}

function closeItemPriceModal() {
    document.getElementById('modal-item-price').classList.add('hidden');
    editingItemIndex = -1;
}

function setItemDiscountType(type) {
    editingItemDiscountType = type;
    updateItemDiscountTypeButtons();
    calculateItemModalPreview();
}

function updateItemDiscountTypeButtons() {
    const btnVnd = document.getElementById('btn-item-disc-vnd');
    const btnPct = document.getElementById('btn-item-disc-pct');
    if (editingItemDiscountType === 'vnd') {
        btnVnd.className = "px-2.5 py-1 font-bold text-xs bg-sky-600 text-white";
        btnPct.className = "px-2.5 py-1 font-bold text-xs bg-slate-100 text-slate-700";
    } else {
        btnVnd.className = "px-2.5 py-1 font-bold text-xs bg-slate-100 text-slate-700";
        btnPct.className = "px-2.5 py-1 font-bold text-xs bg-sky-600 text-white";
    }
}

function calculateItemModalPreview() {
    const tab = getActiveTab();
    const item = tab.cart[editingItemIndex];
    if (!item) return;

    const discVal = parseFloat(document.getElementById('modal-item-discount-val').value) || 0;
    let finalPrice = item.original_price;

    if (editingItemDiscountType === 'pct') {
        finalPrice = item.original_price * (1 - (discVal / 100));
    } else {
        finalPrice = item.original_price - discVal;
    }
    finalPrice = Math.max(0, Math.round(finalPrice));

    document.getElementById('modal-item-final-preview').innerText = formatMoney(finalPrice);
}

function saveItemPriceModal() {
    const tab = getActiveTab();
    const item = tab.cart[editingItemIndex];
    if (!item) return;

    const discVal = parseFloat(document.getElementById('modal-item-discount-val').value) || 0;
    item.discount_val = discVal;
    item.discount_type = editingItemDiscountType;

    if (editingItemDiscountType === 'pct') {
        item.price = Math.max(0, Math.round(item.original_price * (1 - (discVal / 100))));
    } else {
        item.price = Math.max(0, Math.round(item.original_price - discVal));
    }

    closeItemPriceModal();
    renderActiveTabCart();
}

// ----------------------------------------------------
// TÌM KIẾM & CHỌN KHÁCH HÀNG (MẶC ĐỊNH LÀ KHÁCH LẺ)
// ----------------------------------------------------
function filterCustomerSearch(val) {
    const dropdown = document.getElementById('pos-customer-dropdown');
    if (!dropdown) return;
    const q = (val || '').trim();
    if (!q) {
        dropdown.classList.add('hidden');
        return;
    }

    const matches = posContacts.filter(c => {
        const text = `${c.name} ${c.phone || ''}`;
        return fuzzyMatch(q, text);
    }).slice(0, 10);

    if (matches.length === 0) {
        dropdown.innerHTML = '<div class="p-3 text-center text-xs text-slate-400 italic">Không tìm thấy khách hàng nào</div>';
        dropdown.classList.remove('hidden');
        return;
    }

    dropdown.innerHTML = matches.map(c => `
        <div onclick="selectCustomerForActiveTab(${c.id})" class="p-2.5 hover:bg-sky-50 cursor-pointer border-b last:border-0 flex justify-between items-center transition text-xs">
            <div>
                <div class="flex items-center gap-1.5">
                    <span class="font-bold text-slate-800">${c.name}</span>
                    ${c.segment_name ? `<span class="bg-indigo-50 text-indigo-700 font-bold px-1.5 py-0.5 rounded text-[10px]">🏷️ ${c.segment_name}</span>` : ''}
                </div>
                <div class="text-[11px] text-slate-400">📞 ${c.phone || 'Không SĐT'}</div>
            </div>
            <div class="text-right space-y-0.5">
                <span class="px-2 py-0.5 rounded-full text-[10px] font-bold bg-sky-100 text-sky-700 block">🏆 ${c.points || c.reward_points || 0} pts</span>
                ${(c.spa_wallet_balance && c.spa_wallet_balance > 0) ? `<span class="px-1.5 py-0.2 rounded text-[9px] font-bold bg-emerald-100 text-emerald-800 block">💆 ${Number(c.spa_wallet_balance).toLocaleString('vi-VN')} đ</span>` : ''}
            </div>
        </div>
    `).join('');
    dropdown.classList.remove('hidden');
}

async function selectCustomerForActiveTab(customerId) {
    const cust = posContacts.find(c => c.id === customerId);
    if (!cust) return;

    const tab = getActiveTab();
    tab.customer = {
        id: cust.id,
        name: cust.name,
        phone: cust.phone || '',
        points: cust.points !== undefined ? cust.points : (cust.reward_points || 0),
        spa_wallet_balance: cust.spa_wallet_balance || 0,
        segment_id: cust.segment_id || null,
        segment_name: cust.segment_name || null,
        price_list_id: cust.price_list_id || null,
        price_list_name: cust.price_list_name || null
    };

    const searchInput = document.getElementById('pos-customer-search');
    if (searchInput) searchInput.value = '';
    document.getElementById('pos-customer-dropdown')?.classList.add('hidden');

    if (tab.customer.price_list_id) {
        await getPriceListMap(tab.customer.price_list_id, true);
    }
    await recalculateBestOfferForCart(tab);

    updateCustomerUI(tab.customer);
    renderInvoiceTabs();
    renderActiveTabCart();
    updateFinancialSummary();
}

async function clearSelectedCustomer() {
    const tab = getActiveTab();
    tab.customer = null;
    tab.use_points = false;
    await recalculateBestOfferForCart(tab);
    updateCustomerUI(null);
    renderInvoiceTabs();
    renderActiveTabCart();
    updateFinancialSummary();
}

function updateCustomerUI(cust) {
    const nameEl = document.getElementById('cust-name-display');
    const phoneEl = document.getElementById('cust-phone-display');
    const pointsEl = document.getElementById('cust-points-badge');
    const segBadge = document.getElementById('cust-segment-badge');
    const btnClear = document.getElementById('btn-clear-customer');
    const btnHistory = document.getElementById('btn-purchase-history');
    const walletBar = document.getElementById('cust-spa-wallet-bar');
    const walletBadge = document.getElementById('cust-wallet-badge');

    if (!cust) {
        // Mặc định Khách lẻ
        if (nameEl) nameEl.innerText = "Khách lẻ";
        if (phoneEl) phoneEl.innerText = "Không SĐT";
        if (pointsEl) pointsEl.innerText = "🏆 Điểm: 0";
        if (segBadge) {
            segBadge.innerText = '';
            segBadge.classList.add('hidden');
        }
        if (btnClear) btnClear.classList.add('hidden');
        if (btnHistory) btnHistory.classList.add('hidden');
        if (walletBar) walletBar.classList.add('hidden');
    } else {
        if (nameEl) nameEl.innerText = cust.name;
        if (phoneEl) phoneEl.innerText = cust.phone ? `📞 ${cust.phone}` : "Không SĐT";
        if (pointsEl) pointsEl.innerText = `🏆 Điểm: ${cust.points || 0}`;
        if (segBadge) {
            if (cust.segment_name) {
                segBadge.innerText = `🏷️ ${cust.segment_name}`;
                segBadge.classList.remove('hidden');
            } else {
                segBadge.innerText = '';
                segBadge.classList.add('hidden');
            }
        }
        if (btnClear) btnClear.classList.remove('hidden');
        if (btnHistory) btnHistory.classList.toggle('hidden', !cust.id);
        if (walletBar) {
            walletBar.classList.add('hidden');
            if (walletBadge) {
                const bal = cust.spa_wallet_balance || 0;
                walletBadge.innerText = `💆 Ví Spa: ${Number(bal).toLocaleString('vi-VN')} đ`;
            }
        }
    }
}

var currentPurchaseHistoryCustId = null;

function openSelectedCustomerEdit() {
    const tab = getActiveTab();
    if (tab && tab.customer && tab.customer.id) {
        if (typeof editContact === 'function') editContact(tab.customer.id);
    } else if (typeof openContactModal === 'function') {
        openContactModal('customer');
    }
}

function openPurchaseHistoryModal() {
    const tab = getActiveTab();
    const custId = tab && tab.customer ? tab.customer.id : null;
    if (!custId) return;
    currentPurchaseHistoryCustId = custId;
    document.getElementById('modal-purchase-history').classList.remove('hidden');
    loadPurchaseHistory(custId);
}

async function loadPurchaseHistory(custId) {
    if (!custId) return;
    const list = document.getElementById('purchase-history-list');
    const from = document.getElementById('ph-date-from')?.value || '';
    const to = document.getElementById('ph-date-to')?.value || '';
    const wantOrders = document.getElementById('ph-type-orders')?.checked;
    const wantServices = document.getElementById('ph-type-services')?.checked;
    const type = (wantOrders && wantServices) ? 'all' : (wantOrders ? 'orders' : (wantServices ? 'services' : 'all'));
    list.innerHTML = '<div class="text-slate-400 p-2">Đang tải...</div>';
    try {
        const params = new URLSearchParams({ type });
        if (from) params.set('date_from', from);
        if (to) params.set('date_to', to);
        const res = await fetch(`/api/contacts/${custId}/purchase-history?${params}`);
        const rows = await res.json();
        if (!Array.isArray(rows) || rows.length === 0) {
            list.innerHTML = '<div class="text-slate-400 p-2">Chưa có lịch sử mua hàng</div>';
            return;
        }
        list.innerHTML = rows.map(r => `
            <div class="border-b p-2 text-xs cursor-pointer hover:bg-purple-50" onclick="viewPurchaseHistoryDetail('${r.type}', '${r.code}', ${r.id})">
                <div class="flex justify-between">
                    <span class="font-semibold">${r.code || '-'}</span>
                    <span>${(r.total||0).toLocaleString('vi-VN')}đ</span>
                </div>
                <div class="text-slate-400">${r.date} · ${r.type === 'order' ? '🛒 Hàng hóa' : '🐾 Dịch vụ'} · ${r.status}</div>
            </div>
        `).join('');
    } catch (e) {
        list.innerHTML = '<div class="text-rose-500 p-2">Lỗi tải lịch sử</div>';
    }
}

function viewPurchaseHistoryDetail(type, code, id) {
    document.getElementById('modal-purchase-history')?.classList.add('hidden');
    if (type === 'service') { 
        if (typeof window.viewPetServiceDetailModal === 'function') {
            window.viewPetServiceDetailModal(id);
        } else if (typeof openServiceProgressModal === 'function') {
            openServiceProgressModal(id);
        }
        return; 
    }
    viewOrderDetailModal(code, true);
    window.orderViewOpenedFromHistory = true;
    document.getElementById('btn-edit-order-from-view')?.classList.add('hidden');
    document.getElementById('btn-delete-order-from-view')?.classList.add('hidden');
}

// ----------------------------------------------------
// TÍNH TOÁN BẢNG TÀI CHÍNH & QUICK CASH
// ----------------------------------------------------
function updateFinancialSummary() {
    const tab = getActiveTab();

    const totalQty = tab.cart.reduce((s, i) => s + i.quantity, 0);
    const itemTypes = tab.cart.length;
    const subtotal = tab.cart.reduce((s, i) => s + (i.price * i.quantity), 0);

    // Cập nhật số lượng hiển thị footer
    document.getElementById('lbl-item-types').innerText = itemTypes;
    document.getElementById('lbl-total-quantity').innerText = totalQty;
    document.getElementById('pos-subtotal-display').innerText = formatMoney(subtotal);

    // Tính giảm giá hóa đơn
    let billDiscAmount = 0;
    if (tab.bill_discount_type === 'pct') {
        billDiscAmount = Math.round(subtotal * (tab.bill_discount / 100));
    } else {
        billDiscAmount = tab.bill_discount;
    }
    billDiscAmount = Math.min(subtotal, billDiscAmount);
    document.getElementById('pos-bill-discount-display').innerText = formatMoney(billDiscAmount);

    // Tính giảm giá coupon
    let couponAmount = tab.coupon_discount || 0;

    // Tính điểm tích lũy (nếu bật toggle dùng điểm)
    let pointsAmount = 0;
    const chkPoints = document.getElementById('chk-use-points');
    if (tab.use_points && tab.customer && tab.customer.points > 0) {
        // Giả sử 1 điểm = 1.000 đ
        const pointVal = (tab.customer.points || 0) * 1000;
        pointsAmount = Math.min(pointVal, Math.max(0, subtotal - billDiscAmount - couponAmount));
        if (chkPoints) chkPoints.checked = true;
    } else {
        if (chkPoints) chkPoints.checked = false;
    }
    document.getElementById('pos-points-discount-display').innerText = formatMoney(pointsAmount);

    // Tính khấu trừ Ví Spa (cho các dịch vụ type === 'service')
    let spaWalletDeduct = 0;
    const spaWalletRow = document.getElementById('pos-spa-wallet-row');
    const chkSpaWallet = document.getElementById('pos-use-spa-wallet');
    const spaWalletHint = document.getElementById('pos-spa-wallet-hint');
    const spaWalletDisplay = document.getElementById('pos-spa-wallet-deduct-display');

    // Khách cần trả
    const finalAmount = Math.max(0, subtotal - billDiscAmount - couponAmount - pointsAmount);
    document.getElementById('pos-final-amount-display').innerText = formatMoney(finalAmount);

    // Khách thanh toán (auto-fill nếu chưa gõ tay)
    const paidInput = document.getElementById('pos-paid-input');
    if (tab.paid_amount === null || tab.paid_amount === undefined) {
        paidInput.value = Math.round(finalAmount).toLocaleString('vi-VN');
    }

    calculateChangeOrDebt(finalAmount);
    renderQuickCashButtons(finalAmount);
}

function handlePaidInput(rawVal) {
    const tab = getActiveTab();
    const clean = rawVal.replace(/\D/g, '');
    const num = parseFloat(clean) || 0;
    tab.paid_amount = num;
    const finalAmount = getPosFinalAmount(tab);
    calculateChangeOrDebt(finalAmount);
}

function calculateChangeOrDebt(finalAmount) {
    const tab = getActiveTab();
    const paidInput = document.getElementById('pos-paid-input');
    const clean = (paidInput?.value || '0').replace(/\D/g, '');
    const paid = parseFloat(clean) || 0;

    const lblChangeDebt = document.getElementById('lbl-change-debt');
    const valChangeDebt = document.getElementById('val-change-debt');

    if (paid >= finalAmount) {
        const change = paid - finalAmount;
        lblChangeDebt.innerText = "Tiền thừa trả khách:";
        lblChangeDebt.className = "text-slate-600";
        valChangeDebt.innerText = formatMoney(change);
        valChangeDebt.className = "text-emerald-600 text-sm";
    } else {
        const debt = finalAmount - paid;
        lblChangeDebt.innerText = "Tính vào công nợ:";
        lblChangeDebt.className = "text-rose-600";
        valChangeDebt.innerText = formatMoney(debt);
        valChangeDebt.className = "text-rose-600 text-sm";
    }
}

function renderQuickCashButtons(finalAmount) {
    const container = document.getElementById('quick-cash-container');
    if (!container) return;

    if (finalAmount <= 0) {
        container.innerHTML = '<div class="col-span-3 text-center text-slate-400 text-[11px]">Đơn hàng 0 đ</div>';
        return;
    }

    const presets = new Set();
    presets.add(finalAmount); // Đúng số tiền cần trả

    // Làm tròn lên các mức tiền chẵn
    if (finalAmount < 100000) presets.add(100000);
    if (finalAmount < 200000) presets.add(200000);
    if (finalAmount < 500000) presets.add(500000);
    if (finalAmount < 1000000) presets.add(1000000);
    if (finalAmount < 2000000) presets.add(2000000);

    const sorted = Array.from(presets).slice(0, 6);

    container.innerHTML = sorted.map(val => `
        <button type="button" onclick="setQuickCash(${val})" class="py-1 px-1 bg-white hover:bg-sky-50 hover:border-sky-300 border border-slate-200 rounded-lg text-[11px] font-bold text-slate-700 transition">
            ${formatMoney(val)}
        </button>
    `).join('');
}

function setQuickCash(amount) {
    const tab = getActiveTab();
    tab.paid_amount = amount;
    const paidInput = document.getElementById('pos-paid-input');
    if (paidInput) {
        paidInput.value = Math.round(amount).toLocaleString('vi-VN');
    }
    const finalAmount = getPosFinalAmount(tab);
    calculateChangeOrDebt(finalAmount);
}

function setPaymentMethod(method) {
    const tab = getActiveTab();

    const paidInput = document.getElementById('pos-paid-input');
    const entered = parseFloat((paidInput?.value || '0').replace(/\D/g, '')) || 0;
    const finalAmount = getPosFinalAmount(tab);
    const hasSplit = (tab.splitLines || []).length > 0;
    const alreadyPaid = (tab.splitLines || []).reduce((s, l) => s + l.amount, 0);
    const stillNeeded = finalAmount - alreadyPaid;

    // Tự động hiểu thanh toán nhiều hình thức: số tiền nhập nhỏ hơn số còn
    // cần thu -> thêm 1 dòng cho hình thức này, ô nhập tự set phần còn lại.
    // Nếu ĐÃ có dòng tách từ trước, mọi lần bấm tiếp theo luôn CỘNG THÊM dòng
    // mới (kể cả khi số nhập vừa khớp phần còn thiếu) thay vì hiểu là chọn lại.
    if (hasSplit || (entered > 0 && entered < stillNeeded)) {
        if (!tab.splitLines) tab.splitLines = [];
        const amt = entered > 0 ? Math.min(entered, stillNeeded) : stillNeeded;
        if (amt > 0) {
            const existing = tab.splitLines.find(l => l.method === method);
            if (existing) existing.amount += amt; else tab.splitLines.push({ method, amount: amt, account_id: null });
        }
        tab.payment_method = method;
        renderSplitPaymentLines();
        return;
    }

    // Thanh toán đủ bằng 1 hình thức duy nhất (mặc định, không đổi hành vi cũ)
    tab.payment_method = method;
    tab.splitLines = [];
    const splitAutoBox = document.getElementById('pos-split-auto-box');
    if (splitAutoBox) splitAutoBox.classList.add('hidden');

    const methods = ['cash', 'transfer', 'card', 'wallet'];
    methods.forEach(m => {
        const btn = document.getElementById(`pay-method-${m}`);
        if (btn) {
            if (m === method) {
                btn.className = "pay-method-btn py-1.5 text-center text-xs font-bold rounded-lg border border-sky-600 bg-sky-50 text-sky-700 shadow-sm transition";
            } else {
                btn.className = "pay-method-btn py-1.5 text-center text-xs font-bold rounded-lg border border-slate-200 bg-white text-slate-600 hover:bg-slate-50 transition";
            }
        }
    });

    const bankBox = document.getElementById('pos-bank-account-box');
    if (method === 'transfer' || method === 'card' || method === 'wallet') {
        if (bankBox) bankBox.classList.remove('hidden');
        updatePosPaymentAccountsUI();
    } else {
        if (bankBox) bankBox.classList.add('hidden');
        // Gán tài khoản tiền mặt mặc định
        const cashAcc = (window.posPaymentAccounts || []).find(a => a.account_type === 'cash' || a.is_default);
        if (cashAcc) tab.account_id = cashAcc.id;
    }
}

function getPosFinalAmount(tab) {
    const subtotal = tab.cart.reduce((s, i) => s + (i.price * i.quantity), 0);
    const billDisc = tab.bill_discount_type === 'pct' ? Math.round(subtotal * (tab.bill_discount / 100)) : tab.bill_discount;
    const pointsAmount = (tab.use_points && tab.customer) ? Math.min((tab.customer.points || 0) * 1000, subtotal) : 0;
    return Math.max(0, subtotal - billDisc - (tab.coupon_discount || 0) - pointsAmount);
}

function removeSplitPaymentLine(idx) {
    const tab = getActiveTab();
    tab.splitLines.splice(idx, 1);
    renderSplitPaymentLines();
}

const SPLIT_METHOD_LABEL = { cash: '💵 Tiền mặt', transfer: '🏦 Chuyển khoản', card: '💳 Thẻ', wallet: '📱 Ví điện tử' };

function renderSplitPaymentLines() {
    const tab = getActiveTab();
    const lines = tab.splitLines || [];
    tab.split_payment = lines.length > 0;

    const autoBox = document.getElementById('pos-split-auto-box');
    if (autoBox) autoBox.classList.toggle('hidden', lines.length === 0);

    const wrap = document.getElementById('pos-split-lines');
    const bankAccounts = (window.posPaymentAccounts || []).filter(a => a.account_type === 'bank' || a.account_type === 'ewallet');

    if (wrap) {
        wrap.innerHTML = lines.map((l, idx) => {
            const needsAccount = l.method === 'transfer' || l.method === 'card';
            const accountSelect = needsAccount ? `
                <select class="border rounded px-1 py-1 text-[10px] w-24" onchange="tab_splitLines_setAccount(${idx}, this.value)">
                    <option value="">-- TK nhận --</option>
                    ${bankAccounts.map(a => `<option value="${a.id}" ${l.account_id == a.id ? 'selected' : ''}>${a.name}</option>`).join('')}
                </select>` : '';
            return `
            <div class="flex items-center gap-1 text-xs bg-slate-50 border border-slate-200 rounded-lg px-2 py-1">
                <span class="flex-1 font-bold text-slate-600">${SPLIT_METHOD_LABEL[l.method] || l.method}</span>
                <span class="font-black text-emerald-600">${formatMoney(l.amount)}</span>
                ${accountSelect}
                <button type="button" onclick="removeSplitPaymentLine(${idx})" class="text-rose-400 hover:text-rose-600 font-bold px-1">✕</button>
            </div>`;
        }).join('') || '<div class="text-[11px] text-slate-400 text-center py-1">Chưa có dòng thanh toán nào</div>';
    }

    const total = lines.reduce((s, l) => s + l.amount, 0);
    tab.paid_amount = total;
    const paidInput = document.getElementById('pos-paid-input');
    const finalAmount = getPosFinalAmount(tab);
    const remain = Math.max(0, finalAmount - total);
    if (paidInput) paidInput.value = Math.round(remain).toLocaleString('vi-VN');

    const remainDisplay = document.getElementById('pos-split-remain-display');
    if (remainDisplay) {
        remainDisplay.innerText = formatMoney(remain);
        remainDisplay.className = remain <= 0 ? 'text-emerald-600' : 'text-rose-600';
    }
    calculateChangeOrDebt(finalAmount);
}

function tab_splitLines_setAccount(idx, accId) {
    const tab = getActiveTab();
    if (tab.splitLines[idx]) tab.splitLines[idx].account_id = accId ? parseInt(accId) : null;
}

function updatePosPaymentAccountsUI() {
    const select = document.getElementById('pos-bank-account-select');
    if (!select || !window.posPaymentAccounts) return;
    const tab = getActiveTab();
    
    // Ưu tiên tài khoản ngân hàng / ví
    const accounts = window.posPaymentAccounts;
    select.innerHTML = accounts.map(a => {
        const isBank = a.account_type === 'bank';
        const typeBadge = isBank ? '[NH]' : (a.account_type === 'ewallet' ? '[Ví]' : '[Két]');
        const ownerBadge = a.owner_type === 'COMPANY' ? 'Cty' : 'Cá nhân';
        const isSel = tab.account_id ? tab.account_id === a.id : (isBank || a.is_default);
        return `<option value="${a.id}" ${isSel ? 'selected' : ''}>${typeBadge} ${a.name} (${ownerBadge}) - ${a.account_number || a.code}</option>`;
    }).join('');

    if (select.value) {
        tab.account_id = parseInt(select.value);
    }
}

function onPosBankAccountChange(accId) {
    const tab = getActiveTab();
    tab.account_id = parseInt(accId);
}

function toggleUsePoints() {
    const tab = getActiveTab();
    const chk = document.getElementById('chk-use-points');
    if (!tab.customer) {
        alert("Vui lòng chọn khách hàng trước khi dùng điểm!");
        if (chk) chk.checked = false;
        return;
    }
    tab.use_points = chk.checked;
    updateFinancialSummary();
}

function toggleUseSpaWallet() {
    // Deprecated: Bán hàng POS không hỗ trợ trừ ví Spa
}

function applyCoupon() {
    const tab = getActiveTab();
    const code = document.getElementById('pos-coupon-input')?.value.trim().toUpperCase();
    if (!code) {
        tab.coupon_code = "";
        tab.coupon_discount = 0;
        updateFinancialSummary();
        return;
    }

    // Giả lập xử lý mã coupon cơ bản
    if (code === "GIAM10" || code === "SALE10") {
        tab.coupon_code = code;
        tab.coupon_discount = 10000;
        alert("Áp dụng mã thành công: Giảm 10.000 đ");
    } else if (code === "GIAM20") {
        tab.coupon_code = code;
        tab.coupon_discount = 20000;
        alert("Áp dụng mã thành công: Giảm 20.000 đ");
    } else {
        alert("Mã coupon không tồn tại hoặc đã hết hạn!");
        tab.coupon_code = "";
        tab.coupon_discount = 0;
    }
    updateFinancialSummary();
}

// ----------------------------------------------------
// MODAL: GIẢM GIÁ TOÀN BỘ HÓA ĐƠN
// ----------------------------------------------------
var billDiscountTempType = 'vnd';

function openBillDiscountModal() {
    const tab = getActiveTab();
    billDiscountTempType = tab.bill_discount_type || 'vnd';
    document.getElementById('modal-bill-discount-val').value = tab.bill_discount || 0;
    setBillDiscountType(billDiscountTempType);
    document.getElementById('modal-bill-discount').classList.remove('hidden');
}

function closeBillDiscountModal() {
    document.getElementById('modal-bill-discount').classList.add('hidden');
}

function setBillDiscountType(type) {
    billDiscountTempType = type;
    const btnVnd = document.getElementById('btn-bill-disc-vnd');
    const btnPct = document.getElementById('btn-bill-disc-pct');
    if (type === 'vnd') {
        btnVnd.className = "px-2.5 py-1 font-bold text-xs bg-sky-600 text-white";
        btnPct.className = "px-2.5 py-1 font-bold text-xs bg-slate-100 text-slate-700";
    } else {
        btnVnd.className = "px-2.5 py-1 font-bold text-xs bg-slate-100 text-slate-700";
        btnPct.className = "px-2.5 py-1 font-bold text-xs bg-sky-600 text-white";
    }
}

function saveBillDiscountModal() {
    const tab = getActiveTab();
    const val = parseFloat(document.getElementById('modal-bill-discount-val').value) || 0;
    tab.bill_discount = val;
    tab.bill_discount_type = billDiscountTempType;

    const btnEdit = document.getElementById('btn-edit-bill-discount');
    if (btnEdit) {
        btnEdit.innerText = val > 0 ? (billDiscountTempType === 'pct' ? `(${val}%)` : `(Sửa)`) : `(Sửa)`;
    }

    closeBillDiscountModal();
    updateFinancialSummary();
}

// ----------------------------------------------------
// THÊM NHANH KHÁCH HÀNG
// ----------------------------------------------------
function openNewCustomerModal() {
    console.log("[POS] openNewCustomerModal triggered");
    const modal = document.getElementById('modal-quick-customer');
    if (!modal) {
        console.error("[POS] modal-quick-customer not found in DOM");
        return;
    }
    modal.classList.remove('hidden');
    modal.classList.add('flex');
    const nameInput = document.getElementById('quick-cust-name');
    if (nameInput) {
        nameInput.value = '';
        setTimeout(() => nameInput.focus(), 50);
    }
    const phoneInput = document.getElementById('quick-cust-phone');
    if (phoneInput) phoneInput.value = '';
    const emailInput = document.getElementById('quick-cust-email');
    if (emailInput) emailInput.value = '';
    const addrInput = document.getElementById('quick-cust-address');
    if (addrInput) addrInput.value = '';

    // Tải danh sách nhóm khách hàng
    const segSelect = document.getElementById('quick-cust-segment');
    if (segSelect) {
        segSelect.innerHTML = '<option value="">-- Mặc định (Khách lẻ) --</option>';
        fetch('/api/customer-segments')
            .then(r => r.json())
            .then(segments => {
                if (Array.isArray(segments)) {
                    segSelect.innerHTML = '<option value="">-- Mặc định (Khách lẻ) --</option>' +
                        segments.map(s => `<option value="${s.id}">${s.name} (${s.discount_percent}% off)</option>`).join('');
                }
            })
            .catch(e => console.error("Lỗi tải nhóm KH:", e));
    }
}

function closeNewCustomerModal() {
    const modal = document.getElementById('modal-quick-customer');
    if (modal) {
        modal.classList.add('hidden');
        modal.classList.remove('flex');
    }
}

async function submitQuickCustomer() {
    const name = document.getElementById('quick-cust-name')?.value.trim();
    const phone = document.getElementById('quick-cust-phone')?.value.trim();
    const email = (document.getElementById('quick-cust-email')?.value || '').trim();
    const address = document.getElementById('quick-cust-address')?.value.trim();
    const segmentVal = document.getElementById('quick-cust-segment')?.value;
    const segmentId = segmentVal ? parseInt(segmentVal) : null;

    if (!name) {
        alert("Vui lòng nhập tên khách hàng!");
        return;
    }

    try {
        const res = await fetch('/api/contacts', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                name,
                phone: phone || "",
                email: email || "",
                address: address || "",
                type: 'customer',
                segment_id: segmentId,
                debt: 0
            })
        });

        if (!res.ok) {
            const err = await res.json();
            alert("Lỗi: " + (err.detail || "Không thể thêm khách hàng"));
            return;
        }

        const resData = await res.json();
        let newCust = {
            id: resData.id,
            name: name,
            phone: phone || '',
            email: email || '',
            address: address || '',
            type: 'customer',
            segment_id: segmentId,
            reward_points: 0,
            debt: 0
        };

        try {
            const detailRes = await fetch(`/api/contacts/${resData.id}`);
            if (detailRes.ok) {
                newCust = await detailRes.json();
            }
        } catch (_) {}

        posContacts.push(newCust);
        if (typeof allContacts !== 'undefined' && Array.isArray(allContacts)) {
            allContacts.push(newCust);
        }
        selectCustomerForActiveTab(newCust.id);
        closeNewCustomerModal();
        alert("Đã thêm khách hàng thành công!");
    } catch (e) {
        console.error("submitQuickCustomer error:", e);
        alert("Lỗi kết nối khi thêm khách hàng");
    }
}

window.openNewCustomerModal = openNewCustomerModal;
window.closeNewCustomerModal = closeNewCustomerModal;
window.submitQuickCustomer = submitQuickCustomer;

// ----------------------------------------------------
// GỬI ĐƠN HÀNG (THANH TOÁN) & IN HÓA ĐƠN
// ----------------------------------------------------
async function submitPOSOrder() {
    const tab = getActiveTab();
    if (!tab.cart || tab.cart.length === 0) {
        alert("Giỏ hàng đang trống! Vui lòng chọn sản phẩm trước.");
        return;
    }
    if (typeof currentShift !== 'undefined' && !currentShift) {
        const canBypassShift = (typeof Auth !== 'undefined' && typeof Auth.can === 'function' && Auth.can('shifts.bypass'))
            || (typeof Auth !== 'undefined' && Auth.getUser() && (Auth.getUser().role === 'owner' || Auth.getUser().role === 'admin' || Auth.getUser().username === 'admin' || Auth.getUser().name === 'admin' || Auth.getUser().name === 'Quản Lý'));
        if (!canBypassShift) {
            alert("⚠ Bạn chưa mở ca làm việc. Vui lòng mở ca trước khi bán hàng.");
            return;
        }
    }

    const subtotal = tab.cart.reduce((s, i) => s + (i.price * i.quantity), 0);
    let billDisc = tab.bill_discount_type === 'pct' ? Math.round(subtotal * (tab.bill_discount / 100)) : tab.bill_discount;
    const pointsAmount = (tab.use_points && tab.customer) ? Math.min((tab.customer.points || 0) * 1000, subtotal) : 0;
    const totalDiscount = billDisc + (tab.coupon_discount || 0) + pointsAmount;

    const finalAmount = Math.max(0, subtotal - totalDiscount);

    const paidInput = document.getElementById('pos-paid-input');
    const cleanPaid = (paidInput?.value || '0').replace(/\D/g, '');
    let paidAmount = parseFloat(cleanPaid) || 0;

    let splitPayments = null;
    if (tab.split_payment) {
        splitPayments = (tab.splitLines || []).map(l => ({ method: l.method, amount: l.amount, account_id: l.account_id || null }));
        if (splitPayments.length === 0) {
            alert("Chưa có dòng thanh toán nào. Nhập số tiền rồi bấm hình thức thanh toán!");
            return;
        }
        const missingAcc = splitPayments.find(p => (p.method === 'transfer' || p.method === 'card') && !p.account_id);
        if (missingAcc) {
            alert("Vui lòng chọn tài khoản nhận tiền cho dòng " + (SPLIT_METHOD_LABEL[missingAcc.method] || missingAcc.method) + "!");
            return;
        }
        paidAmount = splitPayments.reduce((s, p) => s + p.amount, 0);
        const finalAmount = getPosFinalAmount(tab);
        if (paidAmount < finalAmount) {
            alert("Tổng các hình thức thanh toán (" + formatMoney(paidAmount) + ") chưa đủ số tiền cần trả (" + formatMoney(finalAmount) + ")!");
            return;
        }
    }

    const staffSelect = document.getElementById('pos-staff-select');
    const staffId = parseInt(staffSelect?.value) || 1;
    const customerId = tab.customer ? tab.customer.id : 1; // 1: Khách lẻ mặc định

    const btnSubmit = document.getElementById('btn-submit-order');
    if (btnSubmit) {
        btnSubmit.disabled = true;
        btnSubmit.innerText = "Đang xử lý...";
    }

    try {
        const reqBody = {
            customer_id: customerId,
            staff_id: staffId,
            discount: totalDiscount,
            paid_amount: paidAmount,
            account_id: tab.account_id || null,
            shift_id: (typeof currentShift !== 'undefined' && currentShift) ? currentShift.id : null,
            note: tab.note || "",
            payments: splitPayments,
            items: tab.cart.map(i => ({
                product_id: i.product_id,
                quantity: i.quantity,
                price: i.price
            }))
        };

        const res = await fetch('/api/orders', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(reqBody)
        });

        const data = await res.json();
        if (!res.ok) {
            alert("Lỗi khi tạo hóa đơn: " + (data.detail || "Không rõ nguyên nhân"));
            return;
        }
        orderCode = data.order_code;

        // Thông báo tích điểm & thăng hạng
        let loyaltyMsg = "";
        if (data.points_earned && data.points_earned > 0) {
            loyaltyMsg += `\n🎉 Tích lũy thành công: +${data.points_earned} điểm (Tổng: ${data.current_points || 0})`;
        }
        if (data.tier_upgraded) {
            loyaltyMsg += `\n🏆 CHÚC MỪNG KHÁCH ĐƯỢC THĂNG HẠNG: [${data.tier_upgraded}]!`;
        }
        if (loyaltyMsg) {
            alert(loyaltyMsg.trim());
        }

        // Cập nhật lại số dư ví / điểm trong danh sách khách hàng posContacts
        if (customerId && customerId !== 1) {
            const cItem = posContacts.find(c => c.id === customerId);
            if (cItem) {
                if (data.current_points !== undefined) cItem.points = data.current_points;
                if (data.spa_wallet_deduction && data.spa_wallet_deduction > 0) {
                    cItem.spa_wallet_balance = Math.max(0, (cItem.spa_wallet_balance || 0) - data.spa_wallet_deduction);
                }
                if (data.tier_upgraded) {
                    cItem.segment_name = data.tier_upgraded;
                }
            }
        }

        // Lấy mẫu in đang được chọn trên giao diện
        const selTemplate = document.getElementById('pos-template-select');
        if (selTemplate && selTemplate.value) {
            posPrintConfig.active_preset = selTemplate.value;
        }

        // Đặt lại đơn hàng hiện tại
        tab.cart = [];
        tab.customer = null;
        tab.note = "";
        tab.bill_discount = 0;
        tab.use_points = false;
        tab.coupon_code = "";
        tab.coupon_discount = 0;
        tab.paid_amount = null;
        tab.split_payment = false;
        tab.splitLines = [];
        document.getElementById('pos-split-auto-box')?.classList.add('hidden');

        clearDraft();
        renderInvoiceTabs();
        renderActiveTabCart();

        // Mở popup in hóa đơn ngay
        showPrintModal(orderCode);
    } catch (e) {
        console.error("submitPOSOrder error:", e);
        alert("Lỗi kết nối khi thanh toán đơn hàng!");
    } finally {
        if (btnSubmit) {
            btnSubmit.disabled = false;
            btnSubmit.innerHTML = "<span>💳</span><span>THANH TOÁN (F9)</span>";
        }
    }
}

// ----------------------------------------------------
// IN HÓA ĐƠN (SỬ DỤNG CHÍNH XÁC TEMPLATE ENGINE TỪ SETTINGS)
// ----------------------------------------------------
var posPaperDimensions = {
    "A4-portrait": { width: "210mm", height: "297mm", printSize: "A4 portrait" },
    "A4-landscape": { width: "297mm", height: "210mm", printSize: "A4 landscape" },
    "A5-portrait": { width: "148mm", height: "210mm", printSize: "A5 portrait" },
    "A5-landscape": { width: "210mm", height: "148mm", printSize: "A5 landscape" },
    "K80": { width: "80mm", height: "auto", printSize: "auto" },
    "K58": { width: "58mm", height: "auto", printSize: "auto" },
};

var posPrintConfig = {
    active_preset: "a4_b2b",
    presets: {}
};

function getQRCodeHTML(amount, code) {
    const mode = posSettings.shop_qr_mode || 'vietqr';
    if (mode === 'static' && posSettings.shop_qr_image) {
        return `<img src="${posSettings.shop_qr_image}" style="max-width: 140px; margin: 0 auto; display: block;" alt="QR Thanh Toán">`;
    }
    if (posSettings.shop_bank_account) {
        const bank = posSettings.shop_bank_code || 'MB';
        const acc = posSettings.shop_bank_account;
        const name = encodeURIComponent(posSettings.shop_bank_owner || '');
        const desc = encodeURIComponent(code || 'THANH TOAN');
        const amt = Math.round(amount || 0);
        const qrUrl = `https://img.vietqr.io/image/${bank}-${acc}-compact2.png?amount=${amt}&addInfo=${desc}&accountName=${name}`;
        return `<div style="text-align: center;"><img src="${qrUrl}" style="max-width: 140px; margin: 2px auto; display: block; border-radius: 4px;" alt="VietQR"><div style="font-size: 10px; color: #555;">Quét QR chuyển khoản</div></div>`;
    }
    return `<div style="border: 1px dashed #999; padding: 10px; font-size: 11px; text-align: center; color: #777;">(Chưa cấu hình tài khoản VietQR trong Cài Đặt)</div>`;
}

function initPrintTemplatesFromSettings() {
    if (posSettings.print_blocks_config) {
        try {
            const parsed = JSON.parse(posSettings.print_blocks_config);
            if (parsed.presets && Object.keys(parsed.presets).length > 0) {
                posPrintConfig = parsed;
                if (typeof getDefaultPresets === 'function') {
                    const def = getDefaultPresets();
                    for (let k in def) {
                        if (!posPrintConfig.presets[k]) posPrintConfig.presets[k] = def[k];
                    }
                }
                // Khôi phục mẫu in nhân viên đã chọn lần trước (localStorage),
                // nếu mẫu đó vẫn còn tồn tại trong danh sách preset hiện có.
                const savedKey = localStorage.getItem('pos_print_template');
                if (savedKey && posPrintConfig.presets[savedKey]) {
                    posPrintConfig.active_preset = savedKey;
                }
            }
        } catch(e) {}
    }

    const sel = document.getElementById('pos-template-select');
    if (!sel) return;

    const cur = posPrintConfig.active_preset;
    const shortLabel = { 'A4-portrait': 'A4 dọc', 'A4-landscape': 'A4 ngang', 'A5-portrait': 'A5', 'A5-landscape': 'A5 ngang', 'K80': 'K80', 'K58': 'K58' };
    let html = '';
    for (let key in posPrintConfig.presets) {
        const p = posPrintConfig.presets[key];
        const cat = p.category || (key.includes('spa') ? 'spa' : (key.includes('cashbook') ? 'cashbook' : (key.includes('audit') ? 'inventory' : 'pos')));
        if (cat !== 'pos') continue;

        const isSel = key === cur ? 'selected' : '';
        const sizeTag = shortLabel[p.paper_size] || p.paper_size || '';
        const boldTag = p.is_bold_all ? ' [Đậm]' : '';
        const label = p.name ? (sizeTag ? `${p.name} [${sizeTag}]${boldTag}` : `${p.name}${boldTag}`) : `${sizeTag}${boldTag}`;
        html += `<option value="${key}" ${isSel}>${label}</option>`;
    }
    if (!html.includes('selected') && html.length > 0) {
        const firstPosKey = Object.keys(posPrintConfig.presets).find(k => {
            const p = posPrintConfig.presets[k];
            const cat = p.category || (k.includes('spa') ? 'spa' : (k.includes('cashbook') ? 'cashbook' : (k.includes('audit') ? 'inventory' : 'pos')));
            return cat === 'pos';
        });
        if (firstPosKey) {
            posPrintConfig.active_preset = firstPosKey;
            html = '';
            for (let key in posPrintConfig.presets) {
                const p = posPrintConfig.presets[key];
                const cat = p.category || (key.includes('spa') ? 'spa' : (key.includes('cashbook') ? 'cashbook' : (key.includes('audit') ? 'inventory' : 'pos')));
                if (cat !== 'pos') continue;
                const isSel = key === firstPosKey ? 'selected' : '';
                const sizeTag = shortLabel[p.paper_size] || p.paper_size || '';
                const boldTag = p.is_bold_all ? ' [Đậm]' : '';
                const label = p.name ? (sizeTag ? `${p.name} [${sizeTag}]${boldTag}` : `${p.name}${boldTag}`) : `${sizeTag}${boldTag}`;
                html += `<option value="${key}" ${isSel}>${label}</option>`;
            }
        }
    }
    sel.innerHTML = html;
}

function changeActivePrintTemplate(presetKey) {
    if (!posPrintConfig.presets || !posPrintConfig.presets[presetKey]) return;
    posPrintConfig.active_preset = presetKey;
    localStorage.setItem('pos_print_template', presetKey);
}

async function showPrintModal(orderCode) {
    const selTemplate = document.getElementById('pos-template-select');
    if (selTemplate && selTemplate.value) {
        posPrintConfig.active_preset = selTemplate.value;
    }

    if (!posSettings.shop_name) {
        try {
            const resSet = await fetch('/api/settings');
            posSettings = await resSet.json();
            initPrintTemplatesFromSettings();
            if (selTemplate && selTemplate.value) {
                posPrintConfig.active_preset = selTemplate.value;
            }
        } catch (e) {}
    }

    try {
        if (!orderCode) {
            console.error("showPrintModal: orderCode is null or empty");
            alert("Mã hóa đơn không hợp lệ!");
            return;
        }
        const res = await fetch(`/api/orders/${orderCode}`);
        if (!res.ok) {
            const err = await res.json().catch(() => ({}));
            alert(err.detail || `Không tìm thấy hóa đơn [${orderCode}] để in!`);
            return;
        }
        const ord = await res.json();
        renderAndPrint(ord, false);
    } catch (e) {
        console.error("Lỗi showPrintModal:", e);
        alert("Không thể tải thông tin để in hóa đơn");
    }
}

// In hóa đơn tạm tính / hóa đơn mẫu (không trừ kho, không tính tiền, không lưu đơn)
function printDraftOrder() {
    const tab = getActiveTab();
    if (!tab.cart || tab.cart.length === 0) {
        alert("Chưa có sản phẩm nào trong đơn hàng để in tạm tính!");
        return;
    }

    const selTemplate = document.getElementById('pos-template-select');
    if (selTemplate && selTemplate.value) {
        posPrintConfig.active_preset = selTemplate.value;
    }

    const subtotal = tab.cart.reduce((s, i) => s + (i.price * i.quantity), 0);
    let billDisc = tab.bill_discount_type === 'pct' ? Math.round(subtotal * (tab.bill_discount / 100)) : tab.bill_discount;
    const pointsAmount = (tab.use_points && tab.customer) ? Math.min((tab.customer.points || 0) * 1000, subtotal) : 0;
    const totalDiscount = billDisc + (tab.coupon_discount || 0) + pointsAmount;
    const finalAmount = Math.max(0, subtotal - totalDiscount);

    const paidInput = document.getElementById('pos-paid-input');
    const cleanPaid = (paidInput?.value || '0').replace(/\D/g, '');
    const paidAmount = parseFloat(cleanPaid) || 0;

    const staffSelect = document.getElementById('pos-staff-select');
    const staffName = staffSelect?.options[staffSelect.selectedIndex]?.text || 'Admin';

    const now = new Date();
    const pad = (n) => String(n).padStart(2, '0');
    const timeStr = `${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(now.getSeconds())} ${pad(now.getDate())}/${pad(now.getMonth()+1)}/${now.getFullYear()}`;

    const draftOrder = {
        code: "DRAFT-" + Math.floor(100000 + Math.random() * 900000),
        created_at: timeStr,
        customer_name: tab.customer ? tab.customer.name : "Khách lẻ",
        customer_phone: tab.customer ? (tab.customer.phone || "-") : "-",
        staff_name: staffName,
        note: tab.note || "",
        total_amount: subtotal,
        discount: totalDiscount,
        final_amount: finalAmount,
        paid_amount: paidAmount,
        debt_amount: Math.max(0, finalAmount - paidAmount),
        items: tab.cart.map(i => ({
            product_code: i.code,
            product_name: i.name,
            unit: i.unit,
            price: i.price,
            original_price: i.original_price || i.price,
            quantity: i.quantity
        }))
    };

    renderAndPrint(draftOrder, true);
}

function renderAndPrint(ord, isDraft = false) {
    const printArea = document.getElementById('print-area');
    if (!printArea) return;
    window.currentPrintIsDraft = !!isDraft;

    // Luôn lấy preset đang chọn từ selector
    const selTemplate = document.getElementById('pos-template-select');
    const curPresetKey = (selTemplate && selTemplate.value) ? selTemplate.value : (posPrintConfig.active_preset || "a4_b2b");
    const curPreset = posPrintConfig.presets ? posPrintConfig.presets[curPresetKey] : null;

    let canvasElements = [];
    let paperSize = "A4-portrait";
    window.currentPrintIsBoldAll = !!(curPreset && curPreset.is_bold_all);

    if (curPreset && curPreset.elements) {
        canvasElements = curPreset.elements;
        paperSize = curPreset.paper_size || "A4-portrait";
    } else if (posPrintConfig.templates && posPrintConfig.templates[curPresetKey]) {
        canvasElements = posPrintConfig.templates[curPresetKey];
        paperSize = curPresetKey;
    }

    let itemDiscountTotal = 0;
    (ord.items || []).forEach(it => {
        if (it.original_price && it.original_price > it.price) {
            itemDiscountTotal += (it.original_price - it.price) * (it.quantity || 1);
        }
    });
    const billDiscount = ord.discount || 0;
    const totalSavings = itemDiscountTotal + billDiscount;

    const printData = {
        ten_cua_hang: posSettings.shop_name || "TÊN CỬA HÀNG",
        dia_chi: posSettings.shop_address || "Địa chỉ shop",
        so_dien_thoai: posSettings.shop_phone || "0900000000",
        loi_cam_on: posSettings.shop_footer || "Cảm ơn quý khách!",
        ma_hoa_don: ord.code,
        ngay_gio: ord.created_at,
        thu_ngan: ord.staff_name || 'Thu ngân',
        ten_khach: ord.customer_name || 'Khách lẻ',
        sdt_khach: ord.customer_phone || '-',
        tong_tien: formatMoney(ord.total_amount),
        giam_gia: formatMoney(totalSavings > 0 ? totalSavings : (ord.discount || 0)),
        tiet_kiem: formatMoney(totalSavings),
        tru_vi: formatMoney(ord.spa_wallet_deduction || 0),
        raw_tru_vi: ord.spa_wallet_deduction || 0,
        phai_tra: formatMoney(ord.final_amount),
        khach_tra: formatMoney(ord.paid_amount),
        con_no: formatMoney(ord.debt_amount),
        raw_phai_tra: ord.final_amount
    };

    const dim = posPaperDimensions[paperSize] || posPaperDimensions["A4-portrait"];
    const isLandscape = paperSize.includes("landscape");
    const isThermal = paperSize === 'K80' || paperSize === 'K58';
    const canvasW = isThermal ? (paperSize === 'K80' ? 290 : 210) : (isLandscape ? 1123 : 794);

    currentPrintPaperSize = paperSize;
    currentPrintPageRule = dim.printSize || (isLandscape ? 'A4 landscape' : (isThermal ? 'auto' : 'A4 portrait'));

    // Sao chép canvasElements để không mutate config gốc và xử lý tự ẩn dòng giảm giá K80 khi không có giảm giá
    let effectiveElements = canvasElements.map(e => ({ ...e }));
    const hasAnyDiscount = (totalSavings > 0);
    const hasBillDiscount = hasAnyDiscount;
    const discElem = effectiveElements.find(e => e.text && (e.text.includes('{{giam_gia}}') || e.text.includes('{{tiet_kiem}}') || (e.label && e.label.toLowerCase().includes('giảm giá'))));
    if (!hasAnyDiscount && discElem && isThermal) {
        const discY = discElem.y || 0;
        const shiftAmount = 20;
        effectiveElements = effectiveElements.filter(e => e !== discElem);
        effectiveElements.forEach(e => {
            if ((e.zone || 'header') === 'footer' && (e.y || 0) > discY) {
                e.y = (e.y || 0) - shiftAmount;
            }
        });
    }

    // Xử lý dòng Trừ Ví Spa: tự ẩn nếu không trừ ví, hoặc tự chèn nếu có trừ ví mà template chưa có
    const walletDeduct = ord.spa_wallet_deduction || 0;
    const walletElem = effectiveElements.find(e => e.text && (e.text.includes('{{tru_vi}}') || (e.label && e.label.toLowerCase().includes('trừ ví'))));
    if (walletDeduct <= 0 && walletElem && isThermal) {
        const walY = walletElem.y || 0;
        const shiftAmount = 20;
        effectiveElements = effectiveElements.filter(e => e !== walletElem);
        effectiveElements.forEach(e => {
            if ((e.zone || 'header') === 'footer' && (e.y || 0) > walY) {
                e.y = (e.y || 0) - shiftAmount;
            }
        });
    } else if (walletDeduct > 0 && !walletElem && isThermal) {
        const payElem = effectiveElements.find(e => e.text && (e.text.includes('{{phai_tra}}') || (e.label && e.label.toLowerCase().includes('phải trả'))));
        if (payElem) {
            const insY = payElem.y;
            effectiveElements.forEach(e => {
                if ((e.zone || 'header') === 'footer' && (e.y || 0) >= insY) {
                    e.y = (e.y || 0) + 18;
                }
            });
            effectiveElements.push({
                id: "e_auto_tru_vi",
                zone: "footer",
                type: "text",
                text: "Trừ Ví Spa: -{{tru_vi}}",
                label: "Trừ Ví Spa",
                x: 10,
                y: insY,
                w: 270,
                fsz: 11,
                bold: false,
                align: "right"
            });
        }
    }

    // Tính deltaY giãn chân trang theo số lượng dòng sản phẩm
    const tableElem = effectiveElements.find(e => e.type === 'table' || e.type === 'table_b2b');
    let deltaY = 0;
    if (tableElem && ord.items) {
        const isB2B = tableElem.type === 'table_b2b';
        const headerH = isB2B ? 34 : 28;
        let itemsHeight = 0;
        ord.items.forEach(it => {
            if (isB2B) {
                itemsHeight += 28;
            } else if (isThermal) {
                const nameLen = (it.product_name || '').length;
                const nameLines = Math.max(1, Math.ceil(nameLen / 36));
                const hasItemDisc = it.original_price && (it.original_price > it.price);
                const numH = hasItemDisc ? 28 : 18;
                itemsHeight += (nameLines * 16) + numH + 8;
            } else {
                const nameLen = (it.product_name || '').length;
                const lines = Math.max(1, Math.ceil(nameLen / 16));
                const hasItemDisc = it.original_price && (it.original_price > it.price);
                const priceLines = hasItemDisc ? 2 : 1;
                const rowLines = Math.max(lines, priceLines);
                const rowH = 8 + (rowLines * 16);
                itemsHeight += rowH;
            }
        });
        const actualTableHeight = headerH + itemsHeight + 10;
        const tableBottom = (tableElem.y || 0) + actualTableHeight;

        const footerElems = effectiveElements.filter(e => (e.zone || 'header') === 'footer');
        if (footerElems.length > 0) {
            const minFooterY = Math.min(...footerElems.map(e => e.y || 0));
            if (tableBottom + 15 > minFooterY) {
                deltaY = (tableBottom + 15) - minFooterY;
            }
        }
    }

    // Tính chiều cao nội dung thực tế (đáy của phần tử thấp nhất)
    let maxContentBottom = 0;
    effectiveElements.forEach(e => {
        let printY = e.y || 0;
        if ((e.zone || 'header') === 'footer' && deltaY > 0) {
            printY += deltaY;
        }
        let approxH = e.h || 24;
        if (e.type === 'table' || e.type === 'table_b2b') {
            const isB2B = e.type === 'table_b2b';
            let itemsH = 0;
            (ord.items || [{}]).forEach(it => {
                if (isB2B) {
                    itemsH += 28;
                } else if (isThermal) {
                    const nameLen = (it.product_name || '').length;
                    const nameLines = Math.max(1, Math.ceil(nameLen / 36));
                    const hasItemDisc = it.original_price && (it.original_price > it.price);
                    const numH = hasItemDisc ? 28 : 18;
                    itemsH += (nameLines * 16) + numH + 8;
                } else {
                    const nameLen = (it.product_name || '').length;
                    const lines = Math.max(1, Math.ceil(nameLen / 16));
                    const hasItemDisc = it.original_price && (it.original_price > it.price);
                    const priceLines = hasItemDisc ? 2 : 1;
                    const rowLines = Math.max(lines, priceLines);
                    const rowH = 8 + (rowLines * 16);
                    itemsH += rowH;
                }
            });
            approxH = (isB2B ? 34 : 28) + itemsH + 10;
        } else if (e.type === 'qr') {
            approxH = 145;
        } else if (e.type === 'b2b_footer_boxes') {
            approxH = 130;
        } else if (e.type === 'signatures_3col') {
            approxH = 100;
        }
        if (printY + approxH > maxContentBottom) {
            maxContentBottom = printY + approxH;
        }
    });

    const canvasH = isThermal ? Math.max(320, maxContentBottom + 25) : (isLandscape ? 794 : 1123);

    const watermarkHtml = isDraft ? `
        <div class="draft-watermark-banner" style="width: ${dim.width}; max-width: 100%; margin: 0 auto 12px auto; background-color: #fef3c7; color: #92400e; border: 1.5px dashed #f59e0b; padding: 8px 14px; font-size: 13px; font-weight: bold; text-align: center; border-radius: 8px; box-sizing: border-box; box-shadow: 0 2px 5px rgba(0,0,0,0.05); display: flex; align-items: center; justify-content: center; gap: 6px;">
            <span>⚠️</span>
            <span>ĐÂY LÀ HÓA ĐƠN MẪU / TẠM TÍNH - CHƯA THANH TOÁN</span>
        </div>
    ` : '';

    let html = `
    <style>
        @page { size: ${dim.printSize || 'auto'}; margin: 0; }
        @media print {
            html, body {
                margin: 0 !important;
                padding: 0 !important;
                height: auto !important;
                min-height: 0 !important;
                overflow: visible !important;
            }
            .print-preview-wrapper {
                padding: 0 !important;
                margin: 0 !important;
                page-break-inside: avoid !important;
                break-inside: avoid !important;
            }
            .draft-watermark-banner {
                margin: 0 0 6px 0 !important;
                -webkit-print-color-adjust: exact !important;
                print-color-adjust: exact !important;
            }
            .print-container { 
                width: ${dim.width} !important; 
                height: auto !important; 
                min-height: 0 !important;
                max-height: none !important;
                margin: 0 auto !important;
                padding: 0 !important;
                overflow: visible !important;
                box-shadow: none !important;
                border: none !important;
                page-break-after: avoid !important;
                page-break-inside: avoid !important;
                break-inside: avoid !important;
                break-after: avoid !important;
            }
            .print-inner {
                transform-origin: top left;
                page-break-after: avoid !important;
                page-break-inside: avoid !important;
                break-inside: avoid !important;
                break-after: avoid !important;
            }
        }
    </style>
    <div class="print-preview-wrapper" style="display: flex; flex-direction: column; align-items: center; width: 100%; max-width: 100%; padding: 4px 0;">
        ${watermarkHtml}
        <div class="print-container" style="width: ${dim.width}; margin: 0 auto; background: white; overflow: hidden; position: relative; box-shadow: 0 4px 16px rgba(0,0,0,0.1); border: 1px solid #e2e8f0; border-radius: 4px;">
            <div class="print-inner" style="position: relative; width: ${canvasW}px; height: ${canvasH}px; font-family: Arial, sans-serif; overflow: hidden; page-break-inside: avoid; break-inside: avoid;">`;

    effectiveElements.forEach(e => {
        let content = '';
        if (e.type === 'logo') {
            if (posSettings.shop_logo) content = `<img src="${posSettings.shop_logo}" style="max-height: 100%; max-width: 100%;">`;
        } else if (e.type === 'qr') {
            content = getQRCodeHTML(ord.final_amount, ord.code);
        } else if (e.type === 'table_b2b') {
            content = `
                <table style="width: 100%; border-collapse: collapse; font-size: ${e.fsz || 10}px; border: 1px solid #000;">
                    <thead>
                        <tr style="background-color: #f1f5f9; border-bottom: 1px solid #000; font-weight: bold; text-align: center;">
                            <th style="border: 1px solid #000; padding: 4px 2px; width: 28px;">TT</th>
                            <th style="border: 1px solid #000; padding: 4px 4px; width: 68px;">Mã hàng</th>
                            <th style="border: 1px solid #000; padding: 4px 4px; text-align: left;">Tên sản phẩm</th>
                            <th style="border: 1px solid #000; padding: 4px 2px; width: 45px;">ĐVT</th>
                            <th style="border: 1px solid #000; padding: 4px 4px; text-align: right; width: 75px;">Đơn giá</th>
                            <th style="border: 1px solid #000; padding: 4px 2px; text-align: right; width: 45px;">CK</th>
                            <th style="border: 1px solid #000; padding: 4px 2px; width: 38px;">SL</th>
                            <th style="border: 1px solid #000; padding: 4px 4px; text-align: right; width: 85px;">Thành tiền</th>
                            <th style="border: 1px solid #000; padding: 4px 4px; width: 75px;">Ghi chú</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${ord.items.map((it, idx) => {
                            const hasItemDisc = it.original_price && (it.original_price > it.price);
                            const discText = hasItemDisc ? `${Math.round((1 - it.price / it.original_price) * 100)}%` : '0%';
                            return `
                        <tr style="border-bottom: 1px solid #ccc; text-align: center;">
                            <td style="border: 1px solid #ccc; padding: 4px 2px;">${idx + 1}</td>
                            <td style="border: 1px solid #ccc; padding: 4px 4px;">${it.product_code || ''}</td>
                            <td style="border: 1px solid #ccc; padding: 4px 4px; text-align: left; font-weight: 500;">${it.product_name}</td>
                            <td style="border: 1px solid #ccc; padding: 4px 2px;">${it.unit || 'Cái'}</td>
                            <td style="border: 1px solid #ccc; padding: 4px 4px; text-align: right;">${formatMoney(it.price)}</td>
                            <td style="border: 1px solid #ccc; padding: 4px 2px; text-align: right;">${discText}</td>
                            <td style="border: 1px solid #ccc; padding: 4px 2px; font-weight: bold;">${it.quantity}</td>
                            <td style="border: 1px solid #ccc; padding: 4px 4px; text-align: right; font-weight: bold;">${formatMoney(it.quantity * it.price)}</td>
                            <td style="border: 1px solid #ccc; padding: 4px 4px; font-size: 9px; color: #666;">-</td>
                        </tr>
                            `;
                        }).join('')}
                    </tbody>
                </table>
            `;
        } else if (e.type === 'b2b_footer_boxes') {
            content = `
                <div style="display: grid; grid-template-columns: 1.2fr 1fr 1.3fr; gap: 8px; font-size: 10px;">
                    <div style="border: 1px solid #000; padding: 6px; border-radius: 2px;">
                        <div style="font-weight: bold; border-bottom: 0.5px solid #ccc; padding-bottom: 2px; margin-bottom: 4px; text-transform: uppercase;">💳 Thông Tin Thanh Toán</div>
                        <div>Ngân hàng: <b>${posSettings.shop_bank_code || 'MB Bank'}</b></div>
                        <div>Số TK: <b>${posSettings.shop_bank_account || '123456789'}</b></div>
                        <div>Chủ TK: <b>${posSettings.shop_bank_owner || posSettings.shop_name || 'CHỦ TÀI KHOẢN'}</b></div>
                        <div style="color: #555; font-size: 9px; margin-top: 3px;">Nội dung CK: <i>${printData.ma_hoa_don}</i></div>
                    </div>
                    <div style="border: 1px solid #000; padding: 6px; border-radius: 2px; text-align: center; display: flex; flex-direction: column; align-items: center; justify-content: center;">
                        <div style="font-weight: bold; font-size: 9px; margin-bottom: 2px;">QUÉT MÃ VIETQR</div>
                        ${getQRCodeHTML(ord.final_amount, ord.code)}
                    </div>
                    <div style="border: 1px solid #000; padding: 6px; border-radius: 2px;">
                        <div style="font-weight: bold; border-bottom: 0.5px solid #ccc; padding-bottom: 2px; margin-bottom: 4px; text-transform: uppercase;">💰 Tổng Kết Thanh Toán</div>
                        <div style="display: flex; justify-content: space-between; margin-bottom: 2px;"><span>Tổng tiền hàng:</span> <span>${printData.tong_tien}</span></div>
                        <div style="display: flex; justify-content: space-between; margin-bottom: 2px;"><span>Chiết khấu:</span> <span>${printData.giam_gia}</span></div>
                        ${(ord.spa_wallet_deduction || 0) > 0 ? `<div style="display: flex; justify-content: space-between; margin-bottom: 2px; color: #6b21a8; font-weight: 500;"><span>Trừ Ví Spa:</span> <span>-${printData.tru_vi}</span></div>` : ''}
                        <div style="display: flex; justify-content: space-between; font-weight: bold; font-size: 11px; margin-bottom: 2px; border-top: 1px dashed #999; padding-top: 2px;"><span>PHẢI TRẢ:</span> <span style="color: #b91c1c;">${printData.phai_tra}</span></div>
                        <div style="display: flex; justify-content: space-between; margin-bottom: 2px;"><span>Khách đã trả:</span> <span>${printData.khach_tra}</span></div>
                        <div style="display: flex; justify-content: space-between; font-weight: bold;"><span>Còn nợ lại:</span> <span>${printData.con_no}</span></div>
                    </div>
                </div>
            `;
        } else if (e.type === 'signatures_3col') {
            content = `
                <div style="display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 8px; text-align: center; font-size: 11px;">
                    <div>
                        <div style="font-weight: bold; text-transform: uppercase;">Người Nhận Hàng</div>
                        <div style="font-size: 9px; font-style: italic; color: #555;">(Ký, ghi rõ họ tên)</div>
                        <div style="height: 45px;"></div>
                    </div>
                    <div>
                        <div style="font-weight: bold; text-transform: uppercase;">Thủ Kho</div>
                        <div style="font-size: 9px; font-style: italic; color: #555;">(Ký, ghi rõ họ tên)</div>
                        <div style="height: 45px;"></div>
                    </div>
                    <div>
                        <div style="font-weight: bold; text-transform: uppercase;">Kế Toán / Người Lập</div>
                        <div style="font-size: 9px; font-style: italic; color: #555;">(Ký, ghi rõ họ tên)</div>
                        <div style="height: 45px;"></div>
                    </div>
                </div>
            `;
        } else if (e.type === 'table') {
            if (isThermal) {
                content = `
                    <table style="width: 100%; border-collapse: collapse; font-size: ${e.fsz || 11}px; border-top: 1px dashed #000; border-bottom: 1px dashed #000; table-layout: fixed;">
                        <thead style="border-bottom: 1px dashed #000;">
                            <tr>
                                <th style="text-align: left; width: 45px; padding: 4px 0;">SL</th>
                                <th style="text-align: right; width: 105px; padding: 4px 0;">Đơn giá</th>
                                <th style="text-align: right; width: 120px; padding: 4px 0;">Thành tiền</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${ord.items.map(it => {
                                const hasItemDisc = it.original_price && (it.original_price > it.price);
                                const itemDiff = hasItemDisc ? (it.original_price - it.price) : 0;
                                const priceDisplay = hasItemDisc ? `
                                    <div style="font-weight: bold; line-height: 1.1;">${formatMoney(it.price)}</div>
                                    <div style="color: #666; font-size: 9px; line-height: 1.1; margin-top: 1px;">
                                        <span style="text-decoration: line-through;">${formatMoney(it.original_price)}</span>
                                        <span style="color: #15803d; font-weight: 500;">(Giảm ${formatMoney(itemDiff)})</span>
                                    </div>
                                ` : `<div>${formatMoney(it.price)}</div>`;
                                const subtotalDisplay = (hasItemDisc && it.quantity > 1) ? `
                                    <div style="font-weight: bold;">${formatMoney(it.quantity * it.price)}</div>
                                    <div style="color: #15803d; font-size: 9px; line-height: 1.1;">(Giảm ${formatMoney(itemDiff * it.quantity)})</div>
                                ` : `<div style="font-weight: bold;">${formatMoney(it.quantity * it.price)}</div>`;
                                return `
                                <tr>
                                    <td colspan="3" style="padding: 5px 0 2px 0; font-weight: 600; text-align: left; word-break: break-word; line-height: 1.2;">${it.product_name}</td>
                                </tr>
                                <tr style="border-bottom: 0.5px dotted #ccc;">
                                    <td style="text-align: left; vertical-align: top; padding: 2px 0 5px 0;">${it.quantity}</td>
                                    <td style="text-align: right; vertical-align: top; padding: 2px 0 5px 0;">${priceDisplay}</td>
                                    <td style="text-align: right; vertical-align: top; padding: 2px 0 5px 0;">${subtotalDisplay}</td>
                                </tr>
                                `;
                            }).join('')}
                        </tbody>
                    </table>
                `;
            } else {
                content = `
                    <table style="width: 100%; border-collapse: collapse; font-size: ${e.fsz || 11}px; border-top: 1px dashed #000; border-bottom: 1px dashed #000; table-layout: fixed;">
                        <thead style="border-bottom: 1px dashed #000;">
                            <tr>
                                <th style="text-align: left; padding: 4px 0;">Tên sản phẩm</th>
                                <th style="text-align: center; width: 60px; padding: 4px 0;">SL</th>
                                <th style="text-align: right; width: 120px; padding: 4px 0;">Đơn giá</th>
                                <th style="text-align: right; width: 140px; padding: 4px 0;">Thành tiền</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${ord.items.map(it => {
                                const hasItemDisc = it.original_price && (it.original_price > it.price);
                                const priceDisplay = hasItemDisc ? `
                                    <div style="font-weight: bold; line-height: 1.1;">${formatMoney(it.price)}</div>
                                    <div style="text-decoration: line-through; color: #777; font-size: 9px; line-height: 1.1; margin-top: 1px;">${formatMoney(it.original_price)}</div>
                                ` : `<div>${formatMoney(it.price)}</div>`;
                                return `
                                <tr style="border-bottom: 0.5px dotted #ccc;">
                                    <td style="padding: 4px 2px 4px 0; vertical-align: top; word-break: break-word;">${it.product_name}</td>
                                    <td style="text-align: center; vertical-align: top; padding: 4px 0;">${it.quantity}</td>
                                    <td style="text-align: right; vertical-align: top; padding: 4px 0;">${priceDisplay}</td>
                                    <td style="text-align: right; vertical-align: top; padding: 4px 0; font-weight: 500;">${formatMoney(it.quantity * it.price)}</td>
                                </tr>
                                `;
                            }).join('')}
                        </tbody>
                    </table>
                `;
            }
        } else {
            let txt = e.text || '';
            if (isDraft && (txt.includes("HÓA ĐƠN BÁN HÀNG") || txt.includes("HÓA ĐƠN"))) {
                txt = "HÓA ĐƠN MẪU (TẠM TÍNH)";
            }
            txt = txt.replace(/{{ten_cua_hang}}/g, printData.ten_cua_hang);
            txt = txt.replace(/{{dia_chi}}/g, printData.dia_chi);
            txt = txt.replace(/{{so_dien_thoai}}/g, printData.so_dien_thoai);
            txt = txt.replace(/{{loi_cam_on}}/g, printData.loi_cam_on);
            txt = txt.replace(/{{ma_hoa_don}}/g, printData.ma_hoa_don);
            txt = txt.replace(/{{ngay_gio}}/g, printData.ngay_gio);
            txt = txt.replace(/{{thu_ngan}}/g, printData.thu_ngan);
            txt = txt.replace(/{{ten_khach}}/g, printData.ten_khach);
            txt = txt.replace(/{{sdt_khach}}/g, printData.sdt_khach);
            txt = txt.replace(/{{tong_tien}}/g, printData.tong_tien);
            txt = txt.replace(/{{giam_gia}}/g, printData.giam_gia);
            txt = txt.replace(/{{tru_vi}}/g, printData.tru_vi);
            txt = txt.replace(/{{tiet_kiem}}/g, printData.tiet_kiem);
            txt = txt.replace(/{{phai_tra}}/g, printData.phai_tra);
            txt = txt.replace(/{{khach_tra}}/g, printData.khach_tra);
            txt = txt.replace(/{{con_no}}/g, printData.con_no);
            content = `<div style="font-size: ${e.fsz || 12}px; font-weight: ${e.bold ? 'bold' : 'normal'}; font-style: ${e.italic ? 'italic' : 'normal'}; text-align: ${e.align || 'left'};">${txt}</div>`;
        }

        let printY = e.y || 0;
        const isFooter = (e.zone || 'header') === 'footer';
        if (isFooter && deltaY > 0) {
            printY += deltaY;
        }

        let elemW = e.w ? e.w + 'px' : 'auto';
        if (paperSize === 'A4-portrait' && e.w && e.w > 734 && (e.type === 'table_b2b' || e.type === 'b2b_footer_boxes' || e.type === 'signatures_3col')) {
            elemW = '734px';
        } else if (paperSize === 'A4-landscape' && e.w && (e.type === 'table_b2b' || e.type === 'b2b_footer_boxes' || e.type === 'signatures_3col')) {
            elemW = '1043px';
        }

        html += `<div data-zone="${e.zone || 'header'}" style="position: absolute; left: ${e.x || 0}px; top: ${printY}px; width: ${elemW};">${content}</div>`;
    });

    html += `</div></div></div>`;

    printArea.innerHTML = html;

    // Tự động đo đạc DOM thực tế và đẩy các phần tử chân trang nếu bảng cao hơn ước tính
    const printInner = printArea.querySelector('.print-inner');
    const tblDom = printInner ? printInner.querySelector('table') : null;
    if (tblDom && printInner) {
        const domTableH = tblDom.offsetHeight;
        const domTableBottom = (tableElem ? (tableElem.y || 0) : 0) + domTableH;
        const footerDivs = printInner.querySelectorAll('[data-zone="footer"]');
        if (footerDivs.length > 0) {
            let minDomFooterTop = Infinity;
            footerDivs.forEach(div => {
                const topVal = parseFloat(div.style.top) || 0;
                if (topVal < minDomFooterTop) minDomFooterTop = topVal;
            });
            const safeGap = 15;
            if (domTableBottom + safeGap > minDomFooterTop) {
                const extraShift = (domTableBottom + safeGap) - minDomFooterTop;
                footerDivs.forEach(div => {
                    const curTop = parseFloat(div.style.top) || 0;
                    div.style.top = (curTop + extraShift) + 'px';
                });
                const curInnerH = parseFloat(printInner.style.height) || 0;
                printInner.style.height = (curInnerH + extraShift) + 'px';
            }
        }
    }

    requestAnimationFrame(() => {
        const container = printArea.querySelector('.print-container');
        const inner = printArea.querySelector('.print-inner');
        if (container && inner) {
            const availW = Math.max(280, printArea.clientWidth - 32);
            const sheetW = container.offsetWidth || canvasW;
            if (sheetW > availW) {
                const scale = availW / sheetW;
                container.style.transform = `scale(${scale})`;
                container.style.transformOrigin = 'top center';
                container.style.marginBottom = `-${Math.round((1 - scale) * container.offsetHeight)}px`;
            } else {
                container.style.transform = 'none';
                container.style.marginBottom = '0';
            }
        }
    });

    const pm = document.getElementById('print-modal');
    if (pm) {
        pm.style.display = 'flex';
        pm.classList.remove('hidden');
        pm.classList.add('flex');
    }
}

function closePrintModal() {
    const pm = document.getElementById('print-modal');
    if (pm) {
        pm.classList.add('hidden');
        pm.classList.remove('flex');
        pm.style.display = 'none';
    }
}

// Biến lưu cấu hình in hiện tại
var currentPrintPaperSize = "A4-portrait";
var currentPrintPageRule = "A4 portrait";

    // In hóa đơn trực tiếp qua Iframe cô lập (chuẩn POS: tự scale fit 1 trang A4/K80, không nhảy trang thừa)
function printInvoiceDirectly() {
    const printArea = document.getElementById('print-area');
    if (!printArea || !printArea.innerHTML.trim()) {
        window.print();
        return;
    }

    // Xóa iframe cũ nếu có
    const oldIframe = document.getElementById('pos-receipt-print-frame');
    if (oldIframe) {
        oldIframe.remove();
    }

    const isThermal = currentPrintPaperSize === 'K80' || currentPrintPaperSize === 'K58';
    const isLandscape = currentPrintPaperSize.includes('landscape') || currentPrintPageRule.includes('landscape');

    let pageRule = 'A4 landscape';
    if (isThermal) {
        pageRule = 'auto';
    } else if (!isLandscape) {
        pageRule = currentPrintPaperSize.includes('A5') ? 'A5 portrait' : 'A4 portrait';
    }

    const iframe = document.createElement('iframe');
    iframe.id = 'pos-receipt-print-frame';
    iframe.style.position = 'fixed';
    iframe.style.top = '-9999px';
    iframe.style.left = '-9999px';
    iframe.style.width = isThermal ? '350px' : (isLandscape ? '1150px' : '850px');
    iframe.style.height = isThermal ? '1000px' : (isLandscape ? '800px' : '1150px');
    iframe.style.border = 'none';
    iframe.style.zIndex = '-9999';
    document.body.appendChild(iframe);

    // Chuẩn bị nội dung in: trích xuất duy nhất tờ hóa đơn (.print-container)
    const containerClone = printArea.querySelector('.print-container') ? printArea.querySelector('.print-container').cloneNode(true) : null;
    const bannerClone = printArea.querySelector('.draft-watermark-banner') ? printArea.querySelector('.draft-watermark-banner').cloneNode(true) : null;

    if (!containerClone) {
        window.print();
        return;
    }

    // Gắn watermark nhỏ gọn trực tiếp bên trong đầu trang hóa đơn để không đội chiều cao
    if (bannerClone) {
        bannerClone.style.margin = '0 0 4px 0';
        bannerClone.style.padding = '4px 8px';
        bannerClone.style.fontSize = '11px';
        bannerClone.style.boxShadow = 'none';
        bannerClone.style.borderWidth = '1px';
        containerClone.insertBefore(bannerClone, containerClone.firstChild);
    }

    let isBoldAll = false;
    let boldCfg = null;
    try {
        boldCfg = window.printBoldConfigs || (window.companySettings && window.companySettings.print_bold_configs ? (typeof window.companySettings.print_bold_configs === 'string' ? JSON.parse(window.companySettings.print_bold_configs) : window.companySettings.print_bold_configs) : null);
    } catch(e) {}

    if (boldCfg) {
        if (window.currentPrintIsDraft) {
            isBoldAll = (boldCfg.pos_draft !== undefined) ? !!boldCfg.pos_draft : true;
        } else {
            isBoldAll = isThermal ? (boldCfg.pos_retail !== undefined ? !!boldCfg.pos_retail : true) : (boldCfg.pos_b2b !== undefined ? !!boldCfg.pos_b2b : false);
        }
    } else {
        isBoldAll = !!window.currentPrintIsBoldAll;
    }

    const boldStyles = isBoldAll ? `
                body, table, td, th, div, span, p, b, strong, h1, h2, h3, h4 {
                    font-weight: 900 !important;
                    color: #000 !important;
                    -webkit-text-stroke: 0.35px #000 !important;
                    text-shadow: 0 0 0.2px #000 !important;
                }
    ` : '';

    const doc = iframe.contentWindow.document;
    doc.open();
    doc.write(`
        <!DOCTYPE html>
        <html>
        <head>
            <meta charset="utf-8">
            <title>In Hóa Đơn</title>
            <style>
                ${isThermal ? '@page { size: auto; margin: 0mm; }' : `@page { size: ${pageRule}; margin: 0; }`}
                ${boldStyles}
                html, body {
                    margin: 0 !important;
                    padding: 0 !important;
                    background: white !important;
                    width: 100% !important;
                    height: 100% !important;
                    overflow: hidden !important;
                }
                * {
                    box-sizing: border-box;
                    -webkit-print-color-adjust: exact !important;
                    print-color-adjust: exact !important;
                }
                .print-container {
                    box-shadow: none !important;
                    border: none !important;
                    margin: 0 auto !important;
                    padding: 0 !important;
                    overflow: hidden !important;
                    page-break-after: avoid !important;
                    page-break-inside: avoid !important;
                    break-inside: avoid !important;
                    break-after: avoid !important;
                }
                .print-inner {
                    transform-origin: top center !important;
                    margin: 0 auto !important;
                    page-break-after: avoid !important;
                    page-break-inside: avoid !important;
                    break-inside: avoid !important;
                    break-after: avoid !important;
                }
            </style>
        </head>
        <body style="display: flex; justify-content: center; align-items: flex-start; margin: 0; padding: 0;">
            ${containerClone.outerHTML}
        </body>
        </html>
    `);
    doc.close();

    setTimeout(() => {
        try {
            const inner = doc.querySelector('.print-inner');
            const container = doc.querySelector('.print-container');
            if (inner && container && !isThermal) {
                // A4 landscape chiều cao tối đa an toàn: 720px
                const maxAvailableH = isLandscape ? 720 : 1050;
                const innerH = inner.scrollHeight || inner.offsetHeight;
                
                if (innerH > maxAvailableH) {
                    const scaleY = maxAvailableH / innerH;
                    inner.style.transform = "scale(" + (scaleY * 0.96) + ")";
                    inner.style.transformOrigin = 'top left';
                    container.style.height = (innerH * scaleY * 0.96) + 'px';
                }
            }

            iframe.contentWindow.focus();
            iframe.contentWindow.print();
        } catch (e) {
            console.error("Iframe print error:", e);
            window.print();
        }
    }, 250);
}

// ----------------------------------------------------
// NẠP VÍ SPA TẠI QUẦY POS (TOPUP MODAL & LOGIC)
// ----------------------------------------------------
// NẠP VÍ SPA (QUẦY POS & PHIẾU DỊCH VỤ SPA)
// ----------------------------------------------------
var _posTopupPackagesCache = [];
var _posSelectedTopupPkgId = null;

function getActiveTopupCustomer() {
    // 1. Nếu đang mở modal tiếp nhận dịch vụ Spa
    const svcModal = document.getElementById('modal-create-service-ticket');
    if (svcModal && !svcModal.classList.contains('hidden')) {
        const svcCustId = document.getElementById('svc-customer-id')?.value;
        if (svcCustId) {
            return (typeof allContacts !== 'undefined' ? allContacts : []).find(c => c.id == svcCustId) || null;
        }
        return null; // Đang ở trong modal Spa mà chưa chọn khách -> null, không fallback sang khách bên POS
    }
    // 2. Nếu đang ở tab POS bán lẻ
    const tab = (typeof getActiveTab === 'function') ? getActiveTab() : null;
    if (tab && tab.customer && tab.customer.id) return tab.customer;
    return null;
}

async function openTopupSpaModal() {
    const cust = getActiveTopupCustomer();
    if (!cust || !cust.id) {
        alert("Vui lòng chọn khách hàng trước khi nạp ví!");
        return;
    }

    const modal = document.getElementById('modal-topup-spa');
    if (!modal) return;

    modal.dataset.customerId = cust.id;
    document.getElementById('pos-topup-cust-name').innerText = `${cust.name} (${cust.phone || 'Không SĐT'})`;
    document.getElementById('pos-topup-current-balance').innerText = `${Number(cust.spa_wallet_balance || 0).toLocaleString('vi-VN')} đ`;
    document.getElementById('pos-topup-note').value = '';

    _posSelectedTopupPkgId = null;
    const pkgListEl = document.getElementById('pos-topup-packages-list');
    pkgListEl.innerHTML = '<div class="text-center text-slate-400 py-3">Đang tải gói nạp...</div>';
    modal.classList.remove('hidden');

    try {
        const res = await fetch('/api/topup/packages');
        const pkgs = await res.json();
        _posTopupPackagesCache = pkgs || [];
        if (!pkgs || pkgs.length === 0) {
            pkgListEl.innerHTML = '<div class="text-center text-slate-400 py-3">Chưa có gói nạp nào được kích hoạt.</div>';
            return;
        }

        pkgListEl.innerHTML = pkgs.map((pkg, idx) => `
            <label class="topup-pkg-item flex items-center justify-between p-2.5 border rounded-lg cursor-pointer hover:border-emerald-500 hover:bg-emerald-50/30 transition ${idx === 0 ? 'border-emerald-500 bg-emerald-50/40 ring-1 ring-emerald-400' : 'border-slate-200'}">
                <div class="flex items-center gap-2">
                    <input type="radio" name="pos_topup_pkg" value="${pkg.id}" ${idx === 0 ? 'checked' : ''} onchange="onSelectTopupPackageRadio(${pkg.id})" class="text-emerald-600 focus:ring-emerald-500">
                    <div>
                        <div class="font-bold text-slate-800 text-xs">${pkg.name}</div>
                        <div class="text-[11px] text-slate-500">Nộp: <strong class="text-slate-700">${Number(pkg.pay_amount).toLocaleString('vi-VN')} đ</strong></div>
                    </div>
                </div>
                <div class="text-right">
                    <span class="text-emerald-700 font-black text-xs block">+${Number(pkg.receive_amount).toLocaleString('vi-VN')} đ</span>
                    <span class="text-[10px] text-emerald-600 font-bold bg-emerald-100 px-1.5 py-0.5 rounded">Tặng +${Number(pkg.receive_amount - pkg.pay_amount).toLocaleString('vi-VN')} đ</span>
                </div>
            </label>
        `).join('');

        if (pkgs.length > 0) {
            _posSelectedTopupPkgId = pkgs[0].id;
        }
    } catch (e) {
        pkgListEl.innerHTML = '<div class="text-center text-rose-500 py-3">Lỗi tải danh sách gói nạp</div>';
    }
}

function onSelectTopupPackageRadio(pkgId) {
    _posSelectedTopupPkgId = pkgId;
    document.querySelectorAll('.topup-pkg-item').forEach(el => {
        const radio = el.querySelector('input[type="radio"]');
        if (radio && radio.checked) {
            el.classList.add('border-emerald-500', 'bg-emerald-50/40', 'ring-1', 'ring-emerald-400');
            el.classList.remove('border-slate-200');
        } else {
            el.classList.remove('border-emerald-500', 'bg-emerald-50/40', 'ring-1', 'ring-emerald-400');
            el.classList.add('border-slate-200');
        }
    });
}

var _lastTopupReceiptData = null;

function buildTopupReceiptHTML(data) {
    if (!data) return '';
    const shopName = (typeof posSettings !== 'undefined' && posSettings.shop_name) ? posSettings.shop_name : "PET NHA TRANG";
    const shopAddress = (typeof posSettings !== 'undefined' && posSettings.shop_address) ? posSettings.shop_address : "";
    const shopPhone = (typeof posSettings !== 'undefined' && posSettings.shop_phone) ? posSettings.shop_phone : "";
    const fmt = n => (Math.round(n) || 0).toLocaleString('vi-VN') + ' đ';

    const payMethodMap = {
        'cash': 'Tiền mặt',
        'transfer': 'Chuyển khoản ngân hàng',
        'bank': 'Chuyển khoản ngân hàng',
        'card': 'Quẹt thẻ'
    };
    const methodStr = payMethodMap[data.payment_method] || data.payment_method || 'Tiền mặt';

    return `
    <div class="print-container" style="font-family: 'Courier New', monospace, sans-serif; font-size: 13px; width: 290px; margin: 0 auto; color: #000; line-height: 1.45; padding: 10px; background: #fff;">
      <div style="text-align: center; border-bottom: 1px dashed #000; padding-bottom: 8px; margin-bottom: 8px;">
        <h2 style="margin: 0; font-size: 16px; font-weight: 900; text-transform: uppercase;">${shopName}</h2>
        ${shopAddress ? `<div style="font-size: 11px; margin-top: 2px;">${shopAddress}</div>` : ''}
        ${shopPhone ? `<div style="font-size: 11px;">Hotline: ${shopPhone}</div>` : ''}
        <div style="font-size: 15px; font-weight: 900; margin-top: 6px; text-transform: uppercase;">PHIẾU THU NẠP VÍ SPA</div>
        <div style="font-size: 10px; margin-top: 3px;">Thời gian: ${new Date().toLocaleString('vi-VN')}</div>
      </div>

      <div style="border-bottom: 1px dashed #000; padding-bottom: 6px; margin-bottom: 6px; font-size: 12px;">
        <div style="display: flex; justify-content: space-between; margin-bottom: 2px;">
          <span>Khách hàng:</span>
          <strong>${data.customer_name || '-'}</strong>
        </div>
        ${data.customer_phone ? `
        <div style="display: flex; justify-content: space-between; margin-bottom: 2px;">
          <span>SĐT:</span>
          <strong>${data.customer_phone}</strong>
        </div>` : ''}
        <div style="display: flex; justify-content: space-between; margin-bottom: 2px;">
          <span>Gói nạp:</span>
          <strong>${data.package_name || 'Nạp ví Spa'}</strong>
        </div>
        <div style="display: flex; justify-content: space-between; margin-bottom: 2px;">
          <span>Hình thức:</span>
          <span>${methodStr}</span>
        </div>
      </div>

      <div style="border-bottom: 1px dashed #000; padding-bottom: 6px; margin-bottom: 6px; font-size: 12px;">
        <div style="display: flex; justify-content: space-between; margin-bottom: 3px; font-weight: 900; font-size: 13px;">
          <span>TIỀN NỘP (THỰC THU):</span>
          <span>${fmt(data.pay_amount)}</span>
        </div>
        <div style="display: flex; justify-content: space-between; margin-bottom: 2px;">
          <span>Cộng vào ví:</span>
          <span>+${fmt(data.receive_amount)}</span>
        </div>
        <div style="display: flex; justify-content: space-between; margin-top: 4px; border-top: 1px dotted #888; padding-top: 3px; font-weight: 900; font-size: 13px;">
          <span>SỐ DƯ VÍ MỚI:</span>
          <span>${fmt(data.balance_after)}</span>
        </div>
      </div>

      ${data.note ? `
      <div style="font-size: 11px; margin-bottom: 6px; border-bottom: 1px dashed #000; padding-bottom: 4px;">
        <em>Ghi chú: ${data.note}</em>
      </div>` : ''}

      <div style="display: flex; justify-content: space-between; text-align: center; margin-top: 12px; padding-bottom: 24px;">
        <div style="flex: 1;">
          <strong style="font-size: 11px;">Khách hàng</strong><br><br><br>
          <span style="font-size: 10px;">(Ký & ghi rõ họ tên)</span>
        </div>
        <div style="flex: 1;">
          <strong style="font-size: 11px;">Thu ngân</strong><br><br><br>
          <span style="font-size: 10px;">(Ký & ghi rõ họ tên)</span>
        </div>
      </div>

      <div style="text-align: center; font-size: 10px; color: #555; border-top: 1px dashed #000; padding-top: 4px; padding-bottom: 18mm;">
        Cảm ơn quý khách đã tin dùng dịch vụ!
      </div>
    </div>
    `;
}

function printTopupReceiptDirectly(html) {
    if (!html) return;
    const oldIframe = document.getElementById('pos-topup-print-frame');
    if (oldIframe) oldIframe.remove();

    const iframe = document.createElement('iframe');
    iframe.id = 'pos-topup-print-frame';
    iframe.style.position = 'fixed';
    iframe.style.top = '-9999px';
    iframe.style.left = '-9999px';
    iframe.style.width = '350px';
    iframe.style.height = '1000px';
    iframe.style.border = 'none';
    iframe.style.zIndex = '-9999';
    document.body.appendChild(iframe);

    let isBoldTopup = true;
    try {
        const boldCfg = window.printBoldConfigs || (window.companySettings && window.companySettings.print_bold_configs ? (typeof window.companySettings.print_bold_configs === 'string' ? JSON.parse(window.companySettings.print_bold_configs) : window.companySettings.print_bold_configs) : null);
        if (boldCfg && boldCfg.pos_topup !== undefined) {
            isBoldTopup = !!boldCfg.pos_topup;
        }
    } catch(e) {}
    const boldStyles = isBoldTopup ? `
                body, table, td, th, div, span, p, b, strong, h1, h2, h3, h4 {
                    font-weight: 900 !important;
                    color: #000 !important;
                    -webkit-text-stroke: 0.35px #000 !important;
                    text-shadow: 0 0 0.2px #000 !important;
                }
    ` : '';

    const doc = iframe.contentWindow.document;
    doc.open();
    doc.write(`
        <!DOCTYPE html>
        <html>
        <head>
            <meta charset="utf-8">
            <title>Phiếu Thu Nạp Ví Spa</title>
            <style>
                @page { size: auto; margin: 0mm; }
                ${boldStyles}
                html, body {
                    margin: 0 !important;
                    padding: 0 !important;
                    background: white !important;
                    width: 100% !important;
                    overflow: hidden !important;
                }
                * {
                    box-sizing: border-box;
                    -webkit-print-color-adjust: exact !important;
                    print-color-adjust: exact !important;
                }
            </style>
        </head>
        <body style="display: flex; justify-content: center; align-items: flex-start; margin: 0; padding: 0;">
            ${html}
        </body>
        </html>
    `);
    doc.close();

    setTimeout(() => {
        try {
            iframe.contentWindow.focus();
            iframe.contentWindow.print();
        } catch (e) {
            console.error("Direct print error:", e);
            window.print();
        }
    }, 250);
}

function printTopupReceiptK80(data) {
    if (!data) return;
    closePrintModal();
    const html = buildTopupReceiptHTML(data);
    printTopupReceiptDirectly(html);
}

function printLastTopupReceipt() {
    if (_lastTopupReceiptData) {
        printTopupReceiptK80(_lastTopupReceiptData);
    } else {
        alert("Chưa có thông tin phiếu nạp gần nhất để in!");
    }
}

async function printHistoricalTopupReceipt(contactId, txId) {
    try {
        const res = await fetch(`/api/topup/history/${contactId}`);
        if (!res.ok) throw new Error("Lỗi tải lịch sử");
        const list = await res.json();
        const tx = list.find(item => item.id == txId);
        if (!tx) {
            alert("Không tìm thấy giao dịch nạp tiền!");
            return;
        }

        let custName = document.getElementById('pos-wallet-hist-cust-name')?.innerText || 'Khách hàng';
        let custPhone = document.getElementById('pos-wallet-hist-cust-phone')?.innerText.replace(/[()]/g, '') || '';

        let pkgName = tx.package_name || tx.note || 'Nạp ví Spa';
        let payAmount = tx.pay_amount;
        let receiveAmount = (tx.receive_amount !== undefined && tx.receive_amount !== null) ? tx.receive_amount : (tx.amount || 0);

        if (payAmount === undefined || payAmount === null) {
            if (tx.package_id && _posTopupPackagesCache && _posTopupPackagesCache.length > 0) {
                const pkg = _posTopupPackagesCache.find(p => p.id == tx.package_id);
                if (pkg) {
                    payAmount = pkg.pay_amount;
                    if (!receiveAmount) receiveAmount = pkg.receive_amount;
                    if (!tx.package_name) pkgName = pkg.name;
                }
            }
        }

        const receiptData = {
            customer_name: custName,
            customer_phone: custPhone,
            package_name: pkgName,
            payment_method: tx.payment_method || 'Tiền mặt',
            pay_amount: payAmount || 0,
            receive_amount: receiveAmount,
            balance_after: tx.balance_after || 0,
            note: tx.note || ''
        };
        printTopupReceiptK80(receiptData);
    } catch (e) {
        console.error("Print historical topup receipt error:", e);
        alert("Không thể in lại phiếu nạp tiền!");
    }
}

function closeTopupSpaModal() {
    const modal = document.getElementById('modal-topup-spa');
    if (modal) {
        modal.classList.add('hidden');
        delete modal.dataset.customerId;
    }
    const nameEl = document.getElementById('pos-topup-cust-name');
    if (nameEl) nameEl.innerText = '--';
    const balEl = document.getElementById('pos-topup-current-balance');
    if (balEl) balEl.innerText = '0 đ';
    const btnPrint = document.getElementById('btn-print-topup-k80');
    if (btnPrint) btnPrint.classList.add('hidden');
}

async function submitTopupSpaRecharge() {
    const modal = document.getElementById('modal-topup-spa');
    const targetCustId = modal?.dataset?.customerId;
    let cust = (typeof allContacts !== 'undefined' ? allContacts : []).find(c => c.id == targetCustId) || getActiveTopupCustomer();

    if (!cust || !cust.id) {
        alert("Vui lòng chọn khách hàng!");
        return;
    }
    if (!_posSelectedTopupPkgId) {
        alert("Vui lòng chọn một gói nạp!");
        return;
    }

    const payMethod = document.getElementById('pos-topup-pay-method')?.value || 'cash';
    const note = document.getElementById('pos-topup-note')?.value.trim() || '';

    const btn = document.getElementById('btn-confirm-recharge');
    if (btn) {
        btn.disabled = true;
        btn.innerText = "Đang xử lý nạp tiền...";
    }

    try {
        const body = {
            contact_id: cust.id,
            package_id: _posSelectedTopupPkgId,
            payment_method: payMethod,
            note: note,
            shift_id: (typeof currentShift !== 'undefined' && currentShift) ? currentShift.id : null
        };

        const res = await fetch('/api/topup/recharge', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body)
        });

        const data = await res.json();
        if (!res.ok) {
            alert("Lỗi nạp ví: " + (data.detail || "Không thành công"));
            return;
        }

        // Cập nhật số dư trong cust và allContacts
        cust.spa_wallet_balance = data.balance_after;
        if (typeof allContacts !== 'undefined') {
            const cAll = allContacts.find(c => c.id === cust.id);
            if (cAll) cAll.spa_wallet_balance = data.balance_after;
        }
        if (typeof posContacts !== 'undefined') {
            const pAll = posContacts.find(c => c.id === cust.id);
            if (pAll) pAll.spa_wallet_balance = data.balance_after;
        }

        // Cập nhật giao diện modal tiếp nhận dịch vụ Spa
        const previewWallet = document.getElementById('svc-preview-wallet');
        if (previewWallet) {
            previewWallet.textContent = Number(data.balance_after).toLocaleString('vi-VN') + ' đ';
        }
        const optWallet = document.getElementById('svc-opt-pay-wallet');
        if (optWallet) {
            optWallet.textContent = `💆 Trừ Ví Spa (Số dư: ${Number(data.balance_after).toLocaleString('vi-VN')} đ)`;
        }
        const batchOptWallet = document.getElementById('batch-opt-pay-wallet');
        if (batchOptWallet) {
            batchOptWallet.textContent = `💆 Trừ Ví Spa (Số dư: ${Number(data.balance_after).toLocaleString('vi-VN')} đ)`;
        }

        // Cập nhật tab POS bán lẻ nếu cùng khách hàng
        const tab = (typeof getActiveTab === 'function') ? getActiveTab() : null;
        if (tab && tab.customer && tab.customer.id === cust.id) {
            tab.customer.spa_wallet_balance = data.balance_after;
            if (typeof updateCustomerUI === 'function') updateCustomerUI(tab.customer);
            if (typeof updateFinancialSummary === 'function') updateFinancialSummary();
        }

        // Lấy thông tin gói nạp từ response hoặc cache để đảm bảo chính xác 100%
        const selectedPkg = (_posTopupPackagesCache || []).find(p => p.id == _posSelectedTopupPkgId);
        const pkgName = data.package_name || (selectedPkg ? selectedPkg.name : 'Nạp ví Spa');
        const payAmt = (data.pay_amount !== undefined && data.pay_amount !== null) ? Number(data.pay_amount) : (selectedPkg ? Number(selectedPkg.pay_amount) : 0);
        const receiveAmt = (data.receive_amount !== undefined && data.receive_amount !== null) ? Number(data.receive_amount) : (selectedPkg ? Number(selectedPkg.receive_amount) : Number(data.amount || 0));
        const balAfter = (data.balance_after !== undefined && data.balance_after !== null) ? Number(data.balance_after) : Number(cust.spa_wallet_balance || 0);

        // Lưu lại dữ liệu để in phiếu thu K80
        _lastTopupReceiptData = {
            customer_name: cust.name || 'Khách hàng',
            customer_phone: cust.phone || '',
            package_name: pkgName,
            payment_method: payMethod,
            pay_amount: payAmt,
            receive_amount: receiveAmt,
            balance_after: balAfter,
            note: note
        };

        const btnPrint = document.getElementById('btn-print-topup-k80');
        if (btnPrint) btnPrint.classList.remove('hidden');

        // Bỏ xem trước phiếu in: Tự động in trực tiếp qua máy in/iframe
        printTopupReceiptK80(_lastTopupReceiptData);

        // Đóng modal nạp ví
        closeTopupSpaModal();

        // Hiển thị thông báo chính xác số tiền nạp và số tiền nhận
        const msg = `✅ Nạp thành công [${pkgName}]!\n💰 Tiền nộp: ${payAmt.toLocaleString('vi-VN')} đ\n💆 Cộng vào ví: +${receiveAmt.toLocaleString('vi-VN')} đ\n💳 Số dư mới: ${balAfter.toLocaleString('vi-VN')} đ`;
        if (typeof showToast === 'function') {
            showToast(`Nạp thành công [${pkgName}]: Nộp ${payAmt.toLocaleString('vi-VN')}đ, Cộng ví +${receiveAmt.toLocaleString('vi-VN')}đ`, 'success');
        } else {
            alert(msg);
        }
    } catch (e) {
        console.error("Topup error:", e);
        alert("Lỗi kết nối khi nạp ví Spa!");
    } finally {
        if (btn) {
            btn.disabled = false;
            btn.innerHTML = "<span>⚡</span> <span>Xác Nhận Nạp Tiền</span>";
        }
    }
}

// ==========================================
// POS SPA WALLET TRANSACTION HISTORY
// ==========================================
async function showPosWalletHistory() {
    const cust = getActiveTopupCustomer();
    if (!cust || !cust.id) {
        alert("Vui lòng chọn khách hàng để xem lịch sử ví Spa!");
        return;
    }
    const modal = document.getElementById('modal-pos-wallet-history');
    if (!modal) return;

    document.getElementById('pos-wallet-hist-cust-name').innerText = cust.name || 'Khách hàng';
    document.getElementById('pos-wallet-hist-cust-phone').innerText = cust.phone ? `(${cust.phone})` : '';
    document.getElementById('pos-wallet-hist-current-balance').innerText = `${Number(cust.spa_wallet_balance || 0).toLocaleString('vi-VN')} đ`;

    const tbody = document.getElementById('pos-wallet-hist-table-body');
    tbody.innerHTML = '<tr><td colspan="5" class="p-4 text-center text-slate-400">Đang tải lịch sử ví...</td></tr>';
    modal.classList.remove('hidden');

    try {
        const res = await fetch(`/api/topup/history/${cust.id}`);
        if (!res.ok) throw new Error('Không thể tải lịch sử');
        const rows = await res.json();

        if (!rows || rows.length === 0) {
            tbody.innerHTML = '<tr><td colspan="5" class="p-4 text-center text-slate-400">Chưa có giao dịch biến động ví nào</td></tr>';
            return;
        }

        tbody.innerHTML = rows.map((r, idx) => {
            const isTopup = r.type === 'topup';
            const isSpend = r.type === 'spend';
            const typeLabel = isTopup ? '⚡ Nạp gói' : (isSpend ? '🛒 Chi tiêu bill' : 'Hoàn tiền');
            const typeBadge = isTopup
                ? '<span class="px-2 py-0.5 rounded text-[11px] font-bold bg-emerald-100 text-emerald-800">⚡ Nạp gói</span>'
                : (isSpend ? '<span class="px-2 py-0.5 rounded text-[11px] font-bold bg-rose-100 text-rose-800">🛒 Chi tiêu bill</span>' : '<span class="px-2 py-0.5 rounded text-[11px] font-bold bg-sky-100 text-sky-800">Hoàn tiền</span>');
            
            const sign = isTopup ? '+' : (isSpend ? '-' : '');
            const amountColor = isTopup ? 'text-emerald-600 font-bold' : (isSpend ? 'text-rose-600 font-bold' : 'text-sky-600 font-bold');
            const noteText = r.note || (isTopup && r.package_name ? `Gói ${r.package_name}` : (r.order_code ? `Đơn ${r.order_code}` : ''));

            let actionHtml = '-';
            if (isTopup) {
                actionHtml = `
                    <button type="button" onclick="printHistoricalTopupReceipt(${cust.id}, ${r.id})" 
                            class="px-2 py-0.5 rounded text-[11px] font-bold bg-sky-50 text-sky-700 hover:bg-sky-100 border border-sky-200 shadow-2xs transition" 
                            title="In lại phiếu thu nạp ví K80">
                        🖨️ In
                    </button>
                `;
            }

            return `
                <tr class="hover:bg-slate-50 border-b border-slate-100 text-xs">
                    <td class="p-2.5 text-slate-500 font-mono">${r.created_at || ''}</td>
                    <td class="p-2.5">${typeBadge}</td>
                    <td class="p-2.5 text-right font-mono ${amountColor}">${sign}${Number(r.amount || 0).toLocaleString('vi-VN')} đ</td>
                    <td class="p-2.5 text-right font-mono font-bold text-slate-700">${Number(r.balance_after || 0).toLocaleString('vi-VN')} đ</td>
                    <td class="p-2.5 text-slate-600">${noteText}</td>
                    <td class="p-2.5 text-center">${actionHtml}</td>
                </tr>
            `;
        }).join('');
    } catch (e) {
        console.error("Load pos wallet history error:", e);
        tbody.innerHTML = '<tr><td colspan="5" class="p-4 text-center text-rose-500">Lỗi khi tải lịch sử giao dịch ví</td></tr>';
    }
}

function closePosWalletHistory() {
    const modal = document.getElementById('modal-pos-wallet-history');
    if (modal) modal.classList.add('hidden');
}

window.showPosWalletHistory = showPosWalletHistory;
window.closePosWalletHistory = closePosWalletHistory;
window.printHistoricalTopupReceipt = printHistoricalTopupReceipt;
window.printLastTopupReceipt = printLastTopupReceipt;

window.openTopupSpaModal = openTopupSpaModal;
window.closeTopupSpaModal = closeTopupSpaModal;
window.onSelectTopupPackageRadio = onSelectTopupPackageRadio;
window.submitTopupSpaRecharge = submitTopupSpaRecharge;
window.toggleUseSpaWallet = toggleUseSpaWallet;

// Xuất các hàm điều khiển in ấn & thanh toán ra window
window.printDraftOrder = printDraftOrder;
window.submitPOSOrder = submitPOSOrder;
window.renderAndPrint = renderAndPrint;
window.showPrintModal = showPrintModal;
window.closePrintModal = closePrintModal;
window.printInvoiceDirectly = printInvoiceDirectly;

// Khởi chạy an toàn cùng SPA
window.initPOSModule = initPOS;
if (document.readyState === 'complete' || document.readyState === 'interactive') {
    setTimeout(() => { if (document.getElementById('tab-pos')) initPOS(); }, 50);
} else {
    document.addEventListener('DOMContentLoaded', () => {
        if (document.getElementById('tab-pos')) initPOS();
    });
}
