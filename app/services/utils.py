def truncate_title(text: str, max_len: int = 500) -> str:
    """Truncate text to max_len characters, adding ellipsis if truncated."""
    if len(text) > max_len:
        return text[: max_len - 3] + "..."
    return text
