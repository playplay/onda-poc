from __future__ import annotations

import uuid

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.db import get_db
from app.models.post import Post, GeminiAnalysis
from app.schemas.analysis import (
    AnalysisRequest,
    AnalysisOut,
    AnalysisStartOut,
    AnalysisProgressOut,
)
from app.services.gemini import call_gemini, build_analysis

router = APIRouter()


@router.get("/analysis", response_model=list[AnalysisOut])
async def list_analyses(
    scrape_job_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
):
    """Get all Gemini analyses for posts in a scrape job."""
    result = await db.execute(
        select(GeminiAnalysis)
        .join(Post, GeminiAnalysis.post_id == Post.id)
        .where(Post.scrape_job_id == scrape_job_id)
    )
    return list(result.scalars().all())


@router.post("/analysis", response_model=AnalysisStartOut)
async def start_analysis(
    req: AnalysisRequest,
    db: AsyncSession = Depends(get_db),
):
    """Start analysis: count posts that need analysis. Returns immediately."""
    total = 0
    pending = 0

    for post_id in req.post_ids:
        post = await db.get(Post, post_id)
        if not post:
            continue

        total += 1

        existing = await db.execute(
            select(GeminiAnalysis).where(GeminiAnalysis.post_id == post_id)
        )
        if not existing.scalar_one_or_none():
            pending += 1

    return AnalysisStartOut(total=total, pending=pending)


@router.post("/analysis/process-next", response_model=AnalysisProgressOut)
async def process_next_analysis(
    req: AnalysisRequest,
    db: AsyncSession = Depends(get_db),
):
    """Process 1 unanalyzed post from the given list. Call in a loop until all_done."""
    total = len(req.post_ids)
    processed = 0

    # Find next unanalyzed post
    next_post: Post | None = None
    for post_id in req.post_ids:
        existing = await db.execute(
            select(GeminiAnalysis).where(GeminiAnalysis.post_id == post_id)
        )
        if existing.scalar_one_or_none():
            processed += 1
        elif next_post is None:
            post = await db.get(Post, post_id)
            if post:
                next_post = post

    if next_post is None:
        return AnalysisProgressOut(
            processed=processed,
            total=total,
            all_done=True,
            current_analysis=None,
        )

    # Analyze this one post
    parsed = await call_gemini(
        video_url=next_post.video_url,
        thumbnail_url=next_post.image_url,
        post_text=next_post.title,
    )

    current_analysis = None
    if parsed:
        analysis = build_analysis(next_post.id, parsed)
        db.add(analysis)
        await db.commit()
        current_analysis = analysis

    processed += 1

    return AnalysisProgressOut(
        processed=processed,
        total=total,
        all_done=(processed >= total),
        current_analysis=AnalysisOut.model_validate(current_analysis) if current_analysis else None,
    )


@router.get("/analysis/{post_id}", response_model=AnalysisOut | None)
async def get_analysis(
    post_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
):
    """Get Gemini analysis for a specific post."""
    result = await db.execute(
        select(GeminiAnalysis).where(GeminiAnalysis.post_id == post_id)
    )
    analysis = result.scalar_one_or_none()
    if not analysis:
        raise HTTPException(status_code=404, detail="Analysis not found for this post")
    return analysis
