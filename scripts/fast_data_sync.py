import sqlite3
import psycopg2
from psycopg2.extras import execute_values
import sys

SQLITE_PATH = "data/pos.db"
SUPABASE_URL = "postgresql://postgres.ifhlvbplslznumfpeojy:Sdt0388408876!@aws-0-ap-northeast-1.pooler.supabase.com:5432/postgres"

def sync_data():
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
        col_names = [c[1] for c in cols]
        escaped_cols = [f'"{c}"' for c in col_names]

        s_cur.execute(f'SELECT * FROM "{table}"')
        rows = s_cur.fetchall()
        if not rows:
            print(f"  - {table}: 0 rows (skip)")
            continue

        insert_query = f'INSERT INTO "{table}" ({", ".join(escaped_cols)}) VALUES %s ON CONFLICT DO NOTHING'
        execute_values(p_cur, insert_query, rows, page_size=500)
        p_conn.commit()

        # Reset serial sequence if id exists
        pk_cols = [c[1] for c in cols if c[5] > 0]
        if len(pk_cols) == 1 and pk_cols[0] == 'id':
            try:
                p_cur.execute(f"""
                    SELECT setval(pg_get_serial_sequence('"{table}"', 'id'), COALESCE(MAX("id"), 1)) FROM "{table}";
                """)
                p_conn.commit()
            except Exception as e:
                p_conn.rollback()

        print(f"  + {table}: synced {len(rows)} rows")

    print("\nALL DATA SUCCESSFULLY SYNCED TO SUPABASE!")
    p_cur.close()
    p_conn.close()
    s_conn.close()

if __name__ == "__main__":
    sync_data()
