"""Async connection-pool lifecycle and the per-request DB dependency.

A single ``AsyncConnectionPool`` is shared process-wide and opened/closed with the
FastAPI lifespan. ``get_db`` hands out a pooled connection per request; the
``async with`` ensures it is returned (and rolled back if not committed).
"""
from psycopg_pool import AsyncConnectionPool
from psycopg.rows import dict_row

from .config import settings

# Populated in the FastAPI lifespan (see app.main). Kept at module level so the
# dependency can reach the live pool without a global import cycle.
pool: AsyncConnectionPool | None = None


def create_pool() -> AsyncConnectionPool:
    return AsyncConnectionPool(
        settings.database_url,
        kwargs={"row_factory": dict_row},
        open=False,
    )


async def get_db():
    assert pool is not None, "Connection pool is not initialised"
    async with pool.connection() as conn:
        yield conn
