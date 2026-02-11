"""
Format taxonomy classifier based on B2B content categories.

Tier 1 (metadata-based): Assigns format_family from post metadata.
Tier 2 (Gemini AI): Assigns format_variation — handled in gemini.py.

Families:
- short_video: Video under 90 seconds
- long_video: Video over 90 seconds
- static: Image, carousel, document, infographic
- text: Text-only post (no media)
"""

# Full format variation taxonomy for reference (used by Gemini analysis)
FORMAT_TAXONOMY = {
    "short_video": [
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
    ],
    "long_video": [
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
    "static": [
        "instruction_carousel",
        "storytelling_carousel",
        "list_carousel",
        "comparison_carousel",
        "infographic_data",
        "infographic_process",
        "infographic_concept",
        "verbatim",
        "key_figures",
        "corporate_meme",
        "screenshot_comment",
        "product_visual",
        "focus_team_talent",
        "ad",
        "checklist",
        "template_framework",
        "content_cover",
        "technical_diagram",
        "conceptual_illustration",
    ],
    "text": [],
}

# Flat lookup: variation -> family
VARIATION_TO_FAMILY = {}
for family, variations in FORMAT_TAXONOMY.items():
    for variation in variations:
        VARIATION_TO_FAMILY[variation] = family

SHORT_VIDEO_THRESHOLD_SECONDS = 90


def classify_format_family(
    content_type: str | None,
    duration_seconds: float | None = None,
    has_video: bool = False,
    has_image: bool = False,
    has_document: bool = False,
) -> str:
    """Classify a post into a format family based on metadata."""
    ct = (content_type or "").lower()

    # Video detection
    if has_video or "video" in ct:
        if duration_seconds is not None and duration_seconds > SHORT_VIDEO_THRESHOLD_SECONDS:
            return "long_video"
        return "short_video"

    # Static content detection
    if has_image or has_document or any(kw in ct for kw in ("image", "carousel", "document", "photo", "infographic", "slide")):
        return "static"

    # Text-only fallback
    return "text"
