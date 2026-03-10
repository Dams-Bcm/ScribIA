from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.database import get_db
from app.deps import require_admin, get_current_user
from app.models import User
from app.models.speaker import SpeakerProfile
from app.models.contacts import Contact
from app.schemas.speaker import (
    SpeakerProfileCreate, SpeakerProfileUpdate, SpeakerProfileResponse,
    EnrollFromDiarisationRequest, EnrollContactFromDiarisationRequest,
)

router = APIRouter(prefix="/speakers", tags=["speakers"])


def _get_profile_or_404(profile_id: str, user: User, db: Session) -> SpeakerProfile:
    q = db.query(SpeakerProfile).filter(SpeakerProfile.id == profile_id)
    if not user.is_super_admin:
        q = q.filter(SpeakerProfile.tenant_id == user.tenant_id)
    profile = q.first()
    if not profile:
        raise HTTPException(status_code=404, detail="Intervenant introuvable")
    return profile


@router.get("", response_model=list[SpeakerProfileResponse])
def list_speakers(
    db: Session = Depends(get_db),
    user: User = Depends(require_admin),
):
    q = db.query(SpeakerProfile)
    if not user.is_super_admin:
        q = q.filter(SpeakerProfile.tenant_id == user.tenant_id)
    return q.order_by(SpeakerProfile.last_name, SpeakerProfile.first_name).all()


@router.post("", response_model=SpeakerProfileResponse, status_code=status.HTTP_201_CREATED)
def create_speaker(
    body: SpeakerProfileCreate,
    db: Session = Depends(get_db),
    user: User = Depends(require_admin),
):
    profile = SpeakerProfile(
        tenant_id=user.tenant_id,
        first_name=body.first_name.strip(),
        last_name=body.last_name.strip().upper(),
        display_name=f"{body.first_name.strip()} {body.last_name.strip().upper()}",
        fonction=body.fonction,
        email=body.email.strip().lower() if body.email else None,
        phone_number=body.phone_number,
        contact_id=body.contact_id,
    )
    db.add(profile)
    db.commit()
    db.refresh(profile)
    return profile


@router.patch("/{profile_id}", response_model=SpeakerProfileResponse)
def update_speaker(
    profile_id: str,
    body: SpeakerProfileUpdate,
    db: Session = Depends(get_db),
    user: User = Depends(require_admin),
):
    profile = _get_profile_or_404(profile_id, user, db)

    if body.first_name is not None:
        profile.first_name = body.first_name.strip()
    if body.last_name is not None:
        profile.last_name = body.last_name.strip().upper()
    if body.fonction is not None:
        profile.fonction = body.fonction
    if body.email is not None:
        profile.email = body.email.strip().lower() if body.email else None
    if body.phone_number is not None:
        profile.phone_number = body.phone_number

    # Recompute display_name
    profile.display_name = f"{profile.first_name or ''} {profile.last_name or ''}".strip()

    db.commit()
    db.refresh(profile)
    return profile


@router.delete("/{profile_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_speaker(
    profile_id: str,
    db: Session = Depends(get_db),
    user: User = Depends(require_admin),
):
    profile = _get_profile_or_404(profile_id, user, db)
    db.delete(profile)
    db.commit()


