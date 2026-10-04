// pos_mobile.js - Giao diện bán hàng di động chuyên biệt
var mobileProducts = [];
var mobileCustomers = [];
var mobileCart = {}; // { productId: { product, quantity, customPrice } }
var currentCustomer = null;
var activeCategory = '';
var currentPayMethod = 'cash';

function formatMoney(num) {
    return (num || 0).toLocaleString('vi-VN') + ' đ';
}

async function initMobilePOS() {
    try {
        const [prodRes, custRes] = await Promise.all([
            fetch('/api/products?_t=' + Date.now()).then(r => r.json()),
            fetch('/api/contacts?type=customer&_t=' + Date.now()).then(r => r.json())
        ]);
        mobileProducts = prodRes || [];
        mobileCustomers = custRes || [];
        renderProductGrid();
    } catch (e) {
        console.error("Lỗi nạp dữ liệu POS Mobile:", e);
        document.getElementById('mob-product-grid').innerHTML = 
            '<div class="col-span-2 text-center text-rose-500 py-10 text-xs">Lỗi kết nối máy chủ</div>';
    }
}

function renderProductGrid(filterQuery = '') {
    const container = document.getElementById('mob-product-grid');
    if (!container) return;

    let items = mobileProducts;
    if (activeCategory) {
        const cat = activeCategory.toLowerCase();
        items = items.filter(p => (p.category_name || p.type || '').toLowerCase().includes(cat));
    }
    if (filterQuery) {
        const q = filterQuery.toLowerCase();
        items = items.filter(p => 
            (p.name || '').toLowerCase().includes(q) || 
            (p.code || '').toLowerCase().includes(q) || 
            (p.barcode || '').toLowerCase().includes(q)
        );
    }

    if (items.length === 0) {
        container.innerHTML = '<div class="col-span-2 text-center text-slate-400 py-12 text-xs">Không tìm thấy sản phẩm nào</div>';
        return;
    }

    container.innerHTML = items.map(p => {
        const inCartQty = mobileCart[p.id]?.quantity || 0;
        const icon = p.type === 'service' ? '🛁' : '📦';
        const price = p.sell_price || 0;

        return `
            <div class="bg-white p-3 rounded-2xl border border-slate-200/90 shadow-xs flex flex-col justify-between active:scale-[0.98] transition select-none">
                <div>
                    <div class="h-14 bg-slate-50 rounded-xl flex items-center justify-center text-2xl mb-2">${icon}</div>
                    <h3 class="font-bold text-xs text-slate-800 line-clamp-2 leading-snug">${p.name}</h3>
                    <p class="text-[11px] text-slate-400 mt-1 truncate">Mã: ${p.code || '-'} ${p.stock !== undefined ? '• Tồn: ' + p.stock : ''}</p>
                </div>
                <div class="mt-3 pt-2 border-t border-slate-100 flex items-center justify-between gap-1">
                    <span class="font-mono-num font-extrabold text-xs text-sky-600">${formatMoney(price)}</span>
                    ${inCartQty > 0 ? `
                        <div class="flex items-center gap-1.5 bg-sky-50 px-2 py-1 rounded-xl">
                            <button onclick="mobileCartMinus(${p.id})" class="w-6 h-6 rounded-lg bg-white text-sky-700 font-bold text-xs shadow-xs active:bg-slate-100">-</button>
                            <span class="font-mono-num font-black text-xs text-sky-800">${inCartQty}</span>
                            <button onclick="mobileCartAdd(${p.id})" class="w-6 h-6 rounded-lg bg-sky-600 text-white font-bold text-xs shadow-xs active:bg-sky-700">+</button>
                        </div>
                    ` : `
                        <button onclick="mobileCartAdd(${p.id})" class="w-8 h-8 rounded-xl bg-sky-600 text-white flex items-center justify-center font-bold text-sm shadow-xs active:scale-95">
                            +
                        </button>
                    `}
                </div>
            </div>
        `;
    }).join('');
}

function mobileCartAdd(id) {
    const p = mobileProducts.find(x => x.id === id);
    if (!p) return;
    if (!mobileCart[id]) {
        mobileCart[id] = { product: p, quantity: 1, price: p.sell_price || 0 };
    } else {
        mobileCart[id].quantity += 1;
    }
    updateCartUI();
    renderProductGrid(document.getElementById('mob-search-input')?.value || '');
}

