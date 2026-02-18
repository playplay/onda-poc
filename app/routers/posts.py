from __future__ import annotations

import uuid

from fastapi import APIRouter, Depends, Query
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.db import get_db
from app.models.post import Post
from app.schemas.post import PostOut, RankedTrendOut
from app.services.ranking import get_top_trends

router = APIRouter()


@router.get("/posts", response_model=list[PostOut])
async def list_posts(
    scrape_job_id: uuid.UUID = Query(..., description="Filter by scrape job"),
    sector: str | None = Query(None),
    format_family: str | None = Query(None),
    sort_by: str = Query("engagement_score", description="Sort field"),
    limit: int = Query(50, ge=1, le=500),
    offset: int = Query(0, ge=0),
    db: AsyncSession = Depends(get_db),
):
    """List posts with filtering and sorting."""
    stmt = select(Post).where(Post.scrape_job_id == scrape_job_id)

    if sector:
        stmt = stmt.where(Post.sector == sector)
    if format_family:
        stmt = stmt.where(Post.format_family == format_family)

    # Sorting
    sort_column = getattr(Post, sort_by, Post.engagement_score)
    stmt = stmt.order_by(sort_column.desc()).offset(offset).limit(limit)

    result = await db.execute(stmt)
    return result.scalars().all()


@router.get("/posts/ranking", response_model=list[RankedTrendOut])
async def get_ranking(
    scrape_job_id: uuid.UUID = Query(..., description="Scrape job to rank"),
    limit: int = Query(10, ge=1, le=50),
    db: AsyncSession = Depends(get_db),
):
    """Get Top N trends grouped by format_family, ordered by avg engagement."""
    return await get_top_trends(db, scrape_job_id, limit=limit)
