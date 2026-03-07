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
        "Tu dois analyser la transcription pour detecter si les PARTICIPANTS ont donne "
        "leur consentement a l'enregistrement.\n\n"
        "ATTENTION — il y a DEUX etapes distinctes :\n"
        "1. L'ANNONCE : l'organisateur informe que la reunion est enregistree "
        "(ex: 'cette reunion va etre enregistree', 'nous enregistrons cette seance'). "
        "L'annonce seule N'EST PAS un consentement.\n"
        "2. Le CONSENTEMENT : les autres participants acceptent explicitement ou implicitement. "
        "Exemples de consentement :\n"
        "   - Acceptation explicite : 'oui pas de souci', 'd'accord', 'aucun probleme', 'ok'\n"
        "   - Absence d'objection apres une demande : 'si ca ne derange personne' suivi de silence "
        "ou de poursuite normale de la reunion (= consentement implicite)\n"
        "   - Confirmation collective : 'tout le monde est d'accord ?', 'oui'\n\n"
        "Pour detecter un CONSENTEMENT COLLECTIF valide, il faut :\n"
        "- Une annonce de l'enregistrement par un participant (l'organisateur)\n"
        "- ET une acceptation (explicite ou implicite) par les autres participants\n"
        "- Si l'organisateur demande 'si ca ne derange personne' et que personne ne s'y oppose "
        "dans les segments suivants, c'est un consentement IMPLICITE valide (confidence: medium).\n"
        "- Si des participants repondent explicitement 'oui', 'ok', 'd'accord', c'est un "
        "consentement EXPLICITE (confidence: high).\n\n"
        "Pour detecter un REFUS individuel :\n"
        "- Un participant dit explicitement qu'il refuse l'enregistrement "
        "(ex: 'je refuse d'etre enregistre', 'non je ne suis pas d'accord', "
        "'je m'oppose a l'enregistrement').\n\n"
        "IMPORTANT : Si un consentement ET un refus sont detectes, retourne le REFUS (plus critique).\n\n"
        "Dans le champ 'phrase', cite la phrase d'ACCEPTATION ou de REFUS des participants "
        "(PAS l'annonce de l'organisateur).\n"
        "Dans le champ 'announcement', cite la phrase d'annonce de l'organisateur.\n\n"
        "Reponds UNIQUEMENT en JSON valide avec cette structure :\n"
        "{\n"
        '  "detected": true/false,\n'
        '  "type": "collective_consent" ou "individual_refusal" ou null,\n'
        '  "announcement": "la phrase d\'annonce de l\'organisateur ou null",\n'
        '  "phrase": "la phrase d\'acceptation/refus des participants ou null",\n'
        '  "segment_time": "start_time-end_time ou null",\n'
        '  "speaker_id": "le SPEAKER_XX qui a accepte/refuse ou null",\n'
        '  "confidence": "high/medium/low",\n'
        '  "explanation": "courte explication"\n'
        "}\n\n"
        "Si aucun consentement ni refus n'est detecte :\n"
        '{"detected": false, "type": null, "announcement": null, "phrase": null, '
        '"segment_time": null, "speaker_id": null, "confidence": null, '
        '"explanation": "Aucun consentement detecte."}'
    )

    user_prompt = f"Analyse cette transcription :\n\n{transcript_text}"
    logger.info(f"[CONSENT] Sending {len(analysis_segments)} segments to LLM for job {job.id}. First 300 chars: {transcript_text[:300]}")

    try:
        resp = http_requests.post(
            f"{settings.ollama_url}/api/chat",
            json={
                "model": model,
                "messages": [
                    {"role": "system", "content": system_prompt},
                    {"role": "user", "content": user_prompt},
                ],
                "stream": False,
                "keep_alive": 0,
                "format": "json",
                "options": {"temperature": 0.1},
            },
            timeout=120,
        )
        resp.raise_for_status()
        llm_response = resp.json().get("message", {}).get("content", "")
    except Exception as e:
        logger.warning(f"[CONSENT] LLM detection failed for job {job.id}: {e}")
        return None

    # Parse LLM JSON response — try multiple strategies
    logger.debug(f"[CONSENT] Raw LLM response for job {job.id}: {llm_response[:500]}")
    result = None

    # Strategy 1: direct parse (response is pure JSON)
    try:
        result = json.loads(llm_response.strip())
    except (json.JSONDecodeError, TypeError):
        pass

    # Strategy 2: find JSON block with balanced braces
    if result is None:
        # Find first '{' and match balanced braces
        start = llm_response.find('{')
        if start != -1:
            depth = 0
            for i in range(start, len(llm_response)):
                if llm_response[i] == '{':
                    depth += 1
                elif llm_response[i] == '}':
                    depth -= 1
                    if depth == 0:
                        try:
                            result = json.loads(llm_response[start:i+1])
                        except json.JSONDecodeError:
                            pass
                        break

    # Strategy 3: markdown code block
    if result is None:
        code_match = re.search(r'```(?:json)?\s*(\{.*?\})\s*```', llm_response, re.DOTALL)
        if code_match:
            try:
                result = json.loads(code_match.group(1))
            except json.JSONDecodeError:
                pass

    if result is None:
        logger.warning(f"[CONSENT] LLM response not parseable for job {job.id}: {llm_response[:200]}")
        return {"detected": False, "explanation": "Reponse LLM non exploitable."}

    logger.info(f"[CONSENT] Parsed LLM result for job {job.id}: {json.dumps(result, ensure_ascii=False)[:500]}")

    # Validate that the result has the expected schema
    if "detected" not in result:
        logger.warning(f"[CONSENT] LLM returned unexpected JSON schema for job {job.id} (no 'detected' key)")
        return {"detected": False, "explanation": "Reponse LLM hors format — le modele n'a pas suivi les instructions."}

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
        "announcement": result.get("announcement"),
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

    # If collective consent detected, update pending_oral attendees → accepted_oral
    if result.get("detected") and result.get("detection_type") == "collective_consent":
        try:
            from app.schemas.consent import AttendeeEntry
            raw_attendees = json.loads(job.attendees) if job.attendees else []
            attendees = [AttendeeEntry(**item) for item in raw_attendees]
            updated = False
            for att in attendees:
                if att.status == "pending_oral":
                    att.status = "accepted_oral"
                    att.evidence_type = "oral_auto"
                    updated = True
            if updated:
                job.attendees = json.dumps([a.model_dump() for a in attendees])
                # Recompute recording_validity
                statuses = {a.status for a in attendees}
                if "refused" in statuses or "withdrawn" in statuses:
                    job.recording_validity = "invalidated"
                elif all(s in ("accepted_email", "accepted_oral") for s in statuses):
                    job.recording_validity = "valid"
                else:
                    job.recording_validity = "pending"
                logger.info(f"[CONSENT] Updated pending_oral attendees to accepted_oral for job {job_id}, "
                            f"recording_validity={job.recording_validity}")
        except (json.JSONDecodeError, TypeError) as e:
            logger.warning(f"[CONSENT] Could not parse attendees JSON for job {job_id}: {e}")

    db.commit()

    logger.info(f"[CONSENT] Auto-detection for job {job_id}: detected={result.get('detected')}, "
                f"type={result.get('detection_type')}")
