import json
import logging
import uuid

import requests
from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from sqlalchemy.orm import Session, joinedload

from app.config import settings
from app.database import get_db
from app.models import Tenant, TenantModule, User, AVAILABLE_MODULES, AuditLog, AIDocumentTemplate, ProcedureTemplate, ProcedureTemplateRole
from app.schemas.tenant import TenantCreate, TenantUpdate, TenantResponse, TenantModuleUpdate
from app.schemas.user import UserCreate, UserUpdate, UserResponse
from app.services.auth import hash_password
from app.deps import require_super_admin

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
        .options(joinedload(ProcedureTemplate.roles))
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
    }


# ── Workflow generation via LLM ───────────────────────────────────────────────

_GENERATE_SYSTEM_PROMPT = """Tu es un expert en modélisation de workflows et procédures métier.
On te donne une description textuelle d'un processus / workflow.
Tu dois produire un JSON structuré représentant un ou plusieurs templates de procédure.

Chaque template contient :
- name : nom court du template
- description : description du template
- roles : liste de rôles participants, chacun avec :
  - role_name : nom du rôle
  - invitation_delay_days : délai d'invitation en jours avant la réunion
  - form_questions : liste de questions du formulaire de collecte, chacune avec :
    - id : identifiant unique (ex: "q1", "q2"...)
    - label : texte de la question
    - type : "textarea" ou "text"
    - required : true ou false
    - options : [] (vide)

IMPORTANT : Retourne UNIQUEMENT du JSON valide, sans commentaire, sans markdown, sans texte avant ou après.
Le JSON doit être un tableau de templates : [{"name": ..., "roles": [...]}, ...]"""


class WorkflowGenerateRequest(BaseModel):
    description: str
    sector: str


