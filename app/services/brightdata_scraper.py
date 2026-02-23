"""
Bright Data scraper service for LinkedIn posts — Onda company-only mode.

Flow:
  start_scrape()            → trigger batch request for company accounts
  check_and_process_scrape() → poll snapshot status, fetch & store posts on completion
"""

import asyncio
import json
import re
import uuid
import logging
from collections import defaultdict
from datetime import datetime
from urllib.parse import unquote

import httpx
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.models.post import Post
from app.models.scrape_job import ScrapeJob
from app.models.watched_account import WatchedAccount
from app.services.classifier import classify_format_family
from app.services.date_utils import parse_date
from app.services.ranking import compute_engagement_score
from app.services.video_downloader import start_video_download

logger = logging.getLogger(__name__)

DATASET_ID = "gd_lyy3tktm25m4avu764"
DISCOVER_BY = "company_url"
BASE_URL = "https://api.brightdata.com/datasets/v3"
POSTS_PER_ACCOUNT = 3

# Fields to request from Bright Data API (excludes comments, HTML, other profiles)
OUTPUT_FIELDS = "|".join([
    "url", "user_id", "post_text", "headline", "date_posted",
    "num_likes", "num_comments", "images", "videos",
    "video_duration", "video_thumbnail", "post_type",
    "document_cover_image", "document_page_count", "hashtags",
])


def _headers() -> dict[str, str]:
    return {"Authorization": f"Bearer {settings.API_BRIGHT_DATA}"}


def _normalize_url(url: str) -> str:
    """Normalize LinkedIn company URL for Bright Data API.

    Output: https://www.linkedin.com/company/slug/
    """
    url = url.strip()
    url = url.split("?")[0]  # remove query params

    # Normalize domain (fr.linkedin.com → www.linkedin.com)
    url = re.sub(r"https?://\w+\.linkedin\.com", "https://www.linkedin.com", url)

    company_match = re.search(r"/company/([^/]+)", url)
    if company_match:
        return f"https://www.linkedin.com/company/{company_match.group(1)}/"

    # Fallback
    if not url.endswith("/"):
        url += "/"
    return url


def _extract_slug(linkedin_url: str) -> str:
    """Extract slug from LinkedIn URL: .../in/aprot/ → aprot, .../company/bnp-paribas/ → bnp-paribas"""
    match = re.search(r"/(in|company)/([^/]+)", linkedin_url)
    return match.group(2) if match else ""


async def _trigger_batch(
    client: httpx.AsyncClient,
    batch: list[dict],
) -> str:
    """Trigger one Bright Data company batch and return the snapshot_id."""
    response = await client.post(
        f"{BASE_URL}/trigger",
        headers=_headers(),
        params={
            "dataset_id": DATASET_ID,
            "type": "discover_new",
            "discover_by": DISCOVER_BY,
            "limit_per_input": POSTS_PER_ACCOUNT,
            "custom_output_fields": OUTPUT_FIELDS,
        },
        json=batch,
    )
    response.raise_for_status()
    return response.json()["snapshot_id"]


async def start_scrape(db: AsyncSession, job: ScrapeJob) -> None:
    """Trigger Bright Data batch request for all company accounts in the sector."""
    job.status = "running"
    job.scraper_backend = "brightdata"

    try:
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

        batch = [{"url": _normalize_url(a.linkedin_url)} for a in accounts]

        async with httpx.AsyncClient(timeout=30) as client:
            snapshot_id = await _trigger_batch(client, batch)

        job.brightdata_snapshot_id = json.dumps({"company": snapshot_id})

        logger.info(
            f"Bright Data snapshot triggered for sector '{job.sector}': {snapshot_id} "
            f"({len(accounts)} company accounts)"
        )

    except Exception as e:
        job.status = "failed"
        job.error_message = str(e)[:1000]
        job.completed_at = datetime.utcnow()

    await db.commit()


def _parse_snapshot_ids(raw: str) -> dict[str, str]:
    """Parse brightdata_snapshot_id — JSON dict for new jobs, plain string fallback for old."""
    try:
        parsed = json.loads(raw)
        if isinstance(parsed, dict):
            return parsed
    except (json.JSONDecodeError, TypeError):
        pass
    # Backward compat: old jobs stored a plain snapshot_id string
    return {"legacy": raw}


async def _check_progress(client: httpx.AsyncClient, snapshot_id: str) -> str:
    """Return status string for a single snapshot."""
    resp = await client.get(
        f"{BASE_URL}/progress/{snapshot_id}",
        headers=_headers(),
    )
    resp.raise_for_status()
    return resp.json().get("status", "unknown")


async def _fetch_results(client: httpx.AsyncClient, snapshot_id: str) -> list[dict]:
    """Fetch results for a single snapshot."""
    resp = await client.get(
        f"{BASE_URL}/snapshot/{snapshot_id}",
        headers=_headers(),
        params={"format": "json"},
    )
    resp.raise_for_status()
    items = resp.json()
    return items if isinstance(items, list) else []


