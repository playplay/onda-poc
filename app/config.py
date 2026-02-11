from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    DATABASE_URL: str = "postgresql+asyncpg://scraptrends:scraptrends@localhost:5432/scraptrends"
    POSTGRES_URL: str = ""
    APIFY_TOKEN: str = ""
    ANTHROPIC_API_KEY: str = ""
    AI_GATEWAY_API_KEY: str = ""
    VERCEL_OIDC_TOKEN: str = ""
    CORS_ORIGINS: str = "http://localhost:5173,http://localhost:3000"

    @property
    def async_database_url(self) -> str:
        """Return asyncpg-compatible URL, preferring Vercel's POSTGRES_URL if set."""
        url = self.POSTGRES_URL or self.DATABASE_URL
        # Vercel provides postgres:// but asyncpg needs postgresql+asyncpg://
        if url.startswith("postgres://"):
            url = url.replace("postgres://", "postgresql+asyncpg://", 1)
        elif url.startswith("postgresql://"):
            url = url.replace("postgresql://", "postgresql+asyncpg://", 1)
        return url

    @property
    def cors_origins_list(self) -> list[str]:
        return [o.strip() for o in self.CORS_ORIGINS.split(",")]

    model_config = {"env_file": ".env", "extra": "ignore"}


settings = Settings()
