"""Router — Module Dictionnaire (regles de substitution).

Prefixe : /dictionary
Module requis : dictionary
"""

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from pydantic import BaseModel

from app.database import get_db
from app.deps import get_current_user, require_module
from app.models.substitution import SubstitutionRule
from app.models.transcription import TranscriptionJob, TranscriptionSegment
from app.models.ai_documents import AIDocument
from app.models.user import User
from app.schemas.substitution import (
    SubstitutionRuleCreate,
    SubstitutionRuleUpdate,
    SubstitutionRuleResponse,
    SubstitutionPreview,
)
from app.services.substitutions import apply_substitutions

router = APIRouter(
    prefix="/dictionary",
    tags=["dictionary"],
    dependencies=[Depends(require_module("dictionary"))],
)


# ── List rules ──────────────────────────────────────────────────────────────

@router.get("/rules", response_model=list[SubstitutionRuleResponse])
def list_rules(
    category: str | None = Query(None),
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    q = db.query(SubstitutionRule).filter(SubstitutionRule.tenant_id == user.tenant_id)
    if category:
        q = q.filter(SubstitutionRule.category == category)
    return q.order_by(SubstitutionRule.original).all()


# ── Get categories ──────────────────────────────────────────────────────────

@router.get("/categories", response_model=list[str])
def list_categories(
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    rows = (
        db.query(SubstitutionRule.category)
        .filter(SubstitutionRule.tenant_id == user.tenant_id, SubstitutionRule.category.isnot(None))
        .distinct()
        .all()
    )
    return sorted([r[0] for r in rows])


# ── Create rule ─────────────────────────────────────────────────────────────

@router.post("/rules", response_model=SubstitutionRuleResponse, status_code=201)
def create_rule(
    body: SubstitutionRuleCreate,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    rule = SubstitutionRule(
        tenant_id=user.tenant_id,
        original=body.original,
        replacement=body.replacement,
        is_case_sensitive=body.is_case_sensitive,
        is_whole_word=body.is_whole_word,
        is_enabled=body.is_enabled,
        category=body.category,
    )
    db.add(rule)
    db.commit()
    db.refresh(rule)
    return rule


# ── Update rule ─────────────────────────────────────────────────────────────

@router.patch("/rules/{rule_id}", response_model=SubstitutionRuleResponse)
def update_rule(
    rule_id: str,
    body: SubstitutionRuleUpdate,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    rule = db.query(SubstitutionRule).filter_by(id=rule_id, tenant_id=user.tenant_id).first()
    if not rule:
        raise HTTPException(status_code=404, detail="Regle introuvable")
    for field, value in body.model_dump(exclude_unset=True).items():
        setattr(rule, field, value)
    db.commit()
    db.refresh(rule)
    return rule


# ── Delete rule ─────────────────────────────────────────────────────────────

@router.delete("/rules/{rule_id}", status_code=204)
def delete_rule(
    rule_id: str,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    rule = db.query(SubstitutionRule).filter_by(id=rule_id, tenant_id=user.tenant_id).first()
    if not rule:
        raise HTTPException(status_code=404, detail="Regle introuvable")
    db.delete(rule)
    db.commit()


# ── Preview substitutions ──────────────────────────────────────────────────

@router.post("/preview", response_model=SubstitutionPreview)
def preview_substitutions(
    body: dict,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    text = body.get("text", "")
    if not text:
        raise HTTPException(status_code=400, detail="Le champ 'text' est requis")
    rules = (
        db.query(SubstitutionRule)
        .filter(SubstitutionRule.tenant_id == user.tenant_id, SubstitutionRule.is_enabled == True)
        .all()
    )
    result, count = apply_substitutions(text, rules)
    # Update usage counters
    if count > 0:
        for rule in rules:
            if rule.original in text or (not rule.is_case_sensitive and rule.original.lower() in text.lower()):
                rule.usage_count += 1
        db.commit()
    return SubstitutionPreview(original_text=text, substituted_text=result, rules_applied=count)


# ── Import CSV ──────────────────────────────────────────────────────────────

@router.post("/import", response_model=dict)
def import_rules(
    body: list[SubstitutionRuleCreate],
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    created = 0
    for item in body:
        rule = SubstitutionRule(
            tenant_id=user.tenant_id,
            original=item.original,
            replacement=item.replacement,
            is_case_sensitive=item.is_case_sensitive,
            is_whole_word=item.is_whole_word,
            is_enabled=item.is_enabled,
            category=item.category,
        )
        db.add(rule)
        created += 1
    db.commit()
    return {"imported": created}


# ── Apply substitutions to content ─────────────────────────────────────────

class ApplyRequest(BaseModel):
    target_type: str  # "transcription" | "ai_document"
    target_id: str


@router.post("/apply")
def apply_to_content(
    body: ApplyRequest,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Apply all enabled substitution rules to a transcription or AI document."""
    rules = (
        db.query(SubstitutionRule)
        .filter(SubstitutionRule.tenant_id == user.tenant_id, SubstitutionRule.is_enabled == True)
        .all()
    )
    if not rules:
        raise HTTPException(status_code=400, detail="Aucune regle active dans le dictionnaire")

    total_applied = 0

    if body.target_type == "transcription":
        job = db.query(TranscriptionJob).filter_by(id=body.target_id, tenant_id=user.tenant_id).first()
        if not job:
            raise HTTPException(status_code=404, detail="Transcription introuvable")
        segments = db.query(TranscriptionSegment).filter_by(job_id=job.id).all()
        for seg in segments:
            new_text, count = apply_substitutions(seg.text, rules)
            if count > 0:
                seg.text = new_text
                total_applied += count

    elif body.target_type == "ai_document":
        doc = db.query(AIDocument).filter_by(id=body.target_id, tenant_id=user.tenant_id).first()
        if not doc:
            raise HTTPException(status_code=404, detail="Document introuvable")
        if not doc.result_text:
            raise HTTPException(status_code=400, detail="Le document n'a pas encore de contenu")
        new_text, count = apply_substitutions(doc.result_text, rules)
        if count > 0:
            doc.result_text = new_text
            total_applied += count

    else:
        raise HTTPException(status_code=400, detail="target_type doit etre 'transcription' ou 'ai_document'")

    # Update usage counters
    if total_applied > 0:
        for rule in rules:
            rule.usage_count += 1
        db.commit()

    return {"rules_applied": total_applied, "target_type": body.target_type, "target_id": body.target_id}
