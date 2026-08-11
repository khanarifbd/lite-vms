from typing import Literal

from pydantic import BaseModel, ConfigDict, Field

from app.common.enums import UserStatus
from app.modules.audit.schema import AuditHistoryEntry
from app.modules.providers.schema import ProviderApplicationRead


class AdminProviderStatusUpdate(BaseModel):
    model_config = ConfigDict(str_strip_whitespace=True)

    action: Literal["activate", "lock", "suspend", "reactivate"]
    reason: str = Field(min_length=3, max_length=2000)


class AdminProviderDetail(BaseModel):
    provider: ProviderApplicationRead
    account_status: UserStatus
    last_administrative_reason: str | None
    history: list[AuditHistoryEntry]


class AdminProviderStatusResult(BaseModel):
    provider: ProviderApplicationRead
    message: str
