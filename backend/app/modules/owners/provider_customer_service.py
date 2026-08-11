import uuid
from datetime import UTC, datetime

from sqlalchemy import func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.common.enums import (
    IdentifierType,
    OrganizationStatus,
    OwnerDocumentStatus,
    OwnerVerificationStatus,
    ProviderStatus,
    TenantStatus,
)
from app.modules.auth.admin_service import build_user_admin_read
from app.modules.auth.identifier_service import (
    create_user_identifier,
    set_primary_identifier,
    update_user_identifier_value,
)
from app.modules.auth.model import User, UserIdentifier
from app.modules.iam.model import Organization, Tenant
from app.modules.owners.enums import OwnerProviderLinkStatus
from app.modules.owners.model import (
    VehicleOwner,
    VehicleOwnerDocument,
    VTSProviderOwnerLink,
)
from app.modules.owners.provider_customer_schema import (
    ProviderManagedOwnerUpdate,
    ProviderOwnerCustomerPage,
    ProviderOwnerCustomerRead,
    ProviderOwnerCustomerSummary,
)
from app.modules.owners.service import (
    build_link_read,
    build_owner_read,
    replace_owner_documents,
)
from app.modules.providers.model import VTSProvider
from app.modules.providers.service import get_provider_for_user


class ProviderCustomerManagementError(ValueError):
    pass


async def require_approved_provider(
    session: AsyncSession,
    *,
    user_id: int,
) -> VTSProvider:
    provider = await get_provider_for_user(session, user_id)
    if provider is None:
        raise ProviderCustomerManagementError("VTS provider application not found")
    if provider.status != ProviderStatus.APPROVED:
        raise ProviderCustomerManagementError("VTS provider is not approved")
    return provider


async def get_provider_customer_link(
    session: AsyncSession,
    *,
    provider_id: uuid.UUID,
    owner_id: uuid.UUID,
) -> VTSProviderOwnerLink | None:
    return await session.scalar(
        select(VTSProviderOwnerLink).where(
            VTSProviderOwnerLink.provider_id == provider_id,
            VTSProviderOwnerLink.owner_id == owner_id,
        )
    )


async def require_active_customer_link(
    session: AsyncSession,
    *,
    provider_id: uuid.UUID,
    owner_id: uuid.UUID,
) -> tuple[VTSProviderOwnerLink, VehicleOwner]:
    link = await get_provider_customer_link(
        session,
        provider_id=provider_id,
        owner_id=owner_id,
    )
    if link is None:
        raise ProviderCustomerManagementError("Vehicle owner is not linked to this provider")
    if link.status != OwnerProviderLinkStatus.ACTIVE:
        raise ProviderCustomerManagementError(
            "Only an active provider-owner link can manage the owner account"
        )
    owner = await session.get(VehicleOwner, owner_id)
    if owner is None:
        raise ProviderCustomerManagementError("Vehicle owner not found")
    return link, owner


async def build_provider_customer_read(
    session: AsyncSession,
    *,
    link: VTSProviderOwnerLink,
) -> ProviderOwnerCustomerRead:
    owner = await session.get(VehicleOwner, link.owner_id)
    if owner is None:
        raise RuntimeError("Provider-owner link references a missing owner")
    account = None
    if link.status == OwnerProviderLinkStatus.ACTIVE and owner.primary_admin_user_id is not None:
        user = await session.get(User, owner.primary_admin_user_id)
        if user is not None and user.deleted_at is None:
            account = await build_user_admin_read(session, user)
    return ProviderOwnerCustomerRead(
        link=await build_link_read(session, link),
        owner=await build_owner_read(session, owner),
        account=account,
        can_manage=link.status == OwnerProviderLinkStatus.ACTIVE,
    )


