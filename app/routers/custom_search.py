"""Custom Search — ad-hoc scrape for a single account (any user)."""
from __future__ import annotations

import re
import uuid
from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth import get_current_user
from app.db import get_db
from app.models.post import Post
from app.models.scrape_job import ScrapeJob
from app.models.watched_account import WatchedAccount
from app.schemas.scrape import ScrapeJobOut
from app.schemas.post import PostOut

router = APIRouter()


class CustomSearchRequest(BaseModel):
    account_id: str | None = None          # UUID of existing watched account
    account_url: str | None = None         # LinkedIn URL for a new/unsaved account
    account_name: str | None = None        # Display name (when using account_url)
    posts_limit: int = 20                  # Number of posts to keep
    account_type: str = "company"          # "company" | "person"
    date_since_months: int | None = None   # 1, 3, 6, 12, None=all


class CustomSearchResult(BaseModel):
    job: ScrapeJobOut
    posts: list[PostOut] = []


@router.post("/custom-search", response_model=ScrapeJobOut)
async def create_custom_search(
    req: CustomSearchRequest,
    request: Request,
    db: AsyncSession = Depends(get_db),
):
    """Start a custom search scrape for one account."""
    user = get_current_user(request)

    # Resolve the target URL
    target_url: str | None = None
    account_name: str | None = req.account_name

    if req.account_id:
        account = await db.get(WatchedAccount, uuid.UUID(req.account_id))
        if not account:
            raise HTTPException(status_code=404, detail="Account not found")
        target_url = account.linkedin_url
        account_name = account.name
    elif req.account_url:
        target_url = req.account_url
    else:
        raise HTTPException(status_code=422, detail="Either account_id or account_url is required")

    if not target_url:
        raise HTTPException(status_code=422, detail="Account has no LinkedIn URL")

    # Create job
    job = ScrapeJob(
        id=uuid.uuid4(),
        search_query=f"Custom: {account_name or target_url}",
        sector=None,
        status="pending",
        is_custom_search=True,
        user_email=user["email"],
        custom_account_url=target_url,
        custom_account_name=account_name,
        scrape_posts_per_account=req.posts_limit,
        scrape_by_date=True,
        custom_account_type=req.account_type,
        scrape_date_since_months=req.date_since_months,
    )
    db.add(job)
    await db.commit()
    await db.refresh(job)

    # Build a minimal fake WatchedAccount to pass to the scraper
    _account_type = req.account_type or "company"
    class _FakeAccount:
        linkedin_url = target_url
        type = _account_type

    fake_account = _FakeAccount()

    # Trigger Bright Data scrape
    from app.config import settings
    if not settings.API_BRIGHT_DATA:
        job.status = "failed"
        job.error_message = "Bright Data API not configured"
        job.completed_at = datetime.utcnow()
        await db.commit()
        await db.refresh(job)
        return job

    try:
        from app.services.brightdata_scraper import start_scrape as bd_start
        await bd_start(db, job, [fake_account], limit_per_input=req.posts_limit * 2)  # type: ignore[arg-type]
        if job.status == "running":
            import json
            job.scraper_backend = "brightdata"
    except Exception as e:
        job.status = "failed"
        job.error_message = str(e)[:500]
        job.completed_at = datetime.utcnow()

    # Extract slug from URL for allowed_slugs (stored on job)
    m = re.search(r"/(company|in)/([^/]+)", target_url)
    if m:
        job.custom_account_url = target_url  # already set, confirm slug

    await db.commit()
    await db.refresh(job)
    return job


@router.get("/custom-search", response_model=list[ScrapeJobOut])
async def list_custom_searches(
    request: Request,
    db: AsyncSession = Depends(get_db),
):
    """List custom searches for the current user."""
    user = get_current_user(request)
    result = await db.execute(
        select(ScrapeJob)
        .where(ScrapeJob.is_custom_search == True)  # noqa: E712
        .where(ScrapeJob.user_email == user["email"])
        .order_by(ScrapeJob.created_at.desc())
        .limit(20)
    )
    return result.scalars().all()


