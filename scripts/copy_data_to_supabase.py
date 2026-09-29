import sqlite3
import psycopg2
import sys

SQLITE_PATH = "data/pos.db"
SUPABASE_URL = "postgresql://postgres.ifhlvbplslznumfpeojy:Sdt0388408876!@aws-0-ap-northeast-1.pooler.supabase.com:5432/postgres"

def run_data_sync():
    print("Reading data from SQLite...")
    s_conn = sqlite3.connect(SQLITE_PATH)
    s_cur = s_conn.cursor()

    print("Connecting to Supabase...")
    p_conn = psycopg2.connect(SUPABASE_URL, connect_timeout=15)
    p_cur = p_conn.cursor()

    s_cur.execute("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name")
    tables = [r[0] for r in s_cur.fetchall()]

    for table in tables:
        s_cur.execute(f'PRAGMA table_info("{table}")')
        cols = s_cur.fetchall()
        col_names = [f'"{c[1]}"' for c in cols]
        
        s_cur.execute(f'SELECT * FROM "{table}"')
        rows = s_cur.fetchall()
        if not rows:
            print(f"  - {table}: 0 rows (skip)")
            continue

        placeholders = ", ".join(["%s"] * len(col_names))
        insert_sql = f'INSERT INTO "{table}" ({", ".join(col_names)}) VALUES ({placeholders}) ON CONFLICT DO NOTHING'

        batch_size = 100
        for i in range(0, len(rows), batch_size):
            batch = rows[i:i + batch_size]
            p_cur.executemany(insert_sql, batch)
        
        p_conn.commit()

        # Reset sequence for PK if table has serial id
        pk_cols = [c[1] for c in cols if c[5] > 0]
        if len(pk_cols) == 1 and pk_cols[0] == 'id':
            try:
                p_cur.execute(f"""
                    SELECT setval(pg_get_serial_sequence('"{table}"', 'id'), COALESCE(MAX("id"), 1)) FROM "{table}";
                """)
                p_conn.commit()
            except Exception as e:
                p_conn.rollback()

        print(f"  + {table}: inserted {len(rows)} rows")

    print("\nDATA MIGRATION COMPLETED SUCCESSFULLY!")
    p_cur.close()
    p_conn.close()
    s_conn.close()

if __name__ == "__main__":
    run_data_sync()
