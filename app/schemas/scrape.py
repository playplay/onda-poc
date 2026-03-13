from __future__ import annotations

import uuid
from datetime import datetime
from typing import Any

from pydantic import BaseModel, Field


class ScrapeRequest(BaseModel):
    sector: str | None = Field(None, description="Sector to scrape, or None for all sectors")
    csm_email: str | None = Field(None, description="Filter accounts by assigned CSM email")
    posts_per_account: int = Field(3, ge=1, le=50, description="Posts to keep per account")
    by_date: bool = Field(False, description="If true, select most recent posts instead of top engagement")


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
    instagram_snapshot_id: str | None = None
    scraper_backend: str | None = None
    profile_apify_run_ids: list[Any] | None = None
    error_message: str | None
    created_at: datetime
    completed_at: datetime | None
    is_custom_search: bool | None = None
    user_email: str | None = None
    custom_account_url: str | None = None
    custom_account_name: str | None = None
    custom_account_type: str | None = None
    scrape_date_since_months: int | None = None

    model_config = {"from_attributes": True}
