# ADR-002 — Supabase is the canonical Pulse data owner

- Status: Accepted and implemented
- Date: 2026-07-30
- Supabase project: `sharvaos-live-control-room`
- Project ref: `vhzzugeeadaijkzrvowx`
- Canonical contract: `sharvaos.pulse.v1`

## Decision

Supabase Postgres owns canonical SharvaOS Pulse logs, tasks, soft-deletion state and idempotent mutation receipts.

- `public.pulse_logs` is the canonical daily log store.
- `public.pulse_todos` is the canonical daily task store.
- `public.pulse_mutation_receipts` proves exact mutation identity, payload hash and authoritative read-back.
- `public.pulse_apply_mutation` is the controlled mutation boundary.
- `public.pulse_read_day` is the canonical day read model.
- `sharvaos-pulse-sync` is the authenticated Edge Function boundary.

Cloudflare D1 remains a compatibility/fallback store until the application has a Supabase Auth session and deployment configuration. It must not become a second canonical owner.

## Existing systems

The existing `sharva_water_logs` and `sharva_water_log_voids` tables are retained so the active water MCP/widget is not broken. Their historical rows were migrated losslessly and triggers mirror future legacy water writes and voids into `pulse_logs`.

The legacy tables are compatibility ingress, not the destination for new Pulse modules.

## Security model

- Every canonical row carries `owner_id` linked to `auth.users`.
- RLS exposes rows only when `auth.uid() = owner_id`.
- Direct anonymous access is revoked.
- Canonical mutations require an authenticated session and a unique idempotency key.
- The Edge Function has `verify_jwt = true`, forwards the caller's bearer token, and does not contain a service-role secret.
- Deletes are soft deletions with reason and timestamp.

## Data integrity

- New water mutations accept only whole amounts from 50 to 2000 ml.
- Imported legacy values are preserved exactly; out-of-range historical values are marked `legacy_out_of_range` rather than silently rewritten.
- Replaying an idempotency key with the same payload returns the prior receipt.
- Reusing an idempotency key with different content is rejected.
- Every successful mutation returns an authoritative day read-back.

## Cutover boundary

Phase 2 completes the canonical database, API contract, authenticated Edge Function, compatibility mirroring and repository integration contract. Runtime cutover of the existing UI is intentionally gated on:

1. repository visibility being Private;
2. Supabase Auth session integration in the app;
3. deployment environment configuration;
4. staging verification and rollback evidence.

Until those gates pass, the UI keeps its current D1 fallback behavior and no secret is committed to this repository.
