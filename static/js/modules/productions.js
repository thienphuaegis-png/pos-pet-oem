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

                if (!whRes.ok) return;
                const whData = await whRes.json();
                const prodData = await prodRes.json();
                const ingData = await ingRes.json();
                const bomData = await bomRes.json();
                allWarehousesList = Array.isArray(whData) ? whData : [];
                allProducts = Array.isArray(prodData) ? prodData : [];
                costIngredients = Array.isArray(ingData) ? ingData : [];
                costBOMList = Array.isArray(bomData) ? bomData : [];

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
                resBox.innerHTML = '<div class="p-3 text-gray-400 text-center ">Không tìm thấy thành phẩm có định lượng BOM phù hợp</div>';
                resBox.classList.remove('hidden');
                return;
            }

            resBox.innerHTML = matches.slice(0, 20).map(p => `
                <div onclick="addProductionItem(${p.id})" class="p-2.5 hover:bg-emerald-50 cursor-pointer flex justify-between items-center transition-colors">
                    <div>
                        <div class="font-bold text-slate-800">${p.name}</div>
                        <div class="text-xs text-gray-500 font-mono">Mã: ${p.code || '---'} | ĐVT: ${p.unit || 'cái'}</div>
                    </div>
                    <div class="text-right">
                        <div class="font-bold text-emerald-700 font-mono">${formatMoney(p.cost_price || 0)}</div>
                        <div class="text-xs text-gray-500">Tồn hiện tại: <span class="font-bold text-slate-800">${p.stock || 0}</span></div>
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
                            ? '<span class="px-2 py-0.5 rounded bg-rose-100 text-rose-700 font-bold text-xs">Thiếu ' + (Math.round((m.qtyNeeded - m.stock)*100)/100) + ' ' + m.unit + '</span>'
                            : '<span class="px-2 py-0.5 rounded bg-emerald-100 text-emerald-700 font-bold text-xs">Đủ kho</span>';

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

            const confirmed = typeof window.showConfirmModal === 'function'
                ? await window.showConfirmModal({
                    title: 'Tạo Lệnh Sản Xuất',
                    message: `Tiến hành tạo lệnh sản xuất cho ${productionCart.length} mặt hàng?`,
                    subMessage: 'Kho nguyên vật liệu sẽ được khấu trừ tương ứng theo định lượng BOM.',
                    type: 'primary',
                    confirmText: 'Tạo Lệnh Sản Xuất',
                    cancelText: 'Hủy bỏ',
                    icon: '⚙️'
                })
                : confirm(`Tiến hành tạo lệnh sản xuất cho ${productionCart.length} mặt hàng?\nKho nguyên vật liệu sẽ được khấu trừ tương ứng theo định lượng BOM.`);
            if (!confirmed) return;

            try {
                const res = await fetch('/api/productions', {
                    method: 'POST',
                    headers: {'Content-Type': 'application/json'},
                    body: JSON.stringify(payload)
                });

                const data = await res.json();
                if (res.ok) {
                    if (window.showToast) window.showToast(`✅ Lệnh sản xuất [${data.production_code}] hoàn tất thành công!`, 'success');
                    else alert(`✅ Lệnh sản xuất [${data.production_code}] hoàn tất thành công!\nĐã nhập kho thành phẩm và khấu trừ nguyên vật liệu.`);
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
                        <td class="p-2.5 text-gray-500">${formatDateTime(p.created_at) || '-'}</td>
                        <td class="p-2.5 text-slate-700 font-medium">${p.warehouse_name || 'Kho Tổng'}</td>
                        <td class="p-2.5 text-center font-bold">${p.item_count || 1} món</td>
                        <td class="p-2.5 text-right font-mono font-bold text-sky-700">${p.total_produced_qty}</td>
                        <td class="p-2.5 text-right font-mono font-bold text-slate-900">${formatMoney(p.total_cost || 0)}</td>
                        <td class="p-2.5 text-gray-500">${p.note || '-'}</td>
                        <td class="p-2.5 text-center">
                            <button onclick="openProdDetailModal('${p.code}')" class="bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold px-2 py-1 border rounded text-xs">👁️ Xem</button>
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
        window.closeProdDetailModal = closeProdDetailModal;

        // So quy & Quan Ly Da Tai Khoan
        window.allCashbookData = [];
        window.allPaymentAccounts = [];

        async function loadCashbook() {
            try {
                // 1. Load payment accounts first
                const accRes = await fetch('/api/payment-accounts?_t=' + Date.now());
                window.allPaymentAccounts = await accRes.json();

                // Render account filter popup items & native hidden select
                const filterAccInput = document.getElementById('cashbook-filter-account');
                const nativeSelect = document.getElementById('cashbook-filter-account-native');
                const popupContainer = document.getElementById('cashbook-acc-popup-items');
                const currentVal = filterAccInput ? filterAccInput.value : '';

                if (popupContainer) {
                    let itemsHtml = `
                        <div onclick="selectCashbookAcc('', 'Tất cả tài khoản / quỹ', '', '', 0)" class="p-2.5 rounded-lg border ${!currentVal ? 'border-sky-400 bg-sky-50/50' : 'border-slate-200'} hover:border-sky-400 hover:bg-sky-50/30 cursor-pointer flex items-center justify-between transition">
                            <div class="flex items-center gap-2">
                                <div class="w-7 h-7 rounded-lg bg-slate-800 text-white flex items-center justify-center font-bold text-xs">🏦</div>
                                <div>
                                    <div class="font-bold text-slate-800">Tất cả tài khoản / quỹ</div>
                                    <div class="text-xs text-slate-500">Xem toàn bộ dòng tiền vào ra</div>
                                </div>
                            </div>
                            <span class="text-xs font-bold ${!currentVal ? 'text-sky-600' : 'text-slate-400'}">● Mặc định</span>
                        </div>
                    `;

                    window.allPaymentAccounts.forEach(a => {
                        const isCty = a.owner_type === 'COMPANY';
                        const isBank = a.account_type === 'bank';
                        const icon = isBank ? '🏦' : (a.account_type === 'ewallet' ? '📱' : (a.account_type === 'pos_card' ? '💳' : '💵'));
                        const isSelected = currentVal == a.id;
                        itemsHtml += `
                            <div onclick="selectCashbookAcc(${a.id}, '${a.name.replace(/'/g, "\\'")}', '${a.code}', '${a.owner_type}', ${a.current_balance || 0})" class="p-2.5 rounded-lg border ${isSelected ? 'border-sky-500 bg-sky-50/60' : 'border-slate-200'} hover:border-sky-400 hover:bg-sky-50/40 cursor-pointer flex items-center justify-between transition">
                                <div class="flex items-center gap-2">
                                    <div class="w-7 h-7 rounded-lg ${isCty ? 'bg-sky-600' : 'bg-sky-600'} text-white flex items-center justify-center font-bold text-xs">${icon}</div>
                                    <div>
                                        <div class="font-bold text-slate-800 text-xs">${a.name}</div>
                                        <div class="text-xs ${isCty ? 'text-blue-700' : 'text-sky-700'} font-semibold">
                                            ${isCty ? '🏢 Quỹ Cty' : '👤 Cá Nhân'} • ${a.code} ${a.is_default ? '★' : ''}
                                        </div>
                                    </div>
                                </div>
                                <div class="text-right">
                                    <div class="font-mono font-bold text-xs ${(a.current_balance || 0) >= 0 ? 'text-slate-800' : 'text-rose-600'}">${formatMoney(a.current_balance || 0)}</div>
                                    <span class="text-xs text-sky-600 font-bold">Chọn ➔</span>
                                </div>
                            </div>
                        `;
                    });
                    popupContainer.innerHTML = itemsHtml;
                }

                if (nativeSelect) {
                    let opts = '<option value="">🏦 Tất cả tài khoản / quỹ</option>';
                    window.allPaymentAccounts.forEach(a => {
                        opts += `<option value="${a.id}" ${currentVal == a.id ? 'selected' : ''}>${a.code} - ${a.name}</option>`;
                    });
                    nativeSelect.innerHTML = opts;
                }

                // Render account KPI cards
                const kpisContainer = document.getElementById('cashbook-accounts-kpis');
                const countBadge = document.getElementById('cashbook-accounts-count');
                if (countBadge) countBadge.innerText = `${window.allPaymentAccounts.length} tài khoản`;
                if (kpisContainer) {
                    kpisContainer.innerHTML = window.allPaymentAccounts.map(a => {
                        const isBank = a.account_type === 'bank';
                        const isCty = a.owner_type === 'COMPANY';
                        const icon = isBank ? '🏦' : (a.account_type === 'ewallet' ? '📱' : (a.account_type === 'pos_card' ? '💳' : '💵'));
                        return `
                            <div class="bg-white p-3 rounded-lg border shadow-xs hover:shadow-md transition cursor-pointer ${a.is_default ? 'border-sky-400 bg-sky-50/20' : 'border-slate-200'}" onclick="filterCashbookByAccount(${a.id})">
                                <div class="flex items-center justify-between">
                                    <span class="text-xs font-bold text-slate-800 flex items-center gap-1">
                                        <span>${icon}</span>
                                        <span class="truncate max-w-[130px]" title="${a.name}">${a.name}</span>
                                    </span>
                                    <span class="text-xs font-bold px-1.5 py-0.5 rounded ${isCty ? 'bg-blue-100 text-blue-700' : 'bg-sky-100 text-sky-700'}">
                                        ${isCty ? 'Cty' : 'Cá nhân'}
                                    </span>
                                </div>
                                <div class="mt-1.5 font-mono text-base font-bold ${a.current_balance >= 0 ? 'text-slate-800' : 'text-rose-600'}">
                                    ${formatMoney(a.current_balance || 0)}
                                </div>
                                <div class="text-xs text-gray-400 flex items-center justify-between mt-1">
                                    <span class="font-mono font-semibold text-slate-500">${a.code}</span>
                                    ${a.is_default ? '<span class="text-sky-600 font-bold">★ Mặc định</span>' : ''}
                                </div>
                            </div>
                        `;
                    }).join('');
                }

                // 2. Fetch cashbook data with filters
                const selectedAcc = filterAccInput ? filterAccInput.value : '';
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

        function openCashbookAccPickerModal() {
            const m = document.getElementById('modal-cashbook-acc-picker');
            if (m) {
                m.classList.remove('hidden');
                const inp = document.getElementById('cashbook-acc-search-input');
                if (inp) {
                    inp.value = '';
                    filterCashbookAccPopupList();
                    setTimeout(() => inp.focus(), 100);
                }
            }
        }

        function closeCashbookAccPickerModal() {
            document.getElementById('modal-cashbook-acc-picker')?.classList.add('hidden');
        }
        window.closeCashbookAccPickerModal = closeCashbookAccPickerModal;

        function filterCashbookAccPopupList() {
            const q = (document.getElementById('cashbook-acc-search-input')?.value || '').toLowerCase().trim();
            const items = document.querySelectorAll('#cashbook-acc-popup-items > div');
            items.forEach(it => {
                it.style.display = it.innerText.toLowerCase().includes(q) ? 'flex' : 'none';
            });
        }

        function selectCashbookAcc(accId, name, code, ownerType, balance) {
            const input = document.getElementById('cashbook-filter-account');
            const lbl = document.getElementById('cashbook-acc-label');
            const icon = document.getElementById('cashbook-acc-icon');
            if (input) input.value = accId ? String(accId) : '';

            if (lbl) {
                if (!accId) {
                    lbl.innerText = 'Tất cả tài khoản / quỹ';
                    if (icon) icon.innerText = '🏦';
                } else {
                    const badge = ownerType === 'COMPANY' ? '[Cty]' : '[Cá nhân]';
                    lbl.innerText = `${name} ${badge} (${formatMoney(balance)})`;
                    if (icon) icon.innerText = ownerType === 'COMPANY' ? '🏢' : '👤';
                }
            }
            closeCashbookAccPickerModal();
            loadCashbook();
        }

        function setCashbookFilterType(type) {
            const input = document.getElementById('cashbook-filter-type');
            if (input) input.value = type;

            const pillAll = document.getElementById('cb-pill-type-all');
            const pillIn = document.getElementById('cb-pill-type-in');
            const pillOut = document.getElementById('cb-pill-type-out');

            if (pillAll && pillIn && pillOut) {
                pillAll.className = "px-2.5 py-1 rounded-md font-semibold text-xs text-slate-600 hover:bg-slate-200 transition";
                pillIn.className = "px-2.5 py-1 rounded-md font-semibold text-xs text-slate-600 hover:text-emerald-700 hover:bg-emerald-50 transition";
                pillOut.className = "px-2.5 py-1 rounded-md font-semibold text-xs text-slate-600 hover:text-rose-700 hover:bg-rose-50 transition";

                if (type === 'in') {
                    pillIn.className = "px-2.5 py-1 rounded-md font-bold text-xs bg-emerald-600 text-white shadow-xs transition";
                } else if (type === 'out') {
                    pillOut.className = "px-2.5 py-1 rounded-md font-bold text-xs bg-rose-600 text-white shadow-xs transition";
                } else {
                    pillAll.className = "px-2.5 py-1 rounded-md font-bold text-xs bg-slate-800 text-white shadow-xs transition";
                }
            }
            loadCashbook();
        }

        function filterCashbookByAccount(accId) {
            const a = window.allPaymentAccounts?.find(x => x.id === accId);
            if (a) {
                selectCashbookAcc(a.id, a.name, a.code, a.owner_type, a.current_balance || 0);
            } else {
                selectCashbookAcc('', 'Tất cả tài khoản / quỹ', '', '', 0);
            }
        }

        let currentViewedCashbookItem = null;
        let currentViewedPetTicketId = null;

        // =============================================================
        // PHƯƠNG ÁN C: DRAWER TRƯỢT BÊN PHẢI XEM NGUỒN GỐC THU/CHI (READ ONLY)
        // =============================================================
        window.openCashbookDrawer = async function(voucherIdOrObj) {
            let c = null;
            if (typeof voucherIdOrObj === 'object' && voucherIdOrObj !== null) {
                c = voucherIdOrObj;
            } else if (Array.isArray(window.allCashbookData)) {
                c = window.allCashbookData.find(item => item.id === voucherIdOrObj || item.code === voucherIdOrObj);
            }
            if (!c) {
                if (window.showToast) window.showToast('Không tìm thấy thông tin phiếu thu chi!', 'error');
                return;
            }

            currentViewedCashbookItem = c;
            const isThu = c.type === 'in' || c.type === 'THU';

            const elCode = document.getElementById('drawer-cash-code');
            if (elCode) elCode.textContent = c.code || '-';
            const elTitle = document.getElementById('drawer-cash-title');
            if (elTitle) elTitle.textContent = isThu ? 'Nguồn Gốc Phiếu Thu' : 'Nguồn Gốc Phiếu Chi';

            const badgeType = document.getElementById('drawer-cash-badge-type');
            if (badgeType) {
                badgeType.textContent = isThu ? '🟢 Thu Tiền' : '🔴 Chi Tiền';
                badgeType.className = isThu ? 'px-2 py-0.5 rounded text-xs font-bold bg-emerald-100 text-emerald-800' : 'px-2 py-0.5 rounded text-xs font-bold bg-rose-100 text-rose-800';
            }

            // Nút sửa, xóa phiếu cho quyền admin/owner
            const btnEdit = document.getElementById('btn-drawer-edit-cashbook');
            const btnDel = document.getElementById('btn-drawer-delete-cashbook');
            const isAdmin = typeof Auth !== 'undefined' && Auth.hasRole('owner', 'admin');
            const canModify = isAdmin;
            if (canModify) {
                if (btnEdit) btnEdit.classList.remove('hidden');
                if (btnDel) btnDel.classList.remove('hidden');
            } else {
                if (btnEdit) btnEdit.classList.add('hidden');
                if (btnDel) btnDel.classList.add('hidden');
            }

            const ownerType = c.account_owner_type || c.fund_source || 'COMPANY';
            const isCty = ownerType === 'COMPANY';
            const accLabel = (c.account_name || (isCty ? 'Quỹ Cty' : 'Quỹ Cá Nhân')) + (c.account_code ? ` (${c.account_code})` : '');

            // Phát hiện chứng từ liên kết
            let linkedType = c.ref_type || '';
            let linkedTarget = c.ref_order_code || c.ref_pet_service_code || c.ref_id || '';

            if (!linkedType && c.note) {
                if (c.note.match(/HD\d+(_\d+)?/i)) {
                    linkedType = 'order';
                    linkedTarget = c.note.match(/HD\d+(_\d+)?/i)[0];
                } else if (c.note.match(/DV\d+/i)) {
                    linkedType = 'pet_service';
                    linkedTarget = c.note.match(/DV\d+/i)[0];
                }
            } else if (linkedType === 'order' && !linkedTarget && c.note) {
                const m = c.note.match(/HD\d+(_\d+)?/i);
                if (m) linkedTarget = m[0];
            } else if (linkedType === 'pet_service' && !linkedTarget && c.note) {
                const m = c.note.match(/DV\d+/i);
                if (m) linkedTarget = m[0];
            }

            const drawerBody = document.getElementById('drawer-cash-body');
            if (!drawerBody) return;

            // Render khung tóm tắt phiếu thu chi trước
            const amountHtml = `
                <div class="p-3.5 rounded-xl border text-center ${isThu ? 'bg-emerald-50/70 border-emerald-200' : 'bg-rose-50/70 border-rose-200'}">
                    <div class="text-xs font-bold uppercase tracking-wider ${isThu ? 'text-emerald-700' : 'text-rose-700'}">
                        SỐ TIỀN THỰC TẾ GHI NHẬN SỔ QUỸ
                    </div>
                    <div class="text-2xl font-bold font-mono mt-1 ${isThu ? 'text-emerald-700' : 'text-rose-700'}">
                        ${isThu ? '+' : '-'}${formatMoney(c.amount || 0)}
                    </div>
                </div>
            `;

            const infoGridHtml = `
                <div class="grid grid-cols-2 gap-2 bg-slate-50 p-3 rounded-xl border border-slate-200/80 text-xs">
                    <div>
                        <span class="text-slate-400 block text-xs uppercase font-bold">Hạng Mục:</span>
                        <span class="font-bold text-slate-800 block truncate mt-0.5">${c.category || '-'}</span>
                    </div>
                    <div>
                        <span class="text-slate-400 block text-xs uppercase font-bold">Tài Khoản / Két:</span>
                        <span class="font-semibold text-slate-800 block truncate mt-0.5">${accLabel}</span>
                    </div>
                    <div>
                        <span class="text-slate-400 block text-xs uppercase font-bold">Người Nộp / Nhận:</span>
                        <span class="font-bold text-slate-800 block truncate mt-0.5">${c.contact_name || 'Khách lẻ / Nội bộ'}</span>
                        ${c.contact_phone ? `
                            <span class="inline-flex items-center gap-1 font-mono text-xs text-sky-800 bg-sky-50 border border-sky-200 px-1.5 py-0.2 rounded font-semibold mt-1">
                                <span>📞</span><span>${c.contact_phone}</span>
                            </span>
                        ` : ''}
                    </div>
                    <div>
                        <span class="text-slate-400 block text-xs uppercase font-bold">Thời Gian Ghi Sổ:</span>
                        <span class="font-mono text-slate-600 block mt-0.5">${formatDateTime(c.created_at) || '-'}</span>
                    </div>
                </div>
            `;

            const noteHtml = `
                <div class="bg-slate-50 p-2.5 rounded-xl border border-slate-200/80 text-xs">
                    <span class="text-slate-400 block text-xs uppercase font-bold">Ghi Chú Sổ Quỹ:</span>
                    <p class="text-slate-700 mt-0.5 font-medium whitespace-pre-line">${c.note || '(Không có ghi chú)'}</p>
                </div>
            `;

            const originLoadingHtml = `
                <div id="drawer-origin-content" class="border border-sky-200 bg-sky-50/40 p-3 rounded-xl space-y-2">
                    <div class="flex items-center justify-between">
                        <span class="font-bold text-sky-900 text-xs flex items-center gap-1.5">
                            <span>🔗</span> <span>Nguồn Gốc Giao Dịch</span>
                        </span>
                        <span class="text-xs px-1.5 py-0.5 rounded font-bold bg-sky-100 text-sky-800 border border-sky-200">CHỈ ĐỌC (READ-ONLY)</span>
                    </div>
                    <div class="py-4 text-center text-slate-400 text-xs">
                        <span class="animate-spin inline-block mr-1">🔄</span> Đang đối soát chứng từ gốc...
                    </div>
                </div>
            `;

            drawerBody.innerHTML = amountHtml + infoGridHtml + originLoadingHtml + noteHtml;

            // Mở Drawer ra ngay lập tức
            const drawer = document.getElementById('drawer-cashbook-origin');
            const backdrop = document.getElementById('drawer-cashbook-backdrop');
            if (drawer) {
                drawer.classList.remove('translate-x-full');
                drawer.classList.add('translate-x-0');
            }
            if (backdrop) {
                backdrop.classList.remove('hidden');
            }

            // Bắt đầu bóc tách và nạp dữ liệu chi tiết nguồn gốc chứng từ
            const originBox = document.getElementById('drawer-origin-content');
            if (!originBox) return;

            try {
                if (linkedType === 'pet_service' && (linkedTarget || c.ref_id)) {
                    // Fetch Phiếu Spa
                    const res = await fetch(`/api/pet-services/${linkedTarget || c.ref_id}`);
                    if (!res.ok) throw new Error('Không tìm thấy phiếu Spa');
                    const ticket = await res.json();

                    let items = [];
                    try {
                        if (typeof ticket.services_json === 'string') items = JSON.parse(ticket.services_json);
                        else if (Array.isArray(ticket.services_json)) items = ticket.services_json;
                    } catch(e) { items = []; }

                    if (items.length === 0) {
                        items = [{ name: ticket.service_type || 'Gói dịch vụ Spa', quantity: 1, price: ticket.price || 0, is_retail: false }];
                    }

                    let totalProducts = 0;
                    let totalServices = 0;

                    const rowsHtml = items.map((it, idx) => {
                        const qty = it.quantity || 1;
                        const price = it.price || 0;
                        const subtotal = qty * price;
                        const isRetail = it.is_retail || it.type === 'product';
                        if (isRetail) totalProducts += subtotal;
                        else totalServices += subtotal;

                        const typeBadge = isRetail
                            ? '<span class="px-1 py-0.2 rounded text-xs font-bold bg-blue-100 text-blue-700">SP</span>'
                            : '<span class="px-1 py-0.2 rounded text-xs font-bold bg-sky-100 text-sky-700">SPA</span>';

                        return `
                            <tr class="border-b border-slate-100">
                                <td class="p-1.5 text-center text-slate-400 font-mono">${idx + 1}</td>
                                <td class="p-1.5 font-bold text-slate-800">${it.name}</td>
                                <td class="p-1.5 text-center">${typeBadge}</td>
                                <td class="p-1.5 text-right font-mono font-bold">${qty}</td>
                                <td class="p-1.5 text-right font-mono text-slate-600">${formatMoney(price)}</td>
                                <td class="p-1.5 text-right font-mono font-bold text-slate-900">${formatMoney(subtotal)}</td>
                            </tr>
                        `;
                    }).join('');

                    if (totalServices === 0 && totalProducts === 0) totalServices = Number(ticket.price || 0);

                    const phoneClean = ticket.customer_phone || '';
                    const phoneMasked = typeof formatMaskedPhone === 'function' ? formatMaskedPhone(phoneClean) : phoneClean;
                    const walletDeduct = Number(ticket.spa_wallet_deduction || 0);
                    const depositAmt = Number(ticket.deposit_amount || 0);
                    const tipAmt = Number(ticket.tip_amount || 0);
                    const finalCash = Math.max(0, (totalServices - walletDeduct) + totalProducts + tipAmt - depositAmt);

                    originBox.innerHTML = `
                        <div class="flex items-center justify-between border-b pb-2 border-sky-100">
                            <div>
                                <span class="font-bold text-sky-900 text-xs flex items-center gap-1.5">
                                    <span>🐾</span> <span>Phiếu Spa: ${ticket.code || 'DV#' + ticket.id}</span>
                                </span>
                                <div class="text-xs text-slate-500 mt-0.5">
                                    Khách: <strong>${ticket.customer_name || 'Khách lẻ'}</strong> (${phoneMasked}) | Bé: <strong>${ticket.pet_name || 'Bé cưng'}</strong> (${ticket.pet_breed || '-'})
                                </div>
                            </div>
                            <span class="text-xs px-1.5 py-0.5 rounded font-bold bg-sky-100 text-sky-800 border border-sky-200">CHỈ ĐỌC</span>
                        </div>

                        <!-- Bảng chi tiết dịch vụ & sản phẩm -->
                        <div class="bg-white rounded-lg border border-slate-200 overflow-hidden shadow-2xs">
                            <table class="w-full text-left border-collapse text-xs">
                                <thead class="bg-slate-100 border-b text-slate-600 font-bold">
                                    <tr>
                                        <th class="p-1.5 text-center w-6">#</th>
                                        <th class="p-1.5">Dịch Vụ / Sản Phẩm</th>
                                        <th class="p-1.5 text-center w-10">Loại</th>
                                        <th class="p-1.5 text-right w-7">SL</th>
                                        <th class="p-1.5 text-right w-14">Đơn Giá</th>
                                        <th class="p-1.5 text-right w-16">Thành Tiền</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    ${rowsHtml}
                                </tbody>
                            </table>
                        </div>

                        <!-- Thợ phụ trách -->
                        <div class="text-xs text-slate-600 bg-white p-2 rounded-lg border border-slate-200 flex flex-wrap gap-x-3 gap-y-1">
                            <span>✂️ Thợ cắt: <strong>${ticket.staff_cutter || '-'}</strong></span>
                            <span>🛁 Thợ tắm: <strong>${ticket.staff_worker_1 || '-'}</strong></span>
                            <span>👋 Tiếp nhận: <strong>${ticket.staff_receiver || '-'}</strong></span>
                        </div>

                        <!-- Phân bổ dòng tiền minh bạch -->
                        <div class="bg-white p-2.5 rounded-lg border border-slate-200 space-y-1 text-xs">
                            <div class="flex justify-between items-center text-slate-600">
                                <span>💆 Tiền dịch vụ Spa:</span>
                                <span class="font-mono font-bold text-slate-800">${formatMoney(totalServices)}</span>
                            </div>
                            ${totalProducts > 0 ? `
                                <div class="flex justify-between items-center text-slate-600">
                                    <span>📦 Tiền sản phẩm mua kèm:</span>
                                    <span class="font-mono font-bold text-slate-800">${formatMoney(totalProducts)}</span>
                                </div>
                            ` : ''}
                            ${walletDeduct > 0 ? `
                                <div class="flex justify-between items-center text-sky-700 bg-sky-50 px-1.5 py-0.5 rounded">
                                    <span>💳 Khấu trừ Ví Spa (dịch vụ):</span>
                                    <span class="font-mono font-bold">-${formatMoney(walletDeduct)}</span>
                                </div>
                            ` : ''}
                            ${depositAmt > 0 ? `
                                <div class="flex justify-between items-center text-amber-700 bg-amber-50 px-1.5 py-0.5 rounded">
                                    <span>💰 Đã đặt cọc trước:</span>
                                    <span class="font-mono font-bold">-${formatMoney(depositAmt)}</span>
                                </div>
                            ` : ''}
                            ${tipAmt > 0 ? `
                                <div class="flex justify-between items-center text-sky-700 bg-sky-50 px-1.5 py-0.5 rounded">
                                    <span>🎁 Tip thợ:</span>
                                    <span class="font-mono font-bold">+${formatMoney(tipAmt)}</span>
                                </div>
                            ` : ''}
                            <div class="flex justify-between items-center font-bold text-emerald-800 bg-emerald-50 px-2 py-1 rounded border border-emerald-200 mt-1">
                                <span>👉 Thực thu Tiền Mặt / CK:</span>
                                <span class="font-mono text-xs">${formatMoney(finalCash)}</span>
                            </div>
                        </div>
                    `;
                } else if (linkedType === 'order' && (linkedTarget || c.ref_id)) {
                    // Fetch Hóa đơn bán lẻ POS
                    const res = await fetch(`/api/orders/${linkedTarget || c.ref_id}`);
                    if (!res.ok) throw new Error('Không tìm thấy hóa đơn POS');
                    const ord = await res.json();

                    let items = ord.items || [];
                    const rowsHtml = items.map((it, idx) => `
                        <tr class="border-b border-slate-100">
                            <td class="p-1.5 text-center text-slate-400 font-mono">${idx + 1}</td>
                            <td class="p-1.5 font-bold text-slate-800">${it.product_name || it.name}</td>
                            <td class="p-1.5 text-right font-mono font-bold">${it.quantity}</td>
                            <td class="p-1.5 text-right font-mono text-slate-600">${formatMoney(it.price)}</td>
                            <td class="p-1.5 text-right font-mono font-bold text-slate-900">${formatMoney((it.quantity * it.price) - (it.discount || 0))}</td>
                        </tr>
                    `).join('');

                    originBox.innerHTML = `
                        <div class="flex items-center justify-between border-b pb-2 border-sky-100">
                            <div>
                                <span class="font-bold text-sky-900 text-xs flex items-center gap-1.5">
                                    <span>🧾</span> <span>Hóa Đơn Bán Lẻ: #${ord.code}</span>
                                </span>
                                <div class="text-xs text-slate-500 mt-0.5">
                                    Khách: <strong>${ord.customer_name || 'Khách lẻ'}</strong> | Thu ngân: <strong>${ord.cashier_name || 'Admin'}</strong>
                                </div>
                            </div>
                            <span class="text-xs px-1.5 py-0.5 rounded font-bold bg-sky-100 text-sky-800 border border-sky-200">CHỈ ĐỌC</span>
                        </div>

                        <!-- Bảng chi tiết sản phẩm -->
                        <div class="bg-white rounded-lg border border-slate-200 overflow-hidden shadow-2xs">
                            <table class="w-full text-left border-collapse text-xs">
                                <thead class="bg-slate-100 border-b text-slate-600 font-bold">
                                    <tr>
                                        <th class="p-1.5 text-center w-6">#</th>
                                        <th class="p-1.5">Tên Sản Phẩm</th>
                                        <th class="p-1.5 text-right w-8">SL</th>
                                        <th class="p-1.5 text-right w-16">Đơn Giá</th>
                                        <th class="p-1.5 text-right w-20">Thành Tiền</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    ${rowsHtml}
                                </tbody>
                            </table>
                        </div>

                        <!-- Dòng tiền đơn hàng -->
                        <div class="bg-white p-2.5 rounded-lg border border-slate-200 space-y-1 text-xs">
                            <div class="flex justify-between items-center text-slate-600">
                                <span>📦 Tổng tiền hàng:</span>
                                <span class="font-mono font-bold text-slate-800">${formatMoney(ord.total_amount || 0)}</span>
                            </div>
                            ${(ord.discount_amount || ord.discount || 0) > 0 ? `
                                <div class="flex justify-between items-center text-amber-700 bg-amber-50 px-1.5 py-0.5 rounded">
                                    <span>🎁 Giảm giá hóa đơn:</span>
                                    <span class="font-mono font-bold">-${formatMoney(ord.discount_amount || ord.discount)}</span>
                                </div>
                            ` : ''}
                            ${(ord.spa_wallet_deduction || 0) > 0 ? `
                                <div class="flex justify-between items-center text-sky-700 bg-sky-50 px-1.5 py-0.5 rounded">
                                    <span>💳 Trừ Ví Spa:</span>
                                    <span class="font-mono font-bold">-${formatMoney(ord.spa_wallet_deduction)}</span>
                                </div>
                            ` : ''}
                            <div class="flex justify-between items-center font-bold text-emerald-800 bg-emerald-50 px-2 py-1 rounded border border-emerald-200 mt-1">
                                <span>👉 Khách thực trả (Đã vào quỹ):</span>
                                <span class="font-mono text-xs">${formatMoney(ord.paid_amount || ord.final_amount || 0)}</span>
                            </div>
                            ${(ord.debt_amount || 0) > 0 ? `
                                <div class="flex justify-between items-center text-rose-700 bg-rose-50 px-1.5 py-0.5 rounded mt-0.5">
                                    <span>⚠️ Còn nợ lại:</span>
                                    <span class="font-mono font-bold">${formatMoney(ord.debt_amount)}</span>
                                </div>
                            ` : ''}
                        </div>
                    `;
                } else if (linkedType === 'topup') {
                    originBox.innerHTML = `
                        <div class="flex items-center justify-between border-b pb-2 border-sky-100">
                            <div>
                                <span class="font-bold text-sky-900 text-xs flex items-center gap-1.5">
                                    <span>💳</span> <span>Giao Dịch Nạp Tiền Vào Ví Spa</span>
                                </span>
                                <div class="text-xs text-slate-500 mt-0.5">
                                    Khách hàng: <strong>${c.contact_name || 'Khách tích lũy'}</strong>
                                </div>
                            </div>
                            <span class="text-xs px-1.5 py-0.5 rounded font-bold bg-amber-100 text-amber-800 border border-amber-200">VÍ TÍCH LŨY</span>
                        </div>
                        <div class="bg-white p-2.5 rounded-lg border border-slate-200 space-y-1 text-xs">
                            <div class="flex justify-between items-center text-slate-600">
                                <span>Khách nộp tiền vào quỹ:</span>
                                <span class="font-mono font-bold text-emerald-700">+${formatMoney(c.amount || 0)}</span>
                            </div>
                            <div class="text-xs text-slate-500  mt-1">
                                * Tiền nạp ví được cộng vào số dư Ví Spa của khách để khấu trừ khi dùng dịch vụ làm đẹp.
                            </div>
                        </div>
                    `;
                } else {
                    originBox.innerHTML = `
                        <div class="flex items-center justify-between border-b pb-2 border-sky-100">
                            <div>
                                <span class="font-bold text-sky-900 text-xs flex items-center gap-1.5">
                                    <span>📌</span> <span>Chứng Từ Thu Chi Nội Bộ</span>
                                </span>
                            </div>
                            <span class="text-xs px-1.5 py-0.5 rounded font-bold bg-slate-100 text-slate-700 border border-slate-200">NỘI BỘ</span>
                        </div>
                        <div class="bg-white p-2.5 rounded-lg border border-slate-200 space-y-1 text-xs">
                            <p class="text-slate-600">${c.note || 'Khoản thu chi nội bộ cửa hàng, không phát sinh từ đơn bán lẻ hay vé dịch vụ Spa.'}</p>
                        </div>
                    `;
                }
            } catch(e) {
                console.error('Lỗi khi nạp chi tiết chứng từ:', e);
                originBox.innerHTML = `
                    <div class="p-3 bg-amber-50 border border-amber-200 rounded-lg text-xs text-amber-800">
                        ⚠️ Không tìm thấy chi tiết hóa đơn/vé gốc liên kết (Mã: ${linkedTarget || c.ref_id || 'N/A'}).
                    </div>
                `;
            }
        };

        window.closeCashbookDrawer = function() {
            const drawer = document.getElementById('drawer-cashbook-origin');
            const backdrop = document.getElementById('drawer-cashbook-backdrop');
            if (drawer) {
                drawer.classList.add('translate-x-full');
                drawer.classList.remove('translate-x-0');
            }
            if (backdrop) {
                backdrop.classList.add('hidden');
            }
        };

        window.addEventListener('keydown', function(e) {
            if (e.key === 'Escape') {
                window.closeCashbookDrawer?.();
            }
        });

        window.openCashbookVoucherDetail = function(voucherIdOrObj) {
            // Chuyển hướng sang mở Drawer phương án C
            window.openCashbookDrawer(voucherIdOrObj);
        };

        window.closeCashbookViewModal = function() {
            document.getElementById('modal-cashbook-view')?.classList.add('hidden');
            currentViewedCashbookItem = null;
        };

        window.handleEditCashAmountInput = function(el) {
            if (!el) return;
            const cleanDigits = (el.value || '').replace(/\D/g, '');
            const num = parseFloat(cleanDigits) || 0;
            if (cleanDigits === '') {
                el.value = '';
            } else {
                el.value = new Intl.NumberFormat('vi-VN').format(num) + ' đ';
            }
            const wordsEl = document.getElementById('edit-cash-amount-words');
            if (wordsEl) {
                wordsEl.innerText = num > 0 ? numberToVietnameseWords(num) : 'Không đồng';
            }
        };

        window.openEditCashbookModal = async function() {
            if (!currentViewedCashbookItem) return;
            const c = currentViewedCashbookItem;
            const modal = document.getElementById('modal-edit-cashbook');
            if (!modal) return;

            const isThu = c.type === 'in' || c.type === 'THU';
            const titleEl = modal.querySelector('h3');
            if (titleEl) titleEl.innerText = isThu ? 'Chỉnh Sửa Phiếu Thu' : 'Chỉnh Sửa Phiếu Chi';

            const amtLabel = document.getElementById('edit-cash-amount-label');
            if (amtLabel) amtLabel.innerText = isThu ? 'Số tiền thu (VNĐ) *' : 'Số tiền chi (VNĐ) *';

            const editAmtEl = document.getElementById('edit-cash-amount');
            if (editAmtEl) {
                editAmtEl.className = `w-full bg-white border border-slate-300 rounded-lg p-2 text-xs font-bold font-mono text-right ${isThu ? 'text-emerald-600' : 'text-rose-600'} focus:outline-none focus:ring-2 focus:ring-amber-400`;
                const val = c.amount || 0;
                editAmtEl.value = val > 0 ? (new Intl.NumberFormat('vi-VN').format(val) + ' đ') : '';
                handleEditCashAmountInput(editAmtEl);
            }

            document.getElementById('edit-cash-code').innerText = c.code || '-';
            document.getElementById('edit-cash-category').value = c.category || '';
            document.getElementById('edit-cash-note').value = c.note || '';

            const dateEl = document.getElementById('edit-cash-created-at');
            if (dateEl) dateEl.value = c.created_at || '';

            const accSelect = document.getElementById('edit-cash-account-select');
            if (accSelect) {
                accSelect.innerHTML = `<option value="">Đang tải...</option>`;
                try {
                    const res = await fetch('/api/payment-accounts');
                    if (res.ok) {
                        const accounts = await res.json();
                        accSelect.innerHTML = accounts.map(a => {
                            return `<option value="${a.id}" ${a.id === c.account_id ? 'selected' : ''}>${a.name} (${new Intl.NumberFormat('vi-VN').format(Math.round(a.current_balance || 0))} đ)</option>`;
                        }).join('');
                    }
                } catch(e) {}
            }

            modal.classList.remove('hidden');
        };

        window.closeEditCashbookModal = function() {
            const modal = document.getElementById('modal-edit-cashbook');
            if (modal) modal.classList.add('hidden');
        };

        window.submitEditCashbook = async function(e) {
            if (e) e.preventDefault();
            if (!currentViewedCashbookItem) return;
            const c = currentViewedCashbookItem;
            const id = c.id;
            const isThu = c.type === 'in' || c.type === 'THU';
            const vLabel = isThu ? 'phiếu thu' : 'phiếu chi';

            const cleanDigits = (document.getElementById('edit-cash-amount').value || '').replace(/\D/g, '');
            const amount = parseFloat(cleanDigits || 0);
            const category = document.getElementById('edit-cash-category').value.trim();
            const account_id = parseInt(document.getElementById('edit-cash-account-select').value || 0);
            const note = document.getElementById('edit-cash-note').value.trim();
            const createdAtVal = document.getElementById('edit-cash-created-at')?.value?.trim() || null;

            if (!amount || amount <= 0) {
                if (window.showToast) window.showToast('Số tiền phải lớn hơn 0', 'warning');
                return;
            }
            if (!account_id) {
                if (window.showToast) window.showToast('Vui lòng chọn tài khoản thanh toán', 'warning');
                return;
            }

            try {
                const res = await fetch(`/api/cashbook/${id}`, {
                    method: 'PUT',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        amount: amount,
                        category: category,
                        account_id: account_id,
                        note: note,
                        created_at: createdAtVal
                    })
                });
                const data = await res.json();
                if (!res.ok) throw new Error(data.detail || `Không thể cập nhật ${vLabel}`);

                if (window.showToast) window.showToast(`Đã cập nhật ${vLabel} thành công!`, 'success');
                window.closeEditCashbookModal();
                window.closeCashbookDrawer?.();
                if (typeof loadCashbook === 'function') loadCashbook();
            } catch(err) {
                if (window.showToast) window.showToast('Lỗi: ' + err.message, 'error');
            }
        };

        window.confirmDeleteCashbookVoucher = async function() {
            if (!currentViewedCashbookItem) return;
            const c = currentViewedCashbookItem;
            const isThu = c.type === 'in' || c.type === 'THU';
            const vLabel = isThu ? 'phiếu thu' : 'phiếu chi';
            const code = c.code || vLabel;

            let subMsg = 'Hành động này sẽ xóa dòng ghi nhận và cập nhật lại số dư tài khoản. Không thể hoàn tác.';
            if (isThu && c.ref_type === 'topup') {
                subMsg = 'Xóa phiếu thu nạp ví sẽ tự động khấu trừ lại số dư ví Spa và điểm tích lũy của khách hàng tương ứng. Không thể hoàn tác.';
            }

            let confirmed = false;
            if (typeof window.showConfirmModal === 'function') {
                confirmed = await window.showConfirmModal({
                    title: `Xóa ${isThu ? 'Phiếu Thu' : 'Phiếu Chi'} ${code}`,
                    message: `Bạn có chắc chắn muốn xóa vĩnh viễn ${vLabel} <strong>${code}</strong> với số tiền <span class="${isThu ? 'text-emerald-600' : 'text-rose-600'} font-bold">${new Intl.NumberFormat('vi-VN').format(Math.round(c.amount || 0))} đ</span>?`,
                    subMessage: subMsg,
                    confirmText: 'Xác Nhận Xóa',
                    cancelText: 'Hủy Bỏ',
                    type: 'danger'
                });
            } else {
                confirmed = confirm(`Bạn có chắc chắn muốn xóa ${vLabel} ${code}?\n${subMsg}`);
            }

            if (!confirmed) return;

            try {
                const res = await fetch(`/api/cashbook/${c.id}`, {
                    method: 'DELETE'
                });
                const data = await res.json();
                if (!res.ok) throw new Error(data.detail || `Không thể xóa ${vLabel}`);

                if (window.showToast) window.showToast(data.message || `Đã xóa ${vLabel} ${code}`, 'success');
                window.closeCashbookDrawer?.();
                if (typeof loadCashbook === 'function') loadCashbook();
            } catch(err) {
                if (window.showToast) window.showToast('Lỗi: ' + err.message, 'error');
            }
        };

        window.viewPetServiceDetailModal = async function(ticketIdOrCode) {
            try {
                const res = await fetch(`/api/pet-services/${ticketIdOrCode}`);
                if (!res.ok) return alert(`Không tìm thấy phiếu dịch vụ Spa [${ticketIdOrCode}]!`);
                const ticket = await res.json();
                currentViewedPetTicketId = ticket.id;

                const elCode = document.getElementById('svcview-code');
                if (elCode) elCode.textContent = ticket.code || `DV#${ticket.id}`;
                
                const elDate = document.getElementById('svcview-date');
                if (elDate) elDate.textContent = ticket.created_at || ticket.ticket_date || '';
                
                const statusMap = {
                    'waiting': '⏳ Chờ làm',
                    'in_progress': '🔄 Đang làm',
                    'completed': '✅ Đã xong',
                    'checked_out': '🏠 Đã về'
                };
                const stBadge = document.getElementById('svcview-status-badge');
                if (stBadge) {
                    stBadge.textContent = statusMap[ticket.status] || ticket.status || 'Đã xong';
                }

                const phoneClean = ticket.customer_phone || '';
                const phoneMasked = typeof formatMaskedPhone === 'function' ? formatMaskedPhone(phoneClean) : phoneClean;
                const elCust = document.getElementById('svcview-customer');
                if (elCust) elCust.textContent = ticket.customer_name || 'Khách lẻ';
                const elPhone = document.getElementById('svcview-phone');
                if (elPhone) elPhone.textContent = phoneMasked;
                const elPet = document.getElementById('svcview-pet');
                if (elPet) elPet.textContent = '🐕 ' + (ticket.pet_name || 'Bé cưng');
                
                const petSpecies = ticket.pet_species || 'Chó cảnh';
                const petBreed = ticket.pet_breed || '-';
                const petWeight = ticket.weight_at_service || ticket.pet_weight ? (ticket.weight_at_service || ticket.pet_weight) + ' kg' : '-';
                const elPetInfo = document.getElementById('svcview-pet-info');
                if (elPetInfo) elPetInfo.textContent = `${petSpecies} | ${petBreed} | ${petWeight}`;

                // Bóc tách items
                let items = [];
                try {
                    if (typeof ticket.services_json === 'string') {
                        items = JSON.parse(ticket.services_json);
                    } else if (Array.isArray(ticket.services_json)) {
                        items = ticket.services_json;
                    }
                } catch(e) { items = []; }

                if (items.length === 0) {
                    items = [{
                        name: ticket.service_type || 'Gói dịch vụ Spa',
                        quantity: 1,
                        price: ticket.price || 0,
                        is_retail: false
                    }];
                }

                let totalProducts = 0;
                let totalServices = 0;

                const tbody = document.getElementById('svcview-items-body');
                if (tbody) {
                    tbody.innerHTML = items.map((it, idx) => {
                        const qty = it.quantity || 1;
                        const price = it.price || 0;
                        const subtotal = qty * price;
                        const isRetail = it.is_retail || it.type === 'product';

                        if (isRetail) {
                            totalProducts += subtotal;
                        } else {
                            totalServices += subtotal;
                        }

                        const typeBadge = isRetail
                            ? '<span class="px-1.5 py-0.5 rounded text-xs font-bold bg-blue-100 text-blue-700">📦 SP</span>'
                            : '<span class="px-1.5 py-0.5 rounded text-xs font-bold bg-sky-100 text-sky-700">💆 SPA</span>';

                        return `
                            <tr class="border-b border-slate-100 hover:bg-slate-50/80">
                                <td class="p-2 text-center text-slate-400 font-mono">${idx + 1}</td>
                                <td class="p-2 font-bold text-slate-800">${it.name}</td>
                                <td class="p-2 text-center">${typeBadge}</td>
                                <td class="p-2 text-right font-mono font-bold">${qty}</td>
                                <td class="p-2 text-right font-mono text-slate-600">${formatMoney(price)}</td>
                                <td class="p-2 text-right font-mono font-bold text-slate-900">${formatMoney(subtotal)}</td>
                            </tr>
                        `;
                    }).join('');
                }

                if (totalServices === 0 && totalProducts === 0) {
                    totalServices = Number(ticket.price || 0);
                }

                const elCutter = document.getElementById('svcview-staff-cutter');
                if (elCutter) elCutter.textContent = ticket.staff_cutter || '-';
                const elWorker = document.getElementById('svcview-staff-worker');
                if (elWorker) elWorker.textContent = ticket.staff_worker_1 || '-';
                const elRec = document.getElementById('svcview-staff-receiver');
                if (elRec) elRec.textContent = ticket.staff_receiver || '-';

                const elProdT = document.getElementById('svcview-prod-total');
                if (elProdT) elProdT.textContent = formatMoney(totalProducts);
                const elSvcT = document.getElementById('svcview-svc-total');
                if (elSvcT) elSvcT.textContent = formatMoney(totalServices);

                const walletDeduct = Number(ticket.spa_wallet_deduction || 0);
                const elWalletRow = document.getElementById('svcview-wallet-row');
                if (elWalletRow) {
                    if (walletDeduct > 0) {
                        elWalletRow.classList.remove('hidden');
                        const elW = document.getElementById('svcview-wallet-deduct');
                        if (elW) elW.textContent = `-${formatMoney(walletDeduct)}`;
                    } else {
                        elWalletRow.classList.add('hidden');
                    }
                }

                const depositAmt = Number(ticket.deposit_amount || 0);
                const elDepositRow = document.getElementById('svcview-deposit-row');
                if (elDepositRow) {
                    if (depositAmt > 0) {
                        elDepositRow.classList.remove('hidden');
                        const elD = document.getElementById('svcview-deposit');
                        if (elD) elD.textContent = `-${formatMoney(depositAmt)}`;
                    } else {
                        elDepositRow.classList.add('hidden');
                    }
                }

                const tipAmt = Number(ticket.tip_amount || 0);
                const elTipRow = document.getElementById('svcview-tip-row');
                if (elTipRow) {
                    if (tipAmt > 0) {
                        elTipRow.classList.remove('hidden');
                        const elT = document.getElementById('svcview-tip');
                        if (elT) elT.textContent = `+${formatMoney(tipAmt)}`;
                    } else {
                        elTipRow.classList.add('hidden');
                    }
                }

                const finalCash = Math.max(0, (totalServices - walletDeduct) + totalProducts + tipAmt - depositAmt);
                const elCash = document.getElementById('svcview-final-cash');
                if (elCash) elCash.textContent = formatMoney(finalCash);

                const elPayStatus = document.getElementById('svcview-pay-status');
                if (elPayStatus) {
                    if (ticket.payment_status === 'paid') {
                        elPayStatus.textContent = walletDeduct > 0 
                            ? (totalProducts > 0 
                                ? `ĐÃ TRỪ VÍ (${formatMoney(walletDeduct)}) + THU TM/CK (${formatMoney(finalCash)})` 
                                : `ĐÃ TRỪ VÍ SPA (${formatMoney(walletDeduct)})`)
                            : 'ĐÃ THANH TOÁN';
                        elPayStatus.className = 'font-bold text-emerald-700';
                    } else {
                        elPayStatus.textContent = 'CHƯA THANH TOÁN';
                        elPayStatus.className = 'font-bold text-rose-600';
                    }
                }

                document.getElementById('modal-pet-service-view')?.classList.remove('hidden');
            } catch(err) {
                console.error('Lỗi khi mở chi tiết phiếu Spa:', err);
                alert('Lỗi tải thông tin phiếu dịch vụ Spa!');
            }
        };

        window.closeModalPetServiceView = function() {
            document.getElementById('modal-pet-service-view')?.classList.add('hidden');
            currentViewedPetTicketId = null;
        };

        window.printCurrentViewedPetTicket = function() {
            if (currentViewedPetTicketId && typeof window.printPetServiceTicketDirectly === 'function') {
                window.printPetServiceTicketDirectly(currentViewedPetTicketId, 'invoice');
            }
        };

        window.numberToVietnameseWords = function(amount) {
            if (!amount || isNaN(amount)) return 'Không đồng';
            amount = Math.round(Math.abs(amount));
            if (amount === 0) return 'Không đồng';

            const dv = ['', 'nghìn', 'triệu', 'tỷ', 'nghìn tỷ', 'triệu tỷ'];
            const cs = ['không', 'một', 'hai', 'ba', 'bốn', 'năm', 'sáu', 'bảy', 'tám', 'chín'];

            function readTriple(num, full) {
                let a = Math.floor(num / 100);
                let b = Math.floor((num % 100) / 10);
                let c = num % 10;
                let res = '';
                if (a > 0 || full) {
                    res += ' ' + cs[a] + ' trăm';
                }
                if (b > 1) {
                    res += ' ' + cs[b] + ' mươi';
                    if (c === 1) res += ' mốt';
                    else if (c === 5) res += ' lăm';
                    else if (c > 0) res += ' ' + cs[c];
                } else if (b === 1) {
                    res += ' mười';
                    if (c === 1) res += ' một';
                    else if (c === 5) res += ' lăm';
                    else if (c > 0) res += ' ' + cs[c];
                } else if (c > 0) {
                    if (a > 0 || full) res += ' lẻ';
                    res += ' ' + cs[c];
                }
                return res;
            }

            let str = '';
            let i = 0;
            let temp = amount;
            while (temp > 0) {
                let triple = temp % 1000;
                temp = Math.floor(temp / 1000);
                if (triple > 0) {
                    let s = readTriple(triple, temp > 0);
                    str = s + ' ' + dv[i] + str;
                }
                i++;
            }
            str = str.trim();
            if (!str) return 'Không đồng';
            return (str.charAt(0).toUpperCase() + str.slice(1) + ' đồng chẵn.').replace(/\s+/g, ' ');
        };

        window.printCurrentCashbookVoucher = function(voucherIdOrObj) {
            let c = null;
            if (typeof voucherIdOrObj === 'object' && voucherIdOrObj !== null) {
                c = voucherIdOrObj;
            } else if (voucherIdOrObj && Array.isArray(window.allCashbookData)) {
                c = window.allCashbookData.find(item => item.id === voucherIdOrObj || item.code === voucherIdOrObj);
            } else {
                c = currentViewedCashbookItem;
            }
            if (!c) {
                if (window.showToast) window.showToast('Không tìm thấy thông tin phiếu thu chi!', 'error');
                return;
            }
            const isThu = c.type === 'in' || c.type === 'THU';
            const title = isThu ? 'PHIẾU THU TIỀN' : 'PHIẾU CHI TIỀN';
            const dateStr = c.created_at || new Date().toLocaleString('vi-VN');

            const printHtml = `
                <div style="width: 72mm; max-width: 72mm; margin: 0 auto; font-family: 'Segoe UI', Arial, sans-serif; font-size: 12px; line-height: 1.35; color: #000; padding: 2mm 1mm;">
                    <div style="text-align: center; border-bottom: 2px dashed #000; padding-bottom: 8px; margin-bottom: 8px;">
                        <h2 style="margin: 0; font-size: 15px; font-weight: 900; text-transform: uppercase;">🐾 PET CARE & SPA</h2>
                        <div style="font-size: 14px; font-weight: 900; margin-top: 4px;">${title}</div>
                        <div style="display: inline-block; border: 1.5px solid #000; font-size: 13px; font-weight: 900; padding: 2px 8px; border-radius: 4px; margin-top: 4px;">
                            MÃ: ${c.code || '-'}
                        </div>
                        <div style="font-size: 10px; font-weight: 700; margin-top: 3px;">Ngày ghi sổ: ${dateStr}</div>
                    </div>

                    <div style="border-bottom: 1px dashed #000; padding-bottom: 6px; margin-bottom: 6px; font-size: 11.5px;">
                        <div><strong>Người nộp/nhận:</strong> <span style="font-weight: 800;">${c.contact_name || 'Khách lẻ / Nội bộ'}</span></div>
                        <div><strong>Hạng mục:</strong> <span style="font-weight: 800;">${c.category || '-'}</span></div>
                        <div><strong>Tài khoản quỹ:</strong> <span style="font-weight: 800;">${c.account_name || 'Két tiền'}</span></div>
                    </div>

                    <div style="border: 2px solid #000; border-radius: 4px; padding: 8px; text-align: center; margin-bottom: 8px;">
                        <div style="font-size: 11px; font-weight: 700;">SỐ TIỀN THỰC ${isThu ? 'THU' : 'CHI'}:</div>
                        <div style="font-size: 20px; font-weight: 900; font-family: monospace; margin: 4px 0;">${formatMoney(c.amount || 0)}</div>
                    </div>

                    <div style="font-size: 11px; margin-bottom: 8px; border-bottom: 1px dashed #000; padding-bottom: 6px;">
                        <strong>Diễn giải:</strong> ${c.note || '-'}
                    </div>

                    <div style="display: flex; justify-content: space-between; text-align: center; font-size: 10px; margin-top: 10px; margin-bottom: 15px;">
                        <div style="width: 48%;">
                            <div style="font-weight: 800;">Người Nộp / Nhận</div>
                            <div style="height: 35px;"></div>
                            <div>(Ký & họ tên)</div>
                        </div>
                        <div style="width: 48%;">
                            <div style="font-weight: 800;">Người Lập Phiếu</div>
                            <div style="height: 35px;"></div>
                            <div>(Ký & họ tên)</div>
                        </div>
                    </div>
                    <div style="height: 18mm; width: 100%;"></div>
                </div>
            `;

            let iframe = document.getElementById('iframe-cashbook-print');
            if (!iframe) {
                iframe = document.createElement('iframe');
                iframe.id = 'iframe-cashbook-print';
                iframe.style.position = 'fixed';
                iframe.style.left = '-9999px';
                iframe.style.top = '-9999px';
                iframe.style.width = '0';
                iframe.style.height = '0';
                document.body.appendChild(iframe);
            }

            let isBoldCashbook = true;
            try {
                const boldCfg = window.printBoldConfigs || (window.companySettings && window.companySettings.print_bold_configs ? (typeof window.companySettings.print_bold_configs === 'string' ? JSON.parse(window.companySettings.print_bold_configs) : window.companySettings.print_bold_configs) : null);
                if (boldCfg) {
                    const cfgKey = isThu ? 'cashbook_thu' : 'cashbook_chi';
                    if (boldCfg[cfgKey] !== undefined) {
                        isBoldCashbook = !!boldCfg[cfgKey];
                    }
                } else {
                    const settings = window.companySettings || window.posSettings || {};
                    const parsed = settings.print_blocks_config ? JSON.parse(settings.print_blocks_config) : null;
                    const presetKey = isThu ? 'cashbook_thu_k80' : 'cashbook_chi_k80';
                    if (parsed && parsed.presets && parsed.presets[presetKey]) {
                        isBoldCashbook = !!parsed.presets[presetKey].is_bold_all;
                    }
                }
            } catch(e) {}

            const boldStyles = isBoldCashbook ? `
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
                    <title>${title} - ${c.code}</title>
                    <style>
                        @page { size: auto; margin: 0mm; }
                        ${boldStyles}
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
                    console.error('Lỗi in phiếu thu chi:', e);
                }
            }, 300);
        };

        window.printCashbookVoucherA4 = function(voucherIdOrObj) {
            let c = null;
            if (typeof voucherIdOrObj === 'object' && voucherIdOrObj !== null) {
                c = voucherIdOrObj;
            } else if (voucherIdOrObj && Array.isArray(window.allCashbookData)) {
                c = window.allCashbookData.find(item => item.id === voucherIdOrObj || item.code === voucherIdOrObj);
            } else {
                c = currentViewedCashbookItem;
            }
            if (!c) {
                if (window.showToast) window.showToast('Không tìm thấy thông tin phiếu thu chi!', 'error');
                return;
            }

            const isThu = c.type === 'in' || c.type === 'THU';
            const title = isThu ? 'PHIẾU THU' : 'PHIẾU CHI';
            const formCode = isThu ? 'Mẫu số 01 - TT' : 'Mẫu số 02 - TT';
            const dateObj = c.created_at ? new Date(c.created_at.replace(' ', 'T')) : new Date();
            const day = isNaN(dateObj.getDate()) ? new Date().getDate() : dateObj.getDate();
            const month = isNaN(dateObj.getMonth()) ? new Date().getMonth() + 1 : dateObj.getMonth() + 1;
            const year = isNaN(dateObj.getFullYear()) ? new Date().getFullYear() : dateObj.getFullYear();

            const company = window.companySettings || {};
            const storeName = company.shop_name || company.app_name || 'PET CARE SYSTEM';
            const storeAddr = company.shop_address || 'Nha Trang, Khánh Hòa';
            const storePhone = company.shop_phone || '';

            const words = window.numberToVietnameseWords(c.amount || 0);

            const printHtml = `
                <div style="width: 195mm; max-width: 195mm; margin: 0 auto; font-family: 'Times New Roman', Times, serif; font-size: 13px; line-height: 1.45; color: #000; padding: 4mm;">
                    <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 12px;">
                        <div style="max-width: 60%;">
                            <div style="font-weight: bold; text-transform: uppercase; font-size: 13px;">${storeName}</div>
                            <div style="font-size: 11px;">Địa chỉ: ${storeAddr}</div>
                            ${storePhone ? `<div style="font-size: 11px;">Điện thoại: ${storePhone}</div>` : ''}
                        </div>
                        <div style="text-align: right; font-size: 11px;">
                            <div style="font-weight: bold;">${formCode}</div>
                            <div style="font-style: italic; font-size: 10px;">(Ban hành theo TT số 133/2016/TT-BTC)</div>
                            <div style="margin-top: 3px;">Quyển số: .....................</div>
                            <div>Số: <strong style="font-family: monospace; font-size: 12px;">${c.code || '-'}</strong></div>
                            <div>Nợ: ................. Có: .................</div>
                        </div>
                    </div>

                    <div style="text-align: center; margin-bottom: 16px;">
                        <h1 style="margin: 0; font-size: 21px; font-weight: bold; text-transform: uppercase; letter-spacing: 1px;">${title}</h1>
                        <div style="font-style: italic; font-size: 12px; margin-top: 4px;">Ngày ${day} tháng ${month} năm ${year}</div>
                    </div>

                    <div style="margin-bottom: 15px; font-size: 13px; line-height: 1.85;">
                        <div>- Họ và tên người ${isThu ? 'nộp tiền' : 'nhận tiền'}: <strong style="font-size: 13.5px;">${c.contact_name || 'Khách lẻ / Nội bộ'}</strong>${c.contact_phone ? ` (SĐT: ${c.contact_phone})` : ''}</div>
                        <div>- Địa chỉ / Bộ phận: ................................................................................................................................................</div>
                        <div>- Lý do ${isThu ? 'nộp' : 'chi'}: <strong>${c.category || ''}</strong> - ${c.note || '(Không có ghi chú)'}</div>
                        <div>- Số tiền: <strong style="font-size: 15px; font-family: monospace;">${formatMoney(c.amount || 0)}</strong> (Viết bằng chữ): <strong style="font-style: italic;">${words}</strong></div>
                        <div>- Kèm theo: Chứng từ gốc số ......................................................................................................................................</div>
                        <div>- Tài khoản / Két: <strong>${c.account_name || 'Két tiền mặt'}</strong></div>
                    </div>

                    <div style="display: flex; justify-content: space-between; text-align: center; font-size: 12px; margin-top: 15px; page-break-inside: avoid;">
                        <div style="width: 24%;">
                            <div style="font-weight: bold;">Giám đốc</div>
                            <div style="font-style: italic; font-size: 10px;">(Ký, họ tên, đóng dấu)</div>
                            <div style="height: 55px;"></div>
                        </div>
                        <div style="width: 24%;">
                            <div style="font-weight: bold;">Kế toán trưởng</div>
                            <div style="font-style: italic; font-size: 10px;">(Ký, họ tên)</div>
                            <div style="height: 55px;"></div>
                        </div>
                        <div style="width: 24%;">
                            <div style="font-weight: bold;">Người ${isThu ? 'nộp tiền' : 'nhận tiền'}</div>
                            <div style="font-style: italic; font-size: 10px;">(Ký, họ tên)</div>
                            <div style="height: 55px;"></div>
                        </div>
                        <div style="width: 24%;">
                            <div style="font-weight: bold;">Thủ quỹ</div>
                            <div style="font-style: italic; font-size: 10px;">(Ký, họ tên)</div>
                            <div style="height: 55px;"></div>
                        </div>
                    </div>

                    <div style="font-style: italic; font-size: 11px; margin-top: 10px; border-top: 1px dotted #ccc; padding-top: 5px;">
                        * Đã nhận đủ số tiền (viết bằng chữ): ${words}
                    </div>
                </div>
            `;

            let iframe = document.getElementById('iframe-cashbook-print-a4');
            if (!iframe) {
                iframe = document.createElement('iframe');
                iframe.id = 'iframe-cashbook-print-a4';
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
                    <title>${title} - ${c.code}</title>
                    <style>
                        @page { size: A5 landscape; margin: 6mm 8mm; }
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
                    console.error('Lỗi in phiếu thu chi A4:', e);
                }
            }, 300);
        };

        window.openCashbookLinkedDoc = async function(refType, refTarget, note = '') {
            try {
                let orderCode = null;
                let petServiceTarget = null;

                if (refType === 'order') {
                    orderCode = refTarget;
                } else if (refType === 'pet_service') {
                    petServiceTarget = refTarget;
                }

                // Quét mã HĐ hoặc DV từ ghi chú nếu có
                const hdMatch = note ? note.match(/HD\d+(_\d+)?/i) : null;
                const dvMatch = note ? note.match(/DV\d+/i) : null;

                if (!orderCode && hdMatch) orderCode = hdMatch[0];
                if (!petServiceTarget && dvMatch) petServiceTarget = dvMatch[0];

                // 1. Mở Hóa Đơn Bán Lẻ POS (CHẾ ĐỘ CHỈ ĐỌC - READ ONLY)
                if (orderCode || hdMatch) {
                    const targetCode = orderCode || (hdMatch ? hdMatch[0] : null);
                    if (typeof viewOrderDetailModal === 'function') {
                        await viewOrderDetailModal(targetCode, true);
                        return;
                    } else if (typeof window.viewOrderDetailModal === 'function') {
                        await window.viewOrderDetailModal(targetCode, true);
                        return;
                    }
                }

                // 2. Mở Phiếu Dịch Vụ Spa (CHẾ ĐỘ CHỈ ĐỌC - READ ONLY)
                if (petServiceTarget || dvMatch) {
                    const targetTicket = petServiceTarget || (dvMatch ? dvMatch[0] : null);
                    await window.viewPetServiceDetailModal(targetTicket);
                    return;
                }

                // 3. Nếu là nạp ví Spa
                if (refType === 'topup') {
                    if (window.showToast) window.showToast('Giao dịch nạp ví Spa tích lũy khách hàng.', 'info');
                    return;
                }

                alert('Phiếu thu chi nội bộ hoặc không có hóa đơn/phiếu Spa liên kết trực tiếp.', 'Chứng Từ Nội Bộ');
            } catch (err) {
                console.error('Lỗi khi mở chứng từ liên kết:', err);
                alert('Không thể mở chứng từ liên kết: ' + (err.message || 'Lỗi không xác định'), 'Lỗi Mở Chứng Từ');
            }
        };

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
                const accCode = c.account_code ? `<span class="font-mono text-xs text-gray-400 block">${c.account_code}</span>` : '';

                // Phát hiện chứng từ liên kết
                let linkedType = c.ref_type || '';
                let linkedTarget = c.ref_order_code || c.ref_pet_service_code || c.ref_id || '';

                if (!linkedType && c.note) {
                    if (c.note.match(/HD\d+(_\d+)?/i)) {
                        linkedType = 'order';
                        linkedTarget = c.note.match(/HD\d+(_\d+)?/i)[0];
                    } else if (c.note.match(/DV\d+/i)) {
                        linkedType = 'pet_service';
                        linkedTarget = c.note.match(/DV\d+/i)[0];
                    }
                } else if (linkedType === 'order' && !linkedTarget && c.note) {
                    const m = c.note.match(/HD\d+(_\d+)?/i);
                    if (m) linkedTarget = m[0];
                } else if (linkedType === 'pet_service' && !linkedTarget && c.note) {
                    const m = c.note.match(/DV\d+/i);
                    if (m) linkedTarget = m[0];
                }

                let linkedBadge = '';
                if (linkedType === 'order') {
                    const dispCode = c.ref_order_code || (typeof linkedTarget === 'string' && linkedTarget.startsWith('HD') ? linkedTarget : `Đơn #${c.ref_id}`);
                    linkedBadge = `
                        <button type="button" onclick="event.stopPropagation(); openCashbookDrawer(${c.id})" 
                                class="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-xs font-bold font-mono bg-blue-50 hover:bg-blue-100 text-blue-700 border border-blue-200 shadow-2xs transition" 
                                title="Bấm xem nguồn gốc hóa đơn ${dispCode}">
                            <span>🧾</span> <span>${dispCode}</span> <span class="text-xs">↗</span>
                        </button>
                    `;
                } else if (linkedType === 'pet_service') {
                    const dispCode = c.ref_pet_service_code || (typeof linkedTarget === 'string' && linkedTarget.startsWith('DV') ? linkedTarget : `Phiếu #${c.ref_id}`);
                    linkedBadge = `
                        <button type="button" onclick="event.stopPropagation(); openCashbookDrawer(${c.id})" 
                                class="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-xs font-bold font-mono bg-sky-50 hover:bg-sky-100 text-sky-700 border border-sky-200 shadow-2xs transition" 
                                title="Bấm xem nguồn gốc phiếu dịch vụ Spa ${dispCode}">
                            <span>🐾</span> <span>${dispCode}</span> <span class="text-xs">↗</span>
                        </button>
                    `;
                } else if (linkedType === 'topup') {
                    linkedBadge = `
                        <button type="button" onclick="event.stopPropagation(); openCashbookDrawer(${c.id})"
                                class="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-xs font-bold font-mono bg-amber-50 hover:bg-amber-100 text-amber-700 border border-amber-200" title="Bấm xem chi tiết phiếu thu nạp ví">
                            <span>💳 Nạp ví</span>
                        </button>
                    `;
                }

                return `
                    <tr onclick="openCashbookDrawer(${c.id})" class="border-b hover:bg-sky-50/60 cursor-pointer transition">
                        <td class="p-2.5">
                            <div class="font-mono text-xs font-bold text-slate-800 flex items-center gap-1.5">
                                <span>${c.code || '-'}</span>
                                <span class="text-xs text-sky-500 font-normal" title="Bấm dòng để xem nguồn gốc chứng từ (Drawer)">📑</span>
                            </div>
                            ${linkedBadge ? `<div class="mt-1">${linkedBadge}</div>` : ''}
                        </td>
                        <td class="p-2.5">
                            <div class="flex items-center gap-1.5">
                                <span class="px-1.5 py-0.5 rounded text-xs font-bold ${isCty ? 'bg-blue-50 text-blue-700 border border-blue-200' : 'bg-sky-50 text-sky-700 border border-sky-200'}">
                                    ${isCty ? 'Cty' : 'Cá nhân'}
                                </span>
                                <span class="font-semibold text-slate-700 text-xs">${accLabel}</span>
                            </div>
                            ${accCode}
                        </td>
                        <td class="p-2.5 text-center">
                            <span class="px-2 py-0.5 rounded text-xs font-bold ${isThu ? 'bg-emerald-100 text-emerald-800' : 'bg-rose-100 text-rose-800'}">
                                ${isThu ? '🟢 Thu' : '🔴 Chi'}
                            </span>
                        </td>
                        <td class="p-2.5 font-semibold text-slate-700">${c.category || '-'}</td>
                        <td class="p-2.5 text-slate-700">
                            <div class="font-bold text-xs text-slate-800">${c.contact_name || '-'}</div>
                            ${c.contact_phone ? `
                                <div class="mt-0.5 inline-flex items-center gap-1 font-mono text-xs text-sky-800 bg-sky-50 border border-sky-200 px-1.5 py-0.2 rounded font-semibold" title="SĐT khách hàng">
                                    <span>📞</span><span>${c.contact_phone}</span>
                                </div>
                            ` : ''}
                        </td>
                        <td class="p-2.5 text-right font-mono font-bold text-xs ${isThu ? 'text-emerald-600' : 'text-rose-600'}">
                            ${isThu ? '+' : '-'}${formatMoney(c.amount || 0)}
                        </td>
                        <td class="p-2.5 text-slate-500 text-xs max-w-[200px] truncate" title="${c.note || ''}">${c.note || '-'}</td>
                        <td class="p-2.5 text-xs text-gray-500 font-mono whitespace-nowrap">${formatDateTime(c.created_at) || '-'}</td>
                        <td class="p-2.5 text-slate-700 text-xs font-medium whitespace-nowrap">${c.created_by || 'Hệ thống'}</td>
                        <td class="p-2.5 text-slate-500 text-xs whitespace-nowrap">${c.updated_by ? `${c.updated_by} <span class="text-xs text-gray-400 block">${formatDateTime(c.updated_at)}</span>` : '<span class="text-gray-300">---</span>'}</td>
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
                const phone = (c.contact_phone || '').toLowerCase();
                const acc = (c.account_name || '').toLowerCase();
                return code.includes(query) || cat.includes(query) || note.includes(query) || contact.includes(query) || phone.includes(query) || acc.includes(query);
            });
            renderCashbookTable(filtered);
        }

        // --- Xử lý Định Dạng Tiền Tệ & Đọc Số Thành Chữ Tiếng Việt ---
        function numberToVietnameseWords(n) {
            if (!n || isNaN(n) || n <= 0) return 'Không đồng';
            n = Math.round(n);
            const units = ['', 'nghìn', 'triệu', 'tỷ', 'nghìn tỷ', 'triệu tỷ'];
            const digits = ['không', 'một', 'hai', 'ba', 'bốn', 'năm', 'sáu', 'bảy', 'tám', 'chín'];

            function readGroup(g, isFirst) {
                let h = Math.floor(g / 100);
                let t = Math.floor((g % 100) / 10);
                let u = g % 10;
                let res = '';
                if (h > 0 || !isFirst) {
                    res += digits[h] + ' trăm ';
                }
                if (t > 1) {
                    res += digits[t] + ' mươi ';
                    if (u === 1) res += 'mốt ';
                    else if (u === 4) res += 'tư ';
                    else if (u === 5) res += 'lăm ';
                    else if (u > 0) res += digits[u] + ' ';
                } else if (t === 1) {
                    res += 'mười ';
                    if (u === 1) res += 'một ';
                    else if (u === 5) res += 'lăm ';
                    else if (u > 0) res += digits[u] + ' ';
                } else {
                    if (h > 0 || !isFirst) {
                        if (u > 0) res += 'lẻ ' + digits[u] + ' ';
                    } else {
                        if (u > 0) res += digits[u] + ' ';
                    }
                }
                return res;
            }

            let s = n.toString();
            let groups = [];
            while (s.length > 0) {
                groups.push(parseInt(s.slice(-3), 10));
                s = s.slice(0, -3);
            }

            let words = '';
            for (let i = groups.length - 1; i >= 0; i--) {
                let g = groups[i];
                if (g > 0) {
                    words += readGroup(g, i === groups.length - 1) + units[i] + ' ';
                }
            }
            words = words.trim();
            if (!words) return 'Không đồng';
            words = words.charAt(0).toUpperCase() + words.slice(1) + ' đồng';
            return words.replace(/\s+/g, ' ');
        }
        window.numberToVietnameseWords = numberToVietnameseWords;

        window.handleCashAmountInput = function(el) {
            if (!el) return;
            const cleanDigits = (el.value || '').replace(/\D/g, '');
            const num = parseFloat(cleanDigits) || 0;
            const rawEl = document.getElementById('cash-amount-raw');
            if (rawEl) rawEl.value = num;

            if (cleanDigits === '') {
                el.value = '';
            } else {
                el.value = new Intl.NumberFormat('vi-VN').format(num) + ' đ';
            }
            const wordsEl = document.getElementById('cash-amount-words');
            if (wordsEl) {
                wordsEl.innerText = num > 0 ? numberToVietnameseWords(num) : 'Không đồng';
            }
        };

        window.quickAddCashAmount = function(addVal) {
            const rawEl = document.getElementById('cash-amount-raw');
            const inputEl = document.getElementById('cash-amount-input');
            let current = parseFloat(rawEl?.value || 0) || 0;
            current += addVal;
            if (rawEl) rawEl.value = current;
            if (inputEl) {
                inputEl.value = new Intl.NumberFormat('vi-VN').format(current) + ' đ';
                const wordsEl = document.getElementById('cash-amount-words');
                if (wordsEl) wordsEl.innerText = numberToVietnameseWords(current);
            }
        };

        window.resetCashAmount = function() {
            const rawEl = document.getElementById('cash-amount-raw');
            const inputEl = document.getElementById('cash-amount-input');
            if (rawEl) rawEl.value = 0;
            if (inputEl) inputEl.value = '';
            const wordsEl = document.getElementById('cash-amount-words');
            if (wordsEl) wordsEl.innerText = 'Không đồng';
        };

        window.swapTransferAccounts = function() {
            const fromSel = document.getElementById('cash-transfer-from-select');
            const toSel = document.getElementById('cash-transfer-to-select');
            if (!fromSel || !toSel) return;
            const temp = fromSel.value;
            fromSel.value = toSel.value;
            toSel.value = temp;
        };

        // --- Modal Lập Phiếu Thu / Chi / Chuyển Quỹ Thủ Công ---
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

                // Tải danh sách tài khoản vào 2 dropdown chuyển quỹ
                const fromSelect = document.getElementById('cash-transfer-from-select');
                const toSelect = document.getElementById('cash-transfer-to-select');
                if (fromSelect && toSelect) {
                    const opts = accounts.map(a => {
                        const ownerBadge = a.owner_type === 'COMPANY' ? '[Quỹ Cty]' : '[Quỹ Cá Nhân]';
                        return `<option value="${a.id}">${a.code} - ${a.name} ${ownerBadge} (Số dư: ${formatMoney(a.current_balance || 0)})</option>`;
                    }).join('');
                    fromSelect.innerHTML = opts;
                    toSelect.innerHTML = opts;
                    if (accounts.length > 1) {
                        toSelect.selectedIndex = 1;
                    }
                }

                // 2. Tải danh sách đối tác
                const custRes = await fetch('/api/contacts?_t=' + Date.now());
                const contacts = await custRes.json();
                window.allCashContacts = contacts || [];
                const contactSelect = document.getElementById('cash-contact-select');
                if (contactSelect) {
                    let cOpts = '<option value="">-- Không chọn đối tác --</option>';
                    contacts.forEach(ct => {
                        const typeBadge = ct.type === 'customer' ? '[Khách]' : '[NCC]';
                        cOpts += `<option value="${ct.id}">${typeBadge} ${ct.name} (${ct.phone || 'Không SĐT'})</option>`;
                    });
                    contactSelect.innerHTML = cOpts;
                }
                clearCashContactSelection();

                // 3. Reset form & ngày giao dịch
                resetCashAmount();
                document.getElementById('cash-category-input').value = '';
                document.getElementById('cash-note-input').value = '';
                const today = (typeof getLocalTodayDateStr === 'function') ? getLocalTodayDateStr() : new Intl.DateTimeFormat('en-CA').format(new Date());
                const dateInp = document.getElementById('cash-date-input');
                if (dateInp) dateInp.value = today;

                // 4. Set loại phiếu
                await setCashModalType(type);

                document.getElementById('modal-create-cashbook')?.classList.remove('hidden');
            } catch (err) {
                console.error("Lỗi mở modal lập phiếu:", err);
                alert("Lỗi tải thông tin tài khoản!");
            }
        }

        window.allCashContacts = [];

        function showCashContactDropdown() {
            const menu = document.getElementById('cash-contact-dropdown-menu');
            if (!menu) return;
            const query = (document.getElementById('cash-contact-search-input')?.value || '').trim();
            filterCashContactDropdown(query);
            menu.classList.remove('hidden');
        }
        window.showCashContactDropdown = showCashContactDropdown;

        function filterCashContactDropdown(query = '') {
            const menu = document.getElementById('cash-contact-dropdown-menu');
            if (!menu) return;
            const q = (query || '').toLowerCase().trim();
            const contacts = window.allCashContacts || [];

            let matches = contacts;
            if (q) {
                matches = contacts.filter(c => {
                    const name = (c.name || '').toLowerCase();
                    const phone = (c.phone || '').toLowerCase();
                    if (typeof fuzzyMatch === 'function') {
                        return fuzzyMatch(q, name) || fuzzyMatch(q, phone) || name.includes(q) || phone.includes(q);
                    }
                    return name.includes(q) || phone.includes(q);
                });
            }

            let html = `
                <div onclick="selectCashContact('', '-- Không chọn đối tác --', '', '', 0)" 
                     class="p-2.5 hover:bg-slate-100 cursor-pointer flex items-center justify-between text-slate-500 font-medium border-b">
                    <span>-- Không chọn đối tác --</span>
                    <span class="text-xs text-slate-400">Bỏ chọn</span>
                </div>
            `;

            if (matches.length === 0) {
                html += `<div class="p-3 text-center text-slate-400 ">Không tìm thấy đối tác nào phù hợp</div>`;
            } else {
                const list = matches.slice(0, 40);
                html += list.map(c => {
                    const isCust = c.type === 'customer';
                    const badge = isCust 
                        ? '<span class="px-1.5 py-0.5 rounded text-xs font-bold bg-sky-100 text-sky-700">Khách</span>'
                        : '<span class="px-1.5 py-0.5 rounded text-xs font-bold bg-amber-100 text-amber-800">NCC</span>';
                    const phoneStr = c.phone ? `<span class="text-slate-400 text-xs font-mono ml-1">📞 ${escapeHtml(c.phone)}</span>` : '';
                    const debt = Number(c.debt || 0);
                    const debtStr = debt > 0 ? `<span class="text-rose-600 font-bold font-mono text-xs">Nợ: ${formatMoney(debt)}</span>` : '';
                    const safeName = (c.name || '').replace(/'/g, "\\'");
                    const safePhone = (c.phone || '').replace(/'/g, "\\'");

                    return `
                        <div onclick="selectCashContact(${c.id}, '${safeName}', '${c.type}', '${safePhone}', ${debt})" 
                             class="p-2.5 hover:bg-sky-50/70 cursor-pointer flex items-center justify-between transition group">
                            <div class="flex items-center gap-1.5 overflow-hidden pr-2">
                                ${badge}
                                <span class="font-bold text-slate-800 text-xs truncate group-hover:text-sky-900">${escapeHtml(c.name)}</span>
                                ${phoneStr}
                            </div>
                            <div class="shrink-0 text-right">
                                ${debtStr}
                            </div>
                        </div>
                    `;
                }).join('');
            }

            menu.innerHTML = html;
            menu.classList.remove('hidden');
        }
        window.filterCashContactDropdown = filterCashContactDropdown;

        function selectCashContact(id, name, type, phone, debt = 0) {
            const selectEl = document.getElementById('cash-contact-select');
            const searchInput = document.getElementById('cash-contact-search-input');
            const badgeEl = document.getElementById('cash-contact-selected-badge');
            const clearBtn = document.getElementById('cash-contact-clear-btn');
            const menu = document.getElementById('cash-contact-dropdown-menu');

            if (selectEl) selectEl.value = id ? String(id) : '';

            if (id) {
                const tag = type === 'customer' ? '[Khách]' : '[NCC]';
                if (searchInput) searchInput.value = `${tag} ${name}${phone ? ' (' + phone + ')' : ''}`;
                if (badgeEl) badgeEl.innerHTML = `<span class="text-sky-600 font-bold">${tag} ${escapeHtml(name)}</span>`;
                if (clearBtn) clearBtn.classList.remove('hidden');
            } else {
                if (searchInput) searchInput.value = '';
                if (badgeEl) badgeEl.innerText = 'Chưa chọn đối tác';
                if (clearBtn) clearBtn.classList.add('hidden');
            }

            if (menu) menu.classList.add('hidden');
        }
        window.selectCashContact = selectCashContact;

        function clearCashContactSelection() {
            selectCashContact('', '', '', '', 0);
        }
        window.clearCashContactSelection = clearCashContactSelection;

        document.addEventListener('pointerdown', (e) => {
            const container = document.getElementById('cash-contact-container');
            const menu = document.getElementById('cash-contact-dropdown-menu');
            if (container && menu && !container.contains(e.target)) {
                menu.classList.add('hidden');
            }
        });

        async function setCashModalType(type) {
            document.getElementById('cash-type-val').value = type;
            const btnIn = document.getElementById('btn-cash-type-in');
            const btnOut = document.getElementById('btn-cash-type-out');
            const btnTransfer = document.getElementById('btn-cash-type-transfer');
            const titleEl = document.getElementById('cash-modal-title');
            const iconEl = document.getElementById('cash-modal-icon');
            const btnSubmit = document.getElementById('btn-submit-cashbook');

            const singleAccBox = document.getElementById('cash-single-account-box');
            const transferAccBox = document.getElementById('cash-transfer-accounts-box');
            const catContainer = document.getElementById('cash-category-container');
            const contactContainer = document.getElementById('cash-contact-container');
            const codeContainer = document.getElementById('cash-code-container');
            const dateLabel = document.getElementById('cash-date-label');
            const dateContainer = document.getElementById('cash-date-container');

            if (type === 'transfer') {
                if (btnTransfer) btnTransfer.className = 'py-2 rounded-lg font-bold border text-center transition flex items-center justify-center gap-1.5 bg-sky-50 border-sky-500 text-sky-700 cursor-pointer';
                if (btnIn) btnIn.className = 'py-2 rounded-lg font-bold border text-center transition flex items-center justify-center gap-1.5 bg-slate-50 border-slate-200 text-slate-600 cursor-pointer';
                if (btnOut) btnOut.className = 'py-2 rounded-lg font-bold border text-center transition flex items-center justify-center gap-1.5 bg-slate-50 border-slate-200 text-slate-600 cursor-pointer';

                if (singleAccBox) singleAccBox.classList.add('hidden');
                if (transferAccBox) transferAccBox.classList.remove('hidden');
                if (catContainer) catContainer.classList.add('hidden');
                if (contactContainer) contactContainer.classList.add('hidden');
                if (codeContainer) codeContainer.classList.add('hidden');
                if (dateLabel) dateLabel.innerText = '📅 Ngày Chuyển Quỹ (*):';
                if (dateContainer) dateContainer.className = 'col-span-2';

                if (titleEl) titleEl.innerText = 'Chuyển Tiền / Quỹ Nội Bộ (Rút - Nộp)';
                if (iconEl) iconEl.innerText = '🔄';
                if (btnSubmit) {
                    btnSubmit.className = 'px-5 py-2 bg-sky-600 hover:bg-sky-700 text-white rounded-lg text-xs font-bold shadow flex items-center gap-1.5 cursor-pointer';
                    btnSubmit.innerHTML = '<span>🔄</span> <span>Xác Nhận Chuyển Tiền</span>';
                }
            } else if (type === 'in') {
                if (btnIn) btnIn.className = 'py-2 rounded-lg font-bold border text-center transition flex items-center justify-center gap-1.5 bg-emerald-50 border-emerald-500 text-emerald-700 cursor-pointer';
                if (btnOut) btnOut.className = 'py-2 rounded-lg font-bold border text-center transition flex items-center justify-center gap-1.5 bg-slate-50 border-slate-200 text-slate-600 cursor-pointer';
                if (btnTransfer) btnTransfer.className = 'py-2 rounded-lg font-bold border text-center transition flex items-center justify-center gap-1.5 bg-slate-50 border-slate-200 text-slate-600 cursor-pointer';

                if (singleAccBox) singleAccBox.classList.remove('hidden');
                if (transferAccBox) transferAccBox.classList.add('hidden');
                if (catContainer) catContainer.classList.remove('hidden');
                if (contactContainer) contactContainer.classList.remove('hidden');
                if (codeContainer) codeContainer.classList.remove('hidden');
                if (dateLabel) dateLabel.innerText = '📅 Ngày Thu Tiền (*):';
                if (dateContainer) dateContainer.className = 'col-span-1';

                if (titleEl) titleEl.innerText = 'Lập Phiếu Thu Tiền (Vào)';
                if (iconEl) iconEl.innerText = '🟢';
                if (btnSubmit) {
                    btnSubmit.className = 'px-5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-bold shadow flex items-center gap-1.5 cursor-pointer';
                    btnSubmit.innerHTML = '<span>💾</span> <span>Xác Nhận Lưu Phiếu Thu</span>';
                }
            } else {
                if (btnOut) btnOut.className = 'py-2 rounded-lg font-bold border text-center transition flex items-center justify-center gap-1.5 bg-rose-50 border-rose-500 text-rose-700 cursor-pointer';
                if (btnIn) btnIn.className = 'py-2 rounded-lg font-bold border text-center transition flex items-center justify-center gap-1.5 bg-slate-50 border-slate-200 text-slate-600 cursor-pointer';
                if (btnTransfer) btnTransfer.className = 'py-2 rounded-lg font-bold border text-center transition flex items-center justify-center gap-1.5 bg-slate-50 border-slate-200 text-slate-600 cursor-pointer';

                if (singleAccBox) singleAccBox.classList.remove('hidden');
                if (transferAccBox) transferAccBox.classList.add('hidden');
                if (catContainer) catContainer.classList.remove('hidden');
                if (contactContainer) contactContainer.classList.remove('hidden');
                if (codeContainer) codeContainer.classList.remove('hidden');
                if (dateLabel) dateLabel.innerText = '📅 Ngày Chi Tiền (*):';
                if (dateContainer) dateContainer.className = 'col-span-1';

                if (titleEl) titleEl.innerText = 'Lập Phiếu Chi Tiền (Ra)';
                if (iconEl) iconEl.innerText = '🔴';
                if (btnSubmit) {
                    btnSubmit.className = 'px-5 py-2 bg-rose-600 hover:bg-rose-700 text-white rounded-lg text-xs font-bold shadow flex items-center gap-1.5 cursor-pointer';
                    btnSubmit.innerHTML = '<span>💾</span> <span>Xác Nhận Lưu Phiếu Chi</span>';
                }
            }

            // Gợi ý mã tiếp theo nếu không phải transfer
            if (type !== 'transfer') {
                await loadCashbookCategories(type);
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
        }

        // ── Quản lý Danh mục Hạng mục Thu Chi ──
        async function loadCashbookCategories(type = 'both') {
            try {
                const url = type && type !== 'both' ? `/api/cashbook/categories?type=${type}` : '/api/cashbook/categories';
                const res = await fetch(url);
                if (!res.ok) return;
                const categories = await res.json();
                window.allCashCategories = categories || [];

                const datalist = document.getElementById('cash-categories-datalist');
                if (datalist) {
                    datalist.innerHTML = categories.map(c => `<option value="${c.name}">`).join('');
                }
            } catch (e) {
                console.error("loadCashbookCategories error:", e);
            }
        }
        window.loadCashbookCategories = loadCashbookCategories;

        function openQuickAddCashCategoryModal() {
            const modal = document.getElementById('modal-quick-add-cash-category');
            if (modal) modal.classList.remove('hidden');
            const inp = document.getElementById('quick-cash-category-name');
            if (inp) {
                inp.value = '';
                setTimeout(() => inp.focus(), 100);
            }
            // Mặc định chọn radio theo loại phiếu đang mở
            const currentType = document.getElementById('cash-type-val')?.value || 'out';
            const radio = document.querySelector(`input[name="quick-cash-cat-type"][value="${currentType}"]`);
            if (radio) radio.checked = true;
        }
        window.openQuickAddCashCategoryModal = openQuickAddCashCategoryModal;

        function closeQuickAddCashCategoryModal() {
            document.getElementById('modal-quick-add-cash-category')?.classList.add('hidden');
        }
        window.closeQuickAddCashCategoryModal = closeQuickAddCashCategoryModal;

        async function saveQuickCashCategory() {
            const inp = document.getElementById('quick-cash-category-name');
            const name = (inp?.value || '').trim();
            if (!name) {
                if (window.showToast) window.showToast('Vui lòng nhập tên hạng mục mới!', 'warning');
                else alert('Vui lòng nhập tên hạng mục mới!');
                inp?.focus();
                return;
            }

            const radio = document.querySelector('input[name="quick-cash-cat-type"]:checked');
            const cType = radio ? radio.value : 'both';

            try {
                const res = await fetch('/api/cashbook/categories', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ name: name, type: cType })
                });
                const data = await res.json();
                if (!res.ok) {
                    throw new Error(data.detail || 'Không thể tạo hạng mục');
                }

                closeQuickAddCashCategoryModal();
                if (window.showToast) window.showToast(`Đã thêm hạng mục: [${data.name}]`, 'success');

                // Tự động điền vào ô hạng mục của form đang mở
                const currentCatInput = document.getElementById('cash-category-input');
                if (currentCatInput) currentCatInput.value = data.name;
                const editCatInput = document.getElementById('edit-cash-category');
                if (editCatInput) editCatInput.value = data.name;

                const currentType = document.getElementById('cash-type-val')?.value || 'both';
                await loadCashbookCategories(currentType);
            } catch (e) {
                if (window.showToast) window.showToast('Lỗi: ' + e.message, 'error');
                else alert('Lỗi: ' + e.message);
            }
        }
        window.saveQuickCashCategory = saveQuickCashCategory;

        function openCashCategoryManagerModal() {
            const modal = document.getElementById('modal-cash-category-manager');
            if (modal) modal.classList.remove('hidden');
            const inp = document.getElementById('mgr-cash-cat-name');
            if (inp) {
                inp.value = '';
                setTimeout(() => inp.focus(), 100);
            }
            renderCashCategoryManagerList();
        }
        window.openCashCategoryManagerModal = openCashCategoryManagerModal;

        function closeCashCategoryManagerModal() {
            document.getElementById('modal-cash-category-manager')?.classList.add('hidden');
            const currentType = document.getElementById('cash-type-val')?.value || 'both';
            loadCashbookCategories(currentType);
        }
        window.closeCashCategoryManagerModal = closeCashCategoryManagerModal;

        async function renderCashCategoryManagerList() {
            const tbody = document.getElementById('cash-category-mgr-list');
            if (!tbody) return;
            try {
                tbody.innerHTML = '<tr><td colspan="4" class="p-4 text-center text-slate-400">Đang tải danh sách...</td></tr>';
                const res = await fetch('/api/cashbook/categories?type=all');
                if (!res.ok) throw new Error('Không thể tải danh sách');
                const categories = await res.json();

                if (!categories || categories.length === 0) {
                    tbody.innerHTML = '<tr><td colspan="4" class="p-4 text-center text-slate-400">Chưa có hạng mục nào</td></tr>';
                    return;
                }

                tbody.innerHTML = categories.map(c => {
                    const safeName = (c.name || '').replace(/'/g, "\\'");
                    let typeBadge = '';
                    if (c.type === 'in') {
                        typeBadge = '<span class="px-2 py-0.5 rounded text-xs font-bold bg-emerald-100 text-emerald-800">🟢 Thu</span>';
                    } else if (c.type === 'out') {
                        typeBadge = '<span class="px-2 py-0.5 rounded text-xs font-bold bg-rose-100 text-rose-800">🔴 Chi</span>';
                    } else {
                        typeBadge = '<span class="px-2 py-0.5 rounded text-xs font-bold bg-sky-100 text-sky-800">🔄 Cả 2</span>';
                    }

                    return `
                        <tr class="hover:bg-slate-50 transition">
                            <td class="p-2.5 font-bold text-slate-800" id="cash-cat-name-cell-${c.id}">
                                ${c.name}
                            </td>
                            <td class="p-2.5 text-center">
                                ${typeBadge}
                            </td>
                            <td class="p-2.5 text-center">
                                <span class="px-2 py-0.5 rounded-full font-mono font-bold text-xs bg-slate-100 text-slate-700">
                                    ${c.voucher_count || 0}
                                </span>
                            </td>
                            <td class="p-2.5 text-center">
                                <div class="flex items-center justify-center gap-1.5">
                                    <button type="button" onclick="editCashCategoryInline(${c.id}, '${safeName}', '${c.type}')" class="px-2 py-1 bg-amber-50 hover:bg-amber-100 text-amber-700 rounded text-xs font-semibold transition" title="Sửa tên">Sửa</button>
                                    <button type="button" onclick="deleteCashCategory(${c.id}, '${safeName}')" class="px-2 py-1 bg-rose-50 hover:bg-rose-100 text-rose-600 rounded text-xs font-semibold transition" title="Xóa hạng mục">Xóa</button>
                                </div>
                            </td>
                        </tr>
                    `;
                }).join('');
            } catch (e) {
                console.error("renderCashCategoryManagerList error:", e);
                tbody.innerHTML = `<tr><td colspan="4" class="p-4 text-center text-rose-500">Lỗi: ${e.message}</td></tr>`;
            }
        }
        window.renderCashCategoryManagerList = renderCashCategoryManagerList;

        async function saveCashCategoryFromManager() {
            const inp = document.getElementById('mgr-cash-cat-name');
            const name = (inp?.value || '').trim();
            const type = document.getElementById('mgr-cash-cat-type')?.value || 'out';

            if (!name) {
                if (window.showToast) window.showToast('Vui lòng nhập tên hạng mục!', 'warning');
                else alert('Vui lòng nhập tên hạng mục!');
                inp?.focus();
                return;
            }

            try {
                const res = await fetch('/api/cashbook/categories', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ name: name, type: type })
                });
                const data = await res.json();
                if (!res.ok) throw new Error(data.detail || 'Lỗi thêm hạng mục');

                inp.value = '';
                if (window.showToast) window.showToast(`Đã thêm hạng mục: [${data.name}]`, 'success');
                await renderCashCategoryManagerList();
            } catch (e) {
                if (window.showToast) window.showToast('Lỗi: ' + e.message, 'error');
                else alert('Lỗi: ' + e.message);
            }
        }
        window.saveCashCategoryFromManager = saveCashCategoryFromManager;

        function editCashCategoryInline(id, currentName, currentType) {
            const cell = document.getElementById(`cash-cat-name-cell-${id}`);
            if (!cell) return;
            const safeCurrent = (currentName || '').replace(/"/g, '&quot;');
            cell.innerHTML = `
                <div class="flex items-center gap-1.5">
                    <input type="text" id="inline-cash-cat-${id}" value="${safeCurrent}" class="border border-sky-400 rounded px-2 py-1 text-xs font-bold text-slate-800 flex-1 focus:ring-1 focus:ring-sky-500 outline-none" onkeydown="if(event.key==='Enter') saveCashCategoryInline(${id}, '${currentType}'); if(event.key==='Escape') renderCashCategoryManagerList();">
                    <button type="button" onclick="saveCashCategoryInline(${id}, '${currentType}')" class="px-2 py-1 bg-emerald-600 text-white rounded text-xs font-bold hover:bg-emerald-700">✓</button>
                    <button type="button" onclick="renderCashCategoryManagerList()" class="px-2 py-1 bg-slate-200 text-slate-600 rounded text-xs hover:bg-slate-300">✕</button>
                </div>
            `;
            setTimeout(() => {
                const inp = document.getElementById(`inline-cash-cat-${id}`);
                if (inp) { inp.focus(); inp.select(); }
            }, 50);
        }
        window.editCashCategoryInline = editCashCategoryInline;

        async function saveCashCategoryInline(id, type) {
            const inp = document.getElementById(`inline-cash-cat-${id}`);
            const newName = (inp?.value || '').trim();
            if (!newName) {
                if (window.showToast) window.showToast('Tên hạng mục không được để trống!', 'warning');
                return;
            }

            try {
                const res = await fetch(`/api/cashbook/categories/${id}`, {
                    method: 'PUT',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ name: newName, type: type })
                });
                const data = await res.json();
                if (!res.ok) throw new Error(data.detail || 'Lỗi cập nhật');

                if (window.showToast) window.showToast(data.message || 'Cập nhật thành công', 'success');
                await renderCashCategoryManagerList();
            } catch (e) {
                if (window.showToast) window.showToast('Lỗi: ' + e.message, 'error');
                else alert('Lỗi: ' + e.message);
            }
        }
        window.saveCashCategoryInline = saveCashCategoryInline;

        async function deleteCashCategory(id, name) {
            let confirmed = false;
            if (typeof window.showConfirmModal === 'function') {
                confirmed = await window.showConfirmModal({
                    title: `Xóa Hạng Mục [${name}]`,
                    message: `Bạn có chắc chắn muốn xóa hạng mục <strong>"${name}"</strong>?`,
                    subMessage: `Các phiếu thu chi cũ đang mang hạng mục này sẽ được tự động chuyển về hạng mục mặc định <strong>"Thu khác" / "Chi khác"</strong>.`,
                    confirmText: 'Xác Nhận Xóa',
                    cancelText: 'Hủy Bỏ',
                    type: 'danger'
                });
            } else {
                confirmed = confirm(`Bạn có chắc muốn xóa hạng mục "${name}"? Các phiếu cũ sẽ chuyển về Thu khác/Chi khác.`);
            }
            if (!confirmed) return;

            try {
                const res = await fetch(`/api/cashbook/categories/${id}`, {
                    method: 'DELETE'
                });
                const data = await res.json();
                if (!res.ok) throw new Error(data.detail || 'Lỗi xóa hạng mục');

                if (window.showToast) window.showToast(data.message || 'Đã xóa hạng mục', 'success');
                await renderCashCategoryManagerList();
            } catch (e) {
                if (window.showToast) window.showToast('Lỗi: ' + e.message, 'error');
                else alert('Lỗi: ' + e.message);
            }
        }
        window.deleteCashCategory = deleteCashCategory;

        function closeCreateCashModal() {
            document.getElementById('modal-create-cashbook').classList.add('hidden');
        }
        window.closeCreateCashModal = closeCreateCashModal;

        async function submitCreateCashbook() {
            const type = document.getElementById('cash-type-val').value;
            const rawAmount = parseFloat(document.getElementById('cash-amount-raw')?.value || 0) || 
                              parseFloat((document.getElementById('cash-amount-input')?.value || '').replace(/\D/g, '') || 0);
            const note = document.getElementById('cash-note-input')?.value.trim();

            if (!rawAmount || rawAmount <= 0) {
                if (window.showToast) window.showToast('Vui lòng nhập số tiền hợp lệ (> 0)!', 'warning');
                else alert('Vui lòng nhập số tiền hợp lệ (> 0)!');
                document.getElementById('cash-amount-input')?.focus();
                return;
            }

            // Xử lý chuyển quỹ nội bộ
            if (type === 'transfer') {
                const fromId = parseInt(document.getElementById('cash-transfer-from-select')?.value || 0);
                const toId = parseInt(document.getElementById('cash-transfer-to-select')?.value || 0);

                if (!fromId || !toId) {
                    if (window.showToast) window.showToast('Vui lòng chọn đầy đủ tài khoản nguồn và đích!', 'warning');
                    else alert('Vui lòng chọn đầy đủ tài khoản nguồn và đích!');
                    return;
                }
                if (fromId === toId) {
                    if (window.showToast) window.showToast('Tài khoản nguồn và đích không được trùng nhau!', 'warning');
                    else alert('Tài khoản nguồn và đích không được trùng nhau!');
                    return;
                }

                const dateVal = document.getElementById('cash-date-input')?.value || null;
                const payloadTransfer = {
                    from_account_id: fromId,
                    to_account_id: toId,
                    amount: rawAmount,
                    note: note
                };
                if (dateVal) payloadTransfer.created_at = dateVal;

                try {
                    const res = await fetch('/api/cashbook/transfer', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify(payloadTransfer)
                    });
                    const result = await res.json();
                    if (!res.ok) throw new Error(result.detail || 'Lỗi chuyển quỹ');

                    closeCreateCashModal();
                    if (window.showToast) window.showToast(`Đã chuyển quỹ thành công! Mã: ${result.transfer_code}`, 'success');
                    else alert(`✅ Đã chuyển quỹ thành công! Mã: ${result.transfer_code}`);
                    await loadCashbook();
                    return;
                } catch(err) {
                    if (window.showToast) window.showToast('Lỗi: ' + err.message, 'error');
                    else alert('❌ Lỗi: ' + err.message);
                    return;
                }
            }

            // Xử lý phiếu thu / chi thông thường
            const accountId = parseInt(document.getElementById('cash-account-select')?.value || 0);
            const code = document.getElementById('cash-code-input')?.value.trim();
            const category = document.getElementById('cash-category-input')?.value.trim();
            const contactIdVal = document.getElementById('cash-contact-select')?.value;
            const contactId = contactIdVal ? parseInt(contactIdVal) : null;

            if (!category) {
                if (window.showToast) window.showToast('Vui lòng chọn hoặc nhập hạng mục thu/chi!', 'warning');
                else alert('Vui lòng chọn hoặc nhập hạng mục thu/chi!');
                document.getElementById('cash-category-input')?.focus();
                return;
            }

            const dateVal = document.getElementById('cash-date-input')?.value || null;
            const payload = {
                code: code || null,
                type: type,
                category: category,
                amount: rawAmount,
                account_id: accountId || null,
                contact_id: contactId,
                ref_type: 'manual',
                note: note,
                created_at: dateVal || null
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
                if (window.showToast) window.showToast(`Đã lập thành công phiếu ${type === 'in' ? 'thu' : 'chi'} [${result.code}]!`, 'success');
                else alert(`✅ Đã lập thành công phiếu ${type === 'in' ? 'thu' : 'chi'} [${result.code}]!`);
                await loadCashbook();
            } catch (err) {
                console.error(err);
                if (window.showToast) window.showToast(`Thao tác thất bại: ${err.message}`, 'error');
                else alert(`❌ Thao tác thất bại: ${err.message}`);
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
                        const icon = isBank ? '🏦' : (a.account_type === 'ewallet' ? '📱' : (a.account_type === 'pos_card' ? '💳' : '💵'));
                        const bankInfo = isBank 
                            ? `<span class="font-bold text-slate-800">${a.bank_name ? getBankDisplayName(a.bank_name) : '-'}</span> - STK: <span class="font-mono font-bold">${a.account_number || '-'}</span> (${a.account_holder || '-'})`
                            : `<span class="text-gray-400 ">Tiền mặt / không có STK</span>`;

                        return `
                            <tr class="border-b hover:bg-slate-50 transition">
                                <td class="p-2.5 font-mono font-bold text-xs text-sky-700">${a.code}</td>
                                <td class="p-2.5 font-bold text-slate-800 flex items-center gap-1.5">
                                    <span>${icon}</span>
                                    <span>${a.name}</span>
                                    ${a.is_default ? '<span class="bg-amber-100 text-amber-800 text-xs px-1.5 py-0.5 rounded font-bold">Mặc định</span>' : ''}
                                </td>
                                <td class="p-2.5 text-center">
                                    <span class="px-2 py-0.5 rounded text-xs font-bold ${isCty ? 'bg-blue-100 text-blue-700' : 'bg-sky-100 text-sky-700'}">
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
                    fillBankSelect(document.getElementById('acc-bank-name'), acc.bank_name);
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
                fillBankSelect(document.getElementById('acc-bank-name'), '');
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
            if (accountType === 'bank' && (!bankName || !accountNumber)) {
                alert('Tài khoản ngân hàng cần chọn Ngân hàng và nhập Số tài khoản để tạo mã VietQR!');
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
            updateAppTitleUI(appName, currentSettings.shop_logo);

            const nameEl = document.getElementById('comp-name');
            if (nameEl) nameEl.value = currentSettings.shop_name || '';
            const addrEl = document.getElementById('comp-address');
            if (addrEl) addrEl.value = currentSettings.shop_address || '';
            const phoneEl = document.getElementById('comp-phone');
            if (phoneEl) phoneEl.value = currentSettings.shop_phone || '';
            const footerEl = document.getElementById('comp-footer');
            if (footerEl) footerEl.value = currentSettings.shop_footer || '';
            const bankCodeEl = document.getElementById('comp-bank-code');
            if (bankCodeEl) fillBankSelect(bankCodeEl, currentSettings.shop_bank_code || 'MB');
            const bankAccEl = document.getElementById('comp-bank-account');
            if (bankAccEl) bankAccEl.value = currentSettings.shop_bank_account || '';
            const bankOwnerEl = document.getElementById('comp-bank-owner');
            if (bankOwnerEl) bankOwnerEl.value = currentSettings.shop_bank_owner || '';
            const qrModeEl = document.getElementById('comp-qr-mode');
            if (qrModeEl) qrModeEl.value = currentSettings.shop_qr_mode || 'vietqr';
            
            const logoImg = document.getElementById('comp-logo-preview');
            if (logoImg) {
                if (currentSettings.shop_logo) {
                    logoImg.src = currentSettings.shop_logo;
                    logoImg.classList.remove('hidden');
                } else {
                    logoImg.classList.add('hidden');
                }
            }
            const qrImg = document.getElementById('comp-qr-preview');
            if (qrImg && currentSettings.shop_qr_image) {
                qrImg.src = currentSettings.shop_qr_image;
                qrImg.classList.remove('hidden');
            }
            const driveEl = document.getElementById('comp-drive-webhook-url');
            if (driveEl) driveEl.value = currentSettings.google_drive_webhook_url || '';
            toggleQRModeUI();
        }

        async function saveDriveWebhookSetting() {
            const webhookUrl = (document.getElementById('comp-drive-webhook-url')?.value || '').trim();
            const statusEl = document.getElementById('drive-backup-status-text');
            try {
                const res = await fetch('/api/settings/company', {
                    method: 'POST',
                    headers: {'Content-Type': 'application/json'},
                    body: JSON.stringify({ google_drive_webhook_url: webhookUrl })
                });
                if (res.ok) {
                    if (statusEl) statusEl.innerHTML = '<span class="text-emerald-600">✅ Đã lưu link Webhook thành công!</span>';
                    alert('✅ Đã lưu link Google Drive Webhook!');
                } else {
                    if (statusEl) statusEl.innerHTML = '<span class="text-rose-600">❌ Lỗi khi lưu link!</span>';
                }
            } catch (err) {
                if (statusEl) statusEl.innerHTML = `<span class="text-rose-600">❌ Lỗi: ${err.message}</span>`;
            }
        }

        async function triggerDriveBackupNow() {
            const statusEl = document.getElementById('drive-backup-status-text');
            if (statusEl) statusEl.innerHTML = '<span class="text-blue-600">⏳ Đang đóng gói dữ liệu và gửi lên Google Drive...</span>';
            try {
                const res = await fetch('/api/settings/backup-drive-now', { method: 'POST' });
                const data = await res.json();
                if (res.ok) {
                    if (statusEl) statusEl.innerHTML = `<span class="text-emerald-600 font-bold">✅ ${data.message}</span>`;
                    alert(`✅ ${data.message}`);
                } else {
                    if (statusEl) statusEl.innerHTML = `<span class="text-rose-600 font-bold">❌ ${data.detail || 'Lỗi sao lưu'}</span>`;
                    alert(`❌ Lỗi: ${data.detail || 'Không thể sao lưu'}`);
                }
            } catch (err) {
                if (statusEl) statusEl.innerHTML = `<span class="text-rose-600 font-bold">❌ Lỗi: ${err.message}</span>`;
                alert(`❌ Lỗi kết nối: ${err.message}`);
            }
        }

        function updateAppTitleUI(name, logoUrl) {
            if (!name) name = '⚡ POS Offline';
            const sidebarEl = document.getElementById('sidebar-app-name');
            if (sidebarEl) sidebarEl.textContent = name;
            document.title = name;

            const logoEl = document.getElementById('sidebar-app-logo');
            const iconEl = document.getElementById('sidebar-app-icon');
            if (logoEl && iconEl) {
                const effectiveLogo = logoUrl !== undefined ? logoUrl : (window.currentSettings && window.currentSettings.shop_logo);
                if (effectiveLogo) {
                    logoEl.src = effectiveLogo;
                    logoEl.classList.remove('hidden');
                    iconEl.classList.add('hidden');
                } else {
                    logoEl.classList.add('hidden');
                    iconEl.classList.remove('hidden');
                }
            }
        }

        function toggleQRModeUI() {
            const qrModeEl = document.getElementById('comp-qr-mode');
            const panelVietqr = document.getElementById('panel-vietqr');
            const panelStatic = document.getElementById('panel-static-qr');
            if (!qrModeEl || !panelVietqr || !panelStatic) return;
            const mode = qrModeEl.value;
            if (mode === 'vietqr') {
                panelVietqr.classList.remove('hidden');
                panelStatic.classList.add('hidden');
            } else {
                panelVietqr.classList.add('hidden');
                panelStatic.classList.remove('hidden');
            }
        }

        function previewUploadImage(input, previewId) {
            if (input.files && input.files[0]) {
                const file = input.files[0];
                const reader = new FileReader();
                reader.onload = function(e) {
                    const rawDataUrl = e.target.result;
                    const tempImg = new Image();
                    tempImg.onload = function() {
                        const maxDim = 320;
                        let w = tempImg.width || maxDim;
                        let h = tempImg.height || maxDim;
                        if (w > maxDim || h > maxDim) {
                            if (w >= h) { h = Math.round((h * maxDim) / w); w = maxDim; }
                            else { w = Math.round((w * maxDim) / h); h = maxDim; }
                        }
                        const canvas = document.createElement('canvas');
                        canvas.width = w;
                        canvas.height = h;
                        const ctx = canvas.getContext('2d');
                        ctx.drawImage(tempImg, 0, 0, w, h);
                        let compressed = canvas.toDataURL('image/webp', 0.88);
                        if (!compressed || compressed.length > rawDataUrl.length) {
                            compressed = canvas.toDataURL('image/png');
                        }
                        const img = document.getElementById(previewId);
                        if (img) {
                            img.src = compressed;
                            img.classList.remove('hidden');
                        }
                    };
                    tempImg.onerror = function() {
                        const img = document.getElementById(previewId);
                        if (img) {
                            img.src = rawDataUrl;
                            img.classList.remove('hidden');
                        }
                    };
                    tempImg.src = rawDataUrl;
                };
                reader.readAsDataURL(file);
            }
        }

        async function saveCompanySettings() {
            const logoImg = document.getElementById('comp-logo-preview');
            const appName = (document.getElementById('comp-app-name')?.value || '').trim() || '⚡ POS Offline';
            const webhookUrl = (document.getElementById('comp-drive-webhook-url')?.value || '').trim();
            const payload = {
                app_name: appName,
                shop_name: document.getElementById('comp-name').value,
                shop_address: document.getElementById('comp-address').value,
                shop_phone: document.getElementById('comp-phone').value,
                shop_footer: document.getElementById('comp-footer').value,
                shop_bank_code: currentSettings.shop_bank_code || 'MB',
                shop_bank_account: currentSettings.shop_bank_account || '',
                shop_bank_owner: currentSettings.shop_bank_owner || '',
                shop_qr_mode: currentSettings.shop_qr_mode || 'vietqr',
                shop_qr_image: currentSettings.shop_qr_image || '',
                shop_logo: (logoImg && !logoImg.classList.contains('hidden')) ? logoImg.src : '',
                google_drive_webhook_url: webhookUrl
            };
            const res = await fetch('/api/settings/company', {
                method: 'POST',
                headers: {'Content-Type': 'application/json'},
                body: JSON.stringify(payload)
            });
            if (res.ok) {
                alert('✅ Đã lưu thông tin doanh nghiệp & Link Google Drive Webhook thành công!');
                updateAppTitleUI(appName, payload.shop_logo);
                const loginNameEl = document.getElementById('login-store-name');
                if (loginNameEl) loginNameEl.textContent = appName;
                const loginLogoEl = document.getElementById('login-store-logo');
                const loginIconEl = document.getElementById('login-store-icon');
                if (payload.shop_logo && loginLogoEl && loginIconEl) {
                    loginLogoEl.src = payload.shop_logo;
                    loginLogoEl.style.display = 'block';
                    loginIconEl.style.display = 'none';
                } else if (loginLogoEl && loginIconEl) {
                    loginLogoEl.style.display = 'none';
                    loginIconEl.style.display = '';
                }
                Object.assign(currentSettings, payload);
            } else {
                let errMsg = 'Lỗi lưu thông tin!';
                try {
                    const errData = await res.json();
                    if (errData && errData.detail) errMsg = errData.detail;
                } catch (_) {}
                alert(errMsg);
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
                
                filterCostIngredientsTable();
            } catch (e) {
                console.error("loadCostIngredients error:", e);
            }
        }

        function filterCostIngredientsTable() {
            const tbody = document.getElementById('table-cost-ingredients');
            if (!tbody) return;

            const kw = (document.getElementById('cost-ing-search')?.value || '').trim().toLowerCase();
            const typeFilter = document.getElementById('cost-ing-type-filter')?.value || '';
            const clearBtn = document.getElementById('cost-ing-search-clear');
            if (clearBtn) {
                if (kw) clearBtn.classList.remove('hidden');
                else clearBtn.classList.add('hidden');
            }

            const filtered = (costIngredients || []).filter(ing => {
                const matchType = !typeFilter || ing.type === typeFilter;
                if (!matchType) return false;
                if (!kw) return true;

                const code = (ing.code || '').toLowerCase();
                const name = (ing.name || '').toLowerCase();
                const supps = (ing.supplier_names || '').toLowerCase();
                return code.includes(kw) || name.includes(kw) || supps.includes(kw);
            });

            const countBadge = document.getElementById('cost-ing-count-badge');
            if (countBadge) {
                countBadge.textContent = `Hiển thị ${filtered.length}/${costIngredients.length} nguyên liệu`;
            }

            if (filtered.length === 0) {
                tbody.innerHTML = `<tr><td colspan="8" class="p-6 text-center text-gray-400 ">🔍 Không tìm thấy nguyên liệu nào phù hợp ${kw ? `với "${kw}"` : ''}</td></tr>`;
                return;
            }

            tbody.innerHTML = filtered.map(ing => `
                <tr class="border-b hover:bg-gray-50">
                    <td class="p-2 font-mono font-bold text-slate-700">${ing.code || '-'}</td>
                    <td class="p-2 font-medium text-slate-800">${ing.name}</td>
                    <td class="p-2 text-center">
                        <span class="px-2 py-0.5 rounded text-xs font-bold ${ing.type === 'SERVICE' ? 'bg-sky-100 text-sky-700' : 'bg-emerald-100 text-emerald-700'}">
                            ${ing.type === 'SERVICE' ? 'Dịch vụ' : 'Vật lý'}
                        </span>
                    </td>
                    <td class="p-2">
                        ${ing.supplier_names 
                            ? ing.supplier_names.split(',').map(s => `<span class="inline-block bg-slate-100 text-slate-700 border border-slate-200 text-xs font-medium px-1.5 py-0.5 rounded mr-1 mb-0.5">🏭 ${s.trim()}</span>`).join('')
                            : '<span class="text-gray-400  text-xs">---</span>'}
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
        }

        function clearCostIngredientSearch() {
            const input = document.getElementById('cost-ing-search');
            if (input) input.value = '';
            filterCostIngredientsTable();
            input?.focus();
        }

        let currentBOMStatusFilter = 'ALL'; // 'ALL' | 'HAS_BOM' | 'NO_BOM'

        function setBOMStatusFilter(status) {
            currentBOMStatusFilter = status;

            const btnAll = document.getElementById('btn-bom-filter-all');
            const btnHas = document.getElementById('btn-bom-filter-has');
            const btnNone = document.getElementById('btn-bom-filter-none');

            const activeClass = 'px-2 py-0.5 rounded-md bg-white shadow-2xs font-bold transition';
            const inactiveClass = 'px-2 py-0.5 rounded-md hover:bg-slate-200/60 font-semibold transition';

            if (btnAll) btnAll.className = (status === 'ALL' ? `${activeClass} text-slate-800` : `${inactiveClass} text-slate-600`);
            if (btnHas) btnHas.className = (status === 'HAS_BOM' ? `${activeClass} text-emerald-700` : `${inactiveClass} text-emerald-700`);
            if (btnNone) btnNone.className = (status === 'NO_BOM' ? `${activeClass} text-amber-700` : `${inactiveClass} text-amber-700`);

            filterBOMProductDropdown();
        }
        window.setBOMStatusFilter = setBOMStatusFilter;

        function updateBOMFilterCounts() {
            if (!Array.isArray(allBOMProductsList)) return;
            const total = allBOMProductsList.length;
            const hasCount = allBOMProductsList.filter(p => (p.bom_count || 0) > 0).length;
            const noneCount = total - hasCount;

            const elAll = document.getElementById('bom-filter-count-all');
            if (elAll) elAll.textContent = total;
            const elHas = document.getElementById('bom-filter-count-has');
            if (elHas) elHas.textContent = hasCount;
            const elNone = document.getElementById('bom-filter-count-none');
            if (elNone) elNone.textContent = noneCount;
        }
        window.updateBOMFilterCounts = updateBOMFilterCounts;

        async function loadCostProductOptions() {
            const res = await fetch('/api/products');
            allBOMProductsList = await res.json();
            updateBOMFilterCounts();
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

            updateBOMFilterCounts();

            const filtered = allBOMProductsList.filter(p => {
                // Lọc theo trạng thái BOM
                const hasBOM = (p.bom_count || 0) > 0;
                if (currentBOMStatusFilter === 'HAS_BOM' && !hasBOM) return false;
                if (currentBOMStatusFilter === 'NO_BOM' && hasBOM) return false;

                // Lọc theo từ khóa tìm kiếm
                if (!search) return true;
                const text = `${p.code || ''} ${p.name || ''}`.toLowerCase();
                return text.includes(search);
            });

            if (filtered.length === 0) {
                dd.innerHTML = '<div class="p-3 text-center text-gray-400 ">Không tìm thấy sản phẩm nào trong nhóm này</div>';
                return;
            }

            dd.innerHTML = filtered.map(p => {
                const isChecked = selectedBOMProductIds.includes(p.id);
                const hasBOM = (p.bom_count || 0) > 0;
                const badgeBOM = hasBOM
                    ? `<span class="bg-emerald-50 text-emerald-700 border border-emerald-300 px-1.5 py-0.5 rounded text-xs font-bold shrink-0">⚡ Đã có BOM (${p.bom_count} tp)</span>`
                    : `<span class="bg-amber-50 text-amber-700 border border-amber-200 px-1.5 py-0.5 rounded text-xs font-medium shrink-0">⚪ Chưa có BOM</span>`;

                return `
                    <div class="p-2 hover:bg-sky-50 flex items-center justify-between cursor-pointer transition select-none ${hasBOM ? 'bg-emerald-50/20' : ''}" onclick="toggleSelectBOMProduct(${p.id})">
                        <div class="flex items-center gap-2 min-w-0 pr-2">
                            <input type="checkbox" ${isChecked ? 'checked' : ''} class="rounded pointer-events-none text-sky-600 shrink-0">
                            <div class="min-w-0">
                                <div class="font-bold text-slate-800 truncate">${p.name}</div>
                                <div class="font-mono text-slate-500 text-xs">${p.code || '-'}</div>
                            </div>
                        </div>
                        <div class="flex items-center gap-2 shrink-0">
                            ${badgeBOM}
                            <span class="font-bold text-sky-700 font-mono text-xs">${formatMoney(p.sell_price)}</span>
                        </div>
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
            if (typeof hideBOMQuickSearch === 'function') hideBOMQuickSearch();

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
                container.innerHTML = '<span class="text-xs text-gray-400 ">Chưa chọn sản phẩm nào (Bấm ô tìm kiếm để chọn nhiều sản phẩm)</span>';
                return;
            }

            container.innerHTML = selectedBOMProductIds.map(id => {
                const prod = allBOMProductsList.find(p => p.id === id);
                if (!prod) return '';
                return `
                    <span class="inline-flex items-center gap-1 bg-sky-100 text-sky-800 border border-sky-200 text-xs px-2 py-0.5 rounded-full font-bold">
                        <span>${prod.name}</span>
                        <button onclick="removeSelectedBOMProduct(${id})" class="text-sky-600 hover:text-rose-600 ml-1 font-bold">×</button>
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

                // Đồng bộ bom_count trong allBOMProductsList
                const prodInList = allBOMProductsList.find(p => p.id === productId);
                if (prodInList && currentBOMData) {
                    prodInList.bom_count = (currentBOMData.bom_items || []).length;
                    updateBOMFilterCounts();
                }
                
                document.getElementById('cost-summary-card').classList.remove('hidden');
                document.getElementById('cost-sum-sell').textContent = formatMoney(currentBOMData.sell_price);
                document.getElementById('cost-sum-cost').textContent = formatMoney(currentBOMData.cost_price);
                document.getElementById('cost-sum-margin').textContent = formatMoney(currentBOMData.profit_margin);

                // Cập nhật chi tiết 2 tầng giá vốn (BOM bao bì + Phí xưởng gia công)
                const bomCostEl = document.getElementById('cost-sum-bom');
                if (bomCostEl) {
                    const bomMatCost = currentBOMData.bom_material_cost !== undefined ? currentBOMData.bom_material_cost : currentBOMData.cost_price;
                    bomCostEl.textContent = formatMoney(bomMatCost);
                }
                const oemRowEl = document.getElementById('cost-sum-oem-row');
                const oemCostEl = document.getElementById('cost-sum-oem');
                const oemFactoryEl = document.getElementById('cost-sum-factory-name');
                if (oemRowEl && oemCostEl) {
                    if (currentBOMData.oem_processing_cost && currentBOMData.oem_processing_cost > 0) {
                        oemRowEl.classList.remove('hidden');
                        oemCostEl.textContent = formatMoney(currentBOMData.oem_processing_cost);
                        if (oemFactoryEl) oemFactoryEl.textContent = currentBOMData.oem_factory_name || 'Xưởng gia công';
                    } else {
                        oemRowEl.classList.add('hidden');
                    }
                }

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
                                <span class="text-xs text-gray-500 font-medium">${item.unit}</span>
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

        let currentIngSuppliers = [];
        let selectedIngSupplierIds = [];

        async function populateIngredientSuppliersDropdown(selectedIds = []) {
            try {
                selectedIngSupplierIds = [...selectedIds];
                if (currentIngSuppliers.length === 0) {
                    const res = await fetch('/api/contacts?type=supplier');
                    currentIngSuppliers = await res.json();
                }
                renderIngSuppOptions();
                updateIngSuppTags();
            } catch (e) {
                console.error("populateIngredientSuppliersDropdown error:", e);
            }
        }

        function toggleIngSuppDropdown(e) {
            if (e) e.stopPropagation();
            const popup = document.getElementById('popup-ing-suppliers');
            if (!popup) return;
            const isHidden = popup.classList.contains('hidden');
            if (isHidden) {
                popup.classList.remove('hidden');
                document.getElementById('search-ing-supp')?.focus();
            } else {
                popup.classList.add('hidden');
            }
        }

        function closeIngSuppDropdown() {
            document.getElementById('popup-ing-suppliers')?.classList.add('hidden');
        }

        function filterIngSuppDropdown() {
            const kw = (document.getElementById('search-ing-supp')?.value || '').trim().toLowerCase();
            renderIngSuppOptions(kw);
        }

        function renderIngSuppOptions(keyword = '') {
            const container = document.getElementById('list-ing-supp-options');
            if (!container) return;

            const filtered = currentIngSuppliers.filter(s => {
                if (!keyword) return true;
                const name = (s.name || '').toLowerCase();
                const phone = (s.phone || '').toLowerCase();
                return name.includes(keyword) || phone.includes(keyword);
            });

            if (filtered.length === 0) {
                container.innerHTML = '<div class="p-3 text-center text-gray-400 ">Không tìm thấy nhà cung cấp nào</div>';
                return;
            }

            container.innerHTML = filtered.map(s => {
                const isChecked = selectedIngSupplierIds.includes(s.id);
                return `
                    <label class="flex items-center justify-between p-1.5 hover:bg-emerald-50/70 rounded cursor-pointer transition select-none group">
                        <div class="flex items-center gap-2">
                            <input type="checkbox" value="${s.id}" ${isChecked ? 'checked' : ''} 
                                   onchange="onToggleIngSuppOption(${s.id}, this.checked)"
                                   class="rounded text-emerald-600 focus:ring-emerald-500 w-3.5 h-3.5 cursor-pointer">
                            <span class="font-medium text-slate-800 group-hover:text-emerald-700">${s.name}</span>
                        </div>
                        ${s.phone ? `<span class="text-xs text-gray-400 font-mono">${s.phone}</span>` : ''}
                    </label>
                `;
            }).join('');
        }

        function onToggleIngSuppOption(id, checked) {
            if (checked) {
                if (!selectedIngSupplierIds.includes(id)) selectedIngSupplierIds.push(id);
            } else {
                selectedIngSupplierIds = selectedIngSupplierIds.filter(x => x !== id);
            }
            updateIngSuppTags();
        }

        function removeSelectedIngSupp(id, e) {
            if (e) e.stopPropagation();
            selectedIngSupplierIds = selectedIngSupplierIds.filter(x => x !== id);
            renderIngSuppOptions(document.getElementById('search-ing-supp')?.value || '');
            updateIngSuppTags();
        }

        function selectAllIngSupp(select) {
            if (select) {
                const kw = (document.getElementById('search-ing-supp')?.value || '').trim().toLowerCase();
                const filtered = currentIngSuppliers.filter(s => {
                    if (!kw) return true;
                    return (s.name || '').toLowerCase().includes(kw) || (s.phone || '').toLowerCase().includes(kw);
                });
                filtered.forEach(s => {
                    if (!selectedIngSupplierIds.includes(s.id)) selectedIngSupplierIds.push(s.id);
                });
            } else {
                selectedIngSupplierIds = [];
            }
            renderIngSuppOptions(document.getElementById('search-ing-supp')?.value || '');
            updateIngSuppTags();
        }

        function updateIngSuppTags() {
            const tagsBox = document.getElementById('ing-supp-selected-tags');
            const badgeEl = document.getElementById('ing-supp-count-badge');
            if (!tagsBox) return;

            if (selectedIngSupplierIds.length === 0) {
                tagsBox.innerHTML = '<span class="text-gray-400 ">-- Bấm để chọn nhà cung cấp --</span>';
                if (badgeEl) badgeEl.classList.add('hidden');
                return;
            }

            if (badgeEl) {
                badgeEl.textContent = `${selectedIngSupplierIds.length} đã chọn`;
                badgeEl.classList.remove('hidden');
            }

            tagsBox.innerHTML = selectedIngSupplierIds.map(id => {
                const s = currentIngSuppliers.find(x => x.id === id);
                const name = s ? s.name : `NCC #${id}`;
                return `
                    <span class="inline-flex items-center gap-1 bg-emerald-50 text-emerald-800 border border-emerald-300 px-2 py-0.5 rounded-full text-xs font-medium shadow-xs">
                        <span>🏭 ${name}</span>
                        <button type="button" onclick="removeSelectedIngSupp(${id}, event)" class="hover:text-rose-600 font-bold ml-0.5 text-xs">✕</button>
                    </span>
                `;
            }).join('');
        }

        document.addEventListener('click', function(e) {
            const container = document.getElementById('container-ing-suppliers');
            if (container && !container.contains(e.target)) {
                closeIngSuppDropdown();
            }
        });

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
            document.getElementById('btn-convert-ing-to-product-modal')?.classList.add('hidden');
            populateIngredientSuppliersDropdown([]);
            document.getElementById('modal-ing-stock-group').classList.remove('hidden');
            document.getElementById('modal-ingredient').classList.remove('hidden');
        }

        async function convertCurrentIngredientToProductFromModal() {
            const id = document.getElementById('modal-ing-id').value;
            const name = document.getElementById('modal-ing-name').value.trim();
            if (!id) return;
            if (typeof convertCurrentIngredientToProduct === 'function') {
                closeModalIngredient();
                await convertCurrentIngredientToProduct(id, encodeURIComponent(name));
            }
        }
        window.convertCurrentIngredientToProductFromModal = convertCurrentIngredientToProductFromModal;

        async function openModalEditIngredient(id) {
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

            // Nạp danh sách NCC đã chọn
            let attachedSuppIds = [];
            if (ing.supplier_ids) {
                attachedSuppIds = String(ing.supplier_ids).split(',').map(x => parseInt(x.trim())).filter(x => !isNaN(x));
            } else if (ing.supplier_names) {
                try {
                    const resSupp = await fetch('/api/contacts?type=supplier');
                    const allSupps = await resSupp.json();
                    const suppNames = ing.supplier_names.split(',').map(s => s.trim().toLowerCase());
                    attachedSuppIds = allSupps.filter(s => suppNames.includes(s.name.toLowerCase())).map(s => s.id);
                } catch (e) {}
            }
            populateIngredientSuppliersDropdown(attachedSuppIds);
            
            // Khi sửa thì ẩn ô tồn ban đầu để tránh sai lệch thẻ kho
            document.getElementById('modal-ing-stock-group').classList.add('hidden');
            
            // Hiện nút chuyển thành hàng hóa khi đang chỉnh sửa nguyên liệu
            const btnConv = document.getElementById('btn-convert-ing-to-product-modal');
            if (btnConv) btnConv.classList.remove('hidden');

            document.getElementById('modal-ingredient').classList.remove('hidden');
        }

        function closeModalIngredient() {
            closeIngSuppDropdown();
            document.getElementById('btn-convert-ing-to-product-modal')?.classList.add('hidden');
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
            const supplier_ids = [...selectedIngSupplierIds];

            if (id) {
                // Cập nhật nguyên liệu hiện có
                const payload = {
                    code: code,
                    name: name,
                    unit: unit,
                    type: type,
                    latest_cost: cost,
                    supplier_ids: supplier_ids
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
                    // Đã cập nhật thành công - dùng toast nhẹ nhàng, không chặn modal popup
                    if (window.showToast) {
                        window.showToast('Đã lưu thông tin nguyên liệu!', 'success', 2000);
                    }
                } else {
                    const err = await res.json();
                    const msg = Array.isArray(err.detail) ? err.detail.map(e => e.msg || JSON.stringify(e)).join(', ') : err.detail;
                    alert('Lỗi: ' + (msg || 'Không thể cập nhật nguyên liệu'));
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
                    warehouse_id: 1,
                    supplier_ids: supplier_ids
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
                    const msg = Array.isArray(err.detail) ? err.detail.map(e => e.msg || JSON.stringify(e)).join(', ') : err.detail;
                    alert('Lỗi: ' + (msg || 'Không thể tạo nguyên liệu'));
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
            downloadWithAuth(url, 'Nguyen_Lieu.xlsx');
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
        async function exportBOMExcel() {
            const prodId = getActiveBOMTargetId();
            let url = '/api/bom/export-excel';
            if (prodId) {
                const exportSingle = typeof window.showConfirmModal === 'function'
                    ? await window.showConfirmModal({
                        title: 'Tùy Chọn Xuất Định Lượng BOM',
                        message: 'Bạn có muốn xuất riêng định lượng BOM của sản phẩm đang chọn không?',
                        subMessage: 'Bấm "Chỉ SP Này" để xuất sản phẩm đang chọn, hoặc "Xuất Tất Cả" để xuất toàn bộ BOM.',
                        type: 'primary',
                        confirmText: 'Chỉ SP Này',
                        cancelText: 'Xuất Tất Cả',
                        icon: '📊'
                    })
                    : confirm(`Bạn có muốn xuất riêng định lượng BOM của sản phẩm đang chọn không?\n(Bấm OK để chỉ xuất sản phẩm này, hoặc bấm Cancel để xuất TOÀN BỘ định lượng BOM tất cả sản phẩm)`);
                if (exportSingle) {
                    url += `?product_id=${prodId}`;
                }
            }
            downloadWithAuth(url, 'Dinh_Luong_BOM.xlsx');
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
            statusBox.className = 'text-xs p-2 rounded bg-sky-50 text-sky-800 border border-sky-200 block';
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

        // --- QUICK-SEARCH NGUYÊN LIỆU THẢ THẲNG VÀO BẢNG (KHÔNG CẦN MODAL CHE) ---
        let bomQuickActiveIdx = -1;
        let bomQuickFilteredList = [];

        window.hideBOMQuickSearch = function() {
            const dd = document.getElementById('bom-quick-search-dropdown');
            if (dd) dd.classList.add('hidden');
            bomQuickActiveIdx = -1;
        };

        window.showBOMQuickSearch = function() {
            const dd = document.getElementById('bom-quick-search-dropdown');
            if (dd) dd.classList.remove('hidden');
            window.filterBOMQuickSearch();
        };

        // Tự động đóng dropdown quick-search khi click ra ngoài wrapper
        document.addEventListener('click', function(event) {
            const wrapper = document.getElementById('bom-quick-search-wrapper');
            if (wrapper && !wrapper.contains(event.target)) {
                window.hideBOMQuickSearch();
            }
        });

        window.setBOMQuickActiveItem = function(idx) {
            bomQuickActiveIdx = idx;
            updateBOMQuickHighlight();
        };

        function updateBOMQuickHighlight() {
            const dd = document.getElementById('bom-quick-search-dropdown');
            if (!dd) return;
            const items = dd.querySelectorAll('.bom-quick-search-item');
            items.forEach((el, i) => {
                if (i === bomQuickActiveIdx) {
                    el.classList.add('bg-sky-100', 'ring-1', 'ring-sky-400');
                    el.classList.remove('hover:bg-sky-50');
                    el.scrollIntoView({ block: 'nearest' });
                } else {
                    el.classList.remove('bg-sky-100', 'ring-1', 'ring-sky-400');
                    el.classList.add('hover:bg-sky-50');
                }
            });
        }

        window.handleBOMQuickSearchKeydown = function(e) {
            const dd = document.getElementById('bom-quick-search-dropdown');
            const isHidden = !dd || dd.classList.contains('hidden');

            if (e.key === 'Escape') {
                e.preventDefault();
                window.hideBOMQuickSearch();
                document.getElementById('bom-quick-search-input')?.blur();
                return;
            }

            if (e.key === 'ArrowDown') {
                e.preventDefault();
                if (isHidden) {
                    window.showBOMQuickSearch();
                    return;
                }
                if (bomQuickFilteredList.length > 0) {
                    bomQuickActiveIdx = (bomQuickActiveIdx + 1) % bomQuickFilteredList.length;
                    updateBOMQuickHighlight();
                }
                return;
            }

            if (e.key === 'ArrowUp') {
                e.preventDefault();
                if (isHidden) {
                    window.showBOMQuickSearch();
                    return;
                }
                if (bomQuickFilteredList.length > 0) {
                    bomQuickActiveIdx = (bomQuickActiveIdx - 1 + bomQuickFilteredList.length) % bomQuickFilteredList.length;
                    updateBOMQuickHighlight();
                }
                return;
            }

            if (e.key === 'Enter') {
                if (!isHidden && bomQuickFilteredList.length > 0) {
                    e.preventDefault();
                    const targetIdx = bomQuickActiveIdx >= 0 ? bomQuickActiveIdx : (bomQuickFilteredList.length === 1 ? 0 : -1);
                    if (targetIdx >= 0 && targetIdx < bomQuickFilteredList.length) {
                        window.quickAddBOMIngredient(bomQuickFilteredList[targetIdx].id);
                    }
                }
            }
        };

        window.filterBOMQuickSearch = function() {
            const kw = (document.getElementById('bom-quick-search-input')?.value || '').toLowerCase().trim();
            const dd = document.getElementById('bom-quick-search-dropdown');
            if (!dd) return;

            const list = (typeof costIngredients !== 'undefined' ? costIngredients : []);
            bomQuickFilteredList = list.filter(ing => 
                (ing.code && ing.code.toLowerCase().includes(kw)) || 
                ing.name.toLowerCase().includes(kw)
            );
            bomQuickActiveIdx = -1;

            if (bomQuickFilteredList.length === 0) {
                dd.innerHTML = '<div class="p-3 text-slate-400 text-center font-medium text-xs">Không tìm thấy nguyên liệu nào phù hợp</div>';
                return;
            }

            dd.innerHTML = bomQuickFilteredList.slice(0, 30).map((ing, idx) => `
                <div onclick="quickAddBOMIngredient(${ing.id})" onmouseenter="setBOMQuickActiveItem(${idx})" class="bom-quick-search-item p-2.5 hover:bg-sky-50 cursor-pointer flex justify-between items-center transition group">
                    <div class="flex items-center gap-2">
                        <span class="w-6 h-6 rounded-md bg-slate-100 group-hover:bg-sky-100 text-slate-600 group-hover:text-sky-700 flex items-center justify-center font-bold text-xs">📦</span>
                        <div>
                            <div class="font-bold text-slate-800 group-hover:text-sky-900">${ing.name}</div>
                            <div class="text-xs text-slate-400 font-mono">Mã: ${ing.code || '-'} | ĐVT: <span class="font-bold text-slate-600">${ing.unit}</span></div>
                        </div>
                    </div>
                    <div class="text-right">
                        <span class="px-2 py-0.5 rounded text-xs font-bold ${ing.type === 'SERVICE' ? 'bg-sky-100 text-sky-700' : 'bg-emerald-100 text-emerald-700'}">${ing.type === 'SERVICE' ? 'Dịch vụ' : 'Vật lý'}</span>
                        <div class="text-xs font-bold text-slate-700 mt-0.5">${formatMoney(ing.latest_cost || 0)}</div>
                    </div>
                </div>
            `).join('');
        };

        window.quickAddBOMIngredient = async function(ingId) {
            const targetIds = [...selectedBOMProductIds];
            if (targetIds.length === 0) {
                alert('Vui lòng chọn sản phẩm ở ô bên trên trước khi thêm nguyên liệu!');
                return;
            }

            const ing = (typeof costIngredients !== 'undefined' ? costIngredients : []).find(x => x.id === ingId);
            if (!ing) return;

            let defaultQty = 1.0;
            const ingUnit = (ing.unit || '').toLowerCase();
            if (ingUnit === 'lít' || ingUnit === 'lit' || ingUnit === 'l') {
                defaultQty = 0.25;
            }

            for (const prodId of targetIds) {
                await fetch(`/api/products/${prodId}/bom/${ingId}`, {
                    method: 'PUT',
                    headers: {'Content-Type': 'application/json'},
                    body: JSON.stringify({ quantity: defaultQty })
                });
            }

            const input = document.getElementById('bom-quick-search-input');
            if (input) input.value = '';
            window.hideBOMQuickSearch();

            await loadProductBOMDetails(targetIds[targetIds.length - 1]);
            await loadUnifiedInventory();

            setTimeout(() => {
                const inputs = document.querySelectorAll('#table-product-bom-items input[type="number"]');
                if (inputs.length > 0) {
                    inputs[inputs.length - 1].focus();
                    inputs[inputs.length - 1].select();
                }
            }, 100);
        };

        // --- ✨ TÍNH NĂNG AI GỢI Ý BOM (GEMINI 2.5 FLASH) ---
        let currentAISuggestions = [];

        window.aiSuggestBOM = async function() {
            const prodId = getActiveBOMTargetId();
            if (!prodId) {
                alert('Vui lòng chọn một sản phẩm trước để AI phân tích gợi ý!');
                return;
            }

            const prod = (typeof allProducts !== 'undefined' ? allProducts : []).find(p => p.id === prodId);
            const prodName = prod ? prod.name : 'Sản phẩm đang chọn';

            const modal = document.getElementById('modal-ai-bom-suggest');
            const loading = document.getElementById('ai-bom-loading');
            const resultBox = document.getElementById('ai-bom-result-container');
            const nameEl = document.getElementById('ai-bom-prod-name');

            if (nameEl) nameEl.textContent = prodName;
            if (loading) loading.classList.remove('hidden');
            if (resultBox) resultBox.classList.add('hidden');
            if (modal) modal.classList.remove('hidden');

            try {
                const res = await fetch('/api/ai/suggest-bom', {
                    method: 'POST',
                    headers: {'Content-Type': 'application/json'},
                    body: JSON.stringify({ product_id: prodId })
                });

                if (!res.ok) {
                    const err = await res.json();
                    throw new Error(err.detail || 'Lỗi phân tích AI');
                }

                const data = await res.json();
                currentAISuggestions = data.suggestions || [];

                const badge = document.getElementById('ai-bom-engine-badge');
                if (badge) {
                    if (data.source === 'gemini') {
                        badge.className = 'px-2 py-0.5 rounded-full text-xs font-bold bg-sky-100 text-sky-700 border border-sky-200';
                        badge.textContent = '✨ Gemini 2.5 Flash';
                    } else {
                        badge.className = 'px-2 py-0.5 rounded-full text-xs font-bold bg-emerald-100 text-emerald-700 border border-emerald-200';
                        badge.textContent = '⚡ Heuristic Engine';
                    }
                }

                document.getElementById('ai-bom-item-count').textContent = currentAISuggestions.length;

                const tbody = document.getElementById('ai-bom-suggestions-tbody');
                if (currentAISuggestions.length === 0) {
                    tbody.innerHTML = '<tr><td colspan="4" class="p-6 text-center text-slate-400">Không tìm thấy nguyên liệu nào trong kho khớp với sản phẩm này.</td></tr>';
                } else {
                    tbody.innerHTML = currentAISuggestions.map((item, idx) => `
                        <tr class="hover:bg-sky-50/50 transition">
                            <td class="p-2.5 text-center">
                                <input type="checkbox" id="ai-bom-chk-${idx}" checked class="w-4 h-4 rounded text-sky-600 focus:ring-sky-500">
                            </td>
                            <td class="p-2.5">
                                <div class="font-bold text-slate-800">${item.ingredient_name}</div>
                                <div class="text-xs text-slate-400 font-mono">Mã: ${item.ingredient_code} | Loại: ${item.type === 'SERVICE' ? 'Dịch vụ' : 'Vật lý'}</div>
                            </td>
                            <td class="p-2.5 text-right font-mono">
                                <div class="flex items-center justify-end gap-1">
                                    <input type="number" id="ai-bom-qty-${idx}" step="any" min="0.0001" value="${item.quantity}" class="w-20 border border-slate-300 rounded px-2 py-1 text-right font-bold text-sky-700 bg-white text-xs focus:ring-1 focus:ring-sky-500">
                                    <span class="text-xs font-semibold text-slate-500">${item.unit}</span>
                                </div>
                            </td>
                            <td class="p-2.5 text-slate-600 text-xs">
                                <span class="bg-sky-50 text-sky-700 px-2 py-0.5 rounded-md font-medium text-xs">${item.reason || 'Đề xuất'}</span>
                            </td>
                        </tr>
                    `).join('');
                }

                if (loading) loading.classList.add('hidden');
                if (resultBox) resultBox.classList.remove('hidden');
            } catch (err) {
                if (loading) loading.classList.add('hidden');
                alert('Lỗi gợi ý AI: ' + err.message);
                closeAIBOMSuggestModal();
            }
        };

        window.toggleAllAIBOMChecks = function(checked) {
            currentAISuggestions.forEach((_, idx) => {
                const chk = document.getElementById(`ai-bom-chk-${idx}`);
                if (chk) chk.checked = checked;
            });
        };

        window.closeAIBOMSuggestModal = function() {
            document.getElementById('modal-ai-bom-suggest')?.classList.add('hidden');
        };

        window.applyAIBOMSuggestions = async function() {
            const prodId = getActiveBOMTargetId();
            if (!prodId) return;

            const itemsToApply = [];
            currentAISuggestions.forEach((item, idx) => {
                const chk = document.getElementById(`ai-bom-chk-${idx}`);
                const qtyInput = document.getElementById(`ai-bom-qty-${idx}`);
                if (chk && chk.checked) {
                    const qty = parseFloat(qtyInput?.value || item.quantity);
                    if (qty > 0) {
                        itemsToApply.push({
                            ingredient_id: item.ingredient_id,
                            quantity: qty
                        });
                    }
                }
            });

            if (itemsToApply.length === 0) {
                alert('Vui lòng chọn ít nhất 1 nguyên liệu để áp dụng!');
                return;
            }

            const btn = document.getElementById('btn-apply-ai-bom');
            if (btn) {
                btn.disabled = true;
                btn.innerHTML = '<span>⏳</span> <span>Đang lưu...</span>';
            }

            try {
                let currentItems = (currentBOMData ? currentBOMData.bom_items : []).map(b => ({
                    ingredient_id: b.ingredient_id,
                    quantity: b.quantity
                }));

                itemsToApply.forEach(newItem => {
                    const ex = currentItems.find(x => x.ingredient_id === newItem.ingredient_id);
                    if (ex) {
                        ex.quantity = newItem.quantity;
                    } else {
                        currentItems.push(newItem);
                    }
                });

                const res = await fetch(`/api/products/${prodId}/bom`, {
                    method: 'POST',
                    headers: {'Content-Type': 'application/json'},
                    body: JSON.stringify({ items: currentItems })
                });

                if (res.ok) {
                    closeAIBOMSuggestModal();
                    await loadProductBOMDetails(prodId);
                    await loadUnifiedInventory();
                    alert(`✅ Đã áp dụng thành công ${itemsToApply.length} thành phần BOM!`);
                } else {
                    const err = await res.json();
                    alert('Lỗi áp dụng: ' + (err.detail || 'Không thể lưu BOM'));
                }
            } catch (e) {
                alert('Lỗi mạng: ' + e.message);
            } finally {
                if (btn) {
                    btn.disabled = false;
                    btn.innerHTML = '<span>✅</span> <span>Áp Dụng Vào BOM 1-Chạm</span>';
                }
            }
        };

        // --- 📋 SAO CHÉP BOM TỪ SẢN PHẨM KHÁC ---
        window.openCloneBOMModal = function() {
            const prodId = getActiveBOMTargetId();
            if (!prodId) {
                alert('Vui lòng chọn sản phẩm đích cần cấu hình BOM trước!');
                return;
            }

            const prod = (typeof allProducts !== 'undefined' ? allProducts : []).find(p => p.id === prodId);
            const prodName = prod ? prod.name : 'Sản phẩm đang chọn';
            document.getElementById('clone-target-prod-name').textContent = prodName;

            const select = document.getElementById('clone-source-prod-select');
            if (select) {
                const otherProds = (typeof allProducts !== 'undefined' ? allProducts : []).filter(p => p.id !== prodId);
                select.innerHTML = '<option value="">-- Chọn sản phẩm mẫu --</option>' + 
                    otherProds.map(p => `<option value="${p.id}">${p.name} (${p.code || '-'})</option>`).join('');
            }

            document.getElementById('modal-clone-bom')?.classList.remove('hidden');
        };

        window.closeCloneBOMModal = function() {
            document.getElementById('modal-clone-bom')?.classList.add('hidden');
        };

        window.submitCloneBOM = async function() {
            const targetId = getActiveBOMTargetId();
            const sourceId = parseInt(document.getElementById('clone-source-prod-select')?.value);

            if (!targetId) return;
            if (!sourceId) {
                alert('Vui lòng chọn một sản phẩm mẫu để sao chép!');
                return;
            }

            try {
                const res = await fetch(`/api/products/${targetId}/bom/clone-from/${sourceId}`, {
                    method: 'POST'
                });

                if (res.ok) {
                    closeCloneBOMModal();
                    await loadProductBOMDetails(targetId);
                    await loadUnifiedInventory();
                    alert('✅ Đã sao chép toàn bộ định lượng BOM thành công!');
                } else {
                    const err = await res.json();
                    alert('Lỗi sao chép: ' + (err.detail || 'Không thể sao chép BOM'));
                }
            } catch (e) {
                alert('Lỗi kết nối: ' + e.message);
            }
        };

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
                        <span class="text-xs text-gray-400 font-mono ml-1">(${ing.code || '-'})</span>
                    </div>
                    <div class="text-right">
                        <span class="px-1.5 py-0.5 rounded text-xs font-bold ${ing.type === 'SERVICE' ? 'bg-sky-100 text-sky-700' : 'bg-emerald-100 text-emerald-700'}">${ing.type === 'SERVICE' ? 'Dịch vụ' : 'Vật lý'}</span>
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
            const confirmed = typeof window.showConfirmModal === 'function'
                ? await window.showConfirmModal({
                    title: 'Xóa Thành Phần BOM',
                    message: 'Xóa thành phần này khỏi BOM?',
                    type: 'danger',
                    confirmText: 'Xóa',
                    cancelText: 'Hủy bỏ',
                    icon: '🗑️'
                })
                : confirm('Xóa thành phần này khỏi BOM?');
            if (!confirmed) return;
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

                const suppEl = document.getElementById('ing-detail-suppliers');
                if (suppEl) {
                    if (data.suppliers && data.suppliers.length > 0) {
                        suppEl.innerHTML = data.suppliers.map(s => `<span class="inline-block bg-slate-100 text-slate-700 border border-slate-200 px-1.5 py-0.5 rounded text-xs mr-1">🏭 ${s.name}</span>`).join('');
                    } else {
                        suppEl.textContent = 'Chưa gán';
                    }
                }

                const badge = document.getElementById('ing-detail-badge');
                if (ing.type === 'SERVICE') {
                    badge.textContent = 'Dịch vụ';
                    badge.className = 'px-2 py-0.5 rounded text-xs font-bold bg-sky-100 text-sky-700';
                } else {
                    badge.textContent = 'Vật lý (Tồn kho)';
                    badge.className = 'px-2 py-0.5 rounded text-xs font-bold bg-emerald-100 text-emerald-700';
                }

                // 1. Tồn kho theo từng kho
                const stocksEl = document.getElementById('ing-detail-stocks');
                if (ing.type === 'SERVICE') {
                    stocksEl.innerHTML = '<div class="text-gray-400  py-1">Thành phần Dịch Vụ không lưu trữ tồn kho.</div>';
                } else if (!data.stocks || data.stocks.length === 0) {
                    stocksEl.innerHTML = '<div class="text-gray-400  py-1">Chưa có dữ liệu tồn kho tại các kho.</div>';
                } else {
                    stocksEl.innerHTML = data.stocks.map(s => `
                        <div class="flex justify-between items-center bg-white border p-1.5 rounded text-xs">
                            <div>
                                <span class="font-bold text-slate-800">${s.warehouse_name}</span>
                                <span class="text-gray-400 text-xs ml-1">(${s.warehouse_address || 'Tại shop'})</span>
                            </div>
                            <span class="font-mono font-bold text-sky-700">${s.quantity} ${ing.unit}</span>
                        </div>
                    `).join('');
                }

                // 2. Lịch sử giá nhập theo NCC
                const pricesEl = document.getElementById('ing-detail-prices');
                if (!data.price_history || data.price_history.length === 0) {
                    pricesEl.innerHTML = '<div class="text-gray-400  py-1">Chưa có lịch sử giá nhập.</div>';
                } else {
                    pricesEl.innerHTML = data.price_history.map(p => `
                        <div class="flex justify-between items-center bg-white border p-1.5 rounded text-xs">
                            <div>
                                <span class="font-medium text-slate-800">${p.supplier_name || 'NCC Mặc định / Chưa gán'}</span>
                                <span class="text-gray-400 text-xs ml-1">(${p.effective_date ? p.effective_date.substring(0, 10) : ''})</span>
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
                            ? '<span class="px-1.5 py-0.5 rounded text-xs font-bold bg-rose-100 text-rose-700">🛒 Xuất Bán</span>' 
                            : (isPurchase ? '<span class="px-1.5 py-0.5 rounded text-xs font-bold bg-emerald-100 text-emerald-700">📥 Nhập Hàng</span>' : '<span class="px-1.5 py-0.5 rounded text-xs font-bold bg-sky-100 text-sky-700">✏️ Điều Chỉnh</span>');

                        const qtyDisplay = l.quantity > 0 
                            ? `<span class="text-emerald-600 font-bold">+${l.quantity}</span>` 
                            : `<span class="text-rose-600 font-bold">${l.quantity}</span>`;

                        const refDisplay = l.order_code 
                            ? `<button onclick="viewOrderDetailModal('${l.order_code}')" class="font-mono font-bold text-sky-700 bg-sky-50 hover:bg-sky-100 px-1.5 py-0.5 rounded border border-sky-300 text-xs underline flex items-center gap-1 inline-flex" title="Bấm để xem hóa đơn này">🧾 ${l.order_code}</button>` 
                            : (l.supplier_name ? `<span class="font-medium text-slate-700">🏢 ${l.supplier_name}</span>` : '-');

                        return `
                            <tr class="border-b hover:bg-gray-50">
                                <td class="p-2 text-gray-500 whitespace-nowrap">${formatDateTime(l.created_at) || '-'}</td>
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

        async function handleOrdersExcelUpload(e) {
            const file = e.target.files[0];
            if (!file) return;
            const formData = new FormData();
            formData.append('file', file);
            try {
                if (typeof showToast === 'function') showToast('Đang tải và xử lý file hóa đơn...', 'info');
                const res = await fetch('/api/orders/import-excel', {
                    method: 'POST',
                    body: formData
                });
                const data = await res.json();
                if (!res.ok) throw new Error(data.detail || 'Import thất bại');
                if (typeof showToast === 'function') showToast(data.message || 'Import hóa đơn thành công!', 'success');
                else alert(data.message || 'Import thành công!');
                await loadOrdersList();
            } catch (err) {
                console.error("handleOrdersExcelUpload error:", err);
                if (typeof showToast === 'function') showToast("Lỗi nhập hóa đơn: " + err.message, "error");
                else alert("Lỗi nhập hóa đơn: " + err.message);
            } finally {
                e.target.value = '';
            }
        }
        window.handleOrdersExcelUpload = handleOrdersExcelUpload;

        // --- QUẢN LÝ DANH SÁCH HÓA ĐƠN BÁN HÀNG ---
        let allOrdersData = [];

        function onOrderDatePresetChange(val) {
            const fromInp = document.getElementById('filter-order-from-date');
            const toInp = document.getElementById('filter-order-to-date');
            if (!fromInp || !toInp) return;

            const now = new Date();
            const pad = n => String(n).padStart(2, '0');
            const fmt = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

            if (val === 'all') {
                fromInp.value = '';
                toInp.value = '';
            } else if (val === 'today') {
                fromInp.value = fmt(now);
                toInp.value = fmt(now);
            } else if (val === 'yesterday') {
                const yest = new Date(now.getTime() - 24 * 60 * 60 * 1000);
                fromInp.value = fmt(yest);
                toInp.value = fmt(yest);
            } else if (val === '7days') {
                const d7 = new Date(now.getTime() - 6 * 24 * 60 * 60 * 1000);
                fromInp.value = fmt(d7);
                toInp.value = fmt(now);
            } else if (val === 'this_month') {
                fromInp.value = fmt(new Date(now.getFullYear(), now.getMonth(), 1));
                toInp.value = fmt(now);
            } else if (val === 'last_month') {
                fromInp.value = fmt(new Date(now.getFullYear(), now.getMonth() - 1, 1));
                toInp.value = fmt(new Date(now.getFullYear(), now.getMonth(), 0));
            }
        }
        window.onOrderDatePresetChange = onOrderDatePresetChange;

        async function initOrderFilterDropdowns() {
            // Nạp danh sách nhân viên vào dropdown lọc nếu chưa có
            const staffSelect = document.getElementById('filter-order-staff');
            if (staffSelect && staffSelect.options.length <= 1) {
                try {
                    const res = await fetch('/api/staff');
                    if (res.ok) {
                        const staffList = await res.json();
                        staffList.forEach(s => {
                            const opt = document.createElement('option');
                            opt.value = s.id;
                            opt.textContent = s.name;
                            staffSelect.appendChild(opt);
                        });
                    }
                } catch (e) {
                    console.error("Lỗi nạp staff filter:", e);
                }
            }

            // Nạp danh sách khách hàng vào dropdown lọc nếu chưa có
            const custSelect = document.getElementById('filter-order-customer');
            if (custSelect && custSelect.options.length <= 1) {
                try {
                    const res = await fetch('/api/contacts?type=customer&limit=500');
                    if (res.ok) {
                        const customers = await res.json();
                        customers.forEach(c => {
                            const opt = document.createElement('option');
                            opt.value = c.id;
                            opt.textContent = `${c.name} (${c.phone || 'K-SĐT'})`;
                            custSelect.appendChild(opt);
                        });
                    }
                } catch (e) {
                    console.error("Lỗi nạp customer filter:", e);
                }
            }
        }

        async function loadOrdersList() {
            await initOrderFilterDropdowns();
            await applyOrdersFilters();
        }

        async function applyOrdersFilters() {
            const tbody = document.getElementById('orders-table-body');
            if (!tbody) return;
            tbody.innerHTML = '<tr><td colspan="13" class="p-6 text-center text-gray-400 ">Đang lọc danh sách hóa đơn từ máy chủ...</td></tr>';

            const fromDate = document.getElementById('filter-order-from-date')?.value || '';
            const toDate = document.getElementById('filter-order-to-date')?.value || '';
            const payment = document.getElementById('filter-order-payment')?.value || '';
            const staffId = document.getElementById('filter-order-staff')?.value || '';
            const custId = document.getElementById('filter-order-customer')?.value || '';
            const prodKw = document.getElementById('filter-order-product')?.value || '';
            const debt = document.getElementById('filter-order-debt')?.value || '';
            const term = (document.getElementById('search-orders')?.value || '').trim();

            const params = new URLSearchParams();
            params.append('limit', '300');
            if (fromDate) params.append('from_date', fromDate);
            if (toDate) params.append('to_date', toDate);
            if (payment) params.append('payment_method', payment);
            if (staffId) params.append('staff_id', staffId);
            if (custId) params.append('customer_id', custId);
            if (prodKw) params.append('product_keyword', prodKw);
            if (debt) params.append('debt_status', debt);
            if (term) params.append('query', term);

            try {
                const res = await fetch(`/api/orders?${params.toString()}`);
                if (!res.ok) throw new Error('Không thể tải hóa đơn');
                allOrdersData = await res.json();
                ordersCurrentPage = 1;
                renderOrdersTable(allOrdersData);
            } catch (e) {
                console.error("applyOrdersFilters error:", e);
                tbody.innerHTML = '<tr><td colspan="11" class="p-6 text-center text-red-500 ">Lỗi khi lọc danh sách hóa đơn!</td></tr>';
            }
        }
        window.applyOrdersFilters = applyOrdersFilters;

        function resetOrdersFilters() {
            document.getElementById('filter-order-date-preset').value = 'all';
            document.getElementById('filter-order-from-date').value = '';
            document.getElementById('filter-order-to-date').value = '';
            document.getElementById('filter-order-payment').value = '';
            document.getElementById('filter-order-staff').value = '';
            document.getElementById('filter-order-customer').value = '';
            document.getElementById('filter-order-product').value = '';
            document.getElementById('filter-order-debt').value = '';
            document.getElementById('search-orders').value = '';
            applyOrdersFilters();
        }
        window.resetOrdersFilters = resetOrdersFilters;

        function filterOrdersList() {
            // Khi gõ ô search-orders, gọi lọc trực tiếp
            applyOrdersFilters();
        }

        let ordersCurrentPage = 1;
        let allCachedOrders = [];
        let selectedOrderCodes = new Set();

        function changeOrdersPage(newPage) {
            ordersCurrentPage = newPage;
            renderOrdersTable(allCachedOrders);
        }
        window.changeOrdersPage = changeOrdersPage;

        function renderOrdersTable(orders) {
            const tbody = document.getElementById('orders-table-body');
            allCachedOrders = orders || [];
            const badge = document.getElementById('orders-count-badge');
            if (badge) badge.textContent = `${allCachedOrders.length} hóa đơn`;
            if (!tbody) return;

            if (!allCachedOrders || allCachedOrders.length === 0) {
                tbody.innerHTML = '<tr><td colspan="13" class="p-6 text-center text-gray-400 ">Không có hóa đơn nào</td></tr>';
                const pContainer = document.getElementById('pagination-orders');
                if (pContainer) pContainer.innerHTML = '';
                updateOrdersBulkActionBar();
                return;
            }

            const totalItems = allCachedOrders.length;
            const totalPages = Math.ceil(totalItems / 20) || 1;
            if (ordersCurrentPage > totalPages) ordersCurrentPage = totalPages;
            if (ordersCurrentPage < 1) ordersCurrentPage = 1;
            const pagedOrders = allCachedOrders.slice((ordersCurrentPage - 1) * 20, ordersCurrentPage * 20);

            tbody.innerHTML = pagedOrders.map((ord, idx) => {
                const debt = ord.debt_amount || 0;
                const debtHtml = debt > 0 
                    ? `<span class="text-rose-600 font-bold">${formatMoney(debt)}</span>` 
                    : `<span class="text-emerald-600 font-medium">0 đ</span>`;
                const isChecked = selectedOrderCodes.has(ord.code);

                return `
                    <tr class="card-row card-row-anim text-xs select-none ${isChecked ? 'bg-sky-50/70' : ''}" style="--row-idx: ${idx};">
                        <td class="p-3 text-center">
                            <input type="checkbox" value="${ord.code}" class="order-select-chk rounded text-sky-600 focus:ring-sky-500 cursor-pointer w-4 h-4" onchange="onOrderCheckChange(this)" ${isChecked ? 'checked' : ''}>
                        </td>
                        <td class="p-3 font-mono font-bold text-sky-700 cursor-pointer hover:underline" onclick="viewOrderDetailModal('${ord.code}')">
                            ${ord.code}
                        </td>
                        <td class="p-3 text-gray-500 whitespace-nowrap">${formatDateTime(ord.created_at) || ''}</td>
                        <td class="p-3 font-medium text-slate-800">${ord.customer_name || 'Khách lẻ'}</td>
                        <td class="p-3 text-gray-600">${ord.staff_name || 'Thu ngân'}</td>
                        <td class="p-3 text-slate-700 font-medium whitespace-nowrap">${ord.created_by || ord.staff_name || 'Thu ngân'}</td>
                        <td class="p-3 text-slate-500 whitespace-nowrap">${ord.updated_by ? `${ord.updated_by} <span class="text-xs text-gray-400 block">${formatDateTime(ord.updated_at)}</span>` : '<span class="text-gray-300">---</span>'}</td>
                        <td class="p-3 text-center font-mono font-bold">${ord.item_count || 0}</td>
                        <td class="p-3 text-right font-mono font-bold text-slate-800">${formatMoney(ord.final_amount)}</td>
                        <td class="p-3 text-right font-mono text-gray-500">${formatMoney(ord.discount || 0)}</td>
                        <td class="p-3 text-right font-mono text-emerald-600 font-medium">${formatMoney(ord.paid_amount)}</td>
                        <td class="p-3 text-right font-mono">${debtHtml}</td>
                        <td class="p-3 text-center whitespace-nowrap">
                            <button onclick="viewOrderDetailModal('${ord.code}')" class="px-2 py-1 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded text-xs font-bold mr-1" title="Xem chi tiết">
                                👁️ Xem
                            </button>
                            <button onclick="openModalOrderReturn('${ord.code}')" class="px-2 py-1 bg-emerald-50 hover:bg-emerald-100 text-emerald-700 border border-emerald-200 rounded text-xs font-bold mr-1" title="Đổi / Trả hàng">
                                🔄 Đổi/Trả
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

            if (typeof renderPaginationBar === 'function') {
                renderPaginationBar('pagination-orders', ordersCurrentPage, totalPages, totalItems, 'changeOrdersPage');
            }
            updateOrdersBulkActionBar();
        }

        function onOrderCheckChange(checkboxEl) {
            if (checkboxEl.checked) {
                selectedOrderCodes.add(checkboxEl.value);
            } else {
                selectedOrderCodes.delete(checkboxEl.value);
            }
            const row = checkboxEl.closest('tr');
            if (row) {
                if (checkboxEl.checked) row.classList.add('bg-sky-50/70');
                else row.classList.remove('bg-sky-50/70');
            }
            updateOrdersBulkActionBar();
        }
        window.onOrderCheckChange = onOrderCheckChange;

        function toggleCheckAllOrders(checked) {
            const chks = document.querySelectorAll('.order-select-chk');
            chks.forEach(chk => {
                chk.checked = checked;
                if (checked) selectedOrderCodes.add(chk.value);
                else selectedOrderCodes.delete(chk.value);
                const row = chk.closest('tr');
                if (row) {
                    if (checked) row.classList.add('bg-sky-50/70');
                    else row.classList.remove('bg-sky-50/70');
                }
            });
            updateOrdersBulkActionBar();
        }
        window.toggleCheckAllOrders = toggleCheckAllOrders;

        function clearOrderSelection() {
            selectedOrderCodes.clear();
            const chks = document.querySelectorAll('.order-select-chk');
            chks.forEach(chk => {
                chk.checked = false;
                const row = chk.closest('tr');
                if (row) row.classList.remove('bg-sky-50/70');
            });
            const allChk = document.getElementById('check-all-orders');
            if (allChk) allChk.checked = false;
            updateOrdersBulkActionBar();
        }
        window.clearOrderSelection = clearOrderSelection;

        async function updateOrdersBulkActionBar() {
            const bar = document.getElementById('orders-bulk-action-bar');
            const countEl = document.getElementById('orders-selected-count');
            const count = selectedOrderCodes.size;
            if (countEl) countEl.textContent = count;

            const allChk = document.getElementById('check-all-orders');
            const pageChks = document.querySelectorAll('.order-select-chk');
            if (allChk && pageChks.length > 0) {
                const allChecked = Array.from(pageChks).every(c => c.checked);
                allChk.checked = allChecked;
            } else if (allChk) {
                allChk.checked = false;
            }

            if (!bar) return;
            if (count > 0) {
                bar.classList.remove('hidden');
                // Nạp danh sách nhân viên vào dropdown nếu chưa có
                const sel = document.getElementById('orders-bulk-staff-select');
                if (sel) {
                    if (!allStaff || allStaff.length === 0) {
                        try {
                            const resS = await fetch('/api/staff');
                            if (resS.ok) allStaff = await resS.json();
                        } catch(e) {}
                    }
                    if (sel.options.length <= 1 && allStaff && allStaff.length > 0) {
                        sel.innerHTML = '<option value="">-- Chọn thu ngân mới --</option>' +
                            allStaff.map(s => `<option value="${s.id}">${s.name} (${s.role || 'staff'})</option>`).join('');
                    }
                }
            } else {
                bar.classList.add('hidden');
            }
        }
        window.updateOrdersBulkActionBar = updateOrdersBulkActionBar;

        async function submitBulkUpdateOrderStaff() {
            const count = selectedOrderCodes.size;
            if (count === 0) {
                if (window.showToast) window.showToast('Vui lòng chọn ít nhất 1 hóa đơn để cập nhật!', 'warning');
                else alert('Vui lòng chọn ít nhất 1 hóa đơn để cập nhật!');
                return;
            }

            const sel = document.getElementById('orders-bulk-staff-select');
            const staffId = parseInt(sel?.value);
            if (!staffId) {
                if (window.showToast) window.showToast('Vui lòng chọn thu ngân mới từ danh sách!', 'warning');
                else alert('Vui lòng chọn thu ngân mới từ danh sách!');
                return;
            }

            const staffName = sel.options[sel.selectedIndex]?.text || '';
            const confirmed = typeof window.showConfirmModal === 'function'
                ? await window.showConfirmModal({
                    title: 'Chuyển Thu Ngân Hóa Đơn',
                    message: `Bạn có chắc chắn muốn chuyển ${count} hóa đơn đã chọn sang thu ngân "${staffName}"?`,
                    type: 'primary',
                    confirmText: 'Chuyển Thu Ngân',
                    cancelText: 'Hủy bỏ',
                    icon: '👤'
                })
                : confirm(`Bạn có chắc chắn muốn chuyển ${count} hóa đơn đã chọn sang thu ngân "${staffName}"?`);
            if (!confirmed) return;

            try {
                const res = await fetch('/api/orders/bulk-update-staff', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        order_codes: Array.from(selectedOrderCodes),
                        new_staff_id: staffId
                    })
                });

                if (res.ok) {
                    const data = await res.json();
                    alert(`✅ Đã cập nhật thành công ${data.updated_count || count} hóa đơn sang thu ngân "${data.staff_name || staffName}"!`);
                    clearOrderSelection();
                    if (typeof loadOrdersList === 'function') await loadOrdersList();
                } else {
                    const err = await res.json().catch(() => ({}));
                    alert('Lỗi: ' + (err.detail || 'Không thể cập nhật thu ngân hàng loạt'));
                }
            } catch (e) {
                console.error('submitBulkUpdateOrderStaff error:', e);
                alert('Lỗi kết nối khi cập nhật thu ngân: ' + e.message);
            }
        }
        window.submitBulkUpdateOrderStaff = submitBulkUpdateOrderStaff;

        // --- XEM CHI TIẾT HÓA ĐƠN BÁN HÀNG TỪ LOGS ---
        let currentViewedOrderCode = null;
        window.orderViewOpenedFromHistory = false;

        async function viewOrderDetailModal(orderCode, readOnly = false) {
            window.viewOrderDetailModal = viewOrderDetailModal;
            try {
                const res = await fetch(`/api/orders/${orderCode}`);
                if (!res.ok) return alert(`Không tìm thấy hóa đơn [${orderCode}]!`);
                const ord = await res.json();
                currentViewedOrderCode = orderCode;

                if (readOnly) {
                    document.getElementById('btn-edit-order-from-view')?.classList.add('hidden');
                    document.getElementById('btn-delete-order-from-view')?.classList.add('hidden');
                    document.getElementById('btn-return-order-from-view')?.classList.add('hidden');
                } else {
                    document.getElementById('btn-edit-order-from-view')?.classList.remove('hidden');
                    document.getElementById('btn-delete-order-from-view')?.classList.remove('hidden');
                    document.getElementById('btn-return-order-from-view')?.classList.remove('hidden');
                }

                document.getElementById('view-order-code').textContent = ord.code;
                document.getElementById('view-order-date').textContent = formatDateTime(ord.created_at) || '';
                const custPhoneHtml = ord.customer_phone ? ' (' + (typeof formatMaskedPhone === 'function' ? formatMaskedPhone(ord.customer_phone) : ord.customer_phone) + ')' : '';
                document.getElementById('view-order-cust').innerHTML = (ord.customer_name || 'Khách lẻ') + custPhoneHtml;
                document.getElementById('view-order-staff').textContent = ord.staff_name || 'Thu ngân';

                let prodTotal = 0;
                let svcTotal = 0;

                const tbody = document.getElementById('view-order-items');
                tbody.innerHTML = (ord.items || []).map((item, idx) => {
                    const sub = item.subtotal || ((item.quantity || 0) * (item.price || 0));
                    const isSvc = item.product_type === 'service' || (!item.product_type && item.product_name && /(dịch vụ|vé spa|gói tắm|tiền công)/i.test(item.product_name));
                    if (isSvc) {
                        svcTotal += sub;
                    } else {
                        prodTotal += sub;
                    }
                    const typeBadge = isSvc 
                        ? '<span class="px-1.5 py-0.5 rounded text-xs font-bold bg-sky-100 text-sky-700 mr-1.5 whitespace-nowrap">💆 Dịch vụ</span>'
                        : '<span class="px-1.5 py-0.5 rounded text-xs font-bold bg-blue-100 text-blue-700 mr-1.5 whitespace-nowrap">📦 Sản phẩm</span>';

                    return `
                    <tr class="border-b hover:bg-gray-50">
                        <td class="p-2 text-center text-gray-500">${idx + 1}</td>
                        <td class="p-2 font-medium text-slate-800 flex items-center">
                            ${typeBadge} <span>${item.product_name}</span>
                        </td>
                        <td class="p-2 text-right font-mono font-bold">${item.quantity} ${item.unit || ''}</td>
                        <td class="p-2 text-right font-mono">${formatMoney(item.price)}</td>
                        <td class="p-2 text-right font-mono font-bold text-slate-800">${formatMoney(sub)}</td>
                    </tr>
                    `;
                }).join('');

                const elProdTotal = document.getElementById('view-order-prod-total');
                if (elProdTotal) elProdTotal.textContent = formatMoney(prodTotal);
                const elSvcTotal = document.getElementById('view-order-svc-total');
                if (elSvcTotal) elSvcTotal.textContent = formatMoney(svcTotal);

                const walletDeduct = ord.spa_wallet_deduction || 0;
                const elWalletRow = document.getElementById('view-order-wallet-row');
                const elWalletDeduct = document.getElementById('view-order-wallet-deduct');
                if (elWalletRow && elWalletDeduct) {
                    if (walletDeduct > 0) {
                        elWalletRow.classList.remove('hidden');
                        elWalletDeduct.textContent = `-${formatMoney(walletDeduct)}`;
                    } else {
                        elWalletRow.classList.add('hidden');
                    }
                }

                document.getElementById('view-order-total').textContent = formatMoney(ord.total_amount);
                document.getElementById('view-order-discount').textContent = formatMoney(ord.discount || 0);
                document.getElementById('view-order-final').textContent = formatMoney(ord.final_amount);
                document.getElementById('view-order-paid').textContent = formatMoney(ord.paid_amount);

                const debt = ord.debt_amount || 0;
                const elDebt = document.getElementById('view-order-debt');
                const elDebtRow = document.getElementById('view-order-debt-row');
                const btnPayDebt = document.getElementById('btn-pay-debt-from-view');
                if (elDebt) elDebt.textContent = formatMoney(debt);
                if (elDebtRow) elDebtRow.classList.toggle('hidden', debt <= 0);
                if (btnPayDebt) btnPayDebt.classList.toggle('hidden', debt <= 0 || !ord.customer_id || ord.customer_id === 1);

                const elNote = document.getElementById('view-order-note');
                if (elNote) {
                    elNote.textContent = ord.note ? ord.note : '-';
                }

                const elStatusBadge = document.getElementById('view-order-status-badge');
                if (elStatusBadge) {
                    if (debt > 0) {
                        elStatusBadge.className = 'inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-rose-50 text-rose-700 border border-rose-200';
                        elStatusBadge.innerHTML = `<span class="w-1.5 h-1.5 rounded-full bg-rose-600 animate-pulse"></span> Còn nợ ${formatMoney(debt)}`;
                    } else {
                        elStatusBadge.className = 'inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200';
                        elStatusBadge.innerHTML = `<span class="w-1.5 h-1.5 rounded-full bg-emerald-600"></span> Đã thanh toán đủ`;
                    }
                }

                window.currentViewedOrderObj = ord;
                document.getElementById('modal-order-view').classList.remove('hidden');
            } catch (e) {
                console.error(e);
                alert('Lỗi tải chi tiết đơn hàng!');
            }
        }

        function closeModalOrderView() {
            document.getElementById('modal-order-view').classList.add('hidden');
            currentViewedOrderCode = null;
            document.getElementById('btn-edit-order-from-view')?.classList.remove('hidden');
            document.getElementById('btn-delete-order-from-view')?.classList.remove('hidden');
            document.getElementById('btn-return-order-from-view')?.classList.remove('hidden');
            if (window.orderViewOpenedFromHistory) {
                window.orderViewOpenedFromHistory = false;
                document.getElementById('modal-purchase-history')?.classList.remove('hidden');
            }
        }

        function printCurrentViewedOrder() {
            if (currentViewedOrderCode) {
                const code = currentViewedOrderCode;
                closeModalOrderView();
                closeModalIngredientDetail();
                showPrintModal(code);
            }
        }

        async function payDebtFromCurrentOrderView() {
            const ord = window.currentViewedOrderObj;
            if (!ord || !ord.customer_id) return;
            const debt = ord.debt_amount || 0;
            const code = ord.code;
            const custId = ord.customer_id;
            const ordId = ord.id;
            closeModalOrderView();
            if (typeof openPayDebtModal === 'function') {
                await openPayDebtModal(custId, ordId);
                const amtInput = document.getElementById('pay-debt-amount');
                if (amtInput && debt > 0) amtInput.value = debt;
                const noteInput = document.getElementById('pay-debt-note');
                if (noteInput) noteInput.value = `Thu nợ hóa đơn [${code}]`;
            }
        }
        window.payDebtFromCurrentOrderView = payDebtFromCurrentOrderView;

        // --- ĐỔI / TRẢ HÀNG (ORDER RETURN & EXCHANGE) ---
        let currentReturnOrder = null;
        let currentReturnItems = [];
        let currentExchangeItems = [];
        let returnProductsCache = null;

        async function openModalOrderReturn(orderCode) {
            if (!orderCode) return;
            try {
                const res = await fetch(`/api/pos/orders/${orderCode}/returnable-items`);
                if (!res.ok) {
                    const err = await res.json().catch(() => ({}));
                    const msg = err.detail || 'Không thể lấy thông tin trả hàng cho đơn này!';
                    if (window.showToast) window.showToast(msg, 'warning');
                    else alert(msg);
                    return;
                }
                const data = await res.json();
                currentReturnOrder = data;
                currentReturnItems = (data.items || []).map(it => ({
                    id: it.id,
                    product_id: it.product_id,
                    product_name: it.product_name,
                    product_code: it.product_code || '',
                    unit: it.unit || '',
                    unit_price_net: it.unit_price_net || 0,
                    quantity_bought: it.quantity || 0,
                    quantity_returned: it.quantity_returned || 0,
                    quantity_available: it.quantity_available || 0,
                    return_qty: 0,
                    return_to_stock: 1,
                    reason: ''
                }));
                currentExchangeItems = [];

                const codeEl = document.getElementById('return-modal-order-code');
                if (codeEl) codeEl.textContent = data.order_code;
                const custEl = document.getElementById('return-modal-cust-name');
                if (custEl) custEl.textContent = data.customer_name ? `Khách: ${data.customer_name}` : 'Khách lẻ';

                const noteEl = document.getElementById('return-modal-note');
                if (noteEl) noteEl.value = '';
                const searchInput = document.getElementById('return-search-prod');
                if (searchInput) searchInput.value = '';
                const searchDropdown = document.getElementById('return-search-dropdown');
                if (searchDropdown) searchDropdown.classList.add('hidden');

                renderReturnItems();
                renderExchangeItems();
                updateReturnSummary();

                document.getElementById('modal-order-return-exchange')?.classList.remove('hidden');
            } catch (e) {
                console.error('openModalOrderReturn error:', e);
                if (window.showToast) window.showToast('Lỗi tải dữ liệu đổi trả!', 'error');
                else alert('Lỗi tải dữ liệu đổi trả!');
            }
        }

        function openModalOrderReturnFromView() {
            const code = document.getElementById('view-order-code')?.textContent?.trim();
            if (!code) return;
            closeModalOrderView();
            openModalOrderReturn(code);
        }

        function closeModalOrderReturn() {
            document.getElementById('modal-order-return-exchange')?.classList.add('hidden');
            currentReturnOrder = null;
            currentReturnItems = [];
            currentExchangeItems = [];
        }

        function renderReturnItems() {
            const tbody = document.getElementById('return-items-tbody');
            if (!tbody) return;
            if (!currentReturnItems || currentReturnItems.length === 0) {
                tbody.innerHTML = '<tr><td colspan="5" class="p-4 text-center text-gray-400">Không có món nào trong đơn hàng</td></tr>';
                return;
            }
            tbody.innerHTML = currentReturnItems.map((item, idx) => {
                const canReturn = item.quantity_available > 0;
                const netFmt = (typeof formatMoney === 'function') ? formatMoney(item.unit_price_net) : item.unit_price_net.toLocaleString('vi-VN') + ' đ';
                return `
                    <tr class="hover:bg-slate-50 transition border-b border-slate-100 ${canReturn ? '' : 'opacity-50 bg-slate-50'}">
                        <td class="p-2">
                            <div class="font-bold text-slate-800">${item.product_name}</div>
                            <div class="text-xs text-gray-500">${item.product_code || ''} ${item.unit ? `(${item.unit})` : ''}</div>
                            <input type="text" placeholder="Lý do trả (nếu có)..." value="${item.reason || ''}"
                                   onchange="onReturnItemReasonChange(${idx}, this.value)"
                                   class="w-full text-xs text-slate-600 mt-1 border border-dashed border-slate-200 rounded px-1.5 py-0.5 bg-transparent focus:bg-white focus:border-sky-400 focus:outline-none"
                                   ${canReturn ? '' : 'disabled'}>
                        </td>
                        <td class="p-2 text-right font-mono text-slate-700 whitespace-nowrap">
                            ${netFmt}
                        </td>
                        <td class="p-2 text-center font-mono">
                            <span class="font-bold ${item.quantity_available > 0 ? 'text-emerald-700' : 'text-gray-400'}">${item.quantity_available}</span>
                            <span class="text-xs text-gray-400 block">(Mua ${item.quantity_bought}${item.quantity_returned > 0 ? `, đã trả ${item.quantity_returned}` : ''})</span>
                        </td>
                        <td class="p-2 text-center">
                            <input type="number" min="0" max="${item.quantity_available}" step="any"
                                   value="${item.return_qty}"
                                   oninput="onReturnItemQtyChange(${idx}, this.value)"
                                   class="w-16 px-1.5 py-1 text-center font-mono font-bold text-xs border rounded border-slate-300 focus:ring-1 focus:ring-sky-500 ${item.return_qty > 0 ? 'bg-rose-50 border-rose-300 text-rose-700' : 'bg-white'}"
                                   ${canReturn ? '' : 'disabled'}>
                        </td>
                        <td class="p-2 text-center">
                            <input type="checkbox" ${item.return_to_stock ? 'checked' : ''}
                                   onchange="onReturnItemStockToggle(${idx}, this.checked)"
                                   title="Nhập lại tồn kho"
                                   class="rounded text-sky-600 focus:ring-sky-500 cursor-pointer w-4 h-4"
                                   ${canReturn ? '' : 'disabled'}>
                        </td>
                    </tr>
                `;
            }).join('');
        }

        function onReturnItemQtyChange(idx, val) {
            if (!currentReturnItems[idx]) return;
            let qty = parseFloat(val) || 0;
            if (qty < 0) qty = 0;
            if (qty > currentReturnItems[idx].quantity_available) {
                qty = currentReturnItems[idx].quantity_available;
                if (window.showToast) window.showToast(`Số lượng trả không thể vượt quá khả dụng (${qty})`, 'warning');
            }
            currentReturnItems[idx].return_qty = qty;
            renderReturnItems();
            updateReturnSummary();
        }

        function onReturnItemStockToggle(idx, checked) {
            if (!currentReturnItems[idx]) return;
            currentReturnItems[idx].return_to_stock = checked ? 1 : 0;
        }

        function onReturnItemReasonChange(idx, reason) {
            if (!currentReturnItems[idx]) return;
            currentReturnItems[idx].reason = (reason || '').trim();
        }

        async function loadReturnProductsCache() {
            if (returnProductsCache && returnProductsCache.length > 0) return returnProductsCache;
            try {
                const res = await fetch('/api/products');
                if (res.ok) {
                    returnProductsCache = await res.json();
                    return returnProductsCache;
                }
            } catch (e) {
                console.error('loadReturnProductsCache error:', e);
            }
            return [];
        }

        async function handleReturnSearchInput(query) {
            const dd = document.getElementById('return-search-dropdown');
            const clearBtn = document.getElementById('return-search-clear');
            if (!query || !query.trim()) {
                if (dd) dd.classList.add('hidden');
                if (clearBtn) clearBtn.classList.add('hidden');
                return;
            }
            if (clearBtn) clearBtn.classList.remove('hidden');

            const products = await loadReturnProductsCache();
            const q = query.trim().toLowerCase();
            const matches = products.filter(p => {
                const name = (p.name || '').toLowerCase();
                const code = (p.code || '').toLowerCase();
                return name.includes(q) || code.includes(q);
            }).slice(0, 15);

            if (!dd) return;
            if (matches.length === 0) {
                dd.innerHTML = '<div class="p-3 text-center text-gray-400 text-xs">Không tìm thấy sản phẩm phù hợp</div>';
                dd.classList.remove('hidden');
                return;
            }

            dd.innerHTML = matches.map(p => {
                const priceFmt = (typeof formatMoney === 'function') ? formatMoney(p.sell_price) : (p.sell_price || 0).toLocaleString('vi-VN') + ' đ';
                return `
                    <div class="px-3 py-2 hover:bg-sky-50 cursor-pointer flex justify-between items-center border-b border-slate-100 last:border-b-0"
                         onclick="addExchangeItem(${p.id})">
                        <div>
                            <span class="font-bold text-slate-800">${p.name}</span>
                            <span class="text-xs text-gray-500 ml-1.5 font-mono">(${p.code || ''})</span>
                            <span class="text-xs text-emerald-600 block">Kho: ${p.stock ?? '-'} ${p.unit || ''}</span>
                        </div>
                        <div class="font-mono font-bold text-sky-600 text-right">${priceFmt}</div>
                    </div>
                `;
            }).join('');
            dd.classList.remove('hidden');
        }

        function clearReturnSearch() {
            const input = document.getElementById('return-search-prod');
            if (input) input.value = '';
            const dd = document.getElementById('return-search-dropdown');
            if (dd) dd.classList.add('hidden');
            const clearBtn = document.getElementById('return-search-clear');
            if (clearBtn) clearBtn.classList.add('hidden');
        }

        async function addExchangeItem(productId) {
            const products = await loadReturnProductsCache();
            const prod = products.find(p => p.id === productId);
            if (!prod) return;

            const existing = currentExchangeItems.find(it => it.product_id === productId);
            if (existing) {
                existing.quantity += 1;
            } else {
                currentExchangeItems.push({
                    product_id: prod.id,
                    name: prod.name,
                    code: prod.code || '',
                    unit: prod.unit || '',
                    price: prod.sell_price || 0,
                    quantity: 1
                });
            }

            clearReturnSearch();
            renderExchangeItems();
            updateReturnSummary();
        }

        function onExchangeItemQtyChange(idx, val) {
            if (!currentExchangeItems[idx]) return;
            let qty = parseFloat(val) || 0;
            if (qty <= 0) {
                removeExchangeItem(idx);
                return;
            }
            currentExchangeItems[idx].quantity = qty;
            renderExchangeItems();
            updateReturnSummary();
        }

        function removeExchangeItem(idx) {
            currentExchangeItems.splice(idx, 1);
            renderExchangeItems();
            updateReturnSummary();
        }

        function renderExchangeItems() {
            const tbody = document.getElementById('exchange-items-tbody');
            if (!tbody) return;
            if (!currentExchangeItems || currentExchangeItems.length === 0) {
                tbody.innerHTML = '<tr><td colspan="5" class="p-4 text-center text-gray-400">Chưa chọn món đổi mới nào</td></tr>';
                return;
            }
            tbody.innerHTML = currentExchangeItems.map((item, idx) => {
                const subtotal = item.quantity * item.price;
                const priceFmt = (typeof formatMoney === 'function') ? formatMoney(item.price) : (item.price || 0).toLocaleString('vi-VN') + ' đ';
                const subFmt = (typeof formatMoney === 'function') ? formatMoney(subtotal) : subtotal.toLocaleString('vi-VN') + ' đ';
                return `
                    <tr class="hover:bg-slate-50 transition border-b border-slate-100">
                        <td class="p-2">
                            <div class="font-bold text-slate-800">${item.name}</div>
                            <div class="text-xs text-gray-500">${item.code || ''} ${item.unit ? `(${item.unit})` : ''}</div>
                        </td>
                        <td class="p-2 text-right font-mono text-slate-700 whitespace-nowrap">
                            ${priceFmt}
                        </td>
                        <td class="p-2 text-center">
                            <input type="number" min="0.1" step="any" value="${item.quantity}"
                                   oninput="onExchangeItemQtyChange(${idx}, this.value)"
                                   class="w-14 px-1.5 py-1 text-center font-mono font-bold text-xs border rounded border-slate-300 focus:ring-1 focus:ring-sky-500 bg-white">
                        </td>
                        <td class="p-2 text-right font-mono font-bold text-emerald-700 whitespace-nowrap">
                            ${subFmt}
                        </td>
                        <td class="p-2 text-center">
                            <button type="button" onclick="removeExchangeItem(${idx})" class="text-rose-500 hover:text-rose-700 font-bold text-sm px-1 leading-none" title="Xóa món này">&times;</button>
                        </td>
                    </tr>
                `;
            }).join('');
        }

        function updateReturnSummary() {
            const returnTotal = currentReturnItems.reduce((acc, it) => acc + ((it.return_qty || 0) * (it.unit_price_net || 0)), 0);
            const exchangeTotal = currentExchangeItems.reduce((acc, it) => acc + ((it.quantity || 0) * (it.price || 0)), 0);
            const diff = exchangeTotal - returnTotal;

            const elRefund = document.getElementById('return-modal-refund-total');
            if (elRefund) elRefund.textContent = (typeof formatMoney === 'function') ? formatMoney(returnTotal) : returnTotal.toLocaleString('vi-VN') + ' đ';

            const elExchange = document.getElementById('return-modal-exchange-total');
            if (elExchange) elExchange.textContent = (typeof formatMoney === 'function') ? formatMoney(exchangeTotal) : exchangeTotal.toLocaleString('vi-VN') + ' đ';

            const elDiff = document.getElementById('return-modal-diff-amount');
            const elLabel = document.getElementById('return-modal-diff-label');
            const elDesc = document.getElementById('return-modal-diff-desc');
            const elIcon = document.getElementById('return-modal-diff-icon');
            const box = document.getElementById('return-modal-diff-box');

            if (diff > 0) {
                if (elLabel) elLabel.textContent = 'Khách cần thanh toán thêm:';
                if (elDesc) elDesc.textContent = 'Khoản thu thêm sẽ được hạch toán vào sổ quỹ';
                if (elIcon) elIcon.textContent = '📥';
                if (elDiff) {
                    elDiff.textContent = '+' + ((typeof formatMoney === 'function') ? formatMoney(diff) : diff.toLocaleString('vi-VN') + ' đ');
                    elDiff.className = 'font-mono text-base font-bold text-emerald-700';
                }
                if (box) {
                    box.className = 'flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 p-2.5 rounded-xl border border-emerald-300 bg-emerald-50/70';
                }
            } else if (diff < 0) {
                const absDiff = Math.abs(diff);
                if (elLabel) elLabel.textContent = 'Cửa hàng cần hoàn lại cho khách:';
                if (elDesc) elDesc.textContent = 'Khoản hoàn trả sẽ được hạch toán phiếu chi hoặc giảm nợ / hoàn ví';
                if (elIcon) elIcon.textContent = '📤';
                if (elDiff) {
                    elDiff.textContent = '-' + ((typeof formatMoney === 'function') ? formatMoney(absDiff) : absDiff.toLocaleString('vi-VN') + ' đ');
                    elDiff.className = 'font-mono text-base font-bold text-rose-600';
                }
                if (box) {
                    box.className = 'flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 p-2.5 rounded-xl border border-rose-300 bg-rose-50/70';
                }
            } else {
                if (elLabel) elLabel.textContent = 'Chênh lệch bù trừ:';
                if (elDesc) elDesc.textContent = 'Đổi ngang giá';
                if (elIcon) elIcon.textContent = '⚖️';
                if (elDiff) {
                    elDiff.textContent = '0 đ';
                    elDiff.className = 'font-mono text-base font-bold text-slate-800';
                }
                if (box) {
                    box.className = 'flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 p-2.5 rounded-xl border border-slate-200 bg-white';
                }
            }
        }

        // Hoàn / thu chênh lệch bằng chuyển khoản -> phải chọn tài khoản (không thêm thẻ vào đổi/trả)
        function syncReturnAccountRow() {
            const m = document.getElementById('return-modal-payment-method')?.value || 'cash';
            const wrap = document.getElementById('return-modal-account-wrap');
            const sel = document.getElementById('return-modal-account');
            if (!wrap || !sel || !window.PayAcc) return;
            const need = m === 'transfer';
            wrap.classList.toggle('hidden', !need);
            if (need) PayAcc.load().then(() => PayAcc.fill(sel, 'transfer'));
        }
        window.syncReturnAccountRow = syncReturnAccountRow;
        document.addEventListener('change', e => { if (e.target && e.target.id === 'return-modal-payment-method') syncReturnAccountRow(); });

        async function submitOrderReturn() {
            if (!currentReturnOrder) return;
            const selectedReturns = currentReturnItems.filter(it => (it.return_qty || 0) > 0);
            if (selectedReturns.length === 0) {
                if (window.showToast) window.showToast('Vui lòng nhập số lượng trả cho ít nhất 1 sản phẩm!', 'warning');
                else alert('Vui lòng nhập số lượng trả cho ít nhất 1 sản phẩm!');
                return;
            }

            const payload = {
                original_order_id: currentReturnOrder.order_id,
                return_items: selectedReturns.map(it => ({
                    product_id: it.product_id,
                    original_item_id: it.id,
                    quantity: it.return_qty,
                    return_price: it.unit_price_net,
                    return_to_stock: it.return_to_stock ? 1 : 0,
                    reason: it.reason || ''
                })),
                exchange_items: currentExchangeItems.map(it => ({
                    product_id: it.product_id,
                    quantity: it.quantity,
                    price: it.price
                })),
                refund_method: document.getElementById('return-modal-payment-method')?.value || 'cash',
                account_id: (window.PayAcc ? PayAcc.value(document.getElementById('return-modal-payment-method')?.value || 'cash', document.getElementById('return-modal-account')) : null),
                note: document.getElementById('return-modal-note')?.value?.trim() || ''
            };

            const _rm = payload.refund_method;
            if (window.PayAcc && (_rm === 'transfer') && ((payload.return_items.length && true))) {
                const _err = PayAcc.validate(_rm, payload.account_id);
                if (_err) { alert(_err); return; }
            }
            const btnSubmit = document.getElementById('btn-submit-order-return');
            if (btnSubmit) {
                btnSubmit.disabled = true;
                btnSubmit.innerHTML = '<span>⏳</span> Đang xử lý...';
            }

            try {
                const res = await fetch('/api/pos/returns', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(payload)
                });

                if (!res.ok) {
                    const err = await res.json().catch(() => ({}));
                    throw new Error(err.detail || 'Lỗi khi tạo phiếu đổi trả!');
                }

                const data = await res.json();
                if (window.showToast) {
                    window.showToast(`✅ Đã lập phiếu đổi/trả [${data.code}] thành công!`, 'success', 3500);
                } else {
                    alert(`Đã lập phiếu đổi/trả [${data.code}] thành công!`);
                }

                closeModalOrderReturn();

                if (typeof loadOrdersList === 'function') {
                    await loadOrdersList();
                } else if (typeof loadOrders === 'function') {
                    await loadOrders();
                }
            } catch (err) {
                console.error('submitOrderReturn error:', err);
                if (window.showToast) window.showToast(`❌ ${err.message}`, 'error');
                else alert(`Lỗi: ${err.message}`);
            } finally {
                if (btnSubmit) {
                    btnSubmit.disabled = false;
                    btnSubmit.innerHTML = '<span>✅</span> Xác Nhận Đổi / Trả';
                }
            }
        }

        window.openModalOrderReturn = openModalOrderReturn;
        window.openModalOrderReturnFromView = openModalOrderReturnFromView;
        window.closeModalOrderReturn = closeModalOrderReturn;
        window.onReturnItemQtyChange = onReturnItemQtyChange;
        window.onReturnItemStockToggle = onReturnItemStockToggle;
        window.onReturnItemReasonChange = onReturnItemReasonChange;
        window.handleReturnSearchInput = handleReturnSearchInput;
        window.clearReturnSearch = clearReturnSearch;
        window.addExchangeItem = addExchangeItem;
        window.onExchangeItemQtyChange = onExchangeItemQtyChange;
        window.removeExchangeItem = removeExchangeItem;
        window.submitOrderReturn = submitOrderReturn;

        // --- XÓA / SỬA ĐƠN HÀNG ---
        async function deleteOrder(code) {
            let confirmed = false;
            if (typeof window.showConfirmModal === 'function') {
                confirmed = await window.showConfirmModal({
                    title: `Xác nhận HỦY / XÓA Hóa Đơn: ${code}`,
                    message: `Bạn có chắc chắn muốn xóa hóa đơn này khỏi hệ thống không?`,
                    subMessage: `
                        • 📦 Tồn kho sản phẩm & nguyên liệu định lượng BOM sẽ được hoàn trả lại kho.<br>
                        • 💳 Tiền trừ Ví Spa (nếu có) sẽ được hoàn trả lại số dư cho khách.<br>
                        • 🏆 Điểm thưởng tích lũy của đơn hàng sẽ bị thu hồi (và tự động hạ hạng nếu dưới ngưỡng).<br>
                        • 💵 Bản ghi thu tiền tương ứng trong sổ quỹ tiền mặt sẽ bị xóa bỏ.
                    `,
                    confirmText: '🔴 Xác nhận Hủy Đơn',
                    cancelText: 'Bỏ qua',
                    type: 'danger',
                    icon: '🗑️'
                });
            } else {
                confirmed = confirm(`Bạn có chắc chắn muốn XÓA / HỦY hóa đơn [${code}]?\n- Hàng hóa & nguyên liệu BOM sẽ được hoàn trả lại kho.\n- Tiền ví Spa (nếu có) sẽ được hoàn lại.\n- Điểm tích lũy sẽ được thu hồi.\n- Bản ghi sổ quỹ sẽ bị xóa.`);
            }

            if (!confirmed) return;

            try {
                const res = await fetch(`/api/orders/${code}`, { method: 'DELETE' });
                if (res.ok) {
                    if (window.showToast) {
                        window.showToast(`✅ Đã hủy thành công hóa đơn [${code}]!`, 'success', 3500);
                    } else {
                        alert(`Đã xóa hóa đơn [${code}] thành công!`);
                    }
                    await loadOrdersList();
                } else {
                    const err = await res.json();
                    if (window.showToast) {
                        window.showToast("❌ Lỗi khi xóa: " + (err.detail || "Không thể xóa đơn"), 'error');
                    } else {
                        alert("Lỗi khi xóa: " + (err.detail || "Không thể xóa đơn"));
                    }
                }
            } catch (e) {
                console.error("deleteOrder error:", e);
                if (window.showToast) {
                    window.showToast("❌ Lỗi kết nối khi xóa đơn hàng!", 'error');
                } else {
                    alert("Lỗi kết nối khi xóa đơn hàng!");
                }
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
                if (custSelect) {
                    if (!allContacts || allContacts.length === 0) {
                        try {
                            const cRes = await fetch('/api/contacts?type=customer');
                            if (cRes.ok) allContacts = await cRes.json();
                        } catch(e) {}
                    }
                    const customers = (allContacts || []).filter(c => c.type === 'customer' || !c.type);
                    custSelect.innerHTML = customers.map(c => `
                        <option value="${c.id}" ${c.id === editingOrderData.customer_id ? 'selected' : ''}>${c.name} ${c.phone ? '(' + c.phone + ')' : ''}</option>
                    `).join('');
                }

                // Populate staff options
                const staffSelect = document.getElementById('edit-order-staff');
                if (staffSelect) {
                    if (!allStaff || allStaff.length === 0) {
                        try {
                            const sRes = await fetch('/api/staff');
                            if (sRes.ok) allStaff = await sRes.json();
                        } catch(e) {}
                    }
                    staffSelect.innerHTML = (allStaff || []).map(s => `
                        <option value="${s.id}" ${s.id === editingOrderData.staff_id ? 'selected' : ''}>${s.name}</option>
                    `).join('');
                }

                document.getElementById('edit-order-discount').value = editingOrderData.discount || 0;
                document.getElementById('edit-order-paid').value = editingOrderData.paid_amount || 0;
                document.getElementById('edit-order-note').value = editingOrderData.note || '';

                renderEditOrderItemsTable();
                calcEditOrderTotals();

                document.getElementById('modal-order-edit').classList.remove('hidden');
            } catch (e) {
                console.error("openModalEditOrder error:", e);
                alert("Lỗi khi mở form sửa đơn: " + (e.message || e));
            }
        }
        window.openModalEditOrder = openModalEditOrder;

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

            tbody.innerHTML = editingOrderData.items.map((item, idx) => {
                const isSvc = item.product_type === 'service' || (!item.product_type && item.product_name && /(dịch vụ|vé spa|gói tắm|tiền công)/i.test(item.product_name));
                const typeBadge = isSvc 
                    ? '<span class="px-1.5 py-0.5 rounded text-xs font-bold bg-sky-100 text-sky-700 mr-1.5 whitespace-nowrap">💆 Dịch vụ</span>'
                    : '<span class="px-1.5 py-0.5 rounded text-xs font-bold bg-blue-100 text-blue-700 mr-1.5 whitespace-nowrap">📦 Sản phẩm</span>';

                return `
                <tr class="border-b hover:bg-slate-50">
                    <td class="p-2 font-medium text-slate-800 flex items-center">
                        ${typeBadge} <span>${item.product_name}</span>
                    </td>
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
                `;
            }).join('');
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
            let prodTotal = 0;
            let svcTotal = 0;

            editingOrderData.items.forEach(it => {
                const sub = (parseFloat(it.quantity) || 0) * (parseFloat(it.price) || 0);
                const isSvc = it.product_type === 'service' || (!it.product_type && it.product_name && /(dịch vụ|vé spa|gói tắm|tiền công)/i.test(it.product_name));
                if (isSvc) {
                    svcTotal += sub;
                } else {
                    prodTotal += sub;
                }
            });

            const total = prodTotal + svcTotal;
            const discount = parseFloat(document.getElementById('edit-order-discount').value) || 0;

            // Khấu trừ ví Spa chỉ cho phép áp dụng trên tiền dịch vụ Spa
            const rawWalletDeduct = editingOrderData.spa_wallet_deduction || 0;
            const walletDeduct = Math.min(rawWalletDeduct, svcTotal);

            // Tiền mặt / Chuyển khoản phải trả = Tiền sản phẩm + Tiền dịch vụ còn lại sau trừ ví - Giảm giá
            const cashPayable = Math.max(0, prodTotal + Math.max(0, svcTotal - walletDeduct) - discount);
            const paid = parseFloat(document.getElementById('edit-order-paid').value) || 0;
            const debt = Math.max(0, cashPayable - paid);

            const elProdTotal = document.getElementById('edit-order-prod-total');
            if (elProdTotal) elProdTotal.textContent = formatMoney(prodTotal);
            const elSvcTotal = document.getElementById('edit-order-svc-total');
            if (elSvcTotal) elSvcTotal.textContent = formatMoney(svcTotal);

            const elWalletRow = document.getElementById('edit-order-wallet-row');
            const elWalletDeduct = document.getElementById('edit-order-wallet-deduct');
            if (elWalletRow && elWalletDeduct) {
                if (walletDeduct > 0) {
                    elWalletRow.classList.remove('hidden');
                    elWalletDeduct.textContent = `-${formatMoney(walletDeduct)}`;
                } else {
                    elWalletRow.classList.add('hidden');
                }
            }

            document.getElementById('edit-order-total').textContent = formatMoney(total);
            document.getElementById('edit-order-final').textContent = formatMoney(cashPayable);
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
        window.openModalEditOrderFromView = openModalEditOrderFromView;
        window.closeModalEditOrder = closeModalEditOrder;
        window.saveEditOrder = saveEditOrder;

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
            logo: { zone: "header", type: "logo", label: "Logo Cửa Hàng", w: 140, h: 65, align: "center" },
            header_store_info: { zone: "header", type: "header_store_info", label: "Thông Tin Shop (Cùng Hàng Logo)", w: 580, fsz: 11, align: "left" },
            shop_name: { zone: "header", type: "text", text: "{{ten_cua_hang}}", label: "Tên Cửa Hàng", fsz: 16, bold: true, align: "left", w: 580 },
            shop_address: { zone: "header", type: "text", text: "Địa chỉ: {{dia_chi}}", label: "Địa Chỉ", fsz: 10, bold: false, align: "left", w: 580 },
            shop_phone: { zone: "header", type: "text", text: "Hotline: {{so_dien_thoai}}", label: "SĐT Shop", fsz: 10, bold: false, align: "left", w: 250 },
            title: { zone: "header", type: "text", text: "HÓA ĐƠN BÁN HÀNG", label: "Tiêu Đề", fsz: 18, bold: true, align: "center", w: 734 },
            order_code: { zone: "header", type: "text", text: "Mã hóa đơn: {{ma_hoa_don}}", label: "Mã Đơn / Mã Phiếu", fsz: 10, bold: false, align: "left", w: 250 },
            datetime: { zone: "header", type: "text", text: "Ngày lập: {{ngay_gio}}", label: "Thời Gian", fsz: 10, bold: false, align: "right", w: 250 },
            staff: { zone: "header", type: "text", text: "Thu ngân: {{thu_ngan}}", label: "Thu Ngân / Người Lập", fsz: 10, bold: false, align: "right", w: 250 },
            customer: { zone: "header", type: "text", text: "Khách hàng: {{ten_khach}}", label: "Khách Hàng / Đối Tác", fsz: 10, bold: false, align: "left", w: 450 },
            customer_phone: { zone: "header", type: "text", text: "SĐT: {{sdt_khach}}", label: "SĐT Khách", fsz: 10, bold: false, align: "left", w: 200 },
            customer_address: { zone: "header", type: "text", text: "Địa chỉ: {{dia_chi_khach}}", label: "Địa Chỉ Khách Hàng", fsz: 10, bold: false, align: "left", w: 550 },
            // Pet Spa
            pet_info: { zone: "header", type: "text", text: "🐾 Bé: {{ten_thu_cung}} - {{giong_loai}} ({{can_nang}}kg)", label: "Thông Tin Thú Cưng", fsz: 11, bold: true, align: "left", w: 580 },
            intake_condition: { zone: "header", type: "text", text: "Tình trạng nhận: {{tinh_trang_tiep_nhan}}", label: "Tình Trạng Tiếp Nhận", fsz: 10, bold: false, align: "left", w: 580 },
            return_time: { zone: "footer", type: "text", text: "HẸN TRẢ: {{gio_hen_tra}}", label: "Giờ Hẹn Trả Bé", fsz: 12, bold: true, align: "center", w: 300 },
            pet_signature: { zone: "footer", type: "text", text: "(Chữ ký khách gửi bé)", label: "Chữ Ký Gửi Bé", fsz: 10, italic: true, align: "center", w: 250 },
            // Cashbook (Sổ Quỹ)
            cashbook_category: { zone: "header", type: "text", text: "Hạng mục: {{hang_muc}}", label: "Hạng Mục Thu/Chi", fsz: 10, bold: false, align: "left", w: 450 },
            cashbook_fund: { zone: "header", type: "text", text: "Két / Quỹ: {{tai_khoan_quy}}", label: "Quỹ / Tài Khoản", fsz: 10, bold: false, align: "left", w: 450 },
            cashbook_amount: { zone: "body", type: "text", text: "SỐ TIỀN: {{so_tien}}", label: "Số Tiền Thu/Chi", fsz: 16, bold: true, align: "center", w: 500 },
            cashbook_reason: { zone: "body", type: "text", text: "Diễn giải: {{dien_giai}}", label: "Diễn Giải Thu/Chi", fsz: 11, italic: true, align: "left", w: 650 },
            signatures_cashbook: { zone: "footer", type: "signatures_cashbook", label: "2 Chữ Ký Nộp/Nhận - Lập Phiếu", w: 734, h: 80 },
            signatures_accounting_4col: { zone: "footer", type: "signatures_accounting_4col", label: "4 Chữ Ký Kế Toán (GĐ - KTT - Nộp/Nhận - Thủ quỹ)", w: 734, h: 90 },
            // Stock Audit (Kiểm Kê Kho)
            audit_warehouse: { zone: "header", type: "text", text: "Kho kiểm kê: {{kho_kiem_ke}}", label: "Kho Kiểm Kê", fsz: 11, bold: true, align: "left", w: 450 },
            table_audit: { zone: "body", type: "table_audit", label: "Bảng 7 Cột Kiểm Kê Kho", w: 734, fsz: 10 },
            audit_summary: { zone: "footer", type: "text", text: "Tổng kiểm: {{tong_mon_kiem}} món | Lệch thừa: {{lech_thua}} | Lệch thiếu: {{lech_thieu}}", label: "Tổng Kết Kiểm Kê", fsz: 11, bold: true, align: "right", w: 650 },
            signatures_audit: { zone: "footer", type: "signatures_audit", label: "3 Chữ Ký Ban Kiểm Kê", w: 734, h: 85 },
            // Bảng & Thanh toán
            table: { zone: "body", type: "table", label: "Bảng Danh Sách Món (4 Cột)", w: 734, fsz: 11, border: "dashed" },
            table_b2b: { zone: "body", type: "table_b2b", label: "Bảng 9 Cột B2B/Đại Lý", w: 734, fsz: 10 },
            b2b_footer_boxes: { zone: "footer", type: "b2b_footer_boxes", label: "3 Ô Chân Trang (Bank - QR - Tổng kết)", w: 734, h: 140 },
            signatures_3col: { zone: "footer", type: "signatures_3col", label: "3 Cột Chữ Ký (Kế toán - Thủ kho - Người nhận)", w: 734, h: 90 },
            total: { zone: "footer", type: "text", text: "Tổng tiền hàng: {{tong_tien}}", label: "Tổng Tiền", fsz: 12, bold: false, align: "right", w: 280 },
            discount: { zone: "footer", type: "text", text: "Giảm giá: -{{giam_gia}}", label: "Giảm Giá", fsz: 11, bold: false, align: "right", w: 270 },
            shipping_fee: { zone: "footer", type: "text", text: "Phí giao hàng: +{{phi_ship}}", label: "Phí Giao Hàng", fsz: 11, bold: false, align: "right", w: 270 },
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
                { id: "e8_addr", catalog_key: "customer_address", zone: "header", type: "text", text: "Địa chỉ: {{dia_chi_khach}}", label: "Địa Chỉ Khách", x: startX, y: 163, w: isLandscape ? 550 : 460, fsz: 9.5, bold: false, align: "left" },
                { id: "e9", catalog_key: "staff", zone: "header", type: "text", text: "Nhân viên kinh doanh: {{thu_ngan}}", label: "Thu Ngân", x: rightX, y: 147, w: 260, fsz: 10, bold: false, align: "right" },
                { id: "e10", catalog_key: "table_b2b", zone: "body", type: "table_b2b", label: "Bảng 9 Cột B2B/Đại Lý", x: startX, y: 180, w: totalW, fsz: 10 },
                { id: "e11", catalog_key: "b2b_footer_boxes", zone: "footer", type: "b2b_footer_boxes", label: "3 Ô Chân Trang (Bank - QR - Tổng kết)", x: startX, y: 325, w: totalW, h: 140 },
                { id: "e12", catalog_key: "signatures_3col", zone: "footer", type: "signatures_3col", label: "3 Cột Chữ Ký (Kế toán - Thủ kho - Người nhận)", x: startX, y: 480, w: totalW, h: 90 },
                { id: "e13", catalog_key: "footer_msg", zone: "footer", type: "text", text: "{{loi_cam_on}}", label: "Lời Cảm Ơn", x: startX, y: 585, w: totalW, fsz: 10, italic: true, align: "center" }
            ];
        }

        function getSpaIntakeElementsK80() {
            return [
                { id: "e1", catalog_key: "shop_name", zone: "header", type: "text", text: "🐾 {{ten_cua_hang}}", label: "Tên Cửa Hàng", x: 10, y: 10, w: 270, fsz: 14, bold: true, align: "center" },
                { id: "e2", catalog_key: "title", zone: "header", type: "text", text: "PHIẾU TIẾP NHẬN THÚ CƯNG", label: "Tiêu Đề", x: 10, y: 32, w: 270, fsz: 13, bold: true, align: "center" },
                { id: "e3", catalog_key: "order_code", zone: "header", type: "text", text: "Mã: {{ma_hoa_don}} | Giờ: {{ngay_gio}}", label: "Mã & Giờ Nhận", x: 10, y: 52, w: 270, fsz: 10, bold: false, align: "center" },
                { id: "e4", catalog_key: "customer", zone: "header", type: "text", text: "Khách: {{ten_khach}} - {{sdt_khach}}", label: "Khách Hàng", x: 10, y: 72, w: 270, fsz: 11, bold: true, align: "left" },
                { id: "e5", catalog_key: "pet_info", zone: "header", type: "text", text: "Bé: {{ten_thu_cung}} ({{giong_loai}}) - {{can_nang}}kg", label: "Thông Tin Thú Cưng", x: 10, y: 92, w: 270, fsz: 11, bold: true, align: "left" },
                { id: "e6", catalog_key: "intake_condition", zone: "header", type: "text", text: "Tình trạng nhận: {{tinh_trang_tiep_nhan}}", label: "Tình Trạng Tiếp Nhận", x: 10, y: 112, w: 270, fsz: 10, bold: false, align: "left" },
                { id: "e7", catalog_key: "table", zone: "body", type: "table", label: "Dịch Vụ Yêu Cầu", x: 10, y: 135, w: 270, fsz: 10 },
                { id: "e8", catalog_key: "return_time", zone: "footer", type: "text", text: "HẸN TRẢ: {{gio_hen_tra}}", label: "Giờ Hẹn Trả Bé", x: 10, y: 200, w: 270, fsz: 12, bold: true, align: "center" },
                { id: "e9", catalog_key: "footer_msg", zone: "footer", type: "text", text: "Quý khách vui lòng kiểm tra bé trước khi rời quầy!", label: "Lời Cảm Ơn", x: 10, y: 225, w: 270, fsz: 9.5, italic: true, align: "center" },
                { id: "e10", catalog_key: "pet_signature", zone: "footer", type: "text", text: "(Chữ ký khách gửi bé)", label: "Chữ Ký Gửi Bé", x: 10, y: 255, w: 270, fsz: 10, align: "center" }
            ];
        }

        function getSpaInvoiceElementsK80() {
            return [
                { id: "e1", catalog_key: "shop_name", zone: "header", type: "text", text: "🐾 {{ten_cua_hang}}", label: "Tên Cửa Hàng", x: 10, y: 10, w: 270, fsz: 14, bold: true, align: "center" },
                { id: "e2", catalog_key: "title", zone: "header", type: "text", text: "HÓA ĐƠN DỊCH VỤ SPA", label: "Tiêu Đề", x: 10, y: 32, w: 270, fsz: 14, bold: true, align: "center" },
                { id: "e3", catalog_key: "order_code", zone: "header", type: "text", text: "Mã: {{ma_hoa_don}} - {{ngay_gio}}", label: "Mã & Ngày", x: 10, y: 52, w: 270, fsz: 10, bold: false, align: "center" },
                { id: "e4", catalog_key: "customer", zone: "header", type: "text", text: "Khách: {{ten_khach}} ({{sdt_khach}})", label: "Khách Hàng", x: 10, y: 72, w: 270, fsz: 10.5, bold: true, align: "left" },
                { id: "e5", catalog_key: "pet_info", zone: "header", type: "text", text: "Bé: {{ten_thu_cung}} - {{giong_loai}} ({{can_nang}}kg)", label: "Thông Tin Thú Cưng", x: 10, y: 90, w: 270, fsz: 10, bold: false, align: "left" },
                { id: "e6", catalog_key: "table", zone: "body", type: "table", label: "Bảng Dịch Vụ & Phụ Phí", x: 10, y: 115, w: 270, fsz: 10 },
                { id: "e7", catalog_key: "total", zone: "footer", type: "text", text: "Tổng chi phí: {{tong_tien}}", label: "Tổng Tiền", x: 10, y: 185, w: 270, fsz: 11, bold: false, align: "right" },
                { id: "e8", catalog_key: "discount", zone: "footer", type: "text", text: "Giảm giá / Ưu đãi: -{{giam_gia}}", label: "Giảm Giá", x: 10, y: 205, w: 270, fsz: 10.5, bold: false, align: "right" },
                { id: "e9", catalog_key: "final", zone: "footer", type: "text", text: "KHÁCH PHẢI TRẢ: {{phai_tra}}", label: "Phải Trả", x: 10, y: 228, w: 270, fsz: 13, bold: true, align: "right" },
                { id: "e10", catalog_key: "qr", zone: "footer", type: "qr", label: "QR Chuyển Khoản", x: 75, y: 255, w: 130, h: 130 },
                { id: "e11", catalog_key: "footer_msg", zone: "footer", type: "text", text: "{{loi_cam_on}}", label: "Lời Cảm Ơn", x: 10, y: 400, w: 270, fsz: 10, italic: true, align: "center" }
            ];
        }

        function getCashbookThuElementsK80() {
            return [
                { id: "e1", catalog_key: "shop_name", zone: "header", type: "text", text: "🐾 {{ten_cua_hang}}", label: "Tên Cửa Hàng", x: 10, y: 10, w: 270, fsz: 14, bold: true, align: "center" },
                { id: "e2", catalog_key: "title", zone: "header", type: "text", text: "PHIẾU THU TIỀN", label: "Tiêu Đề", x: 10, y: 32, w: 270, fsz: 15, bold: true, align: "center" },
                { id: "e3", catalog_key: "order_code", zone: "header", type: "text", text: "Mã: {{ma_phieu}} | Ngày: {{ngay_gio}}", label: "Mã Phiếu Thu", x: 10, y: 54, w: 270, fsz: 10, align: "center" },
                { id: "e4", catalog_key: "customer", zone: "header", type: "text", text: "Người nộp: {{ten_khach}} ({{sdt_khach}})", label: "Người Nộp", x: 10, y: 78, w: 270, fsz: 11, bold: true, align: "left" },
                { id: "e5", catalog_key: "cashbook_category", zone: "header", type: "text", text: "Hạng mục: {{hang_muc}}", label: "Hạng Mục Thu/Chi", x: 10, y: 98, w: 270, fsz: 10, align: "left" },
                { id: "e6", catalog_key: "cashbook_fund", zone: "header", type: "text", text: "Két / Quỹ: {{tai_khoan_quy}}", label: "Quỹ / Tài Khoản", x: 10, y: 116, w: 270, fsz: 10, align: "left" },
                { id: "e7", catalog_key: "cashbook_amount", zone: "body", type: "text", text: "SỐ TIỀN THỰC THU: {{so_tien}}", label: "Số Tiền Thu/Chi", x: 10, y: 140, w: 270, fsz: 15, bold: true, align: "center" },
                { id: "e8", catalog_key: "cashbook_reason", zone: "body", type: "text", text: "Diễn giải: {{dien_giai}}", label: "Diễn Giải Thu/Chi", x: 10, y: 175, w: 270, fsz: 10.5, italic: true, align: "left" },
                { id: "e9", catalog_key: "signatures_cashbook", zone: "footer", type: "signatures_cashbook", label: "2 Chữ Ký Nộp/Nhận - Lập Phiếu", x: 10, y: 215, w: 270, h: 80 }
            ];
        }

        function getCashbookThuElementsA4() {
            return [
                { id: "e1", catalog_key: "shop_name", zone: "header", type: "text", text: "{{ten_cua_hang}}\nĐịa chỉ: {{dia_chi}}\nHotline: {{so_dien_thoai}}", label: "Đơn Vị", x: 30, y: 20, w: 400, fsz: 11, bold: false, align: "left" },
                { id: "e2", catalog_key: "order_code", zone: "header", type: "text", text: "Mẫu số 01 - TT\n(Ban hành theo TT số 133/2016/TT-BTC)\nQuyển số: ........\nSố: {{ma_phieu}}\nNợ: ..... Có: .....", label: "Mẫu Số & Quyển", x: 440, y: 20, w: 240, fsz: 10, align: "right" },
                { id: "e3", catalog_key: "title", zone: "header", type: "text", text: "PHIẾU THU", label: "Tiêu Đề", x: 150, y: 95, w: 380, fsz: 20, bold: true, align: "center" },
                { id: "e4", catalog_key: "datetime", zone: "header", type: "text", text: "Ngày lập: {{ngay_gio}}", label: "Ngày Tháng", x: 150, y: 125, w: 380, fsz: 11, italic: true, align: "center" },
                { id: "e5", catalog_key: "cashbook_reason", zone: "body", type: "text", text: "- Họ và tên người nộp tiền: {{ten_khach}} ({{sdt_khach}})\n- Lý do nộp: {{dien_giai}}\n- Hạng mục: {{hang_muc}}\n- Số tiền: {{so_tien}}\n- Nhập quỹ / Két: {{tai_khoan_quy}}", label: "Nội Dung Thu Tiền", x: 30, y: 155, w: 650, fsz: 12, align: "left" },
                { id: "e6", catalog_key: "signatures_accounting_4col", zone: "footer", type: "signatures_accounting_4col", label: "4 Chữ Ký Kế Toán", x: 30, y: 290, w: 650, h: 90 }
            ];
        }

        function getCashbookChiElementsK80() {
            return [
                { id: "e1", catalog_key: "shop_name", zone: "header", type: "text", text: "🐾 {{ten_cua_hang}}", label: "Tên Cửa Hàng", x: 10, y: 10, w: 270, fsz: 14, bold: true, align: "center" },
                { id: "e2", catalog_key: "title", zone: "header", type: "text", text: "PHIẾU CHI TIỀN", label: "Tiêu Đề", x: 10, y: 32, w: 270, fsz: 15, bold: true, align: "center" },
                { id: "e3", catalog_key: "order_code", zone: "header", type: "text", text: "Mã: {{ma_phieu}} | Ngày: {{ngay_gio}}", label: "Mã Phiếu Chi", x: 10, y: 54, w: 270, fsz: 10, align: "center" },
                { id: "e4", catalog_key: "customer", zone: "header", type: "text", text: "Người nhận: {{ten_khach}} ({{sdt_khach}})", label: "Người Nhận", x: 10, y: 78, w: 270, fsz: 11, bold: true, align: "left" },
                { id: "e5", catalog_key: "cashbook_category", zone: "header", type: "text", text: "Hạng mục: {{hang_muc}}", label: "Hạng Mục Thu/Chi", x: 10, y: 98, w: 270, fsz: 10, align: "left" },
                { id: "e6", catalog_key: "cashbook_fund", zone: "header", type: "text", text: "Két / Quỹ: {{tai_khoan_quy}}", label: "Quỹ / Tài Khoản", x: 10, y: 116, w: 270, fsz: 10, align: "left" },
                { id: "e7", catalog_key: "cashbook_amount", zone: "body", type: "text", text: "SỐ TIỀN THỰC CHI: {{so_tien}}", label: "Số Tiền Thu/Chi", x: 10, y: 140, w: 270, fsz: 15, bold: true, align: "center" },
                { id: "e8", catalog_key: "cashbook_reason", zone: "body", type: "text", text: "Diễn giải: {{dien_giai}}", label: "Diễn Giải Thu/Chi", x: 10, y: 175, w: 270, fsz: 10.5, italic: true, align: "left" },
                { id: "e9", catalog_key: "signatures_cashbook", zone: "footer", type: "signatures_cashbook", label: "2 Chữ Ký Nộp/Nhận - Lập Phiếu", x: 10, y: 215, w: 270, h: 80 }
            ];
        }

        function getCashbookChiElementsA4() {
            return [
                { id: "e1", catalog_key: "shop_name", zone: "header", type: "text", text: "{{ten_cua_hang}}\nĐịa chỉ: {{dia_chi}}\nHotline: {{so_dien_thoai}}", label: "Đơn Vị", x: 30, y: 20, w: 400, fsz: 11, bold: false, align: "left" },
                { id: "e2", catalog_key: "order_code", zone: "header", type: "text", text: "Mẫu số 02 - TT\n(Ban hành theo TT số 133/2016/TT-BTC)\nQuyển số: ........\nSố: {{ma_phieu}}\nNợ: ..... Có: .....", label: "Mẫu Số & Quyển", x: 440, y: 20, w: 240, fsz: 10, align: "right" },
                { id: "e3", catalog_key: "title", zone: "header", type: "text", text: "PHIẾU CHI", label: "Tiêu Đề", x: 150, y: 95, w: 380, fsz: 20, bold: true, align: "center" },
                { id: "e4", catalog_key: "datetime", zone: "header", type: "text", text: "Ngày lập: {{ngay_gio}}", label: "Thời Gian", x: 150, y: 125, w: 380, fsz: 11, italic: true, align: "center" },
                { id: "e5", catalog_key: "cashbook_reason", zone: "body", type: "text", text: "- Họ và tên người nhận tiền: {{ten_khach}} ({{sdt_khach}})\n- Lý do chi: {{dien_giai}}\n- Hạng mục: {{hang_muc}}\n- Số tiền: {{so_tien}}\n- Xuất quỹ / Két: {{tai_khoan_quy}}", label: "Nội Dung Chi Tiền", x: 30, y: 155, w: 650, fsz: 12, align: "left" },
                { id: "e6", catalog_key: "signatures_accounting_4col", zone: "footer", type: "signatures_accounting_4col", label: "4 Chữ Ký Kế Toán", x: 30, y: 290, w: 650, h: 90 }
            ];
        }

        function getStockAuditElementsA4() {
            return [
                { id: "e1", catalog_key: "shop_name", zone: "header", type: "text", text: "{{ten_cua_hang}}\nĐịa chỉ: {{dia_chi}}", label: "Tên Doanh Nghiệp", x: 30, y: 20, w: 400, fsz: 11, bold: false, align: "left" },
                { id: "e2", catalog_key: "order_code", zone: "header", type: "text", text: "Mã phiếu: {{ma_phieu}}\nNgày kiểm: {{ngay_gio}}", label: "Mã & Ngày", x: 440, y: 20, w: 260, fsz: 10.5, align: "right" },
                { id: "e3", catalog_key: "title", zone: "header", type: "text", text: "PHIẾU KIỂM KÊ KHO HÀNG", label: "Tiêu Đề", x: 30, y: 80, w: 674, fsz: 18, bold: true, align: "center" },
                { id: "e4", catalog_key: "audit_warehouse", zone: "header", type: "text", text: "Kho kiểm kê: {{kho_kiem_ke}} | Đợt kiểm: Định kỳ cuối tháng", label: "Kho Kiểm Kê", x: 30, y: 115, w: 674, fsz: 11, italic: true, align: "center" },
                { id: "e5", catalog_key: "table_audit", zone: "body", type: "table_audit", label: "Bảng 7 Cột Kiểm Kê Kho", x: 30, y: 145, w: 674, fsz: 10.5 },
                { id: "e6", catalog_key: "audit_summary", zone: "footer", type: "text", text: "Tổng số mặt hàng đã kiểm: {{tong_mon_kiem}} món | Lệch thừa: {{lech_thua}} | Lệch thiếu: {{lech_thieu}}", label: "Tổng Kết Kiểm Kê", x: 30, y: 240, w: 674, fsz: 11, bold: true, align: "right" },
                { id: "e7", catalog_key: "signatures_audit", zone: "footer", type: "signatures_audit", label: "3 Chữ Ký Ban Kiểm Kê", x: 30, y: 285, w: 674, h: 85 }
            ];
        }

        function getDraftElementsK80() {
            return [
                { id: "e1", catalog_key: "shop_name", zone: "header", type: "text", text: "🐾 {{ten_cua_hang}}", label: "Tên Cửa Hàng", x: 10, y: 10, w: 270, fsz: 14, bold: true, align: "center" },
                { id: "e2", catalog_key: "title", zone: "header", type: "text", text: "PHIẾU TẠM TÍNH", label: "Tiêu Đề", x: 10, y: 32, w: 270, fsz: 15, bold: true, align: "center" },
                { id: "e3", catalog_key: "order_code", zone: "header", type: "text", text: "(Chưa có giá trị thanh toán)\nSố: {{ma_hoa_don}} - {{ngay_gio}}", label: "Mã & Giờ", x: 10, y: 54, w: 270, fsz: 10, align: "center" },
                { id: "e4", catalog_key: "customer", zone: "header", type: "text", text: "Khách: {{ten_khach}} ({{sdt_khach}})", label: "Khách Hàng", x: 10, y: 80, w: 270, fsz: 11, bold: true, align: "left" },
                { id: "e5", catalog_key: "table", zone: "body", type: "table", label: "Bảng Mặt Hàng", x: 10, y: 105, w: 270, fsz: 10 },
                { id: "e6", catalog_key: "total", zone: "footer", type: "text", text: "TỔNG TẠM TÍNH: {{phai_tra}}", label: "Tổng Tạm Tính", x: 10, y: 180, w: 270, fsz: 13, bold: true, align: "right" },
                { id: "e7", catalog_key: "footer_msg", zone: "footer", type: "text", text: "Vui lòng đối chiếu món trước khi thanh toán chính thức!", label: "Lời Nhắc", x: 10, y: 210, w: 270, fsz: 9.5, italic: true, align: "center" }
            ];
        }

        function getTopupElementsK80() {
            return [
                { id: "e1", catalog_key: "shop_name", zone: "header", type: "text", text: "🐾 {{ten_cua_hang}}", label: "Tên Cửa Hàng", x: 10, y: 10, w: 270, fsz: 14, bold: true, align: "center" },
                { id: "e2", catalog_key: "title", zone: "header", type: "text", text: "PHIẾU THU NẠP VÍ SPA", label: "Tiêu Đề", x: 10, y: 32, w: 270, fsz: 14, bold: true, align: "center" },
                { id: "e3", catalog_key: "order_code", zone: "header", type: "text", text: "Mã: {{ma_phieu}} | Ngày: {{ngay_gio}}", label: "Mã Giao Dịch", x: 10, y: 52, w: 270, fsz: 10, align: "center" },
                { id: "e4", catalog_key: "customer", zone: "header", type: "text", text: "Khách hàng: {{ten_khach}} ({{sdt_khach}})", label: "Khách Hàng", x: 10, y: 74, w: 270, fsz: 11, bold: true, align: "left" },
                { id: "e5", catalog_key: "cashbook_amount", zone: "body", type: "text", text: "TIỀN THỰC NỘP: {{so_tien}}", label: "Tiền Nộp", x: 10, y: 100, w: 270, fsz: 13, bold: true, align: "center" },
                { id: "e6", catalog_key: "cashbook_reason", zone: "body", type: "text", text: "Gói nạp: {{dien_giai}}\nCộng vào ví Spa: +700.000 đ\nSố dư ví mới: 2.200.000 đ\nĐiểm thưởng tích lũy: +500 điểm", label: "Biến Động Số Dư & Điểm", x: 10, y: 130, w: 270, fsz: 10.5, align: "left" },
                { id: "e7", catalog_key: "qr", zone: "footer", type: "qr", label: "VietQR Xác Nhận", x: 75, y: 200, w: 120, h: 120 },
                { id: "e8", catalog_key: "footer_msg", zone: "footer", type: "text", text: "Số dư ví chỉ áp dụng cho các gói dịch vụ Spa!", label: "Lời Nhắc", x: 10, y: 330, w: 270, fsz: 9.5, italic: true, align: "center" }
            ];
        }

        function getShiftZReportElementsK80() {
            return [
                { id: "e1", catalog_key: "shop_name", zone: "header", type: "text", text: "{{ten_cua_hang}}", label: "Tên Cửa Hàng", x: 10, y: 10, w: 270, fsz: 14, bold: true, align: "center" },
                { id: "e2", catalog_key: "title", zone: "header", type: "text", text: "BÁO CÁO KẾT THÚC CA (Z)", label: "Tiêu Đề", x: 10, y: 32, w: 270, fsz: 13, bold: true, align: "center" },
                { id: "e3", catalog_key: "order_code", zone: "header", type: "text", text: "Ca số: 01 | Thu ngân: {{thu_ngan}} | Ngày: {{ngay_gio}}", label: "Thông Tin Ca", x: 10, y: 54, w: 270, fsz: 10, align: "center" },
                { id: "e4", catalog_key: "cashbook_reason", zone: "body", type: "text", text: "- Tiền mặt đầu ca: 1.000.000 đ\n- Doanh thu tiền mặt: 4.500.000 đ\n- Doanh thu chuyển khoản: 3.200.000 đ\n- Thu nạp ví Spa: 1.000.000 đ\n- Chi trong ca: 200.000 đ\n- TỔNG TIỀN MẶT KÉT BÀN GIAO: 6.300.000 đ", label: "Chi Tiết Doanh Thu Ca", x: 10, y: 80, w: 270, fsz: 11, bold: false, align: "left" },
                { id: "e5", catalog_key: "signatures_cashbook", zone: "footer", type: "signatures_cashbook", label: "Chữ Ký Thu Ngân - Quản Lý", x: 10, y: 190, w: 270, h: 80 }
            ];
        }

        function inferDocTypeFromKey(key, preset) {
            if (preset && preset.doc_type) return preset.doc_type;
            const k = (key || '').toLowerCase();
            const name = (preset && preset.name ? preset.name : '').toLowerCase();

            if (k.includes('draft') || name.includes('tạm tính')) return 'pos_draft';
            if (k.includes('topup') || name.includes('nạp ví')) return 'pos_topup';
            if (k.includes('spa_intake') || name.includes('tiếp nhận')) return 'spa_intake';
            if (k.includes('spa_invoice') || (k.includes('spa') && (k.includes('bill') || k.includes('invoice') || name.includes('thanh toán')))) return 'spa_invoice';
            if (k.includes('shift') || k.includes('zreport') || name.includes('đóng ca') || name.includes('báo cáo ca')) return 'shift_zreport';
            if (k.includes('audit') || k.includes('kiem_ke') || name.includes('kiểm kê')) return 'stock_audit';
            if (k.includes('thu') || name.includes('phiếu thu')) return 'cashbook_thu';
            if (k.includes('chi') || name.includes('phiếu chi')) return 'cashbook_chi';
            if (k.includes('b2b') || k.includes('a4') || k.includes('a5') || name.includes('đại lý') || name.includes('b2b') || name.includes('sỉ')) return 'pos_b2b';
            return 'pos_retail';
        }

        function getDefaultPresets() {
            return {
                "a4_b2b": {
                    name: "Mẫu A4 Đại Lý B2B (Chuẩn 9 Cột & 3 Chữ Ký)",
                    category: "pos",
                    doc_type: "pos_b2b",
                    paper_size: "A4-landscape",
                    is_bold_all: false,
                    elements: getB2BA4Template("A4-landscape")
                },
                "a4_standard": {
                    name: "Mẫu A4 Tiêu Chuẩn (Bán Lẻ)",
                    category: "pos",
                    doc_type: "pos_b2b",
                    paper_size: "A4-portrait",
                    is_bold_all: false,
                    elements: getInitialElementsForSize("A4-portrait")
                },
                "a5_standard": {
                    name: "Mẫu A5 Tiêu Chuẩn",
                    category: "pos",
                    doc_type: "pos_b2b",
                    paper_size: "A5-portrait",
                    is_bold_all: false,
                    elements: getInitialElementsForSize("A5-portrait")
                },
                "k80_standard": {
                    name: "Mẫu Cuộn Nhiệt K80 (Bán Lẻ)",
                    category: "pos",
                    doc_type: "pos_retail",
                    paper_size: "K80",
                    is_bold_all: true,
                    elements: getInitialElementsForSize("K80")
                },
                "k80_default": {
                    name: "Mẫu Cuộn Nhiệt K80 (Bán Lẻ)",
                    category: "pos",
                    doc_type: "pos_retail",
                    paper_size: "K80",
                    is_bold_all: true,
                    elements: getInitialElementsForSize("K80")
                },
                "k58_standard": {
                    name: "Mẫu Cuộn Nhiệt K58 (Bán Lẻ)",
                    category: "pos",
                    doc_type: "pos_retail",
                    paper_size: "K58",
                    is_bold_all: true,
                    elements: getInitialElementsForSize("K58")
                },
                "draft_k80": {
                    name: "Mẫu Phiếu Tạm Tính (Cuộn K80)",
                    category: "pos",
                    doc_type: "pos_draft",
                    paper_size: "K80",
                    is_bold_all: true,
                    elements: getDraftElementsK80()
                },
                "spa_intake_k80": {
                    name: "Mẫu Phiếu Tiếp Nhận Thú Cưng Spa (K80)",
                    category: "spa",
                    doc_type: "spa_intake",
                    paper_size: "K80",
                    is_bold_all: true,
                    elements: getSpaIntakeElementsK80()
                },
                "pos_topup_k80": {
                    name: "Mẫu Phiếu Thu Nạp Ví Spa (K80)",
                    category: "spa",
                    doc_type: "pos_topup",
                    paper_size: "K80",
                    is_bold_all: true,
                    elements: getTopupElementsK80()
                },
                "spa_invoice_k80": {
                    name: "Mẫu Phiếu Thanh Toán Dịch Vụ Spa (K80)",
                    category: "spa",
                    doc_type: "spa_invoice",
                    paper_size: "K80",
                    is_bold_all: true,
                    elements: getSpaInvoiceElementsK80()
                },
                "cashbook_thu_k80": {
                    name: "Mẫu Phiếu Thu Tiền (Cuộn K80)",
                    category: "cashbook",
                    doc_type: "cashbook_thu",
                    paper_size: "K80",
                    is_bold_all: true,
                    elements: getCashbookThuElementsK80()
                },
                "cashbook_thu_a4": {
                    name: "Mẫu Phiếu Thu Tiền (Chuẩn A5/A4 Kế Toán)",
                    category: "cashbook",
                    doc_type: "cashbook_thu",
                    paper_size: "A5-landscape",
                    is_bold_all: false,
                    elements: getCashbookThuElementsA4()
                },
                "cashbook_chi_k80": {
                    name: "Mẫu Phiếu Chi Tiền (Cuộn K80)",
                    category: "cashbook",
                    doc_type: "cashbook_chi",
                    paper_size: "K80",
                    is_bold_all: true,
                    elements: getCashbookChiElementsK80()
                },
                "cashbook_chi_a4": {
                    name: "Mẫu Phiếu Chi Tiền (Chuẩn A5/A4 Kế Toán)",
                    category: "cashbook",
                    doc_type: "cashbook_chi",
                    paper_size: "A5-landscape",
                    is_bold_all: false,
                    elements: getCashbookChiElementsA4()
                },
                "shift_zreport_k80": {
                    name: "Mẫu Báo Cáo Đóng Ca Z (K80)",
                    category: "cashbook",
                    doc_type: "shift_zreport",
                    paper_size: "K80",
                    is_bold_all: true,
                    elements: getShiftZReportElementsK80()
                },
                "stock_audit_a4": {
                    name: "Mẫu Phiếu Kiểm Kê Hàng Hóa (A4 Dọc)",
                    category: "inventory",
                    doc_type: "stock_audit",
                    paper_size: "A4-portrait",
                    is_bold_all: false,
                    elements: getStockAuditElementsA4()
                }
            };
        }

        function renderPresetSelect(filterDocType) {
            const sel = document.getElementById('canvas-preset-select');
            if (!sel) return;
            if (!multiTemplates.presets) {
                multiTemplates.presets = getDefaultPresets();
            }

            const activeDoc = filterDocType || multiTemplates.active_doc_type || 'pos_retail';
            multiTemplates.active_doc_type = activeDoc;

            const items = [];
            for (let key in multiTemplates.presets) {
                const p = multiTemplates.presets[key];
                if (!p.doc_type) {
                    p.doc_type = inferDocTypeFromKey(key, p);
                }
                if (p.doc_type === activeDoc) {
                    items.push({ key, preset: p });
                }
            }

            let curPreset = multiTemplates.active_preset;
            const hasCur = items.some(i => i.key === curPreset);
            if (!hasCur && items.length > 0) {
                curPreset = items[0].key;
                multiTemplates.active_preset = curPreset;
            }

            let html = '';
            if (items.length > 0) {
                const docLabels = {
                    'pos_retail': '🧾 Hóa Đơn Bán Lẻ',
                    'pos_b2b': '📄 Hóa Đơn Sỉ / A4',
                    'pos_draft': '📝 Phiếu Tạm Tính',
                    'spa_intake': '💆 Tiếp Nhận Spa',
                    'pos_topup': '⚡ Thu Nạp Ví Spa',
                    'spa_invoice': '📋 Hóa Đơn Spa',
                    'cashbook_thu': '📥 Phiếu Thu Tiền',
                    'cashbook_chi': '📤 Phiếu Chi Tiền',
                    'shift_zreport': '📊 Báo Cáo Đóng Ca (Z)',
                    'stock_audit': '📦 Kiểm Kê Kho'
                };
                const groupLabel = docLabels[activeDoc] || 'Mẫu In Nghiệp Vụ';
                html += `<optgroup label="${groupLabel}">`;
                for (let item of items) {
                    const isSel = item.key === curPreset ? 'selected' : '';
                    const sizeTag = item.preset.paper_size || '';
                    const boldTag = item.preset.is_bold_all ? ' [Đậm]' : '';
                    html += `<option value="${item.key}" ${isSel}>${item.preset.name} (${sizeTag})${boldTag}</option>`;
                }
                html += `</optgroup>`;
            } else {
                html = `<option value="">(Chưa có mẫu cho chứng từ này - Bấm "Lưu Mẫu Mới")</option>`;
            }
            sel.innerHTML = html;
        }

        function switchPreset(presetKey) {
            if (!multiTemplates.presets) {
                multiTemplates.presets = getDefaultPresets();
            }
            if (!multiTemplates.presets[presetKey]) {
                const def = getDefaultPresets();
                if (def[presetKey]) {
                    multiTemplates.presets[presetKey] = def[presetKey];
                } else {
                    return;
                }
            }
            multiTemplates.active_preset = presetKey;
            const preset = multiTemplates.presets[presetKey];
            if (!preset.doc_type) preset.doc_type = inferDocTypeFromKey(presetKey, preset);

            // Sync doc_type and left tree selection if changed
            if (preset.doc_type && multiTemplates.active_doc_type !== preset.doc_type) {
                multiTemplates.active_doc_type = preset.doc_type;
                document.querySelectorAll('.print-tree-btn').forEach(btn => {
                    btn.classList.remove('active', 'font-bold', 'text-sky-700', 'bg-sky-100/70');
                    btn.classList.add('font-medium', 'text-slate-600');
                });
                const matchBtn = document.querySelector(`.print-tree-btn[onclick*="'${preset.doc_type}'"]`);
                if (matchBtn) {
                    matchBtn.classList.remove('font-medium', 'text-slate-600');
                    matchBtn.classList.add('active', 'font-bold', 'text-sky-700', 'bg-sky-100/70');
                }
                const docSel = document.getElementById('print-doc-type-select');
                if (docSel && docSel.value !== preset.doc_type) {
                    docSel.value = preset.doc_type;
                }
                renderPresetSelect(preset.doc_type);
            }

            paperSize = preset.paper_size || "A4-portrait";
            window.paperSize = paperSize;
            const sizeSel = document.getElementById('canvas-paper-size');
            if (sizeSel) sizeSel.value = paperSize;
            const printPaperSel = document.getElementById('print-paper-select');
            if (printPaperSel) printPaperSel.value = paperSize;

            const presetSel = document.getElementById('canvas-preset-select');
            if (presetSel && presetSel.value !== presetKey) presetSel.value = presetKey;
            const boldChk = document.getElementById('chk-preset-bold-all');
            if (boldChk) {
                boldChk.checked = !!preset.is_bold_all;
            }
            syncSplitBoldToggle(presetKey);
            let elems = preset.elements;
            if (!elems || elems.length === 0) {
                const def = getDefaultPresets();
                if (def[presetKey] && def[presetKey].elements) {
                    elems = def[presetKey].elements;
                    preset.elements = JSON.parse(JSON.stringify(elems));
                }
            }
            canvasElements = JSON.parse(JSON.stringify(elems || []));
            window.canvasElements = canvasElements;
            selectedElementId = null;

            const canvas = document.getElementById('paper-canvas');
            const dim = paperDimensions[paperSize] || paperDimensions["A4-portrait"];
            if (canvas) {
                canvas.style.width = dim.width;
                canvas.style.minHeight = dim.height;
            }

            renderCanvas();
            renderPropsPanel();
            updateSidebarCheckboxes();
            updateCanvasBadge();
            if (paperSize.startsWith('A4') || paperSize.startsWith('A5')) {
                setTimeout(() => setCanvasZoom('fit'), 50);
            } else {
                setCanvasZoom(1.0);
            }
        }

        function mapPresetKeyToBoldKey(presetKey) {
            if (!presetKey) return 'pos_retail';
            const curP = (multiTemplates && multiTemplates.presets && multiTemplates.presets[presetKey]) ? multiTemplates.presets[presetKey] : null;
            if (curP) {
                if (curP.doc_type === 'spa_intake' || curP.category === 'spa_intake') return 'spa_intake';
                if (curP.doc_type === 'spa_invoice' || curP.category === 'spa') return 'spa_invoice';
                if (curP.doc_type === 'cashbook_thu') return 'cashbook_thu';
                if (curP.doc_type === 'cashbook_chi') return 'cashbook_chi';
                if (curP.doc_type === 'shift_zreport') return 'shift_zreport';
                if (curP.doc_type === 'stock_audit' || curP.category === 'inventory') return 'stock_audit';
                if (curP.doc_type === 'pos_wholesale' || curP.doc_type === 'b2b' || (curP.paper_size && (curP.paper_size.startsWith('A4') || curP.paper_size.startsWith('A5')))) return 'pos_b2b';
                if (curP.doc_type === 'pos_retail' || curP.paper_size === 'K80' || curP.paper_size === 'K58') return 'pos_retail';
            }
            if (presetKey.includes('draft')) return 'pos_draft';
            if (presetKey.includes('topup')) return 'pos_topup';
            if (presetKey.includes('spa_intake')) return 'spa_intake';
            if (presetKey.includes('spa_invoice') || presetKey.includes('spa')) return 'spa_invoice';
            if (presetKey.includes('thu')) return 'cashbook_thu';
            if (presetKey.includes('chi')) return 'cashbook_chi';
            if (presetKey.includes('shift') || presetKey.includes('zreport')) return 'shift_zreport';
            if (presetKey.includes('audit')) return 'stock_audit';
            if (presetKey.includes('b2b') || presetKey.includes('a4') || presetKey.includes('a5')) return 'pos_b2b';
            return 'pos_retail';
        }

        function syncSplitBoldToggle(presetKey) {
            const toggle = document.getElementById('chk-split-bold-toggle');
            const thermalToggle = document.getElementById('chk-thermal-bold');
            const boldKey = mapPresetKeyToBoldKey(presetKey);
            const cfg = window.printBoldConfigs || {};
            const isBold = (cfg[boldKey] !== undefined)
                ? !!cfg[boldKey]
                : (multiTemplates.presets && multiTemplates.presets[presetKey] ? !!multiTemplates.presets[presetKey].is_bold_all : false);
            if (toggle) toggle.checked = isBold;
            if (thermalToggle) thermalToggle.checked = isBold;
            applyCanvasBoldEffect(isBold);

            // Đồng bộ switch ẩn / hiện mẫu
            const activeToggle = document.getElementById('chk-preset-active');
            if (activeToggle && multiTemplates.presets && multiTemplates.presets[presetKey]) {
                activeToggle.checked = multiTemplates.presets[presetKey].is_active !== false;
            }
        }

        async function onPresetActiveToggleChange(isChecked) {
            const curKey = multiTemplates.active_preset || "a4_b2b";
            if (!multiTemplates.presets || !multiTemplates.presets[curKey]) return;
            multiTemplates.presets[curKey].is_active = !!isChecked;

            try {
                await fetch('/api/settings/template', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        print_blocks_config: JSON.stringify(multiTemplates)
                    })
                });
                if (typeof showToast === 'function') {
                    showToast(isChecked ? 'Đã bật hiển thị mẫu này ở quầy POS!' : 'Đã ẩn mẫu này khỏi quầy POS (vẫn lưu cấu hình)!', 'success');
                }
                if (window.posPrintConfig && window.posPrintConfig.presets && window.posPrintConfig.presets[curKey]) {
                    window.posPrintConfig.presets[curKey].is_active = !!isChecked;
                }
                if (typeof initPrintTemplatesFromSettings === 'function') {
                    initPrintTemplatesFromSettings();
                }
            } catch (e) {
                console.error("Lỗi cập nhật trạng thái hiển thị preset:", e);
            }
        }
        window.onPresetActiveToggleChange = onPresetActiveToggleChange;

        async function onSplitBoldToggleChange(isChecked) {
            const curKey = multiTemplates.active_preset || "a4_b2b";
            if (multiTemplates.presets && multiTemplates.presets[curKey]) {
                multiTemplates.presets[curKey].is_bold_all = !!isChecked;
            }
            const legacyBoldChk = document.getElementById('chk-preset-bold-all');
            if (legacyBoldChk) legacyBoldChk.checked = !!isChecked;
            const thermalToggle = document.getElementById('chk-thermal-bold');
            if (thermalToggle) thermalToggle.checked = !!isChecked;
            const splitToggle = document.getElementById('chk-split-bold-toggle');
            if (splitToggle) splitToggle.checked = !!isChecked;

            const boldKey = mapPresetKeyToBoldKey(curKey);
            if (!window.printBoldConfigs) window.printBoldConfigs = {};
            window.printBoldConfigs[boldKey] = !!isChecked;

            applyCanvasBoldEffect(isChecked);

            try {
                await fetch('/api/settings/print-bold-configs', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        print_bold_configs: JSON.stringify(window.printBoldConfigs)
                    })
                });
                if (typeof showToast === 'function') {
                    showToast(`Đã ${isChecked ? 'bật' : 'tắt'} in đậm chống mờ cho mẫu này!`, 'success');
                }
            } catch(e) {
                console.error("Lỗi lưu print-bold-configs:", e);
            }
        }

        function applyCanvasBoldEffect(isBold) {
            const canvas = document.getElementById('paper-canvas');
            if (!canvas) return;
            if (isBold) {
                canvas.style.fontWeight = '900';
                canvas.style.webkitTextStroke = '0.35px #000';
                canvas.style.color = '#000';
            } else {
                canvas.style.fontWeight = '';
                canvas.style.webkitTextStroke = '';
                canvas.style.color = '';
            }
        }

        function toggleCurrentPresetBoldAll(isChecked) {
            if (!multiTemplates.presets) multiTemplates.presets = getDefaultPresets();
            const curKey = multiTemplates.active_preset || "a4_b2b";
            if (!multiTemplates.presets[curKey]) return;
            multiTemplates.presets[curKey].is_bold_all = !!isChecked;
            renderPresetSelect();
            renderCanvas();
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
            const boldChk = document.getElementById('chk-preset-bold-all');
            multiTemplates.presets[curKey].is_bold_all = boldChk ? boldChk.checked : (multiTemplates.presets[curKey].is_bold_all || false);
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
            const name = prompt("Nhập tên cho mẫu in mới:", "Hóa Đơn Mới");
            if (!name || !name.trim()) return;

            if (!multiTemplates.presets) multiTemplates.presets = getDefaultPresets();
            const curPreset = multiTemplates.presets[multiTemplates.active_preset || "k80_standard"] || {};
            const docType = multiTemplates.active_doc_type || curPreset.doc_type || inferDocTypeFromKey(multiTemplates.active_preset, curPreset);
            const boldChk = document.getElementById('chk-preset-bold-all');
            const newKey = "preset_" + Date.now();
            multiTemplates.presets[newKey] = {
                name: name.trim(),
                category: curPreset.category || "pos",
                doc_type: docType,
                paper_size: paperSize,
                is_bold_all: boldChk ? boldChk.checked : (paperSize === 'K80' || paperSize === 'K58'),
                elements: JSON.parse(JSON.stringify(canvasElements))
            };
            multiTemplates.active_preset = newKey;
            multiTemplates.active_size = paperSize;
            multiTemplates.active_doc_type = docType;
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
                renderPresetSelect(docType);
                alert(`Đã tạo và lưu thành mẫu mới: "${name.trim()}"!`);
            } else {
                alert('Lỗi khi lưu mẫu mới!');
            }
        }

        async function deleteCurrentPreset() {
            const curKey = multiTemplates.active_preset || "k80_standard";
            const builtIn = [
                "a4_b2b", "a4_standard", "a5_standard", "k80_standard", "k80_default", "k58_standard",
                "draft_k80", "spa_intake_k80", "pos_topup_k80", "spa_invoice_k80",
                "cashbook_thu_k80", "cashbook_thu_a4", "cashbook_chi_k80", "cashbook_chi_a4",
                "shift_zreport_k80", "stock_audit_a4"
            ];
            if (builtIn.includes(curKey)) {
                alert("Đây là mẫu in hệ thống mặc định, không thể xóa!");
                return;
            }
            const name = multiTemplates.presets[curKey] ? multiTemplates.presets[curKey].name : curKey;
            const confirmed = typeof window.showConfirmModal === 'function'
                ? await window.showConfirmModal({
                    title: 'Xóa Mẫu In',
                    message: `Bạn có chắc muốn xóa mẫu "${name}"?`,
                    type: 'danger',
                    confirmText: 'Xóa Mẫu',
                    cancelText: 'Hủy bỏ',
                    icon: '🗑️'
                })
                : confirm(`Bạn có chắc muốn xóa mẫu "${name}"?`);
            if (!confirmed) return;

            const docType = multiTemplates.active_doc_type || 'pos_retail';
            delete multiTemplates.presets[curKey];
            const payload = {
                print_blocks_config: JSON.stringify(multiTemplates)
            };
            await fetch('/api/settings/template', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });
            renderPresetSelect(docType);
            const nextKey = multiTemplates.active_preset;
            if (nextKey) switchPreset(nextKey);
            if (window.showToast) window.showToast(`Đã xóa mẫu "${name}" thành công!`, 'success');
            else alert(`Đã xóa mẫu "${name}" thành công!`);
        }

        async function renameCurrentPreset() {
            const curKey = multiTemplates.active_preset || "k80_standard";
            if (!multiTemplates.presets || !multiTemplates.presets[curKey]) {
                alert("Không tìm thấy mẫu in đang chọn!");
                return;
            }
            const p = multiTemplates.presets[curKey];
            const newName = prompt("Nhập tên mới cho mẫu in:", p.name);
            if (!newName || !newName.trim()) return;
            p.name = newName.trim();

            const payload = {
                print_blocks_config: JSON.stringify(multiTemplates)
            };
            const res = await fetch('/api/settings/template', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });
            if (res.ok) {
                renderPresetSelect(multiTemplates.active_doc_type || p.doc_type);
                alert(`Đã đổi tên mẫu thành: "${p.name}"!`);
            } else {
                alert('Lỗi khi đổi tên mẫu!');
            }
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
                if (key === 'discount') {
                    newElem.w = defaultW;
                    newElem.text = isThermal ? "Giảm giá: -{{giam_gia}}" : "Chiết khấu: {{giam_gia}}";
                }
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
                'order_code', 'datetime', 'staff', 'customer', 'customer_phone', 'customer_address',
                'pet_info', 'intake_condition', 'return_time', 'pet_signature',
                'cashbook_category', 'cashbook_fund', 'cashbook_amount', 'cashbook_reason',
                'signatures_cashbook', 'signatures_accounting_4col',
                'audit_warehouse', 'audit_summary', 'signatures_audit',
                'b2b_footer_boxes', 'signatures_3col',
                'total', 'discount', 'shipping_fee', 'final', 'paid', 'debt', 'qr', 'footer_msg'
            ];
            keys.forEach(k => {
                const el = document.getElementById('chk-' + k);
                if (!el) return;
                const proto = defaultElementCatalog[k];
                const has = canvasElements.some(e => {
                    if (e.catalog_key === k) return true;
                    if (k === 'discount' && e.text && (e.text.includes('giam_gia') || e.text.includes('Chiết khấu') || e.text.includes('Giảm giá'))) return true;
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
            const chkAudit = document.getElementById('chk-table_audit');
            if (chkB2B && chkStd) {
                chkB2B.checked = canvasElements.some(e => e.type === 'table_b2b');
                chkStd.checked = canvasElements.some(e => e.type === 'table');
                if (chkAudit) chkAudit.checked = canvasElements.some(e => e.type === 'table_audit');
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
                if (typeof showToast === 'function') showToast('Khối này đã ở vị trí trên cùng!', 'warning');
                return;
            }
            if (targetIdx >= canvasElements.length) {
                if (typeof showToast === 'function') showToast('Khối này đã ở vị trí dưới cùng!', 'warning');
                return;
            }

            const current = canvasElements[idx];
            const target = canvasElements[targetIdx];

            // Trao đổi thứ tự mảng và hoán đổi toạ độ Y để phản ánh đúng ra bản in thật
            if (current.y !== undefined && target.y !== undefined) {
                const tempY = current.y;
                current.y = target.y;
                target.y = tempY;
            }

            canvasElements[idx] = target;
            canvasElements[targetIdx] = current;
            renderCanvas();
            renderPropsPanel();
            if (typeof showToast === 'function') {
                showToast(`Đã đổi vị trí [${current.label || current.id}] ${direction < 0 ? 'lên trên' : 'xuống dưới'}`, 'info');
            }
        }

        let draggedElementId = null;

        function onAutoFlowDragStart(e, id) {
            draggedElementId = id;
            if (e.dataTransfer) {
                e.dataTransfer.effectAllowed = 'move';
                e.dataTransfer.setData('text/plain', id);
            }
        }

        function onAutoFlowDragOver(e) {
            e.preventDefault();
            if (e.dataTransfer) e.dataTransfer.dropEffect = 'move';
        }

        function onAutoFlowDrop(e, targetId) {
            e.preventDefault();
            if (!draggedElementId || draggedElementId === targetId) return;

            const fromIdx = canvasElements.findIndex(el => el.id === draggedElementId);
            const toIdx = canvasElements.findIndex(el => el.id === targetId);

            if (fromIdx !== -1 && toIdx !== -1) {
                const movedItem = canvasElements.splice(fromIdx, 1)[0];
                canvasElements.splice(toIdx, 0, movedItem);

                // Dồn và gán lại Y theo thứ tự mảng mới
                recomputeElementPositions();
                renderCanvas();
                renderPropsPanel();
                if (typeof showToast === 'function') {
                    showToast(`Đã chuyển [${movedItem.label || movedItem.id}] sang vị trí mới!`, 'info');
                }
            }
            draggedElementId = null;
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
            const lblZoom = document.getElementById('lbl-print-zoom');
            if (lblZoom) lblZoom.innerText = Math.round(canvasZoom * 100) + '%';
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

        function onPrintDocTypeSelectChange(docType) {
            selectPrintDocType(docType);
        }
        window.onPrintDocTypeSelectChange = onPrintDocTypeSelectChange;

        function selectPrintDocType(docType, btnEl) {
            const selectEl = document.getElementById('print-doc-type-select');
            if (selectEl && selectEl.value !== docType) {
                selectEl.value = docType;
            }

            document.querySelectorAll('.print-tree-btn').forEach(btn => {
                btn.classList.remove('active', 'font-bold', 'text-sky-700', 'bg-sky-100/70');
                btn.classList.add('font-medium', 'text-slate-600');
            });
            if (btnEl) {
                btnEl.classList.remove('font-medium', 'text-slate-600');
                btnEl.classList.add('active', 'font-bold', 'text-sky-700', 'bg-sky-100/70');
            } else {
                const matchBtn = document.querySelector(`.print-tree-btn[onclick*="'${docType}'"]`);
                if (matchBtn) {
                    matchBtn.classList.remove('font-medium', 'text-slate-600');
                    matchBtn.classList.add('active', 'font-bold', 'text-sky-700', 'bg-sky-100/70');
                }
            }

            multiTemplates.active_doc_type = docType;

            const docMap = {
                'pos_retail': 'k80_standard',
                'pos_b2b': 'a4_b2b',
                'pos_draft': 'draft_k80',
                'spa_intake': 'spa_intake_k80',
                'pos_topup': 'pos_topup_k80',
                'spa_invoice': 'spa_invoice_k80',
                'cashbook_thu': 'cashbook_thu_k80',
                'cashbook_chi': 'cashbook_chi_k80',
                'shift_zreport': 'shift_zreport_k80',
                'stock_audit': 'stock_audit_a4'
            };

            // Khi đổi nhóm loại chứng từ, ưu tiên chuyển sang preset chuẩn đại diện của nhóm đó
            let targetPreset = null;
            if (docType === 'pos_b2b') {
                if (multiTemplates.presets && multiTemplates.presets['a4_b2b']) targetPreset = 'a4_b2b';
                else if (multiTemplates.presets && multiTemplates.presets['preset_1789369697524']) targetPreset = 'preset_1789369697524';
            } else if (docType === 'pos_retail') {
                if (multiTemplates.presets && multiTemplates.presets['k80_standard']) targetPreset = 'k80_standard';
                else if (multiTemplates.presets && multiTemplates.presets['k80_default']) targetPreset = 'k80_default';
            }

            if (!targetPreset) {
                targetPreset = docMap[docType];
                if (!targetPreset || !multiTemplates.presets || !multiTemplates.presets[targetPreset]) {
                    for (let k in multiTemplates.presets) {
                        const p = multiTemplates.presets[k];
                        const dt = p.doc_type || inferDocTypeFromKey(k, p);
                        if (dt === docType) {
                            targetPreset = k;
                            break;
                        }
                    }
                }
            }
            if (!targetPreset) {
                targetPreset = docMap[docType] || 'k80_standard';
            }

            multiTemplates.active_preset = targetPreset;
            renderPresetSelect(docType);

            if (multiTemplates && multiTemplates.presets && multiTemplates.presets[targetPreset]) {
                switchPreset(targetPreset);
            } else {
                if (docType === 'pos_b2b' || docType === 'stock_audit') changePrintPaperView('A4-portrait');
                else changePrintPaperView('K80');
            }
        }

        function zoomPrintSheet(val) {
            setCanvasZoom(val);
            const lbl = document.getElementById('lbl-print-zoom');
            const txt = document.getElementById('canvas-zoom-text');
            if (lbl && txt) lbl.innerText = txt.innerText;
        }

        function changePrintPaperView(size) {
            changePaperSize(size);
            const selectEl = document.getElementById('print-paper-select');
            if (selectEl && selectEl.value !== size) selectEl.value = size;
        }

        function togglePrintPreviewBlock(blockId, isShow) {
            const el = document.getElementById(blockId);
            if (el) el.style.display = isShow ? '' : 'none';
        }

        function togglePrintPreviewField(fieldId, isShow) {
            const el = document.getElementById(fieldId);
            if (el) el.style.display = isShow ? '' : 'none';
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
                    { id: "e8_disc", zone: "footer", type: "text", text: "Giảm giá: -{{giam_gia}}", label: "Giảm Giá", x: 10, y: 218, w: 270, fsz: 11, bold: false, align: "right" },
                    { id: "e9", zone: "footer", type: "text", text: "KHÁCH TRẢ: {{phai_tra}}", label: "Phải Trả", x: 10, y: 238, w: 270, fsz: 13, bold: true, align: "right" },
                    { id: "e10", zone: "footer", type: "qr", label: "QR Code Thanh Toán", x: 75, y: 265, w: 130, h: 130 },
                    { id: "e11", zone: "footer", type: "text", text: "{{loi_cam_on}}", label: "Lời Cảm Ơn", x: 10, y: 410, w: 270, fsz: 10, italic: true, align: "center" }
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
            if (!canvas) return;
            const isThermal = paperSize.includes('K80') || paperSize.includes('K58');
            canvas.style.display = 'flex';
            canvas.style.flexDirection = 'column';
            canvas.style.padding = isThermal ? '16px 12px' : '28px 24px';
            canvas.style.boxSizing = 'border-box';
            canvas.style.overflow = 'visible';

            const maxThermalW = paperSize.includes('K80') ? 270 : 195;
            const mockData = {
                ten_cua_hang: currentSettings.shop_name || "PET CARE SPA & CLINIC",
                dia_chi: currentSettings.shop_address || "123 Đường Trần Phú, Nha Trang",
                so_dien_thoai: currentSettings.shop_phone || "0909.123.456",
                loi_cam_on: currentSettings.shop_footer || "Cảm ơn quý khách và hẹn gặp lại bé yêu!",
                ma_hoa_don: "HD2609130001",
                ma_phieu: "PT-2609130001",
                ngay_gio: new Date().toLocaleString('vi-VN'),
                thu_ngan: "Quản Lý",
                ten_khach: "Nguyễn Văn A",
                sdt_khach: "0987654321",
                dia_chi_khach: "123 Đường Trần Phú, P. Lộc Thọ, Nha Trang",
                tong_tien: "240.000 đ",
                giam_gia: "40.000 đ",
                phi_ship: "30.000 đ",
                tiet_kiem: "40.000 đ",
                phai_tra: "200.000 đ",
                khach_tra: "200.000 đ",
                con_no: "0 đ",
                // Pet spa mock
                ten_thu_cung: "Bé Lu",
                giong_loai: "Poodle",
                can_nang: "4.5",
                tinh_trang_tiep_nhan: "Lông rối nhẹ, ve rận (-), da tốt",
                gio_hen_tra: "16:30 Hôm Nay",
                // Cashbook mock
                hang_muc: "Thu tiền bán lẻ / Nạp ví",
                tai_khoan_quy: "Két Tiền Mặt [Cty]",
                so_tien: "500.000 đ",
                dien_giai: "Thu tiền thanh toán dịch vụ & đơn hàng",
                // Stock audit mock
                kho_kiem_ke: "Kho Tổng Nha Trang",
                tong_mon_kiem: "3",
                lech_thua: "0",
                lech_thieu: "0"
            };

            // Auto-flow layout: Khong dung toa do tuyet doi de tranh chong de chu
            let html = `
                <style>
                    .inline-editable-text {
                        cursor: text !important;
                        transition: background-color 0.15s, outline 0.15s;
                    }
                    .inline-editable-text:hover {
                        outline: 1px dashed #0284c7 !important;
                        background-color: rgba(2, 132, 199, 0.05) !important;
                    }
                    .inline-editable-text:focus {
                        outline: 1.5px solid #0284c7 !important;
                        background-color: rgba(2, 132, 199, 0.08) !important;
                    }
                </style>
                <div id="snap-guides"></div>
            `;

            // Render elements with auto-flow vertical stack
            canvasElements.forEach((e, index) => {
                const isSel = e.id === selectedElementId ? 'selected' : '';
                let content = '';

                if (e.type === 'logo') {
                    const logoH = e.h || 65;
                    const logoW = e.w || 140;
                    const alignStyle = e.align === 'left' ? 'margin-right: auto; margin-left: 0;' : e.align === 'right' ? 'margin-left: auto; margin-right: 0;' : 'margin: 0 auto;';
                    content = currentSettings.shop_logo
                        ? `<img src="${currentSettings.shop_logo}" style="display: block; max-width: ${logoW}px; max-height: ${logoH}px; width: 100%; height: auto; object-fit: contain; pointer-events: none; ${alignStyle}">`
                        : `<div style="border: 1px dashed #999; padding: 10px; font-size: 11px; text-align: center;">[Logo Cửa Hàng]</div>`;
                } else if (e.type === 'header_store_info') {
                    content = `
                        <div style="font-size: ${e.fsz || 11}px; text-align: ${e.align || 'left'}; line-height: 1.35; pointer-events: none;">
                            <div style="font-size: ${(e.fsz || 11) + 4}px; font-weight: bold; text-transform: uppercase;">${mockData.ten_cua_hang}</div>
                            <div>Địa chỉ: ${mockData.dia_chi}</div>
                            <div>Hotline: ${mockData.so_dien_thoai}</div>
                        </div>
                    `;
                } else if (e.type === 'qr') {
                    content = getQRCodeHTML(240000, 'HD2609130001');
                } else if (e.type === 'table_b2b') {
                    const showCode = !e.hide_code;
                    const showUnit = !e.hide_unit;
                    const showDisc = !e.hide_discount;
                    const showNote = !e.hide_note;

                    content = `
                        <table style="width: 100%; border-collapse: collapse; font-size: ${e.fsz || 10}px; border: 1px solid #000; pointer-events: none;">
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
                                <tr style="border-bottom: 1px solid #ccc; text-align: center;">
                                    <td style="border: 1px solid #ccc; padding: 4px 2px;">1</td>
                                    ${showCode ? '<td style="border: 1px solid #ccc; padding: 4px 4px;">SP001</td>' : ''}
                                    <td style="border: 1px solid #ccc; padding: 4px 4px; text-align: left; font-weight: 500;">Áo Thun Basic (Demo)</td>
                                    ${showUnit ? '<td style="border: 1px solid #ccc; padding: 4px 2px;">Cái</td>' : ''}
                                    <td style="border: 1px solid #ccc; padding: 4px 4px; text-align: right;">120.000</td>
                                    ${showDisc ? '<td style="border: 1px solid #ccc; padding: 4px 2px; text-align: right;">0%</td>' : ''}
                                    <td style="border: 1px solid #ccc; padding: 4px 2px; font-weight: bold;">2</td>
                                    <td style="border: 1px solid #ccc; padding: 4px 4px; text-align: right; font-weight: bold;">240.000</td>
                                    ${showNote ? '<td style="border: 1px solid #ccc; padding: 4px 4px; font-size: 9px; color: #666;">Size L</td>' : ''}
                                </tr>
                            </tbody>
                        </table>
                    `;
                } else if (e.type === 'table_audit') {
                    content = `
                        <table style="width: 100%; border-collapse: collapse; font-size: ${e.fsz || 10}px; border: 1px solid #000; pointer-events: none;">
                            <thead>
                                <tr style="background-color: #f1f5f9; border-bottom: 1px solid #000; font-weight: bold; text-align: center;">
                                    <th style="border: 1px solid #000; padding: 4px 2px; width: 30px;">STT</th>
                                    <th style="border: 1px solid #000; padding: 4px 4px; width: 80px;">Mã SKU</th>
                                    <th style="border: 1px solid #000; padding: 4px 4px; text-align: left;">Tên mặt hàng</th>
                                    <th style="border: 1px solid #000; padding: 4px 2px; width: 50px;">ĐVT</th>
                                    <th style="border: 1px solid #000; padding: 4px 4px; text-align: right; width: 65px;">Tồn HT</th>
                                    <th style="border: 1px solid #000; padding: 4px 4px; text-align: right; width: 65px;">Tồn Thực</th>
                                    <th style="border: 1px solid #000; padding: 4px 4px; text-align: right; width: 65px;">Lệch</th>
                                </tr>
                            </thead>
                            <tbody>
                                <tr style="border-bottom: 1px solid #ccc; text-align: center;">
                                    <td style="border: 1px solid #ccc; padding: 4px 2px;">1</td>
                                    <td style="border: 1px solid #ccc; padding: 4px 4px;">SKU-CAT-01</td>
                                    <td style="border: 1px solid #ccc; padding: 4px 4px; text-align: left; font-weight: 500;">Pate Cho Mèo Vị Cá Hồi</td>
                                    <td style="border: 1px solid #ccc; padding: 4px 2px;">Lon</td>
                                    <td style="border: 1px solid #ccc; padding: 4px 4px; text-align: right;">50</td>
                                    <td style="border: 1px solid #ccc; padding: 4px 4px; text-align: right; font-weight: bold;">50</td>
                                    <td style="border: 1px solid #ccc; padding: 4px 4px; text-align: right; font-weight: bold; color: #16a34a;">0</td>
                                </tr>
                            </tbody>
                        </table>
                    `;
                } else if (e.type === 'b2b_footer_boxes') {
                    content = `
                        <div style="display: grid; grid-template-columns: 1.2fr 1fr 1.3fr; gap: 8px; font-size: 10px; pointer-events: none;">
                            <div style="border: 1px solid #000; padding: 6px; border-radius: 2px;">
                                <div style="font-weight: bold; border-bottom: 0.5px solid #ccc; padding-bottom: 2px; margin-bottom: 4px; text-transform: uppercase;">💳 Thông Tin Thanh Toán</div>
                                <div>Ngân hàng: <b>${getBankDisplayName(currentSettings.shop_bank_code || 'MB')}</b></div>
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
                } else if (e.type === 'signatures_accounting_4col') {
                    content = `
                        <div style="display: grid; grid-template-columns: 1fr 1fr 1fr 1fr; gap: 6px; text-align: center; font-size: 11px; pointer-events: none;">
                            <div><div style="font-weight: bold; text-transform: uppercase;">Giám Đốc</div><div style="font-size: 9px; font-style: italic; color: #555;">(Ký, đóng dấu)</div><div style="height: 50px;"></div></div>
                            <div><div style="font-weight: bold; text-transform: uppercase;">Kế Toán Trưởng</div><div style="font-size: 9px; font-style: italic; color: #555;">(Ký, họ tên)</div><div style="height: 50px;"></div></div>
                            <div><div style="font-weight: bold; text-transform: uppercase;">Người Nộp/Nhận</div><div style="font-size: 9px; font-style: italic; color: #555;">(Ký, họ tên)</div><div style="height: 50px;"></div></div>
                            <div><div style="font-weight: bold; text-transform: uppercase;">Thủ Quỹ</div><div style="font-size: 9px; font-style: italic; color: #555;">(Ký, họ tên)</div><div style="height: 50px;"></div></div>
                        </div>
                    `;
                } else if (e.type === 'signatures_audit') {
                    content = `
                        <div style="display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 8px; text-align: center; font-size: 11px; pointer-events: none;">
                            <div><div style="font-weight: bold; text-transform: uppercase;">Trưởng Ban Kiểm Kê</div><div style="font-size: 9px; font-style: italic; color: #555;">(Ký, họ tên)</div><div style="height: 50px;"></div></div>
                            <div><div style="font-weight: bold; text-transform: uppercase;">Thủ Kho</div><div style="font-size: 9px; font-style: italic; color: #555;">(Ký, họ tên)</div><div style="height: 50px;"></div></div>
                            <div><div style="font-weight: bold; text-transform: uppercase;">Kế Toán Kho</div><div style="font-size: 9px; font-style: italic; color: #555;">(Ký, họ tên)</div><div style="height: 50px;"></div></div>
                        </div>
                    `;
                } else if (e.type === 'signatures_cashbook') {
                    content = `
                        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 8px; text-align: center; font-size: 11px; pointer-events: none;">
                            <div><div style="font-weight: bold; text-transform: uppercase;">Người Nộp / Nhận</div><div style="font-size: 9px; font-style: italic; color: #555;">(Ký, họ tên)</div><div style="height: 50px;"></div></div>
                            <div><div style="font-weight: bold; text-transform: uppercase;">Người Lập Phiếu</div><div style="font-size: 9px; font-style: italic; color: #555;">(Ký, họ tên)</div><div style="height: 50px;"></div></div>
                        </div>
                    `;
                } else if (e.type === 'table') {
                    if (isThermal) {
                        content = `
                            <table style="width: 100%; border-collapse: collapse; font-size: ${e.fsz || 11}px; border-top: 1px dashed #000; border-bottom: 1px dashed #000; pointer-events: none; table-layout: fixed;">
                                <thead style="border-bottom: 1px dashed #000;">
                                    <tr>
                                        <th style="text-align: left; width: 45px; padding: 4px 0;">SL</th>
                                        <th style="text-align: right; width: 105px; padding: 4px 0;">Đơn giá</th>
                                        <th style="text-align: right; width: 120px; padding: 4px 0;">Thành tiền</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    <tr>
                                        <td colspan="3" style="padding: 5px 0 2px 0; font-weight: 600; text-align: left; line-height: 1.2;">Combo Tắm Spa & Cắt Tỉa (Demo)</td>
                                    </tr>
                                    <tr style="border-bottom: 0.5px dotted #ccc;">
                                        <td style="text-align: left; vertical-align: top; padding: 2px 0 5px 0;">1</td>
                                        <td style="text-align: right; vertical-align: top; padding: 2px 0 5px 0;">
                                            <div style="font-weight: bold; line-height: 1.1;">200.000 đ</div>
                                            <div style="color: #666; font-size: 9px; line-height: 1.1; margin-top: 1px;">
                                                <span style="text-decoration: line-through;">240.000 đ</span>
                                                <span style="color: #15803d; font-weight: 500;">(Giảm 40.000 đ)</span>
                                            </div>
                                        </td>
                                        <td style="text-align: right; vertical-align: top; padding: 2px 0 5px 0;">
                                            <div style="font-weight: bold;">200.000 đ</div>
                                        </td>
                                    </tr>
                                </tbody>
                            </table>
                        `;
                    } else {
                        content = `
                            <table style="width: 100%; border-collapse: collapse; font-size: ${e.fsz || 12}px; border-top: 1px dashed #000; border-bottom: 1px dashed #000; pointer-events: none;">
                                <thead style="border-bottom: 1px dashed #000;">
                                    <tr>
                                        <th style="text-align: left; padding: 4px 0;">Tên sản phẩm / Dịch vụ</th>
                                        <th style="text-align: center; width: 36px;">SL</th>
                                        <th style="text-align: right; width: 84px;">Đơn giá</th>
                                        <th style="text-align: right; width: 90px;">Thành tiền</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    <tr style="border-bottom: 0.5px dotted #ccc;">
                                        <td style="padding: 4px 0; vertical-align: top;">Combo Tắm Vệ Sinh Spa 7 Bước</td>
                                        <td style="text-align: center; vertical-align: top;">1</td>
                                        <td style="text-align: right; vertical-align: top;">
                                            <div style="font-weight: bold; line-height: 1.1;">200.000 đ</div>
                                            <div style="text-decoration: line-through; color: #777; font-size: 9px; line-height: 1.1; margin-top: 1px;">240.000 đ</div>
                                        </td>
                                        <td style="text-align: right; vertical-align: top; font-weight: 500;">200.000 đ</td>
                                    </tr>
                                </tbody>
                            </table>
                        `;
                    }
                } else {
                    let txt = e.text || '';
                    txt = txt.replace(/{{ten_cua_hang}}/g, mockData.ten_cua_hang);
                    txt = txt.replace(/{{dia_chi}}/g, mockData.dia_chi);
                    txt = txt.replace(/{{so_dien_thoai}}/g, mockData.so_dien_thoai);
                    txt = txt.replace(/{{loi_cam_on}}/g, mockData.loi_cam_on);
                    txt = txt.replace(/{{ma_hoa_don}}/g, mockData.ma_hoa_don);
                    txt = txt.replace(/{{ma_phieu}}/g, mockData.ma_phieu);
                    txt = txt.replace(/{{ngay_gio}}/g, mockData.ngay_gio);
                    txt = txt.replace(/{{thu_ngan}}/g, mockData.thu_ngan);
                    txt = txt.replace(/{{ten_khach}}/g, mockData.ten_khach);
                    txt = txt.replace(/{{sdt_khach}}/g, mockData.sdt_khach);
                    txt = txt.replace(/{{dia_chi_khach}}/g, mockData.dia_chi_khach);
                    txt = txt.replace(/{{tong_tien}}/g, mockData.tong_tien);
                    txt = txt.replace(/{{giam_gia}}/g, mockData.giam_gia);
                    txt = txt.replace(/{{tiet_kiem}}/g, mockData.tiet_kiem);
                    txt = txt.replace(/{{phai_tra}}/g, mockData.phai_tra);
                    txt = txt.replace(/{{khach_tra}}/g, mockData.khach_tra);
                    txt = txt.replace(/{{con_no}}/g, mockData.con_no);
                    txt = txt.replace(/{{ten_thu_cung}}/g, mockData.ten_thu_cung);
                    txt = txt.replace(/{{giong_loai}}/g, mockData.giong_loai);
                    txt = txt.replace(/{{can_nang}}/g, mockData.can_nang);
                    txt = txt.replace(/{{tinh_trang_tiep_nhan}}/g, mockData.tinh_trang_tiep_nhan);
                    txt = txt.replace(/{{gio_hen_tra}}/g, mockData.gio_hen_tra);
                    txt = txt.replace(/{{hang_muc}}/g, mockData.hang_muc);
                    txt = txt.replace(/{{tai_khoan_quy}}/g, mockData.tai_khoan_quy);
                    txt = txt.replace(/{{so_tien}}/g, mockData.so_tien);
                    txt = txt.replace(/{{dien_giai}}/g, mockData.dien_giai);
                    txt = txt.replace(/{{kho_kiem_ke}}/g, mockData.kho_kiem_ke);
                    txt = txt.replace(/{{tong_mon_kiem}}/g, mockData.tong_mon_kiem);
                    txt = txt.replace(/{{lech_thua}}/g, mockData.lech_thua);
                    txt = txt.replace(/{{lech_thieu}}/g, mockData.lech_thieu);
                    content = `
                        <div class="inline-editable-text"
                             contenteditable="true"
                             data-id="${e.id}"
                             onfocus="onInlineTextFocus(event, '${e.id}')"
                             onblur="onInlineTextBlur(event, '${e.id}')"
                             oninput="onInlineTextInput(event, '${e.id}')"
                             onkeydown="onInlineTextKeyDown(event, '${e.id}')"
                             onclick="onInlineTextClick(event, '${e.id}')"
                             style="font-size: ${e.fsz || 12}px; font-weight: ${e.bold ? 'bold' : 'normal'}; font-style: ${e.italic ? '' : 'normal'}; text-align: ${e.align || 'left'}; white-space: pre-wrap; line-height: 1.3; outline: none; border-radius: 2px; cursor: text;"
                             title="Nhấp vào để sửa chữ trực tiếp">${txt}</div>
                    `;
                }

                const resizeHandleHTML = isSel ? `<div class="resize-handle" title="Kéo sang ngang để chỉnh độ rộng" onmousedown="startResize(event, '${e.id}')"></div>` : '';

                // Chỉ hiển thị thanh công cụ điều khiển khi khối được chọn (Clean Canvas)
                const actionBarHTML = isSel ? `
                    <div class="element-action-bar flex items-center justify-between pb-1 mb-1 text-xs text-sky-800 bg-sky-50 p-1 rounded border border-sky-200 select-none shadow-2xs">
                        <span class="font-bold flex items-center gap-1.5 text-sky-900">
                            <span class="cursor-grab text-sky-600 font-mono text-xs">⠿</span>
                            <span>${e.label || ''}</span>
                        </span>
                        <div class="flex items-center gap-1">
                            <button type="button" onclick="event.stopPropagation(); alignElement('left')" title="Căn Trái" class="px-1.5 py-0.5 bg-white hover:bg-sky-100 rounded border border-sky-300 font-bold text-slate-700">Trái</button>
                            <button type="button" onclick="event.stopPropagation(); alignElement('center')" title="Căn Giữa" class="px-1.5 py-0.5 bg-white hover:bg-sky-100 rounded border border-sky-300 font-bold text-slate-700">Giữa</button>
                            <button type="button" onclick="event.stopPropagation(); alignElement('right')" title="Căn Phải" class="px-1.5 py-0.5 bg-white hover:bg-sky-100 rounded border border-sky-300 font-bold text-slate-700">Phải</button>
                            <button type="button" onclick="event.stopPropagation(); moveElementOrder('${e.id}', -1)" title="Di chuyển lên trên" class="px-1.5 py-0.5 bg-white hover:bg-amber-100 rounded border border-amber-300 font-bold text-amber-800">▲ Lên</button>
                            <button type="button" onclick="event.stopPropagation(); moveElementOrder('${e.id}', 1)" title="Di chuyển xuống dưới" class="px-1.5 py-0.5 bg-white hover:bg-amber-100 rounded border border-amber-300 font-bold text-amber-800">▼ Xuống</button>
                            <button type="button" onclick="event.stopPropagation(); removeElement('${e.id}')" title="Xóa khối" class="px-1.5 py-0.5 bg-white hover:bg-rose-100 rounded border border-rose-300 font-bold text-rose-700">✕</button>
                        </div>
                    </div>
                ` : '';

                const selBorderStyle = isSel ? 'border: 1.5px dashed #0284c7; padding: 3px; border-radius: 4px; background: rgba(2, 132, 199, 0.02);' : 'border: 1px solid transparent; padding: 1px;';

                html += `
                    <div id="${e.id}" class="canvas-element auto-flow-item ${isSel}"
                         draggable="true"
                         ondragstart="onAutoFlowDragStart(event, '${e.id}')"
                         ondragover="onAutoFlowDragOver(event)"
                         ondrop="onAutoFlowDrop(event, '${e.id}')"
                         style="position: relative; width: 100%; margin-bottom: 6px; box-sizing: border-box; word-break: break-word; cursor: pointer; ${selBorderStyle}"
                         onclick="selectElement('${e.id}')">
                        ${actionBarHTML}
                        ${content}
                        ${resizeHandleHTML}
                    </div>
                `;
            });

            canvas.innerHTML = html;
        }


        function renderPropsPanel() {
            const panel = document.getElementById('element-props-panel');
            if (!panel) return;
            const elem = canvasElements.find(e => e.id === selectedElementId);
            if (!elem) {
                panel.innerHTML = '<div class="text-gray-400 ">Click vào một khối trên trang giấy để chỉnh sửa...</div>';
                return;
            }

            const zoneName = elem.zone === 'body' ? 'BẢNG HÀNG HÓA' : elem.zone === 'footer' ? 'CHÂN TRANG' : 'ĐẦU TRANG';
            const zoneColor = elem.zone === 'body' ? 'bg-blue-100 text-blue-800' : elem.zone === 'footer' ? 'bg-emerald-100 text-emerald-800' : 'bg-sky-100 text-sky-800';

            panel.innerHTML = `
                <div class="space-y-3">
                    <div class="flex items-center justify-between pb-1 border-b">
                        <span class="font-bold text-sky-700">${elem.label}</span>
                        <span class="text-xs px-2 py-0.5 rounded font-bold ${zoneColor}">VÙNG: ${zoneName}</span>
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
                    ${elem.type === 'logo' ? `
                    <div>
                        <div class="flex justify-between items-center mb-1">
                            <label class="block font-semibold text-xs">Chiều cao tối đa Logo (px):</label>
                            <span class="text-xs text-sky-600 font-bold">${elem.h || 65}px</span>
                        </div>
                        <input type="range" min="30" max="150" step="5" class="w-full accent-purple-600 cursor-pointer" value="${elem.h || 65}" oninput="updateProp('h', parseInt(this.value) || 65)">
                    </div>` : ''}
                    ${elem.type === 'text' ? `
                    <div>
                        <label class="block font-semibold mb-1 text-xs">Nội dung text / biến:</label>
                        <input id="prop-text-input" type="text" class="border p-1.5 rounded w-full text-xs font-medium" value="${elem.text || ''}" oninput="updateProp('text', this.value)">
                    </div>` : ''}
                    <div>
                        <div class="flex justify-between items-center mb-1">
                            <label class="block font-semibold text-xs">Độ rộng khối (px):</label>
                            <span class="text-xs text-sky-600">Hoặc kéo tay cầm 🟦 trên giấy</span>
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
                        <button onclick="updateProp('', !${elem.italic})" class="p-1.5 border rounded ${elem.italic ? 'bg-slate-800 text-white ' : 'bg-white'}">In Nghiêng [I]</button>` : ''}
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
                    ${elem.type === 'table_b2b' || elem.type === 'table' ? `
                    <div class="p-2 bg-slate-50 border border-slate-200 rounded text-xs space-y-1.5">
                        <label class="block font-bold text-slate-800">Cấu hình cột bảng:</label>
                        <div class="grid grid-cols-2 gap-1 text-xs">
                            <label class="flex items-center gap-1 cursor-pointer">
                                <input type="checkbox" ${elem.hide_code ? '' : 'checked'} onchange="updateProp('hide_code', !this.checked)">
                                <span>Mã hàng / SKU</span>
                            </label>
                            <label class="flex items-center gap-1 cursor-pointer">
                                <input type="checkbox" ${elem.hide_unit ? '' : 'checked'} onchange="updateProp('hide_unit', !this.checked)">
                                <span>Đơn vị tính</span>
                            </label>
                            <label class="flex items-center gap-1 cursor-pointer">
                                <input type="checkbox" ${elem.hide_discount ? '' : 'checked'} onchange="updateProp('hide_discount', !this.checked)">
                                <span>Chiết khấu %</span>
                            </label>
                            <label class="flex items-center gap-1 cursor-pointer">
                                <input type="checkbox" ${elem.hide_note ? '' : 'checked'} onchange="updateProp('hide_note', !this.checked)">
                                <span>Ghi chú</span>
                            </label>
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
                if (prop === 'align' && (elem.type === 'logo' || elem.align !== undefined)) {
                    const isThermal = paperSize.includes('K80') || paperSize.includes('K58');
                    const cW = isThermal ? (paperSize.includes('K80') ? 290 : 210) : (paperSize.includes('landscape') ? (paperSize.includes('A5') ? 794 : 1123) : (paperSize.includes('A5') ? 559 : 794));
                    const elW = elem.w || (isThermal ? 270 : 250);
                    const margin = isThermal ? 10 : 30;
                    if (val === 'left') elem.x = margin;
                    else if (val === 'center') elem.x = Math.max(margin, Math.round((cW - elW) / 2));
                    else if (val === 'right') elem.x = Math.max(margin, cW - elW - margin);
                }
                renderCanvas();
                renderPropsPanel();
            }
        }

        function onInlineTextClick(event, id) {
            event.stopPropagation();
            if (selectedElementId !== id) {
                selectedElementId = id;
                document.querySelectorAll('.canvas-element').forEach(el => el.classList.remove('selected'));
                const curEl = document.getElementById(id);
                if (curEl) curEl.classList.add('selected');
                renderPropsPanel();
            }
        }
        window.onInlineTextClick = onInlineTextClick;

        function onInlineTextFocus(event, id) {
            const card = document.getElementById(id);
            if (card) card.setAttribute('draggable', 'false');
            if (selectedElementId !== id) {
                selectedElementId = id;
                document.querySelectorAll('.canvas-element').forEach(el => el.classList.remove('selected'));
                if (card) card.classList.add('selected');
                renderPropsPanel();
            }
        }
        window.onInlineTextFocus = onInlineTextFocus;

        function onInlineTextInput(event, id) {
            const elem = canvasElements.find(e => e.id === id);
            if (!elem) return;
            elem.text = event.target.innerText;
            const propInp = document.getElementById('prop-text-input');
            if (propInp) propInp.value = elem.text;
        }
        window.onInlineTextInput = onInlineTextInput;

        function onInlineTextBlur(event, id) {
            const card = document.getElementById(id);
            if (card) card.setAttribute('draggable', 'true');
            const elem = canvasElements.find(e => e.id === id);
            if (elem) {
                elem.text = event.target.innerText;
            }
        }
        window.onInlineTextBlur = onInlineTextBlur;

        function onInlineTextKeyDown(event, id) {
            if (event.key === 'Escape') {
                event.target.blur();
            } else if ((event.ctrlKey || event.metaKey) && event.key === 's') {
                event.preventDefault();
                saveCurrentPreset();
            }
        }
        window.onInlineTextKeyDown = onInlineTextKeyDown;

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
            const isThermal = paperSize.includes('K80') || paperSize.includes('K58');
            const cW = isThermal ? (paperSize.includes('K80') ? 290 : 210) : (paperSize.includes('landscape') ? (paperSize.includes('A5') ? 794 : 1123) : (paperSize.includes('A5') ? 559 : 794));
            const elW = el.w || (isThermal ? 270 : 250);
            const margin = isThermal ? 10 : 30;

            if (mode === 'left') {
                el.x = margin;
                if (el.align !== undefined) el.align = 'left';
            } else if (mode === 'center') {
                el.x = Math.max(margin, Math.round((cW - elW) / 2));
                if (el.align !== undefined) el.align = 'center';
            } else if (mode === 'right') {
                el.x = Math.max(margin, cW - elW - margin);
                if (el.align !== undefined) el.align = 'right';
            } else if (mode === 'full') {
                el.x = margin;
                el.w = Math.max(100, cW - (margin * 2));
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

            // Nạp cấu hình in đậm cố định theo loại hóa đơn
            if (currentSettings.print_bold_configs) {
                try {
                    window.printBoldConfigs = typeof currentSettings.print_bold_configs === 'string'
                        ? JSON.parse(currentSettings.print_bold_configs)
                        : currentSettings.print_bold_configs;
                } catch(e) {
                    window.printBoldConfigs = {};
                }
            } else {
                window.printBoldConfigs = {
                    pos_retail: true,
                    pos_b2b: false,
                    pos_draft: true,
                    pos_topup: true,
                    spa_intake: true,
                    spa_invoice: true,
                    cashbook_thu: true,
                    cashbook_chi: true,
                    shift_zreport: true,
                    stock_audit: false
                };
            }
            renderPrintBoldConfigsUI();

            if (currentSettings.print_blocks_config) {
                try {
                    const parsed = JSON.parse(currentSettings.print_blocks_config);
                    if (parsed.presets) {
                        multiTemplates = parsed;
                        const def = getDefaultPresets();
                        if (!multiTemplates.presets) multiTemplates.presets = {};
                        for (let k in def) {
                            if (!multiTemplates.presets[k]) {
                                multiTemplates.presets[k] = def[k];
                            }
                        }
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

            if (!multiTemplates.presets) multiTemplates.presets = getDefaultPresets();
            const curPreset = multiTemplates.active_preset || "k80_standard";
            if (!multiTemplates.presets[curPreset]) {
                multiTemplates.active_preset = "k80_standard";
            }
            const activePresetObj = multiTemplates.presets[multiTemplates.active_preset];
            const activeDoc = (activePresetObj && activePresetObj.doc_type) 
                ? activePresetObj.doc_type 
                : inferDocTypeFromKey(multiTemplates.active_preset, activePresetObj);
            multiTemplates.active_doc_type = activeDoc;
            selectPrintDocType(activeDoc);
        }

        function renderPrintBoldConfigsUI() {
            const cfg = window.printBoldConfigs || {};
            const keys = [
                'pos_retail', 'pos_draft', 'pos_topup', 'spa_intake', 'spa_invoice',
                'cashbook_thu', 'cashbook_chi', 'shift_zreport', 'pos_b2b', 'stock_audit'
            ];
            keys.forEach(k => {
                const el = document.getElementById('chk-bold-' + k);
                if (el) {
                    el.checked = (cfg[k] !== undefined) ? !!cfg[k] : (k === 'pos_b2b' || k === 'stock_audit' ? false : true);
                }
            });
        }

        async function savePrintBoldConfigItem(key, isChecked) {
            if (!window.printBoldConfigs) window.printBoldConfigs = {};
            window.printBoldConfigs[key] = !!isChecked;
            await saveAllPrintBoldConfigs(true);
        }

        async function saveAllPrintBoldConfigs(silent = false) {
            const keys = [
                'pos_retail', 'pos_draft', 'pos_topup', 'spa_intake', 'spa_invoice',
                'cashbook_thu', 'cashbook_chi', 'shift_zreport', 'pos_b2b', 'stock_audit'
            ];
            if (!window.printBoldConfigs) window.printBoldConfigs = {};
            keys.forEach(k => {
                const el = document.getElementById('chk-bold-' + k);
                if (el) {
                    window.printBoldConfigs[k] = el.checked;
                }
            });

            try {
                const res = await fetch('/api/settings/print-bold-configs', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        print_bold_configs: JSON.stringify(window.printBoldConfigs)
                    })
                });
                if (res.ok) {
                    if (!silent && typeof showToast === 'function') {
                        showToast('Đã lưu cấu hình in đậm cho các loại phiếu thành công!', 'success');
                    } else if (!silent) {
                        alert('Đã lưu cấu hình in đậm cho các loại phiếu thành công!');
                    }
                }
            } catch(e) {
                console.error('Lỗi lưu print_bold_configs:', e);
            }
        }

        async function saveCanvasTemplate() {
            await saveCurrentPreset();
        }

        function printTestTemplate() {
            const curPreset = multiTemplates.active_preset || "a4_b2b";
            if (curPreset.includes('cashbook') || curPreset.includes('thu') || curPreset.includes('chi')) {
                const isThu = !curPreset.includes('chi');
                const mockOrder = {
                    code: isThu ? "PT-260913-001" : "PC-260913-001",
                    created_at: new Date().toLocaleString('vi-VN'),
                    staff_name: "Thủ Quỹ Chi Nhánh",
                    customer_name: isThu ? "Nguyễn Thị Thu Ngân (Nộp tiền)" : "Đơn Vị Giao Hàng Pet Express",
                    customer_phone: "0909.123.456",
                    total_amount: 500000,
                    discount: 0,
                    final_amount: 500000,
                    paid_amount: 500000,
                    debt_amount: 0,
                    hang_muc: isThu ? "Thu tiền bán lẻ / Nạp ví Spa" : "Chi tiền mua vật tư / Vận hành",
                    tai_khoan_quy: "Két Tiền Mặt Công Ty",
                    dien_giai: isThu ? "Thu tiền thanh toán dịch vụ & hóa đơn bán hàng" : "Chi trả tiền mua phụ kiện thú cưng",
                    items: []
                };
                renderAndPrint(mockOrder);
            } else if (curPreset.includes('stock_audit') || curPreset.includes('audit')) {
                const mockOrder = {
                    code: "KK-260913-001",
                    created_at: new Date().toLocaleString('vi-VN'),
                    staff_name: "Trưởng Ban Kiểm Kê",
                    customer_name: "Kho Tổng Pet Care",
                    customer_phone: "-",
                    total_amount: 0,
                    discount: 0,
                    final_amount: 0,
                    paid_amount: 0,
                    debt_amount: 0,
                    kho_kiem_ke: "Kho Tổng Nha Trang",
                    tong_mon_kiem: 3,
                    lech_thua: 0,
                    lech_thieu: 0,
                    items: [
                        { product_code: "SP001", product_name: "Pate Mèo Whiskas 85g", unit: "Gói", system_stock: 50, actual_stock: 50, diff: 0 },
                        { product_code: "SP002", product_name: "Hạt Cho Chó Ganador 1.5kg", unit: "Bao", system_stock: 20, actual_stock: 20, diff: 0 },
                        { product_code: "SP003", product_name: "Cát Vệ Sinh Cho Mèo 8L", unit: "Túi", system_stock: 35, actual_stock: 35, diff: 0 }
                    ]
                };
                renderAndPrint(mockOrder);
            } else if (curPreset.includes('spa')) {
                const isIntake = curPreset.includes('intake');
                const mockOrder = {
                    code: isIntake ? "TN-260913-001" : "HD-260913-SPA",
                    created_at: new Date().toLocaleString('vi-VN'),
                    staff_name: "Nguyễn Kỹ Thuật Viên",
                    customer_name: "Chị Lan (Chủ Bé Lu)",
                    customer_phone: "0912.345.678",
                    ten_thu_cung: "Bé Lu",
                    giong_loai: "Poodle",
                    can_nang: "4.5",
                    tinh_trang_tiep_nhan: "Lông rối nhẹ, ve rận (-), da tốt",
                    gio_hen_tra: "16:30 Hôm Nay",
                    total_amount: 250000,
                    discount: 30000,
                    final_amount: 220000,
                    paid_amount: 220000,
                    debt_amount: 0,
                    items: [
                        { product_code: "SPA01", product_name: "Combo Tắm Vệ Sinh Spa 7 Bước (Poodle <5kg)", unit: "Gói", quantity: 1, price: 150000, subtotal: 150000 },
                        { product_code: "SPA02", product_name: "Cắt Tỉa Lông Tạo Kiểu Bear Face", unit: "Lần", quantity: 1, price: 100000, subtotal: 100000 }
                    ]
                };
                renderAndPrint(mockOrder);
            } else {
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
        }

        function renderAndPrint(ord) {
            window.currentLoadedPrintOrder = ord;
            const isWholesale = typeof isWholesaleOrder === 'function' ? isWholesaleOrder(ord) : !!(
                ord.is_wholesale ||
                (ord.customer_name && (ord.customer_name.toLowerCase().includes('đại lý') || ord.customer_name.toLowerCase().includes('dai ly') || ord.customer_name.toLowerCase().includes('sỉ') || ord.customer_name.toLowerCase().includes('si '))) ||
                ord.customer_price_list_name ||
                (ord.items && ord.items.some(it => it.price_list_name))
            );

            let itemDiscountTotal = 0;
            (ord.items || []).forEach(it => {
                if (!isWholesale && it.original_price && it.original_price > it.price) {
                    itemDiscountTotal += (it.original_price - it.price) * (it.quantity || 1);
                }
            });
            const billDiscount = ord.discount || 0;
            const totalSavings = isWholesale ? billDiscount : (itemDiscountTotal + billDiscount);
            const finalDiscountToDisplay = isWholesale ? billDiscount : (totalSavings > 0 ? (billDiscount > 0 ? billDiscount : totalSavings) : (billDiscount || 0));

            const printData = {
                ten_cua_hang: currentSettings.shop_name || "PET CARE SPA & CLINIC",
                dia_chi: currentSettings.shop_address || "123 Đường Trần Phú, Nha Trang",
                so_dien_thoai: currentSettings.shop_phone || "0909.123.456",
                loi_cam_on: currentSettings.shop_footer || "Cảm ơn quý khách và hẹn gặp lại bé yêu!",
                ma_hoa_don: ord.code,
                ma_phieu: ord.code,
                ngay_gio: formatDateTime(ord.created_at),
                thu_ngan: ord.staff_name || 'Thu ngân',
                ten_khach: ord.customer_name || 'Khách lẻ',
                sdt_khach: ord.customer_phone || '-',
                dia_chi_khach: ord.customer_address || ord.address || '',
                tong_tien: formatMoney(ord.total_amount || 0),
                giam_gia: formatMoney(finalDiscountToDisplay),
                tiet_kiem: formatMoney(totalSavings),
                phai_tra: formatMoney(ord.final_amount || 0),
                khach_tra: formatMoney(ord.paid_amount || 0),
                con_no: formatMoney(ord.debt_amount || 0),
                raw_phai_tra: ord.final_amount || 0,
                // Spa
                ten_thu_cung: ord.ten_thu_cung || "Bé Lu",
                giong_loai: ord.giong_loai || "Poodle",
                can_nang: ord.can_nang || "4.5",
                tinh_trang_tiep_nhan: ord.tinh_trang_tiep_nhan || "Lông rối nhẹ, ve rận (-), da tốt",
                gio_hen_tra: ord.gio_hen_tra || "16:30 Hôm Nay",
                // Cashbook
                hang_muc: ord.hang_muc || "Thu tiền bán lẻ / Nạp ví",
                tai_khoan_quy: ord.tai_khoan_quy || "Két Tiền Mặt [Cty]",
                so_tien: formatMoney(ord.final_amount || ord.total_amount || 500000),
                dien_giai: ord.dien_giai || "Thu tiền thanh toán dịch vụ & hóa đơn bán hàng",
                // Stock audit
                kho_kiem_ke: ord.kho_kiem_ke || "Kho Tổng Nha Trang",
                tong_mon_kiem: ord.tong_mon_kiem || (ord.items ? ord.items.length : 3),
                lech_thua: ord.lech_thua != null ? ord.lech_thua : 0,
                lech_thieu: ord.lech_thieu != null ? ord.lech_thieu : 0
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
                    if (currentSettings.shop_logo) {
                        const logoMaxH = e.h || 65;
                        const logoMaxW = e.w || 140;
                        const alignStyle = e.align === 'left' ? 'margin-right: auto; margin-left: 0;' : e.align === 'right' ? 'margin-left: auto; margin-right: 0;' : 'margin: 0 auto;';
                        content = `<img src="${currentSettings.shop_logo}" style="max-height: ${logoMaxH}px; max-width: ${logoMaxW}px; width: 100%; height: auto; object-fit: contain; display: block; ${alignStyle}">`;
                    }
                } else if (e.type === 'header_store_info') {
                    content = `
                        <div style="font-size: ${e.fsz || 11}px; text-align: ${e.align || 'left'}; line-height: 1.35;">
                            <div style="font-size: ${(e.fsz || 11) + 4}px; font-weight: bold; text-transform: uppercase;">${currentSettings.shop_name || "TÊN CỬA HÀNG"}</div>
                            <div>Địa chỉ: ${currentSettings.shop_address || "Địa chỉ shop"}</div>
                            <div>Hotline: ${currentSettings.shop_phone || "0900000000"}</div>
                        </div>
                    `;
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
                    const isDebt = (ord.debt_amount || 0) > 0;
                    const paymentBoxContent = isDebt ? `
                        <div style="font-weight: bold; border-bottom: 0.5px solid #ccc; padding-bottom: 2px; margin-bottom: 4px; text-transform: uppercase;">💳 Thông Tin Thanh Toán</div>
                        <div style="height: 55px;"></div>
                    ` : `
                        <div style="font-weight: bold; border-bottom: 0.5px solid #ccc; padding-bottom: 2px; margin-bottom: 4px; text-transform: uppercase;">💳 Thông Tin Thanh Toán</div>
                        <div>Ngân hàng: <b>${getBankDisplayName(currentSettings.shop_bank_code || 'MB')}</b></div>
                        <div>Số TK: <b>${currentSettings.shop_bank_account || '123456789'}</b></div>
                        <div>Chủ TK: <b>${currentSettings.shop_bank_owner || currentSettings.shop_name || 'CHỦ TÀI KHOẢN'}</b></div>
                        <div style="color: #555; font-size: 9px; margin-top: 3px;">Nội dung CK: <i>${printData.ma_hoa_don}</i></div>
                    `;

                    const qrBoxContent = isDebt ? `
                        <div style="font-weight: bold; font-size: 9px; margin-bottom: 2px;">QUÉT MÃ VIETQR</div>
                        <div style="height: 55px;"></div>
                    ` : `
                        <div style="font-weight: bold; font-size: 9px; margin-bottom: 2px;">QUÉT MÃ VIETQR</div>
                        ${getQRCodeHTML(ord.final_amount, ord.code)}
                    `;

                    content = `
                        <div style="display: grid; grid-template-columns: 1.2fr 1fr 1.3fr; gap: 8px; font-size: 10px;">
                            <div style="border: 1px solid #000; padding: 6px; border-radius: 2px;">
                                ${paymentBoxContent}
                            </div>
                            <div style="border: 1px solid #000; padding: 6px; border-radius: 2px; text-align: center; display: flex; flex-direction: column; align-items: center; justify-content: center;">
                                ${qrBoxContent}
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
                                        const hasItemDisc = !isWholesale && it.original_price && (it.original_price > it.price);
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
                                        const hasItemDisc = !isWholesale && it.original_price && (it.original_price > it.price);
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
                    txt = txt.replace(/{{ten_cua_hang}}/g, printData.ten_cua_hang);
                    txt = txt.replace(/{{dia_chi}}/g, printData.dia_chi);
                    txt = txt.replace(/{{so_dien_thoai}}/g, printData.so_dien_thoai);
                    txt = txt.replace(/{{loi_cam_on}}/g, printData.loi_cam_on);
                    txt = txt.replace(/{{ma_hoa_don}}/g, printData.ma_hoa_don);
                    txt = txt.replace(/{{ngay_gio}}/g, printData.ngay_gio);
                    txt = txt.replace(/{{thu_ngan}}/g, printData.thu_ngan);
                    txt = txt.replace(/{{ten_khach}}/g, printData.ten_khach);
                    txt = txt.replace(/{{sdt_khach}}/g, printData.sdt_khach);
            txt = txt.replace(/{{dia_chi_khach}}/g, printData.dia_chi_khach || '');
                    txt = txt.replace(/{{tong_tien}}/g, printData.tong_tien);
                    txt = txt.replace(/{{giam_gia}}/g, printData.giam_gia);
                    txt = txt.replace(/{{tiet_kiem}}/g, printData.tiet_kiem);
                    txt = txt.replace(/{{phai_tra}}/g, printData.phai_tra);
                    txt = txt.replace(/{{khach_tra}}/g, printData.khach_tra);
                    txt = txt.replace(/{{con_no}}/g, printData.con_no);
                    content = `<div style="font-size: ${e.fsz || 12}px; font-weight: ${e.bold ? 'bold' : 'normal'}; font-style: ${e.italic ? '' : 'normal'}; text-align: ${e.align || 'left'};">${txt}</div>`;
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

                html += `<div data-zone="${e.zone || 'header'}" style="position: absolute; left: ${e.x || 0}px; top: ${printY}px; width: ${elemW};">${content}</div>`;
            });

            html += `</div></div>`;

            // Sau khi render, do va scale fit container
            const printArea = document.getElementById('print-area');
            printArea.innerHTML = html;

            // Tu dong do dac DOM thuc te va day footer neu bang vuot uoc tinh
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
                pm.style.display = 'flex';
                pm.classList.remove('hidden');
                pm.classList.add('flex');
            }
        }

        async function showPrintModal(orderCode) {
            if (typeof window.showPrintModal === 'function' && window.showPrintModal !== showPrintModal) {
                return window.showPrintModal(orderCode);
            }
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
            if (!orderCode) return;
            const res = await fetch(`/api/orders/${orderCode}`);
            if (!res.ok) return;
            const ord = await res.json();
            window.currentLoadedPrintOrder = ord;

            const isWholesale = typeof isWholesaleOrder === 'function' ? isWholesaleOrder(ord) : !!(
                ord.is_wholesale ||
                (ord.customer_name && (ord.customer_name.toLowerCase().includes('đại lý') || ord.customer_name.toLowerCase().includes('dai ly') || ord.customer_name.toLowerCase().includes('sỉ') || ord.customer_name.toLowerCase().includes('si '))) ||
                ord.customer_price_list_name ||
                (ord.items && ord.items.some(it => it.price_list_name))
            );
            const defaultSize = isWholesale ? 'A4' : 'K80';
            const presetKey = isWholesale ? 'a4_b2b' : (multiTemplates?.presets?.['k80_default'] ? 'k80_default' : 'k80_standard');

            if (multiTemplates && multiTemplates.presets && multiTemplates.presets[presetKey]) {
                multiTemplates.active_preset = presetKey;
                paperSize = multiTemplates.presets[presetKey].paper_size || (isWholesale ? "A4-portrait" : "K80");
                canvasElements = multiTemplates.presets[presetKey].elements;
            }
            if (window.posPrintConfig && window.posPrintConfig.presets) {
                window.posPrintConfig.active_preset = presetKey;
            }
            if (typeof updateModalPrintSizeButtons === 'function') {
                updateModalPrintSizeButtons(defaultSize);
            }
            if (typeof populateModalPrintPresets === 'function') {
                populateModalPrintPresets(presetKey);
            }
            renderAndPrint(ord);
        }

        function switchModalPrintSize(size) {
            const isK80 = size === 'K80';
            const targetPreset = isK80 ? (multiTemplates?.presets?.['k80_default'] ? 'k80_default' : 'k80_standard') : 'a4_b2b';
            if (multiTemplates && multiTemplates.presets && multiTemplates.presets[targetPreset]) {
                multiTemplates.active_preset = targetPreset;
                paperSize = multiTemplates.presets[targetPreset].paper_size || (isK80 ? "K80" : "A4-portrait");
                canvasElements = multiTemplates.presets[targetPreset].elements;
            }
            if (window.posPrintConfig) {
                window.posPrintConfig.active_preset = targetPreset;
            }
            const selTemplate = document.getElementById('pos-template-select');
            if (selTemplate) selTemplate.value = targetPreset;
            const selModal = document.getElementById('modal-print-preset-select');
            if (selModal) selModal.value = targetPreset;
            if (typeof updateModalPrintSizeButtons === 'function') {
                updateModalPrintSizeButtons(size);
            }
            if (window.currentLoadedPrintOrder) {
                renderAndPrint(window.currentLoadedPrintOrder);
            }
        }
        window.switchModalPrintSize = switchModalPrintSize;




        function closePrintModal() {
            const pm = document.getElementById('print-modal');
            if (pm) {
                pm.classList.add('hidden');
                pm.classList.remove('flex');
                pm.style.display = 'none';
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

        function populateOEMFactoryFilter(orders) {
            const sel = document.getElementById('oem-filter-factory');
            if (!sel) return;
            const currentVal = sel.value;
            const factoryCounts = {};
            (orders || []).forEach(o => {
                const name = o.partner_name || 'Xưởng gia công';
                factoryCounts[name] = (factoryCounts[name] || 0) + 1;
            });
            const names = Object.keys(factoryCounts).sort();
            let html = `<option value="">Tất cả nhà máy (${names.length} xưởng)</option>`;
            names.forEach(name => {
                html += `<option value="${escapeHtml(name)}">${escapeHtml(name)} (${factoryCounts[name]} đơn)</option>`;
            });
            sel.innerHTML = html;
            if (currentVal && names.includes(currentVal)) {
                sel.value = currentVal;
            }
        }

        function filterOEMOrdersLocal() {
            const query = (document.getElementById('oem-search-filter')?.value || '').trim().toLowerCase();
            const factory = (document.getElementById('oem-filter-factory')?.value || '').trim().toLowerCase();

            let filtered = allOEMOrders || [];
            if (factory) {
                filtered = filtered.filter(o => (o.partner_name || '').toLowerCase() === factory);
            }
            if (query) {
                filtered = filtered.filter(o => {
                    const code = (o.code || '').toLowerCase();
                    const partner = (o.partner_name || '').toLowerCase();
                    const wh = (o.oem_warehouse_name || '').toLowerCase();
                    return code.includes(query) || partner.includes(query) || wh.includes(query);
                });
            }

            renderOEMOrdersTable(filtered);
            const elCount = document.getElementById('oem-order-count');
            if (elCount) elCount.innerText = `${filtered.length} đơn`;
        }
        window.filterOEMOrdersLocal = filterOEMOrdersLocal;

        async function loadOEMOrders() {
            try {
                const statusFilter = document.getElementById('oem-filter-status')?.value || '';
                let url = '/api/oem/orders';
                if (statusFilter) url += `?status=${statusFilter}`;
                const res = await fetch(url);
                if (!res.ok) return;
                allOEMOrders = await res.json();
                populateOEMFactoryFilter(allOEMOrders);
                filterOEMOrdersLocal();
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

            const remainingCompany = allOEMOrders
                .filter(o => o.fund_source === 'COMPANY' && (o.status === 'DRAFT' || o.status === 'DEPOSITED'))
                .reduce((sum, o) => sum + (o.remaining_payment || 0), 0);
            const elForecast = document.getElementById('oem-stat-forecast-company');
            if (elForecast) elForecast.innerText = formatMoney(remainingCompany);

            const elTotal = document.getElementById('oem-stat-total-count');
            if (elTotal) elTotal.innerText = `${allOEMOrders.length} đơn`;

            const elCount = document.getElementById('oem-order-count');
            if (elCount) elCount.innerText = `${allOEMOrders.length} đơn`;
        }

        function closeAllOEMActionMenus() {
            document.querySelectorAll('.oem-action-dropdown').forEach(m => m.classList.add('hidden'));
        }
        window.closeAllOEMActionMenus = closeAllOEMActionMenus;

        function toggleOEMActionMenu(orderId, event) {
            if (event) event.stopPropagation();
            const targetMenu = document.getElementById(`oem-menu-${orderId}`);
            document.querySelectorAll('.oem-action-dropdown').forEach(m => {
                if (m !== targetMenu) m.classList.add('hidden');
            });
            if (targetMenu) targetMenu.classList.toggle('hidden');
        }
        window.toggleOEMActionMenu = toggleOEMActionMenu;

        document.addEventListener('click', (e) => {
            if (!e.target.closest('.oem-action-dropdown') && !e.target.closest('[onclick^="toggleOEMActionMenu"]')) {
                closeAllOEMActionMenus();
            }
        });

        function renderOEMOrdersTable(ordersToRender) {
            const tbody = document.getElementById('table-oem-orders');
            if (!tbody) return;
            const orders = ordersToRender !== undefined ? ordersToRender : allOEMOrders;
            if (!orders || orders.length === 0) {
                tbody.innerHTML = '<tr><td colspan="7" class="p-6 text-center text-slate-400 font-medium">Chưa có đơn đặt gia công OEM nào khớp điều kiện tìm kiếm.</td></tr>';
                return;
            }

            tbody.innerHTML = orders.map(o => {
                let statusBadge = '';
                if (o.status === 'DRAFT') {
                    statusBadge = '<span class="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-bold bg-slate-100 text-slate-600 border border-slate-200">Bản Nháp</span>';
                } else if (o.status === 'DEPOSITED') {
                    statusBadge = '<span class="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-bold bg-amber-100 text-amber-800 border border-amber-200"><span>⏳</span><span>Đang SX</span></span>';
                } else if (o.status === 'RECEIVED') {
                    statusBadge = '<span class="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-bold bg-emerald-100 text-emerald-800 border border-emerald-200"><span>✅</span><span>Đã Nhận Hàng</span></span>';
                } else {
                    statusBadge = `<span class="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-bold bg-slate-100 text-slate-700">${o.status}</span>`;
                }

                const fundText = o.fund_source === 'COMPANY' ? '🏢 Quỹ Cty (VAT)' : '👤 Quỹ Cá Nhân';
                const totalAmt = o.total_final_amount || 0;
                const depositAmt = o.deposit_amount || 0;
                const remainingAmt = o.remaining_payment !== undefined && o.remaining_payment !== null ? o.remaining_payment : (totalAmt - depositAmt);
                const pct = totalAmt > 0 ? Math.min(100, Math.max(0, Math.round((depositAmt / totalAmt) * 100))) : (depositAmt > 0 ? 100 : 0);

                let primaryActionBtn = '';
                if (o.status === 'DRAFT') {
                    primaryActionBtn = `
                        <button type="button" onclick="confirmOEMDraftToOrder(${o.id}, '${escapeHtml(o.code)}')" class="px-2.5 py-1 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-bold shadow-2xs transition flex items-center gap-1" title="Chốt đơn nháp thành Đơn Đặt Hàng chính thức">
                            <span>🚀</span> Chốt Đơn
                        </button>
                    `;
                } else if (o.status === 'DEPOSITED') {
                    primaryActionBtn = `
                        <button type="button" onclick="openModalReceiveOEM(${o.id})" class="px-2.5 py-1 bg-amber-500 hover:bg-amber-600 text-white rounded-lg text-xs font-bold shadow-2xs transition" title="Nhận hàng thực tế từ xưởng & quyết toán">
                            Nhận hàng
                        </button>
                    `;
                } else {
                    primaryActionBtn = `
                        <button type="button" onclick="printOEMInspectionSheet(${o.id})" class="px-2.5 py-1 bg-sky-50 hover:bg-sky-100 text-sky-700 rounded-lg text-xs font-bold border border-sky-200 transition" title="In phiếu kiểm nhận hàng">
                            🖨️ In Phiếu
                        </button>
                    `;
                }

                return `
                    <tr onclick="viewOEMOrderDetail(${o.id})" class="hover:bg-slate-50/70 transition cursor-pointer border-b border-slate-100">
                        <td class="p-3 font-mono font-bold text-amber-700">
                            <span>${escapeHtml(o.code)}</span>
                        </td>
                        <td class="p-3 font-mono text-xs text-slate-500 whitespace-nowrap">
                            ${typeof formatDateTime === 'function' ? (formatDateTime(o.created_at) || '—') : (o.created_at || '—')}
                        </td>
                        <td class="p-3">
                            <div class="font-bold text-slate-900">${escapeHtml(o.partner_name || 'Xưởng gia công')}</div>
                            <div class="text-xs text-slate-500 flex items-center gap-1 mt-0.5">
                                <span>📦 ${escapeHtml(o.oem_warehouse_name || 'Kho xưởng')}</span>
                            </div>
                        </td>
                        <td class="p-3 text-right">
                            <div class="font-mono font-bold text-slate-900 text-xs">${formatMoney(totalAmt)}</div>
                            <div class="text-xs text-slate-400 font-normal">${fundText}</div>
                        </td>
                        <td class="p-3 text-right">
                            <div class="w-full bg-slate-200 rounded-full h-1.5 mb-1 overflow-hidden">
                                <div class="${pct >= 100 ? 'bg-emerald-500' : 'bg-amber-500'} h-1.5 rounded-full" style="width: ${pct}%"></div>
                            </div>
                            <div class="font-mono text-xs font-semibold text-emerald-700">
                                Cọc: ${formatMoney(depositAmt)} <span class="text-slate-400 font-normal">(${pct}%)</span>
                            </div>
                            <div class="font-mono text-xs ${remainingAmt > 0 ? 'text-rose-600 font-medium' : 'text-emerald-600 font-bold'}">
                                ${remainingAmt > 0 ? `Còn: ${formatMoney(remainingAmt)} (${100 - pct}%)` : '✅ Đã xong (0 đ)'}
                            </div>
                        </td>
                        <td class="p-3 text-center">
                            ${statusBadge}
                        </td>
                        <td class="p-3 text-center" onclick="event.stopPropagation()">
                            <div class="flex items-center justify-center gap-1.5 relative">
                                ${primaryActionBtn}
                                <div class="relative">
                                    <button type="button" onclick="toggleOEMActionMenu(${o.id}, event)" class="w-7 h-7 rounded-lg hover:bg-slate-100 border border-slate-200 text-slate-600 flex items-center justify-center font-bold text-sm transition" title="Thao tác khác">
                                        ⋮
                                    </button>
                                    <div id="oem-menu-${o.id}" class="hidden oem-action-dropdown absolute right-0 bottom-full mb-1 bg-white border border-slate-200 rounded-xl shadow-xl z-50 w-36 py-1 text-left text-xs divide-y divide-slate-100">
                                        <div class="py-0.5">
                                            ${o.status === 'DRAFT' ? `
                                                <button type="button" onclick="closeAllOEMActionMenus(); confirmOEMDraftToOrder(${o.id}, '${escapeHtml(o.code)}')" class="w-full px-3 py-1.5 hover:bg-emerald-50 flex items-center gap-2 text-emerald-700 font-bold">
                                                    <span>🚀</span> <span>Chốt Đặt Hàng</span>
                                                </button>
                                            ` : ''}
                                            <button type="button" onclick="closeAllOEMActionMenus(); viewOEMOrderDetail(${o.id})" class="w-full px-3 py-1.5 hover:bg-slate-50 flex items-center gap-2 text-slate-700">
                                                <span>ℹ️</span> <span>Chi tiết</span>
                                            </button>
                                            <button type="button" onclick="closeAllOEMActionMenus(); printOEMInspectionSheet(${o.id})" class="w-full px-3 py-1.5 hover:bg-slate-50 flex items-center gap-2 text-sky-700">
                                                <span>🖨️</span> <span>In phiếu kiểm</span>
                                            </button>
                                            <button type="button" onclick="closeAllOEMActionMenus(); openModalEditOEM(${o.id})" class="w-full px-3 py-1.5 hover:bg-slate-50 flex items-center gap-2 text-sky-700">
                                                <span>✏️</span> <span>Sửa</span>
                                            </button>
                                        </div>
                                        <div class="py-0.5">
                                            <button type="button" onclick="closeAllOEMActionMenus(); deleteOEMOrder(${o.id}, '${escapeHtml(o.code)}', '${o.status}')" class="w-full px-3 py-1.5 hover:bg-rose-50 flex items-center gap-2 text-rose-600 font-bold">
                                                <span>🗑️</span> <span>Xóa</span>
                                            </button>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </td>
                    </tr>
                `;
            }).join('');
        }

        async function confirmOEMDraftToOrder(orderId, orderCode) {
            let confirmed = false;
            if (typeof window.showConfirmModal === 'function') {
                confirmed = await window.showConfirmModal({
                    title: "Chốt Đặt Hàng Gia Công OEM",
                    message: `Bạn có muốn chuyển đơn nháp <b>${orderCode}</b> thành đơn đặt hàng chính thức (Đang SX)?`,
                    confirmText: "Chốt Đặt Hàng",
                    cancelText: "Hủy bỏ",
                    icon: "🚀"
                });
            } else {
                confirmed = confirm(`Bạn có muốn chuyển đơn nháp ${orderCode} thành đơn đặt hàng chính thức?`);
            }

            if (!confirmed) return;

            try {
                const res = await fetch(`/api/oem/orders/${orderId}/confirm`, {
                    method: 'POST'
                });
                if (!res.ok) {
                    const err = await res.json();
                    throw new Error(err.detail || 'Lỗi chuyển đổi đơn OEM');
                }
                alert(`✅ Đã chốt đơn gia công OEM ${orderCode} thành công! Trạng thái: Đang SX.`);
                loadOEMData();
            } catch (e) {
                alert(`❌ Lỗi: ${e.message}`);
            }
        }
        window.confirmOEMDraftToOrder = confirmOEMDraftToOrder;

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
            else if (fund === 'PERSONAL' && btnPer) btnPer.className = 'px-2.5 py-1 rounded font-bold bg-sky-500 text-white';

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
                container.innerHTML = '<div class="text-center py-3 text-slate-400 text-xs ">Không có khoản chi dự báo nào trong khoảng thời gian này.</div>';
                return;
            }

            container.innerHTML = items.map(it => {
                const dateStr = it.expected_delivery_date || 'Chưa định ngày';
                const isCty = it.fund_source === 'COMPANY';
                return `
                    <div class="flex flex-wrap items-center justify-between bg-slate-800/90 hover:bg-slate-800 p-2.5 rounded-lg border border-slate-700 text-xs gap-2">
                        <div class="flex items-center gap-2">
                            <span class="px-2 py-0.5 rounded font-mono font-bold text-xs ${isCty ? 'bg-blue-900 text-blue-300 border border-blue-700' : 'bg-sky-900 text-sky-300 border border-sky-700'}">
                                ${isCty ? '🏢 Quỹ Cty' : '👤 Cá Nhân'}
                            </span>
                            <div>
                                <span class="font-bold text-amber-300">${it.code}</span> - 
                                <span class="text-slate-200">${it.partner_name || 'Nhà cung cấp'}</span>
                                <span class="text-xs text-slate-400 ml-1">(${it.order_type === 'OEM' ? 'Gia công OEM' : 'Nhập hàng'})</span>
                            </div>
                        </div>
                        <div class="flex items-center gap-4">
                            <div class="text-right">
                                <div class="text-xs text-slate-400">Hạn nhận (trừ hao ±1 ngày):</div>
                                <div class="font-mono text-slate-200 font-bold">📅 ${dateStr}</div>
                            </div>
                            <div class="text-right">
                                <div class="text-xs text-slate-400">Dự kiến chi:</div>
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
            document.getElementById('oem-create-date').value = (typeof getLocalTodayDateStr === 'function') ? getLocalTodayDateStr(today) : new Intl.DateTimeFormat('en-CA').format(today);

            // Reset target type mặc định về 'product'
            setOEMTargetType('product');

            setOEMDiscountType('percent');
            document.getElementById('oem-create-discount').value = '0';
            document.getElementById('oem-create-vat').value = '0';
            document.getElementById('oem-create-fund').value = 'COMPANY';
            document.getElementById('oem-create-deposit').value = '0';
            document.getElementById('oem-create-note').value = '';
            const quickInp = document.getElementById('oem-prod-quick-search-input');
            if (quickInp) quickInp.value = '';

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
            if (btnSubmit) {
                btnSubmit.disabled = false;
                btnSubmit.innerText = '🚀 Lưu Đơn & Xuất Cọc Sổ Quỹ';
            }
            const btnDraft = document.getElementById('btn-submit-draft-oem');
            if (btnDraft) {
                btnDraft.disabled = false;
                btnDraft.classList.remove('hidden');
            }
            const modalTitle = document.querySelector('#modal-create-oem h3 span');
            if (modalTitle) modalTitle.innerText = '➕ Lập Đơn Đặt Gia Công OEM Mới';
        }
        window.closeModalCreateOEM = closeModalCreateOEM;

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
                                ${f.phone ? `<span class="text-gray-400 text-xs">(${f.phone})</span>` : ''}
                            </div>
                            <div class="text-xs text-emerald-700 font-medium flex items-center gap-1 mt-0.5">
                                <span>📦 Kho xưởng:</span>
                                <strong class="underline">${f.warehouse_name}</strong>
                            </div>
                        </div>
                        <div class="text-right">
                            <span class="bg-amber-100 text-amber-900 font-bold px-2 py-0.5 rounded text-xs">${f.product_count} SP gia công</span>
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

            // Reset danh sách sản phẩm để người dùng tự chọn, không tự động điền sẵn
            const itemsBody = document.getElementById('oem-create-items-body');
            if (itemsBody) {
                itemsBody.innerHTML = '';
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

        // --- QUICK-SEARCH SẢN PHẨM THẢ THẲNG VÀO BẢNG ĐƠN OEM (CHUẨN POS) ---
        function showOEMQuickSearchDropdown() {
            filterOEMQuickSearchDropdown();
            document.getElementById('oem-prod-quick-search-dropdown')?.classList.remove('hidden');
        }
        window.showOEMQuickSearchDropdown = showOEMQuickSearchDropdown;

        function filterOEMQuickSearchDropdown() {
            const input = document.getElementById('oem-prod-quick-search-input');
            const dd = document.getElementById('oem-prod-quick-search-dropdown');
            if (!dd) return;

            if (!selectedOEMFactory) {
                dd.innerHTML = `
                    <div class="p-3 text-center text-amber-800 bg-amber-50 font-bold">
                        ⚠️ Vui lòng chọn Nhà Máy Gia Công ở ô bên trên trước!
                    </div>
                `;
                dd.classList.remove('hidden');
                return;
            }

            // Lấy danh sách các sản phẩm đang có trong bảng cùng số lượng đã đặt
            const existingQtyMap = new Map();
            document.querySelectorAll('.oem-item-row').forEach(r => {
                const id = parseInt(r.querySelector('.oem-prod-id')?.value);
                const qty = parseFloat(r.querySelector('.oem-prod-qty')?.value) || 0;
                if (id) existingQtyMap.set(id, qty);
            });

            const q = (input?.value || '').toLowerCase().trim();
            let sourceList = [];
            if (currentOEMTargetType === 'ingredient') {
                sourceList = (allCostIngredients || []).filter(i => i.type === 'IS_PHYSICAL');
            } else {
                sourceList = (currentFactoryProducts && currentFactoryProducts.length > 0)
                    ? currentFactoryProducts
                    : (allProducts || []);
            }

            const filtered = sourceList.filter(p => 
                p.name.toLowerCase().includes(q) || 
                (p.code && p.code.toLowerCase().includes(q))
            );

            if (filtered.length === 0) {
                dd.innerHTML = `
                    <div class="p-3 text-center text-gray-500">
                        Không tìm thấy sản phẩm phù hợp.<br>
                        <button type="button" onclick="openModalAddProductToFactory()" class="mt-1 text-emerald-700 font-bold underline">+ Gán thêm sản phẩm cho xưởng này</button>
                    </div>
                `;
            } else {
                // Tách làm 2 nhóm: Chưa chọn (lên trên) vs Đã chọn (xuống dưới & làm mờ)
                const unselectedList = filtered.filter(p => !existingQtyMap.has(p.id));
                const selectedList = filtered.filter(p => existingQtyMap.has(p.id));

                let html = '';

                // 1. NHÓM CHƯA CHỌN
                if (unselectedList.length > 0) {
                    html += `
                        <div class="bg-slate-50 px-3 py-1 text-xs font-bold text-slate-500 uppercase tracking-wider flex items-center justify-between">
                            <span>📦 Chưa chọn vào đơn (${unselectedList.length})</span>
                            <span class="text-slate-400  font-normal">Click để thêm nhanh</span>
                        </div>
                    `;
                    html += unselectedList.map(p => `
                        <div onclick="quickAddOEMProduct(${p.id})" class="p-2.5 hover:bg-amber-50 cursor-pointer flex justify-between items-center transition group">
                            <div class="flex items-center gap-2">
                                <span class="w-6 h-6 rounded bg-amber-100 text-amber-800 flex items-center justify-center font-bold text-xs shrink-0">📦</span>
                                <div>
                                    <div class="font-bold text-slate-800 group-hover:text-amber-900">${p.code ? '['+p.code+'] ' : ''}${p.name}</div>
                                    <div class="text-xs text-gray-500">ĐVT: <strong class="text-slate-700">${p.unit || 'chai'}</strong> | Đơn giá niêm yết: <strong class="text-emerald-700 font-mono">${formatMoney(p.cost_price || 0)}</strong></div>
                                </div>
                            </div>
                            <div class="text-right flex items-center gap-2 shrink-0">
                                <span class="text-xs ${p.bom_count > 0 ? 'bg-emerald-100 text-emerald-800' : 'bg-gray-100 text-gray-600'} px-1.5 py-0.5 rounded font-bold">
                                    ${p.bom_count > 0 ? 'Có BOM' : 'Chưa BOM'}
                                </span>
                                <span class="text-xs bg-slate-100 group-hover:bg-amber-600 group-hover:text-white px-2.5 py-1 rounded-md font-bold transition">
                                    + Thêm
                                </span>
                            </div>
                        </div>
                    `).join('');
                }

                // 2. NHÓM ĐÃ CHỌN (ĐẨY XUỐNG DƯỚI & LÀM MỜ)
                if (selectedList.length > 0) {
                    html += `
                        <div class="bg-emerald-50/70 px-3 py-1 text-xs font-bold text-emerald-800 uppercase tracking-wider flex items-center justify-between border-t border-emerald-200">
                            <span>✓ Đã có trong đơn (${selectedList.length})</span>
                            <span class="text-emerald-600 font-normal">Click để tăng thêm SL</span>
                        </div>
                    `;
                    html += selectedList.map(p => {
                        const currentQty = existingQtyMap.get(p.id) || 0;
                        return `
                            <div onclick="quickAddOEMProduct(${p.id})" class="p-2.5 bg-slate-50/60 hover:bg-emerald-50/60 cursor-pointer flex justify-between items-center transition opacity-60 hover:opacity-100 group ">
                                <div class="flex items-center gap-2">
                                    <span class="w-6 h-6 rounded bg-emerald-100 text-emerald-800 flex items-center justify-center font-bold text-xs shrink-0">✓</span>
                                    <div>
                                        <div class="font-bold text-slate-700 line-through decoration-slate-400 group-hover:no-underline">${p.code ? '['+p.code+'] ' : ''}${p.name}</div>
                                        <div class="text-xs text-slate-500 flex items-center gap-1.5 mt-0.5">
                                            <span>ĐVT: ${p.unit || 'chai'}</span>
                                            <span class="px-1.5 py-0.5 rounded bg-emerald-100 text-emerald-800 font-bold border border-emerald-300 text-xs">Đã lên đơn: ${currentQty.toLocaleString('vi-VN')} ${p.unit || 'chai'}</span>
                                        </div>
                                    </div>
                                </div>
                                <div class="text-right shrink-0">
                                    <span class="text-xs bg-slate-200 group-hover:bg-emerald-600 group-hover:text-white text-slate-700 px-2 py-1 rounded-md font-bold transition">
                                        + Tăng SL
                                    </span>
                                </div>
                            </div>
                        `;
                    }).join('');
                }

                dd.innerHTML = html;
            }
            dd.classList.remove('hidden');
        }
        window.filterOEMQuickSearchDropdown = filterOEMQuickSearchDropdown;

        function quickAddOEMProduct(productId) {
            let p = null;
            if (currentOEMTargetType === 'ingredient') {
                p = (allCostIngredients || []).find(x => x.id === productId);
            } else {
                p = (currentFactoryProducts.length > 0 ? currentFactoryProducts : allProducts).find(x => x.id === productId);
            }
            if (!p) return;

            const itemsBody = document.getElementById('oem-create-items-body');
            if (!itemsBody) return;

            // Kiểm tra xem sản phẩm đã có trong bảng chưa, nếu có thì tăng số lượng
            const existingRows = document.querySelectorAll('.oem-item-row');
            let found = false;
            existingRows.forEach(r => {
                const idInp = r.querySelector('.oem-prod-id');
                if (idInp && parseInt(idInp.value) === productId) {
                    const qtyInp = r.querySelector('.oem-prod-qty');
                    if (qtyInp) {
                        qtyInp.value = (parseFloat(qtyInp.value) || 0) + 100;
                        qtyInp.focus();
                        qtyInp.select();
                    }
                    found = true;
                }
            });

            if (!found) {
                const tr = document.createElement('tr');
                tr.className = 'border-b hover:bg-slate-50 oem-item-row transition';
                const initialPrice = p.cost_price > 0 ? p.cost_price : '';
                const itemVat = p.vat_rate !== undefined && p.vat_rate !== null ? p.vat_rate : 8;
                tr.innerHTML = `
                    <td class="p-2.5">
                        <div class="font-bold text-slate-800 text-xs">${p.code ? '['+p.code+'] ' : ''}${p.name}</div>
                        <div class="text-xs text-gray-500">ĐVT: <strong class="text-slate-700">${p.unit || 'chai'}</strong> | ${p.bom_count > 0 ? '<span class="text-emerald-700 font-semibold">Đã cấu hình định mức BOM</span>' : '<span class="text-amber-600 ">Chưa có định mức BOM</span>'}</div>
                        <input type="hidden" class="oem-prod-id" value="${p.id}">
                        <input type="hidden" class="oem-prod-unit" value="${p.unit || 'chai'}">
                    </td>
                    <td class="p-2.5">
                        <input type="number" step="any" min="1" value="" placeholder="Nhập SL" class="oem-prod-qty border border-slate-300 p-1.5 rounded-lg w-full text-right font-mono font-bold text-slate-800 focus:ring-1 focus:ring-amber-500" oninput="recalcCreateOEMMath()">
                    </td>
                    <td class="p-2.5">
                        <input type="number" step="any" min="0" value="${initialPrice !== '' ? initialPrice : ''}" placeholder="0" class="oem-prod-price border border-slate-300 p-1.5 rounded-lg w-full text-right font-mono font-bold text-slate-800 focus:ring-1 focus:ring-amber-500" oninput="recalcCreateOEMMath()">
                    </td>
                    <td class="p-2.5">
                        <input type="number" step="any" min="0" max="100" value="${itemVat}" placeholder="8" class="oem-prod-vat border border-slate-300 p-1.5 rounded-lg w-full text-right font-mono font-bold text-slate-800 focus:ring-1 focus:ring-amber-500" oninput="recalcCreateOEMMath()">
                    </td>
                    <td class="p-2.5 text-right font-mono font-bold text-slate-800 oem-row-total">
                        0 đ
                    </td>
                    <td class="p-2.5 text-center">
                        <button type="button" onclick="removeOEMProductRow(this)" class="text-slate-400 hover:text-rose-600 font-bold text-base p-1 transition" title="Xóa dòng này">✕</button>
                    </td>
                `;
                itemsBody.appendChild(tr);

                // Focus vào ô số lượng của dòng vừa tạo để gõ nhanh
                setTimeout(() => {
                    const lastQty = tr.querySelector('.oem-prod-qty');
                    if (lastQty) {
                        lastQty.focus();
                    }
                }, 50);
            }

            // Xóa input và ẩn dropdown tìm kiếm
            const input = document.getElementById('oem-prod-quick-search-input');
            if (input) input.value = '';
            document.getElementById('oem-prod-quick-search-dropdown')?.classList.add('hidden');

            recalcCreateOEMMath();
            // Cập nhật lại trạng thái droplist tìm kiếm nếu đang mở
            const dd = document.getElementById('oem-prod-quick-search-dropdown');
            if (dd && !dd.classList.contains('hidden')) {
                filterOEMQuickSearchDropdown();
            }
        }
        window.quickAddOEMProduct = quickAddOEMProduct;

        function renderOEMItemRow(item) {
            const p = (currentFactoryProducts && currentFactoryProducts.length > 0 ? currentFactoryProducts : (allProducts || [])).find(x => x.id === item.product_id) || {};
            const code = item.product_code || p.code || '';
            const name = item.product_name || p.name || 'Sản phẩm';
            const unit = item.product_unit || p.unit || 'chai';
            const bomCount = item.bom_count !== undefined ? item.bom_count : (p.bom_count || 0);
            const qty = (item.ordered_qty !== undefined && item.ordered_qty !== null && item.ordered_qty !== '') ? item.ordered_qty : '';
            const defaultCost = p.cost_price > 0 ? p.cost_price : '';
            const price = (item.unit_price !== undefined && item.unit_price !== null && item.unit_price !== '') ? item.unit_price : defaultCost;
            const itemVat = item.vat_rate !== undefined && item.vat_rate !== null ? item.vat_rate : (p.vat_rate !== undefined && p.vat_rate !== null ? p.vat_rate : 8);

            const tr = document.createElement('tr');
            tr.className = 'border-b hover:bg-slate-50 oem-item-row transition';
            tr.innerHTML = `
                <td class="p-2.5">
                    <div class="font-bold text-slate-800 text-xs">${code ? '['+code+'] ' : ''}${name}</div>
                    <div class="text-xs text-gray-500">ĐVT: <strong class="text-slate-700">${unit}</strong> | ${bomCount > 0 ? '<span class="text-emerald-700 font-semibold">Đã cấu hình định mức BOM</span>' : '<span class="text-amber-600 ">Chưa có định mức BOM</span>'}</div>
                    <input type="hidden" class="oem-prod-id" value="${item.product_id}">
                    <input type="hidden" class="oem-prod-unit" value="${unit}">
                </td>
                <td class="p-2.5">
                    <input type="number" step="any" min="1" value="${qty}" placeholder="Nhập SL" class="oem-prod-qty border border-slate-300 p-1.5 rounded-lg w-full text-right font-mono font-bold text-slate-800 focus:ring-1 focus:ring-amber-500" oninput="recalcCreateOEMMath()">
                </td>
                <td class="p-2.5">
                    <input type="number" step="any" min="0" value="${price}" placeholder="0" class="oem-prod-price border border-slate-300 p-1.5 rounded-lg w-full text-right font-mono font-bold text-slate-800 focus:ring-1 focus:ring-amber-500" oninput="recalcCreateOEMMath()">
                </td>
                <td class="p-2.5">
                    <input type="number" step="any" min="0" max="100" value="${itemVat}" placeholder="8" class="oem-prod-vat border border-slate-300 p-1.5 rounded-lg w-full text-right font-mono font-bold text-slate-800 focus:ring-1 focus:ring-amber-500" oninput="recalcCreateOEMMath()">
                </td>
                <td class="p-2.5 text-right font-mono font-bold text-slate-800 oem-row-total">
                    0 đ
                </td>
                <td class="p-2.5 text-center">
                    <button type="button" onclick="removeOEMProductRow(this)" class="text-slate-400 hover:text-rose-600 font-bold text-base p-1 transition" title="Xóa dòng này">✕</button>
                </td>
            `;
            return tr;
        }
        window.renderOEMItemRow = renderOEMItemRow;

        function addOEMProductRow(item = null) {
            const itemsBody = document.getElementById('oem-create-items-body');
            if (!itemsBody) return;
            if (item && item.product_id) {
                const tr = renderOEMItemRow(item);
                itemsBody.appendChild(tr);
            }
        }
        window.addOEMProductRow = addOEMProductRow;

        // Đóng dropdown tìm kiếm khi click ngoài
        document.addEventListener('click', function(e) {
            const wrap = document.getElementById('oem-prod-quick-search-wrapper');
            const dd = document.getElementById('oem-prod-quick-search-dropdown');
            if (wrap && dd && !wrap.contains(e.target)) {
                dd.classList.add('hidden');
            }
        });

        function removeOEMProductRow(btn) {
            const tr = btn.closest('tr');
            if (tr) tr.remove();
            recalcCreateOEMMath();
            // Nếu dropdown tìm kiếm đang mở, tự động cập nhật lại danh sách để phản ánh ngay
            const dd = document.getElementById('oem-prod-quick-search-dropdown');
            if (dd && !dd.classList.contains('hidden')) {
                filterOEMQuickSearchDropdown();
            }
        }
        window.removeOEMProductRow = removeOEMProductRow;

        let currentOEMTargetType = 'product';

        function setOEMTargetType(type) {
            currentOEMTargetType = type;
            const hidden = document.getElementById('oem-create-target-type');
            if (hidden) hidden.value = type;

            const btnProd = document.getElementById('btn-oem-target-product');
            const btnIng = document.getElementById('btn-oem-target-ingredient');

            if (type === 'ingredient') {
                if (btnIng) {
                    btnIng.className = 'px-3 py-1 font-bold rounded-md bg-amber-600 text-white shadow-xs transition';
                }
                if (btnProd) {
                    btnProd.className = 'px-3 py-1 font-bold rounded-md text-slate-700 hover:text-slate-900 transition';
                }
            } else {
                if (btnProd) {
                    btnProd.className = 'px-3 py-1 font-bold rounded-md bg-amber-600 text-white shadow-xs transition';
                }
                if (btnIng) {
                    btnIng.className = 'px-3 py-1 font-bold rounded-md text-slate-700 hover:text-slate-900 transition';
                }
            }

            // Xóa danh sách sản phẩm/nguyên liệu cũ đang chọn khi đổi mode
            const tbody = document.getElementById('table-oem-items-body');
            if (tbody) tbody.innerHTML = '';
            filterOEMQuickSearchDropdown();
            recalcCreateOEMMath();
        }
        window.setOEMTargetType = setOEMTargetType;

        function setOEMDiscountType(type) {
            const hidden = document.getElementById('oem-create-discount-type');
            const btnPct = document.getElementById('btn-oem-discount-type-pct');
            const btnVnd = document.getElementById('btn-oem-discount-type-vnd');
            const input = document.getElementById('oem-create-discount');
            if (hidden) hidden.value = type;

            if (type === 'amount') {
                if (btnVnd) {
                    btnVnd.className = 'px-1.5 py-0.5 bg-emerald-600 text-white transition';
                }
                if (btnPct) {
                    btnPct.className = 'px-1.5 py-0.5 bg-white text-slate-700 hover:bg-slate-100 transition';
                }
                if (input && (parseFloat(input.value) <= 100)) {
                    input.placeholder = 'Số tiền (đ)';
                }
            } else {
                if (btnPct) {
                    btnPct.className = 'px-1.5 py-0.5 bg-emerald-600 text-white transition';
                }
                if (btnVnd) {
                    btnVnd.className = 'px-1.5 py-0.5 bg-white text-slate-700 hover:bg-slate-100 transition';
                }
                if (input) {
                    input.placeholder = '%';
                }
            }
            recalcCreateOEMMath();
        }
        window.setOEMDiscountType = setOEMDiscountType;

        // Tính toán số tiền & đối chiếu tồn kho BOM thực tế
        async function recalcCreateOEMMath() {
            const rows = document.querySelectorAll('.oem-item-row');
            let totalRaw = 0;
            let totalVat = 0;
            const selectedItems = [];

            const discountType = document.getElementById('oem-create-discount-type')?.value || 'percent';
            const discountInputVal = parseFloat(document.getElementById('oem-create-discount')?.value) || 0;
            const vatPct = parseFloat(document.getElementById('oem-create-vat')?.value) || 0;

            rows.forEach(r => {
                const prodId = parseInt(r.querySelector('.oem-prod-id')?.value);
                const qtyInput = r.querySelector('.oem-prod-qty');
                const priceInput = r.querySelector('.oem-prod-price');
                const vatInput = r.querySelector('.oem-prod-vat');
                const totalCell = r.querySelector('.oem-row-total');

                const qty = parseFloat(qtyInput?.value) || 0;
                const price = parseFloat(priceInput?.value) || 0;
                const itemVat = vatInput ? parseFloat(vatInput.value) : vatPct;
                const effectiveVat = !isNaN(itemVat) ? itemVat : vatPct;

                const rowTotal = qty * price;
                totalRaw += rowTotal;
                totalVat += rowTotal * (effectiveVat / 100);

                if (totalCell) totalCell.innerText = formatMoney(rowTotal);
                if (prodId && qty > 0) {
                    if (currentOEMTargetType === 'ingredient') {
                        selectedItems.push({ ingredient_id: prodId, item_type: 'ingredient', quantity: qty, vat_rate: effectiveVat });
                    } else {
                        selectedItems.push({ product_id: prodId, item_type: 'product', quantity: qty, vat_rate: effectiveVat });
                    }
                }
            });

            let discountAmount = 0;
            let discountDisplayLabel = '0%';

            if (discountType === 'amount') {
                discountAmount = Math.min(totalRaw, discountInputVal);
                const calcPct = totalRaw > 0 ? ((discountAmount / totalRaw) * 100).toFixed(1) : 0;
                discountDisplayLabel = `${formatMoney(discountAmount)} (${calcPct}%)`;
            } else {
                discountAmount = totalRaw * (discountInputVal / 100);
                discountDisplayLabel = `${discountInputVal}%`;
            }

            const rawAfterDiscount = Math.max(0, totalRaw - discountAmount);
            const vatAmount = totalVat; // VAT tính theo từng item
            const totalFinal = rawAfterDiscount + vatAmount;

            document.getElementById('oem-math-raw').innerText = formatMoney(totalRaw);
            document.getElementById('oem-lbl-discount').innerText = discountDisplayLabel;
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
                tbody.innerHTML = '<tr><td colspan="6" class="p-3 text-center text-gray-500 ">Chưa chọn sản phẩm hoặc số lượng đặt bằng 0.</td></tr>';
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
                    tbody.innerHTML = '<tr><td colspan="6" class="p-3 text-center text-rose-500 ">Lỗi tính toán tồn kho vật tư xưởng.</td></tr>';
                    return;
                }

                const materials = await res.json();
                if (materials.length === 0) {
                    tbody.innerHTML = '<tr><td colspan="6" class="p-3 text-center text-gray-500 ">Các sản phẩm này chưa được thiết lập công thức BOM (vỏ chai, tem nhãn...).</td></tr>';
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
                            <td class="p-2 text-right font-mono font-bold ${m.current_stock > 0 ? 'text-emerald-700' : 'text-rose-700'}">
                                ${m.current_stock.toLocaleString('vi-VN')}
                            </td>
                            <td class="p-2 text-right font-mono font-bold ${isOk ? 'text-emerald-600' : 'text-rose-600'}">
                                ${diffText}
                            </td>
                            <td class="p-2 text-center">
                                ${isOk ? `
                                    <span class="bg-emerald-100 text-emerald-800 font-bold px-2 py-0.5 rounded text-xs">
                                        ✅ Đủ tồn kho
                                    </span>
                                ` : `
                                    <span class="bg-rose-100 text-rose-800 font-bold px-2 py-0.5 rounded text-xs animate-pulse">
                                        ⚠️ Thiếu ${Math.abs(m.diff_qty).toLocaleString('vi-VN')} ${m.unit} (Cần gửi)
                                    </span>
                                `}
                            </td>
                        </tr>
                    `;
                }).join('');

            } catch (err) {
                console.error('Lỗi check BOM stock:', err);
                tbody.innerHTML = '<tr><td colspan="6" class="p-3 text-center text-rose-500 ">Lỗi kết nối máy chủ khi đối chiếu tồn kho.</td></tr>';
            }
        }

        async function submitCreateOEMOrder(isDraft = false) {
            const partnerId = parseInt(document.getElementById('oem-create-partner')?.value);
            if (!partnerId) return alert('Vui lòng chọn Nhà Máy Gia Công!');

            const oemWhId = parseInt(document.getElementById('oem-create-warehouse')?.value) || 1;
            const destWhId = parseInt(document.getElementById('oem-create-dest-warehouse')?.value) || 1;
            const fundSource = document.getElementById('oem-create-fund')?.value || 'COMPANY';
            const expectedDate = document.getElementById('oem-create-date')?.value;
            const discountType = document.getElementById('oem-create-discount-type')?.value || 'percent';
            const discountVal = parseFloat(document.getElementById('oem-create-discount')?.value) || 0;
            const vatPct = parseFloat(document.getElementById('oem-create-vat')?.value) || 0;
            const depositAmount = isDraft ? 0 : (parseFloat(document.getElementById('oem-create-deposit')?.value) || 0);
            const note = document.getElementById('oem-create-note')?.value || '';

            const rows = document.querySelectorAll('.oem-item-row');
            const items = [];
            rows.forEach(r => {
                const prodId = parseInt(r.querySelector('.oem-prod-id')?.value);
                const qty = parseFloat(r.querySelector('.oem-prod-qty')?.value) || 0;
                const price = parseFloat(r.querySelector('.oem-prod-price')?.value) || 0;
                const vatVal = parseFloat(r.querySelector('.oem-prod-vat')?.value);
                const effectiveVat = !isNaN(vatVal) ? vatVal : vatPct;
                if (prodId && qty > 0) {
                    if (currentOEMTargetType === 'ingredient') {
                        items.push({
                            item_type: 'ingredient',
                            ingredient_id: prodId,
                            ordered_qty: qty,
                            unit_price: price,
                            vat_rate: effectiveVat
                        });
                    } else {
                        items.push({
                            item_type: 'product',
                            product_id: prodId,
                            ordered_qty: qty,
                            unit_price: price,
                            vat_rate: effectiveVat
                        });
                    }
                }
            });

            if (items.length === 0) {
                return alert('Vui lòng chọn ít nhất 1 sản phẩm hoặc nguyên liệu cần đặt gia công!');
            }

            const payload = {
                partner_id: partnerId,
                target_type: currentOEMTargetType || 'product',
                oem_warehouse_id: oemWhId,
                dest_warehouse_id: destWhId,
                expected_delivery_date: expectedDate,
                discount_type: discountType,
                discount_percent: discountType === 'percent' ? discountVal : 0,
                discount_amount: discountType === 'amount' ? discountVal : null,
                vat_percent: vatPct,
                fund_source: fundSource,
                note: note,
                items: items,
                is_draft: isDraft,
                is_confirm: !isDraft
            };
            const isEdit = !!editingOEMOrderId;
            if (!isEdit) payload.deposit_amount = depositAmount;

            const btnSubmit = document.getElementById('btn-submit-create-oem');
            const btnDraft = document.getElementById('btn-submit-draft-oem');
            if (btnSubmit) {
                btnSubmit.disabled = true;
                btnSubmit.innerText = isDraft ? 'Đang lưu đơn...' : 'Đang lưu đơn & xuất cọc...';
            }
            if (btnDraft) {
                btnDraft.disabled = true;
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
                } else if (isDraft) {
                    alert(`✅ Đã lưu bản nháp đơn gia công OEM thành công: ${data.code}\n(Đơn nháp chưa xuất cọc sổ quỹ, bạn có thể chỉnh sửa hoặc xóa bất cứ lúc nào)`);
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
                if (btnDraft) {
                    btnDraft.disabled = false;
                }
            }
        }
        window.submitCreateOEMOrder = submitCreateOEMOrder;

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

            // Thiết lập xưởng được chọn
            const factory = allOEMFactories.find(f => f.id === order.partner_id);
            selectedOEMFactory = factory || {
                id: order.partner_id,
                name: order.partner_name,
                warehouse_id: order.oem_warehouse_id,
                warehouse_name: order.oem_warehouse_name
            };

            // Tải danh sách sản phẩm thuộc xưởng này để phục vụ quick-search
            if (selectedOEMFactory && selectedOEMFactory.id) {
                try {
                    const resP = await fetch(`/api/oem/factories/${selectedOEMFactory.id}/products`);
                    if (resP.ok) {
                        currentFactoryProducts = await resP.json();
                    } else {
                        currentFactoryProducts = [];
                    }
                } catch(e) {
                    currentFactoryProducts = [];
                }
            }

            const destWhSel = document.getElementById('oem-create-dest-warehouse');
            if (destWhSel && allWarehouses) {
                destWhSel.innerHTML = allWarehouses.map(w => `<option value="${w.id}">📦 ${w.name} ${w.is_oem ? '(Kho Xưởng)' : ''}</option>`).join('');
            }

            document.getElementById('oem-create-partner').value = order.partner_id || '';
            document.getElementById('oem-create-warehouse').value = order.oem_warehouse_id || '';
            document.getElementById('oem-create-dest-warehouse').value = order.dest_warehouse_id || '1';
            document.getElementById('oem-create-date').value = order.expected_delivery_date || '';

            if (order.discount_amount && order.discount_amount > 0) {
                setOEMDiscountType('amount');
                document.getElementById('oem-create-discount').value = order.discount_amount;
            } else {
                setOEMDiscountType('percent');
                document.getElementById('oem-create-discount').value = order.discount_percent ?? 0;
            }

            document.getElementById('oem-create-vat').value = order.vat_percent ?? 0;
            document.getElementById('oem-create-fund').value = order.fund_source || 'COMPANY';
            document.getElementById('oem-create-deposit').value = order.deposit_amount ?? 0;
            const depositInp = document.getElementById('oem-create-deposit');
            if (depositInp) {
                // Nếu là bản nháp: cho phép nhập cọc khi sửa để chuyển thành đơn chính thức
                depositInp.disabled = (order.status !== 'DRAFT');
            }
            document.getElementById('oem-create-note').value = order.note || '';

            const searchInput = document.getElementById('oem-factory-search-input');
            if (searchInput) searchInput.value = factory ? `🏭 ${factory.name}` : (order.partner_name ? `🏭 ${order.partner_name}` : '');

            const badge = document.getElementById('oem-factory-badge');
            const whName = document.getElementById('oem-factory-wh-name');
            if (badge && whName) {
                whName.innerText = order.oem_warehouse_name || (factory ? factory.warehouse_name : '');
                badge.classList.remove('hidden');
            }
            document.getElementById('oem-factory-clear-btn')?.classList.remove('hidden');

            const hint = document.getElementById('oem-prod-filter-hint');
            if (hint) {
                hint.innerText = `Đang hiển thị ${currentFactoryProducts.length} sản phẩm cấu hình cho xưởng ${factory ? factory.name : (order.partner_name || '')}`;
            }
            document.getElementById('btn-add-prod-to-factory')?.classList.remove('hidden');

            const quickInp = document.getElementById('oem-prod-quick-search-input');
            if (quickInp) quickInp.value = '';

            const itemsBody = document.getElementById('oem-create-items-body');
            if (itemsBody) itemsBody.innerHTML = '';
            (order.items || []).forEach(it => {
                const tr = renderOEMItemRow(it);
                itemsBody.appendChild(tr);
            });
            await recalcCreateOEMMath();

            const btnSubmit = document.getElementById('btn-submit-create-oem');
            if (btnSubmit) {
                btnSubmit.disabled = false;
                btnSubmit.innerText = (order.status === 'DRAFT') ? '🚀 Chốt Đặt Hàng Chính Thức' : '💾 Lưu Thay Đổi';
            }
            const btnDraft = document.getElementById('btn-submit-draft-oem');
            if (btnDraft) {
                // Nếu đơn đang là DRAFT: cho phép lưu tiếp dạng nháp hoặc lưu chính thức
                if (order.status === 'DRAFT') {
                    btnDraft.classList.remove('hidden');
                    btnDraft.innerText = '💾 Lưu Bản Nháp Tiếp';
                } else {
                    btnDraft.classList.add('hidden');
                }
            }
            const modalTitle = document.querySelector('#modal-create-oem h3 span');
            if (modalTitle) modalTitle.innerText = `✏️ Chỉnh Sửa Đơn Gia Công OEM (${order.code})`;

            document.getElementById('modal-create-oem').classList.remove('hidden');
        }
        window.openModalEditOEM = openModalEditOEM;

        async function deleteOEMOrder(orderId, orderCode, status) {
            let msg = `Bạn có chắc chắn muốn xóa đơn gia công OEM ${orderCode}?`;
            let subMsg = '';

            if (status === 'RECEIVED' || status === 'COMPLETED') {
                subMsg = `⚠️ Đơn này ĐÃ NHẬN HÀNG. Hệ thống sẽ tự động:\n` +
                         `1. Trừ lại số lượng thành phẩm đã nhập vào Kho Đích.\n` +
                         `2. Hoàn trả lại số lượng tem nhãn, chai lọ, vật tư BOM vào Kho Xưởng.\n` +
                         `3. Hủy/Xóa các phiếu chi thanh toán trong Sổ Quỹ Cashbook.\n` +
                         `4. Giảm nợ NCC tương ứng.`;
            } else if (status === 'DEPOSITED') {
                subMsg = `⚠️ Đơn này ĐÃ CỌC TIỀN. Hệ thống sẽ tự động xóa phiếu chi cọc trong Sổ Quỹ Cashbook và xóa đơn hàng.`;
            } else {
                subMsg = `Thao tác xóa sẽ loại bỏ hoàn toàn đơn hàng khỏi hệ thống và không thể khôi phục.`;
            }

            let confirmed = false;
            if (typeof window.showConfirmModal === 'function') {
                confirmed = await window.showConfirmModal({
                    title: `Cảnh Báo Xóa Đơn OEM ${orderCode}`,
                    message: msg,
                    subMessage: subMsg,
                    confirmText: 'Xác Nhận Xóa & Hoàn Tác',
                    cancelText: 'Hủy bỏ',
                    type: 'danger',
                    icon: '🗑️'
                });
            } else if (typeof window.customConfirm === 'function') {
                confirmed = await window.customConfirm(subMsg ? `${msg}\n\n${subMsg}` : msg, `Xóa đơn OEM ${orderCode}`, { type: 'danger', okText: 'Xác Nhận Xóa' });
            } else {
                confirmed = confirm(subMsg ? `${msg}\n\n${subMsg}` : msg);
            }

            if (!confirmed) return;
            try {
                const res = await fetch(`/api/oem/orders/${orderId}`, { method: 'DELETE' });
                if (!res.ok) {
                    const err = await res.json().catch(() => ({}));
                    throw new Error(err.detail || 'Lỗi xóa đơn OEM');
                }
                const data = await res.json().catch(() => ({}));
                if (typeof showToast === 'function') {
                    showToast(data.message || `Đã xóa đơn OEM ${orderCode} thành công.`, 'success');
                } else {
                    alert(`✅ ${data.message || `Đã xóa đơn OEM ${orderCode} thành công.`}`);
                }
                closeModalDetailOEM();
                loadOEMData();
                if (typeof loadCashbook === 'function') loadCashbook();
            } catch (e) {
                alert(`❌ Lỗi: ${e.message}`);
            }
        }
        window.deleteOEMOrder = deleteOEMOrder;

        function deleteOEMOrderFromDetail() {
            if (!currentViewedOEMOrderId) return;
            const ord = allOEMOrders.find(o => o.id === currentViewedOEMOrderId);
            const code = ord ? ord.code : `#${currentViewedOEMOrderId}`;
            const status = ord ? ord.status : '';
            deleteOEMOrder(currentViewedOEMOrderId, code, status);
        }
        window.deleteOEMOrderFromDetail = deleteOEMOrderFromDetail;

        // --- QUẢN LÝ GÁN KHO CHO NHÀ MÁY (MODAL) ---
        async function openModalManageOEMFactories() {
            // Luôn fetch mới nhất danh bạ đối tác và kho hàng từ database để không bị dính cache cũ
            try {
                if (typeof loadContacts === 'function') {
                    await loadContacts();
                } else {
                    const resC = await fetch('/api/contacts');
                    if (resC.ok) allContacts = await resC.json();
                }
            } catch(e) {}

            try {
                const resWh = await fetch('/api/warehouses');
                if (resWh.ok) {
                    allWarehouses = await resWh.json();
                }
            } catch(e) {}

            const suppInput = document.getElementById('oem-link-supplier-input');
            const suppHidden = document.getElementById('oem-link-supplier-sel');
            if (suppHidden) suppHidden.value = '';
            if (suppInput) suppInput.value = '';

            const whSel = document.getElementById('oem-link-warehouse-sel');
            if (whSel) {
                if (allWarehouses && allWarehouses.length > 0) {
                    whSel.innerHTML = allWarehouses.map(w => `<option value="${w.id}">📦 ${w.name} (${w.code || '-'})</option>`).join('');
                } else {
                    whSel.innerHTML = '<option value="">-- Chưa có kho nào --</option>';
                }
            }

            await renderManageFactoriesTable();
            document.getElementById('modal-manage-oem-factories').classList.remove('hidden');
        }

        // --- TÌM KIẾM TỨC THÌ CHO DROPLIST NHÀ CUNG CẤP GÁN KHO OEM ---
        function getOEMSuppliersList() {
            return (allContacts || []).filter(c => c.type === 'supplier');
        }

        function showOEMLinkSupplierDropdown() {
            filterOEMLinkSupplierDropdown();
            document.getElementById('oem-link-supplier-dropdown')?.classList.remove('hidden');
        }
        window.showOEMLinkSupplierDropdown = showOEMLinkSupplierDropdown;

        function filterOEMLinkSupplierDropdown() {
            const input = document.getElementById('oem-link-supplier-input');
            const dd = document.getElementById('oem-link-supplier-dropdown');
            if (!dd) return;
            const kw = (input?.value || '').trim().toLowerCase();
            const list = getOEMSuppliersList();

            const filtered = list.filter(s => {
                const name = (s.name || '').toLowerCase();
                const phone = (s.phone || '').toLowerCase();
                return name.includes(kw) || phone.includes(kw);
            });

            if (filtered.length === 0) {
                dd.innerHTML = '<div class="p-3 text-slate-400 text-center  text-xs">Không tìm thấy nhà cung cấp nào phù hợp</div>';
                dd.classList.remove('hidden');
                return;
            }

            dd.innerHTML = filtered.slice(0, 30).map(s => `
                <div onclick="selectOEMLinkSupplier(${s.id}, '${(s.name || '').replace(/'/g, "\\'")}')" 
                     class="p-2.5 hover:bg-amber-50 cursor-pointer flex justify-between items-center transition group">
                    <div>
                        <div class="font-bold text-slate-800 group-hover:text-amber-900">🏭 ${s.name}</div>
                        ${s.phone ? `<div class="text-xs text-slate-400 font-mono">SĐT: ${s.phone}</div>` : ''}
                    </div>
                    <span class="text-xs bg-slate-100 text-slate-600 px-1.5 py-0.5 rounded font-semibold group-hover:bg-amber-100 group-hover:text-amber-800">Chọn</span>
                </div>
            `).join('');
            dd.classList.remove('hidden');
        }
        window.filterOEMLinkSupplierDropdown = filterOEMLinkSupplierDropdown;

        function selectOEMLinkSupplier(id, name) {
            const hidden = document.getElementById('oem-link-supplier-sel');
            const input = document.getElementById('oem-link-supplier-input');
            const dd = document.getElementById('oem-link-supplier-dropdown');

            if (hidden) hidden.value = id;
            if (input) input.value = `🏭 ${name}`;
            if (dd) dd.classList.add('hidden');
        }
        window.selectOEMLinkSupplier = selectOEMLinkSupplier;

        // Đóng dropdown khi click ra ngoài
        document.addEventListener('click', function(e) {
            const input = document.getElementById('oem-link-supplier-input');
            const dd = document.getElementById('oem-link-supplier-dropdown');
            if (dd && input && !input.contains(e.target) && !dd.contains(e.target)) {
                dd.classList.add('hidden');
            }
        });

        function closeModalManageOEMFactories() {
            document.getElementById('modal-manage-oem-factories')?.classList.add('hidden');
        }
        window.closeModalManageOEMFactories = closeModalManageOEMFactories;

        async function renderManageFactoriesTable() {
            const tbody = document.getElementById('oem-factories-list-table');
            if (!tbody) return;
            await loadOEMFactoriesList();

            if (allOEMFactories.length === 0) {
                tbody.innerHTML = '<tr><td colspan="4" class="p-3 text-center text-gray-400 ">Chưa có nhà máy nào được gán kho xưởng. Hãy chọn ở ô phía trên để gán!</td></tr>';
                return;
            }

            tbody.innerHTML = allOEMFactories.map(f => `
                <tr class="border-b hover:bg-slate-50 transition">
                    <td class="p-2 font-bold text-slate-800">
                        🏭 ${f.name}
                        ${f.phone ? `<span class="text-gray-400 text-xs ml-1">(${f.phone})</span>` : ''}
                    </td>
                    <td class="p-2 font-semibold text-emerald-700">
                        📦 ${f.warehouse_name}
                    </td>
                    <td class="p-2 text-center">
                        <button type="button" onclick="openQuickAssignSupplierModal(${f.id}, '${(f.name || '').replace(/'/g, "\\'")}', () => renderManageFactoriesTable(), 'PRODUCT')"
                                class="px-2 py-1 bg-amber-50 hover:bg-amber-100 text-amber-900 border border-amber-300 rounded text-xs font-bold transition flex items-center justify-center gap-1 mx-auto"
                                title="Gán hoặc quản lý sản phẩm gia công cho nhà máy này">
                            <span>📦</span> <span>${f.product_count} SP (Gán)</span>
                        </button>
                    </td>
                    <td class="p-2 text-center">
                        <button type="button" onclick="unlinkFactoryWarehouse(${f.warehouse_id}, '${(f.name || '').replace(/'/g, "\\'")}', '${(f.warehouse_name || '').replace(/'/g, "\\'")}')"
                                class="px-2 py-1 bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 rounded text-xs font-bold transition flex items-center justify-center gap-1 mx-auto"
                                title="Gỡ kho này khỏi nhà máy">
                            <span>🔗✕</span> <span>Gỡ kho</span>
                        </button>
                    </td>
                </tr>
            `).join('');
        }

        async function unlinkFactoryWarehouse(warehouseId, factoryNam, warehouseName) {
            const confirmed = await window.showConfirmModal({
                title: 'Gỡ Kho Khỏi Nhà Máy',
                message: `Bạn có chắc muốn gỡ kho <span class="font-bold text-emerald-700">"${warehouseName}"</span> khỏi nhà máy <span class="font-bold text-slate-800">"${factoryNam}"</span>?`,
                subMessage: 'Lưu ý: Kho hàng và số lượng tồn kho vẫn được giữ nguyên vẹn an toàn, chỉ hủy việc tự động nhận diện kho này khi tạo đơn gia công OEM.',
                confirmText: 'Đồng ý gỡ',
                cancelText: 'Hủy bỏ',
                type: 'warning'
            });

            if (!confirmed) return;

            try {
                const res = await fetch('/api/oem/factories/unlink-warehouse', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ warehouse_id: warehouseId })
                });

                if (!res.ok) {
                    const err = await res.json().catch(() => ({}));
                    throw new Error(err.detail || 'Không thể gỡ kho');
                }

                window.showToast ? window.showToast(`Đã gỡ kho "${warehouseName}" thành công!`, 'success') : alert(`Đã gỡ kho thành công!`);
                await renderManageFactoriesTable();
            } catch (e) {
                window.showToast ? window.showToast('Lỗi: ' + e.message, 'error') : alert('Lỗi: ' + e.message);
            }
        }
        window.unlinkFactoryWarehouse = unlinkFactoryWarehouse;

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

        // --- GÁN SẢN PHẨM KHÁC CHO NHÀ MÁY (DÙNG MODAL GÁN CHUẨN TẬP TRUNG) ---
        function openModalAddProductToFactory() {
            if (!selectedOEMFactory) {
                if (window.showToast) window.showToast('Vui lòng chọn nhà máy trước!', 'warning');
                else alert('Vui lòng chọn nhà máy trước!');
                return;
            }

            if (typeof openQuickAssignSupplierModal === 'function') {
                openQuickAssignSupplierModal(selectedOEMFactory.id, selectedOEMFactory.name, async (suppId, items) => {
                    // Tải lại sản phẩm của xưởng
                    try {
                        const resP = await fetch(`/api/oem/factories/${selectedOEMFactory.id}/products`);
                        if (resP.ok) currentFactoryProducts = await resP.json();
                    } catch (e) {}

                    const hint = document.getElementById('oem-prod-filter-hint');
                    if (hint) {
                        hint.innerText = `Đang hiển thị ${currentFactoryProducts.length} sản phẩm cấu hình cho xưởng ${selectedOEMFactory.name}`;
                    }

                    if (typeof filterOEMQuickSearchDropdown === 'function') {
                        filterOEMQuickSearchDropdown();
                    }
                    if (typeof loadOEMFactoriesList === 'function') {
                        await loadOEMFactoriesList();
                    }
                }, 'PRODUCT');
            } else {
                alert('Không tìm thấy chức năng gán sản phẩm');
            }
        }
        window.openModalAddProductToFactory = openModalAddProductToFactory;

        function closeModalAddProductToFactory() {
            if (typeof closeQuickAssignSupplierModal === 'function') {
                closeQuickAssignSupplierModal();
            }
        }
        window.closeModalAddProductToFactory = closeModalAddProductToFactory;

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
        window.closeModalReceiveOEM = closeModalReceiveOEM;

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
                container.innerHTML = '<div class="text-gray-500  p-1">Không có nguyên liệu vật lý nào trong BOM.</div>';
                return;
            }

            container.innerHTML = mList.map(m => `
                <div class="bg-white p-1.5 rounded border border-rose-300 flex justify-between items-center shadow-sm">
                    <span class="font-bold text-slate-800">${m.name}:</span>
                    <span class="font-mono font-bold text-rose-600">- ${m.deduct_qty.toLocaleString('vi-VN')} ${m.unit}</span>
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
        let currentViewedOEMOrderId = null;

        async function viewOEMOrderDetail(orderId) {
            currentViewedOEMOrderId = orderId;
            try {
                const res = await fetch(`/api/oem/orders/${orderId}`);
                if (!res.ok) return alert('Không tìm thấy chi tiết đơn OEM');
                const ord = await res.json();

                document.getElementById('oem-view-code').innerText = ord.code;
                const body = document.getElementById('oem-detail-body');

                const isReceived = (ord.status === 'RECEIVED' || ord.status === 'COMPLETED');
                const totalOrderedQty = (ord.items || []).reduce((sum, it) => sum + (Number(it.ordered_qty) || 0), 0);
                const totalReceivedQty = (ord.items || []).reduce((sum, it) => sum + (Number(it.received_qty) || 0), 0);
                const diffTotalQty = totalReceivedQty - totalOrderedQty;

                body.innerHTML = `
                    <!-- THÔNG TIN ĐƠN & ĐỐI SOÁT 2 CHẶNG TÀI CHÍNH -->
                    <div class="grid grid-cols-2 sm:grid-cols-4 gap-3 bg-slate-50 p-3 rounded-lg border text-xs">
                        <div>Nhà máy: <strong class="text-slate-800">${ord.partner_name || '-'}</strong></div>
                        <div>Kho xưởng NVL: <strong class="text-slate-800">${ord.oem_warehouse_name || '-'}</strong></div>
                        <div>Hẹn nhận hàng: <strong class="font-mono text-slate-800">${ord.expected_delivery_date || '-'}</strong></div>
                        <div>Nguồn tiền: <strong class="${ord.fund_source === 'COMPANY' ? 'text-blue-700' : 'text-sky-700'}">${ord.fund_source === 'COMPANY' ? '🏢 Quỹ Công Ty' : '👤 Quỹ Cá Nhân'}</strong></div>
                        <div>Tiền hàng thô: <strong class="font-mono text-slate-700">${formatMoney(ord.total_raw_amount)}</strong></div>
                        <div>Chiết khấu: <strong class="text-emerald-600">${ord.discount_percent}%</strong> | VAT: <strong class="text-rose-600">${ord.vat_percent}%</strong></div>
                        <div>Đã cọc đợt 1: <strong class="text-emerald-600 font-mono font-bold">${formatMoney(ord.deposit_amount)}</strong></div>
                        <div>Còn lại đợt 2: <strong class="text-rose-600 font-mono font-bold">${formatMoney(ord.remaining_payment)}</strong></div>
                    </div>

                    ${isReceived ? `
                    <!-- BẢNG ĐỐI SOÁT 2 CHẶNG QUYẾT TOÁN THỰC TẾ -->
                    <div class="grid grid-cols-1 md:grid-cols-2 gap-3 bg-white p-3 rounded-lg border border-slate-200 text-xs shadow-2xs">
                        <div class="bg-slate-50 p-2.5 rounded border border-slate-200 space-y-1">
                            <div class="font-bold text-slate-700 flex justify-between items-center">
                                <span>1. Hợp đồng đặt cọc ban đầu</span>
                                <span class="bg-sky-100 text-sky-800 px-1.5 py-0.5 rounded font-mono font-bold text-xs">${totalOrderedQty.toLocaleString('vi-VN')} SP</span>
                            </div>
                            <div class="flex justify-between text-slate-600 pt-1">
                                <span>Tiền cọc đợt 1 (Đã chi):</span>
                                <span class="font-mono font-bold text-emerald-600">${formatMoney(ord.deposit_amount)}</span>
                            </div>
                            <div class="text-xs text-gray-500 ">Đã xuất phiếu chi Sổ Quỹ theo hợp đồng đặt cọc</div>
                        </div>
                        <div class="bg-emerald-50/80 p-2.5 rounded border border-emerald-300 space-y-1">
                            <div class="font-bold text-emerald-900 flex justify-between items-center">
                                <span>2. Quyết toán thực nhận tại kho</span>
                                <span class="px-1.5 py-0.5 rounded font-mono font-bold text-xs ${diffTotalQty < 0 ? 'bg-rose-100 text-rose-800' : 'bg-emerald-100 text-emerald-800'}">
                                    Thực nhận: ${totalReceivedQty.toLocaleString('vi-VN')} SP ${diffTotalQty !== 0 ? `(${diffTotalQty < 0 ? 'thiếu ' + Math.abs(diffTotalQty).toLocaleString('vi-VN') : 'thừa +' + diffTotalQty.toLocaleString('vi-VN')})` : ''}
                                </span>
                            </div>
                            <div class="flex justify-between text-slate-700 pt-1">
                                <span>Tổng tiền đơn thực nhận:</span>
                                <span class="font-mono font-bold text-slate-800">${formatMoney(ord.total_final_amount)}</span>
                            </div>
                            <div class="flex justify-between text-rose-700 font-bold border-t border-emerald-200 pt-1">
                                <span>👉 CÔNG NỢ CÒN PHẢI TRẢ (ĐỢT 2):</span>
                                <span class="font-mono text-sm">${formatMoney(ord.remaining_payment)}</span>
                            </div>
                        </div>
                    </div>
                    ` : ''}

                    <div class="space-y-1">
                        <h4 class="font-bold text-slate-800 text-xs">📦 Danh Sách Thành Phẩm Gia Công:</h4>
                        <div class="border rounded overflow-x-auto">
                            <table class="w-full text-left text-xs">
                                <thead class="bg-slate-100 border-b">
                                    <tr>
                                        <th class="p-2">Sản Phẩm</th>
                                        <th class="p-2 text-right">SL Đặt</th>
                                        <th class="p-2 text-right">SL Thực Nhận</th>
                                        <th class="p-2 text-center">Lệch Giao</th>
                                        <th class="p-2 text-right">Đơn Giá Xưởng</th>
                                        <th class="p-2 text-right">Thành Tiền Thực Nhận</th>
                                        <th class="p-2 text-right">Giá Vốn Sau Gộp</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    ${(ord.items || []).map(it => {
                                        const ordQty = Number(it.ordered_qty) || 0;
                                        const recQty = Number(it.received_qty) || 0;
                                        const itDiff = recQty - ordQty;
                                        let diffBadge = '<span class="text-slate-400 font-mono text-xs">-</span>';
                                        if (isReceived) {
                                            if (itDiff < 0) {
                                                diffBadge = `<span class="bg-rose-100 text-rose-800 px-1 py-0.5 rounded font-mono font-bold text-xs">-${Math.abs(itDiff).toLocaleString('vi-VN')}</span>`;
                                            } else if (itDiff > 0) {
                                                diffBadge = `<span class="bg-emerald-100 text-emerald-800 px-1 py-0.5 rounded font-mono font-bold text-xs">+${itDiff.toLocaleString('vi-VN')}</span>`;
                                            } else {
                                                diffBadge = `<span class="text-slate-500 font-mono text-xs">Đủ</span>`;
                                            }
                                        }
                                        const rowTotal = (isReceived && recQty > 0 ? recQty : ordQty) * (Number(it.unit_price) || 0);
                                        return `
                                        <tr class="border-b hover:bg-slate-50/70">
                                            <td class="p-2 font-bold text-slate-800">${it.product_name}</td>
                                            <td class="p-2 text-right font-mono font-semibold text-slate-700">${ordQty.toLocaleString('vi-VN')}</td>
                                            <td class="p-2 text-right font-mono font-bold text-amber-700">${recQty > 0 ? recQty.toLocaleString('vi-VN') : '-'}</td>
                                            <td class="p-2 text-center">${diffBadge}</td>
                                            <td class="p-2 text-right font-mono">${formatMoney(it.unit_price)}</td>
                                            <td class="p-2 text-right font-mono font-bold text-slate-800">${formatMoney(rowTotal)}</td>
                                            <td class="p-2 text-right font-mono font-bold text-emerald-700">${it.full_cost_per_unit > 0 ? formatMoney(it.full_cost_per_unit) : 'Chờ nhận'}</td>
                                        </tr>
                                        `;
                                    }).join('')}
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
                                            <td class="p-2"><span class="text-xs px-1.5 py-0.5 rounded font-bold ${m.ingredient_type==='IS_PHYSICAL'?'bg-emerald-100 text-emerald-800':'bg-sky-100 text-sky-800'}">${m.ingredient_type==='IS_PHYSICAL'?'Vật lý':'Dịch vụ'}</span></td>
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

                const btnConfirm = document.getElementById('btn-detail-confirm-oem');
                if (btnConfirm) {
                    if (ord.status === 'DRAFT') {
                        btnConfirm.classList.remove('hidden');
                    } else {
                        btnConfirm.classList.add('hidden');
                    }
                }

                document.getElementById('modal-detail-oem').classList.remove('hidden');
            } catch (err) {
                console.error(err);
            }
        }

        function closeModalDetailOEM() {
            document.getElementById('modal-detail-oem')?.classList.add('hidden');
        }
        window.closeModalDetailOEM = closeModalDetailOEM;

        async function printOEMInspectionSheet(orderId) {
            try {
                const res = await fetch(`/api/oem/orders/${orderId}`);
                if (!res.ok) return alert('Không tìm thấy thông tin đơn OEM để in phiếu kiểm!');
                const ord = await res.json();

                const company = window.companySettings || {};
                const storeName = company.shop_name || company.app_name || 'HỆ THỐNG POS PET CARE';
                const storeAddr = company.shop_address || 'Địa chỉ: Việt Nam';
                const storePhone = company.shop_phone ? ` - ĐT: ${company.shop_phone}` : '';

                const today = new Date();
                const printDateStr = `Ngày ${today.getDate()} tháng ${today.getMonth() + 1} năm ${today.getFullYear()}`;

                const itemsRows = (ord.items || []).map((it, idx) => `
                    <tr>
                        <td style="border: 1px solid #333; padding: 6px 8px; text-align: center;">${idx + 1}</td>
                        <td style="border: 1px solid #333; padding: 6px 8px; font-family: monospace; font-weight: bold;">${it.product_code || '-'}</td>
                        <td style="border: 1px solid #333; padding: 6px 8px; font-weight: bold;">${it.product_name}</td>
                        <td style="border: 1px solid #333; padding: 6px 8px; text-align: center;">${it.product_unit || 'Chai/Cái'}</td>
                        <td style="border: 1px solid #333; padding: 6px 8px; text-align: right; font-weight: bold; font-family: monospace;">${(it.ordered_qty || 0).toLocaleString('vi-VN')}</td>
                        <td style="border: 1px solid #333; padding: 6px 8px; text-align: right; font-weight: bold; font-family: monospace; background: #fafafa;">${it.received_qty > 0 ? it.received_qty.toLocaleString('vi-VN') : ''}</td>
                        <td style="border: 1px solid #333; padding: 6px 8px; text-align: center;">[  ] Đạt &nbsp; [  ] Lỗi</td>
                        <td style="border: 1px solid #333; padding: 6px 8px;"></td>
                    </tr>
                `).join('');

                let bomSection = '';
                if (ord.materials_needed && ord.materials_needed.length > 0) {
                    const bomRows = ord.materials_needed.map((m, idx) => `
                        <tr>
                            <td style="border: 1px solid #333; padding: 5px 8px; text-align: center;">${idx + 1}</td>
                            <td style="border: 1px solid #333; padding: 5px 8px;">${m.ingredient_name}</td>
                            <td style="border: 1px solid #333; padding: 5px 8px; text-align: center;">${m.ingredient_type === 'IS_PHYSICAL' ? 'Vật tư (Chai/Tem)' : 'Dịch vụ'}</td>
                            <td style="border: 1px solid #333; padding: 5px 8px; text-align: right; font-family: monospace;">${m.bom_qty} ${m.ingredient_unit}</td>
                            <td style="border: 1px solid #333; padding: 5px 8px; text-align: right; font-weight: bold; font-family: monospace;">${(m.needed_qty || 0).toLocaleString('vi-VN')} ${m.ingredient_unit}</td>
                            <td style="border: 1px solid #333; padding: 5px 8px; text-align: right; font-family: monospace;">${(m.current_stock_at_oem || 0).toLocaleString('vi-VN')} ${m.ingredient_unit}</td>
                            <td style="border: 1px solid #333; padding: 5px 8px;"></td>
                        </tr>
                    `).join('');

                    bomSection = `
                        <div style="margin-top: 15px;">
                            <div style="font-weight: bold; font-size: 13px; text-transform: uppercase; margin-bottom: 5px; color: #1e293b;">
                                II. ĐỐI CHIẾU VẬT TƯ TIÊU HAO GỬI XƯỞNG (THEO ĐỊNH MỨC BOM)
                            </div>
                            <table style="width: 100%; border-collapse: collapse; font-size: 12px;">
                                <thead>
                                    <tr style="background: #f1f5f9;">
                                        <th style="border: 1px solid #333; padding: 6px; width: 35px; text-align: center;">STT</th>
                                        <th style="border: 1px solid #333; padding: 6px; text-align: left;">Tên Vật Tư (Tem, Chai, Lọ, Thùng)</th>
                                        <th style="border: 1px solid #333; padding: 6px; text-align: center; width: 110px;">Phân Loại</th>
                                        <th style="border: 1px solid #333; padding: 6px; text-align: right; width: 90px;">Định Mức/SP</th>
                                        <th style="border: 1px solid #333; padding: 6px; text-align: right; width: 100px;">Tổng Cần Dùng</th>
                                        <th style="border: 1px solid #333; padding: 6px; text-align: right; width: 100px;">Tồn Tại Xưởng</th>
                                        <th style="border: 1px solid #333; padding: 6px; text-align: left; width: 100px;">Ghi Chú</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    ${bomRows}
                                </tbody>
                            </table>
                        </div>
                    `;
                }

                const printHtml = `
                    <div style="width: 200mm; max-width: 200mm; margin: 0 auto; font-family: 'Times New Roman', Times, serif; font-size: 13px; line-height: 1.45; color: #000; padding: 6mm 4mm;">
                        <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 12px; border-bottom: 1px solid #ccc; padding-bottom: 6px;">
                            <div>
                                <div style="font-weight: bold; text-transform: uppercase; font-size: 14px;">${storeName}</div>
                                <div style="font-size: 11px; margin-top: 2px;">${storeAddr}${storePhone}</div>
                            </div>
                            <div style="text-align: right; font-size: 12px;">
                                <div>Mã phiếu OEM: <strong style="font-family: monospace; font-size: 14px;">${ord.code}</strong></div>
                                <div style="font-size: 11px; color: #555;">In lúc: ${new Date().toLocaleString('vi-VN')}</div>
                            </div>
                        </div>

                        <div style="text-align: center; margin: 15px 0 18px 0;">
                            <h1 style="margin: 0; font-size: 20px; font-weight: bold; text-transform: uppercase; letter-spacing: 0.5px;">PHIẾU KIỂM ĐẾM NHẬN HÀNG GIA CÔNG OEM</h1>
                            <div style="font-style: italic; font-size: 12px; margin-top: 4px;">${printDateStr}</div>
                        </div>

                        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 8px 20px; margin-bottom: 15px; font-size: 12.5px; background: #fafafa; padding: 8px 12px; border: 1px dashed #bbb; border-radius: 4px;">
                            <div>• Nhà máy gia công: <strong>${ord.partner_name || '-'}</strong> ${ord.partner_phone ? `(${ord.partner_phone})` : ''}</div>
                            <div>• Kho xưởng NVL: <strong>${ord.oem_warehouse_name || '-'}</strong></div>
                            <div>• Kho nhận thành phẩm: <strong>${ord.dest_warehouse_name || 'Kho Tổng'}</strong></div>
                            <div>• Ngày hẹn giao: <strong style="font-family: monospace;">${ord.expected_delivery_date || '-'}</strong></div>
                            <div>• Nguồn tiền thanh toán: <strong>${ord.fund_source === 'COMPANY' ? 'Quỹ Công Ty (Cty)' : 'Quỹ Cá Nhân (Cá nhân)'}</strong></div>
                            <div>• Ghi chú đơn: <span>${ord.note || '(Không có)'}</span></div>
                        </div>

                        <div style="margin-bottom: 12px;">
                            <div style="font-weight: bold; font-size: 13px; text-transform: uppercase; margin-bottom: 5px; color: #1e293b;">
                                I. DANH SÁCH THÀNH PHẨM ĐẶT HÀNG & KIỂM ĐẾM THỰC TẾ
                            </div>
                            <table style="width: 100%; border-collapse: collapse; font-size: 12px;">
                                <thead>
                                    <tr style="background: #f1f5f9;">
                                        <th style="border: 1px solid #333; padding: 6px; width: 35px; text-align: center;">STT</th>
                                        <th style="border: 1px solid #333; padding: 6px; width: 90px; text-align: left;">Mã SP</th>
                                        <th style="border: 1px solid #333; padding: 6px; text-align: left;">Tên Sản Phẩm Gia Công</th>
                                        <th style="border: 1px solid #333; padding: 6px; width: 60px; text-align: center;">ĐVT</th>
                                        <th style="border: 1px solid #333; padding: 6px; width: 85px; text-align: right;">SL Đặt</th>
                                        <th style="border: 1px solid #333; padding: 6px; width: 95px; text-align: right;">SL Thực Nhận</th>
                                        <th style="border: 1px solid #333; padding: 6px; width: 120px; text-align: center;">Tình Trạng</th>
                                        <th style="border: 1px solid #333; padding: 6px; text-align: left;">Ghi Chú Kiểm Hàng</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    ${itemsRows}
                                </tbody>
                            </table>
                        </div>

                        ${bomSection}

                        <div style="margin-top: 15px; font-size: 11.5px; font-style: italic; color: #444;">
                            * Lưu ý: Thủ kho kiểm đếm kỹ số lượng, ngoại quan bao bì, tem nhãn, hạn sử dụng trước khi ký xác nhận nhập kho.
                        </div>

                        <div style="display: flex; justify-content: space-between; text-align: center; margin-top: 30px; font-size: 12.5px; page-break-inside: avoid;">
                            <div style="width: 30%;">
                                <div style="font-weight: bold; text-transform: uppercase;">ĐẠI DIỆN GIAO HÀNG</div>
                                <div style="font-style: italic; font-size: 11px;">(Xưởng gia công ký & họ tên)</div>
                                <div style="height: 65px;"></div>
                                <div>................................................</div>
                            </div>
                            <div style="width: 30%;">
                                <div style="font-weight: bold; text-transform: uppercase;">THỦ KHO KIỂM NHẬN</div>
                                <div style="font-style: italic; font-size: 11px;">(Ký & ghi rõ họ tên)</div>
                                <div style="height: 65px;"></div>
                                <div>................................................</div>
                            </div>
                            <div style="width: 30%;">
                                <div style="font-weight: bold; text-transform: uppercase;">QUẢN LÝ / KẾ TOÁN</div>
                                <div style="font-style: italic; font-size: 11px;">(Ký & ghi rõ họ tên)</div>
                                <div style="height: 65px;"></div>
                                <div>................................................</div>
                            </div>
                        </div>
                    </div>
                `;

                let iframe = document.getElementById('iframe-oem-inspection-print');
                if (!iframe) {
                    iframe = document.createElement('iframe');
                    iframe.id = 'iframe-oem-inspection-print';
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
                        <title>Phiếu Kiểm Đếm OEM - ${ord.code}</title>
                        <style>
                            @page { size: A4 portrait; margin: 8mm 10mm; }
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
                    iframe.contentWindow.focus();
                    iframe.contentWindow.print();
                }, 300);

            } catch (err) {
                console.error('printOEMInspectionSheet error:', err);
                alert('Lỗi in phiếu kiểm OEM: ' + err.message);
            }
        }
        window.printOEMInspectionSheet = printOEMInspectionSheet;

        function printOEMInspectionFromDetail() {
            if (currentViewedOEMOrderId) {
                printOEMInspectionSheet(currentViewedOEMOrderId);
            }
        }
        window.printOEMInspectionFromDetail = printOEMInspectionFromDetail;

        window.viewOrderDetailModal = viewOrderDetailModal;
        window.openModalOrderReturn = openModalOrderReturn;
        window.openModalOrderReturnFromView = openModalOrderReturnFromView;
        window.closeModalOrderReturn = closeModalOrderReturn;
        window.openCashbookLinkedDoc = openCashbookLinkedDoc;
        window.openCashbookDrawer = openCashbookDrawer;
        window.closeCashbookDrawer = closeCashbookDrawer;
        window.openCashbookVoucherDetail = openCashbookVoucherDetail;
        window.closeCashbookViewModal = closeCashbookViewModal;
        window.viewPetServiceDetailModal = viewPetServiceDetailModal;
        window.closeModalPetServiceView = closeModalPetServiceView;
        window.printCurrentViewedPetTicket = printCurrentViewedPetTicket;
        window.printCurrentCashbookVoucher = printCurrentCashbookVoucher;
        window.printCashbookVoucherA4 = printCashbookVoucherA4;
        window.openEditCashbookModal = openEditCashbookModal;
        window.closeEditCashbookModal = closeEditCashbookModal;
        window.submitEditCashbook = submitEditCashbook;
        window.confirmDeleteCashbookVoucher = confirmDeleteCashbookVoucher;
        window.getDefaultPresets = getDefaultPresets;
        window.switchPreset = switchPreset;
        window.loadSettings = loadSettings;
        window.renderCanvas = renderCanvas;
        window.changePaperSize = changePaperSize;
        window.toggleCanvasItem = toggleCanvasItem;
        window.toggleTableMode = toggleTableMode;
        window.saveCurrentPreset = saveCurrentPreset;
        window.saveNewPreset = saveNewPreset;
        window.deleteCurrentPreset = deleteCurrentPreset;
        window.renameCurrentPreset = renameCurrentPreset;
        window.toggleCurrentPresetBoldAll = toggleCurrentPresetBoldAll;
        window.syncSplitBoldToggle = syncSplitBoldToggle;
        window.onSplitBoldToggleChange = onSplitBoldToggleChange;
        window.applyCanvasBoldEffect = applyCanvasBoldEffect;
        window.renderPrintBoldConfigsUI = renderPrintBoldConfigsUI;
        window.savePrintBoldConfigItem = savePrintBoldConfigItem;
        window.saveAllPrintBoldConfigs = saveAllPrintBoldConfigs;
        window.printTestTemplate = printTestTemplate;
        window.resetDefaultTemplate = resetDefaultTemplate;
        window.setCanvasZoom = setCanvasZoom;
        window.selectElement = selectElement;
        window.startDrag = startDrag;
        window.startResize = startResize;
        window.updateSidebarCheckboxes = updateSidebarCheckboxes;
        window.updateCanvasBadge = updateCanvasBadge;
        window.addCustomTextItem = addCustomTextItem;
        window.selectPrintDocType = selectPrintDocType;
        window.inferDocTypeFromKey = inferDocTypeFromKey;
        window.renderPresetSelect = renderPresetSelect;
        window.zoomPrintSheet = zoomPrintSheet;
        window.changePrintPaperView = changePrintPaperView;
        window.togglePrintPreviewBlock = togglePrintPreviewBlock;
        window.togglePrintPreviewField = togglePrintPreviewField;
        window.moveElementOrder = moveElementOrder;
        window.onAutoFlowDragStart = onAutoFlowDragStart;
        window.onAutoFlowDragOver = onAutoFlowDragOver;
        window.onAutoFlowDrop = onAutoFlowDrop;

        window.openCreateCashModal = openCreateCashModal;
        window.setCashModalType = setCashModalType;
        window.closeCreateCashModal = closeCreateCashModal;
        window.submitCreateCashbook = submitCreateCashbook;
        window.handleCashAmountInput = handleCashAmountInput;
        window.quickAddCashAmount = quickAddCashAmount;
        window.resetCashAmount = resetCashAmount;
        window.swapTransferAccounts = swapTransferAccounts;
        window.numberToVietnameseWords = numberToVietnameseWords;

        // Tu dong nap va ve ban in khi module san sang
        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', () => {
                if (typeof loadSettings === 'function') loadSettings();
            });
        } else {
            setTimeout(() => {
                if (typeof loadSettings === 'function') loadSettings();
            }, 60);
        }

