import uuid
from datetime import UTC, date, datetime
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel, Field, field_validator, model_validator
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.common.enums import UserRole
from app.core.database import get_session
from app.modules.audit.service import write_audit_log
from app.modules.auth.dependencies import require_roles
from app.modules.auth.model import User
from app.modules.drivers.enums import (
    DriverDocumentStatus,
    DriverDocumentType,
    DriverLicenceStatus,
    DriverProfileChangeStatus,
    DriverReviewDecision,
    DriverVerificationStatus,
)
from app.modules.drivers.model import Driver, DriverDocument, DriverLicence
from app.modules.drivers.schema import DriverDocumentCreate, DriverRead
from app.modules.drivers.service import (
    build_driver_read,
    get_driver_for_user,
    normalize_driver_nid,
    replace_driver_documents,
)
from app.modules.settings.service import auto_approve_driver

router = APIRouter(prefix="/drivers", tags=["Driver Application"])


class DriverApplicationSubmit(BaseModel):
    full_name: str = Field(min_length=2, max_length=180)
    nid_reference: str = Field(min_length=10, max_length=120)
    date_of_birth: date | None = None
    father_name: str | None = Field(default=None, max_length=180)
    mother_name: str | None = Field(default=None, max_length=180)
    gender: str | None = Field(default=None, max_length=30)
    blood_group: str | None = Field(default=None, max_length=10)
    emergency_contact_name: str | None = Field(default=None, max_length=180)
    emergency_contact_phone: str | None = Field(default=None, max_length=30)
    present_address: str = Field(min_length=5, max_length=1000)
    permanent_address: str | None = Field(default=None, max_length=1000)
    district: str = Field(min_length=2, max_length=100)
    photo_url: str | None = Field(default=None, max_length=1000)
    employment_type: str | None = Field(default=None, max_length=60)
    shift_information: str | None = Field(default=None, max_length=1000)
    medical_fitness_expiry_date: date | None = None
    vehicle_classes: list[str] = Field(min_length=1, max_length=30)
    first_issue_date: date | None = None
    issue_date: date | None = None
    licence_expiry_date: date
    documents: list[DriverDocumentCreate] = Field(min_length=3, max_length=20)
    declaration_accepted: bool

    @field_validator("nid_reference")
    @classmethod
    def validate_nid(cls, value: str) -> str:
        return normalize_driver_nid(value)

    @field_validator("vehicle_classes")
    @classmethod
    def normalize_classes(cls, values: list[str]) -> list[str]:
        classes = sorted({value.strip().upper() for value in values if value.strip()})
        if not classes:
            raise ValueError("At least one BRTA vehicle class is required")
        return classes

    @model_validator(mode="after")
    def validate_application(self) -> "DriverApplicationSubmit":
        if not self.declaration_accepted:
            raise ValueError("The driver declaration must be accepted")
        if self.licence_expiry_date <= date.today():
            raise ValueError("Driving licence must not be expired")
        if self.issue_date and self.licence_expiry_date <= self.issue_date:
            raise ValueError("Licence expiry date must be after issue date")
        required = {
            DriverDocumentType.NATIONAL_ID_FRONT,
            DriverDocumentType.DRIVING_LICENCE_FRONT,
            DriverDocumentType.DRIVER_PHOTO,
        }
        document_types = {item.document_type for item in self.documents}
        missing = sorted(item.value for item in required - document_types)
        if missing:
            raise ValueError(f"Required driver documents are missing: {', '.join(missing)}")
        return self


class DriverProfileChangeReview(BaseModel):
    decision: DriverReviewDecision
    notes: str = Field(min_length=3, max_length=2000)


def request_ip(request: Request) -> str | None:
    return request.client.host if request.client else None


def request_agent(request: Request) -> str | None:
    return request.headers.get("user-agent")


async def ensure_unique_nid(
    session: AsyncSession,
    *,
    driver: Driver,
    nid_reference: str,
) -> None:
    duplicate_nid = await session.scalar(
        select(Driver.id).where(
            Driver.nid_reference == nid_reference,
            Driver.id != driver.id,
        )
    )
    if duplicate_nid is not None:
        raise HTTPException(status_code=409, detail="Driver NID is already registered")


