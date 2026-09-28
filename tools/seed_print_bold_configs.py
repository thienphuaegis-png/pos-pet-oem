import sqlite3
import json

DEFAULT_PRINT_BOLD_CONFIGS = {
    "pos_retail": True,       # 1. Hóa đơn bán lẻ POS (K80/K58)
    "pos_b2b": False,         # 2. Hóa đơn đại lý / Bán sỉ POS (A4/A5)
    "pos_draft": True,        # 3. Phiếu tạm tính báo giá (K80)
    "pos_topup": True,        # 4. Phiếu nạp tiền ví Spa (K80)
    "spa_intake": True,       # 5. Phiếu tiếp nhận Spa đón bé (K80)
    "spa_invoice": True,      # 6. Phiếu thanh toán Spa trả bé (K80)
    "cashbook_thu": True,     # 7. Phiếu thu tiền (K80)
    "cashbook_chi": True,     # 8. Phiếu chi tiền (K80)
    "shift_zreport": True,    # 9. Báo cáo kết ca Z-Report (K80)
    "stock_audit": False      # 10. Phiếu kiểm kê kho (A4)
}

conn = sqlite3.connect('data/pos.db')
cur = conn.cursor()
cur.execute('SELECT value FROM settings WHERE key="print_bold_configs"')
row = cur.fetchone()
if not row:
    cur.execute('INSERT INTO settings (key, value) VALUES (?, ?)', 
                ('print_bold_configs', json.dumps(DEFAULT_PRINT_BOLD_CONFIGS, ensure_ascii=False)))
    conn.commit()
    print('Initialized print_bold_configs in pos.db successfully!')
else:
    # Merge existing with defaults
    existing = json.loads(row[0])
    for k, v in DEFAULT_PRINT_BOLD_CONFIGS.items():
        if k not in existing:
            existing[k] = v
    cur.execute('UPDATE settings SET value = ? WHERE key = "print_bold_configs"',
                (json.dumps(existing, ensure_ascii=False),))
    conn.commit()
    print('Updated/merged print_bold_configs in pos.db successfully!')
conn.close()
