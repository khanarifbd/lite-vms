from enum import StrEnum


class OwnerClaimStatus(StrEnum):
    PENDING_CLAIM = "pending_claim"
    CLAIMED = "claimed"


class OwnerProviderLinkStatus(StrEnum):
    PENDING_OWNER_APPROVAL = "pending_owner_approval"
    PENDING_PROVIDER_APPROVAL = "pending_provider_approval"
    ACTIVE = "active"
    REJECTED = "rejected"
    ENDED = "ended"
    SUSPENDED = "suspended"


class OwnerProviderRequestSource(StrEnum):
    OWNER = "owner"
    PROVIDER = "provider"


class OwnerProviderLinkDecision(StrEnum):
    APPROVE = "approve"
    REJECT = "reject"


class OwnerProviderVehicleScopeMode(StrEnum):
    ALL = "all"
    SELECTED = "selected"
