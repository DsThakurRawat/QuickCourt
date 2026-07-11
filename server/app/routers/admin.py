from typing import List

from fastapi import APIRouter, Depends, HTTPException

from ..core.database import get_db
from ..dependencies import CurrentUser, get_admin
from ..schemas import StatusUpdate, UserOut, VenueOut

router = APIRouter(prefix="/admin", tags=["admin"])


@router.get("/venues/pending", response_model=List[VenueOut])
async def pending_venues(user: CurrentUser = Depends(get_admin), conn=Depends(get_db)):
    async with conn.cursor() as cur:
        await cur.execute(
            "SELECT id, owner_id, name, description, status FROM venues "
            "WHERE status = 'pending' ORDER BY created_at ASC"
        )
        venues = await cur.fetchall()
    for v in venues:
        v["id"] = str(v["id"])
        v["owner_id"] = str(v["owner_id"])
    return venues


@router.patch("/venues/{id}/status")
async def update_venue_status(id: str, update: StatusUpdate, user: CurrentUser = Depends(get_admin), conn=Depends(get_db)):
    async with conn.cursor() as cur:
        await cur.execute(
            "UPDATE venues SET status = %s, admin_comment = %s WHERE id = %s RETURNING id",
            (update.status, update.comment, id),
        )
        if not await cur.fetchone():
            raise HTTPException(404, "Venue not found")
        await conn.commit()
    return {"message": f"Venue {update.status}"}


@router.get("/users", response_model=List[UserOut])
async def list_users(user: CurrentUser = Depends(get_admin), conn=Depends(get_db)):
    async with conn.cursor() as cur:
        await cur.execute("SELECT id, email, role, is_banned FROM users ORDER BY created_at DESC")
        users = await cur.fetchall()
    for u in users:
        u["id"] = str(u["id"])
    return users


@router.patch("/users/{id}/ban")
async def toggle_ban(id: str, user: CurrentUser = Depends(get_admin), conn=Depends(get_db)):
    async with conn.cursor() as cur:
        await cur.execute(
            "UPDATE users SET is_banned = NOT is_banned WHERE id = %s RETURNING is_banned", (id,)
        )
        res = await cur.fetchone()
        if not res:
            raise HTTPException(404, "User not found")
        await conn.commit()
    return {"message": f"User {'banned' if res['is_banned'] else 'unbanned'}"}


@router.get("/stats")
async def platform_stats(user: CurrentUser = Depends(get_admin), conn=Depends(get_db)):
    async with conn.cursor() as cur:
        await cur.execute(
            """
            SELECT
                (SELECT COUNT(*) FROM users) AS users,
                (SELECT COUNT(*) FROM booking_details WHERE effective_status = 'completed') AS completed_bookings,
                (SELECT COUNT(*) FROM venues WHERE status = 'approved') AS approved_venues
            """
        )
        row = await cur.fetchone()
    return {
        "users": row["users"],
        "completed_bookings": row["completed_bookings"],
        "approved_venues": row["approved_venues"],
    }