@router.post("/sectors/generate-workflow")
def generate_workflow(
    body: WorkflowGenerateRequest,
    _: User = Depends(require_super_admin),
):
    """Génère un workflow structuré via LLM à partir d'une description textuelle."""
    sector_label = body.sector
    for sp in [("syndic_copro", "Syndic de copropriété"), ("collectivite", "Collectivité territoriale"),
               ("education_spe", "Éducation spécialisée / MDPH"), ("chantier", "Gestion de chantier"),
               ("sante", "Santé / Médico-social")]:
        if sp[0] == body.sector:
            sector_label = sp[1]
            break

    user_prompt = (
        f"Secteur d'activité : {sector_label}\n\n"
        f"Description du workflow :\n{body.description}\n\n"
        "Génère le JSON structuré des templates de procédure correspondants."
    )

    payload = {
        "model": settings.ollama_default_model,
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

    # Assign unique IDs to questions if missing
    for tpl in templates:
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
        "document_templates": [
            {
                "name": "Convocation AG",
                "document_type": "custom",
                "description": "Convocation à l'assemblée générale de copropriété (délai légal 21 jours)",
                "system_prompt": "Tu es un assistant juridique spécialisé en droit de la copropriété. Rédige des convocations formelles, précises et conformes à la loi du 10 juillet 1965 et au décret du 17 mars 1967.",
                "user_prompt_template": "Rédige une convocation à l'assemblée générale pour la copropriété suivante.\n\nTitre : {titre}\nDate de réunion : {date}\nOrganisation : {organisation}\n\nPoints d'ordre du jour collectés auprès des participants :\n{documents}\n\nLa convocation doit mentionner :\n- Lieu, date et heure de la réunion\n- L'ordre du jour complet et structuré\n- La possibilité de voter par correspondance\n- Les modalités de consultation des pièces\n- Le délai légal de convocation (21 jours minimum)\n\nStyle : formel, juridique.",
                "temperature": 0.2,
            },
            {
                "name": "PV d'AG",
                "document_type": "pv",
                "description": "Procès-verbal d'assemblée générale de copropriété",
                "system_prompt": "Tu es un assistant juridique spécialisé en droit de la copropriété. Rédige des procès-verbaux d'AG conformes aux exigences légales : structure formelle, résolutions clairement identifiées, résultats de vote mentionnés.",
                "user_prompt_template": "Rédige le procès-verbal de l'assemblée générale à partir de la transcription et des informations ci-dessous.\n\nTitre : {titre}\nDate : {date}\nOrganisation : {organisation}\n\nTranscription de la réunion :\n{transcription}\n\nInformations collectées en amont :\n{documents}\n\nStructure attendue du PV :\n1. En-tête (immeuble, date, heure d'ouverture/clôture)\n2. Présences et pouvoirs (présents, représentés, absents)\n3. Résolutions : pour chaque point de l'ordre du jour → intitulé, débat résumé, résultat du vote (pour/contre/abstention), résolution adoptée ou rejetée\n4. Questions diverses\n5. Clôture de séance\n6. Mentions légales (notification dans le mois, contestation sous 2 mois)\n\nStyle : juridique, neutre, factuel.",
                "temperature": 0.2,
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
        "document_templates": [
            {
                "name": "Compte-rendu de séance",
                "document_type": "summary",
                "description": "Compte-rendu de séance d'un organe délibérant",
                "system_prompt": "Tu es un assistant spécialisé en rédaction administrative pour les collectivités territoriales. Rédige des comptes-rendus clairs, neutres et structurés.",
                "user_prompt_template": "Rédige le compte-rendu de la séance à partir de la transcription.\n\nTitre : {titre}\nDate : {date}\nOrganisation : {organisation}\n\nTranscription :\n{transcription}\n\nInformations collectées :\n{documents}\n\nStructure : présences, points abordés, décisions prises, prochaines étapes.",
                "temperature": 0.3,
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
        "document_templates": [
            {
                "name": "Compte-rendu ESS",
                "document_type": "summary",
                "description": "Compte-rendu de réunion d'équipe de suivi de scolarisation",
                "system_prompt": "Tu es un assistant spécialisé en éducation inclusive et accompagnement des élèves à besoins particuliers. Rédige des comptes-rendus bienveillants, précis et centrés sur l'élève.",
                "user_prompt_template": "Rédige le compte-rendu de la réunion ESS à partir de la transcription et des informations collectées.\n\nTitre : {titre}\nDate : {date}\nOrganisation : {organisation}\n\nTranscription :\n{transcription}\n\nInformations collectées auprès des participants :\n{documents}\n\nStructure : participants présents, bilan de la période, points abordés, décisions et aménagements retenus, objectifs pour la prochaine période, prochaine échéance.",
                "temperature": 0.3,
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
        "document_templates": [
            {
                "name": "Compte-rendu de chantier",
                "document_type": "summary",
                "description": "Compte-rendu de réunion de chantier",
                "system_prompt": "Tu es un assistant spécialisé en gestion de chantier. Rédige des comptes-rendus précis, factuels et structurés pour le suivi de travaux.",
                "user_prompt_template": "Rédige le compte-rendu de la réunion de chantier à partir de la transcription.\n\nTitre : {titre}\nDate : {date}\nOrganisation : {organisation}\n\nTranscription :\n{transcription}\n\nInformations collectées auprès des intervenants :\n{documents}\n\nStructure : intervenants présents, avancement par lot, réserves et points bloquants, décisions prises, actions à mener avant la prochaine réunion, date de la prochaine réunion.",
                "temperature": 0.2,
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
        "document_templates": [
            {
                "name": "Compte-rendu de réunion pluridisciplinaire",
                "document_type": "summary",
                "description": "Compte-rendu de réunion d'équipe médico-sociale",
                "system_prompt": "Tu es un assistant spécialisé en rédaction médico-sociale. Rédige des comptes-rendus professionnels, bienveillants et respectueux de la confidentialité.",
                "user_prompt_template": "Rédige le compte-rendu de la réunion pluridisciplinaire à partir de la transcription.\n\nTitre : {titre}\nDate : {date}\nOrganisation : {organisation}\n\nTranscription :\n{transcription}\n\nInformations collectées :\n{documents}\n\nStructure : participants, situation présentée, échanges synthétisés, décisions et orientations retenues, prochaines étapes.",
                "temperature": 0.3,
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
    """Provisionne les templates de procédures et de documents IA pour un tenant selon son secteur.

    1. Copie les templates de procédure sectoriels (DB) vers le tenant
    2. Copie les templates de documents IA depuis les seeds hardcodées (fallback)
    """
    tenant = db.query(Tenant).filter(Tenant.id == tenant_id).first()
    if not tenant:
        raise HTTPException(status_code=404, detail="Organisation introuvable")
    if not tenant.sector:
        raise HTTPException(status_code=400, detail="Ce tenant n'a pas de secteur défini")

    created_proc_templates = []
    created_doc_templates = []

    # 1. Templates de documents IA (depuis les seeds hardcodées pour l'instant)
    seed = _SECTOR_SEEDS.get(tenant.sector, {})
    for dt in seed.get("document_templates", []):
        doc_tmpl = AIDocumentTemplate(
            tenant_id=tenant_id,
            name=dt["name"],
            description=dt.get("description"),
            document_type=dt.get("document_type", "custom"),
            system_prompt=dt["system_prompt"],
            user_prompt_template=dt["user_prompt_template"],
            temperature=dt.get("temperature", 0.3),
        )
        db.add(doc_tmpl)
        db.flush()
        created_doc_templates.append({"id": doc_tmpl.id, "name": doc_tmpl.name})

    first_doc_id = created_doc_templates[0]["id"] if created_doc_templates else None

    # 2. Templates de procédure : copier depuis les templates sectoriels en DB
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
                document_template_id=first_doc_id,
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
            created_proc_templates.append({"id": proc_tmpl.id, "name": proc_tmpl.name})
    else:
        # Fallback : utiliser les seeds hardcodées
        for pt in seed.get("procedure_templates", []):
            proc_tmpl = ProcedureTemplate(
                tenant_id=tenant_id,
                name=pt["name"],
                description=pt.get("description"),
                document_template_id=first_doc_id,
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
        "document_templates": created_doc_templates,
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
