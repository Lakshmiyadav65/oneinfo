import re
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


# A dev creator id has to be usable as a primary key and as a path segment
# in a storage key, and nothing else is asked of it.
_DEV_ID = re.compile(r"^[A-Za-z0-9._@+-]{1,255}$")


class DevAuthVerifier:
    """
    Development-only verifier for use before Supabase is configured. Accepts
    tokens of the form "dev:<id>", mirroring the frontend's dev-mock auth so
    creator ids line up during local development. Never selected when
    SUPABASE_JWT_SECRET is set (see Settings.auth_mode), and the app refuses
    to start in production without that secret.

    Any well-formed id is accepted, not a fixed list of two. Everything
    behind this point is already per-creator - every table carries a
    creator_id that cascades from `creators`, and the creator row itself is
    created on first sight - so the two-entry dictionary that used to live
    here was the only reason a third creator could not exist. That made the
    whole app look single-tenant when only its front door was.

    This grants nothing that was not already granted: the dev sign-in accepts
    any password for the accounts it knows, so the door has never been
    locked. It is kept shut by not being selected outside development.
    """

    _NAMED: ClassVar[dict[str, AuthenticatedIdentity]] = {
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

        creator_id = token[len(prefix) :].strip()
        if not _DEV_ID.match(creator_id):
            raise UnauthorizedError("Invalid or expired session.")

        named = self._NAMED.get(creator_id)
        if named is not None:
            return named

        # The frontend uses the address someone signed in with as the id, so
        # it is both the identity and the readable name. A id that is not an
        # address still gets a creator, named after itself.
        is_email = "@" in creator_id
        return AuthenticatedIdentity(
            auth_id=creator_id,
            email=creator_id if is_email else None,
            name=creator_id.split("@")[0] if is_email else creator_id,
        )


def get_verifier(settings: Settings) -> AuthVerifier:
    if settings.auth_mode == "supabase":
        assert settings.supabase_jwt_secret is not None
        return SupabaseJWTVerifier(settings.supabase_jwt_secret)
    return DevAuthVerifier()
