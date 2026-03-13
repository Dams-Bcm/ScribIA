from typing import Optional
from pydantic import BaseModel, model_validator


class TenantCreate(BaseModel):
    name: str
    slug: str
    tenant_type: str = "organization"  # 'organization' | 'group'
    sector: Optional[str] = None  # e.g. 'syndic_copro', 'education_spe', 'collectivite', 'chantier', 'sante'
    parent_id: Optional[str] = None
    is_large: bool = False
    modules: list[str] = []  # module keys to enable on creation


class TenantUpdate(BaseModel):
    name: Optional[str] = None
    slug: Optional[str] = None
    tenant_type: Optional[str] = None
    sector: Optional[str] = None
    parent_id: Optional[str] = None
    is_large: Optional[bool] = None
    is_active: Optional[bool] = None
    whisper_initial_prompt: Optional[str] = None
    rag_project_id: Optional[str] = None
    rag_api_key: Optional[str] = None


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
    sector: Optional[str]
    parent_id: Optional[str]
    is_large: bool
    is_active: bool
    db_mode: str = "shared"
    dedicated_db_name: Optional[str] = None
    whisper_initial_prompt: Optional[str] = None
    rag_project_id: Optional[str] = None
    rag_api_key_set: bool = False
    modules: list[ModuleResponse] = []

    model_config = {"from_attributes": True}

    @model_validator(mode="before")
    @classmethod
    def compute_rag_api_key_set(cls, data):
        """Masque la clé API et expose uniquement un booléen."""
        if hasattr(data, "rag_api_key"):
            # SQLAlchemy model
            data_dict = {c.key: getattr(data, c.key) for c in data.__table__.columns}
            data_dict["rag_api_key_set"] = bool(data.rag_api_key)
            data_dict["modules"] = data.modules
            return data_dict
        if isinstance(data, dict):
            data["rag_api_key_set"] = bool(data.get("rag_api_key"))
        return data