@router.post("/{profile_id}/enroll-from-diarisation", response_model=SpeakerProfileResponse)
def enroll_from_diarisation(
    profile_id: str,
    body: EnrollFromDiarisationRequest,
    db: Session = Depends(get_db),
    user: User = Depends(require_admin),
):
    """
    Link a detected speaker (DiarisationSpeaker) to a SpeakerProfile.
    Optionally compute the voice embedding from all segments of that speaker.
    """
    import json
    import tempfile
    from datetime import datetime, timezone
    from pathlib import Path

    from app.config import settings
    from app.models.speaker import SpeakerEnrollmentSegment
    from app.models.transcription import DiarisationSpeaker, TranscriptionJob, TranscriptionSegment
    from app.services.transcription import convert_to_wav

    profile = _get_profile_or_404(profile_id, user, db)

    # Enrollment requires written (email) consent — oral consent is not sufficient
    # for biometric data processing (RGPD art. 9)
    if body.compute_embedding:
        if profile.consent_status != "accepted" or profile.consent_type not in ("email",):
            raise HTTPException(
                status_code=403,
                detail=(
                    "L'enrollment vocal nécessite un consentement écrit (email). "
                    "Le consentement oral ne couvre pas le traitement biométrique."
                ),
            )

    # Load the DiarisationSpeaker
    diar_speaker = (
        db.query(DiarisationSpeaker)
        .filter(DiarisationSpeaker.id == body.diarisation_speaker_id)
        .first()
    )
    if not diar_speaker:
        raise HTTPException(status_code=404, detail="Locuteur introuvable dans la diarisation")

    # Load & authorise the job
    job_q = db.query(TranscriptionJob).filter(TranscriptionJob.id == diar_speaker.job_id)
    if not user.is_super_admin:
        job_q = job_q.filter(TranscriptionJob.tenant_id == user.tenant_id)
    job = job_q.first()
    if not job:
        raise HTTPException(status_code=404, detail="Job introuvable")

    # Link DiarisationSpeaker → SpeakerProfile
    diar_speaker.profile_id = profile_id

    if body.compute_embedding:
        # Fetch all segments for this speaker in this job
        segments = (
            db.query(TranscriptionSegment)
            .filter(
                TranscriptionSegment.job_id == job.id,
                TranscriptionSegment.speaker_id == diar_speaker.speaker_id,
            )
            .all()
        )
        if not segments:
            raise HTTPException(status_code=400, detail="Aucun segment trouvé pour ce locuteur")

        audio_path = Path(settings.audio_path) / job.tenant_id / job.audio_filename
        if not audio_path.exists():
            raise HTTPException(status_code=400, detail="Fichier audio introuvable pour l'enrollment")

        # Convert to WAV if the original is not already a WAV
        wav_path = audio_path
        temp_wav: Path | None = None
        if audio_path.suffix.lower() != ".wav":
            temp_wav = Path(tempfile.mktemp(suffix="_enroll.wav"))
            convert_to_wav(audio_path, temp_wav)
            wav_path = temp_wav

        try:
            from app.services.speaker_enrollment import extract_embedding_from_audio_segments

            seg_times = [(s.start_time, s.end_time) for s in segments]
            embedding = extract_embedding_from_audio_segments(wav_path, seg_times)
        except ValueError as e:
            raise HTTPException(status_code=400, detail=str(e))
        finally:
            if temp_wav and temp_wav.exists():
                temp_wav.unlink()

        profile.embedding = json.dumps(embedding)
        profile.enrollment_status = "enrolled"
        profile.enrollment_method = "operator"
        profile.enrolled_at = datetime.now(timezone.utc)

        # Replace previous enrollment segments for this profile
        db.query(SpeakerEnrollmentSegment).filter(
            SpeakerEnrollmentSegment.speaker_profile_id == profile_id
        ).delete()

        for seg in segments:
            db.add(SpeakerEnrollmentSegment(
                speaker_profile_id=profile_id,
                job_id=job.id,
                segment_id=seg.id,
                start_time=seg.start_time,
                end_time=seg.end_time,
            ))

    db.commit()
    db.refresh(profile)
    return profile


@router.get("/contacts-for-enrollment")
def contacts_for_enrollment(
    db: Session = Depends(get_db),
    user: User = Depends(require_admin),
):
    """List all contacts in the tenant with their enrollment status."""
    contacts = (
        db.query(Contact)
        .filter(Contact.tenant_id == user.tenant_id)
        .order_by(Contact.name)
        .all()
    )

    # Find existing speaker profiles linked to these contacts
    contact_ids = [c.id for c in contacts]
    linked_profiles = {}
    if contact_ids:
        profiles = (
            db.query(SpeakerProfile)
            .filter(
                SpeakerProfile.contact_id.in_(contact_ids),
                SpeakerProfile.tenant_id == user.tenant_id,
            )
            .all()
        )
        for p in profiles:
            linked_profiles[p.contact_id] = {
                "profile_id": p.id,
                "enrollment_status": p.enrollment_status,
                "consent_status": p.consent_status,
                "consent_type": p.consent_type,
            }

    return [
        {
            "id": c.id,
            "name": c.name,
            "first_name": c.first_name,
            "email": c.email,
            "phone": c.phone,
            "role": c.role,
            "group_ids": [g.id for g in c.groups] if c.groups else [],
            "speaker_profile": linked_profiles.get(c.id),
        }
        for c in contacts
    ]


