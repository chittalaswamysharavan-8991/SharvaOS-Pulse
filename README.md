# SharvaOS Daily Pulse

SharvaOS Daily Pulse is the focused daily-capture vertical slice of SharvaOS. It provides a mobile-first dashboard for water, smoke, food and today’s tasks, with durable offline mutation recovery, a Cloudflare D1 rollback API, Supabase canonical persistence infrastructure and ChatGPT-facing MCP tools.

**Current runtime version:** `2.1.0`  
**Canonical data contract:** `sharvaos.pulse.v1`  
**Frozen pre-behaviour baseline:** `v2.0.0-baseline`  
**Product status:** Supabase runtime cutover implementation is ready behind a fail-closed feature flag; live activation remains gated by repository privacy, deployment configuration and owner-session staging proof.

## Provenance

The source was imported from `SharvaOS-Daily-Pulse-v2-editable-source.zip`.

- ZIP SHA-256: `424f549ad660febe9e2f518736ddfb1e728f87d61654c439d6ede5223807072e`
- Frozen baseline commit: `43c9c2caa237e326e08671606d4b3b5aa117e5ec`
- Full provenance: [`SOURCE_PROVENANCE.md`](SOURCE_PROVENANCE.md)
- Baseline protection: [`docs/BASELINE_PROTECTION.md`](docs/BASELINE_PROTECTION.md)
- Supabase ownership decision: [`docs/ADR-002-SUPABASE-CANONICAL-OWNER.md`](docs/ADR-002-SUPABASE-CANONICAL-OWNER.md)
- Runtime cutover decision: [`docs/ADR-003-SUPABASE-RUNTIME-CUTOVER.md`](docs/ADR-003-SUPABASE-RUNTIME-CUTOVER.md)
- Phase 2 evidence: [`docs/PHASE2-SUPABASE-EVIDENCE.md`](docs/PHASE2-SUPABASE-EVIDENCE.md)
- Phase 3 evidence: [`docs/PHASE3-EVIDENCE.md`](docs/PHASE3-EVIDENCE.md)
- Cutover runbook: [`docs/PHASE3-CUTOVER-RUNBOOK.md`](docs/PHASE3-CUTOVER-RUNBOOK.md)
- Per-file baseline hashes: [`docs/source-baseline.sha256`](docs/source-baseline.sha256)

## Implemented surface

- Daily summary cards for water, smoke, food and tasks
- Quick capture flows
- Today focus list and completion state
- Today trace / recent event surface
- Durable browser-side pending-operation queue
- Ordered offline retry and reconnect reconciliation
- Existing-owner email OTP gate for canonical access
- Automatic Supabase session restore and access-token refresh
- Runtime-selectable Supabase canonical or D1 rollback transport
- Authenticated `/api/day` D1 rollback route
- Confirmed HTTP and MCP writes with authoritative read-back
- Supabase canonical logs, todos and mutation receipts
- Authenticated `sharvaos-pulse-sync` Edge Function
- Lossless compatibility mirroring from the existing water tables
- Responsive and reduced-motion styling
- Vinext/Cloudflare Worker build and artifact validation

## v2.1 reliability hardening

Version `2.1.0` fixes the approved reliability defects without redesigning the UI:

- remote state cannot overwrite queued offline mutations;
- imported logs preserve their original `loggedAt` timestamp;
- water entries must be whole-number amounts from 50 to 2000 ml;
- API and MCP writes verify persisted records before reporting success;
- request handlers do not create or alter database schema.

## Phase 2 — Supabase canonical owner

Supabase project `sharvaos-live-control-room` owns the canonical Pulse data contract:

- `pulse_logs` — canonical water, smoke and food logs;
- `pulse_todos` — canonical daily tasks;
- `pulse_mutation_receipts` — idempotency and write evidence;
- `pulse_apply_mutation` — authenticated mutation boundary;
- `pulse_read_day` — canonical daily read model;
- `sharvaos-pulse-sync` — JWT-protected Edge Function.

The 8 existing water rows and 3 void records were reconciled exactly. One historical 1 ml value is retained and marked `legacy_out_of_range`; it was not silently changed. Future writes through the existing water MCP are mirrored into the canonical log table.

## Phase 3 — Authenticated runtime cutover

The UI now contains a controlled runtime router:

