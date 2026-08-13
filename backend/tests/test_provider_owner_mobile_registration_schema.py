from app.common.enums import OwnerType
from app.modules.owners.mobile_registration_schema import ProviderMobileOwnerRegister


def test_individual_owner_location_fields_are_optional() -> None:
    payload = ProviderMobileOwnerRegister(
        owner_type=OwnerType.INDIVIDUAL,
        owner_name="Test Individual Owner",
        mobile="+8801712345678",
        login_username="test.individual",
        contact_name="Test Individual Owner",
        declaration_accepted=True,
    )

    assert payload.district is None
    assert payload.registered_address is None


def test_company_owner_optional_fields_can_be_omitted() -> None:
    payload = ProviderMobileOwnerRegister(
        owner_type=OwnerType.COMPANY,
        owner_name="Test Fleet Limited",
        mobile="+8801812345678",
        login_username="test.company",
        contact_name="Fleet Administrator",
        declaration_accepted=True,
    )

    assert payload.company_registration_number is None
    assert payload.trade_license_number is None
    assert payload.district is None
    assert payload.registered_address is None


def test_company_owner_blank_optional_fields_are_normalized_to_none() -> None:
    payload = ProviderMobileOwnerRegister(
        owner_type=OwnerType.COMPANY,
        owner_name="Test Fleet Limited",
        mobile="+8801812345678",
        login_username="test.company.blank",
        contact_name="Fleet Administrator",
        company_registration_number="   ",
        trade_license_number="   ",
        district="   ",
        registered_address="   ",
        declaration_accepted=True,
    )

    assert payload.company_registration_number is None
    assert payload.trade_license_number is None
    assert payload.district is None
    assert payload.registered_address is None
