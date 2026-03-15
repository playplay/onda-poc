import logging

logging.basicConfig(level=logging.INFO)

import jwt as pyjwt
from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from sqlalchemy import text

from app.config import settings
from app.db import engine, Base
from app.routers import scrape, posts, analysis, trend_summary, accounts, auth, use_cases, library, home, collections, custom_search, favorites, cron
import app.models.trend_snapshot  # noqa: F401 — register model for create_all
import app.models.collection  # noqa: F401 — register model for create_all
import app.models.favorite  # noqa: F401 — register model for create_all

app = FastAPI(
    title="Onda API",
    description="LinkedIn Trend Intelligence Tool",
    version="0.1.0",
)

_tables_created = False


@app.middleware("http")
async def auth_middleware(request: Request, call_next):
    path = request.url.path
    if path.startswith("/api/auth") or path.startswith("/api/cron") or path == "/health" or not path.startswith("/api"):
        return await call_next(request)
    token = request.cookies.get("onda_token")
    if not token:
        return JSONResponse(status_code=401, content={"detail": "Not authenticated"})
    try:
        pyjwt.decode(token, settings.JWT_SECRET, algorithms=["HS256"])
    except pyjwt.InvalidTokenError:
        return JSONResponse(status_code=401, content={"detail": "Invalid token"})
    return await call_next(request)


@app.middleware("http")
async def ensure_tables(request: Request, call_next):
    global _tables_created
    if not _tables_created:
        async with engine.begin() as conn:
            await conn.run_sync(Base.metadata.create_all)
            await conn.execute(text(
                "ALTER TABLE posts ADD COLUMN IF NOT EXISTS claude_use_case VARCHAR(200)"
            ))
            await conn.execute(text(
                "ALTER TABLE watched_accounts ADD COLUMN IF NOT EXISTS instagram_url TEXT"
            ))
            await conn.execute(text(
                "ALTER TABLE watched_accounts ALTER COLUMN linkedin_url DROP NOT NULL"
            ))
            await conn.execute(text(
                "ALTER TABLE scrape_jobs ADD COLUMN IF NOT EXISTS instagram_snapshot_id TEXT"
            ))
            await conn.execute(text(
                "ALTER TABLE watched_accounts ADD COLUMN IF NOT EXISTS tiktok_url TEXT"
            ))
            await conn.execute(text(
                "ALTER TABLE scrape_jobs ADD COLUMN IF NOT EXISTS tiktok_snapshot_id TEXT"
            ))
            await conn.execute(text(
                "ALTER TABLE watched_accounts ADD COLUMN IF NOT EXISTS assigned_cs_email VARCHAR(200)"
            ))
            # Scrape params + custom search columns
            await conn.execute(text(
                "ALTER TABLE scrape_jobs ADD COLUMN IF NOT EXISTS scrape_posts_per_account INTEGER"
            ))
            await conn.execute(text(
                "ALTER TABLE scrape_jobs ADD COLUMN IF NOT EXISTS scrape_by_date BOOLEAN"
            ))
            await conn.execute(text(
                "ALTER TABLE scrape_jobs ADD COLUMN IF NOT EXISTS is_custom_search BOOLEAN DEFAULT FALSE"
            ))
            await conn.execute(text(
                "ALTER TABLE scrape_jobs ADD COLUMN IF NOT EXISTS user_email VARCHAR(200)"
            ))
            await conn.execute(text(
                "ALTER TABLE scrape_jobs ADD COLUMN IF NOT EXISTS custom_account_url TEXT"
            ))
            await conn.execute(text(
                "ALTER TABLE scrape_jobs ADD COLUMN IF NOT EXISTS custom_account_name VARCHAR(200)"
            ))
            # Custom search new params
            await conn.execute(text(
                "ALTER TABLE scrape_jobs ADD COLUMN IF NOT EXISTS custom_account_type VARCHAR(50)"
            ))
            await conn.execute(text(
                "ALTER TABLE scrape_jobs ADD COLUMN IF NOT EXISTS scrape_date_since_months INTEGER"
            ))
            # Weekly scrape since_date column
            await conn.execute(text(
                "ALTER TABLE scrape_jobs ADD COLUMN IF NOT EXISTS scrape_since_date DATE"
            ))
            # Unique index on post_url for deduplication (partial: only non-NULL urls)
            await conn.execute(text(
                "CREATE UNIQUE INDEX IF NOT EXISTS uq_posts_post_url ON posts (post_url) WHERE post_url IS NOT NULL"
            ))
            # PlayPlay flags on posts
            await conn.execute(text(
                "ALTER TABLE posts ADD COLUMN IF NOT EXISTS playplay_flag BOOLEAN NOT NULL DEFAULT FALSE"
            ))
            await conn.execute(text(
                "ALTER TABLE posts ADD COLUMN IF NOT EXISTS playplay_flag_by VARCHAR(200)"
            ))
            await conn.execute(text(
                "ALTER TABLE posts ADD COLUMN IF NOT EXISTS playplay_flag_name VARCHAR(200)"
            ))
            await conn.execute(text(
                "ALTER TABLE posts ADD COLUMN IF NOT EXISTS playplay_flag_at TIMESTAMP"
            ))
            await conn.execute(text(
                "ALTER TABLE posts ADD COLUMN IF NOT EXISTS playplay_design_flag BOOLEAN NOT NULL DEFAULT FALSE"
            ))
            await conn.execute(text(
                "ALTER TABLE posts ADD COLUMN IF NOT EXISTS playplay_design_flag_by VARCHAR(200)"
            ))
            await conn.execute(text(
                "ALTER TABLE posts ADD COLUMN IF NOT EXISTS playplay_design_flag_name VARCHAR(200)"
            ))
            await conn.execute(text(
                "ALTER TABLE posts ADD COLUMN IF NOT EXISTS playplay_design_flag_at TIMESTAMP"
            ))
            # Drop legacy columns removed from the ScrapeJob model
            for col in ("content_type_filter", "is_corporate", "max_results"):
                await conn.execute(text(
                    f"ALTER TABLE scrape_jobs DROP COLUMN IF EXISTS {col}"
                ))
        _tables_created = True
    return await call_next(request)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins_list,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth.router, prefix="/api", tags=["auth"])
app.include_router(scrape.router, prefix="/api", tags=["scrape"])
app.include_router(posts.router, prefix="/api", tags=["posts"])
app.include_router(analysis.router, prefix="/api", tags=["analysis"])
app.include_router(trend_summary.router, prefix="/api", tags=["trends"])
app.include_router(accounts.router, prefix="/api", tags=["accounts"])
app.include_router(use_cases.router, prefix="/api", tags=["use-cases"])
app.include_router(library.router, prefix="/api", tags=["library"])
app.include_router(home.router, prefix="/api", tags=["home"])
app.include_router(collections.router, prefix="/api", tags=["collections"])
app.include_router(custom_search.router, prefix="/api", tags=["custom-search"])
app.include_router(favorites.router, prefix="/api", tags=["favorites"])
app.include_router(cron.router, prefix="/api", tags=["cron"])


@app.get("/health")
async def health():
    return {"status": "ok"}


