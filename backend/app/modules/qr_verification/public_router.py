from datetime import UTC, date, datetime, timedelta

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.common.enums import DocumentStatus, TrackingAssignmentStatus
from app.core.database import get_session
from app.modules.assignments.model import DriverAssignment
from app.modules.documents.model import VehicleDocument
from app.modules.drivers.enums import DriverAssignmentStatus
from app.modules.drivers.model import Driver, DriverLicence
from app.modules.owners.model import VehicleOwner
from app.modules.providers.model import VTSProvider
from app.modules.qr_verification.model import VehicleQRToken
from app.modules.qr_verification.schema import (
    PublicQRDocumentSummary,
    PublicQRDriverSummary,
    PublicCertificateVerification,
    PublicVehicleQRVerification,
)
from app.modules.tracking.model import VehicleDeviceAssignment
from app.modules.vehicles.model import Vehicle

router = APIRouter(prefix="/public/qr", tags=["Public QR verification"])


@router.get("/certificates/{certificate_number}", response_model=PublicCertificateVerification)
async def verify_public_certificate(
    certificate_number: str,
    session: AsyncSession = Depends(get_session),
) -> PublicCertificateVerification:
    vehicle = await session.scalar(
        select(Vehicle).where(Vehicle.certificate_number == certificate_number)
    )
    if vehicle is None or not vehicle.certificate_number:
        raise HTTPException(status_code=404, detail="Certificate was not found")

    owner = await session.get(VehicleOwner, vehicle.owner_id)
    expires_at = vehicle.certificate_expires_at

    tracking_assignment = await session.scalar(
        select(VehicleDeviceAssignment)
        .where(
            VehicleDeviceAssignment.vehicle_id == vehicle.id,
            VehicleDeviceAssignment.status == TrackingAssignmentStatus.ACTIVE,
            VehicleDeviceAssignment.valid_to.is_(None),
        )
        .order_by(
            VehicleDeviceAssignment.is_primary.desc(),
            VehicleDeviceAssignment.valid_from.desc(),
        )
    )
    provider_id = (
        tracking_assignment.provider_id
        if tracking_assignment and tracking_assignment.provider_id
        else vehicle.created_by_provider_id
    )
    provider = await session.get(VTSProvider, provider_id) if provider_id else None

    last_signal_at = vehicle.last_received_at or vehicle.last_recorded_at
    if last_signal_at and last_signal_at.tzinfo is None:
        last_signal_at = last_signal_at.replace(tzinfo=UTC)
    gps_online = bool(
        last_signal_at and last_signal_at >= datetime.now(UTC) - timedelta(minutes=5)
    )

    return PublicCertificateVerification(
        valid=bool(expires_at and expires_at >= date.today()),
        certificate_number=vehicle.certificate_number,
        issued_at=vehicle.certificate_issued_at,
        expires_at=expires_at,
        vts_installation_date=vehicle.vts_installation_date,
        owner_name=owner.name if owner else "Owner not recorded",
        registration_number=vehicle.registration_number_display or vehicle.registration_number,
        registration_date=vehicle.registration_date,
        registration_authority=vehicle.registration_authority,
        vehicle_type=vehicle.vehicle_type,
        vehicle_category=vehicle.vehicle_category,
        brand=vehicle.brand,
        model=vehicle.model,
        color=vehicle.color,
        manufacturing_year=vehicle.manufacturing_year,
        chassis_number=vehicle.chassis_number,
        engine_number=vehicle.engine_number,
        vehicle_verification_status=vehicle.verification_status.value,
        vehicle_status=vehicle.status.value,
        provider_name=provider.name if provider else "No VTS provider connected",
        provider_code=provider.code if provider else None,
        btrc_license_number=provider.license_number if provider else None,
        provider_status=provider.status.value if provider else None,
        gps_online=gps_online,
        last_signal_at=last_signal_at,
    )


