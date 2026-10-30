// reports_analytics.js - Báo Cáo Kinh Doanh Đa Chiều & Dashboard Biểu Đồ Trực Quan

let currentReportsData = null;
let activeReportsSubTab = 'tab-sub-overview';
let activeQuickFilter = '7days';
let reportsTimelineMode = 'kv4'; // 'kv4' (4 đường KiotViet) hoặc 'stacked' (Cột chồng 3 kênh)
let reportsCatFilterMode = 'exclude'; // 'exclude' hoặc 'include'
let reportsSelectedCats = new Set();

try {
    const savedMode = localStorage.getItem('pos_rep_cat_mode');
    if (savedMode === 'include' || savedMode === 'exclude') reportsCatFilterMode = savedMode;
    const savedList = JSON.parse(localStorage.getItem('pos_rep_cat_list') || 'null');
    if (Array.isArray(savedList)) reportsSelectedCats = new Set(savedList);
} catch (_) {}

function saveReportsCatFilterState() {
    try {
        localStorage.setItem('pos_rep_cat_mode', reportsCatFilterMode);
        localStorage.setItem('pos_rep_cat_list', JSON.stringify([...reportsSelectedCats]));
    } catch (_) {}
}

function toggleReportsCatPopover(e) {
    if (e) e.stopPropagation();
    const pop = document.getElementById('rep-cat-popover');
    if (pop) pop.classList.toggle('hidden');
}
window.toggleReportsCatPopover = toggleReportsCatPopover;

document.addEventListener('click', () => {
    const pop = document.getElementById('rep-cat-popover');
    if (pop && !pop.classList.contains('hidden')) pop.classList.add('hidden');
});

function setReportsCatMode(mode) {
    reportsCatFilterMode = mode === 'include' ? 'include' : 'exclude';
    const btnEx = document.getElementById('rep-catmode-exclude');
    const btnInc = document.getElementById('rep-catmode-include');
    if (btnEx) {
        btnEx.className = reportsCatFilterMode === 'exclude'
            ? 'px-2.5 py-1 rounded-md text-xs font-bold bg-rose-600 text-white transition cursor-pointer'
            : 'px-2.5 py-1 rounded-md text-xs font-bold text-slate-600 hover:text-slate-900 transition cursor-pointer';
    }
    if (btnInc) {
        btnInc.className = reportsCatFilterMode === 'include'
            ? 'px-2.5 py-1 rounded-md text-xs font-bold bg-emerald-600 text-white transition cursor-pointer'
            : 'px-2.5 py-1 rounded-md text-xs font-bold text-slate-600 hover:text-slate-900 transition cursor-pointer';
    }
    saveReportsCatFilterState();
    loadReportsAnalytics();
}
window.setReportsCatMode = setReportsCatMode;

function toggleReportsCategoryItem(catName) {
    if (!catName) return;
    if (reportsSelectedCats.has(catName)) reportsSelectedCats.delete(catName);
    else reportsSelectedCats.add(catName);
    saveReportsCatFilterState();
    loadReportsAnalytics();
}
window.toggleReportsCategoryItem = toggleReportsCategoryItem;

function applyReportsSpecialPreset(preset) {
    if (preset === 'no_ship_pet') {
        reportsCatFilterMode = 'exclude';
        reportsSelectedCats = new Set(['Vận chuyển', 'Thú Cưng']);
    } else {
        reportsCatFilterMode = 'exclude';
        reportsSelectedCats.clear();
    }
    setReportsCatMode(reportsCatFilterMode);
}
window.applyReportsSpecialPreset = applyReportsSpecialPreset;

function setReportsTimelineMode(mode) {
    reportsTimelineMode = mode === 'stacked' ? 'stacked' : 'kv4';
    const bKv = document.getElementById('btn-chartmode-kv4');
    const bSt = document.getElementById('btn-chartmode-stacked');
    if (bKv) {
        bKv.className = reportsTimelineMode === 'kv4'
            ? 'px-2.5 py-1 rounded-md bg-sky-600 text-white transition cursor-pointer'
            : 'px-2.5 py-1 rounded-md text-slate-600 hover:text-slate-900 transition cursor-pointer';
    }
    if (bSt) {
        bSt.className = reportsTimelineMode === 'stacked'
            ? 'px-2.5 py-1 rounded-md bg-sky-600 text-white transition cursor-pointer'
            : 'px-2.5 py-1 rounded-md text-slate-600 hover:text-slate-900 transition cursor-pointer';
    }
    if (currentReportsData) renderVisualCharts(currentReportsData);
}
window.setReportsTimelineMode = setReportsTimelineMode;

// Instances của Chart.js để hủy trước khi vẽ lại
let chartTimelineInstance = null;
let chartRevenueMixInstance = null;
let chartPaymentsInstance = null;
let chartStaffInstance = null;

