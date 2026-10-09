"""All FastAPI routes live under /api/v1 (Ticket 12 D3)."""
from fastapi import APIRouter

from app.api.v1 import auth

api_router = APIRouter(prefix="/api/v1")
api_router.include_router(auth.router)