def apply_driver_fields(driver: Driver, payload: DriverApplicationSubmit) -> None:
    driver.full_name = payload.full_name.strip()
    driver.nid_reference = payload.nid_reference
    driver.date_of_birth = payload.date_of_birth
    driver.father_name = payload.father_name
    driver.mother_name = payload.mother_name
    driver.gender = payload.gender
    driver.blood_group = payload.blood_group
    driver.emergency_contact_name = payload.emergency_contact_name
    driver.emergency_contact_phone = payload.emergency_contact_phone
    driver.present_address = payload.present_address
    driver.permanent_address = payload.permanent_address
    driver.district = payload.district
    driver.photo_url = payload.photo_url
    driver.employment_type = payload.employment_type
    driver.shift_information = payload.shift_information
    driver.medical_fitness_expiry_date = payload.medical_fitness_expiry_date
    driver.declaration_accepted = payload.declaration_accepted


def apply_licence_fields(
    licence: DriverLicence,
    payload: DriverApplicationSubmit,
) -> None:
    licence.vehicle_classes = payload.vehicle_classes
    licence.first_issue_date = payload.first_issue_date
    licence.issue_date = payload.issue_date
    licence.expiry_date = payload.licence_expiry_date


async def get_driver_and_licence(
    session: AsyncSession,
    *,
    user_id: int | None = None,
    driver_id: object | None = None,
) -> tuple[Driver, DriverLicence]:
    driver = (
        await get_driver_for_user(session, user_id)
        if user_id is not None
        else await session.get(Driver, driver_id)
    )
    if driver is None:
        raise HTTPException(status_code=404, detail="Driver applicant profile not found")
    licence = await session.scalar(
        select(DriverLicence).where(DriverLicence.driver_id == driver.id)
    )
    if licence is None:
        raise HTTPException(status_code=409, detail="Driver licence identity is missing")
    return driver, licence


@router.post("/me/application", response_model=DriverRead)
async def submit_my_driver_application(
    payload: DriverApplicationSubmit,
    request: Request,
    actor: Annotated[User, Depends(require_roles(UserRole.DRIVER))],
    session: Annotated[AsyncSession, Depends(get_session)],
) -> DriverRead:
    driver, licence = await get_driver_and_licence(session, user_id=actor.id)
    if driver.verification_status not in {
        DriverVerificationStatus.PENDING,
        DriverVerificationStatus.CHANGES_REQUESTED,
    }:
        raise HTTPException(
            status_code=409,
            detail=(
                "The initial Driver application is locked after submission/review. "
                "Use My profile to request a reviewed profile change."
            ),
        )
    await ensure_unique_nid(
        session,
        driver=driver,
        nid_reference=payload.nid_reference,
    )

    apply_driver_fields(driver, payload)
    apply_licence_fields(licence, payload)
    driver.submitted_at = datetime.now(UTC)
    driver.verification_status = DriverVerificationStatus.PENDING
    driver.reviewed_by_user_id = None
    driver.reviewed_at = None
    driver.review_notes = None
    licence.verification_status = DriverLicenceStatus.PENDING
    licence.verified_by_user_id = None
    licence.verified_at = None
    licence.review_notes = None
    actor.display_name = driver.full_name

    await replace_driver_documents(session, driver_id=driver.id, documents=payload.documents)
    auto_approved = await auto_approve_driver(session, driver)
    await write_audit_log(
        session,
        actor_user_id=actor.id,
        action="driver.application_submitted",
        resource_type="driver",
        resource_public_id=driver.id,
        ip_address=request_ip(request),
        user_agent=request_agent(request),
        new_values={
            "driver_code": driver.driver_code,
            "nid_collected": True,
            "document_count": len(payload.documents),
            "vehicle_classes": payload.vehicle_classes,
            "auto_approved": auto_approved,
            "verification_status": driver.verification_status.value,
        },
    )
    await session.commit()
    await session.refresh(driver)
    return await build_driver_read(session, driver)


