# Phase 4 — Production activation runbook

## Release target

- Version: `2.2.0`
- Canonical owner: Supabase
- Canonical contract: `sharvaos.pulse.v1`
- Authentication: existing-owner email OTP only
- Compatibility rollback: D1

## Pre-deployment gates

1. `v2.0.0-baseline` still resolves to the frozen import commit.
2. `npm ci`, lint, typecheck, build and tests pass.
3. No service-role key, JWT, OTP, owner email or personal data is in the diff.
4. Supabase Edge Function `sharvaos-pulse-sync` remains active with JWT verification enabled.
5. Canonical tables and RLS policies remain owner-scoped.

## Activation

Deploy release `2.2.0` without setting `SHARVAOS_PULSE_DATA_OWNER`, or set it explicitly to `supabase`.

The runtime config endpoint will use the checked-in public client coordinates and present the existing-owner OTP screen. New users are not created from the app.

## Verification

1. Request `/api/health` and confirm:
   - HTTP 200;
   - `status=ready`;
   - `version=2.2.0`;
   - `dataOwner=supabase`;
   - `canonicalFunction=configured`.
2. Sign in using the existing confirmed owner account.
3. Read the current day.
4. Add one canary log and confirm authoritative read-back.
5. Replay the exact mutation key and confirm no duplicate.
6. Queue one change offline, reconnect and confirm ordered sync.
7. Delete the canary and confirm soft-deleted canonical state.
8. Confirm no canary rows or receipts remain.

Never put an OTP, access token or refresh token into screenshots, logs, issues or evidence files.

## Explicit rollback

Set:

```text
SHARVAOS_PULSE_DATA_OWNER=d1
```

Then redeploy the exact release commit. Verify `/api/health` reports `dataOwner=d1` and the UI labels the state as `D1 rollback`.

Rollback is an operational compatibility measure. It does not make D1 the canonical owner and must not be used concurrently with Supabase writes.

## Forward recovery

Remove the D1 owner override or set it to `supabase`, redeploy, sign in again and allow the durable device queue to reconcile before making additional changes.

## Remaining account-level actions

- Change the GitHub repository visibility to Private.
- Apply the documented `main` branch protection rule.

These account controls are separate from application runtime activation and remain required governance work.
