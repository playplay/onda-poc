"""
Apify profile scraper for LinkedIn personal posts via harvestapi/linkedin-profile-posts.

Used for person accounts. Company accounts use Bright Data (brightdata_scraper.py).

Flow:
  start_profile_scrape()               → launch Apify run for all person accounts
  check_profile_scrape()               → poll run status
  fetch_and_process_profile_posts()    → fetch items, filter, dedup, map to Post models
"""

import asyncio
import re
import uuid
import logging
from collections import defaultdict
from datetime import datetime

from apify_client import ApifyClient
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.models.post import Post
from app.models.scrape_job import ScrapeJob
from app.models.watched_account import WatchedAccount
from app.services.classifier import classify_format_family
from app.services.date_utils import parse_date
from app.services.ranking import compute_engagement_score

logger = logging.getLogger(__name__)

ACTOR_ID = "harvestapi/linkedin-profile-posts"
MAX_POSTS_PER_INPUT = 10
POSTS_PER_PERSON = 3


def _normalize_profile_url(url: str) -> str:
    """Normalize LinkedIn profile URL for Apify input."""
    url = url.strip().split("?")[0]
    url = re.sub(r"https?://\w+\.linkedin\.com", "https://www.linkedin.com", url)
    match = re.search(r"/in/([^/]+)", url)
    if match:
        return f"https://www.linkedin.com/in/{match.group(1)}/"
    if not url.endswith("/"):
        url += "/"
    return url


def _extract_slug(linkedin_url: str) -> str:
    """Extract slug from LinkedIn profile URL: .../in/johndoe/ → johndoe"""
    match = re.search(r"/in/([^/]+)", linkedin_url)
    return match.group(1).lower() if match else ""


async def start_profile_scrape(
    db: AsyncSession, job: ScrapeJob, person_accounts: list[WatchedAccount]
) -> list[str]:
    """Launch a single Apify run for all person accounts. Returns list of run IDs."""
    client = ApifyClient(settings.APIFY_TOKEN)

    target_urls = [_normalize_profile_url(a.linkedin_url) for a in person_accounts]

    actor_input = {
        "targetUrls": target_urls,
        "maxPosts": MAX_POSTS_PER_INPUT,
        "includeReposts": False,
        "includeQuotePosts": False,
        "scrapeReactions": False,
        "scrapeComments": False,
    }

    run = await asyncio.to_thread(
        client.actor(ACTOR_ID).start, run_input=actor_input
    )
    run_id = run.get("id")
    logger.info(
        f"Apify profile scrape started: run_id={run_id} for {len(person_accounts)} person accounts"
    )
    return [run_id]


async def check_profile_scrape(run_ids: list[str]) -> str:
    """Check status of profile scrape run(s). Returns 'running', 'ready', or 'failed'."""
    if not run_ids:
        return "ready"

    client = ApifyClient(settings.APIFY_TOKEN)

    async def get_status(run_id: str) -> str:
        info = await asyncio.to_thread(client.run(run_id).get)
        return info.get("status", "RUNNING")

    statuses = await asyncio.gather(*[get_status(rid) for rid in run_ids])

    if any(s in ("FAILED", "ABORTED", "TIMED-OUT") for s in statuses):
        return "failed"
    if any(s in ("READY", "RUNNING") for s in statuses):
        return "running"
    if all(s == "SUCCEEDED" for s in statuses):
        return "ready"
    return "running"


