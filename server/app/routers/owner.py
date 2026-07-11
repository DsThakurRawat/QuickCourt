from typing import List

from fastapi import APIRouter, Depends, HTTPException
import psycopg

from ..core.database import get_db
from ..dependencies import CurrentUser, get_owner
from ..schemas import BlockCreate, CourtCreate, VenueCreate, VenueOut

router = APIRouter(tags=["owner"])


async def _assert_owns_venue(cur, venue_id: str, user_id: str) -> None:
    await cur.execute("SELECT owner_id FROM venues WHERE id = %s", (venue_id,))
    venue = await cur.fetchone()
    if not venue or str(venue["owner_id"]) != user_id:
        raise HTTPException(403, "Not authorized")


@router.post("/venues", response_model=VenueOut)
async def create_venue(venue: VenueCreate, user: CurrentUser = Depends(get_owner), conn=Depends(get_db)):
    async with conn.cursor() as cur:
        await cur.execute(
            """
            INSERT INTO venues (owner_id, name, description, status)
            VALUES (%s, %s, %s, 'pending')
            RETURNING id, owner_id, name, description, status
            """,
            (user["id"], venue.name, venue.description),
        )
        new_venue = await cur.fetchone()
        await conn.commit()
    new_venue["id"] = str(new_venue["id"])
    new_venue["owner_id"] = str(new_venue["owner_id"])
    return new_venue


@router.get("/me/venues", response_model=List[VenueOut])
async def my_venues(user: CurrentUser = Depends(get_owner), conn=Depends(get_db)):
    async with conn.cursor() as cur:
        await cur.execute(
            "SELECT id, owner_id, name, description, status FROM venues "
            "WHERE owner_id = %s ORDER BY created_at DESC",
            (user["id"],),
        )
        venues = await cur.fetchall()
    for v in venues:
        v["id"] = str(v["id"])
        v["owner_id"] = str(v["owner_id"])
    return venues


@router.get("/me/venues/{id}/courts")
async def my_venue_courts(id: str, user: CurrentUser = Depends(get_owner), conn=Depends(get_db)):
    async with conn.cursor() as cur:
        await _assert_owns_venue(cur, id, user["id"])
        await cur.execute(
            "SELECT id, name, sport, price_per_hour, open_time, close_time "
            "FROM courts WHERE venue_id = %s ORDER BY created_at",
            (id,),
        )
        courts = await cur.fetchall()
    for c in courts:
        c["id"] = str(c["id"])
    return courts


@router.post("/venues/{id}/courts")
async def create_court(id: str, court: CourtCreate, user: CurrentUser = Depends(get_owner), conn=Depends(get_db)):
    async with conn.cursor() as cur:
        await _assert_owns_venue(cur, id, user["id"])
        await cur.execute(
            """
            INSERT INTO courts (venue_id, name, sport, price_per_hour, open_time, close_time)
            VALUES (%s, %s, %s, %s, %s, %s) RETURNING id
            """,
            (id, court.name, court.sport, court.price_per_hour, court.open_time, court.close_time),
        )
        new_court = await cur.fetchone()
        await conn.commit()
    return {"message": "Court created", "court_id": str(new_court["id"])}


@router.post("/courts/{id}/blocks")
async def create_block(id: str, block: BlockCreate, user: CurrentUser = Depends(get_owner), conn=Depends(get_db)):
    async with conn.cursor() as cur:
        await cur.execute(
            "SELECT v.owner_id FROM courts c JOIN venues v ON c.venue_id = v.id WHERE c.id = %s", (id,)
        )
        owner = await cur.fetchone()
        if not owner or str(owner["owner_id"]) != user["id"]:
            raise HTTPException(403, "Not authorized")

        try:
            await cur.execute(
                """
                INSERT INTO bookings (court_id, type, time_range)
                VALUES (%s, 'maintenance', tstzrange(%s, %s, '[)'))
                """,
                (id, block.start_time, block.end_time),
            )
            await conn.commit()
        except psycopg.errors.ExclusionViolation:
            raise HTTPException(409, "Block overlaps with an existing booking or block")
    return {"message": "Maintenance block created"}


@router.get("/me/dashboard")
async def dashboard(user: CurrentUser = Depends(get_owner), conn=Depends(get_db)):
    # Effective-completed earnings via the view — no write-on-read.
    async with conn.cursor() as cur:
        await cur.execute(
            """
            SELECT lower(b.time_range)::date AS date, SUM(b.price_snapshot) AS earnings
            FROM booking_details b
            JOIN courts c ON b.court_id = c.id
            JOIN venues v ON c.venue_id = v.id
            WHERE v.owner_id = %s AND b.effective_status = 'completed'
            GROUP BY date ORDER BY date DESC LIMIT 30
            """,
            (user["id"],),
        )
        earnings = await cur.fetchall()
    return {"earnings": earnings}
