/**
 * Module HRM: Chấm Công, Bảng Lương, Tăng Ca, Tạm Ứng
 */
(function() {
    let currentSubTab = 'payroll';
    let payrollData = null;
    let attendanceData = null;
    let leavesData = [];

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
        updateMonthDisplay(monthStr);
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
                        <span class="text-[10px] px-1.5 py-0.5 rounded mt-1 font-semibold ${badgeClass}">${statusLabel}</span>
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
        updateMonthDisplay(picker.value);
        loadHrmCurrentSubTab();
    };

    window.setHrmCurrentMonth = function() {
        const picker = document.getElementById('hrm-month-picker');
        if (!picker) return;
        const now = new Date();
        picker.value = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
        updateMonthDisplay(picker.value);
        loadHrmCurrentSubTab();
    };

    window.switchHrmSubTab = function(sub) {
        currentSubTab = sub;
        ['payroll', 'attendance', 'leaves', 'overtime', 'advances', 'adjustments', 'staff', 'config'].forEach(s => {
            const pane = document.getElementById(`hrm-subtab-${s}`);
            const btn = document.getElementById(`btn-hrm-tab-${s}`);
            if (pane) pane.classList.toggle('hidden', s !== sub);
            if (btn) {
                if (s === sub) {
                    btn.className = "px-3 py-1 rounded-md bg-white text-emerald-700 shadow-xs cursor-pointer font-bold";
                } else {
                    btn.className = "px-3 py-1 rounded-md text-slate-600 hover:text-slate-900 cursor-pointer";
                }
            }
        });
        loadHrmCurrentSubTab();
    };

    window.loadHrmCurrentSubTab = function() {
        const month = getSelectedMonth();
        if (currentSubTab === 'payroll') loadHrmPayroll(month);
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
        switchHrmSubTab(currentSubTab);
    };

    // ── Bảng Lương ──
    async function loadHrmPayroll(month) {
        try {
            const res = await fetch(`/api/hrm/payroll/${month}`);
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
            badge.className = "px-2.5 py-0.5 rounded-full text-xs font-bold bg-purple-100 text-purple-800";
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

        const tbody = document.getElementById('table-hrm-payroll');
        if (!data.lines || data.lines.length === 0) {
            tbody.innerHTML = `<tr><td colspan="21" class="p-6 text-center text-slate-400">Chưa có dữ liệu bảng lương tháng này. Hãy bấm "Tính Lương" để khởi tạo.</td></tr>`;
            return;
        }

        tbody.innerHTML = data.lines.map(l => `
            <tr class="hover:bg-slate-50">
                <td class="p-2.5 font-mono font-bold text-slate-700">${l.employee_code || ''}</td>
                <td class="p-2.5 font-bold text-slate-900">${l.name || ''}</td>
                <td class="p-2.5 text-slate-600">${l.block || ''}</td>
                <td class="p-2.5 text-center">${l.std_days || 0}</td>
                <td class="p-2.5 text-center font-bold text-emerald-700">${l.days_official || 0}</td>
                <td class="p-2.5 text-center font-bold text-amber-600">${l.days_probation || 0}</td>
                <td class="p-2.5 text-right font-mono">${(l.base_salary || 0).toLocaleString('vi-VN')}</td>
                <td class="p-2.5 text-right font-mono font-bold">${(l.pay_days || 0).toLocaleString('vi-VN')}</td>
                <td class="p-2.5 text-right font-mono">${(l.allowance || 0).toLocaleString('vi-VN')}</td>
                <td class="p-2.5 text-right font-mono">${(l.holiday_pay || 0).toLocaleString('vi-VN')}</td>
                <td class="p-2.5 text-right font-mono text-sky-700">${(l.commission || 0).toLocaleString('vi-VN')}</td>
                <td class="p-2.5 text-right font-mono text-purple-700">${(l.spa_commission || 0).toLocaleString('vi-VN')}</td>
                <td class="p-2.5 text-right font-mono text-indigo-700">${(l.tips || 0).toLocaleString('vi-VN')}</td>
                <td class="p-2.5 text-right font-mono text-emerald-700">${(l.attendance_bonus || 0).toLocaleString('vi-VN')}</td>
                <td class="p-2.5 text-right font-mono">${(l.birthday_bonus || 0).toLocaleString('vi-VN')}</td>
                <td class="p-2.5 text-right font-mono font-bold text-amber-700">${(l.ot_pay || 0).toLocaleString('vi-VN')}</td>
                <td onclick="viewHrmStaffDaysDetail(${l.staff_id})" class="p-2.5 text-right font-mono font-bold text-rose-600 cursor-pointer hover:bg-rose-50 hover:underline" title="Bấm xem chi tiết phút trễ & phạt vi phạm">-${(l.penalties || 0).toLocaleString('vi-VN')}</td>
                <td class="p-2.5 text-right font-mono font-bold text-rose-600">-${(l.advances || 0).toLocaleString('vi-VN')}</td>
                <td class="p-2.5 text-right font-mono font-bold text-indigo-700">${l.insurance ? '-' + Number(l.insurance).toLocaleString('vi-VN') : '—'}</td>
                <td class="p-2.5 text-right font-mono font-bold text-indigo-700">${l.pit ? '-' + Number(l.pit).toLocaleString('vi-VN') : '—'}</td>
                <td class="p-2.5 text-right font-mono font-black text-sm text-emerald-700">${(l.net_rounded || 0).toLocaleString('vi-VN')}đ</td>
                <td class="p-2.5 text-center">${l.cashbook_code ? `<span class="px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-100 text-emerald-800">${l.cashbook_code}</span>` : `<span class="text-slate-400">Chưa chi</span>`}</td>
                <td class="p-2.5 text-center whitespace-nowrap">
                    <button onclick="viewHrmStaffDaysDetail(${l.staff_id})" class="text-emerald-700 hover:underline font-bold mr-2 cursor-pointer">Chi tiết công</button>
                    <button onclick="editHrmLine(${l.staff_id}, ${l.bonus_other || 0}, ${l.fuel_other || 0}, ${l.deduction_other || 0}, '${(l.manual_note || '').replace(/'/g, "\\'")}')" class="text-sky-600 hover:underline font-bold mr-2 cursor-pointer">Sửa số</button>
                </td>
            </tr>
        `).join('');

        const foot = document.getElementById('table-hrm-payroll-foot');
        const tot = data.totals || {};
        foot.innerHTML = `
            <tr>
                <td colspan="6" class="p-2.5 text-right uppercase">Tổng cộng:</td>
                <td class="p-2.5 text-right font-mono">${(tot.base_salary || 0).toLocaleString('vi-VN')}</td>
                <td class="p-2.5 text-right font-mono font-bold">${(tot.pay_days || 0).toLocaleString('vi-VN')}</td>
                <td class="p-2.5 text-right font-mono">${(tot.allowance || 0).toLocaleString('vi-VN')}</td>
                <td class="p-2.5 text-right font-mono">${(tot.holiday_pay || 0).toLocaleString('vi-VN')}</td>
                <td class="p-2.5 text-right font-mono">${(tot.commission || 0).toLocaleString('vi-VN')}</td>
                <td class="p-2.5 text-right font-mono">${(tot.spa_commission || 0).toLocaleString('vi-VN')}</td>
                <td class="p-2.5 text-right font-mono">${(tot.tips || 0).toLocaleString('vi-VN')}</td>
                <td class="p-2.5 text-right font-mono">${(tot.attendance_bonus || 0).toLocaleString('vi-VN')}</td>
                <td class="p-2.5 text-right font-mono">${(tot.birthday_bonus || 0).toLocaleString('vi-VN')}</td>
                <td class="p-2.5 text-right font-mono">${(tot.ot_pay || 0).toLocaleString('vi-VN')}</td>
                <td class="p-2.5 text-right font-mono text-rose-600">-${(tot.penalties || 0).toLocaleString('vi-VN')}</td>
                <td class="p-2.5 text-right font-mono text-rose-600">-${(tot.advances || 0).toLocaleString('vi-VN')}</td>
                <td class="p-2.5 text-right font-mono text-indigo-700">${tot.insurance ? '-' + Number(tot.insurance).toLocaleString('vi-VN') : '—'}</td>
                <td class="p-2.5 text-right font-mono text-indigo-700">${tot.pit ? '-' + Number(tot.pit).toLocaleString('vi-VN') : '—'}</td>
                <td class="p-2.5 text-right font-mono font-black text-emerald-800 text-sm">${(tot.net_pay || 0).toLocaleString('vi-VN')}đ</td>
                <td colspan="2"></td>
            </tr>
        `;
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

    window.lockHrmPayroll = async function() {
        const month = getSelectedMonth();
        const conf = await window.showConfirmModal({
            title: "Chốt Bảng Lương",
            message: `Bạn có chắc chắn muốn CHỐT bảng lương tháng ${month}? Sau khi chốt, dữ liệu chấm công và tăng ca của tháng này sẽ bị khóa hoàn toàn.`,
            confirmText: "Chốt Lương",
            type: "warning"
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

    async function loadHrmAttendance(month) {
        try {
            const res = await fetch(`/api/hrm/attendance?month=${month}`);
            if (!res.ok) return;
            attendanceData = await res.json();
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

            const staffSel = document.getElementById('hrm-att-filter-staff');
            if (staffSel && attendanceData && attendanceData.employees) {
                const curVal = staffSel.value;
                staffSel.innerHTML = '<option value="">Tất cả nhân viên</option>' +
                    attendanceData.employees.map(e => `<option value="${e.staff_id}" ${curVal == e.staff_id ? 'selected' : ''}>${e.employee_code || 'NV' + e.staff_id} - ${e.name}</option>`).join('');
            }
            renderAttendanceDetailTable();
        }
    };

    window.renderAttendanceDetailTable = function() {
        if (!attendanceData || !attendanceData.employees) return;
        const tbody = document.getElementById('table-hrm-att-detail-body');
        const countEl = document.getElementById('hrm-att-detail-count');
        if (!tbody) return;

        const filterStatus = document.getElementById('hrm-att-filter-status')?.value || 'late_viol';
        const filterStaff = document.getElementById('hrm-att-filter-staff')?.value || '';
        const filterDate = document.getElementById('hrm-att-filter-date')?.value || '';

        const dayNames = ['CN', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7'];
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

        rows.sort((a, b) => b.day.date.localeCompare(a.day.date) || a.emp.name.localeCompare(b.emp.name));

        if (countEl) countEl.textContent = `${rows.length} dòng hiển thị`;

        if (rows.length === 0) {
            tbody.innerHTML = `<tr><td colspan="15" class="p-8 text-center text-slate-400">Không có dữ liệu chấm công thỏa điều kiện lọc.</td></tr>`;
            return;
        }

        tbody.innerHTML = rows.map(({ emp, day }) => {
            const dt = new Date(day.date);
            const dayOfWeek = dayNames[dt.getDay()];
            const isSun = dt.getDay() === 0;

            let codeBadge = `<span class="px-2 py-0.5 rounded text-[11px] font-bold bg-slate-100 text-slate-500">-</span>`;
            if (day.code === 'X') codeBadge = `<span class="px-2 py-0.5 rounded text-[11px] font-bold bg-emerald-100 text-emerald-800 border border-emerald-200">X (1.0)</span>`;
            else if (day.code === 'X/2') codeBadge = `<span class="px-2 py-0.5 rounded text-[11px] font-bold bg-sky-100 text-sky-800 border border-sky-200">X/2 (0.5)</span>`;
            else if (day.code === 'TV') codeBadge = `<span class="px-2 py-0.5 rounded text-[11px] font-bold bg-amber-100 text-amber-800 border border-amber-200">TV (1.0)</span>`;
            else if (day.code === 'TV/2') codeBadge = `<span class="px-2 py-0.5 rounded text-[11px] font-bold bg-amber-200 text-amber-900 border border-amber-300">TV/2 (0.5)</span>`;
            else if (day.code === 'OFF') codeBadge = `<span class="px-2 py-0.5 rounded text-[11px] font-bold bg-slate-200 text-slate-700">OFF</span>`;
            else if (day.code === 'L') codeBadge = `<span class="px-2 py-0.5 rounded text-[11px] font-bold bg-purple-100 text-purple-800 border border-purple-200">L (Lễ)</span>`;
            else if (day.code === 'CN') codeBadge = `<span class="px-2 py-0.5 rounded text-[11px] font-medium bg-slate-50 text-slate-400">CN</span>`;

            let viols = [];
            (day.violations || []).forEach(v => {
                if (v === 'late') viols.push(`<span class="px-1.5 py-0.5 bg-rose-100 text-rose-700 rounded text-[10px] font-bold">Trễ ${day.late_min}p</span>`);
                else if (v === 'early') viols.push(`<span class="px-1.5 py-0.5 bg-amber-100 text-amber-700 rounded text-[10px] font-bold">Về sớm ${day.early_min}p</span>`);
                else if (v === 'missing_in') viols.push(`<span class="px-1.5 py-0.5 bg-rose-100 text-rose-700 rounded text-[10px] font-bold">Quên vào (-50k)</span>`);
                else if (v === 'missing_out') viols.push(`<span class="px-1.5 py-0.5 bg-rose-100 text-rose-700 rounded text-[10px] font-bold">Quên ra (-50k)</span>`);
                else if (v === 'absent') viols.push(`<span class="px-1.5 py-0.5 bg-red-200 text-red-900 rounded text-[10px] font-bold">Vắng (-500k)</span>`);
            });

            const workedHours = day.worked_min > 0 ? (day.worked_min / 60).toFixed(1) + 'h' : '—';
            const lateText = day.late_min > 0 ? `<span class="text-rose-600 font-bold">${day.late_min}p</span>` : '<span class="text-slate-300">—</span>';
            const earlyText = day.early_min > 0 ? `<span class="text-amber-600 font-bold">${day.early_min}p</span>` : '<span class="text-slate-300">—</span>';
            const penText = day.penalty > 0 ? `<span class="text-rose-600 font-mono font-black">-${day.penalty.toLocaleString('vi-VN')}đ</span>` : (day.waive ? '<span class="text-emerald-700 font-bold bg-emerald-50 px-1 py-0.5 rounded border border-emerald-200 text-[10px]">0đ (Miễn)</span>' : '<span class="text-slate-300">—</span>');

            const switchHtml = `
                <div class="flex items-center justify-center gap-1.5">
                    <label class="relative inline-flex items-center cursor-pointer">
                        <input type="checkbox" onchange="toggleHrmWaive(${emp.staff_id}, '${day.date}', ${day.waive ? 'true' : 'false'})" class="sr-only peer" ${day.waive ? 'checked' : ''}>
                        <div class="w-8 h-4 bg-slate-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-3 after:w-3 after:transition-all peer-checked:bg-emerald-600"></div>
                    </label>
                    <span class="text-[10px] font-bold ${day.waive ? 'text-emerald-700' : 'text-slate-400'}">${day.waive ? 'Miễn' : 'Phạt'}</span>
                </div>
            `;

            const noteHtml = day.note ? `<span class="italic text-slate-700 bg-slate-50 px-1.5 py-0.5 rounded border border-slate-200 text-[11px] block max-w-[160px] truncate" title="${day.note}">${day.note}</span>` : '<span class="text-slate-300">—</span>';

            return `
                <tr class="hover:bg-slate-50 ${isSun ? 'bg-slate-50/50' : ''}">
                    <td class="p-2.5 font-mono font-bold text-slate-800 whitespace-nowrap">${day.date} <span class="${isSun ? 'text-rose-600' : 'text-slate-500'}">(${dayOfWeek})</span></td>
                    <td class="p-2.5 font-mono text-purple-700 font-bold">${emp.employee_code || 'NV' + emp.staff_id}</td>
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
                        <button onclick="openHrmEditDayModal(${emp.staff_id}, '${day.date}', '${day.code}')" class="text-sky-600 hover:underline font-bold cursor-pointer text-[11px]">✏️ Sửa</button>
                    </td>
                </tr>
            `;
        }).join('');
    };

    window.toggleHrmWaive = async function(staffId, workDate, currentWaive) {
        let note = "";
        if (!currentWaive) {
            const reason = prompt("Nhập lý do miễn phạt (ví dụ: Quên quẹt thẻ / Sự cố máy / Sếp duyệt):", "Sếp duyệt miễn phạt");
            if (reason === null) {
                renderAttendanceDetailTable();
                return;
            }
            note = reason.trim();
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
                alert(data.detail || "Lỗi cập nhật miễn phạt");
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

        let th = `<tr><th class="p-2 sticky left-0 bg-slate-50 z-10 border-r">Nhân Viên</th>`;
        for (let d = 1; d <= numDays; d++) {
            th += `<th class="p-1 text-center w-8 text-[11px]">${d}</th>`;
        }
        th += `<th class="p-2 text-center border-l">Tổng công</th><th class="p-2 text-right">Phạt</th></tr>`;
        thead.innerHTML = th;

        if (!data.employees || data.employees.length === 0) {
            tbody.innerHTML = `<tr><td colspan="${numDays + 3}" class="p-6 text-center text-slate-400">Không có nhân sự nào được cấu hình chấm công.</td></tr>`;
            return;
        }

        tbody.innerHTML = data.employees.map(e => {
            let row = `<tr><td class="p-2 font-bold text-slate-800 sticky left-0 bg-white z-10 border-r whitespace-nowrap">${e.name} <span class="text-[10px] text-slate-400 font-normal">(${e.block})</span></td>`;
            const dayMap = {};
            (e.days || []).forEach(d => {
                const dayNum = parseInt(d.date.split('-')[2]);
                dayMap[dayNum] = d;
            });
            for (let d = 1; d <= numDays; d++) {
                const dayRes = dayMap[d];
                if (!dayRes) {
                    row += `<td class="p-1 text-center text-slate-300">-</td>`;
                } else {
                    let cls = "text-slate-600";
                    if (dayRes.code === 'X') cls = "font-bold text-emerald-600 bg-emerald-50/50";
                    else if (dayRes.code === 'X/2') cls = "font-bold text-sky-600 bg-sky-50/50";
                    else if (dayRes.code === 'TV') cls = "font-bold text-amber-600 bg-amber-50/50";
                    else if (dayRes.code === 'TV/2') cls = "font-bold text-amber-900 bg-amber-100/80 border border-amber-300";
                    else if (dayRes.code === 'OFF') cls = "text-slate-400 bg-slate-100";
                    else if (dayRes.code === 'L') cls = "font-bold text-purple-700 bg-purple-50";

                    if (dayRes.penalty > 0) cls += " border-b-2 border-rose-500";
                    row += `<td onclick="openHrmEditDayModal(${e.staff_id}, '${dayRes.date}', '${dayRes.code}')" class="p-1 text-center text-[11px] cursor-pointer hover:ring-1 hover:ring-sky-500 ${cls}" title="${dayRes.punches?.join(', ') || ''}">${dayRes.code || '-'}</td>`;
                }
            }
            row += `<td class="p-2 text-center font-bold text-emerald-700 border-l">${e.credit || 0}</td><td class="p-2 text-right font-mono text-rose-600">${(e.penalty || 0).toLocaleString('vi-VN')}</td></tr>`;
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
            let msg = `Đã import thành công ${data.imported} bản ghi.`;
            if (data.unknown_codes && data.unknown_codes.length > 0) {
                msg += ` Bỏ qua ${data.unknown_codes.length} mã máy chưa gán cho nhân viên.`;
            }
            if (window.showToast) window.showToast(msg, 'success');
            loadHrmAttendance(getSelectedMonth());
        } catch (e) {
            console.error(e);
        }
    };

    // ── Xin Off ──
    async function loadHrmLeaves(month) {
        month = month || getSelectedMonth();
        try {
            const res = await fetch(`/api/hrm/leaves?month=${month}`);
            if (!res.ok) throw new Error("Lỗi tải danh sách xin off");
            leavesData = await res.json();

            // Populate staff filter
            const filterEl = document.getElementById('hrm-leaves-staff-filter');
            if (filterEl) {
                const currentFilter = filterEl.value;
                const staffMap = {};
                leavesData.forEach(l => {
                    if (l.staff_id) staffMap[l.staff_id] = l.staff_name;
                });
                filterEl.innerHTML = '<option value="">-- Tất cả nhân viên --</option>' +
                    Object.keys(staffMap).map(sid => `<option value="${sid}">${staffMap[sid]}</option>`).join('');
                filterEl.value = currentFilter;
            }
            renderHrmLeavesTable();
        } catch (e) {
            console.error("Lỗi loadHrmLeaves:", e);
        }
    }
    window.loadHrmLeaves = loadHrmLeaves;

    window.renderHrmLeavesTable = function() {
        const tbody = document.getElementById('table-hrm-leaves');
        if (!tbody) return;
        const filterSid = document.getElementById('hrm-leaves-staff-filter')?.value;
        const list = filterSid ? leavesData.filter(l => String(l.staff_id) === filterSid) : leavesData;

        if (!list || list.length === 0) {
            tbody.innerHTML = `<tr><td colspan="8" class="p-6 text-center text-slate-400">Chưa có đơn xin nghỉ nào trong tháng.</td></tr>`;
            return;
        }

        tbody.innerHTML = list.map(l => {
            let badge = '<span class="px-2 py-0.5 rounded-full text-[11px] font-semibold bg-purple-100 text-purple-800">Off cả ngày</span>';
            if (l.leave_type === 'off_morning') {
                badge = '<span class="px-2 py-0.5 rounded-full text-[11px] font-semibold bg-sky-100 text-sky-800">Off Buổi Sáng (0.5 công)</span>';
            } else if (l.leave_type === 'off_afternoon') {
                badge = '<span class="px-2 py-0.5 rounded-full text-[11px] font-semibold bg-amber-100 text-amber-800">Off Buổi Chiều (0.5 công)</span>';
            }

            return `
                <tr class="hover:bg-slate-50 transition-colors">
                    <td class="p-2.5 font-bold text-slate-700">${l.work_date}</td>
                    <td class="p-2.5 font-medium text-slate-500">${l.staff_code || 'NV' + l.staff_id}</td>
                    <td class="p-2.5 font-bold text-slate-800">${l.staff_name}</td>
                    <td class="p-2.5 text-slate-500">${l.department || l.position || '-'}</td>
                    <td class="p-2.5 text-center">${badge}</td>
                    <td class="p-2.5 text-slate-600 max-w-xs truncate" title="${l.reason || ''}">${l.reason || '-'}</td>
                    <td class="p-2.5 text-slate-500">${l.approved_by || '-'}</td>
                    <td class="p-2.5 text-center whitespace-nowrap">
                        <button onclick="openHrmLeaveModal(${l.id})" class="text-blue-600 hover:text-blue-800 font-bold px-1.5 py-0.5 rounded hover:bg-blue-50 cursor-pointer">✏️ Sửa</button>
                        <button onclick="deleteHrmLeave(${l.id})" class="text-rose-600 hover:text-rose-800 font-bold px-1.5 py-0.5 rounded hover:bg-rose-50 cursor-pointer ml-1">🗑️ Xóa</button>
                    </td>
                </tr>
            `;
        }).join('');
    };

    window.openHrmLeaveModal = async function(id) {
        const staffSelect = document.getElementById('hrm-leave-staff-id');
        const dateInput = document.getElementById('hrm-leave-date');
        const typeSelect = document.getElementById('hrm-leave-type');
        const reasonInput = document.getElementById('hrm-leave-reason');
        const approverInput = document.getElementById('hrm-leave-approved-by');
        const idInput = document.getElementById('hrm-leave-id');
        const titleEl = document.getElementById('modal-hrm-leave-title');

        try {
            const res = await fetch('/api/staff');
            if (res.ok) {
                const staffList = await res.json();
                staffSelect.innerHTML = '<option value="">-- Chọn nhân viên --</option>' +
                    staffList.filter(s => s.is_active).map(s => `<option value="${s.id}">${s.name} (${s.employee_code || 'NV' + s.id})</option>`).join('');
            }
        } catch (e) {
            console.error(e);
        }

        if (id) {
            const item = leavesData.find(x => x.id === id);
            if (item) {
                if (idInput) idInput.value = item.id;
                if (staffSelect) staffSelect.value = item.staff_id;
                if (dateInput) dateInput.value = item.work_date;
                if (typeSelect) typeSelect.value = item.leave_type;
                if (reasonInput) reasonInput.value = item.reason || '';
                if (approverInput) approverInput.value = item.approved_by || '';
                if (titleEl) titleEl.textContent = 'Cập Nhật Đơn Xin Off';
            }
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
        if (!confirm("Xác nhận xóa đơn xin nghỉ này và khôi phục chấm công?")) return;
        try {
            const res = await fetch(`/api/hrm/leaves/${id}`, { method: 'DELETE' });
            if (!res.ok) {
                const data = await res.json();
                alert(data.detail || "Lỗi xóa đơn xin off");
                return;
            }
            loadHrmLeaves();
            if (window.showToast) window.showToast("Đã xóa đơn xin off thành công", "success");
        } catch (e) {
            console.error("Lỗi deleteHrmLeave:", e);
            alert("Lỗi kết nối máy chủ");
        }
    };

    window.syncHrmLeavesFromSheets = async function() {
        if (!confirm("Bắt đầu đồng bộ danh sách Xin Off từ Google Sheets (GID: 1879481422)?")) return;
        try {
            const res = await fetch('/api/hrm/leaves/sync-sheets', { method: 'POST' });
            const data = await res.json();
            if (!res.ok) {
                alert(data.detail || "Lỗi đồng bộ từ Google Sheets");
                return;
            }
            alert(data.message || `Đồng bộ thành công ${data.synced_count} bản ghi`);
            loadHrmLeaves();
        } catch (e) {
            console.error("Lỗi syncHrmLeavesFromSheets:", e);
            alert("Lỗi kết nối khi đồng bộ Google Sheets");
        }
    };

    // ── Tăng Ca (Overtime) ──
    async function loadHrmOvertime(month) {
        try {
            const res = await fetch(`/api/hrm/overtime?month=${month}`);
            if (!res.ok) return;
            const data = await res.json();
            const tbody = document.getElementById('table-hrm-overtime');
            if (!tbody) return;
            if (!data || data.length === 0) {
                tbody.innerHTML = `<tr><td colspan="6" class="p-6 text-center text-slate-400">Chưa có bản ghi tăng ca nào trong tháng ${month}.</td></tr>`;
                return;
            }
            tbody.innerHTML = data.map(r => `
                <tr class="hover:bg-slate-50">
                    <td class="p-2.5 font-mono">${r.work_date}</td>
                    <td class="p-2.5 font-bold text-slate-800">${r.staff_name || ''}</td>
                    <td class="p-2.5 font-bold text-purple-700 font-mono">${r.hours}h</td>
                    <td class="p-2.5 text-slate-600">${r.note || '-'}</td>
                    <td class="p-2.5 text-slate-500">${r.approved_by || '-'}</td>
                    <td class="p-2.5 text-center">
                        <button onclick="deleteHrmOvertime(${r.id})" class="text-rose-600 hover:text-rose-800 font-bold p-1 cursor-pointer" title="Xóa">✕</button>
                    </td>
                </tr>
            `).join('');
        } catch (e) {
            console.error("Lỗi tải tăng ca:", e);
        }
    }
    window.loadHrmOvertime = loadHrmOvertime;

    window.openHrmOvertimeModal = async function() {
        const staffSelect = document.getElementById('hrm-ot-staff-id');
        const dateInput = document.getElementById('hrm-ot-date');
        const hoursInput = document.getElementById('hrm-ot-hours');
        const noteInput = document.getElementById('hrm-ot-note');
        if (dateInput) dateInput.value = new Date().toISOString().slice(0, 10);
        if (hoursInput) hoursInput.value = '';
        if (noteInput) noteInput.value = '';

        try {
            const res = await fetch('/api/staff');
            if (res.ok) {
                const staffList = await res.json();
                staffSelect.innerHTML = '<option value="">-- Chọn nhân viên --</option>' +
                    staffList.filter(s => s.is_active).map(s => `<option value="${s.id}">${s.name} (${s.employee_code || 'NV' + s.id})</option>`).join('');
            }
        } catch (e) {
            console.error(e);
        }

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
        if (!confirm("Bạn có chắc muốn xóa bản ghi tăng ca này?")) return;
        try {
            const res = await fetch(`/api/hrm/overtime/${id}`, { method: 'DELETE' });
            if (res.ok) {
                if (window.showToast) window.showToast("Đã xóa bản ghi tăng ca", "success");
                loadHrmOvertime(getSelectedMonth());
            } else {
                const data = await res.json();
                alert(data.detail || "Lỗi xóa bản ghi tăng ca");
            }
        } catch (e) {
            console.error(e);
        }
    };

    // ── Tạm Ứng (Advances) ──
    async function loadHrmAdvances(month) {
        try {
            const res = await fetch(`/api/hrm/advances?month=${month}`);
            if (!res.ok) return;
            const data = await res.json();
            const tbody = document.getElementById('table-hrm-advances');
            if (!tbody) return;
            if (!data || data.length === 0) {
                tbody.innerHTML = `<tr><td colspan="7" class="p-6 text-center text-slate-400">Chưa có khoản tạm ứng nào trong tháng ${month}.</td></tr>`;
                return;
            }
            tbody.innerHTML = data.map(r => `
                <tr class="hover:bg-slate-50">
                    <td class="p-2.5 font-mono">${r.advance_date}</td>
                    <td class="p-2.5 font-bold text-slate-800">${r.staff_name || ''}</td>
                    <td class="p-2.5 text-right font-mono font-bold text-rose-600">${(r.amount || 0).toLocaleString('vi-VN')} đ</td>
                    <td class="p-2.5">${r.cashbook_code ? `<span class="px-2 py-0.5 rounded text-[10px] font-bold bg-sky-100 text-sky-800">${r.cashbook_code}</span>` : `<span class="text-slate-400">--</span>`}</td>
                    <td class="p-2.5 text-slate-600">${r.note || '-'}</td>
                    <td class="p-2.5 text-slate-500">${r.created_by || '-'}</td>
                    <td class="p-2.5 text-center">
                        <button onclick="deleteHrmAdvance(${r.id})" class="text-rose-600 hover:text-rose-800 font-bold p-1 cursor-pointer" title="Xóa">✕</button>
                    </td>
                </tr>
            `).join('');
        } catch (e) {
            console.error("Lỗi tải tạm ứng:", e);
        }
    }
    window.loadHrmAdvances = loadHrmAdvances;

    window.openHrmAdvanceModal = async function() {
        const staffSelect = document.getElementById('hrm-adv-staff-id');
        const dateInput = document.getElementById('hrm-adv-date');
        const amountInput = document.getElementById('hrm-adv-amount');
        const accSelect = document.getElementById('hrm-adv-account-id');
        const noteInput = document.getElementById('hrm-adv-note');

        if (dateInput) dateInput.value = new Date().toISOString().slice(0, 10);
        if (amountInput) amountInput.value = '';
        if (noteInput) noteInput.value = '';

        try {
            const [resStaff, resAcc] = await Promise.all([
                fetch('/api/staff'),
                fetch('/api/payment-accounts')
            ]);
            if (resStaff.ok) {
                const staffList = await resStaff.json();
                staffSelect.innerHTML = '<option value="">-- Chọn nhân viên --</option>' +
                    staffList.filter(s => s.is_active).map(s => `<option value="${s.id}">${s.name} (${s.employee_code || 'NV' + s.id})</option>`).join('');
            }
            if (resAcc.ok) {
                const accList = await resAcc.json();
                accSelect.innerHTML = '<option value="">-- Không sinh phiếu chi sổ quỹ --</option>' +
                    accList.map(a => `<option value="${a.id}">${a.name} (${a.type === 'bank' ? 'Ngân hàng' : 'Tiền mặt'})</option>`).join('');
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
        if (!confirm("Bạn có chắc muốn xóa khoản tạm ứng này? Nếu có phiếu chi sổ quỹ liên kết, phiếu chi cũng sẽ bị hủy.")) return;
        try {
            const res = await fetch(`/api/hrm/advances/${id}`, { method: 'DELETE' });
            if (res.ok) {
                if (window.showToast) window.showToast("Đã xóa khoản tạm ứng", "success");
                loadHrmAdvances(getSelectedMonth());
            } else {
                const data = await res.json();
                alert(data.detail || "Lỗi xóa khoản tạm ứng");
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
                                <button onclick="openEditBlockModal(${b.id})" class="px-2 py-0.5 bg-emerald-50 text-emerald-700 hover:bg-emerald-100 rounded text-[11px] font-bold cursor-pointer">✏️ Sửa</button>
                                <button onclick="deleteHrmBlock(${b.id})" class="px-2 py-0.5 bg-rose-50 text-rose-700 hover:bg-rose-100 rounded text-[11px] font-bold cursor-pointer" title="Xóa khối">🗑️</button>
                            </div>
                        </div>
                        <div class="text-[11px] text-slate-600 space-y-1">
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
                        <div class="p-2 bg-purple-50 border border-purple-200/70 rounded-lg flex items-center justify-between text-xs">
                            <div>
                                <div class="font-bold text-purple-900">${h.name}</div>
                                <div class="text-[10px] text-purple-600 font-mono">${h.holiday_date}</div>
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
                    spaRulesList.innerHTML = `
                        <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-2 text-xs">
                            ${data.spa_rules.map(sr => `
                                <div class="p-2.5 bg-slate-50 border rounded-lg">
                                    <div class="font-bold text-slate-800 uppercase">${sr.role_key}</div>
                                    <div class="text-slate-600 text-[11px] mt-1">${sr.service_name || 'Tất cả dịch vụ'}: <span class="font-bold text-purple-700">${sr.rate_percent ? sr.rate_percent + '%' : (sr.fixed_amount || 0).toLocaleString('vi-VN') + ' đ'}</span></div>
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
            label.className = isEnterprise ? "text-xs font-bold text-indigo-700" : "text-xs font-bold text-slate-600";
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
            payroll_mode: isEnt ? 'enterprise' : 'sme',
            insurance_rate: (insPct / 100).toFixed(3),
            insurance_cap: parseVal('cfg-insurance-cap'),
            tax_self_deduction: parseVal('cfg-tax-self'),
            tax_dependent_deduction: parseVal('cfg-tax-dep')
        };

        try {
            const res = await fetch('/api/hrm/config/rules', {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(body)
            });
            const data = await res.json();
            if (!res.ok) {
                alert(data.detail || "Lỗi lưu quy định");
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
        if (!confirm("Bạn có chắc muốn xóa khối làm việc này?")) return;
        try {
            const res = await fetch(`/api/hrm/config/blocks/${id}`, { method: 'DELETE' });
            if (res.ok) {
                if (window.showToast) window.showToast("Đã xóa khối làm việc", "success");
                loadHrmConfig();
            } else {
                const data = await res.json();
                alert(data.detail || "Lỗi xóa khối làm việc");
            }
        } catch (e) {
            console.error(e);
        }
    };

    window.addHrmHoliday = async function() {
        const date = document.getElementById('cfg-new-holiday-date')?.value;
        const name = document.getElementById('cfg-new-holiday-name')?.value.trim();
        if (!date || !name) {
            alert("Vui lòng chọn ngày và nhập tên ngày lễ");
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
                alert(data.detail || "Lỗi thêm ngày lễ");
            }
        } catch (e) {
            console.error(e);
        }
    };

    window.deleteHrmHoliday = async function(date) {
        if (!confirm(`Xóa ngày lễ ${date}?`)) return;
        try {
            const res = await fetch(`/api/hrm/config/holidays/${date}`, { method: 'DELETE' });
            if (res.ok) {
                if (window.showToast) window.showToast("Đã xóa ngày lễ", "success");
                loadHrmConfig();
            } else {
                const data = await res.json();
                alert(data.detail || "Lỗi xóa ngày lễ");
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

    // ── Sửa Dòng Bảng Lương (Payroll Line Adjustment) ──
    window.editHrmLine = function(staffId, bonusOther, fuelOther, deductionOther, note) {
        document.getElementById('hrm-line-staff-id').value = staffId;
        let staffName = 'Nhân viên';
        if (payrollData && payrollData.lines) {
            const line = payrollData.lines.find(l => l.staff_id === staffId);
            if (line) staffName = `${line.name} (${line.employee_code || 'NV' + line.staff_id})`;
        }
        document.getElementById('hrm-line-staff-name').textContent = staffName;
        document.getElementById('hrm-line-bonus-other').value = bonusOther ? Number(bonusOther).toLocaleString('vi-VN') : '';
        document.getElementById('hrm-line-fuel-other').value = fuelOther ? Number(fuelOther).toLocaleString('vi-VN') : '';
        document.getElementById('hrm-line-deduction-other').value = deductionOther ? Number(deductionOther).toLocaleString('vi-VN') : '';
        document.getElementById('hrm-line-manual-note').value = note || '';

        const modal = document.getElementById('modal-hrm-edit-line');
        if (modal) modal.classList.remove('hidden');
    };

    window.closeHrmEditLineModal = function() {
        const modal = document.getElementById('modal-hrm-edit-line');
        if (modal) modal.classList.add('hidden');
    };

    window.submitHrmEditLine = async function() {
        const staffId = parseInt(document.getElementById('hrm-line-staff-id')?.value);
        const month = getSelectedMonth();
        const parseVal = id => {
            const val = document.getElementById(id)?.value;
            return typeof parseMoneyInput === 'function' ? parseMoneyInput(val) : (parseFloat((val || '').replace(/\D/g, '')) || 0);
        };

        const body = {
            bonus_other: parseVal('hrm-line-bonus-other'),
            fuel_other: parseVal('hrm-line-fuel-other'),
            deduction_other: parseVal('hrm-line-deduction-other'),
            manual_note: document.getElementById('hrm-line-manual-note')?.value.trim()
        };

        try {
            const res = await fetch(`/api/hrm/payroll/${month}/lines/${staffId}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(body)
            });
            const data = await res.json();
            if (!res.ok) {
                alert(data.detail || "Lỗi cập nhật dòng lương");
                return;
            }
            if (window.showToast) window.showToast("Đã lưu điều chỉnh dòng lương", "success");
            closeHrmEditLineModal();
            loadHrmPayroll(month);
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

        const month = getSelectedMonth();
        document.getElementById('hrm-days-detail-title').textContent = `Chi Tiết Chấm Công & Phạt Trễ: ${line.name} (${line.employee_code || 'NV' + line.staff_id})`;
        document.getElementById('hrm-days-detail-subtitle').textContent = `Khối: ${line.block} | Tháng: ${month} | Lương cơ bản: ${(line.base_salary || 0).toLocaleString('vi-VN')}đ`;

        const totalDays = (line.days_official || 0) + (line.days_probation || 0);
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
        const dayNames = ['CN', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7'];

        tbody.innerHTML = (line.days || []).map(d => {
            const dt = new Date(d.date);
            const dayOfWeek = dayNames[dt.getDay()];
            const isSun = dt.getDay() === 0;

            let codeBadge = `<span class="px-2 py-0.5 rounded text-[11px] font-bold bg-slate-100 text-slate-500">-</span>`;
            if (d.code === 'X') codeBadge = `<span class="px-2 py-0.5 rounded text-[11px] font-bold bg-emerald-100 text-emerald-800 border border-emerald-200">X (1.0)</span>`;
            else if (d.code === 'X/2') codeBadge = `<span class="px-2 py-0.5 rounded text-[11px] font-bold bg-sky-100 text-sky-800 border border-sky-200">X/2 (0.5)</span>`;
            else if (d.code === 'TV') codeBadge = `<span class="px-2 py-0.5 rounded text-[11px] font-bold bg-amber-100 text-amber-800 border border-amber-200">TV (1.0)</span>`;
            else if (d.code === 'TV/2') codeBadge = `<span class="px-2 py-0.5 rounded text-[11px] font-bold bg-amber-200 text-amber-900 border border-amber-300">TV/2 (0.5)</span>`;
            else if (d.code === 'OFF') codeBadge = `<span class="px-2 py-0.5 rounded text-[11px] font-bold bg-slate-200 text-slate-700">OFF</span>`;
            else if (d.code === 'L') codeBadge = `<span class="px-2 py-0.5 rounded text-[11px] font-bold bg-purple-100 text-purple-800 border border-purple-200">L (Lễ)</span>`;
            else if (d.code === 'CN') codeBadge = `<span class="px-2 py-0.5 rounded text-[11px] font-medium bg-slate-50 text-slate-400">CN nghỉ</span>`;

            let viols = [];
            (d.violations || []).forEach(v => {
                if (v === 'late') viols.push(`<span class="px-1.5 py-0.5 bg-rose-100 text-rose-700 rounded text-[10px] font-bold">Trễ ${d.late_min}p</span>`);
                else if (v === 'early') viols.push(`<span class="px-1.5 py-0.5 bg-amber-100 text-amber-700 rounded text-[10px] font-bold">Về sớm ${d.early_min}p</span>`);
                else if (v === 'missing_in') viols.push(`<span class="px-1.5 py-0.5 bg-rose-100 text-rose-700 rounded text-[10px] font-bold">Quên vào (-50k)</span>`);
                else if (v === 'missing_out') viols.push(`<span class="px-1.5 py-0.5 bg-rose-100 text-rose-700 rounded text-[10px] font-bold">Quên ra (-50k)</span>`);
                else if (v === 'absent') viols.push(`<span class="px-1.5 py-0.5 bg-red-200 text-red-900 rounded text-[10px] font-bold">Vắng không phép (-500k)</span>`);
            });
            if (d.waived) {
                viols.push(`<span class="px-1.5 py-0.5 bg-emerald-100 text-emerald-800 rounded text-[10px] font-bold">Đã miễn phạt</span>`);
            }

            const workedHours = d.worked_min > 0 ? (d.worked_min / 60).toFixed(1) + 'h' : '—';
            const lateText = d.late_min > 0 ? `<span class="text-rose-600 font-bold">${d.late_min}p</span>` : '<span class="text-slate-300">—</span>';
            const earlyText = d.early_min > 0 ? `<span class="text-amber-600 font-bold">${d.early_min}p</span>` : '<span class="text-slate-300">—</span>';
            const penText = d.penalty > 0 ? `<span class="text-rose-600 font-mono font-black">-${d.penalty.toLocaleString('vi-VN')}đ</span>` : '<span class="text-slate-300">—</span>';

            return `
                <tr class="hover:bg-slate-50 ${isSun ? 'bg-slate-50/50' : ''}">
                    <td class="p-2.5 font-mono font-bold text-slate-800">${d.date}</td>
                    <td class="p-2.5 text-center font-bold ${isSun ? 'text-rose-600' : 'text-slate-600'}">${dayOfWeek}</td>
                    <td class="p-2.5 text-center font-mono font-bold ${d.check_in ? 'text-slate-800' : 'text-slate-300'}">${d.check_in || '—'}</td>
                    <td class="p-2.5 text-center font-mono font-bold ${d.check_out ? 'text-slate-800' : 'text-slate-300'}">${d.check_out || '—'}</td>
                    <td class="p-2.5 text-right font-mono">${workedHours}</td>
                    <td class="p-2.5 text-right">${lateText}</td>
                    <td class="p-2.5 text-right">${earlyText}</td>
                    <td class="p-2.5"><div class="flex flex-wrap gap-1">${viols.join('') || '<span class="text-slate-400">Đúng giờ</span>'}</div></td>
                    <td class="p-2.5 text-right">${penText}</td>
                    <td class="p-2.5 text-center">${codeBadge}</td>
                    <td class="p-2.5 text-center">
                        <button onclick="openHrmEditDayModal(${staffId}, '${d.date}', '${d.code}')" class="text-sky-600 hover:underline font-bold cursor-pointer text-[11px]">✏️ Sửa</button>
                    </td>
                </tr>
            `;
        }).join('');

        const modal = document.getElementById('modal-hrm-staff-days-detail');
        if (modal) modal.classList.remove('hidden');
    };

    window.closeHrmStaffDaysDetailModal = function() {
        const modal = document.getElementById('modal-hrm-staff-days-detail');
        if (modal) modal.classList.add('hidden');
    };

    window.openHrmRulesGuideModal = function() {
        const modal = document.getElementById('modal-hrm-rules-guide');
        if (modal) modal.classList.remove('hidden');
    };

    window.closeHrmRulesGuideModal = function() {
        const modal = document.getElementById('modal-hrm-rules-guide');
        if (modal) modal.classList.add('hidden');
    };

    // ── Phiếu Lương Cá Nhân (Modal & Tab) ──
    window.openHrmPayslipModal = async function(staffId) {
        const month = getSelectedMonth();
        const bodyEl = document.getElementById('hrm-payslip-modal-body');
        if (bodyEl) bodyEl.innerHTML = `<div class="text-center py-8 text-slate-400">Đang tải phiếu lương...</div>`;

        const modal = document.getElementById('modal-hrm-payslip');
        if (modal) modal.classList.remove('hidden');

        try {
            const res = await fetch(`/api/hrm/my-payslip?month=${month}&staff_id=${staffId}`);
            const data = await res.json();
            if (!res.ok || data.status !== 'ok') {
                if (bodyEl) bodyEl.innerHTML = `<div class="p-4 text-center text-rose-500 font-medium">${data.message || 'Không tìm thấy phiếu lương'}</div>`;
                return;
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

    window.printHrmPayslip = function() {
        const bodyEl = document.getElementById('hrm-payslip-modal-body');
        if (!bodyEl) return;
        const win = window.open('', '_blank');
        win.document.write(`
            <html><head><title>Phiếu Lương</title>
            <style>
                body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; padding: 20px; color: #1e293b; font-size: 13px; }
                .card { border: 1px solid #cbd5e1; border-radius: 8px; padding: 12px; margin-bottom: 12px; }
                .row { display: flex; justify-content: space-between; padding: 4px 0; border-bottom: 1px dashed #f1f5f9; }
                .net { font-size: 18px; font-weight: bold; color: #047857; text-align: right; }
                .title { font-size: 16px; font-weight: bold; margin-bottom: 12px; text-align: center; }
            </style>
            </head><body>${bodyEl.innerHTML}</body></html>
        `);
        win.document.close();
        win.print();
    };

    // ── Tab Phiếu Lương Của Tôi (Nhân viên xem trên Mobile) ──
    window.initMyPayslipTab = function() {
        const picker = document.getElementById('my-payslip-month');
        if (picker && !picker.value) {
            const now = new Date();
            picker.value = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
        }
        loadMyPayslip();
    };

    window.loadMyPayslip = async function() {
        const picker = document.getElementById('my-payslip-month');
        const month = picker?.value || getSelectedMonth();
        const contentEl = document.getElementById('my-payslip-content');
        if (!contentEl) return;
        contentEl.innerHTML = `<div class="text-center py-10 text-slate-400 text-xs">Đang nạp phiếu lương...</div>`;

        try {
            const res = await fetch(`/api/hrm/my-payslip?month=${month}`);
            const data = await res.json();
            if (!res.ok || data.status !== 'ok') {
                contentEl.innerHTML = `
                    <div class="bg-white p-6 rounded-2xl shadow-xs border text-center space-y-2">
                        <span class="text-3xl">📭</span>
                        <div class="font-bold text-slate-700 text-sm">Chưa Có Phiếu Lương</div>
                        <p class="text-slate-400 text-xs">${data.message || 'Chưa có bảng lương được tính cho tháng này.'}</p>
                    </div>
                `;
                return;
            }
            contentEl.innerHTML = renderPayslipCardHTML(data, month);
        } catch (e) {
            console.error(e);
        }
    };

    window.printMyPayslip = function() {
        const contentEl = document.getElementById('my-payslip-content');
        if (!contentEl) return;
        const win = window.open('', '_blank');
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
                @media print {
                    body { padding: 10px; }
                    .page-break { page-break-inside: avoid; }
                }
            </style>
            </head><body>${contentEl.innerHTML}</body></html>
        `);
        win.document.close();
        win.print();
    };

    function renderPayslipCardHTML(data, month) {
        const s = data.staff || {};
        const p = data.payslip || {};
        const statusMap = {
            'draft': '<span class="px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-amber-100 text-amber-800">TẠM TÍNH</span>',
            'locked': '<span class="px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-purple-100 text-purple-800">ĐÃ CHỐT</span>',
            'paid': '<span class="px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-800">ĐÃ CHI TRẢ</span>'
        };

        const f = num => (num || 0).toLocaleString('vi-VN') + ' đ';

        const dayNames = ['CN', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7'];
        const dayRows = (p.days || []).map(d => {
            const dt = new Date(d.date);
            const dow = dayNames[dt.getDay()];
            const isSun = dt.getDay() === 0;

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
                    <td class="p-1.5 font-mono font-bold">${d.date}</td>
                    <td class="p-1.5 text-center font-bold ${isSun ? 'text-rose-600' : 'text-slate-600'}">${dow}</td>
                    <td class="p-1.5 text-center font-mono">${d.check_in || '—'}</td>
                    <td class="p-1.5 text-center font-mono">${d.check_out || '—'}</td>
                    <td class="p-1.5 text-right font-mono">${workedStr}</td>
                    <td class="p-1.5 text-right ${d.late_min > 0 ? 'text-rose-600 font-bold' : 'text-slate-400'}">${d.late_min > 0 ? d.late_min + 'p' : '—'}</td>
                    <td class="p-1.5 text-slate-700">${viols.join(', ') || 'Đúng giờ'}</td>
                    <td class="p-1.5 text-right font-mono font-bold ${d.penalty > 0 ? 'text-rose-600' : 'text-slate-500'}">${penStr}</td>
                    <td class="p-1.5 text-center font-bold text-slate-800">${d.code || '—'}</td>
                    <td class="p-1.5 text-center text-[10px]">${statusPen}</td>
                </tr>
            `;
        }).join('');

        return `
            <div class="space-y-3 text-xs">
                <!-- Thẻ Thông Tin Nhân Viên -->
                <div class="bg-white p-4 rounded-2xl shadow-xs border border-slate-200/80 flex items-center justify-between">
                    <div>
                        <div class="font-bold text-slate-800 text-sm flex items-center gap-2">
                            <span>${s.name}</span>
                            <span class="text-[11px] font-mono text-purple-600 bg-purple-50 px-2 py-0.5 rounded-md font-bold">${s.employee_code || 'NV' + s.id}</span>
                        </div>
                        <div class="text-[11px] text-slate-500 mt-1">Khối: <span class="font-bold text-slate-700">${s.block_name || p.block || '--'}</span> | Chức vụ: <span class="font-bold text-slate-700">${s.role || '--'}</span></div>
                    </div>
                    <div class="text-right">
                        ${statusMap[data.period_status] || ''}
                        <div class="text-[10px] text-slate-400 mt-1">Tháng ${month.slice(5)}/${month.slice(0,4)}</div>
                    </div>
                </div>

                <!-- Thẻ Thu Nhập -->
                <div class="bg-white p-4 rounded-2xl shadow-xs border border-slate-200/80 space-y-2">
                    <h4 class="font-bold text-emerald-800 uppercase text-[11px] flex items-center gap-1 border-b pb-1">
                        <span>💰</span> I. Các Khoản Thu Nhập
                    </h4>
                    <div class="space-y-1.5 pt-1">
                        <div class="flex justify-between text-slate-600"><span>Lương cơ bản:</span><span class="font-mono font-bold text-slate-800">${f(p.base_salary)}</span></div>
                        <div class="flex justify-between text-slate-600"><span>Công chuẩn / Ngày làm việc:</span><span class="font-bold text-slate-800">${p.days_official || 0} CT + ${p.days_probation || 0} TV / ${p.std_days || 0} chuẩn</span></div>
                        <div class="flex justify-between text-slate-600"><span>Lương theo ngày công:</span><span class="font-mono font-bold text-slate-800">${f(p.pay_days)}</span></div>
                        <div class="flex justify-between text-slate-600"><span>Phụ cấp ăn trưa / xăng:</span><span class="font-mono font-bold text-slate-800">${f(p.allowance)}</span></div>
                        ${p.fuel_other ? `<div class="flex justify-between text-slate-600"><span>Phụ cấp khác:</span><span class="font-mono font-bold text-slate-800">${f(p.fuel_other)}</span></div>` : ''}
                        ${p.holiday_pay ? `<div class="flex justify-between text-slate-600"><span>Lương ngày lễ:</span><span class="font-mono font-bold text-slate-800">${f(p.holiday_pay)}</span></div>` : ''}
                        ${p.commission ? `<div class="flex justify-between text-slate-600"><span>Hoa hồng bán lẻ:</span><span class="font-mono font-bold text-sky-700">${f(p.commission)}</span></div>` : ''}
                        ${p.spa_commission ? `<div class="flex justify-between text-slate-600"><span>Hoa hồng Spa / Dịch vụ:</span><span class="font-mono font-bold text-purple-700">${f(p.spa_commission)}</span></div>` : ''}
                        ${p.tips ? `<div class="flex justify-between text-slate-600"><span>Tiền Tip khách cho:</span><span class="font-mono font-bold text-indigo-700">${f(p.tips)}</span></div>` : ''}
                        ${p.attendance_bonus ? `<div class="flex justify-between text-slate-600"><span>Thưởng chuyên cần:</span><span class="font-mono font-bold text-emerald-700">${f(p.attendance_bonus)}</span></div>` : ''}
                        ${p.birthday_bonus ? `<div class="flex justify-between text-slate-600"><span>Thưởng sinh nhật:</span><span class="font-mono font-bold text-emerald-700">${f(p.birthday_bonus)}</span></div>` : ''}
                        ${p.bonus_other ? `<div class="flex justify-between text-slate-600"><span>Thưởng khác:</span><span class="font-mono font-bold text-emerald-700">${f(p.bonus_other)}</span></div>` : ''}
                        ${p.ot_pay ? `<div class="flex justify-between text-slate-600"><span>Tiền tăng ca OT:</span><span class="font-mono font-bold text-amber-700">${f(p.ot_pay)}</span></div>` : ''}
                    </div>
                </div>

                <!-- Thẻ Giảm Trừ -->
                <div class="bg-white p-4 rounded-2xl shadow-xs border border-slate-200/80 space-y-2">
                    <h4 class="font-bold text-rose-800 uppercase text-[11px] flex items-center gap-1 border-b pb-1">
                        <span>🔻</span> II. Các Khoản Giảm Trừ
                    </h4>
                    <div class="space-y-1.5 pt-1">
                        <div class="flex justify-between text-slate-600"><span>Phạt trễ & quên quẹt:</span><span class="font-mono font-bold text-rose-600">-${f(p.penalties)}</span></div>
                        <div class="flex justify-between text-slate-600"><span>Tạm ứng trong tháng:</span><span class="font-mono font-bold text-rose-600">-${f(p.advances)}</span></div>
                        ${p.deduction_other ? `<div class="flex justify-between text-slate-600"><span>Giảm trừ khác:</span><span class="font-mono font-bold text-rose-600">-${f(p.deduction_other)}</span></div>` : ''}
                    </div>
                </div>

                <!-- Thẻ Thực Lãnh Net -->
                <div class="bg-gradient-to-r from-emerald-50 to-teal-50 border border-emerald-200 p-4 rounded-2xl shadow-xs flex items-center justify-between">
                    <div>
                        <div class="font-bold text-emerald-900 text-xs uppercase">III. Thực Lãnh Net</div>
                        <div class="text-[10px] text-emerald-700 mt-0.5">${p.cashbook_code ? `Đã chi: ${p.cashbook_code}` : 'Chưa giải ngân'}</div>
                    </div>
                    <div class="text-right">
                        <div class="font-mono font-black text-xl text-emerald-700">${(p.net_pay || p.net_rounded || 0).toLocaleString('vi-VN')} đ</div>
                    </div>
                </div>

                <!-- Thẻ IV: Bảng Chi Tiết 30/31 Ngày Chấm Công (Minh Bạch Phạt Trễ) -->
                <div class="bg-white p-4 rounded-2xl shadow-xs border border-slate-200/80 space-y-2">
                    <div class="flex items-center justify-between border-b pb-1">
                        <h4 class="font-bold text-slate-800 uppercase text-[11px] flex items-center gap-1">
                            <span>⏱️</span> IV. Bảng Chi Tiết 30/31 Ngày Chấm Công & Đi Trễ Trong Tháng
                        </h4>
                        <span class="text-[10px] text-slate-400 font-medium">Toàn bộ các ngày trong kỳ lương</span>
                    </div>
                    <div class="border border-slate-200 rounded-xl overflow-x-auto max-h-[350px]">
                        <table class="w-full text-left border-collapse text-[11px]">
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
                    <div class="bg-slate-50 border border-slate-200/80 p-3 rounded-xl text-[11px] text-slate-600">
                        <span class="font-bold text-slate-700">Ghi chú / Giải trình:</span> ${p.manual_note}
                    </div>
                ` : ''}
            </div>
        `;
    }

    // ── Hồ Sơ Nhân Sự Lương (Staff Profiles) ──
    let hrmStaffList = [];
    let hrmBlocksMap = {};

    async function loadHrmStaff() {
        const tbody = document.getElementById('table-hrm-staff');
        if (tbody) tbody.innerHTML = `<tr><td colspan="8" class="p-6 text-center text-slate-400">Đang nạp danh sách nhân sự...</td></tr>`;
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
            renderHrmStaffTable(hrmStaffList);
        } catch (e) {
            console.error("Lỗi nạp danh sách nhân sự:", e);
        }
    }
    window.loadHrmStaff = loadHrmStaff;

    function filterHrmStaffTable() {
        const q = (document.getElementById('hrm-staff-search')?.value || '').toLowerCase().trim();
        const blockId = document.getElementById('hrm-staff-filter-block')?.value;
        const filtered = hrmStaffList.filter(s => {
            const matchQ = !q || (s.name || '').toLowerCase().includes(q) || (s.phone || '').includes(q) || (s.employee_code || '').toLowerCase().includes(q);
            const matchBlock = !blockId || s.work_block_id == blockId;
            return matchQ && matchBlock;
        });
        renderHrmStaffTable(filtered);
    }
    window.filterHrmStaffTable = filterHrmStaffTable;

    function renderHrmStaffTable(list) {
        const tbody = document.getElementById('table-hrm-staff');
        if (!tbody) return;
        if (!list || list.length === 0) {
            tbody.innerHTML = `<tr><td colspan="8" class="p-6 text-center text-slate-400">Không tìm thấy nhân viên nào phù hợp.</td></tr>`;
            return;
        }

        const ROLE_MAP = {
            'owner': 'Chủ Shop',
            'cashier': 'Thu Ngân',
            'warehouse': 'Thủ Kho',
            'accountant': 'Kế Toán',
            'staff': 'Nhân Viên'
        };

        tbody.innerHTML = list.map(r => {
            const hasAcc = Boolean(r.has_account);
            const block = hrmBlocksMap[r.work_block_id];
            const blockBadge = block
                ? `<span class="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-bold bg-slate-100 text-slate-700 whitespace-nowrap">${block.name}</span>`
                : `<span class="text-slate-400 italic text-[10px]">Chưa xếp</span>`;

            const fMoney = v => v ? Number(v).toLocaleString('vi-VN') + ' đ' : '0 đ';

            const accountBadge = hasAcc
                ? `<span class="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-mono font-bold bg-sky-50 text-sky-700 border border-sky-200">
                     <span>👤</span> ${r.username}
                   </span>`
                : `<button onclick="openHrmQuickAccountModal(${r.id}, '${(r.name||'').replace(/'/g, "\\'")}', '${r.employee_code||''}')" class="px-1.5 py-0.5 bg-amber-50 hover:bg-amber-100 text-amber-800 border border-amber-300 rounded text-[10px] font-bold cursor-pointer transition shadow-2xs whitespace-nowrap" title="Cấp tài khoản đăng nhập (Phím tắt: F4)">
                     ⚡ Cấp TK
                   </button>`;

            const cStatus = r.contractual_status || (!r.official_date || (new Date(r.official_date) > new Date()) ? 'Thử việc' : 'Chính thức');
            const contractBadge = cStatus === 'Chính thức'
                ? `<span class="px-1.5 py-0.5 rounded text-[10px] font-bold bg-emerald-100 text-emerald-800">Chính thức</span>`
                : cStatus === 'Thử việc'
                ? `<span class="px-1.5 py-0.5 rounded text-[10px] font-bold bg-amber-100 text-amber-800">Thử việc</span>`
                : `<span class="px-1.5 py-0.5 rounded text-[10px] font-bold bg-slate-100 text-slate-600">Nghỉ việc</span>`;

            const baseDelta = Number(r.total_base_delta || 0);
            const deltaBadge = baseDelta > 0
                ? `<button onclick="filterHrmAdjByStaff(${r.id})" class="px-1.5 py-0.5 rounded text-[10px] font-mono font-bold bg-emerald-100 text-emerald-800 hover:bg-emerald-200 cursor-pointer" title="Xem lịch sử điều chỉnh">+${baseDelta.toLocaleString('vi-VN')} đ</button>`
                : baseDelta < 0
                ? `<button onclick="filterHrmAdjByStaff(${r.id})" class="px-1.5 py-0.5 rounded text-[10px] font-mono font-bold bg-rose-100 text-rose-800 hover:bg-rose-200 cursor-pointer" title="Xem lịch sử điều chỉnh">${baseDelta.toLocaleString('vi-VN')} đ</button>`
                : `<span class="text-slate-300 font-mono text-[10px]">0 đ</span>`;

            const deptText = [r.department, r.position].filter(Boolean).join(' • ') || '—';

            return `
                <tr class="hover:bg-slate-50 transition border-t border-slate-100">
                    <td class="p-2.5">
                        <div class="font-bold text-slate-800 text-xs">${r.name}</div>
                        <div class="text-[10px] text-slate-500 font-mono flex items-center gap-1.5 mt-0.5">
                            ${r.employee_code ? `<span class="bg-purple-50 text-purple-700 px-1 rounded font-bold">${r.employee_code}</span>` : ''}
                            ${r.phone ? `<span>📞 ${r.phone}</span>` : ''}
                            ${r.is_spa_worker ? `<span class="bg-pink-50 text-pink-700 px-1 rounded font-bold">✂️ Thợ Spa</span>` : ''}
                        </div>
                    </td>
                    <td class="p-2.5 text-slate-600 text-[11px]">${deptText}</td>
                    <td class="p-2.5">${blockBadge}</td>
                    <td class="p-2.5 text-right font-mono text-slate-500 text-[11px]">${fMoney(r.base_salary)}</td>
                    <td class="p-2.5 text-center">${deltaBadge}</td>
                    <td class="p-2.5 text-right font-mono font-bold text-emerald-700">${fMoney(r.base_salary_effective || r.base_salary)}</td>
                    <td class="p-2.5 text-right font-mono font-bold text-slate-700">${fMoney(r.allowance_effective !== undefined ? r.allowance_effective : r.allowance)}</td>
                    <td class="p-2.5 text-right font-mono font-black text-indigo-700">${fMoney(r.total_salary || ((r.base_salary_effective || r.base_salary || 0) + (r.allowance_effective || r.allowance || 0)))}</td>
                    <td class="p-2.5 text-center font-semibold text-slate-700 text-[10px] whitespace-nowrap">${r.tenure || '—'}</td>
                    <td class="p-2.5 text-center">${contractBadge}</td>
                    <td class="p-2.5 text-center">${accountBadge}</td>
                    <td class="p-2.5 text-center whitespace-nowrap">
                        <button onclick="openHrmStaffModal(${r.id})" class="px-2 py-1 bg-emerald-50 text-emerald-700 hover:bg-emerald-100 rounded text-[10px] font-bold cursor-pointer mr-1" title="Sửa hồ sơ">✏️ Sửa</button>
                        <button onclick="openHrmAdjustmentModal(${r.id})" class="px-1.5 py-1 bg-indigo-50 text-indigo-700 hover:bg-indigo-100 rounded text-[10px] font-bold cursor-pointer mr-1" title="Tạo điều chỉnh lương">⚖️ Đ/C</button>
                        ${!hasAcc ? `<button onclick="openHrmQuickAccountModal(${r.id}, '${(r.name||'').replace(/'/g, "\\'")}', '${r.employee_code||''}')" class="px-1.5 py-1 bg-sky-50 text-sky-700 hover:bg-sky-100 rounded text-[10px] font-bold cursor-pointer" title="Cấp tài khoản POS">⚡ Cấp TK</button>` : ''}
                    </td>
                </tr>
            `;
        }).join('');
    }

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

    window.loadHrmSalaryAdjustments = async function() {
        const tbody = document.getElementById('table-hrm-adjustments');
        if (tbody) tbody.innerHTML = `<tr><td colspan="10" class="p-6 text-center text-slate-400">Đang tải danh sách quyết định điều chỉnh lương...</td></tr>`;

        try {
            const [resAdj, resStaff] = await Promise.all([
                fetch('/api/hrm/adjustments'),
                hrmStaffList.length ? Promise.resolve({ ok: true, json: () => Promise.resolve(hrmStaffList) }) : fetch('/api/hrm/employees')
            ]);
            if (!resAdj.ok) return;
            hrmAdjustmentsList = await resAdj.json();

            if (!hrmStaffList.length && resStaff.ok) {
                hrmStaffList = await resStaff.json();
            }

            // Cập nhật bộ lọc nhân viên
            const staffFilter = document.getElementById('hrm-adj-filter-staff');
            if (staffFilter) {
                const curVal = staffFilter.value;
                staffFilter.innerHTML = '<option value="">-- Tất cả nhân viên --</option>' +
                    (hrmStaffList || []).map(s => `<option value="${s.id}" ${curVal == s.id ? 'selected' : ''}>${s.employee_code ? s.employee_code + ' - ' : ''}${s.name}</option>`).join('');
            }

            renderHrmAdjustmentsTable(hrmAdjustmentsList);
        } catch (e) {
            console.error("Lỗi tải quyết định điều chỉnh lương:", e);
        }
    };

    function renderHrmAdjustmentsTable(list) {
        const tbody = document.getElementById('table-hrm-adjustments');
        if (!tbody) return;
        if (!list || list.length === 0) {
            tbody.innerHTML = `<tr><td colspan="10" class="p-6 text-center text-slate-400">Chưa có quyết định điều chỉnh lương nào.</td></tr>`;
            return;
        }

        const fMoney = v => {
            const n = Number(v || 0);
            if (n === 0) return '—';
            return (n > 0 ? '+' : '') + n.toLocaleString('vi-VN') + ' đ';
        };

        tbody.innerHTML = list.map((r, idx) => {
            const bDelta = Number(r.base_delta || 0);
            const aDelta = Number(r.allowance_delta || 0);
            const typeLabel = r.adjustment_type === 'salary' ? 'Lương' : r.adjustment_type === 'allowance' ? 'Phụ cấp' : 'Cả hai';
            const typeBadge = r.adjustment_type === 'salary'
                ? '<span class="px-2 py-0.5 rounded text-[10px] font-bold bg-purple-50 text-purple-700 border border-purple-200">Lương</span>'
                : r.adjustment_type === 'allowance'
                ? '<span class="px-2 py-0.5 rounded text-[10px] font-bold bg-amber-50 text-amber-700 border border-amber-200">Phụ cấp</span>'
                : '<span class="px-2 py-0.5 rounded text-[10px] font-bold bg-indigo-50 text-indigo-700 border border-indigo-200">Cả hai</span>';

            const deptText = [r.department, r.position].filter(Boolean).join(' • ') || '—';

            return `
                <tr class="hover:bg-slate-50 transition border-t border-slate-100">
                    <td class="p-2.5 font-mono text-[11px] text-slate-600">${r.decision_date || r.effective_date}</td>
                    <td class="p-2.5">
                        <div class="font-bold text-slate-800 text-xs">${r.staff_name || 'NV #' + r.staff_id}</div>
                        <div class="text-[10px] text-purple-700 font-mono font-bold mt-0.5">${r.employee_code || ''}</div>
                    </td>
                    <td class="p-2.5 text-slate-600 text-[11px]">${deptText}</td>
                    <td class="p-2.5 text-center">${typeBadge}</td>
                    <td class="p-2.5 text-right font-mono font-bold ${bDelta > 0 ? 'text-emerald-700' : bDelta < 0 ? 'text-rose-700' : 'text-slate-400'}">${fMoney(bDelta)}</td>
                    <td class="p-2.5 text-right font-mono font-bold ${aDelta > 0 ? 'text-emerald-700' : aDelta < 0 ? 'text-rose-700' : 'text-slate-400'}">${fMoney(aDelta)}</td>
                    <td class="p-2.5 text-center font-mono font-bold text-emerald-700 text-[11px]">${r.effective_date}</td>
                    <td class="p-2.5 text-slate-700 text-xs">${r.reason || '—'}</td>
                    <td class="p-2.5 text-center text-slate-500 text-[11px]">${r.created_by || 'Hệ thống'}</td>
                    <td class="p-2.5 text-center">
                        <button onclick="deleteHrmAdjustment(${r.id})" class="px-2 py-1 bg-rose-50 text-rose-700 hover:bg-rose-100 rounded text-[10px] font-bold cursor-pointer" title="Xóa quyết định">🗑️ Xóa</button>
                    </td>
                </tr>
            `;
        }).join('');
    }

    window.filterHrmAdjustmentsTable = function() {
        const q = (document.getElementById('hrm-adj-search')?.value || '').toLowerCase().trim();
        const staffId = document.getElementById('hrm-adj-filter-staff')?.value;
        const filtered = hrmAdjustmentsList.filter(a => {
            const matchQ = !q || (a.staff_name || '').toLowerCase().includes(q) || (a.employee_code || '').toLowerCase().includes(q) || (a.reason || '').toLowerCase().includes(q);
            const matchStaff = !staffId || a.staff_id == staffId;
            return matchQ && matchStaff;
        });
        renderHrmAdjustmentsTable(filtered);
    };

    window.filterHrmAdjByStaff = function(staffId) {
        switchHrmSubTab('adjustments');
        const staffFilter = document.getElementById('hrm-adj-filter-staff');
        if (staffFilter) {
            staffFilter.value = staffId;
            filterHrmAdjustmentsTable();
        }
    };

    window.openHrmAdjustmentModal = async function(staffId) {
        const staffSel = document.getElementById('hrm-adj-staff-id');
        if (staffSel) {
            if (!hrmStaffList.length) {
                try {
                    const res = await fetch('/api/hrm/employees');
                    if (res.ok) hrmStaffList = await res.json();
                } catch (e) { console.error(e); }
            }
            staffSel.innerHTML = '<option value="">-- Chọn nhân viên --</option>' +
                (hrmStaffList || []).map(s => `<option value="${s.id}" ${staffId == s.id ? 'selected' : ''}>${s.employee_code ? s.employee_code + ' - ' : ''}${s.name}</option>`).join('');
        }

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

    // ── Cấp Nhanh Tài Khoản (Quick Account) ──
    window.openHrmQuickAccountModal = function(staffId, staffName, empCode) {
        if (!staffId) {
            const candidate = (hrmStaffList || []).find(s => !s.has_account);
            if (candidate) {
                staffId = candidate.id;
                staffName = candidate.name;
                empCode = candidate.employee_code;
            } else {
                alert("Tất cả nhân sự trong danh sách đều đã có tài khoản đăng nhập!");
                return;
            }
        }

        document.getElementById('hrm-acc-staff-id').value = staffId;
        document.getElementById('hrm-acc-staff-name').textContent = `${staffName} (${empCode || 'NV' + staffId})`;

        let suggestedUname = '';
        if (empCode) {
            suggestedUname = empCode.toLowerCase().replace(/[^a-z0-9]/g, '');
        } else {
            suggestedUname = (staffName || '').toLowerCase()
                .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
                .replace(/đ/g, "d").replace(/[^a-z0-9]/g, "");
        }
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
            loadHrmStaff();
        } catch (e) {
            console.error(e);
        }
    };
})();
