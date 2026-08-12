import uuid
from datetime import UTC, datetime
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Query, Request, status
from sqlalchemy import func, or_, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.common.enums import (
    OrganizationStatus,
    ProviderDocumentStatus,
    ProviderReviewDecision,
    ProviderStatus,
    TenantStatus,
    UserRole,
)
from app.core.database import get_session
from app.modules.audit.service import write_audit_log
from app.modules.auth.dependencies import get_current_active_user, require_roles
from app.modules.auth.model import User
from app.modules.auth.service import get_user_by_public_id
from app.modules.iam.model import Organization, Tenant
from app.modules.providers.application_service import (
    ProviderOwnershipError,
    create_provider_for_user,
)
from app.modules.providers.model import VTSProvider, VTSProviderDocument
from app.modules.providers.schema import (
    ProviderAdminCreate,
    ProviderApplicationRead,
    ProviderApplicationUpdate,
    ProviderPage,
    ProviderRegister,
    ProviderRegistrationResult,
    ProviderReview,
)
from app.modules.providers.service import (
    build_provider_read,
    get_provider_by_id,
    get_provider_for_user,
    replace_allowed_ips,
    replace_provider_documents,
)

router = APIRouter(prefix="/providers", tags=["VTS Provider Applications"])


def request_ip(request: Request) -> str | None:
    return request.client.host if request.client else None


def request_agent(request: Request) -> str | None:
    return request.headers.get("user-agent")


def can_manage_all_providers(user: User) -> bool:
    role_codes = set(getattr(user, "_role_codes", set()))
    return bool(role_codes.intersection({UserRole.SUPER_ADMIN.value, UserRole.POLICE_ADMIN.value}))


async def ensure_provider_access(user: User, provider: VTSProvider) -> None:
    if can_manage_all_providers(user):
        return
    if provider.primary_admin_user_id != user.id:
        raise HTTPException(status_code=403, detail="You cannot access this VTS application")


@router.post(
    "/register",
    response_model=ProviderRegistrationResult,
    status_code=status.HTTP_201_CREATED,
)
async def register_vts_provider(
    payload: ProviderRegister,
    request: Request,
    current_user: Annotated[
        User,
        Depends(require_roles(UserRole.VTS_APPLICANT, UserRole.VTS_ADMIN)),
    ],
    session: Annotated[AsyncSession, Depends(get_session)],
) -> ProviderRegistrationResult:
    try:
        provider = await create_provider_for_user(
            session,
            payload=payload,
            primary_admin=current_user,
            approved_by_user_id=None,
        )
        await write_audit_log(
            session,
            tenant_id=provider.tenant_id,
            actor_user_id=current_user.id,
            actor_organization_id=provider.root_organization_id,
            action="vts_provider.application_submitted",
            resource_type="vts_provider",
            resource_public_id=provider.id,
            ip_address=request_ip(request),
            user_agent=request_agent(request),
            new_values={
                "application_number": provider.application_number,
                "primary_admin_user_public_id": str(current_user.public_id),
                "status": provider.status.value,
            },
        )
        await session.commit()
    except (ProviderOwnershipError, ValueError, IntegrityError) as exc:
        await session.rollback()
        raise HTTPException(status_code=409, detail=str(exc)) from None

    return ProviderRegistrationResult(
        provider=await build_provider_read(session, provider),
        account_can_login=True,
        message=(
            "VTS application submitted for the logged-in user. Vehicle and telemetry "
            "access remain blocked until approval."
        ),
    )


@router.post(
    "/admin-create",
    response_model=ProviderRegistrationResult,
    status_code=status.HTTP_201_CREATED,
)
async def admin_create_vts_provider(
    payload: ProviderAdminCreate,
    request: Request,
    admin: Annotated[User, Depends(require_roles(UserRole.SUPER_ADMIN))],
    session: Annotated[AsyncSession, Depends(get_session)],
) -> ProviderRegistrationResult:
    primary_admin = await get_user_by_public_id(
        session,
        payload.primary_admin_user_public_id,
    )
    if primary_admin is None:
        raise HTTPException(status_code=404, detail="Provider owner user not found")

    provider_payload = ProviderRegister.model_validate(
        payload.model_dump(exclude={"primary_admin_user_public_id"})
    )
    try:
        provider = await create_provider_for_user(
            session,
            payload=provider_payload,
            primary_admin=primary_admin,
            approved_by_user_id=admin.id,
        )
        await write_audit_log(
            session,
            tenant_id=provider.tenant_id,
            actor_user_id=admin.id,
            actor_organization_id=provider.root_organization_id,
            action="vts_provider.admin_created",
            resource_type="vts_provider",
            resource_public_id=provider.id,
            ip_address=request_ip(request),
            user_agent=request_agent(request),
            new_values={
                "application_number": provider.application_number,
                "primary_admin_user_public_id": str(primary_admin.public_id),
                "status": provider.status.value,
            },
        )
        await session.commit()
    except (ProviderOwnershipError, ValueError, IntegrityError) as exc:
        await session.rollback()
        raise HTTPException(status_code=409, detail=str(exc)) from None

    return ProviderRegistrationResult(
        provider=await build_provider_read(session, provider),
        account_can_login=True,
        message=(
            "VTS provider application created for the selected existing user. "
            "Operational access remains blocked until approval."
        ),
    )


