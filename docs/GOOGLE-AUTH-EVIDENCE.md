# Google Auth owner-guard evidence

- Date: 2026-07-30
- Supabase project: `sharvaos-live-control-room`
- Migration: `20260730153049_google_owner_only_auth`
- Production URL: `https://sharvaos-pulse.vercel.app`

## Repository verification

- Pull request CI completed install, lint, typecheck, build, tests, and evidence upload.
- Test result: 42 passed, 0 failed.
- Live production regression workflow passed against the currently deployed OTP/recovery release.
- No Google Client Secret, owner email, OTP, access token, refresh token, user JWT, or personal record is committed.

## Applied production database guard

The owner-only migration was applied successfully and verified transactionally:

- confirmed Auth users: `1`;
- private owner-registry rows: `1`;
- restrictive owner-select policies: `3`;
- canonical owner mutation triggers: `3`;
- Before User Created hook function exists;
- `supabase_auth_admin` can execute the hook;
- `anon` cannot execute the hook;
- non-owner canonical mutation: denied;
- registered-owner write and authoritative read-back: passed;
- owner canary cleanup: passed;
- remaining visible canary rows: `0`.

## Current provider boundary

Google identities currently linked to the owner: `0`.

Google OAuth becomes available in the UI only after the owner securely configures the Google Web Client ID and Client Secret in Supabase Authentication → Providers → Google. The client secret must remain only in Supabase. The Before User Created hook must also be enabled in Supabase Authentication → Hooks.

Until provider activation, the provider-aware UI retains `create_user:false` owner email recovery and does not lock the owner out.
