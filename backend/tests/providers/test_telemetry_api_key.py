from app.modules.providers.api_key_service import (
    API_KEY_SCHEME,
    extract_lookup_prefix,
    generate_provider_api_key,
    hash_api_key,
)


def test_generated_provider_api_key_is_parseable_and_hashed() -> None:
    generated = generate_provider_api_key()

    assert generated.plaintext.startswith(f"{API_KEY_SCHEME}_")
    assert extract_lookup_prefix(generated.plaintext) == generated.lookup_prefix
    assert hash_api_key(generated.plaintext) == generated.digest
    assert generated.digest != generated.plaintext
    assert len(generated.digest) == 64
    assert generated.last_four == generated.plaintext[-4:]


def test_invalid_provider_api_key_has_no_lookup_prefix() -> None:
    assert extract_lookup_prefix("") is None
    assert extract_lookup_prefix("invalid") is None
    assert extract_lookup_prefix("bnvp_test_prefix_secret") is None
