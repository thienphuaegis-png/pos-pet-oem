from database import get_db
import datetime

conn = get_db()
cur = conn.cursor()

# Reset stock
cur.execute('UPDATE products SET stock = 50 WHERE id IN (1000, 1012, 1013)')
conn.commit()

# Now run the actual sell_combo logic step by step
combo_id = 1
quantity = 1
customer_id = 1
staff_id = 1
discount = 0
paid_amount = 200000
note = ""

cur.execute("SELECT * FROM combos WHERE id = ? AND COALESCE(is_active, 1) = 1", (combo_id,))
combo = cur.fetchone()
print(f"Combo: {dict(combo)}")

cur.execute('''
SELECT ci.product_id, ci.quantity as quantity, p.name, p.sell_price, p.unit, p.type
FROM combo_items ci
JOIN products p ON ci.product_id = p.id
WHERE ci.combo_id = ? AND p.type != 'material' AND COALESCE(p.is_active, 1) = 1
ORDER BY ci.id ASC
''', (combo_id,))
components = [dict(r) for r in cur.fetchall()]
print(f"Components: {components}")

code = f"HD{datetime.datetime.now().strftime('%y%m%d%H%M%S')}"
total_amount = sum(c["sell_price"] * c["quantity"] * quantity for c in components)
final_amount = max(0.0, total_amount - discount)
debt_amount = max(0.0, final_amount - paid_amount)

cur.execute("SELECT commission_rate FROM staff WHERE id = ?", (staff_id,))
staff_row = cur.fetchone()
comm_rate = staff_row["commission_rate"] if staff_row else 0
commission_amount = (final_amount * comm_rate) / 100.0

warehouse_id = 1

cur.execute('''
INSERT INTO orders (code, customer_id, staff_id, total_amount, discount, final_amount, paid_amount, debt_amount, commission_amount, note)
VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
''', (code, customer_id, staff_id, total_amount, discount, final_amount, paid_amount, debt_amount, commission_amount, f"Combo: {combo['name']} | {note}"))
order_id = cur.lastrowid
print(f"Order inserted: id={order_id}")

for c in components:
    line_qty = c["quantity"] * quantity
    line_price = c["sell_price"]
    subtotal = line_qty * line_price
    
    print(f"  Component: {c['name']} qty={line_qty}")
    
    cur.execute('''
    INSERT INTO order_items (order_id, product_id, quantity, price, subtotal)
    VALUES (?, ?, ?, ?, ?)
    ''', (order_id, c["product_id"], line_qty, line_price, subtotal))
    print(f"    order_items OK")
    
    if c["type"] != "service":
        cur.execute("UPDATE products SET stock = stock - ? WHERE id = ? AND type != 'service'", (line_qty, c["product_id"]))
        print(f"    stock update OK")
        cur.execute('''
        INSERT INTO product_inventory (warehouse_id, product_id, quantity, updated_at)
        VALUES (?, ?, ?, CURRENT_TIMESTAMP)
        ON CONFLICT(warehouse_id, product_id) DO UPDATE SET
            quantity = quantity - ?, updated_at = CURRENT_TIMESTAMP
        ''', (warehouse_id, c["product_id"], -line_qty, line_qty))
        print(f"    product_inventory OK")
    
    cur.execute('''
    SELECT b.ingredient_id, b.quantity, i.type as ingredient_type
    FROM product_bom b
    JOIN ingredients i ON b.ingredient_id = i.id
    WHERE b.product_id = ?
    ''', (c["product_id"],))
    bom_rows = cur.fetchall()
    print(f"    BOM rows: {len(bom_rows)}")
    for bom in bom_rows:
        if bom["ingredient_type"] == 'SERVICE':
            continue
        total_consumed = bom["quantity"] * line_qty
        cur.execute('''
        INSERT INTO inventory (warehouse_id, ingredient_id, quantity, updated_at)
        VALUES (?, ?, ?, CURRENT_TIMESTAMP)
        ON CONFLICT(warehouse_id, ingredient_id) DO UPDATE SET
            quantity = quantity - ?, updated_at = CURRENT_TIMESTAMP
        ''', (warehouse_id, bom["ingredient_id"], -total_consumed, total_consumed))
        print(f"    inventory OK for ingredient {bom['ingredient_id']}")
        cur.execute("SELECT quantity FROM inventory WHERE warehouse_id = ? AND ingredient_id = ?", (warehouse_id, bom["ingredient_id"]))
        bal_row = cur.fetchone()
        balance_after = bal_row["quantity"] if bal_row else 0
        cur.execute('''
        INSERT INTO inventory_logs (ingredient_id, warehouse_id, change_type, quantity, balance_after, order_id, order_code, note)
        VALUES (?, ?, 'SALE', ?, ?, ?, ?, ?)
        ''', (bom["ingredient_id"], warehouse_id, -total_consumed, balance_after, order_id, code, f"Combo {combo['name']} - {c['name']}"))
        print(f"    inventory_logs OK for ingredient {bom['ingredient_id']}")

print("About to commit...")
try:
    conn.commit()
    print("Commit OK!")
except Exception as e:
    print(f"Commit ERROR: {type(e).__name__}: {e}")
    conn.rollback()

conn.close()