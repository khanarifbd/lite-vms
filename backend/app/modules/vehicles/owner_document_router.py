import uuid
from datetime import date
from typing import Annotated

from fastapi import APIRouter, Depends, File, Form, HTTPException, Query, UploadFile, status
from fastapi.responses import FileResponse
from sqlalchemy.ext.asyncio import AsyncSession

from app.common.enums import DocumentType, UserRole
from app.core.database import get_session
from app.modules.auth.dependencies import require_roles
from app.modules.auth.model import User
from app.modules.documents.model import VehicleDocument
from app.modules.vehicles.document_management_service import (
    list_vehicle_documents,
    upload_vehicle_document,
    vehicle_document_file_response,
)
from app.modules.vehicles.owner_registration_router import (
    require_approved_owner,
    require_owner_vehicle,
)
from app.modules.vehicles.provider_document_schema import (
    ProviderVehicleDocumentPage,
    ProviderVehicleDocumentRead,
)

router = APIRouter(
    prefix="/vehicles/owner-registration/{vehicle_id}/documents",
    tags=["Vehicle Owner Documents"],
)

ROUTE_SCOPE = "owner-registration"


@router.get("", response_model=ProviderVehicleDocumentPage)
async def list_owner_vehicle_documents(
    vehicle_id: uuid.UUID,
    actor: Annotated[User, Depends(require_roles(UserRole.VEHICLE_OWNER))],
    session: Annotated[AsyncSession, Depends(get_session)],
    include_history: bool = Query(default=True),
) -> ProviderVehicleDocumentPage:
    owner = await require_approved_owner(session, actor)
    await require_owner_vehicle(session, owner=owner, vehicle_id=vehicle_id)
    return await list_vehicle_documents(
        session,
        vehicle_id=vehicle_id,
        include_history=include_history,
        route_scope=ROUTE_SCOPE,
    )


@router.post(
    "",
    response_model=ProviderVehicleDocumentRead,
    status_code=status.HTTP_201_CREATED,
)
async def upload_owner_vehicle_document(
    vehicle_id: uuid.UUID,
    actor: Annotated[User, Depends(require_roles(UserRole.VEHICLE_OWNER))],
    session: Annotated[AsyncSession, Depends(get_session)],
    document_type: Annotated[DocumentType, Form()],
    file: UploadFile = File(...),
    document_number: Annotated[str | None, Form(max_length=120)] = None,
    issued_at: Annotated[date | None, Form()] = None,
    expires_at: Annotated[date | None, Form()] = None,
) -> ProviderVehicleDocumentRead:
    owner = await require_approved_owner(session, actor)
    vehicle = await require_owner_vehicle(session, owner=owner, vehicle_id=vehicle_id)
    return await upload_vehicle_document(
        session,
        vehicle=vehicle,
        actor=actor,
        tenant_id=owner.tenant_id,
        actor_organization_id=owner.root_organization_id,
        source="vehicle_owner",
        route_scope=ROUTE_SCOPE,
        document_type=document_type,
        file=file,
        document_number=document_number,
        issued_at=issued_at,
        expires_at=expires_at,
    )


@router.get("/{document_id}/download", response_class=FileResponse)
async def download_owner_vehicle_document(
    vehicle_id: uuid.UUID,
    document_id: uuid.UUID,
    actor: Annotated[User, Depends(require_roles(UserRole.VEHICLE_OWNER))],
    session: Annotated[AsyncSession, Depends(get_session)],
) -> FileResponse:
    owner = await require_approved_owner(session, actor)
    await require_owner_vehicle(session, owner=owner, vehicle_id=vehicle_id)
    document = await session.get(VehicleDocument, document_id)
    if document is None or document.vehicle_id != vehicle_id:
        raise HTTPException(status_code=404, detail="Vehicle document not found")
    return vehicle_document_file_response(document)
