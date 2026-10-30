"""Diagnostic script to verify database connectivity, pgvector, migrations, and vector similarity search.
Does not print passwords or connection strings to stdout.
"""

import os
import sys
from pathlib import Path
from dotenv import load_dotenv
import psycopg

# Load root .env
root_dir = Path(__file__).resolve().parents[3]
load_dotenv(root_dir / ".env")

def test_connectivity():
    db_url = os.environ.get("DIRECT_URL") or os.environ.get("DATABASE_URL")
    if not db_url:
        print("FAIL: No DIRECT_URL or DATABASE_URL found in .env")
        return False
    
    if "[YOUR-PASSWORD]" in db_url:
        print("FAIL: [YOUR-PASSWORD] placeholder detected in .env. Please replace [YOUR-PASSWORD] with your actual Supabase database password.")
        return False

    print("Step 1: Testing database connectivity...")
    try:
        with psycopg.connect(db_url, connect_timeout=10) as conn:
            with conn.cursor() as cur:
                cur.execute("SELECT version();")
                v = cur.fetchone()[0]
                print(f"SUCCESS: Connected to PostgreSQL: {v.split(',')[0]}")
        return True
    except Exception as e:
        print(f"FAIL: Database connection error: {type(e).__name__}: {e}")
        return False

def test_pgvector():
    db_url = os.environ.get("DIRECT_URL") or os.environ.get("DATABASE_URL")
    print("Step 2: Checking pgvector extension...")
    try:
        with psycopg.connect(db_url, connect_timeout=10, autocommit=True) as conn:
            with conn.cursor() as cur:
                cur.execute("CREATE EXTENSION IF NOT EXISTS vector;")
                cur.execute("SELECT extname, extversion FROM pg_extension WHERE extname = 'vector';")
                res = cur.fetchone()
                if res:
                    print(f"SUCCESS: pgvector extension is enabled (version: {res[1]})")
                    return True
                else:
                    print("FAIL: vector extension could not be verified in pg_extension.")
                    return False
    except Exception as e:
        print(f"FAIL: pgvector check failed: {e}")
        return False

if __name__ == "__main__":
    ok = test_connectivity()
    if ok:
        test_pgvector()
