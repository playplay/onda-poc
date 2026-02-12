import ssl

from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
from sqlalchemy.orm import DeclarativeBase
from sqlalchemy.pool import NullPool

from app.config import settings

engine_kwargs: dict = {
    "echo": False,
    "pool_pre_ping": True,
}

if settings.is_serverless:
    # Serverless: no connection pool, use SSL for Neon
    engine_kwargs["poolclass"] = NullPool
    engine_kwargs["connect_args"] = {"ssl": ssl.create_default_context()}
else:
    # Local dev: standard pool, no SSL needed
    engine_kwargs["pool_size"] = 5
    engine_kwargs["max_overflow"] = 10
    engine_kwargs["pool_recycle"] = 300

engine = create_async_engine(settings.async_database_url, **engine_kwargs)
async_session = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)


class Base(DeclarativeBase):
    pass


async def get_db():
    async with async_session() as session:
        yield session
