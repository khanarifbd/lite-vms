import uuid

import pytest
from pydantic import ValidationError

from app.common.enums import UserRole
from app.modules.auth.schema import UserRegister
from app.modules.auth.security import (
    create_access_token,
    decode_access_token,
    hash_password,
    verify_password,
)


def test_password_hash_round_trip() -> None:
    hashed = hash_password("A-very-strong-password-123")
    assert hashed != "A-very-strong-password-123"
    assert verify_password("A-very-strong-password-123", hashed)
    assert not verify_password("wrong-password", hashed)


def test_access_token_round_trip() -> None:
    user_id = uuid.uuid4()
    session_jti = uuid.uuid4()
    token, expires_at = create_access_token(
        subject=str(user_id),
        identifier="admin@example.com",
        role_codes={UserRole.SUPER_ADMIN.value},
        token_version=3,
        session_jti=session_jti,
    )
    payload = decode_access_token(token)
    assert payload["sub"] == str(user_id)
    assert payload["jti"] == str(session_jti)
    assert payload["ver"] == 3
    assert payload["roles"] == [UserRole.SUPER_ADMIN.value]
    assert expires_at.tzinfo is not None


def test_vts_applicant_signup_requires_mobile() -> None:
    with pytest.raises(ValidationError):
        UserRegister(
            email="vts@example.com",
            full_name="VTS Applicant",
            password="A-very-strong-password-123",
        )


def test_vts_applicant_signup_rejects_legacy_role_fields() -> None:
    with pytest.raises(ValidationError):
        UserRegister(
            email="vts@example.com",
            mobile="+8801712345678",
            full_name="VTS Applicant",
            password="A-very-strong-password-123",
            role=UserRole.VTS_ADMIN,
        )
