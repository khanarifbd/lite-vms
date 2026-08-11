import pytest

from app.modules.vehicles.normalization import (
    normalize_bangladesh_registration,
    normalize_vehicle_serial,
)


@pytest.mark.parametrize(
    ("value", "expected"),
    [
        ("ঢাকা-মেট্রো-গ-১২-৩৪৫৬", "DHAKA-METRO-GA-12-3456"),
        ("Dhaka Metro G 12/3456", "DHAKA-METRO-GA-12-3456"),
        ("চট্টগ্রাম মেট্রো ক ১১-২২৩৩", "CHATTOGRAM-METRO-KA-11-2233"),
        ("Chittagong Metro KA 11-2233", "CHATTOGRAM-METRO-KA-11-2233"),
        ("ময়মনসিংহ-খ-০১-০০০১", "MYMENSINGH-KHA-01-0001"),
    ],
)
def test_normalize_bangladesh_registration(value: str, expected: str) -> None:
    assert normalize_bangladesh_registration(value) == expected


def test_registration_aliases_produce_same_identity() -> None:
    bangla = normalize_bangladesh_registration("ঢাকা-মেট্রো-গ-১২-৩৪৫৬")
    english = normalize_bangladesh_registration("DHAKA METRO GA 12 3456")
    assert bangla == english


def test_normalize_vehicle_serial_converts_bangla_digits() -> None:
    assert normalize_vehicle_serial("ch-১২৩ ৪৫৬") == "CH123456"


def test_registration_requires_meaningful_identity() -> None:
    with pytest.raises(ValueError):
        normalize_bangladesh_registration("--")
