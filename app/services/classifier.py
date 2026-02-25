from __future__ import annotations

"""
Format taxonomy classifier based on B2B content categories.

Tier 1 (metadata-based): Assigns format_family from post metadata.
Tier 2 (Gemini AI): Assigns format_variation — handled in gemini.py.

Families:
- video: All video content
- carousel: Document / multi-page post
- image: Single static image
- images: Multiple static images (2+)
- gif: Animated GIF image
- text: Text-only post (no media)
"""

import httpx
import logging

logger = logging.getLogger(__name__)

# Full format variation taxonomy for reference (used by Gemini analysis)
FORMAT_TAXONOMY = {
    "video": [
        "talking_head",
        "vox_pop",
        "interview",
        "duo",
        "screen_recording_speaker",
        "screen_recording",
        "explainer_motion_design",
        "edit_and_text",
        "behind_the_scenes",
        "day_in_life",
        "before_after",
        "testimonial",
        "ugc",
        "reaction",
        "unboxing",
        "trend_format",
        "timelapse",
        "stop_motion",
        "webinar",
        "webinar_extract",
        "long_interview",
        "panel_discussion",
        "tutorial",
        "case_study",
        "documentary",
        "product_presentation",
        "keynote",
        "formation",
        "episodic_series",
        "live_replay",
        "compilation",
    ],
    "carousel": [
        "instruction_carousel",
        "storytelling_carousel",
        "list_carousel",
        "comparison_carousel",
        "infographic_data",
        "infographic_process",
        "infographic_concept",
        "checklist",
        "template_framework",
        "technical_diagram",
    ],
    "image": [
        "verbatim",
        "key_figures",
        "corporate_meme",
        "screenshot_comment",
        "product_visual",
        "focus_team_talent",
        "ad",
        "content_cover",
        "conceptual_illustration",
    ],
    "images": [
        "verbatim",
        "key_figures",
        "corporate_meme",
        "screenshot_comment",
        "product_visual",
        "focus_team_talent",
        "ad",
        "content_cover",
        "conceptual_illustration",
    ],
    "gif": [
        "verbatim",
        "key_figures",
        "corporate_meme",
        "screenshot_comment",
        "product_visual",
        "focus_team_talent",
        "ad",
        "content_cover",
        "conceptual_illustration",
    ],
    "text": [],
}

# Flat lookup: variation -> family
VARIATION_TO_FAMILY = {}
for family, variations in FORMAT_TAXONOMY.items():
    for variation in variations:
        VARIATION_TO_FAMILY[variation] = family

async def detect_image_gif(url: str) -> bool:
    """Check if an image URL points to a GIF via HEAD request on Content-Type."""
    try:
        async with httpx.AsyncClient(timeout=5) as client:
            resp = await client.head(url, follow_redirects=True)
            ct = resp.headers.get("content-type", "")
            return "image/gif" in ct.lower()
    except Exception:
        return False


def classify_format_family(
    content_type: str | None,
    duration_seconds: float | None = None,
    has_video: bool = False,
    has_image: bool = False,
    has_document: bool = False,
    image_count: int = 0,
    is_gif: bool = False,
) -> str:
    """Classify a post into a format family based on metadata."""
    ct = (content_type or "").lower()

    # Video detection
    if has_video or "video" in ct:
        return "video"

    # Document/carousel detection (takes priority over image)
    if has_document or any(kw in ct for kw in ("carousel", "document", "slide")):
        return "carousel"

    # Image detection — distinguish gif / images / image
    if has_image or any(kw in ct for kw in ("image", "photo", "infographic")):
        if is_gif:
            return "gif"
        if image_count >= 2:
            return "images"
        return "image"

    # Text-only fallback
    return "text"
