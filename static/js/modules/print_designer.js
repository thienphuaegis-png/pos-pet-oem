/**
 * print_designer.js - Trình Thiết Kế Mẫu In Toàn Năng WYSIWYG + Token Chips
 * Hỗ trợ 6 nhóm chứng từ: POS Retail, B2B, Gia công OEM, Nhập hàng, Thu chi, Spa
 */

(function() {
    let currentDocType = 'pos_retail';
    let currentPaperSize = 'K80';
    let currentOrientation = 'portrait';
    let currentTokensList = [];
    let currentSampleData = {};
    let isSourceMode = false;
    let currentZoom = 100;

    // Kho mẫu gợi ý có sẵn (1-Click Presets)
    const DOCUMENT_PRESETS = {
        pos_retail: [
            { name: "Mẫu Bán Lẻ K80 Chuẩn (Có VietQR)", paper: "K80", orientation: "portrait" },
            { name: "Mẫu Bán Lẻ K58 Nhỏ Gọn", paper: "K58", orientation: "portrait" },
            { name: "Mẫu Hóa Đơn A5 Bán Lẻ Sang Trọng", paper: "A5", orientation: "portrait" }
        ],
        pos_b2b: [
            { name: "Mẫu Bán Sỉ / Đại Lý A4 Dọc (3 Chữ Ký)", paper: "A4", orientation: "portrait" },
            { name: "Mẫu Hóa Đơn Đại Lý A4 Ngang (Bảng Chi Tiết)", paper: "A4", orientation: "landscape" }
        ],
        oem_order: [
            { name: "Phụ Lục Hợp Đồng Đặt Xưởng OEM A4 Dọc", paper: "A4", orientation: "portrait" },
            { name: "Lệnh Sản Xuất & Bàn Giao Xưởng A4 Ngang", paper: "A4", orientation: "landscape" }
        ],
        purchase_order: [
            { name: "Phiếu Nhập Kho Nhà Cung Cấp A4 Dọc", paper: "A4", orientation: "portrait" },
            { name: "Phiếu Nhập Hàng Nhanh K80", paper: "K80", orientation: "portrait" }
        ],
        cashbook_voucher: [
            { name: "Phiếu Thu / Chi K80 In Nhiệt Nhanh", paper: "K80", orientation: "portrait" },
            { name: "Phiếu Thu / Chi A5 Kế Toán (2 Liên)", paper: "A5", orientation: "landscape" }
        ],
        spa_intake: [
            { name: "Phiếu Tiếp Nhận Thú Cưng Spa K80", paper: "K80", orientation: "portrait" }
        ]
    };

    // Khởi tạo trình soạn thảo khi mở tab Mẫu in
    window.initUniversalPrintDesigner = async function() {
        populateDocTypeSelect();
        setupEditorEventListeners();
        await loadDocumentTemplate(currentDocType);
    };

    function populateDocTypeSelect() {
        const sel = document.getElementById('print-designer-doc-type');
        if (!sel) return;
        sel.value = currentDocType;
        updatePresetsDropdown(currentDocType);
    }

    function updatePresetsDropdown(docType) {
        const selPreset = document.getElementById('print-designer-preset-select');
        if (!selPreset) return;
        const presets = DOCUMENT_PRESETS[docType] || [];
        selPreset.innerHTML = '<option value="">-- Chọn mẫu gợi ý --</option>' +
            presets.map((p, idx) => `<option value="${idx}">${p.name} (${p.paper})</option>`).join('');
    }

    // 1. TẢI MẪU IN TỪ SERVER
    window.loadDocumentTemplate = async function(docType) {
        currentDocType = docType;
        updatePresetsDropdown(docType);

        try {
            // Tải template & tokens
            const res = await fetch(`/api/settings/print-templates/${docType}`);
            const data = await res.json();
            currentTokensList = data.tokens || [];
            currentPaperSize = data.paper_size || 'K80';
            currentOrientation = data.orientation || 'portrait';

            // Đồng bộ bộ chọn khổ giấy trên UI
            const paperSel = document.getElementById('print-designer-paper-size');
            if (paperSel) paperSel.value = currentPaperSize;
            updateOrientationButtonsUI();

            // Tải sample data
            const sampleRes = await fetch(`/api/settings/print-templates/${docType}/sample-data`);
            currentSampleData = await sampleRes.json();

            // Đưa HTML vào editor và biến đổi token thành chip
            setEditorRawHTML(data.content_html);

            // Cập nhật Live Preview
            renderLivePreview();
            populateTokenPickerModal();
        } catch (e) {
            console.error("Lỗi tải mẫu in:", e);
        }
    };

    // Chuyển {{token_key}} -> thẻ chip trực quan
    function convertTagsToChips(html) {
        let res = html;
        currentTokensList.forEach(t => {
            const regex = new RegExp(`\\{\\{${t.key}\\}\\}`, 'g');
            const chipHtml = `<span class="print-token-chip inline-flex items-center gap-1 bg-sky-100 text-sky-800 border border-sky-300 rounded px-1.5 py-0.5 text-xs font-mono font-bold mx-0.5 select-none" data-token="${t.key}" contenteditable="false">[${t.label}]<button type="button" onclick="this.parentElement.remove(); renderLivePreview();" class="text-sky-500 hover:text-rose-600 font-bold ml-0.5 text-[10px]">✕</button></span>`;
            res = res.replace(regex, chipHtml);
        });
        return res;
    }

    // Chuyển thẻ chip -> {{token_key}} để lưu vào DB
    function convertChipsToTags(html) {
        const temp = document.createElement('div');
        temp.innerHTML = html;
        const chips = temp.querySelectorAll('.print-token-chip');
        chips.forEach(c => {
            const key = c.getAttribute('data-token');
            if (key) {
                const textNode = document.createTextNode(`{{${key}}}`);
                c.parentNode.replaceChild(textNode, c);
            }
        });
        return temp.innerHTML;
    }

    function setEditorRawHTML(rawHtml) {
        const editor = document.getElementById('wysiwyg-content-area');
        const sourceArea = document.getElementById('wysiwyg-source-textarea');
        const chipsHtml = convertTagsToChips(rawHtml);

        if (editor) editor.innerHTML = chipsHtml;
        if (sourceArea) sourceArea.value = rawHtml;
    }

    function getEditorRawHTML() {
        if (isSourceMode) {
            return document.getElementById('wysiwyg-source-textarea')?.value || '';
        }
        const editor = document.getElementById('wysiwyg-content-area');
        return convertChipsToTags(editor ? editor.innerHTML : '');
    }

    // 2. LIVE PREVIEW RENDERER
    window.renderLivePreview = function() {
        const paper = document.getElementById('wysiwyg-live-paper');
        if (!paper) return;

        let html = getEditorRawHTML();

        // Thay thế tokens bằng sample data
        for (const [k, v] of Object.entries(currentSampleData)) {
            if (k === 'danh_sach_hang' && Array.isArray(v)) {
                // Xử lý vòng lặp danh sách hàng
                const loopRegex = /\{\{#danh_sach_hang\}\}([\s\S]*?)\{\{\/danh_sach_hang\}\}/g;
                html = html.replace(loopRegex, (match, templateRow) => {
                    return v.map(item => {
                        let rowHtml = templateRow;
                        for (const [ik, iv] of Object.entries(item)) {
                            rowHtml = rowHtml.replace(new RegExp(`\\{\\{${ik}\\}\\}`, 'g'), iv);
                        }
                        return rowHtml;
                    }).join('');
                });
            } else {
                html = html.replace(new RegExp(`\\{\\{${k}\\}\\}`, 'g'), v);
            }
        }

        // Định dạng khổ giấy
        const paperDimensions = {
            K58: { width: '58mm', minHeight: '120mm' },
            K80: { width: '80mm', minHeight: '160mm' },
            A5: currentOrientation === 'landscape' ? { width: '210mm', minHeight: '148mm' } : { width: '148mm', minHeight: '210mm' },
            A4: currentOrientation === 'landscape' ? { width: '297mm', minHeight: '210mm' } : { width: '210mm', minHeight: '297mm' }
        };

        const dim = paperDimensions[currentPaperSize] || paperDimensions.K80;
        paper.style.width = dim.width;
        paper.style.minHeight = dim.minHeight;
        paper.style.transform = `scale(${currentZoom / 100})`;
        paper.style.transformOrigin = 'top center';
        paper.innerHTML = html;
    };

    // 3. THANH CÔNG CỤ TOOLBAR WYSIWYG
    window.execEditorCmd = function(cmd, value = null) {
        if (isSourceMode) return;
        document.execCommand(cmd, false, value);
        renderLivePreview();
    };

    window.toggleSourceMode = function() {
        isSourceMode = !isSourceMode;
        const editor = document.getElementById('wysiwyg-content-area');
        const sourceArea = document.getElementById('wysiwyg-source-textarea');
        const btnSource = document.getElementById('btn-toolbar-source');

        if (isSourceMode) {
            sourceArea.value = convertChipsToTags(editor.innerHTML);
            editor.classList.add('hidden');
            sourceArea.classList.remove('hidden');
            if (btnSource) btnSource.classList.add('bg-sky-600', 'text-white');
        } else {
            editor.innerHTML = convertTagsToChips(sourceArea.value);
            sourceArea.classList.add('hidden');
            editor.classList.remove('hidden');
            if (btnSource) btnSource.classList.remove('bg-sky-600', 'text-white');
        }
        renderLivePreview();
    };

    // 4. CHÈN TOKEN (TOKEN PICKER)
    window.openTokenPickerModal = function() {
        populateTokenPickerModal();
        document.getElementById('modal-print-token-picker')?.classList.remove('hidden');
    };

    window.closeTokenPickerModal = function() {
        document.getElementById('modal-print-token-picker')?.classList.add('hidden');
    };

    function populateTokenPickerModal(filterText = '', activeGroup = 'ALL') {
        const groupListEl = document.getElementById('token-picker-groups');
        const tableBodyEl = document.getElementById('token-picker-tbody');
        if (!tableBodyEl) return;

        // Nhóm tokens
        const groups = ['ALL', ...new Set(currentTokensList.map(t => t.group || 'Chung'))];
        if (groupListEl) {
            groupListEl.innerHTML = groups.map(g => `
                <button type="button" onclick="filterTokensByGroup('${g}', this)" class="token-group-btn text-left px-2.5 py-1.5 rounded-lg text-xs font-semibold transition ${g === activeGroup ? 'bg-sky-100 text-sky-800 font-bold' : 'text-slate-600 hover:bg-slate-100'}">
                    ${g === 'ALL' ? 'Tất cả' : g}
                </button>
            `).join('');
        }

        const q = filterText.toLowerCase().trim();
        const filtered = currentTokensList.filter(t => {
            const matchGroup = activeGroup === 'ALL' || (t.group || 'Chung') === activeGroup;
            const matchText = !q || t.label.toLowerCase().includes(q) || t.key.toLowerCase().includes(q);
            return matchGroup && matchText;
        });

        tableBodyEl.innerHTML = filtered.map(t => `
            <tr class="border-b hover:bg-slate-50 text-xs">
                <td class="p-2 font-bold text-slate-800">[${t.label}]</td>
                <td class="p-2 font-mono text-[11px] text-slate-500">{{${t.key}}}</td>
                <td class="p-2 text-slate-500">${t.group || 'Chung'}</td>
                <td class="p-2 text-right">
                    <button type="button" onclick="insertTokenIntoEditor('${t.key}', '${t.label}')" class="px-2 py-1 bg-sky-600 hover:bg-sky-700 text-white rounded text-[11px] font-bold shadow-2xs">
                        + Chèn
                    </button>
                </td>
            </tr>
        `).join('');
    }

    window.filterTokensByGroup = function(group, btn) {
        document.querySelectorAll('.token-group-btn').forEach(b => b.classList.remove('bg-sky-100', 'text-sky-800', 'font-bold'));
        if (btn) btn.classList.add('bg-sky-100', 'text-sky-800', 'font-bold');
        const searchInput = document.getElementById('token-picker-search-input');
        populateTokenPickerModal(searchInput ? searchInput.value : '', group);
    };

    window.onTokenSearchInput = function(val) {
        populateTokenPickerModal(val);
    };

    window.insertTokenIntoEditor = function(key, label) {
        closeTokenPickerModal();
        const chipHtml = `<span class="print-token-chip inline-flex items-center gap-1 bg-sky-100 text-sky-800 border border-sky-300 rounded px-1.5 py-0.5 text-xs font-mono font-bold mx-0.5 select-none" data-token="${key}" contenteditable="false">[${label}]<button type="button" onclick="this.parentElement.remove(); renderLivePreview();" class="text-sky-500 hover:text-rose-600 font-bold ml-0.5 text-[10px]">✕</button></span>&nbsp;`;
        
        if (isSourceMode) {
            const ta = document.getElementById('wysiwyg-source-textarea');
            if (ta) {
                const pos = ta.selectionStart || ta.value.length;
                ta.value = ta.value.substring(0, pos) + `{{${key}}}` + ta.value.substring(pos);
            }
        } else {
            const editor = document.getElementById('wysiwyg-content-area');
            if (editor) {
                editor.focus();
                document.execCommand('insertHTML', false, chipHtml);
            }
        }
        renderLivePreview();
    };

    // 5. THAO TÁC KHỔ GIẤY & ZOOM
    window.onPaperSizeChange = function(newSize) {
        currentPaperSize = newSize;
        renderLivePreview();
    };

    window.setOrientation = function(orient) {
        currentOrientation = orient;
        updateOrientationButtonsUI();
        renderLivePreview();
    };

    function updateOrientationButtonsUI() {
        const btnPortrait = document.getElementById('btn-orient-portrait');
        const btnLandscape = document.getElementById('btn-orient-landscape');
        if (btnPortrait) btnPortrait.classList.toggle('bg-sky-600', currentOrientation === 'portrait');
        if (btnPortrait) btnPortrait.classList.toggle('text-white', currentOrientation === 'portrait');
        if (btnLandscape) btnLandscape.classList.toggle('bg-sky-600', currentOrientation === 'landscape');
        if (btnLandscape) btnLandscape.classList.toggle('text-white', currentOrientation === 'landscape');
    }

    window.onZoomChange = function(val) {
        currentZoom = parseInt(val) || 100;
        const zoomText = document.getElementById('zoom-percentage-text');
        if (zoomText) zoomText.textContent = currentZoom + '%';
        renderLivePreview();
    };

    // 6. CHỌN MẪU GỢI Ý (PRESET)
    window.onPresetSelectChange = function(presetIdx) {
        if (presetIdx === '') return;
        const presets = DOCUMENT_PRESETS[currentDocType] || [];
        const p = presets[parseInt(presetIdx)];
        if (!p) return;

        if (confirm(`Áp dụng mẫu gợi ý: "${p.name}"? (Các chỉnh sửa chưa lưu sẽ được thay bằng mẫu này)`)) {
            currentPaperSize = p.paper;
            currentOrientation = p.orientation;
            document.getElementById('print-designer-paper-size').value = p.paper;
            updateOrientationButtonsUI();
            
            // Lấy mẫu mặc định của loại đó
            fetch(`/api/settings/print-templates/${currentDocType}`)
                .then(r => r.json())
                .then(data => {
                    setEditorRawHTML(data.content_html);
                    renderLivePreview();
                });
        }
    };

    // 7. LƯU MẪU IN
    window.saveUniversalPrintTemplate = async function() {
        const rawHtml = getEditorRawHTML();
        try {
            const res = await fetch(`/api/settings/print-templates/${currentDocType}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    content_html: rawHtml,
                    paper_size: currentPaperSize,
                    orientation: currentOrientation
                })
            });
            const data = await res.json();
            if (res.ok) {
                alert('✅ Đã lưu mẫu in thành công!');
            } else {
                throw new Error(data.detail || 'Lỗi lưu mẫu');
            }
        } catch (e) {
            alert('❌ Lỗi: ' + e.message);
        }
    };

    // 8. ĐẶT LẠI MẪU GỐC
    window.resetUniversalPrintTemplate = function() {
        if (!confirm('Khôi phục mẫu in gốc của hệ thống?')) return;
        loadDocumentTemplate(currentDocType);
    };

    // 9. IN THỬ NGAY TRÊN TRÌNH DUYỆT
    window.testPrintCurrentTemplate = function() {
        const paper = document.getElementById('wysiwyg-live-paper');
        if (!paper) return;

        const printWindow = window.open('', '_blank');
        printWindow.document.write(`
            <!DOCTYPE html>
            <html>
            <head>
                <meta charset="utf-8">
                <title>In Thử Mẫu</title>
                <style>
                    @page { size: ${currentPaperSize} ${currentOrientation}; margin: 0; }
                    body { margin: 0; padding: 4px; font-family: sans-serif; }
                </style>
            </head>
            <body>
                ${paper.innerHTML}
                <script>
                    window.onload = function() { window.print(); window.close(); }
                </script>
            </body>
            </html>
        `);
        printWindow.document.close();
    };

    function setupEditorEventListeners() {
        const editor = document.getElementById('wysiwyg-content-area');
        if (!editor) return;

        // Lắng nghe phím gõ / để chèn token
        editor.addEventListener('keyup', function(e) {
            renderLivePreview();
        });

        editor.addEventListener('keydown', function(e) {
            if (e.key === '/') {
                // Có thể mở token picker
            }
        });
    }

})();
