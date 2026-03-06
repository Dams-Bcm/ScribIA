"""Diarisation router — upload, process, list, detail, export, SSE, delete, rename speaker."""

import asyncio
import json
import uuid
from pathlib import Path

from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Query, status
from fastapi.responses import FileResponse, StreamingResponse, PlainTextResponse
from sqlalchemy.orm import Session

from app.config import settings
from app.database import get_db
from app.deps import get_current_user, require_module
from app.models import User
from app.models.transcription import (
    TranscriptionJob, TranscriptionJobStatus, TranscriptionSegment,
    DiarisationSpeaker,
)
from app.schemas.diarisation import (
    DiarisationJobResponse,
    DiarisationJobDetailResponse,
    DiarisationJobUploadResponse,
    SpeakerRenameRequest,
    EnrollFromSegmentRequest,
    ValidateCollectiveConsentRequest,
)
from app.deps import require_super_admin
from app.services.event_bus import event_bus
from app.services.transcription import get_audio_duration
from app.services.diarisation import run_diarisation_job_in_thread

router = APIRouter(prefix="/diarisation", tags=["diarisation"])

ALLOWED_EXTENSIONS = {".mp3", ".wav", ".m4a", ".ogg", ".flac", ".webm", ".aac", ".wma", ".opus"}
MAX_SIZE = settings.max_audio_size_mb * 1024 * 1024


# ── List jobs ────────────────────────────────────────────────────────────────

@router.get("", response_model=list[DiarisationJobResponse])
def list_jobs(
    user: User = Depends(get_current_user),
    _mod: bool = Depends(require_module("transcription_diarisation")),
    db: Session = Depends(get_db),
):
    jobs = (
        db.query(TranscriptionJob)
        .filter(
            TranscriptionJob.tenant_id == user.tenant_id,
            TranscriptionJob.mode == "diarisation",
        )
        .order_by(TranscriptionJob.created_at.desc())
        .all()
    )
    return jobs


# ── Upload audio ─────────────────────────────────────────────────────────────

@router.post("/upload", response_model=DiarisationJobUploadResponse, status_code=status.HTTP_201_CREATED)
async def upload_audio(
    file: UploadFile = File(...),
    user: User = Depends(get_current_user),
    _mod: bool = Depends(require_module("transcription_diarisation")),
    db: Session = Depends(get_db),
):
    ext = Path(file.filename or "audio.webm").suffix.lower()
    if ext not in ALLOWED_EXTENSIONS:
        raise HTTPException(400, f"Format non supporté: {ext}")

    content = await file.read()
    if len(content) > MAX_SIZE:
        raise HTTPException(400, f"Fichier trop volumineux (max {settings.max_audio_size_mb} Mo)")

    audio_dir = Path(settings.audio_path) / user.tenant_id
    audio_dir.mkdir(parents=True, exist_ok=True)

    safe_filename = f"{uuid.uuid4().hex}{ext}"
    file_path = audio_dir / safe_filename
    file_path.write_bytes(content)

    duration = get_audio_duration(file_path)

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
        mode="diarisation",
    )
    db.add(job)
    db.commit()
    db.refresh(job)

    return DiarisationJobUploadResponse(
        id=job.id,
        filename=file.filename or safe_filename,
        duration_seconds=job.duration_seconds,
        message="Fichier uploadé avec succès",
    )


# ── Start processing ─────────────────────────────────────────────────────────

