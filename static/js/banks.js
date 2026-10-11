// Danh sách ngân hàng VietQR (mã theo api.vietqr.io/v2/banks, transferSupported=1).
// ponytail: list tĩnh cho POS offline. Thêm NH mới = thêm 1 dòng; chuyển sang fetch API khi cần > 40 NH.
var VIETQR_BANKS = [
    { code: 'MB', name: 'MBBank (Quân Đội)' },
    { code: 'VCB', name: 'Vietcombank (Ngoại Thương)' },
    { code: 'TCB', name: 'Techcombank (Kỹ Thương)' },
    { code: 'ICB', name: 'VietinBank (Công Thương)' },
    { code: 'BIDV', name: 'BIDV (Đầu tư & Phát triển)' },
    { code: 'VBA', name: 'Agribank (Nông nghiệp)' },
    { code: 'ACB', name: 'ACB (Á Châu)' },
    { code: 'TPB', name: 'TPBank (Tiên Phong)' },
    { code: 'VPB', name: 'VPBank (Thịnh Vượng)' },
    { code: 'STB', name: 'Sacombank (Sài Gòn Thương Tín)' },
    { code: 'HDB', name: 'HDBank (Phát triển TP.HCM)' },
    { code: 'VIB', name: 'VIB (Quốc Tế)' },
    { code: 'MSB', name: 'MSB (Hàng Hải)' },
    { code: 'SHB', name: 'SHB (Sài Gòn - Hà Nội)' },
    { code: 'LPB', name: 'LPBank (Lộc Phát)' },
    { code: 'OCB', name: 'OCB (Phương Đông)' },
    { code: 'SEAB', name: 'SeABank (Đông Nam Á)' },
    { code: 'EIB', name: 'Eximbank (Xuất Nhập khẩu)' },
    { code: 'NAB', name: 'Nam A Bank (Nam Á)' },
    { code: 'BAB', name: 'Bac A Bank (Bắc Á)' },
    { code: 'PVCB', name: 'PVcomBank (Đại Chúng)' },
    { code: 'SCB', name: 'SCB (Sài Gòn)' },
    { code: 'VCCB', name: 'BVBank (Bản Việt)' },
    { code: 'KLB', name: 'KienLongBank (Kiên Long)' },
    { code: 'CAKE', name: 'CAKE by VPBank' },
    { code: 'TIMO', name: 'Timo by BVBank' }
];

function isVietQRBankCode(code) {
    return !!code && VIETQR_BANKS.some(b => b.code === code);
}

function fillBankSelect(selectEl, selectedCode) {
    if (!selectEl) return;
    const sel = isVietQRBankCode(selectedCode) ? selectedCode : '';
    selectEl.innerHTML = '<option value="">-- Chọn ngân hàng --</option>' +
        VIETQR_BANKS.map(b => `<option value="${b.code}" ${b.code === sel ? 'selected' : ''}>${b.code} - ${b.name}</option>`).join('');
    selectEl.value = sel;
}

if (typeof window !== 'undefined') {
    window.VIETQR_BANKS = VIETQR_BANKS;
    window.isVietQRBankCode = isVietQRBankCode;
    window.fillBankSelect = fillBankSelect;
}
