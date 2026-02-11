import uuid

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.db import get_db
from app.models.post import Post, GeminiAnalysis
from app.schemas.analysis import AnalysisRequest, AnalysisOut
from app.services.gemini import analyze_post

router = APIRouter()


@router.post("/analysis", response_model=list[AnalysisOut])
async def trigger_analysis(
    req: AnalysisRequest,
    db: AsyncSession = Depends(get_db),
):
    """Trigger Gemini analysis on selected posts."""
    results = []
    for post_id in req.post_ids:
        post = await db.get(Post, post_id)
        if not post:
            continue

        # Skip if already analyzed
        existing = await db.execute(
            select(GeminiAnalysis).where(GeminiAnalysis.post_id == post_id)
        )
        if existing.scalar_one_or_none():
            continue

        analysis = await analyze_post(db, post)
        if analysis:
            results.append(analysis)

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
