# Pulse Notion Capture Implementation

## Runtime contract

`POST /api/notion-capture` is the server-side write boundary for the single Pulse capture interface. It requires an existing authenticated Pulse owner session and a server-only `NOTION_TOKEN` or `NOTION_API_KEY`.

The route accepts `water`, `food`, `sleep`, `expense`, and `movement`. It rejects smoking because the accepted product decision keeps smoking local-only, and rejects tasks until the `My Tasks` schema is exposed as an approved data source.

Every accepted request has a stable `operationId`, is validated against the approved field contract, writes to the exact existing specialist data source, reads the domain page back, creates a `Daily Evidence` write-proof row, reads that row back, and only then returns `status: Verified` and `verified: true`. No `Daily Record` relation is fabricated.

## Approved data sources

| Capture | Data source |
| --- | --- |
| Water | `collection://dbe85776-d489-4719-b979-456dfa6a60b7` |
| Food | `collection://ccc83b12-93b2-4fce-ae2a-0ceb693fcceb` |
| Sleep | `collection://6d93bb50-c05d-4058-94af-f57efe9f374f` |
| Expense | `collection://52e709e8-e3d4-4123-9bbf-fbb14aff6dcb` |
| Movement | `collection://a08e7825-8e5f-4e35-b8d9-7dd1d6c0a569` |
| Daily Evidence | `collection://a428d124-2289-4193-a69c-fe91d29e3a63` |

The implementation uses Notion API version `2026-03-11` and the data-source API family. It does not create or alter a Notion database or schema.

## Security and failure behavior

- The browser sends the existing Supabase owner access token; the server validates it against the Supabase Auth user endpoint.
- The Notion token never enters browser code, response bodies, logs, or source files.
- Notion `401` and `403` remain authentication/permission failures.
- `429` and transient `5xx` responses receive bounded retries; persistent failures return `Needs Review` without fabricated success.
- Domain and evidence read-back failures never return `Verified`.
- The app displays `Draft`, `Sync Pending`, `Writing`, `Verified`, `Partial`, `Failed`, and `Needs Review` states.

## Deployment checklist

- [x] Server-side adapter and route added.
- [x] Exact specialist field mappings added.
- [x] Idempotency and evidence read-back added.
- [x] Smoking privacy gate and task schema gate added.
- [x] UI destination preview and verified-only success state added.
- [x] Typecheck, lint, build, targeted tests, and full test suite pass locally.
- [x] Connected Notion integration successfully created and read back a canary row in Daily Evidence.
- [ ] Add `NOTION_TOKEN` or `NOTION_API_KEY` to Vercel project `sharvaos-pulse-google` for Preview and Production.
- [ ] Deploy the approved branch to `sharvaos-pulse-google`.
- [ ] Perform one owner-authenticated canary capture per enabled type and read back the actual specialist rows and evidence rows.
