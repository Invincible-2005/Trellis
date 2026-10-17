"""
app/services/strikes.py — Giving a strike (Ticket 12 D6, D30, D46)

Who may give one: someone with give_strike in that team (org role or team role,
can()) to a team member ranked below them there (can_give_in_team, the D30
yardstick). Nobody can strike themselves.

Used by the chat agent's give_strike action (check_give_strike() before the
Confirm card, give_strike() after the click, D22/D45) and by the /feedback page
(preview_strike() before its Confirm, save_strike() after, D54).

The policy check (D46, check_policy()) searches the policy documents the giver
can see and asks the AI whether the reason is covered. It only produces a
warning; its result is kept on the strike for appeal reviewers.

Appeals (D6, D55): the receiver appeals once (appeal_strike); anyone with
review_strike for the team except the giver and the receiver upholds or
dismisses it (review_appeal). The /feedback page lists what you gave and the
appeals you may decide; the dashboard lists your own strikes.

Counting (D6): confirmed and appealed strikes are active; dismissed ones aren't.
The 3rd active strike for a person in a team is saved with escalated = True.
"""
import logging
import uuid
from datetime import datetime
from typing import Any, Literal

from cachetools import TTLCache
from fastapi import status
from pydantic import BaseModel
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import aliased

from app.agent import prompts
from app.agent.tools import citation_tag
from app.core.database import async_session
from app.core.errors import api_error
from app.models.strike import Strike
from app.models.team import Team, TeamMember
from app.models.user import User
from app.schemas.chat import Citation, PolicyCheck
from app.schemas.strikes import (
    AppealResponse,
    AppealStrikeRequest,
    CreateStrikeRequest,
    ReviewAppealRequest,
    StrikePreviewResponse,
    StrikeResponse,
)
from app.scope.resolver import AccessScope
from app.services.documents import search_chunks, visible_chunks
from app.services.embeddings import EmbeddingError

logger = logging.getLogger(__name__)

ACTIVE_STATUSES = ("confirmed", "appealed")
ESCALATION_THRESHOLD = 3

POLICY_PASSAGES = 6
EXCERPT_CHARS = 300

VERDICT_LABEL = {
    "supported": "Policy supports this",
    "not_covered": "No policy found that covers this reason",
    "unchecked": "The policy check couldn't run",
}


# ── Policy check (D46) ────────────────────────────────────────────────────────

class _PolicyVerdict(BaseModel):
    verdict: Literal["supported", "not_covered"]
    explanation: str
    source_tags: list[str] = []


async def check_policy(scope: AccessScope, reason: str) -> dict[str, Any]:
    """
    D46: search the policy documents the giver can see for the reason, then one
    LLM call judges it. Only passages that were really retrieved can be shown
    (same idea as the citation check, D20). Never raises: a failure is "unchecked".

    Returns {"verdict", "explanation", "sources": [Citation dicts], "chunk_ids"}.
    """
    try:
        async with async_session() as db:
            hits = await search_chunks(db, scope, reason, k=POLICY_PASSAGES)
    except EmbeddingError:
        return {"verdict": "unchecked", "explanation": "Document search is unavailable right now.",
                "sources": [], "chunk_ids": []}
    if not hits:
        return {"verdict": "not_covered", "explanation": "None of the documents you can see mention this.",
                "sources": [], "chunk_ids": []}

    by_tag = {citation_tag(h["chunk_id"]): h for h in hits}
    passages = "\n\n".join(f"[{tag}] {h['title']}\n{h['text']}" for tag, h in by_tag.items())
    # Imported here: the agent graph imports this module (through agent/actions.py)
    from app.agent.graph import _router_model
    try:
        result = await _router_model().with_structured_output(_PolicyVerdict).ainvoke(
            prompts.POLICY_CHECK_PROMPT.format(reason=reason, passages=passages[:12000])
        )
    except Exception:
        return {"verdict": "unchecked", "explanation": "The AI couldn't check the policy right now.",
                "sources": [], "chunk_ids": []}

    used = [by_tag[t.strip("[] ").lower()] for t in result.source_tags if t.strip("[] ").lower() in by_tag]
    verdict, explanation = result.verdict, result.explanation.strip()
    if verdict == "supported" and not used:
        verdict, explanation = "not_covered", "No specific policy passage was found for this reason."
    return {
        "verdict": verdict,
        "explanation": explanation,
        "sources": [
            {
                "tag": citation_tag(h["chunk_id"]),
                "document_id": h["document_id"],
                "title": h["title"],
                "chunk_index": h["chunk_index"],
                "excerpt": h["text"][:EXCERPT_CHARS],
            }
            for h in used
        ],
        "chunk_ids": [h["chunk_id"] for h in used],
    }


