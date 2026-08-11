import secrets
import uuid
from datetime import UTC, datetime, timedelta
from io import BytesIO
from urllib.parse import urlparse

import qrcode
import qrcode.image.svg
from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.common.enums import AssignmentStatus
from app.core.config import settings
from app.core.database import get_session
from app.modules.assignments.model import DriverAssignment
from app.modules.documents.model import VehicleDocument
from app.modules.drivers.model import Driver
from app.modules.owners.model import VehicleOwner
from app.modules.providers.model import VTSProvider
from app.modules.qr_verification.model import VehicleQRToken
from app.modules.qr_verification.schema import (
    QRDocumentSummary,
    QRDriverSummary,
    QRVehicleVerification,
    VehicleQRCard,
)
from app.modules.vehicles.model import Vehicle

router = APIRouter(prefix="/qr", tags=["QR verification"])

LOCAL_HOSTNAMES = {"localhost", "127.0.0.1", "0.0.0.0", "::1"}


def render_qr_svg(value: str) -> str:
    image = qrcode.make(
        value,
        image_factory=qrcode.image.svg.SvgPathImage,
        box_size=10,
        border=4,
    )
    stream = BytesIO()
    image.save(stream)
    return stream.getvalue().decode("utf-8")


def public_web_origin(request: Request) -> str:
    supplied = request.headers.get("x-public-web-origin", "").strip().rstrip("/")
    parsed = urlparse(supplied)
    if (
        parsed.scheme in {"http", "https"}
        and parsed.netloc
        and parsed.hostname not in LOCAL_HOSTNAMES
    ):
        return supplied
    return settings.public_web_url.strip().rstrip("/")


async def get_or_create_vehicle_qr(
    session: AsyncSession,
    vehicle: Vehicle,
) -> VehicleQRToken:
    qr_token = await session.scalar(
        select(VehicleQRToken).where(VehicleQRToken.vehicle_id == vehicle.id)
    )
    if qr_token is None:
        qr_token = VehicleQRToken(
            vehicle_id=vehicle.id,
            token=secrets.token_urlsafe(32),
            is_active=True,
        )
        session.add(qr_token)
        await session.flush()
    elif not qr_token.is_active:
        qr_token.is_active = True
    return qr_token


@router.get("/vehicles/{vehicle_id}", response_model=VehicleQRCard)
async def read_vehicle_qr_card(
    vehicle_id: uuid.UUID,
    request: Request,
    session: AsyncSession = Depends(get_session),
) -> VehicleQRCard:
    vehicle = await session.get(Vehicle, vehicle_id)
    if vehicle is None:
        raise HTTPException(status_code=404, detail="Vehicle not found")

    qr_token = await get_or_create_vehicle_qr(session, vehicle)
    verification_url = f"{public_web_origin(request)}/verify/vehicle/{qr_token.token}"
    await session.commit()
    await session.refresh(qr_token)

    return VehicleQRCard(
        vehicle_id=vehicle.id,
        registration_number=(
            vehicle.registration_number_display or vehicle.registration_number
        ),
        vehicle_type=vehicle.vehicle_type,
        token=qr_token.token,
        verification_path=verification_url,
        qr_svg=render_qr_svg(verification_url),
        issued_at=qr_token.issued_at,
    )


@router.get("/verify/{token}", response_model=QRVehicleVerification)
async def verify_vehicle_qr(
    token: str,
    session: AsyncSession = Depends(get_session),
) -> QRVehicleVerification:
    qr_token = await session.scalar(
        select(VehicleQRToken).where(
            VehicleQRToken.token == token,
            VehicleQRToken.is_active.is_(True),
        )
    )
    if qr_token is None:
        raise HTTPException(status_code=404, detail="QR token is invalid or inactive")

    vehicle = await session.get(Vehicle, qr_token.vehicle_id)
    if vehicle is None:
        raise HTTPException(status_code=404, detail="Vehicle not found")
    owner = await session.get(VehicleOwner, vehicle.owner_id)
    provider = (
        await session.get(VTSProvider, vehicle.created_by_provider_id)
        if vehicle.created_by_provider_id
        else None
    )

    assignment = await session.scalar(
        select(DriverAssignment).where(
            DriverAssignment.vehicle_id == vehicle.id,
            DriverAssignment.status == AssignmentStatus.ACTIVE,
        )
    )
    driver = await session.get(Driver, assignment.driver_id) if assignment else None
    documents = list(
        await session.scalars(
            select(VehicleDocument)
            .where(VehicleDocument.vehicle_id == vehicle.id)
            .order_by(VehicleDocument.document_type)
        )
    )

    last_recorded_at = vehicle.last_recorded_at
    if last_recorded_at and last_recorded_at.tzinfo is None:
        last_recorded_at = last_recorded_at.replace(tzinfo=UTC)
    gps_online = bool(
        last_recorded_at and last_recorded_at >= datetime.now(UTC) - timedelta(minutes=5)
    )

    return QRVehicleVerification(
        vehicle_id=vehicle.id,
        registration_number=(
            vehicle.registration_number_display or vehicle.registration_number
        ),
        vehicle_type=vehicle.vehicle_type,
        owner_name=owner.name if owner else "Unknown",
        provider_name=provider.name if provider else "Owner registered",
        gps_online=gps_online,
        last_recorded_at=vehicle.last_recorded_at,
        latest_latitude=vehicle.latest_latitude,
        latest_longitude=vehicle.latest_longitude,
        current_driver=(
            QRDriverSummary(
                id=driver.id,
                name=driver.full_name,
                licence_number="Protected",
                licence_expiry=None,
                behaviour_score=driver.behaviour_score,
            )
            if driver
            else None
        ),
        documents=[
            QRDocumentSummary(
                document_type=document.document_type,
                document_number=document.document_number,
                expires_at=document.expires_at,
                status=document.status,
            )
            for document in documents
        ],
    )
