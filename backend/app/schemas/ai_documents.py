from datetime import datetime
from typing import Literal

from pydantic import BaseModel, Field


# ── Templates ────────────────────────────────────────────────────────────────

DocumentType = Literal["pv", "deliberation", "summary", "agenda", "custom"]
TemplateCategory = Literal["document", "procedure", "email"]


class WorkflowStep(BaseModel):
    step_type: str
    label: str
    description: str | None = None
    config: dict | None = None
    is_required: bool = True


class TemplateCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=200)
    description: str | None = None
    document_type: DocumentType = "custom"
    category: TemplateCategory = "document"
    system_prompt: str = Field(..., min_length=1)
    user_prompt_template: str = Field(..., min_length=1)
    map_system_prompt: str | None = None
    ollama_model: str | None = None
    temperature: float = Field(0.3, ge=0.0, le=2.0)
    is_active: bool = True
    is_global: bool = False
    workflow_steps: list[WorkflowStep] | None = None


class TemplateUpdate(BaseModel):
    name: str | None = Field(None, min_length=1, max_length=200)
    description: str | None = None
    document_type: DocumentType | None = None
    category: TemplateCategory | None = None
    system_prompt: str | None = None
    user_prompt_template: str | None = None
    map_system_prompt: str | None = None
    ollama_model: str | None = None
    temperature: float | None = Field(None, ge=0.0, le=2.0)
    is_active: bool | None = None
    is_global: bool | None = None
    workflow_steps: list[WorkflowStep] | None = None


class TemplateResponse(BaseModel):
    id: str
    tenant_id: str | None
    name: str
    description: str | None
    document_type: str
    category: str
    is_global: bool
    system_prompt: str
    user_prompt_template: str
    map_system_prompt: str | None
    ollama_model: str | None
    temperature: float
    is_active: bool
    workflow_steps: list[WorkflowStep] | None = None
    created_at: datetime
    updated_at: datetime
    assigned_tenant_ids: list[str] = []

    model_config = {"from_attributes": True}


class TemplateAssignRequest(BaseModel):
    """Assign/unassign a global template to tenants."""
    tenant_ids: list[str]


# ── Documents générés ─────────────────────────────────────────────────────────

AIDocumentStatus = Literal["pending", "generating", "completed", "error"]


class GenerateRequest(BaseModel):
    template_id: str
    title: str = Field(..., min_length=1, max_length=500)
    source_dossier_id: str | None = None
    source_session_id: str | None = None


class AIDocumentResponse(BaseModel):
    id: str
    tenant_id: str
    user_id: str | None
    template_id: str | None
    title: str
    status: str
    source_dossier_id: str | None
    source_session_id: str | None
    result_text: str | None
    error_message: str | None
    created_at: datetime
    generation_started_at: datetime | None
    generation_completed_at: datetime | None
    invalidated_at: datetime | None = None
    invalidated_reason: str | None = None

    model_config = {"from_attributes": True}


class AIDocumentListItem(BaseModel):
    id: str
    title: str
    status: str
    template_id: str | None
    source_dossier_id: str | None
    source_session_id: str | None
    created_at: datetime
    generation_completed_at: datetime | None
    invalidated_at: datetime | None = None
    invalidated_reason: str | None = None

    model_config = {"from_attributes": True}
