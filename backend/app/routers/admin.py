import json
import logging
import uuid

import requests
from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from sqlalchemy.orm import Session, joinedload

from app.config import settings
from app.database import get_db
from app.models import Tenant, TenantModule, User, AVAILABLE_MODULES, AuditLog, AIDocumentTemplate, ProcedureTemplate, ProcedureTemplateRole, ProcedureTemplateStep, AISetting, AI_USAGES, Sector
from app.models.announcement import Announcement, announcement_tenants
from app.models.transcription import TranscriptionJob
from app.models.preparatory import PreparatoryDossier
from app.models.consent import ConsentRequest, ConsentDetection
from app.models.contacts import Contact, ContactGroup
from app.models.procedures import Procedure
from app.schemas.tenant import TenantCreate, TenantUpdate, TenantResponse, TenantModuleUpdate
from app.schemas.user import UserCreate, UserUpdate, UserResponse
from app.schemas.announcement import AnnouncementCreate, AnnouncementUpdate, AnnouncementResponse
from app.services.auth import hash_password
from app.deps import require_super_admin
from app.services.ai_config import get_model_for_usage

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/admin", tags=["admin"])


# ── Tenants ───────────────────────────────────────────────────────────────────


@router.get("/tenants", response_model=list[TenantResponse])
def list_tenants(
    db: Session = Depends(get_db),
    _: User = Depends(require_super_admin),
):
    tenants = (
        db.query(Tenant)
        .options(joinedload(Tenant.modules))
        .order_by(Tenant.name)
        .all()
    )
    return tenants


@router.post("/tenants", response_model=TenantResponse, status_code=status.HTTP_201_CREATED)
def create_tenant(
    body: TenantCreate,
    db: Session = Depends(get_db),
    _: User = Depends(require_super_admin),
):
    # Check slug uniqueness
    if db.query(Tenant).filter(Tenant.slug == body.slug).first():
        raise HTTPException(status_code=409, detail=f"Le slug '{body.slug}' est déjà utilisé")

    # Validate parent
    if body.parent_id:
        parent = db.query(Tenant).filter(Tenant.id == body.parent_id).first()
        if not parent or parent.tenant_type != "group":
            raise HTTPException(status_code=400, detail="Le parent doit être un groupe existant")

    # Validate modules
    for m in body.modules:
        if m not in AVAILABLE_MODULES:
            raise HTTPException(status_code=400, detail=f"Module inconnu : '{m}'")

    tenant = Tenant(
        name=body.name,
        slug=body.slug.strip().lower().replace(" ", "-"),
        tenant_type=body.tenant_type,
        sector=body.sector,
        parent_id=body.parent_id,
        is_large=body.is_large,
    )
    db.add(tenant)
    db.flush()

    # Create module entries
    for m in body.modules:
        db.add(TenantModule(tenant_id=tenant.id, module_key=m, enabled=True))

    db.commit()
    db.refresh(tenant)
    return tenant


@router.patch("/tenants/{tenant_id}", response_model=TenantResponse)
def update_tenant(
    tenant_id: str,
    body: TenantUpdate,
    db: Session = Depends(get_db),
    _: User = Depends(require_super_admin),
):
    tenant = db.query(Tenant).options(joinedload(Tenant.modules)).filter(Tenant.id == tenant_id).first()
    if not tenant:
        raise HTTPException(status_code=404, detail="Organisation introuvable")

    if body.name is not None:
        tenant.name = body.name
    if body.slug is not None:
        existing = db.query(Tenant).filter(Tenant.slug == body.slug, Tenant.id != tenant_id).first()
        if existing:
            raise HTTPException(status_code=409, detail=f"Le slug '{body.slug}' est déjà utilisé")
        tenant.slug = body.slug
    if body.tenant_type is not None:
        tenant.tenant_type = body.tenant_type
    if body.sector is not None:
        tenant.sector = body.sector
    if body.parent_id is not None:
        tenant.parent_id = body.parent_id or None
    if body.is_large is not None:
        tenant.is_large = body.is_large
    if body.is_active is not None:
        tenant.is_active = body.is_active
    if body.whisper_initial_prompt is not None:
        tenant.whisper_initial_prompt = body.whisper_initial_prompt or None

    db.commit()
    db.refresh(tenant)
    return tenant


@router.delete("/tenants/{tenant_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_tenant(
    tenant_id: str,
    db: Session = Depends(get_db),
    _: User = Depends(require_super_admin),
):
    tenant = db.query(Tenant).filter(Tenant.id == tenant_id).first()
    if not tenant:
        raise HTTPException(status_code=404, detail="Organisation introuvable")

    # Detach children before deleting group
    if tenant.tenant_type == "group":
        db.query(Tenant).filter(Tenant.parent_id == tenant_id).update({"parent_id": None})

    # Clean up tables without ondelete CASCADE
    db.query(ConsentDetection).filter(ConsentDetection.tenant_id == tenant_id).delete()
    db.query(ConsentRequest).filter(ConsentRequest.tenant_id == tenant_id).delete()
    db.query(TranscriptionJob).filter(TranscriptionJob.tenant_id == tenant_id).delete()
    db.query(PreparatoryDossier).filter(PreparatoryDossier.tenant_id == tenant_id).delete()
    db.query(Contact).filter(Contact.tenant_id == tenant_id).delete()
    db.query(ContactGroup).filter(ContactGroup.tenant_id == tenant_id).delete()
    db.query(Procedure).filter(Procedure.tenant_id == tenant_id).delete()

    db.delete(tenant)
    db.commit()


# ── Tenant modules ────────────────────────────────────────────────────────────


@router.put("/tenants/{tenant_id}/modules")
def update_tenant_modules(
    tenant_id: str,
    body: list[TenantModuleUpdate],
    db: Session = Depends(get_db),
    _: User = Depends(require_super_admin),
):
    tenant = db.query(Tenant).filter(Tenant.id == tenant_id).first()
    if not tenant:
        raise HTTPException(status_code=404, detail="Organisation introuvable")

    for item in body:
        if item.module_key not in AVAILABLE_MODULES:
            raise HTTPException(status_code=400, detail=f"Module inconnu : '{item.module_key}'")

        existing = db.query(TenantModule).filter_by(tenant_id=tenant_id, module_key=item.module_key).first()
        if existing:
            existing.enabled = item.enabled
        else:
            db.add(TenantModule(tenant_id=tenant_id, module_key=item.module_key, enabled=item.enabled))

    db.commit()
    return {"message": "Modules mis à jour"}


@router.get("/modules")
def list_available_modules(_: User = Depends(require_super_admin)):
    return [{"key": k, "label": v} for k, v in AVAILABLE_MODULES.items()]


