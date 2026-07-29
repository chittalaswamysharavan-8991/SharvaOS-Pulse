# SharvaOS Pulse v2 Baseline Verification

## Scope

This report records the source-import verification completed before any product-behaviour changes.

## Provenance

- Source archive: `SharvaOS-Daily-Pulse-v2-editable-source.zip`
- ZIP SHA-256: `424f549ad660febe9e2f518736ddfb1e728f87d61654c439d6ede5223807072e`
- Normalized product version: `2.0.0`
- Per-file baseline hashes: `docs/source-baseline.sha256`

## Verification chain

The controlled GitHub Actions bootstrap run completed successfully with the following ordered gates:

1. Generate normalized lockfile
2. Verify normalized version
3. `npm ci`
4. `npm run lint`
5. `npm run typecheck`
6. `npm run build`
7. `npm test`

All seven gates passed in workflow run `30496186077`.

## Source integrity

The large UI source files were reconstructed and verified byte-for-byte against the extracted source baseline before the dependency and build gates ran:

- `app/page.tsx`
- `app/globals.css`

The original archive hash remains the immutable provenance anchor. Version, documentation, CI configuration, type declarations, lint scope, and lockfile normalization are the only baseline engineering changes.

## Behaviour boundary

No intended UI, API, data-model, persistence, authentication, MCP-tool, or user-workflow behaviour was changed in this baseline import.

## Remaining repository control

The repository must be private before personal production data, environment secrets, or live credentials are introduced.
