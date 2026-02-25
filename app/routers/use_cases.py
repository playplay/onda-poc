from __future__ import annotations

import uuid

from fastapi import APIRouter, Depends, Query
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.db import get_db
from app.models.post import Post
from app.services.use_case_classifier import classify_posts

router = APIRouter()

FORMAT_ORDER = ["video", "carousel", "image", "images", "gif", "text"]


class ClassifyRequest(BaseModel):
    scrape_job_id: uuid.UUID
    force: bool = False


class ClassifyResponse(BaseModel):
    classified: int
    total: int
    already_classified: int


class UseCasePivotRow(BaseModel):
    use_case: str
    counts_by_format: dict[str, int]
    total: int
    best_post_url: str | None
    best_post_engagement: float


class UseCasePivotResponse(BaseModel):
    rows: list[UseCasePivotRow]
    format_families: list[str]
    status: str  # "ready" | "classifying" | "empty"


@router.post("/use-cases/classify", response_model=ClassifyResponse)
async def classify_use_cases(
    body: ClassifyRequest,
    db: AsyncSession = Depends(get_db),
):
    stmt = select(Post).where(Post.scrape_job_id == body.scrape_job_id)
    result = await db.execute(stmt)
    all_posts = list(result.scalars().all())

    total = len(all_posts)
    if total == 0:
        return ClassifyResponse(classified=0, total=0, already_classified=0)

    if body.force:
        to_classify = all_posts
        already_classified = 0
    else:
        to_classify = [p for p in all_posts if not p.claude_use_case]
        already_classified = total - len(to_classify)

    if not to_classify:
        return ClassifyResponse(classified=0, total=total, already_classified=already_classified)

    # Build dicts for classifier
    post_dicts = [
        {
            "id": str(p.id),
            "title": p.title,
            "author_name": p.author_name,
            "author_company": p.author_company,
            "format_family": p.format_family,
            "sector": p.sector,
        }
        for p in to_classify
    ]

    mapping = await classify_posts(post_dicts)

    # Update posts in DB
    classified = 0
    post_by_id = {str(p.id): p for p in to_classify}
    for post_id, use_case in mapping.items():
        post = post_by_id.get(post_id)
        if post:
            post.claude_use_case = use_case
            classified += 1

    await db.commit()

    return ClassifyResponse(
        classified=classified,
        total=total,
        already_classified=already_classified,
    )


@router.get("/use-cases/pivot", response_model=UseCasePivotResponse)
async def get_use_case_pivot(
    scrape_job_id: uuid.UUID = Query(...),
    db: AsyncSession = Depends(get_db),
):
    stmt = select(Post).where(Post.scrape_job_id == scrape_job_id)
    result = await db.execute(stmt)
    all_posts = list(result.scalars().all())

    if not all_posts:
        return UseCasePivotResponse(rows=[], format_families=FORMAT_ORDER, status="empty")

    classified = [p for p in all_posts if p.claude_use_case]
    if not classified:
        return UseCasePivotResponse(rows=[], format_families=FORMAT_ORDER, status="classifying")

    # Build pivot: use_case -> {format -> count, best_post}
    pivot: dict[str, dict] = {}
    for p in classified:
        uc = p.claude_use_case
        if uc not in pivot:
            pivot[uc] = {"counts": {}, "best_post": None, "best_score": -1.0}

        fmt = p.format_family or "unknown"
        pivot[uc]["counts"][fmt] = pivot[uc]["counts"].get(fmt, 0) + 1

        if p.engagement_score > pivot[uc]["best_score"]:
            pivot[uc]["best_score"] = p.engagement_score
            pivot[uc]["best_post"] = p

    # Build rows sorted by total desc
    rows = []
    for uc, data in pivot.items():
        total = sum(data["counts"].values())
        best = data["best_post"]
        rows.append(
            UseCasePivotRow(
                use_case=uc,
                counts_by_format=data["counts"],
                total=total,
                best_post_url=best.post_url if best else None,
                best_post_engagement=data["best_score"],
            )
        )

    rows.sort(key=lambda r: r.total, reverse=True)

    # Collect format families actually present
    all_formats = set()
    for data in pivot.values():
        all_formats.update(data["counts"].keys())
    format_families = [f for f in FORMAT_ORDER if f in all_formats]
    # Add any unexpected formats at the end
    for f in sorted(all_formats):
        if f not in format_families:
            format_families.append(f)

    return UseCasePivotResponse(
        rows=rows,
        format_families=format_families,
        status="ready",
    )
