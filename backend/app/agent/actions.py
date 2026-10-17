"""
Write actions the chat agent can propose (ticket 12 D22, D45).

Each action has two steps, both plain code:

    prepare(scope, tool, args) → PendingAction  runs every rule of the real save
                                                without saving, and writes the
                                                card text from database names
    execute(scope, action)     → message        the real save, after the user's
                                                Confirm click, with the scope of
                                                that click's own request

Both call the same service functions as the REST endpoints (ticket 03 §1a), so
the chat can never do more than the app's pages allow. Problems are raised as
ActionRefused with a message that is safe to show the user.

The only LLM call here is give_strike's policy check (D46, services/strikes.py::
check_policy, shared with the /feedback page): it searches the policy documents
the giver can see and judges the reason. Its result is a
warning on the card, never a block, and is saved with the strike.

Supported: create_task, give_commendation, give_strike.
"""

import uuid
from datetime import date, datetime, time
from typing import Any, Awaitable, Callable, Optional

from fastapi import HTTPException
from pydantic import ValidationError

from app.agent.state import CardLine, PendingAction
from app.core.database import async_session
from app.schemas.commendations import CreateCommendationRequest
from app.schemas.strikes import CreateStrikeRequest
from app.schemas.tasks import CreateTaskRequest
from app.scope.resolver import AccessScope
from app.services.commendations import check_give_commendation, give_commendation
from app.services.strikes import (
    ESCALATION_THRESHOLD,
    check_give_strike,
    check_policy,
    evaluation_text,
    give_strike,
)
from app.services.tasks import check_create_task, create_task


class ActionRefused(Exception):
    """The action can't be done. str(exc) is shown to the user as is."""


def _reason(exc: HTTPException) -> str:
    """The message of an api_error() ({"code", "message"} detail)."""
    detail = exc.detail
    if isinstance(detail, dict) and detail.get("message"):
        return detail["message"]
    return "That isn't allowed."


# ── create_task ───────────────────────────────────────────────────────────────

def _task_request(args: dict[str, Any]) -> CreateTaskRequest:
    """LLM tool args (or stored card args) → the same request the Tasks page sends."""
    deadline: Optional[datetime] = None
    raw_deadline = args.get("deadline")
    if raw_deadline:
        try:
            day = date.fromisoformat(str(raw_deadline)[:10])
        except ValueError:
            raise ActionRefused("I couldn't read the deadline. Please give it as a date, e.g. 2026-10-17.")
        deadline = datetime.combine(day, time(23, 59, 59))     # due by the end of that day (UTC)
    try:
        return CreateTaskRequest(
            team_id=uuid.UUID(str(args.get("team_id"))),
            assigned_to_user_id=uuid.UUID(str(args.get("assigned_to_user_id"))),
            title=args.get("title") or "",
            description=args.get("description") or None,
            deadline=deadline,
        )
    except (ValueError, ValidationError):
        raise ActionRefused(
            "To create a task I need the person (pick them with @), the team (pick it with /) "
            "and a title of at least 2 characters."
        )


async def _prepare_task(scope: AccessScope, args: dict[str, Any]) -> PendingAction:
    body = _task_request(args)
    if body.deadline is not None and body.deadline.date() < date.today():
        raise ActionRefused("That deadline is in the past. Please pick a later date.")
    try:
        async with async_session() as db:
            team_name, assignee_name = await check_create_task(db, scope, body)
    except HTTPException as exc:
        raise ActionRefused(_reason(exc))

    details: list[CardLine] = [
        {"label": "Title", "value": body.title},
        {"label": "Assignee", "value": assignee_name},
        {"label": "Team", "value": team_name},
        {"label": "Deadline", "value": body.deadline.strftime("%a %d %b %Y") if body.deadline else "None"},
    ]
    if body.description:
        details.append({"label": "Description", "value": body.description})
    return {
        "tool": "create_task",
        "args": body.model_dump(mode="json"),
        "summary": f"Create a task for {assignee_name}",
        "details": details,
        "policy": None,
    }


async def _execute_task(scope: AccessScope, action: PendingAction) -> str:
    body = CreateTaskRequest.model_validate(action["args"])
    try:
        async with async_session() as db:
            task = await create_task(db, scope, body)
    except HTTPException as exc:
        raise ActionRefused(f"I couldn't create the task: {_reason(exc)}")
    return f'Done. I created the task "{task.title}" for {task.assigned_to_name} in {task.team_name}.'


# ── give_commendation ─────────────────────────────────────────────────────────

