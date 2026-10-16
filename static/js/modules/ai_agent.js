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
})();
