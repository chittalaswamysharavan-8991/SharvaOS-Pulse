# SharvaOS Daily Pulse

SharvaOS Daily Pulse is the focused daily-capture vertical slice of SharvaOS. It provides a mobile-first dashboard for water, smoke, food and today’s tasks, with local optimistic state, a Cloudflare D1-backed API and ChatGPT-facing MCP tools.

**Current repository baseline:** `2.0.0`  
**Product status:** protected reference implementation; not yet the canonical production SharvaOS data store.

## Provenance

The source was imported from `SharvaOS-Daily-Pulse-v2-editable-source.zip`.

- ZIP SHA-256: `424f549ad660febe9e2f518736ddfb1e728f87d61654c439d6ede5223807072e`
- Full provenance: [`SOURCE_PROVENANCE.md`](SOURCE_PROVENANCE.md)
- Per-file baseline hashes: [`docs/source-baseline.sha256`](docs/source-baseline.sha256)

## Implemented surface

- Daily summary cards for water, smoke, food and tasks
- Quick capture flows
- Today focus list and completion state
- Today trace / recent event surface
- Local browser cache for optimistic use
- Authenticated `/api/day` read and mutation route
- Cloudflare D1 schema and Drizzle migration
- `/mcp` endpoint with read and write tools
- Responsive and reduced-motion styling
- Vinext/Cloudflare Worker build and artifact validation

## Important boundary

This repository is one SharvaOS module. It does not yet prove canonical Supabase integration, lossless offline reconciliation, production authorization, backup/restore or complete runtime test coverage. Those changes must be delivered through controlled work packets and verified separately.

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

GitHub Actions runs the five commands as separate, visible steps on every pull request and push to `main`.

## Common commands

| Command | Purpose |
|---|---|
| `npm run dev` | Start local Vinext/Vite development |
| `npm run lint` | Run ESLint |
| `npm run typecheck` | Run strict TypeScript checking without emit |
| `npm run build` | Build and validate the deployable Worker artifact |
| `npm test` | Verify the already-built rendered artifact |
| `npm run verify` | Run lint, typecheck, build and test in order |
| `npm run validate:artifact` | Recheck the Worker export and hosting manifest |
| `npm run db:generate` | Generate Drizzle migrations after schema changes |

## Architecture map

- `app/page.tsx` — Daily Pulse client experience and local sync flow
- `app/api/day/route.ts` — authenticated web API
- `app/mcp/route.ts` — ChatGPT/MCP tools
- `db/` — D1 access and schema
- `drizzle/` — packaged migration
- `worker/` — Cloudflare Worker entry
- `.openai/hosting.json` — Sites binding declaration
- `scripts/` — bounded install/build and artifact validation
- `tests/` — artifact-level tests

## Change discipline

Do not mix product behaviour changes into baseline/tooling commits. A behaviour change must name the requirement or defect it addresses, add regression evidence and preserve rollback.

## Security

Do not commit `.env*`, credentials, tokens, database secrets or generated runtime state. The repository’s `.gitignore` excludes these by default.
