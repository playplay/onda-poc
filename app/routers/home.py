from __future__ import annotations

from datetime import datetime, timedelta

from fastapi import APIRouter, Depends
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.db import get_db
from app.models.post import Post
from app.models.scrape_job import ScrapeJob
from app.schemas.post import PostOut
from app.services.ranking import get_engagement_level

router = APIRouter()


def _is_viral(rate: float | None, followers: int | None) -> bool:
    return get_engagement_level(rate, followers) == "viral"


class HomeInsightsResponse(BaseModel):
    top_posts_linkedin: list[PostOut]
    top_posts_instagram: list[PostOut]
    top_posts_tiktok: list[PostOut]


@router.get("/home/insights", response_model=HomeInsightsResponse)
async def get_home_insights(db: AsyncSession = Depends(get_db)):
    two_weeks_ago = datetime.utcnow() - timedelta(weeks=2)

    # Load all completed posts with engagement_rate
    base_stmt = (
        select(Post)
        .join(ScrapeJob, Post.scrape_job_id == ScrapeJob.id)
        .where(ScrapeJob.status == "completed")
        .where(Post.engagement_rate.isnot(None))
    )
    result = await db.execute(base_stmt)
    all_posts = result.scalars().all()

    # Dedup by post_url (keep highest engagement_rate)
    seen_urls: set[str] = set()
    deduped: list[Post] = []
    all_posts_sorted = sorted(all_posts, key=lambda p: -(p.engagement_rate or 0))
    for p in all_posts_sorted:
        key = p.post_url or str(p.id)
        if key not in seen_urls:
            seen_urls.add(key)
            deduped.append(p)

    def _top3_for_platform(posts: list[Post], platform: str) -> list[Post]:
        plat_all = [p for p in posts if (p.platform or "linkedin") == platform]
        # Prefer recent posts; fall back to all if fewer than 3 recent
        plat_recent = [p for p in plat_all if p.publication_date and p.publication_date >= two_weeks_ago]
        pool = plat_recent if len(plat_recent) >= 3 else plat_all
        # Sort by engagement label priority (viral > engaging > neutral), then engagement_rate desc
        pool.sort(key=lambda p: (
            0 if _is_viral(p.engagement_rate, p.author_follower_count) else 1,
            -(p.engagement_rate or 0),
        ))
        return pool[:3]

    return HomeInsightsResponse(
        top_posts_linkedin=_top3_for_platform(deduped, "linkedin"),
        top_posts_instagram=_top3_for_platform(deduped, "instagram"),
        top_posts_tiktok=_top3_for_platform(deduped, "tiktok"),
    )
