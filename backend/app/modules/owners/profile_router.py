import uuid
from datetime import UTC, datetime
from typing import Annotated

from fastapi import APIRouter, Depends, File, Form, HTTPException, Request, UploadFile, status
from fastapi.responses import FileResponse
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.common.enums import (
    OrganizationStatus,
    OwnerDocumentStatus,
    OwnerDocumentType,
    OwnerType,
    OwnerVerificationStatus,
    TenantStatus,
    UserRole,
)
from app.core.database import get_session
from app.modules.audit.service import write_audit_log
from app.modules.auth.dependencies import require_roles
from app.modules.auth.model import User
from app.modules.iam.model import Organization, Tenant
from app.modules.owners.model import VehicleOwner, VehicleOwnerDocument
from app.modules.owners.schema import (
    OwnerApplicationRead,
    OwnerApplicationUpdate,
    OwnerDocumentCreate,
    OwnerDocumentRead,
)
from app.modules.owners.service import (
    build_owner_read,
    get_owner_for_user,
    replace_owner_documents,
)
from app.modules.uploads.router import upload_document, upload_root

router = APIRouter(prefix="/owners/me", tags=["Vehicle Owner Profile"])


def request_ip(request: Request) -> str | None:
    return request.client.host if request.client else None


def request_agent(request: Request) -> str | None:
    return request.headers.get("user-agent")


def document_read(document: VehicleOwnerDocument) -> OwnerDocumentRead:
    return OwnerDocumentRead(
        id=document.id,
        document_type=document.document_type,
        document_reference=document.document_reference,
        storage_key=document.storage_key or document.file_url or "legacy/missing",
        file_url=document.file_url,
        file_name=document.file_name,
        content_type=document.content_type,
        size_bytes=document.size_bytes,
        expires_at=document.expires_at,
        status=document.status,
        version=document.version,
        is_active=document.is_active,
        replaced_by_id=document.replaced_by_id,
        verified_at=document.verified_at,
        review_notes=document.review_notes,
    )


async def my_owner(session: AsyncSession, actor: User) -> VehicleOwner:
    owner = await get_owner_for_user(session, actor.id)
    if owner is None:
        raise HTTPException(status_code=404, detail="Vehicle-owner application not found")
    return owner


async def active_owner_documents(
    session: AsyncSession,
    owner_id: uuid.UUID,
) -> list[VehicleOwnerDocument]:
    return list(
        await session.scalars(
            select(VehicleOwnerDocument)
            .where(
                VehicleOwnerDocument.owner_id == owner_id,
                VehicleOwnerDocument.is_active.is_(True),
            )
            .order_by(VehicleOwnerDocument.document_type, VehicleOwnerDocument.version.desc())
        )
    )


async def set_owner_scope_pending(session: AsyncSession, owner: VehicleOwner) -> None:
    if owner.tenant_id is not None:
        tenant = await session.get(Tenant, owner.tenant_id)
        if tenant is not None:
            tenant.status = TenantStatus.PENDING
    if owner.root_organization_id is not None:
        organization = await session.get(Organization, owner.root_organization_id)
        if organization is not None:
            organization.status = OrganizationStatus.PENDING


async def validate_resubmission(session: AsyncSession, owner: VehicleOwner) -> None:
    if not owner.name.strip():
        raise HTTPException(status_code=422, detail="Owner name is required")
    if not owner.address or not owner.address.strip():
        raise HTTPException(status_code=422, detail="Registered address is required")
    if not owner.district or not owner.district.strip():
        raise HTTPException(status_code=422, detail="District is required")
    if not owner.declaration_accepted:
        raise HTTPException(status_code=422, detail="The owner declaration must be accepted")

    documents = await active_owner_documents(session, owner.id)
    document_types = {document.document_type for document in documents}
    if owner.owner_type == OwnerType.INDIVIDUAL:
        if OwnerDocumentType.NATIONAL_ID not in document_types:
            raise HTTPException(
                status_code=422,
                detail="A National ID document is required before resubmission",
            )
    else:
        if not owner.trade_license_number:
            raise HTTPException(
                status_code=422,
                detail="Trade licence number is required before resubmission",
            )
        required = {
            OwnerDocumentType.COMPANY_REGISTRATION,
            OwnerDocumentType.TRADE_LICENSE,
        }
        if not required.issubset(document_types):
            raise HTTPException(
                status_code=422,
                detail=(
                    "Company registration and trade licence documents are required "
                    "before resubmission"
                ),
            )