function initReportsAnalytics() {
    const fromInput = document.getElementById('rep-filter-from');
    const toInput = document.getElementById('rep-filter-to');
    if (fromInput && toInput && (!fromInput.value || !toInput.value)) {
        // Mặc định mở 7 ngày qua để biểu đồ 4 đường KiotViet lên xu hướng đẹp mắt ngay khi vào
        selectQuickDateFilter('7days');
        return;
    }

    // Khôi phục sub-tab đang chọn (bởi switchTab('[id^="tab-"]') của app.js đã gắn class 'hidden' vào #tab-sub-overview)
    switchReportsSubTab(activeReportsSubTab || 'tab-sub-overview');

    // Load dữ liệu
    loadReportsAnalytics();
}

function selectQuickDateFilter(type) {
    activeQuickFilter = type;
    const now = new Date();
    const pad = n => String(n).padStart(2, '0');
    const fmt = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

    let fromD = new Date();
    let toD = new Date();

    if (type === 'today') {
        fromD = now;
        toD = now;
    } else if (type === 'yesterday') {
        fromD = new Date(now.getTime() - 24 * 60 * 60 * 1000);
        toD = fromD;
    } else if (type === '7days') {
        fromD = new Date(now.getTime() - 6 * 24 * 60 * 60 * 1000);
        toD = now;
    } else if (type === 'this_month') {
        fromD = new Date(now.getFullYear(), now.getMonth(), 1);
        toD = now;
    } else if (type === 'last_month') {
        fromD = new Date(now.getFullYear(), now.getMonth() - 1, 1);
        toD = new Date(now.getFullYear(), now.getMonth(), 0);
    }

    const fromInput = document.getElementById('rep-filter-from');
    const toInput = document.getElementById('rep-filter-to');
    if (fromInput) fromInput.value = fmt(fromD);
    if (toInput) toInput.value = fmt(toD);

    // Cập nhật giao diện nút pill
    document.querySelectorAll('.rep-quick-pill').forEach(btn => {
        if (btn.dataset.pill === type) {
            btn.classList.add('bg-sky-600', 'text-white', 'shadow-xs');
            btn.classList.remove('bg-white', 'text-slate-600', 'border');
        } else {
            btn.classList.remove('bg-sky-600', 'text-white', 'shadow-xs');
            btn.classList.add('bg-white', 'text-slate-600', 'border');
        }
    });

    loadReportsAnalytics();
}

function switchReportsSubTab(subTabId) {
    activeReportsSubTab = subTabId;
    document.querySelectorAll('.rep-subtab-pane').forEach(el => el.classList.add('hidden'));
    document.getElementById(subTabId)?.classList.remove('hidden');

    document.querySelectorAll('.rep-subtab-btn').forEach(btn => {
        if (btn.dataset.target === subTabId) {
            btn.classList.add('border-sky-600', 'text-sky-600', 'font-bold');
            btn.classList.remove('border-transparent', 'text-slate-500');
        } else {
            btn.classList.remove('border-sky-600', 'text-sky-600', 'font-bold');
            btn.classList.add('border-transparent', 'text-slate-500');
        }
    });

    // Nếu chuyển sang tab biểu đồ thì kích hoạt resize/render lại
    if (subTabId === 'tab-sub-overview' && currentReportsData) {
        renderVisualCharts(currentReportsData);
    }
}

function renderReportsSkeleton() {
    // KPI skeletons
    const kpiIds = ['rep-kpi-revenue', 'rep-kpi-paid', 'rep-kpi-debt', 'rep-kpi-aov'];
    kpiIds.forEach(id => {
        const el = document.getElementById(id);
        if (el) el.innerHTML = '<span class="inline-block h-6 w-28 bg-slate-200 animate-pulse rounded"></span>';
    });

    // Table skeletons
    if (typeof renderTableSkeleton === 'function') {
        renderTableSkeleton('table-rep-payments', 3, 5);
        renderTableSkeleton('rep-table-staff', 3, 6);
        renderTableSkeleton('rep-table-products', 5, 7);
    }
}

