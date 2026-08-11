import secrets
import uuid
from datetime import UTC, date, datetime, timedelta
from io import BytesIO
from pathlib import Path
from urllib.parse import quote
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Query, status
from fastapi.responses import StreamingResponse
import httpx
from reportlab.lib import colors
from reportlab.lib.pagesizes import A4
from reportlab.lib.units import mm
from reportlab.lib.utils import ImageReader
from reportlab.pdfgen import canvas
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.common.enums import (
    DocumentStatus,
    DocumentType,
    OwnerVerificationStatus,
    ProviderStatus,
    UserRole,
    VehicleVerificationStatus,
)
from app.core.database import get_session
from app.modules.audit.service import write_audit_log
from app.modules.auth.dependencies import require_roles
from app.modules.auth.model import User
from app.modules.documents.model import VehicleDocument
from app.modules.owners.model import VehicleOwner
from app.modules.owners.service import get_owner_username
from app.core.config import settings
from app.modules.providers.service import get_provider_for_user
from app.modules.qr_verification.model import VehicleQRToken
from app.modules.settings.service import auto_approve_vehicle
from app.modules.vehicles.model import Vehicle
from app.modules.vehicles.normalization import (
    normalize_bangladesh_registration,
    normalize_vehicle_serial,
)
from app.modules.vehicles.provider_registration_schema import (
    ProviderVehicleRegistrationCreate,
    ProviderVehicleRegistrationUpdate,
    VehicleIdentityAvailability,
)
from app.modules.vehicles.router import find_identity_conflict, resolve_vehicle_owner
from app.modules.vehicles.schema import VehicleRead
from app.modules.vehicles.service import build_vehicle_read, user_can_access_vehicle

router = APIRouter(
    prefix="/vehicles/provider-registration",
    tags=["VTS Provider Vehicle Registration"],
)

PROVIDER_VEHICLE_READ_ROLES = (
    UserRole.VTS_ADMIN,
    UserRole.VTS_OPERATOR,
    UserRole.VTS_TECHNICAL,
    UserRole.VTS_VIEWER,
)
PROVIDER_VEHICLE_MANAGE_ROLES = (UserRole.VTS_ADMIN, UserRole.VTS_OPERATOR)
PROVIDER_VEHICLE_EDITABLE_STATUSES = {
    VehicleVerificationStatus.DRAFT,
    VehicleVerificationStatus.CHANGES_REQUESTED,
}
CERTIFICATE_DOCUMENT_TYPES = (
    DocumentType.REGISTRATION,
    DocumentType.FITNESS,
    DocumentType.TAX_TOKEN,
    DocumentType.INSURANCE,
    DocumentType.ROUTE_PERMIT,
)


async def certificate_readiness(session: AsyncSession, vehicle: Vehicle) -> tuple[list[str], date | None]:
    documents = list(
        await session.scalars(
            select(VehicleDocument).where(
                VehicleDocument.vehicle_id == vehicle.id,
                VehicleDocument.is_active.is_(True),
                VehicleDocument.status != DocumentStatus.REVOKED,
            )
        )
    )
    documents_by_type = {document.document_type: document for document in documents}
    missing = [
        document_type.value.replace("_", " ")
        for document_type in CERTIFICATE_DOCUMENT_TYPES
        if document_type not in documents_by_type
    ]
    today = date.today()
    expiring_documents = [
        document
        for document_type, document in documents_by_type.items()
        if document_type != DocumentType.REGISTRATION
        and (document.expires_at is None or document.expires_at < today)
    ]
    if expiring_documents:
        missing.extend(
            f"valid {document.document_type.value.replace('_', ' ')}"
            for document in expiring_documents
        )
    expiry_dates = [
        document.expires_at
        for document_type, document in documents_by_type.items()
        if document_type != DocumentType.REGISTRATION and document.expires_at is not None
    ]
    return missing, min(expiry_dates) if expiry_dates else None


