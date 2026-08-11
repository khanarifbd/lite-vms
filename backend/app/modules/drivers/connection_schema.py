from pydantic import BaseModel, ConfigDict, Field

from app.modules.drivers.schema import DriverLinkRead


class DriverOwnerLinkRequest(BaseModel):
    model_config = ConfigDict(str_strip_whitespace=True)

    owner_code: str = Field(min_length=3, max_length=40)
    notes: str | None = Field(default=None, max_length=1000)


class OwnerDriverLinkUnlink(BaseModel):
    model_config = ConfigDict(str_strip_whitespace=True)

    reason: str = Field(min_length=3, max_length=1000)


class OwnerDriverLinkActionResult(BaseModel):
    link: DriverLinkRead
    ended_assignment_count: int = 0
    message: str
