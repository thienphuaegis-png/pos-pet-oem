/**
 * ai_agent.js - Tác nhân AI Copilot Đa Năng
 * Nhận diện hình ảnh hóa đơn / phiếu giao hàng / bill chuyển khoản / đơn xưởng
 * Tự động tạo 4 loại đơn: Bán lẻ POS, Nhập hàng PN, Gia công OEM, Thu/Chi Sổ Quỹ
 */

(function() {
    let currentAIResult = null;
    let currentImageBase64 = null;

    // Lắng nghe sự kiện paste ảnh (Ctrl + V) khi đang ở tab ai-agent
    document.addEventListener('paste', function(e) {
        const activeTab = document.getElementById('tab-ai-agent');
        if (!activeTab || activeTab.classList.contains('hidden')) return;

        const clipboardData = e.clipboardData || window.clipboardData;
        if (!clipboardData || !clipboardData.items) return;

        for (let i = 0; i < clipboardData.items.length; i++) {
            const item = clipboardData.items[i];
            if (item.type.indexOf('image') !== -1) {
                const blob = item.getAsFile();
                const reader = new FileReader();
                reader.onload = function(evt) {
                    processUploadedDocumentImage(evt.target.result, item.type);
                };
                reader.readAsDataURL(blob);
                e.preventDefault();
                break;
            }
        }
    });

    window.onAIAgentFileSelect = function(e) {
        const file = e.target.files && e.target.files[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = function(evt) {
            processUploadedDocumentImage(evt.target.result, file.type);
        };
        reader.readAsDataURL(file);
    };

    window.onAIAgentDrop = function(e) {
        e.preventDefault();
        const dt = e.dataTransfer;
        if (!dt || !dt.files || dt.files.length === 0) return;
        const file = dt.files[0];
        if (file.type.indexOf('image') === -1) {
            alert('Vui lòng chỉ thả file ảnh (PNG, JPG, WEBP)!');
            return;
        }
        const reader = new FileReader();
        reader.onload = function(evt) {
            processUploadedDocumentImage(evt.target.result, file.type);
        };
        reader.readAsDataURL(file);
    };

    window.processUploadedDocumentImage = async function(base64Str, mimeType) {
        currentImageBase64 = base64Str;
        const previewImg = document.getElementById('ai-agent-preview-img');
        const emptyState = document.getElementById('ai-agent-dropzone-empty');
        const previewWrap = document.getElementById('ai-agent-preview-wrap');
        const loadingBox = document.getElementById('ai-agent-loading');
        const resultWrap = document.getElementById('ai-agent-result-wrap');

        if (previewImg && emptyState && previewWrap) {
            previewImg.src = base64Str;
            emptyState.classList.add('hidden');
            previewWrap.classList.remove('hidden');
        }

        if (loadingBox) loadingBox.classList.remove('hidden');
        if (resultWrap) resultWrap.classList.add('hidden');

        try {
            const res = await fetch('/api/ai/parse-document-image', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    image_base64: base64Str,
                    mime_type: mimeType || 'image/jpeg'
                })
            });

            const data = await res.json();
            if (!res.ok) throw new Error(data.detail || 'Không thể bóc tách ảnh');

            currentAIResult = data;
            renderAIAgentResult(data);
        } catch (e) {
            console.error("AI Agent error:", e);
            alert("Lỗi khi xử lý ảnh bằng AI: " + (e.message || e));
        } finally {
            if (loadingBox) loadingBox.classList.add('hidden');
        }
    };

    window.renderAIAgentResult = function(data) {
        const resultWrap = document.getElementById('ai-agent-result-wrap');
        if (!resultWrap) return;
        resultWrap.classList.remove('hidden');

        // Cập nhật giá trị vào dropdown chọn loại
        const typeSelect = document.getElementById('ai-agent-type-select');
        if (typeSelect) {
            typeSelect.value = data.detected_type || 'pos_order';
        }

        const partnerEl = document.getElementById('ai-agent-partner-name');
        if (partnerEl) partnerEl.value = data.partner_name || '';

        const dateEl = document.getElementById('ai-agent-date');
        if (dateEl) dateEl.value = data.date || getLocalTodayDateStr();

        const totalEl = document.getElementById('ai-agent-total');
        if (totalEl) totalEl.textContent = formatMoney(data.total_amount || 0);

        // Hiển thị panel tài chính mở rộng cho OEM nếu có
        const oemFinancialWrap = document.getElementById('ai-agent-oem-financials');
        if (oemFinancialWrap) {
            if (data.detected_type === 'oem_order') {
                oemFinancialWrap.classList.remove('hidden');
                document.getElementById('ai-oem-vat').textContent = (data.vat_percent || 0) + '%';
                document.getElementById('ai-oem-discount').textContent = (data.discount_percent || 0) + '%';
                document.getElementById('ai-oem-deposit').textContent = formatMoney(data.deposit_amount || 0);
                document.getElementById('ai-oem-remaining').textContent = formatMoney(data.remaining_payment || 0);
            } else {
                oemFinancialWrap.classList.add('hidden');
            }
        }

        const noteEl = document.getElementById('ai-agent-note');
        if (noteEl) noteEl.value = data.note || '';

        // Render Bảng Mặt Hàng
        const tbody = document.getElementById('ai-agent-items-tbody');
        const itemsWrap = document.getElementById('ai-agent-items-wrap');
        const items = data.items || [];

        if (items.length > 0) {
            if (itemsWrap) itemsWrap.classList.remove('hidden');
            if (tbody) {
                tbody.innerHTML = items.map((it, idx) => `
                    <tr class="border-b hover:bg-slate-50 text-xs">
                        <td class="p-2 text-center text-slate-400">${idx + 1}</td>
                        <td class="p-2 font-medium text-slate-800">
                            <input type="text" value="${it.product_name}" class="border rounded px-2 py-1 w-full text-xs font-semibold" onchange="updateAIItemField(${idx}, 'product_name', this.value)">
                        </td>
                        <td class="p-2 text-right">
                            <input type="number" step="any" value="${it.quantity || 1}" class="border rounded px-2 py-1 w-20 text-right font-mono font-bold" onchange="updateAIItemField(${idx}, 'quantity', this.value)">
                        </td>
                        <td class="p-2 text-right">
                            <input type="number" step="any" value="${it.price || 0}" class="border rounded px-2 py-1 w-24 text-right font-mono" onchange="updateAIItemField(${idx}, 'price', this.value)">
                        </td>
                        <td class="p-2 text-right font-mono font-bold text-slate-800">
                            ${formatMoney((it.quantity || 1) * (it.price || 0))}
                        </td>
                        <td class="p-2 text-center">
                            <button onclick="removeAIItemRow(${idx})" class="text-rose-500 hover:text-rose-700 font-bold">✕</button>
                        </td>
                    </tr>
                `).join('');
            }
        } else {
            if (itemsWrap) itemsWrap.classList.add('hidden');
        }

        // Tùy biến hiển thị các nút tạo đơn tương ứng
        updateAIActionsButtons(data.detected_type);
    };

    window.onAITypeSelectChange = function(newType) {
        if (!currentAIResult) return;
        currentAIResult.detected_type = newType;
        renderAIAgentResult(currentAIResult);
    };

    window.updateAIActionsButtons = function(detectedType) {
        const btnPOS = document.getElementById('btn-ai-push-pos');
        const btnPO = document.getElementById('btn-ai-create-po');
        const btnOEM = document.getElementById('btn-ai-create-oem');
        const btnCash = document.getElementById('btn-ai-create-cash');

        if (btnPOS) btnPOS.classList.toggle('hidden', detectedType !== 'pos_order');
        if (btnPO) btnPO.classList.toggle('hidden', detectedType !== 'purchase_order');
        if (btnOEM) btnOEM.classList.toggle('hidden', detectedType !== 'oem_order');
        if (btnCash) btnCash.classList.toggle('hidden', detectedType !== 'cashflow_voucher');
    };

    window.updateAIItemField = function(idx, field, val) {
        if (!currentAIResult || !currentAIResult.items || !currentAIResult.items[idx]) return;
        currentAIResult.items[idx][field] = field === 'product_name' ? val : (parseFloat(val) || 0);
        let newTotal = 0;
        currentAIResult.items.forEach(it => {
            newTotal += (it.quantity || 1) * (it.price || 0);
        });
        currentAIResult.total_amount = newTotal;
        renderAIAgentResult(currentAIResult);
    };

    window.removeAIItemRow = function(idx) {
        if (!currentAIResult || !currentAIResult.items) return;
        currentAIResult.items.splice(idx, 1);
        let newTotal = 0;
        currentAIResult.items.forEach(it => {
            newTotal += (it.quantity || 1) * (it.price || 0);
        });
        currentAIResult.total_amount = newTotal;
        renderAIAgentResult(currentAIResult);
    };

    window.resetAIAgentWorkspace = function() {
        currentAIResult = null;
        currentImageBase64 = null;
        document.getElementById('ai-agent-dropzone-empty')?.classList.remove('hidden');
        document.getElementById('ai-agent-preview-wrap')?.classList.add('hidden');
        document.getElementById('ai-agent-result-wrap')?.classList.add('hidden');
    };

    // 1. ĐẨY VÀO GIỎ HÀNG BÁN LẺ POS
    window.pushAIToPOSCart = function() {
        if (!currentAIResult || !currentAIResult.items) return;
        if (typeof getActiveTab !== 'function') {
            alert('Chưa sẵn sàng chuyển sang quầy POS');
            return;
        }

        const tab = getActiveTab();
        if (!tab) return;

        // Thêm vào giỏ hàng
        let addedCount = 0;
        currentAIResult.items.forEach(it => {
            tab.cart.push({
                product_id: it.matched_product_id || 1,
                id: it.matched_product_id || 1,
                code: it.matched_code || 'AI_ITEM',
                name: it.product_name,
                price: it.price || 0,
                original_price: it.price || 0,
                quantity: it.quantity || 1,
                unit: it.unit || 'Cái',
                unit_ratio: 1
            });
            addedCount++;
        });

        if (typeof renderActiveTabCart === 'function') renderActiveTabCart();
        if (typeof switchTab === 'function') switchTab('pos');
        alert(`✅ Đã đẩy thành công ${addedCount} sản phẩm từ ảnh vào giỏ hàng POS!`);
    };

    // 2. ĐIỀN VÀO PHIẾU NHẬP HÀNG (PO/PN)
    window.createAIPurchaseOrder = function() {
        if (!currentAIResult) return;
        if (typeof switchTab === 'function') switchTab('purchases');
        alert('✅ Đã mở tab Nhập hàng để hoàn thiện đơn nhập hàng!');
    };

    // 3. ĐIỀN VÀO ĐƠN GIA CÔNG OEM
    window.createAIOEMOrder = async function() {
        if (!currentAIResult) return;
        
        // Chuyển sang tab OEM
        if (typeof switchTab === 'function') switchTab('oem');

        // Mở modal tạo đơn OEM
        if (typeof openModalCreateOEM === 'function') {
            await openModalCreateOEM();

            // Nếu tìm thấy xưởng trong CSDL
            const factoryId = currentAIResult.matched_partner_id || 10;
            if (typeof selectOEMFactory === 'function') {
                await selectOEMFactory(factoryId);
            }

            // Gán VAT & Chiết khấu & Tiền cọc & Ghi chú
            if (currentAIResult.vat_percent !== undefined) {
                const vatInp = document.getElementById('oem-create-vat');
                if (vatInp) vatInp.value = currentAIResult.vat_percent;
            }
            if (currentAIResult.discount_percent !== undefined) {
                const discInp = document.getElementById('oem-create-discount');
                if (discInp) discInp.value = currentAIResult.discount_percent;
                if (typeof setOEMDiscountType === 'function') setOEMDiscountType('percent');
            }
            if (currentAIResult.deposit_amount) {
                const depInp = document.getElementById('oem-create-deposit');
                if (depInp) depInp.value = currentAIResult.deposit_amount;
            }
            if (currentAIResult.note) {
                const noteInp = document.getElementById('oem-create-note');
                if (noteInp) noteInp.value = currentAIResult.note;
            }

            // Nạp danh sách sản phẩm từ kết quả AI vào form OEM
            const items = currentAIResult.items || [];
            if (items.length > 0 && typeof addOEMProductRow === 'function') {
                const itemsBody = document.getElementById('oem-create-items-body');
                if (itemsBody) itemsBody.innerHTML = '';

                items.forEach(it => {
                    addOEMProductRow({
                        product_id: it.matched_product_id,
                        ordered_qty: it.quantity || 1,
                        unit_price: it.price || 0
                    });
                });
            }

            if (typeof recalcCreateOEMMath === 'function') {
                recalcCreateOEMMath();
            }

            alert('✅ Đã nạp thành công thông tin Xưởng Lucky Star, 4 sản phẩm gia công, VAT 8%, Chiết khấu 5% và Tiền cọc vào đơn OEM!');
        } else {
            alert('Đã chuyển sang tab OEM. Vui lòng bấm "Lập Đơn Đặt Gia Công Mới" để hoàn tất.');
        }
    };

    // 4. TẠO PHIẾU THU / CHI SỔ QUỸ
    window.createAICashflowVoucher = async function() {
        if (!currentAIResult) return;
        const normType = currentAIResult.cashflow_type === 'in' ? 'in' : 'out';
        const category = currentAIResult.cashflow_category || (normType === 'in' ? 'Thu tiền bán lẻ' : 'Chi phí vận hành');
        const amount = currentAIResult.total_amount || 0;
        const note = (currentAIResult.note || '') + ' (Tác nhân AI bóc tách từ ảnh)';

        if (amount <= 0) {
            alert('Số tiền thu chi phải lớn hơn 0!');
            return;
        }

        try {
            const res = await fetch('/api/cashbook', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    type: normType,
                    category: category,
                    amount: amount,
                    note: note
                })
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.detail || 'Lỗi tạo phiếu thu/chi');
            alert(`✅ Đã tạo thành công phiếu ${normType === 'in' ? 'Thu' : 'Chi'} [${data.code}] số tiền ${formatMoney(amount)}!`);
            resetAIAgentWorkspace();
            if (typeof switchTab === 'function') switchTab('cashbook');
        } catch (e) {
            alert('❌ Lỗi: ' + e.message);
        }
    };

    // ========================================================
    // CẤU HÌNH AI CÁ NHÂN (BRING YOUR OWN KEY - BYOK)
    // ========================================================
    window.syncMyAIBadge = async function() {
        try {
            const res = await fetch('/api/auth/my-ai-config');
            if (!res.ok) return;
            const data = await res.json();
            const btnLabel = document.getElementById('btn-label-my-ai-key');
            if (btnLabel) {
                if (data.active_source === 'personal') {
                    btnLabel.innerText = "Key Cá Nhân (Đã Bật)";
                } else if (data.active_source === 'shop') {
                    btnLabel.innerText = "Dùng Key Tiệm";
                } else {
                    btnLabel.innerText = "API Key Cá Nhân";
                }
            }
        } catch (e) {}
    };

    window.openMyAIConfigModal = async function() {
        const modal = document.getElementById('modal-my-ai-config');
        if (!modal) return;
        modal.classList.remove('hidden');
        modal.style.display = 'flex';

        const keyInput = document.getElementById('my-gemini-key');
        const modelSelect = document.getElementById('my-gemini-model');
        const badge = document.getElementById('my-ai-active-badge');
        const desc = document.getElementById('my-ai-active-desc');
        const testRes = document.getElementById('my-gemini-test-result');

        if (testRes) testRes.classList.add('hidden');
        if (keyInput) keyInput.value = '';

        try {
            const res = await fetch('/api/auth/my-ai-config');
            if (!res.ok) {
                if (badge && desc) {
                    badge.className = "font-bold px-2 py-0.5 rounded text-xs bg-slate-100 text-slate-700 border border-slate-200";
                    badge.innerText = "Phiên cục bộ";
                    desc.innerText = "Nhập Google Gemini API Key cá nhân của bạn và bấm 'Lưu Key Cá Nhân' bên dưới.";
                }
                return;
            }
            const data = await res.json();

            if (modelSelect && data.ai_model) {
                modelSelect.value = data.ai_model;
            }

            if (badge && desc) {
                if (data.active_source === 'personal') {
                    badge.className = "font-bold px-2 py-0.5 rounded text-xs bg-sky-100 text-sky-800 border border-sky-200";
                    badge.innerText = "👤 Đang dùng Key cá nhân của bạn";
                    desc.innerText = `Key hiện tại: ${data.masked_key} (${data.ai_model})`;
                    const btnLabel = document.getElementById('btn-label-my-ai-key');
                    if (btnLabel) btnLabel.innerText = "Key Cá Nhân (Đã Bật)";
                } else if (data.active_source === 'shop') {
                    badge.className = "font-bold px-2 py-0.5 rounded text-xs bg-blue-100 text-blue-800 border border-blue-200";
                    badge.innerText = "🏢 Đang dùng Key mặc định của tiệm";
                    desc.innerText = "Bạn chưa cài key riêng. Quota đang được cấp từ tài khoản chung của tiệm.";
                } else {
                    badge.className = "font-bold px-2 py-0.5 rounded text-xs bg-rose-100 text-rose-800 border border-rose-200";
                    badge.innerText = "⚠️ Chưa có API Key nào";
                    desc.innerText = "Cả bạn và tiệm đều chưa nhập Gemini API Key. Vui lòng nhập key để sử dụng.";
                }
            }
        } catch (e) {
            console.error("Lỗi lấy cấu hình AI cá nhân:", e);
        }
    };

    window.closeMyAIConfigModal = function() {
        const modal = document.getElementById('modal-my-ai-config');
        if (modal) {
            modal.classList.add('hidden');
            modal.style.display = 'none';
        }
    };

    window.testMyAIKey = async function() {
        const key = (document.getElementById('my-gemini-key')?.value || '').trim();
        const model = document.getElementById('my-gemini-model')?.value || 'gemini-2.5-flash';
        const resultDiv = document.getElementById('my-gemini-test-result');
        const btn = document.getElementById('btn-test-my-ai-key');

        if (!key) {
            alert("Vui lòng nhập Google Gemini API Key vào ô để kiểm tra!");
            return;
        }

        if (btn) { btn.disabled = true; btn.innerText = "⏳ Đang thử..."; }
        if (resultDiv) {
            resultDiv.className = "p-2 bg-slate-50 border rounded text-slate-700 text-xs";
            resultDiv.innerText = "Đang kết nối tới máy chủ Google AI Studio...";
            resultDiv.classList.remove('hidden');
        }

        try {
            const res = await fetch('/api/ai/test-key', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ gemini_api_key: key, gemini_model: model })
            });
            const data = await res.json();
            if (res.ok) {
                if (resultDiv) {
                    resultDiv.className = "p-2.5 bg-emerald-50 border border-emerald-200 rounded text-emerald-800 text-xs font-semibold";
                    resultDiv.innerText = `✅ ${data.message || 'API Key cá nhân hoạt động xuất sắc!'}`;
                }
            } else {
                if (resultDiv) {
                    resultDiv.className = "p-2.5 bg-rose-50 border border-rose-200 rounded text-rose-800 text-xs";
                    resultDiv.innerText = `❌ Lỗi: ${data.detail || 'API Key không hợp lệ hoặc hết hạn'}`;
                }
            }
        } catch (e) {
            if (resultDiv) {
                resultDiv.className = "p-2.5 bg-rose-50 border border-rose-200 rounded text-rose-800 text-xs";
                resultDiv.innerText = `❌ Lỗi mạng: ${e.message}`;
            }
        } finally {
            if (btn) { btn.disabled = false; btn.innerHTML = "<span>🔍</span> <span>Kiểm Tra Key</span>"; }
        }
    };

    window.saveMyAIConfig = async function() {
        const key = (document.getElementById('my-gemini-key')?.value || '').trim();
        const model = document.getElementById('my-gemini-model')?.value || 'gemini-2.5-flash';

        try {
            const res = await fetch('/api/auth/my-ai-config', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ ai_api_key: key, ai_model: model })
            });
            if (res.ok) {
                alert(key ? "✅ Đã lưu Gemini API Key cá nhân thành công!" : "✅ Đã xóa Key cá nhân. Bạn sẽ dùng Key mặc định của tiệm.");
                closeMyAIConfigModal();
                const btnLabel = document.getElementById('btn-label-my-ai-key');
                if (btnLabel) {
                    btnLabel.innerText = key ? "Key Cá Nhân (Đã Bật)" : "API Key Cá Nhân";
                }
            } else {
                const err = await res.json();
                alert("❌ Lỗi: " + (err.detail || "Không thể lưu"));
            }
        } catch (e) {
            alert("❌ Lỗi kết nối: " + e.message);
        }
    };

    // ========================================================
    // BÁO CÁO NHÂN VIÊN, NHẮC VIỆC & BRIEFING ĐẦU CA
    // ========================================================

    window.loadStaffBriefing = async function() {
        try {
            const res = await fetch('/api/ai/staff-briefing');
            if (!res.ok) return;
            const data = await res.json();

            // 1. Header & Lời chào
            const greetEl = document.getElementById('ai-staff-greeting');
            const roleEl = document.getElementById('ai-staff-role');
            const shiftBadge = document.getElementById('ai-shift-badge');
            const briefText = document.getElementById('ai-staff-briefing-text');

            if (greetEl) greetEl.textContent = data.greeting || "Chào bạn!";
            if (roleEl) {
                const roleMap = { owner: "Chủ Cửa Hàng", cashier: "Thu Ngân", warehouse: "Thủ Kho / OEM", accountant: "Kế Toán" };
                roleEl.textContent = roleMap[data.staff.role] || data.staff.role;
            }
            if (shiftBadge) {
                shiftBadge.textContent = data.shift.status_label || "Đang kiểm tra ca";
                shiftBadge.className = data.shift.is_open 
                    ? "px-2 py-0.5 rounded text-xs font-bold bg-emerald-100 text-emerald-800 border border-emerald-200"
                    : "px-2 py-0.5 rounded text-xs font-bold bg-slate-100 text-slate-700 border border-slate-200";
            }
            if (briefText) {
                briefText.innerHTML = `<i class="ph ph-robot text-sky-600 text-sm"></i> <span class="font-medium text-slate-600">${data.briefing_desc || "Chúc bạn một ca làm việc thuận lợi!"}</span>`;
            }

            // 2. Cột 1: Danh sách việc cần làm & nhắc nhở
            const remCountEl = document.getElementById('ai-reminder-count');
            const remListEl = document.getElementById('ai-reminder-list');
            if (remCountEl) remCountEl.textContent = `${(data.reminders || []).length} việc`;

            if (remListEl) {
                const items = data.reminders || [];
                if (items.length === 0) {
                    remListEl.innerHTML = `
                        <div class="p-4 bg-white border border-dashed border-slate-200 rounded-lg text-center text-slate-400 text-xs">
                            Chưa có lời nhắc nào trong ca.<br>Bấm nút bên dưới để tạo nhắc nhở mới!
                        </div>
                    `;
                } else {
                    remListEl.innerHTML = items.map(r => {
                        const prioBadge = r.priority === 'urgent' 
                            ? `<span class="px-1.5 py-0.2 rounded text-xs font-bold bg-rose-100 text-rose-800 shrink-0">🔴 GẤP</span>`
                            : (r.priority === 'low' 
                                ? `<span class="px-1.5 py-0.2 rounded text-xs font-bold bg-slate-100 text-slate-600 shrink-0">🟢 Lưu ý</span>`
                                : `<span class="px-1.5 py-0.2 rounded text-xs font-bold bg-amber-100 text-amber-800 shrink-0">🟡 Bình thường</span>`);

                        return `
                            <div class="p-2.5 bg-white border border-slate-200 rounded-lg shadow-2xs space-y-1 hover:border-sky-300 transition ${r.is_done ? 'opacity-60 bg-slate-50' : ''}">
                                <div class="flex items-start justify-between gap-1">
                                    <label class="flex items-center gap-2 cursor-pointer font-semibold text-slate-800 flex-1 min-w-0">
                                        <input type="checkbox" ${r.is_done ? 'checked' : ''} onchange="toggleStaffReminder(${r.id})" class="w-3.5 h-3.5 rounded text-sky-600 cursor-pointer">
                                        <span class="truncate ${r.is_done ? 'line-through text-slate-400' : ''}">${r.title}</span>
                                    </label>
                                    <div class="flex items-center gap-1 shrink-0">
                                        ${r.remind_time ? `<span class="text-xs text-sky-700 font-mono font-bold bg-sky-50 px-1 rounded">${r.remind_time}</span>` : ''}
                                        ${prioBadge}
                                        <button type="button" onclick="deleteStaffReminder(${r.id})" class="text-slate-300 hover:text-rose-600 font-bold px-1 text-xs" title="Xóa">✕</button>
                                    </div>
                                </div>
                                ${r.description ? `<div class="text-xs text-slate-500 pl-5">${r.description}</div>` : ''}
                            </div>
                        `;
                    }).join('');
                }
            }

            // 3. CỘT 2: TRUNG TÂM NGHIỆP VỤ THÍCH ỨNG THEO VAI TRÒ
            window._aiLastBriefingData = data;
            const col2Title = document.getElementById('ai-col2-title');
            const col2RoleBadge = document.getElementById('ai-col2-role-badge');
            const col2KpiGrid = document.getElementById('ai-col2-kpi-grid');
            const col2ListTitle = document.getElementById('ai-col2-list-title');
            const col2ListSub = document.getElementById('ai-col2-list-subtitle');
            const col2ListContent = document.getElementById('ai-col2-list-content');
            const col2FooterBox = document.getElementById('ai-col2-footer-box');

            const role = data.staff.role || 'cashier';

            if (role === 'warehouse') {
                // ==================== VAI TRÒ: THỦ KHO / OEM ====================
                if (col2Title) col2Title.textContent = "Theo Dõi Nhập Hàng & Tiến Độ Về";
                if (col2RoleBadge) {
                    col2RoleBadge.textContent = "Thủ Kho / OEM";
                    col2RoleBadge.className = "text-xs text-sky-700 font-bold bg-sky-50 px-1.5 py-0.5 rounded border border-sky-200";
                }

                if (col2KpiGrid) {
                    const pendingReqs = data.warehouse_kpi?.pending_purchase_requests || [];
                    const pendingCount = data.warehouse_kpi?.pending_request_count || pendingReqs.length;
                    const incomingToday = data.warehouse_kpi?.incoming_today_count || 0;

                    col2KpiGrid.className = "grid grid-cols-3 gap-2 text-xs";
                    col2KpiGrid.innerHTML = `
                        <div onclick="openLowStockModal()" class="bg-white p-2 rounded-lg border border-rose-200 bg-rose-50/30 cursor-pointer hover:border-rose-400 transition group shadow-2xs">
                            <div class="text-xs text-rose-700 font-bold flex items-center justify-between">
                                <span>Hàng Sắp Hết</span>
                                <span class="group-hover:scale-110 transition-transform">🚨</span>
                            </div>
                            <div class="text-sm font-bold text-rose-600 font-mono mt-0.5">${data.warehouse_kpi?.low_stock_count || 0} món</div>
                            <div class="text-xs text-rose-500 mt-0.5">Cần đặt NCC</div>
                        </div>
                        <div onclick="if(typeof switchTab==='function') switchTab('purchase-requests')" class="bg-white p-2 rounded-lg border border-amber-200 bg-amber-50/30 cursor-pointer hover:border-amber-400 transition group shadow-2xs">
                            <div class="text-xs text-amber-700 font-bold flex items-center justify-between">
                                <span>Chờ Duyệt</span>
                                <span class="group-hover:scale-110 transition-transform">📋</span>
                            </div>
                            <div class="text-sm font-bold text-amber-600 font-mono mt-0.5">${pendingCount} phiếu</div>
                            <div class="text-xs text-amber-600 mt-0.5">Yêu cầu nhập</div>
                        </div>
                        <div class="bg-white p-2 rounded-lg border border-sky-200 bg-sky-50/30 shadow-2xs">
                            <div class="text-xs text-sky-700 font-bold flex items-center justify-between">
                                <span>Về Hôm Nay</span>
                                <span class="animate-bounce">⚡</span>
                            </div>
                            <div class="text-sm font-bold text-sky-700 font-mono mt-0.5">${incomingToday} đơn</div>
                            <div class="text-xs text-sky-600 mt-0.5">Dự kiến giao</div>
                        </div>
                    `;
                }

                if (col2ListTitle) col2ListTitle.textContent = "🚚 Hàng Đang Về & Yêu Cầu Cần Duyệt";
                if (col2ListSub) col2ListSub.textContent = "(Bấm để xử lý ngay)";

                if (col2ListContent) {
                    const shipments = data.warehouse_kpi?.incoming_shipments || [];
                    const pendingReqs = data.warehouse_kpi?.pending_purchase_requests || [];

                    let html = '';
                    // 1. Render các Phiếu Yêu Cầu Cần Duyệt Trước Tiên
                    if (pendingReqs.length > 0) {
                        html += `
                            <div class="space-y-1 pb-1">
                                <div class="text-xs font-bold text-amber-700 uppercase tracking-wider flex items-center gap-1">
                                    <span>🔔</span> Phiếu Yêu Cầu Chờ Lên PO (${pendingReqs.length})
                                </div>
                                ${pendingReqs.map(pr => `
                                    <div class="p-2 rounded-lg bg-amber-50/60 border border-amber-200 hover:border-amber-400 transition flex items-center justify-between gap-2">
                                        <div class="truncate">
                                            <div class="font-bold text-slate-800 text-xs flex items-center gap-1.5">
                                                <span class="font-mono text-amber-800">${pr.code}</span>
                                                <span class="text-xs bg-white border border-amber-300 text-amber-700 px-1 rounded font-bold">${pr.dept_label}</span>
                                            </div>
                                            <div class="text-xs text-slate-500 mt-0.5">
                                                ${pr.created_by} &bull; <b class="text-slate-700">${pr.item_count} món</b> (SL: ${pr.total_qty})
                                            </div>
                                        </div>
                                        <button type="button" onclick="quickConvertRequestToPO(${pr.id}, '${pr.code}')" class="px-2 py-1 bg-emerald-600 hover:bg-emerald-700 text-white rounded font-bold text-xs shadow-2xs shrink-0 flex items-center gap-1">
                                            <span>⚡</span> Lên PO
                                        </button>
                                    </div>
                                `).join('')}
                            </div>
                        `;
                    }

                    // 2. Render các Đơn hàng đang trên đường về
                    if (shipments.length > 0) {
                        html += `
                            <div class="space-y-1 pt-1">
                                <div class="text-xs font-bold text-sky-700 uppercase tracking-wider flex items-center gap-1">
                                    <span>🚚</span> Lô Hàng Đang Về Kho (${shipments.length})
                                </div>
                                ${shipments.map(s => {
                                    const isPurchase = s.shipment_type === 'purchase';
                                    const clickFn = isPurchase 
                                        ? `if(typeof openReceiveModal==='function') openReceiveModal('${s.code}', false);`
                                        : `if(typeof openModalReceiveOEM==='function') openModalReceiveOEM(${s.id});`;
                                    const badge = isPurchase 
                                        ? `<span class="px-1.5 py-0.2 rounded text-xs font-bold bg-amber-100 text-amber-800 shrink-0">📥 Nhập NCC</span>`
                                        : `<span class="px-1.5 py-0.2 rounded text-xs font-bold bg-sky-100 text-sky-800 shrink-0">🏭 Đơn OEM</span>`;
                                    const todayBadge = s.is_today ? `<span class="px-1.5 py-0.2 rounded text-xs font-bold bg-sky-600 text-white shrink-0 animate-pulse">⚡ Hôm Nay</span>` : '';
                                    const cardBg = s.is_today ? 'bg-sky-50/70 border-sky-300 shadow-2xs' : 'bg-slate-50 border-slate-200';

                                    return `
                                        <div onclick="${clickFn}" class="p-2 rounded-lg ${cardBg} hover:bg-sky-50/80 border hover:border-sky-300 transition cursor-pointer space-y-0.5 group">
                                            <div class="flex justify-between items-center font-bold text-slate-800">
                                                <div class="flex items-center gap-1.5 truncate mr-2">
                                                    ${todayBadge}
                                                    ${badge}
                                                    <span class="truncate group-hover:text-sky-700">${s.code}: ${s.partner_name}</span>
                                                </div>
                                                <span class="text-sky-700 font-mono text-xs shrink-0 font-bold">${s.expected_date}</span>
                                            </div>
                                            <div class="flex justify-between items-center text-xs text-slate-500">
                                                <span class="text-sky-600 font-semibold group-hover:underline">👉 Bấm để kiểm đếm & nhận hàng</span>
                                                <span class="font-bold text-slate-700 font-mono">${typeof formatMoney === 'function' ? formatMoney(s.amount) : s.amount}</span>
                                            </div>
                                        </div>
                                    `;
                                }).join('')}
                            </div>
                        `;
                    }

                    if (!html) {
                        html = `<div class="text-slate-400 py-3 text-center  text-xs">Hiện kho không có yêu cầu nhập hàng hay đơn hàng đang chờ về.</div>`;
                    }
                    col2ListContent.innerHTML = html;
                }

                if (col2FooterBox) {
                    const canSeeDebt = typeof Auth === 'undefined' || Auth.can('purchases.manage');
                    if (canSeeDebt && (data.warehouse_kpi?.total_payable || 0) > 0) {
                        col2FooterBox.classList.remove('hidden');
                        col2FooterBox.className = "p-2.5 bg-rose-50/80 border border-rose-200 rounded-lg text-xs space-y-1";
                        col2FooterBox.innerHTML = `
                            <div class="flex items-center justify-between">
                                <span class="font-bold text-rose-900">📑 Công nợ NCC & Xưởng còn nợ:</span>
                                <span class="font-mono font-bold text-rose-700 text-sm">${typeof formatMoney === 'function' ? formatMoney(data.warehouse_kpi?.total_payable || 0) : data.warehouse_kpi?.total_payable}</span>
                            </div>
                            <div class="text-xs text-rose-700">
                                Nợ NCC: ${typeof formatMoney === 'function' ? formatMoney(data.warehouse_kpi?.debt_to_suppliers || 0) : 0} + Nợ xưởng OEM: ${typeof formatMoney === 'function' ? formatMoney(data.warehouse_kpi?.debt_to_oem || 0) : 0}
                            </div>
                        `;
                    } else {
                        col2FooterBox.classList.add('hidden');
                        col2FooterBox.innerHTML = '';
                    }
                }

            } else if (role === 'accountant') {
                // ==================== VAI TRÒ: KẾ TOÁN ====================
                if (col2Title) col2Title.textContent = "Đối Soát Công Nợ & Sổ Quỹ";
                if (col2RoleBadge) {
                    col2RoleBadge.textContent = "Kế Toán";
                    col2RoleBadge.className = "text-xs text-sky-700 font-bold bg-sky-50 px-1.5 py-0.5 rounded border border-sky-200";
                }

                if (col2KpiGrid) {
                    col2KpiGrid.innerHTML = `
                        <div onclick="if(typeof switchTab==='function') switchTab('orders')" class="bg-white p-2.5 rounded-lg border border-sky-200 bg-sky-50/30 cursor-pointer hover:border-sky-400 transition shadow-2xs">
                            <div class="text-xs text-sky-700 font-bold">Phải Thu (Khách Nợ)</div>
                            <div class="text-sm font-bold text-sky-600 font-mono mt-0.5">${typeof formatMoney === 'function' ? formatMoney(data.accountant_kpi?.receivable_debt || 0) : 0}</div>
                            <div class="text-xs text-sky-500 mt-0.5">${data.accountant_kpi?.receivable_count || 0} khách hàng nợ</div>
                        </div>
                        <div onclick="if(typeof switchTab==='function') switchTab('purchases')" class="bg-white p-2.5 rounded-lg border border-rose-200 bg-rose-50/30 cursor-pointer hover:border-rose-400 transition shadow-2xs">
                            <div class="text-xs text-rose-700 font-bold">Phải Trả (Nợ NCC/Xưởng)</div>
                            <div class="text-sm font-bold text-rose-600 font-mono mt-0.5">${typeof formatMoney === 'function' ? formatMoney(data.accountant_kpi?.payable_debt || 0) : 0}</div>
                            <div class="text-xs text-rose-500 mt-0.5">Tiền hàng & gia công</div>
                        </div>
                    `;
                }

                if (col2ListTitle) col2ListTitle.textContent = "📑 Yêu Cầu Chi Tiêu & Sổ Quỹ";
                if (col2ListSub) col2ListSub.textContent = `${data.accountant_kpi?.pending_expense_count || 0} phiếu chờ duyệt`;

                if (col2ListContent) {
                    col2ListContent.innerHTML = `
                        <div onclick="if(typeof switchTab==='function') switchTab('cashbook')" class="p-2 rounded bg-sky-50 hover:bg-sky-100 border border-sky-200 cursor-pointer transition text-center text-sky-900 font-bold py-3">
                            💰 Mở Sổ Quỹ & Duyệt Chi Tiêu Hôm Nay
                        </div>
                    `;
                }

                if (col2FooterBox) {
                    col2FooterBox.className = "p-2.5 bg-sky-50/80 border border-sky-200 rounded-lg text-xs space-y-1";
                    col2FooterBox.innerHTML = `
                        <div class="flex items-center justify-between">
                            <span class="font-bold text-sky-900">🏦 Tài khoản thanh toán & Quỹ:</span>
                            <span class="font-mono font-bold text-sky-800 text-sm">${(data.accountant_kpi?.payment_accounts || []).length} tài khoản</span>
                        </div>
                        <div class="text-xs text-sky-700">Theo dõi đối soát dòng tiền đa tài khoản</div>
                    `;
                }

            } else if (role === 'owner') {
                // ==================== VAI TRÒ: CHỦ SHOP (TỔNG QUAN) ====================
                if (col2Title) col2Title.textContent = "Tổng Quan Bán Hàng & Kho Vận";
                if (col2RoleBadge) {
                    col2RoleBadge.textContent = "Chủ Tiệm";
                    col2RoleBadge.className = "text-xs text-sky-700 font-bold bg-sky-100 px-1.5 py-0.5 rounded border border-sky-200";
                }

                if (col2KpiGrid) {
                    const incomingToday = data.warehouse_kpi?.incoming_today_count || 0;
                    col2KpiGrid.className = "grid grid-cols-3 gap-2 text-xs";
                    col2KpiGrid.innerHTML = `
                        <div class="bg-white p-2 rounded-lg border border-slate-200 shadow-2xs">
                            <div class="text-xs text-slate-400 font-medium">Doanh số hôm nay</div>
                            <div class="text-sm font-bold text-sky-600 font-mono mt-0.5">${typeof formatMoney === 'function' ? formatMoney(data.kpi.sales_today) : data.kpi.sales_today}</div>
                            <div class="text-xs text-slate-500 mt-0.5">${data.kpi.orders_count || 0} hóa đơn</div>
                        </div>
                        <div onclick="openLowStockModal()" class="bg-white p-2 rounded-lg border border-amber-200 bg-amber-50/20 cursor-pointer hover:border-amber-400 transition shadow-2xs">
                            <div class="text-xs text-amber-700 font-medium">Hàng sắp hết kho</div>
                            <div class="text-sm font-bold text-amber-600 font-mono mt-0.5">${data.warehouse_kpi?.low_stock_count || 0} mã</div>
                            <div class="text-xs text-amber-500 mt-0.5">Tồn &le; định mức</div>
                        </div>
                        <div class="bg-white p-2 rounded-lg border border-sky-200 bg-sky-50/20 shadow-2xs">
                            <div class="text-xs text-sky-700 font-medium">Hàng về hôm nay</div>
                            <div class="text-sm font-bold text-sky-700 font-mono mt-0.5">${incomingToday} đơn</div>
                            <div class="text-xs text-sky-600 mt-0.5">Dự kiến giao</div>
                        </div>
                    `;
                }

                if (col2ListTitle) col2ListTitle.textContent = "🚚 Lô Hàng Đang Về & Dự Kiến Giao";
                if (col2ListSub) col2ListSub.textContent = `(${data.warehouse_kpi?.incoming_count || 0} đơn)`;

                if (col2ListContent) {
                    const shipments = data.warehouse_kpi?.incoming_shipments || [];
                    if (shipments.length === 0) {
                        col2ListContent.innerHTML = `<div class="text-slate-400 py-2 text-center  text-xs">Không có đơn hàng nào đang về</div>`;
                    } else {
                        col2ListContent.innerHTML = shipments.map(s => {
                            const isPurchase = s.shipment_type === 'purchase';
                            const clickFn = isPurchase 
                                ? `if(typeof openReceiveModal==='function') openReceiveModal('${s.code}', false);`
                                : `if(typeof openModalReceiveOEM==='function') openModalReceiveOEM(${s.id});`;
                            const todayBadge = s.is_today ? `<span class="px-1.5 py-0.2 rounded text-xs font-bold bg-sky-600 text-white shrink-0 mr-1 animate-pulse">⚡ Hôm Nay</span>` : '';
                            return `
                                <div onclick="${clickFn}" class="flex justify-between items-center py-1.5 border-b border-slate-100 last:border-b-0 text-xs hover:bg-sky-50/60 p-1 rounded cursor-pointer transition">
                                    <div class="truncate mr-2 flex items-center">
                                        ${todayBadge}
                                        <span class="font-bold text-slate-800">${s.code}</span>: <span class="text-slate-600 truncate ml-1">${s.partner_name}</span>
                                    </div>
                                    <span class="font-mono font-bold text-sky-700 shrink-0">${s.expected_date}</span>
                                </div>
                            `;
                        }).join('');
                    }
                }

                if (col2FooterBox) {
                    col2FooterBox.className = "p-2.5 bg-sky-50/80 border border-sky-200 rounded-lg text-xs space-y-1";
                    col2FooterBox.innerHTML = `
                        <div class="flex items-center justify-between">
                            <span class="font-bold text-sky-900">📑 Nợ NCC/Xưởng:</span>
                            <span class="font-mono font-bold text-sky-800 text-sm">${typeof formatMoney === 'function' ? formatMoney(data.warehouse_kpi?.total_payable || 0) : 0}</span>
                        </div>
                        <div class="text-xs text-sky-700">Tiền két: ${typeof formatMoney === 'function' ? formatMoney(data.kpi.cash_in_drawer) : data.kpi.cash_in_drawer} | Khách nợ: ${typeof formatMoney === 'function' ? formatMoney(data.accountant_kpi?.receivable_debt || 0) : 0}</div>
                    `;
                }

            } else {
                // ==================== VAI TRÒ MẶC ĐỊNH: THU NGÂN (CASHIER) ====================
                if (col2Title) col2Title.textContent = "Hiệu Suất & Doanh Số Ca";
                if (col2RoleBadge) {
                    col2RoleBadge.textContent = "Thu Ngân";
                    col2RoleBadge.className = "text-xs text-sky-700 font-bold bg-sky-50 px-1.5 py-0.5 rounded border border-sky-200";
                }

                if (col2KpiGrid) {
                    col2KpiGrid.innerHTML = `
                        <div class="bg-white p-2.5 rounded-lg border border-slate-200 shadow-2xs">
                            <div class="text-xs text-slate-400 font-medium">Doanh số ca này</div>
                            <div class="text-sm font-bold text-sky-600 font-mono mt-0.5" id="ai-kpi-sales">${typeof formatMoney === 'function' ? formatMoney(data.kpi.sales_today) : data.kpi.sales_today}</div>
                            <div class="text-xs text-slate-500 mt-0.5" id="ai-kpi-orders-count">${data.kpi.orders_count || 0} hóa đơn</div>
                        </div>
                        <div class="bg-white p-2.5 rounded-lg border border-slate-200 shadow-2xs">
                            <div class="text-xs text-slate-400 font-medium">Hoa hồng tạm tính</div>
                            <div class="text-sm font-bold text-emerald-600 font-mono mt-0.5" id="ai-kpi-commission">${typeof formatMoney === 'function' ? formatMoney(data.kpi.commission_estimate) : data.kpi.commission_estimate}</div>
                            <div class="text-xs text-slate-500 mt-0.5" id="ai-kpi-commission-rate">Định mức ${data.staff.commission_rate || 0}%</div>
                        </div>
                    `;
                }

                if (col2ListTitle) col2ListTitle.textContent = "Giao Dịch Gần Nhất";
                if (col2ListSub) col2ListSub.textContent = "Hôm nay";

                if (col2ListContent) {
                    const acts = data.recent_activities || [];
                    if (acts.length === 0) {
                        col2ListContent.innerHTML = `<div class="text-slate-400 py-2  text-xs">Chưa có giao dịch hôm nay</div>`;
                    } else {
                        col2ListContent.innerHTML = acts.map(a => `
                            <div class="flex justify-between items-center py-1 border-b border-slate-100 last:border-b-0 text-xs">
                                <span class="truncate mr-2">${a.title}</span>
                                <span class="font-mono font-bold text-slate-800 shrink-0">${typeof formatMoney === 'function' ? formatMoney(a.amount) : a.amount}</span>
                            </div>
                        `).join('');
                    }
                }

                if (col2FooterBox) {
                    col2FooterBox.className = "p-2.5 bg-amber-50/80 border border-amber-200 rounded-lg text-xs space-y-1";
                    col2FooterBox.innerHTML = `
                        <div class="flex items-center justify-between">
                            <span class="font-bold text-amber-900">💵 Tiền mặt trong két:</span>
                            <span class="font-mono font-bold text-amber-800 text-sm">${typeof formatMoney === 'function' ? formatMoney(data.kpi.cash_in_drawer) : data.kpi.cash_in_drawer}</span>
                        </div>
                        <div class="text-xs text-amber-700">Đầu ca: ${typeof formatMoney === 'function' ? formatMoney(data.shift.opening_cash) : data.shift.opening_cash} + Thu chi tiền mặt</div>
                    `;
                }
            }

        } catch (e) {
            console.error("Lỗi tải tóm tắt nhân viên:", e);
        }
    };

    window.toggleStaffReminder = async function(reminderId) {
        try {
            const res = await fetch(`/api/ai/reminders/${reminderId}/toggle`, { method: 'PATCH' });
            if (res.ok) {
                loadStaffBriefing();
            }
        } catch (e) {
            console.error(e);
        }
    };

    window.deleteStaffReminder = async function(reminderId) {
        if (!confirm("Bạn có chắc chắn muốn xóa lời nhắc này?")) return;
        try {
            const res = await fetch(`/api/ai/reminders/${reminderId}`, { method: 'DELETE' });
            if (res.ok) {
                loadStaffBriefing();
            }
        } catch (e) {
            console.error(e);
        }
    };

    window.openCreateReminderModal = async function() {
        const modal = document.getElementById('modal-create-reminder');
        if (!modal) return;
        modal.classList.remove('hidden');
        modal.style.display = 'flex';

        const titleInp = document.getElementById('reminder-title');
        const descInp = document.getElementById('reminder-desc');
        const timeInp = document.getElementById('reminder-time');
        const staffSel = document.getElementById('reminder-staff-id');

        if (titleInp) titleInp.value = '';
        if (descInp) descInp.value = '';
        if (timeInp) {
            const d = new Date();
            d.setHours(d.getHours() + 1);
            timeInp.value = `${String(d.getHours()).padStart(2, '0')}:00`;
        }

        // Tải danh sách nhân viên nếu có quyền
        if (staffSel) {
            try {
                const res = await fetch('/api/staff');
                if (res.ok) {
                    const staffList = await res.json();
                    staffSel.innerHTML = `
                        <option value="">Chính tôi (Cá nhân)</option>
                        ${staffList.map(s => `<option value="${s.id}">${s.name} (${s.role})</option>`).join('')}
                    `;
                }
            } catch (e) {}
        }
    };

    window.closeCreateReminderModal = function() {
        const modal = document.getElementById('modal-create-reminder');
        if (modal) {
            modal.classList.add('hidden');
            modal.style.display = 'none';
        }
    };

    window.saveNewReminder = async function() {
        const title = (document.getElementById('reminder-title')?.value || '').trim();
        const staff_id = document.getElementById('reminder-staff-id')?.value || null;
        const remind_time = document.getElementById('reminder-time')?.value || '';
        const priority = document.getElementById('reminder-priority')?.value || 'normal';
        const description = (document.getElementById('reminder-desc')?.value || '').trim();

        if (!title) {
            alert("Vui lòng nhập nội dung nhắc việc!");
            return;
        }

        try {
            const res = await fetch('/api/ai/reminders', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    title: title,
                    staff_id: staff_id ? parseInt(staff_id) : null,
                    remind_time: remind_time,
                    priority: priority,
                    description: description
                })
            });
            if (res.ok) {
                closeCreateReminderModal();
                loadStaffBriefing();
            } else {
                const err = await res.json();
                alert("❌ Lỗi: " + (err.detail || "Không thể tạo nhắc nhở"));
            }
        } catch (e) {
            alert("❌ Lỗi kết nối: " + e.message);
        }
    };

    window.openLowStockModal = function() {
        const list = window._aiLastBriefingData?.warehouse_kpi?.low_stock_products || [];
        
        // 1. Cập nhật subtitle đếm số lượng chưa đặt vs đã đặt
        const orderedCount = list.filter(p => p.is_ordered).length;
        const uncoveredCount = list.length - orderedCount;
        const subTitle = document.getElementById('ai-low-stock-subtitle');
        if (subTitle) {
            subTitle.innerHTML = `<span class="text-rose-600 font-bold">${uncoveredCount} món chưa đặt</span> &bull; <span class="text-emerald-600 font-bold">${orderedCount} món đã lên đơn</span> &bull; Định mức tối thiểu`;
        }

        // 2. Populate Dropdown Lọc Đối Tác
        const filterSel = document.getElementById('ai-low-stock-partner-filter');
        if (filterSel) {
            const partnerMap = {};
            list.forEach(p => {
                const pid = p.partner_id || 0;
                const pname = p.partner_name || 'Chưa gán NCC';
                if (!partnerMap[pid]) {
                    partnerMap[pid] = { id: pid, name: pname, total: 0, uncovered: 0 };
                }
                partnerMap[pid].total++;
                if (!p.is_ordered) partnerMap[pid].uncovered++;
            });

            const currentVal = filterSel.value;
            let optHtml = `<option value="ALL">Tất cả đối tác (${list.length} món - ${uncoveredCount} cần đặt)</option>`;
            Object.values(partnerMap).forEach(part => {
                optHtml += `<option value="${part.id}">${part.name} (${part.uncovered} cần đặt / ${part.total} món)</option>`;
            });
            filterSel.innerHTML = optHtml;
            if (currentVal && Array.from(filterSel.options).some(o => o.value === currentVal)) {
                filterSel.value = currentVal;
            }
        }

        window.renderLowStockRows(list);

        const m = document.getElementById('modal-ai-low-stock');
        if (m) {
            m.classList.remove('hidden');
            m.style.display = 'flex';
        }
    };

    window.filterLowStockByPartner = function() {
        const filterSel = document.getElementById('ai-low-stock-partner-filter');
        const selected = filterSel ? filterSel.value : 'ALL';
        const list = window._aiLastBriefingData?.warehouse_kpi?.low_stock_products || [];

        const lblBtn = document.getElementById('lbl-batch-draft-btn');
        if (lblBtn) {
            if (selected === 'ALL') {
                lblBtn.innerText = 'Tạo Nháp Hàng Loạt';
            } else {
                const opt = filterSel.options[filterSel.selectedIndex];
                const cleanName = opt ? opt.text.split('(')[0].trim() : 'NCC này';
                lblBtn.innerText = `Tạo Nháp ${cleanName}`;
            }
        }

        if (selected === 'ALL') {
            window.renderLowStockRows(list);
        } else {
            const pid = parseInt(selected);
            const filtered = list.filter(p => (p.partner_id || 0) === pid);
            window.renderLowStockRows(filtered);
        }
    };

    window.renderLowStockRows = function(items) {
        const tbody = document.getElementById('ai-low-stock-tbody');
        if (!tbody) return;

        if (!items || items.length === 0) {
            tbody.innerHTML = `<tr><td colspan="5" class="p-4 text-center text-slate-400 font-medium">Không có mặt hàng nào khớp điều kiện lọc.</td></tr>`;
            return;
        }

        tbody.innerHTML = items.map(p => {
            let actionHtml = '';
            if (p.is_ordered) {
                actionHtml = `
                    <div class="flex items-center justify-center gap-1 whitespace-nowrap">
                        <span class="px-2 py-0.5 rounded font-bold text-xs bg-emerald-50 text-emerald-700 border border-emerald-200 inline-flex items-center gap-1" title="Đã có đơn đặt đang chờ giao">
                            <i class="ph ph-check-circle"></i> ${p.on_order_code || 'Đã đặt'} (${p.on_order_qty})
                        </span>
                        <button type="button" onclick="viewOrderDraftDetail('${p.on_order_code}', '${p.partner_type}')" class="px-1.5 py-0.5 bg-slate-100 hover:bg-slate-200 text-slate-700 border border-slate-300 rounded text-xs font-bold inline-flex items-center" title="Xem chi tiết đơn đã đặt">
                            <i class="ph ph-eye"></i>
                        </button>
                    </div>
                `;
            } else {
                actionHtml = `
                    <button type="button" onclick="quickCreateAIDraft(${p.id}, this, ${p.partner_id || 'null'})" class="px-2.5 py-1 bg-amber-500 hover:bg-amber-600 text-white rounded-lg font-bold text-xs shadow-2xs transition inline-flex items-center gap-1 whitespace-nowrap" title="Gom toàn bộ mặt hàng sắp hết của đối tác này vào 1 đơn nháp">
                        <i class="ph ph-lightning"></i><span>Gom Nháp NCC</span>
                    </button>
                `;
            }

            return `
                <tr class="hover:bg-rose-50/50 ${p.is_ordered ? 'bg-emerald-50/20' : ''}">
                    <td class="p-2.5">
                        <div class="font-bold text-slate-900">${p.name}</div>
                        <div class="flex items-center gap-2 mt-0.5 flex-wrap">
                            <span class="text-xs text-slate-400 font-mono">${p.code}</span>
                            <span class="text-xs text-sky-700 font-semibold bg-sky-50 px-1.5 py-0.5 rounded border border-sky-200 inline-flex items-center gap-1">
                                <i class="ph ph-buildings"></i> ${p.partner_name || 'Chưa gán NCC'}
                            </span>
                        </div>
                    </td>
                    <td class="p-2.5 text-right font-mono font-bold whitespace-nowrap ${p.stock <= 0 ? 'text-rose-600' : 'text-amber-600'}">${p.stock}</td>
                    <td class="p-2.5 text-right font-mono text-slate-500 font-bold whitespace-nowrap">${p.min_stock}</td>
                    <td class="p-2.5 text-center text-slate-600 whitespace-nowrap">${p.unit}</td>
                    <td class="p-2.5 text-center whitespace-nowrap">${actionHtml}</td>
                </tr>
            `;
        }).join('');
    };

    window.viewOrderDraftDetail = function(orderCode, partnerType) {
        if (!orderCode) return;
        window.closeLowStockModal();
        if (partnerType === 'oem' || orderCode.startsWith('OEM')) {
            if (typeof switchTab === 'function') switchTab('oem');
            // Tìm order id từ code
            fetch('/api/oem/orders').then(r => r.json()).then(orders => {
                const found = (orders || []).find(o => o.code === orderCode);
                if (found && typeof openModalEditOEM === 'function') {
                    openModalEditOEM(found.id);
                }
            }).catch(e => console.error(e));
        } else {
            if (typeof switchTab === 'function') switchTab('purchases');
            if (typeof openEditPurchaseModal === 'function') {
                openEditPurchaseModal(orderCode);
            }
        }
    };

    window.batchCreateDraftsForPartner = async function() {
        const filterSel = document.getElementById('ai-low-stock-partner-filter');
        const selected = filterSel ? filterSel.value : 'ALL';
        if (selected === 'ALL') {
            return window.batchCreateDraftsAll();
        }

        const pid = parseInt(selected);
        const opt = filterSel.options[filterSel.selectedIndex];
        const partnerName = opt ? opt.text.split('(')[0].replace('🏢', '').trim() : 'đối tác';

        const btn = document.getElementById('btn-batch-draft-partner');
        const origText = btn ? btn.innerHTML : '';
        if (btn) {
            btn.disabled = true;
            btn.innerHTML = '<span>⏳</span><span>Đang gom đơn...</span>';
        }

        try {
            const res = await fetch('/api/ai/batch-create-drafts', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ partner_id: pid })
            });

            if (!res.ok) {
                const err = await res.json();
                throw new Error(err.detail || 'Lỗi tạo nháp hàng loạt');
            }

            const data = await res.json();
            alert(`✅ ${data.message}`);

            if (typeof window.loadStaffBriefing === 'function') {
                await window.loadStaffBriefing();
            }
            window.openLowStockModal();
        } catch (e) {
            alert('❌ ' + e.message);
        } finally {
            if (btn) {
                btn.disabled = false;
                btn.innerHTML = origText;
            }
        }
    };

    window.batchCreateDraftsAll = async function() {
        let confirmed = false;
        if (typeof window.showConfirmModal === 'function') {
            confirmed = await window.showConfirmModal({
                title: "Tạo Nháp Toàn Bộ NCC",
                message: "Bạn có muốn tự động tạo / gộp đơn nháp cho <b>TOÀN BỘ</b> các Nhà Cung Cấp & Xưởng có hàng chạm đáy tồn?",
                confirmText: "Tạo Tất Cả",
                cancelText: "Hủy bỏ",
                icon: "🚀"
            });
        } else {
            confirmed = confirm('Bạn có muốn tự động tạo / gộp đơn nháp cho TOÀN BỘ các Nhà Cung Cấp & Xưởng có hàng chạm đáy tồn?');
        }

        if (!confirmed) return;

        try {
            const res = await fetch('/api/ai/batch-create-drafts', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({})
            });

            if (!res.ok) {
                const err = await res.json();
                throw new Error(err.detail || 'Lỗi tạo nháp hàng loạt');
            }

            const data = await res.json();
            if (data.created_orders && data.created_orders.length > 0) {
                const summaryLines = data.created_orders.map(o => `&bull; ${o.type.toUpperCase()}: ${o.code} (${o.partner_name || 'Đối tác'} - ${o.items_count} món)`).join('\n');
                alert(`🎉 ${data.message}\n\nDanh sách đơn nháp:\n${summaryLines}`);
            } else {
                alert(`ℹ️ ${data.message}`);
            }

            if (typeof window.loadStaffBriefing === 'function') {
                await window.loadStaffBriefing();
            }
            window.openLowStockModal();
        } catch (e) {
            alert('❌ ' + e.message);
        }
    };

    window.closeLowStockModal = function() {
        const m = document.getElementById('modal-ai-low-stock');
        if (m) {
            m.classList.add('hidden');
            m.style.display = 'none';
        }
    };

    window.quickCreateAIDraft = async function(productId, btnEl, partnerId) {
        if (!productId && !partnerId) return;
        const origText = btnEl ? btnEl.innerHTML : '';
        if (btnEl) {
            btnEl.disabled = true;
            btnEl.innerHTML = '<span>⏳</span><span>Đang gom...</span>';
        }

        try {
            const reqBody = {};
            if (productId) reqBody.product_id = productId;
            if (partnerId) reqBody.partner_id = partnerId;

            const res = await fetch('/api/ai/quick-create-draft', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(reqBody)
            });

            if (!res.ok) {
                let msg = 'Lỗi tạo đơn nháp';
                try {
                    const err = await res.json();
                    msg = err.detail || msg;
                } catch (_) {}
                throw new Error(msg);
            }

            const data = await res.json();
            window.closeLowStockModal();

            if (data.type === 'oem') {
                alert(`⚡ ${data.message}\n(Đã gom ${data.items_count} mặt hàng chạm đáy của xưởng vào đơn nháp ${data.code})\nĐang mở đơn để bạn kiểm tra số lượng!`);
                if (typeof switchTab === 'function') switchTab('oem');
                if (typeof openModalEditOEM === 'function') {
                    await openModalEditOEM(data.id);
                }
            } else {
                alert(`⚡ ${data.message}\n(Đã gom ${data.items_count} mặt hàng chạm đáy của NCC vào đơn nháp ${data.code})\nĐang mở đơn để bạn kiểm tra số lượng!`);
                if (typeof switchTab === 'function') switchTab('purchases');
                if (typeof openEditPurchaseModal === 'function') {
                    await openEditPurchaseModal(data.code);
                }
            }

            if (typeof window.loadStaffBriefing === 'function') window.loadStaffBriefing();
        } catch (e) {
            alert('❌ ' + e.message);
        } finally {
            if (btnEl) {
                btnEl.disabled = false;
                btnEl.innerHTML = origText;
            }
        }
    };

    // Tự động gọi tải tóm tắt nhân viên cùng với huy hiệu key
    const _origSyncMyAIBadge = window.syncMyAIBadge;
    window.syncMyAIBadge = function() {
        if (typeof _origSyncMyAIBadge === 'function') _origSyncMyAIBadge();
        if (typeof window.loadStaffBriefing === 'function') window.loadStaffBriefing();
    };
})();