def evaluation_text(policy: dict[str, Any]) -> str:
    """The policy check as saved on the strike (agent_evaluation), e.g. "Policy supports this: …"."""
    label = VERDICT_LABEL.get(policy.get("verdict"), "Not checked")
    return f"{label}: {policy.get('explanation', '')}".strip()


async def check_give_strike(
    db: AsyncSession, scope: AccessScope, body: CreateStrikeRequest
) -> tuple[str, str, int]:
    """
    Every rule give_strike checks, without saving.

    Returns (team name, receiver name, their active strikes in this team so far).

    Raises:
        404 team_not_found   — missing, in another org, or not viewable
        403 forbidden        — no give_strike in this team, striking yourself, or
                               the person isn't ranked below you in this team
        404 member_not_found — the person isn't on this team
    """
    team_name = await db.scalar(
        select(Team.name).where(Team.id == body.team_id, Team.org_id == scope.org_id)
    )
    if team_name is None or not scope.can_view_team(body.team_id):
        raise api_error(status.HTTP_404_NOT_FOUND, "team_not_found", "Team not found.")
    if not scope.can("give_strike", body.team_id):
        raise api_error(status.HTTP_403_FORBIDDEN, "forbidden", "You can't give strikes in this team.")
    # Checked by user, not role: your own team role can sit below your org role
    if body.given_to_user_id == scope.user_id:
        raise api_error(status.HTTP_403_FORBIDDEN, "forbidden", "You can't give a strike to yourself.")

    row = (
        await db.execute(
            select(TeamMember.role_id, User.name)
            .join(User, User.id == TeamMember.user_id)
            .where(TeamMember.team_id == body.team_id, TeamMember.user_id == body.given_to_user_id)
        )
    ).first()
    if row is None:
        raise api_error(status.HTTP_404_NOT_FOUND, "member_not_found", "That person isn't on this team.")
    if not scope.can_give_in_team(row.role_id, body.team_id):
        raise api_error(
            status.HTTP_403_FORBIDDEN,
            "forbidden",
            "You can only give strikes to people ranked below you on this team.",
        )

    active = await db.scalar(
        select(func.count()).select_from(Strike).where(
            Strike.team_id == body.team_id,
            Strike.given_to_user_id == body.given_to_user_id,
            Strike.status.in_(ACTIVE_STATUSES),
        )
    )
    return team_name, row.name, active or 0


async def give_strike(
    db: AsyncSession,
    scope: AccessScope,
    body: CreateStrikeRequest,
    policy_chunk_ids: list[str],
    agent_evaluation: str,
) -> StrikeResponse:
    """
    Save a confirmed strike (D6), with the policy check shown on the card (D46).
    The chat agent calls this after the user's Confirm click, with the scope of
    that click's request, so the rules are checked again at that moment.

    Raises: see check_give_strike.
    """
    team_name, receiver_name, active = await check_give_strike(db, scope, body)
    strike = Strike(
        id=uuid.uuid4(),
        org_id=scope.org_id,
        team_id=body.team_id,
        given_by_user_id=scope.user_id,
        given_to_user_id=body.given_to_user_id,
        reason=body.reason,
        policy_chunk_ids=policy_chunk_ids,
        agent_evaluation=agent_evaluation,
        status="confirmed",
        escalated=active + 1 >= ESCALATION_THRESHOLD,
    )
    db.add(strike)
    await db.commit()
    await db.refresh(strike)
    giver_name = await db.scalar(select(User.name).where(User.id == scope.user_id))
    logger.info(
        "User %s gave a strike to %s in team %s (escalated=%s)",
        scope.user_id, body.given_to_user_id, body.team_id, strike.escalated,
    )
    return StrikeResponse(
        id=strike.id,
        team_id=body.team_id,
        team_name=team_name,
        given_by_user_id=scope.user_id,
        given_by_name=giver_name or "",
        given_to_user_id=body.given_to_user_id,
        given_to_name=receiver_name,
        reason=strike.reason,
        status=strike.status,
        escalated=strike.escalated,
        created_at=strike.created_at,
    )


# ── The /feedback page (D54): preview, then save ──────────────────────────────

# The preview's policy result, so Save doesn't repeat the AI call. Keyed by who
# asked and exactly what they previewed; a changed reason means a new check.
# In-process like the scope cache: fine for the single MVP server (D11).
_previews: TTLCache = TTLCache(maxsize=500, ttl=600)