async def build_provider_customer_summary(
    session: AsyncSession,
    *,
    provider: VTSProvider,
) -> ProviderOwnerCustomerSummary:
    rows = (
        await session.execute(
            select(VTSProviderOwnerLink.status, func.count(VTSProviderOwnerLink.id))
            .where(VTSProviderOwnerLink.provider_id == provider.id)
            .group_by(VTSProviderOwnerLink.status)
        )
    ).all()
    counts = {status: int(count) for status, count in rows}
    return ProviderOwnerCustomerSummary(
        provider_id=provider.id,
        total=sum(counts.values()),
        active=counts.get(OwnerProviderLinkStatus.ACTIVE, 0),
        pending_owner_approval=counts.get(OwnerProviderLinkStatus.PENDING_OWNER_APPROVAL, 0),
        pending_provider_approval=counts.get(OwnerProviderLinkStatus.PENDING_PROVIDER_APPROVAL, 0),
        rejected=counts.get(OwnerProviderLinkStatus.REJECTED, 0),
        ended=counts.get(OwnerProviderLinkStatus.ENDED, 0),
        suspended=counts.get(OwnerProviderLinkStatus.SUSPENDED, 0),
    )


async def list_provider_customers(
    session: AsyncSession,
    *,
    provider: VTSProvider,
    link_status: OwnerProviderLinkStatus | None,
    search: str | None,
    offset: int,
    limit: int,
) -> ProviderOwnerCustomerPage:
    query = (
        select(VTSProviderOwnerLink)
        .join(VehicleOwner, VehicleOwner.id == VTSProviderOwnerLink.owner_id)
        .where(VTSProviderOwnerLink.provider_id == provider.id)
    )
    count_query = (
        select(func.count(VTSProviderOwnerLink.id))
        .join(VehicleOwner, VehicleOwner.id == VTSProviderOwnerLink.owner_id)
        .where(VTSProviderOwnerLink.provider_id == provider.id)
    )
    if link_status is not None:
        query = query.where(VTSProviderOwnerLink.status == link_status)
        count_query = count_query.where(VTSProviderOwnerLink.status == link_status)
    if search:
        pattern = f"%{search.strip().lower()}%"
        condition = or_(
            func.lower(VehicleOwner.name).like(pattern),
            func.lower(VehicleOwner.owner_code).like(pattern),
            func.lower(VehicleOwner.application_number).like(pattern),
            func.lower(VehicleOwner.email).like(pattern),
            func.lower(VehicleOwner.phone).like(pattern),
        )
        query = query.where(condition)
        count_query = count_query.where(condition)
    links = list(
        await session.scalars(
            query.order_by(VTSProviderOwnerLink.created_at.desc()).offset(offset).limit(limit)
        )
    )
    return ProviderOwnerCustomerPage(
        items=[await build_provider_customer_read(session, link=link) for link in links],
        total=int(await session.scalar(count_query) or 0),
        offset=offset,
        limit=limit,
    )


async def get_active_identifier_by_type(
    session: AsyncSession,
    *,
    user_id: int,
    identifier_type: IdentifierType,
) -> UserIdentifier | None:
    return await session.scalar(
        select(UserIdentifier)
        .where(
            UserIdentifier.user_id == user_id,
            UserIdentifier.identifier_type == identifier_type,
            UserIdentifier.disabled_at.is_(None),
        )
        .order_by(UserIdentifier.is_primary.desc(), UserIdentifier.created_at)
    )


async def upsert_identifier(
    session: AsyncSession,
    *,
    user_id: int,
    identifier_type: IdentifierType,
    value: str,
) -> UserIdentifier:
    identifier = await get_active_identifier_by_type(
        session,
        user_id=user_id,
        identifier_type=identifier_type,
    )
    if identifier is None:
        return await create_user_identifier(
            session,
            user_id=user_id,
            identifier_type=identifier_type,
            value=value,
            make_primary=False,
            verification_method="managed_by_linked_vts_provider",
        )
    await update_user_identifier_value(
        session,
        identifier=identifier,
        value=value,
        verification_method="managed_by_linked_vts_provider",
    )
    return identifier