# ── Dedicated database ───────────────────────────────────────────────────────


@router.post("/tenants/{tenant_id}/provision-db")
def provision_dedicated_database(
    tenant_id: str,
    db: Session = Depends(get_db),
    _: User = Depends(require_super_admin),
):
    """Create a dedicated database for a tenant and migrate its data."""
    from app.services.dedicated_db import provision_dedicated_db

    tenant = db.query(Tenant).filter(Tenant.id == tenant_id).first()
    if not tenant:
        raise HTTPException(status_code=404, detail="Tenant introuvable")
    if tenant.db_mode == "dedicated":
        raise HTTPException(status_code=400, detail="Ce tenant a déjà une BDD dédiée")

    db_name = provision_dedicated_db(db, tenant)
    return {"message": f"BDD dédiée '{db_name}' créée avec succès", "db_name": db_name}


@router.post("/tenants/{tenant_id}/deprovision-db")
def deprovision_dedicated_database(
    tenant_id: str,
    db: Session = Depends(get_db),
    _: User = Depends(require_super_admin),
):
    """Move data back to shared DB and remove dedicated database assignment."""
    from app.services.dedicated_db import deprovision_dedicated_db

    tenant = db.query(Tenant).filter(Tenant.id == tenant_id).first()
    if not tenant:
        raise HTTPException(status_code=404, detail="Tenant introuvable")
    if tenant.db_mode != "dedicated":
        raise HTTPException(status_code=400, detail="Ce tenant utilise déjà la BDD partagée")

    deprovision_dedicated_db(db, tenant)
    return {"message": "Données rapatriées vers la BDD partagée"}


# ── Sectors CRUD ─────────────────────────────────────────────────────────────

def _sector_response(s: Sector) -> dict:
    return {
        "id": s.id,
        "key": s.key,
        "label": s.label,
        "description": s.description,
        "default_modules": json.loads(s.default_modules) if s.default_modules else [],
        "suggestions": json.loads(s.suggestions) if s.suggestions else None,
        "is_active": s.is_active,
    }


@router.get("/sectors")
def list_sectors(
    db: Session = Depends(get_db),
    _: User = Depends(require_super_admin),
):
    """Liste tous les secteurs."""
    sectors = db.query(Sector).order_by(Sector.label).all()
    return [_sector_response(s) for s in sectors]


class SectorCreate(BaseModel):
    key: str
    label: str
    description: str | None = None
    default_modules: list[str] = []


class SectorUpdate(BaseModel):
    label: str | None = None
    description: str | None = None
    default_modules: list[str] | None = None
    suggestions: dict | None = None
    is_active: bool | None = None


@router.post("/sectors", status_code=201)
def create_sector(
    body: SectorCreate,
    db: Session = Depends(get_db),
    _: User = Depends(require_super_admin),
):
    """Crée un nouveau secteur."""
    existing = db.query(Sector).filter_by(key=body.key).first()
    if existing:
        raise HTTPException(status_code=409, detail=f"Le secteur '{body.key}' existe déjà")
    sector = Sector(
        key=body.key,
        label=body.label,
        description=body.description,
        default_modules=json.dumps(body.default_modules, ensure_ascii=False),
    )
    db.add(sector)
    db.commit()
    db.refresh(sector)
    return _sector_response(sector)


@router.patch("/sectors/{sector_id}")
def update_sector(
    sector_id: str,
    body: SectorUpdate,
    db: Session = Depends(get_db),
    _: User = Depends(require_super_admin),
):
    """Met à jour un secteur."""
    sector = db.query(Sector).filter_by(id=sector_id).first()
    if not sector:
        raise HTTPException(status_code=404, detail="Secteur introuvable")
    if body.label is not None:
        sector.label = body.label
    if body.description is not None:
        sector.description = body.description
    if body.default_modules is not None:
        sector.default_modules = json.dumps(body.default_modules, ensure_ascii=False)
    if body.suggestions is not None:
        sector.suggestions = json.dumps(body.suggestions, ensure_ascii=False)
    if body.is_active is not None:
        sector.is_active = body.is_active
    db.commit()
    db.refresh(sector)
    return _sector_response(sector)


@router.delete("/sectors/{sector_id}", status_code=204)
def delete_sector(
    sector_id: str,
    db: Session = Depends(get_db),
    _: User = Depends(require_super_admin),
):
    """Supprime un secteur."""
    sector = db.query(Sector).filter_by(id=sector_id).first()
    if not sector:
        raise HTTPException(status_code=404, detail="Secteur introuvable")
    db.delete(sector)
    db.commit()


@router.post("/sectors/{sector_id}/generate-suggestions")
def generate_sector_suggestions(
    sector_id: str,
    db: Session = Depends(get_db),
    _: User = Depends(require_super_admin),
):
    """Génère des suggestions contextuelles par module via IA à partir de la description du secteur."""
    sector = db.query(Sector).filter_by(id=sector_id).first()
    if not sector:
        raise HTTPException(status_code=404, detail="Secteur introuvable")
    if not sector.description or not sector.description.strip():
        raise HTTPException(status_code=400, detail="Ajoutez une description au secteur avant de générer les suggestions.")

    prompt = f"""Tu es un assistant qui configure une application de gestion documentaire pour un secteur professionnel.
L'application permet de : transcrire des réunions, générer des documents IA (PV, comptes-rendus, synthèses), gérer des procédures collaboratives, et rechercher dans tous ces documents internes.

Secteur : {sector.label}
Description : {sector.description}

Génère des suggestions contextuelles au format JSON. Chaque suggestion doit être pertinente pour ce secteur.

Réponds UNIQUEMENT avec un objet JSON valide (pas de texte avant/après), avec cette structure exacte :
{{
  "search": ["question exemple 1", "question exemple 2", "question exemple 3"],
  "ai_documents": ["type de document 1", "type de document 2", "type de document 3"],
  "transcription": {{
    "speaker_labels": ["rôle 1", "rôle 2", "rôle 3"]
  }},
  "procedures": ["nom de procédure type 1", "nom de procédure type 2"]
}}

Règles IMPORTANTES :
- "search" : 3-5 exemples de questions que les utilisateurs poseraient pour RECHERCHER DANS LEURS PROPRES DOCUMENTS INTERNES (PV de réunions, transcriptions, comptes-rendus). PAS des questions de culture générale. Exemples du style : "Résume la dernière réunion de...", "Qui était présent lors de...", "Quelles décisions ont été prises sur..."
- "ai_documents" : 3-5 types de documents que l'IA pourrait générer dans ce secteur (PV, synthèse, compte-rendu, etc.)
- "transcription.speaker_labels" : 3-5 rôles de locuteurs typiques des réunions de ce secteur
- "procedures" : 2-4 noms de procédures collaboratives courantes dans ce secteur"""

    try:
        model = get_model_for_usage("sector_suggestions") or settings.ollama_default_model
        resp = requests.post(
            f"{settings.ollama_url}/api/generate",
            json={
                "model": model,
                "prompt": prompt,
                "stream": False,
                "options": {"temperature": 0.5, "num_predict": 1024},
            },
            timeout=60,
        )
        resp.raise_for_status()
        raw = resp.json().get("response", "").strip()

        # Extract JSON from response (handle markdown code blocks)
        if "```" in raw:
            raw = raw.split("```json")[-1].split("```")[0].strip() if "```json" in raw else raw.split("```")[1].split("```")[0].strip()

        suggestions = json.loads(raw)
    except json.JSONDecodeError:
        raise HTTPException(status_code=500, detail="L'IA n'a pas retourné un JSON valide. Réessayez.")
    except Exception as exc:
        logger.exception("[SECTOR] Suggestion generation failed: %s", exc)
        raise HTTPException(status_code=500, detail="Erreur lors de la génération des suggestions.")

    sector.suggestions = json.dumps(suggestions, ensure_ascii=False)
    db.commit()
    db.refresh(sector)
    return _sector_response(sector)


