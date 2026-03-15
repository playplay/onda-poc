import logging
import re
import uuid
from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth import require_admin
from app.config import settings
from app.db import get_db
from app.models.post import GeminiAnalysis, Post
from app.models.scrape_job import ScrapeJob
from app.models.watched_account import WatchedAccount
from app.schemas.scrape import ScrapeRequest, ScrapeJobOut
from app.services.video_downloader import check_and_process_video_download

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
    _admin: dict = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    """Start a LinkedIn scrape — hybrid: Bright Data for companies, Apify for persons."""
    label = req.csm_email.split("@")[0] if req.csm_email else (req.sector or "All sectors")
    job = ScrapeJob(
        id=uuid.uuid4(),
        search_query=label,
        sector=req.sector,
        status="pending",
    )
    db.add(job)
    await db.commit()
    await db.refresh(job)

    # Split accounts by type, filtered by sector and/or CSM
    filters = []
    if req.sector:
        filters.append(WatchedAccount.sector == req.sector)
    if req.csm_email:
        filters.append(WatchedAccount.assigned_cs_email == req.csm_email)
    if filters:
        from sqlalchemy import and_
        result = await db.execute(select(WatchedAccount).where(and_(*filters)))
    else:
        result = await db.execute(select(WatchedAccount))
    accounts = result.scalars().all()

    company_accounts = [a for a in accounts if a.type == "company"]
    person_accounts = [a for a in accounts if a.type == "person"]

    if not company_accounts and not person_accounts:
        job.status = "failed"
        job.error_message = f"No watched accounts found for sector: {req.sector or 'any'}"
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
            fetch_limit = (30 if req.since_date else req.posts_per_account) * 3
            await bd_start(db, job, company_accounts, limit_per_input=fetch_limit)
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
            profile_max_posts = 30 if req.since_date else 10
            run_ids = await start_profile_scrape(db, job, person_accounts, max_posts=profile_max_posts)
            job.profile_apify_run_ids = run_ids
            backends.append("profile")
        except Exception as e:
            logger.warning(f"Failed to start profile scrape: {e}")
    elif person_accounts:
        logger.warning(
            f"Skipping {len(person_accounts)} person accounts for sector '{req.sector}': "
            "APIFY_TOKEN not configured"
        )

    # Instagram scrape: Bright Data Profiles Scraper
    instagram_accounts = [a for a in accounts if a.instagram_url]
    if instagram_accounts and settings.API_BRIGHT_DATA:
        from app.services.instagram_scraper import start_scrape as ig_start
        try:
            await ig_start(db, job, instagram_accounts)
            if job.instagram_snapshot_id:
                backends.append("instagram")
        except Exception as e:
            logger.warning(f"Failed to start Instagram scrape: {e}")

    # TikTok scrape: Bright Data
    tiktok_accounts = [a for a in accounts if a.tiktok_url]
    if tiktok_accounts and settings.API_BRIGHT_DATA:
        from app.services.tiktok_scraper import start_scrape as tt_start
        try:
            tt_fetch_limit = (30 if req.since_date else req.posts_per_account) * 3
            await tt_start(db, job, tiktok_accounts, limit_per_input=tt_fetch_limit)
            if job.tiktok_snapshot_id:
                backends.append("tiktok")
        except Exception as e:
            logger.warning(f"Failed to start TikTok scrape: {e}")

    # When since_date is set, override to exhaustive mode
    effective_posts_per_account = req.posts_per_account
    effective_by_date = req.by_date
    if req.since_date:
        effective_posts_per_account = 30
        effective_by_date = True

    # Store scrape params on job for use during fetch
    job.scrape_posts_per_account = effective_posts_per_account
    job.scrape_by_date = effective_by_date
    job.scrape_since_date = req.since_date

    # If BD failed but person scrape started, store BD error as warning
    if bd_error and backends:
        job.error_message = f"[Bright Data failed: {bd_error}]"

    # If no backends started at all, mark job as failed
    if not backends:
        job.status = "failed"
        job.error_message = bd_error or "No scraping backend could start"
        job.completed_at = datetime.utcnow()

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
    _admin: dict = Depends(require_admin),
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

        # Check Instagram status
        ig_status = "ready"
        if "instagram" in backends and job.instagram_snapshot_id:
            from app.services.instagram_scraper import check_scrape_ready as ig_check
            ig_status = await ig_check(job)

        # Check TikTok status
        tt_status = "ready"
        if "tiktok" in backends and job.tiktok_snapshot_id:
            from app.services.tiktok_scraper import check_scrape_ready as tt_check
            tt_status = await tt_check(job)

        # If any failed → mark job failed
        if bd_status == "failed" or profile_status == "failed" or ig_status == "failed" or tt_status == "failed":
            job.status = "failed"
            job.error_message = f"Backend failure: brightdata={bd_status}, profile={profile_status}, instagram={ig_status}, tiktok={tt_status}"
            job.completed_at = datetime.utcnow()
            await db.commit()
            return

        # If any still running → return early
        if bd_status == "running" or profile_status == "running" or ig_status == "running" or tt_status == "running":
            return

        # All ready — lock job row to prevent concurrent insertion
        locked_job = (await db.execute(
            select(ScrapeJob)
            .where(ScrapeJob.id == job.id)
            .with_for_update()
        )).scalar_one()
        if locked_job.status == "completed":
            return  # Another poll already completed this job

        existing_count = (await db.execute(
            select(func.count()).where(Post.scrape_job_id == job.id)
        )).scalar()
        if existing_count > 0:
            locked_job.status = "completed"
            locked_job.completed_at = datetime.utcnow()
            await db.commit()
            return
        job = locked_job

        # Fetch and combine results from all backends
        all_posts: list[Post] = []
        posts_to_keep = job.scrape_posts_per_account or 3
        by_date = bool(job.scrape_by_date)

        if "brightdata" in backends:
            from app.services.brightdata_scraper import fetch_and_process_results
            bd_posts = await fetch_and_process_results(db, job, posts_to_keep=posts_to_keep, by_date=by_date)
            all_posts.extend(bd_posts)

        if "profile" in backends and job.profile_apify_run_ids:
            from app.services.apify_profile_scraper import (
                fetch_and_process_profile_posts,
                fetch_follower_counts,
                _extract_slug,
            )
            # Build allowed slugs from person accounts
            if job.sector:
                result = await db.execute(
                    select(WatchedAccount).where(
                        WatchedAccount.sector == job.sector,
                        WatchedAccount.type == "person",
                    )
                )
            else:
                result = await db.execute(
                    select(WatchedAccount).where(WatchedAccount.type == "person")
                )
            person_accounts = result.scalars().all()
            allowed_slugs = set()
            for a in person_accounts:
                if a.linkedin_url:
                    match = re.search(r"/in/([^/]+)", a.linkedin_url)
                    if match:
                        allowed_slugs.add(match.group(1).lower())

            # Fetch follower counts for accounts missing them
            follower_map = await fetch_follower_counts(person_accounts)
            for a in person_accounts:
                slug = _extract_slug(a.linkedin_url)
                if slug in follower_map:
                    a.follower_count = follower_map[slug]

            # Build slug → followers for post injection
            slug_to_followers: dict[str, int] = {}
            for a in person_accounts:
                slug = _extract_slug(a.linkedin_url)
                if a.follower_count:
                    slug_to_followers[slug] = a.follower_count

            profile_posts = await fetch_and_process_profile_posts(
                db, job, job.profile_apify_run_ids, allowed_slugs, slug_to_followers
            )
            all_posts.extend(profile_posts)

        if "instagram" in backends and job.instagram_snapshot_id:
            from app.services.instagram_scraper import fetch_and_process_results as ig_fetch
            ig_posts = await ig_fetch(db, job, posts_to_keep=posts_to_keep, by_date=by_date)
            all_posts.extend(ig_posts)

        if "tiktok" in backends and job.tiktok_snapshot_id:
            from app.services.tiktok_scraper import fetch_and_process_results as tt_fetch
            tt_posts = await tt_fetch(db, job, posts_to_keep=posts_to_keep, by_date=by_date)
            all_posts.extend(tt_posts)

        # Update follower_count on watched accounts from the most recent post data
        await _update_account_followers(db, job.sector, all_posts)

        job.total_posts = len(all_posts)
        job.status = "completed"
        job.completed_at = datetime.utcnow()

        # Classify use cases with Claude (Haiku) before committing
        if all_posts:
            try:
                from app.services.use_case_classifier import classify_posts
                posts_for_classification = [
                    {
                        "id": str(p.id),
                        "title": p.title,
                        "author_name": p.author_name,
                        "author_company": p.author_company,
                        "format_family": p.format_family,
                        "sector": p.sector,
                    }
                    for p in all_posts
                ]
                use_case_map = await classify_posts(posts_for_classification)
                for p in all_posts:
                    uc = use_case_map.get(str(p.id))
                    if uc:
                        p.claude_use_case = uc
                logger.info(f"Use case classification done: {len(use_case_map)}/{len(all_posts)} posts classified")
            except Exception as uc_err:
                logger.warning(f"Use case classification failed (non-blocking): {uc_err}")

    except Exception as e:
        job.status = "failed"
        job.error_message = str(e)[:1000]
        job.completed_at = datetime.utcnow()

    await db.commit()


