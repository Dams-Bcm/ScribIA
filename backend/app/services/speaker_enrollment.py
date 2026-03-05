"""Speaker enrollment service — voice embeddings + auto-matching."""

import json
import logging
from pathlib import Path
from typing import Dict, List, Tuple

import numpy as np

logger = logging.getLogger(__name__)


def extract_embedding_from_audio_segments(
    audio_path: Path,
    segments: List[Tuple[float, float]],
) -> List[float]:
    """
    Compute an averaged speaker embedding from a list of (start_s, end_s) segments
    of an audio file.

    Reuses the pyannote embedding model already loaded by the diarisation pipeline
    (or loads it on demand).

    Returns a normalised float list ready to be stored as JSON.
    """
    import torch
    import torchaudio

    # Torchaudio compatibility patches (same as diarisation module)
    if not hasattr(torchaudio, "set_audio_backend"):
        torchaudio.set_audio_backend = lambda backend: None
    if not hasattr(torchaudio, "get_audio_backend"):
        torchaudio.get_audio_backend = lambda: "soundfile"

    from app.services.diarisation import get_diarization_pipeline

    pipeline = get_diarization_pipeline()
    embedding_model = pipeline._embedding

    waveform, sample_rate = torchaudio.load(str(audio_path))

    # Mono + 16 kHz
    if waveform.shape[0] > 1:
        waveform = waveform.mean(dim=0, keepdim=True)
    if sample_rate != 16000:
        resampler = torchaudio.transforms.Resample(sample_rate, 16000)
        waveform = resampler(waveform)
        sample_rate = 16000

    embeddings = []
    for start, end in segments:
        if end - start < 0.5:
            continue  # too short for a meaningful embedding

        # Cap each segment at 15 s
        seg_end = min(end, start + 15.0)
        s_sample = int(start * sample_rate)
        e_sample = int(seg_end * sample_rate)
        clip = waveform[:, s_sample:e_sample]

        if clip.shape[1] < int(sample_rate * 0.5):
            continue

        try:
            with torch.no_grad():
                emb = embedding_model(clip.unsqueeze(0))
            emb = emb.squeeze(0)
            if isinstance(emb, torch.Tensor):
                emb = emb.cpu().numpy()
            norm = np.linalg.norm(emb)
            if norm > 0:
                emb = emb / norm
            embeddings.append(emb)
        except Exception as e:
            logger.warning(
                f"[ENROLLMENT] Embedding failed for {start:.1f}–{seg_end:.1f}s: {e}"
            )

    if not embeddings:
        raise ValueError(
            "Aucun segment utilisable pour l'enrollment "
            "(tous les segments sont trop courts ou vides)"
        )

    avg = np.mean(embeddings, axis=0)
    norm = np.linalg.norm(avg)
    if norm > 0:
        avg = avg / norm

    logger.info(
        f"[ENROLLMENT] Embedding computed from {len(embeddings)} segment(s) "
        f"on {audio_path.name}"
    )
    return avg.tolist()


# ── Helpers shared with auto-matching ────────────────────────────────────────

def _load_waveform_mono16k(audio_path: Path):
    """Load audio as mono 16 kHz tensor. Returns (waveform, sample_rate)."""
    import torchaudio

    waveform, sample_rate = torchaudio.load(str(audio_path))
    if waveform.shape[0] > 1:
        waveform = waveform.mean(dim=0, keepdim=True)
    if sample_rate != 16000:
        resampler = torchaudio.transforms.Resample(sample_rate, 16000)
        waveform = resampler(waveform)
        sample_rate = 16000
    return waveform, sample_rate


def _clip_embedding(embedding_model, waveform, sample_rate: int, start: float, end: float):
    """Extract a normalised embedding for a [start, end] clip. Returns ndarray or None."""
    import torch

    seg_end = min(end, start + 15.0)
    s_sample = int(start * sample_rate)
    e_sample = int(seg_end * sample_rate)
    clip = waveform[:, s_sample:e_sample]

    if end - start < 0.5 or clip.shape[1] < int(sample_rate * 0.5):
        return None

    with torch.no_grad():
        emb = embedding_model(clip.unsqueeze(0))
    emb = emb.squeeze(0)
    if hasattr(emb, "cpu"):
        emb = emb.cpu().numpy()
    norm = np.linalg.norm(emb)
    return (emb / norm) if norm > 0 else emb


# ── Pre-extraction during diarisation (pipeline still loaded) ─────────────────

