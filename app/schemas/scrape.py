import uuid
from datetime import datetime

from pydantic import BaseModel, Field


class ScrapeRequest(BaseModel):
    search_query: str = Field(..., min_length=1, description="LinkedIn search query")
    sector: str | None = Field(None, description="Sector filter (Health, Retail, Industry, Finance, Tech, Education, Sport, Media)")
    content_type_filter: str | None = Field(None, description="Content type: videos, images, documents, or null for all")
    is_corporate: bool = Field(False, description="Filter for corporate/organization content")
    organization: str | None = Field(None, description="Specific organization name for corporate filter")
    max_results: int = Field(50, ge=1, le=1000, description="Max results to scrape")


class ScrapeJobOut(BaseModel):
    id: uuid.UUID
    search_query: str
    sector: str | None
    content_type_filter: str | None
    is_corporate: bool
    max_results: int
    status: str
    total_posts: int | None
    apify_run_id: str | None
    video_download_run_id: str | None
    error_message: str | None
    created_at: datetime
    completed_at: datetime | None

    model_config = {"from_attributes": True}
