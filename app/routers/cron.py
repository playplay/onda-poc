"""
Cron job endpoints — called by Vercel Cron on a schedule.

Security: requests must include `Authorization: Bearer <CRON_SECRET>`.
The auth middleware in main.py exempts /api/cron/* from JWT checks.
"""

import logging
from datetime import date, timedelta

from fastapi import APIRouter, Depends, Header, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.db import get_db
from app.schemas.scrape import ScrapeRequest

logger = logging.getLogger(__name__)

router = APIRouter()


def _verify_cron_secret(authorization: str | None = Header(None)) -> None:
    if not settings.CRON_SECRET:
        raise HTTPException(status_code=503, detail="CRON_SECRET not configured")
    expected = f"Bearer {settings.CRON_SECRET}"
    if authorization != expected:
        raise HTTPException(status_code=401, detail="Unauthorized")


@router.get("/cron/weekly-scrape")
async def weekly_scrape(
    authorization: str | None = Header(None),
    db: AsyncSession = Depends(get_db),
):
    """Triggered by Vercel Cron every Monday at 06:00 UTC.

    Scrapes all accounts for posts published in the past 8 days (1 week + 1 day safety overlap).
    Uses since_date mode: exhaustive (30 posts/account, by date, deduplication active).
    """
    _verify_cron_secret(authorization)

    since = date.today() - timedelta(days=8)
    logger.info(f"Weekly cron scrape triggered: since_date={since}")

    # Reuse the scrape trigger logic via the ScrapeRequest schema
    req = ScrapeRequest(
        sector=None,  # all sectors
        posts_per_account=30,
        by_date=True,
        since_date=since,
    )

    # Import inline to avoid circular imports
    from app.routers.scrape import trigger_scrape

    # Build a fake admin user dict to satisfy require_admin dependency
    class _FakeAdmin:
        pass

    job = await trigger_scrape(req=req, _admin=_FakeAdmin(), db=db)
    logger.info(f"Weekly cron scrape job created: {job.id}, status={job.status}")
    return {"job_id": str(job.id), "since_date": since.isoformat(), "status": job.status}
