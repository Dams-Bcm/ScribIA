from typing import Optional
from pydantic import BaseModel


class TenantCreate(BaseModel):
    name: str
    slug: str
    tenant_type: str = "organization"  # 'organization' | 'group'
    parent_id: Optional[str] = None
    is_large: bool = False
    modules: list[str] = []  # module keys to enable on creation


class TenantUpdate(BaseModel):
    name: Optional[str] = None
    slug: Optional[str] = None
    tenant_type: Optional[str] = None
    parent_id: Optional[str] = None
    is_large: Optional[bool] = None
    is_active: Optional[bool] = None


class TenantModuleUpdate(BaseModel):
    module_key: str
    enabled: bool


class ModuleResponse(BaseModel):
    module_key: str
    enabled: bool

    model_config = {"from_attributes": True}


class TenantResponse(BaseModel):
    id: str
    name: str
    slug: str
    tenant_type: str
    parent_id: Optional[str]
    is_large: bool
    is_active: bool
    modules: list[ModuleResponse] = []

    model_config = {"from_attributes": True}
