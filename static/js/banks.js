// Danh sách ngân hàng VietQR (mã + tên theo api.vietqr.io/v2/banks, transferSupported=1).
// ponytail: list tĩnh cho POS offline. Thêm NH mới = thêm 1 dòng; chuyển sang fetch API khi cần > 40 NH.
var VIETQR_BANKS = [
    { code: 'MB', short: 'MBBank', full: 'Ngân hàng TMCP Quân Đội' },
    { code: 'VCB', short: 'Vietcombank', full: 'Ngân hàng TMCP Ngoại Thương Việt Nam' },
    { code: 'TCB', short: 'Techcombank', full: 'Ngân hàng TMCP Kỹ Thương Việt Nam' },
    { code: 'ICB', short: 'VietinBank', full: 'Ngân hàng TMCP Công Thương Việt Nam' },
    { code: 'BIDV', short: 'BIDV', full: 'Ngân hàng TMCP Đầu tư và Phát triển Việt Nam' },
    { code: 'VBA', short: 'Agribank', full: 'Ngân hàng Nông nghiệp và Phát triển Nông thôn Việt Nam' },
    { code: 'ACB', short: 'ACB', full: 'Ngân hàng TMCP Á Châu' },
    { code: 'TPB', short: 'TPBank', full: 'Ngân hàng TMCP Tiên Phong' },
    { code: 'VPB', short: 'VPBank', full: 'Ngân hàng TMCP Việt Nam Thịnh Vượng' },
    { code: 'STB', short: 'Sacombank', full: 'Ngân hàng TMCP Sài Gòn Thương Tín' },
    { code: 'HDB', short: 'HDBank', full: 'Ngân hàng TMCP Phát triển TP. Hồ Chí Minh' },
    { code: 'VIB', short: 'VIB', full: 'Ngân hàng TMCP Quốc tế Việt Nam' },
    { code: 'MSB', short: 'MSB', full: 'Ngân hàng TMCP Hàng Hải Việt Nam' },
    { code: 'SHB', short: 'SHB', full: 'Ngân hàng TMCP Sài Gòn - Hà Nội' },
    { code: 'LPB', short: 'LPBank', full: 'Ngân hàng TMCP Lộc Phát Việt Nam' },
    { code: 'OCB', short: 'OCB', full: 'Ngân hàng TMCP Phương Đông' },
    { code: 'SEAB', short: 'SeABank', full: 'Ngân hàng TMCP Đông Nam Á' },
    { code: 'EIB', short: 'Eximbank', full: 'Ngân hàng TMCP Xuất Nhập khẩu Việt Nam' },
    { code: 'NAB', short: 'Nam A Bank', full: 'Ngân hàng TMCP Nam Á' },
    { code: 'BAB', short: 'Bac A Bank', full: 'Ngân hàng TMCP Bắc Á' },
    { code: 'PVCB', short: 'PVcomBank', full: 'Ngân hàng TMCP Đại Chúng Việt Nam' },
    { code: 'SCB', short: 'SCB', full: 'Ngân hàng TMCP Sài Gòn' },
    { code: 'VCCB', short: 'BVBank', full: 'Ngân hàng TMCP Bản Việt' },
    { code: 'KLB', short: 'KienLongBank', full: 'Ngân hàng TMCP Kiên Long' },
    { code: 'CAKE', short: 'CAKE', full: 'Ngân hàng số CAKE by VPBank' },
    { code: 'TIMO', short: 'Timo', full: 'Ngân hàng số Timo by BVBank' }
];

function isVietQRBankCode(code) {
    return !!code && VIETQR_BANKS.some(b => b.code === code);
}

// 'TPB' -> 'Ngân hàng TMCP Tiên Phong (TPBank)'. Mã lạ trả nguyên văn.
function getBankDisplayName(code) {
    const b = VIETQR_BANKS.find(x => x.code === code);
    return b ? `${b.full} (${b.short})` : (code || '');
}

function fillBankSelect(selectEl, selectedCode) {
    if (!selectEl) return;
    const sel = isVietQRBankCode(selectedCode) ? selectedCode : '';
    selectEl.innerHTML = '<option value="">-- Chọn ngân hàng --</option>' +
        VIETQR_BANKS.map(b => `<option value="${b.code}" ${b.code === sel ? 'selected' : ''}>${b.short} - ${b.full}</option>`).join('');
    selectEl.value = sel;
}

if (typeof window !== 'undefined') {
    window.VIETQR_BANKS = VIETQR_BANKS;
    window.isVietQRBankCode = isVietQRBankCode;
    window.getBankDisplayName = getBankDisplayName;
    window.fillBankSelect = fillBankSelect;
}
