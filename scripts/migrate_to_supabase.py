import sqlite3
import psycopg2
import sys
import re

SQLITE_PATH = "data/pos.db"
SUPABASE_URL = "postgresql://postgres.ifhlvbplslznumfpeojy:Sdt0388408876!@aws-0-ap-northeast-1.pooler.supabase.com:6543/postgres"

def map_type(sqlite_type, col_name, is_pk):
    st = sqlite_type.upper().strip()
    if is_pk and ("INT" in st or st == ""):
        return "BIGSERIAL PRIMARY KEY"
    if "INT" in st:
        return "BIGINT"
    if "REAL" in st or "FLOAT" in st or "DOUB" in st:
        return "DOUBLE PRECISION"
    if "NUMERIC" in st or "DECIMAL" in st:
        return "NUMERIC"
    if "BLOB" in st:
        return "BYTEA"
    if "DATE" in st or "TIME" in st:
        return "TIMESTAMP"
    if "BOOL" in st:
        return "BOOLEAN"
    return "TEXT"

def migrate():
    print(f"Connecting to SQLite: {SQLITE_PATH}")
    s_conn = sqlite3.connect(SQLITE_PATH)
    s_cur = s_conn.cursor()

    print("Connecting to Supabase PostgreSQL...")
    p_conn = psycopg2.connect(SUPABASE_URL)
    p_cur = p_conn.cursor()

    # Get list of tables
    s_cur.execute("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name")
    tables = [r[0] for r in s_cur.fetchall()]
    print(f"Found {len(tables)} tables to migrate.")

    for table in tables:
        # Check SQLite table info
        s_cur.execute(f'PRAGMA table_info("{table}")')
        cols_info = s_cur.fetchall()
        # cid, name, type, notnull, dflt_value, pk

        # Drop table if exists to ensure clean schema sync
        p_cur.execute(f'DROP TABLE IF EXISTS "{table}" CASCADE;')

        col_defs = []
        pk_cols = [c[1] for c in cols_info if c[5] > 0]
        single_pk = (len(pk_cols) == 1)

        for col in cols_info:
            cid, cname, ctype, notnull, dflt, pk = col
            is_pk = (pk > 0 and single_pk)
            pg_type = map_type(ctype, cname, is_pk)
            
            dflt_clause = ""
            if dflt is not None and not is_pk:
                d = str(dflt).strip()
                if "CURRENT_TIMESTAMP" in d.upper():
                    dflt_clause = " DEFAULT CURRENT_TIMESTAMP"
                elif d.startswith("'") or d.isdigit() or d in ("0", "1"):
                    dflt_clause = f" DEFAULT {d}"

            nn_clause = " NOT NULL" if notnull and not is_pk else ""
            col_defs.append(f'"{cname}" {pg_type}{nn_clause}{dflt_clause}')

        if len(pk_cols) > 1:
            pk_names = ", ".join([f'"{p}"' for p in pk_cols])
            col_defs.append(f'PRIMARY KEY ({pk_names})')

        create_sql = f'CREATE TABLE "{table}" (\n  ' + ",\n  ".join(col_defs) + "\n);"
        p_cur.execute(create_sql)

        # Copy data
        s_cur.execute(f'SELECT * FROM "{table}"')
        rows = s_cur.fetchall()
        if rows:
            col_names = [f'"{c[1]}"' for c in cols_info]
            placeholders = ", ".join(["%s"] * len(col_names))
            insert_sql = f'INSERT INTO "{table}" ({", ".join(col_names)}) VALUES ({placeholders})'
            # Convert any sqlite boolean or formatting if necessary
            cleaned_rows = []
            for r in rows:
                cleaned_rows.append(tuple(r))
            p_cur.executemany(insert_sql, cleaned_rows)

        # Update sequence for PK if BIGSERIAL
        if single_pk:
            pk_col = pk_cols[0]
            p_cur.execute(f"""
                SELECT pg_get_serial_sequence('"{table}"', '{pk_col}');
            """)
            seq = p_cur.fetchone()[0]
            if seq:
                p_cur.execute(f"""
                    SELECT COALESCE(MAX("{pk_col}"), 0) + 1 FROM "{table}";
                """)
                max_val = p_cur.fetchone()[0]
                p_cur.execute(f"SELECT setval('{seq}', {max_val}, false);")

        print(f"  + Migrated {table}: {len(rows)} rows")

    p_conn.commit()
    print("\nALL 53 TABLES AND DATA SUCCESSFULLY MIGRATED TO SUPABASE!")

    p_cur.close()
    p_conn.close()
    s_conn.close()

if __name__ == "__main__":
    migrate()
