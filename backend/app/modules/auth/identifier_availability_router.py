import uuid
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.ext.asyncio import AsyncSession

from app.common.enums import IdentifierType
from app.core.database import get_session
from app.modules.auth.dependencies import get_current_active_user
from app.modules.auth.identifier_schema import (
    IdentifierAvailabilityRead,
    normalize_identifier_value,
)
from app.modules.auth.identifier_service import (
    get_active_user_identifier_by_type,
    get_user_identifier_by_public_id,
)
from app.modules.auth.model import User
from app.modules.auth.service import get_identifier

router = APIRouter(prefix="/auth", tags=["User Login Identifiers"])


@router.get("/me/identifiers/availability", response_model=IdentifierAvailabilityRead)
async def check_my_identifier_availability(
    identifier_type: IdentifierType,
    value: Annotated[str, Query(min_length=3, max_length=255)],
    actor: Annotated[User, Depends(get_current_active_user)],
    session: Annotated[AsyncSession, Depends(get_session)],
    exclude_identifier_public_id: uuid.UUID | None = None,
) -> IdentifierAvailabilityRead:
    try:
        normalized_value = normalize_identifier_value(identifier_type, value)
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc

    excluded_identifier = None
    if exclude_identifier_public_id is not None:
        excluded_identifier = await get_user_identifier_by_public_id(
            session,
            user_id=actor.id,
            identifier_public_id=exclude_identifier_public_id,
        )
        if excluded_identifier is None:
            raise HTTPException(status_code=404, detail="Identifier not found")
        if excluded_identifier.identifier_type != identifier_type:
            raise HTTPException(
                status_code=422,
                detail="Excluded identifier type does not match the requested type",
            )

    current_type_identifier = await get_active_user_identifier_by_type(
        session,
        user_id=actor.id,
        identifier_type=identifier_type,
    )
    if current_type_identifier is not None and (
        excluded_identifier is None or current_type_identifier.id != excluded_identifier.id
    ):
        return IdentifierAvailabilityRead(
            identifier_type=identifier_type,
            normalized_value=normalized_value,
            available=False,
            message=(
                f"This account already has an active {identifier_type.value} identifier"
            ),
        )

    existing = await get_identifier(
        session,
        identifier_type=identifier_type,
        normalized_value=normalized_value,
    )
    available = existing is None or (
        excluded_identifier is not None and existing.id == excluded_identifier.id
    )
    return IdentifierAvailabilityRead(
        identifier_type=identifier_type,
        normalized_value=normalized_value,
        available=available,
        message=(
            f"{identifier_type.value.title()} is available"
            if available
            else f"{identifier_type.value.title()} is already registered"
        ),
    )
