import re
from uuid import uuid4

from app.modules.vehicles.model import Vehicle


def test_certificate_number_keeps_prefix_and_uses_seven_mixed_characters() -> None:
    vehicle = Vehicle(
        registration_number="DHAKA-METRO-BA-12-3750",
        registered_owner_name="Test Owner",
        chassis_number="TEST-CHASSIS-CERTIFICATE-SUFFIX",
        vehicle_type="Car",
        owner_id=uuid4(),
    )

    vehicle.certificate_number = "GOMAX-S000001260815-AB12"

    assert vehicle.certificate_number is not None
    assert vehicle.certificate_number.startswith("GOMAX-S000001260815-")
    suffix = vehicle.certificate_number.rsplit("-", 1)[-1]
    assert re.fullmatch(r"[A-Z0-9]{7}", suffix)
    assert any(character.isalpha() for character in suffix)
    assert any(character.isdigit() for character in suffix)


def test_existing_seven_character_mixed_suffix_is_preserved() -> None:
    vehicle = Vehicle(
        registration_number="DHAKA-METRO-BA-12-3751",
        registered_owner_name="Test Owner",
        chassis_number="TEST-CHASSIS-CERTIFICATE-SUFFIX-2",
        vehicle_type="Car",
        owner_id=uuid4(),
    )

    vehicle.certificate_number = "GOMAX-S000001260815-K7M4Q2P"

    assert vehicle.certificate_number == "GOMAX-S000001260815-K7M4Q2P"
