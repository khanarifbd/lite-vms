import uuid
from collections.abc import Collection

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.modules.audit.model import AuditLog
from app.modules.audit.schema import AuditHistoryEntry
from app.modules.auth.model import User


async def build_audit_history(
    session: AsyncSession,
    *,
    resource_type: str,
    resource_public_id: uuid.UUID,
    actions: Collection[str],
    limit: int = 50,
) -> list[AuditHistoryEntry]:
    entries = list(
        await session.scalars(
            select(AuditLog)
            .where(
                AuditLog.resource_type == resource_type,
                AuditLog.resource_public_id == resource_public_id,
                AuditLog.action.in_(tuple(actions)),
            )
            .order_by(AuditLog.created_at.desc())
            .limit(limit)
        )
    )
    actor_ids = {entry.actor_user_id for entry in entries if entry.actor_user_id is not None}
    actors: dict[int, User] = {}
    if actor_ids:
        actors = {
            actor.id: actor
            for actor in list(await session.scalars(select(User).where(User.id.in_(actor_ids))))
        }
    return [
        AuditHistoryEntry(
            id=entry.public_id,
            action=entry.action,
            actor_name=(
                actors[entry.actor_user_id].display_name
                if entry.actor_user_id in actors
                else None
            ),
            reason=entry.reason,
            previous_values=entry.previous_values,
            new_values=entry.new_values,
            created_at=entry.created_at,
        )
        for entry in entries
    ]
