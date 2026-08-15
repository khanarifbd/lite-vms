from datetime import date
from types import SimpleNamespace

from app.modules.vehicles.certificate_renderer import render_certificate_pdf


def test_figma_certificate_renderer_builds_pdf() -> None:
    vehicle = SimpleNamespace(
        certificate_number="GOMAX-213164-202601",
        certificate_issued_at=date(2026, 8, 1),
        certificate_expires_at=date(2026, 10, 1),
        vts_installation_date=date(2026, 3, 3),
        registered_owner_name="Dhaka Bank LTD (A/C-M/S. NAME)",
        registration_number_display="DHAKA-METRO-BA-14-7801",
        registration_number="DHAKA-METRO-BA-14-7801",
        vehicle_type="Bus",
        engine_number="SLT4J21775",
        chassis_number="J94WEL4GM0029419",
    )
    owner = SimpleNamespace(name="Portal Owner")

    pdf = render_certificate_pdf(vehicle, owner, "Go Max Tracker")
    data = pdf.getvalue()

    assert data.startswith(b"%PDF")
    assert len(data) > 10_000
