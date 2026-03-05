from typing import Optional
from datetime import datetime
from pydantic import BaseModel


class SpeakerProfileCreate(BaseModel):
    first_name: str
    last_name: str
    fonction: Optional[str] = None
    email: Optional[str] = None
    phone_number: Optional[str] = None


class SpeakerProfileUpdate(BaseModel):
    first_name: Optional[str] = None
    last_name: Optional[str] = None
    fonction: Optional[str] = None
    email: Optional[str] = None
    phone_number: Optional[str] = None


class SpeakerProfileResponse(BaseModel):
    id: str
    tenant_id: str
    first_name: Optional[str]
    last_name: Optional[str]
    display_name: Optional[str]
    fonction: Optional[str]
    email: Optional[str]
    phone_number: Optional[str]
    consent_status: Optional[str]
    consent_type: Optional[str]
    consent_scope: Optional[str]
    consent_date: Optional[datetime]
    enrollment_status: Optional[str]
    enrollment_method: Optional[str]
    enrolled_at: Optional[datetime]
    share_with_parent_tenant: bool
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}
