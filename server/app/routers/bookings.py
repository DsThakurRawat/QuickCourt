from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, Query
import psycopg

from ..core.database import get_db
from ..dependencies import CurrentUser, get_current_user
from ..schemas import BookingCreate, ReviewCreate
from ..services.bookings import settle_booking

router = APIRouter(tags=["bookings"])


@router.get("/courts/{id}/availability")
async def get_court_availability(id: str, date_str: str, conn=Depends(get_db)):
    """Open 1-hour slots for a court on a date, derived from operating hours in SQL.

    ``generate_series`` builds the day's slots; a LEFT JOIN against non-cancelled
    bookings/blocks removes taken ones, and past slots are filtered out."""
    async with conn.cursor() as cur:
        await cur.execute("SELECT open_time, close_time, price_per_hour FROM courts WHERE id = %s", (id,))
        court = await cur.fetchone()
        if not court:
            raise HTTPException(404, "Court not found")

        await cur.execute(
            """
            WITH slots AS (
                SELECT generate_series(
                    (%s::date + open_time)::timestamp,
                    (%s::date + close_time - interval '1 hour')::timestamp,
                    '1 hour'::interval
                ) AS slot_start
                FROM courts WHERE id = %s
            )
            SELECT s.slot_start
            FROM slots s
            LEFT JOIN bookings b
                   ON b.court_id = %s
                  AND b.status != 'cancelled'
                  AND tstzrange(
                          s.slot_start AT TIME ZONE 'UTC',
                          (s.slot_start + interval '1 hour') AT TIME ZONE 'UTC', '[)'
                      ) && b.time_range
            WHERE b.id IS NULL
              AND (s.slot_start AT TIME ZONE 'UTC') > now()
            ORDER BY s.slot_start
            """,
            (date_str, date_str, id, id),
        )
        slots = await cur.fetchall()

    return {
        "court_id": id,
        "date": date_str,
        "price_per_hour": court["price_per_hour"],
        "available_slots": [s["slot_start"] for s in slots],
    }


@router.post("/bookings")
async def create_booking(booking: BookingCreate, user: CurrentUser = Depends(get_current_user), conn=Depends(get_db)):
    if booking.start_time <= datetime.now(timezone.utc):
        raise HTTPException(400, "Cannot book a slot in the past")

    async with conn.cursor() as cur:
        await cur.execute("SELECT price_per_hour FROM courts WHERE id = %s", (booking.court_id,))
        court = await cur.fetchone()
        if not court:
            raise HTTPException(404, "Court not found")

        try:
            await cur.execute(
                """
                INSERT INTO bookings (court_id, user_id, type, time_range, status, price_snapshot)
                VALUES (%s, %s, 'booking', tstzrange(%s, %s, '[)'), 'confirmed', %s)
                RETURNING id
                """,
                (booking.court_id, user["id"], booking.start_time, booking.end_time, court["price_per_hour"]),
            )
            new_booking = await cur.fetchone()
            await conn.commit()
        except psycopg.errors.ExclusionViolation:
            raise HTTPException(409, "Slot is already booked")

    return {"message": "Booking created", "booking_id": str(new_booking["id"])}


@router.get("/me/bookings")
async def my_bookings(
    scope: str = Query("upcoming", pattern="^(upcoming|past)$"),
    user: CurrentUser = Depends(get_current_user),
    conn=Depends(get_db),
):
    # Uses the booking_details view so status reflects effective completion (no write-on-read).
    query = """
        SELECT b.id, lower(b.time_range) AS start_time, upper(b.time_range) AS end_time,
               b.effective_status AS status, b.price_snapshot,
               c.name AS court_name, c.sport, v.name AS venue_name
        FROM booking_details b
        JOIN courts c ON b.court_id = c.id
        JOIN venues v ON c.venue_id = v.id
        WHERE b.user_id = %s AND b.type = 'booking'
    """
    query += (
        " AND lower(b.time_range) >= now() ORDER BY lower(b.time_range) ASC"
        if scope == "upcoming"
        else " AND lower(b.time_range) < now() ORDER BY lower(b.time_range) DESC"
    )

    async with conn.cursor() as cur:
        await cur.execute(query, (user["id"],))
        bookings = await cur.fetchall()

    for b in bookings:
        b["id"] = str(b["id"])
    return bookings


@router.patch("/bookings/{id}/cancel")
async def cancel_booking(id: str, user: CurrentUser = Depends(get_current_user), conn=Depends(get_db)):
    async with conn.cursor() as cur:
        await cur.execute("SELECT user_id, status, time_range FROM bookings WHERE id = %s", (id,))
        booking = await cur.fetchone()

        if not booking:
            raise HTTPException(404, "Booking not found")
        if str(booking["user_id"]) != user["id"]:
            raise HTTPException(403, "Not authorized to cancel this booking")
        if booking["status"] != "confirmed":
            raise HTTPException(400, "Only confirmed bookings can be cancelled")
        if booking["time_range"].lower < datetime.now(timezone.utc):
            raise HTTPException(400, "Cannot cancel a past booking")

        await cur.execute("UPDATE bookings SET status = 'cancelled' WHERE id = %s", (id,))
        await conn.commit()

    return {"message": "Booking cancelled"}


@router.post("/bookings/{id}/review")
async def create_review(id: str, review: ReviewCreate, user: CurrentUser = Depends(get_current_user), conn=Depends(get_db)):
    async with conn.cursor() as cur:
        # The reviews composite FK requires the booking row to physically be 'completed',
        # so settle this one booking if its time has passed.
        await settle_booking(cur, id)

        await cur.execute("SELECT user_id, status FROM bookings WHERE id = %s", (id,))
        booking = await cur.fetchone()
        if not booking:
            raise HTTPException(404, "Booking not found")
        if str(booking["user_id"]) != user["id"]:
            raise HTTPException(403, "Not authorized to review this booking")
        if booking["status"] != "completed":
            raise HTTPException(400, "Booking must be completed to leave a review")

        try:
            await cur.execute(
                """
                INSERT INTO reviews (booking_id, booking_status, user_id, rating, comment)
                VALUES (%s, 'completed', %s, %s, %s)
                """,
                (id, user["id"], review.rating, review.comment),
            )
            await conn.commit()
        except (psycopg.errors.ForeignKeyViolation, psycopg.errors.CheckViolation):
            raise HTTPException(400, "Booking must be completed to leave a review")
        except psycopg.errors.UniqueViolation:
            raise HTTPException(400, "Review already exists for this booking")

    return {"message": "Review submitted"}
