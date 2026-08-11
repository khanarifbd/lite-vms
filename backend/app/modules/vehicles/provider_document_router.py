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
from app.modules.vehicles.provider_document_schema import (
    ProviderVehicleDocumentPage,
    ProviderVehicleDocumentRead,
)
from app.modules.vehicles.provider_registration_router import get_provider_vehicle

router = APIRouter(
    prefix="/vehicles/provider-registration/{vehicle_id}/documents",
    tags=["VTS Provider Vehicle Documents"],
)

PROVIDER_DOCUMENT_READ_ROLES = (
    UserRole.VTS_ADMIN,
    UserRole.VTS_OPERATOR,
    UserRole.VTS_TECHNICAL,
    UserRole.VTS_VIEWER,
)
PROVIDER_DOCUMENT_MANAGE_ROLES = (UserRole.VTS_ADMIN, UserRole.VTS_OPERATOR)
ROUTE_SCOPE = "provider-registration"


@router.get("", response_model=ProviderVehicleDocumentPage)
async def list_provider_vehicle_documents(
    vehicle_id: uuid.UUID,
    actor: Annotated[User, Depends(require_roles(*PROVIDER_DOCUMENT_READ_ROLES))],
    session: Annotated[AsyncSession, Depends(get_session)],
    include_history: bool = Query(default=True),
) -> ProviderVehicleDocumentPage:
    await get_provider_vehicle(session, actor=actor, vehicle_id=vehicle_id)
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
async def upload_provider_vehicle_document(
    vehicle_id: uuid.UUID,
    actor: Annotated[User, Depends(require_roles(*PROVIDER_DOCUMENT_MANAGE_ROLES))],
    session: Annotated[AsyncSession, Depends(get_session)],
    document_type: Annotated[DocumentType, Form()],
    file: UploadFile = File(...),
    document_number: Annotated[str | None, Form(max_length=120)] = None,
    issued_at: Annotated[date | None, Form()] = None,
    expires_at: Annotated[date | None, Form()] = None,
) -> ProviderVehicleDocumentRead:
    vehicle, provider = await get_provider_vehicle(
        session,
        actor=actor,
        vehicle_id=vehicle_id,
    )
    return await upload_vehicle_document(
        session,
        vehicle=vehicle,
        actor=actor,
        tenant_id=provider.tenant_id,
        actor_organization_id=provider.root_organization_id,
        source="vts_provider",
        route_scope=ROUTE_SCOPE,
        document_type=document_type,
        file=file,
        document_number=document_number,
        issued_at=issued_at,
        expires_at=expires_at,
    )


@router.get("/{document_id}/download", response_class=FileResponse)
async def download_provider_vehicle_document(
    vehicle_id: uuid.UUID,
    document_id: uuid.UUID,
    actor: Annotated[User, Depends(require_roles(*PROVIDER_DOCUMENT_READ_ROLES))],
    session: Annotated[AsyncSession, Depends(get_session)],
) -> FileResponse:
    await get_provider_vehicle(session, actor=actor, vehicle_id=vehicle_id)
    document = await session.get(VehicleDocument, document_id)
    if document is None or document.vehicle_id != vehicle_id:
        raise HTTPException(status_code=404, detail="Vehicle document not found")
    return vehicle_document_file_response(document)
