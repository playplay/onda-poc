from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.config import settings
from app.db import engine, Base
from app.routers import scrape, posts, analysis


@asynccontextmanager
async def lifespan(app: FastAPI):
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    yield
    await engine.dispose()


app = FastAPI(
    title="ScrapTrends API",
    description="LinkedIn Trend Intelligence Tool",
    version="0.1.0",
    lifespan=lifespan,
)

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


@app.get("/health")
async def health():
    return {"status": "ok"}
