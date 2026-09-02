from dataclasses import dataclass
from typing import ClassVar, Protocol

import jwt

from app.core.config import Settings
from app.core.errors import UnauthorizedError


@dataclass(frozen=True)
class AuthenticatedIdentity:
    auth_id: str
    email: str | None
    name: str | None


class AuthVerifier(Protocol):
    def verify(self, token: str) -> AuthenticatedIdentity: ...


class SupabaseJWTVerifier:
    """Verifies a Supabase Auth access token (HS256, shared JWT secret)."""

    def __init__(self, jwt_secret: str):
        self._jwt_secret = jwt_secret

    def verify(self, token: str) -> AuthenticatedIdentity:
        try:
            payload = jwt.decode(
                token,
                self._jwt_secret,
                algorithms=["HS256"],
                audience="authenticated",
            )
        except jwt.PyJWTError as exc:
            raise UnauthorizedError("Invalid or expired session.") from exc

        auth_id = payload.get("sub")
        if not auth_id:
            raise UnauthorizedError("Invalid or expired session.")

        user_metadata = payload.get("user_metadata") or {}
        name = user_metadata.get("full_name") or user_metadata.get("name")
        return AuthenticatedIdentity(auth_id=auth_id, email=payload.get("email"), name=name)


class DevAuthVerifier:
    """
    Development-only verifier for use before Supabase is configured. Accepts
    tokens of the form "dev:<creator-a|creator-b>", mirroring the frontend's
    dev-mock auth from Phase 01 so creator ids line up if the two are ever
    connected during local development. Never selected when
    SUPABASE_JWT_SECRET is set (see Settings.auth_mode).
    """

    _DEV_CREATORS: ClassVar[dict[str, AuthenticatedIdentity]] = {
        "creator-a": AuthenticatedIdentity(
            auth_id="creator-a", email="creator-a@oneinfo.dev", name="Demo Creator A"
        ),
        "creator-b": AuthenticatedIdentity(
            auth_id="creator-b", email="creator-b@oneinfo.dev", name="Demo Creator B"
        ),
    }

    def verify(self, token: str) -> AuthenticatedIdentity:
        prefix = "dev:"
        if not token.startswith(prefix):
            raise UnauthorizedError("Invalid or expired session.")

        creator_id = token[len(prefix) :]
        identity = self._DEV_CREATORS.get(creator_id)
        if identity is None:
            raise UnauthorizedError("Invalid or expired session.")
        return identity


def get_verifier(settings: Settings) -> AuthVerifier:
    if settings.auth_mode == "supabase":
        assert settings.supabase_jwt_secret is not None
        return SupabaseJWTVerifier(settings.supabase_jwt_secret)
    return DevAuthVerifier()