# ── Sector workflow templates ────────────────────────────────────────────────

@router.get("/sectors/{sector}/templates")
def list_sector_templates(
    sector: str,
    db: Session = Depends(get_db),
    _: User = Depends(require_super_admin),
):
    """Liste les templates de procédure sectoriels (master)."""
    templates = (
        db.query(ProcedureTemplate)
        .options(joinedload(ProcedureTemplate.roles), joinedload(ProcedureTemplate.steps))
        .filter(ProcedureTemplate.sector == sector, ProcedureTemplate.tenant_id.is_(None))
        .order_by(ProcedureTemplate.created_at.desc())
        .all()
    )
    return [_sector_template_response(t) for t in templates]


@router.post("/sectors/{sector}/templates", status_code=201)
def create_sector_template(
    sector: str,
    body: dict,
    db: Session = Depends(get_db),
    _: User = Depends(require_super_admin),
):
    """Crée un template de procédure sectoriel."""
    tpl = ProcedureTemplate(
        tenant_id=None,
        sector=sector,
        name=body["name"],
        description=body.get("description"),
    )
    db.add(tpl)
    db.flush()
    for i, role in enumerate(body.get("roles", [])):
        db.add(ProcedureTemplateRole(
            template_id=tpl.id,
            role_name=role["role_name"],
            order_index=i,
            invitation_delay_days=role.get("invitation_delay_days", 15),
            form_questions=json.dumps(role.get("form_questions", []), ensure_ascii=False),
        ))
    for i, step in enumerate(body.get("steps", [])):
        db.add(ProcedureTemplateStep(
            template_id=tpl.id,
            order_index=i,
            step_type=step["step_type"],
            label=step["label"],
            description=step.get("description"),
            config=json.dumps(step.get("config", {}), ensure_ascii=False) if step.get("config") else None,
            is_required=step.get("is_required", True),
        ))
    db.commit()
    db.refresh(tpl)
    return _sector_template_response(tpl)


@router.delete("/sectors/templates/{template_id}", status_code=204)
def delete_sector_template(
    template_id: str,
    db: Session = Depends(get_db),
    _: User = Depends(require_super_admin),
):
    """Supprime un template sectoriel."""
    tpl = db.query(ProcedureTemplate).filter(
        ProcedureTemplate.id == template_id,
        ProcedureTemplate.tenant_id.is_(None),
    ).first()
    if not tpl:
        raise HTTPException(status_code=404, detail="Template introuvable")
    db.delete(tpl)
    db.commit()


def _sector_template_response(tpl: ProcedureTemplate) -> dict:
    return {
        "id": tpl.id,
        "name": tpl.name,
        "description": tpl.description,
        "sector": tpl.sector,
        "is_active": tpl.is_active,
        "created_at": str(tpl.created_at),
        "updated_at": str(tpl.updated_at),
        "roles": [
            {
                "id": r.id,
                "role_name": r.role_name,
                "order_index": r.order_index,
                "invitation_delay_days": r.invitation_delay_days,
                "form_questions": json.loads(r.form_questions) if r.form_questions else [],
            }
            for r in (tpl.roles or [])
        ],
        "steps": [
            {
                "id": s.id,
                "order_index": s.order_index,
                "step_type": s.step_type,
                "label": s.label,
                "description": s.description,
                "config": json.loads(s.config) if s.config else None,
                "is_required": s.is_required,
            }
            for s in (tpl.steps or [])
        ],
    }


# ── Sector AI document templates ─────────────────────────────────────────────

def _sector_doc_template_response(t: AIDocumentTemplate) -> dict:
    return {
        "id": t.id,
        "name": t.name,
        "description": t.description,
        "document_type": t.document_type,
        "system_prompt": t.system_prompt,
        "user_prompt_template": t.user_prompt_template,
        "map_system_prompt": t.map_system_prompt,
        "temperature": t.temperature,
        "sector": t.sector,
        "is_active": t.is_active,
        "created_at": str(t.created_at),
        "updated_at": str(t.updated_at),
    }


@router.get("/sectors/{sector}/document-templates")
def list_sector_doc_templates(
    sector: str,
    db: Session = Depends(get_db),
    _: User = Depends(require_super_admin),
):
    """Liste les templates de documents IA sectoriels (master)."""
    templates = (
        db.query(AIDocumentTemplate)
        .filter(AIDocumentTemplate.sector == sector, AIDocumentTemplate.tenant_id.is_(None))
        .order_by(AIDocumentTemplate.created_at.desc())
        .all()
    )
    return [_sector_doc_template_response(t) for t in templates]


class SectorDocTemplateCreate(BaseModel):
    name: str
    description: str | None = None
    document_type: str = "custom"
    system_prompt: str
    user_prompt_template: str
    map_system_prompt: str | None = None
    temperature: float = 0.3


@router.post("/sectors/{sector}/document-templates", status_code=201)
def create_sector_doc_template(
    sector: str,
    body: SectorDocTemplateCreate,
    db: Session = Depends(get_db),
    _: User = Depends(require_super_admin),
):
    """Cree un template de document IA sectoriel."""
    tpl = AIDocumentTemplate(
        tenant_id=None,
        sector=sector,
        name=body.name,
        description=body.description,
        document_type=body.document_type,
        system_prompt=body.system_prompt,
        user_prompt_template=body.user_prompt_template,
        map_system_prompt=body.map_system_prompt,
        temperature=body.temperature,
    )
    db.add(tpl)
    db.commit()
    db.refresh(tpl)
    return _sector_doc_template_response(tpl)


