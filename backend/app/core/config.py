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

    storage_backend: Literal["local", "gcs"] = "local"
    storage_local_path: str = "./data/uploads"
    storage_bucket: str | None = None

    embedding_provider: Literal["dev", "gemini", "openai"] = "dev"
    embedding_dimensions: int = 768
    # Tests truncate `creators` (which cascades to everything) between cases
    # and use the same creator-a/creator-b ids as dev-mock auth, so they must
    # never point at the database the app is using — set this to a separate
    # database or the DB-backed tests skip. See tests/conftest.py.
    test_database_url: str | None = None

    gemini_api_key: str | None = None
    # Dated model ids get retired (the previous defaults, gemini-2.0-flash
    # and text-embedding-004, both 404'd once actually called), but the
    # "-latest" alias isn't the answer either: it tracks the newest premium
    # model, whose free tier allows only 20 requests/day — roughly three
    # videos, since a full run makes ~6 model calls. A "lite" model has a
    # far higher free quota and is plenty for this content. Override with
    # GEMINI_MODEL (e.g. models/gemini-flash-latest) on a paid key.
    gemini_model: str = "models/gemini-3.1-flash-lite"
    gemini_embedding_model: str = "models/gemini-embedding-001"

    llm_provider: Literal["dev", "gemini", "groq", "openai"] = "dev"
    groq_api_key: str | None = None
    groq_model: str = "llama-3.3-70b-versatile"
    openai_api_key: str | None = None
    openai_model: str = "gpt-4o-mini"
    openai_embedding_model: str = "text-embedding-3-small"

    sentry_dsn: str | None = None

    rag_top_k: int = 5
    chunk_size_words: int = 400
    chunk_overlap_words: int = 60
    max_upload_bytes: int = 10 * 1024 * 1024

    hook_candidate_count: int = 5
    idea_suggestion_count: int = 5

    video_provider: Literal["dev", "veo"] = "dev"
    google_cloud_project: str | None = None
    google_cloud_location: str = "us-central1"
    google_application_credentials: str | None = None
    # Lite is ~15x cheaper per second than the full Veo models and is plenty
    # for this content. Verified working against the live API; the previous
    # default (veo-3.0-generate-001) and the "-preview" spelling of Lite both
    # 404 on a current project.
    veo_model: str = "veo-3.1-lite-generate-001"
    # Lite cannot do reference images at all - it rejects them with
    # FAILED_PRECONDITION "The request is not supported by this model" - so a
    # creator's face forces the pricier Fast tier ($0.15/s vs $0.05/s).
    # Only calls that actually carry a face pay that; see VeoVideoProvider.
    veo_reference_model: str = "veo-3.1-fast-generate-001"

    ffmpeg_path: str = "ffmpeg"
    ffprobe_path: str = "ffprobe"
    video_width: int = 1280
    video_height: int = 720
    video_fps: int = 30
    # Font used for burned-in captions. Unset means drawtext's built-in
    # fallback, which covers Latin script only — pure Telugu captions render
    # as empty boxes without a font that has Telugu glyphs (on Windows,
    # C:/Windows/Fonts/Nirmala.ttc; elsewhere, Noto Sans Telugu).
    caption_font_path: str | None = None

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
