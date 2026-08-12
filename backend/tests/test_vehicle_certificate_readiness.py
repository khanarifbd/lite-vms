import uuid
from types import SimpleNamespace
from unittest.mock import AsyncMock

import pytest
from reportlab.pdfbase.pdfmetrics import stringWidth

from app.common.enums import VehicleVerificationStatus
from app.modules.vehicles import provider_registration_router
from app.modules.vehicles.provider_registration_router import (
    PROVIDER_VEHICLE_EDITABLE_STATUSES,
    PROVIDER_VEHICLE_SUBMITTABLE_STATUSES,
    certificate_owner_name,
    certificate_provider,
    certificate_readiness,
    fitted_font_size,
    wrapped_text_lines,
)
from app.modules.vehicles.provider_registration_schema import ProviderVehicleRegistrationUpdate


@pytest.mark.asyncio
async def test_certificate_requires_one_uploaded_vehicle_document() -> None:
    session = AsyncMock()
    session.scalar.return_value = None
    vehicle = SimpleNamespace(id=uuid.uuid4())

    requirements, document_expiry = await certificate_readiness(session, vehicle)

    assert requirements == ["at least one uploaded vehicle document"]
    assert document_expiry is None


@pytest.mark.asyncio
async def test_any_uploaded_vehicle_document_allows_certificate_generation() -> None:
    session = AsyncMock()
    session.scalar.return_value = uuid.uuid4()
    vehicle = SimpleNamespace(id=uuid.uuid4())

    requirements, document_expiry = await certificate_readiness(session, vehicle)

    assert requirements == []
    assert document_expiry is None


def test_verified_provider_vehicle_can_be_updated_without_resubmission() -> None:
    assert VehicleVerificationStatus.VERIFIED in PROVIDER_VEHICLE_EDITABLE_STATUSES
    assert VehicleVerificationStatus.VERIFIED not in PROVIDER_VEHICLE_SUBMITTABLE_STATUSES


@pytest.mark.asyncio
async def test_verified_provider_vehicle_update_keeps_verified_status(monkeypatch) -> None:
    vehicle_id = uuid.uuid4()
    vehicle = SimpleNamespace(
        id=vehicle_id,
        verification_status=VehicleVerificationStatus.VERIFIED,
        registered_owner_name="Old Registered Owner",
        review_notes="Previously verified",
    )
    provider = SimpleNamespace(tenant_id=10, root_organization_id=20)
    actor = SimpleNamespace(id=30)
    session = AsyncMock()
    audit_values: dict[str, object] = {}

    async def get_provider_vehicle(*args, **kwargs):
        return vehicle, provider

    async def find_identity_conflict(*args, **kwargs):
        return None

    async def write_audit_log(*args, **kwargs):
        audit_values.update(kwargs)

    async def build_vehicle_read(*args, **kwargs):
        return vehicle

    monkeypatch.setattr(
        provider_registration_router,
        "get_provider_vehicle",
        get_provider_vehicle,
    )
    monkeypatch.setattr(
        provider_registration_router,
        "find_identity_conflict",
        find_identity_conflict,
    )
    monkeypatch.setattr(provider_registration_router, "write_audit_log", write_audit_log)
    monkeypatch.setattr(provider_registration_router, "build_vehicle_read", build_vehicle_read)

    result = await provider_registration_router.update_provider_vehicle(
        vehicle_id,
        ProviderVehicleRegistrationUpdate(registered_owner_name="New Registered Owner"),
        actor,
        session,
    )

    assert result is vehicle
    assert vehicle.registered_owner_name == "New Registered Owner"
    assert vehicle.verification_status == VehicleVerificationStatus.VERIFIED
    assert audit_values["action"] == "vehicle.registration_verified_updated"
    session.commit.assert_awaited_once()


def test_certificate_prefers_registered_owner_name() -> None:
    vehicle = SimpleNamespace(registered_owner_name="Registration Certificate Owner")
    owner = SimpleNamespace(name="Portal Account Owner")

    assert certificate_owner_name(vehicle, owner) == "Registration Certificate Owner"


def test_certificate_falls_back_to_linked_owner_for_existing_vehicle() -> None:
    vehicle = SimpleNamespace(registered_owner_name=None)
    owner = SimpleNamespace(name="Portal Account Owner")

    assert certificate_owner_name(vehicle, owner) == "Portal Account Owner"


def test_long_owner_name_font_stays_inside_value_column() -> None:
    owner_name = "20101815-Hanif KTC Paribahan(Corporate 1)"
    maximum_width = 132.0

    font_size = fitted_font_size(
        owner_name,
        font_name="Helvetica-Bold",
        maximum_size=8.3,
        minimum_size=4.3,
        maximum_width=maximum_width,
    )

    assert stringWidth(owner_name, "Helvetica-Bold", font_size) <= maximum_width


def test_provider_legal_name_statement_wraps_within_certificate_width() -> None:
    statement = (
        "GPS tracking device installed by Bangladesh National Vehicle Tracking Services Limited, "
        "a BTRC Licensed Vehicle Tracking Service Provider."
    )
    lines = wrapped_text_lines(
        statement,
        font_name="Helvetica",
        font_size=8.5,
        maximum_width=400,
    )

    assert len(lines) > 1
    assert all(stringWidth(line, "Helvetica", 8.5) <= 400 for line in lines)


@pytest.mark.asyncio
async def test_certificate_uses_the_issuing_provider_not_current_viewer(monkeypatch) -> None:
    issuer = SimpleNamespace(name="Issuing VTS Legal Company")
    current_viewer_provider = SimpleNamespace(name="Another VTS Company")
    vehicle = SimpleNamespace(
        certificate_generated_by_user_id=42,
        created_by_provider_id=None,
    )
    session = AsyncMock()

    async def issuing_provider_for_user(*args, **kwargs):
        return issuer

    monkeypatch.setattr(
        provider_registration_router,
        "get_provider_for_user",
        issuing_provider_for_user,
    )

    provider = await certificate_provider(
        session,
        vehicle,
        fallback=current_viewer_provider,
    )

    assert provider is issuer
