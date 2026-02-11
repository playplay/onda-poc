import asyncio
import uuid

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession

from app.db import get_db, async_session
from app.models.scrape_job import ScrapeJob
from app.schemas.scrape import ScrapeRequest, ScrapeJobOut
from app.services.apify_scraper import run_scrape

router = APIRouter()


async def _run_scrape_background(job_id: uuid.UUID) -> None:
    """Background task wrapper — creates its own DB session."""
    async with async_session() as db:
        job = await db.get(ScrapeJob, job_id)
        if job:
            await run_scrape(db, job)


@router.post("/scrape", response_model=ScrapeJobOut)
async def trigger_scrape(
    req: ScrapeRequest,
    background_tasks: BackgroundTasks,
    db: AsyncSession = Depends(get_db),
):
    """Trigger a new LinkedIn scrape via Apify."""
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

    background_tasks.add_task(_run_scrape_background, job.id)
    return job


@router.get("/scrape/{job_id}", response_model=ScrapeJobOut)
async def get_scrape_status(
    job_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
):
    """Get scrape job status."""
    job = await db.get(ScrapeJob, job_id)
    if not job:
        raise HTTPException(status_code=404, detail="Scrape job not found")
    return job