class SectorDocTemplateUpdate(BaseModel):
    name: str | None = None
    description: str | None = None
    document_type: str | None = None
    system_prompt: str | None = None
    user_prompt_template: str | None = None
    map_system_prompt: str | None = None
    temperature: float | None = None
    is_active: bool | None = None


@router.patch("/sectors/document-templates/{template_id}")
def update_sector_doc_template(
    template_id: str,
    body: SectorDocTemplateUpdate,
    db: Session = Depends(get_db),
    _: User = Depends(require_super_admin),
):
    """Met a jour un template de document IA sectoriel."""
    tpl = db.query(AIDocumentTemplate).filter(
        AIDocumentTemplate.id == template_id,
        AIDocumentTemplate.tenant_id.is_(None),
    ).first()
    if not tpl:
        raise HTTPException(status_code=404, detail="Template introuvable")
    for field, value in body.model_dump(exclude_unset=True).items():
        setattr(tpl, field, value)
    db.commit()
    db.refresh(tpl)
    return _sector_doc_template_response(tpl)


@router.delete("/sectors/document-templates/{template_id}", status_code=204)
def delete_sector_doc_template(
    template_id: str,
    db: Session = Depends(get_db),
    _: User = Depends(require_super_admin),
):
    """Supprime un template de document IA sectoriel."""
    tpl = db.query(AIDocumentTemplate).filter(
        AIDocumentTemplate.id == template_id,
        AIDocumentTemplate.tenant_id.is_(None),
    ).first()
    if not tpl:
        raise HTTPException(status_code=404, detail="Template introuvable")
    db.delete(tpl)
    db.commit()


# ── Workflow generation via LLM ───────────────────────────────────────────────

_GENERATE_SYSTEM_PROMPT = """Tu es un expert en modélisation de workflows et procédures métier.
On te donne une description textuelle d'un processus / workflow.
Tu dois produire UN SEUL template de procédure avec des ÉTAPES SÉQUENTIELLES.

RÈGLE FONDAMENTALE : Un workflow = UN SEUL template avec des étapes ordonnées (steps).

Chaque étape a un TYPE parmi :
- "form" : formulaire à remplir par l'utilisateur (config.fields = [{id, label, type, required}])
  type de champ : "text", "textarea", "date", "file"
- "select_contacts" : sélection de contacts destinataires (config = {})
- "send_email" : envoi d'email aux contacts sélectionnés (config.subject_template, config.body_template)
- "collect_responses" : envoi de formulaires aux participants et attente des réponses
  (config.roles = [{role_name, invitation_delay_days, form_questions: [{id, label, type, required}]}])
- "generate_document" : génération d'un document IA (config = {})
- "upload_document" : upload d'un fichier (config.accepted_types = ["pdf","docx"])
- "manual" : étape manuelle / validation humaine (config.instructions = "...")

Le template contient :
- name : nom court du template
- description : description du workflow
- steps : liste ordonnée des étapes, chacune avec :
  - step_type : un des types ci-dessus
  - label : nom affiché de l'étape (ex: "Création de l'ODJ")
  - description : description optionnelle
  - config : configuration spécifique au type (voir ci-dessus)
  - is_required : true ou false

IMPORTANT : Retourne UNIQUEMENT du JSON valide, sans commentaire, sans markdown.
Le JSON doit être un tableau contenant UN SEUL template :
[{"name": "...", "description": "...", "steps": [...]}]"""


class WorkflowGenerateRequest(BaseModel):
    description: str
    sector: str


@router.post("/sectors/generate-workflow")
def generate_workflow(
    body: WorkflowGenerateRequest,
    db: Session = Depends(get_db),
    _: User = Depends(require_super_admin),
):
    """Génère un workflow structuré via LLM à partir d'une description textuelle."""
    sector_obj = db.query(Sector).filter_by(key=body.sector).first()
    sector_label = sector_obj.label if sector_obj else body.sector

    user_prompt = (
        f"Secteur d'activité : {sector_label}\n\n"
        f"Description du workflow :\n{body.description}\n\n"
        "Génère le JSON structuré des templates de procédure correspondants."
    )

    payload = {
        "model": get_model_for_usage("workflow_generation"),
        "system": _GENERATE_SYSTEM_PROMPT,
        "prompt": user_prompt,
        "stream": False,
        "keep_alive": 0,
        "options": {"temperature": 0.3},
    }

    try:
        resp = requests.post(f"{settings.ollama_url}/api/generate", json=payload, timeout=120)
        resp.raise_for_status()
        raw = resp.json().get("response", "")
    except requests.RequestException as exc:
        raise HTTPException(status_code=502, detail=f"Erreur Ollama : {exc}")

    # Parse JSON from LLM response (handle markdown code blocks)
    cleaned = raw.strip()
    if cleaned.startswith("```"):
        # Remove ```json ... ``` wrapper
        lines = cleaned.split("\n")
        lines = [l for l in lines if not l.strip().startswith("```")]
        cleaned = "\n".join(lines).strip()

    try:
        templates = json.loads(cleaned)
    except json.JSONDecodeError:
        logger.warning(f"[Workflow Gen] Failed to parse LLM response: {raw[:500]}")
        raise HTTPException(status_code=422, detail="Le LLM n'a pas retourné un JSON valide. Essayez de reformuler.")

    if isinstance(templates, dict):
        templates = [templates]

    # Assign unique IDs to form fields/questions if missing
    for tpl in templates:
        # New steps format
        for step in tpl.get("steps", []):
            config = step.get("config", {}) or {}
            # Form fields
            for i, f in enumerate(config.get("fields", [])):
                if not f.get("id"):
                    f["id"] = f"f{i+1}_{uuid.uuid4().hex[:6]}"
            # Collect_responses roles
            for role in config.get("roles", []):
                for i, q in enumerate(role.get("form_questions", [])):
                    if not q.get("id"):
                        q["id"] = f"q{i+1}_{uuid.uuid4().hex[:6]}"
        # Legacy roles format (backward compat)
        for role in tpl.get("roles", []):
            for i, q in enumerate(role.get("form_questions", [])):
                if not q.get("id"):
                    q["id"] = f"q{i+1}_{uuid.uuid4().hex[:6]}"

    return {"templates": templates}


# ── Provisioning ──────────────────────────────────────────────────────────────

