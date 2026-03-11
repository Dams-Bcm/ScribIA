"""Diarisation service — pyannote.audio pipeline + Whisper + alignment.

Pipeline: convert WAV → diarize (pyannote) → unload pyannote → transcribe (Whisper)
→ unload Whisper → align (word-level speaker assignment) → save.
"""

import gc
import logging
import threading
from dataclasses import dataclass
from pathlib import Path
from typing import List, Optional, Tuple

import numpy as np

from app.config import settings
from app.database import SessionLocal
from app.models.transcription import (
    TranscriptionJob, TranscriptionJobStatus, TranscriptionSegment,
    DiarisationSpeaker,
)
from app.services.event_bus import event_bus
from app.services.transcription import (
    _gpu_semaphore, _update_job, _get_tenant_prompt, _build_whisper_prompt,
    convert_to_wav, get_audio_duration,
    get_whisper_model, unload_whisper, run_transcription,
)

logger = logging.getLogger(__name__)

# ── Patch torchaudio for compatibility with newer versions ────────────────────
# pyannote still references APIs removed in recent torchaudio releases
try:
    import torchaudio
    if not hasattr(torchaudio, "set_audio_backend"):
        torchaudio.set_audio_backend = lambda backend: None
    if not hasattr(torchaudio, "get_audio_backend"):
        torchaudio.get_audio_backend = lambda: "soundfile"
    if not hasattr(torchaudio, "list_audio_backends"):
        torchaudio.list_audio_backends = lambda: ["soundfile"]
    if not hasattr(torchaudio, "AudioMetaData"):
        from dataclasses import dataclass as _dc

        @_dc
        class _AudioMetaData:
            sample_rate: int = 0
            num_frames: int = 0
            num_channels: int = 0
            bits_per_sample: int = 0
            encoding: str = ""
except ImportError:
    torchaudio = None  # type: ignore  # non disponible sans torch (use_external_transcription=True)

    torchaudio.AudioMetaData = _AudioMetaData

# ── Pyannote model (lazy-loaded) ─────────────────────────────────────────────
_diarization_pipeline = None


@dataclass
class DiarizationSegment:
    start: float
    end: float
    speaker: str


@dataclass
class AlignedSegment:
    speaker: str
    start: float
    end: float
    text: str


def _free_gpu():
    """Run garbage collection and free CUDA cache."""
    gc.collect()
    try:
        import torch
        if torch.cuda.is_available():
            torch.cuda.empty_cache()
    except Exception:
        pass


def get_diarization_pipeline():
    """Lazy-load pyannote diarization pipeline."""
    global _diarization_pipeline
    if _diarization_pipeline is None:
        logger.info("Loading pyannote diarization pipeline...")
        from pyannote.audio import Pipeline
        import os

        # Accept both SCRIBIA_HF_TOKEN (pydantic prefix) and HF_TOKEN (HuggingFace standard)
        token = settings.hf_token or os.environ.get("HF_TOKEN", "")
        if not token:
            raise RuntimeError(
                "HF_TOKEN est requis pour pyannote.audio. "
                "Définissez HF_TOKEN ou SCRIBIA_HF_TOKEN dans votre .env."
            )

        os.environ["HF_TOKEN"] = token

        try:
            _diarization_pipeline = Pipeline.from_pretrained(
                "pyannote/speaker-diarization-3.1",
                token=token,
            )
        except Exception as e:
            raise RuntimeError(
                f"Impossible de charger le pipeline pyannote: {e}. "
                "Vérifiez que vous avez accepté les conditions des modèles:\n"
                "  https://huggingface.co/pyannote/speaker-diarization-3.1\n"
                "  https://huggingface.co/pyannote/segmentation-3.0\n"
                "et que votre HF_TOKEN est valide."
            ) from e

        if _diarization_pipeline is None:
            raise RuntimeError(
                "Pipeline.from_pretrained returned None. "
                "Vérifiez votre HF_TOKEN et les conditions des modèles pyannote."
            )

        # Log pipeline parameter structure for debugging
        try:
            params = _diarization_pipeline.parameters(instantiated=True)
            logger.info(f"[PYANNOTE] Pipeline parameter keys: {list(params.keys())}")
            for key, val in params.items():
                if isinstance(val, dict):
                    logger.info(f"[PYANNOTE]   {key}: {val}")
                else:
                    logger.info(f"[PYANNOTE]   {key}: {val}")
        except Exception as e:
            logger.warning(f"[PYANNOTE] Could not read pipeline params: {e}")

        # Apply clustering threshold
        if settings.clustering_threshold:
            try:
                params = _diarization_pipeline.parameters(instantiated=True)
                if "clustering" in params and isinstance(params["clustering"], dict):
                    params["clustering"]["threshold"] = settings.clustering_threshold
                    _diarization_pipeline.instantiate(params)
                    logger.info(f"Clustering threshold set to {settings.clustering_threshold}")
                else:
                    # Try alternative parameter paths for 3.1
                    logger.warning(f"[PYANNOTE] No 'clustering' dict in params. Keys: {list(params.keys())}")
                    # Try setting threshold directly if it exists at top level
                    for key in params:
                        if "threshold" in str(key).lower() or "cluster" in str(key).lower():
                            logger.info(f"[PYANNOTE] Found potential key: {key} = {params[key]}")
            except Exception as e:
                logger.warning(f"Could not set clustering threshold: {e}")

        import torch
        if settings.device == "cuda" and torch.cuda.is_available():
            _diarization_pipeline.to(torch.device("cuda"))

        logger.info("Diarization pipeline loaded.")
    return _diarization_pipeline


