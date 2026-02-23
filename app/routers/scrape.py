import logging
import re
import uuid
from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.db import get_db
from app.models.post import GeminiAnalysis, Post
from app.models.scrape_job import ScrapeJob
from app.models.watched_account import WatchedAccount
from app.schemas.scrape import ScrapeRequest, ScrapeJobOut
from app.services.video_downloader import check_and_process_video_download, start_video_download

logger = logging.getLogger(__name__)

router = APIRouter()


@router.get("/scrape", response_model=list[ScrapeJobOut])
async def list_scrape_jobs(
    limit: int = Query(20, ge=1, le=100),
    db: AsyncSession = Depends(get_db),
):
    """List recent scrape jobs, newest first."""
    result = await db.execute(
        select(ScrapeJob).order_by(ScrapeJob.created_at.desc()).limit(limit)
    )
    return result.scalars().all()


@router.post("/scrape", response_model=ScrapeJobOut)
async def trigger_scrape(
    req: ScrapeRequest,
    db: AsyncSession = Depends(get_db),
):
    """Start a LinkedIn scrape — hybrid: Bright Data for companies, Apify for persons."""
    job = ScrapeJob(
        id=uuid.uuid4(),
        search_query=req.sector,
        sector=req.sector,
        status="pending",
    )
    db.add(job)
    await db.commit()
    await db.refresh(job)

    # Split accounts by type
    result = await db.execute(
        select(WatchedAccount).where(WatchedAccount.sector == req.sector)
    )
    accounts = result.scalars().all()

    company_accounts = [a for a in accounts if a.type == "company"]
    person_accounts = [a for a in accounts if a.type == "person"]

    if not company_accounts and not person_accounts:
        job.status = "failed"
        job.error_message = f"No watched accounts found for sector: {req.sector}"
        job.completed_at = datetime.utcnow()
        await db.commit()
        await db.refresh(job)
        return job

    backends: list[str] = []
    bd_error: str | None = None
    job.status = "running"

    # Company scrape: Bright Data (primary) or Apify fallback
    if company_accounts:
        if settings.API_BRIGHT_DATA:
            from app.services.brightdata_scraper import start_scrape as bd_start
            await bd_start(db, job, company_accounts)
            if job.status == "running":
                backends.append("brightdata")
            else:
                # BD failed — save error and reset state for person scrape
                bd_error = job.error_message
                logger.warning(f"Bright Data trigger failed for '{req.sector}': {bd_error}")
                job.status = "running"
                job.error_message = None
                job.completed_at = None
        else:
            from app.services.apify_scraper import start_scrape as apify_start
            await apify_start(db, job)
            if job.status == "running":
                backends.append("apify")

    # Person scrape: Apify profile actor
    if person_accounts and settings.APIFY_TOKEN:
        from app.services.apify_profile_scraper import start_profile_scrape
        try:
            run_ids = await start_profile_scrape(db, job, person_accounts)
            job.profile_apify_run_ids = run_ids
            backends.append("profile")
        except Exception as e:
            logger.warning(f"Failed to start profile scrape: {e}")
    elif person_accounts:
        logger.warning(
            f"Skipping {len(person_accounts)} person accounts for sector '{req.sector}': "
            "APIFY_TOKEN not configured"
        )

    # If BD failed but person scrape started, store BD error as warning
    if bd_error and backends:
        job.error_message = f"[Bright Data failed: {bd_error}]"

    job.scraper_backend = "+".join(backends) if backends else None
    await db.commit()
    await db.refresh(job)
    return job


@router.get("/scrape/{job_id}", response_model=ScrapeJobOut)
async def get_scrape_status(
    job_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
):
    """Get scrape job status. Lazily processes results when scraping backends complete."""
    job = await db.get(ScrapeJob, job_id)
    if not job:
        raise HTTPException(status_code=404, detail="Scrape job not found")

    if job.status == "running":
        await _orchestrate_check(db, job)
        await db.refresh(job)

    if job.status == "downloading_videos":
        await check_and_process_video_download(db, job)
        await db.refresh(job)

    return job


