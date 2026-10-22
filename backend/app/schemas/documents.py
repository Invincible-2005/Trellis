"""
app/schemas/documents.py — Document schemas (Ticket 05 §4, Ticket 11, Ticket 12 D23)
"""
from datetime import datetime
from typing import Annotated, List, Literal, Optional
from uuid import UUID

from pydantic import BaseModel, StringConstraints, model_validator

from app.schemas.auth import AppBaseModel

DocScopeType = Literal["org", "role", "team"]
DocFileType = Literal["pdf", "docx", "pptx", "txt", "md"]
DocStatus = Literal["processing", "ready", "failed"]

DocTitle = Annotated[str, StringConstraints(strip_whitespace=True, min_length=2, max_length=200)]


class CreateDocumentRequest(BaseModel):
    title: DocTitle
    description: Optional[str] = None
    scope_type: DocScopeType
    role_id: Optional[UUID] = None      # required when scope_type == "role"
    team_id: Optional[UUID] = None      # required when scope_type == "team"
    file_url: str                       # CDN URL returned by UploadThing
    file_type: DocFileType

    @model_validator(mode="after")
    def _tag_matches_scope(self) -> "CreateDocumentRequest":
        # Exactly the id the scope type needs, and no other (422 otherwise).
        if (self.role_id is not None) != (self.scope_type == "role"):
            raise ValueError("role_id is required for role documents and not allowed otherwise.")
        if (self.team_id is not None) != (self.scope_type == "team"):
            raise ValueError("team_id is required for team documents and not allowed otherwise.")
        return self


class UpdateDocumentRequest(BaseModel):
    """
    Edit a document (D39). A missing field is left unchanged. To change who sees it,
    send scope_type with the id it needs (role_id / team_id), exactly as on upload.
    """
    title: Optional[DocTitle] = None
    description: Optional[str] = None   # "" clears it
    scope_type: Optional[DocScopeType] = None
    role_id: Optional[UUID] = None
    team_id: Optional[UUID] = None

    @model_validator(mode="after")
    def _tag_matches_scope(self) -> "UpdateDocumentRequest":
        if self.scope_type is None:
            if self.role_id is not None or self.team_id is not None:
                raise ValueError("Send scope_type together with role_id or team_id.")
            return self
        if (self.role_id is not None) != (self.scope_type == "role"):
            raise ValueError("role_id is required for role documents and not allowed otherwise.")
        if (self.team_id is not None) != (self.scope_type == "team"):
            raise ValueError("team_id is required for team documents and not allowed otherwise.")
        return self


class DocumentResponse(AppBaseModel):
    id: UUID
    title: str
    description: Optional[str] = None
    file_url: str
    file_type: DocFileType
    scope_type: DocScopeType
    role_id: Optional[UUID] = None
    team_id: Optional[UUID] = None
    uploaded_by_user_id: UUID
    status: DocStatus                   # frontend polls this after the 202 (ticket 11)
    chunk_count: Optional[int] = None
    error_message: Optional[str] = None # admin-facing reason when status == "failed"
    deletable: bool = False             # caller could upload it to this tag, so may delete it (D23)
    created_at: datetime


class DocumentListResponse(BaseModel):
    documents: List[DocumentResponse]


class FileUsageResponse(BaseModel):
    """Whether an uploaded file is used by a document or task hand-in (D64)."""
    in_use: bool


class TagTarget(BaseModel):
    id: UUID
    name: str


class DocumentTagOptions(BaseModel):
    """Where the caller may tag a new document (D23). The upload dialog's picker shows exactly these."""
    org: bool                   # may tag "whole organization"
    roles: List[TagTarget]      # own org-level role + roles below it
    teams: List[TagTarget]      # teams with upload_document that the caller can see
