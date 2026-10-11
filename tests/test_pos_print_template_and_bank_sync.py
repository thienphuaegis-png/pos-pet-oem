import sqlite3
import subprocess
from pathlib import Path
import sys, os
sys.path.insert(0, os.path.dirname(os.path.dirname(__file__)))
from database import init_db, get_db
from fastapi.testclient import TestClient
from server import app

init_db()
client = TestClient(app)

def test_api_orders_bank_account_transfer():
    """Đơn có thanh toán transfer liên kết account_id trả về bank_account đầy đủ thông tin."""
    conn = get_db()
    cur = conn.cursor()
    try:
        cur.execute("""
            INSERT INTO payment_accounts (code, name, account_type, bank_name, account_number, account_holder, is_active)
            VALUES ('TEST_MB', 'MB Bank VIP', 'bank', 'MB', '99998888', 'NGUYEN VAN A', 1)
        """)
        acc_id = cur.lastrowid

        order_code = f"TEST_ORD_TRF_{acc_id}"
        cur.execute("""
            INSERT INTO orders (code, total_amount, discount, final_amount, paid_amount, status)
            VALUES (?, 100000, 0, 100000, 100000, 'completed')
        """, (order_code,))
        order_id = cur.lastrowid

        cur.execute("""
            INSERT INTO order_payments (order_id, method, amount, account_id)
            VALUES (?, 'transfer', 100000, ?)
        """, (order_id, acc_id))
        conn.commit()
    finally:
        conn.close()

    try:
        res = client.get(f"/api/orders/{order_code}")
        assert res.status_code == 200, res.text
        data = res.json()
        assert data["bank_account"] is not None
        assert data["bank_account"]["bank_name"] == "MB"
        assert data["bank_account"]["account_number"] == "99998888"
        assert data["bank_account"]["account_holder"] == "NGUYEN VAN A"
        assert data.get("is_cash_payment") is False
    finally:
        conn = get_db()
        cur = conn.cursor()
        cur.execute("DELETE FROM order_payments WHERE order_id = ?", (order_id,))
        cur.execute("DELETE FROM orders WHERE id = ?", (order_id,))
        cur.execute("DELETE FROM payment_accounts WHERE id = ?", (acc_id,))
        conn.commit()
        conn.close()


def test_api_orders_cash_payment():
    """Đơn thanh toán hoàn toàn bằng tiền mặt trả về bank_account = None và is_cash_payment = True."""
    conn = get_db()
    cur = conn.cursor()
    order_code = "TEST_ORD_CASH_999"
    try:
        cur.execute("""
            INSERT INTO orders (code, total_amount, discount, final_amount, paid_amount, status)
            VALUES (?, 50000, 0, 50000, 50000, 'completed')
        """, (order_code,))
        order_id = cur.lastrowid

        cur.execute("""
            INSERT INTO order_payments (order_id, method, amount, account_id)
            VALUES (?, 'cash', 50000, NULL)
        """, (order_id,))
        conn.commit()
    finally:
        conn.close()

    try:
        res = client.get(f"/api/orders/{order_code}")
        assert res.status_code == 200, res.text
        data = res.json()
        assert data["bank_account"] is None
        assert data.get("is_cash_payment") is True
    finally:
        conn = get_db()
        cur = conn.cursor()
        cur.execute("DELETE FROM order_payments WHERE order_id = ?", (order_id,))
        cur.execute("DELETE FROM orders WHERE id = ?", (order_id,))
        conn.commit()
        conn.close()


