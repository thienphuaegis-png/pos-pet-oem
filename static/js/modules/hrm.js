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
            setVal('cfg-late-per-min', r.late_per_min || 5000);
            setVal('cfg-late-flat', r.late_flat || 200000);
            setVal('cfg-late-threshold', r.late_flat_threshold_min || 30);
            setVal('cfg-missing-punch', r.missing_punch || 50000);
            setVal('cfg-absent', r.absent || 500000);
            setVal('cfg-attendance-bonus', r.attendance_bonus || 500000);
            setVal('cfg-birthday-bonus', r.birthday_bonus || 200000);
            setVal('cfg-probation-rate', (parseFloat(r.probation_rate || 0.85) * 100).toFixed(0));
            setVal('cfg-ot-multiplier', r.ot_multiplier || 1.5);
            setVal('cfg-ot-min', r.ot_min_minutes || 25);

            // 2. Blocks
            const blocksList = document.getElementById('hrm-blocks-list');
            if (blocksList) {
                blocksList.innerHTML = (data.blocks || []).map(b => `
                    <div class="p-3 bg-slate-50 border border-slate-200/80 rounded-xl space-y-2 relative group hover:border-emerald-400 transition">
                        <div class="flex items-center justify-between">
                            <span class="font-bold text-slate-800 text-xs">${b.name}</span>
                            <button onclick="openEditBlockModal(${b.id})" class="px-2 py-0.5 bg-emerald-50 text-emerald-700 hover:bg-emerald-100 rounded text-[11px] font-bold cursor-pointer">✏️ Sửa</button>
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

    window.saveHrmRules = async function() {
        const getNum = id => parseFloat(document.getElementById(id)?.value) || 0;
        const probPct = getNum('cfg-probation-rate');
        const body = {
            late_per_min: getNum('cfg-late-per-min'),
            late_flat: getNum('cfg-late-flat'),
            late_flat_threshold_min: parseInt(document.getElementById('cfg-late-threshold')?.value) || 30,
            missing_punch: getNum('cfg-missing-punch'),
            absent: getNum('cfg-absent'),
            attendance_bonus: getNum('cfg-attendance-bonus'),
            birthday_bonus: getNum('cfg-birthday-bonus'),
            probation_rate: (probPct > 1 ? (probPct / 100).toFixed(2) : String(probPct || '0.85')),
            ot_multiplier: String(document.getElementById('cfg-ot-multiplier')?.value || '1.5'),
            ot_min_minutes: parseInt(document.getElementById('cfg-ot-min')?.value) || 25
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

    window.openEditBlockModal = function(id) {
        if (!hrmConfigCache || !hrmConfigCache.blocks) return;
        const b = hrmConfigCache.blocks.find(x => x.id === id);
        if (!b) return;

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
        if (!id) return;

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
            const res = await fetch(`/api/hrm/config/blocks/${id}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(body)
            });
            const data = await res.json();
            if (!res.ok) {
                alert(data.detail || "Lỗi lưu khối làm việc");
                return;
            }
            if (window.showToast) window.showToast("Đã lưu cấu hình ca làm việc", "success");
            closeEditBlockModal();
            loadHrmConfig();
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
                    leave_type: code,
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
        window.location.href = `/api/hrm/payroll/${month}/export-mobile-sheets`;
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

                ${p.manual_note ? `
                    <div class="bg-slate-50 border border-slate-200/80 p-3 rounded-xl text-[11px] text-slate-600">
                        <span class="font-bold text-slate-700">Ghi chú / Giải trình:</span> ${p.manual_note}
                    </div>
                ` : ''}
            </div>
        `;
    }
})();
