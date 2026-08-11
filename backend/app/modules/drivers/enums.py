from enum import StrEnum


class DriverClaimStatus(StrEnum):
    PENDING_CLAIM = "pending_claim"
    CLAIMED = "claimed"


class DriverVerificationStatus(StrEnum):
    PENDING = "pending"
    UNDER_REVIEW = "under_review"
    VERIFIED = "verified"
    CHANGES_REQUESTED = "changes_requested"
    REJECTED = "rejected"
    SUSPENDED = "suspended"


class DriverProfileChangeStatus(StrEnum):
    PENDING = "pending"
    APPROVED = "approved"
    CHANGES_REQUESTED = "changes_requested"
    REJECTED = "rejected"


class DriverReviewDecision(StrEnum):
    APPROVE = "approve"
    REJECT = "reject"
    REQUEST_CHANGES = "request_changes"


class DriverLicenceType(StrEnum):
    PROFESSIONAL = "professional"
    NON_PROFESSIONAL = "non_professional"
    LEARNER = "learner"


class DriverLicenceStatus(StrEnum):
    PENDING = "pending"
    VERIFIED = "verified"
    EXPIRED = "expired"
    SUSPENDED = "suspended"
    REVOKED = "revoked"
    REJECTED = "rejected"


class DriverDocumentType(StrEnum):
    NATIONAL_ID_FRONT = "national_id_front"
    NATIONAL_ID_BACK = "national_id_back"
    DRIVING_LICENCE_FRONT = "driving_licence_front"
    DRIVING_LICENCE_BACK = "driving_licence_back"
    DRIVER_PHOTO = "driver_photo"
    MEDICAL_CERTIFICATE = "medical_certificate"
    POLICE_CLEARANCE = "police_clearance"
    OTHER = "other"


class DriverDocumentStatus(StrEnum):
    PENDING = "pending"
    VERIFIED = "verified"
    REJECTED = "rejected"


class DriverLinkStatus(StrEnum):
    PENDING_DRIVER_APPROVAL = "pending_driver_approval"
    PENDING_ORGANIZATION_APPROVAL = "pending_organization_approval"
    ACTIVE = "active"
    REJECTED = "rejected"
    SUSPENDED = "suspended"
    ENDED = "ended"


class DriverLinkSource(StrEnum):
    DRIVER = "driver"
    VTS_PROVIDER = "vts_provider"
    VEHICLE_OWNER = "vehicle_owner"


class DriverLinkDecision(StrEnum):
    APPROVE = "approve"
    REJECT = "reject"


class DriverAssignmentStatus(StrEnum):
    PENDING = "pending"
    ACTIVE = "active"
    ENDED = "ended"
    SUSPENDED = "suspended"
    REJECTED = "rejected"
