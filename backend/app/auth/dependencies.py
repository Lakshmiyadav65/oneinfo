from fastapi import Depends, Header
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth.verifier import get_verifier
from app.core.config import Settings, get_settings
from app.core.errors import UnauthorizedError
from app.db.session import get_db
from app.models.creator import Creator
from app.services.creator_service import get_or_create_creator


def _extract_bearer_token(authorization: str | None) -> str:
    if not authorization or not authorization.startswith("Bearer "):
        raise UnauthorizedError("Missing or invalid Authorization header.")
    return authorization.removeprefix("Bearer ").strip()


async def get_current_creator(
    authorization: str | None = Header(default=None),
    db: AsyncSession = Depends(get_db),
    settings: Settings = Depends(get_settings),
) -> Creator:
    """
    Resolves the authenticated creator from the request's bearer token.

    This is the single point every protected route depends on. It never
    trusts a client-supplied creator id — the identity comes only from a
    verified token (Supabase JWT in production, or the dev verifier while
    Supabase isn't configured yet).
    """
    token = _extract_bearer_token(authorization)
    verifier = get_verifier(settings)
    identity = verifier.verify(token)
    return await get_or_create_creator(db, identity)
