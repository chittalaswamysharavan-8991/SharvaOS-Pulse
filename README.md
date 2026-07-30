# SharvaOS Daily Pulse

SharvaOS Daily Pulse is the focused daily-capture vertical slice of SharvaOS. It provides a mobile-first dashboard for water, smoke, food and today’s tasks, with durable offline mutation recovery, a Cloudflare D1-backed API and ChatGPT-facing MCP tools.

**Current version:** `2.1.0`  
**Frozen pre-behaviour baseline:** `v2.0.0-baseline`  
**Product status:** reliability-hardened reference implementation; not yet the canonical production SharvaOS data store.

## Provenance

The source was imported from `SharvaOS-Daily-Pulse-v2-editable-source.zip`.

- ZIP SHA-256: `424f549ad660febe9e2f518736ddfb1e728f87d61654c439d6ede5223807072e`
- Frozen baseline commit: `43c9c2caa237e326e08671606d4b3b5aa117e5ec`
- Full provenance: [`SOURCE_PROVENANCE.md`](SOURCE_PROVENANCE.md)
- Baseline protection: [`docs/BASELINE_PROTECTION.md`](docs/BASELINE_PROTECTION.md)
- Per-file baseline hashes: [`docs/source-baseline.sha256`](docs/source-baseline.sha256)

## Implemented surface

- Daily summary cards for water, smoke, food and tasks
- Quick capture flows
- Today focus list and completion state
- Today trace / recent event surface
- Durable browser-side pending-operation queue
- Ordered offline retry and reconnect reconciliation
- Authenticated `/api/day` read and mutation route
- Confirmed HTTP and MCP writes with authoritative read-back
- Cloudflare D1 schema and explicit Drizzle migration operation
- `/mcp` endpoint with read and write tools
- Responsive and reduced-motion styling
- Vinext/Cloudflare Worker build and artifact validation

## v2.1 reliability hardening

Version `2.1.0` fixes the approved reliability defects without redesigning the UI or adding product features:

- remote state cannot overwrite queued offline mutations;
- imported logs preserve their original `loggedAt` timestamp;
- water entries must be whole-number amounts from 50 to 2000 ml;
- API and MCP writes verify persisted records before reporting success;
- request handlers do not create or alter database schema.

## Important boundary

This repository is one SharvaOS module. It does not yet prove canonical Supabase integration, production owner authentication, backup/restore, monitoring, production migration execution or complete end-to-end runtime coverage. Those changes must be delivered through controlled work packets and verified separately.

The GitHub repository is currently public. Do not commit secrets, personal production data, Supabase credentials or D1 credentials.

## Requirements

- Node.js `>=22.13.0` (`.nvmrc` pins the verified CI runtime)
- npm with lockfile support
- Linux for the bounded helper scripts (`flock`, `curl`, GNU `timeout`)

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
| `npm test` | Run rendered-artifact and reliability regression tests |
| `npm run verify` | Run lint, typecheck, build and test in order |
| `npm run validate:artifact` | Recheck the Worker export and hosting manifest |
| `npm run db:generate` | Generate a new Drizzle migration after schema changes |
| `npm run db:migrate:local` | Explicitly apply the checked-in migration locally |
| `npm run db:migrate:remote` | Explicitly apply the checked-in migration to a reviewed remote target |

Migration requirements are documented in [`docs/MIGRATIONS.md`](docs/MIGRATIONS.md).

## Architecture map

- `app/page.tsx` — Daily Pulse client experience, local queue and sync reconciliation
- `lib/pulse-reliability.mjs` — shared validation and deterministic mutation replay
- `app/api/day/route.ts` — authenticated web API and authoritative confirmations
- `app/mcp/route.ts` — ChatGPT/MCP tools with write read-back
- `db/` — D1 access and schema; no request-time DDL
- `drizzle/` — packaged migration
- `worker/` — Cloudflare Worker entry
- `.openai/hosting.json` — Sites binding declaration
- `scripts/` — bounded install/build, migration and artifact validation
- `tests/` — artifact, reliability and contract tests

## Change discipline

Do not push product changes directly to `main`. Use a branch and pull request, preserve the frozen baseline, name the requirement or defect, add regression evidence and keep rollback possible.

## Security

Do not commit `.env*`, credentials, tokens, database secrets or generated runtime state. The repository’s `.gitignore` excludes these by default.