def _preview_key(scope: AccessScope, body: CreateStrikeRequest) -> tuple:
    return (scope.user_id, body.team_id, body.given_to_user_id, body.reason)


async def preview_strike(
    db: AsyncSession, scope: AccessScope, body: CreateStrikeRequest
) -> StrikePreviewResponse:
    """
    What the page shows before Confirm: every rule of the real save, the active
    strike count and the policy check (D46). Nothing is saved.

    Raises: see check_give_strike.
    """
    team_name, receiver_name, active = await check_give_strike(db, scope, body)
    policy = await check_policy(scope, body.reason)
    _previews[_preview_key(scope, body)] = policy
    return StrikePreviewResponse(
        team_name=team_name,
        given_to_name=receiver_name,
        active_strikes=active,
        will_escalate=active + 1 >= ESCALATION_THRESHOLD,
        policy=PolicyCheck(**{k: v for k, v in policy.items() if k != "chunk_ids"}),
    )


async def save_strike(db: AsyncSession, scope: AccessScope, body: CreateStrikeRequest) -> StrikeResponse:
    """
    Save after the page's Confirm. Uses the preview's policy result when the
    same person previewed exactly this strike in the last 10 minutes, otherwise
    checks the policy again. give_strike() re-checks every rule.

    Raises: see check_give_strike.
    """
    key = _preview_key(scope, body)
    policy = _previews.pop(key, None)
    if policy is None:
        await check_give_strike(db, scope, body)   # refuse before spending an AI call
        policy = await check_policy(scope, body.reason)
    return await give_strike(db, scope, body, policy["chunk_ids"], evaluation_text(policy))


# ── Lists, appeals and reviews (D6, D47, D54, D55) ────────────────────────────

def _strike_query():
    """Strikes with team, giver, receiver and reviewer names. Add .where() to narrow."""
    Giver, Receiver, Reviewer = aliased(User), aliased(User), aliased(User)
    return (
        select(
            Strike,
            Team.name.label("team_name"),
            Giver.name.label("giver_name"),
            Receiver.name.label("receiver_name"),
            Reviewer.name.label("reviewer_name"),
        )
        .join(Team, Team.id == Strike.team_id)
        .join(Giver, Giver.id == Strike.given_by_user_id)
        .join(Receiver, Receiver.id == Strike.given_to_user_id)
        .outerjoin(Reviewer, Reviewer.id == Strike.reviewed_by_user_id)
    )


def _can_appeal(strike: Strike, scope: AccessScope) -> bool:
    """D6: only the receiver, only from confirmed, only once and only if never reviewed."""
    return (
        strike.given_to_user_id == scope.user_id
        and strike.status == "confirmed"
        and strike.appeal_notes is None
        and strike.reviewed_at is None
    )


def _to_response(row, scope: AccessScope) -> StrikeResponse:
    strike = row.Strike
    return StrikeResponse(
        id=strike.id,
        team_id=strike.team_id,
        team_name=row.team_name,
        given_by_user_id=strike.given_by_user_id,
        given_by_name=row.giver_name or "",
        given_to_user_id=strike.given_to_user_id,
        given_to_name=row.receiver_name or "",
        reason=strike.reason,
        status=strike.status,
        escalated=strike.escalated,
        created_at=strike.created_at,
        appeal_notes=strike.appeal_notes,
        reviewed_by_name=row.reviewer_name,
        reviewed_at=strike.reviewed_at,
        can_appeal=_can_appeal(strike, scope),
    )


async def _one(db: AsyncSession, scope: AccessScope, strike_id: uuid.UUID):
    return (
        await db.execute(_strike_query().where(Strike.id == strike_id, Strike.org_id == scope.org_id))
    ).first()


async def list_my_strikes(db: AsyncSession, scope: AccessScope) -> list[StrikeResponse]:
    """Strikes given to the user in this org, newest first; dismissed ones left out (D6, D47)."""
    rows = await db.execute(
        _strike_query()
        .where(
            Strike.org_id == scope.org_id,
            Strike.given_to_user_id == scope.user_id,
            Strike.status != "dismissed",
        )
        .order_by(Strike.created_at.desc())
    )
    return [_to_response(row, scope) for row in rows.all()]


