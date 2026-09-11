from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api.router import api_router
from app.core.config import Settings, get_settings
from app.core.errors import register_exception_handlers
from app.core.logging import configure_logging
from app.core.monitoring import configure_sentry
from app.db.schema_check import verify_schema_is_current


def _lifespan(settings: Settings):
    """
    Checked once, at boot, rather than discovered one broken endpoint at a
    time. An un-run migration makes every request touching that table fail
    with a generic 500, and the only clue is deep in a driver traceback.
    """

    @asynccontextmanager
    async def lifespan(_: FastAPI):
        await verify_schema_is_current(settings)
        yield

    return lifespan


def create_app() -> FastAPI:
    configure_logging()
    settings = get_settings()
    settings.validate_for_startup()
    configure_sentry(settings)

    app = FastAPI(title="OneInfo AI Video Creator API", lifespan=_lifespan(settings))

    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.cors_allow_origins,
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    register_exception_handlers(app)
    app.include_router(api_router)
    return app


app = create_app()
