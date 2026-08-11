# Global Driver Registry

The Driver module is a national registry, not a driver list owned by one VTS provider or vehicle owner.

## Identity rules

```text
One normalized NID       = one global Driver
One BRTA licence number  = one DriverLicence record
One registered mobile    = one login/recovery identifier
```

A driver may be created by:

- the driver through public self-registration
- an approved VTS provider
- an approved vehicle owner

All three flows use the same Driver record. An existing NID never creates a second driver account.

## Main endpoints

```text
POST /api/v1/drivers/register
POST /api/v1/drivers/lookup
POST /api/v1/drivers/provider-register
POST /api/v1/drivers/owner-register
GET  /api/v1/drivers/me
GET  /api/v1/drivers/me/links
POST /api/v1/drivers/links/{link_id}/respond
POST /api/v1/drivers/owner-links/driver-request
POST /api/v1/drivers/owner-links/{link_id}/respond
POST /api/v1/drivers/owner-links/{link_id}/unlink
GET  /api/v1/drivers
GET  /api/v1/drivers/{driver_id}
POST /api/v1/drivers/{driver_id}/review
```

## Driver-created account

`POST /api/v1/drivers/register` creates:

- global User identity
- username, email, and mobile identifiers
- `driver` role membership
- Driver profile
- BRTA licence record
- driver document metadata

The Driver and licence remain pending until Police/System review.

## Provider or owner-created account

```text
POST /api/v1/drivers/provider-register
POST /api/v1/drivers/owner-register
POST /api/v1/drivers/owner-links/provider-register
```

For a new NID, the organization supplies the shared driver form and a username. A temporary password is optional.

When the password is omitted, the backend stores an unknown secure password. The driver later uses mobile OTP recovery.

For an existing NID, the existing Driver/User account is returned. No duplicate account is created.

`owner-links/provider-register` lets an approved VTS provider create or reuse a Driver specifically for an actively linked vehicle owner. It prepares both the Provider–Driver and Owner–Driver consent links.

## Owner–Driver NID lookup and request

```text
POST /api/v1/drivers/owner-links/lookup
POST /api/v1/drivers/owner-links/request
GET  /api/v1/drivers/owner-links
```

Vehicle Owner flow:

1. enter the exact Driver NID
2. receive only masked Driver, mobile, and licence information
3. send an Owner–Driver link request
4. wait for Driver approval
5. assign the Driver only after the link becomes active

VTS Provider flow:

1. select an actively linked Vehicle Owner
2. enter the exact Driver NID with `owner_id`
3. send the request on behalf of that Owner
4. the backend creates or reopens both Provider–Driver and Owner–Driver consent links
5. the Driver approves the links from `GET /drivers/me/links`

A VTS Provider cannot search or request for an Owner unless the Provider–Owner link is active.

Drivers may request a connection using the exact public Owner Code. The API does not expose an Owner NID directory, so owner discovery remains private and resistant to enumeration. Driver-initiated requests remain `pending_organization_approval` until the selected Owner approves them.

## Organization links

```text
VTS Provider  ↔ Driver
Vehicle Owner ↔ Driver
```

Organization-created links start as `pending_driver_approval`. The Driver approves or rejects through:

```text
POST /api/v1/drivers/links/{link_id}/respond
```

One Driver may have multiple Provider and Owner links without duplicate accounts.

Owners and Drivers can cancel a pending request or end an active Owner–Driver link with a mandatory reason. Ending the link transactionally ends any active vehicle assignment between the pair. Requests, decisions, cancellations, assignment changes, and administrative suspensions are retained in the audit log.

## BRTA licence and verification

The registry stores:

- licence number
- professional/non-professional/learner type
- BRTA vehicle classes
- first issue date
- issue date
- expiry date
- verification state

Police Admin or Super Admin reviews the NID, licence, and supporting documents through:

```text
POST /api/v1/drivers/{driver_id}/review
```

Driver and licence verification are separate states but are approved together in the current manual review flow.

Once approved, the initial Driver application and its submitted document versions are immutable evidence. The Driver cannot resubmit `POST /drivers/me/application`, and Police cannot re-run the initial review endpoint against a verified application.

