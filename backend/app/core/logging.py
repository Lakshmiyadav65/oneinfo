import logging


def configure_logging() -> None:
    logging.basicConfig(
        level=logging.INFO,
        format="%(asctime)s %(levelname)s %(name)s %(message)s",
    )
    # Access logs from libraries are noisy at INFO; keep our own app logs visible.
    logging.getLogger("uvicorn.access").setLevel(logging.WARNING)