def unload_diarization():
    """Unload pyannote diarization model to free GPU VRAM."""
    global _diarization_pipeline
    if _diarization_pipeline is not None:
        del _diarization_pipeline
        _diarization_pipeline = None
        _free_gpu()
        logger.info("[VRAM] Pyannote diarization unloaded")


# ── Silero VAD fallback ──────────────────────────────────────────────────────

def _silero_vad_segments(waveform, sample_rate, threshold=0.40):
    """Detect speech regions using Silero VAD (from faster-whisper)."""
    from faster_whisper.vad import get_speech_timestamps, VadOptions

    audio_np = waveform.squeeze().numpy().astype(np.float32)

    if sample_rate != 16000:
        resampler = torchaudio.transforms.Resample(sample_rate, 16000)
        audio_np = resampler(waveform).squeeze().numpy().astype(np.float32)
        sample_rate = 16000

    vad_options = VadOptions(
        threshold=threshold,
        min_speech_duration_ms=250,
        min_silence_duration_ms=300,
        speech_pad_ms=200,
    )

    speech_chunks = get_speech_timestamps(
        audio_np,
        vad_options=vad_options,
        sampling_rate=sample_rate,
    )

    vad_segments = []
    for chunk in speech_chunks:
        start_sec = chunk["start"] / sample_rate
        end_sec = chunk["end"] / sample_rate
        vad_segments.append((start_sec, end_sec))

    total_vad = sum(e - s for s, e in vad_segments)
    duration = len(audio_np) / sample_rate
    logger.info(
        f"[SILERO_VAD] Detected {len(vad_segments)} speech regions, "
        f"{total_vad:.1f}s total ({total_vad / duration:.0%} of {duration:.0f}s)"
    )
    return vad_segments


