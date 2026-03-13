"""
Bright Data Instagram Profiles scraper service.

Flow:
  start_scrape()            → trigger batch request for accounts with instagram_url
  check_scrape_ready()      → poll snapshot status
  fetch_and_process_results() → fetch profiles, extract posts, store
"""

import asyncio
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
from app.services.utils import truncate_title

logger = logging.getLogger(__name__)

DATASET_ID = "gd_l1vikfch901nx3by4"  # Instagram Profiles Scraper
BASE_URL = "https://api.brightdata.com/datasets/v3"
POSTS_TO_KEEP = 3


def _headers() -> dict[str, str]:
    return {"Authorization": f"Bearer {settings.API_BRIGHT_DATA}"}


def _normalize_instagram_url(url: str) -> str:
    """Normalize to https://www.instagram.com/username/"""
    url = url.strip().split("?")[0]
    username = _extract_username(url)
    if username:
        return f"https://www.instagram.com/{username}/"
    if not url.endswith("/"):
        url += "/"
    return url


def _extract_username(url: str) -> str:
    """Extract username from an Instagram URL."""
    match = re.search(r"instagram\.com/([^/?\s]+)", url)
    return match.group(1).lower() if match else ""


async def _trigger_batch(
    client: httpx.AsyncClient,
    batch: list[dict],
) -> tuple[str | None, str | None]:
    """Trigger Instagram Profiles batch.

    Returns (snapshot_id, None) on success or (None, error_message) on failure.
    """
    params = {"dataset_id": DATASET_ID}

    try:
        response = await client.post(
            f"{BASE_URL}/trigger",
            headers=_headers(),
            params=params,
            json=batch,
        )
    except Exception as e:
        msg = f"Instagram BD HTTP error: {e}"
        logger.error(msg)
        return None, msg

    if response.status_code >= 400:
        msg = f"Instagram BD {response.status_code}: {response.text[:500]}"
        logger.error(msg)
        return None, msg

    try:
        snapshot_id = response.json()["snapshot_id"]
    except Exception as e:
        msg = f"Instagram BD: no snapshot_id in response ({e})"
        logger.error(msg)
        return None, msg

    return snapshot_id, None


async def start_scrape(
    db: AsyncSession, job: ScrapeJob, instagram_accounts: list[WatchedAccount]
) -> None:
    """Trigger Bright Data batch for Instagram accounts. Stores snapshot_id in job.instagram_snapshot_id."""
    urls = [_normalize_instagram_url(a.instagram_url) for a in instagram_accounts if a.instagram_url]
    if not urls:
        return

    batch = [{"url": u} for u in urls]

    async with httpx.AsyncClient(timeout=30) as client:
        snapshot_id, error = await _trigger_batch(client, batch)

    if error:
        logger.warning(f"Instagram scrape trigger failed: {error}")
        return

    job.instagram_snapshot_id = snapshot_id
    logger.info(
        f"Instagram snapshot triggered for sector '{job.sector}': {snapshot_id} "
        f"({len(urls)} accounts)"
    )
    await db.commit()


async def check_scrape_ready(job: ScrapeJob) -> str:
    """Check if Instagram snapshot is ready. Returns 'running', 'ready', or 'failed'."""
    snapshot_id = job.instagram_snapshot_id
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
            logger.error(f"Instagram progress check failed: {e}")
            return "failed"

    if status == "failed":
        return "failed"
    if status == "ready":
        return "ready"
    return "running"


async def _fetch_results(client: httpx.AsyncClient, snapshot_id: str) -> list[dict]:
    """Fetch results for Instagram snapshot (delegates to shared BD fetcher with retry)."""
    from app.services.brightdata_fetch import fetch_bd_snapshot
    return await fetch_bd_snapshot(client, snapshot_id, label="Instagram BD")


def _map_content_type(ig_type: str | None) -> tuple[str, str]:
    """Map Instagram content_type to (content_type, format_family).

    IG types: "Video", "Image", "Carousel"
    """
    if not ig_type:
        return "image", "image"
    key = ig_type.lower()
    if key == "video":
        return "video", "video"
    if key == "carousel":
        return "carousel", "carousel"
    return "image", "image"


