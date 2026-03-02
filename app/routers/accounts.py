from __future__ import annotations

import uuid

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select, distinct
from sqlalchemy.ext.asyncio import AsyncSession

from app.db import get_db
from app.models.watched_account import WatchedAccount
from app.schemas.account import WatchedAccountCreate, WatchedAccountUpdate, WatchedAccountOut

router = APIRouter()


@router.get("/accounts/sectors", response_model=list[str])
async def list_sectors(db: AsyncSession = Depends(get_db)):
    """Return distinct sectors from watched accounts (sorted)."""
    result = await db.execute(
        select(distinct(WatchedAccount.sector)).order_by(WatchedAccount.sector)
    )
    return [row[0] for row in result.all()]


@router.get("/accounts", response_model=list[WatchedAccountOut])
async def list_accounts(
    sector: str | None = None,
    db: AsyncSession = Depends(get_db),
):
    q = select(WatchedAccount).order_by(WatchedAccount.sector, WatchedAccount.name)
    if sector:
        q = q.where(WatchedAccount.sector == sector)
    result = await db.execute(q)
    return result.scalars().all()


@router.post("/accounts", response_model=WatchedAccountOut, status_code=201)
async def create_account(
    body: WatchedAccountCreate,
    db: AsyncSession = Depends(get_db),
):
    if not body.linkedin_url and not body.instagram_url:
        raise HTTPException(status_code=422, detail="At least one URL (LinkedIn or Instagram) is required.")

    account = WatchedAccount(
        id=uuid.uuid4(),
        name=body.name,
        type=body.type,
        linkedin_url=body.linkedin_url,
        instagram_url=body.instagram_url,
        sector=body.sector,
        company_name=body.company_name,
        is_playplay_client=body.is_playplay_client,
    )
    db.add(account)
    await db.commit()
    await db.refresh(account)
    return account


@router.put("/accounts/{account_id}", response_model=WatchedAccountOut)
async def update_account(
    account_id: uuid.UUID,
    body: WatchedAccountUpdate,
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(select(WatchedAccount).where(WatchedAccount.id == account_id))
    account = result.scalar_one_or_none()
    if not account:
        raise HTTPException(status_code=404, detail="Account not found")

    if body.name is not None:
        account.name = body.name
    if body.type is not None:
        account.type = body.type
    # URL fields: use model_fields_set to distinguish "not sent" vs "sent as null"
    if "linkedin_url" in body.model_fields_set:
        account.linkedin_url = body.linkedin_url or None
    if body.sector is not None:
        account.sector = body.sector
    if "instagram_url" in body.model_fields_set:
        account.instagram_url = body.instagram_url or None
    if body.company_name is not None:
        account.company_name = body.company_name
    if body.is_playplay_client is not None:
        account.is_playplay_client = body.is_playplay_client

    await db.commit()
    await db.refresh(account)
    return account


@router.delete("/accounts/{account_id}", status_code=204)
async def delete_account(
    account_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(select(WatchedAccount).where(WatchedAccount.id == account_id))
    account = result.scalar_one_or_none()
    if not account:
        raise HTTPException(status_code=404, detail="Account not found")
    await db.delete(account)
    await db.commit()
