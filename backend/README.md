# Bangladesh National Vehicle Platform — Backend

FastAPI backend foundation for the Bangladesh National Vehicle Tracking & Enforcement Platform.

## Core architecture

- a user is a global login identity
- a tenant is an independent authority, company, or owner data boundary
- organizations form a hierarchy inside a tenant
- roles and permissions come from organization memberships
- a VTS provider is a tracking-service company, not the owner of its customers' vehicles
- a vehicle owner exists once in the national owner registry
- an individual owner is uniquely identified by normalized NID; a company owner uses its registration reference
- a provider-owner link represents consent and business relationship
- a vehicle always belongs to the owner; tracking source/device assignments are time-bound
- supported telemetry sources are approved VTS providers and approved owner-managed devices

```text
Global Vehicle Owner
├── Owner User Account
├── Linked VTS Providers
└── Vehicles
    └── Time-bound Tracking Assignment
        ├── VTS Provider Device
        └── Owner-managed Device
```

## Local setup

```bash
python3 -m venv .venv
source .venv/bin/activate
python -m pip install --upgrade pip
python -m pip install -r requirements.txt
cp .env.example .env
python -m alembic upgrade head
python -m uvicorn app.main:app --reload
```

Swagger: `http://127.0.0.1:8000/docs`

## Development migrations

- `0003_identity_and_tenancy` — national identity, tenant, organization, membership, role, and permission model
- `0004_unified_vts_registration` — VTS company application and approval
- `0005_vehicle_owner_tracking` — owner/vehicle/device/assignment/telemetry domain foundation
- `0006_owner_provider_registry` — owner claim metadata and provider-owner consent links
- `0007_owner_mobile_password_reset` — mobile OTP password-reset challenges
- `0008_provider_primary_owner` — one primary VTS provider per owning user

A clean local development reset:

```bash
rm -f vehicle_platform.db
python -m alembic upgrade head
python -m uvicorn app.main:app --reload
```

## VTS user signup and provider ownership

A VTS company is not created during user signup. Signup creates only a login identity with the limited `vts_applicant` role:

```text
POST /api/v1/auth/register
POST /api/v1/auth/login
GET  /api/v1/providers/me
```

Signup request:

```json
{
  "email": "admin@abcvts.example",
  "mobile": "+8801712345678",
  "full_name": "ABC VTS Administrator",
  "password": "Strong-Applicant-Password-123"
}
```

After login, `GET /api/v1/providers/me` returns `404` while the user has no provider. The logged-in applicant then submits the company form:

```text
POST /api/v1/providers/register
```

The provider request no longer accepts administrator email, mobile, name, or password. The logged-in user becomes `primary_admin_user_id`; contact name, email, and mobile come from that existing user account. The transaction creates the pending provider tenant, root organization, `vts_admin` membership, provider profile, documents, allowed IPs, and audit record.

The user may own only one primary VTS provider. Company name, BTRC licence, and trade licence remain globally duplicate-protected. Vehicle/device/telemetry operations remain blocked until Police/System approval.

### Super Admin creates a provider for an existing user

```text
POST /api/v1/providers/admin-create
```

The same provider form is used, but Super Admin must include:

```json
{
  "primary_admin_user_public_id": "EXISTING_USER_PUBLIC_UUID"
}
```

The target user must already exist, be active, and have email and mobile identifiers. The target user becomes the provider owner and primary VTS administrator. Super Admin cannot create an ownerless provider, and the same user cannot be selected for a second primary provider.

Provider application routes:

```text
POST  /api/v1/providers/register
POST  /api/v1/providers/admin-create
GET   /api/v1/providers/me
GET   /api/v1/providers/{provider_id}
PATCH /api/v1/providers/{provider_id}
GET   /api/v1/providers
POST  /api/v1/providers/{provider_id}/review
```

Authentication accepts email, mobile, or username:

```text
POST  /api/v1/auth/login
POST  /api/v1/auth/logout
GET   /api/v1/auth/me
PATCH /api/v1/auth/me
POST  /api/v1/auth/me/change-password
```

## Global vehicle-owner registry

