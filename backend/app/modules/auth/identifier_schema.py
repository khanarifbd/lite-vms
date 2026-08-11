import uuid

from pydantic import BaseModel, Field, field_validator

from app.common.enums import IdentifierType
from app.modules.auth.schema import (
    normalize_email,
    normalize_mobile,
    normalize_username,
)


def normalize_identifier_value(identifier_type: IdentifierType, value: str) -> str:
    if identifier_type == IdentifierType.EMAIL:
        return normalize_email(value)
    if identifier_type == IdentifierType.MOBILE:
        normalized = normalize_mobile(value)
        if normalized is None:
            raise ValueError("Mobile number is required")
        return normalized
    return normalize_username(value)


class IdentifierCreate(BaseModel):
    identifier_type: IdentifierType
    value: str = Field(min_length=3, max_length=255)
    make_primary: bool = False

    @field_validator("value")
    @classmethod
    def strip_value(cls, value: str) -> str:
        return value.strip()


class IdentifierUpdate(BaseModel):
    value: str = Field(min_length=3, max_length=255)

    @field_validator("value")
    @classmethod
    def strip_value(cls, value: str) -> str:
        return value.strip()


class IdentifierAvailabilityRead(BaseModel):
    identifier_type: IdentifierType
    normalized_value: str
    available: bool
    message: str


class IdentifierTarget(BaseModel):
    user_public_id: uuid.UUID
    identifier_public_id: uuid.UUID
