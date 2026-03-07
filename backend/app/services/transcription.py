"""Transcription service — Whisper pipeline with GPU semaphore.

Handles: audio conversion (FFmpeg), transcription (faster-whisper),
progress reporting (event_bus), and background thread management.
"""

import gc
import logging
import subprocess
import threading
import uuid
from pathlib import Path
from typing import Optional

from app.config import settings
from app.database import SessionLocal
from app.models.tenant import Tenant
from app.models.transcription import TranscriptionJob, TranscriptionJobStatus, TranscriptionSegment
from app.services.event_bus import event_bus

logger = logging.getLogger(__name__)

# ── GPU semaphore (1 transcription at a time) ────────────────────────────────
_gpu_semaphore = threading.Semaphore(1)

# ── Cancelled jobs set (thread-safe) ─────────────────────────────────────────
_cancelled_jobs: set[str] = set()
_cancelled_lock = threading.Lock()


def cancel_job(job_id: str):
    """Mark a job as cancelled so threads bail out early."""
    with _cancelled_lock:
        _cancelled_jobs.add(job_id)


def _is_cancelled(job_id: str) -> bool:
    with _cancelled_lock:
        return job_id in _cancelled_jobs


def _clear_cancelled(job_id: str):
    with _cancelled_lock:
        _cancelled_jobs.discard(job_id)

# ── Whisper model (lazy-loaded) ──────────────────────────────────────────────
_whisper_model = None


def get_whisper_model():
    """Lazy-load the faster-whisper model."""
    global _whisper_model
    if _whisper_model is None:
        logger.info(f"Loading faster-whisper model '{settings.whisper_model}' on {settings.device}...")
        from faster_whisper import WhisperModel

        _whisper_model = WhisperModel(
            settings.whisper_model,
            device=settings.device,
            compute_type=settings.compute_type,
        )
        logger.info("Whisper model loaded.")
    return _whisper_model


def unload_whisper():
    """Unload Whisper model to free GPU VRAM."""
    global _whisper_model
    if _whisper_model is not None:
        del _whisper_model
        _whisper_model = None
        gc.collect()
        try:
            import torch
            if torch.cuda.is_available():
                torch.cuda.empty_cache()
        except Exception:
            pass
        logger.info("[VRAM] Whisper model unloaded")


# ── FFmpeg helpers ───────────────────────────────────────────────────────────

def convert_to_wav(input_path: Path, output_path: Path) -> Path:
    """Convert any audio file to WAV 16kHz mono via FFmpeg."""
    cmd = [
        "ffmpeg", "-y", "-hide_banner", "-loglevel", "error",
        "-i", str(input_path),
        "-ar", "16000",
        "-ac", "1",
        "-c:a", "pcm_s16le",
        str(output_path),
    ]
    logger.info(f"FFmpeg: {input_path} -> {output_path}")
    result = subprocess.run(cmd, capture_output=True, text=True, timeout=300)
    if result.returncode != 0:
        raise RuntimeError(f"FFmpeg error: {result.stderr[:500]}")
    return output_path


def crop_audio(input_path: Path, output_path: Path, duration_seconds: float = 60.0) -> Path:
    """Crop audio to first N seconds via FFmpeg."""
    cmd = [
        "ffmpeg", "-y", "-hide_banner", "-loglevel", "error",
        "-i", str(input_path),
        "-t", str(duration_seconds),
        "-ar", "16000",
        "-ac", "1",
        "-c:a", "pcm_s16le",
        str(output_path),
    ]
    logger.info(f"FFmpeg crop: {input_path} -> {output_path} ({duration_seconds}s)")
    result = subprocess.run(cmd, capture_output=True, text=True, timeout=120)
    if result.returncode != 0:
        raise RuntimeError(f"FFmpeg crop error: {result.stderr[:500]}")
    return output_path


def get_audio_duration(audio_path: Path) -> float:
    """Get audio duration in seconds via ffprobe."""
    try:
        result = subprocess.run(
            ["ffprobe", "-v", "quiet", "-show_entries", "format=duration",
             "-of", "csv=p=0", str(audio_path)],
            capture_output=True, text=True, timeout=30,
        )
        return float(result.stdout.strip())
    except Exception:
        return 0.0


