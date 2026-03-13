from __future__ import annotations

import json
import re
import uuid
from pathlib import Path

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import select, distinct
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth import require_admin
from app.config import settings
from app.db import get_db
from app.models.watched_account import WatchedAccount
from app.schemas.account import WatchedAccountCreate, WatchedAccountUpdate, WatchedAccountOut

router = APIRouter()

DEFAULT_PASSWORD = "onda-wave-2026"
ENV_FILE = Path(__file__).parent.parent.parent / ".env"


class UserCreate(BaseModel):
    name: str
    email: str


@router.get("/accounts/users")
async def list_users():
    """Return list of CS users (from USERS env var) for assignment dropdown."""
    return [
        {"email": u["email"], "name": u.get("name", u["email"]), "role": u.get("role", "user")}
        for u in settings.user_list
    ]


@router.post("/accounts/users", status_code=201)
async def create_user(
    body: UserCreate,
    _admin: dict = Depends(require_admin),
):
    """Create a new CS user. Adds to USERS env var and persists to .env file."""
    # Check for duplicate
    if any(u["email"] == body.email for u in settings.user_list):
        raise HTTPException(status_code=409, detail="User with this email already exists.")

    new_user = {"email": body.email, "password": DEFAULT_PASSWORD, "name": body.name, "role": "user"}

    # Update in-memory list
    current = [u for u in settings.user_list]
    current.append(new_user)

    # Persist to .env file
    new_users_json = json.dumps(current, ensure_ascii=False)
    if ENV_FILE.exists():
        content = ENV_FILE.read_text()
        if re.search(r"^USERS=", content, re.MULTILINE):
            content = re.sub(r"^USERS=.*$", f"USERS={new_users_json}", content, flags=re.MULTILINE)
        else:
            content += f"\nUSERS={new_users_json}\n"
        ENV_FILE.write_text(content)
        # Reload settings in-memory
        settings.USERS = new_users_json

    return {"email": new_user["email"], "name": new_user["name"], "role": new_user["role"]}


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
    _admin: dict = Depends(require_admin),
):
    if not body.linkedin_url and not body.instagram_url and not body.tiktok_url:
        raise HTTPException(status_code=422, detail="At least one URL (LinkedIn, Instagram, or TikTok) is required.")

    account = WatchedAccount(
        id=uuid.uuid4(),
        name=body.name,
        type=body.type,
        linkedin_url=body.linkedin_url,
        instagram_url=body.instagram_url,
        tiktok_url=body.tiktok_url,
        sector=body.sector,
        company_name=body.company_name,
        is_playplay_client=body.is_playplay_client,
        assigned_cs_email=body.assigned_cs_email,
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
    _admin: dict = Depends(require_admin),
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
    if "tiktok_url" in body.model_fields_set:
        account.tiktok_url = body.tiktok_url or None
    if body.company_name is not None:
        account.company_name = body.company_name
    if body.is_playplay_client is not None:
        account.is_playplay_client = body.is_playplay_client
    if "assigned_cs_email" in body.model_fields_set:
        account.assigned_cs_email = body.assigned_cs_email or None

    await db.commit()
    await db.refresh(account)
    return account


@router.delete("/accounts/{account_id}", status_code=204)
async def delete_account(
    account_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    _admin: dict = Depends(require_admin),
):
    result = await db.execute(select(WatchedAccount).where(WatchedAccount.id == account_id))
    account = result.scalar_one_or_none()
    if not account:
        raise HTTPException(status_code=404, detail="Account not found")
    await db.delete(account)
    await db.commit()
