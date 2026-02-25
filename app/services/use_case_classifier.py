import json
import logging

import httpx

from app.config import settings

logger = logging.getLogger(__name__)

MODEL = "claude-haiku-4-5-20251001"
API_URL = "https://api.anthropic.com/v1/messages"

USE_CASES = [
    "announce an event",
    "recap an event",
    "present a webinar/program",
    "share internal initiative",
    "promote open positions",
    "welcome new employee",
    "spotlight an employee/team",
    "present an offer/product",
    "showcase a customer success story",
    "present company strategy",
    "share results or statistics or performance",
    "share company values",
    "share tips and tricks",
    "promote a product",
    "share news",
    "explain a process",
    "train employees",
    "educate on a topic",
    "share a testimonial",
    "introduce a new tool or feature",
    "react to current events",
    "celebrate milestone",
    "tutorial",
    "express opinion (pov)",
    "promote a service",
    "other",
]

USE_CASES_SET = set(USE_CASES)

CHUNK_SIZE = 40


def _build_prompt(posts: list[dict]) -> str:
    posts_block = ""
    for p in posts:
        text = (p.get("title") or "")[:500]
        posts_block += (
            f'- id: "{p["id"]}", author: "{p.get("author_name", "N/A")}", '
            f'company: "{p.get("author_company", "N/A")}", '
            f'format: "{p.get("format_family", "N/A")}", '
            f'sector: "{p.get("sector", "N/A")}"\n'
            f'  text: "{text}"\n'
        )

    return f"""You are a LinkedIn content analyst. Classify each post into exactly one use case from the list below.

USE CASES:
{chr(10).join(f"- {uc}" for uc in USE_CASES)}

CLARIFICATIONS for ambiguous cases:
- "present an offer/product" = informative presentation of a product/offer vs "promote a product" = active promotion with advertising intent and CTA
- "share a testimonial" = general testimonial (employee, partner) vs "showcase a customer success story" = specifically a client case study
- "educate on a topic" = educational content for external audience vs "train employees" = internal training
- "tutorial" = practical step-by-step guide vs "explain a process" = explanation of a business process
- "share news" = company's own news vs "react to current events" = reaction to external news/events
- When in doubt, use "other"

POSTS:
{posts_block}

Respond with ONLY a JSON array, no markdown, no explanation:
[{{"post_id": "...", "use_case": "..."}}]"""


async def _classify_chunk(posts: list[dict]) -> dict[str, str]:
    api_key = settings.ANTHROPIC_API_KEY
    if not api_key:
        logger.error("ANTHROPIC_API_KEY not configured")
        return {}

    prompt = _build_prompt(posts)

    async with httpx.AsyncClient(timeout=30.0) as client:
        resp = await client.post(
            API_URL,
            headers={
                "x-api-key": api_key,
                "anthropic-version": "2023-06-01",
                "content-type": "application/json",
            },
            json={
                "model": MODEL,
                "max_tokens": 4096,
                "messages": [{"role": "user", "content": prompt}],
            },
        )
        if resp.status_code != 200:
            logger.error(f"Anthropic API error {resp.status_code}: {resp.text}")
            return {}

        data = resp.json()
        raw_text = data["content"][0]["text"].strip()

        # Strip markdown fences if present
        if raw_text.startswith("```"):
            raw_text = raw_text.split("\n", 1)[1] if "\n" in raw_text else raw_text[3:]
            if raw_text.endswith("```"):
                raw_text = raw_text[:-3].strip()

        results = json.loads(raw_text)

    mapping: dict[str, str] = {}
    for item in results:
        post_id = str(item["post_id"])
        use_case = item["use_case"]
        if use_case not in USE_CASES_SET:
            use_case = "other"
        mapping[post_id] = use_case
    return mapping


async def classify_posts(posts: list[dict]) -> dict[str, str]:
    """Classify posts by use case using Claude. Returns {post_id: use_case}."""
    if not posts:
        return {}

    all_results: dict[str, str] = {}

    for i in range(0, len(posts), CHUNK_SIZE):
        chunk = posts[i : i + CHUNK_SIZE]
        try:
            chunk_results = await _classify_chunk(chunk)
            all_results.update(chunk_results)
        except Exception as e:
            logger.error(f"Classification chunk failed: {e}")
            # Continue with next chunk

    return all_results
