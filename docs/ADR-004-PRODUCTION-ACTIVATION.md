# ADR-004 — Public-safe production activation

- Status: Accepted
- Date: 2026-07-30
- Release: `2.2.0`
- Canonical contract: `sharvaos.pulse.v1`

## Decision

SharvaOS Daily Pulse defaults to the Supabase canonical owner using checked-in public client coordinates:

- Supabase project URL;
- JWT-protected Edge Function URL;
- Supabase publishable key.

These values are identifiers intended for client initialization. They do not grant owner access. Canonical reads and mutations still require an existing Supabase Auth session, a valid user JWT, row-level security and the owner-scoped database functions established in Phase 2.

No service-role key, access token, refresh token, OTP, owner email or personal record is committed.

## Runtime selection

- No owner environment value: Supabase canonical owner activates from the reviewed public defaults.
- `SHARVAOS_PULSE_DATA_OWNER=supabase`: Supabase activates, with optional reviewed environment overrides.
- `SHARVAOS_PULSE_DATA_OWNER=d1`: explicit rollback to the D1 compatibility path.
- Any other explicit owner value: fail closed; changes remain queued on the device.

There is no automatic fallback from a failed Supabase request to D1. This prevents split-brain writes.

## Operational health

`GET /api/health` reports only safe release metadata:

- release version and canonical contract;
- selected data owner and configuration source;
- whether the canonical function is configured;
- the authentication mode;
- the explicit rollback instruction.

The endpoint never returns client keys, user identity or session material.

## Repository visibility

The repository should still be changed to Private because this is a personal system and future development may introduce private operational material. Public visibility is not treated as permission to commit privileged credentials or personal data.
