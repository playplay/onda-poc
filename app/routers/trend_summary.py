from __future__ import annotations

import uuid

from fastapi import APIRouter, Depends
from fastapi.responses import StreamingResponse
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.db import get_db
from app.models.post import Post, GeminiAnalysis
from app.schemas.post import PostOut
from app.schemas.analysis import AnalysisOut
from app.services.ranking import get_top_trends
from app.services.anthropic_summary import stream_trend_summary

router = APIRouter()


async def _get_trend_and_posts(
    db: AsyncSession, job_id: uuid.UUID, rank: int
) -> tuple[dict | None, list[Post], dict[uuid.UUID, GeminiAnalysis]]:
    trends = await get_top_trends(db, job_id)
    trend = next((t for t in trends if t.rank == rank), None)
    if not trend:
        return None, [], {}

    result = await db.execute(
        select(Post)
        .where(Post.scrape_job_id == job_id, Post.format_family == trend.format_family)
        .order_by(Post.engagement_rate.desc().nullslast(), Post.engagement_score.desc())
    )
    posts = list(result.scalars().all())

    post_ids = [p.id for p in posts]
    analyses_result = await db.execute(
        select(GeminiAnalysis).where(GeminiAnalysis.post_id.in_(post_ids))
    )
    analyses_map = {a.post_id: a for a in analyses_result.scalars().all()}

    return (
        {
            "rank": trend.rank,
            "format_family": trend.format_family,
            "post_count": len(posts),
            "avg_engagement_rate": trend.avg_engagement_rate,
        },
        posts,
        analyses_map,
    )


@router.get("/trends/{job_id}/rank/{rank}/summary")
async def get_trend_summary_stream(
    job_id: uuid.UUID,
    rank: int,
    db: AsyncSession = Depends(get_db),
):
    trend_info, posts, analyses_map = await _get_trend_and_posts(db, job_id, rank)

    if not trend_info:
        import json
        return StreamingResponse(
            iter([f"data: {json.dumps({'type': 'error', 'message': 'Trend not found'})}\n\n"]),
            media_type="text/event-stream",
        )

    trend_data = {
        **trend_info,
        "posts": [
            {
                "title": p.title,
                "author_name": p.author_name,
                "author_company": p.author_company,
                "format_family": p.format_family,
                "reactions": p.reactions,
                "comments": p.comments,
                "shares": p.shares,
                "impressions": p.impressions,
                "engagement_score": p.engagement_score,
                "analysis": {
                    "business_objective": analyses_map[p.id].business_objective,
                    "use_case": analyses_map[p.id].use_case,
                    "creative_execution": analyses_map[p.id].creative_execution,
                    "audience_target": analyses_map[p.id].audience_target,
                    "tone_of_voice": analyses_map[p.id].tone_of_voice,
                } if p.id in analyses_map else None,
            }
            for p in posts
        ],
    }

    return StreamingResponse(
        stream_trend_summary(trend_data),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )


@router.get("/trends/{job_id}/rank/{rank}/posts")
async def get_trend_posts(
    job_id: uuid.UUID,
    rank: int,
    db: AsyncSession = Depends(get_db),
):
    trend_info, posts, analyses_map = await _get_trend_and_posts(db, job_id, rank)

    if not trend_info:
        return {"trend": None, "posts": [], "analyses": []}

    return {
        "trend": trend_info,
        "posts": [PostOut.model_validate(p) for p in posts],
        "analyses": [AnalysisOut.model_validate(a) for a in analyses_map.values()],
    }
