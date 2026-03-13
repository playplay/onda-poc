"""Classify a post's sector using Claude Haiku."""
import json
import logging

import httpx

from app.config import settings

logger = logging.getLogger(__name__)

MODEL = "claude-haiku-4-5-20251001"
API_URL = "https://api.anthropic.com/v1/messages"

SECTORS = [
    "Banking & Financial Services",
    "Construction & Real Estate",
    "Consulting",
    "Consumer Goods & Retail",
    "Energy & Utilities",
    "Entertainment & Gaming",
    "Healthcare",
    "Manufacturing & Industry",
    "Media & Telecommunications",
    "Public Sector",
    "Technology & Software",
]


async def classify_sector(
    post_text: str,
    author_name: str | None = None,
    author_company: str | None = None,
) -> str | None:
    """Return the best-matching sector for a post, or None on error."""
    api_key = settings.ANTHROPIC_API_KEY
    if not api_key:
        logger.error("ANTHROPIC_API_KEY not configured")
        return None

    prompt = f"""You are a LinkedIn content analyst. Given the post below, classify the author's company into exactly one sector.

KNOWN SECTORS:
{chr(10).join(f"- {s}" for s in SECTORS)}

If none of these fit well, create a short generic English sector name (2-4 words).

POST:
- author: "{author_name or 'N/A'}"
- company/headline: "{author_company or 'N/A'}"
- text: "{(post_text or '')[:800]}"

Respond with ONLY a JSON object, no markdown:
{{"sector": "..."}}"""

    try:
        async with httpx.AsyncClient(timeout=15.0) as client:
            resp = await client.post(
                API_URL,
                headers={
                    "x-api-key": api_key,
                    "anthropic-version": "2023-06-01",
                    "content-type": "application/json",
                },
                json={
                    "model": MODEL,
                    "max_tokens": 256,
                    "messages": [{"role": "user", "content": prompt}],
                },
            )
            if resp.status_code != 200:
                logger.error(f"Anthropic API error {resp.status_code}: {resp.text}")
                return None

            raw_text = resp.json()["content"][0]["text"].strip()
            if raw_text.startswith("```"):
                raw_text = raw_text.split("\n", 1)[1] if "\n" in raw_text else raw_text[3:]
                if raw_text.endswith("```"):
                    raw_text = raw_text[:-3].strip()

            result = json.loads(raw_text)
            return result.get("sector")
    except Exception as e:
        logger.error(f"Sector classification failed: {e}")
        return None
