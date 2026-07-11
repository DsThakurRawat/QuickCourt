"""Ordered, idempotent SQL migration runner.

Applies every ``migrations/NNNN_*.sql`` file that hasn't been applied yet, in
filename order, recording each in ``schema_migrations``. Safe to run repeatedly.
"""
import pathlib

import psycopg

from app.core.config import settings

MIGRATIONS_DIR = pathlib.Path(__file__).parent / "migrations"


def _migration_files() -> list[pathlib.Path]:
    return sorted(MIGRATIONS_DIR.glob("*.sql"))


def apply_all(conn: psycopg.Connection) -> list[str]:
    """Apply pending migrations on an open connection. Returns versions applied."""
    with conn.cursor() as cur:
        cur.execute(
            "CREATE TABLE IF NOT EXISTS schema_migrations ("
            "  version TEXT PRIMARY KEY,"
            "  applied_at TIMESTAMPTZ NOT NULL DEFAULT now())"
        )
        cur.execute("SELECT version FROM schema_migrations")
        applied = {row[0] for row in cur.fetchall()}

    newly_applied = []
    for path in _migration_files():
        version = path.stem
        if version in applied:
            continue
        with conn.cursor() as cur:
            cur.execute(path.read_text())
            cur.execute("INSERT INTO schema_migrations (version) VALUES (%s)", (version,))
        newly_applied.append(version)
        print(f"  applied {version}")
    return newly_applied


def run_migrations() -> None:
    print("Running migrations...")
    with psycopg.connect(settings.database_url) as conn:
        applied = apply_all(conn)
        conn.commit()
    print("Migrations complete." if applied else "Already up to date.")


if __name__ == "__main__":
    run_migrations()
