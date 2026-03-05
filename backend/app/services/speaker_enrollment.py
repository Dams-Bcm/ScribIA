"""Speaker enrollment service — compute voice embeddings from diarisation segments."""

import json
import logging
from pathlib import Path
from typing import List, Tuple

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
