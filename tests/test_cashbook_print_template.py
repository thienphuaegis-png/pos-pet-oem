"""In phiếu Thu/Chi phải dùng mẫu Cài đặt (cashbook_{thu|chi}_{k80|a4}) và API sổ quỹ trả địa chỉ đối tác."""
import json
import os
import subprocess
import sys

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))
from database import get_db

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))


def test_build_cashbook_print_html_uses_preset_tokens():
    node_code = r"""
    const fs = require('fs'), vm = require('vm');
    const src = fs.readFileSync('static/js/modules/productions.js', 'utf8');
    const grab = (start, end) => { const i = src.indexOf(start); return src.slice(i, src.indexOf(end, i)); };
    const sb = { window: {}, formatMoney: n => Number(n).toLocaleString('vi-VN') + ' đ', formatDateTime: s => s };
    vm.createContext(sb);
    vm.runInContext(grab('window.numberToVietnameseWords = function', 'window.printCurrentCashbookVoucher') , sb);
    vm.runInContext(grab('function getCashbookThuElementsK80', 'function getCashbookChiElementsK80'), sb);
    const settings = { shop_name: 'Mastercare Test', shop_address: '12 Lê Lợi', shop_phone: '0909' };
    const c = { type: 'in', code: 'PT-001', created_at: '2026-10-29 09:00:00', contact_name: 'Chị Lan',
                contact_phone: '0912', contact_address: '5 Trần Phú', category: 'Thu nợ', account_name: 'Két Cty',
                amount: 1250000, note: 'Thu nợ <đơn> HD01' };
    const k80 = { elements: sb.getCashbookThuElementsK80() };
    const a4 = { elements: sb.getCashbookThuElementsA4() };
    const out = {
      k80: sb.window.buildCashbookPrintHtml(c, k80, settings),
      a4: sb.window.buildCashbookPrintHtml(c, a4, settings),
      noAddr: sb.window.buildCashbookPrintHtml({ ...c, contact_address: '', contact_phone: '' },
                 { elements: [...k80.elements, { id: 'x', type: 'text', text: 'Địa chỉ: {{dia_chi_khach}}', x: 0, y: 0 }] }, settings),
    };
    console.log(JSON.stringify(out));
    """
    res = subprocess.run(["node", "-e", node_code], capture_output=True, text=True, cwd=ROOT, encoding="utf-8")
    assert res.returncode == 0, res.stderr
    out = json.loads(res.stdout)
    k80, a4, no_addr = out["k80"], out["a4"], out["noAddr"]

    for html in (k80, a4):
        assert "{{" not in html, "Còn token chưa thay"
        assert "PT-001" in html and "Chị Lan" in html and "1.250.000 đ" in html
        assert "Thu nợ &lt;đơn&gt; HD01" in html, "Diễn giải phải được escape HTML"
    assert "Mastercare Test" in k80 and "Két Cty" in k80 and "Người Lập Phiếu" in k80
    assert "12 Lê Lợi" in a4 and "Thủ Quỹ" in a4 and "Một triệu hai trăm năm mươi nghìn" in a4
    assert "PET CARE" not in k80 + a4 and "Nha Trang" not in k80 + a4, "Không được in chữ giả"
    assert "Địa chỉ:" not in no_addr, "Đối tác không có địa chỉ -> ẩn dòng địa chỉ"
    assert "()" not in no_addr, "SĐT trống -> bỏ cặp ngoặc rỗng"


def test_cashbook_list_returns_contact_address(tmp_path, monkeypatch):
    # DB riêng: tránh khóa DB do test khác để lại kết nối mở
    monkeypatch.setenv("POS_DB_PATH", str(tmp_path / "pos.db"))
    from database import init_db
    init_db()
    from routers.cashbook import list_cashbook
    conn = get_db()
    cur = conn.cursor()
    cur.execute("INSERT INTO contacts (type, name, phone, address) VALUES ('customer', 'KH In Phieu', '0900', '99 Hai Bà Trưng')")
    cid = cur.lastrowid
    cur.execute("INSERT INTO cashbook (code, type, category, amount, contact_id, note) VALUES ('PT-ADDR-TEST', 'in', 'Thu khác', 1000, ?, '')", (cid,))
    conn.commit()
    conn.close()
    rows = list_cashbook(type=None, account_id=None, limit=1000)
    row = next(r for r in rows if r["code"] == "PT-ADDR-TEST")
    assert row["contact_address"] == "99 Hai Bà Trưng"
