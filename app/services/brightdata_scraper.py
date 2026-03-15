"""
Bright Data scraper service for LinkedIn posts — Onda company-only mode.

Flow:
  start_scrape()            → trigger batch request for company accounts
  check_scrape_ready()      → poll snapshot status
  fetch_and_process_results() → fetch & store posts on completion
"""

import asyncio
import json
import re
import uuid
import logging
from collections import defaultdict
from datetime import datetime, timezone
from dateutil.relativedelta import relativedelta
from urllib.parse import unquote

import httpx
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.models.post import Post
from app.models.scrape_job import ScrapeJob
from app.models.watched_account import WatchedAccount
from app.services.classifier import classify_format_family, detect_image_gif
from app.services.date_utils import parse_date
from app.services.ranking import compute_engagement_score, compute_engagement_rate, select_top_posts
from app.services.utils import truncate_title


logger = logging.getLogger(__name__)

DATASET_ID = "gd_lyy3tktm25m4avu764"
DISCOVER_BY = "company_url"
BASE_URL = "https://api.brightdata.com/datasets/v3"
POSTS_TO_FETCH = 10
POSTS_TO_KEEP = 3

# Fields to request from Bright Data API (excludes comments, HTML, other profiles)
OUTPUT_FIELDS = "|".join([
    "url", "user_id", "post_text", "headline", "date_posted",
    "num_likes", "num_comments", "images", "videos",
    "video_duration", "video_thumbnail", "post_type",
    "document_cover_image", "document_page_count", "hashtags",
    "user_followers",
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
    limit_per_input: int = POSTS_TO_FETCH,
) -> tuple[str | None, str | None]:
    """Trigger one Bright Data company batch.

    Returns (snapshot_id, None) on success or (None, error_message) on failure.
    Never raises — caller handles the error.
    """
    params = {
        "dataset_id": DATASET_ID,
        "type": "discover_new",
        "discover_by": DISCOVER_BY,
        "limit_per_input": limit_per_input,
    }

    try:
        response = await client.post(
            f"{BASE_URL}/trigger",
            headers=_headers(),
            params=params,
            json=batch,
        )
    except Exception as e:
        msg = f"Bright Data HTTP error: {e}"
        logger.error(msg)
        return None, msg

    if response.status_code >= 400:
        msg = f"Bright Data {response.status_code}: {response.text[:500]}"
        logger.error(msg)
        return None, msg

    try:
        snapshot_id = response.json()["snapshot_id"]
    except Exception as e:
        msg = f"Bright Data: no snapshot_id in response ({e})"
        logger.error(msg)
        return None, msg

    return snapshot_id, None


async def start_scrape(
    db: AsyncSession,
    job: ScrapeJob,
    company_accounts: list[WatchedAccount] | None = None,
    limit_per_input: int = POSTS_TO_FETCH,
) -> None:
    """Trigger Bright Data batch request for company accounts in the sector.

    If company_accounts is provided, use those directly.
    Otherwise, query all company accounts for the sector (backward compat).
    """
    job.status = "running"

    if company_accounts is None:
        result = await db.execute(
            select(WatchedAccount).where(
                WatchedAccount.sector == job.sector,
                WatchedAccount.type == "company",
            )
        )
        company_accounts = list(result.scalars().all())

    if not company_accounts:
        job.status = "failed"
        job.error_message = f"No company accounts found for sector: {job.sector}"
        job.completed_at = datetime.utcnow()
        await db.commit()
        return

    urls = [_normalize_url(a.linkedin_url) for a in company_accounts if a.linkedin_url]
    batch = [{"url": u} for u in urls]

    async with httpx.AsyncClient(timeout=30) as client:
        snapshot_id, error = await _trigger_batch(client, batch, limit_per_input=limit_per_input)

    if error:
        job.status = "failed"
        job.error_message = error
        job.completed_at = datetime.utcnow()
    else:
        job.brightdata_snapshot_id = json.dumps({"company": snapshot_id})
        logger.info(
            f"Bright Data snapshot triggered for sector '{job.sector}': {snapshot_id} "
            f"({len(company_accounts)} company accounts)"
        )

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
    """Fetch results for a single snapshot (delegates to shared BD fetcher with retry)."""
    from app.services.brightdata_fetch import fetch_bd_snapshot
    return await fetch_bd_snapshot(client, snapshot_id, label="LinkedIn BD")


async def check_scrape_ready(job: ScrapeJob) -> str:
    """Check if Bright Data snapshots are ready. Returns 'running', 'ready', or 'failed'."""
    raw_snapshot = job.brightdata_snapshot_id
    if not raw_snapshot:
        return "ready"

    snapshot_map = _parse_snapshot_ids(raw_snapshot)

    async with httpx.AsyncClient(timeout=30) as client:
        progress_tasks = {
            key: _check_progress(client, sid)
            for key, sid in snapshot_map.items()
        }
        statuses = {}
        for key, coro in progress_tasks.items():
            statuses[key] = await coro

    if any(s == "failed" for s in statuses.values()):
        return "failed"

    if not all(s == "ready" for s in statuses.values()):
        return "running"

    return "ready"


async def fetch_and_process_results(
    db: AsyncSession,
    job: ScrapeJob,
    posts_to_keep: int = POSTS_TO_KEEP,
    by_date: bool = False,
    allowed_slugs_override: set[str] | None = None,
) -> list[Post]:
    """Fetch Bright Data results, filter by company accounts, dedup, map to Post models."""
    raw_snapshot = job.brightdata_snapshot_id
    if not raw_snapshot:
        return []

    snapshot_map = _parse_snapshot_ids(raw_snapshot)

    # Fetch results from each snapshot in parallel
    async with httpx.AsyncClient(timeout=300) as client:
        fetch_tasks = [
            _fetch_results(client, sid) for sid in snapshot_map.values()
        ]
        all_results = await asyncio.gather(*fetch_tasks)

    # Merge all results
    items: list[dict] = []
    for result_list in all_results:
        items.extend(result_list)

    # Build allowed slugs + slug→sector map: use override if provided, else query by sector
    slug_to_sector: dict[str, str] = {}
    if allowed_slugs_override is not None:
        allowed_slugs = allowed_slugs_override
    elif job.sector:
        result = await db.execute(
            select(WatchedAccount).where(
                WatchedAccount.sector == job.sector,
                WatchedAccount.type == "company",
            )
        )
        accounts = result.scalars().all()
        allowed_slugs = {_extract_slug(a.linkedin_url) for a in accounts if a.linkedin_url}
        allowed_slugs.discard("")
        slug_to_sector = {_extract_slug(a.linkedin_url): a.sector for a in accounts if a.linkedin_url and a.sector}
    else:
        # All sectors (e.g. scrape by CSM): query all company accounts
        result = await db.execute(
            select(WatchedAccount).where(WatchedAccount.type == "company")
        )
        accounts = result.scalars().all()
        allowed_slugs = {_extract_slug(a.linkedin_url) for a in accounts if a.linkedin_url}
        allowed_slugs.discard("")
        slug_to_sector = {_extract_slug(a.linkedin_url): a.sector for a in accounts if a.linkedin_url and a.sector}

    # Apply date filter if requested
    cutoff: datetime | None = None
    if job.scrape_date_since_months:
        cutoff = datetime.now(timezone.utc) - relativedelta(months=job.scrape_date_since_months)
    if job.scrape_since_date:
        from datetime import date as date_type
        cutoff_since = datetime(
            job.scrape_since_date.year,
            job.scrape_since_date.month,
            job.scrape_since_date.day,
            tzinfo=timezone.utc,
        )
        if cutoff is None or cutoff_since > cutoff:
            cutoff = cutoff_since

    items = [
        item for item in items
        if not item.get("error")
        and unquote(item.get("user_id", "")) in allowed_slugs
        and item.get("post_type") != "repost"
        and not (item.get("title") or "").strip().startswith("|")
        and (cutoff is None or _item_date_after(item, cutoff))
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

    # Select top posts per account
    items_by_user: dict[str, list[dict]] = defaultdict(list)
    for item in items:
        uid = unquote(item.get("user_id", "unknown"))
        items_by_user[uid].append(item)

    top_items: list[dict] = []
    for uid, user_items in items_by_user.items():
        selected = select_top_posts(
            user_items,
            posts_to_keep=posts_to_keep,
            by_date=by_date,
            get_date=lambda x: parse_date(x.get("date_posted")),
            get_reactions=lambda x: int(x.get("num_likes", 0) or 0),
            get_comments=lambda x: int(x.get("num_comments", 0) or 0),
            get_followers=lambda x: int(x.get("user_followers")) if x.get("user_followers") else None,
        )
        top_items.extend(selected)

    if not top_items and items_by_user:
        logger.warning(
            f"Bright Data: 0 posts selected from {sum(len(v) for v in items_by_user.values())} items "
            f"({len(items_by_user)} companies) — check _fetch_results logs"
        )

    # Map to Post models, skipping posts already in DB (dedup by post_url)
    created_posts: list[Post] = []
    for item in top_items:
        post = await _item_to_post(item, job)
        # Propagate sector from watched_account when job has no sector (e.g. scrape by CSM)
        if not post.sector:
            slug = unquote(item.get("user_id", ""))
            post.sector = slug_to_sector.get(slug)
        if post.post_url:
            existing = (await db.execute(
                select(Post.id).where(Post.post_url == post.post_url).limit(1)
            )).scalar()
            if existing:
                logger.debug(f"Skipping duplicate post_url: {post.post_url}")
                continue
        db.add(post)
        created_posts.append(post)

    # Normalize author_company: use best display name per slug
    best_names: dict[str, str] = {}
    for p in created_posts:
        slug = p.author_name or ""
        name = p.author_company or ""
        if slug and name != slug and (slug not in best_names or len(name) > len(best_names[slug])):
            best_names[slug] = name
    for p in created_posts:
        slug = p.author_name or ""
        if slug in best_names:
            p.author_company = best_names[slug]

    return created_posts



def _item_date_after(item: dict, cutoff: datetime) -> bool:
    """Return True if the item's date_posted is on or after cutoff."""
    raw = item.get("date_posted")
    if not raw:
        return True  # keep items with no date
    try:
        from dateutil import parser as dateutil_parser
        dt = dateutil_parser.parse(raw)
        if dt.tzinfo is None:
            dt = dt.replace(tzinfo=timezone.utc)
        return dt >= cutoff
    except Exception:
        return True  # keep on parse error


async def _item_to_post(item: dict, job: ScrapeJob) -> Post:
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

    # Detect gif vs single image vs multiple images
    image_count = len(images)
    is_gif = False
    if has_image and not has_video and not has_document and image_count == 1:
        is_gif = await detect_image_gif(images[0])

    format_family = classify_format_family(
        content_type=content_type,
        duration_seconds=duration_seconds,
        has_video=has_video,
        has_image=has_image,
        has_document=has_document,
        image_count=image_count,
        is_gif=is_gif,
    )

    engagement = compute_engagement_score(reactions, comments_count, shares, 0, 0)

    # Follower count & engagement rate
    followers_raw = item.get("user_followers")
    author_follower_count = int(followers_raw) if followers_raw else None
    engagement_rate = compute_engagement_rate(reactions, comments_count, author_follower_count)

    post_text = item.get("post_text") or ""

    # Extract proper author display name from BD title ("text... | CompanyName | N comments")
    author_display = item.get("user_id")
    bd_title = item.get("title") or ""
    title_parts = [p.strip() for p in bd_title.split("|")]
    if len(title_parts) >= 3 and "comment" in title_parts[-1].lower():
        author_display = title_parts[-2]

    return Post(
        id=uuid.uuid4(),
        scrape_job_id=job.id,
        title=truncate_title(post_text) if post_text else None,
        author_name=item.get("user_id"),
        author_company=author_display,
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
        author_follower_count=author_follower_count,
        engagement_rate=engagement_rate,
        post_url=item.get("url"),
        video_url=video_url,
        image_url=image_url,
        duration_seconds=duration_seconds,
        publication_date=parse_date(item.get("date_posted")),
        raw_data=item,
    )
