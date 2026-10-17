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
            const suppDebt = allSupp.reduce((sum, c) => sum + (c.total_debt !== undefined ? c.total_debt : (c.debt || 0)), 0);
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
                    tbodyCust.innerHTML = '<tr><td colspan="9" class="p-6 text-center text-gray-400">Không tìm thấy khách hàng nào</td></tr>';
                } else {
                    tbodyCust.innerHTML = filteredCust.map((c, idx) => {
                        const code = c.code || ('KH' + String(c.id).padStart(4, '0'));
                        const safeName = escapeJs(c.name || '');
                        const petCount = c.pets_count || c.pet_count || 0;
                        const groupBadge = c.group_name || (c.segment_name)
                            ? `<span class="bg-indigo-50 text-indigo-700 font-bold px-2 py-0.5 rounded border border-indigo-200 text-[11px]">${c.group_name || c.segment_name}</span>`
                            : `<span class="text-gray-400 italic text-[11px]">Mặc định</span>`;
                        const debtStyle = c.debt > 0 ? 'text-rose-600 font-bold' : 'text-gray-400';
                        const spaBal = Number(c.spa_wallet_balance || 0);
                        const spaBalHtml = spaBal > 0
                            ? `<span class="font-bold text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200">${formatMoney(spaBal)}</span>`
                            : `<span class="text-gray-400 font-mono">0 đ</span>`;

                        return `
                        <tr class="card-row card-row-anim text-xs select-none" style="--row-idx: ${idx};">
                            <td class="p-2.5 font-mono font-bold text-sky-700">${code}</td>
                            <td class="p-2.5 font-bold text-slate-800">${c.name}</td>
                            <td class="p-2.5 font-mono text-gray-600">${c.phone || '<span class="text-gray-300">---</span>'}</td>
                            <td class="p-2.5 text-gray-500">${c.address || '<span class="text-gray-300">---</span>'}</td>
                            <td class="p-2.5 text-center">
                                <button onclick="openCustomerPetsModal(${c.id}, '${safeName}')" class="px-2 py-0.5 rounded font-bold text-[11px] bg-pink-50 hover:bg-pink-100 text-pink-700 border border-pink-200 shadow-sm transition">
                                    🐾 ${petCount} bé
                                </button>
                            </td>
                            <td class="p-2.5 text-center">${groupBadge}</td>
                            <td class="p-2.5 text-right font-mono">${spaBalHtml}</td>
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
                    tbodySupp.innerHTML = filteredSupp.map((c, idx) => {
                        const code = c.code || ('NCC' + String(c.id).padStart(4, '0'));
                        const debtCompany = Number(c.debt_company ?? c.initial_debt_company ?? 0);
                        const debtPersonal = Number(c.debt_personal ?? c.initial_debt_personal ?? 0);
                        const totalDebt = c.total_debt !== undefined ? Number(c.total_debt) : (c.debt !== undefined ? Number(c.debt) : (debtCompany + debtPersonal));
                        const debtStyle = totalDebt > 0 ? 'text-amber-700 font-bold' : 'text-gray-400';

                        return `
                        <tr class="card-row card-row-anim text-xs select-none" style="--row-idx: ${idx};">
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

        function addPhoneField(value = '') {
            const wrap = document.getElementById('contact-form-phones-wrap');
            const row = document.createElement('div');
            row.className = 'flex items-center gap-1.5';
            row.innerHTML = `
                <input type="text" class="contact-phone-input border p-2 rounded w-full" placeholder="VD: 0908123456" value="${(value || '').replace(/"/g, '&quot;')}">
                <button type="button" onclick="this.parentElement.remove()" class="text-rose-500 hover:text-rose-700 font-bold px-1.5">✕</button>
            `;
            wrap.appendChild(row);
        }
        function getContactFormPhones() {
            return Array.from(document.querySelectorAll('#contact-form-phones-wrap .contact-phone-input'))
                .map(i => i.value.trim()).filter(v => v);
        }
        function setContactFormPhones(phoneStr) {
            const wrap = document.getElementById('contact-form-phones-wrap');
            wrap.innerHTML = '';
            const phones = (phoneStr || '').split(',').map(p => p.trim()).filter(p => p);
            if (phones.length === 0) phones.push('');
            phones.forEach(p => addPhoneField(p));
        }

        function openContactModal(defaultType = 'customer') {
            document.getElementById('contact-form-id').value = '';
            document.getElementById('modal-contact-title').textContent = defaultType === 'customer' ? 'Thêm Khách Hàng Mới' : 'Thêm Nhà Cung Cấp Mới';
            const typeSelect = document.getElementById('contact-form-type');
            if (typeSelect) typeSelect.value = defaultType;
            document.getElementById('contact-form-name').value = '';
            setContactFormPhones('');
            const emailEl = document.getElementById('contact-form-email');
            if (emailEl) emailEl.value = '';
            document.getElementById('contact-form-address').value = '';
            const debtEl = document.getElementById('contact-form-debt');
            if (debtEl) debtEl.value = '0';
            const debtCompEl = document.getElementById('contact-form-debt-company');
            if (debtCompEl) debtCompEl.value = '0';
            const debtPersEl = document.getElementById('contact-form-debt-personal');
            if (debtPersEl) debtPersEl.value = '0';

            toggleContactFormDebtFields(defaultType);
            
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

        function onContactTypeChange() {
            const type = document.getElementById('contact-form-type')?.value || 'customer';
            toggleContactFormDebtFields(type);
            const segSelect = document.getElementById('contact-form-segment');
            if (segSelect) {
                if (type === 'customer') {
                    segSelect.parentElement.classList.remove('hidden');
                } else {
                    segSelect.parentElement.classList.add('hidden');
                }
            }
        }

        function toggleContactFormDebtFields(type) {
            const suppDebtBox = document.getElementById('contact-supplier-split-debt');
            const custDebtBox = document.getElementById('contact-customer-single-debt');
            const debtLabel = document.getElementById('contact-debt-label');
            const isSupp = (type === 'supplier');

            if (debtLabel) {
                debtLabel.textContent = isSupp ? 'Công Nợ Đầu Kỳ / Nhập Tay Phân Theo Quỹ (đ):' : 'Công Nợ Đầu Kỳ (đ):';
            }
            if (suppDebtBox) {
                if (isSupp) suppDebtBox.classList.remove('hidden');
                else suppDebtBox.classList.add('hidden');
            }
            if (custDebtBox) {
                if (isSupp) custDebtBox.classList.add('hidden');
                else custDebtBox.classList.remove('hidden');
            }
        }

        function editContact(id) {
            const c = (allContacts || []).find(item => item.id === id) || (typeof posContacts !== 'undefined' ? (posContacts || []).find(item => item.id === id) : null);
            if (!c) return;
            document.getElementById('contact-form-id').value = c.id;
            document.getElementById('modal-contact-title').textContent = c.type === 'customer' ? 'Sửa Thông Tin Khách Hàng' : 'Sửa Thông Tin Nhà Cung Cấp';
            const typeSelect = document.getElementById('contact-form-type');
            if (typeSelect) typeSelect.value = c.type;
            document.getElementById('contact-form-name').value = c.name;
            setContactFormPhones(c.phone || '');
            const emailEl = document.getElementById('contact-form-email');
            if (emailEl) emailEl.value = c.email || '';
            document.getElementById('contact-form-address').value = c.address || '';
            const debtEl = document.getElementById('contact-form-debt');
            if (debtEl) debtEl.value = c.debt || 0;
            const debtCompEl = document.getElementById('contact-form-debt-company');
            if (debtCompEl) debtCompEl.value = c.initial_debt_company || 0;
            const debtPersEl = document.getElementById('contact-form-debt-personal');
            if (debtPersEl) debtPersEl.value = c.initial_debt_personal || 0;

            toggleContactFormDebtFields(c.type);
            
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
        window.closeContactModal = closeContactModal;

        async function submitContactForm() {
            const id = document.getElementById('contact-form-id').value;
            const type = document.getElementById('contact-form-type').value;
            const name = document.getElementById('contact-form-name').value.trim();
            const phone = getContactFormPhones().join(', ');
            const email = (document.getElementById('contact-form-email')?.value || '').trim();
            const address = document.getElementById('contact-form-address').value.trim();
            const segVal = document.getElementById('contact-form-segment')?.value;
            const segment_id = segVal ? parseInt(segVal) : null;
            const debtVal = document.getElementById('contact-form-debt')?.value;
            const debt = debtVal !== undefined && debtVal !== '' ? parseFloat(debtVal) : 0.0;
            const debtCompVal = document.getElementById('contact-form-debt-company')?.value;
            const initial_debt_company = debtCompVal !== undefined && debtCompVal !== '' ? parseFloat(debtCompVal) : 0.0;
            const debtPersVal = document.getElementById('contact-form-debt-personal')?.value;
            const initial_debt_personal = debtPersVal !== undefined && debtPersVal !== '' ? parseFloat(debtPersVal) : 0.0;

            if (!name) {
                alert('Vui lòng nhập họ tên hoặc tên đơn vị đối tác!');
                return;
            }

            try {
                if (id) {
                    const res = await fetch(`/api/contacts/${id}`, {
                        method: 'PUT',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ 
                            name, phone, email, address, segment_id, debt,
                            initial_debt_company, initial_debt_personal 
                        })
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
                        body: JSON.stringify({ 
                            type, name, phone, email, address, segment_id, debt,
                            initial_debt_company, initial_debt_personal 
                        })
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
                // Nếu vừa sửa đúng khách hàng đang chọn trong POS, cập nhật lại info hiển thị
                if (id && typeof getActiveTab === 'function') {
                    const tab = getActiveTab();
                    if (tab && tab.customer && String(tab.customer.id) === String(id)) {
                        try {
                            const r = await fetch(`/api/contacts/${id}`);
                            const fresh = await r.json();
                            tab.customer = { ...tab.customer, ...fresh };
                            if (typeof updateCustomerUI === 'function') updateCustomerUI(tab.customer);
                        } catch (e) {}
                    }
                }
            } catch (e) {
                console.error("submitContactForm err:", e);
                alert("Lỗi kết nối máy chủ");
            }
        }

        async function deleteContact(id) {
            const c = (allContacts || []).find(item => item.id === id);
            const name = c ? c.name : 'đối tác này';
            const role = c ? (c.type === 'customer' ? 'khách hàng' : 'nhà cung cấp') : 'đối tác';

            let confirmed = false;
            if (typeof window.showConfirmModal === 'function') {
                confirmed = await window.showConfirmModal({
                    title: `Xác Nhận Xóa ${c ? (c.type === 'customer' ? 'Khách Hàng' : 'Nhà Cung Cấp') : 'Đối Tác'}`,
                    message: `Bạn có chắc chắn muốn xóa ${role} "${name}" không?`,
                    subMessage: 'Dữ liệu đối tác sẽ bị xóa vĩnh viễn khỏi danh bạ nếu không còn công nợ hoặc giao dịch liên quan.',
                    confirmText: 'Xác Nhận Xóa',
                    cancelText: 'Hủy bỏ',
                    type: 'danger',
                    icon: '🗑️'
                });
            } else if (typeof window.customConfirm === 'function') {
                confirmed = await window.customConfirm(`Bạn có chắc chắn muốn xóa ${role} "${name}"?`, `Xóa ${role}`, { type: 'danger', okText: 'Xóa' });
            } else {
                confirmed = confirm(`Bạn có chắc chắn muốn xóa đối tác "${name}"?`);
            }

            if (!confirmed) return;
            try {
                const res = await fetch(`/api/contacts/${id}`, { method: 'DELETE' });
                if (!res.ok) {
                    const err = await res.json();
                    alert(err.detail || 'Không thể xóa');
                    return;
                }
                if (typeof showToast === 'function') showToast(`Đã xóa ${name} thành công`, 'success');
                await loadContacts();
            } catch (e) {
                alert("Lỗi kết nối máy chủ");
            }
        }

        async function openPayDebtModal(id, orderId = null) {
            let c = (allContacts || []).find(item => item.id === id) || (typeof posContacts !== 'undefined' ? (posContacts || []).find(item => item.id === id) : null);
            if (!c) {
                try {
                    const res = await fetch(`/api/contacts/${id}`);
                    if (res.ok) c = await res.json();
                } catch (e) {
                    console.error('Lỗi tải contact:', e);
                }
            }
            if (!c) return;
            document.getElementById('pay-debt-contact-id').value = c.id;
            const orderIdEl = document.getElementById('pay-debt-order-id');
            if (orderIdEl) orderIdEl.value = orderId || '';
            const titleEl = document.getElementById('modal-pay-debt-title');
            if (titleEl) {
                titleEl.textContent = orderId ? 'Thu Nợ Hóa Đơn' : 'Thanh Toán Công Nợ';
            }
            document.getElementById('pay-debt-contact-name').textContent = `${c.name} (${c.type === 'customer' ? 'Khách hàng' : 'Nhà cung cấp'})`;
            document.getElementById('pay-debt-current').textContent = formatMoney(c.debt);
            document.getElementById('pay-debt-amount').value = c.debt;
            document.getElementById('pay-debt-note').value = '';
            const dateEl = document.getElementById('pay-debt-date');
            if (dateEl) {
                dateEl.value = (typeof getLocalTodayDateStr === 'function') ? getLocalTodayDateStr() : new Intl.DateTimeFormat('en-CA').format(new Date());
            }

            const fundWrap = document.getElementById('pay-debt-fund-wrap');
            if (fundWrap) {
                fundWrap.style.display = c.type === 'supplier' ? 'block' : 'none';
            }

            // Nạp danh sách tài khoản thanh toán
            const accSelect = document.getElementById('pay-debt-account');
            if (accSelect) {
                try {
                    const res = await fetch('/api/payment-accounts');
                    if (res.ok) {
                        const accounts = await res.json();
                        accSelect.innerHTML = accounts
                            .filter(a => a.is_active)
                            .map(a => `<option value="${a.id}" ${a.is_default ? 'selected' : ''}>${a.name} (${a.code})${a.account_type === 'bank' ? ' - NH' : ' - Tiền mặt'}</option>`)
                            .join('');
                    }
                } catch (e) {
                    console.error('Lỗi nạp payment accounts:', e);
                }
            }

            document.getElementById('modal-pay-debt').classList.remove('hidden');
        }

        function closePayDebtModal() {
            document.getElementById('modal-pay-debt').classList.add('hidden');
        }
        window.closePayDebtModal = closePayDebtModal;

        async function submitPayDebt() {
            const id = document.getElementById('pay-debt-contact-id').value;
            const amount = parseFloat(document.getElementById('pay-debt-amount').value) || 0;
            const note = document.getElementById('pay-debt-note').value.trim();
            const accEl = document.getElementById('pay-debt-account');
            const account_id = accEl ? (parseInt(accEl.value) || null) : null;
            const fundEl = document.querySelector('input[name="pay-debt-fund"]:checked');
            const fund_source = fundEl ? fundEl.value : 'COMPANY';
            const payment_date = document.getElementById('pay-debt-date')?.value || null;
            const orderIdVal = document.getElementById('pay-debt-order-id')?.value;
            const order_id = orderIdVal ? (parseInt(orderIdVal) || null) : null;

            if (amount <= 0) {
                alert('Số tiền thanh toán phải lớn hơn 0!');
                return;
            }

            try {
                const res = await fetch(`/api/contacts/${id}/pay-debt`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ amount, note, account_id, fund_source, payment_date, order_id })
                });
                if (!res.ok) {
                    const err = await res.json();
                    alert(err.detail || 'Lỗi khi thanh toán công nợ');
                    return;
                }
                closePayDebtModal();
                await loadContacts();
                if (typeof loadCashbook === 'function') loadCashbook();
                if (typeof applyOrdersFilters === 'function') applyOrdersFilters();
                if (typeof window.applyOrdersFilters === 'function' && window.applyOrdersFilters !== applyOrdersFilters) window.applyOrdersFilters();
                if (typeof loadOrdersList === 'function') loadOrdersList();
                if (typeof window.loadOrdersList === 'function' && window.loadOrdersList !== loadOrdersList) window.loadOrdersList();
                if (typeof currentViewedOrderCode !== 'undefined' && currentViewedOrderCode) {
                    if (typeof viewOrderDetailModal === 'function') {
                        const viewModal = document.getElementById('modal-order-view');
                        if (viewModal && !viewModal.classList.contains('hidden')) {
                            viewOrderDetailModal(currentViewedOrderCode);
                        }
                    }
                }
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

                // Điểm & Ví Spa
                const elPointsWrap = document.getElementById('detail-contact-points-wrap');
                const elWalletWrap = document.getElementById('detail-contact-spa-wallet-wrap');
                const elPoints = document.getElementById('detail-contact-points');
                const elWallet = document.getElementById('detail-contact-spa-wallet');
                const secWalletHist = document.getElementById('detail-contact-spa-wallet-section');
                const tbWalletHist = document.getElementById('detail-contact-spa-wallet-history');

                if (data.type === 'customer') {
                    if (elPointsWrap) elPointsWrap.classList.remove('hidden');
                    if (elWalletWrap) elWalletWrap.classList.remove('hidden');
                    if (secWalletHist) secWalletHist.classList.remove('hidden');
                    if (elPoints) elPoints.textContent = data.points || 0;
                    if (elWallet) elWallet.textContent = formatMoney(data.spa_wallet_balance || 0);

                    if (tbWalletHist) {
                        if (data.spa_wallet_history && data.spa_wallet_history.length > 0) {
                            tbWalletHist.innerHTML = data.spa_wallet_history.map(r => {
                                const isTopup = r.type === 'topup';
                                const isSpend = r.type === 'spend';
                                const typeBadge = isTopup
                                    ? '<span class="px-2 py-0.5 rounded text-[11px] font-bold bg-emerald-100 text-emerald-800">⚡ Nạp gói</span>'
                                    : (isSpend ? '<span class="px-2 py-0.5 rounded text-[11px] font-bold bg-rose-100 text-rose-800">🛒 Chi tiêu</span>' : '<span class="px-2 py-0.5 rounded text-[11px] font-bold bg-sky-100 text-sky-800">Hoàn tiền</span>');
                                const sign = isTopup ? '+' : (isSpend ? '-' : '');
                                const amtColor = isTopup ? 'text-emerald-600 font-bold' : (isSpend ? 'text-rose-600 font-bold' : 'text-sky-600 font-bold');
                                const noteStr = r.note || (isTopup && r.package_name ? `Gói ${r.package_name}` : (r.order_code ? `Đơn ${r.order_code}` : '-'));

                                return `
                                    <tr class="border-b hover:bg-emerald-50/50">
                                        <td class="p-2 text-slate-500 font-mono">${formatDateTime(r.created_at) || '-'}</td>
                                        <td class="p-2">${typeBadge}</td>
                                        <td class="p-2 text-right font-mono ${amtColor}">${sign}${formatMoney(r.amount)}</td>
                                        <td class="p-2 text-right font-mono font-bold text-slate-700">${formatMoney(r.balance_after)}</td>
                                        <td class="p-2 text-slate-600">${noteStr}</td>
                                    </tr>
                                `;
                            }).join('');
                        } else {
                            tbWalletHist.innerHTML = '<tr><td colspan="5" class="p-3 text-center text-slate-400">Chưa có biến động ví Spa</td></tr>';
                        }
                    }
                } else {
                    if (elPointsWrap) elPointsWrap.classList.add('hidden');
                    if (elWalletWrap) elWalletWrap.classList.add('hidden');
                    if (secWalletHist) secWalletHist.classList.add('hidden');
                }

                const tbHist = document.getElementById('detail-contact-history');
                if (data.history && data.history.length > 0) {
                    tbHist.innerHTML = data.history.map(h => `
                        <tr class="border-b hover:bg-gray-50">
                            <td class="p-2 font-mono font-bold text-sky-700">${h.code}</td>
                            <td class="p-2 text-gray-500">${formatDateTime(h.created_at) || '-'}</td>
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
                            <td class="p-2 text-gray-500">${formatDateTime(c.created_at) || '-'}</td>
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
                const selectType = document.getElementById('import-contact-type') || document.getElementById('import-contacts-type');
                if (selectType) {
                    selectType.value = currentContactTab || 'customer';
                }
                modal.classList.remove('hidden');
            }
        }

        function closeImportContactsModal() {
            const modal = document.getElementById('modal-contacts-import');
            if (modal) modal.classList.add('hidden');
        }
        window.closeImportContactsModal = closeImportContactsModal;

        function downloadContactTemplate() {
            const type = (document.getElementById('import-contact-type') || document.getElementById('import-contacts-type'))?.value || 'customer';
            downloadWithAuth(`/api/contacts/template-excel?type=${encodeURIComponent(type)}&_t=${Date.now()}`, type === 'customer' ? 'Mau_Khach_Hang.xlsx' : 'Mau_Nha_Cung_Cap.xlsx');
        }

        async function submitImportContacts() {
            const type = (document.getElementById('import-contact-type') || document.getElementById('import-contacts-type'))?.value || 'customer';
            const fileInput = document.getElementById('import-contact-file') || document.getElementById('import-contacts-file');
            if (!fileInput || !fileInput.files || fileInput.files.length === 0) {
                alert('Vui lòng chọn file Excel để nhập!');
                return;
            }

            const formData = new FormData();
            formData.append('file', fileInput.files[0]);

            const btn = document.getElementById('btn-do-import-contacts') || document.getElementById('btn-submit-import-contacts');
            try {
                if (btn) { btn.disabled = true; btn.textContent = 'Đang xử lý...'; }

                const res = await fetch(`/api/contacts/import-excel?type=${type}`, {
                    method: 'POST',
                    body: formData
                });
                let result;
                try {
                    result = await res.json();
                } catch (_) {
                    const text = await res.text();
                    result = { detail: text || `HTTP ${res.status}` };
                }
                if (!res.ok) {
                    alert('Lỗi import: ' + (result.detail || 'Không thể nhập file'));
                    return;
                }
                alert(result.message || `Đã nhập thành công đối tác!`);
                closeImportContactsModal();
                fileInput.value = '';
                await loadContacts();
            } catch (e) {
                console.error("submitImportContacts err:", e);
                alert("Lỗi kết nối máy chủ: " + (e.message || e));
            } finally {
                if (btn) { btn.disabled = false; btn.textContent = '🚀 Bắt Đầu Import'; }
            }
        }

        function exportContactsExcel() {
            const type = currentContactTab || 'customer';
            downloadWithAuth(`/api/contacts/export-excel?type=${type}`, `Danh_Ba_${type}.xlsx`);
        }

        function closeContactDetailModal() {
            document.getElementById('modal-contact-detail').classList.add('hidden');
        }
        window.closeContactDetailModal = closeContactDetailModal;
