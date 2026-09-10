import uuid

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.errors import NotFoundError, ValidationAppError
from app.models.environment_setup import EnvironmentSetup
from app.schemas.environment import SceneEnvironment


async def list_setups(db: AsyncSession, creator_id: str) -> list[EnvironmentSetup]:
    """Default first, then newest. The picker reads top to bottom, and the
    setup a creator marked as their usual belongs at the top of it."""
    result = await db.execute(
        select(EnvironmentSetup)
        .where(EnvironmentSetup.creator_id == creator_id)
        .order_by(EnvironmentSetup.is_default.desc(), EnvironmentSetup.created_at.desc())
    )
    return list(result.scalars().all())


async def get_owned_setup(
    db: AsyncSession, creator_id: str, setup_id: uuid.UUID
) -> EnvironmentSetup:
    result = await db.execute(
        select(EnvironmentSetup).where(
            EnvironmentSetup.id == setup_id, EnvironmentSetup.creator_id == creator_id
        )
    )
    setup = result.scalar_one_or_none()
    if setup is None:
        raise NotFoundError("Saved setup not found.")
    return setup


async def get_default_setup(db: AsyncSession, creator_id: str) -> EnvironmentSetup | None:
    result = await db.execute(
        select(EnvironmentSetup).where(
            EnvironmentSetup.creator_id == creator_id,
            EnvironmentSetup.is_default.is_(True),
        )
    )
    return result.scalar_one_or_none()


async def _clear_other_defaults(
    db: AsyncSession, creator_id: str, keep_id: uuid.UUID | None
) -> None:
    """At most one default per creator. Done as a read-then-write rather than
    a database constraint: promoting one setup necessarily demotes another,
    and a unique index would reject the moment when both are still set."""
    result = await db.execute(
        select(EnvironmentSetup).where(
            EnvironmentSetup.creator_id == creator_id,
            EnvironmentSetup.is_default.is_(True),
        )
    )
    for other in result.scalars().all():
        if other.id != keep_id:
            other.is_default = False


async def _assert_name_is_free(
    db: AsyncSession, creator_id: str, name: str, exclude_id: uuid.UUID | None = None
) -> None:
    """Checked here so a duplicate name comes back as a sentence rather than
    as the unique constraint's error text."""
    result = await db.execute(
        select(EnvironmentSetup).where(
            EnvironmentSetup.creator_id == creator_id, EnvironmentSetup.name == name
        )
    )
    existing = result.scalar_one_or_none()
    if existing is not None and existing.id != exclude_id:
        raise ValidationAppError(f'You already have a saved setup called "{name}".')


async def create_setup(
    db: AsyncSession,
    creator_id: str,
    *,
    name: str,
    description: str | None,
    environment: SceneEnvironment,
    is_default: bool,
) -> EnvironmentSetup:
    name = name.strip()
    await _assert_name_is_free(db, creator_id, name)

    setup = EnvironmentSetup(
        creator_id=creator_id,
        name=name,
        description=(description or "").strip() or None,
        environment=environment.model_dump(mode="json"),
        is_default=is_default,
    )
    db.add(setup)
    await db.flush()
    if is_default:
        await _clear_other_defaults(db, creator_id, setup.id)
    await db.commit()
    await db.refresh(setup)
    return setup


async def update_setup(
    db: AsyncSession,
    creator_id: str,
    setup_id: uuid.UUID,
    *,
    name: str | None = None,
    description: str | None = None,
    environment: SceneEnvironment | None = None,
    is_default: bool | None = None,
) -> EnvironmentSetup:
    setup = await get_owned_setup(db, creator_id, setup_id)

    if name is not None:
        name = name.strip()
        await _assert_name_is_free(db, creator_id, name, exclude_id=setup.id)
        setup.name = name
    if description is not None:
        setup.description = description.strip() or None
    if environment is not None:
        setup.environment = environment.model_dump(mode="json")
    if is_default is not None:
        setup.is_default = is_default
        if is_default:
            await _clear_other_defaults(db, creator_id, setup.id)

    await db.commit()
    await db.refresh(setup)
    return setup


async def delete_setup(db: AsyncSession, creator_id: str, setup_id: uuid.UUID) -> None:
    """
    Removes a saved setup.

    Projects and scenes already using it are untouched: they hold their own
    copy of the values, so deleting the entry a look came from never changes
    a storyboard the creator has already built.
    """
    setup = await get_owned_setup(db, creator_id, setup_id)
    await db.delete(setup)
    await db.commit()
