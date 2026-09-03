from app.core.config import Settings
from app.core.monitoring import configure_sentry


def test_no_op_when_dsn_unset(monkeypatch):
    called = False

    def fake_init(**kwargs):
        nonlocal called
        called = True

    monkeypatch.setattr("app.core.monitoring.sentry_sdk.init", fake_init)
    configure_sentry(Settings(sentry_dsn=None))
    assert called is False


def test_initializes_when_dsn_set(monkeypatch):
    captured = {}

    def fake_init(**kwargs):
        captured.update(kwargs)

    monkeypatch.setattr("app.core.monitoring.sentry_sdk.init", fake_init)
    configure_sentry(Settings(sentry_dsn="https://example@sentry.io/123", environment="production"))
    assert captured["dsn"] == "https://example@sentry.io/123"
    assert captured["environment"] == "production"
