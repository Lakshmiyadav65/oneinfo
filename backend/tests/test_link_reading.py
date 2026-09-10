"""
Reading a page a creator pasted.

The URL comes from outside, so the guard around it is the part worth pinning:
a server that fetches any address it is handed can be pointed at itself, or
at a cloud metadata endpoint, and made to read what the creator never could.
"""

import pytest

from app.providers.web.fetch import PageFetchError, UnsafeUrlError, _tidy, fetch_page


@pytest.mark.parametrize(
    "url",
    [
        "http://127.0.0.1:8000/",
        "http://localhost/admin",
        "http://[::1]/",
        "http://169.254.169.254/latest/meta-data/",  # cloud instance credentials
        "http://192.168.1.1/",
        "http://10.0.0.5/",
    ],
)
async def test_addresses_inside_the_network_are_refused(url):
    with pytest.raises(UnsafeUrlError):
        await fetch_page(url)


@pytest.mark.parametrize(
    "url",
    ["file:///etc/passwd", "ftp://example.com/x", "gopher://example.com/", "javascript:alert(1)"],
)
async def test_only_http_and_https_are_read(url):
    with pytest.raises((UnsafeUrlError, PageFetchError)):
        await fetch_page(url)


def test_readable_text_keeps_paragraphs_and_drops_runs_of_blank_lines():
    """Chunking for retrieval splits on blank lines, so collapsing every
    newline would fuse a whole page into one chunk."""
    messy = "Title\n\n\n\n  Body   line  \t\n\n\n  Another\n"

    assert _tidy(messy) == "Title\n\nBody line\n\nAnother"
