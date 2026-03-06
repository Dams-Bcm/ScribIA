"""Router — Module Dictionnaire (regles de substitution).

Prefixe : /dictionary
Module requis : dictionary
"""

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from app.database import get_db
from app.deps import get_current_user, require_module
from app.models.substitution import SubstitutionRule
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