def _get_tenant_prompt(db, tenant_id: str) -> str | None:
    """Return tenant-specific Whisper initial prompt, or None."""
    tenant = db.query(Tenant).filter(Tenant.id == tenant_id).first()
    return tenant.whisper_initial_prompt if tenant else None


# ── Transcription runner ─────────────────────────────────────────────────────

def run_transcription(audio_path: Path, language: str = "fr", word_timestamps: bool = False, initial_prompt: str | None = None):
    """Run faster-whisper on an audio file.

    Returns list of (start, end, text).
    If word_timestamps=True, returns (segments, words) where words is list of (start, end, word).
    """
    model = get_whisper_model()

    # Parse temperature cascade
    temperature = [float(t.strip()) for t in settings.whisper_temperature.split(",") if t.strip()]
    if len(temperature) == 1:
        temperature = temperature[0]

    kwargs = dict(
        language=language,
        beam_size=settings.whisper_beam_size,
        vad_filter=True,
        vad_parameters=dict(
            min_silence_duration_ms=settings.whisper_vad_min_silence_ms,
            speech_pad_ms=settings.whisper_vad_speech_pad_ms,
        ),
        no_speech_threshold=settings.whisper_no_speech_threshold,
        word_timestamps=word_timestamps,
        temperature=temperature,
        condition_on_previous_text=settings.whisper_condition_on_previous_text,
    )
    # Tenant prompt takes priority, then global config
    prompt = initial_prompt or settings.whisper_initial_prompt
    if prompt:
        kwargs["initial_prompt"] = prompt

    segments_gen, info = model.transcribe(str(audio_path), **kwargs)

    segments = []
    words = []
    for seg in segments_gen:
        segments.append((seg.start, seg.end, seg.text.strip()))
        if word_timestamps and seg.words:
            for w in seg.words:
                words.append((w.start, w.end, w.word))

    logger.info(f"Transcription complete: {len(segments)} segments, "
                f"{len(words)} words, duration={info.duration:.1f}s")

    if word_timestamps:
        return segments, words
    return segments


# ── Job pipeline ─────────────────────────────────────────────────────────────

def _update_job(db, job: TranscriptionJob, **kwargs):
    """Update job fields and publish progress via event_bus."""
    for k, v in kwargs.items():
        setattr(job, k, v)
    db.commit()

    event_bus.publish(job.id, {
        "status": job.status,
        "progress": job.progress,
        "progress_message": job.progress_message,
        "error_message": job.error_message,
    })


