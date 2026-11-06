        // ==========================================
        // QUẢN LÝ THÚ CƯNG THEO KHÁCH HÀNG & XEM NHANH KHÁCH HÀNG
        // ==========================================
        let currentPetCustomerId = null;
        let currentQuickViewCustomerId = null;

        async function openQuickCustomerInfoModal(customerId, customerName = '') {
            if (!customerId) return;
            currentQuickViewCustomerId = customerId;

            const modal = document.getElementById('modal-quick-customer-info');
            if (!modal) return;
            modal.classList.remove('hidden');

            const qcName = document.getElementById('qc-name');
            const qcPhone = document.getElementById('qc-phone');
            const qcWallet = document.getElementById('qc-wallet');
            const qcPoints = document.getElementById('qc-points');
            const qcSegment = document.getElementById('qc-segment');
            const qcAddress = document.getElementById('qc-address');
            const qcNote = document.getElementById('qc-note');
            const qcPetsList = document.getElementById('qc-pets-list');
            const qcSpaHistory = document.getElementById('qc-spa-history');
            const qcPetCount = document.getElementById('qc-pet-count');

            if (qcName) qcName.textContent = customerName || 'Đang tải...';
            if (qcPhone) qcPhone.textContent = '...';
            if (qcWallet) qcWallet.textContent = '... đ';
            if (qcPoints) qcPoints.textContent = '... điểm';
            if (qcPetsList) qcPetsList.innerHTML = '<div class="p-3 text-center text-slate-400">Đang tải thú cưng...</div>';
            if (qcSpaHistory) qcSpaHistory.innerHTML = '<div class="p-3 text-center text-slate-400">Đang tải lịch sử...</div>';

            try {
                const res = await fetch(`/api/contacts/${customerId}`);
                if (!res.ok) throw new Error('Không tải được thông tin khách');
                const data = await res.json();

                if (qcName) qcName.textContent = data.name || customerName || 'Khách lẻ';
                const phoneClean = data.phone || '';
                const phoneMasked = typeof formatMaskedPhone === 'function' ? formatMaskedPhone(phoneClean) : phoneClean;
                if (qcPhone) qcPhone.textContent = phoneMasked || 'Chưa có SĐT';

                if (qcWallet) qcWallet.textContent = formatMoney(data.spa_wallet_balance || 0);
                if (qcPoints) qcPoints.textContent = `${data.points || 0} điểm`;
                if (qcSegment) qcSegment.textContent = `Hạng: ${data.segment_name || 'Khách Chuẩn'}${data.segment_discount ? ` (Giảm ${data.segment_discount}%)` : ''}`;
                if (qcAddress) qcAddress.textContent = data.address || '(Chưa có địa chỉ)';
                if (qcNote) qcNote.textContent = data.note || '(Không có ghi chú)';

                // Render danh sách thú cưng
                const pets = data.pets || [];
                if (qcPetCount) qcPetCount.textContent = pets.length;
                if (qcPetsList) {
                    if (pets.length === 0) {
                        qcPetsList.innerHTML = '<div class="p-3 text-center text-slate-400">Khách chưa đăng ký thú cưng nào.</div>';
                    } else {
                        qcPetsList.innerHTML = pets.map(p => `
                            <div class="flex items-center justify-between p-2 hover:bg-slate-50 transition">
                                <div class="flex items-center gap-2">
                                    <span class="text-base">${p.species === 'Mèo' ? '🐱' : '🐶'}</span>
                                    <div>
                                        <div class="font-bold text-slate-800 text-xs">${escapeSpaHtml(p.name)} <span class="font-normal text-slate-500">(${escapeSpaHtml(p.breed || p.species || 'Cún')})</span></div>
                                        <div class="text-xs text-slate-400">Màu: ${escapeSpaHtml(p.color || '-')} | Cân nặng: <strong class="text-sky-700">${p.weight ? p.weight + ' kg' : '-'}</strong></div>
                                    </div>
                                </div>
                                <span class="text-xs px-2 py-0.5 rounded font-mono font-bold bg-sky-50 text-sky-700 border border-sky-200">#${p.id}</span>
                            </div>
                        `).join('');
                    }
                }

                // Render lịch sử dịch vụ Spa của khách
                if (qcSpaHistory) {
                    const custTickets = (allPetServiceTickets || []).filter(t => t.customer_id === customerId).slice(0, 5);
                    if (custTickets.length === 0) {
                        qcSpaHistory.innerHTML = '<div class="p-3 text-center text-slate-400">Chưa có lịch sử làm Spa hôm nay.</div>';
                    } else {
                        qcSpaHistory.innerHTML = custTickets.map(t => `
                            <div class="flex items-center justify-between p-2 hover:bg-slate-50 transition text-xs">
                                <div>
                                    <div class="font-bold text-slate-800">
                                        <span class="font-mono text-sky-700 font-bold">${t.code || '#' + t.id}</span> · ${escapeSpaHtml(t.pet_name || 'Bé cưng')}
                                    </div>
                                    <div class="text-xs text-slate-500 mt-0.5">${escapeSpaHtml(t.service_type || 'Spa')} · ${t.ticket_date || ''}</div>
                                </div>
                                <div class="text-right">
                                    <div class="font-mono font-bold text-slate-800">${formatMoney(t.price || 0)}</div>
                                    <span class="text-xs px-1.5 py-0.2 rounded font-bold ${t.status === 'completed' ? 'bg-emerald-100 text-emerald-800' : 'bg-sky-100 text-sky-800'}">${t.status}</span>
                                </div>
                            </div>
                        `).join('');
                    }
                }

                // Nút liên kết mở hồ sơ thú cưng
                const btnAddPet = document.getElementById('btn-qc-add-pet');
                if (btnAddPet) {
                    btnAddPet.onclick = function() {
                        closeQuickCustomerInfoModal();
                        openCustomerPetsModal(customerId, data.name || customerName);
                    };
                }

                // Nút xem lịch sử mua hàng POS
                const btnViewPurchases = document.getElementById('btn-qc-view-purchase-history');
                if (btnViewPurchases) {
                    btnViewPurchases.onclick = function() {
                        closeQuickCustomerInfoModal();
                        if (typeof window.openPurchaseHistoryModal === 'function') {
                            window.openPurchaseHistoryModal(customerId);
                        } else {
                            const modalHist = document.getElementById('modal-purchase-history');
                            if (modalHist) {
                                modalHist.classList.remove('hidden');
                                if (typeof loadPurchaseHistory === 'function') loadPurchaseHistory(customerId);
                            }
                        }
                    };
                }
            } catch(e) {
                console.error("Lỗi xem nhanh khách hàng:", e);
                if (qcName) qcName.textContent = customerName || 'Khách lẻ';
            }
        }
        window.openQuickCustomerInfoModal = openQuickCustomerInfoModal;

        function closeQuickCustomerInfoModal() {
            const modal = document.getElementById('modal-quick-customer-info');
            if (modal) modal.classList.add('hidden');
            currentQuickViewCustomerId = null;
        }
        window.closeQuickCustomerInfoModal = closeQuickCustomerInfoModal;

        var currentCustomerPetsCache = [];

        function resetPetForm() {
            const editIdEl = document.getElementById('editing-pet-id');
            if (editIdEl) editIdEl.value = '';
            const titleEl = document.getElementById('pet-form-title');
            if (titleEl) titleEl.textContent = '➕ Thêm Thú Cưng Mới:';
            const btnSave = document.getElementById('btn-save-pet');
            if (btnSave) btnSave.textContent = '+ Thêm Bé';
            const btnCancel = document.getElementById('btn-cancel-edit-pet');
            if (btnCancel) btnCancel.classList.add('hidden');
            if (document.getElementById('new-pet-name')) document.getElementById('new-pet-name').value = '';
            if (document.getElementById('new-pet-weight')) document.getElementById('new-pet-weight').value = '';
            if (document.getElementById('new-pet-note')) document.getElementById('new-pet-note').value = '';
        }
        window.resetPetForm = resetPetForm;

        function startEditPet(petId) {
            const pet = (currentCustomerPetsCache || []).find(x => x.id === petId);
            if (!pet) return;
            const editIdEl = document.getElementById('editing-pet-id');
            if (editIdEl) editIdEl.value = String(pet.id);
            const titleEl = document.getElementById('pet-form-title');
            if (titleEl) titleEl.textContent = `✏️ Đang sửa hồ sơ bé: ${pet.name}`;
            const btnSave = document.getElementById('btn-save-pet');
            if (btnSave) btnSave.textContent = '💾 Lưu Cập Nhật';
            const btnCancel = document.getElementById('btn-cancel-edit-pet');
            if (btnCancel) btnCancel.classList.remove('hidden');

            const nameEl = document.getElementById('new-pet-name');
            if (nameEl) { nameEl.value = pet.name || ''; nameEl.focus(); }

            const spEl = document.getElementById('new-pet-species');
            if (spEl && pet.species) {
                spEl.value = pet.species;
                if (typeof filterPetBreedOptions === 'function') filterPetBreedOptions(pet.species);
            }

            const ensureSelectValue = (selId, val) => {
                const sel = document.getElementById(selId);
                if (!sel || !val) return;
                if (![...sel.options].some(o => o.value === val)) {
                    const opt = document.createElement('option');
                    opt.value = val;
                    opt.textContent = val;
                    sel.appendChild(opt);
                }
                sel.value = val;
            };
            ensureSelectValue('new-pet-breed', pet.breed || '');
            ensureSelectValue('new-pet-color', pet.color || '');

            if (document.getElementById('new-pet-weight')) {
                document.getElementById('new-pet-weight').value = pet.weight ? String(pet.weight) : '';
            }
            if (document.getElementById('new-pet-note')) {
                document.getElementById('new-pet-note').value = pet.note || '';
            }
        }
        window.startEditPet = startEditPet;

        function openCustomerPetsModal(customerId, customerName) {
            currentPetCustomerId = customerId;
            const modal = document.getElementById('modal-customer-pets');
            const custNameEl = document.getElementById('pet-modal-cust-name');
            if (custNameEl) custNameEl.textContent = customerName || '';
            const titleEl = document.getElementById('modal-pets-title');
            if (titleEl) titleEl.textContent = `🐾 Hồ Sơ Thú Cưng: ${customerName}`;
            resetPetForm();
            if (modal) modal.classList.remove('hidden');
            loadCustomerPets(customerId);
        }

        function closeCustomerPetsModal() {
            const modal = document.getElementById('modal-customer-pets');
            if (modal) modal.classList.add('hidden');
            resetPetForm();
            currentPetCustomerId = null;
        }

        async function loadCustomerPets(customerId) {
            const tbody = document.getElementById('table-customer-pets');
            if (!tbody) return;
            try {
                tbody.innerHTML = '<tr><td colspan="8" class="p-4 text-center text-gray-400">Đang tải danh sách thú cưng...</td></tr>';
                const res = await fetch(`/api/contacts/${customerId}/pets`);
                const pets = await res.json();
                currentCustomerPetsCache = pets || [];
                if (pets.length === 0) {
                    tbody.innerHTML = '<tr><td colspan="8" class="p-6 text-center text-gray-400">Khách hàng này chưa có thú cưng nào. Hãy thêm bé mới bên dưới!</td></tr>';
                    return;
                }
                tbody.innerHTML = pets.map((p, idx) => `
                    <tr class="border-b hover:bg-slate-50 transition text-xs">
                        <td class="p-2.5 text-center text-gray-500">${idx + 1}</td>
                        <td class="p-2.5 font-bold text-slate-800">${p.name}</td>
                        <td class="p-2.5 text-center"><span class="px-2 py-0.5 rounded text-xs font-bold ${p.species === 'Mèo' ? 'bg-amber-100 text-amber-800' : 'bg-sky-100 text-sky-800'}">${p.species || 'Chó'}</span></td>
                        <td class="p-2.5 text-gray-700">${p.breed || '-'}</td>
                        <td class="p-2.5 text-gray-600">${p.color || '-'}</td>
                        <td class="p-2.5 text-center font-bold text-sky-700">${p.weight ? p.weight + ' kg' : '-'}</td>
                        <td class="p-2.5 text-gray-500 max-w-xs truncate" title="${(p.note || '').replace(/"/g, '&quot;')}">${p.note || '-'}</td>
                        <td class="p-2.5 text-center whitespace-nowrap space-x-1">
                            <button onclick="startEditPet(${p.id})" class="text-sky-600 hover:text-sky-800 px-2 py-1 rounded border border-sky-200 bg-sky-50/50 text-xs font-bold">✏️ Sửa</button>
                            <button onclick="deletePet(${p.id})" class="text-rose-600 hover:text-rose-800 px-2 py-1 rounded border border-rose-200 text-xs font-bold">🗑️ Xóa</button>
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
            const editingPetId = document.getElementById('editing-pet-id')?.value.trim();
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
                const url = editingPetId ? `/api/pets/${editingPetId}` : `/api/contacts/${currentPetCustomerId}/pets`;
                const method = editingPetId ? 'PUT' : 'POST';
                const res = await fetch(url, {
                    method,
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ name, species, breed, color, weight, note })
                });
                if (!res.ok) {
                    const err = await res.json();
                    alert('Lỗi lưu hồ sơ bé: ' + (err.detail || 'Không thể lưu'));
                    return;
                }
                resetPetForm();
                await loadCustomerPets(currentPetCustomerId);
                await loadContacts(); // Refresh pet count badge
                if (typeof loadAllPetsList === 'function') loadAllPetsList();
            } catch (e) {
                alert('Lỗi kết nối máy chủ');
            }
        }

        async function deletePet(petId) {
            const confirmed = typeof window.showConfirmModal === 'function'
                ? await window.showConfirmModal({
                    title: 'Xóa Thú Cưng',
                    message: 'Bạn có chắc muốn xóa hồ sơ bé thú cưng này?',
                    type: 'danger',
                    confirmText: 'Xóa Hồ Sơ',
                    cancelText: 'Hủy bỏ',
                    icon: '🐾'
                })
                : confirm('Bạn có chắc muốn xóa hồ sơ bé thú cưng này?');
            if (!confirmed) return;
            try {
                const res = await fetch(`/api/pets/${petId}`, { method: 'DELETE' });
                if (!res.ok) {
                    if (window.showToast) window.showToast('Không thể xóa thú cưng', 'error');
                    else alert('Không thể xóa thú cưng');
                    return;
                }
                if (window.showToast) window.showToast('Đã xóa thú cưng thành công!', 'success');
                if (currentPetCustomerId) await loadCustomerPets(currentPetCustomerId);
                await loadContacts();
                if (typeof loadAllPetsList === 'function') loadAllPetsList();
            } catch (e) {
                if (window.showToast) window.showToast('Lỗi kết nối', 'error');
                else alert('Lỗi kết nối');
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
            const btnGallery = document.getElementById('btn-pet-sub-gallery');
            const viewServices = document.getElementById('pet-sub-view-services');
            const viewPricing = document.getElementById('pet-sub-view-pricing');
            const viewStaff = document.getElementById('pet-sub-view-staff');
            const viewGallery = document.getElementById('pet-sub-view-gallery');

            const inactiveClass = 'px-3.5 py-1.5 font-semibold text-slate-600 hover:text-slate-900 rounded-md flex items-center gap-1.5 transition';
            const activeClass = 'px-3.5 py-1.5 font-bold rounded-md bg-white text-slate-900 shadow-xs flex items-center gap-1.5 transition';

            if (btnServices) btnServices.className = (sub === 'services' ? activeClass : inactiveClass);
            if (btnPricing) btnPricing.className = (sub === 'pricing' ? activeClass : inactiveClass);
            if (btnStaff) btnStaff.className = (sub === 'staff' ? activeClass : inactiveClass);
            if (btnGallery) btnGallery.className = (sub === 'gallery' ? activeClass : inactiveClass);

            if (viewServices) viewServices.classList.toggle('hidden', sub !== 'services');
            if (viewPricing) viewPricing.classList.toggle('hidden', sub !== 'pricing');
            if (viewStaff) viewStaff.classList.toggle('hidden', sub !== 'staff');
            if (viewGallery) viewGallery.classList.toggle('hidden', sub !== 'gallery');

            if (sub === 'services') {
                loadPetServicesList();
                loadPetServicesKPI();
            } else if (sub === 'pricing') {
                loadPetPricingList();
            } else if (sub === 'staff') {
                loadSpaStaffList();
            } else if (sub === 'gallery') {
                loadGroomingGalleryList();
            }
        }
        window.switchPetSubTab = switchPetSubTab;

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
                        <span class="px-2 py-0.5 rounded text-xs font-bold ${p.species === 'Mèo' ? 'bg-amber-100 text-amber-800' : 'bg-sky-100 text-sky-800'}">${p.species || 'Chó'}</span>
                    </td>
                    <td class="p-2.5 text-gray-700">${p.breed || '-'}</td>
                    <td class="p-2.5 text-gray-600">${p.color || '-'}</td>
                    <td class="p-2.5 text-center font-bold text-sky-700 font-mono">${p.weight ? p.weight + ' kg' : '-'}</td>
                    <td class="p-2.5 font-bold text-sky-700">${p.customer_name || '-'}</td>
                    <td class="p-2.5 font-mono text-gray-600">${formatMaskedPhone(p.customer_phone)}</td>
                    <td class="p-2.5 text-gray-500 max-w-xs truncate">${p.note || '-'}</td>
                    <td class="p-2.5 text-center space-x-1 whitespace-nowrap">
                        <button onclick="openCustomerPetsModal(${p.customer_id}, '${escapeJs(p.customer_name || '')}')" class="px-2 py-1 bg-sky-50 hover:bg-sky-100 text-sky-700 rounded border border-sky-200 text-xs font-bold">🐾 Chi tiết</button>
                        <button onclick="deletePet(${p.id})" class="px-2 py-1 bg-rose-50 hover:bg-rose-100 text-rose-600 rounded border border-rose-200 text-xs font-bold">🗑️</button>
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
        var petServiceFilterDate = 'today'; // 'today' | 'all' | 'YYYY-MM-DD'
        var petServiceFilterKpiMode = null; // null | 'uncalled' | 'not_checked_out' | 'transport'
        var petServiceDailyQuickFilter = 'all'; // 'all' | 'not_checked_out' | 'checked_out'
        var selectedSpaTicketIds = new Set();

        function formatSinglePhoneBadge(clean) {
            let formatted = clean;
            let masked = clean;
            if (clean.length === 10) {
                formatted = `${clean.slice(0, 4)} ${clean.slice(4, 7)} ${clean.slice(7)}`;
                masked = `${clean.slice(0, 4)} ••• ${clean.slice(7)}`;
            } else if (clean.length === 11) {
                formatted = `${clean.slice(0, 4)} ${clean.slice(4, 7)} ${clean.slice(7)}`;
                masked = `${clean.slice(0, 4)} •••• ${clean.slice(8)}`;
            } else if (clean.length > 6) {
                masked = `${clean.slice(0, 3)}••••${clean.slice(-3)}`;
            }

            return `
                <div class="inline-flex items-center px-2 py-0.5 mt-0.5 bg-sky-50/90 hover:bg-sky-100 border border-sky-200/80 rounded-md transition shadow-2xs cursor-pointer select-none group/phone whitespace-nowrap"
                     title="Rê chuột để xem số thật • Bấm để sao chép: ${clean}"
                     onclick="event.stopPropagation(); if(navigator.clipboard){navigator.clipboard.writeText('${clean}');if(window.showToast)showToast('Đã sao chép SĐT: ${clean}');}">
                    <span class="font-mono text-sm font-bold text-sky-950 tracking-wide inline group-hover/phone:hidden whitespace-nowrap">${masked}</span>
                    <span class="font-mono text-sm font-bold text-sky-700 tracking-wide hidden group-hover/phone:inline whitespace-nowrap">${formatted}</span>
                </div>
            `.trim();
        }

        function formatPhoneBadge(phone) {
            if (!phone) return '<span class="text-slate-400  text-xs whitespace-nowrap">Chưa có SĐT</span>';
            const rawParts = String(phone).split(/[,;/|_]+/).map(s => s.replace(/\s+/g, '').trim()).filter(Boolean);
            const parts = [];
            rawParts.forEach(rp => {
                const m20 = rp.match(/^(0\d{9})(0\d{9,10})$/);
                if (m20) {
                    parts.push(m20[1], m20[2]);
                } else {
                    parts.push(rp);
                }
            });
            if (parts.length === 0) return '<span class="text-slate-400  text-xs whitespace-nowrap">Chưa có SĐT</span>';
            return parts.map(p => formatSinglePhoneBadge(p)).join(' ');
        }
        window.formatPhoneBadge = formatPhoneBadge;

        function formatMaskedPhone(phone) {
            return formatPhoneBadge(phone);
        }
        if (!window.formatMaskedPhone) window.formatMaskedPhone = formatMaskedPhone;

        function getLocalTodayDateStr() {
            const d = new Date();
            const year = d.getFullYear();
            const month = String(d.getMonth() + 1).padStart(2, '0');
            const day = String(d.getDate()).padStart(2, '0');
            return `${year}-${month}-${day}`;
        }

        async function loadPetServicesKPI() {
            try {
                const res = await fetch('/api/pet-services/kpi');
                const kpi = await res.json();
                const el = (id, val) => { const e = document.getElementById(id); if(e) e.textContent = val; };
                el('kpi-pets-total', kpi.total_pets || 0);
                el('kpi-pets-appointments-today', kpi.appointments_today || 0);
                el('kpi-pets-in-progress', kpi.in_progress || 0);
                el('kpi-pets-uncalled', kpi.uncalled || 0);
                el('kpi-pets-not-checked-out', kpi.not_checked_out || 0);
                el('kpi-pets-checked-out', kpi.checked_out || 0);
                el('kpi-pets-transport', kpi.transport || 0);
            } catch(e) { console.error('loadPetServicesKPI error:', e); }
        }

        var currentSpaView = 'table';

        function switchSpaView(view) {
            currentSpaView = 'table';
            const elTable = document.getElementById('spa-view-table');
            if (elTable) elTable.classList.remove('hidden');
            const elKanban = document.getElementById('spa-view-kanban');
            if (elKanban) elKanban.classList.add('hidden');
            renderActiveSpaView();
        }

        function renderActiveSpaView() {
            renderSpaDateStrip();
            renderPetServicesTable();
            if (document.getElementById('spa-invoices-table-body') && Array.isArray(allSpaInvoicesData) && allSpaInvoicesData.length > 0) {
                if (typeof filterSpaInvoicesList === 'function') filterSpaInvoicesList();
            }
        }

        function updateFilterStatusButtons(status) {
            const sel = document.getElementById('select-svc-filter-status');
            if (sel) sel.value = status;
            ['all','pending','in_progress','completed','checked_out'].forEach(s => {
                const btn = document.getElementById('btn-svc-filter-' + s);
                if (btn) btn.className = s === status
                    ? 'px-3 py-1.5 text-xs font-bold rounded-md bg-sky-700 text-white shadow'
                    : 'px-3 py-1.5 text-xs font-bold rounded-md bg-white text-slate-700 border hover:bg-gray-50';
            });
        }

        function filterPetServices(status) {
            petServiceFilterStatus = status;
            petServiceFilterKpiMode = null;
            updateFilterStatusButtons(status);
            renderActiveSpaView();
        }

        function selectSpaStripDate(dateStr) {
            // Không có quyền spa.pick_date -> chỉ được xem hôm nay (chặn cả ô ngày khác, KPI, nút dải ngày)
            if (!canPickSpaDate() && dateStr !== 'today' && dateStr !== getLocalTodayDateStr()) dateStr = 'today';
            petServiceFilterDate = dateStr;
            petServicesCurrentPage = 1;
            renderSpaDateStrip();
            renderActiveSpaView();
        }
        window.selectSpaStripDate = selectSpaStripDate;

        function setSpaDailyQuickFilter(type) {
            petServiceDailyQuickFilter = type;
            const btnAll = document.getElementById('btn-spa-filter-daily-all');
            const btnUnreturned = document.getElementById('btn-spa-filter-daily-unreturned');
            const btnReturned = document.getElementById('btn-spa-filter-daily-returned');

            const activeBtn = 'px-3 py-1.5 font-bold rounded-md bg-sky-700 text-white shadow-xs transition';
            const inactiveBtn = 'px-3 py-1.5 font-medium text-slate-600 hover:text-slate-900 rounded-md transition';

            if (btnAll) btnAll.className = (type === 'all' ? activeBtn : inactiveBtn);
            if (btnUnreturned) btnUnreturned.className = (type === 'not_checked_out' ? activeBtn : inactiveBtn);
            if (btnReturned) btnReturned.className = (type === 'checked_out' ? activeBtn : inactiveBtn);

            petServicesCurrentPage = 1;
            renderActiveSpaView();
        }
        window.setSpaDailyQuickFilter = setSpaDailyQuickFilter;

        function canPickSpaDate() {
            return typeof Auth === 'undefined' || typeof Auth.can !== 'function' || Auth.can('spa.pick_date');
        }

        function renderSpaDateStrip() {
            const container = document.getElementById('spa-date-strip-container');
            if (!container) return;
            const canPick = canPickSpaDate();
            // Ẩn "Ngày khác" + "Về Hôm Nay" khi không có quyền chọn ngày
            const pickBox = document.getElementById('input-spa-custom-date')?.closest('.flex.items-center.gap-2.flex-wrap');
            if (pickBox) pickBox.classList.toggle('hidden', !canPick);

            const todayStr = getLocalTodayDateStr();
            const baseDate = new Date(todayStr + 'T00:00:00');
            const dayNames = ['CN', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7'];

            const countsByDate = {};
            if (Array.isArray(allPetServiceTickets)) {
                allPetServiceTickets.forEach(t => {
                    if (t.ticket_date) {
                        countsByDate[t.ticket_date] = (countsByDate[t.ticket_date] || 0) + 1;
                    }
                });
            }

            let html = '';
            for (let offset = -2; offset <= 0; offset++) { // 3 ngày: hôm kia, hôm qua, hôm nay (không hiện ngày tương lai)
                const d = new Date(baseDate);
                d.setDate(d.getDate() + offset);
                const yyyy = d.getFullYear();
                const mm = String(d.getMonth() + 1).padStart(2, '0');
                const dd = String(d.getDate()).padStart(2, '0');
                const dateStr = `${yyyy}-${mm}-${dd}`;
                const isToday = (dateStr === todayStr);
                const isSelected = (petServiceFilterDate === dateStr) || (isToday && petServiceFilterDate === 'today');
                const dayLabel = isToday ? 'Hôm nay' : dayNames[d.getDay()];
                const count = countsByDate[dateStr] || 0;

                const activeClass = 'bg-sky-700 text-white font-bold border-sky-700 shadow-sm ring-2 ring-sky-300';
                const inactiveClass = 'bg-white text-slate-700 font-medium border-slate-200 hover:bg-sky-50 hover:border-sky-300';

                html += `
                    <button type="button" onclick="selectSpaStripDate('${dateStr}')" ${(!canPick && !isToday) ? 'disabled' : ''}
                        class="px-2.5 py-1 rounded-lg border text-xs transition flex flex-col items-center min-w-[56px] select-none ${isSelected ? activeClass : inactiveClass} ${(!canPick && !isToday) ? 'opacity-40 cursor-not-allowed' : ''}">
                        <span class="text-xs ${isSelected ? 'text-sky-200' : 'text-slate-400'} uppercase font-bold">${dayLabel}</span>
                        <span class="font-bold text-xs my-0.5">${dd}/${mm}</span>
                        <span class="text-xs ${isSelected ? 'bg-sky-900/60 text-amber-300' : (count > 0 ? 'bg-sky-100 text-sky-800' : 'text-slate-300')} px-1 rounded font-bold">
                            ${count > 0 ? `${count} ca` : '-'}
                        </span>
                    </button>
                `;
            }

            container.innerHTML = html;

            const customInput = document.getElementById('input-spa-custom-date');
            if (customInput) {
                customInput.value = (petServiceFilterDate === 'today') ? todayStr : (petServiceFilterDate === 'all' ? '' : petServiceFilterDate);
            }
        }
        window.renderSpaDateStrip = renderSpaDateStrip;

        function setPetServiceDateFilter(mode) {
            selectSpaStripDate(mode);
            const btnToday = document.getElementById('btn-spa-date-today');
            const btnAll = document.getElementById('btn-spa-date-all');
            const inputCustom = document.getElementById('input-spa-date-custom');
            if (btnToday) {
                btnToday.className = (mode === 'today') 
                    ? 'px-2.5 py-1.5 text-xs font-bold rounded-l-md bg-sky-700 text-white shadow'
                    : 'px-2.5 py-1.5 text-xs font-bold rounded-l-md bg-white text-slate-700 hover:bg-gray-50';
            }
            if (btnAll) {
                btnAll.className = (mode === 'all')
                    ? 'px-2.5 py-1.5 text-xs font-bold text-white bg-sky-700 shadow border-r border-sky-700'
                    : 'px-2.5 py-1.5 text-xs font-bold text-slate-700 hover:bg-gray-50 border-r border-slate-200';
            }
            if (inputCustom && mode !== 'today' && mode !== 'all') {
                inputCustom.value = mode;
            } else if (inputCustom && (mode === 'today' || mode === 'all')) {
                inputCustom.value = '';
            }
        }

        function filterPetServicesByKpi(kpiType) {
            if (kpiType === 'total') {
                setPetServiceDateFilter('all');
                filterPetServices('all');
            } else if (kpiType === 'today') {
                setPetServiceDateFilter('today');
                filterPetServices('all');
            } else if (kpiType === 'in_progress') {
                setPetServiceDateFilter('today');
                filterPetServices('in_progress');
            } else if (kpiType === 'uncalled') {
                setPetServiceDateFilter('today');
                petServiceFilterStatus = 'completed';
                petServiceFilterKpiMode = 'uncalled';
                updateFilterStatusButtons('completed');
                renderActiveSpaView();
            } else if (kpiType === 'not_checked_out') {
                setPetServiceDateFilter('today');
                petServiceFilterStatus = 'all';
                petServiceFilterKpiMode = 'not_checked_out';
                updateFilterStatusButtons('all');
                renderActiveSpaView();
            } else if (kpiType === 'transport') {
                setPetServiceDateFilter('today');
                filterPetServices('all');
                petServiceFilterKpiMode = 'transport';
                renderActiveSpaView();
            }
        }

        async function loadPetServicesList(showSkeleton = null) {
            try {
                // Chỉ hiện skeleton khi chưa có dữ liệu hoặc được chỉ định rõ ràng showSkeleton === true
                const shouldSkeleton = (showSkeleton === true) || (showSkeleton === null && (!allPetServiceTickets || allPetServiceTickets.length === 0));
                if (shouldSkeleton && typeof renderTableSkeleton === 'function' && typeof currentSpaView !== 'undefined' && currentSpaView === 'table') {
                    renderTableSkeleton('table-pet-services', 6, 11);
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
            if (s === 'checked_out') colorClass = 'bg-sky-50 text-sky-800 border-sky-300';

            return `
                <select onchange="updateServiceStatus(${t.id}, this.value, this)" class="text-xs font-bold py-1 px-1.5 rounded border ${colorClass} outline-none cursor-pointer">
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
                <select onchange="updateServiceCallStatus(${t.id}, this.value, this)" class="text-xs py-0.5 px-1 rounded border ${csClass} outline-none cursor-pointer">
                    <option value="Chưa gọi" ${cs === 'Chưa gọi' ? 'selected' : ''}>📞 Chưa gọi</option>
                    <option value="Đã gọi đón" ${cs === 'Đã gọi đón' ? 'selected' : ''}>✅ Đã gọi đón</option>
                    <option value="Không nghe máy" ${cs === 'Không nghe máy' ? 'selected' : ''}>❌ Không nghe</option>
                    <option value="Hẹn giờ đón" ${cs === 'Hẹn giờ đón' ? 'selected' : ''}>⏰ Hẹn giờ</option>
                </select>
            `;
        }
        var callStatusSelector = getSpaCallStatusSelectorHtml;

        // ==========================================
        // THAO TÁC HÀNG LOẠT (BULK UPDATE & SELECTION)
        // ==========================================
        function onSpaRowCheckboxChange(cb, ticketId) {
            if (cb.checked) {
                selectedSpaTicketIds.add(ticketId);
            } else {
                selectedSpaTicketIds.delete(ticketId);
            }
            updateSpaBulkToolbar();
        }
        window.onSpaRowCheckboxChange = onSpaRowCheckboxChange;

        function toggleSelectAllSpaTickets(checked) {
            const checkboxes = document.querySelectorAll('.spa-row-select');
            checkboxes.forEach(cb => {
                cb.checked = checked;
                const tid = parseInt(cb.value);
                if (checked) {
                    selectedSpaTicketIds.add(tid);
                } else {
                    selectedSpaTicketIds.delete(tid);
                }
            });
            updateSpaBulkToolbar();
        }
        window.toggleSelectAllSpaTickets = toggleSelectAllSpaTickets;

        function populateBulkCutterSelect() {
            const el = document.getElementById('spa-bulk-cutter-select');
            if (!el) return;
            const staffList = (Array.isArray(allSpaStaffList) && allSpaStaffList.length > 0)
                ? allSpaStaffList
                : ((window.allSpaStaffList && window.allSpaStaffList.length > 0) ? window.allSpaStaffList : []);

            let opts = '<option value="">-- Chọn Thợ Cắt --</option>';
            staffList.forEach(s => {
                const name = s.name || s;
                opts += `<option value="${escapeSpaHtml(name)}">✂️ ${escapeSpaHtml(name)}</option>`;
            });
            el.innerHTML = opts;

            if (staffList.length === 0) {
                fetch('/api/pet-services/staff').then(r => r.json()).then(data => {
                    allSpaStaffList = data || [];
                    populateBulkCutterSelect();
                }).catch(() => {});
            }
        }
        window.populateBulkCutterSelect = populateBulkCutterSelect;

        async function applyBulkPetServiceStaffCutter(staffName) {
            if (!staffName || selectedSpaTicketIds.size === 0) return;
            const targetIds = Array.from(selectedSpaTicketIds);

            // Optimistic local update
            targetIds.forEach(id => {
                const t = (allPetServiceTickets || []).find(item => item.id === id);
                if (t) t.staff_cutter = staffName;
            });
            renderActiveSpaView();

            try {
                const payload = {
                    tickets: targetIds.map(id => ({ id, staff_cutter: staffName }))
                };
                const res = await fetch('/api/pet-services/tickets/bulk-update', {
                    method: 'PUT',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(payload)
                });
                if (res.ok) {
                    if (window.showToast) {
                        showToast(`Đã gán thợ cắt [${staffName}] cho ${targetIds.length} phiếu!`, 'success');
                    }
                } else {
                    console.error('Lỗi bulk-update staff_cutter:', await res.text());
                }
            } catch(err) {
                console.error('Lỗi mạng khi bulk-update staff_cutter:', err);
            }
        }
        window.applyBulkPetServiceStaffCutter = applyBulkPetServiceStaffCutter;

        function updateSpaBulkToolbar() {
            const toolbar = document.getElementById('spa-bulk-actions-toolbar');
            const countEl = document.getElementById('spa-bulk-selected-count');
            const selectAllCb = document.getElementById('spa-select-all-tickets');

            const count = selectedSpaTicketIds.size;
            if (countEl) countEl.textContent = count;

            if (toolbar) {
                if (count > 0) {
                    toolbar.classList.remove('hidden');
                    toolbar.classList.add('flex');
                    populateBulkCutterSelect();
                } else {
                    toolbar.classList.add('hidden');
                    toolbar.classList.remove('flex');
                }
            }

            if (selectAllCb) {
                const visibleCheckboxes = document.querySelectorAll('.spa-row-select');
                if (visibleCheckboxes.length > 0) {
                    selectAllCb.checked = Array.from(visibleCheckboxes).every(cb => cb.checked);
                    selectAllCb.indeterminate = (!selectAllCb.checked && count > 0);
                } else {
                    selectAllCb.checked = false;
                    selectAllCb.indeterminate = false;
                }
            }
        }
        window.updateSpaBulkToolbar = updateSpaBulkToolbar;

        function clearSelectedSpaTickets() {
            selectedSpaTicketIds.clear();
            const checkboxes = document.querySelectorAll('.spa-row-select');
            checkboxes.forEach(cb => { cb.checked = false; });
            const selectAllCb = document.getElementById('spa-select-all-tickets');
            if (selectAllCb) {
                selectAllCb.checked = false;
                selectAllCb.indeterminate = false;
            }
            updateSpaBulkToolbar();
        }
        window.clearSelectedSpaTickets = clearSelectedSpaTickets;

        async function deleteSelectedSpaTickets() {
            if (!selectedSpaTicketIds || selectedSpaTicketIds.size === 0) return;
            const count = selectedSpaTicketIds.size;
            const targetIds = Array.from(selectedSpaTicketIds);

            const confirmed = window.customConfirm
                ? await window.customConfirm(`Bạn có chắc chắn muốn xóa ${count} phiếu dịch vụ đã chọn?\n\n⚠️ Lưu ý: Thao tác này sẽ xóa vĩnh viễn ${count} phiếu khỏi hệ thống và không thể hoàn tác!`, `Xác Nhận Xóa ${count} Phiếu Spa`, { type: 'danger', okText: `Xóa ${count} Phiếu` })
                : confirm(`Xác nhận xóa ${count} phiếu đã chọn?`);
            if (!confirmed) return;

            // Optimistic update 0ms phản hồi tức thì
            const targetSet = new Set(targetIds);
            allPetServiceTickets = (allPetServiceTickets || []).filter(t => !targetSet.has(t.id));
            clearSelectedSpaTickets();
            renderActiveSpaView();

            try {
                await Promise.all(targetIds.map(id => fetch(`/api/pet-services/${id}`, { method: 'DELETE' })));
                if (window.showToast) showToast(`Đã xóa thành công ${count} phiếu dịch vụ!`, 'success');
                await loadPetServicesList(false);
                await loadPetServicesKPI();
            } catch(e) {
                console.error('deleteSelectedSpaTickets error:', e);
                if (window.showToast) showToast('Lỗi kết nối khi xóa phiếu!', 'error');
                await loadPetServicesList(false);
            }
        }
        window.deleteSelectedSpaTickets = deleteSelectedSpaTickets;

        async function applyBulkPetServiceStatus(newStatus) {
            if (!newStatus || selectedSpaTicketIds.size === 0) return;
            const targetIds = Array.from(selectedSpaTicketIds);
            
            targetIds.forEach(id => {
                const t = (allPetServiceTickets || []).find(item => item.id === id);
                if (t) t.status = newStatus;
            });
            renderActiveSpaView();
            loadPetServicesKPI();

            try {
                const payload = {
                    tickets: targetIds.map(id => ({ id, status: newStatus }))
                };
                const res = await fetch('/api/pet-services/tickets/bulk-update', {
                    method: 'PUT',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(payload)
                });
                if (!res.ok) {
                    console.error('Lỗi bulk-update status:', await res.text());
                    await loadPetServicesList();
                    await loadPetServicesKPI();
                }
            } catch (err) {
                console.error('Lỗi kết nối bulk-update status:', err);
                await loadPetServicesList();
                await loadPetServicesKPI();
            }
        }
        window.applyBulkPetServiceStatus = applyBulkPetServiceStatus;

        async function applyBulkPetServiceCallStatus(newCallStatus) {
            if (!newCallStatus || selectedSpaTicketIds.size === 0) return;
            const targetIds = Array.from(selectedSpaTicketIds);

            targetIds.forEach(id => {
                const t = (allPetServiceTickets || []).find(item => item.id === id);
                if (t) t.call_status = newCallStatus;
            });
            renderActiveSpaView();
            loadPetServicesKPI();

            try {
                const payload = {
                    tickets: targetIds.map(id => ({ id, call_status: newCallStatus }))
                };
                const res = await fetch('/api/pet-services/tickets/bulk-update', {
                    method: 'PUT',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(payload)
                });
                if (!res.ok) {
                    console.error('Lỗi bulk-update call_status:', await res.text());
                    await loadPetServicesList();
                    await loadPetServicesKPI();
                }
            } catch (err) {
                console.error('Lỗi kết nối bulk-update call_status:', err);
                await loadPetServicesList();
                await loadPetServicesKPI();
            }
        }
        window.applyBulkPetServiceCallStatus = applyBulkPetServiceCallStatus;

        function openSpaBulkAssignStaffModal() {
            if (selectedSpaTicketIds.size === 0) {
                alert('Vui lòng chọn ít nhất 1 phiếu để gán thợ!');
                return;
            }
            const countEl = document.getElementById('spa-bulk-modal-count');
            if (countEl) countEl.textContent = selectedSpaTicketIds.size;

            const populateSelect = (id) => {
                const el = document.getElementById(id);
                if (!el) return;
                const staffList = (Array.isArray(allSpaStaffList) && allSpaStaffList.length > 0)
                    ? allSpaStaffList
                    : ((window.allSpaStaffList && window.allSpaStaffList.length > 0) ? window.allSpaStaffList : [{ name: 'Nhân viên 1' }]);
                let opts = '<option value="">-- Không phân công / Để trống --</option>';
                staffList.forEach(s => {
                    const name = s.name || s;
                    opts += `<option value="${escapeSpaHtml(name)}">${escapeSpaHtml(name)}</option>`;
                });
                el.innerHTML = opts;
            };

            populateSelect('spa-bulk-staff-cutter');
            populateSelect('spa-bulk-staff-worker');
            populateSelect('spa-bulk-staff-receiver');

            const modal = document.getElementById('modal-spa-bulk-assign-staff');
            if (modal) modal.classList.remove('hidden');
        }
        window.openSpaBulkAssignStaffModal = openSpaBulkAssignStaffModal;

        function closeSpaBulkAssignStaffModal() {
            const modal = document.getElementById('modal-spa-bulk-assign-staff');
            if (modal) modal.classList.add('hidden');
        }
        window.closeSpaBulkAssignStaffModal = closeSpaBulkAssignStaffModal;

        async function saveSpaBulkAssignStaff() {
            if (selectedSpaTicketIds.size === 0) return;
            const targetIds = Array.from(selectedSpaTicketIds);

            const checkCutter = document.getElementById('spa-bulk-check-cutter')?.checked;
            const valCutter = document.getElementById('spa-bulk-staff-cutter')?.value || '';

            const checkWorker = document.getElementById('spa-bulk-check-worker')?.checked;
            const valWorker = document.getElementById('spa-bulk-staff-worker')?.value || '';

            const checkReceiver = document.getElementById('spa-bulk-check-receiver')?.checked;
            const valReceiver = document.getElementById('spa-bulk-staff-receiver')?.value || '';

            targetIds.forEach(id => {
                const t = (allPetServiceTickets || []).find(item => item.id === id);
                if (t) {
                    if (checkCutter) t.staff_cutter = valCutter;
                    if (checkWorker) t.staff_worker_1 = valWorker;
                    if (checkReceiver) t.staff_receiver = valReceiver;
                }
            });
            renderActiveSpaView();
            closeSpaBulkAssignStaffModal();

            try {
                const ticketUpdates = targetIds.map(id => {
                    const item = { id };
                    if (checkCutter) item.staff_cutter = valCutter;
                    if (checkWorker) item.staff_worker_1 = valWorker;
                    if (checkReceiver) item.staff_receiver = valReceiver;
                    return item;
                });
                const res = await fetch('/api/pet-services/tickets/bulk-update', {
                    method: 'PUT',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ tickets: ticketUpdates })
                });
                if (!res.ok) {
                    console.error('Lỗi bulk-update staff:', await res.text());
                    await loadPetServicesList();
                }
            } catch (err) {
                console.error('Lỗi kết nối bulk-update staff:', err);
                await loadPetServicesList();
            }
        }
        window.saveSpaBulkAssignStaff = saveSpaBulkAssignStaff;

        function printSelectedSpaTicketsConsolidated() {
            if (selectedSpaTicketIds.size === 0) {
                alert('Vui lòng chọn ít nhất 1 phiếu để in gộp!');
                return;
            }
            const selectedTickets = (allPetServiceTickets || []).filter(t => selectedSpaTicketIds.has(t.id));
            if (!selectedTickets.length) {
                alert('Không tìm thấy dữ liệu các phiếu đã chọn');
                return;
            }
            printBatchPetServiceTickets(selectedTickets, 'invoice', true);
        }
        window.printSelectedSpaTicketsConsolidated = printSelectedSpaTicketsConsolidated;

        // ==========================================
        // POPUP SỬA & PHÂN CÔNG HÀNG LOẠT GỌN (COMPACT BULK EDIT)
        // ==========================================
        let compactBulkStateMap = new Map();

        async function openSpaBulkEditModal() {
            const modal = document.getElementById('modal-spa-bulk-edit-compact');
            if (!modal) return;

            // Đảm bảo có danh sách nhân viên spa
            if (!allSpaStaffList || allSpaStaffList.length === 0) {
                try {
                    const r = await fetch('/api/pet-services/staff');
                    if (r.ok) allSpaStaffList = await r.json();
                } catch(e) {}
            }

            const staffList = (Array.isArray(allSpaStaffList) && allSpaStaffList.length > 0)
                ? allSpaStaffList
                : ((window.allSpaStaffList && window.allSpaStaffList.length > 0) ? window.allSpaStaffList : []);

            // Đổ dữ liệu vào 2 dropdown thợ cắt và thợ tắm
            const populateSelect = (selectId) => {
                const el = document.getElementById(selectId);
                if (!el) return;
                let opts = '<option value="__keep__">-- Giữ nguyên --</option>';
                opts += '<option value="__empty__">-- Để trống / Bỏ gán --</option>';
                staffList.forEach(s => {
                    const name = s.name || s;
                    opts += `<option value="${escapeSpaHtml(name)}">${escapeSpaHtml(name)}</option>`;
                });
                el.innerHTML = opts;
                el.value = '__keep__';
            };

            populateSelect('compact-bulk-select-cutter');
            populateSelect('compact-bulk-select-worker');
            populateSelect('compact-bulk-select-worker2');

            const statusEl = document.getElementById('compact-bulk-select-status');
            if (statusEl) statusEl.value = '__keep__';

            // Lấy danh sách phiếu hiện tại (theo bộ lọc ngày hoặc tất cả)
            compactBulkStateMap.clear();
            const sourceTickets = (allPetServiceTickets || []);
            const totalEl = document.getElementById('compact-bulk-total-tickets');
            if (totalEl) totalEl.textContent = `${sourceTickets.length} phiếu`;

            sourceTickets.forEach(t => {
                const isPreSelected = selectedSpaTicketIds && selectedSpaTicketIds.has(t.id);
                compactBulkStateMap.set(t.id, {
                    id: t.id,
                    ticket: t,
                    checked: !!isPreSelected,
                    staff_cutter: t.staff_cutter || '',
                    staff_worker_1: t.staff_worker_1 || '',
                    staff_worker_2: t.staff_worker_2 || '',
                    staff_dyer: t.staff_dyer || '',
                    status: t.status || 'pending',
                    isDirty: false
                });
            });

            renderCompactBulkTable();
            modal.classList.remove('hidden');
        }
        window.openSpaBulkEditModal = openSpaBulkEditModal;

        function closeSpaBulkEditModal() {
            const modal = document.getElementById('modal-spa-bulk-edit-compact');
            if (modal) modal.classList.add('hidden');
        }
        window.closeSpaBulkEditModal = closeSpaBulkEditModal;

        function renderCompactBulkTable() {
            const tbody = document.getElementById('compact-bulk-tbody');
            if (!tbody) return;

            const items = Array.from(compactBulkStateMap.values());
            if (items.length === 0) {
                tbody.innerHTML = '<tr><td colspan="9" class="p-6 text-center text-slate-400 ">Không có phiếu dịch vụ nào để cập nhật</td></tr>';
                updateCompactBulkCounts();
                return;
            }

            const staffList = Array.isArray(window.currentSpaStaff) ? window.currentSpaStaff : [];

            tbody.innerHTML = items.map(item => {
                const t = item.ticket;
                const rowBg = item.isDirty ? 'bg-amber-50/80 font-medium' : 'hover:bg-slate-50';

                // Dropdown thợ cắt
                let cutterOptions = `<option value="">-- Chưa gán --</option>`;
                staffList.forEach(s => {
                    const sel = (item.staff_cutter === s.name) ? 'selected' : '';
                    cutterOptions += `<option value="${escapeSpaHtml(s.name)}" ${sel}>${escapeSpaHtml(s.name)}</option>`;
                });
                if (item.staff_cutter && !staffList.some(s => s.name === item.staff_cutter)) {
                    cutterOptions += `<option value="${escapeSpaHtml(item.staff_cutter)}" selected>${escapeSpaHtml(item.staff_cutter)}</option>`;
                }

                // Dropdown thợ tắm 1
                let workerOptions = `<option value="">-- Chưa gán --</option>`;
                staffList.forEach(s => {
                    const sel = (item.staff_worker_1 === s.name) ? 'selected' : '';
                    workerOptions += `<option value="${escapeSpaHtml(s.name)}" ${sel}>${escapeSpaHtml(s.name)}</option>`;
                });
                if (item.staff_worker_1 && !staffList.some(s => s.name === item.staff_worker_1)) {
                    workerOptions += `<option value="${escapeSpaHtml(item.staff_worker_1)}" selected>${escapeSpaHtml(item.staff_worker_1)}</option>`;
                }

                // Dropdown thợ tắm 2 (phụ) hoặc Thợ Nhuộm nếu bé có nhuộm lông
                const roleCfg = getTicketStaffRoleConfig(t);
                let worker2Options = `<option value="">-- Không có --</option>`;
                staffList.forEach(s => {
                    const sel = (item.staff_worker_2 === s.name) ? 'selected' : '';
                    worker2Options += `<option value="${escapeSpaHtml(s.name)}" ${sel}>${escapeSpaHtml(s.name)}</option>`;
                });
                if (item.staff_worker_2 && !staffList.some(s => s.name === item.staff_worker_2)) {
                    worker2Options += `<option value="${escapeSpaHtml(item.staff_worker_2)}" selected>${escapeSpaHtml(item.staff_worker_2)}</option>`;
                }

                let dyerOptions = `<option value="">-- Chọn thợ nhuộm --</option>`;
                staffList.forEach(s => {
                    const sel = (item.staff_dyer === s.name) ? 'selected' : '';
                    dyerOptions += `<option value="${escapeSpaHtml(s.name)}" ${sel}>${escapeSpaHtml(s.name)}</option>`;
                });
                if (item.staff_dyer && !staffList.some(s => s.name === item.staff_dyer)) {
                    dyerOptions += `<option value="${escapeSpaHtml(item.staff_dyer)}" selected>${escapeSpaHtml(item.staff_dyer)}</option>`;
                }

                // Dropdown trạng thái
                const statusOptions = `
                    <option value="pending" ${item.status === 'pending' ? 'selected' : ''}>⏳ Chờ làm</option>
                    <option value="in_progress" ${item.status === 'in_progress' ? 'selected' : ''}>🔄 Đang làm</option>
                    <option value="completed" ${item.status === 'completed' ? 'selected' : ''}>✅ Đã xong</option>
                    <option value="checked_out" ${item.status === 'checked_out' ? 'selected' : ''}>🏠 Đã về</option>
                `;

                const cutterCellHtml = roleCfg.needsCutter
                    ? `<select onchange="onCompactBulkRowChange(${item.id}, 'staff_cutter', this.value)" class="w-full text-xs font-semibold p-1.5 rounded-lg border ${item.isDirty && item.staff_cutter !== (t.staff_cutter || '') ? 'border-amber-500 bg-amber-50 text-amber-900 font-bold' : 'border-slate-200 bg-white text-slate-800'} outline-none focus:border-sky-500">
                           ${cutterOptions}
                       </select>`
                    : `<div class="text-xs text-slate-400 italic px-2 py-1">Chỉ tắm (Không cắt)</div>`;

                const thirdStaffCellHtml = roleCfg.needsDyer
                    ? `<div class="space-y-1">
                           <div class="text-[11px] font-bold text-amber-700">🎨 Thợ Nhuộm:</div>
                           <select onchange="onCompactBulkRowChange(${item.id}, 'staff_dyer', this.value)" class="w-full text-xs font-semibold p-1.5 rounded-lg border ${item.isDirty && item.staff_dyer !== (t.staff_dyer || '') ? 'border-amber-500 bg-amber-50 text-amber-900 font-bold' : 'border-amber-300 bg-amber-50/40 text-amber-900'} outline-none focus:border-amber-500">
                               ${dyerOptions}
                           </select>
                       </div>`
                    : `<select onchange="onCompactBulkRowChange(${item.id}, 'staff_worker_2', this.value)" class="w-full text-xs font-semibold p-1.5 rounded-lg border ${item.isDirty && item.staff_worker_2 !== (t.staff_worker_2 || '') ? 'border-amber-500 bg-amber-50 text-amber-900 font-bold' : 'border-slate-200 bg-white text-slate-800'} outline-none focus:border-sky-500">
                           ${worker2Options}
                       </select>`;

                return `
                    <tr class="border-b transition ${rowBg}">
                        <td class="p-2.5 text-center">
                            <input type="checkbox" ${item.checked ? 'checked' : ''} onchange="onCompactBulkCheckboxToggle(${item.id}, this.checked)" class="compact-bulk-row-cb rounded text-sky-600 cursor-pointer">
                        </td>
                        <td class="p-2.5 text-center font-mono">
                            <div class="font-bold text-sky-700">#${t.ticket_number || t.id}</div>
                            <div class="text-xs text-slate-500">${t.code || ''}</div>
                        </td>
                        <td class="p-2.5">
                            <div class="font-bold text-slate-800">${escapeSpaHtml(t.customer_name || 'Khách lẻ')}</div>
                            <div>${formatPhoneBadge(t.customer_phone)}</div>
                        </td>
                        <td class="p-2.5">
                            <div class="font-bold text-sky-700">🐾 ${escapeSpaHtml(t.pet_name || 'Bé cưng')}</div>
                            <div class="text-xs text-slate-500">${escapeSpaHtml(t.pet_breed || t.pet_species || 'Cún')} ${t.weight_at_service ? `(${String(t.weight_at_service).replace('.', ',')} kg)` : ''}</div>
                        </td>
                        <td class="p-2.5">
                            <div class="font-bold text-slate-800">${escapeSpaHtml(t.service_type || '-')}</div>
                            ${t.dye_package ? `<div class="text-xs text-sky-700 font-medium">🎨 ${escapeSpaHtml(t.dye_package)}</div>` : ''}
                        </td>
                        <td class="p-2.5">
                            ${cutterCellHtml}
                        </td>
                        <td class="p-2.5">
                            <select onchange="onCompactBulkRowChange(${item.id}, 'staff_worker_1', this.value)" class="w-full text-xs font-semibold p-1.5 rounded-lg border ${item.isDirty && item.staff_worker_1 !== (t.staff_worker_1 || '') ? 'border-amber-500 bg-amber-50 text-amber-900 font-bold' : 'border-slate-200 bg-white text-slate-800'} outline-none focus:border-sky-500">
                                ${workerOptions}
                            </select>
                        </td>
                        <td class="p-2.5">
                            ${thirdStaffCellHtml}
                        </td>
                        <td class="p-2.5 text-center">
                            <select onchange="onCompactBulkRowChange(${item.id}, 'status', this.value)" class="w-full text-xs font-semibold p-1.5 rounded-lg border ${item.isDirty && item.status !== (t.status || 'pending') ? 'border-amber-500 bg-amber-50 text-amber-900 font-bold' : 'border-slate-200 bg-white text-slate-800'} outline-none focus:border-sky-500">
                                ${statusOptions}
                            </select>
                        </td>
                    </tr>
                `;
            }).join('');

            updateCompactBulkCounts();
        }
        window.renderCompactBulkTable = renderCompactBulkTable;

        function onCompactBulkRowChange(ticketId, field, value) {
            const item = compactBulkStateMap.get(ticketId);
            if (!item) return;

            item[field] = value;
            const t = item.ticket;

            const isDirty = (
                item.staff_cutter !== (t.staff_cutter || '') ||
                item.staff_worker_1 !== (t.staff_worker_1 || '') ||
                item.staff_worker_2 !== (t.staff_worker_2 || '') ||
                item.staff_dyer !== (t.staff_dyer || '') ||
                item.status !== (t.status || 'pending')
            );
            item.isDirty = isDirty;

            renderCompactBulkTable();
        }
        window.onCompactBulkRowChange = onCompactBulkRowChange;

        function updateCompactBulkCounts() {
            const items = Array.from(compactBulkStateMap.values());
            const selectedCount = items.filter(i => i.checked).length;
            const dirtyCount = items.filter(i => i.isDirty).length;

            const selectedCountEl = document.getElementById('compact-bulk-selected-count');
            if (selectedCountEl) selectedCountEl.textContent = selectedCount;

            const masterCb = document.getElementById('compact-bulk-master-cb');
            if (masterCb) {
                masterCb.checked = (items.length > 0 && selectedCount === items.length);
                masterCb.indeterminate = (selectedCount > 0 && selectedCount < items.length);
            }

            const dirtyInfoEl = document.getElementById('compact-bulk-dirty-info');
            const saveBtn = document.getElementById('btn-save-compact-bulk');
            if (dirtyInfoEl) {
                if (dirtyCount > 0) {
                    dirtyInfoEl.textContent = `⚡ Có ${dirtyCount} phiếu đã được cập nhật nháp (bấm Lưu để xác nhận)`;
                    dirtyInfoEl.className = 'font-bold text-amber-700 animate-pulse';
                } else {
                    dirtyInfoEl.textContent = 'Chưa có thay đổi nào';
                    dirtyInfoEl.className = 'font-medium text-slate-500';
                }
            }
            if (saveBtn) {
                saveBtn.innerHTML = `<span>💾</span> <span>Lưu Thay Đổi ${dirtyCount > 0 ? `(${dirtyCount})` : ''}</span>`;
            }
        }
        window.updateCompactBulkCounts = updateCompactBulkCounts;

        function compactBulkSelectAll(checked) {
            compactBulkStateMap.forEach(item => {
                item.checked = !!checked;
            });
            renderCompactBulkTable();
        }
        window.compactBulkSelectAll = compactBulkSelectAll;

        function onCompactBulkCheckboxToggle(ticketId, checked) {
            const item = compactBulkStateMap.get(ticketId);
            if (item) {
                item.checked = !!checked;
            }
            updateCompactBulkCounts();
        }
        window.onCompactBulkCheckboxToggle = onCompactBulkCheckboxToggle;

        function applyCompactBulkChanges() {
            const selectedItems = Array.from(compactBulkStateMap.values()).filter(i => i.checked);
            if (selectedItems.length === 0) {
                if (window.showToast) showToast('Vui lòng tick chọn ít nhất 1 phiếu để áp dụng!', 'warning');
                else alert('Vui lòng tick chọn ít nhất 1 phiếu để áp dụng!');
                return;
            }

            const cutterVal = document.getElementById('compact-bulk-select-cutter')?.value || '__keep__';
            const workerVal = document.getElementById('compact-bulk-select-worker')?.value || '__keep__';
            const worker2Val = document.getElementById('compact-bulk-select-worker2')?.value || '__keep__';
            const statusVal = document.getElementById('compact-bulk-select-status')?.value || '__keep__';

            if (cutterVal === '__keep__' && workerVal === '__keep__' && worker2Val === '__keep__' && statusVal === '__keep__') {
                if (window.showToast) showToast('Vui lòng chọn Thợ cắt, Thợ tắm hoặc Trạng thái để áp dụng!', 'warning');
                else alert('Vui lòng chọn Thợ cắt, Thợ tắm hoặc Trạng thái để áp dụng!');
                return;
            }

            selectedItems.forEach(item => {
                if (cutterVal !== '__keep__') {
                    item.staff_cutter = (cutterVal === '__empty__' ? '' : cutterVal);
                    item.isDirty = true;
                }
                if (workerVal !== '__keep__') {
                    item.staff_worker_1 = (workerVal === '__empty__' ? '' : workerVal);
                    item.isDirty = true;
                }
                if (worker2Val !== '__keep__') {
                    item.staff_worker_2 = (worker2Val === '__empty__' ? '' : worker2Val);
                    item.isDirty = true;
                }
                if (statusVal !== '__keep__') {
                    item.status = statusVal;
                    item.isDirty = true;
                }
            });

            renderCompactBulkTable();
            if (window.showToast) {
                showToast(`Đã áp dụng thay đổi cho ${selectedItems.length} phiếu! Bấm [Lưu Thay Đổi] để hoàn tất.`, 'info');
            }
        }
        window.applyCompactBulkChanges = applyCompactBulkChanges;

        async function saveCompactBulkEdit() {
            const dirtyItems = Array.from(compactBulkStateMap.values()).filter(i => i.isDirty);
            if (dirtyItems.length === 0) {
                closeSpaBulkEditModal();
                return;
            }

            // Optimistic update vào danh sách allPetServiceTickets
            dirtyItems.forEach(item => {
                const t = (allPetServiceTickets || []).find(x => x.id === item.id);
                if (t) {
                    t.staff_cutter = item.staff_cutter;
                    t.staff_worker_1 = item.staff_worker_1;
                    t.staff_worker_2 = item.staff_worker_2;
                    t.staff_dyer = item.staff_dyer;
                    t.status = item.status;
                }
            });

            renderActiveSpaView();
            loadPetServicesKPI();
            closeSpaBulkEditModal();

            try {
                const payload = {
                    tickets: dirtyItems.map(i => ({
                        id: i.id,
                        staff_cutter: i.staff_cutter,
                        staff_worker_1: i.staff_worker_1,
                        staff_worker_2: i.staff_worker_2,
                        staff_dyer: i.staff_dyer,
                        status: i.status
                    }))
                };
                const res = await fetch('/api/pet-services/tickets/bulk-update', {
                    method: 'PUT',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(payload)
                });
                if (res.ok) {
                    if (window.showToast) showToast(`Đã lưu thành công thay đổi cho ${dirtyItems.length} phiếu!`, 'success');
                } else {
                    console.error('Lỗi bulk-update:', await res.text());
                }
            } catch(e) {
                console.error('Lỗi mạng khi bulk-update:', e);
            }
        }
        window.saveCompactBulkEdit = saveCompactBulkEdit;

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

            const btnToggle = document.getElementById('btn-toggle-spa-spreadsheet') || document.getElementById('btn-toggle-spa-bulk');
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
        window.toggleSpaBulkEditMode = function() {
            toggleSpaSpreadsheetMode();
        };

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

        async function onSpaSpreadsheetPaymentStatusChange(ticketId, selectEl) {
            const newStatus = selectEl.value;
            const ticket = (allPetServiceTickets || []).find(t => t.id == ticketId);
            if (newStatus === 'paid') {
                const ticketNum = ticket ? `#${ticket.ticket_number || ticket.id}` : `#${ticketId}`;
                const due = ticket ? Math.max(0, (ticket.price || 0) - (ticket.deposit_amount || 0)) : 0;
                const confirmMsg = `Xác nhận thu tiền phiếu ${ticketNum} (Số tiền: ${formatMoney(due)})?`;
                const ok = window.customConfirm ? await window.customConfirm(confirmMsg) : confirm(confirmMsg);
                if (!ok) {
                    selectEl.value = 'unpaid';
                    return;
                }
                try {
                    const payMethod = ticket?.payment_method || 'cash';
                    await loadSpaPaymentAccounts();
                    const payAccId = spaAccountIdForMethod(payMethod, null);
                    if (spaAccountNeedsAccount(payMethod) && !payAccId) {
                        alert('Chưa có tài khoản nhận tiền cho hình thức ' + (payMethod === 'card' ? 'quẹt thẻ' : 'chuyển khoản') + '. Vào Cài Đặt → Tài khoản thanh toán để thêm!');
                        selectEl.value = 'unpaid';
                        return;
                    }
                    const res = await fetch(`/api/pet-services/${ticketId}/pay`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                            payment_method: payMethod,
                            account_id: payAccId
                        })
                    });
                    if (!res.ok) {
                        const err = await res.json();
                        alert('Lỗi thanh toán: ' + (err.detail || 'Không thể thanh toán'));
                        selectEl.value = 'unpaid';
                        return;
                    }
                    if (ticket) ticket.payment_status = 'paid';
                    selectEl.className = 'border p-1 rounded text-xs font-bold text-emerald-700 bg-emerald-50';
                    if (typeof showToast === 'function') showToast('Đã thu tiền & ghi sổ quỹ thành công!', 'success');
                } catch (e) {
                    alert('Lỗi kết nối: ' + e.message);
                    selectEl.value = 'unpaid';
                }
            } else {
                markTicketDirty(ticketId, 'payment_status', 'unpaid', selectEl);
                selectEl.className = 'border p-1 rounded text-xs font-bold text-amber-700 bg-amber-50';
            }
        }
        window.onSpaSpreadsheetPaymentStatusChange = onSpaSpreadsheetPaymentStatusChange;

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
            } else if (key === 'deposit') {
                const cb = document.getElementById('prog-cb-deposit');
                const inp = document.getElementById('prog-deposit-amount');
                if (cb && inp) inp.value = cb.checked ? (parseFloat(inp.value) || 50000) : 0;
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
            // Phiếu đánh dấu "Đã TT" trong bảng: bổ sung tài khoản nhận tiền nếu hình thức là CK/thẻ
            if (tickets.some(t => t.payment_status === 'paid')) {
                await loadSpaPaymentAccounts();
                tickets.forEach(item => {
                    if (item.payment_status !== 'paid' || item.account_id) return;
                    const tk = (allPetServiceTickets || []).find(x => x.id === item.id);
                    const m = (tk && tk.payment_method) || 'cash';
                    if (spaAccountNeedsAccount(m)) item.account_id = spaAccountIdForMethod(m, null);
                });
            }
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

        let petServicesCurrentPage = 1;

        function changePetServicesPage(newPage) {
            petServicesCurrentPage = newPage;
            renderPetServicesTable();
        }
        window.changePetServicesPage = changePetServicesPage;

        function renderPetServicesTable() {
            const tbody = document.getElementById('table-pet-services');
            if (!tbody) return;
            if (!Array.isArray(allPetServiceTickets)) allPetServiceTickets = [];

            // Dọn dẹp các ID đã bị xóa khỏi tập chọn hàng loạt
            if (selectedSpaTicketIds && selectedSpaTicketIds.size > 0) {
                const currentIds = new Set(allPetServiceTickets.map(t => t.id));
                for (const sid of Array.from(selectedSpaTicketIds)) {
                    if (!currentIds.has(sid)) {
                        selectedSpaTicketIds.delete(sid);
                    }
                }
            }

            const q = (document.getElementById('search-pet-services')?.value || '').trim().toLowerCase();
            const todayStr = getLocalTodayDateStr();
            const targetDate = (petServiceFilterDate === 'today') ? todayStr : petServiceFilterDate;

            // Đếm số lượng ca cho ngày được chọn để cập nhật cụm nút lọc nhanh
            const targetDayTickets = allPetServiceTickets.filter(t => {
                if (targetDate !== 'all') {
                    if (t.ticket_date && t.ticket_date !== targetDate) return false;
                }
                return true;
            });
            const countAll = targetDayTickets.length;
            const countUnreturned = targetDayTickets.filter(t => t.status !== 'checked_out').length;
            const countReturned = targetDayTickets.filter(t => t.status === 'checked_out').length;

            const elCountAll = document.getElementById('count-daily-all');
            const elCountUnreturned = document.getElementById('count-daily-unreturned');
            const elCountReturned = document.getElementById('count-daily-returned');
            if (elCountAll) elCountAll.textContent = countAll;
            if (elCountUnreturned) elCountUnreturned.textContent = countUnreturned;
            if (elCountReturned) elCountReturned.textContent = countReturned;

            let filtered = allPetServiceTickets.filter(t => {
                // 1. Lọc theo ngày
                if (targetDate !== 'all') {
                    if (t.ticket_date && t.ticket_date !== targetDate) return false;
                }

                // 2. Lọc nhanh trong ngày: Tất cả / Chưa về / Đã về
                if (petServiceDailyQuickFilter === 'not_checked_out') {
                    if (t.status === 'checked_out') return false;
                } else if (petServiceDailyQuickFilter === 'checked_out') {
                    if (t.status !== 'checked_out') return false;
                }

                // 3. Status filter từ dropdown nếu có
                if (petServiceFilterStatus !== 'all' && t.status !== petServiceFilterStatus) return false;

                // 4. KPI quick filter mode
                if (petServiceFilterKpiMode === 'uncalled') {
                    if (t.status !== 'completed') return false;
                    const cs = t.call_status || 'Chưa gọi';
                    if (cs === 'Đã gọi đón') return false;
                } else if (petServiceFilterKpiMode === 'not_checked_out') {
                    if (t.status === 'checked_out') return false;
                } else if (petServiceFilterKpiMode === 'transport') {
                    if (!t.has_transport && !t.shipping_fee) return false;
                }

                if (q) {
                    const phoneTokens = typeof window.buildContactPhoneSearchTokens === 'function'
                        ? window.buildContactPhoneSearchTokens(t.customer_phone)
                        : String(t.customer_phone || '');
                    const hay = `${t.code||''} ${t.customer_name||''} ${t.customer_phone||''} ${phoneTokens} ${t.pet_name||''} ${t.service_type||''} ${t.staff_cutter||''} ${t.staff_worker_1||''} ${t.staff_dyer||''} ${t.staff_receiver||''}`.toLowerCase();
                    const qDigits = q.replace(/\D+/g, '');
                    const matchText = hay.includes(q) || (typeof removeVietnameseTones === 'function' && removeVietnameseTones(hay).includes(removeVietnameseTones(q)));
                    const matchDigits = qDigits.length >= 3 && phoneTokens.includes(qDigits);
                    if (!matchText && !matchDigits) return false;
                }
                return true;
            });

            if (filtered.length === 0) {
                tbody.innerHTML = '<tr><td colspan="11" class="p-6 text-center text-gray-400">Chưa có phiếu dịch vụ nào</td></tr>';
                const pContainer = document.getElementById('pagination-pet-services');
                if (pContainer) pContainer.innerHTML = '';
                updateSpaBulkToolbar();
                return;
            }

            const totalItems = filtered.length;
            const totalPages = Math.ceil(totalItems / 20) || 1;
            if (petServicesCurrentPage > totalPages) petServicesCurrentPage = totalPages;
            if (petServicesCurrentPage < 1) petServicesCurrentPage = 1;
            const pagedFiltered = filtered.slice((petServicesCurrentPage - 1) * 20, petServicesCurrentPage * 20);

            tbody.innerHTML = pagedFiltered.map((t, idx) => {
                const isDirty = spaSpreadsheetDirtyMap.has(t.id);
                const isPaid = (t.payment_status === 'paid');
                let rowClass = 'card-row card-row-anim transition text-sm';
                if (isDirty) {
                    rowClass += ' bg-amber-50/70 border-2 border-amber-400';
                } else if (isPaid) {
                    rowClass += ' spa-paid-row bg-emerald-50/70 hover:bg-emerald-100/70 border-l-4 border-l-emerald-500 ';
                } else {
                    rowClass += ' border-b border-slate-200 hover:bg-sky-50/40';
                }

                if (isSpaSpreadsheetMode) {
                    // CHẾ ĐỘ SỬA TRỰC TIẾP NHƯ EXCEL
                    return `
                    <tr class="${rowClass}" style="--row-idx: ${idx};">
                        <!-- 1. STT / Mã & Thao Tác Trực Tiếp -->
                        <td class="p-2 text-center font-mono font-bold text-sky-700 border-r border-slate-200 min-w-[130px]">
                            <div class="flex items-center justify-center gap-1">
                                ${t.ticket_number ? `<span class="bg-sky-100 text-sky-900 border border-sky-300 px-2 py-0.5 rounded text-sm font-bold shadow-xs">#${t.ticket_number}</span>` : '-'}
                            </div>
                            <div class="text-xs text-gray-400 font-mono my-1">${t.code || ''}</div>
                            <div class="flex flex-wrap items-center justify-center gap-1 pt-1 border-t border-slate-200">
                                <button onclick="printPetServiceTicketDirectly(${t.id}, 'intake')" class="bg-sky-600 hover:bg-sky-700 text-white px-1.5 py-0.5 rounded text-xs font-bold shadow-xs" title="In 2 phiếu: Phiếu nhận Spa + Số thứ tự dán chuồng">🖨️</button>
                                <button onclick="printPetServiceTicketDirectly(${t.id}, 'invoice')" class="bg-emerald-600 hover:bg-emerald-700 text-white px-1.5 py-0.5 rounded text-xs font-bold shadow-xs" title="In hóa đơn K80">🧾</button>
                                <button onclick="deletePetService(${t.id})" class="text-rose-600 hover:text-rose-800 px-1 py-0.5 border border-rose-200 rounded text-xs font-bold" title="Xóa">🗑️</button>
                            </div>
                        </td>
                        <!-- 2. Khách hàng & Gọi điện -->
                        <td class="p-2 whitespace-nowrap min-w-[150px]">
                            <button type="button" onclick="openQuickCustomerInfoModal(${t.customer_id}, '${escapeJs(t.customer_name || '')}')" class="text-left font-bold text-slate-800 hover:text-sky-700 hover:underline flex items-center gap-1 group transition" title="Bấm để xem nhanh hồ sơ khách, ví Spa & các bé cưng">
                                <span>${t.customer_name || '-'}</span>
                                <span class="text-xs text-sky-500 opacity-0 group-hover:opacity-100 transition">👁️</span>
                            </button>
                            <div class="mt-0.5 whitespace-nowrap">${formatMaskedPhone(t.customer_phone)}</div>
                            <div class="mt-1">${callStatusSelector(t)}</div>
                        </td>
                        <!-- 3. Thú cưng (Editable Cân nặng & Hotel) -->
                        <td class="p-2">
                            <div class="font-bold text-sky-700">🐾 ${t.pet_name || 'Bé cưng'} <span class="text-xs font-medium text-slate-600">(${t.pet_breed || t.pet_species || 'Cún'})</span></div>
                            <div class="flex items-center gap-1 mt-1 text-xs">
                                <span class="text-slate-400">Kg:</span>
                                <input type="text" class="w-14 border-2 border-sky-200 p-0.5 rounded text-xs text-center font-bold text-sky-700 bg-white" value="${t.weight_at_service ? String(t.weight_at_service).replace('.', ',') : ''}" placeholder="Kg" oninput="onSpaSpreadsheetWeightChange(${t.id}, this)">
                                <label class="inline-flex items-center gap-0.5 text-xs text-sky-800 font-bold ml-1 cursor-pointer" title="Spa xong gửi hotel">
                                    <input type="checkbox" ${t.send_to_hotel ? 'checked' : ''} onchange="markTicketDirty(${t.id}, 'send_to_hotel', this.checked ? 1 : 0, this)"> 🏨
                                </label>
                            </div>
                        </td>
                        <!-- 5. Dịch vụ -->
                        <td class="p-2">
                            <div class="font-bold text-slate-800 text-xs">${t.service_type || '-'}</div>
                            ${t.dye_package ? `<div class="text-xs text-sky-700 font-semibold">🎨 ${t.dye_package}</div>` : ''}
                        </td>
                        <!-- 6. Yêu cầu & Phụ kiện (Editable) -->
                        <td class="p-2 space-y-1">
                            <input type="text" class="w-full border p-1 rounded text-xs bg-white text-slate-800" value="${t.customer_request || ''}" placeholder="Yêu cầu khách..." oninput="markTicketDirty(${t.id}, 'customer_request', this.value, this)">
                            <input type="text" class="w-full border p-1 rounded text-xs bg-white text-amber-800 font-medium" value="${t.accessories || ''}" placeholder="Phụ kiện (dây, chuồng...)" oninput="markTicketDirty(${t.id}, 'accessories', this.value, this)">
                            <input type="text" class="w-full border p-1 rounded text-xs bg-white text-slate-600" value="${t.note || ''}" placeholder="Ghi chú thợ..." oninput="markTicketDirty(${t.id}, 'note', this.value, this)">
                        </td>
                        <!-- 7. Thợ phụ trách (Editable gọn theo dịch vụ) -->
                        <td class="p-2 space-y-1">
                            ${getTicketStaffRoleConfig(t).needsCutter ? `<input type="text" class="w-full border p-1 rounded text-xs bg-white font-medium text-sky-700" value="${t.staff_cutter || ''}" placeholder="✂️ Thợ cắt..." oninput="markTicketDirty(${t.id}, 'staff_cutter', this.value, this)">` : ''}
                            <input type="text" class="w-full border p-1 rounded text-xs bg-white font-medium text-sky-700" value="${t.staff_worker_1 || ''}" placeholder="🛁 Thợ tắm..." oninput="markTicketDirty(${t.id}, 'staff_worker_1', this.value, this)">
                            ${getTicketStaffRoleConfig(t).needsDyer ? `<input type="text" class="w-full border border-amber-300 p-1 rounded text-xs bg-amber-50/40 font-medium text-amber-800" value="${t.staff_dyer || ''}" placeholder="🎨 Thợ nhuộm..." oninput="markTicketDirty(${t.id}, 'staff_dyer', this.value, this)">` : ''}
                            <input type="text" class="w-full border p-1 rounded text-xs bg-white font-medium text-sky-700" value="${t.staff_receiver || ''}" placeholder="📥 Thợ nhận..." oninput="markTicketDirty(${t.id}, 'staff_receiver', this.value, this)">
                        </td>
                        <!-- 8. Trạng thái làm (Editable) -->
                        <td class="p-2 text-center border-r-2 border-sky-300">
                            <select class="w-full border p-1 rounded text-xs font-bold ${t.status === 'completed' ? 'text-emerald-700 bg-emerald-50' : (t.status === 'in_progress' ? 'text-sky-700 bg-sky-50' : 'text-slate-700 bg-white')}" onchange="markTicketDirty(${t.id}, 'status', this.value, this)">
                                <option value="pending" ${t.status === 'pending' ? 'selected' : ''}>⏳ Chờ làm</option>
                                <option value="in_progress" ${t.status === 'in_progress' ? 'selected' : ''}>🔄 Đang làm</option>
                                <option value="completed" ${t.status === 'completed' ? 'selected' : ''}>✅ Đã xong</option>
                                <option value="checked_out" ${t.status === 'checked_out' ? 'selected' : ''}>🏠 Đã về</option>
                            </select>
                        </td>
                        <!-- 9. Phụ thu chi tiết (Editable qua Checkbox + Nhập tiền) -->
                        <td class="p-2 text-right space-y-1">
                            <div class="flex items-center justify-end gap-1 text-xs">
                                <label class="inline-flex items-center gap-1 cursor-pointer select-none text-slate-600">
                                    <input type="checkbox" ${t.teeth_cleaning > 0 ? 'checked' : ''} onchange="toggleSpaSpreadsheetCheckboxFee(${t.id}, 'teeth_cleaning', this.checked); this.parentElement.nextElementSibling.value = this.checked ? getSvcSurchargePrice('teeth').toLocaleString('vi-VN') : '';" class="w-3 h-3 text-sky-600 rounded">
                                    <span>Răng:</span>
                                </label>
                                <input type="text" class="w-14 border p-0.5 rounded text-xs text-right font-mono" value="${t.teeth_cleaning ? t.teeth_cleaning.toLocaleString('vi-VN') : ''}" placeholder="0" oninput="onMoneyInputChange(this); onSpaSpreadsheetDetailFeeChange(${t.id}, 'teeth_cleaning', this)">
                            </div>
                            <div class="flex items-center justify-end gap-1 text-xs">
                                <label class="inline-flex items-center gap-1 cursor-pointer select-none text-slate-600">
                                    <input type="checkbox" ${t.art_cutting_fee > 0 ? 'checked' : ''} onchange="toggleSpaSpreadsheetCheckboxFee(${t.id}, 'art_cutting_fee', this.checked); this.parentElement.nextElementSibling.value = this.checked ? getSvcSurchargePrice('art').toLocaleString('vi-VN') : '';" class="w-3 h-3 text-sky-600 rounded">
                                    <span>Cắt NT:</span>
                                </label>
                                <input type="text" class="w-14 border p-0.5 rounded text-xs text-right font-mono" value="${t.art_cutting_fee ? t.art_cutting_fee.toLocaleString('vi-VN') : ''}" placeholder="0" oninput="onMoneyInputChange(this); onSpaSpreadsheetDetailFeeChange(${t.id}, 'art_cutting_fee', this)">
                            </div>
                            <div class="flex items-center justify-end gap-1 text-xs">
                                <label class="inline-flex items-center gap-1 cursor-pointer select-none text-slate-600">
                                    <input type="checkbox" ${t.surcharge > 0 ? 'checked' : ''} onchange="toggleSpaSpreadsheetCheckboxFee(${t.id}, 'surcharge', this.checked); this.parentElement.nextElementSibling.value = this.checked ? getSvcSurchargePrice('surch').toLocaleString('vi-VN') : '';" class="w-3 h-3 text-sky-600 rounded">
                                    <span>Gỡ rối:</span>
                                </label>
                                <input type="text" class="w-14 border p-0.5 rounded text-xs text-right font-mono font-bold" value="${t.surcharge ? t.surcharge.toLocaleString('vi-VN') : ''}" placeholder="0" oninput="onMoneyInputChange(this); onSpaSpreadsheetDetailFeeChange(${t.id}, 'surcharge', this)">
                            </div>
                            <div class="flex items-center justify-end gap-1 text-xs">
                                <label class="inline-flex items-center gap-1 cursor-pointer select-none text-slate-600">
                                    <input type="checkbox" ${t.shipping_fee > 0 ? 'checked' : ''} onchange="toggleSpaSpreadsheetCheckboxFee(${t.id}, 'shipping_fee', this.checked); this.parentElement.nextElementSibling.value = this.checked ? getSvcSurchargePrice('ship').toLocaleString('vi-VN') : '';" class="w-3 h-3 text-sky-600 rounded">
                                    <span>Ship:</span>
                                </label>
                                <input type="text" class="w-14 border p-0.5 rounded text-xs text-right font-mono" value="${t.shipping_fee ? t.shipping_fee.toLocaleString('vi-VN') : ''}" placeholder="0" oninput="onMoneyInputChange(this); onSpaSpreadsheetDetailFeeChange(${t.id}, 'shipping_fee', this)">
                            </div>
                            <div class="flex items-center justify-end gap-1 text-xs">
                                <span class="text-emerald-700 font-bold">Tip:</span>
                                <input type="text" class="w-14 border p-0.5 rounded text-xs text-right font-mono font-bold text-emerald-700" value="${t.tip_amount ? t.tip_amount.toLocaleString('vi-VN') : ''}" placeholder="0" oninput="onMoneyInputChange(this); onSpaSpreadsheetDetailFeeChange(${t.id}, 'tip_amount', this)">
                            </div>
                        </td>
                        <!-- 10. Tổng tiền -->
                        <td class="p-2 text-right font-mono font-bold text-sky-700 text-sm">
                            <span id="spreadsheet-row-total-${t.id}">${formatMoney(t.price || 0)}</span>
                        </td>
                        <!-- 11. Thanh toán (Editable) -->
                        <td class="p-2 text-center">
                            <select class="border p-1 rounded text-xs font-bold ${t.payment_status === 'paid' ? 'text-emerald-700 bg-emerald-50' : 'text-amber-700 bg-amber-50'}" onchange="onSpaSpreadsheetPaymentStatusChange(${t.id}, this)">
                                <option value="unpaid" ${t.payment_status !== 'paid' ? 'selected' : ''}>Chưa TT</option>
                                <option value="paid" ${t.payment_status === 'paid' ? 'selected' : ''}>Đã TT</option>
                            </select>
                        </td>
                        <!-- 12. Đưa đón & Giờ Hẹn (Editable) -->
                        <td class="p-2 text-center text-xs space-y-1">
                            <div class="flex items-center justify-center gap-1">
                                <span class="text-sky-700 font-bold text-xs">Đến:</span>
                                <input type="text" class="w-14 border p-0.5 rounded text-xs text-center font-mono" value="${t.received_time || ''}" placeholder="Giờ đến" oninput="markTicketDirty(${t.id}, 'received_time', this.value, this)">
                            </div>
                            <div class="flex items-center justify-center gap-1">
                                <span class="text-emerald-700 font-bold text-xs">Về:</span>
                                <input type="text" class="w-14 border p-0.5 rounded text-xs text-center font-mono" value="${t.checkout_time || ''}" placeholder="Giờ về" oninput="markTicketDirty(${t.id}, 'checkout_time', this.value, this)">
                            </div>
                        </td>
                    </tr>
                    `;
                }

                // CHẾ ĐỘ XEM BÌNH THƯỜNG
                // Thợ làm
                let staffDisplay = [];
                if (t.staff_receiver) staffDisplay.push(`<span class="text-sky-700 font-bold" title="Nhận">📥 ${t.staff_receiver}</span>`);
                if (t.staff_cutter) staffDisplay.push(`<span class="text-sky-700 font-bold" title="Cắt">✂️ ${t.staff_cutter}</span>`);
                if (t.staff_worker_1) staffDisplay.push(`<span class="text-sky-700" title="Tắm/Làm 1">🛁 ${t.staff_worker_1}</span>`);
                if (t.staff_dyer) staffDisplay.push(`<span class="text-amber-700" title="Nhuộm">🎨 ${t.staff_dyer}</span>`);
                const staffHtml = staffDisplay.length > 0 ? staffDisplay.join('<br>') : '<span class="text-gray-400 ">Chưa phân công</span>';

                // Phụ thu
                let extraFees = [];
                if (t.teeth_cleaning) extraFees.push(`Răng: ${formatMoney(t.teeth_cleaning)}`);
                if (t.art_cutting_fee) extraFees.push(`Cắt NT: ${formatMoney(t.art_cutting_fee)}`);
                if (t.surcharge) extraFees.push(`Phụ thu: ${formatMoney(t.surcharge)}`);
                if (t.shipping_fee) extraFees.push(`Ship: ${formatMoney(t.shipping_fee)}`);
                if (t.tip_amount) extraFees.push(`<span class="text-emerald-700 font-bold">🎁 Tip: ${formatMoney(t.tip_amount)}</span>`);
                if (t.deposit_amount) extraFees.push(`<span class="text-sky-700 font-bold">💳 Đã cọc: ${formatMoney(t.deposit_amount)}</span>`);
                const extraFeesHtml = extraFees.length > 0 ? `<div class="text-xs text-amber-800 font-semibold space-y-0.5">${extraFees.join('<br>')}</div>` : '<span class="text-gray-400">-</span>';

                const isCheckedOut = (t.status === 'checked_out');
                if (isPaid) {
                    rowClass = 'card-row card-row-anim spa-paid-row text-sm transition bg-emerald-50/70 hover:bg-emerald-100/70 border-l-4 border-l-emerald-500';
                } else if (isCheckedOut) {
                    rowClass = 'card-row card-row-anim text-sm bg-emerald-50/30 hover:bg-emerald-50/60 ';
                } else {
                    rowClass = 'card-row card-row-anim text-sm hover:bg-sky-50/40';
                }

                return `
                <tr class="${rowClass}" style="--row-idx: ${idx};">
                    <!-- 1. STT / Mã & Thao Tác Trực Tiếp -->
                    <td class="p-2.5 text-center font-mono font-bold text-sky-700 border-r border-slate-200 min-w-[130px]">
                        <div class="flex items-center justify-center gap-1.5 mb-1">
                            <input type="checkbox" class="spa-row-select w-3.5 h-3.5 rounded border-slate-300 text-sky-600 focus:ring-sky-500 cursor-pointer" value="${t.id}" onchange="onSpaRowCheckboxChange(this, ${t.id})" ${selectedSpaTicketIds && selectedSpaTicketIds.has(t.id) ? 'checked' : ''} title="Chọn phiếu #${t.ticket_number || t.id}">
                            ${t.ticket_number ? `<span class="${isCheckedOut ? 'bg-emerald-100 text-emerald-900 border-emerald-300' : 'bg-sky-100 text-sky-900 border-sky-300'} border px-2 py-0.5 rounded text-sm font-bold shadow-xs">#${t.ticket_number}</span>` : '-'}
                        </div>
                        <div class="text-xs text-gray-400 font-mono my-1">${t.code || ''}</div>
                        <!-- Cụm nút thao tác trực tiếp dưới số phiếu -->
                        <div class="flex flex-wrap items-center justify-center gap-1 pt-1 border-t border-slate-200">
                            <button onclick="printPetServiceTicketDirectly(${t.id}, 'intake')" class="bg-sky-600 hover:bg-sky-700 text-white px-1.5 py-0.5 rounded text-xs font-bold shadow-xs" title="In 2 phiếu: Phiếu tiếp nhận Spa + Số thứ tự dán chuồng">🖨️</button>
                            <button onclick="printPetServiceTicketDirectly(${t.id}, 'invoice')" class="bg-emerald-600 hover:bg-emerald-700 text-white px-1.5 py-0.5 rounded text-xs font-bold shadow-xs" title="In hóa đơn thanh toán K80 (Tách Dịch Vụ, Cọc, Tip)">🧾</button>
                            ${!isCheckedOut ? `<button onclick="openSpaCheckoutModal(${t.id})" class="bg-emerald-700 hover:bg-emerald-800 text-white px-1.5 py-0.5 rounded text-xs font-bold shadow-xs" title="Thu tiền & trả bé">💰 Trả bé</button>` : ''}
                            ${isCheckedOut ? `<button onclick="reopenCheckedOutTicket(${t.id})" class="bg-amber-100 hover:bg-amber-200 text-amber-900 border border-amber-300 px-1 py-0.5 rounded text-xs font-bold shadow-xs" title="Hoàn tác về chờ đón">↩️</button>` : ''}
                            ${t.tip_amount > 0 ? `<button onclick="printPetServiceTicketDirectly(${t.id}, 'tip_slip')" class="bg-amber-500 hover:bg-amber-600 text-white px-1.5 py-0.5 rounded text-xs font-bold shadow-xs" title="In phiếu tip riêng cho thợ">🎁</button>` : ''}
                            ${t.deposit_amount > 0 ? `<button onclick="printPetServiceTicketDirectly(${t.id}, 'deposit_slip')" class="bg-sky-600 hover:bg-sky-700 text-white px-1.5 py-0.5 rounded text-xs font-bold shadow-xs" title="In biên nhận cọc">💳</button>` : ''}
                            <button onclick="deletePetService(${t.id})" class="text-rose-600 hover:text-rose-800 px-1 py-0.5 border border-rose-200 rounded text-xs font-bold" title="Xóa phiếu">🗑️</button>
                        </div>
                    </td>
                    <!-- 2. Khách hàng & Gọi điện -->
                    <td class="p-3 whitespace-nowrap min-w-[150px]">
                        <div class="font-bold text-slate-800">${t.customer_name || '-'}</div>
                        <div class="mt-0.5 whitespace-nowrap">${formatMaskedPhone(t.customer_phone)}</div>
                        <div class="mt-1">${callStatusSelector(t)}</div>
                    </td>
                    <!-- 3. Thú cưng -->
                    <td class="p-3">
                        <div class="font-bold text-sky-700">🐾 ${t.pet_name || 'Bé cưng'} <span class="text-xs font-medium text-slate-600">(${t.pet_breed || t.pet_species || 'Cún'})</span></div>
                        <div class="text-xs text-gray-600 flex items-center gap-1.5 mt-0.5">
                            <span>${t.pet_color || '-'}${t.pet_gender ? ' / ' + t.pet_gender : ''}</span>
                            ${t.weight_at_service ? `<span class="bg-sky-100 text-sky-800 font-bold px-1.5 py-0.2 rounded text-xs">${String(t.weight_at_service).replace('.', ',')} kg</span>` : ''}
                            ${t.send_to_hotel ? `<span class="bg-sky-100 text-sky-800 font-bold px-1.5 py-0.2 rounded text-xs" title="Spa xong gửi hotel">🏨</span>` : ''}
                        </div>
                    </td>
                    <!-- 5. Dịch vụ -->
                    <td class="p-3 cursor-pointer hover:bg-sky-50 transition group" onclick="openSpaCellDroplist(event, ${t.id}, 'service')" title="Bấm để chọn hoặc đổi gói dịch vụ">
                        <div class="flex items-center justify-between gap-1">
                            <div>
                                ${t.original_service_type && t.original_service_type !== t.service_type ? `
                                    <div class="text-xs text-slate-400 line-through decoration-rose-500 font-medium">
                                        ${escapeSpaHtml(t.original_service_type)} ${t.original_price ? `(${formatMoney(t.original_price)})` : ''}
                                    </div>
                                    <div class="flex items-center gap-1">
                                        <span class="text-xs text-rose-600 font-bold">👉</span>
                                        <span class="font-bold text-sky-900 group-hover:text-sky-700 transition">${escapeSpaHtml(t.service_type || '-')}</span>
                                    </div>
                                    <div class="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-amber-100 border border-amber-300 text-amber-900 text-xs font-bold mt-0.5" title="${escapeSpaHtml(t.service_change_reason || 'Đổi dịch vụ')}">
                                        <span>🔄 Đổi DV:</span>
                                        <span class="truncate max-w-[120px]">${escapeSpaHtml(t.service_change_reason || 'Theo hiện trạng')}</span>
                                    </div>
                                ` : `
                                    <div class="font-bold text-slate-800 group-hover:text-sky-700 transition">${escapeSpaHtml(t.service_type || '-')}</div>
                                `}
                                ${t.dye_package ? `<div class="text-xs text-sky-700 font-semibold">🎨 ${escapeSpaHtml(t.dye_package)}</div>` : ''}
                            </div>
                            <span class="text-slate-300 group-hover:text-sky-600 text-xs font-bold">▾</span>
                        </div>
                    </td>
                    <!-- 6. Lưu ý & Yêu cầu -->
                    <td class="p-3 text-xs text-gray-700 max-w-xs cursor-pointer hover:bg-sky-50 transition group" onclick="openSpaCellDroplist(event, ${t.id}, 'request')" title="Bấm để sửa nhanh yêu cầu & phụ kiện">
                        <div class="flex items-start justify-between gap-1">
                            <div>
                                ${t.shaving_feet ? `<span class="bg-sky-100 text-sky-800 font-bold px-1.5 py-0.5 rounded text-xs mr-1">${t.shaving_feet}</span>` : ''}
                                ${t.customer_request ? `<div class="font-medium text-slate-700">${t.customer_request}</div>` : ''}
                                ${t.accessories ? `<div class="text-xs text-amber-700 font-medium">🎒 ${t.accessories}</div>` : ''}
                                ${t.note ? `<div class="text-xs  text-gray-500">📝 ${t.note}</div>` : ''}
                                ${(!t.shaving_feet && !t.customer_request && !t.accessories && !t.note) ? '<span class="text-gray-400 ">Không có yêu cầu</span>' : ''}
                            </div>
                            <span class="text-slate-300 group-hover:text-sky-600 text-xs font-bold">▾</span>
                        </div>
                    </td>
                    <!-- 7. Thợ phụ trách -->
                    <td class="p-3 text-xs cursor-pointer hover:bg-sky-50 transition group" onclick="openSpaCellDroplist(event, ${t.id}, 'staff')" title="Bấm để phân công thợ làm">
                        <div class="flex items-center justify-between gap-1">
                            <div>${staffHtml}</div>
                            <span class="text-slate-300 group-hover:text-sky-600 text-xs font-bold">▾</span>
                        </div>
                    </td>
                    <!-- 8. Trạng thái làm -->
                    <td class="p-3 text-center border-r-2 border-sky-300">${statusSelector(t)}</td>
                    <!-- 9. Phụ thu -->
                    <td class="p-3 text-right font-medium">${extraFeesHtml}</td>
                    <!-- 10. Tổng tiền & Thực thu tách bạch -->
                    <td class="p-3 text-right">
                        <div class="font-mono font-bold text-sky-700 text-sm">${formatMoney(t.price || 0)}</div>
                        ${(t.tip_amount || t.deposit_amount || t.spa_wallet_deduction) ? `
                            <div class="text-xs text-gray-500 font-mono mt-0.5">
                                ${t.tip_amount ? `<span class="text-emerald-700 font-bold">+${formatMoney(t.tip_amount)} tip</span> ` : ''}
                                ${t.deposit_amount ? `<span class="text-sky-700 font-bold">-${formatMoney(t.deposit_amount)} cọc</span> ` : ''}
                                ${t.spa_wallet_deduction ? `<span class="text-sky-700 font-bold">-${formatMoney(t.spa_wallet_deduction)} ví</span>` : ''}
                            </div>
                            <div class="text-[11.5px] font-bold text-slate-800 font-mono mt-0.5" title="Thực thu tiền mặt/chuyển khoản ngoài (Tổng - Cọc - Ví)">
                                👉 ${formatMoney(Math.max(0, (t.price || 0) - (t.deposit_amount || 0) - (t.spa_wallet_deduction || 0)))}
                            </div>
                        ` : ''}
                    </td>
                    <!-- 11. Thanh toán -->
                    <td class="p-3 text-center">
                        ${t.payment_status === 'paid' ? '<span class="bg-emerald-100 text-emerald-800 font-bold px-1.5 py-0.5 rounded text-xs">Đã TT</span>' : '<span class="bg-amber-100 text-amber-800 font-bold px-1.5 py-0.5 rounded text-xs">Chưa TT</span>'}
                    </td>
                    <!-- 12. Đưa đón -->
                    <td class="p-3 text-center text-xs text-gray-600">
                        <div><span class="text-sky-700 font-bold">Đến:</span> <strong>${t.received_time || '-'}</strong> <span class="text-xs text-gray-500">(${t.arrival_method || 'Tự đến'})</span></div>
                        <div><span class="text-emerald-700 font-bold">Về:</span> <strong>${t.checkout_time || '-'}</strong> <span class="text-xs text-gray-500">(${t.return_method || 'Tự về'})</span></div>
                    </td>
                </tr>
                `;
            }).join('');

            if (typeof renderPaginationBar === 'function') {
                renderPaginationBar('pagination-pet-services', petServicesCurrentPage, totalPages, totalItems, 'changePetServicesPage');
            }
            updateSpaBulkToolbar();
        }

        function renderKanbanBoard() {
            const kanbanContainer = document.getElementById('kanban-board');
            if (!kanbanContainer) return;
            if (!Array.isArray(allPetServiceTickets)) allPetServiceTickets = [];

            const q = (document.getElementById('search-pet-services')?.value || '').trim().toLowerCase();
            const todayStr = getLocalTodayDateStr();
            let filtered = allPetServiceTickets.filter(t => {
                if (petServiceFilterDate === 'today') {
                    if (t.ticket_date && t.ticket_date !== todayStr) return false;
                } else if (petServiceFilterDate !== 'all') {
                    if (t.ticket_date && t.ticket_date !== petServiceFilterDate) return false;
                }
                if (petServiceFilterKpiMode === 'uncalled') {
                    if (t.status !== 'completed') return false;
                    const cs = t.call_status || 'Chưa gọi';
                    if (cs === 'Đã gọi đón') return false;
                } else if (petServiceFilterKpiMode === 'not_checked_out') {
                    if (t.status === 'checked_out') return false;
                } else if (petServiceFilterKpiMode === 'transport') {
                    if (!t.has_transport && !t.shipping_fee) return false;
                }
                if (q) {
                    const phoneTokens = typeof window.buildContactPhoneSearchTokens === 'function'
                        ? window.buildContactPhoneSearchTokens(t.customer_phone)
                        : String(t.customer_phone || '');
                    const hay = `${t.code||''} ${t.customer_name||''} ${t.customer_phone||''} ${phoneTokens} ${t.pet_name||''} ${t.service_type||''} ${t.staff_cutter||''} ${t.staff_worker_1||''} ${t.staff_dyer||''} ${t.staff_receiver||''}`.toLowerCase();
                    const qDigits = q.replace(/\D+/g, '');
                    const matchText = hay.includes(q) || (typeof removeVietnameseTones === 'function' && removeVietnameseTones(hay).includes(removeVietnameseTones(q)));
                    const matchDigits = qDigits.length >= 3 && phoneTokens.includes(qDigits);
                    if (!matchText && !matchDigits) return false;
                }
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
                    colEl.innerHTML = '<div class="text-xs text-gray-400  text-center py-12">Không có phiếu</div>';
                    return;
                }

                colEl.innerHTML = ticketsInCol.map(t => {
                    // Thợ phụ trách
                    let staffPills = [];
                    if (t.staff_receiver) staffPills.push(`<span class="text-sky-700 font-semibold">📥 ${t.staff_receiver}</span>`);
                    if (t.staff_cutter) staffPills.push(`<span class="text-sky-700 font-semibold">✂️ ${t.staff_cutter}</span>`);
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
                        <div class="bg-white rounded-xl border-2 border-slate-200 p-3.5 shadow-sm space-y-2.5 hover:border-sky-400 hover:shadow-md transition">
                            <!-- Header thẻ: STT to nổi bật + Dropdown đổi trạng thái trực tiếp -->
                            <div class="flex items-center justify-between gap-2 pb-2 border-b border-slate-100">
                                <div class="flex items-center gap-2">
                                    <span class="text-xl font-bold font-mono text-sky-900 bg-sky-100 border-2 border-sky-300 px-3 py-0.5 rounded-lg shadow-xs">#${t.ticket_number || t.id}</span>
                                    <span class="text-xs text-gray-400 font-mono">${t.code || ''}</span>
                                </div>
                                <div>
                                    ${statusSelector(t)}
                                </div>
                            </div>

                            <!-- Giờ nhận / Giờ trả -->
                            <div class="text-xs bg-slate-50 px-2 py-1 rounded-md border border-slate-100 flex items-center justify-between text-slate-600">
                                <div><span class="text-sky-700 font-bold">📥 Đến:</span> <strong>${t.received_time || '-'}</strong> <span class="text-xs text-gray-500">(${t.arrival_method || 'Tự đến'})</span></div>
                                ${t.checkout_time ? `<div><span class="text-emerald-700 font-bold">📤 Về:</span> <strong>${t.checkout_time}</strong></div>` : ''}
                            </div>

                            <!-- Khách hàng & Cập nhật Gọi Điện Ngay Tại Thẻ -->
                            <div class="flex items-center justify-between gap-2 bg-slate-50/70 p-2 rounded-lg border border-slate-100">
                                <div class="min-w-0 flex-1">
                                    <button type="button" onclick="openQuickCustomerInfoModal(${t.customer_id}, '${escapeJs(t.customer_name || '')}')" class="text-left font-bold text-slate-800 hover:text-sky-700 hover:underline text-xs truncate block" title="Xem nhanh hồ sơ khách">
                                        👤 ${t.customer_name || 'Khách lẻ'}
                                    </button>
                                    <div class="font-mono text-xs text-gray-500 mt-0.5">${formatMaskedPhone(t.customer_phone)}</div>
                                </div>
                                <div class="flex-shrink-0">
                                    ${callStatusSelector(t)}
                                </div>
                            </div>

                            <!-- Thông tin bé cưng -->
                            <div>
                                <div class="font-bold text-sm text-slate-900 flex items-center gap-1.5">
                                    <span class="text-sky-600 font-bold">🐾 ${t.pet_name || 'Bé cưng'}</span>
                                    <span class="text-xs font-normal text-slate-500">(${t.pet_breed || t.pet_species || 'Cún'})</span>
                                </div>
                                <div class="text-xs text-sky-700 font-bold mt-0.5 flex items-center gap-2">
                                    <span class="bg-sky-100 text-sky-800 px-2 py-0.2 rounded font-bold">${t.weight_at_service ? String(t.weight_at_service).replace('.', ',') + ' kg' : '-'}</span>
                                    <span class="text-slate-600 font-normal">${t.pet_color || '-'}${t.pet_gender ? ' / ' + t.pet_gender : ''}</span>
                                </div>
                            </div>

                            <!-- Gói dịch vụ & Ghi chú -->
                            <div class="text-xs bg-sky-50/50 p-2 rounded-lg border border-sky-100 space-y-1">
                                <div class="font-bold text-sky-950">${t.service_type || '-'}</div>
                                ${t.dye_package ? `<div class="text-xs text-sky-700 font-semibold">🎨 Nhuộm: ${t.dye_package}</div>` : ''}
                                ${t.shaving_feet ? `<div class="text-xs text-sky-800 font-medium">⚡ Cạo bàn: <strong>${t.shaving_feet}</strong></div>` : ''}
                                ${t.customer_request ? `<div class="text-xs text-slate-700">✂️ Y/c: ${t.customer_request}</div>` : ''}
                                ${t.accessories ? `<div class="text-xs text-amber-700">🎒 PK: ${t.accessories}</div>` : ''}
                                ${t.note ? `<div class="text-xs text-gray-500 ">📝 ${t.note}</div>` : ''}
                            </div>

                            <!-- Thợ phụ trách -->
                            ${staffPills.length > 0 ? `
                                <div class="text-xs bg-slate-100/80 p-1.5 rounded-lg flex flex-wrap gap-x-2 gap-y-1">
                                    ${staffPills.join('')}
                                </div>
                            ` : ''}

                            <!-- Phụ thu (nếu có) -->
                            ${extraFeesText ? `
                                <div class="text-xs text-amber-800 bg-amber-50 px-2 py-1 rounded border border-amber-200">
                                    <strong>Phụ thu:</strong> ${extraFeesText}
                                </div>
                            ` : ''}

                            <!-- Tổng tiền & TT -->
                            <div class="flex items-center justify-between text-xs pt-2 border-t border-slate-100">
                                <div>
                                    <span class="text-xs text-gray-500">Tổng thu:</span>
                                    <span class="font-mono font-bold text-sky-700 text-sm ml-1">${formatMoney(t.price || 0)}</span>
                                </div>
                                <div>
                                    ${t.payment_status === 'paid' ? '<span class="text-xs bg-emerald-100 text-emerald-800 font-bold px-2 py-0.5 rounded">Đã TT</span>' : '<span class="text-xs bg-amber-100 text-amber-800 font-bold px-2 py-0.5 rounded">Chưa TT</span>'}
                                </div>
                            </div>

                            <!-- Nút chuyển tiến độ 1-click & Nút hoàn tác (Đã về vẫn hoàn tác lại được) -->
                            <div class="pt-2 border-t border-slate-100 flex items-center justify-between gap-1.5">
                                <div class="flex items-center gap-1">
                                    <button onclick="printPetServiceTicketDirectly(${t.id}, 'intake')" class="text-xs bg-sky-50 hover:bg-sky-100 text-sky-800 font-bold px-2 py-1 rounded border border-sky-200" title="In phiếu nhận K80">🖨️ Nhận</button>
                                    <button onclick="printPetServiceTicketDirectly(${t.id}, 'invoice')" class="text-xs bg-emerald-50 hover:bg-emerald-100 text-emerald-800 font-bold px-2 py-1 rounded border border-emerald-200" title="In hóa đơn thanh toán K80">🧾 Trả</button>
                                    ${t.status !== 'checked_out' ? `<button onclick="openSpaCheckoutModal(${t.id})" class="text-xs bg-emerald-700 hover:bg-emerald-800 text-white font-bold px-2 py-1 rounded" title="Thu tiền & trả bé">💰 Trả bé</button>` : ''}
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
                                            <button onclick="updateServiceStatus(${t.id}, 'checked_out')" class="text-xs bg-sky-600 hover:bg-sky-700 text-white font-bold px-2.5 py-1 rounded shadow-sm">🏠 Trả Bé</button>
                                        </div>
                                    ` : ''}
                                    ${t.status === 'checked_out' ? `<button onclick="updateServiceStatus(${t.id}, 'completed')" class="text-xs bg-amber-100 hover:bg-amber-200 text-amber-900 border border-amber-300 font-bold px-2 py-1 rounded shadow-xs" title="Hoàn tác về Xong (chờ đón)">↩️ Mở lại</button>` : ''}
                                </div>
                            </div>
                        </div>
                    `;
                }).join('');
            });
        }

        // ==========================================
        // QUẢN LÝ LỊCH SỬ HÓA ĐƠN SPA (TAB HÓA ĐƠN)
        // ==========================================
        let allSpaInvoicesData = [];
        let spaInvoicesCurrentPage = 1;
        var spaInvoiceFilterDate = 'today';

        function switchOrderSubTab(sub) {
            const btnRetail = document.getElementById('btn-subtab-order-retail');
            const btnSpa = document.getElementById('btn-subtab-order-spa');
            const btnHotel = document.getElementById('btn-subtab-order-hotel');
            const btnTopup = document.getElementById('btn-subtab-order-topup');
            const viewRetail = document.getElementById('orders-subview-retail');
            const viewSpa = document.getElementById('orders-subview-spa');
            const viewHotel = document.getElementById('orders-subview-hotel');
            const viewTopup = document.getElementById('orders-subview-topup');

            const activeRetailClass = 'px-4 py-2.5 text-xs font-bold border-b-2 border-sky-600 text-sky-700 flex items-center gap-1.5 transition';
            const inactiveRetailClass = 'px-4 py-2.5 text-xs font-semibold text-slate-500 hover:text-slate-700 flex items-center gap-1.5 transition border-b-0';
            const activeSpaClass = 'px-4 py-2.5 text-xs font-bold border-b-2 border-sky-600 text-sky-700 flex items-center gap-1.5 transition';
            const inactiveSpaClass = 'px-4 py-2.5 text-xs font-semibold text-slate-500 hover:text-slate-700 flex items-center gap-1.5 transition border-b-0';
            const activeHotelClass = 'px-4 py-2.5 text-xs font-bold border-b-2 border-sky-600 text-sky-700 flex items-center gap-1.5 transition';
            const inactiveHotelClass = 'px-4 py-2.5 text-xs font-semibold text-slate-500 hover:text-slate-700 flex items-center gap-1.5 transition border-b-0';
            const activeTopupClass = 'px-4 py-2.5 text-xs font-bold border-b-2 border-amber-600 text-amber-700 flex items-center gap-1.5 transition';
            const inactiveTopupClass = 'px-4 py-2.5 text-xs font-semibold text-slate-500 hover:text-slate-700 flex items-center gap-1.5 transition border-b-0';

            if (btnRetail) btnRetail.className = (sub === 'retail' ? activeRetailClass : inactiveRetailClass);
            if (btnSpa) btnSpa.className = (sub === 'spa' ? activeSpaClass : inactiveSpaClass);
            if (btnHotel) btnHotel.className = (sub === 'hotel' ? activeHotelClass : inactiveHotelClass);
            if (btnTopup) btnTopup.className = (sub === 'topup' ? activeTopupClass : inactiveTopupClass);

            if (viewRetail) viewRetail.classList.toggle('hidden', sub !== 'retail');
            if (viewSpa) viewSpa.classList.toggle('hidden', sub !== 'spa');
            if (viewHotel) viewHotel.classList.toggle('hidden', sub !== 'hotel');
            if (viewTopup) viewTopup.classList.toggle('hidden', sub !== 'topup');

            if (sub === 'retail') {
                if (typeof loadOrdersList === 'function') loadOrdersList();
            } else if (sub === 'spa') {
                loadSpaInvoicesList();
            } else if (sub === 'hotel') {
                if (window.hotelManager && typeof window.hotelManager.loadHistory === 'function') {
                    window.hotelManager.loadHistory();
                }
            } else if (sub === 'topup') {
                if (typeof loadTopupOrdersList === 'function') loadTopupOrdersList();
            }
        }
        window.switchOrderSubTab = switchOrderSubTab;

        function setSpaInvoiceDateFilter(mode) {
            spaInvoiceFilterDate = mode;
            const btnToday = document.getElementById('btn-spa-inv-date-today');
            const btnAll = document.getElementById('btn-spa-inv-date-all');
            const inputCustom = document.getElementById('input-spa-inv-date-custom');
            if (btnToday) {
                btnToday.className = (mode === 'today')
                    ? 'px-2.5 py-1.5 text-xs font-bold rounded-l-md bg-sky-700 text-white shadow'
                    : 'px-2.5 py-1.5 text-xs font-bold rounded-l-md bg-white text-slate-700 hover:bg-gray-50';
            }
            if (btnAll) {
                btnAll.className = (mode === 'all')
                    ? 'px-2.5 py-1.5 text-xs font-bold text-white bg-sky-700 shadow border-r border-sky-700'
                    : 'px-2.5 py-1.5 text-xs font-bold text-slate-700 hover:bg-gray-50 border-r border-slate-200';
            }
            if (inputCustom && mode !== 'today' && mode !== 'all') {
                inputCustom.value = mode;
            } else if (inputCustom && (mode === 'today' || mode === 'all')) {
                inputCustom.value = '';
            }
            spaInvoicesCurrentPage = 1;
            filterSpaInvoicesList();
        }
        window.setSpaInvoiceDateFilter = setSpaInvoiceDateFilter;

        function changeSpaInvoicesPage(newPage) {
            spaInvoicesCurrentPage = newPage;
            filterSpaInvoicesList();
        }
        window.changeSpaInvoicesPage = changeSpaInvoicesPage;

        async function loadSpaInvoicesList() {
            const tbody = document.getElementById('spa-invoices-table-body');
            if (!tbody) return;
            tbody.innerHTML = '<tr><td colspan="12" class="p-6 text-center text-gray-400 ">Đang tải lịch sử hóa đơn Spa...</td></tr>';
            try {
                const res = await fetch('/api/pet-services?limit=500');
                if (!res.ok) throw new Error('Không thể tải hóa đơn spa');
                allSpaInvoicesData = await res.json();
                filterSpaInvoicesList();
            } catch (e) {
                console.error("loadSpaInvoicesList error:", e);
                tbody.innerHTML = '<tr><td colspan="12" class="p-6 text-center text-red-500 ">Lỗi khi tải lịch sử hóa đơn Spa!</td></tr>';
            }
        }
        window.loadSpaInvoicesList = loadSpaInvoicesList;

        function filterSpaInvoicesList(customData) {
            const tbody = document.getElementById('spa-invoices-table-body');
            if (!tbody) return;
            if (Array.isArray(customData)) allSpaInvoicesData = customData;
            if (!Array.isArray(allSpaInvoicesData) || allSpaInvoicesData.length === 0) {
                if (Array.isArray(window.allSpaInvoicesData) && window.allSpaInvoicesData.length > 0) {
                    allSpaInvoicesData = window.allSpaInvoicesData;
                } else if (Array.isArray(allPetServiceTickets) && allPetServiceTickets.length > 0) {
                    allSpaInvoicesData = allPetServiceTickets;
                }
            }

            const q = (document.getElementById('search-spa-invoices')?.value || '').trim().toLowerCase();
            const statusFilter = document.getElementById('select-spa-invoice-status-filter')?.value || 'checked_out';
            const paymentFilter = document.getElementById('select-spa-invoice-payment-filter')?.value || 'all';
            const todayStr = getLocalTodayDateStr();

            let filtered = allSpaInvoicesData.filter(t => {
                // Lọc ngày
                if (spaInvoiceFilterDate === 'today') {
                    if (t.ticket_date && t.ticket_date !== todayStr) return false;
                } else if (spaInvoiceFilterDate !== 'all') {
                    if (t.ticket_date && t.ticket_date !== spaInvoiceFilterDate) return false;
                }

                // Lọc trạng thái
                if (statusFilter !== 'all' && t.status !== statusFilter) return false;

                // Lọc thanh toán
                if (paymentFilter === 'paid' && t.payment_status !== 'paid') return false;
                if (paymentFilter === 'unpaid' && t.payment_status === 'paid') return false;

                // Lọc tìm kiếm
                if (q && !(t.code||'').toLowerCase().includes(q) && !(t.customer_name||'').toLowerCase().includes(q) && !(t.customer_phone||'').includes(q) && !(t.pet_name||'').toLowerCase().includes(q) && !(t.service_type||'').toLowerCase().includes(q) && !(t.staff_cutter||'').toLowerCase().includes(q)) return false;

                return true;
            });

            // Update badge & stats
            const countBadge = document.getElementById('spa-invoices-count-badge');
            const revBadge = document.getElementById('spa-inv-total-revenue');
            if (countBadge) countBadge.textContent = `${filtered.length} hóa đơn`;
            if (revBadge) {
                const totalRev = filtered.reduce((sum, t) => sum + (Number(t.price) || 0), 0);
                revBadge.textContent = formatMoney(totalRev);
            }

            renderSpaInvoicesTable(filtered);
        }
        window.filterSpaInvoicesList = filterSpaInvoicesList;

        function renderSpaInvoicesTable(filteredTickets) {
            const tbody = document.getElementById('spa-invoices-table-body');
            if (!tbody) return;
            const items = filteredTickets || [];

            if (items.length === 0) {
                tbody.innerHTML = '<tr><td colspan="12" class="p-8 text-center text-slate-400 ">Không tìm thấy hóa đơn dịch vụ Spa nào phù hợp</td></tr>';
                const pContainer = document.getElementById('pagination-spa-invoices');
                if (pContainer) pContainer.innerHTML = '';
                return;
            }

            const totalItems = items.length;
            const totalPages = Math.ceil(totalItems / 20) || 1;
            if (spaInvoicesCurrentPage > totalPages) spaInvoicesCurrentPage = totalPages;
            if (spaInvoicesCurrentPage < 1) spaInvoicesCurrentPage = 1;
            const paged = items.slice((spaInvoicesCurrentPage - 1) * 20, spaInvoicesCurrentPage * 20);

            tbody.innerHTML = paged.map((t) => {
                // Thợ phụ trách
                let staffHtml = '';
                if (t.staff_cutter) staffHtml += `<div class="font-bold text-sky-700">✂️ ${escapeSpaHtml(t.staff_cutter)}</div>`;
                if (t.staff_worker_1) staffHtml += `<div class="text-xs text-sky-700">🛁 ${escapeSpaHtml(t.staff_worker_1)}</div>`;
                if (t.staff_receiver) staffHtml += `<div class="text-xs text-sky-700">📥 ${escapeSpaHtml(t.staff_receiver)}</div>`;
                if (!staffHtml) staffHtml = '<span class="text-gray-400 ">-</span>';

                // Phụ thu
                let extraFees = [];
                if (t.teeth_cleaning) extraFees.push(`Răng: ${formatMoney(t.teeth_cleaning)}`);
                if (t.art_cutting_fee) extraFees.push(`Cắt NT: ${formatMoney(t.art_cutting_fee)}`);
                if (t.surcharge) extraFees.push(`Gỡ rối: ${formatMoney(t.surcharge)}`);
                if (t.shipping_fee) extraFees.push(`Ship: ${formatMoney(t.shipping_fee)}`);
                const extraFeesHtml = extraFees.length > 0 ? `<div class="text-xs text-amber-800 font-semibold">${extraFees.join('<br>')}</div>` : '<span class="text-gray-400">-</span>';

                // Trạng thái badge
                let statusBadge = '';
                if (t.status === 'checked_out') statusBadge = '<span class="bg-emerald-100 text-emerald-800 font-bold px-1.5 py-0.5 rounded text-xs">🏠 Đã về</span>';
                else if (t.status === 'completed') statusBadge = '<span class="bg-sky-100 text-sky-800 font-bold px-1.5 py-0.5 rounded text-xs">✅ Đã xong</span>';
                else if (t.status === 'in_progress') statusBadge = '<span class="bg-sky-100 text-sky-800 font-bold px-1.5 py-0.5 rounded text-xs">🔄 Đang làm</span>';
                else statusBadge = '<span class="bg-amber-100 text-amber-800 font-bold px-1.5 py-0.5 rounded text-xs">⏳ Chờ</span>';

                const payBadge = t.payment_status === 'paid' 
                    ? '<span class="bg-emerald-100 text-emerald-800 font-bold px-1.5 py-0.5 rounded text-xs">Đã TT</span>'
                    : '<span class="bg-rose-100 text-rose-800 font-bold px-1.5 py-0.5 rounded text-xs">Chưa TT</span>';

                const walletDed = Number(t.spa_wallet_deduction || 0);
                const totalActual = Math.max(0, (Number(t.price) || 0) - walletDed - (Number(t.deposit_amount) || 0));

                return `
                <tr class="hover:bg-sky-50/20 transition text-[12px] border-b border-slate-100">
                    <td class="p-2.5 text-center font-mono font-bold text-sky-700 border-r border-slate-200">
                        <div class="flex items-center justify-center gap-1">
                            ${t.ticket_number ? `<span class="bg-sky-100 text-sky-900 border border-sky-300 px-2 py-0.5 rounded text-xs font-bold shadow-xs">#${t.ticket_number}</span>` : '-'}
                        </div>
                        <div class="text-xs text-gray-400 font-mono my-0.5">${t.code || ''}</div>
                    </td>
                    <td class="p-3 whitespace-nowrap text-slate-600">
                        <div class="font-bold text-slate-800">${t.ticket_date || '-'}</div>
                        <div class="text-xs text-gray-400">Đến: ${t.received_time || '-'}</div>
                        ${t.checkout_time ? `<div class="text-xs text-emerald-600 font-semibold">Về: ${t.checkout_time}</div>` : ''}
                    </td>
                    <td class="p-3 whitespace-nowrap min-w-[130px]">
                        <div class="font-bold text-slate-800">${escapeSpaHtml(t.customer_name || '-')}</div>
                        <div class="mt-0.5 whitespace-nowrap">${formatMaskedPhone(t.customer_phone)}</div>
                    </td>
                    <td class="p-3">
                        <div class="font-bold text-sky-700">🐾 ${escapeSpaHtml(t.pet_name || 'Bé cưng')}</div>
                        <div class="text-xs text-gray-500">${escapeSpaHtml(t.pet_breed || t.pet_species || 'Cún')} ${t.weight_at_service ? `(${String(t.weight_at_service).replace('.', ',')} kg)` : ''}</div>
                    </td>
                    <td class="p-3">
                        <div class="font-bold text-slate-800">${escapeSpaHtml(t.service_type || '-')}</div>
                        ${t.dye_package ? `<div class="text-xs text-sky-700 font-semibold">🎨 ${escapeSpaHtml(t.dye_package)}</div>` : ''}
                        ${extraFeesHtml}
                    </td>
                    <td class="p-3 text-xs">${staffHtml}</td>
                    <td class="p-3 text-right font-mono font-bold text-slate-800">${formatMoney(t.price || 0)}</td>
                    <td class="p-3 text-right font-mono text-emerald-700 text-xs">${t.tip_amount ? `+${formatMoney(t.tip_amount)}` : '-'}</td>
                    <td class="p-3 text-right font-mono text-amber-700 text-xs">${t.deposit_amount ? `-${formatMoney(t.deposit_amount)}` : '-'}</td>
                    <td class="p-3 text-right font-mono font-bold text-sky-700 text-sm">
                        <div>${formatMoney(totalActual)}</div>
                        ${walletDed > 0 ? `<div class="text-xs text-sky-700 font-bold font-mono">Ví: -${formatMoney(walletDed)}</div>` : ''}
                    </td>
                    <td class="p-3 text-center">
                        <div class="flex flex-col items-center gap-1">
                            ${statusBadge}
                            ${payBadge}
                        </div>
                    </td>
                    <td class="p-3 text-center">
                        <div class="flex items-center justify-center gap-1 flex-wrap">
                            <button onclick="printPetServiceTicketDirectly(${t.id}, 'invoice')" class="bg-emerald-600 hover:bg-emerald-700 text-white px-2 py-1 rounded text-xs font-bold shadow-xs" title="In lại hóa đơn K80">🧾 In Bill</button>
                            <button onclick="printPetServiceTicketDirectly(${t.id}, 'service')" class="bg-sky-600 hover:bg-sky-700 text-white px-2 py-1 rounded text-xs font-bold shadow-xs" title="In phiếu dịch vụ">📋 Phiếu</button>
                            ${t.status === 'checked_out' ? `<button onclick="reopenCheckedOutTicket(${t.id})" class="bg-amber-100 hover:bg-amber-200 text-amber-900 border border-amber-300 px-1.5 py-1 rounded text-xs font-bold shadow-xs" title="Hoàn tác phiếu đã về, đưa bé cưng quay lại Bảng Spa Trong Ngày">↩️ Mở lại</button>` : ''}
                            <button onclick="deletePetService(${t.id})" class="text-rose-600 hover:text-rose-800 p-1 border border-rose-200 rounded font-bold text-xs" title="Xóa phiếu">🗑️</button>
                        </div>
                    </td>
                </tr>
                `;
            }).join('');

            if (typeof renderPaginationBar === 'function') {
                renderPaginationBar('pagination-spa-invoices', spaInvoicesCurrentPage, totalPages, totalItems, 'changeSpaInvoicesPage');
            }
        }
        window.renderSpaInvoicesTable = renderSpaInvoicesTable;

        async function reopenCheckedOutTicket(ticketId) {
            const ticket = (allPetServiceTickets || []).find(t => t.id === Number(ticketId)) || (allSpaInvoicesData || []).find(t => t.id === Number(ticketId));
            const ticketName = ticket ? `phiếu #${ticket.ticket_number || ticket.id} (${ticket.pet_name || 'Bé cưng'})` : `phiếu #${ticketId}`;

            const confirmed = window.customConfirm
                ? await window.customConfirm(`Bạn có muốn mở lại ${ticketName}?\n\nPhiếu sẽ chuyển về trạng thái 'Đã Xong (Chờ Đón)' và xuất hiện lại trên Bảng Spa Trong Ngày.`, 'Hoàn Tác Trả Bé')
                : confirm(`Mở lại ${ticketName}?`);
            if (!confirmed) return;

            await updateServiceStatus(ticketId, 'completed');
            if (window.showToast) {
                showToast(`Đã mở lại ${ticketName}! Phiếu đã quay lại Bảng Spa Trong Ngày.`, 'success');
            }
            if (typeof loadSpaInvoicesList === 'function') loadSpaInvoicesList();
            if (typeof loadPetServicesList === 'function') loadPetServicesList(false);
        }
        window.reopenCheckedOutTicket = reopenCheckedOutTicket;


        // ==========================================
        // POPUP TRẢ BÉ & THANH TOÁN
        // ==========================================
        let spaCheckoutCtx = null;

        function isSpaWalletEligibleCombo(serviceName, itemObj = null) {
            if (!serviceName) return false;
            const nm = String(serviceName).trim().toLowerCase();
            if (!nm || nm === 'tiền tip thợ') return false;
            const baseNm = nm.replace(/\s*\([^)]*kg[^)]*\)\s*$/i, '').trim();

            if (Array.isArray(allPetPricingData) && allPetPricingData.length > 0) {
                const found = allPetPricingData.find(p => {
                    const s = String(p.service_name || '').trim().toLowerCase();
                    return s === nm || s === baseNm;
                });
                if (found && found.allow_spa_wallet !== undefined && found.allow_spa_wallet !== null) {
                    return Number(found.allow_spa_wallet) === 1;
                }
            }
            if (Array.isArray(window.allSpaCategories) && window.allSpaCategories.length > 0) {
                if (itemObj && itemObj.is_surcharge) {
                    const surCat = window.allSpaCategories.find(c => {
                        const cn = String(c.name || '').toLowerCase();
                        return cn.includes('phụ thu') || cn.includes('trị liệu');
                    });
                    if (surCat) return Number(surCat.allow_spa_wallet) === 1;
                }
                if (itemObj && itemObj.is_dye) {
                    const dyeCat = window.allSpaCategories.find(c => String(c.name || '').toLowerCase().includes('nhuộm'));
                    if (dyeCat) return Number(dyeCat.allow_spa_wallet) === 1;
                }
            }
            if (itemObj && (itemObj.is_surcharge || itemObj.is_dye)) return false;
            const nonWalletKw = [
                'nhuộm', 'phụ thu', 'đánh răng', 'gỡ rối', 'tẩy lông',
                'cắt tỉa đầu', 'tắm trị liệu', 'nấm da', 'cắt nghệ thuật',
                'tắm + massage', 'vệ sinh tai', 'cắt móng +', 'cạo lông toàn thân', 'cắt lông tạo kiểu'
            ];
            if (nonWalletKw.some(kw => nm.includes(kw))) return false;
            return true;
        }
        window.isSpaWalletEligibleCombo = isSpaWalletEligibleCombo;

        function getTicketStaffRoleConfig(ticket) {
            const svc = String(ticket?.service_type || '').toLowerCase();
            const dye = String(ticket?.dye_package || '').trim();
            const hasDye = Boolean(dye && dye.toLowerCase() !== 'không nhuộm') || svc.includes('nhuộm');
            const needsCutter = svc.includes('vip 3') || svc.includes('super vip') || svc.includes('cạo') || svc.includes('cắt tỉa') || svc.includes('cắt lông') || svc.includes('tạo kiểu') || Boolean(ticket?.staff_cutter);
            return {
                needsCutter,
                needsBather: true,
                needsDyer: hasDye || Boolean(ticket?.staff_dyer),
                needsReceiver: true
            };
        }
        window.getTicketStaffRoleConfig = getTicketStaffRoleConfig;

        // Phần dịch vụ spa đủ điều kiện trừ Ví Spa (Chỉ áp dụng cho gói Combo VIP 1, VIP 2, VIP 3, Super VIP; không trừ phụ thu, nhuộm lông, dịch vụ lẻ, tip, hàng bán kèm)
        function spaPureServiceTotal(t) {
            let items = [];
            try { items = JSON.parse(t.services_json || '[]'); } catch (e) { items = []; }
            if (!Array.isArray(items) || items.length === 0) {
                if (!isSpaWalletEligibleCombo(t.service_type || '')) return 0;
                const extra = (Number(t.tip_amount) || 0) + (Number(t.surcharge) || 0) + (Number(t.teeth_cleaning) || 0) + (Number(t.art_cutting_fee) || 0) + (Number(t.shipping_fee) || 0);
                return Math.max(0, (Number(t.price) || 0) - extra);
            }
            return items.reduce((s, it) => {
                if (!it || it.is_retail || it.is_tip || it.name === 'Tiền tip thợ') return s;
                if (!isSpaWalletEligibleCombo(it.name || '', it)) return s;
                return s + (Number(it.quantity) || 1) * (Number(it.price) || 0);
            }, 0);
        }

        function openSpaCheckoutModal(ticketId) {
            const t0 = (allPetServiceTickets || []).find(t => t.id === Number(ticketId));
            if (!t0) { alert('Không tìm thấy phiếu'); return; }
            // Cùng khách + cùng ngày + chưa trả bé (đón 2 bé một lần thì thu một lần)
            let group = (allPetServiceTickets || []).filter(x => x.customer_id === t0.customer_id && x.ticket_date === t0.ticket_date && x.status !== 'checked_out');
            if (!group.some(x => x.id === t0.id)) group.unshift(t0);
            group.sort((a, b) => (a.ticket_number || 0) - (b.ticket_number || 0));
            const cust = (allContacts || []).find(c => c.id == t0.customer_id);
            spaCheckoutCtx = { customerId: t0.customer_id, tickets: group, walletBalance: Number((cust && cust.spa_wallet_balance) || 0) };

            document.getElementById('spapay-cust-info').textContent = `${t0.customer_name || 'Khách'} · ${t0.customer_phone || 'Không SĐT'} · Ví Spa: ${formatMoneyString(spaCheckoutCtx.walletBalance)} đ`;
            document.getElementById('spapay-ticket-list').innerHTML = group.map(t => {
                const paid = t.payment_status === 'paid';
                const due = Math.max(0, (t.price || 0) - (t.deposit_amount || 0));
                return `
                <label class="flex items-center gap-2 border rounded-lg px-2 py-1.5 cursor-pointer hover:bg-slate-50 ${t.id === t0.id ? 'border-emerald-400 bg-emerald-50/40' : ''}">
                    <input type="checkbox" class="spapay-tick w-4 h-4 text-emerald-600 rounded" value="${t.id}" checked onchange="recalcSpaCheckout()">
                    <span class="font-mono font-bold text-sky-800 bg-sky-100 border border-sky-300 rounded px-1">#${t.ticket_number || t.id}</span>
                    <span class="font-bold text-slate-800">🐾 ${escapeSpaHtml(t.pet_name || 'Bé cưng')}</span>
                    <span class="text-slate-500 truncate flex-1">${escapeSpaHtml(t.service_type || '')}</span>
                    ${paid ? '<span class="text-xs bg-emerald-100 text-emerald-800 font-bold px-1.5 py-0.5 rounded">Đã TT</span>'
                           : `<span class="font-mono font-bold text-rose-700">${formatMoneyString(due)} đ</span>`}
                </label>`;
            }).join('');

            const wLabel = document.getElementById('spapay-wallet-label');
            const wInput = wLabel.querySelector('input');
            wInput.disabled = spaCheckoutCtx.walletBalance <= 0;
            wLabel.classList.toggle('opacity-40', wInput.disabled);
            wLabel.classList.toggle('cursor-not-allowed', wInput.disabled);
            const pre = t0.payment_method && t0.payment_status !== 'paid' && !wInput.disabled ? t0.payment_method : 'cash';
            const radio = document.querySelector(`input[name="spapay-method"][value="${pre}"]`) || document.querySelector('input[name="spapay-method"][value="cash"]');
            radio.checked = true;
            spapayAccountMethod = null;  // buộc nạp lại đúng loại tài khoản cho hình thức đang chọn
            document.getElementById('spapay-tendered').value = '';
            document.getElementById('modal-spa-checkout').classList.remove('hidden');
            recalcSpaCheckout();
            setTimeout(() => document.getElementById('spapay-tendered')?.focus(), 80);
        }
        window.openSpaCheckoutModal = openSpaCheckoutModal;

        function closeSpaCheckoutModal() {
            document.getElementById('modal-spa-checkout')?.classList.add('hidden');
            spaCheckoutCtx = null;
        }
        window.closeSpaCheckoutModal = closeSpaCheckoutModal;

        function getSpaCheckoutTotals() {
            const ctx = spaCheckoutCtx;
            const method = document.querySelector('input[name="spapay-method"]:checked')?.value || 'cash';
            const ticked = new Set(Array.from(document.querySelectorAll('.spapay-tick:checked')).map(c => Number(c.value)));
            let wallet = ctx.walletBalance, total = 0, deposit = 0, walletUse = 0, cash = 0, tip = 0;
            ctx.tickets.forEach(t => {
                if (!ticked.has(t.id)) return;
                tip += Number(t.tip_amount || 0);
                if (t.payment_status === 'paid') return;
                const dep = Number(t.deposit_amount || 0);
                const due = Math.max(0, Number(t.price || 0) - dep);
                total += Number(t.price || 0); deposit += dep;
                if (method === 'wallet') {
                    const w = Math.min(wallet, spaPureServiceTotal(t), due);
                    wallet -= w; walletUse += w; cash += due - w;
                } else cash += due;
            });
            return { method, ticked, total, deposit, walletUse, cash, tip };
        }

        function recalcSpaCheckout() {
            if (!spaCheckoutCtx) return;
            const r = getSpaCheckoutTotals();
            const money = v => formatMoneyString(v) + ' đ';
            document.getElementById('spapay-total').textContent = money(r.total);
            document.getElementById('spapay-deposit').textContent = money(r.deposit);
            document.getElementById('spapay-wallet').textContent = '- ' + money(r.walletUse);
            document.getElementById('spapay-wallet-row').classList.toggle('hidden', r.method !== 'wallet');
            document.getElementById('spapay-cash').textContent = money(r.cash);
            document.getElementById('spapay-tip').textContent = money(r.tip);
            document.getElementById('spapay-tip-row').classList.toggle('hidden', r.tip <= 0);
            const note = document.getElementById('spapay-wallet-note');
            if (r.method === 'wallet') {
                note.textContent = r.cash > 0 ? `Ví Spa chỉ trừ phần dịch vụ. Phần còn lại ${money(r.cash)} thu tiền mặt.` : 'Ví Spa trả đủ.';
                note.classList.remove('hidden');
            } else note.classList.add('hidden');
            const cashBox = document.getElementById('spapay-cash-box');
            cashBox.classList.toggle('hidden', !(r.method === 'cash' || r.method === 'wallet') || r.cash <= 0);
            const tendered = parseMoneyInput(document.getElementById('spapay-tendered').value) || 0;
            document.getElementById('spapay-change').textContent = money(tendered > r.cash ? tendered - r.cash : 0);
            const okBtn = document.getElementById('spapay-btn-ok');
            okBtn.textContent = r.total > 0 ? '✅ Thu tiền & Trả bé' : '✅ Trả bé';
            syncSpaCheckoutAccountRow();
            syncSpaRemainderBlock('spapay', r.method, r.cash);
        }
        window.recalcSpaCheckout = recalcSpaCheckout;

        let spapayAccountMethod = null;

        async function syncSpaCheckoutAccountRow() {
            const method = document.querySelector('input[name="spapay-method"]:checked')?.value || 'cash';
            const wrap = document.getElementById('spapay-account-wrap');
            const sel = document.getElementById('spapay-account');
            if (!wrap || !sel) return;
            const need = spaAccountNeedsAccount(method);
            wrap.classList.toggle('hidden', !need);
            if (!need) return;
            await loadSpaPaymentAccounts();
            if (spapayAccountMethod !== method) {
                fillSpaAccountSelect(sel, method, null);
                spapayAccountMethod = method;
            }
        }
        window.syncSpaCheckoutAccountRow = syncSpaCheckoutAccountRow;

        async function submitSpaCheckout(andPrint = false) {
            if (!spaCheckoutCtx) return;
            const r = getSpaCheckoutTotals();
            if (r.ticked.size === 0) { alert('Vui lòng tích chọn ít nhất 1 bé để trả!'); return; }
            const tendered = parseMoneyInput(document.getElementById('spapay-tendered').value) || 0;
            if ((r.method === 'cash') && tendered > 0 && tendered < r.cash) {
                alert(`Khách đưa ${formatMoneyString(tendered)} đ chưa đủ ${formatMoneyString(r.cash)} đ!`);
                return;
            }
            // CK/thẻ: bắt buộc chọn tài khoản nhận tiền (đúng loại) để không ghi nhầm quỹ
            let payAccountId = null;
            let remainderMethod = 'cash';
            if (r.method === 'wallet') {
                // Ví chỉ trả phần dịch vụ: phần còn lại thu ngân chọn tiền mặt / CK / thẻ
                remainderMethod = spaRemainderMethod('spapay');
                if (spaAccountNeedsAccount(remainderMethod)) {
                    payAccountId = spaAccountIdForMethod(remainderMethod, document.getElementById('spapay-remainder-account'));
                    if (!payAccountId) {
                        alert('Vui lòng chọn "Tài khoản nhận tiền" cho phần còn lại thu bằng ' + (remainderMethod === 'card' ? 'quẹt thẻ' : 'chuyển khoản') + '!');
                        return;
                    }
                }
            } else if (spaAccountNeedsAccount(r.method)) {
                payAccountId = spaAccountIdForMethod(r.method, document.getElementById('spapay-account'));
                if (!payAccountId) {
                    alert('Vui lòng chọn "Tài khoản nhận tiền" cho hình thức ' + (r.method === 'card' ? 'quẹt thẻ' : 'chuyển khoản') + '!');
                    return;
                }
            }
            const btns = ['spapay-btn-ok', 'spapay-btn-print'].map(id => document.getElementById(id));
            btns.forEach(b => { if (b) b.disabled = true; });
            const ctx = spaCheckoutCtx;
            const toReturn = ctx.tickets.filter(t => r.ticked.has(t.id));
            const done = [];
            try {
                // 1) Thu tiền từng phiếu chưa TT (mỗi phiếu 1 dòng sổ quỹ, hoàn tác được từng phiếu)
                // Ví Spa trừ dần theo số dư: bé nào ví đã hết thì thu tiền mặt (server từ chối `wallet` khi ví = 0)
                let walletLeft = ctx.walletBalance;
                for (const t of toReturn) {
                    if (t.payment_status !== 'paid') {
                        let method = r.method;
                        if (method === 'wallet') {
                            if (walletLeft <= 0) method = 'cash';
                            else walletLeft -= Math.min(walletLeft, spaPureServiceTotal(t), Math.max(0, (t.price || 0) - (t.deposit_amount || 0)));
                        }
                        const res = await fetch(`/api/pet-services/${t.id}/pay`, {
                            method: 'POST', headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({
                                payment_method: method,
                                account_id: (method === 'wallet' || spaAccountNeedsAccount(method)) ? payAccountId : null,
                                remainder_method: method === 'wallet' ? remainderMethod : null
                            })
                        });
                        if (!res.ok) {
                            const err = await res.json().catch(() => ({}));
                            throw new Error(`Phiếu #${t.ticket_number || t.id} (${t.pet_name || ''}): ${err.detail || 'không thu được tiền'}`);
                        }
                        t.payment_status = 'paid'; t.payment_method = method;
                    }
                    done.push(t);
                }
                // 2) Chuyển trạng thái Đã Về
                for (const t of toReturn) await updateServiceStatus(t.id, 'checked_out', null, true);
            } catch (e) {
                alert('Lỗi thanh toán: ' + e.message + (done.length ? `\nĐã thu xong ${done.length} phiếu trước đó, phiếu còn lại chưa bị ảnh hưởng.` : ''));
                btns.forEach(b => { if (b) b.disabled = false; });
                await loadPetServicesList(false);
                return;
            }
            btns.forEach(b => { if (b) b.disabled = false; });
            closeSpaCheckoutModal();
            await loadPetServicesList(false);
            if (typeof loadPetServicesKPI === 'function') loadPetServicesKPI();
            if (typeof loadSpaInvoicesList === 'function') loadSpaInvoicesList();
            if (typeof loadContacts === 'function') loadContacts();
            if (window.showToast) showToast(`Đã trả ${toReturn.length} bé · thu ${formatMoneyString(r.cash)} đ${r.walletUse ? ` · ví ${formatMoneyString(r.walletUse)} đ` : ''}`, 'success');
            if (andPrint) {
                const list = toReturn.map(t => (allPetServiceTickets || []).find(x => x.id === t.id) || t);
                await printBatchPetServiceTickets(list, 'invoice', list.length > 1);
            }
        }
        window.submitSpaCheckout = submitSpaCheckout;

        async function updateServiceCallStatus(ticketId, callStatus, selectElem) {
            const ticket = (allPetServiceTickets || []).find(t => t.id === Number(ticketId));
            if (!ticket) return;
            const oldStatus = ticket.call_status || 'Chưa gọi';

            // Tìm các vé khác của cùng khách hôm nay
            const sameCustTickets = (allPetServiceTickets || []).filter(t => {
                if (t.id === ticket.id) return false;
                const matchPhone = ticket.customer_phone && t.customer_phone && ticket.customer_phone === t.customer_phone;
                const matchContact = ticket.contact_id && t.contact_id && ticket.contact_id === t.contact_id;
                const matchName = !ticket.customer_phone && ticket.customer_name && t.customer_name === ticket.customer_name;
                const matchDate = (!ticket.ticket_date || !t.ticket_date || ticket.ticket_date === t.ticket_date);
                return (matchPhone || matchContact || matchName) && matchDate;
            });

            let syncAll = false;
            if (sameCustTickets.length > 0 && typeof window.customConfirm === 'function') {
                const totalPets = sameCustTickets.length + 1;
                const custName = ticket.customer_name || 'Khách hàng';
                const custPhone = ticket.customer_phone ? ` (${ticket.customer_phone})` : '';
                syncAll = await window.customConfirm(
                    `Khách **${custName}**${custPhone} có **${totalPets} bé** hôm nay.\nBạn có muốn cập nhật trạng thái [${callStatus}] cho cả **${totalPets} bé** không?`,
                    'Đồng bộ cuộc gọi',
                    {
                        icon: '📞',
                        okText: `Áp dụng cả ${totalPets} bé`,
                        cancelText: 'Chỉ bé này'
                    }
                );
            }

            const targetTickets = syncAll ? [ticket, ...sameCustTickets] : [ticket];

            // 1. Cập nhật DOM tức thì (0ms, không giật màn hình)
            targetTickets.forEach(t => {
                t.call_status = callStatus;
            });

            if (syncAll) {
                renderActiveSpaView();
            } else if (selectElem) {
                let csClass = 'text-xs py-0.5 px-1 rounded border outline-none cursor-pointer ';
                if (callStatus === 'Đã gọi đón') csClass += 'bg-emerald-50 text-emerald-700 border-emerald-300 font-bold';
                else if (callStatus === 'Không nghe máy') csClass += 'bg-rose-50 text-rose-700 border-rose-300 font-bold';
                else if (callStatus === 'Hẹn giờ đón') csClass += 'bg-amber-50 text-amber-700 border-amber-300 font-bold';
                else csClass += 'bg-gray-50 text-slate-700 border-gray-200';
                selectElem.className = csClass;
            }

            if (petServiceFilterKpiMode === 'uncalled') {
                renderActiveSpaView();
            }
            loadPetServicesKPI();

            // 2. Gửi ngầm tới backend, tự động rollback nếu lỗi
            try {
                if (syncAll) {
                    const payload = {
                        tickets: targetTickets.map(t => ({ id: t.id, call_status: callStatus }))
                    };
                    const res = await fetch('/api/pet-services/tickets/bulk-update', {
                        method: 'PUT',
                        headers: {'Content-Type': 'application/json'},
                        body: JSON.stringify(payload)
                    });
                    if (!res.ok) throw new Error('Bulk API failed');
                    if (typeof showToast === 'function') {
                        showToast(`Đã đồng bộ trạng thái gọi cho ${targetTickets.length} bé`, 'success');
                    }
                } else {
                    const res = await fetch(`/api/pet-services/${ticketId}/call-status`, {
                        method: 'PUT',
                        headers: {'Content-Type':'application/json'},
                        body: JSON.stringify({ call_status: callStatus })
                    });
                    if (!res.ok) throw new Error('API failed');
                }
            } catch(e) {
                console.error('Lỗi cập nhật trạng thái gọi điện:', e);
                ticket.call_status = oldStatus;
                renderActiveSpaView();
                loadPetServicesKPI();
                if (typeof customAlert === 'function') {
                    customAlert('Lỗi cập nhật trạng thái gọi điện!', 'Lỗi');
                } else {
                    alert('Lỗi cập nhật trạng thái gọi điện');
                }
            }
        }

        async function updateServiceStatus(ticketId, newStatus, selectElem, skipCheckoutPopup = false) {
            const ticket = (allPetServiceTickets || []).find(t => t.id === Number(ticketId));
            // Trả bé luôn đi qua popup "Trả bé & Thanh toán" để không sót tiền
            if (newStatus === 'checked_out' && !skipCheckoutPopup && ticket) {
                if (selectElem) selectElem.value = ticket.status;
                openSpaCheckoutModal(ticketId);
                return;
            }
            const oldStatus = ticket ? ticket.status : 'pending';
            const oldCheckout = ticket ? ticket.checkout_time : '';
            const nowTime = new Date().toLocaleTimeString('vi-VN', {hour: '2-digit', minute:'2-digit'});

            if (ticket) {
                ticket.status = newStatus;
                if (newStatus === 'completed' || newStatus === 'checked_out') {
                    if (!ticket.checkout_time) ticket.checkout_time = nowTime;
                }
            }

            if (newStatus === 'checked_out') {
                if (selectedSpaTicketIds && selectedSpaTicketIds.has(Number(ticketId))) {
                    selectedSpaTicketIds.delete(Number(ticketId));
                    updateSpaBulkToolbar();
                }
                if (window.showToast) {
                    const petName = ticket ? (ticket.pet_name || 'Bé cưng') : 'Bé cưng';
                    showToast(`Bé cưng [${petName}] đã về! Đã cập nhật trạng thái hôm nay.`, 'success');
                }
            }

            // 1. Cập nhật DOM ngay lập tức từ bộ nhớ local (0ms, không reload lại toàn bộ danh sách)
            renderActiveSpaView();
            loadPetServicesKPI();

            // 2. Gửi ngầm tới backend, tự động rollback nếu lỗi
            try {
                const res = await fetch(`/api/pet-services/${ticketId}/status`, {
                    method: 'PUT',
                    headers: {'Content-Type':'application/json'},
                    body: JSON.stringify({ status: newStatus, checkout_time: nowTime })
                });
                if (!res.ok) throw new Error('API failed');
            } catch(e) {
                console.error('Lỗi cập nhật trạng thái:', e);
                if (ticket) {
                    ticket.status = oldStatus;
                    ticket.checkout_time = oldCheckout;
                }
                renderActiveSpaView();
                loadPetServicesKPI();
                alert('Lỗi cập nhật trạng thái');
            }
        }

        async function deletePetService(ticketId) {
            const ticket = (allPetServiceTickets || []).find(t => t.id === ticketId);
            const ticketLabel = ticket 
                ? `phiếu #${ticket.ticket_number || ticket.code || ticket.id} - ${ticket.customer_name || 'Khách'} (Bé: ${ticket.pet_name || 'Bé cưng'})`
                : `phiếu dịch vụ #${ticketId}`;

            const confirmed = window.customConfirm 
                ? await window.customConfirm(`Bạn có chắc chắn muốn xóa ${ticketLabel}?\n\n⚠️ Lưu ý: Dữ liệu phiếu sẽ bị xóa hoàn toàn khỏi hệ thống và không thể hoàn tác!`, 'Xác Nhận Xóa Phiếu Spa', { type: 'danger', okText: 'Xóa Phiếu' })
                : confirm(`Xác nhận xóa ${ticketLabel}?`);
            if (!confirmed) return;

            // Optimistic update: xóa ngay lập tức khỏi bộ nhớ & cập nhật UI 0ms (tránh chớp giật skeleton)
            allPetServiceTickets = (allPetServiceTickets || []).filter(t => t.id !== ticketId);
            if (selectedSpaTicketIds && selectedSpaTicketIds.has(ticketId)) {
                selectedSpaTicketIds.delete(ticketId);
                updateSpaBulkToolbar();
            }
            renderActiveSpaView();

            try {
                const res = await fetch(`/api/pet-services/${ticketId}`, { method: 'DELETE' });
                if (res.ok) {
                    if (window.showToast) showToast(`Đã xóa ${ticketLabel} thành công!`, 'success');
                } else {
                    const err = await res.json().catch(() => ({}));
                    if (window.showToast) showToast(err.detail || 'Lỗi xóa phiếu!', 'error');
                }
                // Đồng bộ ngầm không hiển thị skeleton
                await loadPetServicesList(false);
                await loadPetServicesKPI();
            } catch(e) { 
                console.error('deletePetService error:', e);
                if (window.showToast) showToast('Lỗi kết nối khi xóa phiếu', 'error');
                await loadPetServicesList(false);
            }
        }

        // ==========================================
        // CẬP NHẬT TIẾN ĐỘ, PHỤ THU & TRẢ BÉ (MODAL CHỈNH SỬA)
        // ==========================================
        var currentProgressTicketBasePrice = 0;

        async function openServiceProgressModal(ticketId) {
            const modal = document.getElementById('modal-service-progress');
            if (!modal) return;

            let ticket = (allPetServiceTickets || []).find(t => String(t.id) === String(ticketId) || t.code === ticketId);
            if (!ticket) {
                try {
                    const res = await fetch(`/api/pet-services/${ticketId}`);
                    if (res.ok) {
                        ticket = await res.json();
                        if (Array.isArray(allPetServiceTickets)) {
                            allPetServiceTickets.push(ticket);
                        }
                    }
                } catch(e){}
            }
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
            const progRoleCfg = getTicketStaffRoleConfig(ticket);
            const progCutterWrap = document.getElementById('prog-staff-cutter')?.parentElement;
            const progDyerWrap = document.getElementById('prog-staff-dyer')?.parentElement;
            if (progCutterWrap) progCutterWrap.style.display = progRoleCfg.needsCutter ? '' : 'none';
            if (progDyerWrap) progDyerWrap.style.display = progRoleCfg.needsDyer ? '' : 'none';

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
            if (document.getElementById('prog-cb-tip')) {
                document.getElementById('prog-cb-tip').checked = Boolean(ticket.tip_amount && ticket.tip_amount > 0);
            }
            if (document.getElementById('prog-deposit-amount')) {
                document.getElementById('prog-deposit-amount').value = ticket.deposit_amount || '0';
            }
            if (document.getElementById('prog-cb-deposit')) {
                document.getElementById('prog-cb-deposit').checked = Boolean(ticket.deposit_amount && ticket.deposit_amount > 0);
            }

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
                deposit_amount: parseFloat(document.getElementById('prog-deposit-amount')?.value) || 0,
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
                tbody.innerHTML = '<tr><td colspan="4" class="p-4 text-center text-slate-400">Đang tải danh sách phân loại...</td></tr>';
                const res = await fetch('/api/pet-services/categories?_t=' + Date.now());
                if (!res.ok) throw new Error('Không thể tải danh sách phân loại');
                const categories = await res.json();
                window.allSpaCategories = Array.isArray(categories) ? categories : [];

                if (!categories || categories.length === 0) {
                    tbody.innerHTML = '<tr><td colspan="4" class="p-4 text-center text-slate-400">Chưa có phân loại nào</td></tr>';
                    return;
                }

                tbody.innerHTML = categories.map(c => {
                    const isDefault = (c.name.trim().toLowerCase() === 'dịch vụ lẻ chó');
                    const safeName = (c.name || '').replace(/'/g, "\\'").replace(/"/g, '&quot;');
                    const allowWallet = Number(c.allow_spa_wallet || 0) === 1;
                    const walletBtn = allowWallet
                        ? `<button type="button" onclick="toggleSpaCategoryAllowWallet(${c.id}, false)" class="px-2.5 py-1 rounded-full bg-emerald-100 hover:bg-emerald-200 text-emerald-800 border border-emerald-300 font-bold text-xs transition cursor-pointer" title="Nhóm này ĐANG ĐƯỢC PHÉP dùng Ví Spa. Bấm để tắt.">✓ Được trừ ví</button>`
                        : `<button type="button" onclick="toggleSpaCategoryAllowWallet(${c.id}, true)" class="px-2.5 py-1 rounded-full bg-slate-100 hover:bg-slate-200 text-slate-500 border border-slate-300 font-semibold text-xs transition cursor-pointer" title="Nhóm này KHÔNG trừ Ví Spa (sẽ thu ngoài). Bấm để bật.">✕ Không trừ ví</button>`;
                    const deleteBtn = isDefault 
                        ? '<span class="text-slate-300 text-xs  px-2 py-1">Mặc định</span>'
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
                                ${walletBtn}
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
                tbody.innerHTML = `<tr><td colspan="4" class="p-4 text-center text-rose-500">Lỗi: ${e.message}</td></tr>`;
            }
        }

        async function toggleSpaCategoryAllowWallet(catId, allowWallet) {
            const catObj = (window.allSpaCategories || []).find(c => Number(c.id) === Number(catId));
            const catName = catObj ? catObj.name : `Nhóm #${catId}`;
            const confirmed = typeof window.showConfirmModal === 'function'
                ? await window.showConfirmModal({
                    title: allowWallet ? `Bật Trừ Ví Spa: [${catName}]` : `Tắt Trừ Ví Spa: [${catName}]`,
                    message: allowWallet
                        ? `Bạn có chắc chắn muốn CHO PHÉP dùng Ví Spa đối với nhóm dịch vụ "${catName}"?`
                        : `Bạn có chắc chắn muốn KHÔNG TRỪ VÍ SPA đối với nhóm dịch vụ "${catName}"?`,
                    subMessage: allowWallet
                        ? 'Các dịch vụ thuộc nhóm này sẽ được khấu trừ trực tiếp vào số dư Ví Spa của khách hàng.'
                        : 'Các dịch vụ thuộc nhóm này sẽ không trừ vào Ví Spa mà chuyển sang thu ngoài (Tiền mặt / Chuyển khoản / Thẻ).',
                    confirmText: allowWallet ? '✓ Xác nhận Bật' : '✕ Xác nhận Tắt',
                    cancelText: 'Hủy bỏ',
                    type: allowWallet ? 'info' : 'warning',
                    icon: '💳'
                })
                : confirm(allowWallet ? `Cho phép trừ Ví Spa cho nhóm "${catName}"?` : `Tắt trừ Ví Spa cho nhóm "${catName}"?`);
            if (!confirmed) return;

            try {
                const res = await fetch(`/api/pet-services/categories/${catId}/wallet-toggle`, {
                    method: 'PUT',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ allow_spa_wallet: Boolean(allowWallet) })
                });
                if (!res.ok) {
                    const err = await res.json().catch(() => ({}));
                    alert(err.detail || 'Lỗi cập nhật cấu hình Ví Spa cho nhóm dịch vụ');
                    return;
                }
                const pRes = await fetch('/api/pet-services/pricing?_t=' + Date.now());
                if (pRes.ok) {
                    allPetPricingData = await pRes.json();
                }
                await renderSpaCategoryManagerList();
                autoCalculateServicePrice();
                if (window.showToast) {
                    showToast(allowWallet ? '💳 Đã BẬT cho phép trừ Ví Spa cho nhóm dịch vụ!' : 'Đã TẮT trừ Ví Spa cho nhóm dịch vụ (sẽ thu ngoài).', 'success');
                }
            } catch (e) {
                console.error("toggleSpaCategoryAllowWallet error:", e);
            }
        }
        window.toggleSpaCategoryAllowWallet = toggleSpaCategoryAllowWallet;

        async function saveSpaCategoryFromManager() {
            const input = document.getElementById('new-spa-category-mgr-name');
            const allowChk = document.getElementById('new-spa-category-mgr-allow-wallet');
            const name = (input?.value || '').trim();
            if (!name) {
                alert('Vui lòng nhập tên phân loại mới!');
                input?.focus();
                return;
            }
            const allow_spa_wallet = allowChk ? (allowChk.checked ? 1 : 0) : 0;

            try {
                const res = await fetch('/api/pet-services/categories', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ name, allow_spa_wallet })
                });

                if (!res.ok) {
                    const err = await res.json();
                    alert(err.detail || 'Lỗi thêm phân loại mới');
                    return;
                }

                input.value = '';
                if (allowChk) allowChk.checked = false;
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
            let confirmed = false;
            let sub = `Toàn bộ các mức giá thuộc phân loại này sẽ được tự động chuyển về phân loại mặc định <strong>"Dịch Vụ Lẻ Chó"</strong>.`;
            if (typeof window.showConfirmModal === 'function') {
                confirmed = await window.showConfirmModal({
                    title: `Xóa Phân Loại Spa [${name}]`,
                    message: `Bạn có chắc chắn muốn xóa phân loại dịch vụ <strong>"${name}"</strong>?` + (count > 0 ? ` (Đang có ${count} mức giá liên kết)` : ''),
                    subMessage: sub,
                    confirmText: 'Xác Nhận Xóa',
                    cancelText: 'Hủy Bỏ',
                    type: 'danger'
                });
            } else {
                let msg = `Bạn có chắc muốn xóa phân loại "${name}"?`;
                if (count > 0) {
                    msg = `Phân loại "${name}" đang được áp dụng cho ${count} mức giá dịch vụ.\n\nNếu xóa, toàn bộ ${count} mức giá này sẽ được tự động chuyển về phân loại mặc định "Dịch Vụ Lẻ Chó".\n\nBạn có chắc chắn muốn xóa?`;
                }
                confirmed = confirm(msg);
            }

            if (!confirmed) return;

            try {
                const res = await fetch(`/api/pet-services/categories/${id}`, {
                    method: 'DELETE'
                });

                if (!res.ok) {
                    const err = await res.json().catch(() => ({}));
                    const msg = err.detail || 'Lỗi xóa phân loại';
                    if (window.showToast) window.showToast('Lỗi: ' + msg, 'error');
                    else alert(msg);
                    return;
                }

                if (window.showToast) window.showToast(`Đã xóa phân loại: ${name}`, 'success');
                await renderSpaCategoryManagerList();
                await loadPetPricingList();
            } catch (e) {
                console.error("deleteSpaCategoryFromManager error:", e);
                if (window.showToast) window.showToast('Lỗi kết nối khi xóa phân loại', 'error');
                else alert('Lỗi kết nối khi xóa phân loại');
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

            // 1. Đổ vào gói chính (loại trừ các category nhuộm và phụ thu / trị liệu)
            if (primarySelect) {
                let html = '<option value="">-- Chọn gói chính --</option>';
                for (const cat of Object.keys(serviceMap)) {
                    const cLow = cat.toLowerCase();
                    if (cLow.includes('nhuộm') || cLow.includes('phụ thu') || cLow.includes('trị liệu')) continue;
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
                    const cLow = cat.toLowerCase();
                    if (cLow.includes('nhuộm') || cLow.includes('phụ thu') || cLow.includes('trị liệu')) continue;
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

            // 3. Render các Button Phụ Thu từ Bảng Giá người dùng tạo (nhóm Trị Liệu & Phụ Thu)
            renderQuickSurchargeButtons(serviceMap);
            renderBatchBulkSurchargeButtons();
        }

        window.populateServicePackageDropdowns = populateServicePackageDropdowns;

        function renderQuickSurchargeButtons(serviceMapInput = null) {
            const container = document.getElementById('svc-quick-surcharges-container');
            if (!container) return;

            let surchargeNames = new Set();
            if (Array.isArray(allPetPricingData)) {
                allPetPricingData.forEach(item => {
                    const cLow = (item.category || '').toLowerCase();
                    if (cLow.includes('phụ thu') || cLow.includes('trị liệu')) {
                        const sName = (item.service_name || '').trim();
                        if (sName) surchargeNames.add(sName);
                    }
                });
            }

            // Fallback nếu Bảng Giá chưa có dòng nào thuộc nhóm phụ thu
            if (surchargeNames.size === 0) {
                ['Gỡ rối lông', 'Tắm nấm / Viêm da', 'Đánh răng', 'Cắt tạo kiểu NT', 'Đưa đón tận nơi'].forEach(s => surchargeNames.add(s));
            }

            const namesList = Array.from(surchargeNames);
            container.innerHTML = namesList.map(name => `
                <button type="button" onclick="quickAddSvcExtraService('${escapeSpaHtml(name)}')" data-surch-name="${escapeSpaHtml(name)}"
                    class="quick-surch-btn px-2.5 py-1 bg-amber-50 hover:bg-amber-100 text-amber-900 border border-amber-300 rounded-lg text-xs font-bold shadow-2xs transition flex items-center gap-1 cursor-pointer">
                    <span>➕</span>
                    <span>${escapeSpaHtml(name)}</span>
                </button>
            `).join('');
            syncQuickSurchargeButtonVisibility();
        }
        window.renderQuickSurchargeButtons = renderQuickSurchargeButtons;

        // Nút phụ thu đã chọn (có dòng trong danh sách) thì ẩn; bấm ✕ xóa dòng thì nút hiện lại
        function syncQuickSurchargeButtonVisibility() {
            const picked = new Set(currentSvcExtraServices.map(x => (x.name || '').trim().toLowerCase()));
            document.querySelectorAll('#svc-quick-surcharges-container .quick-surch-btn').forEach(btn => {
                btn.classList.toggle('hidden', picked.has((btn.getAttribute('data-surch-name') || '').trim().toLowerCase()));
            });
        }
        window.syncQuickSurchargeButtonVisibility = syncQuickSurchargeButtonVisibility;

        let batchBulkSelectedSurcharges = new Set();

        function renderBatchBulkSurchargeButtons() {
            const container = document.getElementById('batch-bulk-surcharges-container');
            if (!container) return;

            let surchargeNames = new Set();
            if (Array.isArray(allPetPricingData)) {
                allPetPricingData.forEach(item => {
                    const cLow = (item.category || '').toLowerCase();
                    if (cLow.includes('phụ thu') || cLow.includes('trị liệu')) {
                        const sName = (item.service_name || '').trim();
                        if (sName) surchargeNames.add(sName);
                    }
                });
            }

            if (surchargeNames.size === 0) {
                ['Gỡ rối lông', 'Tắm nấm / Viêm da', 'Đánh răng', 'Cắt tạo kiểu NT', 'Đưa đón tận nơi'].forEach(s => surchargeNames.add(s));
            }

            const namesList = Array.from(surchargeNames);
            container.innerHTML = namesList.map(name => {
                const isSel = batchBulkSelectedSurcharges.has(name);
                return `
                    <button type="button" onclick="toggleBatchBulkSurcharge(this, '${escapeSpaHtml(name)}')"
                        class="batch-bulk-surch-btn px-2 py-0.5 rounded-lg text-xs font-bold transition flex items-center gap-1 cursor-pointer select-none ${isSel ? 'bg-amber-500 text-white border border-amber-600 shadow-xs' : 'bg-white hover:bg-amber-100 text-slate-700 hover:text-amber-900 border border-slate-300'}">
                        <span>${isSel ? '✓' : '➕'}</span>
                        <span>${escapeSpaHtml(name)}</span>
                    </button>
                `;
            }).join('');
        }
        window.renderBatchBulkSurchargeButtons = renderBatchBulkSurchargeButtons;

        function toggleBatchBulkSurcharge(btn, sName) {
            if (batchBulkSelectedSurcharges.has(sName)) {
                batchBulkSelectedSurcharges.delete(sName);
            } else {
                batchBulkSelectedSurcharges.add(sName);
            }
            renderBatchBulkSurchargeButtons();
        }
        window.toggleBatchBulkSurcharge = toggleBatchBulkSurcharge;

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
                    'Gói Combo Chó': 'bg-sky-100 text-sky-700 border border-sky-200',
                    'Dịch Vụ Lẻ Chó': 'bg-blue-100 text-blue-700 border border-blue-200',
                    'Spa Mèo': 'bg-sky-100 text-sky-700 border border-sky-200',
                    'Nhuộm Lông': 'bg-amber-100 text-amber-700 border border-amber-200',
                    'Trị Liệu & Phụ Thu': 'bg-emerald-100 text-emerald-700 border border-emerald-200'
                }[item.category] || 'bg-slate-100 text-slate-700 border border-slate-200';

                return `
                <tr class="border-b hover:bg-slate-50 transition text-xs">
                    <td class="p-2.5 text-center text-slate-400 font-mono">${idx + 1}</td>
                    <td class="p-2.5">
                        <span class="px-2 py-0.5 rounded text-xs font-bold ${catClass}">
                            ${item.category || 'Dịch Vụ'}
                        </span>
                    </td>
                    <td class="p-2.5 font-bold text-slate-800">${item.service_name}</td>
                    <td class="p-2.5 font-medium text-slate-600 text-center">
                        ${formatWeightRange(item.min_weight, item.max_weight)}
                    </td>
                    <td class="p-2.5 text-right font-mono font-bold text-emerald-700">${formatMoney(item.price || 0)}</td>
                    <td class="p-2.5 text-center space-x-1 whitespace-nowrap">
                        <button onclick="openEditPetPricingModal(${item.id})" class="text-sky-600 hover:text-sky-800 px-2 py-1 border rounded text-xs font-bold">✏️ Sửa</button>
                        <button onclick="deletePetPricingItem(${item.id})" class="text-rose-600 hover:text-rose-800 px-2 py-1 border rounded text-xs font-bold">🗑️</button>
                    </td>
                </tr>
            `}).join('');
        }

        function openCreatePetPricingModal() {
            document.getElementById('pet-pricing-modal-title').textContent = 'Thêm Mức Giá Dịch Vụ Mới';
            document.getElementById('pet-pricing-edit-id').value = '';
            document.getElementById('pet-pricing-input-cat').value = 'Trị Liệu & Phụ Thu';
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
            document.getElementById('pet-pricing-input-price').value = item.price ? Number(item.price).toLocaleString('vi-VN') : '';
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
            const price = parseMoneyInput(document.getElementById('pet-pricing-input-price').value) || 0;

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
            const confirmed = typeof window.showConfirmModal === 'function'
                ? await window.showConfirmModal({
                    title: 'Xóa Mức Giá Dịch Vụ',
                    message: 'Xác nhận xóa mức giá dịch vụ này?',
                    type: 'danger',
                    confirmText: 'Xóa Mức Giá',
                    cancelText: 'Hủy bỏ',
                    icon: '🗑️'
                })
                : confirm('Xác nhận xóa mức giá dịch vụ này?');
            if (!confirmed) return;
            try {
                await fetch(`/api/pet-services/pricing/${id}`, { method: 'DELETE' });
                if (window.showToast) window.showToast('Đã xóa mức giá thành công!', 'success');
                await loadPetPricingList();
            } catch(e) {
                if (window.showToast) window.showToast('Lỗi xóa mức giá', 'error');
                else alert('Lỗi xóa mức giá');
            }
        }

        window.openAddPetPricingModal = openCreatePetPricingModal;
        window.openCreatePetPricingModal = openCreatePetPricingModal;
        window.openEditPetPricingModal = openEditPetPricingModal;
        window.closePetPricingModal = closePetPricingModal;
        window.savePetPricingItem = savePetPricingItem;
        window.deletePetPricingItem = deletePetPricingItem;
        window.filterPetPricingCategory = filterPetPricingCategory;
        window.renderPetPricingTable = renderPetPricingTable;
        window.loadPetPricingList = loadPetPricingList;

        // ==========================================
        // QUẢN LÝ NHÂN VIÊN SPA (SPA STAFF)
        // ==========================================
        var allSpaStaffList = [];

        async function loadSpaStaffList() {
            const tbody = document.getElementById('table-spa-staff');
            const monthInput = document.getElementById('spa-staff-filter-month');
            if (monthInput && !monthInput.value) {
                const now = new Date();
                monthInput.value = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
            }
            if (typeof window.syncPosMonthWidget === 'function') window.syncPosMonthWidget('spa-staff-filter-month');
            const monthVal = monthInput ? monthInput.value : '';
            try {
                if (tbody) {
                    tbody.innerHTML = '<tr><td colspan="6" class="p-6 text-center text-gray-400">Đang tải danh sách thợ Spa...</td></tr>';
                }
                const url = monthVal ? `/api/pet-services/staff?month=${encodeURIComponent(monthVal)}` : '/api/pet-services/staff';
                const res = await fetch(url);
                allSpaStaffList = await res.json();
                renderSpaStaffTable();
            } catch(e) {
                console.error("loadSpaStaffList err:", e);
                if (tbody) {
                    tbody.innerHTML = '<tr><td colspan="6" class="p-6 text-center text-rose-500 font-semibold">Lỗi tải danh sách nhân viên Spa</td></tr>';
                }
            }
        }

        function renderSpaStaffTable() {
            const tbody = document.getElementById('table-spa-staff');
            if (!tbody) return;
            if (!Array.isArray(allSpaStaffList) || allSpaStaffList.length === 0) {
                tbody.innerHTML = '<tr><td colspan="6" class="p-6 text-center text-gray-400">Chưa có nhân viên Spa nào</td></tr>';
                return;
            }

            tbody.innerHTML = allSpaStaffList.map(s => {
                const cRec = Number(s.count_receiver || 0);
                const cWash = Number(s.count_washer || 0);
                const cCut = Number(s.count_cutter || 0);
                const cDye = Number(s.count_dyer || 0);
                const totalCases = Number(s.total_cases || (cRec + cWash + cCut + cDye));
                const commAmt = Number(s.commission_amount || 0);
                const tipAmt = Number(s.tip_amount || 0);
                const spaTier = (s.spa_commission_tier || 'official') === 'probation' ? 'probation' : 'official';
                const bd = s.spa_breakdown || {};
                const bdParts = [
                    bd.bath ? `Tắm:${(bd.bath/1000).toFixed(0)}k` : '',
                    bd.cut ? `Cắt:${(bd.cut/1000).toFixed(0)}k` : '',
                    bd.dye ? `Nhuộm:${(bd.dye/1000).toFixed(0)}k` : '',
                    bd.surcharge ? `PT:${(bd.surcharge/1000).toFixed(0)}k` : ''
                ].filter(Boolean).join(' · ');
                return `
                <tr class="border-b hover:bg-slate-50 transition text-xs">
                    <td class="p-3 text-center font-mono font-bold text-sky-700">#${s.staff_code || s.id}</td>
                    <td class="p-3">
                        <div class="font-bold text-slate-800 text-sm">${s.name}</div>
                        <div class="font-mono text-slate-500 mt-0.5"><i class="ph ph-phone"></i> ${s.phone || 'Chưa cập nhật SĐT'}</div>
                    </td>
                    <td class="p-3">
                        <div class="flex items-center gap-1.5 flex-wrap">
                            <span class="bg-sky-100 text-sky-800 text-xs font-semibold px-2 py-0.5 rounded">${s.role || 'Chuyên viên Spa'}</span>
                            <select onchange="toggleSpaStaffTierQuick(${s.id}, this.value)"
                                    class="border rounded px-1.5 py-0.5 text-xs font-bold cursor-pointer ${spaTier === 'probation' ? 'bg-amber-50 text-amber-800 border-amber-300' : 'bg-emerald-50 text-emerald-800 border-emerald-300'}">
                                <option value="official" ${spaTier === 'official' ? 'selected' : ''}>★ Chính thức</option>
                                <option value="probation" ${spaTier === 'probation' ? 'selected' : ''}>⏳ Thử việc</option>
                            </select>
                        </div>
                        <div class="text-slate-400 mt-0.5">${s.department || 'Spa & Grooming'}</div>
                    </td>
                    <td class="p-3 text-center">
                        ${totalCases > 0 ? `
                            <div class="inline-flex flex-wrap items-center justify-center gap-1">
                                ${cRec > 0 ? `<span class="px-2 py-0.5 rounded bg-slate-100 text-slate-700 border border-slate-200 font-mono font-semibold" title="Số ca tiếp nhận bé"><i class="ph ph-tray-arrow-down"></i> Nhận: ${cRec}</span>` : ''}
                                ${cWash > 0 ? `<span class="px-2 py-0.5 rounded bg-sky-50 text-sky-700 border border-sky-200 font-mono font-semibold" title="Số ca tắm vệ sinh"><i class="ph ph-bathtub"></i> Tắm: ${cWash}</span>` : ''}
                                ${cCut > 0 ? `<span class="px-2 py-0.5 rounded bg-emerald-50 text-emerald-700 border border-emerald-200 font-mono font-semibold" title="Số ca cắt tỉa"><i class="ph ph-scissors"></i> Cắt: ${cCut}</span>` : ''}
                                ${cDye > 0 ? `<span class="px-2 py-0.5 rounded bg-amber-50 text-amber-800 border border-amber-200 font-mono font-semibold" title="Số ca nhuộm lông"><i class="ph ph-paint-brush"></i> Nhuộm: ${cDye}</span>` : ''}
                            </div>
                        ` : `<span class="text-slate-400">Chưa phát sinh ca</span>`}
                    </td>
                    <td class="p-3 text-right font-mono">
                        <div class="font-bold text-sky-700" title="Hoa hồng dịch vụ Spa trong tháng">${formatMoney(commAmt)}</div>
                        ${bdParts ? `<div class="text-[11px] text-slate-500 mt-0.5">${bdParts}</div>` : ''}
                        ${tipAmt > 0 ? `<div class="text-emerald-700 font-semibold mt-0.5" title="Tiền Tip khách thưởng riêng">+${formatMoney(tipAmt)} tip</div>` : `<div class="text-slate-400 mt-0.5">0đ tip</div>`}
                    </td>
                    <td class="p-3 text-center">
                        <div class="mb-1">
                            <span class="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200 font-semibold">
                                <i class="ph ph-check-circle"></i> Đang làm
                            </span>
                        </div>
                        <div class="flex items-center justify-center gap-2 mt-1">
                            <button onclick="editSpaStaff(${s.id})" class="text-sky-600 hover:text-sky-800 font-bold inline-flex items-center gap-0.5"><i class="ph ph-pencil-simple"></i> Sửa</button>
                            <button onclick="deleteSpaStaff(${s.id})" class="text-rose-600 hover:text-rose-800 font-bold inline-flex items-center gap-0.5"><i class="ph ph-trash"></i> Xóa</button>
                        </div>
                    </td>
                </tr>
                `;
            }).join('');
        }

        async function toggleSpaStaffTierQuick(staffId, newTier) {
            try {
                const res = await fetch(`/api/hrm/commissions/staff-policy/${staffId}`, {
                    method: 'PUT',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ spa_commission_tier: newTier })
                });
                if (res.ok) {
                    if (typeof showToast === 'function') {
                        showToast(`Đã đổi cấp bậc sang ${newTier === 'probation' ? 'NV Thử việc' : 'NV Chính thức'}`, 'success');
                    }
                    await loadSpaStaffList();
                }
            } catch (e) {
                console.error("toggleSpaStaffTierQuick err:", e);
            }
        }
        window.toggleSpaStaffTierQuick = toggleSpaStaffTierQuick;

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
            const confirmed = typeof window.showConfirmModal === 'function'
                ? await window.showConfirmModal({
                    title: 'Xóa Nhân Viên Spa',
                    message: 'Xác nhận xóa nhân viên này khỏi Spa?',
                    type: 'danger',
                    confirmText: 'Xóa Nhân Viên',
                    cancelText: 'Hủy bỏ',
                    icon: '🗑️'
                })
                : confirm('Xác nhận xóa nhân viên này khỏi Spa?');
            if (!confirmed) return;
            try {
                const res = await fetch(`/api/pet-services/staff/${id}`, { method: 'DELETE' });
                if (!res.ok) throw new Error('HTTP ' + res.status);
                if (typeof window.invalidateHrmStaffCache === 'function') window.invalidateHrmStaffCache();
                if (window.showToast) window.showToast('Đã xóa nhân viên thành công!', 'success');
                await loadSpaStaffList();
            } catch(e) {
                if (window.showToast) window.showToast('Lỗi xóa nhân viên', 'error');
                else alert('Lỗi xóa nhân viên');
            }
        }

        window.openSpaStaffModal = openSpaStaffModal;
        window.closeSpaStaffModal = closeSpaStaffModal;
        window.editSpaStaff = editSpaStaff;
        window.submitSpaStaffForm = submitSpaStaffForm;
        window.deleteSpaStaff = deleteSpaStaff;
        window.loadSpaStaffList = loadSpaStaffList;

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
            renderQuickSurchargeButtons();

            // Nạp gọn 40 khách gần nhất (compact=1, ~6 KB) thay vì kéo nguyên bảng 13.000 khách (~4,8 MB)
            if (typeof posContacts !== 'undefined' && Array.isArray(posContacts) && posContacts.length > 0) {
                const supps = Array.isArray(window.allContacts) ? window.allContacts.filter(c => c.type === 'supplier') : [];
                window.allContacts = [...posContacts, ...supps];
                if (typeof allContacts !== 'undefined') allContacts = window.allContacts;
            } else if (!window.allContacts || !window.allContacts.some(c => c.type === 'customer')) {
                fetch('/api/contacts?type=customer&compact=1&limit=40').then(r => r.json()).then(data => {
                    if (Array.isArray(data)) {
                        const supps = Array.isArray(window.allContacts) ? window.allContacts.filter(c => c.type === 'supplier') : [];
                        window.allContacts = [...data, ...supps];
                        if (typeof allContacts !== 'undefined') allContacts = window.allContacts;
                    }
                }).catch(e => console.warn('Lỗi tải nhanh contacts Spa:', e));
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

            // Tính & hiển thị Số Thứ Tự (STT) của phiếu đang tạo (random 5-10 nếu ngày mới chưa có phiếu)
            const todayStr = new Date().toISOString().slice(0, 10);
            const todayTickets = (allPetServiceTickets || []).filter(t => (t.ticket_date === todayStr || (t.created_at && t.created_at.startsWith(todayStr))));
            const maxNum = todayTickets.reduce((max, t) => Math.max(max, Number(t.ticket_number) || 0), 0);
            const currentTicketStt = maxNum > 0 ? (maxNum + 1) : Math.floor(Math.random() * 6) + 5;
            svcTicketBaseNo = currentTicketStt;
            const badgeHeader = document.getElementById('svc-next-stt-header-badge');
            if (badgeHeader) badgeHeader.textContent = `#${currentTicketStt}`;
            const valFooter = document.getElementById('svc-next-stt-footer-val');
            if (valFooter) valFooter.textContent = `#${currentTicketStt}`;

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

            // Reset phụ thu động & tip, cọc
            currentSvcExtraServices = [];
            renderSvcExtraServices();
            const tipEl = document.getElementById('svc-tip-amount');
            if (tipEl) tipEl.value = '';
            const depEl = document.getElementById('svc-deposit-amount');
            if (depEl) depEl.value = '';
            const depMethodEl = document.getElementById('svc-deposit-method');
            if (depMethodEl) { depMethodEl.value = 'cash'; syncSvcDepositAccountRow(); }

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

            // Preload danh sách hàng hóa từ kho cache chung
            if ((typeof posProducts === 'undefined' || !Array.isArray(posProducts) || posProducts.length === 0) &&
                (!Array.isArray(allProducts) || allProducts.length === 0)) {
                (typeof window.getSharedProducts === 'function' ? window.getSharedProducts() : fetch('/api/products').then(r => r.json()))
                    .then(data => {
                        if (Array.isArray(data)) {
                            allProducts = data;
                            if (typeof posProducts !== 'undefined') posProducts = data;
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
            if (batchContainer) batchContainer.innerHTML = '<div class="text-xs text-slate-400 ">Vui lòng chọn khách hàng ở trên để hiển thị danh sách các bé</div>';
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
        let svcTicketBaseNo = 0; // số phiếu đầu tiên của lần tiếp nhận đang mở (hàng loạt: base, base+1, ...)

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
                    btnSingle.className = 'px-3 py-1.5 rounded-lg text-xs font-bold transition-all bg-white text-sky-800 shadow-sm border border-sky-200';
                }
                if (btnBatch) {
                    btnBatch.className = 'px-3 py-1.5 rounded-lg text-xs font-bold transition-all text-slate-600 hover:text-sky-700';
                }
            } else {
                if (singleView) singleView.classList.add('hidden');
                if (batchView) batchView.classList.remove('hidden');
                if (footerSingle) footerSingle.classList.add('hidden');
                if (footerBatch) footerBatch.classList.remove('hidden');
                if (btnSingle) {
                    btnSingle.className = 'px-3 py-1.5 rounded-lg text-xs font-bold transition-all text-slate-600 hover:text-sky-700';
                }
                if (btnBatch) {
                    btnBatch.className = 'px-3 py-1.5 rounded-lg text-xs font-bold transition-all bg-white text-sky-800 shadow-sm border border-sky-200';
                }
                // Cập nhật thanh chọn bé và nạp các dòng tương ứng
                renderBatchPetSelector();
                renderBatchBulkSurchargeButtons();
            }
            refreshSvcTicketNumbers();
        }
        window.setSvcIntakeMode = setSvcIntakeMode;

        // Số phiếu hiển thị = đúng số phiếu sẽ được lưu: 1 bé -> 1 số, N dòng hàng loạt -> N số liên tiếp
        function refreshSvcTicketNumbers() {
            const base = svcTicketBaseNo || 0;
            if (!base) return;
            const isBatch = currentSvcIntakeMode !== 'single';
            const rows = isBatch ? Array.from(document.querySelectorAll('#tbody-batch-pets .batch-pet-row')) : [];
            rows.forEach((tr, i) => {
                const el = tr.querySelector('.batch-row-ticketno');
                if (el) el.textContent = `#${base + i}`;
            });
            const n = isBatch ? Math.max(rows.length, 1) : 1;
            const text = n <= 4
                ? Array.from({ length: n }, (_, i) => `#${base + i}`).join(' · ')
                : `#${base} → #${base + n - 1} (${n} phiếu)`;
            const h = document.getElementById('svc-next-stt-header-badge');
            if (h) h.textContent = text;
            const f = document.getElementById('svc-next-stt-footer-val');
            if (f) f.textContent = text;
        }
        window.refreshSvcTicketNumbers = refreshSvcTicketNumbers;

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
                const dateStr = formatDate(h.ticket_date || h.created_at);
                const staffStr = [h.staff_cutter, h.staff_worker_1].filter(Boolean).join(', ') || 'Chưa ghi thợ';
                const reqStr = h.customer_request || h.note || '';

                const extraTeethStr = h.teeth_cleaning ? `${formatMoneyString(h.teeth_cleaning)} đ` : '0 đ';
                const extraArtStr = h.art_cutting_fee ? `${formatMoneyString(h.art_cutting_fee)} đ` : '0 đ';
                const extraSurchStr = h.surcharge ? `${formatMoneyString(h.surcharge)} đ` : '0 đ';
                const extraShipStr = h.shipping_fee ? `${formatMoneyString(h.shipping_fee)} đ` : '0 đ';
                const extraTipStr = h.tip_amount ? `${formatMoneyString(h.tip_amount)} đ` : '0 đ';

                return `
                    <div class="bg-white p-2.5 rounded-lg border border-slate-200 hover:border-sky-300 shadow-sm transition-all space-y-1">
                        <div class="cursor-pointer select-none" onclick="toggleCustomerSpaHistoryDetail(${h.id})">
                            <div class="flex justify-between items-start">
                                <span class="font-bold text-slate-800 text-xs flex items-center gap-1">
                                    <span id="spa-hist-arrow-${h.id}" class="text-xs text-sky-600 font-mono transition-transform inline-block">▶</span>
                                    <span>${petTitle}</span>
                                    <span class="text-slate-400 font-normal">(${weightStr})</span>
                                </span>
                                <span class="font-bold text-sky-700 font-mono text-xs">${priceStr}</span>
                            </div>
                            <div class="text-xs text-slate-700 font-medium pl-3.5">${h.service_type || 'Spa & Làm đẹp'}</div>
                            <div class="flex justify-between items-center text-xs text-slate-400 pl-3.5 pt-0.5">
                                <span>📅 ${dateStr} · ✂️ ${staffStr}</span>
                                <span class="px-1.5 py-0.2 rounded font-semibold ${h.status === 'completed' ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'}">${h.status}</span>
                            </div>
                        </div>

                        <!-- CHI TIẾT LỊCH SỬ KHI CLICK (EXPANDABLE) -->
                        <div id="spa-hist-detail-${h.id}" class="hidden mt-2 pt-2 border-t border-sky-100 bg-sky-50/50 p-2 rounded text-xs text-slate-700 space-y-1.5">
                            <div class="flex justify-between items-center font-bold text-sky-900 border-b border-sky-200/60 pb-1">
                                <span>Số phiếu: #${h.ticket_number || h.id} (${h.code || '-'})</span>
                                <span class="text-xs px-1.5 py-0.5 rounded bg-sky-200/70 text-sky-800">${h.batch_code || 'Phiếu đơn'}</span>
                            </div>

                            <div class="grid grid-cols-2 gap-1 text-xs">
                                <div><strong>Cân nặng:</strong> ${weightStr || '-'}</div>
                                <div><strong>Cạo bàn:</strong> ${h.shaving_feet || 'Không'}</div>
                                <div><strong>Giống/Màu:</strong> ${(h.pet_breed || '') + ' ' + (h.pet_color || '')}</div>
                                <div><strong>Gói nhuộm:</strong> ${h.dye_package || 'Không'}</div>
                            </div>

                            <div class="bg-white p-1.5 rounded border border-sky-200 text-xs space-y-0.5">
                                <div class="font-bold text-slate-800">Chi tiết phụ thu:</div>
                                <div class="grid grid-cols-2 gap-x-2 gap-y-0.5 text-slate-600">
                                    <span>🦷 Đánh răng: <b>${extraTeethStr}</b></span>
                                    <span>✂️ Cắt NT: <b>${extraArtStr}</b></span>
                                    <span>🌀 Gỡ rối: <b>${extraSurchStr}</b></span>
                                    <span>🚚 Đưa đón: <b>${extraShipStr}</b></span>
                                    <span class="col-span-2">🎁 Tip thợ: <b>${extraTipStr}</b></span>
                                </div>
                            </div>

                            <div class="text-xs text-slate-600 space-y-0.5">
                                <div><strong>Thợ:</strong> Cắt: ${h.staff_cutter || '-'} | Tắm: ${h.staff_worker_1 || '-'} | Nhận: ${h.staff_receiver || '-'}</div>
                                <div><strong>Giờ nhận/về:</strong> ${h.received_time || '-'} ➔ ${h.checkout_time || '-'}</div>
                                ${h.customer_request ? `<div class=" text-sky-700">📝 Yêu cầu: ${h.customer_request}</div>` : ''}
                                ${h.accessories ? `<div class=" text-slate-500">🎒 Phụ kiện: ${h.accessories}</div>` : ''}
                                ${h.note ? `<div class=" text-slate-500">⚠️ Lưu ý: ${h.note}</div>` : ''}
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

            if (sourceProducts.length === 0 || window.__sharedProductsDirty) {
                try {
                    sourceProducts = typeof window.getSharedProducts === 'function'
                        ? await window.getSharedProducts()
                        : await fetch('/api/products').then(r => r.json());
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
                dropdown.innerHTML = '<div class="p-3 text-center text-xs text-slate-400 ">Không tìm thấy hàng hóa phù hợp</div>';
                dropdown.classList.remove('hidden');
                return;
            }

            dropdown.innerHTML = matches.map(p => {
                const typeLabel = p.type === 'combo' ? '<span class="text-xs font-bold text-amber-600 mr-1">COMBO</span>' : '';
                const sellPrice = p.sell_price ?? p.price ?? 0;
                const stockStr = p.type === 'service' ? '∞' : (p.stock || 0);
                return `
                <div onmousedown="addSvcRetailProduct(${p.id})" class="p-2 hover:bg-sky-50 cursor-pointer border-b border-slate-100 last:border-0 flex justify-between items-center transition text-xs">
                    <div>
                        <span class="font-mono text-xs text-slate-400 font-bold mr-1.5">[${p.code || '-'}]</span>
                        ${typeLabel}
                        <span class="font-bold text-slate-800">${p.name}</span>
                        <span class="text-slate-400 text-xs ml-1">(${p.unit || 'cái'})</span>
                    </div>
                    <div class="text-right shrink-0 ml-2">
                        <div class="font-bold text-sky-600 font-mono">${formatMoneyString(sellPrice)} đ</div>
                        <div class="text-xs text-slate-400">Tồn: ${stockStr}</div>
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
                listEl.innerHTML = '<div class="text-xs text-slate-400  text-center py-1">Chưa chọn sản phẩm kèm theo</div>';
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
                            <span class="font-bold text-slate-800 text-xs">${item.name}</span>
                            <span class="text-xs text-slate-400 block">${formatMoneyString(item.price)} đ</span>
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

        // ==========================================
        // DỊCH VỤ PHỤ THU & TRỊ LIỆU ĐỘNG (TỰ ĐIỀN GIÁ THEO KG / MỨC ĐỘ)
        // ==========================================
        let currentSvcExtraServices = [];

        function renderSvcExtraServices() {
            const listEl = document.getElementById('svc-extra-services-list');
            const badgeEl = document.getElementById('svc-extra-services-count-badge');
            if (badgeEl) badgeEl.textContent = `${currentSvcExtraServices.length} mục`;
            syncQuickSurchargeButtonVisibility();
            if (!listEl) return;

            if (currentSvcExtraServices.length === 0) {
                listEl.innerHTML = '<div class="text-xs text-slate-400  text-center py-1.5">Chưa có phụ thu nào (bấm gợi ý ở trên hoặc thêm dòng)</div>';
                return;
            }

            listEl.innerHTML = currentSvcExtraServices.map((item, idx) => `
                <div class="flex items-center gap-1.5 bg-amber-50/70 p-1 rounded border border-amber-200 text-xs">
                    <input type="text" value="${escapeSpaHtml(item.name || '')}" placeholder="Tên phụ thu (gỡ rối, viêm da...)"
                        oninput="updateSvcExtraService(${idx}, 'name', this.value)"
                        class="flex-1 min-w-0 border p-1 rounded text-xs bg-white font-medium text-slate-800">
                    <input type="text" value="${item.price ? Number(item.price).toLocaleString('vi-VN') : ''}" placeholder="0"
                        oninput="onMoneyInputChange(this); updateSvcExtraService(${idx}, 'price', parseMoneyInput(this.value))"
                        class="w-24 border p-1 rounded text-xs text-right font-mono font-bold text-amber-900 bg-white">
                    <span class="text-xs text-slate-500 font-bold">đ</span>
                    <button type="button" onclick="removeSvcExtraService(${idx})" class="text-rose-500 hover:text-rose-700 font-bold px-1.5 py-0.5 rounded text-xs" title="Xóa dòng phụ thu">✕</button>
                </div>
            `).join('');
        }
        window.renderSvcExtraServices = renderSvcExtraServices;

        function addSvcExtraService(name = '', price = 0) {
            currentSvcExtraServices.push({
                id: Date.now() + Math.random(),
                name: name,
                price: Number(price) || 0
            });
            renderSvcExtraServices();
            autoCalculateServicePrice();
        }
        window.addSvcExtraService = addSvcExtraService;

        function removeSvcExtraService(idx) {
            if (idx >= 0 && idx < currentSvcExtraServices.length) {
                currentSvcExtraServices.splice(idx, 1);
                renderSvcExtraServices();
                autoCalculateServicePrice();
            }
        }
        window.removeSvcExtraService = removeSvcExtraService;

        function updateSvcExtraService(idx, field, val) {
            if (currentSvcExtraServices[idx]) {
                currentSvcExtraServices[idx][field] = val;
                if (field === 'name') syncQuickSurchargeButtonVisibility();
                autoCalculateServicePrice();
            }
        }
        window.updateSvcExtraService = updateSvcExtraService;

        function quickAddSvcExtraService(name) {
            const weightInput = document.getElementById('svc-pet-weight')?.value || '';
            const weight = parseWeightFloat(weightInput);
            let suggestedPrice = 40000;
            const searchLower = name.trim().toLowerCase();

            if (Array.isArray(allPetPricingData)) {
                // 1. Dò theo cân nặng trong nhóm Trị Liệu & Phụ Thu
                let match = null;
                if (weight > 0) {
                    match = allPetPricingData.find(x => {
                        const cLow = (x.category || '').toLowerCase();
                        return (cLow.includes('phụ thu') || cLow.includes('trị liệu')) &&
                            x.service_name && x.service_name.trim().toLowerCase() === searchLower &&
                            (x.min_weight === 0 ? weight >= x.min_weight : weight > x.min_weight) && weight <= x.max_weight;
                    });
                }
                // 2. Dò theo tên dịch vụ khớp chính xác
                if (!match) {
                    match = allPetPricingData.find(x => {
                        const cLow = (x.category || '').toLowerCase();
                        return (cLow.includes('phụ thu') || cLow.includes('trị liệu')) &&
                            x.service_name && x.service_name.trim().toLowerCase() === searchLower;
                    });
                }
                if (match && match.price > 0) {
                    suggestedPrice = match.price;
                } else {
                    // Fallback theo từ khóa nếu chưa tạo trong bảng giá
                    if (searchLower.includes('đánh răng')) suggestedPrice = 30000;
                    else if (searchLower.includes('tạo kiểu') || searchLower.includes('cắt nt')) suggestedPrice = 50000;
                    else if (searchLower.includes('gỡ rối')) suggestedPrice = 40000;
                    else if (searchLower.includes('đưa đón')) suggestedPrice = 50000;
                    else if (searchLower.includes('viêm da') || searchLower.includes('nấm')) suggestedPrice = 60000;
                }
            }

            addSvcExtraService(name, suggestedPrice);
        }
        window.quickAddSvcExtraService = quickAddSvcExtraService;

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

        function updateSvcSurchargeTags() {}
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
                syncSvcWalletPaymentSuggestion();
                syncBatchWalletPaymentSuggestion();
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

        // Dropdown popup tìm khách hàng theo tên + SĐT, khớp linh hoạt, tự phục hồi nạp API nếu cache rỗng
        let _spaCustSearchSeq = 0;
        async function onSvcCustomerSearchInput(rawQuery) {
            const dropdown = document.getElementById('svc-customer-dropdown');
            if (!dropdown) return;
            const mySeq = ++_spaCustSearchSeq;
            const cleanQuery = (rawQuery || '').trim();

            const hasFullPosCache = (typeof posContacts !== 'undefined' && Array.isArray(posContacts) && posContacts.length > 50);
            let custs = [];

            if (hasFullPosCache) {
                custs = posContacts;
            } else {
                dropdown.innerHTML = '<div class="px-3 py-2 text-xs text-slate-400 flex items-center gap-1.5"><span>⏳</span><span>Đang tìm khách hàng...</span></div>';
                dropdown.classList.remove('hidden');
                try {
                    const url = `/api/contacts?type=customer&compact=1&limit=30${cleanQuery ? '&search=' + encodeURIComponent(cleanQuery) : ''}`;
                    const r = await fetch(url);
                    if (mySeq !== _spaCustSearchSeq) return;
                    if (r.ok) {
                        const data = await r.json();
                        if (Array.isArray(data)) {
                            custs = data;
                            const byId = new Map();
                            for (const ex of (window.allContacts || [])) byId.set(ex.id, ex);
                            for (const item of data) byId.set(item.id, item);
                            window.allContacts = Array.from(byId.values());
                            if (typeof allContacts !== 'undefined') allContacts = window.allContacts;
                        }
                    }
                } catch (e) {
                    dropdown.innerHTML = '<div class="px-3 py-2 text-xs text-rose-500">Lỗi kết nối máy chủ</div>';
                    return;
                }
            }

            const tokens = cleanQuery.toLowerCase().split(/\s+/).filter(Boolean);

            const removeVnAccents = (str) => {
                return (str || '').toString().toLowerCase()
                    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
                    .replace(/đ/g, 'd');
            };

            const matched = [];
            if (tokens.length === 0 || !hasFullPosCache) {
                for (const c of custs) {
                    matched.push(c);
                    if (matched.length >= 30) break;
                }
            } else {
                const cleanTokens = tokens.map(t => removeVnAccents(t));
                const qDigits = cleanQuery.replace(/\D+/g, '');
                for (const c of custs) {
                    const phoneTokens = typeof window.buildContactPhoneSearchTokens === 'function'
                        ? window.buildContactPhoneSearchTokens(c.phone)
                        : String(c.phone || '');
                    const rawKey = `${c.name || ''} ${c.phone || ''} ${phoneTokens}`;
                    if (c._spaSearchRaw !== rawKey) {
                        c._spaSearchRaw = rawKey;
                        c._spaSearchHaystack = rawKey.toLowerCase() + ' ' + removeVnAccents(rawKey);
                    }
                    const h = c._spaSearchHaystack;
                    const matchTok = tokens.every((tok, idx) => h.includes(tok) || h.includes(cleanTokens[idx]));
                    const matchDigits = qDigits.length >= 3 && phoneTokens.includes(qDigits);
                    if (matchTok || matchDigits) {
                        matched.push(c);
                        if (matched.length >= 30) break;
                    }
                }
            }

            if (matched.length === 0) {
                dropdown.innerHTML = '<div class="px-3 py-2.5 text-xs text-slate-400 ">Không tìm thấy khách hàng nào phù hợp</div>';
            } else {
                dropdown.innerHTML = matched.slice(0, 30).map(c => `
                    <div class="px-3 py-2 text-xs hover:bg-sky-50 cursor-pointer border-b border-slate-50 last:border-0 flex justify-between items-center transition"
                        onmousedown="selectSvcCustomer(${c.id})">
                        <div>
                            <div class="font-bold text-slate-800 flex items-center gap-1.5">
                                <span>${escapeSpaHtml(c.name)}</span>
                                ${c.is_flagged ? '<span class="text-xs bg-rose-600 text-white font-bold px-1.5 py-0.2 rounded-full">Lưu ý</span>' : ''}
                            </div>
                            <div class="text-xs text-slate-500 font-mono">${c.phone || 'Chưa có SĐT'}</div>
                        </div>
                        <div class="text-right text-xs text-sky-700 font-medium">
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
                if (breedSel) {
                    const opt = Array.from(breedSel.options).find(o => o.value.toLowerCase() === p.breed.toLowerCase());
                    if (opt) {
                        breedSel.value = opt.value;
                    } else {
                        const newOpt = document.createElement('option');
                        newOpt.value = p.breed;
                        newOpt.textContent = `🐾 ${p.breed}`;
                        breedSel.appendChild(newOpt);
                        breedSel.value = p.breed;
                    }
                }
            }
            if (p.gender && document.getElementById('svc-pet-gender')) document.getElementById('svc-pet-gender').value = p.gender;
            if (p.color) {
                const colorSel = document.getElementById('svc-pet-color');
                if (colorSel) {
                    const opt = Array.from(colorSel.options).find(o => o.value.toLowerCase() === p.color.toLowerCase());
                    if (opt) {
                        colorSel.value = opt.value;
                    } else {
                        const newOpt = document.createElement('option');
                        newOpt.value = p.color;
                        newOpt.textContent = p.color;
                        colorSel.appendChild(newOpt);
                        colorSel.value = p.color;
                    }
                }
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
        var _svcCalcDebounceTimer = null;

        function findSpaPricingClientSide(serviceName, weight) {
            if (!Array.isArray(allPetPricingData) || !serviceName) return 0;
            const sNameNorm = serviceName.trim().toLowerCase();
            const w = parseFloat(weight) || 0;

            // 1. Lọc tất cả các mức giá của dịch vụ này (không phân biệt hoa/thường)
            const matches = allPetPricingData.filter(item => 
                (item.service_name || '').trim().toLowerCase() === sNameNorm
            );
            if (matches.length === 0) return 0;

            // 2. Tìm dải cân nặng phù hợp: min_weight <= w AND (w <= max_weight OR max_weight = 0)
            const exact = matches.find(item => {
                const minW = parseFloat(item.min_weight) || 0;
                const maxW = parseFloat(item.max_weight) || 0;
                if (maxW === 0 || maxW === 999) return w >= minW;
                return w >= minW && w <= maxW;
            });
            if (exact) return parseFloat(exact.price) || 0;

            // 3. Nếu cân nặng vượt trần khung cao nhất: lấy khung có max_weight hoặc min_weight lớn nhất
            const sortedByWeightDesc = [...matches].sort((a, b) => {
                const maxA = parseFloat(a.max_weight) || parseFloat(a.min_weight) || 0;
                const maxB = parseFloat(b.max_weight) || parseFloat(b.min_weight) || 0;
                return maxB - maxA;
            });
            return parseFloat(sortedByWeightDesc[0].price) || 0;
        }

        async function autoCalculateServicePrice() {
            const weight = parseWeightFloat(document.getElementById('svc-pet-weight')?.value);
            const primaryPkg = document.getElementById('svc-primary-package')?.value || '';
            const dyePkg = document.getElementById('svc-dye-package')?.value || '';
            const custId = parseInt(document.getElementById('svc-customer-id')?.value) || null;

            // Đảm bảo có bảng giá client-side
            if (!Array.isArray(allPetPricingData) || allPetPricingData.length === 0) {
                try {
                    const r = await fetch('/api/pet-services/pricing');
                    if (r.ok) allPetPricingData = await r.json();
                } catch(e){}
            }

            // === TẦNG 1: TÍNH TỨC THÌ CLIENT-SIDE (0ms Latency) ===
            let instantBase = 0;
            if (primaryPkg) {
                instantBase += findSpaPricingClientSide(primaryPkg, weight);
            }
            if (dyePkg) {
                instantBase += findSpaPricingClientSide(dyePkg, weight);
            }

            // Phụ thu Cột 2: Lấy từ mảng currentSvcExtraServices động
            let extraServicesTotal = 0;
            if (Array.isArray(currentSvcExtraServices)) {
                extraServicesTotal = currentSvcExtraServices.reduce((acc, it) => acc + (Number(it.price) || 0), 0);
            }
            let extraTip = parseMoneyInput(document.getElementById('svc-tip-amount')?.value) || 0;
            const totalSurcharges = extraServicesTotal + extraTip;

            // Tiền hàng hóa bán kèm
            let totalRetail = 0;
            if (Array.isArray(currentSvcRetailProducts)) {
                totalRetail = currentSvcRetailProducts.reduce((acc, it) => acc + ((it.price || 0) * (it.quantity || 1)), 0);
            }

            const instantGrandTotal = instantBase + totalSurcharges + totalRetail;

            // Cập nhật DOM ngay lập tức (Người dùng gõ là số tiền nhảy tức thì 0ms)
            const baseDisp = document.getElementById('svc-base-price-display');
            if (baseDisp) baseDisp.textContent = formatMoneyString(instantBase) + ' đ';
            const surchDisp = document.getElementById('svc-surcharges-total-display');
            if (surchDisp) surchDisp.textContent = formatMoneyString(totalSurcharges) + ' đ';
            const retailDisp = document.getElementById('svc-retail-price-display');
            if (retailDisp) retailDisp.textContent = formatMoneyString(totalRetail) + ' đ';
            const totalDisp = document.getElementById('svc-total-price-display');
            if (totalDisp) totalDisp.textContent = formatMoneyString(instantGrandTotal) + ' đ';
            const totalEl = document.getElementById('svc-total-price');
            if (totalEl) totalEl.value = instantGrandTotal;
            syncSvcWalletPaymentSuggestion(instantGrandTotal);
            syncSvcRemainderRow();

            // === TẦNG 2: ASYNC BEST OFFER & ĐỒNG BỘ CHIẾT KHẤU THẺ VIP KHÁCH HÀNG ===
            if (!primaryPkg) return;

            clearTimeout(_svcCalcDebounceTimer);
            _svcCalcDebounceTimer = setTimeout(async () => {
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
                        let finalBase = (data.final_price || 0);
                        if (dyePkg) {
                            finalBase += findSpaPricingClientSide(dyePkg, weight);
                        }
                        const finalGrand = finalBase + totalSurcharges + totalRetail;

                        if (baseDisp) baseDisp.textContent = formatMoneyString(finalBase) + ' đ';
                        if (totalDisp) totalDisp.textContent = formatMoneyString(finalGrand) + ' đ';
                        if (totalEl) totalEl.value = finalGrand;
                        syncSvcWalletPaymentSuggestion(finalGrand);

                        _lastSvcCalculation = {
                            primaryPkg: primaryPkg,
                            base_price: data.base_price || 0,
                            final_price: data.final_price || 0,
                            discount_applied: data.discount_applied || 0
                        };
                    }
                } catch(e) {
                    console.error('Lỗi sync Best Offer:', e);
                }
            }, 250);
        }

        // ── Tài khoản nhận tiền dùng chung cho mọi luồng thanh toán Spa ──
        // Tiền mặt: backend tự lấy két tiền mặt. CK/thẻ bắt buộc gửi account_id đúng loại tài khoản.
        const SPA_ACC_TYPES = {
            cash: ['cash'],
            transfer: ['bank', 'ewallet'],
            bank: ['bank', 'ewallet'],
            wallet: ['bank', 'ewallet'],
            card: ['pos_card']
        };
        let spaPaymentAccounts = [];
        let spaAccountsLoading = null;

        function loadSpaPaymentAccounts(force = false) {
            if (spaAccountsLoading && !force) return spaAccountsLoading;
            spaAccountsLoading = (async () => {
                try {
                    const res = await fetch('/api/payment-accounts?_t=' + Date.now());
                    const data = res.ok ? await res.json() : [];
                    spaPaymentAccounts = Array.isArray(data) ? data.filter(a => a.is_active !== 0) : [];
                } catch (e) {
                    spaPaymentAccounts = [];
                }
                return spaPaymentAccounts;
            })();
            return spaAccountsLoading;
        }

        function spaAccountsForMethod(method) {
            const types = SPA_ACC_TYPES[method] || ['cash'];
            const list = spaPaymentAccounts.filter(a => types.includes(a.account_type));
            return list.length ? list : spaPaymentAccounts;
        }

        function fillSpaAccountSelect(selectEl, method, preferredId = null) {
            if (!selectEl) return;
            const list = spaAccountsForMethod(method);
            selectEl.innerHTML = list.length
                ? list.map(a => `<option value="${a.id}">${a.name}</option>`).join('')
                : '<option value="">(Chưa có tài khoản nhận tiền)</option>';
            const wanted = preferredId ? Number(preferredId) : (list[0] ? Number(list[0].id) : 0);
            if (wanted && list.some(a => Number(a.id) === wanted)) selectEl.value = String(wanted);
        }

        function spaAccountNeedsAccount(method) {
            return method === 'transfer' || method === 'bank' || method === 'card';
        }

        function spaAccountIdForMethod(method, selectEl = null) {
            if (!spaAccountNeedsAccount(method) && method !== 'wallet') return null;
            const picked = selectEl ? parseInt(selectEl.value) : 0;
            if (picked) return picked;
            const first = spaAccountsForMethod(method)[0];
            return first ? Number(first.id) : null;
        }

        async function syncSvcPayAccountRow(scope = 'svc') {
            const isBatch = scope === 'batch';
            const wrap = document.getElementById(isBatch ? 'batch-payment-account-wrap' : 'svc-payment-account-wrap');
            const sel = document.getElementById(isBatch ? 'batch-payment-account' : 'svc-payment-account');
            const methodSel = document.getElementById(isBatch ? 'batch-payment-method' : 'svc-payment-method');
            if (!wrap || !sel || !methodSel) return;
            const method = methodSel.value || 'cash';
            const need = spaAccountNeedsAccount(method);
            wrap.classList.toggle('hidden', !need);
            if (isBatch) wrap.classList.toggle('inline-flex', need);
            if (!need) return;
            await loadSpaPaymentAccounts();
            fillSpaAccountSelect(sel, method, sel.dataset.method === method ? sel.value : null);
            sel.dataset.method = method;
        }

        function onSpaPayMethodChanged(scope = 'svc') {
            syncSvcPayAccountRow(scope);
            if (scope === 'svc') syncSvcRemainderRow();
            if (scope === 'batch') syncBatchRemainderRow();
        }
        window.onSpaPayMethodChanged = onSpaPayMethodChanged;

        // Tài khoản nhận tiền cọc: tiền mặt -> két (ẩn ô); CK/thẻ -> bắt buộc chọn
        async function syncSvcDepositAccountRow() {
            const m = document.getElementById('svc-deposit-method')?.value || 'cash';
            const sel = document.getElementById('svc-deposit-account');
            if (!sel) return;
            const need = spaAccountNeedsAccount(m);
            sel.classList.toggle('hidden', !need);
            if (!need) return;
            await loadSpaPaymentAccounts();
            fillSpaAccountSelect(sel, m, sel.dataset.method === m ? sel.value : null);
            sel.dataset.method = m;
        }
        window.syncSvcDepositAccountRow = syncSvcDepositAccountRow;

        // ── Phần còn lại khi trả bằng Ví Spa (hàng hóa / tip / ví không đủ) ──
        // Ví chỉ trả phần dịch vụ; phần còn lại thu ngân chọn Tiền mặt / CK / Thẻ (CK-thẻ cần TK nhận).
        const SPA_REMAINDER_IDS = {
            svc: { wrap: 'svc-remainder-wrap', amount: 'svc-remainder-amount', accWrap: 'svc-remainder-account-wrap', acc: 'svc-remainder-account', radio: 'svc-remainder-method' },
            batch: { wrap: 'batch-remainder-wrap', amount: 'batch-remainder-amount', accWrap: null, acc: 'batch-remainder-account', radio: null },
            spapay: { wrap: 'spapay-remainder-wrap', amount: 'spapay-remainder-amount', accWrap: 'spapay-remainder-account-wrap', acc: 'spapay-remainder-account', radio: 'spapay-remainder-method' }
        };

        function spaRemainderMethod(scope) {
            const ids = SPA_REMAINDER_IDS[scope];
            if (ids && ids.radio) {
                const picked = document.querySelector(`input[name="${ids.radio}"]:checked`);
                if (picked) return picked.value;
            }
            if (scope === 'batch') {
                const sel = document.getElementById('batch-remainder-method');
                if (sel) return sel.value || 'cash';
            }
            return 'cash';
        }

        async function syncSpaRemainderBlock(scope, method, amount) {
            const ids = SPA_REMAINDER_IDS[scope];
            if (!ids) return;
            const wrap = document.getElementById(ids.wrap);
            if (!wrap) return;
            const left = Math.max(0, Number(amount) || 0);
            const show = method === 'wallet' && left > 0;
            wrap.classList.toggle('hidden', !show);
            if (scope === 'batch') wrap.classList.toggle('inline-flex', show);
            if (!show) return;

            const amountEl = document.getElementById(ids.amount);
            if (amountEl) amountEl.textContent = formatMoneyString(left) + ' đ';

            const payM = spaRemainderMethod(scope);
            const needAcc = spaAccountNeedsAccount(payM);
            if (ids.accWrap) {
                const accWrap = document.getElementById(ids.accWrap);
                if (accWrap) accWrap.classList.toggle('hidden', !needAcc);
            }
            const accSel = document.getElementById(ids.acc);
            if (accSel) {
                accSel.classList.toggle('hidden', !needAcc);
                if (needAcc) {
                    await loadSpaPaymentAccounts();
                    fillSpaAccountSelect(accSel, payM, accSel.dataset.method === payM ? accSel.value : null);
                    accSel.dataset.method = payM;
                }
            }
        }

        function svcWalletEligibleAmount() {
            const weight = parseWeightFloat(document.getElementById('svc-pet-weight')?.value);
            let eligible = 0;
            const primaryPkg = document.getElementById('svc-primary-package')?.value || '';
            if (primaryPkg && isSpaWalletEligibleCombo(primaryPkg)) {
                if (_lastSvcCalculation && _lastSvcCalculation.primaryPkg === primaryPkg && Number(_lastSvcCalculation.final_price) > 0) {
                    eligible += Number(_lastSvcCalculation.final_price) || 0;
                } else {
                    eligible += findSpaPricingClientSide(primaryPkg, weight) || 0;
                }
            }
            const dyePkg = document.getElementById('svc-dye-package')?.value || '';
            if (dyePkg && isSpaWalletEligibleCombo(dyePkg, { is_dye: true })) {
                eligible += findSpaPricingClientSide(dyePkg, weight) || 0;
            }
            if (Array.isArray(currentSvcExtraServices)) {
                for (const es of currentSvcExtraServices) {
                    if (es && es.name && isSpaWalletEligibleCombo(es.name, { is_surcharge: true })) {
                        eligible += Number(es.price) || 0;
                    }
                }
            }
            return eligible;
        }

        // Số tiền phải thu ngoài ví ở form tiếp nhận = (Nhuộm lông + Phụ thu + Hàng hóa POS + Tip thợ) + Phần gói Combo vượt số dư ví
        function svcRemainderAmount() {
            const grandTotal = parseFloat(document.getElementById('svc-total-price')?.value) || 0;
            const custId = parseInt(document.getElementById('svc-customer-id')?.value || '0') || 0;
            const cust = (allContacts || []).find(c => c.id == custId);
            const balance = cust ? Number(cust.spa_wallet_balance || 0) : 0;
            const eligibleCombo = svcWalletEligibleAmount();
            const walletDed = Math.min(Math.max(0, balance), Math.max(0, eligibleCombo));
            return Math.max(0, grandTotal - walletDed);
        }

        function syncSvcRemainderRow() {
            const timing = document.querySelector('input[name="svc-payment-timing"]:checked')?.value || 'unpaid';
            const method = timing === 'paid' ? (document.getElementById('svc-payment-method')?.value || 'cash') : 'unpaid';
            return syncSpaRemainderBlock('svc', method, svcRemainderAmount());
        }

        // Đợt nhập hàng loạt: phần ví không đủ cho cả đợt thì thu ngoài
        function batchRemainderAmount() {
            const total = parseFloat(String(document.getElementById('batch-grand-total')?.textContent || '0').replace(/[^\d]/g, '')) || 0;
            const custId = parseInt(document.getElementById('svc-customer-id')?.value || '0') || 0;
            const cust = (allContacts || []).find(c => c.id == custId);
            const balance = cust ? Number(cust.spa_wallet_balance || 0) : 0;
            return Math.max(0, total - balance);
        }

        function syncBatchRemainderRow() {
            const timing = document.getElementById('batch-payment-timing')?.value || 'unpaid';
            const method = timing === 'paid' ? (document.getElementById('batch-payment-method')?.value || 'cash') : 'unpaid';
            return syncSpaRemainderBlock('batch', method, batchRemainderAmount());
        }

        function onSpaRemainderMethodChanged(scope) {
            if (scope === 'svc') return syncSvcRemainderRow();
            if (scope === 'batch') return syncBatchRemainderRow();
            if (scope === 'spapay') { recalcSpaCheckout(); return; }
        }
        window.onSpaRemainderMethodChanged = onSpaRemainderMethodChanged;

        function onSvcPaymentTimingChanged(val) {
            const wrap = document.getElementById('svc-payment-method-wrap');
            if (wrap) {
                wrap.classList.toggle('hidden', val !== 'paid');
            }
            if (val === 'paid') { syncSvcPayAccountRow('svc'); syncSvcRemainderRow(); }
        }

        function syncSvcWalletPaymentSuggestion(totalPriceOverride = null) {
            const custId = parseInt(document.getElementById('svc-customer-id')?.value) || 0;
            const banner = document.getElementById('svc-wallet-helper-banner');
            if (!banner) return;
            if (!custId) {
                banner.classList.add('hidden');
                banner.innerHTML = '';
                return;
            }

            const cust = (allContacts || []).find(c => c.id == custId);
            const balance = (cust && cust.spa_wallet_balance) ? parseFloat(cust.spa_wallet_balance) : 0;
            const grandTotal = totalPriceOverride !== null ? totalPriceOverride : (parseFloat(document.getElementById('svc-total-price')?.value) || 0);
            const eligibleCombo = svcWalletEligibleAmount();

            if (balance <= 0 || grandTotal <= 0) {
                banner.classList.add('hidden');
                banner.innerHTML = '';
                return;
            }

            if (eligibleCombo <= 0) {
                banner.classList.remove('hidden');
                banner.innerHTML = `
                    <div class="p-2 rounded-lg bg-slate-100 border border-slate-300 text-xs text-slate-700 flex items-center justify-between gap-2">
                        <span>💡 Khách có <strong>${formatMoneyString(balance)} đ</strong> trong Ví Spa, nhưng dịch vụ đang chọn thuộc nhóm <strong>Không trừ Ví Spa</strong>.</span>
                        <button type="button" onclick="openSpaCategoryManagerModal()" class="px-2 py-0.5 bg-white hover:bg-slate-50 border border-slate-300 rounded font-bold text-sky-700 shrink-0 cursor-pointer">⚙️ Cài đặt nhóm dùng ví</button>
                    </div>
                `;
                return;
            }

            banner.classList.remove('hidden');
            const walletDed = Math.min(balance, eligibleCombo);
            const remaining = Math.max(0, grandTotal - walletDed);

            if (remaining === 0) {
                // Đủ tiền cho gói Combo và không có phụ thu / nhuộm / hàng bán kèm
                const radioPaid = document.querySelector('input[name="svc-payment-timing"][value="paid"]');
                if (radioPaid && !radioPaid.checked) {
                    radioPaid.checked = true;
                    onSvcPaymentTimingChanged('paid');
                }
                const methodSel = document.getElementById('svc-payment-method');
                if (methodSel) methodSel.value = 'wallet';

                banner.innerHTML = `
                    <div class="p-2 rounded-lg bg-emerald-50 border border-emerald-300 text-xs text-emerald-900 flex items-center justify-between shadow-xs">
                        <div class="flex items-center gap-1.5">
                            <span class="text-sm">✨</span>
                            <span>Khách có <strong>${formatMoneyString(balance)} đ</strong> trong ví ➔ Đã tự động chọn <strong>Trừ Ví Spa (${formatMoneyString(walletDed)} đ)</strong></span>
                        </div>
                        <button type="button" onclick="setSvcPaymentMethodFallback('cash')" class="text-xs text-emerald-700 underline hover:text-emerald-900 font-semibold cursor-pointer">Đổi tiền mặt</button>
                    </div>
                `;
            } else {
                // Có khoản thu ngoài (nhuộm / phụ thu / hàng kèm hoặc gói Combo vượt số dư ví)
                banner.innerHTML = `
                    <div class="p-2.5 rounded-lg bg-amber-50 border border-amber-300 text-xs text-amber-950 space-y-1.5 shadow-xs">
                        <div class="flex items-center justify-between">
                            <div class="font-bold flex items-center gap-1">
                                <span>⚠️</span>
                                <span>Ví trừ tối đa <strong>${formatMoneyString(walletDed)} đ</strong> (Gói Combo) • Cần thu ngoài <strong>${formatMoneyString(remaining)} đ</strong> (Phụ thu / Nhuộm / Hàng kèm)</span>
                            </div>
                            <button type="button" onclick="openTopupSpaModal()" class="px-2 py-0.5 bg-amber-600 hover:bg-amber-700 text-white rounded font-bold text-xs shadow-xs cursor-pointer">⚡ Nạp Gói</button>
                        </div>
                        <div class="flex items-center gap-2 pt-0.5">
                            <button type="button" onclick="applySplitWalletPayment('svc', ${walletDed}, ${remaining})" class="px-2.5 py-1 bg-sky-600 hover:bg-sky-700 text-white rounded font-bold text-xs shadow-xs flex-1 text-center cursor-pointer" title="Trừ Ví Spa phần gói Combo và thu ngoài phần phụ thu/nhuộm/hàng hóa">
                                ⚡ Trừ ví (${formatMoneyString(walletDed)} đ) + Thu ngoài (${formatMoneyString(remaining)} đ)
                            </button>
                            <button type="button" onclick="applyFullCashPayment('svc')" class="px-2 py-1 bg-white hover:bg-slate-100 text-slate-700 border border-slate-300 rounded font-medium text-xs shadow-xs cursor-pointer">
                                💵 Thu ngoài 100%
                            </button>
                        </div>
                    </div>
                `;
            }
        }
        window.syncSvcWalletPaymentSuggestion = syncSvcWalletPaymentSuggestion;

        function syncBatchWalletPaymentSuggestion(grandTotalOverride = null) {
            const custId = parseInt(document.getElementById('svc-customer-id')?.value) || 0;
            const banner = document.getElementById('batch-wallet-helper-banner');
            if (!banner) return;
            if (!custId) {
                banner.classList.add('hidden');
                banner.innerHTML = '';
                return;
            }

            const cust = (allContacts || []).find(c => c.id == custId);
            const balance = (cust && cust.spa_wallet_balance) ? parseFloat(cust.spa_wallet_balance) : 0;
            const grandTotal = grandTotalOverride !== null ? grandTotalOverride : (parseFloat(document.getElementById('batch-grand-total')?.textContent?.replace(/[^\d]/g, '') || 0));

            if (balance <= 0 || grandTotal <= 0) {
                banner.classList.add('hidden');
                banner.innerHTML = '';
                return;
            }

            banner.classList.remove('hidden');

            if (balance >= grandTotal) {
                const timingSel = document.getElementById('batch-payment-timing');
                if (timingSel) timingSel.value = 'paid';
                const methodSel = document.getElementById('batch-payment-method');
                if (methodSel) methodSel.value = 'wallet';

                banner.innerHTML = `
                    <div class="p-2 rounded-lg bg-emerald-50 border border-emerald-300 text-xs text-emerald-900 flex items-center justify-between shadow-xs">
                        <div class="flex items-center gap-1.5">
                            <span class="text-sm">✨</span>
                            <span>Khách có <strong>${formatMoneyString(balance)} đ</strong> trong ví ➔ Đã tự động chọn <strong>Trừ Ví Spa</strong> cho cả đợt</span>
                        </div>
                        <button type="button" onclick="setBatchPaymentMethodFallback('cash')" class="text-xs text-emerald-700 underline hover:text-emerald-900 font-semibold cursor-pointer">Đổi tiền mặt</button>
                    </div>
                `;
            } else {
                const remaining = grandTotal - balance;
                banner.innerHTML = `
                    <div class="p-2.5 rounded-lg bg-amber-50 border border-amber-300 text-xs text-amber-950 space-y-1.5 shadow-xs">
                        <div class="flex items-center justify-between">
                            <div class="font-bold flex items-center gap-1">
                                <span>⚠️</span>
                                <span>Ví còn <strong>${formatMoneyString(balance)} đ</strong> (Cả đợt thiếu <strong>${formatMoneyString(remaining)} đ</strong>)</span>
                            </div>
                            <button type="button" onclick="openTopupSpaModal()" class="px-2 py-0.5 bg-amber-600 hover:bg-amber-700 text-white rounded font-bold text-xs shadow-xs cursor-pointer">⚡ Nạp Gói</button>
                        </div>
                        <div class="flex items-center gap-2 pt-0.5">
                            <button type="button" onclick="applySplitWalletPayment('batch', ${balance}, ${remaining})" class="px-2.5 py-1 bg-sky-600 hover:bg-sky-700 text-white rounded font-bold text-xs shadow-xs flex-1 text-center cursor-pointer" title="Cấn trừ hết ví và thu phần thiếu bằng tiền mặt/chuyển khoản ngoài">
                                ⚡ Trừ hết ví (${formatMoneyString(balance)} đ) + Thu ngoài (${formatMoneyString(remaining)} đ)
                            </button>
                            <button type="button" onclick="applyFullCashPayment('batch')" class="px-2 py-1 bg-white hover:bg-slate-100 text-slate-700 border border-slate-300 rounded font-medium text-xs shadow-xs cursor-pointer">
                                💵 Thu ngoài 100%
                            </button>
                        </div>
                    </div>
                `;
            }
        }
        window.syncBatchWalletPaymentSuggestion = syncBatchWalletPaymentSuggestion;

        function applySplitWalletPayment(mode, balance, remaining) {
            if (mode === 'svc') {
                const radioPaid = document.querySelector('input[name="svc-payment-timing"][value="paid"]');
                if (radioPaid) { radioPaid.checked = true; onSvcPaymentTimingChanged('paid'); }
                const methodSel = document.getElementById('svc-payment-method');
                if (methodSel) methodSel.value = 'wallet';
                const banner = document.getElementById('svc-wallet-helper-banner');
                if (banner) {
                    banner.innerHTML = `
                        <div class="p-2 rounded-lg bg-sky-50 border border-sky-300 text-xs text-sky-950 flex items-center justify-between shadow-xs">
                            <span class="font-bold flex items-center gap-1"><span>⚡</span><span>Đã chọn: Trừ sạch ví <strong>${formatMoneyString(balance)} đ</strong> + Thu ngoài <strong>${formatMoneyString(remaining)} đ</strong></span></span>
                            <button type="button" onclick="syncSvcWalletPaymentSuggestion()" class="text-xs text-sky-700 underline font-semibold cursor-pointer">Đổi lại</button>
                        </div>
                    `;
                }
            } else {
                const timingSel = document.getElementById('batch-payment-timing');
                if (timingSel) timingSel.value = 'paid';
                const methodSel = document.getElementById('batch-payment-method');
                if (methodSel) methodSel.value = 'wallet';
                const banner = document.getElementById('batch-wallet-helper-banner');
                if (banner) {
                    banner.innerHTML = `
                        <div class="p-2 rounded-lg bg-sky-50 border border-sky-300 text-xs text-sky-950 flex items-center justify-between shadow-xs">
                            <span class="font-bold flex items-center gap-1"><span>⚡</span><span>Đã chọn: Trừ sạch ví <strong>${formatMoneyString(balance)} đ</strong> + Thu ngoài <strong>${formatMoneyString(remaining)} đ</strong></span></span>
                            <button type="button" onclick="syncBatchWalletPaymentSuggestion()" class="text-xs text-sky-700 underline font-semibold cursor-pointer">Đổi lại</button>
                        </div>
                    `;
                }
            }
        }
        window.applySplitWalletPayment = applySplitWalletPayment;

        function applyFullCashPayment(mode) {
            if (mode === 'svc') {
                const methodSel = document.getElementById('svc-payment-method');
                if (methodSel) methodSel.value = 'cash';
                const banner = document.getElementById('svc-wallet-helper-banner');
                if (banner) {
                    banner.innerHTML = `
                        <div class="p-2 rounded-lg bg-slate-100 border border-slate-300 text-xs text-slate-800 flex items-center justify-between shadow-xs">
                            <span class="font-medium">💵 Đã chọn: Thu ngoài 100% (Giữ nguyên số dư ví)</span>
                            <button type="button" onclick="syncSvcWalletPaymentSuggestion()" class="text-xs text-sky-700 underline font-semibold cursor-pointer">Đổi lại</button>
                        </div>
                    `;
                }
            } else {
                const methodSel = document.getElementById('batch-payment-method');
                if (methodSel) methodSel.value = 'cash';
                const banner = document.getElementById('batch-wallet-helper-banner');
                if (banner) {
                    banner.innerHTML = `
                        <div class="p-2 rounded-lg bg-slate-100 border border-slate-300 text-xs text-slate-800 flex items-center justify-between shadow-xs">
                            <span class="font-medium">💵 Đã chọn: Thu ngoài 100% (Giữ nguyên số dư ví)</span>
                            <button type="button" onclick="syncBatchWalletPaymentSuggestion()" class="text-xs text-sky-700 underline font-semibold cursor-pointer">Đổi lại</button>
                        </div>
                    `;
                }
            }
        }
        window.applyFullCashPayment = applyFullCashPayment;

        function setSvcPaymentMethodFallback(method) {
            const methodSel = document.getElementById('svc-payment-method');
            if (methodSel) methodSel.value = method;
            applyFullCashPayment('svc');
        }
        window.setSvcPaymentMethodFallback = setSvcPaymentMethodFallback;

        function setBatchPaymentMethodFallback(method) {
            const methodSel = document.getElementById('batch-payment-method');
            if (methodSel) methodSel.value = method;
            applyFullCashPayment('batch');
        }
        window.setBatchPaymentMethodFallback = setBatchPaymentMethodFallback;

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
            // Tài khoản nhận tiền: CK/thẻ bắt buộc chọn (tiền mặt để backend tự lấy két)
            let payAccountId = null;
            let remainderMethod = 'cash';
            let remainderAccountId = null;
            if (paymentStatus === 'paid' && paymentMethod === 'wallet') {
                // Ví chỉ trả phần dịch vụ -> phần còn lại (hàng hóa/tip/ví thiếu) thu theo hình thức chọn
                remainderMethod = spaRemainderMethod('svc');
                if (spaAccountNeedsAccount(remainderMethod)) {
                    remainderAccountId = spaAccountIdForMethod(remainderMethod, document.getElementById('svc-remainder-account'));
                    if (!remainderAccountId) {
                        alert('Vui lòng chọn "Tài khoản nhận tiền" cho phần còn lại thu bằng ' + (remainderMethod === 'card' ? 'quẹt thẻ' : 'chuyển khoản') + '!');
                        return;
                    }
                }
                payAccountId = remainderAccountId;
            } else if (paymentStatus === 'paid' && spaAccountNeedsAccount(paymentMethod || 'cash')) {
                payAccountId = spaAccountIdForMethod(paymentMethod, document.getElementById('svc-payment-account'));
                if (!payAccountId) {
                    alert('Vui lòng chọn "Tài khoản nhận tiền" cho hình thức ' + (paymentMethod === 'card' ? 'quẹt thẻ' : 'chuyển khoản') + '!');
                    return;
                }
            }
            const sendToHotel = document.getElementById('svc-send-to-hotel')?.checked ? 1 : 0;

            let extraServicesTotal = 0;
            if (Array.isArray(currentSvcExtraServices)) {
                extraServicesTotal = currentSvcExtraServices.reduce((acc, it) => acc + (Number(it.price) || 0), 0);
            }
            const extraTip = parseMoneyInput(document.getElementById('svc-tip-amount')?.value) || 0;
            const depositAmount = 0; // Đã bỏ đặt cọc trước trong phiếu dịch vụ Spa theo yêu cầu

            if (!custId) { alert('Vui lòng chọn hoặc thêm khách hàng!'); return; }
            if (!petName) { alert('Vui lòng nhập tên của bé!'); return; }
            if (weight <= 0) { alert('Vui lòng nhập cân nặng của bé (VD: 3.5 hoặc 3,5)!'); return; }

            const depositMethod = 'cash';
            let depositAccountId = null;

            // Tính phân tách tiền Dịch vụ Spa vs Tiền Hàng hóa Retail bán kèm
            let totalRetail = 0;
            if (Array.isArray(currentSvcRetailProducts)) {
                totalRetail = currentSvcRetailProducts.reduce((acc, it) => acc + ((it.price || 0) * (it.quantity || 1)), 0);
            }
            const totalSpaService = Math.max(0, totalPrice - totalRetail);

            if (paymentStatus === 'paid' && paymentMethod === 'wallet') {
                const cust = (allContacts || []).find(c => c.id == custId);
                const bal = (cust && cust.spa_wallet_balance) ? parseFloat(cust.spa_wallet_balance) : 0;
                if (bal <= 0) {
                    alert(`Số dư ví Spa của khách bằng 0 đ!\nVui lòng nạp thêm gói ví hoặc chọn phương thức thanh toán khác.`);
                    return;
                }
                if (svcWalletEligibleAmount() <= 0) {
                    alert(`Ví Spa chỉ áp dụng cho gói Combo Vip 1, Combo Vip 2, Combo Vip 3, Combo Super Vip (không áp dụng cho dịch vụ lẻ, nhuộm lông và phụ thu).\nVui lòng chọn phương thức thanh toán khác!`);
                    return;
                }
            }

            // Tạo danh sách lineItems chuẩn K80 kèm các phụ thu và hàng hóa POS
            const lineItems = [];
            if (primaryPkg) {
                const isMatched = _lastSvcCalculation && _lastSvcCalculation.primaryPkg === primaryPkg;
                const baseP = isMatched ? _lastSvcCalculation.base_price : findSpaPricingClientSide(primaryPkg, weight);
                const finalP = isMatched ? _lastSvcCalculation.final_price : findSpaPricingClientSide(primaryPkg, weight);
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
                    original_price: dyePrice,
                    is_dye: true
                });
            }

            // Dịch vụ phụ thu động (tự điền tên & giá)
            if (Array.isArray(currentSvcExtraServices)) {
                for (const es of currentSvcExtraServices) {
                    if (es.name && (Number(es.price) || 0) > 0) {
                        lineItems.push({
                            name: es.name,
                            quantity: 1,
                            price: Number(es.price) || 0,
                            original_price: Number(es.price) || 0,
                            is_surcharge: true
                        });
                    }
                }
            }
            if (extraTip > 0) lineItems.push({ name: 'Tiền tip thợ', quantity: 1, price: extraTip, original_price: extraTip, is_tip: true });

            if (Array.isArray(currentSvcRetailProducts)) {
                for (const rp of currentSvcRetailProducts) {
                    lineItems.push({
                        product_id: rp.id,
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
                account_id: payAccountId,
                remainder_method: remainderMethod,
                services_json: JSON.stringify(lineItems),
                staff_receiver: '',
                staff_worker_1: '',
                staff_worker_2: '',
                staff_cutter: '',
                staff_dyer: '',
                teeth_cleaning: 0,
                art_cutting_fee: 0,
                surcharge: extraServicesTotal,
                shipping_fee: 0,
                tip_amount: extraTip,
                deposit_amount: depositAmount,
                deposit_method: depositMethod,
                deposit_account_id: depositAccountId,
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
                        const bal = cust.spa_wallet_balance || 0;
                        const deducted = Math.min(bal, svcWalletEligibleAmount());
                        cust.spa_wallet_balance = Math.max(0, bal - deducted);
                    }
                }
                if (typeof window.refreshPOSProducts === 'function') {
                    window.refreshPOSProducts();
                }
                closeCreateServiceTicketModal();
                await loadPetServicesList();
                await loadPetServicesKPI();

                if (andPrint && result.id) {
                    printPetServiceTicketDirectly(result.id, 'intake');
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
                container.innerHTML = '<div class="text-xs text-slate-400 ">Khách hàng chưa có hồ sơ thú cưng (nhấn "+ Thêm bé mới" để nhập)</div>';
                if (countBadge) countBadge.textContent = '0 bé';
                if (tbody && tbody.children.length === 0) {
                    addBatchPetRow();
                }
                return;
            }

            container.innerHTML = currentSvcPetsList.map(p => {
                const wStr = p.weight ? String(p.weight).replace('.', ',') + 'kg' : 'Chưa cân';
                return `
                    <label class="flex items-center gap-1.5 px-2.5 py-1 bg-white border border-sky-200 hover:border-sky-400 rounded-lg cursor-pointer text-xs select-none shadow-xs transition-all">
                        <input type="checkbox" value="${p.id}" checked class="batch-pet-check w-3.5 h-3.5 text-sky-600 rounded" onchange="onBatchPetCheckToggled(${p.id}, this.checked)">
                        <span class="font-bold text-slate-800">🐾 ${p.name}</span>
                        <span class="text-xs text-sky-700 font-mono">(${p.breed || p.species || 'Cún'} - ${wStr})</span>
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
            const hasSurcharges = batchBulkSelectedSurcharges.size > 0;

            if (!bulkPkg && !bulkShaving && !hasSurcharges) {
                alert('Vui lòng chọn gói dịch vụ chung, kiểu cạo bàn hoặc chọn ít nhất 1 phụ thu mẫu!');
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

                if (hasSurcharges) {
                    const weight = parseWeightFloat(tr.querySelector('.batch-pet-weight')?.value);
                    tr._surch = Array.from(batchBulkSelectedSurcharges).map(n => ({ name: n, price: lookupSurchargePrice(n, weight) }));
                    renderBatchRowSurcharges(tr);
                }

                calcBatchRowTotal(tr);
                appliedCount++;
            });

            calcBatchGrandTotal();
            if (typeof showToast === 'function') {
                showToast(`Đã áp dụng thiết lập cho ${rows.length} bé!`, 'success');
            }
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

            let surchNames = [];
            (allPetPricingData || []).forEach(x => {
                const cLow = (x.category || '').toLowerCase();
                if (cLow.includes('phụ thu') || cLow.includes('trị liệu')) {
                    const sName = (x.service_name || '').trim();
                    if (sName && !surchNames.includes(sName)) {
                        surchNames.push(sName);
                    }
                }
            });
            if (surchNames.length === 0) {
                surchNames = ['Gỡ rối lông', 'Tắm nấm / Viêm da', 'Đánh răng', 'Cắt tạo kiểu NT', 'Đưa đón tận nơi'];
            }

            let rowSurchButtons = surchNames.map(name => `
                <button type="button" onclick="pickBatchRowChip(this, '${escapeSpaHtml(name)}')" data-surch-name="${escapeSpaHtml(name)}"
                    class="batch-surch-chip px-1.5 py-0.5 rounded text-xs font-bold bg-amber-100 hover:bg-amber-200 text-amber-900 border border-amber-300 transition cursor-pointer select-none">
                    + ${escapeSpaHtml(name)}
                </button>
            `).join('');

            tr.innerHTML = `
                <td class="p-2 text-center">
                    <div class="flex items-center justify-center gap-1">
                        <input type="checkbox" class="batch-row-checkbox w-3.5 h-3.5 text-sky-600 rounded cursor-pointer" checked>
                        <span class="font-mono text-slate-500 font-bold batch-row-stt text-xs">${rowIdx}</span>
                    </div>
                    <div class="batch-row-ticketno mt-0.5 font-mono font-bold text-xs text-sky-800 bg-sky-100 border border-sky-300 rounded px-1" title="Số phiếu của bé này">#--</div>
                </td>
                <td class="p-2">
                    <div class="space-y-1">
                        <select class="w-full border p-1 rounded text-xs font-bold text-sky-800 batch-pet-select" onchange="onBatchRowPetChanged(this)">
                            ${petOpts}
                        </select>
                        <input type="text" class="w-full border p-1 rounded text-xs font-bold batch-pet-name ${petData && petData.id ? 'hidden' : ''}" placeholder="Tên bé (*)" value="${initialName}">
                        <input type="hidden" class="batch-pet-breed" value="${initialBreed}">
                        <input type="hidden" class="batch-pet-gender" value="${initialGender}">
                        <input type="hidden" class="batch-pet-color" value="${initialColor}">
                    </div>
                </td>
                <td class="p-2 text-center">
                    <input type="text" class="w-16 border-2 border-sky-200 p-1 rounded text-xs text-center font-bold font-mono text-sky-700 batch-pet-weight" placeholder="VD: 3.5" value="${initialWeight}" oninput="calcBatchRowTotal(this.closest('tr'))">
                </td>
                <td class="p-2">
                    <select class="w-full border p-1 rounded text-xs font-medium text-slate-800 batch-pet-primary" onchange="calcBatchRowTotal(this.closest('tr'))">
                        ${primaryOpts}
                    </select>
                </td>
                <td class="p-2 text-center">
                    <select class="w-full border p-1 rounded text-xs text-slate-700 batch-pet-shaving">
                        <option value="Không cạo bàn">Không</option>
                        <option value="Cạo bàn">Có cạo</option>
                        <option value="Cạo bàn cao">Cạo cao</option>
                    </select>
                </td>
                <td class="p-2 text-center">
                    <select class="w-full border p-1 rounded text-xs text-slate-700 batch-pet-dye" onchange="calcBatchRowTotal(this.closest('tr'))">
                        ${dyeOpts}
                    </select>
                </td>
                <td class="p-2 bg-amber-50/40 min-w-[240px]">
                    <div class="space-y-1">
                        <input type="hidden" class="batch-pet-surch-note" value="">
                        <input type="hidden" class="batch-pet-surch-amt" value="">
                        <div class="batch-selected-surch-list space-y-1"></div>
                        <div class="batch-surch-chips-pool flex flex-wrap gap-1">
                            ${rowSurchButtons}
                        </div>
                        <button type="button" onclick="addCustomBatchRowSurcharge(this)" class="text-amber-800 hover:text-amber-950 font-bold text-xs bg-amber-100/70 hover:bg-amber-200 px-1.5 py-0.5 rounded border border-amber-300 transition">➕ Tự thêm dòng</button>
                    </div>
                </td>
                <td class="p-2 text-right">
                    <span class="font-mono font-bold text-xs text-rose-700 batch-pet-total">0 đ</span>
                    <input type="hidden" class="batch-pet-total-val" value="0">
                </td>
                <td class="p-2 space-y-1">
                    <input type="text" class="w-full border p-1 rounded text-xs batch-pet-notes" placeholder="Yêu cầu cắt, sấy...">
                    <input type="text" class="w-full border p-0.5 rounded text-xs text-amber-800 batch-pet-accessories" placeholder="Phụ kiện gửi lại (dây, chuồng...)">
                    <input type="hidden" class="batch-pet-cutter" value="">
                    <input type="hidden" class="batch-pet-hotel" value="0">
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

        // Giá phụ thu theo tên + cân nặng (khớp Bảng Giá; không có thì dùng giá gợi ý theo từ khóa)
        function lookupSurchargePrice(sName, weight) {
            const searchLower = (sName || '').trim().toLowerCase();
            let sPrice = 40000;
            if (Array.isArray(allPetPricingData)) {
                const isSurch = x => { const c = (x.category || '').toLowerCase(); return c.includes('phụ thu') || c.includes('trị liệu'); };
                let match = null;
                if (weight > 0) {
                    match = allPetPricingData.find(x => isSurch(x) && x.service_name && x.service_name.trim().toLowerCase() === searchLower &&
                        (x.min_weight === 0 ? weight >= x.min_weight : weight > x.min_weight) && weight <= x.max_weight);
                }
                if (!match) match = allPetPricingData.find(x => isSurch(x) && x.service_name && x.service_name.trim().toLowerCase() === searchLower);
                if (match && match.price > 0) return match.price;
            }
            if (searchLower.includes('đánh răng')) sPrice = 30000;
            else if (searchLower.includes('tạo kiểu') || searchLower.includes('cắt nt')) sPrice = 50000;
            else if (searchLower.includes('gỡ rối')) sPrice = 40000;
            else if (searchLower.includes('đưa đón')) sPrice = 50000;
            else if (searchLower.includes('viêm da') || searchLower.includes('nấm')) sPrice = 60000;
            return sPrice;
        }

        // Tổng hợp phụ thu của 1 dòng bé vào 2 ô ẩn (.batch-pet-surch-note/.batch-pet-surch-amt), ẩn nút đã chọn, tính lại tiền
        function syncBatchRowSurchAgg(tr) {
            const items = tr._surch || [];
            const total = items.reduce((s, it) => s + (Number(it.price) || 0), 0);
            const noteEl = tr.querySelector('.batch-pet-surch-note');
            const amtEl = tr.querySelector('.batch-pet-surch-amt');
            if (noteEl) noteEl.value = items.map(it => (it.name || '').trim()).filter(Boolean).join(', ');
            if (amtEl) amtEl.value = total ? formatMoneyString(total) : '';
            const picked = new Set(items.map(it => (it.name || '').trim().toLowerCase()));
            tr.querySelectorAll('.batch-surch-chips-pool [data-surch-name]').forEach(b => {
                b.classList.toggle('hidden', picked.has((b.getAttribute('data-surch-name') || '').trim().toLowerCase()));
            });
            calcBatchRowTotal(tr);
        }

        function renderBatchRowSurcharges(tr) {
            const list = tr.querySelector('.batch-selected-surch-list');
            if (list) {
                list.innerHTML = (tr._surch || []).map((it, i) => `
                    <div class="batch-surch-item flex items-center gap-1 bg-amber-50 p-0.5 rounded border border-amber-200" data-idx="${i}">
                        <input type="text" value="${escapeSpaHtml(it.name || '')}" placeholder="Tên phụ thu"
                            oninput="onBatchSurchEdit(this, 'name')"
                            class="batch-surch-name flex-1 min-w-0 border p-0.5 rounded text-xs bg-white font-medium text-slate-800">
                        <input type="text" value="${it.price ? Number(it.price).toLocaleString('vi-VN') : ''}" placeholder="0"
                            oninput="onMoneyInputChange(this); onBatchSurchEdit(this, 'price')"
                            class="batch-surch-price w-16 border p-0.5 rounded text-xs text-right font-mono font-bold text-amber-900 bg-white">
                        <span class="text-xs text-slate-500 font-bold">đ</span>
                        <button type="button" onclick="cancelBatchRowChip(this)" class="text-rose-500 hover:text-rose-700 font-bold px-1 text-xs" title="Bỏ phụ thu này">✕</button>
                    </div>
                `).join('');
            }
            syncBatchRowSurchAgg(tr);
        }
        window.renderBatchRowSurcharges = renderBatchRowSurcharges;

        // Chọn 1 nút phụ thu: thêm dòng (tự áp giá theo kg) và nút biến mất
        function pickBatchRowChip(btn, sName) {
            const tr = btn.closest('tr');
            if (!tr) return;
            const weight = parseWeightFloat(tr.querySelector('.batch-pet-weight')?.value);
            tr._surch = tr._surch || [];
            tr._surch.push({ name: sName, price: lookupSurchargePrice(sName, weight) });
            renderBatchRowSurcharges(tr);
        }
        window.pickBatchRowChip = pickBatchRowChip;

        // Bấm ✕: bỏ dòng phụ thu, nút tương ứng hiện lại
        function cancelBatchRowChip(btn) {
            const tr = btn.closest('tr');
            const item = btn.closest('.batch-surch-item');
            if (!tr || !item) return;
            (tr._surch || []).splice(Number(item.dataset.idx), 1);
            renderBatchRowSurcharges(tr);
        }
        window.cancelBatchRowChip = cancelBatchRowChip;

        function addCustomBatchRowSurcharge(btn) {
            const tr = btn.closest('tr');
            if (!tr) return;
            tr._surch = tr._surch || [];
            tr._surch.push({ name: '', price: 0 });
            renderBatchRowSurcharges(tr);
            const inputs = tr.querySelectorAll('.batch-surch-item .batch-surch-name');
            if (inputs.length) inputs[inputs.length - 1].focus();
        }
        window.addCustomBatchRowSurcharge = addCustomBatchRowSurcharge;

        // Gõ sửa tên/giá trong dòng phụ thu: không vẽ lại danh sách (giữ con trỏ), chỉ đồng bộ tổng
        function onBatchSurchEdit(input, field) {
            const tr = input.closest('tr');
            const item = input.closest('.batch-surch-item');
            if (!tr || !item) return;
            const it = (tr._surch || [])[Number(item.dataset.idx)];
            if (!it) return;
            it[field] = field === 'price' ? parseMoneyInput(input.value) : input.value;
            syncBatchRowSurchAgg(tr);
        }
        window.onBatchSurchEdit = onBatchSurchEdit;

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
                if (nameInput) {
                    nameInput.value = '';
                    nameInput.classList.remove('hidden');
                }
                if (weightInput) weightInput.value = '';
                if (breedInput) breedInput.value = '';
                if (colorInput) colorInput.value = '';
            } else {
                const p = (currentSvcPetsList || []).find(x => x.id == petId);
                if (p) {
                    if (nameInput) {
                        nameInput.value = p.name || '';
                        nameInput.classList.add('hidden');
                    }
                    if (weightInput && p.weight) weightInput.value = String(p.weight).replace('.', ',');
                    if (breedInput && p.breed) breedInput.value = p.breed;
                    if (genderInput && p.gender) genderInput.value = p.gender;
                    if (colorInput && p.color) colorInput.value = p.color;
                }
            }
            calcBatchRowTotal(tr);
        }
        window.onBatchRowPetChanged = onBatchRowPetChanged;

        function onBatchQuickSurchPreset(sel) {
            const tr = sel.closest('tr');
            if (!tr) return;
            const val = sel.value;
            if (!val) return;
            const noteEl = tr.querySelector('.batch-pet-surch-note');
            if (noteEl) noteEl.value = val;
            const amtEl = tr.querySelector('.batch-pet-surch-amt');
            const weightVal = tr.querySelector('.batch-pet-weight')?.value;
            const weight = parseWeightFloat(weightVal);
            let price = 40000;
            if (val.includes('Đánh răng')) price = 30000;
            else if (val.includes('Cắt nghệ thuật')) price = 50000;
            else if (val.includes('Viêm da')) price = 60000;
            else if (val.includes('Đưa đón')) price = 50000;
            else if (val.includes('Gỡ rối')) price = 40000;

            if (Array.isArray(allPetPricingData) && weight > 0) {
                const match = allPetPricingData.find(x => {
                    const cLow = (x.category || '').toLowerCase();
                    return (cLow.includes('phụ thu') || cLow.includes('trị liệu')) &&
                        x.service_name && val.toLowerCase().includes(x.service_name.toLowerCase()) &&
                        (x.min_weight === 0 ? weight >= x.min_weight : weight > x.min_weight) && weight <= x.max_weight;
                });
                if (match && match.price > 0) price = match.price;
            }

            if (amtEl) amtEl.value = formatMoneyString(price);
            sel.value = '';
            calcBatchRowTotal(tr);
        }
        window.onBatchQuickSurchPreset = onBatchQuickSurchPreset;

        function calcBatchRowTotal(tr) {
            if (!tr) return;
            const weightVal = tr.querySelector('.batch-pet-weight')?.value;
            const weight = parseWeightFloat(weightVal);
            const primaryPkg = tr.querySelector('.batch-pet-primary')?.value || '';
            const dyePkg = tr.querySelector('.batch-pet-dye')?.value || '';

            const surcharge = parseMoneyInput(tr.querySelector('.batch-pet-surch-amt')?.value) || 0;

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

            const rowTotal = price + surcharge;
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
            syncBatchWalletPaymentSuggestion(grandTotal);
            syncBatchRemainderRow();
            refreshSvcTicketNumbers();
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
            // Tài khoản nhận tiền của cả đợt: CK/thẻ bắt buộc chọn
            let payAccountId = null;
            let remainderMethod = 'cash';
            if (paymentTiming === 'paid' && paymentMethod === 'wallet') {
                remainderMethod = spaRemainderMethod('batch');
                if (spaAccountNeedsAccount(remainderMethod)) {
                    payAccountId = spaAccountIdForMethod(remainderMethod, document.getElementById('batch-remainder-account'));
                    if (!payAccountId) {
                        alert('Vui lòng chọn "Tài khoản nhận tiền" cho phần thu ngoài bằng ' + (remainderMethod === 'card' ? 'quẹt thẻ' : 'chuyển khoản') + '!');
                        return;
                    }
                }
            } else if (paymentTiming === 'paid' && spaAccountNeedsAccount(paymentMethod || 'cash')) {
                payAccountId = spaAccountIdForMethod(paymentMethod, document.getElementById('batch-payment-account'));
                if (!payAccountId) {
                    alert('Vui lòng chọn "Tài khoản nhận tiền" cho hình thức ' + (paymentMethod === 'card' ? 'quẹt thẻ' : 'chuyển khoản') + '!');
                    return;
                }
            }

            if (paymentTiming === 'paid' && paymentMethod === 'wallet') {
                const totalBatch = parseFloat(document.getElementById('batch-grand-total')?.textContent?.replace(/[^\d]/g, '') || 0);
                const cust = (allContacts || []).find(c => c.id == custId);
                const bal = (cust && cust.spa_wallet_balance) ? parseFloat(cust.spa_wallet_balance) : 0;
                if (bal <= 0) {
                    alert(`Số dư ví Spa của khách bằng 0 đ!\nVui lòng nạp thêm gói ví hoặc chọn phương thức thanh toán khác.`);
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

                const surcharge = parseMoneyInput(tr.querySelector('.batch-pet-surch-amt')?.value) || 0;
                const surchargeNote = tr.querySelector('.batch-pet-surch-note')?.value.trim() || 'Phụ thu dịch vụ';

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
                const basePrice = Math.max(0, rowTotal - surcharge);
                if (primaryPkg) {
                    lineItems.push({ name: primaryPkg, quantity: 1, price: basePrice, original_price: basePrice });
                }
                if (dyePkg) {
                    lineItems.push({ name: dyePkg, quantity: 1, price: 0, original_price: 0 });
                }
                const surchRows = (tr._surch || []).filter(it => (it.name || '').trim() && Number(it.price) > 0);
                if (surchRows.length > 0) {
                    surchRows.forEach(it => lineItems.push({ name: it.name.trim(), quantity: 1, price: Number(it.price), original_price: Number(it.price), is_surcharge: true }));
                } else if (surcharge > 0) {
                    lineItems.push({ name: surchargeNote, quantity: 1, price: surcharge, original_price: surcharge, is_surcharge: true });
                }

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
                    teeth_cleaning: 0,
                    art_cutting_fee: 0,
                    surcharge: surcharge,
                    shipping_fee: 0,
                    tip_amount: 0,
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
                        start_ticket_number: svcTicketBaseNo || null,
                        account_id: payAccountId,
                        remainder_method: remainderMethod,
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
                        const bal = cust.spa_wallet_balance || 0;
                        const deducted = Math.min(bal, totalBatch);
                        cust.spa_wallet_balance = Math.max(0, bal - deducted);
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
                const hasSurchargeItems = items.some(it => it && it.is_surcharge);
                if (extraTeeth > 0 && !items.some(it => (it.name || '').toLowerCase().includes('răng'))) {
                    items.push({ name: 'Đánh răng', quantity: 1, price: extraTeeth, original_price: extraTeeth, is_surcharge: true });
                }
                if (extraArt > 0 && !items.some(it => (it.name || '').toLowerCase().includes('nghệ thuật'))) {
                    items.push({ name: 'PT Cắt nghệ thuật', quantity: 1, price: extraArt, original_price: extraArt, is_surcharge: true });
                }
                if (extraSurch > 0 && !hasSurchargeItems && !items.some(it => {
                    const nm = (it.name || '').toLowerCase();
                    return nm.includes('phụ thu') || nm.includes('gỡ rối') || nm.includes('răng') || nm.includes('tẩy lông') || nm.includes('cắt tỉa đầu') || nm.includes('nấm da') || nm.includes('trị liệu');
                })) {
                    items.push({ name: 'Phụ thu khác', quantity: 1, price: extraSurch, original_price: extraSurch, is_surcharge: true });
                }
                if (extraShip > 0 && !items.some(it => (it.name || '').toLowerCase().includes('giao') || (it.name || '').toLowerCase().includes('vận chuyển') || (it.name || '').toLowerCase().includes('ship'))) {
                    items.push({ name: 'Cước giao bé về', quantity: 1, price: extraShip, original_price: extraShip, is_surcharge: true });
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
            let totalService = 0;
            let totalProducts = 0;

            const rowsHtml = items.map(it => {
                const qty = it.quantity || 1;
                const price = it.price || 0;
                const origPrice = (it.original_price && it.original_price > price) ? it.original_price : price;
                const subtotal = qty * price;
                const hasDiscount = origPrice > price;
                const diff = origPrice - price;

                totalOriginal += (origPrice * qty);
                totalFinal += subtotal;
                if (it.is_retail) {
                    totalProducts += subtotal;
                } else if (it.is_tip || it.name === 'Tiền tip thợ') {
                    // Tip tách riêng, không tính vào totalService để tránh nhân đôi tip
                } else {
                    totalService += subtotal;
                }

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

                const typeTag = it.is_retail 
                    ? '<span style="border: 1px solid #000; font-size: 9px; font-weight: 900; padding: 0 3px; margin-right: 4px; border-radius: 2px;">SP</span>'
                    : '<span style="border: 1px solid #000; font-size: 9px; font-weight: 900; padding: 0 3px; margin-right: 4px; border-radius: 2px; background: #000; color: #fff;">SPA</span>';

                return `
                    <tr>
                        <td colspan="3" style="padding: 5px 0 2px 0; font-weight: 900; font-size: 12px; color: #000; text-align: left; word-break: break-word; line-height: 1.2;">
                            ${typeTag}${it.name}
                        </td>
                    </tr>
                    <tr style="border-bottom: 1px dashed #000;">
                        <td style="text-align: left; vertical-align: top; padding: 2px 0 5px 0; font-family: monospace; font-weight: 800; color: #000;">${qty}</td>
                        <td style="text-align: right; vertical-align: top; padding: 2px 0 5px 0;">${priceDisplay}</td>
                        <td style="text-align: right; vertical-align: top; padding: 2px 0 5px 0;">${subtotalDisplay}</td>
                    </tr>
                `;
            }).join('');

            const servicePrice = Number(ticket.price || totalFinal || 0);
            if (totalService === 0 && totalProducts === 0) {
                totalService = Math.max(0, servicePrice - tipAmount);
            }
            const hasAnyDiscount = totalOriginal > servicePrice;
            const totalDiscount = Math.max(0, totalOriginal - servicePrice);
            const tipAmount = Number(ticket.tip_amount || 0);
            const depositAmount = Number(ticket.deposit_amount || 0);
            const walletDeduction = Number(ticket.spa_wallet_deduction !== undefined && ticket.spa_wallet_deduction !== null 
                ? ticket.spa_wallet_deduction 
                : (ticket.payment_method === 'wallet' ? totalService : 0));
            const cashPayable = Math.max(0, (totalService - walletDeduction) + totalProducts + tipAmount - depositAmount);
            const finalPayable = cashPayable;

            if (type === 'tip_slip') {
                // PHIẾU TIỀN TIP CHO THỢ (SLIP ĐỐI SOÁT CUỐI CA)
                return `
                    <div class="thermal-k80-wrapper" style="width: 72mm; max-width: 72mm; margin: 0 auto; box-sizing: border-box; font-family: 'Segoe UI', Arial, sans-serif; font-size: 11.5px; line-height: 1.35; color: #000; padding: 1mm 1mm;">
                        <div style="text-align: center; border-bottom: 2px dashed #000; padding-bottom: 8px; margin-bottom: 8px;">
                            <h2 style="margin: 0; font-size: 15px; font-weight: 900; text-transform: uppercase; color: #000;">🐾 PET SPA & GROOMING</h2>
                            <div style="font-size: 13px; font-weight: 900; margin-top: 4px; color: #000;">PHIẾU TIỀN TIP CHO THỢ</div>
                            <div style="font-size: 10px; font-weight: 700; color: #000; margin-top: 2px;">(Thu hộ thợ - Đối soát cuối ca)</div>
                            <div style="display: inline-block; border: 1.5px solid #000; color: #000; font-size: 14px; font-weight: 900; padding: 2px 8px; border-radius: 4px; margin-top: 5px;">
                                SỐ PHIẾU: #${ticket.ticket_number || ticket.id}
                            </div>
                            <div style="font-size: 10px; font-weight: 700; color: #000; margin-top: 2px;">Mã: ${ticket.code} · Ngày: ${dateStr}</div>
                        </div>

                        <div style="border-bottom: 1px dashed #000; padding-bottom: 6px; margin-bottom: 6px; font-size: 12px;">
                            <div><strong>Bé:</strong> <span style="font-weight: 800;">${ticket.pet_name || 'Bé cưng'}</span> (${ticket.customer_name || 'Khách lẻ'})</div>
                            <div><strong>Thợ cắt:</strong> <span style="font-weight: 800;">${ticket.staff_cutter || '-'}</span></div>
                            <div><strong>Thợ tắm / làm:</strong> <span style="font-weight: 800;">${ticket.staff_worker_1 || '-'}</span></div>
                        </div>

                        <div style="border: 2px solid #000; border-radius: 4px; padding: 8px; text-align: center; margin-bottom: 8px;">
                            <div style="font-size: 11px; font-weight: 700;">TIỀN TIP NHẬN ĐƯỢC:</div>
                            <div style="font-size: 20px; font-weight: 900; font-family: monospace; margin: 4px 0;">${formatMoney(tipAmount)}</div>
                            <div style="font-size: 10px; font-style: italic;">(Khách hàng thưởng dịch vụ chu đáo)</div>
                        </div>

                        <div style="display: flex; justify-content: space-between; text-align: center; font-size: 10px; margin-top: 10px; margin-bottom: 15px;">
                            <div style="width: 48%;">
                                <div style="font-weight: 800;">Thu Ngân / Kế Toán</div>
                                <div style="height: 35px;"></div>
                                <div>(Ký giao)</div>
                            </div>
                            <div style="width: 48%;">
                                <div style="font-weight: 800;">Thợ Nhận Tip</div>
                                <div style="height: 35px;"></div>
                                <div>${ticket.staff_cutter || ticket.staff_worker_1 || '(Ký nhận)'}</div>
                            </div>
                        </div>
                        <!-- Dọn khoảng cách dòng cắt giấy máy in nhiệt -->
                        <div style="height: 18mm; width: 100%;"></div>
                    </div>
                `;
            }

            if (type === 'deposit_slip') {
                // PHIẾU BIÊN NHẬN ĐẶT CỌC
                return `
                    <div class="thermal-k80-wrapper" style="width: 72mm; max-width: 72mm; margin: 0 auto; box-sizing: border-box; font-family: 'Segoe UI', Arial, sans-serif; font-size: 11.5px; line-height: 1.35; color: #000; padding: 1mm 1mm;">
                        <div style="text-align: center; border-bottom: 2px dashed #000; padding-bottom: 8px; margin-bottom: 8px;">
                            <h2 style="margin: 0; font-size: 15px; font-weight: 900; text-transform: uppercase; color: #000;">🐾 PET SPA & GROOMING</h2>
                            <div style="font-size: 13px; font-weight: 900; margin-top: 4px; color: #000;">BIÊN NHẬN TIỀN ĐẶT CỌC</div>
                            <div style="font-size: 10px; font-weight: 700; color: #000; margin-top: 2px;">(Giữ đối chiếu khi đón bé thanh toán)</div>
                            <div style="display: inline-block; border: 1.5px solid #000; color: #000; font-size: 14px; font-weight: 900; padding: 2px 8px; border-radius: 4px; margin-top: 5px;">
                                SỐ PHIẾU: #${ticket.ticket_number || ticket.id}
                            </div>
                            <div style="font-size: 10px; font-weight: 700; color: #000; margin-top: 2px;">Mã: ${ticket.code} · Ngày: ${dateStr}</div>
                        </div>

                        <div style="border-bottom: 1px dashed #000; padding-bottom: 6px; margin-bottom: 6px; font-size: 12px;">
                            <div><strong>Khách hàng:</strong> <span style="font-weight: 800;">${ticket.customer_name || 'Khách lẻ'}</span> (${ticket.customer_phone || '-'})</div>
                            <div><strong>Bé cưng:</strong> <span style="font-weight: 800;">${ticket.pet_name || 'Bé cưng'}</span> - ${ticket.service_type || '-'}</div>
                        </div>

                        <div style="border: 2px solid #000; border-radius: 4px; padding: 8px; text-align: center; margin-bottom: 8px;">
                            <div style="font-size: 11px; font-weight: 700;">SỐ TIỀN ĐÃ ĐẶT CỌC:</div>
                            <div style="font-size: 20px; font-weight: 900; font-family: monospace; margin: 4px 0;">${formatMoney(depositAmount)}</div>
                            <div style="font-size: 10px; font-style: italic;">(Được trừ trực tiếp khi thanh toán lúc trả bé)</div>
                        </div>

                        <div style="display: flex; justify-content: space-between; text-align: center; font-size: 10px; margin-top: 10px; margin-bottom: 15px;">
                            <div style="width: 48%;">
                                <div style="font-weight: 800;">Thu Ngân Nhận Cọc</div>
                                <div style="height: 35px;"></div>
                                <div>${ticket.staff_receiver || '(Ký nhận)'}</div>
                            </div>
                            <div style="width: 48%;">
                                <div style="font-weight: 800;">Khách Gửi Cọc</div>
                                <div style="height: 35px;"></div>
                                <div>(Ký xác nhận)</div>
                            </div>
                        </div>
                        <!-- Dọn khoảng cách dòng cắt giấy máy in nhiệt -->
                        <div style="height: 18mm; width: 100%;"></div>
                    </div>
                `;
            }

            if (type === 'invoice') {
                // PHIẾU THANH TOÁN / TRẢ BÉ (K80) - TÁCH TIỀN MINH BẠCH (DỊCH VỤ, CỌC, TIP)
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

                        ${ticket.original_service_type && ticket.original_service_type !== ticket.service_type ? `
                        <!-- KHỐI LỊCH SỬ ĐIỀU CHỈNH GÓI DỊCH VỤ CHỐNG GIAN LẬN -->
                        <div style="border: 1.5px solid #000; border-radius: 4px; padding: 6px; margin-bottom: 6px; background-color: #fff;">
                            <div style="font-weight: 900; font-size: 11px; text-transform: uppercase; border-bottom: 1px dashed #000; padding-bottom: 3px; margin-bottom: 4px;">
                                ⚠️ LỊCH SỬ ĐIỀU CHỈNH DỊCH VỤ:
                            </div>
                            <div style="font-size: 11px; line-height: 1.4;">
                                <div>• Gói ban đầu: <strong style="text-decoration: line-through;">${escapeSpaHtml(ticket.original_service_type)}</strong> ${ticket.original_price ? `(${formatMoney(ticket.original_price)})` : ''}</div>
                                <div>• Đổi sang gói: <strong>${escapeSpaHtml(ticket.service_type)}</strong></div>
                                <div>• Lý do đổi: <strong>${escapeSpaHtml(ticket.service_change_reason || 'Lông rối bết / Hiện trạng bé')}</strong></div>
                                ${ticket.service_changed_at ? `<div style="font-size: 10px; color: #333;">• Thời gian: ${escapeSpaHtml(ticket.service_changed_at)}</div>` : ''}
                            </div>
                        </div>
                        ` : ''}

                        <div style="border-bottom: 2px dashed #000; padding-bottom: 6px; margin-bottom: 6px;">
                            ${hasAnyDiscount ? `
                            <div style="display: flex; justify-content: space-between; font-size: 11px; margin-bottom: 3px; font-weight: 700;">
                                <span>Tổng tiền dịch vụ gốc:</span>
                                <span style="font-family: monospace; font-weight: 800;">${formatMoney(totalOriginal)}</span>
                            </div>
                            <div style="display: flex; justify-content: space-between; font-size: 11px; font-weight: 800; margin-bottom: 3px;">
                                <span>Giảm giá / Ưu đãi:</span>
                                <span style="font-family: monospace;">- ${formatMoney(totalDiscount)}</span>
                            </div>
                            ` : ''}

                            <!-- 1. Tiền dịch vụ spa -->
                            <div style="display: flex; justify-content: space-between; font-size: 11.5px; margin-bottom: 3px; font-weight: 800;">
                                <span>1. Tiền Dịch Vụ Spa:</span>
                                <span style="font-family: monospace; font-weight: 900;">${formatMoney(totalService)}</span>
                            </div>

                            <!-- 2. Tiền Sản Phẩm Hàng Hóa Mua Kèm (nếu có) -->
                            ${totalProducts > 0 ? `
                            <div style="display: flex; justify-content: space-between; font-size: 11.5px; margin-bottom: 3px; font-weight: 800;">
                                <span>2. Tiền Sản Phẩm Mua Kèm:</span>
                                <span style="font-family: monospace; font-weight: 900;">${formatMoney(totalProducts)}</span>
                            </div>
                            ` : ''}

                            <!-- 3. Khấu trừ Ví Spa (cho dịch vụ) -->
                            ${walletDeduction > 0 ? `
                            <div style="display: flex; justify-content: space-between; font-size: 11.5px; margin-bottom: 3px; font-weight: 800;">
                                <span>3. Đã Trừ Ví Spa (dịch vụ):</span>
                                <span style="font-family: monospace; font-weight: 900;">- ${formatMoney(walletDeduction)}</span>
                            </div>
                            ` : ''}

                            <!-- 4. Tiền Tip Thợ (nếu có) -->
                            ${tipAmount > 0 ? `
                            <div style="display: flex; justify-content: space-between; font-size: 11px; margin-bottom: 3px; font-weight: 800; color: #000;">
                                <span>${(totalProducts > 0 || walletDeduction > 0) ? 'Tiền Tip Thợ (thu hộ):' : '2. Tiền Tip Thợ (thu hộ):'}</span>
                                <span style="font-family: monospace; font-weight: 900;">+ ${formatMoney(tipAmount)}</span>
                            </div>
                            ` : ''}

                            <!-- 5. Tiền Đã Đặt Cọc (nếu có) -->
                            ${depositAmount > 0 ? `
                            <div style="display: flex; justify-content: space-between; font-size: 11px; margin-bottom: 3px; font-weight: 800; color: #000;">
                                <span>${type === 'intake' ? 'ĐÃ ĐẶT CỌC TRƯỚC:' : ((totalProducts > 0 || walletDeduction > 0) ? 'Đã Đặt Cọc Trước:' : '3. Đã Đặt Cọc Trước:')}</span>
                                <span style="font-family: monospace; font-weight: 900;">- ${formatMoney(depositAmount)}</span>
                            </div>
                            ` : ''}

                            <!-- TỔNG CỘNG THỰC THU TIỀN MẶT / CHUYỂN KHOẢN -->
                            <div style="display: flex; justify-content: space-between; font-size: 14.5px; font-weight: 900; margin-top: 4px; border-top: 2px solid #000; border-bottom: 2px solid #000; padding: 4px 0;">
                                <span>${walletDeduction > 0 ? 'THỰC THU (TIỀN MẶT / CK):' : (type === 'intake' ? (depositAmount > 0 ? 'CÒN LẠI KHI NHẬN BÉ:' : 'TỔNG CỘNG:') : ((depositAmount > 0 || tipAmount > 0) ? 'THỰC THU TẠI QUẦY:' : 'TỔNG CỘNG:'))}</span>
                                <span style="font-family: monospace;">${formatMoney(cashPayable)}</span>
                            </div>

                            <div style="display: flex; justify-content: space-between; font-size: 11px; font-weight: 900; margin-top: 4px; line-height: 1.3;">
                                <span>Trạng thái TT:</span>
                                <span style="text-align: right;">${
                                    ticket.payment_status === 'paid'
                                        ? (walletDeduction > 0 
                                            ? (totalProducts > 0 
                                                ? `ĐÃ TRỪ VÍ (${formatMoney(walletDeduction)}) + THU TM/CK (${formatMoney(cashPayable)})` 
                                                : `ĐÃ TRỪ VÍ SPA (${formatMoney(walletDeduction)})`)
                                            : 'ĐÃ THANH TOÁN')
                                        : 'CHƯA THANH TOÁN'
                                }</span>
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
                        <!-- Dọn khoảng cách dòng cắt giấy máy in nhiệt (chống cắt phạm chữ) -->
                        <div style="height: 18mm; width: 100%;"></div>
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
                            ${ticket.original_service_type && ticket.original_service_type !== ticket.service_type ? `
                            <div style="border: 1px solid #000; border-radius: 3px; padding: 4px 6px; margin-top: 4px; font-size: 10px; line-height: 1.35;">
                                <div>• Gói gốc: <span style="text-decoration: line-through;">${escapeSpaHtml(ticket.original_service_type)}</span></div>
                                <div>• Đổi sang: <strong>${escapeSpaHtml(ticket.service_type)}</strong></div>
                                <div>• Lý do: <strong>${escapeSpaHtml(ticket.service_change_reason || 'Hiện trạng bé')}</strong></div>
                            </div>
                            ` : ''}
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
                                <span>Tổng tiền dịch vụ gốc:</span>
                                <span style="font-family: monospace; font-weight: 800;">${formatMoney(totalOriginal)}</span>
                            </div>
                            <div style="display: flex; justify-content: space-between; font-size: 11px; font-weight: 800; margin-bottom: 3px;">
                                <span>Giảm giá / Ưu đãi:</span>
                                <span style="font-family: monospace;">- ${formatMoney(totalDiscount)}</span>
                            </div>
                            ` : ''}

                            <!-- 1. Tiền Dịch Vụ Spa -->
                            <div style="display: flex; justify-content: space-between; font-size: 11.5px; margin-bottom: 3px; font-weight: 800;">
                                <span>1. Tiền Dịch Vụ Spa:</span>
                                <span style="font-family: monospace; font-weight: 900;">${formatMoney(totalService)}</span>
                            </div>

                            <!-- 2. Tiền Sản Phẩm Hàng Hóa Mua Kèm (nếu có) -->
                            ${totalProducts > 0 ? `
                            <div style="display: flex; justify-content: space-between; font-size: 11.5px; margin-bottom: 3px; font-weight: 800;">
                                <span>2. Tiền Sản Phẩm Mua Kèm:</span>
                                <span style="font-family: monospace; font-weight: 900;">${formatMoney(totalProducts)}</span>
                            </div>
                            ` : ''}

                            <!-- 3. Khấu trừ Ví Spa (cho dịch vụ) -->
                            ${walletDeduction > 0 ? `
                            <div style="display: flex; justify-content: space-between; font-size: 11.5px; margin-bottom: 3px; font-weight: 800;">
                                <span>3. Đã Trừ Ví Spa (dịch vụ):</span>
                                <span style="font-family: monospace; font-weight: 900;">- ${formatMoney(walletDeduction)}</span>
                            </div>
                            ` : ''}

                            <!-- 4. Tiền Đã Đặt Cọc (nếu có) -->
                            ${depositAmount > 0 ? `
                            <div style="display: flex; justify-content: space-between; font-size: 11.5px; margin-bottom: 3px; font-weight: 800;">
                                <span>ĐÃ ĐẶT CỌC TRƯỚC:</span>
                                <span style="font-family: monospace; font-weight: 900;">- ${formatMoney(depositAmount)}</span>
                            </div>
                            ` : ''}

                            <!-- TỔNG CẦN THANH TOÁN (TIỀN MẶT / CK) -->
                            <div style="display: flex; justify-content: space-between; font-size: 14.5px; font-weight: 900; border-top: 2px solid #000; border-bottom: 2px solid #000; padding: 4px 0; margin-top: 3px;">
                                <span>${
                                    ticket.payment_status === 'paid'
                                        ? (cashPayable > 0 ? (walletDeduction > 0 ? 'ĐÃ THU TM/CK:' : 'ĐÃ THANH TOÁN:') : 'ĐÃ THANH TOÁN ĐỦ:')
                                        : (walletDeduction > 0 ? 'PHẢI THU (TIỀN MẶT / CK):' : (depositAmount > 0 ? 'CÒN LẠI KHI NHẬN BÉ:' : 'TỔNG TẠM TÍNH:'))
                                }</span>
                                <span style="font-family: monospace;">${formatMoney(cashPayable)}</span>
                            </div>

                            <div style="display: flex; justify-content: space-between; font-size: 11px; font-weight: 900; margin-top: 4px; line-height: 1.3;">
                                <span>Trạng thái thanh toán:</span>
                                <span style="text-align: right;">${
                                    ticket.payment_status === 'paid'
                                        ? (walletDeduction > 0 
                                            ? (totalProducts > 0 
                                                ? `ĐÃ TRỪ VÍ (${formatMoney(walletDeduction)}) + THU TM/CK (${formatMoney(cashPayable)})` 
                                                : `ĐÃ TRỪ VÍ SPA (${formatMoney(walletDeduction)})`)
                                            : 'ĐÃ THANH TOÁN TRƯỚC')
                                        : (depositAmount > 0 
                                            ? `ĐÃ CỌC (${formatMoney(depositAmount)}) - THU CÒN LẠI KHI NHẬN` 
                                            : 'THANH TOÁN KHI NHẬN BÉ')
                                }</span>
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
                        <!-- Dọn khoảng cách dòng cắt giấy máy in nhiệt (chống cắt phạm chữ) -->
                        <div style="height: 18mm; width: 100%;"></div>
                    </div>
                    <!-- PHIẾU THỨ 2: PHIẾU SỐ THỨ TỰ DÁN LÊN CHUỒNG (NGẮT TRANG ĐỂ MÁY IN K80 CẮT RỜI) -->
                    <div style="page-break-before: always !important; break-before: page !important;">
                        ${generateCageTagHtml(ticket, dateStr, weightDisplay)}
                    </div>
                `;
            }
        }

        function generateCageTagHtml(ticket, dateStrOverride = '', weightDisplayOverride = '') {
            if (!ticket) return '';
            const now = new Date();
            const dateStr = dateStrOverride || (now.toLocaleDateString('vi-VN') + ' ' + now.toLocaleTimeString('vi-VN', {hour: '2-digit', minute:'2-digit'}));
            const weightDisplay = weightDisplayOverride || (ticket.weight_at_service ? String(ticket.weight_at_service).replace('.', ',') + ' kg' : (ticket.pet_weight ? String(ticket.pet_weight).replace('.', ',') + ' kg' : '-'));
            return `
                <div class="thermal-k80-wrapper" style="width: 72mm; max-width: 72mm; margin: 0 auto; box-sizing: border-box; font-family: 'Segoe UI', Arial, sans-serif; font-size: 12px; line-height: 1.35; color: #000; padding: 2mm 1mm;">
                    <div style="text-align: center; border-bottom: 2px dashed #000; padding-bottom: 8px; margin-bottom: 8px;">
                        <div style="font-size: 13px; font-weight: 900; text-transform: uppercase; letter-spacing: 0.5px;">PHIẾU SỐ THỨ TỰ DÁN CHUỒNG</div>
                        <div style="display: inline-block; border: 3px solid #000; font-size: 44px; font-weight: 900; line-height: 1.05; padding: 6px 20px; border-radius: 8px; margin: 6px 0 4px 0;">
                            #${ticket.ticket_number || ticket.id}
                        </div>
                        <div style="font-size: 11px; font-family: monospace; font-weight: 800;">Mã: ${ticket.code || '-'} · ${dateStr}</div>
                    </div>

                    <div style="border: 2px solid #000; border-radius: 6px; padding: 6px 8px; margin-bottom: 6px;">
                        <div style="font-size: 16px; font-weight: 900; text-transform: uppercase;">🐕 BÉ: ${ticket.pet_name || 'Bé cưng'}</div>
                        <div style="font-size: 12px; margin-top: 2px;"><strong>Giống/Màu:</strong> ${ticket.pet_breed || ticket.pet_species || 'Chó cảnh'} | ${ticket.pet_color || '-'}</div>
                        <div style="font-size: 13px; margin-top: 2px;"><strong>Cân nặng:</strong> <span style="font-size: 15px; font-weight: 900;">${weightDisplay}</span></div>
                        <div style="font-size: 12px; margin-top: 3px; padding-top: 3px; border-top: 1px dashed #000;">
                            <strong>Khách:</strong> ${ticket.customer_name || 'Khách lẻ'} (${ticket.customer_phone || '-'})
                        </div>
                    </div>

                    <div style="border: 1.5px solid #000; border-radius: 6px; padding: 6px 8px; margin-bottom: 6px;">
                        <div style="font-size: 13px; font-weight: 900;">✂️ DỊCH VỤ: ${ticket.service_type || '-'}</div>
                        <div style="font-size: 12px; margin-top: 2px;"><strong>Cạo bàn:</strong> <span style="text-decoration: underline;">${ticket.shaving_feet || 'Không cạo bàn'}</span></div>
                        ${ticket.dye_package ? `<div style="font-size: 12px; margin-top: 2px;"><strong>Nhuộm:</strong> ${ticket.dye_package}</div>` : ''}
                        ${ticket.customer_request ? `<div style="font-size: 12px; margin-top: 2px;"><strong>Yêu cầu cắt:</strong> ${ticket.customer_request}</div>` : ''}
                        <div style="font-size: 12px; margin-top: 3px; padding-top: 3px; border-top: 1px dashed #000;">
                            <strong>🎒 PHỤ KIỆN GỬI KÈM:</strong> <span style="font-size: 13px; font-weight: 900; text-decoration: underline;">${ticket.accessories || 'Không có'}</span>
                        </div>
                        ${ticket.note ? `<div style="font-size: 12px; margin-top: 2px;"><strong>📝 Lưu ý:</strong> ${ticket.note}</div>` : ''}
                        <div style="font-size: 11px; margin-top: 3px;">
                            <strong>Giờ nhận:</strong> ${ticket.received_time || '-'} (${ticket.arrival_method || 'Tự đến'}) ${ticket.send_to_hotel ? '· 🏨 GỬI HOTEL' : ''}
                        </div>
                    </div>
                    <!-- Khoảng giấy trống dưới cùng để máy in nhiệt cắt rời hoàn toàn -->
                    <div style="height: 18mm; width: 100%;"></div>
                </div>
            `;
        }
        window.generateCageTagHtml = generateCageTagHtml;

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

            const printTitles = {
                invoice: 'In Hóa Đơn Thanh Toán Spa (Tách Dịch Vụ, Cọc, Tip)',
                intake: 'In Phiếu Tiếp Nhận Spa',
                tip_slip: 'In Phiếu Tip Cho Thợ',
                deposit_slip: 'In Biên Nhận Đặt Cọc'
            };

            let isBoldSpa = true;
            try {
                const boldCfg = window.printBoldConfigs || (window.companySettings && window.companySettings.print_bold_configs ? (typeof window.companySettings.print_bold_configs === 'string' ? JSON.parse(window.companySettings.print_bold_configs) : window.companySettings.print_bold_configs) : null);
                if (boldCfg) {
                    const cfgKey = (type === 'intake') ? 'spa_intake' : 'spa_invoice';
                    if (boldCfg[cfgKey] !== undefined) {
                        isBoldSpa = !!boldCfg[cfgKey];
                    }
                } else {
                    const settings = window.companySettings || window.posSettings || {};
                    const parsed = settings.print_blocks_config ? JSON.parse(settings.print_blocks_config) : null;
                    const presetKey = (type === 'intake') ? 'spa_intake_k80' : 'spa_invoice_k80';
                    if (parsed && parsed.presets && parsed.presets[presetKey]) {
                        isBoldSpa = !!parsed.presets[presetKey].is_bold_all;
                    }
                }
            } catch(e) {}

            const boldStyles = isBoldSpa ? `
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
                    <title>${printTitles[type] || 'In Phiếu Dịch Vụ'}</title>
                    <style>
                        @page { size: auto; margin: 0mm; }
                        ${boldStyles}
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
        window.printPetServiceTicketDirectly = printPetServiceTicketDirectly;
        window.openServiceProgressModal = openServiceProgressModal;

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
                    <!-- Dọn khoảng cách dòng cắt giấy máy in nhiệt (chống cắt phạm chữ) -->
                    <div style="height: 18mm; width: 100%;"></div>
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
                const cageTagsHtml = (type === 'intake') ? fullTickets.map(t => `
                    <div class="thermal-ticket-page" style="page-break-before: always; break-before: page; width: 72mm; max-width: 72mm; margin: 0 auto; color: #000; padding: 4px 0;">
                        ${generateCageTagHtml(t)}
                    </div>
                `).join('') : '';
                pagesHtml = `
                    <div class="thermal-ticket-page" style="width: 72mm; max-width: 72mm; margin: 0 auto; color: #000; padding: 4px 0;">
                        ${ticketInner}
                    </div>
                    ${cageTagsHtml}
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

            let isBoldSpa = true;
            try {
                const boldCfg = window.printBoldConfigs || (window.companySettings && window.companySettings.print_bold_configs ? (typeof window.companySettings.print_bold_configs === 'string' ? JSON.parse(window.companySettings.print_bold_configs) : window.companySettings.print_bold_configs) : null);
                if (boldCfg) {
                    const cfgKey = (type === 'intake') ? 'spa_intake' : 'spa_invoice';
                    if (boldCfg[cfgKey] !== undefined) {
                        isBoldSpa = !!boldCfg[cfgKey];
                    }
                } else {
                    const settings = window.companySettings || window.posSettings || {};
                    const parsed = settings.print_blocks_config ? JSON.parse(settings.print_blocks_config) : null;
                    const presetKey = (type === 'intake') ? 'spa_intake_k80' : 'spa_invoice_k80';
                    if (parsed && parsed.presets && parsed.presets[presetKey]) {
                        isBoldSpa = !!parsed.presets[presetKey].is_bold_all;
                    }
                }
            } catch(e) {}

            const boldStyles = isBoldSpa ? `
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
                    <title>In Hàng Loạt Phiếu Spa (${fullTickets.length} Bé)</title>
                    <style>
                        @page { size: auto; margin: 0mm; }
                        ${boldStyles}
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
        window.setPetServiceDateFilter = setPetServiceDateFilter;
        window.filterPetServicesByKpi = filterPetServicesByKpi;

        // ---------------------------------------------------------
        // DROPLIST POPUP CHO 3 CỘT (DỊCH VỤ, YÊU CẦU & LƯU Ý, THỢ)
        // ---------------------------------------------------------
        function escapeSpaHtml(str) {
            if (!str) return '';
            return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
        }

        async function openSpaCellDroplist(event, ticketId, fieldType) {
            if (event) event.stopPropagation();
            const ticket = (allPetServiceTickets || []).find(t => t.id === Number(ticketId));
            if (!ticket) return;

            // Nạp danh sách thợ nếu chưa có
            if (!allSpaStaffList || allSpaStaffList.length === 0) {
                try {
                    const r = await fetch('/api/pet-services/staff');
                    if (r.ok) allSpaStaffList = await r.json();
                } catch(e) {}
            }
            // Nạp bảng giá nếu chưa có
            if (!allPetPricingData || allPetPricingData.length === 0) {
                try {
                    const r = await fetch('/api/pet-services/pricing');
                    if (r.ok) allPetPricingData = await r.json();
                } catch(e) {}
            }

            const modal = document.getElementById('modal-spa-cell-quick-edit');
            const titleEl = document.getElementById('quick-edit-title');
            const subtitleEl = document.getElementById('quick-edit-subtitle');
            const iconEl = document.getElementById('quick-edit-icon');
            const contentEl = document.getElementById('quick-edit-content');
            const ticketIdInput = document.getElementById('quick-edit-ticket-id');
            const fieldTypeInput = document.getElementById('quick-edit-field-type');

            if (!modal || !contentEl) return;

            ticketIdInput.value = ticket.id;
            fieldTypeInput.value = fieldType;

            const petTitle = `${ticket.pet_name || 'Bé cưng'} (#${ticket.ticket_number || ticket.id})`;

            if (fieldType === 'service') {
                if (iconEl) iconEl.textContent = '🏷️';
                if (titleEl) titleEl.textContent = `Gói Dịch Vụ: ${petTitle}`;
                if (subtitleEl) subtitleEl.textContent = 'Chọn nhanh gói dịch vụ spa chính và gói nhuộm';

                // Gom nhóm các dịch vụ chính theo category từ allPetPricingData (loại trừ nhuộm & phụ thu/trị liệu)
                const catMap = {};
                (allPetPricingData || []).forEach(item => {
                    const cat = item.category || 'Dịch Vụ Khác';
                    const cLow = cat.toLowerCase();
                    if (cLow.includes('nhuộm') || cLow.includes('phụ thu') || cLow.includes('trị liệu')) return;
                    if (!catMap[cat]) catMap[cat] = new Set();
                    if (item.service_name) catMap[cat].add(item.service_name.trim());
                });

                let optionsHtml = '';
                if (Object.keys(catMap).length === 0 && ticket.service_type) {
                    optionsHtml = `<option value="${escapeSpaHtml(ticket.service_type)}" selected>${escapeSpaHtml(ticket.service_type)}</option>`;
                } else {
                    for (const cat in catMap) {
                        optionsHtml += `<optgroup label="📂 ${escapeSpaHtml(cat)}">`;
                        Array.from(catMap[cat]).forEach(sName => {
                            const sel = (ticket.service_type === sName) ? 'selected' : '';
                            optionsHtml += `<option value="${escapeSpaHtml(sName)}" ${sel}>${escapeSpaHtml(sName)}</option>`;
                        });
                        optionsHtml += `</optgroup>`;
                    }
                }

                // Gói nhuộm lông
                const dyeOptions = [
                    'Không nhuộm',
                    'Nhuộm 1 Màu (Tai + Đuôi)',
                    'Nhuộm Nhiều Màu (Tai + Đuôi)',
                    'Nhuộm 4 Chân (1 Màu)',
                    'Nhuộm 4 Chân (Nhiều Màu)',
                    'Nhuộm Toàn Thân'
                ];
                let dyeHtml = dyeOptions.map(d => {
                    const val = d === 'Không nhuộm' ? '' : d;
                    const sel = (ticket.dye_package || '') === val ? 'selected' : '';
                    return `<option value="${escapeSpaHtml(val)}" ${sel}>${d}</option>`;
                }).join('');

                contentEl.innerHTML = `
                    <div>
                        <label class="block font-bold text-slate-700 mb-1">Gói Dịch Vụ Chính:</label>
                        <select id="quick-edit-val-service" onchange="onQuickEditServiceChange(${ticket.id})" class="w-full border p-2 rounded bg-white text-xs font-bold text-slate-800 focus:border-sky-600 outline-none">
                            ${optionsHtml}
                        </select>
                    </div>
                    <div>
                        <label class="block font-bold text-slate-700 mb-1">🎨 Gói Nhuộm Lông (nếu có):</label>
                        <select id="quick-edit-val-dye" class="w-full border p-2 rounded bg-white text-xs text-sky-700 font-semibold focus:border-sky-600 outline-none">
                            ${dyeHtml}
                        </select>
                    </div>

                    <!-- Khối xác nhận lý do đổi dịch vụ (chỉ hiện khi khác gói ban đầu) -->
                    <div id="quick-edit-service-change-box" class="hidden p-3 rounded-xl bg-amber-50 border border-amber-300 space-y-2 text-xs">
                        <div class="flex items-center gap-1.5 font-bold text-amber-900">
                            <span>⚠️</span> <span>XÁC NHẬN ĐIỀU CHỈNH GÓI DỊCH VỤ</span>
                        </div>
                        <div class="text-xs text-amber-800" id="quick-edit-service-change-diff">
                            <!-- Chênh lệch giá -->
                        </div>
                        <div>
                            <label class="block font-bold text-slate-700 mb-1">Lý do điều chỉnh (in lên bill & lưu đối soát):</label>
                            <input type="text" id="quick-edit-service-change-reason" class="w-full border border-amber-300 rounded p-1.5 bg-white text-xs font-medium text-slate-800" placeholder="VD: Lông rối bết nhiều, Khách đổi ý...">
                            <div class="flex flex-wrap gap-1 mt-1.5">
                                <span onclick="document.getElementById('quick-edit-service-change-reason').value='Lông rối bết nhiều không gỡ được'" class="cursor-pointer bg-white text-amber-800 px-1.5 py-0.5 rounded text-xs border border-amber-200 hover:bg-amber-100 font-medium">+ Lông rối bết</span>
                                <span onclick="document.getElementById('quick-edit-service-change-reason').value='Viêm da / Ve rận phát sinh'" class="cursor-pointer bg-white text-amber-800 px-1.5 py-0.5 rounded text-xs border border-amber-200 hover:bg-amber-100 font-medium">+ Viêm da/Ve rận</span>
                                <span onclick="document.getElementById('quick-edit-service-change-reason').value='Bé hung dữ / không hợp tác cắt'" class="cursor-pointer bg-white text-amber-800 px-1.5 py-0.5 rounded text-xs border border-amber-200 hover:bg-amber-100 font-medium">+ Bé khó làm</span>
                                <span onclick="document.getElementById('quick-edit-service-change-reason').value='Khách đổi ý theo hiện trạng bé'" class="cursor-pointer bg-white text-amber-800 px-1.5 py-0.5 rounded text-xs border border-amber-200 hover:bg-amber-100 font-medium">+ Khách đổi ý</span>
                            </div>
                        </div>
                    </div>
                `;
            } else if (fieldType === 'request') {
                if (iconEl) iconEl.textContent = '📝';
                if (titleEl) titleEl.textContent = `Lưu Ý & Yêu Cầu: ${petTitle}`;
                if (subtitleEl) subtitleEl.textContent = 'Cạo bàn, yêu cầu tạo kiểu, phụ kiện gửi lại và lưu ý thợ';

                const shavingOptions = ['Không cạo bàn', 'Cạo 4 bàn', 'Cạo bàn + cắt móng', 'Cạo đệm chân'];
                const shavingHtml = shavingOptions.map(opt => `
                    <option value="${opt}" ${ticket.shaving_feet === opt ? 'selected' : ''}>${opt}</option>
                `).join('');

                contentEl.innerHTML = `
                    <div>
                        <label class="block font-bold text-slate-700 mb-1">Cạo Bàn:</label>
                        <select id="quick-edit-val-shaving" class="w-full border p-1.5 rounded bg-white text-xs font-bold text-sky-800">
                            ${shavingHtml}
                        </select>
                    </div>
                    <div>
                        <label class="block font-bold text-slate-700 mb-1">✂️ Yêu Cầu Cắt Tỉa:</label>
                        <input type="text" id="quick-edit-val-req" class="w-full border p-1.5 rounded bg-white text-xs font-medium text-slate-800" value="${escapeSpaHtml(ticket.customer_request || '')}" placeholder="VD: Cắt tròn mặt teddy, bo chân bông...">
                        <div class="flex flex-wrap gap-1 mt-1.5">
                            <span onclick="setQuickInput('quick-edit-val-req', 'Mặt tròn teddy')" class="cursor-pointer bg-sky-50 text-sky-700 px-1.5 py-0.5 rounded text-xs border border-sky-200 hover:bg-sky-100">+ Mặt teddy</span>
                            <span onclick="setQuickInput('quick-edit-val-req', 'Cắt ngắn gọn mát mẻ')" class="cursor-pointer bg-sky-50 text-sky-700 px-1.5 py-0.5 rounded text-xs border border-sky-200 hover:bg-sky-100">+ Ngắn mát</span>
                            <span onclick="setQuickInput('quick-edit-val-req', 'Bo tròn chân bông')" class="cursor-pointer bg-sky-50 text-sky-700 px-1.5 py-0.5 rounded text-xs border border-sky-200 hover:bg-sky-100">+ Chân bông</span>
                            <span onclick="setQuickInput('quick-edit-val-req', 'Tỉa phom gọn gàng')" class="cursor-pointer bg-sky-50 text-sky-700 px-1.5 py-0.5 rounded text-xs border border-sky-200 hover:bg-sky-100">+ Tỉa gọn</span>
                        </div>
                    </div>
                    <div>
                        <label class="block font-bold text-slate-700 mb-1">🎒 Phụ Kiện Gửi Lại:</label>
                        <input type="text" id="quick-edit-val-acc" class="w-full border p-1.5 rounded bg-white text-xs font-medium text-amber-800" value="${escapeSpaHtml(ticket.accessories || '')}" placeholder="VD: Dây dắt, chuồng xách tay...">
                        <div class="flex flex-wrap gap-1 mt-1.5">
                            <span onclick="appendQuickInput('quick-edit-val-acc', 'Dây dắt')" class="cursor-pointer bg-amber-50 text-amber-800 px-1.5 py-0.5 rounded text-xs border border-amber-200 hover:bg-amber-100">+ Dây dắt</span>
                            <span onclick="appendQuickInput('quick-edit-val-acc', 'Vòng cổ')" class="cursor-pointer bg-amber-50 text-amber-800 px-1.5 py-0.5 rounded text-xs border border-amber-200 hover:bg-amber-100">+ Vòng cổ</span>
                            <span onclick="appendQuickInput('quick-edit-val-acc', 'Chuồng xách tay')" class="cursor-pointer bg-amber-50 text-amber-800 px-1.5 py-0.5 rounded text-xs border border-amber-200 hover:bg-amber-100">+ Chuồng</span>
                            <span onclick="appendQuickInput('quick-edit-val-acc', 'Balo')" class="cursor-pointer bg-amber-50 text-amber-800 px-1.5 py-0.5 rounded text-xs border border-amber-200 hover:bg-amber-100">+ Balo</span>
                        </div>
                    </div>
                    <div>
                        <label class="block font-bold text-slate-700 mb-1">📝 Ghi Chú Thợ / Sức Khỏe:</label>
                        <input type="text" id="quick-edit-val-note" class="w-full border p-1.5 rounded bg-white text-xs text-slate-600" value="${escapeSpaHtml(ticket.note || '')}" placeholder="Lưu ý bé nhát, đau chân...">
                    </div>
                `;
            } else if (fieldType === 'staff') {
                const roleCfg = getTicketStaffRoleConfig(ticket);
                if (iconEl) iconEl.textContent = '👥';
                if (titleEl) titleEl.textContent = `Phân Công Thợ: ${petTitle}`;
                if (subtitleEl) subtitleEl.textContent = `Dịch vụ: ${ticket.service_type || 'Chưa chọn'}${ticket.dye_package ? ' • 🎨 ' + ticket.dye_package : ''}`;

                let staffOpts = '<option value="">-- Chưa chọn thợ --</option>';
                (allSpaStaffList || []).forEach(s => {
                    const label = (s.staff_code ? s.staff_code + ' - ' : '') + (s.name || '');
                    staffOpts += `<option value="${escapeSpaHtml(s.name)}">${escapeSpaHtml(label)}</option>`;
                });

                contentEl.innerHTML = `
                    ${roleCfg.needsCutter ? `
                    <div>
                        <label class="block font-bold text-slate-700 mb-1">✂️ Thợ Cắt Tỉa / Tạo Kiểu:</label>
                        <select id="quick-edit-val-cutter" class="w-full border p-2 rounded bg-white text-xs font-bold text-sky-700">
                            ${staffOpts}
                        </select>
                    </div>` : ''}
                    <div>
                        <label class="block font-bold text-slate-700 mb-1">🛁 Thợ Tắm / Sấy / Vệ Sinh:</label>
                        <select id="quick-edit-val-worker1" class="w-full border p-2 rounded bg-white text-xs font-bold text-sky-700">
                            ${staffOpts}
                        </select>
                    </div>
                    ${roleCfg.needsDyer ? `
                    <div>
                        <label class="block font-bold text-amber-800 mb-1">🎨 Thợ Nhuộm Lông:</label>
                        <select id="quick-edit-val-dyer" class="w-full border border-amber-300 p-2 rounded bg-amber-50/40 text-xs font-bold text-amber-900">
                            ${staffOpts}
                        </select>
                    </div>` : ''}
                    <div>
                        <label class="block font-bold text-slate-700 mb-1">📥 Thợ Tiếp Nhận / Trả Bé:</label>
                        <select id="quick-edit-val-receiver" class="w-full border p-2 rounded bg-white text-xs font-bold text-sky-700">
                            ${staffOpts}
                        </select>
                    </div>
                `;

                // Set selected values
                const cutterEl = document.getElementById('quick-edit-val-cutter');
                const worker1El = document.getElementById('quick-edit-val-worker1');
                const dyerEl = document.getElementById('quick-edit-val-dyer');
                const receiverEl = document.getElementById('quick-edit-val-receiver');
                if (cutterEl) cutterEl.value = ticket.staff_cutter || '';
                if (worker1El) worker1El.value = ticket.staff_worker_1 || '';
                if (dyerEl) dyerEl.value = ticket.staff_dyer || '';
                if (receiverEl) receiverEl.value = ticket.staff_receiver || '';
            }

            modal.classList.remove('hidden');
        }

        function findServicePriceByWeight(serviceName, weight) {
            const w = parseFloat(weight) || 0;
            if (!Array.isArray(allPetPricingData) || !serviceName) return 0;
            const sClean = serviceName.trim().toLowerCase();
            const match = allPetPricingData.find(item => 
                item.service_name.trim().toLowerCase() === sClean &&
                (item.min_weight === 0 ? w >= item.min_weight : w > item.min_weight) &&
                w <= item.max_weight
            ) || allPetPricingData.find(item => 
                item.service_name.trim().toLowerCase() === sClean &&
                w >= item.min_weight && w <= item.max_weight
            );
            return match ? match.price : 0;
        }
        window.findServicePriceByWeight = findServicePriceByWeight;

        function onQuickEditServiceChange(ticketId) {
            const ticket = (allPetServiceTickets || []).find(t => t.id === Number(ticketId));
            if (!ticket) return;

            const newService = document.getElementById('quick-edit-val-service')?.value || '';
            const box = document.getElementById('quick-edit-service-change-box');
            const diffEl = document.getElementById('quick-edit-service-change-diff');
            if (!box || !diffEl) return;

            const origService = ticket.original_service_type || ticket.service_type || '';
            if (newService && newService !== origService) {
                const w = ticket.weight_at_service || 0;
                const oldPrice = ticket.original_price || findServicePriceByWeight(origService, w) || ticket.price || 0;
                const newPrice = findServicePriceByWeight(newService, w);
                const diff = newPrice - oldPrice;

                let diffText = `Gói gốc: <strong>${escapeSpaHtml(origService)}</strong> (${formatMoney(oldPrice)}) ➔ Gói mới: <strong>${escapeSpaHtml(newService)}</strong> (${formatMoney(newPrice)}).`;
                if (diff < 0) {
                    diffText += ` <span class="text-emerald-700 font-bold">Chênh lệch: Giảm ${formatMoney(Math.abs(diff))}</span>`;
                } else if (diff > 0) {
                    diffText += ` <span class="text-rose-700 font-bold">Chênh lệch: Tăng ${formatMoney(diff)}</span>`;
                } else {
                    diffText += ` <span class="text-slate-700 font-bold">Giá gói không đổi</span>`;
                }
                diffEl.innerHTML = diffText;
                box.classList.remove('hidden');
            } else {
                box.classList.add('hidden');
            }
        }
        window.onQuickEditServiceChange = onQuickEditServiceChange;

        async function saveSpaCellQuickEdit() {
            const ticketId = Number(document.getElementById('quick-edit-ticket-id')?.value);
            const fieldType = document.getElementById('quick-edit-field-type')?.value;
            const ticket = (allPetServiceTickets || []).find(t => t.id === ticketId);
            if (!ticket) return;

            const changes = { id: ticketId };
            const oldSnapshot = { ...ticket };

            if (fieldType === 'service') {
                const sVal = document.getElementById('quick-edit-val-service')?.value || '';
                const dVal = document.getElementById('quick-edit-val-dye')?.value || '';
                const changeReason = document.getElementById('quick-edit-service-change-reason')?.value?.trim() || '';

                const origService = ticket.original_service_type || ticket.service_type || '';
                const w = ticket.weight_at_service || 0;

                // Nếu đổi sang gói khác với gói gốc ban đầu
                if (sVal && sVal !== origService) {
                    if (!ticket.original_service_type) {
                        changes.original_service_type = ticket.service_type;
                        changes.original_price = ticket.original_price || findServicePriceByWeight(ticket.service_type, w) || ticket.price || 0;
                        ticket.original_service_type = ticket.service_type;
                        ticket.original_price = changes.original_price;
                    }
                    const reasonToSave = changeReason || 'Lông rối bết / Hiện trạng bé';
                    changes.service_change_reason = reasonToSave;
                    changes.service_changed_at = new Date().toLocaleString('vi-VN');
                    ticket.service_change_reason = reasonToSave;
                    ticket.service_changed_at = changes.service_changed_at;

                    // Tính lại giá mới cho ticket
                    const newBasePrice = findServicePriceByWeight(sVal, w);
                    if (newBasePrice > 0) {
                        const totalExtras = (ticket.teeth_cleaning || 0) + (ticket.art_cutting_fee || 0) + (ticket.surcharge || 0) + (ticket.shipping_fee || 0);
                        let dyePrice = 0;
                        if (dVal && Array.isArray(allPetPricingData)) {
                            const matchDye = allPetPricingData.find(item => item.service_name.trim().toLowerCase() === dVal.trim().toLowerCase());
                            if (matchDye) dyePrice = matchDye.price;
                        }
                        const recalculatedTotal = newBasePrice + totalExtras + dyePrice;
                        changes.price = recalculatedTotal;
                        ticket.price = recalculatedTotal;
                    }
                }

                changes.service_type = sVal;
                changes.dye_package = dVal;
                ticket.service_type = sVal;
                ticket.dye_package = dVal;
            } else if (fieldType === 'request') {
                const shVal = document.getElementById('quick-edit-val-shaving')?.value || '';
                const reqVal = document.getElementById('quick-edit-val-req')?.value || '';
                const accVal = document.getElementById('quick-edit-val-acc')?.value || '';
                const noteVal = document.getElementById('quick-edit-val-note')?.value || '';
                changes.shaving_feet = shVal;
                changes.customer_request = reqVal;
                changes.accessories = accVal;
                changes.note = noteVal;
                ticket.shaving_feet = shVal;
                ticket.customer_request = reqVal;
                ticket.accessories = accVal;
                ticket.note = noteVal;
            } else if (fieldType === 'staff') {
                const cutterEl = document.getElementById('quick-edit-val-cutter');
                const worker1El = document.getElementById('quick-edit-val-worker1');
                const dyerEl = document.getElementById('quick-edit-val-dyer');
                const receiverEl = document.getElementById('quick-edit-val-receiver');
                const cVal = cutterEl ? (cutterEl.value || '') : (ticket.staff_cutter || '');
                const wVal = worker1El ? (worker1El.value || '') : (ticket.staff_worker_1 || '');
                const dVal = dyerEl ? (dyerEl.value || '') : (ticket.staff_dyer || '');
                const rVal = receiverEl ? (receiverEl.value || '') : (ticket.staff_receiver || '');
                changes.staff_cutter = cVal;
                changes.staff_worker_1 = wVal;
                changes.staff_dyer = dVal;
                changes.staff_receiver = rVal;
                ticket.staff_cutter = cVal;
                ticket.staff_worker_1 = wVal;
                ticket.staff_dyer = dVal;
                ticket.staff_receiver = rVal;
            }

            // 1. Optimistic UI update: render ngay và đóng popup
            closeSpaCellQuickEditModal();
            renderActiveSpaView();

            // 2. Gọi backend bulk-update ngầm
            try {
                const res = await fetch('/api/pet-services/tickets/bulk-update', {
                    method: 'PUT',
                    headers: {'Content-Type': 'application/json'},
                    body: JSON.stringify({ tickets: [changes] })
                });
                if (!res.ok) throw new Error('Cập nhật thất bại');
            } catch(e) {
                console.error('saveSpaCellQuickEdit error:', e);
                Object.assign(ticket, oldSnapshot);
                renderActiveSpaView();
                alert('Lỗi khi lưu thay đổi lên máy chủ!');
            }
        }

        function closeSpaCellQuickEditModal() {
            const m = document.getElementById('modal-spa-cell-quick-edit');
            if (m) m.classList.add('hidden');
        }

        function setQuickInput(inputId, val) {
            const el = document.getElementById(inputId);
            if (el) el.value = val;
        }

        function appendQuickInput(inputId, val) {
            const el = document.getElementById(inputId);
            if (el) {
                const cur = el.value.trim();
                el.value = cur ? `${cur}, ${val}` : val;
            }
        }

        window.openSpaCellDroplist = openSpaCellDroplist;
        window.closeSpaCellQuickEditModal = closeSpaCellQuickEditModal;
        window.saveSpaCellQuickEdit = saveSpaCellQuickEdit;
        window.setQuickInput = setQuickInput;
        window.appendQuickInput = appendQuickInput;
        window.escapeSpaHtml = escapeSpaHtml;

        // ==========================================
        // THƯ VIỆN HÌNH MẪU CẮT LÔNG THÚ CƯNG
        // ==========================================
        let allGroomingGallery = [];

        async function loadGroomingGalleryList() {
            const grid = document.getElementById('grooming-gallery-grid');
            if (!grid) return;
            try {
                grid.innerHTML = '<div class="col-span-full py-12 text-center text-slate-400">Đang tải thư viện mẫu cắt...</div>';
                const res = await fetch('/api/pet-services/gallery');
                if (!res.ok) throw new Error('Không thể tải thư viện');
                allGroomingGallery = await res.json();
                renderGroomingGalleryGrid();
            } catch (e) {
                grid.innerHTML = `<div class="col-span-full py-8 text-center text-rose-500">Lỗi tải thư viện: ${e.message}</div>`;
            }
        }
        window.loadGroomingGalleryList = loadGroomingGalleryList;

        function renderGroomingGalleryGrid() {
            const grid = document.getElementById('grooming-gallery-grid');
            if (!grid) return;
            if (!allGroomingGallery || allGroomingGallery.length === 0) {
                grid.innerHTML = `
                    <div class="col-span-full py-12 text-center bg-white rounded-xl border border-dashed border-sky-300 p-6 space-y-2">
                        <span class="text-3xl">🐾</span>
                        <div class="font-bold text-slate-700 text-sm">Chưa có hình mẫu cắt tỉa nào</div>
                        <p class="text-xs text-slate-400">Bấm nút "➕ Thêm Mẫu Cắt Mới" ở góc trên để thêm các kiểu cắt đẹp cho shop</p>
                    </div>
                `;
                return;
            }

            grid.innerHTML = allGroomingGallery.map(item => `
                <div class="bg-white rounded-xl border border-slate-200 overflow-hidden shadow-xs hover:shadow-md transition flex flex-col group">
                    <div class="h-44 bg-slate-100 overflow-hidden relative">
                        ${item.image_data ? `
                            <img src="${item.image_data}" alt="${escapeSpaHtml(item.title)}" class="w-full h-full object-cover group-hover:scale-105 transition duration-300">
                        ` : `
                            <div class="w-full h-full flex items-center justify-center text-4xl text-slate-300">🐕</div>
                        `}
                        ${item.breed ? `
                            <span class="absolute top-2 left-2 bg-black/60 text-white text-xs font-bold px-2 py-0.5 rounded backdrop-blur-xs">
                                ${escapeSpaHtml(item.breed)}
                            </span>
                        ` : ''}
                    </div>
                    <div class="p-2.5 flex-1 flex flex-col justify-between space-y-1">
                        <div>
                            <div class="font-bold text-slate-900 text-xs truncate" title="${escapeSpaHtml(item.title)}">${escapeSpaHtml(item.title)}</div>
                            ${item.description ? `<p class="text-xs text-slate-500 line-clamp-2 mt-0.5 leading-snug">${escapeSpaHtml(item.description)}</p>` : ''}
                        </div>
                        <div class="pt-1.5 flex justify-between items-center border-t border-slate-100">
                            <button type="button" onclick="deleteGroomingStyle(${item.id})" class="text-rose-500 hover:text-rose-700 text-xs font-bold cursor-pointer" title="Xóa mẫu này">🗑️ Xóa</button>
                        </div>
                    </div>
                </div>
            `).join('');
        }
        window.renderGroomingGalleryGrid = renderGroomingGalleryGrid;

        function openAddGroomingModal() {
            document.getElementById('grooming-add-title').value = '';
            document.getElementById('grooming-add-breed').value = '';
            document.getElementById('grooming-add-desc').value = '';
            document.getElementById('grooming-add-file').value = '';
            document.getElementById('grooming-add-img-data').value = '';
            const previewWrap = document.getElementById('grooming-add-preview-wrap');
            if (previewWrap) previewWrap.classList.add('hidden');
            const modal = document.getElementById('modal-add-grooming-style');
            if (modal) modal.classList.remove('hidden');
        }
        window.openAddGroomingModal = openAddGroomingModal;

        function closeAddGroomingModal() {
            const modal = document.getElementById('modal-add-grooming-style');
            if (modal) modal.classList.add('hidden');
        }
        window.closeAddGroomingModal = closeAddGroomingModal;

        function previewGroomingUpload(input) {
            const file = input.files && input.files[0];
            if (!file) return;
            const reader = new FileReader();
            reader.onload = function(e) {
                const b64 = e.target.result;
                const img = document.getElementById('grooming-add-preview-img');
                const wrap = document.getElementById('grooming-add-preview-wrap');
                const hiddenInput = document.getElementById('grooming-add-img-data');
                if (img) img.src = b64;
                if (wrap) wrap.classList.remove('hidden');
                if (hiddenInput) hiddenInput.value = b64;
            };
            reader.readAsDataURL(file);
        }
        window.previewGroomingUpload = previewGroomingUpload;

        async function submitAddGroomingStyle() {
            const title = document.getElementById('grooming-add-title')?.value.trim();
            const breed = document.getElementById('grooming-add-breed')?.value.trim();
            const desc = document.getElementById('grooming-add-desc')?.value.trim();
            const imgData = document.getElementById('grooming-add-img-data')?.value.trim();

            if (!title) {
                alert('Vui lòng nhập tên kiểu cắt!');
                return;
            }

            try {
                const res = await fetch('/api/pet-services/gallery', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        title: title,
                        breed: breed,
                        description: desc,
                        image_data: imgData
                    })
                });
                if (!res.ok) {
                    const err = await res.json();
                    alert('Lỗi lưu mẫu cắt: ' + (err.detail || ''));
                    return;
                }
                closeAddGroomingModal();
                await loadGroomingGalleryList();
                if (typeof showToast === 'function') showToast('Đã thêm mẫu cắt mới vào thư viện!', 'success');
            } catch (e) {
                alert('Lỗi kết nối: ' + e.message);
            }
        }
        window.submitAddGroomingStyle = submitAddGroomingStyle;

        async function deleteGroomingStyle(id) {
            const ok = confirm('Bạn có chắc muốn xóa mẫu cắt này khỏi thư viện?');
            if (!ok) return;
            try {
                const res = await fetch(`/api/pet-services/gallery/${id}`, { method: 'DELETE' });
                if (res.ok) {
                    await loadGroomingGalleryList();
                    if (typeof showToast === 'function') showToast('Đã xóa mẫu cắt', 'success');
                }
            } catch (e) {
                alert('Lỗi: ' + e.message);
            }
        }
        window.deleteGroomingStyle = deleteGroomingStyle;

        async function openGroomingGalleryPicker() {
            const modal = document.getElementById('modal-grooming-gallery-picker');
            const grid = document.getElementById('grooming-picker-grid');
            if (!modal || !grid) return;

            modal.classList.remove('hidden');
            grid.innerHTML = '<div class="col-span-full py-8 text-center text-slate-400">Đang tải thư viện mẫu cắt...</div>';

            try {
                if (!allGroomingGallery || allGroomingGallery.length === 0) {
                    const res = await fetch('/api/pet-services/gallery');
                    allGroomingGallery = await res.json();
                }
                if (!allGroomingGallery || allGroomingGallery.length === 0) {
                    grid.innerHTML = `
                        <div class="col-span-full py-10 text-center text-slate-400">
                            <div>Chưa có mẫu cắt nào trong thư viện.</div>
                            <div class="text-xs text-sky-600 mt-2 cursor-pointer font-bold inline-block bg-sky-50 px-3 py-1 rounded-lg border border-sky-200" onclick="closeGroomingGalleryPicker(); switchPetSubTab('gallery'); openAddGroomingModal();">
                                ➕ Mở Thư Viện Thêm Mẫu Mới
                            </div>
                        </div>
                    `;
                    return;
                }

                grid.innerHTML = allGroomingGallery.map(item => `
                    <div class="bg-white rounded-xl border border-slate-200 overflow-hidden shadow-xs hover:border-sky-500 hover:shadow-md transition cursor-pointer flex flex-col group" onclick="selectGroomingStyleForIntake('${escapeSpaHtml(item.title)}')">
                        <div class="h-56 bg-slate-100 overflow-hidden relative">
                            ${item.image_data ? `
                                <img src="${item.image_data}" alt="${escapeSpaHtml(item.title)}" class="w-full h-full object-cover group-hover:scale-105 transition duration-200">
                            ` : `
                                <div class="w-full h-full flex items-center justify-center text-3xl text-slate-300">🐕</div>
                            `}
                            ${item.breed ? `<span class="absolute top-1.5 left-1.5 bg-black/60 text-white text-xs font-bold px-1.5 py-0.5 rounded">${escapeSpaHtml(item.breed)}</span>` : ''}
                        </div>
                        <div class="p-2 space-y-1">
                            <div class="font-bold text-slate-900 text-xs truncate">${escapeSpaHtml(item.title)}</div>
                            ${item.description ? `<p class="text-xs text-slate-500 line-clamp-1">${escapeSpaHtml(item.description)}</p>` : ''}
                            <button type="button" class="w-full mt-1 bg-sky-50 group-hover:bg-sky-600 group-hover:text-white text-sky-700 text-xs font-bold py-1 rounded transition">
                                👉 Chọn mẫu này
                            </button>
                        </div>
                    </div>
                `).join('');
            } catch (e) {
                grid.innerHTML = `<div class="col-span-full py-6 text-center text-rose-500">Lỗi: ${e.message}</div>`;
            }
        }
        window.openGroomingGalleryPicker = openGroomingGalleryPicker;

        function closeGroomingGalleryPicker() {
            const modal = document.getElementById('modal-grooming-gallery-picker');
            if (modal) modal.classList.add('hidden');
        }
        window.closeGroomingGalleryPicker = closeGroomingGalleryPicker;

        function selectGroomingStyleForIntake(title) {
            const reqInput = document.getElementById('svc-customer-request');
            if (reqInput) {
                const cur = reqInput.value.trim();
                reqInput.value = cur ? `${cur}, Mẫu: ${title}` : `Mẫu cắt: ${title}`;
            }
            closeGroomingGalleryPicker();
            if (typeof showToast === 'function') showToast(`Đã chọn mẫu cắt "${title}"`, 'success');
        }
        window.selectGroomingStyleForIntake = selectGroomingStyleForIntake;

        // =========================================================================
        // DANH MỤC THÚ CƯNG (MÀU LÔNG & GIỐNG LOÀI) - CONFIGURABLE PET CATALOG
        // =========================================================================
        window.petCatalogData = {
            colors: [],
            breeds: []
        };

        const DEFAULT_SPA_PET_COLORS = [
            "Trắng", "Đen", "Nâu", "Socola", "Kem", "Vàng", "Vàng mơ", "Xám",
            "Silver", "Phantom", "Bò sữa", "Bò nâu", "Bò xám", "Trắng - Xám",
            "Vàng - Đen", "Vàng - Xám", "Bicolor (Nhị thể)", "Tricolor (Tam thể)",
            "Tabbi (Mướp)", "Sọc dưa"
        ];

        const DEFAULT_SPA_PET_BREEDS = [
            "Poodle", "Phốc Sóc", "Corgi", "Samoyed", "Alaska", "Husky",
            "Golden", "Labrador", "Bichon", "Shiba", "Akita", "Bull Pháp",
            "Pug", "Bull Anh", "Lạp xưởng", "Bắc Kinh", "Chó Nhật", "Chó Cảnh Khác",
            "Mèo ALN", "Mèo ALD", "Mèo Cảnh Khác"
        ];

        async function loadAndSyncPetCatalog(forceRefresh = false) {
            try {
                if (!forceRefresh && window.petCatalogData && window.petCatalogData.colors && window.petCatalogData.colors.length > 0 && window.petCatalogData.breeds && window.petCatalogData.breeds.length > 0) {
                    syncPetCatalogToSelects();
                    return window.petCatalogData;
                }
                const res = await fetch('/api/settings/pet-catalog');
                if (res.ok) {
                    const data = await res.json();
                    window.petCatalogData = {
                        colors: (data.colors && Array.isArray(data.colors) && data.colors.length > 0) ? data.colors : [...DEFAULT_SPA_PET_COLORS],
                        breeds: (data.breeds && Array.isArray(data.breeds) && data.breeds.length > 0) ? data.breeds : [...DEFAULT_SPA_PET_BREEDS]
                    };
                } else {
                    window.petCatalogData = {
                        colors: [...DEFAULT_SPA_PET_COLORS],
                        breeds: [...DEFAULT_SPA_PET_BREEDS]
                    };
                }
            } catch (err) {
                console.warn("Lỗi tải danh mục pet catalog:", err);
                if (!window.petCatalogData || !window.petCatalogData.colors || window.petCatalogData.colors.length === 0) {
                    window.petCatalogData = {
                        colors: [...DEFAULT_SPA_PET_COLORS],
                        breeds: [...DEFAULT_SPA_PET_BREEDS]
                    };
                }
            }
            syncPetCatalogToSelects();
            return window.petCatalogData;
        }
        window.loadAndSyncPetCatalog = loadAndSyncPetCatalog;

        function syncPetCatalogToSelects() {
            if (!window.petCatalogData) return;
            const colors = window.petCatalogData.colors || [];
            const breeds = window.petCatalogData.breeds || [];

            // 1. Breed selects: #svc-pet-breed, #new-pet-breed
            ['svc-pet-breed', 'new-pet-breed'].forEach(selId => {
                const el = document.getElementById(selId);
                if (!el) return;
                const curVal = el.value;
                el.innerHTML = breeds.map(b => `<option value="${escapeSpaHtml(b)}">${escapeSpaHtml(b)}</option>`).join('');
                if (curVal && breeds.includes(curVal)) {
                    el.value = curVal;
                } else if (curVal) {
                    const opt = document.createElement('option');
                    opt.value = curVal;
                    opt.textContent = `🐾 ${curVal}`;
                    el.appendChild(opt);
                    el.value = curVal;
                }
            });

            // 2. Color selects: #svc-pet-color, #new-pet-color
            ['svc-pet-color', 'new-pet-color'].forEach(selId => {
                const el = document.getElementById(selId);
                if (!el) return;
                const curVal = el.value;
                el.innerHTML = colors.map(c => `<option value="${escapeSpaHtml(c)}">${escapeSpaHtml(c)}</option>`).join('');
                if (curVal && colors.includes(curVal)) {
                    el.value = curVal;
                } else if (curVal) {
                    const opt = document.createElement('option');
                    opt.value = curVal;
                    opt.textContent = curVal;
                    el.appendChild(opt);
                    el.value = curVal;
                }
            });
        }
        window.syncPetCatalogToSelects = syncPetCatalogToSelects;

        async function loadPetCatalogSettingsUI() {
            await loadAndSyncPetCatalog();
            renderPetCatalogSettings();
        }
        window.loadPetCatalogSettingsUI = loadPetCatalogSettingsUI;

        function renderPetCatalogSettings() {
            if (!window.petCatalogData) return;
            const colors = window.petCatalogData.colors || [];
            const breeds = window.petCatalogData.breeds || [];

            const colorCountEl = document.getElementById('pet-color-count');
            if (colorCountEl) colorCountEl.textContent = colors.length;
            const breedCountEl = document.getElementById('pet-breed-count');
            if (breedCountEl) breedCountEl.textContent = breeds.length;

            const colorsCont = document.getElementById('pet-colors-container');
            if (colorsCont) {
                if (colors.length === 0) {
                    colorsCont.innerHTML = `<span class="text-xs text-slate-400 ">Chưa có màu nào. Bấm 'Reset màu gốc' để khôi phục.</span>`;
                } else {
                    colorsCont.innerHTML = colors.map((c, idx) => `
                        <span class="inline-flex items-center gap-1.5 bg-white border border-slate-300 text-slate-800 text-xs font-semibold px-2.5 py-1 rounded-lg shadow-2xs hover:border-sky-400 transition group">
                            <span>${escapeSpaHtml(c)}</span>
                            <button type="button" onclick="removePetColorTag(${idx})" class="w-4 h-4 rounded-full bg-slate-100 hover:bg-rose-100 text-slate-400 hover:text-rose-600 flex items-center justify-center text-xs transition" title="Xóa màu này">✕</button>
                        </span>
                    `).join('');
                }
            }

            const breedsCont = document.getElementById('pet-breeds-container');
            if (breedsCont) {
                if (breeds.length === 0) {
                    breedsCont.innerHTML = `<span class="text-xs text-slate-400 ">Chưa có giống loài nào. Bấm 'Reset giống gốc' để khôi phục.</span>`;
                } else {
                    breedsCont.innerHTML = breeds.map((b, idx) => `
                        <span class="inline-flex items-center gap-1.5 bg-white border border-slate-300 text-slate-800 text-xs font-semibold px-2.5 py-1 rounded-lg shadow-2xs hover:border-sky-400 transition group">
                            <span>🐾 ${escapeSpaHtml(b)}</span>
                            <button type="button" onclick="removePetBreedTag(${idx})" class="w-4 h-4 rounded-full bg-slate-100 hover:bg-rose-100 text-slate-400 hover:text-rose-600 flex items-center justify-center text-xs transition" title="Xóa giống này">✕</button>
                        </span>
                    `).join('');
                }
            }
        }
        window.renderPetCatalogSettings = renderPetCatalogSettings;

        function addPetColorTag() {
            const input = document.getElementById('new-color-input');
            if (!input) return;
            const val = input.value.trim();
            if (!val) return;
            if (!window.petCatalogData.colors) window.petCatalogData.colors = [];
            if (window.petCatalogData.colors.some(c => c.toLowerCase() === val.toLowerCase())) {
                alert(`Màu "${val}" đã tồn tại trong danh mục!`);
                input.focus();
                return;
            }
            window.petCatalogData.colors.push(val);
            input.value = '';
            renderPetCatalogSettings();
            syncPetCatalogToSelects();
        }
        window.addPetColorTag = addPetColorTag;

        function removePetColorTag(idx) {
            if (!window.petCatalogData || !window.petCatalogData.colors) return;
            window.petCatalogData.colors.splice(idx, 1);
            renderPetCatalogSettings();
            syncPetCatalogToSelects();
        }
        window.removePetColorTag = removePetColorTag;

        function addPetBreedTag() {
            const input = document.getElementById('new-breed-input');
            if (!input) return;
            const val = input.value.trim();
            if (!val) return;
            if (!window.petCatalogData.breeds) window.petCatalogData.breeds = [];
            if (window.petCatalogData.breeds.some(b => b.toLowerCase() === val.toLowerCase())) {
                alert(`Giống "${val}" đã tồn tại trong danh mục!`);
                input.focus();
                return;
            }
            window.petCatalogData.breeds.push(val);
            input.value = '';
            renderPetCatalogSettings();
            syncPetCatalogToSelects();
        }
        window.addPetBreedTag = addPetBreedTag;

        function removePetBreedTag(idx) {
            if (!window.petCatalogData || !window.petCatalogData.breeds) return;
            window.petCatalogData.breeds.splice(idx, 1);
            renderPetCatalogSettings();
            syncPetCatalogToSelects();
        }
        window.removePetBreedTag = removePetBreedTag;

        function restoreColorDefaultsOnly() {
            if (!window.petCatalogData) window.petCatalogData = {};
            window.petCatalogData.colors = [...DEFAULT_SPA_PET_COLORS];
            renderPetCatalogSettings();
            syncPetCatalogToSelects();
            if (typeof showToast === 'function') showToast('Đã nạp lại màu mặc định', 'info');
        }
        window.restoreColorDefaultsOnly = restoreColorDefaultsOnly;

        function restoreBreedDefaultsOnly() {
            if (!window.petCatalogData) window.petCatalogData = {};
            window.petCatalogData.breeds = [...DEFAULT_SPA_PET_BREEDS];
            renderPetCatalogSettings();
            syncPetCatalogToSelects();
            if (typeof showToast === 'function') showToast('Đã nạp lại giống mặc định', 'info');
        }
        window.restoreBreedDefaultsOnly = restoreBreedDefaultsOnly;

        async function savePetCatalogSettingsUI() {
            if (!window.petCatalogData) return;
            try {
                const res = await fetch('/api/settings/pet-catalog', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        colors: window.petCatalogData.colors || [],
                        breeds: window.petCatalogData.breeds || []
                    })
                });
                if (!res.ok) {
                    const err = await res.json();
                    throw new Error(err.detail || 'Lỗi lưu danh mục');
                }
                if (typeof showToast === 'function') showToast('Đã lưu cấu hình danh mục thú cưng!', 'success');
                else alert('Đã lưu cấu hình danh mục thú cưng thành công!');
                await loadAndSyncPetCatalog(true);
            } catch (e) {
                alert('Lỗi: ' + e.message);
            }
        }
        window.savePetCatalogSettingsUI = savePetCatalogSettingsUI;

        async function restorePetCatalogDefaultsUI() {
            const confirmed = (typeof window.showConfirmModal === 'function')
                ? await window.showConfirmModal({
                    title: 'Khôi phục danh mục gốc?',
                    message: 'Bạn có chắc chắn muốn đưa danh mục Màu lông và Giống loài về danh sách mặc định ban đầu?',
                    type: 'warning',
                    confirmText: 'Khôi Phục Gốc'
                })
                : confirm('Khôi phục danh mục Màu lông và Giống loài về mặc định ban đầu?');

            if (!confirmed) return;

            try {
                const res = await fetch('/api/settings/pet-catalog/restore-defaults', { method: 'POST' });
                if (!res.ok) {
                    const err = await res.json();
                    throw new Error(err.detail || 'Lỗi khôi phục mặc định');
                }
                if (typeof showToast === 'function') showToast('Đã khôi phục danh mục mặc định!', 'success');
                else alert('Đã khôi phục danh mục mặc định!');
                await loadAndSyncPetCatalog(true);
                renderPetCatalogSettings();
            } catch (e) {
                alert('Lỗi: ' + e.message);
            }
        }
        window.restorePetCatalogDefaultsUI = restorePetCatalogDefaultsUI;
        window.openCreateServiceTicketModal = openCreateServiceTicketModal;


