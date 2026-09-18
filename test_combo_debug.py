from database import get_db
conn = get_db()
cur = conn.cursor()

cur.execute("SELECT id FROM products WHERE code = ? AND type = 'combo'", ('CB01',))
row = cur.fetchone()
print(f'Combo product entry: {dict(row) if row else None}')

cur.execute('SELECT * FROM product_inventory WHERE product_id = 1000')
row = cur.fetchone()
print(f'Product 1000 in inventory: {dict(row) if row else None}')

cur.execute('SELECT * FROM product_inventory WHERE product_id = 1012')
row = cur.fetchone()
print(f'Product 1012 in inventory: {dict(row) if row else None}')

cur.execute('SELECT * FROM product_inventory WHERE product_id = 1013')
row = cur.fetchone()
print(f'Product 1013 in inventory: {dict(row) if row else None}')

conn.close()
