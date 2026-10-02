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
                            base_unit: ing.unit || 'đv',
                            unit_ratio: 1,
                            units: ing.units || [],
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
                            base_unit: prod.unit || 'cái',
                            unit_ratio: 1,
                            units: prod.units || [],
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
            renderPurchaseItems(field === 'quantity' && (purchaseCart[idx].unit_ratio || 1) != 1);
        }

        // Đổi đơn vị nhập (Chai <-> Thùng): giá nhập quy theo đơn vị đang chọn
        function changePurchaseItemUnit(idx, ratioStr) {
            const item = purchaseCart[idx];
            if (!item) return;
            const oldRatio = item.unit_ratio || 1;
            const ratio = parseFloat(ratioStr) || 1;
            const picked = (item.units || []).find(u => u.ratio == ratio);

            // Giữ giá vốn / đơn vị cơ bản không đổi, chỉ nhân lại theo đơn vị mới
            const baseCost = item.cost_price / oldRatio;
            item.unit_ratio = ratio;
            item.unit = picked ? picked.unit_name : (item.base_unit || item.unit);
            item.cost_price = Math.round(baseCost * ratio);
            renderPurchaseItems();
        }
        window.changePurchaseItemUnit = changePurchaseItemUnit;

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

                    // Nhập theo Thùng/Lốc: tồn kho vẫn cộng theo đơn vị cơ bản
                    const baseUnit = item.base_unit || item.unit || 'cái';
                    const extraUnits = item.units || [];
                    const unitCell = extraUnits.length
                        ? `<select onchange="changePurchaseItemUnit(${idx}, this.value)" class="border border-indigo-200 bg-indigo-50/50 rounded px-1 py-0.5 text-[11px] font-semibold text-indigo-800 cursor-pointer">
                               <option value="1" ${(item.unit_ratio || 1) == 1 ? 'selected' : ''}>${baseUnit}</option>
                               ${extraUnits.map(u => `<option value="${u.ratio}" ${(item.unit_ratio || 1) == u.ratio ? 'selected' : ''}>${u.unit_name}</option>`).join('')}
                           </select>`
                        : (item.unit || '');
                    const convHint = (item.unit_ratio && item.unit_ratio != 1)
                        ? `<div class="text-[10px] text-indigo-600 font-semibold mt-0.5">= ${(item.quantity * item.unit_ratio).toLocaleString('vi-VN')} ${baseUnit}</div>`
                        : '';

                    return `
                    <tr class="border-b hover:bg-gray-50 text-xs">
                        <td class="p-2 text-center text-gray-400">${idx + 1}</td>
                        <td class="p-2 font-medium text-slate-800">${item.name}</td>
                        <td class="p-2 text-center">${badge}</td>
                        <td class="p-2 text-center text-gray-500">${unitCell}</td>
                        <td class="p-2 text-right">
                            <input type="number" step="any" min="0.001" value="${item.quantity}" 
                                class="border p-1 rounded w-20 text-right font-bold text-sky-700" 
                                oninput="updatePurchaseItemField(${idx}, 'quantity', this.value)">
                            ${convHint}
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

                if (typeof setPurchaseFundSource === 'function' && p.fund_source) {
                    setPurchaseFundSource(p.fund_source);
                } else {
                    const fundSel = document.getElementById('purchase-fund-source');
                    if (fundSel && p.fund_source) fundSel.value = p.fund_source;
                }

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
                purchaseCart = (p.items || []).map(item => {
                    const src = item.item_type === 'ingredient'
                        ? (costIngredients || []).find(x => x.id === item.ingredient_id)
                        : (allProducts || []).find(x => x.id === item.product_id);
                    return {
                        item_type: item.item_type,
                        product_id: item.product_id,
                        ingredient_id: item.ingredient_id,
                        name: item.item_name,
                        unit: item.unit,
                        base_unit: src?.unit || item.unit,
                        unit_ratio: item.unit_ratio || 1,
                        units: src?.units || [],
                        quantity: item.quantity,
                        cost_price: item.cost_price
                    };
                });

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

        window.setPurchaseFundSource = function(fund) {
            const input = document.getElementById('purchase-fund-source');
            if (input) input.value = fund;

            const pillPer = document.getElementById('pill-po-fund-personal');
            const pillCty = document.getElementById('pill-po-fund-company');
            if (pillPer && pillCty) {
                if (fund === 'PERSONAL') {
                    pillPer.className = "py-1.5 px-2 rounded-md font-bold transition flex items-center justify-center gap-1 bg-purple-600 text-white shadow-xs";
                    pillCty.className = "py-1.5 px-2 rounded-md font-semibold text-slate-600 hover:text-slate-900 transition flex items-center justify-center gap-1";
                } else {
                    pillCty.className = "py-1.5 px-2 rounded-md font-bold transition flex items-center justify-center gap-1 bg-blue-600 text-white shadow-xs";
                    pillPer.className = "py-1.5 px-2 rounded-md font-semibold text-slate-600 hover:text-slate-900 transition flex items-center justify-center gap-1";
                }
            }
        };

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
            if (typeof setPurchaseFundSource === 'function') setPurchaseFundSource('PERSONAL');
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
                    unit_ratio: i.unit_ratio || 1,
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

        let currentPurchaseSubView = 'list';

        function togglePurchaseSubView(view) {
            currentPurchaseSubView = view;
            const listView = document.getElementById('purchase-list-view');
            const compareView = document.getElementById('purchase-compare-view');
            const priceHistView = document.getElementById('purchase-price-history-view');

            const tabList = document.getElementById('btn-subtab-po-list');
            const tabCompare = document.getElementById('btn-subtab-po-compare');
            const tabPriceHist = document.getElementById('btn-subtab-po-price-hist');

            // Ẩn tất cả view
            if (listView) listView.classList.add('hidden');
            if (compareView) compareView.classList.add('hidden');
            if (priceHistView) priceHistView.classList.add('hidden');

            const inactiveCls = "py-1.5 px-3 rounded-md font-semibold text-slate-600 hover:text-slate-900 transition flex items-center gap-1.5";
            const activeCls = "py-1.5 px-3 rounded-md font-bold transition flex items-center gap-1.5 bg-indigo-600 text-white shadow-xs";

            if (tabList) tabList.className = inactiveCls;
            if (tabCompare) tabCompare.className = inactiveCls;
            if (tabPriceHist) tabPriceHist.className = inactiveCls;

            if (view === 'compare') {
                if (compareView) compareView.classList.remove('hidden');
                if (tabCompare) tabCompare.className = activeCls;
                loadPriceComparisonData();
            } else if (view === 'price-history') {
                if (priceHistView) priceHistView.classList.remove('hidden');
                if (tabPriceHist) tabPriceHist.className = activeCls;
                loadPriceHistoryAllData();
            } else {
                // Mặc định về danh sách đơn hàng
                if (listView) listView.classList.remove('hidden');
                if (tabList) tabList.className = activeCls;
                loadPurchasesList();
            }
        }

        function refreshCurrentPurchaseSubView() {
            if (currentPurchaseSubView === 'compare') {
                loadPriceComparisonData();
            } else if (currentPurchaseSubView === 'price-history') {
                loadPriceHistoryAllData();
            } else {
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
                const tbody = document.getElementById('table-purchases-history');
                if (tbody && typeof renderTableSkeleton === 'function') {
                    renderTableSkeleton(tbody, 5, 10);
                }

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

                tbody.innerHTML = list.map((p, idx) => {
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
                    <tr class="card-row card-row-anim text-xs select-none" style="--row-idx: ${idx};">
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
                        <td class="p-2 text-right font-mono font-bold text-slate-900">${formatMoney(it.subtotal != null ? it.subtotal : (it.total_cost != null ? it.total_cost : (it.quantity * it.cost_price)))}</td>
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

            const confirmed = typeof window.customConfirm === 'function'
                ? await window.customConfirm(`Xác nhận nhận hàng cho phiếu [${code}]?\n\n📦 Tồn kho sẽ được cộng dồn và thẻ kho sẽ được tạo ngay lập tức.`, 'Xác Nhận Nhập Hàng', { icon: '📦', okText: 'Nhận Hàng & Nhập Kho' })
                : confirm(`Xác nhận nhận hàng cho phiếu [${code}]?\nTồn kho sẽ được cộng dồn và thẻ kho sẽ được tạo ngay lập tức.`);
            if (!confirmed) return;

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
            const confirmed = typeof window.customConfirm === 'function'
                ? await window.customConfirm(`Bạn có chắc chắn muốn HỦY phiếu nhập [${code}]?\n\n⚠️ Thao tác này sẽ hoàn lại công nợ NCC và hoàn kho (nếu phiếu đã nhận hàng)!`, 'Hủy Phiếu Nhập Hàng', { type: 'danger', okText: 'Xác Nhận Hủy' })
                : confirm(`Bạn có chắc chắn muốn HỦY phiếu nhập [${code}]?\nThao tác này sẽ hoàn lại công nợ NCC và hoàn kho (nếu phiếu đã nhận hàng)!`);
            if (!confirmed) return;
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

        // ==========================================
        // GÁN NHANH SẢN PHẨM & NGUYÊN LIỆU CHO NCC
        // ==========================================
        let assignSupplierItemsRaw = [];
        let currentAssignSupplierId = null;

        async function openQuickAssignSupplierModal() {
            const suppIdInput = document.getElementById('purchase-supplier');
            const suppSearchInput = document.getElementById('purchase-supplier-search');
            const suppId = suppIdInput ? parseInt(suppIdInput.value) : null;
            const suppName = suppSearchInput ? suppSearchInput.value : '';

            if (!suppId) {
                alert("Vui lòng chọn Nhà Cung Cấp trước khi gán hàng!");
                suppSearchInput?.focus();
                return;
            }

            currentAssignSupplierId = suppId;
            const modal = document.getElementById('modal-quick-assign-supplier');
            const nameDisplay = document.getElementById('assign-supplier-name-display');
            const container = document.getElementById('assign-items-list-container');
            const searchInput = document.getElementById('assign-item-search');
            const filterType = document.getElementById('assign-item-filter-type');

            if (nameDisplay) nameDisplay.textContent = `Đang chọn NCC: ${suppName || ('#' + suppId)}`;
            if (searchInput) searchInput.value = '';
            if (filterType) filterType.value = 'ALL';
            if (container) container.innerHTML = '<div class="text-center py-8 text-gray-400">Đang tải danh sách mặt hàng...</div>';
            if (modal) modal.classList.remove('hidden');

            try {
                const res = await fetch(`/api/suppliers/${suppId}/assignable-items`);
                if (!res.ok) throw new Error("Không thể tải danh sách mặt hàng");
                const data = await res.json();
                assignSupplierItemsRaw = data.items || [];
                renderAssignItemsList();
            } catch (err) {
                console.error("openQuickAssignSupplierModal error:", err);
                if (container) container.innerHTML = '<div class="text-center py-8 text-rose-500 font-bold">Lỗi tải danh mục mặt hàng</div>';
            }
        }

        function closeQuickAssignSupplierModal() {
            document.getElementById('modal-quick-assign-supplier')?.classList.add('hidden');
        }

        function filterAssignItemsList() {
            renderAssignItemsList();
        }

        function selectAllAssignItems(checked) {
            const kw = (document.getElementById('assign-item-search')?.value || '').trim().toLowerCase();
            const typeFilter = document.getElementById('assign-item-filter-type')?.value || 'ALL';

            assignSupplierItemsRaw.forEach(it => {
                let matchType = true;
                if (typeFilter === 'PRODUCT') matchType = it.item_type === 'product';
                else if (typeFilter === 'INGREDIENT') matchType = it.item_type === 'ingredient';
                else if (typeFilter === 'ASSIGNED') matchType = it.is_assigned;

                let matchKw = true;
                if (kw) {
                    const c = (it.code || '').toLowerCase();
                    const n = (it.name || '').toLowerCase();
                    matchKw = c.includes(kw) || n.includes(kw);
                }

                if (matchType && matchKw) {
                    it.is_assigned = checked;
                }
            });

            renderAssignItemsList();
        }

        function toggleAssignItemCheck(idx, checked) {
            if (assignSupplierItemsRaw[idx]) {
                assignSupplierItemsRaw[idx].is_assigned = checked;
                updateAssignItemsSummary();
            }
        }

        function updateAssignItemsSummary() {
            const count = assignSupplierItemsRaw.filter(x => x.is_assigned).length;
            const el = document.getElementById('assign-items-count-summary');
            if (el) el.textContent = `Đã chọn: ${count} món (${count}/${assignSupplierItemsRaw.length})`;
        }

        function renderAssignItemsList() {
            const container = document.getElementById('assign-items-list-container');
            if (!container) return;

            const kw = (document.getElementById('assign-item-search')?.value || '').trim().toLowerCase();
            const typeFilter = document.getElementById('assign-item-filter-type')?.value || 'ALL';

            const filtered = assignSupplierItemsRaw.filter(it => {
                if (typeFilter === 'PRODUCT' && it.item_type !== 'product') return false;
                if (typeFilter === 'INGREDIENT' && it.item_type !== 'ingredient') return false;
                if (typeFilter === 'ASSIGNED' && !it.is_assigned) return false;

                if (kw) {
                    const c = (it.code || '').toLowerCase();
                    const n = (it.name || '').toLowerCase();
                    if (!c.includes(kw) && !n.includes(kw)) return false;
                }
                return true;
            });

            if (filtered.length === 0) {
                container.innerHTML = '<div class="text-center py-8 text-gray-400 italic">Không có mặt hàng nào phù hợp với bộ lọc</div>';
                updateAssignItemsSummary();
                return;
            }

            container.innerHTML = filtered.map(it => {
                const rawIdx = assignSupplierItemsRaw.indexOf(it);
                const isProd = it.item_type === 'product';
                const badge = isProd 
                    ? '<span class="px-1.5 py-0.5 rounded text-[10px] font-bold bg-sky-100 text-sky-800">Hàng Hóa</span>'
                    : '<span class="px-1.5 py-0.5 rounded text-[10px] font-bold bg-emerald-100 text-emerald-800">Nguyên Liệu</span>';

                return `
                    <label class="flex items-center justify-between p-2 hover:bg-sky-50/70 rounded-lg cursor-pointer transition select-none ${it.is_assigned ? 'bg-sky-50/40' : ''}">
                        <div class="flex items-center gap-2.5 flex-1 min-w-0 pr-2">
                            <input type="checkbox" ${it.is_assigned ? 'checked' : ''} 
                                   onchange="toggleAssignItemCheck(${rawIdx}, this.checked)"
                                   class="rounded text-sky-600 focus:ring-sky-500 w-4 h-4 cursor-pointer shrink-0">
                            <div class="truncate">
                                <div class="font-bold text-slate-800 text-xs flex items-center gap-1.5">
                                    <span class="truncate">${it.name}</span>
                                    ${badge}
                                </div>
                                <div class="text-[11px] text-gray-400 font-mono">
                                    Mã: ${it.code || '-'} | ĐVT: ${it.unit} | Giá vốn: ${Number(it.cost_price || 0).toLocaleString('vi-VN')} đ
                                </div>
                            </div>
                        </div>
                        <div class="text-right shrink-0">
                            <span class="text-[11px] font-bold ${it.is_assigned ? 'text-sky-600' : 'text-gray-300'}">
                                ${it.is_assigned ? '✓ Đang cấp' : 'Chưa cấp'}
                            </span>
                        </div>
                    </label>
                `;
            }).join('');

            updateAssignItemsSummary();
        }

        async function saveQuickAssignSupplierItems() {
            if (!currentAssignSupplierId) return;
            const btn = document.getElementById('btn-save-assign-items');
            if (btn) btn.disabled = true;

            const selectedItems = assignSupplierItemsRaw
                .filter(x => x.is_assigned)
                .map(x => ({
                    item_type: x.item_type,
                    item_id: x.id,
                    cost_price: x.cost_price || 0
                }));

            try {
                const res = await fetch(`/api/suppliers/${currentAssignSupplierId}/assign-items`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ items: selectedItems })
                });

                if (!res.ok) {
                    const err = await res.json();
                    alert("Lỗi lưu gán hàng: " + (err.detail || "Không thể lưu"));
                    return;
                }

                alert(`Đã gán thành công ${selectedItems.length} mặt hàng cho nhà cung cấp!`);
                closeQuickAssignSupplierModal();

                if (typeof loadSupplierItemsForFuzzy === 'function') {
                    await loadSupplierItemsForFuzzy(currentAssignSupplierId);
                }
            } catch (err) {
                console.error("saveQuickAssignSupplierItems error:", err);
                alert("Lỗi kết nối khi lưu gán hàng!");
            } finally {
                if (btn) btn.disabled = false;
            }
        }

