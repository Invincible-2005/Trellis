"""
app/api/v1/documents.py — Document routes (Ticket 05 §4, Ticket 11, Ticket 12 D23)

The router requires an org (get_org_context); every route also depends on get_scope.
The checks themselves live in app/services.
"""
import uuid

from fastapi import APIRouter, BackgroundTasks, Depends, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.deps import get_org_context, get_scope
from app.core.errors import error_responses
from app.schemas.documents import (
    CreateDocumentRequest,
    DocumentListResponse,
    DocumentResponse,
    DocumentTagOptions,
    FileUsageResponse,
    UpdateDocumentRequest,
)
from app.scope.resolver import AccessScope
from app.services import documents
from app.services.ingestion import run_ingestion

router = APIRouter(prefix="/documents", tags=["documents"], dependencies=[Depends(get_org_context)])


@router.get(
    "",
    response_model=DocumentListResponse,
    responses=error_responses(400, 401, 409, 503),
)
async def list_documents(
    scope: AccessScope = Depends(get_scope),
    db: AsyncSession = Depends(get_db),
) -> DocumentListResponse:
    """Every document the caller may see, newest first, with its indexing status."""
    return DocumentListResponse(documents=await documents.list_documents(db, scope))


@router.post(
    "",
    response_model=DocumentResponse,
    status_code=status.HTTP_202_ACCEPTED,
    responses=error_responses(400, 401, 403, 404, 409, 503),
)
async def create_document(
    body: CreateDocumentRequest,
    background_tasks: BackgroundTasks,
    scope: AccessScope = Depends(get_scope),
    db: AsyncSession = Depends(get_db),
) -> DocumentResponse:
    """
    Register a file already uploaded to UploadThing and start indexing it.
    Returns at once with status 'processing'; poll GET /documents/{id} until
    it is 'ready' or 'failed'. Tag must be at or below the caller (D23).
    """
    document = await documents.create_document(db, scope, body)
    background_tasks.add_task(run_ingestion, document.id)
    return document


# Declared before "/{document_id}" so "tag-options" isn't read as a document id.
@router.get(
    "/tag-options",
    response_model=DocumentTagOptions,
    responses=error_responses(400, 401, 409, 503),
)
async def get_tag_options(
    scope: AccessScope = Depends(get_scope),
    db: AsyncSession = Depends(get_db),
) -> DocumentTagOptions:
    """Where the caller may tag a new document: org, roles and teams (D23). Fills the upload dialog's picker."""
    return await documents.tag_options(db, scope)


# Also before "/{document_id}".
@router.get(
    "/file-usage",
    response_model=FileUsageResponse,
    responses=error_responses(400, 401, 409, 503),
)
async def get_file_usage(
    file_url: str,
    db: AsyncSession = Depends(get_db),
) -> FileUsageResponse:
    """
    Is this uploaded file used by a document or task hand-in (any org)? The upload
    dialogs ask before deleting a file they uploaded but never saved (D64).
    """
    return await documents.file_usage(db, file_url)


@router.get(
    "/{document_id}",
    response_model=DocumentResponse,
    responses=error_responses(400, 401, 404, 409, 503),
)
async def get_document(
    document_id: uuid.UUID,
    scope: AccessScope = Depends(get_scope),
    db: AsyncSession = Depends(get_db),
) -> DocumentResponse:
    """One document the caller may see (used to poll indexing status)."""
    return await documents.get_document(db, scope, document_id)


@router.patch(
    "/{document_id}",
    response_model=DocumentResponse,
    responses=error_responses(400, 401, 403, 404, 409, 503),
)
async def update_document(
    document_id: uuid.UUID,
    body: UpdateDocumentRequest,
    scope: AccessScope = Depends(get_scope),
    db: AsyncSession = Depends(get_db),
) -> DocumentResponse:
    """
    Change a document's title, description or who sees it (D39). Allowed for anyone
    who could upload it where it is now, and to the new audience. The chat follows
    the new audience at once.
    """
    return await documents.update_document(db, scope, document_id, body)


@router.delete(
    "/{document_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    responses=error_responses(400, 401, 403, 404, 409, 503),
)
async def delete_document(
    document_id: uuid.UUID,
    scope: AccessScope = Depends(get_scope),
    db: AsyncSession = Depends(get_db),
) -> None:
    """
    Delete a document and its indexed pieces. Allowed for anyone who could upload
    a document with the same tag (D23).
    """
    await documents.delete_document(db, scope, document_id)
