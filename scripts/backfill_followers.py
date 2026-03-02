"""
One-shot script to backfill follower counts for person accounts via Apify,
then recalculate engagement_rate on their posts.

Usage:
    python scripts/backfill_followers.py
"""

import os
import sys
import re

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from dotenv import load_dotenv
load_dotenv()

import psycopg2

POSTGRES_URL = os.environ["POSTGRES_URL"]
APIFY_TOKEN = os.environ["APIFY_TOKEN"]
PROFILE_ACTOR = "harvestapi/linkedin-profile-scraper"


def get_person_accounts_missing_followers(conn):
    """Return list of (id, linkedin_url) for person accounts without follower_count."""
    with conn.cursor() as cur:
        cur.execute(
            "SELECT id, linkedin_url FROM watched_accounts WHERE type = 'person' AND follower_count IS NULL"
        )
        return cur.fetchall()


def extract_slug(linkedin_url: str) -> str:
    from urllib.parse import unquote
    match = re.search(r"/in/([^/]+)", linkedin_url)
    return unquote(match.group(1)).lower() if match else ""


def normalize_profile_url(url: str) -> str:
    url = url.strip().split("?")[0]
    url = re.sub(r"https?://\w+\.linkedin\.com", "https://www.linkedin.com", url)
    match = re.search(r"/in/([^/]+)", url)
    if match:
        return f"https://www.linkedin.com/in/{match.group(1)}/"
    if not url.endswith("/"):
        url += "/"
    return url


def fetch_follower_counts(urls: list[str]) -> dict[str, int]:
    """Call Apify linkedin-profile-scraper to get follower counts."""
    from apify_client import ApifyClient

    client = ApifyClient(APIFY_TOKEN)
    print(f"  Calling {PROFILE_ACTOR} for {len(urls)} profiles...")
    run = client.actor(PROFILE_ACTOR).call(run_input={"urls": urls})
    dataset_id = run.get("defaultDatasetId")
    items = list(client.dataset(dataset_id).iterate_items())

    result: dict[str, int] = {}
    for item in items:
        slug = (item.get("publicIdentifier") or "").lower()
        fc = item.get("followerCount")
        if slug and fc:
            result[slug] = int(fc)
    return result


def main():
    conn = psycopg2.connect(POSTGRES_URL)
    try:
        # 1. Find person accounts missing follower_count
        accounts = get_person_accounts_missing_followers(conn)
        if not accounts:
            print("All person accounts already have follower_count. Nothing to do.")
            return

        print(f"Found {len(accounts)} person accounts without follower_count.")

        # 2. Fetch follower counts via Apify
        url_map = {}  # slug → account_id
        urls = []
        for account_id, linkedin_url in accounts:
            slug = extract_slug(linkedin_url)
            if slug:
                url_map[slug] = account_id
                urls.append(normalize_profile_url(linkedin_url))

        follower_counts = fetch_follower_counts(urls)
        print(f"  Got follower counts for {len(follower_counts)}/{len(accounts)} accounts.")

        # 3. Update watched_accounts.follower_count
        with conn.cursor() as cur:
            for slug, fc in follower_counts.items():
                account_id = url_map.get(slug)
                if account_id:
                    cur.execute(
                        "UPDATE watched_accounts SET follower_count = %s WHERE id = %s",
                        (fc, account_id),
                    )
                    print(f"  Updated account {slug}: {fc} followers")

        # 4. Update posts.author_follower_count for posts by these authors
        updated_posts = 0
        with conn.cursor() as cur:
            for slug, fc in follower_counts.items():
                cur.execute(
                    "UPDATE posts SET author_follower_count = %s WHERE LOWER(author_name) = %s AND (author_follower_count IS NULL OR author_follower_count = 0)",
                    (fc, slug),
                )
                updated_posts += cur.rowcount

        print(f"  Updated author_follower_count on {updated_posts} posts.")

        # 5. Recalculate engagement_rate on all posts that have author_follower_count
        with conn.cursor() as cur:
            cur.execute(
                """
                UPDATE posts
                SET engagement_rate = (COALESCE(reactions, 0) + COALESCE(comments, 0))::float / author_follower_count * 100
                WHERE author_follower_count IS NOT NULL AND author_follower_count > 0
                  AND engagement_rate IS NULL
                """
            )
            print(f"  Recalculated engagement_rate on {cur.rowcount} posts.")

        conn.commit()
        print("Done!")

    finally:
        conn.close()


if __name__ == "__main__":
    main()