async def _update_account_followers(
    db: AsyncSession, sector: str | None, posts: list[Post]
) -> None:
    """Update follower_count on watched accounts from scraped post data."""
    if sector:
        result = await db.execute(
            select(WatchedAccount).where(WatchedAccount.sector == sector)
        )
    else:
        result = await db.execute(select(WatchedAccount))
    accounts = result.scalars().all()
    if not accounts:
        return

    # Build slug → account mapping
    slug_to_account: dict[str, WatchedAccount] = {}
    for a in accounts:
        if a.linkedin_url:
            match = re.search(r"/(in|company)/([^/]+)", a.linkedin_url)
            if match:
                slug_to_account[match.group(2).lower()] = a
        if a.instagram_url:
            ig_match = re.search(r"instagram\.com/([^/]+)", a.instagram_url)
            if ig_match:
                slug_to_account[ig_match.group(1).lower()] = a
        if a.tiktok_url:
            tt_match = re.search(r"tiktok\.com/@([^/?\s]+)", a.tiktok_url)
            if tt_match:
                slug_to_account[tt_match.group(1).lower()] = a

    # Update from post author_follower_count (take the max per account)
    for post in posts:
        if not post.author_follower_count or not post.author_name:
            continue
        slug = post.author_name.lower()
        account = slug_to_account.get(slug)
        if account:
            if not account.follower_count or post.author_follower_count > account.follower_count:
                account.follower_count = post.author_follower_count
