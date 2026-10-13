"""All FastAPI routes live under /api/v1 (Ticket 12 D3).

Guards are attached to routers, so a new endpoint can't skip them (Ticket 13):
- every /api/v1 route: get_current_user (valid Clerk token → the user);
- org data routers (admin, documents, teams, tasks, chat, dashboard):
  get_org_context (active org, set up, user is a member). Add it to each new one.
/auth/* and /orgs/provision only need the user: they run before an org is picked or set up.
FastAPI runs each dependency once per request, so routes that also ask for it pay nothing extra.
"""
from fastapi import APIRouter, Depends

from app.api.v1 import admin, auth, chat, dashboard, documents, orgs, tasks, teams
from app.core.deps import get_current_user

api_router = APIRouter(prefix="/api/v1", dependencies=[Depends(get_current_user)])
api_router.include_router(auth.router)
api_router.include_router(orgs.router)
api_router.include_router(admin.router)
api_router.include_router(documents.router)
api_router.include_router(teams.router)
api_router.include_router(tasks.router)
api_router.include_router(chat.router)
api_router.include_router(dashboard.router)
