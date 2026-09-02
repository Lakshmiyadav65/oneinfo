import pytest

from app.core.config import Settings


def test_dev_auth_mode_when_no_supabase_secret():
    assert Settings(supabase_jwt_secret=None).auth_mode == "dev"


def test_supabase_auth_mode_when_secret_present():
    assert Settings(supabase_jwt_secret="secret").auth_mode == "supabase"


def test_refuses_to_start_with_dev_auth_in_production():
    settings = Settings(environment="production", supabase_jwt_secret=None)
    with pytest.raises(RuntimeError):
        settings.validate_for_startup()
