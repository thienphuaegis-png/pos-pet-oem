import os
import re

def test_spa_single_and_batch_surcharge_toggle_presence():
    base_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    spa_js_path = os.path.join(base_dir, "static", "js", "modules", "spa.js")
    
    with open(spa_js_path, "r", encoding="utf-8") as f:
        content = f.read()
        
    # Single pet verification
    assert "syncQuickSurchargeButtonVisibility" in content, "Thiếu hàm syncQuickSurchargeButtonVisibility"
    assert "data-surch-name=" in content, "Nút phụ thu đơn lẻ phải có data-surch-name"
    assert "quick-surch-btn" in content, "Nút phụ thu đơn lẻ phải có class quick-surch-btn"
    
    # Batch pet verification
    assert "batch-selected-surch-list" in content, "Thiếu container batch-selected-surch-list"
    assert "batch-surch-chips-pool" in content, "Thiếu pool chứa nút batch-surch-chips-pool"
    assert "pickBatchRowChip" in content, "Thiếu hàm pickBatchRowChip"
    assert "cancelBatchRowChip" in content, "Thiếu hàm cancelBatchRowChip"
    assert "addCustomBatchRowSurcharge" in content, "Thiếu hàm addCustomBatchRowSurcharge"
    assert "batch-surch-item" in content, "Thiếu class batch-surch-item"
    assert "batch-surch-price" in content, "Thiếu class batch-surch-price"
    
    # Global exports
    assert "window.pickBatchRowChip = pickBatchRowChip" in content
    assert "window.cancelBatchRowChip = cancelBatchRowChip" in content
    assert "window.syncQuickSurchargeButtonVisibility = syncQuickSurchargeButtonVisibility" in content

def test_index_html_has_batch_table_with_surcharge_col():
    base_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    index_path = os.path.join(base_dir, "templates", "index.html")
    
    with open(index_path, "r", encoding="utf-8") as f:
        html = f.read()
        
    assert 'id="table-batch-pets"' in html
    assert 'id="tbody-batch-pets"' in html
    assert 'id="svc-quick-surcharges-container"' in html
    assert 'id="svc-extra-services-list"' in html
