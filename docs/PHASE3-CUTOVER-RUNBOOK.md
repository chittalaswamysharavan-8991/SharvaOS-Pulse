# Phase 3 — Supabase runtime cutover runbook

## Preflight

Do not activate Supabase while the repository is Public.

Confirm:

- repository visibility is `private`;
- `main` contains the merged Phase 3 implementation;
- the Supabase Edge Function `sharvaos-pulse-sync` is `ACTIVE` with JWT verification enabled;
- exactly one confirmed owner email account exists;
- no service-role key or user token is present in GitHub, deployment files or chat messages.

## Staging configuration

Set the following as deployment environment variables, never source files:

```text
SHARVAOS_PULSE_DATA_OWNER=supabase
SUPABASE_URL=https://<project-ref>.supabase.co
SUPABASE_PUBLISHABLE_KEY=<publishable-key>
SUPABASE_FUNCTION_URL=https://<project-ref>.supabase.co/functions/v1/sharvaos-pulse-sync
```

`SUPABASE_FUNCTION_URL` may be omitted when the standard function URL is used.

Deploy to a staging/preview target first.

## Authenticated staging proof

1. Open the staging URL on the target iPhone.
2. Enter the existing registered owner email.
3. Request the six-digit email OTP.
4. Verify the OTP and confirm the header reports `Supabase`.
5. Read today's canonical day.
6. Add a temporary task with a unique test ID.
7. Confirm the write returns authoritative read-back.
8. Retry the same queued request and confirm it replays without duplication.
9. Toggle and delete the temporary task.
10. Confirm canonical read-back no longer exposes the soft-deleted task.
11. Confirm the browser pending queue is empty.
12. Confirm database canary/test rows are removed.

Do not copy the OTP, access token or refresh token into evidence.

## Offline proof

1. With an active owner session, disable network access.
2. Add one temporary task or allowed water entry.
3. Confirm the UI reports device/offline mode and retains the queued mutation.
4. Restore network access.
5. Confirm the exact queued operation syncs once and the queue becomes empty.

## Rollback proof

1. Set `SHARVAOS_PULSE_DATA_OWNER=d1` in staging.
2. Redeploy without changing code or database schema.
3. Confirm `/api/runtime-config` reports `dataOwner: d1`.
4. Confirm the UI labels the transport `D1 rollback`.
5. Confirm the Supabase session remains local but is not used for D1 requests.
6. Restore `SHARVAOS_PULSE_DATA_OWNER=supabase` only after the rollback evidence passes.

## Production promotion

Promote only the exact staging-verified commit. Re-run:

```text
npm ci → lint → typecheck → build → test
```

Verify the production URL on iPhone for:

- OTP sign-in;
- canonical read;
- one confirmed write and read-back;
- offline queue recovery;
- sign-out and sign-in recovery;
- no clipped controls or layout regressions.

## Emergency response

For auth, canonical API or deployment incidents:

1. change `SHARVAOS_PULSE_DATA_OWNER` to `d1`;
2. redeploy;
3. do not delete canonical Supabase records;
4. preserve the browser pending queue;
5. investigate using redacted logs only;
6. re-enable Supabase after a new staging proof.
