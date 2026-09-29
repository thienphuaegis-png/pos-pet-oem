import sqlite3
import psycopg2
import sys

SQLITE_PATH = "data/pos.db"
SUPABASE_URL = "postgresql://postgres.ifhlvbplslznumfpeojy:Sdt0388408876!@aws-0-ap-northeast-1.pooler.supabase.com:5432/postgres"

def map_type(sqlite_type, col_name, is_pk):
    st = sqlite_type.upper().strip()
    if is_pk and col_name == 'id':
        return 'BIGSERIAL PRIMARY KEY'
    if is_pk and ('INT' in st or st == ''):
        return 'BIGINT'
    if 'INT' in st:
        return 'BIGINT'
    if 'REAL' in st or 'FLOAT' in st or 'DOUB' in st:
        return 'DOUBLE PRECISION'
    if 'NUMERIC' in st or 'DECIMAL' in st:
        return 'NUMERIC'
    if 'BLOB' in st:
        return 'BYTEA'
    if 'DATE' in st or 'TIME' in st:
        return 'TIMESTAMP'
    if 'BOOL' in st:
        return 'BOOLEAN'
    return 'TEXT'

def run():
    print("Connecting to SQLite...")
    s_conn = sqlite3.connect(SQLITE_PATH)
    s_cur = s_conn.cursor()

    print("Connecting to Supabase...")
    p_conn = psycopg2.connect(SUPABASE_URL, connect_timeout=15)
    p_cur = p_conn.cursor()

    s_cur.execute("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name")
    tables = [r[0] for r in s_cur.fetchall()]

    print(f"Creating and migrating {len(tables)} tables...")
    for table in tables:
        s_cur.execute(f'PRAGMA table_info("{table}")')
        cols = s_cur.fetchall()
        pk_cols = [c[1] for c in cols if c[5] > 0]
        single_pk = (len(pk_cols) == 1)

        col_defs = []
        for c in cols:
            cid, cname, ctype, notnull, dflt, pk = c
            is_pk = (pk > 0 and single_pk)
            pg_type = map_type(ctype, cname, is_pk)
            dflt_clause = ''
            if dflt is not None and not is_pk:
                d = str(dflt).strip()
                if 'CURRENT_TIMESTAMP' in d.upper():
                    dflt_clause = ' DEFAULT CURRENT_TIMESTAMP'
                elif d.startswith("'") or d.isdigit() or d in ('0', '1'):
                    dflt_clause = f' DEFAULT {d}'
            nn_clause = ' NOT NULL' if notnull and not is_pk else ''
            if is_pk and cname != 'id':
                col_defs.append(f'  "{cname}" {pg_type}{nn_clause}{dflt_clause} PRIMARY KEY')
            else:
                col_defs.append(f'  "{cname}" {pg_type}{nn_clause}{dflt_clause}')

        if len(pk_cols) > 1:
            pk_names = ', '.join([f'"{p}"' for p in pk_cols])
            col_defs.append(f'  PRIMARY KEY ({pk_names})')

        create_sql = f'CREATE TABLE IF NOT EXISTS "{table}" (\n' + ',\n'.join(col_defs) + '\n);'
        p_cur.execute(create_sql)
        p_conn.commit()

        # Copy rows
        s_cur.execute(f'SELECT * FROM "{table}"')
        rows = s_cur.fetchall()
        if rows:
            col_names = [f'"{c[1]}"' for c in cols]
            placeholders = ", ".join(["%s"] * len(col_names))
            insert_sql = f'INSERT INTO "{table}" ({", ".join(col_names)}) VALUES ({placeholders}) ON CONFLICT DO NOTHING'

            batch_size = 200
            for i in range(0, len(rows), batch_size):
                batch = rows[i:i + batch_size]
                p_cur.executemany(insert_sql, batch)
            p_conn.commit()

        # Reset sequence for PK if table has serial id
        if single_pk and pk_cols[0] == 'id':
            try:
                p_cur.execute(f"""
                    SELECT setval(pg_get_serial_sequence('"{table}"', 'id'), COALESCE(MAX("id"), 1)) FROM "{table}";
                """)
                p_conn.commit()
            except Exception as e:
                p_conn.rollback()

        print(f"  + {table}: created & populated {len(rows)} rows")

    print("\nSUCCESS: All tables created and data migrated to Supabase!")
    p_cur.close()
    p_conn.close()
    s_conn.close()

if __name__ == "__main__":
    run()
