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
                const isDebtPlan = it.order_type === 'DEBT_PLAN';

                return `
                    <div class="flex flex-wrap items-center justify-between ${isDebtPlan ? 'bg-purple-50/70 border-purple-200' : 'bg-slate-50 border-slate-200'} hover:bg-slate-100 p-2.5 rounded-lg border text-xs gap-2 transition-colors">
                        <div class="flex items-center gap-2">
                            <span class="px-2 py-0.5 rounded font-mono font-bold text-[10px] ${isCty ? 'bg-indigo-100 text-indigo-700 border border-indigo-200' : 'bg-purple-100 text-purple-700 border border-purple-200'}">
                                ${isCty ? '🏢 Quỹ Cty' : '👤 Cá Nhân'}
                            </span>
                            <div>
                                <span class="font-bold ${isDebtPlan ? 'text-purple-900' : 'text-slate-800'}">${isDebtPlan ? '📌 [HẸN TRẢ NỢ NCC]' : it.code}</span> - 
                                <span class="text-slate-700 font-semibold">${it.partner_name || 'Nhà cung cấp'}</span>
                                ${isDebtPlan ? `<span class="text-[11px] text-purple-700 italic ml-1 font-medium">"${it.note || 'Hẹn trả nợ'}"</span>` : `<span class="text-[10px] text-slate-500 ml-1">(${it.order_type === 'OEM' ? 'Gia công OEM' : 'Nhập hàng'})</span>`}
                            </div>
                        </div>
                        <div class="flex items-center gap-3">
                            <div class="text-right">
                                <div class="text-[10px] text-slate-500">${isDebtPlan ? 'Ngày hẹn trả:' : 'Hạn nhận (±1 ngày):'}</div>
                                <div class="font-mono ${isDebtPlan ? 'text-purple-800' : 'text-slate-800'} font-bold">📅 ${dateStr}</div>
                            </div>
                            <div class="text-right">
                                <div class="text-[10px] text-slate-500">${isDebtPlan ? 'Số tiền hẹn trả:' : 'Dự kiến chi:'}</div>
                                <div class="font-mono font-black text-rose-600 text-sm">${formatMoney(it.amount)}</div>
                            </div>
                            ${isDebtPlan ? `
                                <div class="flex items-center gap-1.5 ml-1">
                                    <button onclick="executeDebtPlanPayment(${it.id}, ${it.supplier_id}, ${it.amount}, '${it.fund_source}', '${(it.partner_name || '').replace(/'/g, "\\'")}', '${(it.note || '').replace(/'/g, "\\'")}')" class="px-2 py-1 bg-emerald-600 hover:bg-emerald-700 text-white rounded font-bold text-xs shadow-xs flex items-center gap-1" title="Chi trả khoản hẹn này">
                                        ⚡ Chi trả
                                    </button>
                                    <button onclick="cancelDebtPlan(${it.id})" class="px-2 py-1 bg-white hover:bg-rose-50 text-rose-600 hover:text-rose-700 rounded font-bold text-xs border border-rose-200" title="Hủy kế hoạch hẹn trả">
                                        ✕
                                    </button>
                                </div>
                            ` : ''}
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
                                <button onclick="quickEditSupplierDebt(${s.id}, '${s.name.replace(/'/g, "\\'")}', ${s.debt_company || 0}, ${s.debt_personal || 0})" class="text-xs bg-sky-50 hover:bg-sky-100 text-sky-700 px-2 py-1 rounded font-bold border border-sky-200" title="Chỉnh sửa công nợ đầu kỳ">
                                    ✏️ Sửa nợ
                                </button>
                                ${hasDebt ? `
                                    <button onclick="openModalCreateDebtPlan(${s.id}, '${s.name.replace(/'/g, "\\'")}', ${s.debt_company || 0}, ${s.debt_personal || 0})" class="text-xs bg-purple-50 hover:bg-purple-100 text-purple-700 px-2 py-1 rounded font-bold border border-purple-200" title="Tạo kế hoạch hẹn ngày thanh toán nợ">
                                        📅 Hẹn trả
                                    </button>
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

        async function quickEditSupplierDebt(supplierId, supplierName, currentDebtCompany, currentDebtPersonal) {
            const modal = document.getElementById('modal-quick-edit-debt');
            if (modal) {
                document.getElementById('qed-supp-id').value = supplierId;
                document.getElementById('qed-supp-name').textContent = supplierName;
                document.getElementById('qed-debt-company').value = currentDebtCompany || 0;
                document.getElementById('qed-debt-personal').value = currentDebtPersonal || 0;
                updateQEDTotal();
                modal.classList.remove('hidden');
                return;
            }

            // Fallback prompt nếu modal chưa sẵn sàng
            const cStr = prompt(`[Quỹ CÔNG TY] Nhập công nợ cho "${supplierName}":`, currentDebtCompany || 0);
            if (cStr === null) return;
            const pStr = prompt(`[Quỹ CÁ NHÂN] Nhập công nợ cho "${supplierName}":`, currentDebtPersonal || 0);
            if (pStr === null) return;
            
            const newC = parseFloat(String(cStr).replace(/[^0-9.-]+/g, '')) || 0;
            const newP = parseFloat(String(pStr).replace(/[^0-9.-]+/g, '')) || 0;

            try {
                const res = await fetch(`/api/contacts/${supplierId}/debt`, {
                    method: 'PUT',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ initial_debt_company: newC, initial_debt_personal: newP })
                });
                if (!res.ok) {
                    const err = await res.json();
                    alert('Lỗi cập nhật nợ: ' + (err.detail || 'Không thể thực hiện'));
                    return;
                }
                alert(`Đã cập nhật công nợ cho "${supplierName}" thành công!`);
                await loadCFDSuppliers();
                if (typeof loadContacts === 'function') loadContacts();
            } catch (e) {
                console.error(e);
                alert('Lỗi kết nối máy chủ!');
            }
        }

        function updateQEDTotal() {
            const cVal = parseFloat(document.getElementById('qed-debt-company')?.value || 0) || 0;
            const pVal = parseFloat(document.getElementById('qed-debt-personal')?.value || 0) || 0;
            const totalEl = document.getElementById('qed-debt-total');
            if (totalEl) totalEl.textContent = formatMoney(cVal + pVal);
        }

        function closeQuickEditDebtModal() {
            const modal = document.getElementById('modal-quick-edit-debt');
            if (modal) modal.classList.add('hidden');
        }

        async function submitQuickEditDebt() {
            const supplierId = document.getElementById('qed-supp-id').value;
            const cVal = parseFloat(document.getElementById('qed-debt-company').value || 0) || 0;
            const pVal = parseFloat(document.getElementById('qed-debt-personal').value || 0) || 0;
            const btn = document.getElementById('qed-submit-btn');

            if (cVal < 0 || pVal < 0) {
                alert('Số tiền công nợ không được âm!');
                return;
            }

            try {
                if (btn) { btn.disabled = true; btn.innerText = 'Đang lưu...'; }
                const res = await fetch(`/api/contacts/${supplierId}/debt`, {
                    method: 'PUT',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ initial_debt_company: cVal, initial_debt_personal: pVal })
                });
                if (!res.ok) {
                    const err = await res.json();
                    alert('Lỗi cập nhật nợ: ' + (err.detail || 'Không thể thực hiện'));
                    return;
                }
                closeQuickEditDebtModal();
                await loadCFDSuppliers();
                if (typeof loadContacts === 'function') loadContacts();
            } catch (e) {
                console.error(e);
                alert('Lỗi kết nối máy chủ!');
            } finally {
                if (btn) { btn.disabled = false; btn.innerText = 'Lưu Thay Đổi'; }
            }
        }

        // ==========================================
        // KẾ HOẠCH HẸN TRẢ NỢ NCC (DEBT PAYMENT PLANS)
        // ==========================================
        let currentPlanSupplierOrders = [];

        async function openModalCreateDebtPlan(supplierId, supplierName, debtCty, debtPersonal) {
            document.getElementById('plan-supplier-id').value = supplierId;
            document.getElementById('plan-supp-name-display').innerText = `Nhà cung cấp: ${supplierName}`;

            const dCty = parseFloat(debtCty) || 0;
            const dPer = parseFloat(debtPersonal) || 0;
            const dTotal = dCty + dPer;

            document.getElementById('plan-debt-company').innerText = formatMoney(dCty);
            document.getElementById('plan-debt-personal').innerText = formatMoney(dPer);
            document.getElementById('plan-debt-total').innerText = formatMoney(dTotal);

            const radioPartial = document.querySelector('input[name="plan_type"][value="PARTIAL_DEBT"]');
            if (radioPartial) radioPartial.checked = true;
            togglePlanTypeView('PARTIAL_DEBT');

            const targetDate = new Date();
            targetDate.setDate(targetDate.getDate() + 3);
            const dateStr = targetDate.toISOString().split('T')[0];
            const dateInput = document.getElementById('plan-date');
            if (dateInput) dateInput.value = dateStr;

            document.getElementById('plan-amount').value = dTotal > 0 ? dTotal : '';

            const fundSelect = document.getElementById('plan-fund-source');
            if (fundSelect) {
                fundSelect.value = (dCty > 0 && dPer === 0) ? 'COMPANY' : 'PERSONAL';
            }

            document.getElementById('plan-note').value = 'Hẹn thanh toán nợ đợt này';
            document.getElementById('modal-cfd-debt-plan').classList.remove('hidden');

            currentPlanSupplierOrders = [];
            try {
                const res = await fetch(`/api/cashflow-debts/suppliers/${supplierId}/orders`);
                if (res.ok) {
                    currentPlanSupplierOrders = await res.json();
                    renderPlanOrdersDropdown();
                }
            } catch (e) {
                console.error("Lỗi nạp đơn nợ của NCC:", e);
            }
        }

        function closeModalCreateDebtPlan() {
            document.getElementById('modal-cfd-debt-plan')?.classList.add('hidden');
        }

        function togglePlanTypeView(type) {
            const orderBox = document.getElementById('plan-order-container');
            if (!orderBox) return;
            if (type === 'BY_ORDER') {
                orderBox.classList.remove('hidden');
                onPlanOrderSelectChange();
            } else {
                orderBox.classList.add('hidden');
            }
        }

        function renderPlanOrdersDropdown() {
            const sel = document.getElementById('plan-purchase-select');
            if (!sel) return;
            if (currentPlanSupplierOrders.length === 0) {
                sel.innerHTML = '<option value="">(Không có đơn nợ lẻ nào)</option>';
                return;
            }
            sel.innerHTML = currentPlanSupplierOrders.map(o => `
                <option value="${o.id}" data-debt="${o.debt_amount}" data-type="${o.order_type}" data-vat="${o.has_vat}">
                    ${o.code} - Còn nợ: ${formatMoney(o.debt_amount)} (${o.has_vat ? 'Quỹ Cty' : 'Cá Nhân'})
                </option>
            `).join('');
        }

        function onPlanOrderSelectChange() {
            const sel = document.getElementById('plan-purchase-select');
            if (!sel || !sel.value) return;
            const opt = sel.options[sel.selectedIndex];
            if (opt) {
                const debt = parseFloat(opt.getAttribute('data-debt')) || 0;
                const hasVat = opt.getAttribute('data-vat') === '1';
                document.getElementById('plan-amount').value = debt;
                document.getElementById('plan-fund-source').value = hasVat ? 'COMPANY' : 'PERSONAL';
            }
        }

        function setPlanQuickAmount(rate) {
            const dTotalText = document.getElementById('plan-debt-total').innerText.replace(/[^0-9]/g, '');
            const dTotal = parseFloat(dTotalText) || 0;
            const amt = Math.round(dTotal * rate);
            document.getElementById('plan-amount').value = amt;
        }

        async function submitCreateDebtPlan() {
            const suppId = parseInt(document.getElementById('plan-supplier-id').value);
            const planType = document.querySelector('input[name="plan_type"]:checked')?.value || 'PARTIAL_DEBT';
            const amount = parseFloat(document.getElementById('plan-amount').value) || 0;
            const fundSource = document.getElementById('plan-fund-source').value;
            const planDate = document.getElementById('plan-date').value;
            const note = document.getElementById('plan-note').value.trim();

            if (!suppId) {
                alert("Lỗi: Không tìm thấy nhà cung cấp!");
                return;
            }
            if (amount <= 0) {
                alert("Vui lòng nhập số tiền hẹn trả lớn hơn 0!");
                document.getElementById('plan-amount')?.focus();
                return;
            }
            if (!planDate) {
                alert("Vui lòng chọn ngày hẹn thanh toán!");
                document.getElementById('plan-date')?.focus();
                return;
            }

            let purchaseId = null;
            if (planType === 'BY_ORDER') {
                const orderVal = document.getElementById('plan-purchase-select').value;
                if (orderVal) purchaseId = parseInt(orderVal);
            }

            const btn = document.getElementById('btn-submit-debt-plan');
            if (btn) btn.disabled = true;

            try {
                const res = await fetch('/api/cashflow-debts/payment-plans', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        supplier_id: suppId,
                        plan_date: planDate,
                        amount: amount,
                        fund_source: fundSource,
                        purchase_id: purchaseId,
                        note: note
                    })
                });

                if (!res.ok) {
                    const err = await res.json();
                    alert("Lỗi tạo kế hoạch: " + (err.detail || "Không thể lưu"));
                    return;
                }

                const result = await res.json();
                alert(result.message || "Đã lưu kế hoạch hẹn trả nợ!");
                closeModalCreateDebtPlan();

                await loadCashflowDebtsData();
            } catch (e) {
                console.error("submitCreateDebtPlan error:", e);
                alert("Lỗi kết nối máy chủ!");
            } finally {
                if (btn) btn.disabled = false;
            }
        }

        async function cancelDebtPlan(planId) {
            if (!confirm("Bạn có chắc chắn muốn HỦY kế hoạch hẹn trả nợ này?")) return;
            try {
                const res = await fetch(`/api/cashflow-debts/payment-plans/${planId}`, { method: 'DELETE' });
                if (!res.ok) {
                    const err = await res.json();
                    alert("Lỗi: " + (err.detail || "Không thể hủy"));
                    return;
                }
                await loadCashflowDebtsData();
            } catch (e) {
                console.error("cancelDebtPlan error:", e);
                alert("Lỗi kết nối máy chủ!");
            }
        }

        function executeDebtPlanPayment(planId, suppId, amount, fundSource, suppName, note) {
            openModalPaySupplierDebt(suppId);
            setTimeout(() => {
                const amtInput = document.getElementById('cfd-pay-amount');
                const fundSelect = document.getElementById('cfd-pay-fund');
                const noteInput = document.getElementById('cfd-pay-note');

                if (amtInput) amtInput.value = amount;
                if (fundSelect) {
                    fundSelect.value = fundSource;
                    if (typeof onCFDPayFundChange === 'function') onCFDPayFundChange();
                }
                if (noteInput) noteInput.value = note ? `Thanh toán theo kế hoạch: ${note}` : `Chi trả theo kế hoạch hẹn nợ`;
            }, 300);
        }
