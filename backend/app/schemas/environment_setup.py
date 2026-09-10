import uuid
from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field, field_validator

from app.schemas.environment import SceneEnvironment


class EnvironmentSetupOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    name: str
    description: str | None = None
    environment: SceneEnvironment
    is_default: bool
    created_at: datetime
    updated_at: datetime

    @field_validator("environment", mode="before")
    @classmethod
    def _environment(cls, value: object) -> object:
        return value or {}


class EnvironmentSetupIn(BaseModel):
    name: str = Field(min_length=1, max_length=80)
    description: str | None = Field(default=None, max_length=300)
    environment: SceneEnvironment
    # Makes this the setup new projects start from, replacing whichever setup
    # held that role before.
    is_default: bool = False


class EnvironmentSetupUpdateIn(BaseModel):
    """Every field optional: renaming a setup should not require resending
    the whole filming configuration."""

    name: str | None = Field(default=None, min_length=1, max_length=80)
    description: str | None = Field(default=None, max_length=300)
    environment: SceneEnvironment | None = None
    is_default: bool | None = None
