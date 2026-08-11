import uuid
from datetime import UTC, datetime
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Request, status
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.common.enums import ProviderStatus, TelemetrySourceStatus, TelemetrySourceType, UserRole
from app.core.database import get_session
from app.modules.audit.service import write_audit_log
from app.modules.auth.dependencies import require_roles
from app.modules.auth.model import User
from app.modules.providers.api_key_service import generate_provider_api_key
from app.modules.providers.model import VTSProvider
from app.modules.providers.service import get_provider_for_user
from app.modules.tracking.model import TelemetrySource

router = APIRouter(prefix="/providers", tags=["VTS Provider Telemetry API Keys"])


class ProviderAPIKeyCommand(BaseModel):
    note: str = Field(min_length=3, max_length=1000)


class ProviderAPIKeyStatusRead(BaseModel):
    provider_id: uuid.UUID
    source_id: uuid.UUID | None
    source_code: str | None
    source_status: str | None
    configured: bool
    key_prefix: str | None
    key_last_four: str | None
    created_at: datetime | None
    rotated_at: datetime | None
    revoked_at: datetime | None
    last_authenticated_at: datetime | None
    ingestion_path: str = "/api/v1/telemetry"
    header_name: str = "X-API-Key"


class ProviderAPIKeyIssueResult(ProviderAPIKeyStatusRead):
    api_key: str
    message: str


def request_ip(request: Request) -> str | None:
    real_ip = request.headers.get("x-real-ip")
    if real_ip:
        return real_ip.strip()
    forwarded = request.headers.get("x-forwarded-for")
    if forwarded:
        return forwarded.split(",", 1)[0].strip()
    return request.client.host if request.client else None


async def ensure_provider_key_access(
    session: AsyncSession,
    *,
    user: User,
    provider: VTSProvider,
) -> None:
    role_codes = set(getattr(user, "_role_codes", set()))
    if UserRole.SUPER_ADMIN.value in role_codes:
        return
    accessible = await get_provider_for_user(session, user.id)
    if accessible is None or accessible.id != provider.id:
        raise HTTPException(status_code=403, detail="You cannot manage this provider API key")


async def get_provider_or_404(
    session: AsyncSession,
    *,
    provider_id: uuid.UUID,
    user: User,
) -> VTSProvider:
    provider = await session.get(VTSProvider, provider_id)
    if provider is None:
        raise HTTPException(status_code=404, detail="VTS provider not found")
    await ensure_provider_key_access(session, user=user, provider=provider)
    return provider


async def get_source(session: AsyncSession, provider_id: uuid.UUID) -> TelemetrySource | None:
    return await session.scalar(
        select(TelemetrySource).where(TelemetrySource.provider_id == provider_id)
    )


def build_status(provider: VTSProvider, source: TelemetrySource | None) -> ProviderAPIKeyStatusRead:
    return ProviderAPIKeyStatusRead(
        provider_id=provider.id,
        source_id=source.id if source else None,
        source_code=source.code if source else None,
        source_status=source.status.value if source else None,
        configured=bool(source and source.api_key_hash and source.api_key_revoked_at is None),
        key_prefix=source.api_key_prefix if source else None,
        key_last_four=source.api_key_last_four if source else None,
        created_at=source.api_key_created_at if source else None,
        rotated_at=source.api_key_rotated_at if source else None,
        revoked_at=source.api_key_revoked_at if source else None,
        last_authenticated_at=source.last_authenticated_at if source else None,
    )


@router.get("/{provider_id}/telemetry-api-key", response_model=ProviderAPIKeyStatusRead)
async def read_provider_telemetry_api_key(
    provider_id: uuid.UUID,
    current_user: Annotated[
        User,
        Depends(require_roles(UserRole.SUPER_ADMIN, UserRole.VTS_ADMIN, UserRole.VTS_TECHNICAL)),
    ],
    session: Annotated[AsyncSession, Depends(get_session)],
) -> ProviderAPIKeyStatusRead:
    provider = await get_provider_or_404(
        session, provider_id=provider_id, user=current_user
    )
    return build_status(provider, await get_source(session, provider.id))