# Templates par secteur
_SECTOR_SEEDS: dict[str, dict] = {
    "syndic_copro": {
        "procedure_templates": [
            {
                "name": "AG Copropriété",
                "description": "Assemblée générale annuelle ou extraordinaire de copropriété",
                "roles": [
                    {
                        "role_name": "Copropriétaire",
                        "order_index": 0,
                        "invitation_delay_days": 21,
                        "form_questions": [
                            {"id": "q1", "label": "Points que vous souhaitez inscrire à l'ordre du jour", "type": "textarea", "required": True, "options": []},
                            {"id": "q2", "label": "Questions sur la gestion ou les comptes de l'exercice", "type": "textarea", "required": False, "options": []},
                            {"id": "q3", "label": "Souhaitez-vous voter par correspondance ? Si oui, précisez vos positions sur les résolutions connues.", "type": "textarea", "required": False, "options": []},
                        ],
                    },
                    {
                        "role_name": "Conseil syndical",
                        "order_index": 1,
                        "invitation_delay_days": 30,
                        "form_questions": [
                            {"id": "q4", "label": "Points de contrôle ou observations sur la gestion de l'exercice", "type": "textarea", "required": False, "options": []},
                            {"id": "q5", "label": "Travaux ou prestations à inscrire à l'ordre du jour", "type": "textarea", "required": False, "options": []},
                        ],
                    },
                ],
            },
        ],
    },
    "collectivite": {
        "procedure_templates": [
            {
                "name": "Conseil municipal / séance délibérante",
                "description": "Séance du conseil municipal ou de tout organe délibérant d'une collectivité",
                "roles": [
                    {
                        "role_name": "Élu / Conseiller",
                        "order_index": 0,
                        "invitation_delay_days": 7,
                        "form_questions": [
                            {"id": "q1", "label": "Points que vous souhaitez ajouter à l'ordre du jour", "type": "textarea", "required": False, "options": []},
                            {"id": "q2", "label": "Questions ou observations sur les dossiers inscrits", "type": "textarea", "required": False, "options": []},
                        ],
                    },
                    {
                        "role_name": "Service instructeur",
                        "order_index": 1,
                        "invitation_delay_days": 10,
                        "form_questions": [
                            {"id": "q3", "label": "Éléments de contexte ou précisions sur les dossiers à délibérer", "type": "textarea", "required": False, "options": []},
                        ],
                    },
                ],
            },
        ],
    },
    "education_spe": {
        "procedure_templates": [
            {
                "name": "Réunion ESS / équipe pluridisciplinaire",
                "description": "Réunion d'équipe de suivi de scolarisation ou réunion pluridisciplinaire",
                "roles": [
                    {
                        "role_name": "Enseignant référent",
                        "order_index": 0,
                        "invitation_delay_days": 15,
                        "form_questions": [
                            {"id": "q1", "label": "Observations sur la scolarité et les apprentissages", "type": "textarea", "required": True, "options": []},
                            {"id": "q2", "label": "Aménagements mis en place et résultats observés", "type": "textarea", "required": False, "options": []},
                        ],
                    },
                    {
                        "role_name": "Famille / représentant légal",
                        "order_index": 1,
                        "invitation_delay_days": 15,
                        "form_questions": [
                            {"id": "q3", "label": "Observations de la famille sur l'évolution de l'enfant", "type": "textarea", "required": False, "options": []},
                            {"id": "q4", "label": "Attentes ou demandes particulières pour cette réunion", "type": "textarea", "required": False, "options": []},
                        ],
                    },
                    {
                        "role_name": "Professionnel spécialisé",
                        "order_index": 2,
                        "invitation_delay_days": 15,
                        "form_questions": [
                            {"id": "q5", "label": "Bilan de suivi et préconisations", "type": "textarea", "required": False, "options": []},
                        ],
                    },
                ],
            },
        ],
    },
    "chantier": {
        "procedure_templates": [
            {
                "name": "Réunion de chantier",
                "description": "Réunion de suivi de chantier avec les intervenants",
                "roles": [
                    {
                        "role_name": "Entreprise / Sous-traitant",
                        "order_index": 0,
                        "invitation_delay_days": 7,
                        "form_questions": [
                            {"id": "q1", "label": "Avancement des travaux depuis la dernière réunion", "type": "textarea", "required": True, "options": []},
                            {"id": "q2", "label": "Points bloquants ou réserves à signaler", "type": "textarea", "required": False, "options": []},
                            {"id": "q3", "label": "Besoins ou demandes pour la prochaine période", "type": "textarea", "required": False, "options": []},
                        ],
                    },
                    {
                        "role_name": "Maître d'œuvre / Conducteur de travaux",
                        "order_index": 1,
                        "invitation_delay_days": 7,
                        "form_questions": [
                            {"id": "q4", "label": "Points à aborder en réunion", "type": "textarea", "required": False, "options": []},
                        ],
                    },
                ],
            },
        ],
    },
    "sante": {
        "procedure_templates": [
            {
                "name": "Réunion pluridisciplinaire",
                "description": "Réunion d'équipe médico-sociale ou pluridisciplinaire",
                "roles": [
                    {
                        "role_name": "Professionnel de santé",
                        "order_index": 0,
                        "invitation_delay_days": 10,
                        "form_questions": [
                            {"id": "q1", "label": "Points à aborder concernant le patient/résident", "type": "textarea", "required": False, "options": []},
                            {"id": "q2", "label": "Observations cliniques ou sociales récentes", "type": "textarea", "required": False, "options": []},
                        ],
                    },
                    {
                        "role_name": "Coordinateur / Référent",
                        "order_index": 1,
                        "invitation_delay_days": 10,
                        "form_questions": [
                            {"id": "q3", "label": "Éléments de suivi et coordination à partager", "type": "textarea", "required": False, "options": []},
                        ],
                    },
                ],
            },
        ],
    },
}


