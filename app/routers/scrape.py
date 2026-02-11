import uuid

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession

from app.db import get_db
from app.models.scrape_job import ScrapeJob
from app.schemas.scrape import ScrapeRequest, ScrapeJobOut
from app.services.apify_scraper import start_scrape, check_and_process_scrape

router = APIRouter()


@router.post("/scrape", response_model=ScrapeJobOut)
async def trigger_scrape(
    req: ScrapeRequest,
    db: AsyncSession = Depends(get_db),
):
    """Start a LinkedIn scrape via Apify (non-blocking)."""
    job = ScrapeJob(
        id=uuid.uuid4(),
        search_query=req.search_query,
        sector=req.sector,
        content_type_filter=req.content_type_filter,
        is_corporate=req.is_corporate,
        max_results=req.max_results,
        status="pending",
    )
    db.add(job)
    await db.commit()
    await db.refresh(job)

    await start_scrape(db, job)
    await db.refresh(job)
    return job


@router.get("/scrape/{job_id}", response_model=ScrapeJobOut)
async def get_scrape_status(
    job_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
):
    """Get scrape job status. Lazily processes results when Apify run completes."""
    job = await db.get(ScrapeJob, job_id)
    if not job:
        raise HTTPException(status_code=404, detail="Scrape job not found")

    # If still running, check if Apify is done and process results
    if job.status == "running":
        await check_and_process_scrape(db, job)
        await db.refresh(job)

    return job