async function loadReportsAnalytics() {
    const fromVal = document.getElementById('rep-filter-from')?.value || '';
    const toVal = document.getElementById('rep-filter-to')?.value || '';

    const btnRefresh = document.getElementById('btn-rep-refresh');
    if (btnRefresh) btnRefresh.classList.add('animate-spin');
    if (typeof startPageLoader === 'function') startPageLoader();

    // Hiển thị skeleton ngay lập tức
    renderReportsSkeleton();

    try {
        const catListParam = [...reportsSelectedCats].join('||');
        const url = `/api/reports/analytics?from_date=${encodeURIComponent(fromVal)}&to_date=${encodeURIComponent(toVal)}&cat_mode=${encodeURIComponent(reportsCatFilterMode)}&cat_list=${encodeURIComponent(catListParam)}`;
        const headers = { 'Accept': 'application/json' };
        if (typeof Auth !== 'undefined' && Auth.getToken()) {
            headers['Authorization'] = `Bearer ${Auth.getToken()}`;
        }

        const res = await fetch(url, { headers });
        if (!res.ok) {
            if (res.status === 401 && typeof showLoginOverlay === 'function') {
                showLoginOverlay();
            }
            throw new Error(`Lỗi khi tải báo cáo (${res.status})`);
        }
        const data = await res.json();
        currentReportsData = data;

        // Đảm bảo sub-tab hiện tại không bị ẩn bởi switchTab('[id^="tab-"]')
        const activePane = document.getElementById(activeReportsSubTab || 'tab-sub-overview');
        if (activePane && activePane.classList.contains('hidden')) {
            switchReportsSubTab(activeReportsSubTab || 'tab-sub-overview');
        }

        // Render các khối dữ liệu
        renderReportsCategoryFilterUI(data);
        renderReportsSummaryKPI(data.summary, data.goods_vs_services, data.range);
        renderMonthlyBreakdownTable(data.monthly_breakdown, data.summary, data.range);
        renderVisualCharts(data);
        renderPaymentsTable(data.payments);
        renderGoodsVsServices(data.goods_vs_services);
        renderStaffPerformance(data.staff_performance);
        renderTopProducts(data.top_products);

    } catch (e) {
        console.error("loadReportsAnalytics error:", e);
        if (window.showToast) window.showToast(e.message || "Không thể tải dữ liệu báo cáo", "error");
    } finally {
        if (btnRefresh) btnRefresh.classList.remove('animate-spin');
        if (typeof stopPageLoader === 'function') stopPageLoader();
    }
}

function formatGrowthBadge(pct, inverseColor = false) {
    const val = parseFloat(pct || 0);
    const sign = val > 0 ? '+' : '';
    const isGood = inverseColor ? (val <= 0) : (val >= 0);
    const cls = val === 0 ? 'text-slate-500' : (isGood ? 'text-emerald-600' : 'text-rose-600');
    return `<span class="font-bold ${cls}">${sign}${val}%</span>`;
}

