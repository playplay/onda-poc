"""
Gemini AI analysis service for video content.
Uses Google Gemini API directly for native video analysis.

Flow:
1. Download video from LinkedIn CDN URL via httpx
2. Upload to Gemini File API (supports up to 2GB)
3. Wait for server-side processing
4. Analyze with structured JSON output
5. Fallback: thumbnail image + post text if video download fails
"""

import json
import uuid
import asyncio
import tempfile
import logging
from pathlib import Path

import httpx
import google.generativeai as genai
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.models.post import Post, GeminiAnalysis

logger = logging.getLogger(__name__)

MODEL = "gemini-2.5-flash"

SYSTEM_PROMPT = (
    "Role - Video production specialist\n"
    "You are an experienced video production specialist with a focus on "
    "creating high-quality content for corporate clients.\n"
    "Goal - Analyze video\n"
    "Your responsibility is to conduct a critical analysis of the provided "
    "video and deliver a comprehensive, well-structured review aimed at "
    "enhancing its impact and overall effectiveness.\n"
    "Output\n"
    "Follow the structured output. Follow the order of properties listed."
)

# Gemini-native response schema (same 15 fields as before)
RESPONSE_SCHEMA = {
    "type": "object",
    "properties": {
        "business_objective": {
            "type": "string",
            "enum": [
                "awareness", "engagement", "education", "conversion",
                "loyalty", "onboarding", "retention", "internal alignment",
                "internal training", "thought leadership",
                "brand employer visibility", "advocacy", "recruitment",
                "brand culture or initiatives", "other",
            ],
        },
        "use_case": {
            "type": "string",
            "enum": [
                "announce an event", "recap an event",
                "present a webinar/program", "share internal initiative",
                "promote open positions", "welcome new employee",
                "spotlight an employee/team", "present an offer/product",
                "showcase a customer success story",
                "present company strategy",
                "share results or statistics or performance",
                "share company values", "share tips and tricks",
                "promote a product", "share news", "explain a process",
                "train employees", "educate on a topic",
                "share a testimonial", "introduce a new tool or feature",
                "react to current events", "celebrate milestone",
                "tutorial", "express opinion (pov)", "promote a service",
                "other",
            ],
        },
        "audience_target": {
            "type": "string",
            "enum": [
                "employees (internal video)", "customers", "prospects",
                "partners", "candidates", "investors", "media",
                "general public", "leadership/executives",
                "community (fans/followers)", "students", "other",
            ],
        },
        "tone_of_voice": {
            "type": "string",
            "enum": [
                "none", "friendly", "formal", "inspirational", "corporate",
                "fun", "educational", "dynamic", "empowering", "trustworthy",
                "humorous", "empathetic", "authoritative", "celebratory",
                "provocative", "neutral", "other",
            ],
        },
        "content_style": {
            "type": "string",
            "enum": [
                "none", "informative", "narrative/personal journey",
                "instructional", "entertaining", "persuasive", "reactive",
                "explainer", "highlight reel", "testimonial",
                "interview-based", "trend-based", "emotional", "other",
            ],
        },
        "storytelling_approach": {
            "type": "string",
            "description": (
                "Each video is built around a central storytelling approach. "
                "Select the category based on the main driver of the narrative.\n"
                "- Text-based / Motion-based: narrative driven by on-screen text\n"
                "- Footage-based: footage guides the viewer through the narrative\n"
                "- VoiceOver-based: voice-over above visuals, speaker never seen\n"
                "- Music-based: rhythm and mood aligned with the music"
            ),
            "enum": [
                "text-based/motion based", "footage based",
                "voiceover-based", "music-based",
            ],
        },
        "creative_execution": {
            "type": "string",
            "description": (
                "report presentation / multi-single person snippets / "
                "q&a solo talking / short documentary / multi-interview snippets / "
                "highlight reel / music based teaser / long documentary / "
                "two person interview / animated explainer / expert walkthrough / "
                "snack solo talking / video commentary / embodied news / "
                "voice-over on media / tutorial, screencast / webinar recording / "
                "testimonial self-recorded / speaking with animated waveform / other"
            ),
            "enum": [
                "report presentation", "multi-single person snippets",
                "q&a solo talking", "short documentary",
                "multi-interview snippets", "highlight reel",
                "music based teaser", "long documentary",
                "two person interview", "animated explainer",
                "expert walkthrough", "snack solo talking",
                "video commentary", "embodied news", "voice-over on media",
                "tutorial, screencast", "webinar recording",
                "testimonial self-recorded", "speaking with animated waveform",
                "other",
            ],
        },
        "icp": {
            "type": "string",
            "description": "Ideal Customer Profile of the video creator.",
            "enum": [
                "community management", "corporate communication",
                "hr & employer brand", "internal communication",
                "marketing", "training", "sales", "media journalist",
                "other",
            ],
        },
        "script_hook": {
            "type": "string",
            "description": "The Hook if identified, otherwise 'NONE'.",
        },
        "script_outline": {"type": "string"},
        "script_cta": {
            "type": "string",
            "description": "The CTA if identified, otherwise 'NONE'.",
        },
        "voice_language": {
            "type": "string",
            "enum": ["none", "en-us", "fr-fr", "de-de", "others"],
        },
        "text_language": {
            "type": "string",
            "enum": ["en-us", "fr-fr", "de-de", "others", "none"],
        },
        "contains_an_interview_footage": {
            "type": "boolean",
            "description": "Whether the video includes interview footage.",
        },
        "video_dynamism": {
            "type": "string",
            "description": (
                "Slow: majority lacks dynamism. "
                "Medium: majority is dynamic. "
                "Fast: majority is VERY dynamic."
            ),
            "enum": ["slow", "medium", "fast"],
        },
    },
    "required": [
        "business_objective", "use_case", "audience_target",
        "tone_of_voice", "content_style", "storytelling_approach",
        "creative_execution", "icp", "script_hook", "script_outline",
        "script_cta", "voice_language", "text_language",
        "contains_an_interview_footage", "video_dynamism",
    ],
}


