# ADR-005 — SharvaOS Today Is the Single Front Door

**Status:** Accepted  
**Scope:** Existing `SharvaOS-Pulse` application and `sharvaos-live-control-room` Supabase project

## Decision

The existing SharvaOS Pulse application becomes **SharvaOS Today**, the single mobile-first front door for daily operation.

SharvaOS Today is a read-and-act surface. It does not become a new canonical database and it does not copy canonical records into a parallel dashboard store.

## Canonical ownership

- Supabase `projects` owns project state.
- Supabase `tasks` owns core execution tasks.
- Supabase `approval_queue` owns pending decisions.
- Supabase `inbox_items` owns unresolved incoming signals.
- Supabase `source_events` owns normalized source events, including Calendar-backed signals.
- Supabase `connectors` and `automation_runs` own integration and workflow evidence.
- Existing Pulse tables continue to own water, smoke, food, and quick daily todo capture.
- Notion remains the human-readable operational and knowledge layer; synchronization into the canonical read model must preserve source identity and timestamps.

## Runtime boundary

The browser reads the existing canonical tables through Supabase PostgREST using the current owner session, publishable key, and existing owner-only row-level-security policies.

The new read-model client performs GET requests only. It exposes partial-source errors instead of silently substituting cached or invented values. Authentication failures fail closed and return to the existing owner sign-in gate.

## Truth and freshness

Every canonical snapshot carries its newest source timestamp. Freshness is classified as:

- fresh: up to 6 hours old;
- aging: more than 6 and up to 24 hours old;
- stale: more than 24 hours old;
- unknown: no valid evidence timestamp.

Stale records may be shown for continuity, but the interface must not label them as today’s verified plan. Calendar content is limited to events whose occurrence date is today in `Asia/Kolkata`.

## Product boundary

Daily Pulse remains a module inside SharvaOS Today. Pulse quick todos are not promoted into a second project-task system; core work continues to come from the canonical `tasks` table.

Older cockpit, dashboard, and prototype repositories may remain as archived references, but they are not active front doors and must not independently define SharvaOS state.

## Consequences

- One production URL and one owner-authenticated entry point.
- No new database, mirror table, or duplicated operational record.
- Existing source systems retain ownership.
- Source failures and stale evidence are visible to the user.
- Future write actions must route back to the owning canonical system and include read-back verification before reporting success.