@router.get("", response_model=ProviderPage)
async def list_provider_applications(
    _: Annotated[
        User,
        Depends(require_roles(UserRole.SUPER_ADMIN, UserRole.POLICE_ADMIN)),
    ],
    session: Annotated[AsyncSession, Depends(get_session)],
    provider_status: Annotated[ProviderStatus | None, Query(alias="status")] = None,
    search: Annotated[str | None, Query(max_length=180)] = None,
    offset: Annotated[int, Query(ge=0)] = 0,
    limit: Annotated[int, Query(ge=1, le=500)] = 50,
) -> ProviderPage:
    query = select(VTSProvider)
    count_query = select(func.count(VTSProvider.id))
    if provider_status:
        query = query.where(VTSProvider.status == provider_status)
        count_query = count_query.where(VTSProvider.status == provider_status)
    if search:
        pattern = f"%{search.strip().lower()}%"
        condition = or_(
            func.lower(VTSProvider.name).like(pattern),
            func.lower(VTSProvider.application_number).like(pattern),
            func.lower(VTSProvider.license_number).like(pattern),
            func.lower(VTSProvider.email).like(pattern),
            func.lower(VTSProvider.phone).like(pattern),
        )
        query = query.where(condition)
        count_query = count_query.where(condition)
    providers = list(
        await session.scalars(
            query.order_by(VTSProvider.submitted_at.desc()).offset(offset).limit(limit)
        )
    )
    return ProviderPage(
        items=[await build_provider_read(session, provider) for provider in providers],
        total=int(await session.scalar(count_query) or 0),
        offset=offset,
        limit=limit,
    )


@router.get("/me", response_model=ProviderApplicationRead)
async def read_my_provider_application(
    current_user: Annotated[
        User,
        Depends(
            require_roles(
                UserRole.VTS_APPLICANT,
                UserRole.VTS_ADMIN,
                UserRole.VTS_OPERATOR,
                UserRole.VTS_TECHNICAL,
                UserRole.VTS_VIEWER,
            )
        ),
    ],
    session: Annotated[AsyncSession, Depends(get_session)],
) -> ProviderApplicationRead:
    provider = await get_provider_for_user(session, current_user.id)
    if provider is None:
        raise HTTPException(status_code=404, detail="VTS application not found")
    return await build_provider_read(session, provider)


@router.get("/{provider_id}", response_model=ProviderApplicationRead)
async def read_provider_application(
    provider_id: uuid.UUID,
    current_user: Annotated[User, Depends(get_current_active_user)],
    session: Annotated[AsyncSession, Depends(get_session)],
) -> ProviderApplicationRead:
    provider = await get_provider_by_id(session, provider_id)
    if provider is None:
        raise HTTPException(status_code=404, detail="VTS application not found")
    await ensure_provider_access(current_user, provider)
    return await build_provider_read(session, provider)


