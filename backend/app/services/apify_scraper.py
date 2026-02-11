"""
Apify scraper service for LinkedIn posts.
Uses actor: powerai/linkedin-posts-search-scraper

NOTE: Carlo will guide on exact Apify output field mapping during implementation.
The field mapping below is a best-guess based on the actor's documentation.
"""

import asyncio
import uuid
from datetime import datetime

from apify_client import ApifyClient
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.models.post import Post
from app.models.scrape_job import ScrapeJob
from app.services.classifier import classify_format_family
from app.services.industry_codes import names_to_urns
from app.services.ranking import compute_engagement_score

import logging
logger = logging.getLogger(__name__)

ACTOR_ID = "powerai~linkedin-posts-search-scraper"


async def run_scrape(db: AsyncSession, job: ScrapeJob) -> None:
    """Execute Apify scrape and store results."""
    job.status = "running"
    await db.commit()

    try:
        client = ApifyClient(settings.APIFY_TOKEN)

        # Build actor input (field names from actor's input schema)
        actor_input = {
            "query": job.search_query,
            "maxResults": job.max_results,
            "sort_by": "relevance",
            "content_type": job.content_type_filter or "",
        }
        if job.sector:
            urns = names_to_urns(job.sector)
            if urns:
                actor_input["author_industry"] = urns
            else:
                # Fallback: send raw text if no URN mapping found
                actor_input["author_industry"] = job.sector

        logger.info(f"Apify actor input: {actor_input}")

        # Run actor in a thread to avoid blocking the async event loop
        run = await asyncio.to_thread(
            client.actor(ACTOR_ID).call, run_input=actor_input
        )
        job.apify_run_id = run.get("id")

        # Fetch results from dataset (also in thread)
        dataset_items = await asyncio.to_thread(
            lambda: list(client.dataset(run["defaultDatasetId"]).iterate_items())
        )

        # Map results to Post models
        for item in dataset_items:
            social = item.get("social_details") or {}
            actor_info = item.get("actor") or {}

            reactions = int(social.get("numLikes", 0) or 0)
            comments_count = int(social.get("numComments", 0) or 0)
            shares = int(social.get("numShares", 0) or 0)
            clicks = 0  # not provided by this actor
            impressions = 0  # not provided by this actor

            # Video info is in linkedInVideoComponent (duration in ms)
            video_component = item.get("linkedInVideoComponent") or {}
            has_video = bool(video_component)
            video_url = video_component.get("thumbnail")
            image_url = video_component.get("thumbnail")
            duration_ms = video_component.get("duration")
            duration_seconds = duration_ms / 1000.0 if duration_ms else None
            content_type = "video" if has_video else "text"

            format_family = classify_format_family(
                content_type=content_type,
                duration_seconds=duration_seconds,
                has_video=has_video,
                has_image=bool(image_url),
            )

            engagement = compute_engagement_score(
                reactions, comments_count, shares, clicks, impressions
            )

            pub_date = None
            raw_date = item.get("postedAt")
            if raw_date:
                try:
                    dt = datetime.fromisoformat(str(raw_date).replace("Z", "+00:00"))
                    pub_date = dt.replace(tzinfo=None)
                except (ValueError, TypeError):
                    pass

            commentary = item.get("commentary") or ""

            post = Post(
                id=uuid.uuid4(),
                scrape_job_id=job.id,
                title=commentary[:500] if commentary else None,
                author_name=actor_info.get("actor_name"),
                author_company=actor_info.get("actor_description"),
                sector=job.sector,
                platform="linkedin",
                content_type=content_type,
                format_family=format_family,
                reactions=reactions,
                comments=comments_count,
                shares=shares,
                clicks=clicks,
                impressions=impressions,
                engagement_score=engagement,
                post_url=item.get("share_url"),
                video_url=video_url,
                image_url=image_url,
                duration_seconds=duration_seconds,
                publication_date=pub_date,
                raw_data=item,
            )
            db.add(post)

        job.total_posts = len(dataset_items)
        job.status = "completed"
        job.completed_at = datetime.utcnow()

    except Exception as e:
        job.status = "failed"
        job.error_message = str(e)[:1000]
        job.completed_at = datetime.utcnow()

    await db.commit()
