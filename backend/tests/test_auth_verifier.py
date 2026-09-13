import pytest

from app.auth.verifier import DevAuthVerifier
from app.core.errors import UnauthorizedError


def test_dev_verifier_accepts_known_dev_creators():
    identity = DevAuthVerifier().verify("dev:creator-a")
    assert identity.auth_id == "creator-a"
    assert identity.email == "creator-a@oneinfo.dev"


def test_dev_verifier_gives_an_unknown_address_its_own_creator():
    """
    Deliberately replaces a test that asserted the opposite.

    Rejecting every id but two made the whole app look single-tenant when
    only its front door was: every table already carries a creator_id that
    cascades from `creators`, and the creator row is created on first sight.
    A third creator could not exist, so nobody could check that a second
    creator's knowledge stayed their own.

    It grants nothing new. The dev sign-in accepts any password for the
    accounts it knows, so this door has never been locked - it is kept shut
    by not being selected outside development, and the app refuses to start
    in production without a Supabase secret.
    """
    identity = DevAuthVerifier().verify("dev:meera@runclub.in")

    assert identity.auth_id == "meera@runclub.in"
    assert identity.email == "meera@runclub.in"
    assert identity.name == "meera"


def test_a_dev_id_that_is_not_an_address_still_gets_a_creator():
    identity = DevAuthVerifier().verify("dev:third-creator")

    assert identity.auth_id == "third-creator"
    assert identity.name == "third-creator"
    # Nothing to infer, and inventing one would put a fake address on a row.
    assert identity.email is None


def test_the_named_demo_accounts_keep_their_fixed_identity():
    """Their ids are what the work already in the database is filed under."""
    assert DevAuthVerifier().verify("dev:creator-b").name == "Demo Creator B"


@pytest.mark.parametrize(
    "token",
    [
        "dev:",
        "dev:   ",
        "dev:has space",
        "dev:slash/es",
        "dev:" + "x" * 256,
    ],
)
def test_dev_verifier_rejects_an_id_it_could_not_use(token):
    """The id becomes a primary key and a segment of every storage path this
    creator writes, so anything that would not survive both is refused."""
    with pytest.raises(UnauthorizedError):
        DevAuthVerifier().verify(token)


def test_dev_verifier_rejects_malformed_token():
    with pytest.raises(UnauthorizedError):
        DevAuthVerifier().verify("not-a-dev-token")
