from __future__ import annotations

import uuid
from datetime import datetime

from sqlalchemy import String, Integer, DateTime, Text, Boolean
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.db import Base


class WatchedAccount(Base):
    __tablename__ = "watched_accounts"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    name: Mapped[str] = mapped_column(Text, nullable=False)
    type: Mapped[str] = mapped_column(String(20), nullable=False)  # "company"
    linkedin_url: Mapped[str | None] = mapped_column(Text, nullable=True)
    instagram_url: Mapped[str | None] = mapped_column(Text, nullable=True)
    tiktok_url: Mapped[str | None] = mapped_column(Text, nullable=True)
    sector: Mapped[str] = mapped_column(String(100), nullable=False)
    company_name: Mapped[str | None] = mapped_column(String(200), nullable=True)
    is_playplay_client: Mapped[bool] = mapped_column(Boolean, default=False, server_default="false")
    follower_count: Mapped[int | None] = mapped_column(Integer, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
