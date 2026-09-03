import sentry_sdk

from app.core.config import Settings


def configure_sentry(settings: Settings) -> None:
    """No-op when SENTRY_DSN is unset — optional for MVP per the master spec."""
    if not settings.sentry_dsn:
        return
    sentry_sdk.init(
        dsn=settings.sentry_dsn,
        environment=settings.environment,
        traces_sample_rate=0.1,
        send_default_pii=False,
    )
