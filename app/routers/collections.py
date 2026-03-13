from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel
from sqlalchemy import select, delete
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth import get_current_user
from app.db import get_db
from app.models.collection import Collection, SavedPost
from app.models.post import Post
from app.schemas.post import PostOut

router = APIRouter(prefix="/collections")


class CollectionCreate(BaseModel):
    name: str


class CollectionOut(BaseModel):
    id: int
    name: str
    post_count: int = 0

    model_config = {"from_attributes": True}


class SavePostRequest(BaseModel):
    post_id: str


@router.get("", response_model=list[CollectionOut])
async def list_collections(
    request: Request,
    db: AsyncSession = Depends(get_db),
):
    user = get_current_user(request)
    result = await db.execute(
        select(Collection)
        .where(Collection.user_email == user["email"])
        .order_by(Collection.created_at)
    )
    collections = result.scalars().all()

    # Get post counts
    out = []
    for c in collections:
        count_result = await db.execute(
            select(SavedPost.id).where(SavedPost.collection_id == c.id)
        )
        out.append(CollectionOut(id=c.id, name=c.name, post_count=len(count_result.all())))
    return out


@router.post("", response_model=CollectionOut, status_code=201)
async def create_collection(
    body: CollectionCreate,
    request: Request,
    db: AsyncSession = Depends(get_db),
):
    user = get_current_user(request)
    collection = Collection(user_email=user["email"], name=body.name)
    db.add(collection)
    await db.commit()
    await db.refresh(collection)
    return CollectionOut(id=collection.id, name=collection.name, post_count=0)


@router.delete("/{collection_id}", status_code=204)
async def delete_collection(
    collection_id: int,
    request: Request,
    db: AsyncSession = Depends(get_db),
):
    user = get_current_user(request)
    result = await db.execute(
        select(Collection)
        .where(Collection.id == collection_id, Collection.user_email == user["email"])
    )
    collection = result.scalar_one_or_none()
    if not collection:
        raise HTTPException(status_code=404, detail="Collection not found")
    await db.delete(collection)
    await db.commit()


@router.post("/{collection_id}/posts", status_code=201)
async def add_post_to_collection(
    collection_id: int,
    body: SavePostRequest,
    request: Request,
    db: AsyncSession = Depends(get_db),
):
    user = get_current_user(request)
    # Verify collection belongs to user
    result = await db.execute(
        select(Collection)
        .where(Collection.id == collection_id, Collection.user_email == user["email"])
    )
    if not result.scalar_one_or_none():
        raise HTTPException(status_code=404, detail="Collection not found")

    saved = SavedPost(
        user_email=user["email"],
        post_id=body.post_id,
        collection_id=collection_id,
    )
    db.add(saved)
    try:
        await db.commit()
    except Exception:
        await db.rollback()
        raise HTTPException(status_code=409, detail="Post already in collection")
    return {"ok": True}


@router.delete("/{collection_id}/posts/{post_id}", status_code=204)
async def remove_post_from_collection(
    collection_id: int,
    post_id: str,
    request: Request,
    db: AsyncSession = Depends(get_db),
):
    user = get_current_user(request)
    await db.execute(
        delete(SavedPost).where(
            SavedPost.collection_id == collection_id,
            SavedPost.post_id == post_id,
            SavedPost.user_email == user["email"],
        )
    )
    await db.commit()


@router.get("/{collection_id}/posts", response_model=list[PostOut])
async def get_collection_posts(
    collection_id: int,
    request: Request,
    db: AsyncSession = Depends(get_db),
):
    user = get_current_user(request)
    result = await db.execute(
        select(Post)
        .join(SavedPost, SavedPost.post_id == Post.id)
        .where(SavedPost.collection_id == collection_id)
        .where(SavedPost.user_email == user["email"])
        .order_by(Post.engagement_rate.desc())
    )
    return result.scalars().all()


@router.get("/saved-post-ids")
async def get_saved_post_ids(
    request: Request,
    db: AsyncSession = Depends(get_db),
):
    """Return all post IDs saved by the current user, grouped by collection."""
    user = get_current_user(request)
    result = await db.execute(
        select(SavedPost.post_id, SavedPost.collection_id)
        .where(SavedPost.user_email == user["email"])
    )
    mapping: dict[int, list[str]] = {}
    for row in result.all():
        mapping.setdefault(row[1], []).append(str(row[0]))
    return mapping
