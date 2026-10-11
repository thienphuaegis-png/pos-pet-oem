"""POS: dropdown TK nhận chỉ bank/ví, chặn TK thiếu số TK, list ngân hàng VietQR, backend lưu đúng method."""
import json
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))

NODE = r"""
const fs = require('fs'), vm = require('vm');
const els = {};
const mkSel = () => ({ innerHTML: '', value: '' });
els['pos-bank-account-select'] = mkSel();
els['acc-bank-name'] = mkSel();
const sandbox = {
  document: { getElementById: id => els[id] || null, addEventListener(){}, createElement: () => ({ classList: { add(){}, remove(){} } }), readyState: 'loading' },
  localStorage: { getItem: () => null, setItem(){} },
  console, setTimeout(){}, requestAnimationFrame: cb => cb && cb(),
  fetch: async () => ({ ok: true, json: async () => ({}) }),
};
sandbox.window = sandbox;
vm.createContext(sandbox);
vm.runInContext(fs.readFileSync('static/js/banks.js', 'utf8'), sandbox);
vm.runInContext(fs.readFileSync('static/js/pos.js', 'utf8'), sandbox);
const out = {};

sandbox.window.posPaymentAccounts = [
  { id: 1, name: 'Két', account_type: 'cash', is_default: 1 },
  { id: 2, name: 'TK hỏng', account_type: 'bank', bank_name: 'Ngân hàng', account_number: '', code: 'BANK-CHINH' },
  { id: 3, name: 'MB thật', account_type: 'bank', bank_name: 'MB', account_number: '123456', account_holder: 'A' },
];
const tab = sandbox.getActiveTab();

// Tiền mặt: không đụng account_id
tab.payment_method = 'cash'; tab.account_id = 1;
sandbox.updatePosPaymentAccountsUI();
out.cash_keeps = tab.account_id;

// Đổi sang chuyển khoản: két bị loại, auto chọn bank đầu
tab.payment_method = 'transfer';
sandbox.updatePosPaymentAccountsUI();
out.transfer_acc = tab.account_id;
out.select_has_cash = els['pos-bank-account-select'].innerHTML.includes('Két');

out.err_broken = sandbox.getBankAccountError([2]);
out.err_ok = sandbox.getBankAccountError([3]);
out.err_none = sandbox.getBankAccountError([null]);

// resolve không còn lấy code làm số TK
tab.account_id = 2;
out.resolved_broken = sandbox.resolveOrderBankAccount({}, true);

// fillBankSelect: giá trị rác -> rỗng, mã hợp lệ -> giữ
sandbox.fillBankSelect(els['acc-bank-name'], 'Ngân hàng');
out.fill_bad = els['acc-bank-name'].value;
sandbox.fillBankSelect(els['acc-bank-name'], 'VCB');
out.fill_ok = els['acc-bank-name'].value;
out.bank_count = sandbox.VIETQR_BANKS.length;
out.display_tpb = sandbox.getBankDisplayName('TPB');
out.display_unknown = sandbox.getBankDisplayName('XYZ');
out.bank_dupes = sandbox.VIETQR_BANKS.length - new Set(sandbox.VIETQR_BANKS.map(b => b.code)).size;
console.log(JSON.stringify(out));
"""


def test_pos_bank_select_js():
    r = subprocess.run(["node", "-e", NODE], cwd=ROOT, capture_output=True, text=True, encoding="utf-8")
    assert r.returncode == 0, r.stderr
    out = json.loads(r.stdout.strip().splitlines()[-1])
    assert out["cash_keeps"] == 1
    assert out["transfer_acc"] == 2  # bank đầu tiên, không phải két
    assert out["select_has_cash"] is False
    assert out["err_broken"] and "TK hỏng" in out["err_broken"]
    assert out["err_ok"] is None
    assert out["err_none"]
    assert out["resolved_broken"]["account_number"] == ""  # không lấy 'BANK-CHINH'
    assert out["fill_bad"] == ""
    assert out["fill_ok"] == "VCB"
    assert out["bank_count"] >= 20 and out["bank_dupes"] == 0
    assert out["display_tpb"] == "Ngân hàng TMCP Tiên Phong (TPBank)"
    assert out["display_unknown"] == "XYZ"


def test_create_order_single_transfer_saves_method():
    from fastapi.testclient import TestClient
    from database import init_db, get_db
    from server import app
    from dependencies import get_current_user

    init_db()
    app.dependency_overrides[get_current_user] = lambda: {"id": 1, "name": "Admin", "role": "owner", "is_active": 1}
    client = TestClient(app)

    db = get_db(); cur = db.cursor()
    cur.execute("INSERT INTO payment_accounts (code, name, account_type, bank_name, account_number, account_holder, is_active) VALUES ('TEST_BSEL_MB','MB test','bank','MB','555666','X',1)")
    acc_id = cur.lastrowid
    cur.execute("INSERT INTO products (code, name, type, sell_price, cost_price, stock, unit) VALUES ('TEST_BSEL_P','SP test','product',50000,1000,100,'cái')")
    prod_id = cur.lastrowid
    db.commit(); db.close()

    order_id = None
    try:
        r = client.post("/api/orders", json={
            "customer_id": 1, "staff_id": 1, "discount": 0, "paid_amount": 50000,
            "payment_method": "transfer", "account_id": acc_id,
            "items": [{"product_id": prod_id, "quantity": 1, "price": 50000}],
        })
        assert r.status_code == 200, r.text
        code = r.json()["order_code"]
        d = client.get(f"/api/orders/{code}").json()
        order_id = d["id"]
        assert d["is_cash_payment"] is False
        assert d["bank_account"]["account_number"] == "555666"
        assert d["bank_account"]["bank_name"] == "MB"
    finally:
        db = get_db(); cur = db.cursor()
        if order_id:
            for t, col in [("order_payments", "order_id"), ("order_items", "order_id"), ("inventory_logs", "order_id")]:
                cur.execute(f"DELETE FROM {t} WHERE {col} = ?", (order_id,))
            cur.execute("DELETE FROM cashbook WHERE ref_type='order' AND ref_id = ?", (order_id,))
            cur.execute("DELETE FROM orders WHERE id = ?", (order_id,))
        cur.execute("DELETE FROM product_inventory WHERE product_id = ?", (prod_id,))
        cur.execute("DELETE FROM products WHERE id = ?", (prod_id,))
        cur.execute("DELETE FROM payment_accounts WHERE id = ?", (acc_id,))
        db.commit(); db.close()
