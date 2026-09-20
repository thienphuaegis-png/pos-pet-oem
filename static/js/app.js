

        function escapeJs(str) {
            if (!str) return '';
            return String(str).replace(/\\/g, '\\\\').replace(/'/g, "\\'").replace(/"/g, '&quot;');
        }

        // ==================== QUẢN LÝ KHO HÀNG & HÀNG HÓA CONSOLIDATED ====================
        let allWarehouses = [];
        let unifiedInventoryData = [];
        let unifiedSortColumn = 'name';
        let unifiedSortAsc = true;
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
            if (subId === 'templates') loadSettings();
            if (subId === 'staff') { if (typeof loadStaffList === 'function') loadStaffList(); }
            if (subId === 'permissions') { if (typeof loadPermissionsUI === 'function') loadPermissionsUI(); }
        }

        // --- SUB 1: TỒN KHO TỔNG HỢP ---
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

                renderUnifiedInventoryTable();
            } catch (e) {
                console.error("loadUnifiedInventory error:", e);
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

        function renderUnifiedInventoryTable() {
            const tbody = document.getElementById('table-unified-inventory');
            if (!tbody) return;

            if (!unifiedInventoryData || unifiedInventoryData.length === 0) {
                tbody.innerHTML = '<tr><td colspan="10" class="p-6 text-center text-gray-400">Không tìm thấy mặt hàng nào trong kho</td></tr>';
                return;
            }

            // Sắp xếp mảng tại frontend
            const items = [...unifiedInventoryData].sort((a, b) => {
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

            tbody.innerHTML = items.map(item => {
                const isProd = item.item_type === 'product';
                let badge = '';
                if (isProd) {
                    if (item.sub_type === 'service') {
                        badge = '<span class="px-2 py-0.5 rounded text-[10px] font-bold bg-amber-100 text-amber-700">Dịch Vụ</span>';
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
                                <button onclick="openItemLogsModal('${item.item_type}', ${item.id}, '${encodeURIComponent(item.name)}', '${item.code || ''}', '${item.unit || ''}')" 
                                        class="px-2 py-1 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded text-[11px] font-bold" title="Xem lịch sử thẻ kho">
                                    📜 Thẻ kho
                                </button>
                                <button onclick="openModalEditProduct(${item.id})" 
                                        class="px-2 py-1 bg-amber-50 hover:bg-amber-100 text-amber-700 border border-amber-200 rounded text-[11px] font-bold" title="Chỉnh sửa thông tin">
                                    ✏️ Sửa
                                </button>
                                <button onclick="deleteProductItem(${item.id}, '${encodeURIComponent(item.name)}')" 
                                        class="px-2 py-1 bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 rounded text-[11px] font-bold" title="Xóa / Ẩn hàng hóa">
                                    🗑️ Ẩn
                                </button>
                            </div>
                        `;
                    }
                } else {
                    actionButtons = `
                        <div class="flex items-center justify-center gap-1">
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

                return `
                    <tr class="border-b hover:bg-gray-50 text-xs">
                        <td class="p-2.5 font-mono font-bold text-slate-600">${item.code || '-'}</td>
                        <td class="p-2.5 font-bold text-slate-800">${item.name}</td>
                        <td class="p-2.5 text-center">${badge}</td>
                        <td class="p-2.5">${suppBadge}</td>
                        <td class="p-2.5 font-medium text-slate-600">${item.warehouse_name}</td>
                        <td class="p-2.5 text-right ${stockColor}">${item.quantity.toLocaleString('vi-VN')}</td>
                        <td class="p-2.5 text-gray-500">${item.unit || 'cái'}</td>
                        <td class="p-2.5 text-right font-medium text-gray-700">${formatMoney(item.cost_price)}</td>
                        <td class="p-2.5 text-right font-bold text-rose-600">${formatMoney(item.total_value)}</td>
                        <td class="p-2.5 text-center">${actionButtons}</td>
                    </tr>
                `;
            }).join('');
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
                            <td class="p-2 text-gray-500 whitespace-nowrap">${l.created_at || '-'}</td>
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

                closeModalWarehouse();
                loadWarehousesList();
                alert("Đã lưu thông tin kho hàng thành công!");
            } catch (e) {
                console.error("saveWarehouse error:", e);
                alert("Lỗi kết nối khi lưu kho");
            }
        }

        async function deleteWarehouse(id, encodedName) {
            const name = decodeURIComponent(encodedName);
            if (!confirm(`Bạn có chắc chắn muốn xóa kho "${name}"?`)) return;

            try {
                const res = await fetch(`/api/warehouses/${id}`, { method: 'DELETE' });
                if (!res.ok) {
                    const err = await res.json();
                    alert("Không thể xóa: " + (err.detail || "Có lỗi xảy ra"));
                    return;
                }
                loadWarehousesList();
                alert("Đã xóa kho hàng thành công!");
            } catch (e) {
                console.error("deleteWarehouse error:", e);
                alert("Lỗi kết nối khi xóa kho");
            }
        }

        // --- SUB 4: KIỂM KÊ KHO ---
        function toggleAuditView(view) {
            if (view === 'create') {
                document.getElementById('audit-create-view').classList.remove('hidden');
                document.getElementById('audit-list-view').classList.add('hidden');
                document.getElementById('btn-audit-create').className = 'bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs px-3 py-2 rounded shadow flex items-center gap-1';
                document.getElementById('btn-audit-list').className = 'bg-slate-700 hover:bg-slate-800 text-white font-bold text-xs px-3 py-2 rounded shadow flex items-center gap-1';
            } else {
                document.getElementById('audit-create-view').classList.add('hidden');
                document.getElementById('audit-list-view').classList.remove('hidden');
                document.getElementById('btn-audit-create').className = 'bg-slate-700 hover:bg-slate-800 text-white font-bold text-xs px-3 py-2 rounded shadow flex items-center gap-1';
                document.getElementById('btn-audit-list').className = 'bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs px-3 py-2 rounded shadow flex items-center gap-1';
                loadStockAuditsList();
            }
        }

        async function initStockAuditView() {
            toggleAuditView('create');
            try {
                const res = await fetch('/api/warehouses');
                allWarehouses = await res.json();
                const sel = document.getElementById('audit-wh-select');
                sel.innerHTML = '<option value="">-- Chọn kho kiểm kê --</option>' + 
                    allWarehouses.map(w => `<option value="${w.id}">${w.name}</option>`).join('');
                if (allWarehouses.length > 0) {
                    sel.value = allWarehouses[0].id;
                    loadAuditItemsForWarehouse(allWarehouses[0].id);
                }
            } catch (e) {
                console.error("initStockAuditView error:", e);
            }
        }

        async function loadAuditItemsForWarehouse(whId) {
            if (!whId) {
                document.getElementById('table-audit-items').innerHTML = '<tr><td colspan="9" class="p-4 text-center text-gray-400">Vui lòng chọn kho</td></tr>';
                currentAuditItems = [];
                return;
            }

            const tbody = document.getElementById('table-audit-items');
            tbody.innerHTML = '<tr><td colspan="9" class="p-4 text-center text-gray-400">Đang nạp dữ liệu hàng tồn kho...</td></tr>';

            try {
                const res = await fetch(`/api/inventory/unified?warehouse_id=${whId}`);
                const data = await res.json();
                currentAuditItems = (data.items || []).map(item => ({
                    ...item,
                    actual_qty: item.quantity,
                    diff_qty: 0,
                    note: ''
                }));

                renderAuditTable();
            } catch (e) {
                console.error("loadAuditItemsForWarehouse error:", e);
                tbody.innerHTML = '<tr><td colspan="9" class="p-4 text-center text-red-500">Lỗi nạp dữ liệu kiểm kê</td></tr>';
            }
        }

        function renderAuditTable() {
            const tbody = document.getElementById('table-audit-items');
            if (!currentAuditItems || currentAuditItems.length === 0) {
                tbody.innerHTML = '<tr><td colspan="9" class="p-4 text-center text-gray-400">Kho này chưa có mặt hàng nào</td></tr>';
                document.getElementById('audit-sum-count').innerText = '0';
                document.getElementById('audit-sum-diff').innerText = '0';
                return;
            }

            let totalDiff = 0;
            tbody.innerHTML = currentAuditItems.map((item, idx) => {
                totalDiff += (item.diff_qty || 0);
                const isProd = item.item_type === 'product';
                const badge = isProd 
                    ? '<span class="px-2 py-0.5 rounded text-[10px] font-bold bg-sky-100 text-sky-700">Hàng Hóa</span>'
                    : '<span class="px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-100 text-emerald-700">Nguyên Liệu</span>';

                const diffColor = item.diff_qty > 0 ? 'text-emerald-600 font-bold' : (item.diff_qty < 0 ? 'text-rose-600 font-bold' : 'text-gray-500');
                const diffPrefix = item.diff_qty > 0 ? '+' : '';

                return `
                    <tr class="border-b hover:bg-gray-50 text-xs">
                        <td class="p-2 text-gray-400 text-center">${idx + 1}</td>
                        <td class="p-2 font-mono font-bold text-slate-600">${item.code || '-'}</td>
                        <td class="p-2 font-bold text-slate-800">${item.name}</td>
                        <td class="p-2 text-center">${badge}</td>
                        <td class="p-2 text-gray-500">${item.unit || 'cái'}</td>
                        <td class="p-2 text-right font-medium text-slate-700">${item.quantity.toLocaleString('vi-VN')}</td>
                        <td class="p-2 text-right">
                            <input type="number" step="any" value="${item.actual_qty}" oninput="calcAuditDiff(${idx}, this.value)" class="border p-1 text-right font-bold w-24 rounded bg-amber-50 border-amber-300">
                        </td>
                        <td class="p-2 text-right ${diffColor}">${diffPrefix}${item.diff_qty.toLocaleString('vi-VN')}</td>
                        <td class="p-2">
                            <input type="text" placeholder="Lý do lệch..." oninput="currentAuditItems[${idx}].note = this.value" class="border p-1 w-full rounded text-[11px]">
                        </td>
                    </tr>
                `;
            }).join('');

            document.getElementById('audit-sum-count').innerText = currentAuditItems.length.toLocaleString('vi-VN');
            const sumDiffEl = document.getElementById('audit-sum-diff');
            sumDiffEl.innerText = (totalDiff > 0 ? '+' : '') + totalDiff.toLocaleString('vi-VN');
            sumDiffEl.className = totalDiff > 0 ? 'font-bold text-emerald-600' : (totalDiff < 0 ? 'font-bold text-rose-600' : 'font-bold text-slate-700');
        }

        function calcAuditDiff(idx, val) {
            const actual = parseFloat(val) || 0;
            currentAuditItems[idx].actual_qty = actual;
            currentAuditItems[idx].diff_qty = actual - currentAuditItems[idx].quantity;
            renderAuditTable();
        }

        async function submitStockAudit() {
            const whId = parseInt(document.getElementById('audit-wh-select').value);
            if (!whId) {
                alert("Vui lòng chọn kho kiểm kê!");
                return;
            }

            if (!currentAuditItems || currentAuditItems.length === 0) {
                alert("Không có mặt hàng nào để kiểm kê!");
                return;
            }

            const note = document.getElementById('audit-note').value.trim();
            const itemsPayload = currentAuditItems.map(it => ({
                item_type: it.item_type,
                item_id: it.id,
                system_qty: it.quantity,
                actual_qty: it.actual_qty,
                diff_qty: it.diff_qty,
                note: it.note || ''
            }));

            if (!confirm(`Xác nhận cân bằng kho cho ${itemsPayload.length} mặt hàng? Tồn kho hệ thống sẽ được cập nhật theo số thực tế.`)) return;

            try {
                const res = await fetch('/api/inventory/audit', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        warehouse_id: whId,
                        note: note || 'Kiểm kê kho',
                        items: itemsPayload
                    })
                });

                if (!res.ok) {
                    const err = await res.json();
                    alert("Lỗi kiểm kê: " + (err.detail || "Không thể lưu phiếu"));
                    return;
                }

                const result = await res.json();
                alert(`Đã hoàn tất kiểm kê kho! Mã phiếu: ${result.audit_code}`);
                document.getElementById('audit-note').value = '';
                loadAuditItemsForWarehouse(whId);
                loadUnifiedInventory();
            } catch (e) {
                console.error("submitStockAudit error:", e);
                alert("Lỗi kết nối khi gửi phiếu kiểm kê");
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
                            <td class="p-2.5 text-gray-500 whitespace-nowrap">${a.created_at || '-'}</td>
                            <td class="p-2.5 font-bold text-slate-800">${a.warehouse_name || 'Kho'}</td>
                            <td class="p-2.5 text-right font-medium">${(a.items_count || 0).toLocaleString('vi-VN')} món</td>
                            <td class="p-2.5 text-right ${diffColor}">${diffPrefix}${(a.total_diff || 0).toLocaleString('vi-VN')}</td>
                            <td class="p-2.5 text-gray-500">${a.note || '-'}</td>
                            <td class="p-2.5 text-center">
                                <button onclick="viewAuditDetail(${a.id})" class="px-2 py-1 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 rounded text-[11px] font-bold">
                                    👁️ Xem
                                </button>
                            </td>
                        </tr>
                    `;
                }).join('');
            } catch (e) {
                console.error("loadStockAuditsList error:", e);
            }
        }

        async function viewAuditDetail(auditId) {
            const modal = document.getElementById('modal-audit-detail');
            modal.classList.remove('hidden');
            const tbody = document.getElementById('view-audit-items');
            tbody.innerHTML = '<tr><td colspan="7" class="p-4 text-center text-gray-400">Đang tải chi tiết phiếu...</td></tr>';

            try {
                const res = await fetch(`/api/inventory/audits/${auditId}`);
                const data = await res.json();
                document.getElementById('view-audit-code').innerText = data.audit_code;
                document.getElementById('view-audit-date').innerText = 'Thời gian: ' + (data.created_at || '-');
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
                renderTransferRows();
            } catch (e) {
                console.error("onTransferFromChange error:", e);
            }
        }

        function addTransferRow() {
            if (!transferSourceItems || transferSourceItems.length === 0) {
                alert("Kho xuất không còn mặt hàng nào có tồn kho (>0) để chuyển!");
                return;
            }

            currentTransferRows.push({
                item_key: `${transferSourceItems[0].item_type}_${transferSourceItems[0].id}`,
                item_type: transferSourceItems[0].item_type,
                item_id: transferSourceItems[0].id,
                name: transferSourceItems[0].name,
                stock: transferSourceItems[0].quantity,
                unit: transferSourceItems[0].unit,
                quantity: 1
            });

            renderTransferRows();
        }

        function removeTransferRow(idx) {
            currentTransferRows.splice(idx, 1);
            renderTransferRows();
        }

        function onTransferItemSelect(idx, val) {
            const parts = val.split('_');
            const type = parts[0];
            const id = parseInt(parts[1]);
            const found = transferSourceItems.find(it => it.item_type === type && it.id === id);
            if (found) {
                currentTransferRows[idx].item_key = val;
                currentTransferRows[idx].item_type = type;
                currentTransferRows[idx].item_id = id;
                currentTransferRows[idx].name = found.name;
                currentTransferRows[idx].stock = found.quantity;
                currentTransferRows[idx].unit = found.unit;
            }
            renderTransferRows();
        }

        function renderTransferRows() {
            const tbody = document.getElementById('table-transfer-rows');
            if (!currentTransferRows || currentTransferRows.length === 0) {
                tbody.innerHTML = '<tr><td colspan="7" class="p-4 text-center text-gray-400">Chưa có dòng nào. Bấm "+ Thêm Dòng Chuyển Hàng" để bắt đầu.</td></tr>';
                return;
            }

            tbody.innerHTML = currentTransferRows.map((row, idx) => {
                const isProd = row.item_type === 'product';
                const badge = isProd 
                    ? '<span class="px-2 py-0.5 rounded text-[10px] font-bold bg-sky-100 text-sky-700">Hàng Hóa</span>'
                    : '<span class="px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-100 text-emerald-700">Nguyên Liệu</span>';

                const optionsHtml = transferSourceItems.map(it => `
                    <option value="${it.item_type}_${it.id}" ${row.item_key === `${it.item_type}_${it.id}` ? 'selected' : ''}>
                        ${it.name} (Tồn: ${it.quantity} ${it.unit})
                    </option>
                `).join('');

                return `
                    <tr class="border-b text-xs">
                        <td class="p-2 text-center text-gray-400">${idx + 1}</td>
                        <td class="p-2">
                            <select onchange="onTransferItemSelect(${idx}, this.value)" class="border p-1.5 rounded w-full font-bold text-slate-800">
                                ${optionsHtml}
                            </select>
                        </td>
                        <td class="p-2 text-center">${badge}</td>
                        <td class="p-2 text-right font-bold text-slate-700">${row.stock.toLocaleString('vi-VN')}</td>
                        <td class="p-2 text-right">
                            <input type="number" step="any" min="0.001" max="${row.stock}" value="${row.quantity}" 
                                   oninput="currentTransferRows[${idx}].quantity = parseFloat(this.value) || 0" 
                                   class="border p-1 text-right font-bold w-24 rounded bg-sky-50 border-sky-300">
                        </td>
                        <td class="p-2 text-gray-500">${row.unit || 'cái'}</td>
                        <td class="p-2 text-center">
                            <button onclick="removeTransferRow(${idx})" class="text-rose-500 hover:text-rose-700 font-bold text-base">🗑️</button>
                        </td>
                    </tr>
                `;
            }).join('');
        }

        async function submitStockTransfer() {
            const fromWh = parseInt(document.getElementById('transfer-from-wh').value);
            const toWh = parseInt(document.getElementById('transfer-to-wh').value);
            const note = document.getElementById('transfer-note').value.trim();

            if (!fromWh || !toWh) {
                alert("Vui lòng chọn cả kho xuất và kho nhập!");
                return;
            }

            if (fromWh === toWh) {
                alert("Kho xuất và kho nhập phải khác nhau!");
                return;
            }

            if (!currentTransferRows || currentTransferRows.length === 0) {
                alert("Vui lòng thêm ít nhất một mặt hàng để chuyển!");
                return;
            }

            for (const r of currentTransferRows) {
                if (r.quantity <= 0) {
                    alert(`Số lượng chuyển cho "${r.name}" phải lớn hơn 0!`);
                    return;
                }
                if (r.quantity > r.stock) {
                    alert(`Số lượng chuyển cho "${r.name}" (${r.quantity}) vượt quá tồn kho hiện có (${r.stock})!`);
                    return;
                }
            }

            const itemsPayload = currentTransferRows.map(r => ({
                item_type: r.item_type,
                item_id: r.item_id,
                quantity: r.quantity
            }));

            if (!confirm(`Xác nhận chuyển ${itemsPayload.length} mặt hàng từ kho xuất sang kho nhập?`)) return;

            try {
                const res = await fetch('/api/inventory/transfer', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        from_warehouse_id: fromWh,
                        to_warehouse_id: toWh,
                        note: note || 'Chuyển kho nội bộ',
                        items: itemsPayload
                    })
                });

                if (!res.ok) {
                    const err = await res.json();
                    alert("Lỗi chuyển kho: " + (err.detail || "Không thể thực hiện chuyển kho"));
                    return;
                }

                const result = await res.json();
                alert(`Đã hoàn tất chuyển kho! Mã phiếu: ${result.transfer_code}`);
                document.getElementById('transfer-note').value = '';
                currentTransferRows = [];
                onTransferFromChange();
                loadUnifiedInventory();
            } catch (e) {
                console.error("submitStockTransfer error:", e);
                alert("Lỗi kết nối khi gửi phiếu chuyển kho");
            }
        }

        async function loadStockTransfersList() {
            const tbody = document.getElementById('table-transfer-history');
            tbody.innerHTML = '<tr><td colspan="7" class="p-4 text-center text-gray-400">Đang tải lịch sử chuyển kho...</td></tr>';

            try {
                const res = await fetch('/api/inventory/transfers');
                const list = await res.json();
                if (!list || list.length === 0) {
                    tbody.innerHTML = '<tr><td colspan="7" class="p-4 text-center text-gray-400">Chưa có phiếu chuyển kho nào</td></tr>';
                    return;
                }

                tbody.innerHTML = list.map(t => `
                    <tr class="border-b hover:bg-gray-50 text-xs">
                        <td class="p-2.5 font-mono font-bold text-sky-700">${t.transfer_code}</td>
                        <td class="p-2.5 text-gray-500 whitespace-nowrap">${t.created_at || '-'}</td>
                        <td class="p-2.5 font-bold text-rose-700">${t.from_warehouse_name || 'Kho xuất'}</td>
                        <td class="p-2.5 font-bold text-emerald-700">${t.to_warehouse_name || 'Kho nhập'}</td>
                        <td class="p-2.5 text-right font-medium">${(t.items_count || 0).toLocaleString('vi-VN')} món</td>
                        <td class="p-2.5 text-gray-500">${t.note || '-'}</td>
                        <td class="p-2.5 text-center">
                            <button onclick="viewTransferDetail(${t.id})" class="px-2 py-1 bg-sky-50 hover:bg-sky-100 text-sky-700 rounded text-[11px] font-bold">
                                👁️ Xem
                            </button>
                        </td>
                    </tr>
                `).join('');
            } catch (e) {
                console.error("loadStockTransfersList error:", e);
            }
        }

        async function viewTransferDetail(transferId) {
            const modal = document.getElementById('modal-transfer-detail');
            modal.classList.remove('hidden');
            const tbody = document.getElementById('view-transfer-items');
            tbody.innerHTML = '<tr><td colspan="5" class="p-4 text-center text-gray-400">Đang tải chi tiết phiếu...</td></tr>';

            try {
                const res = await fetch(`/api/inventory/transfers/${transferId}`);
                const data = await res.json();
                document.getElementById('view-transfer-code').innerText = data.transfer_code;
                document.getElementById('view-transfer-date').innerText = 'Thời gian: ' + (data.created_at || '-');
                document.getElementById('view-transfer-from').innerText = data.from_warehouse_name;
                document.getElementById('view-transfer-to').innerText = data.to_warehouse_name;

                tbody.innerHTML = (data.items || []).map((it, idx) => {
                    const badge = it.item_type === 'product'
                        ? '<span class="px-2 py-0.5 rounded text-[10px] font-bold bg-sky-100 text-sky-700">Hàng Hóa</span>'
                        : '<span class="px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-100 text-emerald-700">Nguyên Liệu</span>';

                    return `
                        <tr class="border-b text-[11px]">
                            <td class="p-2 text-gray-400 text-center">${idx + 1}</td>
                            <td class="p-2 font-bold text-slate-800">${it.name}</td>
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

        // --- IMPORT & EXPORT HÀNG HÓA (EXCEL / CSV) ---
        function exportProductsExcel() {
            const whId = document.getElementById('unified-wh-filter')?.value || '';
            let url = '/api/products/export-excel';
            if (whId) url += `?warehouse_id=${whId}`;
            window.location.href = url;
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

        // --- MODAL PRODUCT CRUD (THÊM / SỬA / XÓA HÀNG HÓA) ---
        async function openModalProductUnified() {
            document.getElementById('modal-prod-title').innerText = 'Thêm Hàng Hóa Mới';
            document.getElementById('modal-prod-id').value = '';
            document.getElementById('modal-prod-code').value = '';
            document.getElementById('modal-prod-name').value = '';
            document.getElementById('modal-prod-type').value = 'product';
            document.getElementById('modal-prod-unit').value = 'cái';
            document.getElementById('modal-prod-cost').value = '0';
            document.getElementById('modal-prod-price').value = '0';
            document.getElementById('modal-prod-stock').value = '0';
            document.getElementById('modal-prod-stock-group').classList.remove('hidden');
            document.getElementById('btn-convert-to-ingredient')?.classList.add('hidden');

            await populateProductSuppliersDropdown([]);
            document.getElementById('modal-product').classList.remove('hidden');
        }

        async function openModalEditProduct(productId) {
            try {
                // Lấy sản phẩm từ cache hoặc fetch thẳng
                const res = await fetch('/api/products');
                const products = await res.json();
                let p = products.find(x => x.id === productId);
                if (!p && unifiedInventoryData) {
                    p = unifiedInventoryData.find(x => x.item_type === 'product' && x.id === productId);
                }
                if (!p) return alert('Không tìm thấy sản phẩm!');

                document.getElementById('modal-prod-title').innerText = 'Chỉnh Sửa Hàng Hóa';
                document.getElementById('modal-prod-id').value = p.id;
                document.getElementById('modal-prod-code').value = p.code || '';
                document.getElementById('modal-prod-name').value = p.name || '';
                document.getElementById('modal-prod-type').value = p.type || p.sub_type || 'product';
                document.getElementById('modal-prod-unit').value = p.unit || 'cái';
                document.getElementById('modal-prod-cost').value = p.cost_price || 0;
                document.getElementById('modal-prod-price').value = p.sell_price || 0;
                document.getElementById('modal-prod-stock-group').classList.add('hidden');
                
                // Hiện nút chuyển sang nguyên liệu khi đang sửa
                document.getElementById('btn-convert-to-ingredient')?.classList.remove('hidden');

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

            if (!confirm(`Bạn có chắc chắn muốn chuyển đổi:\n"${name}"\ntừ HÀNG HÓA sang NGUYÊN LIỆU?\n- Tồn kho và giá vốn sẽ được chuyển sang danh mục nguyên liệu.\n- Hàng hóa sẽ được rút khỏi danh mục bán POS.`)) {
                return;
            }

            try {
                const res = await fetch(`/api/products/${id}/convert-to-ingredient`, { method: 'POST' });
                if (res.ok) {
                    const data = await res.json();
                    alert(data.message || "Đã chuyển đổi thành công!");
                    closeModalProduct();
                    await Promise.all([loadUnifiedInventory(), loadCostIngredients()]);
                } else {
                    const err = await res.json();
                    alert("Lỗi: " + (err.detail || "Không thể chuyển đổi"));
                }
            } catch (e) {
                console.error("convertCurrentProductToIngredient error:", e);
                alert("Lỗi kết nối khi chuyển đổi!");
            }
        }

        async function populateProductSuppliersDropdown(selectedIds = []) {
            try {
                const res = await fetch('/api/contacts?type=supplier');
                const suppliers = await res.json();
                const sel = document.getElementById('modal-prod-suppliers');
                if (!sel) return;
                sel.innerHTML = suppliers.map(s => {
                    const isSelected = selectedIds.includes(s.id) ? 'selected' : '';
                    return `<option value="${s.id}" ${isSelected}>${s.name} ${s.phone ? '(' + s.phone + ')' : ''}</option>`;
                }).join('');
            } catch (e) {
                console.error("populateProductSuppliersDropdown error:", e);
            }
        }

        function closeModalProduct() {
            document.getElementById('modal-product')?.classList.add('hidden');
        }

        async function saveProductForm() {
            const id = document.getElementById('modal-prod-id').value;
            const name = document.getElementById('modal-prod-name').value.trim();
            const code = document.getElementById('modal-prod-code').value.trim();
            const type = document.getElementById('modal-prod-type').value;
            const unit = document.getElementById('modal-prod-unit').value.trim() || 'cái';
            const cost_price = parseFloat(document.getElementById('modal-prod-cost').value) || 0;
            const sell_price = parseFloat(document.getElementById('modal-prod-price').value) || 0;
            const stock = parseFloat(document.getElementById('modal-prod-stock').value) || 0;

            const suppSelect = document.getElementById('modal-prod-suppliers');
            const supplier_ids = Array.from(suppSelect.selectedOptions).map(opt => parseInt(opt.value));

            if (!name) {
                alert("Vui lòng nhập tên sản phẩm!");
                return;
            }

            try {
                let res;
                if (id) {
                    // Update
                    res = await fetch(`/api/products/${id}`, {
                        method: 'PUT',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ code, name, type, unit, cost_price, sell_price, supplier_ids })
                    });
                } else {
                    // Create
                    res = await fetch('/api/products', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ code, name, type, unit, cost_price, sell_price, stock, supplier_ids })
                    });
                }

                if (!res.ok) {
                    const err = await res.json();
                    alert("Lỗi: " + (err.detail || "Không thể lưu sản phẩm"));
                    return;
                }

                closeModalProduct();
                await Promise.all([loadUnifiedInventory(), loadCostProductOptions()]);
                alert(id ? "Đã cập nhật hàng hóa thành công!" : "Đã thêm hàng hóa mới thành công!");
            } catch (e) {
                console.error("saveProductForm error:", e);
                alert("Lỗi kết nối khi lưu sản phẩm");
            }
        }

        async function deleteProductItem(productId, encodedName) {
            const name = decodeURIComponent(encodedName);
            if (!confirm(`Bạn có chắc chắn muốn ẨN hàng hóa:\n"${name}"?\n(Hàng hóa sẽ được ẩn khỏi danh mục tồn kho và POS, nhưng lịch sử đơn hàng cũ vẫn được giữ nguyên)`)) {
                return;
            }

            try {
                const res = await fetch(`/api/products/${productId}`, { method: 'DELETE' });
                if (res.ok) {
                    alert(`Đã ẩn hàng hóa "${name}" thành công!`);
                    await Promise.all([loadUnifiedInventory(), loadCostProductOptions()]);
                } else {
                    const err = await res.json();
                    alert("Lỗi: " + (err.detail || "Không thể ẩn hàng hóa"));
                }
            } catch (e) {
                console.error("deleteProductItem error:", e);
                alert("Lỗi kết nối khi ẩn hàng hóa");
            }
        }

        async function restoreProductItem(productId, encodedName) {
            const name = decodeURIComponent(encodedName);
            if (!confirm(`Bạn có muốn BỎ ẨN (khôi phục) hàng hóa:\n"${name}"?\n(Hàng hóa sẽ xuất hiện lại trong danh mục tồn kho và POS)`)) {
                return;
            }

            try {
                const res = await fetch(`/api/products/${productId}/restore`, { method: 'POST' });
                if (res.ok) {
                    alert(`Đã khôi phục hàng hóa "${name}" thành công!`);
                    await Promise.all([loadUnifiedInventory(), loadCostProductOptions()]);
                } else {
                    const err = await res.json();
                    alert("Lỗi: " + (err.detail || "Không thể khôi phục"));
                }
            } catch (e) {
                console.error("restoreProductItem error:", e);
                alert("Lỗi kết nối khi khôi phục hàng hóa");
            }
        }

        async function deleteIngredientItem(ingId, encodedName) {
            const name = decodeURIComponent(encodedName);
            if (!confirm(`Bạn có chắc chắn muốn XÓA nguyên liệu:\n"${name}"?\n(Dữ liệu tồn kho, giá nhập và liên kết BOM liên quan sẽ bị xóa)`)) {
                return;
            }

            try {
                const res = await fetch(`/api/ingredients/${ingId}`, { method: 'DELETE' });
                if (res.ok) {
                    alert(`Đã xóa nguyên liệu "${name}" thành công!`);
                    await Promise.all([loadUnifiedInventory(), loadCostIngredients()]);
                } else {
                    const err = await res.json();
                    alert("Lỗi: " + (err.detail || "Không thể xóa nguyên liệu"));
                }
            } catch (e) {
                console.error("deleteIngredientItem error:", e);
                alert("Lỗi kết nối khi xóa nguyên liệu");
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

        function switchTab(tabId, subTabId) {
            console.log("switchTab activated:", tabId, subTabId);
            // Map legacy ids
            if (tabId === 'products') { tabId = 'inventory'; subTabId = 'products'; }
            else if (tabId === 'cost-management') { tabId = 'inventory'; subTabId = 'cost'; }
            else if (tabId === 'production') { tabId = 'inventory'; subTabId = 'production'; }
            else if (tabId === 'company') { tabId = 'settings'; subTabId = 'company'; }

            document.querySelectorAll('[id^="tab-"]').forEach(el => el.classList.add('hidden'));
            const targetTab = document.getElementById('tab-' + tabId);
            if (targetTab) targetTab.classList.remove('hidden');

            const mainContainer = document.getElementById('main-content-area');
            if (mainContainer) {
                if (tabId === 'pos') {
                    mainContainer.className = "flex-1 overflow-hidden p-0 flex flex-col";
                } else {
                    mainContainer.className = "flex-1 overflow-y-auto p-6";
                }
            }

            document.querySelectorAll('.tab-btn').forEach(b => {
                const btnTab = b.dataset.tab || (b.getAttribute('onclick') && b.getAttribute('onclick').includes("'" + tabId + "'") ? tabId : '');
                if (btnTab === tabId) {
                    b.classList.add('active-tab');
                    b.classList.remove('hover:bg-slate-800');
                } else {
                    b.classList.remove('active-tab');
                    b.classList.add('hover:bg-slate-800');
                }
            });

            if (tabId === 'inventory') {
                if (subTabId) switchInvSubTab(subTabId);
                else switchInvSubTab('unified');
            } else if (tabId === 'settings') {
                if (subTabId) switchSettingsSubTab(subTabId);
                else switchSettingsSubTab('templates');
            } else if (tabId === 'pet-services') {
                if (typeof loadAllPetsList === 'function') loadAllPetsList();
                if (typeof loadPetServicesKPI === 'function') loadPetServicesKPI();
                if (typeof loadPetServicesList === 'function') loadPetServicesList();
            } else if (tabId === 'contacts') {
                loadContacts();
            } else if (tabId === 'cashbook') {
                loadCashbook();
            } else if (tabId === 'reports') {
                loadReports();
            } else if (tabId === 'shifts') {
                if (typeof loadShiftsHistory === 'function') loadShiftsHistory();
            } else if (tabId === 'purchases') {
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
                    document.getElementById('pos-search-input')?.focus();
                }, 100);
            } else if (tabId === 'orders') {
                loadOrdersList();
            } else if (tabId === 'price-lists') {
                if(typeof loadPriceLists === 'function') loadPriceLists();
                if(typeof loadProductsForPriceList === 'function') loadProductsForPriceList();
                if(typeof loadSegments === 'function') loadSegments();
            } else if (tabId === 'oem') {
                if(typeof loadOEMData === 'function') loadOEMData();
            } else if (tabId === 'cashflow-debts') {
                if(typeof loadCashflowDebtsData === 'function') loadCashflowDebtsData();
            }
        }

        async function init() {
            // Tải cấu hình cài đặt chung trước để hiển thị tiêu đề và logo
            try {
                const res = await fetch('/api/settings');
                if (res.ok) {
                    const st = await res.json();
                    if (st.app_name) updateAppTitleUI(st.app_name);
                }
            } catch (_) {}

            await Promise.all([loadProducts(), loadContacts(), loadStaff()]);
            initPurchases();
            initProduction();
            switchTab('pos');
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

        let currentContactTab = 'customer';
        let contactSearchDebounceTimer = null;

        function switchContactTab(tabType) {
            currentContactTab = tabType;
            const btnCust = document.getElementById('btn-contact-tab-customer');
            const btnSupp = document.getElementById('btn-contact-tab-supplier');
            const viewCust = document.getElementById('view-contacts-customer');
            const viewSupp = document.getElementById('view-contacts-supplier');

            if (tabType === 'customer') {
                if (btnCust) btnCust.className = 'px-4 py-2 font-bold rounded-l-md bg-sky-700 text-white flex items-center gap-1.5';
                if (btnSupp) btnSupp.className = 'px-4 py-2 font-bold rounded-r-md bg-white text-slate-700 border hover:bg-gray-50 flex items-center gap-1.5';
                if (viewCust) viewCust.classList.remove('hidden');
                if (viewSupp) viewSupp.classList.add('hidden');
            } else {
                if (btnCust) btnCust.className = 'px-4 py-2 font-bold rounded-l-md bg-white text-slate-700 border hover:bg-gray-50 flex items-center gap-1.5';
                if (btnSupp) btnSupp.className = 'px-4 py-2 font-bold rounded-r-md bg-sky-700 text-white flex items-center gap-1.5';
                if (viewCust) viewCust.classList.add('hidden');
                if (viewSupp) viewSupp.classList.remove('hidden');
            }
            renderContactsTables();
        }

        function filterContactsType(type) {
            if (type === 'supplier') switchContactTab('supplier');
            else switchContactTab('customer');
        }

        function debounceFilterContacts() {
            clearTimeout(contactSearchDebounceTimer);
            contactSearchDebounceTimer = setTimeout(() => {
                renderContactsTables();
            }, 200);
        }

        function renderContactsTables() {
            const q = (document.getElementById('search-contacts-input')?.value || '').trim().toLowerCase();
            const tbodyCust = document.getElementById('table-customers');
            const tbodySupp = document.getElementById('table-suppliers');

            const allCust = (allContacts || []).filter(c => c.type === 'customer');
            const allSupp = (allContacts || []).filter(c => c.type === 'supplier');

            // Update badges
            const badgeCust = document.getElementById('badge-count-customers');
            const badgeSupp = document.getElementById('badge-count-suppliers');
            if (badgeCust) badgeCust.textContent = allCust.length;
            if (badgeSupp) badgeSupp.textContent = allSupp.length;

            // KPI
            const custDebt = allCust.reduce((sum, c) => sum + (c.debt || 0), 0);
            const suppDebt = allSupp.reduce((sum, c) => sum + (c.debt || 0), 0);
            const elCustCount = document.getElementById('kpi-contacts-customers');
            const elSuppCount = document.getElementById('kpi-contacts-suppliers');
            const elCustDebt = document.getElementById('kpi-contacts-cust-debt');
            const elSuppDebt = document.getElementById('kpi-contacts-supp-debt');
            if (elCustCount) elCustCount.textContent = allCust.length;
            if (elSuppCount) elSuppCount.textContent = allSupp.length;
            if (elCustDebt) elCustDebt.textContent = formatMoney(custDebt);
            if (elSuppDebt) elSuppDebt.textContent = formatMoney(suppDebt);

            // Filter
            const filteredCust = allCust.filter(c => {
                if (!q) return true;
                return (c.name || '').toLowerCase().includes(q) || (c.phone || '').includes(q) || (c.address || '').toLowerCase().includes(q) || (c.code || '').toLowerCase().includes(q);
            });

            const filteredSupp = allSupp.filter(c => {
                if (!q) return true;
                return (c.name || '').toLowerCase().includes(q) || (c.phone || '').includes(q) || (c.address || '').toLowerCase().includes(q) || (c.code || '').toLowerCase().includes(q);
            });

            // 1. Render Customers Table
            if (tbodyCust) {
                if (filteredCust.length === 0) {
                    tbodyCust.innerHTML = '<tr><td colspan="8" class="p-6 text-center text-gray-400">Không tìm thấy khách hàng nào</td></tr>';
                } else {
                    tbodyCust.innerHTML = filteredCust.map(c => {
                        const code = c.code || ('KH' + String(c.id).padStart(4, '0'));
                        const safeName = escapeJs(c.name || '');
                        const petCount = c.pets_count || c.pet_count || 0;
                        const groupBadge = c.group_name
                            ? `<span class="bg-indigo-50 text-indigo-700 font-bold px-2 py-0.5 rounded border border-indigo-200 text-[11px]">${c.group_name}</span>`
                            : `<span class="text-gray-400 italic text-[11px]">Mặc định</span>`;
                        const debtStyle = c.debt > 0 ? 'text-rose-600 font-bold' : 'text-gray-400';

                        return `
                        <tr class="border-b hover:bg-slate-50 transition text-xs">
                            <td class="p-2.5 font-mono font-bold text-sky-700">${code}</td>
                            <td class="p-2.5 font-bold text-slate-800">${c.name}</td>
                            <td class="p-2.5 font-mono text-gray-600">${c.phone || '<span class="text-gray-300">---</span>'}</td>
                            <td class="p-2.5 text-gray-500">${c.address || '<span class="text-gray-300">---</span>'}</td>
                            <td class="p-2.5 text-center">${groupBadge}</td>
                            <td class="p-2.5 text-center">
                                <button onclick="openCustomerPetsModal(${c.id}, '${safeName}')" class="px-2 py-0.5 rounded font-bold text-[11px] bg-pink-50 hover:bg-pink-100 text-pink-700 border border-pink-200 shadow-sm transition">
                                    🐾 ${petCount} bé
                                </button>
                            </td>
                            <td class="p-2.5 text-right font-mono ${debtStyle}">${formatMoney(c.debt || 0)}</td>
                            <td class="p-2.5 text-center space-x-1 whitespace-nowrap">
                                ${c.debt > 0 ? `<button onclick="openPayDebtModal(${c.id})" class="bg-emerald-600 hover:bg-emerald-700 text-white px-2 py-1 rounded text-[10px] font-bold shadow">💵 Thu nợ</button>` : ''}
                                <button onclick="viewContactDetail(${c.id})" class="bg-slate-100 hover:bg-slate-200 text-slate-700 px-2 py-1 rounded border text-[10px] font-bold">👁️</button>
                                <button onclick="editContact(${c.id})" class="text-sky-600 hover:text-sky-800 px-1.5 py-1 border border-sky-200 rounded text-[10px] font-bold">✏️</button>
                                ${c.id !== 1 && (!c.debt || c.debt === 0) ? `<button onclick="deleteContact(${c.id})" class="text-rose-600 hover:text-rose-800 px-1.5 py-1 border border-rose-200 rounded text-[10px] font-bold">🗑️</button>` : ''}
                            </td>
                        </tr>
                        `;
                    }).join('');
                }
            }

            // 2. Render Suppliers Table
            if (tbodySupp) {
                if (filteredSupp.length === 0) {
                    tbodySupp.innerHTML = '<tr><td colspan="8" class="p-6 text-center text-gray-400">Không tìm thấy nhà cung cấp nào</td></tr>';
                } else {
                    tbodySupp.innerHTML = filteredSupp.map(c => {
                        const code = c.code || ('NCC' + String(c.id).padStart(4, '0'));
                        const debtCompany = c.debt_company || 0;
                        const debtPersonal = c.debt_personal || 0;
                        const totalDebt = c.debt !== undefined ? c.debt : (debtCompany + debtPersonal);
                        const debtStyle = totalDebt > 0 ? 'text-amber-700 font-bold' : 'text-gray-400';

                        return `
                        <tr class="border-b hover:bg-slate-50 transition text-xs">
                            <td class="p-2.5 font-mono font-bold text-amber-700">${code}</td>
                            <td class="p-2.5 font-bold text-slate-800">${c.name}</td>
                            <td class="p-2.5 font-mono text-gray-600">${c.phone || '<span class="text-gray-300">---</span>'}</td>
                            <td class="p-2.5 text-gray-500">${c.address || '<span class="text-gray-300">---</span>'}</td>
                            <td class="p-2.5 text-right font-mono ${debtCompany > 0 ? 'text-indigo-700 font-bold' : 'text-gray-400'}">${formatMoney(debtCompany)}</td>
                            <td class="p-2.5 text-right font-mono ${debtPersonal > 0 ? 'text-amber-600 font-bold' : 'text-gray-400'}">${formatMoney(debtPersonal)}</td>
                            <td class="p-2.5 text-right font-mono ${debtStyle}">${formatMoney(totalDebt)}</td>
                            <td class="p-2.5 text-center space-x-1 whitespace-nowrap">
                                ${totalDebt > 0 ? `<button onclick="openPayDebtModal(${c.id})" class="bg-amber-600 hover:bg-amber-700 text-white px-2 py-1 rounded text-[10px] font-bold shadow">💳 Trả nợ</button>` : ''}
                                <button onclick="viewContactDetail(${c.id})" class="bg-slate-100 hover:bg-slate-200 text-slate-700 px-2 py-1 rounded border text-[10px] font-bold">👁️</button>
                                <button onclick="editContact(${c.id})" class="text-sky-600 hover:text-sky-800 px-1.5 py-1 border border-sky-200 rounded text-[10px] font-bold">✏️</button>
                                ${c.id !== 1 && (!totalDebt || totalDebt === 0) ? `<button onclick="deleteContact(${c.id})" class="text-rose-600 hover:text-rose-800 px-1.5 py-1 border border-rose-200 rounded text-[10px] font-bold">🗑️</button>` : ''}
                            </td>
                        </tr>
                        `;
                    }).join('');
                }
            }
        }

        async function loadContacts() {
            try {
                const res = await fetch('/api/contacts');
                allContacts = await res.json();
                
                const custSelect = document.getElementById('pos-customer');
                const suppSelect = document.getElementById('purchase-supplier');
                
                if (custSelect) {
                    custSelect.innerHTML = allContacts.filter(c => c.type === 'customer').map(c => `<option value="${c.id}">${c.name}</option>`).join('');
                }
                if (suppSelect) {
                    suppSelect.innerHTML = '<option value="">-- Chọn Nhà Cung Cấp --</option>' + 
                        allContacts.filter(c => c.type === 'supplier').map(c => `<option value="${c.id}">${c.name} (${c.phone || 'Không SĐT'})</option>`).join('');
                }

                renderContactsTables();
            } catch (e) {
                console.error("loadContacts error:", e);
            }
        }

        function openContactModal(defaultType = 'customer') {
            document.getElementById('contact-form-id').value = '';
            document.getElementById('modal-contact-title').textContent = defaultType === 'customer' ? 'Thêm Khách Hàng Mới' : 'Thêm Nhà Cung Cấp Mới';
            document.getElementById('contact-form-type').value = defaultType;
            document.getElementById('contact-form-name').value = '';
            document.getElementById('contact-form-phone').value = '';
            const emailEl = document.getElementById('contact-form-email');
            if (emailEl) emailEl.value = '';
            document.getElementById('contact-form-address').value = '';
            
            // Populate segments
            const segSelect = document.getElementById('contact-form-segment');
            if (segSelect) {
                if (defaultType === 'customer') {
                    segSelect.parentElement.classList.remove('hidden');
                    fetch('/api/customer-segments').then(r => r.json()).then(segments => {
                        segSelect.innerHTML = '<option value="">-- Không phân nhóm (Mặc định) --</option>' +
                            segments.map(s => `<option value="${s.id}">${s.name} (${s.discount_percent}% off)</option>`).join('');
                    }).catch(() => {});
                } else {
                    segSelect.parentElement.classList.add('hidden');
                }
            }
            document.getElementById('modal-contact').classList.remove('hidden');
        }

        function editContact(id) {
            const c = (allContacts || []).find(item => item.id === id);
            if (!c) return;
            document.getElementById('contact-form-id').value = c.id;
            document.getElementById('modal-contact-title').textContent = c.type === 'customer' ? 'Sửa Thông Tin Khách Hàng' : 'Sửa Thông Tin Nhà Cung Cấp';
            document.getElementById('contact-form-type').value = c.type;
            document.getElementById('contact-form-name').value = c.name;
            document.getElementById('contact-form-phone').value = c.phone || '';
            const emailEl = document.getElementById('contact-form-email');
            if (emailEl) emailEl.value = c.email || '';
            document.getElementById('contact-form-address').value = c.address || '';
            
            const segSelect = document.getElementById('contact-form-segment');
            if (segSelect) {
                if (c.type === 'customer') {
                    segSelect.parentElement.classList.remove('hidden');
                    fetch('/api/customer-segments').then(r => r.json()).then(segments => {
                        segSelect.innerHTML = '<option value="">-- Không phân nhóm (Mặc định) --</option>' +
                            segments.map(s => `<option value="${s.id}" ${s.id === c.segment_id ? 'selected' : ''}>${s.name} (${s.discount_percent}% off)</option>`).join('');
                    }).catch(() => {});
                } else {
                    segSelect.parentElement.classList.add('hidden');
                }
            }
            document.getElementById('modal-contact').classList.remove('hidden');
        }

        function closeContactModal() {
            document.getElementById('modal-contact').classList.add('hidden');
        }

        async function submitContactForm() {
            const id = document.getElementById('contact-form-id').value;
            const type = document.getElementById('contact-form-type').value;
            const name = document.getElementById('contact-form-name').value.trim();
            const phone = document.getElementById('contact-form-phone').value.trim();
            const email = (document.getElementById('contact-form-email')?.value || '').trim();
            const address = document.getElementById('contact-form-address').value.trim();
            const segVal = document.getElementById('contact-form-segment')?.value;
            const segment_id = segVal ? parseInt(segVal) : null;

            if (!name) {
                alert('Vui lòng nhập họ tên hoặc tên đơn vị đối tác!');
                return;
            }

            try {
                if (id) {
                    const res = await fetch(`/api/contacts/${id}`, {
                        method: 'PUT',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ name, phone, email, address, segment_id })
                    });
                    if (!res.ok) {
                        const err = await res.json();
                        alert('Lỗi cập nhật: ' + (err.detail || 'Không thể cập nhật'));
                        return;
                    }
                } else {
                    const res = await fetch('/api/contacts', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ type, name, phone, email, address, segment_id })
                    });
                    if (!res.ok) {
                        const err = await res.json();
                        alert('Lỗi tạo mới: ' + (err.detail || 'Không thể tạo mới'));
                        return;
                    }
                }
                closeContactModal();
                await loadContacts();
                if (typeof initPOS === 'function') initPOS();
            } catch (e) {
                console.error("submitContactForm err:", e);
                alert("Lỗi kết nối máy chủ");
            }
        }

        async function deleteContact(id) {
            if (!confirm('Bạn có chắc chắn muốn xóa đối tác này?')) return;
            try {
                const res = await fetch(`/api/contacts/${id}`, { method: 'DELETE' });
                if (!res.ok) {
                    const err = await res.json();
                    alert(err.detail || 'Không thể xóa');
                    return;
                }
                await loadContacts();
            } catch (e) {
                alert("Lỗi kết nối");
            }
        }

        function openPayDebtModal(id) {
            const c = (allContacts || []).find(item => item.id === id);
            if (!c) return;
            document.getElementById('pay-debt-contact-id').value = c.id;
            document.getElementById('pay-debt-contact-name').textContent = `${c.name} (${c.type === 'customer' ? 'Khách hàng' : 'Nhà cung cấp'})`;
            document.getElementById('pay-debt-current').textContent = formatMoney(c.debt);
            document.getElementById('pay-debt-amount').value = c.debt;
            document.getElementById('pay-debt-note').value = '';
            document.getElementById('modal-pay-debt').classList.remove('hidden');
        }

        function closePayDebtModal() {
            document.getElementById('modal-pay-debt').classList.add('hidden');
        }

        async function submitPayDebt() {
            const id = document.getElementById('pay-debt-contact-id').value;
            const amount = parseFloat(document.getElementById('pay-debt-amount').value) || 0;
            const note = document.getElementById('pay-debt-note').value.trim();

            if (amount <= 0) {
                alert('Số tiền thanh toán phải lớn hơn 0!');
                return;
            }

            try {
                const res = await fetch(`/api/contacts/${id}/pay-debt`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ amount, note })
                });
                if (!res.ok) {
                    const err = await res.json();
                    alert(err.detail || 'Lỗi khi thanh toán công nợ');
                    return;
                }
                closePayDebtModal();
                await loadContacts();
                if (typeof loadCashbook === 'function') loadCashbook();
                alert('Đã thanh toán công nợ và cập nhật sổ quỹ thành công!');
            } catch (e) {
                alert('Lỗi kết nối máy chủ');
            }
        }

        async function viewContactDetail(id) {
            try {
                const res = await fetch(`/api/contacts/${id}`);
                if (!res.ok) {
                    alert('Không tìm thấy thông tin đối tác');
                    return;
                }
                const data = await res.json();
                document.getElementById('modal-contact-detail-name').textContent = `Chi Tiết: ${data.name}`;
                document.getElementById('detail-contact-type').textContent = data.type === 'customer' ? 'Khách Hàng' : 'Nhà Cung Cấp';
                document.getElementById('detail-contact-phone').textContent = data.phone || 'Chưa có';
                document.getElementById('detail-contact-address').textContent = data.address || 'Chưa có';
                document.getElementById('detail-contact-debt').textContent = formatMoney(data.debt);

                const tbHist = document.getElementById('detail-contact-history');
                if (data.history && data.history.length > 0) {
                    tbHist.innerHTML = data.history.map(h => `
                        <tr class="border-b hover:bg-gray-50">
                            <td class="p-2 font-mono font-bold text-sky-700">${h.code}</td>
                            <td class="p-2 text-gray-500">${h.created_at || '-'}</td>
                            <td class="p-2 text-right font-mono font-bold">${formatMoney(h.total_amount)}</td>
                            <td class="p-2 text-right font-mono text-emerald-600">${formatMoney(h.paid_amount)}</td>
                            <td class="p-2 text-right font-mono text-rose-600 font-bold">${formatMoney(h.debt)}</td>
                        </tr>
                    `).join('');
                } else {
                    tbHist.innerHTML = '<tr><td colspan="5" class="p-3 text-center text-gray-400">Chưa có lịch sử giao dịch</td></tr>';
                }

                const tbCash = document.getElementById('detail-contact-cashbook');
                if (data.cashbook_history && data.cashbook_history.length > 0) {
                    tbCash.innerHTML = data.cashbook_history.map(c => `
                        <tr class="border-b hover:bg-gray-50">
                            <td class="p-2 font-mono font-bold">${c.code}</td>
                            <td class="p-2 text-gray-500">${c.created_at || '-'}</td>
                            <td class="p-2">${c.category}</td>
                            <td class="p-2 text-right font-mono font-bold ${c.type === 'in' ? 'text-emerald-600' : 'text-rose-600'}">
                                ${c.type === 'in' ? '+' : '-'}${formatMoney(c.amount)}
                            </td>
                            <td class="p-2 text-gray-500">${c.note || '-'}</td>
                        </tr>
                    `).join('');
                } else {
                    tbCash.innerHTML = '<tr><td colspan="5" class="p-3 text-center text-gray-400">Chưa có giao dịch sổ quỹ</td></tr>';
                }

                document.getElementById('modal-contact-detail').classList.remove('hidden');
            } catch (e) {
                alert('Lỗi khi tải thông tin chi tiết');
            }
        }

        // ==========================================
        // IMPORT / EXPORT EXCEL ĐỐI TÁC
        // ==========================================
        function openImportContactsModal() {
            const modal = document.getElementById('modal-contacts-import');
            if (modal) {
                modal.classList.remove('hidden');
                updateDownloadTemplateLink();
            }
        }

        function closeImportContactsModal() {
            const modal = document.getElementById('modal-contacts-import');
            if (modal) modal.classList.add('hidden');
        }

        function updateDownloadTemplateLink() {
            const type = document.getElementById('import-contacts-type')?.value || 'customer';
            const link = document.getElementById('link-download-contact-template');
            if (link) {
                link.href = `/api/contacts/template-excel?type=${type}`;
            }
        }

        async function submitImportContacts() {
            const type = document.getElementById('import-contacts-type')?.value || 'customer';
            const fileInput = document.getElementById('import-contacts-file');
            if (!fileInput || !fileInput.files || fileInput.files.length === 0) {
                alert('Vui lòng chọn file Excel để nhập!');
                return;
            }

            const formData = new FormData();
            formData.append('file', fileInput.files[0]);

            try {
                const btn = document.getElementById('btn-submit-import-contacts');
                if (btn) { btn.disabled = true; btn.textContent = 'Đang xử lý...'; }

                const res = await fetch(`/api/contacts/import-excel?type=${type}`, {
                    method: 'POST',
                    body: formData
                });
                const result = await res.json();
                if (!res.ok) {
                    alert('Lỗi import: ' + (result.detail || 'Không thể nhập file'));
                    return;
                }
                alert(`Đã nhập thành công ${result.imported_count || 0} đối tác! (Bỏ qua ${result.skipped_count || 0} dòng)`);
                closeImportContactsModal();
                fileInput.value = '';
                await loadContacts();
            } catch (e) {
                console.error("submitImportContacts err:", e);
                alert("Lỗi kết nối máy chủ");
            } finally {
                const btn = document.getElementById('btn-submit-import-contacts');
                if (btn) { btn.disabled = false; btn.textContent = '🚀 Bắt Đầu Import'; }
            }
        }

        function exportContactsExcel() {
            const type = currentContactTab || 'customer';
            window.location.href = `/api/contacts/export-excel?type=${type}`;
        }

        // ==========================================
        // QUẢN LÝ THÚ CƯNG THEO KHÁCH HÀNG
        // ==========================================
        let currentPetCustomerId = null;

        function openCustomerPetsModal(customerId, customerName) {
            currentPetCustomerId = customerId;
            const modal = document.getElementById('modal-customer-pets');
            const titleEl = document.getElementById('modal-pets-title');
            if (titleEl) titleEl.textContent = `🐾 Hồ Sơ Thú Cưng: ${customerName}`;
            if (modal) modal.classList.remove('hidden');
            loadCustomerPets(customerId);
        }

        function closeCustomerPetsModal() {
            const modal = document.getElementById('modal-customer-pets');
            if (modal) modal.classList.add('hidden');
            currentPetCustomerId = null;
        }

        async function loadCustomerPets(customerId) {
            const tbody = document.getElementById('table-customer-pets');
            if (!tbody) return;
            try {
                tbody.innerHTML = '<tr><td colspan="8" class="p-4 text-center text-gray-400">Đang tải danh sách thú cưng...</td></tr>';
                const res = await fetch(`/api/contacts/${customerId}/pets`);
                const pets = await res.json();
                if (pets.length === 0) {
                    tbody.innerHTML = '<tr><td colspan="8" class="p-6 text-center text-gray-400">Khách hàng này chưa có thú cưng nào. Hãy thêm bé mới bên dưới!</td></tr>';
                    return;
                }
                tbody.innerHTML = pets.map((p, idx) => `
                    <tr class="border-b hover:bg-slate-50 transition text-xs">
                        <td class="p-2 text-center text-gray-500">${idx + 1}</td>
                        <td class="p-2 font-bold text-slate-800">${p.name}</td>
                        <td class="p-2 text-center"><span class="px-2 py-0.5 rounded text-[10px] font-bold ${p.species === 'Mèo' ? 'bg-amber-100 text-amber-800' : 'bg-sky-100 text-sky-800'}">${p.species || 'Chó'}</span></td>
                        <td class="p-2 text-gray-700">${p.breed || '-'}</td>
                        <td class="p-2 text-gray-600">${p.color || '-'}</td>
                        <td class="p-2 text-center font-bold text-purple-700">${p.weight ? p.weight + ' kg' : '-'}</td>
                        <td class="p-2 text-gray-500 max-w-xs truncate">${p.note || '-'}</td>
                        <td class="p-2 text-center">
                            <button onclick="deletePet(${p.id})" class="text-rose-600 hover:text-rose-800 px-2 py-1 rounded border border-rose-200 text-[10px] font-bold">🗑️ Xóa</button>
                        </td>
                    </tr>
                `).join('');
            } catch (e) {
                console.error("loadCustomerPets err:", e);
                tbody.innerHTML = '<tr><td colspan="8" class="p-4 text-center text-rose-500">Lỗi tải danh sách thú cưng</td></tr>';
            }
        }

        async function saveNewPet() {
            if (!currentPetCustomerId) {
                alert('Chưa chọn khách hàng!');
                return;
            }
            const name = document.getElementById('new-pet-name')?.value.trim();
            const species = document.getElementById('new-pet-species')?.value;
            const breed = document.getElementById('new-pet-breed')?.value.trim();
            const color = document.getElementById('new-pet-color')?.value.trim();
            const rawWeight = document.getElementById('new-pet-weight')?.value;
            const weight = (typeof parseWeightFloat === 'function') ? parseWeightFloat(rawWeight) : (parseFloat(String(rawWeight).replace(',', '.')) || 0);
            const note = document.getElementById('new-pet-note')?.value.trim();

            if (!name) {
                alert('Vui lòng nhập tên bé thú cưng!');
                return;
            }

            try {
                const res = await fetch(`/api/contacts/${currentPetCustomerId}/pets`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ name, species, breed, color, weight, note })
                });
                if (!res.ok) {
                    const err = await res.json();
                    alert('Lỗi thêm bé: ' + (err.detail || 'Không thể thêm'));
                    return;
                }
                // Reset inputs
                if (document.getElementById('new-pet-name')) document.getElementById('new-pet-name').value = '';
                if (document.getElementById('new-pet-breed')) document.getElementById('new-pet-breed').value = '';
                if (document.getElementById('new-pet-color')) document.getElementById('new-pet-color').value = '';
                if (document.getElementById('new-pet-weight')) document.getElementById('new-pet-weight').value = '';
                if (document.getElementById('new-pet-note')) document.getElementById('new-pet-note').value = '';

                await loadCustomerPets(currentPetCustomerId);
                await loadContacts(); // Refresh pet count badge
                if (typeof loadAllPetsList === 'function') loadAllPetsList();
            } catch (e) {
                alert('Lỗi kết nối máy chủ');
            }
        }

        async function deletePet(petId) {
            if (!confirm('Bạn có chắc muốn xóa hồ sơ bé thú cưng này?')) return;
            try {
                const res = await fetch(`/api/pets/${petId}`, { method: 'DELETE' });
                if (!res.ok) {
                    alert('Không thể xóa thú cưng');
                    return;
                }
                if (currentPetCustomerId) await loadCustomerPets(currentPetCustomerId);
                await loadContacts();
                if (typeof loadAllPetsList === 'function') loadAllPetsList();
            } catch (e) {
                alert('Lỗi kết nối');
            }
        }

        // ==========================================
        // TAB QUẢN LÝ THÚ CƯNG & DỊCH VỤ TOÀN HỆ THỐNG
        // ==========================================
        let allPetsData = [];
        let petSearchDebounceTimer = null;

        function switchPetSubTab(sub) {
            const btnServices = document.getElementById('btn-pet-sub-services');
            const btnPricing = document.getElementById('btn-pet-sub-pricing');
            const btnStaff = document.getElementById('btn-pet-sub-staff');
            const viewServices = document.getElementById('pet-sub-view-services');
            const viewPricing = document.getElementById('pet-sub-view-pricing');
            const viewStaff = document.getElementById('pet-sub-view-staff');

            const inactiveClass = 'px-4 py-2 font-bold bg-white text-slate-700 border hover:bg-gray-50';
            const activeClass = 'px-4 py-2 font-bold bg-slate-800 text-white';

            if (btnServices) btnServices.className = (sub === 'services' ? activeClass + ' rounded-l-md' : inactiveClass + ' rounded-l-md');
            if (btnPricing) btnPricing.className = (sub === 'pricing' ? activeClass : inactiveClass);
            if (btnStaff) btnStaff.className = (sub === 'staff' ? activeClass + ' rounded-r-md' : inactiveClass + ' rounded-r-md');

            if (viewServices) viewServices.classList.toggle('hidden', sub !== 'services');
            if (viewPricing) viewPricing.classList.toggle('hidden', sub !== 'pricing');
            if (viewStaff) viewStaff.classList.toggle('hidden', sub !== 'staff');

            if (sub === 'services') {
                loadPetServicesList();
                loadPetServicesKPI();
            } else if (sub === 'pricing') {
                loadPetPricingList();
            } else if (sub === 'staff') {
                loadSpaStaffList();
            }
        }

        function debounceFilterPets() {
            clearTimeout(petSearchDebounceTimer);
            petSearchDebounceTimer = setTimeout(renderAllPetsTable, 200);
        }

        async function loadAllPetsList() {
            const tbody = document.getElementById('table-all-pets');
            if (!tbody) return;
            try {
                tbody.innerHTML = '<tr><td colspan="10" class="p-6 text-center text-gray-400">Đang tải danh bạ thú cưng...</td></tr>';
                const res = await fetch('/api/pets/all');
                allPetsData = await res.json();

                const kpiTotal = document.getElementById('kpi-pets-total');
                if (kpiTotal) kpiTotal.textContent = allPetsData.length;

                renderAllPetsTable();
            } catch (e) {
                console.error("loadAllPetsList err:", e);
                tbody.innerHTML = '<tr><td colspan="10" class="p-6 text-center text-rose-500">Lỗi tải danh bạ thú cưng</td></tr>';
            }
        }

        function renderAllPetsTable() {
            const q = (document.getElementById('search-pets-input')?.value || '').trim().toLowerCase();
            const tbody = document.getElementById('table-all-pets');
            if (!tbody) return;

            const filtered = (allPetsData || []).filter(p => {
                if (!q) return true;
                return (p.name || '').toLowerCase().includes(q) ||
                       (p.species || '').toLowerCase().includes(q) ||
                       (p.breed || '').toLowerCase().includes(q) ||
                       (p.customer_name || '').toLowerCase().includes(q) ||
                       (p.customer_phone || '').includes(q);
            });

            if (filtered.length === 0) {
                tbody.innerHTML = '<tr><td colspan="10" class="p-6 text-center text-gray-400">Không tìm thấy bé thú cưng nào phù hợp</td></tr>';
                return;
            }

            tbody.innerHTML = filtered.map((p, idx) => `
                <tr class="border-b hover:bg-slate-50 transition text-xs">
                    <td class="p-2.5 text-center text-gray-500">${idx + 1}</td>
                    <td class="p-2.5 font-bold text-slate-800 text-sm">${p.name}</td>
                    <td class="p-2.5 text-center">
                        <span class="px-2 py-0.5 rounded text-[10px] font-bold ${p.species === 'Mèo' ? 'bg-amber-100 text-amber-800' : 'bg-sky-100 text-sky-800'}">${p.species || 'Chó'}</span>
                    </td>
                    <td class="p-2.5 text-gray-700">${p.breed || '-'}</td>
                    <td class="p-2.5 text-gray-600">${p.color || '-'}</td>
                    <td class="p-2.5 text-center font-bold text-purple-700 font-mono">${p.weight ? p.weight + ' kg' : '-'}</td>
                    <td class="p-2.5 font-bold text-sky-700">${p.customer_name || '-'}</td>
                    <td class="p-2.5 font-mono text-gray-600">${p.customer_phone || '-'}</td>
                    <td class="p-2.5 text-gray-500 max-w-xs truncate">${p.note || '-'}</td>
                    <td class="p-2.5 text-center space-x-1 whitespace-nowrap">
                        <button onclick="openCustomerPetsModal(${p.customer_id}, '${escapeJs(p.customer_name || '')}')" class="px-2 py-1 bg-sky-50 hover:bg-sky-100 text-sky-700 rounded border border-sky-200 text-[10px] font-bold">🐾 Chi tiết</button>
                        <button onclick="deletePet(${p.id})" class="px-2 py-1 bg-rose-50 hover:bg-rose-100 text-rose-600 rounded border border-rose-200 text-[10px] font-bold">🗑️</button>
                    </td>
                </tr>
            `).join('');
        }

        function openGlobalPetModal() {
            const customers = (allContacts || []).filter(c => c.type === 'customer');
            if (customers.length === 0) {
                alert('Chưa có khách hàng nào trong hệ thống! Vui lòng thêm khách hàng trước.');
                return;
            }
            openCustomerPetsModal(customers[0].id, customers[0].name);
        }

        // ==========================================
        // PET SERVICES KPI & TICKET LIST
        // ==========================================
        var allPetServiceTickets = [];
        var petServiceFilterStatus = 'all';

        async function loadPetServicesKPI() {
            try {
                const res = await fetch('/api/pet-services/kpi');
                const kpi = await res.json();
                const el = (id, val) => { const e = document.getElementById(id); if(e) e.textContent = val; };
                el('kpi-pets-total', kpi.total_pets || 0);
                el('kpi-pets-appointments-today', kpi.appointments_today || 0);
                el('kpi-pets-in-progress', kpi.in_progress || 0);
                el('kpi-pets-transport', kpi.transport || 0);
            } catch(e) { console.error('loadPetServicesKPI error:', e); }
        }

        var currentSpaView = 'table';

        function switchSpaView(view) {
            currentSpaView = (view === 'kanban') ? 'kanban' : 'table';
            ['table', 'kanban'].forEach(v => {
                const elView = document.getElementById('spa-view-' + v);
                const btn = document.getElementById('btn-spa-view-' + v);
                if (elView) {
                    if (v === currentSpaView) {
                        elView.classList.remove('hidden');
                    } else {
                        elView.classList.add('hidden');
                    }
                }
                if (btn) {
                    if (v === currentSpaView) {
                        btn.className = `px-3 py-1.5 font-bold bg-purple-700 text-white ${v === 'table' ? 'rounded-l-lg' : 'rounded-r-lg'}`;
                    } else {
                        btn.className = `px-3 py-1.5 font-bold text-slate-600 hover:bg-purple-50 ${v === 'table' ? 'rounded-l-lg' : 'border-l rounded-r-lg'}`;
                    }
                }
            });
            renderActiveSpaView();
        }

        function renderActiveSpaView() {
            renderPetServicesTable();
            renderKanbanBoard();
        }

        function filterPetServices(status) {
            petServiceFilterStatus = status;
            ['all','pending','in_progress','completed','checked_out'].forEach(s => {
                const btn = document.getElementById('btn-svc-filter-' + s);
                if (btn) btn.className = s === status
                    ? 'px-3 py-1.5 text-xs font-bold rounded-md bg-purple-700 text-white shadow'
                    : 'px-3 py-1.5 text-xs font-bold rounded-md bg-white text-slate-700 border hover:bg-gray-50';
            });
            renderActiveSpaView();
        }

        async function loadPetServicesList() {
            try {
                const res = await fetch('/api/pet-services');
                if (!res.ok) {
                    allPetServiceTickets = [];
                    renderActiveSpaView();
                    return;
                }
                const data = await res.json();
                allPetServiceTickets = Array.isArray(data) ? data : [];
                renderActiveSpaView();
            } catch(e) { 
                console.error('loadPetServicesList error:', e);
                allPetServiceTickets = [];
                renderActiveSpaView();
            }
        }

        function getSpaStatusSelectorHtml(t) {
            const s = t.status;
            let colorClass = 'bg-gray-100 text-gray-800 border-gray-300';
            if (s === 'pending') colorClass = 'bg-amber-50 text-amber-800 border-amber-300';
            if (s === 'in_progress') colorClass = 'bg-sky-50 text-sky-800 border-sky-300';
            if (s === 'completed') colorClass = 'bg-emerald-50 text-emerald-800 border-emerald-300';
            if (s === 'checked_out') colorClass = 'bg-purple-50 text-purple-800 border-purple-300';

            return `
                <select onchange="updateServiceStatus(${t.id}, this.value)" class="text-[11px] font-bold py-1 px-1.5 rounded border ${colorClass} outline-none cursor-pointer">
                    <option value="pending" ${s === 'pending' ? 'selected' : ''}>⏳ Chờ</option>
                    <option value="in_progress" ${s === 'in_progress' ? 'selected' : ''}>🔄 Đang làm</option>
                    <option value="completed" ${s === 'completed' ? 'selected' : ''}>✅ Xong</option>
                    <option value="checked_out" ${s === 'checked_out' ? 'selected' : ''}>🏠 Đã Về</option>
                </select>
            `;
        }
        var statusSelector = getSpaStatusSelectorHtml;

        function getSpaCallStatusSelectorHtml(t) {
            const cs = t.call_status || 'Chưa gọi';
            let csClass = 'bg-gray-50 text-slate-700 border-gray-200';
            if (cs === 'Đã gọi đón') csClass = 'bg-emerald-50 text-emerald-700 border-emerald-300 font-bold';
            if (cs === 'Không nghe máy') csClass = 'bg-rose-50 text-rose-700 border-rose-300 font-bold';
            if (cs === 'Hẹn giờ đón') csClass = 'bg-amber-50 text-amber-700 border-amber-300 font-bold';

            return `
                <select onchange="updateServiceCallStatus(${t.id}, this.value)" class="text-[10px] py-0.5 px-1 rounded border ${csClass} outline-none cursor-pointer">
                    <option value="Chưa gọi" ${cs === 'Chưa gọi' ? 'selected' : ''}>📞 Chưa gọi</option>
                    <option value="Đã gọi đón" ${cs === 'Đã gọi đón' ? 'selected' : ''}>✅ Đã gọi đón</option>
                    <option value="Không nghe máy" ${cs === 'Không nghe máy' ? 'selected' : ''}>❌ Không nghe</option>
                    <option value="Hẹn giờ đón" ${cs === 'Hẹn giờ đón' ? 'selected' : ''}>⏰ Hẹn giờ</option>
                </select>
            `;
        }
        var callStatusSelector = getSpaCallStatusSelectorHtml;

        function renderPetServicesTable() {
            const tbody = document.getElementById('table-pet-services');
            if (!tbody) return;
            if (!Array.isArray(allPetServiceTickets)) allPetServiceTickets = [];
            const q = (document.getElementById('search-pet-services')?.value || '').trim().toLowerCase();
            let filtered = allPetServiceTickets.filter(t => {
                if (petServiceFilterStatus !== 'all' && t.status !== petServiceFilterStatus) return false;
                if (q && !(t.code||'').toLowerCase().includes(q) && !(t.customer_name||'').toLowerCase().includes(q) && !(t.customer_phone||'').includes(q) && !(t.pet_name||'').toLowerCase().includes(q) && !(t.service_type||'').toLowerCase().includes(q) && !(t.staff_cutter||'').toLowerCase().includes(q) && !(t.staff_receiver||'').toLowerCase().includes(q)) return false;
                return true;
            });

            if (filtered.length === 0) {
                tbody.innerHTML = '<tr><td colspan="13" class="p-6 text-center text-gray-400">Chưa có phiếu dịch vụ nào</td></tr>';
                return;
            }

            tbody.innerHTML = filtered.map(t => {
                // Thợ làm
                let staffDisplay = [];
                if (t.staff_receiver) staffDisplay.push(`<span class="text-purple-700 font-bold" title="Nhận">📥 ${t.staff_receiver}</span>`);
                if (t.staff_cutter) staffDisplay.push(`<span class="text-pink-700 font-bold" title="Cắt">✂️ ${t.staff_cutter}</span>`);
                if (t.staff_worker_1) staffDisplay.push(`<span class="text-sky-700" title="Tắm/Làm 1">🛁 ${t.staff_worker_1}</span>`);
                if (t.staff_dyer) staffDisplay.push(`<span class="text-amber-700" title="Nhuộm">🎨 ${t.staff_dyer}</span>`);
                const staffHtml = staffDisplay.length > 0 ? staffDisplay.join('<br>') : '<span class="text-gray-400 italic">Chưa phân công</span>';

                // Phụ thu
                let extraFees = [];
                if (t.teeth_cleaning) extraFees.push(`Răng: ${formatMoney(t.teeth_cleaning)}`);
                if (t.art_cutting_fee) extraFees.push(`Cắt NT: ${formatMoney(t.art_cutting_fee)}`);
                if (t.surcharge) extraFees.push(`Phụ thu: ${formatMoney(t.surcharge)}`);
                if (t.shipping_fee) extraFees.push(`Ship: ${formatMoney(t.shipping_fee)}`);
                if (t.tip_amount) extraFees.push(`<span class="text-emerald-700 font-bold">🎁 Tip thợ: ${formatMoney(t.tip_amount)}</span>`);
                const extraFeesHtml = extraFees.length > 0 ? `<div class="text-[11px] text-amber-800 font-semibold space-y-0.5">${extraFees.join('<br>')}</div>` : '<span class="text-gray-400">-</span>';

                return `
                <tr class="border-b border-slate-200 hover:bg-purple-50/40 transition text-[13px]">
                    <!-- 1. STT / Mã -->
                    <td class="p-3 text-center font-mono font-bold text-purple-700 border-r border-slate-200">
                        ${t.ticket_number ? `<span class="bg-purple-100 text-purple-900 border border-purple-300 px-2 py-0.5 rounded text-sm font-black shadow-xs">#${t.ticket_number}</span>` : '-'}
                        <div class="text-[10px] text-gray-400 font-mono mt-1">${t.code || ''}</div>
                    </td>
                    <!-- 2. Khách hàng -->
                    <td class="p-3">
                        <div class="font-bold text-slate-800">${t.customer_name || '-'}</div>
                        <div class="font-mono text-xs text-gray-500">${t.customer_phone || ''}</div>
                    </td>
                    <!-- 3. Trạng thái gọi điện -->
                    <td class="p-3 text-center">${callStatusSelector(t)}</td>
                    <!-- 4. Thú cưng -->
                    <td class="p-3">
                        <div class="font-bold text-pink-700">🐾 ${t.pet_name || 'Bé cưng'} <span class="text-xs font-medium text-slate-600">(${t.pet_breed || t.pet_species || 'Cún'})</span></div>
                        <div class="text-[11px] text-gray-600 flex items-center gap-1.5 mt-0.5">
                            <span>${t.pet_color || '-'}${t.pet_gender ? ' / ' + t.pet_gender : ''}</span>
                            ${t.weight_at_service ? `<span class="bg-pink-100 text-pink-800 font-bold px-1.5 py-0.2 rounded text-[11px]">${String(t.weight_at_service).replace('.', ',')} kg</span>` : ''}
                        </div>
                    </td>
                    <!-- 5. Dịch vụ -->
                    <td class="p-3">
                        <div class="font-bold text-slate-800">${t.service_type || '-'}</div>
                        ${t.dye_package ? `<div class="text-[11px] text-purple-700 font-semibold">🎨 ${t.dye_package}</div>` : ''}
                    </td>
                    <!-- 6. Lưu ý & Yêu cầu -->
                    <td class="p-3 text-xs text-gray-700 max-w-xs">
                        ${t.shaving_feet ? `<span class="bg-purple-100 text-purple-800 font-bold px-1.5 py-0.5 rounded text-[10px] mr-1">${t.shaving_feet}</span>` : ''}
                        ${t.customer_request ? `<div class="font-medium text-slate-700">${t.customer_request}</div>` : ''}
                        ${t.accessories ? `<div class="text-[11px] text-amber-700 font-medium">🎒 ${t.accessories}</div>` : ''}
                        ${t.note ? `<div class="text-[11px] italic text-gray-500">📝 ${t.note}</div>` : ''}
                    </td>
                    <!-- 7. Thợ phụ trách -->
                    <td class="p-3 text-xs">${staffHtml}</td>
                    <!-- 8. Trạng thái làm -->
                    <td class="p-3 text-center border-r-2 border-purple-300">${statusSelector(t)}</td>
                    <!-- 9. Phụ thu -->
                    <td class="p-3 text-right font-medium">${extraFeesHtml}</td>
                    <!-- 10. Tổng tiền -->
                    <td class="p-3 text-right font-mono font-black text-sky-700 text-sm">${formatMoney(t.price || 0)}</td>
                    <!-- 11. Thanh toán -->
                    <td class="p-3 text-center">
                        ${t.payment_status === 'paid' ? '<span class="bg-emerald-100 text-emerald-800 font-bold px-1.5 py-0.5 rounded text-[11px]">Đã TT</span>' : '<span class="bg-amber-100 text-amber-800 font-bold px-1.5 py-0.5 rounded text-[11px]">Chưa TT</span>'}
                    </td>
                    <!-- 12. Đưa đón -->
                    <td class="p-3 text-center text-[11px] text-gray-600">
                        <div><span class="text-purple-700 font-bold">Đến:</span> <strong>${t.received_time || '-'}</strong> <span class="text-[10px] text-gray-500">(${t.arrival_method || 'Tự đến'})</span></div>
                        <div><span class="text-emerald-700 font-bold">Về:</span> <strong>${t.checkout_time || '-'}</strong> <span class="text-[10px] text-gray-500">(${t.return_method || 'Tự về'})</span></div>
                    </td>
                    <!-- 13. Thao tác -->
                    <td class="p-3 text-center space-x-1 whitespace-nowrap">
                        <button onclick="openServiceProgressModal(${t.id})" class="bg-indigo-600 hover:bg-indigo-700 text-white px-1.5 py-1 rounded text-[11px] font-bold shadow-sm" title="Cập nhật thợ làm, phụ thu & trả bé">✏️</button>
                        <button onclick="printPetServiceTicketDirectly(${t.id}, 'intake')" class="bg-purple-600 hover:bg-purple-700 text-white px-1.5 py-1 rounded text-[11px] font-bold shadow-sm" title="In phiếu tiếp nhận (2 chữ ký)">🖨️ Nhận</button>
                        <button onclick="printPetServiceTicketDirectly(${t.id}, 'invoice')" class="bg-emerald-600 hover:bg-emerald-700 text-white px-1.5 py-1 rounded text-[11px] font-bold shadow-sm" title="In hóa đơn thanh toán K80">🧾 Trả</button>
                        <button onclick="deletePetService(${t.id})" class="text-rose-600 hover:text-rose-800 px-1 py-1 border border-rose-200 rounded text-[11px] font-bold" title="Xóa phiếu">🗑️</button>
                    </td>
                </tr>
                `;
            }).join('');
        }

        function renderKanbanBoard() {
            const kanbanContainer = document.getElementById('kanban-board');
            if (!kanbanContainer) return;
            if (!Array.isArray(allPetServiceTickets)) allPetServiceTickets = [];

            const q = (document.getElementById('search-pet-services')?.value || '').trim().toLowerCase();
            let filtered = allPetServiceTickets.filter(t => {
                if (q && !(t.code||'').toLowerCase().includes(q) && !(t.customer_name||'').toLowerCase().includes(q) && !(t.customer_phone||'').includes(q) && !(t.pet_name||'').toLowerCase().includes(q) && !(t.service_type||'').toLowerCase().includes(q) && !(t.staff_cutter||'').toLowerCase().includes(q) && !(t.staff_receiver||'').toLowerCase().includes(q)) return false;
                return true;
            });

            const cols = ['pending', 'in_progress', 'completed', 'checked_out'];
            cols.forEach(status => {
                const colEl = document.getElementById('kanban-col-' + status);
                const countEl = document.getElementById('kanban-count-' + status);
                const ticketsInCol = filtered.filter(t => (t.status || 'pending') === status);
                if (countEl) countEl.innerText = ticketsInCol.length;
                if (!colEl) return;

                if (ticketsInCol.length === 0) {
                    colEl.innerHTML = '<div class="text-xs text-gray-400 italic text-center py-12">Không có phiếu</div>';
                    return;
                }

                colEl.innerHTML = ticketsInCol.map(t => {
                    // Thợ phụ trách
                    let staffPills = [];
                    if (t.staff_receiver) staffPills.push(`<span class="text-purple-700 font-semibold">📥 ${t.staff_receiver}</span>`);
                    if (t.staff_cutter) staffPills.push(`<span class="text-pink-700 font-semibold">✂️ ${t.staff_cutter}</span>`);
                    if (t.staff_worker_1) staffPills.push(`<span class="text-sky-700">🛁 ${t.staff_worker_1}</span>`);
                    if (t.staff_dyer) staffPills.push(`<span class="text-amber-700">🎨 ${t.staff_dyer}</span>`);

                    // Phụ thu
                    let extraFees = [];
                    if (t.teeth_cleaning) extraFees.push(`Răng: ${formatMoney(t.teeth_cleaning)}`);
                    if (t.art_cutting_fee) extraFees.push(`Cắt NT: ${formatMoney(t.art_cutting_fee)}`);
                    if (t.surcharge) extraFees.push(`Phụ thu: ${formatMoney(t.surcharge)}`);
                    if (t.shipping_fee) extraFees.push(`Ship: ${formatMoney(t.shipping_fee)}`);
                    if (t.tip_amount) extraFees.push(`<span class="text-emerald-700 font-bold">🎁 Tip thợ: ${formatMoney(t.tip_amount)}</span>`);
                    const extraFeesText = extraFees.length > 0 ? extraFees.join(', ') : '';

                    return `
                        <div class="bg-white rounded-xl border-2 border-slate-200 p-3.5 shadow-sm space-y-2.5 hover:border-purple-400 hover:shadow-md transition">
                            <!-- Header thẻ: STT to nổi bật + Dropdown đổi trạng thái trực tiếp -->
                            <div class="flex items-center justify-between gap-2 pb-2 border-b border-slate-100">
                                <div class="flex items-center gap-2">
                                    <span class="text-xl font-black font-mono text-purple-900 bg-purple-100 border-2 border-purple-300 px-3 py-0.5 rounded-lg shadow-xs">#${t.ticket_number || t.id}</span>
                                    <span class="text-[11px] text-gray-400 font-mono">${t.code || ''}</span>
                                </div>
                                <div>
                                    ${statusSelector(t)}
                                </div>
                            </div>

                            <!-- Giờ nhận / Giờ trả -->
                            <div class="text-[11px] bg-slate-50 px-2 py-1 rounded-md border border-slate-100 flex items-center justify-between text-slate-600">
                                <div><span class="text-purple-700 font-bold">📥 Đến:</span> <strong>${t.received_time || '-'}</strong> <span class="text-[10px] text-gray-500">(${t.arrival_method || 'Tự đến'})</span></div>
                                ${t.checkout_time ? `<div><span class="text-emerald-700 font-bold">📤 Về:</span> <strong>${t.checkout_time}</strong></div>` : ''}
                            </div>

                            <!-- Khách hàng & Cập nhật Gọi Điện Ngay Tại Thẻ -->
                            <div class="flex items-center justify-between gap-2 bg-slate-50/70 p-2 rounded-lg border border-slate-100">
                                <div class="min-w-0 flex-1">
                                    <div class="font-bold text-slate-800 text-xs truncate">👤 ${t.customer_name || 'Khách lẻ'}</div>
                                    <div class="font-mono text-[11px] text-gray-500">${t.customer_phone || ''}</div>
                                </div>
                                <div class="flex-shrink-0">
                                    ${callStatusSelector(t)}
                                </div>
                            </div>

                            <!-- Thông tin bé cưng -->
                            <div>
                                <div class="font-bold text-sm text-slate-900 flex items-center gap-1.5">
                                    <span class="text-pink-600 font-black">🐾 ${t.pet_name || 'Bé cưng'}</span>
                                    <span class="text-xs font-normal text-slate-500">(${t.pet_breed || t.pet_species || 'Cún'})</span>
                                </div>
                                <div class="text-xs text-pink-700 font-bold mt-0.5 flex items-center gap-2">
                                    <span class="bg-pink-100 text-pink-800 px-2 py-0.2 rounded font-bold">${t.weight_at_service ? String(t.weight_at_service).replace('.', ',') + ' kg' : '-'}</span>
                                    <span class="text-slate-600 font-normal">${t.pet_color || '-'}${t.pet_gender ? ' / ' + t.pet_gender : ''}</span>
                                </div>
                            </div>

                            <!-- Gói dịch vụ & Ghi chú -->
                            <div class="text-xs bg-purple-50/50 p-2 rounded-lg border border-purple-100 space-y-1">
                                <div class="font-bold text-purple-950">${t.service_type || '-'}</div>
                                ${t.dye_package ? `<div class="text-[11px] text-purple-700 font-semibold">🎨 Nhuộm: ${t.dye_package}</div>` : ''}
                                ${t.shaving_feet ? `<div class="text-[11px] text-purple-800 font-medium">⚡ Cạo bàn: <strong>${t.shaving_feet}</strong></div>` : ''}
                                ${t.customer_request ? `<div class="text-[11px] text-slate-700">✂️ Y/c: ${t.customer_request}</div>` : ''}
                                ${t.accessories ? `<div class="text-[11px] text-amber-700">🎒 PK: ${t.accessories}</div>` : ''}
                                ${t.note ? `<div class="text-[11px] text-gray-500 italic">📝 ${t.note}</div>` : ''}
                            </div>

                            <!-- Thợ phụ trách -->
                            ${staffPills.length > 0 ? `
                                <div class="text-[11px] bg-slate-100/80 p-1.5 rounded-lg flex flex-wrap gap-x-2 gap-y-1">
                                    ${staffPills.join('')}
                                </div>
                            ` : ''}

                            <!-- Phụ thu (nếu có) -->
                            ${extraFeesText ? `
                                <div class="text-[11px] text-amber-800 bg-amber-50 px-2 py-1 rounded border border-amber-200">
                                    <strong>Phụ thu:</strong> ${extraFeesText}
                                </div>
                            ` : ''}

                            <!-- Tổng tiền & TT -->
                            <div class="flex items-center justify-between text-xs pt-2 border-t border-slate-100">
                                <div>
                                    <span class="text-[11px] text-gray-500">Tổng thu:</span>
                                    <span class="font-mono font-black text-sky-700 text-sm ml-1">${formatMoney(t.price || 0)}</span>
                                </div>
                                <div>
                                    ${t.payment_status === 'paid' ? '<span class="text-[11px] bg-emerald-100 text-emerald-800 font-bold px-2 py-0.5 rounded">Đã TT</span>' : '<span class="text-[11px] bg-amber-100 text-amber-800 font-bold px-2 py-0.5 rounded">Chưa TT</span>'}
                                </div>
                            </div>

                            <!-- Nút chuyển tiến độ 1-click & Nút hoàn tác (Đã về vẫn hoàn tác lại được) -->
                            <div class="pt-2 border-t border-slate-100 flex items-center justify-between gap-1.5">
                                <div class="flex items-center gap-1">
                                    <button onclick="openServiceProgressModal(${t.id})" class="text-xs bg-indigo-50 hover:bg-indigo-100 text-indigo-700 font-bold px-2 py-1 rounded border border-indigo-200" title="Cập nhật tiến độ & phụ thu">✏️ Sửa</button>
                                    <button onclick="printPetServiceTicketDirectly(${t.id}, 'intake')" class="text-xs bg-purple-50 hover:bg-purple-100 text-purple-800 font-bold px-2 py-1 rounded border border-purple-200" title="In phiếu nhận K80">🖨️ Nhận</button>
                                    <button onclick="printPetServiceTicketDirectly(${t.id}, 'invoice')" class="text-xs bg-emerald-50 hover:bg-emerald-100 text-emerald-800 font-bold px-2 py-1 rounded border border-emerald-200" title="In hóa đơn thanh toán K80">🧾 Trả</button>
                                    <button onclick="deletePetService(${t.id})" class="text-xs text-rose-600 hover:text-rose-800 p-1 border border-rose-200 rounded font-bold" title="Xóa phiếu">🗑️</button>
                                </div>
                                <div>
                                    ${t.status === 'pending' ? `<button onclick="updateServiceStatus(${t.id}, 'in_progress')" class="text-xs bg-sky-600 hover:bg-sky-700 text-white font-bold px-2.5 py-1 rounded shadow-sm">▶️ Làm</button>` : ''}
                                    ${t.status === 'in_progress' ? `
                                        <div class="flex items-center gap-1">
                                            <button onclick="updateServiceStatus(${t.id}, 'pending')" class="text-xs bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold px-1.5 py-1 rounded border" title="Quay lại chờ">◀️</button>
                                            <button onclick="updateServiceStatus(${t.id}, 'completed')" class="text-xs bg-emerald-600 hover:bg-emerald-700 text-white font-bold px-2.5 py-1 rounded shadow-sm">✅ Xong</button>
                                        </div>
                                    ` : ''}
                                    ${t.status === 'completed' ? `
                                        <div class="flex items-center gap-1">
                                            <button onclick="updateServiceStatus(${t.id}, 'in_progress')" class="text-xs bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold px-1.5 py-1 rounded border" title="Quay lại đang làm">◀️</button>
                                            <button onclick="updateServiceStatus(${t.id}, 'checked_out')" class="text-xs bg-purple-600 hover:bg-purple-700 text-white font-bold px-2.5 py-1 rounded shadow-sm">🏠 Trả Bé</button>
                                        </div>
                                    ` : ''}
                                    ${t.status === 'checked_out' ? `<button onclick="updateServiceStatus(${t.id}, 'completed')" class="text-[11px] bg-amber-100 hover:bg-amber-200 text-amber-900 border border-amber-300 font-bold px-2 py-1 rounded shadow-xs" title="Hoàn tác về Xong (chờ đón)">↩️ Mở lại</button>` : ''}
                                </div>
                            </div>
                        </div>
                    `;
                }).join('');
            });
        }

        async function updateServiceCallStatus(ticketId, callStatus) {
            try {
                await fetch(`/api/pet-services/${ticketId}/call-status`, {
                    method: 'PUT',
                    headers: {'Content-Type':'application/json'},
                    body: JSON.stringify({ call_status: callStatus })
                });
                await loadPetServicesList();
            } catch(e) { alert('Lỗi cập nhật trạng thái gọi điện'); }
        }

        async function updateServiceStatus(ticketId, newStatus) {
            try {
                const nowTime = new Date().toLocaleTimeString('vi-VN', {hour: '2-digit', minute:'2-digit'});
                await fetch(`/api/pet-services/${ticketId}/status`, {
                    method: 'PUT',
                    headers: {'Content-Type':'application/json'},
                    body: JSON.stringify({ status: newStatus, checkout_time: nowTime })
                });
                await loadPetServicesList();
                await loadPetServicesKPI();
            } catch(e) { alert('Lỗi cập nhật trạng thái'); }
        }

        async function deletePetService(ticketId) {
            if (!confirm('Xác nhận xóa phiếu dịch vụ?')) return;
            try {
                await fetch(`/api/pet-services/${ticketId}`, { method: 'DELETE' });
                await loadPetServicesList();
                await loadPetServicesKPI();
            } catch(e) { alert('Lỗi xóa phiếu'); }
        }

        // ==========================================
        // CẬP NHẬT TIẾN ĐỘ, PHỤ THU & TRẢ BÉ (MODAL CHỈNH SỬA)
        // ==========================================
        var currentProgressTicketBasePrice = 0;

        async function openServiceProgressModal(ticketId) {
            const modal = document.getElementById('modal-service-progress');
            if (!modal) return;

            const ticket = (allPetServiceTickets || []).find(t => t.id === ticketId);
            if (!ticket) { alert('Không tìm thấy thông tin phiếu'); return; }

            // Đảm bảo danh sách thợ được load
            try {
                if (!allSpaStaffList || allSpaStaffList.length === 0) {
                    const resStaff = await fetch('/api/pet-services/staff');
                    allSpaStaffList = await resStaff.json();
                }
            } catch(e){}

            // Đổ danh sách thợ
            const populateStaffSelect = (selId, selectedVal) => {
                const sel = document.getElementById(selId);
                if (!sel) return;
                sel.innerHTML = '<option value="">-- Chưa chọn --</option>' + 
                    (allSpaStaffList || []).map(s => {
                        const val = `${s.staff_code} ${s.name}`;
                        return `<option value="${val}" ${val === selectedVal ? 'selected' : ''}>${val}</option>`;
                    }).join('');
            };

            populateStaffSelect('prog-staff-receiver', ticket.staff_receiver || '');
            populateStaffSelect('prog-staff-worker1', ticket.staff_worker_1 || '');
            populateStaffSelect('prog-staff-worker2', ticket.staff_worker_2 || '');
            populateStaffSelect('prog-staff-cutter', ticket.staff_cutter || '');
            populateStaffSelect('prog-staff-dyer', ticket.staff_dyer || '');

            // Thông tin cơ bản
            document.getElementById('prog-ticket-id').value = ticket.id;
            document.getElementById('prog-ticket-badge').textContent = ticket.ticket_number ? `#${ticket.ticket_number}` : ticket.code;
            document.getElementById('prog-customer-pet-info').textContent = `Khách: ${ticket.customer_name || '-'} (${ticket.customer_phone || '-'}) | Bé: ${ticket.pet_name || '-'} (${ticket.pet_breed || '-'})`;

            // Phụ phí
            document.getElementById('prog-teeth-cleaning').value = ticket.teeth_cleaning || '0';
            document.getElementById('prog-art-cutting').value = ticket.art_cutting_fee || '0';
            document.getElementById('prog-surcharge').value = ticket.surcharge || '0';
            document.getElementById('prog-shipping-fee').value = ticket.shipping_fee || '0';
            document.getElementById('prog-tip-amount').value = ticket.tip_amount || '0';

            // Giá gốc dịch vụ = Tổng tiền hiện tại trừ đi các phụ phí hiện tại (Tiền tip là ghi chú riêng, không tính vào bill)
            const currentExtras = (ticket.teeth_cleaning || 0) + (ticket.art_cutting_fee || 0) + (ticket.surcharge || 0) + (ticket.shipping_fee || 0);
            currentProgressTicketBasePrice = Math.max(0, (ticket.price || 0) - currentExtras);

            document.getElementById('prog-final-price').value = ticket.price || 0;

            // Hình thức đưa đón
            if (document.getElementById('prog-arrival-method')) {
                document.getElementById('prog-arrival-method').value = ticket.arrival_method || 'Khách chở tới';
            }
            if (document.getElementById('prog-return-method')) {
                document.getElementById('prog-return-method').value = ticket.return_method || 'Khách đón';
            }

            const nowTime = new Date().toLocaleTimeString('vi-VN', {hour: '2-digit', minute:'2-digit'});
            document.getElementById('prog-checkout-time').value = ticket.checkout_time || nowTime;
            document.getElementById('prog-note').value = ticket.note || '';

            modal.classList.remove('hidden');
        }

        function closeServiceProgressModal() {
            const modal = document.getElementById('modal-service-progress');
            if (modal) modal.classList.add('hidden');
        }

        function calculateProgTotal() {
            const teeth = parseFloat(document.getElementById('prog-teeth-cleaning')?.value) || 0;
            const artCut = parseFloat(document.getElementById('prog-art-cutting')?.value) || 0;
            const surcharge = parseFloat(document.getElementById('prog-surcharge')?.value) || 0;
            const ship = parseFloat(document.getElementById('prog-shipping-fee')?.value) || 0;
            // Tiền tip là tiền khách cho riêng thợ, không cộng vào tổng tiền phải thu của tiệm
            const total = currentProgressTicketBasePrice + teeth + artCut + surcharge + ship;
            const finalEl = document.getElementById('prog-final-price');
            if (finalEl) finalEl.value = total;
        }

        async function saveServiceProgress() {
            const ticketId = document.getElementById('prog-ticket-id')?.value;
            if (!ticketId) return;

            const reqBody = {
                staff_receiver: document.getElementById('prog-staff-receiver')?.value || '',
                staff_worker_1: document.getElementById('prog-staff-worker1')?.value || '',
                staff_worker_2: document.getElementById('prog-staff-worker2')?.value || '',
                staff_cutter: document.getElementById('prog-staff-cutter')?.value || '',
                staff_dyer: document.getElementById('prog-staff-dyer')?.value || '',
                teeth_cleaning: parseFloat(document.getElementById('prog-teeth-cleaning')?.value) || 0,
                art_cutting_fee: parseFloat(document.getElementById('prog-art-cutting')?.value) || 0,
                surcharge: parseFloat(document.getElementById('prog-surcharge')?.value) || 0,
                shipping_fee: parseFloat(document.getElementById('prog-shipping-fee')?.value) || 0,
                tip_amount: parseFloat(document.getElementById('prog-tip-amount')?.value) || 0,
                arrival_method: document.getElementById('prog-arrival-method')?.value || '',
                return_method: document.getElementById('prog-return-method')?.value || '',
                checkout_time: document.getElementById('prog-checkout-time')?.value || '',
                note: document.getElementById('prog-note')?.value || '',
                price: parseFloat(document.getElementById('prog-final-price')?.value) || 0
            };

            try {
                const res = await fetch(`/api/pet-services/${ticketId}/progress`, {
                    method: 'PUT',
                    headers: {'Content-Type':'application/json'},
                    body: JSON.stringify(reqBody)
                });
                if (!res.ok) {
                    alert('Lỗi lưu cập nhật tiến độ');
                    return;
                }
                closeServiceProgressModal();
                await loadPetServicesList();
                await loadPetServicesKPI();
            } catch(e) { alert('Lỗi kết nối máy chủ'); }
        }

        // ==========================================
        // QUẢN LÝ BẢNG GIÁ DỊCH VỤ SPA THEO CÂN NẶNG
        // ==========================================
        var allPetPricingData = [];
        var currentSvcPetsList = [];

        async function loadPetPricingList() {
            const tbody = document.getElementById('table-pet-pricing');
            if (!tbody) return;
            try {
                tbody.innerHTML = '<tr><td colspan="7" class="p-6 text-center text-gray-400">Đang tải bảng giá dịch vụ...</td></tr>';
                const res = await fetch('/api/pet-services/pricing');
                allPetPricingData = await res.json();
                renderPetPricingTable();
            } catch(e) {
                console.error("loadPetPricingList error:", e);
                tbody.innerHTML = '<tr><td colspan="7" class="p-6 text-center text-rose-500">Lỗi tải bảng giá</td></tr>';
            }
        }

        function filterPetPricingCategory(val) {
            renderPetPricingTable();
        }

        function renderPetPricingTable() {
            const tbody = document.getElementById('table-pet-pricing');
            if (!tbody) return;
            const q = (document.getElementById('search-pet-pricing')?.value || '').trim().toLowerCase();
            const cat = (document.getElementById('pet-pricing-filter-cat') || document.getElementById('filter-pet-pricing-cat'))?.value || 'all';

            let filtered = (allPetPricingData || []).filter(item => {
                if (cat !== 'all' && item.category !== cat) return false;
                if (q && !(item.service_name || '').toLowerCase().includes(q)) return false;
                return true;
            });

            if (filtered.length === 0) {
                tbody.innerHTML = '<tr><td colspan="7" class="p-6 text-center text-gray-400">Chưa có mức giá dịch vụ nào</td></tr>';
                return;
            }

            tbody.innerHTML = filtered.map((item, idx) => `
                <tr class="border-b hover:bg-slate-50 transition text-xs">
                    <td class="p-2.5 text-center text-slate-500">${idx + 1}</td>
                    <td class="p-2.5 font-bold text-purple-900">${item.service_name}</td>
                    <td class="p-2.5">
                        <span class="px-2 py-0.5 rounded text-[10px] font-bold ${item.category === 'Gói Nhuộm' ? 'bg-pink-100 text-pink-700' : (item.category === 'Dịch Vụ Lẻ' ? 'bg-amber-100 text-amber-700' : 'bg-purple-100 text-purple-700')}">
                            ${item.category || 'Gói Spa'}
                        </span>
                    </td>
                    <td class="p-2.5 font-medium text-slate-700 text-center">
                        ${String(item.min_weight).replace('.', ',')} kg
                    </td>
                    <td class="p-2.5 font-medium text-slate-700 text-center">
                        ${item.max_weight >= 999 ? 'Trở lên' : String(item.max_weight).replace('.', ',') + ' kg'}
                    </td>
                    <td class="p-2.5 text-right font-mono font-bold text-emerald-700">${formatMoney(item.price || 0)}</td>
                    <td class="p-2.5 text-center space-x-1 whitespace-nowrap">
                        <button onclick="openEditPetPricingModal(${item.id})" class="text-sky-600 hover:text-sky-800 px-2 py-1 border rounded text-[11px] font-bold">✏️ Sửa</button>
                        <button onclick="deletePetPricingItem(${item.id})" class="text-rose-600 hover:text-rose-800 px-2 py-1 border rounded text-[11px] font-bold">🗑️</button>
                    </td>
                </tr>
            `).join('');
        }

        function openAddPetPricingModal() {
            document.getElementById('pet-pricing-modal-title').textContent = 'Thêm Mức Giá Dịch Vụ Theo Cân Nặng';
            document.getElementById('pet-pricing-edit-id').value = '';
            document.getElementById('pet-pricing-input-cat').value = 'Gói Spa';
            document.getElementById('pet-pricing-input-name').value = '';
            document.getElementById('pet-pricing-input-min').value = '0';
            document.getElementById('pet-pricing-input-max').value = '999';
            document.getElementById('pet-pricing-input-price').value = '';
            document.getElementById('modal-pet-pricing-form').classList.remove('hidden');
        }

        function openEditPetPricingModal(id) {
            const item = (allPetPricingData || []).find(x => x.id === id);
            if (!item) return;
            document.getElementById('pet-pricing-modal-title').textContent = 'Sửa Mức Giá Dịch Vụ';
            document.getElementById('pet-pricing-edit-id').value = item.id;
            document.getElementById('pet-pricing-input-cat').value = item.category || 'Gói Spa';
            document.getElementById('pet-pricing-input-name').value = item.service_name;
            document.getElementById('pet-pricing-input-min').value = item.min_weight;
            document.getElementById('pet-pricing-input-max').value = item.max_weight;
            document.getElementById('pet-pricing-input-price').value = item.price;
            document.getElementById('modal-pet-pricing-form').classList.remove('hidden');
        }

        function closePetPricingModal() {
            document.getElementById('modal-pet-pricing-form').classList.add('hidden');
        }

        async function savePetPricingItem() {
            const editId = document.getElementById('pet-pricing-edit-id').value;
            const category = document.getElementById('pet-pricing-input-cat').value;
            const serviceName = document.getElementById('pet-pricing-input-name').value.trim();
            const minWeight = parseFloat(document.getElementById('pet-pricing-input-min').value) || 0;
            const maxWeight = parseFloat(document.getElementById('pet-pricing-input-max').value) || 0;
            const price = parseFloat(document.getElementById('pet-pricing-input-price').value) || 0;

            if (!serviceName) { alert('Vui lòng nhập tên dịch vụ!'); return; }
            if (price <= 0) { alert('Vui lòng nhập giá dịch vụ!'); return; }

            try {
                if (editId) {
                    await fetch(`/api/pet-services/pricing/${editId}`, {
                        method: 'PUT',
                        headers: {'Content-Type':'application/json'},
                        body: JSON.stringify({ service_name: serviceName, category, min_weight: minWeight, max_weight: maxWeight, price })
                    });
                } else {
                    await fetch('/api/pet-services/pricing', {
                        method: 'POST',
                        headers: {'Content-Type':'application/json'},
                        body: JSON.stringify({ service_name: serviceName, category, min_weight: minWeight, max_weight: maxWeight, price })
                    });
                }
                closePetPricingModal();
                await loadPetPricingList();
            } catch(e) { alert('Lỗi lưu bảng giá'); }
        }

        async function deletePetPricingItem(id) {
            if (!confirm('Xác nhận xóa mức giá dịch vụ này?')) return;
            try {
                await fetch(`/api/pet-services/pricing/${id}`, { method: 'DELETE' });
                await loadPetPricingList();
            } catch(e) { alert('Lỗi xóa mức giá'); }
        }

        // ==========================================
        // QUẢN LÝ NHÂN VIÊN SPA (SPA STAFF)
        // ==========================================
        var allSpaStaffList = [];

        async function loadSpaStaffList() {
            const tbody = document.getElementById('table-spa-staff');
            if (!tbody) return;
            try {
                tbody.innerHTML = '<tr><td colspan="5" class="p-6 text-center text-gray-400">Đang tải danh sách thợ Spa...</td></tr>';
                const res = await fetch('/api/pet-services/staff');
                allSpaStaffList = await res.json();
                renderSpaStaffTable();
            } catch(e) {
                console.error("loadSpaStaffList err:", e);
                tbody.innerHTML = '<tr><td colspan="5" class="p-6 text-center text-rose-500 font-semibold">Lỗi tải danh sách nhân viên Spa</td></tr>';
            }
        }

        function renderSpaStaffTable() {
            const tbody = document.getElementById('table-spa-staff');
            if (!tbody) return;
            if (!Array.isArray(allSpaStaffList) || allSpaStaffList.length === 0) {
                tbody.innerHTML = '<tr><td colspan="5" class="p-6 text-center text-gray-400">Chưa có nhân viên Spa nào</td></tr>';
                return;
            }

            tbody.innerHTML = allSpaStaffList.map(s => `
                <tr class="border-b hover:bg-slate-50 transition text-xs">
                    <td class="p-3 text-center font-mono font-bold text-purple-700">#${s.staff_code || s.id}</td>
                    <td class="p-3 font-bold text-slate-800">${s.name}</td>
                    <td class="p-3 font-mono text-gray-600">${s.phone || '-'}</td>
                    <td class="p-3"><span class="bg-purple-100 text-purple-800 text-[11px] font-semibold px-2 py-0.5 rounded">${s.role || 'Thợ Spa'}</span></td>
                    <td class="p-3 text-center space-x-2">
                        <button onclick="editSpaStaff(${s.id})" class="text-blue-600 hover:text-blue-800 font-bold">✏️ Sửa</button>
                        <button onclick="deleteSpaStaff(${s.id})" class="text-rose-600 hover:text-rose-800 font-bold">🗑️ Xóa</button>
                    </td>
                </tr>
            `).join('');
        }

        function openSpaStaffModal(staff = null) {
            const modal = document.getElementById('modal-spa-staff-form');
            if (!modal) return;
            document.getElementById('spa-staff-id').value = staff ? staff.id : '';
            document.getElementById('spa-staff-code').value = staff ? (staff.staff_code || '') : '';
            document.getElementById('spa-staff-name').value = staff ? staff.name : '';
            document.getElementById('spa-staff-phone').value = staff ? (staff.phone || '') : '';
            document.getElementById('spa-staff-role').value = staff ? (staff.role || '') : 'Lễ tân, thợ tắm, cắt tỉa';
            document.getElementById('spa-staff-modal-title').textContent = staff ? '✏️ Chỉnh Sửa Nhân Viên Spa' : '➕ Thêm Nhân Viên Spa Mới';
            modal.classList.remove('hidden');
        }

        function closeSpaStaffModal() {
            const modal = document.getElementById('modal-spa-staff-form');
            if (modal) modal.classList.add('hidden');
        }

        function editSpaStaff(id) {
            const staff = (allSpaStaffList || []).find(s => s.id === id);
            if (staff) openSpaStaffModal(staff);
        }

        async function submitSpaStaffForm() {
            const id = document.getElementById('spa-staff-id').value;
            const staffCode = document.getElementById('spa-staff-code').value.trim();
            const name = document.getElementById('spa-staff-name').value.trim();
            const phone = document.getElementById('spa-staff-phone').value.trim();
            const role = document.getElementById('spa-staff-role').value.trim();

            if (!staffCode || !name) {
                alert('Vui lòng nhập Mã/Số và Tên nhân viên!');
                return;
            }

            try {
                if (id) {
                    await fetch(`/api/pet-services/staff/${id}`, {
                        method: 'PUT',
                        headers: {'Content-Type':'application/json'},
                        body: JSON.stringify({ staff_code: staffCode, name, phone, role })
                    });
                } else {
                    await fetch('/api/pet-services/staff', {
                        method: 'POST',
                        headers: {'Content-Type':'application/json'},
                        body: JSON.stringify({ staff_code: staffCode, name, phone, role })
                    });
                }
                closeSpaStaffModal();
                await loadSpaStaffList();
            } catch(e) { alert('Lỗi lưu thông tin nhân viên'); }
        }

        async function deleteSpaStaff(id) {
            if (!confirm('Xác nhận xóa nhân viên này khỏi Spa?')) return;
            try {
                await fetch(`/api/pet-services/staff/${id}`, { method: 'DELETE' });
                await loadSpaStaffList();
            } catch(e) { alert('Lỗi xóa nhân viên'); }
        }

        // ==========================================
        // TẠO PHIẾU TIẾP NHẬN DỊCH VỤ SPA THÔNG MINH
        // ==========================================
        async function openCreateServiceTicketModal() {
            const modal = document.getElementById('modal-create-service-ticket');
            if (!modal) return;

            // Đảm bảo có bảng giá
            if (!allPetPricingData || allPetPricingData.length === 0) {
                try {
                    const r = await fetch('/api/pet-services/pricing');
                    allPetPricingData = await r.json();
                } catch(e){}
            }

            // Đảm bảo có danh sách thợ
            try {
                const resStaff = await fetch('/api/pet-services/staff');
                allSpaStaffList = await resStaff.json();
            } catch(e){}

            // Đổ danh sách thợ vào 5 vai trò
            const populateStaffSelect = (selId) => {
                const sel = document.getElementById(selId);
                if (!sel) return;
                sel.innerHTML = '<option value="">-- Chưa chọn --</option>' + 
                    (allSpaStaffList || []).map(s => `<option value="${s.staff_code} ${s.name}">${s.staff_code} ${s.name}</option>`).join('');
            };
            populateStaffSelect('svc-staff-receiver');
            populateStaffSelect('svc-staff-worker1');
            populateStaffSelect('svc-staff-worker2');
            populateStaffSelect('svc-staff-cutter');
            populateStaffSelect('svc-staff-dyer');

            // Đổ danh sách khách hàng
            const custSel = document.getElementById('svc-customer-id');
            if (custSel) {
                const custs = (allContacts || []).filter(c => c.type === 'customer');
                custSel.innerHTML = '<option value="">-- Chọn hoặc tìm khách hàng --</option>' + custs.map(c => `<option value="${c.id}">${c.name} - ${c.phone||'Chưa có SĐT'}</option>`).join('');
            }

            // Reset form
            document.getElementById('svc-preview-phone').textContent = '-';
            document.getElementById('svc-preview-address').textContent = '-';
            document.getElementById('svc-pet-id').innerHTML = '<option value="">-- Chọn khách trước --</option>';
            document.getElementById('svc-pet-name').value = '';
            document.getElementById('svc-pet-breed').value = 'Poodle';
            document.getElementById('svc-pet-gender').value = 'Đực';
            document.getElementById('svc-pet-weight').value = '';
            document.getElementById('svc-pet-color').value = 'Trắng';
            document.querySelector('input[name="svc-shaving-feet"][value="Không cạo bàn"]').checked = true;
            document.getElementById('svc-weight-badge').textContent = '0 kg';
            document.getElementById('svc-primary-package').value = '';
            document.getElementById('svc-dye-package').value = '';
            document.getElementById('svc-total-price').value = '0';
            document.getElementById('svc-customer-request').value = '';
            document.getElementById('svc-accessories').value = '';
            document.getElementById('svc-appointment-time').value = '';
            document.getElementById('svc-note').value = '';
            document.querySelector('input[name="svc-payment-timing"][value="unpaid"]').checked = true;
            document.getElementById('svc-payment-method-wrap').classList.add('hidden');

            if (document.getElementById('svc-arrival-method')) document.getElementById('svc-arrival-method').value = 'Khách chở tới';

            modal.classList.remove('hidden');
        }

        function closeCreateServiceTicketModal() {
            const modal = document.getElementById('modal-create-service-ticket');
            if (modal) modal.classList.add('hidden');
        }

        async function onSvcCustomerChanged(custId) {
            const petSel = document.getElementById('svc-pet-id');
            const previewPhone = document.getElementById('svc-preview-phone');
            const previewAddr = document.getElementById('svc-preview-address');

            if (!custId) {
                if (petSel) petSel.innerHTML = '<option value="">-- Chọn khách trước --</option>';
                if (previewPhone) previewPhone.textContent = '-';
                if (previewAddr) previewAddr.textContent = '-';
                currentSvcPetsList = [];
                return;
            }

            const cust = (allContacts || []).find(c => c.id == custId);
            if (cust) {
                if (previewPhone) previewPhone.textContent = cust.phone || 'Chưa có';
                if (previewAddr) previewAddr.textContent = cust.address || 'Chưa có';
            }

            try {
                const res = await fetch(`/api/contacts/${custId}/pets`);
                currentSvcPetsList = await res.json();
                if (Array.isArray(currentSvcPetsList) && currentSvcPetsList.length > 0) {
                    petSel.innerHTML = '<option value="">-- Chọn bé cũ của khách --</option>' +
                        currentSvcPetsList.map(p => `<option value="${p.id}">🐾 ${p.name} (${p.breed || p.species || 'Cún'} - ${p.weight ? String(p.weight).replace('.',',') + 'kg' : 'Chưa cân'})</option>`).join('') +
                        '<option value="__new__">➕ Nhập bé mới cho khách này</option>';
                } else {
                    petSel.innerHTML = '<option value="__new__">➕ Nhập bé mới (Khách chưa có hồ sơ thú cưng)</option>';
                }
            } catch(e) {
                petSel.innerHTML = '<option value="">-- Lỗi tải thú cưng --</option>';
                currentSvcPetsList = [];
            }
        }

        function onSvcPetChanged(petId) {
            if (!petId || petId === '__new__') {
                document.getElementById('svc-pet-name').value = '';
                document.getElementById('svc-pet-weight').value = '';
                document.getElementById('svc-weight-badge').textContent = '0 kg';
                autoCalculateServicePrice();
                return;
            }

            const p = (currentSvcPetsList || []).find(x => x.id == petId);
            if (!p) return;

            document.getElementById('svc-pet-name').value = p.name || '';
            if (p.breed) {
                const breedSel = document.getElementById('svc-pet-breed');
                const opt = Array.from(breedSel.options).find(o => o.value.toLowerCase() === p.breed.toLowerCase());
                if (opt) breedSel.value = opt.value;
            }
            if (p.gender) document.getElementById('svc-pet-gender').value = p.gender;
            if (p.color) {
                const colorSel = document.getElementById('svc-pet-color');
                const opt = Array.from(colorSel.options).find(o => o.value.toLowerCase() === p.color.toLowerCase());
                if (opt) colorSel.value = opt.value;
            }
            if (p.weight) {
                const wStr = String(p.weight).replace('.', ',');
                document.getElementById('svc-pet-weight').value = wStr;
                document.getElementById('svc-weight-badge').textContent = wStr + ' kg';
            }
            autoCalculateServicePrice();
        }

        function openAddQuickPetForCurrentCustomer() {
            const petSel = document.getElementById('svc-pet-id');
            if (petSel) petSel.value = '__new__';
            document.getElementById('svc-pet-name').value = '';
            document.getElementById('svc-pet-weight').value = '';
            document.getElementById('svc-weight-badge').textContent = '0 kg';
            document.getElementById('svc-pet-name').focus();
            autoCalculateServicePrice();
        }

        function onSvcWeightInputChanged(val) {
            const badge = document.getElementById('svc-weight-badge');
            if (!val || !val.trim()) {
                if (badge) badge.textContent = '0 kg';
            } else {
                if (badge) badge.textContent = val.trim().replace('.', ',') + ' kg';
            }
            autoCalculateServicePrice();
        }

        function parseWeightFloat(val) {
            if (!val) return 0;
            const cleaned = String(val).trim().replace(',', '.');
            const num = parseFloat(cleaned);
            return isNaN(num) ? 0 : num;
        }

        function autoCalculateServicePrice() {
            const weight = parseWeightFloat(document.getElementById('svc-pet-weight')?.value);
            const primaryPkg = document.getElementById('svc-primary-package')?.value || '';
            const dyePkg = document.getElementById('svc-dye-package')?.value || '';

            let total = 0;

            // Tìm giá gói chính theo cân nặng
            if (primaryPkg && Array.isArray(allPetPricingData)) {
                const match = allPetPricingData.find(item => 
                    item.service_name.trim().toLowerCase() === primaryPkg.trim().toLowerCase() &&
                    weight >= item.min_weight && weight <= item.max_weight
                );
                if (match) {
                    total += (match.price || 0);
                }
            }

            // Tìm giá gói nhuộm theo cân nặng
            if (dyePkg && Array.isArray(allPetPricingData)) {
                // Tên chuẩn trong pricing là 'Nhuộm: 2 Tai',... hoặc 'Nhuộm 2 Tai'
                const dyeClean = dyePkg.replace('Nhuộm: ', '').trim().toLowerCase();
                const matchDye = allPetPricingData.find(item => {
                    const name = item.service_name.replace('Nhuộm: ', '').replace('Nhuộm ', '').trim().toLowerCase();
                    return name === dyeClean && weight >= item.min_weight && weight <= item.max_weight;
                });
                if (matchDye) {
                    total += (matchDye.price || 0);
                }
            }

            const totalEl = document.getElementById('svc-total-price');
            if (totalEl) totalEl.value = total;
        }

        function onSvcPaymentTimingChanged(val) {
            const wrap = document.getElementById('svc-payment-method-wrap');
            if (wrap) {
                wrap.classList.toggle('hidden', val !== 'paid');
            }
        }

        async function submitCreateServiceTicket(andPrint = false) {
            const custId = parseInt(document.getElementById('svc-customer-id')?.value) || 0;
            const petIdVal = document.getElementById('svc-pet-id')?.value;
            const petId = (petIdVal && petIdVal !== '__new__') ? parseInt(petIdVal) : null;
            const petName = document.getElementById('svc-pet-name')?.value.trim();
            const breed = document.getElementById('svc-pet-breed')?.value;
            const gender = document.getElementById('svc-pet-gender')?.value;
            const weight = parseWeightFloat(document.getElementById('svc-pet-weight')?.value);
            const color = document.getElementById('svc-pet-color')?.value;
            const shavingFeet = document.querySelector('input[name="svc-shaving-feet"]:checked')?.value || 'Không cạo bàn';

            const primaryPkg = document.getElementById('svc-primary-package')?.value || '';
            const dyePkg = document.getElementById('svc-dye-package')?.value || '';
            let serviceTypes = [];
            if (primaryPkg) serviceTypes.push(primaryPkg);
            if (dyePkg) serviceTypes.push(dyePkg);
            const serviceType = serviceTypes.join(' + ') || 'Dịch vụ Spa';

            const totalPrice = parseFloat(document.getElementById('svc-total-price')?.value) || 0;
            const customerRequest = document.getElementById('svc-customer-request')?.value.trim() || '';
            const accessories = document.getElementById('svc-accessories')?.value.trim() || '';
            const appointmentTime = document.getElementById('svc-appointment-time')?.value || '';
            const note = document.getElementById('svc-note')?.value.trim() || '';

            const paymentStatus = document.querySelector('input[name="svc-payment-timing"]:checked')?.value || 'unpaid';
            const paymentMethod = paymentStatus === 'paid' ? (document.getElementById('svc-payment-method')?.value || 'cash') : null;

            // Hình thức đến (chọn khi tiếp nhận)
            const arrivalMethod = document.getElementById('svc-arrival-method')?.value || 'Khách chở tới';

            if (!custId) { alert('Vui lòng chọn hoặc thêm khách hàng!'); return; }
            if (!petName) { alert('Vui lòng nhập tên của bé!'); return; }
            if (weight <= 0) { alert('Vui lòng nhập cân nặng của bé (VD: 3.5 hoặc 3,5)!'); return; }

            const reqBody = {
                customer_id: custId,
                pet_id: petId,
                pet_name: petName,
                pet_breed: breed,
                pet_gender: gender,
                pet_color: color,
                weight_at_service: weight,
                shaving_feet: shavingFeet,
                customer_request: customerRequest,
                accessories: accessories,
                service_type: serviceType,
                price: totalPrice,
                appointment_time: appointmentTime,
                note: note,
                payment_status: paymentStatus,
                payment_method: paymentMethod,
                staff_receiver: '',
                staff_worker_1: '',
                staff_worker_2: '',
                staff_cutter: '',
                staff_dyer: '',
                teeth_cleaning: 0,
                art_cutting_fee: 0,
                surcharge: 0,
                shipping_fee: 0,
                tip_amount: 0,
                arrival_method: arrivalMethod,
                return_method: '',
                dye_package: dyePkg
            };

            try {
                const res = await fetch('/api/pet-services', {
                    method: 'POST',
                    headers: {'Content-Type':'application/json'},
                    body: JSON.stringify(reqBody)
                });
                if (!res.ok) {
                    const err = await res.json();
                    alert('Lỗi tạo phiếu: ' + (err.detail || ''));
                    return;
                }
                const result = await res.json();
                closeCreateServiceTicketModal();
                await loadPetServicesList();
                await loadPetServicesKPI();

                if (andPrint && result.id) {
                    printPetServiceTicketDirectly(result.id);
                } else {
                    alert(`✅ Đã lập thành công Phiếu Tiếp Nhận Spa #${result.ticket_number || ''} (${result.code})!`);
                }
            } catch(e) {
                console.error("submitCreateServiceTicket err:", e);
                alert('Lỗi kết nối máy chủ');
            }
        }

        // ==========================================
        // IN PHIẾU SPA K80 (TIẾP NHẬN & THANH TOÁN)
        // ==========================================
        async function printPetServiceTicketDirectly(ticketId, type = 'intake') {
            const ticket = (allPetServiceTickets || []).find(t => t.id === ticketId);
            if (!ticket) { alert('Không tìm thấy thông tin phiếu'); return; }

            const now = new Date();
            const dateStr = now.toLocaleDateString('vi-VN') + ' ' + now.toLocaleTimeString('vi-VN', {hour: '2-digit', minute:'2-digit'});
            const weightDisplay = ticket.weight_at_service ? String(ticket.weight_at_service).replace('.', ',') + ' kg' : '-';

            let printHtml = '';

            if (type === 'invoice') {
                // PHIẾU THANH TOÁN / TRẢ BÉ (K80)
                const extraTeeth = ticket.teeth_cleaning || 0;
                const extraArt = ticket.art_cutting_fee || 0;
                const extraSurch = ticket.surcharge || 0;
                const extraShip = ticket.shipping_fee || 0;
                // Tiền tip không in ra hóa đơn, không tính vào tổng phải thu
                const totalExtras = extraTeeth + extraArt + extraSurch + extraShip;
                const basePrice = Math.max(0, (ticket.price || 0) - totalExtras);

                let extraRows = '';
                if (extraTeeth > 0) extraRows += `<tr><td style="padding: 3px 0;">Đánh răng:</td><td style="padding: 3px 0; text-align: right; font-family: monospace;">${formatMoney(extraTeeth)}</td></tr>`;
                if (extraArt > 0) extraRows += `<tr><td style="padding: 3px 0;">PT Cắt nghệ thuật:</td><td style="padding: 3px 0; text-align: right; font-family: monospace;">${formatMoney(extraArt)}</td></tr>`;
                if (extraSurch > 0) extraRows += `<tr><td style="padding: 3px 0;">Phụ thu khác:</td><td style="padding: 3px 0; text-align: right; font-family: monospace;">${formatMoney(extraSurch)}</td></tr>`;
                if (extraShip > 0) extraRows += `<tr><td style="padding: 3px 0;">Cước giao bé về:</td><td style="padding: 3px 0; text-align: right; font-family: monospace;">${formatMoney(extraShip)}</td></tr>`;

                printHtml = `
                    <div style="width: 290px; margin: 0 auto; font-family: 'Segoe UI', Tahoma, Arial, sans-serif; font-size: 12px; line-height: 1.4; color: #000; padding: 10px;">
                        <div style="text-align: center; border-bottom: 2px dashed #000; padding-bottom: 8px; margin-bottom: 8px;">
                            <h2 style="margin: 0; font-size: 16px; font-weight: 900; text-transform: uppercase;">🐾 PET SPA & GROOMING</h2>
                            <div style="font-size: 13px; font-weight: bold; margin-top: 4px;">HÓA ĐƠN THANH TOÁN SPA</div>
                            <div style="display: inline-block; background: #000; color: #fff; font-size: 15px; font-weight: 900; padding: 2px 10px; border-radius: 4px; margin-top: 5px;">
                                SỐ PHIẾU: #${ticket.ticket_number || ticket.id}
                            </div>
                            <div style="font-size: 11px; margin-top: 3px; font-family: monospace;">Mã: ${ticket.code}</div>
                            <div style="font-size: 10px; color: #444;">Ngày in: ${dateStr}</div>
                        </div>

                        <div style="border-bottom: 1px dashed #000; padding-bottom: 6px; margin-bottom: 6px;">
                            <div><strong>Khách hàng:</strong> ${ticket.customer_name || 'Khách lẻ'}</div>
                            <div><strong>Điện thoại:</strong> ${ticket.customer_phone || '-'}</div>
                        </div>

                        <div style="border-bottom: 1px dashed #000; padding-bottom: 6px; margin-bottom: 6px; background: #f8f8f8; padding: 6px; border-radius: 4px;">
                            <div style="font-size: 13px; font-weight: bold; color: #b91c1c;">🐕 BÉ: ${ticket.pet_name || 'Bé cưng'}</div>
                            <div><strong>Giống loài:</strong> ${ticket.pet_breed || ticket.pet_species || 'Chó cảnh'} | <strong>Màu:</strong> ${ticket.pet_color || '-'}</div>
                            <div><strong>Cân nặng:</strong> <span style="font-weight: bold; color: #000;">${weightDisplay}</span></div>
                            <div style="font-size: 11px; color: #555; margin-top: 2px;">
                                Giờ nhận: <strong>${ticket.received_time || '-'}</strong> ➔ Giờ về: <strong>${ticket.checkout_time || new Date().toLocaleTimeString('vi-VN', {hour: '2-digit', minute:'2-digit'})}</strong>
                            </div>
                        </div>

                        <div style="border-bottom: 1px dashed #000; padding-bottom: 6px; margin-bottom: 6px;">
                            <div style="font-weight: bold; text-transform: uppercase; font-size: 11px; margin-bottom: 4px;">BẢNG KÊ CHI PHÍ & DỊCH VỤ:</div>
                            <table style="width: 100%; font-size: 12px; border-collapse: collapse;">
                                <tr>
                                    <td style="padding: 3px 0;"><strong>${ticket.service_type}</strong></td>
                                    <td style="padding: 3px 0; text-align: right; font-family: monospace; font-weight: bold;">${formatMoney(basePrice)}</td>
                                </tr>
                                ${extraRows}
                            </table>
                        </div>

                        <div style="border-bottom: 2px dashed #000; padding-bottom: 6px; margin-bottom: 6px;">
                            <div style="display: flex; justify-content: space-between; font-size: 15px; font-weight: 900; margin-top: 4px;">
                                <span>TỔNG CỘNG:</span>
                                <span style="font-family: monospace;">${formatMoney(ticket.price || 0)}</span>
                            </div>
                            <div style="display: flex; justify-content: space-between; font-size: 11px; font-weight: bold; margin-top: 3px;">
                                <span>Trạng thái TT:</span>
                                <span style="color: ${ticket.payment_status === 'paid' ? '#047857' : '#b45309'};">
                                    ${ticket.payment_status === 'paid' ? 'ĐÃ THANH TOÁN' : 'CHƯA THANH TOÁN'}
                                </span>
                            </div>
                        </div>

                        ${(ticket.staff_cutter || ticket.staff_worker_1) ? `
                            <div style="font-size: 11px; color: #444; margin-bottom: 6px;">
                                <div>Thợ cắt: <strong>${ticket.staff_cutter || '-'}</strong> | Thợ tắm: <strong>${ticket.staff_worker_1 || '-'}</strong></div>
                            </div>
                        ` : ''}

                        <div style="text-align: center; font-size: 10px; color: #555; margin-top: 8px;">
                            <div>Cảm ơn Quý khách đã tin tưởng & chăm sóc bé tại Mastercare!</div>
                            <div style="font-weight: bold; margin-top: 2px;">Chúc bé luôn khỏe mạnh & hẹn gặp lại! ❤️</div>
                        </div>
                    </div>
                `;
            } else {
                // PHIẾU TIẾP NHẬN DỊCH VỤ (K80) - CÓ 2 Ô CHỮ KÝ
                printHtml = `
                    <div style="width: 290px; margin: 0 auto; font-family: 'Segoe UI', Tahoma, Arial, sans-serif; font-size: 12px; line-height: 1.4; color: #000; padding: 10px;">
                        <div style="text-align: center; border-bottom: 2px dashed #000; padding-bottom: 8px; margin-bottom: 8px;">
                            <h2 style="margin: 0; font-size: 16px; font-weight: 900; text-transform: uppercase;">🐾 PET SPA & GROOMING</h2>
                            <div style="font-size: 13px; font-weight: bold; margin-top: 4px;">PHIẾU TIẾP NHẬN DỊCH VỤ</div>
                            <div style="display: inline-block; background: #000; color: #fff; font-size: 15px; font-weight: 900; padding: 2px 10px; border-radius: 4px; margin-top: 5px;">
                                SỐ PHIẾU: #${ticket.ticket_number || ticket.id}
                            </div>
                            <div style="font-size: 11px; margin-top: 3px; font-family: monospace;">Mã: ${ticket.code}</div>
                            <div style="font-size: 10px; color: #444;">Ngày lập: ${dateStr}</div>
                        </div>

                        <div style="border-bottom: 1px dashed #000; padding-bottom: 6px; margin-bottom: 6px;">
                            <div><strong>Khách hàng:</strong> ${ticket.customer_name || 'Khách lẻ'}</div>
                            <div><strong>Điện thoại:</strong> ${ticket.customer_phone || '-'}</div>
                        </div>

                        <div style="border-bottom: 1px dashed #000; padding-bottom: 6px; margin-bottom: 6px; background: #f8f8f8; padding: 6px; border-radius: 4px;">
                            <div style="font-size: 13px; font-weight: bold; color: #b91c1c;">🐕 BÉ: ${ticket.pet_name || 'Bé cưng'}</div>
                            <div><strong>Giống loài:</strong> ${ticket.pet_breed || ticket.pet_species || 'Chó cảnh'}</div>
                            <div><strong>Giới tính:</strong> ${ticket.pet_gender || 'Đực'} | <strong>Màu:</strong> ${ticket.pet_color || 'Bò sữa'}</div>
                            <div><strong>Cân nặng:</strong> <span style="font-size: 13px; font-weight: bold; color: #000;">${weightDisplay}</span></div>
                            <div style="margin-top: 3px; padding-top: 3px; border-top: 1px dotted #ccc;">
                                <strong>Cạo bàn:</strong> <span style="font-weight: bold; text-decoration: underline;">${ticket.shaving_feet || 'Không cạo bàn'}</span>
                            </div>
                        </div>

                        <div style="border-bottom: 1px dashed #000; padding-bottom: 6px; margin-bottom: 6px;">
                            <div style="font-weight: bold; text-transform: uppercase; font-size: 11px; margin-bottom: 3px;">Dịch Vụ Sử Dụng:</div>
                            <div style="font-weight: bold; font-size: 13px;">${ticket.service_type}</div>
                            ${ticket.customer_request ? `<div style="font-size: 11px; margin-top: 2px;">✂️ <em>Y/c: ${ticket.customer_request}</em></div>` : ''}
                            ${ticket.accessories ? `<div style="font-size: 11px; margin-top: 2px;">🎒 <em>PK kèm: ${ticket.accessories}</em></div>` : ''}
                            ${ticket.note ? `<div style="font-size: 11px; margin-top: 2px;">📝 <em>Lưu ý: ${ticket.note}</em></div>` : ''}
                            <div style="font-size: 11px; margin-top: 3px; color: #555;">
                                Giờ nhận: <strong>${ticket.received_time || '-'}</strong> (${ticket.arrival_method || 'Tự đến'})
                            </div>
                        </div>

                        <div style="border-bottom: 1px dashed #000; padding-bottom: 6px; margin-bottom: 6px;">
                            <div style="display: flex; justify-content: space-between; font-size: 13px; font-weight: 900;">
                                <span>TỔNG TẠM TÍNH:</span>
                                <span style="font-family: monospace;">${formatMoney(ticket.price || 0)}</span>
                            </div>
                            <div style="display: flex; justify-content: space-between; font-size: 11px; font-weight: bold; margin-top: 3px;">
                                <span>Trạng thái thanh toán:</span>
                                <span style="color: ${ticket.payment_status === 'paid' ? '#047857' : '#b45309'};">
                                    ${ticket.payment_status === 'paid' ? 'ĐÃ THANH TOÁN TRƯỚC' : 'THANH TOÁN KHI NHẬN BÉ'}
                                </span>
                            </div>
                        </div>

                        <!-- 2 Ô CHỮ KÝ XÁC NHẬN -->
                        <div style="display: flex; justify-content: space-between; margin-top: 10px; margin-bottom: 25px; text-align: center; font-size: 11px;">
                            <div style="width: 48%;">
                                <strong>NV Tiếp Nhận</strong><br>
                                <span style="font-size: 9px; color: #666;">(Ký & họ tên)</span>
                                <div style="height: 40px;"></div>
                                <div>${ticket.staff_receiver || '...................'}</div>
                            </div>
                            <div style="width: 48%;">
                                <strong>Khách Gửi Bé</strong><br>
                                <span style="font-size: 9px; color: #666;">(Ký xác nhận)</span>
                                <div style="height: 40px;"></div>
                                <div>${ticket.customer_name || '...................'}</div>
                            </div>
                        </div>

                        <div style="text-align: center; font-size: 10px; color: #555; margin-top: 8px; border-top: 1px dotted #ccc; padding-top: 6px;">
                            <div>Quý khách vui lòng kiểm tra phụ kiện & giữ phiếu đối chiếu khi đón bé!</div>
                            <div style="font-weight: bold; margin-top: 2px;">Xin cảm ơn Quý khách! ❤️</div>
                        </div>
                    </div>
                `;
            }

            let iframe = document.getElementById('print-service-iframe');
            if (!iframe) {
                iframe = document.createElement('iframe');
                iframe.id = 'print-service-iframe';
                iframe.style.position = 'fixed';
                iframe.style.right = '0';
                iframe.style.bottom = '0';
                iframe.style.width = '350px';
                iframe.style.height = '600px';
                iframe.style.border = '0';
                iframe.style.zIndex = '-9999';
                iframe.style.opacity = '0.01';
                iframe.style.pointerEvents = 'none';
                document.body.appendChild(iframe);
            }

            const doc = iframe.contentWindow.document;
            doc.open();
            doc.write(`
                <!DOCTYPE html>
                <html>
                <head>
                    <meta charset="utf-8">
                    <title>${type === 'invoice' ? 'In Hóa Đơn Thanh Toán Spa' : 'In Phiếu Tiếp Nhận Spa'}</title>
                    <style>
                        @page { size: auto; margin: 0mm; }
                        body { margin: 0; padding: 0; background: #fff; }
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
                    console.error('Lỗi in phiếu:', e);
                }
            }, 350);
        }

        function closeContactDetailModal() {
            document.getElementById('modal-contact-detail').classList.add('hidden');
        }


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

        // ==================== PHẦN 1: NHẬP HÀNG (PO / PURCHASES) ====================
        function escapeHtml(str) {
            if (!str) return '';
            return String(str)
                .replace(/&/g, '&amp;')
                .replace(/</g, '&lt;')
                .replace(/>/g, '&gt;')
                .replace(/"/g, '&quot;')
                .replace(/'/g, '&#39;');
        }

        let currentViewingPurchase = null;

        let currentSupplierItems = []; // Danh sách mặt hàng của NCC đang chọn
        let allSuppliersList = []; // Cache danh sách NCC riêng cho nhập hàng

        async function selectSupplier(id, name, phone) {
            const suppInput = document.getElementById('purchase-supplier');
            const searchInput = document.getElementById('purchase-supplier-search');
            const resBox = document.getElementById('supplier-search-results');
            if (suppInput) suppInput.value = id;
            if (searchInput) searchInput.value = `${name} (${phone || 'Không SĐT'})`;
            if (resBox) resBox.classList.add('hidden');

            // Nạp danh sách mặt hàng của riêng NCC này
            try {
                const res = await fetch(`/api/suppliers/${id}/items`);
                currentSupplierItems = await res.json();
                console.log(`Loaded ${currentSupplierItems.length} items for supplier ${name}`);
            } catch (e) {
                console.error("selectSupplier items error:", e);
                currentSupplierItems = [];
            }
        }

        async function filterSupplierSearch(val) {
            const resBox = document.getElementById('supplier-search-results');
            if (!resBox) return;

            // Nếu chưa có danh sách thì fetch ngay
            if (!allSuppliersList || allSuppliersList.length === 0) {
                try {
                    const res = await fetch('/api/contacts?type=supplier');
                    allSuppliersList = await res.json();
                } catch (e) {
                    console.error("fetch suppliers error:", e);
                }
            }

            const supps = (allSuppliersList && allSuppliersList.length > 0)
                ? allSuppliersList
                : (allContacts || []).filter(c => c.type === 'supplier');

            const q = (val || '').trim();
            // Nếu rỗng hoặc đang chứa tên đã chọn thì hiển thị toàn bộ danh sách để người dùng chọn lại
            const isSelectedText = q.includes('(') && q.includes(')');
            const matches = (q === '' || isSelectedText)
                ? supps 
                : supps.filter(s => {
                    const text = `${s.name} ${s.phone || ''} ${s.address || ''}`;
                    return fuzzyMatch(q, text);
                });

            if (matches.length === 0) {
                resBox.innerHTML = '<div class="p-3 text-gray-400 text-center italic">Không tìm thấy nhà cung cấp nào</div>';
                resBox.classList.remove('hidden');
                return;
            }

            resBox.innerHTML = matches.map(s => `
                <div onmousedown="selectSupplier(${s.id}, '${escapeHtml(s.name)}', '${escapeHtml(s.phone || '')}')" 
                     class="p-2.5 hover:bg-sky-50 cursor-pointer flex justify-between items-center transition border-b last:border-0">
                    <div>
                        <span class="font-bold text-slate-800 text-xs">🏭 ${s.name}</span>
                        <span class="text-[11px] text-gray-500 ml-1.5">${s.phone ? '📞 ' + s.phone : ''}</span>
                    </div>
                    <span class="text-xs font-bold ${s.debt > 0 ? 'text-rose-600' : 'text-slate-400'}">
                        ${s.debt > 0 ? 'Nợ: ' + formatMoney(s.debt) + ' đ' : '0 đ'}
                    </span>
                </div>
            `).join('');
            resBox.classList.remove('hidden');
        }

        async function initPurchases() {
            try {
                const [whRes, suppRes, ingRes, prodRes] = await Promise.all([
                    fetch('/api/warehouses'),
                    fetch('/api/contacts?type=supplier'),
                    fetch('/api/ingredients'),
                    fetch('/api/products')
                ]);

                allWarehousesList = await whRes.json();
                allSuppliersList = await suppRes.json();
                costIngredients = await ingRes.json();
                allProducts = await prodRes.json();

                const whSel = document.getElementById('purchase-warehouse');
                if (whSel) {
                    whSel.innerHTML = allWarehousesList.map(w => `<option value="${w.id}">${w.name}</option>`).join('');
                }

                const expInput = document.getElementById('purchase-expected-date');
                if (expInput && !expInput.value) {
                    const today = new Date().toISOString().split('T')[0];
                    expInput.value = today;
                }

        // Close search dropdowns on outside click
        document.addEventListener('pointerdown', (e) => {
            if (!e.target.closest('#purchase-supplier-search') && !e.target.closest('#supplier-search-results')) {
                const sb = document.getElementById('supplier-search-results');
                if (sb) sb.classList.add('hidden');
            }
            if (!e.target.closest('#search-purchase-input') && !e.target.closest('#purchase-search-results')) {
                const pb = document.getElementById('purchase-search-results');
                if (pb) pb.classList.add('hidden');
            }
        });

                renderPurchaseItems();
            } catch (e) {
                console.error('initPurchases err:', e);
            }
        }

        function filterPurchaseSearch(val) {
            const resBox = document.getElementById('purchase-search-results');
            if (!resBox) return;

            const suppId = document.getElementById('purchase-supplier')?.value;
            if (!suppId) {
                resBox.innerHTML = '<div class="p-3 text-amber-600 bg-amber-50 text-center font-medium">⚠️ Vui lòng chọn Nhà Cung Cấp trước khi chọn mặt hàng</div>';
                resBox.classList.remove('hidden');
                return;
            }

            const matches = [];

            // Nếu nhà cung cấp đã có danh mục hàng hóa / nguyên liệu riêng
            if (currentSupplierItems && currentSupplierItems.length > 0) {
                currentSupplierItems.forEach(item => {
                    const searchText = `${item.name} ${item.code || ''} ${item.unit || ''}`;
                    if (fuzzyMatch(val, searchText)) {
                        matches.push({
                            type: item.item_type,
                            id: item.id,
                            name: item.name,
                            code: item.code || '',
                            unit: item.unit || 'cái',
                            cost: item.cost_price || 0,
                            stock: 0
                        });
                    }
                });
            } else {
                // Fallback nếu NCC chưa có danh mục ràng buộc
                (costIngredients || []).filter(i => i.type !== 'SERVICE').forEach(ing => {
                    const searchText = `${ing.name} ${ing.code || ''} ${ing.unit || ''} nl nguyen lieu`;
                    if (fuzzyMatch(val, searchText)) {
                        matches.push({
                            type: 'ingredient',
                            id: ing.id,
                            name: ing.name,
                            code: ing.code || '',
                            unit: ing.unit || 'đv',
                            cost: ing.latest_cost || 0,
                            stock: ing.total_stock || 0
                        });
                    }
                });
                (allProducts || []).filter(p => p.type !== 'service').forEach(prod => {
                    const searchText = `${prod.name} ${prod.code || ''} ${prod.unit || ''} sp san pham`;
                    if (fuzzyMatch(val, searchText)) {
                        matches.push({
                            type: 'product',
                            id: prod.id,
                            name: prod.name,
                            code: prod.code || '',
                            unit: prod.unit || 'cái',
                            cost: prod.cost_price || 0,
                            stock: prod.stock || 0
                        });
                    }
                });
            }

            if (matches.length === 0) {
                resBox.innerHTML = '<div class="p-3 text-gray-400 text-center italic">Không tìm thấy mặt hàng phù hợp</div>';
                resBox.classList.remove('hidden');
                return;
            }

            resBox.innerHTML = matches.slice(0, 20).map(m => {
                const badge = m.type === 'ingredient' 
                    ? '<span class="bg-purple-100 text-purple-700 px-1.5 py-0.5 rounded text-[10px] font-bold">Nguyên Liệu</span>'
                    : '<span class="bg-blue-100 text-blue-700 px-1.5 py-0.5 rounded text-[10px] font-bold">Hàng Hóa</span>';

                return `
                <div onclick="addPurchaseItemFromFuzzy('${m.type}', ${m.id})" class="p-2.5 hover:bg-sky-50 cursor-pointer flex justify-between items-center transition-colors">
                    <div class="flex items-center gap-2">
                        ${badge}
                        <div>
                            <div class="font-bold text-slate-800">${m.name}</div>
                            <div class="text-[11px] text-gray-500 font-mono">Mã: ${m.code || '---'} | ĐVT: ${m.unit}</div>
                        </div>
                    </div>
                    <div class="text-right">
                        <div class="font-bold text-slate-900 font-mono">${formatMoney(m.cost)}</div>
                        <div class="text-[11px] text-gray-500">Tồn hiện tại: <span class="font-bold text-sky-700">${m.stock}</span></div>
                    </div>
                </div>
                `;
            }).join('');

            resBox.classList.remove('hidden');
        }

        function addPurchaseItemFromFuzzy(type, targetId) {
            const resBox = document.getElementById('purchase-search-results');
            if (resBox) resBox.classList.add('hidden');
            const searchInput = document.getElementById('search-purchase-input');
            if (searchInput) searchInput.value = '';

            if (type === 'ingredient') {
                const ing = costIngredients.find(i => i.id === targetId);
                if (ing) {
                    const existing = purchaseCart.find(x => x.item_type === 'ingredient' && x.ingredient_id === targetId);
                    if (existing) {
                        existing.quantity += 1;
                    } else {
                        purchaseCart.push({
                            item_type: 'ingredient',
                            ingredient_id: ing.id,
                            product_id: null,
                            name: ing.name,
                            unit: ing.unit || 'đv',
                            quantity: 1,
                            cost_price: ing.latest_cost || 0
                        });
                    }
                }
            } else if (type === 'product') {
                const prod = allProducts.find(p => p.id === targetId);
                if (prod) {
                    const existing = purchaseCart.find(x => x.item_type === 'product' && x.product_id === targetId);
                    if (existing) {
                        existing.quantity += 1;
                    } else {
                        purchaseCart.push({
                            item_type: 'product',
                            ingredient_id: null,
                            product_id: prod.id,
                            name: prod.name,
                            unit: prod.unit || 'cái',
                            quantity: 1,
                            cost_price: prod.cost_price || 0
                        });
                    }
                }
            }

            renderPurchaseItems();
        }

        // Đóng dropdown kết quả tìm kiếm khi click ra ngoài
        document.addEventListener('click', function(e) {
            const purSearchBox = document.getElementById('purchase-search-results');
            const purSearchInput = document.getElementById('search-purchase-input');
            if (purSearchBox && purSearchInput && !purSearchBox.contains(e.target) && e.target !== purSearchInput) {
                purSearchBox.classList.add('hidden');
            }

            const prodSearchBox = document.getElementById('prod-search-results');
            const prodSearchInput = document.getElementById('search-prod-input');
            if (prodSearchBox && prodSearchInput && !prodSearchBox.contains(e.target) && e.target !== prodSearchInput) {
                prodSearchBox.classList.add('hidden');
            }
        });

        function removePurchaseItem(idx) {
            purchaseCart.splice(idx, 1);
            renderPurchaseItems();
        }

        function updatePurchaseItemField(idx, field, val) {
            const num = parseFloat(val) || 0;
            if (field === 'quantity') purchaseCart[idx].quantity = num;
            if (field === 'cost_price') purchaseCart[idx].cost_price = num;
            renderPurchaseItems(false);
        }

        function renderPurchaseItems(rebuildDOM = true) {
            const tbody = document.getElementById('purchase-items-table');
            if (!tbody) return;

            if (purchaseCart.length === 0) {
                tbody.innerHTML = '<tr><td colspan="8" class="p-4 text-center text-gray-400">Chưa có sản phẩm nào. Hãy tìm kiếm ở trên để thêm vào phiếu!</td></tr>';
                calculatePurchaseTotals();
                return;
            }

            if (rebuildDOM) {
                tbody.innerHTML = purchaseCart.map((item, idx) => {
                    const subtotal = item.quantity * item.cost_price;
                    const isIng = item.item_type === 'ingredient';
                    const badge = isIng 
                        ? '<span class="px-1.5 py-0.5 rounded text-[10px] font-bold bg-purple-100 text-purple-700">Nguyên Liệu</span>' 
                        : '<span class="px-1.5 py-0.5 rounded text-[10px] font-bold bg-blue-100 text-blue-700">Hàng Hóa</span>';

                    return `
                    <tr class="border-b hover:bg-gray-50 text-xs">
                        <td class="p-2 text-center text-gray-400">${idx + 1}</td>
                        <td class="p-2 font-medium text-slate-800">${item.name}</td>
                        <td class="p-2 text-center">${badge}</td>
                        <td class="p-2 text-center text-gray-500">${item.unit}</td>
                        <td class="p-2 text-right">
                            <input type="number" step="any" min="0.001" value="${item.quantity}" 
                                class="border p-1 rounded w-20 text-right font-bold text-sky-700" 
                                oninput="updatePurchaseItemField(${idx}, 'quantity', this.value)">
                        </td>
                        <td class="p-2 text-right">
                            <input type="number" step="any" min="0" value="${item.cost_price}" 
                                class="border p-1 rounded w-28 text-right font-bold text-rose-600" 
                                oninput="updatePurchaseItemField(${idx}, 'cost_price', this.value)">
                        </td>
                        <td class="p-2 text-right font-bold text-slate-800 font-mono" id="p-subtotal-${idx}">
                            ${formatMoney(subtotal)}
                        </td>
                        <td class="p-2 text-center">
                            <button onclick="removePurchaseItem(${idx})" class="text-rose-500 hover:text-rose-700 font-black text-sm px-1.5" title="Xóa món này khỏi phiếu">✕</button>
                        </td>
                    </tr>
                    `;
                }).join('');
            } else {
                purchaseCart.forEach((item, idx) => {
                    const el = document.getElementById(`p-subtotal-${idx}`);
                    if (el) el.textContent = formatMoney(item.quantity * item.cost_price);
                });
            }

            calculatePurchaseTotals();
        }

        function calculatePurchaseTotals() {
            const subtotal = purchaseCart.reduce((sum, item) => sum + (item.quantity * item.cost_price), 0);
            const discount = parseFloat(document.getElementById('purchase-discount').value) || 0;
            const shipping = parseFloat(document.getElementById('purchase-shipping').value) || 0;
            const otherFee = parseFloat(document.getElementById('purchase-other-fee').value) || 0;
            const vatRate = parseFloat(document.getElementById('purchase-vat-rate').value) || 0;

            const afterDiscount = Math.max(0, subtotal - discount);
            const vatAmount = (vatRate > 0) ? Math.round(afterDiscount * (vatRate / 100)) : 0;
            const total = Math.max(0, afterDiscount + shipping + otherFee + vatAmount);

            document.getElementById('p-calc-subtotal').textContent = formatMoney(subtotal);
            document.getElementById('p-calc-vat').textContent = formatMoney(vatAmount);
            document.getElementById('p-calc-total').textContent = formatMoney(total);

            const paidInput = document.getElementById('purchase-paid');
            if (document.activeElement !== paidInput && (parseFloat(paidInput.value) === 0 || parseFloat(paidInput.value) > total)) {
                paidInput.value = total;
            }

            const paid = parseFloat(paidInput.value) || 0;
            const debt = Math.max(0, total - paid);
            document.getElementById('p-calc-debt').textContent = formatMoney(debt);
        }

        let editingPurchaseCode = null; // null: tạo mới, 'PN...': đang sửa

        function openCreatePurchaseModal() {
            editingPurchaseCode = null;
            resetPurchaseForm();
            const modalTitle = document.getElementById('modal-purchase-title');
            if (modalTitle) modalTitle.innerHTML = '<span>➕ Tạo Đơn Đặt Hàng NCC Mới</span>';
            const btnDraft = document.getElementById('btn-draft-purchase-text');
            if (btnDraft) btnDraft.textContent = '📝 Lưu Tạm (Nháp)';
            const btnSubmit = document.getElementById('btn-submit-purchase-text');
            if (btnSubmit) btnSubmit.textContent = '📋 Đặt Hàng';
            const modal = document.getElementById('modal-purchase-order');
            if (modal) modal.classList.remove('hidden');
        }

        function closePurchaseModal() {
            const modal = document.getElementById('modal-purchase-order');
            if (modal) modal.classList.add('hidden');
            editingPurchaseCode = null;
            resetPurchaseForm();
        }

        async function openEditPurchaseModal(code) {
            try {
                const res = await fetch(`/api/purchases/${code}`);
                const p = await res.json();
                if (!res.ok) return alert('Lỗi: ' + (p.detail || 'Không thể tải đơn hàng'));

                if (p.status !== 'pending' && p.status !== 'draft') {
                    return alert('Chỉ có thể sửa đơn đặt hàng khi còn ở trạng thái "Chờ Nhận Hàng" hoặc "Bản Nháp"!');
                }

                editingPurchaseCode = code;

                // Điền thông tin nhà cung cấp
                document.getElementById('purchase-supplier').value = p.supplier_id || '';
                document.getElementById('purchase-supplier-search').value = p.supplier_name || '';

                // Kho & Nguồn quỹ & Ngày & Ghi chú
                const whSel = document.getElementById('purchase-warehouse');
                if (whSel && p.warehouse_id) whSel.value = p.warehouse_id;

                const fundSel = document.getElementById('purchase-fund-source');
                if (fundSel && p.fund_source) fundSel.value = p.fund_source;

                if (p.expected_date) {
                    document.getElementById('purchase-expected-date').value = p.expected_date;
                }
                document.getElementById('purchase-note').value = p.note || '';

                // Chiết khấu, phí, thuế, thanh toán
                document.getElementById('purchase-discount').value = p.discount || 0;
                document.getElementById('purchase-shipping').value = p.shipping_fee || 0;
                document.getElementById('purchase-other-fee').value = p.other_fee || 0;
                document.getElementById('purchase-vat-rate').value = p.vat_rate || 0;
                document.getElementById('purchase-paid').value = p.paid_amount || 0;

                // Đổ danh sách items vào purchaseCart
                purchaseCart = (p.items || []).map(item => ({
                    item_type: item.item_type,
                    product_id: item.product_id,
                    ingredient_id: item.ingredient_id,
                    name: item.item_name,
                    unit: item.unit,
                    quantity: item.quantity,
                    cost_price: item.cost_price
                }));

                renderPurchaseItems();

                // Đổi tiêu đề modal & nút bấm
                const modalTitle = document.getElementById('modal-purchase-title');
                if (modalTitle) modalTitle.innerHTML = `<span>✏️ Cập Nhật Đơn <strong class="font-mono text-amber-300">[${code}]</strong></span>`;
                const btnDraft = document.getElementById('btn-draft-purchase-text');
                if (btnDraft) btnDraft.textContent = '💾 Lưu Nháp';
                const btnSubmit = document.getElementById('btn-submit-purchase-text');
                if (btnSubmit) btnSubmit.textContent = '🚀 Chốt Đặt Hàng';

                const modal = document.getElementById('modal-purchase-order');
                if (modal) modal.classList.remove('hidden');
            } catch (e) {
                console.error(e);
                alert('Lỗi khi tải thông tin đơn hàng để sửa!');
            }
        }

        function resetPurchaseForm() {
            purchaseCart = [];
            document.getElementById('purchase-supplier').value = '';
            document.getElementById('purchase-supplier-search').value = '';
            document.getElementById('purchase-discount').value = 0;
            document.getElementById('purchase-shipping').value = 0;
            document.getElementById('purchase-other-fee').value = 0;
            document.getElementById('purchase-vat-rate').value = 0;
            document.getElementById('purchase-paid').value = 0;
            document.getElementById('purchase-note').value = '';
            const expInput = document.getElementById('purchase-expected-date');
            if (expInput) expInput.value = new Date().toISOString().split('T')[0];
            renderPurchaseItems();
        }

        async function submitPurchase(targetStatus = 'pending') {
            if (purchaseCart.length === 0) return alert('Vui lòng chọn ít nhất 1 mặt hàng vào phiếu nhập!');
            const suppIdVal = document.getElementById('purchase-supplier').value;
            if (!suppIdVal) return alert('Vui lòng chọn Nhà Cung Cấp!');

            const suppId = parseInt(suppIdVal);
            const whId = parseInt(document.getElementById('purchase-warehouse').value) || 1;
            const discount = parseFloat(document.getElementById('purchase-discount').value) || 0;
            const shipping = parseFloat(document.getElementById('purchase-shipping').value) || 0;
            const otherFee = parseFloat(document.getElementById('purchase-other-fee').value) || 0;
            const vatRate = parseFloat(document.getElementById('purchase-vat-rate').value) || 0;
            const paid = parseFloat(document.getElementById('purchase-paid').value) || 0;
            const note = document.getElementById('purchase-note').value.trim();
            const expectedDate = document.getElementById('purchase-expected-date').value || null;

            const fundSource = document.getElementById('purchase-fund-source') ? document.getElementById('purchase-fund-source').value : 'PERSONAL';

            const payload = {
                supplier_id: suppId,
                warehouse_id: whId,
                discount: discount,
                shipping_fee: shipping,
                other_fee: otherFee,
                vat_rate: vatRate,
                paid_amount: paid,
                expected_date: expectedDate,
                fund_source: fundSource,
                note: note,
                status: targetStatus,
                items: purchaseCart.map(i => ({
                    item_type: i.item_type,
                    product_id: i.product_id,
                    ingredient_id: i.ingredient_id,
                    item_name: i.name,
                    unit: i.unit,
                    quantity: i.quantity,
                    cost_price: i.cost_price
                }))
            };

            const isEdit = !!editingPurchaseCode;
            const url = isEdit ? `/api/purchases/${editingPurchaseCode}` : '/api/purchases';
            const method = isEdit ? 'PUT' : 'POST';

            try {
                const res = await fetch(url, {
                    method: method,
                    headers: {'Content-Type': 'application/json'},
                    body: JSON.stringify(payload)
                });

                const data = await res.json();
                if (res.ok) {
                    if (isEdit) {
                        const statusLabel = targetStatus === 'draft' ? 'Bản Nháp' : 'Chờ Nhận Hàng';
                        alert(`✅ Đã cập nhật thành công đơn: ${editingPurchaseCode} (${statusLabel})!`);
                    } else {
                        if (targetStatus === 'draft') {
                            alert(`📝 Đã lưu tạm đơn nháp thành công: ${data.purchase_code}!\nBạn có thể mở lại để hoàn thiện và chốt đơn sau.`);
                        } else {
                            alert(`✅ Tạo đơn đặt hàng thành công: ${data.purchase_code}!\nTrạng thái: CHỜ NHẬN HÀNG (chưa tăng tồn kho cho đến khi kiểm đếm thực nhận).`);
                        }
                    }
                    closePurchaseModal();
                    loadPurchasesList();
                } else {
                    alert('Lỗi: ' + (data.detail || 'Không thể lưu phiếu nhập'));
                }
            } catch (e) {
                console.error(e);
                alert('Lỗi kết nối máy chủ!');
            }
        }

        function togglePurchaseSubView(view) {
            const listView = document.getElementById('purchase-list-view');
            const compareView = document.getElementById('purchase-compare-view');
            const priceHistView = document.getElementById('purchase-price-history-view');

            const btnCompare = document.getElementById('btn-purchase-compare');
            const btnPriceHist = document.getElementById('btn-purchase-price-hist');

            // Ẩn tất cả view
            if (listView) listView.classList.add('hidden');
            if (compareView) compareView.classList.add('hidden');
            if (priceHistView) priceHistView.classList.add('hidden');

            const resetBtn = (btn) => {
                if (btn) btn.className = 'bg-slate-700 hover:bg-slate-800 text-white text-xs font-bold px-3 py-2 rounded shadow flex items-center gap-1';
            };
            const activeBtn = (btn) => {
                if (btn) btn.className = 'bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold px-3 py-2 rounded shadow flex items-center gap-1';
            };

            [btnCompare, btnPriceHist].forEach(resetBtn);

            if (view === 'compare') {
                if (compareView) compareView.classList.remove('hidden');
                activeBtn(btnCompare);
                loadPriceComparisonData();
            } else if (view === 'price-history') {
                if (priceHistView) priceHistView.classList.remove('hidden');
                activeBtn(btnPriceHist);
                loadPriceHistoryAllData();
            } else {
                // Mặc định về danh sách
                if (listView) listView.classList.remove('hidden');
                loadPurchasesList();
            }
        }

        function togglePurchaseView(view) {
            if (view === 'create') {
                openCreatePurchaseModal();
            } else if (view === 'list') {
                togglePurchaseSubView('list');
            } else {
                togglePurchaseSubView(view);
            }
        }

        let debouncePriceCompTimer = null;
        function debounceLoadPriceComparison() {
            clearTimeout(debouncePriceCompTimer);
            debouncePriceCompTimer = setTimeout(loadPriceComparisonData, 300);
        }

        async function loadPriceComparisonData() {
            const tbody = document.getElementById('table-price-comparison');
            if (!tbody) return;

            const kw = (document.getElementById('pricing-compare-search')?.value || '').trim();
            const type = document.getElementById('pricing-compare-type')?.value || 'all';

            let url = `/api/purchases-pricing/comparison?item_type=${type}`;
            if (kw) url += `&search=${encodeURIComponent(kw)}`;

            try {
                const res = await fetch(url);
                if (!res.ok) {
                    const errJson = await res.json().catch(() => ({}));
                    tbody.innerHTML = `<tr><td colspan="7" class="p-4 text-center text-rose-500 font-medium">⚠️ Lỗi máy chủ (${res.status}): ${errJson.detail || 'Không thể lấy dữ liệu so sánh giá'}</td></tr>`;
                    return;
                }
                const items = await res.json();

                if (!Array.isArray(items) || items.length === 0) {
                    tbody.innerHTML = '<tr><td colspan="7" class="p-4 text-center text-gray-400">Không tìm thấy mặt hàng nào để so sánh giá</td></tr>';
                    return;
                }

                tbody.innerHTML = items.map(item => {
                    const isProduct = item.item_type === 'product';
                    const typeBadge = isProduct 
                        ? '<span class="px-1.5 py-0.5 rounded text-[10px] font-bold bg-sky-100 text-sky-700">📦 Hàng Hóa</span>' 
                        : '<span class="px-1.5 py-0.5 rounded text-[10px] font-bold bg-emerald-100 text-emerald-700">🧪 Nguyên Liệu</span>';

                    // Render danh sách NCC và giá
                    const suppliersHtml = item.suppliers.map(s => {
                        const isMin = item.min_price && s.effective_price === item.min_price && item.suppliers.length > 1;
                        const isMax = item.max_price && s.effective_price === item.max_price && item.suppliers.length > 1 && item.min_price !== item.max_price;

                        let highlightBadge = '';
                        if (isMin) {
                            highlightBadge = '<span class="bg-emerald-100 text-emerald-800 font-bold px-1.5 py-0.5 rounded text-[10px] ml-1">⭐ Rẻ nhất</span>';
                        } else if (isMax) {
                            highlightBadge = '<span class="bg-rose-100 text-rose-800 font-bold px-1.5 py-0.5 rounded text-[10px] ml-1">Cao nhất</span>';
                        }

                        const dateStr = s.latest_purchase_date ? `(${s.latest_purchase_date.substring(0, 10)})` : '(Giá mặc định)';

                        return `
                            <div class="flex items-center justify-between py-1 border-b border-gray-100 last:border-0 gap-2">
                                <div class="flex items-center gap-1 truncate">
                                    <span class="font-medium text-slate-700">🏢 ${s.supplier_name}</span>
                                    ${highlightBadge}
                                </div>
                                <div class="text-right whitespace-nowrap">
                                    <span class="font-mono font-bold ${isMin ? 'text-emerald-700' : 'text-slate-800'}">${formatMoney(s.effective_price)}</span>
                                    <span class="text-[10px] text-gray-400 block">${dateStr}</span>
                                </div>
                            </div>
                        `;
                    }).join('');

                    // Độ chênh lệch giữa NCC rẻ nhất và đắt nhất
                    let diffHtml = '<span class="text-gray-400 italic">1 NCC</span>';
                    if (item.min_price && item.max_price && item.suppliers.length > 1) {
                        const diff = item.max_price - item.min_price;
                        if (diff > 0) {
                            const pct = Math.round((diff / item.min_price) * 100);
                            diffHtml = `<span class="text-rose-600 font-bold">+${formatMoney(diff)}</span> <span class="text-[10px] text-gray-400 block">(chênh ${pct}%)</span>`;
                        } else {
                            diffHtml = '<span class="text-emerald-600 font-bold">Giá đồng nhất</span>';
                        }
                    }

                    return `
                        <tr class="border-b hover:bg-gray-50">
                            <td class="p-2.5 font-mono font-bold text-slate-700 whitespace-nowrap">${item.item_code || '-'}</td>
                            <td class="p-2.5 font-bold text-slate-800">${item.item_name}</td>
                            <td class="p-2.5 text-center">${typeBadge}</td>
                            <td class="p-2.5 text-gray-500">${item.unit}</td>
                            <td class="p-2.5 max-w-xs">
                                <div class="bg-gray-50 p-2 rounded border space-y-0.5">
                                    ${suppliersHtml}
                                </div>
                            </td>
                            <td class="p-2.5 text-right whitespace-nowrap">${diffHtml}</td>
                            <td class="p-2.5 text-center whitespace-nowrap">
                                <button onclick="goToPurchaseTabWithItem('${item.item_type}', ${item.item_id})" class="bg-indigo-50 text-indigo-700 hover:bg-indigo-100 border border-indigo-200 px-2 py-1 rounded text-xs font-bold shadow-sm">
                                    📥 Nhập Hàng
                                </button>
                            </td>
                        </tr>
                    `;
                }).join('');
            } catch (e) {
                console.error(e);
                tbody.innerHTML = '<tr><td colspan="7" class="p-4 text-center text-rose-500">Lỗi khi tải bảng so sánh giá</td></tr>';
            }
        }

        let debouncePriceHistTimer = null;
        function debounceLoadPriceHistoryAll() {
            clearTimeout(debouncePriceHistTimer);
            debouncePriceHistTimer = setTimeout(loadPriceHistoryAllData, 300);
        }

        async function loadPriceHistoryAllData() {
            const tbody = document.getElementById('table-price-history-all');
            if (!tbody) return;

            const kw = (document.getElementById('pricing-history-search')?.value || '').trim();
            const type = document.getElementById('pricing-history-type')?.value || 'all';
            const status = document.getElementById('pricing-history-status')?.value || 'all';

            let url = `/api/purchases-pricing/fluctuations?item_type=${type}&filter_status=${status}`;
            if (kw) url += `&search=${encodeURIComponent(kw)}`;

            try {
                const res = await fetch(url);
                if (!res.ok) {
                    const errJson = await res.json().catch(() => ({}));
                    tbody.innerHTML = `<tr><td colspan="10" class="p-4 text-center text-rose-500 font-medium">⚠️ Lỗi máy chủ (${res.status}): ${errJson.detail || 'Không thể lấy dữ liệu biến động giá'}</td></tr>`;
                    return;
                }
                const list = await res.json();

                if (!Array.isArray(list) || list.length === 0) {
                    tbody.innerHTML = '<tr><td colspan="10" class="p-4 text-center text-gray-400">Không tìm thấy mặt hàng nào phù hợp với bộ lọc</td></tr>';
                    return;
                }

                tbody.innerHTML = list.map(item => {
                    const isProduct = item.item_type === 'product';
                    const typeBadge = isProduct 
                        ? '<span class="px-1.5 py-0.5 rounded text-[10px] font-bold bg-sky-100 text-sky-700">📦 Hàng Hóa</span>' 
                        : '<span class="px-1.5 py-0.5 rounded text-[10px] font-bold bg-emerald-100 text-emerald-700">🧪 Nguyên Liệu</span>';

                    // Biến động so với lần liền trước
                    let diffPrevHtml = '<span class="text-gray-400 font-medium">Không đổi</span>';
                    if (item.diff_prev > 0) {
                        diffPrevHtml = `<span class="bg-rose-100 text-rose-700 font-bold px-2 py-0.5 rounded text-[11px] inline-flex items-center gap-1">🔺 +${formatMoney(item.diff_prev)} (+${item.pct_prev}%)</span>`;
                    } else if (item.diff_prev < 0) {
                        diffPrevHtml = `<span class="bg-emerald-100 text-emerald-700 font-bold px-2 py-0.5 rounded text-[11px] inline-flex items-center gap-1">🔻 -${formatMoney(Math.abs(item.diff_prev))} (${item.pct_prev}%)</span>`;
                    } else if (item.total_purchases === 1) {
                        diffPrevHtml = '<span class="text-gray-400 italic text-[10px]">Mới nhập 1 lần</span>';
                    }

                    // Biến động toàn kỳ (so với lần đầu tiên)
                    let diffFirstHtml = '<span class="text-gray-400 font-medium">0đ</span>';
                    if (item.diff_first > 0) {
                        diffFirstHtml = `<span class="text-rose-600 font-bold">+${formatMoney(item.diff_first)}</span> <span class="text-[10px] text-gray-400 block">(+${item.pct_first}%)</span>`;
                    } else if (item.diff_first < 0) {
                        diffFirstHtml = `<span class="text-emerald-600 font-bold">-${formatMoney(Math.abs(item.diff_first))}</span> <span class="text-[10px] text-gray-400 block">(${item.pct_first}%)</span>`;
                    } else if (item.total_purchases === 1) {
                        diffFirstHtml = '<span class="text-gray-400 italic text-[10px]">-</span>';
                    }

                    // Tooltip / Danh sách lịch sử các đợt nhập của mặt hàng này
                    const historyHtml = item.history.map((h, idx) => `
                        <div class="text-[10px] py-0.5 border-b border-gray-100 last:border-0 flex justify-between gap-2">
                            <span>#${idx + 1} (${(h.created_at || '').substring(0, 10)}) - ${h.supplier_name || 'NCC'}:</span>
                            <span class="font-mono font-bold">${formatMoney(h.cost_price)}</span>
                        </div>
                    `).join('');

                    return `
                        <tr class="border-b hover:bg-gray-50 text-[11px]">
                            <td class="p-2.5 font-mono font-bold text-slate-700 whitespace-nowrap">${item.item_code || '-'}</td>
                            <td class="p-2.5 font-bold text-slate-800">
                                ${item.item_name}
                                <span class="text-[10px] text-gray-400 block">Gần nhất: ${item.latest_date ? item.latest_date.substring(0, 10) : '-'} (${item.latest_supplier || 'NCC'})</span>
                            </td>
                            <td class="p-2.5 text-center whitespace-nowrap">${typeBadge}</td>
                            <td class="p-2.5 text-center">
                                <span class="bg-slate-100 text-slate-700 font-bold px-2 py-0.5 rounded-full text-[10px]">${item.total_purchases} lần</span>
                            </td>
                            <td class="p-2.5 text-right font-mono text-gray-600">${formatMoney(item.first_price)}</td>
                            <td class="p-2.5 text-right font-mono text-gray-600">${formatMoney(item.previous_price)}</td>
                            <td class="p-2.5 text-right font-mono font-bold text-slate-900">${formatMoney(item.latest_price)}</td>
                            <td class="p-2.5 text-center whitespace-nowrap">${diffPrevHtml}</td>
                            <td class="p-2.5 text-center whitespace-nowrap">${diffFirstHtml}</td>
                            <td class="p-2.5">
                                <details class="cursor-pointer group">
                                    <summary class="text-sky-600 hover:underline font-medium text-[10px] select-none text-center">Xem ${item.total_purchases} đợt</summary>
                                    <div class="mt-1 p-2 bg-slate-50 border rounded shadow-sm max-h-36 overflow-y-auto min-w-[200px]">
                                        ${historyHtml}
                                    </div>
                                </details>
                            </td>
                        </tr>
                    `;
                }).join('');
            } catch (e) {
                console.error(e);
                tbody.innerHTML = '<tr><td colspan="10" class="p-4 text-center text-rose-500">Lỗi khi tải bảng phân tích biến động giá</td></tr>';
            }
        }

        let currentPurchaseFilterStatus = 'all';
        function filterPurchasesStatus(status) {
            currentPurchaseFilterStatus = status;
            ['all', 'draft', 'pending', 'received'].forEach(s => {
                const btn = document.getElementById(`btn-po-filter-${s}`);
                if (btn) {
                    if (s === status) {
                        btn.className = 'px-3 py-1.5 font-bold bg-slate-800 text-white ' + (s === 'all' ? 'rounded-l-md' : (s === 'received' ? 'rounded-r-md' : 'border-t border-b'));
                    } else {
                        btn.className = 'px-3 py-1.5 font-bold bg-white text-slate-700 border hover:bg-gray-50 ' + (s === 'all' ? 'rounded-l-md' : (s === 'received' ? 'rounded-r-md' : ''));
                    }
                }
            });
            loadPurchasesList();
        }

        let debouncePurchasesTimer = null;
        function debounceFilterPurchases() {
            clearTimeout(debouncePurchasesTimer);
            debouncePurchasesTimer = setTimeout(loadPurchasesList, 300);
        }

        function printPurchaseChecklistCurrent() {
            if (currentViewingPurchase && currentViewingPurchase.code) {
                window.open(`/api/purchases/${currentViewingPurchase.code}/print-checklist`, '_blank');
            }
        }

        async function loadPurchasesList() {
            try {
                // Tải KPI số liệu
                fetch('/api/purchases/kpi').then(r => r.json()).then(kpi => {
                    const elPending = document.getElementById('kpi-po-pending');
                    const elPaid = document.getElementById('kpi-po-paid');
                    const elDebt = document.getElementById('kpi-po-debt');
                    const elTotal = document.getElementById('kpi-po-total');
                    if (elPending) elPending.textContent = kpi.pending_count || 0;
                    if (elPaid) elPaid.textContent = formatMoney(kpi.total_paid || 0);
                    if (elDebt) elDebt.textContent = formatMoney(kpi.total_debt || 0);
                    if (elTotal) elTotal.textContent = kpi.total_count || 0;
                }).catch(e => console.warn('Lỗi tải KPI purchases:', e));

                const res = await fetch('/api/purchases');
                let list = await res.json();
                const tbody = document.getElementById('table-purchases-history');
                if (!tbody) return;

                // Lọc theo trạng thái
                if (currentPurchaseFilterStatus !== 'all') {
                    list = list.filter(p => p.status === currentPurchaseFilterStatus);
                }

                // Lọc theo nguồn quỹ
                const fundFilter = document.getElementById('filter-po-fund') ? document.getElementById('filter-po-fund').value : 'all';
                if (fundFilter !== 'all') {
                    list = list.filter(p => (p.fund_source || 'PERSONAL') === fundFilter);
                }

                // Lọc tìm kiếm
                const kw = (document.getElementById('search-po-input')?.value || '').trim();
                if (kw) {
                    list = list.filter(p => {
                        const target = `${p.code} ${p.supplier_name || ''} ${p.note || ''}`;
                        return fuzzyMatch(kw, target);
                    });
                }

                if (list.length === 0) {
                    tbody.innerHTML = '<tr><td colspan="10" class="p-6 text-center text-gray-400">Không tìm thấy phiếu nhập hàng nào phù hợp</td></tr>';
                    return;
                }

                tbody.innerHTML = list.map(p => {
                    const statusBadge = p.status === 'received' 
                        ? '<span class="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-800">✅ Đã Nhập Kho</span>' 
                        : (p.status === 'cancelled'
                            ? '<span class="px-2 py-0.5 rounded-full text-[10px] font-bold bg-rose-100 text-rose-800">❌ Đã Hủy</span>'
                            : (p.status === 'draft'
                                ? '<span class="px-2 py-0.5 rounded-full text-[10px] font-bold bg-slate-200 text-slate-800">📝 Bản Nháp</span>'
                                : '<span class="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-100 text-amber-800">⏳ Chờ Nhận</span>'));

                    const isCompany = (p.fund_source || 'PERSONAL') === 'COMPANY' || (p.vat_rate > 0);
                    const fundBadge = isCompany
                        ? '<span class="px-2 py-0.5 rounded text-[10px] font-bold bg-indigo-100 text-indigo-800">🏢 Quỹ Cty</span>'
                        : '<span class="px-2 py-0.5 rounded text-[10px] font-bold bg-amber-100 text-amber-800">👤 Cá Nhân</span>';

                    const actionButtons = (p.status === 'pending' || p.status === 'draft')
                        ? `
                        <button onclick="openEditPurchaseModal('${p.code}')" class="bg-amber-500 hover:bg-amber-600 text-white font-bold px-2 py-1 rounded text-[11px] shadow" title="Chỉnh sửa số lượng, mặt hàng hoặc thông tin đơn">✏️ Sửa Đơn</button>
                        <button onclick="window.open('/api/purchases/${p.code}/print-checklist', '_blank')" class="bg-sky-50 text-sky-700 hover:bg-sky-100 font-bold px-2 py-1 rounded text-[11px] border border-sky-200" title="In phiếu kiểm tay thực tế gửi cho kho">🖨️ Phiếu Kiểm</button>
                        <button onclick="openReceiveModal('${p.code}')" class="bg-emerald-600 hover:bg-emerald-700 text-white font-bold px-2 py-1 rounded text-[11px] shadow" title="Kiểm đếm và xác nhận nhập kho thực tế">📥 Nhận Hàng</button>
                        <button onclick="deletePurchaseOrder('${p.code}')" class="text-rose-600 hover:text-rose-800 font-bold px-1.5 py-1 border border-rose-200 rounded text-[11px]" title="Hủy phiếu nhập">✕ Hủy</button>
                        `
                        : `
                        <button onclick="window.open('/api/purchases/${p.code}/print-checklist', '_blank')" class="bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold px-2 py-1 border rounded text-[11px]" title="In phiếu">🖨️ In</button>
                        <button onclick="openReceiveModal('${p.code}', true)" class="bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold px-2 py-1 border rounded text-[11px]">👁️ Xem</button>
                        <button onclick="deletePurchaseOrder('${p.code}')" class="text-rose-600 hover:text-rose-800 font-bold px-1 py-1 border border-rose-200 rounded text-[11px]" title="Hủy phiếu và hoàn lại kho/công nợ">🗑️ Hủy</button>
                        `;

                    return `
                    <tr class="border-b hover:bg-gray-50 text-xs">
                        <td class="p-2.5 font-mono font-bold text-sky-700">${p.code}</td>
                        <td class="p-2.5 font-medium text-slate-800">${p.supplier_name || 'NCC Mặc định'}</td>
                        <td class="p-2.5 text-gray-600">${p.warehouse_name || 'Kho Tổng'}</td>
                        <td class="p-2.5 font-semibold text-slate-700">${p.expected_date || '<span class="text-gray-400">---</span>'}</td>
                        <td class="p-2.5 text-center">${fundBadge}</td>
                        <td class="p-2.5 text-right font-mono font-bold text-slate-900">${formatMoney(p.total_amount)}</td>
                        <td class="p-2.5 text-right font-mono font-bold text-emerald-700">${formatMoney(p.paid_amount || 0)}</td>
                        <td class="p-2.5 text-right font-mono font-bold ${p.debt_amount > 0 ? 'text-rose-600' : 'text-gray-400'}">${formatMoney(p.debt_amount)}</td>
                        <td class="p-2.5 text-center">${statusBadge}</td>
                        <td class="p-2.5 text-center space-x-1 whitespace-nowrap">${actionButtons}</td>
                    </tr>
                    `;
                }).join('');
            } catch (e) {
                console.error('loadPurchasesList err:', e);
            }
        }

        async function openReceiveModal(code, readonly = false) {
            try {
                const res = await fetch(`/api/purchases/${code}`);
                const data = await res.json();
                if (!res.ok) return alert('Lỗi: ' + data.detail);

                currentViewingPurchase = data;

                document.getElementById('rec-code').textContent = data.code;
                document.getElementById('rec-meta').textContent = `Nhà cung cấp: ${data.supplier_name || 'NCC Mặc định'} | Kho: ${data.warehouse_name || 'Kho Tổng'} | Tạo lúc: ${data.created_at || ''}`;
                document.getElementById('rec-expected-date').textContent = data.expected_date || 'Không có';
                document.getElementById('rec-total').textContent = formatMoney(data.total_amount);
                document.getElementById('rec-debt').textContent = formatMoney(data.debt_amount);

                const statusBadgeEl = document.getElementById('rec-status-badge');
                if (data.status === 'received') {
                    statusBadgeEl.innerHTML = '<span class="text-emerald-600 bg-emerald-100 px-2 py-0.5 rounded">Đã Nhập Kho (' + (data.received_date || '') + ')</span>';
                } else if (data.status === 'cancelled') {
                    statusBadgeEl.innerHTML = '<span class="text-rose-600 bg-rose-100 px-2 py-0.5 rounded">Đã Hủy</span>';
                } else {
                    statusBadgeEl.innerHTML = '<span class="text-amber-600 bg-amber-100 px-2 py-0.5 rounded">Chờ Nhận Hàng</span>';
                }

                const tbody = document.getElementById('rec-items-tbody');
                const isReceived = data.status === 'received' || readonly;

                tbody.innerHTML = (data.items || []).map((it, idx) => {
                    const badge = it.item_type === 'ingredient'
                        ? '<span class="px-1.5 py-0.5 rounded text-[10px] font-bold bg-purple-100 text-purple-700">Nguyên Liệu</span>'
                        : '<span class="px-1.5 py-0.5 rounded text-[10px] font-bold bg-blue-100 text-blue-700">Hàng Hóa</span>';

                    const qtyInput = isReceived 
                        ? `<span class="font-bold text-slate-800">${it.quantity}</span>`
                        : `<input type="number" step="any" min="0" value="${it.quantity}" id="rec-item-qty-${it.id}" class="border p-1 rounded w-20 text-right font-bold text-sky-700 bg-white">`;

                    return `
                    <tr class="border-b hover:bg-gray-50">
                        <td class="p-2 text-center text-gray-400">${idx + 1}</td>
                        <td class="p-2 font-medium text-slate-800">${it.item_name || 'Mặt hàng'}</td>
                        <td class="p-2 text-center">${badge}</td>
                        <td class="p-2 text-center text-gray-500">${it.unit || ''}</td>
                        <td class="p-2 text-right font-semibold text-gray-600">${it.quantity}</td>
                        <td class="p-2 text-right bg-amber-50/50">${qtyInput}</td>
                        <td class="p-2 text-right font-mono text-gray-700">${formatMoney(it.cost_price)}</td>
                        <td class="p-2 text-right font-mono font-bold text-slate-900">${formatMoney(it.total_cost)}</td>
                    </tr>
                    `;
                }).join('');

                const btnConfirm = document.getElementById('btn-confirm-receive');
                const actionBox = document.getElementById('rec-action-box');
                const footerNote = document.getElementById('rec-footer-note');

                if (isReceived) {
                    btnConfirm.classList.add('hidden');
                    actionBox.classList.add('hidden');
                    footerNote.textContent = 'Phiếu này đã hoàn tất nhận hàng và cập nhật tồn kho.';
                } else {
                    btnConfirm.classList.remove('hidden');
                    actionBox.classList.remove('hidden');
                    footerNote.textContent = 'Hệ thống sẽ cộng dồn tồn kho và ghi nhận thẻ kho ngay khi bấm nhận hàng.';
                    document.getElementById('rec-note-input').value = '';
                }

                document.getElementById('modal-receive-purchase').classList.remove('hidden');
            } catch (e) {
                console.error(e);
                alert('Lỗi tải chi tiết phiếu nhập!');
            }
        }

        function closeReceiveModal() {
            document.getElementById('modal-receive-purchase').classList.add('hidden');
            currentViewingPurchase = null;
        }

        async function submitConfirmReceive() {
            if (!currentViewingPurchase) return;
            const code = currentViewingPurchase.code;

            const itemsPayload = [];
            for (const it of (currentViewingPurchase.items || [])) {
                const inputEl = document.getElementById(`rec-item-qty-${it.id}`);
                const actualQty = inputEl ? parseFloat(inputEl.value) : it.quantity;
                itemsPayload.push({
                    item_id: it.id,
                    actual_quantity: isNaN(actualQty) ? it.quantity : actualQty
                });
            }

            const note = document.getElementById('rec-note-input').value.trim();

            if (!confirm(`Xác nhận nhận hàng cho phiếu [${code}]?\nTồn kho sẽ được cộng dồn và thẻ kho sẽ được tạo ngay lập tức.`)) return;

            try {
                const res = await fetch(`/api/purchases/${code}/receive`, {
                    method: 'POST',
                    headers: {'Content-Type': 'application/json'},
                    body: JSON.stringify({
                        items: itemsPayload,
                        note: note
                    })
                });

                const data = await res.json();
                if (res.ok) {
                    alert('✅ Đã nhận hàng và nhập kho thành công!');
                    closeReceiveModal();
                    await Promise.all([loadCostIngredients(), loadProducts(), loadPurchasesList()]);
                } else {
                    alert('Lỗi: ' + (data.detail || 'Không thể nhận hàng'));
                }
            } catch (e) {
                console.error(e);
                alert('Lỗi kết nối máy chủ!');
            }
        }

        async function deletePurchaseOrder(code) {
            if (!confirm(`Bạn có chắc chắn muốn HỦY phiếu nhập [${code}]?\nThao tác này sẽ hoàn lại công nợ NCC và hoàn kho (nếu phiếu đã nhận hàng)!`)) return;
            try {
                const res = await fetch(`/api/purchases/${code}`, { method: 'DELETE' });
                const data = await res.json();
                if (res.ok) {
                    alert('Đã hủy phiếu nhập thành công!');
                    await Promise.all([loadCostIngredients(), loadProducts(), loadPurchasesList()]);
                } else {
                    alert('Lỗi: ' + (data.detail || 'Không thể xóa phiếu'));
                }
            } catch (e) {
                console.error(e);
                alert('Lỗi kết nối máy chủ!');
            }
        }

        function goToPurchaseTabWithItem(type = null, id = null) {
            switchTab('purchases');
            togglePurchaseView('create');
            if (type && id) {
                setTimeout(() => {
                    addPurchaseItemFromFuzzy(type, id);
                }, 300);
            }
        }


        // ==================== PHẦN 2: LỆNH SẢN XUẤT (PRODUCTIONS - BOM) ====================
        let productionCart = []; // Danh sách các thành phẩm trong lệnh sản xuất

        async function initProduction() {
            try {
                const [whRes, prodRes, ingRes, bomRes] = await Promise.all([
                    fetch('/api/warehouses'),
                    fetch('/api/products'),
                    fetch('/api/ingredients'),
                    fetch('/api/bom')
                ]);

                allWarehousesList = await whRes.json();
                allProducts = await prodRes.json();
                costIngredients = await ingRes.json();
                costBOMList = await bomRes.json();

                const whSel = document.getElementById('prod-warehouse');
                if (whSel) {
                    whSel.innerHTML = allWarehousesList.map(w => `<option value="${w.id}">${w.name}</option>`).join('');
                }

                renderProductionItems();
            } catch (e) {
                console.error('initProduction err:', e);
            }
        }

        function toggleProductionView(view) {
            const createView = document.getElementById('prod-create-view');
            const listView = document.getElementById('prod-list-view');
            const btnNew = document.getElementById('btn-prod-new');
            const btnHist = document.getElementById('btn-prod-history');

            if (view === 'create') {
                createView.classList.remove('hidden');
                listView.classList.add('hidden');
                btnNew.className = 'bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold px-3 py-2 rounded shadow flex items-center gap-1';
                btnHist.className = 'bg-slate-700 hover:bg-slate-800 text-white text-xs font-bold px-3 py-2 rounded shadow flex items-center gap-1';
            } else {
                createView.classList.add('hidden');
                listView.classList.remove('hidden');
                btnHist.className = 'bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold px-3 py-2 rounded shadow flex items-center gap-1';
                btnNew.className = 'bg-slate-700 hover:bg-slate-800 text-white text-xs font-bold px-3 py-2 rounded shadow flex items-center gap-1';
                loadProductionsList();
            }
        }

        function filterProdSearch(val) {
            const resBox = document.getElementById('prod-search-results');
            if (!resBox) return;

            // Lấy tập hợp product_id có BOM
            const bomProductIds = new Set((costBOMList || []).map(b => b.product_id));

            const matches = (allProducts || []).filter(p => {
                if (p.type === 'service') return false;
                if (!bomProductIds.has(p.id)) return false; // Chỉ sản phẩm đã có BOM
                const searchText = `${p.name} ${p.code || ''} ${p.unit || ''}`;
                return fuzzyMatch(val, searchText);
            });

            if (matches.length === 0) {
                resBox.innerHTML = '<div class="p-3 text-gray-400 text-center italic">Không tìm thấy thành phẩm có định lượng BOM phù hợp</div>';
                resBox.classList.remove('hidden');
                return;
            }

            resBox.innerHTML = matches.slice(0, 20).map(p => `
                <div onclick="addProductionItem(${p.id})" class="p-2.5 hover:bg-emerald-50 cursor-pointer flex justify-between items-center transition-colors">
                    <div>
                        <div class="font-bold text-slate-800">${p.name}</div>
                        <div class="text-[11px] text-gray-500 font-mono">Mã: ${p.code || '---'} | ĐVT: ${p.unit || 'cái'}</div>
                    </div>
                    <div class="text-right">
                        <div class="font-bold text-emerald-700 font-mono">${formatMoney(p.cost_price || 0)}</div>
                        <div class="text-[11px] text-gray-500">Tồn hiện tại: <span class="font-bold text-slate-800">${p.stock || 0}</span></div>
                    </div>
                </div>
            `).join('');

            resBox.classList.remove('hidden');
        }

        function addProductionItem(productId) {
            const resBox = document.getElementById('prod-search-results');
            if (resBox) resBox.classList.add('hidden');
            const input = document.getElementById('search-prod-input');
            if (input) input.value = '';

            const prod = (allProducts || []).find(p => p.id === productId);
            if (!prod) return;

            const existing = productionCart.find(x => x.product_id === productId);
            if (existing) {
                existing.quantity += 1;
            } else {
                // Tính giá vốn 1 thành phẩm từ BOM
                const boms = (costBOMList || []).filter(b => b.product_id === productId);
                let unitCost = 0;
                boms.forEach(b => {
                    const ing = (costIngredients || []).find(i => i.id === b.ingredient_id);
                    const cost = ing ? (ing.latest_cost || 0) : 0;
                    unitCost += b.quantity * cost;
                });

                productionCart.push({
                    product_id: prod.id,
                    name: prod.name,
                    code: prod.code || '',
                    unit: prod.unit || 'cái',
                    quantity: 1,
                    unit_cost: unitCost > 0 ? unitCost : (prod.cost_price || 0)
                });
            }

            renderProductionItems();
        }

        function removeProductionItem(idx) {
            productionCart.splice(idx, 1);
            renderProductionItems();
        }

        function updateProductionItemQty(idx, val) {
            const num = Math.max(0.001, parseFloat(val) || 0);
            productionCart[idx].quantity = num;
            renderProductionItems(false);
        }

        function renderProductionItems(rebuildDOM = true) {
            const tbody = document.getElementById('production-items-table');
            if (!tbody) return;

            if (productionCart.length === 0) {
                tbody.innerHTML = '<tr><td colspan="8" class="p-4 text-center text-gray-400">Chưa có thành phẩm nào. Hãy tìm kiếm ở trên để thêm vào lệnh!</td></tr>';
                renderMaterialsSummary();
                return;
            }

            if (rebuildDOM) {
                tbody.innerHTML = productionCart.map((item, idx) => {
                    const totalCost = item.quantity * item.unit_cost;
                    return `
                    <tr class="border-b hover:bg-gray-50 text-xs">
                        <td class="p-2 text-center text-gray-400">${idx + 1}</td>
                        <td class="p-2 font-bold text-slate-800">${item.name}</td>
                        <td class="p-2 text-center font-mono text-gray-500">${item.code || '---'}</td>
                        <td class="p-2 text-center text-gray-600">${item.unit}</td>
                        <td class="p-2 text-right">
                            <input type="number" step="any" min="0.001" value="${item.quantity}" 
                                   class="border p-1 rounded w-24 text-right font-bold text-sky-700 bg-white"
                                   oninput="updateProductionItemQty(${idx}, this.value)">
                        </td>
                        <td class="p-2 text-right font-mono text-gray-700">${formatMoney(item.unit_cost)}</td>
                        <td class="p-2 text-right font-bold text-emerald-700 font-mono" id="prod-row-total-${idx}">${formatMoney(totalCost)}</td>
                        <td class="p-2 text-center">
                            <button onclick="removeProductionItem(${idx})" class="text-rose-500 hover:text-rose-700 font-bold px-1.5" title="Xóa món">✕</button>
                        </td>
                    </tr>
                    `;
                }).join('');
            } else {
                productionCart.forEach((item, idx) => {
                    const el = document.getElementById(`prod-row-total-${idx}`);
                    if (el) el.textContent = formatMoney(item.quantity * item.unit_cost);
                });
            }

            renderMaterialsSummary();
        }

        function renderMaterialsSummary() {
            const matsTbody = document.getElementById('production-materials-summary');
            const totalQtyEl = document.getElementById('prod-total-qty');
            const totalCostEl = document.getElementById('prod-total-cost');
            const statusEl = document.getElementById('prod-materials-status');

            if (productionCart.length === 0) {
                if (matsTbody) matsTbody.innerHTML = '<tr><td colspan="6" class="p-3 text-center text-gray-400">Chưa có dữ liệu</td></tr>';
                if (totalQtyEl) totalQtyEl.textContent = '0';
                if (totalCostEl) totalCostEl.textContent = '0 đ';
                if (statusEl) {
                    statusEl.textContent = 'Chưa có dữ liệu';
                    statusEl.className = 'text-xs font-bold text-gray-400';
                }
                return;
            }

            // Tính tổng sản lượng & tổng chi phí
            let grandQty = 0;
            let grandCost = 0;
            const requiredMaterialsMap = {}; // ingredient_id -> { name, unit, qtyNeeded, stock, cost }

            productionCart.forEach(item => {
                grandQty += item.quantity;
                grandCost += item.quantity * item.unit_cost;

                // BOM của sản phẩm này
                const boms = (costBOMList || []).filter(b => b.product_id === item.product_id);
                boms.forEach(b => {
                    const ing = (costIngredients || []).find(i => i.id === b.ingredient_id);
                    if (!ing) return;

                    const need = b.quantity * item.quantity;
                    if (!requiredMaterialsMap[b.ingredient_id]) {
                        requiredMaterialsMap[b.ingredient_id] = {
                            id: b.ingredient_id,
                            name: ing.name,
                            unit: ing.unit || 'đv',
                            qtyNeeded: 0,
                            stock: ing.total_stock || 0,
                            cost: ing.latest_cost || 0
                        };
                    }
                    requiredMaterialsMap[b.ingredient_id].qtyNeeded += need;
                });
            });

            if (totalQtyEl) totalQtyEl.textContent = grandQty.toLocaleString('vi-VN');
            if (totalCostEl) totalCostEl.textContent = formatMoney(grandCost);

            const matList = Object.values(requiredMaterialsMap);
            let hasShortage = false;

            if (matsTbody) {
                if (matList.length === 0) {
                    matsTbody.innerHTML = '<tr><td colspan="6" class="p-3 text-center text-gray-400">Các thành phẩm đã chọn chưa cấu hình định lượng BOM</td></tr>';
                } else {
                    matsTbody.innerHTML = matList.map((m, idx) => {
                        const isShort = m.qtyNeeded > m.stock;
                        if (isShort) hasShortage = true;

                        const badge = isShort
                            ? '<span class="px-2 py-0.5 rounded bg-rose-100 text-rose-700 font-bold text-[10px]">Thiếu ' + (Math.round((m.qtyNeeded - m.stock)*100)/100) + ' ' + m.unit + '</span>'
                            : '<span class="px-2 py-0.5 rounded bg-emerald-100 text-emerald-700 font-bold text-[10px]">Đủ kho</span>';

                        return `
                        <tr class="border-b hover:bg-gray-50 text-xs ${isShort ? 'bg-rose-50/30' : ''}">
                            <td class="p-2 text-center text-gray-400">${idx + 1}</td>
                            <td class="p-2 font-medium text-slate-800">${m.name}</td>
                            <td class="p-2 text-right font-bold text-sky-700 font-mono">${Math.round(m.qtyNeeded * 1000)/1000}</td>
                            <td class="p-2 text-right font-mono text-gray-600">${m.stock}</td>
                            <td class="p-2 text-center text-gray-500">${m.unit}</td>
                            <td class="p-2 text-center">${badge}</td>
                        </tr>
                        `;
                    }).join('');
                }
            }

            if (statusEl) {
                if (hasShortage) {
                    statusEl.textContent = '⚠️ Cảnh báo: Tồn kho không đủ nguyên liệu!';
                    statusEl.className = 'text-xs font-bold text-rose-600';
                } else {
                    statusEl.textContent = '✅ Đầy đủ nguyên vật liệu để sản xuất';
                    statusEl.className = 'text-xs font-bold text-emerald-700';
                }
            }
        }

        function resetProductionForm() {
            productionCart = [];
            const noteEl = document.getElementById('prod-note');
            if (noteEl) noteEl.value = '';
            renderProductionItems();
        }

        async function submitProduction() {
            if (productionCart.length === 0) return alert('Vui lòng chọn ít nhất 1 thành phẩm để tạo lệnh sản xuất!');

            const whId = parseInt(document.getElementById('prod-warehouse').value) || 1;
            const note = document.getElementById('prod-note').value.trim();

            const payload = {
                warehouse_id: whId,
                note: note,
                items: productionCart.map(i => ({
                    product_id: i.product_id,
                    quantity: i.quantity
                }))
            };

            if (!confirm(`Tiến hành tạo lệnh sản xuất cho ${productionCart.length} mặt hàng?\nKho nguyên vật liệu sẽ được khấu trừ tương ứng theo định lượng BOM.`)) return;

            try {
                const res = await fetch('/api/productions', {
                    method: 'POST',
                    headers: {'Content-Type': 'application/json'},
                    body: JSON.stringify(payload)
                });

                const data = await res.json();
                if (res.ok) {
                    alert(`✅ Lệnh sản xuất [${data.production_code}] hoàn tất thành công!\nĐã nhập kho thành phẩm và khấu trừ nguyên vật liệu.`);
                    resetProductionForm();
                    await Promise.all([loadCostIngredients(), loadProducts()]);
                    toggleProductionView('list');
                } else {
                    alert('Lỗi sản xuất: ' + (data.detail || 'Không thể thực hiện'));
                }
            } catch (e) {
                console.error(e);
                alert('Lỗi kết nối máy chủ!');
            }
        }

        async function loadProductionsList() {
            try {
                const res = await fetch('/api/productions');
                const list = await res.json();
                const tbody = document.getElementById('table-productions-history');
                if (!tbody) return;

                if (list.length === 0) {
                    tbody.innerHTML = '<tr><td colspan="8" class="p-4 text-center text-gray-400">Chưa có lệnh sản xuất nào</td></tr>';
                    return;
                }

                tbody.innerHTML = list.map(p => `
                    <tr class="border-b hover:bg-gray-50 text-xs">
                        <td class="p-2.5 font-mono font-bold text-sky-700">${p.code}</td>
                        <td class="p-2.5 text-gray-500">${p.created_at || '-'}</td>
                        <td class="p-2.5 text-slate-700 font-medium">${p.warehouse_name || 'Kho Tổng'}</td>
                        <td class="p-2.5 text-center font-bold">${p.item_count || 1} món</td>
                        <td class="p-2.5 text-right font-mono font-bold text-sky-700">${p.total_produced_qty}</td>
                        <td class="p-2.5 text-right font-mono font-bold text-slate-900">${formatMoney(p.total_cost || 0)}</td>
                        <td class="p-2.5 text-gray-500">${p.note || '-'}</td>
                        <td class="p-2.5 text-center">
                            <button onclick="openProdDetailModal('${p.code}')" class="bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold px-2 py-1 border rounded text-[11px]">👁️ Xem</button>
                        </td>
                    </tr>
                `).join('');
            } catch (e) {
                console.error('loadProductionsList err:', e);
            }
        }

        async function openProdDetailModal(code) {
            try {
                const res = await fetch(`/api/productions/${code}`);
                const data = await res.json();
                if (!res.ok) return alert('Lỗi: ' + data.detail);

                document.getElementById('dt-prod-code').textContent = data.code;
                document.getElementById('dt-prod-meta').textContent = `Kho: ${data.warehouse_name || 'Kho Tổng'} | Tạo lúc: ${data.created_at || ''} | Ghi chú: ${data.note || 'Không'}`;

                const itemsTbody = document.getElementById('dt-prod-items-tbody');
                itemsTbody.innerHTML = (data.items || []).map((it, idx) => `
                    <tr class="border-b hover:bg-gray-50 text-xs">
                        <td class="p-2 text-center text-gray-400">${idx + 1}</td>
                        <td class="p-2 font-bold text-slate-800">${it.product_name || 'Sản phẩm'}</td>
                        <td class="p-2 text-center text-gray-500">${it.unit || ''}</td>
                        <td class="p-2 text-right font-mono font-bold text-sky-700">${it.quantity}</td>
                        <td class="p-2 text-right font-mono text-gray-600">${formatMoney(it.unit_cost || 0)}</td>
                        <td class="p-2 text-right font-mono font-bold text-slate-900">${formatMoney(it.total_cost || 0)}</td>
                    </tr>
                `).join('');

                const matsTbody = document.getElementById('dt-prod-mats-tbody');
                if (!data.materials || data.materials.length === 0) {
                    matsTbody.innerHTML = '<tr><td colspan="6" class="p-3 text-center text-gray-400">Không có dữ liệu nguyên liệu tiêu hao</td></tr>';
                } else {
                    matsTbody.innerHTML = data.materials.map((m, idx) => `
                        <tr class="border-b hover:bg-gray-50 text-xs">
                            <td class="p-2 text-center text-gray-400">${idx + 1}</td>
                            <td class="p-2 font-medium text-slate-800">${m.ingredient_name || 'Nguyên liệu'}</td>
                            <td class="p-2 text-center text-gray-500">${m.unit || ''}</td>
                            <td class="p-2 text-right font-mono font-bold text-rose-600">-${m.consumed_qty}</td>
                            <td class="p-2 text-right font-mono text-gray-600">${formatMoney(m.unit_cost || 0)}</td>
                            <td class="p-2 text-right font-mono font-bold text-slate-900">${formatMoney(m.total_cost || 0)}</td>
                        </tr>
                    `).join('');
                }

                document.getElementById('modal-production-detail').classList.remove('hidden');
            } catch (e) {
                console.error(e);
                alert('Lỗi tải chi tiết lệnh sản xuất!');
            }
        }

        function closeProdDetailModal() {
            document.getElementById('modal-production-detail').classList.add('hidden');
        }

        // So quy & Quan Ly Da Tai Khoan
        window.allCashbookData = [];
        window.allPaymentAccounts = [];

        async function loadCashbook() {
            try {
                // 1. Load payment accounts first
                const accRes = await fetch('/api/payment-accounts?_t=' + Date.now());
                window.allPaymentAccounts = await accRes.json();

                // Render account filter dropdown
                const filterAccSelect = document.getElementById('cashbook-filter-account');
                if (filterAccSelect) {
                    const currentVal = filterAccSelect.value;
                    let opts = '<option value="">🏦 Tất cả tài khoản / quỹ</option>';
                    window.allPaymentAccounts.forEach(a => {
                        const ownerBadge = a.owner_type === 'COMPANY' ? '[Cty]' : '[Cá nhân]';
                        opts += `<option value="${a.id}" ${currentVal == a.id ? 'selected' : ''}>${a.code} - ${a.name} ${ownerBadge} (${formatMoney(a.current_balance || 0)})</option>`;
                    });
                    filterAccSelect.innerHTML = opts;
                }

                // Render account KPI cards
                const kpisContainer = document.getElementById('cashbook-accounts-kpis');
                const countBadge = document.getElementById('cashbook-accounts-count');
                if (countBadge) countBadge.innerText = `${window.allPaymentAccounts.length} tài khoản`;
                if (kpisContainer) {
                    kpisContainer.innerHTML = window.allPaymentAccounts.map(a => {
                        const isBank = a.account_type === 'bank';
                        const isCty = a.owner_type === 'COMPANY';
                        const icon = isBank ? '🏦' : (a.account_type === 'ewallet' ? '📱' : '💵');
                        return `
                            <div class="bg-white p-3 rounded-lg border shadow-xs hover:shadow-md transition cursor-pointer ${a.is_default ? 'border-indigo-400 bg-indigo-50/20' : 'border-slate-200'}" onclick="filterCashbookByAccount(${a.id})">
                                <div class="flex items-center justify-between">
                                    <span class="text-xs font-bold text-slate-800 flex items-center gap-1">
                                        <span>${icon}</span>
                                        <span class="truncate max-w-[130px]" title="${a.name}">${a.name}</span>
                                    </span>
                                    <span class="text-[10px] font-bold px-1.5 py-0.5 rounded ${isCty ? 'bg-blue-100 text-blue-700' : 'bg-purple-100 text-purple-700'}">
                                        ${isCty ? 'Cty' : 'Cá nhân'}
                                    </span>
                                </div>
                                <div class="mt-1.5 font-mono text-base font-black ${a.current_balance >= 0 ? 'text-slate-800' : 'text-rose-600'}">
                                    ${formatMoney(a.current_balance || 0)}
                                </div>
                                <div class="text-[10px] text-gray-400 flex items-center justify-between mt-1">
                                    <span class="font-mono font-semibold text-slate-500">${a.code}</span>
                                    ${a.is_default ? '<span class="text-indigo-600 font-bold">★ Mặc định</span>' : ''}
                                </div>
                            </div>
                        `;
                    }).join('');
                }

                // 2. Fetch cashbook data with filters
                const selectedAcc = filterAccSelect ? filterAccSelect.value : '';
                const selectedType = document.getElementById('cashbook-filter-type')?.value || '';
                
                let query = `/api/cashbook?limit=150&_t=${Date.now()}`;
                if (selectedAcc) query += `&account_id=${selectedAcc}`;
                if (selectedType) query += `&type=${selectedType}`;

                const res = await fetch(query);
                const data = await res.json();
                window.allCashbookData = data;
                
                // 3. Compute stats
                let totalIn = 0;
                let totalOut = 0;
                let balanceCompany = 0;
                let balancePersonal = 0;

                // Tính tổng từ danh sách tài khoản cho chính xác
                window.allPaymentAccounts.forEach(a => {
                    if (a.owner_type === 'COMPANY') {
                        balanceCompany += (a.current_balance || 0);
                    } else {
                        balancePersonal += (a.current_balance || 0);
                    }
                });

                data.forEach(c => {
                    const amt = c.amount || 0;
                    if (c.type === 'in' || c.type === 'THU') {
                        totalIn += amt;
                    } else {
                        totalOut += amt;
                    }
                });

                const elIn = document.getElementById('cashbook-stat-total-in');
                if (elIn) elIn.innerText = formatMoney(totalIn);
                const elOut = document.getElementById('cashbook-stat-total-out');
                if (elOut) elOut.innerText = formatMoney(totalOut);
                const elCty = document.getElementById('cashbook-stat-balance-company');
                if (elCty) elCty.innerText = formatMoney(balanceCompany);
                const elPer = document.getElementById('cashbook-stat-balance-personal');
                if (elPer) elPer.innerText = formatMoney(balancePersonal);

                renderCashbookTable(data);
            } catch (err) {
                console.error("Lỗi tải sổ quỹ:", err);
            }
        }

        function filterCashbookByAccount(accId) {
            const filterAccSelect = document.getElementById('cashbook-filter-account');
            if (filterAccSelect) {
                filterAccSelect.value = accId;
                loadCashbook();
            }
        }

        function renderCashbookTable(list) {
            const tbody = document.getElementById('table-cashbook');
            if (!tbody) return;
            if (!list || list.length === 0) {
                tbody.innerHTML = '<tr><td colspan="8" class="text-center py-8 text-gray-400">Chưa có bản ghi thu chi nào.</td></tr>';
                return;
            }

            tbody.innerHTML = list.map(c => {
                const isThu = c.type === 'in' || c.type === 'THU';
                const ownerType = c.account_owner_type || c.fund_source || 'COMPANY';
                const isCty = ownerType === 'COMPANY';
                const accLabel = c.account_name || (isCty ? '🏢 Quỹ Cty' : '👤 Quỹ Cá Nhân');
                const accCode = c.account_code ? `<span class="font-mono text-[10px] text-gray-400 block">${c.account_code}</span>` : '';

                return `
                    <tr class="border-b hover:bg-slate-50 transition">
                        <td class="p-2.5 font-mono text-xs font-bold text-slate-800">${c.code || '-'}</td>
                        <td class="p-2.5">
                            <div class="flex items-center gap-1.5">
                                <span class="px-1.5 py-0.5 rounded text-[10px] font-bold ${isCty ? 'bg-blue-50 text-blue-700 border border-blue-200' : 'bg-purple-50 text-purple-700 border border-purple-200'}">
                                    ${isCty ? 'Cty' : 'Cá nhân'}
                                </span>
                                <span class="font-semibold text-slate-700 text-xs">${accLabel}</span>
                            </div>
                            ${accCode}
                        </td>
                        <td class="p-2.5 text-center">
                            <span class="px-2 py-0.5 rounded text-[11px] font-bold ${isThu ? 'bg-emerald-100 text-emerald-800' : 'bg-rose-100 text-rose-800'}">
                                ${isThu ? '🟢 Thu' : '🔴 Chi'}
                            </span>
                        </td>
                        <td class="p-2.5 font-semibold text-slate-700">${c.category || '-'}</td>
                        <td class="p-2.5 text-slate-600 font-medium">${c.contact_name || '-'}</td>
                        <td class="p-2.5 text-right font-mono font-bold text-xs ${isThu ? 'text-emerald-600' : 'text-rose-600'}">
                            ${isThu ? '+' : '-'}${formatMoney(c.amount || 0)}
                        </td>
                        <td class="p-2.5 text-slate-500 text-xs max-w-[200px] truncate" title="${c.note || ''}">${c.note || '-'}</td>
                        <td class="p-2.5 text-xs text-gray-400 font-mono">${c.created_at || '-'}</td>
                    </tr>
                `;
            }).join('');
        }

        function filterCashbookTable() {
            const query = (document.getElementById('cashbook-filter-search')?.value || '').trim().toLowerCase();
            if (!query) {
                renderCashbookTable(window.allCashbookData);
                return;
            }
            const filtered = window.allCashbookData.filter(c => {
                const code = (c.code || '').toLowerCase();
                const cat = (c.category || '').toLowerCase();
                const note = (c.note || '').toLowerCase();
                const contact = (c.contact_name || '').toLowerCase();
                const acc = (c.account_name || '').toLowerCase();
                return code.includes(query) || cat.includes(query) || note.includes(query) || contact.includes(query) || acc.includes(query);
            });
            renderCashbookTable(filtered);
        }

        // --- Modal Lập Phiếu Thu / Chi Thủ Công ---
        async function openCreateCashModal(type = 'in') {
            try {
                // 1. Tải danh sách tài khoản
                const accRes = await fetch('/api/payment-accounts?_t=' + Date.now());
                const accounts = await accRes.json();
                window.allPaymentAccounts = accounts;

                const accSelect = document.getElementById('cash-account-select');
                if (accSelect) {
                    accSelect.innerHTML = accounts.map(a => {
                        const ownerBadge = a.owner_type === 'COMPANY' ? '[Quỹ Cty]' : '[Quỹ Cá Nhân]';
                        return `<option value="${a.id}" ${a.is_default ? 'selected' : ''}>${a.code} - ${a.name} ${ownerBadge} (Số dư: ${formatMoney(a.current_balance || 0)})</option>`;
                    }).join('');
                }

                // 2. Tải danh sách đối tác
                const custRes = await fetch('/api/contacts?_t=' + Date.now());
                const contacts = await custRes.json();
                const contactSelect = document.getElementById('cash-contact-select');
                if (contactSelect) {
                    let cOpts = '<option value="">-- Không chọn đối tác --</option>';
                    contacts.forEach(ct => {
                        const typeBadge = ct.type === 'customer' ? '[Khách]' : '[NCC]';
                        cOpts += `<option value="${ct.id}">${typeBadge} ${ct.name} (${ct.phone || 'Không SĐT'})</option>`;
                    });
                    contactSelect.innerHTML = cOpts;
                }

                // 3. Reset form
                document.getElementById('cash-amount-input').value = '';
                document.getElementById('cash-category-input').value = '';
                document.getElementById('cash-note-input').value = '';

                // 4. Set loại phiếu
                await setCashModalType(type);

                document.getElementById('modal-create-cashbook')?.classList.remove('hidden');
            } catch (err) {
                console.error("Lỗi mở modal lập phiếu:", err);
                alert("Lỗi tải thông tin tài khoản!");
            }
        }

        async function setCashModalType(type) {
            document.getElementById('cash-type-val').value = type;
            const btnIn = document.getElementById('btn-cash-type-in');
            const btnOut = document.getElementById('btn-cash-type-out');
            const titleEl = document.getElementById('cash-modal-title');
            const iconEl = document.getElementById('cash-modal-icon');
            const btnSubmit = document.getElementById('btn-submit-cashbook');

            if (type === 'in') {
                btnIn.className = 'py-2 rounded-lg font-bold border text-center transition flex items-center justify-center gap-1.5 bg-emerald-50 border-emerald-500 text-emerald-700';
                btnOut.className = 'py-2 rounded-lg font-bold border text-center transition flex items-center justify-center gap-1.5 bg-slate-50 border-slate-200 text-slate-600';
                if (titleEl) titleEl.innerText = 'Lập Phiếu Thu Tiền (Vào)';
                if (iconEl) iconEl.innerText = '🟢';
                if (btnSubmit) {
                    btnSubmit.className = 'px-5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-bold shadow flex items-center gap-1.5';
                    btnSubmit.innerHTML = '<span>💾</span> <span>Xác Nhận Lưu Phiếu Thu</span>';
                }
            } else {
                btnOut.className = 'py-2 rounded-lg font-bold border text-center transition flex items-center justify-center gap-1.5 bg-rose-50 border-rose-500 text-rose-700';
                btnIn.className = 'py-2 rounded-lg font-bold border text-center transition flex items-center justify-center gap-1.5 bg-slate-50 border-slate-200 text-slate-600';
                if (titleEl) titleEl.innerText = 'Lập Phiếu Chi Tiền (Ra)';
                if (iconEl) iconEl.innerText = '🔴';
                if (btnSubmit) {
                    btnSubmit.className = 'px-5 py-2 bg-rose-600 hover:bg-rose-700 text-white rounded-lg text-xs font-bold shadow flex items-center gap-1.5';
                    btnSubmit.innerHTML = '<span>💾</span> <span>Xác Nhận Lưu Phiếu Chi</span>';
                }
            }

            // Gợi ý mã tiếp theo
            const prefix = type === 'in' ? 'PT-TT' : 'PC-CP';
            try {
                const res = await fetch(`/api/cashbook/next-code?prefix=${prefix}&_t=${Date.now()}`);
                const d = await res.json();
                const codeInput = document.getElementById('cash-code-input');
                if (codeInput) codeInput.value = d.code || '';
            } catch (e) {
                console.error("Lỗi lấy mã gợi ý:", e);
            }
        }

        function closeCreateCashModal() {
            document.getElementById('modal-create-cashbook')?.classList.add('hidden');
        }

        async function submitCreateCashbook() {
            const type = document.getElementById('cash-type-val').value;
            const accountId = parseInt(document.getElementById('cash-account-select').value);
            const code = document.getElementById('cash-code-input').value.trim();
            const amount = parseFloat(document.getElementById('cash-amount-input').value);
            const category = document.getElementById('cash-category-input').value.trim();
            const contactIdVal = document.getElementById('cash-contact-select').value;
            const contactId = contactIdVal ? parseInt(contactIdVal) : null;
            const note = document.getElementById('cash-note-input').value.trim();

            if (!amount || amount <= 0) {
                alert('Vui lòng nhập số tiền hợp lệ (> 0)!');
                document.getElementById('cash-amount-input').focus();
                return;
            }
            if (!category) {
                alert('Vui lòng chọn hoặc nhập hạng mục thu/chi!');
                document.getElementById('cash-category-input').focus();
                return;
            }

            const payload = {
                code: code || null,
                type: type,
                category: category,
                amount: amount,
                account_id: accountId || null,
                contact_id: contactId,
                ref_type: 'manual',
                note: note
            };

            try {
                const res = await fetch('/api/cashbook', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(payload)
                });
                const result = await res.json();
                if (!res.ok) {
                    throw new Error(result.detail || 'Lỗi lưu phiếu thu chi');
                }
                closeCreateCashModal();
                alert(`✅ Đã lập thành công phiếu ${type === 'in' ? 'thu' : 'chi'} [${result.code}]!`);
                await loadCashbook();
            } catch (err) {
                console.error(err);
                alert(`❌ Thao tác thất bại: ${err.message}`);
            }
        }

        // --- Modal Quản Lý Danh Mục Tài Khoản Thanh Toán ---
        async function openPaymentAccountsModal() {
            try {
                const res = await fetch('/api/payment-accounts?_t=' + Date.now());
                const accounts = await res.json();
                window.allPaymentAccounts = accounts;

                const tbody = document.getElementById('table-payment-accounts-body');
                if (tbody) {
                    tbody.innerHTML = accounts.map(a => {
                        const isBank = a.account_type === 'bank';
                        const isCty = a.owner_type === 'COMPANY';
                        const icon = isBank ? '🏦' : (a.account_type === 'ewallet' ? '📱' : '💵');
                        const bankInfo = isBank 
                            ? `<span class="font-bold text-slate-800">${a.bank_name || '-'}</span> - STK: <span class="font-mono font-bold">${a.account_number || '-'}</span> (${a.account_holder || '-'})`
                            : `<span class="text-gray-400 italic">Tiền mặt / không có STK</span>`;

                        return `
                            <tr class="border-b hover:bg-slate-50 transition">
                                <td class="p-2.5 font-mono font-bold text-xs text-indigo-700">${a.code}</td>
                                <td class="p-2.5 font-bold text-slate-800 flex items-center gap-1.5">
                                    <span>${icon}</span>
                                    <span>${a.name}</span>
                                    ${a.is_default ? '<span class="bg-amber-100 text-amber-800 text-[10px] px-1.5 py-0.5 rounded font-bold">Mặc định</span>' : ''}
                                </td>
                                <td class="p-2.5 text-center">
                                    <span class="px-2 py-0.5 rounded text-[10px] font-bold ${isCty ? 'bg-blue-100 text-blue-700' : 'bg-purple-100 text-purple-700'}">
                                        ${isCty ? '🏢 Quỹ Cty' : '👤 Cá Nhân'}
                                    </span>
                                </td>
                                <td class="p-2.5 text-xs text-slate-600">${bankInfo}</td>
                                <td class="p-2.5 text-right font-mono font-bold text-xs ${a.current_balance >= 0 ? 'text-emerald-700' : 'text-rose-600'}">
                                    ${formatMoney(a.current_balance || 0)}
                                </td>
                                <td class="p-2.5 text-center">
                                    <button onclick="openEditPaymentAccountModal(${a.id})" class="text-sky-600 hover:text-sky-800 font-bold text-xs px-2 py-1 rounded hover:bg-sky-50">Sửa</button>
                                </td>
                            </tr>
                        `;
                    }).join('');
                }

                document.getElementById('modal-payment-accounts')?.classList.remove('hidden');
            } catch (err) {
                console.error(err);
                alert("Lỗi tải danh mục tài khoản!");
            }
        }

        function closePaymentAccountsModal() {
            document.getElementById('modal-payment-accounts')?.classList.add('hidden');
        }

        function openEditPaymentAccountModal(accId = null) {
            document.getElementById('edit-account-id').value = accId || '';
            const titleEl = document.getElementById('account-modal-title');
            
            if (accId) {
                if (titleEl) titleEl.innerText = 'Cập Nhật Tài Khoản Thanh Toán';
                const acc = window.allPaymentAccounts.find(x => x.id === accId);
                if (acc) {
                    document.getElementById('acc-code-input').value = acc.code || '';
                    document.getElementById('acc-name-input').value = acc.name || '';
                    document.getElementById('acc-type-select').value = acc.account_type || 'cash';
                    document.getElementById('acc-bank-name').value = acc.bank_name || '';
                    document.getElementById('acc-bank-number').value = acc.account_number || '';
                    document.getElementById('acc-bank-holder').value = acc.account_holder || '';
                    document.getElementById('acc-initial-balance').value = acc.initial_balance || 0;
                    document.getElementById('acc-is-default').checked = !!acc.is_default;
                    
                    const ownerRadios = document.getElementsByName('acc-owner-radio');
                    for (const r of ownerRadios) {
                        r.checked = (r.value === (acc.owner_type || 'COMPANY'));
                    }
                }
            } else {
                if (titleEl) titleEl.innerText = 'Thêm Tài Khoản Thanh Toán Mới';
                document.getElementById('acc-code-input').value = 'TK-' + Math.floor(100 + Math.random() * 900);
                document.getElementById('acc-name-input').value = '';
                document.getElementById('acc-type-select').value = 'bank';
                document.getElementById('acc-bank-name').value = '';
                document.getElementById('acc-bank-number').value = '';
                document.getElementById('acc-bank-holder').value = '';
                document.getElementById('acc-initial-balance').value = '0';
                document.getElementById('acc-is-default').checked = false;
            }

            toggleAccountBankFields();
            document.getElementById('modal-edit-payment-account')?.classList.remove('hidden');
        }

        function closeEditPaymentAccountModal() {
            document.getElementById('modal-edit-payment-account')?.classList.add('hidden');
        }

        function toggleAccountBankFields() {
            const type = document.getElementById('acc-type-select').value;
            const bankFields = document.getElementById('acc-bank-fields');
            if (bankFields) {
                if (type === 'bank') {
                    bankFields.classList.remove('hidden');
                } else {
                    bankFields.classList.add('hidden');
                }
            }
        }

        async function savePaymentAccount() {
            const id = document.getElementById('edit-account-id').value;
            const code = document.getElementById('acc-code-input').value.trim().toUpperCase();
            const name = document.getElementById('acc-name-input').value.trim();
            const accountType = document.getElementById('acc-type-select').value;
            let ownerType = 'COMPANY';
            const ownerRadios = document.getElementsByName('acc-owner-radio');
            for (const r of ownerRadios) {
                if (r.checked) ownerType = r.value;
            }
            const bankName = document.getElementById('acc-bank-name').value.trim();
            const accountNumber = document.getElementById('acc-bank-number').value.trim();
            const accountHolder = document.getElementById('acc-bank-holder').value.trim();
            const initialBalance = parseFloat(document.getElementById('acc-initial-balance').value) || 0;
            const isDefault = document.getElementById('acc-is-default').checked ? 1 : 0;

            if (!code || !name) {
                alert('Vui lòng nhập đầy đủ Mã và Tên tài khoản!');
                return;
            }

            const payload = {
                code, name,
                account_type: accountType,
                owner_type: ownerType,
                bank_name: bankName,
                account_number: accountNumber,
                account_holder: accountHolder,
                initial_balance: initialBalance,
                is_default: isDefault
            };

            try {
                const url = id ? `/api/payment-accounts/${id}` : '/api/payment-accounts';
                const method = id ? 'PUT' : 'POST';
                const res = await fetch(url, {
                    method: method,
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(payload)
                });
                const result = await res.json();
                if (!res.ok) throw new Error(result.detail || 'Lỗi lưu tài khoản');

                closeEditPaymentAccountModal();
                alert(`✅ Đã lưu tài khoản ${name}!`);
                await openPaymentAccountsModal();
                await loadCashbook();
            } catch (err) {
                alert(`❌ Thao tác thất bại: ${err.message}`);
            }
        }

        // Bao cao
        async function loadReports() {
            const res = await fetch('/api/reports/summary');
            const d = await res.json();
            document.getElementById('rep-revenue').innerText = formatMoney(d.revenue);
            document.getElementById('rep-cash').innerText = formatMoney(d.cash_balance);
            document.getElementById('rep-cust-debt').innerText = formatMoney(d.customer_debt);
            document.getElementById('rep-comm').innerText = formatMoney(d.commission_paid);
        }

        // Cai dat & Mau in
        let currentSettings = {};

        async function loadCompanySettings() {
            const res = await fetch('/api/settings');
            currentSettings = await res.json();
            
            const appName = currentSettings.app_name || '⚡ POS Offline';
            const appNameInput = document.getElementById('comp-app-name');
            if (appNameInput) appNameInput.value = appName;
            updateAppTitleUI(appName);

            document.getElementById('comp-name').value = currentSettings.shop_name || '';
            document.getElementById('comp-address').value = currentSettings.shop_address || '';
            document.getElementById('comp-phone').value = currentSettings.shop_phone || '';
            document.getElementById('comp-footer').value = currentSettings.shop_footer || '';
            document.getElementById('comp-bank-code').value = currentSettings.shop_bank_code || 'MB';
            document.getElementById('comp-bank-account').value = currentSettings.shop_bank_account || '';
            document.getElementById('comp-bank-owner').value = currentSettings.shop_bank_owner || '';
            document.getElementById('comp-qr-mode').value = currentSettings.shop_qr_mode || 'vietqr';
            
            if (currentSettings.shop_logo) {
                const img = document.getElementById('comp-logo-preview');
                img.src = currentSettings.shop_logo;
                img.classList.remove('hidden');
            }
            if (currentSettings.shop_qr_image) {
                const img = document.getElementById('comp-qr-preview');
                img.src = currentSettings.shop_qr_image;
                img.classList.remove('hidden');
            }
            toggleQRModeUI();
        }

        function updateAppTitleUI(name) {
            if (!name) name = '⚡ POS Offline';
            const sidebarEl = document.getElementById('sidebar-app-name');
            if (sidebarEl) sidebarEl.textContent = name;
            document.title = name;
        }

        function toggleQRModeUI() {
            const mode = document.getElementById('comp-qr-mode').value;
            if (mode === 'vietqr') {
                document.getElementById('panel-vietqr').classList.remove('hidden');
                document.getElementById('panel-static-qr').classList.add('hidden');
            } else {
                document.getElementById('panel-vietqr').classList.add('hidden');
                document.getElementById('panel-static-qr').classList.remove('hidden');
            }
        }

        function previewUploadImage(input, previewId) {
            if (input.files && input.files[0]) {
                const reader = new FileReader();
                reader.onload = function(e) {
                    const img = document.getElementById(previewId);
                    img.src = e.target.result;
                    img.classList.remove('hidden');
                };
                reader.readAsDataURL(input.files[0]);
            }
        }

        async function saveCompanySettings() {
            const logoImg = document.getElementById('comp-logo-preview');
            const qrImg = document.getElementById('comp-qr-preview');
            const appName = (document.getElementById('comp-app-name')?.value || '').trim() || '⚡ POS Offline';
            const payload = {
                app_name: appName,
                shop_name: document.getElementById('comp-name').value,
                shop_address: document.getElementById('comp-address').value,
                shop_phone: document.getElementById('comp-phone').value,
                shop_footer: document.getElementById('comp-footer').value,
                shop_bank_code: document.getElementById('comp-bank-code').value,
                shop_bank_account: document.getElementById('comp-bank-account').value,
                shop_bank_owner: document.getElementById('comp-bank-owner').value,
                shop_qr_mode: document.getElementById('comp-qr-mode').value,
                shop_logo: !logoImg.classList.contains('hidden') ? logoImg.src : '',
                shop_qr_image: !qrImg.classList.contains('hidden') ? qrImg.src : ''
            };
            const res = await fetch('/api/settings/company', {
                method: 'POST',
                headers: {'Content-Type': 'application/json'},
                body: JSON.stringify(payload)
            });
            if (res.ok) {
                alert('✅ Đã lưu thông tin doanh nghiệp, tên ứng dụng & cấu hình QR!');
                updateAppTitleUI(appName);
                Object.assign(currentSettings, payload);
            } else {
                alert('Lỗi lưu thông tin!');
            }
        }

        // ========================================================
        // LOGIC QUẢN LÝ NGUYÊN LIỆU & COST VỐN (BOM)
        // ========================================================
        let costIngredients = [];
        let currentBOMData = null;

        async function initCostManagement() {
            await Promise.all([loadCostWarehouses(), loadCostIngredients(), loadCostProductOptions()]);
        }

        async function loadCostWarehouses() {
            try {
                const res = await fetch('/api/warehouses');
                const whs = await res.json();
                const sel = document.getElementById('cost-wh-filter');
                if (sel) {
                    sel.innerHTML = '<option value="">Tất cả kho</option>' + 
                        whs.map(w => `<option value="${w.id}">${w.name}</option>`).join('');
                }
            } catch (e) {
                console.error(e);
            }
        }

        async function loadCostIngredients() {
            try {
                const whId = document.getElementById('cost-wh-filter')?.value || '';
                let url = '/api/ingredients';
                if (whId) url += `?warehouse_id=${whId}`;

                const res = await fetch(url);
                costIngredients = await res.json();
                
                const tbody = document.getElementById('table-cost-ingredients');
                if (!tbody) return;

                if (costIngredients.length === 0) {
                    tbody.innerHTML = '<tr><td colspan="8" class="p-3 text-center text-gray-400">Không có nguyên liệu nào trong kho này</td></tr>';
                    return;
                }

                tbody.innerHTML = costIngredients.map(ing => `
                    <tr class="border-b hover:bg-gray-50">
                        <td class="p-2 font-mono font-bold text-slate-700">${ing.code || '-'}</td>
                        <td class="p-2 font-medium text-slate-800">${ing.name}</td>
                        <td class="p-2 text-center">
                            <span class="px-2 py-0.5 rounded text-[10px] font-bold ${ing.type === 'SERVICE' ? 'bg-indigo-100 text-indigo-700' : 'bg-emerald-100 text-emerald-700'}">
                                ${ing.type === 'SERVICE' ? 'Dịch vụ' : 'Vật lý'}
                            </span>
                        </td>
                        <td class="p-2">
                            ${ing.supplier_names 
                                ? ing.supplier_names.split(',').map(s => `<span class="inline-block bg-slate-100 text-slate-700 border border-slate-200 text-[10px] font-medium px-1.5 py-0.5 rounded mr-1 mb-0.5">🏭 ${s.trim()}</span>`).join('')
                                : '<span class="text-gray-400 italic text-xs">---</span>'}
                        </td>
                        <td class="p-2 text-right font-bold ${ing.type === 'SERVICE' ? 'text-gray-400' : (ing.total_stock <= 5 ? 'text-rose-600' : 'text-slate-700')}">
                            ${ing.type === 'SERVICE' ? '-' : ing.total_stock}
                        </td>
                        <td class="p-2 text-gray-500">${ing.unit}</td>
                        <td class="p-2 text-right font-medium text-slate-700">${formatMoney(ing.latest_cost)}</td>
                        <td class="p-2 text-center space-x-1 whitespace-nowrap">
                            <button onclick="viewIngredientDetail(${ing.id})" class="text-xs bg-sky-50 text-sky-600 border border-sky-200 px-2 py-0.5 rounded hover:bg-sky-100 font-medium" title="Xem chi tiết biến động & lịch sử giá">🔍 Chi tiết</button>
                            <button onclick="openModalEditIngredient(${ing.id})" class="text-xs bg-amber-50 text-amber-600 border border-amber-200 px-2 py-0.5 rounded hover:bg-amber-100 font-medium" title="Chỉnh sửa thông tin nguyên liệu">✏️ Sửa</button>
                            <button onclick="deleteIngredientItem(${ing.id}, '${encodeURIComponent(ing.name)}')" class="text-xs bg-rose-50 text-rose-600 border border-rose-200 px-2 py-0.5 rounded hover:bg-rose-100 font-medium" title="Xóa nguyên liệu này">🗑️ Xóa</button>
                        </td>
                    </tr>
                `).join('');
            } catch (e) {
                console.error(e);
            }
        }

        async function loadCostProductOptions() {
            const res = await fetch('/api/products');
            allBOMProductsList = await res.json();
            renderBOMSelectedChips();
        }

        function showBOMProductDropdown() {
            const dd = document.getElementById('bom-prod-dropdown-list');
            if (dd) dd.classList.remove('hidden');
            filterBOMProductDropdown();
        }

        function hideBOMProductDropdown() {
            const dd = document.getElementById('bom-prod-dropdown-list');
            if (dd) dd.classList.add('hidden');
        }

        // Tự động đóng dropdown khi bấm ra ngoài
        document.addEventListener('click', function(event) {
            const wrapper = document.getElementById('bom-prod-combobox-wrapper');
            if (wrapper && !wrapper.contains(event.target)) {
                hideBOMProductDropdown();
            }
        });

        function filterBOMProductDropdown() {
            const dd = document.getElementById('bom-prod-dropdown-list');
            const search = (document.getElementById('bom-prod-search-input')?.value || '').toLowerCase().trim();
            if (!dd) return;

            const filtered = allBOMProductsList.filter(p => {
                const text = `${p.code || ''} ${p.name || ''}`.toLowerCase();
                return text.includes(search);
            });

            if (filtered.length === 0) {
                dd.innerHTML = '<div class="p-3 text-center text-gray-400">Không tìm thấy sản phẩm nào</div>';
                return;
            }

            dd.innerHTML = filtered.map(p => {
                const isChecked = selectedBOMProductIds.includes(p.id);
                return `
                    <div class="p-2 hover:bg-sky-50 flex items-center justify-between cursor-pointer" onclick="toggleSelectBOMProduct(${p.id})">
                        <div class="flex items-center gap-2">
                            <input type="checkbox" ${isChecked ? 'checked' : ''} class="rounded pointer-events-none text-sky-600">
                            <div>
                                <span class="font-bold text-slate-800">${p.name}</span>
                                <span class="font-mono text-slate-500 ml-1">(${p.code || '-'})</span>
                            </div>
                        </div>
                        <span class="font-semibold text-sky-600">${formatMoney(p.sell_price)}</span>
                    </div>
                `;
            }).join('');
        }

        function toggleSelectBOMProduct(productId) {
            const idx = selectedBOMProductIds.indexOf(productId);
            if (idx > -1) {
                selectedBOMProductIds.splice(idx, 1);
            } else {
                selectedBOMProductIds.push(productId);
            }
            renderBOMSelectedChips();
            filterBOMProductDropdown();
            hideBOMProductDropdown(); // Ẩn dropdown ngay sau khi chọn

            const searchInput = document.getElementById('bom-prod-search-input');
            if (searchInput) searchInput.value = ''; // Reset ô tìm kiếm

            if (selectedBOMProductIds.length > 0) {
                // Tải BOM của sản phẩm đầu tiên hoặc mới nhất trong danh sách
                const targetId = selectedBOMProductIds[selectedBOMProductIds.length - 1];
                loadProductBOMDetails(targetId);
            } else {
                loadProductBOMDetails(null);
            }
        }

        function removeSelectedBOMProduct(productId) {
            selectedBOMProductIds = selectedBOMProductIds.filter(id => id !== productId);
            renderBOMSelectedChips();
            filterBOMProductDropdown();
            if (selectedBOMProductIds.length > 0) {
                loadProductBOMDetails(selectedBOMProductIds[selectedBOMProductIds.length - 1]);
            } else {
                loadProductBOMDetails(null);
            }
        }

        function renderBOMSelectedChips() {
            const container = document.getElementById('bom-selected-products-chips');
            if (!container) return;

            if (selectedBOMProductIds.length === 0) {
                container.innerHTML = '<span class="text-[11px] text-gray-400 italic">Chưa chọn sản phẩm nào (Bấm ô tìm kiếm để chọn nhiều sản phẩm)</span>';
                return;
            }

            container.innerHTML = selectedBOMProductIds.map(id => {
                const prod = allBOMProductsList.find(p => p.id === id);
                if (!prod) return '';
                return `
                    <span class="inline-flex items-center gap-1 bg-sky-100 text-sky-800 border border-sky-200 text-xs px-2 py-0.5 rounded-full font-bold">
                        <span>${prod.name}</span>
                        <button onclick="removeSelectedBOMProduct(${id})" class="text-sky-600 hover:text-rose-600 ml-1 font-black">×</button>
                    </span>
                `;
            }).join('');
        }

        async function loadProductBOMDetails(productId) {
            if (!productId) {
                document.getElementById('cost-summary-card').classList.add('hidden');
                document.getElementById('table-product-bom-items').innerHTML = '<tr><td colspan="4" class="p-3 text-center text-gray-400">Chưa chọn sản phẩm nào</td></tr>';
                currentBOMData = null;
                return;
            }

            try {
                const res = await fetch(`/api/products/${productId}/bom`);
                currentBOMData = await res.json();
                
                document.getElementById('cost-summary-card').classList.remove('hidden');
                document.getElementById('cost-sum-sell').textContent = formatMoney(currentBOMData.sell_price);
                document.getElementById('cost-sum-cost').textContent = formatMoney(currentBOMData.cost_price);
                document.getElementById('cost-sum-margin').textContent = formatMoney(currentBOMData.profit_margin);

                const tbody = document.getElementById('table-product-bom-items');
                if (currentBOMData.bom_items.length === 0) {
                    tbody.innerHTML = '<tr><td colspan="4" class="p-3 text-center text-gray-400">Chưa có thành phần nào trong BOM</td></tr>';
                    return;
                }

                tbody.innerHTML = currentBOMData.bom_items.map(item => `
                    <tr class="border-b hover:bg-gray-50">
                        <td class="p-1.5 font-medium">${item.ingredient_name}</td>
                        <td class="p-1.5 text-right font-mono">
                            <div class="flex items-center justify-end gap-1">
                                <input type="number" step="any" min="0.0001" value="${item.quantity}" 
                                       class="w-20 border rounded px-1.5 py-0.5 text-right font-mono font-bold text-slate-800 focus:ring-1 focus:ring-sky-500 text-xs bg-white shadow-inner" 
                                       onchange="updateSingleBOMItemQty(${item.ingredient_id}, this.value)" 
                                       title="Chỉnh sửa định lượng tiêu hao và bấm Enter / ra ngoài để lưu">
                                <span class="text-[11px] text-gray-500 font-medium">${item.unit}</span>
                            </div>
                        </td>
                        <td class="p-1.5 text-right text-rose-600 font-medium">${formatMoney(item.line_cost)}</td>
                        <td class="p-1.5 text-center">
                            <button onclick="removeBOMItem(${item.ingredient_id})" class="text-red-500 hover:text-red-700 font-bold p-1 rounded hover:bg-red-50" title="Xóa nguyên liệu này khỏi BOM">🗑️</button>
                        </td>
                    </tr>
                `).join('');
            } catch (e) {
                console.error(e);
            }
        }

        async function updateSingleBOMItemQty(ingredientId, newQty) {
            const targetIds = [...selectedBOMProductIds];
            if (targetIds.length === 0) return;
            const qty = parseFloat(newQty);
            if (isNaN(qty) || qty <= 0) {
                alert('Định lượng tiêu hao phải lớn hơn 0!');
                await loadProductBOMDetails(targetIds[targetIds.length - 1]);
                return;
            }

            for (const prodId of targetIds) {
                try {
                    await fetch(`/api/products/${prodId}/bom/${ingredientId}`, {
                        method: 'PUT',
                        headers: {'Content-Type': 'application/json'},
                        body: JSON.stringify({ quantity: qty })
                    });
                } catch (err) {
                    console.error('Lỗi update BOM:', err);
                }
            }

            await loadProductBOMDetails(targetIds[targetIds.length - 1]);
            await loadUnifiedInventory();
        }

        function openModalAddIngredient() {
            document.getElementById('modal-ing-title').innerText = 'Thêm Nguyên Liệu / Dịch Vụ Mới';
            document.getElementById('btn-save-ing').innerText = 'Lưu Thành Phần';
            document.getElementById('modal-ing-id').value = '';
            document.getElementById('modal-ing-code').value = '';
            document.getElementById('modal-ing-name').value = '';
            document.getElementById('modal-ing-unit').value = 'kg';
            document.getElementById('modal-ing-type').value = 'IS_PHYSICAL';
            document.getElementById('modal-ing-stock').value = '0';
            document.getElementById('modal-ing-cost').value = '0';
            document.getElementById('modal-ing-stock-group').classList.remove('hidden');
            document.getElementById('modal-ingredient').classList.remove('hidden');
        }

        function openModalEditIngredient(id) {
            const ing = costIngredients.find(x => x.id === id);
            if (!ing) return alert('Không tìm thấy thông tin nguyên liệu!');

            document.getElementById('modal-ing-title').innerText = 'Chỉnh Sửa Nguyên Liệu / Dịch Vụ';
            document.getElementById('btn-save-ing').innerText = 'Cập Nhật';
            document.getElementById('modal-ing-id').value = ing.id;
            document.getElementById('modal-ing-code').value = ing.code || '';
            document.getElementById('modal-ing-name').value = ing.name || '';
            document.getElementById('modal-ing-unit').value = ing.unit || 'cái';
            document.getElementById('modal-ing-type').value = ing.type || 'IS_PHYSICAL';
            document.getElementById('modal-ing-cost').value = ing.latest_cost || 0;
            
            // Khi sửa thì ẩn ô tồn ban đầu để tránh sai lệch thẻ kho
            document.getElementById('modal-ing-stock-group').classList.add('hidden');
            document.getElementById('modal-ingredient').classList.remove('hidden');
        }

        function closeModalIngredient() {
            document.getElementById('modal-ingredient').classList.add('hidden');
        }

        async function saveIngredient() {
            const id = document.getElementById('modal-ing-id').value;
            const name = document.getElementById('modal-ing-name').value.trim();
            if (!name) return alert('Vui lòng nhập tên nguyên liệu!');

            const code = document.getElementById('modal-ing-code').value.trim() || null;
            const unit = document.getElementById('modal-ing-unit').value.trim() || 'cái';
            const type = document.getElementById('modal-ing-type').value;
            const cost = parseFloat(document.getElementById('modal-ing-cost').value) || 0;

            if (id) {
                // Cập nhật nguyên liệu hiện có
                const payload = {
                    code: code,
                    name: name,
                    unit: unit,
                    type: type,
                    latest_cost: cost
                };
                const res = await fetch(`/api/ingredients/${id}`, {
                    method: 'PUT',
                    headers: {'Content-Type': 'application/json'},
                    body: JSON.stringify(payload)
                });
                if (res.ok) {
                    closeModalIngredient();
                    await loadCostIngredients();
                    await loadUnifiedInventory();
                    alert('Đã cập nhật thông tin nguyên liệu thành công!');
                } else {
                    const err = await res.json();
                    alert('Lỗi: ' + (err.detail || 'Không thể cập nhật nguyên liệu'));
                }
            } else {
                // Thêm mới
                const payload = {
                    code: code,
                    name: name,
                    unit: unit,
                    type: type,
                    initial_stock: parseFloat(document.getElementById('modal-ing-stock').value) || 0,
                    initial_cost: cost,
                    warehouse_id: 1
                };
                const res = await fetch('/api/ingredients', {
                    method: 'POST',
                    headers: {'Content-Type': 'application/json'},
                    body: JSON.stringify(payload)
                });
                if (res.ok) {
                    closeModalIngredient();
                    await loadCostIngredients();
                    await loadUnifiedInventory();
                    alert('Đã thêm nguyên liệu thành công!');
                } else {
                    const err = await res.json();
                    alert('Lỗi: ' + (err.detail || 'Không thể tạo nguyên liệu'));
                }
            }
        }

        // Alias for backward compatibility
        const saveNewIngredient = saveIngredient;

        // --- XUẤT VÀ NHẬP EXCEL CHO NGUYÊN LIỆU ---
        function exportIngredientsExcel() {
            const whId = document.getElementById('cost-wh-filter')?.value || '';
            let url = '/api/ingredients/export-excel';
            if (whId) url += `?warehouse_id=${whId}`;
            window.location.href = url;
        }

        function openModalImportIngredients() {
            const modal = document.getElementById('modal-import-ingredients');
            if (!modal) return;
            const whSel = document.getElementById('import-ing-warehouse');
            if (whSel && typeof allWarehouses !== 'undefined' && allWarehouses.length > 0) {
                whSel.innerHTML = allWarehouses.map(w => `<option value="${w.id}">${w.name}</option>`).join('');
            }
            const currentWh = document.getElementById('cost-wh-filter')?.value;
            if (currentWh && whSel) {
                whSel.value = currentWh;
            }
            document.getElementById('import-ing-file-input').value = '';
            const statusBox = document.getElementById('import-ing-status');
            if (statusBox) {
                statusBox.className = 'hidden';
                statusBox.innerText = '';
            }
            modal.classList.remove('hidden');
        }

        function closeModalImportIngredients() {
            document.getElementById('modal-import-ingredients')?.classList.add('hidden');
        }

        async function submitImportIngredients() {
            const fileInput = document.getElementById('import-ing-file-input');
            const file = fileInput?.files?.[0];
            if (!file) return alert('Vui lòng chọn 1 file Excel (.xlsx) hoặc CSV để nhập!');

            const whId = document.getElementById('import-ing-warehouse')?.value || 1;
            const btn = document.getElementById('btn-do-import-ing');
            const statusBox = document.getElementById('import-ing-status');

            btn.disabled = true;
            btn.innerText = '⏳ Đang xử lý...';
            statusBox.className = 'text-xs p-2 rounded bg-teal-50 text-teal-800 border border-teal-200 block';
            statusBox.innerText = 'Đang đọc và đồng bộ nguyên liệu vào hệ thống...';

            const formData = new FormData();
            formData.append('file', file);

            try {
                const res = await fetch(`/api/ingredients/import-excel?warehouse_id=${whId}`, {
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
                    closeModalImportIngredients();
                    await loadCostIngredients();
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

        // --- XUẤT VÀ NHẬP EXCEL CHO ĐỊNH LƯỢNG BOM ---
        function exportBOMExcel() {
            const prodId = getActiveBOMTargetId();
            let url = '/api/bom/export-excel';
            if (prodId) {
                if (confirm(`Bạn có muốn xuất riêng định lượng BOM của sản phẩm đang chọn không?\n(Bấm OK để chỉ xuất sản phẩm này, hoặc bấm Cancel để xuất TOÀN BỘ định lượng BOM tất cả sản phẩm)`)) {
                    url += `?product_id=${prodId}`;
                }
            }
            window.location.href = url;
        }

        function openModalImportBOM() {
            const modal = document.getElementById('modal-import-bom');
            if (!modal) return;
            document.getElementById('import-bom-file-input').value = '';
            const statusBox = document.getElementById('import-bom-status');
            if (statusBox) {
                statusBox.className = 'hidden';
                statusBox.innerText = '';
            }
            modal.classList.remove('hidden');
        }

        function closeModalImportBOM() {
            document.getElementById('modal-import-bom')?.classList.add('hidden');
        }

        async function submitImportBOM() {
            const fileInput = document.getElementById('import-bom-file-input');
            const file = fileInput?.files?.[0];
            if (!file) return alert('Vui lòng chọn 1 file Excel (.xlsx) hoặc CSV để nhập định lượng BOM!');

            const btn = document.getElementById('btn-do-import-bom');
            const statusBox = document.getElementById('import-bom-status');

            btn.disabled = true;
            btn.innerText = '⏳ Đang xử lý...';
            statusBox.className = 'text-xs p-2 rounded bg-indigo-50 text-indigo-800 border border-indigo-200 block';
            statusBox.innerText = 'Đang đọc file, thiết lập định lượng và tự động tính lại giá cost...';

            const formData = new FormData();
            formData.append('file', file);

            try {
                const res = await fetch(`/api/bom/import-excel`, {
                    method: 'POST',
                    body: formData
                });
                const data = await res.json();
                btn.disabled = false;
                btn.innerText = '🚀 Bắt đầu Nhập BOM';

                if (res.ok && data.success) {
                    let msg = `✅ Đã nhập thành công! Thiết lập: ${data.imported} định lượng cho ${data.products_updated} sản phẩm.`;
                    if (data.errors && data.errors.length > 0) {
                        msg += `\n⚠️ Có ${data.errors.length} dòng lỗi:\n` + data.errors.slice(0, 5).join('\n');
                    }
                    alert(msg);
                    closeModalImportBOM();
                    const activeId = getActiveBOMTargetId();
                    if (activeId) await loadProductBOMDetails(activeId);
                    await loadUnifiedInventory();
                } else {
                    statusBox.className = 'text-xs p-2 rounded bg-rose-50 text-rose-800 border border-rose-200 block';
                    statusBox.innerText = '❌ Lỗi: ' + (data.detail || 'Không thể nhập file');
                }
            } catch (e) {
                btn.disabled = false;
                btn.innerText = '🚀 Bắt đầu Nhập BOM';
                statusBox.className = 'text-xs p-2 rounded bg-rose-50 text-rose-800 border border-rose-200 block';
                statusBox.innerText = '❌ Lỗi mạng hoặc server: ' + e.message;
            }
        }

        function getActiveBOMTargetId() {
            if (selectedBOMProductIds.length === 0) return null;
            return selectedBOMProductIds[selectedBOMProductIds.length - 1];
        }

        function openModalAddBOMItem() {
            const prodId = getActiveBOMTargetId();
            if (!prodId) return alert('Vui lòng chọn ít nhất một sản phẩm trước!');
            
            clearSelectedBOMIngredient();
            document.getElementById('modal-bom-quantity').value = '';
            document.getElementById('modal-bom-item').classList.remove('hidden');
        }

        function closeModalBOMItem() {
            document.getElementById('modal-bom-item').classList.add('hidden');
        }

        function showBOMIngredientDropdown() {
            const dd = document.getElementById('bom-ing-dropdown-list');
            if (dd) dd.classList.remove('hidden');
            filterBOMIngredientDropdown();
        }

        function filterBOMIngredientDropdown() {
            const kw = (document.getElementById('bom-ing-search-input')?.value || '').toLowerCase().trim();
            const dd = document.getElementById('bom-ing-dropdown-list');
            if (!dd) return;

            const filtered = costIngredients.filter(ing => 
                (ing.code && ing.code.toLowerCase().includes(kw)) || 
                ing.name.toLowerCase().includes(kw)
            );

            if (filtered.length === 0) {
                dd.innerHTML = '<div class="p-2 text-gray-400 text-center">Không tìm thấy nguyên liệu nào</div>';
                return;
            }

            dd.innerHTML = filtered.map(ing => `
                <div onclick="selectBOMIngredient(${ing.id})" class="p-2 hover:bg-sky-50 cursor-pointer flex justify-between items-center">
                    <div>
                        <span class="font-bold text-slate-700">${ing.name}</span>
                        <span class="text-[10px] text-gray-400 font-mono ml-1">(${ing.code || '-'})</span>
                    </div>
                    <div class="text-right">
                        <span class="px-1.5 py-0.5 rounded text-[10px] font-bold ${ing.type === 'SERVICE' ? 'bg-indigo-100 text-indigo-700' : 'bg-emerald-100 text-emerald-700'}">${ing.type === 'SERVICE' ? 'Dịch vụ' : 'Vật lý'}</span>
                        <span class="text-xs text-gray-500 ml-1">ĐVT: ${ing.unit}</span>
                    </div>
                </div>
            `).join('');
        }

        function selectBOMIngredient(id) {
            const ing = costIngredients.find(x => x.id === id);
            if (!ing) return;
            document.getElementById('modal-bom-ing-id').value = ing.id;
            document.getElementById('bom-selected-ing-text').textContent = `${ing.name} (${ing.code || '-'}) - ĐVT: ${ing.unit}`;
            document.getElementById('bom-selected-ing-display').classList.remove('hidden');
            document.getElementById('bom-ing-combobox-wrapper').classList.add('hidden');
            document.getElementById('modal-bom-unit-hint').textContent = `Lưu ý nhập theo đúng ĐVT: ${ing.unit}`;
            document.getElementById('modal-bom-quantity').focus();
        }

        function clearSelectedBOMIngredient() {
            document.getElementById('modal-bom-ing-id').value = '';
            document.getElementById('bom-selected-ing-text').textContent = 'Chưa chọn';
            document.getElementById('bom-selected-ing-display').classList.add('hidden');
            document.getElementById('bom-ing-combobox-wrapper').classList.remove('hidden');
            const input = document.getElementById('bom-ing-search-input');
            if (input) input.value = '';
            const dd = document.getElementById('bom-ing-dropdown-list');
            if (dd) dd.classList.add('hidden');
            document.getElementById('modal-bom-unit-hint').textContent = 'Lưu ý nhập theo đúng ĐVT của nguyên liệu';
        }

        // Lắng nghe click ngoài combobox nguyên liệu để đóng
        document.addEventListener('click', function(e) {
            const wrapper = document.getElementById('bom-ing-combobox-wrapper');
            const dd = document.getElementById('bom-ing-dropdown-list');
            if (wrapper && dd && !wrapper.contains(e.target)) {
                dd.classList.add('hidden');
            }
        });

        async function addCurrentBOMItem() {
            const targetIds = [...selectedBOMProductIds];
            if (targetIds.length === 0) return alert('Vui lòng chọn sản phẩm trước!');

            const ingId = parseInt(document.getElementById('modal-bom-ing-id').value);
            const qty = parseFloat(document.getElementById('modal-bom-quantity').value);

            if (!ingId) return alert('Vui lòng chọn nguyên liệu / dịch vụ!');
            if (!qty || qty <= 0) return alert('Vui lòng nhập định lượng tiêu hao hợp lệ!');

            let currentItems = (currentBOMData ? currentBOMData.bom_items : []).map(b => ({
                ingredient_id: b.ingredient_id,
                quantity: b.quantity
            }));

            // Nếu đã có thì cập nhật số lượng, chưa có thì thêm mới
            const existing = currentItems.find(x => x.ingredient_id === ingId);
            if (existing) {
                existing.quantity = qty;
            } else {
                currentItems.push({ ingredient_id: ingId, quantity: qty });
            }

            // Áp dụng cho tất cả các sản phẩm đang được chọn
            for (const prodId of targetIds) {
                await fetch(`/api/products/${prodId}/bom`, {
                    method: 'POST',
                    headers: {'Content-Type': 'application/json'},
                    body: JSON.stringify({ items: currentItems })
                });
            }

            closeModalBOMItem();
            await loadProductBOMDetails(targetIds[targetIds.length - 1]);
            await loadUnifiedInventory();
            alert(`Đã cập nhật định lượng BOM cho ${targetIds.length} sản phẩm được chọn!`);
        }

        async function removeBOMItem(ingId) {
            if (!confirm('Xóa thành phần này khỏi BOM?')) return;
            const targetIds = [...selectedBOMProductIds];
            if (targetIds.length === 0) return;

            let currentItems = currentBOMData.bom_items
                .filter(b => b.ingredient_id !== ingId)
                .map(b => ({ ingredient_id: b.ingredient_id, quantity: b.quantity }));

            for (const prodId of targetIds) {
                await fetch(`/api/products/${prodId}/bom`, {
                    method: 'POST',
                    headers: {'Content-Type': 'application/json'},
                    body: JSON.stringify({ items: currentItems })
                });
            }

            await loadProductBOMDetails(targetIds[targetIds.length - 1]);
            await loadUnifiedInventory();
        }

        async function recalculateActiveProductCost() {
            const targetIds = [...selectedBOMProductIds];
            if (targetIds.length === 0) return alert('Vui lòng chọn sản phẩm trước!');
            
            for (const prodId of targetIds) {
                await fetch(`/api/products/${prodId}/recalculate-cost`, { method: 'POST' });
            }

            await loadProductBOMDetails(targetIds[targetIds.length - 1]);
            await loadUnifiedInventory();
            alert(`Đã tính toán lại giá cost cho ${targetIds.length} sản phẩm theo giá nhập nguyên liệu mới nhất!`);
        }

        async function promptAdjustStock(ingId, ingName, ingType) {
            if (ingType === 'SERVICE') return alert('Thành phần dịch vụ không quản lý tồn kho!');
            const qtyStr = prompt(`Nhập số lượng nhập thêm cho [${ingName}]:`, '10');
            if (!qtyStr) return;
            const qty = parseFloat(qtyStr);
            if (isNaN(qty)) return alert('Số lượng không hợp lệ');

            const priceStr = prompt(`Nhập đơn giá nhập mới (để trống nếu giữ nguyên):`, '');
            const price = priceStr ? parseFloat(priceStr) : null;

            const res = await fetch('/api/inventory/adjust', {
                method: 'POST',
                headers: {'Content-Type': 'application/json'},
                body: JSON.stringify({
                    warehouse_id: 1,
                    ingredient_id: ingId,
                    quantity: qty,
                    mode: 'add',
                    purchase_price: price,
                    note: 'Nhập tay từ giao diện Quản Lý Cost'
                })
            });

            if (res.ok) {
                await loadCostIngredients();
                const prodId = document.getElementById('cost-product-select').value;
                if (prodId) await loadProductBOMDetails(prodId);
                alert('Đã cập nhật tồn kho & giá thành công!');
            } else {
                alert('Lỗi cập nhật tồn kho!');
            }
        }

        async function viewIngredientDetail(ingId) {
            try {
                const res = await fetch(`/api/ingredients/${ingId}/detail`);
                if (!res.ok) return alert('Không tìm thấy thông tin chi tiết nguyên liệu!');
                const data = await res.json();
                const ing = data.ingredient;

                document.getElementById('ing-detail-title').textContent = ing.name;
                document.getElementById('ing-detail-code').textContent = ing.code || '-';
                document.getElementById('ing-detail-unit').textContent = ing.unit || 'cái';

                const badge = document.getElementById('ing-detail-badge');
                if (ing.type === 'SERVICE') {
                    badge.textContent = 'Dịch vụ';
                    badge.className = 'px-2 py-0.5 rounded text-[10px] font-bold bg-indigo-100 text-indigo-700';
                } else {
                    badge.textContent = 'Vật lý (Tồn kho)';
                    badge.className = 'px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-100 text-emerald-700';
                }

                // 1. Tồn kho theo từng kho
                const stocksEl = document.getElementById('ing-detail-stocks');
                if (ing.type === 'SERVICE') {
                    stocksEl.innerHTML = '<div class="text-gray-400 italic py-1">Thành phần Dịch Vụ không lưu trữ tồn kho.</div>';
                } else if (!data.stocks || data.stocks.length === 0) {
                    stocksEl.innerHTML = '<div class="text-gray-400 italic py-1">Chưa có dữ liệu tồn kho tại các kho.</div>';
                } else {
                    stocksEl.innerHTML = data.stocks.map(s => `
                        <div class="flex justify-between items-center bg-white border p-1.5 rounded text-[11px]">
                            <div>
                                <span class="font-bold text-slate-800">${s.warehouse_name}</span>
                                <span class="text-gray-400 text-[10px] ml-1">(${s.warehouse_address || 'Tại shop'})</span>
                            </div>
                            <span class="font-mono font-bold text-sky-700">${s.quantity} ${ing.unit}</span>
                        </div>
                    `).join('');
                }

                // 2. Lịch sử giá nhập theo NCC
                const pricesEl = document.getElementById('ing-detail-prices');
                if (!data.price_history || data.price_history.length === 0) {
                    pricesEl.innerHTML = '<div class="text-gray-400 italic py-1">Chưa có lịch sử giá nhập.</div>';
                } else {
                    pricesEl.innerHTML = data.price_history.map(p => `
                        <div class="flex justify-between items-center bg-white border p-1.5 rounded text-[11px]">
                            <div>
                                <span class="font-medium text-slate-800">${p.supplier_name || 'NCC Mặc định / Chưa gán'}</span>
                                <span class="text-gray-400 text-[10px] ml-1">(${p.effective_date ? p.effective_date.substring(0, 10) : ''})</span>
                            </div>
                            <span class="font-mono font-bold text-rose-600">${formatMoney(p.purchase_price)}</span>
                        </div>
                    `).join('');
                }

                // 3. Bảng nhật ký biến động (trừ bill, nhập kho...)
                const logsTbody = document.getElementById('table-ing-logs');
                if (!data.logs || data.logs.length === 0) {
                    logsTbody.innerHTML = '<tr><td colspan="7" class="p-3 text-center text-gray-400">Chưa có giao dịch biến động nào</td></tr>';
                } else {
                    logsTbody.innerHTML = data.logs.map(l => {
                        const isSale = l.change_type === 'SALE';
                        const isPurchase = l.change_type === 'PURCHASE';
                        const typeBadge = isSale 
                            ? '<span class="px-1.5 py-0.5 rounded text-[10px] font-bold bg-rose-100 text-rose-700">🛒 Xuất Bán</span>' 
                            : (isPurchase ? '<span class="px-1.5 py-0.5 rounded text-[10px] font-bold bg-emerald-100 text-emerald-700">📥 Nhập Hàng</span>' : '<span class="px-1.5 py-0.5 rounded text-[10px] font-bold bg-sky-100 text-sky-700">✏️ Điều Chỉnh</span>');

                        const qtyDisplay = l.quantity > 0 
                            ? `<span class="text-emerald-600 font-bold">+${l.quantity}</span>` 
                            : `<span class="text-rose-600 font-bold">${l.quantity}</span>`;

                        const refDisplay = l.order_code 
                            ? `<button onclick="viewOrderDetailModal('${l.order_code}')" class="font-mono font-bold text-sky-700 bg-sky-50 hover:bg-sky-100 px-1.5 py-0.5 rounded border border-sky-300 text-[11px] underline flex items-center gap-1 inline-flex" title="Bấm để xem hóa đơn này">🧾 ${l.order_code}</button>` 
                            : (l.supplier_name ? `<span class="font-medium text-slate-700">🏢 ${l.supplier_name}</span>` : '-');

                        return `
                            <tr class="border-b hover:bg-gray-50">
                                <td class="p-2 text-gray-500 whitespace-nowrap">${l.created_at || '-'}</td>
                                <td class="p-2">${typeBadge}</td>
                                <td class="p-2 text-right font-mono">${qtyDisplay} ${ing.unit}</td>
                                <td class="p-2 text-right font-mono font-bold text-slate-700">${l.balance_after}</td>
                                <td class="p-2 font-medium text-slate-700">${l.warehouse_name || 'Kho 1'}</td>
                                <td class="p-2">${refDisplay}</td>
                                <td class="p-2 text-gray-500">${l.note || '-'}</td>
                            </tr>
                        `;
                    }).join('');
                }

                document.getElementById('modal-ingredient-detail').classList.remove('hidden');
            } catch (e) {
                console.error(e);
                alert('Lỗi tải thông tin chi tiết nguyên liệu');
            }
        }

        function closeModalIngredientDetail() {
            document.getElementById('modal-ingredient-detail').classList.add('hidden');
        }

        // --- QUẢN LÝ DANH SÁCH HÓA ĐƠN BÁN HÀNG ---
        let allOrdersData = [];

        async function loadOrdersList() {
            const tbody = document.getElementById('orders-table-body');
            if (!tbody) return;
            tbody.innerHTML = '<tr><td colspan="10" class="p-6 text-center text-gray-400 italic">Đang tải danh sách hóa đơn...</td></tr>';
            try {
                const res = await fetch('/api/orders?limit=200');
                if (!res.ok) throw new Error('Không thể tải hóa đơn');
                allOrdersData = await res.json();
                renderOrdersTable(allOrdersData);
            } catch (e) {
                console.error("loadOrdersList error:", e);
                tbody.innerHTML = '<tr><td colspan="10" class="p-6 text-center text-red-500 italic">Lỗi khi tải danh sách hóa đơn!</td></tr>';
            }
        }

        function filterOrdersList() {
            const term = (document.getElementById('search-orders')?.value || '').toLowerCase().trim();
            if (!term) {
                renderOrdersTable(allOrdersData);
                return;
            }
            const filtered = allOrdersData.filter(o => 
                (o.code && o.code.toLowerCase().includes(term)) ||
                (o.customer_name && o.customer_name.toLowerCase().includes(term)) ||
                (o.staff_name && o.staff_name.toLowerCase().includes(term))
            );
            renderOrdersTable(filtered);
        }

        function renderOrdersTable(orders) {
            const tbody = document.getElementById('orders-table-body');
            const badge = document.getElementById('orders-count-badge');
            if (badge) badge.textContent = `${orders.length} hóa đơn`;
            if (!tbody) return;

            if (!orders || orders.length === 0) {
                tbody.innerHTML = '<tr><td colspan="10" class="p-6 text-center text-gray-400 italic">Không có hóa đơn nào</td></tr>';
                return;
            }

            tbody.innerHTML = orders.map(ord => {
                const debt = ord.debt_amount || 0;
                const debtHtml = debt > 0 
                    ? `<span class="text-rose-600 font-bold">${formatMoney(debt)}</span>` 
                    : `<span class="text-emerald-600 font-medium">0 đ</span>`;

                return `
                    <tr class="border-b hover:bg-sky-50 transition-colors">
                        <td class="p-3 font-mono font-bold text-sky-700 cursor-pointer hover:underline" onclick="viewOrderDetailModal('${ord.code}')">
                            ${ord.code}
                        </td>
                        <td class="p-3 text-gray-500 whitespace-nowrap">${ord.created_at || ''}</td>
                        <td class="p-3 font-medium text-slate-800">${ord.customer_name || 'Khách lẻ'}</td>
                        <td class="p-3 text-gray-600">${ord.staff_name || 'Thu ngân'}</td>
                        <td class="p-3 text-center font-mono font-bold">${ord.item_count || 0}</td>
                        <td class="p-3 text-right font-mono font-bold text-slate-800">${formatMoney(ord.final_amount)}</td>
                        <td class="p-3 text-right font-mono text-gray-500">${formatMoney(ord.discount || 0)}</td>
                        <td class="p-3 text-right font-mono text-emerald-600 font-medium">${formatMoney(ord.paid_amount)}</td>
                        <td class="p-3 text-right font-mono">${debtHtml}</td>
                        <td class="p-3 text-center whitespace-nowrap">
                            <button onclick="viewOrderDetailModal('${ord.code}')" class="px-2 py-1 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded text-xs font-bold mr-1" title="Xem chi tiết">
                                👁️ Xem
                            </button>
                            <button onclick="openModalEditOrder('${ord.code}')" class="px-2 py-1 bg-amber-50 hover:bg-amber-100 text-amber-700 border border-amber-200 rounded text-xs font-bold mr-1" title="Sửa hóa đơn">
                                ✏️ Sửa
                            </button>
                            <button onclick="deleteOrder('${ord.code}')" class="px-2 py-1 bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 rounded text-xs font-bold mr-1" title="Xóa/Hủy hóa đơn">
                                🗑️ Xóa
                            </button>
                            <button onclick="showPrintModal('${ord.code}')" class="px-2 py-1 bg-sky-100 hover:bg-sky-200 text-sky-700 rounded text-xs font-bold" title="In lại hóa đơn">
                                🖨️ In
                            </button>
                        </td>
                    </tr>
                `;
            }).join('');
        }

        // --- XEM CHI TIẾT HÓA ĐƠN BÁN HÀNG TỪ LOGS ---
        let currentViewedOrderCode = null;

        async function viewOrderDetailModal(orderCode) {
            try {
                const res = await fetch(`/api/orders/${orderCode}`);
                if (!res.ok) return alert(`Không tìm thấy hóa đơn [${orderCode}]!`);
                const ord = await res.json();
                currentViewedOrderCode = orderCode;

                document.getElementById('view-order-code').textContent = ord.code;
                document.getElementById('view-order-date').textContent = ord.created_at || '';
                document.getElementById('view-order-cust').textContent = (ord.customer_name || 'Khách lẻ') + (ord.customer_phone ? ' (' + ord.customer_phone + ')' : '');
                document.getElementById('view-order-staff').textContent = ord.staff_name || 'Thu ngân';

                const tbody = document.getElementById('view-order-items');
                tbody.innerHTML = (ord.items || []).map((item, idx) => `
                    <tr class="border-b hover:bg-gray-50">
                        <td class="p-2 text-center text-gray-500">${idx + 1}</td>
                        <td class="p-2 font-medium text-slate-800">${item.product_name}</td>
                        <td class="p-2 text-right font-mono font-bold">${item.quantity} ${item.unit || ''}</td>
                        <td class="p-2 text-right font-mono">${formatMoney(item.price)}</td>
                        <td class="p-2 text-right font-mono font-bold text-slate-800">${formatMoney(item.subtotal)}</td>
                    </tr>
                `).join('');

                document.getElementById('view-order-total').textContent = formatMoney(ord.total_amount);
                document.getElementById('view-order-discount').textContent = formatMoney(ord.discount || 0);
                document.getElementById('view-order-final').textContent = formatMoney(ord.final_amount);
                document.getElementById('view-order-paid').textContent = formatMoney(ord.paid_amount);

                document.getElementById('modal-order-view').classList.remove('hidden');
            } catch (e) {
                console.error(e);
                alert('Lỗi tải chi tiết đơn hàng!');
            }
        }

        function closeModalOrderView() {
            document.getElementById('modal-order-view').classList.add('hidden');
            currentViewedOrderCode = null;
        }

        function printCurrentViewedOrder() {
            if (currentViewedOrderCode) {
                closeModalOrderView();
                closeModalIngredientDetail();
                showPrintModal(currentViewedOrderCode);
            }
        }

        // --- XÓA / SỬA ĐƠN HÀNG ---
        async function deleteOrder(code) {
            if (!confirm(`Bạn có chắc chắn muốn XÓA / HỦY hóa đơn [${code}]?\n- Hàng hóa & nguyên liệu BOM sẽ được hoàn trả lại kho.\n- Công nợ khách hàng (nếu có) sẽ được khấu trừ lại.\n- Bản ghi thu tiền tương ứng trong sổ quỹ sẽ bị xóa.`)) {
                return;
            }

            try {
                const res = await fetch(`/api/orders/${code}`, { method: 'DELETE' });
                if (res.ok) {
                    alert(`Đã xóa hóa đơn [${code}] thành công!`);
                    await loadOrdersList();
                } else {
                    const err = await res.json();
                    alert("Lỗi khi xóa: " + (err.detail || "Không thể xóa đơn"));
                }
            } catch (e) {
                console.error("deleteOrder error:", e);
                alert("Lỗi kết nối khi xóa đơn hàng!");
            }
        }

        function deleteOrderFromView() {
            if (currentViewedOrderCode) {
                const c = currentViewedOrderCode;
                closeModalOrderView();
                deleteOrder(c);
            }
        }

        let editingOrderData = null;

        async function openModalEditOrder(orderCode) {
            try {
                const res = await fetch(`/api/orders/${orderCode}`);
                if (!res.ok) return alert(`Không tìm thấy đơn hàng [${orderCode}]`);
                editingOrderData = await res.json();

                document.getElementById('edit-order-code-badge').textContent = editingOrderData.code;

                // Populate customer options
                const custSelect = document.getElementById('edit-order-cust');
                custSelect.innerHTML = contacts.map(c => `
                    <option value="${c.id}" ${c.id === editingOrderData.customer_id ? 'selected' : ''}>${c.name} ${c.phone ? '(' + c.phone + ')' : ''}</option>
                `).join('');

                // Populate staff options
                const staffSelect = document.getElementById('edit-order-staff');
                staffSelect.innerHTML = (allStaff || []).map(s => `
                    <option value="${s.id}" ${s.id === editingOrderData.staff_id ? 'selected' : ''}>${s.name}</option>
                `).join('');

                document.getElementById('edit-order-discount').value = editingOrderData.discount || 0;
                document.getElementById('edit-order-paid').value = editingOrderData.paid_amount || 0;
                document.getElementById('edit-order-note').value = editingOrderData.note || '';

                renderEditOrderItemsTable();
                calcEditOrderTotals();

                document.getElementById('modal-order-edit').classList.remove('hidden');
            } catch (e) {
                console.error("openModalEditOrder error:", e);
                alert("Lỗi khi mở form sửa đơn!");
            }
        }

        function openModalEditOrderFromView() {
            if (currentViewedOrderCode) {
                const c = currentViewedOrderCode;
                closeModalOrderView();
                openModalEditOrder(c);
            }
        }

        function closeModalEditOrder() {
            document.getElementById('modal-order-edit').classList.add('hidden');
            editingOrderData = null;
        }

        function renderEditOrderItemsTable() {
            const tbody = document.getElementById('edit-order-items-tbody');
            if (!tbody || !editingOrderData || !editingOrderData.items) return;

            tbody.innerHTML = editingOrderData.items.map((item, idx) => `
                <tr class="border-b">
                    <td class="p-2 font-medium text-slate-800">${item.product_name}</td>
                    <td class="p-2 text-right">
                        <input type="number" step="any" min="0.01" value="${item.quantity}" 
                               onchange="updateEditOrderItemQty(${idx}, this.value)" 
                               class="border p-1 rounded w-20 text-right font-mono">
                    </td>
                    <td class="p-2 text-right">
                        <input type="number" step="any" min="0" value="${item.price}" 
                               onchange="updateEditOrderItemPrice(${idx}, this.value)" 
                               class="border p-1 rounded w-24 text-right font-mono">
                    </td>
                    <td class="p-2 text-right font-mono font-bold text-slate-800">
                        ${formatMoney(item.quantity * item.price)}
                    </td>
                    <td class="p-2 text-center">
                        <button onclick="removeEditOrderItem(${idx})" class="text-rose-500 hover:text-rose-700 font-bold text-sm">✕</button>
                    </td>
                </tr>
            `).join('');
        }

        function updateEditOrderItemQty(idx, val) {
            const qty = parseFloat(val) || 0;
            if (editingOrderData && editingOrderData.items[idx]) {
                editingOrderData.items[idx].quantity = qty;
                editingOrderData.items[idx].subtotal = qty * editingOrderData.items[idx].price;
                renderEditOrderItemsTable();
                calcEditOrderTotals();
            }
        }

        function updateEditOrderItemPrice(idx, val) {
            const price = parseFloat(val) || 0;
            if (editingOrderData && editingOrderData.items[idx]) {
                editingOrderData.items[idx].price = price;
                editingOrderData.items[idx].subtotal = editingOrderData.items[idx].quantity * price;
                renderEditOrderItemsTable();
                calcEditOrderTotals();
            }
        }

        function removeEditOrderItem(idx) {
            if (editingOrderData && editingOrderData.items) {
                if (editingOrderData.items.length <= 1) {
                    return alert("Hóa đơn phải có ít nhất 1 sản phẩm. Nếu muốn hủy đơn hãy dùng nút Xóa!");
                }
                editingOrderData.items.splice(idx, 1);
                renderEditOrderItemsTable();
                calcEditOrderTotals();
            }
        }

        function calcEditOrderTotals() {
            if (!editingOrderData || !editingOrderData.items) return;
            const total = editingOrderData.items.reduce((sum, it) => sum + (it.quantity * it.price), 0);
            const discount = parseFloat(document.getElementById('edit-order-discount').value) || 0;
            const final = Math.max(0, total - discount);
            const paid = parseFloat(document.getElementById('edit-order-paid').value) || 0;
            const debt = Math.max(0, final - paid);

            document.getElementById('edit-order-total').textContent = formatMoney(total);
            document.getElementById('edit-order-final').textContent = formatMoney(final);
            document.getElementById('edit-order-debt').textContent = formatMoney(debt);
        }

        async function saveEditOrder() {
            if (!editingOrderData) return;
            const customer_id = parseInt(document.getElementById('edit-order-cust').value);
            const staff_id = parseInt(document.getElementById('edit-order-staff').value);
            const discount = parseFloat(document.getElementById('edit-order-discount').value) || 0;
            const paid_amount = parseFloat(document.getElementById('edit-order-paid').value) || 0;
            const note = document.getElementById('edit-order-note').value;

            const items = editingOrderData.items.map(it => ({
                product_id: it.product_id,
                quantity: parseFloat(it.quantity),
                price: parseFloat(it.price)
            }));

            if (items.length === 0) {
                return alert("Hóa đơn phải có ít nhất 1 sản phẩm!");
            }

            const payload = {
                customer_id,
                staff_id,
                discount,
                paid_amount,
                note,
                items
            };

            try {
                const res = await fetch(`/api/orders/${editingOrderData.code}`, {
                    method: 'PUT',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(payload)
                });

                if (res.ok) {
                    alert(`Cập nhật đơn hàng [${editingOrderData.code}] thành công!`);
                    closeModalEditOrder();
                    await Promise.all([loadOrdersList(), loadContacts()]);
                } else {
                    const err = await res.json();
                    alert("Lỗi: " + (err.detail || "Không thể cập nhật hóa đơn"));
                }
            } catch (e) {
                console.error("saveEditOrder error:", e);
                alert("Lỗi kết nối khi cập nhật đơn hàng!");
            }
        }

        // --- CANVAS DRAG & DROP ENGINE ---
        let multiTemplates = {
            active_size: "A4-portrait",
            templates: {}
        };
        let canvasElements = [];
        let selectedElementId = null;
        let paperSize = "A4-portrait";

        function getQRCodeHTML(amount, code) {
            const mode = currentSettings.shop_qr_mode || 'vietqr';
            if (mode === 'static' && currentSettings.shop_qr_image) {
                return `<img src="${currentSettings.shop_qr_image}" style="max-width: 140px; margin: 0 auto; display: block;" alt="QR Thanh Toán">`;
            }
            if (currentSettings.shop_bank_account) {
                const bank = currentSettings.shop_bank_code || 'MB';
                const acc = currentSettings.shop_bank_account;
                const name = encodeURIComponent(currentSettings.shop_bank_owner || '');
                const desc = encodeURIComponent(code || 'THANH TOAN');
                const amt = Math.round(amount || 0);
                const qrUrl = `https://img.vietqr.io/image/${bank}-${acc}-compact2.png?amount=${amt}&addInfo=${desc}&accountName=${name}`;
                return `<div style="text-align: center;"><img src="${qrUrl}" style="max-width: 140px; margin: 2px auto; display: block; border-radius: 4px;" alt="VietQR"><div style="font-size: 10px; color: #555;">Quét QR chuyển khoản</div></div>`;
            }
            return `<div style="border: 1px dashed #999; padding: 10px; font-size: 11px; text-align: center; color: #777;">(Chưa cấu hình tài khoản VietQR trong Cài Đặt)</div>`;
        }

        const paperDimensions = {
            "A4-portrait": { width: "210mm", height: "297mm", printSize: "A4 portrait" },
            "A4-landscape": { width: "297mm", height: "210mm", printSize: "A4 landscape" },
            "A5-portrait": { width: "148mm", height: "210mm", printSize: "A5 portrait" },
            "A5-landscape": { width: "210mm", height: "148mm", printSize: "A5 landscape" },
            "K80": { width: "80mm", height: "200mm", printSize: "80mm auto" },
            "K58": { width: "58mm", height: "180mm", printSize: "58mm auto" }
        };

        const defaultElementCatalog = {
            logo: { zone: "header", type: "logo", label: "Logo Cửa Hàng", w: 120, h: 55, align: "center" },
            shop_name: { zone: "header", type: "text", text: "{{ten_cua_hang}}", label: "Tên Cửa Hàng", fsz: 16, bold: true, align: "left", w: 580 },
            shop_address: { zone: "header", type: "text", text: "Địa chỉ: {{dia_chi}}", label: "Địa Chỉ", fsz: 10, bold: false, align: "left", w: 580 },
            shop_phone: { zone: "header", type: "text", text: "Hotline: {{so_dien_thoai}}", label: "SĐT Shop", fsz: 10, bold: false, align: "left", w: 250 },
            title: { zone: "header", type: "text", text: "HÓA ĐƠN BÁN HÀNG", label: "Tiêu Đề", fsz: 18, bold: true, align: "center", w: 734 },
            order_code: { zone: "header", type: "text", text: "Mã hóa đơn: {{ma_hoa_don}}", label: "Mã Đơn", fsz: 10, bold: false, align: "left", w: 250 },
            datetime: { zone: "header", type: "text", text: "Ngày lập: {{ngay_gio}}", label: "Thời Gian", fsz: 10, bold: false, align: "right", w: 250 },
            staff: { zone: "header", type: "text", text: "Thu ngân: {{thu_ngan}}", label: "Thu Ngân", fsz: 10, bold: false, align: "right", w: 250 },
            customer: { zone: "header", type: "text", text: "Khách hàng: {{ten_khach}}", label: "Khách Hàng", fsz: 10, bold: false, align: "left", w: 450 },
            customer_phone: { zone: "header", type: "text", text: "SĐT: {{sdt_khach}}", label: "SĐT Khách", fsz: 10, bold: false, align: "left", w: 200 },
            table: { zone: "body", type: "table", label: "Bảng Danh Sách Món (4 Cột)", w: 734, fsz: 11, border: "dashed" },
            table_b2b: { zone: "body", type: "table_b2b", label: "Bảng 9 Cột B2B/Đại Lý", w: 734, fsz: 10 },
            b2b_footer_boxes: { zone: "footer", type: "b2b_footer_boxes", label: "3 Ô Chân Trang (Bank - QR - Tổng kết)", w: 734, h: 140 },
            signatures_3col: { zone: "footer", type: "signatures_3col", label: "3 Cột Chữ Ký (Kế toán - Thủ kho - Người nhận)", w: 734, h: 90 },
            total: { zone: "footer", type: "text", text: "Tổng tiền hàng: {{tong_tien}}", label: "Tổng Tiền", fsz: 12, bold: false, align: "right", w: 280 },
            discount: { zone: "footer", type: "text", text: "Chiết khấu: {{giam_gia}}", label: "Giảm Giá", fsz: 12, bold: false, align: "right", w: 280 },
            final: { zone: "footer", type: "text", text: "KHÁCH PHẢI TRẢ: {{phai_tra}}", label: "Phải Trả", fsz: 15, bold: true, align: "right", w: 320 },
            paid: { zone: "footer", type: "text", text: "Tiền khách đưa: {{khach_tra}}", label: "Khách Đưa", fsz: 12, bold: false, align: "right", w: 280 },
            debt: { zone: "footer", type: "text", text: "Tiền thừa/Nợ: {{con_no}}", label: "Thừa/Nợ", fsz: 12, bold: false, align: "right", w: 280 },
            qr: { zone: "footer", type: "qr", label: "QR Code Thanh Toán", w: 140, h: 140 },
            footer_msg: { zone: "footer", type: "text", text: "{{loi_cam_on}}", label: "Lời Cảm Ơn", fsz: 11, italic: true, align: "center", w: 734 },
            custom_text: { zone: "footer", type: "text", text: "Nội dung tùy chỉnh...", label: "Ô Chữ Tự Do", fsz: 11, bold: false, align: "left", w: 250 }
        };

        function getB2BA4Template(size) {
            const isLandscape = (size || paperSize || 'A4-landscape').includes('landscape');
            const totalW = isLandscape ? 980 : 734;
            const rightX = isLandscape ? 740 : 504;
            const titleW = totalW;
            const startX = isLandscape ? 40 : 30;

            return [
                { id: "e1", catalog_key: "logo", zone: "header", type: "logo", label: "Logo Cửa Hàng", x: startX, y: 22, w: 120, h: 55, align: "center" },
                { id: "e2", catalog_key: "shop_name", zone: "header", type: "text", text: "{{ten_cua_hang}}", label: "Tên Cửa Hàng", x: startX + 140, y: 20, w: isLandscape ? 520 : 580, fsz: 16, bold: true, align: "left" },
                { id: "e3", catalog_key: "shop_address", zone: "header", type: "text", text: "Địa chỉ: {{dia_chi}}", label: "Địa Chỉ", x: startX + 140, y: 42, w: isLandscape ? 520 : 580, fsz: 10, bold: false, align: "left" },
                { id: "e4", catalog_key: "shop_phone", zone: "header", type: "text", text: "Hotline: {{so_dien_thoai}}", label: "SĐT Shop", x: startX + 140, y: 60, w: 300, fsz: 10, bold: false, align: "left" },
                { id: "e5", catalog_key: "title", zone: "header", type: "text", text: "HÓA ĐƠN BÁN HÀNG ĐẠI LÝ", label: "Tiêu Đề", x: startX, y: 92, w: titleW, fsz: 18, bold: true, align: "center" },
                { id: "e6", catalog_key: "order_code", zone: "header", type: "text", text: "Mã hóa đơn: {{ma_hoa_don}}", label: "Mã Đơn", x: startX, y: 125, w: 260, fsz: 10, bold: false, align: "left" },
                { id: "e7", catalog_key: "datetime", zone: "header", type: "text", text: "Ngày lập: {{ngay_gio}}", label: "Thời Gian", x: rightX, y: 125, w: 260, fsz: 10, bold: false, align: "right" },
                { id: "e8", catalog_key: "customer", zone: "header", type: "text", text: "Đại lý / Khách hàng: {{ten_khach}} ({{sdt_khach}})", label: "Khách Hàng", x: startX, y: 147, w: isLandscape ? 550 : 460, fsz: 10, bold: false, align: "left" },
                { id: "e9", catalog_key: "staff", zone: "header", type: "text", text: "Nhân viên kinh doanh: {{thu_ngan}}", label: "Thu Ngân", x: rightX, y: 147, w: 260, fsz: 10, bold: false, align: "right" },
                { id: "e10", catalog_key: "table_b2b", zone: "body", type: "table_b2b", label: "Bảng 9 Cột B2B/Đại Lý", x: startX, y: 180, w: totalW, fsz: 10 },
                { id: "e11", catalog_key: "b2b_footer_boxes", zone: "footer", type: "b2b_footer_boxes", label: "3 Ô Chân Trang (Bank - QR - Tổng kết)", x: startX, y: 325, w: totalW, h: 140 },
                { id: "e12", catalog_key: "signatures_3col", zone: "footer", type: "signatures_3col", label: "3 Cột Chữ Ký (Kế toán - Thủ kho - Người nhận)", x: startX, y: 480, w: totalW, h: 90 },
                { id: "e13", catalog_key: "footer_msg", zone: "footer", type: "text", text: "{{loi_cam_on}}", label: "Lời Cảm Ơn", x: startX, y: 585, w: totalW, fsz: 10, italic: true, align: "center" }
            ];
        }

        function getDefaultPresets() {
            return {
                "a4_b2b": {
                    name: "Mẫu A4 Đại Lý B2B (Chuẩn 9 Cột & 3 Chữ Ký)",
                    paper_size: "A4-landscape",
                    elements: getB2BA4Template("A4-landscape")
                },
                "a4_standard": {
                    name: "Mẫu A4 Tiêu Chuẩn (Bán Lẻ)",
                    paper_size: "A4-portrait",
                    elements: getInitialElementsForSize("A4-portrait")
                },
                "a5_standard": {
                    name: "Mẫu A5 Tiêu Chuẩn",
                    paper_size: "A5-portrait",
                    elements: getInitialElementsForSize("A5-portrait")
                },
                "k80_standard": {
                    name: "Mẫu Cuộn Nhiệt K80",
                    paper_size: "K80",
                    elements: getInitialElementsForSize("K80")
                },
                "k58_standard": {
                    name: "Mẫu Cuộn Nhiệt K58",
                    paper_size: "K58",
                    elements: getInitialElementsForSize("K58")
                }
            };
        }

        function renderPresetSelect() {
            const sel = document.getElementById('canvas-preset-select');
            if (!sel) return;
            if (!multiTemplates.presets) {
                multiTemplates.presets = getDefaultPresets();
            }
            const curPreset = multiTemplates.active_preset || "a4_b2b";
            let html = '';
            for (let key in multiTemplates.presets) {
                const p = multiTemplates.presets[key];
                const isSel = key === curPreset ? 'selected' : '';
                html += `<option value="${key}" ${isSel}>${p.name}</option>`;
            }
            sel.innerHTML = html;
        }

        function switchPreset(presetKey) {
            if (!multiTemplates.presets || !multiTemplates.presets[presetKey]) return;
            multiTemplates.active_preset = presetKey;
            const preset = multiTemplates.presets[presetKey];
            paperSize = preset.paper_size || "A4-portrait";
            document.getElementById('canvas-paper-size').value = paperSize;
            canvasElements = JSON.parse(JSON.stringify(preset.elements));
            selectedElementId = null;

            const canvas = document.getElementById('paper-canvas');
            const dim = paperDimensions[paperSize] || paperDimensions["A4-portrait"];
            canvas.style.width = dim.width;
            canvas.style.minHeight = dim.height;

            renderCanvas();
            renderPropsPanel();
            updateSidebarCheckboxes();
            updateCanvasBadge();
            if (paperSize.includes('landscape')) setCanvasZoom('fit');
        }

        async function saveCurrentPreset() {
            if (!multiTemplates.presets) multiTemplates.presets = getDefaultPresets();
            const curKey = multiTemplates.active_preset || "a4_b2b";
            if (!multiTemplates.presets[curKey]) {
                multiTemplates.presets[curKey] = {
                    name: "Mẫu Tùy Biến",
                    paper_size: paperSize,
                    elements: []
                };
            }
            multiTemplates.presets[curKey].paper_size = paperSize;
            multiTemplates.presets[curKey].elements = JSON.parse(JSON.stringify(canvasElements));
            multiTemplates.active_size = paperSize;
            multiTemplates.templates[paperSize] = JSON.parse(JSON.stringify(canvasElements));

            const payload = {
                print_blocks_config: JSON.stringify(multiTemplates)
            };
            const res = await fetch('/api/settings/template', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });
            if (res.ok) {
                alert(`Đã lưu cập nhật cho [${multiTemplates.presets[curKey].name}] thành công!`);
            } else {
                alert('Lỗi khi lưu mẫu!');
            }
        }

        async function saveNewPreset() {
            const name = prompt("Nhập tên cho mẫu in mới:", "Hóa Đơn A4 Đại Lý (Mẫu Mới)");
            if (!name || !name.trim()) return;

            if (!multiTemplates.presets) multiTemplates.presets = getDefaultPresets();
            const newKey = "preset_" + Date.now();
            multiTemplates.presets[newKey] = {
                name: name.trim(),
                paper_size: paperSize,
                elements: JSON.parse(JSON.stringify(canvasElements))
            };
            multiTemplates.active_preset = newKey;
            multiTemplates.active_size = paperSize;
            multiTemplates.templates[paperSize] = JSON.parse(JSON.stringify(canvasElements));

            const payload = {
                print_blocks_config: JSON.stringify(multiTemplates)
            };
            const res = await fetch('/api/settings/template', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });
            if (res.ok) {
                renderPresetSelect();
                alert(`Đã tạo và lưu thành mẫu mới: "${name.trim()}"!`);
            } else {
                alert('Lỗi khi lưu mẫu mới!');
            }
        }

        async function deleteCurrentPreset() {
            const curKey = multiTemplates.active_preset || "a4_b2b";
            const builtIn = ["a4_b2b", "a4_standard", "a5_standard", "k80_standard", "k58_standard"];
            if (builtIn.includes(curKey)) {
                alert("Đây là mẫu in hệ thống mặc định, không thể xóa!");
                return;
            }
            const name = multiTemplates.presets[curKey] ? multiTemplates.presets[curKey].name : curKey;
            if (!confirm(`Bạn có chắc muốn xóa mẫu "${name}"?`)) return;

            delete multiTemplates.presets[curKey];
            multiTemplates.active_preset = "a4_b2b";
            const payload = {
                print_blocks_config: JSON.stringify(multiTemplates)
            };
            await fetch('/api/settings/template', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });
            renderPresetSelect();
            switchPreset("a4_b2b");
            alert(`Đã xóa mẫu "${name}" thành công!`);
        }

        function toggleTableMode(mode) {
            canvasElements = canvasElements.filter(e => (e.zone || '') !== 'body');
            const proto = defaultElementCatalog[mode];
            if (!proto) return;
            const newElem = JSON.parse(JSON.stringify(proto));
            newElem.id = "elem_" + Date.now();
            newElem.catalog_key = mode;
            newElem.zone = 'body';
            newElem.x = paperSize.startsWith('A') ? 30 : 10;
            newElem.w = paperSize.includes('K80') ? 270 : paperSize.includes('K58') ? 195 : 734;

            const headerElems = canvasElements.filter(e => (e.zone || 'header') === 'header');
            let startY = 168;
            if (headerElems.length > 0) {
                startY = Math.max(...headerElems.map(e => (e.y || 0) + (e.h || (e.fsz ? e.fsz + 14 : 26)))) + 12;
            }
            newElem.y = startY;

            const lastHeaderIdx = canvasElements.map(e => e.zone || 'header').lastIndexOf('header');
            if (lastHeaderIdx >= 0) {
                canvasElements.splice(lastHeaderIdx + 1, 0, newElem);
            } else {
                canvasElements.unshift(newElem);
            }

            renderCanvas();
            renderPropsPanel();
            updateSidebarCheckboxes();
        }

        function toggleCanvasItem(key, checked) {
            if (checked) {
                const exists = canvasElements.some(e => e.catalog_key === key || (defaultElementCatalog[key] && e.type === defaultElementCatalog[key].type && e.type !== 'text') || (e.type === 'text' && defaultElementCatalog[key] && e.label === defaultElementCatalog[key].label));
                if (exists) return;

                const proto = defaultElementCatalog[key];
                if (!proto) return;
                const newElem = JSON.parse(JSON.stringify(proto));
                newElem.id = "elem_" + Date.now();
                newElem.catalog_key = key;

                const isThermal = paperSize.includes('K80') || paperSize.includes('K58');
                const defaultW = isThermal ? (paperSize.includes('K80') ? 270 : 195) : 734;
                if (newElem.type === 'b2b_footer_boxes' || newElem.type === 'signatures_3col') {
                    newElem.w = defaultW;
                    newElem.x = isThermal ? 10 : 30;
                }

                const targetZone = newElem.zone || 'header';
                const zoneElems = canvasElements.filter(e => (e.zone || 'header') === targetZone);

                if (zoneElems.length > 0) {
                    const maxY = Math.max(...zoneElems.map(e => (e.y || 0) + (e.h || (e.fsz ? e.fsz + 14 : 26))));
                    newElem.y = maxY + 8;
                    newElem.x = zoneElems[zoneElems.length - 1].x || (isThermal ? 10 : 30);
                } else {
                    if (targetZone === 'header') {
                        newElem.y = 20;
                        newElem.x = isThermal ? 10 : 30;
                    } else if (targetZone === 'body') {
                        const headerElems = canvasElements.filter(e => (e.zone || 'header') === 'header');
                        newElem.y = headerElems.length > 0 ? Math.max(...headerElems.map(e => (e.y || 0) + (e.h || 26))) + 12 : 20;
                        newElem.x = isThermal ? 10 : 30;
                    } else {
                        const nonFooter = canvasElements.filter(e => (e.zone || 'header') !== 'footer');
                        newElem.y = nonFooter.length > 0 ? Math.max(...nonFooter.map(e => (e.y || 0) + (e.h || (e.type === 'table_b2b' ? 110 : 85)))) + 15 : 20;
                        newElem.x = isThermal ? 10 : 30;
                    }
                }

                if (targetZone === 'header') {
                    if (newElem.type === 'logo') {
                        canvasElements.unshift(newElem);
                    } else {
                        const lastHeaderIdx = canvasElements.map(e => e.zone || 'header').lastIndexOf('header');
                        if (lastHeaderIdx >= 0) {
                            canvasElements.splice(lastHeaderIdx + 1, 0, newElem);
                        } else {
                            canvasElements.unshift(newElem);
                        }
                    }
                } else if (targetZone === 'body') {
                    const lastHeaderIdx = canvasElements.map(e => e.zone || 'header').lastIndexOf('header');
                    canvasElements.splice(lastHeaderIdx + 1, 0, newElem);
                } else {
                    canvasElements.push(newElem);
                }

                selectElement(newElem.id);
            } else {
                canvasElements = canvasElements.filter(e => {
                    if (e.catalog_key === key) return false;
                    const proto = defaultElementCatalog[key];
                    if (!proto) return true;
                    if (e.type === proto.type) {
                        if (e.type === 'text') return e.label !== proto.label;
                        return false;
                    }
                    return true;
                });
                if (selectedElementId && !canvasElements.some(e => e.id === selectedElementId)) {
                    selectedElementId = null;
                }
            }

            renderCanvas();
            renderPropsPanel();
            updateSidebarCheckboxes();
        }

        function updateSidebarCheckboxes() {
            const keys = [
                'logo', 'shop_name', 'shop_address', 'shop_phone', 'title',
                'order_code', 'datetime', 'staff', 'customer', 'customer_phone',
                'b2b_footer_boxes', 'signatures_3col',
                'total', 'discount', 'final', 'paid', 'debt', 'qr', 'footer_msg'
            ];
            keys.forEach(k => {
                const el = document.getElementById('chk-' + k);
                if (!el) return;
                const proto = defaultElementCatalog[k];
                const has = canvasElements.some(e => {
                    if (e.catalog_key === k) return true;
                    if (proto && e.type === proto.type) {
                        if (e.type === 'text') return e.label === proto.label;
                        return true;
                    }
                    return false;
                });
                el.checked = has;
            });

            const chkB2B = document.getElementById('chk-table_b2b');
            const chkStd = document.getElementById('chk-table');
            if (chkB2B && chkStd) {
                const hasB2B = canvasElements.some(e => e.type === 'table_b2b');
                const hasStd = canvasElements.some(e => e.type === 'table');
                chkB2B.checked = hasB2B;
                chkStd.checked = hasStd;
            }
        }

        function addCustomTextItem() {
            const isThermal = paperSize.includes('K80') || paperSize.includes('K58');
            const newElem = {
                id: "elem_" + Date.now(),
                catalog_key: "custom_text",
                zone: "footer",
                type: "text",
                text: "Nội dung tùy chỉnh...",
                label: "Ô Chữ Tự Do",
                fsz: 11,
                bold: false,
                align: "left",
                x: isThermal ? 10 : 30,
                y: 350,
                w: isThermal ? 270 : 250
            };
            const footerElems = canvasElements.filter(e => (e.zone || 'header') === 'footer');
            if (footerElems.length > 0) {
                const maxY = Math.max(...footerElems.map(e => (e.y || 0) + (e.h || 26)));
                newElem.y = maxY + 8;
            }
            canvasElements.push(newElem);
            selectElement(newElem.id);
            renderCanvas();
            renderPropsPanel();
        }

        function addCanvasItem(catalogKey) {
            toggleCanvasItem(catalogKey, true);
        }

        function recomputeElementPositions() {
            let curY = 15;
            const isThermal = paperSize.includes('K80') || paperSize.includes('K58');
            const defaultW = isThermal ? (paperSize.includes('K80') ? 270 : 195) : 734;

            canvasElements.forEach(e => {
                if (!e.zone) {
                    if (e.type === 'table' || e.type === 'table_b2b') e.zone = 'body';
                    else if (['total', 'discount', 'final', 'paid', 'debt', 'qr', 'footer_msg', 'b2b_footer_boxes', 'signatures_3col'].some(k => (e.label||'').includes(k) || (e.text||'').includes(k) || (e.id||'').includes(k) || e.type === k)) e.zone = 'footer';
                    else e.zone = 'header';
                }

                if (e.y === undefined) e.y = curY;
                if (!e.w) e.w = defaultW;

                let blockHeight = 26;
                if (e.type === 'logo') {
                    blockHeight = e.h || 55;
                } else if (e.type === 'table') {
                    blockHeight = 85;
                } else if (e.type === 'table_b2b') {
                    blockHeight = 110;
                } else if (e.type === 'b2b_footer_boxes') {
                    blockHeight = 140;
                } else if (e.type === 'signatures_3col') {
                    blockHeight = 90;
                } else if (e.type === 'qr') {
                    blockHeight = 145;
                } else if (e.fsz && e.fsz >= 18) {
                    blockHeight = 36;
                } else if (e.text && e.text.includes('<br>')) {
                    blockHeight = 44;
                }

                curY += blockHeight + 10;
            });
        }

        function moveElementOrder(id, direction) {
            const idx = canvasElements.findIndex(e => e.id === id);
            if (idx === -1) return;
            const targetIdx = idx + direction;

            if (targetIdx < 0) {
                alert('Khối này đã ở vị trí trên cùng!');
                return;
            }
            if (targetIdx >= canvasElements.length) {
                alert('Khối này đã ở vị trí dưới cùng!');
                return;
            }

            const currentZone = canvasElements[idx].zone || 'header';
            const targetZone = canvasElements[targetIdx].zone || 'header';

            // Neu phan tu chua duoc gan zone thi tu dong suy luan
            if (currentZone === targetZone) {
                const temp = canvasElements[idx];
                canvasElements[idx] = canvasElements[targetIdx];
                canvasElements[targetIdx] = temp;
                renderCanvas();
                renderPropsPanel();
            } else {
                alert(`Khối này thuộc [${currentZone.toUpperCase()}], không thể di chuyển sang [${targetZone.toUpperCase()}]!`);
            }
        }

        let canvasZoom = 1.0;

        function setCanvasZoom(val) {
            const wrapper = document.getElementById('canvas-scale-wrapper');
            const canvas = document.getElementById('paper-canvas');
            const viewport = document.getElementById('canvas-viewport');
            const text = document.getElementById('canvas-zoom-text');
            if (!wrapper || !canvas) return;

            if (val === 'fit') {
                if (viewport && canvas.offsetWidth > 0) {
                    const availableW = viewport.clientWidth - 30;
                    const cW = canvas.offsetWidth;
                    canvasZoom = Math.min(1.0, Math.max(0.4, Math.floor((availableW / cW) * 100) / 100));
                } else {
                    canvasZoom = 0.75;
                }
            } else if (typeof val === 'number') {
                canvasZoom = Math.min(1.5, Math.max(0.4, Math.round((canvasZoom + val) * 10) / 10));
            }

            wrapper.style.transform = `scale(${canvasZoom})`;
            if (text) text.innerText = Math.round(canvasZoom * 100) + '%';
        }

        function updateCanvasBadge() {
            const badge = document.getElementById('canvas-dim-badge');
            if (!badge) return;
            const dimLabels = {
                "A4-portrait": "A4 Dọc: 210 x 297 mm",
                "A4-landscape": "A4 Ngang: 297 x 210 mm",
                "A5-portrait": "A5 Dọc: 148 x 210 mm",
                "A5-landscape": "A5 Ngang: 210 x 148 mm",
                "K80": "K80: 80 mm",
                "K58": "K58: 58 mm"
            };
            badge.innerText = dimLabels[paperSize] || paperSize;
        }

        function changePaperSize(newSize) {
            // Luu layout hien tai vao memory
            if (canvasElements && canvasElements.length > 0) {
                multiTemplates.templates[paperSize] = JSON.parse(JSON.stringify(canvasElements));
            }
            paperSize = newSize;
            multiTemplates.active_size = newSize;

            // Nap layout cua kho moi
            if (multiTemplates.templates[newSize] && multiTemplates.templates[newSize].length > 0) {
                canvasElements = multiTemplates.templates[newSize];
            } else {
                canvasElements = getInitialElementsForSize(newSize);
                multiTemplates.templates[newSize] = canvasElements;
            }

            selectedElementId = null;
            const canvas = document.getElementById('paper-canvas');
            const dim = paperDimensions[newSize] || paperDimensions["A4-portrait"];
            canvas.style.width = dim.width;
            canvas.style.minHeight = dim.height;
            renderCanvas();
            renderPropsPanel();
            updateSidebarCheckboxes();
            updateCanvasBadge();
            if (newSize.includes('landscape')) setCanvasZoom('fit');
            else setCanvasZoom(1.0);
        }

        function getInitialElementsForSize(size) {
            if (size.startsWith('A4') || size.startsWith('A5')) {
                const isLandscape = size.includes('landscape');
                if (isLandscape && size.startsWith('A4')) {
                    return getB2BA4Template('A4-landscape');
                }
                const tWidth = isLandscape ? (size.startsWith('A4') ? 950 : 660) : (size.startsWith('A4') ? 680 : 460);
                const alignRightX = isLandscape ? (size.startsWith('A4') ? 680 : 420) : (size.startsWith('A4') ? 440 : 220);
                return [
                    { id: "e1", zone: "header", type: "text", text: "{{ten_cua_hang}}", label: "Tên Cửa Hàng", x: 30, y: 25, w: 350, fsz: 16, bold: true, align: "left" },
                    { id: "e2", zone: "header", type: "text", text: "Địa chỉ: {{dia_chi}}", label: "Địa Chỉ", x: 30, y: 50, w: 400, fsz: 11, bold: false, align: "left" },
                    { id: "e3", zone: "header", type: "text", text: "Hotline: {{so_dien_thoai}}", label: "SĐT Shop", x: 30, y: 70, w: 250, fsz: 11, bold: false, align: "left" },
                    { id: "e4", zone: "header", type: "text", text: "HÓA ĐƠN BÁN HÀNG", label: "Tiêu Đề", x: isLandscape ? 260 : 150, y: 105, w: 350, fsz: 20, bold: true, align: "center" },
                    { id: "e5", zone: "header", type: "text", text: "Mã đơn: {{ma_hoa_don}}", label: "Mã Đơn", x: 30, y: 150, w: 220, fsz: 11, bold: false, align: "left" },
                    { id: "e6", zone: "header", type: "text", text: "Ngày: {{ngay_gio}}", label: "Thời Gian", x: alignRightX, y: 150, w: 240, fsz: 11, bold: false, align: "right" },
                    { id: "e7", zone: "header", type: "text", text: "Khách hàng: {{ten_khach}} ({{sdt_khach}})", label: "Khách Hàng", x: 30, y: 175, w: 350, fsz: 11, bold: false, align: "left" },
                    { id: "e8", zone: "body", type: "table", label: "Bảng Danh Sách Món", x: 30, y: 205, w: tWidth, fsz: 11 },
                    { id: "e9", zone: "footer", type: "text", text: "Tổng tiền hàng: {{tong_tien}}", label: "Tổng Tiền", x: alignRightX, y: 290, w: 250, fsz: 12, bold: false, align: "right" },
                    { id: "e10", zone: "footer", type: "text", text: "Chiết khấu: {{giam_gia}}", label: "Giảm Giá", x: alignRightX, y: 315, w: 250, fsz: 12, bold: false, align: "right" },
                    { id: "e11", zone: "footer", type: "text", text: "KHÁCH PHẢI TRẢ: {{phai_tra}}", label: "Phải Trả", x: alignRightX, y: 345, w: 250, fsz: 15, bold: true, align: "right" },
                    { id: "e12", zone: "footer", type: "qr", label: "QR Code Thanh Toán", x: 30, y: 280, w: 130, h: 130 },
                    { id: "e13", zone: "footer", type: "text", text: "{{loi_cam_on}}", label: "Lời Cảm Ơn", x: isLandscape ? 220 : 120, y: 430, w: 400, fsz: 11, italic: true, align: "center" }
                ];
            } else if (size === 'K80') {
                return [
                    { id: "e1", zone: "header", type: "text", text: "{{ten_cua_hang}}", label: "Tên Cửa Hàng", x: 10, y: 10, w: 270, fsz: 14, bold: true, align: "center" },
                    { id: "e2", zone: "header", type: "text", text: "{{dia_chi}}", label: "Địa Chỉ", x: 10, y: 32, w: 270, fsz: 10, bold: false, align: "center" },
                    { id: "e3", zone: "header", type: "text", text: "SĐT: {{so_dien_thoai}}", label: "SĐT Shop", x: 10, y: 48, w: 270, fsz: 10, bold: false, align: "center" },
                    { id: "e4", zone: "header", type: "text", text: "HÓA ĐƠN BÁN HÀNG", label: "Tiêu Đề", x: 10, y: 70, w: 270, fsz: 14, bold: true, align: "center" },
                    { id: "e5", zone: "header", type: "text", text: "Mã: {{ma_hoa_don}} - {{ngay_gio}}", label: "Mã Đơn", x: 10, y: 92, w: 270, fsz: 10, bold: false, align: "center" },
                    { id: "e6", zone: "header", type: "text", text: "Khách: {{ten_khach}}", label: "Khách Hàng", x: 10, y: 110, w: 270, fsz: 10, bold: false, align: "left" },
                    { id: "e7", zone: "body", type: "table", label: "Bảng Danh Sách Món", x: 10, y: 130, w: 270, fsz: 10 },
                    { id: "e8", zone: "footer", type: "text", text: "Tổng tiền: {{tong_tien}}", label: "Tổng Tiền", x: 10, y: 200, w: 270, fsz: 11, bold: false, align: "right" },
                    { id: "e9", zone: "footer", type: "text", text: "KHÁCH TRẢ: {{phai_tra}}", label: "Phải Trả", x: 10, y: 220, w: 270, fsz: 13, bold: true, align: "right" },
                    { id: "e10", zone: "footer", type: "qr", label: "QR Code Thanh Toán", x: 75, y: 245, w: 130, h: 130 },
                    { id: "e11", zone: "footer", type: "text", text: "{{loi_cam_on}}", label: "Lời Cảm Ơn", x: 10, y: 390, w: 270, fsz: 10, italic: true, align: "center" }
                ];
            } else {
                // K58
                return [
                    { id: "e1", zone: "header", type: "text", text: "{{ten_cua_hang}}", label: "Tên Cửa Hàng", x: 5, y: 10, w: 195, fsz: 12, bold: true, align: "center" },
                    { id: "e2", zone: "header", type: "text", text: "SĐT: {{so_dien_thoai}}", label: "SĐT Shop", x: 5, y: 30, w: 195, fsz: 9, bold: false, align: "center" },
                    { id: "e3", zone: "header", type: "text", text: "HÓA ĐƠN", label: "Tiêu Đề", x: 5, y: 48, w: 195, fsz: 13, bold: true, align: "center" },
                    { id: "e4", zone: "header", type: "text", text: "Mã: {{ma_hoa_don}}", label: "Mã Đơn", x: 5, y: 68, w: 195, fsz: 9, bold: false, align: "center" },
                    { id: "e5", zone: "body", type: "table", label: "Bảng Danh Sách Món", x: 5, y: 88, w: 195, fsz: 9 },
                    { id: "e6", zone: "footer", type: "text", text: "PHẢI TRẢ: {{phai_tra}}", label: "Phải Trả", x: 5, y: 155, w: 195, fsz: 11, bold: true, align: "right" },
                    { id: "e7", zone: "footer", type: "qr", label: "QR Code Thanh Toán", x: 45, y: 175, w: 110, h: 110 },
                    { id: "e8", zone: "footer", type: "text", text: "{{loi_cam_on}}", label: "Lời Cảm Ơn", x: 5, y: 300, w: 195, fsz: 9, italic: true, align: "center" }
                ];
            }
        }

        function resetDefaultTemplate(size) {
            canvasElements = getInitialElementsForSize(size || paperSize);
            multiTemplates.templates[paperSize] = canvasElements;
            selectedElementId = null;
            renderCanvas();
            renderPropsPanel();
        }

        function selectElement(id) {
            selectedElementId = id;
            renderCanvas();
            renderPropsPanel();
        }

        function deleteSelectedElement() {
            if (!selectedElementId) return;
            canvasElements = canvasElements.filter(e => e.id !== selectedElementId);
            selectedElementId = null;
            renderCanvas();
            renderPropsPanel();
            updateSidebarCheckboxes();
        }

        const GRID_SIZE = 10; // px - snap grid
        const SNAP_THRESHOLD = 6; // px - khoang cach hut

        function renderCanvas() {
            const canvas = document.getElementById('paper-canvas');
            const mockData = {
                ten_cua_hang: currentSettings.shop_name || "CỬA HÀNG THỜI TRANG & DỊCH VỤ",
                dia_chi: currentSettings.shop_address || "123 Đường ABC, Quận 1",
                so_dien_thoai: currentSettings.shop_phone || "0909.123.456",
                loi_cam_on: currentSettings.shop_footer || "Cảm ơn quý khách và hẹn gặp lại!",
                ma_hoa_don: "HD2609130001",
                ngay_gio: new Date().toLocaleString('vi-VN'),
                thu_ngan: "Quản Lý",
                ten_khach: "Nguyễn Văn A",
                sdt_khach: "0987654321",
                tong_tien: "240.000 đ",
                giam_gia: "0 đ",
                phai_tra: "240.000 đ",
                khach_tra: "240.000 đ",
                con_no: "0 đ"
            };

            // Grid background
            let html = `<div class="canvas-grid" style="background-size: ${GRID_SIZE}px ${GRID_SIZE}px;"></div>`;

            // Snap guide container
            html += `<div id="snap-guides"></div>`;

            // Zone demarcation lines
            const zones = ['header', 'body', 'footer'];
            const zoneLabels = { header: '📌 ĐẦU TRANG', body: '📋 BẢNG HÀNG HÓA', footer: '💰 CHÂN TRANG' };
            const zoneColors = { header: '#0ea5e9', body: '#8b5cf6', footer: '#10b981' };

            zones.forEach(z => {
                const zElems = canvasElements.filter(e => (e.zone || 'header') === z);
                if (zElems.length === 0) return;
                const minY = Math.min(...zElems.map(e => e.y));
                html += `<div style="position: absolute; left: 0; right: 0; top: ${minY - 4}px; border-top: 1px dashed ${zoneColors[z]}; z-index: 2; pointer-events: none;">
                    <span style="position: absolute; right: 8px; top: -9px; background: white; color: ${zoneColors[z]}; font-size: 9px; font-weight: bold; padding: 1px 6px; border-radius: 4px; border: 1px solid ${zoneColors[z]}60; white-space: nowrap;">${zoneLabels[z]}</span>
                </div>`;
            });

            // Render elements with absolute positioning
            canvasElements.forEach((e, index) => {
                const isSel = e.id === selectedElementId ? 'selected' : '';
                let content = '';

                if (e.type === 'logo') {
                    content = currentSettings.shop_logo
                        ? `<img src="${currentSettings.shop_logo}" style="display: block; max-width: 100%; height: auto; pointer-events: none; margin: 0 auto;">`
                        : `<div style="border: 1px dashed #999; padding: 10px; font-size: 11px; text-align: center;">[Logo Cửa Hàng]</div>`;
                } else if (e.type === 'qr') {
                    content = getQRCodeHTML(240000, 'HD2609130001');
                } else if (e.type === 'table_b2b') {
                    content = `
                        <table style="width: 100%; border-collapse: collapse; font-size: ${e.fsz || 10}px; border: 1px solid #000; pointer-events: none;">
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
                                <tr style="border-bottom: 1px solid #ccc; text-align: center;">
                                    <td style="border: 1px solid #ccc; padding: 4px 2px;">1</td>
                                    <td style="border: 1px solid #ccc; padding: 4px 4px;">SP001</td>
                                    <td style="border: 1px solid #ccc; padding: 4px 4px; text-align: left; font-weight: 500;">Áo Thun Basic (Demo)</td>
                                    <td style="border: 1px solid #ccc; padding: 4px 2px;">Cái</td>
                                    <td style="border: 1px solid #ccc; padding: 4px 4px; text-align: right;">120.000</td>
                                    <td style="border: 1px solid #ccc; padding: 4px 2px; text-align: right;">0%</td>
                                    <td style="border: 1px solid #ccc; padding: 4px 2px; font-weight: bold;">2</td>
                                    <td style="border: 1px solid #ccc; padding: 4px 4px; text-align: right; font-weight: bold;">240.000</td>
                                    <td style="border: 1px solid #ccc; padding: 4px 4px; font-size: 9px; color: #666;">Size L</td>
                                </tr>
                            </tbody>
                        </table>
                    `;
                } else if (e.type === 'b2b_footer_boxes') {
                    content = `
                        <div style="display: grid; grid-template-columns: 1.2fr 1fr 1.3fr; gap: 8px; font-size: 10px; pointer-events: none;">
                            <div style="border: 1px solid #000; padding: 6px; border-radius: 2px;">
                                <div style="font-weight: bold; border-bottom: 0.5px solid #ccc; padding-bottom: 2px; margin-bottom: 4px; text-transform: uppercase;">💳 Thông Tin Thanh Toán</div>
                                <div>Ngân hàng: <b>${currentSettings.shop_bank_code || 'MB Bank'}</b></div>
                                <div>Số TK: <b>${currentSettings.shop_bank_account || '123456789'}</b></div>
                                <div>Chủ TK: <b>${currentSettings.shop_bank_owner || currentSettings.shop_name || 'CHỦ TÀI KHOẢN'}</b></div>
                                <div style="color: #555; font-size: 9px; margin-top: 3px;">Nội dung CK: <i>${mockData.ma_hoa_don}</i></div>
                            </div>
                            <div style="border: 1px solid #000; padding: 6px; border-radius: 2px; text-align: center; display: flex; flex-direction: column; align-items: center; justify-content: center;">
                                <div style="font-weight: bold; font-size: 9px; margin-bottom: 2px;">QUÉT MÃ VIETQR</div>
                                ${getQRCodeHTML(240000, mockData.ma_hoa_don)}
                            </div>
                            <div style="border: 1px solid #000; padding: 6px; border-radius: 2px;">
                                <div style="font-weight: bold; border-bottom: 0.5px solid #ccc; padding-bottom: 2px; margin-bottom: 4px; text-transform: uppercase;">💰 Tổng Kết Thanh Toán</div>
                                <div style="display: flex; justify-content: space-between; margin-bottom: 2px;"><span>Tổng tiền hàng:</span> <span>${mockData.tong_tien}</span></div>
                                <div style="display: flex; justify-content: space-between; margin-bottom: 2px;"><span>Chiết khấu:</span> <span>${mockData.giam_gia}</span></div>
                                <div style="display: flex; justify-content: space-between; font-weight: bold; font-size: 11px; margin-bottom: 2px; border-top: 1px dashed #999; padding-top: 2px;"><span>PHẢI TRẢ:</span> <span style="color: #b91c1c;">${mockData.phai_tra}</span></div>
                                <div style="display: flex; justify-content: space-between; margin-bottom: 2px;"><span>Khách đã trả:</span> <span>${mockData.khach_tra}</span></div>
                                <div style="display: flex; justify-content: space-between; font-weight: bold;"><span>Còn nợ lại:</span> <span>${mockData.con_no}</span></div>
                            </div>
                        </div>
                    `;
                } else if (e.type === 'signatures_3col') {
                    content = `
                        <div style="display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 8px; text-align: center; font-size: 11px; pointer-events: none;">
                            <div>
                                <div style="font-weight: bold; text-transform: uppercase;">Người Nhận Hàng</div>
                                <div style="font-size: 9px; font-style: italic; color: #555;">(Ký, ghi rõ họ tên)</div>
                                <div style="height: 50px;"></div>
                            </div>
                            <div>
                                <div style="font-weight: bold; text-transform: uppercase;">Thủ Kho</div>
                                <div style="font-size: 9px; font-style: italic; color: #555;">(Ký, ghi rõ họ tên)</div>
                                <div style="height: 50px;"></div>
                            </div>
                            <div>
                                <div style="font-weight: bold; text-transform: uppercase;">Kế Toán / Người Lập</div>
                                <div style="font-size: 9px; font-style: italic; color: #555;">(Ký, ghi rõ họ tên)</div>
                                <div style="height: 50px;"></div>
                            </div>
                        </div>
                    `;
                } else if (e.type === 'table') {
                    content = `
                        <table style="width: 100%; border-collapse: collapse; font-size: ${e.fsz || 12}px; border-top: 1px dashed #000; border-bottom: 1px dashed #000; pointer-events: none;">
                            <thead style="border-bottom: 1px dashed #000;">
                                <tr>
                                    <th style="text-align: left; padding: 4px 0;">Tên sản phẩm</th>
                                    <th style="text-align: center; width: 40px;">SL</th>
                                    <th style="text-align: right; width: 80px;">Đơn giá</th>
                                    <th style="text-align: right; width: 90px;">Thành tiền</th>
                                </tr>
                            </thead>
                            <tbody>
                                <tr style="border-bottom: 0.5px dotted #ccc;">
                                    <td style="padding: 4px 0;">Áo Thun Basic (Demo)</td>
                                    <td style="text-align: center;">2</td>
                                    <td style="text-align: right;">120.000 đ</td>
                                    <td style="text-align: right;">240.000 đ</td>
                                </tr>
                            </tbody>
                        </table>
                    `;
                } else {
                    let txt = e.text || '';
                    txt = txt.replace(/{{ten_cua_hang}}/g, mockData.ten_cua_hang);
                    txt = txt.replace(/{{dia_chi}}/g, mockData.dia_chi);
                    txt = txt.replace(/{{so_dien_thoai}}/g, mockData.so_dien_thoai);
                    txt = txt.replace(/{{loi_cam_on}}/g, mockData.loi_cam_on);
                    txt = txt.replace(/{{ma_hoa_don}}/g, mockData.ma_hoa_don);
                    txt = txt.replace(/{{ngay_gio}}/g, mockData.ngay_gio);
                    txt = txt.replace(/{{thu_ngan}}/g, mockData.thu_ngan);
                    txt = txt.replace(/{{ten_khach}}/g, mockData.ten_khach);
                    txt = txt.replace(/{{sdt_khach}}/g, mockData.sdt_khach);
                    txt = txt.replace(/{{tong_tien}}/g, mockData.tong_tien);
                    txt = txt.replace(/{{giam_gia}}/g, mockData.giam_gia);
                    txt = txt.replace(/{{phai_tra}}/g, mockData.phai_tra);
                    txt = txt.replace(/{{khach_tra}}/g, mockData.khach_tra);
                    txt = txt.replace(/{{con_no}}/g, mockData.con_no);
                    content = `<div style="font-size: ${e.fsz || 12}px; font-weight: ${e.bold ? 'bold' : 'normal'}; font-style: ${e.italic ? 'italic' : 'normal'}; text-align: ${e.align || 'left'}; pointer-events: none;">${txt}</div>`;
                }

                const resizeHandleHTML = isSel ? `<div class="resize-handle" title="Kéo sang ngang để chỉnh độ rộng" onmousedown="startResize(event, '${e.id}')"></div>` : '';

                html += `
                    <div id="${e.id}" class="canvas-element ${isSel}"
                         style="left: ${e.x || 0}px; top: ${e.y || 0}px; width: ${e.w ? e.w + 'px' : 'auto'};"
                         onmousedown="startDrag(event, '${e.id}')"
                         onclick="selectElement('${e.id}')">
                        ${content}
                        ${resizeHandleHTML}
                    </div>
                `;
            });

            canvas.innerHTML = html;
        }


        function renderPropsPanel() {
            const panel = document.getElementById('element-props-panel');
            const elem = canvasElements.find(e => e.id === selectedElementId);
            if (!elem) {
                panel.innerHTML = '<div class="text-gray-400 italic">Click vào một khối trên trang giấy để chỉnh sửa...</div>';
                return;
            }

            const zoneName = elem.zone === 'body' ? 'BẢNG HÀNG HÓA' : elem.zone === 'footer' ? 'CHÂN TRANG' : 'ĐẦU TRANG';
            const zoneColor = elem.zone === 'body' ? 'bg-blue-100 text-blue-800' : elem.zone === 'footer' ? 'bg-emerald-100 text-emerald-800' : 'bg-sky-100 text-sky-800';

            panel.innerHTML = `
                <div class="space-y-3">
                    <div class="flex items-center justify-between pb-1 border-b">
                        <span class="font-bold text-sky-700">${elem.label}</span>
                        <span class="text-[10px] px-2 py-0.5 rounded font-bold ${zoneColor}">VÙNG: ${zoneName}</span>
                    </div>

                    <div class="bg-amber-50 border border-amber-200 rounded p-2 text-xs">
                        <label class="block font-bold text-amber-900 mb-1">↕ Thứ tự trong phân vùng:</label>
                        <div class="grid grid-cols-2 gap-1.5">
                            <button onclick="moveElementOrder('${elem.id}', -1)" title="Đưa khối lên trên" class="py-1 px-2 border rounded bg-white hover:bg-amber-100 text-amber-800 font-bold flex items-center justify-center gap-1">
                                <span>▲ Lên trên</span>
                            </button>
                            <button onclick="moveElementOrder('${elem.id}', 1)" title="Đưa khối xuống dưới" class="py-1 px-2 border rounded bg-white hover:bg-amber-100 text-amber-800 font-bold flex items-center justify-center gap-1">
                                <span>▼ Xuống dưới</span>
                            </button>
                        </div>
                    </div>

                    <div class="grid grid-cols-2 gap-2">
                        <div>
                            <label class="block font-semibold text-xs mb-0.5">Vị trí X (px):</label>
                            <input type="number" class="border p-1 rounded w-full text-xs" value="${elem.x || 0}" oninput="updateProp('x', parseInt(this.value) || 0)">
                        </div>
                        <div>
                            <label class="block font-semibold text-xs mb-0.5">Vị trí Y (px):</label>
                            <input type="number" class="border p-1 rounded w-full text-xs" value="${elem.y || 0}" oninput="updateProp('y', parseInt(this.value) || 0)">
                        </div>
                    </div>

                    <div>
                        <label class="block font-semibold mb-1 text-xs">Căn vị trí trên trang:</label>
                        <div class="grid grid-cols-4 gap-1">
                            <button onclick="alignElement('left')" title="Căn sát lề trái" class="py-1 px-1.5 border rounded text-xs bg-gray-50 hover:bg-gray-200 text-gray-700 font-bold">⬅ Trái</button>
                            <button onclick="alignElement('center')" title="Đưa ra chính giữa trang" class="py-1 px-1.5 border rounded text-xs bg-sky-50 border-sky-300 text-sky-700 hover:bg-sky-100 font-bold">↔ Giữa</button>
                            <button onclick="alignElement('right')" title="Căn sát lề phải" class="py-1 px-1.5 border rounded text-xs bg-gray-50 hover:bg-gray-200 text-gray-700 font-bold">➡ Phải</button>
                            <button onclick="alignElement('full')" title="Kéo dãn đầy chiều ngang" class="py-1 px-1.5 border rounded text-xs bg-amber-50 border-amber-300 text-amber-800 hover:bg-amber-100 font-bold">⇱ Rộng</button>
                        </div>
                    </div>
                    ${elem.type === 'text' ? `
                    <div>
                        <label class="block font-semibold mb-1 text-xs">Nội dung text / biến:</label>
                        <input type="text" class="border p-1.5 rounded w-full text-xs" value="${elem.text || ''}" oninput="updateProp('text', this.value)">
                    </div>` : ''}
                    <div>
                        <div class="flex justify-between items-center mb-1">
                            <label class="block font-semibold text-xs">Độ rộng khối (px):</label>
                            <span class="text-[10px] text-sky-600">Hoặc kéo tay cầm 🟦 trên giấy</span>
                        </div>
                        <input id="prop-w" type="number" class="border p-1.5 rounded w-full text-xs" value="${elem.w || 200}" oninput="updateProp('w', parseInt(this.value) || 100)">
                    </div>
                    ${elem.fsz !== undefined ? `
                    <div>
                        <label class="block font-semibold mb-1">Kích thước chữ (px):</label>
                        <input type="number" class="border p-1.5 rounded w-full" value="${elem.fsz}" oninput="updateProp('fsz', parseInt(this.value) || 12)">
                    </div>` : ''}
                    <div class="grid grid-cols-2 gap-2">
                        ${elem.bold !== undefined ? `
                        <button onclick="updateProp('bold', !${elem.bold})" class="p-1.5 border rounded ${elem.bold ? 'bg-slate-800 text-white font-bold' : 'bg-white'}">In Đậm [B]</button>` : ''}
                        ${elem.italic !== undefined ? `
                        <button onclick="updateProp('italic', !${elem.italic})" class="p-1.5 border rounded ${elem.italic ? 'bg-slate-800 text-white italic' : 'bg-white'}">In Nghiêng [I]</button>` : ''}
                    </div>
                    ${elem.align !== undefined ? `
                    <div>
                        <label class="block font-semibold mb-1">Căn lề chữ:</label>
                        <div class="grid grid-cols-3 gap-1">
                            <button onclick="updateProp('align', 'left')" class="border p-1 rounded ${elem.align === 'left' ? 'bg-sky-600 text-white' : 'bg-white'}">Trái</button>
                            <button onclick="updateProp('align', 'center')" class="border p-1 rounded ${elem.align === 'center' ? 'bg-sky-600 text-white' : 'bg-white'}">Giữa</button>
                            <button onclick="updateProp('align', 'right')" class="border p-1 rounded ${elem.align === 'right' ? 'bg-sky-600 text-white' : 'bg-white'}">Phải</button>
                        </div>
                    </div>` : ''}
                    <div class="pt-3 border-t">
                        <button onclick="deleteSelectedElement()" class="w-full bg-red-50 text-red-600 hover:bg-red-100 border border-red-200 p-2 rounded font-bold">🗑️ Xóa Khối Này</button>
                    </div>
                </div>
            `;
        }

        function updateProp(prop, val) {
            const elem = canvasElements.find(e => e.id === selectedElementId);
            if (elem) {
                elem[prop] = val;
                renderCanvas();
                renderPropsPanel();
            }
        }

        // Mouse Drag & Resize Logic — snap-to-grid + snap-to-elements
        let isDragging = false;
        let isResizing = false;
        let dragElem = null;
        let startX, startY, origX, origY, origW;

        function snapToGrid(val) {
            return Math.round(val / GRID_SIZE) * GRID_SIZE;
        }

        function getSnapEdges(elem) {
            const w = elem.w || 200;
            const domEl = document.getElementById(elem.id);
            const h = domEl ? domEl.offsetHeight : 30;
            return {
                left: elem.x, right: elem.x + w, cx: elem.x + w / 2,
                top: elem.y, bottom: elem.y + h, cy: elem.y + h / 2,
                w, h
            };
        }

        function computeSnap(draggedElem) {
            const canvas = document.getElementById('paper-canvas');
            const cW = canvas.offsetWidth;
            const guides = [];
            const result = { x: draggedElem.x, y: draggedElem.y };
            const de = getSnapEdges(draggedElem);

            // Snap to canvas edges (left=0, center=cW/2, right=cW)
            const canvasAnchorsX = [0, cW / 2, cW];
            const canvasAnchorsY = [0]; // top edge

            // Collect edges from other elements
            const otherEdgesX = new Set(canvasAnchorsX);
            const otherEdgesY = new Set(canvasAnchorsY);

            canvasElements.forEach(e => {
                if (e.id === draggedElem.id) return;
                const oe = getSnapEdges(e);
                otherEdgesX.add(oe.left);
                otherEdgesX.add(oe.right);
                otherEdgesX.add(oe.cx);
                otherEdgesY.add(oe.top);
                otherEdgesY.add(oe.bottom);
                otherEdgesY.add(oe.cy);
            });

            let snappedX = false, snappedY = false;

            // Check X snapping: left, right, center of dragged vs each anchor
            const myXEdges = [
                { val: de.left, label: 'left' },
                { val: de.right, label: 'right' },
                { val: de.cx, label: 'cx' }
            ];

            for (const mx of myXEdges) {
                if (snappedX) break;
                for (const ax of otherEdgesX) {
                    if (Math.abs(mx.val - ax) < SNAP_THRESHOLD) {
                        const offset = mx.label === 'right' ? de.w : mx.label === 'cx' ? de.w / 2 : 0;
                        result.x = ax - offset;
                        guides.push({ type: 'v', pos: ax });
                        snappedX = true;
                        break;
                    }
                }
            }

            // Check Y snapping
            const myYEdges = [
                { val: de.top, label: 'top' },
                { val: de.bottom, label: 'bottom' },
                { val: de.cy, label: 'cy' }
            ];

            for (const my of myYEdges) {
                if (snappedY) break;
                for (const ay of otherEdgesY) {
                    if (Math.abs(my.val - ay) < SNAP_THRESHOLD) {
                        const offset = my.label === 'bottom' ? de.h : my.label === 'cy' ? de.h / 2 : 0;
                        result.y = ay - offset;
                        guides.push({ type: 'h', pos: ay });
                        snappedY = true;
                        break;
                    }
                }
            }

            // If not snapped to elements, snap to grid
            if (!snappedX) result.x = snapToGrid(result.x);
            if (!snappedY) result.y = snapToGrid(result.y);

            return { ...result, guides };
        }

        function showSnapGuides(guides) {
            const container = document.getElementById('snap-guides');
            if (!container) return;
            container.innerHTML = guides.map(g =>
                g.type === 'h'
                    ? `<div class="snap-guide snap-guide-h" style="top: ${g.pos}px;"></div>`
                    : `<div class="snap-guide snap-guide-v" style="left: ${g.pos}px;"></div>`
            ).join('');
        }

        function clearSnapGuides() {
            const container = document.getElementById('snap-guides');
            if (container) container.innerHTML = '';
        }

        function startDrag(e, id) {
            if (isResizing) return;
            if (e.target.classList.contains('resize-handle')) return;
            selectElement(id);
            isDragging = true;
            dragElem = canvasElements.find(el => el.id === id);
            if (!dragElem) return;
            startX = e.clientX;
            startY = e.clientY;
            origX = dragElem.x || 0;
            origY = dragElem.y || 0;
            e.stopPropagation();
            e.preventDefault();
        }

        function startResize(e, id) {
            e.stopPropagation();
            e.preventDefault();
            selectElement(id);
            isResizing = true;
            dragElem = canvasElements.find(el => el.id === id);
            if (!dragElem) return;
            startX = e.clientX;
            origW = dragElem.w || 200;
        }

        window.addEventListener('mousemove', (e) => {
            if (isResizing && dragElem) {
                const dx = e.clientX - startX;
                const newW = Math.max(50, snapToGrid(origW + dx));
                dragElem.w = newW;
                const propWInput = document.getElementById('prop-w');
                if (propWInput) propWInput.value = dragElem.w;
                const el = document.getElementById(dragElem.id);
                if (el) el.style.width = dragElem.w + 'px';
                return;
            }
            if (isDragging && dragElem) {
                const dx = e.clientX - startX;
                const dy = e.clientY - startY;
                dragElem.x = Math.max(0, origX + dx);
                dragElem.y = Math.max(0, origY + dy);

                // Compute snap
                const snap = computeSnap(dragElem);
                dragElem.x = Math.max(0, snap.x);
                dragElem.y = Math.max(0, snap.y);

                const el = document.getElementById(dragElem.id);
                if (el) {
                    el.style.left = dragElem.x + 'px';
                    el.style.top = dragElem.y + 'px';
                }

                showSnapGuides(snap.guides);
            }
        });

        window.addEventListener('mouseup', () => {
            if (isDragging) {
                isDragging = false;
                clearSnapGuides();
                renderCanvas();
                renderPropsPanel();
            }
            if (isResizing) {
                isResizing = false;
                renderCanvas();
                renderPropsPanel();
            }
        });

        function alignElement(mode) {
            if (!selectedElementId) return;
            const el = canvasElements.find(e => e.id === selectedElementId);
            if (!el) return;
            const canvas = document.getElementById('paper-canvas');
            const cW = canvas.offsetWidth;
            const elW = el.w || 200;

            if (mode === 'left') {
                el.x = 0;
            } else if (mode === 'center') {
                el.x = Math.round((cW - elW) / 2);
            } else if (mode === 'right') {
                el.x = Math.max(0, cW - elW);
            } else if (mode === 'full') {
                el.x = 0;
                el.w = cW;
            }
            renderCanvas();
            renderPropsPanel();
        }




        function ensureElementsHaveZone(elements) {
            return elements.map(e => {
                if (!e.zone) {
                    if (e.type === 'table') e.zone = 'body';
                    else if (['total', 'discount', 'final', 'paid', 'debt', 'qr', 'footer_msg'].some(k => (e.label||'').includes(k) || (e.text||'').includes(k) || (e.id||'').includes(k))) e.zone = 'footer';
                    else e.zone = 'header';
                }
                return e;
            });
        }

        async function loadSettings() {
            const res = await fetch('/api/settings');
            currentSettings = await res.json();
            if (currentSettings.print_blocks_config) {
                try {
                    const parsed = JSON.parse(currentSettings.print_blocks_config);
                    if (parsed.presets) {
                        multiTemplates = parsed;
                        const curPreset = multiTemplates.active_preset || "a4_b2b";
                        if (multiTemplates.presets[curPreset]) {
                            paperSize = multiTemplates.presets[curPreset].paper_size || "A4-portrait";
                            canvasElements = ensureElementsHaveZone(multiTemplates.presets[curPreset].elements);
                        } else {
                            paperSize = parsed.active_size || "A4-portrait";
                            canvasElements = getB2BA4Template();
                        }
                    } else if (parsed.templates) {
                        multiTemplates = parsed;
                        multiTemplates.presets = getDefaultPresets();
                        multiTemplates.active_preset = "a4_b2b";
                        paperSize = parsed.active_size || "A4-portrait";
                        canvasElements = ensureElementsHaveZone(multiTemplates.templates[paperSize] || getB2BA4Template());
                    } else {
                        multiTemplates = {
                            active_preset: "a4_b2b",
                            active_size: "A4-portrait",
                            presets: getDefaultPresets(),
                            templates: {}
                        };
                        paperSize = "A4-portrait";
                        canvasElements = getB2BA4Template();
                    }
                } catch(e) {
                    multiTemplates = {
                        active_preset: "a4_b2b",
                        active_size: "A4-portrait",
                        presets: getDefaultPresets(),
                        templates: {}
                    };
                    paperSize = "A4-portrait";
                    canvasElements = getB2BA4Template();
                }
            } else {
                multiTemplates = {
                    active_preset: "a4_b2b",
                    active_size: "A4-portrait",
                    presets: getDefaultPresets(),
                    templates: {}
                };
                paperSize = "A4-portrait";
                canvasElements = getB2BA4Template();
            }

            renderPresetSelect();
            document.getElementById('canvas-paper-size').value = paperSize;
            const canvas = document.getElementById('paper-canvas');
            const dim = paperDimensions[paperSize] || paperDimensions["A4-portrait"];
            canvas.style.width = dim.width;
            canvas.style.minHeight = dim.height;
            renderCanvas();
            renderPropsPanel();
            updateSidebarCheckboxes();
            updateCanvasBadge();
            if (paperSize.includes('landscape')) {
                setTimeout(() => setCanvasZoom('fit'), 100);
            }
        }

        async function saveCanvasTemplate() {
            await saveCurrentPreset();
        }

        function printTestTemplate() {
            const mockOrder = {
                code: "HD2609139999",
                created_at: new Date().toLocaleString('vi-VN'),
                staff_name: "Nguyễn Thu Ngân",
                customer_name: "Đại Lý Thức Ăn Thú Cưng Miền Nam",
                customer_phone: "0909.999.888",
                total_amount: 550000,
                discount: 50000,
                final_amount: 500000,
                paid_amount: 500000,
                debt_amount: 0,
                items: [
                    { product_code: "SP001", product_name: "Sữa Tắm Cho Mèo Pet Care", unit: "Chai", quantity: 2, price: 120000, subtotal: 240000, note: "Hương Lavender" },
                    { product_code: "SP002", product_name: "Pate Cho Chó Trưởng Thành", unit: "Hộp", quantity: 5, price: 35000, subtotal: 175000, note: "Vị Bò Rau Củ" },
                    { product_code: "SP003", product_name: "Xương Gặm Sạch Răng", unit: "Gói", quantity: 3, price: 45000, subtotal: 135000, note: "Size M" }
                ]
            };
            renderAndPrint(mockOrder);
        }

        function renderAndPrint(ord) {
            const printData = {
                ten_cua_hang: currentSettings.shop_name || "TÊN CỬA HÀNG",
                dia_chi: currentSettings.shop_address || "Địa chỉ shop",
                so_dien_thoai: currentSettings.shop_phone || "0900000000",
                loi_cam_on: currentSettings.shop_footer || "Cảm ơn quý khách!",
                ma_hoa_don: ord.code,
                ngay_gio: ord.created_at,
                thu_ngan: ord.staff_name || 'Thu ngân',
                ten_khach: ord.customer_name || 'Khách lẻ',
                sdt_khach: ord.customer_phone || '-',
                tong_tien: formatMoney(ord.total_amount),
                giam_gia: formatMoney(ord.discount),
                phai_tra: formatMoney(ord.final_amount),
                khach_tra: formatMoney(ord.paid_amount),
                con_no: formatMoney(ord.debt_amount),
                raw_phai_tra: ord.final_amount
            };

            const dim = paperDimensions[paperSize] || paperDimensions["A4-portrait"];

            // Lay kich thuoc canvas thuc te (px) de lam ty le chuan
            const canvasEl = document.getElementById('paper-canvas');
            const canvasW = canvasEl ? canvasEl.offsetWidth : 794;
            const canvasH = canvasEl ? canvasEl.offsetHeight : 1123;

            // Tinh deltaY: bang hang hoa co nhieu dong hon thiet ke
            const tableElem = canvasElements.find(e => e.type === 'table' || e.type === 'table_b2b');
            let deltaY = 0;
            if (tableElem && ord.items) {
                const isB2B = tableElem.type === 'table_b2b';
                const headerH = isB2B ? 34 : 28;
                const rowH = isB2B ? 28 : 28;
                const actualTableHeight = headerH + (ord.items.length * rowH) + 10;
                const tableBottom = (tableElem.y || 0) + actualTableHeight;

                const footerElems = canvasElements.filter(e => (e.zone || 'header') === 'footer');
                if (footerElems.length > 0) {
                    const minFooterY = Math.min(...footerElems.map(e => e.y || 0));
                    if (tableBottom + 15 > minFooterY) {
                        deltaY = (tableBottom + 15) - minFooterY;
                    }
                }
            }

            // Dung px giong canvas, in ra scale fit trang giay
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
            <div class="print-container" style="width: ${dim.width}; margin: 0 auto; background: white; overflow: hidden; position: relative;">
                <div class="print-inner" style="position: relative; width: ${canvasW}px; min-height: ${Math.min(canvasH, canvasH + deltaY)}px; font-family: monospace; page-break-inside: avoid; break-inside: avoid;">`;

            canvasElements.forEach(e => {
                let content = '';
                if (e.type === 'logo') {
                    if (currentSettings.shop_logo) content = `<img src="${currentSettings.shop_logo}" style="max-height: 100%; max-width: 100%;">`;
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
                                ${ord.items.map((it, idx) => `
                                <tr style="border-bottom: 1px solid #ccc; text-align: center;">
                                    <td style="border: 1px solid #ccc; padding: 4px 2px;">${idx + 1}</td>
                                    <td style="border: 1px solid #ccc; padding: 4px 4px;">${it.product_code || ''}</td>
                                    <td style="border: 1px solid #ccc; padding: 4px 4px; text-align: left; font-weight: 500;">${it.product_name}</td>
                                    <td style="border: 1px solid #ccc; padding: 4px 2px;">${it.unit || 'Cái'}</td>
                                    <td style="border: 1px solid #ccc; padding: 4px 4px; text-align: right;">${formatMoney(it.price)}</td>
                                    <td style="border: 1px solid #ccc; padding: 4px 2px; text-align: right;">0%</td>
                                    <td style="border: 1px solid #ccc; padding: 4px 2px; font-weight: bold;">${it.quantity}</td>
                                    <td style="border: 1px solid #ccc; padding: 4px 4px; text-align: right; font-weight: bold;">${formatMoney(it.quantity * it.price)}</td>
                                    <td style="border: 1px solid #ccc; padding: 4px 4px; font-size: 9px; color: #666;">-</td>
                                </tr>
                                `).join('')}
                            </tbody>
                        </table>
                    `;
                } else if (e.type === 'b2b_footer_boxes') {
                    content = `
                        <div style="display: grid; grid-template-columns: 1.2fr 1fr 1.3fr; gap: 8px; font-size: 10px;">
                            <div style="border: 1px solid #000; padding: 6px; border-radius: 2px;">
                                <div style="font-weight: bold; border-bottom: 0.5px solid #ccc; padding-bottom: 2px; margin-bottom: 4px; text-transform: uppercase;">💳 Thông Tin Thanh Toán</div>
                                <div>Ngân hàng: <b>${currentSettings.shop_bank_code || 'MB Bank'}</b></div>
                                <div>Số TK: <b>${currentSettings.shop_bank_account || '123456789'}</b></div>
                                <div>Chủ TK: <b>${currentSettings.shop_bank_owner || currentSettings.shop_name || 'CHỦ TÀI KHOẢN'}</b></div>
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
                                <div style="height: 50px;"></div>
                            </div>
                            <div>
                                <div style="font-weight: bold; text-transform: uppercase;">Thủ Kho</div>
                                <div style="font-size: 9px; font-style: italic; color: #555;">(Ký, ghi rõ họ tên)</div>
                                <div style="height: 50px;"></div>
                            </div>
                            <div>
                                <div style="font-weight: bold; text-transform: uppercase;">Kế Toán / Người Lập</div>
                                <div style="font-size: 9px; font-style: italic; color: #555;">(Ký, ghi rõ họ tên)</div>
                                <div style="height: 50px;"></div>
                            </div>
                        </div>
                    `;
                } else if (e.type === 'table') {
                    content = `
                        <table style="width: 100%; border-collapse: collapse; font-size: ${e.fsz || 12}px; border-top: 1px dashed #000; border-bottom: 1px dashed #000;">
                            <thead style="border-bottom: 1px dashed #000;">
                                <tr>
                                    <th style="text-align: left; padding: 4px 0;">Tên sản phẩm</th>
                                    <th style="text-align: center; width: 40px;">SL</th>
                                    <th style="text-align: right; width: 80px;">Đơn giá</th>
                                    <th style="text-align: right; width: 90px;">Thành tiền</th>
                                </tr>
                            </thead>
                            <tbody>
                                ${ord.items.map(it => `
                                <tr style="border-bottom: 0.5px dotted #ccc;">
                                    <td style="padding: 4px 0;">${it.product_name}</td>
                                    <td style="text-align: center;">${it.quantity}</td>
                                    <td style="text-align: right;">${formatMoney(it.price)}</td>
                                    <td style="text-align: right;">${formatMoney(it.quantity * it.price)}</td>
                                </tr>
                                `).join('')}
                            </tbody>
                        </table>
                    `;
                } else {
                    let txt = e.text || '';
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
                    txt = txt.replace(/{{phai_tra}}/g, printData.phai_tra);
                    txt = txt.replace(/{{khach_tra}}/g, printData.khach_tra);
                    txt = txt.replace(/{{con_no}}/g, printData.con_no);
                    content = `<div style="font-size: ${e.fsz || 12}px; font-weight: ${e.bold ? 'bold' : 'normal'}; font-style: ${e.italic ? 'italic' : 'normal'}; text-align: ${e.align || 'left'};">${txt}</div>`;
                }

                // deltaY cho footer elements
                let printY = e.y || 0;
                const isFooter = (e.zone || 'header') === 'footer';
                if (isFooter && deltaY > 0) {
                    printY += deltaY;
                }

                let elemW = e.w ? e.w + 'px' : 'auto';
                if (paperSize === 'A4-portrait' && e.w && e.w > 734 && (e.type === 'table_b2b' || e.type === 'b2b_footer_boxes' || e.type === 'signatures_3col')) {
                    elemW = '734px';
                } else if (paperSize === 'A4-landscape' && e.w && e.w > 980 && (e.type === 'table_b2b' || e.type === 'b2b_footer_boxes' || e.type === 'signatures_3col')) {
                    elemW = '980px';
                }

                html += `<div style="position: absolute; left: ${e.x || 0}px; top: ${printY}px; width: ${elemW};">${content}</div>`;
            });

            html += `</div></div>`;

            // Sau khi render, do va scale fit container
            const printArea = document.getElementById('print-area');
            printArea.innerHTML = html;

            // Scale print-inner to fit print-container
            requestAnimationFrame(() => {
                const container = printArea.querySelector('.print-container');
                const inner = printArea.querySelector('.print-inner');
                if (container && inner) {
                    const containerW = container.offsetWidth;
                    const innerW = inner.scrollWidth || canvasW;
                    if (innerW > containerW) {
                        const scale = containerW / innerW;
                        inner.style.transform = `scale(${scale})`;
                        inner.style.transformOrigin = 'top left';
                    }
                }
            });

            const pm = document.getElementById('print-modal');
            if (pm) {
                pm.classList.remove('hidden');
                pm.classList.add('flex');
            }
        }

        async function showPrintModal(orderCode) {
            if (!currentSettings.shop_name) {
                const resSet = await fetch('/api/settings');
                currentSettings = await resSet.json();
                if (currentSettings.print_blocks_config) {
                    try {
                        const parsed = JSON.parse(currentSettings.print_blocks_config);
                        if (parsed.presets) {
                            multiTemplates = parsed;
                            const curPreset = multiTemplates.active_preset || "a4_b2b";
                            if (multiTemplates.presets[curPreset]) {
                                paperSize = multiTemplates.presets[curPreset].paper_size || "A4-portrait";
                                canvasElements = multiTemplates.presets[curPreset].elements;
                            }
                        } else if (parsed.templates) {
                            multiTemplates = parsed;
                            paperSize = parsed.active_size || "A4-portrait";
                            canvasElements = multiTemplates.templates[paperSize] || getInitialElementsForSize(paperSize);
                        }
                    } catch(e) {}
                }
            }
            const res = await fetch(`/api/orders/${orderCode}`);
            const ord = await res.json();
            renderAndPrint(ord);
        }




        function closePrintModal() {
            const pm = document.getElementById('print-modal');
            if (pm) {
                pm.classList.add('hidden');
                pm.classList.remove('flex');
            }
        }

        // ==========================================
        // PHÂN HỆ GIA CÔNG OEM & DỰ BÁO DÒNG TIỀN
        // ==========================================
        let allOEMOrders = [];
        let allOEMForecastData = null;
        let currentForecastFilter = 'ALL';
        let currentReceivingOrder = null;

        async function loadOEMData() {
            await Promise.all([
                loadOEMOrders(),
                loadOEMCashflow()
            ]);
        }

        async function loadOEMOrders() {
            try {
                const statusFilter = document.getElementById('oem-filter-status')?.value || '';
                let url = '/api/oem/orders';
                if (statusFilter) url += `?status=${statusFilter}`;
                const res = await fetch(url);
                if (!res.ok) return;
                allOEMOrders = await res.json();
                renderOEMOrdersTable();
                updateOEMStats();
            } catch (err) {
                console.error("Lỗi tải đơn OEM:", err);
            }
        }

        function updateOEMStats() {
            const pendingOrders = allOEMOrders.filter(o => o.status === 'DRAFT' || o.status === 'DEPOSITED');
            const elPending = document.getElementById('oem-stat-pending-count');
            if (elPending) elPending.innerText = pendingOrders.length;

            const depositedCompany = allOEMOrders
                .filter(o => o.fund_source === 'COMPANY' && o.deposit_amount > 0)
                .reduce((sum, o) => sum + (o.deposit_amount || 0), 0);
            const elDep = document.getElementById('oem-stat-deposited-amount');
            if (elDep) elDep.innerText = formatMoney(depositedCompany);

            const elCount = document.getElementById('oem-order-count');
            if (elCount) elCount.innerText = `${allOEMOrders.length} đơn`;
        }

        function renderOEMOrdersTable() {
            const tbody = document.getElementById('table-oem-orders');
            if (!tbody) return;
            if (allOEMOrders.length === 0) {
                tbody.innerHTML = '<tr><td colspan="10" class="p-4 text-center text-gray-400">Chưa có đơn đặt gia công OEM nào. Nhấn "+ Tạo Đơn Đặt Gia Công Mới" để bắt đầu!</td></tr>';
                return;
            }

            tbody.innerHTML = allOEMOrders.map(o => {
                let statusBadge = '';
                if (o.status === 'DRAFT') {
                    statusBadge = '<span class="bg-gray-100 text-gray-700 px-2 py-0.5 rounded font-bold text-[10px]">Nháp (Chưa cọc)</span>';
                } else if (o.status === 'DEPOSITED') {
                    statusBadge = '<span class="bg-amber-100 text-amber-800 px-2 py-0.5 rounded font-bold text-[10px]">Đã cọc 50% (Đang SX)</span>';
                } else if (o.status === 'RECEIVED') {
                    statusBadge = '<span class="bg-emerald-100 text-emerald-800 px-2 py-0.5 rounded font-bold text-[10px]">✅ Đã nhận hàng</span>';
                } else {
                    statusBadge = `<span class="bg-slate-100 text-slate-700 px-2 py-0.5 rounded font-bold text-[10px]">${o.status}</span>`;
                }

                const fundBadge = o.fund_source === 'COMPANY'
                    ? '<span class="bg-blue-50 text-blue-700 border border-blue-200 px-1.5 py-0.5 rounded font-bold text-[10px]">🏢 Cty</span>'
                    : '<span class="bg-purple-50 text-purple-700 border border-purple-200 px-1.5 py-0.5 rounded font-bold text-[10px]">👤 Cá nhân</span>';

                const canReceive = o.status === 'DRAFT' || o.status === 'DEPOSITED';

                const totalAmt = o.total_final_amount || 0;
                const depositAmt = o.deposit_amount || 0;
                const remainingAmt = o.remaining_payment !== undefined && o.remaining_payment !== null ? o.remaining_payment : (totalAmt - depositAmt);

                let dot1Html = '';
                let dot2Html = '';

                if (remainingAmt <= 0) {
                    // Đã thanh toán đủ 100%
                    dot1Html = `<span class="text-emerald-700 font-bold">${formatMoney(totalAmt)}</span><span class="text-[10px] text-emerald-600 block">Đủ 100%</span>`;
                    dot2Html = `<span class="inline-flex items-center gap-1 text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded font-bold text-[11px] border border-emerald-200">✅ Đã xong (0 đ)</span>`;
                } else if (depositAmt > 0) {
                    // Đã cọc 1 phần, còn nợ đợt 2
                    const pct = totalAmt > 0 ? Math.round((depositAmt / totalAmt) * 100) : 50;
                    dot1Html = `<span class="text-emerald-700 font-bold">${formatMoney(depositAmt)}</span><span class="text-[10px] text-emerald-600 block">Đã cọc ${pct}%</span>`;
                    dot2Html = `<span class="font-mono font-bold text-amber-700 bg-amber-50 px-1.5 py-0.5 rounded border border-amber-200">${formatMoney(remainingAmt)}</span><span class="text-[10px] text-amber-600 block">Còn thiếu ${100 - pct}%</span>`;
                } else {
                    // Chưa thanh toán đợt nào
                    dot1Html = `<span class="text-gray-400 font-mono">0 đ</span><span class="text-[10px] text-gray-400 block">Chưa cọc</span>`;
                    dot2Html = `<span class="font-mono font-bold text-rose-700 bg-rose-50 px-1.5 py-0.5 rounded border border-rose-200">${formatMoney(remainingAmt)}</span><span class="text-[10px] text-rose-600 block">Nợ 100%</span>`;
                }

                return `
                    <tr class="border-b hover:bg-slate-50 transition">
                        <td class="p-2.5 font-mono font-bold text-amber-700">${o.code}</td>
                        <td class="p-2.5 font-bold text-slate-800">${o.partner_name || 'Xưởng gia công'}</td>
                        <td class="p-2.5 text-slate-600 font-medium">🏭 ${o.oem_warehouse_name || 'Kho xưởng'}</td>
                        <td class="p-2.5 text-center font-mono text-slate-700">
                            ${o.expected_delivery_date ? `<span title="Trừ hao ±1 ngày">${o.expected_delivery_date}</span>` : '<span class="text-gray-400">---</span>'}
                        </td>
                        <td class="p-2.5 text-center">${fundBadge}</td>
                        <td class="p-2.5 text-right font-mono font-bold text-slate-800">${formatMoney(o.total_final_amount)}</td>
                        <td class="p-2.5 text-right font-mono">${dot1Html}</td>
                        <td class="p-2.5 text-right font-mono">${dot2Html}</td>
                        <td class="p-2.5 text-center">${statusBadge}</td>
                        <td class="p-2.5 text-center space-x-1 whitespace-nowrap">
                            <button onclick="viewOEMOrderDetail(${o.id})" class="text-xs bg-slate-100 text-slate-700 hover:bg-slate-200 px-2 py-1 rounded font-bold" title="Xem chi tiết đơn và vật tư BOM">🔍 Chi tiết</button>
                            ${canReceive ? `
                                <button onclick="openModalReceiveOEM(${o.id})" class="text-xs bg-amber-600 hover:bg-amber-700 text-white px-2 py-1 rounded font-bold shadow" title="Nhận hàng thực tế từ xưởng & trừ kho tem chai">📥 Nhận hàng</button>
                                <button onclick="openModalEditOEM(${o.id})" class="text-xs bg-sky-50 text-sky-700 hover:bg-sky-100 border border-sky-200 px-2 py-1 rounded font-bold" title="Sửa đơn đặt gia công">✏️ Sửa</button>
                                <button onclick="deleteOEMOrder(${o.id}, '${o.code}')" class="text-xs bg-white text-rose-600 hover:bg-rose-50 border border-rose-200 px-2 py-1 rounded font-bold" title="Hủy đơn, hoàn cọc nếu có">✕ Hủy</button>
                            ` : ''}
                        </td>
                    </tr>
                `;
            }).join('');
        }

        async function loadOEMCashflow() {
            try {
                const res = await fetch('/api/oem/cashflow-forecast');
                if (!res.ok) return;
                allOEMForecastData = await res.json();

                const elFcCty = document.getElementById('oem-stat-forecast-company');
                if (elFcCty) elFcCty.innerText = formatMoney(allOEMForecastData.total_company);

                const elFcPer = document.getElementById('oem-stat-forecast-personal');
                if (elFcPer) elFcPer.innerText = formatMoney(allOEMForecastData.total_personal);

                renderCashflowForecast();
            } catch (err) {
                console.error("Lỗi tải dự báo dòng tiền:", err);
            }
        }

        function filterCashflowForecast(fund) {
            currentForecastFilter = fund;
            const btnAll = document.getElementById('cf-filter-all');
            const btnCty = document.getElementById('cf-filter-company');
            const btnPer = document.getElementById('cf-filter-personal');

            [btnAll, btnCty, btnPer].forEach(b => {
                if (b) {
                    b.className = 'px-2.5 py-1 rounded font-bold hover:bg-slate-700 text-slate-300';
                }
            });

            if (fund === 'ALL' && btnAll) btnAll.className = 'px-2.5 py-1 rounded font-bold bg-amber-500 text-slate-900';
            else if (fund === 'COMPANY' && btnCty) btnCty.className = 'px-2.5 py-1 rounded font-bold bg-blue-500 text-white';
            else if (fund === 'PERSONAL' && btnPer) btnPer.className = 'px-2.5 py-1 rounded font-bold bg-purple-500 text-white';

            renderCashflowForecast();
        }

        function renderCashflowForecast() {
            const container = document.getElementById('oem-forecast-list');
            if (!container || !allOEMForecastData) return;

            let items = allOEMForecastData.items || [];
            if (currentForecastFilter !== 'ALL') {
                items = items.filter(i => i.fund_source === currentForecastFilter);
            }

            if (items.length === 0) {
                container.innerHTML = '<div class="text-center py-3 text-slate-400 text-xs italic">Không có khoản chi dự báo nào trong khoảng thời gian này.</div>';
                return;
            }

            container.innerHTML = items.map(it => {
                const dateStr = it.expected_delivery_date || 'Chưa định ngày';
                const isCty = it.fund_source === 'COMPANY';
                return `
                    <div class="flex flex-wrap items-center justify-between bg-slate-800/90 hover:bg-slate-800 p-2.5 rounded-lg border border-slate-700 text-xs gap-2">
                        <div class="flex items-center gap-2">
                            <span class="px-2 py-0.5 rounded font-mono font-bold text-[10px] ${isCty ? 'bg-blue-900 text-blue-300 border border-blue-700' : 'bg-purple-900 text-purple-300 border border-purple-700'}">
                                ${isCty ? '🏢 Quỹ Cty' : '👤 Cá Nhân'}
                            </span>
                            <div>
                                <span class="font-bold text-amber-300">${it.code}</span> - 
                                <span class="text-slate-200">${it.partner_name || 'Nhà cung cấp'}</span>
                                <span class="text-[10px] text-slate-400 ml-1">(${it.order_type === 'OEM' ? 'Gia công OEM' : 'Nhập hàng'})</span>
                            </div>
                        </div>
                        <div class="flex items-center gap-4">
                            <div class="text-right">
                                <div class="text-[10px] text-slate-400">Hạn nhận (trừ hao ±1 ngày):</div>
                                <div class="font-mono text-slate-200 font-bold">📅 ${dateStr}</div>
                            </div>
                            <div class="text-right">
                                <div class="text-[10px] text-slate-400">Dự kiến chi:</div>
                                <div class="font-mono font-bold text-amber-400 text-sm">${formatMoney(it.amount)}</div>
                            </div>
                        </div>
                    </div>
                `;
            }).join('');
        }

        // --- MODAL: TẠO ĐƠN GIA CÔNG OEM ---
        let allOEMFactories = [];
        let currentFactoryProducts = [];
        let selectedOEMFactory = null;
        let editingOEMOrderId = null;

        async function openModalCreateOEM() {
            editingOEMOrderId = null;
            // Tải danh bạ, kho và sản phẩm nếu chưa có
            if (!allContacts || allContacts.length === 0) {
                if (typeof loadContacts === 'function') await loadContacts();
            }
            if (!allWarehouses || allWarehouses.length === 0) {
                try {
                    const resWh = await fetch('/api/warehouses');
                    if (resWh.ok) allWarehouses = await resWh.json();
                } catch(e) {}
            }
            if (!allProducts || allProducts.length === 0) {
                if (typeof loadProducts === 'function') await loadProducts();
            }

            // Tải danh sách nhà máy gia công có kho
            await loadOEMFactoriesList();

            // Populate Kho nhận thành phẩm (mặc định Kho Tổng)
            const destWhSel = document.getElementById('oem-create-dest-warehouse');
            if (destWhSel && allWarehouses) {
                destWhSel.innerHTML = allWarehouses.map(w => `<option value="${w.id}">📦 ${w.name} ${w.is_oem ? '(Kho Xưởng)' : ''}</option>`).join('');
                destWhSel.value = "1";
            }

            // Reset form nhà máy
            clearOEMFactorySelection();

            // Gán ngày hẹn mặc định là 5 ngày sau
            const today = new Date();
            today.setDate(today.getDate() + 5);
            document.getElementById('oem-create-date').value = today.toISOString().split('T')[0];

            document.getElementById('oem-create-discount').value = '5';
            document.getElementById('oem-create-vat').value = '8';
            document.getElementById('oem-create-fund').value = 'COMPANY';
            document.getElementById('oem-create-deposit').value = '0';
            document.getElementById('oem-create-note').value = '';

            const itemsBody = document.getElementById('oem-create-items-body');
            if (itemsBody) {
                itemsBody.innerHTML = '';
            }

            recalcCreateOEMMath();
            document.getElementById('modal-create-oem').classList.remove('hidden');
        }

        function closeModalCreateOEM() {
            document.getElementById('modal-create-oem')?.classList.add('hidden');
            hideAllOEMPopups();
            editingOEMOrderId = null;
            const depositInp = document.getElementById('oem-create-deposit');
            if (depositInp) depositInp.disabled = false;
            const btnSubmit = document.getElementById('btn-submit-create-oem');
            if (btnSubmit) btnSubmit.innerText = '🚀 Lưu Đơn & Xuất Cọc Sổ Quỹ';
        }

        async function loadOEMFactoriesList() {
            try {
                const res = await fetch('/api/oem/factories');
                if (res.ok) {
                    allOEMFactories = await res.json();
                }
            } catch (e) {
                console.error('Lỗi tải danh sách nhà máy gia công:', e);
            }
        }

        function showOEMFactoryDropdown() {
            const menu = document.getElementById('oem-factory-dropdown-menu');
            if (!menu) return;
            filterOEMFactoryDropdown(document.getElementById('oem-factory-search-input')?.value || '');
            menu.classList.remove('hidden');
        }

        function filterOEMFactoryDropdown(searchVal) {
            const menu = document.getElementById('oem-factory-dropdown-menu');
            if (!menu) return;
            const q = (searchVal || '').toLowerCase().trim();
            const filtered = allOEMFactories.filter(f => 
                f.name.toLowerCase().includes(q) || 
                (f.phone && f.phone.includes(q)) || 
                (f.warehouse_name && f.warehouse_name.toLowerCase().includes(q))
            );

            if (filtered.length === 0) {
                menu.innerHTML = `
                    <div class="p-3 text-center text-gray-500 text-xs">
                        Không tìm thấy nhà máy có kho phù hợp.<br>
                        <button type="button" onclick="openModalManageOEMFactories()" class="mt-1 text-amber-700 font-bold underline">⚙️ Gán kho cho nhà máy khác</button>
                    </div>
                `;
            } else {
                menu.innerHTML = filtered.map(f => `
                    <div onclick="selectOEMFactory(${f.id})" class="p-2.5 hover:bg-amber-50 cursor-pointer flex justify-between items-center text-xs transition">
                        <div>
                            <div class="font-bold text-slate-800 flex items-center gap-1.5">
                                <span>🏭 ${f.name}</span>
                                ${f.phone ? `<span class="text-gray-400 text-[10px]">(${f.phone})</span>` : ''}
                            </div>
                            <div class="text-[11px] text-emerald-700 font-medium flex items-center gap-1 mt-0.5">
                                <span>📦 Kho xưởng:</span>
                                <strong class="underline">${f.warehouse_name}</strong>
                            </div>
                        </div>
                        <div class="text-right">
                            <span class="bg-amber-100 text-amber-900 font-bold px-2 py-0.5 rounded text-[10px]">${f.product_count} SP gia công</span>
                        </div>
                    </div>
                `).join('');
            }
            menu.classList.remove('hidden');
        }

        async function selectOEMFactory(factoryId) {
            const factory = allOEMFactories.find(f => f.id === factoryId);
            if (!factory) return;

            selectedOEMFactory = factory;
            document.getElementById('oem-create-partner').value = factory.id;
            document.getElementById('oem-create-warehouse').value = factory.warehouse_id;
            
            const searchInput = document.getElementById('oem-factory-search-input');
            if (searchInput) searchInput.value = `🏭 ${factory.name}`;

            const badge = document.getElementById('oem-factory-badge');
            const whName = document.getElementById('oem-factory-wh-name');
            if (badge && whName) {
                whName.innerText = factory.warehouse_name;
                badge.classList.remove('hidden');
            }

            document.getElementById('oem-factory-clear-btn')?.classList.remove('hidden');
            document.getElementById('oem-factory-dropdown-menu')?.classList.add('hidden');

            // Tải danh sách sản phẩm thuộc xưởng này
            try {
                const res = await fetch(`/api/oem/factories/${factory.id}/products`);
                if (res.ok) {
                    currentFactoryProducts = await res.json();
                } else {
                    currentFactoryProducts = [];
                }
            } catch (e) {
                currentFactoryProducts = [];
            }

            // Cập nhật hint sản phẩm
            const hint = document.getElementById('oem-prod-filter-hint');
            if (hint) {
                hint.innerText = `Đang hiển thị ${currentFactoryProducts.length} sản phẩm cấu hình cho xưởng ${factory.name}`;
            }

            const btnAddProd = document.getElementById('btn-add-prod-to-factory');
            if (btnAddProd) btnAddProd.classList.remove('hidden');

            // Reset và thêm 1 dòng sản phẩm sẵn sàng
            const itemsBody = document.getElementById('oem-create-items-body');
            if (itemsBody) {
                itemsBody.innerHTML = '';
                addOEMProductRow();
            }

            recalcCreateOEMMath();
        }

        function clearOEMFactorySelection() {
            selectedOEMFactory = null;
            currentFactoryProducts = [];
            document.getElementById('oem-create-partner').value = '';
            document.getElementById('oem-create-warehouse').value = '';
            
            const searchInput = document.getElementById('oem-factory-search-input');
            if (searchInput) searchInput.value = '';

            document.getElementById('oem-factory-badge')?.classList.add('hidden');
            document.getElementById('oem-factory-clear-btn')?.classList.add('hidden');
            document.getElementById('oem-factory-dropdown-menu')?.classList.add('hidden');

            const hint = document.getElementById('oem-prod-filter-hint');
            if (hint) hint.innerText = 'Vui lòng chọn nhà máy trước để lọc sản phẩm';

            document.getElementById('btn-add-prod-to-factory')?.classList.add('hidden');

            const itemsBody = document.getElementById('oem-create-items-body');
            if (itemsBody) itemsBody.innerHTML = '';

            recalcCreateOEMMath();
        }

        // Đóng dropdown khi click ra ngoài
        document.addEventListener('click', function(e) {
            const factoryInput = document.getElementById('oem-factory-search-input');
            const factoryMenu = document.getElementById('oem-factory-dropdown-menu');
            if (factoryMenu && !factoryMenu.contains(e.target) && e.target !== factoryInput) {
                factoryMenu.classList.add('hidden');
            }

            // Đóng các popup sản phẩm
            document.querySelectorAll('.oem-prod-popup-menu').forEach(popup => {
                const row = popup.closest('.oem-item-row');
                const inp = row?.querySelector('.oem-prod-search-input');
                if (popup && !popup.contains(e.target) && e.target !== inp) {
                    popup.classList.add('hidden');
                }
            });
        });

        function hideAllOEMPopups() {
            document.getElementById('oem-factory-dropdown-menu')?.classList.add('hidden');
            document.querySelectorAll('.oem-prod-popup-menu').forEach(p => p.classList.add('hidden'));
        }

        // Thêm dòng sản phẩm dạng Combobox Popup Search
        function addOEMProductRow() {
            const itemsBody = document.getElementById('oem-create-items-body');
            if (!itemsBody) return;
            const tr = document.createElement('tr');
            tr.className = 'border-b hover:bg-slate-50 oem-item-row relative';
            tr.innerHTML = `
                <td class="p-2 relative">
                    <div class="relative">
                        <input type="text" 
                            placeholder="🔍 Gõ tìm sản phẩm gia công..." 
                            autocomplete="off"
                            onclick="showOEMProductPopup(this)" 
                            oninput="filterOEMProductPopup(this)"
                            class="oem-prod-search-input border p-1.5 rounded w-full font-bold text-slate-800 bg-white pr-7 text-xs focus:ring-1 focus:ring-amber-500">
                        <input type="hidden" class="oem-prod-id" value="">
                        <input type="hidden" class="oem-prod-unit" value="chai">
                        <button type="button" onclick="clearOEMRowProduct(this)" class="oem-row-clear-btn hidden absolute right-2 top-2 text-gray-400 hover:text-rose-600 font-bold text-xs">✕</button>
                    </div>
                    <!-- Popup danh sách sản phẩm -->
                    <div class="oem-prod-popup-menu hidden absolute left-2 right-2 top-full mt-1 bg-white border border-slate-300 rounded-lg shadow-2xl z-50 max-h-52 overflow-y-auto divide-y text-xs">
                    </div>
                </td>
                <td class="p-2">
                    <input type="number" step="any" min="1" value="1000" class="oem-prod-qty border p-1.5 rounded w-full text-right font-mono font-bold text-slate-800" oninput="recalcCreateOEMMath()">
                </td>
                <td class="p-2">
                    <input type="number" step="any" min="0" value="18288" class="oem-prod-price border p-1.5 rounded w-full text-right font-mono font-bold text-slate-800" oninput="recalcCreateOEMMath()">
                </td>
                <td class="p-2 text-right font-mono font-bold text-slate-700 oem-row-total">
                    18.288.000 đ
                </td>
                <td class="p-2 text-center">
                    <button type="button" onclick="removeOEMProductRow(this)" class="text-rose-500 hover:text-rose-700 font-bold text-sm">✕</button>
                </td>
            `;
            itemsBody.appendChild(tr);

            // Nếu nhà máy có sản phẩm và chỉ có 1-2 sản phẩm, tự động gợi ý
            if (currentFactoryProducts.length > 0 && itemsBody.children.length === 1) {
                const firstProd = currentFactoryProducts[0];
                const searchInp = tr.querySelector('.oem-prod-search-input');
                const idInp = tr.querySelector('.oem-prod-id');
                const priceInp = tr.querySelector('.oem-prod-price');
                const clearBtn = tr.querySelector('.oem-row-clear-btn');
                if (searchInp && idInp) {
                    idInp.value = firstProd.id;
                    searchInp.value = `${firstProd.code ? '['+firstProd.code+'] ' : ''}${firstProd.name}`;
                    if (firstProd.cost_price > 0 && priceInp) priceInp.value = firstProd.cost_price;
                    if (clearBtn) clearBtn.classList.remove('hidden');
                }
            }

            recalcCreateOEMMath();
        }

        function removeOEMProductRow(btn) {
            const tr = btn.closest('tr');
            if (tr) tr.remove();
            recalcCreateOEMMath();
        }

        function clearOEMRowProduct(btn) {
            const row = btn.closest('.oem-item-row');
            if (!row) return;
            row.querySelector('.oem-prod-search-input').value = '';
            row.querySelector('.oem-prod-id').value = '';
            btn.classList.add('hidden');
            recalcCreateOEMMath();
        }

        function showOEMProductPopup(inputEl) {
            const row = inputEl.closest('.oem-item-row');
            if (!row) return;
            const popup = row.querySelector('.oem-prod-popup-menu');
            if (!popup) return;
            filterOEMProductPopup(inputEl);
            popup.classList.remove('hidden');
        }

        function filterOEMProductPopup(inputEl) {
            const row = inputEl.closest('.oem-item-row');
            if (!row) return;
            const popup = row.querySelector('.oem-prod-popup-menu');
            if (!popup) return;

            if (!selectedOEMFactory) {
                popup.innerHTML = `
                    <div class="p-3 text-center text-amber-800 bg-amber-50 font-medium">
                        ⚠️ Vui lòng chọn Nhà Máy Gia Công ở trên trước!
                    </div>
                `;
                popup.classList.remove('hidden');
                return;
            }

            const q = (inputEl.value || '').toLowerCase().trim();
            const sourceList = currentFactoryProducts.length > 0 ? currentFactoryProducts : (allProducts || []);
            const filtered = sourceList.filter(p => 
                p.name.toLowerCase().includes(q) || 
                (p.code && p.code.toLowerCase().includes(q))
            );

            if (filtered.length === 0) {
                popup.innerHTML = `
                    <div class="p-3 text-center text-gray-500">
                        Không tìm thấy sản phẩm phù hợp.<br>
                        <button type="button" onclick="openModalAddProductToFactory()" class="mt-1 text-emerald-700 font-bold underline">+ Gán thêm sản phẩm cho xưởng này</button>
                    </div>
                `;
            } else {
                popup.innerHTML = filtered.map(p => `
                    <div onclick="selectOEMProductItem(this, ${p.id})" class="p-2 hover:bg-amber-50 cursor-pointer flex justify-between items-center transition">
                        <div>
                            <div class="font-bold text-slate-800">${p.code ? '['+p.code+'] ' : ''}${p.name}</div>
                            <div class="text-[10px] text-gray-500">ĐVT: ${p.unit || 'chai'} | Giá gốc: ${formatMoney(p.cost_price||0)}</div>
                        </div>
                        <div class="text-right">
                            <span class="text-[10px] ${p.bom_count > 0 ? 'bg-emerald-100 text-emerald-800' : 'bg-gray-100 text-gray-600'} px-1.5 py-0.5 rounded font-bold">
                                ${p.bom_count > 0 ? 'Có định mức BOM' : 'Chưa có BOM'}
                            </span>
                        </div>
                    </div>
                `).join('');
            }
            popup.classList.remove('hidden');
        }

        function selectOEMProductItem(itemEl, productId) {
            const row = itemEl.closest('.oem-item-row');
            if (!row) return;

            const p = (currentFactoryProducts.length > 0 ? currentFactoryProducts : allProducts).find(x => x.id === productId);
            if (!p) return;

            const searchInp = row.querySelector('.oem-prod-search-input');
            const idInp = row.querySelector('.oem-prod-id');
            const unitInp = row.querySelector('.oem-prod-unit');
            const clearBtn = row.querySelector('.oem-row-clear-btn');
            const priceInp = row.querySelector('.oem-prod-price');

            if (searchInp) searchInp.value = `${p.code ? '['+p.code+'] ' : ''}${p.name}`;
            if (idInp) idInp.value = p.id;
            if (unitInp) unitInp.value = p.unit || 'chai';
            if (clearBtn) clearBtn.classList.remove('hidden');

            // Đơn giá niêm yết: nếu sản phẩm có giá vốn thì lấy, không thì giữ mặc định
            if (p.cost_price > 0 && priceInp) {
                priceInp.value = p.cost_price;
            }

            const popup = row.querySelector('.oem-prod-popup-menu');
            if (popup) popup.classList.add('hidden');

            recalcCreateOEMMath();
        }

        // Tính toán số tiền & đối chiếu tồn kho BOM thực tế
        async function recalcCreateOEMMath() {
            const rows = document.querySelectorAll('.oem-item-row');
            let totalRaw = 0;
            const selectedItems = [];

            rows.forEach(r => {
                const prodId = parseInt(r.querySelector('.oem-prod-id')?.value);
                const qtyInput = r.querySelector('.oem-prod-qty');
                const priceInput = r.querySelector('.oem-prod-price');
                const totalCell = r.querySelector('.oem-row-total');

                const qty = parseFloat(qtyInput?.value) || 0;
                const price = parseFloat(priceInput?.value) || 0;
                const rowTotal = qty * price;
                totalRaw += rowTotal;

                if (totalCell) totalCell.innerText = formatMoney(rowTotal);
                if (prodId && qty > 0) {
                    selectedItems.push({ product_id: prodId, quantity: qty });
                }
            });

            const discountPct = parseFloat(document.getElementById('oem-create-discount')?.value) || 0;
            const vatPct = parseFloat(document.getElementById('oem-create-vat')?.value) || 0;

            const discountAmount = totalRaw * (discountPct / 100);
            const rawAfterDiscount = totalRaw - discountAmount;
            const vatAmount = totalRaw * (vatPct / 100); // VAT trên giá thô
            const totalFinal = rawAfterDiscount + vatAmount;

            document.getElementById('oem-math-raw').innerText = formatMoney(totalRaw);
            document.getElementById('oem-lbl-discount').innerText = `${discountPct}%`;
            document.getElementById('oem-math-discount').innerText = `- ${formatMoney(discountAmount)}`;
            document.getElementById('oem-lbl-vat').innerText = `${vatPct}%`;
            document.getElementById('oem-math-vat').innerText = `+ ${formatMoney(vatAmount)}`;
            document.getElementById('oem-math-final').innerText = formatMoney(totalFinal);

            recalcCreateOEMRemaining();
            await checkOEMStockAndMaterialsTable(selectedItems);
        }

        function recalcCreateOEMRemaining() {
            const totalFinalStr = document.getElementById('oem-math-final')?.innerText || '0';
            const totalFinal = parseFloat(totalFinalStr.replace(/[^\d]/g, '')) || 0;
            const deposit = parseFloat(document.getElementById('oem-create-deposit')?.value) || 0;
            const remaining = Math.max(0, totalFinal - deposit);
            document.getElementById('oem-math-remaining').innerText = formatMoney(remaining);
        }

        function setOEMDeposit50() {
            const totalFinalStr = document.getElementById('oem-math-final')?.innerText || '0';
            const totalFinal = parseFloat(totalFinalStr.replace(/[^\d]/g, '')) || 0;
            const dep50 = Math.round(totalFinal * 0.5);
            document.getElementById('oem-create-deposit').value = dep50;
            recalcCreateOEMRemaining();
        }

        // Gọi API kiểm tra nhu cầu vật tư BOM và số lượng tồn thực tế tại kho xưởng
        async function checkOEMStockAndMaterialsTable(selectedItems) {
            const tbody = document.getElementById('oem-preview-materials-table');
            if (!tbody) return;

            const oemWhId = parseInt(document.getElementById('oem-create-warehouse')?.value) || 1;

            if (selectedItems.length === 0) {
                tbody.innerHTML = '<tr><td colspan="6" class="p-3 text-center text-gray-500 italic">Chưa chọn sản phẩm hoặc số lượng đặt bằng 0.</td></tr>';
                return;
            }

            try {
                const res = await fetch('/api/oem/calculate-bom-stock', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        warehouse_id: oemWhId,
                        items: selectedItems
                    })
                });

                if (!res.ok) {
                    tbody.innerHTML = '<tr><td colspan="6" class="p-3 text-center text-rose-500 italic">Lỗi tính toán tồn kho vật tư xưởng.</td></tr>';
                    return;
                }

                const materials = await res.json();
                if (materials.length === 0) {
                    tbody.innerHTML = '<tr><td colspan="6" class="p-3 text-center text-gray-500 italic">Các sản phẩm này chưa được thiết lập công thức BOM (vỏ chai, tem nhãn...).</td></tr>';
                    return;
                }

                tbody.innerHTML = materials.map(m => {
                    const isOk = m.is_sufficient;
                    const diffText = m.diff_qty >= 0 ? `+${m.diff_qty.toLocaleString('vi-VN')}` : m.diff_qty.toLocaleString('vi-VN');
                    return `
                        <tr class="border-b ${isOk ? 'hover:bg-emerald-50/50' : 'bg-rose-50/60 hover:bg-rose-50'}">
                            <td class="p-2 font-bold text-slate-800">
                                ${m.code ? `[${m.code}] ` : ''}${m.name}
                            </td>
                            <td class="p-2 text-center text-gray-600 font-medium">${m.unit}</td>
                            <td class="p-2 text-right font-mono font-bold text-slate-800">
                                ${m.needed_qty.toLocaleString('vi-VN')}
                            </td>
                            <td class="p-2 text-right font-mono font-black ${m.current_stock > 0 ? 'text-emerald-700' : 'text-rose-700'}">
                                ${m.current_stock.toLocaleString('vi-VN')}
                            </td>
                            <td class="p-2 text-right font-mono font-bold ${isOk ? 'text-emerald-600' : 'text-rose-600'}">
                                ${diffText}
                            </td>
                            <td class="p-2 text-center">
                                ${isOk ? `
                                    <span class="bg-emerald-100 text-emerald-800 font-bold px-2 py-0.5 rounded text-[10px]">
                                        ✅ Đủ tồn kho
                                    </span>
                                ` : `
                                    <span class="bg-rose-100 text-rose-800 font-bold px-2 py-0.5 rounded text-[10px] animate-pulse">
                                        ⚠️ Thiếu ${Math.abs(m.diff_qty).toLocaleString('vi-VN')} ${m.unit} (Cần gửi)
                                    </span>
                                `}
                            </td>
                        </tr>
                    `;
                }).join('');

            } catch (err) {
                console.error('Lỗi check BOM stock:', err);
                tbody.innerHTML = '<tr><td colspan="6" class="p-3 text-center text-rose-500 italic">Lỗi kết nối máy chủ khi đối chiếu tồn kho.</td></tr>';
            }
        }

        async function submitCreateOEMOrder() {
            const partnerId = parseInt(document.getElementById('oem-create-partner')?.value);
            if (!partnerId) return alert('Vui lòng chọn Nhà Máy Gia Công!');

            const oemWhId = parseInt(document.getElementById('oem-create-warehouse')?.value) || 1;
            const destWhId = parseInt(document.getElementById('oem-create-dest-warehouse')?.value) || 1;
            const fundSource = document.getElementById('oem-create-fund')?.value || 'COMPANY';
            const expectedDate = document.getElementById('oem-create-date')?.value;
            const discountPct = parseFloat(document.getElementById('oem-create-discount')?.value) || 0;
            const vatPct = parseFloat(document.getElementById('oem-create-vat')?.value) || 0;
            const depositAmount = parseFloat(document.getElementById('oem-create-deposit')?.value) || 0;
            const note = document.getElementById('oem-create-note')?.value || '';

            const rows = document.querySelectorAll('.oem-item-row');
            const items = [];
            rows.forEach(r => {
                const prodId = parseInt(r.querySelector('.oem-prod-id')?.value);
                const qty = parseFloat(r.querySelector('.oem-prod-qty')?.value) || 0;
                const price = parseFloat(r.querySelector('.oem-prod-price')?.value) || 0;
                if (prodId && qty > 0) {
                    items.push({
                        product_id: prodId,
                        ordered_qty: qty,
                        unit_price: price
                    });
                }
            });

            if (items.length === 0) {
                return alert('Vui lòng chọn ít nhất 1 sản phẩm cần đặt gia công!');
            }

            const payload = {
                partner_id: partnerId,
                oem_warehouse_id: oemWhId,
                dest_warehouse_id: destWhId,
                expected_delivery_date: expectedDate,
                discount_percent: discountPct,
                vat_percent: vatPct,
                fund_source: fundSource,
                note: note,
                items: items
            };
            const isEdit = !!editingOEMOrderId;
            if (!isEdit) payload.deposit_amount = depositAmount;

            const btnSubmit = document.getElementById('btn-submit-create-oem');
            if (btnSubmit) {
                btnSubmit.disabled = true;
                btnSubmit.innerText = 'Đang lưu đơn & xuất cọc...';
            }

            try {
                const url = isEdit ? `/api/oem/orders/${editingOEMOrderId}` : '/api/oem/orders';
                const method = isEdit ? 'PUT' : 'POST';
                const res = await fetch(url, {
                    method: method,
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(payload)
                });

                if (!res.ok) {
                    let errMsg = isEdit ? 'Lỗi sửa đơn OEM' : 'Lỗi tạo đơn OEM';
                    try {
                        const err = await res.json();
                        if (typeof err.detail === 'string') {
                            errMsg = err.detail;
                        } else if (Array.isArray(err.detail)) {
                            errMsg = err.detail.map(d => d.msg || JSON.stringify(d)).join('; ');
                        } else if (err.detail) {
                            errMsg = JSON.stringify(err.detail);
                        }
                    } catch (_) {}
                    throw new Error(errMsg);
                }

                const data = await res.json();
                if (isEdit) {
                    alert(`✅ Đã cập nhật đơn OEM thành công.`);
                } else {
                    alert(`✅ Đã lập đơn đặt gia công OEM thành công: ${data.code}\n${depositAmount > 0 ? `Đã tự động xuất phiếu chi cọc ${formatMoney(depositAmount)} vào Sổ Quỹ (${fundSource === 'COMPANY' ? 'Quỹ Cty' : 'Quỹ Cá nhân'})` : ''}`);
                }

                closeModalCreateOEM();
                loadOEMData();
            } catch (e) {
                alert(`❌ Lỗi: ${e.message}`);
            } finally {
                if (btnSubmit) {
                    btnSubmit.disabled = false;
                    btnSubmit.innerText = isEdit ? '💾 Lưu Thay Đổi' : '🚀 Lưu Đơn & Xuất Cọc Sổ Quỹ';
                }
            }
        }

        async function openModalEditOEM(orderId) {
            if (!allContacts || allContacts.length === 0) {
                if (typeof loadContacts === 'function') await loadContacts();
            }
            if (!allWarehouses || allWarehouses.length === 0) {
                try {
                    const resWh = await fetch('/api/warehouses');
                    if (resWh.ok) allWarehouses = await resWh.json();
                } catch(e) {}
            }
            if (!allProducts || allProducts.length === 0) {
                if (typeof loadProducts === 'function') await loadProducts();
            }
            await loadOEMFactoriesList();

            let order;
            try {
                const res = await fetch(`/api/oem/orders/${orderId}`);
                if (!res.ok) throw new Error('Không tải được đơn OEM');
                order = await res.json();
            } catch (e) {
                return alert(`❌ Lỗi: ${e.message}`);
            }

            editingOEMOrderId = orderId;

            const destWhSel = document.getElementById('oem-create-dest-warehouse');
            if (destWhSel && allWarehouses) {
                destWhSel.innerHTML = allWarehouses.map(w => `<option value="${w.id}">📦 ${w.name} ${w.is_oem ? '(Kho Xưởng)' : ''}</option>`).join('');
            }

            document.getElementById('oem-create-partner').value = order.partner_id;
            document.getElementById('oem-create-warehouse').value = order.oem_warehouse_id;
            document.getElementById('oem-create-dest-warehouse').value = order.dest_warehouse_id;
            document.getElementById('oem-create-date').value = order.expected_delivery_date || '';
            document.getElementById('oem-create-discount').value = order.discount_percent ?? 0;
            document.getElementById('oem-create-vat').value = order.vat_percent ?? 0;
            document.getElementById('oem-create-fund').value = order.fund_source || 'COMPANY';
            document.getElementById('oem-create-deposit').value = order.deposit_amount ?? 0;
            document.getElementById('oem-create-deposit').disabled = true;
            document.getElementById('oem-create-note').value = order.note || '';

            const factory = allOEMFactories.find(f => f.id === order.partner_id);
            const searchInput = document.getElementById('oem-factory-search-input');
            if (searchInput) searchInput.value = factory ? `🏭 ${factory.name}` : '';

            const itemsBody = document.getElementById('oem-create-items-body');
            if (itemsBody) itemsBody.innerHTML = '';
            (order.items || []).forEach(it => {
                addOEMProductRow();
                const rows = document.querySelectorAll('.oem-item-row');
                const tr = rows[rows.length - 1];
                tr.querySelector('.oem-prod-id').value = it.product_id;
                tr.querySelector('.oem-prod-search-input').value = `${it.product_code || ''} - ${it.product_name || ''}`;
                tr.querySelector('.oem-prod-qty').value = it.ordered_qty;
                tr.querySelector('.oem-prod-price').value = it.unit_price;
            });
            recalcCreateOEMMath();

            const btnSubmit = document.getElementById('btn-submit-create-oem');
            if (btnSubmit) btnSubmit.innerText = '💾 Lưu Thay Đổi';

            document.getElementById('modal-create-oem').classList.remove('hidden');
        }

        async function deleteOEMOrder(orderId, orderCode) {
            if (!confirm(`Hủy đơn OEM ${orderCode}?\nNếu đã cọc tiền, hệ thống sẽ tự động hoàn cọc vào Sổ Quỹ. Đơn sẽ bị XÓA HẲN, không thể khôi phục.`)) return;
            try {
                const res = await fetch(`/api/oem/orders/${orderId}`, { method: 'DELETE' });
                if (!res.ok) {
                    const err = await res.json().catch(() => ({}));
                    throw new Error(err.detail || 'Lỗi hủy đơn OEM');
                }
                alert(`✅ Đã hủy đơn OEM ${orderCode}.`);
                loadOEMData();
            } catch (e) {
                alert(`❌ Lỗi: ${e.message}`);
            }
        }

        // --- QUẢN LÝ GÁN KHO CHO NHÀ MÁY (MODAL) ---
        async function openModalManageOEMFactories() {
            if (!allContacts || allContacts.length === 0) {
                if (typeof loadContacts === 'function') await loadContacts();
            }
            if (!allWarehouses || allWarehouses.length === 0) {
                try {
                    const resWh = await fetch('/api/warehouses');
                    if (resWh.ok) allWarehouses = await resWh.json();
                } catch(e) {}
            }

            const suppSel = document.getElementById('oem-link-supplier-sel');
            if (suppSel) {
                const suppliers = (allContacts || []).filter(c => c.type === 'supplier');
                suppSel.innerHTML = suppliers.map(s => `<option value="${s.id}">🏭 ${s.name} ${s.phone ? '('+s.phone+')' : ''}</option>`).join('');
            }

            const whSel = document.getElementById('oem-link-warehouse-sel');
            if (whSel && allWarehouses) {
                whSel.innerHTML = allWarehouses.map(w => `<option value="${w.id}">📦 ${w.name}</option>`).join('');
            }

            await renderManageFactoriesTable();
            document.getElementById('modal-manage-oem-factories').classList.remove('hidden');
        }

        function closeModalManageOEMFactories() {
            document.getElementById('modal-manage-oem-factories')?.classList.add('hidden');
        }

        async function renderManageFactoriesTable() {
            const tbody = document.getElementById('oem-factories-list-table');
            if (!tbody) return;
            await loadOEMFactoriesList();

            if (allOEMFactories.length === 0) {
                tbody.innerHTML = '<tr><td colspan="3" class="p-3 text-center text-gray-400 italic">Chưa có nhà máy nào được gán kho xưởng. Hãy chọn ở ô phía trên để gán!</td></tr>';
                return;
            }

            tbody.innerHTML = allOEMFactories.map(f => `
                <tr class="border-b hover:bg-slate-50">
                    <td class="p-2 font-bold text-slate-800">
                        🏭 ${f.name}
                        ${f.phone ? `<span class="text-gray-400 text-[10px] ml-1">(${f.phone})</span>` : ''}
                    </td>
                    <td class="p-2 font-semibold text-emerald-700">
                        📦 ${f.warehouse_name}
                    </td>
                    <td class="p-2 text-center font-bold text-amber-700 font-mono">
                        ${f.product_count} sản phẩm
                    </td>
                </tr>
            `).join('');
        }

        async function submitLinkFactoryWarehouse() {
            const suppId = parseInt(document.getElementById('oem-link-supplier-sel')?.value);
            const whId = parseInt(document.getElementById('oem-link-warehouse-sel')?.value);
            if (!suppId || !whId) return alert('Vui lòng chọn cả Nhà cung cấp và Kho xưởng!');

            try {
                const res = await fetch('/api/oem/factories/link-warehouse', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ supplier_id: suppId, warehouse_id: whId })
                });

                if (!res.ok) throw new Error('Không thể gán kho cho nhà máy');
                alert('✅ Đã gán kho xưởng cho nhà máy thành công!');
                await renderManageFactoriesTable();
            } catch (e) {
                alert(`❌ Lỗi: ${e.message}`);
            }
        }

        // --- GÁN SẢN PHẨM KHÁC CHO NHÀ MÁY (MODAL) ---
        function openModalAddProductToFactory() {
            if (!selectedOEMFactory) return alert('Vui lòng chọn nhà máy trước!');
            document.getElementById('oem-add-prod-factory-name').innerText = `🏭 ${selectedOEMFactory.name}`;

            const sel = document.getElementById('oem-add-prod-select');
            if (sel) {
                const linkedIds = new Set(currentFactoryProducts.map(p => p.id));
                const available = (allProducts || []).filter(p => !linkedIds.has(p.id));
                sel.innerHTML = available.map(p => `<option value="${p.id}">${p.code ? '['+p.code+'] ' : ''}${p.name} (${p.unit||'chai'})</option>`).join('');
            }

            document.getElementById('modal-add-prod-to-factory')?.classList.remove('hidden');
        }

        function closeModalAddProductToFactory() {
            document.getElementById('modal-add-prod-to-factory')?.classList.add('hidden');
        }

        async function submitLinkProductToFactory() {
            if (!selectedOEMFactory) return;
            const prodId = parseInt(document.getElementById('oem-add-prod-select')?.value);
            if (!prodId) return alert('Vui lòng chọn sản phẩm!');

            try {
                const res = await fetch(`/api/oem/factories/${selectedOEMFactory.id}/link-product`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ product_id: prodId })
                });
                if (!res.ok) throw new Error('Không thể gán sản phẩm');
                alert('✅ Đã gán sản phẩm cho nhà máy thành công!');
                closeModalAddProductToFactory();

                // Tải lại sản phẩm của xưởng
                const resP = await fetch(`/api/oem/factories/${selectedOEMFactory.id}/products`);
                if (resP.ok) currentFactoryProducts = await resP.json();
                
                const hint = document.getElementById('oem-prod-filter-hint');
                if (hint) hint.innerText = `Đang hiển thị ${currentFactoryProducts.length} sản phẩm cấu hình cho xưởng ${selectedOEMFactory.name}`;

                addOEMProductRow();
            } catch (e) {
                alert(`❌ Lỗi: ${e.message}`);
            }
        }

        // --- MODAL: NHẬN HÀNG GIA CÔNG THỰC TẾ ---
        async function openModalReceiveOEM(orderId) {
            try {
                const res = await fetch(`/api/oem/orders/${orderId}`);
                if (!res.ok) return alert('Không tìm thấy đơn OEM');
                currentReceivingOrder = await res.json();

                document.getElementById('oem-receive-order-id').value = currentReceivingOrder.id;
                document.getElementById('oem-rec-code').innerText = currentReceivingOrder.code;
                document.getElementById('oem-rec-partner').innerText = currentReceivingOrder.partner_name || 'Xưởng';
                document.getElementById('oem-rec-deposited').innerText = formatMoney(currentReceivingOrder.deposit_amount);
                document.getElementById('oem-rec-fund').innerText = currentReceivingOrder.fund_source === 'COMPANY' ? '🏢 Quỹ Cty' : '👤 Cá Nhân';
                document.getElementById('oem-rec-pay-fund').value = currentReceivingOrder.fund_source || 'COMPANY';

                const tbody = document.getElementById('oem-receive-items-body');
                tbody.innerHTML = (currentReceivingOrder.items || []).map(it => `
                    <tr class="border-b hover:bg-slate-50 oem-rec-item-row" data-item-id="${it.id}" data-prod-id="${it.product_id}" data-price="${it.unit_price}">
                        <td class="p-2 font-bold text-slate-800">${it.product_name}</td>
                        <td class="p-2 text-right font-mono text-slate-600">${it.ordered_qty} ${it.product_unit||'chai'}</td>
                        <td class="p-2 text-right font-mono">${formatMoney(it.unit_price)}</td>
                        <td class="p-2 text-right">
                            <input type="number" step="any" min="0" value="${it.ordered_qty}" 
                                   class="oem-rec-actual-qty border p-1.5 rounded w-28 text-right font-mono font-bold text-amber-700 bg-amber-50 focus:bg-white"
                                   oninput="recalcReceiveOEMMath()">
                        </td>
                        <td class="p-2 text-right font-mono font-bold text-slate-800 oem-rec-item-total">
                            ${formatMoney(it.ordered_qty * it.unit_price)}
                        </td>
                    </tr>
                `).join('');

                recalcReceiveOEMMath();
                document.getElementById('modal-receive-oem').classList.remove('hidden');
            } catch (err) {
                console.error(err);
                alert('Lỗi tải chi tiết đơn nhận: ' + err.message);
            }
        }

        function closeModalReceiveOEM() {
            document.getElementById('modal-receive-oem')?.classList.add('hidden');
        }

        async function recalcReceiveOEMMath() {
            if (!currentReceivingOrder) return;
            const rows = document.querySelectorAll('.oem-rec-item-row');
            let totalRaw = 0;
            const itemActuals = [];

            rows.forEach(r => {
                const itemId = parseInt(r.dataset.itemId);
                const prodId = parseInt(r.dataset.prodId);
                const price = parseFloat(r.dataset.price) || 0;
                const actualQty = parseFloat(r.querySelector('.oem-rec-actual-qty')?.value) || 0;
                const rowTotal = actualQty * price;
                totalRaw += rowTotal;

                const totalCell = r.querySelector('.oem-rec-item-total');
                if (totalCell) totalCell.innerText = formatMoney(rowTotal);
                itemActuals.push({ item_id: itemId, product_id: prodId, received_qty: actualQty });
            });

            const discountPct = currentReceivingOrder.discount_percent || 0;
            const vatPct = currentReceivingOrder.vat_percent || 0;

            const totalFinal = totalRaw * (1 - discountPct / 100) * (1 + vatPct / 100);
            const deposit = currentReceivingOrder.deposit_amount || 0;
            const remaining = Math.max(0, totalFinal - deposit);

            document.getElementById('oem-rec-final-total').innerText = formatMoney(totalFinal);
            document.getElementById('oem-rec-deposit-deduct').innerText = `- ${formatMoney(deposit)}`;
            document.getElementById('oem-rec-remaining-total').innerText = formatMoney(remaining);

            // Cập nhật xem trước NVL sẽ bị trừ
            renderReceiveDeductPreview(itemActuals);
        }

        async function renderReceiveDeductPreview(itemActuals) {
            const container = document.getElementById('oem-receive-deduct-preview');
            if (!container || !currentReceivingOrder) return;

            const materialMap = {};
            for (const it of itemActuals) {
                try {
                    const res = await fetch(`/api/products/${it.product_id}/bom`);
                    if (res.ok) {
                        const bomData = await res.json();
                        (bomData.bom_items || []).forEach(bi => {
                            if (bi.ingredient_type === 'IS_PHYSICAL') {
                                const key = bi.ingredient_id;
                                if (!materialMap[key]) {
                                    materialMap[key] = {
                                        name: bi.ingredient_name,
                                        unit: bi.unit,
                                        deduct_qty: 0
                                    };
                                }
                                materialMap[key].deduct_qty += (bi.quantity * it.received_qty);
                            }
                        });
                    }
                } catch (e) {}
            }

            const mList = Object.values(materialMap);
            if (mList.length === 0) {
                container.innerHTML = '<div class="text-gray-500 italic p-1">Không có nguyên liệu vật lý nào trong BOM.</div>';
                return;
            }

            container.innerHTML = mList.map(m => `
                <div class="bg-white p-1.5 rounded border border-rose-300 flex justify-between items-center shadow-sm">
                    <span class="font-bold text-slate-800">${m.name}:</span>
                    <span class="font-mono font-black text-rose-600">- ${m.deduct_qty.toLocaleString('vi-VN')} ${m.unit}</span>
                </div>
            `).join('');
        }

        async function submitReceiveOEMOrder() {
            const orderId = parseInt(document.getElementById('oem-receive-order-id')?.value);
            if (!orderId) return;

            const rows = document.querySelectorAll('.oem-rec-item-row');
            const items = [];
            rows.forEach(r => {
                const itemId = parseInt(r.dataset.itemId);
                const actualQty = parseFloat(r.querySelector('.oem-rec-actual-qty')?.value) || 0;
                items.push({ item_id: itemId, received_qty: actualQty });
            });

            const payNow = document.getElementById('oem-rec-pay-now')?.checked || false;
            const payFund = document.getElementById('oem-rec-pay-fund')?.value || 'COMPANY';

            const payload = {
                items: items,
                pay_remaining_now: payNow,
                payment_fund_source: payFund
            };

            const btn = document.getElementById('btn-submit-receive-oem');
            btn.disabled = true;
            btn.innerText = '⏳ Đang quyết toán & trừ kho...';

            try {
                const res = await fetch(`/api/oem/orders/${orderId}/receive`, {
                    method: 'POST',
                    headers: {'Content-Type': 'application/json'},
                    body: JSON.stringify(payload)
                });
                const data = await res.json();
                btn.disabled = false;
                btn.innerText = '✅ Hoàn Tất Nhận Hàng & Trừ Kho';

                if (res.ok && data.success) {
                    alert(`✅ Đã quyết toán nhận hàng thành công!\nTổng tiền thực tế: ${formatMoney(data.total_final)}\nThanh toán đợt 2: ${formatMoney(data.remaining_payment)} (${payNow ? 'Đã chi sổ quỹ' : 'Ghi nhận nợ'})\nToàn bộ vỏ chai, nắp, tem nhãn đã được tự động trừ khớp với số lượng thực nhận.`);
                    closeModalReceiveOEM();
                    await loadOEMData();
                    if (typeof loadUnifiedInventory === 'function') await loadUnifiedInventory();
                    if (typeof loadCostIngredients === 'function') await loadCostIngredients();
                } else {
                    alert('Lỗi: ' + (data.detail || 'Không thể nhận hàng'));
                }
            } catch (err) {
                btn.disabled = false;
                btn.innerText = '✅ Hoàn Tất Nhận Hàng & Trừ Kho';
                alert('Lỗi: ' + err.message);
            }
        }

        // --- MODAL: XEM CHI TIẾT ĐƠN OEM ---
        async function viewOEMOrderDetail(orderId) {
            try {
                const res = await fetch(`/api/oem/orders/${orderId}`);
                if (!res.ok) return alert('Không tìm thấy chi tiết đơn OEM');
                const ord = await res.json();

                document.getElementById('oem-view-code').innerText = ord.code;
                const body = document.getElementById('oem-detail-body');

                body.innerHTML = `
                    <div class="grid grid-cols-2 sm:grid-cols-4 gap-3 bg-slate-50 p-3 rounded-lg border text-xs">
                        <div>Nhà máy: <strong class="text-slate-800">${ord.partner_name || '-'}</strong></div>
                        <div>Kho xưởng NVL: <strong class="text-slate-800">${ord.oem_warehouse_name || '-'}</strong></div>
                        <div>Hẹn nhận hàng: <strong class="font-mono text-slate-800">${ord.expected_delivery_date || '-'}</strong></div>
                        <div>Nguồn tiền: <strong class="${ord.fund_source === 'COMPANY' ? 'text-blue-700' : 'text-purple-700'}">${ord.fund_source === 'COMPANY' ? '🏢 Quỹ Công Ty' : '👤 Quỹ Cá Nhân'}</strong></div>
                        <div>Tổng tiền niêm yết: <strong class="font-mono text-slate-700">${formatMoney(ord.total_raw_amount)}</strong></div>
                        <div>Chiết khấu: <strong class="text-emerald-600">${ord.discount_percent}%</strong> | VAT: <strong class="text-rose-600">${ord.vat_percent}%</strong></div>
                        <div>Đã cọc đợt 1: <strong class="text-emerald-600 font-mono font-bold">${formatMoney(ord.deposit_amount)}</strong></div>
                        <div>Còn lại đợt 2: <strong class="text-rose-600 font-mono font-bold">${formatMoney(ord.remaining_payment)}</strong></div>
                    </div>

                    <div class="space-y-1">
                        <h4 class="font-bold text-slate-800 text-xs">📦 Danh Sách Thành Phẩm Gia Công:</h4>
                        <div class="border rounded overflow-x-auto">
                            <table class="w-full text-left text-xs">
                                <thead class="bg-slate-100 border-b">
                                    <tr>
                                        <th class="p-2">Sản Phẩm</th>
                                        <th class="p-2 text-right">SL Đặt</th>
                                        <th class="p-2 text-right">SL Thực Nhận</th>
                                        <th class="p-2 text-right">Đơn Giá Xưởng</th>
                                        <th class="p-2 text-right">Giá Vốn Sau Gộp Tem/Chai</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    ${(ord.items || []).map(it => `
                                        <tr class="border-b">
                                            <td class="p-2 font-bold text-slate-800">${it.product_name}</td>
                                            <td class="p-2 text-right font-mono">${it.ordered_qty}</td>
                                            <td class="p-2 text-right font-mono font-bold text-amber-700">${it.received_qty || '-'}</td>
                                            <td class="p-2 text-right font-mono">${formatMoney(it.unit_price)}</td>
                                            <td class="p-2 text-right font-mono font-bold text-emerald-700">${it.full_cost_per_unit > 0 ? formatMoney(it.full_cost_per_unit) : 'Chờ nhận'}</td>
                                        </tr>
                                    `).join('')}
                                </tbody>
                            </table>
                        </div>
                    </div>

                    <div class="space-y-1">
                        <h4 class="font-bold text-slate-800 text-xs">🔍 Vật Tư Gửi Xưởng Tiêu Hao (Theo BOM):</h4>
                        <div class="border rounded overflow-x-auto">
                            <table class="w-full text-left text-xs">
                                <thead class="bg-slate-100 border-b">
                                    <tr>
                                        <th class="p-2">Thành Phần (Tem, Chai, Nắp)</th>
                                        <th class="p-2">Loại</th>
                                        <th class="p-2 text-right">Định Mức / SP</th>
                                        <th class="p-2 text-right">Tổng Nhu Cầu</th>
                                        <th class="p-2 text-right">Tồn Hiện Tại Tại Xưởng</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    ${(ord.materials_needed || []).map(m => `
                                        <tr class="border-b">
                                            <td class="p-2 font-medium">${m.ingredient_name}</td>
                                            <td class="p-2"><span class="text-[10px] px-1.5 py-0.5 rounded font-bold ${m.ingredient_type==='IS_PHYSICAL'?'bg-emerald-100 text-emerald-800':'bg-indigo-100 text-indigo-800'}">${m.ingredient_type==='IS_PHYSICAL'?'Vật lý':'Dịch vụ'}</span></td>
                                            <td class="p-2 text-right font-mono">${m.bom_qty} ${m.ingredient_unit}</td>
                                            <td class="p-2 text-right font-mono font-bold text-amber-700">${m.needed_qty.toLocaleString('vi-VN')} ${m.ingredient_unit}</td>
                                            <td class="p-2 text-right font-mono font-bold ${m.current_stock_at_oem < m.needed_qty ? 'text-rose-600' : 'text-slate-700'}">${m.current_stock_at_oem.toLocaleString('vi-VN')} ${m.ingredient_unit}</td>
                                        </tr>
                                    `).join('')}
                                </tbody>
                            </table>
                        </div>
                    </div>
                `;

                document.getElementById('modal-detail-oem').classList.remove('hidden');
            } catch (err) {
                console.error(err);
            }
        }

        function closeModalDetailOEM() {
            document.getElementById('modal-detail-oem')?.classList.add('hidden');
        }

        // ==========================================
        // PHÂN HỆ DÒNG TIỀN & CÔNG NỢ NHÀ CUNG CẤP
        // ==========================================
        let allCFDSuppliers = [];
        let allCFDForecasts = [];
        let currentCFDForecastFilter = 'ALL';
        let currentCFDSupplierFilter = 'DEBT_ONLY';

        async function loadCashflowDebtsData() {
            await Promise.all([
                loadCFDSummary(),
                loadCFDForecast(),
                loadCFDSuppliers()
            ]);
        }

        async function loadCFDSummary() {
            try {
                const res = await fetch('/api/cashflow-debts/summary');
                if (!res.ok) return;
                const data = await res.json();
                
                const elDebt = document.getElementById('cfd-stat-total-debt');
                if (elDebt) elDebt.innerText = formatMoney(data.total_supplier_debt || 0);

                const elFcTotal = document.getElementById('cfd-stat-forecast-total');
                if (elFcTotal) elFcTotal.innerText = formatMoney(data.forecast_total || 0);

                const elFcCty = document.getElementById('cfd-stat-forecast-company');
                if (elFcCty) elFcCty.innerText = formatMoney(data.forecast_company || 0);

                const elFcPer = document.getElementById('cfd-stat-forecast-personal');
                if (elFcPer) elFcPer.innerText = formatMoney(data.forecast_personal || 0);
            } catch (err) {
                console.error("Lỗi tải tóm tắt dòng tiền & nợ:", err);
            }
        }

        async function loadCFDForecast() {
            try {
                const res = await fetch('/api/oem/cashflow-forecast');
                if (!res.ok) return;
                const data = await res.json();
                allCFDForecasts = data.items || [];
                renderCFDForecastList();
            } catch (err) {
                console.error("Lỗi tải dự báo dòng tiền:", err);
            }
        }

        function filterCFDForecast(fund) {
            currentCFDForecastFilter = fund;
            const btnAll = document.getElementById('cfd-filter-all');
            const btnCty = document.getElementById('cfd-filter-company');
            const btnPer = document.getElementById('cfd-filter-personal');

            [btnAll, btnCty, btnPer].forEach(b => {
                if (!b) return;
                b.className = 'px-2.5 py-1 rounded font-bold hover:bg-slate-700 text-slate-300';
            });

            if (fund === 'ALL' && btnAll) btnAll.className = 'px-2.5 py-1 rounded font-bold bg-amber-500 text-slate-900';
            if (fund === 'COMPANY' && btnCty) btnCty.className = 'px-2.5 py-1 rounded font-bold bg-blue-600 text-white';
            if (fund === 'PERSONAL' && btnPer) btnPer.className = 'px-2.5 py-1 rounded font-bold bg-purple-600 text-white';

            renderCFDForecastList();
        }

        function renderCFDForecastList() {
            const container = document.getElementById('cfd-forecast-list');
            if (!container) return;

            let items = allCFDForecasts;
            if (currentCFDForecastFilter !== 'ALL') {
                items = items.filter(it => it.fund_source === currentCFDForecastFilter);
            }

            if (items.length === 0) {
                container.innerHTML = '<div class="text-center py-4 text-slate-400 text-xs italic">Không có khoản chi dự kiến nào trong giai đoạn này.</div>';
                return;
            }

            container.innerHTML = items.map(it => {
                const dateStr = it.expected_delivery_date || 'Chưa định ngày';
                const isCty = it.fund_source === 'COMPANY';
                return `
                    <div class="flex flex-wrap items-center justify-between bg-slate-50 hover:bg-slate-100 p-2.5 rounded-lg border border-slate-200 text-xs gap-2 transition-colors">
                        <div class="flex items-center gap-2">
                            <span class="px-2 py-0.5 rounded font-mono font-bold text-[10px] ${isCty ? 'bg-indigo-50 text-indigo-700 border border-indigo-200' : 'bg-purple-50 text-purple-700 border border-purple-200'}">
                                ${isCty ? '🏢 Quỹ Cty' : '👤 Cá Nhân'}
                            </span>
                            <div>
                                <span class="font-bold text-slate-800">${it.code}</span> - 
                                <span class="text-slate-700 font-semibold">${it.partner_name || 'Nhà cung cấp'}</span>
                                <span class="text-[10px] text-slate-500 ml-1">(${it.order_type === 'OEM' ? 'Gia công OEM' : 'Nhập hàng'})</span>
                            </div>
                        </div>
                        <div class="flex items-center gap-4">
                            <div class="text-right">
                                <div class="text-[10px] text-slate-500">Hạn nhận (trừ hao ±1 ngày):</div>
                                <div class="font-mono text-slate-800 font-bold">📅 ${dateStr}</div>
                            </div>
                            <div class="text-right">
                                <div class="text-[10px] text-slate-500">Dự kiến chi:</div>
                                <div class="font-mono font-black text-rose-600 text-sm">${formatMoney(it.amount)}</div>
                            </div>
                        </div>
                    </div>
                `;
            }).join('');
        }

        async function loadCFDSuppliers() {
            try {
                const res = await fetch('/api/cashflow-debts/suppliers');
                if (!res.ok) return;
                allCFDSuppliers = await res.json();
                renderCFDSuppliersTable();
            } catch (err) {
                console.error("Lỗi tải danh sách công nợ NCC:", err);
            }
        }

        function filterCFDSuppliers(mode) {
            currentCFDSupplierFilter = mode;
            const btnDebt = document.getElementById('cfd-supp-btn-debt');
            const btnAll = document.getElementById('cfd-supp-btn-all');

            if (mode === 'DEBT_ONLY') {
                if (btnDebt) btnDebt.className = 'px-3 py-1.5 font-bold rounded-l-lg bg-rose-600 text-white';
                if (btnAll) btnAll.className = 'px-3 py-1.5 font-bold rounded-r-lg bg-white text-slate-700 border hover:bg-gray-50';
            } else {
                if (btnDebt) btnDebt.className = 'px-3 py-1.5 font-bold rounded-l-lg bg-white text-slate-700 border hover:bg-gray-50';
                if (btnAll) btnAll.className = 'px-3 py-1.5 font-bold rounded-r-lg bg-slate-800 text-white';
            }

            renderCFDSuppliersTable();
        }

        function renderCFDSuppliersTable() {
            const tbody = document.getElementById('table-cfd-suppliers');
            if (!tbody) return;

            const q = (document.getElementById('cfd-supp-search')?.value || '').toLowerCase().trim();
            let filtered = allCFDSuppliers;

            if (currentCFDSupplierFilter === 'DEBT_ONLY') {
                filtered = filtered.filter(s => ((s.total_debt ?? s.debt) || 0) > 0);
            }

            if (q) {
                filtered = filtered.filter(s => 
                    (s.name || '').toLowerCase().includes(q) || 
                    (s.phone || '').toLowerCase().includes(q) || 
                    (s.warehouse_name || '').toLowerCase().includes(q)
                );
            }

            const countEl = document.getElementById('cfd-supplier-count');
            if (countEl) countEl.innerText = `${filtered.length} NCC`;

            if (filtered.length === 0) {
                tbody.innerHTML = '<tr><td colspan="8" class="p-4 text-center text-gray-400">Không tìm thấy nhà cung cấp nào phù hợp.</td></tr>';
                return;
            }

            tbody.innerHTML = filtered.map(s => {
                const totalDebtOrders = (s.po_debt_count || 0) + (s.oem_debt_count || 0);
                const totalDebt = (s.total_debt ?? s.debt) || 0;
                const hasDebt = totalDebt > 0;
                return `
                    <tr class="border-b hover:bg-slate-50 transition">
                        <td class="p-2.5">
                            <div class="font-bold text-slate-800 flex items-center gap-1.5">
                                <span>${s.warehouse_name ? '🏭' : '🏢'} ${s.name}</span>
                            </div>
                            ${s.address ? `<div class="text-[10px] text-gray-400 mt-0.5">${s.address}</div>` : ''}
                        </td>
                        <td class="p-2.5 text-gray-600 font-mono text-[11px]">
                            ${s.phone || '-'}
                        </td>
                        <td class="p-2.5">
                            ${s.warehouse_name ? `<span class="text-emerald-700 font-semibold text-[11px] bg-emerald-50 border border-emerald-200 px-1.5 py-0.5 rounded">📦 ${s.warehouse_name}</span>` : '<span class="text-gray-400 text-[11px]">-</span>'}
                        </td>
                        <td class="p-2.5 text-center">
                            ${totalDebtOrders > 0 
                                ? `<span class="bg-amber-100 text-amber-900 font-bold px-2 py-0.5 rounded-full text-[10px]">${totalDebtOrders} đơn nợ</span>` 
                                : '<span class="text-gray-400 text-[10px]">0</span>'
                            }
                        </td>
                        <td class="p-2.5 text-right font-mono font-bold text-sm text-blue-700">
                            ${formatMoney(s.debt_company || 0)}
                        </td>
                        <td class="p-2.5 text-right font-mono font-bold text-sm text-purple-700">
                            ${formatMoney(s.debt_personal || 0)}
                        </td>
                        <td class="p-2.5 text-right font-mono font-black text-sm ${hasDebt ? 'text-rose-600' : 'text-slate-400'}">
                            ${formatMoney(totalDebt)}
                        </td>
                        <td class="p-2.5 text-center">
                            <div class="flex items-center justify-center gap-1.5">
                                <button onclick="viewCFDSupplierOrders(${s.id}, '${s.name.replace(/'/g, "\\'")}')" class="text-xs bg-slate-100 hover:bg-slate-200 text-slate-700 px-2 py-1 rounded font-bold border">
                                    🔍 Xem đơn nợ
                                </button>
                                ${hasDebt ? `
                                    <button onclick="openModalPaySupplierDebt(${s.id})" class="text-xs bg-amber-600 hover:bg-amber-700 text-white px-2.5 py-1 rounded font-bold shadow-sm">
                                        💳 Trả nợ
                                    </button>
                                ` : ''}
                            </div>
                        </td>
                    </tr>
                `;
            }).join('');
        }

        // Xem đơn hàng còn nợ của NCC
        async function viewCFDSupplierOrders(supplierId, supplierName) {
            document.getElementById('cfd-orders-supp-name').innerText = supplierName;
            const payAllBtn = document.getElementById('cfd-orders-pay-all-btn');
            if (payAllBtn) {
                payAllBtn.onclick = () => {
                    closeModalCFDSupplierOrders();
                    openModalPaySupplierDebt(supplierId);
                };
            }

            const tbody = document.getElementById('table-cfd-order-details');
            if (tbody) tbody.innerHTML = '<tr><td colspan="8" class="p-3 text-center text-gray-400">Đang tải đơn hàng...</td></tr>';
            document.getElementById('modal-cfd-supplier-orders').classList.remove('hidden');

            try {
                const res = await fetch(`/api/cashflow-debts/suppliers/${supplierId}/orders`);
                if (!res.ok) throw new Error('Lỗi tải đơn');
                const orders = await res.json();

                if (orders.length === 0) {
                    tbody.innerHTML = '<tr><td colspan="8" class="p-3 text-center text-gray-400">Không có đơn hàng nào còn nợ tiền.</td></tr>';
                    return;
                }

                tbody.innerHTML = orders.map(o => `
                    <tr class="border-b hover:bg-slate-50">
                        <td class="p-2 font-mono font-bold text-slate-800">${o.code}</td>
                        <td class="p-2">
                            ${o.order_type === 'OEM' 
                                ? '<span class="bg-amber-100 text-amber-800 px-1.5 py-0.5 rounded font-bold text-[10px]">🏭 OEM</span>' 
                                : '<span class="bg-sky-100 text-sky-800 px-1.5 py-0.5 rounded font-bold text-[10px]">📥 Nhập hàng (PO)</span>'
                            }
                        </td>
                        <td class="p-2 text-center">
                            ${o.has_vat 
                                ? `<span class="bg-blue-100 text-blue-800 border border-blue-200 px-2 py-0.5 rounded font-bold text-[10px]">🏢 Có VAT (${o.vat_rate || 0}%) • Quỹ Cty</span>` 
                                : '<span class="bg-purple-100 text-purple-800 border border-purple-200 px-2 py-0.5 rounded font-bold text-[10px]">👤 Không VAT • Quỹ Cá Nhân</span>'
                            }
                        </td>
                        <td class="p-2 text-gray-500 font-mono text-[11px]">${o.created_at || '-'}</td>
                        <td class="p-2 text-right font-mono font-bold text-slate-700">${formatMoney(o.total_amount || 0)}</td>
                        <td class="p-2 text-right font-mono font-bold text-emerald-600">${formatMoney(o.paid_amount || 0)}</td>
                        <td class="p-2 text-right font-mono font-black text-rose-600">${formatMoney(o.debt_amount || 0)}</td>
                        <td class="p-2 text-center">
                            <button onclick="openModalPaySingleOrder('${o.order_type}', ${o.id}, '${o.code}', ${o.debt_amount || 0}, ${supplierId}, '${supplierName.replace(/'/g, "\\'")}', ${o.has_vat ? 1 : 0})" class="bg-blue-50 hover:bg-blue-100 text-blue-700 border border-blue-200 px-2 py-1 rounded font-bold text-[11px] shadow-sm">
                                💳 Trả đơn này
                            </button>
                        </td>
                    </tr>
                `).join('');
            } catch (e) {
                tbody.innerHTML = `<tr><td colspan="8" class="p-3 text-center text-rose-500">Lỗi: ${e.message}</td></tr>`;
            }
        }

        function closeModalCFDSupplierOrders() {
            document.getElementById('modal-cfd-supplier-orders')?.classList.add('hidden');
        }

        // ==========================================
        // THANH TOÁN TỪNG ĐƠN HÀNG CỤ THỂ
        // ==========================================
        let currentSingleOrderMaxDebt = 0;

        function openModalPaySingleOrder(orderType, orderId, orderCode, debtAmount, supplierId, supplierName, hasVat = 0) {
            currentSingleOrderMaxDebt = debtAmount;
            document.getElementById('cfd-pay-order-type').value = orderType;
            document.getElementById('cfd-pay-order-id').value = orderId;
            document.getElementById('cfd-pay-order-supp-id').value = supplierId;
            document.getElementById('cfd-pay-order-code').innerText = orderCode;
            document.getElementById('cfd-pay-order-supp-name').innerText = supplierName;
            document.getElementById('cfd-pay-order-debt').innerText = formatMoney(debtAmount);
            document.getElementById('cfd-pay-order-amount').value = debtAmount;
            document.getElementById('cfd-pay-order-note').value = `Thanh toán nợ đơn ${orderCode} (${supplierName})`;

            const radioCompany = document.querySelector('input[name="cfd-pay-order-fund"][value="COMPANY"]');
            const radioPersonal = document.querySelector('input[name="cfd-pay-order-fund"][value="PERSONAL"]');

            if (hasVat) {
                if (radioCompany) { radioCompany.checked = true; radioCompany.disabled = false; }
                if (radioPersonal) { radioPersonal.checked = false; radioPersonal.disabled = true; }
            } else {
                if (radioPersonal) { radioPersonal.checked = true; radioPersonal.disabled = false; }
                if (radioCompany) { radioCompany.checked = false; radioCompany.disabled = true; }
            }

            document.getElementById('modal-cfd-pay-order')?.classList.remove('hidden');
        }

        function closeModalCFDPayOrder() {
            document.getElementById('modal-cfd-pay-order')?.classList.add('hidden');
        }

        function setCFDPayFullOrderDebt() {
            document.getElementById('cfd-pay-order-amount').value = currentSingleOrderMaxDebt;
        }

        async function submitPaySingleOrder() {
            const orderType = document.getElementById('cfd-pay-order-type')?.value;
            const orderId = parseInt(document.getElementById('cfd-pay-order-id')?.value);
            const suppId = parseInt(document.getElementById('cfd-pay-order-supp-id')?.value);
            const suppName = document.getElementById('cfd-pay-order-supp-name')?.innerText || '';
            const amount = parseFloat(document.getElementById('cfd-pay-order-amount')?.value) || 0;
            const fundSource = document.querySelector('input[name="cfd-pay-order-fund"]:checked')?.value || 'COMPANY';
            const note = document.getElementById('cfd-pay-order-note')?.value || '';

            if (amount <= 0) {
                alert("Vui lòng nhập số tiền thanh toán lớn hơn 0");
                return;
            }

            try {
                const res = await fetch('/api/cashflow-debts/pay-order', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        order_type: orderType,
                        order_id: orderId,
                        amount: amount,
                        fund_source: fundSource,
                        note: note
                    })
                });

                if (!res.ok) {
                    const err = await res.json();
                    throw new Error(err.detail || 'Lỗi thanh toán');
                }

                const data = await res.json();
                alert(`✅ ${data.message}\nĐã xuất phiếu chi vào Sổ Quỹ (${fundSource === 'COMPANY' ? 'Quỹ Cty' : 'Quỹ Cá Nhân'})`);
                closeModalCFDPayOrder();

                // Làm mới danh sách đơn nợ đang mở
                if (suppId) viewCFDSupplierOrders(suppId, suppName);

                // Làm mới dữ liệu tổng
                loadCashflowDebtsData();
                if (typeof loadCashbook === 'function') loadCashbook();
                if (typeof loadContacts === 'function') loadContacts();
            } catch (e) {
                alert(`❌ Lỗi: ${e.message}`);
            }
        }

        // Lập phiếu thanh toán nợ cho NCC
        function openModalPaySupplierDebt(selectedSupplierId = null) {
            const selectEl = document.getElementById('cfd-pay-supp-select');
            if (selectEl) {
                const debtSuppliers = allCFDSuppliers.filter(s => (s.debt || 0) > 0);
                const listToUse = debtSuppliers.length > 0 ? debtSuppliers : allCFDSuppliers;
                selectEl.innerHTML = listToUse.map(s => `
                    <option value="${s.id}" data-debt="${s.debt || 0}" data-debt-company="${s.debt_company || 0}" data-debt-personal="${s.debt_personal || 0}">
                        ${s.name} - Tổng nợ: ${formatMoney(s.debt || 0)} (Cty: ${formatMoney(s.debt_company || 0)} | Cá nhân: ${formatMoney(s.debt_personal || 0)})
                    </option>
                `).join('');

                if (selectedSupplierId) {
                    selectEl.value = selectedSupplierId;
                }
            }

            onCFDPaySupplierChange();
            document.getElementById('cfd-pay-note').value = '';
            document.getElementById('modal-cfd-pay-supplier').classList.remove('hidden');
        }

        function closeModalPaySupplierDebt() {
            document.getElementById('modal-cfd-pay-supplier')?.classList.add('hidden');
        }

        function onCFDPaySupplierChange() {
            const selectEl = document.getElementById('cfd-pay-supp-select');
            const opt = selectEl?.selectedOptions[0];
            const debt = parseFloat(opt?.getAttribute('data-debt')) || 0;
            const debtCompany = parseFloat(opt?.getAttribute('data-debt-company')) || 0;
            const debtPersonal = parseFloat(opt?.getAttribute('data-debt-personal')) || 0;
            
            const elDebt = document.getElementById('cfd-pay-current-debt');
            if (elDebt) elDebt.innerText = formatMoney(debt);

            const elCty = document.getElementById('cfd-pay-debt-company');
            if (elCty) elCty.innerText = formatMoney(debtCompany);

            const elPersonal = document.getElementById('cfd-pay-debt-personal');
            if (elPersonal) elPersonal.innerText = formatMoney(debtPersonal);

            // Tự động chọn quỹ hợp lý theo loại nợ
            const fundSelect = document.getElementById('cfd-pay-fund');
            if (fundSelect) {
                if (debtCompany > 0 && debtPersonal === 0) {
                    fundSelect.value = 'COMPANY';
                } else if (debtPersonal > 0 && debtCompany === 0) {
                    fundSelect.value = 'PERSONAL';
                }
            }

            onCFDPayFundChange();
        }

        function onCFDPayFundChange() {
            const selectEl = document.getElementById('cfd-pay-supp-select');
            const opt = selectEl?.selectedOptions[0];
            const debtCompany = parseFloat(opt?.getAttribute('data-debt-company')) || 0;
            const debtPersonal = parseFloat(opt?.getAttribute('data-debt-personal')) || 0;
            const fund = document.getElementById('cfd-pay-fund')?.value || 'COMPANY';

            const maxDebt = (fund === 'COMPANY') ? debtCompany : debtPersonal;
            const fundName = (fund === 'COMPANY') ? 'Quỹ Cty' : 'Quỹ Cá Nhân';

            const amountInput = document.getElementById('cfd-pay-amount');
            if (amountInput) amountInput.value = maxDebt > 0 ? maxDebt : '';

            const hintEl = document.getElementById('cfd-pay-fund-hint');
            if (hintEl) hintEl.innerText = `Tối đa nợ thuộc ${fundName} có thể trả: ${formatMoney(maxDebt)}`;

            const fillBtn = document.getElementById('btn-cfd-fill-fund-debt');
            if (fillBtn) fillBtn.innerText = `Trả Hết Nợ ${fundName} (${formatMoney(maxDebt)})`;
        }

        function setCFDPayFullDebt() {
            const selectEl = document.getElementById('cfd-pay-supp-select');
            const opt = selectEl?.selectedOptions[0];
            const debtCompany = parseFloat(opt?.getAttribute('data-debt-company')) || 0;
            const debtPersonal = parseFloat(opt?.getAttribute('data-debt-personal')) || 0;
            const fund = document.getElementById('cfd-pay-fund')?.value || 'COMPANY';
            const maxDebt = (fund === 'COMPANY') ? debtCompany : debtPersonal;

            const amountInput = document.getElementById('cfd-pay-amount');
            if (amountInput) amountInput.value = maxDebt;
        }

        async function submitPaySupplierDebt() {
            const suppId = parseInt(document.getElementById('cfd-pay-supp-select')?.value);
            const amount = parseFloat(document.getElementById('cfd-pay-amount')?.value) || 0;
            const fundSource = document.getElementById('cfd-pay-fund')?.value || 'COMPANY';
            const note = document.getElementById('cfd-pay-note')?.value || '';

            if (!suppId) return alert('Vui lòng chọn Nhà cung cấp!');
            if (amount <= 0) return alert('Số tiền thanh toán phải lớn hơn 0!');

            const btn = document.getElementById('btn-cfd-submit-pay');
            if (btn) {
                btn.disabled = true;
                btn.innerText = 'Đang xuất chi...';
            }

            try {
                const res = await fetch('/api/cashflow-debts/pay-supplier', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        supplier_id: suppId,
                        amount: amount,
                        fund_source: fundSource,
                        note: note
                    })
                });

                if (!res.ok) {
                    const err = await res.json();
                    throw new Error(err.detail || 'Lỗi thanh toán nợ');
                }

                const data = await res.json();
                alert(`✅ ${data.message}\nĐã xuất 1 phiếu chi vào Sổ Quỹ (${fundSource === 'COMPANY' ? 'Quỹ Cty' : 'Quỹ Cá Nhân'})`);
                closeModalPaySupplierDebt();

                // Tải lại các màn hình liên quan
                loadCashflowDebtsData();
                if (typeof loadCashbook === 'function') loadCashbook();
                if (typeof loadContacts === 'function') loadContacts();
            } catch (e) {
                alert(`❌ Lỗi: ${e.message}`);
            } finally {
                if (btn) {
                    btn.disabled = false;
                    btn.innerText = 'Xác Nhận Xuất Chi';
                }
            }
        }

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

            if (mode === 'transactions_and_customers') {
                desc.innerHTML = `
                    <div class="font-bold text-amber-900 mb-1">Chế độ: XÓA GIAO DỊCH & KHÁCH HÀNG (GIỮ HÀNG HÓA)</div>
                    <ul class="list-disc pl-4 space-y-1 text-slate-700">
                        <li>Hóa đơn bán lẻ, đơn hàng và lịch sử thanh toán sẽ bị xóa sạch.</li>
                        <li>Danh bạ Khách Hàng và hồ sơ thú cưng/dịch vụ sẽ bị xóa.</li>
                        <li>Sổ quỹ thu chi, đơn nhập hàng và số tồn kho sẽ được đưa về 0.</li>
                        <li><strong>Giữ nguyên:</strong> Danh mục Hàng hóa, Nguyên liệu, Bảng giá, NCC, Công thức BOM và Mẫu in.</li>
                    </ul>
                `;
            } else if (mode === 'factory_reset') {
                desc.innerHTML = `
                    <div class="font-bold text-rose-900 mb-1">Chế độ: KHÔI PHỤC CÀI ĐẶT GỐC (FACTORY RESET)</div>
                    <ul class="list-disc pl-4 space-y-1 text-rose-800">
                        <li><strong>CỰC KỲ NGUY HIỂM:</strong> Xóa 100% dữ liệu hàng hóa, khách hàng, nhà cung cấp, hóa đơn, tồn kho, sổ quỹ và bảng giá.</li>
                        <li>Đưa phần mềm về trạng thái trống hoàn toàn như khi mới cài đặt.</li>
                    </ul>
                `;
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

            if (chk && txt === 'XOA HET DU LIEU') {
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
            if (!chk || txt !== 'XOA HET DU LIEU') {
                return alert('Vui lòng tích xác nhận và gõ chính xác: XOA HET DU LIEU');
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

        window.onload = init;
        if (document.readyState === 'complete' || document.readyState === 'interactive') {
            setTimeout(init, 50);
        } else {
            document.addEventListener('DOMContentLoaded', init);
        }
    