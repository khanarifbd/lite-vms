from datetime import UTC, datetime, timedelta

from sqlalchemy import or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.common.enums import DocumentStatus, DocumentType, TrackingAssignmentStatus, UserRole
from app.modules.assignments.model import DriverAssignment
from app.modules.auth.model import User
from app.modules.documents.model import VehicleDocument
from app.modules.drivers.enums import DriverAssignmentStatus
from app.modules.drivers.model import Driver, DriverLicence
from app.modules.owners.access_service import has_active_provider_vehicle_access
from app.modules.owners.model import VehicleOwner
from app.modules.owners.service import user_can_access_owner
from app.modules.providers.model import VTSProvider
from app.modules.providers.service import get_provider_for_user
from app.modules.qr_verification.model import VehicleQRToken
from app.modules.telemetry.model import TelemetryPoint
from app.modules.tracking.model import TelemetrySource, TrackingDevice, VehicleDeviceAssignment
from app.modules.vehicles.model import Vehicle
from app.modules.vehicles.schema import (
    VehicleDocumentSummary,
    VehicleOwnerSummary,
    VehicleRead,
)


def can_manage_all_vehicles(user: User) -> bool:
    roles = set(getattr(user, "_role_codes", set()))
    return bool(
        roles.intersection(
            {
                UserRole.SUPER_ADMIN.value,
                UserRole.POLICE_ADMIN.value,
                UserRole.POLICE_OFFICER.value,
            }
        )
    )


async def user_can_access_vehicle(
    session: AsyncSession,
    *,
    user: User,
    vehicle: Vehicle,
) -> bool:
    if can_manage_all_vehicles(user):
        return True
    owner = await session.get(VehicleOwner, vehicle.owner_id)
    if owner is None:
        return False
    if await user_can_access_owner(session, user_id=user.id, owner=owner):
        return True
    provider = await get_provider_for_user(session, user.id)
    if provider is None:
        return False
    return await has_active_provider_vehicle_access(
        session,
        provider_id=provider.id,
        owner_id=owner.id,
        vehicle_id=vehicle.id,
    )


def document_status_for(
    documents: list[VehicleDocument], document_type: DocumentType
) -> DocumentStatus | None:
    document = next(
        (
            item
            for item in documents
            if item.document_type == document_type and item.is_active
        ),
        None,
    )
    return document.status if document else None


