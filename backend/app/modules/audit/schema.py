import uuid
from datetime import datetime

from pydantic import BaseModel


class AuditHistoryEntry(BaseModel):
    id: uuid.UUID
    action: str
    actor_name: str | None
    reason: str | None
    previous_values: dict | None
    new_values: dict | None
    created_at: datetime