def _vad_diarization_fallback(
    pipeline, waveform, sample_rate, num_speakers=None,
) -> List[DiarizationSegment]:
    """Fallback: Silero VAD + pyannote embeddings + clustering."""
    import torch
    from sklearn.cluster import AgglomerativeClustering

    vad_regions = _silero_vad_segments(waveform, sample_rate)
    if not vad_regions:
        return []

    embedding_model = pipeline._embedding

    wav = waveform
    emb_sr = sample_rate
    if wav.shape[0] > 1:
        wav = wav.mean(dim=0, keepdim=True)
    if emb_sr != 16000:
        resampler = torchaudio.transforms.Resample(emb_sr, 16000)
        wav = resampler(wav)
        emb_sr = 16000

    embeddings = []
    valid_regions = []

    for start, end in vad_regions:
        if end - start < 0.5:
            continue
        seg_end = min(end, start + 15.0)
        start_sample = int(start * emb_sr)
        end_sample = int(seg_end * emb_sr)
        clip = wav[:, start_sample:end_sample]
        if clip.shape[1] < int(emb_sr * 0.5):
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
            valid_regions.append((start, end))
        except Exception as e:
            logger.debug(f"[VAD_DIAR] Embedding failed for {start:.1f}-{end:.1f}: {e}")

    if not embeddings:
        return []

    logger.info(f"[VAD_DIAR] Extracted {len(embeddings)} embeddings from "
                f"{len(vad_regions)} VAD regions")

    # Cluster embeddings
    if len(embeddings) == 1:
        labels = [0]
    elif num_speakers and num_speakers >= 1:
        n_clusters = min(num_speakers, len(embeddings))
        if n_clusters == 1:
            labels = [0] * len(embeddings)
        else:
            from scipy.spatial.distance import cdist
            dist_matrix = cdist(
                np.stack(embeddings), np.stack(embeddings), metric="cosine",
            )
            clustering = AgglomerativeClustering(
                n_clusters=n_clusters,
                metric="precomputed",
                linkage="average",
            )
            labels = clustering.fit_predict(dist_matrix).tolist()
    else:
        from scipy.spatial.distance import cdist
        dist_matrix = cdist(
            np.stack(embeddings), np.stack(embeddings), metric="cosine",
        )
        clustering = AgglomerativeClustering(
            n_clusters=None,
            distance_threshold=settings.clustering_threshold,
            metric="precomputed",
            linkage="average",
        )
        labels = clustering.fit_predict(dist_matrix).tolist()

    segments = []
    for (start, end), label in zip(valid_regions, labels):
        segments.append(DiarizationSegment(
            start=start, end=end, speaker=f"SPEAKER_{label:02d}",
        ))

    segments.sort(key=lambda s: s.start)

    # Merge consecutive segments from the same speaker with small gaps
    merged = []
    for seg in segments:
        if (merged and merged[-1].speaker == seg.speaker
                and seg.start - merged[-1].end < 1.0):
            merged[-1].end = seg.end
        else:
            merged.append(seg)

    unique = len(set(s.speaker for s in merged))
    total = sum(s.end - s.start for s in merged)
    logger.info(f"[VAD_DIAR] Fallback diarization: {len(merged)} segments, "
                f"{unique} speakers, {total:.1f}s speech")
    return merged


# ── Diarization runner ────────────────────────────────────────────────────────

