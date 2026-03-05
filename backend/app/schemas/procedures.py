from datetime import datetime
from typing import Optional

from pydantic import BaseModel


# ── Questions de formulaire ───────────────────────────────────────────────────

class FormQuestion(BaseModel):
    id: str
    label: str
    type: str = "textarea"   # "text" | "textarea" | "select"
    options: list[str] = []  # pour type "select"
    required: bool = False


# ── Template roles ────────────────────────────────────────────────────────────

class TemplateRoleCreate(BaseModel):
    role_name: str
    order_index: int = 0
    form_questions: list[FormQuestion] = []
    invitation_delay_days: int = 15


class TemplateRoleUpdate(BaseModel):
    role_name: Optional[str] = None
    order_index: Optional[int] = None
    form_questions: Optional[list[FormQuestion]] = None
    invitation_delay_days: Optional[int] = None


class TemplateRoleResponse(BaseModel):
    id: str
    role_name: str
    order_index: int
    form_questions: list[FormQuestion] = []
    invitation_delay_days: int

    model_config = {"from_attributes": True}


# ── Templates de procédure ────────────────────────────────────────────────────

class ProcedureTemplateCreate(BaseModel):
    name: str
    description: Optional[str] = None
    document_template_id: Optional[str] = None
    roles: list[TemplateRoleCreate] = []


class ProcedureTemplateUpdate(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    document_template_id: Optional[str] = None
    is_active: Optional[bool] = None


class ProcedureTemplateResponse(BaseModel):
    id: str
    name: str
    description: Optional[str] = None
    document_template_id: Optional[str] = None
    is_active: bool
    created_at: datetime
    updated_at: datetime
    roles: list[TemplateRoleResponse] = []

    model_config = {"from_attributes": True}


# ── Participants ──────────────────────────────────────────────────────────────

class ParticipantCreate(BaseModel):
    name: str
    email: Optional[str] = None
    role_name: str
    form_questions: list[FormQuestion] = []


class ParticipantResponse(BaseModel):
    id: str
    name: str
    email: Optional[str] = None
    role_name: str
    form_questions: list[FormQuestion] = []
    form_token: str
    invited_at: Optional[datetime] = None
    responded_at: Optional[datetime] = None
    responses: Optional[dict] = None
    created_at: datetime

    model_config = {"from_attributes": True}


# ── Procédures ────────────────────────────────────────────────────────────────

class ProcedureCreate(BaseModel):
    title: str
    description: Optional[str] = None
    template_id: Optional[str] = None
    document_template_id: Optional[str] = None
    meeting_date: Optional[datetime] = None


class ProcedureUpdate(BaseModel):
    title: Optional[str] = None
    description: Optional[str] = None
    status: Optional[str] = None
    meeting_date: Optional[datetime] = None
    document_template_id: Optional[str] = None
    source_session_id: Optional[str] = None
    ai_document_id: Optional[str] = None


class ProcedureListResponse(BaseModel):
    id: str
    title: str
    description: Optional[str] = None
    status: str
    meeting_date: Optional[datetime] = None
    participant_count: int = 0
    response_count: int = 0
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class ProcedureDetailResponse(BaseModel):
    id: str
    title: str
    description: Optional[str] = None
    status: str
    meeting_date: Optional[datetime] = None
    template_id: Optional[str] = None
    document_template_id: Optional[str] = None
    source_session_id: Optional[str] = None
    ai_document_id: Optional[str] = None
    created_at: datetime
    updated_at: datetime
    participants: list[ParticipantResponse] = []

    model_config = {"from_attributes": True}


# ── Formulaire public (soumission par participant) ────────────────────────────

class PublicFormResponse(BaseModel):
    """Données retournées au participant pour afficher son formulaire."""
    procedure_title: str
    participant_name: str
    role_name: str
    form_questions: list[FormQuestion]
    already_responded: bool


class FormSubmit(BaseModel):
    responses: dict  # {question_id: valeur}
