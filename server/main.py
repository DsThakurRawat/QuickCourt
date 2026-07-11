"""Entrypoint shim so ``uvicorn main:app`` continues to work.

The application lives in the modular ``app`` package (app/main.py).
"""
from app.main import app

__all__ = ["app"]
