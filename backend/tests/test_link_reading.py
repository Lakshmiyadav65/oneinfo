"""
Reading a page a creator pasted.

The URL comes from outside, so the guard around it is the part worth pinning:
a server that fetches any address it is handed can be pointed at itself, or
at a cloud metadata endpoint, and made to read what the creator never could.
"""

import ssl

import httpx
import pytest

from app.providers.web import fetch
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


class _Attempts:
    """Stands in for the network, and records how each attempt was made."""

    def __init__(self, *outcomes):
        self.outcomes = list(outcomes)
        self.calls: list[tuple[float, object]] = []

    async def __call__(self, url, *, timeout, verify):
        self.calls.append((timeout, verify))
        outcome = self.outcomes.pop(0)
        if isinstance(outcome, Exception):
            raise outcome
        return outcome, url

    @property
    def handshakes(self) -> list[str]:
        return ["tls1.2" if isinstance(v, ssl.SSLContext) else "default" for _, v in self.calls]


def _page(body: bytes = b"<html><title>Read me</title><body>Body</body></html>") -> httpx.Response:
    return httpx.Response(200, headers={"content-type": "text/html"}, content=body)


@pytest.fixture
def offline(monkeypatch):
    """No DNS and no sockets: these tests are about which attempt is made."""
    monkeypatch.setattr(fetch, "_assert_public_address", lambda hostname: None)
    fetch._TLS12_HOSTS.clear()
    yield
    fetch._TLS12_HOSTS.clear()


def test_the_fallback_handshake_is_capped_at_tls_1_2():
    """The whole point of the second attempt: 1.3 is what stalls."""
    assert fetch._tls12_context().maximum_version is ssl.TLSVersion.TLSv1_2


async def test_a_site_that_stalls_on_tls_1_3_is_read_on_the_older_handshake(offline, monkeypatch):
    """www.odoo.com completes a TLS 1.3 handshake and then never answers.
    Before the retry existed the creator was told it was unreachable, while
    the same page opened fine in their browser."""
    attempts = _Attempts(httpx.ReadTimeout("stalled"), _page())
    monkeypatch.setattr(fetch, "_read_following_redirects", attempts)

    page = await fetch.fetch_page("https://www.odoo.com/event/oxp26")

    assert page.title == "Read me"
    assert attempts.handshakes == ["default", "tls1.2"]


async def test_neither_handshake_answering_is_still_reported_as_unreachable(offline, monkeypatch):
    attempts = _Attempts(httpx.ReadTimeout("stalled"), httpx.ReadTimeout("stalled again"))
    monkeypatch.setattr(fetch, "_read_following_redirects", attempts)

    with pytest.raises(PageFetchError, match="didn't respond within 20 seconds"):
        await fetch.fetch_page("https://nowhere.example/x")


async def test_the_two_attempts_share_one_twenty_second_budget(offline, monkeypatch):
    """A link that has already hung should not cost a second full timeout."""
    attempts = _Attempts(httpx.ReadTimeout("stalled"), httpx.ReadTimeout("stalled again"))
    monkeypatch.setattr(fetch, "_read_following_redirects", attempts)

    with pytest.raises(PageFetchError):
        await fetch.fetch_page("https://nowhere.example/x")

    assert sum(timeout for timeout, _ in attempts.calls) == fetch.TIMEOUT_SECONDS


async def test_a_host_known_to_stall_skips_the_attempt_that_hangs(offline, monkeypatch):
    """An event page is read alongside the pages it links to. Paying the
    stall once per link is what makes it noticeable."""
    first = _Attempts(httpx.ReadTimeout("stalled"), _page())
    monkeypatch.setattr(fetch, "_read_following_redirects", first)
    await fetch.fetch_page("https://www.odoo.com/event/oxp26")

    second = _Attempts(_page())
    monkeypatch.setattr(fetch, "_read_following_redirects", second)
    await fetch.fetch_page("https://www.odoo.com/event/oxp26/page/intro")

    assert second.handshakes == ["tls1.2"]
    assert second.calls[0][0] == fetch.TIMEOUT_SECONDS


async def test_a_refused_connection_is_not_retried_as_a_stall(offline, monkeypatch):
    """Only a timeout means the TLS 1.3 stall. Anything else is the link."""
    attempts = _Attempts(httpx.ConnectError("no route"))
    monkeypatch.setattr(fetch, "_read_following_redirects", attempts)

    with pytest.raises(PageFetchError, match="Couldn't open that link"):
        await fetch.fetch_page("https://nowhere.example/x")

    assert attempts.handshakes == ["default"]