def certificate_payload(vehicle: Vehicle, *, requirements: list[str]) -> dict[str, object]:
    today = date.today()
    status_value = "not_issued"
    if vehicle.certificate_number and vehicle.certificate_expires_at:
        status_value = "expired" if vehicle.certificate_expires_at < today else "active"
    return {
        "certificate_number": vehicle.certificate_number,
        "issued_at": vehicle.certificate_issued_at,
        "expires_at": vehicle.certificate_expires_at,
        "generated_at": vehicle.certificate_generated_at,
        "status": status_value,
        "requirements": requirements,
        "can_generate": not requirements,
    }


CERTIFICATE_ASSET_DIR = Path(__file__).resolve().parents[2] / "assets" / "certificate_template"


def certificate_pdf(vehicle: Vehicle, owner: VehicleOwner) -> BytesIO:
    """Render the branded, data-driven Go Max compliance certificate from the Figma template."""
    if not vehicle.certificate_number or not vehicle.certificate_issued_at or not vehicle.certificate_expires_at:
        raise ValueError("Certificate has not been issued")

    output = BytesIO()
    page = canvas.Canvas(output, pagesize=A4)
    width, height = A4
    scale = width / 1362.64

    def x(value: float) -> float:
        return value * scale

    def y(value: float) -> float:
        return height - value * scale

    def date_text(value: date | None) -> str:
        return value.strftime("%d %B %Y") if value else "Not recorded"

    def draw_logo(name: str, left: float, top: float, logo_width: float, logo_height: float) -> None:
        path = CERTIFICATE_ASSET_DIR / name
        if path.exists():
            page.drawImage(ImageReader(path), x(left), y(top + logo_height), x(logo_width), x(logo_height), mask="auto")

    def draw_card(left: float, top: float, card_width: float, title: str, rows: list[tuple[str, str, colors.Color]]) -> None:
        card_height = 404
        page.setStrokeColor(colors.Color(225 / 255, 0, 0, alpha=0.30))
        page.setLineWidth(0.75)
        page.roundRect(x(left), y(top + card_height), x(card_width), x(card_height), x(16), stroke=1, fill=0)
        page.setFillColor(colors.black)
        page.setFont("Helvetica-Bold", x(28))
        page.drawString(x(left + 20), y(top + 43), title)
        page.setStrokeColor(colors.HexColor("#d9d9d9"))
        page.line(x(left + 20), y(top + 62), x(left + card_width - 20), y(top + 62))
        row_top = top + 78
        for index, (label, value, value_color) in enumerate(rows):
            row_y = row_top + index * 55
            page.setFillColor(colors.white)
            page.rect(x(left + 20), y(row_y + 50), x(card_width - 40), x(50), stroke=0, fill=1)
            page.setFillColor(colors.HexColor("#505958"))
            page.setFont("Helvetica", x(16))
            page.drawString(x(left + 44), y(row_y + 31), label)
            page.setFillColor(value_color)
            page.setFont("Helvetica-Bold", x(19))
            page.drawRightString(x(left + card_width - 44), y(row_y + 31), value)

    # Figma certificate frame background, pattern and printed border.
    page.setFillColor(colors.HexColor("#fdf9f5"))
    page.rect(0, 0, width, height, stroke=0, fill=1)
    draw_logo("pattern.png", -671, 0, 2705, 1920)
    draw_logo("border.png", 22, 40, 1319, 1840)

    draw_logo("gomax_tracker.png", 140.73, 60, 253.968, 80)
    draw_logo("auto_generation.png", 970, 60, 252.379, 80)

    page.setFillColor(colors.HexColor("#231f20"))
    page.setFont("Helvetica", x(18))
    page.drawCentredString(width / 2, y(205), "AUTO GENERATION LIMITED.")
    page.setFont("Helvetica-Bold", x(24))
    page.drawCentredString(width / 2, y(242), "Go Max Tracker")
    page.setFont("Times-Roman", x(55))
    page.drawCentredString(width / 2, y(315), "GPS TRACKER COMPLIANCE")
    page.drawCentredString(width / 2, y(378), "CERTIFICATE")

    page.setFillColor(colors.HexColor("#f0e3d7"))
    page.setStrokeColor(colors.HexColor("#e1b68d"))
    page.roundRect(width / 2 - x(255), y(452), x(510), x(52), x(12), stroke=1, fill=1)
    page.setFillColor(colors.Color(35 / 255, 31 / 255, 32 / 255, alpha=0.70))
    page.setFont("Helvetica-Bold", x(18))
    page.drawCentredString(width / 2, y(422), f"GPS Certificate No: {vehicle.certificate_number}")

    page.setFillColor(colors.Color(35 / 255, 31 / 255, 32 / 255, alpha=0.72))
    page.setFont("Helvetica", x(20))
    statement = [
        "This is to clarify that the vehicle described below has been equipped with a genuine, active and",
        "fully operational GPS tracking device installed by Go Max Tracker, a product of Auto Generation Limited,",
        "a BTRC Licensed Vehicle Tracking Service (VTS) Provider.",
        "",
        "The certificate confirms that the installed GPS tracking device is functional and has been",
        "installed in accordance with applicable GPS tracking requirements and relevant directives issued",
        "by the Bangladesh Road Transport Authority (BRTA), where applicable.",
    ]
    for index, line in enumerate(statement):
        page.drawCentredString(width / 2, y(560 + index * 30), line)

    remaining_days = max((vehicle.certificate_expires_at - date.today()).days, 0)
    gps_connected = vehicle.last_received_at is not None
    gps_text = "Connected" if gps_connected else "Not configured"
    gps_color = colors.HexColor("#008200") if gps_connected else colors.HexColor("#505958")
    vehicle_rows = [
        ("Owner Name:", owner.name or "Not recorded", colors.HexColor("#231f20")),
        ("Registration No.", vehicle.registration_number_display or vehicle.registration_number, colors.HexColor("#231f20")),
        ("Vehicle Type", vehicle.vehicle_type or "Not recorded", colors.HexColor("#231f20")),
        ("Chassis No.", vehicle.chassis_number or "Not recorded", colors.HexColor("#231f20")),
        ("GPS Status", gps_text, gps_color),
    ]
    validity_rows = [
        ("Date of Issue", date_text(vehicle.certificate_issued_at), colors.HexColor("#231f20")),
        ("Valid Until", date_text(vehicle.certificate_expires_at), colors.HexColor("#231f20")),
        ("Remaining Days", str(remaining_days), colors.HexColor("#231f20")),
        ("Certificate generated", date_text(vehicle.certificate_issued_at), colors.HexColor("#231f20")),
        ("Current Status", "Active", colors.HexColor("#008200")),
    ]
    draw_card(101, 878, 560, "VEHICLE PARTICULARS", vehicle_rows)
    draw_card(701, 878, 560, "VALIDITY INFORMATION", validity_rows)

    page.setFillColor(colors.white)
    page.setStrokeColor(colors.Color(225 / 255, 0, 0, alpha=0.30))
    page.roundRect(x(101), y(1425), x(1160), x(152), x(16), stroke=1, fill=1)
    page.setFillColor(colors.HexColor("#231f20"))
    # The BTRC emblem is built from the exact four exported Figma vector layers.
    draw_logo("btrc_1.png", 141, 1353.37, 130, 89.63)
    draw_logo("btrc_2.png", 168.47, 1313, 72.47, 23.02)
    draw_logo("btrc_3.png", 160.63, 1330.22, 89.81, 92.94)
    draw_logo("btrc_4.png", 171.62, 1367.83, 68.78, 22.78)
    page.setFont("Helvetica-Bold", x(22))
    page.drawString(x(290), y(1355), "BTRC LICENSED VEHICLE TRACKING SERVICE PROVIDER")
    page.setFillColor(colors.Color(35 / 255, 31 / 255, 32 / 255, alpha=0.70))
    page.setFont("Helvetica", x(18))
    page.drawString(x(290), y(1395), "BTRC VTS License No: 14.32.00000.007.58.055.18.44")

    page.setFillColor(colors.HexColor("#231f20"))
    page.setFont("Helvetica-Bold", x(22))
    page.drawString(x(101), y(1538), "IMPORTANT NOTICE")
    page.drawString(x(543), y(1538), "CONTACT INFO")
    page.setFont("Helvetica", x(16))
    page.drawString(x(101), y(1572), "• This certificate is valid only while the")
    page.drawString(x(114), y(1596), "GPS subscription remains active.")
    page.drawString(x(101), y(1630), "• Misuse of this certificate is an offence")
    page.drawString(x(114), y(1654), "under Bangladesh ICT Act, 2006.")
    contact = ["Call Center (24/7): +880 9666 766 766", "Email: support@gomaxtracker.com", "Website: www.gomaxtracker.com", "Office: House# 646 (4th floor), Road #9, Mirpur DOHS, Dhaka-1216"]
    for index, line in enumerate(contact):
        page.drawString(x(543), y(1572 + index * 28), line)
    draw_logo("brta_emblem.png", 1090, 1516, 118, 118)
    page.setFont("Helvetica-Bold", x(18))
    page.drawCentredString(x(1148), y(1665), "BRTA APPROVED")

    page.setFillColor(colors.Color(35 / 255, 31 / 255, 32 / 255, alpha=0.70))
    page.setFont("Helvetica-Oblique", x(16))
    page.drawCentredString(width / 2, y(1848), "This is a system generated certificate and requires no manual signature.")
    page.drawCentredString(width / 2, y(1872), "Powered by Auto Generation Limited.")
    page.showPage()
    page.save()
    output.seek(0)
    return output


