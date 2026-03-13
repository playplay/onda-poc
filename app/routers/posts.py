from __future__ import annotations

import uuid
from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth import get_current_user
from app.db import get_db
from app.models.post import Post
from app.schemas.post import PostOut, RankedTrendOut
from app.services.ranking import get_top_trends

router = APIRouter()


class PlayPlayFlagRequest(BaseModel):
    flag_type: str  # "playplay" | "playplay_design"
    value: bool


@router.get("/posts", response_model=list[PostOut])
async def list_posts(
    scrape_job_id: uuid.UUID = Query(..., description="Filter by scrape job"),
    sector: str | None = Query(None),
    format_family: str | None = Query(None),
    sort_by: str = Query("engagement_rate", description="Sort field"),
    limit: int = Query(200, ge=1, le=500),
    offset: int = Query(0, ge=0),
    db: AsyncSession = Depends(get_db),
):
    """List posts with filtering and sorting."""
    stmt = select(Post).where(Post.scrape_job_id == scrape_job_id)

    if sector:
        stmt = stmt.where(Post.sector == sector)
    if format_family:
        stmt = stmt.where(Post.format_family == format_family)

    # Sorting: primary by engagement_rate, secondary by engagement_score for posts without rate
    sort_column = getattr(Post, sort_by, Post.engagement_rate)
    stmt = stmt.order_by(sort_column.desc().nullslast(), Post.engagement_score.desc()).offset(offset).limit(limit)

    result = await db.execute(stmt)
    return result.scalars().all()


@router.patch("/posts/{post_id}/playplay-flag", response_model=PostOut)
async def set_playplay_flag(
    post_id: uuid.UUID,
    body: PlayPlayFlagRequest,
    request: Request,
    db: AsyncSession = Depends(get_db),
):
    """Set or clear a PlayPlay flag on a post (collaborative, shared between users)."""
    user = get_current_user(request)
    post = await db.get(Post, post_id)
    if not post:
        raise HTTPException(status_code=404, detail="Post not found")

    if body.flag_type == "playplay":
        post.playplay_flag = body.value
        post.playplay_flag_by = user["email"]
        post.playplay_flag_name = user["name"]
        post.playplay_flag_at = datetime.utcnow()
    elif body.flag_type == "playplay_design":
        post.playplay_design_flag = body.value
        post.playplay_design_flag_by = user["email"]
        post.playplay_design_flag_name = user["name"]
        post.playplay_design_flag_at = datetime.utcnow()
    else:
        raise HTTPException(status_code=422, detail="flag_type must be 'playplay' or 'playplay_design'")

    await db.commit()
    await db.refresh(post)
    return post


@router.get("/posts/ranking", response_model=list[RankedTrendOut])
async def get_ranking(
    scrape_job_id: uuid.UUID = Query(..., description="Scrape job to rank"),
    limit: int = Query(10, ge=1, le=50),
    db: AsyncSession = Depends(get_db),
):
    """Get Top N trends grouped by format_family, ordered by avg engagement."""
    return await get_top_trends(db, scrape_job_id, limit=limit)