@router.get("/verify/{token}", response_model=PublicVehicleQRVerification)
async def verify_public_vehicle_qr(
    token: str,
    session: AsyncSession = Depends(get_session),
) -> PublicVehicleQRVerification:
    qr_token = await session.scalar(
        select(VehicleQRToken).where(
            VehicleQRToken.token == token,
            VehicleQRToken.is_active.is_(True),
        )
    )
    if qr_token is None:
        raise HTTPException(status_code=404, detail="Vehicle QR code is invalid or inactive")

    vehicle = await session.get(Vehicle, qr_token.vehicle_id)
    if vehicle is None:
        raise HTTPException(status_code=404, detail="Vehicle record was not found")

    owner = await session.get(VehicleOwner, vehicle.owner_id)

    tracking_assignment = await session.scalar(
        select(VehicleDeviceAssignment)
        .where(
            VehicleDeviceAssignment.vehicle_id == vehicle.id,
            VehicleDeviceAssignment.status == TrackingAssignmentStatus.ACTIVE,
            VehicleDeviceAssignment.valid_to.is_(None),
        )
        .order_by(
            VehicleDeviceAssignment.is_primary.desc(),
            VehicleDeviceAssignment.valid_from.desc(),
        )
    )
    provider_id = (
        tracking_assignment.provider_id
        if tracking_assignment and tracking_assignment.provider_id
        else vehicle.created_by_provider_id
    )
    provider = await session.get(VTSProvider, provider_id) if provider_id else None

    driver_assignment = await session.scalar(
        select(DriverAssignment)
        .where(
            DriverAssignment.vehicle_id == vehicle.id,
            DriverAssignment.status == DriverAssignmentStatus.ACTIVE,
        )
        .order_by(
            DriverAssignment.is_on_duty.desc(),
            DriverAssignment.valid_from.desc(),
        )
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

    documents = list(
        await session.scalars(
            select(VehicleDocument)
            .where(
                VehicleDocument.vehicle_id == vehicle.id,
                VehicleDocument.is_active.is_(True),
                VehicleDocument.status.in_(
                    [DocumentStatus.VALID, DocumentStatus.EXPIRED]
                ),
            )
            .order_by(VehicleDocument.document_type)
        )
    )

    last_signal_at = vehicle.last_received_at or vehicle.last_recorded_at
    if last_signal_at and last_signal_at.tzinfo is None:
        last_signal_at = last_signal_at.replace(tzinfo=UTC)
    gps_online = bool(
        last_signal_at and last_signal_at >= datetime.now(UTC) - timedelta(minutes=5)
    )

    return PublicVehicleQRVerification(
        vehicle_id=vehicle.id,
        qr_issued_at=qr_token.issued_at,
        registration_number=(
            vehicle.registration_number_display or vehicle.registration_number
        ),
        vehicle_type=vehicle.vehicle_type,
        vehicle_category=vehicle.vehicle_category,
        usage_type=vehicle.usage_type,
        body_type=vehicle.body_type,
        fuel_type=vehicle.fuel_type,
        brand=vehicle.brand,
        model=vehicle.model,
        color=vehicle.color,
        manufacturing_year=vehicle.manufacturing_year,
        verification_status=vehicle.verification_status.value,
        vehicle_status=vehicle.status.value,
        owner_name=owner.name if owner else "Owner not recorded",
        provider_name=provider.name if provider else "No VTS provider connected",
        gps_online=gps_online,
        last_signal_at=last_signal_at,
        current_speed_kph=float(vehicle.latest_speed_kph or 0) if gps_online else 0.0,
        current_driver=(
            PublicQRDriverSummary(
                name=driver.full_name,
                driver_code=driver.driver_code,
                verification_status=driver.verification_status.value,
                assignment_status=driver_assignment.status.value,
                is_on_duty=driver_assignment.is_on_duty,
                behaviour_score=driver.behaviour_score,
                licence_status=licence.verification_status.value if licence else None,
                licence_expiry=licence.expiry_date if licence else None,
            )
            if driver and driver_assignment
            else None
        ),
        documents=[
            PublicQRDocumentSummary(
                document_type=document.document_type.value,
                status=document.status.value,
                expires_at=document.expires_at,
            )
            for document in documents
        ],
    )