function mobileCartMinus(id) {
    if (mobileCart[id]) {
        mobileCart[id].quantity -= 1;
        if (mobileCart[id].quantity <= 0) {
            delete mobileCart[id];
        }
    }
    updateCartUI();
    renderProductGrid(document.getElementById('mob-search-input')?.value || '');
}

function mobileCartRemove(id) {
    delete mobileCart[id];
    updateCartUI();
    renderProductGrid(document.getElementById('mob-search-input')?.value || '');
}

function clearMobileCart() {
    mobileCart = {};
    updateCartUI();
    renderProductGrid(document.getElementById('mob-search-input')?.value || '');
    closeCartSheet();
}

function updateCartUI() {
    let totalQty = 0;
    let subtotal = 0;

    const listContainer = document.getElementById('mob-cart-items-list');
    let html = '';

    for (let id in mobileCart) {
        const item = mobileCart[id];
        totalQty += item.quantity;
        const lineTotal = item.quantity * item.price;
        subtotal += lineTotal;

        html += `
            <div class="py-2.5 flex items-center justify-between gap-2">
                <div class="flex-1 min-w-0 pr-1">
                    <div class="font-bold text-xs text-slate-800 truncate">${item.product.name}</div>
                    <div class="font-mono-num text-[11px] text-sky-600 font-semibold">${formatMoney(item.price)} × ${item.quantity} = ${formatMoney(lineTotal)}</div>
                </div>
                <div class="flex items-center gap-2 shrink-0">
                    <button onclick="mobileCartMinus(${id})" class="w-8 h-8 rounded-xl bg-slate-100 font-bold text-sm text-slate-700 flex items-center justify-center active:bg-slate-200">-</button>
                    <span class="w-6 text-center font-mono-num font-extrabold text-xs">${item.quantity}</span>
                    <button onclick="mobileCartAdd(${id})" class="w-8 h-8 rounded-xl bg-sky-50 font-bold text-sm text-sky-600 flex items-center justify-center active:bg-sky-100">+</button>
                    <button onclick="mobileCartRemove(${id})" class="w-8 h-8 text-slate-400 hover:text-rose-500 font-bold text-xs flex items-center justify-center">&times;</button>
                </div>
            </div>
        `;
    }

    if (totalQty === 0) {
        listContainer.innerHTML = '<div class="text-center text-slate-400 py-8 text-xs">Chưa có sản phẩm nào trong giỏ</div>';
    } else {
        listContainer.innerHTML = html;
    }

    document.getElementById('mob-cart-badge').innerText = totalQty;
    document.getElementById('mob-sheet-items-count').innerText = totalQty;
    document.getElementById('mob-cart-total-display').innerText = formatMoney(subtotal);
    document.getElementById('mob-sheet-subtotal').innerText = formatMoney(subtotal);

    calculateMobileTotal();
}

function calculateMobileTotal() {
    let subtotal = 0;
    for (let id in mobileCart) {
        subtotal += mobileCart[id].quantity * mobileCart[id].price;
    }
    const discountVal = parseFloat(document.getElementById('mob-sheet-discount')?.value) || 0;
    const finalAmount = Math.max(0, subtotal - discountVal);
    document.getElementById('mob-sheet-final-amount').innerText = formatMoney(finalAmount);
}

function openCartSheet() {
    const sheet = document.getElementById('mob-cart-sheet');
    const backdrop = document.getElementById('mob-cart-sheet-backdrop');
    if (!sheet) return;
    backdrop.classList.remove('hidden');
    sheet.classList.remove('translate-y-full');
}

function closeCartSheet() {
    const sheet = document.getElementById('mob-cart-sheet');
    const backdrop = document.getElementById('mob-cart-sheet-backdrop');
    if (!sheet) return;
    sheet.classList.add('translate-y-full');
    backdrop.classList.add('hidden');
}

function selectMobileCat(cat) {
    activeCategory = cat;
    document.querySelectorAll('.mob-cat-pill').forEach(btn => {
        btn.classList.remove('bg-sky-600', 'text-white');
        btn.classList.add('bg-white', 'text-slate-700', 'border', 'border-slate-200');
    });
    const active = window.event?.currentTarget;
    if (active) {
        active.classList.add('bg-sky-600', 'text-white');
        active.classList.remove('bg-white', 'text-slate-700', 'border');
    }
    renderProductGrid(document.getElementById('mob-search-input')?.value || '');
}

function filterMobileProducts(val) {
    renderProductGrid(val);
}

