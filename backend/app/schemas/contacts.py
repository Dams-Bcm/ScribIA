from datetime import datetime
from pydantic import BaseModel, Field


# ── Contact Groups ────────────────────────────────────────────────────────────

class ContactGroupCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=255)
    description: str | None = None
    metadata: dict | None = None


class ContactGroupUpdate(BaseModel):
    name: str | None = Field(None, min_length=1, max_length=255)
    description: str | None = None
    metadata: dict | None = None


class ContactResponse(BaseModel):
    id: str
    group_id: str
    name: str
    email: str | None
    phone: str | None
    role: str | None
    custom_fields: dict | None
    created_at: datetime
    consent_status: str | None = None
    consent_type: str | None = None
    enrollment_status: str | None = None

    model_config = {"from_attributes": True}


class ContactGroupResponse(BaseModel):
    id: str
    name: str
    description: str | None
    metadata: dict | None
    contact_count: int = 0
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class ContactGroupDetailResponse(ContactGroupResponse):
    contacts: list[ContactResponse] = []


# ── Contacts ──────────────────────────────────────────────────────────────────

class ContactCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=255)
    email: str | None = None
    phone: str | None = None
    role: str | None = None
    custom_fields: dict | None = None


class ContactUpdate(BaseModel):
    name: str | None = Field(None, min_length=1, max_length=255)
    email: str | None = None
    phone: str | None = None
    role: str | None = None
    custom_fields: dict | None = None
