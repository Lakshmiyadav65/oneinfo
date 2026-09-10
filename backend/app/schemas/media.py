import enum
import uuid
from datetime import datetime

from pydantic import BaseModel


class MediaKind(str, enum.Enum):
    """A finished video, or one scene clip that went into one."""

    video = "video"
    clip = "clip"


class MediaItemOut(BaseModel):
    id: uuid.UUID
    kind: MediaKind
    project_id: uuid.UUID
    project_title: str
    # What this is within its project: "Finished video", "Scene 3 · take 2".
    label: str
    duration_seconds: float | None = None
    file_size_bytes: int | None = None
    # Auth-gated proxy route; the client fetches it through the API client
    # rather than putting it straight in a src attribute.
    url: str
    created_at: datetime
