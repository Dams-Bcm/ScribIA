from typing import Optional
from datetime import datetime

from pydantic import BaseModel


class DiarisationSegmentResponse(BaseModel):
    id: str
    start_time: float
    end_time: float
    text: str
    order_index: int
    speaker_id: Optional[str] = None
    speaker_label: Optional[str] = None

    model_config = {"from_attributes": True}


class DiarisationSpeakerResponse(BaseModel):
    id: str
    speaker_id: str
    display_name: Optional[str] = None
    color_index: int
    segment_count: int
    total_duration: float
    profile_id: Optional[str] = None

    model_config = {"from_attributes": True}


class DiarisationJobResponse(BaseModel):
    id: str
    title: str
    status: str
    progress: int
    progress_message: Optional[str] = None
    error_message: Optional[str] = None
    original_filename: Optional[str] = None
    duration_seconds: Optional[float] = None
    audio_file_size: Optional[int] = None
    language: str
    mode: str
    num_speakers: Optional[int] = None
    detected_speakers: Optional[int] = None
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class DiarisationJobDetailResponse(DiarisationJobResponse):
    segments: list[DiarisationSegmentResponse] = []
    speakers: list[DiarisationSpeakerResponse] = []


class DiarisationJobUploadResponse(BaseModel):
    id: str
    filename: str
    duration_seconds: Optional[float] = None
    message: str


class SpeakerRenameRequest(BaseModel):
    display_name: str


class EnrollFromSegmentRequest(BaseModel):
    start_time: float
    end_time: float
    speaker_profile_id: Optional[str] = None  # existing profile
    contact_id: Optional[str] = None  # link to contact
    # Inline creation (bypass consent for super_admin test mode)
    first_name: Optional[str] = None
    last_name: Optional[str] = None
    fonction: Optional[str] = None


class OralConsentDetectionResponse(BaseModel):
    detected: bool
    detection_type: Optional[str] = None  # "collective_consent" | "individual_refusal" | None
    consent_phrase: Optional[str] = None
    segment_id: Optional[str] = None
    start_time: Optional[float] = None
    end_time: Optional[float] = None
    confidence: Optional[str] = None  # "high" | "medium" | "low"
    explanation: Optional[str] = None
    # Refusal details
    refusal_speaker_id: Optional[str] = None   # SPEAKER_XX who refused (if identifiable)
    refusal_speaker_label: Optional[str] = None  # display name if available


class ValidateCollectiveConsentRequest(BaseModel):
    consent_segment_id: Optional[str] = None  # segment where consent was detected
    contact_ids: list[str] = []  # contacts to tag as consented
