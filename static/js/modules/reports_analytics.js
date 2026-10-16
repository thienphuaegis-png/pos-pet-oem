// reports_analytics.js - Báo Cáo Kinh Doanh Đa Chiều & Dashboard Biểu Đồ Trực Quan

let currentReportsData = null;
let activeReportsSubTab = 'tab-sub-overview';
let activeQuickFilter = 'today';

// Instances của Chart.js để hủy trước khi vẽ lại
let chartTimelineInstance = null;
let chartRevenueMixInstance = null;
let chartPaymentsInstance = null;
let chartStaffInstance = null;

function initReportsAnalytics() {
    // Gán mặc định ngày hôm nay
    const today = getLocalTodayDateStr();
    const fromInput = document.getElementById('rep-filter-from');
    const toInput = document.getElementById('rep-filter-to');
    if (fromInput && !fromInput.value) fromInput.value = today;
    if (toInput && !toInput.value) toInput.value = today;

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

async function loadReportsAnalytics() {
    const fromVal = document.getElementById('rep-filter-from')?.value || '';
    const toVal = document.getElementById('rep-filter-to')?.value || '';

    const btnRefresh = document.getElementById('btn-rep-refresh');
    if (btnRefresh) btnRefresh.classList.add('animate-spin');

    try {
        const url = `/api/reports/analytics?from_date=${encodeURIComponent(fromVal)}&to_date=${encodeURIComponent(toVal)}`;
        const res = await fetch(url);
        if (!res.ok) throw new Error("Lỗi khi tải báo cáo");
        const data = await res.json();
        currentReportsData = data;

        // Render các khối dữ liệu
        renderReportsSummaryKPI(data.summary);
        renderVisualCharts(data);
        renderPaymentsTable(data.payments);
        renderGoodsVsServices(data.goods_vs_services);
        renderStaffPerformance(data.staff_performance);
        renderTopProducts(data.top_products);

    } catch (e) {
        console.error("loadReportsAnalytics error:", e);
    } finally {
        if (btnRefresh) btnRefresh.classList.remove('animate-spin');
    }
}

function renderReportsSummaryKPI(s) {
    if (!s) return;
    const revEl = document.getElementById('rep-kpi-revenue');
    const paidEl = document.getElementById('rep-kpi-paid');
    const debtEl = document.getElementById('rep-kpi-debt');
    const aovEl = document.getElementById('rep-kpi-aov');

    if (revEl) revEl.innerText = formatMoney(s.total_revenue || 0);
    if (paidEl) paidEl.innerText = formatMoney(s.total_paid || 0);
    if (debtEl) debtEl.innerText = formatMoney(s.total_debt || 0);
    if (aovEl) {
        const orderTxt = (s.order_count || 0) + ' đơn';
        const aovTxt = formatMoney(s.aov || 0) + '/đơn';
        aovEl.innerHTML = `<span class="text-base text-slate-800">${orderTxt}</span> · <span class="text-xs text-slate-500">${aovTxt}</span>`;
    }
}

function renderVisualCharts(data) {
    if (typeof Chart === 'undefined') {
        console.warn("Chart.js chưa sẵn sàng");
        return;
    }

    // 1. Biểu đồ Timeline (Doanh thu & Số đơn)
    const ctxTimeline = document.getElementById('chart-rep-timeline')?.getContext('2d');
    if (ctxTimeline) {
        if (chartTimelineInstance) chartTimelineInstance.destroy();
        const labels = data.timeline.map(t => t.label);
        const revenues = data.timeline.map(t => t.revenue);
        const orders = data.timeline.map(t => t.orders);

        chartTimelineInstance = new Chart(ctxTimeline, {
            type: 'bar',
            data: {
                labels: labels,
                datasets: [
                    {
                        label: 'Doanh thu (đ)',
                        data: revenues,
                        backgroundColor: 'rgba(2, 132, 199, 0.75)',
                        borderColor: '#0284c7',
                        borderWidth: 1.5,
                        borderRadius: 6,
                        yAxisID: 'y'
                    },
                    {
                        label: 'Số đơn hàng',
                        data: orders,
                        type: 'line',
                        borderColor: '#f59e0b',
                        backgroundColor: '#f59e0b',
                        borderWidth: 2.5,
                        pointRadius: 4,
                        tension: 0.25,
                        yAxisID: 'y1'
                    }
                ]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                interaction: { mode: 'index', intersect: false },
                scales: {
                    y: {
                        type: 'linear',
                        display: true,
                        position: 'left',
                        grid: { drawOnChartArea: true },
                        ticks: {
                            callback: val => val >= 1000000 ? (val / 1000000) + 'Tr' : (val / 1000) + 'k'
                        }
                    },
                    y1: {
                        type: 'linear',
                        display: true,
                        position: 'right',
                        grid: { drawOnChartArea: false },
                        ticks: { precision: 0 }
                    }
                }
            }
        });
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
            <td class="p-3 text-right font-black font-mono text-emerald-600 text-sm">${formatMoney(p.amount)}</td>
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
            <td class="p-3 text-right font-black font-mono text-sky-700 text-sm">${formatMoney(s.revenue)}</td>
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
            ? '<span class="px-1.5 py-0.5 rounded text-[10px] font-bold bg-purple-100 text-purple-700">💆 Dịch vụ</span>'
            : '<span class="px-1.5 py-0.5 rounded text-[10px] font-bold bg-blue-100 text-blue-700">📦 Hàng hóa</span>';

        return `
            <tr class="border-b border-slate-100 hover:bg-slate-50 transition text-xs">
                <td class="p-3 text-center font-extrabold text-slate-400">${idx + 1}</td>
                <td class="p-3 font-mono font-bold text-slate-500">${item.code || '-'}</td>
                <td class="p-3 font-bold text-slate-800">${item.name}</td>
                <td class="p-3 text-center">${typeBadge}</td>
                <td class="p-3 text-center text-slate-500">${item.unit || 'cái'}</td>
                <td class="p-3 text-center font-black font-mono text-slate-700 text-sm">${item.qty_sold}</td>
                <td class="p-3 text-right font-black font-mono text-sky-700 text-sm">${formatMoney(item.revenue)}</td>
            </tr>
        `;
    }).join('');
}

function exportReportsExcel() {
    const fromVal = document.getElementById('rep-filter-from')?.value || '';
    const toVal = document.getElementById('rep-filter-to')?.value || '';
    downloadWithAuth(`/api/reports/export-excel?from_date=${encodeURIComponent(fromVal)}&to_date=${encodeURIComponent(toVal)}`, 'Bao_Cao_Tong_Hop.xlsx');
}

// Xuất các hàm ra window
window.initReportsAnalytics = initReportsAnalytics;
window.selectQuickDateFilter = selectQuickDateFilter;
window.switchReportsSubTab = switchReportsSubTab;
window.loadReportsAnalytics = loadReportsAnalytics;
window.exportReportsExcel = exportReportsExcel;
