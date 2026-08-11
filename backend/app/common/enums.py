from enum import StrEnum


class ProviderStatus(StrEnum):
    PENDING = "pending"
    UNDER_REVIEW = "under_review"
    APPROVED = "approved"
    REJECTED = "rejected"
    SUSPENDED = "suspended"


class ProviderDocumentType(StrEnum):
    BTRC_LICENSE = "btrc_license"
    TRADE_LICENSE = "trade_license"
    INCORPORATION_CERTIFICATE = "incorporation_certificate"
    TIN_CERTIFICATE = "tin_certificate"
    BIN_CERTIFICATE = "bin_certificate"
    AUTHORIZED_PERSON_ID = "authorized_person_id"
    OTHER = "other"


class ProviderDocumentStatus(StrEnum):
    PENDING = "pending"
    VERIFIED = "verified"
    REJECTED = "rejected"


class ProviderReviewDecision(StrEnum):
    APPROVE = "approve"
    REJECT = "reject"
    REQUEST_CHANGES = "request_changes"


class OwnerType(StrEnum):
    INDIVIDUAL = "individual"
    COMPANY = "company"


class OwnerVerificationStatus(StrEnum):
    PENDING = "pending"
    UNDER_REVIEW = "under_review"
    APPROVED = "approved"
    CHANGES_REQUESTED = "changes_requested"
    REJECTED = "rejected"
    SUSPENDED = "suspended"


class OwnerDocumentType(StrEnum):
    NATIONAL_ID = "national_id"
    PASSPORT = "passport"
    COMPANY_REGISTRATION = "company_registration"
    TRADE_LICENSE = "trade_license"
    TIN_CERTIFICATE = "tin_certificate"
    BIN_CERTIFICATE = "bin_certificate"
    AUTHORIZED_PERSON_ID = "authorized_person_id"
    OTHER = "other"


class OwnerDocumentStatus(StrEnum):
    PENDING = "pending"
    VERIFIED = "verified"
    REJECTED = "rejected"


class OwnerReviewDecision(StrEnum):
    APPROVE = "approve"
    REJECT = "reject"
    REQUEST_CHANGES = "request_changes"


class VehicleVerificationStatus(StrEnum):
    DRAFT = "draft"
    PENDING_VERIFICATION = "pending_verification"
    UNDER_REVIEW = "under_review"
    VERIFIED = "verified"
    CHANGES_REQUESTED = "changes_requested"
    REJECTED = "rejected"
    SUSPENDED = "suspended"
    DECOMMISSIONED = "decommissioned"


class VehicleReviewDecision(StrEnum):
    APPROVE = "approve"
    REJECT = "reject"
    REQUEST_CHANGES = "request_changes"


class TelemetrySourceType(StrEnum):
    VTS_PROVIDER = "vts_provider"
    OWNER_MANAGED = "owner_managed"


class TelemetrySourceStatus(StrEnum):
    PENDING = "pending"
    TESTING = "testing"
    ACTIVE = "active"
    SUSPENDED = "suspended"
    REJECTED = "rejected"


class DeviceOwnershipType(StrEnum):
    PROVIDER_OWNED = "provider_owned"
    OWNER_OWNED = "owner_owned"
    LEASED = "leased"


class DeviceCertificationStatus(StrEnum):
    PENDING = "pending"
    TESTING = "testing"
    APPROVED = "approved"
    REJECTED = "rejected"
    SUSPENDED = "suspended"


class DeviceOperationalStatus(StrEnum):
    PENDING = "pending"
    ACTIVE = "active"
    SUSPENDED = "suspended"
    RETIRED = "retired"


class TrackingAssignmentStatus(StrEnum):
    PENDING_PROVIDER_CONFIRMATION = "pending_provider_confirmation"
    TESTING = "testing"
    ACTIVE = "active"
    ENDED = "ended"
    REJECTED = "rejected"


class TrackingReviewDecision(StrEnum):
    APPROVE = "approve"
    REJECT = "reject"


class EntityStatus(StrEnum):
    ACTIVE = "active"
    INACTIVE = "inactive"
    SUSPENDED = "suspended"


class AssignmentStatus(StrEnum):
    ACTIVE = "active"
    ENDED = "ended"


class DocumentType(StrEnum):
    REGISTRATION = "registration"
    TAX_TOKEN = "tax_token"
    FITNESS = "fitness"
    ROUTE_PERMIT = "route_permit"
    INSURANCE = "insurance"


