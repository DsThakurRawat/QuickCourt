"""Request and response models.

Centralising these keeps validation rules in one place and lets routers stay thin.
Validators enforce invariants the database can't easily express (e.g. end > start).
"""
from datetime import datetime
from typing import Literal, Optional

from pydantic import BaseModel, EmailStr, Field, model_validator


# --- Auth ---
class UserCreate(BaseModel):
    email: EmailStr
    password: str = Field(min_length=6, max_length=128)
    # Users may self-register as a regular user or a venue owner; 'admin' is not allowed.
    role: Literal["user", "owner"] = "user"


class LoginRequest(BaseModel):
    email: EmailStr
    password: str


class UserOut(BaseModel):
    id: str
    email: str
    role: str
    is_banned: bool


# --- Venues ---
class VenueCreate(BaseModel):
    name: str = Field(min_length=1, max_length=200)
    description: Optional[str] = Field(default=None, max_length=2000)


class VenueOut(BaseModel):
    id: str
    owner_id: str
    name: str
    description: Optional[str]
    status: str
    court_count: Optional[int] = None
    average_rating: Optional[float] = None


class StatusUpdate(BaseModel):
    status: Literal["approved", "rejected"]
    comment: Optional[str] = Field(default=None, max_length=1000)


# --- Courts ---
class CourtCreate(BaseModel):
    name: str = Field(min_length=1, max_length=200)
    sport: str = Field(min_length=1, max_length=100)
    price_per_hour: float = Field(gt=0, le=100000)
    open_time: str  # 'HH:MM'
    close_time: str

    @model_validator(mode="after")
    def _hours_valid(self):
        if self.open_time >= self.close_time:
            raise ValueError("open_time must be before close_time")
        return self


# --- Bookings ---
class _TimeSpan(BaseModel):
    start_time: datetime
    end_time: datetime

    @model_validator(mode="after")
    def _span_valid(self):
        if self.end_time <= self.start_time:
            raise ValueError("end_time must be after start_time")
        return self


class BookingCreate(_TimeSpan):
    court_id: str


class BlockCreate(_TimeSpan):
    pass


class ReviewCreate(BaseModel):
    rating: int = Field(ge=1, le=5)
    comment: Optional[str] = Field(default=None, max_length=2000)
