"""
Gemini AI analysis service for video content.
Uses Vercel AI Gateway (OpenAI-compatible) with google/gemini-2.5-flash.
"""

import json
import uuid
from datetime import datetime

from openai import AsyncOpenAI
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.models.post import Post, GeminiAnalysis

# Vercel AI Gateway configuration
AI_GATEWAY_BASE_URL = "https://ai-gateway.vercel.sh/v1"
MODEL = "google/gemini-2.5-flash"

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

# OpenAI-compatible JSON schema for structured output (15 fields)
RESPONSE_SCHEMA = {
    "type": "json_schema",
    "json_schema": {
        "name": "video_analysis",
        "strict": True,
        "schema": {
            "type": "object",
            "properties": {
                "business_objective": {
                    "type": "string",
                    "enum": [
                        "awareness",
                        "engagement",
                        "education",
                        "conversion",
                        "loyalty",
                        "onboarding",
                        "retention",
                        "internal alignment",
                        "internal training",
                        "thought leadership",
                        "brand employer visibility",
                        "advocacy",
                        "recruitment",
                        "brand culture or initiatives",
                        "other",
                    ],
                },
                "use_case": {
                    "type": "string",
                    "enum": [
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
                    ],
                },
                "audience_target": {
                    "type": "string",
                    "enum": [
                        "employees (internal video)",
                        "customers",
                        "prospects",
                        "partners",
                        "candidates",
                        "investors",
                        "media",
                        "general public",
                        "leadership/executives",
                        "community (fans/followers)",
                        "students",
                        "other",
                    ],
                },
                "tone_of_voice": {
                    "type": "string",
                    "enum": [
                        "none",
                        "friendly",
                        "formal",
                        "inspirational",
                        "corporate",
                        "fun",
                        "educational",
                        "dynamic",
                        "empowering",
                        "trustworthy",
                        "humorous",
                        "empathetic",
                        "authoritative",
                        "celebratory",
                        "provocative",
                        "neutral",
                        "other",
                    ],
                },
                "content_style": {
                    "type": "string",
                    "enum": [
                        "none",
                        "informative",
                        "narrative/personal journey",
                        "instructional",
                        "entertaining",
                        "persuasive",
                        "reactive",
                        "explainer",
                        "highlight reel",
                        "testimonial",
                        "interview-based",
                        "trend-based",
                        "emotional",
                        "other",
                    ],
                },
                "storytelling_approach": {
                    "type": "string",
                    "description": (
                        "Each video is built around a central storytelling approach or "
                        '"backbone", which determines how its message is conveyed. '
                        "Select the appropriate category based on the main driver of "
                        "the narrative, not on secondary or supporting elements.\n\n"
                        "- Text-based / Motion-based: The narrative is primarily driven "
                        "by on-screen text (excluding subtitles).\n"
                        "- Footage-based: The footages in the video guides the viewer "
                        "through the narrative.\n"
                        "- VoiceOver-based: A voice-over is talking above visuals. We "
                        "never see the voice as a person in the video.\n"
                        "- Music-based: The rhythm, mood, and progression of the video "
                        "are aligned with the music."
                    ),
                    "enum": [
                        "text-based/motion based",
                        "footage based",
                        "voiceover-based",
                        "music-based",
                    ],
                },
                "creative_execution": {
                    "type": "string",
                    "description": (
                        "Report presentation: Majority of video frames are textual "
                        "information being displayed or key numbers/charts, but "
                        "majority of audio DOES NOT have voice-over / "
                        "Multi-single person snippets: Majority of video frames are "
                        "multiple snippet footages of employees. Majority of audio is "
                        "music. / Q&A solo talking: Majority of video is a person "
                        "answering to a question or questions displayed in video. / "
                        "Short documentary: Majority of video frames is about "
                        "following a person or team in action, a bit like a "
                        "documentary. Total video duration is below 3 minutes. / "
                        "Multi-interview snippets: Majority of video frames are "
                        "multiple interview clips with fast cuts. / "
                        "Highlight reel: Majority of video frames are multiple <2 "
                        "seconds clips, fast montage of best event moments. / "
                        "Music based teaser: Majority of video frames are text or "
                        "media on screen, being synced to the music peaks. / "
                        "Long documentary: Majority of video frames is about "
                        "following a person or team in action. Total video duration "
                        "is over 3 minutes. / Two person interview: Majority of "
                        "video is a 2 persons discussing. / "
                        "Animated explainer: Majority of video frames are motion "
                        "graphics, overlays and majority of audio is a voice-over. / "
                        "Expert walkthrough: Majority of video frames are a "
                        "step-by-step walkthrough with facecam or voice-over and "
                        "screen recording. / Snack solo talking: Majority of video "
                        "is a person facecam insight with zoom cuts and "
                        "subtitle-driven style, short duration. / "
                        "Video commentary: Majority of video frames are an avatar or "
                        "person as overlay over full screen media. / "
                        "Embodied news: Majority of video frames are a facecam "
                        "person talking about news, with media split screen. / "
                        "Voice-over on media: Majority of video frames are media "
                        "being shown, with a voice-over but no on-cam speaker. / "
                        "Tutorial, screencast: Majority of video frames are "
                        "screen-recorded instructional content. / "
                        "Webinar recording: Majority of video frames are a recorded "
                        "session of a webinar or workshop. / "
                        "Testimonial self-recorded: Majority of video frames are "
                        "user-generated testimonials. / "
                        "Speaking with animated waveform: Majority of audio is a "
                        "person speaking but majority of visual frames is an "
                        "animated waveform. / Other: Any format not listed."
                    ),
                    "enum": [
                        "report presentation",
                        "multi-single person snippets",
                        "q&a solo talking",
                        "short documentary",
                        "multi-interview snippets",
                        "highlight reel",
                        "music based teaser",
                        "long documentary",
                        "two person interview",
                        "animated explainer",
                        "expert walkthrough",
                        "snack solo talking",
                        "video commentary",
                        "embodied news",
                        "voice-over on media",
                        "tutorial, screencast",
                        "webinar recording",
                        "testimonial self-recorded",
                        "speaking with animated waveform",
                        "other",
                    ],
                },
                "icp": {
                    "type": "string",
                    "description": "Represents the Ideal Customer Profile (ICP) of the video creator.",
                    "enum": [
                        "community management",
                        "corporate communication",
                        "hr & employer brand",
                        "internal communication",
                        "marketing",
                        "training",
                        "sales",
                        "media journalist",
                        "other",
                    ],
                },
                "script_hook": {
                    "type": "string",
                    "description": (
                        "If there is a Hook identified in the video, this value "
                        "should be the extracted Hook. If there is no Hook, the "
                        "value should be 'NONE'."
                    ),
                },
                "script_outline": {
                    "type": "string",
                },
                "script_cta": {
                    "type": "string",
                    "description": (
                        "If there is a CTA (Call To Action) identified in the video, "
                        "this value should be the extracted CTA. If there is no CTA, "
                        "the value should be 'NONE'."
                    ),
                },
                "voice_language": {
                    "type": "string",
                    "enum": [
                        "none",
                        "en-us",
                        "fr-fr",
                        "de-de",
                        "others",
                    ],
                },
                "text_language": {
                    "type": "string",
                    "enum": [
                        "en-us",
                        "fr-fr",
                        "de-de",
                        "others",
                        "none",
                    ],
                },
                "contains_an_interview_footage": {
                    "type": "boolean",
                    "description": (
                        "Indicates whether the video includes video footage of an "
                        "interview (someone speaking to camera)."
                    ),
                },
                "video_dynamism": {
                    "type": "string",
                    "description": (
                        "Assess the video's tempo by examining its audio, script, "
                        "and visuals. Categorize the dynamism as follows:\n"
                        "- Slow: The majority of periods in the video lack dynamism.\n"
                        "- Medium: The majority of periods in the video are dynamic.\n"
                        "- Fast: The majority of periods in the video are VERY dynamic."
                    ),
                    "enum": [
                        "slow",
                        "medium",
                        "fast",
                    ],
                },
            },
            "required": [
                "business_objective",
                "use_case",
                "audience_target",
                "tone_of_voice",
                "content_style",
                "storytelling_approach",
                "creative_execution",
                "icp",
                "script_hook",
                "script_outline",
                "script_cta",
                "voice_language",
                "text_language",
                "contains_an_interview_footage",
                "video_dynamism",
            ],
            "additionalProperties": False,
        },
    },
}


async def call_gemini(video_url: str) -> dict | None:
    """Call Gemini API for a video URL. Returns parsed JSON or None on failure."""
    api_key = settings.VERCEL_OIDC_TOKEN or settings.AI_GATEWAY_API_KEY
    if not api_key:
        return None

    try:
        client = AsyncOpenAI(
            api_key=api_key,
            base_url=AI_GATEWAY_BASE_URL,
        )

        response = await client.chat.completions.create(
            model=MODEL,
            messages=[
                {"role": "system", "content": SYSTEM_PROMPT},
                {"role": "user", "content": f"Analyze this video:\n{video_url}"},
            ],
            response_format=RESPONSE_SCHEMA,
        )

        response_text = response.choices[0].message.content
        return json.loads(response_text)

    except Exception as e:
        print(f"Gemini API call failed for {video_url}: {e}")
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