@router.delete("/scrape/{job_id}", status_code=204)
async def delete_scrape_job(
    job_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
):
    """Delete a scrape job and all associated posts + analyses."""
    job = await db.get(ScrapeJob, job_id)
    if not job:
        raise HTTPException(status_code=404, detail="Scrape job not found")

    # Delete analyses for all posts in this job
    from sqlalchemy import delete as sa_delete
    post_ids_q = select(Post.id).where(Post.scrape_job_id == job_id)
    await db.execute(
        sa_delete(GeminiAnalysis).where(GeminiAnalysis.post_id.in_(post_ids_q))
    )
    await db.execute(
        sa_delete(Post).where(Post.scrape_job_id == job_id)
    )
    await db.delete(job)
    await db.commit()


async def _orchestrate_check(db: AsyncSession, job: ScrapeJob) -> None:
    """Check all active backends; when all ready, fetch and combine results."""
    backends = set((job.scraper_backend or "").split("+"))
    backends.discard("")

    # If no backends identified, fall back to legacy check
    if not backends or backends == {"apify"}:
        from app.services.apify_scraper import check_and_process_scrape
        await check_and_process_scrape(db, job)
        return

    try:
        # Check Bright Data status
        bd_status = "ready"
        if "brightdata" in backends:
            from app.services.brightdata_scraper import check_scrape_ready
            bd_status = await check_scrape_ready(job)

        # Check profile Apify status
        profile_status = "ready"
        if "profile" in backends and job.profile_apify_run_ids:
            from app.services.apify_profile_scraper import check_profile_scrape
            profile_status = await check_profile_scrape(job.profile_apify_run_ids)

        # If any failed → mark job failed
        if bd_status == "failed" or profile_status == "failed":
            job.status = "failed"
            job.error_message = f"Backend failure: brightdata={bd_status}, profile={profile_status}"
            job.completed_at = datetime.utcnow()
            await db.commit()
            return

        # If any still running → return early
        if bd_status == "running" or profile_status == "running":
            return

        # All ready — guard against double insertion
        existing_count = (await db.execute(
            select(func.count()).where(Post.scrape_job_id == job.id)
        )).scalar()
        if existing_count > 0:
            job.status = "completed"
            job.completed_at = datetime.utcnow()
            await db.commit()
            return

        # Fetch and combine results from all backends
        all_posts: list[Post] = []

        if "brightdata" in backends:
            from app.services.brightdata_scraper import fetch_and_process_results
            bd_posts = await fetch_and_process_results(db, job)
            all_posts.extend(bd_posts)

        if "profile" in backends and job.profile_apify_run_ids:
            from app.services.apify_profile_scraper import fetch_and_process_profile_posts
            # Build allowed slugs from person accounts
            result = await db.execute(
                select(WatchedAccount).where(
                    WatchedAccount.sector == job.sector,
                    WatchedAccount.type == "person",
                )
            )
            person_accounts = result.scalars().all()
            allowed_slugs = set()
            for a in person_accounts:
                match = re.search(r"/in/([^/]+)", a.linkedin_url)
                if match:
                    allowed_slugs.add(match.group(1).lower())

            profile_posts = await fetch_and_process_profile_posts(
                db, job, job.profile_apify_run_ids, allowed_slugs
            )
            all_posts.extend(profile_posts)

        job.total_posts = len(all_posts)

        # Auto-trigger video download for video posts
        video_post_urls = [
            p.post_url for p in all_posts
            if p.content_type == "video" and p.post_url
        ]
        if video_post_urls:
            await db.commit()
            await start_video_download(db, job, video_post_urls)
            return
        else:
            job.status = "completed"
            job.completed_at = datetime.utcnow()

    except Exception as e:
        job.status = "failed"
        job.error_message = str(e)[:1000]
        job.completed_at = datetime.utcnow()

    await db.commit()
