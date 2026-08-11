import type { AuthUser } from "@/lib/auth/types"

export const USER_ROLES = {
  superAdmin: "super_admin",
  policeAdmin: "police_admin",
  policeOfficer: "police_officer",
  vtsApplicant: "vts_applicant",
  vtsAdmin: "vts_admin",
  vtsOperator: "vts_operator",
  vtsTechnical: "vts_technical",
  vtsViewer: "vts_viewer",
  vehicleOwner: "vehicle_owner",
  driver: "driver",
} as const

export const VTS_WORKSPACE_ROLES = [
  USER_ROLES.vtsApplicant,
  USER_ROLES.vtsAdmin,
  USER_ROLES.vtsOperator,
  USER_ROLES.vtsTechnical,
  USER_ROLES.vtsViewer,
] as const

export function getUserRoleCodes(user: AuthUser) {
  return new Set(user.memberships.flatMap((membership) => membership.role_codes))
}

export function userHasRole(user: AuthUser, role: string) {
  return user.primary_role === role || getUserRoleCodes(user).has(role)
}

export function userHasAnyRole(user: AuthUser, roles: readonly string[]) {
  return roles.some((role) => userHasRole(user, role))
}

export function dashboardPathForUser(user: AuthUser) {
  if (userHasRole(user, USER_ROLES.superAdmin)) {
    return "/super-admin/dashboard"
  }

  if (userHasAnyRole(user, VTS_WORKSPACE_ROLES)) {
    return "/provider/dashboard"
  }

  if (userHasRole(user, USER_ROLES.vehicleOwner)) {
    return "/owner/dashboard"
  }

  if (userHasRole(user, USER_ROLES.driver)) {
    return "/driver/dashboard"
  }

  return "/dashboard"
}