Duplicate prevention uses the owner identity reference:

```text
Individual owner → normalized NID
Company owner    → normalized company registration reference
```

Names, email addresses, mobile numbers, and usernames are not owner duplicate keys. Identity references are masked in API responses.

### VTS provider checks an owner

```text
POST /api/v1/owners/lookup
```

```json
{
  "owner_type": "individual",
  "identity_or_registration_reference": "19876543210987654"
}
```

Possible result:

```text
owner does not exist → complete_owner_registration
owner exists         → request_owner_link / already_linked
```

No duplicate owner is created.

### VTS provider creates an owner account

```text
POST /api/v1/owners/provider-register
```

For a new owner, the VTS provider submits the shared owner form plus a unique username:

```json
{
  "login_username": "rahim.owner.001",
  "temporary_password": null
}
```

`login_username` is required for a new owner. `temporary_password` is optional.

When a temporary password is supplied, it is stored only as a secure hash and the owner must replace it.

When it is omitted, the backend generates an unknown secure random password. Neither the VTS provider nor the owner can retrieve that generated value. The owner activates the account through registered-mobile OTP recovery.

The same transaction creates:

- owner tenant and root organization
- one global owner record
- active owner user identity
- unique username identifier
- email and mobile identifiers
- `vehicle_owner` membership and owner profile
- `must_change_password=true`
- provider-owner link in `pending_owner_approval`

The API never returns a password. It returns the username only when the request created the account.

When the NID already exists, the existing owner/account is returned. Username, password, user, tenant, and owner records are not replaced.

## Owner self-registration and existing account detection

```text
POST /api/v1/owners/register
```

A new identity reference creates the owner and account normally.

An already-registered identity returns HTTP `409` with structured recovery information:

```json
{
  "detail": {
    "code": "owner_already_registered",
    "owner_id": "OWNER_UUID",
    "owner_name": "Md Rahim Uddin",
    "masked_phone": "***********5678",
    "masked_username": "ra**********1",
    "next_action": "request_mobile_password_reset"
  }
}
```

The owner is directed to mobile OTP recovery instead of creating another account.

## Registered-mobile OTP password recovery

Request an OTP:

```text
POST /api/v1/owners/password-reset/mobile/request
```

```json
{
  "identity_or_registration_reference": "19876543210987654",
  "mobile": "+8801712345678"
}
```

Confirm the OTP and set a new password:

```text
POST /api/v1/owners/password-reset/mobile/confirm
```

```json
{
  "challenge_id": "CHALLENGE_UUID",
  "otp": "123456",
  "new_password": "Owner-New-Strong-Password-123"
}
```

Security rules:

- NID/registration reference and registered mobile must match
- OTP expires after 5 minutes by default
- another OTP cannot be requested for 60 seconds by default
- a challenge allows at most 5 incorrect attempts by default
- OTPs are stored as HMAC digests, not plain text
- a successful reset marks the mobile identifier verified
- `claim_status` becomes `claimed`
- `must_change_password` becomes `false`
- token version increments and all previous sessions are revoked
- a consumed OTP cannot be reused

Development/testing simulates SMS and includes `development_otp` in the response so Swagger and tests can complete the flow.

Production never exposes the OTP in an API response. Configure:

```text
SMS_GATEWAY_URL
SMS_GATEWAY_API_KEY
SMS_SENDER_ID
```

The current generic SMS adapter sends JSON containing `to`, `message`, and `sender_id`. A provider-specific adapter can replace it later without changing the recovery endpoints.

The earlier temporary-password reset endpoint remains available as a fallback when the owner still knows that password, but registered-mobile OTP is the primary recovery path.

## Provider-owner consent links

```text
POST /api/v1/owners/provider-links
GET  /api/v1/owners/provider-links
POST /api/v1/owners/provider-links/{link_id}/respond
POST /api/v1/owners/provider-links/{link_id}/unlink
```

Relationship states:

```text
Provider starts relationship → pending_owner_approval
Owner starts relationship    → pending_provider_approval
Other party approves          → active
Rejected                      → rejected
Owner unlinks                 → ended
```