@router.post("/gomax-import")
async def import_gomax_vehicles(
    owner_id: uuid.UUID,
    actor: Annotated[User, Depends(require_roles(*PROVIDER_VEHICLE_MANAGE_ROLES))],
    session: Annotated[AsyncSession, Depends(get_session)],
) -> dict[str, int | str]:
    """Import Go Max device projects as draft vehicles for an active-linked owner."""
    owner, provider = await resolve_vehicle_owner(session, actor=actor, owner_id=owner_id)
    if provider is None:
        provider = await require_approved_provider(session, actor)
    username = await get_owner_username(session, owner)
    if not username:
        raise HTTPException(status_code=422, detail="The selected owner does not have a username")

    base_url = settings.gomax_crm_base_url.rstrip("/")
    try:
        async with httpx.AsyncClient(timeout=20, follow_redirects=True) as client:
            login = await client.post(f"{base_url}/login_with_username/{quote(username, safe='')}")
            login.raise_for_status()
            customer = login.json()
            gomax_owner_id = str(customer.get("id") or "").strip()
            if not gomax_owner_id:
                raise ValueError("Go Max did not return an owner ID")
            devices = await client.get(f"{base_url}/device_list/{quote(gomax_owner_id, safe='')}")
            devices.raise_for_status()
            projects = devices.json()
    except (httpx.HTTPError, ValueError) as exc:
        raise HTTPException(status_code=502, detail=f"Go Max import failed: {exc}") from None
    if not isinstance(projects, list):
        raise HTTPException(status_code=502, detail="Go Max device list has an invalid format")

    imported = 0
    skipped = 0
    for project in projects:
        if not isinstance(project, dict):
            skipped += 1
            continue
        project_id = str(project.get("project_id") or "").strip()
        project_name = str(project.get("project_name") or "").strip()
        if not project_id or not project_name:
            skipped += 1
            continue
        source_identity = f"GOMAX-{project_id}"
        exists = await session.scalar(
            select(Vehicle.id).where(Vehicle.chassis_number == source_identity)
        )
        if exists is not None:
            skipped += 1
            continue
        session.add(
            Vehicle(
                registration_number=source_identity,
                registration_number_display=project_name[:80],
                chassis_number=source_identity,
                vehicle_type="Imported",
                owner_id=owner.id,
                created_by_provider_id=provider.id,
                verification_status=VehicleVerificationStatus.DRAFT,
                notes=f"Imported from Go Max project {project_id}. Complete vehicle details and documents later.",
            )
        )
        imported += 1
    await session.commit()
    return {"message": "Go Max vehicles imported", "gomax_owner_id": gomax_owner_id, "imported": imported, "skipped": skipped}


