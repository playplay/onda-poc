"""Favorites — personal per-user saved posts."""
from __future__ import annotations

import asyncio
import logging
import re
import uuid
from datetime import datetime

import httpx
from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth import get_current_user
from app.db import get_db
from app.models.favorite import Favorite
from app.models.post import Post
from app.models.scrape_job import ScrapeJob
from app.schemas.post import PostOut

logger = logging.getLogger(__name__)

router = APIRouter()


class FavoriteCreate(BaseModel):
    post_id: str


class FavoriteImport(BaseModel):
    url: str


@router.get("/favorites/ids", response_model=list[str])
async def get_favorite_ids(
    request: Request,
    db: AsyncSession = Depends(get_db),
):
    user = get_current_user(request)
    result = await db.execute(
        select(Favorite.post_id).where(Favorite.user_email == user["email"])
    )
    return [str(row) for row in result.scalars().all()]


@router.get("/favorites/posts", response_model=list[PostOut])
async def get_favorite_posts(
    request: Request,
    db: AsyncSession = Depends(get_db),
):
    user = get_current_user(request)
    result = await db.execute(
        select(Favorite.post_id).where(Favorite.user_email == user["email"])
    )
    post_ids = result.scalars().all()
    if not post_ids:
        return []
    posts_result = await db.execute(
        select(Post).where(Post.id.in_(post_ids))
    )
    return posts_result.scalars().all()


@router.post("/favorites", status_code=201)
async def add_favorite(
    body: FavoriteCreate,
    request: Request,
    db: AsyncSession = Depends(get_db),
):
    user = get_current_user(request)
    post_id = uuid.UUID(body.post_id)

    # Check post exists
    post = await db.get(Post, post_id)
    if not post:
        raise HTTPException(status_code=404, detail="Post not found")

    # Upsert — ignore if already exists
    existing = await db.execute(
        select(Favorite).where(
            Favorite.user_email == user["email"],
            Favorite.post_id == post_id,
        )
    )
    if existing.scalar_one_or_none() is None:
        fav = Favorite(
            id=uuid.uuid4(),
            user_email=user["email"],
            post_id=post_id,
            created_at=datetime.utcnow(),
        )
        db.add(fav)
        await db.commit()
    return {"ok": True}


def _extract_activity_id(url: str) -> str | None:
    """Extract LinkedIn activity ID from a post URL."""
    m = re.search(r"activity[:-](\d+)", url)
    return m.group(1) if m else None


@router.post("/favorites/import", response_model=PostOut)
async def import_favorite_by_url(
    body: FavoriteImport,
    request: Request,
    db: AsyncSession = Depends(get_db),
):
    """Scrape a LinkedIn post by URL, save it, and add to user's favorites."""
    user = get_current_user(request)

    url = body.url.strip()
    if "linkedin.com" not in url:
        raise HTTPException(status_code=422, detail="URL must be a LinkedIn post URL")
    if "/posts/" not in url and "activity-" not in url:
        raise HTTPException(status_code=422, detail="This looks like a profile or company page, not a specific post. Please paste the URL of an individual LinkedIn post.")

    # Dedup: check if post already exists by activity ID
    activity_id = _extract_activity_id(url)
    existing_post: Post | None = None
    if activity_id:
        result = await db.execute(
            select(Post).where(Post.post_url.contains(activity_id))
        )
        existing_post = result.scalar_one_or_none()

    if existing_post:
        # Just add favorite and return
        existing_fav = await db.execute(
            select(Favorite).where(
                Favorite.user_email == user["email"],
                Favorite.post_id == existing_post.id,
            )
        )
        if existing_fav.scalar_one_or_none() is None:
            db.add(Favorite(
                id=uuid.uuid4(),
                user_email=user["email"],
                post_id=existing_post.id,
                created_at=datetime.utcnow(),
            ))
            await db.commit()
        return existing_post

    # Create lightweight ScrapeJob (Post.scrape_job_id is non-nullable)
    job = ScrapeJob(
        id=uuid.uuid4(),
        search_query=f"Import: {url}",
        sector=None,
        status="running",
        is_custom_search=True,
        user_email=user["email"],
        custom_account_url=url,
        custom_account_name="Imported post",
    )
    db.add(job)
    await db.commit()
    await db.refresh(job)

    # Call Bright Data synchronous "Collect by URL" API
    from app.config import settings
    if not settings.API_BRIGHT_DATA:
        raise HTTPException(status_code=500, detail="Bright Data API not configured")

    bd_url = "https://api.brightdata.com/datasets/v3/scrape"
    params = {"dataset_id": "gd_lyy3tktm25m4avu764", "notify": "false"}
    headers = {"Authorization": f"Bearer {settings.API_BRIGHT_DATA}"}

    try:
        async with httpx.AsyncClient(timeout=90.0) as client:
            resp = await client.post(
                bd_url, params=params, headers=headers,
                json=[{"url": url}],
            )
        if resp.status_code >= 400:
            raise HTTPException(
                status_code=502,
                detail=f"Bright Data error {resp.status_code}: {resp.text[:200]}",
            )
        items = resp.json()
    except httpx.TimeoutException:
        raise HTTPException(status_code=504, detail="Bright Data request timed out")
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"Bright Data request failed: {e}")

    # Bright Data may return a single dict or a list
    if isinstance(items, dict):
        items = [items]
    if not items or not isinstance(items, list) or len(items) == 0:
        raise HTTPException(status_code=404, detail="No post data returned by Bright Data")

    item = items[0]
    if item.get("error"):
        raise HTTPException(status_code=404, detail=f"Bright Data error: {item['error']}")

    # Create Post using the shared mapper
    from app.services.brightdata_scraper import _item_to_post
    post = await _item_to_post(item, job)

    # AI enrichment: sector + use case in parallel
    try:
        from app.services.sector_classifier import classify_sector
        from app.services.use_case_classifier import _classify_chunk

        post_text = item.get("post_text") or ""
        post_dict = {
            "id": str(post.id),
            "title": post.title,
            "author_name": post.author_name,
            "author_company": post.author_company,
            "format_family": post.format_family,
            "sector": None,
        }

        sector_result, uc_result = await asyncio.gather(
            classify_sector(post_text, post.author_name, post.author_company),
            _classify_chunk([post_dict]),
            return_exceptions=True,
        )

        if isinstance(sector_result, str):
            post.sector = sector_result
        if isinstance(uc_result, dict):
            uc = uc_result.get(str(post.id))
            if uc:
                post.claude_use_case = uc
    except Exception as e:
        logger.warning(f"AI enrichment failed (non-fatal): {e}")

    # Save post + mark job completed
    db.add(post)
    job.status = "completed"
    job.total_posts = 1
    job.completed_at = datetime.utcnow()
    await db.commit()

    # Add favorite (post must exist in DB first for FK)
    db.add(Favorite(
        id=uuid.uuid4(),
        user_email=user["email"],
        post_id=post.id,
        created_at=datetime.utcnow(),
    ))
    await db.commit()
    await db.refresh(post)
    return post


@router.delete("/favorites/{post_id}", status_code=204)
async def remove_favorite(
    post_id: uuid.UUID,
    request: Request,
    db: AsyncSession = Depends(get_db),
):
    user = get_current_user(request)
    result = await db.execute(
        select(Favorite).where(
            Favorite.user_email == user["email"],
            Favorite.post_id == post_id,
        )
    )
    fav = result.scalar_one_or_none()
    if fav:
        await db.delete(fav)
        await db.commit()
