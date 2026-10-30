"""Database access layer for PaperTrail ingestion and evaluation."""

from collections.abc import Generator
from contextlib import contextmanager

import psycopg

from papertrail.common.config import get_database_url


@contextmanager
def get_db_connection(autocommit: bool = False) -> Generator[psycopg.Connection, None, None]:
    """Provide a transactional database connection."""
    url = get_database_url()
    conn = psycopg.connect(url, autocommit=autocommit)
    try:
        yield conn
    finally:
        conn.close()