@router.patch("/profile", response_model=OwnerApplicationRead)
async def update_my_owner_profile(
    payload: OwnerApplicationUpdate,
    request: Request,
    actor: Annotated[User, Depends(require_roles(UserRole.VEHICLE_OWNER))],
    session: Annotated[AsyncSession, Depends(get_session)],
) -> OwnerApplicationRead:
    owner = await my_owner(session, actor)
    if owner.verification_status == OwnerVerificationStatus.SUSPENDED:
        raise HTTPException(
            status_code=403,
            detail="A suspended owner profile cannot be edited",
        )

    changes = payload.model_dump(exclude_unset=True)
    if changes.pop("documents", None) is not None:
        raise HTTPException(
            status_code=422,
            detail="Use the owner document upload endpoint to replace documents",
        )
    if changes.get("declaration_accepted") is False:
        raise HTTPException(
            status_code=422,
            detail="The owner declaration cannot be withdrawn",
        )

    field_map = {"owner_name": "name", "registered_address": "address"}
    changed_fields: list[str] = []
    previous_status = owner.verification_status
    for field, value in changes.items():
        model_field = field_map.get(field, field)
        if getattr(owner, model_field) != value:
            setattr(owner, model_field, value)
            changed_fields.append(field)

    if owner.address is None or not owner.address.strip():
        raise HTTPException(status_code=422, detail="Registered address is required")
    if owner.district is None or not owner.district.strip():
        raise HTTPException(status_code=422, detail="District is required")
    if owner.owner_type == OwnerType.COMPANY and not owner.trade_license_number:
        raise HTTPException(status_code=422, detail="Trade licence number is required")

    if changed_fields and previous_status not in {
        OwnerVerificationStatus.CHANGES_REQUESTED,
        OwnerVerificationStatus.REJECTED,
    }:
        owner.verification_status = OwnerVerificationStatus.PENDING
        owner.reviewed_by_id = None
        owner.reviewed_at = None
        owner.submitted_at = datetime.now(UTC)
        await set_owner_scope_pending(session, owner)
        for document in await active_owner_documents(session, owner.id):
            document.status = OwnerDocumentStatus.PENDING
            document.verified_by_id = None
            document.verified_at = None

    await write_audit_log(
        session,
        tenant_id=owner.tenant_id,
        actor_user_id=actor.id,
        action="vehicle_owner.profile_updated",
        resource_type="vehicle_owner",
        resource_public_id=owner.id,
        ip_address=request_ip(request),
        user_agent=request_agent(request),
        previous_values={"verification_status": previous_status.value},
        new_values={
            "verification_status": owner.verification_status.value,
            "changed_fields": changed_fields,
        },
    )
    try:
        await session.commit()
    except IntegrityError as exc:
        await session.rollback()
        raise HTTPException(status_code=409, detail="Owner profile data already exists") from exc
    await session.refresh(owner)
    return await build_owner_read(session, owner)


@router.get("/documents", response_model=list[OwnerDocumentRead])
async def list_my_owner_documents(
    actor: Annotated[User, Depends(require_roles(UserRole.VEHICLE_OWNER))],
    session: Annotated[AsyncSession, Depends(get_session)],
) -> list[OwnerDocumentRead]:
    owner = await my_owner(session, actor)
    documents = list(
        await session.scalars(
            select(VehicleOwnerDocument)
            .where(VehicleOwnerDocument.owner_id == owner.id)
            .order_by(
                VehicleOwnerDocument.document_type,
                VehicleOwnerDocument.is_active.desc(),
                VehicleOwnerDocument.version.desc(),
            )
        )
    )
    return [document_read(document) for document in documents]


