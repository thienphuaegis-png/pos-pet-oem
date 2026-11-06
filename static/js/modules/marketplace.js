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
                    else if (t === 'koc') btn.className += 'border-sky-600 text-sky-700';
                    else if (t === 'mapping') btn.className += 'border-sky-600 text-sky-700';
                    else btn.className += 'border-sky-600 text-sky-700';
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
            badge.className = 'px-2.5 py-1 rounded-full text-xs font-bold bg-emerald-100 text-emerald-800';
        } else {
            badge.className = 'px-2.5 py-1 rounded-full text-xs font-bold bg-rose-100 text-rose-800';
        }
    }

    function updateTikTokBadge(ok, text) {
        const badge = document.getElementById('mkt-tiktok-status-badge');
        if (!badge) return;
        badge.textContent = text;
        if (ok) {
            badge.className = 'px-2.5 py-1 rounded-full text-xs font-bold bg-emerald-100 text-emerald-800';
        } else {
            badge.className = 'px-2.5 py-1 rounded-full text-xs font-bold bg-rose-100 text-rose-800';
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
        resDiv.className = 'mt-2 p-2 rounded-lg text-xs bg-slate-100 text-slate-700 font-bold';
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
                resDiv.className = 'mt-2 p-2 rounded-lg text-xs bg-emerald-100 text-emerald-800 font-bold';
                resDiv.innerHTML = `✅ ${escapeHtml(data.message)} (SPC_CDS: ${data.spc_cds || 'OK'})`;
            } else {
                resDiv.className = 'mt-2 p-2 rounded-lg text-xs bg-rose-100 text-rose-800 font-bold';
                resDiv.innerHTML = `❌ ${escapeHtml(data.message)}`;
            }
        } catch (e) {
            resDiv.className = 'mt-2 p-2 rounded-lg text-xs bg-rose-100 text-rose-800 font-bold';
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
                        ? `<span class="px-1.5 py-0.5 rounded text-xs bg-emerald-100 text-emerald-800 font-bold" title="${escapeHtml(it.pos_product_name || '')}">✓ Kho: ${escapeHtml(it.pos_product_code || '')}</span>`
                        : `<button type="button" onclick="promptMapItem('shopee', '${escapeHtml(it.platform_product_name)}', '${escapeHtml(it.platform_variation || '')}')" class="px-1.5 py-0.5 rounded text-xs bg-amber-100 hover:bg-amber-200 text-amber-800 font-bold transition">⚠️ Map ngay</button>`;

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
                    ? '<span class="px-2 py-0.5 rounded-full text-xs font-bold bg-emerald-100 text-emerald-800">100% Đã Map</span>'
                    : '<span class="px-2 py-0.5 rounded-full text-xs font-bold bg-amber-100 text-amber-800">Cần Ánh Xạ</span>';

                const totalFee = (o.fee_fixed || 0) + (o.fee_service || 0) + (o.fee_payment || 0) + (o.shop_voucher || 0);
                const netPayout = o.net_payout > 0 ? o.net_payout : Math.max(0, (o.total_amount || 0) - totalFee);
                const trackingBadge = o.tracking_number ? `<div class="text-xs text-slate-400 font-mono mt-0.5">🚚 ${escapeHtml(o.tracking_number)}</div>` : '';
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
                            <span class="px-2 py-0.5 rounded text-xs font-bold bg-slate-100 text-slate-700">${escapeHtml(o.order_status)}</span>
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
                        ? `<span class="px-1.5 py-0.5 rounded text-xs bg-emerald-100 text-emerald-800 font-bold" title="${escapeHtml(it.pos_product_name || '')}">✓ Kho: ${escapeHtml(it.pos_product_code || '')}</span>`
                        : `<button type="button" onclick="promptMapItem('tiktok', '${escapeHtml(it.platform_product_name)}', '${escapeHtml(it.platform_variation || '')}')" class="px-1.5 py-0.5 rounded text-xs bg-amber-100 hover:bg-amber-200 text-amber-800 font-bold transition">⚠️ Map ngay</button>`;

                    const skuHint = it.platform_sku ? `<span class="text-xs text-slate-400 font-mono">[${escapeHtml(it.platform_sku)}]</span> ` : '';

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
                    ? '<span class="px-2 py-0.5 rounded-full text-xs font-bold bg-emerald-100 text-emerald-800">100% Đã Map</span>'
                    : '<span class="px-2 py-0.5 rounded-full text-xs font-bold bg-amber-100 text-amber-800">Cần Ánh Xạ</span>';

                const shopVoucher = o.shop_voucher || 0;
                const netPayout = o.net_payout > 0 ? o.net_payout : Math.max(0, (o.total_amount || 0) - shopVoucher);
                const trackingBadge = o.tracking_number ? `<div class="text-xs text-slate-400 font-mono mt-0.5">🚚 ${escapeHtml(o.tracking_number)}</div>` : '';
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
                            <span class="px-2 py-0.5 rounded text-xs font-bold bg-slate-100 text-slate-700">${escapeHtml(o.order_status)}</span>
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
                ? '<span class="text-xs text-sky-700 bg-sky-50 border border-sky-200 font-bold px-1.5 py-0.5 rounded ml-1 animate-pulse">🤖 Gợi ý</span>' 
                : '';

            return `
                <tr class="hover:bg-amber-50/40 transition">
                    <td class="p-2.5">${platformBadge}</td>
                    <td class="p-2.5">
                        <div class="font-bold text-slate-800">${escapeHtml(it.platform_product_name)}</div>
                        ${it.platform_sku ? `<div class="text-xs text-slate-400 font-mono mt-0.5">SKU: ${escapeHtml(it.platform_sku)}</div>` : ''}
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
                                   class="w-full border ${sel && sel.isAi ? 'border-sky-400 bg-sky-50/30 font-bold text-sky-900' : 'border-slate-300 bg-white font-medium text-slate-800'} rounded-lg px-2.5 py-1.5 text-xs focus:ring-1 focus:ring-emerald-500 outline-none">
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
            dd.innerHTML = '<div class="p-3 text-center text-slate-400 ">Không tìm thấy sản phẩm nào trong kho</div>';
            dd.classList.remove('hidden');
            return;
        }

        dd.innerHTML = matches.map(p => `
            <div onclick="selectMktProductForRow(${idx}, ${p.id}, '${escapeHtml(p.name)}', '${escapeHtml(p.code || '')}')" 
                 class="p-2.5 hover:bg-emerald-50 cursor-pointer flex justify-between items-center transition">
                <div>
                    <span class="font-mono font-bold text-slate-500 mr-1">[${p.code || '-'}]</span>
                    <span class="font-bold text-slate-800">${p.name}</span>
                    <span class="text-slate-400 text-xs ml-1">(${p.unit || 'cái'})</span>
                </div>
                <div class="text-right shrink-0 ml-2">
                    <span class="text-xs text-slate-400">Tồn: <strong class="text-slate-700">${p.stock || 0}</strong></span>
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
                        <td class="p-2.5 font-bold text-sky-700">
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
                            <div class="text-xs text-slate-400 font-mono">${escapeHtml(it.code)}</div>
                        </td>
                        <td class="p-2.5 text-center text-slate-500 font-medium">${escapeHtml(it.unit || '')}</td>
                        <td class="p-2.5 text-center font-bold text-sky-600 font-mono">${it.pos_qty}</td>
                        <td class="p-2.5 text-center font-bold text-orange-600 font-mono">${it.shopee_qty}</td>
                        <td class="p-2.5 text-center font-bold text-slate-900 font-mono">${it.tiktok_qty}</td>
                        <td class="p-2.5 text-center font-bold text-sky-700 font-mono bg-sky-50/50 text-sm">${it.total_qty}</td>
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
        userMsgDiv.className = 'bg-sky-600 text-white p-2.5 rounded-lg ml-8 text-xs font-medium';
        userMsgDiv.textContent = prompt;
        container.appendChild(userMsgDiv);
        inp.value = '';

        // Render thinking message
        const aiMsgDiv = document.createElement('div');
        aiMsgDiv.className = 'bg-white p-3 rounded-lg border border-slate-200 shadow-2xs mr-8 text-xs text-slate-700 space-y-1.5';
        aiMsgDiv.innerHTML = '<div class="text-sky-600 font-bold flex items-center gap-1.5"><span>⏳</span> AI đang tổng hợp và phân tích dữ liệu...</div>';
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
                <div class="font-bold text-sky-700 flex items-center gap-1 text-xs">
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
        if (p === 'shopee') return '<span class="px-2 py-0.5 rounded text-xs font-bold bg-orange-100 text-orange-800 border border-orange-200">Shopee</span>';
        if (p === 'pancake') return '<span class="px-2 py-0.5 rounded text-xs font-bold bg-amber-100 text-amber-800 border border-amber-200">Pancake</span>';
        return '<span class="px-2 py-0.5 rounded text-xs font-bold bg-slate-900 text-white">TikTok</span>';
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

    function _pcMonthBounds(offsetMonths = 0) {
        const now = new Date();
        const d = new Date(now.getFullYear(), now.getMonth() + offsetMonths, 1);
        const y = d.getFullYear();
        const m = d.getMonth() + 1;
        const lastDay = new Date(y, m, 0).getDate();
        const mm = String(m).padStart(2, '0');
        return {
            month: `${y}-${mm}`,
            from: `${y}-${mm}-01`,
            to: `${y}-${mm}-${String(lastDay).padStart(2, '0')}`
        };
    }

    function syncPancakePeriodPills() {
        const fromVal = document.getElementById('pc-date-from')?.value || '';
        const toVal = document.getElementById('pc-date-to')?.value || '';
        const curM = _pcMonthBounds(0);
        const prevM = _pcMonthBounds(-1);
        let activeMode = 'range';
        if (fromVal === curM.from && (toVal === curM.to || toVal === new Intl.DateTimeFormat('en-CA').format(new Date()))) {
            activeMode = 'this_month';
        } else if (fromVal === prevM.from && toVal === prevM.to) {
            activeMode = 'prev_month';
        }
        const onCls = 'px-2.5 py-1 rounded-md bg-sky-600 text-white cursor-pointer transition';
        const offCls = 'px-2.5 py-1 rounded-md text-slate-600 hover:text-slate-900 cursor-pointer transition';
        const bThis = document.getElementById('pc-period-this-month');
        const bPrev = document.getElementById('pc-period-prev-month');
        const bCust = document.getElementById('pc-period-custom');
        if (bThis) bThis.className = activeMode === 'this_month' ? onCls : offCls;
        if (bPrev) bPrev.className = activeMode === 'prev_month' ? onCls : offCls;
        if (bCust) bCust.className = activeMode === 'range' ? onCls : offCls;
    }

    window.setPancakePeriodPreset = function(mode) {
        const fromEl = document.getElementById('pc-date-from');
        const toEl = document.getElementById('pc-date-to');
        if (!fromEl || !toEl) return;
        if (mode === 'this_month') {
            const b = _pcMonthBounds(0);
            fromEl.value = b.from;
            toEl.value = b.to;
        } else if (mode === 'prev_month') {
            const b = _pcMonthBounds(-1);
            fromEl.value = b.from;
            toEl.value = b.to;
        } else {
            fromEl.focus();
        }
        syncPancakePeriodPills();
        if (typeof window.syncHrmPeriodFromPancake === 'function') {
            window.syncHrmPeriodFromPancake(fromEl.value, toEl.value, mode);
        }
        loadPancakeTab();
    };

    window.onPancakeDateInputChanged = function() {
        const fromEl = document.getElementById('pc-date-from');
        const toEl = document.getElementById('pc-date-to');
        syncPancakePeriodPills();
        if (fromEl?.value && toEl?.value && typeof window.syncHrmPeriodFromPancake === 'function') {
            window.syncHrmPeriodFromPancake(fromEl.value, toEl.value, 'range');
        }
        loadPancakeTab();
    };

    window.syncPancakeFromHrmPeriod = function(fromStr, toStr) {
        const fromEl = document.getElementById('pc-date-from');
        const toEl = document.getElementById('pc-date-to');
        if (fromEl && fromStr) fromEl.value = fromStr;
        if (toEl && toStr) toEl.value = toStr;
        syncPancakePeriodPills();
    };

    function pcRange() {
        const fromEl = document.getElementById('pc-date-from');
        const toEl = document.getElementById('pc-date-to');
        if (fromEl && !fromEl.value) {
            if (typeof window.getSharedHrmPeriodRange === 'function') {
                const shared = window.getSharedHrmPeriodRange();
                if (shared && shared.from && shared.to) {
                    fromEl.value = shared.from;
                    toEl.value = shared.to;
                }
            }
            if (!fromEl.value) {
                const curM = _pcMonthBounds(0);
                fromEl.value = curM.from;
                toEl.value = curM.to;
            }
        }
        syncPancakePeriodPills();
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
            try {
                let r = await fetch('/api/hrm/employees');
                if (!r.ok) r = await fetch('/api/staff');
                if (r.ok) pcStaff = (await r.json()).filter(s => s.is_active !== 0 && s.is_payroll_staff !== 0);
            } catch (e) { }
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
                <span class="block text-xs text-slate-500 font-mono">ID ${escapeHtml(sid || '?')}${a.last_sync_at ? ' · sync ' + escapeHtml(a.last_sync_at.slice(5, 16)) : ''}</span></span>
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
            tbody.innerHTML = pcSellers.map((s, i) => {
                const kpiSub = s.threshold > 0
                    ? (s.achieved
                        ? `<div class="text-xs font-semibold text-emerald-700">Đạt mốc ${s.progress_pct}% (+${pcMoney(s.over_amount)})</div>`
                        : `<div class="text-xs font-semibold text-amber-700">Thiếu ${pcMoney(s.shortfall)} / ${pcMoney(s.threshold)}</div>`)
                    : '';
                return `
                <tr class="hover:bg-slate-50">
                    <td class="p-2.5 font-bold text-slate-800">${escapeHtml(s.seller_name)}</td>
                    <td class="p-2.5"><select onchange="assignPancakeSeller(${i}, this.value)" class="border ${s.staff_id ? 'border-slate-300' : 'border-amber-400 bg-amber-50'} rounded-lg px-2 py-1 text-xs font-semibold">${opts(s.staff_id)}</select></td>
                    <td class="p-2.5 text-center font-mono">${s.orders}</td>
                    <td class="p-2.5 text-right font-mono"><div class="font-bold">${pcMoney(s.revenue)}</div>${kpiSub}</td>
                    <td class="p-2.5 text-right font-mono text-sky-700">${pcMoney(s.collected)}</td>
                    <td class="p-2.5 text-center font-mono">${s.rate ? s.rate + '%' : '-'}</td>
                    <td class="p-2.5 text-right font-mono font-bold text-emerald-700">${pcMoney(s.commission)}</td>
                    <td class="p-2.5 text-right font-mono text-emerald-700">${pcMoney(s.bonus)}</td>
                    <td class="p-2.5 text-center"><button type="button" onclick="openPancakeRulesModal(${i})" class="px-2 py-1 rounded text-xs font-bold cursor-pointer ${s.custom_rules ? 'bg-sky-600 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}">${s.custom_rules ? 'Riêng ✎' : 'Chung ✎'}</button></td>
                </tr>`;
            }).join('');
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
                        ? `<span class="px-1.5 py-0.5 rounded text-xs bg-emerald-100 text-emerald-800 font-bold" title="${escapeHtml(it.pos_product_name || '')}">✓ ${escapeHtml(it.pos_product_code || '')}</span>`
                        : `<span class="px-1.5 py-0.5 rounded text-xs bg-amber-100 text-amber-800 font-bold" title="Vào tab Ánh Xạ Sản Phẩm để gán">⚠️ Chưa map</span>`;
                    const ret = it.returned_qty ? ` <span class="text-rose-600 font-bold">(hoàn ${it.returned_qty})</span>` : '';
                    return `<div class="py-0.5 flex items-center justify-between gap-2"><span>${escapeHtml(it.platform_product_name)}${it.platform_variation ? ' <span class="text-slate-400">(' + escapeHtml(it.platform_variation) + ')</span>' : ''} <b class="text-amber-700">x${it.quantity}</b>${ret}</span>${badge}</div>`;
                }).join('');
                return `<tr class="hover:bg-slate-50 align-top">
                    <td class="p-3 font-mono font-bold text-slate-900">${escapeHtml(o.order_sn)}${o.tracking_number ? `<div class="text-xs text-slate-400">🚚 ${escapeHtml(o.tracking_number)}</div>` : ''}</td>
                    <td class="p-3 text-slate-500">${formatDateTime(o.order_date)}</td>
                    <td class="p-3"><div class="font-semibold text-slate-700">${escapeHtml(o.shop_name || '')}</div><div class="text-xs text-slate-500">${escapeHtml(o.seller_name || '')}</div></td>
                    <td class="p-3 text-slate-700">${escapeHtml(o.buyer_username || '')}</td>
                    <td class="p-3 min-w-[260px]">${items}</td>
                    <td class="p-3 text-right font-mono font-bold">${pcMoney(o.total_amount)}</td>
                    <td class="p-3 text-center"><span class="px-2 py-0.5 rounded text-xs font-bold bg-slate-100 text-slate-700">${escapeHtml(o.order_status)}</span></td>
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
        box.className = 'p-2 rounded-lg text-xs bg-slate-100 text-slate-700 font-bold';
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
            box.className = `p-2 rounded-lg text-xs font-bold ${ok ? 'bg-emerald-100 text-emerald-800' : 'bg-rose-100 text-rose-800'}`;
            box.textContent = (ok ? '✅ ' : '❌ ') + (data.message || data.detail || '');
        } catch (e) {
            box.className = 'p-2 rounded-lg text-xs font-bold bg-rose-100 text-rose-800';
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
        const adj = Number(r.manual_adjust_videos || 0);
        const grace = r.grace_days_prev_month !== undefined ? Number(r.grace_days_prev_month) : 5;
        const adjTxt = adj !== 0 ? ` · Bù/trừ tổng: ${adj > 0 ? '+' + adj : adj} video` : '';
        const viral = Number(r.viral_bonus || 0) > 0 ? ` · Thưởng viral (≥${r.viral_min_views} view): +${pcMoney(r.viral_bonus)}/video` : '';
        return `Mức view sàn: ≥${r.min_views ?? 200} view · Trừ KPI: ${deduct} video${adjTxt} · Du di tháng trước: ${grace} ngày · Đơn giá: ${pcMoney(r.rate_per_video ?? 10000)}/video đạt${viral}`;
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

    async function safeKocJson(res) {
        const raw = await res.text();
        try {
            return raw ? JSON.parse(raw) : {};
        } catch (_err) {
            const snippet = String(raw || '').replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 90);
            throw new Error(`Máy chủ phản hồi lỗi HTTP ${res.status}${snippet ? ' (' + snippet + ')' : ''}`);
        }
    }

    async function loadKocTab() {
        await ensureKocStaffLoaded();
        if (typeof window.syncPosMonthWidget === 'function') window.syncPosMonthWidget('koc-month-filter');
        const monthEl = document.getElementById('koc-month-filter');
        const month = monthEl ? monthEl.value : '';
        try {
            const url = month ? `/api/marketplace/koc/sources?month=${encodeURIComponent(month)}` : '/api/marketplace/koc/sources';
            const res = await fetch(url);
            const data = await safeKocJson(res);
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

    function formatKocPubDate(raw) {
        const s = String(raw || '').trim();
        if (!s) return '—';
        if (/^\d{4}-\d{2}-\d{2}/.test(s)) {
            const [y, m, d] = s.slice(0, 10).split('-');
            const hm = s.length >= 16 ? s.slice(11, 16) : '';
            return `${d}/${m}/${y}${hm ? ' ' + hm : ''}`;
        }
        return s;
    }

    function updateKocTopKpiCards() {
        const activeList = kocSelectedSourceId
            ? kocSources.filter(s => String(s.id) === String(kocSelectedSourceId))
            : kocSources;

        let totalKoc = 0, totalVids = 0, totalViews = 0, autoQualVids = 0, manualVids = 0, qualVids = 0, payableVids = 0, underVids = 0, errVids = 0, exclVids = 0, pendingVids = 0, totalComm = 0;
        let minViewLabel = kocDefaultRules ? kocDefaultRules.min_views : 200;

        activeList.forEach(s => {
            const st = s.stats || {};
            totalKoc += Number(s.koc_count || st.unique_kocs || 0);
            totalVids += Number(st.total_videos || 0);
            totalViews += Number(st.total_views || 0);
            autoQualVids += Number(st.auto_qualified_videos ?? st.qualified_videos ?? 0);
            manualVids += Number(st.manual_approved_videos || 0);
            qualVids += Number(st.qualified_videos || 0);
            payableVids += Number(st.payable_videos || 0);
            underVids += Number(st.under_kpi_videos || 0);
            errVids += Number(st.error_videos || 0);
            exclVids += Number(st.excluded_videos || 0);
            pendingVids += Number(st.pending_videos !== undefined ? st.pending_videos : Math.max(0, Number(st.total_videos || 0) - Number(st.qualified_videos || 0)));
            totalComm += Number(st.commission || 0);
            if (activeList.length === 1 && s.rules) minViewLabel = s.rules.min_views;
        });

        document.getElementById('kpi-koc-count').textContent = totalKoc.toLocaleString('vi-VN');
        document.getElementById('kpi-koc-total-videos').textContent = totalVids.toLocaleString('vi-VN');
        document.getElementById('kpi-koc-total-views').textContent = `${totalViews.toLocaleString('vi-VN')} lượt xem`;
        document.getElementById('kpi-koc-min-view-label').textContent = `≥${minViewLabel}`;
        document.getElementById('kpi-koc-qualified-videos').textContent = qualVids.toLocaleString('vi-VN');
        document.getElementById('kpi-koc-payable-videos').textContent = manualVids > 0
            ? `Tính thưởng: ${payableVids.toLocaleString('vi-VN')} (${autoQualVids} view + ${manualVids} duyệt tay)`
            : `Tính thưởng: ${payableVids.toLocaleString('vi-VN')} video`;
        document.getElementById('kpi-koc-under-videos').textContent = underVids.toLocaleString('vi-VN');
        const errEl = document.getElementById('kpi-koc-error-videos');
        if (errEl) {
            errEl.textContent = exclVids > 0
                ? `Lỗi: ${errVids} · Loại trùng/cũ: ${exclVids}`
                : `Lỗi/riêng tư: ${errVids}`;
            errEl.className = exclVids > 0 ? 'text-xs text-rose-600 font-semibold mt-0.5' : 'text-xs text-slate-400 mt-0.5';
        }
        document.getElementById('kpi-koc-commission').textContent = pcMoney(totalComm);

        const scanLbl = document.getElementById('lbl-koc-scan-pending');
        if (scanLbl && !kocScanRunning) {
            scanLbl.textContent = pendingVids > 0 ? `Quét View Chưa Có (${pendingVids})` : 'Quét View Chưa Có (0)';
        }
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
            const manualApproved = Number(st.manual_approved_videos || 0);
            const autoQual = Number(st.auto_qualified_videos ?? st.qualified_videos ?? 0);
            const excludedCnt = Number(st.excluded_videos || 0);
            const manualAdj = Number(r.manual_adjust_videos || 0);
            const staffOpts = '<option value="">-- Chưa gán NV --</option>' +
                pcStaff.map(u => `<option value="${u.id}" ${u.id === s.staff_id ? 'selected' : ''}>${escapeHtml(u.employee_code ? '[' + u.employee_code + '] ' : '')}${escapeHtml(u.name)}</option>`).join('');
            const tabsInfo = [
                s.koc_tab_name ? `KOC: ${s.koc_tab_name}` : '',
                s.video_tab_name ? `View: ${s.video_tab_name}` : ''
            ].filter(Boolean).join(' · ') || 'Chưa chọn tab';

            const qualSub = manualApproved > 0
                ? `<div class="text-[11px] text-sky-700 font-semibold">${autoQual} view + ${manualApproved} tay</div>`
                : `<span class="text-xs text-slate-400 font-normal">(≥${r.min_views ?? 200})</span>`;
            const underSub = excludedCnt > 0
                ? `<div class="text-[11px] text-rose-600 font-semibold" title="Đã tự động loại video trùng kỳ trước / quá hạn tháng cũ">Loại: ${excludedCnt}</div>`
                : '';
            const deductSub = manualAdj !== 0
                ? `<div class="text-[11px] font-bold ${manualAdj > 0 ? 'text-sky-700' : 'text-rose-600'}">${manualAdj > 0 ? '+' + manualAdj : manualAdj} tay</div>`
                : '';

            return `<tr class="hover:bg-slate-50 ${String(s.id) === String(kocSelectedSourceId) ? 'bg-sky-50/40' : ''}">
                <td class="p-2.5">
                    <div class="font-bold text-slate-800 flex items-center gap-1.5">
                        <a href="${escapeHtml(s.sheet_url)}" target="_blank" class="text-sky-700 hover:underline" title="Mở Google Sheet gốc">🔗 ${escapeHtml(s.name)}</a>
                    </div>
                    <div class="text-xs text-slate-500">${escapeHtml(tabsInfo)}${s.last_sync_at ? ' · Sync: ' + escapeHtml(s.last_sync_at.slice(5, 16)) : ''}</div>
                </td>
                <td class="p-2.5 font-mono font-bold text-slate-700">${escapeHtml(s.month)}</td>
                <td class="p-2.5">
                    <select onchange="quickAssignKocStaff(${idx}, this.value)" class="border border-slate-300 rounded px-2 py-1 text-xs font-semibold text-slate-800 bg-white">
                        ${staffOpts}
                    </select>
                </td>
                <td class="p-2.5 text-center font-bold">${s.koc_count || 0}</td>
                <td class="p-2.5 text-center font-mono font-bold">${st.total_videos || 0}</td>
                <td class="p-2.5 text-center font-mono font-bold text-emerald-700">${st.qualified_videos || 0} ${qualSub}</td>
                <td class="p-2.5 text-center font-mono text-amber-700">${st.under_kpi_videos || 0}${underSub}</td>
                <td class="p-2.5 text-center font-mono text-slate-600">${r.kpi_deduct_videos || 0}${deductSub}</td>
                <td class="p-2.5 text-center font-mono font-bold text-sky-700">${st.payable_videos || 0}</td>
                <td class="p-2.5 text-right font-mono">${pcMoney(r.rate_per_video)}</td>
                <td class="p-2.5 text-right font-mono font-bold text-sky-600">${pcMoney(st.commission)}</td>
                <td class="p-2.5 text-center whitespace-nowrap">
                    <button type="button" onclick="syncSingleKocSource(${s.id})" class="px-2 py-1 rounded text-xs font-bold bg-emerald-50 text-emerald-700 border border-emerald-200 hover:bg-emerald-100 cursor-pointer" title="Đồng bộ lại từ Google Sheet">🔄 Sync</button>
                    <button type="button" onclick="openKocRulesModal(${idx})" class="px-2 py-1 rounded text-xs font-bold ${s.custom_rules ? 'bg-sky-100 text-sky-800' : 'bg-slate-100 text-slate-600'} hover:bg-sky-200 cursor-pointer" title="Chỉnh công thức tính">${s.custom_rules ? '⚙️ Riêng' : '⚙️ Chung'}</button>
                    <button type="button" onclick="openKocSourceModal(${s.id})" class="px-2 py-1 rounded text-xs font-bold bg-slate-100 text-slate-700 hover:bg-slate-200 cursor-pointer" title="Đổi link / đổi tab">✏️ Sửa</button>
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

    let kocCurrentVideos = [];
    let kocCurrentProfiles = [];
    let kocCurrentMinV = 200;
    let kocVideoSort = 'views_desc';
    let kocProfileSort = 'views_desc';
    let kocSelectedVideoIds = new Set();
    let kocLastClickedIdx = -1;
    const kocCollator = new Intl.Collator('vi', { numeric: true, sensitivity: 'base' });

    function switchKocInnerView(view) {
        kocInnerView = view;
        const btnV = document.getElementById('btn-koc-view-videos');
        const btnP = document.getElementById('btn-koc-view-profiles');
        const paneV = document.getElementById('koc-pane-videos');
        const paneP = document.getElementById('koc-pane-profiles');
        const filterKpi = document.getElementById('koc-video-kpi-filter');
        const sortSel = document.getElementById('koc-video-sort');
        const toolsBar = document.getElementById('koc-manual-tools-bar');

        if (view === 'videos') {
            btnV.className = 'px-3 py-1.5 rounded-md text-xs font-bold bg-white text-slate-900 shadow-2xs cursor-pointer transition';
            btnP.className = 'px-3 py-1.5 rounded-md text-xs font-semibold text-slate-600 hover:text-slate-900 cursor-pointer transition';
            paneV.classList.remove('hidden');
            paneP.classList.add('hidden');
            if (filterKpi) filterKpi.classList.remove('hidden');
            if (sortSel) sortSel.classList.remove('hidden');
            if (toolsBar) toolsBar.classList.remove('hidden');
        } else {
            btnP.className = 'px-3 py-1.5 rounded-md text-xs font-bold bg-white text-slate-900 shadow-2xs cursor-pointer transition';
            btnV.className = 'px-3 py-1.5 rounded-md text-xs font-semibold text-slate-600 hover:text-slate-900 cursor-pointer transition';
            paneP.classList.remove('hidden');
            paneV.classList.add('hidden');
            if (filterKpi) filterKpi.classList.add('hidden');
            if (sortSel) sortSel.classList.add('hidden');
            if (toolsBar) toolsBar.classList.add('hidden');
        }
    }
    window.switchKocInnerView = switchKocInnerView;

    function debounceKocSearch() {
        clearTimeout(kocSearchTimer);
        kocSearchTimer = setTimeout(() => loadKocDetails(), 350);
    }
    window.debounceKocSearch = debounceKocSearch;

    function getSortedKocVideos() {
        const arr = [...kocCurrentVideos];
        const stateRank = { manual_approved: 1, auto_qualified: 2, under_kpi: 3, error: 4, excluded_dup: 5, excluded_old: 6, manual_excluded: 7 };
        arr.sort((a, b) => {
            const va = Number(a.views || 0), vb = Number(b.views || 0);
            const ua = String(a.koc_username || '').toLowerCase(), ub = String(b.koc_username || '').toLowerCase();
            const pa = String(a.published_at || ''), pb = String(b.published_at || '');
            if (kocVideoSort === 'views_asc') return va - vb || (a.id - b.id);
            if (kocVideoSort === 'koc_zero_first') {
                const za = ((a.koc_auto_qual || 0) + (a.koc_manual_qual || 0)) === 0 ? 0 : 1;
                const zb = ((b.koc_auto_qual || 0) + (b.koc_manual_qual || 0)) === 0 ? 0 : 1;
                if (za !== zb) return za - zb;
                const c = kocCollator.compare(ua, ub);
                if (c !== 0) return c;
                return vb - va;
            }
            if (kocVideoSort === 'koc_az') {
                const c = kocCollator.compare(ua, ub);
                return c !== 0 ? c : (vb - va);
            }
            if (kocVideoSort === 'koc_za') {
                const c = kocCollator.compare(ub, ua);
                return c !== 0 ? c : (vb - va);
            }
            if (kocVideoSort === 'pub_desc') return pb.localeCompare(pa) || (vb - va);
            if (kocVideoSort === 'pub_asc') {
                if (!pa && pb) return 1;
                if (pa && !pb) return -1;
                return pa.localeCompare(pb) || (vb - va);
            }
            if (kocVideoSort === 'product_az') return kocCollator.compare(a.product_note || a.title || '', b.product_note || b.title || '') || (vb - va);
            if (kocVideoSort === 'product_za') return kocCollator.compare(b.product_note || b.title || '', a.product_note || a.title || '') || (vb - va);
            if (kocVideoSort === 'kpi_state') return (stateRank[a.kpi_state] || 9) - (stateRank[b.kpi_state] || 9) || (vb - va);
            if (kocVideoSort === 'kpi_state_rev') return (stateRank[b.kpi_state] || 9) - (stateRank[a.kpi_state] || 9) || (va - vb);
            return vb - va || (a.id - b.id);
        });
        return arr;
    }

    function syncKocSortIndicators() {
        const sel = document.getElementById('koc-video-sort');
        if (sel && Array.from(sel.options).some(o => o.value === kocVideoSort)) {
            sel.value = kocVideoSort;
        }
        const map = {
            koc: kocVideoSort === 'koc_zero_first' || kocVideoSort === 'koc_az' ? '↑' : (kocVideoSort === 'koc_za' ? '↓' : '↕'),
            product: kocVideoSort === 'product_az' ? '↑' : (kocVideoSort === 'product_za' ? '↓' : '↕'),
            pub: kocVideoSort === 'pub_desc' ? '↓' : (kocVideoSort === 'pub_asc' ? '↑' : '↕'),
            views: kocVideoSort === 'views_desc' ? '↓' : (kocVideoSort === 'views_asc' ? '↑' : '↕'),
            kpi: kocVideoSort === 'kpi_state' ? '↑' : (kocVideoSort === 'kpi_state_rev' ? '↓' : '↕'),
        };
        Object.entries(map).forEach(([k, sym]) => {
            const el = document.getElementById(`koc-sort-ind-${k}`);
            if (el) {
                el.textContent = sym;
                el.className = sym === '↕' ? 'text-slate-400' : 'text-sky-600 font-extrabold';
            }
        });
    }

    function onChangeKocSort(val) {
        kocVideoSort = val || 'views_desc';
        kocLastClickedIdx = -1;
        syncKocSortIndicators();
        renderKocVideosRows();
    }
    window.onChangeKocSort = onChangeKocSort;

    function toggleKocHeaderSort(col) {
        if (col === 'views') kocVideoSort = kocVideoSort === 'views_desc' ? 'views_asc' : 'views_desc';
        else if (col === 'pub') kocVideoSort = kocVideoSort === 'pub_desc' ? 'pub_asc' : 'pub_desc';
        else if (col === 'koc') kocVideoSort = kocVideoSort === 'koc_zero_first' ? 'koc_az' : (kocVideoSort === 'koc_az' ? 'koc_za' : 'koc_zero_first');
        else if (col === 'product') kocVideoSort = kocVideoSort === 'product_az' ? 'product_za' : 'product_az';
        else if (col === 'kpi') kocVideoSort = kocVideoSort === 'kpi_state' ? 'kpi_state_rev' : 'kpi_state';
        kocLastClickedIdx = -1;
        syncKocSortIndicators();
        renderKocVideosRows();
    }
    window.toggleKocHeaderSort = toggleKocHeaderSort;

    function toggleKocProfileSort(col) {
        if (col === 'views') kocProfileSort = kocProfileSort === 'views_desc' ? 'views_asc' : 'views_desc';
        else if (col === 'videos') kocProfileSort = kocProfileSort === 'videos_desc' ? 'videos_asc' : 'videos_desc';
        else if (col === 'cast') kocProfileSort = kocProfileSort === 'cast_desc' ? 'cast_asc' : 'cast_desc';
        else if (col === 'koc') kocProfileSort = kocProfileSort === 'koc_az' ? 'koc_za' : 'koc_az';
        ['koc', 'cast', 'videos', 'views'].forEach(k => {
            const el = document.getElementById(`koc-psort-${k}`);
            if (!el) return;
            const sym = kocProfileSort === `${k}_desc` || kocProfileSort === `${k}_za` ? '↓'
                : (kocProfileSort === `${k}_asc` || kocProfileSort === `${k}_az` ? '↑' : '↕');
            el.textContent = sym;
            el.className = sym === '↕' ? 'text-slate-400' : 'text-sky-600 font-extrabold';
        });
        renderKocProfilesRows();
    }
    window.toggleKocProfileSort = toggleKocProfileSort;

    function updateKocBulkSelectionUI() {
        const grp = document.getElementById('koc-bulk-actions-group');
        const cntEl = document.getElementById('koc-selected-count');
        const chkAll = document.getElementById('koc-select-all-videos');
        const n = kocSelectedVideoIds.size;
        if (cntEl) cntEl.textContent = n;
        if (grp) grp.classList.toggle('hidden', n === 0);
        if (chkAll) {
            const allChecked = kocCurrentVideos.length > 0 && kocCurrentVideos.every(v => kocSelectedVideoIds.has(v.id));
            chkAll.checked = allChecked;
            chkAll.indeterminate = n > 0 && !allChecked;
        }
    }

    function onClickKocRowCheckbox(videoId, rowIdx, ev) {
        const sorted = getSortedKocVideos();
        const shouldSelect = ev.target.checked;
        if (ev.shiftKey && kocLastClickedIdx >= 0 && kocLastClickedIdx < sorted.length) {
            const from = Math.min(kocLastClickedIdx, rowIdx);
            const to = Math.max(kocLastClickedIdx, rowIdx);
            for (let i = from; i <= to; i++) {
                if (shouldSelect) kocSelectedVideoIds.add(sorted[i].id);
                else kocSelectedVideoIds.delete(sorted[i].id);
            }
            kocLastClickedIdx = rowIdx;
            renderKocVideosRows();
            return;
        }
        kocLastClickedIdx = rowIdx;
        if (shouldSelect) kocSelectedVideoIds.add(videoId);
        else kocSelectedVideoIds.delete(videoId);
        updateKocBulkSelectionUI();
    }
    window.onClickKocRowCheckbox = onClickKocRowCheckbox;

    function toggleSelectAllKocVideos(checked) {
        if (checked) kocCurrentVideos.forEach(v => kocSelectedVideoIds.add(v.id));
        else kocCurrentVideos.forEach(v => kocSelectedVideoIds.delete(v.id));
        renderKocVideosRows();
    }
    window.toggleSelectAllKocVideos = toggleSelectAllKocVideos;

    function clearKocSelectedVideos() {
        kocSelectedVideoIds.clear();
        kocLastClickedIdx = -1;
        renderKocVideosRows();
    }
    window.clearKocSelectedVideos = clearKocSelectedVideos;

    function computeLocalKpiState(v, nextManualKpi) {
        const mk = Number(nextManualKpi || 0);
        const minV = Number(v.min_views ?? kocCurrentMinV ?? 200);
        const views = Number(v.views || 0);
        if (mk === 1) return 'manual_approved';
        if (mk === -1) return 'manual_excluded';
        if (v.is_dup_prev) return 'excluded_dup';
        if (v.is_old_month) return 'excluded_old';
        if (views >= minV) return 'auto_qualified';
        if (v.is_err) return 'error';
        return 'under_kpi';
    }

    function applyOptimisticManualKpi(videoIds, nextManualKpi) {
        const idSet = new Set(videoIds.map(Number));
        const touchedKeys = new Set();
        kocCurrentVideos.forEach(v => {
            if (!idSet.has(Number(v.id))) return;
            const prevState = v.kpi_state;
            const nextState = computeLocalKpiState(v, nextManualKpi);
            v.manual_kpi = Number(nextManualKpi);
            v.kpi_state = nextState;
            v.is_kpi_counted = (nextState === 'auto_qualified' || nextState === 'manual_approved');
            const key = `${v.source_id}|${String(v.koc_username || '').toLowerCase()}`;
            touchedKeys.add(JSON.stringify({ key, prevState, nextState }));
        });
        // Đồng bộ lại bộ đếm tiến độ kênh cho các KOC vừa đổi trạng thái
        touchedKeys.forEach(raw => {
            const { key, prevState, nextState } = JSON.parse(raw);
            if (prevState === nextState) return;
            const dAuto = (nextState === 'auto_qualified' ? 1 : 0) - (prevState === 'auto_qualified' ? 1 : 0);
            const dMan = (nextState === 'manual_approved' ? 1 : 0) - (prevState === 'manual_approved' ? 1 : 0);
            kocCurrentVideos.forEach(row => {
                if (`${row.source_id}|${String(row.koc_username || '').toLowerCase()}` === key) {
                    row.koc_auto_qual = Math.max(0, Number(row.koc_auto_qual || 0) + dAuto);
                    row.koc_manual_qual = Math.max(0, Number(row.koc_manual_qual || 0) + dMan);
                }
            });
        });
    }

    async function refreshKocSourcesSummaryQuiet() {
        const month = document.getElementById('koc-month-filter')?.value || '';
        try {
            const url = month ? `/api/marketplace/koc/sources?month=${encodeURIComponent(month)}` : '/api/marketplace/koc/sources';
            const res = await fetch(url);
            if (!res.ok) return;
            const data = await safeKocJson(res);
            kocSources = data.sources || kocSources;
            renderKocSourcesTable();
            updateKocTopKpiCards();
        } catch (_e) { }
    }

    function renderKocVideosRows() {
        const paneVideos = document.getElementById('koc-pane-videos');
        const prevScroll = paneVideos ? paneVideos.scrollTop : 0;
        const vTbody = document.getElementById('koc-videos-tbody');
        if (!vTbody) return;

        const videos = getSortedKocVideos();
        document.getElementById('badge-koc-video-count').textContent = videos.length;

        if (!videos.length) {
            vTbody.innerHTML = '<tr><td colspan="11" class="p-6 text-center text-slate-400">Không có link video nào khớp bộ lọc.</td></tr>';
            updateKocBulkSelectionUI();
            return;
        }

        vTbody.innerHTML = videos.map((v, i) => {
            const views = Number(v.views || 0);
            const rowMinV = Number(v.min_views ?? kocCurrentMinV);
            const st = v.kpi_state || (views >= rowMinV ? 'auto_qualified' : 'under_kpi');
            const manualKpi = Number(v.manual_kpi || 0);
            const isCounted = Boolean(v.is_kpi_counted ?? (views >= rowMinV));
            const isExcluded = st === 'excluded_dup' || st === 'excluded_old' || st === 'manual_excluded';
            const isChecked = kocSelectedVideoIds.has(v.id);

            let rowBg = '';
            if (isChecked) rowBg = 'bg-sky-100/50';
            else if (st === 'manual_approved') rowBg = 'bg-sky-50/50';
            else if (st === 'auto_qualified') rowBg = 'bg-emerald-50/20';
            else if (isExcluded) rowBg = 'bg-rose-50/40';

            let kpiBadge = '';
            if (st === 'auto_qualified') {
                kpiBadge = `<span class="px-2 py-0.5 rounded text-xs font-bold bg-emerald-100 text-emerald-800 whitespace-nowrap">Đạt (≥${rowMinV})</span>`;
            } else if (st === 'manual_approved') {
                kpiBadge = `<span class="px-2 py-0.5 rounded text-xs font-bold bg-sky-100 text-sky-800 border border-sky-300 whitespace-nowrap">Duyệt tay (+KPI)</span>`;
            } else if (st === 'excluded_dup') {
                kpiBadge = `<span class="px-2 py-0.5 rounded text-xs font-bold bg-rose-100 text-rose-800 border border-rose-200 whitespace-nowrap" title="Trùng chiến dịch ${escapeHtml(v.dup_source_name || '')}">Loại (Trùng cũ)</span>`;
            } else if (st === 'excluded_old') {
                kpiBadge = `<span class="px-2 py-0.5 rounded text-xs font-bold bg-rose-100 text-rose-800 border border-rose-200 whitespace-nowrap">Loại (Tháng cũ)</span>`;
            } else if (st === 'manual_excluded') {
                kpiBadge = `<span class="px-2 py-0.5 rounded text-xs font-bold bg-slate-200 text-slate-700 whitespace-nowrap">Đã loại tay</span>`;
            } else if (st === 'error') {
                kpiBadge = `<span class="px-2 py-0.5 rounded text-xs font-bold bg-rose-50 text-rose-700 whitespace-nowrap">Lỗi / Riêng tư</span>`;
            } else {
                kpiBadge = `<span class="px-2 py-0.5 rounded text-xs font-bold bg-amber-100 text-amber-800 whitespace-nowrap">Chưa đạt</span>`;
            }

            let pubSub = '';
            if (v.is_dup_prev) {
                pubSub = `<div><span class="px-1.5 py-0.5 rounded text-[10px] font-bold bg-rose-100 text-rose-800">Trùng ${escapeHtml(v.dup_month || 'kỳ trước')}</span></div>`;
            } else if (v.is_old_month) {
                pubSub = `<div><span class="px-1.5 py-0.5 rounded text-[10px] font-bold bg-rose-100 text-rose-800">Cũ ${escapeHtml(v.pub_month || '')}</span></div>`;
            } else if (v.is_grace_prev) {
                pubSub = `<div><span class="px-1.5 py-0.5 rounded text-[10px] font-bold bg-amber-100 text-amber-800">Du di ${escapeHtml(v.pub_month || '')}</span></div>`;
            } else if (v.pub_month) {
                pubSub = `<div class="text-[10px] font-semibold text-emerald-700">Đúng kỳ ${escapeHtml(v.pub_month)}</div>`;
            }

            let actionBtn = '';
            if (manualKpi === 1) {
                actionBtn = `<button type="button" onclick="toggleKocVideoManualKpi(${v.id}, 0)" class="px-2.5 py-1 rounded-md text-xs font-bold bg-sky-600 hover:bg-sky-700 text-white shadow-2xs cursor-pointer transition whitespace-nowrap" title="Bấm để bỏ duyệt tay">[x] Tính KPI</button>`;
            } else if (manualKpi === -1) {
                actionBtn = `<button type="button" onclick="toggleKocVideoManualKpi(${v.id}, 0)" class="px-2 py-1 rounded-md text-xs font-bold bg-white hover:bg-slate-100 text-slate-700 border border-slate-300 cursor-pointer transition whitespace-nowrap" title="Khôi phục xét KPI tự động">Khôi phục</button>`;
            } else if (st === 'excluded_dup' || st === 'excluded_old') {
                actionBtn = `<button type="button" onclick="toggleKocVideoManualKpi(${v.id}, 1)" class="px-2 py-1 rounded-md text-xs font-bold bg-white hover:bg-sky-50 text-slate-700 hover:text-sky-700 border border-slate-300 cursor-pointer transition whitespace-nowrap" title="Duyệt ngoại lệ tính KPI cho video này">Ngoại lệ</button>`;
            } else if (st === 'auto_qualified') {
                actionBtn = `<button type="button" onclick="toggleKocVideoManualKpi(${v.id}, -1)" class="px-2 py-1 rounded-md text-xs font-semibold bg-white hover:bg-rose-50 text-slate-500 hover:text-rose-700 border border-slate-200 cursor-pointer transition whitespace-nowrap" title="Loại trừ thủ công video này khỏi KPI">Loại trừ</button>`;
            } else {
                actionBtn = `<button type="button" onclick="toggleKocVideoManualKpi(${v.id}, 1)" class="px-2.5 py-1 rounded-md text-xs font-bold bg-white hover:bg-sky-600 text-sky-700 hover:text-white border border-sky-300 cursor-pointer transition whitespace-nowrap" title="Duyệt thủ công tính KPI (+1 video)">[ ] Tính KPI</button>`;
            }

            const uname = v.koc_username ? '@' + v.koc_username.replace(/^\/?@/, '') : '—';
            const kAuto = Number(v.koc_auto_qual || 0);
            const kMan = Number(v.koc_manual_qual || 0);
            const kTot = Number(v.koc_total_videos || 1);
            const kZero = (kAuto + kMan) === 0;
            const chanProg = `<div class="text-[11px] mt-0.5 ${kZero ? 'text-amber-700 font-bold' : (kMan > 0 ? 'text-sky-700 font-semibold' : 'text-slate-500')}">Kênh: ${kAuto} đạt + ${kMan} duyệt / ${kTot} video</div>`;
            const dupNote = v.is_dup_prev && v.dup_source_name
                ? `<div class="text-[11px] text-rose-600 font-bold mt-0.5">Đã tính ở: ${escapeHtml(v.dup_source_name)}</div>`
                : '';

            return `<tr class="hover:bg-slate-50 ${rowBg}">
                <td class="p-2.5 text-center">
                    <input type="checkbox" ${isChecked ? 'checked' : ''} onclick="onClickKocRowCheckbox(${v.id}, ${i}, event)" class="w-3.5 h-3.5 rounded cursor-pointer">
                </td>
                <td class="p-2.5 text-center text-slate-400 font-mono">${i + 1}</td>
                <td class="p-2.5">
                    <a href="https://www.tiktok.com/${escapeHtml(uname)}" target="_blank" class="font-bold text-slate-800 hover:text-sky-600 hover:underline">${escapeHtml(uname)}</a>
                    <div class="text-xs text-slate-400 font-normal">${escapeHtml(v.source_name || '')}</div>
                    ${chanProg}
                </td>
                <td class="p-2.5 max-w-[230px] truncate font-mono">
                    <a href="${escapeHtml(v.video_url)}" target="_blank" class="text-sky-700 hover:underline" title="${escapeHtml(v.video_url)}">${escapeHtml(v.video_url)}</a>
                </td>
                <td class="p-2.5 max-w-[200px]">
                    <div class="font-semibold text-slate-700">${escapeHtml(v.product_note || '')}</div>
                    <div class="text-xs text-slate-400 truncate" title="${escapeHtml(v.title || '')}">${escapeHtml(v.title || '')}</div>
                    ${dupNote}
                </td>
                <td class="p-2.5 font-mono text-xs whitespace-nowrap">
                    <div class="font-semibold text-slate-800">${escapeHtml(formatKocPubDate(v.published_at))}</div>
                    ${pubSub}
                </td>
                <td class="p-2.5 text-right">
                    <input type="number" min="0" value="${views}" onchange="updateSingleKocVideoViews(${v.id}, this.value)" class="w-20 border border-slate-200 focus:border-sky-500 rounded px-2 py-1 text-right font-mono font-bold ${isExcluded ? 'line-through text-slate-400 bg-slate-100' : (isCounted ? 'text-emerald-700 bg-white' : 'text-slate-700 bg-slate-50')}" title="Sửa nhanh số view">
                </td>
                <td class="p-2.5 text-center">${kpiBadge}</td>
                <td class="p-2.5 text-center">${actionBtn}</td>
                <td class="p-2.5 text-center whitespace-nowrap">
                    <div class="text-xs font-semibold text-slate-600">${escapeHtml(v.status || 'OK')}</div>
                    <div class="text-[11px] text-slate-400 font-mono">${escapeHtml((v.updated_at || '').slice(5, 16))}</div>
                </td>
                <td class="p-2.5 text-center">
                    <button type="button" onclick="deleteSingleKocVideo(${v.id})" class="text-rose-500 hover:text-rose-700 font-bold px-1.5 py-0.5 cursor-pointer" title="Xóa link này">🗑️</button>
                </td>
            </tr>`;
        }).join('');

        if (paneVideos && prevScroll > 0) paneVideos.scrollTop = prevScroll;
        updateKocBulkSelectionUI();
    }

    function renderKocProfilesRows() {
        const pTbody = document.getElementById('koc-profiles-tbody');
        if (!pTbody) return;
        const profiles = [...kocCurrentProfiles];
        profiles.sort((a, b) => {
            const va = Number(a.total_views || 0), vb = Number(b.total_views || 0);
            const na = Number(a.actual_videos || a.videos_returned || 0), nb = Number(b.actual_videos || b.videos_returned || 0);
            const ca = Number(a.cast_fee || 0), cb = Number(b.cast_fee || 0);
            if (kocProfileSort === 'views_asc') return va - vb;
            if (kocProfileSort === 'videos_desc') return nb - na || (vb - va);
            if (kocProfileSort === 'videos_asc') return na - nb || (va - vb);
            if (kocProfileSort === 'cast_desc') return cb - ca || (vb - va);
            if (kocProfileSort === 'cast_asc') return ca - cb || (vb - va);
            if (kocProfileSort === 'koc_az') return kocCollator.compare(a.koc_username || '', b.koc_username || '');
            if (kocProfileSort === 'koc_za') return kocCollator.compare(b.koc_username || '', a.koc_username || '');
            return vb - va;
        });
        document.getElementById('badge-koc-profile-count').textContent = profiles.length;
        if (!profiles.length) {
            pTbody.innerHTML = '<tr><td colspan="9" class="p-6 text-center text-slate-400">Không có KOC/KOL nào.</td></tr>';
            return;
        }
        pTbody.innerHTML = profiles.map((p, i) => {
            const uname = p.koc_username ? '@' + p.koc_username.replace(/^\/?@/, '') : '—';
            return `<tr class="hover:bg-slate-50">
                <td class="p-2.5 text-center text-slate-400 font-mono">${i + 1}</td>
                <td class="p-2.5">
                    <a href="${escapeHtml(p.channel_url || 'https://www.tiktok.com/' + uname)}" target="_blank" class="font-bold text-sky-700 hover:underline">${escapeHtml(uname)}</a>
                    <div class="text-xs text-slate-400">${escapeHtml(p.source_name || '')}</div>
                </td>
                <td class="p-2.5 text-slate-700">
                    <div>FL: <b>${escapeHtml(p.followers || '—')}</b></div>
                    ${p.gmv_text ? `<div class="text-xs text-emerald-700">GMV: ${escapeHtml(p.gmv_text)}</div>` : ''}
                </td>
                <td class="p-2.5 font-semibold text-slate-700">${escapeHtml(p.product_sample || '—')}</td>
                <td class="p-2.5 text-center"><span class="px-2 py-0.5 rounded text-xs font-bold bg-emerald-100 text-emerald-800">${escapeHtml(p.approval_status || 'DUYỆT')}</span></td>
                <td class="p-2.5 text-right font-mono">${p.cast_fee > 0 ? pcMoney(p.cast_fee) : '<span class="text-slate-400">Freecast</span>'}</td>
                <td class="p-2.5 text-center font-mono font-bold text-sky-700">${p.actual_videos || p.videos_returned || 0}</td>
                <td class="p-2.5 text-right font-mono font-bold text-emerald-700">${Number(p.total_views || 0).toLocaleString('vi-VN')}</td>
                <td class="p-2.5 text-slate-600 max-w-[220px] truncate" title="${escapeHtml((p.contact_info || '') + ' ' + (p.note || ''))}">${escapeHtml(p.contact_info || p.note || '—')}</td>
            </tr>`;
        }).join('');
    }

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

            kocCurrentVideos = dataV.videos || [];
            kocCurrentMinV = dataV.min_views || 200;
            kocCurrentProfiles = dataP.profiles || [];
            const fc = dataV.filter_counts || null;

            const validIds = new Set(kocCurrentVideos.map(v => v.id));
            Array.from(kocSelectedVideoIds).forEach(id => {
                if (!validIds.has(id)) kocSelectedVideoIds.delete(id);
            });

            const filterSel = document.getElementById('koc-video-kpi-filter');
            if (filterSel && fc) {
                const curVal = filterSel.value;
                const labels = {
                    all: `Tất cả video (${fc.all ?? 0})`,
                    qualified: `Đạt & Duyệt tính KPI (${fc.qualified ?? 0})`,
                    under: `Chưa đạt (< view sàn) (${fc.under ?? 0})`,
                    under_zero_koc: `Chưa đạt — Kênh đang 0 bài KPI (${fc.under_zero_koc ?? 0})`,
                    manual: `Đã duyệt tay (+KPI) (${fc.manual ?? 0})`,
                    excluded: `Bị loại: Trùng / Tháng cũ (${fc.excluded ?? 0})`,
                };
                Array.from(filterSel.options).forEach(opt => {
                    if (labels[opt.value]) opt.textContent = labels[opt.value];
                });
                filterSel.value = curVal;
            }

            syncKocSortIndicators();
            renderKocVideosRows();
            renderKocProfilesRows();
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

    async function toggleKocVideoManualKpi(videoId, nextManualKpi) {
        applyOptimisticManualKpi([videoId], nextManualKpi);
        renderKocVideosRows();
        try {
            const res = await fetch(`/api/marketplace/koc/videos/${videoId}`, {
                method: 'PUT', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ manual_kpi: Number(nextManualKpi) })
            });
            if (!res.ok) throw new Error('Lỗi cập nhật duyệt KPI video');
            refreshKocSourcesSummaryQuiet();
        } catch (e) {
            pcToast(e.message, 'error');
            await loadKocTab();
        }
    }
    window.toggleKocVideoManualKpi = toggleKocVideoManualKpi;

    async function bulkUpdateSelectedKocKpi(nextManualKpi) {
        const ids = Array.from(kocSelectedVideoIds);
        if (!ids.length) return pcToast('Hãy tích chọn ít nhất 1 video trước', 'warning');
        applyOptimisticManualKpi(ids, nextManualKpi);
        kocSelectedVideoIds.clear();
        renderKocVideosRows();
        try {
            const res = await fetch('/api/marketplace/koc/videos/bulk-kpi', {
                method: 'POST', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ video_ids: ids, manual_kpi: Number(nextManualKpi) })
            });
            const data = await safeKocJson(res);
            if (!res.ok) throw new Error(data.detail || 'Lỗi duyệt hàng loạt');
            pcToast(`Đã cập nhật KPI cho ${data.updated || ids.length} video`, 'success');
            await loadKocTab();
        } catch (e) {
            pcToast(e.message, 'error');
            await loadKocTab();
        }
    }
    window.bulkUpdateSelectedKocKpi = bulkUpdateSelectedKocKpi;

    async function autoApproveTop1ZeroKoc() {
        const month = document.getElementById('koc-month-filter')?.value || '';
        const payload = { mode: 'top1_zero_koc' };
        if (kocSelectedSourceId) payload.source_id = Number(kocSelectedSourceId);
        if (month) payload.month = month;
        try {
            const res = await fetch('/api/marketplace/koc/videos/bulk-kpi', {
                method: 'POST', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });
            const data = await safeKocJson(res);
            if (!res.ok) throw new Error(data.detail || 'Lỗi gợi ý duyệt tự động');
            pcToast(data.message || 'Đã tự chọn duyệt thành công!', data.updated > 0 ? 'success' : 'info');
            await loadKocTab();
        } catch (e) {
            pcToast(e.message, 'error');
        }
    }
    window.autoApproveTop1ZeroKoc = autoApproveTop1ZeroKoc;

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
        const nowD = new Date();
        const nowMonth = `${nowD.getFullYear()}-${String(nowD.getMonth() + 1).padStart(2, '0')}`;
        document.getElementById('koc-src-month').value = src ? src.month : (document.getElementById('koc-month-filter')?.value || nowMonth);
        if (typeof window.syncPosMonthWidget === 'function') window.syncPosMonthWidget('koc-src-month');
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

        msgBox.className = 'p-2 rounded-lg text-xs bg-slate-100 text-slate-700 font-bold';
        msgBox.textContent = '⏳ Đang kết nối và đọc danh sách các Tab trong Google Sheet...';
        msgBox.classList.remove('hidden');
        if (btn) btn.disabled = true;

        try {
            const res = await fetch('/api/marketplace/koc/inspect-sheet', {
                method: 'POST', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ sheet_url: url })
            });
            const data = await safeKocJson(res);
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

            msgBox.className = 'p-2 rounded-lg text-xs bg-emerald-100 text-emerald-800 font-bold';
            msgBox.textContent = `✅ Đã tìm thấy ${tabs.length} tab trong Google Sheet! Hãy chọn tab tương ứng bên trên.`;
        } catch (e) {
            msgBox.className = 'p-2 rounded-lg text-xs bg-rose-100 text-rose-800 font-bold';
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
            const data = await safeKocJson(res);
            if (!res.ok) throw new Error(data.detail || 'Lỗi lưu nguồn');

            const syncRes = await fetch(`/api/marketplace/koc/sources/${data.id}/sync`, { method: 'POST' });
            const syncData = await safeKocJson(syncRes);
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
        if (btn) { btn.disabled = true; btn.innerHTML = '<i class="ph ph-spinner animate-spin"></i> Đang đồng bộ...'; }
        try {
            const res = await fetch(`/api/marketplace/koc/sources/${sourceId}/sync`, { method: 'POST' });
            const data = await safeKocJson(res);
            if (!res.ok) throw new Error(data.detail || 'Lỗi đồng bộ');
            pcToast(data.message, 'success');
            await loadKocTab();
        } catch (e) {
            pcToast('Lỗi: ' + e.message, 'error');
        } finally {
            if (btn) { btn.disabled = false; btn.innerHTML = '<span><i class="ph ph-arrows-clockwise"></i> Đồng Bộ Từ Sheet</span>'; }
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

    let kocScanRunning = false;
    let kocScanPaused = false;
    let kocScanAborted = false;

    function togglePauseKocScan() {
        if (!kocScanRunning) return;
        kocScanPaused = !kocScanPaused;
        const pauseBtn = document.getElementById('btn-koc-scan-pause');
        const spinner = document.getElementById('koc-scan-spinner');
        if (pauseBtn) pauseBtn.textContent = kocScanPaused ? 'Tiếp tục' : 'Tạm dừng';
        if (spinner) spinner.classList.toggle('animate-spin', !kocScanPaused);
    }
    window.togglePauseKocScan = togglePauseKocScan;

    function stopKocScan() {
        kocScanAborted = true;
        kocScanPaused = false;
    }
    window.stopKocScan = stopKocScan;

    async function scanCurrentKocViews(mode = 'pending') {
        if (kocScanRunning) {
            pcToast('Đang có tiến trình quét view chạy. Anh có thể bấm Tạm dừng hoặc Dừng hẳn trên thanh tiến trình.', 'warning');
            return;
        }
        const targetSources = kocSelectedSourceId
            ? kocSources.filter(s => String(s.id) === String(kocSelectedSourceId))
            : kocSources;
        if (!targetSources.length) return pcToast('Hãy kết nối nguồn Sheet trước', 'warning');

        const scanMode = mode === 'all' ? 'all' : 'pending';
        const btnPending = document.getElementById('btn-koc-scan-views');
        const btnAll = document.getElementById('btn-koc-rescan-all');
        const progWrap = document.getElementById('koc-scan-progress-wrap');
        const progText = document.getElementById('koc-scan-progress-text');
        const progFill = document.getElementById('koc-scan-progress-fill');
        const pauseBtn = document.getElementById('btn-koc-scan-pause');
        const spinner = document.getElementById('koc-scan-spinner');

        kocScanRunning = true;
        kocScanPaused = false;
        kocScanAborted = false;
        if (btnPending) btnPending.disabled = true;
        if (btnAll) btnAll.disabled = true;
        if (pauseBtn) pauseBtn.textContent = 'Tạm dừng';
        if (spinner) spinner.classList.add('animate-spin');
        if (progWrap) progWrap.classList.remove('hidden');
        if (progFill) progFill.style.width = '2%';

        let totalScanned = 0, totalUpdated = 0, totalQual = 0, totalErr = 0, batchIdx = 0;
        let estTotal = targetSources.reduce((acc, s) => {
            const st = s.stats || {};
            return acc + Number(scanMode === 'pending' ? (st.pending_videos ?? st.total_videos ?? 0) : (st.total_videos ?? 0));
        }, 0);

        try {
            for (const src of targetSources) {
                let afterId = 0;
                let hasMore = true;
                while (hasMore && !kocScanAborted) {
                    while (kocScanPaused && !kocScanAborted) {
                        if (progText) progText.textContent = `Đã tạm dừng tại ${totalScanned}/${estTotal || '?'} video — bấm "Tiếp tục" để quét tiếp.`;
                        await new Promise(r => setTimeout(r, 350));
                    }
                    if (kocScanAborted) break;

                    batchIdx += 1;
                    if (progText) {
                        progText.textContent = `Đang quét [${src.name}] lô #${batchIdx}: đã xử lý ${totalScanned}/${estTotal || '?'} video · Cập nhật: ${totalUpdated} · Đạt KPI: ${totalQual}`;
                    }

                    let data = null;
                    let lastErr = null;
                    for (let retry = 0; retry < 3; retry++) {
                        try {
                            const url = `/api/marketplace/koc/sources/${src.id}/refresh-views?mode=${scanMode}&after_id=${afterId}&limit=8`;
                            const res = await fetch(url, { method: 'POST' });
                            data = await safeKocJson(res);
                            if (!res.ok) throw new Error(data.detail || `HTTP ${res.status}`);
                            lastErr = null;
                            break;
                        } catch (err) {
                            lastErr = err;
                            if (retry < 2 && !kocScanAborted) {
                                if (progText) progText.textContent = `Mạng chập chờn (${err.message}), đang tự thử lại lô #${batchIdx}...`;
                                await new Promise(r => setTimeout(r, 2000));
                            }
                        }
                    }
                    if (lastErr) throw lastErr;

                    const scanned = Number(data.scanned || 0);
                    if (scanned === 0) {
                        hasMore = false;
                        break;
                    }
                    totalScanned += scanned;
                    totalUpdated += Number(data.updated || 0);
                    totalQual += Number(data.qualified_in_batch || 0);
                    totalErr += Number(data.errors || 0);
                    afterId = Number(data.last_id || afterId);
                    hasMore = Boolean(data.has_more);

                    const dynTotal = Math.max(estTotal, totalScanned + Number(data.remaining || 0));
                    estTotal = dynTotal;
                    const pct = dynTotal > 0 ? Math.min(100, Math.round((totalScanned * 100) / dynTotal)) : 100;
                    if (progFill) progFill.style.width = `${pct}%`;
                    if (progText) {
                        progText.textContent = `Đã quét ${totalScanned}/${dynTotal} video (${pct}%) · Lấy view OK: ${totalUpdated} · Đạt KPI: ${totalQual} · Lỗi/Riêng tư: ${totalErr}`;
                    }

                    if (batchIdx % 2 === 0) {
                        await loadKocTab();
                    }
                }
                if (kocScanAborted) break;
            }

            await loadKocTab();
            if (kocScanAborted) {
                pcToast(`Đã dừng quét theo yêu cầu (đã lưu ${totalUpdated}/${totalScanned} video vừa quét).`, 'info');
            } else if (totalScanned === 0) {
                pcToast('Tất cả video đều đã có lượt xem, không còn video chờ quét! Bấm "Quét Lại Tất Cả" nếu muốn làm mới.', 'info');
            } else {
                if (progFill) progFill.style.width = '100%';
                pcToast(`Hoàn tất quét ${totalScanned} video TikTok (thành công ${totalUpdated} video, đạt KPI ${totalQual} video)!`, 'success');
            }
        } catch (e) {
            await loadKocTab();
            pcToast('Lỗi khi quét view: ' + e.message + ' (các lô trước đã được lưu an toàn)', 'error');
        } finally {
            kocScanRunning = false;
            kocScanPaused = false;
            if (btnPending) btnPending.disabled = false;
            if (btnAll) btnAll.disabled = false;
            if (spinner) spinner.classList.remove('animate-spin');
            updateKocTopKpiCards();
            setTimeout(() => {
                if (!kocScanRunning && progWrap) progWrap.classList.add('hidden');
            }, 3500);
        }
    }
    window.scanCurrentKocViews = scanCurrentKocViews;

    function fillKocRulesInputs(r) {
        document.getElementById('koc-rule-min-views').value = r.min_views ?? 200;
        document.getElementById('koc-rule-kpi-deduct').value = r.kpi_deduct_videos ?? 0;
        document.getElementById('koc-rule-rate').value = Number(r.rate_per_video ?? 10000).toLocaleString('vi-VN');
        const adjEl = document.getElementById('koc-rule-manual-adjust');
        if (adjEl) adjEl.value = r.manual_adjust_videos ?? 0;
        const graceEl = document.getElementById('koc-rule-grace-days');
        if (graceEl) graceEl.value = r.grace_days_prev_month ?? 5;
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
        const adjRaw = parseInt(document.getElementById('koc-rule-manual-adjust')?.value || 0, 10);
        const graceRaw = parseInt(document.getElementById('koc-rule-grace-days')?.value || 5, 10);
        const rules = {
            min_views: Math.max(0, parseInt(document.getElementById('koc-rule-min-views').value || 0, 10)),
            kpi_deduct_videos: Math.max(0, parseInt(document.getElementById('koc-rule-kpi-deduct').value || 0, 10)),
            rate_per_video: parseMoneyInput(document.getElementById('koc-rule-rate').value),
            manual_adjust_videos: Number.isNaN(adjRaw) ? 0 : adjRaw,
            grace_days_prev_month: Math.max(0, Math.min(60, Number.isNaN(graceRaw) ? 5 : graceRaw)),
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
