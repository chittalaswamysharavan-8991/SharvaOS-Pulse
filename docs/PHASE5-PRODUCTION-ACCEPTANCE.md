# Phase 5 — Production acceptance and governance closure

- Date: 2026-07-30
- Production URL: `https://sharvaos-pulse-google.vercel.app`
- Release: `2.2.0`
- Canonical contract: `sharvaos.pulse.v1`
- Production source commit: `748ecee2b36dbf40bd990ac0d3fd4aa6a90d02f2`

## Goal

Close the gap between “deployed” and “operationally accepted” without exposing an OAuth secret, OTP, access token, refresh token, owner email, service-role key or personal record.

## Automated production acceptance

`scripts/verify-production-acceptance.mjs` performs the public-safe live checks:

1. `GET /api/health` returns HTTP 200 and the expected release, contract, Supabase owner, owner-session requirement and immutable source commit.
2. `GET /api/runtime-config` resolves to a ready Supabase canonical configuration using only public client coordinates.
3. The production root returns the expected SharvaOS Pulse title and canonical-runtime loading shell.
4. A direct Edge Function request without a user bearer JWT is rejected with HTTP 401 or 403.
5. Health, runtime and page-shell responses contain no privileged credential or owner identity.
6. A JSON evidence artifact is generated for the workflow run.

The checks run in `.github/workflows/production-acceptance.yml` and contain no repository secret.

## Owner-gate contract proof

The owner gate is client-rendered after runtime configuration is loaded, so it is not asserted from raw server HTML. Repository tests verify that:

- the hydrated UI contains `Continue with Google` when the provider is enabled;
- owner email recovery remains available while provider activation or recovery is needed;
- new Supabase users are blocked;
- the active owner is labelled `SUPABASE CANONICAL`;
- email recovery requests use `create_user: false`;
- OAuth sessions are validated through Supabase before being persisted locally.

A connected browser separately verified the deployed hydrated UI. With the Google provider currently disabled, the production page correctly shows owner-only email recovery and states that Google Sign-In will appear automatically after provider activation.

## Canonical database acceptance

The production database acceptance proves transactionally and leaves zero residue:

- one confirmed owner remains the only application identity;
- a private owner registry contains exactly that owner UUID;
- anonymous and non-owner canonical reads and mutations are denied;
- restrictive owner policies remain enabled;
- owner mutation triggers remain enabled;
- a registered-owner canary can be written, read back and soft deleted;
- the exact canary rows and receipts return to zero.

### Executed production canary — PASS

Verified on 2026-07-30:

- confirmed Auth users: `1`;
- private owner-registry rows: `1`;
- restrictive owner-select policies: `3`;
- canonical owner mutation triggers: `3`;
- non-owner canonical mutation: denied;
- registered-owner write and authoritative read-back: passed;
- owner canary cleanup: passed;
- remaining visible canary rows: `0`.

## Owner-session acceptance

The owner must use the Google account whose verified email matches the existing confirmed Supabase owner email. The Google Client Secret, OAuth session material and recovery OTP must not be placed in chat, Slack, GitHub, Vercel client variables, logs or screenshots.

After Google provider activation and secure sign-in, verify from the production UI:

1. Supabase Auth user count remains `1`;
2. the existing owner has both `email` and `google` identities;
3. today’s canonical state loads;
4. add one temporary test entry and confirm authoritative read-back;
5. reload and confirm no duplicate;
6. create one entry while offline, reconnect and confirm ordered synchronization;
7. delete the temporary entries and confirm no pending queue remains.

Email OTP recovery remains available until this Google/iPhone acceptance passes.

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
3. Google owner-session and offline UI acceptance: PASS;
4. repository privacy and branch enforcement: PASS.

Do not report Phase 5 as fully complete while any group remains pending.