@router.patch("/{provider_id}", response_model=ProviderApplicationRead)
async def update_provider_application(
    provider_id: uuid.UUID,
    payload: ProviderApplicationUpdate,
    request: Request,
    current_user: Annotated[User, Depends(get_current_active_user)],
    session: Annotated[AsyncSession, Depends(get_session)],
) -> ProviderApplicationRead:
    provider = await get_provider_by_id(session, provider_id)
    if provider is None:
        raise HTTPException(status_code=404, detail="VTS application not found")
    await ensure_provider_access(current_user, provider)
    is_platform_admin = can_manage_all_providers(current_user)
    original_status = provider.status
    is_direct_provider_update = not is_platform_admin and original_status == ProviderStatus.APPROVED
    if not is_platform_admin and original_status not in {
        ProviderStatus.PENDING,
        ProviderStatus.APPROVED,
        ProviderStatus.REJECTED,
    }:
        raise HTTPException(
            status_code=409,
            detail="The provider information cannot be edited in its current status",
        )

    documents = payload.documents
    allowed_ips = payload.allowed_server_ips
    changes = payload.model_dump(
        exclude_unset=True,
        exclude={"documents", "allowed_server_ips"},
    )
    field_map = {
        "legal_name": "name",
        "btrc_license_number": "license_number",
        "technical_contact_mobile": "technical_contact_phone",
    }
    for field, value in changes.items():
        setattr(provider, field_map.get(field, field), value)

    try:
        if documents is not None:
            await replace_provider_documents(
                session,
                provider_id=provider.id,
                documents=documents,
            )
        if allowed_ips is not None:
            await replace_allowed_ips(
                session,
                provider_id=provider.id,
                ip_addresses=allowed_ips,
            )
        now = datetime.now(UTC)
        tenant = await session.get(Tenant, provider.tenant_id)
        organization = await session.get(Organization, provider.root_organization_id)

        if tenant is not None:
            tenant.name = provider.name
        if organization is not None:
            organization.name_en = provider.name
            organization.registration_number = provider.company_registration_number

        if is_direct_provider_update:
            if documents is not None:
                active_documents = list(
                    await session.scalars(
                        select(VTSProviderDocument).where(
                            VTSProviderDocument.provider_id == provider.id,
                            VTSProviderDocument.is_active.is_(True),
                        )
                    )
                )
                for document in active_documents:
                    document.status = ProviderDocumentStatus.VERIFIED
                    document.verified_by_id = None
                    document.verified_at = now
                    document.review_notes = (
                        "Updated directly by an approved VTS provider; "
                        "no additional approval required"
                    )
            if tenant is not None:
                tenant.status = TenantStatus.ACTIVE
            if organization is not None:
                organization.status = OrganizationStatus.ACTIVE
            audit_action = "vts_provider.profile_updated"
        else:
            provider.status = ProviderStatus.PENDING
            provider.submitted_at = now
            provider.reviewed_by_id = None
            provider.reviewed_at = None
            provider.review_notes = None
            if tenant is not None:
                tenant.status = TenantStatus.PENDING
            if organization is not None:
                organization.status = OrganizationStatus.PENDING
            audit_action = "vts_provider.application_updated"

        await write_audit_log(
            session,
            tenant_id=provider.tenant_id,
            actor_user_id=current_user.id,
            actor_organization_id=provider.root_organization_id,
            action=audit_action,
            resource_type="vts_provider",
            resource_public_id=provider.id,
            ip_address=request_ip(request),
            user_agent=request_agent(request),
            previous_values={"status": original_status.value},
            new_values={
                **payload.model_dump(exclude_unset=True, mode="json"),
                "status": provider.status.value,
                "approval_required": not is_direct_provider_update,
            },
        )
        await session.commit()
    except (ValueError, IntegrityError) as exc:
        await session.rollback()
        raise HTTPException(status_code=409, detail=str(exc)) from None

    await session.refresh(provider)
    return await build_provider_read(session, provider)


@router.post("/{provider_id}/review", response_model=ProviderApplicationRead)
async def review_provider_application(
    provider_id: uuid.UUID,
    payload: ProviderReview,
    request: Request,
    reviewer: Annotated[
        User,
        Depends(require_roles(UserRole.SUPER_ADMIN, UserRole.POLICE_ADMIN)),
    ],
    session: Annotated[AsyncSession, Depends(get_session)],
) -> ProviderApplicationRead:
    provider = await get_provider_by_id(session, provider_id)
    if provider is None:
        raise HTTPException(status_code=404, detail="VTS application not found")
    if provider.status == ProviderStatus.SUSPENDED:
        raise HTTPException(
            status_code=409,
            detail="A suspended provider must be handled separately",
        )

    tenant = await session.get(Tenant, provider.tenant_id)
    organization = await session.get(Organization, provider.root_organization_id)
    if tenant is None or organization is None:
        raise HTTPException(status_code=409, detail="Provider tenant or organization is missing")

    documents = list(
        await session.scalars(
            select(VTSProviderDocument).where(
                VTSProviderDocument.provider_id == provider.id,
                VTSProviderDocument.is_active.is_(True),
            )
        )
    )
    now = datetime.now(UTC)
    if payload.decision == ProviderReviewDecision.APPROVE:
        provider.status = ProviderStatus.APPROVED
        tenant.status = TenantStatus.ACTIVE
        organization.status = OrganizationStatus.ACTIVE
        document_status = ProviderDocumentStatus.VERIFIED
    elif payload.decision == ProviderReviewDecision.REJECT:
        provider.status = ProviderStatus.REJECTED
        tenant.status = TenantStatus.SUSPENDED
        organization.status = OrganizationStatus.SUSPENDED
        document_status = ProviderDocumentStatus.REJECTED
    else:
        provider.status = ProviderStatus.PENDING
        tenant.status = TenantStatus.PENDING
        organization.status = OrganizationStatus.PENDING
        document_status = ProviderDocumentStatus.PENDING

    for document in documents:
        document.status = document_status
        document.review_notes = payload.notes
        if document_status == ProviderDocumentStatus.VERIFIED:
            document.verified_by_id = reviewer.id
            document.verified_at = now
        else:
            document.verified_by_id = None
            document.verified_at = None

    provider.reviewed_by_id = reviewer.id
    provider.reviewed_at = now
    provider.review_notes = payload.notes
    await write_audit_log(
        session,
        tenant_id=provider.tenant_id,
        actor_user_id=reviewer.id,
        actor_organization_id=provider.root_organization_id,
        action=f"vts_provider.review_{payload.decision.value}",
        resource_type="vts_provider",
        resource_public_id=provider.id,
        ip_address=request_ip(request),
        user_agent=request_agent(request),
        new_values={
            "decision": payload.decision.value,
            "status": provider.status.value,
            "notes": payload.notes,
            "active_document_versions_reviewed": len(documents),
        },
    )
    await session.commit()
    await session.refresh(provider)
    return await build_provider_read(session, provider)
