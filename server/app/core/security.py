"""Password hashing (bcrypt) and stateless JWT helpers.

bcrypt is used directly rather than through passlib, which is unmaintained and
incompatible with modern bcrypt releases.
"""
from datetime import datetime, timedelta, timezone

import bcrypt
import jwt

from .config import settings


# bcrypt only hashes the first 72 bytes of a password; truncate explicitly so
# long inputs hash deterministically instead of raising on newer bcrypt releases.
def _pw_bytes(password: str) -> bytes:
    return password.encode("utf-8")[:72]


def verify_password(plain_password: str, hashed_password: str) -> bool:
    return bcrypt.checkpw(_pw_bytes(plain_password), hashed_password.encode("utf-8"))


def get_password_hash(password: str) -> str:
    return bcrypt.hashpw(_pw_bytes(password), bcrypt.gensalt()).decode("utf-8")


def create_access_token(data: dict) -> str:
    to_encode = data.copy()
    expire = datetime.now(timezone.utc) + timedelta(minutes=settings.access_token_expire_minutes)
    to_encode.update({"exp": expire})
    return jwt.encode(to_encode, settings.jwt_secret, algorithm=settings.jwt_algorithm)


def decode_access_token(token: str) -> dict | None:
    try:
        return jwt.decode(token, settings.jwt_secret, algorithms=[settings.jwt_algorithm])
    except jwt.PyJWTError:
        return None
