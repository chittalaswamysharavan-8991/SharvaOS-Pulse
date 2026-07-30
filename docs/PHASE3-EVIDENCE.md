# Phase 3 — Runtime cutover evidence

## Implementation status

- Runtime data-owner router: implemented
- Fail-closed Supabase configuration: implemented
- D1 one-variable rollback: implemented
- Existing-owner email OTP flow: implemented
- Automatic session restore and refresh: implemented
- Dynamic JWT forwarding to canonical Edge Function: implemented
- Stable offline queue idempotency mapping: implemented
- Auth-expiry queue preservation: implemented
- Nested runtime load effect captures a verified non-null transport before asynchronous work
- Local contract tests: PASS
- Default deployment behavior: D1 rollback remains active until the explicit Supabase owner flag and complete environment are present
- Production activation: BLOCKED by repository privacy and deployment environment gates

## Auth readiness

The production Supabase project contains exactly one active, email-confirmed Auth user with an email identity. The email address is intentionally excluded from this evidence.

OTP requests use `create_user: false`. A login attempt cannot create a second owner.

## Local contract proof

The Phase 3 test suite proves:

- OTP normalization and existing-user-only request envelope;
- session persistence after six-digit OTP verification;
- expired-session refresh before a canonical request;
- dynamic access-token and publishable-key headers;
- incomplete Supabase config falls back to D1;
- complete config selects the canonical transport;
- stable queue IDs become canonical idempotency keys;
- separate intentional task toggles do not collide;
- D1 remains an explicit rollback transport;
- no live publishable key, JWT or service-role key is committed.

## CI gate

The exact pull-request head must pass:

```text
immutable baseline → version check → npm ci → lint → typecheck → build → test → evidence artifact
```

## Evidence intentionally pending

These checks require the manual privacy/environment gate and a real owner OTP session:

- authenticated staging HTTP read/write through `sharvaos-pulse-sync`;
- iPhone OTP UX verification;
- offline-to-online canonical replay from the deployed UI;
- deployment-level D1 rollback exercise;
- production promotion.

Phase 3 must not be reported as a live production cutover until those checks are recorded without exposing an OTP or token.
