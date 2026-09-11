"""
The startup check that the database matches the code.

Worth testing because the thing it prevents is so hard to read from the
outside: one un-run migration makes SQLAlchemy's select of every mapped
column fail, so every request touching that table returns a generic 500 at
once. Nothing in the response says "migration", and the only real clue is
several frames into a driver traceback.
"""

import logging

import pytest

from app.core.config import Settings
from app.db import schema_check


def test_the_expected_revision_is_read_from_the_migration_files():
    """Not hardcoded anywhere — adding a migration must move this on its own,
    or the check quietly stops checking."""
    heads = schema_check.expected_revisions()

    assert heads, "no alembic head found; the check would never fire"
    assert all(isinstance(head, str) for head in heads)


async def test_a_matching_schema_says_nothing(monkeypatch, caplog):
    monkeypatch.setattr(schema_check, "expected_revisions", lambda: {"0042"})

    async def _applied() -> str:
        return "0042"

    monkeypatch.setattr(schema_check, "applied_revision", _applied)

    with caplog.at_level(logging.WARNING):
        await schema_check.verify_schema_is_current(Settings(environment="development"))

    assert caplog.records == []


async def test_a_stale_schema_names_the_command_to_run(monkeypatch, caplog):
    """The message has one job: turn "everything is broken" into "run this"."""
    monkeypatch.setattr(schema_check, "expected_revisions", lambda: {"0042"})

    async def _applied() -> str:
        return "0041"

    monkeypatch.setattr(schema_check, "applied_revision", _applied)

    with caplog.at_level(logging.ERROR):
        await schema_check.verify_schema_is_current(Settings(environment="development"))

    assert "alembic upgrade head" in caplog.text
    assert "0041" in caplog.text and "0042" in caplog.text


async def test_production_refuses_to_start_on_a_stale_schema(monkeypatch):
    """
    A developer mid-way through writing a migration has a good reason to run
    against a database that does not match yet. A production deploy serving
    500s on half its routes does not — same split as validate_for_startup.
    """
    monkeypatch.setattr(schema_check, "expected_revisions", lambda: {"0042"})

    async def _applied() -> str:
        return "0041"

    monkeypatch.setattr(schema_check, "applied_revision", _applied)

    with pytest.raises(RuntimeError, match="alembic upgrade head"):
        await schema_check.verify_schema_is_current(
            Settings(environment="production", supabase_jwt_secret="not-a-real-secret")
        )


async def test_an_unreachable_database_is_not_treated_as_a_mismatch(monkeypatch, caplog):
    """Otherwise a transient blip at boot becomes a refusal to start, which
    is a worse failure than the one being guarded against."""

    async def _explode() -> str:
        raise OSError("connection refused")

    monkeypatch.setattr(schema_check, "applied_revision", _explode)

    with caplog.at_level(logging.WARNING):
        await schema_check.verify_schema_is_current(
            Settings(environment="production", supabase_jwt_secret="not-a-real-secret")
        )

    assert "could not verify" in caplog.text.lower()
