from typing import Optional
from datetime import datetime
from pydantic import BaseModel, field_validator


class SubstitutionRuleCreate(BaseModel):
    original: str
    replacement: str
    is_case_sensitive: bool = True
    is_whole_word: bool = True
    is_enabled: bool = True
    category: Optional[str] = None

    @field_validator("original", "replacement")
    @classmethod
    def not_blank(cls, v: str) -> str:
        if not v.strip():
            raise ValueError("Ce champ ne peut pas etre vide")
        return v.strip()


class SubstitutionRuleUpdate(BaseModel):
    original: Optional[str] = None
    replacement: Optional[str] = None
    is_case_sensitive: Optional[bool] = None
    is_whole_word: Optional[bool] = None
    is_enabled: Optional[bool] = None
    category: Optional[str] = None


class SubstitutionRuleResponse(BaseModel):
    id: str
    tenant_id: str
    original: str
    replacement: str
    is_case_sensitive: bool
    is_whole_word: bool
    is_enabled: bool
    category: Optional[str]
    usage_count: int
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class SubstitutionPreview(BaseModel):
    original_text: str
    substituted_text: str
    rules_applied: int
