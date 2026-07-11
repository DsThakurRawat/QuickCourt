from fastapi import APIRouter, Depends, HTTPException, Response
import psycopg

from ..core.config import settings
from ..core.database import get_db
from ..core.security import create_access_token, get_password_hash, verify_password
from ..dependencies import CurrentUser, get_current_user
from ..schemas import LoginRequest, UserCreate, UserOut

router = APIRouter(prefix="/auth", tags=["auth"])


def set_auth_cookie(response: Response, token: str) -> None:
    response.set_cookie(
        key="access_token",
        value=token,
        httponly=True,
        max_age=settings.access_token_expire_minutes * 60,
        secure=settings.cookie_secure,
        samesite=settings.cookie_samesite,
    )


@router.post("/signup", response_model=UserOut)
async def signup(user_in: UserCreate, response: Response, conn=Depends(get_db)):
    hashed_pw = get_password_hash(user_in.password)
    async with conn.cursor() as cur:
        try:
            await cur.execute(
                "INSERT INTO users (email, password_hash, role) VALUES (%s, %s, %s) "
                "RETURNING id, email, role, is_banned",
                (user_in.email, hashed_pw, user_in.role),
            )
            user = await cur.fetchone()
            await conn.commit()
        except psycopg.errors.UniqueViolation:
            raise HTTPException(400, "Email already registered")

    token = create_access_token({"sub": str(user["id"]), "role": user["role"]})
    set_auth_cookie(response, token)
    user["id"] = str(user["id"])
    return user


@router.post("/login")
async def login(req: LoginRequest, response: Response, conn=Depends(get_db)):
    async with conn.cursor() as cur:
        await cur.execute(
            "SELECT id, email, password_hash, role, is_banned FROM users WHERE email = %s",
            (req.email,),
        )
        user = await cur.fetchone()

    if not user or not verify_password(req.password, user["password_hash"]):
        raise HTTPException(400, "Incorrect email or password")
    if user["is_banned"]:
        raise HTTPException(403, "Account is banned")

    token = create_access_token({"sub": str(user["id"]), "role": user["role"]})
    set_auth_cookie(response, token)
    return {"message": "Logged in successfully"}


@router.post("/logout")
async def logout(response: Response):
    response.delete_cookie(
        "access_token", secure=settings.cookie_secure, samesite=settings.cookie_samesite
    )
    return {"message": "Logged out successfully"}


@router.get("/me", response_model=UserOut)
async def get_me(user: CurrentUser = Depends(get_current_user)):
    return user
