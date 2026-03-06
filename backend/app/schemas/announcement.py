from __future__ import annotations

from datetime import datetime
from typing import Optional
from pydantic import BaseModel


class AnnouncementCreate(BaseModel):
    title: str
    message: str
    target_all: bool = True
    tenant_ids: list[str] = []  # used when target_all=False


class AnnouncementUpdate(BaseModel):
    title: Optional[str] = None
    message: Optional[str] = None
    is_active: Optional[bool] = None
    target_all: Optional[bool] = None
    tenant_ids: Optional[list[str]] = None


class AnnouncementTenantResponse(BaseModel):
    id: str
    name: str

    model_config = {"from_attributes": True}


class AnnouncementResponse(BaseModel):
    id: str
    title: str
    message: str
    is_active: bool
    target_all: bool
    tenants: list[AnnouncementTenantResponse] = []
    created_at: datetime

    model_config = {"from_attributes": True}
