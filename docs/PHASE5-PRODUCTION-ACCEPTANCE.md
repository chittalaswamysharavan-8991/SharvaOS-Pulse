# Phase 5 — Production acceptance and governance closure

- Date: 2026-07-30
- Production URL: `https://sharvaos-pulse.vercel.app`
- Release: `2.2.0`
- Canonical contract: `sharvaos.pulse.v1`
- Production source commit: `af1cee26053ce4027bf87e8154473d5edcf04d2d`

## Goal

Close the gap between “deployed” and “operationally accepted” without exposing an OTP, access token, refresh token, owner email, service-role key or personal record.

## Automated production acceptance

`scripts/verify-production-acceptance.mjs` performs the public-safe checks:

1. `GET /api/health` returns HTTP 200 and the expected release, contract, Supabase owner, owner-session requirement and immutable source commit.
2. `GET /api/runtime-config` resolves to a ready Supabase canonical configuration using only public client coordinates.
3. The production page exposes the existing-owner sign-in gate and states that new users are not created.
4. A direct Edge Function request without a user bearer JWT is rejected with HTTP 401 or 403.
5. Health, runtime and page responses contain no privileged credential or owner identity.
6. A JSON evidence artifact is generated for the workflow run.

The checks run in `.github/workflows/production-acceptance.yml` and contain no repository secret.

## Canonical database acceptance

The production database acceptance must prove transactionally and leave zero residue:

- one confirmed owner remains the only application identity;
- anonymous canonical reads and mutations remain denied;
- authenticated canonical reads and mutations remain allowed;
- RLS remains enabled on `pulse_logs` and `pulse_todos`;
- a canary log can be written, read back, replayed idempotently and soft deleted;
- the exact canary log, todo and receipt counts return to zero.

Database canaries are executed through the reviewed canonical RPC boundary or a controlled transaction. They do not authorize a browser session and do not replace the owner OTP acceptance step.

## Owner-session acceptance

The owner must enter their email and OTP directly in the production UI. The OTP and resulting session material must not be retrieved by an agent or placed in chat, Slack, GitHub, logs or screenshots.

After secure sign-in, verify from the production UI:

1. today’s canonical state loads;
2. add one temporary test entry;
3. confirm the entry appears in Today’s Trace after authoritative read-back;
4. repeat/reload and confirm no duplicate;
5. create one entry while offline, reconnect and confirm ordered synchronization;
6. delete the temporary entries and confirm they disappear after canonical read-back;
7. confirm no pending queue remains.

## Rollback drill

The only supported compatibility rollback is:

```text
SHARVAOS_PULSE_DATA_OWNER=d1
```

A real rollback drill requires a reviewed deployment configuration change and redeployment of the exact release. Verify `/api/health` reports `dataOwner=d1`, confirm the UI labels D1 rollback, and do not write to Supabase and D1 concurrently. Forward recovery removes the override, redeploys the same release, signs in again and allows the durable queue to reconcile before additional writes.

## Governance closure

The application code and public-safe production deployment do not contain privileged credentials. Account-level controls remain mandatory:

- change `chittalaswamysharavan-8991/SharvaOS-Pulse` from Public to Private;
- apply the documented `main` branch protection rule;
- verify a direct write to `main` is rejected;
- close Issues #2 and #4 only after metadata and behavior confirm the controls.

These controls require repository-owner settings access and cannot be simulated by documentation or CI.

## Completion rule

Phase 5 is complete only when all four evidence groups exist:

1. automated public production acceptance: PASS;
2. canonical database canary and cleanup: PASS;
3. owner-session and offline UI acceptance: PASS;
4. repository privacy and branch enforcement: PASS.

Do not report Phase 5 as fully complete while any group remains pending.
