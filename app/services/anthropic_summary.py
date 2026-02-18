import json
import logging
from collections.abc import AsyncGenerator

import httpx

from app.config import settings

logger = logging.getLogger(__name__)

MODEL = "claude-sonnet-4-20250514"
API_URL = "https://api.anthropic.com/v1/messages"


def _build_prompt(trend_data: dict) -> str:
    posts_text = ""
    for i, post in enumerate(trend_data["posts"][:30], 1):
        posts_text += (
            f"\n--- Post {i} ---\n"
            f"Title: {post.get('title', 'N/A')}\n"
            f"Author: {post.get('author_name', 'N/A')} ({post.get('author_company', 'N/A')})\n"
            f"Format: {post.get('format_family', 'N/A')}\n"
            f"Reactions: {post.get('reactions', 0)}, Comments: {post.get('comments', 0)}, "
            f"Shares: {post.get('shares', 0)}, Impressions: {post.get('impressions', 0)}\n"
            f"Engagement Score: {post.get('engagement_score', 0):.1f}\n"
        )
        if post.get("analysis"):
            a = post["analysis"]
            posts_text += (
                f"Business Objective: {a.get('business_objective', 'N/A')}\n"
                f"Use Case: {a.get('use_case', 'N/A')}\n"
                f"Creative Execution: {a.get('creative_execution', 'N/A')}\n"
                f"Audience: {a.get('audience_target', 'N/A')}\n"
                f"Tone: {a.get('tone_of_voice', 'N/A')}\n"
            )

    return (
        f"You are a LinkedIn content strategy expert. Analyze the following trend "
        f"(format: {trend_data['format_family']}, {trend_data['post_count']} posts) "
        f"and provide a concise intelligence summary.\n\n"
        f"Posts data:\n{posts_text}\n\n"
        f"Provide your analysis in this exact structure:\n"
        f"1. **Keywords**: Top 5-7 keywords/themes from these posts\n"
        f"2. **Sector**: Primary industry/sector these posts target\n"
        f"3. **Best Performing Content Type**: What content approach (short videos, "
        f"long documentaries, interviews, etc.) performs best and why\n"
        f"4. **Key Insights**: 2-3 actionable insights about this trend\n\n"
        f"Be concise, data-driven, and actionable. Use markdown formatting."
    )


async def stream_trend_summary(trend_data: dict) -> AsyncGenerator[str, None]:
    api_key = settings.ANTHROPIC_API_KEY
    if not api_key:
        yield f"data: {json.dumps({'type': 'error', 'message': 'ANTHROPIC_API_KEY not configured'})}\n\n"
        return

    prompt = _build_prompt(trend_data)

    try:
        async with httpx.AsyncClient(timeout=120.0) as client:
            async with client.stream(
                "POST",
                API_URL,
                headers={
                    "x-api-key": api_key,
                    "anthropic-version": "2023-06-01",
                    "content-type": "application/json",
                },
                json={
                    "model": MODEL,
                    "max_tokens": 1024,
                    "stream": True,
                    "messages": [{"role": "user", "content": prompt}],
                },
            ) as response:
                if response.status_code != 200:
                    body = await response.aread()
                    logger.error(f"Anthropic API error {response.status_code}: {body}")
                    yield f"data: {json.dumps({'type': 'error', 'message': f'API error: {response.status_code}'})}\n\n"
                    return

                async for line in response.aiter_lines():
                    if not line.startswith("data: "):
                        continue
                    payload = line[6:]
                    if payload == "[DONE]":
                        break
                    try:
                        event = json.loads(payload)
                    except json.JSONDecodeError:
                        continue

                    if event.get("type") == "content_block_delta":
                        delta = event.get("delta", {})
                        text = delta.get("text", "")
                        if text:
                            yield f"data: {json.dumps({'type': 'chunk', 'content': text})}\n\n"

        yield f"data: {json.dumps({'type': 'done'})}\n\n"

    except Exception as e:
        logger.error(f"Anthropic streaming error: {e}")
        yield f"data: {json.dumps({'type': 'error', 'message': str(e)})}\n\n"
