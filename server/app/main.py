"""FastAPI application factory: middleware, lifespan, routers, error handling."""
import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from .core import database
from .core.config import settings
from .routers import admin, auth, bookings, owner, venues

logger = logging.getLogger("quickcourt")


@asynccontextmanager
async def lifespan(app: FastAPI):
    database.pool = database.create_pool()
    await database.pool.open()
    yield
    await database.pool.close()


def create_app() -> FastAPI:
    app = FastAPI(title="QuickCourt", version="1.0.0", lifespan=lifespan)

    app.add_middleware(
        CORSMiddleware,
        allow_origins=[settings.frontend_origin],
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    for module in (auth, venues, bookings, owner, admin):
        app.include_router(module.router)

    @app.exception_handler(Exception)
    async def unhandled_error(request: Request, exc: Exception):
        # HTTPException / validation errors are handled by FastAPI's own handlers;
        # this only catches genuinely unexpected failures.
        logger.exception("Unhandled error on %s %s", request.method, request.url.path)
        return JSONResponse(status_code=500, content={"detail": "Internal Server Error"})

    @app.get("/health", tags=["meta"])
    async def health():
        return {"status": "ok"}

    return app


app = create_app()
