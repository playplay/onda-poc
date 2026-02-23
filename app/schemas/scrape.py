from __future__ import annotations

import uuid
from datetime import datetime
from typing import Any

from pydantic import BaseModel, Field


class ScrapeRequest(BaseModel):
    sector: str = Field(..., min_length=1, description="Sector to scrape (must match a sector in watched_accounts)")


class ScrapeJobOut(BaseModel):
    id: uuid.UUID
    search_query: str
    sector: str | None
    status: str
    total_posts: int | None
    apify_run_id: str | None
    apify_run_ids: list[Any] | None
    video_download_run_id: str | None
    brightdata_snapshot_id: str | None = None
    scraper_backend: str | None = None
    profile_apify_run_ids: list[Any] | None = None
    error_message: str | None
    created_at: datetime
    completed_at: datetime | None

    model_config = {"from_attributes": True}
