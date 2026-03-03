from __future__ import annotations

from fastapi import APIRouter, Depends
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.db import get_db
from app.models.post import Post
from app.models.scrape_job import ScrapeJob
from app.schemas.post import PostOut

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


def _get_engagement_label(rate: float | None, followers: int | None) -> int:
    """Return engagement priority: Viral=0, Engaging=1, Neutral=2 (lower=better)."""
    if rate is None:
        return 2
    if followers is not None and followers >= 100_000:
        return 0 if rate > 2 else (1 if rate >= 0.5 else 2)
    if followers is not None and followers >= 10_000:
        return 0 if rate > 3 else (1 if rate >= 1 else 2)
    return 0 if rate > 5 else (1 if rate >= 2 else 2)


def _sort_key(p: Post) -> tuple[int, float]:
    """Sort by engagement label priority (asc), then engagement_rate (desc)."""
    label = _get_engagement_label(p.engagement_rate, p.author_follower_count)
    return (label, -(p.engagement_rate or 0))


@router.get("/library", response_model=LibraryResponse)
async def get_library(db: AsyncSession = Depends(get_db)):
    """Return top posts across all completed jobs, bucketed by sector/format/use_case/platform."""
    stmt = (
        select(Post)
        .join(ScrapeJob, Post.scrape_job_id == ScrapeJob.id)
        .where(ScrapeJob.status == "completed")
        .where(Post.engagement_rate.isnot(None))
        .order_by(Post.engagement_rate.desc())
        .limit(500)
    )
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

    # Sort deduped by engagement label priority for bucketing
    deduped.sort(key=_sort_key)

    # Top 10 per sector
    sector_buckets: dict[str, list[Post]] = {}
    for p in deduped:
        s = p.sector
        if s:
            sector_buckets.setdefault(s, [])
            if len(sector_buckets[s]) < 10:
                sector_buckets[s].append(p)

    # Top 10 per format_family
    format_buckets: dict[str, list[Post]] = {}
    for p in deduped:
        fmt = _normalize_format(p.format_family)
        if fmt:
            format_buckets.setdefault(fmt, [])
            if len(format_buckets[fmt]) < 10:
                format_buckets[fmt].append(p)

    # Top 10 per claude_use_case
    use_case_buckets: dict[str, list[Post]] = {}
    for p in deduped:
        uc = p.claude_use_case
        if uc:
            use_case_buckets.setdefault(uc, [])
            if len(use_case_buckets[uc]) < 10:
                use_case_buckets[uc].append(p)

    # Top 10 per platform
    platform_buckets: dict[str, list[Post]] = {}
    for p in deduped:
        plat = p.platform or "linkedin"
        platform_buckets.setdefault(plat, [])
        if len(platform_buckets[plat]) < 10:
            platform_buckets[plat].append(p)

    # Union all 4 bucket types (dedup by post id)
    selected_ids: set = set()
    selected: list[Post] = []
    all_buckets = (
        list(sector_buckets.values())
        + list(format_buckets.values())
        + list(use_case_buckets.values())
        + list(platform_buckets.values())
    )
    for bucket in all_buckets:
        for p in bucket:
            if p.id not in selected_ids:
                selected_ids.add(p.id)
                selected.append(p)

    # Final sort by engagement label priority, then rate desc
    selected.sort(key=_sort_key)

    # Build filter lists
    sectors = sorted({p.sector for p in selected if p.sector})
    format_families = sorted({_normalize_format(p.format_family) for p in selected if p.format_family} - {None})
    use_cases = sorted({p.claude_use_case for p in selected if p.claude_use_case})
    platforms = sorted({(p.platform or "linkedin") for p in selected})

    return LibraryResponse(
        posts=selected,
        sectors=sectors,
        format_families=format_families,
        use_cases=use_cases,
        platforms=platforms,
    )
