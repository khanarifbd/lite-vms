from datetime import UTC, date, datetime
from typing import Any

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.common.enums import (
    DocumentStatus,
    OrganizationStatus,
    OwnerDocumentStatus,
    OwnerType,
    OwnerVerificationStatus,
    ProviderDocumentStatus,
    ProviderStatus,
    TenantStatus,
    VehicleVerificationStatus,
)
from app.modules.audit.model import AuditLog
from app.modules.documents.model import VehicleDocument
from app.modules.drivers.enums import (
    DriverDocumentStatus,
    DriverLicenceStatus,
    DriverVerificationStatus,
)
from app.modules.drivers.model import Driver, DriverDocument, DriverLicence
from app.modules.iam.model import Organization, Tenant
from app.modules.owners.model import VehicleOwner, VehicleOwnerDocument
from app.modules.providers.model import VTSProvider, VTSProviderDocument
from app.modules.settings.schema import (
    ApprovalAutomationSettings,
    DocumentRequirement,
    MonitoringSettings,
    NotificationRuleSettings,
    SecuritySettings,
    SystemSettingsRead,
    VehicleCategorySetting,
)
from app.modules.vehicles.model import Vehicle

SETTINGS_ACTION = "system.settings_updated"

DEFAULT_DOCUMENT_REQUIREMENTS = [
    DocumentRequirement(code="btrc_license", label="BTRC licence", entity_type="provider"),
    DocumentRequirement(code="trade_license", label="Trade licence", entity_type="provider"),
    DocumentRequirement(code="national_id", label="National ID", entity_type="owner_individual"),
    DocumentRequirement(code="company_registration", label="Company registration", entity_type="owner_company"),
    DocumentRequirement(code="trade_license", label="Trade licence", entity_type="owner_company"),
    DocumentRequirement(code="registration", label="Registration certificate", entity_type="vehicle"),
    DocumentRequirement(code="fitness", label="Fitness certificate", entity_type="vehicle", expiry_required=True),
    DocumentRequirement(code="tax_token", label="Tax token", entity_type="vehicle", expiry_required=True),
    DocumentRequirement(code="insurance", label="Insurance", entity_type="vehicle", expiry_required=True),
    DocumentRequirement(code="route_permit", label="Route permit", entity_type="vehicle", required=False, expiry_required=True),
    DocumentRequirement(code="national_id_front", label="NID front", entity_type="driver"),
    DocumentRequirement(code="driving_licence_front", label="Driving licence front", entity_type="driver"),
    DocumentRequirement(code="driver_photo", label="Driver photograph", entity_type="driver"),
]

DEFAULT_VEHICLE_CATEGORIES = [
    VehicleCategorySetting(code="car", label="Car"),
    VehicleCategorySetting(code="microbus", label="Microbus"),
    VehicleCategorySetting(code="bus", label="Bus"),
    VehicleCategorySetting(code="truck", label="Truck"),
    VehicleCategorySetting(code="motorcycle", label="Motorcycle"),
    VehicleCategorySetting(code="cng", label="CNG / Auto-rickshaw"),
    VehicleCategorySetting(code="ambulance", label="Ambulance"),
    VehicleCategorySetting(code="other", label="Other"),
]


def default_payload() -> dict[str, Any]:
    return {
        "approval": ApprovalAutomationSettings().model_dump(),
        "notifications": NotificationRuleSettings().model_dump(),
        "monitoring": MonitoringSettings().model_dump(),
        "security": SecuritySettings().model_dump(),
        "document_requirements": [item.model_dump() for item in DEFAULT_DOCUMENT_REQUIREMENTS],
        "vehicle_categories": [item.model_dump() for item in DEFAULT_VEHICLE_CATEGORIES],
    }


def merge_document_requirements(items: list[dict[str, Any]]) -> list[dict[str, Any]]:
    merged = list(items)
    known = {
        (str(item.get("entity_type", "")), str(item.get("code", "")))
        for item in merged
    }
    for default in DEFAULT_DOCUMENT_REQUIREMENTS:
        key = (default.entity_type, default.code)
        if key not in known:
            merged.append(default.model_dump())
    return merged


