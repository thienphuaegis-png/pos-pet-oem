import unittest
import sqlite3
import os
import requests
import pytest
from tests.conftest import is_port_open

pytestmark = pytest.mark.skipif(not is_port_open(), reason="Cần server 127.0.0.1:8999 đang chạy")

DB_PATH = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), 'data', 'pos.db')

class TestPetPricingImport(unittest.TestCase):
    def setUp(self):
        self.conn = sqlite3.connect(DB_PATH)
        self.cur = self.conn.cursor()

    def tearDown(self):
        self.conn.close()

    def test_total_pricing_count(self):
        count = self.cur.execute("SELECT COUNT(*) FROM pet_service_pricing").fetchone()[0]
        self.assertEqual(count, 79, f"Expected 79 records, found {count}")

    def test_categories_present(self):
        cats = [r[0] for r in self.cur.execute("SELECT DISTINCT category FROM pet_service_pricing").fetchall()]
        expected_cats = {'Gói Combo Chó', 'Dịch Vụ Lẻ Chó', 'Spa Mèo', 'Nhuộm Lông', 'Trị Liệu & Phụ Thu'}
        self.assertTrue(expected_cats.issubset(set(cats)), f"Missing categories. Found: {cats}")

    def test_dog_combo_prices(self):
        # Combo Vip 2 (đổi tên từ CB Tắm (1+2+3)): 0-2kg: 100k, >2-6kg: 150k, >6-10kg: 200k, >40-50kg: 490k, >=50kg: 550k
        p_0_2 = self.cur.execute("SELECT price FROM pet_service_pricing WHERE service_name IN ('Combo Vip 2', 'CB Tắm (1+2+3)') AND min_weight=0.0 AND max_weight=2.0").fetchone()[0]
        self.assertEqual(p_0_2, 100000.0)

        p_2_6 = self.cur.execute("SELECT price FROM pet_service_pricing WHERE service_name IN ('Combo Vip 2', 'CB Tắm (1+2+3)') AND min_weight=2.0 AND max_weight=6.0").fetchone()[0]
        self.assertEqual(p_2_6, 150000.0)

        p_50 = self.cur.execute("SELECT price FROM pet_service_pricing WHERE service_name IN ('Combo Vip 2', 'CB Tắm (1+2+3)') AND min_weight=50.0").fetchone()[0]
        self.assertEqual(p_50, 550000.0)

    def test_cat_prices(self):
        rows = self.cur.execute("SELECT min_weight, max_weight, price FROM pet_service_pricing WHERE service_name='Combo Tắm Vệ Sinh Mèo' ORDER BY min_weight").fetchall()
        self.assertEqual(len(rows), 3)
        self.assertEqual(rows[0][2], 150000.0) # < 2kg
        self.assertEqual(rows[1][2], 200000.0) # 2 - 6kg
        self.assertEqual(rows[2][2], 250000.0) # > 6kg

    def test_dye_prices(self):
        p = self.cur.execute("SELECT price FROM pet_service_pricing WHERE service_name='Nhuộm: 1 Màu (2 Tai + Đuôi)'").fetchone()[0]
        self.assertEqual(p, 250000.0)
        p2 = self.cur.execute("SELECT price FROM pet_service_pricing WHERE service_name='Nhuộm: Trên 2 Màu (2 Tai + Đuôi + 4 Chân)'").fetchone()[0]
        self.assertEqual(p2, 450000.0)

    def test_api_endpoint(self):
        res = requests.get("http://127.0.0.1:8999/api/pet-services/pricing")
        self.assertEqual(res.status_code, 200)
        data = res.json()
        self.assertEqual(len(data), 79)

if __name__ == '__main__':
    unittest.main()
