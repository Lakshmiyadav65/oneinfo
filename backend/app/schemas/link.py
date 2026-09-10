from pydantic import BaseModel, Field

from app.schemas.agents import LinkTakeaway


class LinkReadIn(BaseModel):
    urls: list[str] = Field(min_length=1, max_length=5)
    # Saves the page into My Knowledge so later steps can retrieve it.
    # Optional because a creator may just want to see what a link says.
    save_to_knowledge: bool = True


class LinkReadOut(BaseModel):
    url: str
    title: str
    # Null when the page could not be read; `error` says why in a sentence.
    topic: str | None = None
    audience: str | None = None
    takeaways: list[LinkTakeaway] = []
    call_to_action: str | None = None
    # How much readable text the page had, so a creator can tell a thin
    # result apart from a thorough one.
    characters: int = 0
    saved_as_knowledge: bool = False
    # The takeaways as a block of text, for handing to a prompt. Kept beside
    # the structured list rather than rebuilt by each caller, so every step
    # sees the same wording.
    summary_text: str | None = None
    error: str | None = None


class LinkReadResultOut(BaseModel):
    """One entry per URL, in the order they were given. A page that failed is
    reported beside the ones that worked rather than failing the request:
    reading three links and losing all three because one 404'd is not what
    the creator asked for."""

    pages: list[LinkReadOut]
