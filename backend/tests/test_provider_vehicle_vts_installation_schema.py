from datetime import date
from uuid import uuid4

from app.modules.vehicles.provider_registration_schema import (
    ProviderVehicleRegistrationCreate,
    ProviderVehicleRegistrationUpdate,
)


def test_provider_vehicle_create_accepts_vts_installation_date() -> None:
    payload = ProviderVehicleRegistrationCreate(
        owner_id=uuid4(),
        registration_number="DHAKA-METRO-GA-11-1234",
        registered_owner_name="Test Owner",
        chassis_number="CHASSIS-123456",
        vehicle_type="car",
        vts_installation_date=date(2026, 8, 13),
    )
    assert payload.vts_installation_date == date(2026, 8, 13)


def test_provider_vehicle_update_accepts_and_clears_vts_installation_date() -> None:
    payload = ProviderVehicleRegistrationUpdate(vts_installation_date=date(2026, 8, 13))
    assert payload.vts_installation_date == date(2026, 8, 13)

    cleared = ProviderVehicleRegistrationUpdate(vts_installation_date=None)
    assert cleared.model_dump(exclude_unset=True)["vts_installation_date"] is None
