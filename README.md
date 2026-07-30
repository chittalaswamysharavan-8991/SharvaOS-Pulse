# SharvaOS Daily Pulse

SharvaOS Daily Pulse is the focused daily-capture vertical slice of SharvaOS. It provides a mobile-first dashboard for water, smoke, food and today’s tasks, with durable offline mutation recovery, a Cloudflare D1 rollback API, Supabase canonical persistence infrastructure and ChatGPT-facing MCP tools.

**Current runtime version:** `2.2.0`  
**Canonical data contract:** `sharvaos.pulse.v1`  
**Frozen pre-behaviour baseline:** `v2.0.0-baseline`  
**Product status:** production activation package implemented; Supabase is the deploy-default owner, owner OTP remains mandatory and D1 rollback remains explicit.

## Provenance

The source was imported from `SharvaOS-Daily-Pulse-v2-editable-source.zip`.

- ZIP SHA-256: `424f549ad660febe9e2f518736ddfb1e728f87d61654c439d6ede5223807072e`
- Frozen baseline commit: `43c9c2caa237e326e08671606d4b3b5aa117e5ec`
- Full provenance: [`SOURCE_PROVENANCE.md`](SOURCE_PROVENANCE.md)
- Baseline protection: [`docs/BASELINE_PROTECTION.md`](docs/BASELINE_PROTECTION.md)
- Supabase ownership decision: [`docs/ADR-002-SUPABASE-CANONICAL-OWNER.md`](docs/ADR-002-SUPABASE-CANONICAL-OWNER.md)
- Runtime cutover decision: [`docs/ADR-003-SUPABASE-RUNTIME-CUTOVER.md`](docs/ADR-003-SUPABASE-RUNTIME-CUTOVER.md)
- Production activation decision: [`docs/ADR-004-PRODUCTION-ACTIVATION.md`](docs/ADR-004-PRODUCTION-ACTIVATION.md)
- Phase 2 evidence: [`docs/PHASE2-SUPABASE-EVIDENCE.md`](docs/PHASE2-SUPABASE-EVIDENCE.md)
- Phase 3 evidence: [`docs/PHASE3-EVIDENCE.md`](docs/PHASE3-EVIDENCE.md)
- Production runbook: [`docs/PHASE4-PRODUCTION-RUNBOOK.md`](docs/PHASE4-PRODUCTION-RUNBOOK.md)
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
- Deploy-default Supabase canonical transport
- Explicit D1 rollback transport
- Authenticated `/api/day` D1 rollback route
- Safe `/api/health` release and owner diagnostics
- Confirmed HTTP and MCP writes with authoritative read-back
- Supabase canonical logs, todos and mutation receipts
- Authenticated `sharvaos-pulse-sync` Edge Function
- Lossless compatibility mirroring from the existing water tables
- Partial-day device-cache reconciliation with duplicate avoidance
- Bounded canonical import batches without silent truncation
- Responsive and reduced-motion styling
- Vinext/Cloudflare Worker build and artifact validation

## v2.1 reliability hardening

Version `2.1.0` fixed the approved reliability defects without redesigning the UI:

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

The UI contains a controlled runtime router:

- OTP requests cannot create users;
- access tokens are refreshed before canonical requests;
- queued mutations use stable queue identities as canonical idempotency keys;
- an expired session preserves queued work and returns the user to the sign-in gate;
- pending operations drain before cached-day migration;
- legacy canonical water cannot block migration of missing smoke, food or tasks;
- duplicate IDs/fingerprints are skipped and imports are split into 100-item batches;
- there is no automatic Supabase-to-D1 write fallback.

## Phase 4 — Production activation

Release `2.2.0` activates Supabase by default using checked-in public client coordinates. These values initialize the client but do not grant owner access. Canonical access still requires the existing confirmed owner account, a valid user JWT, row-level security and owner-scoped database functions.

Runtime behavior:

- no owner environment value → Supabase canonical owner using reviewed public defaults;
- `SHARVAOS_PULSE_DATA_OWNER=supabase` → Supabase with optional reviewed environment overrides;
- `SHARVAOS_PULSE_DATA_OWNER=d1` → explicit compatibility rollback;
- any other explicit owner value → fail closed and keep changes queued on the device.

`GET /api/health` exposes only release, owner, configuration-source and rollback metadata. It never returns a client key, user identity or session material.

## Important boundary

The repository is still expected to become Private because this is a personal system and future development may introduce private operational material. Public visibility is not permission to commit privileged credentials or personal data.

The checked-in Supabase value is a publishable client key, not a service-role credential. No service-role key, user JWT, refresh token, OTP, owner email or personal record is committed.

## Runtime environment

Normal Supabase activation requires no environment values. Reviewed deployments may override the public client coordinates:

```text
SHARVAOS_PULSE_DATA_OWNER=supabase
SUPABASE_URL=https://<project-ref>.supabase.co
SUPABASE_PUBLISHABLE_KEY=<publishable-key>
SUPABASE_FUNCTION_URL=https://<project-ref>.supabase.co/functions/v1/sharvaos-pulse-sync
```

Emergency compatibility rollback:

```text
SHARVAOS_PULSE_DATA_OWNER=d1
```

Rollback is explicit. The application never silently writes to D1 after a Supabase failure.

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
| `npm test` | Run artifact, reliability, canonical, cutover and activation tests |
| `npm run verify` | Run lint, typecheck, build and test in order |
| `npm run validate:artifact` | Recheck the Worker export and hosting manifest |
| `npm run db:generate` | Generate a new Drizzle migration after D1 schema changes |
| `npm run db:migrate:local` | Explicitly apply the checked-in D1 migration locally |
| `npm run db:migrate:remote` | Explicitly apply the checked-in D1 migration to a reviewed remote target |

D1 migration requirements are documented in [`docs/MIGRATIONS.md`](docs/MIGRATIONS.md).

## Architecture map

- `app/page.tsx` — Daily Pulse experience, OTP gate, local queue and runtime transport selection
- `app/api/runtime-config/route.ts` — safe runtime-owner configuration response
- `app/api/health/route.ts` — safe release and cutover diagnostics
- `lib/pulse-public-runtime.mjs` — reviewed public defaults and explicit rollback resolution
- `lib/pulse-auth-client.mjs` — existing-owner OTP, session persistence and refresh
- `lib/pulse-runtime-config.mjs` — browser runtime config validation and blocked-sync state
- `lib/pulse-transport.mjs` — canonical/D1 transport, queue identity and partial-day reconciliation
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
- `tests/` — artifact, reliability, canonical, cutover and activation contract tests

## Change discipline

Do not push product changes directly to `main`. Use a branch and pull request, preserve the frozen baseline, name the requirement or defect, add regression evidence and keep rollback possible.

## Security

Do not commit `.env*`, service-role credentials, access tokens, refresh tokens, OTPs, personal identifiers or generated runtime state. The repository’s `.gitignore` excludes these by default.
