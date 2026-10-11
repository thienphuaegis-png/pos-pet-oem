import subprocess
from pathlib import Path

def test_pos_js_contains_split_and_merge_functions():
    pos_js = Path("static/js/pos.js").read_text(encoding="utf-8")
    
    # 1. Kiểm tra tồn tại các hàm và window export
    assert "function splitCartItemToGift" in pos_js
    assert "function mergeManualGiftItem" in pos_js
    assert "window.splitCartItemToGift = splitCartItemToGift" in pos_js
    assert "window.mergeManualGiftItem = mergeManualGiftItem" in pos_js
    
    # 2. Kiểm tra syncBuyXGetYPromotionsInCart bảo vệ manual gift
    assert "!item.is_gift || item.is_manual_gift" in pos_js
    
    # 3. Kiểm tra addProductToActiveCart không gộp vào quà tặng
    assert "item.product_id === productId && !item.is_gift" in pos_js
    
    # 4. Kiểm tra UI render nút Tách tặng và Gộp lại
    assert "splitCartItemToGift" in pos_js
    assert "mergeManualGiftItem" in pos_js
    assert "🎁 QUÀ TẶNG" in pos_js


def test_pos_split_and_merge_real_execution_via_node():
    """Chạy node nạp trực tiếp static/js/pos.js để kiểm tra luồng thực tế:
    1. Giỏ hàng có 1 sản phẩm số lượng 3.
    2. Tách 1 món làm quà tặng -> Dòng gốc còn 2, dòng quà tặng sinh ra có SL 1, giá 0đ, is_gift = true, is_manual_gift = true.
    3. Tách tiếp 1 món -> Dòng gốc còn 1, dòng quà tặng dồn lên SL 2.
    4. syncBuyXGetYPromotionsInCart chạy -> Quà tặng thủ công không bị xóa.
    5. Gộp lại -> Dòng gốc trở lại SL 3, dòng quà tặng bị xóa.
    6. Nếu dòng gốc bị xóa, gộp quà tặng biến lại thành dòng thường với giá gốc.
    """
    node_code = """
    const fs = require('fs');
    const vm = require('vm');
    const content = fs.readFileSync('static/js/pos.js', 'utf8');

    const sandbox = {
        document: {
            getElementById: () => null,
            addEventListener: () => {},
            createElement: () => ({ textContent: '', id: '' }),
            readyState: 'loading'
        },
        console: console,
        setTimeout: () => {}
    };
    sandbox.window = sandbox;
    sandbox.global = sandbox;
    vm.createContext(sandbox);
    vm.runInContext(content, sandbox);

    const tab = sandbox.getActiveTab();
    tab.cart = [
        {
            product_id: 101,
            code: 'SP01',
            name: 'Thức ăn hạt mèo',
            price: 50000,
            original_price: 50000,
            base_price: 50000,
            quantity: 3,
            unit: 'gói',
            base_unit: 'gói',
            unit_ratio: 1,
            units: []
        }
    ];

    // --- BƯỚC 1: Tách 1 món từ dòng 3 món ---
    sandbox.splitCartItemToGift(0, 1);
    if (tab.cart.length !== 2) throw new Error(`Sau khi tách, giỏ hàng phải có 2 dòng (thực tế ${tab.cart.length})`);
    if (tab.cart[0].quantity !== 2) throw new Error(`Dòng gốc phải còn 2 (thực tế ${tab.cart[0].quantity})`);
    
    const gift1 = tab.cart[1];
    if (gift1.quantity !== 1 || gift1.price !== 0 || !gift1.is_gift || !gift1.is_manual_gift) {
        throw new Error('Dòng quà tặng không đúng thuộc tính (price=0, is_gift=true, is_manual_gift=true)');
    }

    // --- BƯỚC 2: Tách thêm 1 món (cộng dồn vào dòng quà tặng có sẵn) ---
    sandbox.splitCartItemToGift(0, 1);
    if (tab.cart.length !== 2) throw new Error(`Giỏ hàng vẫn phải có 2 dòng sau khi tách thêm`);
    if (tab.cart[0].quantity !== 1) throw new Error(`Dòng gốc phải còn 1`);
    if (tab.cart[1].quantity !== 2) throw new Error(`Dòng quà tặng phải được cộng dồn lên 2`);

    // --- BƯỚC 3: syncBuyXGetYPromotionsInCart giữ nguyên quà tặng thủ công ---
    sandbox.posActivePromoRules = [
        { promo_type: 'buy_x_get_y', product_id: 101, buy_qty: 10, gift_qty: 1 }
    ];
    sandbox.syncBuyXGetYPromotionsInCart(tab);
    if (tab.cart.length !== 2) throw new Error('syncBuyXGetYPromotionsInCart đã xóa mất quà tặng thủ công');
    if (!tab.cart.find(i => i.is_manual_gift)) throw new Error('Không còn quà tặng thủ công sau khi sync');

    // --- BƯỚC 4: Gộp lại vào dòng gốc ---
    sandbox.mergeManualGiftItem(1);
    if (tab.cart.length !== 1) throw new Error(`Sau khi gộp, giỏ hàng phải còn 1 dòng (thực tế ${tab.cart.length})`);
    if (tab.cart[0].quantity !== 3) throw new Error(`Dòng gốc phải trở lại số lượng 3 (thực tế ${tab.cart[0].quantity})`);
    if (tab.cart[0].is_gift) throw new Error('Dòng gốc không được là quà tặng');

    // --- BƯỚC 5: Kiểm tra nếu dòng gốc đã bị xóa, gộp quà tặng chuyển lại thành dòng bán thường ---
    sandbox.splitCartItemToGift(0, 1);
    // Xóa dòng gốc (idx 0)
    tab.cart.splice(0, 1);
    if (tab.cart.length !== 1 || !tab.cart[0].is_manual_gift) throw new Error('Giỏ hàng phải còn duy nhất dòng quà tặng');
    sandbox.mergeManualGiftItem(0);
    if (tab.cart.length !== 1) throw new Error('Giỏ hàng phải có 1 dòng');
    if (tab.cart[0].is_gift || tab.cart[0].price !== 50000) {
        throw new Error('Dòng quà tặng khi gộp mà không có dòng gốc phải chuyển lại thành dòng bán thường giá gốc');
    }

    console.log("REAL_POS_JS_TEST_SUCCESS");
    """
    res = subprocess.run(["node", "-e", node_code], capture_output=True, text=True)
    assert res.returncode == 0, f"Node script error: {res.stderr}"
    assert "REAL_POS_JS_TEST_SUCCESS" in res.stdout
