import uuid
from collections import defaultdict

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.post import Post
from app.schemas.post import PostOut, RankedTrendOut


def compute_engagement_score(
    reactions: int, comments: int, shares: int = 0, clicks: int = 0, impressions: int = 0
) -> float:
    """Compute engagement score: Reactions + Comments × 3."""
    return float(reactions + comments * 3)


async def get_top_trends(
    db: AsyncSession, scrape_job_id: uuid.UUID, limit: int = 10
) -> list[RankedTrendOut]:
    """Get top trends grouped by format_family, ordered by avg engagement score."""
    result = await db.execute(
        select(Post)
        .where(Post.scrape_job_id == scrape_job_id)
        .order_by(Post.engagement_score.desc())
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
        avg_score = sum(p.engagement_score for p in family_posts) / len(family_posts)
        trends.append(
            RankedTrendOut(
                rank=0,
                format_family=family,
                post_count=len(family_posts),
                avg_engagement_score=round(avg_score, 2),
                top_posts=[PostOut.model_validate(p) for p in family_posts[:5]],
            )
        )

    # Sort by avg engagement and assign ranks
    trends.sort(key=lambda t: t.avg_engagement_score, reverse=True)
    for i, trend in enumerate(trends[:limit]):
        trend.rank = i + 1

    return trends[:limit]
