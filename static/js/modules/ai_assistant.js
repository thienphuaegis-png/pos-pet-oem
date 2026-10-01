/**
 * AI Assistant Module - Hỗ trợ thao tác nhanh, bóc tách hóa đơn chuyển khoản & lệnh thu chi tự nhiên
 */

(function() {
    let currentAIParsedData = null;
    let currentAIImageBase64 = null;

    // Lắng nghe sự kiện Paste (Ctrl + V) toàn cục khi đang ở tab Sổ Quỹ
    document.addEventListener('paste', function(e) {
        const activeTab = document.getElementById('tab-cashbook');
        if (!activeTab || activeTab.classList.contains('hidden')) return;

        const clipboardData = e.clipboardData || window.clipboardData;
        if (!clipboardData || !clipboardData.items) return;

        for (let i = 0; i < clipboardData.items.length; i++) {
            const item = clipboardData.items[i];
            if (item.type.indexOf('image') !== -1) {
                const blob = item.getAsFile();
                const reader = new FileReader();
                reader.onload = function(evt) {
                    const b64 = evt.target.result;
                    processAIBillImage(b64, item.type);
                };
                reader.readAsDataURL(blob);
                e.preventDefault();
                break;
            }
        }
    });

    window.openAICashflowAssistant = function() {
        const modal = document.getElementById('modal-ai-cashflow-assistant');
        if (modal) modal.classList.remove('hidden');
    };

    window.closeAICashflowAssistant = function() {
        const modal = document.getElementById('modal-ai-cashflow-assistant');
        if (modal) modal.classList.add('hidden');
    };

    window.handleAIBillFileSelect = function(e) {
        const file = e.target.files && e.target.files[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = function(evt) {
            processAIBillImage(evt.target.result, file.type);
        };
        reader.readAsDataURL(file);
    };

    window.processAIBillImage = async function(base64Str, mimeType) {
        currentAIImageBase64 = base64Str;
        openAICashflowAssistant();
        
        // Cập nhật UI hiển thị đang xử lý
        showAILoadingState(true, "AI đang nhận diện & bóc tách hóa đơn chuyển khoản...");
        renderAIPreview(base64Str, "image");

        try {
            const res = await fetch('/api/ai/parse-cashflow', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    image_base64: base64Str,
                    mime_type: mimeType || 'image/jpeg'
                })
            });

            const data = await res.json();
            if (!res.ok) {
                throw new Error(data.detail || "Không thể phân tích ảnh");
            }

            currentAIParsedData = data;
            renderAIParsedResult(data);
        } catch (err) {
            showAIError(err.message);
        } finally {
            showAILoadingState(false);
        }
    };

    window.executeAICashCommand = async function() {
        const input = document.getElementById('ai-cash-command-input');
        const text = (input ? input.value : '').trim();
        if (!text) {
            if (window.showToast) window.showToast("Vui lòng nhập câu lệnh hoặc dán ảnh bill", "warning");
            return;
        }

        openAICashflowAssistant();
        showAILoadingState(true, "AI đang phân tích câu lệnh thu chi...");
        renderAIPreview(text, "text");

        try {
            const res = await fetch('/api/ai/parse-cashflow', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ text: text })
            });

            const data = await res.json();
            if (!res.ok) {
                throw new Error(data.detail || "Không thể phân tích câu lệnh");
            }

            currentAIParsedData = data;
            renderAIParsedResult(data);
        } catch (err) {
            showAIError(err.message);
        } finally {
            showAILoadingState(false);
        }
    };

    function showAILoadingState(isLoading, message) {
        const loadingBox = document.getElementById('ai-result-loading');
        const formBox = document.getElementById('ai-result-form');
        const emptyBox = document.getElementById('ai-result-empty');
        const errorBox = document.getElementById('ai-result-error');
        const msgEl = document.getElementById('ai-loading-message');

        if (errorBox) errorBox.classList.add('hidden');

        if (isLoading) {
            if (loadingBox) loadingBox.classList.remove('hidden');
            if (formBox) formBox.classList.add('hidden');
            if (emptyBox) emptyBox.classList.add('hidden');
            if (msgEl && message) msgEl.innerText = message;
        } else {
            if (loadingBox) loadingBox.classList.add('hidden');
        }
    }

    function showAIError(msg) {
        const errorBox = document.getElementById('ai-result-error');
        const formBox = document.getElementById('ai-result-form');
        const emptyBox = document.getElementById('ai-result-empty');

        if (formBox) formBox.classList.add('hidden');
        if (emptyBox) emptyBox.classList.add('hidden');
        if (errorBox) {
            errorBox.classList.remove('hidden');
            document.getElementById('ai-error-message').innerText = msg;
        }
    }

    function renderAIPreview(content, type) {
        const imgEl = document.getElementById('ai-preview-image');
        const textEl = document.getElementById('ai-preview-text');
        const container = document.getElementById('ai-preview-container');

        if (type === 'image') {
            if (imgEl) {
                imgEl.src = content;
                imgEl.classList.remove('hidden');
            }
            if (textEl) textEl.classList.add('hidden');
        } else {
            if (imgEl) imgEl.classList.add('hidden');
            if (textEl) {
                textEl.innerText = `"${content}"`;
                textEl.classList.remove('hidden');
            }
        }
    }

    function renderAIParsedResult(data) {
        const formBox = document.getElementById('ai-result-form');
        const emptyBox = document.getElementById('ai-result-empty');
        if (formBox) formBox.classList.remove('hidden');
        if (emptyBox) emptyBox.classList.add('hidden');

        // 1. Cảnh báo trùng bill nếu có
        const dupWarning = document.getElementById('ai-dup-warning');
        if (dupWarning) {
            if (data.is_duplicate) {
                dupWarning.classList.remove('hidden');
                dupWarning.innerHTML = `<span>⚠️</span> <span>${data.duplicate_warning}</span>`;
            } else {
                dupWarning.classList.add('hidden');
            }
        }

        // 2. Loại giao dịch (Thu / Chi)
        window.setAICashType(data.type || 'in');

        // 3. Số tiền
        const amountInput = document.getElementById('ai-amount-input');
        if (amountInput) amountInput.value = data.amount || 0;

        // 4. Danh sách tài khoản thanh toán
        const accSelect = document.getElementById('ai-account-select');
        if (accSelect && data.available_accounts) {
            accSelect.innerHTML = data.available_accounts.map(a => `
                <option value="${a.id}" ${a.id === data.matched_account_id ? 'selected' : ''}>
                    ${a.type === 'bank' ? '🏦' : '💵'} ${a.name}
                </option>
            `).join('');
        }

        // 5. Hạng mục
        const catInput = document.getElementById('ai-category-input');
        if (catInput) catInput.value = data.category || (data.type === 'in' ? 'Thu tiền bán hàng' : 'Chi khác');

        // 6. Đối tác
        const contactInput = document.getElementById('ai-contact-display');
        const contactIdInput = document.getElementById('ai-contact-id');
        const partnerName = data.matched_contact_name || (data.type === 'in' ? data.sender_name : data.receiver_name) || '';
        if (contactInput) contactInput.value = partnerName;
        if (contactIdInput) contactIdInput.value = data.matched_contact_id || '';

        // 7. Mã giao dịch (Ref ID)
        const refInput = document.getElementById('ai-ref-input');
        if (refInput) refInput.value = data.transaction_code || '';

        // 8. Nội dung / Ghi chú
        const noteInput = document.getElementById('ai-note-input');
        if (noteInput) {
            let noteContent = data.note || '';
            if (data.bank_name) noteContent += ` [NH: ${data.bank_name}]`;
            if (data.transaction_code) noteContent += ` [Mã GD: ${data.transaction_code}]`;
            noteInput.value = noteContent.trim();
        }
    }

    window.setAICashType = function(type) {
        const btnIn = document.getElementById('btn-ai-type-in');
        const btnOut = document.getElementById('btn-ai-type-out');
        const typeVal = document.getElementById('ai-type-val');

        if (typeVal) typeVal.value = type;

        if (type === 'in') {
            if (btnIn) btnIn.className = "py-2 rounded-lg font-bold border text-center transition flex items-center justify-center gap-1.5 bg-emerald-50 border-emerald-500 text-emerald-700 shadow-2xs";
            if (btnOut) btnOut.className = "py-2 rounded-lg font-bold border text-center transition flex items-center justify-center gap-1.5 bg-slate-50 border-slate-200 text-slate-600 hover:bg-slate-100";
        } else {
            if (btnIn) btnIn.className = "py-2 rounded-lg font-bold border text-center transition flex items-center justify-center gap-1.5 bg-slate-50 border-slate-200 text-slate-600 hover:bg-slate-100";
            if (btnOut) btnOut.className = "py-2 rounded-lg font-bold border text-center transition flex items-center justify-center gap-1.5 bg-rose-50 border-rose-500 text-rose-700 shadow-2xs";
        }
    };

    window.confirmAICashEntry = async function() {
        const type = document.getElementById('ai-type-val')?.value || 'in';
        const amount = parseFloat(document.getElementById('ai-amount-input')?.value) || 0;
        const accountId = parseInt(document.getElementById('ai-account-select')?.value) || null;
        const category = (document.getElementById('ai-category-input')?.value || '').trim();
        const contactId = parseInt(document.getElementById('ai-contact-id')?.value) || null;
        const refId = (document.getElementById('ai-ref-input')?.value || '').trim();
        const note = (document.getElementById('ai-note-input')?.value || '').trim();

        if (amount <= 0) {
            alert("Số tiền phải lớn hơn 0!");
            return;
        }
        if (!category) {
            alert("Vui lòng nhập hoặc chọn hạng mục thu chi!");
            return;
        }

        const payload = {
            type: type,
            amount: amount,
            category: category,
            account_id: accountId,
            contact_id: contactId,
            ref_type: refId ? "bank_transfer" : "manual",
            ref_id: refId || null,
            note: note
        };

        const btnSubmit = document.getElementById('btn-ai-confirm-submit');
        if (btnSubmit) {
            btnSubmit.disabled = true;
            btnSubmit.innerText = "⏳ Đang ghi sổ...";
        }

        try {
            const res = await fetch('/api/cashbook', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });

            const data = await res.json();
            if (!res.ok) {
                throw new Error(data.detail || "Không thể tạo phiếu thu chi");
            }

            if (window.showToast) {
                window.showToast(`✅ Đã tạo ${type === 'in' ? 'Phiếu Thu' : 'Phiếu Chi'} [${data.code}] thành công!`, "success");
            } else {
                alert(`Đã tạo phiếu [${data.code}] thành công!`);
            }

            closeAICashflowAssistant();

            // Làm mới Sổ Quỹ
            if (typeof window.loadCashbook === 'function') {
                window.loadCashbook();
            }
            if (typeof window.loadCashbookAccounts === 'function') {
                window.loadCashbookAccounts();
            }

            // Xóa trắng ô lệnh
            const input = document.getElementById('ai-cash-command-input');
            if (input) input.value = '';
        } catch (e) {
            alert("Lỗi khi lưu phiếu: " + e.message);
        } finally {
            if (btnSubmit) {
                btnSubmit.disabled = false;
                btnSubmit.innerHTML = "🚀 Xác Nhận Ghi Sổ Quỹ";
            }
        }
    };

    window.transferToManualCashModal = function() {
        if (!currentAIParsedData) return;
        closeAICashflowAssistant();

        const d = currentAIParsedData;
        if (typeof window.openCreateCashModal === 'function') {
            window.openCreateCashModal(d.type || 'in');
            
            setTimeout(() => {
                const amtEl = document.getElementById('cash-amount-input');
                if (amtEl) amtEl.value = d.amount || 0;

                const catEl = document.getElementById('cash-category-input');
                if (catEl) catEl.value = d.category || '';

                const accEl = document.getElementById('cash-account-select');
                if (accEl && d.matched_account_id) accEl.value = d.matched_account_id;

                const noteEl = document.getElementById('cash-note-input');
                if (noteEl) {
                    let n = d.note || '';
                    if (d.transaction_code) n += ` [Mã GD: ${d.transaction_code}]`;
                    noteEl.value = n;
                }
            }, 100);
        }
    };

    // --- CẤU HÌNH AI GEMINI ---
    window.testAIKey = async function() {
        const key = (document.getElementById('cfg-gemini-key')?.value || '').trim();
        const model = document.getElementById('cfg-gemini-model')?.value || 'gemini-2.0-flash';
        const testResEl = document.getElementById('cfg-gemini-test-result');

        if (!key) {
            alert("Vui lòng nhập API Key để kiểm tra!");
            return;
        }

        if (testResEl) {
            testResEl.className = "p-2.5 rounded-lg text-xs border bg-sky-50 text-sky-800 border-sky-200 block";
            testResEl.innerHTML = "⏳ Đang gửi yêu cầu test đến Google Gemini API...";
        }

        const btn = document.getElementById('btn-test-ai-key');
        if (btn) {
            btn.disabled = true;
            btn.innerText = "Đang test...";
        }

        try {
            const res = await fetch('/api/ai/test-key', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    gemini_api_key: key,
                    gemini_model: model
                })
            });

            const data = await res.json();
            if (res.ok) {
                if (testResEl) {
                    testResEl.className = "p-2.5 rounded-lg text-xs border bg-emerald-50 text-emerald-800 border-emerald-300 block font-semibold";
                    testResEl.innerHTML = `✅ ${data.message}`;
                }
            } else {
                if (testResEl) {
                    testResEl.className = "p-2.5 rounded-lg text-xs border bg-rose-50 text-rose-800 border-rose-300 block font-semibold";
                    testResEl.innerHTML = `❌ ${data.detail || "Không thể xác thực Key"}`;
                }
            }
        } catch (e) {
            if (testResEl) {
                testResEl.className = "p-2.5 rounded-lg text-xs border bg-rose-50 text-rose-800 border-rose-300 block font-semibold";
                testResEl.innerHTML = `❌ Lỗi mạng: ${e.message}`;
            }
        } finally {
            if (btn) {
                btn.disabled = false;
                btn.innerText = "🔍 Kiểm Tra Key";
            }
        }
    };

    window.openAIConfigModal = async function() {
        const modal = document.getElementById('modal-ai-config');
        if (modal) modal.classList.remove('hidden');

        try {
            const res = await fetch('/api/ai/config');
            if (res.ok) {
                const data = await res.json();
                const keyInput = document.getElementById('cfg-gemini-key');
                const modelSelect = document.getElementById('cfg-gemini-model');
                const statusBadge = document.getElementById('cfg-gemini-status');

                if (modelSelect) modelSelect.value = data.model || 'gemini-2.0-flash';
                if (statusBadge) {
                    if (data.has_key) {
                        statusBadge.innerHTML = `<span class="text-emerald-600 font-bold">🟢 Đã kích hoạt (${data.masked_key})</span>`;
                    } else {
                        statusBadge.innerHTML = `<span class="text-amber-600 font-bold">🟡 Chưa cấu hình (Dùng Rule-based offline)</span>`;
                    }
                }
            }
        } catch (e) {
            console.error("Lỗi tải cấu hình AI:", e);
        }
    };

    window.closeAIConfigModal = function() {
        const modal = document.getElementById('modal-ai-config');
        if (modal) modal.classList.add('hidden');
    };

    window.saveAIConfig = async function() {
        const key = (document.getElementById('cfg-gemini-key')?.value || '').trim();
        const model = document.getElementById('cfg-gemini-model')?.value || 'gemini-2.0-flash';

        if (!key) {
            alert("Vui lòng nhập API Key từ Google AI Studio!");
            return;
        }

        try {
            const res = await fetch('/api/ai/config', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    gemini_api_key: key,
                    gemini_model: model
                })
            });

            if (res.ok) {
                alert("Đã lưu cấu hình AI Gemini thành công!");
                closeAIConfigModal();
            } else {
                const err = await res.json();
                alert("Lỗi: " + (err.detail || "Không thể lưu"));
            }
        } catch (e) {
            alert("Lỗi kết nối: " + e.message);
        }
    };

})();
