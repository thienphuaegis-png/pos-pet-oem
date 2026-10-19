import os

def test_pos_search_inputs_have_focus_and_click_handlers():
    base_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    
    # Check templates/index.html
    index_path = os.path.join(base_dir, "templates", "index.html")
    with open(index_path, "r", encoding="utf-8") as f:
        index_html = f.read()
    
    assert 'id="pos-search-input"' in index_html
    assert 'filterProductSearch' in index_html
    assert 'id="pos-customer-search"' in index_html
    assert 'filterCustomerSearch' in index_html
    
    # Check templates/pos.html
    pos_path = os.path.join(base_dir, "templates", "pos.html")
    with open(pos_path, "r", encoding="utf-8") as f:
        pos_html = f.read()
        
    assert 'id="pos-search-input"' in pos_html
    assert 'id="pos-customer-search"' in pos_html

def test_pos_js_has_suggestion_logic():
    base_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    js_path = os.path.join(base_dir, "static", "js", "pos.js")
    with open(js_path, "r", encoding="utf-8") as f:
        pos_js = f.read()
        
    assert "10 mặt hàng gợi ý" in pos_js
    assert "10 khách hàng gợi ý" in pos_js
    assert "addEventListener('focus'" in pos_js
    assert "addEventListener('click'" in pos_js
