"""
app/api/v1/feedback.py — Routes for the /feedback page (Ticket 12 D54)

Give strikes, give commendations and review appeals outside chat. The router
requires an org (get_org_context); the rules live in app/services/ and are the
same functions the chat agent uses.
"""
import uuid

from fastapi import APIRouter, Depends, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.deps import get_org_context, get_scope
from app.core.errors import error_responses
from app.schemas.commendations import CommendationResponse, CreateCommendationRequest
from app.schemas.feedback import FeedbackOptionsResponse, GivenFeedbackResponse
from app.schemas.strikes import (
    AppealResponse,
    AppealStrikeRequest,
    CreateStrikeRequest,
    ReviewAppealRequest,
    StrikePreviewResponse,
    StrikeResponse,
)
from app.scope.resolver import AccessScope
from app.services import commendations, feedback, strikes

router = APIRouter(prefix="/feedback", tags=["feedback"], dependencies=[Depends(get_org_context)])


@router.get(
    "/options",
    response_model=FeedbackOptionsResponse,
    responses=error_responses(400, 401, 409, 503),
)
async def get_options(
    scope: AccessScope = Depends(get_scope),
    db: AsyncSession = Depends(get_db),
) -> FeedbackOptionsResponse:
    """The tabs you get on /feedback, and per team who you may strike or commend (the Give form's pickers)."""
    return await feedback.feedback_options(db, scope)


@router.post(
    "/strikes/check",
    response_model=StrikePreviewResponse,
    responses=error_responses(400, 401, 403, 404, 409, 503),
)
async def check_strike(
    body: CreateStrikeRequest,
    scope: AccessScope = Depends(get_scope),
    db: AsyncSession = Depends(get_db),
) -> StrikePreviewResponse:
    """
    The preview before Confirm: every rule of the real save, their active strike
    count, and the policy check against the documents you can see (D46, a
    warning only). Nothing is saved.
    """
    return await strikes.preview_strike(db, scope, body)


@router.post(
    "/strikes",
    response_model=StrikeResponse,
    status_code=status.HTTP_201_CREATED,
    responses=error_responses(400, 401, 403, 404, 409, 503),
)
async def create_strike(
    body: CreateStrikeRequest,
    scope: AccessScope = Depends(get_scope),
    db: AsyncSession = Depends(get_db),
) -> StrikeResponse:
    """
    Save a strike after Confirm. Rules are checked again; the policy result of
    your preview (same person, team and reason, last 10 minutes) is kept with it.
    """
    return await strikes.save_strike(db, scope, body)


@router.post(
    "/commendations",
    response_model=CommendationResponse,
    status_code=status.HTTP_201_CREATED,
    responses=error_responses(400, 401, 403, 404, 409, 503),
)
async def create_commendation(
    body: CreateCommendationRequest,
    scope: AccessScope = Depends(get_scope),
    db: AsyncSession = Depends(get_db),
) -> CommendationResponse:
    """Commend someone ranked below you in that team (D5: rank only, no permission)."""
    return await commendations.give_commendation(db, scope, body)


@router.get(
    "/given",
    response_model=GivenFeedbackResponse,
    responses=error_responses(400, 401, 409, 503),
)
async def list_given(
    scope: AccessScope = Depends(get_scope),
    db: AsyncSession = Depends(get_db),
) -> GivenFeedbackResponse:
    """Strikes (every status) and commendations you gave, newest first."""
    return GivenFeedbackResponse(
        strikes=await strikes.list_given_strikes(db, scope),
        commendations=await commendations.list_given_commendations(db, scope),
    )


@router.get(
    "/appeals",
    response_model=list[AppealResponse],
    responses=error_responses(400, 401, 409, 503),
)
async def list_appeals(
    scope: AccessScope = Depends(get_scope),
    db: AsyncSession = Depends(get_db),
) -> list[AppealResponse]:
    """
    Appeals waiting for your decision, oldest first: review_strike for that team,
    and you neither gave nor received the strike (D6, D55).
    """
    return await strikes.list_reviewable_appeals(db, scope)


@router.post(
    "/appeals/{strike_id}/decision",
    response_model=StrikeResponse,
    responses=error_responses(400, 401, 403, 404, 409, 503),
)
async def decide_appeal(
    strike_id: uuid.UUID,
    body: ReviewAppealRequest,
    scope: AccessScope = Depends(get_scope),
    db: AsyncSession = Depends(get_db),
) -> StrikeResponse:
    """Uphold (the strike stays) or dismiss (it stops counting) an appeal."""
    return await strikes.review_appeal(db, scope, strike_id, body)


@router.post(
    "/strikes/{strike_id}/appeal",
    response_model=StrikeResponse,
    responses=error_responses(400, 401, 404, 409, 503),
)
async def appeal(
    strike_id: uuid.UUID,
    body: AppealStrikeRequest,
    scope: AccessScope = Depends(get_scope),
    db: AsyncSession = Depends(get_db),
) -> StrikeResponse:
    """Appeal a strike you received, once, with a note (the dashboard's Appeal button)."""
    return await strikes.appeal_strike(db, scope, strike_id, body)
