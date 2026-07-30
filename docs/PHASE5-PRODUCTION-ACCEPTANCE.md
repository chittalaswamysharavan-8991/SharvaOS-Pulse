# Phase 5 — Production acceptance and governance closure

- Date: 2026-07-31
- Production URL: `https://sharvaos-pulse-google.vercel.app`
- Release: `2.2.0`
- Canonical contract: `sharvaos.pulse.v1`
- Current deployed source commit: `d460e9b7b5001d590902e2d5821b805ef1c98f1f`

## Goal

Close the gap between “deployed” and “operationally accepted” without exposing an OAuth secret, OTP, access token, refresh token, owner email, service-role key or personal record.

## Automated production acceptance

`scripts/verify-production-acceptance.mjs` performs the public-safe live checks:

1. `GET /api/health` returns HTTP 200 and the expected release, contract, Supabase owner, owner-session requirement and a full immutable Git source SHA.
2. The deployed SHA must exist in repository history and be an ancestor of `main`; the workflow no longer carries a stale hard-coded deployment SHA.
3. `GET /api/runtime-config` resolves to a ready Supabase canonical configuration using only public client coordinates.
4. The production root returns the expected SharvaOS Pulse title and canonical-runtime loading shell.
5. A direct Edge Function request without a user bearer JWT is rejected with HTTP 401 or 403.
6. Health, runtime and page-shell responses contain no privileged credential or owner identity.
7. A JSON evidence artifact is generated for the workflow run.

The checks run in `.github/workflows/production-acceptance.yml` and contain no repository secret.

## Owner-gate contract proof

The owner gate is client-rendered after runtime configuration is loaded, so it is not asserted from raw server HTML. Repository tests verify that:

- the hydrated UI contains `Continue with Google` when the provider is enabled;
- owner email recovery remains available for secure recovery;
- new Supabase users are blocked;
- the active owner is labelled `SUPABASE CANONICAL`;
- email recovery requests use `create_user: false`;
- OAuth sessions are validated through Supabase before being persisted locally.

Google Sign-In is enabled in production. The existing owner has email and Google identities linked to the same Supabase user; no duplicate Auth user was created.

## Canonical database acceptance

The production database acceptance proves transactionally and leaves no active test residue:

- one confirmed owner remains the only application identity;
- a private owner registry contains exactly that owner UUID;
- anonymous and non-owner canonical reads and mutations are denied;
- restrictive owner policies remain enabled;
- owner mutation triggers remain enabled;
- the registered owner can write and receive authoritative read-back;
- log deletion is soft-delete based and refresh-safe;
- stale device imports cannot resurrect a canonical deletion;
- exact mutation replays remain idempotent.

### Executed production acceptance — PASS

Verified on 2026-07-30 and 2026-07-31:

- confirmed Auth users: `1`;
- linked owner identities: `email` and `google`;
- private owner-registry rows: `1`;
- restrictive owner-select policies: `3`;
- canonical owner mutation triggers: `3`;
- non-owner canonical mutation: denied;
- owner test write and authoritative read-back: passed;
- duplicate rows after read-back: `0`;
- UI deletion control visible and working: owner-confirmed;
- remaining active test rows: `0`.

## Owner-session and device acceptance

Completed:

1. Google provider enabled;
2. production Google sign-in completed with the existing owner;
3. Auth user count remained `1`;
4. canonical state loaded;
5. temporary entry write/read-back passed;
6. UI deletion and refresh-safe absence passed.

Still requires physical iPhone network control:

1. switch the iPhone offline;
2. add one temporary entry and confirm device-mode feedback;
3. reconnect;
4. confirm ordered synchronization, no duplicate and no pending queue;
5. delete the temporary entry and refresh.

No agent or server-side test can honestly substitute for the iPhone radio transition and browser storage used by the real device.

## Rollback safety and drill

The compatibility rollback selector remains:

```text
SHARVAOS_PULSE_DATA_OWNER=d1
```

D1 is a Cloudflare runtime binding, not a Vercel database. A rollback is valid only when the exact release is running with a live Cloudflare `DB` binding. Setting `SHARVAOS_PULSE_DATA_OWNER=d1` on Vercel without that binding must return a blocked runtime instead of reporting a fake-ready D1 owner.

Repository tests now prove:

- D1 fails closed without a binding;
- a binding-shaped Cloudflare runtime can select D1;
- invalid dual-owner values are blocked;
- removing the D1 selector restores the Supabase canonical owner on the same release.

A live D1 write/read drill remains blocked until an actual Cloudflare deployment with the checked-in D1 migration and `DB` binding exists. Production stays on Supabase; it must not be switched into a label-only or nonfunctional D1 state.

## Governance closure

The application code and public-safe production deployment do not contain privileged credentials. Account-level controls remain mandatory:

- change `chittalaswamysharavan-8991/SharvaOS-Pulse` from Public to Private;
- apply the documented `main` branch protection rule;
- verify a direct write to `main` is rejected;
- close Issues #2 and #4 only after metadata and behavior confirm the controls.

These settings require repository-administration endpoints. The connected GitHub tool can read repository metadata and manage code/PRs, but it does not expose repository visibility or branch-ruleset mutation. These controls must not be reported complete until GitHub itself confirms them.

## Completion rule

Phase 5 is complete only when all four evidence groups exist:

1. automated public production acceptance: PASS;
2. canonical database and Google owner-session acceptance: PASS;
3. physical iPhone offline/reconnect acceptance and a live D1-capable rollback drill: PASS;
4. repository privacy and branch enforcement: PASS.

Do not report Phase 5 as fully complete while any group remains pending.