A provider cannot unlink an owner. Only the owner can end an active/suspended relationship. Unlinking ends that provider's pending/active vehicle-device assignments with `valid_to`; historical records remain intact.

One owner may link multiple approved VTS providers, while separate vehicles may use different providers or owner-managed devices.

## Vehicle registration

```text
POST  /api/v1/vehicles
GET   /api/v1/vehicles
GET   /api/v1/vehicles/{vehicle_id}
PATCH /api/v1/vehicles/{vehicle_id}
POST  /api/v1/vehicles/{vehicle_id}/review
```

A vehicle may be created by:

- the approved vehicle owner
- a VTS provider with an active link to that owner
- authorized Police/System administrators

A VTS provider must submit `owner_id`. The provider never becomes the vehicle owner. Registration number and chassis number are globally unique.

Vehicles begin as `pending_verification`. Police Admin or Super Admin verifies the vehicle before GPS activation.

## VTS tracking flow

```text
POST /api/v1/tracking/vehicles/{vehicle_id}/connect-provider
POST /api/v1/tracking/assignments/{assignment_id}/provider-confirm
```

Requirements:

- provider approved
- owner approved
- vehicle verified
- owner-provider link active
- device not already pending/active for another vehicle

Both the owner and linked VTS provider may initiate connection. The provider confirms the device before the assignment becomes active.

## Owner-managed GPS flow

```text
POST /api/v1/tracking/vehicles/{vehicle_id}/register-owner-device
POST /api/v1/tracking/assignments/{assignment_id}/test-telemetry
POST /api/v1/tracking/assignments/{assignment_id}/review
```

Only the owner or authorized Police/System administrators may register an owner-managed device. Police/System approves the device after test telemetry.

Tracking history:

```text
GET /api/v1/tracking/assignments
GET /api/v1/tracking/assignments/{assignment_id}
```

Activating a new assignment ends the previous active assignment with `valid_to` while preserving history.

## Telemetry ingestion

```text
POST /api/v1/telemetry
```

```json
{
  "source_code": "VTS-OR-OWNER-SOURCE-CODE",
  "device_identifier": "DEVICE-IDENTIFIER",
  "external_event_id": "EVENT-001",
  "recorded_at": "2026-07-26T12:00:00+06:00",
  "latitude": 23.8103,
  "longitude": 90.4125,
  "speed_kph": 50
}
```

The backend validates actor/source tenancy, provider or owner approval, source/device state, active assignment, verified vehicle, and source-scoped duplicate event identity. Telemetry stores `source_id`, `device_id`, and `assignment_id`.

## IAM and user administration

```text
GET  /api/v1/iam/tenants
POST /api/v1/iam/tenants
GET  /api/v1/iam/organizations
POST /api/v1/iam/organizations
GET  /api/v1/iam/permissions
GET  /api/v1/iam/roles
POST /api/v1/iam/roles
PATCH /api/v1/iam/roles/{role_public_id}

GET    /api/v1/auth/users
POST   /api/v1/auth/users
GET    /api/v1/auth/users/{user_public_id}
PATCH  /api/v1/auth/users/{user_public_id}
POST   /api/v1/auth/users/{user_public_id}/reset-password
DELETE /api/v1/auth/users/{user_public_id}
POST   /api/v1/auth/users/{user_public_id}/memberships
PATCH  /api/v1/auth/users/{user_public_id}/memberships/{membership_public_id}
```

User deletion is soft deletion and preserves historical relationships.

## Development checks

```bash
python -m pip install -r requirements-dev.txt
python -m ruff check .
python -m pytest
rm -f vehicle_platform.db
python -m alembic upgrade head
```

## Deferred production security/infrastructure

- encrypted NID/company-reference storage with deterministic lookup hash and KMS/HSM integration
- provider-specific SMS delivery adapter and delivery receipt processing
- binary document upload and government object storage
- provider and owner-source API-key/HMAC issuance
- source IP allowlist enforcement
- production GPS protocol gateways
- PostgreSQL Row-Level Security and jurisdiction policies
- MFA, rotating refresh tokens, and immutable violation evidence
