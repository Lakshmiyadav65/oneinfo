import uuid
from datetime import datetime

from pydantic import BaseModel, ConfigDict


class HookOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    text: str
    type: str
    is_selected: bool
    reason: str | None = None
    is_recommended: bool = False
    is_custom: bool = False
    created_at: datetime


class HookCreateIn(BaseModel):
    """A hook the creator wrote themselves, instead of picking a generated one."""

    text: str
