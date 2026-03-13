from __future__ import annotations

import re

from fastapi import APIRouter, Depends, Request
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth import get_current_user
from app.db import get_db
from app.models.post import Post
from app.models.scrape_job import ScrapeJob
from app.models.watched_account import WatchedAccount
from app.schemas.post import PostOut
from app.services.ranking import get_engagement_level

router = APIRouter()


class LibraryResponse(BaseModel):
    posts: list[PostOut]
    sectors: list[str]
    format_families: list[str]
    use_cases: list[str]
    platforms: list[str]


def _normalize_format(fmt: str | None) -> str | None:
    if not fmt:
        return None
    key = fmt.lower()
    if key in ("short_video", "long_video"):
        return "video"
    return key


_ENGAGEMENT_PRIORITY = {"viral": 0, "engaging": 1, "neutral": 2}


def _get_engagement_label(rate: float | None, followers: int | None) -> int:
    """Return engagement priority: Viral=0, Engaging=1, Neutral=2 (lower=better)."""
    return _ENGAGEMENT_PRIORITY[get_engagement_level(rate, followers)]


def _sort_key(p: Post) -> tuple[int, float]:
    """Sort by engagement label priority (asc), then engagement_rate (desc)."""
    label = _get_engagement_label(p.engagement_rate, p.author_follower_count)
    return (label, -(p.engagement_rate or 0))


@router.get("/library", response_model=LibraryResponse)
async def get_library(
    portfolio: bool = False,
    request: Request = None,
    db: AsyncSession = Depends(get_db),
):
    """Return all posts across completed jobs, deduped by post_url."""
    stmt = (
        select(Post)
        .join(ScrapeJob, Post.scrape_job_id == ScrapeJob.id)
        .where(ScrapeJob.status == "completed")
        .where(ScrapeJob.is_custom_search.isnot(True))
        .where(Post.engagement_rate.isnot(None))
        .order_by(Post.engagement_rate.desc())
    )

    # Portfolio filter: only posts from accounts assigned to the current user
    assigned_slugs: set[str] = set()
    if portfolio and request:
        user = get_current_user(request)
        acct_result = await db.execute(
            select(WatchedAccount.linkedin_url, WatchedAccount.instagram_url, WatchedAccount.tiktok_url)
            .where(WatchedAccount.assigned_cs_email == user["email"])
        )
        for linkedin_url, ig_url, tt_url in acct_result.all():
            if linkedin_url:
                m = re.search(r"/(company|in)/([^/]+)", linkedin_url)
                if m:
                    assigned_slugs.add(m.group(2).lower())
            if ig_url:
                m = re.search(r"instagram\.com/([^/]+)", ig_url)
                if m:
                    assigned_slugs.add(m.group(1).lower())
            if tt_url:
                m = re.search(r"tiktok\.com/@([^/?\s]+)", tt_url)
                if m:
                    assigned_slugs.add(m.group(1).lower())
        if not assigned_slugs:
            return LibraryResponse(posts=[], sectors=[], format_families=[], use_cases=[], platforms=[])

    result = await db.execute(stmt)
    all_posts = result.scalars().all()

    # Dedup by post_url (keep highest engagement_rate, which comes first)
    seen_urls: set[str] = set()
    deduped: list[Post] = []
    for p in all_posts:
        key = p.post_url or str(p.id)
        if key not in seen_urls:
            seen_urls.add(key)
            deduped.append(p)

    # Portfolio filter: filter by assigned account slugs
    if portfolio and request:
        deduped = [p for p in deduped if (p.author_name or "").lower() in assigned_slugs]

    # Sort by engagement label priority
    deduped.sort(key=_sort_key)

    # Build filter lists from all deduped posts
    sectors = sorted({p.sector for p in deduped if p.sector})
    format_families = sorted({_normalize_format(p.format_family) for p in deduped if p.format_family} - {None})
    use_cases = sorted({p.claude_use_case for p in deduped if p.claude_use_case})
    platforms = sorted({(p.platform or "linkedin") for p in deduped})

    return LibraryResponse(
        posts=deduped,
        sectors=sectors,
        format_families=format_families,
        use_cases=use_cases,
        platforms=platforms,
    )
