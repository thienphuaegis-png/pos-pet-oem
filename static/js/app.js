

        // =========================================================================
        // HỆ THỐNG THÔNG BÁO & MODAL ALERT / TOAST ĐỒNG BỘ GIAO DIỆN HIỆN ĐẠI
        // Thay thế hoàn toàn alert() mặc định trình duyệt (Chromium popup xám)
        // =========================================================================

        (function() {
            // Container chứa Toast thông báo nổi góc phải
            function ensureToastContainer() {
                let container = document.getElementById('custom-toast-container');
                if (!container && document.body) {
                    container = document.createElement('div');
                    container.id = 'custom-toast-container';
                    container.className = 'fixed top-5 right-5 z-[999999] flex flex-col gap-2.5 max-w-sm w-full pointer-events-none transition-all';
                    document.body.appendChild(container);
                }
                return container;
            }

            window.showConfirmModal = function(options) {
                return new Promise((resolve) => {
                    if (typeof options === 'string') {
                        options = { message: options, title: arguments[1] || 'Xác nhận' };
                    }
                    const {
                        title = 'Xác nhận',
                        message = 'Bạn có chắc chắn muốn thực hiện?',
                        subMessage = '',
                        confirmText = 'Đồng ý',
                        cancelText = 'Hủy bỏ',
                        type = 'danger', // danger, warning, primary, transfer, success
                        icon: customIcon = null
                    } = options || {};

                    // Xóa modal cũ nếu còn
                    const old = document.getElementById('global-confirm-modal');
                    if (old) old.remove();

                    let btnClass = 'bg-rose-600 hover:bg-rose-700 text-white shadow-rose-200';
                    let iconBg = 'bg-rose-100 text-rose-600 border border-rose-200';
                    let icon = customIcon || '🗑️';

                    if (type === 'warning') {
                        btnClass = 'bg-amber-600 hover:bg-amber-700 text-white shadow-amber-200';
                        iconBg = 'bg-amber-100 text-amber-600 border border-amber-200';
                        icon = customIcon || '⚠️';
                    } else if (type === 'primary') {
                        btnClass = 'bg-indigo-600 hover:bg-indigo-700 text-white shadow-indigo-200';
                        iconBg = 'bg-indigo-100 text-indigo-600 border border-indigo-200';
                        icon = customIcon || '✨';
                    } else if (type === 'transfer' || type === 'info') {
                        btnClass = 'bg-sky-600 hover:bg-sky-700 text-white shadow-sky-200';
                        iconBg = 'bg-sky-100 text-sky-700 border border-sky-200';
                        icon = customIcon || '🔄';
                    } else if (type === 'success') {
                        btnClass = 'bg-emerald-600 hover:bg-emerald-700 text-white shadow-emerald-200';
                        iconBg = 'bg-emerald-100 text-emerald-700 border border-emerald-200';
                        icon = customIcon || '✅';
                    }

                    const modal = document.createElement('div');
                    modal.id = 'global-confirm-modal';
                    modal.className = 'fixed inset-0 bg-slate-900/60 backdrop-blur-[2px] z-[9999999] flex items-center justify-center p-4 transition-all duration-200 opacity-0';
                    modal.innerHTML = `
                        <div class="bg-white rounded-2xl p-6 w-[440px] max-w-full shadow-2xl border border-slate-100 transform scale-95 transition-all duration-200 space-y-4">
                            <div class="flex items-start gap-3.5">
                                <div class="w-11 h-11 rounded-xl flex items-center justify-center text-xl shrink-0 ${iconBg}">
                                    ${icon}
                                </div>
                                <div class="flex-1 min-w-0">
                                    <h3 class="text-base font-bold text-slate-900 leading-snug">${title}</h3>
                                    <div class="text-xs font-medium text-slate-700 mt-1.5 leading-relaxed break-words whitespace-pre-line">
                                        ${message}
                                    </div>
                                    ${subMessage ? `<div class="text-[11px] text-slate-500 bg-slate-50 p-2.5 rounded-lg border border-slate-200/80 mt-2.5 leading-normal whitespace-pre-line">${subMessage}</div>` : ''}
                                </div>
                            </div>
                            <div class="flex items-center justify-end gap-2.5 pt-2 border-t border-slate-100">
                                <button type="button" id="btn-modal-cancel" class="px-4 py-2 rounded-xl text-xs font-bold text-slate-600 hover:bg-slate-100 border border-slate-200 transition">
                                    ${cancelText}
                                </button>
                                <button type="button" id="btn-modal-confirm" class="px-4 py-2 rounded-xl text-xs font-bold ${btnClass} shadow-xs transition">
                                    ${confirmText}
                                </button>
                            </div>
                        </div>
                    `;

                    document.body.appendChild(modal);

                    const confirmBtn = document.getElementById('btn-modal-confirm');
                    const cancelBtn = document.getElementById('btn-modal-cancel');

                    // Animate in
                    requestAnimationFrame(() => {
                        modal.classList.remove('opacity-0');
                        modal.querySelector('div').classList.remove('scale-95');
                        if (confirmBtn) confirmBtn.focus();
                    });

                    const handleKey = (e) => {
                        if (e.key === 'Escape') {
                            e.preventDefault();
                            cleanup(false);
                        }
                    };
                    window.addEventListener('keydown', handleKey);

                    const cleanup = (val) => {
                        window.removeEventListener('keydown', handleKey);
                        modal.classList.add('opacity-0');
                        modal.querySelector('div').classList.add('scale-95');
                        setTimeout(() => modal.remove(), 150);
                        resolve(val);
                    };

                    if (confirmBtn) {
                        confirmBtn.onclick = () => {
                            confirmBtn.disabled = true;
                            cleanup(true);
                        };
                    }
                    if (cancelBtn) cancelBtn.onclick = () => cleanup(false);
                    modal.onclick = (e) => { if (e.target === modal) cleanup(false); };
                });
            };

            window.showToast = function(message, type = 'info', duration = 3200) {
                if (!document.body) {
                    window.addEventListener('DOMContentLoaded', () => window.showToast(message, type, duration));
                    return;
                }
                const container = ensureToastContainer();
                if (!container) return;

                const toast = document.createElement('div');
                toast.className = 'pointer-events-auto flex items-center gap-3 p-3.5 rounded-xl bg-white shadow-xl border border-slate-200/80 transition-all duration-300 transform translate-x-8 opacity-0 hover:shadow-2xl';

                let iconHtml = 'ℹ️';
                let iconClass = 'bg-sky-50 text-sky-600 border border-sky-200';
                const lower = String(message).toLowerCase();

                if (type === 'success' || lower.includes('thành công') || lower.includes('hoàn tất') || lower.includes('đã sao chép')) {
                    iconHtml = '✅';
                    iconClass = 'bg-emerald-50 text-emerald-600 border border-emerald-200';
                } else if (type === 'error' || lower.includes('lỗi') || lower.includes('thất bại') || lower.includes('không thể')) {
                    iconHtml = '⚠️';
                    iconClass = 'bg-rose-50 text-rose-600 border border-rose-200';
                } else if (type === 'warning' || lower.includes('chú ý') || lower.includes('cảnh báo')) {
                    iconHtml = '⚡';
                    iconClass = 'bg-amber-50 text-amber-600 border border-amber-200';
                }

                toast.innerHTML = `
                    <div class="w-8 h-8 rounded-lg flex items-center justify-center text-sm shrink-0 shadow-2xs ${iconClass}">
                        ${iconHtml}
                    </div>
                    <div class="text-xs font-semibold text-slate-800 flex-1 leading-snug break-words">
                        ${message}
                    </div>
                    <button type="button" class="text-slate-400 hover:text-slate-600 p-1 text-xs cursor-pointer rounded transition" onclick="this.parentElement.remove()">
                        ✕
                    </button>
                `;

                container.appendChild(toast);

                requestAnimationFrame(() => {
                    toast.classList.remove('translate-x-8', 'opacity-0');
                    toast.classList.add('translate-x-0', 'opacity-100');
                });

                setTimeout(() => {
                    toast.classList.add('translate-x-8', 'opacity-0');
                    setTimeout(() => toast.remove(), 300);
                }, duration);
            };

            // Hàng đợi hiển thị Alert Modal
            const alertQueue = [];
            let isAlertShowing = false;

            function processAlertQueue() {
                if (alertQueue.length === 0) {
                    isAlertShowing = false;
                    return;
                }
                if (!document.body) {
                    window.addEventListener('DOMContentLoaded', processAlertQueue);
                    return;
                }
                isAlertShowing = true;
                const current = alertQueue.shift();
                renderAlertModal(current.message, current.title, current.resolve);
            }

            function renderAlertModal(message, customTitle, resolve) {
                const backdrop = document.createElement('div');
                backdrop.id = 'custom-alert-modal-backdrop';
                backdrop.className = 'fixed inset-0 z-[9999999] bg-slate-950/50 backdrop-blur-xs flex items-center justify-center p-4 transition-all duration-200 opacity-0';

                const lower = String(message).toLowerCase();
                let iconHtml = 'ℹ️';
                let iconBadgeClass = 'bg-indigo-50 border border-indigo-200 text-indigo-600';
                let defaultTitle = 'Thông báo hệ thống';

                if (lower.includes('lỗi') || lower.includes('thất bại') || lower.includes('không thể') || lower.includes('vui lòng') || lower.includes('chưa') || lower.includes('bị xóa')) {
                    iconHtml = '⚠️';
                    iconBadgeClass = 'bg-rose-50 border border-rose-200 text-rose-600';
                    defaultTitle = 'Thông báo chú ý';
                } else if (lower.includes('thành công') || lower.includes('hoàn tất') || lower.includes('đã lưu') || lower.includes('đã cập nhật')) {
                    iconHtml = '✅';
                    iconBadgeClass = 'bg-emerald-50 border border-emerald-200 text-emerald-600';
                    defaultTitle = 'Thành công';
                }

                const title = customTitle || defaultTitle;

                backdrop.innerHTML = `
                    <div id="custom-alert-card" class="bg-white rounded-2xl shadow-2xl border border-slate-200/90 max-w-md w-full overflow-hidden transform transition-all duration-200 scale-95 opacity-0 flex flex-col">
                        <div class="p-5 flex items-start gap-3.5">
                            <div class="w-11 h-11 rounded-xl flex items-center justify-center text-xl shrink-0 shadow-2xs ${iconBadgeClass}">
                                ${iconHtml}
                            </div>
                            <div class="flex-1 min-w-0 pt-0.5">
                                <h4 class="text-sm font-bold text-slate-900 tracking-tight">${title}</h4>
                                <div class="mt-2 text-xs text-slate-600 leading-relaxed break-words whitespace-pre-line">${message}</div>
                            </div>
                        </div>
                        <div class="bg-slate-50/80 px-5 py-3 border-t border-slate-100 flex justify-end gap-2">
                            <button type="button" id="btn-custom-alert-ok" class="px-5 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 active:scale-95 text-white font-bold text-xs shadow-sm shadow-indigo-100 transition focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-1">
                                Đã hiểu
                            </button>
                        </div>
                    </div>
                `;

                document.body.appendChild(backdrop);

                const card = backdrop.querySelector('#custom-alert-card');
                const okBtn = backdrop.querySelector('#btn-custom-alert-ok');

                requestAnimationFrame(() => {
                    backdrop.classList.remove('opacity-0');
                    backdrop.classList.add('opacity-100');
                    card.classList.remove('scale-95', 'opacity-0');
                    card.classList.add('scale-100', 'opacity-100');
                    if (okBtn) okBtn.focus();
                });

                function closeModal() {
                    card.classList.remove('scale-100', 'opacity-100');
                    card.classList.add('scale-95', 'opacity-0');
                    backdrop.classList.remove('opacity-100');
                    backdrop.classList.add('opacity-0');
                    document.removeEventListener('keydown', handleKey);
                    setTimeout(() => {
                        backdrop.remove();
                        if (resolve) resolve();
                        processAlertQueue();
                    }, 180);
                }

                function handleKey(e) {
                    if (e.key === 'Enter' || e.key === 'Escape') {
                        e.preventDefault();
                        closeModal();
                    }
                }

                if (okBtn) okBtn.addEventListener('click', closeModal);
                backdrop.addEventListener('click', (e) => {
                    if (e.target === backdrop) closeModal();
                });
                document.addEventListener('keydown', handleKey);
            }

            window.customAlert = function(message, title = null) {
                return new Promise((resolve) => {
                    alertQueue.push({ message, title, resolve });
                    if (!isAlertShowing) {
                        processAlertQueue();
                    }
                });
            };

            // Ghi đè toàn bộ window.alert mặc định của trình duyệt
            window.alert = window.customAlert;

            // Modal Xác Nhận (Confirm) Đồng Bộ
            window.customConfirm = function(message, title = 'Xác nhận thao tác', options = {}) {
                return new Promise((resolve) => {
                    if (!document.body) {
                        resolve(false);
                        return;
                    }
                    const isDanger = options.type === 'danger' || /xóa|hủy/i.test(title);
                    const icon = options.icon || (isDanger ? '🗑️' : '❓');
                    const iconBoxClass = isDanger 
                        ? 'bg-rose-50 border border-rose-200 text-rose-600' 
                        : 'bg-amber-50 border border-amber-200 text-amber-600';
                    const okBtnClass = isDanger
                        ? 'bg-rose-600 hover:bg-rose-700 text-white shadow-rose-100'
                        : 'bg-indigo-600 hover:bg-indigo-700 text-white shadow-indigo-100';
                    const okText = options.okText || (isDanger ? 'Xác Nhận Xóa' : 'Đồng ý');
                    const cancelText = options.cancelText || 'Hủy bỏ';

                    const backdrop = document.createElement('div');
                    backdrop.id = 'custom-confirm-modal-backdrop';
                    backdrop.className = 'fixed inset-0 z-[9999999] bg-slate-950/50 backdrop-blur-xs flex items-center justify-center p-4 transition-all duration-200 opacity-0';

                    backdrop.innerHTML = `
                        <div id="custom-confirm-card" class="bg-white rounded-2xl shadow-2xl border border-slate-200/90 max-w-md w-full overflow-hidden transform transition-all duration-200 scale-95 opacity-0 flex flex-col">
                            <div class="p-5 flex items-start gap-3.5">
                                <div class="w-11 h-11 rounded-xl flex items-center justify-center text-xl shrink-0 shadow-2xs ${iconBoxClass}">
                                    ${icon}
                                </div>
                                <div class="flex-1 min-w-0 pt-0.5">
                                    <h4 class="text-sm font-bold text-slate-900 tracking-tight">${title}</h4>
                                    <div class="mt-2 text-xs text-slate-600 leading-relaxed break-words whitespace-pre-line">${message}</div>
                                </div>
                            </div>
                            <div class="bg-slate-50/80 px-5 py-3 border-t border-slate-100 flex justify-end gap-2">
                                <button type="button" id="btn-custom-confirm-cancel" class="px-4 py-2 rounded-xl bg-white hover:bg-slate-100 text-slate-700 font-bold text-xs border border-slate-300 shadow-2xs transition active:scale-95">
                                    ${cancelText}
                                </button>
                                <button type="button" id="btn-custom-confirm-ok" class="px-5 py-2 rounded-xl ${okBtnClass} font-bold text-xs shadow-sm transition active:scale-95">
                                    ${okText}
                                </button>
                            </div>
                        </div>
                    `;

                    document.body.appendChild(backdrop);
                    const card = backdrop.querySelector('#custom-confirm-card');
                    const cancelBtn = backdrop.querySelector('#btn-custom-confirm-cancel');
                    const okBtn = backdrop.querySelector('#btn-custom-confirm-ok');

                    requestAnimationFrame(() => {
                        backdrop.classList.remove('opacity-0');
                        backdrop.classList.add('opacity-100');
                        card.classList.remove('scale-95', 'opacity-0');
                        card.classList.add('scale-100', 'opacity-100');
                        if (okBtn) okBtn.focus();
                    });

                    function closeConfirm(result) {
                        card.classList.remove('scale-100', 'opacity-100');
                        card.classList.add('scale-95', 'opacity-0');
                        backdrop.classList.remove('opacity-100');
                        backdrop.classList.add('opacity-0');
                        document.removeEventListener('keydown', handleKey);
                        setTimeout(() => {
                            backdrop.remove();
                            resolve(result);
                        }, 180);
                    }

                    function handleKey(e) {
                        if (e.key === 'Escape') {
                            e.preventDefault();
                            closeConfirm(false);
                        } else if (e.key === 'Enter') {
                            e.preventDefault();
                            closeConfirm(true);
                        }
                    }

                    if (cancelBtn) cancelBtn.addEventListener('click', () => closeConfirm(false));
                    if (okBtn) okBtn.addEventListener('click', () => closeConfirm(true));
                    backdrop.addEventListener('click', (e) => {
                        if (e.target === backdrop) closeConfirm(false);
                    });
                    document.addEventListener('keydown', handleKey);
                });
            };
        })();

        function escapeJs(str) {
            if (!str) return '';
            return String(str).replace(/\\/g, '\\\\').replace(/'/g, "\\'").replace(/"/g, '&quot;');
        }

        // ==================== QUẢN LÝ KHO HÀNG & HÀNG HÓA CONSOLIDATED ====================
        let allWarehouses = [];
        let unifiedInventoryData = [];
        let unifiedSortColumn = 'name';
        let unifiedSortAsc = true;
        let unifiedInventoryPage = 1;

        function changeUnifiedInventoryPage(newPage) {
            unifiedInventoryPage = newPage;
            renderUnifiedInventoryTable();
        }
        window.changeUnifiedInventoryPage = changeUnifiedInventoryPage;
        let selectedBOMProductIds = [];
        let allBOMProductsList = [];
        let transferSourceItems = [];
        let currentTransferRows = [];
        let currentAuditItems = [];

        function switchInvSubTab(subId) {
            document.querySelectorAll('[id^="inv-sub-"]').forEach(el => el.classList.add('hidden'));
            const target = document.getElementById('inv-sub-' + subId);
            if (target) target.classList.remove('hidden');

            document.querySelectorAll('.inv-subtab-btn').forEach(btn => {
                if (btn.dataset.sub === subId) {
                    btn.className = 'inv-subtab-btn px-3 py-2 rounded-lg bg-sky-600 text-white shadow-sm flex items-center gap-1.5';
                } else {
                    btn.className = 'inv-subtab-btn px-3 py-2 rounded-lg text-slate-600 hover:bg-slate-100 flex items-center gap-1.5';
                }
            });

            if (subId === 'unified') loadUnifiedInventory();
            if (subId === 'products') loadProducts();
            if (subId === 'cost') initCostManagement();
            if (subId === 'audit') initStockAuditView();
            if (subId === 'transfer') initStockTransferView();
            if (subId === 'warehouses') loadWarehousesList();
            if (subId === 'production') initProduction();
        }

        function switchSettingsSubTab(subId) {
            document.querySelectorAll('[id^="settings-sub-"]').forEach(el => el.classList.add('hidden'));
            const target = document.getElementById('settings-sub-' + subId);
            if (target) target.classList.remove('hidden');

            document.querySelectorAll('.settings-subtab-btn').forEach(btn => {
                if (btn.dataset.sub === subId) {
                    if (subId === 'reset-data') {
                        btn.className = 'settings-subtab-btn px-3 py-2 rounded-lg bg-rose-600 text-white shadow-sm flex items-center gap-1.5 font-bold';
                    } else {
                        btn.className = 'settings-subtab-btn px-3 py-2 rounded-lg bg-purple-600 text-white shadow-sm flex items-center gap-1.5 font-bold';
                    }
                } else {
                    if (btn.dataset.sub === 'reset-data') {
                        btn.className = 'settings-subtab-btn px-3 py-2 rounded-lg text-rose-600 hover:bg-rose-50 flex items-center gap-1.5 border border-rose-200';
                    } else {
                        btn.className = 'settings-subtab-btn px-3 py-2 rounded-lg text-slate-600 hover:bg-slate-100 flex items-center gap-1.5';
                    }
                }
            });

            if (subId === 'company') loadCompanySettings();
            if (subId === 'templates') {
                if (typeof loadSettings === 'function') loadSettings();
                else if (typeof window.loadSettings === 'function') window.loadSettings();
            }
            if (subId === 'staff') { if (typeof loadStaffList === 'function') loadStaffList(); }
            if (subId === 'permissions') { if (typeof loadPermissionsUI === 'function') loadPermissionsUI(); }
            if (subId === 'activity-log') { if (typeof renderActivityLog === 'function') renderActivityLog(); }
            if (subId === 'telegram') { if (typeof loadTelegramSettingsData === 'function') loadTelegramSettingsData(); }
            if (subId === 'topup-packages') { if (typeof loadTopupPackagesList === 'function') loadTopupPackagesList(); }
            if (subId === 'pet-catalog') { if (typeof loadPetCatalogSettingsUI === 'function') loadPetCatalogSettingsUI(); }
        }

        // --- SUB 1: TỒN KHO TỔNG HỢP ---
        let canViewCost = true;

        // Ẩn/hiện mọi phần tử giá vốn theo quyền inventory.view_cost (backend đã xóa dữ liệu, đây chỉ là lớp UI)
        function applyCostVisibility() {
            document.querySelectorAll('.col-cost').forEach(el => {
                el.style.display = canViewCost ? '' : 'none';
            });
        }

        async function loadUnifiedInventory() {
            try {
                const whId = document.getElementById('unified-wh-filter')?.value || '';
                const itemType = document.getElementById('unified-type-filter')?.value || 'all';
                const search = document.getElementById('unified-search')?.value || '';

                const showHidden = (itemType === 'hidden');
                let url = `/api/inventory/unified?show_hidden=${showHidden}`;
                if (itemType !== 'hidden') {
                    url += `&item_type=${itemType}`;
                }
                if (whId) url += `&warehouse_id=${whId}`;
                if (search) url += `&search=${encodeURIComponent(search)}`;

                const [resInv, resWh] = await Promise.all([
                    fetch(url),
                    fetch('/api/warehouses')
                ]);
                
                const data = await resInv.json();
                allWarehouses = await resWh.json();
                unifiedInventoryData = data.items || [];

                const whSelect = document.getElementById('unified-wh-filter');
                if (whSelect && (!whSelect.options || whSelect.options.length <= 1)) {
                    whSelect.innerHTML = '<option value="">Tất cả kho hàng</option>' + 
                        (Array.isArray(allWarehouses) ? allWarehouses.map(w => `<option value="${w.id}">${w.name}</option>`).join('') : '');
                    if (whId) whSelect.value = whId;
                }

                document.getElementById('kpi-inv-count').innerText = (data.total_count || 0).toLocaleString('vi-VN');
                document.getElementById('kpi-inv-qty').innerText = (data.total_quantity || 0).toLocaleString('vi-VN');
                document.getElementById('kpi-inv-val').innerText = formatMoney(data.total_value || 0);

                // Không có quyền xem giá vốn -> ẩn hẳn cột giá vốn / giá trị tồn / KPI vốn
                canViewCost = data.can_view_cost !== false;
                applyCostVisibility();

                await populateUnifiedCategoryFilter();
                renderUnifiedInventoryTable();
            } catch (e) {
                console.error("loadUnifiedInventory error:", e);
            }
        }

        async function populateUnifiedCategoryFilter() {
            const sel = document.getElementById('unified-category-filter');
            if (!sel) return;
            try {
                const res = await fetch('/api/products/categories');
                const cats = await res.json();
                const curVal = sel.value;
                sel.innerHTML = '<option value="">Tất cả nhóm</option>' + cats.map(c => `<option value="${c}" ${c === curVal ? 'selected' : ''}>${c}</option>`).join('');
            } catch (e) {
                console.error("populateUnifiedCategoryFilter error:", e);
            }
        }

        function sortUnifiedTable(column) {
            if (unifiedSortColumn === column) {
                unifiedSortAsc = !unifiedSortAsc;
            } else {
                unifiedSortColumn = column;
                unifiedSortAsc = true;
            }
            // Cập nhật icon mũi tên trên thead
            ['code', 'name', 'item_type', 'supplier_names', 'quantity', 'cost_price', 'total_value'].forEach(col => {
                const icon = document.getElementById('sort-icon-' + col);
                if (icon) {
                    if (col === unifiedSortColumn) {
                        icon.innerText = unifiedSortAsc ? '▲' : '▼';
                        icon.className = 'text-sky-600 font-bold';
                    } else {
                        icon.innerText = '↕';
                        icon.className = 'text-gray-400';
                    }
                }
            });
            renderUnifiedInventoryTable();
        }

        // --- QUẢN LÝ CHECKBOX HÀNG LOẠT TRÊN BẢNG TỒN KHO ---
        let selectedUnifiedItemIds = new Set();

        function toggleSelectAllUnified(checked) {
            const checkboxes = document.querySelectorAll('.chk-item-unified');
            checkboxes.forEach(cb => {
                cb.checked = checked;
                const id = parseInt(cb.dataset.id);
                if (checked) {
                    selectedUnifiedItemIds.add(id);
                } else {
                    selectedUnifiedItemIds.delete(id);
                }
            });
            updateUnifiedBulkActionBar();
        }
        window.toggleSelectAllUnified = toggleSelectAllUnified;

        function toggleItemUnified(id, checked) {
            if (checked) {
                selectedUnifiedItemIds.add(id);
            } else {
                selectedUnifiedItemIds.delete(id);
            }
            const allBoxes = document.querySelectorAll('.chk-item-unified');
            const allChecked = allBoxes.length > 0 && Array.from(allBoxes).every(b => b.checked);
            const masterChk = document.getElementById('chk-select-all-unified');
            if (masterChk) masterChk.checked = allChecked;
            updateUnifiedBulkActionBar();
        }
        window.toggleItemUnified = toggleItemUnified;

        function clearUnifiedSelection() {
            selectedUnifiedItemIds.clear();
            const masterChk = document.getElementById('chk-select-all-unified');
            if (masterChk) masterChk.checked = false;
            document.querySelectorAll('.chk-item-unified').forEach(b => b.checked = false);
            updateUnifiedBulkActionBar();
        }
        window.clearUnifiedSelection = clearUnifiedSelection;

        function updateUnifiedBulkActionBar() {
            const bar = document.getElementById('unified-bulk-action-bar');
            const countEl = document.getElementById('bulk-selected-count');
            const count = selectedUnifiedItemIds.size;
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
        window.updateUnifiedBulkActionBar = updateUnifiedBulkActionBar;

        async function bulkSetProductStatus(isActive) {
            const ids = Array.from(selectedUnifiedItemIds);
            if (ids.length === 0) return;
            const actionText = isActive === 1 ? 'Kinh doanh lại' : 'Ngừng kinh doanh';
            const confirmed = await window.showConfirmModal({
                title: `${actionText} Hàng Loạt`,
                message: `Bạn có chắc chắn muốn chuyển <span class="font-bold text-indigo-600">${ids.length} mặt hàng</span> đã chọn sang trạng thái <strong>${actionText}</strong>?`,
                subMessage: isActive === 1 ? 'Mặt hàng sẽ xuất hiện lại trên POS và đơn nhập hàng.' : 'Mặt hàng sẽ tạm ẩn khỏi màn hình POS để tránh bán nhầm.',
                confirmText: 'Đồng ý',
                cancelText: 'Hủy bỏ',
                type: isActive === 1 ? 'primary' : 'warning'
            });
            if (!confirmed) return;

            try {
                const res = await fetch('/api/products/bulk-status', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ product_ids: ids, is_active: isActive })
                });
                const data = await res.json();
                if (res.ok) {
                    window.showToast ? window.showToast(data.message || 'Cập nhật thành công!', 'success') : alert(data.message);
                    clearUnifiedSelection();
                    await loadUnifiedInventory();
                } else {
                    window.showToast ? window.showToast('Lỗi: ' + (data.detail || 'Không thể cập nhật'), 'error') : alert('Lỗi: ' + data.detail);
                }
            } catch (e) {
                window.showToast ? window.showToast('Lỗi kết nối máy chủ', 'error') : alert('Lỗi kết nối máy chủ');
            }
        }
        window.bulkSetProductStatus = bulkSetProductStatus;

        async function bulkDeleteProductsAction() {
            const ids = Array.from(selectedUnifiedItemIds);
            if (ids.length === 0) return;

            const confirmed = await window.showConfirmModal({
                title: 'Xóa / Ngừng Kinh Doanh Hàng Loạt',
                message: `Bạn có chắc chắn muốn xử lý <span class="font-bold text-rose-600">${ids.length} mặt hàng</span> đã chọn?`,
                subMessage: 'Hệ thống tự động kiểm tra: Mặt hàng còn tồn kho > 0 sẽ được giữ lại an toàn; Mặt hàng có đơn cũ chuyển sang Ngừng kinh doanh; Mặt hàng chưa từng phát sinh đơn sẽ xóa vĩnh viễn.',
                confirmText: 'Xác nhận xử lý',
                cancelText: 'Hủy bỏ',
                type: 'danger'
            });
            if (!confirmed) return;

            try {
                const res = await fetch('/api/products/bulk-delete', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ product_ids: ids, force: false })
                });
                const data = await res.json();
                if (res.ok) {
                    window.showToast ? window.showToast(data.message || 'Đã xử lý xong danh sách!', 'success', 3500) : alert(data.message);
                    clearUnifiedSelection();
                    await loadUnifiedInventory();
                } else {
                    window.showToast ? window.showToast('Lỗi: ' + (data.detail || 'Không thể xóa'), 'error') : alert('Lỗi: ' + data.detail);
                }
            } catch (e) {
                window.showToast ? window.showToast('Lỗi kết nối máy chủ', 'error') : alert('Lỗi kết nối máy chủ');
            }
        }
        window.bulkDeleteProductsAction = bulkDeleteProductsAction;

        function renderUnifiedInventoryTable() {
            const tbody = document.getElementById('table-unified-inventory');
            if (!tbody) return;

            if (!unifiedInventoryData || unifiedInventoryData.length === 0) {
                tbody.innerHTML = '<tr><td colspan="11" class="p-6 text-center text-gray-400">Không tìm thấy mặt hàng nào trong kho</td></tr>';
                return;
            }

            // Sắp xếp mảng tại frontend
            let items = [...unifiedInventoryData].sort((a, b) => {
                let valA = a[unifiedSortColumn];
                let valB = b[unifiedSortColumn];
                if (valA === null || valA === undefined) valA = '';
                if (valB === null || valB === undefined) valB = '';

                if (typeof valA === 'number' && typeof valB === 'number') {
                    return unifiedSortAsc ? valA - valB : valB - valA;
                }
                const strA = String(valA).toLowerCase();
                const strB = String(valB).toLowerCase();
                return unifiedSortAsc ? strA.localeCompare(strB, 'vi') : strB.localeCompare(strA, 'vi');
            });

            const catFilter = currentCategoryFilter || document.getElementById('unified-category-filter')?.value || '';
            if (catFilter) {
                items = items.filter(item => (item.category || 'Khác') === catFilter);
            }

            const totalItems = items.length;
            const totalPages = Math.ceil(totalItems / 20) || 1;
            if (unifiedInventoryPage > totalPages) unifiedInventoryPage = totalPages;
            if (unifiedInventoryPage < 1) unifiedInventoryPage = 1;
            const pagedItems = items.slice((unifiedInventoryPage - 1) * 20, unifiedInventoryPage * 20);

            tbody.innerHTML = pagedItems.map((item, idx) => {
                const isProd = item.item_type === 'product';
                const isCombo = isProd && (item.sub_type === 'combo' || item.type === 'combo');
                const isService = isProd && (item.sub_type === 'service' || item.type === 'service');
                let badge = '';
                if (isProd) {
                    if (isService) {
                        badge = '<span class="px-2 py-0.5 rounded text-[10px] font-bold bg-amber-100 text-amber-700">Dịch Vụ</span>';
                    } else if (isCombo) {
                        badge = '<span class="px-2 py-0.5 rounded text-[10px] font-bold bg-purple-100 text-purple-700">Gói Combo</span>';
                    } else {
                        badge = '<span class="px-2 py-0.5 rounded text-[10px] font-bold bg-sky-100 text-sky-700">Hàng Hóa</span>';
                    }
                } else {
                    badge = '<span class="px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-100 text-emerald-700">Nguyên Liệu</span>';
                }
                const stockColor = item.quantity <= 0 ? 'text-red-600 font-bold' : (item.quantity <= 5 ? 'text-amber-600 font-bold' : 'font-bold text-slate-800');

                const suppBadge = item.supplier_names 
                    ? item.supplier_names.split(',').map(s => `<span class="inline-block bg-slate-100 text-slate-700 border border-slate-200 text-[10px] font-medium px-1.5 py-0.5 rounded mr-1 mb-0.5">🏭 ${s.trim()}</span>`).join('')
                    : '<span class="text-gray-400 italic text-xs">---</span>';

                // Thao tác: Hàng hóa có Thẻ kho, Sửa, Xóa; Nguyên liệu có Thẻ kho, Xóa
                let actionButtons = '';
                if (isProd) {
                    if (item.is_active === 0) {
                        actionButtons = `
                            <div class="flex items-center justify-center gap-1">
                                <button onclick="restoreProductItem(${item.id}, '${encodeURIComponent(item.name)}')" 
                                        class="px-2 py-1 bg-emerald-50 hover:bg-emerald-100 text-emerald-700 border border-emerald-200 rounded text-[11px] font-bold" title="Bỏ ẩn / Khôi phục hàng hóa">
                                    👁️ Bỏ Ẩn
                                </button>
                                <button onclick="openModalEditProduct(${item.id})" 
                                        class="px-2 py-1 bg-amber-50 hover:bg-amber-100 text-amber-700 border border-amber-200 rounded text-[11px] font-bold" title="Chỉnh sửa thông tin">
                                    ✏️ Sửa
                                </button>
                            </div>
                        `;
                    } else {
                        actionButtons = `
                            <div class="flex items-center justify-center gap-1">
                                ${isCombo ? '' : `
                                <button onclick="openItemLogsModal('product', ${item.id}, '${encodeURIComponent(item.name)}', '${item.code || ''}', '${item.unit || ''}')" 
                                        class="px-2 py-1 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded text-[11px] font-bold" title="Xem lịch sử thẻ kho">
                                    📜 Thẻ kho
                                </button>
                                `}
                                <button onclick="openModalEditProduct(${item.id})" 
                                        class="px-2 py-1 bg-amber-50 hover:bg-amber-100 text-amber-700 border border-amber-200 rounded text-[11px] font-bold" title="Chỉnh sửa thông tin">
                                    ✏️ Sửa
                                </button>
                                <button onclick="deleteProductItem(${item.id}, '${encodeURIComponent(item.name)}')" 
                                        class="px-2 py-1 bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 rounded text-[11px] font-bold" title="Ẩn hoặc xóa hàng hóa">
                                    🗑️ Xóa
                                </button>
                            </div>
                        `;
                    }
                } else {
                    actionButtons = `
                        <div class="flex items-center justify-center gap-1">
                            <button onclick="convertCurrentIngredientToProduct(${item.id}, '${encodeURIComponent(item.name)}')" 
                                    class="px-2 py-1 bg-emerald-50 hover:bg-emerald-100 text-emerald-700 border border-emerald-300 rounded text-[11px] font-bold" title="Chuyển đổi nguyên liệu này thành hàng hóa bán tại POS">
                                🔄 Thành Hàng Hóa
                            </button>
                            <button onclick="openItemLogsModal('${item.item_type}', ${item.id}, '${encodeURIComponent(item.name)}', '${item.code || ''}', '${item.unit || ''}')" 
                                    class="px-2 py-1 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded text-[11px] font-bold" title="Xem lịch sử thẻ kho">
                                📜 Thẻ kho
                            </button>
                            <button onclick="deleteIngredientItem(${item.id}, '${encodeURIComponent(item.name)}')" 
                                    class="px-2 py-1 bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 rounded text-[11px] font-bold" title="Xóa nguyên liệu">
                                🗑️ Xóa
                            </button>
                        </div>
                    `;
                }

                // Giá bán: nguyên liệu không bán trực tiếp -> gạch ngang
                const sellCell = item.item_type === 'ingredient'
                    ? '<span class="text-slate-300 italic">---</span>'
                    : (item.sell_price > 0
                        ? `<span class="font-semibold text-sky-700">${formatMoney(item.sell_price)}</span>`
                        : '<span class="text-slate-400">0 đ</span>');

                // Đơn vị quy đổi đã thiết lập (1 Thùng = 16 Chai)
                const unitBadge = (item.units && item.units.length)
                    ? ` <span class="ml-1 text-[10px] font-bold text-indigo-600 bg-indigo-50 px-1.5 py-0.5 rounded border border-indigo-200" title="${item.units.map(u => `1 ${u.unit_name} = ${u.ratio} ${item.unit || 'cái'}`).join(' | ')}">+${item.units.length} ĐV</span>`
                    : '';

                const isSelected = selectedUnifiedItemIds.has(item.id);
                const chkCell = isProd
                    ? `<td class="p-2.5 text-center"><input type="checkbox" data-id="${item.id}" onchange="toggleItemUnified(${item.id}, this.checked)" ${isSelected ? 'checked' : ''} class="chk-item-unified w-4 h-4 rounded text-indigo-600 focus:ring-indigo-500 cursor-pointer"></td>`
                    : '<td class="p-2.5 text-center text-slate-300">--</td>';

                const qtyCell = isCombo 
                    ? `<span class="text-purple-700 font-bold bg-purple-50 px-1.5 py-0.5 rounded border border-purple-200 text-[10px]" title="Combo ảo, trừ kho món con khi bán">Gói (Ảo)</span>` 
                    : (isService ? `<span class="text-slate-400 font-bold">∞</span>` : (item.quantity || 0).toLocaleString('vi-VN'));

                return `
                    <tr class="card-row card-row-anim text-xs select-none ${isSelected ? 'bg-indigo-50/50' : ''}" style="--row-idx: ${idx};">
                        ${chkCell}
                        <td class="p-2.5 font-mono font-bold text-slate-600">${item.code || '-'}</td>
                        <td class="p-2.5 font-bold text-slate-800">${item.name} <span class="ml-1 text-[10px] font-semibold text-slate-500 bg-slate-100 px-1.5 py-0.5 rounded border border-slate-200">${item.category || 'Khác'}</span></td>
                        <td class="p-2.5 text-center">${badge}</td>
                        <td class="p-2.5">${suppBadge}</td>
                        <td class="p-2.5 font-medium text-slate-600">${item.warehouse_name}</td>
                        <td class="p-2.5 text-right ${isCombo || isService ? '' : stockColor}">${qtyCell}</td>
                        <td class="p-2.5 text-gray-500">${item.unit || 'cái'}${unitBadge}</td>
                        <td class="p-2.5 text-right font-medium text-gray-700 col-cost">${isCombo ? '<span class="text-slate-300 italic">Theo món</span>' : formatMoney(item.cost_price)}</td>
                        <td class="p-2.5 text-right">${sellCell}</td>
                        <td class="p-2.5 text-right font-bold text-rose-600 col-cost">${isCombo ? '<span class="text-slate-300 italic">---</span>' : formatMoney(item.total_value)}</td>
                        <td class="p-2.5 text-slate-700 text-xs font-medium whitespace-nowrap">${item.created_by || 'Hệ thống'}</td>
                        <td class="p-2.5 text-slate-500 text-xs whitespace-nowrap">${item.updated_by ? `${item.updated_by} <span class="text-[10px] text-gray-400 block">${formatDateTime(item.updated_at)}</span>` : '<span class="text-gray-300">---</span>'}</td>
                        <td class="p-2.5 text-center">${actionButtons}</td>
                    </tr>
                `;
            }).join('');

            renderPaginationBar('pagination-unified-inventory', unifiedInventoryPage, totalPages, totalItems, 'changeUnifiedInventoryPage');
            applyCostVisibility();
        }

        // --- MODAL: THẺ KHO / NHẬT KÝ BIẾN ĐỘNG ---
        async function openItemLogsModal(itemType, itemId, encodedName, code, unit) {
            const name = decodeURIComponent(encodedName);
            document.getElementById('card-log-item-name').innerText = name;
            document.getElementById('card-log-code').innerText = code || '-';
            document.getElementById('card-log-unit').innerText = unit || 'cái';
            const badge = document.getElementById('card-log-badge');
            if (itemType === 'product') {
                badge.className = 'px-2 py-0.5 rounded text-[10px] font-bold bg-sky-100 text-sky-700';
                badge.innerText = 'Hàng Hóa';
            } else {
                badge.className = 'px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-100 text-emerald-700';
                badge.innerText = 'Nguyên Liệu';
            }

            const modal = document.getElementById('modal-item-logs');
            modal.classList.remove('hidden');

            const tbody = document.getElementById('table-card-logs');
            tbody.innerHTML = '<tr><td colspan="7" class="p-4 text-center text-gray-400">Đang tải lịch sử thẻ kho...</td></tr>';

            try {
                const res = await fetch(`/api/inventory/item-logs?item_type=${itemType}&item_id=${itemId}`);
                const logs = await res.json();
                if (!logs || logs.length === 0) {
                    tbody.innerHTML = '<tr><td colspan="7" class="p-4 text-center text-gray-400">Chưa có giao dịch xuất nhập cho mặt hàng này</td></tr>';
                    return;
                }

                tbody.innerHTML = logs.map(l => {
                    let typeBadge = '';
                    if (l.ref_type === 'SALE') typeBadge = '<span class="px-1.5 py-0.5 rounded text-[10px] font-bold bg-purple-100 text-purple-700">Bán hàng (POS)</span>';
                    else if (l.ref_type === 'PURCHASE') typeBadge = '<span class="px-1.5 py-0.5 rounded text-[10px] font-bold bg-emerald-100 text-emerald-700">Nhập NCC</span>';
                    else if (l.ref_type === 'ADJUST') typeBadge = '<span class="px-1.5 py-0.5 rounded text-[10px] font-bold bg-amber-100 text-amber-700">Kiểm kê / Cân bằng</span>';
                    else if (l.ref_type === 'TRANSFER_IN') typeBadge = '<span class="px-1.5 py-0.5 rounded text-[10px] font-bold bg-cyan-100 text-cyan-700">Nhận chuyển kho</span>';
                    else if (l.ref_type === 'TRANSFER_OUT') typeBadge = '<span class="px-1.5 py-0.5 rounded text-[10px] font-bold bg-rose-100 text-rose-700">Xuất chuyển kho</span>';
                    else typeBadge = `<span class="px-1.5 py-0.5 rounded text-[10px] font-bold bg-gray-100 text-gray-700">${l.ref_type || 'Biến động'}</span>`;

                    const changeClass = l.change_qty > 0 ? 'text-emerald-600 font-bold' : (l.change_qty < 0 ? 'text-rose-600 font-bold' : 'text-gray-600');
                    const changePrefix = l.change_qty > 0 ? '+' : '';

                    return `
                        <tr class="border-b hover:bg-gray-50 text-[11px]">
                            <td class="p-2 text-gray-500 whitespace-nowrap">${formatDateTime(l.created_at) || '-'}</td>
                            <td class="p-2">${typeBadge}</td>
                            <td class="p-2 text-right ${changeClass}">${changePrefix}${l.change_qty.toLocaleString('vi-VN')}</td>
                            <td class="p-2 text-right font-bold text-slate-800">${(l.new_qty || 0).toLocaleString('vi-VN')}</td>
                            <td class="p-2 font-medium text-slate-700">${l.warehouse_name || 'Kho'}</td>
                            <td class="p-2 font-mono text-gray-600">${l.ref_id ? '#' + l.ref_id : '-'}</td>
                            <td class="p-2 text-gray-500">${l.note || '-'}</td>
                        </tr>
                    `;
                }).join('');
            } catch (e) {
                console.error("item-logs error:", e);
                tbody.innerHTML = '<tr><td colspan="7" class="p-4 text-center text-red-500">Lỗi khi tải thẻ kho</td></tr>';
            }
        }

        function closeModalItemLogs() {
            document.getElementById('modal-item-logs')?.classList.add('hidden');
        }

        // --- SUB 6: DANH MỤC KHO HÀNG ---
        async function loadWarehousesList() {
            try {
                const res = await fetch('/api/warehouses/overview');
                const list = await res.json();
                const tbody = document.getElementById('table-warehouses-list');
                if (!list || list.length === 0) {
                    tbody.innerHTML = '<tr><td colspan="8" class="p-4 text-center text-gray-400">Chưa có kho hàng nào</td></tr>';
                    return;
                }

                tbody.innerHTML = list.map(w => {
                    const statusBadge = w.is_active 
                        ? '<span class="px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-100 text-emerald-700">Đang hoạt động</span>'
                        : '<span class="px-2 py-0.5 rounded text-[10px] font-bold bg-gray-100 text-gray-500">Tạm khóa</span>';

                    return `
                        <tr class="border-b hover:bg-gray-50 text-xs">
                            <td class="p-3 font-mono font-bold text-slate-600">${w.code || '-'}</td>
                            <td class="p-3 font-bold text-slate-800">${w.name}</td>
                            <td class="p-3 text-gray-500">${w.address || '-'}</td>
                            <td class="p-3 text-right font-medium">${(w.total_items || 0).toLocaleString('vi-VN')}</td>
                            <td class="p-3 text-right font-bold text-sky-700">${(w.total_quantity || 0).toLocaleString('vi-VN')}</td>
                            <td class="p-3 text-right font-bold text-rose-600">${formatMoney(w.total_value || 0)}</td>
                            <td class="p-3 text-center">${statusBadge}</td>
                            <td class="p-3 text-center">
                                <button onclick="openModalWarehouse(${w.id}, '${encodeURIComponent(w.name)}', '${w.code || ''}', '${encodeURIComponent(w.address || '')}', ${w.is_active})" class="px-2 py-1 bg-sky-50 hover:bg-sky-100 text-sky-700 rounded text-xs font-bold mr-1">✏️ Sửa</button>
                                ${w.id !== 1 ? `<button onclick="deleteWarehouse(${w.id}, '${encodeURIComponent(w.name)}')" class="px-2 py-1 bg-rose-50 hover:bg-rose-100 text-rose-700 rounded text-xs font-bold">🗑️ Xóa</button>` : ''}
                            </td>
                        </tr>
                    `;
                }).join('');
            } catch (e) {
                console.error("loadWarehousesList error:", e);
            }
        }

        function openModalWarehouse(id = null, encodedName = '', code = '', encodedAddress = '', isActive = 1) {
            const modal = document.getElementById('modal-warehouse');
            document.getElementById('modal-wh-id').value = id || '';
            document.getElementById('modal-wh-title').innerText = id ? 'Cập Nhật Kho Hàng' : 'Thêm Kho Hàng Mới';
            document.getElementById('modal-wh-name').value = id ? decodeURIComponent(encodedName) : '';
            document.getElementById('modal-wh-code').value = code || '';
            document.getElementById('modal-wh-address').value = id ? decodeURIComponent(encodedAddress) : '';
            document.getElementById('modal-wh-active').value = isActive ? '1' : '0';
            modal.classList.remove('hidden');
        }

        function closeModalWarehouse() {
            document.getElementById('modal-warehouse')?.classList.add('hidden');
        }

        async function saveWarehouse() {
            const id = document.getElementById('modal-wh-id').value;
            const name = document.getElementById('modal-wh-name').value.trim();
            const code = document.getElementById('modal-wh-code').value.trim();
            const address = document.getElementById('modal-wh-address').value.trim();
            const is_active = parseInt(document.getElementById('modal-wh-active').value) || 1;

            if (!name) {
                alert("Vui lòng nhập tên kho hàng!");
                return;
            }

            try {
                let res;
                if (id) {
                    res = await fetch(`/api/warehouses/${id}`, {
                        method: 'PUT',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ name, code, address, is_active })
                    });
                } else {
                    res = await fetch('/api/warehouses', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ name, code, address, is_active })
                    });
                }

                if (!res.ok) {
                    const err = await res.json();
                    alert("Lỗi: " + (err.detail || "Không thể lưu kho"));
                    return;
                }

                // Cập nhật lại biến toàn cục allWarehouses cho toàn hệ thống
                try {
                    const resWh = await fetch('/api/warehouses');
                    if (resWh.ok) window.allWarehouses = allWarehouses = await resWh.json();
                } catch (e) {}

                closeModalWarehouse();
                loadWarehousesList();
                window.showToast ? window.showToast("Đã lưu thông tin kho hàng thành công!", 'success') : alert("Đã lưu thông tin kho hàng thành công!");
            } catch (e) {
                console.error("saveWarehouse error:", e);
                alert("Lỗi kết nối khi lưu kho");
            }
        }

        async function deleteWarehouse(id, encodedName) {
            const name = decodeURIComponent(encodedName);
            let confirmed = false;
            if (typeof window.showConfirmModal === 'function') {
                confirmed = await window.showConfirmModal({
                    title: 'Xác Nhận Xóa Kho Hàng',
                    message: `Bạn có chắc chắn muốn xóa kho "${name}" không?`,
                    subMessage: 'Chỉ có thể xóa kho nếu kho không còn tồn đọng hàng hóa hoặc nguyên liệu.',
                    confirmText: 'Xác Nhận Xóa',
                    cancelText: 'Hủy bỏ',
                    type: 'danger',
                    icon: '🗑️'
                });
            } else if (typeof window.customConfirm === 'function') {
                confirmed = await window.customConfirm(`Bạn có chắc chắn muốn xóa kho "${name}"?`, 'Xác Nhận Xóa Kho Hàng', { type: 'danger', okText: 'Xóa Kho' });
            } else {
                confirmed = confirm(`Bạn có chắc chắn muốn xóa kho "${name}"?`);
            }
            if (!confirmed) return;

            try {
                const res = await fetch(`/api/warehouses/${id}`, { method: 'DELETE' });
                if (!res.ok) {
                    const err = await res.json();
                    alert("Không thể xóa: " + (err.detail || "Có lỗi xảy ra"));
                    return;
                }
                loadWarehousesList();
                if (typeof showToast === 'function') showToast(`Đã xóa kho "${name}" thành công!`, 'success');
                else alert("Đã xóa kho hàng thành công!");
            } catch (e) {
                console.error("deleteWarehouse error:", e);
                alert("Lỗi kết nối khi xóa kho");
            }
        }

        // --- SUB 4: KIỂM KÊ KHO ---
        let rawAuditWarehouseItems = [];
        let auditCategories = [];
        let selectedAuditCategories = []; // [] = toàn bộ kho
        let auditSearchKw = '';

        function generateAuditCodeDisplay() {
            const now = new Date();
            const dateStr = String(now.getDate()).padStart(2, '0') + String(now.getMonth() + 1).padStart(2, '0') + String(now.getFullYear()).slice(-2);
            const rand = Math.floor(100 + Math.random() * 900);
            const el = document.getElementById('audit-code-display');
            if (el) el.textContent = `KK-${dateStr}-${rand}`;
        }

        async function initStockAuditView() {
            generateAuditCodeDisplay();
            try {
                const res = await fetch('/api/warehouses');
                const allWarehouses = await res.json();
                const sel = document.getElementById('audit-wh-select');
                if (!sel) return;
                sel.innerHTML = allWarehouses.map(w => `<option value="${w.id}">${w.name} ${w.is_default ? '(Mặc định)' : ''}</option>`).join('');
                if (allWarehouses.length > 0) {
                    loadAuditItemsForWarehouse(allWarehouses[0].id);
                }
            } catch (e) {
                console.error("initStockAuditView error:", e);
            }
        }

        async function loadAuditItemsForWarehouse(whId) {
            if (!whId) {
                document.getElementById('table-audit-items').innerHTML = '<tr><td colspan="9" class="p-4 text-center text-gray-400">Vui lòng chọn kho</td></tr>';
                rawAuditWarehouseItems = [];
                currentAuditItems = [];
                auditCategories = [];
                selectedAuditCategories = [];
                updateAuditCatTriggerUI();
                return;
            }

            const tbody = document.getElementById('table-audit-items');
            tbody.innerHTML = '<tr><td colspan="9" class="p-4 text-center text-gray-400">Đang nạp dữ liệu hàng tồn kho...</td></tr>';

            try {
                const res = await fetch(`/api/inventory/unified?warehouse_id=${whId}`);
                const data = await res.json();
                
                rawAuditWarehouseItems = (data.items || []).map(item => {
                    let catName = item.category || (item.item_type === 'product' ? 'Hàng Hóa' : 'Nguyên Liệu');
                    return {
                        ...item,
                        category: catName,
                        actual_qty: item.quantity,
                        diff_qty: 0,
                        note: '',
                        is_selected: true
                    };
                });

                // Trích xuất danh sách danh mục duy nhất
                const catSet = new Set();
                rawAuditWarehouseItems.forEach(it => {
                    if (it.category) catSet.add(it.category);
                });
                auditCategories = Array.from(catSet);
                selectedAuditCategories = []; // Mặc định chọn tất cả
                
                renderAuditCatDropdownOptions();
                updateAuditCatTriggerUI();
                applyAuditFilterAndRender();
            } catch (e) {
                console.error("loadAuditItemsForWarehouse error:", e);
                tbody.innerHTML = '<tr><td colspan="9" class="p-4 text-center text-red-500">Lỗi nạp dữ liệu kiểm kê</td></tr>';
            }
        }

        // --- DROPLIST POPUP CHỌN NHIỀU NHÓM HÀNG ---
        function toggleAuditCatDropdown(e) {
            if (e) e.stopPropagation();
            const popup = document.getElementById('popup-audit-categories');
            if (!popup) return;
            const isHidden = popup.classList.contains('hidden');
            if (isHidden) {
                popup.classList.remove('hidden');
                document.getElementById('search-audit-cat')?.focus();
            } else {
                popup.classList.add('hidden');
            }
        }

        function closeAuditCatDropdown() {
            document.getElementById('popup-audit-categories')?.classList.add('hidden');
        }

        document.addEventListener('click', function(e) {
            const container = document.getElementById('container-audit-categories');
            if (container && !container.contains(e.target)) {
                closeAuditCatDropdown();
            }
        });

        function filterAuditCatDropdown() {
            const kw = (document.getElementById('search-audit-cat')?.value || '').trim().toLowerCase();
            renderAuditCatDropdownOptions(kw);
        }

        function renderAuditCatDropdownOptions(keyword = '') {
            const container = document.getElementById('list-audit-cat-options');
            if (!container) return;

            const filtered = auditCategories.filter(cat => !keyword || cat.toLowerCase().includes(keyword));

            if (filtered.length === 0) {
                container.innerHTML = '<div class="p-3 text-center text-gray-400 italic">Không tìm thấy nhóm hàng nào</div>';
                return;
            }

            container.innerHTML = filtered.map(cat => {
                const isChecked = selectedAuditCategories.length === 0 || selectedAuditCategories.includes(cat);
                const count = rawAuditWarehouseItems.filter(x => x.category === cat).length;
                return `
                    <label class="flex items-center justify-between p-1.5 hover:bg-sky-50 rounded cursor-pointer transition select-none group">
                        <div class="flex items-center gap-2">
                            <input type="checkbox" value="${cat}" ${isChecked ? 'checked' : ''} 
                                   onchange="onToggleAuditCatOption('${cat.replace(/'/g, "\\'")}', this.checked)"
                                   class="rounded text-sky-600 focus:ring-sky-500 w-3.5 h-3.5 cursor-pointer">
                            <span class="font-medium text-slate-800 group-hover:text-sky-700">${cat}</span>
                        </div>
                        <span class="text-[10px] text-gray-400 font-mono">${count} món</span>
                    </label>
                `;
            }).join('');
        }

        function onToggleAuditCatOption(catName, checked) {
            if (selectedAuditCategories.length === 0) {
                selectedAuditCategories = [...auditCategories];
            }

            if (checked) {
                if (!selectedAuditCategories.includes(catName)) selectedAuditCategories.push(catName);
            } else {
                selectedAuditCategories = selectedAuditCategories.filter(c => c !== catName);
            }

            if (selectedAuditCategories.length === auditCategories.length) {
                selectedAuditCategories = [];
            }

            renderAuditCatDropdownOptions(document.getElementById('search-audit-cat')?.value || '');
            updateAuditCatTriggerUI();
            applyAuditFilterAndRender();
        }

        function selectAllAuditCats(select) {
            if (select) {
                selectedAuditCategories = []; // Mặc định trống = Tất cả
            } else {
                selectedAuditCategories = ['__NONE__'];
            }
            renderAuditCatDropdownOptions(document.getElementById('search-audit-cat')?.value || '');
            updateAuditCatTriggerUI();
            applyAuditFilterAndRender();
        }

        function removeSelectedAuditCat(catName, e) {
            if (e) e.stopPropagation();
            if (selectedAuditCategories.length === 0) {
                selectedAuditCategories = auditCategories.filter(c => c !== catName);
            } else {
                selectedAuditCategories = selectedAuditCategories.filter(c => c !== catName);
            }
            renderAuditCatDropdownOptions(document.getElementById('search-audit-cat')?.value || '');
            updateAuditCatTriggerUI();
            applyAuditFilterAndRender();
        }

        function updateAuditCatTriggerUI() {
            const tagsBox = document.getElementById('audit-cat-selected-tags');
            const badgeEl = document.getElementById('audit-cat-count-badge');
            if (!tagsBox) return;

            if (selectedAuditCategories.length === 0) {
                tagsBox.innerHTML = '<span class="text-sky-700 font-semibold">📦 Toàn bộ nhóm mặt hàng (Kho)</span>';
                if (badgeEl) badgeEl.textContent = 'Toàn bộ kho';
                return;
            }

            if (selectedAuditCategories.includes('__NONE__')) {
                tagsBox.innerHTML = '<span class="text-gray-400 italic">Chưa chọn nhóm hàng nào</span>';
                if (badgeEl) badgeEl.textContent = '0 nhóm';
                return;
            }

            if (badgeEl) badgeEl.textContent = `${selectedAuditCategories.length}/${auditCategories.length} nhóm`;
            tagsBox.innerHTML = selectedAuditCategories.map(cat => `
                <span class="inline-flex items-center gap-1 bg-sky-50 text-sky-800 border border-sky-300 px-2 py-0.5 rounded text-[11px] font-medium shadow-xs">
                    <span>🏷️ ${cat}</span>
                    <button type="button" onclick="removeSelectedAuditCat('${cat.replace(/'/g, "\\'")}', event)" class="hover:text-rose-600 font-bold ml-0.5 text-xs">✕</button>
                </span>
            `).join('');
        }

        // --- LỌC BẢNG & TÌM KIẾM MẶT HÀNG ---
        function filterAuditTableItems() {
            auditSearchKw = (document.getElementById('audit-item-search')?.value || '').trim().toLowerCase();
            const clearBtn = document.getElementById('audit-item-search-clear');
            if (clearBtn) {
                if (auditSearchKw) clearBtn.classList.remove('hidden');
                else clearBtn.classList.add('hidden');
            }
            renderAuditTable();
        }

        function clearAuditItemSearch() {
            const input = document.getElementById('audit-item-search');
            if (input) input.value = '';
            auditSearchKw = '';
            document.getElementById('audit-item-search-clear')?.classList.add('hidden');
            input?.focus();
            renderAuditTable();
        }

        function applyAuditFilterAndRender() {
            if (selectedAuditCategories.length === 0) {
                currentAuditItems = [...rawAuditWarehouseItems];
            } else if (selectedAuditCategories.includes('__NONE__')) {
                currentAuditItems = [];
            } else {
                currentAuditItems = rawAuditWarehouseItems.filter(it => selectedAuditCategories.includes(it.category));
            }
            renderAuditTable();
        }

        function renderAuditTable() {
            const tbody = document.getElementById('table-audit-items');
            if (!tbody) return;

            const filtered = currentAuditItems.filter(it => {
                if (!auditSearchKw) return true;
                const code = (it.code || '').toLowerCase();
                const name = (it.name || '').toLowerCase();
                return code.includes(auditSearchKw) || name.includes(auditSearchKw);
            });

            if (filtered.length === 0) {
                tbody.innerHTML = '<tr><td colspan="9" class="p-6 text-center text-gray-400 italic">Không có mặt hàng nào phù hợp với phạm vi đang chọn</td></tr>';
                updateAuditStats();
                return;
            }

            tbody.innerHTML = filtered.map((item, idx) => {
                const diffColor = item.diff_qty > 0 ? 'text-emerald-600 font-bold' : (item.diff_qty < 0 ? 'text-rose-600 font-bold' : 'text-gray-500');
                const diffPrefix = item.diff_qty > 0 ? '+' : '';
                const isSelected = item.is_selected !== false;
                const rowClass = !isSelected ? 'border-b text-xs bg-slate-50/70 opacity-60' : (item.diff_qty !== 0 ? 'border-b text-xs bg-rose-50/40 hover:bg-rose-50/60' : 'border-b text-xs hover:bg-gray-50');

                return `
                    <tr id="audit-row-${item.id}-${item.item_type}" class="${rowClass}">
                        <td class="p-2 text-center">
                            <input type="checkbox" ${isSelected ? 'checked' : ''} 
                                   onchange="toggleAuditItemSelect(${item.id}, '${item.item_type}', this.checked)"
                                   class="rounded text-sky-600 cursor-pointer w-3.5 h-3.5" title="Chọn kiểm mặt hàng này">
                        </td>
                        <td class="p-2 text-gray-400 text-center font-mono">${idx + 1}</td>
                        <td class="p-2 font-mono font-bold text-slate-700">${item.code || '-'}</td>
                        <td class="p-2">
                            <div class="font-bold text-slate-800">${item.name}</div>
                            <div class="text-[10px] text-gray-400">${item.item_type === 'product' ? '📦 Hàng hóa' : '🧪 Nguyên liệu'}</div>
                        </td>
                        <td class="p-2">
                            <span class="inline-block bg-slate-100 text-slate-700 border border-slate-200 text-[10px] font-semibold px-1.5 py-0.5 rounded truncate max-w-[120px]">
                                ${item.category}
                            </span>
                        </td>
                        <td class="p-2 text-center text-gray-500">${item.unit || 'cái'}</td>
                        <td class="p-2 text-right font-medium text-slate-700 font-mono">${Number(item.quantity || 0).toLocaleString('vi-VN')}</td>
                        <td class="p-2 text-right">
                            <input type="number" step="any" value="${item.actual_qty}" 
                                   onkeydown="handleAuditKeyDown(event, ${idx})"
                                   oninput="updateAuditItemActual(${item.id}, '${item.item_type}', this.value)" 
                                   class="audit-actual-input border p-1 text-right font-bold font-mono w-24 rounded bg-amber-50 border-amber-300 focus:bg-white focus:border-sky-500 outline-none">
                        </td>
                        <td class="p-2 text-right ${diffColor} font-mono" id="audit-diff-${item.id}-${item.item_type}">
                            ${diffPrefix}${Number(item.diff_qty || 0).toLocaleString('vi-VN')}
                        </td>
                        <td class="p-2">
                            <input type="text" placeholder="Lý do lệch..." value="${item.note || ''}" 
                                   oninput="updateAuditItemNote(${item.id}, '${item.item_type}', this.value)" 
                                   class="border p-1 w-full rounded text-[11px] outline-none focus:border-sky-500">
                        </td>
                        <td class="p-2 text-center">
                            <button type="button" onclick="removeAuditItemFromList(${item.id}, '${item.item_type}')" 
                                    class="text-slate-400 hover:text-rose-600 font-bold text-xs p-1 rounded hover:bg-rose-50 transition" 
                                    title="Loại bỏ món này khỏi đợt kiểm kê">
                                ✕
                            </button>
                        </td>
                    </tr>
                `;
            }).join('');

            updateAuditStats();
        }

        // Bấm Enter tự động nhảy focus xuống ô tiếp theo
        function handleAuditKeyDown(e, currentIdx) {
            if (e.key === 'Enter') {
                e.preventDefault();
                const allInputs = document.querySelectorAll('.audit-actual-input');
                if (currentIdx + 1 < allInputs.length) {
                    allInputs[currentIdx + 1].focus();
                    allInputs[currentIdx + 1].select();
                }
            }
        }

        // Checkbox chọn món kiểm kê
        function toggleAuditItemSelect(id, itemType, checked) {
            const item = currentAuditItems.find(x => x.id === id && x.item_type === itemType);
            if (item) item.is_selected = checked;
            const rawIt = rawAuditWarehouseItems.find(x => x.id === id && x.item_type === itemType);
            if (rawIt) rawIt.is_selected = checked;

            const rowEl = document.getElementById(`audit-row-${id}-${itemType}`);
            if (rowEl) {
                if (!checked) {
                    rowEl.className = 'border-b text-xs bg-slate-50/70 opacity-60';
                } else {
                    const isDiff = item && item.diff_qty !== 0;
                    rowEl.className = isDiff ? 'border-b text-xs bg-rose-50/40 hover:bg-rose-50/60' : 'border-b text-xs hover:bg-gray-50';
                }
            }
            updateAuditStats();
        }

        function toggleSelectAllAuditItems(checked) {
            currentAuditItems.forEach(it => it.is_selected = checked);
            rawAuditWarehouseItems.forEach(it => it.is_selected = checked);
            renderAuditTable();
        }

        function selectAllAuditItems(select) {
            toggleSelectAllAuditItems(select);
        }

        function selectOnlyDiffAuditItems() {
            currentAuditItems.forEach(it => {
                it.is_selected = (it.diff_qty !== 0);
            });
            renderAuditTable();
        }

        function removeAuditItemFromList(id, itemType) {
            currentAuditItems = currentAuditItems.filter(x => !(x.id === id && x.item_type === itemType));
            rawAuditWarehouseItems = rawAuditWarehouseItems.filter(x => !(x.id === id && x.item_type === itemType));
            renderAuditTable();
        }

        // Cập nhật DOM cụ thể tại dòng (chống giật, không mất focus)
        function updateAuditItemActual(id, itemType, val) {
            const actual = parseFloat(val) || 0;
            const item = currentAuditItems.find(x => x.id === id && x.item_type === itemType);
            if (!item) return;

            item.actual_qty = actual;
            item.diff_qty = actual - item.quantity;
            item.is_selected = true; // Tự động đánh dấu chọn kiểm khi người dùng nhập số thực tế

            // Đồng bộ sang raw list
            const rawIt = rawAuditWarehouseItems.find(x => x.id === id && x.item_type === itemType);
            if (rawIt) {
                rawIt.actual_qty = actual;
                rawIt.diff_qty = item.diff_qty;
                rawIt.is_selected = true;
            }

            const diffEl = document.getElementById(`audit-diff-${id}-${itemType}`);
            const rowEl = document.getElementById(`audit-row-${id}-${itemType}`);
            const chkBox = rowEl?.querySelector('input[type="checkbox"]');
            if (chkBox) chkBox.checked = true;

            if (diffEl) {
                const diffColor = item.diff_qty > 0 ? 'text-emerald-600 font-bold' : (item.diff_qty < 0 ? 'text-rose-600 font-bold' : 'text-gray-500');
                const diffPrefix = item.diff_qty > 0 ? '+' : '';
                diffEl.textContent = `${diffPrefix}${item.diff_qty.toLocaleString('vi-VN')}`;
                diffEl.className = `p-2 text-right ${diffColor} font-mono`;
            }

            if (rowEl) {
                if (item.diff_qty !== 0) rowEl.className = 'border-b text-xs bg-rose-50/40 hover:bg-rose-50/60';
                else rowEl.className = 'border-b text-xs hover:bg-gray-50';
            }

            updateAuditStats();
        }

        function updateAuditItemNote(id, itemType, val) {
            const item = currentAuditItems.find(x => x.id === id && x.item_type === itemType);
            if (item) item.note = val;
            const rawIt = rawAuditWarehouseItems.find(x => x.id === id && x.item_type === itemType);
            if (rawIt) rawIt.note = val;
        }

        function quickSyncAuditToSystem() {
            currentAuditItems.forEach(it => {
                if (it.is_selected !== false) {
                    it.actual_qty = it.quantity;
                    it.diff_qty = 0;
                }
            });
            renderAuditTable();
        }

        function quickClearAuditActual() {
            currentAuditItems.forEach(it => {
                if (it.is_selected !== false) {
                    it.actual_qty = 0;
                    it.diff_qty = -it.quantity;
                }
            });
            renderAuditTable();
        }

        function updateAuditStats() {
            const selectedItems = currentAuditItems.filter(it => it.is_selected !== false);
            const diffItems = selectedItems.filter(it => it.diff_qty !== 0);
            const totalDiffQty = selectedItems.reduce((sum, it) => sum + (it.diff_qty || 0), 0);
            const matchedCount = selectedItems.length - diffItems.length;

            const sumSelectedEl = document.getElementById('audit-sum-selected');
            if (sumSelectedEl) sumSelectedEl.innerText = selectedItems.length.toLocaleString('vi-VN');
            const btnCountEl = document.getElementById('audit-btn-count');
            if (btnCountEl) btnCountEl.innerText = selectedItems.length.toLocaleString('vi-VN');

            document.getElementById('audit-sum-count').innerText = currentAuditItems.length.toLocaleString('vi-VN');
            document.getElementById('audit-sum-match').innerText = matchedCount.toLocaleString('vi-VN');
            document.getElementById('audit-sum-diff-items').innerText = `${diffItems.length} món`;

            const sumDiffEl = document.getElementById('audit-sum-diff');
            if (sumDiffEl) {
                sumDiffEl.innerText = (totalDiffQty > 0 ? '+' : '') + totalDiffQty.toLocaleString('vi-VN');
                sumDiffEl.className = totalDiffQty > 0 ? 'font-bold text-emerald-600' : (totalDiffQty < 0 ? 'font-bold text-rose-600' : 'font-bold text-slate-800');
            }

            const chkAll = document.getElementById('chk-audit-select-all');
            if (chkAll) {
                chkAll.checked = currentAuditItems.length > 0 && selectedItems.length === currentAuditItems.length;
            }
        }

        // --- MODAL LỊCH SỬ KIỂM KÊ ---
        function openModalAuditHistory() {
            document.getElementById('modal-audit-history')?.classList.remove('hidden');
            loadStockAuditsList();
        }

        function closeModalAuditHistory() {
            document.getElementById('modal-audit-history')?.classList.add('hidden');
        }

        async function submitStockAudit() {
            const whId = parseInt(document.getElementById('audit-wh-select').value);
            if (!whId) {
                if (window.showToast) window.showToast("Vui lòng chọn kho kiểm kê!", "warning");
                else alert("Vui lòng chọn kho kiểm kê!");
                return;
            }

            const selectedAuditItems = currentAuditItems.filter(it => it.is_selected !== false);
            if (!selectedAuditItems || selectedAuditItems.length === 0) {
                if (window.showToast) window.showToast("Vui lòng chọn ít nhất 1 mặt hàng để kiểm kê và cân bằng kho!", "warning");
                else alert("Vui lòng chọn ít nhất 1 mặt hàng để kiểm kê và cân bằng kho!");
                return;
            }

            const scopeDesc = selectedAuditItems.length === currentAuditItems.length ? "toàn bộ danh mục đang xem" : `${selectedAuditItems.length} mặt hàng đã chọn`;
            const note = document.getElementById('audit-note').value.trim();
            const itemsPayload = selectedAuditItems.map(it => ({
                item_type: it.item_type,
                item_id: it.id,
                product_id: it.item_type === 'product' ? it.id : null,
                ingredient_id: it.item_type === 'ingredient' ? it.id : null,
                system_qty: it.quantity,
                actual_qty: it.actual_qty,
                diff_qty: it.diff_qty,
                note: it.note || ''
            }));

            const confirmed = await window.showConfirmModal({
                title: 'Xác Nhận Cân Bằng Kho',
                message: `Xác nhận cân bằng kho cho ${itemsPayload.length} mặt hàng đã chọn (${scopeDesc})?`,
                subMessage: 'Các mặt hàng không chọn sẽ được GIỮ NGUYÊN tồn kho hiện tại.',
                type: 'warning',
                confirmText: 'Cân Bằng Kho',
                cancelText: 'Hủy bỏ',
                icon: '⚖️'
            });
            if (!confirmed) return;

            try {
                const res = await fetch('/api/inventory/audit', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        warehouse_id: whId,
                        note: note || `Kiểm kê kho (${scopeDesc})`,
                        items: itemsPayload
                    })
                });

                if (!res.ok) {
                    const err = await res.json();
                    if (window.showToast) window.showToast("Lỗi kiểm kê: " + (err.detail || "Không thể lưu phiếu"), "error");
                    else alert("Lỗi kiểm kê: " + (err.detail || "Không thể lưu phiếu"));
                    return;
                }

                const result = await res.json();
                if (window.showToast) window.showToast(`Đã hoàn tất kiểm kê kho! Mã phiếu: ${result.audit_code}`, "success");
                else alert(`Đã hoàn tất kiểm kê kho! Mã phiếu: ${result.audit_code}`);
                
                // Reset tờ phiếu mới
                document.getElementById('audit-note').value = '';
                generateAuditCodeDisplay();
                await loadAuditItemsForWarehouse(whId);
                await loadUnifiedInventory();
            } catch (e) {
                console.error("submitStockAudit error:", e);
                if (window.showToast) window.showToast("Lỗi kết nối khi gửi phiếu kiểm kê", "error");
                else alert("Lỗi kết nối khi gửi phiếu kiểm kê");
            }
        }

        async function loadStockAuditsList() {
            const tbody = document.getElementById('table-audit-history');
            tbody.innerHTML = '<tr><td colspan="7" class="p-4 text-center text-gray-400">Đang tải lịch sử phiếu kiểm...</td></tr>';
            try {
                const res = await fetch('/api/inventory/audits');
                const list = await res.json();
                if (!list || list.length === 0) {
                    tbody.innerHTML = '<tr><td colspan="7" class="p-4 text-center text-gray-400">Chưa có phiếu kiểm kê nào</td></tr>';
                    return;
                }

                tbody.innerHTML = list.map(a => {
                    const diffColor = a.total_diff > 0 ? 'text-emerald-600 font-bold' : (a.total_diff < 0 ? 'text-rose-600 font-bold' : 'text-gray-500');
                    const diffPrefix = a.total_diff > 0 ? '+' : '';

                    return `
                        <tr class="border-b hover:bg-gray-50 text-xs">
                            <td class="p-2.5 font-mono font-bold text-indigo-700">${a.audit_code}</td>
                            <td class="p-2.5 text-gray-500 whitespace-nowrap">${formatDateTime(a.created_at) || '-'}</td>
                            <td class="p-2.5 font-bold text-slate-800">${a.warehouse_name || 'Kho'}</td>
                            <td class="p-2.5 text-right font-medium">${(a.items_count || 0).toLocaleString('vi-VN')} món</td>
                            <td class="p-2.5 text-right ${diffColor}">${diffPrefix}${(a.total_diff || 0).toLocaleString('vi-VN')}</td>
                            <td class="p-2.5 text-gray-500">${a.note || '-'}</td>
                            <td class="p-2.5 text-center flex items-center justify-center gap-1">
                                <button onclick="viewAuditDetail(${a.id})" class="px-2 py-1 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 rounded text-[11px] font-bold">
                                    👁️ Xem
                                </button>
                                <button onclick="printStockAuditA4(${a.id})" class="px-2 py-1 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded text-[11px] font-bold" title="In Phiếu Kiểm Kê A4">
                                    🖨️ In
                                </button>
                            </td>
                        </tr>
                    `;
                }).join('');
            } catch (e) {
                console.error("loadStockAuditsList error:", e);
            }
        }

        let currentViewedAuditId = null;

        async function viewAuditDetail(auditId) {
            currentViewedAuditId = auditId;
            const modal = document.getElementById('modal-audit-detail');
            modal.classList.remove('hidden');
            const tbody = document.getElementById('view-audit-items');
            tbody.innerHTML = '<tr><td colspan="7" class="p-4 text-center text-gray-400">Đang tải chi tiết phiếu...</td></tr>';

            try {
                const res = await fetch(`/api/inventory/audits/${auditId}`);
                const data = await res.json();
                document.getElementById('view-audit-code').innerText = data.audit_code;
                document.getElementById('view-audit-date').innerText = 'Thời gian: ' + (formatDateTime(data.created_at) || '-');
                document.getElementById('view-audit-wh').innerText = data.warehouse_name;
                document.getElementById('view-audit-note').innerText = data.note || 'Không có';

                tbody.innerHTML = (data.items || []).map((it, idx) => {
                    const diffColor = it.diff_qty > 0 ? 'text-emerald-600 font-bold' : (it.diff_qty < 0 ? 'text-rose-600 font-bold' : 'text-gray-500');
                    const diffPrefix = it.diff_qty > 0 ? '+' : '';

                    return `
                        <tr class="border-b text-[11px]">
                            <td class="p-2 text-gray-400 text-center">${idx + 1}</td>
                            <td class="p-2 font-mono font-bold text-slate-600">${it.code || '-'}</td>
                            <td class="p-2 font-bold text-slate-800">${it.name}</td>
                            <td class="p-2 text-gray-500">${it.unit || 'cái'}</td>
                            <td class="p-2 text-right font-medium">${it.system_qty.toLocaleString('vi-VN')}</td>
                            <td class="p-2 text-right font-bold text-slate-800">${it.actual_qty.toLocaleString('vi-VN')}</td>
                            <td class="p-2 text-right ${diffColor}">${diffPrefix}${it.diff_qty.toLocaleString('vi-VN')}</td>
                        </tr>
                    `;
                }).join('');
            } catch (e) {
                console.error("viewAuditDetail error:", e);
            }
        }

        async function printStockAuditA4(auditId) {
            const id = auditId || currentViewedAuditId;
            if (!id) {
                if (window.showToast) window.showToast("Không tìm thấy thông tin phiếu kiểm kê!", "error");
                return;
            }

            try {
                const res = await fetch(`/api/inventory/audits/${id}`);
                if (!res.ok) throw new Error("Không thể tải chi tiết phiếu kiểm");
                const data = await res.json();

                const company = window.companySettings || {};
                const storeName = company.shop_name || company.app_name || 'HỆ THỐNG PET CARE';
                const storeAddr = company.shop_address || 'Nha Trang, Khánh Hòa';
                const storePhone = company.shop_phone || '';

                const items = data.items || [];
                let totalSys = 0;
                let totalAct = 0;
                let totalDiffPos = 0;
                let totalDiffNeg = 0;

                const rowsHtml = items.map((it, idx) => {
                    totalSys += (it.system_qty || 0);
                    totalAct += (it.actual_qty || 0);
                    const diff = (it.diff_qty || 0);
                    if (diff > 0) totalDiffPos += diff;
                    else if (diff < 0) totalDiffNeg += Math.abs(diff);

                    const diffStr = diff > 0 ? `+${diff.toLocaleString('vi-VN')}` : diff.toLocaleString('vi-VN');

                    return `
                        <tr>
                            <td style="text-align: center; font-size: 11px; border: 1px solid #000; padding: 4px;">${idx + 1}</td>
                            <td style="font-family: monospace; font-size: 11px; font-weight: bold; border: 1px solid #000; padding: 4px;">${it.code || '-'}</td>
                            <td style="font-weight: bold; font-size: 12px; border: 1px solid #000; padding: 4px;">${it.name}</td>
                            <td style="text-align: center; font-size: 11px; border: 1px solid #000; padding: 4px;">${it.unit || 'cái'}</td>
                            <td style="text-align: right; font-family: monospace; font-size: 12px; border: 1px solid #000; padding: 4px;">${(it.system_qty || 0).toLocaleString('vi-VN')}</td>
                            <td style="text-align: right; font-family: monospace; font-size: 12px; font-weight: bold; border: 1px solid #000; padding: 4px;">${(it.actual_qty || 0).toLocaleString('vi-VN')}</td>
                            <td style="text-align: right; font-family: monospace; font-size: 12px; font-weight: bold; border: 1px solid #000; padding: 4px;">${diffStr}</td>
                        </tr>
                    `;
                }).join('');

                const printHtml = `
                    <div style="width: 190mm; max-width: 190mm; margin: 0 auto; font-family: 'Times New Roman', Times, serif; font-size: 12px; line-height: 1.4; color: #000; padding: 4mm;">
                        <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 12px;">
                            <div style="max-width: 65%;">
                                <div style="font-weight: bold; text-transform: uppercase; font-size: 13px;">${storeName}</div>
                                <div style="font-size: 11px;">Địa chỉ: ${storeAddr}</div>
                                ${storePhone ? `<div style="font-size: 11px;">Điện thoại: ${storePhone}</div>` : ''}
                            </div>
                            <div style="text-align: right; font-size: 11px;">
                                <div>Mã phiếu: <strong style="font-family: monospace; font-size: 13px;">${data.audit_code || '-'}</strong></div>
                                <div>Ngày kiểm: ${formatDateTime(data.created_at) || '-'}</div>
                            </div>
                        </div>

                        <div style="text-align: center; margin-bottom: 14px;">
                            <h1 style="margin: 0; font-size: 20px; font-weight: bold; text-transform: uppercase; letter-spacing: 1px;">PHIẾU KIỂM KÊ KHO HÀNG</h1>
                            <div style="font-style: italic; font-size: 12px; margin-top: 4px;">Kho kiểm: <strong>${data.warehouse_name || 'Kho'}</strong> | Ghi chú: ${data.note || 'Không có'}</div>
                        </div>

                        <table style="width: 100%; border-collapse: collapse; margin-bottom: 15px;">
                            <thead>
                                <tr style="background: #f0f0f0;">
                                    <th style="border: 1px solid #000; padding: 6px 4px; width: 35px; text-align: center;">STT</th>
                                    <th style="border: 1px solid #000; padding: 6px 4px; width: 85px; text-align: left;">Mã SKU</th>
                                    <th style="border: 1px solid #000; padding: 6px 4px; text-align: left;">Tên Mặt Hàng / Vật Tư</th>
                                    <th style="border: 1px solid #000; padding: 6px 4px; width: 50px; text-align: center;">ĐVT</th>
                                    <th style="border: 1px solid #000; padding: 6px 4px; width: 75px; text-align: right;">Tồn HT</th>
                                    <th style="border: 1px solid #000; padding: 6px 4px; width: 75px; text-align: right;">Tồn Thực</th>
                                    <th style="border: 1px solid #000; padding: 6px 4px; width: 75px; text-align: right;">Lệch (+/-)</th>
                                </tr>
                            </thead>
                            <tbody>
                                ${rowsHtml}
                                <tr style="font-weight: bold; background: #fafafa;">
                                    <td colspan="4" style="border: 1px solid #000; padding: 6px; text-align: right;">Tổng cộng (${items.length} mặt hàng):</td>
                                    <td style="border: 1px solid #000; padding: 6px; text-align: right; font-family: monospace;">${totalSys.toLocaleString('vi-VN')}</td>
                                    <td style="border: 1px solid #000; padding: 6px; text-align: right; font-family: monospace;">${totalAct.toLocaleString('vi-VN')}</td>
                                    <td style="border: 1px solid #000; padding: 6px; text-align: right; font-family: monospace;">
                                        ${totalDiffPos > 0 ? `+${totalDiffPos.toLocaleString('vi-VN')}` : ''}${totalDiffNeg > 0 ? ` / -${totalDiffNeg.toLocaleString('vi-VN')}` : ''}
                                    </td>
                                </tr>
                            </tbody>
                        </table>

                        <div style="display: flex; justify-content: space-between; text-align: center; font-size: 12px; margin-top: 25px; page-break-inside: avoid;">
                            <div style="width: 32%;">
                                <div style="font-weight: bold;">Trưởng Ban Kiểm Kê</div>
                                <div style="font-style: italic; font-size: 10.5px;">(Ký, họ tên)</div>
                                <div style="height: 60px;"></div>
                            </div>
                            <div style="width: 32%;">
                                <div style="font-weight: bold;">Thủ Kho</div>
                                <div style="font-style: italic; font-size: 10.5px;">(Ký, họ tên)</div>
                                <div style="height: 60px;"></div>
                            </div>
                            <div style="width: 32%;">
                                <div style="font-weight: bold;">Kế Toán Kho</div>
                                <div style="font-style: italic; font-size: 10.5px;">(Ký, họ tên)</div>
                                <div style="height: 60px;"></div>
                            </div>
                        </div>
                    </div>
                `;

                let iframe = document.getElementById('iframe-stock-audit-print');
                if (!iframe) {
                    iframe = document.createElement('iframe');
                    iframe.id = 'iframe-stock-audit-print';
                    iframe.style.position = 'fixed';
                    iframe.style.left = '-9999px';
                    iframe.style.top = '-9999px';
                    iframe.style.width = '0';
                    iframe.style.height = '0';
                    document.body.appendChild(iframe);
                }

                let isBoldStockAudit = false;
                try {
                    const boldCfg = window.printBoldConfigs || (window.companySettings && window.companySettings.print_bold_configs ? (typeof window.companySettings.print_bold_configs === 'string' ? JSON.parse(window.companySettings.print_bold_configs) : window.companySettings.print_bold_configs) : null);
                    if (boldCfg && boldCfg.stock_audit !== undefined) {
                        isBoldStockAudit = !!boldCfg.stock_audit;
                    }
                } catch(e) {}

                const boldStyles = isBoldStockAudit ? `
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
                        <title>Phiếu Kiểm Kê - ${data.audit_code}</title>
                        <style>
                            @page { size: A4 portrait; margin: 8mm 10mm; }
                            ${boldStyles}
                            table { width: 100%; border-collapse: collapse; }
                            th, td { border: 1px solid #000; padding: 5px; }
                            @media print {
                                html, body { margin: 0; padding: 0; background: #fff; }
                            }
                        </style>
                    </head>
                    <body>
                        ${printHtml}
                    </body>
                    </html>
                `);
                doc.close();

                setTimeout(() => {
                    try {
                        iframe.contentWindow.focus();
                        iframe.contentWindow.print();
                    } catch(e) {
                        console.error('Lỗi in phiếu kiểm kê:', e);
                    }
                }, 300);

            } catch (err) {
                console.error("printStockAuditA4 error:", err);
                if (window.showToast) window.showToast("Không thể in phiếu kiểm kê!", "error");
            }
        }

        function closeModalAuditDetail() {
            document.getElementById('modal-audit-detail')?.classList.add('hidden');
        }

        // --- SUB 5: CHUYỂN KHO ---
        function toggleTransferView(view) {
            if (view === 'create') {
                document.getElementById('transfer-create-view').classList.remove('hidden');
                document.getElementById('transfer-list-view').classList.add('hidden');
                document.getElementById('btn-transfer-create').className = 'bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs px-3 py-2 rounded shadow flex items-center gap-1';
                document.getElementById('btn-transfer-list').className = 'bg-slate-700 hover:bg-slate-800 text-white font-bold text-xs px-3 py-2 rounded shadow flex items-center gap-1';
            } else {
                document.getElementById('transfer-create-view').classList.add('hidden');
                document.getElementById('transfer-list-view').classList.remove('hidden');
                document.getElementById('btn-transfer-create').className = 'bg-slate-700 hover:bg-slate-800 text-white font-bold text-xs px-3 py-2 rounded shadow flex items-center gap-1';
                document.getElementById('btn-transfer-list').className = 'bg-sky-600 hover:bg-sky-700 text-white font-bold text-xs px-3 py-2 rounded shadow flex items-center gap-1';
                loadStockTransfersList();
            }
        }

        async function initStockTransferView() {
            toggleTransferView('create');
            try {
                const res = await fetch('/api/warehouses');
                allWarehouses = await res.json();
                const fromSel = document.getElementById('transfer-from-wh');
                const toSel = document.getElementById('transfer-to-wh');

                const opts = allWarehouses.map(w => `<option value="${w.id}">${w.name}</option>`).join('');
                fromSel.innerHTML = opts;
                toSel.innerHTML = opts;

                if (allWarehouses.length > 1) {
                    toSel.value = allWarehouses[1].id;
                }

                currentTransferRows = [];
                onTransferFromChange();
            } catch (e) {
                console.error("initStockTransferView error:", e);
            }
        }

        async function onTransferFromChange() {
            const whId = document.getElementById('transfer-from-wh').value;
            if (!whId) return;

            try {
                const res = await fetch(`/api/inventory/unified?warehouse_id=${whId}`);
                const data = await res.json();
                transferSourceItems = (data.items || []).filter(it => it.quantity > 0);
                currentTransferRows = [];
                const searchInp = document.getElementById('transfer-search-input');
                if (searchInp) searchInp.value = '';
                const resBox = document.getElementById('transfer-search-results');
                if (resBox) resBox.classList.add('hidden');
                const hint = document.getElementById('transfer-wh-hint');
                if (hint) {
                    hint.innerText = `Đang hiển thị ${transferSourceItems.length} mặt hàng còn tồn (>0) tại kho này`;
                }
                renderTransferRows();
            } catch (e) {
                console.error("onTransferFromChange error:", e);
            }
        }

        function showTransferQuickSearchDropdown() {
            const input = document.getElementById('transfer-search-input');
            filterTransferSearch(input ? input.value : '');
            document.getElementById('transfer-search-results')?.classList.remove('hidden');
        }
        window.showTransferQuickSearchDropdown = showTransferQuickSearchDropdown;

        function filterTransferSearch(val) {
            const resBox = document.getElementById('transfer-search-results');
            if (!resBox) return;

            const fromWh = document.getElementById('transfer-from-wh')?.value;
            if (!fromWh) {
                resBox.innerHTML = `
                    <div class="p-3 text-center text-amber-800 bg-amber-50 font-bold">
                        ⚠️ Vui lòng chọn Kho Xuất ở ô bên trên trước!
                    </div>
                `;
                resBox.classList.remove('hidden');
                return;
            }

            if (!transferSourceItems || transferSourceItems.length === 0) {
                resBox.innerHTML = `
                    <div class="p-3 text-center text-gray-500 italic">
                        Kho xuất không có mặt hàng nào còn tồn (>0)
                    </div>
                `;
                resBox.classList.remove('hidden');
                return;
            }

            const q = (val || '').toLowerCase().trim();
            const matches = [];

            transferSourceItems.forEach(item => {
                const searchText = `${item.name} ${item.sku || item.code || ''} ${item.unit || ''}`.toLowerCase();
                if (!q || (typeof fuzzyMatch === 'function' && fuzzyMatch(q, searchText)) || searchText.includes(q)) {
                    matches.push(item);
                }
            });

            if (matches.length === 0) {
                resBox.innerHTML = `
                    <div class="p-3 text-center text-gray-500 italic">
                        Không tìm thấy mặt hàng phù hợp trong kho xuất
                    </div>
                `;
                resBox.classList.remove('hidden');
                return;
            }

            // Phân tách 2 nhóm như màn OEM: Nhóm chưa chọn & Nhóm đã có trong phiếu
            const existingQtyMap = new Map();
            currentTransferRows.forEach(r => {
                existingQtyMap.set(`${r.item_type}_${r.item_id}`, r.quantity);
            });

            const unselectedList = [];
            const selectedList = [];

            matches.forEach(item => {
                const key = `${item.item_type}_${item.id}`;
                if (existingQtyMap.has(key)) {
                    selectedList.push(item);
                } else {
                    unselectedList.push(item);
                }
            });

            let html = '';

            // 1. NHÓM CHƯA CHỌN VÀO PHIẾU
            if (unselectedList.length > 0) {
                html += `
                    <div class="bg-slate-50 px-3 py-1.5 text-[10px] font-bold text-slate-500 uppercase tracking-wider flex items-center justify-between">
                        <span>📦 Chưa chọn vào phiếu (${unselectedList.length})</span>
                        <span class="text-slate-400 italic font-normal">Click để thêm nhanh</span>
                    </div>
                `;
                html += unselectedList.slice(0, 30).map(m => {
                    const isProd = m.item_type === 'product';
                    const badge = isProd 
                        ? '<span class="bg-sky-100 text-sky-700 px-1.5 py-0.5 rounded text-[10px] font-bold">Hàng Hóa</span>'
                        : '<span class="bg-emerald-100 text-emerald-700 px-1.5 py-0.5 rounded text-[10px] font-bold">Nguyên Liệu</span>';

                    return `
                    <div onclick="addTransferItemFromSearch('${m.item_type}', ${m.id})" class="p-2.5 hover:bg-sky-50 cursor-pointer flex justify-between items-center transition group">
                        <div class="flex items-center gap-2.5">
                            <span class="w-7 h-7 rounded-lg ${isProd ? 'bg-sky-500' : 'bg-emerald-600'} text-white flex items-center justify-center font-bold text-xs shrink-0">${isProd ? '📦' : '🧪'}</span>
                            <div>
                                <div class="font-bold text-slate-800 group-hover:text-sky-900 text-xs">${m.name}</div>
                                <div class="text-[11px] text-gray-500 font-mono">Mã: ${m.sku || m.code || '---'} | ĐVT: <strong class="text-slate-700">${m.unit}</strong> • ${badge}</div>
                            </div>
                        </div>
                        <div class="text-right flex items-center gap-2.5 shrink-0">
                            <div>
                                <div class="text-[10px] text-gray-400">Tồn kho xuất:</div>
                                <div class="font-bold text-sky-700 font-mono text-xs">${m.quantity.toLocaleString('vi-VN')} <span class="text-[10px] font-normal text-slate-500">${m.unit}</span></div>
                            </div>
                            <span class="text-xs bg-slate-100 group-hover:bg-sky-600 group-hover:text-white px-2.5 py-1 rounded-md font-bold transition">
                                + Thêm
                            </span>
                        </div>
                    </div>
                    `;
                }).join('');
            }

            // 2. NHÓM ĐÃ CÓ TRONG PHIẾU (LÀM MỜ VÀ ĐẨY XUỐNG DƯỚI)
            if (selectedList.length > 0) {
                html += `
                    <div class="bg-emerald-50/70 px-3 py-1.5 text-[10px] font-bold text-emerald-800 uppercase tracking-wider flex items-center justify-between border-t border-emerald-200">
                        <span>✓ Đã có trong phiếu (${selectedList.length})</span>
                        <span class="text-emerald-600 font-normal">Click để tăng thêm SL</span>
                    </div>
                `;
                html += selectedList.slice(0, 30).map(m => {
                    const isProd = m.item_type === 'product';
                    const currentQty = existingQtyMap.get(`${m.item_type}_${m.id}`) || 0;
                    return `
                    <div onclick="addTransferItemFromSearch('${m.item_type}', ${m.id})" class="p-2.5 bg-slate-50/60 hover:bg-emerald-50/60 cursor-pointer flex justify-between items-center transition opacity-60 hover:opacity-100 group border-l-4 border-l-emerald-500">
                        <div class="flex items-center gap-2.5">
                            <span class="w-7 h-7 rounded-lg bg-emerald-100 text-emerald-800 flex items-center justify-center font-bold text-xs shrink-0">✓</span>
                            <div>
                                <div class="font-bold text-slate-700 line-through decoration-slate-400 group-hover:no-underline text-xs">${m.name}</div>
                                <div class="text-[10px] text-slate-500 flex items-center gap-1.5 mt-0.5">
                                    <span>ĐVT: ${m.unit}</span>
                                    <span class="px-1.5 py-0.5 rounded bg-emerald-100 text-emerald-800 font-bold border border-emerald-300 text-[10px]">Đã chuyển: ${currentQty.toLocaleString('vi-VN')} ${m.unit}</span>
                                    <span class="text-gray-400">(Tồn: ${m.quantity.toLocaleString('vi-VN')})</span>
                                </div>
                            </div>
                        </div>
                        <div class="text-right shrink-0">
                            <span class="text-xs bg-slate-200 group-hover:bg-emerald-600 group-hover:text-white text-slate-700 px-2.5 py-1 rounded-md font-bold transition">
                                + Tăng SL
                            </span>
                        </div>
                    </div>
                    `;
                }).join('');
            }

            resBox.innerHTML = html;
            resBox.classList.remove('hidden');
        }
        window.filterTransferSearch = filterTransferSearch;

        function addTransferItemFromSearch(type, targetId) {
            const found = (transferSourceItems || []).find(it => it.item_type === type && it.id === targetId);
            if (!found) return;

            let targetIdx = -1;
            const existing = currentTransferRows.find((x, idx) => {
                if (x.item_type === type && x.item_id === targetId) {
                    targetIdx = idx;
                    return true;
                }
                return false;
            });

            if (existing) {
                if (existing.quantity < found.quantity) {
                    existing.quantity += 1;
                } else {
                    if (window.showToast) window.showToast(`Đã đạt số lượng tồn kho tối đa (${found.quantity} ${found.unit})`, 'warning');
                }
            } else {
                currentTransferRows.push({
                    item_key: `${type}_${targetId}`,
                    item_type: type,
                    item_id: targetId,
                    name: found.name,
                    sku: found.sku || found.code || '',
                    stock: found.quantity,
                    unit: found.unit,
                    quantity: 1
                });
                targetIdx = currentTransferRows.length - 1;
            }

            renderTransferRows();

            // Focus vào ô số lượng của dòng vừa chọn
            setTimeout(() => {
                const rows = document.querySelectorAll('#table-transfer-rows tr');
                if (rows && rows[targetIdx]) {
                    const qtyInp = rows[targetIdx].querySelector('input[type="number"]');
                    if (qtyInp) {
                        qtyInp.focus();
                        qtyInp.select();
                    }
                }
            }, 50);

            // Xóa input và ẩn dropdown tìm kiếm
            const searchInput = document.getElementById('transfer-search-input');
            if (searchInput) searchInput.value = '';
            document.getElementById('transfer-search-results')?.classList.add('hidden');
        }
        window.addTransferItemFromSearch = addTransferItemFromSearch;

        // Đóng dropdown tìm kiếm khi click ngoài
        document.addEventListener('click', function(e) {
            const wrap = document.getElementById('transfer-search-wrapper');
            const resBox = document.getElementById('transfer-search-results');
            if (wrap && resBox && !wrap.contains(e.target)) {
                resBox.classList.add('hidden');
            }
        });

        function removeTransferRow(idx) {
            currentTransferRows.splice(idx, 1);
            renderTransferRows();
        }

        function renderTransferRows() {
            const tbody = document.getElementById('table-transfer-rows');
            const badgeCount = document.getElementById('transfer-rows-count-badge');
            if (badgeCount) badgeCount.innerText = `${currentTransferRows.length} mặt hàng`;

            if (!currentTransferRows || currentTransferRows.length === 0) {
                tbody.innerHTML = '<tr><td colspan="7" class="p-6 text-center text-gray-400">Chưa có mặt hàng nào. Gõ vào ô <b>"🔍 Thêm Hàng Chuyển"</b> ở trên để chọn.</td></tr>';
                return;
            }

            tbody.innerHTML = currentTransferRows.map((row, idx) => {
                const isProd = row.item_type === 'product';
                const badge = isProd 
                    ? '<span class="px-2 py-0.5 rounded text-[10px] font-bold bg-sky-100 text-sky-700">Hàng Hóa</span>'
                    : '<span class="px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-100 text-emerald-700">Nguyên Liệu</span>';

                return `
                    <tr class="border-b text-xs hover:bg-slate-50/50 transition">
                        <td class="p-2 text-center text-gray-400 font-bold">${idx + 1}</td>
                        <td class="p-2">
                            <div class="flex items-center gap-2">
                                <span class="w-6 h-6 rounded ${isProd ? 'bg-sky-500' : 'bg-emerald-600'} text-white flex items-center justify-center font-bold text-xs shrink-0">${isProd ? '📦' : '🧪'}</span>
                                <div>
                                    <div class="font-bold text-slate-800 text-xs">${row.name}</div>
                                    <div class="text-[10px] text-gray-400 font-mono">Mã: ${row.sku || '---'}</div>
                                </div>
                            </div>
                        </td>
                        <td class="p-2 text-center">${badge}</td>
                        <td class="p-2 text-right font-bold text-slate-700 font-mono">${row.stock.toLocaleString('vi-VN')}</td>
                        <td class="p-2 text-right">
                            <input type="number" step="any" min="0.001" max="${row.stock}" value="${row.quantity}" 
                                   oninput="currentTransferRows[${idx}].quantity = parseFloat(this.value) || 0" 
                                   class="border p-1 text-right font-bold w-24 rounded bg-sky-50 border-sky-300 focus:outline-none focus:ring-1 focus:ring-sky-500 font-mono">
                        </td>
                        <td class="p-2 text-gray-500">${row.unit || 'cái'}</td>
                        <td class="p-2 text-center">
                            <button type="button" onclick="removeTransferRow(${idx})" class="p-1 text-slate-400 hover:text-rose-600 font-bold rounded hover:bg-rose-50 transition" title="Xóa dòng này">🗑️</button>
                        </td>
                    </tr>
                `;
            }).join('');
        }

        let currentEditingTransferId = null;

        async function submitStockTransfer() {
            const fromWhEl = document.getElementById('transfer-from-wh');
            const toWhEl = document.getElementById('transfer-to-wh');
            const fromWh = parseInt(fromWhEl?.value);
            const toWh = parseInt(toWhEl?.value);
            const note = document.getElementById('transfer-note')?.value.trim() || '';

            if (!fromWh || !toWh) {
                if (window.showToast) window.showToast("⚠️ Vui lòng chọn cả kho xuất và kho nhập!", "warning");
                else alert("Vui lòng chọn cả kho xuất và kho nhập!");
                return;
            }

            if (fromWh === toWh) {
                if (window.showToast) window.showToast("⚠️ Kho xuất và kho nhập phải khác nhau!", "warning");
                else alert("Kho xuất và kho nhập phải khác nhau!");
                return;
            }

            if (!currentTransferRows || currentTransferRows.length === 0) {
                if (window.showToast) window.showToast("⚠️ Vui lòng thêm ít nhất một mặt hàng để chuyển!", "warning");
                else alert("Vui lòng thêm ít nhất một mặt hàng để chuyển!");
                return;
            }

            for (const r of currentTransferRows) {
                if (r.quantity <= 0) {
                    if (window.showToast) window.showToast(`⚠️ Số lượng chuyển cho "${r.name}" phải lớn hơn 0!`, "warning");
                    else alert(`Số lượng chuyển cho "${r.name}" phải lớn hơn 0!`);
                    return;
                }
                if (r.quantity > r.stock) {
                    if (window.showToast) window.showToast(`⚠️ Số lượng chuyển cho "${r.name}" (${r.quantity}) vượt quá tồn kho hiện có (${r.stock})!`, "warning");
                    else alert(`Số lượng chuyển cho "${r.name}" (${r.quantity}) vượt quá tồn kho hiện có (${r.stock})!`);
                    return;
                }
            }

            const itemsPayload = currentTransferRows.map(r => ({
                item_type: r.item_type,
                item_id: r.item_id,
                product_id: r.item_type === 'product' ? r.item_id : null,
                ingredient_id: r.item_type === 'ingredient' ? r.item_id : null,
                quantity: r.quantity
            }));

            const fromWhName = fromWhEl?.selectedOptions[0]?.text || 'Kho xuất';
            const toWhName = toWhEl?.selectedOptions[0]?.text || 'Kho nhập';

            const previewItemsHtml = currentTransferRows.slice(0, 4).map(r => `
                <div class="flex items-center justify-between text-[11px] py-1 border-b border-slate-100 last:border-0">
                    <span class="truncate max-w-[220px] font-medium text-slate-800">• ${r.name}</span>
                    <span class="font-mono font-bold text-sky-700">${r.quantity.toLocaleString('vi-VN')} <span class="font-normal text-slate-500">${r.unit || 'cái'}</span></span>
                </div>
            `).join('') + (currentTransferRows.length > 4 ? `<div class="text-[10px] text-gray-400 italic text-center pt-1.5">...và ${currentTransferRows.length - 4} mặt hàng khác</div>` : '');

            const confirmed = await window.showConfirmModal({
                title: currentEditingTransferId ? 'Xác Nhận Cập Nhật Phiếu Chuyển Kho' : 'Xác Nhận Điều Chuyển Kho',
                message: currentEditingTransferId
                    ? `Bạn có chắc chắn muốn lưu cập nhật cho <strong class="text-sky-700 font-bold">${itemsPayload.length} mặt hàng</strong>?`
                    : `Bạn có chắc chắn muốn chuyển <strong class="text-sky-700 font-bold">${itemsPayload.length} mặt hàng</strong> sang kho nhận?`,
                subMessage: `
                    <div class="space-y-2.5">
                        <div class="grid grid-cols-2 gap-2 text-[11px] pb-2 border-b border-slate-200">
                            <div>
                                <span class="text-gray-400 block text-[10px] uppercase font-bold">📤 Kho Xuất:</span>
                                <strong class="text-rose-700 font-bold block mt-0.5">${fromWhName}</strong>
                            </div>
                            <div>
                                <span class="text-gray-400 block text-[10px] uppercase font-bold">📥 Kho Nhập:</span>
                                <strong class="text-emerald-700 font-bold block mt-0.5">${toWhName}</strong>
                            </div>
                        </div>
                        <div class="bg-slate-50 p-2.5 rounded-lg border border-slate-200">
                            <div class="text-[10px] font-bold text-slate-500 uppercase tracking-wide mb-1">Mặt hàng & số lượng chuyển:</div>
                            ${previewItemsHtml}
                        </div>
                        ${note ? `<div class="text-[11px] text-slate-600 bg-amber-50/60 p-2 rounded border border-amber-200/80">📝 Ghi chú: <em>"${note}"</em></div>` : ''}
                    </div>
                `,
                confirmText: currentEditingTransferId ? '💾 Lưu Cập Nhật' : '🚀 Xác Nhận Chuyển',
                cancelText: '✕ Hủy Bỏ',
                type: 'transfer',
                icon: currentEditingTransferId ? '✏️' : '🔄'
            });

            if (!confirmed) return;

            try {
                const url = currentEditingTransferId ? `/api/inventory/transfers/${currentEditingTransferId}` : '/api/inventory/transfer';
                const method = currentEditingTransferId ? 'PUT' : 'POST';

                const res = await fetch(url, {
                    method: method,
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        from_warehouse_id: fromWh,
                        to_warehouse_id: toWh,
                        note: note || '',
                        items: itemsPayload
                    })
                });

                if (!res.ok) {
                    const err = await res.json().catch(() => ({}));
                    const msg = err.detail || "Không thể thực hiện chuyển kho";
                    if (window.showToast) window.showToast("❌ Lỗi chuyển kho: " + msg, "error");
                    else alert("Lỗi chuyển kho: " + msg);
                    return;
                }

                const result = await res.json();
                const transferId = result.id || currentEditingTransferId;
                const transferCode = result.transfer_code || result.code;
                const isEdit = !!currentEditingTransferId;

                cancelEditStockTransfer();
                loadUnifiedInventory();

                if (window.showConfirmModal) {
                    const wantPrint = await window.showConfirmModal({
                        title: isEdit ? 'Cập Nhật Thành Công' : 'Chuyển Kho Thành Công',
                        message: `Đã hoàn tất ${isEdit ? 'cập nhật' : 'điều chuyển'} kho! Mã phiếu: <strong class="text-sky-700 font-bold">${transferCode}</strong>`,
                        subMessage: 'Bạn có muốn in phiếu điều chuyển kho A4 để ký biên bản bàn giao ngay bây giờ không?',
                        confirmText: '🖨️ In Phiếu A4',
                        cancelText: '✕ Đóng',
                        type: 'transfer',
                        icon: '✅'
                    });
                    if (wantPrint && transferId) {
                        printStockTransferA4(transferId);
                    }
                } else {
                    if (window.showToast) {
                        window.showToast(`✅ Đã ${isEdit ? 'cập nhật' : 'hoàn tất'} chuyển kho! Mã phiếu: ${transferCode}`, "success", 4000);
                    } else {
                        alert(`Đã ${isEdit ? 'cập nhật' : 'hoàn tất'} chuyển kho! Mã phiếu: ${transferCode}`);
                    }
                    if (confirm("Bạn có muốn in phiếu chuyển kho A4 ngay không?")) {
                        printStockTransferA4(transferId);
                    }
                }
            } catch (e) {
                console.error("submitStockTransfer error:", e);
                if (window.showToast) window.showToast("❌ Lỗi kết nối khi gửi phiếu chuyển kho", "error");
                else alert("Lỗi kết nối khi gửi phiếu chuyển kho");
            }
        }

        function cancelEditStockTransfer() {
            currentEditingTransferId = null;
            document.getElementById('transfer-note').value = '';
            currentTransferRows = [];
            const submitBtn = document.getElementById('btn-submit-transfer');
            if (submitBtn) {
                submitBtn.innerHTML = '🚀 Xác Nhận Điều Chuyển Hàng';
                submitBtn.className = 'bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs px-4 py-2 rounded shadow';
            }
            const cancelBtn = document.getElementById('btn-cancel-edit-transfer');
            if (cancelBtn) cancelBtn.classList.add('hidden');
            const headerTitle = document.getElementById('transfer-create-title');
            if (headerTitle) headerTitle.innerText = '📦 Danh Sách Mặt Hàng Điều Chuyển';
            onTransferFromChange();
        }

        async function editStockTransfer(id) {
            try {
                const res = await fetch(`/api/inventory/transfers/${id}`);
                if (!res.ok) throw new Error("Không thể tải chi tiết phiếu chuyển kho");
                const data = await res.json();

                currentEditingTransferId = id;
                toggleTransferView('create');

                const fromWhEl = document.getElementById('transfer-from-wh');
                const toWhEl = document.getElementById('transfer-to-wh');
                const noteEl = document.getElementById('transfer-note');
                if (fromWhEl) fromWhEl.value = data.from_warehouse_id;
                if (toWhEl) toWhEl.value = data.to_warehouse_id;
                if (noteEl) noteEl.value = data.note || '';

                let stockMap = {};
                try {
                    const stockRes = await fetch(`/api/inventory/stock-by-warehouse?warehouse_id=${data.from_warehouse_id}`);
                    if (stockRes.ok) {
                        const stockData = await stockRes.json();
                        (stockData.products || []).forEach(p => stockMap['product_' + p.id] = p.stock || 0);
                        (stockData.ingredients || []).forEach(ing => stockMap['ingredient_' + ing.id] = ing.stock || 0);
                    }
                } catch(_) {}

                currentTransferRows = (data.items || []).map(it => {
                    const isProd = it.item_type === 'product';
                    const itemId = isProd ? (it.product_id || it.id) : (it.ingredient_id || it.id);
                    const key = (isProd ? 'product_' : 'ingredient_') + itemId;
                    const currentStock = (stockMap[key] !== undefined ? stockMap[key] : 0) + (it.quantity || 0);
                    return {
                        item_type: it.item_type,
                        item_id: itemId,
                        name: it.name || it.item_name || 'Mặt hàng',
                        sku: it.sku || it.code || '---',
                        stock: Math.max(currentStock, it.quantity || 0),
                        quantity: it.quantity || 0,
                        unit: it.unit || 'cái'
                    };
                });

                renderTransferRows();

                const submitBtn = document.getElementById('btn-submit-transfer');
                if (submitBtn) {
                    submitBtn.innerHTML = `💾 Cập Nhật Phiếu Chuyển (${data.transfer_code || data.code})`;
                    submitBtn.className = 'bg-amber-600 hover:bg-amber-700 text-white font-bold text-xs px-4 py-2 rounded shadow flex items-center gap-1.5';
                }
                const cancelBtn = document.getElementById('btn-cancel-edit-transfer');
                if (cancelBtn) cancelBtn.classList.remove('hidden');
                const headerTitle = document.getElementById('transfer-create-title');
                if (headerTitle) headerTitle.innerText = `✏️ Chỉnh Sửa Phiếu Điều Chuyển (${data.transfer_code || data.code})`;

                if (window.showToast) {
                    window.showToast(`Đang chỉnh sửa phiếu ${data.transfer_code || data.code}`, "info");
                }
            } catch(err) {
                console.error("editStockTransfer error:", err);
                if (window.showToast) window.showToast("Không thể nạp phiếu để sửa: " + err.message, "error");
            }
        }

        async function deleteStockTransfer(id) {
            const confirmed = await window.showConfirmModal({
                title: 'Xóa Phiếu Điều Chuyển Kho',
                message: 'Bạn có chắc chắn muốn <strong>XÓA</strong> phiếu điều chuyển này không?',
                subMessage: 'Hệ thống sẽ <strong>tự động hoàn tác tồn kho</strong>: cộng trả lại toàn bộ số lượng vào Kho Xuất ban đầu và trừ thu hồi khỏi Kho Nhập.',
                confirmText: '🗑️ Xác Nhận Xóa & Hoàn Kho',
                cancelText: '✕ Hủy Bỏ',
                type: 'danger',
                icon: '⚠️'
            });
            if (!confirmed) return;

            try {
                const res = await fetch(`/api/inventory/transfers/${id}`, {
                    method: 'DELETE'
                });
                if (!res.ok) {
                    const err = await res.json().catch(() => ({}));
                    throw new Error(err.detail || "Lỗi khi xóa phiếu");
                }
                if (window.showToast) {
                    window.showToast("✅ Đã xóa phiếu và hoàn tác tồn kho thành công!", "success");
                }
                loadStockTransfersList();
                loadUnifiedInventory();
                closeModalTransferDetail();
            } catch(e) {
                console.error("deleteStockTransfer error:", e);
                if (window.showToast) window.showToast("❌ Không thể xóa phiếu: " + e.message, "error");
                else alert("Lỗi xóa phiếu: " + e.message);
            }
        }

        async function loadStockTransfersList() {
            const tbody = document.getElementById('table-transfer-history');
            tbody.innerHTML = '<tr><td colspan="8" class="p-4 text-center text-gray-400">Đang tải lịch sử chuyển kho...</td></tr>';

            try {
                const res = await fetch('/api/inventory/transfers');
                const list = await res.json();
                if (!list || list.length === 0) {
                    tbody.innerHTML = '<tr><td colspan="8" class="p-4 text-center text-gray-400">Chưa có phiếu chuyển kho nào</td></tr>';
                    return;
                }

                tbody.innerHTML = list.map(t => {
                    const creatorHtml = `
                        <div class="font-medium text-slate-800">👤 ${t.created_by || 'Admin'}</div>
                        ${t.updated_by ? `<div class="text-[10px] text-amber-600 font-semibold italic">✏️ Sửa: ${t.updated_by}</div>` : ''}
                    `;
                    return `
                    <tr class="border-b hover:bg-gray-50 text-xs">
                        <td class="p-2.5 font-mono font-bold text-sky-700">${t.transfer_code || t.code}</td>
                        <td class="p-2.5 text-gray-500 whitespace-nowrap">${formatDateTime(t.created_at) || '-'}</td>
                        <td class="p-2.5 font-bold text-rose-700">${t.from_warehouse_name || 'Kho xuất'}</td>
                        <td class="p-2.5 font-bold text-emerald-700">${t.to_warehouse_name || 'Kho nhập'}</td>
                        <td class="p-2.5 text-right font-medium">${(t.items_count || t.item_count || 0).toLocaleString('vi-VN')} món</td>
                        <td class="p-2.5 text-gray-500">${t.note || '-'}</td>
                        <td class="p-2.5 text-[11px]">${creatorHtml}</td>
                        <td class="p-2.5 text-center whitespace-nowrap space-x-1">
                            <button onclick="viewTransferDetail(${t.id})" class="px-2 py-1 bg-sky-50 hover:bg-sky-100 text-sky-700 rounded text-[11px] font-bold" title="Xem chi tiết">
                                👁️ Xem
                            </button>
                            <button onclick="printStockTransferA4(${t.id})" class="px-2 py-1 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded text-[11px] font-bold" title="In Phiếu Điều Chuyển A4">
                                🖨️ In
                            </button>
                            <button onclick="editStockTransfer(${t.id})" class="px-2 py-1 bg-amber-50 hover:bg-amber-100 text-amber-700 rounded text-[11px] font-bold" title="Sửa phiếu chuyển kho">
                                ✏️ Sửa
                            </button>
                            <button onclick="deleteStockTransfer(${t.id})" class="px-2 py-1 bg-rose-50 hover:bg-rose-100 text-rose-700 rounded text-[11px] font-bold" title="Xóa phiếu chuyển kho (hoàn tác tồn kho)">
                                🗑️ Xóa
                            </button>
                        </td>
                    </tr>
                `;
                }).join('');
            } catch (e) {
                console.error("loadStockTransfersList error:", e);
            }
        }

        let currentViewedTransferId = null;

        async function viewTransferDetail(transferId) {
            currentViewedTransferId = transferId;
            const modal = document.getElementById('modal-transfer-detail');
            modal.classList.remove('hidden');
            const tbody = document.getElementById('view-transfer-items');
            tbody.innerHTML = '<tr><td colspan="5" class="p-4 text-center text-gray-400">Đang tải chi tiết phiếu...</td></tr>';

            try {
                const res = await fetch(`/api/inventory/transfers/${transferId}`);
                const data = await res.json();
                document.getElementById('view-transfer-code').innerText = data.transfer_code || data.code;
                document.getElementById('view-transfer-date').innerText = 'Thời gian: ' + (formatDateTime(data.created_at) || '-');
                document.getElementById('view-transfer-from').innerText = data.from_warehouse_name;
                document.getElementById('view-transfer-to').innerText = data.to_warehouse_name;
                const creatorEl = document.getElementById('view-transfer-creator');
                if (creatorEl) creatorEl.innerText = data.created_by || 'Admin';
                const updaterEl = document.getElementById('view-transfer-updater');
                if (updaterEl) updaterEl.innerText = data.updated_by ? `${data.updated_by} (${formatDateTime(data.updated_at)})` : 'Chưa chỉnh sửa';

                tbody.innerHTML = (data.items || []).map((it, idx) => {
                    const badge = it.item_type === 'product'
                        ? '<span class="px-2 py-0.5 rounded text-[10px] font-bold bg-sky-100 text-sky-700">Hàng Hóa</span>'
                        : '<span class="px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-100 text-emerald-700">Nguyên Liệu</span>';

                    return `
                        <tr class="border-b text-[11px]">
                            <td class="p-2 text-gray-400 text-center">${idx + 1}</td>
                            <td class="p-2 font-bold text-slate-800">${it.name || it.item_name}</td>
                            <td class="p-2 text-center">${badge}</td>
                            <td class="p-2 text-right font-bold text-sky-700">${it.quantity.toLocaleString('vi-VN')}</td>
                            <td class="p-2 text-gray-500">${it.unit || 'cái'}</td>
                        </tr>
                    `;
                }).join('');
            } catch (e) {
                console.error("viewTransferDetail error:", e);
            }
        }

        function closeModalTransferDetail() {
            document.getElementById('modal-transfer-detail')?.classList.add('hidden');
        }

        function editCurrentTransfer() {
            if (currentViewedTransferId) {
                closeModalTransferDetail();
                editStockTransfer(currentViewedTransferId);
            }
        }
        window.editCurrentTransfer = editCurrentTransfer;

        function deleteCurrentTransfer() {
            if (currentViewedTransferId) {
                deleteStockTransfer(currentViewedTransferId);
            }
        }
        window.deleteCurrentTransfer = deleteCurrentTransfer;
        window.editStockTransfer = editStockTransfer;
        window.deleteStockTransfer = deleteStockTransfer;
        window.cancelEditStockTransfer = cancelEditStockTransfer;

        async function printStockTransferA4(transferId) {
            const id = transferId || currentViewedTransferId;
            if (!id) {
                if (window.showToast) window.showToast("Không tìm thấy thông tin phiếu chuyển kho!", "error");
                return;
            }

            try {
                const res = await fetch(`/api/inventory/transfers/${id}`);
                if (!res.ok) throw new Error("Không thể tải chi tiết phiếu chuyển kho");
                const data = await res.json();

                let company = window.companySettings;
                if (!company || !company.shop_name) {
                    try {
                        const setRes = await fetch('/api/settings');
                        if (setRes.ok) {
                            company = await setRes.json();
                            window.companySettings = company;
                        }
                    } catch(e) {}
                }
                company = company || window.posSettings || {};
                const storeName = company.shop_name || company.app_name || 'Mastercare For Pet';
                const storeAddr = company.shop_address || '';
                const storePhone = company.shop_phone || '';

                const fromWhText = (data.from_warehouse_name || 'Kho xuất') + (data.from_warehouse_address ? ` - Địa chỉ: ${data.from_warehouse_address}` : '');
                const toWhText = (data.to_warehouse_name || 'Kho nhập') + (data.to_warehouse_address ? ` - Địa chỉ: ${data.to_warehouse_address}` : '');

                const items = data.items || [];
                let totalQty = 0;

                const rowsHtml = items.map((it, idx) => {
                    totalQty += (it.quantity || 0);
                    const sku = it.sku || it.code || '-';
                    const name = it.name || it.item_name || 'Mặt hàng';
                    const unit = it.unit || 'cái';
                    const qty = (it.quantity || 0).toLocaleString('vi-VN');
                    return `
                        <tr>
                            <td style="text-align: center; font-size: 11px; border: 1px solid #000; padding: 5px;">${idx + 1}</td>
                            <td style="font-family: monospace; font-size: 11px; font-weight: bold; border: 1px solid #000; padding: 5px;">${sku}</td>
                            <td style="font-weight: bold; font-size: 12px; border: 1px solid #000; padding: 5px;">${name}</td>
                            <td style="text-align: center; font-size: 11px; border: 1px solid #000; padding: 5px;">${unit}</td>
                            <td style="text-align: right; font-family: monospace; font-size: 12px; font-weight: bold; border: 1px solid #000; padding: 5px;">${qty}</td>
                            <td style="font-size: 11px; border: 1px solid #000; padding: 5px;">${it.note || ''}</td>
                        </tr>
                    `;
                }).join('');

                const transferCode = data.transfer_code || data.code || `CK-${id}`;
                const transferDate = (typeof formatDate === 'function' && data.created_at) ? formatDate(data.created_at) : (data.created_at ? data.created_at.split(' ')[0].split('-').reverse().join('/') : '');

                const printHtml = `
                    <div style="width: 190mm; max-width: 190mm; margin: 0 auto; font-family: 'Times New Roman', Times, serif; font-size: 12px; line-height: 1.35; color: #000; padding: 4mm;">
                        <!-- HEADER -->
                        <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 12px; border-bottom: 1px solid #999; padding-bottom: 8px;">
                            <div style="max-width: 65%;">
                                <div style="font-weight: bold; text-transform: uppercase; font-size: 13px;">${storeName}</div>
                                ${storeAddr ? `<div style="font-size: 11px; margin-top: 2px;">Địa chỉ: ${storeAddr}</div>` : ''}
                                ${storePhone ? `<div style="font-size: 11px;">Hotline: ${storePhone}</div>` : ''}
                            </div>
                            <div style="text-align: right; font-size: 11px;">
                                <div>Mã phiếu: <strong style="font-family: monospace; font-size: 13px;">${transferCode}</strong></div>
                                <div>Ngày: ${transferDate || '-'}</div>
                            </div>
                        </div>

                        <!-- TITLE -->
                        <div style="text-align: center; margin-bottom: 14px;">
                            <h1 style="margin: 0; font-size: 20px; font-weight: bold; text-transform: uppercase; letter-spacing: 0.5px;">PHIẾU CHUYỂN KHO</h1>
                        </div>

                        <!-- INFO BOX -->
                        <div style="border: 1px solid #000; padding: 8px 10px; margin-bottom: 12px; font-size: 12px; line-height: 1.5; background: #fafafa;">
                            <div style="display: flex; margin-bottom: 3px;">
                                <div style="width: 140px; font-weight: bold;">📤 Kho xuất (Nơi giao):</div>
                                <div style="flex: 1; font-weight: bold;">${fromWhText}</div>
                            </div>
                            <div style="display: flex; margin-bottom: 3px;">
                                <div style="width: 140px; font-weight: bold;">📥 Kho nhập (Nơi nhận):</div>
                                <div style="flex: 1; font-weight: bold;">${toWhText}</div>
                            </div>
                            <div style="display: flex;">
                                <div style="width: 140px; font-weight: bold;">📝 Lý do / Ghi chú:</div>
                                <div style="flex: 1;">${data.note || ''}</div>
                            </div>
                        </div>

                        <!-- TABLE -->
                        <table style="width: 100%; border-collapse: collapse; margin-bottom: 14px;">
                            <thead>
                                <tr style="background: #f0f0f0;">
                                    <th style="border: 1px solid #000; padding: 6px 4px; width: 35px; text-align: center;">STT</th>
                                    <th style="border: 1px solid #000; padding: 6px 4px; width: 85px; text-align: left;">Mã SKU</th>
                                    <th style="border: 1px solid #000; padding: 6px 4px; text-align: left;">Tên Mặt Hàng / Vật Tư</th>
                                    <th style="border: 1px solid #000; padding: 6px 4px; width: 50px; text-align: center;">ĐVT</th>
                                    <th style="border: 1px solid #000; padding: 6px 4px; width: 80px; text-align: right;">Số Lượng</th>
                                    <th style="border: 1px solid #000; padding: 6px 4px; width: 110px; text-align: left;">Ghi Chú</th>
                                </tr>
                            </thead>
                            <tbody>
                                ${rowsHtml}
                                <tr style="font-weight: bold; background: #fafafa;">
                                    <td colspan="4" style="border: 1px solid #000; padding: 6px; text-align: right;">TỔNG CỘNG (${items.length} mặt hàng):</td>
                                    <td style="border: 1px solid #000; padding: 6px; text-align: right; font-family: monospace;">${totalQty.toLocaleString('vi-VN')}</td>
                                    <td style="border: 1px solid #000; padding: 6px;"></td>
                                </tr>
                            </tbody>
                        </table>

                        <!-- 4 SIGNATURES -->
                        <div style="display: flex; justify-content: space-between; text-align: center; font-size: 11.5px; margin-top: 25px; page-break-inside: avoid;">
                            <div style="width: 24%;">
                                <div style="font-weight: bold;">Người Lập Phiếu</div>
                                <div style="font-style: italic; font-size: 10px;">(Ký, họ tên)</div>
                                <div style="height: 45px;"></div>
                                <div style="font-weight: 600; font-size: 11px;">${data.created_by || ''}</div>
                            </div>
                            <div style="width: 24%;">
                                <div style="font-weight: bold;">Thủ Kho Xuất</div>
                                <div style="font-style: italic; font-size: 10px;">(Ký, họ tên)</div>
                                <div style="height: 45px;"></div>
                            </div>
                            <div style="width: 24%;">
                                <div style="font-weight: bold;">Người Vận Chuyển</div>
                                <div style="font-style: italic; font-size: 10px;">(Ký, họ tên)</div>
                                <div style="height: 45px;"></div>
                            </div>
                            <div style="width: 24%;">
                                <div style="font-weight: bold;">Thủ Kho Nhận</div>
                                <div style="font-style: italic; font-size: 10px;">(Ký, họ tên)</div>
                                <div style="height: 45px;"></div>
                            </div>
                        </div>
                        ${data.updated_by ? `<div style="font-size: 10px; color: #666; font-style: italic; margin-top: 15px; text-align: left;">* Phiếu được chỉnh sửa lần cuối bởi: <strong>${data.updated_by}</strong> (${data.updated_at ? formatDate(data.updated_at) : ''})</div>` : ''}
                    </div>
                `;

                let iframe = document.getElementById('iframe-stock-transfer-print');
                if (!iframe) {
                    iframe = document.createElement('iframe');
                    iframe.id = 'iframe-stock-transfer-print';
                    iframe.style.position = 'fixed';
                    iframe.style.left = '-9999px';
                    iframe.style.top = '-9999px';
                    iframe.style.width = '0';
                    iframe.style.height = '0';
                    document.body.appendChild(iframe);
                }

                const doc = iframe.contentWindow.document;
                doc.open();
                doc.write(`
                    <!DOCTYPE html>
                    <html>
                    <head>
                        <meta charset="utf-8">
                        <title>Phiếu Chuyển Kho - ${transferCode}</title>
                        <style>
                            @page { size: A4 portrait; margin: 8mm 10mm; }
                            table { width: 100%; border-collapse: collapse; }
                            th, td { border: 1px solid #000; padding: 5px; }
                            @media print {
                                html, body { margin: 0; padding: 0; background: #fff; }
                            }
                        </style>
                    </head>
                    <body>
                        ${printHtml}
                    </body>
                    </html>
                `);
                doc.close();

                setTimeout(() => {
                    try {
                        iframe.contentWindow.focus();
                        iframe.contentWindow.print();
                    } catch(e) {
                        console.error('Lỗi in phiếu chuyển kho:', e);
                    }
                }, 300);
            } catch (err) {
                console.error("printStockTransferA4 error:", err);
                if (window.showToast) window.showToast("Không thể tải và in phiếu chuyển kho!", "error");
            }
        }
        window.printStockTransferA4 = printStockTransferA4;

        // --- IMPORT & EXPORT HÀNG HÓA (EXCEL / CSV) ---
        function exportProductsExcel() {
            const whId = document.getElementById('unified-wh-filter')?.value || '';
            let url = '/api/products/export-excel';
            if (whId) url += `?warehouse_id=${whId}`;
            downloadWithAuth(url, 'Hang_Hoa.xlsx');
        }

        function openModalImportProducts() {
            const modal = document.getElementById('modal-import-products');
            if (!modal) return;
            const whSel = document.getElementById('import-prod-warehouse');
            if (whSel && allWarehouses && allWarehouses.length > 0) {
                whSel.innerHTML = allWarehouses.map(w => `<option value="${w.id}">${w.name}</option>`).join('');
            }
            const currentWh = document.getElementById('unified-wh-filter')?.value;
            if (currentWh && whSel) {
                whSel.value = currentWh;
            }
            document.getElementById('import-prod-file-input').value = '';
            const statusBox = document.getElementById('import-prod-status');
            if (statusBox) {
                statusBox.className = 'hidden';
                statusBox.innerText = '';
            }
            modal.classList.remove('hidden');
        }

        function closeModalImportProducts() {
            const modal = document.getElementById('modal-import-products');
            if (modal) modal.classList.add('hidden');
        }

        async function submitImportProducts() {
            const fileInput = document.getElementById('import-prod-file-input');
            const file = fileInput?.files?.[0];
            if (!file) return alert('Vui lòng chọn 1 file Excel (.xlsx) hoặc CSV để nhập!');

            const whId = document.getElementById('import-prod-warehouse')?.value || 1;
            const btn = document.getElementById('btn-do-import-prod');
            const statusBox = document.getElementById('import-prod-status');

            btn.disabled = true;
            btn.innerText = '⏳ Đang xử lý...';
            statusBox.className = 'text-xs p-2 rounded bg-amber-50 text-amber-800 border border-amber-200 block';
            statusBox.innerText = 'Đang đọc và đồng bộ dữ liệu vào hệ thống...';

            const formData = new FormData();
            formData.append('file', file);

            try {
                const res = await fetch(`/api/products/import-excel?warehouse_id=${whId}`, {
                    method: 'POST',
                    body: formData
                });
                const data = await res.json();
                btn.disabled = false;
                btn.innerText = '🚀 Bắt đầu Nhập';

                if (res.ok && data.success) {
                    let msg = `✅ Đã nhập thành công! Thêm mới: ${data.created}, Cập nhật: ${data.updated}`;
                    if (data.errors && data.errors.length > 0) {
                        msg += `\n⚠️ Có ${data.errors.length} dòng lỗi:\n` + data.errors.slice(0, 5).join('\n');
                    }
                    alert(msg);
                    closeModalImportProducts();
                    await loadUnifiedInventory();
                } else {
                    statusBox.className = 'text-xs p-2 rounded bg-rose-50 text-rose-800 border border-rose-200 block';
                    statusBox.innerText = '❌ Lỗi: ' + (data.detail || 'Không thể nhập file');
                }
            } catch (e) {
                btn.disabled = false;
                btn.innerText = '🚀 Bắt đầu Nhập';
                statusBox.className = 'text-xs p-2 rounded bg-rose-50 text-rose-800 border border-rose-200 block';
                statusBox.innerText = '❌ Lỗi mạng hoặc server: ' + e.message;
            }
        }

        async function loadProductCategoriesDropdown(selectedVal = '') {
            try {
                const res = await fetch('/api/categories');
                if (!res.ok) return;
                const categories = await res.json();
                
                // Cập nhật #modal-prod-category
                const modalSel = document.getElementById('modal-prod-category');
                if (modalSel) {
                    const currentVal = selectedVal || modalSel.value || 'Khác';
                    modalSel.innerHTML = categories.map(c => 
                        `<option value="${c.name}" ${c.name === currentVal ? 'selected' : ''}>${c.name}</option>`
                    ).join('');
                    if (selectedVal) modalSel.value = selectedVal;
                }

                // Cập nhật #unified-category-filter nếu có trên trang
                const unifiedSel = document.getElementById('unified-category-filter');
                if (unifiedSel) {
                    const curVal = unifiedSel.value;
                    unifiedSel.innerHTML = '<option value="">Tất cả nhóm</option>' + 
                        categories.map(c => `<option value="${c.name}" ${c.name === curVal ? 'selected' : ''}>${c.name}</option>`).join('');
                }

                // Cập nhật #pl-filter-category nếu có
                const plSel = document.getElementById('pl-filter-category');
                if (plSel) {
                    const curVal = plSel.value;
                    plSel.innerHTML = '<option value="">Tất cả nhóm</option>' + 
                        categories.map(c => `<option value="${c.name}" ${c.name === curVal ? 'selected' : ''}>${c.name}</option>`).join('');
                }
            } catch (e) {
                console.error("loadProductCategoriesDropdown error:", e);
            }
        }

        let currentCategoryFilter = '';

        async function loadCategoryPillsBar() {
            const bar = document.getElementById('category-pills-bar');
            if (!bar) return;
            try {
                const res = await fetch('/api/categories');
                if (!res.ok) return;
                const categories = await res.json();

                // Tính tổng tất cả sản phẩm
                const totalCount = categories.reduce((sum, c) => sum + (c.product_count || 0), 0);

                let html = `
                    <button type="button" onclick="filterUnifiedByCategory('')" 
                        class="px-3 py-1 rounded-full text-xs font-semibold transition shadow-sm ${!currentCategoryFilter ? 'bg-emerald-600 text-white font-bold' : 'bg-white border text-slate-700 hover:bg-slate-50'}">
                        Tất cả (${totalCount})
                    </button>
                `;

                categories.forEach(c => {
                    const isActive = (currentCategoryFilter === c.name);
                    const safeName = escapeJs(c.name);
                    html += `
                        <button type="button" onclick="filterUnifiedByCategory('${safeName}')" 
                            class="px-3 py-1 rounded-full text-xs font-semibold transition shadow-sm ${isActive ? 'bg-emerald-600 text-white font-bold' : 'bg-white border text-slate-700 hover:bg-slate-50'}">
                            ${c.name} (${c.product_count || 0})
                        </button>
                    `;
                });

                bar.innerHTML = html;
            } catch (e) {
                console.error("loadCategoryPillsBar error:", e);
            }
        }

        function filterUnifiedByCategory(categoryName) {
            currentCategoryFilter = categoryName || '';
            const sel = document.getElementById('unified-category-filter');
            if (sel) {
                sel.value = currentCategoryFilter;
            }
            loadCategoryPillsBar();
            renderUnifiedInventoryTable();
        }

        function openCategoryManagerModal() {
            const modal = document.getElementById('modal-category-manager');
            if (modal) modal.classList.remove('hidden');
            const input = document.getElementById('new-category-mgr-name');
            if (input) {
                input.value = '';
                setTimeout(() => input.focus(), 50);
            }
            renderCategoryManagerList();
        }

        function closeCategoryManagerModal() {
            const modal = document.getElementById('modal-category-manager');
            if (modal) modal.classList.add('hidden');
            loadCategoryPillsBar();
            loadProductCategoriesDropdown();
        }

        async function renderCategoryManagerList() {
            const tbody = document.getElementById('category-mgr-list');
            if (!tbody) return;
            try {
                tbody.innerHTML = '<tr><td colspan="3" class="p-4 text-center text-slate-400">Đang tải danh sách...</td></tr>';
                const res = await fetch('/api/categories');
                if (!res.ok) throw new Error('Không thể tải danh sách nhóm');
                const categories = await res.json();

                if (!categories || categories.length === 0) {
                    tbody.innerHTML = '<tr><td colspan="3" class="p-4 text-center text-slate-400">Chưa có nhóm hàng nào</td></tr>';
                    return;
                }

                tbody.innerHTML = categories.map(c => {
                    const isKhac = (c.name === 'Khác');
                    const safeName = escapeJs(c.name);
                    const deleteBtn = isKhac 
                        ? '<span class="text-slate-300 text-xs italic px-2 py-1">Mặc định</span>'
                        : `<button type="button" onclick="deleteCategory(${c.id}, '${safeName}')" class="px-2 py-1 bg-rose-50 hover:bg-rose-100 text-rose-600 rounded text-xs font-semibold transition" title="Xóa nhóm">Xóa</button>`;
                    
                    return `
                        <tr class="hover:bg-slate-50 transition">
                            <td class="p-2.5 font-medium text-slate-800" id="cat-name-cell-${c.id}">
                                ${c.name}
                            </td>
                            <td class="p-2.5 text-center">
                                <span class="inline-block px-2 py-0.5 bg-slate-100 text-slate-700 rounded-full font-bold text-xs">
                                    ${c.product_count || 0}
                                </span>
                            </td>
                            <td class="p-2.5 text-center">
                                <div class="flex items-center justify-center gap-1.5">
                                    <button type="button" onclick="editCategoryInline(${c.id}, '${safeName}')" class="px-2 py-1 bg-amber-50 hover:bg-amber-100 text-amber-700 rounded text-xs font-semibold transition" title="Sửa tên">Sửa</button>
                                    ${deleteBtn}
                                </div>
                            </td>
                        </tr>
                    `;
                }).join('');
            } catch (e) {
                console.error("renderCategoryManagerList error:", e);
                tbody.innerHTML = `<tr><td colspan="3" class="p-4 text-center text-rose-500">Lỗi: ${e.message}</td></tr>`;
            }
        }

        async function saveCategoryFromManager() {
            const input = document.getElementById('new-category-mgr-name');
            const name = (input?.value || '').trim();
            if (!name) {
                alert('Vui lòng nhập tên nhóm hàng mới!');
                input?.focus();
                return;
            }

            try {
                const res = await fetch('/api/categories', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ name: name })
                });

                if (res.ok) {
                    if (input) input.value = '';
                    await renderCategoryManagerList();
                    await loadCategoryPillsBar();
                    await loadProductCategoriesDropdown();
                    if (typeof showToast === 'function') {
                        showToast(`Đã thêm nhóm: ${name}`, 'success');
                    }
                } else {
                    const err = await res.json().catch(() => ({}));
                    alert('Lỗi: ' + (err.detail || 'Không thể tạo nhóm hàng'));
                }
            } catch (e) {
                console.error("saveCategoryFromManager error:", e);
                alert('Lỗi kết nối khi thêm nhóm hàng!');
            }
        }

        async function editCategoryInline(id, currentName) {
            const newName = prompt('Nhập tên mới cho nhóm hàng:', currentName);
            if (newName === null) return; // user cancelled
            const trimmed = newName.trim();
            if (!trimmed) {
                alert('Tên nhóm không được để trống!');
                return;
            }
            if (trimmed === currentName) return;

            try {
                const res = await fetch(`/api/categories/${id}`, {
                    method: 'PUT',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ name: trimmed })
                });

                if (res.ok) {
                    if (currentCategoryFilter === currentName) {
                        currentCategoryFilter = trimmed;
                    }
                    await renderCategoryManagerList();
                    await loadCategoryPillsBar();
                    await loadProductCategoriesDropdown();
                    await loadUnifiedInventory();
                    if (typeof showToast === 'function') {
                        showToast(`Đã cập nhật tên nhóm: ${trimmed}`, 'success');
                    }
                } else {
                    const err = await res.json().catch(() => ({}));
                    alert('Lỗi: ' + (err.detail || 'Không thể cập nhật tên nhóm'));
                }
            } catch (e) {
                console.error("editCategoryInline error:", e);
                alert('Lỗi kết nối khi cập nhật nhóm hàng!');
            }
        }

        async function deleteCategory(id, name) {
            let confirmed = false;
            if (typeof window.showConfirmModal === 'function') {
                confirmed = await window.showConfirmModal({
                    title: `Xóa Nhóm Hàng [${name}]`,
                    message: `Bạn có chắc chắn muốn xóa nhóm hàng <strong>"${name}"</strong> không?`,
                    subMessage: `Toàn bộ hàng hóa đang thuộc nhóm này sẽ được tự động chuyển về nhóm mặc định <strong>"Khác"</strong> để đảm bảo an toàn dữ liệu.`,
                    confirmText: 'Xác Nhận Xóa',
                    cancelText: 'Hủy Bỏ',
                    type: 'danger'
                });
            } else {
                confirmed = confirm(`Bạn có chắc muốn xóa nhóm '${name}'? Toàn bộ hàng hóa thuộc nhóm này sẽ chuyển về nhóm 'Khác'.`);
            }
            if (!confirmed) return;

            try {
                const res = await fetch(`/api/categories/${id}`, {
                    method: 'DELETE'
                });

                if (res.ok) {
                    if (currentCategoryFilter === name) {
                        currentCategoryFilter = '';
                    }
                    await renderCategoryManagerList();
                    await loadCategoryPillsBar();
                    await loadProductCategoriesDropdown();
                    await loadUnifiedInventory();
                    if (typeof showToast === 'function') {
                        showToast(`Đã xóa nhóm: ${name}`, 'success');
                    }
                } else {
                    const err = await res.json().catch(() => ({}));
                    const msg = err.detail || 'Không thể xóa nhóm hàng';
                    if (typeof showToast === 'function') {
                        showToast('Lỗi: ' + msg, 'error');
                    } else {
                        alert('Lỗi: ' + msg);
                    }
                }
            } catch (e) {
                console.error("deleteCategory error:", e);
                if (typeof showToast === 'function') {
                    showToast('Lỗi kết nối khi xóa nhóm hàng!', 'error');
                } else {
                    alert('Lỗi kết nối khi xóa nhóm hàng!');
                }
            }
        }

        function openQuickAddCategoryModal() {
            const input = document.getElementById('quick-category-name');
            if (input) input.value = '';
            document.getElementById('modal-quick-add-category')?.classList.remove('hidden');
            setTimeout(() => input?.focus(), 50);
        }

        function closeQuickAddCategoryModal() {
            document.getElementById('modal-quick-add-category')?.classList.add('hidden');
        }

        async function saveQuickCategory() {
            const input = document.getElementById('quick-category-name');
            const name = (input?.value || '').trim();
            if (!name) {
                alert('Vui lòng nhập tên nhóm hàng!');
                input?.focus();
                return;
            }

            try {
                const res = await fetch('/api/categories', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ name: name })
                });

                if (res.ok) {
                    const data = await res.json();
                    closeQuickAddCategoryModal();
                    await loadProductCategoriesDropdown(name);
                    if (typeof showToast === 'function') {
                        showToast(`Đã thêm nhóm hàng: ${name}`, 'success');
                    } else {
                        alert(`Đã thêm nhóm hàng: ${name}`);
                    }
                } else {
                    const err = await res.json().catch(() => ({}));
                    alert('Lỗi: ' + (err.detail || 'Không thể tạo nhóm hàng'));
                }
            } catch (e) {
                console.error("saveQuickCategory error:", e);
                alert('Lỗi kết nối khi tạo nhóm hàng!');
            }
        }

        async function loadProductCategoriesDatalist() {
            return loadProductCategoriesDropdown();
        }

        // --- ĐƠN VỊ QUY ĐỔI TRONG MODAL HÀNG HÓA (1 Thùng = 16 Chai) ---
        let prodUnitRows = [];

        function syncProdBaseUnitLabel() {
            const base = document.getElementById('modal-prod-unit')?.value?.trim() || 'cái';
            ['prod-base-unit-label', 'prod-base-unit-label2'].forEach(id => {
                const el = document.getElementById(id);
                if (el) el.innerText = base;
            });
        }

        function renderProdUnitRows() {
            const tbody = document.getElementById('table-prod-units');
            if (!tbody) return;
            syncProdBaseUnitLabel();
            if (!prodUnitRows.length) {
                tbody.innerHTML = '<tr><td colspan="5" class="text-center text-slate-400 italic py-2">Chưa thiết lập đơn vị quy đổi nào</td></tr>';
                return;
            }
            tbody.innerHTML = prodUnitRows.map((u, i) => `
                <tr>
                    <td class="py-1 pr-1"><input type="text" value="${u.unit_name || ''}" oninput="prodUnitRows[${i}].unit_name = this.value" placeholder="Thùng" class="border rounded px-1.5 py-1 w-full text-[11px]"></td>
                    <td class="py-1 pr-1"><input type="number" step="any" min="0" value="${u.ratio || ''}" oninput="prodUnitRows[${i}].ratio = this.value" placeholder="16" class="border rounded px-1.5 py-1 w-full text-right text-[11px]"></td>
                    <td class="py-1 pr-1"><input type="number" step="any" min="0" value="${u.sell_price || 0}" oninput="prodUnitRows[${i}].sell_price = this.value" class="border rounded px-1.5 py-1 w-full text-right text-[11px]"></td>
                    <td class="py-1 text-center"><input type="radio" name="prod-unit-default" ${u.is_default_sale ? 'checked' : ''} onchange="setProdUnitDefault(${i})"></td>
                    <td class="py-1 text-center"><button type="button" onclick="removeProdUnitRow(${i})" class="text-rose-600 hover:text-rose-800 font-bold" title="Xóa đơn vị">×</button></td>
                </tr>
            `).join('');
        }

        function addProdUnitRow() {
            prodUnitRows.push({ unit_name: '', ratio: '', sell_price: 0, is_default_sale: 0 });
            renderProdUnitRows();
        }

        function removeProdUnitRow(idx) {
            prodUnitRows.splice(idx, 1);
            renderProdUnitRows();
        }

        function setProdUnitDefault(idx) {
            prodUnitRows.forEach((u, i) => { u.is_default_sale = (i === idx) ? 1 : 0; });
        }

        async function loadProdUnits(productId) {
            prodUnitRows = [];
            const group = document.getElementById('modal-prod-units-group');
            if (!productId) {
                // Hàng hóa mới: phải lưu lần đầu để có id, rồi mới thiết lập đơn vị
                group?.classList.add('hidden');
                renderProdUnitRows();
                return;
            }
            group?.classList.remove('hidden');
            try {
                const res = await fetch(`/api/products/${productId}/units`);
                const data = await res.json();
                prodUnitRows = (data.units || []).map(u => ({ ...u }));
            } catch (e) {
                console.error('loadProdUnits error:', e);
            }
            renderProdUnitRows();
        }

        async function saveProdUnits(productId) {
            if (!productId) return true;
            const units = prodUnitRows
                .filter(u => (u.unit_name || '').trim())
                .map(u => ({
                    unit_name: (u.unit_name || '').trim(),
                    ratio: parseFloat(u.ratio) || 0,
                    sell_price: parseFloat(u.sell_price) || 0,
                    is_default_sale: u.is_default_sale ? 1 : 0
                }));
            try {
                const res = await fetch(`/api/products/${productId}/units`, {
                    method: 'PUT',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ units })
                });
                if (!res.ok) {
                    const err = await res.json().catch(() => ({}));
                    alert('Lỗi đơn vị quy đổi: ' + (err.detail || 'Không lưu được'));
                    return false;
                }
            } catch (e) {
                alert('Lỗi kết nối khi lưu đơn vị quy đổi');
                return false;
            }
            return true;
        }

        window.addProdUnitRow = addProdUnitRow;
        window.removeProdUnitRow = removeProdUnitRow;
        window.setProdUnitDefault = setProdUnitDefault;
        window.prodUnitRows = prodUnitRows;

        // --- COMBO BUNDLE MANAGEMENT IN PRODUCT MODAL ---
        let currentComboItems = [];

        function onProductTypeChange() {
            const type = document.getElementById('modal-prod-type').value;
            const isCombo = type === 'combo';
            const isService = type === 'service';
            const isEdit = !!document.getElementById('modal-prod-id').value;

            const modalContent = document.getElementById('modal-product-content');
            if (modalContent) {
                if (isCombo) {
                    modalContent.classList.remove('w-[460px]');
                    modalContent.classList.add('w-[560px]');
                } else {
                    modalContent.classList.remove('w-[560px]');
                    modalContent.classList.add('w-[460px]');
                }
            }

            // Nhóm tồn kho: ẩn khi là combo, dịch vụ hoặc khi đang chỉnh sửa
            const stockGroup = document.getElementById('modal-prod-stock-group');
            if (stockGroup) {
                if (isCombo || isService || isEdit) {
                    stockGroup.classList.add('hidden');
                } else {
                    stockGroup.classList.remove('hidden');
                }
            }

            // Nhóm giá vốn: ẩn khi là combo (giá vốn tính theo món con)
            const costGroup = document.getElementById('modal-prod-cost-group');
            if (costGroup) {
                if (isCombo) {
                    costGroup.classList.add('hidden');
                } else {
                    costGroup.classList.remove('hidden');
                }
            }

            // Nhóm nhà cung cấp: ẩn khi là combo
            const suppGroup = document.getElementById('container-prod-suppliers');
            if (suppGroup) {
                if (isCombo) {
                    suppGroup.classList.add('hidden');
                } else {
                    suppGroup.classList.remove('hidden');
                }
            }

            // Nhóm đơn vị quy đổi
            const unitsGroup = document.getElementById('modal-prod-units-group');
            if (unitsGroup && isCombo) {
                unitsGroup.classList.add('hidden');
            }

            // Đơn vị tính
            const unitInput = document.getElementById('modal-prod-unit');
            if (unitInput) {
                if (isCombo && (!unitInput.value || unitInput.value === 'cái')) {
                    unitInput.value = 'combo';
                }
            }

            // Nhóm cấu hình combo
            const comboGroup = document.getElementById('modal-prod-combo-group');
            if (comboGroup) {
                if (isCombo) {
                    comboGroup.classList.remove('hidden');
                    renderComboComponentsTable();
                } else {
                    comboGroup.classList.add('hidden');
                }
            }
        }
        window.onProductTypeChange = onProductTypeChange;

        async function searchComboComponent(query) {
            const q = (query || '').trim().toLowerCase();
            const resultsContainer = document.getElementById('combo-item-search-results');
            if (!resultsContainer) return;
            if (!q) {
                resultsContainer.innerHTML = '';
                resultsContainer.classList.add('hidden');
                return;
            }

            let products = window.posProducts || [];
            if (products.length === 0) {
                try {
                    const res = await fetch('/api/products');
                    products = await res.json();
                    window.posProducts = products;
                } catch (e) {
                    console.error("searchComboComponent fetch error:", e);
                }
            }

            const currentProdId = parseInt(document.getElementById('modal-prod-id').value) || 0;

            const matches = products.filter(p => {
                if (p.id === currentProdId) return false;
                if (p.type === 'material' || p.type === 'combo') return false;
                const name = (p.name || '').toLowerCase();
                const code = (p.code || '').toLowerCase();
                return name.includes(q) || code.includes(q);
            }).slice(0, 8);

            if (matches.length === 0) {
                resultsContainer.innerHTML = '<div class="p-2.5 text-center text-slate-400 italic">Không tìm thấy sản phẩm phù hợp</div>';
                resultsContainer.classList.remove('hidden');
                return;
            }

            resultsContainer.innerHTML = matches.map(p => `
                <div onclick="addComboComponent(${p.id}, '${encodeURIComponent(p.name)}', '${p.code || ''}', ${p.sell_price || 0}, '${p.unit || 'cái'}')" 
                     class="p-2 hover:bg-amber-50 cursor-pointer flex justify-between items-center transition">
                    <div>
                        <span class="font-mono font-bold text-slate-400 mr-1">[${p.code || '-'}]</span>
                        <span class="font-bold text-slate-800">${p.name}</span>
                        <span class="text-slate-400 text-[11px]">(${p.unit || 'cái'})</span>
                    </div>
                    <div class="text-right shrink-0 ml-2">
                        <div class="font-bold text-emerald-600">${formatMoneyNumber(p.sell_price)} đ</div>
                        <div class="text-[10px] text-slate-400">Tồn: ${p.stock || 0}</div>
                    </div>
                </div>
            `).join('');
            resultsContainer.classList.remove('hidden');
        }
        window.searchComboComponent = searchComboComponent;

        function addComboComponent(productId, encodedName, code, sellPrice, unit) {
            const name = decodeURIComponent(encodedName);
            const existing = currentComboItems.find(i => i.product_id === productId);
            if (existing) {
                existing.quantity += 1;
            } else {
                currentComboItems.push({
                    product_id: productId,
                    name: name,
                    code: code,
                    sell_price: sellPrice,
                    unit: unit,
                    quantity: 1
                });
            }

            const searchInput = document.getElementById('combo-item-search');
            if (searchInput) searchInput.value = '';
            const resultsContainer = document.getElementById('combo-item-search-results');
            if (resultsContainer) resultsContainer.classList.add('hidden');

            renderComboComponentsTable();
        }
        window.addComboComponent = addComboComponent;

        function updateComboComponentQty(idx, qtyVal) {
            let q = parseFloat(qtyVal) || 0;
            if (q <= 0) q = 1;
            if (currentComboItems[idx]) {
                currentComboItems[idx].quantity = q;
            }
            renderComboComponentsTable();
        }
        window.updateComboComponentQty = updateComboComponentQty;

        function removeComboComponent(idx) {
            currentComboItems.splice(idx, 1);
            renderComboComponentsTable();
        }
        window.removeComboComponent = removeComboComponent;

        function renderComboComponentsTable() {
            const tbody = document.getElementById('table-combo-components');
            const badge = document.getElementById('combo-items-count-badge');
            const totalRetailEl = document.getElementById('combo-total-retail-price');
            if (!tbody) return;

            if (badge) badge.innerText = `${currentComboItems.length} món`;

            if (currentComboItems.length === 0) {
                tbody.innerHTML = '<tr><td colspan="5" class="text-center text-slate-400 italic py-3">Chưa có sản phẩm nào trong combo</td></tr>';
                if (totalRetailEl) totalRetailEl.innerText = '0 đ';
                calculateComboSavings();
                return;
            }

            let totalRetail = 0;
            tbody.innerHTML = currentComboItems.map((item, idx) => {
                const subtotal = item.quantity * item.sell_price;
                totalRetail += subtotal;
                return `
                    <tr class="border-b last:border-0 hover:bg-slate-50">
                        <td class="p-1.5">
                            <div class="font-bold text-slate-800">${item.name}</div>
                            <div class="font-mono text-[10px] text-slate-400">[${item.code || '-'}] · ${item.unit || 'cái'}</div>
                        </td>
                        <td class="p-1.5 text-right">
                            <input type="number" min="0.1" step="any" value="${item.quantity}" 
                                   onchange="updateComboComponentQty(${idx}, this.value)"
                                   class="w-14 border rounded px-1 py-0.5 text-right font-bold text-slate-800 focus:ring-1 focus:ring-amber-500">
                        </td>
                        <td class="p-1.5 text-right font-mono text-slate-600">${formatMoneyNumber(item.sell_price)} đ</td>
                        <td class="p-1.5 text-right font-mono font-bold text-amber-700">${formatMoneyNumber(subtotal)} đ</td>
                        <td class="p-1.5 text-center">
                            <button type="button" onclick="removeComboComponent(${idx})" class="text-rose-500 hover:text-rose-700 font-bold px-1" title="Xóa món">✕</button>
                        </td>
                    </tr>
                `;
            }).join('');

            if (totalRetailEl) totalRetailEl.innerText = formatMoneyNumber(totalRetail) + ' đ';

            const priceInput = document.getElementById('modal-prod-price');
            if (priceInput && (!priceInput.value || parseMoneyInput(priceInput.value) === 0)) {
                priceInput.value = formatMoneyNumber(totalRetail);
            }

            calculateComboSavings();
        }
        window.renderComboComponentsTable = renderComboComponentsTable;

        function calculateComboSavings() {
            const hintEl = document.getElementById('combo-savings-hint');
            if (!hintEl) return;

            let totalRetail = 0;
            currentComboItems.forEach(it => {
                totalRetail += it.quantity * it.sell_price;
            });

            const comboPrice = parseMoneyInput(document.getElementById('modal-prod-price')?.value) || 0;
            if (totalRetail > 0 && comboPrice > 0 && comboPrice < totalRetail) {
                const diff = totalRetail - comboPrice;
                const pct = Math.round((diff / totalRetail) * 100);
                hintEl.innerText = `Tiết kiệm: ${formatMoneyNumber(diff)} đ (${pct}%)`;
                hintEl.classList.remove('hidden');
            } else {
                hintEl.classList.add('hidden');
            }
        }
        window.calculateComboSavings = calculateComboSavings;

        // --- MODAL PRODUCT CRUD (THÊM / SỬA / XÓA HÀNG HÓA) ---
        async function openModalProductUnified() {
            currentComboItems = [];
            document.getElementById('modal-prod-title').innerText = 'Thêm Hàng Hóa Mới';
            document.getElementById('modal-prod-id').value = '';
            document.getElementById('modal-prod-code').value = '';
            document.getElementById('modal-prod-name').value = '';
            document.getElementById('modal-prod-type').value = 'product';
            document.getElementById('modal-prod-unit').value = 'cái';
            document.getElementById('modal-prod-cost').value = '';
            document.getElementById('modal-prod-price').value = '';
            document.getElementById('modal-prod-stock').value = '';
            const minStockEl = document.getElementById('modal-prod-min-stock');
            if (minStockEl) minStockEl.value = '5';
            document.getElementById('modal-prod-stock-group')?.classList.remove('hidden');
            document.getElementById('btn-convert-to-ingredient')?.classList.add('hidden');
            await loadProdUnits(null);

            await Promise.all([populateProductSuppliersDropdown([]), loadProductCategoriesDropdown('Khác')]);
            onProductTypeChange();
            document.getElementById('modal-product').classList.remove('hidden');
        }

        async function openModalEditProduct(productId) {
            try {
                currentComboItems = [];
                // Lấy sản phẩm từ cache hoặc fetch thẳng
                const res = await fetch('/api/products');
                const products = await res.json();
                let p = products.find(x => x.id === productId);
                if (!p && unifiedInventoryData) {
                    p = unifiedInventoryData.find(x => x.item_type === 'product' && x.id === productId);
                }
                if (!p) return alert('Không tìm thấy sản phẩm!');

                const isCombo = (p.type === 'combo' || p.sub_type === 'combo');

                document.getElementById('modal-prod-title').innerText = isCombo ? 'Chỉnh Sửa Gói Combo' : 'Chỉnh Sửa Hàng Hóa';
                document.getElementById('modal-prod-id').value = p.id;
                document.getElementById('modal-prod-code').value = p.code || '';
                document.getElementById('modal-prod-name').value = p.name || '';
                document.getElementById('modal-prod-type').value = isCombo ? 'combo' : (p.type || p.sub_type || 'product');
                document.getElementById('modal-prod-unit').value = p.unit || (isCombo ? 'combo' : 'cái');
                document.getElementById('modal-prod-cost').value = p.cost_price ? formatMoneyNumber(p.cost_price) : '';
                document.getElementById('modal-prod-price').value = p.sell_price ? formatMoneyNumber(p.sell_price) : '';
                document.getElementById('modal-prod-stock-group').classList.add('hidden');
                const minStockEl = document.getElementById('modal-prod-min-stock');
                if (minStockEl) minStockEl.value = (p.min_stock != null) ? p.min_stock : 5;
                
                // Nạp thành phần combo nếu là combo
                if (isCombo) {
                    try {
                        const resCombo = await fetch('/api/combos/product/' + p.id);
                        if (resCombo.ok) {
                            const cData = await resCombo.json();
                            currentComboItems = (cData.items || []).map(it => ({
                                product_id: it.product_id,
                                name: it.product_name,
                                code: it.product_code,
                                sell_price: it.current_price || it.price_at_time || 0,
                                unit: it.unit || 'cái',
                                quantity: it.quantity || 1
                            }));
                        }
                    } catch (errCombo) {
                        console.warn("fetch combo detail error:", errCombo);
                    }
                }

                // Hiện nút chuyển sang nguyên liệu khi đang sửa (không áp dụng cho combo)
                if (isCombo) {
                    document.getElementById('btn-convert-to-ingredient')?.classList.add('hidden');
                } else {
                    document.getElementById('btn-convert-to-ingredient')?.classList.remove('hidden');
                }

                // Nạp NCC
                let attachedSuppIds = [];
                try {
                    const resSupp = await fetch('/api/contacts?type=supplier');
                    const allSupps = await resSupp.json();
                    if (p.supplier_names) {
                        const suppNames = p.supplier_names.split(',').map(s => s.trim().toLowerCase());
                        attachedSuppIds = allSupps.filter(s => suppNames.includes(s.name.toLowerCase())).map(s => s.id);
                    }
                    await populateProductSuppliersDropdown(attachedSuppIds);
                } catch (e) {
                    await populateProductSuppliersDropdown([]);
                }
                await loadProductCategoriesDropdown(p.category || 'Khác');
                await loadProdUnits(p.id);
                applyCostVisibility();

                onProductTypeChange();
                document.getElementById('modal-product').classList.remove('hidden');
            } catch (e) {
                console.error("openModalEditProduct error:", e);
                alert("Lỗi khi tải thông tin sản phẩm");
            }
        }

        async function convertCurrentProductToIngredient() {
            const id = document.getElementById('modal-prod-id').value;
            const name = document.getElementById('modal-prod-name').value.trim();
            if (!id) return;

            const confirmed = await window.showConfirmModal({
                title: 'Chuyển Đổi Sang Nguyên Liệu',
                message: `Bạn có chắc chắn muốn chuyển đổi "${name}" từ HÀNG HÓA sang NGUYÊN LIỆU?`,
                subMessage: '• Tồn kho và giá vốn sẽ được chuyển sang danh mục nguyên liệu.\n• Hàng hóa sẽ được rút khỏi danh mục bán POS.',
                type: 'warning',
                confirmText: 'Chuyển Đổi',
                cancelText: 'Hủy bỏ',
                icon: '🔄'
            });
            if (!confirmed) return;

            try {
                const res = await fetch(`/api/products/${id}/convert-to-ingredient`, { method: 'POST' });
                if (res.ok) {
                    const data = await res.json();
                    if (window.showToast) window.showToast(data.message || "Đã chuyển đổi thành công!", "success");
                    else alert(data.message || "Đã chuyển đổi thành công!");
                    closeModalProduct();
                    await Promise.all([loadUnifiedInventory(), loadCostIngredients()]);
                } else {
                    const err = await res.json();
                    if (window.showToast) window.showToast("Lỗi: " + (err.detail || "Không thể chuyển đổi"), "error");
                    else alert("Lỗi: " + (err.detail || "Không thể chuyển đổi"));
                }
            } catch (e) {
                console.error("convertCurrentProductToIngredient error:", e);
                if (window.showToast) window.showToast("Lỗi kết nối khi chuyển đổi!", "error");
                else alert("Lỗi kết nối khi chuyển đổi!");
            }
        }

        async function convertCurrentIngredientToProduct(ingredientId, encodedName) {
            const name = decodeURIComponent(encodedName);
            if (!ingredientId) return;

            const confirmed = await window.showConfirmModal({
                title: 'Chuyển Đổi Sang Hàng Hóa POS',
                message: `Bạn có chắc chắn muốn chuyển đổi "${name}" từ NGUYÊN LIỆU sang HÀNG HÓA bán tại POS?`,
                subMessage: '• Tồn kho nguyên liệu sẽ được chuyển sang tồn kho sản phẩm.\n• Đơn vị tính và giá vốn gần nhất sẽ được giữ nguyên.',
                type: 'transfer',
                confirmText: 'Chuyển Đổi',
                cancelText: 'Hủy bỏ',
                icon: '🛍️'
            });
            if (!confirmed) return;

            try {
                const res = await fetch(`/api/products/${ingredientId}/convert-to-product`, { method: 'POST' });
                if (res.ok) {
                    const data = await res.json();
                    if (window.showToast) window.showToast(data.message || "Đã chuyển đổi thành công sang Hàng Hóa!", "success");
                    else alert(data.message || "Đã chuyển đổi thành công sang Hàng Hóa!");
                    await Promise.all([loadUnifiedInventory(), loadCostIngredients()]);
                } else {
                    const err = await res.json();
                    if (window.showToast) window.showToast("Lỗi: " + (err.detail || "Không thể chuyển đổi"), "error");
                    else alert("Lỗi: " + (err.detail || "Không thể chuyển đổi"));
                }
            } catch (e) {
                console.error("convertCurrentIngredientToProduct error:", e);
                if (window.showToast) window.showToast("Lỗi kết nối khi chuyển đổi!", "error");
                else alert("Lỗi kết nối khi chuyển đổi!");
            }
        }
        window.convertCurrentIngredientToProduct = convertCurrentIngredientToProduct;

        let currentProdSuppliers = [];
        let selectedProdSupplierIds = [];

        async function populateProductSuppliersDropdown(selectedIds = []) {
            try {
                selectedProdSupplierIds = [...selectedIds];
                if (currentProdSuppliers.length === 0) {
                    const res = await fetch('/api/contacts?type=supplier');
                    currentProdSuppliers = await res.json();
                }
                renderProdSuppOptions();
                updateProdSuppTags();
            } catch (e) {
                console.error("populateProductSuppliersDropdown error:", e);
            }
        }

        function toggleProdSuppDropdown(e) {
            if (e) e.stopPropagation();
            const popup = document.getElementById('popup-prod-suppliers');
            if (!popup) return;
            const isHidden = popup.classList.contains('hidden');
            if (isHidden) {
                popup.classList.remove('hidden');
                document.getElementById('search-prod-supp')?.focus();
            } else {
                popup.classList.add('hidden');
            }
        }

        function closeProdSuppDropdown() {
            document.getElementById('popup-prod-suppliers')?.classList.add('hidden');
        }

        function filterProdSuppDropdown() {
            const kw = (document.getElementById('search-prod-supp')?.value || '').trim().toLowerCase();
            renderProdSuppOptions(kw);
        }

        function renderProdSuppOptions(keyword = '') {
            const container = document.getElementById('list-prod-supp-options');
            if (!container) return;

            const filtered = currentProdSuppliers.filter(s => {
                if (!keyword) return true;
                const name = (s.name || '').toLowerCase();
                const phone = (s.phone || '').toLowerCase();
                return name.includes(keyword) || phone.includes(keyword);
            });

            if (filtered.length === 0) {
                container.innerHTML = '<div class="p-3 text-center text-gray-400 italic">Không tìm thấy nhà cung cấp nào</div>';
                return;
            }

            container.innerHTML = filtered.map(s => {
                const isChecked = selectedProdSupplierIds.includes(s.id);
                return `
                    <label class="flex items-center justify-between p-1.5 hover:bg-sky-50/70 rounded cursor-pointer transition select-none group">
                        <div class="flex items-center gap-2">
                            <input type="checkbox" value="${s.id}" ${isChecked ? 'checked' : ''} 
                                   onchange="onToggleProdSuppOption(${s.id}, this.checked)"
                                   class="rounded text-sky-600 focus:ring-sky-500 w-3.5 h-3.5 cursor-pointer">
                            <span class="font-medium text-slate-800 group-hover:text-sky-700">${s.name}</span>
                        </div>
                        ${s.phone ? `<span class="text-[10px] text-gray-400 font-mono">${s.phone}</span>` : ''}
                    </label>
                `;
            }).join('');
        }

        function onToggleProdSuppOption(id, checked) {
            if (checked) {
                if (!selectedProdSupplierIds.includes(id)) selectedProdSupplierIds.push(id);
            } else {
                selectedProdSupplierIds = selectedProdSupplierIds.filter(x => x !== id);
            }
            updateProdSuppTags();
        }

        function removeSelectedProdSupp(id, e) {
            if (e) e.stopPropagation();
            selectedProdSupplierIds = selectedProdSupplierIds.filter(x => x !== id);
            renderProdSuppOptions(document.getElementById('search-prod-supp')?.value || '');
            updateProdSuppTags();
        }

        function selectAllProdSupp(select) {
            if (select) {
                const kw = (document.getElementById('search-prod-supp')?.value || '').trim().toLowerCase();
                const filtered = currentProdSuppliers.filter(s => {
                    if (!kw) return true;
                    return (s.name || '').toLowerCase().includes(kw) || (s.phone || '').toLowerCase().includes(kw);
                });
                filtered.forEach(s => {
                    if (!selectedProdSupplierIds.includes(s.id)) selectedProdSupplierIds.push(s.id);
                });
            } else {
                selectedProdSupplierIds = [];
            }
            renderProdSuppOptions(document.getElementById('search-prod-supp')?.value || '');
            updateProdSuppTags();
        }

        function updateProdSuppTags() {
            const tagsBox = document.getElementById('prod-supp-selected-tags');
            const badgeEl = document.getElementById('prod-supp-count-badge');
            if (!tagsBox) return;

            if (selectedProdSupplierIds.length === 0) {
                tagsBox.innerHTML = '<span class="text-gray-400 italic">-- Bấm để chọn nhà cung cấp --</span>';
                if (badgeEl) badgeEl.classList.add('hidden');
                return;
            }

            if (badgeEl) {
                badgeEl.textContent = `${selectedProdSupplierIds.length} đã chọn`;
                badgeEl.classList.remove('hidden');
            }

            tagsBox.innerHTML = selectedProdSupplierIds.map(id => {
                const s = currentProdSuppliers.find(x => x.id === id);
                const name = s ? s.name : `NCC #${id}`;
                return `
                    <span class="inline-flex items-center gap-1 bg-sky-50 text-sky-800 border border-sky-300 px-2 py-0.5 rounded-full text-[11px] font-medium shadow-xs">
                        <span>🏭 ${name}</span>
                        <button type="button" onclick="removeSelectedProdSupp(${id}, event)" class="hover:text-rose-600 font-bold ml-0.5 text-xs">✕</button>
                    </span>
                `;
            }).join('');
        }

        document.addEventListener('click', function(e) {
            const container = document.getElementById('container-prod-suppliers');
            if (container && !container.contains(e.target)) {
                closeProdSuppDropdown();
            }
        });

        function closeModalProduct() {
            closeProdSuppDropdown();
            document.getElementById('modal-product')?.classList.add('hidden');
        }

        async function saveProductForm() {
            const id = document.getElementById('modal-prod-id').value;
            const name = document.getElementById('modal-prod-name').value.trim();
            const code = document.getElementById('modal-prod-code').value.trim();
            const type = document.getElementById('modal-prod-type').value;
            const category = (document.getElementById('modal-prod-category')?.value || '').trim() || 'Khác';
            const unit = document.getElementById('modal-prod-unit').value.trim() || 'cái';
            // Không có quyền xem giá vốn -> gửi null để backend giữ nguyên giá vốn cũ
            const cost_price = canViewCost ? (parseMoneyInput(document.getElementById('modal-prod-cost').value)) : null;
            const sell_price = parseMoneyInput(document.getElementById('modal-prod-price').value);
            const stock = parseFloat(document.getElementById('modal-prod-stock').value) || 0;
            const min_stock = parseFloat(document.getElementById('modal-prod-min-stock')?.value) || 5.0;
            const supplier_ids = [...selectedProdSupplierIds];

            if (!name) {
                alert("Vui lòng nhập tên sản phẩm!");
                return;
            }

            if (type === 'combo') {
                if (currentComboItems.length === 0) {
                    alert("Vui lòng chọn ít nhất 1 sản phẩm con cho Gói Combo!");
                    return;
                }
            }

            try {
                let res;
                if (type === 'combo') {
                    if (id) {
                        let comboId = null;
                        try {
                            const resDetail = await fetch('/api/combos/product/' + id);
                            if (resDetail.ok) {
                                const cData = await resDetail.json();
                                comboId = cData.id;
                            }
                        } catch (eC) {}

                        if (comboId) {
                            res = await fetch(`/api/combos/${comboId}`, {
                                method: 'PUT',
                                headers: { 'Content-Type': 'application/json' },
                                body: JSON.stringify({
                                    code: code,
                                    name: name,
                                    sell_price: sell_price,
                                    items: currentComboItems.map(it => ({ product_id: it.product_id, quantity: it.quantity }))
                                })
                            });
                            if (res.ok && category) {
                                await fetch(`/api/products/${id}`, {
                                    method: 'PUT',
                                    headers: { 'Content-Type': 'application/json' },
                                    body: JSON.stringify({ category })
                                });
                            }
                        } else {
                            res = await fetch('/api/combos', {
                                method: 'POST',
                                headers: { 'Content-Type': 'application/json' },
                                body: JSON.stringify({
                                    code: code || ('CB-' + Date.now().toString().slice(-6)),
                                    name: name,
                                    sell_price: sell_price,
                                    discount_percent: 0,
                                    items: currentComboItems.map(it => ({ product_id: it.product_id, quantity: it.quantity }))
                                })
                            });
                            if (res.ok) {
                                await fetch(`/api/products/${id}`, {
                                    method: 'PUT',
                                    headers: { 'Content-Type': 'application/json' },
                                    body: JSON.stringify({ type: 'combo', category })
                                });
                            }
                        }
                    } else {
                        const finalCode = code || ('CB-' + Date.now().toString().slice(-6));
                        res = await fetch('/api/combos', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({
                                code: finalCode,
                                name: name,
                                sell_price: sell_price,
                                discount_percent: 0,
                                items: currentComboItems.map(it => ({ product_id: it.product_id, quantity: it.quantity }))
                            })
                        });
                        if (res.ok && category) {
                            try {
                                const pListRes = await fetch('/api/products');
                                const pList = await pListRes.json();
                                const pEntry = pList.find(x => x.code === finalCode);
                                if (pEntry) {
                                    await fetch(`/api/products/${pEntry.id}`, {
                                        method: 'PUT',
                                        headers: { 'Content-Type': 'application/json' },
                                        body: JSON.stringify({ category })
                                    });
                                }
                            } catch (eCat) {}
                        }
                    }
                } else if (id) {
                    // Update
                    res = await fetch(`/api/products/${id}`, {
                        method: 'PUT',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ code, name, type, unit, cost_price, sell_price, category, supplier_ids, min_stock })
                    });
                } else {
                    // Create
                    res = await fetch('/api/products', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ code, name, type, unit, cost_price, sell_price, stock, category, supplier_ids, min_stock })
                    });
                }

                if (!res.ok) {
                    const err = await res.json();
                    alert("Lỗi: " + (err.detail || "Không thể lưu sản phẩm"));
                    return;
                }

                // Lưu đơn vị quy đổi (chỉ khi đang sửa - hàng mới cần có id trước)
                if (id) {
                    const okUnits = await saveProdUnits(id);
                    if (!okUnits) return;
                }

                closeModalProduct();
                await Promise.all([loadUnifiedInventory(), loadCostProductOptions(), loadProductCategoriesDropdown()]);
                if (typeof loadPriceListCategories === 'function') loadPriceListCategories();
                if (typeof showToast === 'function') {
                    showToast(id ? 'Đã cập nhật hàng hóa' : 'Đã thêm hàng hóa mới', 'success');
                } else {
                    alert(id ? "Đã cập nhật hàng hóa thành công!" : "Đã thêm hàng hóa mới thành công!");
                }
            } catch (e) {
                console.error("saveProductForm error:", e);
                alert("Lỗi kết nối khi lưu sản phẩm");
            }
        }

        async function clearAllProductsQuick() {
            const confirmed = await window.showConfirmModal({
                title: 'Xóa Sạch Toàn Bộ Hàng Hóa',
                message: 'Bạn có chắc chắn muốn <span class="font-bold text-rose-600">XÓA SẠCH toàn bộ danh mục hàng hóa</span> trong hệ thống?',
                subMessage: 'Thao tác này chỉ xóa Hàng Hóa để bạn Import lại từ file Excel mới. Dữ liệu Nguyên Liệu Kho, Sổ Quỹ Thu Chi và Khách Hàng vẫn được giữ nguyên an toàn.',
                confirmText: 'Xác nhận xóa sạch',
                cancelText: 'Hủy bỏ',
                type: 'danger'
            });

            if (!confirmed) return;

            try {
                const res = await fetch('/api/products/clear/all-products', { method: 'DELETE' });
                const data = await res.json();
                if (res.ok) {
                    window.showToast ? window.showToast(data.message || 'Đã dọn sạch hàng hóa thành công!', 'success', 3500) : alert(data.message);
                    await Promise.all([loadUnifiedInventory(), loadCostProductOptions()]);
                } else {
                    window.showToast ? window.showToast('Lỗi: ' + (data.detail || 'Không thể xóa'), 'error') : alert('Lỗi: ' + (data.detail || 'Không thể xóa'));
                }
            } catch (e) {
                console.error('clearAllProductsQuick error:', e);
                window.showToast ? window.showToast('Lỗi kết nối máy chủ', 'error') : alert('Lỗi kết nối khi dọn sạch hàng hóa');
            }
        }
        window.clearAllProductsQuick = clearAllProductsQuick;

        async function deleteProductItem(productId, encodedName) {
            const name = decodeURIComponent(encodedName);
            const confirmed = await window.showConfirmModal({
                title: 'Xóa hoặc Ẩn Hàng Hóa',
                message: `Bạn có chắc chắn muốn xóa/ẩn hàng hóa <span class="font-bold text-rose-600">"${name}"</span>?`,
                subMessage: 'Hệ thống tự động kiểm tra: Nếu hàng hóa chưa từng có giao dịch bán hoặc nhập, hệ thống sẽ XÓA HẲN. Nếu đã có lịch sử hóa đơn, hàng sẽ được ẨN để bảo toàn dữ liệu sổ sách kế toán.',
                confirmText: 'Đồng ý thực hiện',
                cancelText: 'Hủy bỏ',
                type: 'danger'
            });

            if (!confirmed) return;

            try {
                const res = await fetch(`/api/products/${productId}`, { method: 'DELETE' });
                const data = await res.json();
                if (res.ok) {
                    if (window.showToast) {
                        window.showToast(data.message || `Đã xử lý hàng hóa "${name}"`, 'success');
                    } else {
                        alert(data.message || `Đã xử lý thành công!`);
                    }
                    await Promise.all([loadUnifiedInventory(), loadCostProductOptions()]);
                } else {
                    if (window.showToast) {
                        window.showToast("Lỗi: " + (data.detail || "Không thể thực hiện"), 'error');
                    } else {
                        alert("Lỗi: " + (data.detail || "Không thể thực hiện"));
                    }
                }
            } catch (e) {
                console.error("deleteProductItem error:", e);
                window.showToast ? window.showToast("Lỗi kết nối máy chủ", 'error') : alert("Lỗi kết nối khi xóa hàng hóa");
            }
        }

        async function restoreProductItem(productId, encodedName) {
            const name = decodeURIComponent(encodedName);
            const confirmed = await window.showConfirmModal({
                title: 'Khôi Phục Hàng Hóa',
                message: `Bạn có muốn BỎ ẨN (khôi phục) hàng hóa <span class="font-bold text-indigo-600">"${name}"</span>?`,
                subMessage: 'Hàng hóa sẽ xuất hiện lại bình thường trong bảng tồn kho và màn hình bán hàng POS.',
                confirmText: 'Khôi phục ngay',
                cancelText: 'Giữ nguyên',
                type: 'primary'
            });

            if (!confirmed) return;

            try {
                const res = await fetch(`/api/products/${productId}/restore`, { method: 'POST' });
                const data = await res.json();
                if (res.ok) {
                    window.showToast ? window.showToast(`Đã khôi phục hàng hóa "${name}"`, 'success') : alert(`Đã khôi phục thành công!`);
                    await Promise.all([loadUnifiedInventory(), loadCostProductOptions()]);
                } else {
                    window.showToast ? window.showToast("Lỗi: " + (data.detail || "Không thể khôi phục"), 'error') : alert("Lỗi: " + (data.detail || "Không thể khôi phục"));
                }
            } catch (e) {
                console.error("restoreProductItem error:", e);
                window.showToast ? window.showToast("Lỗi kết nối máy chủ", 'error') : alert("Lỗi kết nối khi khôi phục hàng hóa");
            }
        }

        async function deleteIngredientItem(ingId, encodedName) {
            const name = decodeURIComponent(encodedName);
            const confirmed = await window.showConfirmModal({
                title: 'Xóa Nguyên Vật Liệu',
                message: `Bạn có chắc chắn muốn XÓA nguyên liệu <span class="font-bold text-rose-600">"${name}"</span>?`,
                subMessage: 'Cảnh báo: Dữ liệu tồn kho, giá nhập và liên kết BOM liên quan đến nguyên liệu này sẽ bị dọn dẹp.',
                confirmText: 'Xóa nguyên liệu',
                cancelText: 'Hủy bỏ',
                type: 'danger'
            });

            if (!confirmed) return;

            try {
                const res = await fetch(`/api/ingredients/${ingId}`, { method: 'DELETE' });
                if (res.ok) {
                    window.showToast ? window.showToast(`Đã xóa nguyên liệu "${name}"`, 'success') : alert(`Đã xóa thành công!`);
                    await Promise.all([loadCostIngredients(), loadUnifiedInventory()]);
                } else {
                    const err = await res.json();
                    window.showToast ? window.showToast("Lỗi: " + (err.detail || "Không thể xóa"), 'error') : alert("Lỗi: " + (err.detail || "Không thể xóa nguyên liệu"));
                }
            } catch (e) {
                console.error("deleteIngredientItem error:", e);
                window.showToast ? window.showToast("Lỗi kết nối máy chủ", 'error') : alert("Lỗi kết nối khi xóa nguyên liệu");
            }
        }

        // --- MODAL XUẤT HỦY HÀNG HÓA ---
        async function openModalWriteOff(itemType = null, itemId = null) {
            const selectEl = document.getElementById('modal-wo-select-item');
            const whSelect = document.getElementById('modal-wo-warehouse');
            if (whSelect && allWarehouses.length > 0) {
                whSelect.innerHTML = allWarehouses.map(w => `<option value="${w.id}">${w.name}</option>`).join('');
            }

            // Nạp droplist mặt hàng
            if (selectEl && unifiedInventoryData.length > 0) {
                selectEl.innerHTML = '<option value="">-- Chọn mặt hàng muốn xuất hủy --</option>' + 
                    unifiedInventoryData.map(item => `
                        <option value="${item.item_type}_${item.id}">[${item.item_type === 'product' ? 'Hàng hóa' : 'Nguyên liệu'}] ${item.code || ''} - ${item.name} (Tồn: ${item.quantity} ${item.unit || ''})</option>
                    `).join('');
            }

            if (itemType && itemId) {
                const key = `${itemType}_${itemId}`;
                if (selectEl) selectEl.value = key;
                onWriteOffItemSelected(key);
            } else {
                if (selectEl && selectEl.options.length > 1) {
                    selectEl.selectedIndex = 1;
                    onWriteOffItemSelected(selectEl.value);
                }
            }

            document.getElementById('modal-wo-qty').value = '';
            document.getElementById('modal-wo-note').value = '';
            document.getElementById('modal-write-off').classList.remove('hidden');
        }

        function onWriteOffItemSelected(val) {
            if (!val) {
                document.getElementById('modal-wo-item-name').innerText = 'Chưa chọn mặt hàng';
                document.getElementById('modal-wo-item-code').innerText = '-';
                document.getElementById('modal-wo-item-current-stock').innerText = '0';
                document.getElementById('modal-wo-item-unit').innerText = 'cái';
                document.getElementById('modal-wo-item-type').value = '';
                document.getElementById('modal-wo-item-id').value = '';
                return;
            }

            const [type, idStr] = val.split('_');
            const id = parseInt(idStr);
            const found = unifiedInventoryData.find(x => x.item_type === type && x.id === id);
            if (found) {
                document.getElementById('modal-wo-item-type').value = type;
                document.getElementById('modal-wo-item-id').value = id;
                document.getElementById('modal-wo-item-name').innerText = found.name;
                document.getElementById('modal-wo-item-code').innerText = found.code || '-';
                document.getElementById('modal-wo-item-current-stock').innerText = found.quantity.toLocaleString('vi-VN');
                document.getElementById('modal-wo-item-unit').innerText = found.unit || 'cái';
            }
        }

        function closeModalWriteOff() {
            document.getElementById('modal-write-off')?.classList.add('hidden');
        }

        async function submitWriteOff() {
            const item_type = document.getElementById('modal-wo-item-type').value;
            const item_id = parseInt(document.getElementById('modal-wo-item-id').value);
            const warehouse_id = parseInt(document.getElementById('modal-wo-warehouse').value) || 1;
            const quantity = parseFloat(document.getElementById('modal-wo-qty').value);
            const reason = document.getElementById('modal-wo-reason').value;
            const note = document.getElementById('modal-wo-note').value.trim();

            if (!item_id || !item_type) {
                alert("Vui lòng chọn mặt hàng cần xuất hủy!");
                return;
            }
            if (!quantity || quantity <= 0) {
                alert("Vui lòng nhập số lượng xuất hủy hợp lệ (> 0)!");
                return;
            }

            try {
                const res = await fetch('/api/inventory/write-off', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        warehouse_id,
                        note,
                        items: [{ item_type, item_id, quantity, reason }]
                    })
                });

                if (!res.ok) {
                    const err = await res.json();
                    alert("Lỗi: " + (err.detail || "Không thể xuất hủy hàng hóa"));
                    return;
                }

                closeModalWriteOff();
                await loadUnifiedInventory();
                alert(`Đã xuất hủy thành công ${quantity} sản phẩm! Tồn kho đã được trừ và ghi vào thẻ kho.`);
            } catch (e) {
                console.error("submitWriteOff error:", e);
                alert("Lỗi kết nối khi gửi yêu cầu xuất hủy");
            }
        }


        let allProducts = [];
        let allContacts = [];
        let allStaff = [];
        let posCart = [];
        let purchaseCart = [];

        function formatMoney(num) {
            return new Intl.NumberFormat('vi-VN').format(num) + ' đ';
        }

        function formatMoneyNumber(val) {
            if (!val && val !== 0) return '';
            const n = Math.round(Number(val) || 0);
            return n > 0 ? n.toLocaleString('vi-VN') : '';
        }
        window.formatMoneyNumber = formatMoneyNumber;

        function parseMoneyInput(val) {
            if (!val && val !== 0) return 0;
            const clean = String(val).replace(/[^\d]/g, '');
            return Number(clean) || 0;
        }
        window.parseMoneyInput = parseMoneyInput;

        function formatCurrencyInputRealtime(el) {
            if (!el) return;
            const pos = el.selectionStart;
            const oldLen = el.value.length;
            const raw = parseMoneyInput(el.value);
            el.value = raw > 0 ? raw.toLocaleString('vi-VN') : '';
            const newLen = el.value.length;
            const newPos = Math.max(0, pos + (newLen - oldLen));
            try { el.setSelectionRange(newPos, newPos); } catch(_) {}
        }
        window.formatCurrencyInputRealtime = formatCurrencyInputRealtime;

        function formatMaskedPhone(phone) {
            if (!phone) return '<span class="text-slate-400 italic">Chưa có</span>';
            const clean = String(phone).trim();
            if (clean.length < 6) return `<span class="font-mono text-slate-700">${clean}</span>`;
            const prefix = clean.slice(0, 3);
            const suffix = clean.slice(-3);
            const masked = `${prefix}****${suffix}`;
            return `<span class="masked-phone font-mono cursor-pointer text-slate-700 hover:text-indigo-600 transition-colors select-none" title="${clean} (Rê chuột xem, Click để sao chép)" data-full-phone="${clean}" onmouseenter="this.textContent=this.dataset.fullPhone" onmouseleave="this.textContent='${masked}'" onclick="if(navigator.clipboard){navigator.clipboard.writeText('${clean}');if(window.showToast)showToast('Đã sao chép SĐT: ${clean}');}">${masked}</span>`;
        }
        window.formatMaskedPhone = formatMaskedPhone;

        function renderTableSkeleton(tbodyOrId, rows = 5, cols = 8) {
            const tbody = typeof tbodyOrId === 'string' ? document.getElementById(tbodyOrId) : tbodyOrId;
            if (!tbody) return;
            const widths = ['w-16', 'w-32', 'w-24', 'w-28', 'w-20', 'w-24', 'w-16', 'w-20', 'w-28', 'w-24', 'w-16', 'w-20', 'w-16'];
            let html = '';
            for (let r = 0; r < rows; r++) {
                html += `<tr class="card-row card-row-anim" style="--row-idx: ${r};">`;
                for (let c = 0; c < cols; c++) {
                    const w = widths[(r + c) % widths.length];
                    html += `<td class="p-3"><div class="skeleton-bar h-4 ${w}"></div></td>`;
                }
                html += '</tr>';
            }
            tbody.innerHTML = html;
        }
        window.renderTableSkeleton = renderTableSkeleton;

        /* Modern Top Slim Loading Progress Bar Helpers */
        let pageLoaderTimeout = null;
        function startPageLoader() {
            const l = document.getElementById('global-page-loader');
            if (!l) return;
            if (pageLoaderTimeout) clearTimeout(pageLoaderTimeout);
            l.classList.remove('finishing');
            l.classList.add('loading');
        }
        window.startPageLoader = startPageLoader;

        function stopPageLoader(delay = 200) {
            const l = document.getElementById('global-page-loader');
            if (!l) return;
            if (pageLoaderTimeout) clearTimeout(pageLoaderTimeout);
            pageLoaderTimeout = setTimeout(() => {
                l.classList.remove('loading');
                l.classList.add('finishing');
                setTimeout(() => {
                    l.classList.remove('finishing');
                }, 250);
            }, delay);
        }
        window.stopPageLoader = stopPageLoader;

        function renderPaginationBar(containerId, currentPage, totalPages, totalItems, onPageChangeName) {
            const container = typeof containerId === 'string' ? document.getElementById(containerId) : containerId;
            if (!container) return;
            if (totalItems <= 20) {
                container.innerHTML = totalItems > 0 ? `<div class="text-xs text-slate-500 font-medium py-2 px-1">Tổng cộng <b>${totalItems}</b> dòng</div>` : '';
                return;
            }
            
            const start = (currentPage - 1) * 20 + 1;
            const end = Math.min(currentPage * 20, totalItems);
            
            container.innerHTML = `
                <div class="flex flex-wrap items-center justify-between gap-2 py-3 px-2 text-xs border-t border-slate-200 select-none">
                    <div class="text-slate-600 font-medium">
                        Hiển thị <b>${start} - ${end}</b> / <b>${totalItems}</b> dòng
                    </div>
                    <div class="flex items-center gap-1.5">
                        <button onclick="${onPageChangeName}(${currentPage - 1})" ${currentPage <= 1 ? 'disabled class="px-2.5 py-1 rounded-lg border border-slate-200 text-slate-300 cursor-not-allowed bg-slate-50"' : 'class="px-2.5 py-1 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 font-semibold shadow-2xs cursor-pointer transition"'} title="Trang trước">◀ Trước</button>
                        <span class="px-3 py-1 font-bold text-sky-700 bg-sky-50 border border-sky-200 rounded-lg">Trang ${currentPage} / ${totalPages}</span>
                        <button onclick="${onPageChangeName}(${currentPage + 1})" ${currentPage >= totalPages ? 'disabled class="px-2.5 py-1 rounded-lg border border-slate-200 text-slate-300 cursor-not-allowed bg-slate-50"' : 'class="px-2.5 py-1 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 font-semibold shadow-2xs cursor-pointer transition"'} title="Trang sau">Sau ▶</button>
                    </div>
                </div>
            `;
        }
        window.renderPaginationBar = renderPaginationBar;

        function switchTab(tabId, subTabId) {
            console.log("switchTab activated:", tabId, subTabId);
            // Map legacy ids
            if (tabId === 'products') { tabId = 'inventory'; subTabId = 'products'; }
            else if (tabId === 'cost-management') { tabId = 'inventory'; subTabId = 'cost'; }
            else if (tabId === 'production') { tabId = 'inventory'; subTabId = 'production'; }
            else if (tabId === 'company') { tabId = 'settings'; subTabId = 'company'; }

            const tabBtn = document.querySelector(`.tab-btn[data-tab="${tabId}"]`);
            if (tabBtn && tabBtn.style.display === 'none' && typeof Auth !== 'undefined') {
                const user = Auth.getUser();
                if (user && user.role !== 'owner' && user.role !== 'admin') {
                    console.warn(`Access denied to tab ${tabId}`);
                    return;
                }
            }
            startPageLoader();

            document.querySelectorAll('[id^="tab-"]').forEach(el => {
                el.classList.add('hidden');
                el.classList.remove('tab-pane-content');
            });
            const targetTab = document.getElementById('tab-' + tabId);
            if (targetTab) {
                targetTab.classList.remove('hidden');
                void targetTab.offsetWidth; // Trigger reflow để animation tabContentSmoothIn chạy mượt mà không giật
                targetTab.classList.add('tab-pane-content');
            }

            const mainContainer = document.getElementById('main-content-area');
            if (mainContainer) {
                if (tabId === 'pos') {
                    mainContainer.className = "flex-1 overflow-hidden p-0 flex flex-col bg-slate-100";
                } else {
                    mainContainer.className = "flex-1 overflow-y-auto p-3 md:p-6 pb-20 md:pb-6 bg-slate-100";
                }
            }

            // Ẩn floating bars nếu rời khỏi tab tương ứng
            if (tabId !== 'inventory') {
                const uBar = document.getElementById('unified-bulk-action-bar');
                if (uBar) { uBar.classList.add('hidden'); uBar.classList.remove('flex'); }
            } else {
                updateUnifiedBulkActionBar();
            }
            if (tabId !== 'orders') {
                const oBar = document.getElementById('orders-bulk-action-bar');
                if (oBar) oBar.classList.add('hidden');
            }

            // Đóng mobile sidebar drawer nếu đang mở
            if (typeof toggleMobileSidebar === 'function') {
                toggleMobileSidebar(false);
            }

            // Đồng bộ trạng thái active trên Mobile Bottom Bar
            document.querySelectorAll('.mob-bottom-btn').forEach(b => {
                b.classList.remove('text-sky-600');
                b.classList.add('text-slate-400');
                const span = b.querySelector('span');
                if (span) { span.classList.remove('font-bold'); span.classList.add('font-semibold'); }
            });
            const activeMobBtn = document.getElementById('mob-nav-' + tabId);
            if (activeMobBtn) {
                activeMobBtn.classList.add('text-sky-600');
                activeMobBtn.classList.remove('text-slate-400');
                const span = activeMobBtn.querySelector('span');
                if (span) { span.classList.add('font-bold'); span.classList.remove('font-semibold'); }
            }

            document.querySelectorAll('.tab-btn').forEach(b => {
                const btnTab = b.dataset.tab || (b.getAttribute('onclick') && b.getAttribute('onclick').includes("'" + tabId + "'") ? tabId : '');
                if (btnTab === tabId) {
                    b.classList.add('active-tab');
                } else {
                    b.classList.remove('active-tab');
                }
            });

            if (tabId === 'inventory') {
                renderTableSkeleton('table-products', 6, 8);
                if (subTabId) switchInvSubTab(subTabId);
                else switchInvSubTab('unified');
            } else if (tabId === 'settings') {
                if (subTabId) switchSettingsSubTab(subTabId);
                else switchSettingsSubTab('templates');
            } else if (tabId === 'pet-services') {
                renderTableSkeleton('table-pet-services', 6, 13);
                if (typeof loadAllPetsList === 'function') loadAllPetsList();
                if (typeof loadPetServicesKPI === 'function') loadPetServicesKPI();
                if (typeof loadPetServicesList === 'function') loadPetServicesList();
            } else if (tabId === 'contacts') {
                renderTableSkeleton('table-customers', 5, 6);
                renderTableSkeleton('table-suppliers', 5, 6);
                loadContacts();
            } else if (tabId === 'cashbook') {
                renderTableSkeleton('table-cashbook', 6, 8);
                loadCashbook();
            } else if (tabId === 'marketplace') {
                if (typeof initMarketplaceTab === 'function') initMarketplaceTab(subTabId);
            } else if (tabId === 'reports') {
                if (typeof initReportsAnalytics === 'function') {
                    initReportsAnalytics();
                } else if (typeof loadReportsAnalytics === 'function') {
                    loadReportsAnalytics();
                } else {
                    loadReports();
                }
            } else if (tabId === 'shifts') {
                if (typeof loadShiftsHistory === 'function') loadShiftsHistory();
            } else if (tabId === 'hrm') {
                if (typeof initHrmTab === 'function') initHrmTab();
            } else if (tabId === 'purchases') {
                renderTableSkeleton('table-purchases-history', 5, 10);
                initPurchases();
                loadPurchasesList();
            } else if (tabId === 'pos') {
                if (typeof window.clearPriceListsCache === 'function') window.clearPriceListsCache();
                if (typeof window.initPOSModule === 'function') {
                    window.initPOSModule();
                } else if (typeof initPOS === 'function') {
                    initPOS();
                }
                setTimeout(() => {
                    const loginOverlay = document.getElementById('login-overlay');
                    if (!loginOverlay || loginOverlay.style.display === 'none') {
                        document.getElementById('pos-search-input')?.focus();
                    }
                }, 100);
            } else if (tabId === 'hotel') {
                if (window.hotelManager && typeof window.hotelManager.init === 'function') {
                    window.hotelManager.init();
                }
            } else if (tabId === 'orders') {
                const isSpaSubtabActive = document.getElementById('orders-subview-spa') && !document.getElementById('orders-subview-spa').classList.contains('hidden');
                if (isSpaSubtabActive && typeof loadSpaInvoicesList === 'function') {
                    loadSpaInvoicesList();
                } else if (typeof loadOrdersList === 'function') {
                    loadOrdersList();
                }
            } else if (tabId === 'price-lists') {
                if(typeof loadPriceLists === 'function') loadPriceLists();
                if(typeof loadProductsForPriceList === 'function') loadProductsForPriceList();
                if(typeof loadSegments === 'function') loadSegments();
            } else if (tabId === 'oem') {
                if(typeof loadOEMData === 'function') loadOEMData();
            } else if (tabId === 'cashflow-debts') {
                if(typeof loadCashflowDebtsData === 'function') loadCashflowDebtsData();
            } else if (tabId === 'guide') {
                if (subTabId) switchGuideSubTab(subTabId);
                else switchGuideSubTab('pos');
            } else if (tabId === 'ai-agent') {
                if (typeof window.syncMyAIBadge === 'function') window.syncMyAIBadge();
            } else if (tabId === 'purchase-requests') {
                if (typeof window.initPurchaseRequestsTab === 'function') window.initPurchaseRequestsTab();
            }
            stopPageLoader(220);
        }

        function switchGuideSubTab(subId) {
            const panels = document.querySelectorAll('.guide-sub-panel');
            panels.forEach(p => p.classList.add('hidden'));

            const targetPanel = document.getElementById('guide-sub-' + subId);
            if (targetPanel) {
                targetPanel.classList.remove('hidden');
            }

            const contentArea = document.getElementById('guide-content-area');
            if (contentArea) contentArea.scrollTop = 0;

            const buttons = document.querySelectorAll('.guide-nav-btn');
            buttons.forEach(btn => {
                const guideKey = btn.dataset.guide;
                const badge = btn.querySelector('span > span');
                if (guideKey === subId) {
                    btn.className = "guide-nav-btn w-full flex items-center justify-between px-3 py-2.5 rounded-xl font-bold bg-purple-100 text-purple-800 transition";
                    if (badge) {
                        badge.className = "w-5 h-5 rounded-lg bg-purple-200 text-purple-800 flex items-center justify-center text-[10px] font-black shrink-0";
                    }
                } else {
                    btn.className = "guide-nav-btn w-full flex items-center justify-between px-3 py-2.5 rounded-xl font-medium text-slate-600 hover:bg-slate-100 transition";
                    if (badge) {
                        badge.className = "w-5 h-5 rounded-lg bg-slate-200 text-slate-700 flex items-center justify-center text-[10px] font-bold shrink-0";
                    }
                }
            });
        }
        window.switchGuideSubTab = switchGuideSubTab;
        window.switchTab = switchTab;

        function applyAppZoom(delta) {
            let current = parseInt(localStorage.getItem('appZoom') || '100', 10);
            current = Math.min(150, Math.max(80, current + delta));
            localStorage.setItem('appZoom', String(current));
            document.documentElement.style.fontSize = (current / 100 * 16) + 'px';
            const disp = document.getElementById('app-zoom-display');
            if (disp) disp.textContent = current + '%';
        }
        function initAppZoom() {
            const saved = parseInt(localStorage.getItem('appZoom') || '100', 10);
            document.documentElement.style.fontSize = (saved / 100 * 16) + 'px';
            const disp = document.getElementById('app-zoom-display');
            if (disp) disp.textContent = saved + '%';
        }

        function toggleSidebarCollapse() {
            const sidebar = document.getElementById('main-sidebar');
            if (!sidebar) return;
            sidebar.classList.toggle('collapsed');
            const isCollapsed = sidebar.classList.contains('collapsed');
            try {
                localStorage.setItem('pos_sidebar_collapsed', isCollapsed ? '1' : '0');
            } catch(e){}
            const btn = document.getElementById('btn-toggle-sidebar');
            if (btn) {
                btn.innerHTML = isCollapsed ? '▶' : '◀';
                btn.title = isCollapsed ? 'Mở rộng menu' : 'Thu gọn menu';
            }
            const tooltip = document.getElementById('sidebar-floating-tooltip');
            if (tooltip) tooltip.classList.add('hidden');
        }
        window.toggleSidebarCollapse = toggleSidebarCollapse;

        function initSidebarTooltip() {
            const tooltip = document.getElementById('sidebar-floating-tooltip');
            const tooltipText = document.getElementById('sidebar-tooltip-text');
            const sidebar = document.getElementById('main-sidebar');
            if (!tooltip || !tooltipText || !sidebar) return;

            sidebar.addEventListener('mouseover', (e) => {
                if (!sidebar.classList.contains('collapsed')) {
                    tooltip.classList.add('hidden');
                    return;
                }
                const btn = e.target.closest('.tab-btn, #btn-toggle-sidebar, #sidebar-user-footer button');
                if (!btn) {
                    tooltip.classList.add('hidden');
                    return;
                }
                const label = btn.getAttribute('data-tooltip') || btn.getAttribute('title') || btn.querySelector('.sidebar-text')?.textContent?.trim();
                if (!label) {
                    tooltip.classList.add('hidden');
                    return;
                }

                tooltipText.textContent = label;
                tooltip.classList.remove('hidden');

                const rect = btn.getBoundingClientRect();
                const tipHeight = tooltip.offsetHeight || 30;
                tooltip.style.left = (rect.right + 10) + 'px';
                tooltip.style.top = Math.max(8, rect.top + (rect.height - tipHeight) / 2) + 'px';
            });

            sidebar.addEventListener('mouseout', (e) => {
                const btn = e.target.closest('.tab-btn, #btn-toggle-sidebar, #sidebar-user-footer button');
                if (btn) {
                    tooltip.classList.add('hidden');
                }
            });
        }
        window.initSidebarTooltip = initSidebarTooltip;

        function initSidebarState() {
            try {
                if (localStorage.getItem('pos_sidebar_collapsed') === '1') {
                    const sidebar = document.getElementById('main-sidebar');
                    if (sidebar) sidebar.classList.add('collapsed');
                    const btn = document.getElementById('btn-toggle-sidebar');
                    if (btn) {
                        btn.innerHTML = '▶';
                        btn.title = 'Mở rộng menu';
                    }
                }
            } catch(e){}
            initSidebarTooltip();
        }
        window.initSidebarState = initSidebarState;

        async function init() {
            initAppZoom();
            initSidebarState();
            // Tải cấu hình cài đặt chung trước để hiển thị tiêu đề và logo
            try {
                const res = await fetch('/api/settings');
                if (res.ok) {
                    const st = await res.json();
                    if (typeof updateAppTitleUI === 'function') {
                        updateAppTitleUI(st.app_name || st.shop_name, st.shop_logo);
                    }
                }
            } catch (_) {}

            try {
                if (typeof loadContacts === 'function') loadContacts();
                if (typeof loadStaff === 'function') loadStaff();
                if (typeof initPurchases === 'function') initPurchases();
                if (typeof initProduction === 'function') initProduction();
                if (typeof loadAndSyncPetCatalog === 'function') loadAndSyncPetCatalog();
            } catch(e) {
                console.warn('init background modules err:', e);
            }
            switchTab('ai-agent');
        }

        async function loadProducts() {
            const res = await fetch('/api/products');
            allProducts = await res.json();
            
            const tbody = document.getElementById('table-products');
            if (!tbody) return;
            tbody.innerHTML = allProducts.map(p => `
                <tr class="border-b hover:bg-gray-50">
                    <td class="p-3 font-mono text-xs font-bold">${p.code}</td>
                    <td class="p-3 font-medium">${p.name}</td>
                    <td class="p-3"><span class="px-2 py-0.5 rounded text-xs ${p.type === 'service' ? 'bg-indigo-100 text-indigo-700' : p.type === 'material' ? 'bg-amber-100 text-amber-700' : 'bg-emerald-100 text-emerald-700'}">${p.type}</span></td>
                    <td class="p-3">
                        ${p.supplier_names 
                            ? p.supplier_names.split(',').map(s => `<span class="inline-block bg-slate-100 text-slate-700 border border-slate-200 text-[10px] font-medium px-1.5 py-0.5 rounded mr-1 mb-0.5">🏭 ${s.trim()}</span>`).join('')
                            : '<span class="text-gray-400 italic text-xs">---</span>'}
                    </td>
                    <td class="p-3 text-right">${formatMoney(p.cost_price)}</td>
                    <td class="p-3 text-right font-bold text-sky-600">${formatMoney(p.sell_price)}</td>
                    <td class="p-3 text-right font-bold ${p.stock <= 5 ? 'text-red-500' : ''}">${p.stock}</td>
                    <td class="p-3 text-gray-500">${p.unit}</td>
                </tr>
            `).join('');
        }

        // =========================================================================
        // [LEGO MODULE: CONTACTS] ĐÃ TÁCH SANG static/js/modules/contacts.js
        // =========================================================================


        async function loadStaff() {
            try {
                const res = await fetch('/api/staff');
                allStaff = await res.json();
                const staffSelect = document.getElementById('pos-staff') || document.getElementById('pos-staff-select');
                if (staffSelect) {
                    staffSelect.innerHTML = allStaff.map(s => `<option value="${s.id}">${s.name} (${s.commission_rate}%)</option>`).join('');
                }
            } catch (e) {
                console.error("loadStaff error:", e);
            }
        }

        function renderPOSProducts() {
            const el = document.getElementById('search-pos-product');
            if (!el) return;
            const q = el.value.toLowerCase();
            const filtered = allProducts.filter(p => p.type !== 'material' && (p.name.toLowerCase().includes(q) || p.code.toLowerCase().includes(q)));
            
            const container = document.getElementById('pos-product-list');
            if (!container) return;
            container.innerHTML = filtered.map(p => `
                <div onclick="addToCart(${p.id})" class="border rounded-lg p-3 hover:border-sky-500 cursor-pointer bg-white shadow-sm flex flex-col justify-between">
                    <div>
                        <div class="text-xs text-gray-400 font-mono">${p.code}</div>
                        <div class="font-medium text-sm line-clamp-2">${p.name}</div>
                    </div>
                    <div class="mt-2 flex justify-between items-center">
                        <span class="text-sky-600 font-bold">${formatMoney(p.sell_price)}</span>
                        <span class="text-xs text-gray-500">Tồn: ${p.type === 'service' ? '∞' : p.stock}</span>
                    </div>
                </div>
            `).join('');
        }

        function addToCart(productId) {
            const p = allProducts.find(x => x.id === productId);
            if (!p) return;
            const exist = posCart.find(x => x.product_id === productId);
            if (exist) {
                exist.quantity += 1;
            } else {
                posCart.push({ product_id: p.id, name: p.name, price: p.sell_price, quantity: 1 });
            }
            renderPOSCart();
        }

        function renderPOSCart() {
            const container = document.getElementById('pos-cart');
            if (!container) return;
            if (posCart.length === 0) {
                container.innerHTML = '<div class="text-gray-400 text-center py-8">Chưa có sản phẩm nào</div>';
                calculatePOSTotals();
                return;
            }
            container.innerHTML = posCart.map((item, idx) => `
                <div class="flex justify-between items-center border-b pb-2">
                    <div class="flex-1 pr-2">
                        <div class="font-medium">${item.name}</div>
                        <div class="text-xs text-gray-500">${formatMoney(item.price)}</div>
                    </div>
                    <div class="flex items-center gap-1">
                        <input type="number" value="${item.quantity}" min="1" class="border w-12 text-center rounded p-0.5 text-xs" onchange="posCart[${idx}].quantity = parseFloat(this.value); renderPOSCart()">
                        <button onclick="posCart.splice(${idx}, 1); renderPOSCart()" class="text-red-500 text-xs px-1">✕</button>
                    </div>
                </div>
            `).join('');
            calculatePOSTotals();
        }

        function calculatePOSTotals() {
            const total = posCart.reduce((sum, i) => sum + (i.price * i.quantity), 0);
            const discountInput = document.getElementById('pos-discount');
            const discount = discountInput ? (parseFloat(discountInput.value) || 0) : 0;
            const finalAmount = Math.max(0, total - discount);
            const paidInput = document.getElementById('pos-paid');
            
            if (paidInput) {
                if (!paidInput.dataset.manual) {
                    paidInput.value = finalAmount;
                }
                const paid = parseFloat(paidInput.value) || 0;
                const debt = Math.max(0, finalAmount - paid);
                const debtEl = document.getElementById('pos-debt');
                if (debtEl) debtEl.innerText = formatMoney(debt);
            }

            const totalEl = document.getElementById('pos-total');
            if (totalEl) totalEl.innerText = formatMoney(total);
            const finalEl = document.getElementById('pos-final');
            if (finalEl) finalEl.innerText = formatMoney(finalAmount);
        }

        document.getElementById('pos-paid')?.addEventListener('input', function() {
            this.dataset.manual = "true";
            calculatePOSTotals();
        });

        async function submitOrder() {
            if (posCart.length === 0) return alert('Giỏ hàng trống!');
            const req = {
                customer_id: parseInt(document.getElementById('pos-customer').value),
                staff_id: parseInt(document.getElementById('pos-staff').value),
                discount: parseFloat(document.getElementById('pos-discount').value) || 0,
                paid_amount: parseFloat(document.getElementById('pos-paid').value) || 0,
                items: posCart.map(i => ({ product_id: i.product_id, quantity: i.quantity, price: i.price }))
            };

            const res = await fetch('/api/orders', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(req)
            });
            const data = await res.json();
            if (res.ok) {
                posCart = [];
                document.getElementById('pos-paid').dataset.manual = "";
                renderPOSCart();
                loadProducts();
                // Bat popup in hoa don ngay
                showPrintModal(data.order_code);
            } else {
                alert('Lỗi: ' + data.detail);
            }

        }

        // Nhap hang (Phieu Mua Hang / Nhap Ton Kho Nhieu Mat Hang)
        // purchaseCart da khai bao o tren
        // allWarehousesList dung chung
        purchaseCart = [];
        allWarehousesList = [];

        function removeVietnameseTones(str) {
            if (!str) return '';
            return str.normalize('NFD')
                      .replace(/[̀-ͯ]/g, '')
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

        // =========================================================================
        // [LEGO MODULE: PURCHASES / NHẬP HÀNG] ĐÃ TÁCH SANG static/js/modules/purchases.js
        // =========================================================================

        // =========================================================================
        // [LEGO MODULE: PRODUCTIONS, BOM & OEM] ĐÃ TÁCH SANG static/js/modules/productions.js
        // =========================================================================
        // =========================================================================
        // [LEGO MODULE: CASHFLOW & DEBTS] ĐÃ TÁCH SANG static/js/modules/cashflow.js
        // =========================================================================

        // --- QUẢN LÝ VÀ XÓA DỮ LIỆU ---
        let currentResetMode = null;

        function openResetDataModal(mode) {
            currentResetMode = mode;
            const modal = document.getElementById('modal-reset-data');
            const desc = document.getElementById('reset-data-modal-desc');
            const chk = document.getElementById('reset-data-check');
            const txt = document.getElementById('reset-data-confirm-text');
            const btn = document.getElementById('btn-confirm-reset-data');

            if (chk) chk.checked = false;
            if (txt) txt.value = '';
            if (btn) {
                btn.disabled = true;
                btn.className = 'px-5 py-2 bg-slate-300 cursor-not-allowed text-white font-bold rounded shadow text-xs flex items-center gap-1.5';
            }

            if (mode === 'clear_catalog_only') {
                desc.innerHTML = `
                    <div class="font-bold text-indigo-900 mb-1">Chế độ: DỌN SẠCH DANH MỤC HÀNG HÓA ĐỂ IMPORT MỚI</div>
                    <ul class="list-disc pl-4 space-y-1 text-slate-700">
                        <li>Toàn bộ Hàng Hóa thành phẩm, đơn vị quy đổi và liên kết tồn kho thành phẩm sẽ bị xóa trắng.</li>
                        <li><strong>Giữ nguyên:</strong> Nguyên vật liệu xưởng, Sổ quỹ thu chi, Danh bạ Khách hàng và Hóa đơn cũ.</li>
                        <li>Chuỗi xác thực bắt buộc: <strong class="text-indigo-700">XOA HANG HOA</strong></li>
                    </ul>
                `;
                if (txt) txt.placeholder = "XOA HANG HOA";
            } else if (mode === 'transactions_and_customers') {
                desc.innerHTML = `
                    <div class="font-bold text-amber-900 mb-1">Chế độ: XÓA GIAO DỊCH & KHÁCH HÀNG (GIỮ HÀNG HÓA)</div>
                    <ul class="list-disc pl-4 space-y-1 text-slate-700">
                        <li>Hóa đơn bán lẻ, đơn hàng và lịch sử thanh toán sẽ bị xóa sạch.</li>
                        <li>Danh bạ Khách Hàng và hồ sơ thú cưng/dịch vụ sẽ bị xóa.</li>
                        <li>Sổ quỹ thu chi, đơn nhập hàng và số tồn kho sẽ được đưa về 0.</li>
                        <li><strong>Giữ nguyên:</strong> Danh mục Hàng hóa, Nguyên liệu, Bảng giá, NCC, Công thức BOM và Mẫu in.</li>
                        <li>Chuỗi xác thực bắt buộc: <strong class="text-rose-700">XOA HET DU LIEU</strong></li>
                    </ul>
                `;
                if (txt) txt.placeholder = "XOA HET DU LIEU";
            } else if (mode === 'factory_reset') {
                desc.innerHTML = `
                    <div class="font-bold text-rose-900 mb-1">Chế độ: KHÔI PHỤC CÀI ĐẶT GỐC (FACTORY RESET)</div>
                    <ul class="list-disc pl-4 space-y-1 text-rose-800">
                        <li><strong>CỰC KỲ NGUY HIỂM:</strong> Xóa 100% dữ liệu hàng hóa, khách hàng, nhà cung cấp, hóa đơn, tồn kho, sổ quỹ và bảng giá.</li>
                        <li>Đưa phần mềm về trạng thái trống hoàn toàn như khi mới cài đặt.</li>
                        <li>Chuỗi xác thực bắt buộc: <strong class="text-rose-700">XOA HET DU LIEU</strong></li>
                    </ul>
                `;
                if (txt) txt.placeholder = "XOA HET DU LIEU";
            }

            if (modal) modal.classList.remove('hidden');
        }

        function closeResetDataModal() {
            const modal = document.getElementById('modal-reset-data');
            if (modal) modal.classList.add('hidden');
            currentResetMode = null;
        }

        function checkResetDataInputs() {
            const chk = document.getElementById('reset-data-check')?.checked;
            const txt = (document.getElementById('reset-data-confirm-text')?.value || '').trim().toUpperCase();
            const btn = document.getElementById('btn-confirm-reset-data');

            const validConfirm = (currentResetMode === 'clear_catalog_only') ? 'XOA HANG HOA' : 'XOA HET DU LIEU';

            if (chk && txt === validConfirm) {
                if (btn) {
                    btn.disabled = false;
                    btn.className = 'px-5 py-2 bg-rose-600 hover:bg-rose-700 text-white font-bold rounded shadow text-xs flex items-center gap-1.5 cursor-pointer';
                }
            } else {
                if (btn) {
                    btn.disabled = true;
                    btn.className = 'px-5 py-2 bg-slate-300 cursor-not-allowed text-white font-bold rounded shadow text-xs flex items-center gap-1.5';
                }
            }
        }

        async function executeResetData() {
            const chk = document.getElementById('reset-data-check')?.checked;
            const txt = (document.getElementById('reset-data-confirm-text')?.value || '').trim().toUpperCase();
            const validConfirm = (currentResetMode === 'clear_catalog_only') ? 'XOA HANG HOA' : 'XOA HET DU LIEU';
            if (!chk || txt !== validConfirm) {
                return alert(`Vui lòng tích xác nhận và gõ chính xác: ${validConfirm}`);
            }

            if (!currentResetMode) return;

            const btn = document.getElementById('btn-confirm-reset-data');
            if (btn) {
                btn.disabled = true;
                btn.innerText = 'Đang sao lưu và xóa dữ liệu...';
            }

            try {
                const res = await fetch('/api/settings/reset-data', {
                    method: 'POST',
                    headers: {'Content-Type': 'application/json'},
                    body: JSON.stringify({
                        mode: currentResetMode,
                        confirm_text: txt
                    })
                });

                const data = await res.json();
                if (!res.ok) {
                    throw new Error(data.detail || 'Lỗi khi thực hiện xóa dữ liệu');
                }

                alert(`🎉 ${data.message}\n\n🛡️ Bản snapshot an toàn đã được lưu tại:\ndata/backups/${data.backup_file}\n\nHệ thống sẽ tự động tải lại để làm mới giao diện!`);
                closeResetDataModal();
                window.location.reload();
            } catch (e) {
                alert(`❌ Thất bại: ${e.message}`);
                if (btn) {
                    btn.disabled = false;
                    btn.innerText = '🗑️ Xác Nhận Xóa Vĩnh Viễn';
                }
            }
        }

        // ── Telegram Settings & Admin Management ──
        async function loadTelegramSettingsData() {
            try {
                const res = await fetch('/api/settings/telegram');
                if (!res.ok) return;
                const data = await res.json();

                const tokenInput = document.getElementById('input-telegram-token');
                const enabledCheck = document.getElementById('check-telegram-enabled');
                if (tokenInput) tokenInput.value = data.bot_token || '';
                if (enabledCheck) enabledCheck.checked = !!data.is_enabled;

                // Render requests
                const reqCount = document.getElementById('badge-tg-requests-count');
                const reqTbody = document.getElementById('tg-requests-tbody');
                if (reqCount) reqCount.innerText = `${(data.requests || []).length} yêu cầu`;
                if (reqTbody) {
                    if (!data.requests || data.requests.length === 0) {
                        reqTbody.innerHTML = '<tr><td colspan="4" class="p-3 text-center text-slate-400">Không có yêu cầu nào đang chờ.</td></tr>';
                    } else {
                        reqTbody.innerHTML = data.requests.map(r => `
                            <tr class="hover:bg-amber-50/50 transition">
                                <td class="p-2 font-mono font-bold text-slate-700">${r.chat_id}</td>
                                <td class="p-2">
                                    <div class="font-bold text-slate-800">${escapeHtml(r.first_name || 'Không tên')}</div>
                                    <div class="text-slate-400 text-3xs font-mono">@${escapeHtml(r.username || 'n/a')}</div>
                                </td>
                                <td class="p-2 text-slate-500">${formatDateTime(r.created_at) || '-'}</td>
                                <td class="p-2 text-right space-x-1">
                                    <button onclick="approveTelegramAdmin(${r.chat_id})" class="px-2.5 py-1 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-lg transition shadow-2xs">
                                        ✓ Duyệt
                                    </button>
                                    <button onclick="rejectTelegramAdmin(${r.chat_id})" class="px-2 py-1 bg-slate-200 hover:bg-rose-100 hover:text-rose-700 text-slate-600 rounded-lg transition">
                                        ✕
                                    </button>
                                </td>
                            </tr>
                        `).join('');
                    }
                }

                // Render admins
                const adminCount = document.getElementById('badge-tg-admins-count');
                const adminTbody = document.getElementById('tg-admins-tbody');
                if (adminCount) adminCount.innerText = `${(data.admins || []).length} admin`;
                if (adminTbody) {
                    if (!data.admins || data.admins.length === 0) {
                        adminTbody.innerHTML = '<tr><td colspan="4" class="p-3 text-center text-slate-400">Chưa có Admin nào được duyệt.</td></tr>';
                    } else {
                        adminTbody.innerHTML = data.admins.map(a => `
                            <tr class="hover:bg-slate-50 transition">
                                <td class="p-2 font-mono font-bold text-slate-700">${a.chat_id}</td>
                                <td class="p-2">
                                    <div class="font-bold text-slate-800">${escapeHtml(a.first_name || 'Admin')}</div>
                                    <div class="text-slate-400 text-3xs font-mono">@${escapeHtml(a.username || 'n/a')}</div>
                                </td>
                                <td class="p-2 text-slate-500">
                                    <div>${escapeHtml(a.approved_by || 'Web POS')}</div>
                                    <div class="text-3xs text-slate-400">${a.approved_at ? a.approved_at.slice(0, 10) : ''}</div>
                                </td>
                                <td class="p-2 text-right">
                                    <button onclick="rejectTelegramAdmin(${a.chat_id})" class="px-2.5 py-1 text-rose-600 hover:bg-rose-50 border border-rose-200 rounded-lg font-semibold transition" title="Hủy quyền Admin">
                                        🗑️ Thu Hồi
                                    </button>
                                </td>
                            </tr>
                        `).join('');
                    }
                }
            } catch (e) {
                console.error("Lỗi khi tải cấu hình Telegram:", e);
            }
        }

        async function saveTelegramConfig() {
            const tokenInput = document.getElementById('input-telegram-token');
            const enabledCheck = document.getElementById('check-telegram-enabled');
            const bot_token = (tokenInput ? tokenInput.value : '').trim();
            const is_enabled = enabledCheck ? enabledCheck.checked : false;

            try {
                const res = await fetch('/api/settings/telegram/config', {
                    method: 'POST',
                    headers: {'Content-Type': 'application/json'},
                    body: JSON.stringify({ bot_token, is_enabled })
                });
                const data = await res.json();
                if (!res.ok) throw new Error(data.detail || 'Lưu thất bại');
                if (window.showToast) window.showToast('🎉 ' + data.message, 'success');
                else alert('🎉 ' + data.message);
                loadTelegramSettingsData();
            } catch (e) {
                if (window.showToast) window.showToast('❌ Lỗi: ' + e.message, 'error');
                else alert('❌ Lỗi: ' + e.message);
            }
        }

        async function approveTelegramAdmin(chatId) {
            try {
                const res = await fetch('/api/settings/telegram/approve', {
                    method: 'POST',
                    headers: {'Content-Type': 'application/json'},
                    body: JSON.stringify({ chat_id: chatId })
                });
                const data = await res.json();
                if (!res.ok) throw new Error(data.detail || 'Duyệt thất bại');
                if (window.showToast) window.showToast('✅ ' + data.message, 'success');
                else alert('✅ ' + data.message);
                loadTelegramSettingsData();
            } catch (e) {
                if (window.showToast) window.showToast('❌ Lỗi: ' + e.message, 'error');
                else alert('❌ Lỗi: ' + e.message);
            }
        }

        async function rejectTelegramAdmin(chatId) {
            const confirmed = await window.showConfirmModal({
                title: 'Hủy Quyền Admin Telegram',
                message: `Anh có chắc chắn muốn hủy/xóa quyền Admin Telegram ID: ${chatId}?`,
                type: 'danger',
                confirmText: 'Xóa Quyền',
                cancelText: 'Hủy bỏ',
                icon: '🗑️'
            });
            if (!confirmed) return;
            try {
                const res = await fetch('/api/settings/telegram/reject', {
                    method: 'POST',
                    headers: {'Content-Type': 'application/json'},
                    body: JSON.stringify({ chat_id: chatId })
                });
                const data = await res.json();
                if (!res.ok) throw new Error(data.detail || 'Thao tác thất bại');
                if (window.showToast) window.showToast('ℹ️ ' + data.message, 'info');
                else alert('ℹ️ ' + data.message);
                loadTelegramSettingsData();
            } catch (e) {
                if (window.showToast) window.showToast('❌ Lỗi: ' + e.message, 'error');
                else alert('❌ Lỗi: ' + e.message);
            }
        }

        window.loadTelegramSettingsData = loadTelegramSettingsData;
        window.saveTelegramConfig = saveTelegramConfig;
        window.approveTelegramAdmin = approveTelegramAdmin;
        window.rejectTelegramAdmin = rejectTelegramAdmin;

        // ==========================================
        // THÔNG TIN PHIÊN BẢN & NHẬT KÝ CẬP NHẬT (CHANGELOG)
        // ==========================================
        function closeAppVersionModal() {
            document.getElementById('modal-app-version')?.classList.add('hidden');
        }

        async function checkServerUpdateStatus() {
            const banner = document.getElementById('modal-v-update-banner');
            const icon = document.getElementById('modal-v-update-icon');
            const msg = document.getElementById('modal-v-update-msg');
            const btn = document.getElementById('btn-trigger-apply-update');
            if (!banner || !msg) return;

            try {
                const headers = {};
                if (typeof Auth !== 'undefined' && Auth.getToken()) {
                    headers['Authorization'] = `Bearer ${Auth.getToken()}`;
                }
                const res = await fetch('/api/system/check-update', { headers: headers });
                if (!res.ok) throw new Error('Không thể kiểm tra update');
                const data = await res.json();

                if (data.update_available) {
                    banner.className = 'bg-emerald-50 border-b border-emerald-200 p-3 px-4 flex flex-wrap items-center justify-between gap-2';
                    icon.innerText = '🚀';
                    msg.innerHTML = `<strong class="text-emerald-800">Đã có bản cập nhật mới trên GitHub (commit ${data.remote_commit})!</strong>`;
                    if (btn) {
                        btn.innerText = '⚡ Cập Nhật Ngay';
                        btn.className = 'px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-bold shadow-xs flex items-center gap-1.5 transition';
                        btn.classList.remove('hidden');
                    }
                } else {
                    banner.className = 'bg-slate-50 border-b border-slate-200 p-3 px-4 flex flex-wrap items-center justify-between gap-2';
                    icon.innerText = '✓';
                    msg.innerHTML = `<span class="text-slate-600 font-medium">Phiên bản hiện tại: <strong class="font-mono text-slate-800">${data.local_commit || 'mới nhất'}</strong> (Đã đồng bộ)</span>`;
                    if (btn) {
                        btn.innerText = '🔄 Ép Cập Nhật Lại';
                        btn.className = 'px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 border border-slate-300 rounded-lg text-xs font-semibold shadow-2xs flex items-center gap-1.5 transition';
                        btn.classList.remove('hidden');
                    }
                }
            } catch(e) {
                if (msg) msg.innerText = 'Máy chủ đang ở chế độ Offline / Sẵn sàng đồng bộ.';
                if (btn) {
                    btn.innerText = '⚡ Cập Nhật Ngay';
                    btn.classList.add('hidden');
                }
            }
            showLastUpdateResult();
        }

        const UPDATE_RESULT_TEXT = {
            OK: ['✅', 'Cập nhật thành công'],
            NO_CHANGE: ['✓', 'Đã là bản mới nhất'],
            ROLLED_BACK: ['↩️', 'Bản mới lỗi — đã TỰ QUAY VỀ bản cũ, dữ liệu giữ nguyên'],
            ROLLBACK_FAILED: ['🛑', 'Bản cũ cũng không lên — cần truy cập máy chủ qua Tailscale'],
            FAILED_PULL: ['⚠️', 'Không tải được bản mới (mạng/khóa GitHub) — vẫn chạy bản cũ'],
            FAILED_BACKUP: ['⚠️', 'Sao lưu thất bại — đã dừng, không cập nhật'],
            FAILED_PRECHECK: ['⚠️', 'Máy chủ thiếu điều kiện cập nhật'],
        };

        async function fetchUpdateStatus() {
            const headers = {};
            if (typeof Auth !== 'undefined' && Auth.getToken()) headers['Authorization'] = `Bearer ${Auth.getToken()}`;
            const res = await fetch('/api/system/update-status', { headers, cache: 'no-store' });
            if (!res.ok) throw new Error('status ' + res.status);
            return res.json();
        }

        async function showLastUpdateResult() {
            const el = document.getElementById('modal-v-last-update');
            if (!el) return;
            try {
                const d = await fetchUpdateStatus();
                if (!d.last) { el.textContent = ''; return; }
                const [icon, text] = UPDATE_RESULT_TEXT[d.last.result] || ['•', d.last.result];
                el.textContent = `${icon} Lần cập nhật cuối (${d.last.at || ''}): ${text}`;
                el.title = d.log_tail || '';
            } catch (e) { el.textContent = ''; }
        }

        async function triggerServerUpdate() {
            const btn = document.getElementById('btn-trigger-apply-update');
            const msg = document.getElementById('modal-v-update-msg');

            let confirmed = false;
            const updateDetails = `1. Tự động sao lưu an toàn toàn bộ dữ liệu POS hiện tại.
2. Đồng bộ mã nguồn mới nhất từ GitHub.
3. Chạy nâng cấp cơ sở dữ liệu (migration).
4. Khởi động lại dịch vụ máy chủ và tự động kết nối lại.`;

            if (typeof window.showConfirmModal === 'function') {
                confirmed = await window.showConfirmModal({
                    title: 'Xác Nhận Cập Nhật Máy Chủ POS',
                    message: 'Bạn có chắc chắn muốn tiến hành cập nhật hệ thống ngay bây giờ?',
                    subMessage: updateDetails,
                    confirmText: '⚡ Bắt Đầu Cập Nhật',
                    cancelText: 'Để sau',
                    type: 'primary',
                    icon: '🚀'
                });
            } else if (typeof window.customConfirm === 'function') {
                confirmed = await window.customConfirm(updateDetails, 'Xác Nhận Cập Nhật Máy Chủ POS', { type: 'primary', okText: 'Cập Nhật Ngay' });
            } else {
                confirmed = confirm("⚠️ XÁC NHẬN CẬP NHẬT MÁY CHỦ:\n\n" + updateDetails);
            }

            if (!confirmed) return;

            btn.disabled = true;
            btn.innerText = '⏳ Đang tiến hành...';
            if (msg) msg.innerHTML = '<span class="text-amber-800 font-bold animate-pulse">Máy chủ đang sao lưu và cập nhật mã nguồn... Vui lòng không tắt máy!</span>';

            try {
                // Đảm bảo gắn Bearer token từ Auth
                const headers = { 'Content-Type': 'application/json' };
                if (typeof Auth !== 'undefined' && Auth.getToken()) {
                    headers['Authorization'] = `Bearer ${Auth.getToken()}`;
                }
                const res = await fetch('/api/system/apply-update', { method: 'POST', headers: headers });
                const data = await res.json();
                if (!res.ok) throw new Error(data.detail || 'Cập nhật thất bại');

                // Poll /api/system/update-status qua fetchUpdateStatus()
                if (msg) msg.innerHTML = '<span class="text-amber-800 font-bold animate-pulse">Máy chủ đang cập nhật (1-3 phút), trang sẽ tự báo kết quả...</span>';
                const started = Date.now();
                await new Promise(r => setTimeout(r, 5000));
                while (Date.now() - started < 6 * 60 * 1000) {
                    try {
                        const d = await fetchUpdateStatus();
                        if (!d.in_progress && d.last) {
                            const [icon, text] = UPDATE_RESULT_TEXT[d.last.result] || ['•', d.last.result];
                            alert(`${icon} ${text}\n${d.last.message || ''}`);
                            window.location.reload();
                            return;
                        }
                    } catch (e) { /* server đang tắt — đợi tiếp */ }
                    await new Promise(r => setTimeout(r, 3000));
                }
                alert('Quá 6 phút chưa thấy máy chủ phản hồi. Kiểm tra máy chủ qua Tailscale.');
                if (btn) btn.disabled = false;
            } catch(err) {
                alert('Lỗi cập nhật: ' + err.message);
                if (btn) btn.disabled = false;
                checkServerUpdateStatus();
            }
        }

        window.openAppVersionModal = async function() {
            const modal = document.getElementById('modal-app-version');
            if (!modal) return;
            modal.classList.remove('hidden');

            const body = document.getElementById('modal-v-changelog-body');
            const dateEl = document.getElementById('modal-v-date');
            const badgeEl = document.getElementById('modal-v-badge');

            // Kiểm tra trạng thái update
            checkServerUpdateStatus();

            try {
                const res = await fetch('/api/version');
                if (!res.ok) throw new Error('Không tải được thông tin phiên bản');
                const v = await res.json();

                if (badgeEl) badgeEl.innerText = v.version || 'v3.5.0';
                if (dateEl) dateEl.innerText = `Phát hành: ${v.build_date} • Commit: ${v.commit_hash || 'latest'}`;

                // Cập nhật text ở footer sidebar nếu có
                const tagEl = document.getElementById('sidebar-version-tag');
                if (tagEl) tagEl.innerText = `${v.version} • ${v.build_date}`;
                const collEl = document.getElementById('sidebar-version-collapsed');
                if (collEl) {
                    collEl.innerText = v.short_version;
                    collEl.title = v.version;
                }

                if (body && Array.isArray(v.changelog)) {
                    body.innerHTML = v.changelog.map(log => `
                        <div class="pt-3 first:pt-0 space-y-2">
                            <div class="flex items-center justify-between">
                                <div class="flex items-center gap-2">
                                    <span class="font-black text-sm font-mono text-indigo-900">${log.tag}</span>
                                    ${log.is_new ? '<span class="px-1.5 py-0.2 rounded-full text-[9px] font-extrabold bg-emerald-100 text-emerald-800 border border-emerald-300 animate-pulse">Bản Hiện Tại</span>' : ''}
                                </div>
                                <span class="text-slate-400 font-mono text-[11px]">${log.date}</span>
                            </div>
                            <div class="text-[11px] font-semibold text-slate-700">${log.title}</div>
                            <ul class="space-y-1.5 pl-1">
                                ${(log.items || []).map(it => {
                                                    // Định dạng nếu là dòng commit có mã hash: [a1b2c3d] Tiêu đề (Ngày giờ)
                                                    let contentHtml = it;
                                                    const m = it.match(/^\[([a-f0-9]{7,8})\]\s*(.+?)(?:\s*\(([\d\.\:\s]+)\))?$/i);
                                                    if (m) {
                                                        const hash = m[1];
                                                        const text = m[2];
                                                        const time = m[3] ? `<span class="text-slate-400 font-mono text-[10px] ml-1">(${m[3]})</span>` : '';
                                                        contentHtml = `<span class="font-mono font-bold text-indigo-700 bg-indigo-50 px-1 py-0.5 rounded text-[10px] border border-indigo-200/60 mr-1">[${hash}]</span><span class="font-medium text-slate-700">${text}</span>${time}`;
                                                    }
                                                    return `
                                                    <li class="flex items-start gap-1.5 text-slate-600 text-xs">
                                                        <span class="text-emerald-500 font-bold shrink-0 mt-0.5">✓</span>
                                                        <span class="leading-relaxed">${contentHtml}</span>
                                                    </li>
                                                    `;
                                                }).join('')}
                            </ul>
                        </div>
                    `).join('');
                }
            } catch (err) {
                console.error("load version error:", err);
                if (body) body.innerHTML = '<div class="p-4 text-center text-rose-500">Lỗi khi tải thông tin nhật ký phiên bản</div>';
            }
        };

        window.closeAppVersionModal = closeAppVersionModal;
        window.triggerServerUpdate = triggerServerUpdate;

        // ============================================================
        // 1. WHEEL GUARD: CHẶN CUỘN CHUỘT LÀM THAY ĐỔI SỐ LƯỢNG / TIỀN
        // ============================================================
        document.addEventListener('wheel', function(e) {
            const active = document.activeElement;
            if (active && (
                active.type === 'number' || 
                active.classList.contains('currency-auto-format') ||
                active.classList.contains('audit-actual-input') ||
                active.classList.contains('oem-prod-qty') ||
                active.classList.contains('oem-prod-price') ||
                active.hasAttribute('step')
            )) {
                active.blur(); // Thoát focus ngay lập tức để không bị đổi giá trị khi lăn chuột
            }
        }, { passive: true });

        // ============================================================
        // 2. CURRENCY INPUT REALTIME EVENT DELEGATION
        // ============================================================
        document.addEventListener('input', function(e) {
            if (e.target && e.target.classList && e.target.classList.contains('currency-auto-format')) {
                formatCurrencyInputRealtime(e.target);
            }
        });

        // ============================================================
        // 3. UNIVERSAL MODAL ESCAPE HANDLER & SHORTCUTS
        // ============================================================
        document.addEventListener('keydown', function(e) {
            if (e.key === 'Escape') {
                // A. Nếu có Confirm modal / Custom Alert đang mở
                const confirmBackdrop = document.getElementById('custom-confirm-modal-backdrop');
                if (confirmBackdrop) {
                    const cancelBtn = confirmBackdrop.querySelector('#btn-custom-confirm-cancel');
                    if (cancelBtn) { cancelBtn.click(); return; }
                }
                const globalConfirm = document.getElementById('global-confirm-modal');
                if (globalConfirm) {
                    const cancelBtn = globalConfirm.querySelector('#btn-modal-cancel');
                    if (cancelBtn) { cancelBtn.click(); return; }
                }

                // B. Đóng các dropdown tìm kiếm đang nổi
                const dropPopups = [
                    'purchase-search-results', 'supplier-search-results',
                    'svc-customer-dropdown', 'bom-prod-dropdown-list',
                    'oem-factory-dropdown-menu', 'popup-audit-categories'
                ];
                for (const id of dropPopups) {
                    const el = document.getElementById(id);
                    if (el && !el.classList.contains('hidden')) {
                        el.classList.add('hidden');
                        return;
                    }
                }

                // C. Đóng các modal lớn đang hiển thị theo thứ tự ưu tiên
                const activeModals = [
                    // Hộp thoại xác nhận / Top dialogs
                    'modal-order-view',
                    'modal-pos-shortcuts-help',
                    'modal-app-version',
                    'modal-edit-topup-tx',
                    // Nhập hàng
                    'modal-pay-purchase',
                    'modal-receive-purchase',
                    'modal-quick-assign-supplier',
                    'modal-purchase-order',
                    'modal-production-detail',
                    // OEM
                    'modal-manage-oem-factories',
                    'modal-receive-oem',
                    'modal-detail-oem',
                    'modal-create-oem',
                    // Khách hàng & Công nợ
                    'modal-pay-debt',
                    'modal-contact-detail',
                    'modal-contacts-import',
                    'modal-contact',
                    // Dòng tiền & Nợ NCC
                    'modal-cashbook-acc-picker',
                    'modal-plan-order-picker',
                    'modal-cfd-supp-picker',
                    'modal-quick-edit-debt',
                    'modal-cfd-pay-order',
                    'modal-cfd-pay-supplier',
                    'modal-cfd-debt-plan',
                    'modal-cfd-supplier-orders',
                    'modal-create-cashbook',
                    'modal-cash-counter',
                    // Kho bãi & Khác
                    'modal-product',
                    'modal-write-off',
                    'modal-inventory-check',
                    'modal-audit-history',
                    'modal-audit-detail',
                    'modal-create-service-ticket',
                    'modal-quick-add-pet',
                    'modal-import-bom',
                    'modal-clone-bom',
                    'modal-pos-wallet-history'
                ];

                for (const mid of activeModals) {
                    const m = document.getElementById(mid);
                    if (m && !m.classList.contains('hidden')) {
                        // Thử tìm nút đóng (✕ hoặc class cancel)
                        const closeBtn = m.querySelector('button[onclick*="close"], button[onclick*="Close"]');
                        if (closeBtn) {
                            closeBtn.click();
                        } else {
                            m.classList.add('hidden');
                        }
                        e.preventDefault();
                        return;
                    }
                }
            } else if (e.key === 'F10') {
                e.preventDefault();
                if (typeof openCashCounterModal === 'function') openCashCounterModal();
            } else if (e.key === '?' && !['INPUT', 'TEXTAREA'].includes(document.activeElement?.tagName)) {
                e.preventDefault();
                openPOSShortcutsHelpModal();
            }
        });

        function openPOSShortcutsHelpModal() {
            const m = document.getElementById('modal-pos-shortcuts-help');
            if (m) m.classList.remove('hidden');
        }
        function closePOSShortcutsHelpModal() {
            const m = document.getElementById('modal-pos-shortcuts-help');
            if (m) m.classList.add('hidden');
        }
        window.openPOSShortcutsHelpModal = openPOSShortcutsHelpModal;
        window.closePOSShortcutsHelpModal = closePOSShortcutsHelpModal;

        window.onload = init;
        if (document.readyState === 'complete' || document.readyState === 'interactive') {
            setTimeout(init, 50);
        } else {
            document.addEventListener('DOMContentLoaded', init);
        }
    