@router.get("/custom-search/{job_id}", response_model=CustomSearchResult)
async def get_custom_search(
    job_id: uuid.UUID,
    request: Request,
    db: AsyncSession = Depends(get_db),
):
    """Get status and posts for a custom search job."""
    user = get_current_user(request)
    job = await db.get(ScrapeJob, job_id)
    if not job:
        raise HTTPException(status_code=404, detail="Custom search not found")
    if not job.is_custom_search or job.user_email != user["email"]:
        raise HTTPException(status_code=403, detail="Access denied")

    # Trigger result processing if still running
    if job.status == "running":
        await _process_custom_search(db, job)
        await db.refresh(job)

    # Fetch posts if completed
    posts: list[Post] = []
    if job.status == "completed":
        result = await db.execute(
            select(Post).where(Post.scrape_job_id == job_id)
        )
        posts = result.scalars().all()

    return CustomSearchResult(
        job=ScrapeJobOut.model_validate(job),
        posts=[PostOut.model_validate(p) for p in posts],
    )


async def _process_custom_search(db: AsyncSession, job: ScrapeJob) -> None:
    """Check Bright Data status and fetch results when ready."""
    from app.services.brightdata_scraper import check_scrape_ready, fetch_and_process_results

    try:
        status = await check_scrape_ready(job)
    except Exception as e:
        job.status = "failed"
        job.error_message = str(e)[:500]
        job.completed_at = datetime.utcnow()
        await db.commit()
        return

    if status == "failed":
        job.status = "failed"
        job.error_message = "Bright Data snapshot failed"
        job.completed_at = datetime.utcnow()
        await db.commit()
        return

    if status == "running":
        return  # Still in progress

    # Ready — extract allowed slug from custom_account_url
    allowed_slugs: set[str] = set()
    if job.custom_account_url:
        m = re.search(r"/(company|in)/([^/]+)", job.custom_account_url)
        if m:
            allowed_slugs.add(m.group(2).lower())

    posts_to_keep = job.scrape_posts_per_account or 20

    posts = await fetch_and_process_results(
        db,
        job,
        posts_to_keep=posts_to_keep,
        by_date=True,
        allowed_slugs_override=allowed_slugs if allowed_slugs else None,
    )

    # Normalize author_company: use best display name for each author slug
    if posts:
        best_names: dict[str, str] = {}
        for p in posts:
            slug = p.author_name or ""
            name = p.author_company or ""
            # Prefer the non-slug name (longer, has spaces/uppercase)
            if slug and name != slug and (slug not in best_names or len(name) > len(best_names[slug])):
                best_names[slug] = name
        for p in posts:
            slug = p.author_name or ""
            if slug in best_names:
                p.author_company = best_names[slug]

    # AI enrichment: use case + sector classification
    if posts:
        try:
            from app.services.use_case_classifier import _classify_chunk
            from app.services.sector_classifier import classify_sector
            import asyncio

            post_dicts = [
                {
                    "id": str(p.id),
                    "title": p.title,
                    "author_name": p.author_name,
                    "author_company": p.author_company,
                    "format_family": p.format_family,
                    "sector": p.sector,
                }
                for p in posts
            ]
            uc_result = await _classify_chunk(post_dicts)
            if isinstance(uc_result, dict):
                for p in posts:
                    uc = uc_result.get(str(p.id))
                    if uc:
                        p.claude_use_case = uc

            # Sector: classify from first post if job has no sector
            if not job.sector and posts[0].title:
                sector = await classify_sector(
                    posts[0].title or "",
                    posts[0].author_name,
                    posts[0].author_company,
                )
                if sector:
                    for p in posts:
                        if not p.sector:
                            p.sector = sector
        except Exception as e:
            import logging
            logging.getLogger(__name__).warning(f"Custom search AI enrichment failed: {e}")

    job.total_posts = len(posts)
    job.status = "completed"
    job.completed_at = datetime.utcnow()
    await db.commit()
