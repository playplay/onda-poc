import asyncio
import uuid

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.db import get_db
from app.models.post import Post, GeminiAnalysis
from app.schemas.analysis import AnalysisRequest, AnalysisOut
from app.services.gemini import call_gemini, build_analysis

router = APIRouter()


@router.post("/analysis", response_model=list[AnalysisOut])
async def trigger_analysis(
    req: AnalysisRequest,
    db: AsyncSession = Depends(get_db),
):
    """Trigger Gemini analysis on selected posts (parallel API calls)."""
    # Gather posts that need analysis
    posts_to_analyze: list[Post] = []
    for post_id in req.post_ids:
        post = await db.get(Post, post_id)
        if not post or not post.video_url:
            continue

        existing = await db.execute(
            select(GeminiAnalysis).where(GeminiAnalysis.post_id == post_id)
        )
        if existing.scalar_one_or_none():
            continue

        posts_to_analyze.append(post)

    if not posts_to_analyze:
        return []

    # Fire all Gemini API calls in parallel
    api_results = await asyncio.gather(
        *(call_gemini(post.video_url) for post in posts_to_analyze)
    )

    # Build ORM objects and batch commit
    results: list[GeminiAnalysis] = []
    for post, parsed in zip(posts_to_analyze, api_results):
        if parsed is None:
            continue
        analysis = build_analysis(post.id, parsed)
        db.add(analysis)
        results.append(analysis)

    if results:
        await db.commit()

    return results


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