@router.post("/enroll-contact", response_model=SpeakerProfileResponse)
def enroll_contact_from_diarisation(
    body: EnrollContactFromDiarisationRequest,
    db: Session = Depends(get_db),
    user: User = Depends(require_admin),
):
    """
    Enroll a Contact as a speaker from a diarisation.
    Auto-creates or reuses the SpeakerProfile linked to this contact.
    """
    import json
    import tempfile
    from datetime import datetime, timezone
    from pathlib import Path

    from app.config import settings
    from app.models.speaker import SpeakerEnrollmentSegment
    from app.models.transcription import DiarisationSpeaker, TranscriptionJob, TranscriptionSegment
    from app.services.transcription import convert_to_wav

    # Load the contact
    contact = (
        db.query(Contact)
        .filter(Contact.id == body.contact_id, Contact.tenant_id == user.tenant_id)
        .first()
    )
    if not contact:
        raise HTTPException(status_code=404, detail="Contact introuvable")

    # Find or create a SpeakerProfile linked to this contact
    profile = (
        db.query(SpeakerProfile)
        .filter(
            SpeakerProfile.contact_id == contact.id,
            SpeakerProfile.tenant_id == user.tenant_id,
        )
        .first()
    )
    # Enrollment requires written (email) consent — oral consent is not sufficient
    # for biometric data processing (RGPD art. 9)
    if body.compute_embedding:
        consent_ok = (
            profile
            and profile.consent_status == "accepted"
            and profile.consent_type in ("email",)
        )
        if not consent_ok:
            raise HTTPException(
                status_code=403,
                detail=(
                    "L'enrollment vocal nécessite un consentement écrit (email). "
                    "Le consentement oral ne couvre pas le traitement biométrique."
                ),
            )

    if not profile:
        full_name = f"{contact.first_name} {contact.name}".strip() if contact.first_name else contact.name
        profile = SpeakerProfile(
            tenant_id=user.tenant_id,
            first_name=contact.first_name or "",
            last_name=contact.name,
            display_name=full_name,
            email=contact.email,
            phone_number=contact.phone,
            fonction=contact.role,
            contact_id=contact.id,
        )
        db.add(profile)
        db.flush()

    # Load the DiarisationSpeaker
    diar_speaker = (
        db.query(DiarisationSpeaker)
        .filter(DiarisationSpeaker.id == body.diarisation_speaker_id)
        .first()
    )
    if not diar_speaker:
        raise HTTPException(status_code=404, detail="Locuteur introuvable dans la diarisation")

    # Load & authorise the job
    job_q = db.query(TranscriptionJob).filter(TranscriptionJob.id == diar_speaker.job_id)
    if not user.is_super_admin:
        job_q = job_q.filter(TranscriptionJob.tenant_id == user.tenant_id)
    job = job_q.first()
    if not job:
        raise HTTPException(status_code=404, detail="Job introuvable")

    # Link DiarisationSpeaker → SpeakerProfile
    diar_speaker.profile_id = profile.id

    if body.compute_embedding:
        segments = (
            db.query(TranscriptionSegment)
            .filter(
                TranscriptionSegment.job_id == job.id,
                TranscriptionSegment.speaker_id == diar_speaker.speaker_id,
            )
            .all()
        )
        if not segments:
            raise HTTPException(status_code=400, detail="Aucun segment trouvé pour ce locuteur")

        audio_path = Path(settings.audio_path) / job.tenant_id / job.audio_filename
        if not audio_path.exists():
            raise HTTPException(status_code=400, detail="Fichier audio introuvable pour l'enrollment")

        wav_path = audio_path
        temp_wav: Path | None = None
        if audio_path.suffix.lower() != ".wav":
            temp_wav = Path(tempfile.mktemp(suffix="_enroll.wav"))
            convert_to_wav(audio_path, temp_wav)
            wav_path = temp_wav

        try:
            from app.services.speaker_enrollment import extract_embedding_from_audio_segments
            seg_times = [(s.start_time, s.end_time) for s in segments]
            embedding = extract_embedding_from_audio_segments(wav_path, seg_times)
        except ValueError as e:
            raise HTTPException(status_code=400, detail=str(e))
        finally:
            if temp_wav and temp_wav.exists():
                temp_wav.unlink()

        profile.embedding = json.dumps(embedding)
        profile.enrollment_status = "enrolled"
        profile.enrollment_method = "operator"
        profile.enrolled_at = datetime.now(timezone.utc)

        # Replace previous enrollment segments
        db.query(SpeakerEnrollmentSegment).filter(
            SpeakerEnrollmentSegment.speaker_profile_id == profile.id
        ).delete()

        for seg in segments:
            db.add(SpeakerEnrollmentSegment(
                speaker_profile_id=profile.id,
                job_id=job.id,
                segment_id=seg.id,
                start_time=seg.start_time,
                end_time=seg.end_time,
            ))

    # Update contact enrollment status
    contact.enrollment_status = profile.enrollment_status

    db.commit()
    db.refresh(profile)
    return profile


