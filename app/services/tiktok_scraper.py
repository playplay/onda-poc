"""
Bright Data TikTok scraper service.

Flow:
  start_scrape()              → trigger batch request for accounts with tiktok_url
  check_scrape_ready()        → poll snapshot status
  fetch_and_process_results() → fetch posts, dedup, top N, store
"""

import json
import re
import uuid
import logging
from collections import defaultdict
from datetime import datetime

import httpx
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.models.post import Post
from app.models.scrape_job import ScrapeJob
from app.models.watched_account import WatchedAccount
from app.services.date_utils import parse_date
from app.services.ranking import compute_engagement_score, compute_engagement_rate, select_top_posts

logger = logging.getLogger(__name__)

DATASET_ID = "gd_lu702nij2f790tmv9h"
BASE_URL = "https://api.brightdata.com/datasets/v3"
POSTS_TO_KEEP = 3


def _headers() -> dict[str, str]:
    return {"Authorization": f"Bearer {settings.API_BRIGHT_DATA}"}


def _normalize_tiktok_url(url: str) -> str:
    """Normalize to https://www.tiktok.com/@username"""
    url = url.strip().split("?")[0]
    username = _extract_username(url)
    if username:
        return f"https://www.tiktok.com/@{username}"
    return url


def _extract_username(url: str) -> str:
    """Extract username from a TikTok URL."""
    match = re.search(r"tiktok\.com/@([^/?\s]+)", url)
    return match.group(1).lower() if match else ""


async def _trigger_batch(
    client: httpx.AsyncClient,
    batch: list[dict],
) -> tuple[str | None, str | None]:
    """Trigger TikTok batch.

    Returns (snapshot_id, None) on success or (None, error_message) on failure.
    """
    params = {
        "dataset_id": DATASET_ID,
        "type": "discover_new",
        "discover_by": "profile_url",
        "limit_per_input": 10,
    }

    try:
        response = await client.post(
            f"{BASE_URL}/trigger",
            headers=_headers(),
            params=params,
            json=batch,
        )
    except Exception as e:
        msg = f"TikTok BD HTTP error: {e}"
        logger.error(msg)
        return None, msg

    if response.status_code >= 400:
        msg = f"TikTok BD {response.status_code}: {response.text[:500]}"
        logger.error(msg)
        return None, msg

    try:
        snapshot_id = response.json()["snapshot_id"]
    except Exception as e:
        msg = f"TikTok BD: no snapshot_id in response ({e})"
        logger.error(msg)
        return None, msg

    return snapshot_id, None


async def start_scrape(
    db: AsyncSession, job: ScrapeJob, tiktok_accounts: list[WatchedAccount]
) -> None:
    """Trigger Bright Data batch for TikTok accounts. Stores snapshot_id in job.tiktok_snapshot_id."""
    urls = [_normalize_tiktok_url(a.tiktok_url) for a in tiktok_accounts if a.tiktok_url]
    if not urls:
        return

    batch = [{"url": u} for u in urls]

    async with httpx.AsyncClient(timeout=30) as client:
        snapshot_id, error = await _trigger_batch(client, batch)

    if error:
        logger.warning(f"TikTok scrape trigger failed: {error}")
        return

    job.tiktok_snapshot_id = snapshot_id
    logger.info(
        f"TikTok snapshot triggered for sector '{job.sector}': {snapshot_id} "
        f"({len(urls)} accounts)"
    )
    await db.commit()


async def check_scrape_ready(job: ScrapeJob) -> str:
    """Check if TikTok snapshot is ready. Returns 'running', 'ready', or 'failed'."""
    snapshot_id = job.tiktok_snapshot_id
    if not snapshot_id:
        return "ready"

    async with httpx.AsyncClient(timeout=30) as client:
        try:
            resp = await client.get(
                f"{BASE_URL}/progress/{snapshot_id}",
                headers=_headers(),
            )
            resp.raise_for_status()
            status = resp.json().get("status", "unknown")
        except Exception as e:
            logger.error(f"TikTok progress check failed: {e}")
            return "failed"

    if status == "failed":
        return "failed"
    if status == "ready":
        return "ready"
    return "running"


