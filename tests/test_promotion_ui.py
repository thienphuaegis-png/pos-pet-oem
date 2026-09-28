import os
from bs4 import BeautifulSoup

def test_promotion_dom_and_modals():
    html_path = os.path.join(os.path.dirname(__file__), '..', 'templates', 'index.html')
    with open(html_path, 'r', encoding='utf-8') as f:
        html = f.read()
    soup = BeautifulSoup(html, 'html.parser')

    # 1. Nút thêm chương trình trong subtab promotions
    subtab = soup.find(id='pl-subtab-promotions')
    assert subtab is not None, "Không tìm thấy #pl-subtab-promotions"
    add_btn = subtab.find('button', onclick='openPromotionModal()')
    assert add_btn is not None, "Không tìm thấy nút mở modal thêm khuyến mãi"

    # 2. Bảng khuyến mãi có đủ 8 cột
    table = subtab.find('table')
    assert table is not None
    headers = [th.get_text(strip=True) for th in table.find_all('th')]
    assert 'ID' in headers
    assert 'Mã KM' in headers
    assert 'Tên Chương Trình' in headers
    assert 'Thao Tác' in headers

    # 3. Modal tạo/sửa khuyến mãi #modal-promotion
    modal_promo = soup.find(id='modal-promotion')
    assert modal_promo is not None, "Thiếu modal #modal-promotion"
    assert modal_promo.find(id='promo-code') is not None
    assert modal_promo.find(id='promo-name') is not None
    assert modal_promo.find(id='promo-start-date') is not None
    assert modal_promo.find(id='promo-end-date') is not None
    assert modal_promo.find(id='promo-active') is not None
    assert modal_promo.find('button', onclick='savePromotion()') is not None

    # 4. Modal quản lý sản phẩm khuyến mãi #modal-promotion-items
    modal_items = soup.find(id='modal-promotion-items')
    assert modal_items is not None, "Thiếu modal #modal-promotion-items"
    assert modal_items.find(id='promo-items-promo-id') is not None
    assert modal_items.find(id='promo-item-prod-select') is not None
    assert modal_items.find(id='promo-item-discount-type') is not None
    assert modal_items.find(id='promo-item-discount-val') is not None
    assert modal_items.find('button', onclick='addSinglePromotionItem()') is not None

    # Hỗ trợ thêm hàng loạt theo nhóm hàng
    assert modal_items.find(id='promo-bulk-category-select') is not None
    assert modal_items.find(id='promo-bulk-discount-type') is not None
    assert modal_items.find(id='promo-bulk-discount-val') is not None
    assert modal_items.find('button', onclick='bulkAddPromotionCategory()') is not None

    # Bảng sản phẩm trong modal
    assert modal_items.find(id='promo-items-tbody') is not None

    # 5. Các hàm JS bắt buộc
    required_js_funcs = [
        'function loadPromotionsList(',
        'function openPromotionModal(',
        'function closePromotionModal(',
        'function editPromotion(',
        'function savePromotion(',
        'function deletePromotion(',
        'function togglePromotionStatus(',
        'function openPromotionItemsModal(',
        'function closePromotionItemsModal(',
        'function loadPromotionItems(',
        'function addSinglePromotionItem(',
        'function bulkAddPromotionCategory(',
        'function deletePromotionItem('
    ]
    # 6. Các thành phần KM dành riêng cho Dịch Vụ Spa
    assert modal_items.find(id='promo-target-tab-spa') is not None, "Thiếu tab chọn Spa"
    assert modal_items.find(id='promo-spa-service-select') is not None, "Thiếu dropdown chọn gói Spa"
    assert modal_items.find(id='promo-spa-category-select') is not None, "Thiếu dropdown chọn nhóm Spa"
    assert modal_items.find('button', onclick='addSinglePromotionSpaService()') is not None
    assert modal_items.find('button', onclick='addPromotionSpaCategory()') is not None

    required_spa_js_funcs = [
        'function switchPromoTargetTab(',
        'function addSinglePromotionSpaService(',
        'function addPromotionSpaCategory('
    ]
    for func in required_spa_js_funcs:
        assert func in html, f"Thiếu định nghĩa hàm JS Spa: {func}"