- `SHARVAOS_PULSE_DATA_OWNER=d1` uses the existing rollback transport;
- `SHARVAOS_PULSE_DATA_OWNER=supabase` requires complete publishable config and an authenticated owner OTP session;
- incomplete Supabase config fails closed to D1 rather than entering a dual-write state;
- OTP requests cannot create users;
- access tokens are refreshed before canonical requests;
- queued mutations use stable queue identities as canonical idempotency keys;
- an expired session preserves queued work and returns the user to the sign-in gate;
- rollback requires one environment-variable change and no code/database revert.

## Important boundary

The code path is implemented, but live activation is intentionally off while the GitHub repository remains Public. Do not configure the deployed UI for Supabase until the repository is Private and the authenticated staging and rollback runbook has passed.

No service-role key, user JWT, refresh token, personal email or live publishable key is committed to this repository.

## Runtime environment

D1 rollback is the default and requires no additional Supabase client variables.

Supabase activation requires deployment environment variables:

```text
SHARVAOS_PULSE_DATA_OWNER=supabase
SUPABASE_URL=https://<project-ref>.supabase.co
SUPABASE_PUBLISHABLE_KEY=<publishable-key>
SUPABASE_FUNCTION_URL=https://<project-ref>.supabase.co/functions/v1/sharvaos-pulse-sync
```

The function URL is derived automatically when omitted.

Emergency rollback:

```text
SHARVAOS_PULSE_DATA_OWNER=d1
```

## Requirements

- Node.js `>=22.13.0` (`.nvmrc` pins the verified CI runtime)
- npm with lockfile support
- Linux for the bounded helper scripts (`flock`, `curl`, GNU `timeout`)
- Supabase Auth owner session for canonical Edge Function calls

## Install and verification

```bash
npm ci
npm run lint
npm run typecheck
npm run build
npm test
```

Or run the combined post-install gate:

```bash
npm run verify
```

GitHub Actions runs the five commands as separate, visible steps on every pull request and push to `main`. CI also verifies that `v2.0.0-baseline` still resolves to the frozen commit and contains the original UI file hashes.

## Common commands

| Command | Purpose |
|---|---|
| `npm run dev` | Start local Vinext/Vite development |
| `npm run lint` | Run ESLint |
| `npm run typecheck` | Run strict TypeScript checking without emit |
| `npm run build` | Build and validate the deployable Worker artifact |
| `npm test` | Run rendered-artifact, reliability, canonical and runtime-cutover tests |
| `npm run verify` | Run lint, typecheck, build and test in order |
| `npm run validate:artifact` | Recheck the Worker export and hosting manifest |
| `npm run db:generate` | Generate a new Drizzle migration after D1 schema changes |
| `npm run db:migrate:local` | Explicitly apply the checked-in D1 migration locally |
| `npm run db:migrate:remote` | Explicitly apply the checked-in D1 migration to a reviewed remote target |

D1 migration requirements are documented in [`docs/MIGRATIONS.md`](docs/MIGRATIONS.md).

## Architecture map

- `app/page.tsx` — Daily Pulse experience, OTP gate, local queue and runtime transport selection
- `app/api/runtime-config/route.ts` — publishable-only, fail-closed data-owner configuration
- `lib/pulse-auth-client.mjs` — existing-owner OTP, session persistence and refresh
- `lib/pulse-runtime-config.mjs` — runtime config validation and D1 fallback
- `lib/pulse-transport.mjs` — canonical/D1 transport boundary and queue identity mapping
- `lib/pulse-reliability.mjs` — shared validation and deterministic mutation replay
- `lib/pulse-canonical-client.mjs` — dynamic authenticated Supabase Edge Function client
- `app/api/day/route.ts` — authenticated D1 rollback API and authoritative confirmations
- `app/mcp/route.ts` — ChatGPT/MCP tools with write read-back
- `db/` and `drizzle/` — D1 fallback access and explicit migration
- `supabase/migrations/` — canonical Postgres schema and compatibility migration
- `supabase/functions/sharvaos-pulse-sync/` — authenticated canonical sync boundary
- `worker/` — Cloudflare Worker entry
- `.openai/hosting.json` — Sites binding declaration
- `scripts/` — bounded install/build, migration and artifact validation
- `tests/` — artifact, reliability, canonical and cutover contract tests

## Change discipline

Do not push product changes directly to `main`. Use a branch and pull request, preserve the frozen baseline, name the requirement or defect, add regression evidence and keep rollback possible.

## Security

Do not commit `.env*`, credentials, tokens, database secrets, personal identifiers or generated runtime state. The repository’s `.gitignore` excludes these by default.
