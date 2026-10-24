// pos.js - Logic dành riêng cho màn hình Bán Hàng chuyên dụng (POS)
(function ensurePOSCartGridStyle() {
    if (typeof document !== 'undefined' && !document.getElementById('pos-cart-grid-style')) {
        const style = document.createElement('style');
        style.id = 'pos-cart-grid-style';
        style.textContent = `
            @media (min-width: 768px) {
                .cart-grid-header,
                .cart-row-responsive {
                    display: grid !important;
                    grid-template-columns: 34px 34px 85px minmax(130px, 1fr) 48px 100px 175px 120px !important;
                    gap: 8px !important;
                }
            }
            @media (max-width: 767px) {
                .cart-row-responsive {
                    display: flex !important;
                    flex-wrap: wrap !important;
                    padding: 8px 10px !important;
                    gap: 6px !important;
                }
                .cart-row-responsive .row-desktop-only {
                    display: none !important;
                }
                .cart-row-responsive .item-name-col {
                    flex: 1 1 50%;
                    min-width: 140px;
                }
                .cart-row-responsive .qty-col {
                    order: 3;
                }
                .cart-row-responsive .price-col {
                    display: none !important;
                }
                .cart-row-responsive .subtotal-col {
                    order: 4;
                    margin-left: auto;
                }
            }
        `;
        document.head ? document.head.appendChild(style) : document.addEventListener('DOMContentLoaded', () => document.head.appendChild(style));
    }
})();

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
                    if (item.discount_val > 0 && info.applied_rule === 'base') {
                        item.applied_rule = 'base';
                        item.price_list_name = null;
                    } else {
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
let posIsLoading = false;
let posDataLoaded = false;
let posProductActiveIdx = -1;
let posCustomerActiveIdx = -1;
let posListenersInitialized = false;

function closeAllPosDropdowns() {
    document.getElementById('pos-search-dropdown')?.classList.add('hidden');
    document.getElementById('pos-customer-dropdown')?.classList.add('hidden');
    posProductActiveIdx = -1;
    posCustomerActiveIdx = -1;
}
window.closeAllPosDropdowns = closeAllPosDropdowns;

async function initPOS(force = false) {
    if (posIsLoading) return;
    if (typeof Auth !== 'undefined' && typeof Auth.getToken === 'function' && !Auth.getToken()) {
        return;
    }

    startClock();
    setupShortcuts();
    setupClickOutside();

    if (posDataLoaded && !force) {
        renderInvoiceTabs();
        renderActiveTabCart();
        return;
    }

    // Nếu đã có sẵn posProducts trước đó, render trước 0ms
    if (Array.isArray(posProducts) && posProducts.length > 0) {
        renderInvoiceTabs();
        renderActiveTabCart();
    }

    posIsLoading = true;
    try {
        const [prodRes, custRes, staffRes, setRes] = await Promise.all([
            fetch('/api/products?_t=' + Date.now()),
            fetch('/api/contacts?type=customer&_t=' + Date.now()),
            fetch('/api/staff?_t=' + Date.now()),
            fetch('/api/settings?_t=' + Date.now())
        ]);

        if (prodRes.ok) {
            const data = await prodRes.json();
            if (Array.isArray(data)) posProducts = data;
        }
        if (custRes.ok) {
            const data = await custRes.json();
            if (Array.isArray(data)) posContacts = data;
        }
        if (staffRes.ok) {
            const data = await staffRes.json();
            if (Array.isArray(data)) posStaff = data;
        }
        if (setRes.ok) {
            const data = await setRes.json();
            if (data && typeof data === 'object') posSettings = data;
        }

        // Tải danh sách tài khoản thanh toán cho POS
        fetch('/api/payment-accounts?_t=' + Date.now()).then(r => r.ok ? r.json() : []).then(accs => {
            window.posPaymentAccounts = accs || [];
            updatePosPaymentAccountsUI();
        }).catch(err => console.error(err));

        // Lưu danh sách bảng giá để POS sử dụng khi chọn khách/bảng giá
        fetch('/api/price-lists?_t=' + Date.now()).then(r => r.ok ? r.json() : []).then(pls => {
            if (Array.isArray(pls)) {
                window.posPriceLists = pls;
            }
        }).catch(err => console.error(err));

        // Tải các quy tắc khuyến mãi đang chạy (bao gồm Mua X Tặng Y)
        fetch('/api/promotions/active-rules?_t=' + Date.now()).then(r => r.ok ? r.json() : []).then(rules => {
            window.posActivePromoRules = rules || [];
            if (typeof syncBuyXGetYPromotionsInCart === 'function') {
                syncBuyXGetYPromotionsInCart();
            }
        }).catch(err => console.error(err));

        const curTab = getActiveTab();
        if (curTab && curTab.customer && curTab.customer.price_list_id) {
            await getPriceListMap(curTab.customer.price_list_id, true);
            applyPriceListToCart(curTab);
        }

        initPrintTemplatesFromSettings();
        renderStaffOptions();
        renderMobileCatalog();
        await restoreDraftIfAny();
        renderInvoiceTabs();
        renderActiveTabCart();
        // Chỉ đánh dấu đã tải khi API thật sự OK; 401 (token hết hạn) phải cho nạp lại sau khi đăng nhập
        posDataLoaded = !!(prodRes.ok && setRes.ok);
    } catch (e) {
        console.error("Lỗi khi tải dữ liệu POS:", e);
    } finally {
        posIsLoading = false;
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
    const staffList = Array.isArray(posStaff) ? posStaff : [];
    select.innerHTML = staffList.map(s => `<option value="${s.id}">${s.name}</option>`).join('');
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
        renderMobileCatalog();
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
// Tự động inject CSS cho dòng đang chọn: Nền xanh đậm chữ trắng nổi bật (chuẩn 2a)
if (typeof document !== 'undefined' && document.head && typeof document.head.appendChild === 'function' && !document.getElementById('pos-dropdown-nav-style')) {
    const st = document.createElement('style');
    st.id = 'pos-dropdown-nav-style';
    st.textContent = `
        .pos-product-item.active, .pos-customer-item.active {
            background-color: #0284c7 !important; /* sky-600 */
            color: #ffffff !important;
        }
        .pos-product-item.active *, .pos-customer-item.active * {
            color: #ffffff !important;
        }
        .pos-product-item.active span, .pos-customer-item.active span {
            border-color: rgba(255, 255, 255, 0.4) !important;
        }
    `;
    document.head.appendChild(st);
}

function setProductActiveItem(idx) {
    const dropdown = document.getElementById('pos-search-dropdown');
    if (!dropdown) return;
    const items = dropdown.querySelectorAll('.pos-product-item');
    if (items.length === 0) return;

    posProductActiveIdx = idx;
    items.forEach((item, i) => {
        if (i === posProductActiveIdx) {
            item.classList.add('active');
            item.scrollIntoView({ block: 'nearest' });
        } else {
            item.classList.remove('active');
        }
    });
}
window.setProductActiveItem = setProductActiveItem;

function setCustomerActiveItem(idx) {
    const dropdown = document.getElementById('pos-customer-dropdown');
    if (!dropdown) return;
    const items = dropdown.querySelectorAll('.pos-customer-item');
    if (items.length === 0) return;

    posCustomerActiveIdx = idx;
    items.forEach((item, i) => {
        if (i === posCustomerActiveIdx) {
            item.classList.add('active');
            item.scrollIntoView({ block: 'nearest' });
        } else {
            item.classList.remove('active');
        }
    });
}
window.setCustomerActiveItem = setCustomerActiveItem;

function handleProductSearchKeydown(e) {
    const dropdown = document.getElementById('pos-search-dropdown');
    if (!dropdown) return;

    if (e.key === 'ArrowDown') {
        e.preventDefault();
        if (dropdown.classList.contains('hidden')) {
            filterProductSearch(e.target.value);
        }
        const items = dropdown.querySelectorAll('.pos-product-item');
        if (items.length === 0) return;
        const nextIdx = (posProductActiveIdx + 1) % items.length;
        setProductActiveItem(nextIdx);
    } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        if (dropdown.classList.contains('hidden')) {
            filterProductSearch(e.target.value);
        }
        const items = dropdown.querySelectorAll('.pos-product-item');
        if (items.length === 0) return;
        const prevIdx = posProductActiveIdx <= 0 ? items.length - 1 : posProductActiveIdx - 1;
        setProductActiveItem(prevIdx);
    } else if (e.key === 'Enter') {
        e.preventDefault();
        const items = dropdown.querySelectorAll('.pos-product-item');
        if (!dropdown.classList.contains('hidden') && posProductActiveIdx >= 0 && items[posProductActiveIdx]) {
            items[posProductActiveIdx].click();
            closeAllPosDropdowns();
        } else {
            handleBarcodeOrSelectFirst(e.target.value);
            closeAllPosDropdowns();
        }
    } else if (e.key === 'Escape') {
        e.preventDefault();
        closeAllPosDropdowns();
    }
}
window.handleProductSearchKeydown = handleProductSearchKeydown;

function handleCustomerSearchKeydown(e) {
    const dropdown = document.getElementById('pos-customer-dropdown');
    if (!dropdown) return;

    if (e.key === 'ArrowDown') {
        e.preventDefault();
        if (dropdown.classList.contains('hidden')) {
            filterCustomerSearch(e.target.value);
        }
        const items = dropdown.querySelectorAll('.pos-customer-item');
        if (items.length === 0) return;
        const nextIdx = (posCustomerActiveIdx + 1) % items.length;
        setCustomerActiveItem(nextIdx);
    } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        if (dropdown.classList.contains('hidden')) {
            filterCustomerSearch(e.target.value);
        }
        const items = dropdown.querySelectorAll('.pos-customer-item');
        if (items.length === 0) return;
        const prevIdx = posCustomerActiveIdx <= 0 ? items.length - 1 : posCustomerActiveIdx - 1;
        setCustomerActiveItem(prevIdx);
    } else if (e.key === 'Enter') {
        e.preventDefault();
        const items = dropdown.querySelectorAll('.pos-customer-item');
        if (!dropdown.classList.contains('hidden')) {
            if (posCustomerActiveIdx >= 0 && items[posCustomerActiveIdx]) {
                items[posCustomerActiveIdx].click();
            } else if (items.length > 0) {
                items[0].click();
            }
        }
        closeAllPosDropdowns();
    } else if (e.key === 'Escape') {
        e.preventDefault();
        closeAllPosDropdowns();
    }
}
window.handleCustomerSearchKeydown = handleCustomerSearchKeydown;

function setupShortcuts() {
    if (posListenersInitialized) return;
    posListenersInitialized = true;

    document.addEventListener('keydown', (e) => {
        const tabPos = document.getElementById('tab-pos');
        const isPosActive = tabPos && !tabPos.classList.contains('hidden');
        const tabSpa = document.getElementById('tab-pet-services');
        const isSpaActive = tabSpa && !tabSpa.classList.contains('hidden');

        // Phím tắt F2 Tiếp nhận dịch vụ trên tab Spa & Grooming
        if (isSpaActive) {
            if (e.key === 'F2') {
                const anyModalOpen = document.querySelector('.fixed.inset-0:not(.hidden)');
                if (!anyModalOpen && typeof openCreateServiceTicketModal === 'function') {
                    e.preventDefault();
                    openCreateServiceTicketModal();
                }
            }
            return;
        }

        // Phím tắt F3 (Thêm NV Lương) và F4 (Cấp nhanh TK) trên tab Chấm Công & Lương (HRM)
        const tabHrm = document.getElementById('tab-hrm');
        const isHrmActive = tabHrm && !tabHrm.classList.contains('hidden');
        if (isHrmActive) {
            if (e.key === 'F3') {
                const anyModalOpen = document.querySelector('.fixed.inset-0:not(.hidden)');
                if (!anyModalOpen && typeof openHrmStaffModal === 'function') {
                    e.preventDefault();
                    openHrmStaffModal();
                }
            } else if (e.key === 'F4') {
                const anyModalOpen = document.querySelector('.fixed.inset-0:not(.hidden)');
                if (!anyModalOpen && typeof openHrmQuickAccountModal === 'function') {
                    e.preventDefault();
                    openHrmQuickAccountModal();
                }
            }
            return;
        }

        if (!isPosActive) return; // Khóa phím tắt khi không ở tab POS
        if (e.key === 'F1') {
            e.preventDefault();
            addNewInvoiceTab();
        } else if (e.key === 'F2') {
            e.preventDefault();
            // Đổi tab hóa đơn kế tiếp
            if (Array.isArray(invoiceTabs) && invoiceTabs.length > 1) {
                const curIdx = invoiceTabs.findIndex(t => t.id === activeTabId);
                const nextIdx = (curIdx + 1) % invoiceTabs.length;
                switchInvoiceTab(invoiceTabs[nextIdx].id);
            }
        } else if (e.key === 'F3') {
            e.preventDefault();
            document.getElementById('pos-customer-dropdown')?.classList.add('hidden');
            posCustomerActiveIdx = -1;
            const pInp = document.getElementById('pos-search-input');
            if (pInp) {
                pInp.focus();
                pInp.select();
                filterProductSearch(pInp.value);
            }
        } else if (e.key === 'F4') {
            e.preventDefault();
            document.getElementById('pos-search-dropdown')?.classList.add('hidden');
            posProductActiveIdx = -1;
            const cInp = document.getElementById('pos-customer-search');
            if (cInp) {
                cInp.focus();
                cInp.select();
                filterCustomerSearch(cInp.value);
            }
        } else if (e.key === 'F8') {
            e.preventDefault();
            // Toggle hoặc chọn phương thức thanh toán
            const activeMethodBtn = document.querySelector('.pos-pay-method-btn:not(.bg-white)');
            const allMethodBtns = document.querySelectorAll('.pos-pay-method-btn');
            if (allMethodBtns.length > 0) {
                let nextIdx = 0;
                if (activeMethodBtn) {
                    const idx = Array.from(allMethodBtns).indexOf(activeMethodBtn);
                    nextIdx = (idx + 1) % allMethodBtns.length;
                }
                allMethodBtns[nextIdx].click();
            }
        } else if (e.key === 'F9' || (e.ctrlKey && e.key === 'Enter')) {
            e.preventDefault();
            submitPOSOrder();
        }
    });

    // Xử lý tìm kiếm & gợi ý khi click/focus hoặc gõ phím
    const searchInput = document.getElementById('pos-search-input');
    if (searchInput) {
        searchInput.addEventListener('input', (e) => filterProductSearch(e.target.value));
        searchInput.addEventListener('focus', (e) => {
            document.getElementById('pos-customer-dropdown')?.classList.add('hidden');
            posCustomerActiveIdx = -1;
            filterProductSearch(e.target.value);
        });
        searchInput.addEventListener('click', (e) => {
            document.getElementById('pos-customer-dropdown')?.classList.add('hidden');
            posCustomerActiveIdx = -1;
            filterProductSearch(e.target.value);
        });
        searchInput.addEventListener('keydown', handleProductSearchKeydown);
        searchInput.addEventListener('focusout', () => {
            setTimeout(() => {
                const dd = document.getElementById('pos-search-dropdown');
                if (dd && !dd.contains(document.activeElement)) {
                    dd.classList.add('hidden');
                    posProductActiveIdx = -1;
                }
            }, 150);
        });
    }

    const custSearch = document.getElementById('pos-customer-search');
    if (custSearch) {
        custSearch.addEventListener('input', (e) => filterCustomerSearch(e.target.value));
        custSearch.addEventListener('focus', (e) => {
            document.getElementById('pos-search-dropdown')?.classList.add('hidden');
            posProductActiveIdx = -1;
            filterCustomerSearch(e.target.value);
        });
        custSearch.addEventListener('click', (e) => {
            document.getElementById('pos-search-dropdown')?.classList.add('hidden');
            posProductActiveIdx = -1;
            filterCustomerSearch(e.target.value);
        });
        custSearch.addEventListener('keydown', handleCustomerSearchKeydown);
        custSearch.addEventListener('focusout', () => {
            setTimeout(() => {
                const dd = document.getElementById('pos-customer-dropdown');
                if (dd && !dd.contains(document.activeElement)) {
                    dd.classList.add('hidden');
                    posCustomerActiveIdx = -1;
                }
            }, 150);
        });
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
            posProductActiveIdx = -1;
        }
        if (!e.target.closest('#pos-customer-search') && !e.target.closest('#pos-customer-dropdown')) {
            document.getElementById('pos-customer-dropdown')?.classList.add('hidden');
            posCustomerActiveIdx = -1;
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

async function closeInvoiceTab(e, tabId) {
    e.stopPropagation();
    const tab = invoiceTabs.find(t => t.id === tabId);
    if (tab && tab.cart.length > 0) {
        let confirmed = true;
        if (typeof window.showConfirmModal === 'function') {
            confirmed = await window.showConfirmModal({
                title: `Đóng Hóa Đơn: ${tab.name}`,
                message: `Hóa đơn "${tab.name}" đang có sản phẩm trong giỏ hàng. Bạn có chắc muốn đóng?`,
                subMessage: `Dữ liệu sản phẩm đang chọn trong hóa đơn này sẽ bị hủy bỏ.`,
                confirmText: 'Đóng Hóa Đơn',
                cancelText: 'Quay lại',
                type: 'warning',
                icon: '⚠️'
            });
        } else {
            confirmed = confirm(`Hóa đơn "${tab.name}" đang có sản phẩm. Bạn có chắc muốn đóng?`);
        }
        if (!confirmed) return;
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

    posProductActiveIdx = -1;
    document.getElementById('pos-customer-dropdown')?.classList.add('hidden');
    posCustomerActiveIdx = -1;

    let matches = [];
    const isSuggestion = !q;

    if (isSuggestion) {
        matches = (posProducts || []).filter(p => p && p.type !== 'material').slice(0, 10);
    } else {
        matches = (posProducts || []).filter(p => {
            if (!p || p.type === 'material') return false;
            const text = `${p.name || ''} ${p.code || ''}`;
            return fuzzyMatch(q, text);
        }).slice(0, 10);
    }

    const total = matches.length;
    if (total === 0) {
        dropdown.innerHTML = isSuggestion
            ? '<div class="p-3 text-center text-xs text-slate-400 italic">Chưa có hàng hóa nào</div>'
            : '<div class="p-3 text-center text-xs text-slate-400 italic">Không tìm thấy hàng hóa phù hợp</div>';
        dropdown.classList.remove('hidden');
        return;
    }

    const header = isSuggestion ? `
        <div class="px-3 py-1.5 bg-slate-50 border-b border-slate-100 flex items-center justify-between text-[11px] font-bold text-slate-500">
            <span class="flex items-center gap-1">✨ 10 mặt hàng gợi ý</span>
            <span class="text-[10px] text-slate-400 font-normal">Gõ từ khóa để tìm thêm</span>
        </div>
    ` : '';

    dropdown.innerHTML = header + matches.map((p, idx) => {
        const clickHandler = `addProductToActiveCart(${p.id})`;
        const isCombo = p.type === 'combo';
        const typeLabel = isCombo ? '<span class="text-[10px] font-bold text-amber-600 bg-amber-50 px-1 rounded mr-1 border border-amber-200">COMBO</span>' : '';
        const comboHint = isCombo && p.combo_summary ? `<div class="text-[10px] text-amber-700 italic truncate max-w-xs mt-0.5">📦 Gồm: ${p.combo_summary}</div>` : '';
        return `
        <div onclick="${clickHandler}" onmouseenter="setProductActiveItem(${idx})" data-product-id="${p.id}" class="pos-product-item p-2.5 hover:bg-sky-50 cursor-pointer border-b last:border-0 flex justify-between items-center transition text-xs">
            <div>
                <span class="font-mono text-[11px] text-slate-400 font-bold mr-1.5">[${p.code || '-'}]</span>
                ${typeLabel}
                <span class="font-bold text-slate-800">${p.name}</span>
                <span class="text-slate-400 text-[11px] ml-1">(${p.unit || 'cái'})</span>
                ${comboHint}
            </div>
            <div class="text-right shrink-0 ml-2">
                <div class="font-bold text-sky-600">${formatMoney(p.sell_price)}</div>
                <div class="text-[10px] text-slate-400">Tồn: ${p.type === 'service' ? '∞' : (isCombo ? 'Gói' : (p.stock || 0))}</div>
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
    const exist = tab.cart.find(item => item.product_id === productId && !item.is_gift);

    if (exist) {
        exist.quantity += 1;
    } else {
        const itemPrice = getProductPriceForTab(tab, p);
        const hasCustomPrice = itemPrice !== p.sell_price;
        const isCombo = p.type === 'combo';
        tab.cart.push({
            product_id: p.id,
            code: p.code,
            name: p.name,
            type: p.type || 'product',
            is_combo: isCombo,
            combo_summary: p.combo_summary || '',
            unit: p.unit || (isCombo ? 'combo' : 'cái'),
            original_price: p.sell_price,
            price: itemPrice,
            price_list_name: hasCustomPrice ? (tab.customer?.price_list_name || null) : null,
            discount_val: 0,
            discount_type: 'vnd',
            vat_rate: p.vat_rate !== undefined && p.vat_rate !== null ? p.vat_rate : 0,
            quantity: 1,
            base_unit: p.unit || (isCombo ? 'combo' : 'cái'),
            base_price: p.sell_price || 0,
            unit_ratio: 1,
            units: Array.isArray(p.units) ? p.units : []
        });
    }

    // Đóng dropdown & clear search input
    const searchInput = document.getElementById('pos-search-input');
    if (searchInput) searchInput.value = '';
    document.getElementById('pos-search-dropdown')?.classList.add('hidden');

    try {
        await recalculateBestOfferForCart(tab);
    } catch (e) {
        console.warn("recalculateBestOfferForCart error:", e);
    }

    renderInvoiceTabs();
    renderActiveTabCart();
}

function syncBuyXGetYPromotionsInCart(tab = null) {
    if (!tab) tab = getActiveTab();
    if (!tab || !tab.cart || !Array.isArray(window.posActivePromoRules)) return;

    const buyGetRules = window.posActivePromoRules.filter(r => r && (r.promo_type === 'buy_x_get_y' || r.buy_qty > 1 || r.gift_product_id));
    if (buyGetRules.length === 0) return;

    // 1. Dọn dẹp các món quà tặng cũ trước khi tính lại (giữ lại quà tặng thủ công)
    tab.cart = tab.cart.filter(item => !item.is_gift || item.is_manual_gift);

    // 2. Quét số lượng từng sản phẩm thường
    buyGetRules.forEach(rule => {
        const buyProdId = rule.product_id;
        const buyQtyReq = rule.buy_qty || 1;
        const giftQtyPerMatch = rule.gift_qty || 1;
        const isMultiply = rule.is_multiply !== 0;

        const cartBuyItem = tab.cart.find(i => i.product_id === buyProdId && !i.is_gift);
        if (cartBuyItem && cartBuyItem.quantity >= buyQtyReq) {
            const matches = isMultiply ? Math.floor(cartBuyItem.quantity / buyQtyReq) : 1;
            const totalGiftQty = matches * giftQtyPerMatch;

            if (totalGiftQty > 0) {
                // Tặng cùng loại hoặc khác loại
                const targetGiftProdId = rule.gift_product_id || buyProdId;
                const giftProdData = (posProducts || []).find(p => p.id === targetGiftProdId) || cartBuyItem;

                tab.cart.push({
                    product_id: targetGiftProdId,
                    code: giftProdData.code || cartBuyItem.code,
                    name: `🎁 [QUÀ TẶNG] ${giftProdData.name}`,
                    unit: giftProdData.unit || 'cái',
                    price: 0,
                    original_price: giftProdData.sell_price || 0,
                    quantity: totalGiftQty,
                    is_gift: true,
                    gift_promo_name: rule.promo_name || 'Khuyến mãi Mua X Tặng Y',
                    discount_val: 0,
                    discount_type: 'vnd',
                    vat_rate: giftProdData.vat_rate || 0,
                    base_unit: giftProdData.unit || 'cái',
                    base_price: giftProdData.sell_price || 0,
                    unit_ratio: 1,
                    units: Array.isArray(giftProdData.units) ? giftProdData.units : []
                });
            }
        }
    });
}

// ----------------------------------------------------
// HIỂN THỊ DANH SÁCH SẢN PHẨM TRONG GIỎ (MỖI MÓN 1 DÒNG)
// ----------------------------------------------------
function renderActiveTabCart() {
    try {
        const tab = getActiveTab();
        if (!tab) return;
        if (typeof syncBuyXGetYPromotionsInCart === 'function') {
            try { syncBuyXGetYPromotionsInCart(tab); } catch (e) { console.warn("syncBuyXGetY error:", e); }
        }
        const container = document.getElementById('cart-items-container');
        if (!container) return;
        scheduleDraftSave();

        // Cập nhật ô ghi chú
        const noteInput = document.getElementById('pos-order-note');
        if (noteInput) noteInput.value = tab.note || '';

        // Cập nhật thông tin khách hàng
        try { updateCustomerUI(tab.customer); } catch (e) { console.warn("updateCustomerUI error:", e); }

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
            const itemPrice = typeof item.price === 'number' ? item.price : (parseFloat(item.price) || 0);
            const itemOriginalPrice = typeof item.original_price === 'number' ? item.original_price : (parseFloat(item.original_price) || itemPrice);
            const itemQty = typeof item.quantity === 'number' ? item.quantity : (parseFloat(item.quantity) || 1);
            const itemSubtotal = itemQty * itemPrice;
            const itemDiscountVal = typeof item.discount_val === 'number' ? item.discount_val : (parseFloat(item.discount_val) || 0);
            const hasDiscount = itemDiscountVal > 0;
            const discountText = item.discount_type === 'pct' 
                ? `-${itemDiscountVal}%` 
                : `-${formatMoney(itemDiscountVal)}`;

            const isComboItem = !!(item.is_combo || item.type === 'combo');
            const comboBadge = isComboItem ? '<span class="text-[10px] font-bold text-amber-600 bg-amber-50 px-1 rounded mr-1 border border-amber-200">COMBO</span>' : '';
            const manualGiftBadge = item.is_manual_gift 
                ? '<span class="px-1.5 py-0.2 rounded text-[10px] font-black bg-emerald-100 text-emerald-800 border border-emerald-300 mr-1">🎁 QUÀ TẶNG</span>' 
                : '';

            const comboSummaryText = item.combo_summary || (posProducts.find(x => x.id === item.product_id)?.combo_summary) || '';
            const comboSubLine = isComboItem && comboSummaryText ? `<div class="text-[10px] text-amber-700 font-medium italic mt-0.5 truncate" title="Gồm: ${comboSummaryText}">📦 Gồm: ${comboSummaryText}</div>` : '';

            const baseUnit = item.base_unit || item.unit || 'cái';
            const extraUnits = Array.isArray(item.units) ? item.units : [];
            const unitRatio = typeof item.unit_ratio === 'number' ? item.unit_ratio : (parseFloat(item.unit_ratio) || 1);
            const unitCell = extraUnits.length
                ? `<select onchange="changeItemUnit(${idx}, this.value)" class="border border-indigo-200 bg-indigo-50/50 rounded px-1 py-0.5 text-[11px] font-semibold text-indigo-800 cursor-pointer focus:outline-none focus:ring-1 focus:ring-indigo-400">
                       <option value="1" ${unitRatio == 1 ? 'selected' : ''}>${baseUnit}</option>
                       ${extraUnits.map(u => `<option value="${u.ratio}" ${unitRatio == u.ratio ? 'selected' : ''}>${u.unit_name}</option>`).join('')}
                   </select>`
                : baseUnit;

            // Hiện quy đổi ra đơn vị cơ bản khi đang bán theo thùng/lốc
            const convHint = (unitRatio && unitRatio != 1)
                ? `<div class="text-[10px] text-indigo-600 font-semibold">= ${(itemQty * unitRatio).toLocaleString('vi-VN')} ${baseUnit}</div>`
                : '';

            return `
                <div class="cart-row-responsive px-3 md:px-4 py-2 md:py-2.5 grid gap-1.5 md:gap-2 items-center text-xs bg-white rounded-xl border border-slate-200/80 shadow-xs hover:border-slate-300 transition group card-row-anim select-none" style="--row-idx: ${idx};">
                    <!-- Nút xóa -->
                    <div class="text-center">
                        <button onclick="removeCartItem(${idx})" class="text-slate-400 hover:text-rose-600 p-1.5 rounded-lg hover:bg-rose-50 transition inline-flex items-center justify-center cursor-pointer" title="Xóa khỏi đơn">
                            <svg class="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18"/><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/><line x1="10" x2="10" y1="11" y2="17"/><line x1="14" x2="14" y1="11" y2="17"/></svg>
                        </button>
                    </div>

                    <!-- STT -->
                    <div class="text-center font-bold text-slate-400 row-desktop-only">${idx + 1}</div>

                    <!-- Mã hàng -->
                    <div class="font-mono font-bold text-slate-600 text-[11px] truncate row-desktop-only" title="${item.code || '-'}">
                        ${item.code || '-'}
                    </div>

                    <!-- Tên hàng hóa -->
                    <div class="font-semibold text-slate-800 line-clamp-1 item-name-col" title="${item.name}">
                        ${comboBadge}${manualGiftBadge}${item.name}
                        ${comboSubLine}
                    </div>

                    <!-- ĐVT (dropdown khi mặt hàng có đơn vị quy đổi, vd Thùng = 16 Chai) -->
                    <div class="text-center text-slate-500 text-[11px] row-desktop-only">
                        ${unitCell}
                    </div>

                    <!-- Số lượng (Bộ nút + -) -->
                    <div class="qty-col">
                        <div class="flex items-center justify-center gap-1">
                            <button onclick="changeItemQty(${idx}, -1)" class="w-7 h-7 md:w-5 md:h-5 flex items-center justify-center rounded bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-sm md:text-xs active:bg-slate-200">-</button>
                            <input type="number" min="1" value="${itemQty}" 
                                   onchange="updateItemQtyDirect(${idx}, this.value)"
                                   class="w-10 text-center font-bold text-slate-800 border border-slate-200 rounded py-1 md:py-0.5 text-xs focus:outline-none focus:ring-1 focus:ring-sky-500">
                            <button onclick="changeItemQty(${idx}, 1)" class="w-7 h-7 md:w-5 md:h-5 flex items-center justify-center rounded bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-sm md:text-xs active:bg-slate-200">+</button>
                        </div>
                        ${(!item.is_gift && itemQty >= 2) ? `
                        <div class="mt-1 flex justify-center">
                            <button onclick="splitCartItemToGift(${idx}, 1)" class="px-1.5 py-0.5 rounded text-[10px] font-bold bg-amber-50 hover:bg-amber-100 text-amber-700 border border-amber-200 shadow-2xs transition inline-flex items-center gap-0.5" title="Tách 1 cái làm quà tặng 0đ"><span>🎁</span> Tách tặng</button>
                        </div>` : ''}
                        ${item.is_manual_gift ? `
                        <div class="mt-1 flex justify-center">
                            <button onclick="mergeManualGiftItem(${idx})" class="px-1.5 py-0.5 rounded text-[10px] font-bold bg-slate-100 hover:bg-slate-200 text-slate-700 border border-slate-300 shadow-2xs transition" title="Gộp lại vào dòng bán thường">🔄 Gộp lại</button>
                        </div>` : ''}
                        ${convHint}
                    </div>

                    <!-- Đơn giá & Giảm giá (Click vào để mở popup sửa) -->
                    <div class="text-right cursor-pointer price-col flex flex-col items-end justify-center select-none" onclick="openItemPriceModal(${idx})" title="Bấm để sửa đơn giá & chiết khấu">
                        <!-- Dòng 1: Giá bán thực tế + Badge + Bút -->
                        <div class="font-bold text-slate-800 hover:text-sky-600 flex items-center justify-end gap-1 flex-nowrap leading-tight">
                            <span class="font-bold text-slate-800 text-xs">${formatMoney(itemPrice)}</span>
                            ${(item.vat_rate && item.vat_rate > 0) ? `<span class="inline-flex items-center px-1 py-0.2 rounded text-[9px] font-bold bg-sky-50 text-sky-700 border border-sky-200 shrink-0">VAT ${item.vat_rate}%</span>` : ''}
                            ${itemPrice !== itemOriginalPrice ? `<span class="inline-flex items-center px-1 py-0.2 rounded text-[9px] font-bold bg-amber-50 text-amber-700 border border-amber-200 shrink-0">🏷️ ${item.price_list_name || 'Giá riêng'}</span>` : ''}
                            <span class="opacity-0 group-hover:opacity-100 text-sky-500 text-[10px]">✏️</span>
                        </div>
                        <!-- Dòng 2: Giá niêm yết cũ & mức giảm đỏ (thẳng hàng bên dưới, không lấn sang trái) -->
                        ${(itemPrice !== itemOriginalPrice || hasDiscount) ? `
                            <div class="flex items-center justify-end gap-1 text-[10px] leading-tight mt-0.5 whitespace-nowrap">
                                ${itemPrice !== itemOriginalPrice ? `<span class="text-slate-400 line-through font-normal text-[10px]">${formatMoney(itemOriginalPrice)}</span>` : ''}
                                ${hasDiscount ? `<span class="text-rose-500 font-bold">${discountText}</span>` : ''}
                            </div>
                        ` : ''}
                    </div>

                    <!-- Thành tiền -->
                    <div class="text-right font-black text-sky-700 text-sm whitespace-nowrap subtotal-col">
                        ${formatMoney(itemSubtotal)}
                    </div>
                </div>
            `;
        }).join('');

        const mobileCartBadge = document.getElementById('mobile-cart-badge');
        if (mobileCartBadge) {
            const totalQty = tab.cart ? tab.cart.reduce((s, i) => s + (Number(i.quantity) || 0), 0) : 0;
            mobileCartBadge.innerText = `${totalQty} món`;
        }

        updateFinancialSummary();
    } catch (err) {
        console.error("renderActiveTabCart error:", err);
    }
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

// Đổi đơn vị bán (Chai <-> Thùng): giá tự đổi theo sell_price của đơn vị, chưa đặt thì = hệ số x giá cơ bản
function changeItemUnit(idx, ratioStr) {
    const tab = getActiveTab();
    const item = tab.cart[idx];
    if (!item) return;

    const ratio = parseFloat(ratioStr) || 1;
    const basePrice = item.base_price || item.original_price || 0;
    const picked = (item.units || []).find(u => u.ratio == ratio);

    item.unit_ratio = ratio;
    item.unit = picked ? picked.unit_name : (item.base_unit || item.unit);
    item.price = picked
        ? (picked.sell_price > 0 ? picked.sell_price : basePrice * ratio)
        : basePrice;
    item.original_price = item.price;
    item.price_list_name = null;   // Giá theo đơn vị thắng bảng giá, tránh hiểu nhầm nguồn giá

    renderInvoiceTabs();
    renderActiveTabCart();
}

function removeCartItem(idx) {
    const tab = getActiveTab();
    tab.cart.splice(idx, 1);
    renderInvoiceTabs();
    renderActiveTabCart();
}

function splitCartItemToGift(idx, qty = 1) {
    const tab = getActiveTab();
    if (!tab || !Array.isArray(tab.cart)) return;
    const item = tab.cart[idx];
    if (!item || item.is_gift || (item.quantity || 0) < 2) return;

    const splitQty = Math.min(Math.max(1, parseInt(qty) || 1), item.quantity - 1);
    item.quantity -= splitQty;

    const existGift = tab.cart.find(i => i.product_id === item.product_id && i.is_manual_gift);
    if (existGift) {
        existGift.quantity += splitQty;
    } else {
        tab.cart.push({
            product_id: item.product_id,
            code: item.code,
            name: item.name,
            price: 0,
            original_price: item.original_price || item.base_price || item.price || 0,
            quantity: splitQty,
            is_gift: true,
            is_manual_gift: true,
            gift_promo_name: 'Quà tặng thu ngân',
            unit: item.unit || item.base_unit || 'cái',
            base_unit: item.base_unit || item.unit || 'cái',
            base_price: item.base_price || 0,
            unit_ratio: item.unit_ratio || 1,
            units: Array.isArray(item.units) ? item.units : [],
            discount_val: 0,
            discount_type: 'vnd',
            vat_rate: item.vat_rate || 0
        });
    }

    renderInvoiceTabs();
    renderActiveTabCart();
}

function mergeManualGiftItem(idx) {
    const tab = getActiveTab();
    if (!tab || !Array.isArray(tab.cart)) return;
    const item = tab.cart[idx];
    if (!item || !item.is_manual_gift) return;

    const mainItem = tab.cart.find(i => i.product_id === item.product_id && !i.is_gift);
    if (mainItem) {
        mainItem.quantity += item.quantity;
        tab.cart.splice(idx, 1);
    } else {
        item.is_gift = false;
        item.is_manual_gift = false;
        item.price = item.original_price || item.base_price || 0;
        if (item.name && item.name.startsWith('🎁 [QUÀ TẶNG] ')) {
            item.name = item.name.replace(/^🎁\s*\[QUÀ TẶNG\]\s*/, '');
        }
        delete item.gift_promo_name;
    }

    renderInvoiceTabs();
    renderActiveTabCart();
}

window.splitCartItemToGift = splitCartItemToGift;
window.mergeManualGiftItem = mergeManualGiftItem;

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
    const vatInput = document.getElementById('modal-item-vat-rate');
    if (vatInput) vatInput.value = item.vat_rate !== undefined && item.vat_rate !== null ? item.vat_rate : 0;

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
    const vatVal = parseFloat(document.getElementById('modal-item-vat-rate')?.value) || 0;
    item.discount_val = discVal;
    item.discount_type = editingItemDiscountType;
    item.vat_rate = vatVal;

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

    posCustomerActiveIdx = -1;
    document.getElementById('pos-search-dropdown')?.classList.add('hidden');
    posProductActiveIdx = -1;

    let matches = [];
    const isSuggestion = !q;

    if (isSuggestion) {
        matches = (posContacts || []).filter(c => c && c.name).slice(0, 10);
    } else {
        matches = (posContacts || []).filter(c => {
            const text = `${c.name || ''} ${c.phone || ''}`;
            return fuzzyMatch(q, text);
        }).slice(0, 10);
    }

    if (matches.length === 0) {
        dropdown.innerHTML = isSuggestion
            ? '<div class="p-3 text-center text-xs text-slate-400 italic">Chưa có khách hàng nào</div>'
            : '<div class="p-3 text-center text-xs text-slate-400 italic">Không tìm thấy khách hàng nào</div>';
        dropdown.classList.remove('hidden');
        return;
    }

    const header = isSuggestion ? `
        <div class="px-3 py-1.5 bg-slate-50 border-b border-slate-100 flex items-center justify-between text-[11px] font-bold text-slate-500">
            <span class="flex items-center gap-1">✨ 10 khách hàng gợi ý</span>
            <span class="text-[10px] text-slate-400 font-normal">Gõ tên/SĐT để tìm thêm</span>
        </div>
    ` : '';

    dropdown.innerHTML = header + matches.map((c, idx) => `
        <div onclick="selectCustomerForActiveTab(${c.id})" onmouseenter="setCustomerActiveItem(${idx})" data-customer-id="${c.id}" class="pos-customer-item p-2.5 hover:bg-sky-50 cursor-pointer border-b last:border-0 flex justify-between items-center transition text-xs">
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
        address: cust.address || '',
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
    try {
        const tab = getActiveTab();
        if (!tab) return;
        if (!Array.isArray(tab.cart)) tab.cart = [];

        const totalQty = tab.cart.reduce((s, i) => s + (Number(i.quantity) || 0), 0);
        const itemTypes = tab.cart.length;
        const subtotal = tab.cart.reduce((s, i) => s + ((Number(i.price) || 0) * (Number(i.quantity) || 0)), 0);

        // Cập nhật số lượng hiển thị footer
        const elItemTypes = document.getElementById('lbl-item-types');
        if (elItemTypes) elItemTypes.innerText = itemTypes;
        const elTotalQty = document.getElementById('lbl-total-quantity');
        if (elTotalQty) elTotalQty.innerText = totalQty;
        const elSubtotal = document.getElementById('pos-subtotal-display');
        if (elSubtotal) elSubtotal.innerText = formatMoney(subtotal);

        // Tính giảm giá hóa đơn
        let billDiscAmount = 0;
        const billDisc = Number(tab.bill_discount) || 0;
        if (tab.bill_discount_type === 'pct') {
            billDiscAmount = Math.round(subtotal * (billDisc / 100));
        } else {
            billDiscAmount = billDisc;
        }
        billDiscAmount = Math.min(subtotal, billDiscAmount);
        const elBillDisc = document.getElementById('pos-bill-discount-display');
        if (elBillDisc) elBillDisc.innerText = formatMoney(billDiscAmount);

        // Tính giảm giá coupon
        let couponAmount = Number(tab.coupon_discount) || 0;

        // Tính điểm tích lũy (nếu bật toggle dùng điểm)
        let pointsAmount = 0;
        const chkPoints = document.getElementById('chk-use-points');
        if (tab.use_points && tab.customer && tab.customer.points > 0) {
            // Giả sử 1 điểm = 1.000 đ
            const pointVal = (Number(tab.customer.points) || 0) * 1000;
            pointsAmount = Math.min(pointVal, Math.max(0, subtotal - billDiscAmount - couponAmount));
            if (chkPoints) chkPoints.checked = true;
        } else {
            if (chkPoints) chkPoints.checked = false;
        }
        const elPointsDisc = document.getElementById('pos-points-discount-display');
        if (elPointsDisc) elPointsDisc.innerText = formatMoney(pointsAmount);

        // Tính khấu trừ Ví Spa (cho các dịch vụ type === 'service')
        let spaWalletDeduct = 0;
        const spaWalletRow = document.getElementById('pos-spa-wallet-row');
        const chkSpaWallet = document.getElementById('pos-use-spa-wallet');
        const spaWalletHint = document.getElementById('pos-spa-wallet-hint');
        const spaWalletDisplay = document.getElementById('pos-spa-wallet-deduct-display');

        // Khách cần trả
        const shippingFee = parseFloat(tab.shipping_fee) || 0;
        const shipInput = document.getElementById('pos-shipping-fee-input');
        if (shipInput && document.activeElement !== shipInput) {
            shipInput.value = shippingFee > 0 ? shippingFee : '';
        }

        const finalAmount = Math.max(0, subtotal - billDiscAmount - couponAmount - pointsAmount + shippingFee);
        const elFinalAmount = document.getElementById('pos-final-amount-display');
        if (elFinalAmount) elFinalAmount.innerText = formatMoney(finalAmount);

        // Tính tiền thuế VAT đa mức theo sản phẩm
        const totalVat = tab.cart.reduce((s, i) => {
            const q = Number(i.quantity) || 0;
            const p = Number(i.price) || 0;
            const vr = Number(i.vat_rate) || 0;
            return s + Math.round(q * p * (vr / 100));
        }, 0);
        const elVat = document.getElementById('pos-vat-display');
        if (elVat) elVat.innerText = formatMoney(totalVat);

        const mobileTotalPay = document.getElementById('mobile-total-pay-display');
        if (mobileTotalPay) {
            mobileTotalPay.innerText = formatMoney(finalAmount);
        }

        // Khách thanh toán (auto-fill nếu chưa gõ tay)
        const paidInput = document.getElementById('pos-paid-input');
        if (paidInput && (tab.paid_amount === null || tab.paid_amount === undefined)) {
            paidInput.value = Math.round(finalAmount).toLocaleString('vi-VN');
        }

        calculateChangeOrDebt(finalAmount);
        renderQuickCashButtons(finalAmount);
    } catch (err) {
        console.error("updateFinancialSummary error:", err);
    }
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

    const sorted = Array.from(presets).slice(0, 5);

    container.innerHTML = `
        <button type="button" onclick="setPosFullDebt()" class="py-1 px-1 bg-amber-50 hover:bg-amber-100 hover:border-amber-400 border border-amber-300 rounded-lg text-[11px] font-bold text-amber-800 transition flex items-center justify-center gap-0.5" title="Khách nợ toàn bộ (Trả 0đ)">
            <span>📒 Nợ 0đ</span>
        </button>
    ` + sorted.map(val => `
        <button type="button" onclick="setQuickCash(${val})" class="py-1 px-1 bg-white hover:bg-sky-50 hover:border-sky-300 border border-slate-200 rounded-lg text-[11px] font-bold text-slate-700 transition">
            ${formatMoney(val)}
        </button>
    `).join('');
}

function setPosFullDebt() {
    const tab = getActiveTab();
    tab.paid_amount = 0;
    tab.splitLines = [];
    tab.split_payment = false;
    const splitAutoBox = document.getElementById('pos-split-auto-box');
    if (splitAutoBox) splitAutoBox.classList.add('hidden');
    const paidInput = document.getElementById('pos-paid-input');
    if (paidInput) {
        paidInput.value = '0';
    }
    const finalAmount = getPosFinalAmount(tab);
    calculateChangeOrDebt(finalAmount);
}
window.setPosFullDebt = setPosFullDebt;

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
        tab.account_id = null; // chọn lại theo loại tài khoản của hình thức mới
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
    const shippingFee = parseFloat(tab.shipping_fee) || 0;
    return Math.max(0, subtotal - billDisc - (tab.coupon_discount || 0) - pointsAmount + shippingFee);
}

function updateShippingFee(val) {
    const tab = getActiveTab();
    tab.shipping_fee = Math.max(0, parseFloat(val) || 0);
    updateFinancialSummary();
    renderQuickCashButtons();
    const paidInput = document.getElementById('pos-paid-input');
    const finalAmount = getPosFinalAmount(tab);
    if (paidInput && !tab.split_payment) {
        paidInput.value = formatMoney(finalAmount);
    }
}
window.updateShippingFee = updateShippingFee;

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
    const accountsFor = m => (window.posPaymentAccounts || []).filter(a => m === 'card' ? a.account_type === 'pos_card' : (a.account_type === 'bank' || a.account_type === 'ewallet'));

    if (wrap) {
        wrap.innerHTML = lines.map((l, idx) => {
            const needsAccount = l.method === 'transfer' || l.method === 'card' || l.method === 'wallet';
            if (needsAccount && !l.account_id) {
                const _list = accountsFor(l.method);
                const _last = Number(localStorage.getItem('pos_last_pay_acc_' + (l.method === 'card' ? 'card' : 'transfer')) || 0);
                const _pick = _list.find(a => a.id === _last) || _list[0];
                if (_pick) l.account_id = _pick.id;
            }
            const accountSelect = needsAccount ? `
                <select class="border rounded px-1 py-1 text-[10px] w-28" onchange="tab_splitLines_setAccount(${idx}, this.value)">
                    <option value="">-- TK nhận --</option>
                    ${accountsFor(l.method).map(a => `<option value="${a.id}" ${l.account_id == a.id ? 'selected' : ''}>${a.name}</option>`).join('')}
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
    if (tab.splitLines[idx]) {
        tab.splitLines[idx].account_id = accId ? parseInt(accId) : null;
        if (accId) localStorage.setItem('pos_last_pay_acc_' + (tab.splitLines[idx].method === 'card' ? 'card' : 'transfer'), accId);
    }
}

function updatePosPaymentAccountsUI() {
    const select = document.getElementById('pos-bank-account-select');
    if (!select || !window.posPaymentAccounts) return;
    const tab = getActiveTab();
    // Tiền mặt: không đụng account_id (tránh gán TK bank làm backend hiểu là chuyển khoản)
    if (!['transfer', 'card', 'wallet'].includes(tab.payment_method)) return;
    
    // Thẻ -> "Máy POS thẻ"; chuyển khoản / ví điện tử -> ngân hàng + ví (không có két tiền mặt)
    const isCardMethod = tab.payment_method === 'card';
    const accounts = window.posPaymentAccounts.filter(a => isCardMethod ? a.account_type === 'pos_card' : (a.account_type === 'bank' || a.account_type === 'ewallet'));
    if (!accounts.some(a => a.id === tab.account_id)) {
        const lastId = Number(localStorage.getItem('pos_last_pay_acc_' + (isCardMethod ? 'card' : 'transfer')) || 0);
        const firstBank = accounts.find(a => a.id === lastId) || accounts.find(a => a.account_type === 'bank') || accounts[0];
        tab.account_id = firstBank ? firstBank.id : null;
    }
    select.innerHTML = accounts.map(a => {
        const isBank = a.account_type === 'bank';
        const typeBadge = a.account_type === 'pos_card' ? '[Thẻ]' : (isBank ? '[NH]' : '[Ví]');
        const ownerBadge = a.owner_type === 'COMPANY' ? 'Cty' : 'Cá nhân';
        const isSel = tab.account_id === a.id;
        const detail = a.account_type === 'pos_card' ? 'tiền quẹt thẻ' : (a.account_number ? `${a.bank_name || ''} ${a.account_number}`.trim() : '⚠ chưa có số TK');
        return `<option value="${a.id}" ${isSel ? 'selected' : ''}>${typeBadge} ${a.name} (${ownerBadge}) - ${detail}</option>`;
    }).join('') || `<option value="">-- Chưa có tài khoản cho ${isCardMethod ? 'quẹt thẻ (tạo loại "Máy POS thẻ")' : 'chuyển khoản'} --</option>`;
}

function onPosBankAccountChange(accId) {
    const tab = getActiveTab();
    tab.account_id = parseInt(accId) || null;
    if (accId) localStorage.setItem('pos_last_pay_acc_' + (tab.payment_method === 'card' ? 'card' : 'transfer'), accId);
}

// Trả về thông báo lỗi nếu 1 trong các TK nhận thiếu ngân hàng/số TK, ngược lại null.
function getBankAccountError(accIds) {
    const accounts = window.posPaymentAccounts || [];
    for (const id of accIds) {
        const acc = accounts.find(a => a.id === id);
        if (!acc) return "Vui lòng chọn tài khoản ngân hàng nhận tiền!";
        if (acc.account_type !== 'bank') continue; // ví điện tử: không bắt buộc VietQR
        const validBank = typeof isVietQRBankCode === 'function' ? isVietQRBankCode(acc.bank_name) : !!acc.bank_name;
        if (!validBank || !acc.account_number) {
            return `Tài khoản "${acc.name}" chưa chọn Ngân hàng hoặc chưa có Số tài khoản.\nVào Sổ quỹ > Tài khoản thanh toán để cập nhật trước khi thu chuyển khoản.`;
        }
    }
    return null;
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
let isSubmittingPOSOrder = false;

async function submitPOSOrder() {
    if (isSubmittingPOSOrder) {
        console.warn("Thao tác thanh toán đang được xử lý, bỏ qua click trùng lặp!");
        return;
    }

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

    const finalAmount = getPosFinalAmount(tab);

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
        const missingAcc = splitPayments.find(p => (p.method === 'transfer' || p.method === 'card' || p.method === 'wallet') && !p.account_id);
        if (missingAcc) {
            alert("Vui lòng chọn tài khoản nhận tiền cho dòng " + (SPLIT_METHOD_LABEL[missingAcc.method] || missingAcc.method) + "!");
            return;
        }
        paidAmount = splitPayments.reduce((s, p) => s + p.amount, 0);
    }

    const customerId = tab.customer ? tab.customer.id : 1; // 1: Khách lẻ mặc định
    const debtAmount = Math.max(0, finalAmount - paidAmount);

    if (debtAmount > 0) {
        if (!tab.customer || tab.customer.id === 1 || customerId === 1) {
            if (window.showToast) window.showToast("⚠️ Khách lẻ không thể ghi nợ! Vui lòng chọn khách hàng để lưu công nợ.", "warning");
            else alert("⚠️ Khách lẻ không thể ghi nợ!\nVui lòng chọn hoặc thêm khách hàng để lưu công nợ cho hóa đơn này.");
            return;
        }
        const custName = tab.customer.name || 'Khách hàng';
        const ok = typeof window.showConfirmModal === 'function'
            ? await window.showConfirmModal({
                title: 'Xác Nhận Ghi Nợ Hóa Đơn',
                message: `Khách [${custName}] thanh toán ${formatMoney(paidAmount)}, còn nợ lại ${formatMoney(debtAmount)}.`,
                subMessage: 'Bạn có chắc chắn muốn ghi nợ cho hóa đơn này không?',
                type: 'warning',
                confirmText: 'Ghi Nợ & Thanh Toán',
                cancelText: 'Quay lại',
                icon: '📝'
            })
            : confirm(`Khách [${custName}] thanh toán ${formatMoney(paidAmount)}, còn nợ lại ${formatMoney(debtAmount)}.\n\nBạn có chắc chắn muốn ghi nợ hóa đơn này không?`);
        if (!ok) {
            return;
        }
    }

    // Chuyển khoản/thẻ/ví: TK nhận phải có ngân hàng + số TK hợp lệ để in VietQR
    const accIdsToCheck = tab.split_payment
        ? splitPayments.filter(p => p.method === 'transfer' || p.method === 'card').map(p => p.account_id)
        : (['transfer', 'card', 'wallet'].includes(tab.payment_method) && paidAmount > 0 ? [tab.account_id] : []);
    const accErr = getBankAccountError(accIdsToCheck);
    if (accErr) {
        alert(accErr);
        return;
    }

    const staffSelect = document.getElementById('pos-staff-select');
    let staffId = parseInt(staffSelect?.value) || 0;
    if (!staffId && window.Auth && typeof window.Auth.getUser === 'function') {
        const u = window.Auth.getUser();
        if (u && u.id) staffId = u.id;
    }
    if (!staffId) staffId = 1;

    const btnSubmit = document.getElementById('btn-submit-order');
    if (btnSubmit) {
        btnSubmit.disabled = true;
        btnSubmit.innerText = "Đang xử lý...";
    }
    isSubmittingPOSOrder = true;

    try {
        const reqBody = {
            customer_id: customerId,
            staff_id: staffId,
            discount: totalDiscount,
            shipping_fee: parseFloat(tab.shipping_fee) || 0,
            paid_amount: paidAmount,
            payment_method: tab.payment_method || 'cash',
            account_id: tab.account_id || null,
            shift_id: (typeof currentShift !== 'undefined' && currentShift) ? currentShift.id : null,
            note: tab.note || "",
            payments: splitPayments,
            items: tab.cart.map(i => ({
                product_id: i.product_id,
                quantity: i.quantity,
                price: i.price,
                unit: i.unit,
                unit_ratio: i.unit_ratio || 1,
                vat_rate: i.vat_rate !== undefined && i.vat_rate !== null ? i.vat_rate : 0
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

        // Thông báo thăng hạng nếu có (bỏ thông báo tích lũy điểm khi thanh toán theo yêu cầu)
        if (data.tier_upgraded) {
            alert(`🏆 CHÚC MỪNG KHÁCH ĐƯỢC THĂNG HẠNG: [${data.tier_upgraded}]!`);
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
        tab.draft_code = null;
        tab.customer = null;
        tab.note = "";
        tab.bill_discount = 0;
        tab.use_points = false;
        tab.coupon_code = "";
        tab.coupon_discount = 0;
        tab.paid_amount = null;
        tab.shipping_fee = 0;
        tab.split_payment = false;
        tab.splitLines = [];
        const shippingInput = document.getElementById('pos-shipping-fee-input');
        if (shippingInput) shippingInput.value = '';
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
        isSubmittingPOSOrder = false;
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

function getQRCodeHTML(amount, code, bankAccOverride = null) {
    const mode = posSettings.shop_qr_mode || 'vietqr';
    if (mode === 'static' && posSettings.shop_qr_image) {
        return `<img src="${posSettings.shop_qr_image}" style="max-width: 140px; margin: 0 auto; display: block;" alt="QR Thanh Toán">`;
    }
    const bank = (bankAccOverride && bankAccOverride.bank_name) ? bankAccOverride.bank_name : (posSettings.shop_bank_code || 'MB');
    const acc = (bankAccOverride && bankAccOverride.account_number) ? bankAccOverride.account_number : posSettings.shop_bank_account;
    const owner = (bankAccOverride && bankAccOverride.account_holder) ? bankAccOverride.account_holder : (posSettings.shop_bank_owner || '');

    if (acc) {
        const name = encodeURIComponent(owner);
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
                if (posPrintConfig.presets) {
                    if (posPrintConfig.presets['k80_standard'] && !posPrintConfig.presets['k80_default']) {
                        posPrintConfig.presets['k80_default'] = posPrintConfig.presets['k80_standard'];
                    }
                    if (posPrintConfig.presets['k80_default'] && !posPrintConfig.presets['k80_standard']) {
                        posPrintConfig.presets['k80_standard'] = posPrintConfig.presets['k80_default'];
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
        if (p.is_active === false) continue;

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
            return cat === 'pos' && p.is_active !== false;
        });
        if (firstPosKey) {
            posPrintConfig.active_preset = firstPosKey;
            html = '';
            for (let key in posPrintConfig.presets) {
                const p = posPrintConfig.presets[key];
                const cat = p.category || (key.includes('spa') ? 'spa' : (key.includes('cashbook') ? 'cashbook' : (key.includes('audit') ? 'inventory' : 'pos')));
                if (cat !== 'pos') continue;
                if (p.is_active === false) continue;
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

function isWholesaleOrder(ord) {
    if (!ord) return false;
    if (ord.is_wholesale === true) return true;
    if (ord.price_list_id && Number(ord.price_list_id) > 0) return true;
    const plName = (ord.customer_price_list_name || ord.price_list_name || ord.customer_segment_name || '').toLowerCase();
    if (plName && (plName.includes('sỉ') || plName.includes('đại lý') || plName.includes('b2b') || plName.includes('vip') || !plName.includes('lẻ'))) {
        if (ord.price_list_id || plName.includes('sỉ') || plName.includes('đại lý')) return true;
    }
    const cName = (ord.customer_name || '').toLowerCase();
    if (cName.includes('đại lý') || cName.includes('dai ly') || cName.includes('sỉ') || cName.includes('si ')) {
        return true;
    }
    if (cName.includes('shop') || cName.includes('pet')) {
        if (ord.price_list_id) return true;
    }
    if (ord.items && ord.items.some(it => it.price_list_name)) return true;
    return false;
}

var currentModalPaperFilter = 'ALL';

function renderModalPaperFilterTabs(activePaper = 'ALL') {
    currentModalPaperFilter = activePaper;
    const tabContainer = document.getElementById('print-modal-paper-tabs');
    if (!tabContainer) return;

    const presets = posPrintConfig.presets || {};
    const paperSet = new Set();
    for (let k in presets) {
        const p = presets[k];
        const cat = p.category || (k.includes('spa') ? 'spa' : (k.includes('cashbook') ? 'cashbook' : (k.includes('audit') ? 'inventory' : 'pos')));
        if (cat !== 'pos') continue;
        if (p.is_active === false) continue;
        const ps = p.paper_size || 'K80';
        if (ps === 'K80' || ps === 'K58') paperSet.add('K80');
        else if (ps.startsWith('A4')) paperSet.add('A4');
        else if (ps.startsWith('A5')) paperSet.add('A5');
    }

    const availablePapers = Array.from(paperSet);
    const tabs = [{ key: 'ALL', label: 'Tất cả' }];
    if (availablePapers.includes('K80')) tabs.push({ key: 'K80', label: '🧾 K80' });
    if (availablePapers.includes('A4')) tabs.push({ key: 'A4', label: '📄 A4' });
    if (availablePapers.includes('A5')) tabs.push({ key: 'A5', label: '📑 A5' });

    let html = '';
    tabs.forEach(t => {
        const isSel = t.key === currentModalPaperFilter;
        const cls = isSel
            ? 'px-2 py-1 rounded-md font-bold transition flex items-center gap-1 cursor-pointer bg-sky-600 text-white shadow-2xs'
            : 'px-2 py-1 rounded-md font-medium transition flex items-center gap-1 cursor-pointer text-slate-600 hover:text-slate-900';
        html += `<button type="button" id="btn-print-modal-${t.key.toLowerCase()}" onclick="selectModalPaperFilter('${t.key}')" class="${cls}"><span>${t.label}</span></button>`;
    });

    tabContainer.innerHTML = html;
}

function selectModalPaperFilter(paperKey) {
    currentModalPaperFilter = paperKey;
    renderModalPaperFilterTabs(paperKey);

    const presets = posPrintConfig.presets || {};
    let targetPreset = null;

    // Tìm preset đầu tiên thỏa filter
    for (let k in presets) {
        const p = presets[k];
        const cat = p.category || (k.includes('spa') ? 'spa' : (k.includes('cashbook') ? 'cashbook' : (k.includes('audit') ? 'inventory' : 'pos')));
        if (cat !== 'pos' || p.is_active === false) continue;
        const ps = p.paper_size || 'K80';
        const match = (paperKey === 'ALL') ||
                      (paperKey === 'K80' && (ps === 'K80' || ps === 'K58')) ||
                      (paperKey === 'A4' && ps.startsWith('A4')) ||
                      (paperKey === 'A5' && ps.startsWith('A5'));
        if (match) {
            targetPreset = k;
            break;
        }
    }

    if (targetPreset) {
        changeModalPrintPreset(targetPreset);
    } else {
        populateModalPrintPresets();
    }
}

function updateModalPrintSizeButtons(size) {
    const btnK80 = document.getElementById('btn-print-modal-k80');
    const btnA4 = document.getElementById('btn-print-modal-a4');
    if (btnK80 && btnA4) {
        if (size === 'K80') {
            btnK80.className = 'px-2 py-1 rounded-md font-bold transition flex items-center gap-1 cursor-pointer bg-sky-600 text-white shadow-xs';
            btnA4.className = 'px-2 py-1 rounded-md font-semibold transition flex items-center gap-1 cursor-pointer text-slate-600 hover:text-slate-900';
        } else if (size === 'A4') {
            btnA4.className = 'px-2 py-1 rounded-md font-bold transition flex items-center gap-1 cursor-pointer bg-purple-600 text-white shadow-xs';
            btnK80.className = 'px-2 py-1 rounded-md font-semibold transition flex items-center gap-1 cursor-pointer text-slate-600 hover:text-slate-900';
        } else {
            btnK80.className = 'px-2 py-1 rounded-md font-semibold transition flex items-center gap-1 cursor-pointer text-slate-600 hover:text-slate-900';
            btnA4.className = 'px-2 py-1 rounded-md font-semibold transition flex items-center gap-1 cursor-pointer text-slate-600 hover:text-slate-900';
        }
    }

    let paperKey = 'ALL';
    if (size === 'K80' || size === 'K58') paperKey = 'K80';
    else if (size.startsWith('A4')) paperKey = 'A4';
    else if (size.startsWith('A5')) paperKey = 'A5';

    renderModalPaperFilterTabs(paperKey);
}

function populateModalPrintPresets(activePresetKey) {
    const sel = document.getElementById('modal-print-preset-select');
    if (!sel) return;

    const shortLabel = {
        'A4-portrait': 'A4 dọc',
        'A4-landscape': 'A4 ngang',
        'A5-portrait': 'A5',
        'A5-landscape': 'A5 ngang',
        'K80': 'K80',
        'K58': 'K58'
    };

    const presets = posPrintConfig.presets || {};
    let html = '';
    const cur = activePresetKey || posPrintConfig.active_preset;

    for (let key in presets) {
        const p = presets[key];
        const cat = p.category || (key.includes('spa') ? 'spa' : (key.includes('cashbook') ? 'cashbook' : (key.includes('audit') ? 'inventory' : 'pos')));
        if (cat !== 'pos') continue;
        if (p.is_active === false) continue;

        // Lọc theo currentModalPaperFilter nếu có
        const ps = p.paper_size || 'K80';
        if (currentModalPaperFilter === 'K80' && !(ps === 'K80' || ps === 'K58')) continue;
        if (currentModalPaperFilter === 'A4' && !ps.startsWith('A4')) continue;
        if (currentModalPaperFilter === 'A5' && !ps.startsWith('A5')) continue;

        const isSel = key === cur ? 'selected' : '';
        const sizeTag = shortLabel[p.paper_size] || p.paper_size || '';
        const boldTag = p.is_bold_all ? ' [Đậm]' : '';
        const label = p.name ? (sizeTag ? `${p.name} [${sizeTag}]${boldTag}` : `${p.name}${boldTag}`) : `${sizeTag}${boldTag}`;
        html += `<option value="${key}" ${isSel}>${label}</option>`;
    }

    sel.innerHTML = html;
    if (cur) sel.value = cur;
}

function changeModalPrintPreset(presetKey) {
    if (!posPrintConfig.presets || !posPrintConfig.presets[presetKey]) return;

    posPrintConfig.active_preset = presetKey;
    if (window.posPrintConfig) {
        window.posPrintConfig.active_preset = presetKey;
    }

    const p = posPrintConfig.presets[presetKey];
    const size = p.paper_size || '';
    let btnSize = 'ALL';
    if (size === 'K80' || size === 'K58') btnSize = 'K80';
    else if (size.startsWith('A4')) btnSize = 'A4';
    else if (size.startsWith('A5')) btnSize = 'A5';

    currentModalPaperFilter = btnSize;
    renderModalPaperFilterTabs(btnSize);
    populateModalPrintPresets(presetKey);

    const selModal = document.getElementById('modal-print-preset-select');
    if (selModal) selModal.value = presetKey;

    const selPOS = document.getElementById('pos-template-select');
    if (selPOS) selPOS.value = presetKey;

    if (window.currentLoadedPrintOrder) {
        renderAndPrint(window.currentLoadedPrintOrder, !!window.currentPrintIsDraft);
    }
}

function findBestPresetForSize(targetSize, isWholesale = false) {
    if (!posPrintConfig || !posPrintConfig.presets) return isWholesale ? 'a4_b2b' : 'k80_standard';
    const presets = posPrintConfig.presets;
    const curKey = posPrintConfig.active_preset;

    // 1. Nếu active_preset hiện tại hợp lệ và khớp với loại đơn/khổ giấy: giữ nguyên 100%!
    if (curKey && presets[curKey]) {
        const p = presets[curKey];
        const isCurA4 = p.paper_size && p.paper_size.startsWith('A4');
        const isCurThermal = p.paper_size === 'K80' || p.paper_size === 'K58';
        if (targetSize === 'K80' && isCurThermal && !isWholesale) return curKey;
        if (targetSize === 'A4' && isCurA4 && isWholesale) return curKey;
        if (targetSize === 'K80' && isCurThermal) return curKey;
        if (targetSize === 'A4' && isCurA4) return curKey;
    }

    const keys = Object.keys(presets);
    if (targetSize === 'K80') {
        const customK80 = keys.find(k => k.startsWith('preset_') && (presets[k].paper_size === 'K80' || presets[k].doc_type === 'pos_retail'));
        if (customK80) return customK80;
        if (presets['k80_standard']) return 'k80_standard';
        if (presets['k80_default']) return 'k80_default';
        const anyK80 = keys.find(k => presets[k].paper_size === 'K80' || presets[k].paper_size === 'K58');
        if (anyK80) return anyK80;
    } else {
        const customA4 = keys.find(k => k.startsWith('preset_') && ((presets[k].paper_size && presets[k].paper_size.startsWith('A4')) || presets[k].doc_type === 'pos_wholesale' || presets[k].doc_type === 'b2b'));
        if (customA4) return customA4;
        if (presets['a4_b2b']) return 'a4_b2b';
        if (presets['a4_standard']) return 'a4_standard';
        const anyA4 = keys.find(k => presets[k].paper_size && presets[k].paper_size.startsWith('A4'));
        if (anyA4) return anyA4;
    }

    return targetSize === 'K80' ? (presets['k80_standard'] ? 'k80_standard' : 'k80_default') : 'a4_b2b';
}

function switchModalPrintSize(size) {
    const isK80 = size === 'K80';
    let targetPreset = findBestPresetForSize(size, !isK80);
    if (!targetPreset || !posPrintConfig.presets[targetPreset]) {
        targetPreset = isK80 ? (posPrintConfig.presets['k80_standard'] ? 'k80_standard' : 'k80_default') : 'a4_b2b';
    }
    posPrintConfig.active_preset = targetPreset;
    if (window.posPrintConfig) {
        window.posPrintConfig.active_preset = targetPreset;
    }
    const selTemplate = document.getElementById('pos-template-select');
    if (selTemplate) {
        selTemplate.value = targetPreset;
    }

    const selModal = document.getElementById('modal-print-preset-select');
    if (selModal) {
        selModal.value = targetPreset;
    }

    updateModalPrintSizeButtons(size);

    if (window.currentLoadedPrintOrder) {
        renderAndPrint(window.currentLoadedPrintOrder, !!window.currentPrintIsDraft);
    }
}

function resolveOrderBankAccount(ord, isDraft = false) {
    const accounts = window.posPaymentAccounts || [];
    if (ord && ord.bank_account) {
        return ord.bank_account;
    }
    if (ord && ord.is_cash_payment) {
        return null;
    }
    if (ord && Array.isArray(ord.payments) && ord.payments.length > 0) {
        const nonCash = ord.payments.find(p => ['transfer', 'card', 'wallet'].includes(p.method));
        if (nonCash && nonCash.account_id) {
            const acc = accounts.find(a => a.id === nonCash.account_id);
            if (acc) {
                return {
                    id: acc.id,
                    name: acc.name,
                    bank_name: acc.bank_name || '',
                    account_number: acc.account_number || '',
                    account_holder: acc.account_holder || ''
                };
            }
        }
        const allCash = ord.payments.every(p => p.method === 'cash');
        if (allCash) return null;
    }

    const tab = typeof getActiveTab === 'function' ? getActiveTab() : null;
    if (isDraft && tab) {
        if (['transfer', 'card', 'wallet'].includes(tab.payment_method)) {
            let bAcc = null;
            if (tab.account_id) {
                bAcc = accounts.find(a => a.id === tab.account_id);
            }
            if (!bAcc) {
                bAcc = accounts.find(a => a.account_type === 'bank') || accounts.find(a => a.account_type === 'ewallet') || null;
            }
            if (bAcc) {
                return {
                    id: bAcc.id,
                    name: bAcc.name,
                    bank_name: bAcc.bank_name || '',
                    account_number: bAcc.account_number || '',
                    account_holder: bAcc.account_holder || ''
                };
            }
        } else if (tab.payment_method === 'cash') {
            return null;
        }
    }

    if (posSettings && posSettings.shop_bank_account && (!ord || !ord.is_cash_payment)) {
        return {
            id: null,
            name: posSettings.shop_bank_owner || 'Ngân hàng',
            bank_name: posSettings.shop_bank_code || 'MB',
            account_number: posSettings.shop_bank_account,
            account_holder: posSettings.shop_bank_owner || ''
        };
    }
    return null;
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
        window.currentLoadedPrintOrder = ord;

        let chosenPreset = (selTemplate && selTemplate.value && posPrintConfig.presets && posPrintConfig.presets[selTemplate.value]) ? selTemplate.value : null;
        if (!chosenPreset) {
            const savedKey = localStorage.getItem('pos_print_template');
            if (savedKey && posPrintConfig.presets && posPrintConfig.presets[savedKey]) chosenPreset = savedKey;
        }
        if (!chosenPreset) {
            const isWholesale = isWholesaleOrder(ord);
            const defaultSize = isWholesale ? 'A4' : 'K80';
            chosenPreset = findBestPresetForSize(defaultSize, isWholesale);
        }
        posPrintConfig.active_preset = chosenPreset;
        if (selTemplate) selTemplate.value = chosenPreset;
        const p = posPrintConfig.presets ? posPrintConfig.presets[chosenPreset] : null;
        const curSize = (p && p.paper_size) ? (p.paper_size.startsWith('A4') ? 'A4' : (p.paper_size.startsWith('A5') ? 'A5' : 'K80')) : 'ALL';
        updateModalPrintSizeButtons(curSize);
        populateModalPrintPresets(chosenPreset);
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
    const shippingFee = parseFloat(tab.shipping_fee) || 0;
    const finalAmount = Math.max(0, subtotal - totalDiscount + shippingFee);

    const paidInput = document.getElementById('pos-paid-input');
    const cleanPaid = (paidInput?.value || '0').replace(/\D/g, '');
    const paidAmount = parseFloat(cleanPaid) || 0;

    const staffSelect = document.getElementById('pos-staff-select');
    const staffName = staffSelect?.options[staffSelect.selectedIndex]?.text || 'Admin';

    const now = new Date();
    const pad = (n) => String(n).padStart(2, '0');
    const timeStr = `${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(now.getSeconds())} ${pad(now.getDate())}/${pad(now.getMonth()+1)}/${now.getFullYear()}`;

    const isWholesale = !!(
        (tab.customer && (tab.customer.name.toLowerCase().includes('đại lý') || tab.customer.name.toLowerCase().includes('dai ly') || tab.customer.name.toLowerCase().includes('sỉ') || tab.customer.name.toLowerCase().includes('si '))) ||
        (tab.customer?.price_list_id && Number(tab.customer.price_list_id) > 0) ||
        tab.customer?.price_list_name ||
        (tab.cart && tab.cart.some(i => i.price_list_name))
    );

    if (!tab.draft_code) {
        tab.draft_code = "DRAFT-" + Math.floor(100000 + Math.random() * 900000);
    }

    const isCustomerWholesale = !!(tab.customer?.price_list_id && Number(tab.customer.price_list_id) > 0) || isWholesale;

    const draftOrder = {
        code: tab.draft_code,
        created_at: timeStr,
        customer_name: tab.customer ? tab.customer.name : "Khách lẻ",
        customer_phone: tab.customer ? (tab.customer.phone || "-") : "-",
        customer_address: tab.customer ? (tab.customer.address || "") : "",
        staff_name: staffName,
        note: tab.note || "",
        total_amount: subtotal,
        discount: totalDiscount,
        shipping_fee: shippingFee,
        final_amount: finalAmount,
        paid_amount: paidAmount,
        debt_amount: Math.max(0, finalAmount - paidAmount),
        price_list_id: tab.customer?.price_list_id || null,
        customer_price_list_name: tab.customer?.price_list_name || null,
        customer_segment_name: tab.customer?.segment_name || null,
        is_wholesale: isWholesale,
        items: tab.cart.map(i => {
            const isGift = (Number(i.price) === 0 && Number(i.quantity || 0) > 0);
            let origPrice;
            if (isCustomerWholesale) {
                const discVal = parseFloat(i.discount_val) || 0;
                if (isGift) {
                    origPrice = 0;
                } else if (discVal > 0) {
                    origPrice = (i.original_price && i.original_price > i.price) ? i.original_price : (i.price + discVal);
                } else {
                    origPrice = i.price;
                }
            } else {
                origPrice = i.original_price || i.price;
            }
            return {
                product_code: i.code,
                product_name: i.name,
                unit: i.unit,
                price: i.price,
                original_price: origPrice, // original_price: i.original_price || i.price
                price_list_name: i.price_list_name || null,
                quantity: i.quantity,
                is_gift: isGift
            };
        })
    };

    // Đồng bộ tài khoản ngân hàng / tiền mặt cho đơn tạm tính
    const resolvedBankAcc = resolveOrderBankAccount(draftOrder, true);
    if (resolvedBankAcc) {
        draftOrder.bank_account = resolvedBankAcc;
        draftOrder.is_cash_payment = false;
    } else if (tab.payment_method === 'cash') {
        draftOrder.is_cash_payment = true;
        draftOrder.bank_account = null;
    }

    window.currentLoadedPrintOrder = draftOrder;

    let chosenPreset = (selTemplate && selTemplate.value && posPrintConfig.presets && posPrintConfig.presets[selTemplate.value]) ? selTemplate.value : null;
    if (!chosenPreset) {
        const savedKey = localStorage.getItem('pos_print_template');
        if (savedKey && posPrintConfig.presets && posPrintConfig.presets[savedKey]) chosenPreset = savedKey;
    }
    if (!chosenPreset) {
        const defaultSize = isWholesale ? 'A4' : 'K80';
        chosenPreset = findBestPresetForSize(defaultSize, isWholesale);
    }
    posPrintConfig.active_preset = chosenPreset;
    if (selTemplate) selTemplate.value = chosenPreset;
    const p = posPrintConfig.presets ? posPrintConfig.presets[chosenPreset] : null;
    const curSize = (p && p.paper_size) ? (p.paper_size.startsWith('A4') ? 'A4' : (p.paper_size.startsWith('A5') ? 'A5' : 'K80')) : 'ALL';
    updateModalPrintSizeButtons(curSize);
    populateModalPrintPresets(chosenPreset);

    renderAndPrint(draftOrder, true);
}

function renderAndPrint(ord, isDraft = false) {
    const printArea = document.getElementById('print-area');
    if (!printArea) return;
    window.currentLoadedPrintOrder = ord;
    window.currentPrintIsDraft = !!isDraft;

    if (!ord.bank_account && !ord.is_cash_payment) {
        const resolved = resolveOrderBankAccount(ord, isDraft);
        if (resolved) {
            ord.bank_account = resolved;
        }
    }

    // Luôn lấy preset đang chọn từ posPrintConfig hoặc selector
    const selTemplate = document.getElementById('pos-template-select');
    let curPresetKey = posPrintConfig.active_preset || (selTemplate && selTemplate.value) || "a4_b2b";
    if (posPrintConfig.presets) {
        if (curPresetKey === 'k80_default' && !posPrintConfig.presets['k80_default'] && posPrintConfig.presets['k80_standard']) {
            curPresetKey = 'k80_standard';
        }
    }
    const curPreset = posPrintConfig.presets ? posPrintConfig.presets[curPresetKey] : null;

    const selModal = document.getElementById('modal-print-preset-select');
    if (selModal) {
        if (!selModal.options || selModal.options.length === 0) {
            populateModalPrintPresets(curPresetKey);
        } else if (curPresetKey) {
            selModal.value = curPresetKey;
        }
    }

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

    const isWholesale = isWholesaleOrder(ord);

    let itemDiscountTotal = 0;
    (ord.items || []).forEach(it => {
        const isGift = (Number(it.price) === 0 && Number(it.quantity || 0) > 0);
        if (!isGift && it.original_price && it.original_price > it.price) {
            itemDiscountTotal += (it.original_price - it.price) * (it.quantity || 1);
        }
    });
    const billDiscount = ord.discount || 0;
    const finalDiscountToDisplay = itemDiscountTotal + billDiscount;
    const displayTotalAmount = (ord.total_amount || 0) + itemDiscountTotal;
    const totalSavings = finalDiscountToDisplay;

    const printData = {
        ten_cua_hang: posSettings.shop_name || "TÊN CỬA HÀNG",
        dia_chi: posSettings.shop_address || "Địa chỉ shop",
        so_dien_thoai: posSettings.shop_phone || "0900000000",
        loi_cam_on: posSettings.shop_footer || "Cảm ơn quý khách!",
        ma_hoa_don: ord.code,
        ngay_gio: typeof formatDateTime === 'function' ? formatDateTime(ord.created_at) : ord.created_at,
        thu_ngan: ord.staff_name || 'Thu ngân',
        ten_khach: ord.customer_name || 'Khách lẻ',
        sdt_khach: ord.customer_phone || '-',
        dia_chi_khach: ord.customer_address || ord.address || '',
        tong_tien: formatMoney(displayTotalAmount),
        giam_gia: formatMoney(finalDiscountToDisplay),
        tiet_kiem: formatMoney(totalSavings),
        tru_vi: formatMoney(ord.spa_wallet_deduction || 0),
        raw_tru_vi: ord.spa_wallet_deduction || 0,
        phi_ship: formatMoney(ord.shipping_fee || 0),
        raw_phi_ship: ord.shipping_fee || 0,
        phai_tra: formatMoney(ord.final_amount),
        khach_tra: formatMoney(ord.paid_amount),
        con_no: formatMoney(ord.debt_amount),
        raw_phai_tra: ord.final_amount
    };

    const dim = posPaperDimensions[paperSize] || posPaperDimensions["A4-portrait"];
    const isLandscape = paperSize.includes("landscape");
    const isThermal = paperSize === 'K80' || paperSize === 'K58';
    const isA5 = paperSize.includes("A5");

    let canvasW = 794;
    if (isThermal) {
        canvasW = paperSize === 'K80' ? 290 : 210;
    } else if (isA5) {
        canvasW = isLandscape ? 794 : 559;
    } else {
        canvasW = isLandscape ? 1123 : 794;
    }

    currentPrintPaperSize = paperSize;
    currentPrintPageRule = dim.printSize || (isThermal ? 'auto' : (isA5 ? (isLandscape ? 'A5 landscape' : 'A5 portrait') : (isLandscape ? 'A4 landscape' : 'A4 portrait')));

    // Sao chép canvasElements để không mutate config gốc và xử lý tự ẩn dòng giảm giá K80 khi không có giảm giá
    let effectiveElements = canvasElements.map(e => ({ ...e }));
    const hasAnyDiscount = finalDiscountToDisplay > 0;
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

    // Xử lý dòng Phí Giao Hàng (K80, K58, A5, A4): tự ẩn nếu không có ship, hoặc tự chèn nếu có ship mà template chưa có
    const shipFee = ord.shipping_fee || 0;
    const shipElem = effectiveElements.find(e => (e.catalog_key === 'shipping_fee') || (e.text && (e.text.includes('{{phi_ship}}') || (e.label && (e.label.toLowerCase().includes('phí giao hàng') || e.label.toLowerCase().includes('phí vận chuyển'))))));
    if (shipFee <= 0 && shipElem) {
        const shipY = shipElem.y || 0;
        const shiftAmount = 18;
        effectiveElements = effectiveElements.filter(e => e !== shipElem);
        effectiveElements.forEach(e => {
            if ((e.zone || 'header') === 'footer' && (e.y || 0) > shipY) {
                e.y = (e.y || 0) - shiftAmount;
            }
        });
    } else if (shipFee > 0 && !shipElem) {
        const payElem = effectiveElements.find(e => e.text && (e.text.includes('{{phai_tra}}') || (e.label && e.label.toLowerCase().includes('phải trả'))));
        if (payElem) {
            const insY = payElem.y;
            effectiveElements.forEach(e => {
                if ((e.zone || 'header') === 'footer' && (e.y || 0) >= insY) {
                    e.y = (e.y || 0) + 18;
                }
            });
            effectiveElements.push({
                id: "e_auto_phi_ship",
                catalog_key: "shipping_fee",
                zone: "footer",
                type: "text",
                text: "Phí giao hàng: +{{phi_ship}}",
                label: "Phí Giao Hàng",
                x: payElem.x !== undefined ? payElem.x : (isThermal ? 10 : 30),
                y: insY,
                w: payElem.w !== undefined ? payElem.w : (isThermal ? 270 : 250),
                fsz: Math.max(9, (payElem.fsz || 12) - 1),
                bold: false,
                align: payElem.align || "right"
            });
        }
    }

    // Tự động chèn Địa Chỉ Khách Hàng cho các mẫu in (A4/A5/B2B/K80) nếu khách có địa chỉ mà mẫu chưa có phần tử
    const hasCustAddress = !!(printData.dia_chi_khach && printData.dia_chi_khach.trim());
    const addrElem = effectiveElements.find(e => e.catalog_key === 'customer_address' || (e.text && e.text.includes('{{dia_chi_khach}}')));
    if (hasCustAddress && !addrElem) {
        const custElem = effectiveElements.find(e => e.catalog_key === 'customer' || (e.text && e.text.includes('{{ten_khach}}')));
        if (custElem) {
            const insY = (custElem.y || 147) + 16;
            const insX = custElem.x || (isThermal ? 10 : 30);
            const insW = custElem.w || (isThermal ? 270 : 550);
            const insFsz = Math.max(9, (custElem.fsz || 10) - 0.5);
            effectiveElements.forEach(e => {
                if ((e.zone || 'header') === 'header' && e !== custElem && (e.y || 0) >= insY && Math.abs((e.x || 0) - insX) < 120) {
                    e.y = (e.y || 0) + 16;
                }
            });
            effectiveElements.push({
                id: "e_auto_customer_address",
                catalog_key: "customer_address",
                zone: "header",
                type: "text",
                text: "Địa chỉ: {{dia_chi_khach}}",
                label: "Địa Chỉ Khách Hàng",
                x: insX,
                y: insY,
                w: insW,
                fsz: insFsz,
                bold: false,
                align: custElem.align || "left"
            });
        }
    }

    // Kiểm tra và khắc phục xung đột toạ độ nếu addrElem có sẵn bị đè lên customer_phone
    if (hasCustAddress) {
        const liveAddr = effectiveElements.find(e => e.catalog_key === 'customer_address' || (e.text && e.text.includes('{{dia_chi_khach}}')));
        const livePhone = effectiveElements.find(e => e.catalog_key === 'customer_phone' || (e.text && e.text.includes('{{sdt_khach}}') && e !== liveAddr));
        if (liveAddr && livePhone && Math.abs((livePhone.x || 0) - (liveAddr.x || 0)) < 120) {
            const py = livePhone.y || 0;
            const ay = liveAddr.y || 0;
            if (Math.abs(py - ay) < 14) {
                liveAddr.y = py + 16;
            }
        }
    }

    // Tính deltaY giãn chân trang theo số lượng dòng sản phẩm
    const tableElem = effectiveElements.find(e => e.type === 'table' || e.type === 'table_b2b');
    if (tableElem && hasCustAddress) {
        const liveAddr = effectiveElements.find(e => e.catalog_key === 'customer_address' || (e.text && e.text.includes('{{dia_chi_khach}}')));
        if (liveAddr && (tableElem.y || 0) <= (liveAddr.y || 0) + 14) {
            tableElem.y = (liveAddr.y || 0) + 18;
        }
    }
    let deltaY = 0;
    if (tableElem && ord.items) {
        const isB2B = tableElem.type === 'table_b2b';
        const headerH = isB2B ? 34 : 28;
        let itemsHeight = 0;
        ord.items.forEach(it => {
            if (isB2B) {
                // Font 10px + padding 4px trên/dưới + line-height = ~20px thực tế
                itemsHeight += 20;
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
                    itemsH += 20;
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

    let canvasH = 1123;
    if (isThermal) {
        canvasH = Math.max(320, maxContentBottom + 25);
    } else if (isA5) {
        const nominalH = isLandscape ? 559 : 794;
        canvasH = Math.max(nominalH, maxContentBottom + 25);
    } else {
        const nominalH = isLandscape ? 740 : 1050;
        canvasH = Math.max(nominalH, maxContentBottom + 15);
    }

    const watermarkHtml = isDraft ? `
        <div class="draft-watermark-banner" style="width: ${dim.width}; max-width: 100%; margin: 0 auto 12px auto; background-color: #fef3c7; color: #92400e; border: 1.5px dashed #f59e0b; padding: 8px 14px; font-size: 13px; font-weight: bold; text-align: center; border-radius: 8px; box-sizing: border-box; box-shadow: 0 2px 5px rgba(0,0,0,0.05); display: flex; align-items: center; justify-content: center; gap: 6px;">
            <span>⚠️</span>
            <span>ĐÂY LÀ HÓA ĐƠN MẪU / TẠM TÍNH - CHƯA THANH TOÁN</span>
        </div>
    ` : '';

    let html = `
    <style>
        ${isThermal ? '@page { size: auto; margin: 0; }' : (isLandscape ? '@page { size: 297mm 210mm; size: landscape; margin: 0; }' : `@page { size: ${dim.printSize || 'auto'}; margin: 0; }`)}
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
                page-break-inside: auto !important;
                break-inside: auto !important;
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
                page-break-after: auto !important;
                page-break-inside: auto !important;
                break-inside: auto !important;
                break-after: auto !important;
            }
            .print-inner {
                transform-origin: top left;
                page-break-after: auto !important;
                page-break-inside: auto !important;
                break-inside: auto !important;
                break-after: auto !important;
            }
        }
    </style>
    <div class="print-preview-wrapper" style="display: flex; flex-direction: column; align-items: center; width: 100%; max-width: 100%; padding: 4px 0;">
        ${watermarkHtml}
        <div class="print-container" style="width: ${dim.width}; margin: 0 auto; background: white; overflow: visible; position: relative; box-shadow: 0 4px 16px rgba(0,0,0,0.1); border: 1px solid #e2e8f0; border-radius: 4px;">
            <div class="print-inner" style="position: relative; width: ${canvasW}px; min-height: ${canvasH}px; font-family: Arial, sans-serif; overflow: visible; page-break-inside: auto; break-inside: auto;">`;

    effectiveElements.forEach(e => {
        let content = '';
        if (e.catalog_key === 'customer_address' || e.type === 'customer_address') {
            if (!printData.dia_chi_khach || !printData.dia_chi_khach.trim()) {
                return; // Nếu khách không có địa chỉ, ẩn khối
            }
        }
        if (e.type === 'logo') {
            const logoMaxH = e.h || 65;
            const logoMaxW = e.w || 140;
            const alignStyle = e.align === 'left' ? 'margin-right: auto; margin-left: 0;' : e.align === 'right' ? 'margin-left: auto; margin-right: 0;' : 'margin: 0 auto;';
            if (posSettings.shop_logo) content = `<img src="${posSettings.shop_logo}" style="max-height: ${logoMaxH}px; max-width: ${logoMaxW}px; width: 100%; height: auto; object-fit: contain; display: block; ${alignStyle}">`;
        } else if (e.type === 'header_store_info') {
            content = `
                <div style="font-size: ${e.fsz || 11}px; text-align: ${e.align || 'left'}; line-height: 1.35;">
                    <div style="font-size: ${(e.fsz || 11) + 4}px; font-weight: bold; text-transform: uppercase;">${printData.ten_cua_hang}</div>
                    <div>Địa chỉ: ${printData.dia_chi}</div>
                    <div>Hotline: ${printData.so_dien_thoai}</div>
                </div>
            `;
        } else if (e.type === 'qr') {
            content = getQRCodeHTML(ord.final_amount, ord.code, ord.bank_account);
        } else if (e.type === 'table_b2b') {
            const showCode = !e.hide_code;
            const showUnit = !e.hide_unit;
            const showDisc = !e.hide_discount;
            const showNote = !e.hide_note;

            content = `
                <table style="width: 100%; border-collapse: collapse; font-size: ${e.fsz || 10}px; border: 1px solid #000;">
                    <thead>
                        <tr style="background-color: #f1f5f9; border-bottom: 1px solid #000; font-weight: bold; text-align: center;">
                            <th style="border: 1px solid #000; padding: 4px 2px; width: 28px;">TT</th>
                            ${showCode ? '<th style="border: 1px solid #000; padding: 4px 4px; width: 68px;">Mã hàng</th>' : ''}
                            <th style="border: 1px solid #000; padding: 4px 4px; text-align: left;">Tên sản phẩm</th>
                            ${showUnit ? '<th style="border: 1px solid #000; padding: 4px 2px; width: 45px;">ĐVT</th>' : ''}
                            <th style="border: 1px solid #000; padding: 4px 4px; text-align: right; width: 75px;">Đơn giá</th>
                            ${showDisc ? '<th style="border: 1px solid #000; padding: 4px 2px; text-align: right; width: 45px;">CK</th>' : ''}
                            <th style="border: 1px solid #000; padding: 4px 2px; width: 38px;">SL</th>
                            <th style="border: 1px solid #000; padding: 4px 4px; text-align: right; width: 85px;">Thành tiền</th>
                            ${showNote ? '<th style="border: 1px solid #000; padding: 4px 4px; width: 75px;">Ghi chú</th>' : ''}
                        </tr>
                    </thead>
                    <tbody>
                        ${ord.items.map((it, idx) => {
                            const isGift = (Number(it.price) === 0 && Number(it.quantity || 0) > 0);
                            const hasItemDisc = !isGift && ((!isWholesale && it.original_price && (it.original_price > it.price)) || (isWholesale && it.original_price && (it.original_price > it.price)));
                            let discText = '';
                            if (isGift) {
                                discText = '100%';
                            } else if (hasItemDisc) {
                                discText = `${Math.round((1 - it.price / it.original_price) * 100)}%`;
                            } else {
                                discText = isWholesale ? '' : '0%';
                            }

                            let priceHtml = '';
                            if (isGift) {
                                priceHtml = formatMoney(0);
                            } else if (hasItemDisc) {
                                priceHtml = `
                                    <div style="font-weight: 500;">${formatMoney(it.price)}</div>
                                    <div style="text-decoration: line-through; color: #888; font-size: 8.5px;">${formatMoney(it.original_price)}</div>
                                `;
                            } else {
                                priceHtml = formatMoney(it.price);
                            }

                            return `
                        <tr style="border-bottom: 1px solid #ccc; text-align: center;">
                            <td style="border: 1px solid #ccc; padding: 4px 2px;">${idx + 1}</td>
                            ${showCode ? `<td style="border: 1px solid #ccc; padding: 4px 4px;">${it.product_code || ''}</td>` : ''}
                            <td style="border: 1px solid #ccc; padding: 4px 4px; text-align: left; font-weight: 500;">${it.product_name}</td>
                            ${showUnit ? `<td style="border: 1px solid #ccc; padding: 4px 2px;">${it.unit || 'Cái'}</td>` : ''}
                            <td style="border: 1px solid #ccc; padding: 4px 4px; text-align: right;">${priceHtml}</td>
                            ${showDisc ? `<td style="border: 1px solid #ccc; padding: 4px 2px; text-align: right;">${discText}</td>` : ''}
                            <td style="border: 1px solid #ccc; padding: 4px 2px; font-weight: bold;">${it.quantity}</td>
                            <td style="border: 1px solid #ccc; padding: 4px 4px; text-align: right; font-weight: bold;">${formatMoney(it.quantity * it.price)}</td>
                            ${showNote ? `<td style="border: 1px solid #ccc; padding: 4px 4px; font-size: 9px; color: #666;">${isGift ? 'Hàng tặng' : '-'}</td>` : ''}
                        </tr>
                            `;
                        }).join('')}
                    </tbody>
                </table>
            `;
        } else if (e.type === 'b2b_footer_boxes') {
            const isDebt = (ord.debt_amount || 0) > 0;
            const isCashOnly = !isDebt && !!(ord.is_cash_payment || (ord.payments && ord.payments.length > 0 && ord.payments.every(p => p.method === 'cash')) || (!ord.bank_account && ord.payment_method === 'cash'));
            const bAcc = ord.bank_account || {};
            const bankName = typeof getBankDisplayName === 'function' ? getBankDisplayName(bAcc.bank_name || 'MB') : (bAcc.bank_name || 'MB Bank');
            const bankNum = bAcc.account_number || '';
            const bankOwner = bAcc.account_holder || '';

            let paymentInfoHtml = '';
            let qrBoxHtml = '';

            if (isDebt) {
                // Đơn hàng ghi nợ: Ô 1 để trống, ô 2 để trống hoàn toàn
                paymentInfoHtml = `
                    <div style="font-weight: bold; border-bottom: 0.5px solid #ccc; padding-bottom: 2px; margin-bottom: 4px; text-transform: uppercase;">💳 Thông Tin Thanh Toán</div>
                    <div style="min-height: 55px;"></div>
                `;
                qrBoxHtml = `
                    <div style="font-weight: bold; font-size: 9px; margin-bottom: 2px;">QUÉT MÃ VIETQR</div>
                    <div style="min-height: 55px;"></div>
                `;
            } else if (isCashOnly) {
                paymentInfoHtml = `
                    <div style="font-weight: bold; border-bottom: 0.5px solid #ccc; padding-bottom: 2px; margin-bottom: 4px; text-transform: uppercase;">💳 Thông Tin Thanh Toán</div>
                    <div>Hình thức: <b>Tiền mặt tại quầy</b></div>
                    <div>Trạng thái: <b>Đã thanh toán đủ</b></div>
                    <div style="color: #555; font-size: 9px; margin-top: 3px;">Mã HĐ: <i>${printData.ma_hoa_don}</i></div>
                `;
                qrBoxHtml = `
                    <div style="font-weight: bold; font-size: 10px; color: #15803d; margin-top: 15px;">💵 ĐÃ THANH TOÁN TIỀN MẶT</div>
                    <div style="font-size: 9px; color: #666; margin-top: 4px;">Hóa đơn đã thu tiền trực tiếp</div>
                `;
            } else {
                paymentInfoHtml = `
                    <div style="font-weight: bold; border-bottom: 0.5px solid #ccc; padding-bottom: 2px; margin-bottom: 4px; text-transform: uppercase;">💳 Thông Tin Thanh Toán</div>
                    <div>Ngân hàng: <b>${bankName}</b></div>
                    <div>Số TK: <b>${bankNum}</b></div>
                    <div>Chủ TK: <b>${bankOwner}</b></div>
                    <div style="color: #555; font-size: 9px; margin-top: 3px;">Nội dung CK: <i>${printData.ma_hoa_don}</i></div>
                `;
                qrBoxHtml = `
                    <div style="font-weight: bold; font-size: 9px; margin-bottom: 2px;">QUÉT MÃ VIETQR</div>
                    ${getQRCodeHTML(ord.final_amount, ord.code, ord.bank_account)}
                `;
            }

            content = `
                <div style="display: grid; grid-template-columns: 1.2fr 1fr 1.3fr; gap: 8px; font-size: 10px;">
                    <div style="border: 1px solid #000; padding: 6px; border-radius: 2px;">
                        ${paymentInfoHtml}
                    </div>
                    <div style="border: 1px solid #000; padding: 6px; border-radius: 2px; text-align: center; display: flex; flex-direction: column; align-items: center; justify-content: center;">
                        ${qrBoxHtml}
                    </div>
                    <div style="border: 1px solid #000; padding: 6px; border-radius: 2px;">
                        <div style="font-weight: bold; border-bottom: 0.5px solid #ccc; padding-bottom: 2px; margin-bottom: 4px; text-transform: uppercase;">💰 Tổng Kết Thanh Toán</div>
                        <div style="display: flex; justify-content: space-between; margin-bottom: 2px;"><span>Tổng tiền hàng:</span> <span>${printData.tong_tien}</span></div>
                        <div style="display: flex; justify-content: space-between; margin-bottom: 2px;"><span>Chiết khấu:</span> <span>${printData.giam_gia}</span></div>
                        ${(ord.shipping_fee || 0) > 0 ? `<div style="display: flex; justify-content: space-between; margin-bottom: 2px;"><span>Phí giao hàng:</span> <span>+${formatMoney(ord.shipping_fee)}</span></div>` : ''}
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
                                const isGift = (Number(it.price) === 0 && Number(it.quantity || 0) > 0);
                                const hasItemDisc = !isGift && ((!isWholesale && it.original_price && (it.original_price > it.price)) || (isWholesale && it.original_price && (it.original_price > it.price)));
                                const itemDiff = hasItemDisc ? (it.original_price - it.price) : 0;
                                const priceDisplay = isGift ? `
                                    <div style="font-weight: bold; line-height: 1.1;">${formatMoney(0)}</div>
                                    <div style="color: #15803d; font-size: 9px; line-height: 1.1; margin-top: 1px;">(Hàng tặng)</div>
                                ` : (hasItemDisc ? `
                                    <div style="font-weight: bold; line-height: 1.1;">${formatMoney(it.price)}</div>
                                    <div style="color: #666; font-size: 9px; line-height: 1.1; margin-top: 1px;">
                                        <span style="text-decoration: line-through;">${formatMoney(it.original_price)}</span>
                                        <span style="color: #15803d; font-weight: 500;">(Giảm ${formatMoney(itemDiff)})</span>
                                    </div>
                                ` : `<div>${formatMoney(it.price)}</div>`);
                                const subtotalDisplay = isGift ? `
                                    <div style="font-weight: bold;">${formatMoney(0)}</div>
                                ` : ((hasItemDisc && it.quantity > 1) ? `
                                    <div style="font-weight: bold;">${formatMoney(it.quantity * it.price)}</div>
                                    <div style="color: #15803d; font-size: 9px; line-height: 1.1;">(Giảm ${formatMoney(itemDiff * it.quantity)})</div>
                                ` : `<div style="font-weight: bold;">${formatMoney(it.quantity * it.price)}</div>`);
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
                                const isGift = (Number(it.price) === 0 && Number(it.quantity || 0) > 0);
                                const hasItemDisc = !isGift && ((!isWholesale && it.original_price && (it.original_price > it.price)) || (isWholesale && it.original_price && (it.original_price > it.price)));
                                const priceDisplay = isGift ? `
                                    <div style="font-weight: bold; line-height: 1.1;">${formatMoney(0)}</div>
                                    <div style="color: #15803d; font-size: 9px; line-height: 1.1; margin-top: 1px;">(Hàng tặng)</div>
                                ` : (hasItemDisc ? `
                                    <div style="font-weight: bold; line-height: 1.1;">${formatMoney(it.price)}</div>
                                    <div style="text-decoration: line-through; color: #777; font-size: 9px; line-height: 1.1; margin-top: 1px;">${formatMoney(it.original_price)}</div>
                                ` : `<div>${formatMoney(it.price)}</div>`);
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
            txt = txt.replace(/{{dia_chi_khach}}/g, printData.dia_chi_khach);
            txt = txt.replace(/{{tong_tien}}/g, printData.tong_tien);
            txt = txt.replace(/{{tong_tien_hang}}/g, printData.tong_tien);
            txt = txt.replace(/{{tong_thanh_toan}}/g, printData.phai_tra);
            txt = txt.replace(/{{giam_gia}}/g, printData.giam_gia);
            txt = txt.replace(/{{tru_vi}}/g, printData.tru_vi);
            txt = txt.replace(/{{phi_ship}}/g, printData.phi_ship);
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

        const breakInsideRule = isFooter ? 'page-break-inside: avoid; break-inside: avoid;' : '';
        html += `<div data-zone="${e.zone || 'header'}" style="position: absolute; left: ${e.x || 0}px; top: ${printY}px; width: ${elemW}; ${breakInsideRule}">${content}</div>`;
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
    const isA5 = currentPrintPaperSize.includes('A5');
    const isLandscape = currentPrintPaperSize.includes('landscape') || currentPrintPageRule.includes('landscape');

    let pageRule = 'A4 portrait';
    if (isThermal) {
        pageRule = 'auto';
    } else if (isA5) {
        pageRule = isLandscape ? 'A5 landscape' : 'A5 portrait';
    } else {
        pageRule = isLandscape ? 'A4 landscape' : 'A4 portrait';
    }

    const iframe = document.createElement('iframe');
    iframe.id = 'pos-receipt-print-frame';
    iframe.style.position = 'fixed';
    iframe.style.top = '-9999px';
    iframe.style.left = '-9999px';
    if (isThermal) {
        iframe.style.width = '350px';
        iframe.style.height = '1000px';
    } else if (isA5) {
        iframe.style.width = isLandscape ? '850px' : '600px';
        iframe.style.height = isLandscape ? '600px' : '850px';
    } else {
        iframe.style.width = isLandscape ? '1150px' : '850px';
        iframe.style.height = isLandscape ? '800px' : '1150px';
    }
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
    const curPreset = (posPrintConfig && posPrintConfig.presets && posPrintConfig.presets[posPrintConfig.active_preset]) ? posPrintConfig.presets[posPrintConfig.active_preset] : null;

    if (curPreset && curPreset.is_bold_all !== undefined) {
        isBoldAll = !!curPreset.is_bold_all;
    } else {
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
                ${isThermal ? '@page { size: auto; margin: 0mm; }' : (isLandscape ? '@page { size: 297mm 210mm; size: landscape; margin: 0; }' : `@page { size: ${pageRule}; margin: 0; }`)}
                ${boldStyles}
                html, body {
                    margin: 0 !important;
                    padding: 0 !important;
                    background: white !important;
                    width: 100% !important;
                    height: auto !important;
                    overflow: visible !important;
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
                    display: block !important;
                    width: ${isThermal ? '100%' : (isLandscape ? '297mm' : '100%')} !important;
                    max-width: 100% !important;
                    overflow: visible !important;
                    page-break-after: auto !important;
                    page-break-inside: auto !important;
                    break-inside: auto !important;
                    break-after: auto !important;
                }
                .print-inner {
                    transform-origin: top center !important;
                    margin: 0 auto !important;
                    display: block !important;
                    overflow: visible !important;
                    page-break-after: auto !important;
                    page-break-inside: auto !important;
                    break-inside: auto !important;
                    break-after: auto !important;
                }
            </style>
        </head>
        <body style="display: block; margin: 0 auto; padding: 0; background: white; text-align: center;">
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
                // A4 landscape chiều cao tối đa an toàn: 740px; Portrait: 1050px
                const maxAvailableH = isLandscape ? 740 : 1050;
                const innerH = inner.scrollHeight || inner.offsetHeight;
                
                if (innerH <= maxAvailableH) {
                    inner.style.transform = "none";
                    container.style.height = "auto";
                    container.style.overflow = "visible";
                } else if (innerH > maxAvailableH && innerH <= maxAvailableH * 1.15) {
                    // Nếu vượt nhẹ (trong khoảng 1.0 - 1.15 lần trang 1), scale nhẹ fit 1 trang đẹp mắt
                    const scaleY = maxAvailableH / innerH;
                    inner.style.transform = "scale(" + (scaleY * 0.98) + ")";
                    inner.style.transformOrigin = 'top center';
                    container.style.height = (innerH * scaleY * 0.98) + 'px';
                } else if (innerH > maxAvailableH * 1.15) {
                    // Nếu đơn dài (> 18 món A4 ngang hoặc > 32 món A4 dọc), mở rộng container để ngắt tự nhiên sang trang 2, không scale tí nị
                    inner.style.transform = "none";
                    inner.style.height = 'auto';
                    inner.style.minHeight = '0';
                    container.style.height = 'auto';
                    container.style.overflow = 'visible';
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

    const payMethodSelect = document.getElementById('pos-topup-pay-method');
    if (payMethodSelect) payMethodSelect.value = 'cash';
    onPosTopupPayMethodChange('cash');

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

function onPosTopupPayMethodChange(method) {
    const val = method || document.getElementById('pos-topup-pay-method')?.value || 'cash';
    const box = document.getElementById('pos-topup-bank-account-box');
    const accSelect = document.getElementById('pos-topup-account-id');
    if (!box || !accSelect) return;

    if (val === 'transfer' || val === 'card') {
        box.classList.remove('hidden');
        const accounts = (window.posPaymentAccounts || []).filter(a => val === 'card' ? a.account_type === 'pos_card' : (a.account_type === 'bank' || a.account_type === 'ewallet'));
        const lastTopupAcc = Number(localStorage.getItem('pos_last_pay_acc_' + (val === 'card' ? 'card' : 'transfer')) || 0);
        accSelect.innerHTML = accounts.map(a => {
            const typeBadge = a.account_type === 'pos_card' ? '[Thẻ]' : (a.account_type === 'ewallet' ? '[Ví]' : '[NH]');
            const ownerBadge = a.owner_type === 'COMPANY' ? 'Cty' : 'Cá nhân';
            return `<option value="${a.id}">${typeBadge} ${a.name} (${ownerBadge}) - ${a.account_number || a.code}</option>`;
        }).join('') || '<option value="">-- Chưa có tài khoản phù hợp --</option>';
        if (accounts.some(a => a.id === lastTopupAcc)) accSelect.value = String(lastTopupAcc);
        else if (accSelect.options.length > 0) accSelect.selectedIndex = 0;
        accSelect.onchange = () => { if (accSelect.value) localStorage.setItem('pos_last_pay_acc_' + (val === 'card' ? 'card' : 'transfer'), accSelect.value); };
    } else {
        box.classList.add('hidden');
        accSelect.innerHTML = '';
    }
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
        <body style="display: block; margin: 0 auto; padding: 0; background: white; text-align: center;">
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
    let accountId = null;
    if (payMethod === 'transfer' || payMethod === 'card') {
        const accEl = document.getElementById('pos-topup-account-id');
        if (accEl && accEl.value) {
            accountId = parseInt(accEl.value);
        }
    }

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
            account_id: accountId,
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
        if (data.current_points !== undefined) cust.points = data.current_points;

        if (typeof allContacts !== 'undefined') {
            const cAll = allContacts.find(c => c.id === cust.id);
            if (cAll) {
                cAll.spa_wallet_balance = data.balance_after;
                if (data.current_points !== undefined) cAll.points = data.current_points;
            }
        }
        if (typeof posContacts !== 'undefined') {
            const pAll = posContacts.find(c => c.id === cust.id);
            if (pAll) {
                pAll.spa_wallet_balance = data.balance_after;
                if (data.current_points !== undefined) pAll.points = data.current_points;
            }
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
            points_earned: data.points_earned || 0,
            note: note
        };

        const btnPrint = document.getElementById('btn-print-topup-k80');
        if (btnPrint) btnPrint.classList.remove('hidden');

        // Bỏ xem trước phiếu in: Tự động in trực tiếp qua máy in/iframe
        printTopupReceiptK80(_lastTopupReceiptData);

        // Đóng modal nạp ví
        closeTopupSpaModal();

        // Hiển thị thông báo chính xác số tiền nạp và số tiền nhận
        const ptsMsg = (data.points_earned && data.points_earned > 0) ? `, Tích +${data.points_earned} điểm` : '';
        const msg = `✅ Nạp thành công [${pkgName}]!\n💰 Tiền nộp: ${payAmt.toLocaleString('vi-VN')} đ\n💆 Cộng vào ví: +${receiveAmt.toLocaleString('vi-VN')} đ\n💳 Số dư mới: ${balAfter.toLocaleString('vi-VN')} đ${ptsMsg ? '\n⭐ ' + ptsMsg : ''}`;
        if (typeof showToast === 'function') {
            showToast(`Nạp thành công [${pkgName}]: Nộp ${payAmt.toLocaleString('vi-VN')}đ, Cộng ví +${receiveAmt.toLocaleString('vi-VN')}đ${ptsMsg}`, 'success');
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
    tbody.innerHTML = '<tr><td colspan="6" class="p-4 text-center text-slate-400">Đang tải lịch sử ví...</td></tr>';
    modal.classList.remove('hidden');

    try {
        const res = await fetch(`/api/topup/history/${cust.id}`);
        if (!res.ok) throw new Error('Không thể tải lịch sử');
        const rows = await res.json();

        if (!rows || rows.length === 0) {
            tbody.innerHTML = '<tr><td colspan="6" class="p-4 text-center text-slate-400">Chưa có giao dịch biến động ví nào</td></tr>';
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
                const isAdmin = typeof Auth !== 'undefined' && Auth.hasRole('owner', 'admin');
                actionHtml = `
                    <div class="inline-flex items-center gap-1 justify-center">
                        <button type="button" onclick="printHistoricalTopupReceipt(${cust.id}, ${r.id})" 
                                class="px-2 py-0.5 rounded text-[11px] font-bold bg-sky-50 text-sky-700 hover:bg-sky-100 border border-sky-200 shadow-2xs transition" 
                                title="In lại phiếu thu nạp ví K80">
                            🖨️ In
                        </button>
                        ${isAdmin ? `
                            <button type="button" onclick="openEditTopupTxModal(${r.id}, ${cust.id})"
                                    class="px-2 py-0.5 rounded text-[11px] font-bold bg-amber-50 text-amber-700 hover:bg-amber-100 border border-amber-200 shadow-2xs transition"
                                    title="Chỉnh sửa phiếu nạp ví">
                                ✏️ Sửa
                            </button>
                            <button type="button" onclick="confirmDeleteTopupTx(${r.id}, ${cust.id})"
                                    class="px-2 py-0.5 rounded text-[11px] font-bold bg-rose-50 text-rose-700 hover:bg-rose-100 border border-rose-200 shadow-2xs transition"
                                    title="Xóa phiếu nạp ví và hoàn tác số dư">
                                🗑️ Xóa
                            </button>
                        ` : ''}
                    </div>
                `;
            }

            return `
                <tr class="hover:bg-slate-50 border-b border-slate-100 text-xs">
                    <td class="p-2.5 text-slate-500 font-mono">${typeof formatDateTime === 'function' ? formatDateTime(r.created_at) : (r.created_at || '')}</td>
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
        tbody.innerHTML = '<tr><td colspan="6" class="p-4 text-center text-rose-500">Lỗi khi tải lịch sử giao dịch ví</td></tr>';
    }
}

function closePosWalletHistory() {
    const modal = document.getElementById('modal-pos-wallet-history');
    if (modal) modal.classList.add('hidden');
}

// ==========================================
// THAO TÁC SỬA / XÓA PHIẾU THU NẠP VÍ SPA
// ==========================================
var _allTopupOrdersData = [];

async function openEditTopupTxModal(txId, custId) {
    const modal = document.getElementById('modal-edit-topup-tx');
    if (!modal) return;

    document.getElementById('edit-topup-tx-id').value = txId;
    document.getElementById('edit-topup-cust-id').value = custId || '';

    // Load transaction info
    try {
        const res = await fetch(`/api/topup/history/${custId}`);
        const rows = res.ok ? await res.json() : [];
        const tx = rows.find(item => item.id == txId);
        if (tx) {
            document.getElementById('edit-topup-cust-name').innerText = document.getElementById('pos-wallet-hist-cust-name')?.innerText || 'Khách hàng';
            document.getElementById('edit-topup-amount-disp').innerText = `${Number(tx.amount || 0).toLocaleString('vi-VN')} đ`;
            document.getElementById('edit-topup-note').value = tx.note || '';
        }
    } catch(e) {}

    // Populate accounts dropdown
    const accSelect = document.getElementById('edit-topup-account-select');
    if (accSelect) {
        const accounts = window.posPaymentAccounts || [];
        accSelect.innerHTML = accounts.map(a => {
            const isBank = a.account_type === 'bank';
            const typeBadge = isBank ? '[NH]' : (a.account_type === 'ewallet' ? '[Ví]' : '[Két]');
            const ownerBadge = a.owner_type === 'COMPANY' ? 'Cty' : 'Cá nhân';
            return `<option value="${a.id}">${typeBadge} ${a.name} (${ownerBadge}) - ${a.account_number || a.code}</option>`;
        }).join('');
    }

    modal.classList.remove('hidden');
}

function closeEditTopupTxModal() {
    const modal = document.getElementById('modal-edit-topup-tx');
    if (modal) modal.classList.add('hidden');
}

async function submitEditTopupTx(e) {
    if (e) e.preventDefault();
    const txId = document.getElementById('edit-topup-tx-id').value;
    const custId = document.getElementById('edit-topup-cust-id').value;
    const accountId = parseInt(document.getElementById('edit-topup-account-select').value || 0);
    const note = document.getElementById('edit-topup-note').value.trim();

    try {
        const res = await fetch(`/api/topup/transactions/${txId}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                account_id: accountId || null,
                note: note
            })
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.detail || 'Không thể cập nhật phiếu nạp ví');

        if (typeof showToast === 'function') {
            showToast('Đã cập nhật thông tin phiếu nạp ví thành công!', 'success');
        } else {
            alert('Đã cập nhật thông tin phiếu nạp ví thành công!');
        }
        closeEditTopupTxModal();
        if (custId) showPosWalletHistory();
        if (typeof loadTopupOrdersList === 'function') loadTopupOrdersList();
        if (typeof loadCashbook === 'function') loadCashbook();
    } catch(err) {
        alert('Lỗi: ' + err.message);
    }
}

async function confirmDeleteTopupTx(txId, custId, cashbookId) {
    let confirmed = false;
    const msg = `Xóa phiếu thu nạp ví này sẽ tự động:
1. Khấu trừ lại số dư ví Spa của khách hàng.
2. Trừ lại số điểm thưởng tích lũy đã cộng.
3. Hủy phiếu thu tương ứng trong Sổ Quỹ Cashbook.`;

    if (typeof window.showConfirmModal === 'function') {
        confirmed = await window.showConfirmModal({
            title: 'CẢNH BÁO HOÀN TÁC ĐỒNG BỘ',
            message: 'Bạn có chắc chắn muốn xóa phiếu nạp ví này không?',
            subMessage: msg,
            confirmText: 'Xác Nhận Xóa & Hoàn Tác',
            cancelText: 'Hủy bỏ',
            type: 'danger',
            icon: '⚠️'
        });
    } else if (typeof window.customConfirm === 'function') {
        confirmed = await window.customConfirm(msg + '\n\nBạn có chắc chắn muốn xóa không?', 'CẢNH BÁO HOÀN TÁC ĐỒNG BỘ', { type: 'danger', okText: 'Xác Nhận Xóa' });
    } else {
        confirmed = confirm("⚠️ CẢNH BÁO HOÀN TÁC ĐỒNG BỘ:\n\n" + msg + "\n\nBạn có chắc chắn muốn xóa không?");
    }

    if (!confirmed) return;

    try {
        let ok = false;
        let msg = '';
        let errDetail = '';

        // 1. Thử xóa qua API topup/transactions/{id}
        if (txId) {
            try {
                const res = await fetch(`/api/topup/transactions/${txId}`, { method: 'DELETE' });
                if (res.ok) {
                    const data = await res.json();
                    ok = true;
                    msg = data.message;
                } else {
                    const err = await res.json().catch(() => ({}));
                    errDetail = err.detail || '';
                }
            } catch(e) {}
        }

        // 2. Fallback: Nếu API topup/transactions chưa có hoặc lỗi, thử qua /api/cashbook/{id}
        if (!ok && cashbookId) {
            try {
                const cbRes = await fetch(`/api/cashbook/${cashbookId}`, { method: 'DELETE' });
                if (cbRes.ok) {
                    const data = await cbRes.json();
                    ok = true;
                    msg = data.message || 'Đã xóa phiếu nạp ví và hoàn tác số dư thành công!';
                } else {
                    const err = await cbRes.json().catch(() => ({}));
                    errDetail = err.detail || errDetail;
                }
            } catch(e) {}
        }

        if (!ok) {
            throw new Error(errDetail || 'Không thể xóa phiếu nạp ví. Vui lòng chạy CAP_NHAT.bat trên máy chủ tiệm.');
        }

        if (typeof showToast === 'function') {
            showToast(msg || 'Đã xóa phiếu nạp ví và hoàn tác số dư thành công!', 'success');
        } else {
            alert(msg || 'Đã xóa phiếu nạp ví và hoàn tác số dư thành công!');
        }

        // Cập nhật lại số dư khách hàng nếu đang chọn trên POS
        const tab = (typeof getActiveTab === 'function') ? getActiveTab() : null;
        if (tab && tab.customer && tab.customer.id == custId) {
            try {
                const cRes = await fetch(`/api/contacts/${custId}`);
                if (cRes.ok) {
                    const cData = await cRes.json();
                    tab.customer.spa_wallet_balance = cData.spa_wallet_balance || 0;
                    tab.customer.points = cData.points || 0;
                    if (typeof updateCustomerUI === 'function') updateCustomerUI(tab.customer);
                }
            } catch(e) {}
        }

        if (custId) showPosWalletHistory();
        if (typeof loadTopupOrdersList === 'function') loadTopupOrdersList();
        if (typeof loadCashbook === 'function') loadCashbook();
    } catch(err) {
        alert('Lỗi xóa phiếu: ' + err.message);
    }
}

// ==========================================
// SUB-TAB HÓA ĐƠN NẠP VÍ SPA
// ==========================================
async function loadTopupOrdersList() {
    const searchVal = document.getElementById('search-topup-orders')?.value.trim() || '';
    const tbody = document.getElementById('topup-orders-table-body');
    const badge = document.getElementById('topup-orders-count-badge');
    if (tbody) tbody.innerHTML = '<tr><td colspan="9" class="p-6 text-center text-slate-400">Đang tải phiếu nạp ví...</td></tr>';

    try {
        let rows = [];

        // 1. Thử lấy từ /api/topup/transactions
        try {
            const url = `/api/topup/transactions?limit=100${searchVal ? `&search=${encodeURIComponent(searchVal)}` : ''}`;
            const res = await fetch(url);
            if (res.ok) {
                const data = await res.json();
                if (Array.isArray(data)) rows = data;
            }
        } catch(e) {}

        // 2. Map bổ sung từ /api/cashbook (nhận diện các phiếu PT-VI, topup)
        try {
            const cbRes = await fetch('/api/cashbook?limit=150');
            if (cbRes.ok) {
                const cbList = await cbRes.json();
                const topupVouchers = (cbList || []).filter(c => 
                    (c.ref_type === 'topup' || (c.code && c.code.startsWith('PT-VI')) || (c.category && c.category.toLowerCase().includes('nap vi')))
                );
                topupVouchers.forEach(c => {
                    const exists = rows.some(r => r.cashbook_code === c.code || (r.id && r.id === c.ref_id));
                    if (!exists) {
                        let receiveAmt = c.amount;
                        if (c.note) {
                            const m = c.note.match(/->\s*([0-9.,]+)\s*k/i);
                            if (m) receiveAmt = parseFloat(m[1].replace(',', '.')) * 1000;
                            const mTr = c.note.match(/->\s*([0-9.,]+)\s*tr/i);
                            if (mTr) receiveAmt = parseFloat(mTr[1].replace(',', '.')) * 1000000;
                        }
                        rows.push({
                            id: c.ref_id || c.id,
                            cashbook_id: c.id,
                            cashbook_code: c.code,
                            contact_id: c.contact_id,
                            contact_name: c.contact_name,
                            contact_phone: c.contact_phone,
                            package_name: c.category,
                            pay_amount: c.amount,
                            pay_amount_actual: c.amount,
                            amount: receiveAmt,
                            points_earned: Math.floor(c.amount / 1000),
                            account_name: c.account_name,
                            created_at: c.created_at,
                            note: c.note
                        });
                    }
                });
            }
        } catch(e) {}

        // Lọc tìm kiếm nếu có
        if (searchVal) {
            const s = searchVal.toLowerCase();
            rows = rows.filter(r => 
                (r.cashbook_code && r.cashbook_code.toLowerCase().includes(s)) ||
                (r.contact_name && r.contact_name.toLowerCase().includes(s)) ||
                (r.contact_phone && r.contact_phone.includes(s)) ||
                (r.package_name && r.package_name.toLowerCase().includes(s)) ||
                (r.note && r.note.toLowerCase().includes(s))
            );
        }

        // Sắp xếp mới nhất lên đầu
        rows.sort((a, b) => (b.created_at || '').localeCompare(a.created_at || ''));

        _allTopupOrdersData = rows;
        if (badge) badge.innerText = `${_allTopupOrdersData.length} phiếu`;
        renderTopupOrdersTable(_allTopupOrdersData);
    } catch(err) {
        if (tbody) tbody.innerHTML = `<tr><td colspan="9" class="p-6 text-center text-rose-500">Lỗi: ${err.message}</td></tr>`;
    }
}

function renderTopupOrdersTable(rows) {
    const tbody = document.getElementById('topup-orders-table-body');
    if (!tbody) return;

    if (!rows || rows.length === 0) {
        tbody.innerHTML = '<tr><td colspan="9" class="p-6 text-center text-slate-400 italic">Không tìm thấy phiếu thu nạp ví nào</td></tr>';
        return;
    }

    const isAdmin = typeof Auth !== 'undefined' && Auth.hasRole('owner', 'admin');

    tbody.innerHTML = rows.map(r => {
        const cbCode = r.cashbook_code || `PT-VI#${r.id}`;
        const payAmt = Number(r.pay_amount || r.pay_amount_actual || 0);
        const recAmt = Number(r.amount || r.receive_amount || 0);
        const pts = Number(r.points_earned || 0);

        return `
            <tr class="hover:bg-amber-50/40 border-b border-slate-100 text-xs transition">
                <td class="p-3 font-mono font-bold text-amber-700">${cbCode}</td>
                <td class="p-3 text-slate-500 font-mono">${typeof formatDateTime === 'function' ? formatDateTime(r.created_at) : (r.created_at || '')}</td>
                <td class="p-3">
                    <div class="font-bold text-slate-800">${r.contact_name || 'Khách lẻ'}</div>
                    <div class="text-[10px] text-slate-400 font-mono">${r.contact_phone || ''}</div>
                </td>
                <td class="p-3 font-semibold text-slate-700">${r.package_name || r.note || 'Nạp ví Spa'}</td>
                <td class="p-3 text-right font-mono font-bold text-slate-800">${payAmt.toLocaleString('vi-VN')} đ</td>
                <td class="p-3 text-right font-mono font-bold text-emerald-600">+${recAmt.toLocaleString('vi-VN')} đ</td>
                <td class="p-3 text-center">
                    <span class="px-1.5 py-0.5 rounded text-[10px] font-bold ${pts > 0 ? 'bg-amber-100 text-amber-800' : 'text-slate-400'}">
                        +${pts} đ
                    </span>
                </td>
                <td class="p-3 text-slate-600 truncate max-w-[150px]">${r.account_name || 'Két tiền mặt'}</td>
                <td class="p-3 text-center">
                    <div class="inline-flex items-center gap-1 justify-center">
                        <button type="button" onclick="printHistoricalTopupReceipt(${r.contact_id}, ${r.id})" 
                                class="px-2 py-1 rounded text-xs font-bold bg-sky-50 text-sky-700 hover:bg-sky-100 border border-sky-200 shadow-2xs transition" 
                                title="In lại phiếu thu K80">
                            🖨️ In
                        </button>
                        ${isAdmin ? `
                            <button type="button" onclick="openEditTopupTxModal(${r.id}, ${r.contact_id})"
                                    class="px-2 py-1 rounded text-xs font-bold bg-amber-50 text-amber-700 hover:bg-amber-100 border border-amber-200 shadow-2xs transition"
                                    title="Chỉnh sửa phiếu nạp ví">
                                ✏️ Sửa
                            </button>
                            <button type="button" onclick="confirmDeleteTopupTx(${r.id}, ${r.contact_id}, ${r.cashbook_id || ''})"
                                    class="px-2 py-1 rounded text-xs font-bold bg-rose-50 text-rose-700 hover:bg-rose-100 border border-rose-200 shadow-2xs transition"
                                    title="Xóa phiếu nạp ví và hoàn tác số dư">
                                🗑️ Xóa
                            </button>
                        ` : ''}
                    </div>
                </td>
            </tr>
        `;
    }).join('');
}

window.showPosWalletHistory = showPosWalletHistory;
window.closePosWalletHistory = closePosWalletHistory;
window.printHistoricalTopupReceipt = printHistoricalTopupReceipt;
window.printLastTopupReceipt = printLastTopupReceipt;

window.openTopupSpaModal = openTopupSpaModal;
window.closeTopupSpaModal = closeTopupSpaModal;
window.onPosTopupPayMethodChange = onPosTopupPayMethodChange;
window.onSelectTopupPackageRadio = onSelectTopupPackageRadio;
window.submitTopupSpaRecharge = submitTopupSpaRecharge;
window.toggleUseSpaWallet = toggleUseSpaWallet;

window.openEditTopupTxModal = openEditTopupTxModal;
window.closeEditTopupTxModal = closeEditTopupTxModal;
window.submitEditTopupTx = submitEditTopupTx;
window.confirmDeleteTopupTx = confirmDeleteTopupTx;
window.loadTopupOrdersList = loadTopupOrdersList;
window.renderTopupOrdersTable = renderTopupOrdersTable;

// ====================================================
// MOBILE RESPONSIVE ADAPTER & CATALOG LOGIC
// ====================================================
function toggleMobilePaymentSheet(show) {
    const sidebar = document.getElementById('pos-payment-sidebar');
    if (!sidebar) return;
    if (show === undefined) {
        sidebar.classList.toggle('hidden');
    } else if (show) {
        sidebar.classList.remove('hidden');
    } else {
        sidebar.classList.add('hidden');
    }
}

function renderMobileCatalog(query = '', category = '') {
    const grid = document.getElementById('mobile-product-grid');
    if (!grid) return;
    if (!posProducts || posProducts.length === 0) {
        grid.innerHTML = '<div class="col-span-2 text-center text-xs text-slate-400 py-6">Đang tải danh sách món...</div>';
        return;
    }
    let list = posProducts;
    if (category) {
        const catNorm = category.toLowerCase().trim();
        list = list.filter(p => (p.category_name || p.type || '').toLowerCase().includes(catNorm));
    }
    if (query) {
        list = list.filter(p => fuzzyMatch(query, `${p.name || ''} ${p.code || ''} ${p.barcode || ''}`));
    }
    if (list.length === 0) {
        grid.innerHTML = '<div class="col-span-2 text-center text-xs text-slate-400 py-6">Không tìm thấy sản phẩm phù hợp</div>';
        return;
    }
    grid.innerHTML = list.slice(0, 40).map(p => {
        const price = p.sell_price || 0;
        const icon = p.type === 'service' ? '🛁' : '📦';
        return `
            <div onclick="addProductToActiveCart(${p.id})" class="bg-white p-2 rounded-xl border border-slate-200/80 shadow-xs flex flex-col justify-between active:scale-95 transition cursor-pointer select-none">
                <div>
                    <div class="h-12 bg-slate-50 rounded-lg flex items-center justify-center text-xl mb-1">${icon}</div>
                    <div class="font-bold text-xs text-slate-800 line-clamp-2 leading-snug" title="${p.name}">${p.name}</div>
                    <div class="text-[10px] text-slate-400 mt-0.5 truncate">${p.code || ''} ${p.stock !== undefined ? '• Tồn: ' + p.stock : ''}</div>
                </div>
                <div class="mt-2 flex items-center justify-between border-t border-slate-100 pt-1.5">
                    <span class="font-mono-num font-extrabold text-xs text-sky-600">${formatMoney(price)}</span>
                    <span class="w-6 h-6 rounded-full bg-sky-50 text-sky-600 flex items-center justify-center font-bold text-sm">+</span>
                </div>
            </div>
        `;
    }).join('');
}

function filterMobileCatalog(query) {
    const activeCatBtn = document.querySelector('#mobile-category-pills button.active');
    const cat = activeCatBtn ? (activeCatBtn.getAttribute('data-cat') || '') : '';
    renderMobileCatalog(query, cat);
}

function filterMobileCategory(category) {
    document.querySelectorAll('#mobile-category-pills button').forEach(btn => {
        btn.classList.remove('active', 'bg-sky-600', 'text-white');
        btn.classList.add('bg-slate-100', 'text-slate-600');
    });
    const clickedBtn = window.event?.currentTarget;
    if (clickedBtn) {
        clickedBtn.classList.add('active', 'bg-sky-600', 'text-white');
        clickedBtn.classList.remove('bg-slate-100', 'text-slate-600');
    }
    const q = document.getElementById('mobile-search-catalog-input')?.value || '';
    renderMobileCatalog(q, category);
}

window.toggleMobilePaymentSheet = toggleMobilePaymentSheet;
window.renderMobileCatalog = renderMobileCatalog;
window.filterMobileCatalog = filterMobileCatalog;
window.filterMobileCategory = filterMobileCategory;

// Xuất các hàm điều khiển in ấn & thanh toán ra window
window.printDraftOrder = printDraftOrder;
window.submitPOSOrder = submitPOSOrder;
window.renderAndPrint = renderAndPrint;
window.showPrintModal = showPrintModal;
window.closePrintModal = closePrintModal;
window.printInvoiceDirectly = printInvoiceDirectly;
window.switchModalPrintSize = switchModalPrintSize;
window.isWholesaleOrder = isWholesaleOrder;
window.updateModalPrintSizeButtons = updateModalPrintSizeButtons;
window.populateModalPrintPresets = populateModalPrintPresets;
window.changeModalPrintPreset = changeModalPrintPreset;
window.splitCartItemToGift = splitCartItemToGift;
window.mergeManualGiftItem = mergeManualGiftItem;
window.resolveOrderBankAccount = resolveOrderBankAccount;

// Khởi chạy an toàn cùng SPA
window.initPOSModule = initPOS;
if (document.readyState === 'complete' || document.readyState === 'interactive') {
    setTimeout(() => { if (document.getElementById('tab-pos')) initPOS(); }, 50);
} else {
    document.addEventListener('DOMContentLoaded', () => {
        if (document.getElementById('tab-pos')) initPOS();
    });
}
