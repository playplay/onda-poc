from __future__ import annotations

import uuid
from datetime import datetime

from sqlalchemy import String, Integer, Float, DateTime, Text, Boolean, ForeignKey, Index
from sqlalchemy.dialects.postgresql import UUID, JSONB
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db import Base


class Post(Base):
    __tablename__ = "posts"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    scrape_job_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("scrape_jobs.id"), nullable=False)
    title: Mapped[str | None] = mapped_column(Text, nullable=True)
    author_name: Mapped[str | None] = mapped_column(Text, nullable=True)
    author_company: Mapped[str | None] = mapped_column(Text, nullable=True)
    sector: Mapped[str | None] = mapped_column(String(100), nullable=True)
    platform: Mapped[str] = mapped_column(String(50), default="linkedin")
    content_type: Mapped[str | None] = mapped_column(String(50), nullable=True)
    format_family: Mapped[str | None] = mapped_column(String(50), nullable=True)  # video / carousel / image / text
    format_variation: Mapped[str | None] = mapped_column(String(100), nullable=True)  # Gemini-classified
    reactions: Mapped[int] = mapped_column(Integer, default=0)
    comments: Mapped[int] = mapped_column(Integer, default=0)
    shares: Mapped[int] = mapped_column(Integer, default=0)
    clicks: Mapped[int] = mapped_column(Integer, default=0)
    impressions: Mapped[int] = mapped_column(Integer, default=0)
    engagement_score: Mapped[float] = mapped_column(Float, default=0.0)
    author_follower_count: Mapped[int | None] = mapped_column(Integer, nullable=True)
    engagement_rate: Mapped[float | None] = mapped_column(Float, nullable=True)
    post_url: Mapped[str | None] = mapped_column(Text, nullable=True)
    video_url: Mapped[str | None] = mapped_column(Text, nullable=True)
    image_url: Mapped[str | None] = mapped_column(Text, nullable=True)
    duration_seconds: Mapped[float | None] = mapped_column(Float, nullable=True)
    publication_date: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    raw_data: Mapped[dict | None] = mapped_column(JSONB, nullable=True)
    claude_use_case: Mapped[str | None] = mapped_column(String(200), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    # PlayPlay flags (collaborative, shared between users)
    playplay_flag: Mapped[bool] = mapped_column(Boolean, default=False, server_default="false")
    playplay_flag_by: Mapped[str | None] = mapped_column(String(200), nullable=True)
    playplay_flag_name: Mapped[str | None] = mapped_column(String(200), nullable=True)
    playplay_flag_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    playplay_design_flag: Mapped[bool] = mapped_column(Boolean, default=False, server_default="false")
    playplay_design_flag_by: Mapped[str | None] = mapped_column(String(200), nullable=True)
    playplay_design_flag_name: Mapped[str | None] = mapped_column(String(200), nullable=True)
    playplay_design_flag_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)

    scrape_job = relationship("ScrapeJob", back_populates="posts")
    gemini_analysis = relationship("GeminiAnalysis", back_populates="post", uselist=False, lazy="selectin")

    __table_args__ = (
        Index("ix_posts_scrape_job_id", "scrape_job_id"),
        Index("ix_posts_sector", "sector"),
        Index("ix_posts_format_family", "format_family"),
        Index("ix_posts_engagement_score", "engagement_score"),
    )


class GeminiAnalysis(Base):
    __tablename__ = "gemini_analyses"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    post_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("posts.id"), unique=True, nullable=False)

    # 15 structured analysis fields
    business_objective: Mapped[str | None] = mapped_column(String(100), nullable=True)
    use_case: Mapped[str | None] = mapped_column(String(200), nullable=True)
    audience_target: Mapped[str | None] = mapped_column(String(100), nullable=True)
    tone_of_voice: Mapped[str | None] = mapped_column(String(100), nullable=True)
    content_style: Mapped[str | None] = mapped_column(String(100), nullable=True)
    storytelling_approach: Mapped[str | None] = mapped_column(String(200), nullable=True)
    creative_execution: Mapped[str | None] = mapped_column(String(200), nullable=True)
    icp: Mapped[str | None] = mapped_column(String(200), nullable=True)
    script_hook: Mapped[str | None] = mapped_column(Text, nullable=True)
    script_outline: Mapped[str | None] = mapped_column(Text, nullable=True)
    script_cta: Mapped[str | None] = mapped_column(Text, nullable=True)
    voice_language: Mapped[str | None] = mapped_column(String(50), nullable=True)
    text_language: Mapped[str | None] = mapped_column(String(50), nullable=True)
    contains_an_interview_footage: Mapped[bool | None] = mapped_column(Boolean, nullable=True)
    video_dynamism: Mapped[str | None] = mapped_column(String(50), nullable=True)
    media_analyzed: Mapped[str | None] = mapped_column(String(20), nullable=True)  # video / thumbnail / text_only

    full_analysis: Mapped[dict | None] = mapped_column(JSONB, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)

    post = relationship("Post", back_populates="gemini_analysis")
