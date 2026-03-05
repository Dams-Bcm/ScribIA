"""
Router Phases préparatoires — dossiers, points de l'ordre du jour, documents.
Prefix: /preparatory-phases
"""

import uuid
import shutil
from pathlib import Path

from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Query, status
from fastapi.responses import FileResponse
from sqlalchemy.orm import Session, joinedload

from app.config import settings
from app.database import get_db
from app.deps import get_current_user, require_module
from app.models.user import User
from app.models.preparatory import PreparatoryDossier, AgendaPoint, DossierDocument, DossierStatus
from app.schemas.preparatory import (
    DossierCreate, DossierUpdate, DossierListResponse, DossierDetailResponse,
    AgendaPointCreate, AgendaPointUpdate, AgendaPointResponse,
    DossierDocumentResponse, ReorderPointsRequest,
)
from app.services.audit import log_action

router = APIRouter(
    prefix="/preparatory-phases",
    tags=["preparatory-phases"],
    dependencies=[Depends(require_module("preparatory_phases"))],
)

MAX_DOC_BYTES = settings.max_doc_size_mb * 1024 * 1024
ALLOWED_EXTENSIONS = {
    ".pdf", ".doc", ".docx", ".xls", ".xlsx", ".ppt", ".pptx",
    ".odt", ".ods", ".odp", ".txt", ".csv",
    ".jpg", ".jpeg", ".png", ".gif", ".webp",
}


def _get_dossier(db: Session, dossier_id: str, tenant_id: str) -> PreparatoryDossier:
    dossier = (
        db.query(PreparatoryDossier)
        .options(joinedload(PreparatoryDossier.agenda_points), joinedload(PreparatoryDossier.documents))
        .filter(PreparatoryDossier.id == dossier_id, PreparatoryDossier.tenant_id == tenant_id)
        .first()
    )
    if not dossier:
        raise HTTPException(status_code=404, detail="Dossier introuvable")
    return dossier


def _docs_dir(tenant_id: str, dossier_id: str) -> Path:
    return Path(settings.prep_docs_path) / tenant_id / dossier_id


def _to_detail(dossier: PreparatoryDossier) -> DossierDetailResponse:
    return DossierDetailResponse(
        id=dossier.id,
        title=dossier.title,
        description=dossier.description,
        meeting_date=dossier.meeting_date,
        status=dossier.status,
        created_at=dossier.created_at,
        updated_at=dossier.updated_at,
        agenda_points=[AgendaPointResponse.model_validate(p) for p in dossier.agenda_points],
        documents=[DossierDocumentResponse.model_validate(d) for d in dossier.documents],
    )


# ── Dossiers ──────────────────────────────────────────────────────────────────

