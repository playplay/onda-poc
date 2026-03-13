from __future__ import annotations

import uuid
from datetime import datetime

from sqlalchemy import String, Integer, Float, DateTime, ForeignKey
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.db import Base


class TrendSnapshot(Base):
    __tablename__ = "trend_snapshots"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    scrape_job_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("scrape_jobs.id"), nullable=False)
    snapshot_date: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    dimension: Mapped[str] = mapped_column(String(50), nullable=False)  # "use_case" | "format" | "platform"
    dimension_value: Mapped[str] = mapped_column(String(200), nullable=False)
    post_count: Mapped[int] = mapped_column(Integer, nullable=False)
    avg_engagement_rate: Mapped[float | None] = mapped_column(Float, nullable=True)
