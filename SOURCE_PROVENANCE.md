# Source Provenance

This repository was imported from the exact editable source archive below before any product-behaviour changes.

| Field | Value |
|---|---|
| Source archive | `SharvaOS-Daily-Pulse-v2-editable-source.zip` |
| ChatGPT Library path | `/SharvaOS Pulse/SharvaOS-Daily-Pulse-v2-editable-source.zip` |
| Library file ID | `file_00000000514481f4a72b44c2955e231e` |
| Archive size | `280591` bytes |
| SHA-256 | `424f549ad660febe9e2f518736ddfb1e728f87d61654c439d6ede5223807072e` |
| Imported baseline version | `2.0.0` |
| Frozen baseline tag | `v2.0.0-baseline` |
| Frozen baseline commit | `43c9c2caa237e326e08671606d4b3b5aa117e5ec` |
| Import date | `2026-07-30` (Asia/Kolkata) |

The original ZIP remains the immutable reference. `docs/source-baseline.sha256` records the hashes of every file inside the archive before normalization. The `v2.0.0-baseline` release preserves the verified repository state immediately before reliability behaviour changed.

## Import-only normalization

The first repository hardening pass was intentionally limited to build and governance changes:

- normalized text files and shell scripts to LF line endings;
- added `.gitattributes` to prevent CRLF regressions;
- normalized package and MCP version signals to `2.0.0`;
- replaced the generic starter README with product documentation;
- added a dedicated TypeScript check;
- added GitHub Actions CI for `install -> lint -> typecheck -> build -> test`;
- preserved application behaviour, data model, API behaviour and UI behaviour.

## Phase 1 reliability boundary

Version `2.1.0` is the first behaviour-changing release after the frozen baseline. Its scope is limited to:

- preserving queued device mutations during offline/reconnect reconciliation;
- preserving imported `loggedAt` timestamps;
- validating water input consistently across HTTP and MCP paths;
- reading persisted records back before reporting write success;
- removing schema DDL from HTTP and MCP request execution;
- adding explicit migration commands and reliability contract tests.

The visual design, information architecture, capture categories and user-facing workflow remain unchanged.
