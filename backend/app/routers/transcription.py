"""Transcription router — upload, process, list, detail, export, SSE, delete."""

import asyncio
import json
import os
import uuid
from pathlib import Path

from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Query, status
from fastapi.responses import FileResponse, StreamingResponse, PlainTextResponse
from sqlalchemy.orm import Session

from app.config import settings
from app.database import get_db
from app.deps import get_current_user, require_module
from app.models import User
from app.models.transcription import TranscriptionJob, TranscriptionJobStatus, TranscriptionSegment
from app.schemas.transcription import (
    TranscriptionJobResponse,
    TranscriptionJobDetailResponse,
    TranscriptionJobUploadResponse,
)
from app.services.event_bus import event_bus
from app.services.transcription import get_audio_duration, run_job_in_thread

router = APIRouter(prefix="/transcription", tags=["transcription"])

ALLOWED_EXTENSIONS = {".mp3", ".wav", ".m4a", ".ogg", ".flac", ".webm", ".aac", ".wma", ".opus"}
MAX_SIZE = settings.max_audio_size_mb * 1024 * 1024


# ── List jobs ────────────────────────────────────────────────────────────────

@router.get("", response_model=list[TranscriptionJobResponse])
def list_jobs(
    user: User = Depends(get_current_user),
    _mod: bool = Depends(require_module("transcription")),
    db: Session = Depends(get_db),
):
    jobs = (
        db.query(TranscriptionJob)
        .filter(
            TranscriptionJob.tenant_id == user.tenant_id,
            TranscriptionJob.mode == "simple",
        )
        .order_by(TranscriptionJob.created_at.desc())
        .all()
    )
    return jobs


# ── Upload audio ─────────────────────────────────────────────────────────────

@router.post("/upload", response_model=TranscriptionJobUploadResponse, status_code=status.HTTP_201_CREATED)
async def upload_audio(
    file: UploadFile = File(...),
    user: User = Depends(get_current_user),
    _mod: bool = Depends(require_module("transcription")),
    db: Session = Depends(get_db),
):
    # Validate extension
    ext = Path(file.filename or "audio.webm").suffix.lower()
    if ext not in ALLOWED_EXTENSIONS:
        raise HTTPException(400, f"Format non supporté: {ext}")

    # Read file
    content = await file.read()
    if len(content) > MAX_SIZE:
        raise HTTPException(400, f"Fichier trop volumineux (max {settings.max_audio_size_mb} Mo)")

    # Save to disk
    audio_dir = Path(settings.audio_path) / user.tenant_id
    audio_dir.mkdir(parents=True, exist_ok=True)

    safe_filename = f"{uuid.uuid4().hex}{ext}"
    file_path = audio_dir / safe_filename
    file_path.write_bytes(content)

    # Get duration
    duration = get_audio_duration(file_path)

    # Create job
    title = Path(file.filename or "Enregistrement").stem
    job = TranscriptionJob(
        tenant_id=user.tenant_id,
        user_id=user.id,
        title=title,
        status=TranscriptionJobStatus.QUEUED,
        progress=0,
        audio_filename=safe_filename,
        original_filename=file.filename,
        duration_seconds=duration if duration > 0 else None,
        audio_file_size=len(content),
        language=settings.whisper_language,
    )
    db.add(job)
    db.commit()
    db.refresh(job)

    return TranscriptionJobUploadResponse(
        id=job.id,
        filename=file.filename or safe_filename,
        duration_seconds=job.duration_seconds,
        message="Fichier uploadé avec succès",
    )


# ── Start processing ─────────────────────────────────────────────────────────

@router.post("/{job_id}/process", response_model=TranscriptionJobResponse)
def start_processing(
    job_id: str,
    user: User = Depends(get_current_user),
    _mod: bool = Depends(require_module("transcription")),
    db: Session = Depends(get_db),
):
    job = (
        db.query(TranscriptionJob)
        .filter(TranscriptionJob.id == job_id, TranscriptionJob.tenant_id == user.tenant_id)
        .first()
    )
    if not job:
        raise HTTPException(404, "Job introuvable")

    if job.status not in (TranscriptionJobStatus.QUEUED, TranscriptionJobStatus.ERROR):
        raise HTTPException(400, f"Le job ne peut pas être lancé (statut: {job.status})")

    job.status = TranscriptionJobStatus.QUEUED
    job.progress = 5
    job.progress_message = "En file d'attente..."
    job.error_message = None
    db.commit()
    db.refresh(job)

    run_job_in_thread(job.id)

    return job


# ── Job detail ───────────────────────────────────────────────────────────────

@router.get("/{job_id}", response_model=TranscriptionJobDetailResponse)
def get_job(
    job_id: str,
    user: User = Depends(get_current_user),
    _mod: bool = Depends(require_module("transcription")),
    db: Session = Depends(get_db),
):
    job = (
        db.query(TranscriptionJob)
        .filter(TranscriptionJob.id == job_id, TranscriptionJob.tenant_id == user.tenant_id)
        .first()
    )
    if not job:
        raise HTTPException(404, "Job introuvable")
    return job


# ── Delete job ───────────────────────────────────────────────────────────────

@router.delete("/{job_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_job(
    job_id: str,
    user: User = Depends(get_current_user),
    _mod: bool = Depends(require_module("transcription")),
    db: Session = Depends(get_db),
):
    job = (
        db.query(TranscriptionJob)
        .filter(TranscriptionJob.id == job_id, TranscriptionJob.tenant_id == user.tenant_id)
        .first()
    )
    if not job:
        raise HTTPException(404, "Job introuvable")

    # Delete audio file
    if job.audio_filename:
        audio_path = Path(settings.audio_path) / job.tenant_id / job.audio_filename
        if audio_path.exists():
            audio_path.unlink()

    # Delete enrollment segments referencing this job's transcription segments
    from app.models.speaker import SpeakerEnrollmentSegment
    db.query(SpeakerEnrollmentSegment).filter(
        SpeakerEnrollmentSegment.job_id == job_id
    ).delete(synchronize_session=False)

    db.delete(job)
    db.commit()