async def fetch_and_process_profile_posts(
    db: AsyncSession,
    job: ScrapeJob,
    run_ids: list[str],
    allowed_slugs: set[str],
) -> list[Post]:
    """Fetch Apify results, filter by author, dedup, top 3 per person, return Post models."""
    client = ApifyClient(settings.APIFY_TOKEN)

    # Fetch items from all runs
    all_items: list[dict] = []
    for run_id in run_ids:
        info = await asyncio.to_thread(client.run(run_id).get)
        dataset_id = info.get("defaultDatasetId")
        if dataset_id:
            items = await asyncio.to_thread(
                lambda did=dataset_id: list(client.dataset(did).iterate_items())
            )
            all_items.extend(items)

    logger.info(f"Apify profile scrape: fetched {len(all_items)} raw items")

    # Filter by author slug
    allowed_lower = {s.lower() for s in allowed_slugs}
    filtered: list[dict] = []
    for item in all_items:
        author = item.get("author") or {}
        public_id = (author.get("publicIdentifier") or "").lower()
        if public_id in allowed_lower:
            filtered.append(item)

    # Dedup by post id
    seen_ids: set[str] = set()
    unique_items: list[dict] = []
    for item in filtered:
        post_id = item.get("id", "")
        if post_id and post_id not in seen_ids:
            seen_ids.add(post_id)
            unique_items.append(item)

    # Top N per person (sorted by postedAt.timestamp desc)
    items_by_author: dict[str, list[dict]] = defaultdict(list)
    for item in unique_items:
        author = item.get("author") or {}
        public_id = (author.get("publicIdentifier") or "unknown").lower()
        items_by_author[public_id].append(item)

    top_items: list[dict] = []
    for author_id, author_items in items_by_author.items():
        author_items.sort(
            key=lambda x: (x.get("postedAt") or {}).get("timestamp", 0),
            reverse=True,
        )
        top_items.extend(author_items[:POSTS_PER_PERSON])

    logger.info(
        f"Apify profile scrape: {len(top_items)} posts after filter/dedup/top-{POSTS_PER_PERSON} "
        f"(allowed slugs: {allowed_lower})"
    )

    # Map to Post models
    created_posts: list[Post] = []
    for item in top_items:
        post = _item_to_post(item, job)
        db.add(post)
        created_posts.append(post)

    return created_posts


def _item_to_post(item: dict, job: ScrapeJob) -> Post:
    """Map a harvestapi/linkedin-profile-posts item to a Post model."""
    author = item.get("author") or {}
    engagement = item.get("engagement") or {}
    posted_at = item.get("postedAt") or {}

    reactions = int(engagement.get("likes", 0) or 0)
    comments_count = int(engagement.get("comments", 0) or 0)
    shares = int(engagement.get("shares", 0) or 0)

    # Media detection
    post_video = item.get("postVideo") or {}
    post_images = item.get("postImages") or []
    document = item.get("document")
    has_video = bool(post_video)
    has_image = bool(post_images)
    has_document = bool(document)

    video_url = post_video.get("videoUrl") if has_video else None
    if has_video:
        image_url = post_video.get("thumbnailUrl")
    elif has_image:
        image_url = post_images[0].get("url") if post_images else None
    else:
        image_url = None

    # Content type
    if has_video:
        content_type = "video"
    elif has_document:
        content_type = "document"
    elif has_image:
        content_type = "image"
    else:
        content_type = "text"

    format_family = classify_format_family(
        content_type=content_type,
        has_video=has_video,
        has_image=has_image,
        has_document=has_document,
    )

    engagement_score = compute_engagement_score(reactions, comments_count, shares, 0, 0)

    content = item.get("content") or ""
    pub_date = parse_date(posted_at.get("date"))

    return Post(
        id=uuid.uuid4(),
        scrape_job_id=job.id,
        title=content[:500] if content else None,
        author_name=(author.get("publicIdentifier") or author.get("name")),
        author_company=author.get("info"),
        sector=job.sector,
        platform="linkedin",
        content_type=content_type,
        format_family=format_family,
        reactions=reactions,
        comments=comments_count,
        shares=shares,
        clicks=0,
        impressions=0,
        engagement_score=engagement_score,
        post_url=item.get("linkedinUrl"),
        video_url=video_url,
        image_url=image_url,
        duration_seconds=None,
        publication_date=pub_date,
        raw_data=item,
    )
