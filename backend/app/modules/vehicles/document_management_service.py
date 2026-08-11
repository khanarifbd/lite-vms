import secrets
import uuid
from datetime import UTC, date, datetime, timedelta
from pathlib import Path

from fastapi import HTTPException, UploadFile
from fastapi.responses import FileResponse
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.common.enums import DocumentStatus, DocumentType
from app.core.config import settings
from app.modules.audit.service import write_audit_log
from app.modules.auth.model import User
from app.modules.documents.model import VehicleDocument
from app.modules.uploads.router import safe_extension, upload_root
from app.modules.vehicles.model import Vehicle
from app.modules.settings.service import approval_settings
from app.modules.vehicles.provider_document_schema import (
    DocumentExpiryStatus,
    ProviderVehicleDocumentPage,
    ProviderVehicleDocumentRead,
)


def expiry_status_for(expires_at: date | None) -> DocumentExpiryStatus:
    if expires_at is None:
        return DocumentExpiryStatus.NOT_APPLICABLE
    today = date.today()
    if expires_at < today:
        return DocumentExpiryStatus.EXPIRED
    if expires_at <= today + timedelta(days=30):
        return DocumentExpiryStatus.EXPIRING_SOON
    return DocumentExpiryStatus.VALID


def document_read(
    document: VehicleDocument,
    *,
    route_scope: str,
) -> ProviderVehicleDocumentRead:
    expiry_status = expiry_status_for(document.expires_at)
    effective_status = (
        DocumentStatus.EXPIRED
        if expiry_status == DocumentExpiryStatus.EXPIRED
        else document.status
    )
    return ProviderVehicleDocumentRead(
        id=document.id,
        vehicle_id=document.vehicle_id,
        document_type=document.document_type,
        document_number=document.document_number,
        issued_at=document.issued_at,
        expires_at=document.expires_at,
        verification_status=document.status,
        effective_status=effective_status,
        expiry_status=expiry_status,
        source=document.source,
        file_name=document.file_name,
        content_type=document.content_type,
        size_bytes=document.size_bytes,
        version=document.version,
        is_active=document.is_active,
        replaced_by_id=document.replaced_by_id,
        verified_at=document.verified_at,
        review_notes=document.review_notes,
        download_url=(
            f"{settings.api_v1_prefix}/vehicles/{route_scope}/"
            f"{document.vehicle_id}/documents/{document.id}/download"
        ),
        created_at=document.created_at,
        updated_at=document.updated_at,
    )


def sync_vehicle_document_fields(
    vehicle: Vehicle,
    *,
    document_type: DocumentType,
    storage_key: str | None,
    document_number: str | None,
    expires_at: date | None,
) -> None:
    if document_type == DocumentType.REGISTRATION:
        vehicle.registration_certificate_storage_key = storage_key
    elif document_type == DocumentType.FITNESS:
        vehicle.fitness_expiry_date = expires_at
    elif document_type == DocumentType.TAX_TOKEN:
        vehicle.tax_token_expiry_date = expires_at
    elif document_type == DocumentType.INSURANCE:
        vehicle.insurance_expiry_date = expires_at
    elif document_type == DocumentType.ROUTE_PERMIT:
        vehicle.route_permit_expiry_date = expires_at
        vehicle.route_permit_number = document_number


def clear_vehicle_document_fields(
    vehicle: Vehicle,
    *,
    document_type: DocumentType,
) -> None:
    sync_vehicle_document_fields(
        vehicle,
        document_type=document_type,
        storage_key=None,
        document_number=None,
        expires_at=None,
    )


async def save_upload(file: UploadFile) -> tuple[str, str, str, int, Path]:
    content_type = (file.content_type or "application/octet-stream").lower()
    if content_type not in settings.upload_allowed_content_types:
        raise HTTPException(status_code=415, detail="Unsupported document content type")

    original_name = Path(file.filename or "document").name
    storage_key = f"documents/{secrets.token_hex(16)}{safe_extension(original_name)}"
    destination = upload_root() / storage_key
    destination.parent.mkdir(parents=True, exist_ok=True)

    size = 0
    try:
        with destination.open("wb") as output:
            while chunk := await file.read(1024 * 1024):
                size += len(chunk)
                if size > settings.upload_max_bytes:
                    raise HTTPException(
                        status_code=413,
                        detail="Document exceeds upload size limit",
                    )
                output.write(chunk)
    except Exception:
        destination.unlink(missing_ok=True)
        raise
    finally:
        await file.close()

    return storage_key, original_name, content_type, size, destination


async def list_vehicle_documents(
    session: AsyncSession,
    *,
    vehicle_id: uuid.UUID,
    include_history: bool,
    route_scope: str,
) -> ProviderVehicleDocumentPage:
    query = select(VehicleDocument).where(VehicleDocument.vehicle_id == vehicle_id)
    if not include_history:
        query = query.where(
            (VehicleDocument.is_active.is_(True))
            | (VehicleDocument.status == DocumentStatus.PENDING_VERIFICATION)
        )
    documents = list(
        await session.scalars(
            query.order_by(
                VehicleDocument.document_type,
                VehicleDocument.version.desc(),
            )
        )
    )
    active_count = int(
        await session.scalar(
            select(func.count(VehicleDocument.id)).where(
                VehicleDocument.vehicle_id == vehicle_id,
                VehicleDocument.is_active.is_(True),
            )
        )
        or 0
    )
    return ProviderVehicleDocumentPage(
        items=[document_read(document, route_scope=route_scope) for document in documents],
        total=len(documents),
        active_count=active_count,
        history_count=max(0, len(documents) - active_count),
    )


