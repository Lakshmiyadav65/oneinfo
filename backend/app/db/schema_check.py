"""
Does the database have the schema this code expects?

Asked once at startup, because the failure mode when the answer is no is
genuinely awful to diagnose: SQLAlchemy selects every mapped column, so a
single un-run migration makes *every* request touching that table fail with
a generic 500. The list of knowledge documents, the viewer, and the reel
routes all broke together and none of them said why — the only clue was in
the server log, four frames deep in a driver traceback.

One line at startup naming the command to run is worth more than any amount
of care taken later.
"""

import logging
from pathlib import Path

from alembic.config import Config
from alembic.script import ScriptDirectory
from sqlalchemy import text

from app.core.config import Settings
from app.db.base import get_engine

logger = logging.getLogger(__name__)

_BACKEND_ROOT = Path(__file__).resolve().parents[2]


def expected_revisions() -> set[str]:
    """The head(s) the migration files define."""
    config = Config(str(_BACKEND_ROOT / "alembic.ini"))
    config.set_main_option("script_location", str(_BACKEND_ROOT / "alembic"))
    return set(ScriptDirectory.from_config(config).get_heads())


async def applied_revision() -> str | None:
    """What the database says it is at, or None if it has never been stamped."""
    async with get_engine().connect() as conn:
        result = await conn.execute(text("SELECT version_num FROM alembic_version"))
        return result.scalar_one_or_none()


async def verify_schema_is_current(settings: Settings) -> None:
    """
    Warns loudly, and in production refuses to start.

    The split mirrors validate_for_startup: a developer mid-way through
    writing a migration has a good reason to run against a database that
    does not match yet, and should not be locked out of their own server.
    A production deploy serving 500s on half its routes has no such reason.

    A database that cannot be reached at all is not this function's problem
    and is not treated as a mismatch — that would turn a transient blip into
    a refusal to boot.
    """
    try:
        expected = expected_revisions()
        applied = await applied_revision()
    except Exception as exc:
        logger.warning("Could not verify the database schema version: %s", exc)
        return

    if applied in expected:
        return

    message = (
        f"Database schema is out of date: it is at {applied or 'no revision'}, "
        f"but this code expects {', '.join(sorted(expected))}. Every request that "
        f"touches a changed table will fail with a generic error until you run: "
        f"alembic upgrade head"
    )

    if settings.environment == "production":
        raise RuntimeError(f"Refusing to start. {message}")
    logger.error(message)
