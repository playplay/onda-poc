from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware

from app.config import settings
from app.db import engine, Base
from app.routers import scrape, posts, analysis, trend_summary, accounts

app = FastAPI(
    title="Onda API",
    description="LinkedIn Trend Intelligence Tool",
    version="0.1.0",
)

_tables_created = False


@app.middleware("http")
async def ensure_tables(request: Request, call_next):
    global _tables_created
    if not _tables_created:
        async with engine.begin() as conn:
            await conn.run_sync(Base.metadata.create_all)
        _tables_created = True
    return await call_next(request)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins_list,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(scrape.router, prefix="/api", tags=["scrape"])
app.include_router(posts.router, prefix="/api", tags=["posts"])
app.include_router(analysis.router, prefix="/api", tags=["analysis"])
app.include_router(trend_summary.router, prefix="/api", tags=["trends"])
app.include_router(accounts.router, prefix="/api", tags=["accounts"])


@app.get("/health")
async def health():
    return {"status": "ok"}


