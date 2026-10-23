/**
 * Module Quản Lý Phiếu Yêu Cầu Nhập Hàng (Purchase Requisition)
 * Dành cho nhân viên chi nhánh/cửa hàng/spa - Masking 100% giá vốn & NCC.
 */
(function() {
    let _maskedCatalog = [];
    let _selectedItems = []; // [{ product_id, name, code, unit, stock, source_group, quantity, note }]
    let _currentViewRequest = null;

    window.initPurchaseRequestsTab = async function() {
        await loadMaskedCatalog();
        await loadPurchaseRequestsList();
    };

    async function loadMaskedCatalog() {
        try {
            const res = await fetch('/api/purchase-requests/catalog-masked');
            if (res.ok) {
                _maskedCatalog = await res.json();
            }
        } catch (e) {
            console.error("Lỗi tải catalog masked:", e);
        }
    }

    window.onSearchMaskedProduct = function(query) {
        const dropdown = document.getElementById('pr-search-dropdown');
        if (!dropdown) return;

        const q = (query || '').trim().toLowerCase();
        if (!q) {
            dropdown.classList.add('hidden');
            dropdown.innerHTML = '';
            return;
        }

        const matches = _maskedCatalog.filter(p => 
            p.name.toLowerCase().includes(q) || 
            p.code.toLowerCase().includes(q) ||
            p.category.toLowerCase().includes(q)
        ).slice(0, 15);

        if (matches.length === 0) {
            dropdown.innerHTML = `<div class="p-3 text-center text-slate-400 text-xs">Không tìm thấy sản phẩm nào khớp</div>`;
            dropdown.classList.remove('hidden');
            return;
        }

        dropdown.innerHTML = matches.map(p => `
            <div onclick="selectMaskedProduct(${p.id})" class="p-2.5 hover:bg-amber-50 cursor-pointer border-b border-slate-100 flex items-center justify-between transition">
                <div>
                    <div class="font-bold text-xs text-slate-900">${p.name}</div>
                    <div class="text-[10px] text-slate-400 font-mono flex items-center gap-2 mt-0.5">
                        <span>${p.code}</span>
                        <span class="bg-slate-100 px-1 py-0.2 rounded text-slate-600">${p.unit}</span>
                        <span class="bg-amber-50 text-amber-700 px-1 py-0.2 rounded font-semibold">${p.source_group}</span>
                    </div>
                </div>
                <div class="text-right">
                    <div class="text-[10px] text-slate-400">Tồn kho</div>
                    <div class="text-xs font-mono font-bold ${p.stock <= 0 ? 'text-rose-600' : 'text-slate-700'}">${p.stock}</div>
                </div>
            </div>
        `).join('');
        dropdown.classList.remove('hidden');
    };

    window.selectMaskedProduct = function(productId) {
        const prod = _maskedCatalog.find(p => p.id === productId);
        if (!prod) return;

        const existing = _selectedItems.find(it => it.product_id === productId);
        if (existing) {
            existing.quantity += 1;
        } else {
            _selectedItems.push({
                product_id: prod.id,
                name: prod.name,
                code: prod.code,
                unit: prod.unit,
                stock: prod.stock,
                source_group: prod.source_group,
                quantity: 1,
                note: ''
            });
        }

        const searchInp = document.getElementById('pr-search-product');
        if (searchInp) searchInp.value = '';
        const dropdown = document.getElementById('pr-search-dropdown');
        if (dropdown) dropdown.classList.add('hidden');

        renderSelectedItems();
    };

    function renderSelectedItems() {
        const tbody = document.getElementById('pr-selected-tbody');
        if (!tbody) return;

        if (_selectedItems.length === 0) {
            tbody.innerHTML = `<tr><td colspan="4" class="p-4 text-center text-slate-400">Chưa chọn mặt hàng nào. Vui lòng tìm kiếm ở ô trên.</td></tr>`;
            return;
        }

        tbody.innerHTML = _selectedItems.map((it, idx) => `
            <tr class="hover:bg-slate-50">
                <td class="p-2">
                    <div class="font-bold text-slate-900">${it.name}</div>
                    <div class="text-[10px] text-slate-400 font-mono">${it.code} &bull; ${it.unit} &bull; <span class="text-amber-700 font-semibold">${it.source_group}</span></div>
                </td>
                <td class="p-2 text-right font-mono font-bold ${it.stock <= 0 ? 'text-rose-600' : 'text-slate-600'}">${it.stock}</td>
                <td class="p-2 text-center">
                    <input type="number" min="0.1" step="any" value="${it.quantity}" onchange="updateRequisitionQty(${idx}, this.value)" class="w-16 border border-slate-300 rounded p-1 text-center font-bold text-xs text-slate-800">
                </td>
                <td class="p-2 text-center">
                    <button type="button" onclick="removeRequisitionItem(${idx})" class="text-rose-500 hover:text-rose-700 font-bold text-sm leading-none p-1" title="Xóa món">&times;</button>
                </td>
            </tr>
        `).join('');
    }

    window.updateRequisitionQty = function(index, val) {
        const num = parseFloat(val);
        if (num > 0 && _selectedItems[index]) {
            _selectedItems[index].quantity = num;
        }
    };

    window.removeRequisitionItem = function(index) {
        _selectedItems.splice(index, 1);
        renderSelectedItems();
    };

    window.submitNewPurchaseRequest = async function() {
        if (_selectedItems.length === 0) {
            alert("⚠️ Vui lòng chọn ít nhất 1 mặt hàng để gửi yêu cầu!");
            return;
        }

        const dept = document.getElementById('pr-department')?.value || 'store';
        const priority = document.getElementById('pr-priority')?.value || 'normal';
        const note = document.getElementById('pr-note')?.value || '';

        const payload = {
            department: dept,
            priority: priority,
            note: note,
            items: _selectedItems.map(it => ({
                product_id: it.product_id,
                quantity: it.quantity,
                note: it.note || ''
            }))
        };

        try {
            const res = await fetch('/api/purchase-requests', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });

            if (!res.ok) {
                const err = await res.json();
                throw new Error(err.detail || 'Lỗi gửi phiếu yêu cầu');
            }

            const data = await res.json();
            alert(`🎉 ${data.message}\nPhiếu yêu cầu đã được gửi đến Thủ Kho.`);

            _selectedItems = [];
            renderSelectedItems();
            if (document.getElementById('pr-note')) document.getElementById('pr-note').value = '';

            await loadPurchaseRequestsList();
        } catch (e) {
            alert("❌ " + e.message);
        }
    };

    window.loadPurchaseRequestsList = async function() {
        const tbody = document.getElementById('pr-history-tbody');
        if (!tbody) return;

        const filterStatus = document.getElementById('pr-filter-status')?.value || '';
        let url = '/api/purchase-requests';
        if (filterStatus) url += `?status=${filterStatus}`;

        try {
            const res = await fetch(url);
            if (!res.ok) throw new Error("Không thể tải danh sách phiếu");
            const list = await res.json();

            if (!list || list.length === 0) {
                tbody.innerHTML = `<tr><td colspan="5" class="p-6 text-center text-slate-400">Chưa có phiếu yêu cầu nào.</td></tr>`;
                return;
            }

            tbody.innerHTML = list.map(req => {
                const isConverted = req.status === 'converted';
                const statusBadge = isConverted 
                    ? `<span class="bg-emerald-50 text-emerald-700 border border-emerald-200 px-2 py-0.5 rounded-full text-[10px] font-bold">✅ Đã lên PO: ${req.converted_purchase_code || ''}</span>`
                    : `<span class="bg-amber-50 text-amber-700 border border-amber-200 px-2 py-0.5 rounded-full text-[10px] font-bold">⏳ Chờ duyệt</span>`;

                const priorityTag = req.priority === 'urgent'
                    ? `<span class="bg-rose-50 text-rose-600 border border-rose-200 px-1.5 py-0.2 rounded text-[10px] font-bold">🔴 Cần gấp</span>`
                    : `<span class="text-slate-400 text-[10px]">Bình thường</span>`;

                const deptTag = req.department === 'spa' ? '💆 Khu Spa' : '🏪 Quầy Bán Lẻ';

                return `
                    <tr class="hover:bg-slate-50 transition">
                        <td class="p-2.5">
                            <div class="font-bold text-slate-900 font-mono">${req.code}</div>
                            <div class="text-[10px] text-slate-400">${req.created_at ? req.created_at.substring(0, 16) : ''}</div>
                        </td>
                        <td class="p-2.5">
                            <div class="font-bold text-slate-800">${req.created_by || 'Nhân viên'}</div>
                            <div class="text-[10px] text-slate-500">${deptTag} &bull; ${priorityTag}</div>
                        </td>
                        <td class="p-2.5 text-center font-mono">
                            <span class="font-bold text-slate-800">${req.item_count} món</span>
                            <div class="text-[10px] text-slate-400">Tổng SL: ${req.total_qty}</div>
                        </td>
                        <td class="p-2.5 text-center">${statusBadge}</td>
                        <td class="p-2.5 text-center">
                            <div class="flex items-center justify-center gap-1.5">
                                <button type="button" onclick="viewPurchaseRequestDetail(${req.id})" class="px-2 py-1 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded text-xs font-bold transition">
                                    👁️ Chi tiết
                                </button>
                                ${!isConverted ? `
                                    <button type="button" onclick="quickConvertRequestToPO(${req.id}, '${req.code}')" class="px-2 py-1 bg-emerald-600 hover:bg-emerald-700 text-white rounded text-xs font-bold transition flex items-center gap-1" title="Dành cho Thủ kho chuyển thành PO thật">
                                        <span>⚡</span> Lên PO
                                    </button>
                                ` : ''}
                            </div>
                        </td>
                    </tr>
                `;
            }).join('');
        } catch (e) {
            tbody.innerHTML = `<tr><td colspan="5" class="p-4 text-center text-rose-500">Lỗi: ${e.message}</td></tr>`;
        }
    };

    window.viewPurchaseRequestDetail = async function(requestId) {
        try {
            const res = await fetch('/api/purchase-requests');
            if (!res.ok) return;
            const list = await res.json();
            const req = list.find(r => r.id === requestId);
            if (!req) return;

            // Fetch items
            const itemsRes = await fetch(`/api/purchase-requests/${requestId}/items`).catch(() => null);
            let items = [];
            if (itemsRes && itemsRes.ok) {
                items = await itemsRes.json();
            }

            let itemsTableHtml = '';
            if (items && items.length > 0) {
                itemsTableHtml = `
                    <div class="border border-slate-200 rounded-lg overflow-hidden max-h-48 overflow-y-auto mt-2">
                        <table class="w-full text-left text-xs">
                            <thead class="bg-slate-50 border-b font-semibold text-[11px] text-slate-600">
                                <tr>
                                    <th class="p-2">Sản phẩm</th>
                                    <th class="p-2 text-center">ĐVT</th>
                                    <th class="p-2 text-right">SL Yêu Cầu</th>
                                </tr>
                            </thead>
                            <tbody class="divide-y divide-slate-100">
                                ${items.map(it => `
                                    <tr>
                                        <td class="p-2 font-bold text-slate-800">${it.product_name} <span class="text-slate-400 font-normal font-mono text-[10px]">(${it.product_code})</span></td>
                                        <td class="p-2 text-center text-slate-600">${it.unit}</td>
                                        <td class="p-2 text-right font-bold text-amber-700 font-mono">${it.quantity}</td>
                                    </tr>
                                `).join('')}
                            </tbody>
                        </table>
                    </div>
                `;
            }

            let itemsHtml = `
                <div class="p-4 space-y-3 text-xs">
                    <div class="grid grid-cols-2 gap-2 bg-slate-50 p-2.5 rounded-lg border border-slate-200">
                        <div><b>Mã phiếu:</b> <span class="font-mono text-amber-700">${req.code}</span></div>
                        <div><b>Trạng thái:</b> ${req.status === 'converted' ? '✅ Đã lên đơn PO: ' + req.converted_purchase_code : '⏳ Chờ duyệt'}</div>
                        <div><b>Người gửi:</b> ${req.created_by} (${req.department === 'spa' ? 'Spa' : 'Cửa hàng'})</div>
                        <div><b>Ưu tiên:</b> ${req.priority === 'urgent' ? '🔴 Cần gấp' : 'Bình thường'}</div>
                        <div class="col-span-2"><b>Ghi chú:</b> ${req.note || 'Không có'}</div>
                    </div>
                    <div class="font-bold text-slate-800">Danh Sách Mặt Hàng: ${req.item_count} món (Tổng SL: ${req.total_qty})</div>
                    ${itemsTableHtml}
                </div>
            `;

            let modal = document.getElementById('modal-purchase-request-view');
            if (!modal) {
                modal = document.createElement('div');
                modal.id = 'modal-purchase-request-view';
                modal.className = 'fixed inset-0 bg-black/60 z-[90] flex items-center justify-center p-4 backdrop-blur-xs';
                document.body.appendChild(modal);
            }

            modal.innerHTML = `
                <div class="bg-white rounded-xl shadow-2xl w-full max-w-lg overflow-hidden border border-slate-200">
                    <div class="px-4 py-3 bg-slate-900 text-white flex justify-between items-center">
                        <div class="font-bold text-sm">Chi Tiết Phiếu Yêu Cầu ${req.code}</div>
                        <button type="button" onclick="document.getElementById('modal-purchase-request-view').remove()" class="text-slate-400 hover:text-white font-bold text-lg">&times;</button>
                    </div>
                    ${itemsHtml}
                    <div class="p-3 border-t bg-slate-50 flex justify-end gap-2">
                        <button type="button" onclick="document.getElementById('modal-purchase-request-view').remove()" class="px-3 py-1.5 border rounded-lg text-slate-600 hover:bg-slate-100 font-bold text-xs">Đóng</button>
                        ${req.status !== 'converted' ? `
                            <button type="button" onclick="document.getElementById('modal-purchase-request-view').remove(); quickConvertRequestToPO(${req.id}, '${req.code}')" class="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg font-bold text-xs flex items-center gap-1">
                                <span>⚡</span> Duyệt & Lên PO Thật
                            </button>
                        ` : ''}
                    </div>
                </div>
            `;
        } catch (e) {
            alert("Lỗi xem chi tiết: " + e.message);
        }
    };

    window.quickConvertRequestToPO = async function(requestId, code) {
        let confirmed = false;
        if (typeof window.showConfirmModal === 'function') {
            confirmed = await window.showConfirmModal({
                title: "Duyệt Yêu Cầu & Lên PO",
                message: `Bạn có muốn chuyển phiếu yêu cầu <b>${code}</b> thành đơn nhập hàng PO thật dạng nháp?`,
                confirmText: "Lên PO Thật",
                cancelText: "Hủy bỏ",
                icon: "⚡"
            });
        } else {
            confirmed = confirm(`Bạn có muốn chuyển phiếu yêu cầu ${code} thành đơn nhập hàng PO thật dạng nháp?`);
        }

        if (!confirmed) return;

        try {
            const res = await fetch(`/api/purchase-requests/${requestId}/convert-to-po`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' }
            });

            if (!res.ok) {
                const err = await res.json();
                throw new Error(err.detail || 'Không thể chuyển đổi (yêu cầu quyền Thủ Kho / Quản lý nhập hàng)');
            }

            const data = await res.json();
            alert(`🎉 ${data.message}\nMã đơn PO: ${data.purchase_code}`);

            await loadPurchaseRequestsList();
            if (typeof switchTab === 'function') switchTab('purchases');
            if (typeof openEditPurchaseModal === 'function') {
                openEditPurchaseModal(data.purchase_code);
            }
        } catch (e) {
            alert("❌ " + e.message);
        }
    };
})();
