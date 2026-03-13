"""
Shared Bright Data snapshot fetcher with retry on HTTP 202 / "not ready" responses.

All three BD scrapers (LinkedIn, Instagram, TikTok) use this to fetch results reliably.
"""

import asyncio
import json
import logging

import httpx

from app.config import settings

logger = logging.getLogger(__name__)

BASE_URL = "https://api.brightdata.com/datasets/v3"
MAX_RETRIES = 5
RETRY_DELAY_SECONDS = 30


def _headers() -> dict[str, str]:
    return {"Authorization": f"Bearer {settings.API_BRIGHT_DATA}"}


async def fetch_bd_snapshot(
    client: httpx.AsyncClient,
    snapshot_id: str,
    *,
    label: str = "BD",
) -> list[dict]:
    """Fetch results for a Bright Data snapshot with retry on 202 / "not ready".

    Retries up to MAX_RETRIES times when BD returns HTTP 202 or a dict with
    a 'status'='building' payload (race condition between progress=ready and
    actual data availability).
    """
    for attempt in range(1, MAX_RETRIES + 1):
        resp = await client.get(
            f"{BASE_URL}/snapshot/{snapshot_id}",
            headers=_headers(),
            params={"format": "json"},
        )

        # HTTP 202 = snapshot still building
        if resp.status_code == 202:
            logger.info(
                f"{label} snapshot {snapshot_id}: HTTP 202 (not ready), "
                f"retry {attempt}/{MAX_RETRIES} in {RETRY_DELAY_SECONDS}s"
            )
            await asyncio.sleep(RETRY_DELAY_SECONDS)
            continue

        resp.raise_for_status()
        items = resp.json()

        # Happy path: got a list
        if isinstance(items, list):
            return items

        # Dict with "status": "building" → retry
        if isinstance(items, dict) and items.get("status") in ("building", "pending"):
            logger.info(
                f"{label} snapshot {snapshot_id}: status={items.get('status')}, "
                f"retry {attempt}/{MAX_RETRIES} in {RETRY_DELAY_SECONDS}s"
            )
            await asyncio.sleep(RETRY_DELAY_SECONDS)
            continue

        # --- Auto-recovery for other non-list responses ---
        logger.warning(
            f"{label} snapshot {snapshot_id}: expected list, got {type(items).__name__}: "
            f"{str(items)[:300]}"
        )

        if isinstance(items, dict):
            for key, val in items.items():
                if isinstance(val, list) and val and isinstance(val[0], dict):
                    logger.info(f"{label} snapshot {snapshot_id}: recovered {len(val)} items from key '{key}'")
                    return val
            # Single post item
            if items.get("url") or items.get("post_text") or items.get("user_id") or items.get("account") or items.get("description"):
                logger.info(f"{label} snapshot {snapshot_id}: recovered 1 item (single dict)")
                return [items]

        # JSONL fallback
        try:
            text = resp.text.strip()
            if "\n" in text:
                lines = [json.loads(line) for line in text.splitlines() if line.strip()]
                if lines and isinstance(lines[0], dict):
                    logger.info(f"{label} snapshot {snapshot_id}: recovered {len(lines)} items from JSONL")
                    return lines
        except (json.JSONDecodeError, Exception):
            pass

        logger.error(f"{label} snapshot {snapshot_id}: could not recover any items, returning []")
        return []

    # Exhausted all retries
    logger.error(
        f"{label} snapshot {snapshot_id}: still not ready after {MAX_RETRIES} retries, returning []"
    )
    return []