class DocumentStatus(StrEnum):
    VALID = "valid"
    EXPIRED = "expired"
    PENDING_VERIFICATION = "pending_verification"
    REVOKED = "revoked"


class ViolationType(StrEnum):
    OVERSPEED = "overspeed"
    ROUTE_VIOLATION = "route_violation"
    GEOFENCE_VIOLATION = "geofence_violation"
    DOCUMENT_EXPIRED = "document_expired"


class ViolationStatus(StrEnum):
    PENDING_REVIEW = "pending_review"
    APPROVED = "approved"
    REJECTED = "rejected"
    MORE_INFORMATION_REQUIRED = "more_information_required"


class EnforcementSeverity(StrEnum):
    LOW = "low"
    MEDIUM = "medium"
    HIGH = "high"
    CRITICAL = "critical"


class EnforcementScope(StrEnum):
    NATIONAL = "national"
    JURISDICTION = "jurisdiction"
    ZONE = "zone"
    VEHICLE = "vehicle"


class EnforcementAreaType(StrEnum):
    NATIONAL = "national"
    POLYGON = "polygon"
    CIRCLE = "circle"
    ROAD_CORRIDOR = "road_corridor"


class ExemptionReason(StrEnum):
    EMERGENCY_SERVICE = "emergency_service"
    LAW_ENFORCEMENT = "law_enforcement"
    SPECIAL_PERMIT = "special_permit"
    TESTING = "testing"
    OTHER = "other"


class ReviewDecision(StrEnum):
    APPROVE = "approve"
    REJECT = "reject"


class UserRole(StrEnum):
    SUPER_ADMIN = "super_admin"
    POLICE_ADMIN = "police_admin"
    POLICE_OFFICER = "police_officer"
    VTS_APPLICANT = "vts_applicant"
    VTS_ADMIN = "vts_admin"
    VTS_OPERATOR = "vts_operator"
    VTS_TECHNICAL = "vts_technical"
    VTS_VIEWER = "vts_viewer"
    VEHICLE_OWNER = "vehicle_owner"
    DRIVER = "driver"


class UserStatus(StrEnum):
    PENDING = "pending"
    ACTIVE = "active"
    SUSPENDED = "suspended"
    LOCKED = "locked"
    DISABLED = "disabled"
    DELETED = "deleted"


class TenantStatus(StrEnum):
    PENDING = "pending"
    ACTIVE = "active"
    SUSPENDED = "suspended"
    DISABLED = "disabled"


class OrganizationStatus(StrEnum):
    PENDING = "pending"
    ACTIVE = "active"
    SUSPENDED = "suspended"
    DISABLED = "disabled"


class MembershipStatus(StrEnum):
    PENDING = "pending"
    ACTIVE = "active"
    SUSPENDED = "suspended"
    ENDED = "ended"


class IdentifierType(StrEnum):
    USERNAME = "username"
    EMAIL = "email"
    MOBILE = "mobile"
    POLICE_SERVICE_NUMBER = "police_service_number"
    BADGE_NUMBER = "badge_number"
    VTS_EMPLOYEE_ID = "vts_employee_id"
    OWNER_REGISTRATION_REFERENCE = "owner_registration_reference"
    GOVERNMENT_IDENTITY_REFERENCE = "government_identity_reference"


class IdentityVerificationStatus(StrEnum):
    UNVERIFIED = "unverified"
    PENDING = "pending"
    VERIFIED = "verified"
    REJECTED = "rejected"


class IdentityAssuranceLevel(StrEnum):
    BASIC = "basic"
    SUBSTANTIAL = "substantial"
    HIGH = "high"


class OrganizationType(StrEnum):
    SYSTEM = "system"
    BANGLADESH_POLICE = "bangladesh_police"
    POLICE_UNIT = "police_unit"
    BRTA = "brta"
    BRTC = "brtc"
    VTS_PROVIDER = "vts_provider"
    VEHICLE_OWNER_COMPANY = "vehicle_owner_company"
    INDIVIDUAL_VEHICLE_OWNER = "individual_vehicle_owner"
    GOVERNMENT_AGENCY = "government_agency"
    AUDITOR = "auditor"


class TenantType(StrEnum):
    SYSTEM = "system"
    POLICE = "police"
    GOVERNMENT = "government"
    VTS_PROVIDER = "vts_provider"
    VEHICLE_OWNER = "vehicle_owner"
    AUDITOR = "auditor"
