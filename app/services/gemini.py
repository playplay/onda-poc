"""
Gemini AI analysis service for video content.
Uses Gemini REST API directly via httpx (no SDK — keeps lambda under 250MB).

Flow:
1. Download video from LinkedIn CDN URL
2. Upload to Gemini File API via resumable upload
3. Wait for server-side processing
4. Analyze with structured JSON output
5. Fallback: thumbnail image + post text if video fails
"""

import json
import uuid
import logging

import httpx

from app.config import settings
from app.models.post import GeminiAnalysis

logger = logging.getLogger(__name__)

MODEL = "gemini-2.5-flash"
BASE_URL = "https://generativelanguage.googleapis.com"

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

RESPONSE_SCHEMA = {
    "type": "OBJECT",
    "properties": {
        "business_objective": {
            "type": "STRING",
            "enum": [
                "awareness", "engagement", "education", "conversion",
                "loyalty", "onboarding", "retention", "internal alignment",
                "internal training", "thought leadership",
                "brand employer visibility", "advocacy", "recruitment",
                "brand culture or initiatives", "other",
            ],
        },
        "use_case": {
            "type": "STRING",
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
            "type": "STRING",
            "enum": [
                "employees (internal video)", "customers", "prospects",
                "partners", "candidates", "investors", "media",
                "general public", "leadership/executives",
                "community (fans/followers)", "students", "other",
            ],
        },
        "tone_of_voice": {
            "type": "STRING",
            "enum": [
                "none", "friendly", "formal", "inspirational", "corporate",
                "fun", "educational", "dynamic", "empowering", "trustworthy",
                "humorous", "empathetic", "authoritative", "celebratory",
                "provocative", "neutral", "other",
            ],
        },
        "content_style": {
            "type": "STRING",
            "enum": [
                "none", "informative", "narrative/personal journey",
                "instructional", "entertaining", "persuasive", "reactive",
                "explainer", "highlight reel", "testimonial",
                "interview-based", "trend-based", "emotional", "other",
            ],
        },
        "storytelling_approach": {
            "type": "STRING",
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
            "type": "STRING",
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
            "type": "STRING",
            "description": "Ideal Customer Profile of the video creator.",
            "enum": [
                "community management", "corporate communication",
                "hr & employer brand", "internal communication",
                "marketing", "training", "sales", "media journalist",
                "other",
            ],
        },
        "script_hook": {
            "type": "STRING",
            "description": "The Hook if identified, otherwise 'NONE'.",
        },
        "script_outline": {"type": "STRING"},
        "script_cta": {
            "type": "STRING",
            "description": "The CTA if identified, otherwise 'NONE'.",
        },
        "voice_language": {
            "type": "STRING",
            "enum": ["none", "en-us", "fr-fr", "de-de", "others"],
        },
        "text_language": {
            "type": "STRING",
            "enum": ["en-us", "fr-fr", "de-de", "others", "none"],
        },
        "contains_an_interview_footage": {
            "type": "BOOLEAN",
            "description": "Whether the video includes interview footage.",
        },
        "video_dynamism": {
            "type": "STRING",
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


async def _upload_to_gemini(data: bytes, mime_type: str, api_key: str) -> dict | None:
    """Upload file to Gemini File API via resumable upload. Returns file metadata or None."""
    try:
        async with httpx.AsyncClient(timeout=300.0) as client:
            # Step 1: Initiate resumable upload
            init_resp = await client.post(
                f"{BASE_URL}/upload/v1beta/files?key={api_key}",
                headers={
                    "X-Goog-Upload-Protocol": "resumable",
                    "X-Goog-Upload-Command": "start",
                    "X-Goog-Upload-Header-Content-Length": str(len(data)),
                    "X-Goog-Upload-Header-Content-Type": mime_type,
                    "Content-Type": "application/json",
                },
                json={"file": {"display_name": f"upload-{uuid.uuid4().hex[:8]}"}},
            )
            init_resp.raise_for_status()
            upload_url = init_resp.headers.get("X-Goog-Upload-URL")
            if not upload_url:
                logger.warning("No upload URL in Gemini response")
                return None

            # Step 2: Upload the actual bytes
            upload_resp = await client.put(
                upload_url,
                headers={
                    "X-Goog-Upload-Command": "upload, finalize",
                    "X-Goog-Upload-Offset": "0",
                    "Content-Type": mime_type,
                },
                content=data,
            )
            upload_resp.raise_for_status()
            file_info = upload_resp.json().get("file", {})
            file_name = file_info.get("name")
            if not file_name:
                logger.warning("No file name in upload response")
                return None

            # Step 3: Poll until file is ACTIVE
            for _ in range(60):  # max ~2 min
                status_resp = await client.get(
                    f"{BASE_URL}/v1beta/{file_name}?key={api_key}"
                )
                status_resp.raise_for_status()
                file_data = status_resp.json()
                state = file_data.get("state", "")
                if state == "ACTIVE":
                    return file_data
                if state != "PROCESSING":
                    logger.warning(f"Gemini file state: {state}")
                    return None
                await _sleep(2)

            logger.warning("Gemini file processing timed out")
            return None

    except Exception as e:
        logger.warning(f"Gemini file upload failed: {e}")
        return None


async def _delete_gemini_file(file_name: str, api_key: str) -> None:
    """Delete uploaded file from Gemini storage."""
    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            await client.delete(f"{BASE_URL}/v1beta/{file_name}?key={api_key}")
    except Exception:
        pass


async def _sleep(seconds: float) -> None:
    """Async sleep helper."""
    import asyncio
    await asyncio.sleep(seconds)


async def call_gemini(
    video_url: str | None = None,
    thumbnail_url: str | None = None,
    post_text: str | None = None,
) -> dict | None:
    """
    Analyze a LinkedIn video post with Gemini REST API.

    Priority:
    1. Download + upload actual video -> full native video analysis
    2. Download + upload thumbnail image -> visual analysis from frame
    3. Post text only -> text-based analysis (last resort)
    """
    api_key = settings.GEMINI_API_KEY
    if not api_key:
        logger.error("GEMINI_API_KEY not set")
        return None

    # Build content parts
    parts: list[dict] = []
    uploaded_file_name: str | None = None

    # Try video first
    if video_url:
        media = await _download_media(video_url, timeout=120.0)
        if media:
            data, content_type = media
            if "video" in content_type or len(data) > 500_000:
                file_data = await _upload_to_gemini(data, content_type, api_key)
                if file_data:
                    uploaded_file_name = file_data["name"]
                    parts.append({
                        "fileData": {
                            "mimeType": file_data.get("mimeType", content_type),
                            "fileUri": file_data["uri"],
                        }
                    })
                    logger.info(f"Video uploaded to Gemini: {uploaded_file_name}")

    # Fallback to thumbnail
    if not parts and thumbnail_url:
        media = await _download_media(thumbnail_url, timeout=30.0)
        if media:
            data, content_type = media
            if "image" in content_type:
                file_data = await _upload_to_gemini(data, content_type, api_key)
                if file_data:
                    uploaded_file_name = file_data["name"]
                    parts.append({
                        "fileData": {
                            "mimeType": file_data.get("mimeType", content_type),
                            "fileUri": file_data["uri"],
                        }
                    })
                    logger.info("Thumbnail uploaded to Gemini as fallback")

    # Add text prompt
    prompt_lines = ["Analyze this LinkedIn video post:"]
    if post_text:
        prompt_lines.append(f"\nPost text/commentary:\n{post_text}")
    if not parts:
        prompt_lines.append("\n(No video or image available — analyze based on text only)")
    parts.append({"text": "\n".join(prompt_lines)})

    try:
        async with httpx.AsyncClient(timeout=120.0) as client:
            resp = await client.post(
                f"{BASE_URL}/v1beta/models/{MODEL}:generateContent?key={api_key}",
                json={
                    "systemInstruction": {
                        "parts": [{"text": SYSTEM_PROMPT}]
                    },
                    "contents": [{"parts": parts}],
                    "generationConfig": {
                        "responseMimeType": "application/json",
                        "responseSchema": RESPONSE_SCHEMA,
                    },
                },
            )
            resp.raise_for_status()
            result = resp.json()

        # Clean up uploaded file
        if uploaded_file_name:
            await _delete_gemini_file(uploaded_file_name, api_key)

        # Extract text from response
        candidates = result.get("candidates", [])
        if not candidates:
            logger.error(f"No candidates in Gemini response: {result}")
            return None

        text = candidates[0].get("content", {}).get("parts", [{}])[0].get("text", "")
        return json.loads(text)

    except Exception as e:
        logger.error(f"Gemini API call failed: {e}")
        if uploaded_file_name:
            await _delete_gemini_file(uploaded_file_name, api_key)
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
