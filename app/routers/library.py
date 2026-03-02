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


def _normalize_format(fmt: str | None) -> str | None:
    if not fmt:
        return None
    key = fmt.lower()
    if key in ("short_video", "long_video"):
        return "video"
    return key


@router.get("/library", response_model=LibraryResponse)
async def get_library(db: AsyncSession = Depends(get_db)):
    """Return top 10 posts per format + top 10 per use case across all completed jobs."""
    stmt = (
        select(Post)
        .join(ScrapeJob, Post.scrape_job_id == ScrapeJob.id)
        .where(ScrapeJob.status == "completed")
        .where(Post.engagement_rate.isnot(None))
        .order_by(Post.engagement_rate.desc())
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

    # Union of both sets
    selected_ids: set = set()
    selected: list[Post] = []
    for bucket in list(format_buckets.values()) + list(use_case_buckets.values()):
        for p in bucket:
            if p.id not in selected_ids:
                selected_ids.add(p.id)
                selected.append(p)

    # Sort by engagement_rate desc
    selected.sort(key=lambda p: p.engagement_rate or 0, reverse=True)

    # Build filter lists
    sectors = sorted({p.sector for p in selected if p.sector})
    format_families = sorted({_normalize_format(p.format_family) for p in selected if p.format_family} - {None})
    use_cases = sorted({p.claude_use_case for p in selected if p.claude_use_case})

    return LibraryResponse(
        posts=selected,
        sectors=sectors,
        format_families=format_families,
        use_cases=use_cases,
    )