# ── SSE events ───────────────────────────────────────────────────────────────

@router.get("/{job_id}/events")
async def stream_events(
    job_id: str,
    user: User = Depends(get_current_user),
    _mod: bool = Depends(require_module("transcription")),
    db: Session = Depends(get_db),
):
    # Verify job exists and belongs to tenant
    job = (
        db.query(TranscriptionJob)
        .filter(TranscriptionJob.id == job_id, TranscriptionJob.tenant_id == user.tenant_id)
        .first()
    )
    if not job:
        raise HTTPException(404, "Job introuvable")

    async def _generate():
        # Send current job status immediately so the client is never stale
        initial = {
            "status": job.status,
            "progress": job.progress,
            "progress_message": job.progress_message,
            "error_message": job.error_message,
        }
        yield f"data: {json.dumps(initial, default=str)}\n\n"
        if job.status in (TranscriptionJobStatus.COMPLETED, TranscriptionJobStatus.ERROR):
            return

        queue = event_bus.subscribe(job_id)
        try:
            while True:
                try:
                    data = await asyncio.wait_for(queue.get(), timeout=30)
                    yield f"data: {json.dumps(data, default=str)}\n\n"
                    if data.get("status") in ("completed", "error"):
                        break
                except asyncio.TimeoutError:
                    yield ": keepalive\n\n"
        finally:
            event_bus.unsubscribe(job_id, queue)

    return StreamingResponse(
        _generate(),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )


# ── Export ───────────────────────────────────────────────────────────────────

def _format_time_srt(seconds: float) -> str:
    h = int(seconds // 3600)
    m = int((seconds % 3600) // 60)
    s = int(seconds % 60)
    ms = int((seconds % 1) * 1000)
    return f"{h:02d}:{m:02d}:{s:02d},{ms:03d}"


def _format_time_vtt(seconds: float) -> str:
    h = int(seconds // 3600)
    m = int((seconds % 3600) // 60)
    s = int(seconds % 60)
    ms = int((seconds % 1) * 1000)
    return f"{h:02d}:{m:02d}:{s:02d}.{ms:03d}"


AUDIO_MIME = {
    ".mp3": "audio/mpeg", ".wav": "audio/wav", ".m4a": "audio/mp4",
    ".ogg": "audio/ogg", ".flac": "audio/flac", ".webm": "audio/webm",
    ".aac": "audio/aac", ".opus": "audio/opus",
}

@router.get("/{job_id}/audio")
def get_audio(
    job_id: str,
    user: User = Depends(get_current_user),
    _mod: bool = Depends(require_module("transcription")),
    db: Session = Depends(get_db),
):
    job = (
        db.query(TranscriptionJob)
        .filter(TranscriptionJob.id == job_id, TranscriptionJob.tenant_id == user.tenant_id)
        .first()
    )
    if not job or not job.audio_filename:
        raise HTTPException(404, "Fichier audio introuvable")
    audio_path = Path(settings.audio_path) / job.tenant_id / job.audio_filename
    if not audio_path.exists():
        raise HTTPException(404, "Fichier audio introuvable")
    ext = Path(job.audio_filename).suffix.lower()
    media_type = AUDIO_MIME.get(ext, "application/octet-stream")
    return FileResponse(audio_path, media_type=media_type)


@router.get("/{job_id}/export")
def export_transcription(
    job_id: str,
    format: str = Query("txt", regex="^(txt|srt|vtt)$"),
    user: User = Depends(get_current_user),
    _mod: bool = Depends(require_module("transcription")),
    db: Session = Depends(get_db),
):
    job = (
        db.query(TranscriptionJob)
        .filter(TranscriptionJob.id == job_id, TranscriptionJob.tenant_id == user.tenant_id)
        .first()
    )
    if not job:
        raise HTTPException(404, "Job introuvable")
    if job.status != TranscriptionJobStatus.COMPLETED:
        raise HTTPException(400, "La transcription n'est pas terminée")

    segments = (
        db.query(TranscriptionSegment)
        .filter(TranscriptionSegment.job_id == job_id)
        .order_by(TranscriptionSegment.order_index)
        .all()
    )

    safe_title = job.title.replace(" ", "_")[:50]

    if format == "txt":
        content = "\n".join(seg.text for seg in segments)
        return PlainTextResponse(
            content,
            headers={"Content-Disposition": f'attachment; filename="{safe_title}.txt"'},
        )

    if format == "srt":
        lines = []
        for i, seg in enumerate(segments, 1):
            lines.append(str(i))
            lines.append(f"{_format_time_srt(seg.start_time)} --> {_format_time_srt(seg.end_time)}")
            lines.append(seg.text)
            lines.append("")
        return PlainTextResponse(
            "\n".join(lines),
            headers={"Content-Disposition": f'attachment; filename="{safe_title}.srt"'},
        )

    # VTT
    lines = ["WEBVTT", ""]
    for seg in segments:
        lines.append(f"{_format_time_vtt(seg.start_time)} --> {_format_time_vtt(seg.end_time)}")
        lines.append(seg.text)
        lines.append("")
    return PlainTextResponse(
        "\n".join(lines),
        headers={"Content-Disposition": f'attachment; filename="{safe_title}.vtt"'},
    )