async def require_approved_provider(session: AsyncSession, actor: User):
    provider = await get_provider_for_user(session, actor.id)
    if provider is None:
        raise HTTPException(status_code=404, detail="VTS provider registration not found")
    if provider.status != ProviderStatus.APPROVED:
        raise HTTPException(status_code=403, detail="Approved VTS provider required")
    return provider


async def get_provider_vehicle(
    session: AsyncSession,
    *,
    actor: User,
    vehicle_id: uuid.UUID,
):
    provider = await require_approved_provider(session, actor)
    vehicle = await session.get(Vehicle, vehicle_id)
    if vehicle is None:
        raise HTTPException(status_code=404, detail="Vehicle not found")
    if not await user_can_access_vehicle(session, user=actor, vehicle=vehicle):
        raise HTTPException(
            status_code=403,
            detail="An active owner-provider link is required to access this vehicle",
        )
    return vehicle, provider


def normalized_registration(value: str | None) -> str | None:
    if value is None or not value.strip():
        return None
    try:
        return normalize_bangladesh_registration(value)
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc


def normalized_serial(value: str | None) -> str | None:
    if value is None or not value.strip():
        return None
    try:
        return normalize_vehicle_serial(value)
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc


@router.get("/identity-check", response_model=VehicleIdentityAvailability)
async def check_vehicle_identity(
    actor: Annotated[User, Depends(require_roles(*PROVIDER_VEHICLE_MANAGE_ROLES))],
    session: Annotated[AsyncSession, Depends(get_session)],
    registration_number: Annotated[str | None, Query(max_length=80)] = None,
    chassis_number: Annotated[str | None, Query(max_length=120)] = None,
    engine_number: Annotated[str | None, Query(max_length=120)] = None,
    exclude_vehicle_id: uuid.UUID | None = None,
) -> VehicleIdentityAvailability:
    await require_approved_provider(session, actor)
    if exclude_vehicle_id is not None:
        await get_provider_vehicle(
            session,
            actor=actor,
            vehicle_id=exclude_vehicle_id,
        )

    registration = normalized_registration(registration_number)
    chassis = normalized_serial(chassis_number)
    engine = normalized_serial(engine_number)
    if not any((registration, chassis, engine)):
        raise HTTPException(status_code=422, detail="Provide at least one vehicle identity")

    registration_query = select(Vehicle.id).where(
        Vehicle.registration_number == registration
    )
    chassis_query = select(Vehicle.id).where(Vehicle.chassis_number == chassis)
    engine_query = select(Vehicle.id).where(Vehicle.engine_number == engine)
    if exclude_vehicle_id is not None:
        registration_query = registration_query.where(Vehicle.id != exclude_vehicle_id)
        chassis_query = chassis_query.where(Vehicle.id != exclude_vehicle_id)
        engine_query = engine_query.where(Vehicle.id != exclude_vehicle_id)

    registration_exists = bool(
        registration and await session.scalar(registration_query)
    )
    chassis_exists = bool(chassis and await session.scalar(chassis_query))
    engine_exists = bool(engine and await session.scalar(engine_query))
    return VehicleIdentityAvailability(
        available=not any((registration_exists, chassis_exists, engine_exists)),
        registration_number_available=not registration_exists,
        chassis_number_available=not chassis_exists,
        engine_number_available=not engine_exists,
    )


