/**
 * Module HRM: Chấm Công, Bảng Lương, Tăng Ca, Tạm Ứng
 */
(function() {
    let currentSubTab = 'payroll';
    let payrollData = null;
    let attendanceData = null;

    function getSelectedMonth() {
        const picker = document.getElementById('hrm-month-picker');
        if (!picker.value) {
            const now = new Date();
            picker.value = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
        }
        return picker.value;
    }

    window.switchHrmSubTab = function(sub) {
        currentSubTab = sub;
        ['payroll', 'attendance', 'overtime', 'advances', 'config'].forEach(s => {
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
        else if (currentSubTab === 'overtime') loadHrmOvertime(month);
        else if (currentSubTab === 'advances') loadHrmAdvances(month);
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
                <td class="p-2.5 text-right font-mono font-bold text-rose-600">-${(l.penalties || 0).toLocaleString('vi-VN')}</td>
                <td class="p-2.5 text-right font-mono font-bold text-rose-600">-${(l.advances || 0).toLocaleString('vi-VN')}</td>
                <td class="p-2.5 text-right font-mono font-black text-sm text-emerald-700">${(l.net_rounded || 0).toLocaleString('vi-VN')}đ</td>
                <td class="p-2.5 text-center">${l.cashbook_code ? `<span class="px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-100 text-emerald-800">${l.cashbook_code}</span>` : `<span class="text-slate-400">Chưa chi</span>`}</td>
                <td class="p-2.5 text-center whitespace-nowrap">
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

    // ── Chấm Công Matrix ──
    async function loadHrmAttendance(month) {
        try {
            const res = await fetch(`/api/hrm/attendance?month=${month}`);
            if (!res.ok) return;
            attendanceData = await res.json();
            renderAttendanceMatrix(attendanceData);
        } catch (e) {
            console.error(e);
        }
    }

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
})();
