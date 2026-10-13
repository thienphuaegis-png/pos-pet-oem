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

        const typeBadges = {
            pos_order: '<span class="px-2.5 py-1 rounded-full text-xs font-bold bg-sky-100 text-sky-800 border border-sky-200">🛒 Đơn Bán Lẻ POS</span>',
            purchase_order: '<span class="px-2.5 py-1 rounded-full text-xs font-bold bg-amber-100 text-amber-800 border border-amber-200">📥 Hóa Đơn Nhập Hàng (PN)</span>',
            oem_order: '<span class="px-2.5 py-1 rounded-full text-xs font-bold bg-purple-100 text-purple-800 border border-purple-200">🏭 Đơn Gia Công OEM</span>',
            cashflow_voucher: '<span class="px-2.5 py-1 rounded-full text-xs font-bold bg-emerald-100 text-emerald-800 border border-emerald-200">💰 Phiếu Thu/Chi Sổ Quỹ</span>'
        };

        const badgeEl = document.getElementById('ai-agent-type-badge');
        if (badgeEl) badgeEl.innerHTML = typeBadges[data.detected_type] || `<span class="px-2.5 py-1 rounded-full text-xs font-bold bg-slate-100 text-slate-700">${data.detected_type}</span>`;

        const partnerEl = document.getElementById('ai-agent-partner-name');
        if (partnerEl) partnerEl.value = data.partner_name || '';

        const dateEl = document.getElementById('ai-agent-date');
        if (dateEl) dateEl.value = data.date || new Date().toISOString().split('T')[0];

        const totalEl = document.getElementById('ai-agent-total');
        if (totalEl) totalEl.textContent = formatMoney(data.total_amount || 0);

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
        const btnPOS = document.getElementById('btn-ai-push-pos');
        const btnPO = document.getElementById('btn-ai-create-po');
        const btnOEM = document.getElementById('btn-ai-create-oem');
        const btnCash = document.getElementById('btn-ai-create-cash');

        if (btnPOS) btnPOS.classList.toggle('hidden', data.detected_type !== 'pos_order');
        if (btnPO) btnPO.classList.toggle('hidden', data.detected_type !== 'purchase_order');
        if (btnOEM) btnOEM.classList.toggle('hidden', data.detected_type !== 'oem_order');
        if (btnCash) btnCash.classList.toggle('hidden', data.detected_type !== 'cashflow_voucher');
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
    window.createAIOEMOrder = function() {
        if (!currentAIResult) return;
        if (typeof switchTab === 'function') switchTab('oem');
        alert('✅ Đã mở tab Gia Công OEM để tiếp tục xử lý đơn xưởng!');
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
})();
