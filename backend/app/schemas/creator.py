from pydantic import BaseModel, ConfigDict


class CreatorOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    name: str
    email: str | None = None
