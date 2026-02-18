from __future__ import annotations

import uuid
from datetime import datetime

from pydantic import BaseModel, Field


class WatchedAccountCreate(BaseModel):
    name: str = Field(..., min_length=1)
    type: str = Field(..., pattern="^(company|persona)$")
    linkedin_url: str = Field(..., min_length=1)
    sector: str = Field(..., min_length=1)


class WatchedAccountUpdate(BaseModel):
    name: str | None = None
    type: str | None = Field(None, pattern="^(company|persona)$")
    linkedin_url: str | None = None
    sector: str | None = None


class WatchedAccountOut(BaseModel):
    id: uuid.UUID
    name: str
    type: str
    linkedin_url: str
    sector: str
    created_at: datetime

    model_config = {"from_attributes": True}
