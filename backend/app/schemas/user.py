from typing import Optional
from pydantic import BaseModel


class UserCreate(BaseModel):
    username: str
    password: str
    email: Optional[str] = None
    display_name: Optional[str] = None
    role: str = "user"
    tenant_id: str


class UserUpdate(BaseModel):
    email: Optional[str] = None
    display_name: Optional[str] = None
    role: Optional[str] = None
    is_active: Optional[bool] = None
    password: Optional[str] = None


class UserResponse(BaseModel):
    id: str
    username: str
    email: Optional[str]
    display_name: Optional[str]
    role: str
    tenant_id: str
    is_active: bool
    enabled_modules: list[str] = []
    tenant_sector: Optional[str] = None
    sector_suggestions: Optional[dict] = None

    model_config = {"from_attributes": True}
