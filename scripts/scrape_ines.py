#!/usr/bin/env python3
"""
Standalone scrape script for Inès Bruguier — 15 posts per account.

Calls Bright Data directly (no local API dependency).
Inserts into Neon first, then syncs to local DB.

Run: python scripts/scrape_ines.py
     python scripts/scrape_ines.py --dry-run
"""
import argparse
import asyncio
import json
import logging
import re
import sys
import time
import uuid
from collections import defaultdict
from datetime import datetime, timezone
from urllib.parse import unquote

import asyncpg
import httpx
from dotenv import load_dotenv
import os

load_dotenv()

logging.basicConfig(level=logging.INFO, format="[%(asctime)s] %(message)s", datefmt="%H:%M:%S")
log = logging.getLogger(__name__)

# ─── Config ────────────────────────────────────────────────────────────────────
API_BRIGHT_DATA = os.getenv("API_BRIGHT_DATA", "")
NEON_URL = os.getenv("POSTGRES_URL", "")
LOCAL_URL = os.getenv("DATABASE_URL", "postgresql://carlo.dhalluin@localhost/onda_poc")

DATASET_ID = "gd_lyy3tktm25m4avu764"
BD_BASE = "https://api.brightdata.com/datasets/v3"
POSTS_PER_ACCOUNT = 15
POLL_INTERVAL = 30
MAX_WAIT = 60 * 45  # 45 min

INES_EMAIL = "ines.bruguier@playplay.com"

INES_ACCOUNTS = [
    ("Virgin Media O2",  "https://www.linkedin.com/company/virgin-media-o2/"),
    ("Arthur D Little",  "https://www.linkedin.com/company/arthur-d--little"),
    ("Atalian",          "https://www.linkedin.com/company/atalian"),
    ("Dräger",           "https://www.linkedin.com/company/draeger"),
    ("RAJA",             "https://www.linkedin.com/company/raja"),
    ("Serge Ferrari",    "https://www.linkedin.com/company/serge-ferrari"),
    ("E.ON UK",          "https://www.linkedin.com/company/e-on-uk"),
    ("Unum UK",          "https://www.linkedin.com/company/unum-uk"),
    ("Voyage Care",      "https://www.linkedin.com/company/voyage-care-ltd"),
    ("Dataiku",          "https://www.linkedin.com/company/dataiku"),
    ("Adagio",           "https://www.linkedin.com/company/aparthotels-adagio"),
    ("Howden",           "https://www.linkedin.com/company/howden-insurance"),
    ("Calderys",         "https://www.linkedin.com/company/calderys"),
    ("Wise",             "https://www.linkedin.com/company/wiseaccount"),
    ("Suntory",          "https://www.linkedin.com/company/suntory-beverage-food-france"),
    ("Younited",         "https://www.linkedin.com/company/younited-credit"),
    ("AIG",              "https://www.linkedin.com/company/aig"),
    ("Culligan",         "https://www.linkedin.com/company/culligan-france"),
    ("Klepierre",        "https://www.linkedin.com/company/klepierre"),
    ("EJ Group",         "https://www.linkedin.com/company/groupe-ej"),
]

# Slug → account name mapping (for sector lookup)
SLUG_TO_NAME = {
    re.search(r"/company/([^/]+)", url).group(1): name
    for name, url in INES_ACCOUNTS
    if re.search(r"/company/([^/]+)", url)
}


# ─── Helpers ───────────────────────────────────────────────────────────────────

def normalize_url(url: str) -> str:
    url = url.strip().split("?")[0]
    url = re.sub(r"https?://\w+\.linkedin\.com", "https://www.linkedin.com", url)
    m = re.search(r"/company/([^/]+)", url)
    if m:
        return f"https://www.linkedin.com/company/{m.group(1)}/"
    return url if url.endswith("/") else url + "/"


def asyncpg_url(url: str) -> str:
    """Strip sslmode/channel_binding params from URL for asyncpg."""
    if "?" in url:
        base, params = url.split("?", 1)
        filtered = "&".join(
            p for p in params.split("&")
            if not p.startswith(("sslmode=", "channel_binding="))
        )
        return f"{base}?{filtered}" if filtered else base
    return url


def bd_headers():
    return {"Authorization": f"Bearer {API_BRIGHT_DATA}"}


def compute_engagement_score(reactions, comments):
    return float(reactions + comments * 3)


def compute_engagement_rate(reactions, comments, followers):
    if not followers or followers <= 0:
        return None
    return (reactions + comments) / followers * 100


def classify_format(has_video, has_image, has_document, image_count, is_gif=False):
    if has_video:
        return "video"
    if has_document:
        return "carousel"
    if has_image:
        if is_gif:
            return "gif"
        if image_count >= 2:
            return "images"
        return "image"
    return "text"


