export type AuthIdentifier = {
  public_id: string
  identifier_type: string
  value: string
  masked_value: string | null
  is_primary: boolean
  is_verified: boolean
  verified_at: string | null
}

export type AuthMembership = {
  public_id: string
  tenant_public_id: string
  tenant_name: string
  organization_public_id: string
  organization_name: string
  organization_code: string
  status: string
  member_code: string | null
  designation: string | null
  is_primary: boolean
  role_codes: string[]
  valid_from: string
  valid_to: string | null
}

export type AuthUser = {
  public_id: string
  display_name: string
  username: string | null
  email: string | null
  mobile: string | null
  status: string
  preferred_language: string
  timezone: string
  identity_verification_status: string
  identity_assurance_level: string
  email_verified: boolean
  mobile_verified: boolean
  must_change_password: boolean
  last_login_at: string | null
  primary_role: string | null
  primary_tenant_public_id: string | null
  primary_tenant_name: string | null
  identifiers: AuthIdentifier[]
  memberships: AuthMembership[]
  created_at: string
  updated_at: string
  deleted_at: string | null
}

export type BackendLoginResponse = {
  access_token: string
  token_type: string
  expires_in: number
  session_public_id: string
  must_change_password: boolean
  user: AuthUser
}

export type LoginResult = {
  expiresIn: number
  sessionPublicId: string
  mustChangePassword: boolean
  user: AuthUser
}

export type SessionResult = {
  user: AuthUser
}