@router.post("", response_model=VehicleRead, status_code=status.HTTP_201_CREATED)
async def register_provider_vehicle(
    payload: ProviderVehicleRegistrationCreate,
    actor: Annotated[User, Depends(require_roles(*PROVIDER_VEHICLE_MANAGE_ROLES))],
    session: Annotated[AsyncSession, Depends(get_session)],
) -> VehicleRead:
    owner, provider = await resolve_vehicle_owner(
        session,
        actor=actor,
        owner_id=payload.owner_id,
    )
    if provider is None:
        provider = await require_approved_provider(session, actor)
    if owner.verification_status != OwnerVerificationStatus.APPROVED:
        raise HTTPException(
            status_code=403,
            detail="Vehicle owner must be approved before registering vehicles",
        )

    registration_number = normalized_registration(payload.registration_number)
    chassis_number = normalized_serial(payload.chassis_number)
    engine_number = normalized_serial(payload.engine_number)
    conflict = await find_identity_conflict(
        session,
        registration_number=registration_number,
        chassis_number=chassis_number,
        engine_number=engine_number,
    )
    if conflict is not None:
        raise HTTPException(
            status_code=409,
            detail={
                "code": "vehicle_identity_exists",
                "message": "Registration, chassis, or engine identity already exists",
            },
        )

    values = payload.model_dump(
        exclude={
            "owner_id",
            "registration_number",
            "registration_number_display",
            "chassis_number",
            "engine_number",
            "submit_for_review",
        }
    )
    verification_status = (
        VehicleVerificationStatus.PENDING_VERIFICATION
        if payload.submit_for_review
        else VehicleVerificationStatus.DRAFT
    )
    vehicle = Vehicle(
        **values,
        registration_number=registration_number,
        registration_number_display=(
            payload.registration_number_display or payload.registration_number.strip()
        ),
        chassis_number=chassis_number,
        engine_number=engine_number,
        owner_id=owner.id,
        created_by_provider_id=provider.id,
        submitted_by_user_id=actor.id if payload.submit_for_review else None,
        verification_status=verification_status,
    )
    session.add(vehicle)

    try:
        await session.flush()
        if payload.submit_for_review:
            session.add(
                VehicleQRToken(
                    vehicle_id=vehicle.id,
                    token=secrets.token_urlsafe(32),
                )
            )
            await auto_approve_vehicle(session, vehicle)
        await write_audit_log(
            session,
            tenant_id=provider.tenant_id,
            actor_user_id=actor.id,
            actor_organization_id=provider.root_organization_id,
            action=(
                "vehicle.registration_submitted"
                if payload.submit_for_review
                else "vehicle.registration_draft_saved"
            ),
            resource_type="vehicle",
            resource_public_id=vehicle.id,
            new_values={
                "registration_number": vehicle.registration_number,
                "owner_id": str(owner.id),
                "created_by_provider_id": str(provider.id),
                "verification_status": vehicle.verification_status.value,
                "auto_approved": (
                    vehicle.verification_status == VehicleVerificationStatus.VERIFIED
                ),
            },
        )
        await session.commit()
    except IntegrityError as exc:
        await session.rollback()
        raise HTTPException(
            status_code=409,
            detail={
                "code": "vehicle_identity_exists",
                "message": "Registration, chassis, or engine identity already exists",
            },
        ) from exc

    await session.refresh(vehicle)
    return await build_vehicle_read(session, vehicle)


