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
| Import date | `2026-07-30` (Asia/Kolkata) |

The original ZIP remains the immutable reference. `docs/source-baseline.sha256` records the hashes of every file inside the archive before normalization.

## Import-only normalization

The first repository hardening pass is intentionally limited to build and governance changes:

- normalized text files and shell scripts to LF line endings;
- added `.gitattributes` to prevent CRLF regressions;
- normalized package and MCP version signals to `2.0.0`;
- replaced the generic starter README with product documentation;
- added a dedicated TypeScript check;
- added GitHub Actions CI for `install -> lint -> typecheck -> build -> test`;
- preserved application behaviour, data model, API behaviour and UI behaviour.
