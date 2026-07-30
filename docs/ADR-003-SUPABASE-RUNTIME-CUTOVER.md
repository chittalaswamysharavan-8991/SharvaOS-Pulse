# ADR-003 — Supabase runtime cutover uses owner OTP and an explicit fail-closed data-owner switch

- Status: Implemented; production activation gated
- Date: 2026-07-30
- Canonical contract: `sharvaos.pulse.v1`
- Rollback owner: `d1`
- Cutover owner: `supabase`

## Decision

The Daily Pulse UI selects exactly one persistence transport at runtime through `SHARVAOS_PULSE_DATA_OWNER`.

- `d1` explicitly enables the existing authenticated `/api/day` emergency fallback.
- `supabase` requires complete publishable runtime configuration and an authenticated owner session before any canonical read or mutation is attempted.
- A missing or invalid owner value blocks network synchronization and keeps changes queued on the device.
- An incomplete Supabase configuration also blocks synchronization. It never silently writes to D1 or produces a half-configured dual-write mode.

Supabase Auth uses passwordless email OTP for the one existing confirmed owner account. OTP requests set `create_user: false`, so the Pulse login surface cannot create another account.

## Client session model

The browser receives only the Supabase project URL and publishable key from `/api/runtime-config`. These values are public client configuration, not privileged credentials.

The access and refresh tokens returned after OTP verification are stored only in the browser's local storage. The repository, deployment manifest and server logs must not contain a user JWT or service-role key.

Expired access tokens are refreshed before canonical calls. A transient offline refresh failure retains the refresh session for the next online retry. A rejected refresh clears the invalid session and returns the user to the sign-in gate.

## Mutation, migration and offline model

The existing ordered local mutation queue remains authoritative while a device is offline.

For Supabase writes, every queued operation uses its stable `queueId` as the canonical idempotency key. This means:

- a network retry replays the exact same canonical mutation safely;
- two intentional updates to the same entity receive different mutation identities;
- a 401 leaves the queued operation intact until the owner signs in again;
- a permanent validation rejection removes only the rejected operation and reconciles from canonical read-back.

Before initial device-cache reconciliation, pending operations drain first. The UI then re-reads canonical state and imports only missing cached logs and tasks. Existing records are skipped by ID or deterministic source fingerprint, so legacy canonical water cannot block migration of missing smoke, food or tasks. Imports are split into bounded 100-item batches to match the Edge Function contract without silent truncation.

## Cutover and rollback

Every deployment must explicitly set one of:

```text
SHARVAOS_PULSE_DATA_OWNER=d1
```

or:

```text
SHARVAOS_PULSE_DATA_OWNER=supabase
```

Supabase activation additionally requires:

- `SUPABASE_URL`
- `SUPABASE_PUBLISHABLE_KEY`
- optional `SUPABASE_FUNCTION_URL`; when omitted it is derived from `SUPABASE_URL`

No database migration or code revert is required for runtime rollback. Supabase remains the canonical owner by architecture; D1 is an emergency compatibility path and must not be treated as a second source of truth.

## Production gate

Production activation remains blocked until:

1. the GitHub repository is Private;
2. deployment variables are configured outside source control;
3. an owner OTP session completes an authenticated staging read, write, replay and read-back;
4. rollback is exercised and recorded;
5. the final production deployment is verified on the user's iPhone.
