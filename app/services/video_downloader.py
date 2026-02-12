"""
LinkedIn Video Downloader service.
Uses Apify actor: xanthic_polygon/linkedin-video-downloader

Phase 2 of the pipeline: downloads actual MP4 video URLs from LinkedIn posts.
Non-blocking: start_video_download() kicks off the actor,
check_and_process_video_download() is called lazily when client polls.
"""

import asyncio
import logging
from datetime import datetime
from urllib.parse import urlparse, urlunparse

from apify_client import ApifyClient
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.models.post import Post
from app.models.scrape_job import ScrapeJob

logger = logging.getLogger(__name__)

ACTOR_ID = "xanthic_polygon~linkedin-video-downloader"


def _normalize_linkedin_url(url: str) -> str:
    """Normalize LinkedIn post URL for matching (strip query params, trailing slash)."""
    parsed = urlparse(url)
    path = parsed.path.rstrip("/")
    return urlunparse(("", "", path, "", "", "")).lstrip("/")


async def start_video_download(
    db: AsyncSession, job: ScrapeJob, post_urls: list[str]
) -> None:
    """Start Apify video downloader actor (non-blocking). Returns immediately."""
    try:
        client = ApifyClient(settings.APIFY_TOKEN)

        actor_input = {
            "startUrls": [{"url": url} for url in post_urls],
            "maxRequestRetries": 5,
            "proxyConfiguration": {
                "useApifyProxy": True,
                "apifyProxyGroups": ["RESIDENTIAL"],
            },
        }

        logger.info(
            f"Starting video download for {len(post_urls)} posts (job {job.id})"
        )

        run = await asyncio.to_thread(
            client.actor(ACTOR_ID).start, run_input=actor_input
        )
        job.video_download_run_id = run.get("id")
        job.status = "downloading_videos"

    except Exception as e:
        logger.error(f"Video download start failed: {e}")
        # Don't fail the whole job — just skip video download and complete
        job.status = "completed"
        job.completed_at = datetime.utcnow()

    await db.commit()


async def check_and_process_video_download(
    db: AsyncSession, job: ScrapeJob
) -> None:
    """Check if video download run is done; if so, update Post.video_url with MP4 CDN URLs."""
    if job.status != "downloading_videos" or not job.video_download_run_id:
        return

    try:
        client = ApifyClient(settings.APIFY_TOKEN)

        run_info = await asyncio.to_thread(
            client.run(job.video_download_run_id).get
        )
        status = run_info.get("status")

        if status in ("READY", "RUNNING"):
            return

        if status != "SUCCEEDED":
            logger.warning(
                f"Video download run {job.video_download_run_id} status: {status}"
            )
            # Complete the job anyway — we still have the posts, just no MP4 URLs
            job.status = "completed"
            job.completed_at = datetime.utcnow()
            await db.commit()
            return

        # Fetch dataset items
        dataset_id = run_info.get("defaultDatasetId")
        dataset_items = await asyncio.to_thread(
            lambda: list(client.dataset(dataset_id).iterate_items())
        )

        logger.info(
            f"Video download completed: {len(dataset_items)} items for job {job.id}"
        )

        # Load all posts for this job
        result = await db.execute(
            select(Post).where(Post.scrape_job_id == job.id)
        )
        posts = list(result.scalars().all())

        # Build lookup: normalized post_url -> Post
        post_lookup: dict[str, Post] = {}
        for post in posts:
            if post.post_url:
                key = _normalize_linkedin_url(post.post_url)
                post_lookup[key] = post

        # Match video download results to posts
        matched = 0
        for item in dataset_items:
            post_url = item.get("postUrl") or ""
            video_url = item.get("videoUrl")
            thumbnail_url = item.get("thumbnailUrl")

            if not post_url or not video_url:
                continue

            key = _normalize_linkedin_url(post_url)
            post = post_lookup.get(key)
            if post:
                post.video_url = video_url
                if thumbnail_url:
                    post.image_url = thumbnail_url
                matched += 1

        logger.info(f"Matched {matched}/{len(dataset_items)} video URLs to posts")

        job.status = "completed"
        job.completed_at = datetime.utcnow()

    except Exception as e:
        logger.error(f"Video download processing failed: {e}")
        job.status = "completed"
        job.completed_at = datetime.utcnow()

    await db.commit()