function renderReportsCategoryFilterUI(data) {
    const allCats = data.all_categories || [];
    const breakdown = data.categories_breakdown || [];
    const popList = document.getElementById('rep-cat-popover-list');
    const strip = document.getElementById('rep-active-cat-strip');
    const badge = document.getElementById('rep-cat-filter-badge');
    const matrixEl = document.getElementById('rep-cat-interactive-matrix');

    if (badge) {
        if (reportsSelectedCats.size === 0) {
            badge.textContent = 'Tất cả';
            badge.className = 'px-1.5 py-0.5 rounded-full bg-sky-600 text-white text-xs font-bold';
        } else if (reportsCatFilterMode === 'exclude') {
            badge.textContent = `Loại trừ ${reportsSelectedCats.size}`;
            badge.className = 'px-1.5 py-0.5 rounded-full bg-rose-600 text-white text-xs font-bold';
        } else {
            badge.textContent = `Chỉ tính ${reportsSelectedCats.size}`;
            badge.className = 'px-1.5 py-0.5 rounded-full bg-emerald-600 text-white text-xs font-bold';
        }
    }

    if (popList) {
        const revByCat = {};
        breakdown.forEach(b => { revByCat[b.category] = b.revenue || 0; });
        const sortedCats = [...allCats].sort((a, b) => (revByCat[b] || 0) - (revByCat[a] || 0));
        popList.innerHTML = sortedCats.map(c => {
            const safeC = c.replace(/'/g, "\\'");
            const picked = reportsSelectedCats.has(c);
            const rev = revByCat[c] || 0;
            let cls = 'border-slate-200 bg-slate-50 text-slate-700 hover:bg-slate-100';
            let icon = '☐';
            if (picked) {
                if (reportsCatFilterMode === 'exclude') {
                    cls = 'border-rose-300 bg-rose-50 text-rose-700 line-through font-bold';
                    icon = '🚫';
                } else {
                    cls = 'border-emerald-300 bg-emerald-50 text-emerald-800 font-bold';
                    icon = '✅';
                }
            }
            return `
                <button type="button" onclick="toggleReportsCategoryItem('${safeC}')" class="p-2 rounded-lg border text-left text-xs flex items-center justify-between gap-1 transition cursor-pointer ${cls}">
                    <span class="truncate">${icon} ${c}</span>
                    ${rev > 0 ? `<span class="text-xs font-mono shrink-0 opacity-75">${Math.round(rev / 1000)}k</span>` : ''}
                </button>
            `;
        }).join('');
    }

    if (strip) {
        if (reportsSelectedCats.size === 0) {
            strip.innerHTML = `<span class="text-slate-500">✨ Đang tổng hợp <b>toàn bộ các nhóm hàng hóa & dịch vụ</b>. Bấm vào bảng <b>Tỷ Trọng Nhóm Hàng</b> bên dưới hoặc nút <b>🎯 Lọc nhóm hàng đặc biệt</b> để loại trừ Phí ship, Thú cưng...</span>`;
        } else {
            const prefix = reportsCatFilterMode === 'exclude'
                ? `<span class="font-bold text-rose-600">🚫 Đang loại trừ khỏi báo cáo:</span>`
                : `<span class="font-bold text-emerald-700">✅ Chỉ tính doanh thu các nhóm:</span>`;
            const chipCls = reportsCatFilterMode === 'exclude'
                ? 'bg-rose-100 text-rose-700 border-rose-200 hover:bg-rose-200'
                : 'bg-emerald-100 text-emerald-800 border-emerald-200 hover:bg-emerald-200';
            const chips = [...reportsSelectedCats].map(c => {
                const safeC = c.replace(/'/g, "\\'");
                return `<button type="button" onclick="toggleReportsCategoryItem('${safeC}')" class="px-2.5 py-0.5 rounded-full border font-bold text-xs inline-flex items-center gap-1 transition cursor-pointer ${chipCls}"><span>${c}</span><span>✕</span></button>`;
            }).join('');
            strip.innerHTML = `${prefix} ${chips} <button type="button" onclick="applyReportsSpecialPreset('all')" class="ml-auto text-sky-600 hover:underline font-bold text-xs cursor-pointer">↺ Hiện tất cả</button>`;
        }
    }

    if (matrixEl) {
        if (!breakdown.length) {
            matrixEl.innerHTML = '<div class="p-6 text-center text-slate-400">Chưa có phát sinh theo nhóm hàng trong kỳ này</div>';
        } else {
            const totalIncludedRev = breakdown.filter(b => b.is_included).reduce((s, b) => s + (b.revenue || 0), 0) || 1;
            matrixEl.innerHTML = breakdown.map(b => {
                const safeC = (b.category || '').replace(/'/g, "\\'");
                const inc = b.is_included;
                const share = inc ? Math.min(100, Math.round(((b.revenue || 0) / totalIncludedRev) * 100)) : 0;
                const chIcon = b.channel === 'spa' ? '🐾' : (b.channel === 'hotel' ? '🏨' : '📦');
                return `
                    <div onclick="toggleReportsCategoryItem('${safeC}')" title="Bấm để ${inc ? 'loại trừ' : 'bật lại'} nhóm ${b.category}" class="p-2 rounded-lg border transition cursor-pointer flex items-center justify-between gap-2 ${inc ? 'bg-white border-slate-200 hover:border-sky-300' : 'bg-rose-50/60 border-rose-200 opacity-55 line-through'}">
                        <div class="min-w-0 flex-1">
                            <div class="font-bold text-slate-800 truncate flex items-center gap-1">
                                <span>${inc ? '✅' : '🚫'}</span>
                                <span>${chIcon}</span>
                                <span class="truncate">${b.category}</span>
                            </div>
                            <div class="flex items-center gap-2 mt-1">
                                <div class="w-20 bg-slate-100 h-1.5 rounded-full overflow-hidden">
                                    <div class="bg-sky-600 h-full rounded-full" style="width:${share}%"></div>
                                </div>
                                <span class="text-xs font-mono font-bold text-slate-600">${formatMoney(b.revenue || 0)} (${share}%)</span>
                            </div>
                        </div>
                        <div class="text-right shrink-0">
                            <span class="px-1.5 py-0.5 rounded bg-emerald-50 text-emerald-700 font-bold text-xs">${b.margin_pct || 0}%</span>
                        </div>
                    </div>
                `;
            }).join('');
        }
    }
}

function renderReportsSummaryKPI(s, g, r) {
    if (!s) return;
    const setTxt = (id, txt) => { const el = document.getElementById(id); if (el) el.innerText = txt; };
    const setHtml = (id, html) => { const el = document.getElementById(id); if (el) el.innerHTML = html; };
    const monthsCount = (r && r.months_count) ? r.months_count : 1;
    const isMultiMonth = monthsCount > 1;

    // 6 Thẻ chuẩn KiotViet (khi chọn nhiều tháng: hiển thị thêm TB 1 tháng ngay dưới TB/ngày)
    setTxt('rep-kv-orders', (s.order_count || 0).toLocaleString('vi-VN'));
    setHtml('rep-kv-orders-avg', isMultiMonth
        ? `${s.avg_orders_per_day || 0} <span class="block text-xs text-sky-600 font-semibold mt-0.5">TB/tháng: ${s.avg_orders_per_month || 0} đơn</span>`
        : String(s.avg_orders_per_day || 0));
    setHtml('rep-kv-orders-growth', formatGrowthBadge(s.growth_orders));

    setTxt('rep-kv-gross', formatMoney(s.gross_revenue || 0));
    setHtml('rep-kv-gross-avg', isMultiMonth
        ? `${formatMoney(s.avg_gross_per_day || 0)} <span class="block text-xs text-sky-600 font-semibold mt-0.5">TB/tháng: ${formatMoney(s.avg_gross_per_month || 0)}</span>`
        : formatMoney(s.avg_gross_per_day || 0));
    setHtml('rep-kv-gross-growth', formatGrowthBadge(s.growth_gross));

    setTxt('rep-kv-return', formatMoney(s.return_amount || 0));
    setHtml('rep-kv-return-avg', isMultiMonth
        ? `${formatMoney(s.avg_return_per_day || 0)} <span class="block text-xs text-rose-600 font-semibold mt-0.5">TB/tháng: ${formatMoney(s.avg_return_per_month || 0)}</span>`
        : formatMoney(s.avg_return_per_day || 0));
    setHtml('rep-kv-return-growth', formatGrowthBadge(s.growth_return, true));

    setTxt('rep-kpi-revenue', formatMoney(s.net_revenue ?? s.total_revenue ?? 0));
    setHtml('rep-kv-net-avg', isMultiMonth
        ? `${formatMoney(s.avg_net_per_day || 0)} <span class="block text-xs text-sky-700 font-bold mt-0.5">TB 1 tháng (${monthsCount} tháng): ${formatMoney(s.avg_net_per_month || 0)}</span>`
        : formatMoney(s.avg_net_per_day || 0));
    setHtml('rep-kv-net-growth', formatGrowthBadge(s.growth_net));

    setTxt('rep-kv-cost', formatMoney(s.total_cost || 0));
    setHtml('rep-kv-cost-avg', isMultiMonth
        ? `${formatMoney(s.avg_cost_per_day || 0)} <span class="block text-xs text-amber-700 font-semibold mt-0.5">TB/tháng: ${formatMoney(s.avg_cost_per_month || 0)}</span>`
        : formatMoney(s.avg_cost_per_day || 0));
    setHtml('rep-kv-cost-growth', formatGrowthBadge(s.growth_cost, true));

    setTxt('rep-kv-profit', formatMoney(s.gross_profit || 0));
    setHtml('rep-kv-profit-avg', isMultiMonth
        ? `${formatMoney(s.avg_profit_per_day || 0)} <span class="block text-xs text-emerald-700 font-bold mt-0.5">TB 1 tháng: ${formatMoney(s.avg_profit_per_month || 0)}</span>`
        : formatMoney(s.avg_profit_per_day || 0));
    setHtml('rep-kv-profit-growth', formatGrowthBadge(s.growth_profit));
    setTxt('rep-kv-margin-badge', `Biên: ${s.margin_pct || 0}%`);

    // Dải Thực thu / Công nợ / 3 Kênh POS PetCare
    setTxt('rep-kpi-paid', formatMoney(s.total_paid || 0));
    setTxt('rep-kpi-debt', formatMoney(s.total_debt || 0));
    setTxt('rep-kpi-aov', `TB: ${formatMoney(s.aov || 0)}/đơn`);

    if (g) {
        setTxt('rep-strip-goods', formatMoney(g.goods_revenue || 0));
        setTxt('rep-strip-spa', formatMoney(g.services_revenue || 0));
        setTxt('rep-strip-hotel', formatMoney(g.hotel_revenue || 0));
    }
}

function renderMonthlyBreakdownTable(monthlyList, s, r) {
    const wrap = document.getElementById('rep-monthly-breakdown-wrap');
    const tbody = document.getElementById('rep-monthly-tbody');
    const avgBadge = document.getElementById('rep-monthly-avg-badge');
    if (!wrap || !tbody) return;

    const list = Array.isArray(monthlyList) ? monthlyList : [];
    const monthsCount = (r && r.months_count) ? r.months_count : list.length;

    if (list.length <= 1) {
        wrap.classList.add('hidden');
        return;
    }

    wrap.classList.remove('hidden');
    if (avgBadge && s) {
        avgBadge.textContent = `TB ${monthsCount} tháng: ${formatMoney(s.avg_net_per_month || 0)}/tháng · Lãi TB: ${formatMoney(s.avg_profit_per_month || 0)}/tháng`;
    }

    tbody.innerHTML = list.map(m => {
        const hasData = (m.net_revenue || 0) > 0 || (m.orders || 0) > 0;
        const rowCls = hasData ? 'hover:bg-slate-50 transition' : 'bg-slate-50/40 text-slate-400';
        return `
            <tr class="${rowCls}">
                <td class="p-2.5 font-bold ${hasData ? 'text-slate-800' : 'text-slate-400'}">${m.label}</td>
                <td class="p-2.5 text-center font-mono font-semibold">${m.orders || 0}</td>
                <td class="p-2.5 text-right font-mono">${formatMoney(m.revenue || 0)}</td>
                <td class="p-2.5 text-right font-mono text-rose-600">${formatMoney(m.returns || 0)}</td>
                <td class="p-2.5 text-right font-mono font-bold ${hasData ? 'text-sky-700' : ''}">${formatMoney(m.net_revenue || 0)}</td>
                <td class="p-2.5 text-right font-mono text-amber-600">${formatMoney(m.cost || 0)}</td>
                <td class="p-2.5 text-right font-mono font-bold ${hasData ? 'text-emerald-600' : ''}">${formatMoney(m.profit || 0)}</td>
                <td class="p-2.5 text-right font-mono font-bold">${m.margin_pct || 0}%</td>
            </tr>
        `;
    }).join('');
}

function renderVisualCharts(data) {
    if (typeof Chart === 'undefined') {
        console.warn("Chart.js chưa sẵn sàng");
        return;
    }

    // 1. Biểu đồ Timeline (Chế độ 4 đường KiotViet hoặc Cột chồng 3 kênh)
    const ctxTimeline = document.getElementById('chart-rep-timeline')?.getContext('2d');
    if (ctxTimeline) {
        if (chartTimelineInstance) chartTimelineInstance.destroy();
        const labels = data.timeline.map(t => t.label);

        if (reportsTimelineMode === 'stacked') {
            chartTimelineInstance = new Chart(ctxTimeline, {
                type: 'bar',
                data: {
                    labels: labels,
                    datasets: [
                        {
                            label: 'Hàng hóa bán lẻ',
                            data: data.timeline.map(t => t.goods_rev || 0),
                            backgroundColor: '#0284c7',
                            borderRadius: 4,
                            stack: 'rev'
                        },
                        {
                            label: 'Dịch vụ Spa & Grooming',
                            data: data.timeline.map(t => t.spa_rev || 0),
                            backgroundColor: '#8b5cf6',
                            borderRadius: 4,
                            stack: 'rev'
                        },
                        {
                            label: 'Khách sạn thú cưng',
                            data: data.timeline.map(t => t.hotel_rev || 0),
                            backgroundColor: '#f59e0b',
                            borderRadius: 4,
                            stack: 'rev'
                        }
                    ]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    interaction: { mode: 'index', intersect: false },
                    plugins: {
                        legend: { position: 'bottom' },
                        tooltip: {
                            callbacks: {
                                label: ctx => ` ${ctx.dataset.label}: ${formatMoney(ctx.raw)}`
                            }
                        }
                    },
                    scales: {
                        x: { stacked: true },
                        y: {
                            stacked: true,
                            ticks: {
                                callback: val => val >= 1000000 ? (val / 1000000) + 'Tr' : (val / 1000) + 'k'
                            }
                        }
                    }
                }
            });
        } else {
            // Chế độ 4 đường chuẩn KiotViet: Doanh thu, Trả hàng, Tổng giá vốn, Lợi nhuận gộp
            chartTimelineInstance = new Chart(ctxTimeline, {
                type: 'line',
                data: {
                    labels: labels,
                    datasets: [
                        {
                            label: 'Doanh thu',
                            data: data.timeline.map(t => t.revenue || 0),
                            borderColor: '#0070F4',
                            backgroundColor: 'rgba(0, 112, 244, 0.08)',
                            borderWidth: 2.2,
                            pointRadius: 3.5,
                            tension: 0.15,
                            fill: true
                        },
                        {
                            label: 'Trả hàng',
                            data: data.timeline.map(t => t.returns || 0),
                            borderColor: '#EF4444',
                            backgroundColor: '#EF4444',
                            borderWidth: 2,
                            pointRadius: 3,
                            tension: 0.15
                        },
                        {
                            label: 'Tổng giá vốn',
                            data: data.timeline.map(t => t.cost || 0),
                            borderColor: '#F59E0B',
                            backgroundColor: '#F59E0B',
                            borderWidth: 2,
                            pointRadius: 3,
                            tension: 0.15
                        },
                        {
                            label: 'Lợi nhuận gộp',
                            data: data.timeline.map(t => t.profit || 0),
                            borderColor: '#10B981',
                            backgroundColor: '#10B981',
                            borderWidth: 2.2,
                            pointRadius: 3.5,
                            tension: 0.15
                        }
                    ]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    interaction: { mode: 'index', intersect: false },
                    plugins: {
                        legend: { position: 'bottom' },
                        tooltip: {
                            callbacks: {
                                label: ctx => ` ${ctx.dataset.label}: ${formatMoney(ctx.raw)}`
                            }
                        }
                    },
                    scales: {
                        y: {
                            beginAtZero: true,
                            ticks: {
                                callback: val => val >= 1000000 ? (val / 1000000) + 'Tr' : (val / 1000) + 'k'
                            }
                        }
                    }
                }
            });
        }
    }

    // 2. Biểu đồ Cơ cấu Nguồn thu (Doughnut)
    const ctxMix = document.getElementById('chart-rep-revenue-mix')?.getContext('2d');
    if (ctxMix) {
        if (chartRevenueMixInstance) chartRevenueMixInstance.destroy();
        const g = data.goods_vs_services;
        const labels = ['Hàng hóa bán lẻ', 'Dịch vụ Spa', 'Khách sạn Hotel'];
        const values = [g.goods_revenue || 0, g.services_revenue || 0, g.hotel_revenue || 0];

        chartRevenueMixInstance = new Chart(ctxMix, {
            type: 'doughnut',
            data: {
                labels: labels,
                datasets: [{
                    data: values,
                    backgroundColor: ['#0284c7', '#9333ea', '#ea580c'],
                    hoverOffset: 4
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: { position: 'bottom' },
                    tooltip: {
                        callbacks: {
                            label: ctx => ` ${ctx.label}: ${formatMoney(ctx.raw)}`
                        }
                    }
                }
            }
        });
    }

    // 3. Biểu đồ Kênh thanh toán (Bar ngang)
    const ctxPay = document.getElementById('chart-rep-payments')?.getContext('2d');
    if (ctxPay) {
        if (chartPaymentsInstance) chartPaymentsInstance.destroy();
        const labels = data.payments.map(p => p.name);
        const amounts = data.payments.map(p => p.amount);

        chartPaymentsInstance = new Chart(ctxPay, {
            type: 'bar',
            data: {
                labels: labels,
                datasets: [{
                    label: 'Số tiền (đ)',
                    data: amounts,
                    backgroundColor: ['#10b981', '#0284c7', '#6366f1', '#a855f7', '#f43f5e'],
                    borderRadius: 6
                }]
            },
            options: {
                indexAxis: 'y',
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: { display: false },
                    tooltip: {
                        callbacks: {
                            label: ctx => ` ${formatMoney(ctx.raw)}`
                        }
                    }
                },
                scales: {
                    x: {
                        ticks: {
                            callback: val => val >= 1000000 ? (val / 1000000) + 'Tr' : (val / 1000) + 'k'
                        }
                    }
                }
            }
        });
    }

    // 4. Biểu đồ Doanh số Nhân viên (Cột)
    const ctxStaff = document.getElementById('chart-rep-staff')?.getContext('2d');
    if (ctxStaff) {
        if (chartStaffInstance) chartStaffInstance.destroy();
        const top5Staff = (data.staff_performance || []).slice(0, 5);
        const labels = top5Staff.map(s => s.staff_name);
        const revenues = top5Staff.map(s => s.revenue);

        chartStaffInstance = new Chart(ctxStaff, {
            type: 'bar',
            data: {
                labels: labels.length ? labels : ['Chưa có'],
                datasets: [{
                    label: 'Doanh số (đ)',
                    data: revenues.length ? revenues : [0],
                    backgroundColor: '#3b82f6',
                    borderRadius: 6
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: { display: false },
                    tooltip: {
                        callbacks: {
                            label: ctx => ` Doanh số: ${formatMoney(ctx.raw)}`
                        }
                    }
                },
                scales: {
                    y: {
                        ticks: {
                            callback: val => val >= 1000000 ? (val / 1000000) + 'Tr' : (val / 1000) + 'k'
                        }
                    }
                }
            }
        });
    }
}

function renderPaymentsTable(payments) {
    const tbody = document.getElementById('rep-payments-tbody');
    if (!tbody) return;
    if (!payments || !payments.length) {
        tbody.innerHTML = '<tr><td colspan="5" class="p-6 text-center text-slate-400 text-xs">Không có giao dịch thanh toán trong kỳ</td></tr>';
        return;
    }
    tbody.innerHTML = payments.map((p, idx) => `
        <tr class="border-b border-slate-100 hover:bg-slate-50 transition text-xs">
            <td class="p-3 text-center text-slate-400 font-bold">${idx + 1}</td>
            <td class="p-3 font-bold text-slate-800">${p.name}</td>
            <td class="p-3 text-center text-slate-600 font-medium">${p.count} lượt</td>
            <td class="p-3 text-right font-bold font-mono text-emerald-600 text-sm">${formatMoney(p.amount)}</td>
            <td class="p-3 text-right">
                <div class="flex items-center justify-end gap-2">
                    <div class="w-16 bg-slate-100 rounded-full h-2 overflow-hidden">
                        <div class="bg-sky-600 h-2 rounded-full" style="width: ${p.pct}%"></div>
                    </div>
                    <span class="font-bold text-slate-700 w-10">${p.pct}%</span>
                </div>
            </td>
        </tr>
    `).join('');
}

function renderGoodsVsServices(g) {
    if (!g) return;
    document.getElementById('rep-gvs-goods-rev').innerText = formatMoney(g.goods_revenue || 0);
    document.getElementById('rep-gvs-goods-qty').innerText = `${g.goods_items_sold || 0} món xuất bán`;

    document.getElementById('rep-gvs-svc-rev').innerText = formatMoney(g.services_revenue || 0);
    document.getElementById('rep-gvs-svc-qty').innerText = `${g.services_items_sold || 0} lượt chăm sóc / spa`;

    document.getElementById('rep-gvs-hotel-rev').innerText = formatMoney(g.hotel_revenue || 0);
    document.getElementById('rep-gvs-hotel-qty').innerText = `${g.hotel_bookings || 0} lượt lưu trú`;
}

function renderStaffPerformance(staff) {
    const tbody = document.getElementById('rep-staff-tbody');
    if (!tbody) return;
    if (!staff || !staff.length) {
        tbody.innerHTML = '<tr><td colspan="6" class="p-6 text-center text-slate-400 text-xs">Không có dữ liệu nhân viên trong kỳ</td></tr>';
        return;
    }
    tbody.innerHTML = staff.map((s, idx) => `
        <tr class="border-b border-slate-100 hover:bg-slate-50 transition text-xs">
            <td class="p-3 text-center text-slate-400 font-bold">${idx + 1}</td>
            <td class="p-3 font-bold text-slate-800 flex items-center gap-1.5">
                <span>👤</span>
                <span>${s.staff_name}</span>
            </td>
            <td class="p-3 text-center font-semibold text-slate-600">${s.order_count} đơn</td>
            <td class="p-3 text-right font-bold font-mono text-sky-700 text-sm">${formatMoney(s.revenue)}</td>
            <td class="p-3 text-right font-bold font-mono text-emerald-600">${formatMoney(s.paid_revenue)}</td>
            <td class="p-3 text-right font-bold font-mono text-amber-600">${formatMoney(s.commission || 0)}</td>
        </tr>
    `).join('');
}

function renderTopProducts(products) {
    const tbody = document.getElementById('rep-top-products-tbody');
    if (!tbody) return;
    if (!products || !products.length) {
        tbody.innerHTML = '<tr><td colspan="7" class="p-6 text-center text-slate-400 text-xs">Chưa có dữ liệu bán hàng trong kỳ</td></tr>';
        return;
    }
    tbody.innerHTML = products.map((item, idx) => {
        const isSvc = item.type === 'service';
        const typeBadge = isSvc
            ? '<span class="px-1.5 py-0.5 rounded text-xs font-bold bg-sky-100 text-sky-700">💆 Dịch vụ</span>'
            : '<span class="px-1.5 py-0.5 rounded text-xs font-bold bg-blue-100 text-blue-700">📦 Hàng hóa</span>';

        return `
            <tr class="border-b border-slate-100 hover:bg-slate-50 transition text-xs">
                <td class="p-3 text-center font-bold text-slate-400">${idx + 1}</td>
                <td class="p-3 font-mono font-bold text-slate-500">${item.code || '-'}</td>
                <td class="p-3 font-bold text-slate-800">${item.name}</td>
                <td class="p-3 text-center">${typeBadge}</td>
                <td class="p-3 text-center text-slate-500">${item.unit || 'cái'}</td>
                <td class="p-3 text-center font-bold font-mono text-slate-700 text-sm">${item.qty_sold}</td>
                <td class="p-3 text-right font-bold font-mono text-sky-700 text-sm">${formatMoney(item.revenue)}</td>
            </tr>
        `;
    }).join('');
}

function exportReportsExcel() {
    const fromVal = document.getElementById('rep-filter-from')?.value || '';
    const toVal = document.getElementById('rep-filter-to')?.value || '';
    const catListParam = [...reportsSelectedCats].join('||');
    downloadWithAuth(`/api/reports/export-excel?from_date=${encodeURIComponent(fromVal)}&to_date=${encodeURIComponent(toVal)}&cat_mode=${encodeURIComponent(reportsCatFilterMode)}&cat_list=${encodeURIComponent(catListParam)}`, 'Bao_Cao_Tong_Hop.xlsx');
}

// Xuất các hàm ra window
window.initReportsAnalytics = initReportsAnalytics;
window.selectQuickDateFilter = selectQuickDateFilter;
window.switchReportsSubTab = switchReportsSubTab;
window.loadReportsAnalytics = loadReportsAnalytics;
window.exportReportsExcel = exportReportsExcel;
