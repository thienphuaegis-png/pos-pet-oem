// =========================================================================
// CẨM NANG NGHIỆP VỤ ĐỘNG (10 SOP) — ANIMATED SIMULATOR & LIVE SPOTLIGHT TOUR
// Tự chứa 100% CSS (.gsim-*) để chạy mượt cả trên Web App lẫn Preview Iframe
// =========================================================================
(function () {
    var currentGuideKey = 'pos';
    var currentStepIdx = 0;
    var autoPlayTimer = null;
    var isAutoPlaying = false;
    var typingTimer = null;

    function injectGuideSimulatorStyles() {
        if (document.getElementById('elaya-guide-sim-styles')) return;
        const st = document.createElement('style');
        st.id = 'elaya-guide-sim-styles';
        st.textContent = `
            .gsim-root { font-family: 'Be Vietnam Pro', 'Inter', system-ui, -apple-system, sans-serif; color: #0f172a; font-size: 12px; line-height: 1.45; }
            .gsim-root * { box-sizing: border-box; }
            .gsim-tray { background: #f1f5f9; border: 1px solid #e2e8f0; border-radius: 16px; padding: 8px; margin-bottom: 12px; }
            .gsim-card { background: #ffffff; border: 1px solid #e2e8f0; border-radius: 8px; padding: 14px; }
            .gsim-header { display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: 12px; }
            .gsim-badges { display: flex; align-items: center; gap: 6px; margin-bottom: 4px; flex-wrap: wrap; }
            .gsim-badge-code { background: #f0f9ff; color: #0369a1; border: 1px solid #bae6fd; font-family: 'JetBrains Mono', monospace; font-weight: 700; font-size: 11px; padding: 2px 8px; border-radius: 6px; }
            .gsim-badge-role { background: #f1f5f9; color: #334155; border: 1px solid #e2e8f0; font-weight: 600; font-size: 11px; padding: 2px 8px; border-radius: 6px; }
            .gsim-title { font-size: 16px; font-weight: 700; color: #0f172a; margin: 2px 0; }
            .gsim-summary { font-size: 12px; color: #475569; margin: 0; }
            .gsim-btn-row { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
            .gsim-btn { display: inline-flex; align-items: center; gap: 6px; padding: 7px 12px; border-radius: 8px; font-size: 12px; font-weight: 700; border: 1px solid #cbd5e1; background: #ffffff; color: #1e293b; cursor: pointer; transition: all 0.15s ease; }
            .gsim-btn:hover { background: #f8fafc; border-color: #94a3b8; }
            .gsim-btn-play { background: #f59e0b; color: #ffffff; border-color: #d97706; }
            .gsim-btn-play:hover { background: #d97706; }
            .gsim-btn-play.playing { background: #e11d48; border-color: #be123c; }
            .gsim-btn-primary { background: #0284c7; color: #ffffff; border-color: #0369a1; box-shadow: inset 0 1px 0 rgba(255,255,255,0.22); }
            .gsim-btn-primary:hover { background: #0369a1; }
            .gsim-step-tabs { display: flex; flex-wrap: wrap; gap: 6px; margin: 10px 0; }
            .gsim-step-tab { display: inline-flex; align-items: center; gap: 6px; padding: 6px 11px; border-radius: 8px; font-size: 12px; font-weight: 700; border: 1px solid #e2e8f0; background: #f8fafc; color: #475569; cursor: pointer; transition: all 0.15s ease; }
            .gsim-step-tab:hover { background: #f0f9ff; border-color: #7dd3fc; color: #0369a1; }
            .gsim-step-tab.active { background: #0284c7; color: #ffffff; border-color: #0284c7; }
            .gsim-step-num { width: 20px; height: 20px; border-radius: 6px; display: inline-flex; align-items: center; justify-content: center; font-family: monospace; font-size: 11px; font-weight: 700; background: #e2e8f0; color: #334155; }
            .gsim-step-tab.active .gsim-step-num { background: #0369a1; color: #ffffff; }
            .gsim-progress-track { width: 100%; height: 5px; background: #e2e8f0; border-radius: 99px; overflow: hidden; margin-bottom: 12px; }
            .gsim-progress-bar { height: 100%; background: #0284c7; transition: width 0.35s ease; }

            /* SÂN KHẤU MÔ PHỎNG ĐỘNG (ANIMATED STAGE) */
            .gsim-stage-wrap { position: relative; background: #0f172a; border-radius: 12px; padding: 12px; color: #f8fafc; border: 1px solid #1e293b; overflow: hidden; }
            .gsim-stage-topbar { display: flex; align-items: center; justify-content: space-between; gap: 8px; padding-bottom: 10px; margin-bottom: 10px; border-bottom: 1px solid #1e293b; font-size: 11.5px; }
            .gsim-dots { display: flex; gap: 5px; align-items: center; }
            .gsim-dot { width: 9px; height: 9px; border-radius: 99px; display: inline-block; }
            .gsim-screen { position: relative; background: #f8fafc; color: #0f172a; border-radius: 8px; padding: 14px; min-height: 215px; border: 1px solid #cbd5e1; overflow: hidden; }
            .gsim-action-banner { display: flex; align-items: center; justify-content: space-between; gap: 8px; background: #f0f9ff; border: 1px solid #7dd3fc; color: #0c4a6e; padding: 8px 12px; border-radius: 8px; margin-bottom: 10px; font-size: 12px; }
            .gsim-kbd { background: #ffffff; border: 1px solid #94a3b8; border-bottom-width: 2px; padding: 1px 7px; border-radius: 5px; font-family: monospace; font-weight: 700; font-size: 11px; color: #0f172a; white-space: nowrap; }

            /* Con trỏ ảo chuyển động tự động trên sân khấu */
            .gsim-cursor { position: absolute; z-index: 30; pointer-events: none; transition: top 0.55s cubic-bezier(0.22, 1, 0.36, 1), left 0.55s cubic-bezier(0.22, 1, 0.36, 1); display: flex; align-items: center; gap: 4px; }
            .gsim-cursor-pointer { width: 22px; height: 22px; border-radius: 99px; background: rgba(2, 132, 199, 0.22); border: 2px solid #0284c7; display: flex; align-items: center; justify-content: center; box-shadow: 0 0 0 4px rgba(2, 132, 199, 0.15); animation: gsimPulse 1.2s infinite; }
            .gsim-cursor-dot { width: 8px; height: 8px; border-radius: 99px; background: #0284c7; }
            .gsim-cursor-label { background: #0f172a; color: #ffffff; font-size: 10.5px; font-weight: 700; padding: 2px 7px; border-radius: 5px; white-space: nowrap; box-shadow: 0 2px 6px rgba(0,0,0,0.25); }
            @keyframes gsimPulse {
                0% { transform: scale(0.92); box-shadow: 0 0 0 0 rgba(2, 132, 199, 0.55); }
                70% { transform: scale(1.08); box-shadow: 0 0 0 10px rgba(2, 132, 199, 0); }
                100% { transform: scale(0.92); box-shadow: 0 0 0 0 rgba(2, 132, 199, 0); }
            }
            .gsim-target-active { outline: 2px solid #0284c7 !important; outline-offset: 2px; box-shadow: 0 0 0 4px rgba(2, 132, 199, 0.18) !important; transition: all 0.25s ease; }

            /* Grid 2 cột bên dưới */
            .gsim-bottom-grid { display: grid; grid-template-columns: 1.55fr 1fr; gap: 12px; align-items: start; }
            @media (max-width: 820px) { .gsim-bottom-grid { grid-template-columns: 1fr; } }
            .gsim-step-card { background: #ffffff; border: 1px solid #e2e8f0; border-radius: 8px; padding: 11px 13px; margin-bottom: 8px; cursor: pointer; transition: all 0.15s ease; }
            .gsim-step-card:hover { border-color: #7dd3fc; }
            .gsim-step-card.active { background: #f0f9ff; border-color: #0284c7; box-shadow: inset 0 0 0 1px #0284c7; }
            .gsim-warn-box { margin-top: 6px; padding: 6px 9px; border-radius: 6px; background: #fffbeb; border: 1px solid #fde68a; color: #92400e; font-size: 11.5px; }
            .gsim-mock-grid2 { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }
            @media (max-width: 640px) { .gsim-mock-grid2 { grid-template-columns: 1fr; } }
            .gsim-mock-box { background: #ffffff; border: 1px solid #cbd5e1; border-radius: 8px; padding: 10px 12px; }
            .gsim-paid-row { background: #d1fae5 !important; border: 1px solid #34d399 !important; color: #064e3b; }
        `;
        document.head.appendChild(st);
    }

    var GUIDE_SOP_DATA = {
        pos: {
            code: 'SOP-01',
            title: 'Bán Hàng Quầy POS, Đa Tab HD & Kết Ca Z-Report',
            badge: 'Thu Ngân & Chủ Shop',
            targetTab: 'pos',
            summary: 'Quy trình khép kín từ mở ca đầu ngày, bán hàng đa hóa đơn viết tắt gọn (HD 1, HD 2), tra cứu sản phẩm/khách hàng siêu tốc (<1ms) với hiệu ứng Soft-Tint, thanh toán VietQR động đến kiểm tiền 10 mệnh giá cuối ca.',
            steps: [
                {
                    title: '1. Mở Ca & Khai Báo Tiền Đầu Két',
                    shortcut: 'Tab Ca Làm Việc',
                    cursorPos: { top: '54px', left: '34%' },
                    cursorText: 'Nhập 1.500.000đ & Bấm Mở Ca',
                    typeTargetId: 'sim-pos-open-cash',
                    typeText: '1.500.000đ',
                    action: 'Vào mục Ca Làm Việc -> Bấm [Mở Ca Mới] -> Nhập số tiền lẻ có sẵn trong két để làm mốc đối soát cuối ngày.',
                    warning: 'Tài khoản Quản trị viên (Admin) hoặc nhân viên có quyền Bypass Shift có thể bán hàng ngay không cần mở ca.',
                    simHtml: `
                        <div class="gsim-mock-grid2">
                            <div class="gsim-mock-box gsim-target-active">
                                <div style="display:flex;justify-content:space-between;border-bottom:1px solid #e2e8f0;padding-bottom:6px;margin-bottom:8px;">
                                    <strong>Khai Báo Mở Ca Sáng (07:00 - 15:00)</strong>
                                    <span style="background:#dcfce7;color:#166534;padding:1px 6px;border-radius:4px;font-weight:700;font-size:11px;">Đang mở</span>
                                </div>
                                <div style="display:flex;justify-content:space-between;margin-bottom:6px;">
                                    <span style="color:#64748b;">Thu ngân phụ trách:</span>
                                    <strong>2 Bé Ngọc</strong>
                                </div>
                                <div style="display:flex;justify-content:space-between;align-items:center;">
                                    <span style="color:#64748b;">Tiền mặt đầu ca:</span>
                                    <span id="sim-pos-open-cash" style="font-family:monospace;font-weight:700;font-size:13px;background:#f0f9ff;color:#0369a1;border:1px solid #0284c7;padding:3px 10px;border-radius:6px;">1.500.000đ</span>
                                </div>
                            </div>
                            <div class="gsim-mock-box" style="background:#f8fafc;">
                                <strong>Tự động khóa mốc đối soát Z-Report</strong>
                                <p style="color:#475569;margin:6px 0 0 0;">Số dư đầu ca được khóa cứng ngay khi mở. Mọi đơn thu tiền mặt, thu cọc Spa/Hotel, nạp ví tiền mặt trong ca sẽ tự động cộng lũy kế vào két lý thuyết.</p>
                            </div>
                        </div>
                    `
                },
                {
                    title: '2. Đa Hóa Đơn Gọn (HD 1, HD 2) & Tìm Hàng F3',
                    shortcut: 'Phím F1 / F2 / F3',
                    cursorPos: { top: '38px', left: '24%' },
                    cursorText: 'Bấm F3 gõ "poodle" -> Chọn hàng',
                    typeTargetId: 'sim-pos-f3-input',
                    typeText: 'Royal Canin Poodle Adult 1.5kg',
                    action: 'Bấm (+) hoặc F1 để mở tối đa 8 đơn đồng thời (ký hiệu gọn HD 1, HD 2...). Bấm F3 hoặc quét mã vạch để tìm sản phẩm với bộ nhớ đệm không dấu (<0.2ms/phím).',
                    warning: 'Khi chuyển đổi giữa HD 1 và HD 2 (phím F2), giỏ hàng, khách hàng và chiết khấu của từng đơn được giữ độc lập 100%.',
                    simHtml: `
                        <div class="gsim-mock-box" style="margin-bottom:8px;">
                            <div style="display:flex;align-items:center;justify-content:space-between;gap:8px;margin-bottom:8px;flex-wrap:wrap;">
                                <div style="display:flex;gap:6px;">
                                    <span style="padding:4px 10px;border-radius:6px;background:#f1f5f9;border:1px solid #cbd5e1;font-weight:700;">HD 1 &times;</span>
                                    <span class="gsim-target-active" style="padding:4px 10px;border-radius:6px;background:#0284c7;color:#fff;font-weight:700;">HD 2 (2) &times;</span>
                                    <span style="padding:4px 10px;border-radius:6px;background:#f1f5f9;border:1px solid #cbd5e1;font-weight:700;">HD 3 &times;</span>
                                    <span style="padding:4px 8px;border-radius:6px;background:#f1f5f9;border:1px solid #cbd5e1;font-weight:700;">+</span>
                                </div>
                                <div style="flex:1;min-width:220px;background:#fff;border:1px solid #0284c7;border-radius:6px;padding:4px 8px;font-family:monospace;font-size:11.5px;">
                                    F3: <strong id="sim-pos-f3-input" style="color:#0369a1;">Royal Canin Poodle Adult 1.5kg</strong>
                                </div>
                            </div>
                            <div style="background:#f0f9ff;box-shadow:inset 0 0 0 1px #0284c7;border-radius:8px;padding:8px 10px;display:flex;justify-content:space-between;align-items:center;">
                                <div>
                                    <div style="font-weight:700;color:#0369a1;">Royal Canin Poodle Adult 1.5kg</div>
                                    <div style="font-size:11px;color:#475569;font-family:monospace;">Mã: RC-POODLE-15 · Tồn kho: <strong style="color:#059669;">24 Gói</strong></div>
                                </div>
                                <div style="text-align:right;font-family:monospace;">
                                    <div style="font-weight:700;font-size:13px;color:#0369a1;">315.000đ</div>
                                    <span style="background:#fff;border:1px solid #7dd3fc;color:#0284c7;padding:1px 6px;border-radius:4px;font-size:10.5px;font-weight:700;">Soft-Tint Highlight</span>
                                </div>
                            </div>
                        </div>
                    `
                },
                {
                    title: '3. Chọn Khách Hàng (F4) & Tự Áp Hạng Thẻ VIP',
                    shortcut: 'Phím F4',
                    cursorPos: { top: '62px', left: '46%' },
                    cursorText: 'Bấm F4 -> Chọn Chị Khanh (Titan)',
                    typeTargetId: 'sim-pos-f4-input',
                    typeText: '0385369202 - Chị Khanh',
                    action: 'Bấm F4 gõ tên không dấu hoặc 4 số cuối SĐT. Dòng đang chọn sáng nền Soft-Tint (#f0f9ff) giữ nguyên độ tương phản rõ nét cho huy hiệu Hạng Thẻ (Diamond, Gold, Titan, Đại Lý) và Điểm tích lũy.',
                    warning: 'Khách thuộc hạng thẻ nào sẽ tự động áp dụng Bảng giá hoặc % chiết khấu của hạng đó cho toàn bộ món trong giỏ.',
                    simHtml: `
                        <div class="gsim-mock-box">
                            <div style="margin-bottom:8px;display:flex;justify-content:space-between;align-items:center;">
                                <span style="font-weight:700;color:#475569;">Ô tìm khách hàng (F4):</span>
                                <span id="sim-pos-f4-input" style="font-family:monospace;font-weight:700;background:#f8fafc;border:1px solid #94a3b8;padding:3px 10px;border-radius:6px;color:#0f172a;">0385369202 - Chị Khanh</span>
                            </div>
                            <div class="gsim-target-active" style="background:#f0f9ff;box-shadow:inset 0 0 0 1px #0284c7;border-radius:8px;padding:10px 12px;display:flex;justify-content:space-between;align-items:center;">
                                <div>
                                    <div style="font-weight:700;color:#0369a1;font-size:13px;display:flex;align-items:center;gap:6px;">
                                        <span>Chị Khanh</span>
                                        <span style="background:#ffffff;color:#0284c7;border:1px solid #7dd3fc;padding:1px 7px;border-radius:5px;font-size:11px;">Titan (-5%)</span>
                                    </div>
                                    <div style="font-family:monospace;color:#475569;font-size:11px;margin-top:3px;">SĐT: 0385369202 · Mã KH: KH018666</div>
                                </div>
                                <div style="display:flex;gap:6px;font-family:monospace;">
                                    <span style="background:#0284c7;color:#ffffff;padding:3px 8px;border-radius:6px;font-weight:700;font-size:11px;">125 pts</span>
                                    <span style="background:#ecfdf5;color:#047857;border:1px solid #a7f3d0;padding:3px 8px;border-radius:6px;font-weight:700;font-size:11px;">Ví: 850.000đ</span>
                                </div>
                            </div>
                        </div>
                    `
                },
                {
                    title: '4. Thanh Toán (F9), VietQR Động & Kết Ca Z-Report',
                    shortcut: 'Phím F9 / F8',
                    cursorPos: { top: '68px', left: '56%' },
                    cursorText: 'Bấm F9 Hoàn Tất & In Hóa Đơn',
                    typeTargetId: 'sim-pos-final-pay',
                    typeText: '457.500đ (Đã thanh toán QR)',
                    action: 'Chọn Tiền mặt, Chuyển khoản (sinh mã VietQR động đúng số tiền + mã đơn), Quẹt thẻ hoặc Ghi nợ. Cuối ca bấm [Đóng Ca], nhập số tờ của 10 mệnh giá để in phiếu Z-Report đối soát lệch két.',
                    warning: 'Phí giao hàng (Ship) nhập vào ô Phí giao hàng riêng, tuyệt đối không tạo mã hàng SHIP trong kho để tránh lệch giá vốn.',
                    simHtml: `
                        <div class="gsim-mock-grid2">
                            <div class="gsim-mock-box" style="font-family:monospace;">
                                <div style="font-family:sans-serif;font-weight:700;border-bottom:1px solid #e2e8f0;padding-bottom:4px;margin-bottom:6px;">Bảng Kê Thanh Toán Đơn HD 2</div>
                                <div style="display:flex;justify-content:space-between;"><span>Tổng tiền hàng:</span><strong>450.000đ</strong></div>
                                <div style="display:flex;justify-content:space-between;color:#059669;"><span>Chiết khấu hạng Titan:</span><strong>-22.500đ</strong></div>
                                <div style="display:flex;justify-content:space-between;color:#0284c7;"><span>Phí giao hàng (Ship):</span><strong>+30.000đ</strong></div>
                                <div style="display:flex;justify-content:space-between;border-top:1px solid #cbd5e1;padding-top:4px;margin-top:4px;font-size:13px;font-weight:700;">
                                    <span>KHÁCH CẦN TRẢ:</span>
                                    <span id="sim-pos-final-pay" style="color:#0369a1;">457.500đ</span>
                                </div>
                            </div>
                            <div class="gsim-mock-box gsim-target-active" style="background:#f0fdf4;border-color:#86efac;display:flex;flex-direction:column;justify-content:space-between;">
                                <div>
                                    <strong style="color:#166534;">Xác Nhận Thanh Toán (F9)</strong>
                                    <p style="color:#15803d;margin:4px 0;">Tự động trừ kho 2 món, cộng điểm tích lũy và ghi nhận vào Sổ Quỹ.</p>
                                </div>
                                <div style="background:#059669;color:#fff;text-align:center;padding:6px;border-radius:6px;font-weight:700;">HOÀN TẤT & IN BILL K80 (F9)</div>
                            </div>
                        </div>
                    `
                }
            ],
            rules: [
                { icon: 'ph-keyboard', title: 'Tổ hợp phím tắt chuẩn Quầy POS', desc: 'F1: Thêm tab HD mới | F2: Chuyển tab HD kế tiếp | F3: Tìm sản phẩm | F4: Tìm khách hàng | F8: In tạm tính | F9: Hoàn tất thanh toán | Esc: Đóng popup.' },
                { icon: 'ph-truck', title: 'Quy tắc tách Phí Vận Chuyển (Shipping Fee)', desc: 'Phí ship được hạch toán riêng tại cột shipping_fee trên hóa đơn, không cộng vào doanh thu hàng hóa tính hoa hồng và không làm sai lệch tồn kho.' }
            ],
            tourSteps: [
                { tab: 'pos', selector: '#sidebar-nav button[data-tab="pos"]', title: '1. Mở Phân Hệ Bán Hàng Quầy POS', desc: 'Bấm vào mục Bán Hàng để vào màn hình thu ngân chuyên dụng với tab HD 1, HD 2.' },
                { tab: 'orders', selector: '#sidebar-nav button[data-tab="orders"]', title: '2. Tra Cứu & Quản Lý Hóa Đơn Bán Hàng', desc: 'Toàn bộ hóa đơn sau khi thanh toán tại POS hoặc Import từ KiotViet đều được lưu trữ và lọc đa chiều tại đây.' }
            ]
        },

        spa: {
            code: 'SOP-02',
            title: 'Tiếp Nhận Dịch Vụ Spa, In 2 Phiếu K80 & Bảng Điều Phối 1-Chạm',
            badge: 'Lễ Tân & Thợ Spa',
            targetTab: 'pet-services',
            summary: 'Tiếp nhận lẻ hoặc hàng loạt nhiều bé, tự động tra giá theo 79 mức cân nặng, bấm lưu tự động in 2 phiếu rời nhau (Phiếu nhận + Số thứ tự dán chuồng), sửa trực tiếp trên bảng và tô xanh ngọc toàn dòng khi Đã Thanh Toán.',
            steps: [
                {
                    title: '1. Tiếp Nhận Bé (F2) & Tự Nhảy Giá Theo 79 Bậc Cân Nặng',
                    shortcut: 'Phím F2 tại màn Spa',
                    cursorPos: { top: '52px', left: '36%' },
                    cursorText: 'Nhập 3,8 kg -> Tự nhảy 280.000đ',
                    typeTargetId: 'sim-spa-weight-val',
                    typeText: '3,8 kg -> 280.000đ',
                    action: 'Bấm [+ Tiếp Nhận Dịch Vụ (F2)], tìm chủ nuôi theo SĐT -> Chọn bé (hoặc tiếp nhận hàng loạt 2-10 bé) -> Nhập số Kg thực tế, phần mềm tự động tra bảng 79 mức giá để điền đơn giá chính xác.',
                    warning: 'Luôn ghi rõ tình trạng ban đầu (viêm da, lông rối, ve rận) và phụ kiện gửi kèm (dây dắt, balo, áo) để in lên cả 2 phiếu.',
                    simHtml: `
                        <div class="gsim-mock-grid2">
                            <div class="gsim-mock-box gsim-target-active">
                                <strong>1. Nhập cân nặng thực tế của bé</strong>
                                <div style="margin-top:6px;">Khách: <strong>Chị Ngọc Snow</strong> · Bé: <strong>Bông (Poodle)</strong></div>
                                <div style="margin-top:6px;display:flex;justify-content:space-between;align-items:center;">
                                    <span>Gói: <strong>CB Cắt Tỉa (1+2+3+5)</strong></span>
                                    <span id="sim-spa-weight-val" style="font-family:monospace;font-weight:700;background:#f0f9ff;color:#0369a1;border:1px solid #0284c7;padding:2px 8px;border-radius:6px;">3,8 kg -> 280.000đ</span>
                                </div>
                            </div>
                            <div class="gsim-mock-box" style="background:#fffbeb;border-color:#fde68a;">
                                <strong style="color:#92400e;">2. Ghi chú Cạo bàn & Phụ kiện gửi lại</strong>
                                <div style="margin-top:6px;color:#78350f;">Cạo bàn: <strong>Cạo sạch bàn chân</strong></div>
                                <div style="margin-top:4px;color:#78350f;">Phụ kiện kèm: <strong>Dây dắt xanh + Balo nhựa</strong></div>
                            </div>
                        </div>
                    `
                },
                {
                    title: '2. Tự Động In 2 Phiếu Rời Nhau: Phiếu Nhận + Số Thứ Tự Dán Chuồng',
                    shortcut: 'Nút Lưu & In K80',
                    cursorPos: { top: '48px', left: '56%' },
                    cursorText: 'Tự cắt rời Phiếu 2 dán lên chuồng',
                    typeTargetId: 'sim-spa-stt-box',
                    typeText: '#811',
                    action: 'Khi bấm tạo phiếu (hoặc bấm nút In phiếu nhận trên dòng), máy in nhiệt K80 tự động in liên tiếp 2 phiếu có lệnh ngắt dao tự động (page-break): Phiếu 1 giao khách/lễ tân ký, Phiếu 2 có số #STT khổng lồ 44px dán thẳng lên cửa chuồng.',
                    warning: 'Khi tiếp nhận hàng loạt N bé trong 1 đợt, hệ thống tự động in 1 Phiếu tiếp nhận gộp chung + N Phiếu số thứ tự riêng cho từng chuồng.',
                    simHtml: `
                        <div class="gsim-mock-grid2" style="font-family:monospace;font-size:11px;">
                            <div class="gsim-mock-box" style="border:1.5px dashed #64748b;">
                                <div style="text-align:center;font-weight:700;border-bottom:1px dashed #cbd5e1;padding-bottom:4px;margin-bottom:6px;">PHIẾU 1: PHIẾU TIẾP NHẬN DỊCH VỤ</div>
                                <div>Số phiếu: <strong>#811</strong> · Khách: Chị Ngọc Snow</div>
                                <div>Bé: <strong>Bông</strong> (Poodle · 3,8 kg) · Cạo sạch bàn</div>
                                <div style="display:flex;justify-content:space-between;border-top:1px dashed #cbd5e1;margin-top:6px;padding-top:4px;font-weight:700;">
                                    <span>1x CB Cắt Tỉa (1+2+3+5)</span><span>280.000đ</span>
                                </div>
                                <div style="display:flex;justify-content:space-between;color:#64748b;margin-top:6px;">
                                    <span>[Chữ ký NV Nhận]</span><span>[Chữ ký Khách Gửi]</span>
                                </div>
                            </div>
                            <div class="gsim-mock-box gsim-target-active" style="border:2px dashed #0284c7;background:#f0f9ff;">
                                <div style="text-align:center;font-weight:700;color:#075985;border-bottom:1px dashed #7dd3fc;padding-bottom:4px;margin-bottom:6px;">PHIẾU 2: SỐ THỨ TỰ DÁN CHUỒNG</div>
                                <div style="text-align:center;margin:4px 0;">
                                    <span id="sim-spa-stt-box" style="display:inline-block;border:2.5px solid #0f172a;background:#fff;padding:2px 16px;border-radius:6px;font-size:20px;font-weight:700;color:#0f172a;">#811</span>
                                </div>
                                <div><strong>BÉ: BÔNG (3,8 kg)</strong> · Chị Ngọc Snow</div>
                                <div style="color:#0369a1;font-weight:700;margin-top:2px;">PK gửi kèm: <u>Dây dắt xanh + Balo</u></div>
                            </div>
                        </div>
                    `
                },
                {
                    title: '3. Điều Phối 1-Chạm Trên Bảng (Đã Xóa Kanban & Xóa Nút Sửa Thừa)',
                    shortcut: 'Click thẳng vào ô trên dòng',
                    cursorPos: { top: '52px', left: '28%' },
                    cursorText: 'Click ô Dịch vụ / Thợ để sửa nhanh 1-chạm',
                    typeTargetId: 'sim-spa-change-svc',
                    typeText: 'CB Cắt Tỉa (Đổi DV: Lông rối bết)',
                    action: 'Giao diện cố định dạng Bảng tốc độ cao (đã bỏ Kanban và bỏ nút Sửa thừa dưới mã phiếu). Nhân viên bấm trực tiếp vào ô [Dịch vụ], [Lưu ý], [Thợ phụ trách], [Trạng thái] hoặc [Gọi điện] để cập nhật ngay.',
                    warning: 'Khi đổi gói dịch vụ (VD: từ Tắm sang Cắt tỉa do lông rối), phần mềm giữ nguyên gói cũ gạch ngang và in lịch sử đổi gói lên hóa đơn K80.',
                    simHtml: `
                        <div class="gsim-mock-grid2">
                            <div class="gsim-mock-box gsim-target-active">
                                <div style="text-decoration:line-through;color:#94a3b8;font-size:11px;">CB Tắm (1+2+3) (180.000đ)</div>
                                <div id="sim-spa-change-svc" style="font-weight:700;color:#0369a1;margin-top:2px;">CB Cắt Tỉa (1+2+3+5) (280.000đ)</div>
                                <span style="display:inline-block;margin-top:4px;background:#fef3c7;border:1px solid #fcd34d;color:#92400e;padding:1px 7px;border-radius:4px;font-size:11px;font-weight:700;">Đổi DV: Lông rối bết</span>
                            </div>
                            <div class="gsim-mock-box">
                                <strong>Phân công Thợ (Đồng bộ HRM):</strong>
                                <div style="margin-top:4px;">Nhận: <strong style="color:#0369a1;">BH nhận dùm</strong> (HH 2%)</div>
                                <div>Tắm: <strong style="color:#0369a1;">4 Huyền Trân</strong> (HH 10%)</div>
                                <div>Cắt: <strong style="color:#059669;">2 Bé Ngọc</strong> (HH 12%)</div>
                            </div>
                        </div>
                    `
                },
                {
                    title: '4. Trả Bé, Cấn Trừ Ví & Tô Xanh Ngọc Toàn Dòng (#d1fae5)',
                    shortcut: 'Nút Trả bé',
                    cursorPos: { top: '48px', left: '54%' },
                    cursorText: 'Đã Thanh Toán -> Cả dòng đổi màu xanh ngọc!',
                    typeTargetId: 'sim-spa-paid-badge',
                    typeText: 'Đã TT (Toàn dòng xanh ngọc)',
                    action: 'Bấm nút [Trả bé] -> Hệ thống ưu tiên khấu trừ sạch Ví Spa trước, phần thiếu thu Tiền mặt/CK -> Ngay khi Đã Thanh Toán, toàn bộ các ô của dòng đó chuyển sang nền xanh ngọc (#d1fae5) nổi bật.',
                    warning: 'Cột thao tác gọn gàng chỉ gồm: [In 2 phiếu nhận], [In hóa đơn], [Trả bé] và [Xóa].',
                    simHtml: `
                        <div class="gsim-mock-box gsim-paid-row gsim-target-active" style="display:flex;justify-content:space-between;align-items:center;padding:12px;">
                            <div style="display:flex;align-items:center;gap:10px;">
                                <span style="background:#e0f2fe;border:1px solid #7dd3fc;color:#075985;font-family:monospace;font-weight:700;padding:3px 8px;border-radius:6px;">#811</span>
                                <div>
                                    <div style="font-weight:700;font-size:13px;">Chị Ngọc Snow · Bé Bông (Poodle · 3,8 kg)</div>
                                    <div style="font-size:11.5px;">CB Cắt Tỉa (1+2+3+5) · Thợ: 4 Huyền Trân, 2 Bé Ngọc</div>
                                </div>
                            </div>
                            <div style="text-align:right;font-family:monospace;">
                                <div style="font-weight:700;font-size:14px;color:#065f46;">280.000đ</div>
                                <span id="sim-spa-paid-badge" style="display:inline-block;background:#059669;color:#fff;padding:2px 8px;border-radius:5px;font-size:11px;font-weight:700;">Đã TT (Toàn dòng xanh ngọc)</span>
                            </div>
                        </div>
                    `
                }
            ],
            rules: [
                { icon: 'ph-users-three', title: 'Đồng bộ 2 chiều Thợ Spa & Nhân Sự HRM', desc: 'Tab Nhân Viên Spa lấy trực tiếp danh sách thợ từ bảng Nhân Sự (HRM), tự động tổng hợp số ca Nhận / Tắm / Cắt / Nhuộm, Hoa hồng dịch vụ và Tiền Tip theo từng tháng.' },
                { icon: 'ph-printer', title: 'Quy chuẩn in 2 phiếu khi tiếp nhận', desc: 'Mỗi lần bấm In phiếu nhận, hệ thống luôn xuất đủ Phiếu tiếp nhận (có 2 chữ ký) kèm Phiếu số thứ tự dán chuồng ở trang kế tiếp.' }
            ],
            tourSteps: [
                { tab: 'pet-services', selector: '#btn-spa-sub-services', title: '1. Bảng Điều Phối Spa Trong Ngày', desc: 'Màn hình trung tâm quản lý toàn bộ ca Spa theo ngày, tô màu xanh ngọc toàn bộ dòng Đã Thanh Toán.' },
                { tab: 'pet-services', selector: '#btn-spa-sub-pricing', title: '2. Bảng Giá 79 Bậc Theo Cân Nặng', desc: 'Thiết lập đơn giá tự động theo từng khoảng cân nặng cho Gói Combo Chó, Dịch Vụ Lẻ, Spa Mèo và Nhuộm.' },
                { tab: 'pet-services', selector: '#btn-spa-sub-staff', title: '3. Thống Kê Sản Lượng & Hoa Hồng Thợ Spa', desc: 'Đồng bộ 2 chiều với bảng lương HRM: theo dõi số ca Nhận, Tắm, Cắt, Nhuộm và tiền Tip của từng thợ theo tháng.' }
            ]
        },

        hotel: {
            code: 'SOP-03',
            title: 'Khách Sạn Thú Cưng Pet Hotel (16 Phòng & Lịch Gantt)',
            badge: 'Quản Lý Lưu Trú',
            targetTab: 'hotel',
            summary: 'Quản lý 16 buồng phòng chia theo Khu Mèo, Khu Chó và Phòng VIP; hỗ trợ nhận phòng theo lô nhiều bé, thu tiền cọc K80, theo dõi nhật ký cho ăn/chăm sóc và đối soát trả phòng tự động.',
            steps: [
                {
                    title: '1. Kiểm Tra Sơ Đồ 16 Buồng Phòng (Lưới / Bảng / Gantt)',
                    shortcut: 'Tab Khách Sạn',
                    cursorPos: { top: '48px', left: '22%' },
                    cursorText: 'Chọn phòng trống C01 để nhận bé',
                    typeTargetId: 'sim-hotel-room',
                    typeText: 'PHÒNG C01 (Đang trống)',
                    action: 'Quan sát nhanh trên sơ đồ Lưới: Phòng màu Xanh là Đang trống, màu Đỏ/Cam là Đang có bé ở. Chuyển sang chế độ Gantt 7 ngày để kiểm tra lịch đặt trước.',
                    warning: 'Không xếp vượt quá sức chứa tối đa của buồng nếu các bé không thuộc cùng một chủ nuôi.',
                    simHtml: `
                        <div class="gsim-mock-grid2">
                            <div class="gsim-mock-box gsim-target-active" style="background:#ecfdf5;border-color:#6ee7b7;">
                                <div id="sim-hotel-room" style="font-family:monospace;font-weight:700;color:#065f46;">PHÒNG C01 (KHU MÈO)</div>
                                <div style="color:#047857;font-weight:700;margin-top:4px;">Trạng thái: Đang trống · 150.000đ/ngày</div>
                            </div>
                            <div class="gsim-mock-box" style="background:#fff1f2;border-color:#fecdd3;">
                                <div style="font-family:monospace;font-weight:700;color:#9f1239;">PHÒNG D02 (KHU CHÓ)</div>
                                <div style="color:#be123c;font-weight:700;margin-top:4px;">Đang ở: Bé Lu (Ngày 2/3) · Đã cọc 300k</div>
                            </div>
                        </div>
                    `
                },
                {
                    title: '2. Check-in Nhận Phòng, Ghi Chế Độ Ăn & Thu Tiền Cọc',
                    shortcut: 'Nút + Nhận Phòng',
                    cursorPos: { top: '52px', left: '54%' },
                    cursorText: 'Nhập tiền cọc 300.000đ & In phiếu',
                    typeTargetId: 'sim-hotel-deposit',
                    typeText: 'Đã thu cọc: 300.000đ',
                    action: 'Chọn khách hàng -> Tích chọn 1 hoặc nhiều bé -> Chọn phòng, ngày giờ nhận và ngày dự kiến trả -> Ghi rõ khẩu phần ăn, thuốc men, đồ gửi kèm -> Nhập số tiền đặt cọc và in Phiếu Nhận Lưu Trú K80.',
                    warning: 'Tiền đặt cọc được ghi nhận ngay vào Sổ Quỹ tại thời điểm nhận phòng để tránh lệch két ca.',
                    simHtml: `
                        <div class="gsim-mock-box gsim-target-active" style="display:flex;justify-content:space-between;align-items:center;">
                            <div>
                                <strong>Phiếu Nhận Phòng #HT-2026-089 · Phòng D02</strong>
                                <div style="color:#475569;margin-top:4px;">Khẩu phần: Ngày 2 bữa hạt trộn ức gà · Đồ gửi: Chăn vàng + Bình nước</div>
                            </div>
                            <div style="text-align:right;font-family:monospace;">
                                <div>Tạm tính 3 ngày: 600.000đ</div>
                                <div id="sim-hotel-deposit" style="font-weight:700;color:#059669;font-size:13px;">Đã thu cọc: 300.000đ</div>
                            </div>
                        </div>
                    `
                },
                {
                    title: '3. Check-out Trả Phòng & Khấu Trừ Tiền Đặt Cọc',
                    shortcut: 'Nút Trả Phòng',
                    cursorPos: { top: '58px', left: '58%' },
                    cursorText: 'Khấu trừ cọc 300k -> Thu thêm 300k',
                    typeTargetId: 'sim-hotel-remain',
                    typeText: '300.000đ',
                    action: 'Khi chủ đến đón: Hệ thống tự tính số ngày lưu trú thực tế x đơn giá phòng, tự động trừ số tiền đã đặt cọc và chỉ thu phần chênh lệch còn lại.',
                    warning: 'Không dùng số dư Ví Spa để cấn trừ tiền phòng Khách Sạn (Ví Spa chỉ dành riêng cho dịch vụ Spa/Grooming).',
                    simHtml: `
                        <div class="gsim-mock-box gsim-target-active" style="font-family:monospace;">
                            <div style="display:flex;justify-content:space-between;"><span>Tiền lưu trú thực tế (3 ngày x 200.000đ):</span><strong>600.000đ</strong></div>
                            <div style="display:flex;justify-content:space-between;color:#0284c7;"><span>Trừ tiền đã đặt cọc lúc nhận:</span><strong>-300.000đ</strong></div>
                            <div style="display:flex;justify-content:space-between;border-top:1px solid #cbd5e1;margin-top:6px;padding-top:4px;font-weight:700;font-size:13px;">
                                <span>THỰC THU KHI TRẢ PHÒNG:</span>
                                <span id="sim-hotel-remain" style="color:#059669;">300.000đ</span>
                            </div>
                        </div>
                    `
                }
            ],
            rules: [
                { icon: 'ph-arrows-left-right', title: 'Liên thông Spa -> Hotel 1-Chạm', desc: 'Trên phiếu Spa có tùy chọn "Spa xong gửi Hotel" để lễ tân chuyển thẳng thông tin bé sang buồng lưu trú.' },
                { icon: 'ph-lock-key', title: 'Tách biệt Ví Spa và Doanh thu Phòng', desc: 'Tiền phòng Hotel luôn thu bằng Tiền mặt / Chuyển khoản / Thẻ để bảo toàn tỷ suất lợi nhuận buồng phòng.' }
            ],
            tourSteps: [
                { tab: 'hotel', selector: '#sidebar-nav button[data-tab="hotel"]', title: '1. Mở Phân Hệ Khách Sạn Thú Cưng', desc: 'Quản lý toàn bộ 16 buồng phòng lưu trú chó mèo và lịch đặt phòng.' }
            ]
        },

        wallet: {
            code: 'SOP-04',
            title: 'Ví Dịch Vụ Trả Trước (Topup) & Hạng Thẻ Thành Viên VIP',
            badge: 'CSKH & Kế Toán',
            targetTab: 'price-lists',
            summary: 'Cấu hình các gói nạp Ví Spa tặng thêm tiền khuyến mãi, tự động nâng hạng thẻ (Diamond, Gold, Titan, Đại lý, Nội bộ) và cơ chế cấn trừ sạch ví thông minh.',
            steps: [
                {
                    title: '1. Nạp Gói Ví Trả Trước (Tặng Tiền Khuyến Mãi Vào Ví)',
                    shortcut: 'Tab Bảng Giá / Danh Bạ',
                    cursorPos: { top: '52px', left: '32%' },
                    cursorText: 'Thu 2.000.000đ -> Cộng ví 2.350.000đ',
                    typeTargetId: 'sim-wallet-bal',
                    typeText: '+2.350.000đ vào Ví Spa',
                    action: 'Vào thông tin khách hàng bấm [+ Nạp Ví], chọn gói tương ứng (VD: Nạp 2.000.000đ tặng 350.000đ). Tiền thu thực tế (2.000.000đ) vào Sổ Quỹ, còn Ví Spa của khách tăng 2.350.000đ.',
                    warning: 'Hệ thống tự động in biên nhận nạp ví K80 thể hiện rõ số dư trước nạp, số tiền nạp, tiền tặng và số dư mới.',
                    simHtml: `
                        <div class="gsim-mock-grid2">
                            <div class="gsim-mock-box gsim-target-active">
                                <strong>Gói VIP Gold Topup 2 Triệu</strong>
                                <div style="margin-top:4px;font-family:monospace;">Thực thu vào Sổ Quỹ: <strong>2.000.000đ</strong></div>
                                <div id="sim-wallet-bal" style="margin-top:4px;font-family:monospace;font-weight:700;color:#059669;">+2.350.000đ vào Ví Spa</div>
                            </div>
                            <div class="gsim-mock-box" style="background:#f8fafc;">
                                <strong>5 Phân Nhóm Hạng Thẻ Tự Động</strong>
                                <p style="color:#475569;margin:4px 0 0 0;">Diamond · Gold · Titan · Đại Lý · Nội Bộ (Đồng bộ tự động từ cột Bảng giá khi Import KiotViet).</p>
                            </div>
                        </div>
                    `
                },
                {
                    title: '2. Cấn Trừ Sạch Ví Spa & Tự Động Tách Phần Thu Ngoài',
                    shortcut: 'Khi Thanh Toán Spa',
                    cursorPos: { top: '58px', left: '54%' },
                    cursorText: 'Trừ hết 120k trong ví -> Thu ngoài 230k',
                    typeTargetId: 'sim-wallet-outside',
                    typeText: '230.000đ (Tiền mặt / CK)',
                    action: 'Nếu hóa đơn Spa là 350.000đ mà Ví Spa chỉ còn 120.000đ: Hệ thống tự động trừ sạch 120.000đ trong ví (về 0đ) và tách 230.000đ còn thiếu sang khoản Thu Ngoài.',
                    warning: 'Ví Spa chỉ áp dụng cho dịch vụ Spa/Grooming, không dùng để mua thức ăn/phụ kiện bán lẻ.',
                    simHtml: `
                        <div class="gsim-mock-box gsim-target-active" style="font-family:monospace;">
                            <div style="display:flex;justify-content:space-between;"><span>1. Tiền Dịch Vụ Spa:</span><strong>350.000đ</strong></div>
                            <div style="display:flex;justify-content:space-between;color:#0284c7;"><span>2. Đã Trừ Sạch Ví Spa:</span><strong>-120.000đ (Ví còn 0đ)</strong></div>
                            <div style="display:flex;justify-content:space-between;border-top:1px solid #cbd5e1;margin-top:6px;padding-top:4px;font-weight:700;font-size:13px;">
                                <span>3. THỰC THU NGOÀI TẠI QUẦY:</span>
                                <span id="sim-wallet-outside" style="color:#059669;">230.000đ (Tiền mặt / CK)</span>
                            </div>
                        </div>
                    `
                }
            ],
            rules: [
                { icon: 'ph-shield-warning', title: 'Quy tắc sắt: Phạm vi sử dụng Ví Spa', desc: 'Ví Spa chỉ được phép khấu trừ cho phần Tiền Dịch Vụ Spa. Các sản phẩm thức ăn/phụ kiện mua kèm vẫn thanh toán bằng Tiền mặt hoặc Chuyển khoản.' }
            ],
            tourSteps: [
                { tab: 'price-lists', selector: '#sidebar-nav button[data-tab="price-lists"]', title: '1. Mở Phân Hệ Bảng Giá & Gói Nạp Ví', desc: 'Quản lý bảng giá theo phân khúc khách hàng và các gói nạp Ví Spa trả trước.' }
            ]
        },

        cashbook: {
            code: 'SOP-05',
            title: 'Sổ Quỹ Đa Tài Khoản, Công Nợ FIFO & Tách 2 Quỹ NCC (Công Ty / Cá Nhân)',
            badge: 'Kế Toán & Chủ Shop',
            targetTab: 'cashbook',
            summary: 'Quản lý dòng tiền thực tế theo từng tài khoản, thu nợ khách hàng tự động cấn trừ FIFO và tách bạch công nợ Nhà Cung Cấp theo 2 quỹ (Quỹ Công Ty có VAT vs Quỹ Cá Nhân không VAT).',
            steps: [
                {
                    title: '1. Tách Bạch 2 Quỹ Nợ Nhà Cung Cấp: Công Ty (VAT) vs Cá Nhân',
                    shortcut: 'Tab Khách Hàng & NCC',
                    cursorPos: { top: '52px', left: '28%' },
                    cursorText: 'Tự động tách ngăn nợ Công ty & Cá nhân',
                    typeTargetId: 'sim-cb-comp-debt',
                    typeText: 'Nợ Cty (VAT): 45.000.000đ',
                    action: 'Mỗi Nhà Cung Cấp có 2 ngăn công nợ độc lập: (1) Nợ Công Ty (tổng hợp từ các đơn nhập PO/OEM có thuế VAT > 0 hoặc nguồn quỹ COMPANY) và (2) Nợ Cá Nhân (các đơn không VAT).',
                    warning: 'Chỉ tính 4 subquery công nợ này cho đối tác là Nhà Cung Cấp (supplier), giúp tải 13.218 danh bạ nhanh gấp 51 lần (chỉ 180ms).',
                    simHtml: `
                        <div class="gsim-mock-grid2">
                            <div class="gsim-mock-box gsim-target-active" style="background:#f0f9ff;border-color:#7dd3fc;">
                                <strong style="color:#075985;">Quỹ Công Ty (Có Hóa Đơn VAT)</strong>
                                <div id="sim-cb-comp-debt" style="font-family:monospace;font-weight:700;font-size:13px;color:#0369a1;margin-top:4px;">Nợ Cty (VAT): 45.000.000đ</div>
                            </div>
                            <div class="gsim-mock-box" style="background:#fffbeb;border-color:#fde68a;">
                                <strong style="color:#92400e;">Quỹ Cá Nhân (Không VAT)</strong>
                                <div style="font-family:monospace;font-weight:700;font-size:13px;color:#b45309;margin-top:4px;">Nợ Cá nhân: 12.500.000đ</div>
                            </div>
                        </div>
                    `
                },
                {
                    title: '2. Thu Nợ Khách Hàng Cấn Trừ Tự Động Theo Thứ Tự FIFO',
                    shortcut: 'Nút Thu Nợ trong Danh Bạ',
                    cursorPos: { top: '58px', left: '52%' },
                    cursorText: 'Gạch nợ đơn cũ trước -> Trừ nợ đầu kỳ sau',
                    typeTargetId: 'sim-cb-fifo',
                    typeText: 'Đã tất toán 2 đơn + Trừ 1tr nợ đầu kỳ',
                    action: 'Khi khách thanh toán công nợ (VD: trả 5.000.000đ): Hệ thống tự động gạch nợ lần lượt từ hóa đơn nợ cũ nhất đến mới nhất (FIFO), phần tiền dư còn lại trừ thẳng vào Công nợ đầu kỳ (contacts.debt).',
                    warning: 'Nhờ cơ chế này, anh chỉ cần đồng bộ số tổng Nợ hiện tại từ KiotViet mà không bắt buộc phải nạp lại 300.000 hóa đơn từ nhiều năm trước.',
                    simHtml: `
                        <div class="gsim-mock-box gsim-target-active" style="font-family:monospace;">
                            <div style="font-family:sans-serif;font-weight:700;margin-bottom:4px;">Khách trả nợ 5.000.000đ -> Tự động phân bổ FIFO:</div>
                            <div style="color:#059669;">1. Đơn #HD102 (Nợ 1.800.000đ) -> <strong>Về 0đ</strong></div>
                            <div style="color:#059669;">2. Đơn #HD115 (Nợ 2.200.000đ) -> <strong>Về 0đ</strong></div>
                            <div id="sim-cb-fifo" style="color:#0284c7;font-weight:700;margin-top:4px;">Đã tất toán 2 đơn + Trừ 1tr nợ đầu kỳ</div>
                        </div>
                    `
                }
            ],
            rules: [
                { icon: 'ph-file-magnifying-glass', title: 'Drawer đối soát chứng từ gốc (Read-only)', desc: 'Bấm vào mã tham chiếu trên bất kỳ dòng phiếu Thu/Chi nào trong Sổ Quỹ để mở ngăn kéo xem lại nguyên vẹn hóa đơn gốc.' }
            ],
            tourSteps: [
                { tab: 'cashbook', selector: '#sidebar-nav button[data-tab="cashbook"]', title: '1. Mở Phân Hệ Sổ Quỹ & Dòng Tiền', desc: 'Quản lý toàn bộ phiếu thu, phiếu chi, chuyển quỹ nội bộ và dự chi.' }
            ]
        },

        inventory: {
            code: 'SOP-06',
            title: 'Kho Hàng Đa ĐVT (2-Pass), Đơn Đặt Hàng PO, Gia Công OEM & Định Mức BOM',
            badge: 'Thủ Kho & Sản Xuất',
            targetTab: 'inventory',
            summary: 'Quản lý 935+ sản phẩm và nguyên vật liệu với cơ chế quy đổi đơn vị tính (Gói / Hộp / Thùng), tự động tính giá vốn bình quân gia quyền (MAC), lập đơn nhập hàng PO và lệnh sản xuất trừ kho theo công thức BOM.',
            steps: [
                {
                    title: '1. Đồng Bộ Danh Mục Hàng Hóa KiotViet 2-Pass (Gốc & Đơn Vị Quy Đổi)',
                    shortcut: 'Tab Kho Hàng -> Nhập Excel',
                    cursorPos: { top: '52px', left: '54%' },
                    cursorText: 'Pass 2: Tự gắn ĐVT Thùng = 24 Gói',
                    typeTargetId: 'sim-inv-pass2',
                    typeText: '1 Thùng = 24 Gói (item_units)',
                    action: 'Pass 1 nạp các dòng đơn vị cơ bản vào bảng products (ghi đè đúng số tồn kiểm kê); Pass 2 tự động gắn các dòng quy đổi (Hộp, Thùng, Lốc) vào bảng item_units với tỷ lệ quy đổi chính xác.',
                    warning: 'Tuyệt đối không nhân đôi tồn kho của dòng đơn vị quy đổi và chỉ khớp theo Mã hàng (code).',
                    simHtml: `
                        <div class="gsim-mock-grid2">
                            <div class="gsim-mock-box">
                                <strong>Pass 1: Đơn vị cơ bản (products)</strong>
                                <div style="font-family:monospace;color:#0369a1;margin-top:4px;">MEOA035 · MeO Adult 350g · Tồn: 48 Gói</div>
                            </div>
                            <div class="gsim-mock-box gsim-target-active" style="background:#f0f9ff;border-color:#7dd3fc;">
                                <strong>Pass 2: Đơn vị quy đổi (item_units)</strong>
                                <div id="sim-inv-pass2" style="font-family:monospace;font-weight:700;color:#0369a1;margin-top:4px;">1 Thùng = 24 Gói (item_units)</div>
                            </div>
                        </div>
                    `
                },
                {
                    title: '2. Nhập Hàng PO & Lệnh Sản Xuất Tự Trừ Nguyên Phụ Liệu Theo BOM',
                    shortcut: 'Tab Nhập Hàng / Sản Xuất',
                    cursorPos: { top: '58px', left: '46%' },
                    cursorText: 'Sản xuất 100 chai -> Tự trừ 100 vỏ + 100 tem',
                    typeTargetId: 'sim-inv-bom',
                    typeText: '+100 Chai Thành Phẩm (Trừ đủ BOM)',
                    action: 'Khi chọn Nhà Cung Cấp trong phiếu nhập PO, danh sách hàng hóa tự động lọc các mặt hàng thuộc NCC đó. Khi tạo Lệnh sản xuất thành phẩm, hệ thống tự động trừ đúng số lượng chai, vòi nhấn, tem nhãn theo định mức BOM.',
                    warning: 'Khi cập nhật tên sản phẩm ở bảng Master, mọi chi tiết phiếu nhập lịch sử tự động hiển thị tên mới.',
                    simHtml: `
                        <div class="gsim-mock-box gsim-target-active" style="font-family:monospace;">
                            <div style="font-family:sans-serif;font-weight:700;margin-bottom:4px;">Lệnh Sản Xuất 100 Chai Sữa Tắm Q8:</div>
                            <div style="color:#e11d48;">- Xuất kho Vỏ chai 500ml + Vòi nhấn: -100 Cái</div>
                            <div style="color:#e11d48;">- Xuất kho Tem nhãn chống nước Q8: -100 Tem</div>
                            <div id="sim-inv-bom" style="color:#059669;font-weight:700;margin-top:4px;">+100 Chai Thành Phẩm (Trừ đủ BOM)</div>
                        </div>
                    `
                }
            ],
            rules: [
                { icon: 'ph-calculator', title: 'Giá vốn Bình Quân Gia Quyền (MAC)', desc: 'Mỗi khi hoàn tất phiếu nhập hàng PO hoặc nhận hàng OEM, hệ thống tự động tính lại giá vốn bình quân gia quyền.' }
            ],
            tourSteps: [
                { tab: 'inventory', selector: '#sidebar-nav button[data-tab="inventory"]', title: '1. Mở Phân Hệ Kho Hàng & Định Mức', desc: 'Quản lý danh mục 935+ sản phẩm, nguyên vật liệu, kiểm kho và thẻ kho.' }
            ]
        },

        marketplace: {
            code: 'SOP-07',
            title: 'Đồng Bộ Đơn Sàn TMĐT (Shopee / TikTok) & Hoa Hồng KOC / KOL Affiliate',
            badge: 'Vận Hành Sàn & Marketing',
            targetTab: 'marketplace',
            summary: 'Nhập đơn hàng từ Shopee/TikTok qua Excel hoặc API, tự động ánh xạ SKU sàn về sản phẩm kho để khấu trừ tồn kho thực tế, đối soát phí sàn và theo dõi hiệu quả video KOC/KOL.',
            steps: [
                {
                    title: '1. Đồng Bộ Đơn Shopee / TikTok & Tự Động Trừ Kho Theo SKU',
                    shortcut: 'Tab Sàn TMĐT',
                    cursorPos: { top: '52px', left: '52%' },
                    cursorText: 'Khớp SKU MEOA035 -> Trừ 2 Gói',
                    typeTargetId: 'sim-mkt-net',
                    typeText: 'Thực nhận: 162.800đ (Đã trừ phí sàn)',
                    action: 'Tải file đơn hàng từ Shopee/TikTok Seller Center -> Ánh xạ SKU sàn vào sản phẩm trong kho -> Hệ thống tự động trừ tồn kho ngay khi đơn chuyển trạng thái Đang giao / Hoàn thành.',
                    warning: 'Đơn hoàn trả được cộng hoàn lại kho tự động khi cập nhật trạng thái trả hàng.',
                    simHtml: `
                        <div class="gsim-mock-box gsim-target-active" style="display:flex;justify-content:space-between;align-items:center;">
                            <div>
                                <strong>Đơn Shopee #261027ABC89 · Shopee Mall</strong>
                                <div style="color:#475569;margin-top:4px;">Khớp SKU: <code>MEOA035</code> -> Tự trừ kho 2 Gói MeO Adult 350g</div>
                            </div>
                            <div style="text-align:right;font-family:monospace;">
                                <div>Doanh thu đơn: 185.000đ</div>
                                <div id="sim-mkt-net" style="font-weight:700;color:#059669;">Thực nhận: 162.800đ</div>
                            </div>
                        </div>
                    `
                },
                {
                    title: '2. Quét Lượt Xem Video Thực Tế & Tính Hoa Hồng KOC / KOL',
                    shortcut: 'Sub-tab KOC / KOL',
                    cursorPos: { top: '54px', left: '56%' },
                    cursorText: 'Quét 142.850 views thật từ TikTok',
                    typeTargetId: 'sim-mkt-views',
                    typeText: '142.850 views · HH: 1.850.000đ',
                    action: 'Đồng bộ danh sách KOC/KOL từ Google Sheets, tự động quét lượt xem (Views), lượt tim, bình luận thực tế của video TikTok và tổng hợp doanh số gắn liền với từng KOC.',
                    warning: 'Chỉ sử dụng dữ liệu lượt xem thực tế từ link video, không dùng số liệu ước lượng.',
                    simHtml: `
                        <div class="gsim-mock-box gsim-target-active" style="display:flex;justify-content:space-between;align-items:center;">
                            <div>
                                <strong>KOC: linh.petcare · Chiến dịch Sữa tắm Q8</strong>
                                <div style="color:#475569;margin-top:4px;">Nguồn đồng bộ: Google Sheets + TikWM Video Scraper</div>
                            </div>
                            <div id="sim-mkt-views" style="font-family:monospace;font-weight:700;color:#0369a1;background:#f0f9ff;padding:4px 10px;border-radius:6px;border:1px solid #7dd3fc;">142.850 views · HH: 1.850.000đ</div>
                        </div>
                    `
                }
            ],
            rules: [
                { icon: 'ph-storefront', title: 'Đối soát Phí Sàn Minh Bạch', desc: 'Tách rõ Phí cố định, Phí dịch vụ, Phí thanh toán và Voucher shop tài trợ để tính đúng lợi nhuận ròng.' }
            ],
            tourSteps: [
                { tab: 'marketplace', selector: '#sidebar-nav button[data-tab="marketplace"]', title: '1. Mở Phân Hệ Sàn TMĐT & KOC', desc: 'Quản lý tập trung đơn hàng Shopee, TikTok Shop, đối soát phí sàn và theo dõi KOC/KOL.' }
            ]
        },

        hrm: {
            code: 'SOP-08',
            title: 'Nhân Sự HRM, Chấm Công, Hoa Hồng Đa Kênh & Bảng Lương Động',
            badge: 'Quản Lý Nhân Sự & Kế Toán Lương',
            targetTab: 'hrm',
            summary: 'Một danh sách nhân sự duy nhất đồng bộ xuyên suốt POS, Spa và Sàn TMĐT; tự động tính lương cơ bản theo ngày công, cộng phụ cấp, Hoa hồng bán hàng POS, Hoa hồng 4 vai trò Spa (Nhận/Tắm/Cắt/Nhuộm) và Tiền Tip.',
            steps: [
                {
                    title: '1. Đồng Bộ 2 Chiều Nhân Sự HRM & Sản Lượng Thợ Spa',
                    shortcut: 'Tab Nhân Sự / Tab Dịch Vụ',
                    cursorPos: { top: '52px', left: '54%' },
                    cursorText: 'Tự động đếm 28 Nhận · 124 Tắm · 55 Cắt',
                    typeTargetId: 'sim-hrm-comm',
                    typeText: 'HH Spa T10: 4.735.400đ',
                    action: 'Mỗi nhân viên thuộc bộ phận Spa & Grooming tự động xuất hiện ở tab Nhân Viên Spa kèm số ca Nhận (2%), Tắm (10%), Cắt (12%), Nhuộm (10%) và Tiền Tip thực tế trong tháng.',
                    warning: 'Nhân viên đã nghỉ việc (có Ngày nghỉ việc) tự động ẩn khỏi mọi droplist phân công và bảng lương mới.',
                    simHtml: `
                        <div class="gsim-mock-box gsim-target-active" style="display:flex;justify-content:space-between;align-items:center;">
                            <div>
                                <strong>#SPA33 · 4 Huyền Trân (Chuyên viên Spa)</strong>
                                <div style="color:#475569;margin-top:4px;font-family:monospace;">Tháng 10/2026: Nhận 28 · Tắm 124 · Cắt 55 · Nhuộm 0</div>
                            </div>
                            <div id="sim-hrm-comm" style="font-family:monospace;font-weight:700;color:#059669;font-size:13px;">HH Spa T10: 4.735.400đ</div>
                        </div>
                    `
                },
                {
                    title: '2. Tính Bảng Lương Động & Chi Lương Liên Thông Sổ Quỹ',
                    shortcut: 'Sub-tab Bảng Lương',
                    cursorPos: { top: '58px', left: '56%' },
                    cursorText: 'Bấm Tính Lương -> Thực lĩnh 10.818.733đ',
                    typeTargetId: 'sim-hrm-net',
                    typeText: '10.818.733đ',
                    action: 'Chọn kỳ lương tháng -> Bấm [Tính Lương Tự Động]: Hệ thống tự động cộng Lương ngày công + Phụ cấp + Hoa hồng POS + Hoa hồng Spa + Tiền Tip - Tạm ứng = Thực lĩnh.',
                    warning: 'Khi bấm Chi Lương, phần mềm tự động tạo phiếu chi trong Sổ Quỹ thuộc hạng mục "Chi lương & hoa hồng nhân viên".',
                    simHtml: `
                        <div class="gsim-mock-box gsim-target-active" style="font-family:monospace;">
                            <div style="display:flex;justify-content:space-between;"><span>Lương cơ bản theo công + Phụ cấp:</span><strong>6.000.000đ</strong></div>
                            <div style="display:flex;justify-content:space-between;color:#0284c7;"><span>+ Hoa hồng Dịch vụ Spa (207 ca):</span><strong>+4.735.400đ</strong></div>
                            <div style="display:flex;justify-content:space-between;color:#059669;"><span>+ Tiền Tip khách thưởng riêng:</span><strong>+83.333đ</strong></div>
                            <div style="display:flex;justify-content:space-between;border-top:1px solid #cbd5e1;margin-top:6px;padding-top:4px;font-weight:700;font-size:13px;">
                                <span>TỔNG THỰC LĨNH THÁNG 10:</span>
                                <span id="sim-hrm-net" style="color:#0369a1;">10.818.733đ</span>
                            </div>
                        </div>
                    `
                }
            ],
            rules: [
                { icon: 'ph-user-minus', title: 'Tự động lọc nhân sự nghỉ việc', desc: 'Nhân viên có trạng thái Ngừng hoạt động hoặc đã điền Ngày nghỉ việc sẽ tự động ẩn khỏi bảng chấm công và các ô chọn thợ.' }
            ],
            tourSteps: [
                { tab: 'hrm', selector: '#sidebar-nav button[data-tab="hrm"]', title: '1. Mở Phân Hệ Nhân Sự & Bảng Lương', desc: 'Quản lý hồ sơ nhân viên, chấm công, tạm ứng, cấu hình hoa hồng và bảng lương động.' }
            ]
        },

        ai_import: {
            code: 'SOP-09',
            title: 'Tác Nhân AI Copilot, 1-Chạm Gom Nháp NCC & Chuẩn Import KiotViet',
            badge: 'Quản Trị Dữ Liệu & Mua Hàng',
            targetTab: 'ai-agent',
            summary: 'Báo cáo đầu ca thông minh theo vai trò, phát hiện hàng chạm định mức tối thiểu để gom đơn nháp 1-chạm theo từng Nhà Cung Cấp, và quy trình vàng khi Import 3 loại file Excel KiotViet.',
            steps: [
                {
                    title: '1. Cảnh Báo Hàng Sắp Hết & 1-Chạm Gom Nháp Đơn Đặt Hàng NCC',
                    shortcut: 'Tab Tác Nhân AI -> Hàng Sắp Hết',
                    cursorPos: { top: '52px', left: '56%' },
                    cursorText: 'Bấm Gom Nháp NCC (Không đè chữ)',
                    typeTargetId: 'sim-ai-draft-btn',
                    typeText: 'Đã gom vào Đơn Nháp PO!',
                    action: 'Tại màn Tác Nhân AI, bấm vào thẻ [Hàng Sắp Hết Cần Đặt] -> Khung modal rộng (max-w-3xl) hiển thị rõ bộ lọc Đối Tác -> Bấm [Gom Nháp NCC] để AI tự động gom tất cả mặt hàng thiếu của cùng 1 NCC vào 1 đơn đặt hàng nháp.',
                    warning: 'Các mặt hàng đã nằm trong một đơn PO/OEM đang chờ giao sẽ hiển thị nhãn màu xanh [Đã đặt] để không bao giờ bị đặt trùng.',
                    simHtml: `
                        <div class="gsim-mock-box gsim-target-active" style="display:flex;justify-content:space-between;align-items:center;gap:12px;">
                            <div>
                                <strong>Sữa tắm Q8 - T1 - Hương nước hoa Pháp 2 lít</strong>
                                <div style="color:#475569;font-family:monospace;margin-top:4px;">Mã: SP008951 · Tồn kho: <strong style="color:#e11d48;">0 Can</strong> (Định mức tối thiểu: 5 Can)</div>
                            </div>
                            <span id="sim-ai-draft-btn" style="background:#f59e0b;color:#fff;padding:6px 12px;border-radius:6px;font-weight:700;white-space:nowrap;">Gom Nháp NCC</span>
                        </div>
                    `
                },
                {
                    title: '2. Quy Trình Vàng 3 Bước Khi Import Dữ Liệu Từ Excel KiotViet',
                    shortcut: 'Danh Bạ -> Kho Hàng -> Hóa Đơn',
                    cursorPos: { top: '56px', left: '54%' },
                    cursorText: 'Import 1.677 HĐ KiotViet (Giữ nguyên Kho & Sổ quỹ)',
                    typeTargetId: 'sim-ai-kv-res',
                    typeText: '1.677 HĐ · 3.337 món · 0 SP rác',
                    action: 'Luôn import theo thứ tự: (1) Danh bạ Khách hàng & NCC (13.218 KH) -> (2) Danh mục Hàng hóa 2-Pass (935 SP) -> (3) Chi tiết Hóa đơn KiotViet 64 cột (1.677 HĐ lịch sử).',
                    warning: 'Khi import file Chi tiết Hóa đơn KiotViet (64 cột), hệ thống chỉ lưu lịch sử tra cứu & đối soát, bảo toàn 100% Tồn kho hiện tại, Sổ quỹ và Công nợ đã chốt.',
                    simHtml: `
                        <div class="gsim-mock-grid2">
                            <div class="gsim-mock-box">
                                <strong>1. Danh Bạ & 2. Hàng Hóa 2-Pass</strong>
                                <div style="color:#475569;margin-top:4px;">13.218 KH (chốt nợ hiện tại) + 935 SP chuẩn (kèm ĐVT quy đổi item_units).</div>
                            </div>
                            <div class="gsim-mock-box gsim-target-active" style="background:#ecfdf5;border-color:#6ee7b7;">
                                <strong style="color:#065f46;">3. Hóa Đơn KiotViet (64 Cột)</strong>
                                <div id="sim-ai-kv-res" style="font-family:monospace;font-weight:700;color:#047857;margin-top:4px;">1.677 HĐ · 3.337 món · 0 SP rác</div>
                            </div>
                        </div>
                    `
                }
            ],
            rules: [
                { icon: 'ph-database', title: 'Bảo vệ tuyệt đối Danh mục 935 Sản phẩm chuẩn', desc: 'Khi import hóa đơn lịch sử, hệ thống khớp theo Mã hàng -> Tên hàng + ĐVT quy đổi; tuyệt đối không tự tạo sản phẩm rác vào kho.' }
            ],
            tourSteps: [
                { tab: 'ai-agent', selector: '#sidebar-nav button[data-tab="ai-agent"]', title: '1. Trung Tâm Tác Nhân AI Copilot', desc: 'Màn hình chào ca thông minh, quản lý việc cần làm, bóc tách chứng từ bằng AI và cảnh báo hàng sắp hết.' }
            ]
        },

        setup: {
            code: 'SOP-10',
            title: 'Kết Nối Mạng LAN, Cập Nhật 1-Chạm & Tùy Biến 12 Mẫu In Nghiệp Vụ',
            badge: 'Quản Trị Hệ Thống',
            targetTab: 'settings',
            summary: 'Hướng dẫn kết nối máy con/điện thoại qua mạng LAN nội bộ, cập nhật phần mềm 1 chạm và thiết kế 12 mẫu in chuyên sâu (K80 nhiệt tự cắt giấy & Hóa đơn A4 bán sỉ 9 cột chuẩn kế toán).',
            steps: [
                {
                    title: '1. Thiết Kế 12 Mẫu In: K80 Siêu Đậm & Hóa Đơn Bán Sỉ A4 Chuẩn 9 Cột',
                    shortcut: 'Tab Cài Đặt -> Mẫu In',
                    cursorPos: { top: '52px', left: '36%' },
                    cursorText: 'Lưu thành mẫu mới (Không đè mẫu gốc)',
                    typeTargetId: 'sim-setup-tpl',
                    typeText: 'Mẫu A4 Bán Sỉ (9 Cột + VietQR + 3 Chữ ký)',
                    action: 'Hỗ trợ 12 mẫu in độc lập (Bán lẻ K80, Bán sỉ A4 9 cột: TT, SKU, Tên, ĐVT, Giá, Giảm giá, SL, Thành tiền, Ghi chú; 3 ô chân trang: Ngân hàng, VietQR, Tổng kết; 3 cột chữ ký). Có nút lưu thành mẫu mới mà không ghi đè mẫu mặc định.',
                    warning: 'Bật tùy chọn [In Đậm Toàn Bộ] cho từng loại phiếu để chữ đen sắc nét trên mọi dòng máy in nhiệt K80.',
                    simHtml: `
                        <div class="gsim-mock-box gsim-target-active">
                            <div id="sim-setup-tpl" style="font-weight:700;color:#0369a1;font-size:13px;">Mẫu A4 Bán Sỉ (9 Cột + VietQR + 3 Chữ ký)</div>
                            <div style="color:#475569;margin-top:4px;">9 cột chuẩn kế toán: TT | Mã SKU | Tên hàng | ĐVT | Đơn giá | Giảm giá | SL | Thành tiền | Ghi chú. Chân trang có Thông tin NH, VietQR động và 3 cột chữ ký.</div>
                        </div>
                    `
                },
                {
                    title: '2. Kết Nối Máy Phụ Mạng LAN & Tối Ưu Tốc Độ Truy Vấn (10 Indexes)',
                    shortcut: 'KET_NOI_MAY_CON.bat / CAP_NHAT_1_CHAM.bat',
                    cursorPos: { top: '55px', left: '54%' },
                    cursorText: 'Truy vấn 13.218 KH & 24.447 phiếu < 180ms',
                    typeTargetId: 'sim-setup-perf',
                    typeText: 'Nhanh gấp 51 lần (180ms)',
                    action: 'Tại máy trạm phụ: Chạy KET_NOI_MAY_CON.bat để tự động dò IP máy chủ trong mạng LAN. Khi có bản nâng cấp mới: Chạy CAP_NHAT_1_CHAM.bat để tự động tải bản mới và bảo toàn 100% cơ sở dữ liệu data/pos.db.',
                    warning: 'Hệ thống đã đánh 10 Composite Index chuẩn (cột lọc trước, cột sắp xếp sau) giúp loại bỏ hoàn toàn Sequential Scan và TEMP B-TREE.',
                    simHtml: `
                        <div class="gsim-mock-box gsim-target-active" style="display:flex;justify-content:space-between;align-items:center;">
                            <div>
                                <strong>SQLite WAL Mode + 10 Composite Indexes</strong>
                                <div style="color:#475569;margin-top:4px;">Loại bỏ hoàn toàn Sequential Scan trên 24.447 phiếu Spa & 13.218 Khách hàng</div>
                            </div>
                            <span id="sim-setup-perf" style="font-family:monospace;font-weight:700;background:#ecfdf5;color:#047857;border:1px solid #6ee7b7;padding:4px 10px;border-radius:6px;">Nhanh gấp 51 lần (180ms)</span>
                        </div>
                    `
                }
            ],
            rules: [
                { icon: 'ph-magnifying-glass-plus', title: 'Phóng to / Thu nhỏ giao diện (Zoom 80% - 150%)', desc: 'Sử dụng cụm nút [-] [100%] [+] ở góc dưới thanh menu trái để điều chỉnh tỷ lệ chữ phù hợp với màn hình quầy thu ngân.' }
            ],
            tourSteps: [
                { tab: 'settings', selector: '#sidebar-nav button[data-tab="settings"]', title: '1. Mở Phân Hệ Cài Đặt Hệ Thống & Mẫu In', desc: 'Thiết lập thông tin cửa hàng, tài khoản ngân hàng VietQR, phân quyền nhân viên và tùy chỉnh 12 mẫu in.' }
            ]
        }
    };

    function runStepTypingAnimation(step) {
        if (typingTimer) {
            clearInterval(typingTimer);
            typingTimer = null;
        }
        if (!step || !step.typeTargetId || !step.typeText) return;
        const el = document.getElementById(step.typeTargetId);
        if (!el) return;
        const full = step.typeText;
        let i = 0;
        el.textContent = '';
        typingTimer = setInterval(() => {
            i += 2;
            if (i >= full.length) {
                el.textContent = full;
                clearInterval(typingTimer);
                typingTimer = null;
            } else {
                el.textContent = full.slice(0, i) + '▋';
            }
        }, 45);
    }

    function renderGuideContent(subId, stepIdx) {
        injectGuideSimulatorStyles();
        const data = GUIDE_SOP_DATA[subId] || GUIDE_SOP_DATA.pos;
        currentGuideKey = subId in GUIDE_SOP_DATA ? subId : 'pos';
        const steps = data.steps || [];
        if (stepIdx === undefined || stepIdx < 0 || stepIdx >= steps.length) {
            stepIdx = 0;
        }
        currentStepIdx = stepIdx;
        const activeStep = steps[currentStepIdx];

        const container = document.getElementById('guide-dynamic-container');
        if (!container) return;

        const stepTabsHtml = steps.map((st, idx) => {
            const isAct = idx === currentStepIdx;
            return `
                <button type="button" onclick="selectGuideSimStep(${idx})" class="gsim-step-tab ${isAct ? 'active' : ''}">
                    <span class="gsim-step-num">${idx + 1}</span>
                    <span>${st.title.replace(/^\d+\.\s*/, '')}</span>
                </button>
            `;
        }).join('');

        const allStepsCardsHtml = steps.map((st, idx) => {
            const isAct = idx === currentStepIdx;
            return `
                <div onclick="selectGuideSimStep(${idx})" class="gsim-step-card ${isAct ? 'active' : ''}">
                    <div style="display:flex;align-items:center;justify-content:space-between;gap:8px;margin-bottom:4px;">
                        <strong style="font-size:13px;color:#0f172a;">${st.title}</strong>
                        <span class="gsim-kbd">${st.shortcut}</span>
                    </div>
                    <div style="color:#334155;">${st.action}</div>
                    <div class="gsim-warn-box">
                        <strong>Lưu ý nghiệp vụ:</strong> ${st.warning}
                    </div>
                </div>
            `;
        }).join('');

        const rulesHtml = (data.rules || []).map(r => `
            <div class="gsim-card" style="margin-bottom:8px;">
                <div style="font-weight:700;color:#0f172a;margin-bottom:4px;display:flex;align-items:center;gap:6px;">
                    <i class="ph ${r.icon}" style="color:#0284c7;"></i>
                    <span>${r.title}</span>
                </div>
                <div style="color:#475569;">${r.desc}</div>
            </div>
        `).join('');

        const cTop = (activeStep.cursorPos && activeStep.cursorPos.top) || '55px';
        const cLeft = (activeStep.cursorPos && activeStep.cursorPos.left) || '50%';
        const cText = activeStep.cursorText || 'Thao tác tại đây';

        container.innerHTML = `
            <div class="gsim-root">
                <!-- 1. HEADER & NÚT ĐIỀU KHIỂN MÔ PHỎNG -->
                <div class="gsim-tray">
                    <div class="gsim-card gsim-header">
                        <div style="flex:1;min-width:240px;">
                            <div class="gsim-badges">
                                <span class="gsim-badge-code">${data.code}</span>
                                <span class="gsim-badge-role">${data.badge}</span>
                            </div>
                            <h2 class="gsim-title">${data.title}</h2>
                            <p class="gsim-summary">${data.summary}</p>
                        </div>
                        <div class="gsim-btn-row">
                            <button type="button" onclick="toggleGuideAutoPlay()" class="gsim-btn gsim-btn-play ${isAutoPlaying ? 'playing' : ''}">
                                <span>${isAutoPlaying ? '⏸ Tạm Dừng Mô Phỏng' : '▶ Tự Động Chạy Mô Phỏng'}</span>
                            </button>
                            <button type="button" onclick="startLiveSpotlightTour('${currentGuideKey}')" class="gsim-btn gsim-btn-primary">
                                <span>🧭 Dẫn Đường Trên Màn Hình Thật</span>
                            </button>
                        </div>
                    </div>
                </div>

                <!-- 2. SÂN KHẤU MÔ PHỎNG ĐỘNG (ANIMATED SANDBOX STAGE) -->
                <div class="gsim-tray">
                    <div class="gsim-card">
                        <div style="display:flex;flex-wrap:wrap;align-items:center;justify-content:space-between;gap:8px;">
                            <div style="font-weight:700;color:#0f172a;text-transform:uppercase;font-size:11.5px;display:flex;align-items:center;gap:6px;">
                                <span style="width:9px;height:9px;border-radius:99px;background:${isAutoPlaying ? '#10b981' : '#0284c7'};display:inline-block;"></span>
                                <span>Sân Khấu Mô Phỏng Thao Tác Động — Bước ${currentStepIdx + 1} / ${steps.length} ${isAutoPlaying ? '(Đang tự động chạy...)' : '(Bấm vào từng bước hoặc bấm Tự Động Chạy)'}</span>
                            </div>
                            <div style="display:flex;gap:6px;">
                                <button type="button" onclick="stepGuideSim(-1)" class="gsim-btn" style="padding:4px 10px;font-size:11.5px;">← Bước trước</button>
                                <button type="button" onclick="stepGuideSim(1)" class="gsim-btn" style="padding:4px 10px;font-size:11.5px;background:#f0f9ff;color:#0369a1;border-color:#7dd3fc;">Bước tiếp →</button>
                            </div>
                        </div>

                        <div class="gsim-step-tabs">
                            ${stepTabsHtml}
                        </div>

                        <div class="gsim-progress-track">
                            <div class="gsim-progress-bar" style="width: ${((currentStepIdx + 1) / steps.length) * 100}%;"></div>
                        </div>

                        <!-- Màn hình mô phỏng có Con Trỏ Ảo & Gõ Phím Tự Động -->
                        <div class="gsim-stage-wrap">
                            <div class="gsim-stage-topbar">
                                <div class="gsim-dots">
                                    <span class="gsim-dot" style="background:#f43f5e;"></span>
                                    <span class="gsim-dot" style="background:#f59e0b;"></span>
                                    <span class="gsim-dot" style="background:#10b981;"></span>
                                    <strong style="margin-left:6px;color:#e2e8f0;">Mô Phỏng Trực Quan: ${activeStep.title}</strong>
                                </div>
                                <span style="font-family:monospace;color:#38bdf8;">Phím tắt: ${activeStep.shortcut}</span>
                            </div>

                            <div class="gsim-screen" id="gsim-live-screen">
                                <div class="gsim-action-banner">
                                    <div><strong>Thao tác:</strong> ${activeStep.action}</div>
                                    <span class="gsim-kbd">${activeStep.shortcut}</span>
                                </div>

                                <!-- Nội dung mô phỏng của bước -->
                                <div style="position:relative;padding-top:4px;">
                                    ${activeStep.simHtml}

                                    <!-- Con trỏ ảo chuyển động tự động -->
                                    <div class="gsim-cursor" id="gsim-virtual-cursor" style="top:${cTop};left:${cLeft};">
                                        <div class="gsim-cursor-pointer"><div class="gsim-cursor-dot"></div></div>
                                        <span class="gsim-cursor-label">${cText}</span>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>

                <!-- 3. DANH SÁCH TỪNG BƯỚC & QUY TẮC CỐT LÕI -->
                <div class="gsim-bottom-grid">
                    <div>
                        <div style="font-weight:700;text-transform:uppercase;font-size:11px;color:#475569;margin-bottom:6px;">
                            Chi Tiết Quy Trình (${steps.length} Bước — Click vào bước bất kỳ để chạy mô phỏng)
                        </div>
                        ${allStepsCardsHtml}
                    </div>
                    <div>
                        <div style="font-weight:700;text-transform:uppercase;font-size:11px;color:#475569;margin-bottom:6px;">
                            Quy Tắc Nghiệp Vụ Bắt Buộc
                        </div>
                        ${rulesHtml}
                        <div class="gsim-card" style="background:#f0f9ff;border-color:#7dd3fc;">
                            <div style="font-weight:700;color:#075985;margin-bottom:4px;">Thực hành trực tiếp trên phần mềm</div>
                            <p style="color:#334155;margin:0 0 8px 0;">Bấm nút dưới đây để hệ thống chuyển sang màn hình thật và khoanh sáng dẫn đường từng nút bấm.</p>
                            <button type="button" onclick="startLiveSpotlightTour('${currentGuideKey}')" class="gsim-btn gsim-btn-primary" style="width:100%;justify-content:center;">
                                <span>🧭 Bắt Đầu Dẫn Đường Trực Tiếp</span>
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        `;

        runStepTypingAnimation(activeStep);
    }

    function selectGuideSimStep(idx) {
        renderGuideContent(currentGuideKey, idx);
    }

    function stepGuideSim(delta) {
        const data = GUIDE_SOP_DATA[currentGuideKey] || GUIDE_SOP_DATA.pos;
        const len = (data.steps || []).length || 1;
        const nextIdx = (currentStepIdx + delta + len) % len;
        renderGuideContent(currentGuideKey, nextIdx);
    }

    function stopGuideAutoPlay() {
        isAutoPlaying = false;
        if (autoPlayTimer) {
            clearInterval(autoPlayTimer);
            autoPlayTimer = null;
        }
    }

    function toggleGuideAutoPlay() {
        if (isAutoPlaying) {
            stopGuideAutoPlay();
            renderGuideContent(currentGuideKey, currentStepIdx);
        } else {
            isAutoPlaying = true;
            renderGuideContent(currentGuideKey, currentStepIdx);
            autoPlayTimer = setInterval(() => {
                const tabGuide = document.getElementById('tab-guide');
                if (tabGuide && tabGuide.classList.contains('hidden')) {
                    stopGuideAutoPlay();
                    return;
                }
                stepGuideSim(1);
            }, 2600);
        }
    }

    function filterGuideNavByKeyword(q) {
        const kw = (q || '').trim().toLowerCase();
        const buttons = document.querySelectorAll('.guide-nav-btn');
        let firstMatchKey = null;
        buttons.forEach(btn => {
            const key = btn.dataset.guide;
            const data = GUIDE_SOP_DATA[key];
            const hay = data
                ? `${data.title} ${data.summary} ${data.steps.map(s => s.title + ' ' + s.action + ' ' + s.shortcut).join(' ')}`.toLowerCase()
                : btn.textContent.toLowerCase();
            if (!kw || hay.includes(kw)) {
                btn.style.display = '';
                if (!firstMatchKey) firstMatchKey = key;
            } else {
                btn.style.display = 'none';
            }
        });
        if (kw && firstMatchKey && firstMatchKey !== currentGuideKey) {
            window.switchGuideSubTab(firstMatchKey);
        }
    }

    var activeTourSteps = [];
    var activeTourIdx = 0;

    function ensureTourOverlayElements() {
        let root = document.getElementById('elaya-spotlight-tour-root');
        if (root) return root;
        root = document.createElement('div');
        root.id = 'elaya-spotlight-tour-root';
        root.style.cssText = 'display:none;position:fixed;inset:0;z-index:9999;pointer-events:none;font-family:sans-serif;';
        root.innerHTML = `
            <div id="elaya-tour-highlight" style="position:fixed;border-radius:12px;transition:all 0.3s ease;pointer-events:none;box-shadow:0 0 0 9999px rgba(15,23,42,0.62), 0 0 0 3px #0284c7, 0 0 0 6px rgba(2,132,199,0.28);"></div>
            <div id="elaya-tour-popover" style="position:fixed;background:#ffffff;border-radius:14px;border:1px solid #cbd5e1;box-shadow:0 20px 25px -5px rgba(0,0,0,0.25);padding:14px;width:320px;max-width:92vw;pointer-events:auto;transition:all 0.3s ease;font-size:12px;color:#0f172a;">
                <div style="display:flex;align-items:center;justify-content:space-between;border-bottom:1px solid #f1f5f9;padding-bottom:8px;margin-bottom:8px;">
                    <span id="elaya-tour-step-badge" style="padding:2px 8px;border-radius:6px;background:#0284c7;color:#fff;font-family:monospace;font-weight:700;font-size:11px;">Bước 1/3</span>
                    <button type="button" onclick="stopLiveSpotlightTour()" style="background:none;border:none;color:#64748b;font-weight:700;font-size:13px;cursor:pointer;">&times; Đóng</button>
                </div>
                <div id="elaya-tour-title" style="font-weight:700;font-size:14px;color:#0f172a;margin-bottom:4px;"></div>
                <p id="elaya-tour-desc" style="color:#475569;line-height:1.45;margin:0 0 10px 0;"></p>
                <div style="display:flex;align-items:center;justify-content:space-between;padding-top:8px;border-top:1px solid #f1f5f9;">
                    <button type="button" id="elaya-tour-prev" onclick="moveLiveSpotlightStep(-1)" style="padding:5px 10px;border-radius:6px;border:1px solid #cbd5e1;background:#fff;color:#475569;font-weight:600;cursor:pointer;">← Trước</button>
                    <div style="display:flex;gap:6px;">
                        <button type="button" onclick="stopLiveSpotlightTour(true)" style="padding:5px 10px;border-radius:6px;border:1px solid #cbd5e1;background:#f1f5f9;color:#334155;font-weight:600;cursor:pointer;">Về Hướng Dẫn</button>
                        <button type="button" id="elaya-tour-next" onclick="moveLiveSpotlightStep(1)" style="padding:5px 12px;border-radius:6px;border:none;background:#0284c7;color:#fff;font-weight:700;cursor:pointer;">Tiếp theo →</button>
                    </div>
                </div>
            </div>
        `;
        document.body.appendChild(root);
        return root;
    }

    function startLiveSpotlightTour(guideKey) {
        stopGuideAutoPlay();
        const data = GUIDE_SOP_DATA[guideKey] || GUIDE_SOP_DATA[currentGuideKey] || GUIDE_SOP_DATA.pos;
        if (!document.getElementById('sidebar-nav')) {
            toggleGuideAutoPlay();
            return;
        }
        activeTourSteps = data.tourSteps || [];
        if (activeTourSteps.length === 0) return;
        activeTourIdx = 0;
        const root = ensureTourOverlayElements();
        root.style.display = 'block';
        renderCurrentSpotlightStep();
    }

    function renderCurrentSpotlightStep() {
        const step = activeTourSteps[activeTourIdx];
        if (!step) {
            stopLiveSpotlightTour();
            return;
        }
        if (step.tab && typeof window.switchTab === 'function') {
            window.switchTab(step.tab);
        }
        setTimeout(() => {
            const hl = document.getElementById('elaya-tour-highlight');
            const pop = document.getElementById('elaya-tour-popover');
            const badge = document.getElementById('elaya-tour-step-badge');
            const titleEl = document.getElementById('elaya-tour-title');
            const descEl = document.getElementById('elaya-tour-desc');
            const prevBtn = document.getElementById('elaya-tour-prev');
            const nextBtn = document.getElementById('elaya-tour-next');
            if (!hl || !pop) return;

            badge.textContent = `Bước ${activeTourIdx + 1}/${activeTourSteps.length}`;
            titleEl.textContent = step.title;
            descEl.textContent = step.desc;
            prevBtn.style.visibility = activeTourIdx > 0 ? 'visible' : 'hidden';
            nextBtn.textContent = activeTourIdx === activeTourSteps.length - 1 ? '✓ Hoàn tất' : 'Tiếp theo →';

            const targetEl = step.selector ? document.querySelector(step.selector) : null;
            if (targetEl) {
                try { targetEl.scrollIntoView({ behavior: 'smooth', block: 'center' }); } catch (e) {}
                const rect = targetEl.getBoundingClientRect();
                const pad = 6;
                hl.style.top = Math.max(4, rect.top - pad) + 'px';
                hl.style.left = Math.max(4, rect.left - pad) + 'px';
                hl.style.width = Math.max(40, rect.width + pad * 2) + 'px';
                hl.style.height = Math.max(32, rect.height + pad * 2) + 'px';

                const popTop = (rect.bottom + 14 + 200 < window.innerHeight)
                    ? (rect.bottom + 14)
                    : Math.max(16, rect.top - 195);
                const popLeft = Math.min(window.innerWidth - 340, Math.max(16, rect.left));
                pop.style.top = popTop + 'px';
                pop.style.left = popLeft + 'px';
            } else {
                hl.style.top = '50%';
                hl.style.left = '50%';
                hl.style.width = '0px';
                hl.style.height = '0px';
                pop.style.top = '20%';
                pop.style.left = 'calc(50% - 160px)';
            }
        }, 260);
    }

    function moveLiveSpotlightStep(delta) {
        const next = activeTourIdx + delta;
        if (next < 0) return;
        if (next >= activeTourSteps.length) {
            stopLiveSpotlightTour();
            return;
        }
        activeTourIdx = next;
        renderCurrentSpotlightStep();
    }

    function stopLiveSpotlightTour(backToGuide = false) {
        const root = document.getElementById('elaya-spotlight-tour-root');
        if (root) root.style.display = 'none';
        if (backToGuide && typeof window.switchTab === 'function') {
            window.switchTab('guide', currentGuideKey);
        }
    }

    window.renderGuideContent = renderGuideContent;
    window.selectGuideSimStep = selectGuideSimStep;
    window.stepGuideSim = stepGuideSim;
    window.toggleGuideAutoPlay = toggleGuideAutoPlay;
    window.filterGuideNavByKeyword = filterGuideNavByKeyword;
    window.startLiveSpotlightTour = startLiveSpotlightTour;
    window.moveLiveSpotlightStep = moveLiveSpotlightStep;
    window.stopLiveSpotlightTour = stopLiveSpotlightTour;

    window.switchGuideSubTab = function (subId) {
        stopGuideAutoPlay();
        const key = (subId && subId in GUIDE_SOP_DATA) ? subId : 'pos';
        currentGuideKey = key;

        const buttons = document.querySelectorAll('.guide-nav-btn');
        buttons.forEach(btn => {
            const guideKey = btn.dataset.guide;
            const badge = btn.querySelector('.guide-step-num');
            if (guideKey === key) {
                btn.classList.add('active');
                btn.className = "guide-nav-btn active w-full flex items-center justify-between px-2.5 py-2 rounded-xl font-bold bg-sky-50 text-sky-800 border border-sky-300 transition cursor-pointer";
                if (badge) badge.className = "guide-step-num w-5 h-5 rounded-lg bg-sky-600 text-white flex items-center justify-center text-xs font-mono font-bold shrink-0";
            } else {
                btn.classList.remove('active');
                btn.className = "guide-nav-btn w-full flex items-center justify-between px-2.5 py-2 rounded-xl font-medium text-slate-600 hover:bg-slate-100 border border-slate-200/70 bg-white transition cursor-pointer";
                if (badge) badge.className = "guide-step-num w-5 h-5 rounded-lg bg-slate-200 text-slate-700 flex items-center justify-center text-xs font-mono font-bold shrink-0";
            }
        });

        isAutoPlaying = true;
        renderGuideContent(key, 0);
        autoPlayTimer = setInterval(() => {
            const tabGuide = document.getElementById('tab-guide');
            if (tabGuide && tabGuide.classList.contains('hidden')) {
                stopGuideAutoPlay();
                return;
            }
            stepGuideSim(1);
        }, 2800);
        const contentArea = document.getElementById('guide-content-area');
        if (contentArea) contentArea.scrollTop = 0;
    };

    if (document.getElementById('guide-dynamic-container')) {
        renderGuideContent('pos', 0);
    }
    document.addEventListener('DOMContentLoaded', () => {
        if (document.getElementById('guide-dynamic-container')) {
            renderGuideContent('pos', 0);
        }
    });
})();
