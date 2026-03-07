"""Automatic oral consent detection via LLM.

Extracted from diarisation router so it can be called automatically
after transcription when attendees have pending_oral status.
"""

import json
import logging
import re

from sqlalchemy.orm import Session

from app.config import settings
from app.models.consent import ConsentDetection
from app.models.transcription import TranscriptionJob, TranscriptionSegment

logger = logging.getLogger(__name__)


def detect_oral_consent(db: Session, job: TranscriptionJob) -> dict | None:
    """Analyze transcription segments to detect oral consent via LLM.

    Returns a dict with detection results, or None if no segments / LLM error.
    The dict has keys: detected, detection_type, consent_phrase, segment_id,
    start_time, end_time, confidence, explanation, refusal_speaker_id,
    refusal_speaker_label.
    """
    segments = (
        db.query(TranscriptionSegment)
        .filter(TranscriptionSegment.job_id == job.id)
        .order_by(TranscriptionSegment.order_index)
        .all()
    )
    if not segments:
        return None

    # Build transcript text for LLM analysis (first ~50 segments)
    analysis_segments = segments[:50]
    transcript_lines = []
    for seg in analysis_segments:
        label = seg.speaker_label or seg.speaker_id or ""
        prefix = f"[{label}] " if label else ""
        transcript_lines.append(f"[{seg.start_time:.1f}-{seg.end_time:.1f}] {prefix}{seg.text}")
    transcript_text = "\n".join(transcript_lines)

    # Call LLM
    import requests as http_requests
    from app.services.ai_config import get_model_for_usage

    model = get_model_for_usage("consent_detection")

    system_prompt = (
        "Tu es un assistant d'analyse de transcriptions de reunions.\n"
        "Tu dois analyser la transcription pour detecter :\n"
        "1. Un CONSENTEMENT collectif a l'enregistrement (ex: 'cette reunion va etre enregistree', "
        "'nous enregistrons cette seance', 'vous acceptez l'enregistrement', 'pas d'objection').\n"
        "2. Un REFUS individuel d'etre enregistre (ex: 'je refuse d'etre enregistre', "
        "'non je ne suis pas d'accord', 'je m'oppose a l'enregistrement').\n\n"
        "IMPORTANT : Cherche d'abord le consentement, puis verifie s'il y a un refus apres.\n"
        "Si un consentement ET un refus sont detectes, retourne le REFUS (plus critique).\n\n"
        "Reponds UNIQUEMENT en JSON valide avec cette structure :\n"
        "{\n"
        '  "detected": true/false,\n'
        '  "type": "collective_consent" ou "individual_refusal" ou null,\n'
        '  "phrase": "la phrase exacte trouvee ou null",\n'
        '  "segment_time": "start_time-end_time ou null",\n'
        '  "speaker_id": "le SPEAKER_XX qui a prononce la phrase ou null",\n'
        '  "confidence": "high/medium/low",\n'
        '  "explanation": "courte explication"\n'
        "}\n\n"
        "Si aucune phrase de consentement ni de refus n'est trouvee :\n"
        '{"detected": false, "type": null, "phrase": null, "segment_time": null, '
        '"speaker_id": null, "confidence": null, '
        '"explanation": "Aucune phrase de consentement ou de refus detectee."}'
    )

    user_prompt = f"Analyse cette transcription :\n\n{transcript_text}"

    try:
        resp = http_requests.post(
            f"{settings.ollama_url}/api/generate",
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
        logger.warning(f"[CONSENT] LLM detection failed for job {job.id}: {e}")
        return None

    # Parse LLM JSON response
    json_match = re.search(r'\{[^{}]*\}', llm_response, re.DOTALL)
    if not json_match:
        logger.warning(f"[CONSENT] LLM response not parseable for job {job.id}")
        return {"detected": False, "explanation": "Reponse LLM non exploitable."}

    try:
        result = json.loads(json_match.group())
    except json.JSONDecodeError:
        return {"detected": False, "explanation": "Reponse LLM non exploitable."}

    if not result.get("detected"):
        return {
            "detected": False,
            "explanation": result.get("explanation", "Aucune phrase de consentement detectee."),
        }

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

    # Resolve refusal speaker label if available
    detection_type = result.get("type")
    refusal_speaker_id = result.get("speaker_id")
    refusal_speaker_label = None
    if detection_type == "individual_refusal" and refusal_speaker_id:
        for seg in analysis_segments:
            if seg.speaker_id == refusal_speaker_id and seg.speaker_label:
                refusal_speaker_label = seg.speaker_label
                break

    # Save ConsentDetection record for audit trail
    cd = ConsentDetection(
        tenant_id=job.tenant_id,
        job_id=job.id,
        detection_type=detection_type or "collective_consent",
        segment_start_ms=matched_seg.start_time * 1000 if matched_seg else None,
        segment_end_ms=matched_seg.end_time * 1000 if matched_seg else None,
        transcript_text=consent_phrase,
        speaker_id=refusal_speaker_id,
        ai_confidence={"high": 0.9, "medium": 0.6, "low": 0.3}.get(
            result.get("confidence", "medium"), 0.5
        ),
    )
    db.add(cd)
    db.commit()

    return {
        "detected": True,
        "detection_type": detection_type,
        "consent_phrase": consent_phrase,
        "segment_id": matched_seg.id if matched_seg else None,
        "start_time": matched_seg.start_time if matched_seg else None,
        "end_time": matched_seg.end_time if matched_seg else None,
        "confidence": result.get("confidence", "medium"),
        "explanation": result.get("explanation"),
        "refusal_speaker_id": refusal_speaker_id,
        "refusal_speaker_label": refusal_speaker_label,
    }


def has_pending_oral(job: TranscriptionJob) -> bool:
    """Check if job has any attendees with pending_oral status."""
    if not job.attendees:
        return False
    try:
        attendees = json.loads(job.attendees)
        return any(a.get("status") == "pending_oral" for a in attendees)
    except (json.JSONDecodeError, TypeError):
        return False


def auto_detect_after_transcription(job_id: str, db: Session):
    """Run automatic oral consent detection if job has pending_oral attendees.

    Called at the end of transcription pipelines (both full and partial).
    Stores result in job.consent_detection_result JSON for frontend display.
    """
    job = db.query(TranscriptionJob).filter(TranscriptionJob.id == job_id).first()
    if not job:
        return

    if not has_pending_oral(job):
        logger.info(f"[CONSENT] Job {job_id} has no pending_oral attendees — skipping auto-detection")
        return

    logger.info(f"[CONSENT] Auto-detecting oral consent for job {job_id}...")

    result = detect_oral_consent(db, job)
    if result is None:
        logger.warning(f"[CONSENT] Auto-detection returned None for job {job_id}")
        return

    # Store result on job for frontend to read
    job.consent_detection_result = json.dumps(result)
    db.commit()

    logger.info(f"[CONSENT] Auto-detection for job {job_id}: detected={result.get('detected')}, "
                f"type={result.get('detection_type')}")