async def latest_settings_event(session: AsyncSession) -> AuditLog | None:
    return await session.scalar(
        select(AuditLog)
        .where(
            AuditLog.action == SETTINGS_ACTION,
            AuditLog.resource_type == "system_configuration",
        )
        .order_by(AuditLog.created_at.desc(), AuditLog.id.desc())
        .limit(1)
    )


async def read_settings(session: AsyncSession) -> SystemSettingsRead:
    event = await latest_settings_event(session)
    payload = default_payload()
    if event is not None and event.new_values:
        payload.update(event.new_values)
    raw_requirements = merge_document_requirements(payload.get("document_requirements", []))
    return SystemSettingsRead(
        approval=ApprovalAutomationSettings.model_validate(payload.get("approval", {})),
        notifications=NotificationRuleSettings.model_validate(payload.get("notifications", {})),
        monitoring=MonitoringSettings.model_validate(payload.get("monitoring", {})),
        security=SecuritySettings.model_validate(payload.get("security", {})),
        document_requirements=[
            DocumentRequirement.model_validate(item) for item in raw_requirements
        ],
        vehicle_categories=[
            VehicleCategorySetting.model_validate(item)
            for item in payload.get("vehicle_categories", [])
        ],
        updated_at=event.created_at if event is not None else None,
    )


async def approval_settings(session: AsyncSession) -> ApprovalAutomationSettings:
    return (await read_settings(session)).approval


async def required_codes(session: AsyncSession, entity_type: str) -> set[str]:
    settings = await read_settings(session)
    return {
        item.code
        for item in settings.document_requirements
        if item.entity_type == entity_type and item.required
    }


def _requirements_for(
    settings: SystemSettingsRead,
    entity_type: str,
) -> list[DocumentRequirement]:
    return [
        item
        for item in settings.document_requirements
        if item.entity_type == entity_type and item.required
    ]


def _documents_complete(
    requirements: list[DocumentRequirement],
    documents: list[Any],
) -> bool:
    document_by_code = {
        str(getattr(getattr(document, "document_type", None), "value", "")): document
        for document in documents
    }
    today = date.today()
    for requirement in requirements:
        document = document_by_code.get(requirement.code)
        if document is None:
            return False
        if requirement.expiry_required:
            expires_at = getattr(document, "expires_at", None)
            if expires_at is None:
                return False
            expiry_date = expires_at.date() if isinstance(expires_at, datetime) else expires_at
            if expiry_date < today:
                return False
    return True


async def auto_approve_provider(session: AsyncSession, provider: VTSProvider) -> bool:
    if provider.status not in {ProviderStatus.PENDING, ProviderStatus.UNDER_REVIEW}:
        return False

    settings = await read_settings(session)
    if not settings.approval.provider_auto_approve:
        return False
    if not provider.declaration_accepted:
        return False

    documents = list(
        await session.scalars(
            select(VTSProviderDocument).where(
                VTSProviderDocument.provider_id == provider.id,
                VTSProviderDocument.is_active.is_(True),
            )
        )
    )
    if not _documents_complete(_requirements_for(settings, "provider"), documents):
        return False

    now = datetime.now(UTC)
    provider.status = ProviderStatus.APPROVED
    provider.reviewed_at = now
    provider.review_notes = "Automatically approved by system configuration"
    tenant = await session.get(Tenant, provider.tenant_id)
    organization = await session.get(Organization, provider.root_organization_id)
    if tenant is not None:
        tenant.status = TenantStatus.ACTIVE
    if organization is not None:
        organization.status = OrganizationStatus.ACTIVE
    if settings.approval.document_auto_verify:
        for document in documents:
            document.status = ProviderDocumentStatus.VERIFIED
            document.verified_at = now
            document.review_notes = "Automatically verified by system configuration"
    return True


