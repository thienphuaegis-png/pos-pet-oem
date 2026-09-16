

        // ==================== QUẢN LÝ KHO HÀNG & HÀNG HÓA CONSOLIDATED ====================
        let allWarehouses = [];
        let unifiedInventoryData = [];
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
                    btn.className = 'settings-subtab-btn px-3 py-2 rounded-lg bg-purple-600 text-white shadow-sm flex items-center gap-1.5';
                } else {
                    btn.className = 'settings-subtab-btn px-3 py-2 rounded-lg text-slate-600 hover:bg-slate-100 flex items-center gap-1.5';
                }
            });

            if (subId === 'company') loadCompanySettings();
            if (subId === 'templates') loadSettings();
        }

        // --- SUB 1: TỒN KHO TỔNG HỢP ---
        async function loadUnifiedInventory() {
            try {
                const whId = document.getElementById('unified-wh-filter')?.value || '';
                const itemType = document.getElementById('unified-type-filter')?.value || 'all';
                const search = document.getElementById('unified-search')?.value || '';
                const lowStock = document.getElementById('unified-low-stock')?.checked || false;

                let url = `/api/inventory/unified?item_type=${itemType}&low_stock=${lowStock}`;
                if (whId) url += `&warehouse_id=${whId}`;
                if (search) url += `&search=${encodeURIComponent(search)}`;

                const [resInv, resWh] = await Promise.all([
                    fetch(url),
                    fetch('/api/warehouses')
                ]);
                
                const data = await resInv.json();
                allWarehouses = await resWh.json();

                const whSelect = document.getElementById('unified-wh-filter');
                if (whSelect && whSelect.options.length <= 1) {
                    whSelect.innerHTML = '<option value="">Tất cả kho hàng</option>' + 
                        allWarehouses.map(w => `<option value="${w.id}">${w.name}</option>`).join('');
                    if (whId) whSelect.value = whId;
                }

                document.getElementById('kpi-inv-count').innerText = (data.total_count || 0).toLocaleString('vi-VN');
                document.getElementById('kpi-inv-qty').innerText = (data.total_quantity || 0).toLocaleString('vi-VN');
                document.getElementById('kpi-inv-val').innerText = formatMoney(data.total_value || 0);

                const tbody = document.getElementById('table-unified-inventory');
                if (!data.items || data.items.length === 0) {
                    tbody.innerHTML = '<tr><td colspan="9" class="p-6 text-center text-gray-400">Không tìm thấy mặt hàng nào trong kho</td></tr>';
                    return;
                }

                tbody.innerHTML = data.items.map(item => {
                    const isProd = item.item_type === 'product';
                    const badge = isProd 
                        ? '<span class="px-2 py-0.5 rounded text-[10px] font-bold bg-sky-100 text-sky-700">Hàng Hóa</span>'
                        : '<span class="px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-100 text-emerald-700">Nguyên Liệu</span>';
                    const stockColor = item.quantity <= 0 ? 'text-red-600 font-bold' : (item.quantity <= 5 ? 'text-amber-600 font-bold' : 'font-bold text-slate-800');

                    return `
                        <tr class="border-b hover:bg-gray-50 text-xs">
                            <td class="p-2.5 font-mono font-bold text-slate-600">${item.code || '-'}</td>
                            <td class="p-2.5 font-bold text-slate-800">${item.name}</td>
                            <td class="p-2.5 text-center">${badge}</td>
                            <td class="p-2.5 font-medium text-slate-600">${item.warehouse_name}</td>
                            <td class="p-2.5 text-right ${stockColor}">${item.quantity.toLocaleString('vi-VN')}</td>
                            <td class="p-2.5 text-gray-500">${item.unit || 'cái'}</td>
                            <td class="p-2.5 text-right font-medium text-gray-700">${formatMoney(item.cost_price)}</td>
                            <td class="p-2.5 text-right font-bold text-rose-600">${formatMoney(item.total_value)}</td>
                            <td class="p-2.5 text-center">
                                <button onclick="openItemLogsModal('${item.item_type}', ${item.id}, '${encodeURIComponent(item.name)}', '${item.code || ''}', '${item.unit || ''}')" 
                                        class="px-2 py-1 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded text-[11px] font-bold">
                                    📜 Thẻ kho
                                </button>
                            </td>
                        </tr>
                    `;
                }).join('');
            } catch (e) {
                console.error("loadUnifiedInventory error:", e);
            }
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

        // --- MODAL PRODUCT CRUD ---
        function showModalProduct() {
            document.getElementById('modal-prod-code').value = '';
            document.getElementById('modal-prod-name').value = '';
            document.getElementById('modal-prod-type').value = 'product';
            document.getElementById('modal-prod-unit').value = 'cái';
            document.getElementById('modal-prod-cost').value = '0';
            document.getElementById('modal-prod-price').value = '0';
            document.getElementById('modal-prod-stock').value = '0';
            document.getElementById('modal-product').classList.remove('hidden');
        }

        function closeModalProduct() {
            document.getElementById('modal-product')?.classList.add('hidden');
        }

        async function saveNewProduct() {
            const name = document.getElementById('modal-prod-name').value.trim();
            const code = document.getElementById('modal-prod-code').value.trim();
            const type = document.getElementById('modal-prod-type').value;
            const unit = document.getElementById('modal-prod-unit').value.trim();
            const cost_price = parseFloat(document.getElementById('modal-prod-cost').value) || 0;
            const price = parseFloat(document.getElementById('modal-prod-price').value) || 0;
            const stock = parseFloat(document.getElementById('modal-prod-stock').value) || 0;

            if (!name) {
                alert("Vui lòng nhập tên sản phẩm!");
                return;
            }

            try {
                const res = await fetch('/api/products', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ code, name, type, unit, cost_price, price, stock })
                });

                if (!res.ok) {
                    const err = await res.json();
                    alert("Lỗi: " + (err.detail || "Không thể tạo sản phẩm"));
                    return;
                }

                closeModalProduct();
                loadProducts();
                loadUnifiedInventory();
                alert("Đã thêm sản phẩm mới thành công!");
            } catch (e) {
                console.error("saveNewProduct error:", e);
                alert("Lỗi kết nối khi lưu sản phẩm");
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
            // Map legacy ids
            if (tabId === 'products') { tabId = 'inventory'; subTabId = 'products'; }
            else if (tabId === 'cost-management') { tabId = 'inventory'; subTabId = 'cost'; }
            else if (tabId === 'production') { tabId = 'inventory'; subTabId = 'production'; }
            else if (tabId === 'company') { tabId = 'settings'; subTabId = 'company'; }

            document.querySelectorAll('[id^="tab-"]').forEach(el => el.classList.add('hidden'));
            const targetTab = document.getElementById('tab-' + tabId);
            if (targetTab) targetTab.classList.remove('hidden');

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
            } else if (tabId === 'contacts') {
                loadContacts();
            } else if (tabId === 'cashbook') {
                loadCashbook();
            } else if (tabId === 'reports') {
                loadReports();
            } else if (tabId === 'purchases') {
                initPurchases();
                loadPurchasesList();
            } else if (tabId === 'pos') {
                loadProducts();
            }
        }

        async function init() {
            await Promise.all([loadProducts(), loadContacts(), loadStaff()]);
            renderPOSProducts();
            initPurchases();
            initProduction();
        }

        async function loadProducts() {
            const res = await fetch('/api/products');
            allProducts = await res.json();
            
            const tbody = document.getElementById('table-products');
            tbody.innerHTML = allProducts.map(p => `
                <tr class="border-b hover:bg-gray-50">
                    <td class="p-3 font-mono text-xs font-bold">${p.code}</td>
                    <td class="p-3 font-medium">${p.name}</td>
                    <td class="p-3"><span class="px-2 py-0.5 rounded text-xs ${p.type === 'service' ? 'bg-indigo-100 text-indigo-700' : p.type === 'material' ? 'bg-amber-100 text-amber-700' : 'bg-emerald-100 text-emerald-700'}">${p.type}</span></td>
                    <td class="p-3 text-right">${formatMoney(p.cost_price)}</td>
                    <td class="p-3 text-right font-bold text-sky-600">${formatMoney(p.sell_price)}</td>
                    <td class="p-3 text-right font-bold ${p.stock <= 5 ? 'text-red-500' : ''}">${p.stock}</td>
                    <td class="p-3 text-gray-500">${p.unit}</td>
                </tr>
            `).join('');
        }

        async function loadContacts() {
            const res = await fetch('/api/contacts');
            allContacts = await res.json();
            
            const custSelect = document.getElementById('pos-customer');
            const suppSelect = document.getElementById('purchase-supplier');
            
            custSelect.innerHTML = allContacts.filter(c => c.type === 'customer').map(c => `<option value="${c.id}">${c.name}</option>`).join('');
            suppSelect.innerHTML = allContacts.filter(c => c.type === 'supplier').map(c => `<option value="${c.id}">${c.name}</option>`).join('');

            const tbody = document.getElementById('table-contacts');
            tbody.innerHTML = allContacts.map(c => `
                <tr class="border-b hover:bg-gray-50">
                    <td class="p-3"><span class="px-2 py-0.5 rounded text-xs ${c.type === 'customer' ? 'bg-blue-100 text-blue-700' : 'bg-orange-100 text-orange-700'}">${c.type}</span></td>
                    <td class="p-3 font-medium">${c.name}</td>
                    <td class="p-3">${c.phone || '-'}</td>
                    <td class="p-3">${c.address || '-'}</td>
                    <td class="p-3 text-right font-bold ${c.debt > 0 ? 'text-red-600' : 'text-gray-500'}">${formatMoney(c.debt)}</td>
                </tr>
            `).join('');
        }

        async function loadStaff() {
            const res = await fetch('/api/staff');
            allStaff = await res.json();
            const staffSelect = document.getElementById('pos-staff');
            staffSelect.innerHTML = allStaff.map(s => `<option value="${s.id}">${s.name} (${s.commission_rate}%)</option>`).join('');
        }

        function renderPOSProducts() {
            const q = document.getElementById('search-pos-product').value.toLowerCase();
            const filtered = allProducts.filter(p => p.type !== 'material' && (p.name.toLowerCase().includes(q) || p.code.toLowerCase().includes(q)));
            
            const container = document.getElementById('pos-product-list');
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
            const discount = parseFloat(document.getElementById('pos-discount').value) || 0;
            const finalAmount = Math.max(0, total - discount);
            const paidInput = document.getElementById('pos-paid');
            
            // Mac dinh neu khach tra chua go thi auto dien du
            if (!paidInput.dataset.manual) {
                paidInput.value = finalAmount;
            }
            const paid = parseFloat(paidInput.value) || 0;
            const debt = Math.max(0, finalAmount - paid);

            document.getElementById('pos-total').innerText = formatMoney(total);
            document.getElementById('pos-final').innerText = formatMoney(finalAmount);
            document.getElementById('pos-debt').innerText = formatMoney(debt);
        }

        document.getElementById('pos-paid').addEventListener('input', function() {
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
        let currentViewingPurchase = null;

        async function initPurchases() {
            try {
                const [whRes, suppRes, ingRes, prodRes] = await Promise.all([
                    fetch('/api/warehouses'),
                    fetch('/api/contacts?type=supplier'),
                    fetch('/api/ingredients'),
                    fetch('/api/products')
                ]);

                allWarehousesList = await whRes.json();
                const suppliers = await suppRes.json();
                costIngredients = await ingRes.json();
                allProducts = await prodRes.json();

                const suppSel = document.getElementById('purchase-supplier');
                if (suppSel) {
                    suppSel.innerHTML = '<option value="">-- Chọn Nhà Cung Cấp --</option>' + 
                        suppliers.map(s => `<option value="${s.id}">${s.name} (${s.phone || 'Không SĐT'})</option>`).join('');
                }

                const whSel = document.getElementById('purchase-warehouse');
                if (whSel) {
                    whSel.innerHTML = allWarehousesList.map(w => `<option value="${w.id}">${w.name}</option>`).join('');
                }

                const expInput = document.getElementById('purchase-expected-date');
                if (expInput && !expInput.value) {
                    const today = new Date().toISOString().split('T')[0];
                    expInput.value = today;
                }

                renderPurchaseItems();
            } catch (e) {
                console.error('initPurchases err:', e);
            }
        }

        function filterPurchaseSearch(val) {
            const resBox = document.getElementById('purchase-search-results');
            if (!resBox) return;

            const matches = [];

            // Tìm kiếm trong Nguyên liệu / Vật tư
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

            // Tìm kiếm trong Hàng hóa / Sản phẩm
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

        function resetPurchaseForm() {
            purchaseCart = [];
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

        async function submitPurchase() {
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

            const payload = {
                supplier_id: suppId,
                warehouse_id: whId,
                discount: discount,
                shipping_fee: shipping,
                other_fee: otherFee,
                vat_rate: vatRate,
                paid_amount: paid,
                expected_date: expectedDate,
                note: note,
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

            try {
                const res = await fetch('/api/purchases', {
                    method: 'POST',
                    headers: {'Content-Type': 'application/json'},
                    body: JSON.stringify(payload)
                });

                const data = await res.json();
                if (res.ok) {
                    alert(`✅ Tạo đơn nhập hàng thành công: ${data.purchase_code}!\nTrạng thái: CHỜ NHẬN HÀNG (chưa tăng tồn kho cho đến khi kiểm đếm thực nhận).`);
                    resetPurchaseForm();
                    togglePurchaseView('list');
                } else {
                    alert('Lỗi: ' + (data.detail || 'Không thể lưu phiếu nhập'));
                }
            } catch (e) {
                console.error(e);
                alert('Lỗi kết nối máy chủ!');
            }
        }

        function togglePurchaseView(view) {
            const createView = document.getElementById('purchase-create-view');
            const listView = document.getElementById('purchase-list-view');
            const btnNew = document.getElementById('btn-purchase-new');
            const btnHist = document.getElementById('btn-purchase-history');

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
                loadPurchasesList();
            }
        }

        async function loadPurchasesList() {
            try {
                const res = await fetch('/api/purchases');
                const list = await res.json();
                const tbody = document.getElementById('table-purchases-history');
                if (!tbody) return;

                if (list.length === 0) {
                    tbody.innerHTML = '<tr><td colspan="9" class="p-4 text-center text-gray-400">Chưa có phiếu nhập hàng nào</td></tr>';
                    return;
                }

                tbody.innerHTML = list.map(p => {
                    const statusBadge = p.status === 'received' 
                        ? '<span class="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-800">✅ Đã Nhận Hàng</span>' 
                        : (p.status === 'cancelled'
                            ? '<span class="px-2 py-0.5 rounded-full text-[10px] font-bold bg-rose-100 text-rose-800">❌ Đã Hủy</span>'
                            : '<span class="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-100 text-amber-800">⏳ Chờ Nhận</span>');

                    const actionButtons = p.status === 'pending'
                        ? `
                        <button onclick="openReceiveModal('${p.code}')" class="bg-emerald-600 hover:bg-emerald-700 text-white font-bold px-2 py-1 rounded text-[11px] shadow" title="Kiểm đếm và nhập hàng vào kho">📥 Nhận Hàng</button>
                        <button onclick="deletePurchaseOrder('${p.code}')" class="text-rose-600 hover:text-rose-800 font-bold px-1.5 py-1 border border-rose-200 rounded text-[11px]" title="Hủy phiếu nhập">✕ Hủy</button>
                        `
                        : `
                        <button onclick="openReceiveModal('${p.code}', true)" class="bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold px-2 py-1 border rounded text-[11px]">👁️ Xem</button>
                        <button onclick="deletePurchaseOrder('${p.code}')" class="text-rose-600 hover:text-rose-800 font-bold px-1 py-1 border border-rose-200 rounded text-[11px]" title="Hủy phiếu và hoàn lại kho/công nợ">🗑️ Hủy</button>
                        `;

                    return `
                    <tr class="border-b hover:bg-gray-50 text-xs">
                        <td class="p-2.5 font-mono font-bold text-sky-700">${p.code}</td>
                        <td class="p-2.5 text-gray-500">${p.created_at || '-'}</td>
                        <td class="p-2.5 font-semibold text-slate-700">${p.expected_date || '<span class="text-gray-400">---</span>'}</td>
                        <td class="p-2.5 font-medium text-slate-800">${p.supplier_name || 'NCC Mặc định'}</td>
                        <td class="p-2.5 text-gray-600">${p.warehouse_name || 'Kho Tổng'}</td>
                        <td class="p-2.5 text-center">${statusBadge}</td>
                        <td class="p-2.5 text-right font-mono font-bold text-slate-900">${formatMoney(p.total_amount)}</td>
                        <td class="p-2.5 text-right font-mono font-bold ${p.debt_amount > 0 ? 'text-rose-600' : 'text-gray-400'}">${formatMoney(p.debt_amount)}</td>
                        <td class="p-2.5 text-center space-x-1">${actionButtons}</td>
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

        // So quy
        async function loadCashbook() {
            const res = await fetch('/api/cashbook');
            const data = await res.json();
            const tbody = document.getElementById('table-cashbook');
            tbody.innerHTML = data.map(c => `
                <tr class="border-b hover:bg-gray-50">
                    <td class="p-3 font-mono text-xs font-bold">${c.code}</td>
                    <td class="p-3"><span class="px-2 py-0.5 rounded text-xs ${c.type === 'in' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}">${c.type === 'in' ? 'Thu' : 'Chi'}</span></td>
                    <td class="p-3">${c.category}</td>
                    <td class="p-3 text-right font-bold ${c.type === 'in' ? 'text-green-600' : 'text-red-600'}">${formatMoney(c.amount)}</td>
                    <td class="p-3 text-gray-500">${c.note || '-'}</td>
                    <td class="p-3 text-xs text-gray-400">${c.created_at}</td>
                </tr>
            `).join('');
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
            const payload = {
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
                alert('Đã lưu thông tin doanh nghiệp & cấu hình QR!');
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
                const res = await fetch('/api/ingredients');
                costIngredients = await res.json();
                
                const tbody = document.getElementById('table-cost-ingredients');
                if (!tbody) return;

                if (costIngredients.length === 0) {
                    tbody.innerHTML = '<tr><td colspan="7" class="p-3 text-center text-gray-400">Chưa có nguyên liệu / dịch vụ nào</td></tr>';
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
                        <td class="p-2 text-right font-bold ${ing.type === 'SERVICE' ? 'text-gray-400' : (ing.total_stock <= 5 ? 'text-rose-600' : 'text-slate-700')}">
                            ${ing.type === 'SERVICE' ? '-' : ing.total_stock}
                        </td>
                        <td class="p-2 text-gray-500">${ing.unit}</td>
                        <td class="p-2 text-right font-medium text-slate-700">${formatMoney(ing.latest_cost)}</td>
                        <td class="p-2 text-center space-x-1">
                            <button onclick="viewIngredientDetail(${ing.id})" class="text-xs bg-sky-50 text-sky-600 border border-sky-200 px-2 py-0.5 rounded hover:bg-sky-100 font-medium" title="Xem chi tiết biến động & lịch sử giá">🔍 Chi tiết</button>
                            <button onclick="goToPurchaseTabWithItem('ingredient', ${ing.id})" class="text-xs text-indigo-600 hover:underline font-medium ${ing.type === 'SERVICE' ? 'hidden' : ''}" title="Tạo phiếu nhập hàng cho nguyên liệu này">📥 Nhập hàng</button>
                        </td>
                    </tr>
                `).join('');
            } catch (e) {
                console.error(e);
            }
        }

        async function loadCostProductOptions() {
            const res = await fetch('/api/products');
            const products = await res.json();
            const sel = document.getElementById('cost-product-select');
            if (sel) {
                sel.innerHTML = '<option value="">-- Chọn sản phẩm để xem BOM --</option>' + 
                    products.map(p => `<option value="${p.id}">${p.code} - ${p.name} (${formatMoney(p.sell_price)})</option>`).join('');
            }
        }

        async function loadProductBOMDetails(productId) {
            if (!productId) {
                document.getElementById('cost-summary-card').classList.add('hidden');
                document.getElementById('table-product-bom-items').innerHTML = '<tr><td colspan="4" class="p-3 text-center text-gray-400">Chưa chọn sản phẩm</td></tr>';
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
                        <td class="p-1.5 text-right font-mono">${item.quantity} ${item.unit}</td>
                        <td class="p-1.5 text-right text-rose-600 font-medium">${formatMoney(item.line_cost)}</td>
                        <td class="p-1.5 text-center">
                            <button onclick="removeBOMItem(${item.ingredient_id})" class="text-red-500 hover:text-red-700 font-bold">×</button>
                        </td>
                    </tr>
                `).join('');
            } catch (e) {
                console.error(e);
            }
        }

        function openModalAddIngredient() {
            document.getElementById('modal-ing-code').value = '';
            document.getElementById('modal-ing-name').value = '';
            document.getElementById('modal-ing-unit').value = 'kg';
            document.getElementById('modal-ing-type').value = 'IS_PHYSICAL';
            document.getElementById('modal-ing-stock').value = '0';
            document.getElementById('modal-ing-cost').value = '0';
            document.getElementById('modal-ingredient').classList.remove('hidden');
        }

        function closeModalIngredient() {
            document.getElementById('modal-ingredient').classList.add('hidden');
        }

        async function saveNewIngredient() {
            const name = document.getElementById('modal-ing-name').value.trim();
            if (!name) return alert('Vui lòng nhập tên nguyên liệu!');

            const payload = {
                code: document.getElementById('modal-ing-code').value.trim() || null,
                name: name,
                unit: document.getElementById('modal-ing-unit').value.trim() || 'cái',
                type: document.getElementById('modal-ing-type').value,
                initial_stock: parseFloat(document.getElementById('modal-ing-stock').value) || 0,
                initial_cost: parseFloat(document.getElementById('modal-ing-cost').value) || 0,
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
                alert('Đã thêm nguyên liệu thành công!');
            } else {
                const err = await res.json();
                alert('Lỗi: ' + (err.detail || 'Không thể tạo nguyên liệu'));
            }
        }

        function openModalAddBOMItem() {
            const prodId = document.getElementById('cost-product-select').value;
            if (!prodId) return alert('Vui lòng chọn sản phẩm trước!');
            
            const sel = document.getElementById('modal-bom-ing-select');
            sel.innerHTML = costIngredients.map(i => `<option value="${i.id}">${i.name} (${i.unit} - ${formatMoney(i.latest_cost)})</option>`).join('');
            document.getElementById('modal-bom-quantity').value = '';
            document.getElementById('modal-bom-item').classList.remove('hidden');
        }

        function closeModalBOMItem() {
            document.getElementById('modal-bom-item').classList.add('hidden');
        }

        async function addCurrentBOMItem() {
            const prodId = document.getElementById('cost-product-select').value;
            const ingId = parseInt(document.getElementById('modal-bom-ing-select').value);
            const qty = parseFloat(document.getElementById('modal-bom-quantity').value);

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

            const res = await fetch(`/api/products/${prodId}/bom`, {
                method: 'POST',
                headers: {'Content-Type': 'application/json'},
                body: JSON.stringify({ items: currentItems })
            });

            if (res.ok) {
                closeModalBOMItem();
                await loadProductBOMDetails(prodId);
                await loadProducts(); // reload bảng hàng hóa
            } else {
                alert('Lỗi khi lưu định lượng BOM');
            }
        }

        async function removeBOMItem(ingId) {
            if (!confirm('Xóa thành phần này khỏi BOM?')) return;
            const prodId = document.getElementById('cost-product-select').value;
            let currentItems = currentBOMData.bom_items
                .filter(b => b.ingredient_id !== ingId)
                .map(b => ({ ingredient_id: b.ingredient_id, quantity: b.quantity }));

            const res = await fetch(`/api/products/${prodId}/bom`, {
                method: 'POST',
                headers: {'Content-Type': 'application/json'},
                body: JSON.stringify({ items: currentItems })
            });

            if (res.ok) {
                await loadProductBOMDetails(prodId);
                await loadProducts();
            }
        }

        async function recalculateActiveProductCost() {
            const prodId = document.getElementById('cost-product-select').value;
            if (!prodId) return alert('Vui lòng chọn sản phẩm!');
            const res = await fetch(`/api/products/${prodId}/recalculate-cost`, { method: 'POST' });
            if (res.ok) {
                await loadProductBOMDetails(prodId);
                await loadProducts();
                alert('Đã cập nhật giá Cost thành công!');
            }
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
                @page { size: ${dim.printSize || 'A4 portrait'}; margin: 0; }
                @media print {
                    html, body {
                        margin: 0 !important;
                        padding: 0 !important;
                        height: auto !important;
                        overflow: visible !important;
                    }
                    .print-container { 
                        width: ${dim.width} !important; 
                        height: auto !important; 
                        max-height: ${dim.height} !important;
                        margin: 0 !important;
                        padding: 0 !important;
                        overflow: hidden !important;
                        page-break-after: avoid !important;
                        page-break-inside: avoid !important;
                    }
                    .print-inner {
                        transform-origin: top left;
                        page-break-after: avoid !important;
                        page-break-inside: avoid !important;
                    }
                }
            </style>
            <div class="print-container" style="width: ${dim.width}; margin: 0 auto; background: white; overflow: hidden; position: relative;">
                <div class="print-inner" style="position: relative; width: ${canvasW}px; min-height: ${Math.min(canvasH, canvasH + deltaY)}px; font-family: monospace;">`;

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

            document.getElementById('print-modal').classList.remove('hidden');
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
            document.getElementById('print-modal').classList.add('hidden');
        }


        window.onload = init;
        if (document.readyState === 'complete' || document.readyState === 'interactive') {
            setTimeout(init, 50);
        } else {
            document.addEventListener('DOMContentLoaded', init);
        }
    