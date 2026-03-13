from __future__ import annotations

import uuid
from collections import defaultdict
from datetime import datetime

from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from app.models.post import Post
from app.models.scrape_job import ScrapeJob
from app.models.trend_snapshot import TrendSnapshot


async def generate_trend_snapshot(db: AsyncSession, job: ScrapeJob) -> None:
    """Generate trend snapshot rows for a completed scrape job."""
    result = await db.execute(
        select(Post).where(Post.scrape_job_id == job.id)
    )
    posts = result.scalars().all()
    if not posts:
        return

    now = datetime.utcnow()
    snapshots: list[TrendSnapshot] = []

    # Group by use_case
    uc_groups: dict[str, list[Post]] = defaultdict(list)
    for p in posts:
        if p.claude_use_case:
            uc_groups[p.claude_use_case].append(p)
    for value, group in uc_groups.items():
        rates = [p.engagement_rate for p in group if p.engagement_rate is not None]
        snapshots.append(TrendSnapshot(
            id=uuid.uuid4(),
            scrape_job_id=job.id,
            snapshot_date=now,
            dimension="use_case",
            dimension_value=value,
            post_count=len(group),
            avg_engagement_rate=sum(rates) / len(rates) if rates else None,
        ))

    # Group by format_family
    fmt_groups: dict[str, list[Post]] = defaultdict(list)
    for p in posts:
        fmt = p.format_family
        if fmt:
            # Normalize short_video/long_video → video
            key = fmt.lower()
            if key in ("short_video", "long_video"):
                key = "video"
            fmt_groups[key].append(p)
    for value, group in fmt_groups.items():
        rates = [p.engagement_rate for p in group if p.engagement_rate is not None]
        snapshots.append(TrendSnapshot(
            id=uuid.uuid4(),
            scrape_job_id=job.id,
            snapshot_date=now,
            dimension="format",
            dimension_value=value,
            post_count=len(group),
            avg_engagement_rate=sum(rates) / len(rates) if rates else None,
        ))

    # Group by platform
    plat_groups: dict[str, list[Post]] = defaultdict(list)
    for p in posts:
        plat_groups[p.platform or "linkedin"].append(p)
    for value, group in plat_groups.items():
        rates = [p.engagement_rate for p in group if p.engagement_rate is not None]
        snapshots.append(TrendSnapshot(
            id=uuid.uuid4(),
            scrape_job_id=job.id,
            snapshot_date=now,
            dimension="platform",
            dimension_value=value,
            post_count=len(group),
            avg_engagement_rate=sum(rates) / len(rates) if rates else None,
        ))

    db.add_all(snapshots)