@router.get("/{vehicle_id}", response_model=VehicleRead)
async def read_provider_vehicle(
    vehicle_id: uuid.UUID,
    actor: Annotated[User, Depends(require_roles(*PROVIDER_VEHICLE_READ_ROLES))],
    session: Annotated[AsyncSession, Depends(get_session)],
) -> VehicleRead:
    vehicle, _ = await get_provider_vehicle(
        session,
        actor=actor,
        vehicle_id=vehicle_id,
    )
    return await build_vehicle_read(session, vehicle)


@router.get("/{vehicle_id}/certificate")
async def get_provider_vehicle_certificate(
    vehicle_id: uuid.UUID,
    actor: Annotated[User, Depends(require_roles(*PROVIDER_VEHICLE_READ_ROLES))],
    session: Annotated[AsyncSession, Depends(get_session)],
) -> dict[str, object]:
    vehicle, _ = await get_provider_vehicle(session, actor=actor, vehicle_id=vehicle_id)
    requirements, _ = await certificate_readiness(session, vehicle)
    return certificate_payload(vehicle, requirements=requirements)


@router.post("/{vehicle_id}/certificate")
async def generate_provider_vehicle_certificate(
    vehicle_id: uuid.UUID,
    actor: Annotated[User, Depends(require_roles(*PROVIDER_VEHICLE_MANAGE_ROLES))],
    session: Annotated[AsyncSession, Depends(get_session)],
) -> dict[str, object]:
    vehicle, provider = await get_provider_vehicle(session, actor=actor, vehicle_id=vehicle_id)
    requirements, document_expiry = await certificate_readiness(session, vehicle)
    if requirements:
        raise HTTPException(
            status_code=422,
            detail="Certificate requires current documents: " + ", ".join(requirements),
        )

    issued_at = date.today()
    expires_at = min(issued_at + timedelta(days=365), document_expiry) if document_expiry else issued_at + timedelta(days=365)
    vehicle.certificate_number = f"VTS-{issued_at:%Y%m%d}-{uuid.uuid4().hex[:8].upper()}"
    vehicle.certificate_issued_at = issued_at
    vehicle.certificate_expires_at = expires_at
    vehicle.certificate_generated_at = datetime.now(UTC)
    vehicle.certificate_generated_by_user_id = actor.id
    await write_audit_log(
        session,
        tenant_id=provider.tenant_id,
        actor_user_id=actor.id,
        actor_organization_id=provider.root_organization_id,
        action="vehicle.certificate_generated",
        resource_type="vehicle",
        resource_public_id=vehicle.id,
        new_values={
            "certificate_number": vehicle.certificate_number,
            "issued_at": issued_at.isoformat(),
            "expires_at": expires_at.isoformat(),
        },
    )
    await session.commit()
    return certificate_payload(vehicle, requirements=[])