Later corrections use a separate workflow:

```text
POST /api/v1/drivers/me/profile-change
POST /api/v1/drivers/{driver_id}/profile-change/review
```

The proposed values remain separate until Police Admin or Super Admin approves them. A pending, returned, or rejected profile change never resets the Driver or licence verification state, so an otherwise eligible Driver remains assignable. Approval applies the proposed values and creates verified document versions. Administrative account lock/suspension remains the separate way to block access or operations and always requires a reason and audit record.

## Mobile OTP recovery

```text
POST /api/v1/drivers/password-reset/mobile/request
POST /api/v1/drivers/password-reset/mobile/confirm
```

The NID and registered mobile must match. OTP controls include expiry, resend cooldown, maximum attempts, digest storage, one-time use, password change, token-version increment, and session revocation.

Development/testing responses expose `development_otp`; production sends the OTP through the configured SMS gateway and never returns it.

## Vehicle assignment

```text
POST /api/v1/assignments
GET  /api/v1/assignments?status=active
POST /api/v1/assignments/{assignment_id}/start-duty
POST /api/v1/assignments/{assignment_id}/end
GET  /api/v1/assignments/vehicle/{vehicle_id}
GET  /api/v1/assignments/driver/{driver_id}
GET  /api/v1/assignments/duty-history
```

Requirements:

- vehicle verified
- Driver verified
- BRTA licence verified and not expired
- Vehicle Owner assignment requires an active Owner–Driver link
- VTS Provider assignment requires active Provider–Owner, Provider–Driver, and Owner–Driver links

A pending Owner–Driver request cannot be used for assignment. The requested party must approve it first. A suspended Driver cannot be assigned, and suspending a Driver ends that Driver's active roster assignment without automatically restoring it later.

Vehicle roster membership and current duty are separate:

- one Driver may have one active Vehicle roster assignment
- one Vehicle may have multiple active Driver roster assignments
- only one active assignment per Vehicle may have `is_on_duty=true`
- the first roster Driver becomes on duty when no current Driver exists
- `start-duty` atomically moves the previous Driver to standby and records the mandatory handover reason
- ending an assignment removes only that Driver from the roster

## Driver duty ledger

Every actual driving interval is stored separately in `driver_duty_sessions`. Starting or handing over duty closes the previous open interval and opens a new interval for the incoming Driver. A session records the Driver, Vehicle, Owner, source assignment, start/end timestamps, actors, and mandatory reasons.

Closed duty sessions are historical evidence: unlinking an Owner–Driver relationship, ending a roster assignment, or suspending an account closes any current session but never deletes the previous intervals. Foreign keys use restrictive deletion so a Driver, Vehicle, Owner, or Assignment with duty evidence cannot be silently removed.

`GET /api/v1/assignments/duty-history` supports:

- `driver_id` and `vehicle_id`
- `from_at` and `to_at` interval-overlap filters
- `at` to identify the Driver who was on duty at an exact incident/case timestamp
- search by Driver name/code or Vehicle registration
- offset/limit pagination

Access is role-scoped: a Driver sees only their own sessions, an Owner sees their Vehicles, a Provider sees sessions from its assignments, and Police Admin/Super Admin can search the national ledger. The Driver dashboard exposes self-history with date filters; the Super Admin duty-history workspace exposes national search and date filtering.

Assignments still retain `valid_from` and `valid_to` as roster history. Duty sessions are the authoritative source for who was actually driving at a particular time, while the audit log records the administrative action trail.

## Migration

`0010_global_driver_registry` intentionally rebuilds the development `drivers` and `driver_assignments` domain. It preserves users, VTS providers, vehicle owners, vehicles, GPS tracking, and telemetry.

`0034_driver_duty_sessions` creates the append/close-only duty ledger, adds single-open-session guards for each Vehicle and Driver, and backfills prior ended assignments plus the currently on-duty active assignment. Backfilled rows are tagged with `migration_assignment_interval` as their source.

`0035_driver_application_lock` separates later profile changes from initial verification and repairs legacy records that had a prior Police approval but were incorrectly reset to pending by application resubmission.
