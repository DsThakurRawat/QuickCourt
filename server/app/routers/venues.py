from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query

from ..core.database import get_db
from ..schemas import VenueOut

router = APIRouter(tags=["venues"])

# Aggregates courts and review ratings per venue. Reviews only exist for completed
# bookings, so joining reviews already implies a completed booking.
_VENUE_AGG = """
    SELECT v.id, v.owner_id, v.name, v.description, v.status,
           COUNT(DISTINCT c.id) AS court_count,
           COALESCE(AVG(r.rating), 0) AS average_rating
    FROM venues v
    LEFT JOIN courts c ON c.venue_id = v.id
    LEFT JOIN bookings b ON b.court_id = c.id
    LEFT JOIN reviews r ON r.booking_id = b.id
"""


@router.get("/venues", response_model=List[VenueOut])
async def list_venues(
    sport: Optional[str] = None,
    max_price: Optional[float] = None,
    min_rating: Optional[float] = None,
    page: int = Query(1, ge=1),
    conn=Depends(get_db),
):
    limit, offset = 10, (page - 1) * 10
    query = _VENUE_AGG + " WHERE v.status = 'approved'"
    params: list = []

    if sport:
        query += " AND c.sport ILIKE %s"
        params.append(f"%{sport}%")
    if max_price is not None:
        query += " AND c.price_per_hour <= %s"
        params.append(max_price)

    query += " GROUP BY v.id"

    if min_rating is not None:
        query += " HAVING COALESCE(AVG(r.rating), 0) >= %s"
        params.append(min_rating)

    query += " ORDER BY v.created_at DESC LIMIT %s OFFSET %s"
    params.extend([limit, offset])

    async with conn.cursor() as cur:
        await cur.execute(query, params)
        venues = await cur.fetchall()

    for v in venues:
        v["id"] = str(v["id"])
        v["owner_id"] = str(v["owner_id"])
    return venues


@router.get("/venues/{id}")
async def get_venue(id: str, conn=Depends(get_db)):
    async with conn.cursor() as cur:
        await cur.execute(_VENUE_AGG + " WHERE v.id = %s AND v.status = 'approved' GROUP BY v.id", (id,))
        venue = await cur.fetchone()
        if not venue:
            raise HTTPException(404, "Venue not found")

        await cur.execute(
            "SELECT url, display_order FROM venue_photos WHERE venue_id = %s ORDER BY display_order",
            (id,),
        )
        photos = await cur.fetchall()

        await cur.execute(
            "SELECT id, name, sport, price_per_hour, open_time, close_time "
            "FROM courts WHERE venue_id = %s ORDER BY created_at",
            (id,),
        )
        courts = await cur.fetchall()

        await cur.execute(
            """
            SELECT r.id, r.rating, r.comment, r.created_at, u.email
            FROM reviews r
            JOIN bookings b ON r.booking_id = b.id
            JOIN users u ON r.user_id = u.id
            JOIN courts c ON b.court_id = c.id
            WHERE c.venue_id = %s
            ORDER BY r.created_at DESC
            """,
            (id,),
        )
        reviews = await cur.fetchall()

    venue["id"] = str(venue["id"])
    venue["owner_id"] = str(venue["owner_id"])
    for c in courts:
        c["id"] = str(c["id"])
    for r in reviews:
        r["id"] = str(r["id"])
    return {"venue": venue, "photos": photos, "courts": courts, "reviews": reviews}
