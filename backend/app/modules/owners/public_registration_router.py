from datetime import UTC, datetime
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Request, status
from pydantic import BaseModel, Field, field_validator
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.common.enums import (
    IdentifierType,
    MembershipStatus,
    OrganizationStatus,
    OrganizationType,
    OwnerType,
    OwnerVerificationStatus,
    TenantStatus,
    TenantType,
    UserRole,
    UserStatus,
)
from app.core.config import settings
from app.core.database import get_session
from app.modules.audit.service import write_audit_log
from app.modules.auth.model import User, UserIdentifier, UserSecurity
from app.modules.auth.schema import RegistrationResult, normalize_mobile
from app.modules.auth.security import hash_password
from app.modules.auth.service import build_user_read, get_identifier, mask_mobile
from app.modules.iam.service import (
    create_membership,
    create_tenant_and_root_organization,
    get_roles_by_codes,
)
from app.modules.owners.enums import OwnerClaimStatus
from app.modules.owners.model import VehicleOwner
from app.modules.owners.service import generate_owner_application_number, generate_owner_code

router = APIRouter(prefix="/owners", tags=["Public Vehicle Owner Registration"])


class PublicOwnerApplicantRegister(BaseModel):
    owner_type: OwnerType = OwnerType.INDIVIDUAL
    full_name: str = Field(min_length=2, max_length=180)
    mobile: str
    password: str = Field(min_length=12, max_length=128)

    @field_validator("mobile")
    @classmethod
    def validate_mobile(cls, value: str) -> str:
        normalized = normalize_mobile(value)
        if normalized is None:
            raise ValueError("A valid mobile number is required")
        return normalized


def request_ip(request: Request) -> str | None:
    return request.client.host if request.client else None


def request_agent(request: Request) -> str | None:
    return request.headers.get("user-agent")


@router.post(
    "/register-applicant",
    response_model=RegistrationResult,
    status_code=status.HTTP_201_CREATED,
)
async def register_owner_applicant(
    payload: PublicOwnerApplicantRegister,
    request: Request,
    session: Annotated[AsyncSession, Depends(get_session)],
) -> RegistrationResult:
    if not settings.allow_public_registration:
        raise HTTPException(status_code=403, detail="Public registration is disabled")

    existing_mobile = await get_identifier(
        session,
        identifier_type=IdentifierType.MOBILE,
        normalized_value=payload.mobile,
    )
    if existing_mobile is not None:
        raise HTTPException(status_code=409, detail="Mobile already registered")

    organization_type = (
        OrganizationType.INDIVIDUAL_VEHICLE_OWNER
        if payload.owner_type == OwnerType.INDIVIDUAL
        else OrganizationType.VEHICLE_OWNER_COMPANY
    )

    try:
        tenant, organization = await create_tenant_and_root_organization(
            session,
            name=payload.full_name.strip(),
            tenant_type=TenantType.VEHICLE_OWNER,
            organization_type=organization_type,
            registration_number=payload.mobile,
        )
        tenant.status = TenantStatus.PENDING
        organization.status = OrganizationStatus.PENDING

        user = User(
            display_name=payload.full_name.strip(),
            status=UserStatus.ACTIVE,
        )
        session.add(user)
        await session.flush()
        session.add(
            UserIdentifier(
                user_id=user.id,
                identifier_type=IdentifierType.MOBILE,
                normalized_value=payload.mobile,
                masked_value=mask_mobile(payload.mobile),
                is_primary=True,
                is_verified=False,
            )
        )
        session.add(
            UserSecurity(
                user_id=user.id,
                hashed_password=hash_password(payload.password),
                password_changed_at=datetime.now(UTC),
                must_change_password=False,
                token_version=1,
            )
        )

        roles = await get_roles_by_codes(session, [UserRole.VEHICLE_OWNER.value])
        await create_membership(
            session,
            user_id=user.id,
            tenant=tenant,
            organization=organization,
            roles=roles,
            approved_by_id=None,
            designation=(
                "Primary Fleet Administrator"
                if payload.owner_type == OwnerType.COMPANY
                else "Vehicle Owner Applicant"
            ),
            is_primary=True,
            status=MembershipStatus.ACTIVE,
        )

        owner = VehicleOwner(
            tenant_id=tenant.id,
            root_organization_id=organization.id,
            primary_admin_user_id=user.id,
            application_number=generate_owner_application_number(),
            owner_code=generate_owner_code(),
            owner_type=payload.owner_type,
            claim_status=OwnerClaimStatus.CLAIMED,
            name=payload.full_name.strip(),
            nid_or_registration=payload.mobile,
            phone=payload.mobile,
            address="Application details pending",
            district="Pending",
            declaration_accepted=False,
            submitted_at=None,
            verification_status=OwnerVerificationStatus.PENDING,
        )
        session.add(owner)
        await session.flush()

        await write_audit_log(
            session,
            tenant_id=tenant.id,
            actor_user_id=user.id,
            actor_organization_id=organization.id,
            action="vehicle_owner.applicant_account_created",
            resource_type="vehicle_owner",
            resource_public_id=owner.id,
            ip_address=request_ip(request),
            user_agent=request_agent(request),
            new_values={
                "owner_type": payload.owner_type.value,
                "primary_login": "mobile",
                "application_submitted": False,
                "verification_status": owner.verification_status.value,
            },
        )
        await session.commit()
    except (ValueError, IntegrityError) as exc:
        await session.rollback()
        raise HTTPException(status_code=409, detail=str(exc)) from None

    return RegistrationResult(user=await build_user_read(session, user), can_login=True)