async def _fetch_results(client: httpx.AsyncClient, snapshot_id: str) -> list[dict]:
    """Fetch results for TikTok snapshot."""
    resp = await client.get(
        f"{BASE_URL}/snapshot/{snapshot_id}",
        headers=_headers(),
        params={"format": "json"},
    )
    resp.raise_for_status()
    items = resp.json()

    if isinstance(items, list):
        return items

    logger.warning(
        f"TikTok BD snapshot {snapshot_id}: expected list, got {type(items).__name__}: "
        f"{str(items)[:300]}"
    )

    if isinstance(items, dict):
        for key, val in items.items():
            if isinstance(val, list) and val and isinstance(val[0], dict):
                logger.info(f"TikTok BD snapshot {snapshot_id}: recovered {len(val)} items from key '{key}'")
                return val
        if items.get("url") or items.get("description"):
            logger.info(f"TikTok BD snapshot {snapshot_id}: recovered 1 item (single dict)")
            return [items]

    try:
        text = resp.text.strip()
        if "\n" in text:
            lines = [json.loads(line) for line in text.splitlines() if line.strip()]
            if lines and isinstance(lines[0], dict):
                logger.info(f"TikTok BD snapshot {snapshot_id}: recovered {len(lines)} items from JSONL")
                return lines
    except (json.JSONDecodeError, Exception):
        pass

    logger.error(f"TikTok BD snapshot {snapshot_id}: could not recover any items, returning []")
    return []


def _map_content_type(item: dict) -> tuple[str, str]:
    """Map TikTok post data to (content_type, format_family)."""
    carousel_images = item.get("carousel_images")
    if carousel_images:
        return "carousel", "carousel"
    post_type = (item.get("post_type") or "").lower()
    if post_type == "video":
        return "video", "video"
    return "image", "image"


async def fetch_and_process_results(db: AsyncSession, job: ScrapeJob) -> list[Post]:
    """Fetch TikTok posts, dedup, top N per account, map to Post models."""
    snapshot_id = job.tiktok_snapshot_id
    if not snapshot_id:
        return []

    async with httpx.AsyncClient(timeout=60) as client:
        items = await _fetch_results(client, snapshot_id)

    # Deduplicate by post URL
    seen_urls: set[str] = set()
    unique_items: list[dict] = []
    for item in items:
        if item.get("error"):
            continue
        url = item.get("url", "")
        if url and url not in seen_urls:
            seen_urls.add(url)
            unique_items.append(item)

    logger.info(
        f"TikTok results for sector '{job.sector}': "
        f"{len(unique_items)} posts after dedup (from {len(items)} raw items)"
    )

    # Group by account username for top-N selection
    items_by_user: dict[str, list[dict]] = defaultdict(list)
    for item in unique_items:
        username = (item.get("profile_username") or item.get("account_id") or "unknown").lower()
        items_by_user[username].append(item)

    top_items: list[dict] = []
    for username, user_items in items_by_user.items():
        followers = int(user_items[0].get("profile_followers", 0) or 0) or None

        selected = select_top_posts(
            user_items,
            posts_to_keep=POSTS_TO_KEEP,
            get_date=lambda x: parse_date(x.get("create_time")),
            get_reactions=lambda x: int(x.get("digg_count", 0) or 0),
            get_comments=lambda x: int(x.get("comment_count", 0) or 0),
            get_followers=lambda _, f=followers: f,
        )
        top_items.extend(selected)

    # Map to Post models
    created_posts: list[Post] = []
    for item in top_items:
        post = _item_to_post(item, job)
        db.add(post)
        created_posts.append(post)

    return created_posts


def _item_to_post(item: dict, job: ScrapeJob) -> Post:
    """Map a TikTok post item to a Post model."""
    reactions = int(item.get("digg_count", 0) or 0)
    comments_count = int(item.get("comment_count", 0) or 0)
    shares = int(item.get("share_count", 0) or 0)
    play_count = int(item.get("play_count", 0) or 0)

    content_type, format_family = _map_content_type(item)

    followers_raw = item.get("profile_followers")
    author_follower_count = int(followers_raw) if followers_raw else None

    engagement = compute_engagement_score(reactions, comments_count, shares, 0, play_count)
    engagement_rate = compute_engagement_rate(reactions, comments_count, author_follower_count)

    description = item.get("description") or ""
    username = item.get("profile_username") or item.get("account_id") or ""

    duration_raw = item.get("video_duration")
    duration_seconds = None
    if duration_raw is not None:
        try:
            duration_seconds = float(duration_raw)
        except (ValueError, TypeError):
            pass

    return Post(
        id=uuid.uuid4(),
        scrape_job_id=job.id,
        title=description[:500] if description else None,
        author_name=username,
        author_company=username,
        sector=job.sector,
        platform="tiktok",
        content_type=content_type,
        format_family=format_family,
        reactions=reactions,
        comments=comments_count,
        shares=shares,
        clicks=0,
        impressions=play_count,
        engagement_score=engagement,
        author_follower_count=author_follower_count,
        engagement_rate=engagement_rate,
        post_url=item.get("url"),
        video_url=item.get("video_url"),
        image_url=item.get("preview_image"),
        duration_seconds=duration_seconds,
        publication_date=parse_date(item.get("create_time")),
        raw_data=item,
    )