async def build_vehicle_read(session: AsyncSession, vehicle: Vehicle) -> VehicleRead:
    qr_token = await session.scalar(
        select(VehicleQRToken.token).where(VehicleQRToken.vehicle_id == vehicle.id)
    )
    owner = await session.get(VehicleOwner, vehicle.owner_id)
    if owner is None:
        raise RuntimeError("Vehicle owner relationship is missing")
    created_by_provider = (
        await session.get(VTSProvider, vehicle.created_by_provider_id)
        if vehicle.created_by_provider_id
        else None
    )
    documents = list(
        await session.scalars(
            select(VehicleDocument)
            .where(
                VehicleDocument.vehicle_id == vehicle.id,
                or_(
                    VehicleDocument.is_active.is_(True),
                    VehicleDocument.status == DocumentStatus.PENDING_VERIFICATION,
                ),
            )
            .order_by(VehicleDocument.document_type, VehicleDocument.version.desc())
        )
    )
    tracking_assignment = await session.scalar(
        select(VehicleDeviceAssignment)
        .where(
            VehicleDeviceAssignment.vehicle_id == vehicle.id,
            VehicleDeviceAssignment.status.in_(
                [
                    TrackingAssignmentStatus.PENDING_PROVIDER_CONFIRMATION,
                    TrackingAssignmentStatus.TESTING,
                    TrackingAssignmentStatus.ACTIVE,
                ]
            ),
            VehicleDeviceAssignment.is_primary.is_(True),
        )
        .order_by(VehicleDeviceAssignment.valid_from.desc())
    )
    source = (
        await session.get(TelemetrySource, tracking_assignment.source_id)
        if tracking_assignment
        else None
    )
    device = (
        await session.get(TrackingDevice, tracking_assignment.device_id)
        if tracking_assignment
        else None
    )
    provider = (
        await session.get(VTSProvider, tracking_assignment.provider_id)
        if tracking_assignment and tracking_assignment.provider_id
        else None
    )

    driver_assignment = await session.scalar(
        select(DriverAssignment)
        .where(
            DriverAssignment.vehicle_id == vehicle.id,
            DriverAssignment.status == DriverAssignmentStatus.ACTIVE,
            DriverAssignment.is_on_duty.is_(True),
        )
        .order_by(DriverAssignment.valid_from.desc())
    )
    driver = (
        await session.get(Driver, driver_assignment.driver_id)
        if driver_assignment
        else None
    )
    licence = (
        await session.scalar(
            select(DriverLicence).where(DriverLicence.driver_id == driver.id)
        )
        if driver
        else None
    )
    latest_point = await session.scalar(
        select(TelemetryPoint)
        .where(TelemetryPoint.vehicle_id == vehicle.id)
        .order_by(TelemetryPoint.recorded_at.desc())
        .limit(1)
    )
    tracking_last_seen = device.last_seen_at if device else vehicle.last_recorded_at
    if tracking_last_seen and tracking_last_seen.tzinfo is None:
        tracking_last_seen = tracking_last_seen.replace(tzinfo=UTC)
    gps_online = bool(
        tracking_last_seen
        and tracking_last_seen >= datetime.now(UTC) - timedelta(minutes=5)
    )

    return VehicleRead(
        id=vehicle.id,
        registration_number=vehicle.registration_number,
        registration_number_display=vehicle.registration_number_display,
        chassis_number=vehicle.chassis_number,
        engine_number=vehicle.engine_number,
        vehicle_type=vehicle.vehicle_type,
        vehicle_category=vehicle.vehicle_category,
        usage_type=vehicle.usage_type,
        body_type=vehicle.body_type,
        fuel_type=vehicle.fuel_type,
        brand=vehicle.brand,
        model=vehicle.model,
        manufacturing_year=vehicle.manufacturing_year,
        registration_date=vehicle.registration_date,
        registration_authority=vehicle.registration_authority,
        engine_capacity_cc=vehicle.engine_capacity_cc,
        axle_count=vehicle.axle_count,
        gross_vehicle_weight_kg=vehicle.gross_vehicle_weight_kg,
        color=vehicle.color,
        seating_capacity=vehicle.seating_capacity,
        load_capacity_kg=vehicle.load_capacity_kg,
        vehicle_photo_storage_key=vehicle.vehicle_photo_storage_key,
        front_photo_storage_key=vehicle.front_photo_storage_key,
        back_photo_storage_key=vehicle.back_photo_storage_key,
        registration_certificate_storage_key=vehicle.registration_certificate_storage_key,
        fitness_expiry_date=vehicle.fitness_expiry_date,
        tax_token_expiry_date=vehicle.tax_token_expiry_date,
        insurance_expiry_date=vehicle.insurance_expiry_date,
        route_permit_number=vehicle.route_permit_number,
        route_permit_area=vehicle.route_permit_area,
        route_permit_expiry_date=vehicle.route_permit_expiry_date,
        notes=vehicle.notes,
        owner_id=vehicle.owner_id,
        owner=VehicleOwnerSummary(
            id=owner.id,
            owner_code=owner.owner_code,
            owner_name=owner.name,
            phone=owner.phone,
            email=owner.email,
        ),
        created_by_provider_id=vehicle.created_by_provider_id,
        created_by_provider_name=(
            created_by_provider.name if created_by_provider else None
        ),
        default_speed_limit_kph=vehicle.default_speed_limit_kph,
        latest_latitude=vehicle.latest_latitude,
        latest_longitude=vehicle.latest_longitude,
        latest_speed_kph=vehicle.latest_speed_kph,
        last_recorded_at=vehicle.last_recorded_at,
        gps_online=gps_online,
        tracking_last_seen_at=tracking_last_seen,
        latest_heading=latest_point.heading if latest_point else None,
        latest_ignition=latest_point.ignition if latest_point else None,
        verification_status=vehicle.verification_status,
        review_notes=vehicle.review_notes,
        status=vehicle.status,
        documents=[
            VehicleDocumentSummary(
                id=document.id,
                document_type=document.document_type,
                document_number=document.document_number,
                issued_at=document.issued_at,
                expires_at=document.expires_at,
                status=document.status,
                storage_key=document.storage_key,
                file_name=document.file_name,
                version=document.version,
                is_active=document.is_active,
                review_notes=document.review_notes,
            )
            for document in documents
        ],
        fitness_status=document_status_for(documents, DocumentType.FITNESS),
        tax_token_status=document_status_for(documents, DocumentType.TAX_TOKEN),
        insurance_status=document_status_for(documents, DocumentType.INSURANCE),
        route_permit_status=document_status_for(documents, DocumentType.ROUTE_PERMIT),
        active_assignment_id=(
            tracking_assignment.id
            if tracking_assignment
            and tracking_assignment.status == TrackingAssignmentStatus.ACTIVE
            else None
        ),
        tracking_assignment_id=(tracking_assignment.id if tracking_assignment else None),
        tracking_assignment_status=(
            tracking_assignment.status if tracking_assignment else None
        ),
        tracking_source_type=source.source_type if source else None,
        tracking_source_code=source.code if source else None,
        tracking_provider_id=(
            tracking_assignment.provider_id if tracking_assignment else None
        ),
        tracking_provider_name=provider.name if provider else None,
        tracking_device_id=device.id if device else None,
        tracking_device_identifier=device.device_identifier if device else None,
        tracking_device_operational_status=(device.operational_status if device else None),
        current_driver_assignment_id=(
            driver_assignment.id if driver_assignment else None
        ),
        current_driver_assignment_status=(
            driver_assignment.status if driver_assignment else None
        ),
        current_driver_id=driver.id if driver else None,
        current_driver_name=driver.full_name if driver else None,
        current_driver_mobile=driver.phone if driver else None,
        current_driver_licence_number=licence.licence_number if licence else None,
        current_driver_licence_status=(licence.verification_status if licence else None),
        current_driver_licence_expiry=licence.expiry_date if licence else None,
        qr_token=qr_token,
        created_at=vehicle.created_at,
        updated_at=vehicle.updated_at,
    )
