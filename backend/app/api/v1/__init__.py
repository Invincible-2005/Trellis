"""All FastAPI routes live under /api/v1 (Ticket 12 D3)."""
from fastapi import APIRouter

from app.api.v1 import admin, auth, documents, orgs

api_router = APIRouter(prefix="/api/v1")
api_router.include_router(auth.router)
api_router.include_router(orgs.router)
api_router.include_router(admin.router)
api_router.include_router(documents.router)
