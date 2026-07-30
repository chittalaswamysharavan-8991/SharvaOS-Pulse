# Phase 2 — Supabase canonical owner evidence

## Applied production migrations

- Project: `sharvaos-live-control-room`
- Project ref: `vhzzugeeadaijkzrvowx`
- `canonical_pulse_v1`: success
- `harden_pulse_function_grants`: success

## Deployed function

- Function: `sharvaos-pulse-sync`
- Function ID: `e9e6bb8c-9dd6-460d-a7e8-3c306351e345`
- Version: `1`
- Status: `ACTIVE`
- `verify_jwt`: `true`
- Deployment SHA-256: `904de667406841b0d72cc04aac451d79e1598539ff33658a77b48182a3077f2f`

## Legacy reconciliation

| Check | Result |
|---|---:|
| Existing `sharva_water_logs` | 8 |
| Canonical migrated legacy logs | 8 |
| Existing void records | 3 |
| Canonical soft-deleted records | 3 |
| Preserved legacy out-of-range values | 1 |

No historical row was discarded or silently normalized.

## Transactional canary

The database canary used the existing authenticated owner identity, exercised the canonical RPC boundary, asserted results and removed all canary rows and receipts before returning.

- authenticated canonical owner: PASS
- write and read-back confirmation: PASS
- same-key same-payload replay: PASS
- task completion update: PASS
- log soft-delete read-back: PASS
- task soft-delete read-back: PASS
- canary cleanup: PASS
- remaining canary logs, todos and receipts: `0 / 0 / 0`

## Function privilege audit

| Function | Anonymous | Authenticated | Public |
|---|---:|---:|---:|
| `pulse_read_day` | denied | allowed | denied |
| `pulse_apply_mutation` | denied | allowed | denied |
| `pulse_mirror_legacy_water_insert` | denied | denied | denied |
| `pulse_mirror_legacy_water_void` | denied | denied | denied |

`pulse_apply_mutation` is intentionally `SECURITY DEFINER` because direct table mutations are revoked. It requires `auth.uid()`, has a fixed empty search path, validates the action and payload, and records an idempotent receipt before returning authoritative state.

## Advisor audit

- Phase 2 trigger-function exposure: fixed.
- New critical security findings caused by Phase 2: none.
- New blocking performance findings caused by Phase 2: none.
- New canonical indexes may appear as unused until real traffic exists; they support the declared day, kind and receipt access paths.
- Remaining warnings concern the pre-existing legacy water RPC surface, tables intentionally hidden behind RPCs, and the project-level leaked-password setting. They are compatibility/Auth hardening debt outside this migration.

## Scope audit

- UI source and CSS: unchanged.
- Current D1 fallback behavior: unchanged.
- Service-role keys, JWTs and private credentials: absent.
- Production changes are limited to the additive canonical schema, compatibility triggers, hardened grants and authenticated Edge Function.

## Known runtime boundary

The Edge Function deployment is active, but this execution environment could not perform a public network curl because DNS resolution is unavailable. Runtime integration must therefore be rechecked from staging with a real Supabase user session before UI cutover.

This is not permission to place a JWT, service-role key or other credential in the repository.
