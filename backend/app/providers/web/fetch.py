"""
Fetches a page a creator pasted and reduces it to readable text.

The whole point of this module is that the URL comes from outside. A server
that will fetch any address it is handed can be pointed at the machine it is
running on, or at a cloud metadata endpoint, and made to read things the
creator was never allowed to see. So every address is resolved and checked
before a request goes out, and again after every redirect - a public hostname
that redirects to 127.0.0.1 is the standard way past a check done only once.
"""

import ipaddress
import re
import socket
from dataclasses import dataclass, field
from urllib.parse import urljoin, urlparse

import httpx
from lxml import html as lxml_html

from app.core.errors import AppError

# Big enough for a long article, small enough that a hostile server cannot
# exhaust memory by streaming forever.
MAX_BYTES = 3_000_000
MAX_REDIRECTS = 5
TIMEOUT_SECONDS = 20.0

# Stripped before reading: none of it is what the page is about, and left in
# it drowns the article in menu items.
_BOILERPLATE = (
    "script", "style", "noscript", "template", "svg", "iframe",
    "nav", "header", "footer", "aside", "form", "button",
)

# Tried in order. A page that marks its own content saves us guessing.
_CONTENT_HINTS = (
    "//main", "//article", "//*[@role='main']",
    "//*[contains(@class,'content')]", "//body",
)

_WHITESPACE = re.compile(r"[ \t\r\f\v]+")
_BLANK_LINES = re.compile(r"\n{3,}")


class UnsafeUrlError(AppError):
    code = "VALIDATION_ERROR"
    status_code = 422


class PageFetchError(AppError):
    code = "VALIDATION_ERROR"
    status_code = 422


@dataclass
class PageContent:
    url: str
    title: str
    text: str
    # Same-site links found on the page, so a creator can pull in the pages
    # an event's landing page points at without pasting each one by hand.
    links: list[str] = field(default_factory=list)


def _assert_public_address(hostname: str) -> None:
    """
    Refuses anything that resolves to an address inside the network the
    server itself is on.

    Every address the name resolves to is checked, not just the first: a
    hostname with both a public and a loopback record would otherwise pass on
    one lookup and connect on the other.
    """
    try:
        infos = socket.getaddrinfo(hostname, None)
    except socket.gaierror as exc:
        raise UnsafeUrlError(f"Couldn't look up {hostname}.") from exc

    for info in infos:
        address = ipaddress.ip_address(info[4][0])
        if (
            address.is_private
            or address.is_loopback
            or address.is_link_local
            or address.is_reserved
            or address.is_multicast
            or address.is_unspecified
        ):
            raise UnsafeUrlError(
                "That address is on a private network, so it can't be read from here."
            )


def _assert_safe(url: str) -> None:
    parsed = urlparse(url)
    if parsed.scheme not in ("http", "https"):
        raise UnsafeUrlError("Only http and https links can be read.")
    if not parsed.hostname:
        raise UnsafeUrlError("That doesn't look like a web address.")
    _assert_public_address(parsed.hostname)


def _readable_text(document) -> str:
    for element in document.xpath("|".join(f"//{tag}" for tag in _BOILERPLATE)):
        parent = element.getparent()
        if parent is not None:
            parent.remove(element)

    for path in _CONTENT_HINTS:
        found = document.xpath(path)
        if found:
            text = found[0].text_content()
            # A "content" wrapper can be a nav shell. Anything this short is
            # not the article, so keep looking.
            if len(text.strip()) > 200 or path == "//body":
                return text
    return document.text_content()


def _tidy(text: str) -> str:
    lines = (_WHITESPACE.sub(" ", line).strip() for line in text.splitlines())
    return _BLANK_LINES.sub("\n\n", "\n".join(lines)).strip()


async def fetch_page(url: str) -> PageContent:
    """
    One page, as text.

    Redirects are followed by hand rather than by httpx, because each hop has
    to be re-checked: following them automatically would mean only the first
    address was ever validated.
    """
    current = url.strip()
    _assert_safe(current)

    async with httpx.AsyncClient(
        timeout=TIMEOUT_SECONDS,
        follow_redirects=False,
        headers={
            # Named honestly. A server that would rather not be read by a
            # bot deserves the chance to say so.
            "User-Agent": "OneInfo/1.0 (+https://oneinfo.dev; content extraction)",
            "Accept": "text/html,application/xhtml+xml",
        },
    ) as client:
        for _ in range(MAX_REDIRECTS + 1):
            try:
                response = await client.get(current)
            except httpx.TimeoutException as exc:
                # Distinguished from other transport errors because the cause
                # is usually neither the link nor us: some sites simply do not
                # answer from every network, and "try again" is bad advice
                # when the second attempt will hang for just as long.
                raise PageFetchError(
                    f"{urlparse(current).hostname} didn't respond within "
                    f"{int(TIMEOUT_SECONDS)} seconds. The site may be blocking "
                    "automated readers, or be unreachable from this network. "
                    "Pasting the page's text into My Knowledge works instead."
                ) from exc
            except httpx.HTTPError as exc:
                raise PageFetchError(
                    f"Couldn't open that link: {exc or type(exc).__name__}"
                ) from exc

            if response.is_redirect:
                location = response.headers.get("location")
                if not location:
                    raise PageFetchError("That link redirected to nowhere.")
                current = urljoin(current, location)
                _assert_safe(current)
                continue
            break
        else:
            raise PageFetchError("That link redirected too many times.")

    if response.status_code >= 400:
        raise PageFetchError(
            f"That page returned {response.status_code}. It may need a login, "
            "or the link may be wrong."
        )

    content_type = response.headers.get("content-type", "")
    if "html" not in content_type and "xml" not in content_type:
        raise PageFetchError(
            f"That link is {content_type.split(';')[0] or 'not a web page'}, "
            "which can't be read as an article."
        )

    body = response.content[:MAX_BYTES]
    if not body.strip():
        raise PageFetchError("That page was empty.")

    document = lxml_html.fromstring(body)
    document.make_links_absolute(current, resolve_base_href=True)

    titles = document.xpath("//title/text()")
    title = _tidy(titles[0]) if titles else current

    # Same-site only. A creator pasting an event page means "read this event",
    # not "read every site it advertises".
    host = urlparse(current).hostname or ""
    links: list[str] = []
    for href in document.xpath("//a/@href"):
        parsed = urlparse(href)
        if parsed.scheme in ("http", "https") and parsed.hostname == host:
            clean = href.split("#")[0]
            if clean != current and clean not in links:
                links.append(clean)

    return PageContent(url=current, title=title, text=_tidy(_readable_text(document)), links=links[:40])