async def fetch_and_process_results(
    db: AsyncSession,
    job: ScrapeJob,
    posts_to_keep: int = POSTS_TO_KEEP,
    by_date: bool = False,
) -> list[Post]:
    """Fetch Instagram profiles, extract posts, dedup, top N, map to Post models."""
    _posts_to_keep = posts_to_keep
    _by_date = by_date
    snapshot_id = job.instagram_snapshot_id
    if not snapshot_id:
        return []

    async with httpx.AsyncClient(timeout=300) as client:
        profiles = await _fetch_results(client, snapshot_id)

    # Flatten: each profile has a "posts" array
    all_items: list[tuple[dict, dict]] = []  # (post_item, profile_data)
    for profile in profiles:
        if profile.get("error"):
            continue
        posts_list = profile.get("posts") or []
        for post_item in posts_list:
            all_items.append((post_item, profile))

    # Deduplicate by post URL
    seen_urls: set[str] = set()
    unique_items: list[tuple[dict, dict]] = []
    for post_item, profile_data in all_items:
        url = post_item.get("url", "")
        if url and url not in seen_urls:
            seen_urls.add(url)
            unique_items.append((post_item, profile_data))

    logger.info(
        f"Instagram results for sector '{job.sector}': "
        f"{len(unique_items)} posts from {len(profiles)} profiles after dedup"
    )

    # Group by account username for top-N selection
    items_by_user: dict[str, list[tuple[dict, dict]]] = defaultdict(list)
    for post_item, profile_data in unique_items:
        username = (profile_data.get("account") or "unknown").lower()
        items_by_user[username].append((post_item, profile_data))

    top_items: list[tuple[dict, dict]] = []
    for username, user_items in items_by_user.items():
        # Use select_top_posts on the post dicts
        post_dicts = [item[0] for item in user_items]
        profile_for_user = user_items[0][1] if user_items else {}
        followers = int(profile_for_user.get("followers", 0) or 0) or None

        selected = select_top_posts(
            post_dicts,
            posts_to_keep=_posts_to_keep,
            by_date=_by_date,
            get_date=lambda x: parse_date(x.get("datetime")),
            get_reactions=lambda x: int(x.get("likes", 0) or 0),
            get_comments=lambda x: int(x.get("comments", 0) or 0),
            get_followers=lambda _: followers,
        )
        # Re-associate profile data
        selected_urls = {s.get("url") for s in selected}
        for post_item, prof in user_items:
            if post_item.get("url") in selected_urls:
                top_items.append((post_item, prof))

    # Map to Post models
    created_posts: list[Post] = []
    for post_item, profile_data in top_items:
        post = _item_to_post(post_item, profile_data, job)
        db.add(post)
        created_posts.append(post)

    return created_posts


def _item_to_post(item: dict, profile_data: dict, job: ScrapeJob) -> Post:
    """Map an Instagram post item + profile data to a Post model."""
    reactions = int(item.get("likes", 0) or 0)
    comments_count = int(item.get("comments", 0) or 0)

    content_type_raw = item.get("content_type")
    content_type, format_family = _map_content_type(content_type_raw)

    followers_raw = profile_data.get("followers")
    author_follower_count = int(followers_raw) if followers_raw else None

    engagement = compute_engagement_score(reactions, comments_count, 0, 0, 0)
    engagement_rate = compute_engagement_rate(reactions, comments_count, author_follower_count)

    caption = item.get("caption") or ""

    return Post(
        id=uuid.uuid4(),
        scrape_job_id=job.id,
        title=truncate_title(caption) if caption else None,
        author_name=profile_data.get("account"),
        author_company=profile_data.get("profile_name"),
        sector=job.sector,
        platform="instagram",
        content_type=content_type,
        format_family=format_family,
        reactions=reactions,
        comments=comments_count,
        shares=0,
        clicks=0,
        impressions=0,
        engagement_score=engagement,
        author_follower_count=author_follower_count,
        engagement_rate=engagement_rate,
        post_url=item.get("url"),
        video_url=item.get("video_url"),
        image_url=item.get("image_url"),
        duration_seconds=None,
        publication_date=parse_date(item.get("datetime")),
        raw_data=item,
    )
