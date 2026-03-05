"""
Router Procédures — workflow collaboratif de réunion.
Prefix: /procedures

Routes publiques (sans auth) :
  GET  /forms/{token}         — affiche le formulaire participant
  POST /forms/{token}/submit  — soumet les réponses
"""

import json
import uuid
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session, joinedload

from app.database import get_db
from app.deps import get_current_user, require_module, require_super_admin
from app.models.procedures import (
    Procedure, ProcedureParticipant, ProcedureTemplate,
    ProcedureTemplateRole, ProcedureStatus,
)
from app.models.user import User
from app.schemas.procedures import (
    FormQuestion, FormSubmit, ParticipantCreate, ParticipantResponse,
    ProcedureCreate, ProcedureDetailResponse, ProcedureListResponse,
    ProcedureTemplateCreate, ProcedureTemplateResponse, ProcedureTemplateUpdate,
    ProcedureUpdate, PublicFormResponse, TemplateRoleCreate, TemplateRoleResponse,
)
from app.models.ai_documents import AIDocument, AIDocumentTemplate
from app.services.ai_documents import enqueue_generation
from app.services.audit import log_action

router = APIRouter(prefix="/procedures", tags=["procedures"])

# Router séparé pour les formulaires publics (pas de require_module ni auth)
public_router = APIRouter(prefix="/forms", tags=["procedures-public"])


def _resolve_tenant_id(user: User, tenant_id: str | None) -> str:
    """Super admin can target any tenant; others use their own."""
    if tenant_id and user.is_super_admin:
        return tenant_id
    return user.tenant_id


# ── Helpers ───────────────────────────────────────────────────────────────────

def _parse_questions(raw: str | None) -> list[FormQuestion]:
    if not raw:
        return []
    try:
        return [FormQuestion(**q) for q in json.loads(raw)]
    except Exception:
        return []


def _dump_questions(questions: list[FormQuestion]) -> str:
    return json.dumps([q.model_dump() for q in questions])


def _to_participant(p: ProcedureParticipant) -> ParticipantResponse:
    return ParticipantResponse(
        id=p.id,
        name=p.name,
        email=p.email,
        role_name=p.role_name,
        form_questions=_parse_questions(p.form_questions),
        form_token=p.form_token,
        invited_at=p.invited_at,
        responded_at=p.responded_at,
        responses=json.loads(p.responses) if p.responses else None,
        created_at=p.created_at,
    )


def _to_detail(proc: Procedure) -> ProcedureDetailResponse:
    return ProcedureDetailResponse(
        id=proc.id,
        title=proc.title,
        description=proc.description,
        status=proc.status,
        meeting_date=proc.meeting_date,
        template_id=proc.template_id,
        document_template_id=proc.document_template_id,
        source_session_id=proc.source_session_id,
        ai_document_id=proc.ai_document_id,
        created_at=proc.created_at,
        updated_at=proc.updated_at,
        participants=[_to_participant(p) for p in proc.participants],
    )


def _get_procedure(db: Session, procedure_id: str, tenant_id: str) -> Procedure:
    proc = (
        db.query(Procedure)
        .options(joinedload(Procedure.participants))
        .filter(Procedure.id == procedure_id, Procedure.tenant_id == tenant_id)
        .first()
    )
    if not proc:
        raise HTTPException(status_code=404, detail="Procédure introuvable")
    return proc


def _to_template_response(tpl: ProcedureTemplate) -> ProcedureTemplateResponse:
    return ProcedureTemplateResponse(
        id=tpl.id,
        name=tpl.name,
        description=tpl.description,
        document_template_id=tpl.document_template_id,
        is_active=tpl.is_active,
        created_at=tpl.created_at,
        updated_at=tpl.updated_at,
        roles=[
            TemplateRoleResponse(
                id=r.id,
                role_name=r.role_name,
                order_index=r.order_index,
                form_questions=_parse_questions(r.form_questions),
                invitation_delay_days=r.invitation_delay_days,
            )
            for r in tpl.roles
        ],
    )


# ── Templates ─────────────────────────────────────────────────────────────────

