from database import get_db
import datetime

conn = get_db()
cur = conn.cursor()

# Step 1: Insert order
code = f"HD{datetime.datetime.now().strftime('%y%m%d%H%M%S')}"
cur.execute('INSERT INTO orders (code, customer_id, staff_id, total_amount, discount, final_amount, paid_amount, debt_amount, commission_amount, note) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)', (code, 1, 1, 100000, 0, 100000, 200000, 0, 0, 'Test'))
order_id = cur.lastrowid
print(f'Order inserted: id={order_id}')

# Step 2: Insert order_item for product 1000 (DDST)
cur.execute('INSERT INTO order_items (order_id, product_id, quantity, price, subtotal) VALUES (?, ?, ?, ?, ?)', (order_id, 1000, 1, 0, 0))
print('order_items for DDST OK')

# Step 3: Update product stock for DDST
cur.execute('UPDATE products SET stock = stock - ? WHERE id = ?', (1, 1000))
print('DDST stock update OK')

# Step 4: Insert product_inventory for DDST
try:
    cur.execute('INSERT INTO product_inventory (warehouse_id, product_id, quantity, updated_at) VALUES (?, ?, ?, CURRENT_TIMESTAMP) ON CONFLICT(warehouse_id, product_id) DO UPDATE SET quantity = quantity - ?, updated_at = CURRENT_TIMESTAMP', (1, 1000, -1, 1))
    print('product_inventory DDST OK')
except Exception as e:
    print(f'product_inventory DDST ERROR: {e}')

# Step 5: BOM for DDST - no BOM, skip

# Step 6: Insert order_item for product 1013 (TTB)
cur.execute('INSERT INTO order_items (order_id, product_id, quantity, price, subtotal) VALUES (?, ?, ?, ?, ?)', (order_id, 1013, 1, 89000, 89000))
print('order_items for TTB OK')

# Step 7: Update product stock for TTB
cur.execute('UPDATE products SET stock = stock - ? WHERE id = ?', (1, 1013))
print('TTB stock update OK')

# Step 8: product_inventory for TTB
try:
    cur.execute('INSERT INTO product_inventory (warehouse_id, product_id, quantity, updated_at) VALUES (?, ?, ?, CURRENT_TIMESTAMP) ON CONFLICT(warehouse_id, product_id) DO UPDATE SET quantity = quantity - ?, updated_at = CURRENT_TIMESTAMP', (1, 1013, -1, 1))
    print('product_inventory TTB OK')
except Exception as e:
    print(f'product_inventory TTB ERROR: {e}')

# Step 9: BOM for TTB
cur.execute('SELECT b.ingredient_id, b.quantity, i.type as ingredient_type FROM product_bom b JOIN ingredients i ON b.ingredient_id = i.id WHERE b.product_id = ?', (1013,))
bom_rows = cur.fetchall()
print(f'BOM for TTB: {len(bom_rows)} rows')
for bom in bom_rows:
    total_consumed = bom['quantity'] * 1
    try:
        cur.execute('INSERT INTO inventory (warehouse_id, ingredient_id, quantity, updated_at) VALUES (?, ?, ?, CURRENT_TIMESTAMP) ON CONFLICT(warehouse_id, ingredient_id) DO UPDATE SET quantity = quantity - ?, updated_at = CURRENT_TIMESTAMP', (1, bom['ingredient_id'], -total_consumed, total_consumed))
        print(f'  inventory for ingredient {bom["ingredient_id"]} OK')
    except Exception as e:
        print(f'  inventory ERROR for ingredient {bom["ingredient_id"]}: {e}')

    # inventory_logs
    cur.execute('SELECT quantity FROM inventory WHERE warehouse_id = ? AND ingredient_id = ?', (1, bom['ingredient_id']))
    bal_row = cur.fetchone()
    balance_after = bal_row['quantity'] if bal_row else 0
    try:
        cur.execute('INSERT INTO inventory_logs (ingredient_id, warehouse_id, change_type, quantity, balance_after, order_id, order_code, note) VALUES (?, ?, ?, ?, ?, ?, ?, ?)', (bom['ingredient_id'], 1, 'SALE', -total_consumed, balance_after, order_id, code, 'Test'))
        print(f'  inventory_logs for ingredient {bom["ingredient_id"]} OK')
    except Exception as e:
        print(f'  inventory_logs ERROR for ingredient {bom["ingredient_id"]}: {e}')

# Step 10: BOM for TTG (1012)
cur.execute('SELECT b.ingredient_id, b.quantity, i.type as ingredient_type FROM product_bom b JOIN ingredients i ON b.ingredient_id = i.id WHERE b.product_id = ?', (1012,))
bom_rows = cur.fetchall()
print(f'BOM for TTG: {len(bom_rows)} rows')
for bom in bom_rows:
    total_consumed = bom['quantity'] * 1
    try:
        cur.execute('INSERT INTO inventory (warehouse_id, ingredient_id, quantity, updated_at) VALUES (?, ?, ?, CURRENT_TIMESTAMP) ON CONFLICT(warehouse_id, ingredient_id) DO UPDATE SET quantity = quantity - ?, updated_at = CURRENT_TIMESTAMP', (1, bom['ingredient_id'], -total_consumed, total_consumed))
        print(f'  inventory for ingredient {bom["ingredient_id"]} OK')
    except Exception as e:
        print(f'  inventory ERROR for ingredient {bom["ingredient_id"]}: {e}')

    cur.execute('SELECT quantity FROM inventory WHERE warehouse_id = ? AND ingredient_id = ?', (1, bom['ingredient_id']))
    bal_row = cur.fetchone()
    balance_after = bal_row['quantity'] if bal_row else 0
    try:
        cur.execute('INSERT INTO inventory_logs (ingredient_id, warehouse_id, change_type, quantity, balance_after, order_id, order_code, note) VALUES (?, ?, ?, ?, ?, ?, ?, ?)', (bom['ingredient_id'], 1, 'SALE', -total_consumed, balance_after, order_id, code, 'Test'))
        print(f'  inventory_logs for ingredient {bom["ingredient_id"]} OK')
    except Exception as e:
        print(f'  inventory_logs ERROR for ingredient {bom["ingredient_id"]}: {e}')

conn.rollback()
conn.close()
print('Done')