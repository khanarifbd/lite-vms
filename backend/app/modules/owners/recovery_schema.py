import uuid

from pydantic import BaseModel, Field, field_validator

from app.modules.auth.schema import normalize_mobile


class OwnerMobilePasswordResetRequest(BaseModel):
    identity_or_registration_reference: str = Field(min_length=3, max_length=120)
    mobile: str

    @field_validator("mobile")
    @classmethod
    def validate_mobile(cls, value: str) -> str:
        normalized = normalize_mobile(value)
        if normalized is None:
            raise ValueError("Mobile number is required")
        return normalized


class OwnerMobilePasswordResetRequestResult(BaseModel):
    challenge_id: uuid.UUID
    phone: str
    expires_in_seconds: int
    delivery_status: str
    development_otp: str | None = None
    message: str


class OwnerMobilePasswordResetConfirm(BaseModel):
    challenge_id: uuid.UUID
    otp: str = Field(pattern=r"^\d{6}$")
    new_password: str = Field(min_length=6, max_length=128)


class OwnerMobilePasswordResetResult(BaseModel):
    owner_id: uuid.UUID
    owner_name: str
    username: str | None
    phone: str
    must_change_password: bool
    message: str