def run_diarization(
    audio_path: Path, num_speakers: int = None,
) -> List[DiarizationSegment]:
    """Run pyannote speaker diarization on audio file."""
    pipeline = get_diarization_pipeline()
    waveform, sample_rate = torchaudio.load(str(audio_path))

    duration_s = waveform.shape[1] / sample_rate
    rms = float(waveform.pow(2).mean().sqrt())
    abs_max = float(waveform.abs().max())
    logger.info(f"[DIARIZATION] Audio loaded: shape={list(waveform.shape)}, "
                f"sample_rate={sample_rate}, duration={duration_s:.1f}s, "
                f"rms={rms:.4f}, abs_max={abs_max:.4f}")

    # Log effective pipeline parameters before running
    try:
        effective_params = pipeline.parameters(instantiated=True)
        if "clustering" in effective_params:
            logger.info(f"[DIARIZATION] Effective clustering params: {effective_params['clustering']}")
    except Exception:
        pass

    diarization_params = {"waveform": waveform, "sample_rate": sample_rate}
    if num_speakers and num_speakers >= 2:
        logger.info(f"[DIARIZATION] Using user-specified num_speakers={num_speakers}")
        result = pipeline(diarization_params, num_speakers=num_speakers)
    elif num_speakers == 1:
        logger.info("[DIARIZATION] num_speakers=1 requested, will force-merge")
        result = pipeline(
            diarization_params,
            min_speakers=1,
            max_speakers=2,
        )
    else:
        # Only pass min/max speakers if explicitly set (non-default values)
        # Otherwise let pyannote use clustering threshold alone (true auto mode)
        kwargs = {}
        if settings.min_speakers and settings.min_speakers > 0:
            kwargs["min_speakers"] = settings.min_speakers
        if settings.max_speakers and settings.max_speakers > 0:
            kwargs["max_speakers"] = settings.max_speakers
        if kwargs:
            logger.info(f"[DIARIZATION] Using constraints: {kwargs}")
        else:
            logger.info("[DIARIZATION] Auto mode (clustering threshold only, no min/max speakers)")
        result = pipeline(diarization_params, **kwargs)

    # pyannote 4.x compatibility
    if hasattr(result, "speaker_diarization"):
        diarization = result.speaker_diarization
    elif hasattr(result, "itertracks"):
        diarization = result
    else:
        raise TypeError(f"Cannot extract annotation from {type(result).__name__}")

    segments = []
    for turn, _, speaker in diarization.itertracks(yield_label=True):
        segments.append(DiarizationSegment(
            start=turn.start,
            end=turn.end,
            speaker=speaker,
        ))

    segments.sort(key=lambda s: s.start)

    if num_speakers == 1 and segments:
        first_speaker = segments[0].speaker
        for seg in segments:
            seg.speaker = first_speaker

    unique_speakers = len(set(s.speaker for s in segments))
    total_speech = sum(s.end - s.start for s in segments)
    speech_coverage = total_speech / duration_s if duration_s > 0 else 1.0
    logger.info(f"Diarization complete: {len(segments)} segments, "
                f"{unique_speakers} speakers, {total_speech:.1f}s total speech "
                f"(of {duration_s:.1f}s audio, coverage={speech_coverage:.0%})")

    # Silero VAD fallback when pyannote speech coverage is very low
    if speech_coverage < 0.30 and duration_s > 10:
        logger.warning(f"[DIARIZATION] Low speech coverage ({speech_coverage:.0%}), "
                       f"running Silero VAD diarization fallback...")
        try:
            fallback_segments = _vad_diarization_fallback(
                pipeline, waveform, sample_rate, num_speakers=num_speakers,
            )
            if fallback_segments:
                fallback_speech = sum(s.end - s.start for s in fallback_segments)
                if fallback_speech > total_speech * 2:
                    logger.info(
                        f"[VAD_DIAR] Using fallback diarization: "
                        f"{total_speech:.1f}s → {fallback_speech:.1f}s "
                        f"({fallback_speech / duration_s:.0%} coverage)"
                    )
                    segments = fallback_segments
                else:
                    logger.info(
                        f"[VAD_DIAR] Fallback didn't improve much, "
                        f"keeping original diarization"
                    )
        except Exception as e:
            logger.warning(f"[VAD_DIAR] Fallback failed (non-critical): {e}",
                           exc_info=True)

    return segments


# ── Alignment ─────────────────────────────────────────────────────────────────

def normalize_speaker_id(speaker: str) -> str:
    """Normalize speaker ID to SPEAKER_XX format."""
    if speaker.startswith("SPEAKER_"):
        return speaker
    return f"SPEAKER_{speaker.replace('SPEAKER', '').strip('_')}"


def _find_speaker_for_interval(
    start: float, end: float,
    diarization_segments: List[DiarizationSegment],
) -> str:
    """Find the speaker with maximum overlap for a time interval."""
    best_speaker = "SPEAKER_UNKNOWN"
    best_overlap = 0.0
    for d_seg in diarization_segments:
        overlap_start = max(start, d_seg.start)
        overlap_end = min(end, d_seg.end)
        overlap = max(0.0, overlap_end - overlap_start)
        if overlap > best_overlap:
            best_overlap = overlap
            best_speaker = d_seg.speaker
    return normalize_speaker_id(best_speaker)


def _align_by_segments(
    diarization_segments: List[DiarizationSegment],
    whisper_segments: list,
) -> List[AlignedSegment]:
    """Fallback: segment-level alignment (one speaker per whisper segment)."""
    aligned = []
    for start, end, text in whisper_segments:
        if not text:
            continue
        speaker = _find_speaker_for_interval(start, end, diarization_segments)
        if (aligned and aligned[-1].speaker == speaker and
                start - aligned[-1].end < 0.8):
            aligned[-1].end = end
            aligned[-1].text += " " + text
        else:
            aligned.append(AlignedSegment(
                speaker=speaker, start=start, end=end, text=text))

    logger.info(f"Segment-level alignment complete: {len(aligned)} aligned segments")
    return aligned