function focusSearch() {
    document.getElementById('mob-search-input')?.focus();
}

function setMobilePayMethod(method) {
    currentPayMethod = method;
    const btnCash = document.getElementById('mob-pay-cash');
    const btnTransfer = document.getElementById('mob-pay-transfer');
    if (method === 'cash') {
        btnCash.className = 'touch-btn py-2 text-center text-xs font-bold rounded-xl border-2 border-sky-600 bg-sky-50 text-sky-700 shadow-xs';
        btnTransfer.className = 'touch-btn py-2 text-center text-xs font-bold rounded-xl border-2 border-slate-200 bg-white text-slate-600';
    } else {
        btnTransfer.className = 'touch-btn py-2 text-center text-xs font-bold rounded-xl border-2 border-sky-600 bg-sky-50 text-sky-700 shadow-xs';
        btnCash.className = 'touch-btn py-2 text-center text-xs font-bold rounded-xl border-2 border-slate-200 bg-white text-slate-600';
    }
}

async function submitMobileOrder() {
    const ids = Object.keys(mobileCart);
    if (ids.length === 0) {
        alert("Giỏ hàng đang trống!");
        return;
    }

    const items = ids.map(id => ({
        product_id: parseInt(id),
        quantity: mobileCart[id].quantity,
        price: mobileCart[id].price,
        unit: mobileCart[id].product.unit || 'cái',
        item_type: mobileCart[id].product.type || 'product'
    }));

    let subtotal = 0;
    items.forEach(i => subtotal += i.quantity * i.price);
    const discount = parseFloat(document.getElementById('mob-sheet-discount')?.value) || 0;
    const finalAmount = Math.max(0, subtotal - discount);

    const payload = {
        customer_id: currentCustomer ? currentCustomer.id : null,
        paid_amount: finalAmount,
        discount: discount,
        payment_method: currentPayMethod,
        note: "Đơn bán qua POS Mobile",
        items: items
    };

    const btn = document.getElementById('btn-submit-mobile-order');
    if (btn) {
        btn.disabled = true;
        btn.innerText = "Đang xử lý...";
    }

    try {
        const res = await fetch('/api/orders', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });

        if (res.ok) {
            const data = await res.json();
            alert("✓ Tạo đơn thành công: " + (data.order_code || data.code || ''));
            clearMobileCart();
            closeCartSheet();
        } else {
            const err = await res.json();
            alert("Lỗi tạo đơn: " + (err.detail || 'Không thể lưu đơn'));
        }
    } catch (e) {
        alert("Lỗi kết nối khi gửi đơn!");
    } finally {
        if (btn) {
            btn.disabled = false;
            btn.innerText = "XÁC NHẬN BÁN & IN BILL";
        }
    }
}

function openSelectCustomerModal() {
    document.getElementById('mob-cust-modal')?.classList.remove('hidden');
    filterCustomerList('');
}

function closeSelectCustomerModal() {
    document.getElementById('mob-cust-modal')?.classList.add('hidden');
}

function filterCustomerList(q) {
    const list = document.getElementById('mob-cust-list');
    if (!list) return;
    let cList = mobileCustomers;
    if (q) {
        const query = q.toLowerCase();
        cList = cList.filter(c => (c.name || '').toLowerCase().includes(query) || (c.phone || '').includes(query));
    }
    list.innerHTML = cList.slice(0, 30).map(c => `
        <div onclick="selectCustomerQuick(${c.id})" class="py-2.5 flex justify-between items-center cursor-pointer active:bg-slate-50">
            <div>
                <div class="font-bold text-slate-800">${c.name}</div>
                <div class="text-[11px] text-slate-400">${c.phone || 'Không SĐT'}</div>
            </div>
            <span class="text-sky-600 font-bold text-xs">Chọn</span>
        </div>
    `).join('');
}

function selectCustomerQuick(id) {
    if (!id) {
        currentCustomer = null;
        document.getElementById('mob-sheet-customer-name').innerText = "Khách lẻ";
    } else {
        currentCustomer = mobileCustomers.find(c => c.id === id);
        document.getElementById('mob-sheet-customer-name').innerText = currentCustomer ? currentCustomer.name : "Khách lẻ";
    }
    closeSelectCustomerModal();
}

function reloadPOSDataMobile() {
    initMobilePOS();
}

document.addEventListener('DOMContentLoaded', initMobilePOS);