@router.post("/tenants/{tenant_id}/provision")
def provision_tenant(
    tenant_id: str,
    db: Session = Depends(get_db),
    _: User = Depends(require_super_admin),
):
    """Provisionne les templates de procédures pour un tenant selon son secteur."""
    tenant = db.query(Tenant).filter(Tenant.id == tenant_id).first()
    if not tenant:
        raise HTTPException(status_code=404, detail="Organisation introuvable")
    if not tenant.sector:
        raise HTTPException(status_code=400, detail="Ce tenant n'a pas de secteur défini")

    created_proc_templates = []
    seed = _SECTOR_SEEDS.get(tenant.sector, {})

    # Templates de procédure : copier depuis les templates sectoriels en DB
    sector_templates = (
        db.query(ProcedureTemplate)
        .options(joinedload(ProcedureTemplate.roles))
        .filter(ProcedureTemplate.sector == tenant.sector, ProcedureTemplate.tenant_id.is_(None))
        .all()
    )

    if sector_templates:
        # Copier les templates sectoriels en DB vers le tenant
        for st in sector_templates:
            proc_tmpl = ProcedureTemplate(
                tenant_id=tenant_id,
                name=st.name,
                description=st.description,
            )
            db.add(proc_tmpl)
            db.flush()
            for role in st.roles:
                db.add(ProcedureTemplateRole(
                    template_id=proc_tmpl.id,
                    role_name=role.role_name,
                    order_index=role.order_index,
                    invitation_delay_days=role.invitation_delay_days,
                    form_questions=role.form_questions,
                ))
            for step in (st.steps or []):
                db.add(ProcedureTemplateStep(
                    template_id=proc_tmpl.id,
                    order_index=step.order_index,
                    step_type=step.step_type,
                    label=step.label,
                    description=step.description,
                    config=step.config,
                    is_required=step.is_required,
                ))
            created_proc_templates.append({"id": proc_tmpl.id, "name": proc_tmpl.name})
    else:
        # Fallback : utiliser les seeds hardcodées
        for pt in seed.get("procedure_templates", []):
            proc_tmpl = ProcedureTemplate(
                tenant_id=tenant_id,
                name=pt["name"],
                description=pt.get("description"),
            )
            db.add(proc_tmpl)
            db.flush()
            for role in pt.get("roles", []):
                db.add(ProcedureTemplateRole(
                    template_id=proc_tmpl.id,
                    role_name=role["role_name"],
                    order_index=role.get("order_index", 0),
                    invitation_delay_days=role.get("invitation_delay_days", 15),
                    form_questions=json.dumps(role.get("form_questions", []), ensure_ascii=False),
                ))
            created_proc_templates.append({"id": proc_tmpl.id, "name": proc_tmpl.name})

    db.commit()

    return {
        "sector": tenant.sector,
        "procedure_templates": created_proc_templates,
    }


# ── Users ─────────────────────────────────────────────────────────────────────


@router.get("/users", response_model=list[UserResponse])
def list_users(
    tenant_id: str | None = None,
    db: Session = Depends(get_db),
    admin: User = Depends(require_super_admin),
):
    q = db.query(User).options(joinedload(User.tenant).joinedload(Tenant.modules))
    if tenant_id:
        q = q.filter(User.tenant_id == tenant_id)
    return q.order_by(User.username).all()


@router.post("/users", response_model=UserResponse, status_code=status.HTTP_201_CREATED)
def create_user(
    body: UserCreate,
    db: Session = Depends(get_db),
    _: User = Depends(require_super_admin),
):
    # Verify tenant exists
    tenant = db.query(Tenant).filter(Tenant.id == body.tenant_id).first()
    if not tenant:
        raise HTTPException(status_code=404, detail="Organisation introuvable")

    # Check uniqueness
    existing = db.query(User).filter(User.username == body.username, User.tenant_id == body.tenant_id).first()
    if existing:
        raise HTTPException(status_code=409, detail=f"L'utilisateur '{body.username}' existe déjà dans cette organisation")

    user = User(
        username=body.username,
        email=body.email.strip().lower() if body.email else None,
        hashed_password=hash_password(body.password),
        display_name=body.display_name,
        role=body.role,
        tenant_id=body.tenant_id,
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    return user


@router.patch("/users/{user_id}", response_model=UserResponse)
def update_user(
    user_id: str,
    body: UserUpdate,
    db: Session = Depends(get_db),
    _: User = Depends(require_super_admin),
):
    user = (
        db.query(User)
        .options(joinedload(User.tenant).joinedload(Tenant.modules))
        .filter(User.id == user_id)
        .first()
    )
    if not user:
        raise HTTPException(status_code=404, detail="Utilisateur introuvable")

    if body.email is not None:
        user.email = body.email.strip().lower() if body.email else None
    if body.display_name is not None:
        user.display_name = body.display_name
    if body.role is not None:
        user.role = body.role
    if body.is_active is not None:
        user.is_active = body.is_active
    if body.password is not None:
        user.hashed_password = hash_password(body.password)

    db.commit()
    db.refresh(user)
    return user


@router.delete("/users/{user_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_user(
    user_id: str,
    db: Session = Depends(get_db),
    _: User = Depends(require_super_admin),
):
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="Utilisateur introuvable")
    db.delete(user)
    db.commit()


# ── AI Settings ──────────────────────────────────────────────────────────────


@router.get("/ai-settings")
def get_ai_settings(
    db: Session = Depends(get_db),
    _: User = Depends(require_super_admin),
):
    """Retourne la config IA : usages disponibles + modèle assigné + modèles Ollama."""
    # Current settings from DB
    db_settings = db.query(AISetting).all()
    settings_map = {s.usage_key: s.model_name for s in db_settings}

    # Build response with all known usages
    usages = []
    for key, label in AI_USAGES.items():
        usages.append({
            "usage_key": key,
            "label": label,
            "model_name": settings_map.get(key, None),  # None = use default
        })

    # Available Ollama models
    ollama_models = []
    try:
        resp = requests.get(f"{settings.ollama_url}/api/tags", timeout=5)
        resp.raise_for_status()
        ollama_models = [m["name"] for m in resp.json().get("models", [])]
    except Exception:
        pass

    return {
        "usages": usages,
        "ollama_models": ollama_models,
        "default_model": settings.ollama_default_model,
        "ollama_url": settings.ollama_url,
        "long_context_model": settings.ollama_long_context_model,
        "long_context_threshold": settings.ollama_long_context_threshold,
        "map_reduce": settings.ollama_map_reduce,
        "map_reduce_chunk_size": settings.ollama_map_reduce_chunk_size,
    }


class AISettingUpdate(BaseModel):
    usage_key: str
    model_name: str | None  # None = revert to default


class LongContextUpdate(BaseModel):
    long_context_model: str | None = None
    long_context_threshold: int | None = None
    map_reduce: bool | None = None
    map_reduce_chunk_size: int | None = None


@router.put("/ai-settings")
def update_ai_settings(
    body: list[AISettingUpdate],
    db: Session = Depends(get_db),
    _: User = Depends(require_super_admin),
):
    """Met à jour les affectations modèle par usage."""
    for item in body:
        if item.usage_key not in AI_USAGES:
            continue
        existing = db.query(AISetting).filter_by(usage_key=item.usage_key).first()
        if item.model_name:
            if existing:
                existing.model_name = item.model_name
            else:
                db.add(AISetting(usage_key=item.usage_key, model_name=item.model_name))
        else:
            # Remove override → use default
            if existing:
                db.delete(existing)
    db.commit()
    return {"message": "Configuration IA mise à jour"}


