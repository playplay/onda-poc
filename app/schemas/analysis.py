import uuid
from datetime import datetime

from pydantic import BaseModel


class AnalysisRequest(BaseModel):
    post_ids: list[uuid.UUID]


class AnalysisOut(BaseModel):
    id: uuid.UUID
    post_id: uuid.UUID
    business_objective: str | None
    use_case: str | None
    audience_target: str | None
    tone_of_voice: str | None
    content_style: str | None
    storytelling_approach: str | None
    creative_execution: str | None
    icp: str | None
    script_hook: str | None
    script_outline: str | None
    script_cta: str | None
    voice_language: str | None
    text_language: str | None
    contains_an_interview_footage: bool | None
    video_dynamism: str | None
    media_analyzed: str | None
    full_analysis: dict | None
    created_at: datetime

    model_config = {"from_attributes": True}


class AnalysisStartOut(BaseModel):
    total: int
    pending: int


class AnalysisProgressOut(BaseModel):
    processed: int
    total: int
    all_done: bool
    current_analysis: AnalysisOut | None = None
