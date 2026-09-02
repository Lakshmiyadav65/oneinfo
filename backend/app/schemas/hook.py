import uuid
from datetime import datetime

from pydantic import BaseModel, ConfigDict


class HookOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    text: str
    type: str
    is_selected: bool
    created_at: datetime