async def list_given_strikes(db: AsyncSession, scope: AccessScope) -> list[StrikeResponse]:
    """Strikes the user gave in this org, every status, newest first (D54 "given")."""
    rows = await db.execute(
        _strike_query()
        .where(Strike.org_id == scope.org_id, Strike.given_by_user_id == scope.user_id)
        .order_by(Strike.created_at.desc())
    )
    return [_to_response(row, scope) for row in rows.all()]


def _may_review(strike: Strike, scope: AccessScope) -> bool:
    """D6 + D55: review_strike for the strike's team, and neither its giver nor its receiver."""
    return (
        scope.can("review_strike", strike.team_id)
        and strike.given_by_user_id != scope.user_id
        and strike.given_to_user_id != scope.user_id
    )


async def list_reviewable_appeals(db: AsyncSession, scope: AccessScope) -> list[AppealResponse]:
    """
    Appeals waiting for a decision that this user may decide, oldest first (the
    longest-waiting on top). Each carries the policy check saved with the strike
    and its passages, only from documents the reviewer can see.
    """
    rows = await db.execute(
        _strike_query()
        .where(Strike.org_id == scope.org_id, Strike.status == "appealed")
        .order_by(Strike.created_at)
    )
    appeals = []
    for row in rows.all():
        if not _may_review(row.Strike, scope):
            continue
        passages = await visible_chunks(db, scope, row.Strike.policy_chunk_ids or [])
        appeals.append(
            AppealResponse(
                **_to_response(row, scope).model_dump(),
                policy_evaluation=row.Strike.agent_evaluation,
                policy_sources=[
                    Citation(
                        tag=citation_tag(h["chunk_id"]),
                        document_id=h["document_id"],
                        title=h["title"],
                        chunk_index=h["chunk_index"],
                        excerpt=h["text"][:EXCERPT_CHARS],
                    )
                    for h in passages
                ],
            )
        )
    return appeals


async def appeal_strike(
    db: AsyncSession, scope: AccessScope, strike_id: uuid.UUID, body: AppealStrikeRequest
) -> StrikeResponse:
    """
    The receiver appeals once, with a note (D6). The strike keeps counting
    (appealed is still active) until a reviewer dismisses it.

    Raises:
        404 strike_not_found — missing, in another org, or not given to you
        409 cannot_appeal    — already appealed or reviewed, or dismissed
    """
    row = await _one(db, scope, strike_id)
    if row is None or row.Strike.given_to_user_id != scope.user_id:
        raise api_error(status.HTTP_404_NOT_FOUND, "strike_not_found", "Strike not found.")
    strike = row.Strike
    if not _can_appeal(strike, scope):
        raise api_error(
            status.HTTP_409_CONFLICT,
            "cannot_appeal",
            "A strike can be appealed only once, and only before it has been reviewed.",
        )
    strike.status = "appealed"
    strike.appeal_notes = body.appeal_notes
    await db.commit()
    logger.info("User %s appealed strike %s", scope.user_id, strike_id)
    return _to_response(await _one(db, scope, strike_id), scope)


async def review_appeal(
    db: AsyncSession, scope: AccessScope, strike_id: uuid.UUID, body: ReviewAppealRequest
) -> StrikeResponse:
    """
    Uphold (back to confirmed) or dismiss (stops counting) an appeal (D6).
    Records who decided and when.

    Raises:
        404 strike_not_found — missing, in another org, or no review_strike for its team
        403 forbidden        — you gave or received this strike (D6, D55)
        409 not_appealed     — nothing to decide (not appealed, or already decided)
    """
    row = await _one(db, scope, strike_id)
    if row is None or not scope.can("review_strike", row.Strike.team_id):
        raise api_error(status.HTTP_404_NOT_FOUND, "strike_not_found", "Strike not found.")
    strike = row.Strike
    if strike.given_by_user_id == scope.user_id:
        raise api_error(status.HTTP_403_FORBIDDEN, "forbidden",
                        "You gave this strike, so someone else must review the appeal.")
    if strike.given_to_user_id == scope.user_id:
        raise api_error(status.HTTP_403_FORBIDDEN, "forbidden", "You can't review an appeal of your own strike.")
    if strike.status != "appealed":
        raise api_error(status.HTTP_409_CONFLICT, "not_appealed", "This strike has no appeal waiting for a decision.")
    strike.status = "confirmed" if body.decision == "uphold" else "dismissed"
    strike.reviewed_by_user_id = scope.user_id
    strike.reviewed_at = datetime.utcnow()
    await db.commit()
    logger.info("User %s %s the appeal of strike %s", scope.user_id, body.decision, strike_id)
    return _to_response(await _one(db, scope, strike_id), scope)
