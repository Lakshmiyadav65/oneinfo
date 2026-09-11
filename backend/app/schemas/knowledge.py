import uuid
from datetime import datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field

from app.models.knowledge import KnowledgeSourceType, KnowledgeStatus


class KnowledgeDocumentOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    title: str
    source_type: KnowledgeSourceType
    status: KnowledgeStatus
    # Set for anything that came from a link — a page that was read, or a
    # reel that was transcribed. Null for everything filed by hand.
    source_url: str | None = None
    error_message: str | None = None
    created_at: datetime


class KnowledgeDetailOut(KnowledgeDocumentOut):
    """One document, opened. Everything the knowledge layer holds for it."""

    # Rebuilt from the stored chunks — see knowledge_service.rejoin_chunks.
    content: str
    # What retrieval actually searches. Shown because "one document" and
    # "eleven chunks" are different things, and a creator wondering why a
    # long transcript keeps surfacing is owed the number.
    chunk_count: int
    # The standing takeaways, for anything that came from a link.
    summary: str | None = None


class KnowledgeTextIn(BaseModel):
    title: str
    content: str


class KnowledgeStructureIn(BaseModel):
    """A raw paste to be reorganised — no title, the agent proposes one per section."""

    content: str


class KnowledgePartOut(BaseModel):
    label: str
    text: str


class KnowledgeSectionOut(BaseModel):
    title: str
    # The labelled blocks, for display. `content` is these same parts
    # serialised — it is what actually gets stored and embedded, so the
    # labels survive into retrieval rather than being a preview-only flourish.
    parts: list[KnowledgePartOut]
    content: str


class KnowledgeStructureOut(BaseModel):
    sections: list[KnowledgeSectionOut]
    truncated: bool = False


class KnowledgeBulkIn(BaseModel):
    documents: list[KnowledgeTextIn] = Field(min_length=1, max_length=15)


class KnowledgeReelsIn(BaseModel):
    # Ten at a time. Each one is a download, an ffmpeg pass and a request per
    # chunk of audio, and a creator who pastes their whole posting history in
    # one go should be told to do it in batches rather than quietly starting
    # four hundred jobs.
    urls: list[str] = Field(min_length=1, max_length=10)
    # The same three languages the rest of the app offers, not a vocabulary
    # of this feature's own — a transcript is what the script agents later
    # write from, so it is the same choice, asked once. None means "whatever
    # this creator's projects are in".
    language: Literal["english", "tenglish", "telugu"] | None = None


class ReelQueuedOut(BaseModel):
    """
    What happened to one link.

    A link that could not be accepted is reported beside the ones that were,
    never as a failure of the whole request — the same contract as reading
    several pages at once.
    """

    url: str
    document: KnowledgeDocumentOut | None = None
    # True when this link was already transcribed, so nothing was queued and
    # nothing was charged.
    already_added: bool = False
    error: str | None = None


class KnowledgeReelsOut(BaseModel):
    reels: list[ReelQueuedOut]