@router.get("/{vehicle_id}/certificate/download")
async def download_provider_vehicle_certificate(
    vehicle_id: uuid.UUID,
    actor: Annotated[User, Depends(require_roles(*PROVIDER_VEHICLE_READ_ROLES))],
    session: Annotated[AsyncSession, Depends(get_session)],
) -> StreamingResponse:
    vehicle, _ = await get_provider_vehicle(session, actor=actor, vehicle_id=vehicle_id)
    if not vehicle.certificate_number:
        raise HTTPException(status_code=404, detail="Certificate has not been issued")
    owner = await session.get(VehicleOwner, vehicle.owner_id)
    if owner is None:
        raise HTTPException(status_code=404, detail="Vehicle owner not found")
    pdf = certificate_pdf(vehicle, owner)
    filename = f"{vehicle.certificate_number}.pdf"
    return StreamingResponse(
        pdf,
        media_type="application/pdf",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


@router.patch("/{vehicle_id}", response_model=VehicleRead)
async def update_provider_vehicle(
    vehicle_id: uuid.UUID,
    payload: ProviderVehicleRegistrationUpdate,
    actor: Annotated[User, Depends(require_roles(*PROVIDER_VEHICLE_MANAGE_ROLES))],
    session: Annotated[AsyncSession, Depends(get_session)],
) -> VehicleRead:
    vehicle, provider = await get_provider_vehicle(
        session,
        actor=actor,
        vehicle_id=vehicle_id,
    )
    if vehicle.verification_status not in PROVIDER_VEHICLE_EDITABLE_STATUSES:
        raise HTTPException(
            status_code=409,
            detail=(
                "Only draft vehicles or registrations with requested changes can be edited"
            ),
        )

    changes = payload.model_dump(exclude_unset=True)
    if not changes:
        raise HTTPException(status_code=422, detail="At least one vehicle field is required")
    for required_field in ("registration_number", "chassis_number", "vehicle_type"):
        if required_field in changes and changes[required_field] is None:
            raise HTTPException(
                status_code=422,
                detail=f"{required_field.replace('_', ' ').title()} cannot be cleared",
            )

    if "registration_number" in changes:
        changes["registration_number"] = normalized_registration(
            changes["registration_number"]
        )
    if "chassis_number" in changes:
        changes["chassis_number"] = normalized_serial(changes["chassis_number"])
    if "engine_number" in changes:
        changes["engine_number"] = normalized_serial(changes["engine_number"])

    conflict = await find_identity_conflict(
        session,
        registration_number=changes.get("registration_number"),
        chassis_number=changes.get("chassis_number"),
        engine_number=changes.get("engine_number"),
        exclude_vehicle_id=vehicle.id,
    )
    if conflict is not None:
        raise HTTPException(
            status_code=409,
            detail={
                "code": "vehicle_identity_conflict",
                "message": "Vehicle identity conflicts with another global vehicle",
                "vehicle_id": str(conflict.id),
            },
        )

    changed_fields = [
        field for field, value in changes.items() if getattr(vehicle, field) != value
    ]
    if not changed_fields:
        return await build_vehicle_read(session, vehicle)

    previous_status = vehicle.verification_status
    for field, value in changes.items():
        setattr(vehicle, field, value)

    action = (
        "vehicle.registration_correction_saved"
        if previous_status == VehicleVerificationStatus.CHANGES_REQUESTED
        else "vehicle.registration_draft_updated"
    )
    try:
        await write_audit_log(
            session,
            tenant_id=provider.tenant_id,
            actor_user_id=actor.id,
            actor_organization_id=provider.root_organization_id,
            action=action,
            resource_type="vehicle",
            resource_public_id=vehicle.id,
            new_values={
                "changed_fields": changed_fields,
                "verification_status": previous_status.value,
                "review_notes_retained": bool(vehicle.review_notes),
            },
        )
        await session.commit()
    except IntegrityError as exc:
        await session.rollback()
        raise HTTPException(
            status_code=409,
            detail={
                "code": "vehicle_identity_exists",
                "message": "Registration, chassis, or engine identity already exists",
            },
        ) from exc

    await session.refresh(vehicle)
    return await build_vehicle_read(session, vehicle)


@router.post("/{vehicle_id}/submit", response_model=VehicleRead)
async def submit_provider_vehicle(
    vehicle_id: uuid.UUID,
    actor: Annotated[User, Depends(require_roles(*PROVIDER_VEHICLE_MANAGE_ROLES))],
    session: Annotated[AsyncSession, Depends(get_session)],
) -> VehicleRead:
    vehicle, provider = await get_provider_vehicle(
        session,
        actor=actor,
        vehicle_id=vehicle_id,
    )
    if vehicle.verification_status not in PROVIDER_VEHICLE_EDITABLE_STATUSES:
        raise HTTPException(
            status_code=409,
            detail="Only draft or changes-requested vehicles can be submitted",
        )

    owner = await session.get(VehicleOwner, vehicle.owner_id)
    if owner is None:
        raise HTTPException(status_code=409, detail="Vehicle owner is missing")
    if owner.verification_status != OwnerVerificationStatus.APPROVED:
        raise HTTPException(
            status_code=403,
            detail="Vehicle owner must remain approved before submission",
        )

    previous_status = vehicle.verification_status
    previous_review_notes = vehicle.review_notes
    vehicle.verification_status = VehicleVerificationStatus.PENDING_VERIFICATION
    vehicle.submitted_by_user_id = actor.id
    vehicle.reviewed_by_user_id = None
    vehicle.reviewed_at = None
    vehicle.review_notes = None

    existing_qr = await session.scalar(
        select(VehicleQRToken.id).where(VehicleQRToken.vehicle_id == vehicle.id)
    )
    if existing_qr is None:
        session.add(
            VehicleQRToken(
                vehicle_id=vehicle.id,
                token=secrets.token_urlsafe(32),
            )
        )

    await auto_approve_vehicle(session, vehicle)
    await write_audit_log(
        session,
        tenant_id=provider.tenant_id,
        actor_user_id=actor.id,
        actor_organization_id=provider.root_organization_id,
        action=(
            "vehicle.registration_resubmitted"
            if previous_status == VehicleVerificationStatus.CHANGES_REQUESTED
            else "vehicle.registration_submitted"
        ),
        resource_type="vehicle",
        resource_public_id=vehicle.id,
        new_values={
            "owner_id": str(owner.id),
            "created_by_provider_id": str(provider.id),
            "previous_verification_status": previous_status.value,
            "previous_review_notes": previous_review_notes,
            "verification_status": vehicle.verification_status.value,
            "auto_approved": (
                vehicle.verification_status == VehicleVerificationStatus.VERIFIED
            ),
        },
    )
    await session.commit()
    await session.refresh(vehicle)
    return await build_vehicle_read(session, vehicle)
