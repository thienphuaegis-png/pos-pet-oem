/**
 * Module Quản Lý Bán Hàng Sàn TMĐT (Shopee & TikTok Shop)
 * Hỗ trợ đồng bộ đơn hàng, ánh xạ sản phẩm kho POS và Trợ lý AI phân tích sản lượng
 */

(function () {
    const state = {
        activeSubTab: 'shopee',
        shopeeAccounts: [],
        tiktokAccounts: [],
        posProducts: [],
        selectedShopeeAccId: null,
        selectedTikTokAccId: null,
        currentDate: new Date().toISOString().split('T')[0]
    };
    window.mktState = state;

    function initMarketplaceTab(subTab = 'shopee') {
        const today = new Date().toISOString().split('T')[0];
        const dateShopee = document.getElementById('mkt-shopee-filter-date');
        if (dateShopee && !dateShopee.value) dateShopee.value = today;

        const dateTikTok = document.getElementById('mkt-tiktok-filter-date');
        if (dateTikTok && !dateTikTok.value) dateTikTok.value = today;

        const dateAnalytics = document.getElementById('mkt-analytics-date');
        if (dateAnalytics && !dateAnalytics.value) dateAnalytics.value = today;

        loadPosProductsCache();
        loadMarketplaceAccounts().then(() => {
            switchMktSubTab(subTab || 'shopee');
        });
    }
    window.initMarketplaceTab = initMarketplaceTab;

    function switchMktSubTab(subTab) {
        state.activeSubTab = subTab;
        const subTabs = ['shopee', 'tiktok', 'mapping', 'analytics'];
        subTabs.forEach(t => {
            const btn = document.getElementById(`btn-subtab-mkt-${t}`);
            const pane = document.getElementById(`pane-mkt-${t}`);
            if (btn) {
                if (t === subTab) {
                    btn.className = 'px-4 py-2.5 text-xs font-bold border-b-2 flex items-center gap-2 transition cursor-pointer ';
                    if (t === 'shopee') btn.className += 'border-orange-500 text-orange-600';
                    else if (t === 'tiktok') btn.className += 'border-slate-900 text-slate-900';
                    else if (t === 'mapping') btn.className += 'border-indigo-600 text-indigo-700';
                    else btn.className += 'border-purple-600 text-purple-700';
                } else {
                    btn.className = 'px-4 py-2.5 text-xs font-semibold text-slate-500 hover:text-slate-700 flex items-center gap-2 transition cursor-pointer';
                }
            }
            if (pane) {
                if (t === subTab) pane.classList.remove('hidden');
                else pane.classList.add('hidden');
            }
        });

        if (subTab === 'shopee') loadShopeeOrders();
        else if (subTab === 'tiktok') loadTikTokOrders();
        else if (subTab === 'mapping') {
            loadUnmappedItems();
            loadSkuMappings();
        } else if (subTab === 'analytics') {
            loadMarketplaceDailyAnalytics();
        }
    }
    window.switchMktSubTab = switchMktSubTab;

    async function loadPosProductsCache() {
        try {
            const res = await fetch('/api/products?is_active=1&limit=500');
            if (res.ok) {
                state.posProducts = await res.json();
                populateProductSelects();
            }
        } catch (e) {
            console.error("loadPosProductsCache error:", e);
        }
    }

    function populateProductSelects() {
        const modalSelect = document.getElementById('map-modal-product-select');
        if (modalSelect) {
            modalSelect.innerHTML = '<option value="">-- Chọn sản phẩm trong kho --</option>' +
                state.posProducts.map(p => `<option value="${p.id}">[${escapeHtml(p.code)}] ${escapeHtml(p.name)} (${p.unit || 'cái'}) - Tồn: ${p.stock}</option>`).join('');
        }
    }

    // ─────────────────────────────────────────────────────────────
    // 1. QUẢN LÝ GIAN HÀNG & PHIÊN ĐĂNG NHẬP COOKIE
    // ─────────────────────────────────────────────────────────────
    async function loadMarketplaceAccounts() {
        try {
            const res = await fetch('/api/marketplace/accounts');
            if (!res.ok) return;
            const accounts = await res.json();
            state.shopeeAccounts = accounts.filter(a => a.platform === 'shopee');
            state.tiktokAccounts = accounts.filter(a => a.platform === 'tiktok');

            renderAccountSelects();
        } catch (e) {
            console.error("loadMarketplaceAccounts error:", e);
        }
    }
    window.loadMarketplaceAccounts = loadMarketplaceAccounts;

    function renderAccountSelects() {
        // Shopee Select
        const shopeeSel = document.getElementById('mkt-shopee-account-select');
        if (shopeeSel) {
            if (state.shopeeAccounts.length === 0) {
                shopeeSel.innerHTML = '<option value="">(Chưa có shop - Bấm Cập nhật Cookie)</option>';
                updateShopeeBadge(false, 'Chưa kết nối');
            } else {
                shopeeSel.innerHTML = state.shopeeAccounts.map(a =>
                    `<option value="${a.id}">${escapeHtml(a.shop_name)}</option>`
                ).join('');
                state.selectedShopeeAccId = state.shopeeAccounts[0].id;
                const acc = state.shopeeAccounts[0];
                updateShopeeBadge(acc.has_cookies, acc.has_cookies ? '🟢 Sẵn sàng' : '🔴 Thiếu Cookie');
            }
        }

        // TikTok Select
        const tiktokSel = document.getElementById('mkt-tiktok-account-select');
        if (tiktokSel) {
            if (state.tiktokAccounts.length === 0) {
                tiktokSel.innerHTML = '<option value="">(Chưa có shop - Bấm Cập nhật Cookie)</option>';
                updateTikTokBadge(false, 'Chưa kết nối');
            } else {
                tiktokSel.innerHTML = state.tiktokAccounts.map(a =>
                    `<option value="${a.id}">${escapeHtml(a.shop_name)}</option>`
                ).join('');
                state.selectedTikTokAccId = state.tiktokAccounts[0].id;
                const acc = state.tiktokAccounts[0];
                updateTikTokBadge(acc.has_cookies, acc.has_cookies ? '🟢 Sẵn sàng' : '🔴 Thiếu Cookie');
            }
        }
    }

    function updateShopeeBadge(ok, text) {
        const badge = document.getElementById('mkt-shopee-status-badge');
        if (!badge) return;
        badge.textContent = text;
        if (ok) {
            badge.className = 'px-2.5 py-1 rounded-full text-[11px] font-bold bg-emerald-100 text-emerald-800';
        } else {
            badge.className = 'px-2.5 py-1 rounded-full text-[11px] font-bold bg-rose-100 text-rose-800';
        }
    }

    function updateTikTokBadge(ok, text) {
        const badge = document.getElementById('mkt-tiktok-status-badge');
        if (!badge) return;
        badge.textContent = text;
        if (ok) {
            badge.className = 'px-2.5 py-1 rounded-full text-[11px] font-bold bg-emerald-100 text-emerald-800';
        } else {
            badge.className = 'px-2.5 py-1 rounded-full text-[11px] font-bold bg-rose-100 text-rose-800';
        }
    }

    function onShopeeAccountChange() {
        const val = document.getElementById('mkt-shopee-account-select')?.value;
        state.selectedShopeeAccId = val ? parseInt(val) : null;
        const acc = state.shopeeAccounts.find(a => a.id === state.selectedShopeeAccId);
        if (acc) updateShopeeBadge(acc.has_cookies, acc.has_cookies ? '🟢 Sẵn sàng' : '🔴 Thiếu Cookie');
        loadShopeeOrders();
    }
    window.onShopeeAccountChange = onShopeeAccountChange;

    function onTikTokAccountChange() {
        const val = document.getElementById('mkt-tiktok-account-select')?.value;
        state.selectedTikTokAccId = val ? parseInt(val) : null;
        const acc = state.tiktokAccounts.find(a => a.id === state.selectedTikTokAccId);
        if (acc) updateTikTokBadge(acc.has_cookies, acc.has_cookies ? '🟢 Sẵn sàng' : '🔴 Thiếu Cookie');
        loadTikTokOrders();
    }
    window.onTikTokAccountChange = onTikTokAccountChange;

    function openMktAccountModal(platform) {
        const modal = document.getElementById('modal-mkt-account-cookie');
        if (!modal) return;
        modal.classList.remove('hidden');

        document.getElementById('mkt-acc-platform').value = platform;
        const isShopee = platform === 'shopee';
        document.getElementById('mkt-modal-platform-icon').textContent = isShopee ? '🟠' : '⚫';
        document.getElementById('mkt-modal-title').textContent = isShopee ? 'Cấu Hình Gian Hàng Shopee' : 'Cấu Hình Gian Hàng TikTok Shop';

        const accounts = isShopee ? state.shopeeAccounts : state.tiktokAccounts;
        if (accounts.length > 0) {
            const acc = accounts[0];
            document.getElementById('mkt-acc-id').value = acc.id;
            document.getElementById('mkt-acc-shop-name').value = acc.shop_name;
            document.getElementById('mkt-acc-cookies').value = '';
        } else {
            document.getElementById('mkt-acc-id').value = '';
            document.getElementById('mkt-acc-shop-name').value = isShopee ? 'Shopee PetCare' : 'TikTok Shop PetCare';
            document.getElementById('mkt-acc-cookies').value = '';
        }
    }
    window.openMktAccountModal = openMktAccountModal;

    function closeMktAccountModal() {
        document.getElementById('modal-mkt-account-cookie')?.classList.add('hidden');
    }
    window.closeMktAccountModal = closeMktAccountModal;

    async function saveMktAccount() {
        const id = document.getElementById('mkt-acc-id').value;
        const platform = document.getElementById('mkt-acc-platform').value;
        const shop_name = document.getElementById('mkt-acc-shop-name').value.trim();
        const cookies = document.getElementById('mkt-acc-cookies').value.trim();

        if (!shop_name) {
            alert('Vui lòng nhập tên gian hàng!');
            return;
        }

        try {
            let res;
            if (id) {
                res = await fetch(`/api/marketplace/accounts/${id}`, {
                    method: 'PUT',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ shop_name, cookies })
                });
            } else {
                res = await fetch('/api/marketplace/accounts', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ platform, shop_name, cookies })
                });
            }

            const data = await res.json();
            if (!res.ok) throw new Error(data.detail || 'Lỗi lưu thông tin');

            if (window.showToast) window.showToast('Lưu thông tin gian hàng thành công!', 'success');
            else alert('Lưu thông tin gian hàng thành công!');

            closeMktAccountModal();
            await loadMarketplaceAccounts();
        } catch (e) {
            alert('Lỗi: ' + e.message);
        }
    }
    window.saveMktAccount = saveMktAccount;

    // ─────────────────────────────────────────────────────────────
    // 2. ĐỒNG BỘ & DANH SÁCH ĐƠN HÀNG SHOPEE
    // ─────────────────────────────────────────────────────────────
    async function syncShopeeOrdersNow() {
        if (!state.selectedShopeeAccId) {
            alert('Vui lòng cấu hình gian hàng Shopee trước!');
            openMktAccountModal('shopee');
            return;
        }

        const btn = document.getElementById('btn-sync-shopee');
        const oldHtml = btn ? btn.innerHTML : '';
        if (btn) {
            btn.innerHTML = '<span>⏳ Đang tải từ Shopee...</span>';
            btn.disabled = true;
        }

        try {
            const res = await fetch('/api/marketplace/shopee/sync', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ account_id: state.selectedShopeeAccId, days_back: 1 })
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.detail || 'Lỗi đồng bộ Shopee');

            if (window.showToast) window.showToast(data.message, 'success');
            else alert(data.message);

            await loadShopeeOrders();
        } catch (e) {
            alert('Lỗi: ' + e.message);
        } finally {
            if (btn) {
                btn.innerHTML = oldHtml;
                btn.disabled = false;
            }
        }
    }
    window.syncShopeeOrdersNow = syncShopeeOrdersNow;

    async function loadShopeeOrders() {
        const date = document.getElementById('mkt-shopee-filter-date')?.value || '';
        const status = document.getElementById('mkt-shopee-status-filter')?.value || 'all';
        const tbody = document.getElementById('mkt-shopee-orders-tbody');
        if (!tbody) return;

        try {
            tbody.innerHTML = '<tr><td colspan="8" class="p-6 text-center text-slate-400">Đang tải danh sách đơn...</td></tr>';
            let url = `/api/marketplace/orders?platform=shopee`;
            if (date) url += `&date=${date}`;
            if (status !== 'all') url += `&status=${status}`;

            const res = await fetch(url);
            if (!res.ok) throw new Error('Không thể tải đơn hàng');
            const orders = await res.json();

            // Cập nhật KPIs
            updateShopeeKPIs(orders);

            if (!orders || orders.length === 0) {
                tbody.innerHTML = '<tr><td colspan="8" class="p-6 text-center text-slate-400">Không có đơn hàng nào trong ngày đã chọn.</td></tr>';
                return;
            }

            tbody.innerHTML = orders.map(o => {
                const itemsHtml = (o.items || []).map(it => {
                    const mappedBadge = it.mapped_product_id
                        ? `<span class="px-1.5 py-0.5 rounded text-[10px] bg-emerald-100 text-emerald-800 font-bold" title="${escapeHtml(it.pos_product_name || '')}">✓ Kho: ${escapeHtml(it.pos_product_code || '')}</span>`
                        : `<button type="button" onclick="promptMapItem('shopee', '${escapeHtml(it.platform_product_name)}', '${escapeHtml(it.platform_variation || '')}')" class="px-1.5 py-0.5 rounded text-[10px] bg-amber-100 hover:bg-amber-200 text-amber-800 font-bold transition">⚠️ Map ngay</button>`;

                    return `
                        <div class="py-1 border-b border-slate-50 last:border-0 flex items-center justify-between gap-2">
                            <div>
                                <span class="font-bold text-slate-800">${escapeHtml(it.platform_product_name)}</span>
                                ${it.platform_variation ? `<span class="text-slate-400 font-normal">(${escapeHtml(it.platform_variation)})</span>` : ''}
                            </div>
                            <div class="flex items-center gap-2">
                                <span class="font-bold text-orange-600 font-mono">x${it.quantity}</span>
                                ${mappedBadge}
                            </div>
                        </div>
                    `;
                }).join('');

                const isFullyMapped = (o.items || []).every(it => it.mapped_product_id);
                const orderMappedStatus = isFullyMapped
                    ? '<span class="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-800">100% Đã Map</span>'
                    : '<span class="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-100 text-amber-800">Cần Ánh Xạ</span>';

                return `
                    <tr class="hover:bg-slate-50 transition">
                        <td class="p-3 font-mono font-bold text-slate-900">${escapeHtml(o.order_sn)}</td>
                        <td class="p-3 text-slate-500 font-medium">${formatDateTime(o.order_date)}</td>
                        <td class="p-3 text-slate-700 font-semibold">${escapeHtml(o.buyer_username || 'Khách Shopee')}</td>
                        <td class="p-3 max-w-sm">${itemsHtml}</td>
                        <td class="p-3 text-center font-bold text-slate-800">${o.total_qty || 0}</td>
                        <td class="p-3 text-right font-bold text-emerald-600 font-mono">${formatMoney(o.total_amount)} đ</td>
                        <td class="p-3 text-center font-medium">
                            <span class="px-2 py-0.5 rounded text-[10px] font-bold bg-slate-100 text-slate-700">${escapeHtml(o.order_status)}</span>
                        </td>
                        <td class="p-3 text-center">${orderMappedStatus}</td>
                    </tr>
                `;
            }).join('');
        } catch (e) {
            tbody.innerHTML = `<tr><td colspan="8" class="p-6 text-center text-rose-500">Lỗi: ${e.message}</td></tr>`;
        }
    }
    window.loadShopeeOrders = loadShopeeOrders;

    function updateShopeeKPIs(orders) {
        const count = orders.length;
        let totalItems = 0;
        let totalRev = 0;
        let mappedItems = 0;

        orders.forEach(o => {
            totalRev += (o.total_amount || 0);
            (o.items || []).forEach(it => {
                totalItems += (it.quantity || 1);
                if (it.mapped_product_id) mappedItems += (it.quantity || 1);
            });
        });

        document.getElementById('kpi-shopee-order-count').textContent = count;
        document.getElementById('kpi-shopee-items-sold').textContent = totalItems;
        document.getElementById('kpi-shopee-revenue').textContent = formatMoney(totalRev) + ' đ';

        const ratio = totalItems > 0 ? Math.round((mappedItems / totalItems) * 100) : 100;
        document.getElementById('kpi-shopee-mapped-ratio').textContent = `${ratio}%`;
    }

    // ─────────────────────────────────────────────────────────────
    // 3. ĐỒNG BỘ & DANH SÁCH ĐƠN HÀNG TIKTOK SHOP
    // ─────────────────────────────────────────────────────────────
    async function syncTikTokOrdersNow() {
        if (!state.selectedTikTokAccId) {
            alert('Vui lòng cấu hình gian hàng TikTok Shop trước!');
            openMktAccountModal('tiktok');
            return;
        }

        const btn = document.getElementById('btn-sync-tiktok');
        const oldHtml = btn ? btn.innerHTML : '';
        if (btn) {
            btn.innerHTML = '<span>⏳ Đang tải từ TikTok...</span>';
            btn.disabled = true;
        }

        try {
            const res = await fetch('/api/marketplace/tiktok/sync', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ account_id: state.selectedTikTokAccId, days_back: 1 })
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.detail || 'Lỗi đồng bộ TikTok');

            if (window.showToast) window.showToast(data.message, 'success');
            else alert(data.message);

            await loadTikTokOrders();
        } catch (e) {
            alert('Lỗi: ' + e.message);
        } finally {
            if (btn) {
                btn.innerHTML = oldHtml;
                btn.disabled = false;
            }
        }
    }
    window.syncTikTokOrdersNow = syncTikTokOrdersNow;

    async function loadTikTokOrders() {
        const date = document.getElementById('mkt-tiktok-filter-date')?.value || '';
        const status = document.getElementById('mkt-tiktok-status-filter')?.value || 'all';
        const tbody = document.getElementById('mkt-tiktok-orders-tbody');
        if (!tbody) return;

        try {
            tbody.innerHTML = '<tr><td colspan="8" class="p-6 text-center text-slate-400">Đang tải danh sách đơn TikTok...</td></tr>';
            let url = `/api/marketplace/orders?platform=tiktok`;
            if (date) url += `&date=${date}`;
            if (status !== 'all') url += `&status=${status}`;

            const res = await fetch(url);
            if (!res.ok) throw new Error('Không thể tải đơn hàng');
            const orders = await res.json();

            if (!orders || orders.length === 0) {
                tbody.innerHTML = '<tr><td colspan="8" class="p-6 text-center text-slate-400">Chưa có đơn hàng TikTok Shop nào trong ngày này.</td></tr>';
                return;
            }

            tbody.innerHTML = orders.map(o => {
                const itemsHtml = (o.items || []).map(it => {
                    const mappedBadge = it.mapped_product_id
                        ? `<span class="px-1.5 py-0.5 rounded text-[10px] bg-emerald-100 text-emerald-800 font-bold">✓ Kho: ${escapeHtml(it.pos_product_code || '')}</span>`
                        : `<button type="button" onclick="promptMapItem('tiktok', '${escapeHtml(it.platform_product_name)}', '${escapeHtml(it.platform_variation || '')}')" class="px-1.5 py-0.5 rounded text-[10px] bg-amber-100 hover:bg-amber-200 text-amber-800 font-bold transition">⚠️ Map ngay</button>`;

                    return `
                        <div class="py-1 border-b border-slate-50 last:border-0 flex items-center justify-between gap-2">
                            <div>
                                <span class="font-bold text-slate-800">${escapeHtml(it.platform_product_name)}</span>
                                ${it.platform_variation ? `<span class="text-slate-400 font-normal">(${escapeHtml(it.platform_variation)})</span>` : ''}
                            </div>
                            <div class="flex items-center gap-2">
                                <span class="font-bold text-slate-900 font-mono">x${it.quantity}</span>
                                ${mappedBadge}
                            </div>
                        </div>
                    `;
                }).join('');

                return `
                    <tr class="hover:bg-slate-50 transition">
                        <td class="p-3 font-mono font-bold text-slate-900">${escapeHtml(o.order_sn)}</td>
                        <td class="p-3 text-slate-500 font-medium">${formatDateTime(o.order_date)}</td>
                        <td class="p-3 text-slate-700 font-semibold">${escapeHtml(o.buyer_username || 'Khách TikTok')}</td>
                        <td class="p-3 max-w-sm">${itemsHtml}</td>
                        <td class="p-3 text-center font-bold text-slate-800">${o.total_qty || 0}</td>
                        <td class="p-3 text-right font-bold text-emerald-600 font-mono">${formatMoney(o.total_amount)} đ</td>
                        <td class="p-3 text-center">
                            <span class="px-2 py-0.5 rounded text-[10px] font-bold bg-slate-100 text-slate-700">${escapeHtml(o.order_status)}</span>
                        </td>
                        <td class="p-3 text-center">
                            <span class="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-800">OK</span>
                        </td>
                    </tr>
                `;
            }).join('');
        } catch (e) {
            tbody.innerHTML = `<tr><td colspan="8" class="p-6 text-center text-rose-500">Lỗi: ${e.message}</td></tr>`;
        }
    }
    window.loadTikTokOrders = loadTikTokOrders;

    // ─────────────────────────────────────────────────────────────
    // 4. ÁNH XẠ SẢN PHẨM (SKU MAPPING)
    // ─────────────────────────────────────────────────────────────
    async function loadUnmappedItems() {
        const tbody = document.getElementById('unmapped-items-tbody');
        if (!tbody) return;

        try {
            const res = await fetch('/api/marketplace/unmapped-items');
            if (!res.ok) return;
            const items = await res.json();

            document.getElementById('unmapped-count').textContent = items.length;

            if (!items || items.length === 0) {
                tbody.innerHTML = '<tr><td colspan="6" class="p-4 text-center text-slate-400">Tuyệt vời! Tất cả sản phẩm đều đã được ánh xạ.</td></tr>';
                return;
            }

            tbody.innerHTML = items.map((it, idx) => {
                const safeName = (it.platform_product_name || '').replace(/'/g, "\\'");
                const safeVar = (it.platform_variation || '').replace(/'/g, "\\'");
                const platformBadge = it.platform === 'shopee'
                    ? '<span class="px-2 py-0.5 rounded text-[10px] font-bold bg-orange-100 text-orange-800">Shopee</span>'
                    : '<span class="px-2 py-0.5 rounded text-[10px] font-bold bg-slate-900 text-white">TikTok</span>';

                const selectOptions = state.posProducts.map(p =>
                    `<option value="${p.id}">[${escapeHtml(p.code)}] ${escapeHtml(p.name)} (${p.unit || 'cái'}) - Tồn: ${p.stock}</option>`
                ).join('');

                return `
                    <tr class="hover:bg-amber-50/40 transition">
                        <td class="p-2.5">${platformBadge}</td>
                        <td class="p-2.5 font-bold text-slate-800">${escapeHtml(it.platform_product_name)}</td>
                        <td class="p-2.5 text-slate-500">${escapeHtml(it.platform_variation || 'Mặc định')}</td>
                        <td class="p-2.5 text-center font-bold text-orange-600 font-mono">${it.total_sold_qty || 1}</td>
                        <td class="p-2.5">
                            <select id="quick-map-sel-${idx}" class="w-full border border-slate-300 rounded px-2 py-1 text-xs font-semibold text-slate-800 bg-white focus:outline-none">
                                <option value="">-- Chọn sản phẩm kho POS --</option>
                                ${selectOptions}
                            </select>
                        </td>
                        <td class="p-2.5 text-center">
                            <button type="button" onclick="saveQuickMapFromRow(${idx}, '${it.platform}', '${safeName}', '${safeVar}')" class="px-2.5 py-1 bg-emerald-600 hover:bg-emerald-700 text-white rounded font-bold text-xs shadow-xs transition">Lưu</button>
                        </td>
                    </tr>
                `;
            }).join('');
        } catch (e) {
            console.error("loadUnmappedItems error:", e);
        }
    }
    window.loadUnmappedItems = loadUnmappedItems;

    async function saveQuickMapFromRow(idx, platform, itemName, variation) {
        const sel = document.getElementById(`quick-map-sel-${idx}`);
        const productId = sel ? parseInt(sel.value) : null;
        if (!productId) {
            alert('Vui lòng chọn sản phẩm trong kho để ánh xạ!');
            return;
        }

        try {
            const res = await fetch('/api/marketplace/mappings', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    platform: platform,
                    platform_item_name: itemName,
                    platform_variation: variation,
                    product_id: productId
                })
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.detail || 'Lỗi ánh xạ');

            if (window.showToast) window.showToast('Đã ánh xạ sản phẩm thành công!', 'success');
            await loadUnmappedItems();
            await loadSkuMappings();
        } catch (e) {
            alert('Lỗi: ' + e.message);
        }
    }
    window.saveQuickMapFromRow = saveQuickMapFromRow;

    async function loadSkuMappings() {
        const tbody = document.getElementById('sku-mappings-tbody');
        if (!tbody) return;

        try {
            tbody.innerHTML = '<tr><td colspan="6" class="p-4 text-center text-slate-400">Đang tải danh sách...</td></tr>';
            const res = await fetch('/api/marketplace/mappings');
            if (!res.ok) throw new Error('Không thể tải danh sách luật');
            const mappings = await res.json();

            if (!mappings || mappings.length === 0) {
                tbody.innerHTML = '<tr><td colspan="6" class="p-4 text-center text-slate-400">Chưa có luật ánh xạ nào.</td></tr>';
                return;
            }

            tbody.innerHTML = mappings.map(m => {
                const platformBadge = m.platform === 'shopee'
                    ? '<span class="px-2 py-0.5 rounded text-[10px] font-bold bg-orange-100 text-orange-800">Shopee</span>'
                    : '<span class="px-2 py-0.5 rounded text-[10px] font-bold bg-slate-900 text-white">TikTok</span>';

                return `
                    <tr class="hover:bg-slate-50 transition">
                        <td class="p-2.5">${platformBadge}</td>
                        <td class="p-2.5 font-bold text-slate-800">${escapeHtml(m.platform_item_name)}</td>
                        <td class="p-2.5 text-slate-500">${escapeHtml(m.platform_variation || 'Mặc định')}</td>
                        <td class="p-2.5 font-bold text-indigo-700">
                            [${escapeHtml(m.pos_code)}] ${escapeHtml(m.pos_name)}
                        </td>
                        <td class="p-2.5 text-center font-mono font-bold text-slate-800">${m.pos_stock} ${m.pos_unit || ''}</td>
                        <td class="p-2.5 text-center">
                            <button type="button" onclick="deleteSkuMapping(${m.id})" class="px-2 py-1 bg-rose-50 hover:bg-rose-100 text-rose-600 rounded text-xs font-semibold transition">Xóa</button>
                        </td>
                    </tr>
                `;
            }).join('');
        } catch (e) {
            tbody.innerHTML = `<tr><td colspan="6" class="p-4 text-center text-rose-500">Lỗi: ${e.message}</td></tr>`;
        }
    }
    window.loadSkuMappings = loadSkuMappings;

    async function deleteSkuMapping(id) {
        if (!confirm('Bạn có chắc muốn xóa luật ánh xạ này?')) return;
        try {
            const res = await fetch(`/api/marketplace/mappings/${id}`, { method: 'DELETE' });
            if (res.ok) {
                if (window.showToast) window.showToast('Đã xóa luật ánh xạ', 'success');
                await loadSkuMappings();
                await loadUnmappedItems();
            }
        } catch (e) {
            alert('Lỗi: ' + e.message);
        }
    }
    window.deleteSkuMapping = deleteSkuMapping;

    async function autoMapWithAI() {
        try {
            const res = await fetch('/api/marketplace/auto-map', { method: 'POST' });
            const data = await res.json();
            if (!res.ok) throw new Error(data.detail || 'Lỗi so khớp tự động');

            if (window.showToast) window.showToast(data.message, 'success');
            else alert(data.message);

            await loadUnmappedItems();
            await loadSkuMappings();
        } catch (e) {
            alert('Lỗi: ' + e.message);
        }
    }
    window.autoMapWithAI = autoMapWithAI;

    function openManualMappingModal() {
        populateProductSelects();
        document.getElementById('modal-mkt-mapping')?.classList.remove('hidden');
    }
    window.openManualMappingModal = openManualMappingModal;

    function closeManualMappingModal() {
        document.getElementById('modal-mkt-mapping')?.classList.add('hidden');
    }
    window.closeManualMappingModal = closeManualMappingModal;

    async function saveManualMappingModal() {
        const platform = document.getElementById('map-modal-platform').value;
        const platform_item_name = document.getElementById('map-modal-item-name').value.trim();
        const platform_variation = document.getElementById('map-modal-variation').value.trim();
        const product_id = parseInt(document.getElementById('map-modal-product-select').value);

        if (!platform_item_name) {
            alert('Vui lòng nhập tên sản phẩm trên sàn!');
            return;
        }
        if (!product_id) {
            alert('Vui lòng chọn sản phẩm kho POS tương ứng!');
            return;
        }

        try {
            const res = await fetch('/api/marketplace/mappings', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ platform, platform_item_name, platform_variation, product_id })
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.detail || 'Lỗi lưu luật ánh xạ');

            if (window.showToast) window.showToast('Đã thêm luật ánh xạ thành công!', 'success');
            closeManualMappingModal();
            await loadSkuMappings();
            await loadUnmappedItems();
        } catch (e) {
            alert('Lỗi: ' + e.message);
        }
    }
    window.saveManualMappingModal = saveManualMappingModal;

    function promptMapItem(platform, itemName, variation) {
        openManualMappingModal();
        document.getElementById('map-modal-platform').value = platform;
        document.getElementById('map-modal-item-name').value = itemName;
        document.getElementById('map-modal-variation').value = variation;
    }
    window.promptMapItem = promptMapItem;

    // ─────────────────────────────────────────────────────────────
    // 5. THỐNG KÊ SẢN LƯỢNG BÁN TRONG NGÀY & TRỢ LÝ AI CHAT
    // ─────────────────────────────────────────────────────────────
    async function loadMarketplaceDailyAnalytics() {
        const dateInput = document.getElementById('mkt-analytics-date');
        const targetDate = dateInput?.value || new Date().toISOString().split('T')[0];
        const tbody = document.getElementById('daily-analytics-tbody');
        if (!tbody) return;

        try {
            tbody.innerHTML = '<tr><td colspan="7" class="p-6 text-center text-slate-400">Đang tổng hợp dữ liệu toàn hệ thống...</td></tr>';
            const res = await fetch(`/api/marketplace/analytics/daily-products?date=${targetDate}`);
            if (!res.ok) throw new Error('Không thể tải báo cáo sản lượng');
            const data = await res.json();

            // Cập nhật thẻ KPI
            const s = data.summary || {};
            document.getElementById('kpi-total-sold-all').textContent = s.total_sold_qty || 0;
            document.getElementById('kpi-total-sold-pos').textContent = s.pos_sold_qty || 0;
            document.getElementById('kpi-total-sold-shopee').textContent = s.shopee_sold_qty || 0;
            document.getElementById('kpi-total-sold-tiktok').textContent = s.tiktok_sold_qty || 0;
            document.getElementById('daily-product-count-badge').textContent = `${s.unique_products_sold || 0} mặt hàng có phát sinh`;

            const items = data.items || [];
            if (items.length === 0) {
                tbody.innerHTML = '<tr><td colspan="7" class="p-6 text-center text-slate-400">Không có sản phẩm nào bán ra trong ngày này.</td></tr>';
                return;
            }

            tbody.innerHTML = items.map(it => {
                const stockWarning = it.stock <= 5 ? 'text-rose-600 font-bold' : 'text-slate-700';

                return `
                    <tr class="hover:bg-slate-50 transition">
                        <td class="p-2.5">
                            <div class="font-bold text-slate-900">${escapeHtml(it.name)}</div>
                            <div class="text-[10px] text-slate-400 font-mono">${escapeHtml(it.code)}</div>
                        </td>
                        <td class="p-2.5 text-center text-slate-500 font-medium">${escapeHtml(it.unit || '')}</td>
                        <td class="p-2.5 text-center font-bold text-sky-600 font-mono">${it.pos_qty}</td>
                        <td class="p-2.5 text-center font-bold text-orange-600 font-mono">${it.shopee_qty}</td>
                        <td class="p-2.5 text-center font-bold text-slate-900 font-mono">${it.tiktok_qty}</td>
                        <td class="p-2.5 text-center font-bold text-indigo-700 font-mono bg-indigo-50/50 text-sm">${it.total_qty}</td>
                        <td class="p-2.5 text-center font-mono ${stockWarning}">${it.stock}</td>
                    </tr>
                `;
            }).join('');
        } catch (e) {
            tbody.innerHTML = `<tr><td colspan="7" class="p-6 text-center text-rose-500">Lỗi: ${e.message}</td></tr>`;
        }
    }
    window.loadMarketplaceDailyAnalytics = loadMarketplaceDailyAnalytics;

    function askMarketplaceAI(text) {
        const inp = document.getElementById('mkt-ai-prompt-input');
        if (inp) {
            inp.value = text;
            sendMarketplaceAIChat();
        }
    }
    window.askMarketplaceAI = askMarketplaceAI;

    async function sendMarketplaceAIChat() {
        const inp = document.getElementById('mkt-ai-prompt-input');
        const prompt = (inp?.value || '').trim();
        if (!prompt) return;

        const date = document.getElementById('mkt-analytics-date')?.value || new Date().toISOString().split('T')[0];
        const container = document.getElementById('mkt-ai-chat-messages');

        // Render user message
        const userMsgDiv = document.createElement('div');
        userMsgDiv.className = 'bg-indigo-600 text-white p-2.5 rounded-lg ml-8 text-xs font-medium';
        userMsgDiv.textContent = prompt;
        container.appendChild(userMsgDiv);
        inp.value = '';

        // Render thinking message
        const aiMsgDiv = document.createElement('div');
        aiMsgDiv.className = 'bg-white p-3 rounded-lg border border-slate-200 shadow-2xs mr-8 text-xs text-slate-700 space-y-1.5';
        aiMsgDiv.innerHTML = '<div class="text-purple-600 font-bold flex items-center gap-1.5"><span>⏳</span> AI đang tổng hợp và phân tích dữ liệu...</div>';
        container.appendChild(aiMsgDiv);
        container.scrollTop = container.scrollHeight;

        try {
            const res = await fetch('/api/marketplace/ai-analytics', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ prompt, date })
            });
            const data = await res.json();

            let replyHtml = (data.reply || 'Không có phản hồi')
                .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
                .replace(/\n/g, '<br>');

            aiMsgDiv.innerHTML = `
                <div class="font-bold text-purple-700 flex items-center gap-1 text-[11px]">
                    <span>✨ Phân Tích Doanh Số (Gemini AI):</span>
                </div>
                <div class="leading-relaxed text-slate-800">${replyHtml}</div>
            `;
        } catch (e) {
            aiMsgDiv.innerHTML = `<div class="text-rose-500 font-bold">Lỗi kết nối AI: ${e.message}</div>`;
        }
        container.scrollTop = container.scrollHeight;
    }
    window.sendMarketplaceAIChat = sendMarketplaceAIChat;

})();
