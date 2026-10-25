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
        currentDate: (typeof getLocalTodayDateStr === 'function') ? getLocalTodayDateStr() : new Intl.DateTimeFormat('en-CA').format(new Date())
    };
    window.mktState = state;

    function initMarketplaceTab(subTab = 'shopee') {
        const today = (typeof getLocalTodayDateStr === 'function') ? getLocalTodayDateStr() : new Intl.DateTimeFormat('en-CA').format(new Date());
        const dateShopee = document.getElementById('mkt-shopee-filter-date');
        if (dateShopee) dateShopee.value = ''; // Mặc định để trống để xem tất cả đơn vừa đồng bộ

        const dateTikTok = document.getElementById('mkt-tiktok-filter-date');
        if (dateTikTok) dateTikTok.value = '';

        const dateAnalytics = document.getElementById('mkt-analytics-date');
        if (dateAnalytics && !dateAnalytics.value) dateAnalytics.value = today;

        loadPosProductsCache();
        loadMarketplaceAccounts().then(() => {
            switchMktSubTab(subTab || 'shopee');
        });
    }
    window.initMarketplaceTab = initMarketplaceTab;

    function clearShopeeDateFilter() {
        const dateShopee = document.getElementById('mkt-shopee-filter-date');
        if (dateShopee) dateShopee.value = '';
        loadShopeeOrders();
    }
    window.clearShopeeDateFilter = clearShopeeDateFilter;

    function clearTikTokDateFilter() {
        const dateTikTok = document.getElementById('mkt-tiktok-filter-date');
        if (dateTikTok) dateTikTok.value = '';
        loadTikTokOrders();
    }
    window.clearTikTokDateFilter = clearTikTokDateFilter;

    function switchMktSubTab(subTab) {
        state.activeSubTab = subTab;
        const subTabs = ['shopee', 'tiktok', 'pancake', 'koc', 'mapping', 'analytics'];
        subTabs.forEach(t => {
            const btn = document.getElementById(`btn-subtab-mkt-${t}`);
            const pane = document.getElementById(`pane-mkt-${t}`);
            if (btn) {
                if (t === subTab) {
                    btn.className = 'px-4 py-2.5 text-xs font-bold border-b-2 flex items-center gap-2 transition cursor-pointer ';
                    if (t === 'shopee') btn.className += 'border-orange-500 text-orange-600';
                    else if (t === 'tiktok') btn.className += 'border-slate-900 text-slate-900';
                    else if (t === 'pancake') btn.className += 'border-amber-500 text-amber-700';
                    else if (t === 'koc') btn.className += 'border-pink-600 text-pink-700';
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
        else if (subTab === 'pancake') loadPancakeTab();
        else if (subTab === 'koc') loadKocTab();
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
            state.pancakeAccounts = accounts.filter(a => a.platform === 'pancake');

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
        const resDiv = document.getElementById('mkt-test-conn-result');
        if (resDiv) resDiv.classList.add('hidden');
    }
    window.closeMktAccountModal = closeMktAccountModal;

    async function testMktConnection() {
        const cookies = document.getElementById('mkt-acc-cookies').value.trim();
        const resDiv = document.getElementById('mkt-test-conn-result');
        const btn = document.getElementById('btn-test-mkt-conn');

        if (!cookies) {
            alert('Vui lòng dán Cookie hoặc cURL trước khi thử kết nối!');
            return;
        }

        if (!resDiv) return;
        resDiv.classList.remove('hidden');
        resDiv.className = 'mt-2 p-2 rounded-lg text-[11px] bg-slate-100 text-slate-700 font-bold';
        resDiv.innerHTML = '⏳ Đang gửi request kiểm tra tới Shopee...';
        if (btn) btn.disabled = true;

        try {
            const res = await fetch('/api/marketplace/shopee/test-connection', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ cookies })
            });
            const data = await res.json();
            if (data.status === 'ok') {
                resDiv.className = 'mt-2 p-2 rounded-lg text-[11px] bg-emerald-100 text-emerald-800 font-bold';
                resDiv.innerHTML = `✅ ${escapeHtml(data.message)} (SPC_CDS: ${data.spc_cds || 'OK'})`;
            } else {
                resDiv.className = 'mt-2 p-2 rounded-lg text-[11px] bg-rose-100 text-rose-800 font-bold';
                resDiv.innerHTML = `❌ ${escapeHtml(data.message)}`;
            }
        } catch (e) {
            resDiv.className = 'mt-2 p-2 rounded-lg text-[11px] bg-rose-100 text-rose-800 font-bold';
            resDiv.innerHTML = `❌ Lỗi: ${e.message}`;
        } finally {
            if (btn) btn.disabled = false;
        }
    }
    window.testMktConnection = testMktConnection;

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

            // Xóa bộ lọc ngày để hiển thị toàn bộ các đơn vừa tải về
            const dateShopee = document.getElementById('mkt-shopee-filter-date');
            if (dateShopee) dateShopee.value = '';

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

    let selectedExcelFile = null;

    function openImportExcelModal(platform = 'shopee') {
        const modal = document.getElementById('modal-mkt-import-excel');
        if (!modal) return;
        modal.classList.remove('hidden');

        document.getElementById('import-excel-platform').value = platform;
        const radio = document.querySelector(`input[name="import-excel-plat-choice"][value="${platform}"]`);
        if (radio) radio.checked = true;

        clearSelectedExcelFile();
        setupExcelDropzone();
    }
    window.openImportExcelModal = openImportExcelModal;

    function closeImportExcelModal() {
        document.getElementById('modal-mkt-import-excel')?.classList.add('hidden');
    }
    window.closeImportExcelModal = closeImportExcelModal;

    function setupExcelDropzone() {
        const dropzone = document.getElementById('mkt-excel-dropzone');
        if (!dropzone || dropzone.dataset.hasDropHandler) return;
        dropzone.dataset.hasDropHandler = 'true';

        ['dragenter', 'dragover'].forEach(name => {
            dropzone.addEventListener(name, (e) => {
                e.preventDefault();
                e.stopPropagation();
                dropzone.classList.add('border-emerald-600', 'bg-emerald-100/50');
            });
        });

        ['dragleave', 'drop'].forEach(name => {
            dropzone.addEventListener(name, (e) => {
                e.preventDefault();
                e.stopPropagation();
                dropzone.classList.remove('border-emerald-600', 'bg-emerald-100/50');
            });
        });

        dropzone.addEventListener('drop', (e) => {
            const files = e.dataTransfer?.files;
            if (files && files.length > 0) {
                handleExcelFile(files[0]);
            }
        });
    }

    function onExcelFileSelected(e) {
        const files = e.target?.files;
        if (files && files.length > 0) {
            handleExcelFile(files[0]);
        }
    }
    window.onExcelFileSelected = onExcelFileSelected;

    function handleExcelFile(file) {
        if (!file.name.endsWith('.xlsx') && !file.name.endsWith('.xls')) {
            alert('Vui lòng chọn file Excel có định dạng .xlsx hoặc .xls!');
            return;
        }

        selectedExcelFile = file;
        const infoDiv = document.getElementById('mkt-selected-file-info');
        const nameEl = document.getElementById('mkt-selected-file-name');
        const sizeEl = document.getElementById('mkt-selected-file-size');
        const dropzone = document.getElementById('mkt-excel-dropzone');

        if (infoDiv) infoDiv.classList.remove('hidden');
        if (dropzone) dropzone.classList.add('hidden');
        if (nameEl) nameEl.textContent = file.name;
        if (sizeEl) sizeEl.textContent = `${(file.size / 1024).toFixed(1)} KB`;

        const statusDiv = document.getElementById('mkt-excel-import-status');
        if (statusDiv) statusDiv.classList.add('hidden');
    }

    function clearSelectedExcelFile() {
        selectedExcelFile = null;
        const fileInput = document.getElementById('mkt-excel-file-input');
        if (fileInput) fileInput.value = '';

        const infoDiv = document.getElementById('mkt-selected-file-info');
        const dropzone = document.getElementById('mkt-excel-dropzone');
        const statusDiv = document.getElementById('mkt-excel-import-status');

        if (infoDiv) infoDiv.classList.add('hidden');
        if (dropzone) dropzone.classList.remove('hidden');
        if (statusDiv) statusDiv.classList.add('hidden');
    }
    window.clearSelectedExcelFile = clearSelectedExcelFile;

    async function submitImportExcel() {
        if (!selectedExcelFile) {
            alert('Vui lòng kéo thả hoặc chọn file Excel trước khi bắt đầu nhập!');
            return;
        }

        const platform = document.getElementById('import-excel-platform')?.value || 'shopee';
        const account_id = platform === 'shopee' ? state.selectedShopeeAccId : state.selectedTikTokAccId;
        const btn = document.getElementById('btn-submit-import-excel');
        const statusDiv = document.getElementById('mkt-excel-import-status');

        const formData = new FormData();
        formData.append('file', selectedExcelFile);
        formData.append('platform', platform);
        if (account_id) formData.append('account_id', account_id);

        if (btn) {
            btn.disabled = true;
            btn.innerHTML = '<span>⏳ Đang xử lý file Excel...</span>';
        }
        if (statusDiv) {
            statusDiv.classList.remove('hidden');
            statusDiv.className = 'p-2.5 rounded-lg text-xs font-bold bg-amber-50 text-amber-800 border border-amber-200';
            statusDiv.innerHTML = '⏳ Đang đọc dữ liệu từng dòng đơn hàng...';
        }

        try {
            const res = await fetch('/api/marketplace/orders/import-excel', {
                method: 'POST',
                body: formData
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.detail || 'Lỗi đọc file Excel');

            if (statusDiv) {
                statusDiv.className = 'p-2.5 rounded-lg text-xs font-bold bg-emerald-50 text-emerald-800 border border-emerald-200';
                statusDiv.innerHTML = `✅ ${escapeHtml(data.message)}`;
            }

            if (window.showToast) window.showToast(data.message, 'success');
            else alert(data.message);

            setTimeout(() => {
                closeImportExcelModal();
                const dateShopee = document.getElementById('mkt-shopee-filter-date');
                if (dateShopee) dateShopee.value = '';
                if (platform === 'shopee') loadShopeeOrders();
                else loadTikTokOrders();
            }, 1200);
        } catch (e) {
            if (statusDiv) {
                statusDiv.className = 'p-2.5 rounded-lg text-xs font-bold bg-rose-50 text-rose-800 border border-rose-200';
                statusDiv.innerHTML = `❌ Lỗi: ${escapeHtml(e.message)}`;
            }
            alert('Lỗi nhập Excel: ' + e.message);
        } finally {
            if (btn) {
                btn.disabled = false;
                btn.innerHTML = '<span>🚀 Bắt Đầu Nhập Đơn</span>';
            }
        }
    }
    window.submitImportExcel = submitImportExcel;

    function openImportJsonModal(platform = 'shopee') {
        const modal = document.getElementById('modal-mkt-import-json');
        if (!modal) return;
        modal.classList.remove('hidden');
        document.getElementById('import-json-platform').value = platform;
        const textarea = document.getElementById('import-json-data');
        if (textarea) {
            textarea.value = '';
            setTimeout(() => textarea.focus(), 100);
        }
    }
    window.openImportJsonModal = openImportJsonModal;

    function closeImportJsonModal() {
        document.getElementById('modal-mkt-import-json')?.classList.add('hidden');
    }
    window.closeImportJsonModal = closeImportJsonModal;

    async function submitImportJson() {
        const platform = document.getElementById('import-json-platform').value;
        const raw_json = document.getElementById('import-json-data').value.trim();
        const account_id = platform === 'shopee' ? state.selectedShopeeAccId : state.selectedTikTokAccId;

        if (!raw_json) {
            alert('Vui lòng dán chuỗi JSON dữ liệu đơn hàng!');
            return;
        }

        try {
            const res = await fetch('/api/marketplace/orders/import-json', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ platform, account_id, raw_json })
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.detail || 'Lỗi nhập JSON');

            if (window.showToast) window.showToast(data.message, 'success');
            else alert(data.message);

            closeImportJsonModal();
            const dateShopee = document.getElementById('mkt-shopee-filter-date');
            if (dateShopee) dateShopee.value = '';
            if (platform === 'shopee') await loadShopeeOrders();
            else await loadTikTokOrders();
        } catch (e) {
            alert('Lỗi: ' + e.message);
        }
    }
    window.submitImportJson = submitImportJson;

    // Quản lý checkbox chọn nhiều đơn hàng sàn
    let selectedMktOrderIds = new Set();

    function toggleSelectAllMktOrders(platform, checked) {
        const checkboxes = document.querySelectorAll(`.chk-mkt-order-${platform}`);
        checkboxes.forEach(cb => {
            cb.checked = checked;
            const id = parseInt(cb.dataset.id);
            if (checked) {
                selectedMktOrderIds.add(id);
            } else {
                selectedMktOrderIds.delete(id);
            }
        });
        updateMktBulkActionBar();
    }
    window.toggleSelectAllMktOrders = toggleSelectAllMktOrders;

    function toggleMktOrderItem(id, checked, platform) {
        if (checked) {
            selectedMktOrderIds.add(id);
        } else {
            selectedMktOrderIds.delete(id);
        }
        const allBoxes = document.querySelectorAll(`.chk-mkt-order-${platform}`);
        const allChecked = allBoxes.length > 0 && Array.from(allBoxes).every(b => b.checked);
        const masterChk = document.getElementById(`chk-${platform}-all`);
        if (masterChk) masterChk.checked = allChecked;
        updateMktBulkActionBar();
    }
    window.toggleMktOrderItem = toggleMktOrderItem;

    function clearMktOrderSelection() {
        selectedMktOrderIds.clear();
        ['shopee', 'tiktok'].forEach(plat => {
            const masterChk = document.getElementById(`chk-${plat}-all`);
            if (masterChk) masterChk.checked = false;
            document.querySelectorAll(`.chk-mkt-order-${plat}`).forEach(b => b.checked = false);
        });
        updateMktBulkActionBar();
    }
    window.clearMktOrderSelection = clearMktOrderSelection;

    function updateMktBulkActionBar() {
        const bar = document.getElementById('mkt-bulk-action-bar');
        const countEl = document.getElementById('mkt-bulk-selected-count');
        const count = selectedMktOrderIds.size;
        if (!bar) return;
        if (count > 0) {
            if (countEl) countEl.innerText = count;
            bar.classList.remove('hidden');
            bar.classList.add('flex', 'animate-in', 'fade-in', 'slide-in-from-bottom-4', 'duration-200');
        } else {
            bar.classList.add('hidden');
            bar.classList.remove('flex');
        }
    }
    window.updateMktBulkActionBar = updateMktBulkActionBar;

    async function deleteSingleMarketplaceOrder(orderId, orderSn, platform) {
        const confirmed = await window.showConfirmModal({
            title: 'Xóa Đơn Hàng Sàn TMĐT',
            message: `Bạn có chắc chắn muốn xóa đơn hàng ${orderSn}?`,
            type: 'danger',
            confirmText: 'Xóa Đơn',
            cancelText: 'Hủy bỏ',
            icon: '🗑️'
        });
        if (!confirmed) return;
        try {
            const res = await fetch(`/api/marketplace/orders/${orderId}`, { method: 'DELETE' });
            const data = await res.json();
            if (res.ok) {
                if (window.showToast) window.showToast(data.message, 'success');
                else alert(data.message);
                selectedMktOrderIds.delete(orderId);
                updateMktBulkActionBar();
                if (platform === 'shopee') await loadShopeeOrders();
                else await loadTikTokOrders();
            } else {
                if (window.showToast) window.showToast('Lỗi: ' + (data.detail || 'Không thể xóa'), 'error');
                else alert('Lỗi: ' + (data.detail || 'Không thể xóa'));
            }
        } catch (e) {
            if (window.showToast) window.showToast('Lỗi kết nối: ' + e.message, 'error');
            else alert('Lỗi kết nối: ' + e.message);
        }
    }
    window.deleteSingleMarketplaceOrder = deleteSingleMarketplaceOrder;

    async function bulkDeleteMarketplaceOrdersAction() {
        const ids = Array.from(selectedMktOrderIds);
        if (ids.length === 0) return;

        const confirmed = await window.showConfirmModal({
            title: 'Xóa Nhiều Đơn Hàng Sàn',
            message: `Bạn có chắc chắn muốn XÓA ${ids.length} đơn hàng đã chọn?`,
            type: 'danger',
            confirmText: `Xóa ${ids.length} Đơn`,
            cancelText: 'Hủy bỏ',
            icon: '🗑️'
        });
        if (!confirmed) return;

        try {
            const res = await fetch('/api/marketplace/orders/bulk-delete', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ order_ids: ids })
            });
            const data = await res.json();
            if (res.ok) {
                if (window.showToast) window.showToast(data.message, 'success');
                else alert(data.message);
                clearMktOrderSelection();
                await Promise.all([loadShopeeOrders(), loadTikTokOrders()]);
            } else {
                if (window.showToast) window.showToast('Lỗi: ' + (data.detail || 'Không thể xóa'), 'error');
                else alert('Lỗi: ' + (data.detail || 'Không thể xóa'));
            }
        } catch (e) {
            if (window.showToast) window.showToast('Lỗi kết nối: ' + e.message, 'error');
            else alert('Lỗi kết nối: ' + e.message);
        }
    }
    window.bulkDeleteMarketplaceOrdersAction = bulkDeleteMarketplaceOrdersAction;

    async function confirmClearAllMarketplaceOrders(platform) {
        const platName = platform === 'shopee' ? 'Shopee' : 'TikTok Shop';
        const confirmed = await window.showConfirmModal({
            title: `Xóa Toàn Bộ Đơn Hàng ${platName}`,
            message: `CẢNH BÁO NGUY HIỂM: Bạn có chắc chắn muốn XÓA TOÀN BỘ đơn hàng ${platName} đã tải về máy?`,
            subMessage: 'Dữ liệu đơn hàng sàn đã xóa trên máy cục bộ sẽ không thể tự phục hồi.',
            type: 'danger',
            confirmText: 'Xóa Toàn Bộ',
            cancelText: 'Hủy bỏ',
            icon: '⚠️'
        });
        if (!confirmed) return;
        try {
            const res = await fetch(`/api/marketplace/orders-clear-all?platform=${platform}`, { method: 'DELETE' });
            const data = await res.json();
            if (res.ok) {
                if (window.showToast) window.showToast(data.message, 'success');
                else alert(data.message);
                clearMktOrderSelection();
                if (platform === 'shopee') await loadShopeeOrders();
                else await loadTikTokOrders();
            } else {
                if (window.showToast) window.showToast('Lỗi: ' + (data.detail || 'Không thể xóa'), 'error');
                else alert('Lỗi: ' + (data.detail || 'Không thể xóa'));
            }
        } catch (e) {
            if (window.showToast) window.showToast('Lỗi kết nối: ' + e.message, 'error');
            else alert('Lỗi kết nối: ' + e.message);
        }
    }
    window.confirmClearAllMarketplaceOrders = confirmClearAllMarketplaceOrders;

    // Trạng thái phân trang & tìm kiếm Shopee
    let mktShopeeCurrentPage = 1;
    let mktShopeeLimit = 50;
    let mktShopeeTotalPages = 1;
    let mktShopeeTotalOrders = 0;
    let shopeeSearchDebounceTimer = null;

    function debounceShopeeOrders() {
        clearTimeout(shopeeSearchDebounceTimer);
        shopeeSearchDebounceTimer = setTimeout(() => {
            loadShopeeOrders(1);
        }, 300);
    }
    window.debounceShopeeOrders = debounceShopeeOrders;

    function prevShopeePage() {
        if (mktShopeeCurrentPage > 1) {
            loadShopeeOrders(mktShopeeCurrentPage - 1);
        }
    }
    window.prevShopeePage = prevShopeePage;

    function nextShopeePage() {
        if (mktShopeeCurrentPage < mktShopeeTotalPages) {
            loadShopeeOrders(mktShopeeCurrentPage + 1);
        }
    }
    window.nextShopeePage = nextShopeePage;

    function changeShopeeLimit(val) {
        mktShopeeLimit = parseInt(val) || 50;
        loadShopeeOrders(1);
    }
    window.changeShopeeLimit = changeShopeeLimit;

    function updateShopeePaginationUI() {
        const pageInfo = document.getElementById('mkt-shopee-page-info');
        const pageNum = document.getElementById('mkt-shopee-page-number');
        const btnPrev = document.getElementById('btn-shopee-prev');
        const btnNext = document.getElementById('btn-shopee-next');

        if (pageInfo) {
            if (mktShopeeTotalOrders === 0) {
                pageInfo.textContent = '(0 đơn hàng)';
            } else {
                const from = (mktShopeeCurrentPage - 1) * mktShopeeLimit + 1;
                const to = Math.min(mktShopeeTotalOrders, mktShopeeCurrentPage * mktShopeeLimit);
                pageInfo.textContent = `(Hiển thị ${from} - ${to} trên ${mktShopeeTotalOrders} đơn)`;
            }
        }
        if (pageNum) {
            pageNum.textContent = `${mktShopeeCurrentPage} / ${mktShopeeTotalPages || 1}`;
        }
        if (btnPrev) {
            btnPrev.disabled = mktShopeeCurrentPage <= 1;
        }
        if (btnNext) {
            btnNext.disabled = mktShopeeCurrentPage >= mktShopeeTotalPages;
        }
    }

    async function loadShopeeOrders(page = 1) {
        mktShopeeCurrentPage = Math.max(1, page);
        const date = document.getElementById('mkt-shopee-filter-date')?.value || '';
        const status = document.getElementById('mkt-shopee-status-filter')?.value || 'all';
        const q = document.getElementById('mkt-shopee-search')?.value.trim() || '';
        const limitSelect = document.getElementById('mkt-shopee-limit');
        if (limitSelect) mktShopeeLimit = parseInt(limitSelect.value) || mktShopeeLimit;

        const tbody = document.getElementById('mkt-shopee-orders-tbody');
        if (!tbody) return;

        try {
            tbody.innerHTML = '<tr><td colspan="12" class="p-6 text-center text-slate-400">Đang tải danh sách đơn...</td></tr>';
            
            const params = new URLSearchParams({
                platform: 'shopee',
                page: mktShopeeCurrentPage,
                limit: mktShopeeLimit
            });
            if (date) params.append('date', date);
            if (status !== 'all') params.append('status', status);
            if (q) params.append('q', q);

            const kpiParams = new URLSearchParams({ platform: 'shopee' });
            if (date) kpiParams.append('date', date);
            if (status !== 'all') kpiParams.append('status', status);
            if (q) kpiParams.append('q', q);

            const [ordersRes, kpiRes] = await Promise.all([
                fetch(`/api/marketplace/orders?${params.toString()}`),
                fetch(`/api/marketplace/orders-kpi?${kpiParams.toString()}`)
            ]);

            if (kpiRes.ok) {
                const kpi = await kpiRes.json();
                updateShopeeKPIsFromData(kpi);
            }

            if (!ordersRes.ok) throw new Error('Không thể tải đơn hàng');
            const data = await ordersRes.json();
            const orders = Array.isArray(data) ? data : (data.orders || []);
            mktShopeeTotalOrders = typeof data.total === 'number' ? data.total : orders.length;
            mktShopeeTotalPages = typeof data.total_pages === 'number' ? data.total_pages : 1;
            mktShopeeCurrentPage = typeof data.page === 'number' ? data.page : mktShopeeCurrentPage;

            updateShopeePaginationUI();

            if (!orders || orders.length === 0) {
                tbody.innerHTML = '<tr><td colspan="12" class="p-6 text-center text-slate-400">Không có đơn hàng nào khớp điều kiện tìm kiếm.</td></tr>';
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
                            <div class="flex items-center gap-2 shrink-0">
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

                const totalFee = (o.fee_fixed || 0) + (o.fee_service || 0) + (o.fee_payment || 0) + (o.shop_voucher || 0);
                const netPayout = o.net_payout > 0 ? o.net_payout : Math.max(0, (o.total_amount || 0) - totalFee);
                const trackingBadge = o.tracking_number ? `<div class="text-[10px] text-slate-400 font-mono mt-0.5">🚚 ${escapeHtml(o.tracking_number)}</div>` : '';
                const isSelected = selectedMktOrderIds.has(o.id);

                return `
                    <tr class="hover:bg-slate-50 transition ${isSelected ? 'bg-orange-50/50' : ''}">
                        <td class="p-3 text-center">
                            <input type="checkbox" data-id="${o.id}" onchange="toggleMktOrderItem(${o.id}, this.checked, 'shopee')" ${isSelected ? 'checked' : ''} class="chk-mkt-order-shopee w-4 h-4 rounded text-orange-600 focus:ring-orange-500 cursor-pointer">
                        </td>
                        <td class="p-3 font-mono font-bold text-slate-900">
                            ${escapeHtml(o.order_sn)}
                            ${trackingBadge}
                        </td>
                        <td class="p-3 text-slate-500 font-medium">${formatDateTime(o.order_date)}</td>
                        <td class="p-3 text-slate-700 font-semibold">${escapeHtml(o.buyer_username && o.buyer_username !== '0.00' ? o.buyer_username : 'Khách Shopee')}</td>
                        <td class="p-3 max-w-sm">${itemsHtml}</td>
                        <td class="p-3 text-center font-bold text-slate-800">${o.total_qty || 0}</td>
                        <td class="p-3 text-right font-medium text-slate-700 font-mono">${formatMoney(o.total_amount)}</td>
                        <td class="p-3 text-right font-medium text-rose-600 font-mono">-${formatMoney(totalFee)}</td>
                        <td class="p-3 text-right font-bold text-emerald-600 font-mono">${formatMoney(netPayout)}</td>
                        <td class="p-3 text-center font-medium">
                            <span class="px-2 py-0.5 rounded text-[10px] font-bold bg-slate-100 text-slate-700">${escapeHtml(o.order_status)}</span>
                        </td>
                        <td class="p-3 text-center">${orderMappedStatus}</td>
                        <td class="p-3 text-center">
                            <button type="button" onclick="deleteSingleMarketplaceOrder(${o.id}, '${escapeHtml(o.order_sn)}', 'shopee')" class="text-slate-400 hover:text-rose-600 font-bold p-1 transition" title="Xóa đơn này">✕</button>
                        </td>
                    </tr>
                `;
            }).join('');
        } catch (e) {
            tbody.innerHTML = `<tr><td colspan="12" class="p-6 text-center text-rose-500">Lỗi: ${e.message}</td></tr>`;
        }
    }
    window.loadShopeeOrders = loadShopeeOrders;

    function updateShopeeKPIsFromData(kpi) {
        const elCount = document.getElementById('kpi-shopee-order-count');
        const elItems = document.getElementById('kpi-shopee-items-sold');
        const elRev = document.getElementById('kpi-shopee-revenue');
        const elRatio = document.getElementById('kpi-shopee-mapped-ratio');

        if (elCount) elCount.textContent = kpi.order_count || 0;
        if (elItems) elItems.textContent = kpi.items_sold || 0;
        if (elRev) elRev.textContent = formatMoney(kpi.total_revenue || 0);
        if (elRatio) elRatio.textContent = `${kpi.mapped_ratio || 0}%`;
    }

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
        document.getElementById('kpi-shopee-revenue').textContent = formatMoney(totalRev);

        const ratio = totalItems > 0 ? Math.round((mappedItems / totalItems) * 100) : 100;
        document.getElementById('kpi-shopee-mapped-ratio').textContent = `${ratio}%`;
    }

    function updateTikTokKPIsFromData(kpi) {
        const elCount = document.getElementById('kpi-tiktok-order-count');
        const elItems = document.getElementById('kpi-tiktok-items-sold');
        const elRev = document.getElementById('kpi-tiktok-revenue');
        const elRatio = document.getElementById('kpi-tiktok-mapped-ratio');

        if (elCount) elCount.textContent = kpi.order_count || 0;
        if (elItems) elItems.textContent = kpi.items_sold || 0;
        if (elRev) elRev.textContent = formatMoney(kpi.total_revenue || 0);
        if (elRatio) elRatio.textContent = `${kpi.mapped_ratio || 0}%`;
    }

    function updateTikTokKPIs(orders) {
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

        const elCount = document.getElementById('kpi-tiktok-order-count');
        const elItems = document.getElementById('kpi-tiktok-items-sold');
        const elRev = document.getElementById('kpi-tiktok-revenue');
        const elRatio = document.getElementById('kpi-tiktok-mapped-ratio');

        if (elCount) elCount.textContent = count;
        if (elItems) elItems.textContent = totalItems;
        if (elRev) elRev.textContent = formatMoney(totalRev);
        if (elRatio) {
            const ratio = totalItems > 0 ? Math.round((mappedItems / totalItems) * 100) : 100;
            elRatio.textContent = `${ratio}%`;
        }
    }

    // ─────────────────────────────────────────────────────────────
    // 3. ĐỒNG BỘ & DANH SÁCH ĐƠN HÀNG TIKTOK SHOP
    // ─────────────────────────────────────────────────────────────
    // Trạng thái phân trang & tìm kiếm TikTok
    let mktTikTokCurrentPage = 1;
    let mktTikTokLimit = 50;
    let mktTikTokTotalPages = 1;
    let mktTikTokTotalOrders = 0;
    let tiktokSearchDebounceTimer = null;

    function debounceTikTokOrders() {
        clearTimeout(tiktokSearchDebounceTimer);
        tiktokSearchDebounceTimer = setTimeout(() => {
            loadTikTokOrders(1);
        }, 300);
    }
    window.debounceTikTokOrders = debounceTikTokOrders;

    function prevTikTokPage() {
        if (mktTikTokCurrentPage > 1) {
            loadTikTokOrders(mktTikTokCurrentPage - 1);
        }
    }
    window.prevTikTokPage = prevTikTokPage;

    function nextTikTokPage() {
        if (mktTikTokCurrentPage < mktTikTokTotalPages) {
            loadTikTokOrders(mktTikTokCurrentPage + 1);
        }
    }
    window.nextTikTokPage = nextTikTokPage;

    function changeTikTokLimit(val) {
        mktTikTokLimit = parseInt(val) || 50;
        loadTikTokOrders(1);
    }
    window.changeTikTokLimit = changeTikTokLimit;

    function updateTikTokPaginationUI() {
        const pageInfo = document.getElementById('mkt-tiktok-page-info');
        const pageNum = document.getElementById('mkt-tiktok-page-number');
        const btnPrev = document.getElementById('btn-tiktok-prev');
        const btnNext = document.getElementById('btn-tiktok-next');

        if (pageInfo) {
            if (mktTikTokTotalOrders === 0) {
                pageInfo.textContent = '(0 đơn hàng)';
            } else {
                const from = (mktTikTokCurrentPage - 1) * mktTikTokLimit + 1;
                const to = Math.min(mktTikTokTotalOrders, mktTikTokCurrentPage * mktTikTokLimit);
                pageInfo.textContent = `(Hiển thị ${from} - ${to} trên ${mktTikTokTotalOrders} đơn)`;
            }
        }
        if (pageNum) {
            pageNum.textContent = `${mktTikTokCurrentPage} / ${mktTikTokTotalPages || 1}`;
        }
        if (btnPrev) {
            btnPrev.disabled = mktTikTokCurrentPage <= 1;
        }
        if (btnNext) {
            btnNext.disabled = mktTikTokCurrentPage >= mktTikTokTotalPages;
        }
    }

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

    async function loadTikTokOrders(page = 1) {
        mktTikTokCurrentPage = Math.max(1, page);
        const date = document.getElementById('mkt-tiktok-filter-date')?.value || '';
        const status = document.getElementById('mkt-tiktok-status-filter')?.value || 'all';
        const q = document.getElementById('mkt-tiktok-search')?.value.trim() || '';
        const limitSelect = document.getElementById('mkt-tiktok-limit');
        if (limitSelect) mktTikTokLimit = parseInt(limitSelect.value) || mktTikTokLimit;

        const tbody = document.getElementById('mkt-tiktok-orders-tbody');
        if (!tbody) return;

        try {
            tbody.innerHTML = '<tr><td colspan="12" class="p-6 text-center text-slate-400">Đang tải danh sách đơn TikTok...</td></tr>';
            
            const params = new URLSearchParams({
                platform: 'tiktok',
                page: mktTikTokCurrentPage,
                limit: mktTikTokLimit
            });
            if (date) params.append('date', date);
            if (status !== 'all') params.append('status', status);
            if (q) params.append('q', q);

            const kpiParams = new URLSearchParams({ platform: 'tiktok' });
            if (date) kpiParams.append('date', date);
            if (status !== 'all') kpiParams.append('status', status);
            if (q) kpiParams.append('q', q);

            const [ordersRes, kpiRes] = await Promise.all([
                fetch(`/api/marketplace/orders?${params.toString()}`),
                fetch(`/api/marketplace/orders-kpi?${kpiParams.toString()}`)
            ]);

            if (kpiRes.ok) {
                const kpi = await kpiRes.json();
                updateTikTokKPIsFromData(kpi);
            }

            if (!ordersRes.ok) throw new Error('Không thể tải đơn hàng');
            const data = await ordersRes.json();
            const orders = Array.isArray(data) ? data : (data.orders || []);
            mktTikTokTotalOrders = typeof data.total === 'number' ? data.total : orders.length;
            mktTikTokTotalPages = typeof data.total_pages === 'number' ? data.total_pages : 1;
            mktTikTokCurrentPage = typeof data.page === 'number' ? data.page : mktTikTokCurrentPage;

            updateTikTokPaginationUI();

            if (!orders || orders.length === 0) {
                tbody.innerHTML = '<tr><td colspan="12" class="p-6 text-center text-slate-400">Chưa có đơn hàng TikTok Shop nào khớp điều kiện tìm kiếm.</td></tr>';
                return;
            }

            tbody.innerHTML = orders.map(o => {
                const itemsHtml = (o.items || []).map(it => {
                    const mappedBadge = it.mapped_product_id
                        ? `<span class="px-1.5 py-0.5 rounded text-[10px] bg-emerald-100 text-emerald-800 font-bold" title="${escapeHtml(it.pos_product_name || '')}">✓ Kho: ${escapeHtml(it.pos_product_code || '')}</span>`
                        : `<button type="button" onclick="promptMapItem('tiktok', '${escapeHtml(it.platform_product_name)}', '${escapeHtml(it.platform_variation || '')}')" class="px-1.5 py-0.5 rounded text-[10px] bg-amber-100 hover:bg-amber-200 text-amber-800 font-bold transition">⚠️ Map ngay</button>`;

                    const skuHint = it.platform_sku ? `<span class="text-[10px] text-slate-400 font-mono">[${escapeHtml(it.platform_sku)}]</span> ` : '';

                    return `
                        <div class="py-1 border-b border-slate-50 last:border-0 flex items-center justify-between gap-2">
                            <div>
                                ${skuHint}<span class="font-bold text-slate-800">${escapeHtml(it.platform_product_name)}</span>
                                ${it.platform_variation ? `<span class="text-slate-400 font-normal">(${escapeHtml(it.platform_variation)})</span>` : ''}
                            </div>
                            <div class="flex items-center gap-2 shrink-0">
                                <span class="font-bold text-slate-900 font-mono">x${it.quantity}</span>
                                ${mappedBadge}
                            </div>
                        </div>
                    `;
                }).join('');

                const isFullyMapped = (o.items || []).every(it => it.mapped_product_id);
                const orderMappedStatus = isFullyMapped
                    ? '<span class="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-800">100% Đã Map</span>'
                    : '<span class="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-100 text-amber-800">Cần Ánh Xạ</span>';

                const shopVoucher = o.shop_voucher || 0;
                const netPayout = o.net_payout > 0 ? o.net_payout : Math.max(0, (o.total_amount || 0) - shopVoucher);
                const trackingBadge = o.tracking_number ? `<div class="text-[10px] text-slate-400 font-mono mt-0.5">🚚 ${escapeHtml(o.tracking_number)}</div>` : '';
                const isSelected = selectedMktOrderIds.has(o.id);

                return `
                    <tr class="hover:bg-slate-50 transition ${isSelected ? 'bg-slate-100/70' : ''}">
                        <td class="p-3 text-center">
                            <input type="checkbox" data-id="${o.id}" onchange="toggleMktOrderItem(${o.id}, this.checked, 'tiktok')" ${isSelected ? 'checked' : ''} class="chk-mkt-order-tiktok w-4 h-4 rounded text-slate-900 focus:ring-slate-500 cursor-pointer">
                        </td>
                        <td class="p-3 font-mono font-bold text-slate-900">
                            ${escapeHtml(o.order_sn)}
                            ${trackingBadge}
                        </td>
                        <td class="p-3 text-slate-500 font-medium">${formatDateTime(o.order_date)}</td>
                        <td class="p-3 text-slate-700 font-semibold">${escapeHtml(o.buyer_username || 'Khách TikTok')}</td>
                        <td class="p-3 max-w-sm">${itemsHtml}</td>
                        <td class="p-3 text-center font-bold text-slate-800">${o.total_qty || 0}</td>
                        <td class="p-3 text-right font-medium text-slate-700 font-mono">${formatMoney(o.total_amount)}</td>
                        <td class="p-3 text-right font-medium text-rose-600 font-mono">${shopVoucher > 0 ? '-' + formatMoney(shopVoucher) : '0 đ'}</td>
                        <td class="p-3 text-right font-bold text-emerald-600 font-mono">${formatMoney(netPayout)}</td>
                        <td class="p-3 text-center">
                            <span class="px-2 py-0.5 rounded text-[10px] font-bold bg-slate-100 text-slate-700">${escapeHtml(o.order_status)}</span>
                        </td>
                        <td class="p-3 text-center">${orderMappedStatus}</td>
                        <td class="p-3 text-center">
                            <button type="button" onclick="deleteSingleMarketplaceOrder(${o.id}, '${escapeHtml(o.order_sn)}', 'tiktok')" class="text-slate-400 hover:text-rose-600 font-bold p-1 transition" title="Xóa đơn này">✕</button>
                        </td>
                    </tr>
                `;
            }).join('');
        } catch (e) {
            tbody.innerHTML = `<tr><td colspan="12" class="p-6 text-center text-rose-500">Lỗi: ${e.message}</td></tr>`;
        }
    }
    window.loadTikTokOrders = loadTikTokOrders;

    // ─────────────────────────────────────────────────────────────
    // 4. ÁNH XẠ SẢN PHẨM (SKU MAPPING) VỚI COMBOBOX TÌM KIẾM & DUYỆT AI
    // ─────────────────────────────────────────────────────────────
    let currentUnmappedItems = [];
    let unmappedRowSelections = {}; // idx -> { productId, productName, productCode, isAi }

    async function loadUnmappedItems() {
        const tbody = document.getElementById('unmapped-items-tbody');
        if (!tbody) return;

        try {
            const res = await fetch('/api/marketplace/unmapped-items');
            if (!res.ok) return;
            const items = await res.json();
            currentUnmappedItems = items || [];
            unmappedRowSelections = {};

            document.getElementById('unmapped-count').textContent = items.length;

            const btnAcceptAll = document.getElementById('btn-accept-all-ai');
            if (btnAcceptAll) btnAcceptAll.classList.add('hidden');

            if (!items || items.length === 0) {
                tbody.innerHTML = '<tr><td colspan="6" class="p-6 text-center text-slate-400 font-medium">🎉 Tuyệt vời! Tất cả sản phẩm sàn đều đã được ánh xạ vào kho POS.</td></tr>';
                return;
            }

            renderUnmappedItemsTable();
        } catch (e) {
            console.error("loadUnmappedItems error:", e);
        }
    }
    window.loadUnmappedItems = loadUnmappedItems;

    function renderUnmappedItemsTable() {
        const tbody = document.getElementById('unmapped-items-tbody');
        if (!tbody) return;

        tbody.innerHTML = currentUnmappedItems.map((it, idx) => {
            const safeName = (it.platform_product_name || '').replace(/'/g, "\\'");
            const safeVar = (it.platform_variation || '').replace(/'/g, "\\'");
            const platformBadge = mktPlatformBadge(it.platform);

            const sel = unmappedRowSelections[idx];
            const hasSelection = sel && sel.productId;
            const displayLabel = hasSelection ? `[${sel.productCode}] ${sel.productName}` : '';
            const aiBadge = sel && sel.isAi 
                ? '<span class="text-[10px] text-indigo-700 bg-indigo-50 border border-indigo-200 font-bold px-1.5 py-0.5 rounded ml-1 animate-pulse">🤖 Gợi ý</span>' 
                : '';

            return `
                <tr class="hover:bg-amber-50/40 transition">
                    <td class="p-2.5">${platformBadge}</td>
                    <td class="p-2.5">
                        <div class="font-bold text-slate-800">${escapeHtml(it.platform_product_name)}</div>
                        ${it.platform_sku ? `<div class="text-[10px] text-slate-400 font-mono mt-0.5">SKU: ${escapeHtml(it.platform_sku)}</div>` : ''}
                    </td>
                    <td class="p-2.5 text-slate-500 font-medium">${escapeHtml(it.platform_variation || 'Mặc định')}</td>
                    <td class="p-2.5 text-center font-bold text-orange-600 font-mono">${it.total_sold_qty || 1}</td>
                    <td class="p-2.5 relative">
                        <div class="relative w-full">
                            <input type="text" id="mkt-map-input-${idx}" 
                                   value="${escapeHtml(displayLabel)}" 
                                   placeholder="🔍 Gõ tên hoặc mã SP kho POS..." 
                                   autocomplete="off"
                                   onfocus="showMktProductCombobox(${idx})" 
                                   oninput="filterMktProductCombobox(${idx}, this.value)"
                                   class="w-full border ${sel && sel.isAi ? 'border-indigo-400 bg-indigo-50/30 font-bold text-indigo-900' : 'border-slate-300 bg-white font-medium text-slate-800'} rounded-lg px-2.5 py-1.5 text-xs focus:ring-1 focus:ring-emerald-500 outline-none">
                            <div id="mkt-map-dropdown-${idx}" class="hidden absolute left-0 right-0 top-full mt-1 bg-white border border-slate-200 rounded-lg shadow-2xl z-50 max-h-52 overflow-y-auto divide-y divide-slate-100 text-xs">
                            </div>
                        </div>
                        ${aiBadge ? `<div class="mt-1">${aiBadge}</div>` : ''}
                    </td>
                    <td class="p-2.5 text-center">
                        <button type="button" onclick="saveQuickMapFromRow(${idx}, '${it.platform}', '${safeName}', '${safeVar}')" 
                                class="px-3 py-1.5 ${hasSelection ? 'bg-emerald-600 hover:bg-emerald-700 text-white' : 'bg-slate-200 text-slate-400 cursor-not-allowed'} rounded-lg font-bold text-xs shadow-xs transition cursor-pointer">
                            Lưu
                        </button>
                    </td>
                </tr>
            `;
        }).join('');
    }

    function showMktProductCombobox(idx) {
        filterMktProductCombobox(idx, '');
    }
    window.showMktProductCombobox = showMktProductCombobox;

    function filterMktProductCombobox(idx, searchVal) {
        const dd = document.getElementById(`mkt-map-dropdown-${idx}`);
        if (!dd) return;

        const q = (searchVal || '').trim().toLowerCase();
        const prods = state.posProducts || [];

        const matches = prods.filter(p => {
            if (!q) return true;
            const name = (p.name || '').toLowerCase();
            const code = (p.code || '').toLowerCase();
            return name.includes(q) || code.includes(q);
        }).slice(0, 15);

        if (matches.length === 0) {
            dd.innerHTML = '<div class="p-3 text-center text-slate-400 italic">Không tìm thấy sản phẩm nào trong kho</div>';
            dd.classList.remove('hidden');
            return;
        }

        dd.innerHTML = matches.map(p => `
            <div onclick="selectMktProductForRow(${idx}, ${p.id}, '${escapeHtml(p.name)}', '${escapeHtml(p.code || '')}')" 
                 class="p-2.5 hover:bg-emerald-50 cursor-pointer flex justify-between items-center transition">
                <div>
                    <span class="font-mono font-bold text-slate-500 mr-1">[${p.code || '-'}]</span>
                    <span class="font-bold text-slate-800">${p.name}</span>
                    <span class="text-slate-400 text-[11px] ml-1">(${p.unit || 'cái'})</span>
                </div>
                <div class="text-right shrink-0 ml-2">
                    <span class="text-[10px] text-slate-400">Tồn: <strong class="text-slate-700">${p.stock || 0}</strong></span>
                </div>
            </div>
        `).join('');

        dd.classList.remove('hidden');
    }
    window.filterMktProductCombobox = filterMktProductCombobox;

    function selectMktProductForRow(idx, productId, productName, productCode) {
        unmappedRowSelections[idx] = {
            productId,
            productName,
            productCode,
            isAi: false
        };

        const inp = document.getElementById(`mkt-map-input-${idx}`);
        if (inp) {
            inp.value = `[${productCode}] ${productName}`;
            inp.className = 'w-full border border-slate-300 bg-white font-medium text-slate-800 rounded-lg px-2.5 py-1.5 text-xs focus:ring-1 focus:ring-emerald-500 outline-none';
        }

        const dd = document.getElementById(`mkt-map-dropdown-${idx}`);
        if (dd) dd.classList.add('hidden');

        renderUnmappedItemsTable();
    }
    window.selectMktProductForRow = selectMktProductForRow;

    // Đóng dropdown khi click ngoài
    document.addEventListener('click', function(e) {
        document.querySelectorAll('[id^="mkt-map-dropdown-"]').forEach(dd => {
            const idx = dd.id.replace('mkt-map-dropdown-', '');
            const inp = document.getElementById(`mkt-map-input-${idx}`);
            if (dd && !dd.contains(e.target) && e.target !== inp) {
                dd.classList.add('hidden');
            }
        });
    });

    // AI Gợi ý ánh xạ thông minh (Chỉ gợi ý lên UI, con người kiểm tra rồi bấm duyệt)
    function suggestAIMappings() {
        if (!currentUnmappedItems || currentUnmappedItems.length === 0) {
            alert('Không có mặt hàng nào cần gợi ý ánh xạ!');
            return;
        }

        const prods = state.posProducts || [];
        if (prods.length === 0) {
            alert('Chưa có dữ liệu hàng hóa trong kho POS!');
            return;
        }

        let suggestedCount = 0;
        currentUnmappedItems.forEach((it, idx) => {
            // Nếu đã chọn rồi thì không đè
            if (unmappedRowSelections[idx] && unmappedRowSelections[idx].productId) return;

            const targetName = (it.platform_product_name || '').toLowerCase();
            const targetVar = (it.platform_variation || '').toLowerCase();
            const targetSku = (it.platform_sku || '').toLowerCase();

            let bestMatch = null;
            let bestScore = 0;

            for (const p of prods) {
                const pName = (p.name || '').toLowerCase();
                const pCode = (p.code || '').toLowerCase();

                // 1. Trùng mã SKU kho tuyệt đối
                if (targetSku && pCode && targetSku === pCode) {
                    bestMatch = p;
                    bestScore = 100;
                    break;
                }

                // 2. Tên biến thể trùng mã sản phẩm
                if (targetVar && pCode && (targetVar === pCode || targetVar.includes(pCode))) {
                    bestMatch = p;
                    bestScore = 90;
                    break;
                }

                // 3. Tên sản phẩm chứa nhau
                if (pName.length >= 6 && targetName.includes(pName)) {
                    if (pName.length > bestScore) {
                        bestMatch = p;
                        bestScore = pName.length;
                    }
                } else if (targetName.length >= 6 && pName.includes(targetName)) {
                    if (targetName.length > bestScore) {
                        bestMatch = p;
                        bestScore = targetName.length;
                    }
                }
            }

            if (bestMatch) {
                unmappedRowSelections[idx] = {
                    productId: bestMatch.id,
                    productName: bestMatch.name,
                    productCode: bestMatch.code,
                    isAi: true
                };
                suggestedCount++;
            }
        });

        renderUnmappedItemsTable();

        const btnAcceptAll = document.getElementById('btn-accept-all-ai');
        if (btnAcceptAll) {
            if (suggestedCount > 0) {
                btnAcceptAll.classList.remove('hidden');
                btnAcceptAll.innerText = `⚡ Duyệt Tất Cả (${suggestedCount} Gợi Ý AI)`;
            } else {
                btnAcceptAll.classList.add('hidden');
            }
        }

        if (window.showToast) {
            window.showToast(`AI đã tìm thấy ${suggestedCount} gợi ý phù hợp! Vui lòng kiểm tra và bấm Lưu.`, 'success');
        } else {
            alert(`AI đã tìm thấy ${suggestedCount} gợi ý phù hợp! Vui lòng kiểm tra lại trước khi bấm Duyệt.`);
        }
    }
    window.suggestAIMappings = suggestAIMappings;

    // Duyệt và lưu toàn bộ các gợi ý AI đã khớp
    async function acceptAllAISuggestions() {
        const toSave = [];
        Object.entries(unmappedRowSelections).forEach(([idx, sel]) => {
            const it = currentUnmappedItems[idx];
            if (it && sel && sel.productId) {
                toSave.push({
                    platform: it.platform,
                    platform_sku: it.platform_sku || '',
                    platform_item_name: it.platform_product_name,
                    platform_variation: it.platform_variation || '',
                    product_id: sel.productId
                });
            }
        });

        if (toSave.length === 0) {
            if (window.showToast) window.showToast('Không có dòng gợi ý nào để lưu!', 'warning');
            else alert('Không có dòng gợi ý nào để lưu!');
            return;
        }

        const confirmed = await window.showConfirmModal({
            title: 'Lưu Gợi Ý Ánh Xạ AI',
            message: `Xác nhận lưu ${toSave.length} luật ánh xạ sản phẩm vào kho POS?`,
            type: 'primary',
            confirmText: 'Lưu Tất Cả',
            cancelText: 'Hủy bỏ',
            icon: '✨'
        });
        if (!confirmed) return;

        const btn = document.getElementById('btn-accept-all-ai');
        if (btn) btn.disabled = true;

        let savedOk = 0;
        for (const item of toSave) {
            try {
                const res = await fetch('/api/marketplace/mappings', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(item)
                });
                if (res.ok) savedOk++;
            } catch (e) {}
        }

        if (btn) btn.disabled = false;
        if (window.showToast) window.showToast(`Đã lưu thành công ${savedOk} luật ánh xạ!`, 'success');
        else alert(`Đã lưu thành công ${savedOk} luật ánh xạ!`);

        await loadUnmappedItems();
        await loadSkuMappings();
    }
    window.acceptAllAISuggestions = acceptAllAISuggestions;

    async function saveQuickMapFromRow(idx, platform, itemName, variation) {
        const sel = unmappedRowSelections[idx];
        const productId = sel ? sel.productId : null;
        if (!productId) {
            if (window.showToast) window.showToast('Vui lòng chọn sản phẩm trong kho bằng ô tìm kiếm trước khi Lưu!', 'warning');
            else alert('Vui lòng chọn sản phẩm trong kho bằng ô tìm kiếm trước khi Lưu!');
            return;
        }

        const it = currentUnmappedItems[idx] || {};

        try {
            const res = await fetch('/api/marketplace/mappings', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    platform: platform,
                    platform_sku: it.platform_sku || '',
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
            if (window.showToast) window.showToast('Lỗi: ' + e.message, 'error');
            else alert('Lỗi: ' + e.message);
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
                const platformBadge = mktPlatformBadge(m.platform);

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
        const confirmed = await window.showConfirmModal({
            title: 'Xóa Luật Ánh Xạ',
            message: 'Bạn có chắc chắn muốn xóa luật ánh xạ sản phẩm này?',
            type: 'danger',
            confirmText: 'Xóa',
            cancelText: 'Hủy bỏ',
            icon: '🗑️'
        });
        if (!confirmed) return;
        try {
            const res = await fetch(`/api/marketplace/mappings/${id}`, { method: 'DELETE' });
            if (res.ok) {
                if (window.showToast) window.showToast('Đã xóa luật ánh xạ', 'success');
                await loadSkuMappings();
                await loadUnmappedItems();
            } else {
                const data = await res.json();
                if (window.showToast) window.showToast('Lỗi: ' + (data.detail || 'Không thể xóa'), 'error');
                else alert('Lỗi: ' + (data.detail || 'Không thể xóa'));
            }
        } catch (e) {
            if (window.showToast) window.showToast('Lỗi: ' + e.message, 'error');
            else alert('Lỗi: ' + e.message);
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
        const targetDate = dateInput?.value || ((typeof getLocalTodayDateStr === 'function') ? getLocalTodayDateStr() : new Intl.DateTimeFormat('en-CA').format(new Date()));
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

        const date = document.getElementById('mkt-analytics-date')?.value || ((typeof getLocalTodayDateStr === 'function') ? getLocalTodayDateStr() : new Intl.DateTimeFormat('en-CA').format(new Date()));
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

    function mktPlatformBadge(p) {
        if (p === 'shopee') return '<span class="px-2 py-0.5 rounded text-[10px] font-bold bg-orange-100 text-orange-800 border border-orange-200">Shopee</span>';
        if (p === 'pancake') return '<span class="px-2 py-0.5 rounded text-[10px] font-bold bg-amber-100 text-amber-800 border border-amber-200">Pancake</span>';
        return '<span class="px-2 py-0.5 rounded text-[10px] font-bold bg-slate-900 text-white">TikTok</span>';
    }

    // ─────────────────────────────────────────────────────────────
    // PANCAKE (POSCAKE API): shop, đồng bộ đơn, hoa hồng NV bán
    // ─────────────────────────────────────────────────────────────
    window.mktPancakePage = 1;
    let pcStaff = [];
    let pcSellers = [];
    let pcDefaultRules = null;
    let pcRulesTarget = null; // null = công thức chung, string = tên NV Pancake

    const pcMoney = v => (typeof formatMoney === 'function') ? formatMoney(Math.round(v || 0)) : `${Math.round(v || 0).toLocaleString('vi-VN')} đ`;
    const pcToast = (msg, type) => window.showToast ? window.showToast(msg, type) : alert(msg);

    function pcRange() {
        const fromEl = document.getElementById('pc-date-from');
        const toEl = document.getElementById('pc-date-to');
        if (fromEl && !fromEl.value) {
            const today = (typeof getLocalTodayDateStr === 'function') ? getLocalTodayDateStr() : new Intl.DateTimeFormat('en-CA').format(new Date());
            fromEl.value = today.slice(0, 8) + '01';
            toEl.value = today;
        }
        return { from: fromEl?.value || '', to: toEl?.value || '' };
    }

    function rulesText(r) {
        if (!r) return '';
        const tiers = (r.tiers || []).map(([upTo, rate]) => `${upTo ? 'đến ' + pcMoney(upTo) : 'trên đó'}: ${rate}%`).join(', ');
        return `Mốc ${pcMoney(r.threshold)} · thưởng đạt mốc ${pcMoney(r.bonus_at_threshold)} · ${tiers}`;
    }

    async function loadPancakeTab() {
        pcRange();
        renderPancakeShops();
        if (!pcStaff.length) {
            try { const r = await fetch('/api/staff'); if (r.ok) pcStaff = (await r.json()).filter(s => s.is_active); } catch (e) { }
        }
        await Promise.all([loadPancakeSellers(), loadPancakeOrders(1)]);
    }
    window.loadPancakeTab = loadPancakeTab;

    function renderPancakeShops() {
        const box = document.getElementById('pc-shop-list');
        if (!box) return;
        const shops = state.pancakeAccounts || [];
        if (!shops.length) {
            box.innerHTML = '<span class="text-xs text-rose-600 font-bold">Chưa có shop Pancake — bấm "+ Thêm Shop"</span>';
            return;
        }
        box.innerHTML = shops.map(a => {
            let sid = '';
            try { sid = JSON.parse(a.extra_config || '{}').shop_id || ''; } catch (e) { }
            const ok = a.has_cookies && sid;
            return `<button type="button" onclick="openPancakeShopModal(${a.id})" class="flex items-center gap-2 bg-amber-50 hover:bg-amber-100 px-3 py-1.5 rounded-lg border border-amber-200 text-left cursor-pointer transition" title="Bấm để sửa">
                <span>${ok ? '🟢' : '🔴'}</span>
                <span><span class="block font-bold text-xs text-amber-900">${escapeHtml(a.shop_name)}</span>
                <span class="block text-[10px] text-slate-500 font-mono">ID ${escapeHtml(sid || '?')}${a.last_sync_at ? ' · sync ' + escapeHtml(a.last_sync_at.slice(5, 16)) : ''}</span></span>
            </button>`;
        }).join('');
    }

    async function syncPancakeNow() {
        const { from, to } = pcRange();
        const btn = document.getElementById('btn-pc-sync');
        if (btn) { btn.disabled = true; btn.textContent = '⏳ Đang tải đơn...'; }
        try {
            const res = await fetch('/api/marketplace/pancake/sync', {
                method: 'POST', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ date_from: from, date_to: to })
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.detail || 'Lỗi đồng bộ');
            pcToast(data.message, data.message.includes('lỗi') ? 'warning' : 'success');
            await loadMarketplaceAccounts();
            await loadPancakeTab();
        } catch (e) {
            pcToast('Lỗi: ' + e.message, 'error');
        } finally {
            if (btn) { btn.disabled = false; btn.textContent = '🔄 Đồng Bộ Đơn'; }
        }
    }
    window.syncPancakeNow = syncPancakeNow;

    async function loadPancakeSellers() {
        const tbody = document.getElementById('pc-sellers-tbody');
        if (!tbody) return;
        const { from, to } = pcRange();
        try {
            const res = await fetch(`/api/marketplace/pancake/sellers?date_from=${from}&date_to=${to}`);
            const data = await res.json();
            if (!res.ok) throw new Error(data.detail || 'Lỗi tải hoa hồng');
            pcSellers = data.sellers || [];
            pcDefaultRules = data.default_rules;
            document.getElementById('pc-default-rules-text').textContent = 'Công thức chung: ' + rulesText(pcDefaultRules);
            if (!pcSellers.length) {
                tbody.innerHTML = '<tr><td colspan="9" class="p-4 text-center text-slate-400">Chưa có dữ liệu. Bấm "Đồng Bộ Đơn".</td></tr>';
                return;
            }
            const opts = sel => '<option value="">-- Chưa gán --</option>' + pcStaff.map(s =>
                `<option value="${s.id}" ${String(s.id) === String(sel) ? 'selected' : ''}>${escapeHtml(s.name)}${s.employee_code ? ' (' + escapeHtml(s.employee_code) + ')' : ''}</option>`).join('');
            tbody.innerHTML = pcSellers.map((s, i) => `
                <tr class="hover:bg-slate-50">
                    <td class="p-2.5 font-bold text-slate-800">${escapeHtml(s.seller_name)}</td>
                    <td class="p-2.5"><select onchange="assignPancakeSeller(${i}, this.value)" class="border ${s.staff_id ? 'border-slate-300' : 'border-amber-400 bg-amber-50'} rounded-lg px-2 py-1 text-xs font-semibold">${opts(s.staff_id)}</select></td>
                    <td class="p-2.5 text-center font-mono">${s.orders}</td>
                    <td class="p-2.5 text-right font-mono font-bold">${pcMoney(s.revenue)}</td>
                    <td class="p-2.5 text-right font-mono text-sky-700">${pcMoney(s.collected)}</td>
                    <td class="p-2.5 text-center font-mono">${s.rate ? s.rate + '%' : '-'}</td>
                    <td class="p-2.5 text-right font-mono font-bold text-emerald-700">${pcMoney(s.commission)}</td>
                    <td class="p-2.5 text-right font-mono text-emerald-700">${pcMoney(s.bonus)}</td>
                    <td class="p-2.5 text-center"><button type="button" onclick="openPancakeRulesModal(${i})" class="px-2 py-1 rounded text-[10px] font-bold cursor-pointer ${s.custom_rules ? 'bg-indigo-600 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}">${s.custom_rules ? 'Riêng ✎' : 'Chung ✎'}</button></td>
                </tr>`).join('');
            const tot = pcSellers.reduce((a, s) => ({ n: a.n + s.orders, r: a.r + s.revenue, c: a.c + s.collected }), { n: 0, r: 0, c: 0 });
            document.getElementById('kpi-pancake-revenue').textContent = pcMoney(tot.r);
            document.getElementById('kpi-pancake-collected').textContent = pcMoney(tot.c);
        } catch (e) {
            tbody.innerHTML = `<tr><td colspan="9" class="p-4 text-center text-rose-500">Lỗi: ${escapeHtml(e.message)}</td></tr>`;
        }
    }

    async function putPancakeSeller(s, staffId, rules) {
        const res = await fetch('/api/marketplace/pancake/sellers', {
            method: 'PUT', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ seller_name: s.seller_name, staff_id: staffId ? Number(staffId) : null, rules })
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.detail || 'Lỗi lưu');
        return data;
    }

    async function assignPancakeSeller(i, staffId) {
        const s = pcSellers[i];
        try {
            await putPancakeSeller(s, staffId, s.custom_rules ? s.rules : null);
            pcToast(`Đã gán [${s.seller_name}]`, 'success');
            await loadPancakeSellers();
        } catch (e) { pcToast('Lỗi: ' + e.message, 'error'); }
    }
    window.assignPancakeSeller = assignPancakeSeller;

    function addPancakeTierRow(upTo, rate) {
        const box = document.getElementById('pc-rules-tiers');
        const row = document.createElement('div');
        row.className = 'flex items-center gap-1.5 pc-tier-row';
        row.innerHTML = `<span class="text-slate-500 w-8">Đến</span>
            <input type="text" inputmode="numeric" oninput="formatCurrencyInputRealtime(this)" placeholder="không giới hạn" value="${upTo ? Number(upTo).toLocaleString('vi-VN') : ''}" class="pc-tier-upto flex-1 border border-slate-300 rounded p-1.5 font-mono text-right">
            <input type="number" step="0.1" min="0" max="100" value="${rate ?? ''}" class="pc-tier-rate w-20 border border-slate-300 rounded p-1.5 font-mono text-right"><span>%</span>
            <button type="button" onclick="this.parentElement.remove()" class="text-rose-500 font-bold px-1 cursor-pointer">✕</button>`;
        box.appendChild(row);
    }
    window.addPancakeTierRow = addPancakeTierRow;

    function fillPancakeRules(r) {
        document.getElementById('pc-rules-threshold').value = r.threshold ? Number(r.threshold).toLocaleString('vi-VN') : '0';
        document.getElementById('pc-rules-bonus').value = r.bonus_at_threshold ? Number(r.bonus_at_threshold).toLocaleString('vi-VN') : '0';
        document.getElementById('pc-rules-tiers').innerHTML = '';
        (r.tiers || []).forEach(([u, rt]) => addPancakeTierRow(u, rt));
    }

    function togglePancakeRulesInputs() {
        const useDefault = document.getElementById('pc-rules-use-default').checked;
        document.getElementById('pc-rules-inputs').classList.toggle('opacity-40', useDefault);
        document.getElementById('pc-rules-inputs').classList.toggle('pointer-events-none', useDefault);
        if (useDefault && pcDefaultRules) fillPancakeRules(pcDefaultRules);
    }
    window.togglePancakeRulesInputs = togglePancakeRulesInputs;

    function openPancakeRulesModal(i) {
        pcRulesTarget = (i === null || i === undefined) ? null : pcSellers[i];
        const isDefault = !pcRulesTarget;
        document.getElementById('pc-rules-title').textContent = isDefault ? '⚙️ Công Thức Hoa Hồng Chung' : `⚙️ Công Thức Riêng — ${pcRulesTarget.seller_name}`;
        document.getElementById('pc-rules-use-default-wrap').classList.toggle('hidden', isDefault);
        document.getElementById('pc-rules-use-default').checked = !isDefault && !pcRulesTarget.custom_rules;
        fillPancakeRules(isDefault ? (pcDefaultRules || {}) : pcRulesTarget.rules);
        togglePancakeRulesInputs();
        document.getElementById('modal-pancake-rules').classList.remove('hidden');
    }
    window.openPancakeRulesModal = openPancakeRulesModal;

    function closePancakeRulesModal() {
        document.getElementById('modal-pancake-rules')?.classList.add('hidden');
    }
    window.closePancakeRulesModal = closePancakeRulesModal;

    async function savePancakeRules() {
        const num = id => parseMoneyInput(document.getElementById(id).value);
        const tiers = [...document.querySelectorAll('#pc-rules-tiers .pc-tier-row')].map(r => {
            const u = parseMoneyInput(r.querySelector('.pc-tier-upto').value);
            return [u > 0 ? u : null, Number(r.querySelector('.pc-tier-rate').value || 0)];
        });
        const rules = { threshold: num('pc-rules-threshold'), bonus_at_threshold: num('pc-rules-bonus'), tiers };
        const useDefault = pcRulesTarget && document.getElementById('pc-rules-use-default').checked;
        if (!useDefault) {
            if (!tiers.length) return pcToast('Cần ít nhất 1 bậc tỷ lệ', 'warning');
            if (tiers.some(([, rt]) => rt < 0 || rt > 100)) return pcToast('Tỷ lệ phải từ 0 đến 100%', 'warning');
            const ups = tiers.map(t => t[0]);
            if (ups.slice(0, -1).some(u => u === null) || ups.some((u, k) => k && u !== null && ups[k - 1] !== null && u <= ups[k - 1]))
                return pcToast('Các bậc "Đến" phải tăng dần; chỉ bậc cuối được để trống', 'warning');
        }
        try {
            if (pcRulesTarget) {
                await putPancakeSeller(pcRulesTarget, pcRulesTarget.staff_id, useDefault ? null : rules);
            } else {
                const res = await fetch('/api/marketplace/pancake/rules', {
                    method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(rules)
                });
                const data = await res.json();
                if (!res.ok) throw new Error(data.detail || 'Lỗi lưu');
            }
            pcToast('Đã lưu công thức hoa hồng', 'success');
            closePancakeRulesModal();
            await loadPancakeSellers();
        } catch (e) { pcToast('Lỗi: ' + e.message, 'error'); }
    }
    window.savePancakeRules = savePancakeRules;

    let pcSearchTimer = null;
    function debouncePancakeOrders() {
        clearTimeout(pcSearchTimer);
        pcSearchTimer = setTimeout(() => loadPancakeOrders(1), 400);
    }
    window.debouncePancakeOrders = debouncePancakeOrders;

    async function loadPancakeOrders(page = 1) {
        const tbody = document.getElementById('mkt-pancake-orders-tbody');
        if (!tbody) return;
        const { from, to } = pcRange();
        const params = new URLSearchParams({ platform: 'pancake', page: Math.max(1, page), limit: 50, date_from: from, date_to: to });
        const status = document.getElementById('mkt-pancake-status-filter')?.value || 'all';
        const q = document.getElementById('mkt-pancake-search')?.value.trim() || '';
        if (status !== 'all') params.append('status', status);
        if (q) params.append('q', q);
        const kpiParams = new URLSearchParams(params); kpiParams.delete('page'); kpiParams.delete('limit');
        try {
            const [ordersRes, kpiRes] = await Promise.all([
                fetch(`/api/marketplace/orders?${params}`), fetch(`/api/marketplace/orders-kpi?${kpiParams}`)
            ]);
            if (kpiRes.ok) {
                const k = await kpiRes.json();
                document.getElementById('kpi-pancake-order-count').textContent = k.order_count || 0;
                document.getElementById('kpi-pancake-mapped-ratio').textContent = `${k.mapped_ratio || 0}%`;
            }
            const data = await ordersRes.json();
            if (!ordersRes.ok) throw new Error(data.detail || 'Không tải được đơn');
            if (page > (data.total_pages || 1) && page > 1) return;
            window.mktPancakePage = data.page || 1;
            document.getElementById('mkt-pancake-page-info').textContent = `Trang ${data.page}/${data.total_pages || 1} · ${data.total} đơn`;
            const orders = data.orders || [];
            if (!orders.length) {
                tbody.innerHTML = '<tr><td colspan="7" class="p-6 text-center text-slate-400">Không có đơn trong khoảng ngày này.</td></tr>';
                return;
            }
            tbody.innerHTML = orders.map(o => {
                const items = (o.items || []).map(it => {
                    const badge = it.mapped_product_id
                        ? `<span class="px-1.5 py-0.5 rounded text-[10px] bg-emerald-100 text-emerald-800 font-bold" title="${escapeHtml(it.pos_product_name || '')}">✓ ${escapeHtml(it.pos_product_code || '')}</span>`
                        : `<span class="px-1.5 py-0.5 rounded text-[10px] bg-amber-100 text-amber-800 font-bold" title="Vào tab Ánh Xạ Sản Phẩm để gán">⚠️ Chưa map</span>`;
                    const ret = it.returned_qty ? ` <span class="text-rose-600 font-bold">(hoàn ${it.returned_qty})</span>` : '';
                    return `<div class="py-0.5 flex items-center justify-between gap-2"><span>${escapeHtml(it.platform_product_name)}${it.platform_variation ? ' <span class="text-slate-400">(' + escapeHtml(it.platform_variation) + ')</span>' : ''} <b class="text-amber-700">x${it.quantity}</b>${ret}</span>${badge}</div>`;
                }).join('');
                return `<tr class="hover:bg-slate-50 align-top">
                    <td class="p-3 font-mono font-bold text-slate-900">${escapeHtml(o.order_sn)}${o.tracking_number ? `<div class="text-[10px] text-slate-400">🚚 ${escapeHtml(o.tracking_number)}</div>` : ''}</td>
                    <td class="p-3 text-slate-500">${formatDateTime(o.order_date)}</td>
                    <td class="p-3"><div class="font-semibold text-slate-700">${escapeHtml(o.shop_name || '')}</div><div class="text-[10px] text-slate-500">${escapeHtml(o.seller_name || '')}</div></td>
                    <td class="p-3 text-slate-700">${escapeHtml(o.buyer_username || '')}</td>
                    <td class="p-3 min-w-[260px]">${items}</td>
                    <td class="p-3 text-right font-mono font-bold">${pcMoney(o.total_amount)}</td>
                    <td class="p-3 text-center"><span class="px-2 py-0.5 rounded text-[10px] font-bold bg-slate-100 text-slate-700">${escapeHtml(o.order_status)}</span></td>
                </tr>`;
            }).join('');
        } catch (e) {
            tbody.innerHTML = `<tr><td colspan="7" class="p-6 text-center text-rose-500">Lỗi: ${escapeHtml(e.message)}</td></tr>`;
        }
    }
    window.loadPancakeOrders = loadPancakeOrders;

    function openPancakeShopModal(id) {
        const acc = (state.pancakeAccounts || []).find(a => a.id === id);
        let sid = '';
        try { sid = acc ? (JSON.parse(acc.extra_config || '{}').shop_id || '') : ''; } catch (e) { }
        document.getElementById('pc-shop-id-db').value = acc ? acc.id : '';
        document.getElementById('pc-shop-name').value = acc ? acc.shop_name : '';
        document.getElementById('pc-shop-shopid').value = sid;
        document.getElementById('pc-shop-apikey').value = '';
        document.getElementById('pc-shop-apikey-hint').classList.toggle('hidden', !acc);
        document.getElementById('btn-pc-shop-delete').classList.toggle('invisible', !acc);
        document.getElementById('pc-shop-test-result').classList.add('hidden');
        document.getElementById('modal-pancake-shop').classList.remove('hidden');
    }
    window.openPancakeShopModal = openPancakeShopModal;

    function closePancakeShopModal() {
        document.getElementById('modal-pancake-shop')?.classList.add('hidden');
    }
    window.closePancakeShopModal = closePancakeShopModal;

    async function testPancakeShop() {
        const box = document.getElementById('pc-shop-test-result');
        const id = document.getElementById('pc-shop-id-db').value;
        box.className = 'p-2 rounded-lg text-[11px] bg-slate-100 text-slate-700 font-bold';
        box.textContent = '⏳ Đang kiểm tra...';
        try {
            const res = await fetch('/api/marketplace/pancake/test', {
                method: 'POST', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    shop_id: document.getElementById('pc-shop-shopid').value.trim(),
                    api_key: document.getElementById('pc-shop-apikey').value.trim() || null,
                    account_id: id ? Number(id) : null
                })
            });
            const data = await res.json();
            const ok = data.status === 'ok';
            box.className = `p-2 rounded-lg text-[11px] font-bold ${ok ? 'bg-emerald-100 text-emerald-800' : 'bg-rose-100 text-rose-800'}`;
            box.textContent = (ok ? '✅ ' : '❌ ') + (data.message || data.detail || '');
        } catch (e) {
            box.className = 'p-2 rounded-lg text-[11px] font-bold bg-rose-100 text-rose-800';
            box.textContent = '❌ ' + e.message;
        }
    }
    window.testPancakeShop = testPancakeShop;

    async function savePancakeShop() {
        const id = document.getElementById('pc-shop-id-db').value;
        const shop_name = document.getElementById('pc-shop-name').value.trim();
        const shopId = document.getElementById('pc-shop-shopid').value.trim();
        const key = document.getElementById('pc-shop-apikey').value.trim();
        if (!shop_name || !/^\d+$/.test(shopId)) return pcToast('Cần tên shop và Shop ID (chỉ gồm số)', 'warning');
        if (!id && !key) return pcToast('Shop mới cần nhập API Key', 'warning');
        const body = { shop_name, extra_config: JSON.stringify({ shop_id: shopId }) };
        if (key) body.cookies = key;
        try {
            const res = await fetch(id ? `/api/marketplace/accounts/${id}` : '/api/marketplace/accounts', {
                method: id ? 'PUT' : 'POST', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(id ? body : { platform: 'pancake', ...body })
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.detail || 'Lỗi lưu shop');
            pcToast('Đã lưu shop Pancake', 'success');
            closePancakeShopModal();
            await loadMarketplaceAccounts();
            renderPancakeShops();
        } catch (e) { pcToast('Lỗi: ' + e.message, 'error'); }
    }
    window.savePancakeShop = savePancakeShop;

    async function deletePancakeShop() {
        const id = document.getElementById('pc-shop-id-db').value;
        if (!id) return;
        const ok = window.showConfirmModal
            ? await window.showConfirmModal({ title: 'Xóa shop Pancake?', message: 'Chỉ xóa cấu hình kết nối. Đơn đã tải về vẫn giữ.', confirmText: 'Xóa', type: 'danger' })
            : confirm('Xóa shop Pancake?');
        if (!ok) return;
        try {
            const res = await fetch(`/api/marketplace/accounts/${id}`, { method: 'DELETE' });
            const data = await res.json();
            if (!res.ok) throw new Error(data.detail || 'Lỗi xóa');
            closePancakeShopModal();
            await loadMarketplaceAccounts();
            renderPancakeShops();
        } catch (e) { pcToast('Lỗi: ' + e.message, 'error'); }
    }
    window.deletePancakeShop = deletePancakeShop;

    // ─────────────────────────────────────────────────────────────
    // QUẢN LÝ KOC / KOL, LINK VIDEO TIKTOK & TÍNH HOA HỒNG
    // ─────────────────────────────────────────────────────────────
    let kocSources = [];
    let kocDefaultRules = null;
    let kocSelectedSourceId = '';
    let kocInnerView = 'videos';
    let kocRulesTargetSource = null;
    let kocSearchTimer = null;

    function kocRulesSummaryText(r) {
        if (!r) return '';
        const deduct = Number(r.kpi_deduct_videos || 0);
        const viral = Number(r.viral_bonus || 0) > 0 ? ` · Thưởng viral (≥${r.viral_min_views} view): +${pcMoney(r.viral_bonus)}/video` : '';
        return `Mức view sàn: ≥${r.min_views || 200} view · Trừ KPI: ${deduct} video · Đơn giá: ${pcMoney(r.rate_per_video || 10000)}/video đạt${viral}`;
    }

    async function ensureKocStaffLoaded() {
        if (!pcStaff.length) {
            try {
                const r = await fetch('/api/staff');
                if (r.ok) pcStaff = (await r.json()).filter(s => s.is_active);
            } catch (e) { }
        }
        const sel = document.getElementById('koc-src-staff');
        if (sel) {
            const curVal = sel.value;
            sel.innerHTML = '<option value="">-- Chưa gán nhân viên --</option>' +
                pcStaff.map(s => `<option value="${s.id}">${escapeHtml(s.employee_code ? '[' + s.employee_code + '] ' : '')}${escapeHtml(s.name)}${s.position ? ' (' + escapeHtml(s.position) + ')' : ''}</option>`).join('');
            sel.value = curVal;
        }
    }

    async function loadKocTab() {
        await ensureKocStaffLoaded();
        const monthEl = document.getElementById('koc-month-filter');
        const month = monthEl ? monthEl.value : '';
        try {
            const url = month ? `/api/marketplace/koc/sources?month=${encodeURIComponent(month)}` : '/api/marketplace/koc/sources';
            const res = await fetch(url);
            const data = await res.json();
            if (!res.ok) throw new Error(data.detail || 'Lỗi tải nguồn KOC');
            kocSources = data.sources || [];
            kocDefaultRules = data.default_rules || { min_views: 200, kpi_deduct_videos: 0, rate_per_video: 10000, viral_min_views: 1000, viral_bonus: 0 };

            const rulesTxt = document.getElementById('koc-default-rules-text');
            if (rulesTxt) rulesTxt.textContent = 'Công thức chung: ' + kocRulesSummaryText(kocDefaultRules);

            const srcSelect = document.getElementById('koc-source-select');
            if (srcSelect) {
                const prev = kocSelectedSourceId;
                srcSelect.innerHTML = '<option value="">-- Tất cả nguồn / chiến dịch --</option>' +
                    kocSources.map(s => `<option value="${s.id}">[${escapeHtml(s.month)}] ${escapeHtml(s.name)}${s.staff_name ? ' — ' + escapeHtml(s.staff_name) : ''}</option>`).join('');
                if (prev && kocSources.some(s => String(s.id) === String(prev))) {
                    srcSelect.value = prev;
                } else {
                    kocSelectedSourceId = '';
                    srcSelect.value = '';
                }
            }

            renderKocSourcesTable();
            updateKocTopKpiCards();
            await loadKocDetails();
        } catch (e) {
            pcToast('Lỗi tải tab KOC: ' + e.message, 'error');
        }
    }
    window.loadKocTab = loadKocTab;

    function onSelectKocSource(val) {
        kocSelectedSourceId = val || '';
        updateKocTopKpiCards();
        loadKocDetails();
    }
    window.onSelectKocSource = onSelectKocSource;

    function updateKocTopKpiCards() {
        const activeList = kocSelectedSourceId
            ? kocSources.filter(s => String(s.id) === String(kocSelectedSourceId))
            : kocSources;

        let totalKoc = 0, totalVids = 0, totalViews = 0, qualVids = 0, payableVids = 0, underVids = 0, errVids = 0, totalComm = 0;
        let minViewLabel = kocDefaultRules ? kocDefaultRules.min_views : 200;

        activeList.forEach(s => {
            const st = s.stats || {};
            totalKoc += Number(s.koc_count || st.unique_kocs || 0);
            totalVids += Number(st.total_videos || 0);
            totalViews += Number(st.total_views || 0);
            qualVids += Number(st.qualified_videos || 0);
            payableVids += Number(st.payable_videos || 0);
            underVids += Number(st.under_kpi_videos || 0);
            errVids += Number(st.error_videos || 0);
            totalComm += Number(st.commission || 0);
            if (activeList.length === 1 && s.rules) minViewLabel = s.rules.min_views;
        });

        document.getElementById('kpi-koc-count').textContent = totalKoc.toLocaleString('vi-VN');
        document.getElementById('kpi-koc-total-videos').textContent = totalVids.toLocaleString('vi-VN');
        document.getElementById('kpi-koc-total-views').textContent = `${totalViews.toLocaleString('vi-VN')} lượt xem`;
        document.getElementById('kpi-koc-min-view-label').textContent = `≥${minViewLabel}`;
        document.getElementById('kpi-koc-qualified-videos').textContent = qualVids.toLocaleString('vi-VN');
        document.getElementById('kpi-koc-payable-videos').textContent = `Tính thưởng: ${payableVids.toLocaleString('vi-VN')} video`;
        document.getElementById('kpi-koc-under-videos').textContent = underVids.toLocaleString('vi-VN');
        document.getElementById('kpi-koc-error-videos').textContent = `Lỗi/riêng tư: ${errVids}`;
        document.getElementById('kpi-koc-commission').textContent = pcMoney(totalComm);
    }

    function renderKocSourcesTable() {
        const tbody = document.getElementById('koc-sources-tbody');
        if (!tbody) return;
        if (!kocSources.length) {
            tbody.innerHTML = '<tr><td colspan="12" class="p-4 text-center text-slate-400">Chưa có nguồn Google Sheet nào. Bấm "🔗 + Thêm / Đổi Link Google Sheet" để kết nối.</td></tr>';
            return;
        }
        tbody.innerHTML = kocSources.map((s, idx) => {
            const st = s.stats || {};
            const r = s.rules || kocDefaultRules || {};
            const staffOpts = '<option value="">-- Chưa gán NV --</option>' +
                pcStaff.map(u => `<option value="${u.id}" ${u.id === s.staff_id ? 'selected' : ''}>${escapeHtml(u.employee_code ? '[' + u.employee_code + '] ' : '')}${escapeHtml(u.name)}</option>`).join('');
            const tabsInfo = [
                s.koc_tab_name ? `KOC: ${s.koc_tab_name}` : '',
                s.video_tab_name ? `View: ${s.video_tab_name}` : ''
            ].filter(Boolean).join(' · ') || 'Chưa chọn tab';

            return `<tr class="hover:bg-slate-50 ${String(s.id) === String(kocSelectedSourceId) ? 'bg-pink-50/40' : ''}">
                <td class="p-2.5">
                    <div class="font-bold text-slate-800 flex items-center gap-1.5">
                        <a href="${escapeHtml(s.sheet_url)}" target="_blank" class="text-pink-700 hover:underline" title="Mở Google Sheet gốc">🔗 ${escapeHtml(s.name)}</a>
                    </div>
                    <div class="text-[10px] text-slate-500">${escapeHtml(tabsInfo)}${s.last_sync_at ? ' · Sync: ' + escapeHtml(s.last_sync_at.slice(5, 16)) : ''}</div>
                </td>
                <td class="p-2.5 font-mono font-bold text-slate-700">${escapeHtml(s.month)}</td>
                <td class="p-2.5">
                    <select onchange="quickAssignKocStaff(${idx}, this.value)" class="border border-slate-300 rounded px-2 py-1 text-xs font-semibold text-slate-800 bg-white">
                        ${staffOpts}
                    </select>
                </td>
                <td class="p-2.5 text-center font-bold">${s.koc_count || 0}</td>
                <td class="p-2.5 text-center font-mono font-bold">${st.total_videos || 0}</td>
                <td class="p-2.5 text-center font-mono font-bold text-emerald-700">${st.qualified_videos || 0} <span class="text-[10px] text-slate-400 font-normal">(≥${r.min_views})</span></td>
                <td class="p-2.5 text-center font-mono text-amber-700">${st.under_kpi_videos || 0}</td>
                <td class="p-2.5 text-center font-mono text-slate-600">${r.kpi_deduct_videos || 0}</td>
                <td class="p-2.5 text-center font-mono font-black text-indigo-700">${st.payable_videos || 0}</td>
                <td class="p-2.5 text-right font-mono">${pcMoney(r.rate_per_video)}</td>
                <td class="p-2.5 text-right font-mono font-black text-pink-600">${pcMoney(st.commission)}</td>
                <td class="p-2.5 text-center whitespace-nowrap">
                    <button type="button" onclick="syncSingleKocSource(${s.id})" class="px-2 py-1 rounded text-[10px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200 hover:bg-emerald-100 cursor-pointer" title="Đồng bộ lại từ Google Sheet">🔄 Sync</button>
                    <button type="button" onclick="openKocRulesModal(${idx})" class="px-2 py-1 rounded text-[10px] font-bold ${s.custom_rules ? 'bg-indigo-100 text-indigo-800' : 'bg-slate-100 text-slate-600'} hover:bg-indigo-200 cursor-pointer" title="Chỉnh công thức tính">${s.custom_rules ? '⚙️ Riêng' : '⚙️ Chung'}</button>
                    <button type="button" onclick="openKocSourceModal(${s.id})" class="px-2 py-1 rounded text-[10px] font-bold bg-slate-100 text-slate-700 hover:bg-slate-200 cursor-pointer" title="Đổi link / đổi tab">✏️ Sửa</button>
                </td>
            </tr>`;
        }).join('');
    }

    async function quickAssignKocStaff(idx, staffId) {
        const s = kocSources[idx];
        if (!s) return;
        try {
            const res = await fetch('/api/marketplace/koc/sources', {
                method: 'POST', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    id: s.id, name: s.name, sheet_url: s.sheet_url, month: s.month,
                    staff_id: staffId ? Number(staffId) : null,
                    koc_tab_name: s.koc_tab_name, video_tab_name: s.video_tab_name,
                    rules: s.custom_rules ? s.rules : null
                })
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.detail || 'Lỗi gán NV');
            pcToast('Đã cập nhật nhân viên phụ trách KOC', 'success');
            await loadKocTab();
        } catch (e) { pcToast('Lỗi: ' + e.message, 'error'); }
    }
    window.quickAssignKocStaff = quickAssignKocStaff;

    function switchKocInnerView(view) {
        kocInnerView = view;
        const btnV = document.getElementById('btn-koc-view-videos');
        const btnP = document.getElementById('btn-koc-view-profiles');
        const paneV = document.getElementById('koc-pane-videos');
        const paneP = document.getElementById('koc-pane-profiles');
        const filterKpi = document.getElementById('koc-video-kpi-filter');

        if (view === 'videos') {
            btnV.className = 'px-3 py-1.5 rounded-md text-xs font-bold bg-white text-slate-900 shadow-2xs cursor-pointer transition';
            btnP.className = 'px-3 py-1.5 rounded-md text-xs font-semibold text-slate-600 hover:text-slate-900 cursor-pointer transition';
            paneV.classList.remove('hidden');
            paneP.classList.add('hidden');
            if (filterKpi) filterKpi.classList.remove('hidden');
        } else {
            btnP.className = 'px-3 py-1.5 rounded-md text-xs font-bold bg-white text-slate-900 shadow-2xs cursor-pointer transition';
            btnV.className = 'px-3 py-1.5 rounded-md text-xs font-semibold text-slate-600 hover:text-slate-900 cursor-pointer transition';
            paneP.classList.remove('hidden');
            paneV.classList.add('hidden');
            if (filterKpi) filterKpi.classList.add('hidden');
        }
    }
    window.switchKocInnerView = switchKocInnerView;

    function debounceKocSearch() {
        clearTimeout(kocSearchTimer);
        kocSearchTimer = setTimeout(() => loadKocDetails(), 350);
    }
    window.debounceKocSearch = debounceKocSearch;

    async function loadKocDetails() {
        const month = document.getElementById('koc-month-filter')?.value || '';
        const q = document.getElementById('koc-search-input')?.value.trim() || '';
        const kpiFilter = document.getElementById('koc-video-kpi-filter')?.value || 'all';

        const paramsV = new URLSearchParams({ kpi_filter: kpiFilter });
        const paramsP = new URLSearchParams();
        if (kocSelectedSourceId) {
            paramsV.append('source_id', kocSelectedSourceId);
            paramsP.append('source_id', kocSelectedSourceId);
        }
        if (month) {
            paramsV.append('month', month);
            paramsP.append('month', month);
        }
        if (q) {
            paramsV.append('q', q);
            paramsP.append('q', q);
        }

        try {
            const [resV, resP] = await Promise.all([
                fetch(`/api/marketplace/koc/videos?${paramsV}`),
                fetch(`/api/marketplace/koc/profiles?${paramsP}`)
            ]);
            const dataV = resV.ok ? await resV.json() : { videos: [], min_views: 200 };
            const dataP = resP.ok ? await resP.json() : { profiles: [] };

            const videos = dataV.videos || [];
            const minV = dataV.min_views || 200;
            const profiles = dataP.profiles || [];

            document.getElementById('badge-koc-video-count').textContent = videos.length;
            document.getElementById('badge-koc-profile-count').textContent = profiles.length;

            const vTbody = document.getElementById('koc-videos-tbody');
            if (vTbody) {
                if (!videos.length) {
                    vTbody.innerHTML = '<tr><td colspan="9" class="p-6 text-center text-slate-400">Không có link video nào khớp bộ lọc.</td></tr>';
                } else {
                    vTbody.innerHTML = videos.map((v, i) => {
                        const views = Number(v.views || 0);
                        const isQual = views >= minV;
                        const kpiBadge = isQual
                            ? `<span class="px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-100 text-emerald-800">✅ Đạt (≥${minV})</span>`
                            : `<span class="px-2 py-0.5 rounded text-[10px] font-bold bg-amber-100 text-amber-800">Chưa đạt</span>`;
                        const uname = v.koc_username ? '@' + v.koc_username.replace(/^\/?@/, '') : '—';
                        return `<tr class="hover:bg-slate-50 ${isQual ? 'bg-emerald-50/20' : ''}">
                            <td class="p-2.5 text-center text-slate-400 font-mono">${i + 1}</td>
                            <td class="p-2.5 font-bold text-slate-800">
                                <a href="https://www.tiktok.com/${escapeHtml(uname)}" target="_blank" class="hover:text-pink-600 hover:underline">${escapeHtml(uname)}</a>
                                <div class="text-[10px] text-slate-400 font-normal">${escapeHtml(v.source_name || '')}</div>
                            </td>
                            <td class="p-2.5 max-w-[280px] truncate font-mono">
                                <a href="${escapeHtml(v.video_url)}" target="_blank" class="text-sky-700 hover:underline" title="${escapeHtml(v.video_url)}">${escapeHtml(v.video_url)}</a>
                            </td>
                            <td class="p-2.5 max-w-[220px]">
                                <div class="font-semibold text-slate-700">${escapeHtml(v.product_note || '')}</div>
                                <div class="text-[10px] text-slate-400 truncate" title="${escapeHtml(v.title || '')}">${escapeHtml(v.title || '')}</div>
                            </td>
                            <td class="p-2.5 text-right">
                                <input type="number" min="0" value="${views}" onchange="updateSingleKocVideoViews(${v.id}, this.value)" class="w-24 border border-slate-200 focus:border-pink-500 rounded px-2 py-1 text-right font-mono font-bold ${isQual ? 'text-emerald-700 bg-white' : 'text-slate-700 bg-slate-50'}" title="Sửa nhanh số view">
                            </td>
                            <td class="p-2.5 text-center">${kpiBadge}</td>
                            <td class="p-2.5 text-center"><span class="text-[10px] font-semibold text-slate-600">${escapeHtml(v.status || 'OK')}</span></td>
                            <td class="p-2.5 text-[10px] text-slate-500 font-mono">${escapeHtml((v.updated_at || '').slice(0, 16))}</td>
                            <td class="p-2.5 text-center">
                                <button type="button" onclick="deleteSingleKocVideo(${v.id})" class="text-rose-500 hover:text-rose-700 font-bold px-1.5 py-0.5 cursor-pointer" title="Xóa link này">🗑️</button>
                            </td>
                        </tr>`;
                    }).join('');
                }
            }

            const pTbody = document.getElementById('koc-profiles-tbody');
            if (pTbody) {
                if (!profiles.length) {
                    pTbody.innerHTML = '<tr><td colspan="9" class="p-6 text-center text-slate-400">Không có KOC/KOL nào.</td></tr>';
                } else {
                    pTbody.innerHTML = profiles.map((p, i) => {
                        const uname = p.koc_username ? '@' + p.koc_username.replace(/^\/?@/, '') : '—';
                        return `<tr class="hover:bg-slate-50">
                            <td class="p-2.5 text-center text-slate-400 font-mono">${i + 1}</td>
                            <td class="p-2.5">
                                <a href="${escapeHtml(p.channel_url || 'https://www.tiktok.com/' + uname)}" target="_blank" class="font-bold text-pink-700 hover:underline">${escapeHtml(uname)}</a>
                                <div class="text-[10px] text-slate-400">${escapeHtml(p.source_name || '')}</div>
                            </td>
                            <td class="p-2.5 text-slate-700">
                                <div>FL: <b>${escapeHtml(p.followers || '—')}</b></div>
                                ${p.gmv_text ? `<div class="text-[10px] text-emerald-700">GMV: ${escapeHtml(p.gmv_text)}</div>` : ''}
                            </td>
                            <td class="p-2.5 font-semibold text-slate-700">${escapeHtml(p.product_sample || '—')}</td>
                            <td class="p-2.5 text-center"><span class="px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-100 text-emerald-800">${escapeHtml(p.approval_status || 'DUYỆT')}</span></td>
                            <td class="p-2.5 text-right font-mono">${p.cast_fee > 0 ? pcMoney(p.cast_fee) : '<span class="text-slate-400">Freecast</span>'}</td>
                            <td class="p-2.5 text-center font-mono font-bold text-indigo-700">${p.actual_videos || p.videos_returned || 0}</td>
                            <td class="p-2.5 text-right font-mono font-bold text-emerald-700">${Number(p.total_views || 0).toLocaleString('vi-VN')}</td>
                            <td class="p-2.5 text-slate-600 max-w-[220px] truncate" title="${escapeHtml((p.contact_info || '') + ' ' + (p.note || ''))}">${escapeHtml(p.contact_info || p.note || '—')}</td>
                        </tr>`;
                    }).join('');
                }
            }
        } catch (e) {
            console.error('loadKocDetails error:', e);
        }
    }
    window.loadKocDetails = loadKocDetails;

    async function updateSingleKocVideoViews(videoId, newViews) {
        try {
            const res = await fetch(`/api/marketplace/koc/videos/${videoId}`, {
                method: 'PUT', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ views: Math.max(0, parseInt(newViews || 0, 10)), status: 'Cập nhật tay' })
            });
            if (!res.ok) throw new Error('Lỗi lưu số view');
            await loadKocTab();
        } catch (e) { pcToast(e.message, 'error'); }
    }
    window.updateSingleKocVideoViews = updateSingleKocVideoViews;

    async function deleteSingleKocVideo(videoId) {
        try {
            const res = await fetch(`/api/marketplace/koc/videos/${videoId}`, { method: 'DELETE' });
            if (!res.ok) throw new Error('Lỗi xóa video');
            await loadKocTab();
        } catch (e) { pcToast(e.message, 'error'); }
    }
    window.deleteSingleKocVideo = deleteSingleKocVideo;

    async function openKocSourceModal(sourceId = null) {
        await ensureKocStaffLoaded();
        const src = sourceId ? kocSources.find(s => s.id === sourceId) : null;
        document.getElementById('koc-src-id').value = src ? src.id : '';
        document.getElementById('koc-src-name').value = src ? src.name : '';
        const nowMonth = new Date().toISOString().slice(0, 7);
        document.getElementById('koc-src-month').value = src ? src.month : (document.getElementById('koc-month-filter')?.value || nowMonth);
        document.getElementById('koc-src-url').value = src ? src.sheet_url : '';
        document.getElementById('koc-src-staff').value = src && src.staff_id ? src.staff_id : '';
        document.getElementById('btn-koc-src-delete').classList.toggle('invisible', !src);
        document.getElementById('koc-src-inspect-msg').classList.add('hidden');

        const kocTabSel = document.getElementById('koc-src-koc-tab');
        const vidTabSel = document.getElementById('koc-src-video-tab');
        kocTabSel.innerHTML = `<option value="${escapeHtml(src?.koc_tab_name || '')}">${src?.koc_tab_name ? escapeHtml(src.koc_tab_name) : '-- Bấm "Tải DS Tab" để chọn --'}</option>`;
        vidTabSel.innerHTML = `<option value="${escapeHtml(src?.video_tab_name || '')}">${src?.video_tab_name ? escapeHtml(src.video_tab_name) : '-- Bấm "Tải DS Tab" để chọn --'}</option>`;

        document.getElementById('modal-koc-source').classList.remove('hidden');
        if (src && src.sheet_url) {
            inspectKocSheetTabs(src.koc_tab_name, src.video_tab_name);
        }
    }
    window.openKocSourceModal = openKocSourceModal;

    function closeKocSourceModal() {
        document.getElementById('modal-koc-source')?.classList.add('hidden');
    }
    window.closeKocSourceModal = closeKocSourceModal;

    async function inspectKocSheetTabs(presetKocTab = null, presetVidTab = null) {
        const url = document.getElementById('koc-src-url').value.trim();
        const msgBox = document.getElementById('koc-src-inspect-msg');
        const btn = document.getElementById('btn-koc-inspect');
        if (!url) return pcToast('Vui lòng dán link Google Sheet trước', 'warning');

        msgBox.className = 'p-2 rounded-lg text-[11px] bg-slate-100 text-slate-700 font-bold';
        msgBox.textContent = '⏳ Đang kết nối và đọc danh sách các Tab trong Google Sheet...';
        msgBox.classList.remove('hidden');
        if (btn) btn.disabled = true;

        try {
            const res = await fetch('/api/marketplace/koc/inspect-sheet', {
                method: 'POST', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ sheet_url: url })
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.detail || 'Không đọc được Sheet');
            const tabs = data.tabs || [];
            const kocTabSel = document.getElementById('koc-src-koc-tab');
            const vidTabSel = document.getElementById('koc-src-video-tab');

            const curKoc = presetKocTab !== null ? presetKocTab : kocTabSel.value;
            const curVid = presetVidTab !== null ? presetVidTab : vidTabSel.value;

            kocTabSel.innerHTML = '<option value="">-- Không chọn / Tự trích từ video --</option>' +
                tabs.map(t => `<option value="${escapeHtml(t.name)}">${t.kind === 'koc_booking' ? '👥 ' : ''}${escapeHtml(t.name)} (${t.rows} dòng)</option>`).join('');
            vidTabSel.innerHTML = '<option value="">-- Không chọn --</option>' +
                tabs.map(t => `<option value="${escapeHtml(t.name)}">${t.kind === 'video_views' ? '📹 ' : ''}${escapeHtml(t.name)} (${t.rows} dòng)</option>`).join('');

            if (curKoc && tabs.some(t => t.name === curKoc)) kocTabSel.value = curKoc;
            if (curVid && tabs.some(t => t.name === curVid)) vidTabSel.value = curVid;

            msgBox.className = 'p-2 rounded-lg text-[11px] bg-emerald-100 text-emerald-800 font-bold';
            msgBox.textContent = `✅ Đã tìm thấy ${tabs.length} tab trong Google Sheet! Hãy chọn tab tương ứng bên trên.`;
        } catch (e) {
            msgBox.className = 'p-2 rounded-lg text-[11px] bg-rose-100 text-rose-800 font-bold';
            msgBox.textContent = '❌ ' + e.message;
        } finally {
            if (btn) btn.disabled = false;
        }
    }
    window.inspectKocSheetTabs = inspectKocSheetTabs;

    async function saveKocSourceAndSync() {
        const id = document.getElementById('koc-src-id').value;
        const name = document.getElementById('koc-src-name').value.trim();
        const month = document.getElementById('koc-src-month').value.trim();
        const sheet_url = document.getElementById('koc-src-url').value.trim();
        const koc_tab_name = document.getElementById('koc-src-koc-tab').value;
        const video_tab_name = document.getElementById('koc-src-video-tab').value;
        const staff_id = document.getElementById('koc-src-staff').value;

        if (!name || !month || !sheet_url) {
            return pcToast('Vui lòng nhập Tên chiến dịch, Tháng và Link Google Sheet', 'warning');
        }
        if (!koc_tab_name && !video_tab_name) {
            return pcToast('Hãy chọn ít nhất 1 Tab (Tab DS KOC hoặc Tab Link & View)', 'warning');
        }

        const btn = document.getElementById('btn-koc-src-save');
        if (btn) { btn.disabled = true; btn.textContent = '⏳ Đang lưu & đồng bộ...'; }

        try {
            const existing = id ? kocSources.find(s => String(s.id) === String(id)) : null;
            const res = await fetch('/api/marketplace/koc/sources', {
                method: 'POST', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    id: id ? Number(id) : null,
                    name, sheet_url, month,
                    staff_id: staff_id ? Number(staff_id) : null,
                    koc_tab_name, video_tab_name,
                    rules: existing && existing.custom_rules ? existing.rules : null
                })
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.detail || 'Lỗi lưu nguồn');

            const syncRes = await fetch(`/api/marketplace/koc/sources/${data.id}/sync`, { method: 'POST' });
            const syncData = await syncRes.json();
            if (!syncRes.ok) throw new Error(syncData.detail || 'Lỗi đồng bộ dữ liệu từ Sheet');

            pcToast(syncData.message || 'Đã lưu và đồng bộ thành công!', 'success');
            closeKocSourceModal();
            kocSelectedSourceId = String(data.id);
            await loadKocTab();
        } catch (e) {
            pcToast('Lỗi: ' + e.message, 'error');
        } finally {
            if (btn) { btn.disabled = false; btn.textContent = '💾 Lưu & Đồng Bộ Ngay'; }
        }
    }
    window.saveKocSourceAndSync = saveKocSourceAndSync;

    async function deleteKocSourceModal() {
        const id = document.getElementById('koc-src-id').value;
        if (!id) return;
        const ok = window.showConfirmModal
            ? await window.showConfirmModal({ title: 'Xóa nguồn KOC?', message: 'Xóa chiến dịch này cùng toàn bộ KOC và video thuộc chiến dịch.', confirmText: 'Xóa', type: 'danger' })
            : confirm('Xóa nguồn KOC này?');
        if (!ok) return;
        try {
            const res = await fetch(`/api/marketplace/koc/sources/${id}`, { method: 'DELETE' });
            if (!res.ok) throw new Error('Lỗi xóa nguồn');
            closeKocSourceModal();
            if (String(kocSelectedSourceId) === String(id)) kocSelectedSourceId = '';
            await loadKocTab();
            pcToast('Đã xóa nguồn KOC', 'success');
        } catch (e) { pcToast(e.message, 'error'); }
    }
    window.deleteKocSourceModal = deleteKocSourceModal;

    async function syncSingleKocSource(sourceId) {
        const btn = document.getElementById('btn-koc-sync-sheet');
        if (btn) { btn.disabled = true; btn.textContent = '⏳ Đang đồng bộ...'; }
        try {
            const res = await fetch(`/api/marketplace/koc/sources/${sourceId}/sync`, { method: 'POST' });
            const data = await res.json();
            if (!res.ok) throw new Error(data.detail || 'Lỗi đồng bộ');
            pcToast(data.message, 'success');
            await loadKocTab();
        } catch (e) {
            pcToast('Lỗi: ' + e.message, 'error');
        } finally {
            if (btn) { btn.disabled = false; btn.textContent = '🔄 Đồng Bộ Từ Sheet'; }
        }
    }
    window.syncSingleKocSource = syncSingleKocSource;

    async function syncCurrentKocSheet() {
        const targets = kocSelectedSourceId
            ? kocSources.filter(s => String(s.id) === String(kocSelectedSourceId))
            : kocSources;
        if (!targets.length) return openKocSourceModal();
        for (const s of targets) {
            await syncSingleKocSource(s.id);
        }
    }
    window.syncCurrentKocSheet = syncCurrentKocSheet;

    async function scanCurrentKocViews() {
        const targetId = kocSelectedSourceId || (kocSources[0] ? kocSources[0].id : null);
        if (!targetId) return pcToast('Hãy kết nối nguồn Sheet trước', 'warning');
        const btn = document.getElementById('btn-koc-scan-views');
        if (btn) { btn.disabled = true; btn.textContent = '⏳ Đang quét view...'; }
        try {
            const res = await fetch(`/api/marketplace/koc/sources/${targetId}/refresh-views?limit=80`, { method: 'POST' });
            const data = await res.json();
            if (!res.ok) throw new Error(data.detail || 'Lỗi quét view');
            pcToast(data.message, 'success');
            await loadKocTab();
        } catch (e) {
            pcToast('Lỗi: ' + e.message, 'error');
        } finally {
            if (btn) { btn.disabled = false; btn.textContent = '👁️ Quét View TikTok'; }
        }
    }
    window.scanCurrentKocViews = scanCurrentKocViews;

    function fillKocRulesInputs(r) {
        document.getElementById('koc-rule-min-views').value = r.min_views ?? 200;
        document.getElementById('koc-rule-kpi-deduct').value = r.kpi_deduct_videos ?? 0;
        document.getElementById('koc-rule-rate').value = Number(r.rate_per_video ?? 10000).toLocaleString('vi-VN');
        document.getElementById('koc-rule-viral-views').value = r.viral_min_views ?? 1000;
        document.getElementById('koc-rule-viral-bonus').value = Number(r.viral_bonus ?? 0).toLocaleString('vi-VN');
    }

    function toggleKocRulesInputs() {
        const useDefault = document.getElementById('koc-rules-use-default').checked;
        document.getElementById('koc-rules-inputs').classList.toggle('opacity-40', useDefault);
        document.getElementById('koc-rules-inputs').classList.toggle('pointer-events-none', useDefault);
        if (useDefault && kocDefaultRules) fillKocRulesInputs(kocDefaultRules);
    }
    window.toggleKocRulesInputs = toggleKocRulesInputs;

    function openKocRulesModal(sourceIdx = null) {
        kocRulesTargetSource = (sourceIdx === null || sourceIdx === undefined) ? null : kocSources[sourceIdx];
        const isDefault = !kocRulesTargetSource;
        document.getElementById('koc-rules-title').textContent = isDefault
            ? '⚙️ Công Thức Hoa Hồng Chung (Mọi Chiến Dịch)'
            : `⚙️ Công Thức Riêng — ${kocRulesTargetSource.name}`;
        document.getElementById('koc-rules-use-default-wrap').classList.toggle('hidden', isDefault);
        document.getElementById('koc-rules-use-default').checked = !isDefault && !kocRulesTargetSource.custom_rules;
        fillKocRulesInputs(isDefault ? (kocDefaultRules || {}) : (kocRulesTargetSource.rules || kocDefaultRules || {}));
        toggleKocRulesInputs();
        document.getElementById('modal-koc-rules').classList.remove('hidden');
    }
    window.openKocRulesModal = openKocRulesModal;

    function closeKocRulesModal() {
        document.getElementById('modal-koc-rules')?.classList.add('hidden');
    }
    window.closeKocRulesModal = closeKocRulesModal;

    async function saveKocRules() {
        const rules = {
            min_views: Math.max(0, parseInt(document.getElementById('koc-rule-min-views').value || 0, 10)),
            kpi_deduct_videos: Math.max(0, parseInt(document.getElementById('koc-rule-kpi-deduct').value || 0, 10)),
            rate_per_video: parseMoneyInput(document.getElementById('koc-rule-rate').value),
            viral_min_views: Math.max(0, parseInt(document.getElementById('koc-rule-viral-views').value || 0, 10)),
            viral_bonus: parseMoneyInput(document.getElementById('koc-rule-viral-bonus').value),
        };
        const useDefault = kocRulesTargetSource && document.getElementById('koc-rules-use-default').checked;
        try {
            if (kocRulesTargetSource) {
                const s = kocRulesTargetSource;
                const res = await fetch('/api/marketplace/koc/sources', {
                    method: 'POST', headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        id: s.id, name: s.name, sheet_url: s.sheet_url, month: s.month,
                        staff_id: s.staff_id, koc_tab_name: s.koc_tab_name, video_tab_name: s.video_tab_name,
                        rules: useDefault ? null : rules
                    })
                });
                if (!res.ok) throw new Error('Lỗi lưu công thức riêng');
            } else {
                const res = await fetch('/api/marketplace/koc/rules', {
                    method: 'PUT', headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(rules)
                });
                if (!res.ok) throw new Error('Lỗi lưu công thức chung');
            }
            pcToast('Đã lưu công thức tính hoa hồng KOC', 'success');
            closeKocRulesModal();
            await loadKocTab();
        } catch (e) { pcToast(e.message, 'error'); }
    }
    window.saveKocRules = saveKocRules;

    function openAddKocVideoModal() {
        if (!kocSources.length) return openKocSourceModal();
        const sel = document.getElementById('koc-add-video-source');
        sel.innerHTML = kocSources.map(s => `<option value="${s.id}" ${String(s.id) === String(kocSelectedSourceId) ? 'selected' : ''}>[${escapeHtml(s.month)}] ${escapeHtml(s.name)}</option>`).join('');
        document.getElementById('koc-add-video-urls').value = '';
        document.getElementById('koc-add-video-note').value = '';
        document.getElementById('modal-koc-add-video').classList.remove('hidden');
    }
    window.openAddKocVideoModal = openAddKocVideoModal;

    function closeAddKocVideoModal() {
        document.getElementById('modal-koc-add-video')?.classList.add('hidden');
    }
    window.closeAddKocVideoModal = closeAddKocVideoModal;

    async function submitManualKocVideos() {
        const source_id = Number(document.getElementById('koc-add-video-source').value);
        const urls_text = document.getElementById('koc-add-video-urls').value.trim();
        const product_note = document.getElementById('koc-add-video-note').value.trim();
        if (!urls_text) return pcToast('Hãy dán ít nhất 1 link video TikTok', 'warning');
        try {
            const res = await fetch('/api/marketplace/koc/videos', {
                method: 'POST', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ source_id, urls_text, product_note })
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.detail || 'Lỗi thêm link');
            pcToast(data.message, 'success');
            closeAddKocVideoModal();
            await loadKocTab();
        } catch (e) { pcToast(e.message, 'error'); }
    }
    window.submitManualKocVideos = submitManualKocVideos;

})();
