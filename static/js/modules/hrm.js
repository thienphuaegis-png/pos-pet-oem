/**
 * Module HRM: Chấm Công, Bảng Lương, Tăng Ca, Tạm Ứng
 */
(function() {
    let currentSubTab = 'payroll';
    let payrollData = null;
    let attendanceData = null;
    let leavesData = [];
    let overtimeData = [];
    let advancesData = [];

    // ── Trạng thái Kỳ Xem Dữ Liệu Dùng Chung (HRM <-> Pancake) & Gom Nhóm ──
    let hrmPeriodMode = 'this_month'; // 'this_month' | 'prev_month' | 'month' | 'range'
    let hrmDateFrom = '';
    let hrmDateTo = '';
    const HRM_GROUP_MODE_STORAGE_KEY = 'hrm_subtable_group_mode_v1';
    let hrmSubTableGroupMode = (() => {
        try {
            const v = localStorage.getItem(HRM_GROUP_MODE_STORAGE_KEY);
            if (v === 'flat' || v === 'grouped') return v;
        } catch (_) {}
        return 'grouped';
    })();

    function _monthBoundsFromYm(ym) {
        const parts = String(ym || '').split('-');
        const y = parseInt(parts[0], 10) || new Date().getFullYear();
        const m = parseInt(parts[1], 10) || (new Date().getMonth() + 1);
        const lastDay = new Date(y, m, 0).getDate();
        const mm = String(m).padStart(2, '0');
        return {
            month: `${y}-${mm}`,
            from: `${y}-${mm}-01`,
            to: `${y}-${mm}-${String(lastDay).padStart(2, '0')}`
        };
    }

    function _offsetMonthYm(deltaMonths = 0) {
        const now = new Date();
        const d = new Date(now.getFullYear(), now.getMonth() + deltaMonths, 1);
        return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    }

    function _fmtShortVnRange(d1, d2) {
        const f = s => {
            const p = String(s || '').slice(0, 10).split('-');
            return p.length === 3 ? `${p[2]}/${p[1]}/${p[0]}` : s;
        };
        if (!d1 || !d2) return '';
        return `${f(d1)} → ${f(d2)}`;
    }

    function syncHrmPeriodUI(skipPancakeSync = false) {
        const curYm = _offsetMonthYm(0);
        const prevYm = _offsetMonthYm(-1);
        const picker = document.getElementById('hrm-month-picker');
        const ym = picker?.value || curYm;
        if (!hrmDateFrom || !hrmDateTo || hrmPeriodMode !== 'range') {
            const b = _monthBoundsFromYm(ym);
            hrmDateFrom = b.from;
            hrmDateTo = b.to;
            if (ym === curYm) hrmPeriodMode = 'this_month';
            else if (ym === prevYm) hrmPeriodMode = 'prev_month';
            else hrmPeriodMode = 'month';
        }
        const fromInp = document.getElementById('hrm-date-from');
        const toInp = document.getElementById('hrm-date-to');
        if (fromInp) fromInp.value = hrmDateFrom;
        if (toInp) toInp.value = hrmDateTo;

        const rangeWrap = document.getElementById('hrm-date-range-wrap');
        if (rangeWrap) {
            rangeWrap.classList.toggle('hidden', hrmPeriodMode !== 'range');
            rangeWrap.classList.toggle('flex', hrmPeriodMode === 'range');
        }
        const badge = document.getElementById('hrm-period-range-badge');
        if (badge) {
            badge.textContent = _fmtShortVnRange(hrmDateFrom, hrmDateTo);
            badge.classList.toggle('hidden', hrmPeriodMode === 'range');
        }

        const onCls = 'px-2.5 py-1 rounded-md bg-sky-600 text-white cursor-pointer transition-all';
        const offCls = 'px-2.5 py-1 rounded-md text-slate-600 hover:text-slate-900 cursor-pointer transition-all';
        const bThis = document.getElementById('btn-hrm-period-this');
        const bPrev = document.getElementById('btn-hrm-period-prev');
        const bRange = document.getElementById('btn-hrm-period-range');
        if (bThis) bThis.className = hrmPeriodMode === 'this_month' ? onCls : offCls;
        if (bPrev) bPrev.className = hrmPeriodMode === 'prev_month' ? onCls : offCls;
        if (bRange) bRange.className = hrmPeriodMode === 'range' ? onCls : offCls;

        if (!skipPancakeSync && typeof window.syncPancakeFromHrmPeriod === 'function') {
            window.syncPancakeFromHrmPeriod(hrmDateFrom, hrmDateTo);
        }
    }

    function getHrmQueryPeriodParams() {
        const month = getSelectedMonth();
        if (hrmPeriodMode === 'range' && hrmDateFrom && hrmDateTo) {
            return { month: hrmDateFrom.slice(0, 7), dateFrom: hrmDateFrom, dateTo: hrmDateTo, qs: `date_from=${encodeURIComponent(hrmDateFrom)}&date_to=${encodeURIComponent(hrmDateTo)}` };
        }
        const b = _monthBoundsFromYm(month);
        return { month, dateFrom: b.from, dateTo: b.to, qs: `month=${encodeURIComponent(month)}` };
    }

    window.getSharedHrmPeriodRange = function() {
        const p = getHrmQueryPeriodParams();
        return { month: p.month, from: p.dateFrom, to: p.dateTo, mode: hrmPeriodMode };
    };

    window.syncHrmPeriodFromPancake = function(fromStr, toStr, modeHint) {
        if (!fromStr || !toStr) return;
        const curB = _monthBoundsFromYm(_offsetMonthYm(0));
        const prevB = _monthBoundsFromYm(_offsetMonthYm(-1));
        const picker = document.getElementById('hrm-month-picker');
        if (modeHint === 'this_month' || (fromStr === curB.from && toStr === curB.to)) {
            hrmPeriodMode = 'this_month';
            if (picker) picker.value = curB.month;
            updateMonthDisplay(curB.month);
            hrmDateFrom = curB.from;
            hrmDateTo = curB.to;
        } else if (modeHint === 'prev_month' || (fromStr === prevB.from && toStr === prevB.to)) {
            hrmPeriodMode = 'prev_month';
            if (picker) picker.value = prevB.month;
            updateMonthDisplay(prevB.month);
            hrmDateFrom = prevB.from;
            hrmDateTo = prevB.to;
        } else {
            // Kiểm tra có khớp trọn 1 tháng bất kỳ không
            const ym = fromStr.slice(0, 7);
            const mb = _monthBoundsFromYm(ym);
            if (fromStr === mb.from && toStr === mb.to) {
                hrmPeriodMode = 'month';
                if (picker) picker.value = ym;
                updateMonthDisplay(ym);
                hrmDateFrom = mb.from;
                hrmDateTo = mb.to;
            } else {
                hrmPeriodMode = 'range';
                hrmDateFrom = fromStr;
                hrmDateTo = toStr;
                if (picker) picker.value = ym;
                updateMonthDisplay(ym);
            }
        }
        syncHrmPeriodUI(true);
    };

    window.setHrmPeriodPreset = function(mode) {
        const picker = document.getElementById('hrm-month-picker');
        if (mode === 'this_month') {
            const ym = _offsetMonthYm(0);
            if (picker) picker.value = ym;
            hrmPeriodMode = 'this_month';
            updateMonthDisplay(ym);
        } else if (mode === 'prev_month') {
            const ym = _offsetMonthYm(-1);
            if (picker) picker.value = ym;
            hrmPeriodMode = 'prev_month';
            updateMonthDisplay(ym);
        } else {
            hrmPeriodMode = 'range';
            if (!hrmDateFrom || !hrmDateTo) {
                const b = _monthBoundsFromYm(getSelectedMonth());
                hrmDateFrom = b.from;
                hrmDateTo = b.to;
            }
        }
        syncHrmPeriodUI();
        loadHrmCurrentSubTab();
    };

    window.onHrmDateRangeChange = function() {
        const d1 = document.getElementById('hrm-date-from')?.value || '';
        const d2 = document.getElementById('hrm-date-to')?.value || '';
        if (!d1 || !d2) return;
        hrmPeriodMode = 'range';
        hrmDateFrom = d1 <= d2 ? d1 : d2;
        hrmDateTo = d1 <= d2 ? d2 : d1;
        const picker = document.getElementById('hrm-month-picker');
        if (picker) {
            picker.value = hrmDateFrom.slice(0, 7);
            updateMonthDisplay(picker.value);
        }
        syncHrmPeriodUI();
        loadHrmCurrentSubTab();
    };

    function syncGroupModeButtonsUI() {
        const onCls = 'px-2.5 py-1 rounded-md bg-sky-600 text-white cursor-pointer';
        const offCls = 'px-2.5 py-1 rounded-md text-slate-600 hover:text-slate-900 cursor-pointer';
        document.querySelectorAll('[data-hrm-group-btn]').forEach(btn => {
            const m = btn.getAttribute('data-hrm-group-btn');
            btn.className = (m === hrmSubTableGroupMode) ? onCls : offCls;
        });
    }

    window.setHrmSubTableGroupMode = function(mode) {
        hrmSubTableGroupMode = mode === 'flat' ? 'flat' : 'grouped';
        try { localStorage.setItem(HRM_GROUP_MODE_STORAGE_KEY, hrmSubTableGroupMode); } catch (_) {}
        syncGroupModeButtonsUI();
        if (currentSubTab === 'leaves') renderHrmLeavesTable();
        else if (currentSubTab === 'overtime') renderHrmOvertimeTable();
        else if (currentSubTab === 'advances') renderHrmAdvancesTable();
        else if (currentSubTab === 'adjustments') filterHrmAdjustmentsTable();
    };

    function updateMonthDisplay(val) {
        const display = document.getElementById('hrm-month-display');
        if (display && val) {
            const parts = val.split('-');
            if (parts.length === 2) {
                display.textContent = `Tháng ${parts[1]}/${parts[0]}`;
            }
        }
    }

    function getSelectedMonth() {
        const picker = document.getElementById('hrm-month-picker');
        if (!picker.value) {
            const now = new Date();
            picker.value = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
        }
        updateMonthDisplay(picker.value);
        return picker.value;
    }

    window.toggleHrmMonthDropdown = function(e) {
        if (e) e.stopPropagation();
        const menu = document.getElementById('hrm-month-dropdown-menu');
        if (!menu) return;
        const isHidden = menu.classList.contains('hidden');
        if (isHidden) {
            menu.classList.remove('hidden');
            loadHrmMonthDropdown();
        } else {
            menu.classList.add('hidden');
        }
    };

    window.selectHrmMonth = function(monthStr) {
        const picker = document.getElementById('hrm-month-picker');
        if (picker) picker.value = monthStr;
        hrmPeriodMode = 'month';
        updateMonthDisplay(monthStr);
        syncHrmPeriodUI();
        const menu = document.getElementById('hrm-month-dropdown-menu');
        if (menu) menu.classList.add('hidden');
        loadHrmCurrentSubTab();
    };

    async function loadHrmMonthDropdown() {
        const picker = document.getElementById('hrm-month-picker');
        const val = picker?.value || new Date().toISOString().slice(0, 7);
        const year = parseInt(val.split('-')[0], 10);
        const yearTitle = document.getElementById('hrm-dropdown-year-title');
        if (yearTitle) yearTitle.textContent = `Năm ${year}`;
        const grid = document.getElementById('hrm-month-grid');
        if (!grid) return;

        try {
            const res = await fetch(`/api/hrm/periods?year=${year}`);
            const periods = res.ok ? await res.json() : [];
            const periodMap = {};
            periods.forEach(p => { periodMap[p.month] = p.status; });

            grid.innerHTML = Array.from({length: 12}, (_, i) => {
                const mNum = i + 1;
                const mStr = `${year}-${String(mNum).padStart(2, '0')}`;
                const status = periodMap[mStr] || 'draft';
                const isSelected = mStr === val;

                let badgeClass = "bg-amber-100 text-amber-800";
                let statusLabel = "Tạm tính";
                if (status === 'locked') {
                    badgeClass = "bg-blue-100 text-blue-800";
                    statusLabel = "Đã chốt";
                } else if (status === 'paid') {
                    badgeClass = "bg-emerald-100 text-emerald-800";
                    statusLabel = "Đã chi";
                }

                return `
                    <button type="button" onclick="selectHrmMonth('${mStr}')" class="flex flex-col items-start p-2 rounded-lg border text-left cursor-pointer transition-all ${isSelected ? 'bg-emerald-50 border-emerald-400 font-bold' : 'bg-slate-50 border-slate-200 hover:bg-white'}">
                        <span class="text-xs text-slate-800">Tháng ${String(mNum).padStart(2, '0')}</span>
                        <span class="text-xs px-1.5 py-0.5 rounded mt-1 font-semibold ${badgeClass}">${statusLabel}</span>
                    </button>
                `;
            }).join('');
        } catch (e) {
            console.error("Lỗi nạp danh sách tháng:", e);
        }
    }

    document.addEventListener('click', function(e) {
        const menu = document.getElementById('hrm-month-dropdown-menu');
        const btn = document.getElementById('hrm-month-dropdown-btn');
        if (menu && !menu.classList.contains('hidden')) {
            if (!menu.contains(e.target) && !btn?.contains(e.target)) {
                menu.classList.add('hidden');
            }
        }
    });

    window.changeHrmMonth = function(delta) {
        const picker = document.getElementById('hrm-month-picker');
        if (!picker) return;
        let val = picker.value || new Date().toISOString().slice(0, 7);
        const parts = val.split('-');
        let y = parseInt(parts[0], 10);
        let m = parseInt(parts[1], 10) + delta;
        if (m < 1) { m = 12; y -= 1; }
        else if (m > 12) { m = 1; y += 1; }
        picker.value = `${y}-${String(m).padStart(2, '0')}`;
        hrmPeriodMode = 'month';
        updateMonthDisplay(picker.value);
        syncHrmPeriodUI();
        loadHrmCurrentSubTab();
    };

    window.setHrmCurrentMonth = function() {
        window.setHrmPeriodPreset('this_month');
    };

    window.switchHrmSubTab = function(sub) {
        currentSubTab = sub;
        ['payroll', 'commissions', 'attendance', 'leaves', 'overtime', 'advances', 'adjustments', 'staff', 'config'].forEach(s => {
            const pane = document.getElementById(`hrm-subtab-${s}`);
            const btn = document.getElementById(`btn-hrm-tab-${s}`);
            if (pane) pane.classList.toggle('hidden', s !== sub);
            if (btn) {
                if (s === sub) {
                    btn.className = "px-3 py-1 rounded-md bg-white text-emerald-700 shadow-xs cursor-pointer font-bold flex items-center gap-1";
                } else {
                    btn.className = "px-3 py-1 rounded-md text-slate-600 hover:text-slate-900 cursor-pointer flex items-center gap-1";
                }
            }
        });
        syncGroupModeButtonsUI();
        loadHrmCurrentSubTab();
    };

    window.loadHrmCurrentSubTab = function() {
        const month = getSelectedMonth();
        syncHrmPeriodUI();
        syncGroupModeButtonsUI();
        if (currentSubTab === 'payroll') loadHrmPayroll(month);
        else if (currentSubTab === 'commissions') loadHrmCommissions(month);
        else if (currentSubTab === 'attendance') loadHrmAttendance(month);
        else if (currentSubTab === 'leaves') loadHrmLeaves(month);
        else if (currentSubTab === 'overtime') loadHrmOvertime(month);
        else if (currentSubTab === 'advances') loadHrmAdvances(month);
        else if (currentSubTab === 'adjustments') loadHrmSalaryAdjustments();
        else if (currentSubTab === 'staff') loadHrmStaff();
        else if (currentSubTab === 'config') loadHrmConfig();
    };

    window.initHrmTab = function() {
        getSelectedMonth();
        syncHrmPeriodUI();
        syncGroupModeButtonsUI();
        switchHrmSubTab(currentSubTab);
    };

    // ── Bảng Lương & Cài Đặt Cột Hiển Thị (Ghim Cố Định ⚠ + Mã NV + Họ và Tên) ──
    const PAYROLL_COL_STORAGE_KEY = 'hrm_payroll_visible_cols_v1';
    const PAYROLL_COLUMNS = [
        { key: 'alert', label: '⚠', fixed: true, group: 'lead', thCls: 'p-2.5 text-center w-[38px] min-w-[38px] sticky left-0 z-30 bg-slate-50', title: 'Cảnh báo cần kiểm tra trước khi chốt' },
        { key: 'employee_code', label: 'Mã NV', fixed: true, group: 'lead', thCls: 'p-2.5 whitespace-nowrap w-[72px] min-w-[72px] sticky left-[38px] z-30 bg-slate-50' },
        { key: 'name', label: 'Họ và Tên', fixed: true, group: 'lead', thCls: 'p-2.5 whitespace-nowrap min-w-[175px] sticky left-[110px] z-30 bg-slate-50 border-r-2 border-slate-200 shadow-[3px_0_5px_-2px_rgba(15,23,42,0.08)]' },
        { key: 'block', label: 'Khối', defaultOn: true, group: 'lead', thCls: 'p-2.5 whitespace-nowrap' },
        { key: 'position', label: 'Chức vụ', defaultOn: true, group: 'lead', thCls: 'p-2.5 whitespace-nowrap' },
        { key: 'contractual_status', label: 'Tình trạng', defaultOn: false, group: 'lead', thCls: 'p-2.5 text-center whitespace-nowrap' },
        { key: 'std_days', label: 'Công chuẩn', defaultOn: true, group: 'lead', thCls: 'p-2.5 text-center whitespace-nowrap' },
        { key: 'days_official', label: 'Công CT', defaultOn: true, sumKey: 'days_official', isDaySum: true, thCls: 'p-2.5 text-center whitespace-nowrap text-emerald-700' },
        { key: 'days_probation', label: 'Công TV', defaultOn: true, sumKey: 'days_probation', isDaySum: true, thCls: 'p-2.5 text-center whitespace-nowrap text-amber-700' },
        { key: 'total_days', label: 'Tổng công', defaultOn: true, sumKey: 'total_days', isDaySum: true, thCls: 'p-2.5 text-center whitespace-nowrap font-bold' },
        { key: 'base_salary', label: 'Lương CB', defaultOn: true, sumKey: 'base_salary', thCls: 'p-2.5 text-right whitespace-nowrap' },
        { key: 'probation_salary', label: 'Lương TV (85%)', defaultOn: true, sumKey: 'probation_salary', thCls: 'p-2.5 text-right whitespace-nowrap text-slate-600' },
        { key: 'pay_days', label: 'Lương công', defaultOn: true, sumKey: 'pay_days', thCls: 'p-2.5 text-right whitespace-nowrap' },
        { key: 'allowance', label: 'Phụ cấp', defaultOn: true, sumKey: 'allowance', thCls: 'p-2.5 text-right whitespace-nowrap' },
        { key: 'fuel_other', label: 'PC Xăng/Khác', defaultOn: true, sumKey: 'fuel_other', thCls: 'p-2.5 text-right whitespace-nowrap' },
        { key: 'holiday_pay', label: 'Lễ', defaultOn: true, sumKey: 'holiday_pay', thCls: 'p-2.5 text-right whitespace-nowrap' },
        { key: 'commission', label: 'Hoa hồng bán', defaultOn: true, sumKey: 'commission', thCls: 'p-2.5 text-right whitespace-nowrap' },
        { key: 'spa_commission', label: 'Hoa hồng Spa', defaultOn: true, sumKey: 'spa_commission', thCls: 'p-2.5 text-right whitespace-nowrap' },
        { key: 'tips', label: 'Tip', defaultOn: true, sumKey: 'tips', thCls: 'p-2.5 text-right whitespace-nowrap' },
        { key: 'attendance_bonus', label: 'Chuyên cần', defaultOn: true, sumKey: 'attendance_bonus', thCls: 'p-2.5 text-right whitespace-nowrap' },
        { key: 'birthday_bonus', label: 'Thưởng SN', defaultOn: true, sumKey: 'birthday_bonus', thCls: 'p-2.5 text-right whitespace-nowrap' },
        { key: 'bonus_other', label: 'Thưởng khác', defaultOn: true, sumKey: 'bonus_other', thCls: 'p-2.5 text-right whitespace-nowrap' },
        { key: 'ot_pay', label: 'Tăng ca', defaultOn: true, sumKey: 'ot_pay', thCls: 'p-2.5 text-right whitespace-nowrap' },
        { key: 'gross', label: 'Tổng thu nhập', defaultOn: true, sumKey: 'gross', thCls: 'p-2.5 text-right whitespace-nowrap text-slate-800' },
        { key: 'penalties', label: 'Phạt', defaultOn: true, sumKey: 'penalties', isNeg: true, thCls: 'p-2.5 text-right whitespace-nowrap text-rose-600' },
        { key: 'advances', label: 'Tạm ứng', defaultOn: true, sumKey: 'advances', isNeg: true, thCls: 'p-2.5 text-right whitespace-nowrap text-rose-600' },
        { key: 'deduction_other', label: 'Trừ khác', defaultOn: true, sumKey: 'deduction_other', isNeg: true, thCls: 'p-2.5 text-right whitespace-nowrap text-rose-600' },
        { key: 'insurance', label: 'BHXH', defaultOn: true, sumKey: 'insurance', isDashZero: true, thCls: 'p-2.5 text-right whitespace-nowrap text-sky-700' },
        { key: 'pit', label: 'Thuế TNCN', defaultOn: true, sumKey: 'pit', isDashZero: true, thCls: 'p-2.5 text-right whitespace-nowrap text-sky-700' },
        { key: 'net_pay', label: 'Thực Lãnh', fixed: true, sumKey: 'net_pay', thCls: 'p-2.5 text-right whitespace-nowrap font-bold text-emerald-700' },
        { key: 'paid_status', label: 'Trạng Thái Chi', defaultOn: true, group: 'tail', thCls: 'p-2.5 text-center whitespace-nowrap' },
        { key: 'actions', label: 'Thao Tác', fixed: true, group: 'tail', thCls: 'p-2.5 text-center whitespace-nowrap' }
    ];

    let payrollColsVis = (() => {
        const def = {};
        PAYROLL_COLUMNS.forEach(c => { if (!c.fixed) def[c.key] = c.defaultOn !== false; });
        try {
            const raw = localStorage.getItem(PAYROLL_COL_STORAGE_KEY);
            if (raw) Object.assign(def, JSON.parse(raw));
        } catch (_) {}
        return def;
    })();
    let payrollColsLoadedFromServer = false;

    function isPayrollColVisible(col) {
        return col.fixed ? true : payrollColsVis[col.key] !== false;
    }

    function syncPayrollColsBadgeAndPopover() {
        const toggleable = PAYROLL_COLUMNS.filter(c => !c.fixed);
        const onCount = toggleable.filter(c => isPayrollColVisible(c)).length;
        const badge = document.getElementById('hrm-payroll-cols-badge');
        if (badge) badge.textContent = `${onCount}/${toggleable.length}`;
        const listEl = document.getElementById('hrm-payroll-cols-list');
        if (listEl) {
            listEl.innerHTML = toggleable.map(c => `
                <label class="flex items-center gap-1.5 px-2 py-1 rounded hover:bg-slate-50 cursor-pointer select-none">
                    <input type="checkbox" ${isPayrollColVisible(c) ? 'checked' : ''} onchange="togglePayrollColumn('${c.key}', this.checked)" class="rounded text-sky-600 cursor-pointer">
                    <span class="truncate ${c.key === 'insurance' || c.key === 'pit' ? 'font-bold text-sky-800' : 'text-slate-700'}">${c.label}</span>
                </label>
            `).join('');
        }
    }

    async function persistPayrollColumns() {
        try { localStorage.setItem(PAYROLL_COL_STORAGE_KEY, JSON.stringify(payrollColsVis)); } catch (_) {}
        try {
            await fetch('/api/hrm/payroll-columns', {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ columns: payrollColsVis })
            });
        } catch (_) {}
    }

    window.togglePayrollColumnsPopover = function(e) {
        if (e) e.stopPropagation();
        const pop = document.getElementById('hrm-payroll-cols-popover');
        if (!pop) return;
        syncPayrollColsBadgeAndPopover();
        pop.classList.toggle('hidden');
    };

    document.addEventListener('click', () => {
        const pop = document.getElementById('hrm-payroll-cols-popover');
        if (pop && !pop.classList.contains('hidden')) pop.classList.add('hidden');
    });

    window.togglePayrollColumn = function(colKey, checked) {
        payrollColsVis[colKey] = Boolean(checked);
        syncPayrollColsBadgeAndPopover();
        persistPayrollColumns();
        if (payrollData) renderPayrollUI(payrollData);
    };

    window.applyPayrollColsPreset = function(mode) {
        PAYROLL_COLUMNS.forEach(c => {
            if (c.fixed) return;
            if (mode === 'hide_tax_ins') {
                if (c.key === 'insurance' || c.key === 'pit') payrollColsVis[c.key] = false;
            } else if (mode === 'all') {
                payrollColsVis[c.key] = true;
            }
        });
        syncPayrollColsBadgeAndPopover();
        persistPayrollColumns();
        if (payrollData) renderPayrollUI(payrollData);
    };

    async function loadHrmPayroll(month) {
        const m = month || getSelectedMonth();
        try {
            if (!payrollColsLoadedFromServer) {
                payrollColsLoadedFromServer = true;
                fetch('/api/hrm/payroll-columns').then(r => r.ok ? r.json() : null).then(cfg => {
                    if (cfg && cfg.columns && typeof cfg.columns === 'object') {
                        Object.assign(payrollColsVis, cfg.columns);
                        try { localStorage.setItem(PAYROLL_COL_STORAGE_KEY, JSON.stringify(payrollColsVis)); } catch (_) {}
                        syncPayrollColsBadgeAndPopover();
                        if (payrollData) renderPayrollUI(payrollData);
                    }
                }).catch(() => {});
            }
            syncPayrollColsBadgeAndPopover();
            const res = await fetch(`/api/hrm/payroll/${m}`);
            if (!res.ok) return;
            payrollData = await res.json();
            renderPayrollUI(payrollData);
        } catch (e) {
            console.error("Lỗi tải bảng lương:", e);
        }
    }

    function renderPayrollUI(data) {
        const badge = document.getElementById('hrm-payroll-status-badge');
        const lockInfo = document.getElementById('hrm-payroll-lock-info');
        const btnLock = document.getElementById('btn-hrm-lock');
        const btnUnlock = document.getElementById('btn-hrm-unlock');
        const btnCalc = document.getElementById('btn-hrm-calc');
        const btnPay = document.getElementById('btn-hrm-pay');

        if (data.status === 'locked') {
            badge.className = "px-2.5 py-0.5 rounded-full text-xs font-bold bg-sky-100 text-sky-800";
            badge.textContent = "ĐÃ CHỐT";
            lockInfo.textContent = `Chốt bởi ${data.locked_by || ''} lúc ${data.locked_at || ''}`;
            btnLock.classList.add('hidden');
            btnUnlock.classList.remove('hidden');
            btnCalc.disabled = true;
            btnCalc.classList.add('opacity-50', 'cursor-not-allowed');
            btnPay.classList.remove('hidden');
        } else if (data.status === 'paid') {
            badge.className = "px-2.5 py-0.5 rounded-full text-xs font-bold bg-emerald-100 text-emerald-800";
            badge.textContent = "ĐÃ CHI TRẢ";
            lockInfo.textContent = "";
            btnLock.classList.add('hidden');
            btnUnlock.classList.add('hidden');
            btnCalc.disabled = true;
            btnCalc.classList.add('opacity-50', 'cursor-not-allowed');
            btnPay.classList.add('hidden');
        } else {
            badge.className = "px-2.5 py-0.5 rounded-full text-xs font-bold bg-amber-100 text-amber-800";
            badge.textContent = "TẠM TÍNH";
            lockInfo.textContent = "";
            btnLock.classList.remove('hidden');
            btnUnlock.classList.add('hidden');
            btnCalc.disabled = false;
            btnCalc.classList.remove('opacity-50', 'cursor-not-allowed');
            btnPay.classList.add('hidden');
        }

        const thead = document.getElementById('table-hrm-payroll-head');
        const tbody = document.getElementById('table-hrm-payroll');
        const foot = document.getElementById('table-hrm-payroll-foot');
        const visCols = PAYROLL_COLUMNS.filter(c => isPayrollColVisible(c));
        syncPayrollColsBadgeAndPopover();
        if (thead) {
            thead.innerHTML = `<tr>${visCols.map(c => `<th data-pcol="${c.key}" class="${c.thCls}" ${c.title ? `title="${c.title}"` : ''}>${c.label}</th>`).join('')}</tr>`;
        }

        const issuesBar = document.getElementById('hrm-payroll-issues-bar');
        const allLines = data.lines || [];
        const issueLines = allLines.filter(l => (l.anomalies || []).length);
        if (issuesBar) {
            issuesBar.classList.toggle('hidden', !issueLines.length);
            const byType = {};
            issueLines.forEach(l => l.anomalies.forEach(a => {
                const k = a.split(/[:(]/)[0].replace(/[+-]?\d{1,3}(\.\d{3})+|[+-]\d+%/g, '…').replace(/\s+/g, ' ').trim();
                byType[k] = (byType[k] || 0) + 1;
            }));
            document.getElementById('hrm-payroll-issues-count').textContent = `${issueLines.length}/${allLines.length} nhân viên có cảnh báo:`;
            document.getElementById('hrm-payroll-issues-summary').textContent = Object.entries(byType).map(([k, n]) => `${k} (${n})`).join(' · ');
        }
        const onlyIssues = document.getElementById('hrm-payroll-only-issues')?.checked;
        const lines = onlyIssues ? issueLines : allLines;
        if (!lines.length) {
            tbody.innerHTML = `<tr><td colspan="${visCols.length}" class="p-6 text-center text-slate-400">Chưa có dữ liệu bảng lương tháng này. Hãy bấm "Tính Lương" để khởi tạo.</td></tr>`;
            if (foot) foot.innerHTML = '';
            return;
        }
        const esc = v => String(v ?? '').replace(/[&<>"']/g, ch => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'}[ch]));
        const fmtN = v => Number(v || 0).toLocaleString('vi-VN');
        const isDraft = (data.status || 'draft') === 'draft';

        const renderCell = (col, l, issCell, stickyBgCls) => {
            const totalDays = Number((Number(l.days_official || 0) + Number(l.days_probation || 0)).toFixed(2));
            switch (col.key) {
                case 'alert':
                    return `<td class="p-2.5 text-center w-[38px] min-w-[38px] sticky left-0 z-10 ${stickyBgCls}">${issCell}</td>`;
                case 'employee_code':
                    return `<td class="p-2.5 font-mono font-bold text-sky-700 whitespace-nowrap w-[72px] min-w-[72px] sticky left-[38px] z-10 ${stickyBgCls}">${esc(l.employee_code || '')}</td>`;
                case 'name':
                    return `<td onclick="openHrmPayslipModal(${l.staff_id})" class="p-2.5 font-bold text-slate-900 hover:text-sky-700 hover:underline cursor-pointer whitespace-nowrap min-w-[175px] sticky left-[110px] z-10 border-r-2 border-slate-200 shadow-[3px_0_5px_-2px_rgba(15,23,42,0.08)] ${stickyBgCls}" title="Bấm xem phiếu lương chi tiết">${esc(l.name || '')}</td>`;
                case 'block':
                    return `<td class="p-2.5 text-slate-600 whitespace-nowrap">${esc(l.block || '')}</td>`;
                case 'position':
                    return `<td class="p-2.5 text-slate-600 whitespace-nowrap">${esc(l.position || '')}</td>`;
                case 'contractual_status':
                    return `<td class="p-2.5 text-center whitespace-nowrap"><span class="px-1.5 py-0.5 rounded text-xs font-semibold ${l.contractual_status === 'Thử việc' ? 'bg-amber-50 text-amber-700' : 'bg-emerald-50 text-emerald-700'}">${esc(l.contractual_status || 'Chính thức')}</span></td>`;
                case 'std_days':
                    return `<td onclick="viewHrmStaffDaysDetail(${l.staff_id})" class="p-2.5 text-center cursor-pointer hover:bg-slate-100 hover:underline" title="Bấm xem chi tiết chấm công 30 ngày">${l.std_days || 0}</td>`;
                case 'days_official':
                    return `<td onclick="viewHrmStaffDaysDetail(${l.staff_id})" class="p-2.5 text-center font-bold text-emerald-700 cursor-pointer hover:bg-emerald-50 hover:underline" title="Bấm xem chi tiết chấm công 30 ngày">${l.days_official || 0}</td>`;
                case 'days_probation':
                    return `<td onclick="viewHrmStaffDaysDetail(${l.staff_id})" class="p-2.5 text-center font-bold text-amber-600 cursor-pointer hover:bg-amber-50 hover:underline" title="Bấm xem chi tiết chấm công 30 ngày">${l.days_probation || 0}</td>`;
                case 'total_days':
                    return `<td onclick="viewHrmStaffDaysDetail(${l.staff_id})" class="p-2.5 text-center font-bold text-slate-900 cursor-pointer hover:bg-sky-50 hover:underline" title="Bấm xem chi tiết chấm công 30 ngày">${l.total_days !== undefined ? l.total_days : totalDays}</td>`;
                case 'base_salary':
                    return `<td class="p-2.5 text-right font-mono">${fmtN(l.base_salary)}</td>`;
                case 'probation_salary':
                    return `<td class="p-2.5 text-right font-mono text-slate-500">${fmtN(l.probation_salary)}</td>`;
                case 'pay_days':
                    return `<td class="p-2.5 text-right font-mono font-bold">${fmtN(l.pay_days)}</td>`;
                case 'allowance':
                    return `<td class="p-2.5 text-right font-mono">${fmtN(l.allowance)}</td>`;
                case 'fuel_other':
                    return isDraft
                        ? `<td onclick="openHrmManualItemsModal(${l.staff_id}, 'fuel')" class="p-2.5 text-right font-mono text-sky-700 cursor-pointer hover:bg-sky-50 hover:underline whitespace-nowrap" title="Bấm để thêm / sửa các khoản Phụ cấp xăng xe, điện thoại, khác">${fmtN(l.fuel_other)} <i class="ph ph-pencil-simple text-slate-400"></i></td>`
                        : `<td class="p-2.5 text-right font-mono">${fmtN(l.fuel_other)}</td>`;
                case 'holiday_pay':
                    return `<td class="p-2.5 text-right font-mono">${fmtN(l.holiday_pay)}</td>`;
                case 'commission':
                    return `<td class="p-2.5 text-right font-mono text-sky-700">${fmtN(l.commission)}</td>`;
                case 'spa_commission':
                    return `<td class="p-2.5 text-right font-mono text-sky-700">${fmtN(l.spa_commission)}</td>`;
                case 'tips':
                    return `<td class="p-2.5 text-right font-mono text-sky-700">${fmtN(l.tips)}</td>`;
                case 'attendance_bonus':
                    return `<td class="p-2.5 text-right font-mono text-emerald-700">${fmtN(l.attendance_bonus)}</td>`;
                case 'birthday_bonus':
                    return `<td class="p-2.5 text-right font-mono">${fmtN(l.birthday_bonus)}</td>`;
                case 'bonus_other':
                    return isDraft
                        ? `<td onclick="openHrmManualItemsModal(${l.staff_id}, 'bonus')" class="p-2.5 text-right font-mono font-bold text-emerald-700 cursor-pointer hover:bg-emerald-50 hover:underline whitespace-nowrap" title="Bấm để thêm / sửa các khoản Thưởng nóng, thưởng khác">${fmtN(l.bonus_other)} <i class="ph ph-pencil-simple text-slate-400"></i></td>`
                        : `<td class="p-2.5 text-right font-mono text-emerald-700">${fmtN(l.bonus_other)}</td>`;
                case 'ot_pay':
                    return `<td class="p-2.5 text-right font-mono font-bold text-amber-700">${fmtN(l.ot_pay)}</td>`;
                case 'gross':
                    return `<td class="p-2.5 text-right font-mono font-bold text-slate-800">${fmtN(l.gross)}</td>`;
                case 'penalties':
                    return `<td onclick="viewHrmStaffDaysDetail(${l.staff_id})" class="p-2.5 text-right font-mono font-bold text-rose-600 cursor-pointer hover:bg-rose-50 hover:underline" title="Bấm xem chi tiết phút trễ & duyệt phạt">-${fmtN(l.penalties)}</td>`;
                case 'advances':
                    return `<td class="p-2.5 text-right font-mono font-bold text-rose-600">-${fmtN(l.advances)}</td>`;
                case 'deduction_other':
                    return isDraft
                        ? `<td onclick="openHrmManualItemsModal(${l.staff_id}, 'deduction')" class="p-2.5 text-right font-mono font-bold text-rose-600 cursor-pointer hover:bg-rose-50 hover:underline whitespace-nowrap" title="Bấm để thêm / sửa các khoản Giảm trừ khác">-${fmtN(l.deduction_other)} <i class="ph ph-pencil-simple text-slate-400"></i></td>`
                        : `<td class="p-2.5 text-right font-mono font-bold text-rose-600">-${fmtN(l.deduction_other)}</td>`;
                case 'insurance':
                    return `<td class="p-2.5 text-right font-mono font-bold text-sky-700">${l.insurance ? '-' + fmtN(l.insurance) : '—'}</td>`;
                case 'pit':
                    return `<td class="p-2.5 text-right font-mono font-bold text-sky-700">${l.pit ? '-' + fmtN(l.pit) : '—'}</td>`;
                case 'net_pay':
                    return `<td onclick="openHrmPayslipModal(${l.staff_id})" class="p-2.5 text-right font-mono font-bold text-sm text-emerald-700 cursor-pointer hover:underline" title="Bấm xem phiếu lương chi tiết">${fmtN(l.net_rounded)}đ</td>`;
                case 'paid_status':
                    return `<td class="p-2.5 text-center whitespace-nowrap">${l.cashbook_code ? `<span class="px-2 py-0.5 rounded text-xs font-bold bg-emerald-100 text-emerald-800">${esc(l.cashbook_code)}</span>` : `<span class="text-slate-400">Chưa chi</span>`}</td>`;
                case 'actions':
                    return `<td class="p-2.5 text-center whitespace-nowrap"><button onclick="openHrmPayslipModal(${l.staff_id})" class="text-indigo-700 hover:underline font-bold cursor-pointer" title="Xem & in phiếu lương nhân viên">Phiếu lương</button></td>`;
                default:
                    return `<td class="p-2.5"></td>`;
            }
        };

        tbody.innerHTML = lines.map(l => {
            const iss = l.anomalies || [];
            const issCell = iss.length
                ? `<span class="inline-flex items-center justify-center min-w-5 h-5 px-1 rounded-full bg-amber-100 text-amber-800 font-bold cursor-help" title="${esc(iss.join('\n'))}">${iss.length}</span>`
                : '';
            const stickyBgCls = iss.length ? 'bg-amber-50 group-hover:bg-slate-50' : 'bg-white group-hover:bg-slate-50';
            return `<tr class="group hover:bg-slate-50 ${iss.length ? 'bg-amber-50/40' : ''}">${visCols.map(c => renderCell(c, l, issCell, stickyBgCls)).join('')}</tr>`;
        }).join('');

        const tot = data.totals || {};
        const firstSumIdx = visCols.findIndex(c => c.sumKey);
        const leadSpan = firstSumIdx > 0 ? firstSumIdx : 1;
        const pinnedCount = Math.min(3, leadSpan);
        const restLead = leadSpan - pinnedCount;
        let footHtml = `<tr><td colspan="${pinnedCount}" class="p-2.5 text-right uppercase sticky left-0 z-20 bg-slate-100 border-r-2 border-slate-300 shadow-[3px_0_5px_-2px_rgba(15,23,42,0.08)]">Tổng cộng (${lines.length} NV):</td>${restLead > 0 ? `<td colspan="${restLead}" class="p-2.5 bg-slate-100"></td>` : ''}`;
        for (let i = leadSpan; i < visCols.length; i++) {
            const c = visCols[i];
            if (!c.sumKey) {
                footHtml += `<td class="p-2.5"></td>`;
            } else if (c.key === 'net_pay') {
                footHtml += `<td class="p-2.5 text-right font-mono font-bold text-emerald-800 text-sm">${fmtN(tot.net_pay)}đ</td>`;
            } else if (c.isDaySum) {
                const v = Number((tot[c.sumKey] || 0).toFixed ? Number(tot[c.sumKey] || 0).toFixed(1) : 0);
                footHtml += `<td class="p-2.5 text-center font-mono">${v}</td>`;
            } else if (c.isDashZero) {
                footHtml += `<td class="p-2.5 text-right font-mono text-sky-700">${tot[c.sumKey] ? '-' + fmtN(tot[c.sumKey]) : '—'}</td>`;
            } else if (c.isNeg) {
                footHtml += `<td class="p-2.5 text-right font-mono text-rose-600">-${fmtN(tot[c.sumKey])}</td>`;
            } else {
                footHtml += `<td class="p-2.5 text-right font-mono ${c.key === 'pay_days' || c.key === 'gross' ? 'font-bold' : ''}">${fmtN(tot[c.sumKey])}</td>`;
            }
        }
        footHtml += `</tr>`;
        if (foot) foot.innerHTML = footHtml;
    }

    window.calculateHrmPayroll = async function() {
        const month = getSelectedMonth();
        try {
            const res = await fetch(`/api/hrm/payroll/${month}/calculate`, { method: 'POST' });
            if (!res.ok) {
                const err = await res.json();
                window.showToast ? window.showToast(err.detail || 'Lỗi tính lương', 'error') : alert(err.detail);
                return;
            }
            payrollData = await res.json();
            renderPayrollUI(payrollData);
            if (window.showToast) window.showToast("Đã tính toán bảng lương thành công", "success");
        } catch (e) {
            console.error(e);
        }
    };

    window.rerenderHrmPayroll = () => { if (payrollData) renderPayrollUI(payrollData); };

    window.lockHrmPayroll = async function() {
        const month = getSelectedMonth();
        // Còn cảnh báo thì liệt kê ra để anh xem lại trước khi chốt (không chặn cứng)
        const withIssues = (payrollData?.lines || []).filter(l => (l.anomalies || []).length);
        const esc = v => String(v ?? '').replace(/[&<>"']/g, ch => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'}[ch]));
        // Gom theo loại cảnh báo: "Thực lãnh âm (20): NV03, NV06…" thay vì lặp lý do từng người
        const groups = {};
        withIssues.forEach(l => l.anomalies.forEach(a => {
            const k = a.split(/[:(]/)[0].replace(/[+-]?\d{1,3}(\.\d{3})+|[+-]\d+%/g, '…').replace(/\s+/g, ' ').trim();
            (groups[k] = groups[k] || []).push(l.employee_code || l.name);
        }));
        const issuesHtml = withIssues.length
            ? `<div class="text-left max-h-60 overflow-y-auto text-amber-900 space-y-1"><div class="font-bold">⚠ Còn ${withIssues.length} nhân viên có cảnh báo:</div>${Object.entries(groups).map(([k, codes]) => `<div><b>${esc(k)} (${codes.length})</b>: ${codes.map(esc).join(', ')}</div>`).join('')}</div>`
            : '';
        const conf = await window.showConfirmModal({
            title: withIssues.length ? `Chốt lương khi còn ${withIssues.length} cảnh báo?` : "Chốt Bảng Lương",
            message: `Bạn có chắc chắn muốn CHỐT bảng lương tháng ${month}? Sau khi chốt, dữ liệu chấm công và tăng ca của tháng này sẽ bị khóa hoàn toàn.`,
            subMessage: issuesHtml,
            confirmText: withIssues.length ? "Vẫn chốt" : "Chốt Lương",
            type: withIssues.length ? "danger" : "warning",
            icon: '🔒'
        });
        if (!conf) return;
        const res = await fetch(`/api/hrm/payroll/${month}/lock`, { method: 'POST' });
        if (res.ok) {
            payrollData = await res.json();
            renderPayrollUI(payrollData);
            if (window.showToast) window.showToast("Đã chốt bảng lương thành công", "success");
        }
    };

    window.unlockHrmPayroll = async function() {
        const month = getSelectedMonth();
        const conf = await window.showConfirmModal({
            title: "Mở Khóa Bảng Lương",
            message: `Mở khóa bảng lương tháng ${month} để tính toán lại?`,
            confirmText: "Mở Khóa",
            type: "danger"
        });
        if (!conf) return;
        const res = await fetch(`/api/hrm/payroll/${month}/unlock`, { method: 'POST' });
        if (res.ok) {
            payrollData = await res.json();
            renderPayrollUI(payrollData);
            if (window.showToast) window.showToast("Đã mở khóa bảng lương", "info");
        }
    };

    window.openHrmPayModal = async function() {
        const month = getSelectedMonth();
        const accRes = await fetch('/api/payment-accounts');
        const accounts = await accRes.json();
        const activeAccs = accounts.filter(a => a.is_active);

        const selHtml = activeAccs.map(a => `<option value="${a.id}">${a.name} (${a.code})</option>`).join('');
        const conf = await window.showConfirmModal({
            title: "Chi Trả Lương Hàng Loạt",
            message: `Hệ thống sẽ tạo phiếu chi Sổ Quỹ cho toàn bộ nhân viên có thực lãnh > 0 chưa được chi trả. Vui lòng chọn tài khoản nguồn:`,
            subMessage: `<select id="hrm-pay-account-id" class="w-full border p-2 rounded mt-2 text-xs font-bold text-slate-800">${selHtml}</select>`,
            confirmText: "Thực Hiện Chi Lương",
            type: "primary"
        });
        if (!conf) return;
        const accId = parseInt(document.getElementById('hrm-pay-account-id').value);
        const res = await fetch(`/api/hrm/payroll/${month}/pay`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ account_id: accId })
        });
        if (res.ok) {
            const result = await res.json();
            renderPayrollUI(result);
            if (window.showToast) window.showToast(`Đã chi trả thành công ${result.paid_count || 0} nhân viên sang Sổ Quỹ`, "success");
        }
    };

    window.exportHrmPayroll = function() {
        const month = getSelectedMonth();
        downloadWithAuth(`/api/hrm/payroll/${month}/export`, `Bang_Luong_${month}.xlsx`);
    };

    // ── Chấm Công Matrix & Bảng Chi Tiết Duyệt Phạt ──
    let hrmAttCurrentView = 'matrix';
    const HRM_ATT_SORT_STORAGE_KEY = 'hrm_att_detail_sort_v1';
    const HRM_DOW_NAMES = ['CN', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7'];

    function parseVnIsoDate(isoStr) {
        const s = String(isoStr || '').slice(0, 10);
        const parts = s.split('-');
        if (parts.length !== 3) return { formatted: s, dayOfWeek: '', isSun: false };
        const y = parseInt(parts[0], 10);
        const m = parseInt(parts[1], 10);
        const d = parseInt(parts[2], 10);
        const dt = new Date(y, m - 1, d);
        const dowIdx = dt.getDay();
        const dd = String(d).padStart(2, '0');
        const mm = String(m).padStart(2, '0');
        return {
            formatted: `${dd}/${mm}/${y}`,
            dayOfWeek: HRM_DOW_NAMES[dowIdx] || '',
            isSun: dowIdx === 0
        };
    }

    function fmtVnDate(isoStr, withDow = false) {
        if (!isoStr) return '—';
        const info = parseVnIsoDate(isoStr);
        if (!info.dayOfWeek) return info.formatted || '—';
        return withDow ? `${info.formatted} (${info.dayOfWeek})` : info.formatted;
    }

    function groupRowsByStaff(list) {
        const map = new Map();
        (list || []).forEach(r => {
            const sid = String(r.staff_id || r.employee_code || r.staff_code || r.staff_name || r.name || 'unknown');
            if (!map.has(sid)) {
                map.set(sid, {
                    key: sid,
                    staff_id: r.staff_id,
                    employee_code: (r.employee_code || r.staff_code || '').trim(),
                    staff_name: r.staff_name || r.name || 'Nhân viên',
                    meta: [r.block_name, r.department, r.position].filter(Boolean).join(' · ') || '—',
                    rows: []
                });
            }
            map.get(sid).rows.push(r);
        });
        return Array.from(map.values()).sort((a, b) => {
            if (a.employee_code && !b.employee_code) return -1;
            if (!a.employee_code && b.employee_code) return 1;
            if (a.employee_code && b.employee_code && a.employee_code !== b.employee_code) {
                return hrmViCollator.compare(a.employee_code, b.employee_code);
            }
            return hrmViCollator.compare(a.staff_name || '', b.staff_name || '');
        });
    }

    let hrmAttSortState = (() => {
        try {
            const saved = JSON.parse(localStorage.getItem(HRM_ATT_SORT_STORAGE_KEY) || 'null');
            if (saved && saved.key && saved.dir) return saved;
        } catch (_) {}
        return { key: 'date', dir: 'desc' };
    })();

    function saveHrmAttSortState() {
        try { localStorage.setItem(HRM_ATT_SORT_STORAGE_KEY, JSON.stringify(hrmAttSortState)); } catch (_) {}
    }

    function syncHrmAttSortUI() {
        const sel = document.getElementById('hrm-att-sort-by');
        if (sel) {
            const comboVal = `${hrmAttSortState.key}_${hrmAttSortState.dir}`;
            const hasOpt = Array.from(sel.options).some(o => o.value === comboVal);
            if (hasOpt) sel.value = comboVal;
        }
        document.querySelectorAll('[data-att-sort-ind]').forEach(el => {
            const k = el.getAttribute('data-att-sort-ind');
            if (k === hrmAttSortState.key) {
                el.textContent = hrmAttSortState.dir === 'asc' ? '↑' : '↓';
                el.className = k === 'penalty' ? 'text-rose-600 font-bold' : 'text-sky-600 font-bold';
            } else {
                el.textContent = '⇅';
                el.className = k === 'penalty' ? 'text-rose-300' : 'text-slate-400';
            }
        });
    }

    window.onHrmAttSortSelectChange = function(val) {
        const idx = String(val || '').lastIndexOf('_');
        if (idx > 0) {
            hrmAttSortState = { key: val.slice(0, idx), dir: val.slice(idx + 1) === 'asc' ? 'asc' : 'desc' };
            saveHrmAttSortState();
            renderAttendanceDetailTable();
        }
    };

    window.toggleHrmAttSort = function(colKey) {
        if (hrmAttSortState.key === colKey) {
            hrmAttSortState.dir = hrmAttSortState.dir === 'asc' ? 'desc' : 'asc';
        } else {
            const defaultDesc = ['penalty', 'late', 'early', 'worked', 'credit'].includes(colKey);
            hrmAttSortState = { key: colKey, dir: defaultDesc ? 'desc' : 'asc' };
        }
        saveHrmAttSortState();
        renderAttendanceDetailTable();
    };

    function syncHrmAttStaffFilterOptions() {
        const staffSel = document.getElementById('hrm-att-filter-staff');
        const searchInp = document.getElementById('hrm-att-filter-staff-search');
        const clearBtn = document.getElementById('hrm-att-filter-staff-clear');
        if (!staffSel) return;

        const curVal = String(staffSel.value || '');
        if (attendanceData && Array.isArray(attendanceData.employees) && attendanceData.employees.length > 0) {
            const list = attendanceData.employees.map(e => ({
                id: e.staff_id,
                employee_code: (e.employee_code || '').trim(),
                name: e.name || `NV #${e.staff_id}`,
                block_name: e.block_name || e.block || ''
            })).sort((a, b) => {
                if (a.employee_code && !b.employee_code) return -1;
                if (!a.employee_code && b.employee_code) return 1;
                if (a.employee_code && b.employee_code && a.employee_code !== b.employee_code) {
                    return hrmViCollator.compare(a.employee_code, b.employee_code);
                }
                return hrmViCollator.compare(a.name || '', b.name || '');
            });

            hrmStaffPickerState['hrm-att-filter-staff'] = list;
            staffSel.innerHTML = '<option value="">Tất cả nhân viên</option>' +
                list.map(s => `<option value="${s.id}" ${String(s.id) === curVal ? 'selected' : ''}>${escHrmHtml(formatHrmEmpLabel(s))}</option>`).join('');

            const chosen = curVal ? list.find(s => String(s.id) === curVal) : null;
            staffSel.value = chosen ? String(chosen.id) : '';
            if (searchInp && document.activeElement !== searchInp) {
                searchInp.value = chosen ? formatHrmEmpLabel(chosen) : '';
            }
            if (clearBtn) clearBtn.classList.toggle('hidden', !chosen);
        } else if (!(hrmStaffPickerState['hrm-att-filter-staff'] || []).length) {
            initHrmStaffPicker('hrm-att-filter-staff', curVal);
        }
    }

    async function loadHrmAttendance(month) {
        try {
            const res = await fetch(`/api/hrm/attendance?month=${month}`);
            if (!res.ok) return;
            attendanceData = await res.json();
            syncHrmAttStaffFilterOptions();
            renderAttendanceMatrix(attendanceData);
            if (hrmAttCurrentView === 'detail') {
                renderAttendanceDetailTable();
            }
        } catch (e) {
            console.error(e);
        }
    }

    window.switchHrmAttendanceView = function(view) {
        hrmAttCurrentView = view;
        const btnMatrix = document.getElementById('btn-hrm-att-view-matrix');
        const btnDetail = document.getElementById('btn-hrm-att-view-detail');
        const containerMatrix = document.getElementById('hrm-attendance-matrix-container');
        const containerDetail = document.getElementById('hrm-attendance-detail-container');
        const legend = document.getElementById('hrm-att-matrix-legend');

        if (view === 'matrix') {
            if (btnMatrix) btnMatrix.className = "px-3 py-1 text-xs font-bold rounded-md bg-white text-emerald-800 shadow-2xs cursor-pointer transition-all";
            if (btnDetail) btnDetail.className = "px-3 py-1 text-xs font-bold rounded-md text-slate-600 hover:text-slate-900 cursor-pointer transition-all";
            if (containerMatrix) containerMatrix.classList.remove('hidden');
            if (containerDetail) containerDetail.classList.add('hidden');
            if (legend) legend.classList.remove('hidden');
        } else {
            if (btnMatrix) btnMatrix.className = "px-3 py-1 text-xs font-bold rounded-md text-slate-600 hover:text-slate-900 cursor-pointer transition-all";
            if (btnDetail) btnDetail.className = "px-3 py-1 text-xs font-bold rounded-md bg-white text-emerald-800 shadow-2xs cursor-pointer transition-all";
            if (containerMatrix) containerMatrix.classList.add('hidden');
            if (containerDetail) containerDetail.classList.remove('hidden');
            if (legend) legend.classList.add('hidden');

            syncHrmAttStaffFilterOptions();
            renderAttendanceDetailTable();
        }
    };

    window.renderAttendanceDetailTable = function() {
        if (!attendanceData || !attendanceData.employees) return;
        const staffSelCheck = document.getElementById('hrm-att-filter-staff');
        if (staffSelCheck && staffSelCheck.options.length <= 1) {
            syncHrmAttStaffFilterOptions();
        }
        const tbody = document.getElementById('table-hrm-att-detail-body');
        const tfoot = document.getElementById('table-hrm-att-detail-foot');
        const countEl = document.getElementById('hrm-att-detail-count');
        const rulesPill = document.getElementById('hrm-att-rules-pill');
        if (!tbody) return;

        syncHrmAttSortUI();

        const rCfg = attendanceData.rules || {};
        if (rulesPill && rCfg.late_per_min) {
            rulesPill.textContent = `Đơn giá trễ: ${Number(rCfg.late_per_min).toLocaleString('vi-VN')}đ/p • Trần ≥${rCfg.late_flat_threshold_min || 30}p: ${Number(rCfg.late_flat || 200000).toLocaleString('vi-VN')}đ`;
            rulesPill.classList.remove('hidden');
        }

        const filterStatus = document.getElementById('hrm-att-filter-status')?.value || 'late_viol';
        const filterStaff = document.getElementById('hrm-att-filter-staff')?.value || '';
        const filterDate = document.getElementById('hrm-att-filter-date')?.value || '';

        let rows = [];
        attendanceData.employees.forEach(emp => {
            if (filterStaff && String(emp.staff_id) !== filterStaff) return;
            (emp.days || []).forEach(d => {
                if (filterDate && d.date !== filterDate) return;

                const hasViolation = (d.late_min > 0 || (d.violations && d.violations.length > 0) || d.penalty > 0);
                const isWaived = Boolean(d.waive);
                const isOnTime = Boolean(d.check_in && !d.late_min && (!d.violations || d.violations.length === 0) && !d.penalty);
                const isLeave = (d.code === 'OFF' || d.code === 'L' || Boolean(d.leave_type));

                if (filterStatus === 'late_viol' && !hasViolation && !isWaived) return;
                if (filterStatus === 'on_time' && !isOnTime) return;
                if (filterStatus === 'waived' && !isWaived) return;
                if (filterStatus === 'leave' && !isLeave) return;

                rows.push({ emp, day: d });
            });
        });

        const mul = hrmAttSortState.dir === 'asc' ? 1 : -1;
        const sk = hrmAttSortState.key;
        rows.sort((a, b) => {
            let cmp = 0;
            if (sk === 'date') cmp = a.day.date.localeCompare(b.day.date);
            else if (sk === 'staff') cmp = hrmViCollator.compare(a.emp.employee_code || String(a.emp.staff_id), b.emp.employee_code || String(b.emp.staff_id));
            else if (sk === 'name') cmp = hrmViCollator.compare(a.emp.name || '', b.emp.name || '');
            else if (sk === 'check_in') cmp = String(a.day.check_in || '99:99').localeCompare(String(b.day.check_in || '99:99'));
            else if (sk === 'check_out') cmp = String(a.day.check_out || '99:99').localeCompare(String(b.day.check_out || '99:99'));
            else if (sk === 'worked') cmp = (Number(a.day.worked_min) || 0) - (Number(b.day.worked_min) || 0);
            else if (sk === 'late') cmp = (Number(a.day.late_min) || 0) - (Number(b.day.late_min) || 0);
            else if (sk === 'early') cmp = (Number(a.day.early_min) || 0) - (Number(b.day.early_min) || 0);
            else if (sk === 'penalty') cmp = (Number(a.day.penalty) || 0) - (Number(b.day.penalty) || 0);
            else if (sk === 'credit') cmp = (Number(a.day.credit) || 0) - (Number(b.day.credit) || 0);
            if (cmp !== 0) return cmp * mul;
            return b.day.date.localeCompare(a.day.date) || hrmViCollator.compare(a.emp.employee_code || '', b.emp.employee_code || '');
        });

        if (countEl) countEl.textContent = `${rows.length} dòng hiển thị`;

        if (rows.length === 0) {
            tbody.innerHTML = `<tr><td colspan="15" class="p-8 text-center text-slate-400">Không có dữ liệu chấm công thỏa điều kiện lọc.</td></tr>`;
            if (tfoot) tfoot.innerHTML = '';
            return;
        }

        const missK = Math.round((Number(rCfg.missing_punch) || 50000) / 1000) + 'k';
        const absK = Math.round((Number(rCfg.absent) || 500000) / 1000) + 'k';

        let sumWorkedMin = 0;
        let sumLateMin = 0;
        let lateCount = 0;
        let sumEarlyMin = 0;
        let violCount = 0;
        let waivedCount = 0;
        let sumPenalty = 0;
        let sumCredit = 0;

        tbody.innerHTML = rows.map(({ emp, day }) => {
            const dInfo = parseVnIsoDate(day.date);
            sumWorkedMin += Number(day.worked_min) || 0;
            sumLateMin += Number(day.late_min) || 0;
            if ((Number(day.late_min) || 0) > 0) lateCount += 1;
            sumEarlyMin += Number(day.early_min) || 0;
            if ((day.violations && day.violations.length > 0) || day.penalty > 0) violCount += 1;
            if (day.waive) waivedCount += 1;
            sumPenalty += Number(day.penalty) || 0;
            sumCredit += Number(day.credit) || 0;

            let codeBadge = `<span class="px-2 py-0.5 rounded text-xs font-bold bg-slate-100 text-slate-500">-</span>`;
            if (day.code === 'X') codeBadge = `<span class="px-2 py-0.5 rounded text-xs font-bold bg-emerald-100 text-emerald-800 border border-emerald-200">X (1.0)</span>`;
            else if (day.code === 'X/2') codeBadge = `<span class="px-2 py-0.5 rounded text-xs font-bold bg-sky-100 text-sky-800 border border-sky-200">X/2 (0.5)</span>`;
            else if (day.code === 'TV') codeBadge = `<span class="px-2 py-0.5 rounded text-xs font-bold bg-amber-100 text-amber-800 border border-amber-200">TV (1.0)</span>`;
            else if (day.code === 'TV/2') codeBadge = `<span class="px-2 py-0.5 rounded text-xs font-bold bg-amber-200 text-amber-900 border border-amber-300">TV/2 (0.5)</span>`;
            else if (day.code === 'OFF') codeBadge = `<span class="px-2 py-0.5 rounded text-xs font-bold bg-slate-200 text-slate-700">OFF</span>`;
            else if (day.code === 'L') codeBadge = `<span class="px-2 py-0.5 rounded text-xs font-bold bg-sky-100 text-sky-800 border border-sky-200">L (Lễ)</span>`;
            else if (day.code === 'CN') codeBadge = `<span class="px-2 py-0.5 rounded text-xs font-medium bg-slate-50 text-slate-400">CN</span>`;

            let viols = [];
            (day.violations || []).forEach(v => {
                if (v === 'late') viols.push(`<span class="px-1.5 py-0.5 bg-rose-100 text-rose-700 rounded text-xs font-bold">Trễ ${day.late_min}p</span>`);
                else if (v === 'early') viols.push(`<span class="px-1.5 py-0.5 bg-amber-100 text-amber-700 rounded text-xs font-bold">Về sớm ${day.early_min}p</span>`);
                else if (v === 'missing_in') viols.push(`<span class="px-1.5 py-0.5 bg-rose-100 text-rose-700 rounded text-xs font-bold">Quên vào (-${missK})</span>`);
                else if (v === 'missing_out') viols.push(`<span class="px-1.5 py-0.5 bg-rose-100 text-rose-700 rounded text-xs font-bold">Quên ra (-${missK})</span>`);
                else if (v === 'absent') viols.push(`<span class="px-1.5 py-0.5 bg-red-200 text-red-900 rounded text-xs font-bold">Vắng (-${absK})</span>`);
            });

            const workedHours = day.worked_min > 0 ? (day.worked_min / 60).toFixed(1) + 'h' : '—';
            const lateText = day.late_min > 0 ? `<span class="text-rose-600 font-bold">${day.late_min}p</span>` : '<span class="text-slate-300">—</span>';
            const earlyText = day.early_min > 0 ? `<span class="text-amber-600 font-bold">${day.early_min}p</span>` : '<span class="text-slate-300">—</span>';
            const penText = day.penalty > 0 ? `<span class="text-rose-600 font-mono font-bold">-${day.penalty.toLocaleString('vi-VN')}đ</span>` : (day.waive ? '<span class="text-emerald-700 font-bold bg-emerald-50 px-1 py-0.5 rounded border border-emerald-200 text-xs">0đ (Miễn)</span>' : '<span class="text-slate-300">—</span>');

            const switchHtml = `
                <div class="flex items-center justify-center gap-1.5">
                    <label class="relative inline-flex items-center cursor-pointer">
                        <input type="checkbox" onchange="toggleHrmWaive(${emp.staff_id}, '${day.date}', ${day.waive ? 'true' : 'false'})" class="sr-only peer" ${day.waive ? 'checked' : ''}>
                        <div class="w-8 h-4 bg-slate-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-3 after:w-3 after:transition-all peer-checked:bg-emerald-600"></div>
                    </label>
                    <span class="text-xs font-bold ${day.waive ? 'text-emerald-700' : 'text-slate-400'}">${day.waive ? 'Miễn' : 'Phạt'}</span>
                </div>
            `;

            const noteHtml = day.note ? `<span class="text-slate-700 bg-slate-50 px-1.5 py-0.5 rounded border border-slate-200 text-xs block max-w-[160px] truncate" title="${escHrmHtml(day.note)}">${escHrmHtml(day.note)}</span>` : '<span class="text-slate-300">—</span>';

            return `
                <tr class="hover:bg-slate-50 ${dInfo.isSun ? 'bg-slate-50/50' : ''}">
                    <td class="p-2.5 font-mono font-bold text-slate-800 whitespace-nowrap">${dInfo.formatted} <span class="${dInfo.isSun ? 'text-rose-600' : 'text-slate-500'}">(${dInfo.dayOfWeek})</span></td>
                    <td class="p-2.5 font-mono text-sky-700 font-bold whitespace-nowrap">${emp.employee_code || 'NV' + emp.staff_id}</td>
                    <td class="p-2.5 font-bold text-slate-800 whitespace-nowrap">${emp.name}</td>
                    <td class="p-2.5 text-slate-600 whitespace-nowrap">${emp.block}</td>
                    <td class="p-2.5 text-center font-mono font-bold ${day.check_in ? 'text-slate-800' : 'text-slate-300'}">${day.check_in || '—'}</td>
                    <td class="p-2.5 text-center font-mono font-bold ${day.check_out ? 'text-slate-800' : 'text-slate-300'}">${day.check_out || '—'}</td>
                    <td class="p-2.5 text-right font-mono">${workedHours}</td>
                    <td class="p-2.5 text-right">${lateText}</td>
                    <td class="p-2.5 text-right">${earlyText}</td>
                    <td class="p-2.5"><div class="flex flex-wrap gap-1">${viols.join('') || '<span class="text-slate-400">Đúng giờ</span>'}</div></td>
                    <td class="p-2.5 text-right">${penText}</td>
                    <td class="p-2.5 text-center">${codeBadge}</td>
                    <td class="p-2.5 text-center">${switchHtml}</td>
                    <td class="p-2.5">${noteHtml}</td>
                    <td class="p-2.5 text-center whitespace-nowrap">
                        <button onclick="openHrmEditDayModal(${emp.staff_id}, '${day.date}', '${day.code}')" class="text-sky-600 hover:underline font-bold cursor-pointer text-xs">✏️ Sửa</button>
                    </td>
                </tr>
            `;
        }).join('');

        if (tfoot) {
            const totalHoursStr = sumWorkedMin > 0 ? (sumWorkedMin / 60).toFixed(1) + 'h' : '0h';
            const totalCreditClean = Number(sumCredit.toFixed(2));
            tfoot.innerHTML = `
                <tr>
                    <td colspan="6" class="p-2.5 text-right uppercase text-slate-700 whitespace-nowrap">
                        Tổng cộng (${rows.length} dòng đang lọc):
                    </td>
                    <td class="p-2.5 text-right font-mono text-slate-900 whitespace-nowrap">${totalHoursStr}</td>
                    <td class="p-2.5 text-right font-mono text-rose-700 whitespace-nowrap">${sumLateMin > 0 ? `${sumLateMin}p (${lateCount} lần)` : '0p'}</td>
                    <td class="p-2.5 text-right font-mono text-amber-700 whitespace-nowrap">${sumEarlyMin > 0 ? `${sumEarlyMin}p` : '—'}</td>
                    <td class="p-2.5 text-slate-600 whitespace-nowrap">${violCount} vi phạm${waivedCount ? ` • <span class="text-emerald-700">${waivedCount} miễn</span>` : ''}</td>
                    <td class="p-2.5 text-right font-mono font-bold text-rose-700 whitespace-nowrap">${sumPenalty > 0 ? '-' + sumPenalty.toLocaleString('vi-VN') + 'đ' : '0đ'}</td>
                    <td class="p-2.5 text-center font-mono font-bold text-emerald-800 whitespace-nowrap">${totalCreditClean} công</td>
                    <td colspan="3" class="p-2.5"></td>
                </tr>
            `;
        }
    };

    window.toggleHrmWaive = async function(staffId, workDate, currentWaive) {
        const empObj = (attendanceData?.employees || []).find(e => Number(e.staff_id) === Number(staffId));
        const dayObj = (empObj?.days || []).find(d => d.date === workDate);
        const dInfo = parseVnIsoDate(workDate);
        const staffLabel = empObj ? `${empObj.employee_code || ('NV' + empObj.staff_id)} - ${empObj.name}${empObj.block ? ' (' + empObj.block + ')' : ''}` : `NV #${staffId}`;

        const violLabels = [];
        (dayObj?.violations || []).forEach(v => {
            if (v === 'late') violLabels.push(`Trễ ${dayObj.late_min || 0}p`);
            else if (v === 'early') violLabels.push(`Về sớm ${dayObj.early_min || 0}p`);
            else if (v === 'missing_in') violLabels.push('Quên quẹt vào');
            else if (v === 'missing_out') violLabels.push('Quên quẹt ra');
            else if (v === 'absent') violLabels.push('Vắng không phép');
        });
        const penStr = dayObj?.penalty ? ` • Mức phạt: -${Number(dayObj.penalty).toLocaleString('vi-VN')}đ` : '';
        const summaryInfo = `Nhân viên: ${staffLabel}\nNgày: ${dInfo.formatted} (${dInfo.dayOfWeek})${violLabels.length ? ' • Vi phạm: ' + violLabels.join(', ') : ''}${penStr}`;

        let note = "";
        if (!currentWaive) {
            const reason = typeof window.showPromptModal === 'function'
                ? await window.showPromptModal({
                    title: 'Duyệt Miễn Phạt Chấm Công',
                    message: 'Chọn nhanh hoặc nhập lý do miễn phạt cho ca làm việc này:',
                    subMessage: summaryInfo,
                    defaultValue: dayObj?.note || 'Sếp duyệt miễn phạt',
                    placeholder: 'Ví dụ: Quên quẹt thẻ / Sự cố máy / Sếp duyệt...',
                    presets: [
                        'Sếp duyệt miễn phạt',
                        'Quên quẹt thẻ',
                        'Sự cố máy chấm công',
                        'Đi công tác / Làm ngoài',
                        'Có xin phép trước'
                    ],
                    confirmText: 'Duyệt Miễn Phạt',
                    cancelText: 'Hủy bỏ',
                    type: 'success'
                })
                : prompt("Nhập lý do miễn phạt:", "Sếp duyệt miễn phạt");

            if (reason === null) {
                renderAttendanceDetailTable();
                return;
            }
            note = reason.trim() || "Sếp duyệt miễn phạt";
        } else if (typeof window.showConfirmModal === 'function') {
            const okUnwaive = await window.showConfirmModal({
                title: 'Hủy Miễn Phạt Chấm Công?',
                message: 'Ca làm việc này sẽ áp dụng lại tiền phạt vi phạm theo quy định.',
                subMessage: summaryInfo + (dayObj?.note ? `\nLý do miễn trước đó: ${dayObj.note}` : ''),
                confirmText: 'Hủy miễn phạt',
                cancelText: 'Giữ nguyên',
                type: 'warning'
            });
            if (!okUnwaive) {
                renderAttendanceDetailTable();
                return;
            }
        }
        try {
            const res = await fetch('/api/hrm/attendance/toggle-waive', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    staff_id: staffId,
                    work_date: workDate,
                    waive: !currentWaive,
                    note: note
                })
            });
            const data = await res.json();
            if (!res.ok) {
                if (window.showToast) window.showToast(data.detail || "Lỗi cập nhật miễn phạt", "error");
                renderAttendanceDetailTable();
                return;
            }
            if (window.showToast) window.showToast(!currentWaive ? "Đã duyệt miễn phạt thành công" : "Đã hủy miễn phạt", "success");
            await loadHrmAttendance(getSelectedMonth());
            if (hrmAttCurrentView === 'detail') {
                renderAttendanceDetailTable();
            }
        } catch (err) {
            console.error(err);
            renderAttendanceDetailTable();
        }
    };

    function renderAttendanceMatrix(data) {
        const thead = document.getElementById('table-hrm-att-head');
        const tbody = document.getElementById('table-hrm-att-body');
        const numDays = data.days_in_month;
        const ym = String(data.month || getSelectedMonth());
        const [yNum, mNum] = ym.split('-').map(x => parseInt(x, 10));

        const dayMeta = [];
        for (let d = 1; d <= numDays; d++) {
            const iso = `${yNum}-${String(mNum).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
            const info = parseVnIsoDate(iso);
            dayMeta.push({ d, dd: String(d).padStart(2, '0'), iso, dow: info.dayOfWeek, isSun: info.isSun, formatted: info.formatted });
        }

        let tr1 = `<tr>
            <th rowspan="2" class="p-2 sticky left-0 z-30 bg-slate-50 font-mono whitespace-nowrap w-[66px] min-w-[66px] border-b border-slate-200">Mã NV</th>
            <th rowspan="2" class="p-2 sticky left-[66px] z-30 bg-slate-50 border-r-2 border-slate-300 border-b border-slate-200 whitespace-nowrap min-w-[175px] shadow-[3px_0_5px_-2px_rgba(15,23,42,0.08)]">Họ và Tên</th>`;
        let tr2 = `<tr>`;
        dayMeta.forEach(dm => {
            const sunHdrCls = dm.isSun ? 'bg-rose-100 text-rose-800 font-bold' : 'bg-slate-50 text-slate-700';
            const sunSubCls = dm.isSun ? 'bg-rose-100 text-rose-700 font-bold' : 'bg-slate-50 text-slate-500';
            tr1 += `<th class="px-1 py-1 text-center w-8 min-w-[30px] text-xs font-mono ${sunHdrCls}">${dm.dd}</th>`;
            tr2 += `<th class="px-1 pb-1.5 text-center w-8 min-w-[30px] text-[10px] border-b border-slate-200 ${sunSubCls}">${dm.dow}</th>`;
        });
        tr1 += `<th rowspan="2" class="p-2 text-center border-l border-b border-slate-200 bg-slate-50 whitespace-nowrap">Tổng công</th>
                <th rowspan="2" class="p-2 text-right border-b border-slate-200 bg-slate-50 whitespace-nowrap">Phạt</th></tr>`;
        tr2 += `</tr>`;
        thead.innerHTML = tr1 + tr2;

        if (!data.employees || data.employees.length === 0) {
            tbody.innerHTML = `<tr><td colspan="${numDays + 4}" class="p-6 text-center text-slate-400">Không có nhân sự nào được cấu hình chấm công.</td></tr>`;
            return;
        }

        tbody.innerHTML = data.employees.map(e => {
            const codeTxt = escHrmHtml(e.employee_code || '—');
            const nameTxt = escHrmHtml(e.name || '');
            const blkTxt = escHrmHtml(e.block || '');
            let row = `<tr class="group hover:bg-slate-50">
                <td class="p-2 font-mono font-bold text-sky-700 sticky left-0 z-10 bg-white group-hover:bg-slate-50 whitespace-nowrap w-[66px] min-w-[66px]">${codeTxt}</td>
                <td class="p-2 font-bold text-slate-800 sticky left-[66px] z-10 bg-white group-hover:bg-slate-50 border-r-2 border-slate-200 whitespace-nowrap min-w-[175px] shadow-[3px_0_5px_-2px_rgba(15,23,42,0.06)]">${nameTxt} <span class="text-xs text-slate-400 font-normal">(${blkTxt})</span></td>`;
            const dayMap = {};
            (e.days || []).forEach(d => {
                const dayNum = parseInt(d.date.split('-')[2], 10);
                dayMap[dayNum] = d;
            });
            dayMeta.forEach(dm => {
                const dayRes = dayMap[dm.d];
                if (!dayRes) {
                    const emptyCls = dm.isSun ? 'bg-rose-50/80 text-rose-400 font-semibold' : 'text-slate-300';
                    row += `<td class="p-1 text-center cursor-default select-none ${emptyCls}">${dm.isSun ? 'CN' : '-'}</td>`;
                } else {
                    const codeVal = dayRes.code || (dm.isSun ? 'CN' : '-');
                    let cls = dm.isSun ? "bg-rose-50/90 text-rose-700 font-semibold" : "text-slate-600";
                    if (dayRes.code === 'X') cls = dm.isSun ? "font-bold text-emerald-700 bg-rose-50" : "font-bold text-emerald-600 bg-emerald-50/50";
                    else if (dayRes.code === 'X/2') cls = dm.isSun ? "font-bold text-sky-700 bg-rose-50" : "font-bold text-sky-600 bg-sky-50/50";
                    else if (dayRes.code === 'TV') cls = dm.isSun ? "font-bold text-amber-700 bg-rose-50" : "font-bold text-amber-600 bg-amber-50/50";
                    else if (dayRes.code === 'TV/2') cls = "font-bold text-amber-900 bg-amber-100/80 border border-amber-300";
                    else if (dayRes.code === 'OFF') cls = "text-slate-500 bg-slate-100 font-semibold";
                    else if (dayRes.code === 'CN') cls = "bg-rose-50/90 text-rose-700 font-bold";
                    else if (dayRes.code === 'L') cls = "font-bold text-sky-700 bg-sky-50";

                    if (dayRes.penalty > 0) cls += " border-b-2 border-rose-500";
                    const tipParts = [`${dm.formatted} (${dm.dow})`];
                    if (dayRes.punches && dayRes.punches.length) tipParts.push(`Quẹt: ${dayRes.punches.join(' - ')}`);
                    if (dayRes.late_min > 0) tipParts.push(`Trễ ${dayRes.late_min}p`);
                    if (dayRes.penalty > 0) tipParts.push(`Phạt -${Number(dayRes.penalty).toLocaleString('vi-VN')}đ`);
                    else if (dayRes.waive) tipParts.push('Đã miễn phạt');
                    if (dayRes.note) tipParts.push(dayRes.note);
                    row += `<td class="p-1 text-center text-xs cursor-default select-none ${cls}" title="${escHrmHtml(tipParts.join(' · '))}">${escHrmHtml(codeVal)}</td>`;
                }
            });
            row += `<td class="p-2 text-center font-bold text-emerald-700 border-l border-slate-200">${e.credit || 0}</td>
                    <td class="p-2 text-right font-mono ${e.penalty > 0 ? 'text-rose-600 font-bold' : 'text-slate-400'}">${(e.penalty || 0).toLocaleString('vi-VN')}</td></tr>`;
            return row;
        }).join('');
    }

    window.uploadAttendanceExcel = async function(input) {
        if (!input.files || input.files.length === 0) return;
        const formData = new FormData();
        formData.append('file', input.files[0]);
        input.value = '';
        try {
            const res = await fetch('/api/hrm/attendance/import', { method: 'POST', body: formData });
            const data = await res.json();
            if (!res.ok) {
                window.showToast ? window.showToast(data.detail || 'Lỗi import file', 'error') : alert(data.detail);
                return;
            }
            let msg = `Đã import ${data.imported} ngày chấm công.`;
            if (data.skipped_locked) msg += ` Bỏ qua ${data.skipped_locked} ngày thuộc tháng đã chốt.`;
            if (data.skipped_manual) msg += ` Giữ nguyên ${data.skipped_manual} ngày đã sửa tay.`;
            if (data.matched_by_name && data.matched_by_name.length > 0) {
                msg += ` Khớp theo tên (chưa nhập mã máy): ${data.matched_by_name.map(u => `${u.device_code}-${u.name}`).join(', ')}.`;
            }
            if (data.unknown_codes && data.unknown_codes.length > 0) {
                msg += ` KHÔNG khớp NV nào: ${data.unknown_codes.map(u => `${u.device_code}-${u.name}`).join(', ')}.`;
            }
            if (window.showToast) window.showToast(msg, data.unknown_codes?.length ? 'warning' : 'success'); else alert(msg);
            loadHrmAttendance(getSelectedMonth());
        } catch (e) {
            console.error(e);
        }
    };

    // ── Xin Off ──
    async function loadHrmLeaves(month) {
        const p = getHrmQueryPeriodParams();
        const qs = (month && hrmPeriodMode !== 'range') ? `month=${encodeURIComponent(month)}` : p.qs;
        try {
            const [res, resEmp] = await Promise.all([
                fetch(`/api/hrm/leaves?${qs}`),
                fetch('/api/hrm/employees')
            ]);
            if (!res.ok) throw new Error("Lỗi tải danh sách xin off");
            leavesData = await res.json();
            const empRows = resEmp.ok ? await resEmp.json() : [];

            // Populate staff filter
            const filterEl = document.getElementById('hrm-leaves-staff-filter');
            if (filterEl) {
                const currentFilter = filterEl.value;
                const staffMap = new Map();
                empRows.forEach(s => {
                    if (s.is_active !== 0 && s.contractual_status !== 'Nghỉ việc') {
                        staffMap.set(String(s.id), formatHrmEmpLabel(s));
                    }
                });
                leavesData.forEach(l => {
                    if (l.staff_id && !staffMap.has(String(l.staff_id))) {
                        staffMap.set(String(l.staff_id), l.staff_name);
                    }
                });
                filterEl.innerHTML = '<option value="">-- Tất cả nhân viên --</option>' +
                    Array.from(staffMap.entries()).map(([sid, lbl]) => `<option value="${sid}">${escHrmHtml(lbl)}</option>`).join('');
                filterEl.value = staffMap.has(String(currentFilter)) ? currentFilter : '';
            }
            renderHrmLeavesTable();
        } catch (e) {
            console.error("Lỗi loadHrmLeaves:", e);
        }
    }
    window.loadHrmLeaves = loadHrmLeaves;

    window.renderHrmLeavesTable = function() {
        const tbody = document.getElementById('table-hrm-leaves');
        const tfoot = document.getElementById('table-hrm-leaves-foot');
        if (!tbody) return;
        const filterSid = document.getElementById('hrm-leaves-staff-filter')?.value;
        const list = filterSid ? leavesData.filter(l => String(l.staff_id) === filterSid) : leavesData;

        if (!list || list.length === 0) {
            tbody.innerHTML = `<tr><td colspan="8" class="p-6 text-center text-slate-400">Chưa có đơn xin nghỉ nào trong kỳ đang xem.</td></tr>`;
            if (tfoot) tfoot.innerHTML = '';
            return;
        }

        const leaveDaysOf = l => (l.leave_type === 'off_morning' || l.leave_type === 'off_afternoon') ? 0.5 : 1.0;
        const renderRow = l => {
            let badge = '<span class="px-2 py-0.5 rounded-full text-xs font-semibold bg-sky-100 text-sky-800 whitespace-nowrap">Off cả ngày (1.0)</span>';
            if (l.leave_type === 'off_morning') {
                badge = '<span class="px-2 py-0.5 rounded-full text-xs font-semibold bg-sky-100 text-sky-800 whitespace-nowrap">Off Buổi Sáng (0.5)</span>';
            } else if (l.leave_type === 'off_afternoon') {
                badge = '<span class="px-2 py-0.5 rounded-full text-xs font-semibold bg-amber-100 text-amber-800 whitespace-nowrap">Off Buổi Chiều (0.5)</span>';
            }
            const code = escHrmHtml(l.employee_code || l.staff_code || '—');
            const meta = escHrmHtml([l.block_name, l.department, l.position].filter(Boolean).join(' · ') || '-');
            return `
                <tr class="hover:bg-slate-50 transition-colors">
                    <td class="p-2.5 font-mono font-bold text-slate-700 whitespace-nowrap">${fmtVnDate(l.work_date, true)}</td>
                    <td class="p-2.5 font-mono font-bold text-sky-700 whitespace-nowrap">${code}</td>
                    <td class="p-2.5 font-bold text-slate-800 whitespace-nowrap">${escHrmHtml(l.staff_name || '')}</td>
                    <td class="p-2.5 text-slate-600">${meta}</td>
                    <td class="p-2.5 text-center">${badge}</td>
                    <td class="p-2.5 text-slate-600 max-w-xs truncate" title="${escHrmHtml(l.reason || '')}">${escHrmHtml(l.reason || '-')}</td>
                    <td class="p-2.5 text-slate-500">${escHrmHtml(l.approved_by || '-')}</td>
                    <td class="p-2.5 text-center whitespace-nowrap">
                        <button onclick="openHrmLeaveModal(${l.id})" class="text-sky-700 hover:text-sky-900 font-bold px-1.5 py-0.5 rounded hover:bg-sky-50 cursor-pointer">Sửa</button>
                        <button onclick="deleteHrmLeave(${l.id})" class="text-rose-600 hover:text-rose-800 font-bold px-1.5 py-0.5 rounded hover:bg-rose-50 cursor-pointer ml-1">Xóa</button>
                    </td>
                </tr>
            `;
        };

        const groups = groupRowsByStaff(list);
        if (hrmSubTableGroupMode === 'grouped') {
            tbody.innerHTML = groups.map(g => {
                const sumDays = g.rows.reduce((s, r) => s + leaveDaysOf(r), 0);
                const fullCnt = g.rows.filter(r => leaveDaysOf(r) === 1).length;
                const halfCnt = g.rows.length - fullCnt;
                const codePrefix = g.employee_code ? `[${escHrmHtml(g.employee_code)}] ` : '';
                return `
                    <tr class="bg-sky-50/90 border-y border-sky-200 font-bold text-sky-950">
                        <td colspan="4" class="p-2">${codePrefix}${escHrmHtml(g.staff_name)} <span class="text-slate-500 font-semibold">· ${escHrmHtml(g.meta)}</span></td>
                        <td class="p-2 text-center font-mono text-sky-800">Tổng: ${sumDays} ngày nghỉ (${g.rows.length} đơn)</td>
                        <td colspan="3" class="p-2 text-right text-xs text-slate-600">Cả ngày: ${fullCnt} · Nửa ngày: ${halfCnt}</td>
                    </tr>
                    ${g.rows.map(renderRow).join('')}
                `;
            }).join('');
        } else {
            tbody.innerHTML = list.map(renderRow).join('');
        }

        const totalDaysAll = list.reduce((s, r) => s + leaveDaysOf(r), 0);
        if (tfoot) {
            tfoot.innerHTML = `
                <tr>
                    <td colspan="4" class="p-2.5 uppercase text-slate-700">Tổng cộng kỳ đang xem (${groups.length} nhân viên · ${list.length} đơn):</td>
                    <td class="p-2.5 text-center font-mono text-sky-800">${totalDaysAll} ngày nghỉ</td>
                    <td colspan="3"></td>
                </tr>
            `;
        }
    };

    // ── Shared Searchable HRM Employee Picker (4 Modals: Leave, OT, Advance, Adjustment) ──
    const hrmStaffPickerState = {};
    const hrmViCollator = new Intl.Collator('vi', { numeric: true, sensitivity: 'base' });
    const escHrmHtml = s => String(s ?? '').replace(/[&<>"']/g, m => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[m]));
    const normHrmSearch = s => String(s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/đ/g, 'd').replace(/Đ/g, 'D').toLowerCase().trim();

    function matchHrmQuery(q, text) {
        if (!q || !q.trim()) return true;
        if (typeof fuzzyMatch === 'function') return fuzzyMatch(q, text);
        const words = normHrmSearch(q).split(/\s+/).filter(Boolean);
        const target = normHrmSearch(text);
        return words.every(w => target.includes(w));
    }

    function formatHrmEmpLabel(s) {
        if (!s) return '';
        const code = (s.employee_code || '').trim();
        return code ? `${code} - ${s.name}` : s.name;
    }

    async function initHrmStaffPicker(selectId, preselectId = '') {
        const selectEl = document.getElementById(selectId);
        const searchInp = document.getElementById(`${selectId}-search`);
        const clearBtn = document.getElementById(`${selectId}-clear`);
        const menuEl = document.getElementById(`${selectId}-menu`);

        let raw = [];
        try {
            const res = await fetch('/api/hrm/employees');
            if (res.ok) {
                raw = await res.json();
                hrmStaffList = raw;
            }
        } catch (e) {
            console.error('Lỗi tải danh sách nhân sự HRM:', e);
        }
        if (!raw.length && Array.isArray(hrmStaffList) && hrmStaffList.length) {
            raw = hrmStaffList;
        }

        const preStr = preselectId != null && preselectId !== '' ? String(preselectId) : '';
        const todayIso = new Date().toISOString().slice(0, 10);
        const activeRows = raw.filter(s =>
            (s.is_active !== 0 && s.contractual_status !== 'Nghỉ việc' && !(s.leave_date && String(s.leave_date).slice(0, 10) <= todayIso)) ||
            String(s.id) === preStr
        );
        // ponytail: khớp 1-1 điều kiện payroll_service.payroll_staff để loại tài khoản kho/hệ thống rỗng; fallback activeRows nếu DB mới tinh chưa gán mã/lương
        const strictRows = activeRows.filter(s =>
            Number(s.base_salary || 0) > 0 ||
            Number(s.is_spa_worker || 0) === 1 ||
            Boolean((s.employee_code || '').trim()) ||
            String(s.id) === preStr
        );
        const list = (strictRows.length ? strictRows : activeRows).slice().sort((a, b) => {
            const ca = (a.employee_code || '').trim();
            const cb = (b.employee_code || '').trim();
            if (ca && !cb) return -1;
            if (!ca && cb) return 1;
            if (ca && cb && ca !== cb) return hrmViCollator.compare(ca, cb);
            return hrmViCollator.compare(a.name || '', b.name || '');
        });

        hrmStaffPickerState[selectId] = list;

        if (selectEl) {
            selectEl.innerHTML = '<option value="">-- Chọn nhân viên --</option>' +
                list.map(s => `<option value="${s.id}">${escHrmHtml(formatHrmEmpLabel(s))}</option>`).join('');
            selectEl.value = preStr && list.some(s => String(s.id) === preStr) ? preStr : '';
        }

        const chosen = preStr ? list.find(s => String(s.id) === preStr) : null;
        if (searchInp) searchInp.value = chosen ? formatHrmEmpLabel(chosen) : '';
        if (clearBtn) clearBtn.classList.toggle('hidden', !chosen);
        if (menuEl) menuEl.classList.add('hidden');
    }

    function renderHrmStaffPickerMenu(selectId, query = '') {
        const selectEl = document.getElementById(selectId);
        const menuEl = document.getElementById(`${selectId}-menu`);
        if (!menuEl) return;

        const list = hrmStaffPickerState[selectId] || [];
        const curVal = selectEl ? String(selectEl.value || '') : '';
        const q = (query || '').trim();
        const matches = q
            ? list.filter(s => matchHrmQuery(q, `${s.employee_code || ''} ${s.name || ''} ${s.block_name || ''} ${s.department || ''} ${s.position || ''} ${s.phone || ''}`))
            : list;

        if (!matches.length) {
            menuEl.innerHTML = '<div class="p-3 text-center text-slate-400">Không tìm thấy nhân viên phù hợp</div>';
            menuEl.classList.remove('hidden');
            return;
        }

        const wrapEl = selectEl ? selectEl.closest('[data-hrm-staff-picker]') : null;
        const allowAll = wrapEl && wrapEl.getAttribute('data-allow-all') === '1';
        const allRowHtml = (allowAll && !q)
            ? `<div onmousedown="event.preventDefault(); selectHrmStaffOption('${selectId}', '')"
                    ${!curVal ? 'style="background-color:#f0f9ff;box-shadow:inset 0 0 0 1px #0284c7;"' : ''}
                    class="p-2 hover:bg-sky-50/70 cursor-pointer flex items-center justify-between gap-2 transition">
                    <span class="font-bold ${!curVal ? 'text-sky-800' : 'text-slate-700'}">Tất cả nhân viên</span>
                    <span class="text-xs text-slate-400">${list.length} NV</span>
               </div>`
            : '';

        menuEl.innerHTML = allRowHtml + matches.map(s => {
            const isSelected = String(s.id) === curVal;
            const code = (s.employee_code || '').trim();
            const codeBadge = code
                ? `<span class="px-1.5 py-0.5 rounded font-mono font-bold text-[11px] bg-sky-50 text-sky-700 border border-sky-200 shrink-0">${escHrmHtml(code)}</span>`
                : `<span class="px-1.5 py-0.5 rounded font-mono font-semibold text-[11px] bg-slate-100 text-slate-500 shrink-0">#${s.id}</span>`;
            const meta = escHrmHtml(s.block_name || s.department || s.position || '');
            const activeStyle = isSelected ? 'style="background-color:#f0f9ff;box-shadow:inset 0 0 0 1px #0284c7;"' : '';
            return `
                <div onmousedown="event.preventDefault(); selectHrmStaffOption('${selectId}', ${s.id})"
                     ${activeStyle}
                     class="p-2 hover:bg-sky-50/70 cursor-pointer flex items-center justify-between gap-2 transition">
                    <div class="flex items-center gap-1.5 min-w-0">
                        ${codeBadge}
                        <span class="font-bold ${isSelected ? 'text-sky-800' : 'text-slate-800'} truncate">${escHrmHtml(s.name)}</span>
                    </div>
                    ${meta ? `<span class="text-[11px] text-slate-500 shrink-0 truncate max-w-[110px]">${meta}</span>` : ''}
                </div>
            `;
        }).join('');
        menuEl.classList.remove('hidden');
    }

    window.openHrmStaffDropdown = function(selectId) {
        document.querySelectorAll('[data-hrm-staff-picker]').forEach(wrap => {
            const sid = wrap.getAttribute('data-hrm-staff-picker');
            if (sid && sid !== selectId) document.getElementById(`${sid}-menu`)?.classList.add('hidden');
        });
        const selectEl = document.getElementById(selectId);
        const searchInp = document.getElementById(`${selectId}-search`);
        const list = hrmStaffPickerState[selectId] || [];
        const chosen = selectEl?.value ? list.find(s => String(s.id) === String(selectEl.value)) : null;
        const rawVal = searchInp ? searchInp.value : '';
        const q = (chosen && rawVal === formatHrmEmpLabel(chosen)) ? '' : rawVal;
        renderHrmStaffPickerMenu(selectId, q);
    };

    window.filterHrmStaffDropdown = function(selectId, val) {
        const selectEl = document.getElementById(selectId);
        const clearBtn = document.getElementById(`${selectId}-clear`);
        const list = hrmStaffPickerState[selectId] || [];
        if (selectEl && selectEl.value) {
            const chosen = list.find(s => String(s.id) === String(selectEl.value));
            if (!chosen || val !== formatHrmEmpLabel(chosen)) {
                selectEl.value = '';
                if (!val) selectEl.dispatchEvent(new Event('change'));
            }
        }
        if (clearBtn) clearBtn.classList.toggle('hidden', !val);
        renderHrmStaffPickerMenu(selectId, val);
    };

    window.selectHrmStaffOption = function(selectId, staffId) {
        const selectEl = document.getElementById(selectId);
        const searchInp = document.getElementById(`${selectId}-search`);
        const clearBtn = document.getElementById(`${selectId}-clear`);
        const menuEl = document.getElementById(`${selectId}-menu`);
        const list = hrmStaffPickerState[selectId] || [];
        const chosen = list.find(s => String(s.id) === String(staffId));
        if (searchInp) searchInp.value = chosen ? formatHrmEmpLabel(chosen) : '';
        if (clearBtn) clearBtn.classList.toggle('hidden', !chosen);
        if (menuEl) menuEl.classList.add('hidden');
        if (selectEl) {
            selectEl.value = chosen ? String(chosen.id) : '';
            selectEl.dispatchEvent(new Event('change'));
        }
    };

    window.clearHrmStaffSelection = function(selectId, ev) {
        if (ev) ev.stopPropagation();
        const selectEl = document.getElementById(selectId);
        const searchInp = document.getElementById(`${selectId}-search`);
        const clearBtn = document.getElementById(`${selectId}-clear`);
        if (searchInp) {
            searchInp.value = '';
            searchInp.focus();
        }
        if (clearBtn) clearBtn.classList.add('hidden');
        if (selectEl) {
            selectEl.value = '';
            selectEl.dispatchEvent(new Event('change'));
        }
        renderHrmStaffPickerMenu(selectId, '');
    };

    document.addEventListener('pointerdown', (e) => {
        document.querySelectorAll('[data-hrm-staff-picker]').forEach(wrap => {
            if (wrap.contains(e.target)) return;
            const sid = wrap.getAttribute('data-hrm-staff-picker');
            const menuEl = document.getElementById(`${sid}-menu`);
            if (!menuEl || menuEl.classList.contains('hidden')) return;
            menuEl.classList.add('hidden');
            const selectEl = document.getElementById(sid);
            const searchInp = document.getElementById(`${sid}-search`);
            const clearBtn = document.getElementById(`${sid}-clear`);
            const list = hrmStaffPickerState[sid] || [];
            const chosen = selectEl?.value ? list.find(s => String(s.id) === String(selectEl.value)) : null;
            if (searchInp) searchInp.value = chosen ? formatHrmEmpLabel(chosen) : '';
            if (clearBtn) clearBtn.classList.toggle('hidden', !chosen);
        });
    });

    window.openHrmLeaveModal = async function(id) {
        const dateInput = document.getElementById('hrm-leave-date');
        const typeSelect = document.getElementById('hrm-leave-type');
        const reasonInput = document.getElementById('hrm-leave-reason');
        const approverInput = document.getElementById('hrm-leave-approved-by');
        const idInput = document.getElementById('hrm-leave-id');
        const titleEl = document.getElementById('modal-hrm-leave-title');
        const existingItem = id ? leavesData.find(x => x.id === id) : null;

        await initHrmStaffPicker('hrm-leave-staff-id', existingItem ? existingItem.staff_id : '');

        if (existingItem) {
            if (idInput) idInput.value = existingItem.id;
            if (dateInput) dateInput.value = existingItem.work_date;
            if (typeSelect) typeSelect.value = existingItem.leave_type;
            if (reasonInput) reasonInput.value = existingItem.reason || '';
            if (approverInput) approverInput.value = existingItem.approved_by || '';
            if (titleEl) titleEl.textContent = 'Cập Nhật Đơn Xin Off';
        } else {
            if (idInput) idInput.value = '';
            if (dateInput) dateInput.value = new Date().toISOString().slice(0, 10);
            if (typeSelect) typeSelect.value = 'off';
            if (reasonInput) reasonInput.value = '';
            if (approverInput) approverInput.value = '';
            if (titleEl) titleEl.textContent = 'Tạo Đơn Xin Off';
        }

        const modal = document.getElementById('modal-hrm-leave');
        if (modal) modal.classList.remove('hidden');
    };

    window.closeHrmLeaveModal = function() {
        const modal = document.getElementById('modal-hrm-leave');
        if (modal) modal.classList.add('hidden');
    };

    window.submitHrmLeave = async function() {
        const id = document.getElementById('hrm-leave-id')?.value;
        const staffId = document.getElementById('hrm-leave-staff-id')?.value;
        const workDate = document.getElementById('hrm-leave-date')?.value;
        const leaveType = document.getElementById('hrm-leave-type')?.value;
        const reason = document.getElementById('hrm-leave-reason')?.value.trim();
        const approvedBy = document.getElementById('hrm-leave-approved-by')?.value.trim();

        if (!staffId) { alert("Vui lòng chọn nhân viên"); return; }
        if (!workDate) { alert("Vui lòng chọn ngày nghỉ"); return; }
        if (!leaveType) { alert("Vui lòng chọn hình thức nghỉ"); return; }

        try {
            const res = await fetch('/api/hrm/leaves', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    id: id ? parseInt(id) : null,
                    staff_id: parseInt(staffId),
                    work_date: workDate,
                    leave_type: leaveType,
                    reason: reason,
                    approved_by: approvedBy || null
                })
            });
            const data = await res.json();
            if (!res.ok) {
                alert(data.detail || "Lỗi tạo đơn xin off");
                return;
            }
            closeHrmLeaveModal();
            loadHrmLeaves();
            if (window.showToast) window.showToast("Đã lưu đơn xin off thành công", "success");
        } catch (e) {
            console.error("Lỗi submitHrmLeave:", e);
            alert("Lỗi kết nối máy chủ");
        }
    };

    window.deleteHrmLeave = async function(id) {
        const ok = typeof window.showConfirmModal === 'function'
            ? await window.showConfirmModal({ title: 'Xóa đơn xin nghỉ?', message: 'Xác nhận xóa đơn xin nghỉ này và khôi phục lại trạng thái chấm công?', confirmText: 'Xóa đơn', type: 'danger' })
            : confirm("Xác nhận xóa đơn xin nghỉ này và khôi phục chấm công?");
        if (!ok) return;
        try {
            const res = await fetch(`/api/hrm/leaves/${id}`, { method: 'DELETE' });
            if (!res.ok) {
                const data = await res.json();
                if (window.showToast) window.showToast(data.detail || "Lỗi xóa đơn xin off", "error");
                return;
            }
            loadHrmLeaves();
            if (window.showToast) window.showToast("Đã xóa đơn xin off thành công", "success");
        } catch (e) {
            console.error("Lỗi deleteHrmLeave:", e);
            if (window.showToast) window.showToast("Lỗi kết nối máy chủ", "error");
        }
    };

    window.syncHrmLeavesFromSheets = async function() {
        const ok = typeof window.showConfirmModal === 'function'
            ? await window.showConfirmModal({ title: 'Đồng bộ Xin Off từ Google Sheets', message: 'Bắt đầu đồng bộ danh sách Xin Off từ Google Sheets (GID: 1879481422)?', confirmText: 'Đồng bộ ngay', type: 'primary' })
            : confirm("Bắt đầu đồng bộ danh sách Xin Off từ Google Sheets (GID: 1879481422)?");
        if (!ok) return;
        try {
            const res = await fetch('/api/hrm/leaves/sync-sheets', { method: 'POST' });
            const data = await res.json();
            if (!res.ok) {
                if (window.showToast) window.showToast(data.detail || "Lỗi đồng bộ từ Google Sheets", "error");
                return;
            }
            if (window.showToast) window.showToast(data.message || `Đồng bộ thành công ${data.synced_count} bản ghi`, "success");
            loadHrmLeaves();
        } catch (e) {
            console.error("Lỗi syncHrmLeavesFromSheets:", e);
            if (window.showToast) window.showToast("Lỗi kết nối khi đồng bộ Google Sheets", "error");
        }
    };

    // ── Tăng Ca (Overtime) ──
    function renderHrmOvertimeTable() {
        const tbody = document.getElementById('table-hrm-overtime');
        const tfoot = document.getElementById('table-hrm-overtime-foot');
        if (!tbody) return;
        const list = overtimeData || [];
        if (!list.length) {
            tbody.innerHTML = `<tr><td colspan="8" class="p-6 text-center text-slate-400">Chưa có bản ghi tăng ca nào trong kỳ đang xem.</td></tr>`;
            if (tfoot) tfoot.innerHTML = '';
            return;
        }
        const renderRow = r => {
            const sName = escHrmHtml(r.staff_name || r.name || '');
            const sCode = r.employee_code ? `<span class="font-mono font-bold text-sky-700">(${escHrmHtml(r.employee_code)})</span>` : '';
            const meta = escHrmHtml([r.block_name, r.department, r.position].filter(Boolean).join(' · ') || '—');
            const estPay = Number(r.est_ot_pay || 0);
            return `
                <tr class="hover:bg-slate-50">
                    <td class="p-2.5 font-mono font-bold text-slate-700 whitespace-nowrap">${fmtVnDate(r.work_date, true)}</td>
                    <td class="p-2.5 whitespace-nowrap"><span class="font-bold text-slate-800">${sName}</span> ${sCode}</td>
                    <td class="p-2.5 text-slate-600">${meta}</td>
                    <td class="p-2.5 text-center font-bold text-sky-700 font-mono">${Number(r.hours || 0)}h</td>
                    <td class="p-2.5 text-right font-mono font-bold text-emerald-700">${estPay > 0 ? '+' + estPay.toLocaleString('vi-VN') + ' đ' : '—'}</td>
                    <td class="p-2.5 text-slate-600">${escHrmHtml(r.note || '-')}</td>
                    <td class="p-2.5 text-slate-500">${escHrmHtml(r.approved_by || '-')}</td>
                    <td class="p-2.5 text-center">
                        <button onclick="deleteHrmOvertime(${r.id})" class="text-rose-600 hover:text-rose-800 font-bold p-1 cursor-pointer" title="Xóa">✕</button>
                    </td>
                </tr>
            `;
        };
        const groups = groupRowsByStaff(list);
        if (hrmSubTableGroupMode === 'grouped') {
            tbody.innerHTML = groups.map(g => {
                const sumH = Number(g.rows.reduce((s, r) => s + Number(r.hours || 0), 0).toFixed(2));
                const sumPay = g.rows.reduce((s, r) => s + Number(r.est_ot_pay || 0), 0);
                const codePrefix = g.employee_code ? `[${escHrmHtml(g.employee_code)}] ` : '';
                return `
                    <tr class="bg-sky-50/90 border-y border-sky-200 font-bold text-sky-950">
                        <td colspan="3" class="p-2">${codePrefix}${escHrmHtml(g.staff_name)} <span class="text-slate-500 font-semibold">· ${escHrmHtml(g.meta)}</span></td>
                        <td class="p-2 text-center font-mono text-sky-800">${sumH}h (${g.rows.length} buổi)</td>
                        <td class="p-2 text-right font-mono text-emerald-700">+${sumPay.toLocaleString('vi-VN')} đ</td>
                        <td colspan="3" class="p-2 text-right text-xs text-slate-500">Hệ số 150% lương giờ chuẩn</td>
                    </tr>
                    ${g.rows.map(renderRow).join('')}
                `;
            }).join('');
        } else {
            tbody.innerHTML = list.map(renderRow).join('');
        }
        const totH = Number(list.reduce((s, r) => s + Number(r.hours || 0), 0).toFixed(2));
        const totPay = list.reduce((s, r) => s + Number(r.est_ot_pay || 0), 0);
        if (tfoot) {
            tfoot.innerHTML = `
                <tr>
                    <td colspan="3" class="p-2.5 uppercase text-slate-700">Tổng cộng kỳ đang xem (${groups.length} nhân viên · ${list.length} buổi):</td>
                    <td class="p-2.5 text-center font-mono text-sky-800">${totH}h</td>
                    <td class="p-2.5 text-right font-mono text-emerald-800">+${totPay.toLocaleString('vi-VN')} đ</td>
                    <td colspan="3"></td>
                </tr>
            `;
        }
    }
    window.renderHrmOvertimeTable = renderHrmOvertimeTable;

    async function loadHrmOvertime(month) {
        const p = getHrmQueryPeriodParams();
        const qs = (month && hrmPeriodMode !== 'range') ? `month=${encodeURIComponent(month)}` : p.qs;
        try {
            const res = await fetch(`/api/hrm/overtime?${qs}`);
            if (!res.ok) return;
            overtimeData = await res.json();
            renderHrmOvertimeTable();
        } catch (e) {
            console.error("Lỗi tải tăng ca:", e);
        }
    }
    window.loadHrmOvertime = loadHrmOvertime;

    window.openHrmOvertimeModal = async function() {
        const dateInput = document.getElementById('hrm-ot-date');
        const hoursInput = document.getElementById('hrm-ot-hours');
        const noteInput = document.getElementById('hrm-ot-note');
        if (dateInput) dateInput.value = new Date().toISOString().slice(0, 10);
        if (hoursInput) hoursInput.value = '';
        if (noteInput) noteInput.value = '';

        await initHrmStaffPicker('hrm-ot-staff-id', '');

        const modal = document.getElementById('modal-hrm-overtime');
        if (modal) modal.classList.remove('hidden');
    };

    window.closeHrmOvertimeModal = function() {
        const modal = document.getElementById('modal-hrm-overtime');
        if (modal) modal.classList.add('hidden');
    };

    window.submitHrmOvertime = async function() {
        const staffId = document.getElementById('hrm-ot-staff-id')?.value;
        const workDate = document.getElementById('hrm-ot-date')?.value;
        const hours = parseFloat(document.getElementById('hrm-ot-hours')?.value);
        const note = document.getElementById('hrm-ot-note')?.value.trim();

        if (!staffId) { alert("Vui lòng chọn nhân viên"); return; }
        if (!workDate) { alert("Vui lòng chọn ngày tăng ca"); return; }
        if (!hours || hours <= 0) { alert("Vui lòng nhập số giờ tăng ca hợp lệ (> 0)"); return; }

        try {
            const res = await fetch('/api/hrm/overtime', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    staff_id: parseInt(staffId),
                    work_date: workDate,
                    hours: hours,
                    note: note
                })
            });
            const data = await res.json();
            if (!res.ok) {
                alert(data.detail || "Lỗi tạo tăng ca");
                return;
            }
            if (window.showToast) window.showToast("Đã lưu giờ tăng ca thành công", "success");
            closeHrmOvertimeModal();
            loadHrmOvertime(getSelectedMonth());
        } catch (e) {
            console.error(e);
        }
    };

    window.deleteHrmOvertime = async function(id) {
        const ok = typeof window.showConfirmModal === 'function'
            ? await window.showConfirmModal({ title: 'Xóa bản ghi tăng ca?', message: 'Bạn có chắc muốn xóa bản ghi tăng ca này?', confirmText: 'Xóa', type: 'danger' })
            : confirm("Bạn có chắc muốn xóa bản ghi tăng ca này?");
        if (!ok) return;
        try {
            const res = await fetch(`/api/hrm/overtime/${id}`, { method: 'DELETE' });
            if (res.ok) {
                if (window.showToast) window.showToast("Đã xóa bản ghi tăng ca", "success");
                loadHrmOvertime(getSelectedMonth());
            } else {
                const data = await res.json();
                if (window.showToast) window.showToast(data.detail || "Lỗi xóa bản ghi tăng ca", "error");
            }
        } catch (e) {
            console.error(e);
        }
    };

    // ── Tạm Ứng (Advances) ──
    function renderHrmAdvancesTable() {
        const tbody = document.getElementById('table-hrm-advances');
        const tfoot = document.getElementById('table-hrm-advances-foot');
        if (!tbody) return;
        const list = advancesData || [];
        if (!list.length) {
            tbody.innerHTML = `<tr><td colspan="8" class="p-6 text-center text-slate-400">Chưa có khoản tạm ứng nào trong kỳ đang xem.</td></tr>`;
            if (tfoot) tfoot.innerHTML = '';
            return;
        }
        const renderRow = r => {
            const sName = escHrmHtml(r.staff_name || r.name || '');
            const sCode = r.employee_code ? `<span class="font-mono font-bold text-sky-700">(${escHrmHtml(r.employee_code)})</span>` : '';
            const meta = escHrmHtml([r.block_name, r.department, r.position].filter(Boolean).join(' · ') || '—');
            const cbTxt = r.cashbook_code
                ? `<span class="px-2 py-0.5 rounded text-xs font-bold bg-sky-100 text-sky-800 whitespace-nowrap">${escHrmHtml(r.cashbook_code)}${r.account_name ? ' · ' + escHrmHtml(r.account_name) : ''}</span>`
                : `<span class="text-slate-400">--</span>`;
            return `
                <tr class="hover:bg-slate-50">
                    <td class="p-2.5 font-mono font-bold text-slate-700 whitespace-nowrap">${fmtVnDate(r.advance_date, true)}</td>
                    <td class="p-2.5 whitespace-nowrap"><span class="font-bold text-slate-800">${sName}</span> ${sCode}</td>
                    <td class="p-2.5 text-slate-600">${meta}</td>
                    <td class="p-2.5 text-right font-mono font-bold text-rose-600">-${Number(r.amount || 0).toLocaleString('vi-VN')} đ</td>
                    <td class="p-2.5">${cbTxt}</td>
                    <td class="p-2.5 text-slate-600">${escHrmHtml(r.note || '-')}</td>
                    <td class="p-2.5 text-slate-500">${escHrmHtml(r.created_by || '-')}</td>
                    <td class="p-2.5 text-center">
                        <button onclick="deleteHrmAdvance(${r.id})" class="text-rose-600 hover:text-rose-800 font-bold p-1 cursor-pointer" title="Xóa">✕</button>
                    </td>
                </tr>
            `;
        };
        const groups = groupRowsByStaff(list);
        if (hrmSubTableGroupMode === 'grouped') {
            tbody.innerHTML = groups.map(g => {
                const sumAmt = g.rows.reduce((s, r) => s + Number(r.amount || 0), 0);
                const baseSal = Number(g.rows[0]?.base_salary_effective ?? g.rows[0]?.base_salary ?? 0);
                const remain = baseSal - sumAmt;
                const codePrefix = g.employee_code ? `[${escHrmHtml(g.employee_code)}] ` : '';
                const rightInfo = baseSal > 0
                    ? `Lương CB: ${baseSal.toLocaleString('vi-VN')} đ · Còn lại tạm tính: <span class="${remain < 0 ? 'text-rose-700 font-bold' : 'text-emerald-700 font-bold'}">${remain.toLocaleString('vi-VN')} đ</span>`
                    : '';
                return `
                    <tr class="bg-sky-50/90 border-y border-sky-200 font-bold text-sky-950">
                        <td colspan="3" class="p-2">${codePrefix}${escHrmHtml(g.staff_name)} <span class="text-slate-500 font-semibold">· ${escHrmHtml(g.meta)}</span></td>
                        <td class="p-2 text-right font-mono text-rose-700">Tổng (${g.rows.length} lần): -${sumAmt.toLocaleString('vi-VN')} đ</td>
                        <td colspan="4" class="p-2 text-right text-xs text-sky-800">${rightInfo}</td>
                    </tr>
                    ${g.rows.map(renderRow).join('')}
                `;
            }).join('');
        } else {
            tbody.innerHTML = list.map(renderRow).join('');
        }
        const grandAmt = list.reduce((s, r) => s + Number(r.amount || 0), 0);
        if (tfoot) {
            tfoot.innerHTML = `
                <tr>
                    <td colspan="3" class="p-2.5 uppercase text-slate-700">Tổng cộng kỳ đang xem (${groups.length} nhân viên · ${list.length} khoản ứng):</td>
                    <td class="p-2.5 text-right font-mono text-rose-700">-${grandAmt.toLocaleString('vi-VN')} đ</td>
                    <td colspan="4"></td>
                </tr>
            `;
        }
    }
    window.renderHrmAdvancesTable = renderHrmAdvancesTable;

    async function loadHrmAdvances(month) {
        const p = getHrmQueryPeriodParams();
        const qs = (month && hrmPeriodMode !== 'range') ? `month=${encodeURIComponent(month)}` : p.qs;
        try {
            const res = await fetch(`/api/hrm/advances?${qs}`);
            if (!res.ok) return;
            advancesData = await res.json();
            renderHrmAdvancesTable();
        } catch (e) {
            console.error("Lỗi tải tạm ứng:", e);
        }
    }
    window.loadHrmAdvances = loadHrmAdvances;

    window.openHrmAdvanceModal = async function() {
        const dateInput = document.getElementById('hrm-adv-date');
        const amountInput = document.getElementById('hrm-adv-amount');
        const accSelect = document.getElementById('hrm-adv-account-id');
        const noteInput = document.getElementById('hrm-adv-note');

        if (dateInput) dateInput.value = new Date().toISOString().slice(0, 10);
        if (amountInput) amountInput.value = '';
        if (noteInput) noteInput.value = '';

        try {
            const [, resAcc] = await Promise.all([
                initHrmStaffPicker('hrm-adv-staff-id', ''),
                fetch('/api/payment-accounts')
            ]);
            if (resAcc.ok && accSelect) {
                const accList = await resAcc.json();
                accSelect.innerHTML = '<option value="">-- Không sinh phiếu chi sổ quỹ --</option>' +
                    accList.map(a => `<option value="${a.id}">${escHrmHtml(a.name)} (${a.type === 'bank' ? 'Ngân hàng' : 'Tiền mặt'})</option>`).join('');
            }
        } catch (e) {
            console.error(e);
        }

        const modal = document.getElementById('modal-hrm-advance');
        if (modal) modal.classList.remove('hidden');
    };

    window.closeHrmAdvanceModal = function() {
        const modal = document.getElementById('modal-hrm-advance');
        if (modal) modal.classList.add('hidden');
    };

    window.submitHrmAdvance = async function() {
        const staffId = document.getElementById('hrm-adv-staff-id')?.value;
        const advDate = document.getElementById('hrm-adv-date')?.value;
        const amountStr = document.getElementById('hrm-adv-amount')?.value;
        const accId = document.getElementById('hrm-adv-account-id')?.value;
        const note = document.getElementById('hrm-adv-note')?.value.trim();

        const amount = typeof parseMoneyInput === 'function' ? parseMoneyInput(amountStr) : (parseFloat((amountStr || '').replace(/\D/g, '')) || 0);

        if (!staffId) { alert("Vui lòng chọn nhân viên"); return; }
        if (!advDate) { alert("Vui lòng chọn ngày tạm ứng"); return; }
        if (!amount || amount <= 0) { alert("Vui lòng nhập số tiền tạm ứng hợp lệ (> 0)"); return; }

        try {
            const res = await fetch('/api/hrm/advances', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    staff_id: parseInt(staffId),
                    advance_date: advDate,
                    amount: amount,
                    account_id: accId ? parseInt(accId) : null,
                    note: note
                })
            });
            const data = await res.json();
            if (!res.ok) {
                alert(data.detail || "Lỗi tạo tạm ứng");
                return;
            }
            if (window.showToast) window.showToast("Đã lưu khoản tạm ứng thành công", "success");
            closeHrmAdvanceModal();
            loadHrmAdvances(getSelectedMonth());
        } catch (e) {
            console.error(e);
        }
    };

    window.deleteHrmAdvance = async function(id) {
        const ok = typeof window.showConfirmModal === 'function'
            ? await window.showConfirmModal({ title: 'Xóa khoản tạm ứng?', message: 'Bạn có chắc muốn xóa khoản tạm ứng này?', subMessage: 'Nếu có phiếu chi sổ quỹ liên kết, phiếu chi đó cũng sẽ tự động bị hủy.', confirmText: 'Xóa tạm ứng', type: 'danger' })
            : confirm("Bạn có chắc muốn xóa khoản tạm ứng này?");
        if (!ok) return;
        try {
            const res = await fetch(`/api/hrm/advances/${id}`, { method: 'DELETE' });
            if (res.ok) {
                if (window.showToast) window.showToast("Đã xóa khoản tạm ứng", "success");
                loadHrmAdvances(getSelectedMonth());
            } else {
                const data = await res.json();
                if (window.showToast) window.showToast(data.detail || "Lỗi xóa khoản tạm ứng", "error");
            }
        } catch (e) {
            console.error(e);
        }
    };

    // ── Cài Đặt (Config & Rules) ──
    let hrmConfigCache = null;
    async function loadHrmConfig() {
        try {
            const res = await fetch('/api/hrm/config');
            if (!res.ok) return;
            const data = await res.json();
            hrmConfigCache = data;

            // 1. Rules
            const r = data.rules || {};
            const setVal = (id, val) => { const el = document.getElementById(id); if (el) el.value = val; };
            const setMoney = (id, val) => { const el = document.getElementById(id); if (el) el.value = (Number(val) || 0).toLocaleString('vi-VN'); };
            setMoney('cfg-late-per-min', r.late_per_min || 5000);
            setMoney('cfg-late-flat', r.late_flat || 200000);
            setVal('cfg-late-threshold', r.late_flat_threshold_min || 30);
            setMoney('cfg-missing-punch', r.missing_punch || 50000);
            setMoney('cfg-absent', r.absent || 500000);
            setMoney('cfg-attendance-bonus', r.attendance_bonus || 500000);
            setMoney('cfg-birthday-bonus', r.birthday_bonus || 200000);
            setVal('cfg-probation-rate', (parseFloat(r.probation_rate || 0.85) * 100).toFixed(0));
            setVal('cfg-ot-multiplier', r.ot_multiplier || 1.5);
            setVal('cfg-ot-min', r.ot_min_minutes || 25);
            setMoney('cfg-min-wage', r.min_wage ?? 5310000);
            setVal('cfg-alert-change-pct', r.alert_change_pct ?? 30);

            // Enterprise Mode
            const isEnt = r.payroll_mode === 'enterprise';
            const modeToggle = document.getElementById('cfg-payroll-mode-toggle');
            if (modeToggle) modeToggle.checked = isEnt;
            toggleEnterpriseRulesUI(isEnt);
            setVal('cfg-insurance-rate', r.insurance_rate ? (parseFloat(r.insurance_rate) * 100).toFixed(1) : '10.5');
            setMoney('cfg-insurance-cap', r.insurance_cap || 46800000);
            setMoney('cfg-tax-self', r.tax_self_deduction || 11000000);
            setMoney('cfg-tax-dep', r.tax_dependent_deduction || 4400000);

            // 2. Blocks
            const blocksList = document.getElementById('hrm-blocks-list');
            if (blocksList) {
                blocksList.innerHTML = (data.blocks || []).map(b => `
                    <div class="p-3 bg-slate-50 border border-slate-200/80 rounded-xl space-y-2 relative group hover:border-emerald-400 transition">
                        <div class="flex items-center justify-between">
                            <span class="font-bold text-slate-800 text-xs">${b.name}</span>
                            <div class="flex items-center gap-1">
                                <button onclick="openEditBlockModal(${b.id})" class="px-2 py-0.5 bg-emerald-50 text-emerald-700 hover:bg-emerald-100 rounded text-xs font-bold cursor-pointer">✏️ Sửa</button>
                                <button onclick="deleteHrmBlock(${b.id})" class="px-2 py-0.5 bg-rose-50 text-rose-700 hover:bg-rose-100 rounded text-xs font-bold cursor-pointer" title="Xóa khối">🗑️</button>
                            </div>
                        </div>
                        <div class="text-xs text-slate-600 space-y-1">
                            <div>Ca: <span class="font-bold text-slate-800 font-mono">${b.start_time} - ${b.end_time}</span> (Nghỉ trưa: ${b.lunch_minutes || 0}p)</div>
                            <div>Công chuẩn: <span class="font-bold text-slate-800">${b.std_hours || 8}h/ngày</span></div>
                            <div>Nghỉ: <span class="font-bold text-slate-800">${b.off_sunday ? 'Nghỉ Chủ Nhật' : (b.monthly_off_days + ' ngày/tháng')}</span></div>
                        </div>
                    </div>
                `).join('');
            }

            // 3. Holidays
            const holidaysList = document.getElementById('hrm-holidays-list');
            if (holidaysList) {
                if (!data.holidays || data.holidays.length === 0) {
                    holidaysList.innerHTML = `<div class="col-span-full text-slate-400 text-center py-2 text-xs">Chưa có ngày lễ nào được thiết lập.</div>`;
                } else {
                    holidaysList.innerHTML = data.holidays.map(h => `
                        <div class="p-2 bg-sky-50 border border-sky-200/70 rounded-lg flex items-center justify-between text-xs">
                            <div>
                                <div class="font-bold text-sky-900">${h.name}</div>
                                <div class="text-xs text-sky-600 font-mono">${h.holiday_date}</div>
                            </div>
                            <button onclick="deleteHrmHoliday('${h.holiday_date}')" class="text-rose-600 hover:text-rose-800 font-bold p-1 cursor-pointer">✕</button>
                        </div>
                    `).join('');
                }
            }

            // 4. Spa Rules
            const spaRulesList = document.getElementById('hrm-spa-rules-list');
            if (spaRulesList) {
                if (!data.spa_rules || data.spa_rules.length === 0) {
                    spaRulesList.innerHTML = `<div class="text-slate-400 text-center py-2 text-xs">Chưa có quy tắc hoa hồng Spa.</div>`;
                } else {
                    const roleNames = {
                        receiver: '📥 Nhận bé',
                        worker_1: '🛁 Thợ Làm 1',
                        worker_2: '🚿 Thợ Làm 2',
                        cutter: '✂️ Thợ Cắt Tỉa',
                        dyer: '🎨 Thợ Nhuộm'
                    };
                    spaRulesList.innerHTML = `
                        <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-2 text-xs">
                            ${data.spa_rules.map(sr => `
                                <div class="p-2.5 bg-slate-50 border rounded-lg flex items-center justify-between">
                                    <div>
                                        <div class="font-bold text-slate-800">${roleNames[sr.role_key] || sr.role_key}</div>
                                        <div class="text-slate-600 text-xs mt-0.5">${sr.service_name || 'Tất cả dịch vụ'}: <span class="font-bold text-sky-700">${sr.rate_type === 'percent' ? (sr.value + '%') : ((sr.value || 0).toLocaleString('vi-VN') + ' đ')}</span></div>
                                    </div>
                                    <button type="button" onclick="deleteHrmSpaCommissionRule(${sr.id})" class="text-rose-500 hover:text-rose-700 font-bold px-1.5 py-0.5 cursor-pointer">✕</button>
                                </div>
                            `).join('')}
                        </div>
                    `;
                }
            }
        } catch (e) {
            console.error("Lỗi tải cài đặt HRM:", e);
        }
    }
    window.loadHrmConfig = loadHrmConfig;

    window.toggleEnterpriseRulesUI = function(isEnterprise) {
        const fields = document.getElementById('cfg-enterprise-fields');
        const label = document.getElementById('cfg-payroll-mode-label');
        if (fields) fields.classList.toggle('hidden', !isEnterprise);
        if (label) {
            label.textContent = isEnterprise ? "Doanh Nghiệp (HĐ, BHXH & Thuế)" : "SME (Lương Net)";
            label.className = isEnterprise ? "text-xs font-bold text-sky-700" : "text-xs font-bold text-slate-600";
        }
    };

    window.toggleContractFields = function(hasContract) {
        const fields = document.getElementById('hrm-staff-contract-fields');
        if (fields) fields.classList.toggle('hidden', !hasContract);
    };

    window.saveHrmRules = async function() {
        const parseVal = id => {
            const val = document.getElementById(id)?.value;
            return typeof parseMoneyInput === 'function' ? parseMoneyInput(val) : (parseFloat((val || '').replace(/\D/g, '')) || 0);
        };
        const probPct = parseFloat(document.getElementById('cfg-probation-rate')?.value) || 0;
        const isEnt = Boolean(document.getElementById('cfg-payroll-mode-toggle')?.checked);
        const insPct = parseFloat(document.getElementById('cfg-insurance-rate')?.value) || 10.5;

        const body = {
            late_per_min: parseVal('cfg-late-per-min'),
            late_flat: parseVal('cfg-late-flat'),
            late_flat_threshold_min: parseInt(document.getElementById('cfg-late-threshold')?.value) || 30,
            missing_punch: parseVal('cfg-missing-punch'),
            absent: parseVal('cfg-absent'),
            attendance_bonus: parseVal('cfg-attendance-bonus'),
            birthday_bonus: parseVal('cfg-birthday-bonus'),
            probation_rate: (probPct > 1 ? (probPct / 100).toFixed(2) : String(probPct || '0.85')),
            ot_multiplier: String(document.getElementById('cfg-ot-multiplier')?.value || '1.5'),
            ot_min_minutes: parseInt(document.getElementById('cfg-ot-min')?.value) || 25,
            min_wage: parseVal('cfg-min-wage'),
            alert_change_pct: parseInt(document.getElementById('cfg-alert-change-pct')?.value) || 30,
            payroll_mode: isEnt ? 'enterprise' : 'sme',
            insurance_rate: (insPct / 100).toFixed(3),
            insurance_cap: parseVal('cfg-insurance-cap'),
            tax_self_deduction: parseVal('cfg-tax-self'),
            tax_dependent_deduction: parseVal('cfg-tax-dep')
        };

        if (body.late_flat > 0 && body.late_per_min * body.late_flat_threshold_min > body.late_flat * 2) {
            const okWarn = typeof window.showConfirmModal === 'function'
                ? await window.showConfirmModal({
                    title: 'Cảnh báo đơn giá phạt đi trễ cao bất thường',
                    message: `Đơn giá phạt trễ từng phút (${body.late_per_min.toLocaleString('vi-VN')} đ/phút) đang quá cao so với mức phạt trễ nặng (${body.late_flat.toLocaleString('vi-VN')} đ).`,
                    subMessage: `Quy định thông thường là 5.000 đ/phút. Anh có chắc muốn lưu mức ${body.late_per_min.toLocaleString('vi-VN')} đ/phút không?`,
                    confirmText: 'Vẫn lưu mức này',
                    type: 'warning'
                })
                : confirm(`Đơn giá ${body.late_per_min} đ/phút quá cao. Vẫn lưu?`);
            if (!okWarn) return;
        }

        try {
            const res = await fetch('/api/hrm/config/rules', {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(body)
            });
            const data = await res.json();
            if (!res.ok) {
                if (window.showToast) window.showToast(data.detail || "Lỗi lưu quy định", "error");
                return;
            }
            if (window.showToast) window.showToast("Đã lưu quy định phạt & thưởng thành công", "success");
            loadHrmConfig();
        } catch (e) {
            console.error(e);
        }
    };

    window.openAddBlockModal = function() {
        const titleEl = document.getElementById('modal-hrm-block-title');
        if (titleEl) titleEl.textContent = "Thêm Khối Làm Việc Mới";
        document.getElementById('hrm-block-id').value = '';
        document.getElementById('hrm-block-name').value = '';
        document.getElementById('hrm-block-start').value = '08:00';
        document.getElementById('hrm-block-end').value = '17:30';
        document.getElementById('hrm-block-lunch').value = 90;
        document.getElementById('hrm-block-std-hours').value = 8;
        document.getElementById('hrm-block-monthly-off').value = 0;
        document.getElementById('hrm-block-off-sunday').checked = true;

        const modal = document.getElementById('modal-hrm-block');
        if (modal) modal.classList.remove('hidden');
        setTimeout(() => document.getElementById('hrm-block-name')?.focus(), 100);
    };

    window.openEditBlockModal = function(id) {
        if (!hrmConfigCache || !hrmConfigCache.blocks) return;
        const b = hrmConfigCache.blocks.find(x => x.id === id);
        if (!b) return;

        const titleEl = document.getElementById('modal-hrm-block-title');
        if (titleEl) titleEl.textContent = "Cấu Hình Khối Làm Việc";
        document.getElementById('hrm-block-id').value = b.id;
        document.getElementById('hrm-block-name').value = b.name;
        document.getElementById('hrm-block-start').value = b.start_time;
        document.getElementById('hrm-block-end').value = b.end_time;
        document.getElementById('hrm-block-lunch').value = b.lunch_minutes || 0;
        document.getElementById('hrm-block-std-hours').value = b.std_hours || 8;
        document.getElementById('hrm-block-monthly-off').value = b.monthly_off_days || 0;
        document.getElementById('hrm-block-off-sunday').checked = Boolean(b.off_sunday);

        const modal = document.getElementById('modal-hrm-block');
        if (modal) modal.classList.remove('hidden');
    };

    window.closeEditBlockModal = function() {
        const modal = document.getElementById('modal-hrm-block');
        if (modal) modal.classList.add('hidden');
    };

    window.saveHrmBlock = async function() {
        const id = document.getElementById('hrm-block-id')?.value;
        const body = {
            name: document.getElementById('hrm-block-name')?.value.trim(),
            start_time: document.getElementById('hrm-block-start')?.value,
            end_time: document.getElementById('hrm-block-end')?.value,
            lunch_minutes: parseInt(document.getElementById('hrm-block-lunch')?.value) || 0,
            std_hours: parseFloat(document.getElementById('hrm-block-std-hours')?.value) || 8,
            monthly_off_days: parseInt(document.getElementById('hrm-block-monthly-off')?.value) || 0,
            off_sunday: document.getElementById('hrm-block-off-sunday')?.checked ? 1 : 0,
            split_time: "12:00"
        };

        if (!body.name || !body.start_time || !body.end_time) {
            alert("Vui lòng nhập đầy đủ tên khối, giờ vào ca và giờ tan ca");
            return;
        }

        try {
            const url = id ? `/api/hrm/config/blocks/${id}` : '/api/hrm/config/blocks';
            const method = id ? 'PUT' : 'POST';
            const res = await fetch(url, {
                method: method,
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(body)
            });
            const data = await res.json();
            if (!res.ok) {
                alert(data.detail || "Lỗi lưu khối làm việc");
                return;
            }
            if (window.showToast) window.showToast("Đã lưu khối làm việc thành công", "success");
            closeEditBlockModal();
            loadHrmConfig();
        } catch (e) {
            console.error(e);
        }
    };

    window.deleteHrmBlock = async function(id) {
        const ok = typeof window.showConfirmModal === 'function'
            ? await window.showConfirmModal({ title: 'Xóa khối làm việc?', message: 'Bạn có chắc muốn xóa khối làm việc này?', confirmText: 'Xóa khối', type: 'danger' })
            : confirm("Bạn có chắc muốn xóa khối làm việc này?");
        if (!ok) return;
        try {
            const res = await fetch(`/api/hrm/config/blocks/${id}`, { method: 'DELETE' });
            if (res.ok) {
                if (window.showToast) window.showToast("Đã xóa khối làm việc", "success");
                loadHrmConfig();
            } else {
                const data = await res.json();
                if (window.showToast) window.showToast(data.detail || "Lỗi xóa khối làm việc", "error");
            }
        } catch (e) {
            console.error(e);
        }
    };

    window.addHrmHoliday = async function() {
        const date = document.getElementById('cfg-new-holiday-date')?.value;
        const name = document.getElementById('cfg-new-holiday-name')?.value.trim();
        if (!date || !name) {
            if (window.showToast) window.showToast("Vui lòng chọn ngày và nhập tên ngày lễ", "warning");
            return;
        }
        try {
            const res = await fetch('/api/hrm/config/holidays', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ holiday_date: date, name: name })
            });
            if (res.ok) {
                document.getElementById('cfg-new-holiday-name').value = '';
                if (window.showToast) window.showToast("Đã thêm ngày lễ", "success");
                loadHrmConfig();
            } else {
                const data = await res.json();
                if (window.showToast) window.showToast(data.detail || "Lỗi thêm ngày lễ", "error");
            }
        } catch (e) {
            console.error(e);
        }
    };

    window.deleteHrmHoliday = async function(date) {
        const dFmt = parseVnIsoDate(date).formatted;
        const ok = typeof window.showConfirmModal === 'function'
            ? await window.showConfirmModal({ title: 'Xóa ngày lễ?', message: `Xác nhận xóa ngày lễ ${dFmt}?`, confirmText: 'Xóa ngày lễ', type: 'danger' })
            : confirm(`Xóa ngày lễ ${date}?`);
        if (!ok) return;
        try {
            const res = await fetch(`/api/hrm/config/holidays/${date}`, { method: 'DELETE' });
            if (res.ok) {
                if (window.showToast) window.showToast("Đã xóa ngày lễ", "success");
                loadHrmConfig();
            } else {
                const data = await res.json();
                if (window.showToast) window.showToast(data.detail || "Lỗi xóa ngày lễ", "error");
            }
        } catch (e) {
            console.error(e);
        }
    };

    // ── Sửa Công Ngày (Matrix Attendance) ──
    window.openHrmEditDayModal = function(staffId, dateStr, currentCode) {
        document.getElementById('hrm-edit-day-staff-id').value = staffId;
        document.getElementById('hrm-edit-day-date').value = dateStr;

        let staffName = 'Nhân viên';
        if (attendanceData && attendanceData.matrix) {
            const row = attendanceData.matrix.find(m => m.staff_id === staffId);
            if (row) staffName = row.name;
        }
        document.getElementById('hrm-edit-day-staff-name').textContent = `Nhân viên: ${staffName}`;
        document.getElementById('hrm-edit-day-date-text').textContent = `Ngày điều chỉnh: ${dateStr}`;
        document.getElementById('hrm-edit-day-code').value = currentCode || 'X';
        document.getElementById('hrm-edit-day-punches').value = '';
        document.getElementById('hrm-edit-day-waive').checked = false;
        document.getElementById('hrm-edit-day-note').value = '';

        const modal = document.getElementById('modal-hrm-edit-day');
        if (modal) modal.classList.remove('hidden');
    };

    window.closeHrmEditDayModal = function() {
        const modal = document.getElementById('modal-hrm-edit-day');
        if (modal) modal.classList.add('hidden');
    };

    window.submitHrmEditDay = async function() {
        const staffId = parseInt(document.getElementById('hrm-edit-day-staff-id')?.value);
        const workDate = document.getElementById('hrm-edit-day-date')?.value;
        const code = document.getElementById('hrm-edit-day-code')?.value;
        const punchesStr = document.getElementById('hrm-edit-day-punches')?.value.trim();
        const waive = document.getElementById('hrm-edit-day-waive')?.checked;
        const note = document.getElementById('hrm-edit-day-note')?.value.trim();

        const punches = punchesStr ? punchesStr.split(',').map(s => s.trim()).filter(Boolean) : null;

        try {
            const res = await fetch('/api/hrm/attendance', {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    staff_id: staffId,
                    work_date: workDate,
                    code: code,
                    punches: punches,
                    waive: waive,
                    note: note
                })
            });
            const data = await res.json();
            if (!res.ok) {
                alert(data.detail || "Lỗi cập nhật công");
                return;
            }
            if (window.showToast) window.showToast("Đã cập nhật công thành công", "success");
            closeHrmEditDayModal();
            loadHrmAttendance(getSelectedMonth());
            // Nếu đang mở modal chi tiết công hoặc đang ở subtab payroll thì refresh
            if (!document.getElementById('modal-hrm-staff-days-detail')?.classList.contains('hidden')) {
                loadHrmPayroll(getSelectedMonth()).then(() => {
                    viewHrmStaffDaysDetail(staffId);
                });
            }
        } catch (e) {
            console.error(e);
        }
    };

    // ── Sửa Dòng Bảng Lương Chi Tiết Nhiều Khoản Mục (Payroll Manual Items) ──
    let hrmEditLineTargetMonth = '';
    let activePayslipContext = null;

    function _parseMoneyRaw(val) {
        if (typeof parseMoneyInput === 'function') return Math.max(0, Number(parseMoneyInput(val)) || 0);
        return Math.max(0, parseFloat(String(val || '').replace(/\D/g, '')) || 0);
    }

    window.recalcHrmManualItemsTotals = function() {
        let fuel = 0, bonus = 0, deduct = 0;
        document.querySelectorAll('#hrm-line-items-list .hrm-manual-item-row').forEach(row => {
            const t = row.querySelector('.hrm-mi-type')?.value || 'bonus';
            const amt = _parseMoneyRaw(row.querySelector('.hrm-mi-amount')?.value);
            if (t === 'fuel') fuel += amt;
            else if (t === 'deduction') deduct += amt;
            else bonus += amt;
        });
        const fEl = document.getElementById('hrm-line-sum-fuel');
        const bEl = document.getElementById('hrm-line-sum-bonus');
        const dEl = document.getElementById('hrm-line-sum-deduction');
        if (fEl) fEl.textContent = `+${fuel.toLocaleString('vi-VN')} đ`;
        if (bEl) bEl.textContent = `+${bonus.toLocaleString('vi-VN')} đ`;
        if (dEl) dEl.textContent = `-${deduct.toLocaleString('vi-VN')} đ`;
    };

    window.addHrmManualItemRow = function(type = 'bonus', label = '', amount = 0, autoFocus = true) {
        const listEl = document.getElementById('hrm-line-items-list');
        if (!listEl) return;
        const normType = type === 'deduct' ? 'deduction' : (['fuel', 'bonus', 'deduction'].includes(type) ? type : 'bonus');
        const placeholders = {
            fuel: 'VD: Phụ cấp xăng xe, gửi xe, điện thoại...',
            bonus: 'VD: Thưởng nóng đạt KPI, hỗ trợ ca...',
            deduction: 'VD: Khấu trừ làm hỏng đồ, ứng vật tư...'
        };
        const row = document.createElement('div');
        row.className = 'hrm-manual-item-row grid grid-cols-12 gap-2 items-center';
        row.innerHTML = `
            <div class="col-span-4">
                <select class="hrm-mi-type w-full border border-slate-300 rounded-lg px-2 py-1.5 text-xs font-bold text-slate-800 bg-white" onchange="recalcHrmManualItemsTotals()">
                    <option value="fuel" ${normType === 'fuel' ? 'selected' : ''}>PC Xăng / Khác (+)</option>
                    <option value="bonus" ${normType === 'bonus' ? 'selected' : ''}>Thưởng Khác (+)</option>
                    <option value="deduction" ${normType === 'deduction' ? 'selected' : ''}>Giảm Trừ Khác (-)</option>
                </select>
            </div>
            <div class="col-span-5">
                <input type="text" class="hrm-mi-label w-full border border-slate-300 rounded-lg px-2.5 py-1.5 text-xs text-slate-800" placeholder="${placeholders[normType]}" value="${escHrmHtml(label)}">
            </div>
            <div class="col-span-3 flex items-center gap-1">
                <input type="text" class="hrm-mi-amount w-full border border-slate-300 rounded-lg px-2 py-1.5 text-xs font-mono font-bold text-right text-slate-900" placeholder="0" value="${amount > 0 ? Number(amount).toLocaleString('vi-VN') : ''}" oninput="if(typeof formatCurrencyInputRealtime==='function') formatCurrencyInputRealtime(this); recalcHrmManualItemsTotals();">
                <button type="button" onclick="this.closest('.hrm-manual-item-row').remove(); recalcHrmManualItemsTotals();" class="text-slate-400 hover:text-rose-600 font-bold px-1.5 py-1 cursor-pointer" title="Xóa dòng">&times;</button>
            </div>
        `;
        listEl.appendChild(row);
        recalcHrmManualItemsTotals();
        if (autoFocus) {
            const inp = label ? row.querySelector('.hrm-mi-amount') : row.querySelector('.hrm-mi-label');
            if (inp) setTimeout(() => inp.focus(), 30);
        }
    };

    window.openHrmManualItemsModal = async function(staffId, focusType = 'bonus', explicitMonth = '') {
        const month = explicitMonth || getSelectedMonth();
        hrmEditLineTargetMonth = month;
        document.getElementById('hrm-line-staff-id').value = staffId;

        let line = null;
        if (payrollData && payrollData.month === month && Array.isArray(payrollData.lines)) {
            line = payrollData.lines.find(l => Number(l.staff_id) === Number(staffId));
        }
        if (!line && activePayslipContext && activePayslipContext.month === month && Number(activePayslipContext.staffId) === Number(staffId)) {
            line = activePayslipContext.payslip;
        }
        if (!line) {
            try {
                const r = await fetch(`/api/hrm/payroll/${month}`);
                if (r.ok) {
                    const pData = await r.json();
                    if (Array.isArray(pData.lines)) {
                        line = pData.lines.find(l => Number(l.staff_id) === Number(staffId));
                    }
                }
            } catch (e) {}
        }

        const staffName = line
            ? `${line.name || activePayslipContext?.staffName || 'Nhân viên'} (${line.employee_code || activePayslipContext?.staffCode || '#' + staffId}) — Kỳ ${month.slice(5)}/${month.slice(0, 4)}`
            : `Nhân viên #${staffId} — Kỳ ${month.slice(5)}/${month.slice(0, 4)}`;
        document.getElementById('hrm-line-staff-name').textContent = staffName;

        const listEl = document.getElementById('hrm-line-items-list');
        if (listEl) listEl.innerHTML = '';

        const existingItems = (line && Array.isArray(line.manual_items)) ? line.manual_items : [];
        if (existingItems.length > 0) {
            existingItems.forEach(it => addHrmManualItemRow(it.type, it.label || '', Number(it.amount) || 0, false));
        }
        // Nếu loại khoản người dùng vừa bấm vào chưa có dòng trống nào thì tạo sẵn 1 dòng mới đúng loại đó để gõ ngay
        if (!existingItems.some(it => it.type === focusType)) {
            addHrmManualItemRow(focusType, '', 0, true);
        } else {
            recalcHrmManualItemsTotals();
        }

        // Chỉ điền sẵn ghi chú bổ sung nếu nó không phải chuỗi tự sinh từ các dòng khoản mục
        const noteEl = document.getElementById('hrm-line-manual-note');
        if (noteEl) {
            const curNote = (line && line.manual_note) ? String(line.manual_note) : '';
            const looksAuto = existingItems.length > 0 && existingItems.every(it => curNote.includes(it.label));
            noteEl.value = looksAuto ? '' : curNote;
        }

        const modal = document.getElementById('modal-hrm-edit-line');
        if (modal) modal.classList.remove('hidden');
    };

    window.openHrmManualItemsFromPayslip = function(defaultType = 'bonus') {
        if (!activePayslipContext || !activePayslipContext.staffId) return;
        window.openHrmManualItemsModal(activePayslipContext.staffId, defaultType, activePayslipContext.month);
    };

    window.editHrmLine = function(staffId, bonusOther, fuelOther, deductionOther, note) {
        window.openHrmManualItemsModal(staffId, 'bonus');
    };

    window.closeHrmEditLineModal = function() {
        const modal = document.getElementById('modal-hrm-edit-line');
        if (modal) modal.classList.add('hidden');
    };

    window.submitHrmEditLine = async function() {
        const staffId = parseInt(document.getElementById('hrm-line-staff-id')?.value, 10);
        const month = hrmEditLineTargetMonth || getSelectedMonth();
        const manual_items = [];
        document.querySelectorAll('#hrm-line-items-list .hrm-manual-item-row').forEach(row => {
            const type = row.querySelector('.hrm-mi-type')?.value || 'bonus';
            const label = (row.querySelector('.hrm-mi-label')?.value || '').trim();
            const amount = _parseMoneyRaw(row.querySelector('.hrm-mi-amount')?.value);
            if (amount > 0) {
                manual_items.push({ type, label, amount });
            }
        });

        const body = {
            manual_items,
            manual_note: (document.getElementById('hrm-line-manual-note')?.value || '').trim()
        };

        try {
            const res = await fetch(`/api/hrm/payroll/${month}/lines/${staffId}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(body)
            });
            const data = await res.json().catch(() => ({}));
            if (!res.ok) {
                if (window.showToast) window.showToast(data.detail || "Lỗi cập nhật dòng lương", "error");
                else alert(data.detail || "Lỗi cập nhật dòng lương");
                return;
            }
            if (window.showToast) window.showToast("Đã lưu chi tiết thưởng / phụ cấp / giảm trừ & tính lại lương!", "success");
            closeHrmEditLineModal();
            if (month === getSelectedMonth()) {
                loadHrmPayroll(month);
            }
            const payslipModal = document.getElementById('modal-hrm-payslip');
            if (payslipModal && !payslipModal.classList.contains('hidden')) {
                openHrmPayslipModal(staffId);
            }
            const myPayslipTab = document.getElementById('tab-my-payslip');
            if (myPayslipTab && !myPayslipTab.classList.contains('hidden')) {
                loadMyPayslip();
            }
        } catch (e) {
            console.error(e);
        }
    };

    // ── Xuất Google Sheet Mobile ──
    window.exportMobileSheets = function() {
        const month = getSelectedMonth();
        downloadWithAuth(`/api/hrm/payroll/${month}/export-mobile-sheets`, `Phieu_Luong_Mobile_${month}.xlsx`);
    };

    // ── Chi Tiết Chấm Công & Phạt Trễ (Modal Days Breakdown) ──
    let activeModalDaysStaffId = null;
    let modalDaysSortState = { key: 'date', dir: 'asc' };

    window.toggleModalDaysSort = function(colKey) {
        if (modalDaysSortState.key === colKey) {
            modalDaysSortState.dir = modalDaysSortState.dir === 'asc' ? 'desc' : 'asc';
        } else {
            modalDaysSortState = { key: colKey, dir: colKey === 'date' ? 'asc' : 'desc' };
        }
        if (activeModalDaysStaffId) window.viewHrmStaffDaysDetail(activeModalDaysStaffId);
    };

    window.viewHrmStaffDaysDetail = function(staffId) {
        if (!payrollData || !payrollData.lines) {
            alert("Chưa có dữ liệu bảng lương. Vui lòng bấm 'Tính Lương' trước.");
            return;
        }
        const line = payrollData.lines.find(l => l.staff_id === staffId);
        if (!line) {
            alert("Không tìm thấy nhân viên trong bảng lương tháng này.");
            return;
        }
        activeModalDaysStaffId = staffId;

        document.querySelectorAll('[data-modal-days-sort]').forEach(el => {
            const k = el.getAttribute('data-modal-days-sort');
            if (k === modalDaysSortState.key) {
                el.textContent = modalDaysSortState.dir === 'asc' ? '↑' : '↓';
                el.className = k === 'penalty' ? 'text-rose-600 font-bold' : 'text-sky-600 font-bold';
            } else {
                el.textContent = '⇅';
                el.className = k === 'penalty' ? 'text-rose-300' : 'text-slate-400';
            }
        });

        const month = getSelectedMonth();
        document.getElementById('hrm-days-detail-title').textContent = `Chi Tiết Chấm Công & Phạt Trễ: ${line.name} (${line.employee_code || 'NV' + line.staff_id})`;
        document.getElementById('hrm-days-detail-subtitle').textContent = `Khối: ${line.block} | Tháng: ${month.slice(5)}/${month.slice(0, 4)} | Lương cơ bản: ${(line.base_salary || 0).toLocaleString('vi-VN')}đ`;

        const totalDays = Number(((line.days_official || 0) + (line.days_probation || 0)).toFixed(2));
        document.getElementById('hrm-days-detail-sum-credit').textContent = `${totalDays} công`;
        document.getElementById('hrm-days-detail-sub-credit').textContent = `${line.days_official || 0} Chính thức / ${line.days_probation || 0} Thử việc`;

        document.getElementById('hrm-days-detail-sum-penalty').textContent = `-${(line.penalties || 0).toLocaleString('vi-VN')}đ`;
        const totalLateMin = (line.days || []).reduce((acc, d) => acc + (d.late_min || 0), 0);
        document.getElementById('hrm-days-detail-sub-penalty').textContent = `Tổng trễ: ${totalLateMin} phút`;

        const otAndBonus = (line.ot_pay || 0) + (line.attendance_bonus || 0);
        document.getElementById('hrm-days-detail-sum-ot').textContent = `${otAndBonus.toLocaleString('vi-VN')}đ`;
        document.getElementById('hrm-days-detail-sub-ot').textContent = `OT: ${(line.ot_pay || 0).toLocaleString('vi-VN')}đ | CC: ${(line.attendance_bonus || 0).toLocaleString('vi-VN')}đ`;

        document.getElementById('hrm-days-detail-sum-net').textContent = `${(line.net_rounded || 0).toLocaleString('vi-VN')}đ`;
        document.getElementById('hrm-days-detail-sub-net').textContent = `Tạm ứng: -${(line.advances || 0).toLocaleString('vi-VN')}đ`;

        const tbody = document.getElementById('table-hrm-staff-days-body');
        const tfoot = document.getElementById('table-hrm-staff-days-foot');
        const sortedDays = [...(line.days || [])].sort((a, b) => {
            const m = modalDaysSortState.dir === 'asc' ? 1 : -1;
            if (modalDaysSortState.key === 'late') return ((Number(a.late_min) || 0) - (Number(b.late_min) || 0)) * m || a.date.localeCompare(b.date);
            if (modalDaysSortState.key === 'penalty') return ((Number(a.penalty) || 0) - (Number(b.penalty) || 0)) * m || a.date.localeCompare(b.date);
            return a.date.localeCompare(b.date) * m;
        });

        let sumWMin = 0, sumEarly = 0, sumPen = 0;
        tbody.innerHTML = sortedDays.map(d => {
            const dInfo = parseVnIsoDate(d.date);
            sumWMin += Number(d.worked_min) || 0;
            sumEarly += Number(d.early_min) || 0;
            sumPen += Number(d.penalty) || 0;

            let codeBadge = `<span class="px-2 py-0.5 rounded text-xs font-bold bg-slate-100 text-slate-500">-</span>`;
            if (d.code === 'X') codeBadge = `<span class="px-2 py-0.5 rounded text-xs font-bold bg-emerald-100 text-emerald-800 border border-emerald-200">X (1.0)</span>`;
            else if (d.code === 'X/2') codeBadge = `<span class="px-2 py-0.5 rounded text-xs font-bold bg-sky-100 text-sky-800 border border-sky-200">X/2 (0.5)</span>`;
            else if (d.code === 'TV') codeBadge = `<span class="px-2 py-0.5 rounded text-xs font-bold bg-amber-100 text-amber-800 border border-amber-200">TV (1.0)</span>`;
            else if (d.code === 'TV/2') codeBadge = `<span class="px-2 py-0.5 rounded text-xs font-bold bg-amber-200 text-amber-900 border border-amber-300">TV/2 (0.5)</span>`;
            else if (d.code === 'OFF') codeBadge = `<span class="px-2 py-0.5 rounded text-xs font-bold bg-slate-200 text-slate-700">OFF</span>`;
            else if (d.code === 'L') codeBadge = `<span class="px-2 py-0.5 rounded text-xs font-bold bg-sky-100 text-sky-800 border border-sky-200">L (Lễ)</span>`;
            else if (d.code === 'CN') codeBadge = `<span class="px-2 py-0.5 rounded text-xs font-medium bg-slate-50 text-slate-400">CN nghỉ</span>`;

            let viols = [];
            (d.violations || []).forEach(v => {
                if (v === 'late') viols.push(`<span class="px-1.5 py-0.5 bg-rose-100 text-rose-700 rounded text-xs font-bold">Trễ ${d.late_min}p</span>`);
                else if (v === 'early') viols.push(`<span class="px-1.5 py-0.5 bg-amber-100 text-amber-700 rounded text-xs font-bold">Về sớm ${d.early_min}p</span>`);
                else if (v === 'missing_in') viols.push(`<span class="px-1.5 py-0.5 bg-rose-100 text-rose-700 rounded text-xs font-bold">Quên vào</span>`);
                else if (v === 'missing_out') viols.push(`<span class="px-1.5 py-0.5 bg-rose-100 text-rose-700 rounded text-xs font-bold">Quên ra</span>`);
                else if (v === 'absent') viols.push(`<span class="px-1.5 py-0.5 bg-red-200 text-red-900 rounded text-xs font-bold">Vắng không phép</span>`);
            });
            if (d.waived) {
                viols.push(`<span class="px-1.5 py-0.5 bg-emerald-100 text-emerald-800 rounded text-xs font-bold">Đã miễn phạt</span>`);
            }

            const workedHours = d.worked_min > 0 ? (d.worked_min / 60).toFixed(1) + 'h' : '—';
            const lateText = d.late_min > 0 ? `<span class="text-rose-600 font-bold">${d.late_min}p</span>` : '<span class="text-slate-300">—</span>';
            const earlyText = d.early_min > 0 ? `<span class="text-amber-600 font-bold">${d.early_min}p</span>` : '<span class="text-slate-300">—</span>';
            const penText = d.penalty > 0 ? `<span class="text-rose-600 font-mono font-bold">-${d.penalty.toLocaleString('vi-VN')}đ</span>` : '<span class="text-slate-300">—</span>';

            return `
                <tr class="hover:bg-slate-50 ${dInfo.isSun ? 'bg-slate-50/50' : ''}">
                    <td class="p-2.5 font-mono font-bold text-slate-800 whitespace-nowrap">${dInfo.formatted}</td>
                    <td class="p-2.5 text-center font-bold ${dInfo.isSun ? 'text-rose-600' : 'text-slate-600'}">${dInfo.dayOfWeek}</td>
                    <td class="p-2.5 text-center font-mono font-bold ${d.check_in ? 'text-slate-800' : 'text-slate-300'}">${d.check_in || '—'}</td>
                    <td class="p-2.5 text-center font-mono font-bold ${d.check_out ? 'text-slate-800' : 'text-slate-300'}">${d.check_out || '—'}</td>
                    <td class="p-2.5 text-right font-mono">${workedHours}</td>
                    <td class="p-2.5 text-right">${lateText}</td>
                    <td class="p-2.5 text-right">${earlyText}</td>
                    <td class="p-2.5"><div class="flex flex-wrap gap-1">${viols.join('') || '<span class="text-slate-400">Đúng giờ</span>'}</div></td>
                    <td class="p-2.5 text-right">${penText}</td>
                    <td class="p-2.5 text-center">${codeBadge}</td>
                    <td class="p-2.5 text-center">
                        <button onclick="openHrmEditDayModal(${staffId}, '${d.date}', '${d.code}')" class="text-sky-600 hover:underline font-bold cursor-pointer text-xs">✏️ Sửa</button>
                    </td>
                </tr>
            `;
        }).join('');

        if (tfoot) {
            tfoot.innerHTML = `
                <tr>
                    <td colspan="4" class="p-2.5 text-right uppercase text-slate-700">Tổng cộng (${sortedDays.length} ngày):</td>
                    <td class="p-2.5 text-right font-mono text-slate-900">${sumWMin > 0 ? (sumWMin / 60).toFixed(1) + 'h' : '0h'}</td>
                    <td class="p-2.5 text-right font-mono text-rose-700">${totalLateMin > 0 ? totalLateMin + 'p' : '0p'}</td>
                    <td class="p-2.5 text-right font-mono text-amber-700">${sumEarly > 0 ? sumEarly + 'p' : '—'}</td>
                    <td class="p-2.5"></td>
                    <td class="p-2.5 text-right font-mono font-bold text-rose-700">${sumPen > 0 ? '-' + sumPen.toLocaleString('vi-VN') + 'đ' : '0đ'}</td>
                    <td class="p-2.5 text-center font-mono font-bold text-emerald-800">${totalDays} công</td>
                    <td class="p-2.5"></td>
                </tr>
            `;
        }

        const modal = document.getElementById('modal-hrm-staff-days-detail');
        if (modal) modal.classList.remove('hidden');
    };

    window.closeHrmStaffDaysDetailModal = function() {
        const modal = document.getElementById('modal-hrm-staff-days-detail');
        if (modal) modal.classList.add('hidden');
    };

    window.openHrmRulesGuideModal = async function() {
        const modal = document.getElementById('modal-hrm-rules-guide');
        if (modal) modal.classList.remove('hidden');
        const body = document.getElementById('hrm-rules-guide-body');
        if (!body) return;
        try {
            const res = await fetch('/api/hrm/config');
            if (!res.ok) throw new Error('HTTP ' + res.status);
            body.innerHTML = renderHrmRulesGuide(await res.json());
        } catch (e) {
            body.innerHTML = `<div class="text-rose-600">Không tải được cấu hình HRM: ${e.message}</div>`;
        }
    };

    // Render từ hrm_rules + hrm_work_blocks; công thức phải khớp services/payroll_engine.py (classify_day, day_thresholds)
    function renderHrmRulesGuide(cfg) {
        const r = cfg.rules || {};
        const m = v => (Number(v) || 0).toLocaleString('vi-VN') + ' đ';
        const h = min => (Math.round(min / 6) / 10) + 'h';
        const toMin = t => { const [a, b] = String(t || '0:0').split(':').map(Number); return a * 60 + (b || 0); };
        const fullMin = Number(r.full_day_min) || 420, halfMin = Number(r.half_day_min) || 210;
        const probPct = Math.round(parseFloat(r.probation_rate || 0.85) * 100);
        const box = (title, icon, cls, inner) => `
            <div class="p-3 ${cls} rounded-xl border space-y-2">
                <h4 class="font-bold flex items-center gap-1.5 text-xs"><i class="ph ${icon}"></i> ${title}</h4>${inner}</div>`;
        const row = (label, val) => `<div class="flex justify-between items-center gap-2 p-2 bg-white rounded-lg border border-slate-200/80"><span>${label}</span><b class="font-mono text-right">${val}</b></div>`;

        const blocks = (cfg.blocks || []).map(b => {
            const shift = Math.max(0, toMin(b.end_time) - toMin(b.start_time) - (Number(b.lunch_minutes) || 0));
            const full = shift ? Math.min(fullMin, shift) : fullMin;
            const half = Math.min(halfMin, Math.floor(full / 2));
            return row(`<b>${b.name}</b>: ${b.start_time}–${b.end_time}${b.lunch_minutes ? ` (nghỉ trưa ${b.lunch_minutes}p)` : ''} · ${b.off_sunday ? 'nghỉ Chủ Nhật' : `nghỉ ${b.monthly_off_days} ngày/tháng`}`,
                       `1 công ≥ ${h(full)} · 0.5 công ≥ ${h(half)}`);
        }).join('');

        return [
            box('1. Ký hiệu công', 'ph-tag', 'bg-slate-50 border-slate-200', `<div class="space-y-1.5">
                ${row('X / TV', `1 công (TV = thử việc ${probPct}% lương)`)}
                ${row('X/2 / TV/2', '0.5 công: làm đủ ngưỡng nửa công, hoặc nghỉ nửa buổi có phép')}
                ${row('OFF', '0 công, không phạt (nghỉ phép / nghỉ có bù)')}
                ${row('L', `Ngày lễ: cộng thêm ${r.holiday_extra_days ?? 1} ngày lương`)}
                ${row('Miễn chấm công', 'Đủ công mọi ngày làm việc, chỉ trừ ngày nghỉ nhập tay, không phạt, KHÔNG có thưởng chuyên cần')}
                ${row('Làm bù', 'Ngày nghỉ ghi OFF; ngày làm bù (kể cả CN) có quẹt thẻ tự được tính công')}</div>`),
            box('2. Khối ca & ngưỡng tính công', 'ph-alarm', 'bg-slate-50 border-slate-200', `<div class="space-y-1.5">${blocks || '<i>Chưa có khối làm việc</i>'}</div>`),
            box('3. Mức phạt', 'ph-warning', 'bg-rose-50/50 border-rose-200 text-rose-900', `<div class="space-y-1.5">
                ${row(`Vào trễ dưới ${r.late_flat_threshold_min ?? 30} phút`, `${m(r.late_per_min)} / phút`)}
                ${row(`Vào trễ từ ${r.late_flat_threshold_min ?? 30} phút`, `${m(r.late_flat)} / lần`)}
                ${row('Quên quẹt vào hoặc ra', `${m(r.missing_punch)} / lần`)}
                ${row('Vắng không phép', `${m(r.absent)} / ngày`)}
                ${row('Miễn phạt', 'Bật "Không phạt" trên ngày vi phạm có giải trình')}</div>`),
            box('4. Thưởng, tăng ca, tạm ứng', 'ph-gift', 'bg-sky-50/50 border-sky-200 text-sky-900', `<div class="space-y-1.5">
                ${row('Chuyên cần', `${m(r.attendance_bonus)}: có chấm công, đủ công chuẩn, làm trọn tháng, không vi phạm (kể cả về sớm)`)}
                ${row('Sinh nhật', m(r.birthday_bonus))}
                ${row('Tăng ca (gợi ý)', `Ra sau giờ ra của khối ≥ ${r.ot_min_minutes ?? 25} phút, làm tròn 0.5h, hệ số ${r.ot_multiplier ?? 1.5}`)}
                ${row('Tạm ứng', 'Trừ vào tháng phát sinh phiếu ứng')}</div>`),
        ].join('');
    }

    window.closeHrmRulesGuideModal = function() {
        const modal = document.getElementById('modal-hrm-rules-guide');
        if (modal) modal.classList.add('hidden');
    };

    // ── Phiếu Lương Cá Nhân (Modal & Tab) ──
    function canManageAllPayslips() {
        if (typeof Auth === 'undefined' || !Auth.getUser()) return false;
        return Auth.hasRole('owner', 'admin', 'accountant', 'manager') || Auth.can('payroll.manage');
    }

    window.calcMonthAndReloadPayslip = async function(month, staffId, inModal) {
        try {
            const res = await fetch(`/api/hrm/payroll/${month}/calculate`, { method: 'POST' });
            if (!res.ok) {
                const err = await res.json().catch(() => ({}));
                alert(err.detail || 'Lỗi tính bảng lương');
                return;
            }
            if (typeof loadHrmPayroll === 'function' && currentSubTab === 'payroll') loadHrmPayroll(month);
            if (inModal) openHrmPayslipModal(staffId);
            else loadMyPayslip();
        } catch (e) {
            console.error(e);
        }
    };

    window.openHrmPayslipModal = async function(staffId) {
        const month = getSelectedMonth();
        const bodyEl = document.getElementById('hrm-payslip-modal-body');
        const staffSel = document.getElementById('hrm-payslip-modal-staff');
        if (bodyEl) bodyEl.innerHTML = `<div class="text-center py-8 text-slate-400">Đang tải phiếu lương...</div>`;

        const modal = document.getElementById('modal-hrm-payslip');
        if (modal) modal.classList.remove('hidden');

        if (staffSel) {
            if (canManageAllPayslips()) {
                if (!hrmStaffList.length) {
                    try {
                        const r = await fetch('/api/hrm/employees');
                        if (r.ok) hrmStaffList = await r.json();
                    } catch (e) {}
                }
                const list = (hrmStaffList || [])
                    .filter(s => (s.is_active !== 0 && s.contractual_status !== 'Nghỉ việc') || String(s.id) === String(staffId))
                    .sort((a, b) => hrmViCollator.compare(a.employee_code || 'zz', b.employee_code || 'zz') || hrmViCollator.compare(a.name || '', b.name || ''));
                staffSel.innerHTML = list.map(s => `<option value="${s.id}" ${String(s.id) === String(staffId) ? 'selected' : ''}>${escHrmHtml(formatHrmEmpLabel(s))}</option>`).join('');
                staffSel.classList.remove('hidden');
            } else {
                staffSel.classList.add('hidden');
            }
        }

        const editBtn = document.getElementById('btn-hrm-payslip-edit-manual');
        if (editBtn) { editBtn.classList.add('hidden'); editBtn.classList.remove('flex'); }

        try {
            const res = await fetch(`/api/hrm/my-payslip?month=${month}&staff_id=${staffId}`);
            const data = await res.json();
            if (!res.ok || data.status !== 'ok') {
                const calcBtn = canManageAllPayslips()
                    ? `<div class="mt-3"><button type="button" onclick="calcMonthAndReloadPayslip('${month}', ${Number(staffId)}, true)" class="bg-sky-600 hover:bg-sky-700 text-white font-bold px-3.5 py-1.5 rounded-lg text-xs cursor-pointer shadow-xs">⚡ Tính lương tháng ${month.slice(5)}/${month.slice(0, 4)} & Xem ngay</button></div>`
                    : '';
                if (bodyEl) bodyEl.innerHTML = `<div class="p-6 text-center text-rose-600 font-medium">${escHrmHtml(data.message || 'Không tìm thấy phiếu lương')}${calcBtn}</div>`;
                return;
            }
            activePayslipContext = {
                month,
                staffId: data.staff?.id || Number(staffId),
                staffName: data.staff?.name || '',
                staffCode: data.staff?.employee_code || '',
                periodStatus: data.period_status,
                payslip: data.payslip || {}
            };
            if (editBtn && canManageAllPayslips() && data.period_status === 'draft') {
                editBtn.classList.remove('hidden');
                editBtn.classList.add('flex');
            }
            if (bodyEl) bodyEl.innerHTML = renderPayslipCardHTML(data, month);
        } catch (e) {
            console.error(e);
        }
    };

    window.closeHrmPayslipModal = function() {
        const modal = document.getElementById('modal-hrm-payslip');
        if (modal) modal.classList.add('hidden');
    };

    function openPayslipPrintWindow(htmlContent) {
        const win = window.open('', '_blank');
        if (!win) return;
        win.document.write(`
            <html><head><title>Phiếu Lương</title>
            <style>
                body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; padding: 20px; color: #1e293b; font-size: 13px; }
                .card { border: 1px solid #cbd5e1; border-radius: 8px; padding: 12px; margin-bottom: 12px; }
                .row { display: flex; justify-content: space-between; padding: 4px 0; border-bottom: 1px dashed #f1f5f9; }
                .net { font-size: 18px; font-weight: bold; color: #047857; text-align: right; }
                .title { font-size: 16px; font-weight: bold; margin-bottom: 12px; text-align: center; }
                table { width: 100%; border-collapse: collapse; font-size: 11px; margin-top: 8px; }
                th, td { border: 1px solid #cbd5e1; padding: 4px 6px; }
                th { background: #f8fafc; font-weight: bold; text-align: left; }
                .text-center { text-align: center; }
                .text-right { text-align: right; }
                .font-bold { font-weight: bold; }
                @media print { body { padding: 10px; } .page-break { page-break-inside: avoid; } }
            </style>
            </head><body>${htmlContent}</body></html>
        `);
        win.document.close();
        win.print();
    }

    window.printHrmPayslip = function() {
        const bodyEl = document.getElementById('hrm-payslip-modal-body');
        if (bodyEl) openPayslipPrintWindow(bodyEl.innerHTML);
    };

    // ── Tab Phiếu Lương (Nhân viên tự xem & Admin chọn xem toàn bộ nhân viên) ──
    window.initMyPayslipTab = async function() {
        const picker = document.getElementById('my-payslip-month');
        if (picker && !picker.value) {
            const now = new Date();
            picker.value = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
        }
        if (typeof window.syncPosMonthWidget === 'function') window.syncPosMonthWidget('my-payslip-month');
        const adminBox = document.getElementById('my-payslip-admin-staff-box');
        const titleEl = document.getElementById('my-payslip-header-title');
        const staffSel = document.getElementById('my-payslip-staff-id');

        if (canManageAllPayslips()) {
            if (adminBox) adminBox.classList.remove('hidden');
            if (titleEl) titleEl.textContent = 'Tra Cứu Phiếu Lương Nhân Viên';
            const curSelected = staffSel?.value || '';
            const currentUserId = Auth.getUser()?.id || '';
            await initHrmStaffPicker('my-payslip-staff-id', curSelected || currentUserId);
            if (staffSel && !staffSel.value) {
                const list = hrmStaffPickerState['my-payslip-staff-id'] || [];
                if (list.length > 0) {
                    window.selectHrmStaffOption('my-payslip-staff-id', list[0].id);
                    return;
                }
            }
        } else {
            if (adminBox) adminBox.classList.add('hidden');
            if (titleEl) titleEl.textContent = 'Phiếu Lương Của Tôi';
        }
        loadMyPayslip();
    };

    window.loadMyPayslip = async function() {
        const picker = document.getElementById('my-payslip-month');
        const month = picker?.value || getSelectedMonth();
        const contentEl = document.getElementById('my-payslip-content');
        if (!contentEl) return;
        contentEl.innerHTML = `<div class="text-center py-10 text-slate-400 text-xs">Đang nạp phiếu lương...</div>`;

        const isManager = canManageAllPayslips();
        const selectedStaffId = isManager ? (document.getElementById('my-payslip-staff-id')?.value || '') : '';
        const url = `/api/hrm/my-payslip?month=${encodeURIComponent(month)}${selectedStaffId ? '&staff_id=' + encodeURIComponent(selectedStaffId) : ''}`;

        try {
            const res = await fetch(url);
            const data = await res.json();
            if (!res.ok || data.status !== 'ok') {
                const targetIdForCalc = selectedStaffId || (Auth.getUser()?.id || 0);
                const calcBtn = isManager
                    ? `<div class="pt-2"><button type="button" onclick="calcMonthAndReloadPayslip('${month}', ${Number(targetIdForCalc)}, false)" class="bg-sky-600 hover:bg-sky-700 text-white font-bold px-3.5 py-1.5 rounded-lg text-xs cursor-pointer shadow-xs">⚡ Tính lương tháng ${month.slice(5)}/${month.slice(0, 4)} & Xem ngay</button></div>`
                    : '';
                contentEl.innerHTML = `
                    <div class="bg-white p-6 rounded-2xl shadow-xs border text-center space-y-2">
                        <span class="text-3xl">📭</span>
                        <div class="font-bold text-slate-700 text-sm">Chưa Có Phiếu Lương</div>
                        <p class="text-slate-400 text-xs">${escHrmHtml(data.message || 'Chưa có bảng lương được tính cho tháng này.')}</p>
                        ${calcBtn}
                    </div>
                `;
                return;
            }
            activePayslipContext = {
                month,
                staffId: data.staff?.id || Number(selectedStaffId || Auth.getUser()?.id || 0),
                staffName: data.staff?.name || '',
                staffCode: data.staff?.employee_code || '',
                periodStatus: data.period_status,
                payslip: data.payslip || {}
            };
            contentEl.innerHTML = renderPayslipCardHTML(data, month);
        } catch (e) {
            console.error(e);
        }
    };

    window.printMyPayslip = function() {
        const contentEl = document.getElementById('my-payslip-content');
        if (contentEl) openPayslipPrintWindow(contentEl.innerHTML);
    };

    function renderPayslipCardHTML(data, month) {
        const s = data.staff || {};
        const p = data.payslip || {};
        const statusMap = {
            'draft': '<span class="px-2.5 py-0.5 rounded-full text-xs font-bold bg-amber-100 text-amber-800">TẠM TÍNH</span>',
            'locked': '<span class="px-2.5 py-0.5 rounded-full text-xs font-bold bg-sky-100 text-sky-800">ĐÃ CHỐT</span>',
            'paid': '<span class="px-2.5 py-0.5 rounded-full text-xs font-bold bg-emerald-100 text-emerald-800">ĐÃ CHI TRẢ</span>'
        };

        const f = num => (num || 0).toLocaleString('vi-VN') + ' đ';

        const dayRows = (p.days || []).map(d => {
            const dInfo = parseVnIsoDate(d.date);
            const dow = dInfo.dayOfWeek;
            const isSun = dInfo.isSun;

            let viols = [];
            (d.violations || []).forEach(v => {
                if (v === 'late') viols.push(`Trễ ${d.late_min}p`);
                else if (v === 'early') viols.push(`Về sớm ${d.early_min}p`);
                else if (v === 'missing_in') viols.push(`Quên vào`);
                else if (v === 'missing_out') viols.push(`Quên ra`);
                else if (v === 'absent') viols.push(`Vắng`);
            });

            const workedStr = d.worked_min > 0 ? (d.worked_min / 60).toFixed(1) + 'h' : '—';
            const penStr = d.penalty > 0 ? `-${d.penalty.toLocaleString('vi-VN')} đ` : (d.waived ? '0 đ' : '—');
            const statusPen = d.waived
                ? '<span class="text-emerald-700 font-bold bg-emerald-50 px-1 py-0.5 rounded border border-emerald-200">Đã miễn phạt</span>'
                : (d.penalty > 0
                    ? '<span class="text-rose-700 font-bold bg-rose-50 px-1 py-0.5 rounded border border-rose-200">Đã phạt</span>'
                    : '<span class="text-slate-400">Không vi phạm</span>');

            return `
                <tr class="${isSun ? 'bg-slate-50 font-medium' : ''}">
                    <td class="p-1.5 font-mono font-bold whitespace-nowrap">${dInfo.formatted}</td>
                    <td class="p-1.5 text-center font-bold ${isSun ? 'text-rose-600' : 'text-slate-600'}">${dow}</td>
                    <td class="p-1.5 text-center font-mono">${d.check_in || '—'}</td>
                    <td class="p-1.5 text-center font-mono">${d.check_out || '—'}</td>
                    <td class="p-1.5 text-right font-mono">${workedStr}</td>
                    <td class="p-1.5 text-right ${d.late_min > 0 ? 'text-rose-600 font-bold' : 'text-slate-400'}">${d.late_min > 0 ? d.late_min + 'p' : '—'}</td>
                    <td class="p-1.5 text-slate-700">${viols.join(', ') || 'Đúng giờ'}</td>
                    <td class="p-1.5 text-right font-mono font-bold ${d.penalty > 0 ? 'text-rose-600' : 'text-slate-500'}">${penStr}</td>
                    <td class="p-1.5 text-center font-bold text-slate-800">${d.code || '—'}</td>
                    <td class="p-1.5 text-center text-xs">${statusPen}</td>
                </tr>
            `;
        }).join('');

        const mItems = Array.isArray(p.manual_items) ? p.manual_items : [];
        const fuelItems = mItems.filter(it => it.type === 'fuel' && Number(it.amount) > 0);
        const bonusItems = mItems.filter(it => it.type === 'bonus' && Number(it.amount) > 0);
        const deductItems = mItems.filter(it => it.type === 'deduction' && Number(it.amount) > 0);
        const canEditDraft = canManageAllPayslips() && data.period_status === 'draft';

        const fuelHtml = fuelItems.length
            ? fuelItems.map(it => `<div class="flex justify-between text-slate-600"><span>+ ${escHrmHtml(it.label)}:</span><span class="font-mono font-bold text-sky-700">${f(it.amount)}</span></div>`).join('')
            : (p.fuel_other ? `<div class="flex justify-between text-slate-600"><span>Phụ cấp khác:</span><span class="font-mono font-bold text-slate-800">${f(p.fuel_other)}</span></div>` : '');
        const bonusHtml = bonusItems.length
            ? bonusItems.map(it => `<div class="flex justify-between text-slate-600"><span>+ ${escHrmHtml(it.label)}:</span><span class="font-mono font-bold text-emerald-700">+${f(it.amount)}</span></div>`).join('')
            : (p.bonus_other ? `<div class="flex justify-between text-slate-600"><span>Thưởng khác:</span><span class="font-mono font-bold text-emerald-700">${f(p.bonus_other)}</span></div>` : '');
        const deductHtml = deductItems.length
            ? deductItems.map(it => `<div class="flex justify-between text-slate-600"><span>- ${escHrmHtml(it.label)}:</span><span class="font-mono font-bold text-rose-600">-${f(it.amount)}</span></div>`).join('')
            : (p.deduction_other ? `<div class="flex justify-between text-slate-600"><span>Giảm trừ khác:</span><span class="font-mono font-bold text-rose-600">-${f(p.deduction_other)}</span></div>` : '');

        return `
            <div class="space-y-3 text-xs">
                <!-- Thẻ Thông Tin Nhân Viên -->
                <div class="bg-white p-4 rounded-2xl shadow-xs border border-slate-200/80 flex items-center justify-between">
                    <div>
                        <div class="font-bold text-slate-800 text-sm flex items-center gap-2">
                            <span>${s.name}</span>
                            <span class="text-xs font-mono text-sky-600 bg-sky-50 px-2 py-0.5 rounded-md font-bold">${s.employee_code || 'NV' + s.id}</span>
                        </div>
                        <div class="text-xs text-slate-500 mt-1">Khối: <span class="font-bold text-slate-700">${s.block_name || p.block || '--'}</span> | Chức vụ: <span class="font-bold text-slate-700">${s.role || '--'}</span></div>
                    </div>
                    <div class="text-right">
                        ${statusMap[data.period_status] || ''}
                        <div class="text-xs text-slate-400 mt-1">Tháng ${month.slice(5)}/${month.slice(0,4)}</div>
                    </div>
                </div>

                <!-- Thẻ Thu Nhập -->
                <div class="bg-white p-4 rounded-2xl shadow-xs border border-slate-200/80 space-y-2">
                    <div class="flex items-center justify-between border-b pb-1">
                        <h4 class="font-bold text-emerald-800 uppercase text-xs flex items-center gap-1">
                            <span>💰</span> I. Các Khoản Thu Nhập
                        </h4>
                        ${canEditDraft ? `<button type="button" onclick="openHrmManualItemsModal(${Number(s.id)}, 'bonus', '${month}')" class="px-2 py-0.5 rounded bg-emerald-50 hover:bg-emerald-100 text-emerald-700 border border-emerald-200 font-bold text-xs cursor-pointer">+ Thưởng / Phụ cấp khác</button>` : ''}
                    </div>
                    <div class="space-y-1.5 pt-1">
                        <div class="flex justify-between text-slate-600"><span>Lương cơ bản:</span><span class="font-mono font-bold text-slate-800">${f(p.base_salary)}</span></div>
                        <div class="flex justify-between text-slate-600"><span>Công chuẩn / Ngày làm việc:</span><span class="font-bold text-slate-800">${p.days_official || 0} CT + ${p.days_probation || 0} TV / ${p.std_days || 0} chuẩn</span></div>
                        <div class="flex justify-between text-slate-600"><span>Lương theo ngày công:</span><span class="font-mono font-bold text-slate-800">${f(p.pay_days)}</span></div>
                        <div class="flex justify-between text-slate-600"><span>Phụ cấp ăn trưa / xăng:</span><span class="font-mono font-bold text-slate-800">${f(p.allowance)}</span></div>
                        ${fuelHtml}
                        ${p.holiday_pay ? `<div class="flex justify-between text-slate-600"><span>Lương ngày lễ:</span><span class="font-mono font-bold text-slate-800">${f(p.holiday_pay)}</span></div>` : ''}
                        ${p.commission ? `<div class="flex justify-between text-slate-600"><span>Hoa hồng bán lẻ:</span><span class="font-mono font-bold text-sky-700">${f(p.commission)}</span></div>` : ''}
                        ${p.spa_commission ? `<div class="flex justify-between text-slate-600"><span>Hoa hồng Spa / Dịch vụ:</span><span class="font-mono font-bold text-sky-700">${f(p.spa_commission)}</span></div>` : ''}
                        ${p.tips ? `<div class="flex justify-between text-slate-600"><span>Tiền Tip khách cho:</span><span class="font-mono font-bold text-sky-700">${f(p.tips)}</span></div>` : ''}
                        ${p.attendance_bonus ? `<div class="flex justify-between text-slate-600"><span>Thưởng chuyên cần:</span><span class="font-mono font-bold text-emerald-700">${f(p.attendance_bonus)}</span></div>` : ''}
                        ${p.birthday_bonus ? `<div class="flex justify-between text-slate-600"><span>Thưởng sinh nhật:</span><span class="font-mono font-bold text-emerald-700">${f(p.birthday_bonus)}</span></div>` : ''}
                        ${bonusHtml}
                        ${p.ot_pay ? `<div class="flex justify-between text-slate-600"><span>Tiền tăng ca OT:</span><span class="font-mono font-bold text-amber-700">${f(p.ot_pay)}</span></div>` : ''}
                    </div>
                </div>

                <!-- Thẻ Giảm Trừ -->
                <div class="bg-white p-4 rounded-2xl shadow-xs border border-slate-200/80 space-y-2">
                    <div class="flex items-center justify-between border-b pb-1">
                        <h4 class="font-bold text-rose-800 uppercase text-xs flex items-center gap-1">
                            <span>🔻</span> II. Các Khoản Giảm Trừ
                        </h4>
                        ${canEditDraft ? `<button type="button" onclick="openHrmManualItemsModal(${Number(s.id)}, 'deduction', '${month}')" class="px-2 py-0.5 rounded bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 font-bold text-xs cursor-pointer">+ Giảm trừ khác</button>` : ''}
                    </div>
                    <div class="space-y-1.5 pt-1">
                        <div class="flex justify-between text-slate-600"><span>Phạt trễ & quên quẹt:</span><span class="font-mono font-bold text-rose-600">-${f(p.penalties)}</span></div>
                        <div class="flex justify-between text-slate-600"><span>Tạm ứng trong tháng:</span><span class="font-mono font-bold text-rose-600">-${f(p.advances)}</span></div>
                        ${deductHtml}
                    </div>
                </div>

                <!-- Thẻ Thực Lãnh Net -->
                <div class="bg-slate-50 border border-emerald-200 p-4 rounded-2xl shadow-xs flex items-center justify-between">
                    <div>
                        <div class="font-bold text-emerald-900 text-xs uppercase">III. Thực Lãnh Net</div>
                        <div class="text-xs text-emerald-700 mt-0.5">${p.cashbook_code ? `Đã chi: ${p.cashbook_code}` : 'Chưa giải ngân'}</div>
                    </div>
                    <div class="text-right">
                        <div class="font-mono font-bold text-xl text-emerald-700">${(p.net_pay || p.net_rounded || 0).toLocaleString('vi-VN')} đ</div>
                    </div>
                </div>

                <!-- Thẻ IV: Bảng Chi Tiết 30/31 Ngày Chấm Công (Minh Bạch Phạt Trễ) -->
                <div class="bg-white p-4 rounded-2xl shadow-xs border border-slate-200/80 space-y-2">
                    <div class="flex items-center justify-between border-b pb-1">
                        <h4 class="font-bold text-slate-800 uppercase text-xs flex items-center gap-1">
                            <span>⏱️</span> IV. Bảng Chi Tiết 30/31 Ngày Chấm Công & Đi Trễ Trong Tháng
                        </h4>
                        <span class="text-xs text-slate-400 font-medium">Toàn bộ các ngày trong kỳ lương</span>
                    </div>
                    <div class="border border-slate-200 rounded-xl overflow-x-auto max-h-[350px]">
                        <table class="w-full text-left border-collapse text-xs">
                            <thead class="bg-slate-50 text-slate-700 font-bold sticky top-0 border-b border-slate-200">
                                <tr>
                                    <th class="p-1.5">Ngày</th>
                                    <th class="p-1.5 text-center">Thứ</th>
                                    <th class="p-1.5 text-center">Vào</th>
                                    <th class="p-1.5 text-center">Ra</th>
                                    <th class="p-1.5 text-right">Làm việc</th>
                                    <th class="p-1.5 text-right">Trễ</th>
                                    <th class="p-1.5">Vi phạm</th>
                                    <th class="p-1.5 text-right text-rose-600">Tiền phạt</th>
                                    <th class="p-1.5 text-center">Công</th>
                                    <th class="p-1.5 text-center">Xử lý phạt</th>
                                </tr>
                            </thead>
                            <tbody class="divide-y divide-slate-100">
                                ${dayRows || '<tr><td colspan="10" class="p-4 text-center text-slate-400">Chưa có chi tiết ngày công</td></tr>'}
                            </tbody>
                        </table>
                    </div>
                </div>

                ${p.manual_note ? `
                    <div class="bg-slate-50 border border-slate-200/80 p-3 rounded-xl text-xs text-slate-600">
                        <span class="font-bold text-slate-700">Ghi chú / Giải trình:</span> ${p.manual_note}
                    </div>
                ` : ''}
            </div>
        `;
    }

    // ── Hồ Sơ Nhân Sự Lương (Staff Profiles — 29 Cột + Sticky Left + Popover Ẩn/Hiện) ──
    let hrmStaffList = [];
    let hrmBlocksMap = {};
    const STAFF_COL_STORAGE_KEY = 'hrm_staff_visible_cols_v1';
    const STAFF_COLUMNS = [
        { key: 'employee_code', label: 'Mã NV', fixed: true, thCls: 'p-2.5 whitespace-nowrap w-[72px] min-w-[72px] sticky left-0 z-30 bg-slate-50' },
        { key: 'name', label: 'Họ và Tên', fixed: true, thCls: 'p-2.5 whitespace-nowrap min-w-[185px] sticky left-[72px] z-30 bg-slate-50 border-r-2 border-slate-200 shadow-[3px_0_5px_-2px_rgba(15,23,42,0.08)]' },
        { key: 'device_code', label: 'Mã máy CC', defaultOn: true, thCls: 'p-2.5 text-center whitespace-nowrap' },
        { key: 'phone', label: 'SĐT', defaultOn: true, thCls: 'p-2.5 whitespace-nowrap' },
        { key: 'department', label: 'Bộ phận', defaultOn: true, thCls: 'p-2.5 whitespace-nowrap' },
        { key: 'position', label: 'Vị trí', defaultOn: true, thCls: 'p-2.5 whitespace-nowrap' },
        { key: 'block_name', label: 'Khối ca', defaultOn: true, thCls: 'p-2.5 whitespace-nowrap' },
        { key: 'attendance_mode', label: 'Chế độ CC/WFH', defaultOn: true, thCls: 'p-2.5 text-center whitespace-nowrap' },
        { key: 'hire_date', label: 'Ngày vào làm', defaultOn: true, thCls: 'p-2.5 text-center whitespace-nowrap' },
        { key: 'official_date', label: 'Ngày chính thức', defaultOn: true, thCls: 'p-2.5 text-center whitespace-nowrap' },
        { key: 'tenure', label: 'Thâm niên', defaultOn: true, thCls: 'p-2.5 text-center whitespace-nowrap' },
        { key: 'contractual_status', label: 'Tình trạng HĐ', defaultOn: true, thCls: 'p-2.5 text-center whitespace-nowrap' },
        { key: 'base_salary', label: 'Lương gốc', defaultOn: true, thCls: 'p-2.5 text-right whitespace-nowrap' },
        { key: 'total_base_delta', label: 'Đ/C lương', defaultOn: true, thCls: 'p-2.5 text-center whitespace-nowrap' },
        { key: 'base_salary_effective', label: 'Lương CB hiện tại', defaultOn: true, thCls: 'p-2.5 text-right whitespace-nowrap text-emerald-700' },
        { key: 'allowance_effective', label: 'Phụ cấp', defaultOn: true, thCls: 'p-2.5 text-right whitespace-nowrap' },
        { key: 'total_salary', label: 'Tổng lương', defaultOn: true, thCls: 'p-2.5 text-right whitespace-nowrap text-sky-700' },
        { key: 'bank_name', label: 'Ngân hàng', defaultOn: true, thCls: 'p-2.5 whitespace-nowrap' },
        { key: 'bank_account', label: 'Số TK', defaultOn: true, thCls: 'p-2.5 whitespace-nowrap' },
        { key: 'bank_branch', label: 'Chi nhánh NH', defaultOn: false, thCls: 'p-2.5 whitespace-nowrap' },
        { key: 'gender', label: 'Giới tính', defaultOn: false, thCls: 'p-2.5 text-center whitespace-nowrap' },
        { key: 'birthday', label: 'Ngày sinh', defaultOn: false, thCls: 'p-2.5 text-center whitespace-nowrap' },
        { key: 'email', label: 'Email', defaultOn: false, thCls: 'p-2.5 whitespace-nowrap' },
        { key: 'id_card_number', label: 'CCCD', defaultOn: false, thCls: 'p-2.5 whitespace-nowrap' },
        { key: 'contract_number', label: 'Số HĐLĐ', defaultOn: false, thCls: 'p-2.5 whitespace-nowrap' },
        { key: 'address', label: 'Địa chỉ', defaultOn: false, thCls: 'p-2.5 whitespace-nowrap' },
        { key: 'emergency', label: 'Liên hệ khẩn cấp', defaultOn: false, thCls: 'p-2.5 whitespace-nowrap' },
        { key: 'account', label: 'TK Đăng nhập', defaultOn: true, thCls: 'p-2.5 text-center whitespace-nowrap' },
        { key: 'actions', label: 'Thao tác', fixed: true, thCls: 'p-2.5 text-center whitespace-nowrap' }
    ];

    let staffColsVis = (() => {
        const def = {};
        STAFF_COLUMNS.forEach(c => { if (!c.fixed) def[c.key] = c.defaultOn !== false; });
        try {
            const raw = localStorage.getItem(STAFF_COL_STORAGE_KEY);
            if (raw) Object.assign(def, JSON.parse(raw));
        } catch (_) {}
        return def;
    })();
    let staffColsLoadedFromServer = false;

    function isStaffColVisible(col) {
        return col.fixed ? true : staffColsVis[col.key] !== false;
    }

    function syncStaffColsBadgeAndPopover() {
        const toggleable = STAFF_COLUMNS.filter(c => !c.fixed);
        const onCount = toggleable.filter(c => isStaffColVisible(c)).length;
        const badge = document.getElementById('hrm-staff-cols-badge');
        if (badge) badge.textContent = `${onCount}/${toggleable.length}`;
        const listEl = document.getElementById('hrm-staff-cols-list');
        if (listEl) {
            listEl.innerHTML = toggleable.map(c => `
                <label class="flex items-center gap-1.5 px-2 py-1 rounded hover:bg-slate-50 cursor-pointer select-none">
                    <input type="checkbox" ${isStaffColVisible(c) ? 'checked' : ''} onchange="toggleStaffColumn('${c.key}', this.checked)" class="rounded text-sky-600 cursor-pointer">
                    <span class="truncate text-slate-700">${escHrmHtml(c.label)}</span>
                </label>
            `).join('');
        }
    }

    async function persistStaffColumns() {
        try { localStorage.setItem(STAFF_COL_STORAGE_KEY, JSON.stringify(staffColsVis)); } catch (_) {}
        try {
            await fetch('/api/hrm/staff-columns', {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ columns: staffColsVis })
            });
        } catch (_) {}
    }

    window.toggleStaffColumnsPopover = function(e) {
        if (e) e.stopPropagation();
        const pop = document.getElementById('hrm-staff-cols-popover');
        if (!pop) return;
        syncStaffColsBadgeAndPopover();
        pop.classList.toggle('hidden');
    };

    document.addEventListener('click', () => {
        const pop = document.getElementById('hrm-staff-cols-popover');
        if (pop && !pop.classList.contains('hidden')) pop.classList.add('hidden');
    });

    window.toggleStaffColumn = function(colKey, checked) {
        staffColsVis[colKey] = Boolean(checked);
        syncStaffColsBadgeAndPopover();
        persistStaffColumns();
        filterHrmStaffTable();
    };

    window.applyStaffColsPreset = function(mode) {
        STAFF_COLUMNS.forEach(c => {
            if (c.fixed) return;
            staffColsVis[c.key] = mode === 'all' ? true : (c.defaultOn !== false);
        });
        syncStaffColsBadgeAndPopover();
        persistStaffColumns();
        filterHrmStaffTable();
    };

    async function loadHrmStaff() {
        const tbody = document.getElementById('table-hrm-staff');
        const visLen = STAFF_COLUMNS.filter(c => isStaffColVisible(c)).length;
        if (tbody) tbody.innerHTML = `<tr><td colspan="${visLen}" class="p-6 text-center text-slate-400">Đang nạp danh sách nhân sự...</td></tr>`;
        if (!staffColsLoadedFromServer) {
            staffColsLoadedFromServer = true;
            fetch('/api/hrm/staff-columns').then(r => r.ok ? r.json() : null).then(cfg => {
                if (cfg && cfg.columns && typeof cfg.columns === 'object') {
                    Object.assign(staffColsVis, cfg.columns);
                    try { localStorage.setItem(STAFF_COL_STORAGE_KEY, JSON.stringify(staffColsVis)); } catch (_) {}
                    syncStaffColsBadgeAndPopover();
                    filterHrmStaffTable();
                }
            }).catch(() => {});
        }
        syncStaffColsBadgeAndPopover();
        try {
            const [resStaff, resCfg] = await Promise.all([
                fetch('/api/hrm/employees'),
                fetch('/api/hrm/config')
            ]);
            if (!resStaff.ok) return;
            hrmStaffList = await resStaff.json();
            if (resCfg.ok) {
                const cfg = await resCfg.json();
                hrmBlocksMap = {};
                (cfg.blocks || []).forEach(b => { hrmBlocksMap[b.id] = b; });
                const blockFilter = document.getElementById('hrm-staff-filter-block');
                if (blockFilter) {
                    const curVal = blockFilter.value;
                    blockFilter.innerHTML = '<option value="">-- Tất cả khối làm việc --</option>' +
                        (cfg.blocks || []).map(b => `<option value="${b.id}" ${curVal == b.id ? 'selected' : ''}>${b.name}</option>`).join('');
                }
            }
            updateHrmStaffFilterPills();
            filterHrmStaffTable();
        } catch (e) {
            console.error("Lỗi nạp danh sách nhân sự:", e);
        }
    }
    window.loadHrmStaff = loadHrmStaff;

    let hrmStaffStatusFilter = 'active'; // 'active' | 'resigned' | 'all'

    function setHrmStaffStatusFilter(status) {
        hrmStaffStatusFilter = status;
        const btnAct = document.getElementById('btn-hrm-filter-active');
        const btnRes = document.getElementById('btn-hrm-filter-resigned');
        const btnAll = document.getElementById('btn-hrm-filter-all');
        const activeCls = 'px-2.5 py-1 rounded-md text-emerald-700 bg-white shadow-xs font-bold transition';
        const inactCls = 'px-2.5 py-1 rounded-md text-slate-600 hover:text-slate-900 transition';

        if (btnAct) btnAct.className = (status === 'active' ? activeCls : inactCls);
        if (btnRes) btnRes.className = (status === 'resigned' ? activeCls : inactCls);
        if (btnAll) btnAll.className = (status === 'all' ? activeCls : inactCls);

        filterHrmStaffTable();
    }
    window.setHrmStaffStatusFilter = setHrmStaffStatusFilter;

    function updateHrmStaffFilterPills() {
        const activeCount = hrmStaffList.filter(s => s.is_active !== 0 && s.contractual_status !== 'Nghỉ việc').length;
        const resignedCount = hrmStaffList.filter(s => s.is_active === 0 || s.contractual_status === 'Nghỉ việc').length;
        const allCount = hrmStaffList.length;

        const btnAct = document.getElementById('btn-hrm-filter-active');
        const btnRes = document.getElementById('btn-hrm-filter-resigned');
        const btnAll = document.getElementById('btn-hrm-filter-all');

        if (btnAct) btnAct.innerHTML = `Đang làm việc (${activeCount})`;
        if (btnRes) btnRes.innerHTML = `Đã nghỉ việc (${resignedCount})`;
        if (btnAll) btnAll.innerHTML = `Tất cả (${allCount})`;
    }

    function filterHrmStaffTable() {
        const q = (document.getElementById('hrm-staff-search')?.value || '').trim();
        const blockId = document.getElementById('hrm-staff-filter-block')?.value;
        const filtered = hrmStaffList.filter(s => {
            const isResigned = (s.is_active === 0 || s.contractual_status === 'Nghỉ việc');
            if (hrmStaffStatusFilter === 'active' && isResigned) return false;
            if (hrmStaffStatusFilter === 'resigned' && !isResigned) return false;

            const hay = `${s.employee_code || ''} ${s.device_code || ''} ${s.name || ''} ${s.phone || ''} ${s.department || ''} ${s.position || ''} ${s.bank_account || ''} ${s.bank_name || ''} ${s.id_card_number || ''}`;
            const matchQ = !q || matchHrmQuery(q, hay);
            const matchBlock = !blockId || s.work_block_id == blockId;
            return matchQ && matchBlock;
        });
        renderHrmStaffTable(filtered);
    }
    window.filterHrmStaffTable = filterHrmStaffTable;

    function renderHrmStaffTable(list) {
        const thead = document.getElementById('table-hrm-staff-head');
        const tbody = document.getElementById('table-hrm-staff');
        if (!tbody) return;
        const visCols = STAFF_COLUMNS.filter(c => isStaffColVisible(c));
        syncStaffColsBadgeAndPopover();
        if (thead) {
            thead.innerHTML = `<tr>${visCols.map(c => `<th data-scol="${c.key}" class="${c.thCls}">${escHrmHtml(c.label)}</th>`).join('')}</tr>`;
        }
        if (!list || list.length === 0) {
            tbody.innerHTML = `<tr><td colspan="${visCols.length}" class="p-6 text-center text-slate-400">Không tìm thấy nhân viên nào phù hợp.</td></tr>`;
            return;
        }

        const fMoney = v => v ? Number(v).toLocaleString('vi-VN') + ' đ' : '0 đ';

        tbody.innerHTML = list.map(r => {
            const hasAcc = Boolean(r.has_account);
            const block = hrmBlocksMap[r.work_block_id];
            const blockBadge = (block || r.block_name)
                ? `<span class="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-xs font-bold bg-slate-100 text-slate-700 whitespace-nowrap">${escHrmHtml(block ? block.name : r.block_name)}</span>`
                : `<span class="text-slate-400 text-xs">Chưa xếp</span>`;

            const accountBadge = hasAcc
                ? `<span class="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-xs font-mono font-bold bg-sky-50 text-sky-700 border border-sky-200 whitespace-nowrap">${escHrmHtml(r.username)}</span>`
                : `<button onclick="openHrmQuickAccountModal(${r.id}, '${(r.name||'').replace(/'/g, "\\'")}', '${r.employee_code||''}')" class="px-1.5 py-0.5 bg-amber-50 hover:bg-amber-100 text-amber-800 border border-amber-300 rounded text-xs font-bold cursor-pointer transition shadow-2xs whitespace-nowrap" title="Cấp tài khoản đăng nhập (Phím tắt: F4)">Cấp TK</button>`;

            const cStatus = r.contractual_status || (!r.official_date || (new Date(r.official_date) > new Date()) ? 'Thử việc' : 'Chính thức');
            const contractBadge = cStatus === 'Chính thức'
                ? `<span class="px-1.5 py-0.5 rounded text-xs font-bold bg-emerald-100 text-emerald-800 whitespace-nowrap">Chính thức</span>`
                : cStatus === 'Thử việc'
                ? `<span class="px-1.5 py-0.5 rounded text-xs font-bold bg-amber-100 text-amber-800 whitespace-nowrap">Thử việc</span>`
                : `<span class="px-1.5 py-0.5 rounded text-xs font-bold bg-slate-100 text-slate-600 whitespace-nowrap">Nghỉ việc</span>`;

            const baseDelta = Number(r.total_base_delta || 0);
            const deltaBadge = baseDelta > 0
                ? `<button onclick="filterHrmAdjByStaff(${r.id})" class="px-1.5 py-0.5 rounded text-xs font-mono font-bold bg-emerald-100 text-emerald-800 hover:bg-emerald-200 cursor-pointer whitespace-nowrap" title="Xem lịch sử điều chỉnh">+${baseDelta.toLocaleString('vi-VN')} đ</button>`
                : baseDelta < 0
                ? `<button onclick="filterHrmAdjByStaff(${r.id})" class="px-1.5 py-0.5 rounded text-xs font-mono font-bold bg-rose-100 text-rose-800 hover:bg-rose-200 cursor-pointer whitespace-nowrap" title="Xem lịch sử điều chỉnh">${baseDelta.toLocaleString('vi-VN')} đ</button>`
                : `<span class="text-slate-300 font-mono text-xs">0 đ</span>`;

            const isResigned = (r.is_active === 0 || r.contractual_status === 'Nghỉ việc');
            const stickyBgCls = isResigned ? 'bg-slate-50 group-hover:bg-slate-100' : 'bg-white group-hover:bg-slate-50';
            const rowClass = isResigned
                ? 'group hover:bg-slate-100 transition border-t border-slate-200 bg-slate-50/70 opacity-65 hover:opacity-100'
                : 'group hover:bg-slate-50 transition border-t border-slate-100';

            const baseOrig = Number(r.base_salary || 0);
            const is85Kpi = baseOrig > 0 && Math.round(baseOrig / 0.85 / 1000) * 1000 === 6500000;
            const kpiSalaryNote = is85Kpi ? `<div class="text-[10px] text-amber-700 font-semibold">Nền 85% KPI (Đạt: 6.500.000 đ)</div>` : '';

            const attBadges = [];
            if (r.is_attendance_exempt) attBadges.push(`<span class="px-1.5 py-0.5 rounded text-xs font-bold bg-sky-50 text-sky-700 border border-sky-200">Miễn CC</span>`);
            if (r.allow_remote_checkin) attBadges.push(`<span class="px-1.5 py-0.5 rounded text-xs font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">WFH</span>`);
            if (!attBadges.length) attBadges.push(`<span class="text-slate-500 text-xs">Vân tay</span>`);

            const renderStaffCell = col => {
                switch (col.key) {
                    case 'employee_code':
                        return `<td class="p-2.5 font-mono font-bold text-sky-700 whitespace-nowrap w-[72px] min-w-[72px] sticky left-0 z-10 ${stickyBgCls}">${escHrmHtml(r.employee_code || '—')}</td>`;
                    case 'name':
                        return `<td class="p-2.5 whitespace-nowrap min-w-[185px] sticky left-[72px] z-10 border-r-2 border-slate-200 shadow-[3px_0_5px_-2px_rgba(15,23,42,0.06)] ${stickyBgCls}">
                            <div class="font-bold text-slate-800 text-xs ${isResigned ? 'line-through text-slate-500' : ''}">${escHrmHtml(r.name)}</div>
                            <div class="text-xs text-slate-500 flex items-center gap-1.5 mt-0.5 flex-wrap">
                                ${r.is_spa_worker ? `<span class="bg-sky-50 text-sky-700 px-1 rounded font-bold">Thợ Spa</span>` : ''}
                                ${isResigned && r.leave_date ? `<span class="bg-rose-50 text-rose-700 px-1 rounded font-bold">Nghỉ: ${fmtVnDate(r.leave_date)}</span>` : ''}
                            </div>
                        </td>`;
                    case 'device_code':
                        return `<td class="p-2.5 text-center font-mono font-bold ${r.device_code ? 'text-slate-700' : 'text-slate-300'} whitespace-nowrap">${escHrmHtml(r.device_code || '—')}</td>`;
                    case 'phone':
                        return `<td class="p-2.5 font-mono text-slate-700 whitespace-nowrap">${escHrmHtml(r.phone || '—')}</td>`;
                    case 'department':
                        return `<td class="p-2.5 text-slate-700 whitespace-nowrap">${escHrmHtml(r.department || '—')}</td>`;
                    case 'position':
                        return `<td class="p-2.5 text-slate-600 whitespace-nowrap">${escHrmHtml(r.position || '—')}</td>`;
                    case 'block_name':
                        return `<td class="p-2.5 whitespace-nowrap">${blockBadge}</td>`;
                    case 'attendance_mode':
                        return `<td class="p-2.5 text-center whitespace-nowrap">${attBadges.join(' ')}</td>`;
                    case 'hire_date':
                        return `<td class="p-2.5 text-center font-mono text-slate-700 whitespace-nowrap">${fmtVnDate(r.hire_date)}</td>`;
                    case 'official_date':
                        return `<td class="p-2.5 text-center font-mono text-slate-700 whitespace-nowrap">${fmtVnDate(r.official_date)}</td>`;
                    case 'tenure':
                        return `<td class="p-2.5 text-center font-semibold text-slate-700 text-xs whitespace-nowrap">${escHrmHtml(r.tenure || '—')}</td>`;
                    case 'contractual_status':
                        return `<td class="p-2.5 text-center whitespace-nowrap">${contractBadge}</td>`;
                    case 'base_salary':
                        return `<td class="p-2.5 text-right font-mono text-slate-600 whitespace-nowrap">${fMoney(r.base_salary)}${kpiSalaryNote}</td>`;
                    case 'total_base_delta':
                        return `<td class="p-2.5 text-center whitespace-nowrap">${deltaBadge}</td>`;
                    case 'base_salary_effective':
                        return `<td class="p-2.5 text-right font-mono font-bold text-emerald-700 whitespace-nowrap">${fMoney(r.base_salary_effective || r.base_salary)}</td>`;
                    case 'allowance_effective':
                        return `<td class="p-2.5 text-right font-mono font-bold text-slate-700 whitespace-nowrap">${fMoney(r.allowance_effective !== undefined ? r.allowance_effective : r.allowance)}</td>`;
                    case 'total_salary':
                        return `<td class="p-2.5 text-right font-mono font-bold text-sky-700 whitespace-nowrap">${fMoney(r.total_salary || ((r.base_salary_effective || r.base_salary || 0) + (r.allowance_effective || r.allowance || 0)))}</td>`;
                    case 'bank_name':
                        return `<td class="p-2.5 text-slate-700 whitespace-nowrap">${escHrmHtml(r.bank_name || '—')}</td>`;
                    case 'bank_account':
                        return `<td class="p-2.5 font-mono font-semibold text-slate-800 whitespace-nowrap">${escHrmHtml(r.bank_account || '—')}</td>`;
                    case 'bank_branch':
                        return `<td class="p-2.5 text-slate-600 whitespace-nowrap">${escHrmHtml(r.bank_branch || '—')}</td>`;
                    case 'gender':
                        return `<td class="p-2.5 text-center text-slate-600 whitespace-nowrap">${escHrmHtml(r.gender || '—')}</td>`;
                    case 'birthday':
                        return `<td class="p-2.5 text-center font-mono text-slate-600 whitespace-nowrap">${fmtVnDate(r.birthday)}</td>`;
                    case 'email':
                        return `<td class="p-2.5 text-slate-600 whitespace-nowrap">${escHrmHtml(r.email || '—')}</td>`;
                    case 'id_card_number':
                        return `<td class="p-2.5 font-mono text-slate-700 whitespace-nowrap">${escHrmHtml(r.id_card_number || '—')}</td>`;
                    case 'contract_number':
                        return `<td class="p-2.5 font-mono text-slate-600 whitespace-nowrap">${escHrmHtml(r.contract_number || '—')}</td>`;
                    case 'address':
                        return `<td class="p-2.5 text-slate-600 max-w-[220px] truncate" title="${escHrmHtml(r.temporary_address || r.permanent_address || '')}">${escHrmHtml(r.temporary_address || r.permanent_address || '—')}</td>`;
                    case 'emergency':
                        return `<td class="p-2.5 text-slate-600 whitespace-nowrap">${escHrmHtml([r.emergency_phone, r.emergency_relation].filter(Boolean).join(' · ') || '—')}</td>`;
                    case 'account':
                        return `<td class="p-2.5 text-center whitespace-nowrap">${accountBadge}</td>`;
                    case 'actions':
                        return `<td class="p-2.5 text-center whitespace-nowrap">
                            ${!isResigned ? `<button onclick="toggleHrmStaffWfh(${r.id}, ${r.allow_remote_checkin ? 0 : 1})" class="px-1.5 py-1 ${r.allow_remote_checkin ? 'bg-emerald-600 text-white hover:bg-emerald-700' : 'bg-slate-100 text-slate-600 hover:bg-emerald-50 hover:text-emerald-700'} rounded text-xs font-bold cursor-pointer mr-1" title="Bật/tắt cho phép tự chấm công làm ở nhà trên Tác Nhân AI">WFH</button>` : ''}
                            <button onclick="openHrmPayslipModal(${r.id})" class="px-1.5 py-1 bg-sky-50 text-sky-700 hover:bg-sky-100 rounded text-xs font-bold cursor-pointer mr-1" title="Xem phiếu lương">Lương</button>
                            <button onclick="openHrmStaffModal(${r.id})" class="px-2 py-1 bg-emerald-50 text-emerald-700 hover:bg-emerald-100 rounded text-xs font-bold cursor-pointer mr-1" title="Sửa hồ sơ">Sửa</button>
                            <button onclick="openHrmAdjustmentModal(${r.id})" class="px-1.5 py-1 bg-sky-50 text-sky-700 hover:bg-sky-100 rounded text-xs font-bold cursor-pointer mr-1" title="Tạo điều chỉnh lương">Đ/C</button>
                            ${isResigned
                                ? `<button onclick="confirmHrmStaffRestore(${r.id}, '${(r.name||'').replace(/'/g, "\\'")}')" class="px-2 py-1 bg-sky-50 text-sky-700 hover:bg-sky-100 border border-sky-200 rounded text-xs font-bold cursor-pointer mr-1" title="Khôi phục nhân sự đi làm lại">Đi làm lại</button>`
                                : `<button onclick="confirmHrmStaffResign(${r.id}, '${(r.name||'').replace(/'/g, "\\'")}')" class="px-2 py-1 bg-rose-50 text-rose-700 hover:bg-rose-100 border border-rose-200 rounded text-xs font-bold cursor-pointer mr-1" title="Đánh dấu nghỉ việc (khóa tài khoản)">Nghỉ việc</button>`
                            }
                            ${!hasAcc && !isResigned ? `<button onclick="openHrmQuickAccountModal(${r.id}, '${(r.name||'').replace(/'/g, "\\'")}', '${r.employee_code||''}')" class="px-1.5 py-1 bg-sky-50 text-sky-700 hover:bg-sky-100 rounded text-xs font-bold cursor-pointer mr-1" title="Cấp tài khoản POS">Cấp TK</button>` : ''}
                            ${r.id !== 1 && (r.username || '').toLowerCase() !== 'admin' ? `<button onclick="confirmHrmStaffDelete(${r.id}, '${(r.name||'').replace(/'/g, "\\'")}')" class="px-1.5 py-1 bg-rose-50 text-rose-700 hover:bg-rose-100 border border-rose-200 rounded text-xs font-bold cursor-pointer" title="Xóa vĩnh viễn nhân sự">Xóa</button>` : ''}
                        </td>`;
                    default:
                        return `<td class="p-2.5"></td>`;
                }
            };

            return `<tr class="${rowClass}">${visCols.map(renderStaffCell).join('')}</tr>`;
        }).join('');
    }

    window.confirmHrmStaffResign = async function(staffId, staffName) {
        const todayStr = new Date().toISOString().split('T')[0];
        const confirmed = typeof window.showConfirmModal === 'function'
            ? await window.showConfirmModal({
                title: 'Xác Nhận Nghỉ Việc',
                message: `Bạn có chắc muốn chuyển nhân sự "${staffName}" sang trạng thái Nghỉ việc? Tài khoản đăng nhập (nếu có) sẽ tự động bị khóa và nhân sự được ẩn khỏi bảng làm việc hàng ngày.`,
                type: 'warning',
                confirmText: '🛑 Nghỉ việc',
                cancelText: 'Hủy bỏ',
                icon: '🛑'
            })
            : confirm(`Xác nhận chuyển nhân sự "${staffName}" sang trạng thái Nghỉ việc?\nTài khoản đăng nhập sẽ tự động bị khóa.`);

        if (!confirmed) return;

        try {
            const res = await fetch(`/api/hrm/employees/${staffId}/resign`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ leave_date: todayStr })
            });
            const data = await res.json();
            if (res.ok) {
                window.invalidateHrmStaffCache();
                if (typeof showToast === 'function') showToast(data.message || 'Đã chuyển sang trạng thái nghỉ việc', 'success');
                loadHrmStaff();
                if (typeof loadStaffList === 'function') loadStaffList();
            } else {
                alert(data.detail || 'Lỗi khi thao tác');
            }
        } catch (e) {
            console.error(e);
            alert('Không thể kết nối máy chủ');
        }
    };

    window.confirmHrmStaffRestore = async function(staffId, staffName) {
        const confirmed = typeof window.showConfirmModal === 'function'
            ? await window.showConfirmModal({
                title: 'Khôi Phục Nhân Sự',
                message: `Khôi phục nhân sự "${staffName}" trở lại làm việc?`,
                type: 'primary',
                confirmText: '↩️ Đi làm lại',
                cancelText: 'Hủy bỏ',
                icon: '↩️'
            })
            : confirm(`Khôi phục nhân sự "${staffName}" trở lại làm việc?`);

        if (!confirmed) return;

        try {
            const res = await fetch(`/api/hrm/employees/${staffId}/rehire`, {
                method: 'POST'
            });
            const data = await res.json();
            if (res.ok) {
                window.invalidateHrmStaffCache();
                if (typeof showToast === 'function') showToast(data.message || 'Đã khôi phục nhân sự', 'success');
                loadHrmStaff();
                if (typeof loadStaffList === 'function') loadStaffList();
            } else {
                alert(data.detail || 'Lỗi khi thao tác');
            }
        } catch (e) {
            console.error(e);
            alert('Không thể kết nối máy chủ');
        }
    };

    window.invalidateHrmStaffCache = function() {
        hrmStaffList = [];
        Object.keys(hrmStaffPickerState).forEach(k => delete hrmStaffPickerState[k]);
    };

    window.toggleHrmStaffWfh = async function(staffId, enableVal) {
        try {
            const res = await fetch(`/api/hrm/employees/${staffId}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ allow_remote_checkin: enableVal ? 1 : 0 })
            });
            const data = await res.json();
            if (!res.ok) {
                alert(data.detail || 'Không thể cập nhật quyền chấm công làm ở nhà');
                return;
            }
            if (typeof showToast === 'function') {
                showToast(enableVal ? 'Đã bật Chấm công làm ở nhà (WFH) trên Tác Nhân AI' : 'Đã tắt Chấm công làm ở nhà (WFH)', 'success');
            }
            loadHrmStaff();
        } catch (e) {
            alert('Lỗi kết nối máy chủ');
        }
    };

    window.confirmHrmStaffDelete = async function(staffId, staffName) {
        const confirmed = typeof window.showConfirmModal === 'function'
            ? await window.showConfirmModal({
                title: 'Xóa Vĩnh Viễn Nhân Sự',
                message: `Bạn có chắc chắn muốn xóa nhân sự "${staffName}" khỏi hệ thống? Thao tác này không thể hoàn tác.`,
                type: 'danger',
                confirmText: '🗑️ Xóa vĩnh viễn',
                cancelText: 'Hủy bỏ',
                icon: '🗑️'
            })
            : confirm(`Bạn có chắc chắn muốn xóa vĩnh viễn nhân sự "${staffName}"?`);

        if (!confirmed) return;

        try {
            const res = await fetch(`/api/hrm/employees/${staffId}`, {
                method: 'DELETE'
            });
            const data = await res.json().catch(() => ({}));
            if (res.ok) {
                window.invalidateHrmStaffCache();
                if (typeof showToast === 'function') showToast(data.message || `Đã xóa nhân sự ${staffName}`, 'success');
                loadHrmStaff();
                if (typeof loadStaffList === 'function') loadStaffList();
            } else {
                alert(data.detail || `Lỗi khi xóa nhân sự (HTTP ${res.status})`);
            }
        } catch (e) {
            console.error(e);
            alert('Không thể kết nối máy chủ');
        }
    };

    // Modal Hồ sơ Nhân sự 3 Tab
    window.switchHrmModalTab = function(tabNum) {
        [1, 2, 3].forEach(n => {
            const panel = document.getElementById(`hrm-modal-panel-${n}`);
            const btn = document.getElementById(`btn-hrm-modal-tab-${n}`);
            if (panel) panel.classList.toggle('hidden', n !== tabNum);
            if (btn) {
                if (n === tabNum) {
                    btn.className = "flex-1 py-1.5 rounded-md bg-white text-emerald-700 shadow-xs font-bold";
                } else {
                    btn.className = "flex-1 py-1.5 rounded-md text-slate-600 hover:text-slate-900";
                }
            }
        });
    };

    window.openHrmStaffModal = async function(id) {
        switchHrmModalTab(1);
        document.getElementById('modal-hrm-staff-title').textContent = id ? "Chỉnh Sửa Hồ Sơ Nhân Sự Lương" : "Thêm Nhân Sự Lương Mới (F3)";
        document.getElementById('hrm-staff-id').value = id || '';
        document.getElementById('hrm-staff-name').value = '';
        document.getElementById('hrm-staff-phone').value = '';
        document.getElementById('hrm-staff-employee-code').value = '';
        document.getElementById('hrm-staff-device-code').value = '';
        document.getElementById('hrm-staff-department').value = '';
        document.getElementById('hrm-staff-position').value = '';
        document.getElementById('hrm-staff-base-salary').value = '';
        document.getElementById('hrm-staff-allowance').value = '';
        document.getElementById('hrm-staff-allowance-effective').textContent = '';
        document.getElementById('hrm-staff-is-attendance-exempt').checked = false;
        const wfhElReset = document.getElementById('hrm-staff-allow-remote-checkin');
        if (wfhElReset) wfhElReset.checked = false;
        document.getElementById('hrm-staff-hire-date').value = '';
        document.getElementById('hrm-staff-probation-start').value = '';
        document.getElementById('hrm-staff-official-date').value = '';
        document.getElementById('hrm-staff-leave-date').value = '';
        document.getElementById('hrm-staff-commission-rate').value = 0;
        document.getElementById('hrm-staff-is-spa').checked = false;

        // Contract & Insurance
        document.getElementById('hrm-staff-has-contract').checked = false;
        toggleContractFields(false);
        document.getElementById('hrm-staff-contract-number').value = '';
        document.getElementById('hrm-staff-contract-type').value = 'Có thời hạn';
        document.getElementById('hrm-staff-dependents-count').value = 0;
        document.getElementById('hrm-staff-insurance-salary').value = '';
        document.getElementById('hrm-staff-is-insurance-exempt').checked = false;

        // Tab 2
        document.getElementById('hrm-staff-gender').value = 'Nam';
        document.getElementById('hrm-staff-birthday').value = '';
        document.getElementById('hrm-staff-id-card-number').value = '';
        document.getElementById('hrm-staff-id-card-date').value = '';
        document.getElementById('hrm-staff-id-card-place').value = '';
        document.getElementById('hrm-staff-email').value = '';
        document.getElementById('hrm-staff-permanent-address').value = '';
        document.getElementById('hrm-staff-temporary-address').value = '';

        // Tab 3
        document.getElementById('hrm-staff-bank-name').value = '';
        document.getElementById('hrm-staff-bank-account').value = '';
        document.getElementById('hrm-staff-bank-branch').value = '';
        document.getElementById('hrm-staff-emergency-phone').value = '';
        document.getElementById('hrm-staff-emergency-relation').value = '';

        // Load blocks dropdown
        const blockSel = document.getElementById('hrm-staff-work-block-id');
        if (blockSel) {
            try {
                const res = await fetch('/api/hrm/config');
                if (res.ok) {
                    const cfg = await res.json();
                    blockSel.innerHTML = '<option value="">-- Chọn khối làm việc --</option>' +
                        (cfg.blocks || []).map(b => `<option value="${b.id}">${b.name} (${b.start_time}-${b.end_time})</option>`).join('');
                }
            } catch (e) { console.error(e); }
        }

        if (id) {
            const s = (hrmStaffList || []).find(x => x.id === id);
            if (s) {
                document.getElementById('hrm-staff-name').value = s.name || '';
                document.getElementById('hrm-staff-phone').value = s.phone || '';
                document.getElementById('hrm-staff-employee-code').value = s.employee_code || '';
                document.getElementById('hrm-staff-device-code').value = s.device_code || '';
                document.getElementById('hrm-staff-work-block-id').value = s.work_block_id || '';
                document.getElementById('hrm-staff-department').value = s.department || '';
                document.getElementById('hrm-staff-position').value = s.position || '';
                document.getElementById('hrm-staff-base-salary').value = s.base_salary ? Number(s.base_salary).toLocaleString('vi-VN') : '';
                document.getElementById('hrm-staff-allowance').value = s.allowance ? Number(s.allowance).toLocaleString('vi-VN') : '';
                // Phụ cấp thật = gốc + quyết định điều chỉnh (tab Điều chỉnh lương); ô trên chỉ là phần gốc
                const allowEff = Number(s.allowance_effective ?? s.allowance ?? 0);
                document.getElementById('hrm-staff-allowance-effective').textContent =
                    allowEff !== Number(s.allowance || 0) ? `Đang hưởng: ${allowEff.toLocaleString('vi-VN')} đ (gồm điều chỉnh)` : '';
                document.getElementById('hrm-staff-is-attendance-exempt').checked = Boolean(s.is_attendance_exempt);
                const wfhEl = document.getElementById('hrm-staff-allow-remote-checkin');
                if (wfhEl) wfhEl.checked = Boolean(s.allow_remote_checkin);
                document.getElementById('hrm-staff-hire-date').value = s.hire_date || '';
                document.getElementById('hrm-staff-probation-start').value = s.probation_start || '';
                document.getElementById('hrm-staff-official-date').value = s.official_date || '';
                document.getElementById('hrm-staff-leave-date').value = s.leave_date || '';
                document.getElementById('hrm-staff-commission-rate').value = s.commission_rate || 0;
                document.getElementById('hrm-staff-is-spa').checked = Boolean(s.is_spa_worker);

                // Contract & Insurance
                const hasCont = Boolean(s.has_contract);
                document.getElementById('hrm-staff-has-contract').checked = hasCont;
                toggleContractFields(hasCont);
                document.getElementById('hrm-staff-contract-number').value = s.contract_number || '';
                document.getElementById('hrm-staff-contract-type').value = s.contract_type || 'Có thời hạn';
                document.getElementById('hrm-staff-dependents-count').value = s.dependents_count || 0;
                document.getElementById('hrm-staff-insurance-salary').value = s.insurance_salary ? Number(s.insurance_salary).toLocaleString('vi-VN') : '';
                document.getElementById('hrm-staff-is-insurance-exempt').checked = Boolean(s.is_insurance_exempt);

                // Tab 2
                document.getElementById('hrm-staff-gender').value = s.gender || 'Nam';
                document.getElementById('hrm-staff-birthday').value = s.birthday || '';
                document.getElementById('hrm-staff-id-card-number').value = s.id_card_number || '';
                document.getElementById('hrm-staff-id-card-date').value = s.id_card_date || '';
                document.getElementById('hrm-staff-id-card-place').value = s.id_card_place || '';
                document.getElementById('hrm-staff-email').value = s.email || '';
                document.getElementById('hrm-staff-permanent-address').value = s.permanent_address || '';
                document.getElementById('hrm-staff-temporary-address').value = s.temporary_address || '';

                // Tab 3
                document.getElementById('hrm-staff-bank-name').value = s.bank_name || '';
                document.getElementById('hrm-staff-bank-account').value = s.bank_account || '';
                document.getElementById('hrm-staff-bank-branch').value = s.bank_branch || '';
                document.getElementById('hrm-staff-emergency-phone').value = s.emergency_phone || '';
                document.getElementById('hrm-staff-emergency-relation').value = s.emergency_relation || '';
            }
        }

        const modal = document.getElementById('modal-hrm-staff-profile');
        if (modal) modal.classList.remove('hidden');
        setTimeout(() => document.getElementById('hrm-staff-name')?.focus(), 100);
    };

    window.closeHrmStaffModal = function() {
        const modal = document.getElementById('modal-hrm-staff-profile');
        if (modal) modal.classList.add('hidden');
    };

    window.submitHrmStaffProfile = async function() {
        const id = document.getElementById('hrm-staff-id')?.value;
        const name = document.getElementById('hrm-staff-name')?.value.trim();
        const phone = document.getElementById('hrm-staff-phone')?.value.trim();
        const empCode = document.getElementById('hrm-staff-employee-code')?.value.trim();
        const devCode = document.getElementById('hrm-staff-device-code')?.value.trim();
        const blockId = parseInt(document.getElementById('hrm-staff-work-block-id')?.value) || null;

        const parseVal = elId => {
            const val = document.getElementById(elId)?.value;
            return typeof parseMoneyInput === 'function' ? parseMoneyInput(val) : (parseFloat((val || '').replace(/\D/g, '')) || 0);
        };

        if (!name) { alert("Vui lòng nhập họ và tên nhân viên"); return; }
        if (!blockId) { alert("Vui lòng chọn khối làm việc & ca chuẩn cho nhân viên"); return; }

        const payload = {
            name: name,
            phone: phone,
            employee_code: empCode || null,
            device_code: devCode || null,
            work_block_id: blockId,
            department: document.getElementById('hrm-staff-department')?.value.trim() || null,
            position: document.getElementById('hrm-staff-position')?.value.trim() || null,
            base_salary: parseVal('hrm-staff-base-salary'),
            allowance: parseVal('hrm-staff-allowance'),
            hire_date: document.getElementById('hrm-staff-hire-date')?.value || null,
            probation_start: document.getElementById('hrm-staff-probation-start')?.value || null,
            official_date: document.getElementById('hrm-staff-official-date')?.value || null,
            leave_date: document.getElementById('hrm-staff-leave-date')?.value || null,
            commission_rate: parseFloat(document.getElementById('hrm-staff-commission-rate')?.value) || 0,
            is_spa_worker: document.getElementById('hrm-staff-is-spa')?.checked ? 1 : 0,
            is_attendance_exempt: document.getElementById('hrm-staff-is-attendance-exempt')?.checked ? 1 : 0,
            allow_remote_checkin: document.getElementById('hrm-staff-allow-remote-checkin')?.checked ? 1 : 0,

            // Contract & Insurance
            has_contract: document.getElementById('hrm-staff-has-contract')?.checked ? 1 : 0,
            contract_number: document.getElementById('hrm-staff-contract-number')?.value.trim() || null,
            contract_type: document.getElementById('hrm-staff-contract-type')?.value || 'Có thời hạn',
            dependents_count: parseInt(document.getElementById('hrm-staff-dependents-count')?.value) || 0,
            insurance_salary: parseVal('hrm-staff-insurance-salary'),
            is_insurance_exempt: document.getElementById('hrm-staff-is-insurance-exempt')?.checked ? 1 : 0,

            // Tab 2
            gender: document.getElementById('hrm-staff-gender')?.value || 'Nam',
            birthday: document.getElementById('hrm-staff-birthday')?.value || null,
            id_card_number: document.getElementById('hrm-staff-id-card-number')?.value.trim() || null,
            id_card_date: document.getElementById('hrm-staff-id-card-date')?.value || null,
            id_card_place: document.getElementById('hrm-staff-id-card-place')?.value.trim() || null,
            email: document.getElementById('hrm-staff-email')?.value.trim() || null,
            permanent_address: document.getElementById('hrm-staff-permanent-address')?.value.trim() || null,
            temporary_address: document.getElementById('hrm-staff-temporary-address')?.value.trim() || null,

            // Tab 3
            bank_name: document.getElementById('hrm-staff-bank-name')?.value.trim() || null,
            bank_account: document.getElementById('hrm-staff-bank-account')?.value.trim() || null,
            bank_branch: document.getElementById('hrm-staff-bank-branch')?.value.trim() || null,
            emergency_phone: document.getElementById('hrm-staff-emergency-phone')?.value.trim() || null,
            emergency_relation: document.getElementById('hrm-staff-emergency-relation')?.value.trim() || null
        };

        try {
            const url = id ? `/api/hrm/employees/${id}` : '/api/hrm/employees';
            const method = id ? 'PUT' : 'POST';
            const res = await fetch(url, {
                method: method,
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });
            const data = await res.json();
            if (!res.ok) {
                alert(data.detail || "Lỗi lưu hồ sơ nhân sự");
                return;
            }
            if (window.showToast) window.showToast("Đã lưu hồ sơ nhân sự thành công", "success");
            closeHrmStaffModal();
            loadHrmStaff();
        } catch (e) {
            console.error(e);
        }
    };

    // ── Phân Hệ: Điều Chỉnh Lương & Phụ Cấp ──
    let hrmAdjustmentsList = [];
    let activeAdjFilterStaffId = '';
    let adjLoadSeq = 0;

    window.onHrmAdjStaffFilterChange = function(val) {
        activeAdjFilterStaffId = String(val || '');
        filterHrmAdjustmentsTable();
    };

    window.loadHrmSalaryAdjustments = async function() {
        const seq = ++adjLoadSeq;
        const tbody = document.getElementById('table-hrm-adjustments');
        const staffFilter = document.getElementById('hrm-adj-filter-staff');
        if (staffFilter && staffFilter.options.length > 1 && activeAdjFilterStaffId === '' && staffFilter.value) {
            activeAdjFilterStaffId = String(staffFilter.value);
        }

        if (tbody) tbody.innerHTML = `<tr><td colspan="10" class="p-6 text-center text-slate-400">Đang tải danh sách quyết định điều chỉnh lương...</td></tr>`;

        const onlyPeriod = document.getElementById('hrm-adj-only-period')?.checked;
        const adjUrl = onlyPeriod ? `/api/hrm/adjustments?${getHrmQueryPeriodParams().qs}` : '/api/hrm/adjustments';

        try {
            const [resAdj, resStaff] = await Promise.all([
                fetch(adjUrl),
                fetch('/api/hrm/employees')
            ]);
            if (seq !== adjLoadSeq || !resAdj.ok) return;
            hrmAdjustmentsList = await resAdj.json();

            if (resStaff.ok) {
                hrmStaffList = await resStaff.json();
            }

            // Cập nhật bộ lọc nhân viên (chỉ nhân sự đang làm việc + nhân sự có lịch sử điều chỉnh)
            if (staffFilter) {
                const desiredVal = activeAdjFilterStaffId;
                const adjStaffIds = new Set((hrmAdjustmentsList || []).map(a => String(a.staff_id)));
                const optionMap = new Map();
                (hrmStaffList || []).forEach(s => {
                    const sid = String(s.id);
                    const isActive = s.is_active !== 0 && s.contractual_status !== 'Nghỉ việc';
                    if (isActive || adjStaffIds.has(sid) || sid === desiredVal) {
                        optionMap.set(sid, { id: sid, employee_code: s.employee_code || '', name: s.name || `NV #${sid}` });
                    }
                });
                (hrmAdjustmentsList || []).forEach(a => {
                    const sid = String(a.staff_id);
                    if (!optionMap.has(sid)) {
                        optionMap.set(sid, { id: sid, employee_code: a.employee_code || '', name: a.staff_name || `NV #${sid}` });
                    }
                });
                const sortedOpts = Array.from(optionMap.values()).sort((a, b) => {
                    const ca = (a.employee_code || '').trim();
                    const cb = (b.employee_code || '').trim();
                    if (ca && !cb) return -1;
                    if (!ca && cb) return 1;
                    if (ca && cb && ca !== cb) return hrmViCollator.compare(ca, cb);
                    return hrmViCollator.compare(a.name || '', b.name || '');
                });
                staffFilter.innerHTML = '<option value="">-- Tất cả nhân viên --</option>' +
                    sortedOpts.map(s => `<option value="${s.id}">${escHrmHtml(formatHrmEmpLabel(s))}</option>`).join('');
                activeAdjFilterStaffId = (desiredVal && optionMap.has(desiredVal)) ? desiredVal : '';
                staffFilter.value = activeAdjFilterStaffId;
            }

            filterHrmAdjustmentsTable();
        } catch (e) {
            console.error("Lỗi tải quyết định điều chỉnh lương:", e);
        }
    };

    function renderHrmAdjustmentsTable(list) {
        const tbody = document.getElementById('table-hrm-adjustments');
        const tfoot = document.getElementById('table-hrm-adjustments-foot');
        if (!tbody) return;
        if (!list || list.length === 0) {
            tbody.innerHTML = `<tr><td colspan="10" class="p-6 text-center text-slate-400">Chưa có quyết định điều chỉnh lương nào.</td></tr>`;
            if (tfoot) tfoot.innerHTML = '';
            return;
        }

        const fMoney = v => {
            const n = Number(v || 0);
            if (n === 0) return '—';
            return (n > 0 ? '+' : '') + n.toLocaleString('vi-VN') + ' đ';
        };

        const renderRow = r => {
            const bDelta = Number(r.base_delta || 0);
            const aDelta = Number(r.allowance_delta || 0);
            const typeBadge = r.adjustment_type === 'salary'
                ? '<span class="px-2 py-0.5 rounded text-xs font-bold bg-sky-50 text-sky-700 border border-sky-200">Lương</span>'
                : r.adjustment_type === 'allowance'
                ? '<span class="px-2 py-0.5 rounded text-xs font-bold bg-amber-50 text-amber-700 border border-amber-200">Phụ cấp</span>'
                : '<span class="px-2 py-0.5 rounded text-xs font-bold bg-sky-50 text-sky-700 border border-sky-200">Cả hai</span>';

            const deptText = [r.block_name, r.department, r.position].filter(Boolean).join(' • ') || '—';

            return `
                <tr class="hover:bg-slate-50 transition border-t border-slate-100">
                    <td class="p-2.5 font-mono text-xs text-slate-700 whitespace-nowrap">${fmtVnDate(r.decision_date || r.effective_date, true)}</td>
                    <td class="p-2.5 whitespace-nowrap">
                        <div class="font-bold text-slate-800 text-xs">${escHrmHtml(r.staff_name || '—')}</div>
                        <div class="text-xs text-sky-700 font-mono font-bold mt-0.5">${escHrmHtml(r.employee_code || '')}</div>
                    </td>
                    <td class="p-2.5 text-slate-600 text-xs">${escHrmHtml(deptText)}</td>
                    <td class="p-2.5 text-center">${typeBadge}</td>
                    <td class="p-2.5 text-right font-mono font-bold ${bDelta > 0 ? 'text-emerald-700' : bDelta < 0 ? 'text-rose-700' : 'text-slate-400'}">${fMoney(bDelta)}</td>
                    <td class="p-2.5 text-right font-mono font-bold ${aDelta > 0 ? 'text-emerald-700' : aDelta < 0 ? 'text-rose-700' : 'text-slate-400'}">${fMoney(aDelta)}</td>
                    <td class="p-2.5 text-center font-mono font-bold text-emerald-700 text-xs whitespace-nowrap">${fmtVnDate(r.effective_date, true)}</td>
                    <td class="p-2.5 text-slate-700 text-xs">${escHrmHtml(r.reason || '—')}</td>
                    <td class="p-2.5 text-center text-slate-500 text-xs">${escHrmHtml(r.created_by || 'Hệ thống')}</td>
                    <td class="p-2.5 text-center">
                        <button onclick="deleteHrmAdjustment(${r.id})" class="px-2 py-1 bg-rose-50 text-rose-700 hover:bg-rose-100 rounded text-xs font-bold cursor-pointer" title="Xóa quyết định">Xóa</button>
                    </td>
                </tr>
            `;
        };

        const groups = groupRowsByStaff(list);
        if (hrmSubTableGroupMode === 'grouped') {
            tbody.innerHTML = groups.map(g => {
                const sumB = g.rows.reduce((s, r) => s + Number(r.base_delta || 0), 0);
                const sumA = g.rows.reduce((s, r) => s + Number(r.allowance_delta || 0), 0);
                const codePrefix = g.employee_code ? `[${escHrmHtml(g.employee_code)}] ` : '';
                return `
                    <tr class="bg-sky-50/90 border-y border-sky-200 font-bold text-sky-950">
                        <td colspan="4" class="p-2">${codePrefix}${escHrmHtml(g.staff_name)} <span class="text-slate-500 font-semibold">· ${escHrmHtml(g.meta)} (${g.rows.length} QĐ)</span></td>
                        <td class="p-2 text-right font-mono ${sumB >= 0 ? 'text-emerald-700' : 'text-rose-700'}">${fMoney(sumB)}</td>
                        <td class="p-2 text-right font-mono ${sumA >= 0 ? 'text-emerald-700' : 'text-rose-700'}">${fMoney(sumA)}</td>
                        <td colspan="4"></td>
                    </tr>
                    ${g.rows.map(renderRow).join('')}
                `;
            }).join('');
        } else {
            tbody.innerHTML = list.map(renderRow).join('');
        }

        const grandB = list.reduce((s, r) => s + Number(r.base_delta || 0), 0);
        const grandA = list.reduce((s, r) => s + Number(r.allowance_delta || 0), 0);
        if (tfoot) {
            tfoot.innerHTML = `
                <tr>
                    <td colspan="4" class="p-2.5 uppercase text-slate-700">Tổng cộng (${groups.length} nhân viên · ${list.length} quyết định):</td>
                    <td class="p-2.5 text-right font-mono ${grandB >= 0 ? 'text-emerald-700' : 'text-rose-700'}">${fMoney(grandB)}</td>
                    <td class="p-2.5 text-right font-mono ${grandA >= 0 ? 'text-emerald-700' : 'text-rose-700'}">${fMoney(grandA)}</td>
                    <td colspan="4"></td>
                </tr>
            `;
        }
    }

    window.filterHrmAdjustmentsTable = function() {
        const q = (document.getElementById('hrm-adj-search')?.value || '').trim();
        const domVal = document.getElementById('hrm-adj-filter-staff')?.value || '';
        const staffId = domVal || activeAdjFilterStaffId;
        const filtered = (hrmAdjustmentsList || []).filter(a => {
            const matchQ = !q || matchHrmQuery(q, `${a.employee_code || ''} ${a.staff_name || ''} ${a.reason || ''} ${a.department || ''} ${a.position || ''}`);
            const matchStaff = !staffId || String(a.staff_id) === String(staffId);
            return matchQ && matchStaff;
        });
        renderHrmAdjustmentsTable(filtered);
    };

    window.filterHrmAdjByStaff = function(staffId) {
        activeAdjFilterStaffId = staffId != null ? String(staffId) : '';
        switchHrmSubTab('adjustments');
    };

    window.openHrmAdjustmentModal = async function(staffId) {
        await initHrmStaffPicker('hrm-adj-staff-id', staffId || '');

        const today = new Date().toISOString().slice(0, 10);
        document.getElementById('hrm-adj-decision-date').value = today;
        document.getElementById('hrm-adj-effective-date').value = today;
        document.getElementById('hrm-adj-type').value = 'salary';
        document.getElementById('hrm-adj-base-delta').value = '';
        document.getElementById('hrm-adj-allowance-delta').value = '';
        document.getElementById('hrm-adj-reason').value = '';

        const modal = document.getElementById('modal-hrm-salary-adjustment');
        if (modal) modal.classList.remove('hidden');
    };

    window.closeHrmAdjustmentModal = function() {
        const modal = document.getElementById('modal-hrm-salary-adjustment');
        if (modal) modal.classList.add('hidden');
    };

    window.submitHrmAdjustment = async function() {
        const staffId = document.getElementById('hrm-adj-staff-id')?.value;
        const decDate = document.getElementById('hrm-adj-decision-date')?.value || null;
        const effDate = document.getElementById('hrm-adj-effective-date')?.value;
        const adjType = document.getElementById('hrm-adj-type')?.value || 'salary';
        const reason = document.getElementById('hrm-adj-reason')?.value.trim();

        const parseSignedVal = elId => {
            const raw = (document.getElementById(elId)?.value || '').trim();
            if (!raw) return 0;
            const isNegative = raw.startsWith('-');
            const digits = raw.replace(/\D/g, '');
            const num = parseFloat(digits) || 0;
            return isNegative ? -num : num;
        };

        const baseDelta = parseSignedVal('hrm-adj-base-delta');
        const allowanceDelta = parseSignedVal('hrm-adj-allowance-delta');

        if (!staffId) { alert("Vui lòng chọn nhân viên"); return; }
        if (!effDate) { alert("Vui lòng chọn ngày áp dụng"); return; }
        if (baseDelta === 0 && allowanceDelta === 0) { alert("Vui lòng nhập số tiền điều chỉnh lương hoặc phụ cấp"); return; }
        if (!reason) { alert("Vui lòng nhập lý do / căn cứ quyết định"); return; }

        const payload = {
            decision_date: decDate,
            effective_date: effDate,
            adjustment_type: adjType,
            base_delta: baseDelta,
            allowance_delta: allowanceDelta,
            reason: reason
        };

        try {
            const res = await fetch(`/api/hrm/employees/${staffId}/adjustments`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });
            const data = await res.json();
            if (!res.ok) {
                alert(data.detail || "Lỗi tạo quyết định điều chỉnh");
                return;
            }
            if (window.showToast) window.showToast("Đã tạo quyết định điều chỉnh lương thành công", "success");
            closeHrmAdjustmentModal();
            loadHrmSalaryAdjustments();
            loadHrmStaff();
        } catch (e) {
            console.error(e);
        }
    };

    window.deleteHrmAdjustment = async function(id) {
        if (!confirm("Bạn có chắc chắn muốn xóa quyết định điều chỉnh lương này?")) return;
        try {
            const res = await fetch(`/api/hrm/adjustments/${id}`, { method: 'DELETE' });
            const data = await res.json();
            if (!res.ok) {
                alert(data.detail || "Không thể xóa quyết định");
                return;
            }
            if (window.showToast) window.showToast("Đã xóa quyết định điều chỉnh thành công", "success");
            loadHrmSalaryAdjustments();
            loadHrmStaff();
        } catch (e) {
            console.error(e);
        }
    };

    // ── Cấp Nhanh Tài Khoản (Quick Account) & Import Google Sheet ──
    function normalizePhoneUsername(phone, empCode, staffName) {
        const digits = String(phone || '').replace(/\.0$/, '').replace(/\D/g, '');
        if (digits.length === 9 && '35789'.includes(digits[0])) {
            return '0' + digits;
        }
        if (digits.length >= 9) {
            return digits;
        }
        if (empCode) {
            return String(empCode).toLowerCase().replace(/[^a-z0-9]/g, '');
        }
        return String(staffName || '').toLowerCase()
            .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
            .replace(/đ/g, "d").replace(/[^a-z0-9]/g, "");
    }
    window.normalizePhoneUsername = normalizePhoneUsername;

    function syncAllStaffViewsAfterChange() {
        loadHrmStaff();
        if (typeof window.loadStaffList === 'function') window.loadStaffList();
        if (typeof window.populateStaffPermSelect === 'function') window.populateStaffPermSelect();
    }

    window.openHrmQuickAccountModal = function(staffId, staffName, empCode) {
        let staffObj = (hrmStaffList || []).find(s => s.id === staffId);
        if (!staffId) {
            const candidate = (hrmStaffList || []).find(s => !s.has_account && s.is_active !== 0);
            if (candidate) {
                staffObj = candidate;
                staffId = candidate.id;
                staffName = candidate.name;
                empCode = candidate.employee_code;
            } else {
                alert("Tất cả nhân sự đang làm việc đều đã có tài khoản đăng nhập!");
                return;
            }
        }

        document.getElementById('hrm-acc-staff-id').value = staffId;
        document.getElementById('hrm-acc-staff-name').textContent = `${staffName} (${empCode || 'NV' + staffId})`;

        const suggestedUname = normalizePhoneUsername(staffObj ? staffObj.phone : '', empCode, staffName);
        document.getElementById('hrm-acc-username').value = suggestedUname;
        document.getElementById('hrm-acc-password').value = '123456';
        document.getElementById('hrm-acc-role').value = 'staff';

        const modal = document.getElementById('modal-hrm-quick-account');
        if (modal) modal.classList.remove('hidden');
        setTimeout(() => document.getElementById('hrm-acc-username')?.focus(), 100);
    };

    window.closeHrmQuickAccountModal = function() {
        const modal = document.getElementById('modal-hrm-quick-account');
        if (modal) modal.classList.add('hidden');
    };

    window.submitHrmQuickAccount = async function() {
        const staffId = document.getElementById('hrm-acc-staff-id')?.value;
        const username = document.getElementById('hrm-acc-username')?.value.trim();
        const password = document.getElementById('hrm-acc-password')?.value.trim();
        const role = document.getElementById('hrm-acc-role')?.value || 'staff';

        if (!staffId) return;
        if (!username) { alert("Vui lòng nhập tên đăng nhập (Username)"); return; }
        if (!password || password.length < 6) { alert("Mật khẩu phải từ 6 ký tự trở lên"); return; }

        try {
            const res = await fetch(`/api/hrm/employees/${staffId}/quick-account`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ username, password, role })
            });
            const data = await res.json();
            if (!res.ok) {
                alert(data.detail || "Lỗi cấp tài khoản");
                return;
            }
            if (window.showToast) window.showToast(data.message || "Đã cấp tài khoản thành công", "success");
            closeHrmQuickAccountModal();
            syncAllStaffViewsAfterChange();
        } catch (e) {
            console.error(e);
        }
    };

    // ── Import Hồ Sơ Nhân Sự & Điều Chỉnh Lương Từ Google Sheet ──
    window.openHrmImportSheetModal = async function() {
        const modal = document.getElementById('modal-hrm-import-sheet');
        const urlInput = document.getElementById('hrm-import-sheet-url');
        if (urlInput && !urlInput.value) {
            try {
                const res = await fetch('/api/hrm/employees/sheet-config');
                if (res.ok) {
                    const data = await res.json();
                    urlInput.value = data.sheet_url || '';
                }
            } catch (e) { console.error(e); }
        }
        if (modal) modal.classList.remove('hidden');
    };

    window.closeHrmImportSheetModal = function() {
        const modal = document.getElementById('modal-hrm-import-sheet');
        if (modal) modal.classList.add('hidden');
    };

    window.submitHrmImportSheet = async function() {
        const urlInput = document.getElementById('hrm-import-sheet-url');
        const autoOpenAcc = document.getElementById('hrm-import-auto-open-acc')?.checked;
        const btn = document.getElementById('btn-submit-hrm-sheet-import');
        const sheet_url = (urlInput?.value || '').trim();

        if (btn) {
            btn.disabled = true;
            btn.innerHTML = '<span>⏳</span> Đang đồng bộ từ Google Sheet...';
        }
        try {
            const res = await fetch('/api/hrm/employees/import-sheet', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ sheet_url })
            });
            const data = await res.json();
            if (!res.ok) {
                alert('❌ ' + (data.detail || 'Lỗi đồng bộ Google Sheet'));
                return;
            }
            if (window.showToast) {
                window.showToast(data.message || 'Đã đồng bộ nhân sự từ Google Sheet', 'success');
            }
            closeHrmImportSheetModal();
            syncAllStaffViewsAfterChange();
            if (currentSubTab === 'adjustments') loadHrmSalaryAdjustments();

            if (autoOpenAcc) {
                const pending = data.pending_accounts || [];
                if (pending.length > 0) {
                    openHrmBatchAccountModal(pending);
                } else if (window.showToast) {
                    window.showToast('Tất cả nhân sự đang làm việc đều đã có tài khoản đăng nhập!', 'info');
                }
            }
        } catch (e) {
            console.error(e);
            alert('❌ Lỗi kết nối máy chủ khi đồng bộ Google Sheet');
        } finally {
            if (btn) {
                btn.disabled = false;
                btn.innerHTML = '<i class="ph ph-download-simple"></i> Bắt Đầu Đồng Bộ';
            }
        }
    };

    // ── Cấp Tài Khoản Hàng Loạt (Batch Account Creation) ──
    let hrmBatchCandidateList = [];

    window.openHrmBatchAccountModal = async function(prefetchedList) {
        let candidates = Array.isArray(prefetchedList) ? prefetchedList : null;
        if (!candidates) {
            try {
                const res = await fetch('/api/hrm/employees');
                if (res.ok) {
                    const all = await res.json();
                    hrmStaffList = all;
                    candidates = all.filter(s => !s.has_account && s.is_active !== 0 && s.contractual_status !== 'Nghỉ việc');
                }
            } catch (e) { console.error(e); }
        }
        hrmBatchCandidateList = candidates || [];
        renderHrmBatchAccountRows();

        const modal = document.getElementById('modal-hrm-batch-accounts');
        if (modal) modal.classList.remove('hidden');
    };

    window.closeHrmBatchAccountModal = function() {
        const modal = document.getElementById('modal-hrm-batch-accounts');
        if (modal) modal.classList.add('hidden');
    };

    function renderHrmBatchAccountRows() {
        const tbody = document.getElementById('table-hrm-batch-accounts');
        const checkAll = document.getElementById('hrm-batch-check-all');
        const defPwd = document.getElementById('hrm-batch-default-pwd')?.value || '123456';
        if (!tbody) return;

        if (!hrmBatchCandidateList.length) {
            tbody.innerHTML = `<tr><td colspan="7" class="p-6 text-center text-slate-400">Tất cả nhân sự đang làm việc đều đã được cấp tài khoản đăng nhập POS!</td></tr>`;
            if (checkAll) checkAll.checked = false;
            updateHrmBatchSelectedCount();
            return;
        }

        if (checkAll) checkAll.checked = true;
        tbody.innerHTML = hrmBatchCandidateList.map(s => {
            const uname = normalizePhoneUsername(s.phone, s.employee_code, s.name);
            const deptPos = [s.department, s.position].filter(Boolean).join(' • ') || '—';
            const blockName = s.block_name || (hrmBlocksMap[s.work_block_id]?.name) || 'Văn Phòng';
            return `
                <tr class="hover:bg-slate-50 transition" data-staff-id="${s.id}">
                    <td class="p-2.5 text-center">
                        <input type="checkbox" class="hrm-batch-acc-chk rounded text-emerald-600 w-4 h-4 cursor-pointer" data-staff-id="${s.id}" checked onchange="updateHrmBatchSelectedCount()">
                    </td>
                    <td class="p-2.5">
                        <div class="font-bold text-slate-800">${s.name}</div>
                        <div class="text-xs font-mono text-slate-500">${s.employee_code ? `<span class="text-sky-700 font-bold">${s.employee_code}</span>` : `ID #${s.id}`}${s.phone ? ` • 📞 ${s.phone}` : ''}${s.device_code ? ` • Máy: ${s.device_code}` : ''}</div>
                    </td>
                    <td class="p-2.5 text-slate-600">${deptPos}</td>
                    <td class="p-2.5"><span class="px-2 py-0.5 rounded bg-slate-100 text-slate-700 font-bold text-xs">${blockName}</span></td>
                    <td class="p-2.5">
                        <input type="text" class="hrm-batch-acc-uname border border-slate-300 rounded-lg px-2 py-1 text-xs font-mono font-bold text-emerald-700 w-36 focus:ring-1 focus:ring-emerald-500" value="${uname}" placeholder="SĐT / Username">
                    </td>
                    <td class="p-2.5">
                        <select class="hrm-batch-acc-role border border-slate-300 rounded-lg px-2 py-1 text-xs font-semibold text-slate-700 bg-white focus:ring-1 focus:ring-emerald-500">
                            <option value="staff" selected>Nhân viên (Chỉ xem phiếu lương)</option>
                            <option value="cashier">Thu ngân (Bán hàng POS)</option>
                            <option value="warehouse">Thủ kho (Kho & Nhập hàng)</option>
                            <option value="accountant">Kế toán (Sổ quỹ & Lương)</option>
                            <option value="owner">Chủ shop (Toàn quyền)</option>
                        </select>
                    </td>
                    <td class="p-2.5">
                        <input type="text" class="hrm-batch-acc-pwd border border-slate-300 rounded-lg px-2 py-1 text-xs font-mono w-24 focus:ring-1 focus:ring-emerald-500" value="${defPwd}">
                    </td>
                </tr>
            `;
        }).join('');
        updateHrmBatchSelectedCount();
    }

    window.toggleAllHrmBatchAccounts = function(checked) {
        document.querySelectorAll('.hrm-batch-acc-chk').forEach(cb => { cb.checked = checked; });
        updateHrmBatchSelectedCount();
    };

    window.applyBatchDefaultPassword = function(pwd) {
        document.querySelectorAll('.hrm-batch-acc-pwd').forEach(inp => { inp.value = pwd; });
    };

    window.updateHrmBatchSelectedCount = function() {
        const checked = document.querySelectorAll('.hrm-batch-acc-chk:checked').length;
        const el = document.getElementById('hrm-batch-selected-count');
        if (el) el.textContent = `Đã chọn: ${checked} nhân viên`;
    };

    window.submitHrmBatchAccounts = async function() {
        const rows = document.querySelectorAll('#table-hrm-batch-accounts tr[data-staff-id]');
        const accounts = [];
        rows.forEach(tr => {
            const chk = tr.querySelector('.hrm-batch-acc-chk');
            if (!chk || !chk.checked) return;
            const staff_id = parseInt(tr.getAttribute('data-staff-id'), 10);
            const username = (tr.querySelector('.hrm-batch-acc-uname')?.value || '').trim();
            const role = tr.querySelector('.hrm-batch-acc-role')?.value || 'staff';
            const password = (tr.querySelector('.hrm-batch-acc-pwd')?.value || '123456').trim();
            if (staff_id && username) {
                accounts.push({ staff_id, username, role, password });
            }
        });

        if (!accounts.length) {
            alert("Vui lòng tích chọn ít nhất 1 nhân viên và điền đầy đủ Username!");
            return;
        }

        const btn = document.getElementById('btn-submit-hrm-batch-acc');
        if (btn) {
            btn.disabled = true;
            btn.textContent = "⏳ Đang tạo tài khoản...";
        }
        try {
            const res = await fetch('/api/hrm/employees/batch-accounts', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ accounts })
            });
            const data = await res.json();
            if (!res.ok) {
                alert('❌ ' + (data.detail || 'Lỗi cấp tài khoản hàng loạt'));
                return;
            }
            let msg = data.message || `Đã tạo ${data.created_count} tài khoản.`;
            if (data.errors && data.errors.length) {
                msg += `\nLưu ý: ${data.errors.join('; ')}`;
                alert(msg);
            } else if (window.showToast) {
                window.showToast(msg, 'success');
            }
            closeHrmBatchAccountModal();
            syncAllStaffViewsAfterChange();
        } catch (e) {
            console.error(e);
            alert('❌ Lỗi kết nối máy chủ');
        } finally {
            if (btn) {
                btn.disabled = false;
                btn.innerHTML = '<i class="ph ph-lightning"></i> Tạo Tài Khoản Cho Các Nhân Viên Đã Chọn';
            }
        }
    };

    // ── Xem & Tính Hoa Hồng Tổng Hợp (Subtab Hoa Hồng & Tip) ──
    let currentCommData = null;
    let activeCommDeptFilter = 'all';

    async function loadHrmCommissions(month) {
        const p = getHrmQueryPeriodParams();
        const m = month || p.month;
        const tbody = document.getElementById('table-hrm-commissions');
        if (tbody && !currentCommData) {
            tbody.innerHTML = `<tr><td colspan="7" class="p-6 text-center text-slate-400">Đang tính toán hoa hồng kỳ ${m}...</td></tr>`;
        }
        try {
            const url = (hrmPeriodMode === 'range' && p.dateFrom && p.dateTo)
                ? `/api/hrm/commissions/${m}?date_from=${encodeURIComponent(p.dateFrom)}&date_to=${encodeURIComponent(p.dateTo)}`
                : `/api/hrm/commissions/${m}`;
            const res = await fetch(url);
            if (!res.ok) return;
            const data = await res.json();
            currentCommData = data;
            renderHrmCommissionsUI(data);
        } catch (e) {
            console.error("loadHrmCommissions err:", e);
        }
    }
    window.loadHrmCommissions = loadHrmCommissions;

    let commView = 'result';
    window.setCommView = function(view) {
        commView = view === 'config' ? 'config' : 'result';
        document.getElementById('hrm-comm-view-result')?.classList.toggle('hidden', commView !== 'result');
        document.getElementById('hrm-comm-view-config')?.classList.toggle('hidden', commView !== 'config');
        const on = 'px-3 py-1.5 rounded-md cursor-pointer bg-sky-600 text-white';
        const off = 'px-3 py-1.5 rounded-md cursor-pointer text-slate-600 hover:bg-slate-100';
        const r = document.getElementById('btn-comm-view-result'), c = document.getElementById('btn-comm-view-config');
        if (r) r.className = commView === 'result' ? on : off;
        if (c) c.className = commView === 'config' ? on : off;
    };
    // giữ tương thích nút cũ (nếu còn chỗ nào gọi)
    window.filterCommByDept = function(dept) {
        const sel = document.getElementById('hrm-comm-filter-dept');
        if (sel) sel.value = dept || 'all';
        renderCommTable();
    };

    const fmtN = v => Math.round(v || 0).toLocaleString('vi-VN');
    const escHtml = v => String(v ?? '').replace(/[&<>"']/g, ch => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'}[ch]));
    function commDeptNames(data) {
        const pols = (data && data.dept_policies) || [];
        return pols.length ? pols.map(p => p.dept) : ['Bán Lẻ POS', 'Spa & Grooming', 'Sales Online & TMĐT', 'Kho & Khách Sạn'];
    }

    function _findMatchingDeptPolicy(deptStr, policies) {
        const pols = policies || [];
        const dLow = String(deptStr || '').trim().toLowerCase();
        const exact = pols.find(p => String(p.dept || '').trim().toLowerCase() === dLow);
        if (exact) return exact;
        if (dLow.includes('spa') || dLow.includes('groom')) return pols.find(p => p.dept === 'Spa & Grooming') || pols[0];
        if (['kinh doanh', 'marketing', 'sales', 'online', 'tmđt', 'tmdt', 'sàn', 'pancake', 'digital'].some(k => dLow.includes(k))) {
            return pols.find(p => p.dept === 'Sales Online & TMĐT') || pols[0];
        }
        if (['kho', 'khách sạn', 'hotel'].some(k => dLow.includes(k))) {
            return pols.find(p => p.dept === 'Kho & Khách Sạn') || pols[0];
        }
        return pols.find(p => p.dept === 'Bán Lẻ POS') || pols[0];
    }

    function renderHrmCommissionsUI(data) {
        const s = data.summary || {};
        const fmt = v => fmtN(v) + ' ₫';
        const setEl = (id, txt) => { const el = document.getElementById(id); if (el) el.textContent = txt; };
        setEl('hrm-comm-kpi-pos', fmt(s.pos_commission_total));
        const posSubEl = document.getElementById('hrm-comm-kpi-pos-sub');
        if (posSubEl) {
            const adminLine = (s.admin_pos_net || s.admin_pos_orders)
                ? `<div class="text-xs text-amber-700 font-semibold mt-0.5">Đơn TK Admin (Chủ shop): ${fmt(s.admin_pos_net)} (${s.admin_pos_orders || 0} đơn · không tính HH NV)</div>`
                : '';
            posSubEl.innerHTML = `<div>Doanh số POS của NV: <b>${fmt(s.pos_net_total)}</b> (${s.pos_orders_total || 0} đơn)</div>${adminLine}`;
        }
        setEl('hrm-comm-kpi-spa', fmt(s.spa_commission_total));
        setEl('hrm-comm-kpi-spa-sub', `Doanh thu dịch vụ Spa: ${fmt(s.spa_revenue_total)}`);
        setEl('hrm-comm-kpi-tips', fmt((s.spa_tips_total || 0) + (s.tmdt_commission_total || 0)));
        setEl('hrm-comm-kpi-tips-sub', `Tip: ${fmt(s.spa_tips_total)} · TMĐT/KOC: ${fmt(s.tmdt_commission_total)}`);
        setEl('hrm-comm-kpi-total', fmt(s.grand_total));
        setCommView(commView);

        // Bộ lọc bộ phận (giữ lựa chọn cũ)
        const deptSel = document.getElementById('hrm-comm-filter-dept');
        if (deptSel) {
            const cur = deptSel.value || 'all';
            deptSel.innerHTML = `<option value="all">Tất cả bộ phận</option>` +
                commDeptNames(data).map(d => `<option value="${escHtml(d)}">${escHtml(d)}</option>`).join('');
            deptSel.value = [...deptSel.options].some(o => o.value === cur) ? cur : 'all';
        }

        // Mức chuẩn theo bộ phận: bảng 4 dòng (đếm cả NV ánh xạ theo nhóm bộ phận)
        const deptBody = document.getElementById('hrm-dept-policy-cards');
        if (deptBody) {
            deptBody.innerHTML = (data.dept_policies || []).map((p, idx) => {
                const n = (data.items || []).filter(x => (x.policy_dept === p.dept || x.department === p.dept) && x.staff_id).length;
                return `
                    <tr class="hover:bg-slate-50" title="${escHtml(p.desc || '')}">
                        <td class="p-2.5 font-bold text-slate-800">${escHtml(p.dept)}</td>
                        <td class="p-2.5 text-center text-slate-600">${n}</td>
                        <td class="p-2.5 text-center">
                            <input type="number" step="0.5" min="0" max="100" id="dept-pol-rate-${idx}" value="${p.pos_rate || 0}"
                                   class="w-16 border border-slate-300 rounded px-1.5 py-0.5 text-right font-mono font-bold text-sky-700"> %
                        </td>
                        <td class="p-2.5 text-center"><input type="checkbox" id="dept-pol-spa-${idx}" ${p.spa_on ? 'checked' : ''}></td>
                        <td class="p-2.5 text-center"><input type="checkbox" id="dept-pol-tmdt-${idx}" ${p.tmdt_on ? 'checked' : ''}></td>
                        <td class="p-2.5 text-right">
                            <button type="button" onclick="saveAndApplyDeptPolicy(${idx})"
                                    class="min-w-[9rem] px-2.5 py-1 rounded-lg border border-sky-300 bg-sky-50 hover:bg-sky-100 text-sky-800 font-bold cursor-pointer">Lưu & áp cho ${n} NV</button>
                        </td>
                    </tr>`;
            }).join('');
        }

        if (data.spa_matrix_config) {
            currentSpaMatrixConfig = JSON.parse(JSON.stringify(data.spa_matrix_config));
            spaMatrixEditing = false;
            renderSpaMatrixEditor(currentSpaMatrixConfig);
        }

        const rulesPills = document.getElementById('hrm-comm-rules-pills');
        const roleLabels = { receiver: 'Nhận bé', worker_1: 'Thợ Làm 1', worker_2: 'Thợ Làm 2', cutter: 'Thợ Cắt Tỉa', dyer: 'Thợ Nhuộm' };
        if (rulesPills) {
            const rules = data.spa_rules || [];
            rulesPills.innerHTML = rules.length === 0
                ? `<span class="text-xs text-slate-400">Chưa có quy tắc hoa hồng Spa nào.</span>`
                : rules.map(r => {
                    const valTxt = r.rate_type === 'percent' ? `${r.value}%` : `${fmtN(r.value)}đ/ca`;
                    return `<div class="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-sky-50 border border-sky-200 text-xs">
                            <span class="font-bold text-sky-900">${roleLabels[r.role_key] || r.role_key}:</span>
                            <span class="text-slate-600">${escHtml(r.service_name || 'Mọi dịch vụ')}</span>
                            <span class="font-bold text-sky-700 bg-white px-1.5 py-0.5 rounded border border-sky-200">${valTxt}</span>
                            <button type="button" onclick="deleteHrmSpaCommissionRule(${r.id})" class="text-rose-500 hover:text-rose-700 font-bold ml-1 cursor-pointer" title="Xóa quy tắc">✕</button>
                        </div>`;
                }).join('');
        }

        const btnSyncSpa = document.getElementById('btn-sync-unlinked-spa');
        if (btnSyncSpa) btnSyncSpa.classList.toggle('hidden', !(data.items || []).some(x => x.is_unlinked_spa));
        renderCommTable();
    }

    // Bảng NV 7 cột: luôn hiện Doanh số POS & Tiến độ Đủ/Thiếu Pancake/KOC ngay cả khi hoa hồng = 0 đ
    window.renderCommTable = function() {
        const data = currentCommData;
        const tbody = document.getElementById('table-hrm-commissions');
        const tfoot = document.getElementById('table-hrm-commissions-foot');
        if (!data || !tbody) return;
        const q = (document.getElementById('hrm-comm-search')?.value || '').trim();
        const dept = document.getElementById('hrm-comm-filter-dept')?.value || 'all';
        const hideZero = document.getElementById('hrm-comm-hide-zero')?.checked;
        const onlyCustom = document.getElementById('hrm-comm-only-custom')?.checked;
        const all = data.items || [];
        const items = all.filter(it =>
            (dept === 'all' || it.department === dept || it.policy_dept === dept) &&
            (!hideZero || (it.total_commission || 0) > 0) &&
            (!onlyCustom || it.policy_mode === 'custom') &&
            (!q || matchHrmQuery(q, `${it.name || ''} ${it.employee_code || ''} ${(it.pancake_sellers || []).join(' ')}`)));
        const cnt = document.getElementById('hrm-comm-count');
        if (cnt) cnt.textContent = `${items.length}/${all.length} NV`;

        if (!items.length) {
            tbody.innerHTML = `<tr><td colspan="7" class="p-6 text-center text-slate-400">Không có nhân viên phù hợp bộ lọc.</td></tr>`;
            if (tfoot) tfoot.innerHTML = '';
            return;
        }
        const dash = '<span class="text-slate-300">—</span>';
        tbody.innerHTML = items.map(it => {
            const tmdt = (it.pancake_commission || 0) + (it.koc_commission || 0);
            const spaTotal = (it.spa_commission || 0) + (it.spa_tips || 0);
            const modeTag = it.policy_mode === 'custom'
                ? '<span class="ml-1 px-1.5 py-0.5 rounded bg-amber-50 text-amber-800 border border-amber-200 font-semibold">Mức riêng</span>' : '';
            const probTag = it.spa_commission_tier === 'probation' ? '<span class="ml-1 px-1.5 rounded bg-amber-50 text-amber-700 border border-amber-200">TV</span>' : '';
            const unlinked = it.is_unlinked_spa ? '<span class="ml-1 px-1.5 rounded bg-amber-100 text-amber-800 font-bold">Chưa tạo NV</span>' : '';
            const sellerBadges = (it.pancake_sellers && it.pancake_sellers.length)
                ? `<div class="mt-0.5"><span class="inline-flex items-center px-1.5 py-0.5 rounded bg-sky-50 text-sky-700 border border-sky-200 font-semibold">Pancake: ${escHtml(it.pancake_sellers.join(', '))}${it.pancake_custom_rules ? ' (Riêng)' : ''}</span></div>`
                : '';

            // Cột POS: luôn hiện rõ số đơn, doanh số thuần & % hiệu lực ngay cả khi 0 đ
            const posCell = `<div class="font-bold ${it.pos_commission > 0 ? 'text-sky-700' : 'text-slate-500'}">${fmtN(it.pos_commission || 0)} ₫</div>
                <div class="text-slate-400">${it.pos_orders || 0} đơn · ${fmtN(it.pos_net || 0)} ₫ × ${it.commission_rate || 0}%</div>`;

            // Cột Tiến độ Sàn / Pancake / KOC: Đủ hay Thiếu mốc đều hiện rõ
            let tmdtCell = dash;
            if (it.pancake_assigned || it.pancake_has_kpi || it.pancake_revenue > 0 || it.koc_commission > 0 || it.koc_videos > 0) {
                const blocks = [];
                if (it.pancake_assigned || it.pancake_has_kpi || it.pancake_revenue > 0) {
                    const pct = Math.min(100, Math.max(0, Number(it.pancake_progress_pct || 0)));
                    const statusBadge = it.pancake_achieved
                        ? `<span class="px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 font-bold whitespace-nowrap">Đạt mốc ${Math.round(it.pancake_progress_pct || 100)}%${it.pancake_over_amount > 0 ? ` · Vượt +${fmtN(it.pancake_over_amount)} ₫ (×${it.pancake_rate}%)` : ''}</span>`
                        : `<span class="px-2 py-0.5 rounded-full bg-amber-100 text-amber-800 font-bold whitespace-nowrap">Chưa đủ mốc · Thiếu ${fmtN(it.pancake_shortfall)} ₫</span>`;
                    const nickHint = !it.pancake_assigned ? `<div class="text-amber-700 font-semibold mt-0.5">Chưa gán nick ở tab Sàn TMĐT → Pancake</div>` : '';
                    const commLine = it.pancake_commission > 0
                        ? `<div class="font-mono font-bold text-emerald-700 mt-0.5">+${fmtN(it.pancake_commission)} ₫ <span class="text-slate-500 font-normal">(Thưởng mốc +${fmtN(it.pancake_bonus)} ₫${it.pancake_tier_commission > 0 ? ` + Vượt +${fmtN(it.pancake_tier_commission)} ₫` : ''})</span></div>`
                        : '';
                    blocks.push(`
                        <div>
                            <div class="flex flex-wrap items-center justify-between gap-2">
                                <span class="font-mono text-slate-700"><b>${fmtN(it.pancake_revenue)}</b> / ${fmtN(it.pancake_threshold)} ₫ (${it.pancake_orders || 0} đơn)</span>
                                ${statusBadge}
                            </div>
                            <div class="w-40 max-w-full h-1.5 bg-slate-200 rounded-full overflow-hidden mt-1">
                                <div class="h-full ${it.pancake_achieved ? 'bg-emerald-500' : 'bg-amber-500'} rounded-full" style="width:${pct}%"></div>
                            </div>
                            ${commLine}
                            ${nickHint}
                        </div>
                    `);
                }
                if (it.koc_commission > 0 || it.koc_videos > 0) {
                    blocks.push(`<div class="font-mono text-sky-700 font-semibold mt-1">KOC TikTok: +${fmtN(it.koc_commission)} ₫ (${it.koc_qualified_videos || 0}/${it.koc_videos || 0} video đạt view)</div>`);
                }
                tmdtCell = blocks.join('');
            }

            const spaCell = spaTotal
                ? `<div class="font-bold text-sky-700">${fmtN(spaTotal)} ₫${probTag}</div><div class="text-slate-400">${it.spa_tickets || 0} ca${it.spa_tips ? ` · tip ${fmtN(it.spa_tips)}` : ''}</div>`
                : `<span class="text-slate-400">0 ₫</span>`;

            const click = it.staff_id ? `onclick="openCommStaffModal(${it.staff_id})" class="hover:bg-sky-50/60 cursor-pointer"` : 'class=""';
            return `
                <tr ${click}>
                    <td class="p-2.5 whitespace-nowrap"><div class="font-bold text-slate-900">${escHtml(it.name)}${unlinked}</div><div class="text-sky-700 font-mono font-bold">${escHtml(it.employee_code || '')}</div></td>
                    <td class="p-2.5 text-slate-700"><div>${escHtml(it.department || '')}${modeTag}</div>${sellerBadges}</td>
                    <td class="p-2.5 text-right font-mono whitespace-nowrap">${posCell}</td>
                    <td class="p-2.5 min-w-[260px]">${tmdtCell}</td>
                    <td class="p-2.5 text-right font-mono whitespace-nowrap">${spaCell}</td>
                    <td class="p-2.5 text-right font-mono font-bold ${it.total_commission > 0 ? 'text-emerald-700' : 'text-slate-500'} whitespace-nowrap">${fmtN(it.total_commission)} ₫</td>
                    <td class="p-2.5 text-slate-400">${it.staff_id ? '<i class="ph ph-pencil-simple"></i>' : ''}</td>
                </tr>`;
        }).join('');
        const sum = f => fmtN(items.reduce((a, b) => a + f(b), 0));
        if (tfoot) tfoot.innerHTML = `
            <tr>
                <td colspan="2" class="p-2.5 text-right text-slate-600">Tổng (${items.length} NV)</td>
                <td class="p-2.5 text-right font-mono text-sky-700">${sum(b => b.pos_commission || 0)} ₫</td>
                <td class="p-2.5 text-right font-mono text-sky-700">TMĐT/KOC: ${sum(b => (b.pancake_commission || 0) + (b.koc_commission || 0))} ₫</td>
                <td class="p-2.5 text-right font-mono text-sky-700">${sum(b => (b.spa_commission || 0) + (b.spa_tips || 0))} ₫</td>
                <td class="p-2.5 text-right font-mono text-emerald-800">${sum(b => b.total_commission || 0)} ₫</td>
                <td></td>
            </tr>`;
    };

    // ── Popup cài hoa hồng riêng 1 NV ──
    window.openCommStaffModal = function(staffId) {
        const it = (currentCommData?.items || []).find(x => x.staff_id === staffId);
        if (!it) return;
        document.getElementById('hrm-comm-staff-id').value = staffId;
        document.getElementById('hrm-comm-staff-title').textContent = `${it.employee_code || ''} · ${it.name}`;
        const deptSel = document.getElementById('hrm-comm-staff-dept');
        const names = commDeptNames(currentCommData);
        if (it.department && !names.includes(it.department)) names.push(it.department);
        deptSel.innerHTML = names.map(d => `<option value="${escHtml(d)}">${escHtml(d)}</option>`).join('');
        deptSel.value = it.department || names[0];
        document.querySelectorAll('input[name="hrm-comm-staff-mode"]').forEach(r => { r.checked = r.value === (it.policy_mode === 'custom' ? 'custom' : 'dept'); });
        document.getElementById('hrm-comm-staff-rate').value = it.commission_rate || 0;
        document.getElementById('hrm-comm-staff-spa').checked = !!it.enable_spa_commission;
        document.getElementById('hrm-comm-staff-tmdt').checked = !!it.enable_tmdt_commission;
        document.getElementById('hrm-comm-staff-tier').value = it.spa_commission_tier === 'probation' ? 'probation' : 'official';
        refreshCommStaffModal();
        document.getElementById('modal-hrm-comm-staff').classList.remove('hidden');
    };

    // "Theo bộ phận": hiện mức của bộ phận, khóa ô; "Mức riêng": mở khóa
    window.refreshCommStaffModal = function() {
        const mode = document.querySelector('input[name="hrm-comm-staff-mode"]:checked')?.value || 'dept';
        const custom = mode === 'custom';
        const box = document.getElementById('hrm-comm-staff-custom');
        box.querySelectorAll('input').forEach(i => { i.disabled = !custom; });
        box.classList.toggle('opacity-60', !custom);
        if (!custom) {
            const dept = document.getElementById('hrm-comm-staff-dept').value;
            const pol = _findMatchingDeptPolicy(dept, currentCommData?.dept_policies || []);
            if (pol) {
                document.getElementById('hrm-comm-staff-rate').value = pol.pos_rate || 0;
                document.getElementById('hrm-comm-staff-spa').checked = !!pol.spa_on;
                document.getElementById('hrm-comm-staff-tmdt').checked = !!pol.tmdt_on;
            }
        }
    };

    window.closeCommStaffModal = function() {
        document.getElementById('modal-hrm-comm-staff')?.classList.add('hidden');
    };

    window.saveCommStaffModal = async function() {
        const staffId = parseInt(document.getElementById('hrm-comm-staff-id').value);
        const mode = document.querySelector('input[name="hrm-comm-staff-mode"]:checked')?.value || 'dept';
        const rate = parseFloat(document.getElementById('hrm-comm-staff-rate').value) || 0;
        if (rate < 0 || rate > 100) { alert('% hoa hồng phải từ 0 đến 100'); return; }
        const payload = {
            department: document.getElementById('hrm-comm-staff-dept').value,
            policy_mode: mode,
            spa_commission_tier: document.getElementById('hrm-comm-staff-tier').value,
        };
        if (mode === 'custom') Object.assign(payload, {
            commission_rate: rate,
            enable_spa_commission: document.getElementById('hrm-comm-staff-spa').checked ? 1 : 0,
            enable_tmdt_commission: document.getElementById('hrm-comm-staff-tmdt').checked ? 1 : 0,
        });
        closeCommStaffModal();
        await updateStaffCommPolicy(staffId, payload);
    };

    window.saveAndApplyDeptPolicy = async function(idx, deptName) {
        deptName = deptName || (currentCommData?.dept_policies || [])[idx]?.dept;
        const month = getSelectedMonth();
        const pos_rate = parseFloat(document.getElementById(`dept-pol-rate-${idx}`)?.value) || 0;
        const spa_on = document.getElementById(`dept-pol-spa-${idx}`)?.checked ? 1 : 0;
        const tmdt_on = document.getElementById(`dept-pol-tmdt-${idx}`)?.checked ? 1 : 0;
        try {
            // Nếu có thợ Spa chưa có hồ sơ và đang áp cho bộ phận Spa & Grooming thì đồng bộ luôn
            if (deptName === 'Spa & Grooming') {
                await fetch('/api/hrm/commissions/sync-spa-workers', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ month })
                });
            }
            const res = await fetch('/api/hrm/commissions/dept-policies', {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    dept: deptName,
                    pos_rate,
                    spa_on,
                    tmdt_on,
                    apply_to_staff: true,
                    force_all: true,
                    month
                })
            });
            const data = await res.json();
            if (!res.ok) {
                alert(data.detail || 'Lỗi lưu quy định bộ phận');
                return;
            }
            if (window.showToast) window.showToast(`Đã áp quy định bộ phận "${deptName}" cho ${data.updated_staff} nhân viên!`, 'success');
            loadHrmCommissions(month);
        } catch (e) {
            console.error(e);
        }
    };

    window.updateStaffCommPolicy = async function(staffId, payload) {
        const month = getSelectedMonth();
        try {
            const res = await fetch(`/api/hrm/commissions/staff-policy/${staffId}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ ...payload, month })
            });
            if (!res.ok) {
                const err = await res.json();
                alert(err.detail || 'Lỗi cập nhật quy định nhân viên');
                return;
            }
            if (window.showToast) window.showToast('Đã cập nhật bộ phận & quy định hoa hồng nhân viên!', 'success');
            loadHrmCommissions(month);
        } catch (e) {
            console.error(e);
        }
    };

    window.saveStaffPosCommissionRate = async function(staffId, newRate) {
        const month = getSelectedMonth();
        try {
            const res = await fetch(`/api/hrm/commissions/staff-rate/${staffId}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ commission_rate: parseFloat(newRate) || 0, month })
            });
            if (!res.ok) {
                const err = await res.json();
                alert(err.detail || 'Lỗi lưu % hoa hồng');
                return;
            }
            if (window.showToast) window.showToast('Đã cập nhật % hoa hồng bán lẻ POS', 'success');
            loadHrmCommissions(month);
        } catch (e) {
            console.error(e);
        }
    };

    window.addHrmSpaCommissionRule = async function() {
        const role_key = document.getElementById('hrm-comm-new-role')?.value || 'worker_1';
        const service_name = (document.getElementById('hrm-comm-new-svc')?.value || '').trim();
        const rate_type = document.getElementById('hrm-comm-new-type')?.value || 'percent';
        const value = parseFloat(document.getElementById('hrm-comm-new-val')?.value);
        if (isNaN(value) || value < 0) {
            alert('Vui lòng nhập mức % hoặc số tiền hoa hồng hợp lệ!');
            return;
        }
        try {
            const res = await fetch('/api/hrm/config/spa-rules', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ role_key, service_name: service_name || null, rate_type, value, is_active: 1 })
            });
            if (!res.ok) {
                const err = await res.json();
                alert(err.detail || 'Lỗi lưu quy tắc hoa hồng Spa');
                return;
            }
            if (document.getElementById('hrm-comm-new-val')) document.getElementById('hrm-comm-new-val').value = '';
            if (document.getElementById('hrm-comm-new-svc')) document.getElementById('hrm-comm-new-svc').value = '';
            if (window.showToast) window.showToast('Đã lưu quy tắc hoa hồng Spa', 'success');
            loadHrmCommissions(getSelectedMonth());
            if (typeof loadHrmConfig === 'function') loadHrmConfig();
        } catch (e) {
            console.error(e);
        }
    };

    window.deleteHrmSpaCommissionRule = async function(ruleId) {
        try {
            const res = await fetch(`/api/hrm/config/spa-rules/${ruleId}`, { method: 'DELETE' });
            if (res.ok) {
                if (window.showToast) window.showToast('Đã xóa quy tắc hoa hồng Spa', 'success');
                loadHrmCommissions(getSelectedMonth());
                if (typeof loadHrmConfig === 'function') loadHrmConfig();
            }
        } catch (e) {
            console.error(e);
        }
    };

    window.syncUnlinkedSpaWorkers = async function() {
        const month = getSelectedMonth();
        try {
            const res = await fetch('/api/hrm/commissions/sync-spa-workers', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ month })
            });
            const data = await res.json();
            if (!res.ok) {
                alert(data.detail || 'Lỗi đồng bộ thợ Spa');
                return;
            }
            if (window.showToast) window.showToast(data.message, 'success');
            loadHrmCommissions(month);
        } catch (e) {
            console.error(e);
        }
    };

    window.recalcAndSyncCommissionToPayroll = async function() {
        const month = getSelectedMonth();
        try {
            // Đồng bộ các thợ Spa chưa có hồ sơ trước để họ có mặt trong Bảng Lương
            await fetch('/api/hrm/commissions/sync-spa-workers', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ month })
            });
            const res = await fetch(`/api/hrm/payroll/${month}/calculate`, { method: 'POST' });
            const data = await res.json();
            if (!res.ok) {
                alert(data.detail || 'Không thể tính lại bảng lương');
                return;
            }
            if (window.showToast) window.showToast(`Đã tính toán hoa hồng & cập nhật vào Bảng Lương tháng ${month}!`, 'success');
            await loadHrmCommissions(month);
        } catch (e) {
            console.error(e);
        }
    };

    // =====================================================================
    // MA TRẬN HOA HỒNG SPA ĐA CƠ SỞ (CHÍNH THỨC / THỬ VIỆC · BẬC KG · 7 PHỤ THU)
    // =====================================================================
    let currentSpaMatrixConfig = null;

    function getActiveMatrixProfile() {
        if (!currentSpaMatrixConfig || !Array.isArray(currentSpaMatrixConfig.profiles) || !currentSpaMatrixConfig.profiles.length) {
            return null;
        }
        const actId = currentSpaMatrixConfig.active_profile_id;
        return currentSpaMatrixConfig.profiles.find(p => p.id === actId) || currentSpaMatrixConfig.profiles[0];
    }

    let spaMatrixEditing = false;
    window.toggleSpaMatrixEdit = function(on) {
        spaMatrixEditing = !!on;
        renderSpaMatrixEditor(currentSpaMatrixConfig);
    };
    window.cancelSpaMatrixEdit = function() {
        // bỏ thay đổi chưa lưu: lấy lại bản gốc từ dữ liệu đã tải
        if (currentCommData?.spa_matrix_config) currentSpaMatrixConfig = JSON.parse(JSON.stringify(currentCommData.spa_matrix_config));
        toggleSpaMatrixEdit(false);
    };

    // Bảng Spa xoay dọc: mỗi hạng mục 1 dòng, 2 cột tiền (Chính thức / Thử việc). Mặc định chỉ xem.
    function renderSpaMatrixEditor(cfg) {
        if (!cfg || !Array.isArray(cfg.profiles)) return;
        const ed = spaMatrixEditing;
        const sel = document.getElementById('hrm-spa-profile-select');
        if (sel) {
            sel.innerHTML = cfg.profiles.map(p => `<option value="${p.id}" ${p.id === cfg.active_profile_id ? 'selected' : ''}>${escHtml(p.name)}</option>`).join('');
            sel.disabled = ed;
        }
        const prof = getActiveMatrixProfile();
        if (!prof) return;

        const legacyWrap = document.getElementById('hrm-legacy-percent-rules-wrap');
        if (legacyWrap) legacyWrap.classList.toggle('hidden', prof.calc_mode !== 'role_rules');

        const btn = 'px-2.5 py-1 rounded-lg border font-bold text-xs cursor-pointer';
        const toolbar = document.getElementById('hrm-spa-matrix-toolbar');
        if (toolbar) toolbar.innerHTML = ed ? `
            <button type="button" onclick="cancelSpaMatrixEdit()" class="${btn} border-slate-300 bg-white text-slate-700">Hủy</button>
            <button type="button" onclick="saveSpaCommissionMatrix()" class="${btn} border-sky-600 bg-sky-600 hover:bg-sky-700 text-white"><i class="ph ph-floppy-disk"></i> Lưu</button>` : `
            <button type="button" onclick="toggleSpaMatrixEdit(true)" class="${btn} border-sky-300 bg-sky-50 hover:bg-sky-100 text-sky-800"><i class="ph ph-pencil-simple"></i> Sửa</button>
            <details class="relative">
                <summary class="${btn} border-slate-300 bg-white text-slate-700 list-none">⋯</summary>
                <div class="absolute right-0 mt-1 z-20 bg-white border border-slate-200 rounded-lg shadow-lg p-1 w-48 text-xs">
                    <button type="button" onclick="cloneNewSpaMatrixProfile()" class="w-full text-left px-2 py-1.5 rounded hover:bg-slate-50 cursor-pointer">Nhân bản cơ sở mới</button>
                    <button type="button" onclick="exportImportSpaMatrixModal()" class="w-full text-left px-2 py-1.5 rounded hover:bg-slate-50 cursor-pointer">Xuất / Nhập mẫu</button>
                    ${cfg.profiles.length > 1 ? `<button type="button" onclick="deleteActiveSpaMatrixProfile()" class="w-full text-left px-2 py-1.5 rounded hover:bg-rose-50 text-rose-700 cursor-pointer">Xóa mẫu đang chọn</button>` : ''}
                </div>
            </details>`;

        const container = document.getElementById('hrm-spa-matrix-editor-container');
        if (!container) return;

        const money = v => fmtN(v);
        const inMoney = (group, i, key, v) => `<input type="text" value="${money(v)}" onchange="onSpaMatrixMoneyChange('${group}', ${i}, '${key}', this.value)"
            class="w-24 text-right font-mono font-bold border ${key === 'probation' ? 'border-amber-300' : 'border-slate-300'} rounded px-1.5 py-0.5 bg-white">`;
        const inText = (group, i, key, v, w = 'w-28') => `<input type="text" value="${escHtml(v || '')}" onchange="onSpaMatrixFieldChange('${group}', ${i}, '${key}', this.value)"
            class="${w} border border-slate-300 rounded px-1.5 py-0.5 bg-white">`;
        const cell = (group, i, key, v) => ed ? inMoney(group, i, key, v) : money(v);
        const del = (fn) => ed ? `<button type="button" onclick="${fn}" class="text-rose-500 hover:text-rose-700 font-bold px-1 cursor-pointer" title="Xóa dòng">&times;</button>` : '';
        const grp = (title, addFn, addLabel) => `
            <tr class="bg-slate-50"><td colspan="5" class="px-2.5 py-1.5 font-bold text-slate-700">
                <div class="flex items-center justify-between">${title}${ed && addFn ? `<button type="button" onclick="${addFn}" class="text-sky-700 hover:underline font-bold cursor-pointer">+ ${addLabel}</button>` : ''}</div>
            </td></tr>`;

        const tierRow = (kind, t, i, count) => {
            const group = kind === 'bath' ? 'bath_tier' : 'cut_tier';
            const kg = ed
                ? `<span class="whitespace-nowrap">${inText(group, i, 'range_label', t.range_label, 'w-24')} <span class="text-slate-400">trần</span>
                   <input type="number" step="0.5" value="${t.max_kg ?? 999}" onchange="onSpaMatrixFieldChange('${group}', ${i}, 'max_kg', parseFloat(this.value)||999)"
                          class="w-16 border border-slate-300 rounded px-1 py-0.5 text-right font-mono bg-white"> kg</span>`
                : escHtml(t.range_label || '');
            return `<tr>
                <td class="px-2.5 py-1.5">${ed ? inText(group, i, 'label', t.label) : escHtml(t.label)}</td>
                <td class="px-2.5 py-1.5 text-slate-500">${kg}</td>
                <td class="px-2.5 py-1.5 text-right font-mono">${cell(group, i, 'official', t.official)}</td>
                <td class="px-2.5 py-1.5 text-right font-mono text-amber-800">${cell(group, i, 'probation', t.probation)}</td>
                <td class="px-1 text-right">${count > 1 ? del(`removeSpaMatrixTier('${kind}', ${i})`) : ''}</td>
            </tr>`;
        };
        const fixedRow = (group, r) => `<tr>
                <td class="px-2.5 py-1.5">${escHtml(r.label)}</td>
                <td class="px-2.5 py-1.5 text-slate-500">Mọi kg</td>
                <td class="px-2.5 py-1.5 text-right font-mono">${cell(group, 0, 'official', r.official)}</td>
                <td class="px-2.5 py-1.5 text-right font-mono text-amber-800">${cell(group, 0, 'probation', r.probation)}</td>
                <td></td>
            </tr>`;
        const roleLabel = r => r === 'bath' ? 'Thợ tắm' : 'Thợ cắt';
        const surchRow = (sr, i) => `<tr>
                <td class="px-2.5 py-1.5">${ed ? inText('surcharge', i, 'label', sr.label) : escHtml(sr.label)}</td>
                <td class="px-2.5 py-1.5 text-slate-500">${ed
                    ? `<select onchange="onSpaMatrixFieldChange('surcharge', ${i}, 'target_role', this.value)" class="border border-slate-300 rounded px-1 py-0.5 bg-white">
                         <option value="cutter" ${sr.target_role !== 'bath' ? 'selected' : ''}>Thợ cắt</option>
                         <option value="bath" ${sr.target_role === 'bath' ? 'selected' : ''}>Thợ tắm</option></select>`
                    : `<span class="px-1.5 rounded border border-slate-200">${roleLabel(sr.target_role)}</span>`}</td>
                <td class="px-2.5 py-1.5 text-right font-mono">${cell('surcharge', i, 'official', sr.official)}</td>
                <td class="px-2.5 py-1.5 text-right font-mono text-amber-800">${cell('surcharge', i, 'probation', sr.probation)}</td>
                <td class="px-1 text-right">${del(`removeSpaMatrixSurcharge(${i})`)}</td>
            </tr>`;

        const bath = prof.bath_tiers || [], cut = prof.cut_tiers || [], surch = prof.surcharge_rules || [];
        const cat = prof.cat_rate || { label: 'Mèo', official: 0, probation: 0 };
        const dye = prof.dye_rate || { label: 'Nhuộm', official: 0, probation: 0 };
        const head = `<thead class="text-slate-500 border-b border-slate-200"><tr>
                <th class="px-2.5 py-1.5 text-left font-semibold">Hạng mục</th>
                <th class="px-2.5 py-1.5 text-left font-semibold">Cân nặng / Người hưởng</th>
                <th class="px-2.5 py-1.5 text-right font-semibold">Chính thức</th>
                <th class="px-2.5 py-1.5 text-right font-semibold text-amber-700">Thử việc</th>
                <th class="w-6"></th></tr></thead>`;
        const w1 = prof.worker1_share_pct ?? 50, w2 = prof.worker2_share_pct ?? 50;
        const numIn = (field, v, w = 'w-14') => `<input type="number" min="0" value="${v}" onchange="onSpaMatrixProfileMetaChange('${field}', parseFloat(this.value)||0)" class="${w} border border-slate-300 rounded px-1 py-0.5 text-right font-mono bg-white">`;

        const settings = ed ? `
            <div class="flex flex-wrap items-center gap-3 text-xs bg-slate-50 p-2 rounded-lg border border-slate-200">
                <label class="flex items-center gap-1 font-semibold text-slate-700">Tên mẫu
                    <input type="text" value="${escHtml(prof.name || '')}" onchange="onSpaMatrixProfileMetaChange('name', this.value)" class="w-96 max-w-full border border-slate-300 rounded px-1.5 py-0.5 bg-white"></label>
                <label class="flex items-center gap-1 font-semibold text-slate-700">Cách tính
                    <select onchange="onSpaMatrixProfileMetaChange('calc_mode', this.value)" class="border border-slate-300 rounded px-1 py-0.5 bg-white">
                        <option value="weight_matrix" ${prof.calc_mode !== 'role_rules' ? 'selected' : ''}>Theo bậc cân nặng (VNĐ)</option>
                        <option value="role_rules" ${prof.calc_mode === 'role_rules' ? 'selected' : ''}>Theo % doanh thu dịch vụ</option>
                    </select></label>
                <span class="flex items-center gap-1 font-semibold text-slate-700">2 thợ tắm chia ${numIn('worker1_share_pct', w1, 'w-12')}% / ${numIn('worker2_share_pct', w2, 'w-12')}%</span>
                <span class="flex items-center gap-1 font-semibold text-slate-700">NV nhận bé ${numIn('receiver_official', prof.receiver_official ?? 0, 'w-20')}
                    <select onchange="onSpaMatrixProfileMetaChange('receiver_rate_type', this.value)" class="border border-slate-300 rounded px-1 py-0.5 bg-white">
                        <option value="fixed" ${prof.receiver_rate_type !== 'percent' ? 'selected' : ''}>đ/ca</option>
                        <option value="percent" ${prof.receiver_rate_type === 'percent' ? 'selected' : ''}>% DT</option>
                    </select></span>
            </div>` : `
            <div class="text-xs text-slate-500">2 thợ tắm chia <b>${w1}% / ${w2}%</b> · NV nhận bé <b>${prof.receiver_rate_type === 'percent' ? `${prof.receiver_official ?? 0}% DT` : `${fmtN(prof.receiver_official)} đ/ca`}</b>${prof.calc_mode === 'role_rules' ? ' · <b>Đang tính theo % doanh thu</b> (bảng dưới không áp dụng)' : ''}</div>`;

        container.innerHTML = `
            ${settings}
            <div class="grid grid-cols-1 xl:grid-cols-2 gap-3">
                <table class="w-full border-collapse text-xs border border-slate-200 rounded-lg">
                    ${head}
                    <tbody class="divide-y divide-slate-100">
                        ${grp('Tắm chó', "addSpaMatrixTier('bath')", 'Thêm bậc')}
                        ${bath.map((t, i) => tierRow('bath', t, i, bath.length)).join('')}
                        ${grp('Mèo · Nhuộm')}
                        ${fixedRow('cat_rate', cat)}
                        ${fixedRow('dye_rate', dye)}
                    </tbody>
                </table>
                <table class="w-full border-collapse text-xs border border-slate-200 rounded-lg">
                    ${head}
                    <tbody class="divide-y divide-slate-100">
                        ${grp('Cắt tỉa', "addSpaMatrixTier('cut')", 'Thêm bậc')}
                        ${cut.map((t, i) => tierRow('cut', t, i, cut.length)).join('')}
                        ${grp('Phụ thu', 'addSpaMatrixSurcharge()', 'Thêm phụ thu')}
                        ${surch.map(surchRow).join('')}
                    </tbody>
                </table>
            </div>`;
    }

    function parseRawMoney(val) {
        const cleaned = String(val || '').replace(/[^\d.-]/g, '');
        return parseFloat(cleaned) || 0;
    }

    window.onSpaMatrixProfileMetaChange = function(field, val) {
        const prof = getActiveMatrixProfile();
        if (!prof) return;
        prof[field] = val;
        if (field === 'calc_mode' || field === 'name') {
            renderSpaMatrixEditor(currentSpaMatrixConfig);
        }
    };

    window.onSpaMatrixFieldChange = function(group, idx, field, val) {
        const prof = getActiveMatrixProfile();
        if (!prof) return;
        if (group === 'bath_tier' && prof.bath_tiers && prof.bath_tiers[idx]) {
            prof.bath_tiers[idx][field] = val;
        } else if (group === 'cut_tier' && prof.cut_tiers && prof.cut_tiers[idx]) {
            prof.cut_tiers[idx][field] = val;
        } else if (group === 'surcharge' && prof.surcharge_rules && prof.surcharge_rules[idx]) {
            prof.surcharge_rules[idx][field] = val;
        }
    };

    window.onSpaMatrixMoneyChange = function(group, idx, tierKey, rawVal) {
        const prof = getActiveMatrixProfile();
        if (!prof) return;
        const num = parseRawMoney(rawVal);
        if (group === 'bath_tier' && prof.bath_tiers && prof.bath_tiers[idx]) {
            prof.bath_tiers[idx][tierKey] = num;
        } else if (group === 'cut_tier' && prof.cut_tiers && prof.cut_tiers[idx]) {
            prof.cut_tiers[idx][tierKey] = num;
        } else if (group === 'cat_rate') {
            prof.cat_rate = prof.cat_rate || {};
            prof.cat_rate[tierKey] = num;
        } else if (group === 'dye_rate') {
            prof.dye_rate = prof.dye_rate || {};
            prof.dye_rate[tierKey] = num;
        } else if (group === 'surcharge' && prof.surcharge_rules && prof.surcharge_rules[idx]) {
            prof.surcharge_rules[idx][tierKey] = num;
        }
        renderSpaMatrixEditor(currentSpaMatrixConfig);
    };

    window.switchSpaMatrixProfile = async function(profileId) {
        if (!currentSpaMatrixConfig) return;
        currentSpaMatrixConfig.active_profile_id = profileId;
        renderSpaMatrixEditor(currentSpaMatrixConfig);
        await saveSpaCommissionMatrix(true);
    };

    window.cloneNewSpaMatrixProfile = async function() {
        const base = getActiveMatrixProfile();
        if (!base) return;
        const newName = typeof window.showPromptModal === 'function'
            ? await window.showPromptModal({
                title: 'Tạo Mẫu Hoa Hồng Cơ Sở Mới',
                message: 'Nhập tên mẫu hoa hồng mới (nhân bản từ mẫu hiện tại):',
                defaultValue: `${base.name} (Cơ sở mới)`,
                confirmText: 'Tạo mẫu mới',
                type: 'primary'
            })
            : prompt('Nhập tên Mẫu Hoa Hồng cho Cơ Sở Mới:', `${base.name} (Cơ sở mới)`);
        if (!newName || !newName.trim()) return;
        const cloned = JSON.parse(JSON.stringify(base));
        cloned.id = 'branch_' + Date.now();
        cloned.name = newName.trim();
        currentSpaMatrixConfig.profiles.push(cloned);
        currentSpaMatrixConfig.active_profile_id = cloned.id;
        renderSpaMatrixEditor(currentSpaMatrixConfig);
        await saveSpaCommissionMatrix();
    };

    window.deleteActiveSpaMatrixProfile = async function() {
        if (!currentSpaMatrixConfig || currentSpaMatrixConfig.profiles.length <= 1) return;
        const prof = getActiveMatrixProfile();
        const ok = typeof window.showConfirmModal === 'function'
            ? await window.showConfirmModal({ title: 'Xóa mẫu hoa hồng?', message: `Bạn có chắc muốn xóa mẫu "${prof.name}"?`, confirmText: 'Xóa mẫu', type: 'danger' })
            : confirm(`Bạn có chắc muốn xóa mẫu "${prof.name}"?`);
        if (!ok) return;
        currentSpaMatrixConfig.profiles = currentSpaMatrixConfig.profiles.filter(p => p.id !== prof.id);
        currentSpaMatrixConfig.active_profile_id = currentSpaMatrixConfig.profiles[0].id;
        renderSpaMatrixEditor(currentSpaMatrixConfig);
        await saveSpaCommissionMatrix();
    };

    window.addSpaMatrixTier = function(type) {
        const prof = getActiveMatrixProfile();
        if (!prof) return;
        if (type === 'bath') {
            prof.bath_tiers = prof.bath_tiers || [];
            prof.bath_tiers.push({
                id: 'bath_' + Date.now(),
                label: 'Bậc mới',
                range_label: '<=50kg',
                max_kg: 50,
                official: 150000,
                probation: 125000
            });
        } else {
            prof.cut_tiers = prof.cut_tiers || [];
            prof.cut_tiers.push({
                id: 'cut_' + Date.now(),
                label: 'Cắt mới',
                range_label: '>40kg',
                max_kg: 999,
                official: 140000,
                probation: 120000
            });
        }
        renderSpaMatrixEditor(currentSpaMatrixConfig);
    };

    window.removeSpaMatrixTier = function(type, idx) {
        const prof = getActiveMatrixProfile();
        if (!prof) return;
        if (type === 'bath' && prof.bath_tiers && prof.bath_tiers.length > 1) {
            prof.bath_tiers.splice(idx, 1);
        } else if (type === 'cut' && prof.cut_tiers && prof.cut_tiers.length > 1) {
            prof.cut_tiers.splice(idx, 1);
        }
        renderSpaMatrixEditor(currentSpaMatrixConfig);
    };

    window.addSpaMatrixSurcharge = function() {
        const prof = getActiveMatrixProfile();
        if (!prof) return;
        prof.surcharge_rules = prof.surcharge_rules || [];
        prof.surcharge_rules.push({
            id: 'pt_custom_' + Date.now(),
            label: 'PT Mới',
            target_role: 'cutter',
            kind: 'custom',
            fee_threshold: 0,
            official: 25000,
            probation: 25000
        });
        renderSpaMatrixEditor(currentSpaMatrixConfig);
    };

    window.removeSpaMatrixSurcharge = function(idx) {
        const prof = getActiveMatrixProfile();
        if (!prof || !prof.surcharge_rules) return;
        prof.surcharge_rules.splice(idx, 1);
        renderSpaMatrixEditor(currentSpaMatrixConfig);
    };

    window.exportImportSpaMatrixModal = async function() {
        if (!currentSpaMatrixConfig) return;
        const jsonStr = JSON.stringify(currentSpaMatrixConfig, null, 2);
        const input = typeof window.showPromptModal === 'function'
            ? await window.showPromptModal({
                title: 'Xuất / Nhập Cấu Hình Hoa Hồng (JSON)',
                message: 'Sao chép chuỗi JSON bên dưới để mang sang Cơ sở khác, hoặc dán JSON mới vào để Nhập:',
                defaultValue: jsonStr,
                multiline: true,
                confirmText: 'Áp dụng JSON',
                type: 'primary'
            })
            : prompt('Sao chép hoặc dán chuỗi JSON:', jsonStr);
        if (!input || input.trim() === jsonStr.trim()) return;
        try {
            const parsed = JSON.parse(input);
            if (!parsed || !Array.isArray(parsed.profiles) || !parsed.profiles.length) {
                alert('Dữ liệu JSON không đúng định dạng mẫu hoa hồng Spa!');
                return;
            }
            currentSpaMatrixConfig = parsed;
            renderSpaMatrixEditor(currentSpaMatrixConfig);
            await saveSpaCommissionMatrix();
        } catch (e) {
            alert('Lỗi đọc JSON: ' + e.message);
        }
    };

    window.saveSpaCommissionMatrix = async function(silent = false) {
        if (!currentSpaMatrixConfig) return;
        const month = getSelectedMonth();
        try {
            const res = await fetch('/api/hrm/commissions/spa-matrix', {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(currentSpaMatrixConfig)
            });
            if (!res.ok) {
                const err = await res.json();
                alert(err.detail || 'Lỗi lưu bảng hoa hồng Spa');
                return;
            }
            if (!silent && window.showToast) {
                window.showToast('Đã lưu Bảng Cài Đặt Ma Trận Hoa Hồng Spa & tính lại số liệu tháng!', 'success');
            }
            await loadHrmCommissions(month);
        } catch (e) {
            console.error('saveSpaCommissionMatrix err:', e);
        }
    };
})();