def test_pos_js_template_priority_and_bank_sync_via_node():
    """Kiểm tra logic JS qua Node:
    1. Ưu tiên mẫu in từ #pos-template-select -> không bị ghi đè bởi findBestPresetForSize
    2. Fallback sang localStorage nếu selector rỗng
    3. resolveOrderBankAccount nạp đúng tài khoản chuyển khoản vs tiền mặt
    4. Khối b2b_footer_boxes hiển thị chuẩn cho tiền mặt vs chuyển khoản
    """
    node_code = """
    const fs = require('fs');
    const vm = require('vm');
    const content = fs.readFileSync('static/js/pos.js', 'utf8');

    let templateSelectVal = 'k80_standard';
    let localStorageVal = null;
    let mockElements = {};

    const printAreaObj = {
        innerHTML: '',
        querySelector: () => null
    };

    const sandbox = {
        document: {
            getElementById: (id) => {
                if (id === 'pos-template-select') {
                    return { value: templateSelectVal };
                }
                if (id === 'print-area') {
                    return printAreaObj;
                }
                return mockElements[id] || null;
            },
            addEventListener: () => {},
            createElement: () => ({ textContent: '', id: '', classList: { add: ()=>{}, remove: ()=>{} } }),
            readyState: 'loading'
        },
        localStorage: {
            getItem: (key) => localStorageVal,
            setItem: (key, val) => { localStorageVal = val; }
        },
        console: console,
        setTimeout: () => {},
        requestAnimationFrame: (cb) => cb && cb(),
        fetch: async () => ({ ok: true, json: async () => ({}) })
    };
    sandbox.window = sandbox;
    sandbox.global = sandbox;
    vm.createContext(sandbox);
    vm.runInContext(content, sandbox);

    // Thiết lập mock presets & payment accounts
    sandbox.posPrintConfig.presets = {
        'k80_standard': { paper_size: 'K80', blocks: [] },
        'a4_b2b': { paper_size: 'A4', blocks: [] },
        'a5_standard': { paper_size: 'A5', blocks: [] }
    };

    sandbox.window.posPaymentAccounts = [
        { id: 10, name: 'Quỹ Tiền Mặt', account_type: 'cash', is_default: 1 },
        { id: 20, name: 'MB Bank', account_type: 'bank', bank_name: 'MB', account_number: '12345678', account_holder: 'CONG TY PET' }
    ];

    // 1. Kiểm tra resolveOrderBankAccount với tab draft
    const tab = sandbox.getActiveTab();
    tab.cart = [{ product_id: 1, name: 'Hạt', price: 100000, quantity: 1 }];
    tab.payment_method = 'transfer';
    tab.account_id = 20;

    const resolved = sandbox.resolveOrderBankAccount({ is_draft: true }, true);
    if (!resolved || resolved.account_number !== '12345678' || resolved.bank_name !== 'MB') {
        throw new Error('resolveOrderBankAccount thất bại khi chọn transfer: ' + JSON.stringify(resolved));
    }

    tab.payment_method = 'cash';
    tab.account_id = 10;
    const resolvedCash = sandbox.resolveOrderBankAccount({ is_draft: true }, true);
    if (resolvedCash !== null) {
        throw new Error('resolveOrderBankAccount phải là null khi chọn cash: ' + JSON.stringify(resolvedCash));
    }

    // 2. Kiểm tra printDraftOrder giữ nguyên preset k80_standard dù là đơn sỉ (vốn mặc định a4)
    tab.customer = { name: 'Đại lý thú cưng' }; // isWholesale = true
    templateSelectVal = 'k80_standard';
    sandbox.posPrintConfig.active_preset = 'k80_standard';
    sandbox.printDraftOrder();

    if (sandbox.posPrintConfig.active_preset !== 'k80_standard') {
        throw new Error('printDraftOrder ghi đè preset! Mong muốn k80_standard, nhận được: ' + sandbox.posPrintConfig.active_preset);
    }
    const draftOrd = sandbox.window.currentLoadedPrintOrder;
    if (!draftOrd.is_cash_payment) {
        throw new Error('draftOrder khi tab là cash phải có is_cash_payment = true');
    }
    if (draftOrd.bank_account !== null && draftOrd.bank_account !== undefined) {
        throw new Error('draftOrder khi tab là cash không được có bank_account');
    }

    // 3. Đổi tab sang transfer và in tạm tính
    tab.payment_method = 'transfer';
    tab.account_id = 20;
    templateSelectVal = 'a5_standard';
    sandbox.printDraftOrder();
    if (sandbox.posPrintConfig.active_preset !== 'a5_standard') {
        throw new Error('printDraftOrder không tôn trọng a5_standard từ template select');
    }
    const draftOrdTransfer = sandbox.window.currentLoadedPrintOrder;
    if (!draftOrdTransfer.bank_account || draftOrdTransfer.bank_account.account_number !== '12345678') {
        throw new Error('draftOrder khi tab là transfer thiếu bank_account!');
    }

    // 4. Test render b2b_footer_boxes cho đơn tiền mặt
    let renderedHtml = '';
    sandbox.document.getElementById = (id) => {
        if (id === 'pos-template-select') return templateSelectVal ? { value: templateSelectVal } : null;
        if (id === 'print-area') return { set innerHTML(val) { renderedHtml = val; }, get innerHTML() { return renderedHtml; }, querySelector: () => null };
        return mockElements[id] || null;
    };
    sandbox.posPrintConfig.presets['a4_b2b'] = {
        paper_size: 'A4',
        elements: [
            { type: 'b2b_footer_boxes' }
        ]
    };

    const cashOrder = {
        code: 'HD-001',
        final_amount: 200000,
        is_cash_payment: true,
        bank_account: null,
        items: []
    };
    sandbox.posPrintConfig.active_preset = 'a4_b2b';
    sandbox.renderAndPrint(cashOrder, false);

    if (!renderedHtml.includes('Tiền mặt tại quầy')) {
        throw new Error('b2b_footer_boxes không hiển thị Tiền mặt tại quầy cho cashOrder');
    }
    if (!renderedHtml.includes('ĐÃ THANH TOÁN TIỀN MẶT')) {
        throw new Error('b2b_footer_boxes không hiển thị ĐÃ THANH TOÁN TIỀN MẶT cho cashOrder');
    }
    if (renderedHtml.includes('img.vietqr.io')) {
        throw new Error('b2b_footer_boxes không được chứa link VietQR khi đơn thanh toán tiền mặt');
    }

    // 5. Test render b2b_footer_boxes cho đơn chuyển khoản
    const transferOrder = {
        code: 'HD-002',
        final_amount: 350000,
        is_cash_payment: false,
        bank_account: {
            bank_name: 'Techcombank',
            account_number: '88889999',
            account_holder: 'CONG TY PET'
        },
        items: []
    };
    sandbox.renderAndPrint(transferOrder, false);

    if (!renderedHtml.includes('Techcombank') || !renderedHtml.includes('88889999')) {
        throw new Error('b2b_footer_boxes không hiển thị đúng thông tin ngân hàng cho transferOrder');
    }
    if (!renderedHtml.includes('img.vietqr.io')) {
        throw new Error('b2b_footer_boxes phải chứa mã VietQR cho transferOrder');
    }

    // 6. Test showPrintModal tôn trọng pos-template-select
    (async () => {
        templateSelectVal = 'a5_standard';
        sandbox.posSettings = { shop_name: 'Shop Test' };
        sandbox.fetch = async (url) => {
            if (url.includes('/api/orders/')) {
                return {
                    ok: true,
                    json: async () => ({
                        code: 'ORD-123',
                        final_amount: 150000,
                        items: []
                    })
                };
            }
            return { ok: true, json: async () => ({}) };
        };

        await sandbox.showPrintModal('ORD-123');
        if (sandbox.posPrintConfig.active_preset !== 'a5_standard') {
            throw new Error('showPrintModal ghi đè preset! Mong muốn a5_standard, nhận được: ' + sandbox.posPrintConfig.active_preset);
        }

        // 7. Test showPrintModal fallback to localStorage khi select rỗng
        templateSelectVal = '';
        localStorageVal = 'k80_standard';
        await sandbox.showPrintModal('ORD-123');
        if (sandbox.posPrintConfig.active_preset !== 'k80_standard') {
            throw new Error('showPrintModal không lấy từ localStorage khi select rỗng! Nhận được: ' + sandbox.posPrintConfig.active_preset);
        }

        console.log('ALL JS TESTS PASSED');
    })();
    """

    res = subprocess.run(["node", "-e", node_code], capture_output=True, text=True)
    assert res.returncode == 0, f"Node test failed:\nstdout: {res.stdout}\nstderr: {res.stderr}"
    assert "ALL JS TESTS PASSED" in res.stdout