@router.get(
    "/templates",
    response_model=list[ProcedureTemplateResponse],
    dependencies=[Depends(require_module("procedures"))],
)
def list_templates(
    tenant_id: str | None = None,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    tid = _resolve_tenant_id(user, tenant_id)
    templates = (
        db.query(ProcedureTemplate)
        .options(joinedload(ProcedureTemplate.roles))
        .filter(ProcedureTemplate.tenant_id == tid)
        .order_by(ProcedureTemplate.created_at.desc())
        .all()
    )
    return [_to_template_response(t) for t in templates]


@router.post(
    "/templates",
    response_model=ProcedureTemplateResponse,
    status_code=201,
    dependencies=[Depends(require_module("procedures"))],
)
def create_template(
    body: ProcedureTemplateCreate,
    tenant_id: str | None = None,
    user: User = Depends(require_super_admin),
    db: Session = Depends(get_db),
):
    tid = _resolve_tenant_id(user, tenant_id)
    tpl = ProcedureTemplate(
        tenant_id=tid,
        name=body.name,
        description=body.description,
        document_template_id=body.document_template_id,
    )
    db.add(tpl)
    db.flush()
    for i, role in enumerate(body.roles):
        db.add(ProcedureTemplateRole(
            template_id=tpl.id,
            role_name=role.role_name,
            order_index=i,
            form_questions=_dump_questions(role.form_questions),
            invitation_delay_days=role.invitation_delay_days,
        ))
    log_action(db, "create_procedure_template", user_id=user.id, tenant_id=tid,
               resource="procedure_template", details={"name": body.name})
    db.commit()
    db.refresh(tpl)
    return _to_template_response(tpl)


@router.patch(
    "/templates/{template_id}",
    response_model=ProcedureTemplateResponse,
    dependencies=[Depends(require_module("procedures"))],
)
def update_template(
    template_id: str,
    body: ProcedureTemplateUpdate,
    user: User = Depends(require_super_admin),
    db: Session = Depends(get_db),
):
    tpl = (
        db.query(ProcedureTemplate)
        .options(joinedload(ProcedureTemplate.roles))
        .filter(ProcedureTemplate.id == template_id)
        .first()
    )
    if not tpl:
        raise HTTPException(status_code=404, detail="Template introuvable")
    for field, value in body.model_dump(exclude_unset=True).items():
        setattr(tpl, field, value)
    db.commit()
    db.refresh(tpl)
    return _to_template_response(tpl)


@router.delete(
    "/templates/{template_id}",
    status_code=204,
    dependencies=[Depends(require_module("procedures"))],
)
def delete_template(
    template_id: str,
    user: User = Depends(require_super_admin),
    db: Session = Depends(get_db),
):
    tpl = db.query(ProcedureTemplate).filter(
        ProcedureTemplate.id == template_id,
    ).first()
    if not tpl:
        raise HTTPException(status_code=404, detail="Template introuvable")
    db.delete(tpl)
    db.commit()


@router.post(
    "/templates/{template_id}/roles",
    response_model=TemplateRoleResponse,
    status_code=201,
    dependencies=[Depends(require_module("procedures"))],
)
def add_template_role(
    template_id: str,
    body: TemplateRoleCreate,
    user: User = Depends(require_super_admin),
    db: Session = Depends(get_db),
):
    tpl = db.query(ProcedureTemplate).filter(
        ProcedureTemplate.id == template_id,
    ).first()
    if not tpl:
        raise HTTPException(status_code=404, detail="Template introuvable")
    max_idx = db.query(ProcedureTemplateRole).filter_by(template_id=template_id).count()
    role = ProcedureTemplateRole(
        template_id=template_id,
        role_name=body.role_name,
        order_index=max_idx,
        form_questions=_dump_questions(body.form_questions),
        invitation_delay_days=body.invitation_delay_days,
    )
    db.add(role)
    db.commit()
    db.refresh(role)
    return TemplateRoleResponse(
        id=role.id,
        role_name=role.role_name,
        order_index=role.order_index,
        form_questions=_parse_questions(role.form_questions),
        invitation_delay_days=role.invitation_delay_days,
    )


@router.delete(
    "/templates/{template_id}/roles/{role_id}",
    status_code=204,
    dependencies=[Depends(require_module("procedures"))],
)
def delete_template_role(
    template_id: str,
    role_id: str,
    user: User = Depends(require_super_admin),
    db: Session = Depends(get_db),
):
    tpl = db.query(ProcedureTemplate).filter(
        ProcedureTemplate.id == template_id,
    ).first()
    if not tpl:
        raise HTTPException(status_code=404, detail="Template introuvable")
    role = db.query(ProcedureTemplateRole).filter_by(id=role_id, template_id=template_id).first()
    if not role:
        raise HTTPException(status_code=404, detail="Rôle introuvable")
    db.delete(role)
    db.commit()


# ── Procédures ────────────────────────────────────────────────────────────────

@router.get(
    "",
    response_model=list[ProcedureListResponse],
    dependencies=[Depends(require_module("procedures"))],
)
def list_procedures(
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    procs = (
        db.query(Procedure)
        .options(joinedload(Procedure.participants))
        .filter(Procedure.tenant_id == user.tenant_id)
        .order_by(Procedure.created_at.desc())
        .all()
    )
    return [
        ProcedureListResponse(
            id=p.id,
            title=p.title,
            description=p.description,
            status=p.status,
            meeting_date=p.meeting_date,
            participant_count=len(p.participants),
            response_count=sum(1 for pt in p.participants if pt.responded_at),
            created_at=p.created_at,
            updated_at=p.updated_at,
        )
        for p in procs
    ]


@router.post(
    "",
    response_model=ProcedureDetailResponse,
    status_code=201,
    dependencies=[Depends(require_module("procedures"))],
)
def create_procedure(
    body: ProcedureCreate,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    proc = Procedure(
        tenant_id=user.tenant_id,
        user_id=user.id,
        template_id=body.template_id,
        title=body.title,
        description=body.description,
        meeting_date=body.meeting_date,
        document_template_id=body.document_template_id,
    )
    db.add(proc)
    db.flush()

    # Si créée depuis un template, pré-peupler les rôles comme participants vides
    if body.template_id:
        tpl = (
            db.query(ProcedureTemplate)
            .options(joinedload(ProcedureTemplate.roles))
            .filter(ProcedureTemplate.id == body.template_id, ProcedureTemplate.tenant_id == user.tenant_id)
            .first()
        )
        if tpl:
            if not proc.document_template_id and tpl.document_template_id:
                proc.document_template_id = tpl.document_template_id

    log_action(db, "create_procedure", user_id=user.id, tenant_id=user.tenant_id,
               resource="procedure", details={"title": body.title})
    db.commit()
    db.refresh(proc)
    return _to_detail(proc)


@router.get(
    "/{procedure_id}",
    response_model=ProcedureDetailResponse,
    dependencies=[Depends(require_module("procedures"))],
)
def get_procedure(
    procedure_id: str,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    return _to_detail(_get_procedure(db, procedure_id, user.tenant_id))


@router.patch(
    "/{procedure_id}",
    response_model=ProcedureDetailResponse,
    dependencies=[Depends(require_module("procedures"))],
)
def update_procedure(
    procedure_id: str,
    body: ProcedureUpdate,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    proc = _get_procedure(db, procedure_id, user.tenant_id)
    valid_statuses = {s.value for s in ProcedureStatus}
    updates = body.model_dump(exclude_unset=True)
    if "status" in updates and updates["status"] not in valid_statuses:
        raise HTTPException(status_code=400, detail=f"Statut invalide. Valeurs : {', '.join(valid_statuses)}")
    for field, value in updates.items():
        setattr(proc, field, value)
    db.commit()
    db.refresh(proc)
    return _to_detail(proc)


@router.delete(
    "/{procedure_id}",
    status_code=204,
    dependencies=[Depends(require_module("procedures"))],
)
def delete_procedure(
    procedure_id: str,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    proc = _get_procedure(db, procedure_id, user.tenant_id)
    log_action(db, "delete_procedure", user_id=user.id, tenant_id=user.tenant_id,
               resource="procedure", resource_id=procedure_id, details={"title": proc.title})
    db.delete(proc)
    db.commit()


# ── Participants ──────────────────────────────────────────────────────────────

@router.post(
    "/{procedure_id}/participants",
    response_model=ParticipantResponse,
    status_code=201,
    dependencies=[Depends(require_module("procedures"))],
)
def add_participant(
    procedure_id: str,
    body: ParticipantCreate,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    _get_procedure(db, procedure_id, user.tenant_id)
    participant = ProcedureParticipant(
        procedure_id=procedure_id,
        name=body.name,
        email=body.email,
        role_name=body.role_name,
        form_questions=_dump_questions(body.form_questions),
        form_token=str(uuid.uuid4()),
    )
    db.add(participant)
    db.commit()
    db.refresh(participant)
    return _to_participant(participant)


@router.delete(
    "/{procedure_id}/participants/{participant_id}",
    status_code=204,
    dependencies=[Depends(require_module("procedures"))],
)
def delete_participant(
    procedure_id: str,
    participant_id: str,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    _get_procedure(db, procedure_id, user.tenant_id)
    participant = db.query(ProcedureParticipant).filter_by(
        id=participant_id, procedure_id=procedure_id,
    ).first()
    if not participant:
        raise HTTPException(status_code=404, detail="Participant introuvable")
    db.delete(participant)
    db.commit()


@router.post(
    "/{procedure_id}/send-invitations",
    response_model=ProcedureDetailResponse,
    dependencies=[Depends(require_module("procedures"))],
)
def send_invitations(
    procedure_id: str,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Marque tous les participants comme invités (envoi email à implémenter)."""
    proc = _get_procedure(db, procedure_id, user.tenant_id)
    now = datetime.now(timezone.utc)
    for participant in proc.participants:
        if not participant.invited_at:
            participant.invited_at = now
    proc.status = ProcedureStatus.COLLECTING
    log_action(db, "send_invitations", user_id=user.id, tenant_id=user.tenant_id,
               resource="procedure", resource_id=procedure_id)
    db.commit()
    db.refresh(proc)
    return _to_detail(proc)


# ── Génération de convocation ─────────────────────────────────────────────────

@router.post(
    "/{procedure_id}/generate-convocation",
    dependencies=[Depends(require_module("procedures"))],
)
def generate_convocation(
    procedure_id: str,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Génère la convocation à partir des réponses collectées et de la date de réunion."""
    proc = _get_procedure(db, procedure_id, user.tenant_id)

    if not proc.document_template_id:
        raise HTTPException(status_code=400, detail="Aucun template de document configuré pour cette procédure")

    tpl = db.query(AIDocumentTemplate).filter_by(
        id=proc.document_template_id, tenant_id=user.tenant_id,
    ).first()
    if not tpl:
        raise HTTPException(status_code=404, detail="Template de document introuvable")

    # Construire l'ordre du jour à partir des réponses des participants
    odj_lines = []
    for p in proc.participants:
        if not p.responses:
            continue
        try:
            responses = json.loads(p.responses)
            questions = json.loads(p.form_questions) if p.form_questions else []
        except Exception:
            continue
        for q in questions:
            q_id = q.get("id", "")
            val = responses.get(q_id, "")
            if val:
                odj_lines.append(f"• [{p.role_name} — {p.name}] {q.get('label', '')}: {val}")

    odj_text = "\n".join(odj_lines) if odj_lines else "(aucune réponse collectée)"

    date_str = ""
    if proc.meeting_date:
        date_str = proc.meeting_date.strftime("%d/%m/%Y à %H:%M")

    # Snapshot du template
    snapshot = {
        "name": tpl.name,
        "document_type": tpl.document_type,
        "system_prompt": tpl.system_prompt,
        "user_prompt_template": tpl.user_prompt_template,
        "ollama_model": tpl.ollama_model,
        "temperature": tpl.temperature,
    }

    extra_context = {
        "title": proc.title,
        "date": date_str,
        "documents_text": odj_text,
    }

    doc = AIDocument(
        tenant_id=user.tenant_id,
        user_id=user.id,
        template_id=tpl.id,
        template_snapshot=json.dumps(snapshot, ensure_ascii=False),
        title=f"Convocation — {proc.title}",
        status="pending",
        extra_context=json.dumps(extra_context, ensure_ascii=False),
    )
    db.add(doc)
    db.flush()

    # Lier le document à la procédure
    proc.ai_document_id = doc.id
    log_action(db, "generate_convocation", user_id=user.id, tenant_id=user.tenant_id,
               resource="procedure", resource_id=procedure_id)
    db.commit()
    db.refresh(doc)

    enqueue_generation(doc.id)
    return {"id": doc.id, "title": doc.title, "status": doc.status}


# ── Formulaires publics (sans authentification) ───────────────────────────────

@public_router.get("/{token}", response_model=PublicFormResponse)
def get_public_form(token: str, db: Session = Depends(get_db)):
    participant = (
        db.query(ProcedureParticipant)
        .filter_by(form_token=token)
        .first()
    )
    if not participant:
        raise HTTPException(status_code=404, detail="Formulaire introuvable")
    proc = db.query(Procedure).filter_by(id=participant.procedure_id).first()
    return PublicFormResponse(
        procedure_title=proc.title if proc else "",
        participant_name=participant.name,
        role_name=participant.role_name,
        form_questions=_parse_questions(participant.form_questions),
        already_responded=participant.responded_at is not None,
    )


@public_router.post("/{token}/submit", status_code=200)
def submit_public_form(token: str, body: FormSubmit, db: Session = Depends(get_db)):
    participant = (
        db.query(ProcedureParticipant)
        .filter_by(form_token=token)
        .first()
    )
    if not participant:
        raise HTTPException(status_code=404, detail="Formulaire introuvable")
    participant.responses = json.dumps(body.responses)
    participant.responded_at = datetime.now(timezone.utc)
    db.commit()
    return {"message": "Réponses enregistrées. Merci !"}
