/**
 * Module Quản Lý Khoản Cần Chi & Hoàn Ứng Nhân Viên (Expense Requests)
 * Cho phép tạo yêu cầu chi hộ, dự chi, import/dán ảnh bill chuyển khoản qua AI và duyệt 1 chạm sang Sổ Quỹ
 */

(function() {
    let currentRequests = [];
    let currentRequestStats = null;
    let selectedImageBase64 = null;
    let currentApprovingId = null;

    // --- Chuyển đổi Sub-tab Sổ Quỹ ---
    window.switchCashbookSubTab = function(sub) {
        const btnActual = document.getElementById('btn-subtab-cashbook-actual');
        const btnRequests = document.getElementById('btn-subtab-cashbook-requests');
        const tabActual = document.getElementById('cashbook-subtab-actual');
        const tabRequests = document.getElementById('cashbook-subtab-requests');

        if (sub === 'requests') {
            if (tabActual) tabActual.classList.add('hidden');
            if (tabRequests) tabRequests.classList.remove('hidden');

            if (btnActual) {
                btnActual.className = "px-4 py-2 text-xs font-semibold text-slate-500 hover:text-slate-800 border-b-2 border-transparent transition flex items-center gap-1.5 cursor-pointer";
            }
            if (btnRequests) {
                btnRequests.className = "px-4 py-2 text-xs font-bold text-indigo-700 border-b-2 border-indigo-600 bg-indigo-50/50 rounded-t-lg transition flex items-center gap-1.5 cursor-pointer";
            }
            loadExpenseRequests();
        } else {
            if (tabRequests) tabRequests.classList.add('hidden');
            if (tabActual) tabActual.classList.remove('hidden');

            if (btnRequests) {
                btnRequests.className = "px-4 py-2 text-xs font-semibold text-slate-500 hover:text-slate-800 border-b-2 border-transparent transition flex items-center gap-1.5 cursor-pointer";
            }
            if (btnActual) {
                btnActual.className = "px-4 py-2 text-xs font-bold text-emerald-700 border-b-2 border-emerald-600 bg-emerald-50/50 rounded-t-lg transition flex items-center gap-1.5 cursor-pointer";
            }
        }
    };

    // --- Tải danh sách & Thống kê ---
    window.loadExpenseRequests = async function() {
        const statusFilter = document.getElementById('filter-exp-status')?.value || '';
        const typeFilter = document.getElementById('filter-exp-type')?.value || '';
        const searchInput = document.getElementById('filter-exp-search')?.value || '';

        const params = new URLSearchParams();
        if (statusFilter) params.append('status', statusFilter);
        if (typeFilter) params.append('type', typeFilter);
        if (searchInput.trim()) params.append('q', searchInput.trim());

        const tbody = document.getElementById('table-expense-requests');
        if (tbody) {
            tbody.innerHTML = `<tr><td colspan="9" class="p-6 text-center text-xs text-slate-400">Đang tải danh sách yêu cầu chi...</td></tr>`;
        }

        try {
            const res = await fetch(`/api/expense-requests?${params.toString()}`);
            if (!res.ok) throw new Error("Không thể tải danh sách yêu cầu");
            const data = await res.json();
            currentRequests = data.items || [];
            currentRequestStats = data.stats || {};

            renderExpenseStats(currentRequestStats);
            renderExpenseRequestsTable(currentRequests);
        } catch (err) {
            console.error(err);
            if (tbody) {
                tbody.innerHTML = `<tr><td colspan="9" class="p-6 text-center text-xs text-rose-500 font-medium">Lỗi: ${err.message}</td></tr>`;
            }
        }
    };

    function formatVND(amount) {
        return new Intl.NumberFormat('vi-VN').format(Math.round(amount || 0)) + ' đ';
    }

    function renderExpenseStats(stats) {
        const badgeCount = document.getElementById('badge-expense-requests-count');
        if (badgeCount) {
            const count = stats.pending_count || 0;
            if (count > 0) {
                badgeCount.innerText = count;
                badgeCount.classList.remove('hidden');
            } else {
                badgeCount.classList.add('hidden');
            }
        }

        const elReimb = document.getElementById('stat-exp-reimbursement-pending');
        if (elReimb) elReimb.innerText = formatVND(stats.total_reimbursement_pending || 0);

        const elPlan = document.getElementById('stat-exp-planned-pending');
        if (elPlan) elPlan.innerText = formatVND(stats.total_planned_pending || 0);

        const elDone = document.getElementById('stat-exp-completed-sum');
        if (elDone) elDone.innerText = formatVND(stats.total_completed || 0);
    }

    function renderExpenseRequestsTable(items) {
        const tbody = document.getElementById('table-expense-requests');
        if (!tbody) return;

        if (!items || items.length === 0) {
            tbody.innerHTML = `<tr><td colspan="9" class="p-8 text-center text-xs text-slate-400 italic">Chưa có yêu cầu chi nào phù hợp bộ lọc.</td></tr>`;
            return;
        }

        tbody.innerHTML = items.map(item => {
            const isReimb = item.type === 'reimbursement';
            const typeBadge = isReimb
                ? `<span class="px-2 py-0.5 rounded text-[10px] font-bold bg-purple-100 text-purple-700 border border-purple-200">NV Chi Hộ</span>`
                : `<span class="px-2 py-0.5 rounded text-[10px] font-bold bg-amber-100 text-amber-700 border border-amber-200">Dự Chi Quán</span>`;

            let statusBadge = '';
            if (item.status === 'pending') {
                statusBadge = `<span class="px-2 py-0.5 rounded-full text-[10px] font-bold bg-yellow-100 text-yellow-800 border border-yellow-200">⏳ Chờ duyệt</span>`;
            } else if (item.status === 'completed') {
                statusBadge = `<span class="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-700 border border-emerald-200">✓ Đã hoàn tiền</span>`;
            } else {
                statusBadge = `<span class="px-2 py-0.5 rounded-full text-[10px] font-bold bg-slate-100 text-slate-500 border border-slate-200">✕ Đã hủy</span>`;
            }

            // Thumbnail bill
            let imgHtml = `<span class="text-[11px] text-slate-300">-</span>`;
            if (item.bill_image) {
                imgHtml = `
                    <div class="relative group cursor-pointer inline-block" onclick="viewExpenseBillModal('${encodeURIComponent(item.bill_image)}')">
                        <img src="${item.bill_image}" alt="Bill" class="w-8 h-8 object-cover rounded border border-slate-200 shadow-2xs group-hover:scale-110 transition" />
                        <span class="absolute inset-0 bg-black/20 rounded opacity-0 group-hover:opacity-100 flex items-center justify-center text-white text-[9px] font-bold">🔍</span>
                    </div>
                `;
            }

            // Actions
            let actionsHtml = '';
            if (item.status === 'pending') {
                actionsHtml = `
                    <div class="flex items-center justify-end gap-1.5">
                        <button onclick="openApproveExpenseModal(${item.id}, '${item.code}', '${escapeHtml(item.employee_name)}', ${item.amount})" class="px-2.5 py-1 rounded bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-[11px] shadow-2xs transition flex items-center gap-1 cursor-pointer">
                            <span>✓</span> <span>Duyệt & Chi</span>
                        </button>
                        <button onclick="cancelExpenseRequest(${item.id}, '${item.code}')" class="px-2 py-1 rounded bg-slate-100 hover:bg-rose-50 hover:text-rose-600 text-slate-600 font-medium text-[11px] border border-slate-200 transition cursor-pointer" title="Hủy yêu cầu">
                            <span>✕</span>
                        </button>
                    </div>
                `;
            } else if (item.status === 'completed' && item.cashbook_code) {
                actionsHtml = `
                    <div class="text-right">
                        <span class="text-[11px] font-mono text-emerald-700 bg-emerald-50 px-1.5 py-0.5 rounded border border-emerald-200 font-semibold" title="Đã hạch toán sang Sổ Quỹ">
                            Phiếu: ${item.cashbook_code}
                        </span>
                    </div>
                `;
            } else {
                actionsHtml = `<div class="text-right text-[11px] text-slate-400 italic">Không có</div>`;
            }

            const bankInfo = item.bank_account_info ? `<div class="text-[10px] text-slate-400 truncate max-w-[140px]" title="${escapeHtml(item.bank_account_info)}">🏦 ${escapeHtml(item.bank_account_info)}</div>` : '';
            const dueDate = item.due_date ? `<div class="text-[10px] text-amber-600">Hạn: ${item.due_date}</div>` : '';

            return `
                <tr class="hover:bg-slate-50/80 border-b border-slate-100 transition text-xs">
                    <td class="p-2.5 font-mono font-bold text-slate-900">${item.code}</td>
                    <td class="p-2.5">${typeBadge}</td>
                    <td class="p-2.5 font-semibold text-slate-800">
                        ${escapeHtml(item.employee_name)}
                        ${bankInfo}
                    </td>
                    <td class="p-2.5 text-slate-600 font-medium">${escapeHtml(item.category)}</td>
                    <td class="p-2.5 font-bold text-rose-600 text-right">${formatVND(item.amount)}</td>
                    <td class="p-2.5 text-center">${imgHtml}</td>
                    <td class="p-2.5 text-slate-500 max-w-[180px] truncate" title="${escapeHtml(item.note || '')}">
                        ${escapeHtml(item.note || '-')}
                        ${dueDate}
                    </td>
                    <td class="p-2.5 text-center">${statusBadge}</td>
                    <td class="p-2.5 text-right">${actionsHtml}</td>
                </tr>
            `;
        }).join('');
    }

    function escapeHtml(str) {
        if (!str) return '';
        return String(str).replace(/[&<>"']/g, function(m) {
            return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' }[m];
        });
    }

    // --- Modal Xem Ảnh Bill ---
    window.viewExpenseBillModal = function(encodedImg) {
        const imgUrl = decodeURIComponent(encodedImg);
        const modal = document.getElementById('modal-view-expense-bill');
        const imgEl = document.getElementById('img-view-expense-bill');
        if (modal && imgEl) {
            imgEl.src = imgUrl;
            modal.classList.remove('hidden');
        }
    };

    window.closeExpenseBillModal = function() {
        const modal = document.getElementById('modal-view-expense-bill');
        if (modal) modal.classList.add('hidden');
    };

    // --- Modal Tạo Yêu Cầu Chi ---
    window.openCreateExpenseModal = function(defaultType = 'reimbursement') {
        selectedImageBase64 = null;
        const modal = document.getElementById('modal-create-expense-request');
        if (!modal) return;

        // Reset form
        const form = document.getElementById('form-create-expense-request');
        if (form) form.reset();

        const typeEl = document.getElementById('exp-form-type');
        if (typeEl) {
            typeEl.value = defaultType;
            toggleExpenseTypeFields(defaultType);
        }

        const previewContainer = document.getElementById('exp-form-img-preview-box');
        if (previewContainer) previewContainer.classList.add('hidden');

        modal.classList.remove('hidden');
    };

    window.closeCreateExpenseModal = function() {
        const modal = document.getElementById('modal-create-expense-request');
        if (modal) modal.classList.add('hidden');
    };

    window.toggleExpenseTypeFields = function(type) {
        const empLabel = document.getElementById('exp-form-emp-label');
        const bankBox = document.getElementById('exp-form-bank-box');
        const dueBox = document.getElementById('exp-form-due-box');

        if (type === 'reimbursement') {
            if (empLabel) empLabel.innerText = "Tên nhân viên chi hộ *";
            if (bankBox) bankBox.classList.remove('hidden');
            if (dueBox) dueBox.classList.add('hidden');
        } else {
            if (empLabel) empLabel.innerText = "Người / Bộ phận đề xuất *";
            if (bankBox) bankBox.classList.add('hidden');
            if (dueBox) dueBox.classList.remove('hidden');
        }
    };

    // --- Xử lý tải ảnh & Paste ảnh vào Form ---
    window.handleExpenseBillFileSelect = function(e) {
        const file = e.target.files && e.target.files[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = function(evt) {
            setExpenseBillImage(evt.target.result);
        };
        reader.readAsDataURL(file);
    };

    function setExpenseBillImage(base64Str) {
        selectedImageBase64 = base64Str;
        const previewBox = document.getElementById('exp-form-img-preview-box');
        const previewImg = document.getElementById('exp-form-img-preview');
        if (previewBox && previewImg) {
            previewImg.src = base64Str;
            previewBox.classList.remove('hidden');
        }
    }

    window.removeExpenseBillImage = function() {
        selectedImageBase64 = null;
        const fileInput = document.getElementById('exp-form-file-input');
        if (fileInput) fileInput.value = '';
        const previewBox = document.getElementById('exp-form-img-preview-box');
        if (previewBox) previewBox.classList.add('hidden');
    };

    // Lắng nghe Paste ảnh trong Modal tạo yêu cầu
    document.addEventListener('paste', function(e) {
        const modal = document.getElementById('modal-create-expense-request');
        if (!modal || modal.classList.contains('hidden')) return;

        const clipboardData = e.clipboardData || window.clipboardData;
        if (!clipboardData || !clipboardData.items) return;

        for (let i = 0; i < clipboardData.items.length; i++) {
            const item = clipboardData.items[i];
            if (item.type.indexOf('image') !== -1) {
                const blob = item.getAsFile();
                const reader = new FileReader();
                reader.onload = function(evt) {
                    setExpenseBillImage(evt.target.result);
                    if (window.showToast) window.showToast("Đã dán ảnh bill! Bấm 'Quét AI' để tự động điền", "info");
                };
                reader.readAsDataURL(blob);
                e.preventDefault();
                break;
            }
        }
    });

    // Quét AI từ ảnh bill
    window.scanExpenseBillWithAI = async function() {
        if (!selectedImageBase64) {
            if (window.showToast) window.showToast("Vui lòng tải hoặc dán ảnh bill trước khi quét AI", "warning");
            return;
        }

        const scanBtn = document.getElementById('btn-scan-exp-ai');
        const originalText = scanBtn ? scanBtn.innerHTML : '';
        if (scanBtn) {
            scanBtn.disabled = true;
            scanBtn.innerHTML = `<span>⏳</span> <span>Đang đọc bill...</span>`;
        }

        try {
            const res = await fetch('/api/ai/parse-cashflow', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    image_base64: selectedImageBase64,
                    mime_type: 'image/jpeg'
                })
            });

            const data = await res.json();
            if (!res.ok) throw new Error(data.detail || "Không thể phân tích ảnh");

            // Tự động gán vào form
            if (data.amount) {
                const amountInput = document.getElementById('exp-form-amount');
                if (amountInput) amountInput.value = data.amount;
            }
            if (data.category) {
                const catInput = document.getElementById('exp-form-category');
                if (catInput) catInput.value = data.category;
            }
            if (data.note || data.transaction_code) {
                const noteInput = document.getElementById('exp-form-note');
                const parts = [];
                if (data.note) parts.push(data.note);
                if (data.transaction_code) parts.push(`Mã GD: ${data.transaction_code}`);
                if (noteInput && parts.length > 0) noteInput.value = parts.join(' - ');
            }
            if (data.sender_or_receiver) {
                const empInput = document.getElementById('exp-form-emp');
                // Nếu chưa có tên nhân viên thì gợi ý
                if (empInput && !empInput.value.trim()) {
                    empInput.value = data.sender_or_receiver;
                }
            }

            if (window.showToast) window.showToast("AI đã trích xuất số tiền & nội dung từ ảnh bill thành công!", "success");
        } catch (err) {
            console.error(err);
            if (window.showToast) window.showToast("Lỗi quét AI: " + err.message, "error");
        } finally {
            if (scanBtn) {
                scanBtn.disabled = false;
                scanBtn.innerHTML = originalText;
            }
        }
    };

    // Submit tạo yêu cầu
    window.submitCreateExpenseRequest = async function(e) {
        if (e) e.preventDefault();

        const type = document.getElementById('exp-form-type')?.value || 'reimbursement';
        const emp = document.getElementById('exp-form-emp')?.value?.trim();
        const amount = parseFloat(document.getElementById('exp-form-amount')?.value || 0);
        const category = document.getElementById('exp-form-category')?.value?.trim() || 'Chi khác';
        const note = document.getElementById('exp-form-note')?.value?.trim() || '';
        const bankInfo = document.getElementById('exp-form-bank')?.value?.trim() || '';
        const dueDate = document.getElementById('exp-form-due')?.value || null;

        if (!emp) {
            if (window.showToast) window.showToast("Vui lòng nhập tên người đề xuất / nhân viên chi", "warning");
            return;
        }
        if (isNaN(amount) || amount <= 0) {
            if (window.showToast) window.showToast("Số tiền phải lớn hơn 0", "warning");
            return;
        }

        const payload = {
            type: type,
            employee_name: emp,
            amount: amount,
            category: category,
            note: note,
            bill_image: selectedImageBase64,
            bank_account_info: bankInfo,
            due_date: dueDate
        };

        try {
            const res = await fetch('/api/expense-requests', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.detail || "Không thể tạo yêu cầu");

            if (window.showToast) window.showToast(`Đã tạo yêu cầu ${data.code} thành công!`, "success");
            closeCreateExpenseModal();
            loadExpenseRequests();
        } catch (err) {
            if (window.showToast) window.showToast("Lỗi: " + err.message, "error");
        }
    };

    // --- Modal Duyệt Chi ---
    window.openApproveExpenseModal = async function(id, code, empName, amount) {
        currentApprovingId = id;
        const modal = document.getElementById('modal-approve-expense-request');
        if (!modal) return;

        document.getElementById('exp-appr-code').innerText = code;
        document.getElementById('exp-appr-emp').innerText = empName;
        document.getElementById('exp-appr-amount').innerText = formatVND(amount);

        const noteInput = document.getElementById('exp-appr-note');
        if (noteInput) noteInput.value = `Hoàn ứng chi hộ cho ${empName}`;

        // Tải danh sách tài khoản thanh toán
        const selectAcc = document.getElementById('exp-appr-account-select');
        if (selectAcc) {
            selectAcc.innerHTML = `<option value="">Đang tải tài khoản...</option>`;
            try {
                const res = await fetch('/api/payment-accounts');
                if (res.ok) {
                    const accounts = await res.json();
                    selectAcc.innerHTML = accounts.map(a => {
                        return `<option value="${a.id}" ${a.is_default ? 'selected' : ''}>${escapeHtml(a.name)} (${formatVND(a.current_balance || 0)})</option>`;
                    }).join('');
                }
            } catch (e) {
                console.error(e);
            }
        }

        modal.classList.remove('hidden');
    };

    window.closeApproveExpenseModal = function() {
        currentApprovingId = null;
        const modal = document.getElementById('modal-approve-expense-request');
        if (modal) modal.classList.add('hidden');
    };

    window.submitApproveExpenseRequest = async function() {
        if (!currentApprovingId) return;
        const accId = parseInt(document.getElementById('exp-appr-account-select')?.value || 0);
        const note = document.getElementById('exp-appr-note')?.value?.trim();

        if (!accId) {
            if (window.showToast) window.showToast("Vui lòng chọn tài khoản/quỹ xuất tiền", "warning");
            return;
        }

        try {
            const res = await fetch(`/api/expense-requests/${currentApprovingId}/approve`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    account_id: accId,
                    note: note
                })
            });

            const data = await res.json();
            if (!res.ok) throw new Error(data.detail || "Không thể duyệt yêu cầu chi");

            if (window.showToast) window.showToast(`Duyệt thành công! Đã tự động tạo phiếu chi ${data.cashbook_code} vào Sổ Quỹ.`, "success");
            closeApproveExpenseModal();
            loadExpenseRequests();

            // Làm mới Sổ Quỹ nếu hàm tồn tại
            if (typeof window.loadCashbook === 'function') {
                window.loadCashbook();
            }
        } catch (err) {
            if (window.showToast) window.showToast("Lỗi: " + err.message, "error");
        }
    };

    // --- Hủy yêu cầu ---
    window.cancelExpenseRequest = async function(id, code) {
        if (!confirm(`Bạn có chắc muốn hủy yêu cầu chi ${code}?`)) return;

        try {
            const res = await fetch(`/api/expense-requests/${id}/cancel`, {
                method: 'POST'
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.detail || "Không thể hủy yêu cầu");

            if (window.showToast) window.showToast(`Đã hủy yêu cầu ${code}`, "info");
            loadExpenseRequests();
        } catch (err) {
            if (window.showToast) window.showToast("Lỗi: " + err.message, "error");
        }
    };

    // Lắng nghe load ban đầu nếu đang ở tab Sổ Quỹ
    document.addEventListener('DOMContentLoaded', function() {
        // Có thể gọi tải trước số lượng badge
        fetch('/api/expense-requests')
            .then(res => res.json())
            .then(data => {
                if (data.stats) renderExpenseStats(data.stats);
            })
            .catch(() => {});
    });
})();
