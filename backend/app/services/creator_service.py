from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth.verifier import AuthenticatedIdentity
from app.models.creator import Creator


async def get_or_create_creator(db: AsyncSession, identity: AuthenticatedIdentity) -> Creator:
    result = await db.execute(select(Creator).where(Creator.id == identity.auth_id))
    creator = result.scalar_one_or_none()
    if creator is not None:
        return creator

    creator = Creator(
        id=identity.auth_id,
        email=identity.email,
        name=identity.name or identity.email or "Creator",
    )
    db.add(creator)
    await db.commit()
    await db.refresh(creator)
    return creator