def parse_date(raw):
    if not raw:
        return None
    try:
        from dateutil import parser as dp
        dt = dp.parse(raw)
        return dt.replace(tzinfo=None) if dt.tzinfo else dt
    except Exception:
        return None


def truncate_title(text, max_len=500):
    if not text:
        return None
    text = text.replace("\n", " ").strip()
    return text[:max_len] if len(text) > max_len else text


def item_to_row(item: dict, job_id: uuid.UUID) -> dict:
    reactions = int(item.get("num_likes", 0) or 0)
    comments = int(item.get("num_comments", 0) or 0)
    videos = item.get("videos") or []
    images = item.get("images") or []
    has_video = bool(videos)
    has_image = bool(images)
    has_document = bool(item.get("document_page_count") or item.get("document_cover_image"))
    image_count = len(images)
    content_type = "video" if has_video else ("image" if has_image else "text")
    format_family = classify_format(has_video, has_image, has_document, image_count)
    followers_raw = item.get("user_followers")
    followers = int(followers_raw) if followers_raw else None
    duration_raw = item.get("video_duration")

    # Extract author display name
    author_display = item.get("user_id")
    bd_title = item.get("title") or ""
    parts = [p.strip() for p in bd_title.split("|")]
    if len(parts) >= 3 and "comment" in parts[-1].lower():
        author_display = parts[-2]

    post_text = item.get("post_text") or ""
    return dict(
        id=uuid.uuid4(),
        scrape_job_id=job_id,
        title=truncate_title(post_text),
        author_name=item.get("user_id"),
        author_company=author_display,
        sector=None,  # filled later
        platform="linkedin",
        content_type=content_type,
        format_family=format_family,
        format_variation=None,
        reactions=reactions,
        comments=comments,
        shares=0,
        clicks=0,
        impressions=0,
        engagement_score=compute_engagement_score(reactions, comments),
        author_follower_count=followers,
        engagement_rate=compute_engagement_rate(reactions, comments, followers),
        post_url=item.get("url"),
        video_url=videos[0] if videos else None,
        image_url=images[0] if images else item.get("video_thumbnail"),
        duration_seconds=int(duration_raw) if duration_raw else None,
        publication_date=parse_date(item.get("date_posted")),
        raw_data=json.dumps(item),
        claude_use_case=None,
        created_at=datetime.utcnow(),
        playplay_flag=False,
        playplay_flag_by=None,
        playplay_flag_name=None,
        playplay_flag_at=None,
        playplay_design_flag=False,
        playplay_design_flag_by=None,
        playplay_design_flag_name=None,
        playplay_design_flag_at=None,
    )


# ─── Bright Data ───────────────────────────────────────────────────────────────

async def trigger_bd_batch(client: httpx.AsyncClient, urls: list[str]) -> str:
    batch = [{"url": u} for u in urls]
    resp = await client.post(
        f"{BD_BASE}/trigger",
        headers=bd_headers(),
        params={
            "dataset_id": DATASET_ID,
            "type": "discover_new",
            "discover_by": "company_url",
            "limit_per_input": POSTS_PER_ACCOUNT,
        },
        json=batch,
    )
    resp.raise_for_status()
    snapshot_id = resp.json()["snapshot_id"]
    log.info(f"Bright Data snapshot triggered: {snapshot_id}")
    return snapshot_id


async def poll_bd_snapshot(client: httpx.AsyncClient, snapshot_id: str) -> bool:
    """Poll until ready. Returns True on success, False on failure."""
    start = time.time()
    while time.time() - start < MAX_WAIT:
        await asyncio.sleep(POLL_INTERVAL)
        resp = await client.get(
            f"{BD_BASE}/progress/{snapshot_id}",
            headers=bd_headers(),
        )
        resp.raise_for_status()
        status = resp.json().get("status", "unknown")
        elapsed = int(time.time() - start)
        log.info(f"  BD snapshot {snapshot_id}: status={status} ({elapsed}s)")
        if status == "ready":
            return True
        if status == "failed":
            log.error(f"  BD snapshot FAILED")
            return False
    log.error(f"  BD snapshot timed out after {MAX_WAIT}s")
    return False


async def fetch_bd_results(client: httpx.AsyncClient, snapshot_id: str) -> list[dict]:
    """Fetch results with retry on HTTP 202."""
    for attempt in range(1, 6):
        resp = await client.get(
            f"{BD_BASE}/snapshot/{snapshot_id}",
            headers=bd_headers(),
            params={"format": "json"},
        )
        if resp.status_code == 202:
            log.info(f"  HTTP 202 (not ready), retry {attempt}/5 in 30s...")
            await asyncio.sleep(30)
            continue
        resp.raise_for_status()
        items = resp.json()
        if isinstance(items, list):
            return items
        if isinstance(items, dict) and items.get("status") in ("building", "pending"):
            log.info(f"  status={items.get('status')}, retry {attempt}/5 in 30s...")
            await asyncio.sleep(30)
            continue
        return []
    return []


