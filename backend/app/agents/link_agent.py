from typing import cast

from app.providers.llm.base import LLMProvider
from app.schemas.agents import LinkSummary

# A page can be enormous, and the useful part is almost always near the top.
# Truncating before the call rather than after: an oversized prompt is
# rejected outright, which would lose the whole page instead of the tail.
MAX_PAGE_CHARS = 40_000


async def run_link_agent(
    llm: LLMProvider,
    *,
    url: str,
    title: str,
    page_text: str,
    language: str = "english",
) -> LinkSummary:
    """
    Turns a fetched page into the facts a reel can be built on.

    Not a summary. A creator scripting a reel about an event needs the date,
    the eligibility and the prize, because those are what a viewer acts on -
    and a summary paragraph is exactly the thing that rounds all of them off.
    So this asks for specifics, and asks for them verbatim: a hallucinated
    deadline in a video that tells people to apply by it is the worst
    failure this feature has.
    """
    prompt = (
        "SYSTEM: You are OneInfo's research assistant. Below is the text of a "
        "web page a creator wants to make a short video about. Pull out what "
        "a viewer would need to know and act on.\n\n"
        "RULES:\n"
        "- Take every specific detail from the page verbatim: dates, "
        "deadlines, prize amounts, eligibility, locations, prices, names. "
        "Never infer, round, or reword a number or a date. If the page does "
        "not state something, leave it out rather than guessing - a made-up "
        "deadline in a video telling people to apply by it is the single "
        "worst thing you can produce here.\n"
        "- Each takeaway is a short label and the detail behind it, e.g. "
        'label "Deadline", detail "Applications close 10 August 2026".\n'
        "- Order them the way a viewer would care: what it is, who it is "
        "for, when, what they get, how to take part.\n"
        "- Aim for four to eight takeaways. A page with less in it should "
        "produce fewer, not padding.\n"
        "- Set is_substantive false if this text is mostly navigation, a "
        "cookie notice, a login wall or an error page. Say so rather than "
        "inventing a topic out of menu items.\n"
        f"- Write the labels and details in {language}.\n\n"
        f"PAGE URL: {url}\n"
        f"PAGE TITLE: {title}\n"
        f"PAGE TEXT:\n{page_text[:MAX_PAGE_CHARS]}\n"
    )
    result = await llm.generate_structured(prompt, LinkSummary)
    return cast(LinkSummary, result)
