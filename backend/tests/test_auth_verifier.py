import pytest

from app.auth.verifier import DevAuthVerifier
from app.core.errors import UnauthorizedError


def test_dev_verifier_accepts_known_dev_creators():
    identity = DevAuthVerifier().verify("dev:creator-a")
    assert identity.auth_id == "creator-a"
    assert identity.email == "creator-a@oneinfo.dev"


def test_dev_verifier_rejects_unknown_creator():
    with pytest.raises(UnauthorizedError):
        DevAuthVerifier().verify("dev:some-random-id")


def test_dev_verifier_rejects_malformed_token():
    with pytest.raises(UnauthorizedError):
        DevAuthVerifier().verify("not-a-dev-token")