async def _download_media(url: str, timeout: float = 120.0) -> tuple[bytes, str] | None:
    """Download media from URL. Returns (bytes, content_type) or None."""
    try:
        async with httpx.AsyncClient(follow_redirects=True, timeout=timeout) as client:
            resp = await client.get(url)
            resp.raise_for_status()
            content_type = resp.headers.get("content-type", "application/octet-stream")
            return resp.content, content_type
    except Exception as e:
        logger.warning(f"Media download failed for {url}: {e}")
        return None


async def _upload_to_gemini(data: bytes, mime_type: str) -> genai.types.File | None:
    """Upload bytes to Gemini File API and wait for processing."""
    suffix = ".mp4"
    if "webm" in mime_type:
        suffix = ".webm"
    elif "image" in mime_type:
        suffix = ".jpg"

    tmp_path = None
    try:
        # Write to temp file (genai.upload_file needs a path)
        with tempfile.NamedTemporaryFile(suffix=suffix, delete=False) as tmp:
            tmp.write(data)
            tmp_path = tmp.name

        # Upload (sync call wrapped for async)
        uploaded = await asyncio.to_thread(
            genai.upload_file, path=tmp_path, mime_type=mime_type
        )

        # Wait for processing (videos need server-side processing)
        while uploaded.state.name == "PROCESSING":
            await asyncio.sleep(2)
            uploaded = await asyncio.to_thread(genai.get_file, name=uploaded.name)

        if uploaded.state.name == "ACTIVE":
            return uploaded

        logger.warning(f"Gemini file processing failed: state={uploaded.state.name}")
        return None

    except Exception as e:
        logger.warning(f"Gemini file upload failed: {e}")
        return None
    finally:
        if tmp_path:
            Path(tmp_path).unlink(missing_ok=True)


async def call_gemini(
    video_url: str | None = None,
    thumbnail_url: str | None = None,
    post_text: str | None = None,
) -> dict | None:
    """
    Analyze a LinkedIn video post with Gemini.

    Priority:
    1. Download + upload actual video → full native video analysis
    2. Download + upload thumbnail image → visual analysis from frame
    3. Post text only → text-based analysis (last resort)
    """
    api_key = settings.GEMINI_API_KEY
    if not api_key:
        logger.error("GEMINI_API_KEY not set")
        return None

    genai.configure(api_key=api_key)

    # Build content parts
    parts: list = []
    uploaded_file = None

    # Try video first
    if video_url:
        media = await _download_media(video_url, timeout=120.0)
        if media:
            data, content_type = media
            # Only upload if it looks like actual video
            if "video" in content_type or len(data) > 500_000:
                uploaded_file = await _upload_to_gemini(data, content_type)
                if uploaded_file:
                    parts.append(uploaded_file)
                    logger.info(f"Video uploaded to Gemini: {uploaded_file.name}")

    # Fallback to thumbnail
    if not parts and thumbnail_url:
        media = await _download_media(thumbnail_url, timeout=30.0)
        if media:
            data, content_type = media
            if "image" in content_type:
                uploaded_file = await _upload_to_gemini(data, content_type)
                if uploaded_file:
                    parts.append(uploaded_file)
                    logger.info("Thumbnail uploaded to Gemini as fallback")

    # Add text context
    prompt_lines = ["Analyze this LinkedIn video post:"]
    if post_text:
        prompt_lines.append(f"\nPost text/commentary:\n{post_text}")
    if not parts:
        prompt_lines.append("\n(No video or image available — analyze based on text only)")
    parts.append("\n".join(prompt_lines))

    try:
        model = genai.GenerativeModel(
            model_name=MODEL,
            system_instruction=SYSTEM_PROMPT,
            generation_config=genai.GenerationConfig(
                response_mime_type="application/json",
                response_schema=RESPONSE_SCHEMA,
            ),
        )

        response = await asyncio.to_thread(
            model.generate_content, parts
        )

        # Clean up uploaded file from Gemini storage
        if uploaded_file:
            try:
                await asyncio.to_thread(genai.delete_file, name=uploaded_file.name)
            except Exception:
                pass

        return json.loads(response.text)

    except Exception as e:
        logger.error(f"Gemini API call failed: {e}")
        return None


def build_analysis(post_id: uuid.UUID, parsed: dict) -> GeminiAnalysis:
    """Create a GeminiAnalysis ORM object from parsed Gemini response."""
    return GeminiAnalysis(
        id=uuid.uuid4(),
        post_id=post_id,
        business_objective=parsed.get("business_objective"),
        use_case=parsed.get("use_case"),
        audience_target=parsed.get("audience_target"),
        tone_of_voice=parsed.get("tone_of_voice"),
        content_style=parsed.get("content_style"),
        storytelling_approach=parsed.get("storytelling_approach"),
        creative_execution=parsed.get("creative_execution"),
        icp=parsed.get("icp"),
        script_hook=parsed.get("script_hook"),
        script_outline=parsed.get("script_outline"),
        script_cta=parsed.get("script_cta"),
        voice_language=parsed.get("voice_language"),
        text_language=parsed.get("text_language"),
        contains_an_interview_footage=parsed.get("contains_an_interview_footage"),
        video_dynamism=parsed.get("video_dynamism"),
        full_analysis=parsed,
    )