@router.get("", response_model=list[DossierListResponse])
def list_dossiers(
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    dossiers = (
        db.query(PreparatoryDossier)
        .options(joinedload(PreparatoryDossier.agenda_points), joinedload(PreparatoryDossier.documents))
        .filter(PreparatoryDossier.tenant_id == user.tenant_id)
        .order_by(PreparatoryDossier.created_at.desc())
        .all()
    )
    return [
        DossierListResponse(
            id=d.id, title=d.title, description=d.description,
            meeting_date=d.meeting_date, status=d.status,
            point_count=len(d.agenda_points), document_count=len(d.documents),
            created_at=d.created_at, updated_at=d.updated_at,
        )
        for d in dossiers
    ]


@router.post("", response_model=DossierDetailResponse, status_code=201)
def create_dossier(
    body: DossierCreate,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    dossier = PreparatoryDossier(
        tenant_id=user.tenant_id,
        user_id=user.id,
        title=body.title,
        description=body.description,
        meeting_date=body.meeting_date,
    )
    db.add(dossier)
    log_action(db, "create_dossier", user_id=user.id, tenant_id=user.tenant_id,
               resource="dossier", details={"title": body.title})
    db.commit()
    db.refresh(dossier)
    return _to_detail(dossier)


@router.get("/{dossier_id}", response_model=DossierDetailResponse)
def get_dossier(
    dossier_id: str,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    return _to_detail(_get_dossier(db, dossier_id, user.tenant_id))


@router.patch("/{dossier_id}", response_model=DossierDetailResponse)
def update_dossier(
    dossier_id: str,
    body: DossierUpdate,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    dossier = _get_dossier(db, dossier_id, user.tenant_id)
    valid_statuses = {s.value for s in DossierStatus}
    updates = body.model_dump(exclude_unset=True)
    if "status" in updates and updates["status"] not in valid_statuses:
        raise HTTPException(status_code=400, detail=f"Statut invalide. Valeurs : {', '.join(valid_statuses)}")
    for field, value in updates.items():
        setattr(dossier, field, value)
    log_action(db, "update_dossier", user_id=user.id, tenant_id=user.tenant_id,
               resource="dossier", resource_id=dossier_id)
    db.commit()
    db.refresh(dossier)
    return _to_detail(dossier)


@router.delete("/{dossier_id}", status_code=204)
def delete_dossier(
    dossier_id: str,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    dossier = _get_dossier(db, dossier_id, user.tenant_id)
    # Delete files on disk
    docs_dir = _docs_dir(user.tenant_id, dossier_id)
    if docs_dir.exists():
        shutil.rmtree(docs_dir)
    log_action(db, "delete_dossier", user_id=user.id, tenant_id=user.tenant_id,
               resource="dossier", resource_id=dossier_id, details={"title": dossier.title})
    db.delete(dossier)
    db.commit()


# ── Agenda Points ─────────────────────────────────────────────────────────────

@router.post("/{dossier_id}/points", response_model=AgendaPointResponse, status_code=201)
def add_point(
    dossier_id: str,
    body: AgendaPointCreate,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    dossier = _get_dossier(db, dossier_id, user.tenant_id)
    max_idx = max((p.order_index for p in dossier.agenda_points), default=-1)
    point = AgendaPoint(
        dossier_id=dossier.id,
        order_index=max_idx + 1,
        title=body.title,
        description=body.description,
    )
    db.add(point)
    db.commit()
    db.refresh(point)
    return AgendaPointResponse.model_validate(point)


@router.patch("/{dossier_id}/points/{point_id}", response_model=AgendaPointResponse)
def update_point(
    dossier_id: str,
    point_id: str,
    body: AgendaPointUpdate,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    _get_dossier(db, dossier_id, user.tenant_id)  # ownership check
    point = db.query(AgendaPoint).filter(AgendaPoint.id == point_id, AgendaPoint.dossier_id == dossier_id).first()
    if not point:
        raise HTTPException(status_code=404, detail="Point introuvable")
    for field, value in body.model_dump(exclude_unset=True).items():
        setattr(point, field, value)
    db.commit()
    db.refresh(point)
    return AgendaPointResponse.model_validate(point)


@router.delete("/{dossier_id}/points/{point_id}", status_code=204)
def delete_point(
    dossier_id: str,
    point_id: str,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    _get_dossier(db, dossier_id, user.tenant_id)  # ownership check
    point = db.query(AgendaPoint).filter(AgendaPoint.id == point_id, AgendaPoint.dossier_id == dossier_id).first()
    if not point:
        raise HTTPException(status_code=404, detail="Point introuvable")
    db.delete(point)
    db.commit()


@router.put("/{dossier_id}/points/reorder", response_model=list[AgendaPointResponse])
def reorder_points(
    dossier_id: str,
    body: ReorderPointsRequest,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    dossier = _get_dossier(db, dossier_id, user.tenant_id)
    point_map = {p.id: p for p in dossier.agenda_points}
    for idx, pid in enumerate(body.point_ids):
        if pid not in point_map:
            raise HTTPException(status_code=400, detail=f"Point {pid} n'appartient pas à ce dossier")
        point_map[pid].order_index = idx
    db.commit()
    # Re-fetch ordered
    points = db.query(AgendaPoint).filter(AgendaPoint.dossier_id == dossier_id).order_by(AgendaPoint.order_index).all()
    return [AgendaPointResponse.model_validate(p) for p in points]


# ── Documents ─────────────────────────────────────────────────────────────────

@router.post("/{dossier_id}/documents", response_model=DossierDocumentResponse, status_code=201)
async def upload_document(
    dossier_id: str,
    file: UploadFile = File(...),
    agenda_point_id: str | None = Query(None),
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    _get_dossier(db, dossier_id, user.tenant_id)  # ownership check

    # Validate agenda_point_id if provided
    if agenda_point_id:
        point = db.query(AgendaPoint).filter(AgendaPoint.id == agenda_point_id, AgendaPoint.dossier_id == dossier_id).first()
        if not point:
            raise HTTPException(status_code=400, detail="Point de l'ordre du jour introuvable")

    # Validate extension
    ext = Path(file.filename or "").suffix.lower()
    if ext not in ALLOWED_EXTENSIONS:
        raise HTTPException(status_code=400, detail=f"Type de fichier non autorisé. Extensions acceptées : {', '.join(sorted(ALLOWED_EXTENSIONS))}")

    # Read file
    content = await file.read()
    if len(content) > MAX_DOC_BYTES:
        raise HTTPException(status_code=400, detail=f"Fichier trop volumineux (max {settings.max_doc_size_mb} Mo)")

    # Save to disk
    stored_name = f"{uuid.uuid4().hex}{ext}"
    docs_dir = _docs_dir(user.tenant_id, dossier_id)
    docs_dir.mkdir(parents=True, exist_ok=True)
    (docs_dir / stored_name).write_bytes(content)

    # DB record
    doc = DossierDocument(
        dossier_id=dossier_id,
        agenda_point_id=agenda_point_id,
        original_filename=file.filename or "document",
        stored_filename=stored_name,
        file_size=len(content),
        content_type=file.content_type,
    )
    db.add(doc)
    log_action(db, "upload_document", user_id=user.id, tenant_id=user.tenant_id,
               resource="dossier_document", details={"filename": file.filename, "dossier_id": dossier_id})
    db.commit()
    db.refresh(doc)
    return DossierDocumentResponse.model_validate(doc)


@router.get("/{dossier_id}/documents/{doc_id}/download")
def download_document(
    dossier_id: str,
    doc_id: str,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    _get_dossier(db, dossier_id, user.tenant_id)  # ownership check
    doc = db.query(DossierDocument).filter(DossierDocument.id == doc_id, DossierDocument.dossier_id == dossier_id).first()
    if not doc:
        raise HTTPException(status_code=404, detail="Document introuvable")
    file_path = _docs_dir(user.tenant_id, dossier_id) / doc.stored_filename
    if not file_path.exists():
        raise HTTPException(status_code=404, detail="Fichier introuvable sur le disque")
    return FileResponse(
        path=str(file_path),
        filename=doc.original_filename,
        media_type=doc.content_type or "application/octet-stream",
    )


@router.delete("/{dossier_id}/documents/{doc_id}", status_code=204)
def delete_document(
    dossier_id: str,
    doc_id: str,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    _get_dossier(db, dossier_id, user.tenant_id)  # ownership check
    doc = db.query(DossierDocument).filter(DossierDocument.id == doc_id, DossierDocument.dossier_id == dossier_id).first()
    if not doc:
        raise HTTPException(status_code=404, detail="Document introuvable")
    file_path = _docs_dir(user.tenant_id, dossier_id) / doc.stored_filename
    if file_path.exists():
        file_path.unlink()
    log_action(db, "delete_document", user_id=user.id, tenant_id=user.tenant_id,
               resource="dossier_document", resource_id=doc_id, details={"filename": doc.original_filename})
    db.delete(doc)
    db.commit()
