"""
app/core/errors.py — Trellis error responses (Ticket 12 D16)

Every error Trellis raises has the shape:

    {"detail": {"code": "<snake_case>", "message": "<human text>"}}

The BFF branches on HTTP status + `detail.code` (e.g. redirect on
`org_not_provisioned`) and shows `detail.message` in a toast otherwise.
FastAPI's own 422 validation errors keep their default shape.
"""
from typing import Optional

from fastapi import HTTPException
from pydantic import BaseModel


class ErrorDetail(BaseModel):
    code: str
    message: str


class ErrorResponse(BaseModel):
    """The error body, published in OpenAPI so the frontend's generated types include it."""
    detail: ErrorDetail


def error_responses(*status_codes: int) -> dict[int, dict]:
    """`responses=` value for a route: documents which error statuses it can return."""
    return {code: {"model": ErrorResponse} for code in status_codes}


def api_error(
    status_code: int,
    code: str,
    message: str,
    headers: Optional[dict[str, str]] = None,
) -> HTTPException:
    """Build an HTTPException with the Trellis error body. Use as `raise api_error(...)`."""
    return HTTPException(
        status_code=status_code,
        detail={"code": code, "message": message},
        headers=headers,
    )
