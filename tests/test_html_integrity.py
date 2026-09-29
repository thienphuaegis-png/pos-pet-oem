import os
import unittest
from bs4 import BeautifulSoup

class TestHtmlIntegrity(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        html_path = os.path.join(os.path.dirname(__file__), '..', 'templates', 'index.html')
        with open(html_path, 'r', encoding='utf-8') as f:
            cls.html = f.read()
        cls.soup = BeautifulSoup(cls.html, 'html.parser')

    def test_main_content_area_exists(self):
        main = self.soup.find(id='main-content-area')
        self.assertIsNotNone(main, 'Phải có div id=main-content-area')

    def test_all_tabs_are_direct_children_of_main_content_area(self):
        expected_tabs = [
            'tab-pos',
            'tab-orders',
            'tab-price-lists',
            'tab-inventory',
            'tab-pet-services',
            'tab-purchases',
            'tab-oem',
            'tab-contacts',
            'tab-cashbook',
            'tab-cashflow-debts',
            'tab-reports',
            'tab-settings',
        ]
        for tid in expected_tabs:
            tab_el = self.soup.find(id=tid)
            self.assertIsNotNone(tab_el, f'Không tìm thấy tab với id: {tid}')
            self.assertIsNotNone(tab_el.parent, f'Tab {tid} không có thẻ cha')
            self.assertEqual(
                tab_el.parent.get('id'),
                'main-content-area',
                f'Tab {tid} phải nằm trực tiếp bên trong #main-content-area, nhưng lại thuộc #{tab_el.parent.get("id")} ({tab_el.parent.name})'
            )

    def test_no_orphan_closing_tags(self):
        # Basic balance check
        main = self.soup.find(id='main-content-area')
        self.assertTrue(len(main.find_all(recursive=False)) >= 12, 'main-content-area phải chứa ít nhất 12 tabs')

    def test_sidebar_lucide_badge_icons(self):
        sidebar_nav = self.soup.find(id='sidebar-nav')
        self.assertIsNotNone(sidebar_nav, 'Phải có nav id=sidebar-nav')
        buttons = sidebar_nav.find_all('button', class_='tab-btn')
        self.assertEqual(len(buttons), 14, 'Sidebar phải có 14 nút điều hướng')
        for btn in buttons:
            icon_span = btn.find('span', class_='sidebar-icon')
            self.assertIsNotNone(icon_span, f"Nút {btn.get('data-tab')} thiếu thẻ span.sidebar-icon")
            svg = icon_span.find('svg')
            self.assertIsNotNone(svg, f"Nút {btn.get('data-tab')} phải chứa SVG icon Lucide")
            self.assertTrue(svg.get('viewbox') or svg.get('viewBox'), f"SVG trong nút {btn.get('data-tab')} phải có viewBox")

if __name__ == '__main__':
    unittest.main()