def align_segments(
    diarization_segments: List[DiarizationSegment],
    whisper_segments: list,
    words: Optional[list] = None,
) -> List[AlignedSegment]:
    """Hybrid alignment: word-level speaker assignment.

    whisper_segments: list of (start, end, text) tuples
    words: list of (start, end, word) tuples (optional)
    """
    if not words:
        return _align_by_segments(diarization_segments, whisper_segments)

    word_idx = 0
    aligned = []

    for seg_start, seg_end, seg_text in whisper_segments:
        if not seg_text:
            continue

        # Collect words belonging to this whisper segment
        seg_words = []
        while word_idx < len(words) and words[word_idx][0] < seg_end - 0.01:
            if words[word_idx][1] > seg_start + 0.01:
                seg_words.append(words[word_idx])
            word_idx += 1

        if not seg_words:
            speaker = _find_speaker_for_interval(
                seg_start, seg_end, diarization_segments)
            if (aligned and aligned[-1].speaker == speaker and
                    seg_start - aligned[-1].end < 1.5):
                aligned[-1].end = seg_end
                aligned[-1].text += " " + seg_text
            else:
                aligned.append(AlignedSegment(
                    speaker=speaker, start=seg_start,
                    end=seg_end, text=seg_text))
            continue

        # Assign each word to a speaker
        word_speakers = []
        for w_start, w_end, w_text in seg_words:
            sp = _find_speaker_for_interval(w_start, w_end, diarization_segments)
            word_speakers.append(((w_start, w_end, w_text), sp))

        # Replace SPEAKER_UNKNOWN with nearest known speaker
        for i, (w, sp) in enumerate(word_speakers):
            if sp == "SPEAKER_UNKNOWN":
                replacement = None
                for j in range(i - 1, -1, -1):
                    if word_speakers[j][1] != "SPEAKER_UNKNOWN":
                        replacement = word_speakers[j][1]
                        break
                if not replacement:
                    for j in range(i + 1, len(word_speakers)):
                        if word_speakers[j][1] != "SPEAKER_UNKNOWN":
                            replacement = word_speakers[j][1]
                            break
                if replacement:
                    word_speakers[i] = (w, replacement)

        # Group consecutive words by speaker
        groups: List[Tuple[str, list]] = []
        for w, sp in word_speakers:
            if groups and groups[-1][0] == sp:
                groups[-1][1].append(w)
            else:
                groups.append((sp, [w]))

        # Absorb isolated single words into neighbors
        if len(groups) > 2:
            merged = [groups[0]]
            for sp, grp_words in groups[1:]:
                if len(grp_words) == 1 and len(merged[-1][1]) > 2:
                    merged[-1][1].extend(grp_words)
                elif len(merged[-1][1]) == 1 and len(grp_words) > 2:
                    prev_sp, prev_words = merged[-1]
                    merged[-1] = (sp, prev_words + grp_words)
                else:
                    merged.append((sp, grp_words))
            groups = merged

        # Create aligned segments from groups
        for sp, grp_words in groups:
            text = "".join(w[2] for w in grp_words).strip()
            if not text:
                continue
            grp_start = grp_words[0][0]
            grp_end = grp_words[-1][1]

            if (aligned and aligned[-1].speaker == sp and
                    grp_start - aligned[-1].end < 0.8):
                aligned[-1].end = grp_end
                aligned[-1].text += " " + text
            else:
                aligned.append(AlignedSegment(
                    speaker=sp, start=grp_start,
                    end=grp_end, text=text))

    logger.info(f"Hybrid alignment complete: {len(aligned)} aligned segments")
    return aligned


# ── Job pipeline ─────────────────────────────────────────────────────────────

