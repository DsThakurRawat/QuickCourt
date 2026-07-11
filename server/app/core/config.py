"""Application configuration, loaded from environment / .env with safe defaults."""
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    # --- Database ---
    database_url: str = "postgresql://postgres:password@localhost:5432/quickcourt"

    # --- Auth / JWT ---
    # NOTE: override jwt_secret in production via the JWT_SECRET env var.
    jwt_secret: str = "super_secret_key_change_me"
    jwt_algorithm: str = "HS256"
    access_token_expire_minutes: int = 60 * 24 * 7  # 1 week

    # --- CORS + cookies ---
    # For a cross-site production deploy set cookie_secure=true and cookie_samesite="none".
    frontend_origin: str = "http://localhost:5173"
    cookie_secure: bool = False
    cookie_samesite: str = "lax"

    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8")


settings = Settings()
