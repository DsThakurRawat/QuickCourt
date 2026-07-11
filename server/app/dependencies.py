"""Reusable FastAPI dependencies: DB session and role-based access control.

``get_current_user`` resolves the HttpOnly JWT cookie to a live user row and
rejects banned accounts. ``require_roles`` builds role-gated dependencies so
routers declare intent (``Depends(get_owner)``) instead of repeating checks.
"""
from fastapi import Depends, HTTPException, Request, status

from .core.database import get_db
from .core.security import decode_access_token

CurrentUser = dict


async def get_current_user(request: Request, conn=Depends(get_db)) -> CurrentUser:
    token = request.cookies.get("access_token")
    if not token:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Not authenticated")

    payload = decode_access_token(token)
    if not payload or not payload.get("sub"):
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Invalid token")

    async with conn.cursor() as cur:
        await cur.execute(
            "SELECT id, email, role, is_banned FROM users WHERE id = %s", (payload["sub"],)
        )
        user = await cur.fetchone()

    if not user:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "User not found")
    if user["is_banned"]:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "User is banned")

    user["id"] = str(user["id"])
    return user


def require_roles(*roles: str):
    async def _dep(user: CurrentUser = Depends(get_current_user)) -> CurrentUser:
        if user["role"] not in roles:
            raise HTTPException(status.HTTP_403_FORBIDDEN, f"Requires one of: {', '.join(roles)}")
        return user

    return _dep


get_owner = require_roles("owner", "admin")
get_admin = require_roles("admin")
