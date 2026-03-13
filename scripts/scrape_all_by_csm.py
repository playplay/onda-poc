#!/usr/bin/env python3
"""
Scrape all watched accounts CS by CS, 15 posts per account.
Triggers one Bright Data job per CSM, waits for completion before starting the next.

Run: python scripts/scrape_all_by_csm.py
     python scripts/scrape_all_by_csm.py --dry-run     # show what would run
     python scripts/scrape_all_by_csm.py --posts 10    # override posts per account
"""
import argparse
import asyncio
import os
import sys
import time
from datetime import datetime

import httpx

API_BASE = "http://localhost:3001/api"
ADMIN_EMAIL = os.getenv("AUTH_EMAIL", "carlo@playplay.com")
ADMIN_PASSWORD = os.getenv("AUTH_PASSWORD", "")

CSMS = [
    ("maud.alexandre@playplay.com", "Maud"),
    ("aurore@playplay.com",         "Aurore"),
    ("manon.zacarias@playplay.com", "Manon"),
    ("kenny@playplay.com",          "Kenny"),
]

POLL_INTERVAL = 30   # seconds between status polls
MAX_WAIT = 60 * 30   # 30 min max per job


def log(msg: str):
    print(f"[{datetime.now().strftime('%H:%M:%S')}] {msg}", flush=True)


async def get_auth_cookie(client: httpx.AsyncClient) -> str:
    resp = await client.post(f"{API_BASE}/auth/login", json={
        "email": ADMIN_EMAIL,
        "password": ADMIN_PASSWORD,
    })
    resp.raise_for_status()
    cookie = resp.cookies.get("onda_token")
    if not cookie:
        raise RuntimeError("Login failed — no onda_token cookie. Check AUTH_EMAIL / AUTH_PASSWORD.")
    return cookie


async def trigger_scrape(client: httpx.AsyncClient, csm_email: str, posts_per_account: int) -> str:
    resp = await client.post(f"{API_BASE}/scrape", json={
        "csm_email": csm_email,
        "posts_per_account": posts_per_account,
        "by_date": True,   # most recent posts
    })
    resp.raise_for_status()
    data = resp.json()
    job_id = data["id"]
    status = data["status"]
    backend = data.get("scraper_backend", "?")
    log(f"  → Job {job_id} started (status={status}, backend={backend})")
    return job_id


async def wait_for_job(client: httpx.AsyncClient, job_id: str, csm_label: str) -> dict:
    start = time.time()
    while True:
        await asyncio.sleep(POLL_INTERVAL)
        resp = await client.get(f"{API_BASE}/scrape/{job_id}")
        resp.raise_for_status()
        data = resp.json()
        status = data["status"]
        elapsed = int(time.time() - start)
        log(f"  [{csm_label}] status={status} ({elapsed}s elapsed)")

        if status == "completed":
            log(f"  [{csm_label}] Done — {data.get('total_posts', 0)} posts collected.")
            return data
        if status == "failed":
            err = data.get("error_message", "unknown error")
            log(f"  [{csm_label}] FAILED: {err}")
            return data
        if elapsed > MAX_WAIT:
            log(f"  [{csm_label}] Timed out after {MAX_WAIT}s — continuing to next CSM.")
            return data


async def main(dry_run: bool, posts_per_account: int):
    if not ADMIN_PASSWORD:
        log("ERROR: Set AUTH_PASSWORD env var (admin password).")
        sys.exit(1)

    log(f"=== Onda batch scrape — {posts_per_account} posts/account, by date ===")
    log(f"CSMs to scrape: {', '.join(label for _, label in CSMS)}")
    if dry_run:
        log("[DRY RUN] Would trigger the following jobs:")
        for email, label in CSMS:
            log(f"  • {label} ({email})")
        return

    # Use a long timeout for polls: BD fetch of 600+ records takes > 30s
    async with httpx.AsyncClient(timeout=360) as client:
        log("Authenticating...")
        cookie = await get_auth_cookie(client)
        client.cookies.set("onda_token", cookie)
        log("Authenticated.")

        for csm_email, csm_label in CSMS:
            log(f"\n--- Starting scrape for {csm_label} ({csm_email}) ---")
            try:
                job_id = await trigger_scrape(client, csm_email, posts_per_account)
                result = await wait_for_job(client, job_id, csm_label)
                if result["status"] != "completed":
                    log(f"  [{csm_label}] Job did not complete — moving on.")
            except Exception as e:
                log(f"  [{csm_label}] ERROR: {e}")

        log("\n=== All CSM scrapes done ===")


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--dry-run", action="store_true")
    parser.add_argument("--posts", type=int, default=15)
    args = parser.parse_args()

    asyncio.run(main(dry_run=args.dry_run, posts_per_account=args.posts))