def process_transcription_job(job_id: str):
    """Full pipeline: convert → transcribe → save segments. Runs in a thread."""
    if _is_cancelled(job_id):
        _clear_cancelled(job_id)
        logger.info(f"Job {job_id} was cancelled before starting")
        return

    db = SessionLocal()
    try:
        job = db.query(TranscriptionJob).filter(TranscriptionJob.id == job_id).first()
        if not job:
            logger.error(f"Job {job_id} not found")
            return

        audio_dir = Path(settings.audio_path) / job.tenant_id
        original_path = audio_dir / job.audio_filename

        if not original_path.exists():
            _update_job(db, job,
                        status=TranscriptionJobStatus.ERROR,
                        error_message=f"Fichier audio introuvable: {job.audio_filename}",
                        progress=0)
            return

        # ── Step 1: Convert to WAV ───────────────────────────────────────
        _update_job(db, job,
                    status=TranscriptionJobStatus.CONVERTING,
                    progress=10,
                    progress_message="Conversion audio en cours...")

        wav_filename = f"{Path(job.audio_filename).stem}_16k.wav"
        wav_path = audio_dir / wav_filename

        try:
            convert_to_wav(original_path, wav_path)
        except Exception as e:
            _update_job(db, job,
                        status=TranscriptionJobStatus.ERROR,
                        error_message=f"Erreur conversion: {e}",
                        progress=0)
            return

        # Get duration
        duration = get_audio_duration(wav_path)
        if duration > 0:
            job.duration_seconds = duration

        # Check cancellation before heavy work
        if _is_cancelled(job_id):
            _clear_cancelled(job_id)
            logger.info(f"Job {job_id} cancelled after conversion")
            if wav_path != original_path and wav_path.exists():
                wav_path.unlink()
            return

        # ── Step 2: Transcribe ───────────────────────────────────────────
        _update_job(db, job,
                    status=TranscriptionJobStatus.TRANSCRIBING,
                    progress=30,
                    progress_message="Transcription en cours...")

        tenant_prompt = _get_tenant_prompt(db, job.tenant_id)
        try:
            segments = run_transcription(wav_path, language=job.language, initial_prompt=tenant_prompt)
        except Exception as e:
            _update_job(db, job,
                        status=TranscriptionJobStatus.ERROR,
                        error_message=f"Erreur transcription: {e}",
                        progress=0)
            return
        finally:
            unload_whisper()

        # ── Step 3: Save segments ────────────────────────────────────────
        _update_job(db, job,
                    progress=90,
                    progress_message="Enregistrement des résultats...")

        for idx, (start, end, text) in enumerate(segments):
            segment = TranscriptionSegment(
                job_id=job.id,
                start_time=start,
                end_time=end,
                text=text,
                order_index=idx,
            )
            db.add(segment)
        db.commit()

        # Clean up WAV if different from original
        if wav_path != original_path and wav_path.exists():
            wav_path.unlink()

        logger.info(f"Job {job_id} completed: {len(segments)} segments")

        # Auto-detect oral consent BEFORE setting completed status
        try:
            from app.services.consent_detection import auto_detect_after_transcription
            _update_job(db, job, progress=98,
                        progress_message="Détection automatique du consentement oral...")
            auto_detect_after_transcription(job_id, db)
        except Exception as exc:
            logger.warning(f"[CONSENT] Auto-detection failed for job {job_id}: {exc}")

        # ── Done ─────────────────────────────────────────────────────────
        _update_job(db, job,
                    status=TranscriptionJobStatus.COMPLETED,
                    progress=100,
                    progress_message="Transcription terminée")

        # Indexation RAG automatique
        try:
            from app.services.indexer import index_transcription
            seg_data = [{"speaker": s.speaker_label or "", "text": s.text} for s in
                        db.query(TranscriptionSegment).filter_by(job_id=job_id).order_by(TranscriptionSegment.start_time).all()]
            index_transcription(job.tenant_id, job.id, job.original_filename or "Transcription", seg_data)
        except Exception as exc:
            logger.warning(f"[RAG] Indexation échouée pour transcription {job_id}: {exc}")

    except Exception as e:
        logger.exception(f"Job {job_id} failed unexpectedly")
        try:
            job = db.query(TranscriptionJob).filter(TranscriptionJob.id == job_id).first()
            if job:
                _update_job(db, job,
                            status=TranscriptionJobStatus.ERROR,
                            error_message=f"Erreur inattendue: {e}",
                            progress=0)
        except Exception:
            pass
    finally:
        db.close()


