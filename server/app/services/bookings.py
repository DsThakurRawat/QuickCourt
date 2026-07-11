"""Booking domain logic shared across routers and the maintenance job.

Completion strategy
-------------------
A booking is *effectively* complete once its end time has passed. Read paths
(dashboard, stats, my-bookings) never mutate — they derive completion from the
``booking_details`` view (see migrations/0002), so GETs stay side-effect free and
scale. The real ``status = 'completed'`` transition is applied by
``settle_past_bookings`` in two places only:

  * ``settle_booking`` — for the single booking being reviewed, because the
    reviews composite FK requires the row to physically be 'completed'; and
  * the ``settle`` maintenance job (``python -m app.services.bookings``), meant to
    run periodically (cron / pg_cron) so the stored state eventually matches reality.
"""

SETTLE_SQL = """
    UPDATE bookings SET status = 'completed'
    WHERE type = 'booking' AND status = 'confirmed' AND upper(time_range) <= now()
"""


async def settle_past_bookings(cur) -> int:
    """Mark every past confirmed booking as completed. Returns rows affected.

    The caller owns the transaction (commit/rollback)."""
    await cur.execute(SETTLE_SQL)
    return cur.rowcount


async def settle_booking(cur, booking_id: str) -> None:
    """Settle just one booking (used before inserting its review)."""
    await cur.execute(
        SETTLE_SQL.replace("upper(time_range) <= now()", "upper(time_range) <= now() AND id = %s"),
        (booking_id,),
    )


def _run_settle_job() -> None:  # pragma: no cover - operational entrypoint
    import psycopg

    from ..core.config import settings

    with psycopg.connect(settings.database_url) as conn:
        with conn.cursor() as cur:
            cur.execute(SETTLE_SQL)
            affected = cur.rowcount
        conn.commit()
    print(f"Settled {affected} booking(s).")


if __name__ == "__main__":
    _run_settle_job()
