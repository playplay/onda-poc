import uuid
from collections import defaultdict
from datetime import datetime, timedelta

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.post import Post
from app.schemas.post import PostOut, RankedTrendOut


def compute_engagement_score(
    reactions: int, comments: int, shares: int = 0, clicks: int = 0, impressions: int = 0
) -> float:
    """Compute engagement score: Reactions + Comments × 3."""
    return float(reactions + comments * 3)


def compute_engagement_rate(
    reactions: int, comments: int, follower_count: int | None
) -> float | None:
    """(reactions + comments) / followers * 100. None if no follower count."""
    if not follower_count or follower_count <= 0:
        return None
    return (reactions + comments) / follower_count * 100


MIN_POST_AGE_HOURS = 48


def select_top_posts(
    items: list[dict],
    *,
    posts_to_keep: int,
    get_date,       # item -> datetime | None
    get_reactions,  # item -> int
    get_comments,   # item -> int
    get_followers,  # item -> int | None
    by_date: bool = False,
) -> list[dict]:
    """Select top N posts. If by_date=True: sort by date desc. Otherwise: rank by engagement rate."""
    if by_date:
        sorted_items = sorted(items, key=lambda x: get_date(x) or datetime.min, reverse=True)
        return sorted_items[:posts_to_keep]

    cutoff = datetime.utcnow() - timedelta(hours=MIN_POST_AGE_HOURS)

    # 1. Filter out posts younger than 48h
    eligible = []
    for item in items:
        pub_date = get_date(item)
        if pub_date is not None and pub_date > cutoff:
            continue
        eligible.append(item)

    # 2. Sort by engagement rate (fallback to engagement_score if no followers)
    def sort_key(item):
        reactions = get_reactions(item)
        comments = get_comments(item)
        followers = get_followers(item)
        rate = compute_engagement_rate(reactions, comments, followers)
        if rate is not None:
            return (1, rate)
        return (0, compute_engagement_score(reactions, comments))

    eligible.sort(key=sort_key, reverse=True)
    return eligible[:posts_to_keep]


def get_engagement_level(
    engagement_rate: float | None, follower_count: int | None
) -> str:
    """Return 'viral', 'engaging', or 'neutral' based on rate and account size."""
    if engagement_rate is None:
        return "neutral"
    if follower_count and follower_count >= 100_000:
        return "viral" if engagement_rate > 2 else ("engaging" if engagement_rate >= 0.5 else "neutral")
    elif follower_count and follower_count >= 10_000:
        return "viral" if engagement_rate > 3 else ("engaging" if engagement_rate >= 1 else "neutral")
    else:
        return "viral" if engagement_rate > 5 else ("engaging" if engagement_rate >= 2 else "neutral")


async def get_top_trends(
    db: AsyncSession, scrape_job_id: uuid.UUID, limit: int = 10
) -> list[RankedTrendOut]:
    """Get top trends grouped by format_family, ordered by avg engagement rate."""
    result = await db.execute(
        select(Post)
        .where(Post.scrape_job_id == scrape_job_id)
        .order_by(Post.engagement_rate.desc().nullslast(), Post.engagement_score.desc())
    )
    posts = result.scalars().all()

    # Group by format_family
    groups: dict[str, list[Post]] = defaultdict(list)
    for post in posts:
        family = post.format_family or "unknown"
        groups[family].append(post)

    # Build ranked trends
    trends = []
    for family, family_posts in groups.items():
        rates = [p.engagement_rate for p in family_posts if p.engagement_rate is not None]
        avg_rate = sum(rates) / len(rates) if rates else 0.0
        trends.append(
            RankedTrendOut(
                rank=0,
                format_family=family,
                post_count=len(family_posts),
                avg_engagement_rate=round(avg_rate, 2),
                top_posts=[PostOut.model_validate(p) for p in family_posts[:5]],
            )
        )

    # Sort by avg engagement rate and assign ranks
    trends.sort(key=lambda t: t.avg_engagement_rate, reverse=True)
    for i, trend in enumerate(trends[:limit]):
        trend.rank = i + 1

    return trends[:limit]
