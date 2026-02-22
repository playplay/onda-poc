from __future__ import annotations

import uuid
from datetime import datetime

from pydantic import BaseModel, Field


class WatchedAccountCreate(BaseModel):
    name: str = Field(..., min_length=1)
    type: str = Field(default="company", pattern="^(company)$")
    linkedin_url: str = Field(..., min_length=1)
    sector: str = Field(..., min_length=1)
    is_playplay_client: bool = False


class WatchedAccountUpdate(BaseModel):
    name: str | None = None
    type: str | None = Field(None, pattern="^(company)$")
    linkedin_url: str | None = None
    sector: str | None = None
    is_playplay_client: bool | None = None


class WatchedAccountOut(BaseModel):
    id: uuid.UUID
    name: str
    type: str
    linkedin_url: str
    sector: str
    is_playplay_client: bool
    created_at: datetime

    model_config = {"from_attributes": True}
