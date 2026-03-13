from __future__ import annotations

import uuid
from datetime import datetime

from sqlalchemy import Boolean, String, Integer, DateTime, Text
from sqlalchemy.dialects.postgresql import UUID, JSONB
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db import Base


class ScrapeJob(Base):
    __tablename__ = "scrape_jobs"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    search_query: Mapped[str] = mapped_column(Text, nullable=False)
    sector: Mapped[str | None] = mapped_column(Text, nullable=True)
    status: Mapped[str] = mapped_column(String(30), default="pending")  # pending/running/downloading_videos/completed/failed
    total_posts: Mapped[int | None] = mapped_column(Integer, nullable=True)
    apify_run_id: Mapped[str | None] = mapped_column(String(255), nullable=True)
    apify_run_ids: Mapped[list | None] = mapped_column(JSONB, nullable=True)  # list of run IDs (one per watched account)
    video_download_run_id: Mapped[str | None] = mapped_column(Text, nullable=True)
    brightdata_snapshot_id: Mapped[str | None] = mapped_column(Text, nullable=True)
    instagram_snapshot_id: Mapped[str | None] = mapped_column(Text, nullable=True)
    tiktok_snapshot_id: Mapped[str | None] = mapped_column(Text, nullable=True)
    scraper_backend: Mapped[str | None] = mapped_column(String(50), nullable=True)  # "apify" | "brightdata" | "brightdata+profile+instagram"
    profile_apify_run_ids: Mapped[list | None] = mapped_column(JSONB, nullable=True)
    error_message: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    completed_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    # Scrape params (persisted for use during fetch)
    scrape_posts_per_account: Mapped[int | None] = mapped_column(Integer, nullable=True)
    scrape_by_date: Mapped[bool | None] = mapped_column(Boolean, nullable=True)
    # Custom search fields
    is_custom_search: Mapped[bool | None] = mapped_column(Boolean, nullable=True, default=False)
    user_email: Mapped[str | None] = mapped_column(String(200), nullable=True)
    custom_account_url: Mapped[str | None] = mapped_column(Text, nullable=True)
    custom_account_name: Mapped[str | None] = mapped_column(String(200), nullable=True)
    custom_account_type: Mapped[str | None] = mapped_column(String(50), nullable=True)  # "company" | "person"
    scrape_date_since_months: Mapped[int | None] = mapped_column(Integer, nullable=True)  # 1, 3, 6, 12, None=all

    posts = relationship("Post", back_populates="scrape_job", lazy="selectin")
