# Phase 4 — Production activation evidence

## Release packet

- Release: `2.2.0`
- Canonical contract: `sharvaos.pulse.v1`
- Runtime default: Supabase
- Compatibility rollback: explicit D1 owner selection
- Database migrations in Phase 4: none
- Supabase Edge Function changes in Phase 4: none

## Public-safe runtime configuration

The deploy-default runtime contains only:

- the Supabase project URL;
- the JWT-protected `sharvaos-pulse-sync` function URL;
- a Supabase publishable client key.

The repository contains no service-role key, owner email, access token, refresh token, OTP or personal record.

## Supabase production prerequisite audit

Verified on 2026-07-30:

- `sharvaos-pulse-sync`: ACTIVE;
- function version: `1`;
- function ID: `e9e6bb8c-9dd6-460d-a7e8-3c306351e345`;
- JWT verification: enabled;
- deployment SHA-256: `904de667406841b0d72cc04aac451d79e1598539ff33658a77b48182a3077f2f`;
- Auth users: `1`;
- confirmed Auth users: `1`;
- anonymous canonical read: denied;
- anonymous canonical mutation: denied;
- authenticated canonical read: allowed;
- authenticated canonical mutation: allowed;
- `pulse_logs` RLS: enabled;
- `pulse_todos` RLS: enabled;
- Phase 4 canary logs/todos/receipts: `0 / 0 / 0`.

No database mutation was required for this audit.

## Advisor review

Phase 4 introduced no new database object, policy or privilege. Current advisor notices concern pre-existing legacy water RPC exposure, intentionally authenticated `pulse_apply_mutation`, policy-free hidden legacy tables and the project-level leaked-password setting. They are not caused by the Phase 4 runtime activation diff.

Canonical Pulse RPC grants and RLS were separately verified as described above.

## Release safety

- No automatic Supabase-to-D1 write fallback exists.
- Invalid explicit owner configuration fails closed.
- Offline mutations remain in the durable device queue.
- Exact rollback requires `SHARVAOS_PULSE_DATA_OWNER=d1` plus redeployment.
- `/api/health` exposes no key or user/session material.

## Repository verification

The exact final pull-request head must pass:

1. immutable baseline verification;
2. normalized `2.2.0` package and lock versions;
3. `npm ci`;
4. lint;
5. typecheck;
6. build;
7. all tests;
8. evidence artifact upload.

The final successful run and merge commit are recorded in the pull-request discussion and release report.

## Deployment boundary

The current ChatGPT Sites URL could not be probed from the available deployment connector because it is not a Vercel deployment. Production URL verification therefore requires either the ChatGPT Sites deployment surface or a connected browser session.

This limitation does not authorize bypassing owner authentication or adding privileged credentials to the repository.

## Account governance still required

- Change the GitHub repository visibility to Private.
- Apply the documented `main` branch protection rule.

These account-level controls are separate from the public-safe runtime activation code and remain open governance work.