@router.post(
    "/documents",
    response_model=OwnerDocumentRead,
    status_code=status.HTTP_201_CREATED,
)
async def upload_my_owner_document(
    request: Request,
    actor: Annotated[User, Depends(require_roles(UserRole.VEHICLE_OWNER))],
    session: Annotated[AsyncSession, Depends(get_session)],
    document_type: Annotated[OwnerDocumentType, Form()],
    file: UploadFile = File(...),
    document_reference: Annotated[str | None, Form(max_length=160)] = None,
    expires_at: Annotated[datetime | None, Form()] = None,
) -> OwnerDocumentRead:
    owner = await my_owner(session, actor)
    if owner.verification_status == OwnerVerificationStatus.SUSPENDED:
        raise HTTPException(
            status_code=403,
            detail="A suspended owner profile cannot replace documents",
        )

    uploaded = await upload_document(actor=actor, file=file)
    payload = OwnerDocumentCreate(
        document_type=document_type,
        document_reference=document_reference,
        storage_key=uploaded.storage_key,
        file_name=uploaded.original_file_name,
        content_type=uploaded.content_type,
        size_bytes=uploaded.size_bytes,
        expires_at=expires_at,
    )
    previous_status = owner.verification_status
    await replace_owner_documents(session, owner_id=owner.id, documents=[payload])

    if previous_status not in {
        OwnerVerificationStatus.CHANGES_REQUESTED,
        OwnerVerificationStatus.REJECTED,
    }:
        owner.verification_status = OwnerVerificationStatus.PENDING
        owner.reviewed_by_id = None
        owner.reviewed_at = None
        owner.submitted_at = datetime.now(UTC)
        await set_owner_scope_pending(session, owner)

    latest = await session.scalar(
        select(VehicleOwnerDocument)
        .where(
            VehicleOwnerDocument.owner_id == owner.id,
            VehicleOwnerDocument.document_type == document_type,
            VehicleOwnerDocument.is_active.is_(True),
        )
        .order_by(VehicleOwnerDocument.version.desc())
    )
    if latest is None:
        await session.rollback()
        raise HTTPException(status_code=500, detail="Document replacement was not recorded")

    await write_audit_log(
        session,
        tenant_id=owner.tenant_id,
        actor_user_id=actor.id,
        action="vehicle_owner.document_replaced",
        resource_type="vehicle_owner_document",
        resource_public_id=latest.id,
        ip_address=request_ip(request),
        user_agent=request_agent(request),
        previous_values={"verification_status": previous_status.value},
        new_values={
            "owner_id": str(owner.id),
            "document_type": document_type.value,
            "version": latest.version,
            "verification_status": owner.verification_status.value,
        },
    )
    await session.commit()
    await session.refresh(latest)
    return document_read(latest)


@router.get("/documents/{document_id}/download", response_class=FileResponse)
async def download_my_owner_document(
    document_id: uuid.UUID,
    actor: Annotated[User, Depends(require_roles(UserRole.VEHICLE_OWNER))],
    session: Annotated[AsyncSession, Depends(get_session)],
) -> FileResponse:
    owner = await my_owner(session, actor)
    document = await session.get(VehicleOwnerDocument, document_id)
    if document is None or document.owner_id != owner.id:
        raise HTTPException(status_code=404, detail="Owner document not found")
    if not document.storage_key:
        raise HTTPException(status_code=404, detail="Owner document file is unavailable")

    root = upload_root()
    target = (root / document.storage_key).resolve()
    try:
        target.relative_to(root)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail="Invalid document storage key") from exc
    if not target.is_file():
        raise HTTPException(status_code=404, detail="Owner document file is unavailable")

    return FileResponse(
        target,
        media_type=document.content_type,
        filename=document.file_name or f"{document.document_type.value}-v{document.version}",
    )


@router.post("/resubmit", response_model=OwnerApplicationRead)
async def resubmit_my_owner_profile(
    request: Request,
    actor: Annotated[User, Depends(require_roles(UserRole.VEHICLE_OWNER))],
    session: Annotated[AsyncSession, Depends(get_session)],
) -> OwnerApplicationRead:
    owner = await my_owner(session, actor)
    if owner.verification_status not in {
        OwnerVerificationStatus.CHANGES_REQUESTED,
        OwnerVerificationStatus.REJECTED,
    }:
        raise HTTPException(
            status_code=409,
            detail="This owner profile is not awaiting correction and resubmission",
        )

    await validate_resubmission(session, owner)
    previous_status = owner.verification_status
    now = datetime.now(UTC)
    owner.verification_status = OwnerVerificationStatus.PENDING
    owner.submitted_at = now
    owner.reviewed_by_id = None
    owner.reviewed_at = None
    await set_owner_scope_pending(session, owner)

    for document in await active_owner_documents(session, owner.id):
        document.status = OwnerDocumentStatus.PENDING
        document.verified_by_id = None
        document.verified_at = None

    await write_audit_log(
        session,
        tenant_id=owner.tenant_id,
        actor_user_id=actor.id,
        action="vehicle_owner.corrections_resubmitted",
        resource_type="vehicle_owner",
        resource_public_id=owner.id,
        ip_address=request_ip(request),
        user_agent=request_agent(request),
        previous_values={"verification_status": previous_status.value},
        new_values={
            "verification_status": owner.verification_status.value,
            "submitted_at": now.isoformat(),
        },
    )
    await session.commit()
    await session.refresh(owner)
    return await build_owner_read(session, owner)
