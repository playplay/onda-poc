from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    DATABASE_URL: str = "postgresql+asyncpg://scraptrends:scraptrends@db:5432/scraptrends"
    APIFY_TOKEN: str = ""
    ANTHROPIC_API_KEY: str = ""
    AI_GATEWAY_API_KEY: str = ""
    VERCEL_OIDC_TOKEN: str = ""
    CORS_ORIGINS: str = "http://localhost:5173,http://localhost:3000"

    @property
    def cors_origins_list(self) -> list[str]:
        return [o.strip() for o in self.CORS_ORIGINS.split(",")]

    model_config = {"env_file": ".env", "extra": "ignore"}


settings = Settings()
