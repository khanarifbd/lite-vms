# Import every model here so Alembic can discover the full metadata graph.
from app.modules.assignments.model import DriverAssignment
from app.modules.audit.model import AuditLog
from app.modules.auth.model import (
    IdentityDocument,
    PoliceProfile,
    User,
    UserIdentifier,
    UserSecurity,
    UserSession,
    VTSUserProfile,
)
from app.modules.documents.model import VehicleDocument
from app.modules.drivers.model import (
    Driver,
    DriverDocument,
    DriverLicence,
    VehicleOwnerDriverLink,
    VTSProviderDriverLink,
)
from app.modules.drivers.recovery_model import DriverMobilePasswordResetChallenge
from app.modules.enforcement.model import (
    EnforcementCase,
    EnforcementGeofence,
    EnforcementJurisdiction,
    EnforcementPolicy,
    SpeedRule,
    VehicleEnforcementExemption,
)
from app.modules.iam.model import (
    MembershipRole,
    Organization,
    OrganizationMembership,
    Permission,
    Role,
    RolePermission,
    Tenant,
)
from app.modules.owners.model import (
    VehicleOwner,
    VehicleOwnerDocument,
    VTSProviderOwnerLink,
    VTSProviderOwnerVehicleAccess,
)
from app.modules.owners.recovery_model import OwnerMobilePasswordResetChallenge
from app.modules.providers.model import (
    VTSProvider,
    VTSProviderAllowedIP,
    VTSProviderDocument,
)
from app.modules.qr_verification.model import VehicleQRToken
from app.modules.settings.model import SystemConfiguration
from app.modules.telemetry.model import TelemetryPoint
from app.modules.tracking.model import (
    TelemetrySource,
    TrackingDevice,
    VehicleDeviceAssignment,
)
from app.modules.vehicles.model import Vehicle
from app.modules.violations.model import ViolationCandidate

__all__ = [
    "AuditLog",
    "Driver",
    "DriverAssignment",
    "DriverDocument",
    "DriverLicence",
    "DriverMobilePasswordResetChallenge",
    "EnforcementCase",
    "EnforcementGeofence",
    "EnforcementJurisdiction",
    "EnforcementPolicy",
    "IdentityDocument",
    "MembershipRole",
    "Organization",
    "OrganizationMembership",
    "OwnerMobilePasswordResetChallenge",
    "Permission",
    "PoliceProfile",
    "Role",
    "RolePermission",
    "SpeedRule",
    "SystemConfiguration",
    "TelemetryPoint",
    "TelemetrySource",
    "Tenant",
    "TrackingDevice",
    "User",
    "UserIdentifier",
    "UserSecurity",
    "UserSession",
    "VTSProvider",
    "VTSProviderAllowedIP",
    "VTSProviderDocument",
    "VTSProviderDriverLink",
    "VTSProviderOwnerLink",
    "VTSProviderOwnerVehicleAccess",
    "VehicleEnforcementExemption",
    "VehicleOwnerDriverLink",
    "VTSUserProfile",
    "Vehicle",
    "VehicleDeviceAssignment",
    "VehicleDocument",
    "VehicleOwner",
    "VehicleOwnerDocument",
    "VehicleQRToken",
    "ViolationCandidate",
]