async def upload_vehicle_document(
    session: AsyncSession,
    *,
    vehicle: Vehicle,
    actor: User,
    tenant_id: int | None,
    actor_organization_id: int | None,
    source: str,
    route_scope: str,
    document_type: DocumentType,
    file: UploadFile,
    document_number: str | None,
    issued_at: date | None,
    expires_at: date | None,
) -> ProviderVehicleDocumentRead:
    latest = await session.scalar(
        select(VehicleDocument)
        .where(
            VehicleDocument.vehicle_id == vehicle.id,
            VehicleDocument.document_type == document_type,
        )
        .order_by(VehicleDocument.version.desc())
    )
    current = await session.scalar(
        select(VehicleDocument)
        .where(
            VehicleDocument.vehicle_id == vehicle.id,
            VehicleDocument.document_type == document_type,
            VehicleDocument.is_active.is_(True),
            VehicleDocument.status.notin_(
                [
                    DocumentStatus.PENDING_VERIFICATION,
                    DocumentStatus.REVOKED,
                ]
            ),
        )
        .order_by(VehicleDocument.version.desc())
    )
    existing_pending = await session.scalar(
        select(VehicleDocument)
        .where(
            VehicleDocument.vehicle_id == vehicle.id,
            VehicleDocument.document_type == document_type,
            VehicleDocument.status == DocumentStatus.PENDING_VERIFICATION,
        )
        .order_by(VehicleDocument.version.desc())
    )

    # Recover the valid predecessor for documents uploaded before staged replacement
    # was introduced, where the pending replacement may already be marked active.
    if current is None and existing_pending is not None:
        predecessor = await session.scalar(
            select(VehicleDocument)
            .where(VehicleDocument.replaced_by_id == existing_pending.id)
            .order_by(VehicleDocument.version.desc())
        )
        if predecessor is not None and predecessor.status not in {
            DocumentStatus.PENDING_VERIFICATION,
            DocumentStatus.REVOKED,
        }:
            predecessor.is_active = True
            predecessor.replaced_by_id = None
            current = predecessor

    if existing_pending is not None:
        existing_pending.status = DocumentStatus.REVOKED
        existing_pending.is_active = False
        existing_pending.review_notes = "Superseded by a newer document upload."
        if current is not None and current.replaced_by_id == existing_pending.id:
            current.replaced_by_id = None

    version = latest.version + 1 if latest else 1
    document_auto_verify = (await approval_settings(session)).document_auto_verify
    document_status = (
        DocumentStatus.VALID if document_auto_verify else DocumentStatus.PENDING_VERIFICATION
    )
    verified_at = datetime.now(UTC) if document_auto_verify else None
    storage_key, file_name, content_type, size_bytes, destination = await save_upload(file)
    document = VehicleDocument(
        vehicle_id=vehicle.id,
        document_type=document_type,
        document_number=document_number.strip() if document_number else None,
        issued_at=issued_at,
        expires_at=expires_at,
        status=document_status,
        source=source,
        storage_key=storage_key,
        file_name=file_name,
        content_type=content_type,
        size_bytes=size_bytes,
        version=version,
        # With document auto-approval enabled, the uploaded version becomes current
        # immediately. Otherwise replacements remain staged for review.
        is_active=document_auto_verify or current is None,
        verified_by_user_id=actor.id if document_auto_verify else None,
        verified_at=verified_at,
        review_notes=(
            "Automatically verified by system configuration"
            if document_auto_verify
            else None
        ),
    )
    session.add(document)
    try:
        await session.flush()
        if current is not None:
            current.replaced_by_id = document.id
            if document_auto_verify:
                current.is_active = False
        if document_auto_verify:
            sync_vehicle_document_fields(
                vehicle,
                document_type=document_type,
                storage_key=storage_key,
                document_number=document_number,
                expires_at=expires_at,
            )
        await write_audit_log(
            session,
            tenant_id=tenant_id,
            actor_user_id=actor.id,
            actor_organization_id=actor_organization_id,
            action=(
                "vehicle.document_replaced"
                if current is not None
                else "vehicle.document_uploaded"
            ),
            resource_type="vehicle_document",
            resource_public_id=document.id,
            new_values={
                "vehicle_id": str(vehicle.id),
                "document_type": document_type.value,
                "version": version,
                "source": source,
                "replaced_document_id": str(current.id) if current else None,
                "expires_at": expires_at.isoformat() if expires_at else None,
                "verification_status": document_status.value,
                "vehicle_verification_status": vehicle.verification_status.value,
                "staged_replacement": current is not None and not document_auto_verify,
            },
        )
        await session.commit()
    except Exception:
        await session.rollback()
        destination.unlink(missing_ok=True)
        raise

    await session.refresh(document)
    return document_read(document, route_scope=route_scope)


def vehicle_document_file_response(document: VehicleDocument) -> FileResponse:
    if not document.storage_key:
        raise HTTPException(status_code=404, detail="Document file is unavailable")

    root = upload_root().resolve()
    target = (root / document.storage_key).resolve()
    try:
        target.relative_to(root)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail="Invalid document storage key") from exc
    if not target.is_file():
        raise HTTPException(status_code=404, detail="Document file not found")

    return FileResponse(
        target,
        media_type=document.content_type or "application/octet-stream",
        filename=document.file_name or target.name,
    )
