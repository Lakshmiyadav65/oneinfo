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
    # The photo ceiling is the wrong one for an avatar capture. Ten seconds
    # of 720p out of MediaRecorder lands near 3 MB, but a slow browser, a
    # long take or a codec that refuses the bitrate hint can multiply that,
    # and making someone film themselves twice is a poor way to enforce a
    # limit. Checked while streaming to disk, never after.
    max_recording_bytes: int = 60 * 1024 * 1024

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

    # Who says the scene's line. Veo speaks its own, and for Telugu it
    # speaks it badly - audibly synthetic, and mispronounced because the
    # dialogue reaches it romanised. Sarvam says the line properly and the
    # pipeline puts it over Veo's picture.
    speech_provider: Literal["dev", "sarvam"] = "dev"
    sarvam_api_key: str | None = None
    sarvam_tts_model: str = "bulbul:v3"
    # Lower case, and the API is strict about it.
    sarvam_speaker: str = "shubh"

    # The other half of the Sarvam relationship: the voice says a line, this
    # reads one back. A creator who has no chat history to paste usually
    # does have a year of their own reels, and what they said in them is the
    # closest thing to a record of how they talk.
    # "sarvam" is the API and the only one that can write Tenglish.
    # "whisper" runs on this machine with no key and no network - slower,
    # free, and the audio never leaves the server, but it cannot
    # transliterate, so Tenglish comes back in Telugu script.
    transcription_provider: Literal["dev", "sarvam", "whisper"] = "dev"
    sarvam_stt_model: str = "saaras:v3"
    # Bigger is more accurate and slower; "small" is the prototype's default
    # and a reasonable floor for Telugu.
    whisper_model: Literal["tiny", "base", "small", "medium", "large-v3"] = "small"
    # Sarvam's real-time endpoint is documented at roughly 30 seconds per
    # request, so audio is cut at pauses before it is sent. The cut is taken
    # at the first pause after min, not at a target length: waiting for a
    # target sails past the pause between a Telugu sentence and an English
    # one, and a chunk holding both comes back entirely in whichever the
    # model thought was dominant. Max is only the fallback for a stretch
    # with no pause in it at all.
    transcription_min_chunk_seconds: float = 1.0
    transcription_max_chunk_seconds: float = 25.0
    # Loudness below which audio counts as a pause, and how long a pause has
    # to last to be a cut point. Less negative catches pauses under
    # background music, which reels are rarely without.
    transcription_silence_db: int = -30
    transcription_silence_min_seconds: float = 0.3
    # Downloads a reel. Absent from PATH, the reel routes fail with that as
    # the message rather than a FileNotFoundError from deep in a subprocess.
    ytdlp_path: str = "yt-dlp"
    # A Netscape-format cookies.txt for the creator's own Instagram session.
    # Private and age-gated reels are served only to a signed-in account, so
    # without this they cannot be downloaded at all and the only way in is
    # uploading the file by hand. Read from disk on the server, never
    # accepted over the API: a cookie jar is a live login, and taking one
    # through a form would mean storing other people's sessions.
    instagram_cookies_path: str | None = None
    # A minute of 1080p reel lands near 15 MB, but nothing stops a creator
    # pointing this at a twenty-minute video. Checked while streaming to
    # disk, never after.
    max_video_bytes: int = 200 * 1024 * 1024

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
