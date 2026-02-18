from __future__ import annotations

import uuid
from datetime import datetime

from sqlalchemy import String, Integer, Boolean, DateTime, Text
from sqlalchemy.dialects.postgresql import UUID, JSONB
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db import Base


class ScrapeJob(Base):
    __tablename__ = "scrape_jobs"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    search_query: Mapped[str] = mapped_column(Text, nullable=False)
    sector: Mapped[str | None] = mapped_column(Text, nullable=True)
    content_type_filter: Mapped[str | None] = mapped_column(String(50), nullable=True)
    is_corporate: Mapped[bool] = mapped_column(Boolean, default=False)
    max_results: Mapped[int] = mapped_column(Integer, default=50)
    status: Mapped[str] = mapped_column(String(30), default="pending")  # pending/running/downloading_videos/completed/failed
    total_posts: Mapped[int | None] = mapped_column(Integer, nullable=True)
    apify_run_id: Mapped[str | None] = mapped_column(String(255), nullable=True)
    apify_run_ids: Mapped[list | None] = mapped_column(JSONB, nullable=True)  # list of run IDs (one per watched account)
    video_download_run_id: Mapped[str | None] = mapped_column(Text, nullable=True)
    error_message: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    completed_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)

    posts = relationship("Post", back_populates="scrape_job", lazy="selectin")
