"""
Apify scraper service for LinkedIn posts — Onda multi-account mode.

Flow:
  start_scrape()            → launch one Apify run per WatchedAccount in the sector
  check_and_process_scrape() → poll until ALL runs succeed, merge & keep top-10
"""

import asyncio
import uuid
import logging
from datetime import datetime, timedelta, timezone

from apify_client import ApifyClient
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.models.post import Post
from app.models.scrape_job import ScrapeJob
from app.models.watched_account import WatchedAccount
from app.services.classifier import classify_format_family
from app.services.ranking import compute_engagement_score
from app.services.video_downloader import start_video_download

logger = logging.getLogger(__name__)

ACTOR_ID = "powerai~linkedin-posts-search-scraper"
MAX_RESULTS_PER_ACCOUNT = 3
TOP_N = 10
RECENT_DAYS = 30


async def start_scrape(db: AsyncSession, job: ScrapeJob) -> None:
    """Launch one Apify run per WatchedAccount in the sector. Non-blocking."""
    job.status = "running"

    try:
        # Fetch all watched accounts for this sector
        result = await db.execute(
            select(WatchedAccount).where(WatchedAccount.sector == job.sector)
        )
        accounts = result.scalars().all()

        if not accounts:
            job.status = "failed"
            job.error_message = f"No watched accounts found for sector: {job.sector}"
            job.completed_at = datetime.utcnow()
            await db.commit()
            return

        client = ApifyClient(settings.APIFY_TOKEN)

        # Launch one run per account in parallel (asyncio.gather via threads)
        async def start_run(account: WatchedAccount) -> str:
            actor_input = {
                "query": account.linkedin_url,
                "maxResults": MAX_RESULTS_PER_ACCOUNT,
                "sort_by": "relevance",
            }
            run = await asyncio.to_thread(
                client.actor(ACTOR_ID).start, run_input=actor_input
            )
            return run.get("id")

        run_ids = await asyncio.gather(*[start_run(a) for a in accounts])
        job.apify_run_ids = list(run_ids)
        logger.info(f"Launched {len(run_ids)} Apify runs for sector '{job.sector}': {run_ids}")

    except Exception as e:
        job.status = "failed"
        job.error_message = str(e)[:1000]
        job.completed_at = datetime.utcnow()

    await db.commit()


async def check_and_process_scrape(db: AsyncSession, job: ScrapeJob) -> None:
    """Check if ALL Apify runs are done; if so, merge/filter/top-10 and store."""
    if job.status != "running":
        return

    run_ids: list[str] = job.apify_run_ids or ([job.apify_run_id] if job.apify_run_id else [])
    if not run_ids:
        return

    try:
        client = ApifyClient(settings.APIFY_TOKEN)

        # Check status of all runs
        async def get_run_info(run_id: str):
            return await asyncio.to_thread(client.run(run_id).get)

        run_infos = await asyncio.gather(*[get_run_info(rid) for rid in run_ids])

        statuses = [info.get("status") for info in run_infos]

        # If any run is still active, wait
        if any(s in ("READY", "RUNNING") for s in statuses):
            return

        # If any run failed, mark job failed
        failed = [run_ids[i] for i, s in enumerate(statuses) if s != "SUCCEEDED"]
        if failed:
            job.status = "failed"
            job.error_message = f"Apify runs failed: {failed}"
            job.completed_at = datetime.utcnow()
            await db.commit()
            return

        # All runs succeeded — fetch datasets in parallel
        async def fetch_items(info) -> list:
            dataset_id = info.get("defaultDatasetId")
            return await asyncio.to_thread(
                lambda: list(client.dataset(dataset_id).iterate_items())
            )

        all_datasets = await asyncio.gather(*[fetch_items(info) for info in run_infos])
        all_items = [item for dataset in all_datasets for item in dataset]

        # Filter: only posts from the last RECENT_DAYS days
        cutoff = datetime.utcnow() - timedelta(days=RECENT_DAYS)
        recent_items = []
        for item in all_items:
            pub_date = _parse_date(item.get("postedAt"))
            if pub_date is None or pub_date >= cutoff:
                recent_items.append(item)

        # Sort by engagement (reactions + comments) descending, keep top 10
        def engagement(item) -> int:
            social = item.get("social_details") or {}
            return int(social.get("numLikes", 0) or 0) + int(social.get("numComments", 0) or 0)

        top_items = sorted(recent_items, key=engagement, reverse=True)[:TOP_N]

        # Map to Post models
        created_posts: list[Post] = []
        for item in top_items:
            post = _item_to_post(item, job)
            db.add(post)
            created_posts.append(post)

        job.total_posts = len(created_posts)

        # Auto-trigger video download for video posts
        video_post_urls = [
            p.post_url for p in created_posts
            if p.content_type == "video" and p.post_url
        ]
        if video_post_urls:
            await db.commit()
            await start_video_download(db, job, video_post_urls)
            return
        else:
            job.status = "completed"
            job.completed_at = datetime.utcnow()

    except Exception as e:
        job.status = "failed"
        job.error_message = str(e)[:1000]
        job.completed_at = datetime.utcnow()

    await db.commit()


def _parse_date(raw_date) -> datetime | None:
    if not raw_date:
        return None
    try:
        dt = datetime.fromisoformat(str(raw_date).replace("Z", "+00:00"))
        # Strip timezone for naive UTC comparison
        return dt.replace(tzinfo=None)
    except (ValueError, TypeError):
        return None


def _item_to_post(item: dict, job: ScrapeJob) -> Post:
    social = item.get("social_details") or {}
    actor_info = item.get("actor") or {}

    reactions = int(social.get("numLikes", 0) or 0)
    comments_count = int(social.get("numComments", 0) or 0)
    shares = int(social.get("numShares", 0) or 0)

    video_component = item.get("linkedInVideoComponent") or {}
    has_video = bool(video_component)

    image_url = video_component.get("thumbnail")

    video_url = (
        item.get("videoUrl")
        or item.get("video_url")
        or item.get("mediaUrl")
        or item.get("media_url")
        or video_component.get("streamUrl")
        or video_component.get("videoUrl")
    )
    if not video_url:
        streams = video_component.get("progressiveStreams") or []
        if streams:
            best = max(streams, key=lambda s: s.get("width", 0))
            video_url = best.get("url") or best.get("streamUrl")

    duration_ms = video_component.get("duration")
    duration_seconds = duration_ms / 1000.0 if duration_ms else None
    content_type = "video" if has_video else "text"

    format_family = classify_format_family(
        content_type=content_type,
        duration_seconds=duration_seconds,
        has_video=has_video,
        has_image=bool(image_url),
    )

    engagement = compute_engagement_score(reactions, comments_count, shares, 0, 0)

    commentary = item.get("commentary") or ""

    return Post(
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
        clicks=0,
        impressions=0,
        engagement_score=engagement,
        post_url=item.get("share_url"),
        video_url=video_url,
        image_url=image_url,
        duration_seconds=duration_seconds,
        publication_date=_parse_date(item.get("postedAt")),
        raw_data=item,
    )