def process_diarisation_job(job_id: str):
    """Full diarisation pipeline: convert → diarize → transcribe → align → save."""
    # Déléguer au RAG externe si configuré (gère transcription + diarisation)
    if settings.use_external_transcription:
        from app.services.transcription import _process_external_transcription
        return _process_external_transcription(job_id)

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
                    progress=5,
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

        duration = get_audio_duration(wav_path)
        if duration > 0:
            job.duration_seconds = duration

        # ── Step 2: Diarize + pre-extract embeddings ─────────────────────
        _update_job(db, job,
                    status=TranscriptionJobStatus.DIARIZING,
                    progress=10,
                    progress_message="Identification des intervenants...")

        speaker_embeddings: dict = {}
        try:
            diarization_segments = run_diarization(wav_path, num_speakers=job.num_speakers)

            # Pre-extract per-speaker embeddings while pyannote is still in memory.
            # Used later for automatic profile matching — non-critical.
            logger.info(
                f"[MATCHING] Starting speaker embedding pre-extraction "
                f"({len(diarization_segments)} diarisation segments)..."
            )
            try:
                from app.services.speaker_enrollment import (
                    extract_speaker_embeddings_from_diarisation,
                )
                speaker_embeddings = extract_speaker_embeddings_from_diarisation(
                    wav_path, diarization_segments
                )
                logger.info(
                    f"[MATCHING] Pre-extraction done: "
                    f"{len(speaker_embeddings)} speaker embedding(s) extracted"
                )
            except Exception as e_emb:
                logger.warning(
                    f"[MATCHING] Pre-extraction failed (non-critical): {e_emb}",
                    exc_info=True,
                )
        except Exception as e:
            _update_job(db, job,
                        status=TranscriptionJobStatus.ERROR,
                        error_message=f"Erreur diarisation: {e}",
                        progress=0)
            return
        finally:
            unload_diarization()

        # ── Step 3: Transcribe with word timestamps ──────────────────────
        _update_job(db, job,
                    status=TranscriptionJobStatus.TRANSCRIBING,
                    progress=40,
                    progress_message="Transcription en cours...")

        whisper_prompt = _build_whisper_prompt(db, job)
        try:
            segments, words = run_transcription(
                wav_path, language=job.language, word_timestamps=True, initial_prompt=whisper_prompt)
        except Exception as e:
            _update_job(db, job,
                        status=TranscriptionJobStatus.ERROR,
                        error_message=f"Erreur transcription: {e}",
                        progress=0)
            return
        finally:
            unload_whisper()

        # ── Step 4: Align ────────────────────────────────────────────────
        _update_job(db, job,
                    status=TranscriptionJobStatus.ALIGNING,
                    progress=70,
                    progress_message="Alignement transcription / intervenants...")

        try:
            aligned = align_segments(diarization_segments, segments, words)
        except Exception as e:
            _update_job(db, job,
                        status=TranscriptionJobStatus.ERROR,
                        error_message=f"Erreur alignement: {e}",
                        progress=0)
            return

        # ── Step 5: Save segments + speakers ─────────────────────────────
        _update_job(db, job,
                    progress=85,
                    progress_message="Enregistrement des résultats...")

        unique_speakers = {}
        for idx, seg in enumerate(aligned):
            if seg.speaker not in unique_speakers:
                unique_speakers[seg.speaker] = {
                    "count": 0, "duration": 0.0,
                    "color_index": len(unique_speakers),
                }
            unique_speakers[seg.speaker]["count"] += 1
            unique_speakers[seg.speaker]["duration"] += seg.end - seg.start

            db_seg = TranscriptionSegment(
                job_id=job.id,
                start_time=seg.start,
                end_time=seg.end,
                text=seg.text,
                order_index=idx,
                speaker_id=seg.speaker,
                speaker_label=seg.speaker,
            )
            db.add(db_seg)

        for spk_id, info in unique_speakers.items():
            db_speaker = DiarisationSpeaker(
                job_id=job.id,
                speaker_id=spk_id,
                display_name=spk_id,
                color_index=info["color_index"],
                segment_count=info["count"],
                total_duration=info["duration"],
            )
            db.add(db_speaker)

        job.detected_speakers = len(unique_speakers)
        db.commit()

        # ── Step 5.5: Auto-match detected speakers to known profiles ──────
        logger.info(
            f"[MATCHING] speaker_embeddings has {len(speaker_embeddings)} entries: "
            f"{list(speaker_embeddings.keys()) if speaker_embeddings else '(empty)'}"
        )
        if speaker_embeddings:
            try:
                from app.services.speaker_enrollment import match_speakers_to_profiles

                # If job is linked to a planned meeting, restrict matching to its participants
                restrict_contact_ids = None
                try:
                    from app.models.planned_meeting import PlannedMeeting, PlannedMeetingParticipant
                    pm = db.query(PlannedMeeting).filter(PlannedMeeting.job_id == job.id).first()
                    if pm:
                        participants = db.query(PlannedMeetingParticipant).filter(
                            PlannedMeetingParticipant.meeting_id == pm.id,
                            PlannedMeetingParticipant.contact_id.isnot(None),
                        ).all()
                        if participants:
                            restrict_contact_ids = [p.contact_id for p in participants]
                            logger.info(
                                f"[MATCHING] Restricting to {len(restrict_contact_ids)} "
                                f"planned meeting participants"
                            )
                except Exception:
                    pass  # non-critical

                match_speakers_to_profiles(
                    job_id=job.id,
                    tenant_id=job.tenant_id,
                    speaker_embeddings=speaker_embeddings,
                    db=db,
                    threshold=settings.speaker_matching_threshold,
                    restrict_contact_ids=restrict_contact_ids,
                )
            except Exception as e_match:
                logger.warning(
                    f"[MATCHING] Auto-match failed (non-critical): {e_match}",
                    exc_info=True,
                )
        else:
            logger.warning(
                "[MATCHING] No speaker embeddings available — auto-match skipped"
            )

        # Clean up WAV
        if wav_path != original_path and wav_path.exists():
            wav_path.unlink()

        logger.info(f"Diarisation job {job_id} completed: {len(aligned)} segments, "
                    f"{len(unique_speakers)} speakers")

        # Auto-detect oral consent BEFORE setting completed status
        # so that attendees are updated when frontend receives the completed event
        try:
            from app.services.consent_detection import auto_detect_after_transcription
            _update_job(db, job, progress=98,
                        progress_message="Détection automatique du consentement oral...")
            auto_detect_after_transcription(job_id, db)
            # Refresh job object to pick up recording_validity set by auto-detection
            db.refresh(job)
        except Exception as exc:
            logger.warning(f"[CONSENT] Auto-detection failed for job {job_id}: {exc}")

        # ── Done ─────────────────────────────────────────────────────────
        _update_job(db, job,
                    status=TranscriptionJobStatus.COMPLETED,
                    progress=100,
                    progress_message="Transcription + diarisation terminées")

        # Push notification
        try:
            from app.services.push import notify_job_completed
            notify_job_completed(db, job)
        except Exception as exc:
            logger.warning(f"[PUSH] Notification failed for diarisation job {job_id}: {exc}")

    except Exception as e:
        logger.exception(f"Diarisation job {job_id} failed unexpectedly")
        try:
            job = db.query(TranscriptionJob).filter(TranscriptionJob.id == job_id).first()
            if job:
                _update_job(db, job,
                            status=TranscriptionJobStatus.ERROR,
                            error_message=f"Erreur inattendue: {e}",
                            progress=0)
                try:
                    from app.services.push import notify_job_error
                    notify_job_error(db, job)
                except Exception:
                    pass
        except Exception:
            pass
    finally:
        db.close()


def run_diarisation_job_in_thread(job_id: str):
    """Launch diarisation pipeline in a background thread with GPU semaphore."""
    def _worker():
        logger.info(f"[GPU] Waiting for semaphore for diarisation job {job_id}...")
        with _gpu_semaphore:
            logger.info(f"[GPU] Acquired semaphore for diarisation job {job_id}")
            process_diarisation_job(job_id)
        logger.info(f"[GPU] Released semaphore for diarisation job {job_id}")

    thread = threading.Thread(target=_worker, name=f"diarisation-{job_id}", daemon=True)
    thread.start()
    return thread
