"""Shared date parsing utilities for scrapers."""

from datetime import datetime


def parse_date(raw_date) -> datetime | None:
    """Parse an ISO date string into a naive UTC datetime, or None."""
    if not raw_date:
        return None
    try:
        dt = datetime.fromisoformat(str(raw_date).replace("Z", "+00:00"))
        return dt.replace(tzinfo=None)
    except (ValueError, TypeError):
        return None