# ─── DB Insertion ──────────────────────────────────────────────────────────────

INSERT_JOB_SQL = """
INSERT INTO scrape_jobs (
    id, search_query, sector, status, total_posts,
    brightdata_snapshot_id, scraper_backend,
    created_at, completed_at,
    scrape_posts_per_account, scrape_by_date, is_custom_search, user_email
) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)
ON CONFLICT (id) DO UPDATE SET
    status=EXCLUDED.status, total_posts=EXCLUDED.total_posts,
    completed_at=EXCLUDED.completed_at
"""

INSERT_POST_SQL = """
INSERT INTO posts (
    id, scrape_job_id, title, author_name, author_company, sector, platform,
    content_type, format_family, format_variation, reactions, comments, shares,
    clicks, impressions, engagement_score, author_follower_count, engagement_rate,
    post_url, video_url, image_url, duration_seconds, publication_date, raw_data,
    claude_use_case, created_at,
    playplay_flag, playplay_flag_by, playplay_flag_name, playplay_flag_at,
    playplay_design_flag, playplay_design_flag_by, playplay_design_flag_name, playplay_design_flag_at
) VALUES (
    $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,
    $19,$20,$21,$22,$23,$24,$25,$26,$27,$28,$29,$30,$31,$32,$33,$34
) ON CONFLICT (id) DO NOTHING
"""


async def insert_job_and_posts(conn: asyncpg.Connection, job_row: dict, posts: list[dict], label: str):
    await conn.execute(INSERT_JOB_SQL,
        job_row["id"], job_row["search_query"], job_row["sector"], job_row["status"],
        job_row["total_posts"], job_row["brightdata_snapshot_id"], job_row["scraper_backend"],
        job_row["created_at"], job_row["completed_at"],
        job_row["scrape_posts_per_account"], job_row["scrape_by_date"],
        job_row["is_custom_search"], job_row["user_email"],
    )
    for p in posts:
        await conn.execute(INSERT_POST_SQL,
            p["id"], p["scrape_job_id"], p["title"], p["author_name"], p["author_company"],
            p["sector"], p["platform"], p["content_type"], p["format_family"], p["format_variation"],
            p["reactions"], p["comments"], p["shares"], p["clicks"], p["impressions"],
            p["engagement_score"], p["author_follower_count"], p["engagement_rate"],
            p["post_url"], p["video_url"], p["image_url"], p["duration_seconds"],
            p["publication_date"], p["raw_data"], p["claude_use_case"], p["created_at"],
            p["playplay_flag"], p["playplay_flag_by"], p["playplay_flag_name"], p["playplay_flag_at"],
            p["playplay_design_flag"], p["playplay_design_flag_by"], p["playplay_design_flag_name"],
            p["playplay_design_flag_at"],
        )
    log.info(f"  [{label}] Inserted job + {len(posts)} posts OK")


# ─── Main ──────────────────────────────────────────────────────────────────────