@router.post("/me/profile-change", response_model=DriverRead)
async def submit_my_driver_profile_change(
    payload: DriverApplicationSubmit,
    request: Request,
    actor: Annotated[User, Depends(require_roles(UserRole.DRIVER))],
    session: Annotated[AsyncSession, Depends(get_session)],
) -> DriverRead:
    driver, _ = await get_driver_and_licence(session, user_id=actor.id)
    if driver.verification_status != DriverVerificationStatus.VERIFIED:
        raise HTTPException(
            status_code=409,
            detail="Only a verified Driver can submit a profile change request",
        )
    if driver.profile_change_status == DriverProfileChangeStatus.PENDING:
        raise HTTPException(
            status_code=409,
            detail="A Driver profile change is already awaiting Police review",
        )
    await ensure_unique_nid(
        session,
        driver=driver,
        nid_reference=payload.nid_reference,
    )

    now = datetime.now(UTC)
    driver.pending_profile_changes = payload.model_dump(mode="json")
    driver.profile_change_status = DriverProfileChangeStatus.PENDING
    driver.profile_change_submitted_at = now
    driver.profile_change_reviewed_at = None
    driver.profile_change_review_notes = None
    await write_audit_log(
        session,
        actor_user_id=actor.id,
        action="driver.profile_change_submitted",
        resource_type="driver",
        resource_public_id=driver.id,
        ip_address=request_ip(request),
        user_agent=request_agent(request),
        new_values={
            "profile_change_status": DriverProfileChangeStatus.PENDING.value,
            "changed_fields": sorted(
                field
                for field in payload.model_fields_set
                if field not in {"documents", "declaration_accepted"}
            ),
            "document_count": len(payload.documents),
            "verification_status": driver.verification_status.value,
        },
        reason="Driver requested an update to the verified profile",
    )
    await session.commit()
    await session.refresh(driver)
    return await build_driver_read(session, driver)


@router.post("/{driver_id}/profile-change/review", response_model=DriverRead)
async def review_driver_profile_change(
    driver_id: uuid.UUID,
    payload: DriverProfileChangeReview,
    request: Request,
    actor: Annotated[
        User,
        Depends(require_roles(UserRole.SUPER_ADMIN, UserRole.POLICE_ADMIN)),
    ],
    session: Annotated[AsyncSession, Depends(get_session)],
) -> DriverRead:
    driver, licence = await get_driver_and_licence(session, driver_id=driver_id)
    if (
        driver.profile_change_status != DriverProfileChangeStatus.PENDING
        or driver.pending_profile_changes is None
    ):
        raise HTTPException(
            status_code=409,
            detail="No Driver profile change is awaiting Police review",
        )
    now = datetime.now(UTC)
    previous_status = driver.profile_change_status
    proposed_fields = DriverApplicationSubmit.model_validate(
        driver.pending_profile_changes
    )

    if payload.decision == DriverReviewDecision.APPROVE:
        await ensure_unique_nid(
            session,
            driver=driver,
            nid_reference=proposed_fields.nid_reference,
        )
        apply_driver_fields(driver, proposed_fields)
        apply_licence_fields(licence, proposed_fields)
        await replace_driver_documents(
            session,
            driver_id=driver.id,
            documents=proposed_fields.documents,
        )
        documents = list(
            await session.scalars(
                select(DriverDocument).where(
                    DriverDocument.driver_id == driver.id,
                    DriverDocument.is_active.is_(True),
                )
            )
        )
        licence.verification_status = DriverLicenceStatus.VERIFIED
        licence.verified_by_user_id = actor.id
        licence.verified_at = now
        licence.review_notes = payload.notes
        for document in documents:
            document.status = DriverDocumentStatus.VERIFIED
            document.verified_by_user_id = actor.id
            document.verified_at = now
            document.review_notes = payload.notes
        driver.profile_change_status = DriverProfileChangeStatus.APPROVED
        driver.pending_profile_changes = None
        user = await session.get(User, driver.user_id)
        if user is not None:
            user.display_name = driver.full_name
    elif payload.decision == DriverReviewDecision.REQUEST_CHANGES:
        driver.profile_change_status = DriverProfileChangeStatus.CHANGES_REQUESTED
    else:
        driver.profile_change_status = DriverProfileChangeStatus.REJECTED

    driver.profile_change_reviewed_at = now
    driver.profile_change_review_notes = payload.notes
    await write_audit_log(
        session,
        actor_user_id=actor.id,
        action=f"driver.profile_change_{payload.decision.value}",
        resource_type="driver",
        resource_public_id=driver.id,
        ip_address=request_ip(request),
        user_agent=request_agent(request),
        previous_values={
            "profile_change_status": previous_status.value,
            "verification_status": driver.verification_status.value,
        },
        new_values={
            "profile_change_status": driver.profile_change_status.value,
            "verification_status": driver.verification_status.value,
        },
        reason=payload.notes,
    )
    await session.commit()
    await session.refresh(driver)
    return await build_driver_read(session, driver)