@router.put("/ai-settings/long-context")
def update_long_context_settings(
    body: LongContextUpdate,
    _: User = Depends(require_super_admin),
):
    """Met à jour les paramètres du modèle long contexte et map-reduce."""
    if body.long_context_model is not None:
        settings.ollama_long_context_model = body.long_context_model
    if body.long_context_threshold is not None:
        settings.ollama_long_context_threshold = max(1000, body.long_context_threshold)
    if body.map_reduce is not None:
        settings.ollama_map_reduce = body.map_reduce
    if body.map_reduce_chunk_size is not None:
        settings.ollama_map_reduce_chunk_size = max(1000, body.map_reduce_chunk_size)
    return {
        "long_context_model": settings.ollama_long_context_model,
        "long_context_threshold": settings.ollama_long_context_threshold,
        "map_reduce": settings.ollama_map_reduce,
        "map_reduce_chunk_size": settings.ollama_map_reduce_chunk_size,
    }


# ── Whisper / Transcription Settings ──────────────────────────────────────────

WHISPER_SETTINGS_KEYS = {
    "whisper_model": ("Modèle Whisper", "medium"),
    "whisper_language": ("Langue", "fr"),
    "whisper_beam_size": ("Beam size", "5"),
    "whisper_no_speech_threshold": ("Seuil no-speech", "0.45"),
    "whisper_temperature": ("Température (cascade)", "0.0,0.2,0.4,0.6,0.8,1.0"),
    "whisper_initial_prompt": ("Prompt initial (vocabulaire)", ""),
    "whisper_condition_on_previous_text": ("Conditionner sur texte précédent", "true"),
    "whisper_vad_min_silence_ms": ("VAD : silence min (ms)", "500"),
    "whisper_vad_speech_pad_ms": ("VAD : padding parole (ms)", "200"),
    "compute_type": ("Précision calcul", "float16"),
}


@router.get("/whisper-settings")
def get_whisper_settings(
    _: User = Depends(require_super_admin),
):
    """Retourne la configuration Whisper actuelle."""
    return {
        "settings": [
            {
                "key": key,
                "label": label,
                "value": str(getattr(settings, key, default)),
                "default": default,
            }
            for key, (label, default) in WHISPER_SETTINGS_KEYS.items()
        ],
        "device": settings.device,
    }


class WhisperSettingUpdate(BaseModel):
    key: str
    value: str


@router.put("/whisper-settings")
def update_whisper_settings(
    body: list[WhisperSettingUpdate],
    _: User = Depends(require_super_admin),
):
    """Met à jour les paramètres Whisper (appliqués au runtime)."""
    for item in body:
        if item.key not in WHISPER_SETTINGS_KEYS:
            continue
        if item.key in ("whisper_beam_size", "whisper_vad_min_silence_ms", "whisper_vad_speech_pad_ms"):
            try:
                setattr(settings, item.key, int(item.value))
            except ValueError:
                pass
        elif item.key == "whisper_no_speech_threshold":
            try:
                setattr(settings, item.key, float(item.value))
            except ValueError:
                pass
        elif item.key == "whisper_condition_on_previous_text":
            settings.whisper_condition_on_previous_text = item.value.lower() in ("true", "1", "yes")
        else:
            setattr(settings, item.key, item.value)

    # Force whisper model reload on next transcription
    from app.services.transcription import unload_whisper
    unload_whisper()

    return {"message": "Paramètres Whisper mis à jour"}


# ── Pyannote / Diarisation Settings ──────────────────────────────────────────

PYANNOTE_SETTINGS_KEYS = {
    "min_speakers": ("Nombre min de locuteurs (0 = auto)", "0"),
    "max_speakers": ("Nombre max de locuteurs (0 = auto)", "0"),
    "clustering_threshold": ("Seuil de clustering", "0.70"),
    "speaker_matching_threshold": ("Seuil matching enrollment", "0.75"),
}


@router.get("/pyannote-settings")
def get_pyannote_settings(
    _: User = Depends(require_super_admin),
):
    """Retourne la configuration Pyannote/Diarisation actuelle."""
    return {
        "settings": [
            {
                "key": key,
                "label": label,
                "value": str(getattr(settings, key, default)),
                "default": default,
            }
            for key, (label, default) in PYANNOTE_SETTINGS_KEYS.items()
        ],
        "pipeline_model": "pyannote/speaker-diarization-3.1",
    }


class PyannoteSettingUpdate(BaseModel):
    key: str
    value: str


@router.put("/pyannote-settings")
def update_pyannote_settings(
    body: list[PyannoteSettingUpdate],
    _: User = Depends(require_super_admin),
):
    """Met à jour les paramètres Pyannote (appliqués au runtime)."""
    reload_pipeline = False
    for item in body:
        if item.key not in PYANNOTE_SETTINGS_KEYS:
            continue
        if item.key in ("min_speakers", "max_speakers"):
            try:
                setattr(settings, item.key, int(item.value))
            except ValueError:
                pass
        elif item.key in ("clustering_threshold", "speaker_matching_threshold"):
            try:
                val = float(item.value)
                setattr(settings, item.key, val)
                if item.key == "clustering_threshold":
                    reload_pipeline = True
            except ValueError:
                pass

    if reload_pipeline:
        from app.services.diarisation import unload_diarization
        unload_diarization()

    return {"message": "Paramètres Pyannote mis à jour"}


# ── RAG / Search Settings ────────────────────────────────────────────────────

RAG_SETTINGS_KEYS = {
    "rag_chunk_size": ("Taille des chunks (caractères)", "1500"),
    "rag_chunk_overlap": ("Chevauchement des chunks", "200"),
    "rag_top_k": ("Nombre de résultats (top-k)", "10"),
    "embedding_model": ("Modèle d'embeddings", "nomic-embed-text"),
}


@router.get("/rag-settings")
def get_rag_settings(
    _: User = Depends(require_super_admin),
):
    """Retourne la configuration RAG actuelle."""
    return {
        "settings": [
            {
                "key": key,
                "label": label,
                "value": str(getattr(settings, key, default)),
                "default": default,
            }
            for key, (label, default) in RAG_SETTINGS_KEYS.items()
        ],
        "chroma_url": settings.chroma_url,
    }


class RAGSettingUpdate(BaseModel):
    key: str
    value: str


@router.put("/rag-settings")
def update_rag_settings(
    body: list[RAGSettingUpdate],
    _: User = Depends(require_super_admin),
):
    """Met à jour les paramètres RAG (appliqués au runtime)."""
    for item in body:
        if item.key not in RAG_SETTINGS_KEYS:
            continue
        # Update settings object at runtime
        if item.key in ("rag_chunk_size", "rag_chunk_overlap", "rag_top_k"):
            try:
                setattr(settings, item.key, int(item.value))
            except ValueError:
                pass
        elif item.key == "embedding_model":
            settings.embedding_model = item.value
    return {"message": "Paramètres RAG mis à jour"}


