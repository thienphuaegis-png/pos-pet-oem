from pathlib import Path

def test_sync_doc_types_and_presets_logic():
    """Kiểm tra logic doc_type và lọc mẫu in theo ngữ cảnh trong static/js/modules/productions.js"""
    js_path = Path("static/js/modules/productions.js")
    assert js_path.exists()
    content = js_path.read_text(encoding="utf-8")

    # 1. Có hàm suy luận doc_type từ key / preset
    assert "function inferDocTypeFromKey" in content or "inferDocTypeFromKey" in content
    assert "window.inferDocTypeFromKey = inferDocTypeFromKey" in content

    # 2. Các preset mặc định có khai báo doc_type
    assert 'doc_type: "pos_retail"' in content
    assert 'doc_type: "pos_b2b"' in content
    assert 'doc_type: "pos_draft"' in content
    assert 'doc_type: "spa_intake"' in content
    assert 'doc_type: "pos_topup"' in content
    assert 'doc_type: "spa_invoice"' in content
    assert 'doc_type: "cashbook_thu"' in content
    assert 'doc_type: "cashbook_chi"' in content
    assert 'doc_type: "shift_zreport"' in content
    assert 'doc_type: "stock_audit"' in content

    # 3. renderPresetSelect có hỗ trợ lọc theo active_doc_type và filterDocType
    assert "function renderPresetSelect(filterDocType)" in content
    assert "activeDoc = filterDocType || multiTemplates.active_doc_type" in content

    # 4. selectPrintDocType có docMap chuẩn xác với presets
    assert "'spa_intake': 'spa_intake_k80'" in content
    assert "'pos_topup': 'pos_topup_k80'" in content
    assert "'spa_invoice': 'spa_invoice_k80'" in content
    assert "'cashbook_thu': 'cashbook_thu_k80'" in content
    assert "'cashbook_chi': 'cashbook_chi_k80'" in content
    assert "'shift_zreport': 'shift_zreport_k80'" in content
    assert "'stock_audit': 'stock_audit_a4'" in content