async def update_provider_customer(
    session: AsyncSession,
    *,
    provider: VTSProvider,
    actor_user_id: int,
    owner_id: uuid.UUID,
    payload: ProviderManagedOwnerUpdate,
) -> tuple[ProviderOwnerCustomerRead, bool]:
    link, owner = await require_active_customer_link(
        session,
        provider_id=provider.id,
        owner_id=owner_id,
    )
    changes = payload.model_dump(exclude_unset=True)
    documents = changes.pop("documents", None)
    account_fields = {
        "display_name",
        "email",
        "mobile",
        "username",
        "preferred_language",
        "timezone",
        "primary_identifier_type",
    }
    account_changes = {
        field: changes.pop(field) for field in list(changes) if field in account_fields
    }

    field_map = {
        "owner_name": "name",
        "registered_address": "address",
    }
    sensitive_registry_fields = {
        "owner_name",
        "trade_license_number",
        "tin_number",
        "bin_number",
    }
    reverification_required = bool(
        documents is not None or sensitive_registry_fields.intersection(changes)
    )
    for field, value in changes.items():
        setattr(owner, field_map.get(field, field), value)

    if documents is not None:
        await replace_owner_documents(
            session,
            owner_id=owner.id,
            documents=documents,
        )

    user = (
        await session.get(User, owner.primary_admin_user_id)
        if owner.primary_admin_user_id is not None
        else None
    )
    if account_changes and user is None:
        raise ProviderCustomerManagementError(
            "The linked owner does not have a manageable user account"
        )
    if user is not None:
        if "display_name" in account_changes:
            user.display_name = account_changes["display_name"]
        if "preferred_language" in account_changes:
            user.preferred_language = account_changes["preferred_language"]
        if "timezone" in account_changes:
            user.timezone = account_changes["timezone"]

        if "email" in account_changes:
            await upsert_identifier(
                session,
                user_id=user.id,
                identifier_type=IdentifierType.EMAIL,
                value=account_changes["email"],
            )
            owner.email = account_changes["email"]
        if "mobile" in account_changes:
            await upsert_identifier(
                session,
                user_id=user.id,
                identifier_type=IdentifierType.MOBILE,
                value=account_changes["mobile"],
            )
            owner.phone = account_changes["mobile"]
        if "username" in account_changes:
            await upsert_identifier(
                session,
                user_id=user.id,
                identifier_type=IdentifierType.USERNAME,
                value=account_changes["username"],
            )
        if "primary_identifier_type" in account_changes:
            primary = await get_active_identifier_by_type(
                session,
                user_id=user.id,
                identifier_type=account_changes["primary_identifier_type"],
            )
            if primary is None:
                raise ProviderCustomerManagementError(
                    "The requested primary identifier type is not attached to the owner"
                )
            await set_primary_identifier(
                session,
                user_id=user.id,
                identifier=primary,
            )
        user.updated_by_id = actor_user_id

    if reverification_required:
        owner.verification_status = OwnerVerificationStatus.PENDING
        owner.reviewed_by_id = None
        owner.reviewed_at = None
        owner.review_notes = None
        owner.submitted_at = datetime.now(UTC)
        if owner.tenant_id is not None:
            tenant = await session.get(Tenant, owner.tenant_id)
            if tenant is not None:
                tenant.status = TenantStatus.PENDING
        if owner.root_organization_id is not None:
            organization = await session.get(Organization, owner.root_organization_id)
            if organization is not None:
                organization.status = OrganizationStatus.PENDING
        owner_documents = list(
            await session.scalars(
                select(VehicleOwnerDocument).where(VehicleOwnerDocument.owner_id == owner.id)
            )
        )
        for document in owner_documents:
            document.status = OwnerDocumentStatus.PENDING
            document.verified_by_id = None
            document.verified_at = None
            document.review_notes = None

    await session.flush()
    return await build_provider_customer_read(session, link=link), reverification_required
