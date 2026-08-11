from datetime import date
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Request, status
from pydantic import BaseModel, Field, field_validator, model_validator
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.database import get_session
from app.modules.audit.service import write_audit_log
from app.modules.auth.schema import RegistrationResult, normalize_email, normalize_mobile
from app.modules.auth.service import build_user_read
from app.modules.drivers.enums import DriverClaimStatus, DriverLicenceType
from app.modules.drivers.model import Driver, DriverLicence
from app.modules.drivers.service import create_driver_account, generate_driver_code

router = APIRouter(prefix="/drivers", tags=["Public Driver Registration"])


class PublicDriverApplicantRegister(BaseModel):
    full_name: str = Field(min_length=2, max_length=180)
    email: str | None = Field(default=None, min_length=5, max_length=180)
    mobile: str = Field(min_length=10, max_length=30)
    password: str = Field(min_length=12, max_length=128)
    licence_number: str = Field(min_length=3, max_length=100)
    licence_type: DriverLicenceType
    licence_expiry_date: date

    @field_validator("email")
    @classmethod
    def validate_email(cls, value: str | None) -> str | None:
        return normalize_email(value) if value else None

    @field_validator("mobile")
    @classmethod
    def validate_mobile(cls, value: str) -> str:
        normalized = normalize_mobile(value)
        if normalized is None:
            raise ValueError("A valid mobile number is required")
        return normalized

    @field_validator("licence_number")
    @classmethod
    def normalize_licence(cls, value: str) -> str:
        return value.strip().upper()

    @model_validator(mode="after")
    def validate_expiry(self) -> "PublicDriverApplicantRegister":
        if self.licence_expiry_date <= date.today():
            raise ValueError("Driving licence must not be expired")
        return self


def request_ip(request: Request) -> str | None:
    return request.client.host if request.client else None


def request_agent(request: Request) -> str | None:
    return request.headers.get("user-agent")


@router.post(
    "/register-applicant",
    response_model=RegistrationResult,
    status_code=status.HTTP_201_CREATED,
)
async def register_driver_applicant(
    payload: PublicDriverApplicantRegister,
    request: Request,
    session: Annotated[AsyncSession, Depends(get_session)],
) -> RegistrationResult:
    if not settings.allow_public_registration:
        raise HTTPException(status_code=403, detail="Public registration is disabled")

    existing_licence = await session.scalar(
        select(DriverLicence.id).where(
            DriverLicence.licence_number == payload.licence_number
        )
    )
    if existing_licence is not None:
        raise HTTPException(status_code=409, detail="Driving licence is already registered")

    mobile_token = "".join(character for character in payload.mobile if character.isdigit())
    account_email = payload.email or f"driver-{mobile_token}@mobile.nvtp.local"

    try:
        user = await create_driver_account(
            session,
            email=account_email,
            mobile=payload.mobile,
            username=None,
            display_name=payload.full_name.strip(),
            password=payload.password,
            created_by_user_id=None,
            must_change_password=False,
        )
        driver = Driver(
            user_id=user.id,
            driver_code=generate_driver_code(),
            nid_reference=None,
            full_name=payload.full_name.strip(),
            phone=payload.mobile,
            email=payload.email or "",
            present_address="Application details pending",
            district="Pending",
            claim_status=DriverClaimStatus.CLAIMED,
            declaration_accepted=False,
        )
        session.add(driver)
        await session.flush()
        session.add(
            DriverLicence(
                driver_id=driver.id,
                licence_number=payload.licence_number,
                licence_type=payload.licence_type,
                vehicle_classes=[],
                expiry_date=payload.licence_expiry_date,
            )
        )
        await write_audit_log(
            session,
            actor_user_id=user.id,
            action="driver.applicant_account_created",
            resource_type="driver",
            resource_public_id=driver.id,
            ip_address=request_ip(request),
            user_agent=request_agent(request),
            new_values={
                "driver_code": driver.driver_code,
                "mobile_login": True,
                "email_provided": payload.email is not None,
                "nid_collected": False,
                "application_submitted": False,
                "verification_status": driver.verification_status.value,
            },
        )
        await session.commit()
    except (ValueError, IntegrityError) as exc:
        await session.rollback()
        raise HTTPException(status_code=409, detail=str(exc)) from None

    return RegistrationResult(user=await build_user_read(session, user), can_login=True)
