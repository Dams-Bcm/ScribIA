from typing import Optional
from datetime import datetime

from pydantic import BaseModel


class TranscriptionSegmentResponse(BaseModel):
    id: str
    start_time: float
    end_time: float
    text: str
    order_index: int

    model_config = {"from_attributes": True}


class TranscriptionJobResponse(BaseModel):
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
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class TranscriptionJobDetailResponse(TranscriptionJobResponse):
    segments: list[TranscriptionSegmentResponse] = []
    consent_detection_result: Optional[str] = None


class TranscriptionJobUploadResponse(BaseModel):
    id: str
    filename: str
    duration_seconds: Optional[float] = None
    message: str