@router.delete("/{profile_id}/enrollment", status_code=200)
def reset_enrollment(
    profile_id: str,
    db: Session = Depends(get_db),
    user: User = Depends(require_admin),
):
    """Reset enrollment: clear embedding and enrollment status."""
    from app.models.speaker import SpeakerEnrollmentSegment

    profile = _get_profile_or_404(profile_id, user, db)

    profile.embedding = None
    profile.enrollment_status = None
    profile.enrollment_method = None
    profile.enrolled_at = None

    # Remove enrollment segments
    db.query(SpeakerEnrollmentSegment).filter(
        SpeakerEnrollmentSegment.speaker_profile_id == profile.id
    ).delete()

    db.commit()
    return {"message": f"Enrollment de '{profile.display_name}' réinitialisé"}


@router.post("/{profile_id}/send-consent", response_model=SpeakerProfileResponse)
def send_consent_email(
    profile_id: str,
    db: Session = Depends(get_db),
    user: User = Depends(require_admin),
):
    """Envoie l'email de consentement (option A). Passe le statut à 'sent'."""
    profile = _get_profile_or_404(profile_id, user, db)

    if not profile.email:
        raise HTTPException(status_code=400, detail="L'intervenant n'a pas d'email renseigné")
    if profile.consent_status == "accepted" and profile.consent_type != "oral_recording":
        raise HTTPException(status_code=400, detail="Le consentement a déjà été accepté")

    import secrets
    from datetime import timezone, timedelta
    from datetime import datetime

    profile.consent_type = "email"
    profile.consent_scope = "individual"
    profile.consent_status = "sent"
    profile.consent_token = secrets.token_urlsafe(32)
    profile.consent_token_expires = datetime.now(timezone.utc) + timedelta(days=30)
    if not profile.withdrawal_token:
        profile.withdrawal_token = secrets.token_urlsafe(32)

    # TODO: envoyer l'email réel quand le service email sera configuré
    # Liens :
    #   Accepter : /api/consent/accept?token={profile.consent_token}
    #   Refuser  : /api/consent/decline?token={profile.consent_token}
    #   Retirer  : /api/consent/withdraw?token={profile.withdrawal_token}

    db.commit()
    db.refresh(profile)
    return profile


@router.get("/debug/match-scores/{job_id}")
def debug_match_scores(
    job_id: str,
    db: Session = Depends(get_db),
    user: User = Depends(require_admin),
):
    """
    Diagnostic: show cosine similarity scores between all enrolled profiles
    and all detected speakers in a diarisation job.
    Re-computes scores from stored embeddings (does not need pyannote loaded).
    """
    import json
    import numpy as np
    from app.models.transcription import DiarisationSpeaker

    profiles = (
        db.query(SpeakerProfile)
        .filter(
            SpeakerProfile.tenant_id == user.tenant_id,
            SpeakerProfile.embedding.isnot(None),
        )
        .all()
    )

    diar_speakers = (
        db.query(DiarisationSpeaker)
        .filter(DiarisationSpeaker.job_id == job_id)
        .all()
    )

    if not profiles:
        return {"error": "Aucun profil avec embedding", "scores": []}
    if not diar_speakers:
        return {"error": "Aucun speaker dans ce job", "scores": []}

    profile_info = []
    for p in profiles:
        try:
            emb = np.array(json.loads(p.embedding), dtype=np.float32)
            norm = np.linalg.norm(emb)
            if norm > 0:
                emb = emb / norm
            profile_info.append({"id": p.id, "name": p.display_name, "status": p.enrollment_status, "emb": emb})
        except Exception as e:
            profile_info.append({"id": p.id, "name": p.display_name, "status": p.enrollment_status, "error": str(e)})

    return {
        "job_id": job_id,
        "threshold": 0.75,
        "enrolled_profiles": [
            {"id": pi["id"], "name": pi["name"], "status": pi["status"],
             "emb_dim": len(pi["emb"]) if "emb" in pi else None,
             "error": pi.get("error")}
            for pi in profile_info
        ],
        "diarisation_speakers": [
            {"id": ds.id, "speaker_id": ds.speaker_id, "display_name": ds.display_name,
             "profile_id": ds.profile_id, "segment_count": ds.segment_count}
            for ds in diar_speakers
        ],
        "note": "Les scores cosinus sont calcules pendant la diarisation (step 5.5). "
                "Verifiez les logs: docker logs scribia-backend-1 2>&1 | grep MATCHING",
    }