async def check_and_process_scrape(db: AsyncSession, job: ScrapeJob) -> None:
    """Poll Bright Data snapshots; when ALL ready, fetch results and store per-account posts."""
    if job.status != "running":
        return

    raw_snapshot = job.brightdata_snapshot_id
    if not raw_snapshot:
        return

    snapshot_map = _parse_snapshot_ids(raw_snapshot)

    try:
        async with httpx.AsyncClient(timeout=30) as client:
            # Check progress for all snapshots in parallel
            progress_tasks = {
                key: _check_progress(client, sid)
                for key, sid in snapshot_map.items()
            }
            statuses = {}
            for key, coro in progress_tasks.items():
                statuses[key] = await coro

        # If any failed → mark job failed
        failed = [k for k, s in statuses.items() if s == "failed"]
        if failed:
            job.status = "failed"
            failed_ids = {k: snapshot_map[k] for k in failed}
            job.error_message = f"Bright Data snapshot(s) failed: {failed_ids}"
            job.completed_at = datetime.utcnow()
            await db.commit()
            return

        # If any not ready → return early (frontend polls again)
        if not all(s == "ready" for s in statuses.values()):
            return

        # Guard against double insertion (concurrent polling requests)
        existing_count = (await db.execute(
            select(func.count()).where(Post.scrape_job_id == job.id)
        )).scalar()
        if existing_count > 0:
            job.status = "completed"
            job.completed_at = datetime.utcnow()
            await db.commit()
            return

        # All ready — fetch results from each snapshot in parallel
        async with httpx.AsyncClient(timeout=60) as client:
            fetch_tasks = [
                _fetch_results(client, sid) for sid in snapshot_map.values()
            ]
            all_results = await asyncio.gather(*fetch_tasks)

        # Merge all results
        items: list[dict] = []
        for result_list in all_results:
            items.extend(result_list)

        # Filter: remove errors + keep only posts by our watched accounts
        result = await db.execute(
            select(WatchedAccount).where(WatchedAccount.sector == job.sector)
        )
        accounts = result.scalars().all()
        allowed_slugs = {_extract_slug(a.linkedin_url) for a in accounts}
        allowed_slugs.discard("")  # remove empty slugs from bad URLs

        items = [
            item for item in items
            if not item.get("error") and unquote(item.get("user_id", "")) in allowed_slugs
        ]

        # Deduplicate by post URL
        seen_urls: set[str] = set()
        unique_items: list[dict] = []
        for item in items:
            url = item.get("url", "")
            if url and url not in seen_urls:
                seen_urls.add(url)
                unique_items.append(item)
        items = unique_items

        logger.info(
            f"Bright Data results for sector '{job.sector}': "
            f"{len(items)} posts after filtering + dedup (allowed slugs: {allowed_slugs})"
        )

        # Take the N most recent posts per account (by date)
        items_by_user: dict[str, list[dict]] = defaultdict(list)
        for item in items:
            uid = unquote(item.get("user_id", "unknown"))
            items_by_user[uid].append(item)

        top_items: list[dict] = []
        for uid, user_items in items_by_user.items():
            user_items.sort(key=lambda x: x.get("date_posted", ""), reverse=True)
            top_items.extend(user_items[:POSTS_PER_ACCOUNT])

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


def _item_to_post(item: dict, job: ScrapeJob) -> Post:
    """Map a Bright Data LinkedIn post item to a Post model."""
    reactions = int(item.get("num_likes", 0) or 0)
    comments_count = int(item.get("num_comments", 0) or 0)
    shares = 0  # not in Bright Data schema

    videos = item.get("videos") or []
    images = item.get("images") or []
    has_video = bool(videos)
    has_image = bool(images)
    has_document = bool(item.get("document_page_count") or item.get("document_cover_image"))

    video_url = videos[0] if videos else None
    image_url = images[0] if images else (item.get("video_thumbnail") or None)
    # video_duration comes as seconds (int or float) from Bright Data
    duration_raw = item.get("video_duration")
    duration_seconds = int(duration_raw) if duration_raw else None

    content_type = "video" if has_video else ("image" if has_image else "text")

    format_family = classify_format_family(
        content_type=content_type,
        duration_seconds=duration_seconds,
        has_video=has_video,
        has_image=has_image,
        has_document=has_document,
    )

    engagement = compute_engagement_score(reactions, comments_count, shares, 0, 0)

    post_text = item.get("post_text") or ""

    return Post(
        id=uuid.uuid4(),
        scrape_job_id=job.id,
        title=post_text[:500] if post_text else None,
        author_name=item.get("user_id"),
        author_company=item.get("headline"),
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
        post_url=item.get("url"),
        video_url=video_url,
        image_url=image_url,
        duration_seconds=duration_seconds,
        publication_date=parse_date(item.get("date_posted")),
        raw_data=item,
    )
