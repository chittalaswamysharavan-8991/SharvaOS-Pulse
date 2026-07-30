# ADR-003 — Supabase runtime cutover uses owner OTP and a fail-closed data-owner switch

- Status: Implemented; production activation gated
- Date: 2026-07-30
- Canonical contract: `sharvaos.pulse.v1`
- Default runtime owner: `d1`
- Cutover owner: `supabase`

## Decision

The Daily Pulse UI selects exactly one persistence transport at runtime through `SHARVAOS_PULSE_DATA_OWNER`.

- `d1` keeps the existing authenticated `/api/day` fallback.
- `supabase` requires a complete publishable runtime configuration and an authenticated owner session before any canonical read or mutation is attempted.
- An incomplete Supabase configuration fails closed to D1 and surfaces a rollback notice. It never produces a half-configured dual-write mode.

Supabase Auth uses passwordless email OTP for the one existing confirmed owner account. OTP requests set `create_user: false`, so the Pulse login surface cannot create another account.

## Client session model

The browser receives only the Supabase project URL and publishable key from `/api/runtime-config`. These values are public client configuration, not privileged credentials.

The access and refresh tokens returned after OTP verification are stored only in the browser's local storage. The repository, deployment manifest and server logs must not contain a user JWT or service-role key.

Expired access tokens are refreshed before canonical calls. A transient offline refresh failure retains the refresh session for the next online retry. A rejected refresh clears the invalid session and returns the user to the sign-in gate.

## Mutation and offline model

The existing ordered local mutation queue remains authoritative while a device is offline.

For Supabase writes, every queued operation uses its stable `queueId` as the canonical idempotency key. This means:

- a network retry replays the exact same canonical mutation safely;
- two intentional updates to the same entity receive different mutation identities;
- a 401 leaves the queued operation intact until the owner signs in again;
- a permanent validation rejection removes only the rejected operation and reconciles from canonical read-back.

## Cutover and rollback

Activation requires all of the following deployment variables:

- `SHARVAOS_PULSE_DATA_OWNER=supabase`
- `SUPABASE_URL`
- `SUPABASE_PUBLISHABLE_KEY`
- optional `SUPABASE_FUNCTION_URL`; when omitted it is derived from `SUPABASE_URL`

Rollback requires only:

```text
SHARVAOS_PULSE_DATA_OWNER=d1
```

No database migration or code revert is required for runtime rollback. Supabase remains the canonical owner by architecture; D1 is an emergency compatibility path and must not be treated as a second source of truth.

## Production gate

The feature flag remains `d1` until:

1. the GitHub repository is Private;
2. deployment variables are configured outside source control;
3. an owner OTP session completes an authenticated staging read, write, replay and read-back;
4. rollback is exercised and recorded;
5. the final production deployment is verified on the user's iPhone.