async def auto_approve_owner(session: AsyncSession, owner: VehicleOwner) -> bool:
    if owner.verification_status not in {
        OwnerVerificationStatus.PENDING,
        OwnerVerificationStatus.UNDER_REVIEW,
    }:
        return False

    settings = await read_settings(session)
    if not settings.approval.owner_auto_approve:
        return False
    if not owner.declaration_accepted or not owner.address or not owner.district:
        return False
    if owner.district.strip().lower() == "pending":
        return False

    documents = list(
        await session.scalars(
            select(VehicleOwnerDocument).where(
                VehicleOwnerDocument.owner_id == owner.id,
                VehicleOwnerDocument.is_active.is_(True),
            )
        )
    )
    entity_type = (
        "owner_individual" if owner.owner_type == OwnerType.INDIVIDUAL else "owner_company"
    )
    if not _documents_complete(_requirements_for(settings, entity_type), documents):
        return False

    now = datetime.now(UTC)
    owner.verification_status = OwnerVerificationStatus.APPROVED
    owner.reviewed_at = now
    owner.review_notes = "Automatically approved by system configuration"
    if owner.tenant_id is not None:
        tenant = await session.get(Tenant, owner.tenant_id)
        if tenant is not None:
            tenant.status = TenantStatus.ACTIVE
    if owner.root_organization_id is not None:
        organization = await session.get(Organization, owner.root_organization_id)
        if organization is not None:
            organization.status = OrganizationStatus.ACTIVE
    if settings.approval.document_auto_verify:
        for document in documents:
            document.status = OwnerDocumentStatus.VERIFIED
            document.verified_at = now
            document.review_notes = "Automatically verified by system configuration"
    return True


async def auto_approve_vehicle(session: AsyncSession, vehicle: Vehicle) -> bool:
    """Verify a submitted vehicle immediately when vehicle auto-approval is enabled.

    Vehicle submission already validates its owner and required identity fields. Missing
    document uploads therefore do not keep the vehicle in the review queue when the
    administrator explicitly enables automatic vehicle approval. Any documents that are
    already present are marked valid only when document auto-verification is enabled.
    """
    if vehicle.verification_status not in {
        VehicleVerificationStatus.PENDING_VERIFICATION,
        VehicleVerificationStatus.UNDER_REVIEW,
    }:
        return False

    settings = await read_settings(session)
    if not settings.approval.vehicle_auto_approve:
        return False

    documents = list(
        await session.scalars(
            select(VehicleDocument).where(
                VehicleDocument.vehicle_id == vehicle.id,
                VehicleDocument.is_active.is_(True),
            )
        )
    )

    now = datetime.now(UTC)
    vehicle.verification_status = VehicleVerificationStatus.VERIFIED
    vehicle.reviewed_at = now
    vehicle.review_notes = "Automatically approved by system configuration"
    if settings.approval.document_auto_verify:
        for document in documents:
            document.status = DocumentStatus.VALID
            document.verified_at = now
            document.review_notes = "Automatically verified by system configuration"
    return True


async def auto_approve_driver(session: AsyncSession, driver: Driver) -> bool:
    if driver.verification_status not in {
        DriverVerificationStatus.PENDING,
        DriverVerificationStatus.UNDER_REVIEW,
    }:
        return False

    settings = await read_settings(session)
    if not settings.approval.driver_auto_approve:
        return False
    if (
        not driver.submitted_at
        or not driver.nid_reference
        or not driver.declaration_accepted
        or not driver.present_address
        or not driver.district
        or driver.district.strip().lower() == "pending"
    ):
        return False

    licence = await session.scalar(
        select(DriverLicence).where(DriverLicence.driver_id == driver.id)
    )
    if (
        licence is None
        or licence.expiry_date <= date.today()
        or not licence.vehicle_classes
        or licence.verification_status
        in {
            DriverLicenceStatus.EXPIRED,
            DriverLicenceStatus.SUSPENDED,
            DriverLicenceStatus.REVOKED,
            DriverLicenceStatus.REJECTED,
        }
    ):
        return False

    documents = list(
        await session.scalars(
            select(DriverDocument).where(
                DriverDocument.driver_id == driver.id,
                DriverDocument.is_active.is_(True),
            )
        )
    )
    if not _documents_complete(_requirements_for(settings, "driver"), documents):
        return False

    now = datetime.now(UTC)
    driver.verification_status = DriverVerificationStatus.VERIFIED
    driver.reviewed_at = now
    driver.review_notes = "Automatically approved by system configuration"
    licence.verification_status = DriverLicenceStatus.VERIFIED
    licence.verified_at = now
    licence.review_notes = "Automatically verified by system configuration"
    if settings.approval.document_auto_verify:
        for document in documents:
            document.status = DriverDocumentStatus.VERIFIED
            document.verified_at = now
            document.review_notes = "Automatically verified by system configuration"
    return True
