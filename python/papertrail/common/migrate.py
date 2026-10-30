"""Database migration runner for PaperTrail."""

import os
import sys
from pathlib import Path
from dotenv import load_dotenv
import psycopg

# Load root and python .env
root_dir = Path(__file__).resolve().parents[3]
load_dotenv(root_dir / ".env")
load_dotenv(root_dir / "python" / ".env")

def get_database_url() -> str:
    # Prefer DIRECT_URL for migrations (bypasses transaction poolers), fallback to DATABASE_URL
    url = os.environ.get("DIRECT_URL") or os.environ.get("DATABASE_URL")
    if not url:
        print("ERROR: Neither DIRECT_URL nor DATABASE_URL environment variable is set.", file=sys.stderr)
        print("Please set your PostgreSQL connection string in .env", file=sys.stderr)
        sys.exit(1)
    return url

def run_migrations():
    db_url = get_database_url()
    migrations_dir = root_dir / "db" / "migrations"
    migration_files = sorted(migrations_dir.glob("*.sql"))

    if not migration_files:
        print(f"No migration files found in {migrations_dir}")
        return

    print(f"Connecting to database...")
    with psycopg.connect(db_url, autocommit=True) as conn:
        with conn.cursor() as cur:
            # Create migrations table if not exists
            cur.execute("""
                CREATE TABLE IF NOT EXISTS _migrations (
                    id SERIAL PRIMARY KEY,
                    filename TEXT NOT NULL UNIQUE,
                    applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
                );
            """)

            cur.execute("SELECT filename FROM _migrations;")
            applied = {row[0] for row in cur.fetchall()}

            for mf in migration_files:
                if mf.name in applied:
                    print(f"  [ALREADY APPLIED] {mf.name}")
                    continue

                print(f"  [APPLYING] {mf.name} ...")
                sql = mf.read_text(encoding="utf-8")
                cur.execute(sql)
                cur.execute("INSERT INTO _migrations (filename) VALUES (%s);", (mf.name,))
                print(f"  [SUCCESS] {mf.name}")

    print("All migrations applied successfully!")

if __name__ == "__main__":
    run_migrations()
