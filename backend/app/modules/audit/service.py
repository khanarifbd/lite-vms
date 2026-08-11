import uuid

from sqlalchemy.ext.asyncio import AsyncSession

from app.modules.audit.model import AuditLog

SENSITIVE_KEYS = {"password", "hashed_password", "token", "secret", "api_key", "nid"}


def sanitize_audit_values(values: dict | None) -> dict | None:
    if values is None:
        return None
    return {
        key: "[REDACTED]" if any(item in key.lower() for item in SENSITIVE_KEYS) else value
        for key, value in values.items()
    }


async def apply_submission_automation(
    session: AsyncSession,
    *,
    action: str,
    resource_type: str,
    resource_public_id: uuid.UUID | None,
) -> None:
    """Re-evaluate the exact submitted entity after every relevant mutation.

    Keeping this hook in the audit path makes auto-approval reliable for initial
    submissions, resubmissions, profile corrections, and documents uploaded by a
    different staff member than the original submitter.
    """
    if resource_public_id is None:
        return

    # Lazy imports avoid coupling the audit module to domain services at import time.
    from app.modules.settings.service import (
        auto_approve_driver,
        auto_approve_owner,
        auto_approve_provider,
        auto_approve_vehicle,
    )

    if resource_type == "vts_provider" and action in {
        "vts_provider.application_submitted",
        "vts_provider.admin_created",
        "vts_provider.application_updated",
    }:
        from app.modules.providers.model import VTSProvider

        provider = await session.get(VTSProvider, resource_public_id)
        if provider is not None:
            await auto_approve_provider(session, provider)
        return

    if resource_type == "vehicle_owner" and action in {
        "vehicle_owner.self_registered",
        "vehicle_owner.provider_registered",
        "vehicle_owner.mobile_registered_by_provider",
        "vehicle_owner.profile_updated",
        "vehicle_owner.corrections_resubmitted",
        "vts_provider.linked_owner_updated",
    }:
        from app.modules.owners.model import VehicleOwner

        owner = await session.get(VehicleOwner, resource_public_id)
        if owner is not None:
            await auto_approve_owner(session, owner)
        return

    if resource_type == "vehicle_owner_document" and action in {
        "vehicle_owner.document_uploaded",
        "vehicle_owner.document_replaced",
    }:
        from app.modules.owners.model import VehicleOwner, VehicleOwnerDocument

        document = await session.get(VehicleOwnerDocument, resource_public_id)
        if document is not None:
            owner = await session.get(VehicleOwner, document.owner_id)
            if owner is not None:
                await auto_approve_owner(session, owner)
        return

    if resource_type == "vehicle" and action in {
        "vehicle.registration_submitted",
        "vehicle.registration_resubmitted",
        "vehicle.owner_registration_submitted",
        "vehicle.owner_registration_resubmitted",
    }:
        from app.modules.vehicles.model import Vehicle

        vehicle = await session.get(Vehicle, resource_public_id)
        if vehicle is not None:
            await auto_approve_vehicle(session, vehicle)
        return

    if resource_type == "vehicle_document" and action in {
        "vehicle.document_uploaded",
        "vehicle.document_replaced",
    }:
        from app.modules.documents.model import VehicleDocument
        from app.modules.vehicles.model import Vehicle

        document = await session.get(VehicleDocument, resource_public_id)
        if document is not None:
            vehicle = await session.get(Vehicle, document.vehicle_id)
            if vehicle is not None:
                await auto_approve_vehicle(session, vehicle)
        return

    if resource_type == "driver" and action in {
        "driver.application_submitted",
        "driver.application_resubmitted",
    }:
        from app.modules.drivers.model import Driver

        driver = await session.get(Driver, resource_public_id)
        if driver is not None:
            await auto_approve_driver(session, driver)


async def write_audit_log(
    session: AsyncSession,
    *,
    action: str,
    resource_type: str,
    actor_user_id: int | None = None,
    tenant_id: int | None = None,
    actor_organization_id: int | None = None,
    resource_public_id: uuid.UUID | None = None,
    request_id: str | None = None,
    ip_address: str | None = None,
    user_agent: str | None = None,
    previous_values: dict | None = None,
    new_values: dict | None = None,
    reason: str | None = None,
) -> AuditLog:
    await apply_submission_automation(
        session,
        action=action,
        resource_type=resource_type,
        resource_public_id=resource_public_id,
    )

    entry = AuditLog(
        tenant_id=tenant_id,
        actor_user_id=actor_user_id,
        actor_organization_id=actor_organization_id,
        action=action,
        resource_type=resource_type,
        resource_public_id=resource_public_id,
        request_id=request_id,
        ip_address=ip_address,
        user_agent=user_agent,
        previous_values=sanitize_audit_values(previous_values),
        new_values=sanitize_audit_values(new_values),
        reason=reason,
    )
    session.add(entry)
    await session.flush()
    return entry
