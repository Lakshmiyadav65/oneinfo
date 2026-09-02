from functools import lru_cache
from typing import Literal

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """
    Server-only configuration. Nothing here is ever sent to the browser —
    that boundary is the frontend's NEXT_PUBLIC_* variables instead.
    """

    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

    environment: Literal["development", "test", "production"] = "development"

    # Database (Supabase Postgres, or any Postgres with the `vector` extension)
    database_url: str = "postgresql+asyncpg://postgres:postgres@localhost:5432/oneinfo"

    # Auth: when supabase_jwt_secret is unset, the API runs in dev-mock auth
    # mode (mirrors the frontend's dev-only mock auth from Phase 01). This
    # must never happen in production — see auth_mode below.
    supabase_url: str | None = None
    supabase_jwt_secret: str | None = None

    cors_allow_origins: list[str] = ["http://localhost:3000"]

    redis_url: str = "redis://localhost:6379/0"
    celery_task_always_eager: bool = False

    storage_backend: Literal["local", "s3"] = "local"
    storage_local_path: str = "./data/uploads"

    embedding_provider: Literal["dev", "gemini"] = "dev"
    embedding_dimensions: int = 768
    gemini_api_key: str | None = None

    llm_provider: Literal["dev", "gemini"] = "dev"

    rag_top_k: int = 5
    chunk_size_words: int = 400
    chunk_overlap_words: int = 60
    max_upload_bytes: int = 10 * 1024 * 1024

    hook_candidate_count: int = 4

    video_provider: Literal["dev", "veo"] = "dev"
    google_cloud_project: str | None = None
    google_cloud_location: str = "us-central1"
    google_application_credentials: str | None = None
    veo_model: str = "veo-3.0-generate-001"

    ffmpeg_path: str = "ffmpeg"
    ffprobe_path: str = "ffprobe"
    video_width: int = 1280
    video_height: int = 720
    video_fps: int = 30

    @property
    def auth_mode(self) -> Literal["supabase", "dev"]:
        return "supabase" if self.supabase_jwt_secret else "dev"

    def validate_for_startup(self) -> None:
        if self.environment == "production" and self.auth_mode == "dev":
            raise RuntimeError(
                "Refusing to start: environment=production but no "
                "SUPABASE_JWT_SECRET is configured, which would run dev-mock "
                "auth in production."
            )


@lru_cache
def get_settings() -> Settings:
    return Settings()
