import ipaddress

from pydantic import BaseModel, ConfigDict, Field, field_validator

from app.modules.auth.schema import normalize_email, normalize_mobile


class ProviderWorkspaceSettingsUpdate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    website_url: str | None = Field(default=None, max_length=500)
    technical_contact_name: str | None = Field(default=None, min_length=2, max_length=120)
    technical_contact_email: str | None = Field(default=None, min_length=5, max_length=180)
    technical_contact_mobile: str | None = Field(default=None, min_length=10, max_length=30)
    operations_contact_name: str | None = Field(default=None, max_length=120)
    operations_contact_phone: str | None = Field(default=None, max_length=30)
    operations_contact_email: str | None = Field(default=None, max_length=180)
    support_contact_name: str | None = Field(default=None, max_length=120)
    support_contact_phone: str | None = Field(default=None, max_length=30)
    support_contact_email: str | None = Field(default=None, max_length=180)
    emergency_contact_name: str | None = Field(default=None, max_length=120)
    emergency_contact_phone: str | None = Field(default=None, max_length=30)
    emergency_contact_email: str | None = Field(default=None, max_length=180)
    service_coverage: list[str] | None = Field(default=None, max_length=100)
    supported_protocols: list[str] | None = Field(default=None, max_length=100)
    supported_device_brands: list[str] | None = Field(default=None, max_length=100)
    api_base_url: str | None = Field(default=None, max_length=500)
    current_platform_name: str | None = Field(default=None, max_length=180)
    data_submission_interval_seconds: int | None = Field(default=None, ge=1, le=3600)
    allowed_server_ips: list[str] | None = Field(default=None, max_length=50)

    @field_validator(
        "technical_contact_email",
        "operations_contact_email",
        "support_contact_email",
        "emergency_contact_email",
    )
    @classmethod
    def validate_email(cls, value: str | None) -> str | None:
        return normalize_email(value) if value else None

    @field_validator(
        "technical_contact_mobile",
        "operations_contact_phone",
        "support_contact_phone",
        "emergency_contact_phone",
    )
    @classmethod
    def validate_mobile(cls, value: str | None) -> str | None:
        return normalize_mobile(value)

    @field_validator("service_coverage", "supported_protocols", "supported_device_brands")
    @classmethod
    def normalize_list_values(cls, values: list[str] | None) -> list[str] | None:
        if values is None:
            return None
        return sorted({value.strip() for value in values if value.strip()})

    @field_validator("allowed_server_ips")
    @classmethod
    def validate_allowed_ips(cls, values: list[str] | None) -> list[str] | None:
        if values is None:
            return None
        normalized: list[str] = []
        for value in values:
            try:
                canonical = str(ipaddress.ip_address(value.strip()))
            except ValueError as exc:
                raise ValueError(f"Invalid server IP address: {value}") from exc
            if canonical not in normalized:
                normalized.append(canonical)
        return normalized
