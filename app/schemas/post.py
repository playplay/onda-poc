from __future__ import annotations

import uuid
from datetime import datetime

from pydantic import BaseModel


class PostOut(BaseModel):
    id: uuid.UUID
    scrape_job_id: uuid.UUID
    title: str | None
    author_name: str | None
    author_company: str | None
    sector: str | None
    platform: str
    content_type: str | None
    format_family: str | None
    format_variation: str | None
    reactions: int
    comments: int
    shares: int
    clicks: int
    impressions: int
    engagement_score: float
    author_follower_count: int | None
    engagement_rate: float | None
    post_url: str | None
    video_url: str | None
    image_url: str | None
    duration_seconds: float | None
    publication_date: datetime | None
    claude_use_case: str | None = None
    created_at: datetime
    playplay_flag: bool = False
    playplay_flag_by: str | None = None
    playplay_flag_name: str | None = None
    playplay_flag_at: datetime | None = None
    playplay_design_flag: bool = False
    playplay_design_flag_by: str | None = None
    playplay_design_flag_name: str | None = None
    playplay_design_flag_at: datetime | None = None

    model_config = {"from_attributes": True}


class RankedTrendOut(BaseModel):
    rank: int
    format_family: str
    post_count: int
    avg_engagement_rate: float
    top_posts: list[PostOut]