def process_partial_analysis(job_id: str):
    """Partial pipeline: convert → crop to ~60s → transcribe → detect consent.

    Used for imported audio when some attendees are pending_oral.
    Only transcribes the first ~60 seconds to check for oral consent.
    """
    if _is_cancelled(job_id):
        _clear_cancelled(job_id)
        logger.info(f"[PARTIAL] Job {job_id} was cancelled before starting")
        return

    db = SessionLocal()
    try:
        job = db.query(TranscriptionJob).filter(TranscriptionJob.id == job_id).first()
        if not job:
            logger.error(f"[PARTIAL] Job {job_id} not found")
            return

        audio_dir = Path(settings.audio_path) / job.tenant_id
        original_path = audio_dir / job.audio_filename

        if not original_path.exists():
            _update_job(db, job,
                        status=TranscriptionJobStatus.ERROR,
                        error_message=f"Fichier audio introuvable: {job.audio_filename}",
                        progress=0)
            return

        # ── Step 1: Crop to ~60s WAV ──────────────────────────────────────
        _update_job(db, job,
                    status=TranscriptionJobStatus.CONVERTING,
                    progress=10,
                    progress_message="Extraction des 60 premières secondes...")

        partial_wav = audio_dir / f"{Path(job.audio_filename).stem}_partial60.wav"

        try:
            crop_audio(original_path, partial_wav, duration_seconds=60.0)
        except Exception as e:
            _update_job(db, job,
                        status=TranscriptionJobStatus.ERROR,
                        error_message=f"Erreur extraction partielle: {e}",
                        progress=0)
            return

        # ── Step 2: Transcribe partial ────────────────────────────────────
        _update_job(db, job,
                    status=TranscriptionJobStatus.TRANSCRIBING,
                    progress=40,
                    progress_message="Analyse partielle en cours (~60s)...")

        tenant_prompt = _get_tenant_prompt(db, job.tenant_id)
        try:
            segments = run_transcription(partial_wav, language=job.language, initial_prompt=tenant_prompt)
        except Exception as e:
            _update_job(db, job,
                        status=TranscriptionJobStatus.ERROR,
                        error_message=f"Erreur transcription partielle: {e}",
                        progress=0)
            return
        finally:
            unload_whisper()
            # Clean up partial WAV
            if partial_wav.exists():
                partial_wav.unlink()

        # ── Step 3: Save partial segments ─────────────────────────────────
        _update_job(db, job,
                    progress=80,
                    progress_message="Enregistrement de l'analyse partielle...")

        # Clear any previous partial segments
        from app.models.transcription import TranscriptionSegment
        db.query(TranscriptionSegment).filter_by(job_id=job.id).delete()

        for idx, (start, end, text) in enumerate(segments):
            segment = TranscriptionSegment(
                job_id=job.id,
                start_time=start,
                end_time=end,
                text=text,
                order_index=idx,
            )
            db.add(segment)
        db.commit()

        # ── Step 4: Auto-detect oral consent ────────────────────────────
        _update_job(db, job,
                    progress=90,
                    progress_message="Détection automatique du consentement oral...")

        try:
            from app.services.consent_detection import auto_detect_after_transcription
            auto_detect_after_transcription(job_id, db)
        except Exception as exc:
            logger.warning(f"[CONSENT] Auto-detection failed for partial job {job_id}: {exc}")

        # ── Step 5: Set status to consent_check ───────────────────────────
        _update_job(db, job,
                    status=TranscriptionJobStatus.CONSENT_CHECK,
                    progress=100,
                    progress_message="Analyse partielle terminée — vérification du consentement oral requise")

        logger.info(f"[PARTIAL] Job {job_id} partial analysis done: {len(segments)} segments")

    except Exception as e:
        logger.exception(f"[PARTIAL] Job {job_id} failed")
        try:
            job = db.query(TranscriptionJob).filter(TranscriptionJob.id == job_id).first()
            if job:
                _update_job(db, job,
                            status=TranscriptionJobStatus.ERROR,
                            error_message=f"Erreur analyse partielle: {e}",
                            progress=0)
        except Exception:
            pass
    finally:
        db.close()


def run_partial_analysis_in_thread(job_id: str):
    """Launch partial analysis in a background thread with GPU semaphore."""
    def _worker():
        logger.info(f"[GPU] Waiting for semaphore for partial analysis {job_id}...")
        with _gpu_semaphore:
            logger.info(f"[GPU] Acquired semaphore for partial analysis {job_id}")
            process_partial_analysis(job_id)
        logger.info(f"[GPU] Released semaphore for partial analysis {job_id}")

    thread = threading.Thread(target=_worker, name=f"partial-{job_id}", daemon=True)
    thread.start()
    return thread


def run_job_in_thread(job_id: str):
    """Launch the transcription pipeline in a background thread with GPU semaphore."""
    def _worker():
        logger.info(f"[GPU] Waiting for semaphore for job {job_id}...")
        with _gpu_semaphore:
            logger.info(f"[GPU] Acquired semaphore for job {job_id}")
            process_transcription_job(job_id)
        logger.info(f"[GPU] Released semaphore for job {job_id}")

    thread = threading.Thread(target=_worker, name=f"transcription-{job_id}", daemon=True)
    thread.start()
    return thread