def _commendation_request(args: dict[str, Any]) -> CreateCommendationRequest:
    """LLM tool args (or stored card args) → the request the service checks."""
    try:
        return CreateCommendationRequest(
            team_id=uuid.UUID(str(args.get("team_id"))),
            given_to_user_id=uuid.UUID(str(args.get("to_user_id") or args.get("given_to_user_id"))),
            reason=args.get("reason") or "",
        )
    except (ValueError, ValidationError):
        raise ActionRefused(
            "To give a commendation I need the person (pick them with @), the team (pick it with /) "
            "and a reason of at least 5 characters."
        )


async def _prepare_commendation(scope: AccessScope, args: dict[str, Any]) -> PendingAction:
    body = _commendation_request(args)
    try:
        async with async_session() as db:
            team_name, receiver_name = await check_give_commendation(db, scope, body)
    except HTTPException as exc:
        raise ActionRefused(_reason(exc))
    return {
        "tool": "give_commendation",
        "args": body.model_dump(mode="json"),
        "summary": f"Commend {receiver_name}",
        "details": [
            {"label": "Person", "value": receiver_name},
            {"label": "Team", "value": team_name},
            {"label": "Reason", "value": body.reason},
        ],
        "policy": None,
    }


async def _execute_commendation(scope: AccessScope, action: PendingAction) -> str:
    body = CreateCommendationRequest.model_validate(action["args"])
    try:
        async with async_session() as db:
            saved = await give_commendation(db, scope, body)
    except HTTPException as exc:
        raise ActionRefused(f"I couldn't save the commendation: {_reason(exc)}")
    return f"Done. I recorded your commendation for {saved.given_to_name} in {saved.team_name}."


# ── give_strike ───────────────────────────────────────────────────────────────

def _strike_request(args: dict[str, Any]) -> CreateStrikeRequest:
    """LLM tool args (or stored card args) → the request the service checks."""
    try:
        return CreateStrikeRequest(
            team_id=uuid.UUID(str(args.get("team_id"))),
            given_to_user_id=uuid.UUID(str(args.get("to_user_id") or args.get("given_to_user_id"))),
            reason=args.get("reason") or "",
        )
    except (ValueError, ValidationError):
        raise ActionRefused(
            "To give a strike I need the person (pick them with @), the team (pick it with /) "
            "and a reason of at least 5 characters."
        )


async def _prepare_strike(scope: AccessScope, args: dict[str, Any]) -> PendingAction:
    body = _strike_request(args)
    try:
        async with async_session() as db:
            team_name, receiver_name, active = await check_give_strike(db, scope, body)
    except HTTPException as exc:
        raise ActionRefused(_reason(exc))

    policy = await check_policy(scope, body.reason)
    count = f"{active} so far"
    if active + 1 >= ESCALATION_THRESHOLD:
        count += f" (this one makes {active + 1}, so it will be marked as escalated)"
    return {
        "tool": "give_strike",
        "args": body.model_dump(mode="json"),
        "summary": f"Strike for {receiver_name}",
        "details": [
            {"label": "Person", "value": receiver_name},
            {"label": "Team", "value": team_name},
            {"label": "Reason", "value": body.reason},
            {"label": "Active strikes", "value": count},
        ],
        "policy": policy,
    }


async def _execute_strike(scope: AccessScope, action: PendingAction) -> str:
    body = CreateStrikeRequest.model_validate(action["args"])
    policy = action.get("policy") or {}
    evaluation = evaluation_text(policy)
    try:
        async with async_session() as db:
            saved = await give_strike(db, scope, body, policy.get("chunk_ids", []), evaluation)
    except HTTPException as exc:
        raise ActionRefused(f"I couldn't save the strike: {_reason(exc)}")
    reply = f"Done. I recorded the strike for {saved.given_to_name} in {saved.team_name}."
    if saved.escalated:
        reply += " It's their 3rd active strike in this team, so it's marked as escalated."
    return reply


# ── Registry ──────────────────────────────────────────────────────────────────

_PREPARE: dict[str, Callable[[AccessScope, dict[str, Any]], Awaitable[PendingAction]]] = {
    "create_task": _prepare_task,
    "give_commendation": _prepare_commendation,
    "give_strike": _prepare_strike,
}
_EXECUTE: dict[str, Callable[[AccessScope, PendingAction], Awaitable[str]]] = {
    "create_task": _execute_task,
    "give_commendation": _execute_commendation,
    "give_strike": _execute_strike,
}


async def prepare(scope: AccessScope, tool: str, args: dict[str, Any]) -> PendingAction:
    """Check a proposed action and build its Confirm card. Raises ActionRefused."""
    if tool not in _PREPARE:
        raise ActionRefused("I can't do that from chat yet.")
    return await _PREPARE[tool](scope, args)


async def execute(scope: AccessScope, action: PendingAction) -> str:
    """Save a confirmed action (rules re-checked inside). Raises ActionRefused."""
    return await _EXECUTE[action["tool"]](scope, action)