@router.post(
    "/{provider_id}/telemetry-api-key",
    response_model=ProviderAPIKeyIssueResult,
    status_code=status.HTTP_201_CREATED,
)
async def issue_or_rotate_provider_telemetry_api_key(
    provider_id: uuid.UUID,
    payload: ProviderAPIKeyCommand,
    request: Request,
    current_user: Annotated[
        User,
        Depends(require_roles(UserRole.SUPER_ADMIN, UserRole.VTS_ADMIN, UserRole.VTS_TECHNICAL)),
    ],
    session: Annotated[AsyncSession, Depends(get_session)],
) -> ProviderAPIKeyIssueResult:
    provider = await get_provider_or_404(
        session, provider_id=provider_id, user=current_user
    )
    if provider.status != ProviderStatus.APPROVED:
        raise HTTPException(
            status_code=409,
            detail="Only an approved VTS provider can receive a telemetry API key",
        )
    if provider.tenant_id is None:
        raise HTTPException(status_code=409, detail="Provider tenant is missing")

    now = datetime.now(UTC)
    source = await get_source(session, provider.id)
    if source is None:
        source = TelemetrySource(
            code=f"SRC-{provider.code}"[:60],
            source_type=TelemetrySourceType.VTS_PROVIDER,
            tenant_id=provider.tenant_id,
            provider_id=provider.id,
            owner_id=None,
            status=TelemetrySourceStatus.ACTIVE,
            approved_by_id=current_user.id,
            approved_at=now,
        )
        session.add(source)
        await session.flush()
    else:
        source.status = TelemetrySourceStatus.ACTIVE
        source.approved_by_id = current_user.id
        source.approved_at = source.approved_at or now
        source.suspended_at = None
        source.status_reason = None

    generated = generate_provider_api_key()
    action = "rotated" if source.api_key_hash else "issued"
    source.api_key_prefix = generated.lookup_prefix
    source.api_key_hash = generated.digest
    source.api_key_last_four = generated.last_four
    source.api_key_revoked_at = None
    source.api_key_created_by_id = current_user.id
    if source.api_key_created_at is None:
        source.api_key_created_at = now
    if action == "rotated":
        source.api_key_rotated_at = now

    provider.integration_status = "api_key_ready"
    await write_audit_log(
        session,
        tenant_id=provider.tenant_id,
        actor_user_id=current_user.id,
        actor_organization_id=provider.root_organization_id,
        action=f"vts_provider.telemetry_api_key_{action}",
        resource_type="telemetry_source",
        resource_public_id=source.id,
        ip_address=request_ip(request),
        user_agent=request.headers.get("user-agent"),
        new_values={
            "provider_id": str(provider.id),
            "source_code": source.code,
            "key_prefix": generated.lookup_prefix,
            "key_last_four": generated.last_four,
            "note": payload.note,
        },
    )
    await session.commit()
    await session.refresh(source)

    state = build_status(provider, source)
    return ProviderAPIKeyIssueResult(
        **state.model_dump(),
        api_key=generated.plaintext,
        message=(
            "Copy this API key now. It is shown only once and must be sent in the "
            "X-API-Key header."
        ),
    )


@router.post(
    "/{provider_id}/telemetry-api-key/revoke",
    response_model=ProviderAPIKeyStatusRead,
)
async def revoke_provider_telemetry_api_key(
    provider_id: uuid.UUID,
    payload: ProviderAPIKeyCommand,
    request: Request,
    current_user: Annotated[
        User,
        Depends(require_roles(UserRole.SUPER_ADMIN, UserRole.VTS_ADMIN, UserRole.VTS_TECHNICAL)),
    ],
    session: Annotated[AsyncSession, Depends(get_session)],
) -> ProviderAPIKeyStatusRead:
    provider = await get_provider_or_404(
        session, provider_id=provider_id, user=current_user
    )
    source = await get_source(session, provider.id)
    if source is None or not source.api_key_hash or source.api_key_revoked_at is not None:
        raise HTTPException(status_code=409, detail="No active telemetry API key exists")

    now = datetime.now(UTC)
    source.api_key_revoked_at = now
    source.status = TelemetrySourceStatus.SUSPENDED
    source.suspended_at = now
    source.status_reason = payload.note
    provider.integration_status = "api_key_revoked"
    await write_audit_log(
        session,
        tenant_id=provider.tenant_id,
        actor_user_id=current_user.id,
        actor_organization_id=provider.root_organization_id,
        action="vts_provider.telemetry_api_key_revoked",
        resource_type="telemetry_source",
        resource_public_id=source.id,
        ip_address=request_ip(request),
        user_agent=request.headers.get("user-agent"),
        new_values={
            "provider_id": str(provider.id),
            "source_code": source.code,
            "key_prefix": source.api_key_prefix,
            "key_last_four": source.api_key_last_four,
            "note": payload.note,
        },
    )
    await session.commit()
    await session.refresh(source)
    return build_status(provider, source)