@router.post("/{job_id}/process", response_model=DiarisationJobResponse)
def start_processing(
    job_id: str,
    user: User = Depends(get_current_user),
    _mod: bool = Depends(require_module("transcription_diarisation")),
    db: Session = Depends(get_db),
):
    job = (
        db.query(TranscriptionJob)
        .filter(
            TranscriptionJob.id == job_id,
            TranscriptionJob.tenant_id == user.tenant_id,
            TranscriptionJob.mode == "diarisation",
        )
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

    run_diarisation_job_in_thread(job.id)

    return job


# ── Job detail ───────────────────────────────────────────────────────────────

@router.get("/{job_id}", response_model=DiarisationJobDetailResponse)
def get_job(
    job_id: str,
    user: User = Depends(get_current_user),
    _mod: bool = Depends(require_module("transcription_diarisation")),
    db: Session = Depends(get_db),
):
    job = (
        db.query(TranscriptionJob)
        .filter(
            TranscriptionJob.id == job_id,
            TranscriptionJob.tenant_id == user.tenant_id,
        )
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
    _mod: bool = Depends(require_module("transcription_diarisation")),
    db: Session = Depends(get_db),
):
    job = (
        db.query(TranscriptionJob)
        .filter(
            TranscriptionJob.id == job_id,
            TranscriptionJob.tenant_id == user.tenant_id,
        )
        .first()
    )
    if not job:
        raise HTTPException(404, "Job introuvable")

    if job.audio_filename:
        audio_path = Path(settings.audio_path) / job.tenant_id / job.audio_filename
        if audio_path.exists():
            audio_path.unlink()

    # Clear FK references from speaker tables before deleting segments
    from app.models.speaker import SpeakerProfile, SpeakerEnrollmentSegment
    from app.models.transcription import TranscriptionSegment

    seg_ids = [s.id for s in db.query(TranscriptionSegment.id).filter(
        TranscriptionSegment.job_id == job_id
    ).all()]

    if seg_ids:
        db.query(SpeakerProfile).filter(
            SpeakerProfile.consent_segment_id.in_(seg_ids)
        ).update({SpeakerProfile.consent_segment_id: None}, synchronize_session=False)

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
    _mod: bool = Depends(require_module("transcription_diarisation")),
    db: Session = Depends(get_db),
):
    job = (
        db.query(TranscriptionJob)
        .filter(
            TranscriptionJob.id == job_id,
            TranscriptionJob.tenant_id == user.tenant_id,
        )
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


# ── Rename speaker ──────────────────────────────────────────────────────────

@router.patch("/{job_id}/speakers/{speaker_id}")
def rename_speaker(
    job_id: str,
    speaker_id: str,
    body: SpeakerRenameRequest,
    user: User = Depends(get_current_user),
    _mod: bool = Depends(require_module("transcription_diarisation")),
    db: Session = Depends(get_db),
):
    job = (
        db.query(TranscriptionJob)
        .filter(
            TranscriptionJob.id == job_id,
            TranscriptionJob.tenant_id == user.tenant_id,
        )
        .first()
    )
    if not job:
        raise HTTPException(404, "Job introuvable")

    speaker = (
        db.query(DiarisationSpeaker)
        .filter(
            DiarisationSpeaker.job_id == job_id,
            DiarisationSpeaker.speaker_id == speaker_id,
        )
        .first()
    )
    if not speaker:
        raise HTTPException(404, "Speaker introuvable")

    speaker.display_name = body.display_name

    # Also update speaker_label on all segments for this speaker
    db.query(TranscriptionSegment).filter(
        TranscriptionSegment.job_id == job_id,
        TranscriptionSegment.speaker_id == speaker_id,
    ).update({"speaker_label": body.display_name})

    db.commit()
    return {"ok": True}


# ── Delete segments ─────────────────────────────────────────────────────────

@router.post("/{job_id}/delete-segments")
def delete_segments(
    job_id: str,
    body: dict,
    user: User = Depends(get_current_user),
    _mod: bool = Depends(require_module("transcription_diarisation")),
    db: Session = Depends(get_db),
):
    """Delete selected segments from a completed diarisation job."""
    segment_ids: list[str] = body.get("segment_ids", [])
    if not segment_ids:
        raise HTTPException(400, "Aucun segment selectionne")

    job = (
        db.query(TranscriptionJob)
        .filter(
            TranscriptionJob.id == job_id,
            TranscriptionJob.tenant_id == user.tenant_id,
            TranscriptionJob.mode == "diarisation",
        )
        .first()
    )
    if not job:
        raise HTTPException(404, "Job introuvable")

    deleted = (
        db.query(TranscriptionSegment)
        .filter(
            TranscriptionSegment.job_id == job_id,
            TranscriptionSegment.id.in_(segment_ids),
        )
        .delete(synchronize_session="fetch")
    )

    # Re-index remaining segments to keep timeline order_index contiguous
    remaining = (
        db.query(TranscriptionSegment)
        .filter(TranscriptionSegment.job_id == job_id)
        .order_by(TranscriptionSegment.start_time)
        .all()
    )
    for idx, seg in enumerate(remaining):
        seg.order_index = idx

    # Update speaker stats (segment_count, total_duration)
    speakers = (
        db.query(DiarisationSpeaker)
        .filter(DiarisationSpeaker.job_id == job_id)
        .all()
    )
    for sp in speakers:
        sp_segs = [s for s in remaining if s.speaker_id == sp.speaker_id]
        sp.segment_count = len(sp_segs)
        sp.total_duration = sum(s.end_time - s.start_time for s in sp_segs)

    db.commit()
    return {"deleted": deleted}


# ── Merge segments ──────────────────────────────────────────────────────────

@router.post("/{job_id}/merge-segments")
def merge_segments(
    job_id: str,
    body: dict,
    user: User = Depends(get_current_user),
    _mod: bool = Depends(require_module("transcription_diarisation")),
    db: Session = Depends(get_db),
):
    """Merge selected segments into a single segment (keep earliest start, latest end)."""
    segment_ids: list[str] = body.get("segment_ids", [])
    if len(segment_ids) < 2:
        raise HTTPException(400, "Selectionnez au moins 2 segments a fusionner")

    job = (
        db.query(TranscriptionJob)
        .filter(
            TranscriptionJob.id == job_id,
            TranscriptionJob.tenant_id == user.tenant_id,
            TranscriptionJob.mode == "diarisation",
        )
        .first()
    )
    if not job:
        raise HTTPException(404, "Job introuvable")

    to_merge = (
        db.query(TranscriptionSegment)
        .filter(
            TranscriptionSegment.job_id == job_id,
            TranscriptionSegment.id.in_(segment_ids),
        )
        .order_by(TranscriptionSegment.start_time)
        .all()
    )
    if len(to_merge) < 2:
        raise HTTPException(400, "Segments introuvables")

    # Keep the first segment, merge text and times into it
    keeper = to_merge[0]
    keeper.text = " ".join(s.text for s in to_merge)
    keeper.start_time = min(s.start_time for s in to_merge)
    keeper.end_time = max(s.end_time for s in to_merge)

    # Delete the others
    ids_to_delete = [s.id for s in to_merge[1:]]
    db.query(TranscriptionSegment).filter(
        TranscriptionSegment.id.in_(ids_to_delete)
    ).delete(synchronize_session="fetch")

    # Re-index
    remaining = (
        db.query(TranscriptionSegment)
        .filter(TranscriptionSegment.job_id == job_id)
        .order_by(TranscriptionSegment.start_time)
        .all()
    )
    for idx, seg in enumerate(remaining):
        seg.order_index = idx

    # Update speaker stats
    speakers = (
        db.query(DiarisationSpeaker)
        .filter(DiarisationSpeaker.job_id == job_id)
        .all()
    )
    for sp in speakers:
        sp_segs = [s for s in remaining if s.speaker_id == sp.speaker_id]
        sp.segment_count = len(sp_segs)
        sp.total_duration = sum(s.end_time - s.start_time for s in sp_segs)

    db.commit()
    db.refresh(keeper)
    return {
        "merged_segment_id": keeper.id,
        "text": keeper.text,
        "start_time": keeper.start_time,
        "end_time": keeper.end_time,
        "merged_count": len(to_merge),
    }


# ── Serve audio ──────────────────────────────────────────────────────────────

AUDIO_MIME = {
    ".mp3": "audio/mpeg", ".wav": "audio/wav", ".m4a": "audio/mp4",
    ".ogg": "audio/ogg", ".flac": "audio/flac", ".webm": "audio/webm",
    ".aac": "audio/aac", ".opus": "audio/opus",
}

@router.get("/{job_id}/audio")
def get_audio(
    job_id: str,
    user: User = Depends(get_current_user),
    _mod: bool = Depends(require_module("transcription_diarisation")),
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


@router.get("/{job_id}/export")
def export_transcription(
    job_id: str,
    format: str = Query("txt", regex="^(txt|srt|vtt)$"),
    user: User = Depends(get_current_user),
    _mod: bool = Depends(require_module("transcription_diarisation")),
    db: Session = Depends(get_db),
):
    job = (
        db.query(TranscriptionJob)
        .filter(
            TranscriptionJob.id == job_id,
            TranscriptionJob.tenant_id == user.tenant_id,
        )
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
        lines = []
        for seg in segments:
            label = seg.speaker_label or seg.speaker_id or ""
            lines.append(f"[{label}] {seg.text}" if label else seg.text)
        return PlainTextResponse(
            "\n".join(lines),
            headers={"Content-Disposition": f'attachment; filename="{safe_title}.txt"'},
        )

    if format == "srt":
        lines = []
        for i, seg in enumerate(segments, 1):
            label = seg.speaker_label or seg.speaker_id or ""
            lines.append(str(i))
            lines.append(f"{_format_time_srt(seg.start_time)} --> {_format_time_srt(seg.end_time)}")
            lines.append(f"[{label}] {seg.text}" if label else seg.text)
            lines.append("")
        return PlainTextResponse(
            "\n".join(lines),
            headers={"Content-Disposition": f'attachment; filename="{safe_title}.srt"'},
        )

    # VTT
    lines = ["WEBVTT", ""]
    for seg in segments:
        label = seg.speaker_label or seg.speaker_id or ""
        lines.append(f"{_format_time_vtt(seg.start_time)} --> {_format_time_vtt(seg.end_time)}")
        lines.append(f"<v {label}>{seg.text}</v>" if label else seg.text)
        lines.append("")
    return PlainTextResponse(
        "\n".join(lines),
        headers={"Content-Disposition": f'attachment; filename="{safe_title}.vtt"'},
    )


# ── Enroll from segment selection (super_admin test mode) ────────────────────

@router.post("/{job_id}/enroll-from-segment")
def enroll_from_segment(
    job_id: str,
    body: EnrollFromSegmentRequest,
    user: User = Depends(require_super_admin),
    db: Session = Depends(get_db),
):
    """
    Enroll a speaker profile from a selected audio time range.
    Super admin only — bypasses consent for test purposes.
    Either provide speaker_profile_id (existing) or first_name+last_name (inline creation).
    """
    import tempfile
    from datetime import datetime, timezone

    from app.models.speaker import SpeakerProfile, SpeakerEnrollmentSegment
    from app.services.transcription import convert_to_wav

    # Validate time range
    duration = body.end_time - body.start_time
    if duration < 5.0:
        raise HTTPException(400, f"Segment trop court ({duration:.1f}s). Minimum 5 secondes requis.")

    # Load & authorise the job
    job = (
        db.query(TranscriptionJob)
        .filter(TranscriptionJob.id == job_id, TranscriptionJob.mode == "diarisation")
        .first()
    )
    if not job:
        raise HTTPException(404, "Job introuvable")
    if job.status != TranscriptionJobStatus.COMPLETED:
        raise HTTPException(400, "La transcription n'est pas terminee")

    audio_path = Path(settings.audio_path) / job.tenant_id / job.audio_filename
    if not audio_path.exists():
        raise HTTPException(400, "Fichier audio introuvable")

    # Resolve or create profile
    if body.speaker_profile_id:
        profile = db.query(SpeakerProfile).filter_by(id=body.speaker_profile_id).first()
        if not profile:
            raise HTTPException(404, "Profil intervenant introuvable")
    elif body.first_name and body.last_name:
        # Inline creation — bypass consent
        profile = SpeakerProfile(
            tenant_id=job.tenant_id,
            first_name=body.first_name.strip(),
            last_name=body.last_name.strip().upper(),
            display_name=f"{body.first_name.strip()} {body.last_name.strip().upper()}",
            fonction=body.fonction,
            consent_status="accepted",
            consent_type="operator",
            consent_date=datetime.now(timezone.utc),
        )
        db.add(profile)
        db.flush()  # get profile.id
    else:
        raise HTTPException(400, "Fournir speaker_profile_id ou first_name + last_name")

    # Extract audio segment via FFmpeg and compute embedding
    wav_path = audio_path
    temp_wav = None
    temp_segment = None

    try:
        if audio_path.suffix.lower() != ".wav":
            temp_wav = Path(tempfile.mktemp(suffix="_src.wav"))
            convert_to_wav(audio_path, temp_wav)
            wav_path = temp_wav

        # Extract the selected time range
        import subprocess
        temp_segment = Path(tempfile.mktemp(suffix="_seg.wav"))
        ffmpeg_cmd = [
            "ffmpeg", "-y", "-i", str(wav_path),
            "-ss", str(body.start_time), "-to", str(body.end_time),
            "-af", "highpass=f=80,loudnorm=I=-16:TP=-1.5:LRA=11",
            "-ar", "16000", "-ac", "1", "-f", "wav", str(temp_segment),
        ]
        result = subprocess.run(ffmpeg_cmd, capture_output=True, timeout=60)
        if result.returncode != 0:
            raise HTTPException(500, "Erreur lors de l'extraction audio")

        from app.services.speaker_enrollment import extract_embedding_from_audio_segments
        embedding = extract_embedding_from_audio_segments(temp_segment, [(0, duration)])

    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(500, f"Erreur lors du calcul de l'empreinte vocale: {e}")
    finally:
        if temp_wav and temp_wav.exists():
            temp_wav.unlink()
        if temp_segment and temp_segment.exists():
            temp_segment.unlink()

    # Save enrollment
    profile.embedding = json.dumps(embedding)
    profile.enrollment_status = "enrolled"
    profile.enrollment_method = "operator"
    profile.enrolled_at = datetime.now(timezone.utc)

    # Replace previous enrollment segments
    db.query(SpeakerEnrollmentSegment).filter(
        SpeakerEnrollmentSegment.speaker_profile_id == profile.id
    ).delete()

    db.add(SpeakerEnrollmentSegment(
        speaker_profile_id=profile.id,
        job_id=job.id,
        segment_id=None,
        start_time=body.start_time,
        end_time=body.end_time,
    ))

    db.commit()
    db.refresh(profile)
    return {
        "message": f"Intervenant '{profile.display_name}' enrolle avec succes",
        "profile_id": profile.id,
        "display_name": profile.display_name,
        "duration": round(duration, 1),
    }


# ── Oral consent detection via LLM ──────────────────────────────────────────

@router.post("/{job_id}/detect-oral-consent")
def detect_oral_consent(
    job_id: str,
    user: User = Depends(get_current_user),
    _mod: bool = Depends(require_module("transcription_diarisation")),
    db: Session = Depends(get_db),
):
    """
    Use LLM to analyze the transcription and detect if an oral consent
    phrase is present (e.g. 'cette reunion va etre enregistree').
    Returns the detected phrase, the segment, and a confidence level.
    """
    from app.schemas.diarisation import OralConsentDetectionResponse

    job = (
        db.query(TranscriptionJob)
        .filter(
            TranscriptionJob.id == job_id,
            TranscriptionJob.tenant_id == user.tenant_id,
            TranscriptionJob.mode == "diarisation",
        )
        .first()
    )
    if not job:
        raise HTTPException(404, "Job introuvable")
    if job.status != TranscriptionJobStatus.COMPLETED:
        raise HTTPException(400, "La transcription n'est pas terminee")

    segments = (
        db.query(TranscriptionSegment)
        .filter(TranscriptionSegment.job_id == job_id)
        .order_by(TranscriptionSegment.order_index)
        .all()
    )
    if not segments:
        return OralConsentDetectionResponse(detected=False)

    # Build transcript text for LLM analysis (first ~50 segments should be enough)
    analysis_segments = segments[:50]
    transcript_lines = []
    for seg in analysis_segments:
        label = seg.speaker_label or seg.speaker_id or ""
        prefix = f"[{label}] " if label else ""
        transcript_lines.append(f"[{seg.start_time:.1f}-{seg.end_time:.1f}] {prefix}{seg.text}")
    transcript_text = "\n".join(transcript_lines)

    # Call LLM
    import requests as http_requests
    from app.config import settings as app_settings
    from app.services.ai_config import get_model_for_usage

    model = get_model_for_usage("consent_detection")

    system_prompt = (
        "Tu es un assistant d'analyse de transcriptions de reunions. "
        "Tu dois determiner si la transcription contient une phrase de consentement oral "
        "a l'enregistrement, telle que : 'cette reunion va etre enregistree', "
        "'nous enregistrons cette seance', 'l'enregistrement est en cours', "
        "'vous acceptez l'enregistrement', ou toute formulation equivalente.\n\n"
        "Reponds UNIQUEMENT en JSON valide avec cette structure :\n"
        '{"detected": true/false, "phrase": "la phrase exacte trouvee ou null", '
        '"segment_time": "start_time-end_time ou null", '
        '"confidence": "high/medium/low", '
        '"explanation": "courte explication"}\n\n'
        "Si aucune phrase de consentement n'est trouvee, reponds :\n"
        '{"detected": false, "phrase": null, "segment_time": null, "confidence": null, "explanation": "Aucune phrase de consentement detectee."}'
    )

    user_prompt = f"Analyse cette transcription :\n\n{transcript_text}"

    try:
        resp = http_requests.post(
            f"{app_settings.ollama_url}/api/generate",
            json={
                "model": model,
                "system": system_prompt,
                "prompt": user_prompt,
                "stream": False,
                "keep_alive": 0,
                "options": {"temperature": 0.1},
            },
            timeout=120,
        )
        resp.raise_for_status()
        llm_response = resp.json().get("response", "")
    except Exception as e:
        raise HTTPException(500, f"Erreur lors de l'analyse LLM : {e}")

    # Parse LLM JSON response
    import re
    json_match = re.search(r'\{[^{}]*\}', llm_response, re.DOTALL)
    if not json_match:
        return OralConsentDetectionResponse(detected=False, explanation="Reponse LLM non exploitable.")

    try:
        result = json.loads(json_match.group())
    except json.JSONDecodeError:
        return OralConsentDetectionResponse(detected=False, explanation="Reponse LLM non exploitable.")

    if not result.get("detected"):
        return OralConsentDetectionResponse(
            detected=False,
            explanation=result.get("explanation", "Aucune phrase de consentement detectee."),
        )

    # Find the matching segment
    consent_phrase = result.get("phrase", "")
    matched_seg = None
    seg_time = result.get("segment_time")

    if seg_time and "-" in str(seg_time):
        try:
            start_str, end_str = str(seg_time).split("-", 1)
            target_start = float(start_str)
            for seg in analysis_segments:
                if abs(seg.start_time - target_start) < 2.0:
                    matched_seg = seg
                    break
        except (ValueError, TypeError):
            pass

    # Fallback: search by text content
    if not matched_seg and consent_phrase:
        phrase_lower = consent_phrase.lower()
        for seg in analysis_segments:
            if phrase_lower[:30] in seg.text.lower():
                matched_seg = seg
                break

    return OralConsentDetectionResponse(
        detected=True,
        consent_phrase=consent_phrase,
        segment_id=matched_seg.id if matched_seg else None,
        start_time=matched_seg.start_time if matched_seg else None,
        end_time=matched_seg.end_time if matched_seg else None,
        confidence=result.get("confidence", "medium"),
        explanation=result.get("explanation"),
    )


# ── Validate collective oral consent ────────────────────────────────────────

@router.post("/{job_id}/validate-collective-consent")
def validate_collective_consent(
    job_id: str,
    body: ValidateCollectiveConsentRequest,
    user: User = Depends(get_current_user),
    _mod: bool = Depends(require_module("transcription_diarisation")),
    db: Session = Depends(get_db),
):
    """
    Admin validates collective oral consent for a list of contacts.
    Creates or updates SpeakerProfiles linked to the contacts, tagging them
    with consent_status='accepted', consent_type='oral_recording', consent_scope='collective'.
    """
    import secrets
    from datetime import datetime, timezone

    from app.models.speaker import SpeakerProfile
    from app.models.contacts import Contact

    if not user.is_admin:
        raise HTTPException(403, "Acces reserve aux administrateurs")

    job = (
        db.query(TranscriptionJob)
        .filter(
            TranscriptionJob.id == job_id,
            TranscriptionJob.tenant_id == user.tenant_id,
            TranscriptionJob.mode == "diarisation",
        )
        .first()
    )
    if not job:
        raise HTTPException(404, "Job introuvable")

    if not body.contact_ids:
        raise HTTPException(400, "Aucun contact selectionne")

    # Fetch contacts
    contacts = (
        db.query(Contact)
        .filter(
            Contact.id.in_(body.contact_ids),
            Contact.tenant_id == user.tenant_id,
        )
        .all()
    )
    if not contacts:
        raise HTTPException(404, "Aucun contact trouve")

    now = datetime.now(timezone.utc)
    results = []

    for contact in contacts:
        # Check if a SpeakerProfile already exists for this contact
        profile = (
            db.query(SpeakerProfile)
            .filter(SpeakerProfile.contact_id == contact.id)
            .first()
        )

        if profile:
            # Update existing profile consent
            profile.consent_status = "accepted"
            profile.consent_type = "oral_recording"
            profile.consent_scope = "collective"
            profile.consent_date = now
            profile.consent_validated_by = user.id
            if body.consent_segment_id:
                profile.consent_segment_id = body.consent_segment_id
        else:
            # Create new SpeakerProfile linked to the contact
            # Parse contact name into first/last
            name_parts = contact.name.strip().split(" ", 1)
            first_name = name_parts[0] if name_parts else contact.name
            last_name = name_parts[1] if len(name_parts) > 1 else ""

            profile = SpeakerProfile(
                tenant_id=user.tenant_id,
                contact_id=contact.id,
                first_name=first_name,
                last_name=last_name.upper(),
                display_name=contact.name,
                fonction=contact.role,
                email=contact.email,
                phone_number=contact.phone,
                consent_status="accepted",
                consent_type="oral_recording",
                consent_scope="collective",
                consent_date=now,
                consent_validated_by=user.id,
                consent_segment_id=body.consent_segment_id,
                withdrawal_token=secrets.token_urlsafe(32),
            )
            db.add(profile)

        results.append({"contact_id": contact.id, "name": contact.name})

    db.commit()
    return {
        "message": f"Consentement collectif valide pour {len(results)} contact(s)",
        "contacts": results,
    }