# ── Email / SMTP Settings ────────────────────────────────────────────────────

EMAIL_SETTINGS_KEYS = {
    "smtp_host": ("Serveur SMTP", ""),
    "smtp_port": ("Port SMTP", "587"),
    "smtp_user": ("Utilisateur SMTP", ""),
    "smtp_password": ("Mot de passe SMTP", ""),
    "smtp_from_email": ("Email expéditeur", "noreply@scribia.fr"),
    "smtp_from_name": ("Nom expéditeur", "ScribIA"),
    "smtp_use_tls": ("Utiliser TLS", "true"),
    "app_base_url": ("URL publique de l'application", "http://localhost:3001"),
}


@router.get("/email-settings")
def get_email_settings(
    _: User = Depends(require_super_admin),
):
    """Retourne la configuration Email/SMTP actuelle."""
    result = []
    for key, (label, default) in EMAIL_SETTINGS_KEYS.items():
        value = str(getattr(settings, key, default))
        # Mask password
        if key == "smtp_password" and value:
            value = "••••••••" if value else ""
        result.append({"key": key, "label": label, "value": value, "default": default})
    return {"settings": result}


class EmailSettingUpdate(BaseModel):
    key: str
    value: str


@router.put("/email-settings")
def update_email_settings(
    body: list[EmailSettingUpdate],
    db: Session = Depends(get_db),
    _: User = Depends(require_super_admin),
):
    """Met à jour les paramètres Email/SMTP (appliqués au runtime + persistés en DB)."""
    from app.models.system_settings import SystemSetting

    for item in body:
        if item.key not in EMAIL_SETTINGS_KEYS:
            continue
        # Skip masked password (no change)
        if item.key == "smtp_password" and item.value == "••••••••":
            continue
        # Apply to runtime
        if item.key == "smtp_port":
            try:
                settings.smtp_port = int(item.value)
            except ValueError:
                pass
        elif item.key == "smtp_use_tls":
            settings.smtp_use_tls = item.value.lower() in ("true", "1", "yes")
        else:
            setattr(settings, item.key, item.value)
        # Persist to DB
        existing = db.query(SystemSetting).filter(SystemSetting.key == item.key).first()
        if existing:
            existing.value = item.value
        else:
            db.add(SystemSetting(key=item.key, value=item.value))
    db.commit()
    return {"message": "Paramètres email mis à jour"}


@router.post("/email-settings/test")
def test_email_settings(
    _: User = Depends(require_super_admin),
):
    """Envoie un email de test pour vérifier la configuration SMTP."""
    from app.services.email import send_generic_email

    if not settings.smtp_host:
        return {"success": False, "error": "SMTP non configuré (smtp_host vide)"}

    from app.services.email import _info_box
    test_body = (
        '<p style="margin:0 0 14px 0;">'
        'Si vous recevez cet email, la configuration SMTP est <strong>correcte</strong>.'
        '</p>'
        + _info_box(
            '<span style="font-weight:600;">Configuration active</span><br/>'
            'Les emails de consentement, notifications et procédures pourront être envoyés.',
            bg="#eff6ff", border="#bfdbfe", color="#1e40af",
        )
    )
    success = send_generic_email(
        settings.smtp_from_email,
        "Test SMTP — ScribIA",
        test_body,
        title="Test SMTP",
    )
    if success:
        return {"success": True, "message": f"Email de test envoyé à {settings.smtp_from_email}"}
    return {"success": False, "error": "Échec de l'envoi — vérifiez les logs du serveur"}


# ── Audit logs ────────────────────────────────────────────────────────────────


@router.get("/audit-logs")
def list_audit_logs(
    limit: int = 200,
    db: Session = Depends(get_db),
    _: User = Depends(require_super_admin),
):
    logs = (
        db.query(AuditLog)
        .order_by(AuditLog.timestamp.desc())
        .limit(limit)
        .all()
    )
    return [
        {
            "id": l.id,
            "timestamp": str(l.timestamp),
            "user_id": l.user_id,
            "tenant_id": l.tenant_id,
            "action": l.action,
            "resource": l.resource,
            "resource_id": l.resource_id,
            "ip_address": l.ip_address,
        }
        for l in logs
    ]


# ── Announcements (Communications) ──────────────────────────────────────────


@router.get("/announcements", response_model=list[AnnouncementResponse])
def list_announcements(
    db: Session = Depends(get_db),
    _: User = Depends(require_super_admin),
):
    return db.query(Announcement).order_by(Announcement.created_at.desc()).all()


@router.post("/announcements", response_model=AnnouncementResponse, status_code=201)
def create_announcement(
    body: AnnouncementCreate,
    db: Session = Depends(get_db),
    user: User = Depends(require_super_admin),
):
    # Deactivate other announcements
    db.query(Announcement).filter(Announcement.is_active == True).update({"is_active": False})

    ann = Announcement(
        title=body.title,
        message=body.message,
        target_all=body.target_all,
    )

    if not body.target_all and body.tenant_ids:
        tenants = db.query(Tenant).filter(Tenant.id.in_(body.tenant_ids)).all()
        ann.tenants = tenants

    db.add(ann)
    db.commit()
    db.refresh(ann)
    return ann


@router.patch("/announcements/{announcement_id}", response_model=AnnouncementResponse)
def update_announcement(
    announcement_id: str,
    body: AnnouncementUpdate,
    db: Session = Depends(get_db),
    _: User = Depends(require_super_admin),
):
    ann = db.query(Announcement).filter_by(id=announcement_id).first()
    if not ann:
        raise HTTPException(status_code=404, detail="Annonce introuvable")

    if body.is_active is True:
        # Deactivate others when activating this one
        db.query(Announcement).filter(Announcement.id != announcement_id, Announcement.is_active == True).update({"is_active": False})

    for field in ("title", "message", "is_active", "target_all"):
        val = getattr(body, field)
        if val is not None:
            setattr(ann, field, val)

    if body.tenant_ids is not None:
        tenants = db.query(Tenant).filter(Tenant.id.in_(body.tenant_ids)).all() if body.tenant_ids else []
        ann.tenants = tenants

    db.commit()
    db.refresh(ann)
    return ann


@router.delete("/announcements/{announcement_id}", status_code=204)
def delete_announcement(
    announcement_id: str,
    db: Session = Depends(get_db),
    _: User = Depends(require_super_admin),
):
    ann = db.query(Announcement).filter_by(id=announcement_id).first()
    if not ann:
        raise HTTPException(status_code=404, detail="Annonce introuvable")
    db.delete(ann)
    db.commit()
