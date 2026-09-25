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
                if (typeof renderTableSkeleton === 'function' && typeof currentSpaView !== 'undefined' && currentSpaView === 'table') {
                    renderTableSkeleton('table-pet-services', 6, 13);
                }
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

        // ==========================================
        // CHẾ ĐỘ SỬA TRỰC TIẾP DẠNG BẢNG TÍNH (EXCEL)
        // ==========================================
        let isSpaSpreadsheetMode = false;
        let spaSpreadsheetDirtyMap = new Map();

        function toggleSpaSpreadsheetMode(forceState) {
            if (forceState !== undefined) {
                isSpaSpreadsheetMode = forceState;
            } else {
                isSpaSpreadsheetMode = !isSpaSpreadsheetMode;
            }

            const btnToggle = document.getElementById('btn-toggle-spa-spreadsheet');
            const actionsWrap = document.getElementById('spa-spreadsheet-actions');
            const dirtyBadge = document.getElementById('dirty-ticket-count');

            if (isSpaSpreadsheetMode) {
                if (btnToggle) btnToggle.classList.add('hidden');
                if (actionsWrap) {
                    actionsWrap.classList.remove('hidden');
                    actionsWrap.classList.add('flex');
                }
                spaSpreadsheetDirtyMap.clear();
                if (dirtyBadge) dirtyBadge.textContent = '0';
            } else {
                if (btnToggle) btnToggle.classList.remove('hidden');
                if (actionsWrap) {
                    actionsWrap.classList.add('hidden');
                    actionsWrap.classList.remove('flex');
                }
                spaSpreadsheetDirtyMap.clear();
                if (dirtyBadge) dirtyBadge.textContent = '0';
            }

            renderPetServicesTable();
        }
        window.toggleSpaSpreadsheetMode = toggleSpaSpreadsheetMode;

        function markTicketDirty(ticketId, field, value, el) {
            let item = spaSpreadsheetDirtyMap.get(ticketId) || { id: ticketId };
            item[field] = value;
            spaSpreadsheetDirtyMap.set(ticketId, item);

            const dirtyBadge = document.getElementById('dirty-ticket-count');
            if (dirtyBadge) dirtyBadge.textContent = spaSpreadsheetDirtyMap.size;

            if (el) {
                const tr = el.closest('tr');
                if (tr) {
                    tr.classList.add('bg-amber-50/70', 'border-amber-400');
                }
            }
        }
        window.markTicketDirty = markTicketDirty;

        function onSpaSpreadsheetSurchargeChange(ticketId, inputEl) {
            const raw = parseMoneyInput(inputEl.value);
            const ticket = (allPetServiceTickets || []).find(t => t.id == ticketId);
            const baseServicePrice = ticket ? ((ticket.price || 0) - (ticket.surcharge || 0)) : 0;
            const newTotal = baseServicePrice + raw;

            let item = spaSpreadsheetDirtyMap.get(ticketId) || { id: ticketId };
            item.surcharge = raw;
            item.price = newTotal;
            spaSpreadsheetDirtyMap.set(ticketId, item);

            const totalEl = document.getElementById(`spreadsheet-row-total-${ticketId}`);
            if (totalEl) totalEl.textContent = formatMoneyString(newTotal) + ' đ';

            const dirtyBadge = document.getElementById('dirty-ticket-count');
            if (dirtyBadge) dirtyBadge.textContent = spaSpreadsheetDirtyMap.size;

            const tr = inputEl.closest('tr');
            if (tr) tr.classList.add('bg-amber-50/70', 'border-amber-400');
        }
        window.onSpaSpreadsheetSurchargeChange = onSpaSpreadsheetSurchargeChange;

        function onProgSurchargeCheckboxChanged(key) {
            const teethP = getSvcSurchargePrice('teeth');
            const artP = getSvcSurchargePrice('art');
            const surchP = getSvcSurchargePrice('surch');
            const shipP = getSvcSurchargePrice('ship');

            if (key === 'teeth') {
                const cb = document.getElementById('prog-cb-teeth');
                const inp = document.getElementById('prog-teeth-cleaning');
                if (cb && inp) inp.value = cb.checked ? teethP : 0;
            } else if (key === 'art') {
                const cb = document.getElementById('prog-cb-art');
                const inp = document.getElementById('prog-art-cutting');
                if (cb && inp) inp.value = cb.checked ? artP : 0;
            } else if (key === 'surch') {
                const cb = document.getElementById('prog-cb-surch');
                const inp = document.getElementById('prog-surcharge');
                if (cb && inp) inp.value = cb.checked ? surchP : 0;
            } else if (key === 'ship') {
                const cb = document.getElementById('prog-cb-ship');
                const inp = document.getElementById('prog-shipping-fee');
                if (cb && inp) inp.value = cb.checked ? shipP : 0;
            } else if (key === 'tip') {
                const cb = document.getElementById('prog-cb-tip');
                const inp = document.getElementById('prog-tip-amount');
                if (cb && inp) inp.value = cb.checked ? (parseFloat(inp.value) || 20000) : 0;
            }
            calculateProgTotal();
        }
        window.onProgSurchargeCheckboxChanged = onProgSurchargeCheckboxChanged;

        function toggleSpaSpreadsheetCheckboxFee(ticketId, feeField, isChecked) {
            const standardPrice = getSvcSurchargePrice(feeField === 'teeth_cleaning' ? 'teeth' : (feeField === 'art_cutting_fee' ? 'art' : (feeField === 'shipping_fee' ? 'ship' : 'surch')));
            const val = isChecked ? standardPrice : 0;
            let item = spaSpreadsheetDirtyMap.get(ticketId) || { id: ticketId };
            item[feeField] = val;

            const ticket = (allPetServiceTickets || []).find(t => t.id === ticketId);
            const teeth = item.teeth_cleaning !== undefined ? item.teeth_cleaning : (ticket?.teeth_cleaning || 0);
            const art = item.art_cutting_fee !== undefined ? item.art_cutting_fee : (ticket?.art_cutting_fee || 0);
            const surch = item.surcharge !== undefined ? item.surcharge : (ticket?.surcharge || 0);
            const ship = item.shipping_fee !== undefined ? item.shipping_fee : (ticket?.shipping_fee || 0);
            const tip = item.tip_amount !== undefined ? item.tip_amount : (ticket?.tip_amount || 0);

            const oldTotalFees = (ticket?.teeth_cleaning || 0) + (ticket?.art_cutting_fee || 0) + (ticket?.surcharge || 0) + (ticket?.shipping_fee || 0) + (ticket?.tip_amount || 0);
            const basePrice = (ticket?.price || 0) - oldTotalFees;
            const newTotal = basePrice + teeth + art + surch + ship + tip;
            item.price = newTotal;
            spaSpreadsheetDirtyMap.set(ticketId, item);

            const totalEl = document.getElementById(`spreadsheet-row-total-${ticketId}`);
            if (totalEl) totalEl.textContent = formatMoneyString(newTotal) + ' đ';

            const dirtyBadge = document.getElementById('dirty-ticket-count');
            if (dirtyBadge) dirtyBadge.textContent = spaSpreadsheetDirtyMap.size;
        }
        window.toggleSpaSpreadsheetCheckboxFee = toggleSpaSpreadsheetCheckboxFee;

        function onSpaSpreadsheetDetailFeeChange(ticketId, feeField, inputEl) {
            const raw = parseMoneyInput(inputEl.value);
            const ticket = (allPetServiceTickets || []).find(t => t.id == ticketId);
            let item = spaSpreadsheetDirtyMap.get(ticketId) || { id: ticketId };
            item[feeField] = raw;

            // Tính tổng tiền mới: base_price + teeth + art + surcharge + ship + tip
            const teeth = item.teeth_cleaning !== undefined ? item.teeth_cleaning : (ticket?.teeth_cleaning || 0);
            const art = item.art_cutting_fee !== undefined ? item.art_cutting_fee : (ticket?.art_cutting_fee || 0);
            const surch = item.surcharge !== undefined ? item.surcharge : (ticket?.surcharge || 0);
            const ship = item.shipping_fee !== undefined ? item.shipping_fee : (ticket?.shipping_fee || 0);
            const tip = item.tip_amount !== undefined ? item.tip_amount : (ticket?.tip_amount || 0);

            const oldTotalFees = (ticket?.teeth_cleaning || 0) + (ticket?.art_cutting_fee || 0) + (ticket?.surcharge || 0) + (ticket?.shipping_fee || 0) + (ticket?.tip_amount || 0);
            const basePrice = (ticket?.price || 0) - oldTotalFees;
            const newTotal = basePrice + teeth + art + surch + ship + tip;
            item.price = newTotal;
            spaSpreadsheetDirtyMap.set(ticketId, item);

            const totalEl = document.getElementById(`spreadsheet-row-total-${ticketId}`);
            if (totalEl) totalEl.textContent = formatMoneyString(newTotal) + ' đ';

            const dirtyBadge = document.getElementById('dirty-ticket-count');
            if (dirtyBadge) dirtyBadge.textContent = spaSpreadsheetDirtyMap.size;

            const tr = inputEl.closest('tr');
            if (tr) tr.classList.add('bg-amber-50/70', 'border-amber-400');
        }
        window.onSpaSpreadsheetDetailFeeChange = onSpaSpreadsheetDetailFeeChange;

        function onSpaSpreadsheetWeightChange(ticketId, inputEl) {
            const weight = parseWeightFloat(inputEl.value);
            let item = spaSpreadsheetDirtyMap.get(ticketId) || { id: ticketId };
            item.weight_at_service = weight;
            spaSpreadsheetDirtyMap.set(ticketId, item);

            const dirtyBadge = document.getElementById('dirty-ticket-count');
            if (dirtyBadge) dirtyBadge.textContent = spaSpreadsheetDirtyMap.size;

            const tr = inputEl.closest('tr');
            if (tr) tr.classList.add('bg-amber-50/70', 'border-amber-400');
        }
        window.onSpaSpreadsheetWeightChange = onSpaSpreadsheetWeightChange;

        async function saveSpaSpreadsheetChanges() {
            if (spaSpreadsheetDirtyMap.size === 0) {
                alert('Không có phiếu nào được chỉnh sửa!');
                return;
            }

            const tickets = Array.from(spaSpreadsheetDirtyMap.values());
            const saveBtn = document.getElementById('btn-save-spa-spreadsheet');
            if (saveBtn) {
                saveBtn.disabled = true;
                saveBtn.innerHTML = '<span>⏳</span> <span>Đang lưu...</span>';
            }

            try {
                const res = await fetch('/api/pet-services/tickets/bulk-update', {
                    method: 'PUT',
                    headers: {'Content-Type': 'application/json'},
                    body: JSON.stringify({ tickets })
                });

                if (!res.ok) {
                    const err = await res.json();
                    alert('Lỗi cập nhật đồng loạt: ' + (err.detail || ''));
                    return;
                }

                const resData = await res.json();
                alert(`✅ Đã lưu thành công ${resData.updated_count || tickets.length} phiếu dịch vụ Spa!`);
                toggleSpaSpreadsheetMode(false);
                await loadPetServicesList();
                await loadPetServicesKPI();
            } catch(e) {
                console.error("saveSpaSpreadsheetChanges error:", e);
                alert('Lỗi kết nối máy chủ');
            } finally {
                if (saveBtn) {
                    saveBtn.disabled = false;
                    saveBtn.innerHTML = '<span>💾</span> <span>Lưu Thay Đổi (<span id="dirty-ticket-count">0</span>)</span>';
                }
            }
        }
        window.saveSpaSpreadsheetChanges = saveSpaSpreadsheetChanges;

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

            tbody.innerHTML = filtered.map((t, idx) => {
                const isDirty = spaSpreadsheetDirtyMap.has(t.id);
                const dirtyClass = isDirty ? 'bg-amber-50/70 border-2 border-amber-400' : 'border-b border-slate-200 hover:bg-purple-50/40';

                if (isSpaSpreadsheetMode) {
                    // CHẾ ĐỘ SỬA TRỰC TIẾP NHƯ EXCEL
                    return `
                    <tr class="card-row card-row-anim ${dirtyClass} transition text-[13px]" style="--row-idx: ${idx};">
                        <!-- 1. STT / Mã & Thao Tác Trực Tiếp -->
                        <td class="p-2 text-center font-mono font-bold text-purple-700 border-r border-slate-200 min-w-[130px]">
                            <div class="flex items-center justify-center gap-1">
                                ${t.ticket_number ? `<span class="bg-purple-100 text-purple-900 border border-purple-300 px-2 py-0.5 rounded text-sm font-black shadow-xs">#${t.ticket_number}</span>` : '-'}
                            </div>
                            <div class="text-[10px] text-gray-400 font-mono my-1">${t.code || ''}</div>
                            <div class="flex flex-wrap items-center justify-center gap-1 pt-1 border-t border-slate-200">
                                <button onclick="openServiceProgressModal(${t.id})" class="bg-indigo-600 hover:bg-indigo-700 text-white px-1.5 py-0.5 rounded text-[10px] font-bold shadow-xs" title="Chi tiết đầy đủ">✏️ Sửa</button>
                                <button onclick="printPetServiceTicketDirectly(${t.id}, 'intake')" class="bg-purple-600 hover:bg-purple-700 text-white px-1.5 py-0.5 rounded text-[10px] font-bold shadow-xs" title="In phiếu nhận K80">🖨️</button>
                                <button onclick="printPetServiceTicketDirectly(${t.id}, 'invoice')" class="bg-emerald-600 hover:bg-emerald-700 text-white px-1.5 py-0.5 rounded text-[10px] font-bold shadow-xs" title="In hóa đơn K80">🧾</button>
                                <button onclick="deletePetService(${t.id})" class="text-rose-600 hover:text-rose-800 px-1 py-0.5 border border-rose-200 rounded text-[10px] font-bold" title="Xóa">🗑️</button>
                            </div>
                        </td>
                        <!-- 2. Khách hàng -->
                        <td class="p-2">
                            <div class="font-bold text-slate-800">${t.customer_name || '-'}</div>
                            <div class="font-mono text-xs text-gray-500">${t.customer_phone || ''}</div>
                        </td>
                        <!-- 3. Gọi điện -->
                        <td class="p-2 text-center">${callStatusSelector(t)}</td>
                        <!-- 4. Thú cưng (Editable Cân nặng & Hotel) -->
                        <td class="p-2">
                            <div class="font-bold text-pink-700">🐾 ${t.pet_name || 'Bé cưng'} <span class="text-xs font-medium text-slate-600">(${t.pet_breed || t.pet_species || 'Cún'})</span></div>
                            <div class="flex items-center gap-1 mt-1 text-[11px]">
                                <span class="text-slate-400">Kg:</span>
                                <input type="text" class="w-14 border-2 border-pink-200 p-0.5 rounded text-xs text-center font-bold text-pink-700 bg-white" value="${t.weight_at_service ? String(t.weight_at_service).replace('.', ',') : ''}" placeholder="Kg" oninput="onSpaSpreadsheetWeightChange(${t.id}, this)">
                                <label class="inline-flex items-center gap-0.5 text-[10px] text-sky-800 font-bold ml-1 cursor-pointer" title="Spa xong gửi hotel">
                                    <input type="checkbox" ${t.send_to_hotel ? 'checked' : ''} onchange="markTicketDirty(${t.id}, 'send_to_hotel', this.checked ? 1 : 0, this)"> 🏨
                                </label>
                            </div>
                        </td>
                        <!-- 5. Dịch vụ -->
                        <td class="p-2">
                            <div class="font-bold text-slate-800 text-xs">${t.service_type || '-'}</div>
                            ${t.dye_package ? `<div class="text-[11px] text-purple-700 font-semibold">🎨 ${t.dye_package}</div>` : ''}
                        </td>
                        <!-- 6. Yêu cầu & Phụ kiện (Editable) -->
                        <td class="p-2 space-y-1">
                            <input type="text" class="w-full border p-1 rounded text-xs bg-white text-slate-800" value="${t.customer_request || ''}" placeholder="Yêu cầu khách..." oninput="markTicketDirty(${t.id}, 'customer_request', this.value, this)">
                            <input type="text" class="w-full border p-1 rounded text-xs bg-white text-amber-800 font-medium" value="${t.accessories || ''}" placeholder="Phụ kiện (dây, chuồng...)" oninput="markTicketDirty(${t.id}, 'accessories', this.value, this)">
                            <input type="text" class="w-full border p-1 rounded text-xs bg-white text-slate-600" value="${t.note || ''}" placeholder="Ghi chú thợ..." oninput="markTicketDirty(${t.id}, 'note', this.value, this)">
                        </td>
                        <!-- 7. Thợ phụ trách (Editable) -->
                        <td class="p-2 space-y-1">
                            <input type="text" class="w-full border p-1 rounded text-xs bg-white font-medium text-pink-700" value="${t.staff_cutter || ''}" placeholder="✂️ Thợ cắt..." oninput="markTicketDirty(${t.id}, 'staff_cutter', this.value, this)">
                            <input type="text" class="w-full border p-1 rounded text-xs bg-white font-medium text-sky-700" value="${t.staff_worker_1 || ''}" placeholder="🛁 Thợ tắm..." oninput="markTicketDirty(${t.id}, 'staff_worker_1', this.value, this)">
                            <input type="text" class="w-full border p-1 rounded text-xs bg-white font-medium text-purple-700" value="${t.staff_receiver || ''}" placeholder="📥 Thợ nhận..." oninput="markTicketDirty(${t.id}, 'staff_receiver', this.value, this)">
                        </td>
                        <!-- 8. Trạng thái làm (Editable) -->
                        <td class="p-2 text-center border-r-2 border-purple-300">
                            <select class="w-full border p-1 rounded text-xs font-bold ${t.status === 'completed' ? 'text-emerald-700 bg-emerald-50' : (t.status === 'in_progress' ? 'text-purple-700 bg-purple-50' : 'text-slate-700 bg-white')}" onchange="markTicketDirty(${t.id}, 'status', this.value, this)">
                                <option value="pending" ${t.status === 'pending' ? 'selected' : ''}>⏳ Chờ làm</option>
                                <option value="in_progress" ${t.status === 'in_progress' ? 'selected' : ''}>🔄 Đang làm</option>
                                <option value="completed" ${t.status === 'completed' ? 'selected' : ''}>✅ Đã xong</option>
                                <option value="checked_out" ${t.status === 'checked_out' ? 'selected' : ''}>🏠 Đã về</option>
                            </select>
                        </td>
                        <!-- 9. Phụ thu chi tiết (Editable qua Checkbox + Nhập tiền) -->
                        <td class="p-2 text-right space-y-1">
                            <div class="flex items-center justify-end gap-1 text-[11px]">
                                <label class="inline-flex items-center gap-1 cursor-pointer select-none text-slate-600">
                                    <input type="checkbox" ${t.teeth_cleaning > 0 ? 'checked' : ''} onchange="toggleSpaSpreadsheetCheckboxFee(${t.id}, 'teeth_cleaning', this.checked); this.parentElement.nextElementSibling.value = this.checked ? getSvcSurchargePrice('teeth').toLocaleString('vi-VN') : '';" class="w-3 h-3 text-purple-600 rounded">
                                    <span>Răng:</span>
                                </label>
                                <input type="text" class="w-14 border p-0.5 rounded text-xs text-right font-mono" value="${t.teeth_cleaning ? t.teeth_cleaning.toLocaleString('vi-VN') : ''}" placeholder="0" oninput="onMoneyInputChange(this); onSpaSpreadsheetDetailFeeChange(${t.id}, 'teeth_cleaning', this)">
                            </div>
                            <div class="flex items-center justify-end gap-1 text-[11px]">
                                <label class="inline-flex items-center gap-1 cursor-pointer select-none text-slate-600">
                                    <input type="checkbox" ${t.art_cutting_fee > 0 ? 'checked' : ''} onchange="toggleSpaSpreadsheetCheckboxFee(${t.id}, 'art_cutting_fee', this.checked); this.parentElement.nextElementSibling.value = this.checked ? getSvcSurchargePrice('art').toLocaleString('vi-VN') : '';" class="w-3 h-3 text-purple-600 rounded">
                                    <span>Cắt NT:</span>
                                </label>
                                <input type="text" class="w-14 border p-0.5 rounded text-xs text-right font-mono" value="${t.art_cutting_fee ? t.art_cutting_fee.toLocaleString('vi-VN') : ''}" placeholder="0" oninput="onMoneyInputChange(this); onSpaSpreadsheetDetailFeeChange(${t.id}, 'art_cutting_fee', this)">
                            </div>
                            <div class="flex items-center justify-end gap-1 text-[11px]">
                                <label class="inline-flex items-center gap-1 cursor-pointer select-none text-slate-600">
                                    <input type="checkbox" ${t.surcharge > 0 ? 'checked' : ''} onchange="toggleSpaSpreadsheetCheckboxFee(${t.id}, 'surcharge', this.checked); this.parentElement.nextElementSibling.value = this.checked ? getSvcSurchargePrice('surch').toLocaleString('vi-VN') : '';" class="w-3 h-3 text-purple-600 rounded">
                                    <span>Gỡ rối:</span>
                                </label>
                                <input type="text" class="w-14 border p-0.5 rounded text-xs text-right font-mono font-bold" value="${t.surcharge ? t.surcharge.toLocaleString('vi-VN') : ''}" placeholder="0" oninput="onMoneyInputChange(this); onSpaSpreadsheetDetailFeeChange(${t.id}, 'surcharge', this)">
                            </div>
                            <div class="flex items-center justify-end gap-1 text-[11px]">
                                <label class="inline-flex items-center gap-1 cursor-pointer select-none text-slate-600">
                                    <input type="checkbox" ${t.shipping_fee > 0 ? 'checked' : ''} onchange="toggleSpaSpreadsheetCheckboxFee(${t.id}, 'shipping_fee', this.checked); this.parentElement.nextElementSibling.value = this.checked ? getSvcSurchargePrice('ship').toLocaleString('vi-VN') : '';" class="w-3 h-3 text-purple-600 rounded">
                                    <span>Ship:</span>
                                </label>
                                <input type="text" class="w-14 border p-0.5 rounded text-xs text-right font-mono" value="${t.shipping_fee ? t.shipping_fee.toLocaleString('vi-VN') : ''}" placeholder="0" oninput="onMoneyInputChange(this); onSpaSpreadsheetDetailFeeChange(${t.id}, 'shipping_fee', this)">
                            </div>
                            <div class="flex items-center justify-end gap-1 text-[11px]">
                                <span class="text-emerald-700 font-bold">Tip:</span>
                                <input type="text" class="w-14 border p-0.5 rounded text-xs text-right font-mono font-bold text-emerald-700" value="${t.tip_amount ? t.tip_amount.toLocaleString('vi-VN') : ''}" placeholder="0" oninput="onMoneyInputChange(this); onSpaSpreadsheetDetailFeeChange(${t.id}, 'tip_amount', this)">
                            </div>
                        </td>
                        <!-- 10. Tổng tiền -->
                        <td class="p-2 text-right font-mono font-black text-sky-700 text-sm">
                            <span id="spreadsheet-row-total-${t.id}">${formatMoney(t.price || 0)}</span>
                        </td>
                        <!-- 11. Thanh toán (Editable) -->
                        <td class="p-2 text-center">
                            <select class="border p-1 rounded text-xs font-bold ${t.payment_status === 'paid' ? 'text-emerald-700 bg-emerald-50' : 'text-amber-700 bg-amber-50'}" onchange="markTicketDirty(${t.id}, 'payment_status', this.value, this)">
                                <option value="unpaid" ${t.payment_status !== 'paid' ? 'selected' : ''}>Chưa TT</option>
                                <option value="paid" ${t.payment_status === 'paid' ? 'selected' : ''}>Đã TT</option>
                            </select>
                        </td>
                        <!-- 12. Đưa đón & Giờ Hẹn (Editable) -->
                        <td class="p-2 text-center text-xs space-y-1">
                            <div class="flex items-center justify-center gap-1">
                                <span class="text-purple-700 font-bold text-[10px]">Đến:</span>
                                <input type="text" class="w-14 border p-0.5 rounded text-xs text-center font-mono" value="${t.received_time || ''}" placeholder="Giờ đến" oninput="markTicketDirty(${t.id}, 'received_time', this.value, this)">
                            </div>
                            <div class="flex items-center justify-center gap-1">
                                <span class="text-emerald-700 font-bold text-[10px]">Về:</span>
                                <input type="text" class="w-14 border p-0.5 rounded text-xs text-center font-mono" value="${t.checkout_time || ''}" placeholder="Giờ về" oninput="markTicketDirty(${t.id}, 'checkout_time', this.value, this)">
                            </div>
                        </td>
                    </tr>
                    `;
                }

                // CHẾ ĐỘ XEM BÌNH THƯỜNG
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
                <tr class="card-row card-row-anim text-[13px]" style="--row-idx: ${idx};">
                    <!-- 1. STT / Mã & Thao Tác Trực Tiếp -->
                    <td class="p-2.5 text-center font-mono font-bold text-purple-700 border-r border-slate-200 min-w-[130px]">
                        <div class="flex items-center justify-center gap-1">
                            ${t.ticket_number ? `<span class="bg-purple-100 text-purple-900 border border-purple-300 px-2 py-0.5 rounded text-sm font-black shadow-xs">#${t.ticket_number}</span>` : '-'}
                        </div>
                        <div class="text-[10px] text-gray-400 font-mono my-1">${t.code || ''}</div>
                        <!-- Cụm nút thao tác trực tiếp dưới số phiếu -->
                        <div class="flex flex-wrap items-center justify-center gap-1 pt-1 border-t border-slate-200">
                            <button onclick="openServiceProgressModal(${t.id})" class="bg-indigo-600 hover:bg-indigo-700 text-white px-1.5 py-0.5 rounded text-[10px] font-bold shadow-xs" title="Cập nhật thợ làm, phụ thu & trả bé">✏️ Sửa</button>
                            <button onclick="printPetServiceTicketDirectly(${t.id}, 'intake')" class="bg-purple-600 hover:bg-purple-700 text-white px-1.5 py-0.5 rounded text-[10px] font-bold shadow-xs" title="In phiếu tiếp nhận (2 chữ ký)">🖨️</button>
                            <button onclick="printPetServiceTicketDirectly(${t.id}, 'invoice')" class="bg-emerald-600 hover:bg-emerald-700 text-white px-1.5 py-0.5 rounded text-[10px] font-bold shadow-xs" title="In hóa đơn thanh toán K80">🧾</button>
                            <button onclick="deletePetService(${t.id})" class="text-rose-600 hover:text-rose-800 px-1 py-0.5 border border-rose-200 rounded text-[10px] font-bold" title="Xóa phiếu">🗑️</button>
                        </div>
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
                            ${t.send_to_hotel ? `<span class="bg-sky-100 text-sky-800 font-bold px-1.5 py-0.2 rounded text-[11px]" title="Spa xong gửi hotel">🏨</span>` : ''}
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

        function formatWeightRange(minW, maxW) {
            const minNum = parseFloat(minW) || 0;
            const maxNum = parseFloat(maxW) || 0;
            const minStr = String(minNum).replace('.', ',');
            const maxStr = String(maxNum).replace('.', ',');
            if (minNum === 0 && maxNum >= 999) return 'Mọi cân nặng';
            if (maxNum >= 999) return `>= ${minStr} kg`;
            if (minNum === 0) return `0 - ${maxStr} kg`;
            return `> ${minStr} - ${maxStr} kg`;
        }

        var allSpaCategories = [];

        async function loadSpaCategoriesList() {
            try {
                const res = await fetch('/api/pet-services/categories');
                if (res.ok) {
                    allSpaCategories = await res.json();
                }
            } catch(e) {
                console.error("loadSpaCategoriesList error:", e);
            }
            updatePetPricingCategoryUI();
        }

        function updatePetPricingCategoryUI() {
            const dbCatNames = (allSpaCategories || []).map(x => (x.name || '').trim()).filter(Boolean);
            const pricingCatNames = (allPetPricingData || []).map(x => (x.category || '').trim()).filter(Boolean);
            const categories = [...new Set([...dbCatNames, ...pricingCatNames])];

            // 1. Cập nhật bộ lọc dropdown
            const filterSelect = document.getElementById('pet-pricing-filter-cat') || document.getElementById('filter-pet-pricing-cat');
            if (filterSelect) {
                const currentVal = filterSelect.value || 'all';
                let optionsHtml = `<option value="all">-- Tất Cả Phân Loại (${allPetPricingData.length} mức giá) --</option>`;
                categories.forEach(c => {
                    const count = allPetPricingData.filter(x => (x.category || '').trim() === c).length;
                    optionsHtml += `<option value="${c}">${c} (${count})</option>`;
                });
                filterSelect.innerHTML = optionsHtml;
                if (categories.includes(currentVal) || currentVal === 'all') {
                    filterSelect.value = currentVal;
                }
            }

            // 2. Cập nhật select dropdown trong modal thêm/sửa
            const inputSelect = document.getElementById('pet-pricing-input-cat');
            if (inputSelect) {
                const currentSelected = inputSelect.value || '';
                inputSelect.innerHTML = categories.map(c => `<option value="${c}">${c}</option>`).join('');
                if (currentSelected && categories.includes(currentSelected)) {
                    inputSelect.value = currentSelected;
                }
            }
        }

        function openQuickAddSpaCategoryModal() {
            const input = document.getElementById('quick-spa-category-name');
            if (input) input.value = '';
            document.getElementById('modal-quick-add-spa-category')?.classList.remove('hidden');
            setTimeout(() => input?.focus(), 100);
        }

        function closeQuickAddSpaCategoryModal() {
            document.getElementById('modal-quick-add-spa-category')?.classList.add('hidden');
        }

        async function saveQuickSpaCategory() {
            const input = document.getElementById('quick-spa-category-name');
            const name = (input?.value || '').trim();
            if (!name) {
                alert('Vui lòng nhập tên phân loại dịch vụ!');
                input?.focus();
                return;
            }
            try {
                const res = await fetch('/api/pet-services/categories', {
                    method: 'POST',
                    headers: {'Content-Type': 'application/json'},
                    body: JSON.stringify({ name })
                });
                if (!res.ok) {
                    const err = await res.json();
                    alert(err.detail || 'Lỗi thêm phân loại');
                    return;
                }
                closeQuickAddSpaCategoryModal();
                await loadSpaCategoriesList();
                
                // Tự động chọn phân loại vừa tạo trong modal thêm giá
                const inputSelect = document.getElementById('pet-pricing-input-cat');
                if (inputSelect) {
                    inputSelect.value = name;
                }
            } catch(e) {
                console.error("saveQuickSpaCategory error:", e);
                alert('Lỗi kết nối khi lưu phân loại!');
            }
        }

        window.openQuickAddSpaCategoryModal = openQuickAddSpaCategoryModal;
        window.closeQuickAddSpaCategoryModal = closeQuickAddSpaCategoryModal;
        window.saveQuickSpaCategory = saveQuickSpaCategory;

        // ==========================================
        // QUẢN LÝ PHÂN LOẠI DỊCH VỤ SPA (SỬA, XÓA, THÊM)
        // ==========================================
        function openSpaCategoryManagerModal() {
            const modal = document.getElementById('modal-spa-category-manager');
            if (modal) modal.classList.remove('hidden');
            const input = document.getElementById('new-spa-category-mgr-name');
            if (input) {
                input.value = '';
                setTimeout(() => input.focus(), 50);
            }
            renderSpaCategoryManagerList();
        }

        function closeSpaCategoryManagerModal() {
            const modal = document.getElementById('modal-spa-category-manager');
            if (modal) modal.classList.add('hidden');
            loadPetPricingList();
        }

        async function renderSpaCategoryManagerList() {
            const tbody = document.getElementById('spa-category-mgr-list');
            if (!tbody) return;
            try {
                tbody.innerHTML = '<tr><td colspan="3" class="p-4 text-center text-slate-400">Đang tải danh sách phân loại...</td></tr>';
                const res = await fetch('/api/pet-services/categories');
                if (!res.ok) throw new Error('Không thể tải danh sách phân loại');
                const categories = await res.json();

                if (!categories || categories.length === 0) {
                    tbody.innerHTML = '<tr><td colspan="3" class="p-4 text-center text-slate-400">Chưa có phân loại nào</td></tr>';
                    return;
                }

                tbody.innerHTML = categories.map(c => {
                    const isDefault = (c.name.trim().toLowerCase() === 'dịch vụ lẻ chó');
                    const safeName = (c.name || '').replace(/'/g, "\\'").replace(/"/g, '&quot;');
                    const deleteBtn = isDefault 
                        ? '<span class="text-slate-300 text-xs italic px-2 py-1">Mặc định</span>'
                        : `<button type="button" onclick="deleteSpaCategoryFromManager(${c.id}, '${safeName}', ${c.item_count || 0})" class="px-2 py-1 bg-rose-50 hover:bg-rose-100 text-rose-600 rounded text-xs font-semibold transition" title="Xóa phân loại">Xóa</button>`;
                    
                    return `
                        <tr class="hover:bg-slate-50 transition">
                            <td class="p-2.5 font-medium text-slate-800" id="spa-cat-name-cell-${c.id}">
                                ${c.name}
                            </td>
                            <td class="p-2.5 text-center">
                                <span class="inline-block px-2 py-0.5 bg-slate-100 text-slate-700 rounded-full font-bold text-xs">
                                    ${c.item_count || 0}
                                </span>
                            </td>
                            <td class="p-2.5 text-center">
                                <div class="flex items-center justify-center gap-1.5" id="spa-cat-actions-${c.id}">
                                    <button type="button" onclick="editSpaCategoryInline(${c.id}, '${safeName}')" class="px-2 py-1 bg-amber-50 hover:bg-amber-100 text-amber-700 rounded text-xs font-semibold transition" title="Đổi tên phân loại">Sửa</button>
                                    ${deleteBtn}
                                </div>
                            </td>
                        </tr>
                    `;
                }).join('');
            } catch (e) {
                console.error("renderSpaCategoryManagerList error:", e);
                tbody.innerHTML = `<tr><td colspan="3" class="p-4 text-center text-rose-500">Lỗi: ${e.message}</td></tr>`;
            }
        }

        async function saveSpaCategoryFromManager() {
            const input = document.getElementById('new-spa-category-mgr-name');
            const name = (input?.value || '').trim();
            if (!name) {
                alert('Vui lòng nhập tên phân loại mới!');
                input?.focus();
                return;
            }

            try {
                const res = await fetch('/api/pet-services/categories', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ name })
                });

                if (!res.ok) {
                    const err = await res.json();
                    alert(err.detail || 'Lỗi thêm phân loại mới');
                    return;
                }

                input.value = '';
                await renderSpaCategoryManagerList();
                await loadSpaCategoriesList();
            } catch (e) {
                console.error("saveSpaCategoryFromManager error:", e);
                alert('Lỗi kết nối khi lưu phân loại');
            }
        }

        function editSpaCategoryInline(id, currentName) {
            const cell = document.getElementById(`spa-cat-name-cell-${id}`);
            const actions = document.getElementById(`spa-cat-actions-${id}`);
            if (!cell || !actions) return;

            const safeCurrent = (currentName || '').replace(/"/g, '&quot;');
            cell.innerHTML = `
                <div class="flex items-center gap-1">
                    <input id="edit-spa-cat-input-${id}" type="text" value="${safeCurrent}" class="w-full border border-emerald-500 rounded px-2 py-1 text-xs focus:ring-1 focus:ring-emerald-500 focus:outline-none font-medium" onkeydown="if(event.key === 'Enter') saveEditSpaCategory(${id}, '${currentName.replace(/'/g, "\\'")}')">
                </div>
            `;

            actions.innerHTML = `
                <button type="button" onclick="saveEditSpaCategory(${id}, '${currentName.replace(/'/g, "\\'")}')" class="px-2 py-1 bg-emerald-600 hover:bg-emerald-700 text-white rounded text-xs font-bold transition shadow-sm">Lưu</button>
                <button type="button" onclick="renderSpaCategoryManagerList()" class="px-2 py-1 bg-slate-200 hover:bg-slate-300 text-slate-700 rounded text-xs font-semibold transition">Hủy</button>
            `;

            const input = document.getElementById(`edit-spa-cat-input-${id}`);
            if (input) {
                input.focus();
                input.select();
            }
        }

        async function saveEditSpaCategory(id, oldName) {
            const input = document.getElementById(`edit-spa-cat-input-${id}`);
            const newName = (input?.value || '').trim();

            if (!newName) {
                alert('Tên phân loại không được để trống!');
                input?.focus();
                return;
            }

            if (newName === oldName) {
                renderSpaCategoryManagerList();
                return;
            }

            try {
                const res = await fetch(`/api/pet-services/categories/${id}`, {
                    method: 'PUT',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ name: newName })
                });

                if (!res.ok) {
                    const err = await res.json();
                    alert(err.detail || 'Lỗi cập nhật phân loại');
                    return;
                }

                await renderSpaCategoryManagerList();
                await loadPetPricingList();
            } catch (e) {
                console.error("saveEditSpaCategory error:", e);
                alert('Lỗi kết nối khi cập nhật phân loại');
            }
        }

        async function deleteSpaCategoryFromManager(id, name, count) {
            let msg = `Bạn có chắc muốn xóa phân loại "${name}"?`;
            if (count > 0) {
                msg = `Phân loại "${name}" đang được áp dụng cho ${count} mức giá dịch vụ.\n\nNếu xóa, toàn bộ ${count} mức giá này sẽ được tự động chuyển về phân loại mặc định "Dịch Vụ Lẻ Chó".\n\nBạn có chắc chắn muốn xóa?`;
            }

            if (!confirm(msg)) return;

            try {
                const res = await fetch(`/api/pet-services/categories/${id}`, {
                    method: 'DELETE'
                });

                if (!res.ok) {
                    const err = await res.json();
                    alert(err.detail || 'Lỗi xóa phân loại');
                    return;
                }

                await renderSpaCategoryManagerList();
                await loadPetPricingList();
            } catch (e) {
                console.error("deleteSpaCategoryFromManager error:", e);
                alert('Lỗi kết nối khi xóa phân loại');
            }
        }

        window.openSpaCategoryManagerModal = openSpaCategoryManagerModal;
        window.closeSpaCategoryManagerModal = closeSpaCategoryManagerModal;
        window.saveSpaCategoryFromManager = saveSpaCategoryFromManager;
        window.editSpaCategoryInline = editSpaCategoryInline;
        window.saveEditSpaCategory = saveEditSpaCategory;
        window.deleteSpaCategoryFromManager = deleteSpaCategoryFromManager;

        function populateServicePackageDropdowns() {
            const primarySelect = document.getElementById('svc-primary-package');
            const dyeSelect = document.getElementById('svc-dye-package');
            if (!primarySelect && !dyeSelect) return;

            const curPrimary = primarySelect ? primarySelect.value : '';
            const curDye = dyeSelect ? dyeSelect.value : '';

            // Lấy danh sách duy nhất các dịch vụ theo (category, service_name)
            const serviceMap = {};
            (allPetPricingData || []).forEach(item => {
                const svc = (item.service_name || '').trim();
                const cat = (item.category || '').trim() || 'Dịch Vụ Lẻ Chó';
                if (!svc) return;
                if (!serviceMap[cat]) serviceMap[cat] = new Set();
                serviceMap[cat].add(svc);
            });

            // 1. Đổ vào gói chính (loại trừ các category nhuộm)
            if (primarySelect) {
                let html = '<option value="">-- Chọn gói chính --</option>';
                for (const cat of Object.keys(serviceMap)) {
                    if (cat.toLowerCase().includes('nhuộm')) continue;
                    const svcs = Array.from(serviceMap[cat]).sort();
                    if (svcs.length === 0) continue;
                    html += `<optgroup label="${cat}">`;
                    svcs.forEach(s => {
                        html += `<option value="${s}">${s}</option>`;
                    });
                    html += `</optgroup>`;
                }
                primarySelect.innerHTML = html;
                if (curPrimary) primarySelect.value = curPrimary;
            }

            // Đổ vào gói mẫu chung của nhập hàng loạt (Bulk Apply Bar)
            const bulkPrimarySelect = document.getElementById('batch-bulk-primary-package');
            if (bulkPrimarySelect) {
                const curBulk = bulkPrimarySelect.value;
                let bHtml = '<option value="">-- Chọn gói dịch vụ chung --</option>';
                for (const cat of Object.keys(serviceMap)) {
                    if (cat.toLowerCase().includes('nhuộm')) continue;
                    const svcs = Array.from(serviceMap[cat]).sort();
                    if (svcs.length === 0) continue;
                    bHtml += `<optgroup label="${cat}">`;
                    svcs.forEach(s => {
                        bHtml += `<option value="${s}">${s}</option>`;
                    });
                    bHtml += `</optgroup>`;
                }
                bulkPrimarySelect.innerHTML = bHtml;
                if (curBulk) bulkPrimarySelect.value = curBulk;
            }

            // 2. Đổ vào gói nhuộm (chỉ các category có chứa chữ nhuộm)
            if (dyeSelect) {
                let html = '<option value="">-- Không nhuộm --</option>';
                for (const cat of Object.keys(serviceMap)) {
                    if (!cat.toLowerCase().includes('nhuộm')) continue;
                    const svcs = Array.from(serviceMap[cat]).sort();
                    svcs.forEach(s => {
                        html += `<option value="${s}">${s}</option>`;
                    });
                }
                dyeSelect.innerHTML = html;
                if (curDye) dyeSelect.value = curDye;
            }
        }

        window.populateServicePackageDropdowns = populateServicePackageDropdowns;

        async function loadPetPricingList() {
            const tbody = document.getElementById('table-pet-pricing');
            if (!tbody) return;
            try {
                tbody.innerHTML = '<tr><td colspan="6" class="p-6 text-center text-gray-400">Đang tải bảng giá dịch vụ...</td></tr>';
                const [resPricing, resCats] = await Promise.all([
                    fetch('/api/pet-services/pricing'),
                    fetch('/api/pet-services/categories')
                ]);
                allPetPricingData = await resPricing.json();
                if (resCats.ok) {
                    allSpaCategories = await resCats.json();
                }
                updatePetPricingCategoryUI();
                renderPetPricingTable();
                populateServicePackageDropdowns();
            } catch(e) {
                console.error("loadPetPricingList error:", e);
                tbody.innerHTML = '<tr><td colspan="6" class="p-6 text-center text-rose-500">Lỗi tải bảng giá</td></tr>';
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
                if (cat !== 'all' && (item.category || '').trim() !== cat) return false;
                if (q && !(item.service_name || '').toLowerCase().includes(q)) return false;
                return true;
            });

            if (filtered.length === 0) {
                tbody.innerHTML = '<tr><td colspan="6" class="p-6 text-center text-gray-400">Chưa có mức giá dịch vụ nào</td></tr>';
                return;
            }

            tbody.innerHTML = filtered.map((item, idx) => {
                const catClass = {
                    'Gói Combo Chó': 'bg-purple-100 text-purple-700 border border-purple-200',
                    'Dịch Vụ Lẻ Chó': 'bg-blue-100 text-blue-700 border border-blue-200',
                    'Spa Mèo': 'bg-pink-100 text-pink-700 border border-pink-200',
                    'Nhuộm Lông': 'bg-amber-100 text-amber-700 border border-amber-200',
                    'Trị Liệu & Phụ Thu': 'bg-emerald-100 text-emerald-700 border border-emerald-200'
                }[item.category] || 'bg-slate-100 text-slate-700 border border-slate-200';

                return `
                <tr class="border-b hover:bg-slate-50 transition text-xs">
                    <td class="p-2.5 text-center text-slate-400 font-mono">${idx + 1}</td>
                    <td class="p-2.5">
                        <span class="px-2 py-0.5 rounded text-[11px] font-bold ${catClass}">
                            ${item.category || 'Dịch Vụ'}
                        </span>
                    </td>
                    <td class="p-2.5 font-bold text-slate-800">${item.service_name}</td>
                    <td class="p-2.5 font-medium text-slate-600 text-center">
                        ${formatWeightRange(item.min_weight, item.max_weight)}
                    </td>
                    <td class="p-2.5 text-right font-mono font-bold text-emerald-700">${formatMoney(item.price || 0)}</td>
                    <td class="p-2.5 text-center space-x-1 whitespace-nowrap">
                        <button onclick="openEditPetPricingModal(${item.id})" class="text-sky-600 hover:text-sky-800 px-2 py-1 border rounded text-[11px] font-bold">✏️ Sửa</button>
                        <button onclick="deletePetPricingItem(${item.id})" class="text-rose-600 hover:text-rose-800 px-2 py-1 border rounded text-[11px] font-bold">🗑️</button>
                    </td>
                </tr>
            `}).join('');
        }

        function openAddPetPricingModal() {
            document.getElementById('pet-pricing-modal-title').textContent = 'Thêm Mức Giá Dịch Vụ Theo Cân Nặng';
            document.getElementById('pet-pricing-edit-id').value = '';
            document.getElementById('pet-pricing-input-cat').value = '';
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
            document.getElementById('pet-pricing-input-cat').value = item.category || '';
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
            const category = (document.getElementById('pet-pricing-input-cat').value || '').trim() || 'Dịch Vụ Lẻ Chó';
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
            populateServicePackageDropdowns();

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

            // Reset ô tìm khách hàng (dropdown popup)
            document.getElementById('svc-customer-id').value = '';
            const svcCustSearchEl = document.getElementById('svc-customer-search');
            if (svcCustSearchEl) svcCustSearchEl.value = '';
            const svcCustDropdownEl = document.getElementById('svc-customer-dropdown');
            if (svcCustDropdownEl) svcCustDropdownEl.classList.add('hidden');

            // Reset form & preview
            document.getElementById('svc-preview-phone').textContent = '-';
            document.getElementById('svc-preview-address').textContent = '-';
            if (document.getElementById('svc-preview-points')) document.getElementById('svc-preview-points').textContent = '0';
            if (document.getElementById('svc-preview-wallet')) document.getElementById('svc-preview-wallet').textContent = '0 đ';
            const optWalletInit = document.getElementById('svc-opt-pay-wallet');
            if (optWalletInit) optWalletInit.textContent = '💆 Trừ Ví Spa (Số dư: 0 đ)';
            const redFlagEl = document.getElementById('svc-customer-red-flag');
            if (redFlagEl) redFlagEl.classList.add('hidden');

            // Set default single mode
            setSvcIntakeMode('single');

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

            // Reset phụ thu checkbox & hiển thị tiền
            ['svc-cb-teeth', 'svc-cb-art', 'svc-cb-surch', 'svc-cb-ship', 'svc-cb-tip', 'svc-cb-other'].forEach(id => {
                const el = document.getElementById(id);
                if (el) el.checked = false;
            });
            ['svc-tip-amount', 'svc-other-surch-amount'].forEach(id => {
                const el = document.getElementById(id);
                if (el) el.value = '';
            });
            updateSvcSurchargeTags();

            currentSvcRetailProducts = [];
            renderSvcRetailItems();

            const baseDisp = document.getElementById('svc-base-price-display');
            if (baseDisp) baseDisp.textContent = '0 đ';
            const surchDisp = document.getElementById('svc-surcharges-total-display');
            if (surchDisp) surchDisp.textContent = '0 đ';
            const retailDisp = document.getElementById('svc-retail-price-display');
            if (retailDisp) retailDisp.textContent = '0 đ';
            const totalDisp = document.getElementById('svc-total-price-display');
            if (totalDisp) totalDisp.textContent = '0 đ';
            document.getElementById('svc-total-price').value = '0';

            document.getElementById('svc-customer-request').value = '';
            document.getElementById('svc-accessories').value = '';
            document.getElementById('svc-note').value = '';
            document.querySelector('input[name="svc-payment-timing"][value="unpaid"]').checked = true;
            document.getElementById('svc-payment-method-wrap').classList.add('hidden');
            if (document.getElementById('svc-send-to-hotel')) document.getElementById('svc-send-to-hotel').checked = false;

            // Reset thanh Ví Spa: Ẩn đi khi chưa chọn khách
            const walletBar = document.getElementById('svc-spa-wallet-bar');
            if (walletBar) walletBar.classList.add('hidden');
            const previewWallet = document.getElementById('svc-preview-wallet');
            if (previewWallet) previewWallet.textContent = '0 đ';

            // Preload danh sách hàng hóa POS nếu chưa có
            if ((typeof posProducts === 'undefined' || !Array.isArray(posProducts) || posProducts.length === 0) &&
                (!Array.isArray(allProducts) || allProducts.length === 0)) {
                fetch('/api/products').then(r => r.json()).then(data => {
                    allProducts = data;
                    if (typeof posProducts !== 'undefined' && Array.isArray(posProducts) && posProducts.length === 0) {
                        posProducts = data;
                    }
                }).catch(e => console.error("preload products err:", e));
            }

            // Reset Cột 3: Lịch sử Spa
            const histList = document.getElementById('svc-customer-history-list');
            if (histList) histList.innerHTML = '<div class="text-center py-10 text-slate-400"><span>🔍 Chọn khách hàng để tải lịch sử làm Spa</span></div>';
            const histFilter = document.getElementById('svc-history-pet-filter');
            if (histFilter) histFilter.innerHTML = '<option value="">🐾 Tất cả các bé</option>';

            // Reset Chế độ 2: Bảng nhập hàng loạt & chọn bé
            const tbodyBatch = document.getElementById('tbody-batch-pets');
            if (tbodyBatch) tbodyBatch.innerHTML = '';
            const batchContainer = document.getElementById('batch-pet-checkboxes-container');
            if (batchContainer) batchContainer.innerHTML = '<div class="text-[11px] text-slate-400 italic">Vui lòng chọn khách hàng ở trên để hiển thị danh sách các bé</div>';
            const batchCountBadge = document.getElementById('batch-selected-pet-count');
            if (batchCountBadge) batchCountBadge.textContent = '0 bé';
            calcBatchGrandTotal();

            modal.classList.remove('hidden');
        }

        function closeCreateServiceTicketModal() {
            const modal = document.getElementById('modal-create-service-ticket');
            if (modal) modal.classList.add('hidden');
        }

        // ==========================================
        // TIỆN ÍCH TIỀN TỆ & ĐỊNH DẠNG DẤU PHÂN CÁCH
        // ==========================================
        function formatMoneyString(val) {
            if (!val && val !== 0) return '0';
            const num = Math.round(Number(val) || 0);
            return num.toLocaleString('vi-VN');
        }

        function parseMoneyInput(val) {
            if (!val && val !== 0) return 0;
            const clean = String(val).replace(/[^\d]/g, '');
            return Number(clean) || 0;
        }

        function onMoneyInputChange(inputEl) {
            if (!inputEl) return;
            const raw = parseMoneyInput(inputEl.value);
            inputEl.value = raw > 0 ? raw.toLocaleString('vi-VN') : '';
        }

        window.formatMoneyString = formatMoneyString;
        window.parseMoneyInput = parseMoneyInput;
        window.onMoneyInputChange = onMoneyInputChange;

        // ==========================================
        // CHUYỂN CHẾ ĐỘ 1 BÉ (3 CỘT) VS HÀNG LOẠT
        // ==========================================
        let currentSvcIntakeMode = 'single';

        function setSvcIntakeMode(mode) {
            currentSvcIntakeMode = mode;
            const singleView = document.getElementById('svc-single-pet-view');
            const batchView = document.getElementById('svc-batch-pets-view');
            const btnSingle = document.getElementById('btn-mode-single-pet');
            const btnBatch = document.getElementById('btn-mode-batch-pets');
            const footerSingle = document.getElementById('footer-single-actions');
            const footerBatch = document.getElementById('footer-batch-actions');

            if (mode === 'single') {
                if (singleView) singleView.classList.remove('hidden');
                if (batchView) batchView.classList.add('hidden');
                if (footerSingle) footerSingle.classList.remove('hidden');
                if (footerBatch) footerBatch.classList.add('hidden');
                if (btnSingle) {
                    btnSingle.className = 'px-3 py-1.5 rounded-lg text-xs font-bold transition-all bg-white text-purple-800 shadow-sm border border-purple-200';
                }
                if (btnBatch) {
                    btnBatch.className = 'px-3 py-1.5 rounded-lg text-xs font-bold transition-all text-slate-600 hover:text-purple-700';
                }
            } else {
                if (singleView) singleView.classList.add('hidden');
                if (batchView) batchView.classList.remove('hidden');
                if (footerSingle) footerSingle.classList.add('hidden');
                if (footerBatch) footerBatch.classList.remove('hidden');
                if (btnSingle) {
                    btnSingle.className = 'px-3 py-1.5 rounded-lg text-xs font-bold transition-all text-slate-600 hover:text-purple-700';
                }
                if (btnBatch) {
                    btnBatch.className = 'px-3 py-1.5 rounded-lg text-xs font-bold transition-all bg-white text-purple-800 shadow-sm border border-purple-200';
                }
                // Cập nhật thanh chọn bé và nạp các dòng tương ứng
                renderBatchPetSelector();
            }
        }
        window.setSvcIntakeMode = setSvcIntakeMode;

        // ==========================================
        // DANH SÁCH ĐỎ / CẢNH BÁO KHÁCH HÀNG LƯU Ý
        // ==========================================
        function updateCustomerWarningBanner(cust) {
            const banner = document.getElementById('svc-customer-red-flag');
            const textEl = document.getElementById('svc-customer-warning-text');
            if (!banner || !textEl) return;
            if (cust && (cust.is_flagged || (cust.warning_note && cust.warning_note.trim()))) {
                textEl.textContent = cust.warning_note || 'Khách hàng trong danh sách cần lưu ý đặc biệt!';
                banner.classList.remove('hidden');
            } else {
                banner.classList.add('hidden');
            }
        }

        async function editCurrentCustomerWarning() {
            const custId = parseInt(document.getElementById('svc-customer-id')?.value) || 0;
            if (!custId) { alert('Chưa chọn khách hàng!'); return; }
            const cust = (allContacts || []).find(c => c.id == custId);
            const oldNote = cust ? (cust.warning_note || '') : '';
            const newNote = prompt('Nhập nội dung lưu ý / cảnh báo đặc biệt cho khách hàng này (để trống nếu muốn xóa cờ cảnh báo):', oldNote);
            if (newNote === null) return;

            const isFlagged = newNote.trim().length > 0;
            try {
                const res = await fetch(`/api/contacts/${custId}/warning`, {
                    method: 'PUT',
                    headers: {'Content-Type': 'application/json'},
                    body: JSON.stringify({ is_flagged: isFlagged, warning_note: newNote.trim() })
                });
                if (res.ok) {
                    if (cust) {
                        cust.is_flagged = isFlagged ? 1 : 0;
                        cust.warning_note = newNote.trim();
                    }
                    updateCustomerWarningBanner(cust);
                    alert('✅ Đã cập nhật lưu ý khách hàng thành công!');
                } else {
                    alert('Lỗi cập nhật lưu ý khách hàng');
                }
            } catch(e) {
                alert('Lỗi kết nối máy chủ');
            }
        }
        window.editCurrentCustomerWarning = editCurrentCustomerWarning;

        // ==========================================
        // LỊCH SỬ SPA KHÁCH HÀNG (CỘT 3 LUÔN MỞ)
        // ==========================================
        let currentCustomerSpaHistoryList = [];

        async function loadCustomerSpaHistory(custId, petId = null) {
            const listEl = document.getElementById('svc-customer-history-list');
            const filterEl = document.getElementById('svc-history-pet-filter');
            if (!listEl) return;

            if (!custId) {
                listEl.innerHTML = '<div class="text-center py-10 text-slate-400"><span>🔍 Chọn khách hàng để tải lịch sử làm Spa</span></div>';
                if (filterEl) filterEl.innerHTML = '<option value="">🐾 Tất cả các bé</option>';
                return;
            }

            listEl.innerHTML = '<div class="text-center py-8 text-slate-400">Đang tải lịch sử Spa...</div>';

            if (filterEl && (!petId || filterEl.children.length <= 1)) {
                let filterHtml = '<option value="">🐾 Tất cả các bé</option>';
                if (Array.isArray(currentSvcPetsList)) {
                    currentSvcPetsList.forEach(p => {
                        filterHtml += `<option value="${p.id}" ${petId == p.id ? 'selected' : ''}>🐾 ${p.name}</option>`;
                    });
                }
                filterEl.innerHTML = filterHtml;
            }

            try {
                let url = `/api/pet-services/history/customer/${custId}`;
                if (petId) url += `?pet_id=${petId}`;
                const res = await fetch(url);
                if (!res.ok) {
                    listEl.innerHTML = '<div class="text-center py-8 text-rose-500">Lỗi tải lịch sử</div>';
                    return;
                }
                currentCustomerSpaHistoryList = await res.json();
                renderCustomerSpaHistory(currentCustomerSpaHistoryList);
            } catch(e) {
                listEl.innerHTML = '<div class="text-center py-8 text-rose-500">Lỗi kết nối máy chủ</div>';
            }
        }

        function filterCustomerSpaHistory(petIdVal) {
            const custId = parseInt(document.getElementById('svc-customer-id')?.value) || 0;
            if (!custId) return;
            const petId = petIdVal ? parseInt(petIdVal) : null;
            loadCustomerSpaHistory(custId, petId);
        }
        window.filterCustomerSpaHistory = filterCustomerSpaHistory;

        function renderCustomerSpaHistory(histories) {
            const listEl = document.getElementById('svc-customer-history-list');
            if (!listEl) return;
            if (!Array.isArray(histories) || histories.length === 0) {
                listEl.innerHTML = '<div class="text-center py-8 text-slate-400">Chưa có lịch sử làm đẹp nào trước đây</div>';
                return;
            }

            listEl.innerHTML = histories.map(h => {
                const petTitle = h.pet_name ? `🐾 ${h.pet_name}` : 'Bé chưa đặt tên';
                const weightStr = h.weight_at_service ? `${h.weight_at_service} kg` : (h.pet_weight ? `${h.pet_weight} kg` : '');
                const priceStr = formatMoneyString(h.price) + ' đ';
                const dateStr = h.ticket_date || (h.created_at ? h.created_at.substring(0, 10) : '');
                const staffStr = [h.staff_cutter, h.staff_worker_1].filter(Boolean).join(', ') || 'Chưa ghi thợ';
                const reqStr = h.customer_request || h.note || '';

                const extraTeethStr = h.teeth_cleaning ? `${formatMoneyString(h.teeth_cleaning)} đ` : '0 đ';
                const extraArtStr = h.art_cutting_fee ? `${formatMoneyString(h.art_cutting_fee)} đ` : '0 đ';
                const extraSurchStr = h.surcharge ? `${formatMoneyString(h.surcharge)} đ` : '0 đ';
                const extraShipStr = h.shipping_fee ? `${formatMoneyString(h.shipping_fee)} đ` : '0 đ';
                const extraTipStr = h.tip_amount ? `${formatMoneyString(h.tip_amount)} đ` : '0 đ';

                return `
                    <div class="bg-white p-2.5 rounded-lg border border-slate-200 hover:border-purple-300 shadow-sm transition-all space-y-1">
                        <div class="cursor-pointer select-none" onclick="toggleCustomerSpaHistoryDetail(${h.id})">
                            <div class="flex justify-between items-start">
                                <span class="font-bold text-slate-800 text-xs flex items-center gap-1">
                                    <span id="spa-hist-arrow-${h.id}" class="text-[10px] text-purple-600 font-mono transition-transform inline-block">▶</span>
                                    <span>${petTitle}</span>
                                    <span class="text-slate-400 font-normal">(${weightStr})</span>
                                </span>
                                <span class="font-bold text-purple-700 font-mono text-xs">${priceStr}</span>
                            </div>
                            <div class="text-[11px] text-slate-700 font-medium pl-3.5">${h.service_type || 'Spa & Làm đẹp'}</div>
                            <div class="flex justify-between items-center text-[10px] text-slate-400 pl-3.5 pt-0.5">
                                <span>📅 ${dateStr} · ✂️ ${staffStr}</span>
                                <span class="px-1.5 py-0.2 rounded font-semibold ${h.status === 'completed' ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'}">${h.status}</span>
                            </div>
                        </div>

                        <!-- CHI TIẾT LỊCH SỬ KHI CLICK (EXPANDABLE) -->
                        <div id="spa-hist-detail-${h.id}" class="hidden mt-2 pt-2 border-t border-purple-100 bg-purple-50/50 p-2 rounded text-[11px] text-slate-700 space-y-1.5">
                            <div class="flex justify-between items-center font-bold text-purple-900 border-b border-purple-200/60 pb-1">
                                <span>Số phiếu: #${h.ticket_number || h.id} (${h.code || '-'})</span>
                                <span class="text-[10px] px-1.5 py-0.5 rounded bg-purple-200/70 text-purple-800">${h.batch_code || 'Phiếu đơn'}</span>
                            </div>

                            <div class="grid grid-cols-2 gap-1 text-[10px]">
                                <div><strong>Cân nặng:</strong> ${weightStr || '-'}</div>
                                <div><strong>Cạo bàn:</strong> ${h.shaving_feet || 'Không'}</div>
                                <div><strong>Giống/Màu:</strong> ${(h.pet_breed || '') + ' ' + (h.pet_color || '')}</div>
                                <div><strong>Gói nhuộm:</strong> ${h.dye_package || 'Không'}</div>
                            </div>

                            <div class="bg-white p-1.5 rounded border border-purple-200 text-[10px] space-y-0.5">
                                <div class="font-bold text-slate-800">Chi tiết phụ thu:</div>
                                <div class="grid grid-cols-2 gap-x-2 gap-y-0.5 text-slate-600">
                                    <span>🦷 Đánh răng: <b>${extraTeethStr}</b></span>
                                    <span>✂️ Cắt NT: <b>${extraArtStr}</b></span>
                                    <span>🌀 Gỡ rối: <b>${extraSurchStr}</b></span>
                                    <span>🚚 Đưa đón: <b>${extraShipStr}</b></span>
                                    <span class="col-span-2">🎁 Tip thợ: <b>${extraTipStr}</b></span>
                                </div>
                            </div>

                            <div class="text-[10px] text-slate-600 space-y-0.5">
                                <div><strong>Thợ:</strong> Cắt: ${h.staff_cutter || '-'} | Tắm: ${h.staff_worker_1 || '-'} | Nhận: ${h.staff_receiver || '-'}</div>
                                <div><strong>Giờ nhận/về:</strong> ${h.received_time || '-'} ➔ ${h.checkout_time || '-'}</div>
                                ${h.customer_request ? `<div class="italic text-purple-700">📝 Yêu cầu: ${h.customer_request}</div>` : ''}
                                ${h.accessories ? `<div class="italic text-slate-500">🎒 Phụ kiện: ${h.accessories}</div>` : ''}
                                ${h.note ? `<div class="italic text-slate-500">⚠️ Lưu ý: ${h.note}</div>` : ''}
                            </div>
                        </div>
                    </div>
                `;
            }).join('');
        }

        function toggleCustomerSpaHistoryDetail(hId) {
            const detailEl = document.getElementById(`spa-hist-detail-${hId}`);
            const arrowEl = document.getElementById(`spa-hist-arrow-${hId}`);
            if (!detailEl) return;
            const isHidden = detailEl.classList.contains('hidden');
            detailEl.classList.toggle('hidden', !isHidden);
            if (arrowEl) {
                arrowEl.textContent = isHidden ? '▼' : '▶';
            }
        }
        window.toggleCustomerSpaHistoryDetail = toggleCustomerSpaHistoryDetail;

        function reuseCustomerSpaHistory(hId) {
            const h = (currentCustomerSpaHistoryList || []).find(item => item.id === hId);
            if (!h) return;
            if (h.pet_id) {
                const petEl = document.getElementById('svc-pet-id');
                if (petEl) {
                    petEl.value = h.pet_id;
                    onServicePetSelected(h.pet_id);
                }
            }
            if (h.service_type) {
                const primaryEl = document.getElementById('svc-primary-package');
                if (primaryEl) primaryEl.value = h.service_type;
            }
            if (h.dye_package) {
                const dyeEl = document.getElementById('svc-dye-package');
                if (dyeEl) dyeEl.value = h.dye_package;
            }
            if (h.customer_request) {
                const reqEl = document.getElementById('svc-customer-request');
                if (reqEl) reqEl.value = h.customer_request;
            }
            if (h.accessories) {
                const accEl = document.getElementById('svc-accessories');
                if (accEl) accEl.value = h.accessories;
            }
            autoCalculateServicePrice();
            alert(`✅ Đã áp dụng lại dịch vụ và yêu cầu từ phiếu #${h.ticket_number || h.code}!`);
        }
        window.reuseCustomerSpaHistory = reuseCustomerSpaHistory;

        // ==========================================
        // BÁN HÀNG BÁN LẺ KÈM THEO TRONG TIẾP NHẬN SPA
        // ==========================================
        let currentSvcRetailProducts = [];

        async function onSvcRetailSearchInput(val) {
            const dropdown = document.getElementById('svc-retail-dropdown');
            if (!dropdown) return;
            const q = (val || '').trim();
            if (!q) {
                dropdown.classList.add('hidden');
                return;
            }

            let sourceProducts = (typeof posProducts !== 'undefined' && Array.isArray(posProducts) && posProducts.length > 0)
                ? posProducts
                : (typeof allProducts !== 'undefined' && Array.isArray(allProducts) && allProducts.length > 0 ? allProducts : []);

            if (sourceProducts.length === 0) {
                try {
                    const res = await fetch('/api/products');
                    sourceProducts = await res.json();
                    allProducts = sourceProducts;
                    if (typeof posProducts !== 'undefined') posProducts = sourceProducts;
                } catch(e) {
                    console.error("fetch products err:", e);
                }
            }

            const matches = sourceProducts.filter(p => {
                if (p.type === 'material') return false;
                const text = `${p.name || ''} ${p.code || ''} ${p.barcode || ''} ${p.sku || ''}`;
                return (typeof fuzzyMatch === 'function') ? fuzzyMatch(q, text) : text.toLowerCase().includes(q.toLowerCase());
            }).slice(0, 15);

            if (matches.length === 0) {
                dropdown.innerHTML = '<div class="p-3 text-center text-xs text-slate-400 italic">Không tìm thấy hàng hóa phù hợp</div>';
                dropdown.classList.remove('hidden');
                return;
            }

            dropdown.innerHTML = matches.map(p => {
                const typeLabel = p.type === 'combo' ? '<span class="text-[10px] font-bold text-amber-600 mr-1">COMBO</span>' : '';
                const sellPrice = p.sell_price ?? p.price ?? 0;
                const stockStr = p.type === 'service' ? '∞' : (p.stock || 0);
                return `
                <div onmousedown="addSvcRetailProduct(${p.id})" class="p-2 hover:bg-sky-50 cursor-pointer border-b border-slate-100 last:border-0 flex justify-between items-center transition text-xs">
                    <div>
                        <span class="font-mono text-[11px] text-slate-400 font-bold mr-1.5">[${p.code || '-'}]</span>
                        ${typeLabel}
                        <span class="font-bold text-slate-800">${p.name}</span>
                        <span class="text-slate-400 text-[11px] ml-1">(${p.unit || 'cái'})</span>
                    </div>
                    <div class="text-right shrink-0 ml-2">
                        <div class="font-bold text-sky-600 font-mono">${formatMoneyString(sellPrice)} đ</div>
                        <div class="text-[10px] text-slate-400">Tồn: ${stockStr}</div>
                    </div>
                </div>
                `;
            }).join('');
            dropdown.classList.remove('hidden');
        }
        window.onSvcRetailSearchInput = onSvcRetailSearchInput;

        function addSvcRetailProduct(prodId) {
            let sourceProducts = (typeof posProducts !== 'undefined' && Array.isArray(posProducts) && posProducts.length > 0)
                ? posProducts
                : (typeof allProducts !== 'undefined' && Array.isArray(allProducts) && allProducts.length > 0 ? allProducts : []);
            const prod = sourceProducts.find(p => p.id === prodId);
            if (!prod) return;
            const existing = currentSvcRetailProducts.find(item => item.id === prodId);
            const itemPrice = prod.sell_price ?? prod.price ?? 0;
            if (existing) {
                existing.quantity += 1;
            } else {
                currentSvcRetailProducts.push({
                    id: prod.id,
                    name: prod.name,
                    code: prod.code || '',
                    price: itemPrice,
                    quantity: 1,
                    unit: prod.unit || 'cái'
                });
            }
            const searchInput = document.getElementById('svc-retail-search');
            if (searchInput) searchInput.value = '';
            const dropdown = document.getElementById('svc-retail-dropdown');
            if (dropdown) dropdown.classList.add('hidden');
            renderSvcRetailItems();
            autoCalculateServicePrice();
        }
        window.addSvcRetailProduct = addSvcRetailProduct;

        function removeSvcRetailProduct(idx) {
            currentSvcRetailProducts.splice(idx, 1);
            renderSvcRetailItems();
            autoCalculateServicePrice();
        }
        window.removeSvcRetailProduct = removeSvcRetailProduct;

        function changeSvcRetailQty(idx, delta) {
            if (currentSvcRetailProducts[idx]) {
                currentSvcRetailProducts[idx].quantity = Math.max(1, (currentSvcRetailProducts[idx].quantity || 1) + delta);
                renderSvcRetailItems();
                autoCalculateServicePrice();
            }
        }
        window.changeSvcRetailQty = changeSvcRetailQty;

        function renderSvcRetailItems() {
            const listEl = document.getElementById('svc-retail-items-list');
            const badgeEl = document.getElementById('svc-retail-total-badge');
            const selectedBox = document.getElementById('svc-retail-selected-box');
            const priceRow = document.getElementById('svc-retail-price-row');
            const countBadge = document.getElementById('svc-retail-count-badge');

            if (!listEl) return;
            if (currentSvcRetailProducts.length === 0) {
                listEl.innerHTML = '<div class="text-[10px] text-slate-400 italic text-center py-1">Chưa chọn sản phẩm kèm theo</div>';
                if (badgeEl) badgeEl.textContent = '0 đ';
                if (selectedBox) selectedBox.classList.add('hidden');
                if (priceRow) priceRow.classList.add('hidden');
                if (countBadge) countBadge.textContent = '0 món';
                autoCalculateServicePrice();
                return;
            }

            if (selectedBox) selectedBox.classList.remove('hidden');
            if (priceRow) priceRow.classList.remove('hidden');
            if (countBadge) countBadge.textContent = `${currentSvcRetailProducts.length} món`;

            let total = 0;
            listEl.innerHTML = currentSvcRetailProducts.map((item, idx) => {
                const itemTotal = (item.price || 0) * (item.quantity || 1);
                total += itemTotal;
                return `
                    <div class="flex items-center justify-between bg-white px-2 py-1 rounded border border-sky-200 text-xs">
                        <div class="flex-1 truncate mr-2">
                            <span class="font-bold text-slate-800 text-[11px]">${item.name}</span>
                            <span class="text-[10px] text-slate-400 block">${formatMoneyString(item.price)} đ</span>
                        </div>
                        <div class="flex items-center gap-1.5">
                            <button type="button" onclick="changeSvcRetailQty(${idx}, -1)" class="w-5 h-5 rounded bg-slate-100 hover:bg-slate-200 flex items-center justify-center font-bold text-slate-600 text-xs">-</button>
                            <span class="font-mono font-bold text-xs w-5 text-center">${item.quantity}</span>
                            <button type="button" onclick="changeSvcRetailQty(${idx}, 1)" class="w-5 h-5 rounded bg-slate-100 hover:bg-slate-200 flex items-center justify-center font-bold text-slate-600 text-xs">+</button>
                            <span class="font-mono font-bold text-sky-700 text-xs w-16 text-right">${formatMoneyString(itemTotal)} đ</span>
                            <button type="button" onclick="removeSvcRetailProduct(${idx})" class="text-rose-500 hover:text-rose-700 font-bold ml-1 text-sm">×</button>
                        </div>
                    </div>
                `;
            }).join('');
            if (badgeEl) badgeEl.textContent = formatMoneyString(total) + ' đ';
            autoCalculateServicePrice();
        }
        window.renderSvcRetailItems = renderSvcRetailItems;

        function getSvcSurchargePrice(key) {
            let defaultPrice = 30000;
            let searchName = '';
            if (key === 'teeth') {
                searchName = 'đánh răng';
                defaultPrice = 30000;
            } else if (key === 'art') {
                searchName = 'tạo kiểu';
                defaultPrice = 50000;
            } else if (key === 'surch') {
                searchName = 'gỡ rối';
                defaultPrice = 40000;
            } else if (key === 'ship') {
                searchName = 'đưa đón';
                defaultPrice = 50000;
            }
            if (Array.isArray(allPetPricingData) && searchName) {
                const item = allPetPricingData.find(x => 
                    (x.category === 'Trị Liệu & Phụ Thu' || x.category === 'Dịch Vụ Lẻ' || x.category === 'Bảng Giá Dịch Vụ') &&
                    x.service_name && x.service_name.toLowerCase().includes(searchName)
                );
                if (item && item.price > 0) return item.price;
            }
            return defaultPrice;
        }

        function updateSvcSurchargeTags() {
            const teethP = getSvcSurchargePrice('teeth');
            const artP = getSvcSurchargePrice('art');
            const surchP = getSvcSurchargePrice('surch');
            const shipP = getSvcSurchargePrice('ship');

            const tEl = document.getElementById('svc-cb-teeth-price-tag');
            if (tEl) tEl.textContent = formatMoneyString(teethP) + ' đ';
            const aEl = document.getElementById('svc-cb-art-price-tag');
            if (aEl) aEl.textContent = formatMoneyString(artP) + ' đ';
            const sEl = document.getElementById('svc-cb-surch-price-tag');
            if (sEl) sEl.textContent = formatMoneyString(surchP) + ' đ';
            const shEl = document.getElementById('svc-cb-ship-price-tag');
            if (shEl) shEl.textContent = formatMoneyString(shipP) + ' đ';
        }
        window.updateSvcSurchargeTags = updateSvcSurchargeTags;

        function onSvcSurchargeCheckboxChanged() {
            autoCalculateServicePrice();
        }
        window.onSvcSurchargeCheckboxChanged = onSvcSurchargeCheckboxChanged;


        async function onSvcCustomerChanged(custId) {
            const petSel = document.getElementById('svc-pet-id');
            const previewPhone = document.getElementById('svc-preview-phone');
            const previewAddr = document.getElementById('svc-preview-address');
            const previewPoints = document.getElementById('svc-preview-points');
            const previewWallet = document.getElementById('svc-preview-wallet');

            if (!custId) {
                if (petSel) petSel.innerHTML = '<option value="">-- Chọn khách trước --</option>';
                if (previewPhone) previewPhone.textContent = '-';
                if (previewAddr) previewAddr.textContent = '-';
                if (previewPoints) previewPoints.textContent = '0';
                if (previewWallet) previewWallet.textContent = '0 đ';
                const walletBar = document.getElementById('svc-spa-wallet-bar');
                if (walletBar) walletBar.classList.add('hidden');
                const optWallet = document.getElementById('svc-opt-pay-wallet');
                if (optWallet) optWallet.textContent = '💆 Trừ Ví Spa (Số dư: 0 đ)';
                const batchOptWallet = document.getElementById('batch-opt-pay-wallet');
                if (batchOptWallet) batchOptWallet.textContent = '💆 Trừ Ví Spa (Số dư: 0 đ)';
                currentSvcPetsList = [];
                updateCustomerWarningBanner(null);
                loadCustomerSpaHistory(null);
                return;
            }

            const cust = (allContacts || []).find(c => c.id == custId);
            if (cust) {
                if (previewPhone) previewPhone.textContent = cust.phone || 'Chưa có';
                if (previewAddr) previewAddr.textContent = cust.address || 'Chưa có';
                if (previewPoints) previewPoints.textContent = (cust.points || 0).toLocaleString('vi-VN');
                const balStr = formatMoneyString(cust.spa_wallet_balance || 0) + ' đ';
                if (previewWallet) previewWallet.textContent = balStr;
                const walletBar = document.getElementById('svc-spa-wallet-bar');
                if (walletBar) walletBar.classList.remove('hidden');
                const optWallet = document.getElementById('svc-opt-pay-wallet');
                if (optWallet) optWallet.textContent = `💆 Trừ Ví Spa (Số dư: ${balStr})`;
                const batchOptWallet = document.getElementById('batch-opt-pay-wallet');
                if (batchOptWallet) batchOptWallet.textContent = `💆 Trừ Ví Spa (Số dư: ${balStr})`;
                updateCustomerWarningBanner(cust);
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

                // Tự động tải lịch sử spa của khách hàng
                loadCustomerSpaHistory(custId);

                // Cập nhật thanh chọn bé và nạp bảng đợt tiếp nhận hàng loạt
                renderBatchPetSelector();
            } catch(e) {
                petSel.innerHTML = '<option value="">-- Lỗi tải thú cưng --</option>';
                currentSvcPetsList = [];
                renderBatchPetSelector();
            }
        }

        // Dropdown popup tìm khách hàng theo tên + SĐT, khớp không cần liên tục
        function onSvcCustomerSearchInput(rawQuery) {
            const dropdown = document.getElementById('svc-customer-dropdown');
            if (!dropdown) return;
            const custs = (allContacts || []).filter(c => c.type === 'customer');
            const tokens = (rawQuery || '').toLowerCase().trim().split(/\s+/).filter(Boolean);

            const norm = s => (s || '').toString().toLowerCase();
            const matched = tokens.length === 0 ? custs : custs.filter(c => {
                const haystack = norm(c.name) + ' ' + norm(c.phone);
                return tokens.every(tok => haystack.includes(tok));
            });

            if (matched.length === 0) {
                dropdown.innerHTML = '<div class="px-3 py-2 text-xs text-slate-400">Không tìm thấy khách phù hợp</div>';
            } else {
                dropdown.innerHTML = matched.slice(0, 30).map(c => `
                    <div class="px-3 py-2 text-xs hover:bg-purple-50 cursor-pointer border-b border-slate-50 last:border-0 flex justify-between items-center"
                        onmousedown="selectSvcCustomer(${c.id})">
                        <div>
                            <div class="font-semibold text-slate-700 flex items-center gap-1.5">
                                <span>${c.name}</span>
                                ${c.is_flagged ? '<span class="text-[10px] bg-rose-600 text-white font-bold px-1.5 py-0.2 rounded-full">Lưu ý</span>' : ''}
                            </div>
                            <div class="text-slate-400">${c.phone || 'Chưa có SĐT'}</div>
                        </div>
                        <div class="text-right text-[11px] text-slate-500 font-mono">
                            ${c.pets_count ? `🐾 ${c.pets_count} bé` : ''}
                        </div>
                    </div>
                `).join('');
            }
            dropdown.classList.remove('hidden');
        }

        function selectSvcCustomer(custId) {
            const cust = (allContacts || []).find(c => c.id == custId);
            document.getElementById('svc-customer-id').value = custId;
            const searchEl = document.getElementById('svc-customer-search');
            if (searchEl) searchEl.value = cust ? `${cust.name} - ${cust.phone || 'Chưa có SĐT'}` : '';
            const dropdown = document.getElementById('svc-customer-dropdown');
            if (dropdown) dropdown.classList.add('hidden');
            onSvcCustomerChanged(custId);
        }

        function onSvcPetChanged(petId) {
            const filterEl = document.getElementById('svc-history-pet-filter');
            if (filterEl && petId && petId !== '__new__') {
                filterEl.value = petId;
                filterCustomerSpaHistory(petId);
            } else if (filterEl && (!petId || petId === '__new__')) {
                filterEl.value = '';
                filterCustomerSpaHistory('');
            }

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

        var _lastSvcCalculation = null;

        async function autoCalculateServicePrice() {
            const weight = parseWeightFloat(document.getElementById('svc-pet-weight')?.value);
            const primaryPkg = document.getElementById('svc-primary-package')?.value || '';
            const dyePkg = document.getElementById('svc-dye-package')?.value || '';
            const custId = parseInt(document.getElementById('svc-customer-id')?.value) || null;

            let totalBase = 0;
            _lastSvcCalculation = null;

            // Tìm giá gói chính (Best Offer qua API nếu có thể)
            if (primaryPkg) {
                try {
                    const res = await fetch('/api/pricing/calculate-spa', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                            customer_id: custId,
                            service_name: primaryPkg,
                            weight: weight
                        })
                    });
                    if (res.ok) {
                        const data = await res.json();
                        totalBase += (data.final_price || 0);
                        _lastSvcCalculation = {
                            primaryPkg: primaryPkg,
                            base_price: data.base_price || 0,
                            final_price: data.final_price || 0,
                            discount_applied: data.discount_applied || 0
                        };
                    } else {
                        // Fallback client-side
                        if (Array.isArray(allPetPricingData)) {
                            const match = allPetPricingData.find(item => 
                                item.service_name.trim().toLowerCase() === primaryPkg.trim().toLowerCase() &&
                                (item.min_weight === 0 ? weight >= item.min_weight : weight > item.min_weight) &&
                                weight <= item.max_weight
                            ) || allPetPricingData.find(item => 
                                item.service_name.trim().toLowerCase() === primaryPkg.trim().toLowerCase() &&
                                weight >= item.min_weight && weight <= item.max_weight
                            );
                            if (match) {
                                totalBase += (match.price || 0);
                                _lastSvcCalculation = {
                                    primaryPkg: primaryPkg,
                                    base_price: match.price || 0,
                                    final_price: match.price || 0,
                                    discount_applied: 0
                                };
                            }
                        }
                    }
                } catch (e) {
                    console.error('Lỗi tính giá Spa Best Offer:', e);
                }
            }

            // Tìm giá gói nhuộm theo cân nặng
            if (dyePkg && Array.isArray(allPetPricingData)) {
                const matchDye = allPetPricingData.find(item => 
                    item.service_name.trim().toLowerCase() === dyePkg.trim().toLowerCase()
                );
                if (matchDye) {
                    totalBase += (matchDye.price || 0);
                }
            }

            // Tính tổng các khoản phụ thu từ Cột 2 (Checkbox có giá cấu hình)
            let extraTeeth = 0;
            if (document.getElementById('svc-cb-teeth')?.checked) {
                extraTeeth = getSvcSurchargePrice('teeth');
            }
            let extraArt = 0;
            if (document.getElementById('svc-cb-art')?.checked) {
                extraArt = getSvcSurchargePrice('art');
            }
            let extraSurch = 0;
            if (document.getElementById('svc-cb-surch')?.checked) {
                extraSurch = getSvcSurchargePrice('surch');
            }
            let extraShip = 0;
            if (document.getElementById('svc-cb-ship')?.checked) {
                extraShip = getSvcSurchargePrice('ship');
            }
            let extraTip = 0;
            if (document.getElementById('svc-cb-tip')?.checked) {
                extraTip = parseMoneyInput(document.getElementById('svc-tip-amount')?.value);
            }
            let extraOther = 0;
            if (document.getElementById('svc-cb-other')?.checked) {
                extraOther = parseMoneyInput(document.getElementById('svc-other-surch-amount')?.value);
            }
            const totalSurcharges = extraTeeth + extraArt + extraSurch + extraShip + extraTip + extraOther;

            // Tính tiền hàng hóa POS bán kèm
            let totalRetail = 0;
            if (Array.isArray(currentSvcRetailProducts)) {
                totalRetail = currentSvcRetailProducts.reduce((acc, it) => acc + ((it.price || 0) * (it.quantity || 1)), 0);
            }

            const grandTotal = totalBase + totalSurcharges + totalRetail;

            const baseDisp = document.getElementById('svc-base-price-display');
            if (baseDisp) baseDisp.textContent = formatMoneyString(totalBase) + ' đ';
            const surchDisp = document.getElementById('svc-surcharges-total-display');
            if (surchDisp) surchDisp.textContent = formatMoneyString(totalSurcharges) + ' đ';
            const retailDisp = document.getElementById('svc-retail-price-display');
            if (retailDisp) retailDisp.textContent = formatMoneyString(totalRetail) + ' đ';
            const totalDisp = document.getElementById('svc-total-price-display');
            if (totalDisp) totalDisp.textContent = formatMoneyString(grandTotal) + ' đ';

            const totalEl = document.getElementById('svc-total-price');
            if (totalEl) totalEl.value = grandTotal;
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
            const note = document.getElementById('svc-note')?.value.trim() || '';

            const paymentStatus = document.querySelector('input[name="svc-payment-timing"]:checked')?.value || 'unpaid';
            const paymentMethod = paymentStatus === 'paid' ? (document.getElementById('svc-payment-method')?.value || 'cash') : null;
            const sendToHotel = document.getElementById('svc-send-to-hotel')?.checked ? 1 : 0;

            const extraTeeth = document.getElementById('svc-cb-teeth')?.checked ? getSvcSurchargePrice('teeth') : 0;
            const extraArt = document.getElementById('svc-cb-art')?.checked ? getSvcSurchargePrice('art') : 0;
            const extraSurch = document.getElementById('svc-cb-surch')?.checked ? getSvcSurchargePrice('surch') : 0;
            const extraShip = document.getElementById('svc-cb-ship')?.checked ? getSvcSurchargePrice('ship') : 0;
            const extraTip = document.getElementById('svc-cb-tip')?.checked ? parseMoneyInput(document.getElementById('svc-tip-amount')?.value) : 0;
            const extraOther = document.getElementById('svc-cb-other')?.checked ? parseMoneyInput(document.getElementById('svc-other-surch-amount')?.value) : 0;

            if (!custId) { alert('Vui lòng chọn hoặc thêm khách hàng!'); return; }
            if (!petName) { alert('Vui lòng nhập tên của bé!'); return; }
            if (weight <= 0) { alert('Vui lòng nhập cân nặng của bé (VD: 3.5 hoặc 3,5)!'); return; }

            if (paymentStatus === 'paid' && paymentMethod === 'wallet') {
                const cust = (allContacts || []).find(c => c.id == custId);
                const bal = (cust && cust.spa_wallet_balance) ? parseFloat(cust.spa_wallet_balance) : 0;
                if (bal < totalPrice) {
                    alert(`Số dư ví Spa không đủ thanh toán! (Số dư: ${formatMoneyString(bal)} đ, Cần thanh toán: ${formatMoneyString(totalPrice)} đ).\nVui lòng nạp thêm ví hoặc chọn phương thức khác.`);
                    return;
                }
            }

            // Tạo danh sách lineItems chuẩn K80 kèm các phụ thu và hàng hóa POS
            const lineItems = [];
            if (primaryPkg) {
                const isMatched = _lastSvcCalculation && _lastSvcCalculation.primaryPkg === primaryPkg;
                const baseP = isMatched ? _lastSvcCalculation.base_price : totalPrice;
                const finalP = isMatched ? _lastSvcCalculation.final_price : totalPrice;
                lineItems.push({
                    name: primaryPkg,
                    quantity: 1,
                    price: finalP,
                    original_price: baseP
                });
            }
            if (dyePkg) {
                let dyePrice = 0;
                if (Array.isArray(allPetPricingData)) {
                    const matchDye = allPetPricingData.find(item => item.service_name.trim().toLowerCase() === dyePkg.trim().toLowerCase());
                    if (matchDye) dyePrice = matchDye.price || 0;
                }
                lineItems.push({
                    name: dyePkg,
                    quantity: 1,
                    price: dyePrice,
                    original_price: dyePrice
                });
            }
            if (extraTeeth > 0) lineItems.push({ name: 'Đánh răng thú cưng', quantity: 1, price: extraTeeth, original_price: extraTeeth });
            if (extraArt > 0) lineItems.push({ name: 'Cắt tạo kiểu nghệ thuật', quantity: 1, price: extraArt, original_price: extraArt });
            if (extraSurch > 0) lineItems.push({ name: 'Phụ thu gỡ rối / dịch vụ thêm', quantity: 1, price: extraSurch, original_price: extraSurch });
            if (extraShip > 0) lineItems.push({ name: 'Cước vận chuyển đưa đón', quantity: 1, price: extraShip, original_price: extraShip });
            if (extraTip > 0) lineItems.push({ name: 'Tiền tip thợ', quantity: 1, price: extraTip, original_price: extraTip });
            if (extraOther > 0) lineItems.push({ name: 'Phụ thu khác', quantity: 1, price: extraOther, original_price: extraOther });

            if (Array.isArray(currentSvcRetailProducts)) {
                for (const rp of currentSvcRetailProducts) {
                    lineItems.push({
                        name: rp.name,
                        quantity: rp.quantity || 1,
                        price: rp.price || 0,
                        original_price: rp.price || 0,
                        is_retail: true
                    });
                }
            }

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
                note: note,
                payment_status: paymentStatus,
                payment_method: paymentMethod,
                services_json: JSON.stringify(lineItems),
                staff_receiver: '',
                staff_worker_1: '',
                staff_worker_2: '',
                staff_cutter: '',
                staff_dyer: '',
                teeth_cleaning: extraTeeth,
                art_cutting_fee: extraArt,
                surcharge: extraSurch + extraOther,
                shipping_fee: extraShip,
                tip_amount: extraTip,
                return_method: '',
                dye_package: dyePkg,
                send_to_hotel: sendToHotel
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
                if (paymentStatus === 'paid' && paymentMethod === 'wallet') {
                    const cust = (allContacts || []).find(c => c.id == custId);
                    if (cust) {
                        cust.spa_wallet_balance = Math.max(0, (cust.spa_wallet_balance || 0) - totalPrice);
                    }
                }
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
        // CHẾ ĐỘ 2: NHẬP HÀNG LOẠT (GOOGLE SHEETS)
        // ==========================================
        function renderBatchPetSelector() {
            const container = document.getElementById('batch-pet-checkboxes-container');
            const countBadge = document.getElementById('batch-selected-pet-count');
            const tbody = document.getElementById('tbody-batch-pets');
            if (!container) return;

            if (!Array.isArray(currentSvcPetsList) || currentSvcPetsList.length === 0) {
                container.innerHTML = '<div class="text-[11px] text-slate-400 italic">Khách hàng chưa có hồ sơ thú cưng (nhấn "+ Thêm bé mới" để nhập)</div>';
                if (countBadge) countBadge.textContent = '0 bé';
                if (tbody && tbody.children.length === 0) {
                    addBatchPetRow();
                }
                return;
            }

            container.innerHTML = currentSvcPetsList.map(p => {
                const wStr = p.weight ? String(p.weight).replace('.', ',') + 'kg' : 'Chưa cân';
                return `
                    <label class="flex items-center gap-1.5 px-2.5 py-1 bg-white border border-purple-200 hover:border-purple-400 rounded-lg cursor-pointer text-xs select-none shadow-xs transition-all">
                        <input type="checkbox" value="${p.id}" checked class="batch-pet-check w-3.5 h-3.5 text-purple-600 rounded" onchange="onBatchPetCheckToggled(${p.id}, this.checked)">
                        <span class="font-bold text-slate-800">🐾 ${p.name}</span>
                        <span class="text-[10px] text-purple-700 font-mono">(${p.breed || p.species || 'Cún'} - ${wStr})</span>
                    </label>
                `;
            }).join('');

            // Tự động đổ tất cả các bé vào bảng nếu tbody đang trống
            if (tbody) {
                tbody.innerHTML = '';
                currentSvcPetsList.forEach(p => addBatchPetRow(p));
            }
            updateBatchSelectedPetCount();
        }
        window.renderBatchPetSelector = renderBatchPetSelector;

        function updateBatchSelectedPetCount() {
            const countBadge = document.getElementById('batch-selected-pet-count');
            if (!countBadge) return;
            const checks = Array.from(document.querySelectorAll('.batch-pet-check'));
            const checkedCount = checks.filter(c => c.checked).length;
            const total = checks.length;
            countBadge.textContent = `${checkedCount} / ${total} bé đã chọn`;
        }
        window.updateBatchSelectedPetCount = updateBatchSelectedPetCount;

        function onBatchPetCheckToggled(petId, isChecked) {
            const tbody = document.getElementById('tbody-batch-pets');
            if (!tbody) return;
            if (isChecked) {
                // Kiểm tra xem bé đã có trong tbody chưa
                const existing = Array.from(tbody.querySelectorAll('.batch-pet-row')).find(tr => tr.dataset.petId == petId);
                if (!existing) {
                    const p = (currentSvcPetsList || []).find(x => x.id == petId);
                    if (p) addBatchPetRow(p);
                }
            } else {
                // Xóa dòng của bé này khỏi tbody
                const tr = Array.from(tbody.querySelectorAll('.batch-pet-row')).find(tr => tr.dataset.petId == petId);
                if (tr) {
                    tr.remove();
                    // Cập nhật lại STT
                    Array.from(tbody.querySelectorAll('.batch-row-stt')).forEach((el, idx) => {
                        el.textContent = idx + 1;
                    });
                    calcBatchGrandTotal();
                }
            }
            updateBatchSelectedPetCount();
        }
        window.onBatchPetCheckToggled = onBatchPetCheckToggled;

        function selectAllBatchPets(checked) {
            const checks = Array.from(document.querySelectorAll('.batch-pet-check'));
            checks.forEach(c => { c.checked = checked; });
            const tbody = document.getElementById('tbody-batch-pets');
            if (!tbody) return;
            tbody.innerHTML = '';
            if (checked && Array.isArray(currentSvcPetsList)) {
                currentSvcPetsList.forEach(p => addBatchPetRow(p));
            } else {
                // Thêm 1 dòng trống để nhập
                addBatchPetRow();
            }
            updateBatchSelectedPetCount();
            calcBatchGrandTotal();
        }
        window.selectAllBatchPets = selectAllBatchPets;

        function toggleAllBatchRowChecks(isChecked) {
            const tbody = document.getElementById('tbody-batch-pets');
            if (!tbody) return;
            const checks = tbody.querySelectorAll('.batch-row-checkbox');
            checks.forEach(c => c.checked = isChecked);
        }
        window.toggleAllBatchRowChecks = toggleAllBatchRowChecks;

        function onBatchRowCheckboxFeeChanged(cb, key) {
            const tr = cb.closest('tr');
            if (!tr) return;
            const standardPrice = getSvcSurchargePrice(key);
            let targetInput = null;
            if (key === 'teeth') targetInput = tr.querySelector('.batch-pet-teeth');
            else if (key === 'art') targetInput = tr.querySelector('.batch-pet-art');
            else if (key === 'surch') targetInput = tr.querySelector('.batch-pet-surcharges');
            else if (key === 'ship') targetInput = tr.querySelector('.batch-pet-ship');

            if (targetInput) {
                targetInput.value = cb.checked ? formatMoneyString(standardPrice) : '';
            }
            calcBatchRowTotal(tr);
        }
        window.onBatchRowCheckboxFeeChanged = onBatchRowCheckboxFeeChanged;

        function applyBulkPackageToBatchPets(onlyChecked = false) {
            const bulkPkg = document.getElementById('batch-bulk-primary-package')?.value || '';
            const bulkShaving = document.getElementById('batch-bulk-shaving')?.value || '';

            const bulkCbTeeth = document.getElementById('batch-bulk-cb-teeth')?.checked || false;
            const bulkCbArt = document.getElementById('batch-bulk-cb-art')?.checked || false;
            const bulkCbSurch = document.getElementById('batch-bulk-cb-surch')?.checked || false;
            const bulkCbShip = document.getElementById('batch-bulk-cb-ship')?.checked || false;

            if (!bulkPkg && !bulkShaving && !bulkCbTeeth && !bulkCbArt && !bulkCbSurch && !bulkCbShip) {
                alert('Vui lòng chọn gói dịch vụ chung, kiểu cạo bàn hoặc tích phụ thu mẫu!');
                return;
            }

            const tbody = document.getElementById('tbody-batch-pets');
            if (!tbody) return;
            let rows = Array.from(tbody.querySelectorAll('.batch-pet-row'));
            if (rows.length === 0) {
                alert('Chưa có thú cưng nào trong bảng để áp dụng!');
                return;
            }

            if (onlyChecked) {
                rows = rows.filter(tr => tr.querySelector('.batch-row-checkbox')?.checked);
                if (rows.length === 0) {
                    alert('Vui lòng tích chọn ít nhất 1 dòng bé để áp dụng!');
                    return;
                }
            }

            let appliedCount = 0;
            rows.forEach(tr => {
                if (bulkPkg) {
                    const pSel = tr.querySelector('.batch-pet-primary');
                    if (pSel) pSel.value = bulkPkg;
                }
                if (bulkShaving) {
                    const sSel = tr.querySelector('.batch-pet-shaving');
                    if (sSel) sSel.value = bulkShaving;
                }

                if (bulkCbTeeth) {
                    const cb = tr.querySelector('.batch-cb-teeth');
                    const inp = tr.querySelector('.batch-pet-teeth');
                    if (cb) cb.checked = true;
                    if (inp) inp.value = formatMoneyString(getSvcSurchargePrice('teeth'));
                }
                if (bulkCbArt) {
                    const cb = tr.querySelector('.batch-cb-art');
                    const inp = tr.querySelector('.batch-pet-art');
                    if (cb) cb.checked = true;
                    if (inp) inp.value = formatMoneyString(getSvcSurchargePrice('art'));
                }
                if (bulkCbSurch) {
                    const cb = tr.querySelector('.batch-cb-surch');
                    const inp = tr.querySelector('.batch-pet-surcharges');
                    if (cb) cb.checked = true;
                    if (inp) inp.value = formatMoneyString(getSvcSurchargePrice('surch'));
                }
                if (bulkCbShip) {
                    const cb = tr.querySelector('.batch-cb-ship');
                    const inp = tr.querySelector('.batch-pet-ship');
                    if (cb) cb.checked = true;
                    if (inp) inp.value = formatMoneyString(getSvcSurchargePrice('ship'));
                }

                calcBatchRowTotal(tr);
                appliedCount++;
            });

            calcBatchGrandTotal();
        }
        window.applyBulkPackageToBatchPets = applyBulkPackageToBatchPets;
        window.applyBulkPackageToAllBatchPets = () => applyBulkPackageToBatchPets(false);

        function addBatchPetRow(petData = null) {
            const tbody = document.getElementById('tbody-batch-pets');
            if (!tbody) return;
            const rowIdx = tbody.children.length + 1;
            const tr = document.createElement('tr');
            tr.className = 'hover:bg-slate-50 border-b border-slate-100 batch-pet-row';
            if (petData && petData.id) {
                tr.dataset.petId = petData.id;
            }

            let petOpts = '<option value="__new__">➕ Bé mới...</option>';
            if (Array.isArray(currentSvcPetsList)) {
                currentSvcPetsList.forEach(p => {
                    const isSel = petData && petData.id == p.id;
                    petOpts += `<option value="${p.id}" ${isSel ? 'selected' : ''}>🐾 ${p.name} (${p.weight ? p.weight + 'kg' : ''})</option>`;
                });
            }

            const serviceMap = {};
            (allPetPricingData || []).forEach(item => {
                const svc = (item.service_name || '').trim();
                const cat = (item.category || '').trim() || 'Dịch Vụ Lẻ Chó';
                if (!svc) return;
                if (!serviceMap[cat]) serviceMap[cat] = new Set();
                serviceMap[cat].add(svc);
            });

            let primaryOpts = '<option value="">-- Gói chính --</option>';
            for (const cat of Object.keys(serviceMap)) {
                if (cat.toLowerCase().includes('nhuộm')) continue;
                const svcs = Array.from(serviceMap[cat]).sort();
                if (svcs.length === 0) continue;
                primaryOpts += `<optgroup label="${cat}">`;
                svcs.forEach(s => {
                    primaryOpts += `<option value="${s}">${s}</option>`;
                });
                primaryOpts += `</optgroup>`;
            }

            let dyeOpts = '<option value="">-- Không nhuộm --</option>';
            for (const cat of Object.keys(serviceMap)) {
                if (!cat.toLowerCase().includes('nhuộm')) continue;
                const svcs = Array.from(serviceMap[cat]).sort();
                svcs.forEach(s => {
                    dyeOpts += `<option value="${s}">${s}</option>`;
                });
            }

            const initialWeight = petData && petData.weight ? String(petData.weight).replace('.', ',') : '';
            const initialName = petData && petData.name ? petData.name : '';
            const initialBreed = petData && petData.breed ? petData.breed : '';
            const initialGender = petData && petData.gender ? petData.gender : 'unknown';
            const initialColor = petData && petData.color ? petData.color : '';

            tr.innerHTML = `
                <td class="p-2 text-center">
                    <div class="flex items-center justify-center gap-1">
                        <input type="checkbox" class="batch-row-checkbox w-3.5 h-3.5 text-purple-600 rounded cursor-pointer" checked>
                        <span class="font-mono text-slate-500 font-bold batch-row-stt text-[11px]">${rowIdx}</span>
                    </div>
                </td>
                <td class="p-2">
                    <div class="space-y-1">
                        <select class="w-full border p-1 rounded text-xs font-bold text-purple-800 batch-pet-select" onchange="onBatchRowPetChanged(this)">
                            ${petOpts}
                        </select>
                        <input type="text" class="w-full border p-1 rounded text-xs font-bold batch-pet-name" placeholder="Tên bé (*)" value="${initialName}">
                        <div class="grid grid-cols-3 gap-1">
                            <input type="text" class="border p-0.5 rounded text-[11px] batch-pet-breed" placeholder="Giống loài" value="${initialBreed}">
                            <select class="border p-0.5 rounded text-[11px] batch-pet-gender">
                                <option value="unknown" ${initialGender === 'unknown' ? 'selected' : ''}>-- Giới tính --</option>
                                <option value="male" ${initialGender === 'male' || initialGender === 'Đực' ? 'selected' : ''}>Đực</option>
                                <option value="female" ${initialGender === 'female' || initialGender === 'Cái' ? 'selected' : ''}>Cái</option>
                            </select>
                            <input type="text" class="border p-0.5 rounded text-[11px] batch-pet-color" placeholder="Màu lông" value="${initialColor}">
                        </div>
                    </div>
                </td>
                <td class="p-2 text-center">
                    <input type="text" class="w-16 border-2 border-pink-200 p-1 rounded text-xs text-center font-bold text-pink-700 batch-pet-weight" placeholder="VD: 3.5" value="${initialWeight}" oninput="calcBatchRowTotal(this.closest('tr'))">
                </td>
                <td class="p-2 text-center">
                    <select class="w-full border p-1 rounded text-xs batch-pet-shaving">
                        <option value="Không cạo bàn">Không</option>
                        <option value="Cạo bàn">Có cạo</option>
                        <option value="Cạo bàn cao">Cạo cao</option>
                    </select>
                </td>
                <td class="p-2">
                    <select class="w-full border p-1 rounded text-xs font-medium text-slate-800 batch-pet-primary" onchange="calcBatchRowTotal(this.closest('tr'))">
                        ${primaryOpts}
                    </select>
                </td>
                <td class="p-2">
                    <select class="w-full border p-1 rounded text-xs text-slate-700 batch-pet-dye" onchange="calcBatchRowTotal(this.closest('tr'))">
                        ${dyeOpts}
                    </select>
                </td>
                <td class="p-2 text-right space-y-1">
                    <div class="flex items-center justify-end gap-1 text-[11px]">
                        <label class="inline-flex items-center gap-1 cursor-pointer select-none text-slate-700">
                            <input type="checkbox" class="batch-cb-teeth w-3 h-3 text-purple-600 rounded" onchange="onBatchRowCheckboxFeeChanged(this, 'teeth')">
                            <span>Răng:</span>
                        </label>
                        <input type="text" class="w-14 border p-0.5 rounded text-xs text-right font-mono batch-pet-teeth" placeholder="0" oninput="onMoneyInputChange(this); calcBatchRowTotal(this.closest('tr'))">
                    </div>
                    <div class="flex items-center justify-end gap-1 text-[11px]">
                        <label class="inline-flex items-center gap-1 cursor-pointer select-none text-slate-700">
                            <input type="checkbox" class="batch-cb-art w-3 h-3 text-purple-600 rounded" onchange="onBatchRowCheckboxFeeChanged(this, 'art')">
                            <span>Cắt NT:</span>
                        </label>
                        <input type="text" class="w-14 border p-0.5 rounded text-xs text-right font-mono batch-pet-art" placeholder="0" oninput="onMoneyInputChange(this); calcBatchRowTotal(this.closest('tr'))">
                    </div>
                    <div class="flex items-center justify-end gap-1 text-[11px]">
                        <label class="inline-flex items-center gap-1 cursor-pointer select-none text-slate-700">
                            <input type="checkbox" class="batch-cb-surch w-3 h-3 text-purple-600 rounded" onchange="onBatchRowCheckboxFeeChanged(this, 'surch')">
                            <span>Gỡ rối:</span>
                        </label>
                        <input type="text" class="w-14 border p-0.5 rounded text-xs text-right font-mono font-bold batch-pet-surcharges" placeholder="0" oninput="onMoneyInputChange(this); calcBatchRowTotal(this.closest('tr'))">
                    </div>
                    <div class="flex items-center justify-end gap-1 text-[11px]">
                        <label class="inline-flex items-center gap-1 cursor-pointer select-none text-slate-700">
                            <input type="checkbox" class="batch-cb-ship w-3 h-3 text-purple-600 rounded" onchange="onBatchRowCheckboxFeeChanged(this, 'ship')">
                            <span>Ship:</span>
                        </label>
                        <input type="text" class="w-14 border p-0.5 rounded text-xs text-right font-mono batch-pet-ship" placeholder="0" oninput="onMoneyInputChange(this); calcBatchRowTotal(this.closest('tr'))">
                    </div>
                    <div class="flex items-center justify-end gap-1 text-[11px]">
                        <span class="text-emerald-700 font-bold">Tip:</span>
                        <input type="text" class="w-14 border p-0.5 rounded text-xs text-right font-mono font-bold text-emerald-700 batch-pet-tip" placeholder="0" oninput="onMoneyInputChange(this); calcBatchRowTotal(this.closest('tr'))">
                    </div>
                </td>
                <td class="p-2 text-right">
                    <span class="font-mono font-bold text-xs text-rose-700 batch-pet-total">0 đ</span>
                    <input type="hidden" class="batch-pet-total-val" value="0">
                </td>
                <td class="p-2 space-y-1">
                    <input type="text" class="w-full border p-1 rounded text-xs batch-pet-notes" placeholder="Yêu cầu cắt, sấy...">
                    <input type="text" class="w-full border p-1 rounded text-xs text-amber-800 batch-pet-accessories" placeholder="Phụ kiện gửi lại (dây, chuồng...)">
                    <div class="flex items-center gap-1">
                        <input type="text" class="w-full border p-1 rounded text-xs text-pink-700 font-medium batch-pet-cutter" placeholder="✂️ Thợ cắt...">
                        <label class="inline-flex items-center gap-0.5 text-[11px] text-sky-800 font-bold whitespace-nowrap cursor-pointer" title="Spa xong gửi hotel">
                            <input type="checkbox" class="batch-pet-hotel"> 🏨
                        </label>
                    </div>
                </td>
                <td class="p-2 text-center">
                    <button type="button" onclick="removeBatchPetRow(this)" class="text-rose-500 hover:text-rose-700 font-bold p-1">🗑️</button>
                </td>
            `;

            tbody.appendChild(tr);
            calcBatchRowTotal(tr);
            calcBatchGrandTotal();
        }
        window.addBatchPetRow = addBatchPetRow;

        function removeBatchPetRow(btn) {
            const tr = btn.closest('tr');
            if (tr) {
                const petId = tr.dataset.petId;
                if (petId) {
                    const cb = document.querySelector(`.batch-pet-check[value="${petId}"]`);
                    if (cb) cb.checked = false;
                    updateBatchSelectedPetCount();
                }
                tr.remove();
                const tbody = document.getElementById('tbody-batch-pets');
                if (tbody) {
                    Array.from(tbody.querySelectorAll('.batch-row-stt')).forEach((el, idx) => {
                        el.textContent = idx + 1;
                    });
                }
                calcBatchGrandTotal();
            }
        }
        window.removeBatchPetRow = removeBatchPetRow;

        function onBatchRowPetChanged(selectEl) {
            const tr = selectEl.closest('tr');
            if (!tr) return;
            const petId = selectEl.value;
            const nameInput = tr.querySelector('.batch-pet-name');
            const weightInput = tr.querySelector('.batch-pet-weight');
            const breedInput = tr.querySelector('.batch-pet-breed');
            const genderInput = tr.querySelector('.batch-pet-gender');
            const colorInput = tr.querySelector('.batch-pet-color');

            if (!petId || petId === '__new__') {
                if (nameInput) nameInput.value = '';
                if (weightInput) weightInput.value = '';
                if (breedInput) breedInput.value = '';
                if (colorInput) colorInput.value = '';
            } else {
                const p = (currentSvcPetsList || []).find(x => x.id == petId);
                if (p) {
                    if (nameInput) nameInput.value = p.name || '';
                    if (weightInput && p.weight) weightInput.value = String(p.weight).replace('.', ',');
                    if (breedInput && p.breed) breedInput.value = p.breed;
                    if (genderInput && p.gender) genderInput.value = p.gender;
                    if (colorInput && p.color) colorInput.value = p.color;
                }
            }
            calcBatchRowTotal(tr);
        }
        window.onBatchRowPetChanged = onBatchRowPetChanged;

        function calcBatchRowTotal(tr) {
            if (!tr) return;
            const weightVal = tr.querySelector('.batch-pet-weight')?.value;
            const weight = parseWeightFloat(weightVal);
            const primaryPkg = tr.querySelector('.batch-pet-primary')?.value || '';
            const dyePkg = tr.querySelector('.batch-pet-dye')?.value || '';

            const teeth = parseMoneyInput(tr.querySelector('.batch-pet-teeth')?.value);
            const art = parseMoneyInput(tr.querySelector('.batch-pet-art')?.value);
            const surcharges = parseMoneyInput(tr.querySelector('.batch-pet-surcharges')?.value);
            const ship = parseMoneyInput(tr.querySelector('.batch-pet-ship')?.value);
            const tip = parseMoneyInput(tr.querySelector('.batch-pet-tip')?.value);

            let price = 0;
            if (primaryPkg && Array.isArray(allPetPricingData)) {
                const match = allPetPricingData.find(item => 
                    item.service_name.trim().toLowerCase() === primaryPkg.trim().toLowerCase() &&
                    (item.min_weight === 0 ? weight >= item.min_weight : weight > item.min_weight) &&
                    weight <= item.max_weight
                ) || allPetPricingData.find(item => 
                    item.service_name.trim().toLowerCase() === primaryPkg.trim().toLowerCase() &&
                    weight >= item.min_weight && weight <= item.max_weight
                );
                if (match) price += (match.price || 0);
            }

            if (dyePkg && Array.isArray(allPetPricingData)) {
                const matchDye = allPetPricingData.find(item => 
                    item.service_name.trim().toLowerCase() === dyePkg.trim().toLowerCase()
                );
                if (matchDye) price += (matchDye.price || 0);
            }

            const rowTotal = price + teeth + art + surcharges + ship + tip;
            const totalDisplay = tr.querySelector('.batch-pet-total');
            const totalInput = tr.querySelector('.batch-pet-total-val');
            if (totalDisplay) totalDisplay.textContent = formatMoneyString(rowTotal) + ' đ';
            if (totalInput) totalInput.value = rowTotal;

            calcBatchGrandTotal();
        }
        window.calcBatchRowTotal = calcBatchRowTotal;

        function calcBatchGrandTotal() {
            const tbody = document.getElementById('tbody-batch-pets');
            if (!tbody) return;
            const rows = Array.from(tbody.querySelectorAll('.batch-pet-row'));
            let totalPets = 0;
            let grandTotal = 0;

            rows.forEach(tr => {
                const name = tr.querySelector('.batch-pet-name')?.value.trim();
                if (name) totalPets++;
                const rTotal = parseFloat(tr.querySelector('.batch-pet-total-val')?.value) || 0;
                grandTotal += rTotal;
            });

            const petsBadge = document.getElementById('batch-total-pets');
            const grandBadge = document.getElementById('batch-grand-total');
            if (petsBadge) petsBadge.textContent = totalPets || rows.length;
            if (grandBadge) grandBadge.textContent = formatMoneyString(grandTotal) + ' đ';
        }
        window.calcBatchGrandTotal = calcBatchGrandTotal;

        async function submitBatchServiceTickets(andPrint = false, consolidated = true) {
            const custId = parseInt(document.getElementById('svc-customer-id')?.value) || 0;
            if (!custId) { alert('Vui lòng chọn hoặc thêm khách hàng trước!'); return; }

            const tbody = document.getElementById('tbody-batch-pets');
            const rows = tbody ? Array.from(tbody.querySelectorAll('.batch-pet-row')) : [];
            if (rows.length === 0) { alert('Vui lòng thêm ít nhất 1 dòng bé để tiếp nhận!'); return; }

            const tickets = [];
            const paymentTiming = document.getElementById('batch-payment-timing')?.value || 'unpaid';
            const paymentMethod = paymentTiming === 'paid' ? (document.getElementById('batch-payment-method')?.value || 'cash') : null;

            if (paymentTiming === 'paid' && paymentMethod === 'wallet') {
                const totalBatch = parseFloat(document.getElementById('batch-grand-total')?.textContent?.replace(/[^\d]/g, '') || 0);
                const cust = (allContacts || []).find(c => c.id == custId);
                const bal = (cust && cust.spa_wallet_balance) ? parseFloat(cust.spa_wallet_balance) : 0;
                if (bal < totalBatch) {
                    alert(`Số dư ví Spa không đủ thanh toán cả đợt! (Số dư: ${formatMoneyString(bal)} đ, Cần thanh toán: ${formatMoneyString(totalBatch)} đ).\nVui lòng nạp thêm ví hoặc chọn phương thức khác.`);
                    return;
                }
            }

            for (let idx = 0; idx < rows.length; idx++) {
                const tr = rows[idx];
                const petSel = tr.querySelector('.batch-pet-select')?.value;
                const petId = (petSel && petSel !== '__new__') ? parseInt(petSel) : null;
                const petName = tr.querySelector('.batch-pet-name')?.value.trim();
                const breed = tr.querySelector('.batch-pet-breed')?.value.trim() || 'Chó cảnh';
                const gender = tr.querySelector('.batch-pet-gender')?.value || 'unknown';
                const color = tr.querySelector('.batch-pet-color')?.value.trim() || '';
                const weight = parseWeightFloat(tr.querySelector('.batch-pet-weight')?.value);
                const shavingFeet = tr.querySelector('.batch-pet-shaving')?.value || 'Không cạo bàn';
                const primaryPkg = tr.querySelector('.batch-pet-primary')?.value || '';
                const dyePkg = tr.querySelector('.batch-pet-dye')?.value || '';

                const teeth = parseMoneyInput(tr.querySelector('.batch-pet-teeth')?.value);
                const art = parseMoneyInput(tr.querySelector('.batch-pet-art')?.value);
                const surcharge = parseMoneyInput(tr.querySelector('.batch-pet-surcharges')?.value);
                const ship = parseMoneyInput(tr.querySelector('.batch-pet-ship')?.value);
                const tip = parseMoneyInput(tr.querySelector('.batch-pet-tip')?.value);

                const rowTotal = parseFloat(tr.querySelector('.batch-pet-total-val')?.value) || 0;
                const notes = tr.querySelector('.batch-pet-notes')?.value.trim() || '';
                const accessories = tr.querySelector('.batch-pet-accessories')?.value.trim() || '';
                const cutter = tr.querySelector('.batch-pet-cutter')?.value.trim() || '';
                const hotel = tr.querySelector('.batch-pet-hotel')?.checked ? 1 : 0;

                if (!petName) {
                    alert(`Dòng ${idx + 1}: Vui lòng nhập tên của bé!`);
                    return;
                }
                if (weight <= 0) {
                    alert(`Dòng ${idx + 1} (${petName}): Vui lòng nhập cân nặng của bé (VD: 3.5)!`);
                    return;
                }

                let serviceTypes = [];
                if (primaryPkg) serviceTypes.push(primaryPkg);
                if (dyePkg) serviceTypes.push(dyePkg);
                const serviceType = serviceTypes.join(' + ') || 'Dịch vụ Spa';

                const lineItems = [];
                const basePrice = rowTotal - teeth - art - surcharge - ship - tip;
                if (primaryPkg) {
                    lineItems.push({ name: primaryPkg, quantity: 1, price: basePrice, original_price: basePrice });
                }
                if (dyePkg) {
                    lineItems.push({ name: dyePkg, quantity: 1, price: 0, original_price: 0 });
                }
                if (teeth > 0) lineItems.push({ name: 'Đánh răng', quantity: 1, price: teeth, original_price: teeth });
                if (art > 0) lineItems.push({ name: 'Cắt tạo kiểu nghệ thuật', quantity: 1, price: art, original_price: art });
                if (surcharge > 0) lineItems.push({ name: 'Phụ thu gỡ rối / dịch vụ thêm', quantity: 1, price: surcharge, original_price: surcharge });
                if (ship > 0) lineItems.push({ name: 'Cước đưa đón', quantity: 1, price: ship, original_price: ship });
                if (tip > 0) lineItems.push({ name: 'Tiền tip thợ', quantity: 1, price: tip, original_price: tip });

                tickets.push({
                    customer_id: custId,
                    pet_id: petId,
                    pet_name: petName,
                    pet_species: 'dog',
                    pet_breed: breed,
                    pet_gender: gender,
                    pet_color: color,
                    weight_at_service: weight,
                    shaving_feet: shavingFeet,
                    service_type: serviceType,
                    dye_package: dyePkg,
                    teeth_cleaning: teeth,
                    art_cutting_fee: art,
                    surcharge: surcharge,
                    shipping_fee: ship,
                    tip_amount: tip,
                    price: rowTotal,
                    note: notes,
                    customer_request: notes,
                    accessories: accessories,
                    staff_cutter: cutter,
                    send_to_hotel: hotel,
                    payment_status: paymentTiming,
                    payment_method: paymentMethod,
                    services_json: JSON.stringify(lineItems)
                });
            }

            try {
                const res = await fetch('/api/pet-services/batch', {
                    method: 'POST',
                    headers: {'Content-Type': 'application/json'},
                    body: JSON.stringify({
                        customer_id: custId,
                        tickets: tickets
                    })
                });

                if (!res.ok) {
                    const err = await res.json();
                    alert('Lỗi tạo đợt phiếu: ' + (err.detail || ''));
                    return;
                }

                const resData = await res.json();
                if (paymentTiming === 'paid' && paymentMethod === 'wallet') {
                    const cust = (allContacts || []).find(c => c.id == custId);
                    if (cust) {
                        const totalBatch = parseFloat(document.getElementById('batch-grand-total')?.textContent?.replace(/[^\d]/g, '') || 0);
                        cust.spa_wallet_balance = Math.max(0, (cust.spa_wallet_balance || 0) - totalBatch);
                    }
                }
                closeCreateServiceTicketModal();
                await loadPetServicesList();
                await loadPetServicesKPI();

                if (andPrint && Array.isArray(resData.tickets) && resData.tickets.length > 0) {
                    await printBatchPetServiceTickets(resData.tickets, 'intake', consolidated);
                } else {
                    alert(`✅ Đã lập thành công ${resData.count} Phiếu Tiếp Nhận Spa (Đợt: ${resData.batch_code})!`);
                }
            } catch(e) {
                console.error("submitBatchServiceTickets error:", e);
                alert('Lỗi kết nối máy chủ');
            }
        }
        window.submitBatchServiceTickets = submitBatchServiceTickets;

        // ==========================================
        // IN PHIẾU SPA K80 (TIẾP NHẬN & THANH TOÁN)
        // ==========================================
        function getTicketLineItems(ticket) {
            let items = [];
            if (ticket.services_json) {
                try {
                    if (typeof ticket.services_json === 'string' && ticket.services_json.trim().startsWith('[')) {
                        items = JSON.parse(ticket.services_json);
                    } else if (Array.isArray(ticket.services_json)) {
                        items = ticket.services_json;
                    }
                } catch (e) {
                    console.error('Error parsing ticket services_json:', e);
                }
            }

            const extraTeeth = ticket.teeth_cleaning || 0;
            const extraArt = ticket.art_cutting_fee || 0;
            const extraSurch = ticket.surcharge || 0;
            const extraShip = ticket.shipping_fee || 0;

            if (Array.isArray(items) && items.length > 0) {
                if (extraTeeth > 0 && !items.some(it => it.name.includes('Đánh răng'))) {
                    items.push({ name: 'Đánh răng', quantity: 1, price: extraTeeth, original_price: extraTeeth });
                }
                if (extraArt > 0 && !items.some(it => it.name.includes('Cắt nghệ thuật'))) {
                    items.push({ name: 'PT Cắt nghệ thuật', quantity: 1, price: extraArt, original_price: extraArt });
                }
                if (extraSurch > 0 && !items.some(it => it.name.includes('Phụ thu'))) {
                    items.push({ name: 'Phụ thu khác', quantity: 1, price: extraSurch, original_price: extraSurch });
                }
                if (extraShip > 0 && !items.some(it => it.name.includes('Cước giao') || it.name.includes('vận chuyển'))) {
                    items.push({ name: 'Cước giao bé về', quantity: 1, price: extraShip, original_price: extraShip });
                }
                return items;
            }

            // Fallback khi services_json chưa có (phiếu cũ)
            items = [];
            const totalExtras = extraTeeth + extraArt + extraSurch + extraShip;

            let dyePrice = 0;
            if (ticket.dye_package && ticket.dye_package.trim()) {
                if (Array.isArray(allPetPricingData)) {
                    const matchDye = allPetPricingData.find(item => item.service_name.trim().toLowerCase() === ticket.dye_package.trim().toLowerCase());
                    if (matchDye) dyePrice = matchDye.price || 0;
                }
            }

            let primaryName = ticket.service_type || 'Dịch vụ Spa';
            if (ticket.dye_package && primaryName.includes(ticket.dye_package)) {
                primaryName = primaryName.replace(ticket.dye_package, '').replace(/\s*\+\s*$/, '').trim();
            }
            if (!primaryName) primaryName = 'Dịch vụ Spa';

            const primaryFinalPrice = Math.max(0, (ticket.price || 0) - totalExtras - dyePrice);
            let primaryOrigPrice = primaryFinalPrice;
            const w = parseFloat(ticket.weight_at_service) || 0;
            if (Array.isArray(allPetPricingData) && primaryName) {
                const match = allPetPricingData.find(item => 
                    item.service_name.trim().toLowerCase() === primaryName.toLowerCase() &&
                    (item.min_weight === 0 ? w >= item.min_weight : w > item.min_weight) &&
                    w <= item.max_weight
                ) || allPetPricingData.find(item => 
                    item.service_name.trim().toLowerCase() === primaryName.toLowerCase() &&
                    w >= item.min_weight && w <= item.max_weight
                );
                if (match && match.price > primaryFinalPrice) {
                    primaryOrigPrice = match.price;
                }
            }

            items.push({
                name: primaryName,
                quantity: 1,
                price: primaryFinalPrice,
                original_price: primaryOrigPrice
            });

            if (ticket.dye_package && ticket.dye_package.trim()) {
                items.push({
                    name: ticket.dye_package,
                    quantity: 1,
                    price: dyePrice,
                    original_price: dyePrice
                });
            }

            if (extraTeeth > 0) items.push({ name: 'Đánh răng', quantity: 1, price: extraTeeth, original_price: extraTeeth });
            if (extraArt > 0) items.push({ name: 'PT Cắt nghệ thuật', quantity: 1, price: extraArt, original_price: extraArt });
            if (extraSurch > 0) items.push({ name: 'Phụ thu khác', quantity: 1, price: extraSurch, original_price: extraSurch });
            if (extraShip > 0) items.push({ name: 'Cước giao bé về', quantity: 1, price: extraShip, original_price: extraShip });

            return items;
        }

        // =========================================================================
        // HÀM TẠO HTML MẪU IN K80 CHUYÊN BIỆT CHO MÁY IN NHIỆT (ĐẬM NÉT, ĐEN THUẦN)
        // =========================================================================
        function generateSinglePetTicketHtml(ticket, type = 'intake') {
            const now = new Date();
            const dateStr = now.toLocaleDateString('vi-VN') + ' ' + now.toLocaleTimeString('vi-VN', {hour: '2-digit', minute:'2-digit'});
            const weightDisplay = ticket.weight_at_service ? String(ticket.weight_at_service).replace('.', ',') + ' kg' : (ticket.pet_weight ? String(ticket.pet_weight).replace('.', ',') + ' kg' : '-');

            const items = getTicketLineItems(ticket);
            let totalOriginal = 0;
            let totalFinal = 0;

            const rowsHtml = items.map(it => {
                const qty = it.quantity || 1;
                const price = it.price || 0;
                const origPrice = (it.original_price && it.original_price > price) ? it.original_price : price;
                const subtotal = qty * price;
                const hasDiscount = origPrice > price;
                const diff = origPrice - price;

                totalOriginal += (origPrice * qty);
                totalFinal += subtotal;

                const priceDisplay = hasDiscount ? `
                    <div style="font-weight: 800; line-height: 1.1; color: #000;">${formatMoney(price)}</div>
                    <div style="font-size: 9px; line-height: 1.1; margin-top: 1px; color: #000;">
                        <span style="text-decoration: line-through;">${formatMoney(origPrice)}</span>
                        <span style="font-weight: 800;">(Giảm ${formatMoney(diff)})</span>
                    </div>
                ` : `<div style="font-family: monospace; font-weight: 800; color: #000;">${formatMoney(price)}</div>`;

                const subtotalDisplay = (hasDiscount && qty > 1) ? `
                    <div style="font-weight: 900; font-family: monospace; color: #000;">${formatMoney(subtotal)}</div>
                    <div style="font-size: 9px; line-height: 1.1; font-weight: 800; color: #000;">(Giảm ${formatMoney(diff * qty)})</div>
                ` : `<div style="font-weight: 900; font-family: monospace; color: #000;">${formatMoney(subtotal)}</div>`;

                return `
                    <tr>
                        <td colspan="3" style="padding: 5px 0 2px 0; font-weight: 900; font-size: 12px; color: #000; text-align: left; word-break: break-word; line-height: 1.2;">
                            ${it.name}
                        </td>
                    </tr>
                    <tr style="border-bottom: 1px dashed #000;">
                        <td style="text-align: left; vertical-align: top; padding: 2px 0 5px 0; font-family: monospace; font-weight: 800; color: #000;">${qty}</td>
                        <td style="text-align: right; vertical-align: top; padding: 2px 0 5px 0;">${priceDisplay}</td>
                        <td style="text-align: right; vertical-align: top; padding: 2px 0 5px 0;">${subtotalDisplay}</td>
                    </tr>
                `;
            }).join('');

            const hasAnyDiscount = totalOriginal > (ticket.price || totalFinal);
            const totalDiscount = Math.max(0, totalOriginal - (ticket.price || totalFinal));

            if (type === 'invoice') {
                // PHIẾU THANH TOÁN / TRẢ BÉ (K80)
                return `
                    <div class="thermal-k80-wrapper" style="width: 72mm; max-width: 72mm; margin: 0 auto; box-sizing: border-box; font-family: 'Segoe UI', Arial, sans-serif; font-size: 11.5px; line-height: 1.35; color: #000; padding: 1mm 1mm;">
                        <div style="text-align: center; border-bottom: 2px dashed #000; padding-bottom: 8px; margin-bottom: 8px;">
                            <h2 style="margin: 0; font-size: 16px; font-weight: 900; text-transform: uppercase; color: #000; letter-spacing: 0.5px;">🐾 PET SPA & GROOMING</h2>
                            <div style="font-size: 13px; font-weight: 900; margin-top: 4px; color: #000;">HÓA ĐƠN THANH TOÁN SPA</div>
                            <div style="display: inline-block; border: 2px solid #000; color: #000; font-size: 16px; font-weight: 900; padding: 2px 10px; border-radius: 4px; margin-top: 5px;">
                                SỐ PHIẾU: #${ticket.ticket_number || ticket.id}
                            </div>
                            <div style="font-size: 11px; margin-top: 3px; font-family: monospace; font-weight: 800; color: #000;">Mã: ${ticket.code} ${ticket.batch_code ? `· Đợt: ${ticket.batch_code}` : ''}</div>
                            <div style="font-size: 10px; font-weight: 700; color: #000;">Ngày in: ${dateStr}</div>
                        </div>

                        <div style="border-bottom: 1px dashed #000; padding-bottom: 6px; margin-bottom: 6px; font-size: 12px;">
                            <div><strong>Khách hàng:</strong> <span style="font-weight: 800; font-size: 13px;">${ticket.customer_name || 'Khách lẻ'}</span></div>
                            <div><strong>Điện thoại:</strong> <span style="font-weight: 800;">${ticket.customer_phone || '-'}</span></div>
                        </div>

                        <div style="border-bottom: 1.5px solid #000; padding: 6px; margin-bottom: 6px; border: 1.5px solid #000; border-radius: 4px;">
                            <div style="font-size: 14px; font-weight: 900; color: #000;">🐕 BÉ: ${ticket.pet_name || 'Bé cưng'}</div>
                            <div><strong>Giống/Màu:</strong> <span style="font-weight: 800;">${ticket.pet_breed || ticket.pet_species || 'Chó cảnh'} | ${ticket.pet_color || '-'}</span></div>
                            <div><strong>Cân nặng:</strong> <span style="font-size: 13px; font-weight: 900; color: #000;">${weightDisplay}</span></div>
                            <div style="font-size: 11px; margin-top: 2px;">
                                Giờ nhận: <strong>${ticket.received_time || '-'}</strong> ➔ Giờ về: <strong>${ticket.checkout_time || new Date().toLocaleTimeString('vi-VN', {hour: '2-digit', minute:'2-digit'})}</strong>
                            </div>
                        </div>

                        <div style="border-bottom: 1px dashed #000; padding-bottom: 6px; margin-bottom: 6px;">
                            <div style="font-weight: 900; text-transform: uppercase; font-size: 11px; margin-bottom: 4px; color: #000;">BẢNG KÊ CHI PHÍ & DỊCH VỤ:</div>
                            <table style="width: 100%; border-collapse: collapse; font-size: 11px; border-top: 1.5px solid #000; border-bottom: 1.5px solid #000;">
                                <thead>
                                    <tr style="border-bottom: 1px solid #000; font-size: 10px; text-transform: uppercase;">
                                        <th style="text-align: left; padding: 4px 0 2px 0; width: 35px; color: #000;">SL</th>
                                        <th style="text-align: right; padding: 4px 0 2px 0; color: #000;">Đơn giá</th>
                                        <th style="text-align: right; padding: 4px 0 2px 0; width: 85px; color: #000;">Thành tiền</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    ${rowsHtml}
                                </tbody>
                            </table>
                        </div>

                        <div style="border-bottom: 2px dashed #000; padding-bottom: 6px; margin-bottom: 6px;">
                            ${hasAnyDiscount ? `
                            <div style="display: flex; justify-content: space-between; font-size: 11px; margin-bottom: 3px; font-weight: 700;">
                                <span>Tổng tiền dịch vụ:</span>
                                <span style="font-family: monospace; font-weight: 800;">${formatMoney(totalOriginal)}</span>
                            </div>
                            <div style="display: flex; justify-content: space-between; font-size: 11px; font-weight: 800; margin-bottom: 3px;">
                                <span>Giảm giá / Ưu đãi:</span>
                                <span style="font-family: monospace;">- ${formatMoney(totalDiscount)}</span>
                            </div>
                            ` : ''}
                            <div style="display: flex; justify-content: space-between; font-size: 16px; font-weight: 900; margin-top: 4px; border-top: 2px solid #000; border-bottom: 2px solid #000; padding: 4px 0;">
                                <span>TỔNG CỘNG:</span>
                                <span style="font-family: monospace;">${formatMoney(ticket.price || totalFinal)}</span>
                            </div>
                            <div style="display: flex; justify-content: space-between; font-size: 12px; font-weight: 900; margin-top: 3px;">
                                <span>Trạng thái TT:</span>
                                <span>${ticket.payment_status === 'paid' ? 'ĐÃ THANH TOÁN' : 'CHƯA THANH TOÁN'}</span>
                            </div>
                        </div>

                        ${(ticket.staff_cutter || ticket.staff_worker_1) ? `
                            <div style="font-size: 11px; font-weight: 700; margin-bottom: 6px;">
                                <div>Thợ cắt: <strong>${ticket.staff_cutter || '-'}</strong> | Thợ tắm: <strong>${ticket.staff_worker_1 || '-'}</strong></div>
                            </div>
                        ` : ''}

                        <div style="text-align: center; font-size: 10px; font-weight: 700; color: #000; margin-top: 8px;">
                            <div>Cảm ơn Quý khách đã tin tưởng & chăm sóc bé tại Mastercare!</div>
                            <div style="font-weight: 900; margin-top: 2px;">Chúc bé luôn khỏe mạnh & hẹn gặp lại! ❤️</div>
                        </div>
                    </div>
                `;
            } else {
                // PHIẾU TIẾP NHẬN DỊCH VỤ (K80) - CÓ 2 Ô CHỮ KÝ
                return `
                    <div class="thermal-k80-wrapper" style="width: 72mm; max-width: 72mm; margin: 0 auto; box-sizing: border-box; font-family: 'Segoe UI', Arial, sans-serif; font-size: 11.5px; line-height: 1.35; color: #000; padding: 1mm 1mm;">
                        <div style="text-align: center; border-bottom: 2px dashed #000; padding-bottom: 8px; margin-bottom: 8px;">
                            <h2 style="margin: 0; font-size: 16px; font-weight: 900; text-transform: uppercase; color: #000; letter-spacing: 0.5px;">🐾 PET SPA & GROOMING</h2>
                            <div style="font-size: 13px; font-weight: 900; margin-top: 4px; color: #000;">PHIẾU TIẾP NHẬN DỊCH VỤ</div>
                            <div style="display: inline-block; border: 2px solid #000; color: #000; font-size: 16px; font-weight: 900; padding: 2px 10px; border-radius: 4px; margin-top: 5px;">
                                SỐ PHIẾU: #${ticket.ticket_number || ticket.id}
                            </div>
                            <div style="font-size: 11px; margin-top: 3px; font-family: monospace; font-weight: 800; color: #000;">Mã: ${ticket.code} ${ticket.batch_code ? `· Đợt: ${ticket.batch_code}` : ''}</div>
                            <div style="font-size: 10px; font-weight: 700; color: #000;">Ngày lập: ${dateStr}</div>
                        </div>

                        <div style="border-bottom: 1px dashed #000; padding-bottom: 6px; margin-bottom: 6px; font-size: 12px;">
                            <div><strong>Khách hàng:</strong> <span style="font-weight: 800; font-size: 13px;">${ticket.customer_name || 'Khách lẻ'}</span></div>
                            <div><strong>Điện thoại:</strong> <span style="font-weight: 800;">${ticket.customer_phone || '-'}</span></div>
                        </div>

                        <div style="border-bottom: 1.5px solid #000; padding: 6px; margin-bottom: 6px; border: 1.5px solid #000; border-radius: 4px;">
                            <div style="font-size: 14px; font-weight: 900; color: #000;">🐕 BÉ: ${ticket.pet_name || 'Bé cưng'}</div>
                            <div><strong>Giống loài:</strong> <span style="font-weight: 800;">${ticket.pet_breed || ticket.pet_species || 'Chó cảnh'}</span></div>
                            <div><strong>Giới tính:</strong> <span style="font-weight: 800;">${ticket.pet_gender || 'Đực'}</span> | <strong>Màu:</strong> <span style="font-weight: 800;">${ticket.pet_color || 'Bò sữa'}</span></div>
                            <div><strong>Cân nặng:</strong> <span style="font-size: 13px; font-weight: 900; color: #000;">${weightDisplay}</span></div>
                            <div style="margin-top: 3px; padding-top: 3px; border-top: 1px dashed #000;">
                                <strong>Cạo bàn:</strong> <span style="font-weight: 900; text-decoration: underline;">${ticket.shaving_feet || 'Không cạo bàn'}</span>
                            </div>
                        </div>

                        <div style="border-bottom: 1px dashed #000; padding-bottom: 6px; margin-bottom: 6px;">
                            <div style="font-weight: 900; text-transform: uppercase; font-size: 11px; margin-bottom: 4px; color: #000;">DỊCH VỤ SỬ DỤNG:</div>
                            <table style="width: 100%; border-collapse: collapse; font-size: 11px; border-top: 1.5px solid #000; border-bottom: 1.5px solid #000;">
                                <thead>
                                    <tr style="border-bottom: 1px solid #000; font-size: 10px; text-transform: uppercase;">
                                        <th style="text-align: left; padding: 4px 0 2px 0; width: 35px; color: #000;">SL</th>
                                        <th style="text-align: right; padding: 4px 0 2px 0; color: #000;">Đơn giá</th>
                                        <th style="text-align: right; padding: 4px 0 2px 0; width: 85px; color: #000;">Thành tiền</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    ${rowsHtml}
                                </tbody>
                            </table>
                            ${ticket.customer_request ? `<div style="font-size: 11px; margin-top: 4px; font-weight: 800;">✂️ Y/c: ${ticket.customer_request}</div>` : ''}
                            ${ticket.accessories ? `<div style="font-size: 11px; margin-top: 2px; font-weight: 800;">🎒 PK kèm: ${ticket.accessories}</div>` : ''}
                            ${ticket.note ? `<div style="font-size: 11px; margin-top: 2px; font-weight: 800;">📝 Lưu ý: ${ticket.note}</div>` : ''}
                            <div style="font-size: 11px; margin-top: 3px; font-weight: 700;">
                                Giờ nhận: <strong>${ticket.received_time || '-'}</strong> (${ticket.arrival_method || 'Tự đến'})
                            </div>
                        </div>

                        <div style="border-bottom: 1.5px solid #000; padding-bottom: 6px; margin-bottom: 6px;">
                            ${hasAnyDiscount ? `
                            <div style="display: flex; justify-content: space-between; font-size: 11px; margin-bottom: 3px; font-weight: 700;">
                                <span>Tổng tiền dịch vụ:</span>
                                <span style="font-family: monospace; font-weight: 800;">${formatMoney(totalOriginal)}</span>
                            </div>
                            <div style="display: flex; justify-content: space-between; font-size: 11px; font-weight: 800; margin-bottom: 3px;">
                                <span>Giảm giá / Ưu đãi:</span>
                                <span style="font-family: monospace;">- ${formatMoney(totalDiscount)}</span>
                            </div>
                            ` : ''}
                            <div style="display: flex; justify-content: space-between; font-size: 15px; font-weight: 900; border-top: 2px solid #000; border-bottom: 2px solid #000; padding: 4px 0;">
                                <span>TỔNG TẠM TÍNH:</span>
                                <span style="font-family: monospace;">${formatMoney(ticket.price || totalFinal)}</span>
                            </div>
                            <div style="display: flex; justify-content: space-between; font-size: 11px; font-weight: 900; margin-top: 3px;">
                                <span>Trạng thái thanh toán:</span>
                                <span>${ticket.payment_status === 'paid' ? 'ĐÃ THANH TOÁN TRƯỚC' : 'THANH TOÁN KHI NHẬN BÉ'}</span>
                            </div>
                        </div>

                        <!-- 2 Ô CHỮ KÝ XÁC NHẬN -->
                        <div style="display: flex; justify-content: space-between; margin-top: 10px; margin-bottom: 25px; text-align: center; font-size: 11px; font-weight: 800;">
                            <div style="width: 48%;">
                                <strong>NV Tiếp Nhận</strong><br>
                                <span style="font-size: 9px; font-weight: normal;">(Ký & họ tên)</span>
                                <div style="height: 35px;"></div>
                                <div style="border-top: 1px dotted #000; padding-top: 2px;">${ticket.staff_receiver || '...................'}</div>
                            </div>
                            <div style="width: 48%;">
                                <strong>Khách Gửi Bé</strong><br>
                                <span style="font-size: 9px; font-weight: normal;">(Ký xác nhận)</span>
                                <div style="height: 35px;"></div>
                                <div style="border-top: 1px dotted #000; padding-top: 2px;">${ticket.customer_name || '...................'}</div>
                            </div>
                        </div>

                        <div style="text-align: center; font-size: 10px; font-weight: 700; color: #000; margin-top: 8px; border-top: 1px dashed #000; padding-top: 6px;">
                            <div>Quý khách vui lòng kiểm tra phụ kiện & giữ phiếu đối chiếu khi đón bé!</div>
                            <div style="font-weight: 900; margin-top: 2px;">Xin cảm ơn Quý khách! 💖</div>
                        </div>
                    </div>
                `;
            }
        }

        async function printPetServiceTicketDirectly(ticketIdOrObj, type = 'intake') {
            let ticket = null;
            if (typeof ticketIdOrObj === 'object' && ticketIdOrObj !== null) {
                ticket = ticketIdOrObj;
            } else {
                ticket = (allPetServiceTickets || []).find(t => t.id === ticketIdOrObj);
            }

            if (!ticket) { alert('Không tìm thấy thông tin phiếu'); return; }

            const printHtml = generateSinglePetTicketHtml(ticket, type);

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
                        body { margin: 0; padding: 0; background: #fff; color: #000; }
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

        // =========================================================================
        // IN HÀNG LOẠT NHIỀU PHIẾU SPA - GỘP 1 PHIẾU TỔNG HOẶC IN TÁCH LẺ TỪNG BÉ
        // =========================================================================
        function generateBatchConsolidatedTicketHtml(tickets, type = 'intake') {
            if (!Array.isArray(tickets) || tickets.length === 0) return '';
            const now = new Date();
            const dateStr = now.toLocaleDateString('vi-VN') + ' ' + now.toLocaleTimeString('vi-VN', {hour: '2-digit', minute:'2-digit'});
            const firstTicket = tickets[0] || {};
            const customerName = firstTicket.customer_name || 'Khách lẻ';
            const customerPhone = firstTicket.customer_phone || '-';
            const batchCode = firstTicket.batch_code || ('BATCH' + tickets.map(t => t.ticket_number || t.id).join('-'));
            const totalPets = tickets.length;

            let grandOriginal = 0;
            let grandFinal = 0;

            const ticketNumbers = tickets.map(t => '#' + (t.ticket_number || t.id)).join(', ');

            const petsSectionsHtml = tickets.map((t, idx) => {
                const weightDisplay = t.weight_at_service ? String(t.weight_at_service).replace('.', ',') + ' kg' : (t.pet_weight ? String(t.pet_weight).replace('.', ',') + ' kg' : '-');
                const items = getTicketLineItems(t);
                let petOriginal = 0;
                let petFinal = 0;

                const rowsHtml = items.map(it => {
                    const qty = it.quantity || 1;
                    const price = it.price || 0;
                    const origPrice = (it.original_price && it.original_price > price) ? it.original_price : price;
                    const subtotal = qty * price;
                    const hasDiscount = origPrice > price;
                    const diff = origPrice - price;

                    petOriginal += (origPrice * qty);
                    petFinal += subtotal;

                    const priceDisplay = hasDiscount ? `
                        <div style="font-weight: 800; line-height: 1.1; color: #000;">${formatMoney(price)}</div>
                        <div style="font-size: 9px; line-height: 1.1; margin-top: 1px; color: #000;">
                            <span style="text-decoration: line-through;">${formatMoney(origPrice)}</span>
                            <span style="font-weight: 800;">(Giảm ${formatMoney(diff)})</span>
                        </div>
                    ` : `<div style="font-family: monospace; font-weight: 800; color: #000;">${formatMoney(price)}</div>`;

                    const subtotalDisplay = (hasDiscount && qty > 1) ? `
                        <div style="font-weight: 900; font-family: monospace; color: #000;">${formatMoney(subtotal)}</div>
                        <div style="font-size: 9px; line-height: 1.1; font-weight: 800; color: #000;">(Giảm ${formatMoney(diff * qty)})</div>
                    ` : `<div style="font-weight: 900; font-family: monospace; color: #000;">${formatMoney(subtotal)}</div>`;

                    return `
                        <tr>
                            <td colspan="3" style="padding: 4px 0 1px 0; font-weight: 900; font-size: 11.5px; color: #000; text-align: left; word-break: break-word; line-height: 1.2;">
                                ${it.name}
                            </td>
                        </tr>
                        <tr style="border-bottom: 1px dashed #ddd;">
                            <td style="text-align: left; vertical-align: top; padding: 1px 0 4px 0; font-family: monospace; font-weight: 800; color: #000;">${qty}</td>
                            <td style="text-align: right; vertical-align: top; padding: 1px 0 4px 0;">${priceDisplay}</td>
                            <td style="text-align: right; vertical-align: top; padding: 1px 0 4px 0;">${subtotalDisplay}</td>
                        </tr>
                    `;
                }).join('');

                grandOriginal += petOriginal;
                grandFinal += (t.price || petFinal);

                return `
                    <div style="margin-bottom: 7px; border: 1.5px solid #000; border-radius: 4px; padding: 5px; background: #fff;">
                        <div style="display: flex; justify-content: space-between; align-items: center; border-bottom: 1px solid #000; padding-bottom: 3px; margin-bottom: 4px;">
                            <span style="font-size: 13px; font-weight: 900; color: #000;">🐕 BÉ ${idx + 1}: ${t.pet_name || 'Bé cưng'}</span>
                            <span style="font-size: 11px; font-weight: 900; background: #000; color: #fff; padding: 1px 6px; border-radius: 3px;">#${t.ticket_number || t.id}</span>
                        </div>
                        <div style="font-size: 11px; color: #000; line-height: 1.35;">
                            <div><strong>Giống:</strong> ${t.pet_breed || t.pet_species || 'Chó cảnh'} | <strong>Cân nặng:</strong> <strong style="font-size: 12px;">${weightDisplay}</strong></div>
                            <div><strong>Cạo bàn:</strong> <span style="font-weight: 800; text-decoration: underline;">${t.shaving_feet || 'Không cạo bàn'}</span></div>
                            ${t.customer_request ? `<div style="margin-top: 2px;">✂️ <strong>Y/c:</strong> ${t.customer_request}</div>` : ''}
                            ${t.accessories ? `<div>🎒 <strong>PK:</strong> ${t.accessories}</div>` : ''}
                        </div>
                        <div style="margin-top: 4px;">
                            <table style="width: 100%; border-collapse: collapse; font-size: 11px;">
                                <thead>
                                    <tr style="border-top: 1px solid #000; border-bottom: 1px solid #000; font-size: 10px; text-transform: uppercase;">
                                        <th style="text-align: left; padding: 2px 0; width: 30px;">SL</th>
                                        <th style="text-align: right; padding: 2px 0;">Đơn giá</th>
                                        <th style="text-align: right; padding: 2px 0; width: 75px;">Thành tiền</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    ${rowsHtml}
                                </tbody>
                            </table>
                        </div>
                        <div style="display: flex; justify-content: space-between; align-items: center; margin-top: 4px; padding-top: 3px; border-top: 1px dashed #000; font-size: 11.5px;">
                            <span style="font-weight: 800;">Tiền dịch vụ bé:</span>
                            <strong style="font-size: 12.5px; font-family: monospace; font-weight: 900;">${formatMoney(t.price || petFinal)}</strong>
                        </div>
                    </div>
                `;
            }).join('');

            const titleStr = type === 'invoice' ? 'HÓA ĐƠN THANH TOÁN SPA (TỔNG HỢP)' : 'PHIẾU TIẾP NHẬN DỊCH VỤ (TỔNG HỢP)';
            const methodStr = firstTicket.payment_method === 'wallet' ? 'Trừ Ví Spa' : (firstTicket.payment_method === 'transfer' ? 'Chuyển khoản (VietQR)' : 'Tiền mặt');
            const paymentLine = firstTicket.payment_status === 'paid' ? `Đã thanh toán trước (${methodStr})` : 'Thu tiền khi trả bé';

            return `
                <div class="thermal-k80-wrapper" style="width: 72mm; max-width: 72mm; margin: 0 auto; box-sizing: border-box; font-family: 'Segoe UI', Arial, sans-serif; font-size: 11.5px; line-height: 1.35; color: #000; padding: 1mm 1mm;">
                    <div style="text-align: center; border-bottom: 2px dashed #000; padding-bottom: 8px; margin-bottom: 8px;">
                        <h2 style="margin: 0; font-size: 16px; font-weight: 900; text-transform: uppercase; color: #000; letter-spacing: 0.5px;">🐾 PET SPA & GROOMING</h2>
                        <div style="font-size: 13px; font-weight: 900; margin-top: 4px; color: #000;">${titleStr}</div>
                        <div style="display: inline-block; border: 2px solid #000; color: #000; font-size: 13px; font-weight: 900; padding: 2px 8px; border-radius: 4px; margin-top: 5px;">
                            ĐỢT TIẾP NHẬN: ${totalPets} BÉ (${ticketNumbers})
                        </div>
                        <div style="font-size: 11px; margin-top: 3px; font-family: monospace; font-weight: 800; color: #000;">Mã Đợt: ${batchCode}</div>
                        <div style="font-size: 10px; font-weight: 700; color: #000;">Ngày: ${dateStr}</div>
                    </div>

                    <div style="border-bottom: 1px dashed #000; padding-bottom: 6px; margin-bottom: 8px; font-size: 12px;">
                        <div><strong>Khách hàng:</strong> <span style="font-weight: 800; font-size: 13px;">${customerName}</span></div>
                        <div><strong>Điện thoại:</strong> <span style="font-weight: 800;">${customerPhone}</span></div>
                    </div>

                    <div style="margin-bottom: 6px;">
                        <div style="font-weight: 900; text-transform: uppercase; font-size: 11px; margin-bottom: 5px; color: #000;">
                            CHI TIẾT DỊCH VỤ TỪNG BÉ (${totalPets} BÉ):
                        </div>
                        ${petsSectionsHtml}
                    </div>

                    <div style="border-top: 2px dashed #000; padding-top: 6px; margin-top: 6px; border-bottom: 2px dashed #000; padding-bottom: 6px; margin-bottom: 8px;">
                        <div style="display: flex; justify-content: space-between; font-size: 11.5px; margin-bottom: 2px;">
                            <span>Tổng số lượng bé:</span>
                            <strong style="font-weight: 900;">${totalPets} bé</strong>
                        </div>
                        <div style="display: flex; justify-content: space-between; font-size: 13px; font-weight: 900; color: #000; margin-top: 4px; padding-top: 4px; border-top: 1px solid #000;">
                            <span style="font-size: 13px;">TỔNG CỘNG ĐỢT NÀY:</span>
                            <span style="font-size: 16px; font-family: monospace; font-weight: 900;">${formatMoney(grandFinal)}</span>
                        </div>
                        <div style="display: flex; justify-content: space-between; font-size: 11px; margin-top: 3px;">
                            <span>Trạng thái:</span>
                            <strong style="font-weight: 800;">${paymentLine}</strong>
                        </div>
                    </div>

                    ${type === 'intake' ? `
                        <div style="display: flex; justify-content: space-between; margin-top: 10px; margin-bottom: 25px; text-align: center; font-size: 11px; font-weight: 800;">
                            <div style="width: 48%;">
                                <strong>NV Tiếp Nhận</strong><br>
                                <span style="font-size: 9px; font-weight: normal;">(Ký & họ tên)</span>
                                <div style="height: 35px;"></div>
                                <div style="border-top: 1px dotted #000; padding-top: 2px;">${firstTicket.staff_receiver || '...................'}</div>
                            </div>
                            <div style="width: 48%;">
                                <strong>Khách Gửi Bé</strong><br>
                                <span style="font-size: 9px; font-weight: normal;">(Ký xác nhận)</span>
                                <div style="height: 35px;"></div>
                                <div style="border-top: 1px dotted #000; padding-top: 2px;">${customerName || '...................'}</div>
                            </div>
                        </div>
                        <div style="text-align: center; font-size: 10px; font-weight: 700; color: #000; margin-top: 8px; border-top: 1px dashed #000; padding-top: 6px;">
                            <div>Quý khách vui lòng kiểm tra phụ kiện & giữ phiếu đối chiếu khi đón bé!</div>
                            <div style="font-weight: 900; margin-top: 2px;">Xin cảm ơn Quý khách! 💖</div>
                        </div>
                    ` : `
                        <div style="text-align: center; font-size: 10px; font-weight: 700; color: #000; margin-top: 8px;">
                            <div>Cảm ơn Quý khách đã tin tưởng & chăm sóc các bé tại Mastercare!</div>
                            <div style="font-weight: 900; margin-top: 2px;">Chúc các bé luôn khỏe mạnh & hẹn gặp lại! ❤️</div>
                        </div>
                    `}
                </div>
            `;
        }
        window.generateBatchConsolidatedTicketHtml = generateBatchConsolidatedTicketHtml;

        async function printBatchPetServiceTickets(ticketList, type = 'intake', consolidated = true) {
            if (!Array.isArray(ticketList) || ticketList.length === 0) {
                alert('Không có phiếu nào để in hàng loạt');
                return;
            }

            let fullTickets = ticketList.map(item => {
                if (typeof item === 'object' && item.ticket_number && item.customer_name) {
                    return item;
                }
                const found = (allPetServiceTickets || []).find(t => t.id === (item.id || item));
                return found || item;
            });

            let pagesHtml = '';
            if (consolidated) {
                const ticketInner = generateBatchConsolidatedTicketHtml(fullTickets, type);
                pagesHtml = `
                    <div class="thermal-ticket-page" style="width: 72mm; max-width: 72mm; margin: 0 auto; color: #000; padding: 4px 0;">
                        ${ticketInner}
                    </div>
                `;
            } else {
                pagesHtml = fullTickets.map((t, idx) => {
                    const isLast = idx === fullTickets.length - 1;
                    const pageBreakStyle = isLast ? 'page-break-after: auto; break-after: auto;' : 'page-break-after: always; break-after: page;';
                    const ticketInner = generateSinglePetTicketHtml(t, type);
                    return `
                        <div class="thermal-ticket-page" style="${pageBreakStyle} width: 72mm; max-width: 72mm; margin: 0 auto; color: #000; padding: 4px 0;">
                            ${ticketInner}
                        </div>
                    `;
                }).join('');
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
                    <title>In Hàng Loạt Phiếu Spa (${fullTickets.length} Bé)</title>
                    <style>
                        @page { size: auto; margin: 0mm; }
                        body { margin: 0; padding: 0; background: #fff; color: #000; }
                        .thermal-ticket-page {
                            page-break-after: always !important;
                            break-after: page !important;
                            display: block;
                        }
                        .thermal-ticket-page:last-child {
                            page-break-after: auto !important;
                            break-after: auto !important;
                        }
                    </style>
                </head>
                <body>
                    ${pagesHtml}
                </body>
                </html>
            `);
            doc.close();

            setTimeout(() => {
                try {
                    iframe.contentWindow.focus();
                    iframe.contentWindow.print();
                } catch(e) {
                    console.error('Lỗi in hàng loạt phiếu:', e);
                }
            }, 450);
        }
        window.printBatchPetServiceTickets = printBatchPetServiceTickets;