def extract_speaker_embeddings_from_diarisation(
    audio_path: Path,
    diarization_segments: list,  # List[DiarizationSegment] from diarisation service
) -> Dict[str, np.ndarray]:
    """
    Compute per-speaker embeddings while the pyannote pipeline is still in memory.
    Called immediately after run_diarization(), before unload_diarization().

    Returns a dict: normalised_speaker_id → np.ndarray (float32, L2-normalised).
    """
    from app.services.diarisation import get_diarization_pipeline, normalize_speaker_id

    if not diarization_segments:
        return {}

    # Group raw segments by normalised speaker_id
    speaker_times: Dict[str, List[Tuple[float, float]]] = {}
    for seg in diarization_segments:
        spk = normalize_speaker_id(seg.speaker)
        speaker_times.setdefault(spk, []).append((seg.start, seg.end))

    pipeline = get_diarization_pipeline()
    embedding_model = pipeline._embedding

    waveform, sample_rate = _load_waveform_mono16k(audio_path)

    result: Dict[str, np.ndarray] = {}
    for spk_id, times in speaker_times.items():
        embeddings = []
        # Use at most 10 segments per speaker to limit processing time
        for start, end in times[:10]:
            try:
                emb = _clip_embedding(embedding_model, waveform, sample_rate, start, end)
                if emb is not None:
                    embeddings.append(emb)
            except Exception as e:
                logger.debug(f"[MATCHING] Embed failed for {spk_id} {start:.1f}-{end:.1f}: {e}")

        if embeddings:
            avg = np.mean(embeddings, axis=0).astype(np.float32)
            norm = np.linalg.norm(avg)
            result[spk_id] = (avg / norm) if norm > 0 else avg

    logger.info(
        f"[MATCHING] Pre-extracted embeddings for {len(result)}/{len(speaker_times)} "
        f"detected speaker(s)"
    )
    return result


# ── Auto-matching ──────────────────────────────────────────────────────────────

def match_speakers_to_profiles(
    job_id: str,
    tenant_id: str,
    speaker_embeddings: Dict[str, np.ndarray],
    db,
    threshold: float = 0.75,
) -> None:
    """
    Match detected speakers to enrolled SpeakerProfiles via cosine similarity.

    For each detected speaker (SPEAKER_00 etc.) with a pre-computed embedding,
    find the best-matching enrolled profile. If the similarity exceeds `threshold`,
    link DiarisationSpeaker.profile_id and update display_name / speaker_label.

    Uses greedy one-to-one assignment (a profile can only be assigned once per job).
    """
    from app.models.speaker import SpeakerProfile
    from app.models.transcription import DiarisationSpeaker, TranscriptionSegment

    if not speaker_embeddings:
        return

    # Load enrolled profiles that have an embedding
    profiles = (
        db.query(SpeakerProfile)
        .filter(
            SpeakerProfile.tenant_id == tenant_id,
            SpeakerProfile.enrollment_status == "enrolled",
            SpeakerProfile.embedding.isnot(None),
        )
        .all()
    )

    if not profiles:
        logger.debug("[MATCHING] No enrolled profiles in tenant — skipping auto-match")
        return

    # Parse + normalise profile embeddings
    profile_vecs: List[Tuple] = []  # (SpeakerProfile, np.ndarray)
    for p in profiles:
        try:
            emb = np.array(json.loads(p.embedding), dtype=np.float32)
            norm = np.linalg.norm(emb)
            if norm > 0:
                emb = emb / norm
            profile_vecs.append((p, emb))
        except Exception:
            pass

    if not profile_vecs:
        return

    # Build all (speaker, profile) similarity scores
    scores: Dict[Tuple[str, str], float] = {}
    for spk_id, spk_emb in speaker_embeddings.items():
        spk_v = spk_emb.astype(np.float32)
        for profile, prof_v in profile_vecs:
            scores[(spk_id, profile.id)] = float(np.dot(spk_v, prof_v))

    # Greedy one-to-one assignment: best score first, skip already assigned
    assigned_speakers: set = set()
    assigned_profiles: set = set()
    assignments: List[Tuple[str, str, float]] = []

    for (spk_id, prof_id), score in sorted(scores.items(), key=lambda x: -x[1]):
        if score < threshold:
            break
        if spk_id in assigned_speakers or prof_id in assigned_profiles:
            continue
        assignments.append((spk_id, prof_id, score))
        assigned_speakers.add(spk_id)
        assigned_profiles.add(prof_id)

    if not assignments:
        logger.info(
            f"[MATCHING] No speaker matched above threshold={threshold:.2f} "
            f"({len(speaker_embeddings)} detected, {len(profile_vecs)} profiles)"
        )
        return

    profile_map = {p.id: p for p, _ in profile_vecs}

    for spk_id, prof_id, score in assignments:
        profile = profile_map[prof_id]
        diar_speaker = (
            db.query(DiarisationSpeaker)
            .filter(
                DiarisationSpeaker.job_id == job_id,
                DiarisationSpeaker.speaker_id == spk_id,
            )
            .first()
        )
        if not diar_speaker:
            continue

        diar_speaker.profile_id = prof_id
        diar_speaker.display_name = profile.display_name

        db.query(TranscriptionSegment).filter(
            TranscriptionSegment.job_id == job_id,
            TranscriptionSegment.speaker_id == spk_id,
        ).update({"speaker_label": profile.display_name})

        logger.info(
            f"[MATCHING] {spk_id} → \"{profile.display_name}\" (score={score:.3f})"
        )

    db.commit()
    logger.info(f"[MATCHING] Auto-matched {len(assignments)} speaker(s) to profile(s)")
