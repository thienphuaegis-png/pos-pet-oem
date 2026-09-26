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
                badgeType.className = isThu ? 'px-2 py-0.5 rounded text-[11px] font-bold bg-emerald-100 text-emerald-800' : 'px-2 py-0.5 rounded text-[11px] font-bold bg-rose-100 text-rose-800';
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
                    <div class="text-[10px] font-bold uppercase tracking-wider ${isThu ? 'text-emerald-700' : 'text-rose-700'}">
                        SỐ TIỀN THỰC TẾ GHI NHẬN SỔ QUỸ
                    </div>
                    <div class="text-2xl font-black font-mono mt-1 ${isThu ? 'text-emerald-700' : 'text-rose-700'}">
                        ${isThu ? '+' : '-'}${formatMoney(c.amount || 0)}
                    </div>
                </div>
            `;

            const infoGridHtml = `
                <div class="grid grid-cols-2 gap-2 bg-slate-50 p-3 rounded-xl border border-slate-200/80 text-[11px]">
                    <div>
                        <span class="text-slate-400 block text-[10px] uppercase font-bold">Hạng Mục:</span>
                        <span class="font-bold text-slate-800 block truncate mt-0.5">${c.category || '-'}</span>
                    </div>
                    <div>
                        <span class="text-slate-400 block text-[10px] uppercase font-bold">Tài Khoản / Két:</span>
                        <span class="font-semibold text-slate-800 block truncate mt-0.5">${accLabel}</span>
                    </div>
                    <div>
                        <span class="text-slate-400 block text-[10px] uppercase font-bold">Người Nộp / Nhận:</span>
                        <span class="font-bold text-slate-800 block truncate mt-0.5">${c.contact_name || 'Khách lẻ / Nội bộ'}</span>
                    </div>
                    <div>
                        <span class="text-slate-400 block text-[10px] uppercase font-bold">Thời Gian Ghi Sổ:</span>
                        <span class="font-mono text-slate-600 block mt-0.5">${c.created_at || '-'}</span>
                    </div>
                </div>
            `;

            const noteHtml = `
                <div class="bg-slate-50 p-2.5 rounded-xl border border-slate-200/80 text-[11px]">
                    <span class="text-slate-400 block text-[10px] uppercase font-bold">Ghi Chú Sổ Quỹ:</span>
                    <p class="text-slate-700 mt-0.5 font-medium whitespace-pre-line">${c.note || '(Không có ghi chú)'}</p>
                </div>
            `;

            const originLoadingHtml = `
                <div id="drawer-origin-content" class="border border-indigo-200 bg-indigo-50/40 p-3 rounded-xl space-y-2">
                    <div class="flex items-center justify-between">
                        <span class="font-bold text-indigo-900 text-xs flex items-center gap-1.5">
                            <span>🔗</span> <span>Nguồn Gốc Giao Dịch</span>
                        </span>
                        <span class="text-[9px] px-1.5 py-0.5 rounded font-bold bg-indigo-100 text-indigo-800 border border-indigo-200">CHỈ ĐỌC (READ-ONLY)</span>
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
                            ? '<span class="px-1 py-0.2 rounded text-[9px] font-bold bg-blue-100 text-blue-700">SP</span>'
                            : '<span class="px-1 py-0.2 rounded text-[9px] font-bold bg-purple-100 text-purple-700">SPA</span>';

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
                        <div class="flex items-center justify-between border-b pb-2 border-indigo-100">
                            <div>
                                <span class="font-bold text-indigo-900 text-xs flex items-center gap-1.5">
                                    <span>🐾</span> <span>Phiếu Spa: ${ticket.code || 'DV#' + ticket.id}</span>
                                </span>
                                <div class="text-[10px] text-slate-500 mt-0.5">
                                    Khách: <strong>${ticket.customer_name || 'Khách lẻ'}</strong> (${phoneMasked}) | Bé: <strong>${ticket.pet_name || 'Bé cưng'}</strong> (${ticket.pet_breed || '-'})
                                </div>
                            </div>
                            <span class="text-[9px] px-1.5 py-0.5 rounded font-bold bg-indigo-100 text-indigo-800 border border-indigo-200">CHỈ ĐỌC</span>
                        </div>

                        <!-- Bảng chi tiết dịch vụ & sản phẩm -->
                        <div class="bg-white rounded-lg border border-slate-200 overflow-hidden shadow-2xs">
                            <table class="w-full text-left border-collapse text-[10px]">
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
                        <div class="text-[10px] text-slate-600 bg-white p-2 rounded-lg border border-slate-200 flex flex-wrap gap-x-3 gap-y-1">
                            <span>✂️ Thợ cắt: <strong>${ticket.staff_cutter || '-'}</strong></span>
                            <span>🛁 Thợ tắm: <strong>${ticket.staff_worker_1 || '-'}</strong></span>
                            <span>👋 Tiếp nhận: <strong>${ticket.staff_receiver || '-'}</strong></span>
                        </div>

                        <!-- Phân bổ dòng tiền minh bạch -->
                        <div class="bg-white p-2.5 rounded-lg border border-slate-200 space-y-1 text-[11px]">
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
                                <div class="flex justify-between items-center text-purple-700 bg-purple-50 px-1.5 py-0.5 rounded">
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
                                <div class="flex justify-between items-center text-indigo-700 bg-indigo-50 px-1.5 py-0.5 rounded">
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
                        <div class="flex items-center justify-between border-b pb-2 border-indigo-100">
                            <div>
                                <span class="font-bold text-indigo-900 text-xs flex items-center gap-1.5">
                                    <span>🧾</span> <span>Hóa Đơn Bán Lẻ: #${ord.code}</span>
                                </span>
                                <div class="text-[10px] text-slate-500 mt-0.5">
                                    Khách: <strong>${ord.customer_name || 'Khách lẻ'}</strong> | Thu ngân: <strong>${ord.cashier_name || 'Admin'}</strong>
                                </div>
                            </div>
                            <span class="text-[9px] px-1.5 py-0.5 rounded font-bold bg-indigo-100 text-indigo-800 border border-indigo-200">CHỈ ĐỌC</span>
                        </div>

                        <!-- Bảng chi tiết sản phẩm -->
                        <div class="bg-white rounded-lg border border-slate-200 overflow-hidden shadow-2xs">
                            <table class="w-full text-left border-collapse text-[10px]">
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
                        <div class="bg-white p-2.5 rounded-lg border border-slate-200 space-y-1 text-[11px]">
                            <div class="flex justify-between items-center text-slate-600">
                                <span>📦 Tổng tiền hàng:</span>
                                <span class="font-mono font-bold text-slate-800">${formatMoney(ord.total_amount || 0)}</span>
                            </div>
                            ${(ord.discount_amount || 0) > 0 ? `
                                <div class="flex justify-between items-center text-amber-700 bg-amber-50 px-1.5 py-0.5 rounded">
                                    <span>🎁 Giảm giá hóa đơn:</span>
                                    <span class="font-mono font-bold">-${formatMoney(ord.discount_amount)}</span>
                                </div>
                            ` : ''}
                            <div class="flex justify-between items-center font-bold text-emerald-800 bg-emerald-50 px-2 py-1 rounded border border-emerald-200 mt-1">
                                <span>👉 Khách thực trả (Đã vào quỹ):</span>
                                <span class="font-mono text-xs">${formatMoney(ord.paid_amount || ord.final_amount || 0)}</span>
                            </div>
                        </div>
                    `;
                } else if (linkedType === 'topup') {
                    originBox.innerHTML = `
                        <div class="flex items-center justify-between border-b pb-2 border-indigo-100">
                            <div>
                                <span class="font-bold text-indigo-900 text-xs flex items-center gap-1.5">
                                    <span>💳</span> <span>Giao Dịch Nạp Tiền Vào Ví Spa</span>
                                </span>
                                <div class="text-[10px] text-slate-500 mt-0.5">
                                    Khách hàng: <strong>${c.contact_name || 'Khách tích lũy'}</strong>
                                </div>
                            </div>
                            <span class="text-[9px] px-1.5 py-0.5 rounded font-bold bg-amber-100 text-amber-800 border border-amber-200">VÍ TÍCH LŨY</span>
                        </div>
                        <div class="bg-white p-2.5 rounded-lg border border-slate-200 space-y-1 text-[11px]">
                            <div class="flex justify-between items-center text-slate-600">
                                <span>Khách nộp tiền vào quỹ:</span>
                                <span class="font-mono font-bold text-emerald-700">+${formatMoney(c.amount || 0)}</span>
                            </div>
                            <div class="text-[10px] text-slate-500 italic mt-1">
                                * Tiền nạp ví được cộng vào số dư Ví Spa của khách để khấu trừ khi dùng dịch vụ làm đẹp.
                            </div>
                        </div>
                    `;
                } else {
                    originBox.innerHTML = `
                        <div class="flex items-center justify-between border-b pb-2 border-indigo-100">
                            <div>
                                <span class="font-bold text-indigo-900 text-xs flex items-center gap-1.5">
                                    <span>📌</span> <span>Chứng Từ Thu Chi Nội Bộ</span>
                                </span>
                            </div>
                            <span class="text-[9px] px-1.5 py-0.5 rounded font-bold bg-slate-100 text-slate-700 border border-slate-200">NỘI BỘ</span>
                        </div>
                        <div class="bg-white p-2.5 rounded-lg border border-slate-200 space-y-1 text-[11px]">
                            <p class="text-slate-600">${c.note || 'Khoản thu chi nội bộ cửa hàng, không phát sinh từ đơn bán lẻ hay vé dịch vụ Spa.'}</p>
                        </div>
                    `;
                }
            } catch(e) {
                console.error('Lỗi khi nạp chi tiết chứng từ:', e);
                originBox.innerHTML = `
                    <div class="p-3 bg-amber-50 border border-amber-200 rounded-lg text-[11px] text-amber-800">
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
                            ? '<span class="px-1.5 py-0.5 rounded text-[10px] font-bold bg-blue-100 text-blue-700">📦 SP</span>'
                            : '<span class="px-1.5 py-0.5 rounded text-[10px] font-bold bg-purple-100 text-purple-700">💆 SPA</span>';

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

        window.printCurrentCashbookVoucher = function() {
            if (!currentViewedCashbookItem) return;
            const c = currentViewedCashbookItem;
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

            const doc = iframe.contentWindow.document;
            doc.open();
            doc.write(`
                <!DOCTYPE html>
                <html>
                <head>
                    <meta charset="utf-8">
                    <title>${title} - ${c.code}</title>
                    <style>
                        @page { size: 80mm auto; margin: 0; }
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
                const accCode = c.account_code ? `<span class="font-mono text-[10px] text-gray-400 block">${c.account_code}</span>` : '';

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
                                class="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[11px] font-bold font-mono bg-blue-50 hover:bg-blue-100 text-blue-700 border border-blue-200 shadow-2xs transition" 
                                title="Bấm xem nguồn gốc hóa đơn ${dispCode}">
                            <span>🧾</span> <span>${dispCode}</span> <span class="text-[9px]">↗</span>
                        </button>
                    `;
                } else if (linkedType === 'pet_service') {
                    const dispCode = c.ref_pet_service_code || (typeof linkedTarget === 'string' && linkedTarget.startsWith('DV') ? linkedTarget : `Phiếu #${c.ref_id}`);
                    linkedBadge = `
                        <button type="button" onclick="event.stopPropagation(); openCashbookDrawer(${c.id})" 
                                class="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[11px] font-bold font-mono bg-purple-50 hover:bg-purple-100 text-purple-700 border border-purple-200 shadow-2xs transition" 
                                title="Bấm xem nguồn gốc phiếu dịch vụ Spa ${dispCode}">
                            <span>🐾</span> <span>${dispCode}</span> <span class="text-[9px]">↗</span>
                        </button>
                    `;
                } else if (linkedType === 'topup') {
                    linkedBadge = `
                        <button type="button" onclick="event.stopPropagation(); openCashbookDrawer(${c.id})"
                                class="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-bold font-mono bg-amber-50 hover:bg-amber-100 text-amber-700 border border-amber-200" title="Bấm xem chi tiết phiếu thu nạp ví">
                            <span>💳 Nạp ví</span>
                        </button>
                    `;
                }

                return `
                    <tr onclick="openCashbookDrawer(${c.id})" class="border-b hover:bg-indigo-50/60 cursor-pointer transition">
                        <td class="p-2.5">
                            <div class="font-mono text-xs font-bold text-slate-800 flex items-center gap-1.5">
                                <span>${c.code || '-'}</span>
                                <span class="text-[10px] text-indigo-500 font-normal" title="Bấm dòng để xem nguồn gốc chứng từ (Drawer)">📑</span>
                            </div>
                            ${linkedBadge ? `<div class="mt-1">${linkedBadge}</div>` : ''}
                        </td>
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

        let ordersCurrentPage = 1;
        let allCachedOrders = [];

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
                tbody.innerHTML = '<tr><td colspan="10" class="p-6 text-center text-gray-400 italic">Không có hóa đơn nào</td></tr>';
                const pContainer = document.getElementById('pagination-orders');
                if (pContainer) pContainer.innerHTML = '';
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

                return `
                    <tr class="card-row card-row-anim text-xs select-none" style="--row-idx: ${idx};">
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

            if (typeof renderPaginationBar === 'function') {
                renderPaginationBar('pagination-orders', ordersCurrentPage, totalPages, totalItems, 'changeOrdersPage');
            }
        }

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
                } else {
                    document.getElementById('btn-edit-order-from-view')?.classList.remove('hidden');
                    document.getElementById('btn-delete-order-from-view')?.classList.remove('hidden');
                }

                document.getElementById('view-order-code').textContent = ord.code;
                document.getElementById('view-order-date').textContent = ord.created_at || '';
                const custPhoneHtml = ord.customer_phone ? ' (' + (typeof formatMaskedPhone === 'function' ? formatMaskedPhone(ord.customer_phone) : ord.customer_phone) + ')' : '';
                document.getElementById('view-order-cust').innerHTML = (ord.customer_name || 'Khách lẻ') + custPhoneHtml;
                document.getElementById('view-order-staff').textContent = ord.staff_name || 'Thu ngân';

                let prodTotal = 0;
                let svcTotal = 0;

                const tbody = document.getElementById('view-order-items');
                tbody.innerHTML = (ord.items || []).map((item, idx) => {
                    const sub = item.subtotal || ((item.quantity || 0) * (item.price || 0));
                    const isSvc = item.product_type === 'service' || (item.product_name && (item.product_name.toLowerCase().includes('spa') || item.product_name.toLowerCase().includes('tắm') || item.product_name.toLowerCase().includes('cắt')));
                    if (isSvc) {
                        svcTotal += sub;
                    } else {
                        prodTotal += sub;
                    }
                    const typeBadge = isSvc 
                        ? '<span class="px-1.5 py-0.5 rounded text-[10px] font-bold bg-purple-100 text-purple-700 mr-1.5 whitespace-nowrap">💆 Dịch vụ</span>'
                        : '<span class="px-1.5 py-0.5 rounded text-[10px] font-bold bg-blue-100 text-blue-700 mr-1.5 whitespace-nowrap">📦 Sản phẩm</span>';

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

            tbody.innerHTML = editingOrderData.items.map((item, idx) => {
                const isSvc = item.product_type === 'service' || (item.product_name && (item.product_name.toLowerCase().includes('spa') || item.product_name.toLowerCase().includes('tắm') || item.product_name.toLowerCase().includes('cắt')));
                const typeBadge = isSvc 
                    ? '<span class="px-1.5 py-0.5 rounded text-[10px] font-bold bg-purple-100 text-purple-700 mr-1.5 whitespace-nowrap">💆 Dịch vụ</span>'
                    : '<span class="px-1.5 py-0.5 rounded text-[10px] font-bold bg-blue-100 text-blue-700 mr-1.5 whitespace-nowrap">📦 Sản phẩm</span>';

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
                const isSvc = it.product_type === 'service' || (it.product_name && (it.product_name.toLowerCase().includes('spa') || it.product_name.toLowerCase().includes('tắm') || it.product_name.toLowerCase().includes('cắt')));
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
            discount: { zone: "footer", type: "text", text: "Giảm giá: -{{giam_gia}}", label: "Giảm Giá", fsz: 11, bold: false, align: "right", w: 270 },
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
                giam_gia: "40.000 đ",
                tiet_kiem: "40.000 đ",
                phai_tra: "200.000 đ",
                khach_tra: "200.000 đ",
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
                                        <td colspan="3" style="padding: 5px 0 2px 0; font-weight: 600; text-align: left; line-height: 1.2;">Áo Thun Basic (Demo)</td>
                                    </tr>
                                    <tr style="border-bottom: 0.5px dotted #ccc;">
                                        <td style="text-align: left; vertical-align: top; padding: 2px 0 5px 0;">2</td>
                                        <td style="text-align: right; vertical-align: top; padding: 2px 0 5px 0;">
                                            <div style="font-weight: bold; line-height: 1.1;">100.000 đ</div>
                                            <div style="color: #666; font-size: 9px; line-height: 1.1; margin-top: 1px;">
                                                <span style="text-decoration: line-through;">120.000 đ</span>
                                                <span style="color: #15803d; font-weight: 500;">(Giảm 20.000 đ)</span>
                                            </div>
                                        </td>
                                        <td style="text-align: right; vertical-align: top; padding: 2px 0 5px 0;">
                                            <div style="font-weight: bold;">200.000 đ</div>
                                            <div style="color: #15803d; font-size: 9px; line-height: 1.1;">(Giảm 40.000 đ)</div>
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
                                        <th style="text-align: left; padding: 4px 0;">Tên sản phẩm</th>
                                        <th style="text-align: center; width: 36px;">SL</th>
                                        <th style="text-align: right; width: 84px;">Đơn giá</th>
                                        <th style="text-align: right; width: 90px;">Thành tiền</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    <tr style="border-bottom: 0.5px dotted #ccc;">
                                        <td style="padding: 4px 0; vertical-align: top;">Áo Thun Basic (Demo)</td>
                                        <td style="text-align: center; vertical-align: top;">2</td>
                                        <td style="text-align: right; vertical-align: top;">
                                            <div style="font-weight: bold; line-height: 1.1;">100.000 đ</div>
                                            <div style="text-decoration: line-through; color: #777; font-size: 9px; line-height: 1.1; margin-top: 1px;">120.000 đ</div>
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
                    txt = txt.replace(/{{ngay_gio}}/g, mockData.ngay_gio);
                    txt = txt.replace(/{{thu_ngan}}/g, mockData.thu_ngan);
                    txt = txt.replace(/{{ten_khach}}/g, mockData.ten_khach);
                    txt = txt.replace(/{{sdt_khach}}/g, mockData.sdt_khach);
                    txt = txt.replace(/{{tong_tien}}/g, mockData.tong_tien);
                    txt = txt.replace(/{{giam_gia}}/g, mockData.giam_gia);
                    txt = txt.replace(/{{tiet_kiem}}/g, mockData.tiet_kiem);
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
            let itemDiscountTotal = 0;
            (ord.items || []).forEach(it => {
                if (it.original_price && it.original_price > it.price) {
                    itemDiscountTotal += (it.original_price - it.price) * (it.quantity || 1);
                }
            });
            const billDiscount = ord.discount || 0;
            const totalSavings = itemDiscountTotal + billDiscount;

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
                giam_gia: formatMoney(totalSavings > 0 ? totalSavings : (ord.discount || 0)),
                tiet_kiem: formatMoney(totalSavings),
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
                    txt = txt.replace(/{{tiet_kiem}}/g, printData.tiet_kiem);
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
            renderAndPrint(ord);
        }




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

        window.viewOrderDetailModal = viewOrderDetailModal;
        window.openCashbookLinkedDoc = openCashbookLinkedDoc;
        window.openCashbookDrawer = openCashbookDrawer;
        window.closeCashbookDrawer = closeCashbookDrawer;
        window.openCashbookVoucherDetail = openCashbookVoucherDetail;
        window.closeCashbookViewModal = closeCashbookViewModal;
        window.viewPetServiceDetailModal = viewPetServiceDetailModal;
        window.closeModalPetServiceView = closeModalPetServiceView;
        window.printCurrentViewedPetTicket = printCurrentViewedPetTicket;
        window.printCurrentCashbookVoucher = printCurrentCashbookVoucher;

