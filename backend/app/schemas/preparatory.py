from typing import Optional
from datetime import datetime

from pydantic import BaseModel


# ── Agenda Points ─────────────────────────────────────────────────────────────

class AgendaPointCreate(BaseModel):
    title: str
    description: Optional[str] = None


class AgendaPointUpdate(BaseModel):
    title: Optional[str] = None
    description: Optional[str] = None


class AgendaPointResponse(BaseModel):
    id: str
    order_index: int
    title: str
    description: Optional[str] = None
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


# ── Documents ─────────────────────────────────────────────────────────────────

class DossierDocumentResponse(BaseModel):
    id: str
    dossier_id: str
    agenda_point_id: Optional[str] = None
    original_filename: str
    file_size: Optional[int] = None
    content_type: Optional[str] = None
    created_at: datetime

    model_config = {"from_attributes": True}


# ── Dossiers ──────────────────────────────────────────────────────────────────

class DossierCreate(BaseModel):
    title: str
    description: Optional[str] = None
    meeting_date: Optional[datetime] = None


class DossierUpdate(BaseModel):
    title: Optional[str] = None
    description: Optional[str] = None
    meeting_date: Optional[datetime] = None
    status: Optional[str] = None


class DossierListResponse(BaseModel):
    id: str
    title: str
    description: Optional[str] = None
    meeting_date: Optional[datetime] = None
    status: str
    point_count: int = 0
    document_count: int = 0
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class DossierDetailResponse(BaseModel):
    id: str
    title: str
    description: Optional[str] = None
    meeting_date: Optional[datetime] = None
    status: str
    created_at: datetime
    updated_at: datetime
    agenda_points: list[AgendaPointResponse] = []
    documents: list[DossierDocumentResponse] = []

    model_config = {"from_attributes": True}


class ReorderPointsRequest(BaseModel):
    point_ids: list[str]