async def main(dry_run: bool):
    if not API_BRIGHT_DATA:
        log.error("API_BRIGHT_DATA not set in .env")
        sys.exit(1)
    if not NEON_URL:
        log.error("POSTGRES_URL (Neon) not set in .env")
        sys.exit(1)

    log.info(f"=== Scrape Inès Bruguier — {POSTS_PER_ACCOUNT} posts/account ===")
    log.info(f"Accounts: {len(INES_ACCOUNTS)}")

    if dry_run:
        log.info("[DRY RUN] Would scrape:")
        for name, url in INES_ACCOUNTS:
            log.info(f"  • {name} ({url})")
        return

    urls = [normalize_url(url) for _, url in INES_ACCOUNTS]
    allowed_slugs = {re.search(r"/company/([^/]+)", u).group(1) for u in urls}

    job_id = uuid.uuid4()
    now = datetime.utcnow()

    async with httpx.AsyncClient(timeout=60) as client:
        # 1. Trigger Bright Data
        log.info("Triggering Bright Data batch...")
        snapshot_id = await trigger_bd_batch(client, urls)

        # 2. Poll until ready
        log.info(f"Polling snapshot {snapshot_id} (every {POLL_INTERVAL}s, max {MAX_WAIT//60}min)...")
        ok = await poll_bd_snapshot(client, snapshot_id)
        if not ok:
            log.error("Scrape failed or timed out. Aborting.")
            sys.exit(1)

        # 3. Fetch results
        log.info("Fetching results from Bright Data...")
        items = await fetch_bd_results(client, snapshot_id)
        log.info(f"  Received {len(items)} raw items")

    # 4. Filter: allowed slugs, no reposts, no errors
    items = [
        i for i in items
        if not i.get("error")
        and unquote(i.get("user_id", "")) in allowed_slugs
        and i.get("post_type") != "repost"
        and not (i.get("title") or "").strip().startswith("|")
    ]
    log.info(f"  {len(items)} items after filtering")

    # 5. Dedup by URL
    seen, unique = set(), []
    for i in items:
        u = i.get("url", "")
        if u and u not in seen:
            seen.add(u)
            unique.append(i)
    items = unique
    log.info(f"  {len(items)} items after dedup")

    # 6. Select top 15 per account (by date = most recent)
    by_user: dict[str, list] = defaultdict(list)
    for i in items:
        by_user[unquote(i.get("user_id", ""))].append(i)

    selected = []
    for slug, user_items in by_user.items():
        # Sort by date descending, take top POSTS_PER_ACCOUNT
        dated = [(parse_date(i.get("date_posted")), i) for i in user_items]
        dated.sort(key=lambda x: x[0] or datetime.min, reverse=True)
        selected.extend(i for _, i in dated[:POSTS_PER_ACCOUNT])

    log.info(f"  {len(selected)} posts selected (top {POSTS_PER_ACCOUNT}/account by date)")

    # 7. Build post rows + fix sector from account name
    posts = []
    for item in selected:
        row = item_to_row(item, job_id)
        slug = unquote(item.get("user_id", ""))
        # Look up sector from watched_accounts (will be done via DB query below)
        row["_slug"] = slug
        posts.append(row)

    # 8. Look up sectors from local DB
    local_conn = await asyncpg.connect(asyncpg_url(LOCAL_URL))
    try:
        accounts = await local_conn.fetch(
            "SELECT linkedin_url, sector FROM watched_accounts WHERE assigned_cs_email = $1",
            INES_EMAIL,
        )
        slug_to_sector = {}
        for a in accounts:
            m = re.search(r"/company/([^/]+)", a["linkedin_url"] or "")
            if m:
                slug_to_sector[m.group(1)] = a["sector"]
        for p in posts:
            p["sector"] = slug_to_sector.get(p.pop("_slug"), None)
    finally:
        await local_conn.close()

    # 9. Build job row
    completed_at = datetime.utcnow()
    job_row = dict(
        id=job_id,
        search_query=f"ines.bruguier",
        sector=None,
        status="completed",
        total_posts=len(posts),
        brightdata_snapshot_id=json.dumps({"company": snapshot_id}),
        scraper_backend="brightdata",
        created_at=now,
        completed_at=completed_at,
        scrape_posts_per_account=POSTS_PER_ACCOUNT,
        scrape_by_date=True,
        is_custom_search=False,
        user_email=None,
    )

    log.info(f"\nJob {job_id}: {len(posts)} posts to insert")

    # 10. Classify use cases with Claude Haiku
    log.info("Classifying use cases with Claude Haiku...")
    try:
        api_key = os.getenv("ANTHROPIC_API_KEY", "")
        if not api_key:
            log.warning("ANTHROPIC_API_KEY not set — skipping use case classification")
        else:
            sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
            from app.services.use_case_classifier import classify_posts
            posts_for_classification = [
                {
                    "id": str(p["id"]),
                    "title": p["title"],
                    "author_name": p["author_name"],
                    "author_company": p["author_company"],
                    "format_family": p["format_family"],
                    "sector": p["sector"],
                }
                for p in posts
            ]
            use_case_map = await classify_posts(posts_for_classification)
            for p in posts:
                uc = use_case_map.get(str(p["id"]))
                if uc:
                    p["claude_use_case"] = uc
            log.info(f"  {len(use_case_map)}/{len(posts)} posts classified")
    except Exception as e:
        log.warning(f"Use case classification failed (non-blocking): {e}")

    # 11. Insert into NEON first
    log.info("Inserting into Neon (primary)...")
    neon_conn = await asyncpg.connect(asyncpg_url(NEON_URL), ssl="require")
    try:
        await insert_job_and_posts(neon_conn, job_row, posts, "Neon")
    finally:
        await neon_conn.close()

    # 11. Insert into local DB
    log.info("Inserting into local DB...")
    local_conn = await asyncpg.connect(asyncpg_url(LOCAL_URL))
    try:
        await insert_job_and_posts(local_conn, job_row, posts, "Local")
    finally:
        await local_conn.close()

    log.info(f"\n=== Done! {len(posts)} posts for Inès on Neon + local. ===")


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--dry-run", action="store_true", help="Show what would run without executing")
    args = parser.parse_args()
    asyncio.run(main(dry_run=args.dry_run))
