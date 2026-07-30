# Phase 2 — Supabase canonical owner evidence

## Applied production migration

- Project: `sharvaos-live-control-room`
- Project ref: `vhzzugeeadaijkzrvowx`
- Migration name: `canonical_pulse_v1`
- Result: success

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

## Known runtime boundary

The Edge Function deployment is active, but this execution environment could not perform a public network curl because DNS resolution is unavailable. Runtime integration must therefore be rechecked from staging with a real Supabase user session before UI cutover.

This is not permission to place a JWT, service-role key or other credential in the repository.
