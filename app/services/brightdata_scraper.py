"""
Bright Data scraper service for LinkedIn posts — Onda multi-account mode.

Flow:
  start_scrape()            → trigger batch requests (company + persona endpoints)
  check_and_process_scrape() → poll snapshot status, fetch & store top-10 on completion
"""

import asyncio
import json
import re
import uuid
import logging
from datetime import datetime, timedelta

import httpx
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

DATASET_IDS = {
    "company": "gd_lyy3tktm25m4avu764",  # Discover by company URL
    "persona": "gd_lpfll7v5hcqtkxl6l",   # Discover by profile URL
}
DISCOVER_BY = {
    "company": "company_url",
    "persona": "url",
}
BASE_URL = "https://api.brightdata.com/datasets/v3"
TOP_N = 10
RECENT_DAYS = 30
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
    """Normalize LinkedIn URL to clean base format for Bright Data API.

    Company: https://www.linkedin.com/company/slug/
    Profile: https://www.linkedin.com/in/slug/
    """
    url = url.strip()
    url = url.split("?")[0]  # remove query params

    # Normalize domain (fr.linkedin.com → www.linkedin.com)
    url = re.sub(r"https?://\w+\.linkedin\.com", "https://www.linkedin.com", url)

    # Extract the slug based on type
    company_match = re.search(r"/company/([^/]+)", url)
    if company_match:
        return f"https://www.linkedin.com/company/{company_match.group(1)}/"

    profile_match = re.search(r"/in/([^/]+)", url)
    if profile_match:
        return f"https://www.linkedin.com/in/{profile_match.group(1)}/"

    # Fallback: strip trailing path segments
    if not url.endswith("/"):
        url += "/"
    return url


def _extract_slug(linkedin_url: str) -> str:
    """Extract slug from LinkedIn URL: .../in/aprot/ → aprot, .../company/bnp-paribas/ → bnp-paribas"""
    match = re.search(r"/(in|company)/([^/]+)", linkedin_url)
    return match.group(2) if match else ""


async def _trigger_batch(
    client: httpx.AsyncClient,
    dataset_id: str,
    discover_by: str,
    batch: list[dict],
) -> str:
    """Trigger one Bright Data batch and return the snapshot_id."""
    response = await client.post(
        f"{BASE_URL}/trigger",
        headers=_headers(),
        params={
            "dataset_id": dataset_id,
            "type": "discover_new",
            "discover_by": discover_by,
            "limit_per_input": POSTS_PER_ACCOUNT,
            "custom_output_fields": OUTPUT_FIELDS,
        },
        json=batch,
    )
    response.raise_for_status()
    return response.json()["snapshot_id"]


async def start_scrape(db: AsyncSession, job: ScrapeJob) -> None:
    """Trigger Bright Data batch requests — one per account type (company/persona)."""
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

        # Partition accounts by type
        company_accounts = [a for a in accounts if a.type == "company"]
        persona_accounts = [a for a in accounts if a.type == "persona"]

        def _make_batch(accts: list) -> list[dict]:
            return [{"url": _normalize_url(a.linkedin_url)} for a in accts]

        async with httpx.AsyncClient(timeout=30) as client:
            tasks = []
            type_order = []  # track which type each task corresponds to

            if company_accounts:
                tasks.append(
                    _trigger_batch(client, DATASET_IDS["company"], DISCOVER_BY["company"], _make_batch(company_accounts))
                )
                type_order.append("company")

            if persona_accounts:
                tasks.append(
                    _trigger_batch(client, DATASET_IDS["persona"], DISCOVER_BY["persona"], _make_batch(persona_accounts))
                )
                type_order.append("persona")

            snapshot_ids_list = await asyncio.gather(*tasks)

        # Store as JSON dict: {"company": "snap_abc", "persona": "snap_def"}
        snapshot_map = dict(zip(type_order, snapshot_ids_list))
        job.brightdata_snapshot_id = json.dumps(snapshot_map)

        logger.info(
            f"Bright Data snapshots triggered for sector '{job.sector}': {snapshot_map} "
            f"({len(company_accounts)} company, {len(persona_accounts)} persona accounts)"
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
    """Poll Bright Data snapshots; when ALL ready, fetch results and store top-10."""
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
            if not item.get("error") and item.get("user_id") in allowed_slugs
        ]

        logger.info(
            f"Bright Data results for sector '{job.sector}': "
            f"{len(items)} posts after filtering (allowed slugs: {allowed_slugs})"
        )

        # Sort by engagement, keep top N
        def engagement(item: dict) -> int:
            return int(item.get("num_likes", 0) or 0) + int(item.get("num_comments", 0) or 0)

        top_items = sorted(items, key=engagement, reverse=True)[:TOP_N]

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
        return dt.replace(tzinfo=None)
    except (ValueError, TypeError):
        return None


def _item_to_post(item: dict, job: ScrapeJob) -> Post:
    """Map a Bright Data LinkedIn post item to a Post model."""
    reactions = int(item.get("num_likes", 0) or 0)
    comments_count = int(item.get("num_comments", 0) or 0)
    shares = 0  # not in Bright Data schema

    videos = item.get("videos") or []
    images = item.get("images") or []
    has_video = bool(videos)
    has_image = bool(images)

    video_url = videos[0] if videos else None
    image_url = images[0] if images else None
    # video_duration comes as seconds (int or float) from Bright Data
    duration_raw = item.get("video_duration")
    duration_seconds = int(duration_raw) if duration_raw else None

    content_type = "video" if has_video else ("image" if has_image else "text")

    format_family = classify_format_family(
        content_type=content_type,
        duration_seconds=duration_seconds,
        has_video=has_video,
        has_image=has_image,
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
        publication_date=_parse_date(item.get("date_posted")),
        raw_data=item,
    )
